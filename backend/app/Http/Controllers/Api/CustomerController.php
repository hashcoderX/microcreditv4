<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Models\Customer;
use App\Models\SavingsAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class CustomerController extends Controller
{
    public function generateCode(): JsonResponse
    {
        return response()->json([
            'customer_no' => Customer::generateUniqueCustomerCode(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = (int)($request->get('per_page', 20));
        $branchId = (int)($request->get('branch_id', 0));
        $query = Customer::query();

        if ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        if ($search = $request->get('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('customer_code', 'like', "%$search%");
                $q->where('first_name', 'like', "%$search%");
                $q->orWhere('last_name', 'like', "%$search%");
                $q->orWhere('nic_passport', 'like', "%$search%");
                $q->orWhere('email', 'like', "%$search%");
                $q->orWhere('phone', 'like', "%$search%");
            });
        }
        $data = $query->orderByDesc('id')->paginate($perPage);
        return response()->json($data);
    }

    public function store(StoreCustomerRequest $request): JsonResponse
    {
        $user = $request->user();
        $payload = $this->normalizeNicPayload($request->validated());
        $payload = $this->applyFullNamePayload($payload);
        $payload = $this->attachOnboardingPayload($payload);
        $payload = $this->applyRiskSummary($payload);
        $payload['tenant_id'] = $user->tenant_id ?? 1;
        $payload['branch_id'] = $user->branch_id ?? 1;
        $payload['created_by'] = $user->id;

        $submittedCode = strtoupper(trim((string) ($payload['customer_code'] ?? '')));
        $nic = strtoupper(trim((string) ($payload['nic_passport'] ?? '')));
        if ($submittedCode === '' || ($nic !== '' && $submittedCode === $nic)) {
            $payload['customer_code'] = Customer::generateUniqueCustomerCode();
        } else {
            $payload['customer_code'] = $submittedCode;
        }

        try {
            $customer = DB::transaction(function () use ($payload, $user) {
                $customer = Customer::create($payload);
                $this->createDefaultSavingsAccountForCustomer($customer, $user);
                return $customer;
            });

            return response()->json($customer, 201);
        } catch (\Exception $e) {
            Log::error('Customer creation failed:', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'user_id' => $user ? $user->id : null,
                'payload' => $payload
            ]);
            
            return response()->json([
                'message' => 'Failed to create customer',
                'error' => $e->getMessage(),
                'line' => $e->getLine(),
                'file' => basename($e->getFile())
            ], 500);
        }
    }

    public function show(Customer $customer): JsonResponse
    {
        return response()->json($customer);
    }

    public function findByCode(string $customerCode): JsonResponse
    {
        $customer = $this->findCustomerByCodeOrSerial($customerCode);

        if (!$customer) {
            return response()->json([
                'found' => false,
                'data' => null,
                'message' => 'Customer not found for provided Customer No.',
            ]);
        }

        $customer->repairCustomerCodeIfNeeded();

        return response()->json([
            'found' => true,
            'data' => $customer->fresh(),
        ]);
    }

    public function financeLookup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search_by' => ['required', 'in:nic_passport,passport,investment_account_no,savings_account_no'],
            'q' => ['required', 'string', 'max:120'],
        ]);

        $searchBy = (string) $validated['search_by'];
        $keyword = trim((string) $validated['q']);
        if ($keyword === '') {
            return response()->json([
                'found' => false,
                'data' => null,
                'message' => 'Search value is required.',
            ], 422);
        }

        $normalized = strtoupper($keyword);
        $customer = null;
        $matchedSavingsAccountNo = null;

        if ($searchBy === 'investment_account_no' || $searchBy === 'savings_account_no') {
            $account = SavingsAccount::query()
                ->with(['customer'])
                ->whereIn('account_type', ['savings', 'investment'])
                ->whereRaw('UPPER(account_number) = ?', [$normalized])
                ->orderByRaw("CASE WHEN account_type = 'savings' THEN 0 ELSE 1 END")
                ->first();

            if ($account && $account->customer) {
                $customer = $account->customer;
                $matchedSavingsAccountNo = (string) ($account->account_number ?? '');
            }
        } elseif ($searchBy === 'passport') {
            $customer = Customer::query()
                ->whereRaw('UPPER(passport_no) = ?', [$normalized])
                ->first();
        } else {
            $customer = Customer::query()
                ->where(function ($query) use ($normalized) {
                    $query->whereRaw('UPPER(nic_passport) = ?', [$normalized])
                        ->orWhereRaw('UPPER(old_nic) = ?', [$normalized]);
                })
                ->first();
        }

        if (!$customer) {
            return response()->json([
                'found' => false,
                'data' => null,
                'message' => 'Customer not found for the provided search value.',
            ]);
        }

        if ($matchedSavingsAccountNo === null) {
            $matchedSavingsAccountNo = $this->resolvePrimarySavingsAccountNumber($customer);
        }

        $customer->repairCustomerCodeIfNeeded();

        return response()->json([
            'found' => true,
            'search_by' => $searchBy,
            'matched_value' => $keyword,
            'matched_investment_account_no' => $matchedSavingsAccountNo,
            'matched_savings_account_no' => $matchedSavingsAccountNo,
            'data' => $customer->fresh(),
        ]);
    }

    public function financeSearch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'nic_passport' => ['nullable', 'string', 'max:120'],
            'passport_no' => ['nullable', 'string', 'max:120'],
            'investment_account_no' => ['nullable', 'string', 'max:120'],
            'savings_account_no' => ['nullable', 'string', 'max:120'],
            'customer_no' => ['nullable', 'string', 'max:120'],
            'name' => ['nullable', 'string', 'max:190'],
            'phone' => ['nullable', 'string', 'max:120'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $nic = strtoupper(trim((string) ($validated['nic_passport'] ?? '')));
        $passport = strtoupper(trim((string) ($validated['passport_no'] ?? '')));
        $investmentAccount = strtoupper(trim((string) ($validated['investment_account_no'] ?? '')));
        $savingsAccount = strtoupper(trim((string) ($validated['savings_account_no'] ?? '')));
        $accountKeyword = $savingsAccount !== '' ? $savingsAccount : $investmentAccount;
        $customerNo = strtoupper(trim((string) ($validated['customer_no'] ?? '')));
        $name = trim((string) ($validated['name'] ?? ''));
        $phone = trim((string) ($validated['phone'] ?? ''));
        $limit = (int) ($validated['limit'] ?? 20);

        if ($nic === '' && $passport === '' && $accountKeyword === '' && $customerNo === '' && $name === '' && $phone === '') {
            return response()->json([
                'matches' => [],
                'message' => 'Provide at least one search field.',
            ], 422);
        }

        $query = Customer::query();

        if ($nic !== '') {
            $query->where(function ($q) use ($nic) {
                $q->whereRaw('UPPER(nic_passport) LIKE ?', ['%' . $nic . '%'])
                    ->orWhereRaw('UPPER(old_nic) LIKE ?', ['%' . $nic . '%']);
            });
        }

        if ($passport !== '') {
            $query->whereRaw('UPPER(passport_no) LIKE ?', ['%' . $passport . '%']);
        }

        if ($customerNo !== '') {
            $query->where(function ($q) use ($customerNo) {
                $q->whereRaw('UPPER(customer_code) LIKE ?', ['%' . $customerNo . '%'])
                    ->orWhereHas('savingsAccounts', function ($accountQuery) use ($customerNo) {
                        $accountQuery->whereIn('account_type', ['savings', 'investment'])
                            ->whereRaw('UPPER(account_number) LIKE ?', ['%' . $customerNo . '%']);
                    });
            });
        }

        if ($name !== '') {
            $query->where(function ($q) use ($name) {
                $q->where('first_name', 'like', '%' . $name . '%')
                    ->orWhere('last_name', 'like', '%' . $name . '%')
                    ->orWhereRaw("TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) LIKE ?", ['%' . $name . '%']);
            });
        }

        if ($phone !== '') {
            $query->where('phone', 'like', '%' . $phone . '%');
        }

        if ($accountKeyword !== '') {
            $query->whereHas('savingsAccounts', function ($q) use ($accountKeyword) {
                $q->whereIn('account_type', ['savings', 'investment'])
                    ->whereRaw('UPPER(account_number) LIKE ?', ['%' . $accountKeyword . '%']);
            });
        }

        $customers = $query
            ->with(['savingsAccounts' => function ($q) {
                $q->whereIn('account_type', ['savings', 'investment'])
                    ->orderByRaw("CASE WHEN account_type = 'savings' THEN 0 ELSE 1 END")
                    ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
                    ->select(['id', 'customer_id', 'account_number', 'account_type', 'status']);
            }])
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        $matches = $customers->map(function (Customer $customer) use ($nic, $passport, $accountKeyword, $customerNo, $name, $phone) {
            $matchedBy = [];
            $customerCode = strtoupper(trim((string) ($customer->customer_code ?? '')));
            $customerNic = strtoupper(trim((string) ($customer->nic_passport ?? '')));
            $customerOldNic = strtoupper(trim((string) ($customer->old_nic ?? '')));
            $customerPassport = strtoupper(trim((string) ($customer->passport_no ?? '')));
            $customerPhone = trim((string) ($customer->phone ?? ''));
            $customerName = trim((string) (($customer->first_name ?? '') . ' ' . ($customer->last_name ?? '')));

            if ($nic !== '' && (str_contains($customerNic, $nic) || str_contains($customerOldNic, $nic))) {
                $matchedBy[] = 'nic_passport';
            }
            if ($passport !== '' && str_contains($customerPassport, $passport)) {
                $matchedBy[] = 'passport_no';
            }
            $matchedCustomerNo = false;
            if ($customerNo !== '' && str_contains($customerCode, $customerNo)) {
                $matchedBy[] = 'customer_no';
                $matchedCustomerNo = true;
            }
            if ($name !== '' && stripos($customerName, $name) !== false) {
                $matchedBy[] = 'name';
            }
            if ($phone !== '' && str_contains($customerPhone, $phone)) {
                $matchedBy[] = 'phone';
            }

            $matchedSavings = null;
            foreach ($customer->savingsAccounts as $account) {
                $accountNo = strtoupper(trim((string) ($account->account_number ?? '')));
                if (!$matchedCustomerNo && $customerNo !== '' && str_contains($accountNo, $customerNo)) {
                    $matchedBy[] = 'customer_no';
                    $matchedCustomerNo = true;
                }
                if ($accountKeyword === '' || str_contains($accountNo, $accountKeyword)) {
                    $matchedSavings = (string) ($account->account_number ?? '');
                    break;
                }
            }
            if ($matchedSavings !== null) {
                $matchedBy[] = 'investment_account_no';
                $matchedBy[] = 'savings_account_no';
            }

            $customer->repairCustomerCodeIfNeeded();

            return [
                'customer' => $customer->fresh(),
                'matched_by' => array_values(array_unique($matchedBy)),
                'matched_investment_account_no' => $matchedSavings ?? $this->resolvePrimarySavingsAccountNumber($customer),
                'matched_savings_account_no' => $matchedSavings ?? $this->resolvePrimarySavingsAccountNumber($customer),
            ];
        })->values();

        return response()->json([
            'matches' => $matches,
            'count' => $matches->count(),
        ]);
    }

    public function uploadPhotoByCode(Request $request, string $customerCode): JsonResponse
    {
        $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $customer = $this->findCustomerByCodeOrSerial($customerCode);
        if (!$customer) {
            return response()->json([
                'message' => 'Customer not found for provided Customer No.',
            ], 404);
        }

        if ($customer->photo_path) {
            Storage::disk('public')->delete($customer->photo_path);
        }

        $path = $request->file('photo')->store('customer_photos', 'public');
        $customer->update(['photo_path' => $path]);

        return response()->json($customer->fresh());
    }

    private function createDefaultSavingsAccountForCustomer(Customer $customer, ?object $user): void
    {
        $accountType = 'savings';
        $tenantId = (int) ($customer->tenant_id ?? ($user->tenant_id ?? 1));
        $branchId = $customer->branch_id ?? ($user->branch_id ?? null);
        $createdBy = $customer->created_by ?? ($user->id ?? null);

        SavingsAccount::create([
            'tenant_id' => $tenantId > 0 ? $tenantId : 1,
            'branch_id' => $branchId,
            'customer_id' => (int) $customer->id,
            'account_number' => $this->generateSavingsAccountNumber($accountType),
            'account_type' => $accountType,
            'opening_deposit' => 0,
            'balance' => 0,
            'interest_rate' => 0,
            'interest_type' => $this->defaultInterestTypeForAccount($accountType),
            'opened_at' => now()->toDateString(),
            'status' => 'active',
            'created_by' => $createdBy,
        ]);
    }

    private function defaultInterestTypeForAccount(string $accountType): string
    {
        return match ($accountType) {
            'fixed_deposit' => 'maturity_payout',
            'investment' => 'compound_interest',
            default => 'simple_interest',
        };
    }

    private function generateSavingsAccountNumber(string $accountType): string
    {
        $prefix = match ($accountType) {
            'current' => 'CUR',
            'fixed_deposit' => 'FD',
            'investment' => 'INV',
            default => 'SAV',
        };

        do {
            $candidate = sprintf('%s-%s-%05d', $prefix, now()->format('ymd'), random_int(1, 99999));
            $exists = SavingsAccount::query()->where('account_number', $candidate)->exists();
        } while ($exists);

        return $candidate;
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

        $bySavingsAccount = SavingsAccount::query()
            ->with('customer')
            ->whereIn('account_type', ['savings', 'investment'])
            ->whereRaw('UPPER(account_number) = ?', [$normalized])
            ->orderByRaw("CASE WHEN account_type = 'savings' THEN 0 ELSE 1 END")
            ->first();
        if ($bySavingsAccount?->customer) {
            return $bySavingsAccount->customer;
        }

        $byOldNic = Customer::whereRaw('UPPER(old_nic) = ?', [$normalized])->first();
        if ($byOldNic) {
            return $byOldNic;
        }

        return Customer::whereRaw('UPPER(nic_passport) = ?', [$normalized])->first();
    }

    private function resolvePrimarySavingsAccountNumber(Customer $customer): ?string
    {
        $account = SavingsAccount::query()
            ->where('customer_id', (int) $customer->id)
            ->whereIn('account_type', ['savings', 'investment'])
            ->orderByRaw("CASE WHEN account_type = 'savings' THEN 0 ELSE 1 END")
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
            ->orderBy('id')
            ->first();

        $accountNo = trim((string) ($account->account_number ?? ''));
        return $accountNo !== '' ? $accountNo : null;
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): JsonResponse
    {
        $payload = $this->normalizeNicPayload($request->validated());
        $payload = $this->applyFullNamePayload($payload);
        $payload = $this->attachOnboardingPayload($payload);
        $payload = $this->applyRiskSummary($payload);
        $customer->update($payload);
        return response()->json($customer);
    }

    private function attachOnboardingPayload(array $payload): array
    {
        $onboardingPayload = data_get($payload, 'onboarding_payload');
        if (is_array($onboardingPayload) && !empty($onboardingPayload)) {
            return $payload;
        }

        $payload['onboarding_payload'] = [
            'step_1' => [
                'customer_code' => data_get($payload, 'customer_code'),
                'full_name_with_initials' => data_get($payload, 'additional_details.identity.full_name_with_initials'),
                'phone' => data_get($payload, 'phone'),
                'email' => data_get($payload, 'email'),
                'nic_passport' => data_get($payload, 'nic_passport'),
                'old_nic' => data_get($payload, 'old_nic'),
                'passport_no' => data_get($payload, 'passport_no'),
                'driving_license_no' => data_get($payload, 'driving_license_no'),
                'tax_identification_no' => data_get($payload, 'tax_identification_no'),
                'biometric_reference' => data_get($payload, 'biometric_reference'),
                'date_of_birth' => data_get($payload, 'date_of_birth'),
                'gender' => data_get($payload, 'gender'),
                'marital_status' => data_get($payload, 'marital_status'),
                'nationality' => data_get($payload, 'nationality'),
                'contact' => data_get($payload, 'additional_details.contact', []),
            ],
            'step_2' => [
                'residence' => data_get($payload, 'additional_details.residence', []),
                'employment' => data_get($payload, 'additional_details.employment', []),
                'business_information' => data_get($payload, 'additional_details.business_information', []),
            ],
            'step_3' => [
                'family_information' => data_get($payload, 'additional_details.family_information', []),
                'financial_behaviour' => data_get($payload, 'additional_details.financial_behaviour', []),
                'banking_relationships' => data_get($payload, 'additional_details.banking_relationships', []),
                'existing_loans' => data_get($payload, 'additional_details.existing_loans', []),
                'credit_history' => data_get($payload, 'additional_details.credit_history', []),
            ],
            'step_4' => [
                'document_overview' => [
                    'paysheet_files_count' => (int) data_get($payload, 'additional_details.employment.paysheet_files_count', 0),
                    'bank_statement_files_count' => (int) data_get($payload, 'additional_details.employment.bank_statement_files_count', 0),
                    'epf_report_files_count' => (int) data_get($payload, 'additional_details.employment.epf_report_files_count', 0),
                    'tax_return_files_count' => (int) data_get($payload, 'additional_details.employment.tax_return_files_count', 0),
                    'business_documents_count' => (int) data_get($payload, 'additional_details.business_information.business_documents_count', 0),
                ],
            ],
            'step_5' => [
                'residence_environment' => data_get($payload, 'additional_details.residence_environment', []),
            ],
            'step_6' => [
                'risk_assessment' => data_get($payload, 'additional_details.risk_assessment', []),
            ],
            'completed_steps' => 6,
            'submitted_at' => now()->toIso8601String(),
        ];

        return $payload;
    }

    private function applyFullNamePayload(array $payload): array
    {
        $fullName = trim((string) ($payload['full_name_with_initials'] ?? ''));
        if ($fullName === '') {
            return $payload;
        }

        $parts = preg_split('/\s+/', $fullName, 2);
        $firstName = trim((string) ($parts[0] ?? ''));
        $lastName = trim((string) ($parts[1] ?? ''));

        $payload['first_name'] = $firstName !== '' ? $firstName : 'N/A';
        $payload['last_name'] = $lastName !== '' ? $lastName : '.';
        data_set($payload, 'additional_details.identity.full_name_with_initials', $fullName);
        unset($payload['full_name_with_initials']);

        return $payload;
    }

    private function normalizeNicPayload(array $payload): array
    {
        $nic = strtoupper(trim((string) ($payload['nic_passport'] ?? '')));
        if ($nic === '') {
            return $payload;
        }

        $parsed = $this->parseSriLankanNic($nic);
        $payload['nic_passport'] = $parsed['new_nic'];

        if (!empty($parsed['old_nic']) && empty($payload['old_nic'])) {
            $payload['old_nic'] = $parsed['old_nic'];
        }

        if (!empty($parsed['date_of_birth']) && empty($payload['date_of_birth'])) {
            $payload['date_of_birth'] = $parsed['date_of_birth'];
        }

        if (!empty($parsed['gender']) && empty($payload['gender'])) {
            $payload['gender'] = $parsed['gender'];
        }

        return $payload;
    }

    private function parseSriLankanNic(string $nic): array
    {
        $normalized = strtoupper(trim($nic));
        $oldNic = null;
        $newNic = $normalized;
        $year = null;
        $dayCode = null;

        if (preg_match('/^\d{10}([VX])?$/', $normalized) === 1) {
            $digits = substr($normalized, 0, 10);
            $suffix = strlen($normalized) === 11 ? substr($normalized, -1) : 'V';
            $oldNic = $digits . $suffix;
            $newNic = '19' . $digits;
            $year = 1900 + (int) substr($digits, 0, 2);
            $dayCode = (int) substr($digits, 2, 3);
        } elseif (preg_match('/^\d{12}$/', $normalized) === 1) {
            $newNic = $normalized;
            $year = (int) substr($normalized, 0, 4);
            $dayCode = (int) substr($normalized, 4, 3);
        }

        if (!$year || !$dayCode || $dayCode < 1) {
            return [
                'new_nic' => $newNic,
                'old_nic' => $oldNic,
                'date_of_birth' => null,
                'gender' => null,
            ];
        }

        $gender = 'male';
        if ($dayCode > 500) {
            $gender = 'female';
            $dayCode -= 500;
        }

        if ($dayCode < 1 || $dayCode > 366) {
            return [
                'new_nic' => $newNic,
                'old_nic' => $oldNic,
                'date_of_birth' => null,
                'gender' => null,
            ];
        }

        $date = now()->setDate($year, 1, 1)->startOfDay()->addDays($dayCode - 1);

        return [
            'new_nic' => $newNic,
            'old_nic' => $oldNic,
            'date_of_birth' => $date->toDateString(),
            'gender' => $gender,
        ];
    }

    private function applyRiskSummary(array $payload): array
    {
        $risk = data_get($payload, 'additional_details.risk_assessment');
        if (!is_array($risk)) {
            return $payload;
        }

        $factors = [
            (float) data_get($risk, 'credit_history', 0),
            (float) data_get($risk, 'income_stability', 0),
            (float) data_get($risk, 'existing_debt', 0),
            (float) data_get($risk, 'savings_relationship', 0),
            (float) data_get($risk, 'employment', 0),
            (float) data_get($risk, 'guarantor_strength', 0),
            (float) data_get($risk, 'collateral_quality', 0),
        ];

        $computedTotal = (int) round(array_sum($factors));
        $reportedTotal = (int) round((float) data_get($risk, 'total_score', $computedTotal));
        $finalTotal = $reportedTotal > 0 ? $reportedTotal : $computedTotal;

        data_set($payload, 'additional_details.risk_assessment.total_score', $finalTotal);
        $payload['risk_total_score'] = $finalTotal;
        $payload['risk_grade'] = $this->resolveRiskGrade($finalTotal);

        return $payload;
    }

    private function resolveRiskGrade(int $score): string
    {
        if ($score >= 85) {
            return 'Low Risk';
        }

        if ($score >= 70) {
            return 'Moderate Risk';
        }

        if ($score >= 55) {
            return 'Elevated Risk';
        }

        return 'High Risk';
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $customer->delete();
        return response()->json(null, 204);
    }
}
