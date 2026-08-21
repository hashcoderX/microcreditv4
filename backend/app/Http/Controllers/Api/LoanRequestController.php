<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyDocumentTemplate;
use App\Models\Customer;
use App\Models\LoanRequest;
use App\Models\LoanRequestDocument;
use App\Models\Role;
use App\Models\SavingsAccount;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

class LoanRequestController extends Controller
{
    private function resolveCustomerDisplayName(Customer $customer): string
    {
        $details = is_array($customer->additional_details) ? $customer->additional_details : [];
        $identity = is_array($details['identity'] ?? null) ? $details['identity'] : [];

        $fullName = trim((string) ($identity['full_name_with_initials'] ?? ''));
        if ($fullName !== '') {
            return $fullName;
        }

        return trim(((string) ($customer->first_name ?? '')) . ' ' . ((string) ($customer->last_name ?? '')));
    }

    private function findCustomerByCodeOrSerial(string $input): ?Customer
    {
        $normalized = strtoupper(trim($input));
        if ($normalized === '') {
            return null;
        }

        if (ctype_digit($normalized) && strlen($normalized) <= 5) {
            $serial = str_pad($normalized, 5, '0', STR_PAD_LEFT);
            return Customer::where('customer_code', 'like', '%-' . $serial)
                ->orderByDesc('id')
                ->first();
        }

        $byCode = Customer::whereRaw('UPPER(customer_code) = ?', [$normalized])->first();
        if ($byCode) {
            return $byCode;
        }

        $byInvestmentAccount = SavingsAccount::query()
            ->with('customer')
            ->where('account_type', 'investment')
            ->whereRaw('UPPER(account_number) = ?', [$normalized])
            ->first();

        if ($byInvestmentAccount?->customer) {
            return $byInvestmentAccount->customer;
        }

        return null;
    }

    private function buildCustomerPortalEmail(string $customerCode, int $customerId): string
    {
        $base = strtolower(trim($customerCode));
        $base = preg_replace('/[^a-z0-9]+/', '.', $base ?? '') ?? '';
        $base = trim($base, '.');
        if ($base === '') {
            $base = 'customer.' . $customerId;
        }

        $domain = 'customers.globalcapital.local';
        $email = $base . '@' . $domain;
        $suffix = 1;

        while (User::query()->whereRaw('LOWER(email) = ?', [strtolower($email)])->exists()) {
            $email = $base . '.' . $suffix . '@' . $domain;
            $suffix++;
        }

        return $email;
    }

    /**
     * @return array{is_new_account:bool,email:string,password:?string,linked_user_id:int}|null
     */
    private function ensureCustomerPortalAccess(Customer $customer, int $assignedByUserId): ?array
    {
        $hasCustomerUserColumn = Schema::hasColumn('customers', 'user_id');
        if ($hasCustomerUserColumn && (int) ($customer->user_id ?? 0) > 0) {
            $existingLinkedUser = User::query()->find((int) $customer->user_id);
            if ($existingLinkedUser) {
                return null;
            }
        }

        $existingByEmail = null;
        if (!empty($customer->email)) {
            $existingByEmail = User::query()
                ->whereRaw('LOWER(email) = ?', [strtolower((string) $customer->email)])
                ->first();
        }

        if ($existingByEmail) {
            if ($hasCustomerUserColumn) {
                $customer->user_id = (int) $existingByEmail->id;
            }
            $customer->save();

            return [
                'is_new_account' => false,
                'email' => (string) $existingByEmail->email,
                'password' => null,
                'linked_user_id' => (int) $existingByEmail->id,
            ];
        }

        $email = $this->buildCustomerPortalEmail((string) ($customer->customer_code ?? ''), (int) $customer->id);
        $phoneDigits = preg_replace('/\D+/', '', (string) ($customer->phone ?? '')) ?? '';
        $passwordPlain = 'Cus@' . ($phoneDigits !== '' ? substr($phoneDigits, -6) : Str::upper(Str::random(6)));

        $userName = trim(((string) $customer->first_name) . ' ' . ((string) $customer->last_name));
        if ($userName === '') {
            $userName = 'Customer ' . (string) ($customer->customer_code ?: $customer->id);
        }

        $portalUser = User::query()->create([
            'name' => $userName,
            'email' => $email,
            'password' => Hash::make($passwordPlain),
            'branch_id' => (int) ($customer->branch_id ?? 0) ?: null,
        ]);

        if (Schema::hasTable('roles') && Schema::hasTable('user_roles')) {
            $customerRole = Role::query()->firstOrCreate(
                ['name' => 'Customer Portal'],
                ['description' => 'Customer login access for loan and savings visibility']
            );
            if ($assignedByUserId > 0) {
                $portalUser->roles()->syncWithoutDetaching([
                    $customerRole->id => [
                        'assigned_at' => now(),
                        'assigned_by' => $assignedByUserId,
                    ],
                ]);
            }
        }

        if (empty($customer->email)) {
            $customer->email = $email;
        }
        if ($hasCustomerUserColumn) {
            $customer->user_id = (int) $portalUser->id;
        }
        $customer->save();

        return [
            'is_new_account' => true,
            'email' => $email,
            'password' => $passwordPlain,
            'linked_user_id' => (int) $portalUser->id,
        ];
    }

    private function isAdminUser(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $designationName = strtolower(trim((string) optional($user->designation)->name));
        if ($designationName !== '' && str_contains($designationName, 'admin')) {
            return true;
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized !== '' && str_contains($normalized, 'admin')) {
                return true;
            }
        }

        return false;
    }

    private function currentUserBranchId(Request $request): ?int
    {
        $branchId = (int) ($request->user()?->branch_id ?? 0);
        return $branchId > 0 ? $branchId : null;
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->get('per_page', 20);

        $query = LoanRequest::query()->withCount('documents')->orderByDesc('id');

        if (!$this->isAdminUser($request->user())) {
            $branchId = $this->currentUserBranchId($request);
            if ($branchId !== null) {
                $query->where('branch_id', $branchId);
            }
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->get('status'));
        }

        if ($request->filled('approval_level')) {
            $query->where('approval_level', (int) $request->get('approval_level'));
        }

        if ($request->filled('q')) {
            $search = trim((string) $request->get('q'));
            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder->where('request_no', 'like', $like)
                        ->orWhere('customer_full_name', 'like', $like)
                        ->orWhere('customer_no', 'like', $like)
                        ->orWhere('loan_product', 'like', $like);
                });
            }
        }

        return response()->json($query->paginate($perPage));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $query = LoanRequest::with('documents');

        if (!$this->isAdminUser($request->user())) {
            $branchId = $this->currentUserBranchId($request);
            if ($branchId !== null) {
                $query->where('branch_id', $branchId);
            }
        }

        return response()->json($query->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        // Multipart submissions send nested objects as JSON strings.
        $customerDetails = $request->input('customer_details');
        if (is_string($customerDetails)) {
            $decodedCustomer = json_decode($customerDetails, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decodedCustomer)) {
                $request->merge(['customer_details' => $decodedCustomer]);
            }
        }

        $guarantorDetails = $request->input('guarantor_details');
        if (is_string($guarantorDetails)) {
            $decodedGuarantor = json_decode($guarantorDetails, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decodedGuarantor)) {
                $request->merge(['guarantor_details' => $decodedGuarantor]);
            }
        }

        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'min:1'],
            'loan_product' => ['required', 'string', 'max:120'],
            'principal' => ['required', 'numeric', 'min:0.01'],
            'annual_rate' => ['required', 'numeric', 'min:0'],
            'interest_rate_type' => ['nullable', 'in:fixed,reducing'],
            'tenure_months' => ['required', 'integer', 'min:1'],
            'installment_frequency' => ['required', 'in:weekly,monthly'],
            'installments' => ['required', 'integer', 'min:1'],
            'installment_amount' => ['required', 'numeric', 'min:0.01'],
            'total_payable' => ['required', 'numeric', 'min:0.01'],

            'customer_details' => ['required', 'array'],
            'customer_details.selectedCustomerId' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_details.customerNo' => ['nullable', 'string', 'max:60'],
            'customer_details.nic' => ['nullable', 'string', 'max:80'],
            'customer_details.fullName' => ['nullable', 'string', 'max:190'],
            'customer_details.mobile' => ['nullable', 'string', 'max:40'],
            'customer_details.address' => ['nullable', 'string'],
            'customer_details.monthlyIncome' => ['nullable', 'numeric', 'min:0'],
            'customer_details.incomeSource' => ['nullable', 'string', 'max:120'],
            'customer_details.businessName' => ['nullable', 'string', 'max:190'],
            'customer_details.bankName' => ['nullable', 'string', 'max:190'],
            'customer_details.bankBranch' => ['nullable', 'string', 'max:190'],
            'customer_details.bankAccountNo' => ['nullable', 'string', 'max:80'],
            'customer_details.additionalIncome' => ['nullable', 'numeric', 'min:0'],

            'guarantor_details' => ['nullable', 'array'],
            'guarantor_details.*.fullName' => ['nullable', 'string', 'max:190'],
            'guarantor_details.*.nic' => ['nullable', 'string', 'max:80'],
            'guarantor_details.*.mobile' => ['nullable', 'string', 'max:40'],
            'guarantor_details.*.relation' => ['nullable', 'string', 'max:120'],
            'guarantor_details.*.address' => ['nullable', 'string'],
            'guarantor_details.*.monthlyIncome' => ['nullable', 'numeric', 'min:0'],

            'required_approval_level' => ['nullable', 'integer', 'min:1', 'max:5'],

            'documents' => ['nullable', 'array', 'max:10'],
            'documents.*' => ['file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
        ]);

        $user = $request->user();
        $customerInput = $validated['customer_details'];
        $requiredApprovalLevel = (int) ($validated['required_approval_level'] ?? 2);
        $resolvedBranchId = (int) ($user?->branch_id ?? $validated['branch_id'] ?? 1);

        $selectedCustomerId = (int) ($customerInput['selectedCustomerId'] ?? 0);
        $customerRecord = null;
        if ($selectedCustomerId > 0) {
            $customerRecord = Customer::query()->find($selectedCustomerId);
        }

        if (!$customerRecord && !empty($customerInput['customerNo'])) {
            $customerRecord = $this->findCustomerByCodeOrSerial((string) $customerInput['customerNo']);
        }

        if (!$customerRecord && !empty($customerInput['nic'])) {
            $customerRecord = Customer::query()
                ->whereRaw('UPPER(nic_passport) = ?', [strtoupper(trim((string) $customerInput['nic']))])
                ->orWhereRaw('UPPER(old_nic) = ?', [strtoupper(trim((string) $customerInput['nic']))])
                ->first();
        }

        if (!$customerRecord) {
            return response()->json([
                'message' => 'Please select an existing registered customer before submitting a loan request.',
            ], 422);
        }

        $customerDetails = is_array($customerRecord->additional_details) ? $customerRecord->additional_details : [];
        $banking = is_array($customerDetails['banking_relationships'] ?? null) ? $customerDetails['banking_relationships'] : [];
        $employment = is_array($customerDetails['employment'] ?? null) ? $customerDetails['employment'] : [];
        $business = is_array($customerDetails['business_information'] ?? null) ? $customerDetails['business_information'] : [];

        $customerSnapshot = [
            'selectedCustomerId' => (int) ($customerRecord->id ?? 0),
            'customerNo' => (string) ($customerRecord->customer_code ?? ''),
            'fullName' => $this->resolveCustomerDisplayName($customerRecord),
            'nic' => (string) ($customerRecord->nic_passport ?: $customerRecord->old_nic ?: ''),
            'mobile' => (string) ($customerRecord->phone ?? ''),
            'address' => (string) ($customerRecord->current_address ?: $customerRecord->permanent_address ?: ''),
            'monthlyIncome' => (string) ($employment['monthly_salary'] ?? $customerRecord->monthly_income ?? '0'),
            'incomeSource' => (string) ($employment['job_title'] ?? $employment['employment_type'] ?? ''),
            'businessName' => (string) ($business['business_name'] ?? ''),
            'bankName' => (string) ($banking['primary_bank_name'] ?? ''),
            'bankBranch' => (string) ($banking['bank_branch'] ?? ''),
            'bankAccountNo' => (string) ($banking['account_number'] ?? ''),
            'additionalIncome' => (string) ($employment['additional_income'] ?? '0'),
            'source' => 'registered_customer',
        ];

        $customerPortalCredentials = null;
        $loanRequest = DB::transaction(function () use ($validated, $resolvedBranchId, $customerSnapshot, $requiredApprovalLevel, $user, $customerRecord, &$customerPortalCredentials) {
            $loanRequest = LoanRequest::create([
                'tenant_id' => 1,
                'branch_id' => $resolvedBranchId,
                'loan_product' => (string) $validated['loan_product'],
                'customer_no' => (string) $customerSnapshot['customerNo'],
                'customer_full_name' => (string) $customerSnapshot['fullName'],
                'customer_nic' => (string) $customerSnapshot['nic'],
                'customer_mobile' => (string) $customerSnapshot['mobile'],
                'customer_address' => (string) $customerSnapshot['address'],
                'principal' => (float) $validated['principal'],
                'annual_rate' => (float) $validated['annual_rate'],
                'interest_rate_type' => (string) ($validated['interest_rate_type'] ?? 'fixed'),
                'tenure_months' => (int) $validated['tenure_months'],
                'installment_frequency' => (string) $validated['installment_frequency'],
                'installments' => (int) $validated['installments'],
                'installment_amount' => (float) $validated['installment_amount'],
                'total_payable' => (float) $validated['total_payable'],
                'customer_details' => $customerSnapshot,
                'guarantor_details' => $validated['guarantor_details'] ?? null,
                'status' => 'pending_approval',
                'approval_level' => 1,
                'required_approval_level' => $requiredApprovalLevel,
                'created_by' => $user?->id,
            ]);

            $loanRequest->request_no = 'LREQ-' . str_pad((string) $loanRequest->id, 6, '0', STR_PAD_LEFT);
            $loanRequest->save();

            $customerPortalCredentials = $this->ensureCustomerPortalAccess($customerRecord, (int) ($user?->id ?? 0));

            return $loanRequest;
        });

        if ($request->hasFile('documents')) {
            $uploadedDocuments = $request->file('documents', []);
            if (!is_array($uploadedDocuments)) {
                $uploadedDocuments = [$uploadedDocuments];
            }

            foreach ($uploadedDocuments as $index => $file) {
                if ($file === null) {
                    continue;
                }

                $originalName = $file->getClientOriginalName();
                $safeOriginalName = preg_replace('/\s+/', '_', $originalName);
                $fileName = time() . '_' . $loanRequest->id . '_' . $index . '_' . $safeOriginalName;
                $filePath = $file->storeAs('loan_request_documents', $fileName, 'public');

                LoanRequestDocument::create([
                    'loan_request_id' => $loanRequest->id,
                    'document_type' => 'supporting',
                    'file_path' => $filePath,
                    'original_name' => $originalName,
                    'uploaded_by' => $user?->id,
                ]);
            }
        }

        $loanRequest->load('documents');

        return response()->json([
            'message' => 'Loan request submitted successfully.',
            'data' => $loanRequest,
            'customer_portal_credentials' => $customerPortalCredentials,
        ], 201);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $query = LoanRequest::query();
        if (!$this->isAdminUser($request->user())) {
            $branchId = $this->currentUserBranchId($request);
            if ($branchId !== null) {
                $query->where('branch_id', $branchId);
            }
        }

        $loanRequest = $query->findOrFail($id);

        if ($loanRequest->status !== 'pending_approval') {
            return response()->json([
                'message' => 'Only pending loan requests can be approved or rejected.',
            ], 422);
        }

        if ($validated['action'] === 'reject' && empty(trim((string) ($validated['note'] ?? '')))) {
            return response()->json([
                'message' => 'Rejection note is required.',
            ], 422);
        }

        if ($validated['action'] === 'reject') {
            $loanRequest->status = 'rejected';
        } else {
            if ($loanRequest->approval_level < $loanRequest->required_approval_level) {
                $loanRequest->approval_level += 1;
                $loanRequest->status = $loanRequest->approval_level >= $loanRequest->required_approval_level
                    ? 'approved'
                    : 'pending_approval';
            } else {
                $loanRequest->status = 'approved';
            }
        }

        $loanRequest->approval_note = $validated['note'] ?? null;
        $loanRequest->last_action_by = $request->user()?->id;
        $loanRequest->last_action_at = now();

        if ($validated['action'] === 'approve' && $loanRequest->status === 'approved' && empty($loanRequest->due_date)) {
            $startDate = now()->toDateString();
            $loanRequest->due_date = $startDate;
            $frequency = strtolower(trim((string) $loanRequest->installment_frequency));
            $loanRequest->next_due_date = match ($frequency) {
                'weekly' => now()->addWeek()->toDateString(),
                'daily' => now()->addDay()->toDateString(),
                default => now()->addMonth()->toDateString(),
            };
        }

        $loanRequest->save();

        $documentMessage = null;
        if ($validated['action'] === 'approve' && $loanRequest->status === 'approved') {
            $documentMessage = $this->generateLoanAgreementIfTemplateExists($loanRequest, $request->user()?->id);
        }

        return response()->json([
            'message' => 'Loan request status updated successfully.',
            'data' => $loanRequest,
            'document_message' => $documentMessage,
        ]);
    }

    private function generateLoanAgreementIfTemplateExists(LoanRequest $loanRequest, ?int $userId): ?string
    {
        $company = Company::find($loanRequest->branch_id);
        if (!$company) {
            return 'Company not found for branch; loan agreement template generation skipped.';
        }

        $template = CompanyDocumentTemplate::query()
            ->where('company_id', $company->id)
            ->where('template_type', 'loan_agreement')
            ->where('is_active', true)
            ->latest('id')
            ->first();

        if (!$template) {
            return 'No active loan agreement template configured for this company.';
        }

        $templateAbsolutePath = Storage::disk('public')->path($template->file_path);
        if (!file_exists($templateAbsolutePath)) {
            return 'Loan agreement template file is missing; generation skipped.';
        }

        $generatedDirectory = 'loan_generated_documents';
        $generatedName = 'loan_agreement_' . ($loanRequest->request_no ?: $loanRequest->id) . '_' . time() . '.docx';
        $generatedRelativePath = $generatedDirectory . '/' . $generatedName;
        $generatedAbsolutePath = Storage::disk('public')->path($generatedRelativePath);

        $this->ensureDirectoryExists(dirname($generatedAbsolutePath));
        copy($templateAbsolutePath, $generatedAbsolutePath);

        $replacements = [
            'company_name' => (string) ($company->name ?? ''),
            'customer_name' => (string) $loanRequest->customer_full_name,
            'customer_no' => (string) $loanRequest->customer_no,
            'issue_date' => now()->format('Y-m-d'),
            'installment' => number_format((float) $loanRequest->installment_amount, 2, '.', ''),
            'principal' => number_format((float) $loanRequest->principal, 2, '.', ''),
            'total_payable' => number_format((float) $loanRequest->total_payable, 2, '.', ''),
            'loan_product' => (string) $loanRequest->loan_product,
            'request_no' => (string) $loanRequest->request_no,
        ];

        $this->replaceDocxPlaceholders($generatedAbsolutePath, $replacements);

        LoanRequestDocument::create([
            'loan_request_id' => $loanRequest->id,
            'document_type' => 'loan_agreement_generated',
            'file_path' => $generatedRelativePath,
            'original_name' => 'Loan_Agreement_' . ($loanRequest->request_no ?: $loanRequest->id) . '.docx',
            'uploaded_by' => $userId,
        ]);

        return 'Loan agreement generated from template successfully.';
    }

    private function replaceDocxPlaceholders(string $docxPath, array $replacements): void
    {
        $zip = new ZipArchive();
        $opened = $zip->open($docxPath);
        if ($opened !== true) {
            return;
        }

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (!is_string($name)) {
                continue;
            }

            if (!(str_starts_with($name, 'word/') && str_ends_with($name, '.xml'))) {
                continue;
            }

            $xml = $zip->getFromIndex($i);
            if (!is_string($xml)) {
                continue;
            }

            foreach ($replacements as $key => $value) {
                $safeValue = htmlspecialchars((string) $value, ENT_QUOTES | ENT_XML1);
                $xml = str_replace('{{' . $key . '}}', $safeValue, $xml);
                $xml = str_replace('${' . $key . '}', $safeValue, $xml);
            }

            $zip->addFromString($name, $xml);
        }

        $zip->close();
    }

    private function ensureDirectoryExists(string $directory): void
    {
        if (!is_dir($directory)) {
            mkdir($directory, 0775, true);
        }
    }
}
