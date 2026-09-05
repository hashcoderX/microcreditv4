<?php

namespace App\Http\Controllers\Api\Microfinance;

use Barryvdh\DomPDF\Facade\Pdf;
use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyAccount;
use App\Models\CompanyDocumentTemplate;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\EmployeeWallet;
use App\Models\MicrofinanceCenter;
use App\Models\MicrofinanceGroup;
use App\Models\MicrofinanceLoanGuarantor;
use App\Models\MicrofinanceActionCenterStepRole;
use App\Models\MicrofinanceLoanRequest;
use App\Models\MicrofinancePenaltySetting;
use App\Models\MicrofinanceRoute;
use App\Models\Role;
use App\Models\SavingsAccount;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LoanRequestController extends Controller
{
    private const LOAN_REQUEST_MIN_PROFILE_COMPLETION = 30;
    private const LOAN_REQUEST_MIN_DOCUMENT_COMPLETION = 0;
    private const WORKFLOW_FINAL_STEP = 14;

    /**
     * @var array<int, string>
     */
    private const WORKFLOW_STEP_TITLES = [
        1 => 'CRO Check Pending',
        2 => 'Pending Call Confirmation',
        3 => 'BM approval',
        4 => 'Head Office Approval',
        5 => 'Cash Allocation',
        6 => 'Cash Request',
        7 => 'Cash Withdrawal',
        8 => 'Second Call Confirmation',
        9 => 'Loan Signature Check',
        10 => 'Document failing',
        11 => 'Insurance Request',
        12 => 'Branch Insurance Request',
        13 => 'Head Office Insurance Request',
        14 => 'Grant',
    ];

    private function normalizeWorkflowStep(int $step): int
    {
        if ($step < 1) {
            return 1;
        }

        if ($step > self::WORKFLOW_FINAL_STEP) {
            return self::WORKFLOW_FINAL_STEP;
        }

        return $step;
    }

    private function resolveWorkflowStep(MicrofinanceLoanRequest $loanRequest): int
    {
        return $this->normalizeWorkflowStep((int) ($loanRequest->workflow_step ?? 1));
    }

    private function workflowStepTitle(int $step): string
    {
        $normalized = $this->normalizeWorkflowStep($step);
        return self::WORKFLOW_STEP_TITLES[$normalized] ?? 'Workflow Step';
    }

    private function normalizeEvaluationNumber(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value)) {
            $value = trim($value);
            if ($value === '') {
                return null;
            }
        }

        if (!is_numeric($value)) {
            return null;
        }

        $numeric = (float) $value;
        if (!is_finite($numeric) || $numeric < 0) {
            return null;
        }

        return round($numeric, 2);
    }

    /**
     * @param mixed $payload
     */
    private function sanitizeEvaluationPayload(mixed $payload): ?array
    {
        if (!is_array($payload)) {
            return null;
        }

        $sanitized = $payload;

        $numericKeys = [
            'other_loans_monthly_installment',
            'leasing_monthly_installment',
            'family_income_without_business',
            'family_income_item_1',
            'family_income_item_2',
            'family_income_item_3',
            'family_wage_earner_1_salary',
            'family_wage_earner_2_salary',
            'family_wage_earner_3_salary',
            'family_rent_out_house',
            'family_rent_out_vehicle',
            'family_interest_commission',
            'family_other_income',
            'family_monthly_expenses',
            'family_monthly_income',
            'family_wage_contribution',
            'business_1_unit_selling_price',
            'business_1_units',
            'business_1_income',
            'business_2_unit_selling_price',
            'business_2_units',
            'business_2_income',
            'total_family_expenses_a',
            'total_income_family_b',
            'total_loans_and_leasing_c',
            'loan_payments_and_family_expenses_d',
            'remaining_cash_with_family_e',
            'average_cash_per_week',
            'business_monthly_expenses',
            'business_monthly_income',
        ];

        foreach ($numericKeys as $key) {
            if (array_key_exists($key, $sanitized)) {
                $sanitized[$key] = $this->normalizeEvaluationNumber($sanitized[$key]);
            }
        }

        foreach (['family_expense_breakdown', 'business_expense_breakdown'] as $breakdownKey) {
            $rawBreakdown = $sanitized[$breakdownKey] ?? null;
            if (!is_array($rawBreakdown)) {
                continue;
            }

            foreach ($rawBreakdown as $itemKey => $itemValue) {
                $rawBreakdown[$itemKey] = $this->normalizeEvaluationNumber($itemValue);
            }

            $sanitized[$breakdownKey] = $rawBreakdown;
        }

        return $sanitized;
    }

    private function resolveLoanReference(MicrofinanceLoanRequest $loanRequest): string
    {
        $loanCode = trim((string) ($loanRequest->loan_code ?? ''));
        if ($loanCode !== '') {
            return $loanCode;
        }

        $referenceNo = trim((string) ($loanRequest->reference_no ?? ''));
        if ($referenceNo !== '') {
            return $referenceNo;
        }

        return 'MF-' . (int) $loanRequest->id;
    }

    private function resolveCanonicalCustomerNo(Customer $customer): string
    {
        $account = SavingsAccount::query()
            ->where('customer_id', (int) $customer->id)
            ->where('account_type', 'investment')
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
            ->orderBy('id')
            ->first();

        $accountNo = trim((string) ($account->account_number ?? ''));
        if ($accountNo !== '') {
            return $accountNo;
        }

        return strtoupper(trim((string) ($customer->customer_code ?? '')));
    }

    private function findCustomerByIdentifier(string $identifier): ?Customer
    {
        $normalized = strtoupper(trim($identifier));
        if ($normalized === '') {
            return null;
        }

        $byCode = Customer::query()
            ->whereRaw('UPPER(customer_code) = ?', [$normalized])
            ->first();
        if ($byCode) {
            return $byCode;
        }

        $account = SavingsAccount::query()
            ->with('customer')
            ->where('account_type', 'investment')
            ->whereRaw('UPPER(account_number) = ?', [$normalized])
            ->first();
        if ($account?->customer) {
            return $account->customer;
        }

        return null;
    }

    private function applyLoanRequestCustomerProfilePayload(Customer $customer, array $profilePayload): Customer
    {
        $additionalDetailsIncoming = is_array($profilePayload['additional_details'] ?? null)
            ? $profilePayload['additional_details']
            : [];
        $onboardingPayloadIncoming = is_array($profilePayload['onboarding_payload'] ?? null)
            ? $profilePayload['onboarding_payload']
            : [];

        $existingAdditionalDetails = is_array($customer->additional_details)
            ? $customer->additional_details
            : [];
        $existingOnboardingPayload = is_array($customer->onboarding_payload)
            ? $customer->onboarding_payload
            : [];

        $mergedAdditionalDetails = array_replace_recursive($existingAdditionalDetails, $additionalDetailsIncoming);
        $mergedOnboardingPayload = array_replace_recursive($existingOnboardingPayload, $onboardingPayloadIncoming);

        $customer->additional_details = $mergedAdditionalDetails;
        $customer->onboarding_payload = $mergedOnboardingPayload;

        if (array_key_exists('existing_loans', $profilePayload)) {
            $customer->existing_loans = (bool) $profilePayload['existing_loans'];
        }
        if (array_key_exists('monthly_loan_obligations', $profilePayload)) {
            $customer->monthly_loan_obligations = $profilePayload['monthly_loan_obligations'] === null
                ? null
                : (float) $profilePayload['monthly_loan_obligations'];
        }
        if (array_key_exists('credit_score', $profilePayload)) {
            $customer->credit_score = $profilePayload['credit_score'] === null
                ? null
                : (int) $profilePayload['credit_score'];
        }

        $customer->save();

        return $customer->fresh();
    }

    /**
     * @return array<int>
     */
    private function approvalNotificationRecipientIds(?int $branchId, ?int $actorUserId = null): array
    {
        $usersQuery = User::query()
            ->with(['designation:id,name', 'roles:id,name']);

        if (($actorUserId ?? 0) > 0) {
            $usersQuery->where('id', '!=', (int) $actorUserId);
        }

        $users = $usersQuery->get();

        $recipientIds = [];

        foreach ($users as $user) {
            if (!$this->hasLoanApprovalAccess($user)) {
                continue;
            }

            $isSystemAdmin = method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin();
            if (!$isSystemAdmin && $branchId !== null && (int) ($user->branch_id ?? 0) !== (int) $branchId) {
                continue;
            }

            $recipientIds[] = (int) $user->id;
        }

        return array_values(array_unique($recipientIds));
    }

    /**
     * @return array<int>
     */
    private function workflowNotificationRecipientIds(MicrofinanceLoanRequest $loanRequest, int $actorUserId = 0): array
    {
        $recipientIds = [];

        $assignedApproverEmployeeId = (int) ($loanRequest->approval_employee_id ?? 0);
        if ($assignedApproverEmployeeId > 0) {
            $assignedApprover = Employee::query()
                ->with(['user:id,employee_id'])
                ->find($assignedApproverEmployeeId);

            $assignedApproverUserId = (int) ($assignedApprover?->user?->id ?? 0);
            if ($assignedApproverUserId > 0) {
                $recipientIds[] = $assignedApproverUserId;
            }
        }

        $createdByUserId = (int) ($loanRequest->created_by ?? 0);
        if ($createdByUserId > 0) {
            $recipientIds[] = $createdByUserId;
        }

        if ($actorUserId > 0) {
            $recipientIds[] = $actorUserId;
        }

        return array_values(array_unique(array_filter($recipientIds, fn ($id) => (int) $id > 0)));
    }

    private function notifyWorkflowStepTransition(
        MicrofinanceLoanRequest $loanRequest,
        int $fromStep,
        int $toStep,
        ?User $actor = null
    ): void {
        $actorUserId = (int) ($actor?->id ?? 0);
        $recipientIds = $this->workflowNotificationRecipientIds($loanRequest, $actorUserId);
        if (empty($recipientIds)) {
            return;
        }

        $fromStep = $this->normalizeWorkflowStep($fromStep);
        $toStep = $this->normalizeWorkflowStep($toStep);
        $fromType = 'step_' . $fromStep;
        $toType = 'step_' . $toStep;
        $toTitle = $this->workflowStepTitle($toStep);

        $customerName = trim((string) ($loanRequest->customer_name ?? 'Customer'));
        $reference = $this->resolveLoanReference($loanRequest);
        $actorName = trim((string) ($actor?->name ?? 'Workflow reviewer'));

        UserNotification::query()
            ->whereIn('user_id', $recipientIds)
            ->where('is_read', false)
            ->where('type', $fromType)
            ->where('meta->loan_request_id', (int) $loanRequest->id)
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        foreach ($recipientIds as $recipientId) {
            UserNotification::query()->create([
                'user_id' => $recipientId,
                'title' => 'Loan Workflow Updated',
                'message' => sprintf('%s moved %s (%s) to Step %d: %s.', $actorName, $customerName, $reference, $toStep, $toTitle),
                'type' => $toType,
                'is_read' => false,
                'is_important' => true,
                'action_url' => '/dashboard/microfinance/loans/approvals',
                'meta' => [
                    'loan_request_id' => (int) $loanRequest->id,
                    'loan_code' => $reference,
                    'reference_no' => (string) ($loanRequest->reference_no ?? ''),
                    'customer_no' => (string) ($loanRequest->customer_no ?? ''),
                    'from_step' => $fromStep,
                    'to_step' => $toStep,
                    'workflow_step' => $toStep,
                    'workflow_step_title' => $toTitle,
                ],
            ]);
        }
    }

    private function notifyLoanRequestCreated(MicrofinanceLoanRequest $loanRequest, Request $request): void
    {
        $actorUserId = (int) ($request->user()?->id ?? 0);
        $branchId = (int) ($loanRequest->branch_id ?? 0);

        $recipientIds = [];

        $assignedApproverEmployeeId = (int) ($loanRequest->approval_employee_id ?? 0);
        if ($assignedApproverEmployeeId > 0) {
            $assignedApprover = Employee::query()
                ->with(['user:id,employee_id'])
                ->find($assignedApproverEmployeeId);

            $assignedApproverUserId = (int) ($assignedApprover?->user?->id ?? 0);
            if ($assignedApproverUserId > 0 && $assignedApproverUserId !== $actorUserId) {
                $recipientIds[] = $assignedApproverUserId;
            }
        }

        $createdByUserId = (int) ($loanRequest->created_by ?? 0);
        if ($createdByUserId > 0) {
            $recipientIds[] = $createdByUserId;
        }

        // Also notify branch up-level approval users (Credit Officer / approvers) for Step 1 visibility.
        $branchApproverUsers = User::query()
            ->with(['designation:id,name', 'roles:id,name'])
            ->where(function ($query) use ($branchId) {
                if ($branchId > 0) {
                    $query->where('branch_id', $branchId)
                        ->orWhereNull('branch_id');
                }
            })
            ->get(['id', 'branch_id', 'designation_id']);

        foreach ($branchApproverUsers as $candidateUser) {
            $candidateId = (int) ($candidateUser->id ?? 0);
            if ($candidateId <= 0 || $candidateId === $actorUserId) {
                continue;
            }

            if (!$this->hasLoanApprovalAccess($candidateUser)) {
                continue;
            }

            $recipientIds[] = $candidateId;
        }

        $recipientIds = array_values(array_unique(array_filter($recipientIds, fn ($id) => (int) $id > 0)));

        if (empty($recipientIds)) {
            return;
        }

        $customerName = trim((string) ($loanRequest->customer_name ?? 'Customer'));
        $reference = $this->resolveLoanReference($loanRequest);
        $requestedAmount = number_format((float) ($loanRequest->loan_amount ?? 0), 2, '.', ',');

        foreach ($recipientIds as $recipientId) {
            UserNotification::query()->create([
                'user_id' => $recipientId,
                'title' => 'New Microfinance Loan Request',
                'message' => sprintf('%s submitted %s for %s LKR. Review approval queue.', $customerName, $reference, $requestedAmount),
                'type' => 'microfinance_loan_request',
                'is_read' => false,
                'is_important' => true,
                'action_url' => '/dashboard/microfinance/loans/approvals',
                'meta' => [
                    'loan_request_id' => (int) $loanRequest->id,
                    'loan_code' => $reference,
                    'reference_no' => (string) ($loanRequest->reference_no ?? ''),
                    'customer_no' => (string) ($loanRequest->customer_no ?? ''),
                    'status' => (string) ($loanRequest->status ?? 'requested'),
                ],
            ]);

            UserNotification::query()->create([
                'user_id' => $recipientId,
                'title' => 'Loan Workflow Started',
                'message' => sprintf('%s is now in Step 1: %s.', $reference, $this->workflowStepTitle(1)),
                'type' => 'step_1',
                'is_read' => false,
                'is_important' => true,
                'action_url' => '/dashboard/microfinance/loans/approvals',
                'meta' => [
                    'loan_request_id' => (int) $loanRequest->id,
                    'loan_code' => $reference,
                    'reference_no' => (string) ($loanRequest->reference_no ?? ''),
                    'customer_no' => (string) ($loanRequest->customer_no ?? ''),
                    'workflow_step' => 1,
                    'workflow_step_title' => $this->workflowStepTitle(1),
                    'status' => (string) ($loanRequest->status ?? 'requested'),
                ],
            ]);
        }
    }

    private function buildBaseWalletNo(int $employeeId): string
    {
        return 'EW' . str_pad((string) $employeeId, 6, '0', STR_PAD_LEFT);
    }

    private function generateUniqueWalletNo(int $employeeId): string
    {
        $baseWalletNo = $this->buildBaseWalletNo($employeeId);
        $walletNo = $baseWalletNo;
        $suffix = 1;

        while (EmployeeWallet::query()->where('wallet_no', $walletNo)->exists()) {
            $walletNo = $baseWalletNo . '-' . $suffix;
            $suffix++;
        }

        return $walletNo;
    }

    private function ensureCollectorWallet(User $collectorUser, int $fallbackBranchId): ?EmployeeWallet
    {
        $employeeId = (int) ($collectorUser->employee_id ?? 0);
        if ($employeeId <= 0) {
            return null;
        }

        $existing = EmployeeWallet::query()
            ->where('employee_id', $employeeId)
            ->lockForUpdate()
            ->first();

        if ($existing) {
            return $existing;
        }

        $employee = $collectorUser->employee;
        if (!$employee || (int) $employee->id !== $employeeId) {
            return null;
        }

        $resolvedBranchId = (int) ($employee->branch_id ?? $fallbackBranchId ?: 1);
        $resolvedTenantId = (int) ($employee->tenant_id ?? $resolvedBranchId ?: 1);

        return EmployeeWallet::create([
            'tenant_id' => $resolvedTenantId,
            'branch_id' => $resolvedBranchId,
            'employee_id' => $employeeId,
            'wallet_no' => $this->generateUniqueWalletNo($employeeId),
            'opening_balance' => 0,
            'current_balance' => 0,
            'status' => 'active',
        ]);
    }

    private function creditCollectorWalletForCharges(MicrofinanceLoanRequest $loanRequest, float $chargeAmount): bool
    {
        if ($chargeAmount <= 0) {
            return false;
        }

        if (!empty($loanRequest->charges_wallet_credited_at)) {
            return false;
        }

        $createdByUserId = (int) ($loanRequest->created_by ?? 0);
        if ($createdByUserId <= 0) {
            return false;
        }

        $collectorUser = User::query()->with('employee')->find($createdByUserId);
        if (!$collectorUser) {
            return false;
        }

        $wallet = $this->ensureCollectorWallet($collectorUser, (int) ($loanRequest->branch_id ?? 0));
        if (!$wallet) {
            return false;
        }

        $wallet->current_balance = round((float) ($wallet->current_balance ?? 0) + $chargeAmount, 2);
        $wallet->save();

        $loanRequest->charges_wallet_credited_at = now();
        $loanRequest->save();

        return true;
    }

    private function refundCollectorWalletForCharges(MicrofinanceLoanRequest $loanRequest, float $chargeAmount): bool
    {
        if ($chargeAmount <= 0) {
            return false;
        }

        if (empty($loanRequest->charges_wallet_credited_at)) {
            return false;
        }

        $createdByUserId = (int) ($loanRequest->created_by ?? 0);
        if ($createdByUserId <= 0) {
            return false;
        }

        $collectorUser = User::query()->with('employee')->find($createdByUserId);
        if (!$collectorUser) {
            return false;
        }

        $employeeId = (int) ($collectorUser->employee_id ?? 0);
        if ($employeeId <= 0) {
            return false;
        }

        $wallet = EmployeeWallet::query()
            ->where('employee_id', $employeeId)
            ->lockForUpdate()
            ->first();

        if (!$wallet) {
            return false;
        }

        $wallet->current_balance = round((float) ($wallet->current_balance ?? 0) - $chargeAmount, 2);
        $wallet->save();

        // Mark as reversed to avoid duplicate refund attempts.
        $loanRequest->charges_wallet_credited_at = null;
        $loanRequest->save();

        return true;
    }

    private function resolveCashWithdrawalAmount(MicrofinanceLoanRequest $loanRequest): float
    {
        $payload = is_array($loanRequest->cash_allocation_payload) ? $loanRequest->cash_allocation_payload : [];
        $amount = round((float) ($payload['today_allocation_amount'] ?? 0), 2);

        if ($amount <= 0) {
            $amount = round((float) ($loanRequest->loan_amount ?? 0), 2);
        }

        return $amount > 0 ? $amount : 0.0;
    }

    /**
     * @return array{ok: bool, status?: int, message?: string}
     */
    private function applyCashWithdrawalToBranchMainAccount(MicrofinanceLoanRequest $loanRequest): array
    {
        $branchId = (int) ($loanRequest->branch_id ?? 0);
        if ($branchId <= 0) {
            return [
                'ok' => false,
                'status' => 422,
                'message' => 'Branch is missing for this loan. Unable to update Branch Main Account.',
            ];
        }

        $amount = $this->resolveCashWithdrawalAmount($loanRequest);
        if ($amount <= 0) {
            return [
                'ok' => false,
                'status' => 422,
                'message' => 'Cash withdrawal amount must be greater than zero to update Branch Main Account.',
            ];
        }

        $mainAccount = CompanyAccount::query()
            ->where('company_id', $branchId)
            ->where('account_type', CompanyAccount::TYPE_MAIN)
            ->lockForUpdate()
            ->first();

        if (!$mainAccount) {
            $company = Company::query()->find($branchId);
            if (!$company) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => 'Branch record not found. Unable to update Branch Main Account.',
                ];
            }

            $mainAccount = CompanyAccount::query()->create([
                'company_id' => $branchId,
                'account_type' => CompanyAccount::TYPE_MAIN,
                'account_name' => CompanyAccount::defaultAccountName(CompanyAccount::TYPE_MAIN, (string) ($company->name ?? '')),
                'account_code' => CompanyAccount::defaultAccountCode(CompanyAccount::TYPE_MAIN),
                'opening_balance' => 0,
                'current_balance' => 0,
                'is_active' => true,
            ]);
        }

        $mainAccount->current_balance = round((float) ($mainAccount->current_balance ?? 0) + $amount, 2);
        $mainAccount->save();

        return ['ok' => true];
    }

    private function extractTemplateTextFromDocx(string $docxPath): string
    {
        $zip = new \ZipArchive();
        if ($zip->open($docxPath) !== true) {
            return '';
        }

        $textChunks = [];

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entryName = $zip->getNameIndex($i);
            if (!$entryName || !str_starts_with($entryName, 'word/') || !str_ends_with($entryName, '.xml')) {
                continue;
            }

            $content = $zip->getFromIndex($i);
            if (!is_string($content) || $content === '') {
                continue;
            }

            // Preserve basic paragraph/line structure before removing XML tags.
            $normalized = str_replace(['</w:p>', '</w:tr>', '</w:tc>', '<w:br/>', '<w:br />'], ["\n", "\n", ' ', "\n", "\n"], $content);
            $plain = preg_replace('/<[^>]+>/', '', $normalized);
            $plain = html_entity_decode((string) $plain, ENT_QUOTES | ENT_XML1, 'UTF-8');
            $plain = preg_replace('/\s+\n/', "\n", (string) $plain);

            if (trim((string) $plain) !== '') {
                $textChunks[] = trim((string) $plain);
            }
        }

        $zip->close();

        return trim(implode("\n\n", $textChunks));
    }

    private function generateAgreementHtmlWithOpenAi(string $filledTemplateText, array $loanData, array $companyDetails = []): string
    {
        $apiKey = (string) env('OPENAI_API_KEY', '');
        if ($apiKey === '') {
            return '';
        }

        $templateExcerpt = mb_substr($filledTemplateText, 0, 15000);

        $promptPayload = [
            'task' => 'Convert the provided FILLED loan agreement text into print-ready HTML while preserving original sequence and wording.',
            'rules' => [
                'Return JSON only with one key: html.',
                'Return only inner HTML fragments (no html/head/body tags).',
                'Do not add new legal clauses, sections, or extra pages.',
                'Keep the same order and wording from filled_template_text.',
                'Keep all loan values exactly as provided in filled_template_text.',
                'Use clean legal formatting with paragraphs, numbered lists, and spacing only.',
            ],
            'filled_template_text' => $templateExcerpt,
            'loan_data' => $loanData,
            'company_details' => $companyDetails,
        ];

        $requests = [
            [
                'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
                'messages' => [
                    [
                        'role' => 'system',
                        'content' => 'You produce strict JSON output and expert legal-document HTML formatting.',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode($promptPayload, JSON_UNESCAPED_UNICODE),
                    ],
                ],
                'temperature' => 0,
                'response_format' => ['type' => 'json_object'],
            ],
            [
                'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
                'messages' => [
                    [
                        'role' => 'system',
                        'content' => 'Return only JSON: {"html":"..."}. Do not include markdown fences.',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode($promptPayload, JSON_UNESCAPED_UNICODE),
                    ],
                ],
                'temperature' => 0,
            ],
        ];

        foreach ($requests as $index => $payload) {
            try {
                $response = Http::withToken($apiKey)
                    ->timeout(40)
                    ->post('https://api.openai.com/v1/chat/completions', $payload);

                if (!$response->successful()) {
                    Log::warning('OpenAI agreement generation request failed', [
                        'attempt' => $index + 1,
                        'status' => $response->status(),
                        'body' => mb_substr((string) $response->body(), 0, 500),
                    ]);
                    continue;
                }

                $content = (string) data_get($response->json(), 'choices.0.message.content', '');
                if ($content === '') {
                    continue;
                }

                $decoded = json_decode($content, true);
                $html = '';

                if (is_array($decoded) && array_key_exists('html', $decoded)) {
                    $html = (string) $decoded['html'];
                } elseif (str_contains($content, '<') && str_contains($content, '>')) {
                    // Some models may return HTML directly.
                    $html = $content;
                }

                $html = trim((string) $html);
                $html = preg_replace('/^```(?:html|json)?\s*/i', '', $html);
                $html = preg_replace('/\s*```$/', '', (string) $html);
                $html = preg_replace('/<\/?(?:html|head|body)[^>]*>/i', '', (string) $html);

                if (trim((string) $html) !== '') {
                    return trim((string) $html);
                }
            } catch (\Throwable $e) {
                Log::error('OpenAI agreement HTML generation failed', [
                    'attempt' => $index + 1,
                    'message' => $e->getMessage(),
                ]);
            }
        }

        return '';
    }

    private function applyMappingToTemplateText(string $templateText, array $mapping): string
    {
        $filledText = $templateText;

        foreach ($mapping as $key => $value) {
            if (!is_string($value)) {
                continue;
            }

            $escapedKey = preg_quote((string) $key, '/');
            $filledText = preg_replace('/\{\{\s*' . $escapedKey . '\s*\}\}/', $value, (string) $filledText);
            $filledText = preg_replace('/\$\{\s*' . $escapedKey . '\s*\}/', $value, (string) $filledText);
        }

        // Fill common underscore placeholders while preserving template appearance.
        $labelPatterns = [
            '/(Lender\s*:\s*Name\s*:\s*)_{3,}/i' => ($mapping['lender_name'] ?? '__________'),
            '/(Lender\s*:\s*Address\s*:\s*)_{3,}/i' => ($mapping['lender_address'] ?? '__________'),
            '/(Lender\s*:\s*(?:NIC\/Company\s*No\s*:|NIC\s*:)\s*)_{3,}/i' => ($mapping['lender_nic'] ?? '__________'),
            '/(Borrower\s*:\s*Name\s*:\s*)_{3,}/i' => ($mapping['borrower_name'] ?? '__________'),
            '/(Borrower\s*:\s*Address\s*:\s*)_{3,}/i' => ($mapping['borrower_address'] ?? '__________'),
            '/(Borrower\s*:\s*(?:NIC\/Company\s*No\s*:|NIC\s*:)\s*)_{3,}/i' => ($mapping['borrower_nic'] ?? '__________'),
            '/(Customer\s*Name\s*:\s*)_{3,}/i' => ($mapping['customer_name'] ?? '__________'),
            '/(Customer\s*No\s*:\s*)_{3,}/i' => ($mapping['customer_no'] ?? '__________'),
            '/(Address\s*:\s*)_{3,}/i' => ($mapping['address'] ?? '__________'),
            '/(Contact\s*:\s*)_{3,}/i' => ($mapping['contact_no'] ?? '__________'),
        ];

        foreach ($labelPatterns as $pattern => $replacementValue) {
            $filledText = preg_replace($pattern, '$1' . (string) $replacementValue, (string) $filledText);
        }

        // Handle templates that use plain labels + blanks (no {{placeholders}}).
        $lines = preg_split('/\R/', (string) $filledText) ?: [];
        $context = '';

        foreach ($lines as $index => $line) {
            $trimmed = trim((string) $line);

            if (preg_match('/^Lender\s*:/i', $trimmed)) {
                $context = 'lender';
                continue;
            }

            if (preg_match('/^Borrower\s*:/i', $trimmed)) {
                $context = 'borrower';
                continue;
            }

            if (preg_match('/^This\s+Loan\s+Agreement\s+is\s+made\s+on\s+this\s*$/i', $trimmed)) {
                $lines[$index] = 'This Loan Agreement is made on this ' . (string) ($mapping['issue_date'] ?? '__________');
                continue;
            }

            if (preg_match('/^Date\s*:\s*$/i', $trimmed)) {
                $lines[$index] = 'Date: ' . (string) ($mapping['today_date'] ?? $mapping['issue_date'] ?? '');
                continue;
            }

            if (preg_match('/^To\s*:\s*$/i', $trimmed)) {
                $toValue = trim(((string) ($mapping['customer_name'] ?? '')) . ' - ' . ((string) ($mapping['address'] ?? '')));
                $lines[$index] = 'To: ' . trim($toValue, ' -');
                continue;
            }

            if (preg_match('/^Subject\s*:\s*Reminder\s+for\s+Loan\s+Payment\s*$/i', $trimmed)) {
                $subjectLoanRef = (string) ($mapping['loan_code'] ?? $mapping['customer_no'] ?? '');
                $lines[$index] = 'Subject: Reminder for Loan Payment' . ($subjectLoanRef !== '' ? ' - ' . $subjectLoanRef : '');
                continue;
            }

            if (preg_match('/^Name\s*:\s*$/i', $trimmed)) {
                $name = $context === 'lender'
                    ? (string) ($mapping['lender_name'] ?? '')
                    : (string) ($mapping['borrower_name'] ?? $mapping['customer_name'] ?? '');
                if (trim($name) !== '') {
                    $lines[$index] = 'Name: ' . $name;
                }
                continue;
            }

            if (preg_match('/^Address\s*:?\s*$/i', $trimmed)) {
                $address = $context === 'lender'
                    ? (string) ($mapping['lender_address'] ?? '')
                    : (string) ($mapping['borrower_address'] ?? $mapping['address'] ?? '');
                if (trim($address) !== '') {
                    $lines[$index] = str_ends_with($trimmed, ':') ? 'Address: ' . $address : 'Address ' . $address;
                }
                continue;
            }

            if (preg_match('/^(NIC\/Company\s*No\s*:|NIC\s*:)\s*$/i', $trimmed, $m)) {
                $nic = $context === 'lender'
                    ? (string) ($mapping['lender_nic'] ?? '')
                    : (string) ($mapping['borrower_nic'] ?? $mapping['nic'] ?? '');
                if (trim($nic) !== '') {
                    $lines[$index] = $m[1] . ' ' . $nic;
                }
                continue;
            }

            if (preg_match('/^Amount\s*:\s*LKR/i', $trimmed)) {
                $lines[$index] = 'Amount: LKR ' . (string) ($mapping['loan_amount'] ?? $mapping['principal'] ?? '0.00');
                continue;
            }

            if (preg_match('/^(Loan\s*(No|Number|Code)\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['loan_code'] ?? $mapping['customer_no'] ?? '');
                continue;
            }

            if (preg_match('/^(Customer\s*Name\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['customer_name'] ?? '');
                continue;
            }

            if (preg_match('/^(Customer\s*No\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['customer_no'] ?? '');
                continue;
            }

            if (preg_match('/^(Issue\s*Date\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['issue_date'] ?? '');
                continue;
            }

            if (preg_match('/^(Due\s*Date\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['due_date'] ?? '');
                continue;
            }

            if (preg_match('/^(Next\s*Payment\s*Date\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['next_payment_date'] ?? '');
                continue;
            }

            if (preg_match('/^(Outstanding\s*Amount\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' LKR ' . (string) ($mapping['outstanding_amount'] ?? $mapping['total_payable'] ?? '0.00');
                continue;
            }

            if (preg_match('/^(Arrears\s*(Amount|Balance)\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' LKR ' . (string) ($mapping['arrears_balance'] ?? '0.00');
                continue;
            }

            if (preg_match('/^(Field\s*Officer\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['field_officer'] ?? '');
                continue;
            }

            if (preg_match('/^(Manager\s*Name\s*:)\s*$/i', $trimmed, $m)) {
                $lines[$index] = $m[1] . ' ' . (string) ($mapping['manager_name'] ?? '');
                continue;
            }

            if (preg_match('/^Installment\s+Amount\s*:\s*LKR/i', $trimmed)) {
                $lines[$index] = 'Installment Amount: LKR ' . (string) ($mapping['installment'] ?? '0.00');
                continue;
            }

            if (preg_match('/^Payment\s+Frequency\s*:\s*$/i', $trimmed)) {
                $lines[$index] = 'Payment Frequency: ' . (string) ($mapping['refund_option'] ?? '');
                continue;
            }

            if (preg_match('/^Number\s+of\s+Installments\s*:\s*$/i', $trimmed)) {
                $lines[$index] = 'Number of Installments: ' . (string) ($mapping['terms_count'] ?? '');
                continue;
            }

            if (preg_match('/^Start\s+Date\s*:/i', $trimmed)) {
                $issueDate = (string) ($mapping['issue_date'] ?? '');
                $formattedDate = $issueDate;
                if ($issueDate !== '' && strtotime($issueDate) !== false) {
                    $formattedDate = date('d / m / Y', strtotime($issueDate));
                }
                $lines[$index] = 'Start Date: ' . ($formattedDate !== '' ? $formattedDate : '___ / ___ / ______');
                continue;
            }

            if (preg_match('/^Payments\s+shall\s+be\s+made\s+to\s*:\s*$/i', $trimmed)) {
                $lines[$index] = 'Payments shall be made to: ' . (string) ($mapping['lender_name'] ?? '');
                continue;
            }

            if (preg_match('/^A\s+late\s+fee\s+of\s+LKR/i', $trimmed)) {
                $lines[$index] = 'A late fee of LKR 0.00 or 0% will be charged.';
                continue;
            }

            if (str_contains(mb_strtolower($trimmed), 'installment of lkr') && str_contains(mb_strtolower($trimmed), 'was due on')) {
                $lines[$index] = 'According to our agreement, your installment of LKR ' . (string) ($mapping['installment'] ?? '0.00') . ' was due on ' . (string) ($mapping['due_date'] ?? $mapping['next_payment_date'] ?? '') . '.';
                continue;
            }

            if (preg_match('/^Please\s+contact\s+us\s+at\s*:?\s*$/i', $trimmed)) {
                $contactBits = array_filter([
                    (string) ($mapping['company_phone'] ?? $mapping['lender_phone'] ?? ''),
                    (string) ($mapping['company_email'] ?? ''),
                ], fn ($v) => trim((string) $v) !== '');
                $lines[$index] = 'Please contact us at: ' . (count($contactBits) > 0 ? implode(' | ', $contactBits) : '');
                continue;
            }

            if (preg_match('/^Branch\s*:\s*$/i', $trimmed)) {
                $lines[$index] = 'Branch: ' . (string) ($mapping['center_name'] ?? $mapping['route_name'] ?? '');
                continue;
            }

            if (str_contains($trimmed, '[Due / Overdue by days]')) {
                $statusText = (string) ($mapping['payment_status_text'] ?? 'Due');
                $lines[$index] = str_replace('[Due / Overdue by days]', $statusText, $trimmed);
                continue;
            }
        }

        $filledText = implode("\n", $lines);
        $filledText = str_replace('[Due / Overdue by days]', (string) ($mapping['payment_status_text'] ?? 'Due'), $filledText);

        return (string) $filledText;
    }

    private function applyMappingToHtml(string $html, array $mapping): string
    {
        $updated = $html;

        foreach ($mapping as $key => $value) {
            if (!is_string($value)) {
                continue;
            }

            $escapedKey = preg_quote((string) $key, '/');
            $updated = preg_replace('/\{\{\s*' . $escapedKey . '\s*\}\}/', $value, (string) $updated);
            $updated = preg_replace('/\$\{\s*' . $escapedKey . '\s*\}/', $value, (string) $updated);
        }

        // Apply the same underscore-based replacements to AI HTML just before PDF rendering.
        $updated = $this->applyMappingToTemplateText((string) $updated, $mapping);

        return (string) $updated;
    }

    private function buildTemplateFaithfulPdfHtml(string $filledTemplateText, string $aiInnerHtml): string
    {
        $lines = preg_split('/\R/', (string) $filledTemplateText) ?: [];
        $chunks = [];

        foreach ($lines as $line) {
            $trimmed = trim((string) $line);

            if ($trimmed === '') {
                $chunks[] = '<div class="spacer"></div>';
                continue;
            }

            if (preg_match('/^LOAN\s+AGREEMENT$/i', $trimmed)) {
                $chunks[] = '<h1 class="title">' . e($trimmed) . '</h1>';
                continue;
            }

            if (preg_match('/^BETWEEN\s*:?$/i', $trimmed)) {
                $chunks[] = '<h2 class="section-title">' . e($trimmed) . '</h2>';
                continue;
            }

            if (preg_match('/^\d+\./', $trimmed)) {
                $chunks[] = '<h3 class="clause-title">' . e($trimmed) . '</h3>';
                continue;
            }

            if (preg_match('/^(Lender|Borrower)\s*:\s*$/i', $trimmed)) {
                $chunks[] = '<p class="party-label"><strong>' . e($trimmed) . '</strong></p>';
                continue;
            }

            if (preg_match('/^(Name|Address|NIC\/Company\s*No|Customer\s*No|Loan\s*Code|Amount|Installment\s*Amount|Payment\s*Frequency|Number\s*of\s*Installments|Start\s*Date|Date|Witness\s*\d+|Lender\s*Signature|Borrower\s*Signature)\s*:/i', $trimmed)) {
                $chunks[] = '<p class="label-line">' . e($trimmed) . '</p>';
                continue;
            }

            $chunks[] = '<p class="body-line">' . e($trimmed) . '</p>';
        }

        $docLikeContent = implode("\n", $chunks);
        $bodyContent = trim($aiInnerHtml) !== '' ? $aiInnerHtml : $docLikeContent;

        return '<!doctype html><html><head><meta charset="UTF-8"><style>@page{margin:26px 34px;}body{font-family:"Times New Roman", DejaVu Serif, serif;font-size:12pt;line-height:1.5;color:#000;} .title{text-align:center;font-size:24pt;font-weight:700;margin:0 0 16px 0;letter-spacing:0.3px;} .section-title{font-size:15pt;font-weight:700;margin:16px 0 8px 0;text-transform:uppercase;} .clause-title{font-size:13.2pt;font-weight:700;margin:14px 0 6px 0;} .party-label{margin:8px 0 2px 0;} .label-line{margin:2px 0 6px 0;} .body-line{margin:0 0 7px 0;text-align:justify;} .spacer{height:9px;} p{orphans:3;widows:3;} h1,h2,h3{page-break-after:avoid;} </style></head><body>' . $bodyContent . '</body></html>';
    }

    private function buildFallbackAgreementHtml(string $templateText, array $mapping): string
    {
        $filledText = $templateText;

        foreach ($mapping as $key => $value) {
            if (!is_string($value)) {
                continue;
            }

            $escapedKey = preg_quote((string) $key, '/');
            $filledText = preg_replace('/\{\{\s*' . $escapedKey . '\s*\}\}/', $value, (string) $filledText);
            $filledText = preg_replace('/\$\{\s*' . $escapedKey . '\s*\}/', $value, (string) $filledText);
        }

        $safeText = nl2br(e((string) $filledText));

        return '<!doctype html><html><head><meta charset="UTF-8"><style>body{font-family: DejaVu Sans, sans-serif; font-size: 12px; line-height: 1.5; margin: 28px; color:#111;} h1{font-size:18px; margin-bottom:16px;} p{margin:0 0 8px;}</style></head><body>' . $safeText . '</body></html>';
    }

        private function buildProfessionalAgreementHtml(array $loanData, ?Company $company, string $templateText, string $aiClauseHtml): string
        {
                $value = function (string $key, string $fallback = 'N/A') use ($loanData): string {
                        $raw = isset($loanData[$key]) ? (string) $loanData[$key] : '';
                        $trimmed = trim($raw);
                        return $trimmed !== '' ? e($trimmed) : e($fallback);
                };

                $companyName = $company ? (string) ($company->name ?? '') : '';
                $companyAddress = $company ? (string) ($company->address ?? '') : '';
                $companyPhone = $company ? (string) ($company->phone ?? '') : '';

                $lenderName = trim($companyName) !== '' ? e($companyName) : 'Microfinance Company';
                $lenderAddress = trim($companyAddress) !== '' ? e($companyAddress) : 'Company Address';
                $lenderPhone = trim($companyPhone) !== '' ? e($companyPhone) : 'N/A';

                $safeAiClauseHtml = trim($aiClauseHtml);
                if ($safeAiClauseHtml === '') {
                        $safeAiClauseHtml = '<p>The Borrower agrees to repay the loan in scheduled installments, and the Lender may apply applicable charges for late payments as per policy.</p>';
                }

                $templateSnapshot = trim($templateText) !== ''
                        ? nl2br(e(mb_substr($templateText, 0, 2500)))
                        : 'N/A';

                return '<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { margin: 26px 30px; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #111827; line-height: 1.55; }
        .header { border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; }
        .subtitle { font-size: 11px; color: #475569; margin: 0; }
        .section { margin-top: 14px; }
        .section h2 { font-size: 14px; margin: 0 0 8px 0; color: #0f172a; border-left: 4px solid #0f766e; padding-left: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: top; }
        th { background: #f1f5f9; text-align: left; width: 34%; font-weight: 700; }
        .note { font-size: 10px; color: #64748b; }
        .signature-wrap { margin-top: 28px; }
        .signature-table td { border: none; width: 50%; padding: 18px 10px 0 0; }
        .line { border-top: 1px solid #1f2937; margin-top: 30px; padding-top: 4px; font-size: 11px; }
    </style>
</head>
<body>
    <div class="header">
        <p class="title">Loan Agreement</p>
        <p class="subtitle">This agreement is made on ' . $value('issue_date') . ' between the Lender and Borrower named below.</p>
    </div>

    <div class="section">
        <h2>1. Parties</h2>
        <table>
            <tr><th>Lender Name</th><td>' . $lenderName . '</td></tr>
            <tr><th>Lender Address</th><td>' . $lenderAddress . '</td></tr>
            <tr><th>Lender Contact</th><td>' . $lenderPhone . '</td></tr>
            <tr><th>Borrower Name</th><td>' . $value('customer_name') . '</td></tr>
            <tr><th>Borrower NIC</th><td>' . $value('nic') . '</td></tr>
            <tr><th>Borrower Address</th><td>' . $value('address') . '</td></tr>
            <tr><th>Borrower Contact</th><td>' . $value('contact_no') . '</td></tr>
        </table>
    </div>

    <div class="section">
        <h2>2. Loan Details</h2>
        <table>
            <tr><th>Request No</th><td>' . $value('request_no') . '</td></tr>
            <tr><th>Customer No</th><td>' . $value('customer_no') . '</td></tr>
            <tr><th>Loan Code</th><td>' . $value('loan_code') . '</td></tr>
            <tr><th>Principal Amount</th><td>' . $value('principal') . '</td></tr>
            <tr><th>Total Payable</th><td>' . $value('total_payable') . '</td></tr>
            <tr><th>Installment Amount</th><td>' . $value('installment') . '</td></tr>
            <tr><th>Interest Rate</th><td>' . $value('interest_rate') . '% (' . $value('interest_type') . ')</td></tr>
            <tr><th>Terms</th><td>' . $value('terms_count') . ' installments (' . $value('refund_option') . ' basis)</td></tr>
            <tr><th>Route / Center / Group</th><td>' . $value('route_name') . ' / ' . $value('center_name') . ' / ' . $value('group_name') . '</td></tr>
        </table>
    </div>

    <div class="section">
        <h2>3. Agreement Clauses</h2>
        ' . $safeAiClauseHtml . '
    </div>

    <div class="section">
        <h2>4. Template Reference Snapshot</h2>
        <p class="note">For traceability, the source template text excerpt used for AI processing is included below.</p>
        <p>' . $templateSnapshot . '</p>
    </div>

    <div class="signature-wrap">
        <table class="signature-table">
            <tr>
                <td>
                    <div class="line">Authorized Signatory (Lender)</div>
                </td>
                <td>
                    <div class="line">Borrower Signature</div>
                </td>
            </tr>
            <tr>
                <td>
                    <div class="line">Witness 1</div>
                </td>
                <td>
                    <div class="line">Witness 2</div>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>';
        }

    public function buildLoanAgreementVariables(MicrofinanceLoanRequest $loanRequest): array
    {
        $issueDate = $loanRequest->loan_request_date ?: date('Y-m-d');
        $todayDate = date('Y-m-d');
        $routeName = optional($loanRequest->route)->name ?: '-';
        $centerName = optional($loanRequest->center)->name ?: '-';
        $groupName = optional($loanRequest->group)->name ?: '-';
        $totalCollected = (float) $loanRequest->collections()->sum('collected_amount');
        $totalPayable = (float) ($loanRequest->refundable_amount ?: 0);
        $outstandingAmount = max($totalPayable - $totalCollected, 0);

        $dueDate = (string) ($loanRequest->due_date ?: '');
        $overdueDays = 0;
        if ($dueDate !== '' && strtotime($dueDate) !== false) {
            $todayTs = strtotime($todayDate);
            $dueTs = strtotime($dueDate);
            if ($todayTs !== false && $dueTs !== false && $todayTs > $dueTs) {
                $overdueDays = (int) floor(($todayTs - $dueTs) / 86400);
            }
        }

        $paymentStatusText = $overdueDays > 0 ? ('Overdue by ' . $overdueDays . ' days') : 'Due';

        return [
            'customer_name' => (string) ($loanRequest->customer_name ?: ''),
            'customer_no' => (string) ($loanRequest->customer_no ?: ''),
            'loan_code' => $this->resolveLoanReference($loanRequest),
            'reference_no' => (string) ($loanRequest->reference_no ?: ''),
            'nic' => (string) ($loanRequest->nic ?: ''),
            'issue_date' => (string) $issueDate,
            'today_date' => (string) $todayDate,
            'loan_amount' => number_format((float) ($loanRequest->loan_amount ?: 0), 2, '.', ''),
            'principal' => number_format((float) ($loanRequest->loan_amount ?: 0), 2, '.', ''),
            'refundable_amount' => number_format((float) ($loanRequest->refundable_amount ?: 0), 2, '.', ''),
            'total_payable' => number_format($totalPayable, 2, '.', ''),
            'total_collected' => number_format($totalCollected, 2, '.', ''),
            'installment' => number_format((float) ($loanRequest->installment_amount ?: 0), 2, '.', ''),
            'interest_rate' => number_format((float) ($loanRequest->interest_rate ?: 0), 2, '.', ''),
            'interest_type' => (string) ($loanRequest->interest_type ?: ''),
            'terms_count' => (string) ($loanRequest->terms_count ?: ''),
            'refund_option' => (string) ($loanRequest->refund_option ?: ''),
            'address' => (string) ($loanRequest->address ?: ''),
            'contact_no' => (string) ($loanRequest->contact_no ?: ''),
            'manager_name' => (string) ($loanRequest->manager_name ?: ''),
            'field_officer' => (string) ($loanRequest->field_officer ?: ''),
            'group_leader' => (string) ($loanRequest->group_leader ?: ''),
            'route_name' => (string) $routeName,
            'center_name' => (string) $centerName,
            'group_name' => (string) $groupName,
            'request_no' => (string) ($loanRequest->id ?: ''),
            'reason' => (string) ($loanRequest->reason ?: ''),
            'status' => (string) ($loanRequest->status ?: ''),
            'due_date' => (string) ($loanRequest->due_date ?: ''),
            'next_payment_date' => (string) ($loanRequest->next_payment_date ?: ''),
            'loan_end_date' => (string) ($loanRequest->loan_end_date ?: ''),
            'arrears_balance' => number_format((float) ($loanRequest->arrears_balance ?: 0), 2, '.', ''),
            'outstanding_amount' => number_format($outstandingAmount, 2, '.', ''),
            'overdue_days' => (string) $overdueDays,
            'payment_status_text' => (string) $paymentStatusText,
        ];
    }

    public function extractPlaceholdersFromDocx(string $docxPath): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($docxPath) !== true) {
            return [];
        }

        $placeholders = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entryName = $zip->getNameIndex($i);
            if (!$entryName || !str_starts_with($entryName, 'word/') || !str_ends_with($entryName, '.xml')) {
                continue;
            }

            $content = $zip->getFromIndex($i);
            if (!is_string($content) || $content === '') {
                continue;
            }

            // Extract standard {{field}} and ${field} patterns
            if (preg_match_all('/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_]+)\s*\}/', $content, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $match) {
                    $key = $match[1] !== '' ? $match[1] : $match[2];
                    if ($key !== '') {
                        $placeholders[$key] = true;
                    }
                }
            }
        }

        $zip->close();
        return $placeholders;
    }

    private function mapPlaceholdersWithOpenAi(array $placeholders, array $loanData): array
    {
        $mapping = [];

        // Seed mapping from all available loan data so replacement works even if placeholder extraction is incomplete.
        foreach ($loanData as $key => $value) {
            $mapping[$key] = is_scalar($value) ? (string) $value : '';
        }

        // Create mapping for context-based underscore placeholders
        $date = strtotime($loanData['issue_date'] ?? 'now');
        $mapping['day'] = date('j', $date); // Day of month
        $mapping['month'] = date('F', $date); // Full month name
        $mapping['lender_name'] = trim((string) ($mapping['lender_name'] ?? '')) !== ''
            ? (string) $mapping['lender_name']
            : 'Microfinance Company';
        $mapping['lender_address'] = trim((string) ($mapping['lender_address'] ?? '')) !== ''
            ? (string) $mapping['lender_address']
            : 'Company Address';
        $mapping['lender_nic'] = trim((string) ($mapping['lender_nic'] ?? '')) !== ''
            ? (string) $mapping['lender_nic']
            : 'Company Registration No';
        $mapping['borrower_name'] = trim((string) ($mapping['borrower_name'] ?? '')) !== ''
            ? (string) $mapping['borrower_name']
            : (string) ($loanData['customer_name'] ?? '');
        $mapping['borrower_address'] = trim((string) ($mapping['borrower_address'] ?? '')) !== ''
            ? (string) $mapping['borrower_address']
            : (string) ($loanData['address'] ?? '');
        $mapping['borrower_nic'] = trim((string) ($mapping['borrower_nic'] ?? '')) !== ''
            ? (string) $mapping['borrower_nic']
            : (string) ($loanData['nic'] ?? '');

        $apiKey = (string) env('OPENAI_API_KEY', '');
        if ($apiKey === '') {
            return $mapping;
        }

        // Use OpenAI for any remaining standard placeholders
        $standardPlaceholders = array_filter($placeholders, function($value) {
            return is_bool($value);
        });

        if (count($standardPlaceholders) > 0) {
            $prompt = [
                'task' => 'Map document placeholder keys to values using provided loan data.',
                'rules' => [
                    'Return JSON object only, no markdown.',
                    'Use only these placeholder keys.',
                    'If value is missing, return empty string.',
                ],
                'placeholders' => array_keys($standardPlaceholders),
                'loan_data' => $loanData,
            ];

            try {
                $response = Http::withToken($apiKey)
                    ->timeout(25)
                    ->post('https://api.openai.com/v1/chat/completions', [
                        'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
                        'messages' => [
                            [
                                'role' => 'system',
                                'content' => 'You are a strict JSON mapping assistant.',
                            ],
                            [
                                'role' => 'user',
                                'content' => json_encode($prompt, JSON_UNESCAPED_UNICODE),
                            ],
                        ],
                        'temperature' => 0,
                        'response_format' => ['type' => 'json_object'],
                    ]);

                if ($response->successful()) {
                    $content = (string) data_get($response->json(), 'choices.0.message.content', '');
                    if ($content !== '') {
                        $decoded = json_decode($content, true);
                        if (is_array($decoded)) {
                            foreach ($standardPlaceholders as $placeholder => $value) {
                                if (array_key_exists($placeholder, $decoded)) {
                                    $mapping[$placeholder] = is_scalar($decoded[$placeholder]) ? (string) $decoded[$placeholder] : '';
                                }
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {
                // Keep existing mapping
            }
        }

        return $mapping;
    }

    private function fillDocxTemplate(string $inputPath, string $outputPath, array $mapping): bool
    {
        if (!copy($inputPath, $outputPath)) {
            return false;
        }

        $zip = new \ZipArchive();
        if ($zip->open($outputPath) !== true) {
            return false;
        }

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entryName = $zip->getNameIndex($i);
            if (!$entryName || !str_starts_with($entryName, 'word/') || !str_ends_with($entryName, '.xml')) {
                continue;
            }

            $content = $zip->getFromIndex($i);
            if (!is_string($content) || $content === '') {
                continue;
            }

            // Replace standard {{field}} and ${field} patterns first.
            foreach ($mapping as $pattern => $value) {
                if (!is_string($value)) {
                    continue;
                }

                $escapedPattern = preg_quote((string) $pattern, '/');
                $content = preg_replace('/\{\{\s*' . $escapedPattern . '\s*\}\}/', $value, $content);
                $content = preg_replace('/\$\{\s*' . $escapedPattern . '\s*\}/', $value, $content);
            }

            // Handle context-based underscore patterns with regex replacement
            $patterns = [
                '/(day of)\s+_{3,}/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . ($mapping['day'] ?? '___');
                },
                '/(day of)\s+_{5,}\s+(20)/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . ($mapping['month'] ?? '_______') . ' ' . $matches[2];
                },
                '/(Lender:)\s*(Name:)\s*_{10,}/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . $matches[2] . ' ' . ($mapping['lender_name'] ?? '__________________________');
                },
                '/(Lender:)\s*(Address:)\s*_{10,}/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . $matches[2] . ' ' . ($mapping['lender_address'] ?? '________________________');
                },
                '/(Lender:)\s*(NIC\/Company No:)\s*_{5,}/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . $matches[2] . ' ' . ($mapping['lender_nic'] ?? '________________');
                },
                '/(Borrower:)\s*(Name:)\s*_{10,}/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . $matches[2] . ' ' . ($mapping['borrower_name'] ?? '__________________________');
                },
                '/(Borrower:)\s*(Address:)\s*_{10,}/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . $matches[2] . ' ' . ($mapping['borrower_address'] ?? '________________________');
                },
                '/(Borrower:)\s*(NIC\/Company No:)\s*_{5,}/' => function($matches) use ($mapping) {
                    return $matches[1] . ' ' . $matches[2] . ' ' . ($mapping['borrower_nic'] ?? '________________');
                },
            ];

            foreach ($patterns as $pattern => $replacementCallback) {
                $content = preg_replace_callback($pattern, $replacementCallback, $content);
            }

            $zip->addFromString($entryName, $content);
        }

        $zip->close();
        return true;
    }

    private function shiftByRefundOption(\DateTimeImmutable $date, string $refundOption, int $steps = 1): \DateTimeImmutable
    {
        $safeSteps = max($steps, 0);
        if ($safeSteps === 0) {
            return $date;
        }

        if ($refundOption === 'day') {
            return $date->modify('+' . $safeSteps . ' days');
        }

        if ($refundOption === 'week') {
            return $date->modify('+' . ($safeSteps * 7) . ' days');
        }

        return $date->modify('+' . $safeSteps . ' months');
    }

    private function normalizeAccessText(?string $value): string
    {
        return strtolower(trim((string) $value));
    }

    private function isExecutiveLoanRequester(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        $keywords = ['executive', 'cro', 'credit officer', 'field officer'];

        $designation = $this->normalizeAccessText((string) optional($user->designation)->name);
        foreach ($keywords as $keyword) {
            if ($designation !== '' && str_contains($designation, $keyword)) {
                return true;
            }
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = $this->normalizeAccessText((string) $roleName);
            foreach ($keywords as $keyword) {
                if ($normalized !== '' && str_contains($normalized, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function resolveReportingApproverEmployee(?object $user): ?Employee
    {
        if (!$user) {
            return null;
        }

        $employeeId = (int) ($user->employee_id ?? 0);
        if ($employeeId <= 0) {
            return null;
        }

        $employee = Employee::query()
            ->with(['user:id,employee_id,designation_id,name,email', 'user.designation:id,name', 'user.roles:id,name'])
            ->find($employeeId);

        if (!$employee) {
            return null;
        }

        $reportingPerson = trim((string) ($employee->reporting_person ?? ''));
        if ($reportingPerson === '') {
            return null;
        }

        $reportingEmployeeQuery = Employee::query()
            ->with(['branch:id,name', 'designation:id,name', 'user:id,employee_id,designation_id,name,email', 'user.designation:id,name', 'user.roles:id,name']);

        if (Schema::hasColumn('employees', 'status')) {
            $reportingEmployeeQuery->where('status', 'active');
        }

        $reportingEmployeeQuery->where(function ($query) use ($reportingPerson) {
            $query->whereRaw('LOWER(TRIM(employee_code)) = ?', [mb_strtolower($reportingPerson)])
                ->orWhereRaw('LOWER(TRIM(email)) = ?', [mb_strtolower($reportingPerson)])
                ->orWhereRaw('LOWER(TRIM(CONCAT(first_name, " ", last_name))) = ?', [mb_strtolower($reportingPerson)]);

            if (ctype_digit($reportingPerson)) {
                $query->orWhere('id', (int) $reportingPerson);
            }
        });

        $reportingEmployee = $reportingEmployeeQuery
            ->orderByDesc('id')
            ->first();

        if (!$reportingEmployee) {
            return null;
        }

        $reportingUser = $reportingEmployee->user;
        if (!$reportingUser || !$this->hasLoanApprovalAccess($reportingUser)) {
            return null;
        }

        return $reportingEmployee;
    }

    private function canAssignToRequestedApprover(?object $requester, Employee $candidate): bool
    {
        if ($this->isAdminUser($requester)) {
            return true;
        }

        if (!$this->isExecutiveLoanRequester($requester)) {
            return true;
        }

        $reportingApprover = $this->resolveReportingApproverEmployee($requester);
        if (!$reportingApprover) {
            return false;
        }

        return (int) $reportingApprover->id === (int) $candidate->id;
    }

    private function toApprovalCandidatePayload(object $employee): array
    {
        $candidateUser = $employee->user;

        $fullName = trim((string) (($employee->first_name ?? '') . ' ' . ($employee->last_name ?? '')));
        if ($fullName === '') {
            $fullName = trim((string) ($candidateUser?->name ?? ''));
        }

        return [
            'id' => (int) $employee->id,
            'name' => $fullName,
            'employee_code' => (string) ($employee->employee_code ?? ''),
            'designation' => (string) (optional($employee->designation)->name ?? optional($candidateUser?->designation)->name ?? ''),
            'branch_id' => $employee->branch_id !== null ? (int) $employee->branch_id : null,
            'branch_name' => (string) (optional($employee->branch)->name ?? ''),
            'email' => (string) ($candidateUser?->email ?? ''),
        ];
    }

    private function canReviewLoan(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        return $this->hasLoanApprovalAccess($user);
    }

    private function hasAdministrativeWorkflowOverride(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $keywords = ['super admin', 'superadmin', 'admin', 'managing director', 'md', 'ceo', 'director', 'business owner'];

        $designation = strtolower(trim((string) optional($user->designation)->name));
        if ($designation !== '') {
            foreach ($keywords as $keyword) {
                if (str_contains($designation, $keyword)) {
                    return true;
                }
            }
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized === '') {
                continue;
            }

            foreach ($keywords as $keyword) {
                if (str_contains($normalized, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return array<int, array{allow_all_roles: bool, role_ids: array<int>}>
     */
    private function actionCenterDefaultStepRoleRules(): array
    {
        return [
            1 => ['allow_all_roles' => true, 'role_ids' => []],
            2 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['credit officer'])],
            3 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['branch manager'])],
            4 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            5 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            6 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            7 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            8 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            9 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            10 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            11 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            12 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            13 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            14 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
        ];
    }

    /**
     * @param array<int, string> $keywords
     * @return array<int>
     */
    private function resolveRoleIdsByKeywords(array $keywords): array
    {
        if (count($keywords) === 0) {
            return [];
        }

        $roles = Role::query()->get(['id', 'name']);
        $ids = [];

        foreach ($roles as $role) {
            $name = strtolower(trim((string) $role->name));
            if ($name === '') {
                continue;
            }

            foreach ($keywords as $keyword) {
                if (str_contains($name, strtolower(trim((string) $keyword)))) {
                    $ids[] = (int) $role->id;
                    break;
                }
            }
        }

        return array_values(array_unique(array_filter($ids, fn ($id) => $id > 0)));
    }

    /**
     * @return array{allow_all_roles: bool, role_ids: array<int>}
     */
    private function actionCenterStepRoleRule(int $step): array
    {
        $safeStep = max(1, min(14, $step));
        $defaults = $this->actionCenterDefaultStepRoleRules();
        $fallback = $defaults[$safeStep] ?? ['allow_all_roles' => false, 'role_ids' => []];

        if (!Schema::hasTable('mf_action_center_step_roles')) {
            return $fallback;
        }

        $row = MicrofinanceActionCenterStepRole::query()
            ->where('workflow_step', $safeStep)
            ->first();

        if (!$row) {
            return $fallback;
        }

        $roleIds = array_values(array_unique(array_filter(array_map('intval', (array) ($row->role_ids ?? [])), fn ($id) => $id > 0)));

        return [
            'allow_all_roles' => (bool) ($row->allow_all_roles ?? false),
            'role_ids' => $roleIds,
        ];
    }

    /**
     * @return array<int>
     */
    private function resolveUserRoleIds(?object $user): array
    {
        if (!$user || !method_exists($user, 'roles')) {
            return [];
        }

        return $user->roles()->pluck('roles.id')->map(fn ($id) => (int) $id)->filter(fn ($id) => $id > 0)->unique()->values()->all();
    }

    private function userHasActionCenterStepAccess(?object $user, int $step): bool
    {
        if (!$user) {
            return false;
        }

        if ($this->hasAdministrativeWorkflowOverride($user)) {
            return true;
        }

        $rule = $this->actionCenterStepRoleRule($step);
        if (!empty($rule['allow_all_roles'])) {
            return true;
        }

        $allowedRoleIds = $rule['role_ids'] ?? [];
        if (count($allowedRoleIds) === 0) {
            return false;
        }

        $userRoleIds = $this->resolveUserRoleIds($user);
        if (count($userRoleIds) === 0) {
            return false;
        }

        return count(array_intersect($allowedRoleIds, $userRoleIds)) > 0;
    }

    /**
     * @return array<int>
     */
    private function allowedActionCenterStepsForUser(?object $user): array
    {
        if (!$user) {
            return [];
        }

        if ($this->hasAdministrativeWorkflowOverride($user)) {
            return range(1, 14);
        }

        $allowed = [];
        for ($step = 1; $step <= 14; $step++) {
            if ($this->userHasActionCenterStepAccess($user, $step)) {
                $allowed[] = $step;
            }
        }

        return $allowed;
    }

    private function canCreditOfficerHandlePendingCallConfirmation(?object $user, MicrofinanceLoanRequest $loanRequest): bool
    {
        return $this->canPerformConfiguredStepAction($user, $loanRequest, 2);
    }

    private function canCreditOfficerSendBack(?object $user, MicrofinanceLoanRequest $loanRequest): bool
    {
        return $this->canPerformConfiguredStepAction($user, $loanRequest, 2);
    }

    private function canCreditOfficerAdvanceStepOne(?object $user, MicrofinanceLoanRequest $loanRequest): bool
    {
        if (!$user) {
            return false;
        }

        if ($this->canLoanRequesterAdvanceStepOne($user, $loanRequest)) {
            return true;
        }

        return $this->canPerformConfiguredStepAction($user, $loanRequest, 1);
    }

    private function canPerformConfiguredStepAction(?object $user, MicrofinanceLoanRequest $loanRequest, int $step): bool
    {
        if (!$user) {
            return false;
        }

        if ($this->hasAdministrativeWorkflowOverride($user)) {
            return true;
        }

        if (!$this->userHasActionCenterStepAccess($user, $step)) {
            return false;
        }

        if (!in_array((string) ($loanRequest->status ?? ''), ['requested', 'hold'], true)) {
            return false;
        }

        $viewerBranchId = $this->resolveUserBranchId($user);
        if ($viewerBranchId <= 0) {
            return false;
        }

        if ((int) ($loanRequest->branch_id ?? 0) !== $viewerBranchId) {
            return false;
        }

        return $this->resolveWorkflowStep($loanRequest) === $step;
    }

    private function resolveUserBranchId(?object $user): int
    {
        $directBranchId = (int) ($user?->branch_id ?? 0);
        if ($directBranchId > 0) {
            return $directBranchId;
        }

        $directEmployeeId = (int) ($user?->employee_id ?? 0);
        if ($directEmployeeId > 0) {
            $employeeBranchId = (int) (Employee::query()->where('id', $directEmployeeId)->value('branch_id') ?? 0);
            if ($employeeBranchId > 0) {
                return $employeeBranchId;
            }
        }

        $userId = (int) ($user?->id ?? 0);
        if ($userId > 0) {
            $employeeByUserIdBranchId = (int) (Employee::query()->where('user_id', $userId)->orderByDesc('id')->value('branch_id') ?? 0);
            if ($employeeByUserIdBranchId > 0) {
                return $employeeByUserIdBranchId;
            }
        }

        $email = strtolower(trim((string) ($user?->email ?? '')));
        if ($email !== '') {
            $employeeByEmailBranchId = (int) (Employee::query()
                ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
                ->orderByDesc('id')
                ->value('branch_id') ?? 0);
            if ($employeeByEmailBranchId > 0) {
                return $employeeByEmailBranchId;
            }
        }

        return 0;
    }

    private function canLoanRequesterAdvanceStepOne(?object $user, MicrofinanceLoanRequest $loanRequest): bool
    {
        if (!$user) {
            return false;
        }

        $userId = (int) ($user->id ?? 0);
        if ($userId <= 0) {
            return false;
        }

        if ((int) ($loanRequest->created_by ?? 0) !== $userId) {
            return false;
        }

        if (!in_array((string) ($loanRequest->status ?? ''), ['requested', 'hold'], true)) {
            return false;
        }

        return $this->resolveWorkflowStep($loanRequest) === 1;
    }

    private function hasLoanApprovalAccess(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $allowedKeywords = ['loan approver', 'finance manager', 'branch manager', 'managing director', 'ceo', 'director', 'business owner', 'admin', 'super admin'];

        $designationName = strtolower((string) optional($user->designation)->name);
        foreach ($allowedKeywords as $keyword) {
            if ($designationName !== '' && str_contains($designationName, $keyword)) {
                return true;
            }
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        $roleNames = $user->roles()->pluck('name')->map(function ($name) {
            return strtolower((string) $name);
        });

        foreach ($roleNames as $roleName) {
            foreach ($allowedKeywords as $keyword) {
                if ($roleName !== '' && str_contains($roleName, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function hasSpecialLoanRequestPermission(?object $user): bool
    {
        if ($this->hasLoanApprovalAccess($user)) {
            return true;
        }

        if (!$user) {
            return false;
        }

        $designationName = strtolower(trim((string) optional($user->designation)->name));
        if ($designationName !== '' && str_contains($designationName, 'special permission')) {
            return true;
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized !== '' && str_contains($normalized, 'special permission')) {
                return true;
            }
        }

        return false;
    }

    private function hasProfileValue(mixed $value): bool
    {
        if ($value === null) {
            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        if (is_numeric($value)) {
            return true;
        }

        if (is_bool($value)) {
            return true;
        }

        if (is_array($value)) {
            return count($value) > 0;
        }

        return !empty($value);
    }

    private function calculateCustomerProfileCompletionScore(Customer $customer): int
    {
        $details = is_array($customer->additional_details) ? $customer->additional_details : [];
        $identity = is_array($details['identity'] ?? null) ? $details['identity'] : [];
        $contact = is_array($details['contact'] ?? null) ? $details['contact'] : [];
        $residence = is_array($details['residence'] ?? null) ? $details['residence'] : [];
        $employment = is_array($details['employment'] ?? null) ? $details['employment'] : [];
        $family = is_array($details['family_information'] ?? null) ? $details['family_information'] : [];
        $banking = is_array($details['banking_relationships'] ?? null) ? $details['banking_relationships'] : [];
        $risk = is_array($details['risk_assessment'] ?? null) ? $details['risk_assessment'] : [];
        $residenceEnvironment = is_array($details['residence_environment'] ?? null) ? $details['residence_environment'] : [];
        $relationals = is_array($family['relationals'] ?? null) ? $family['relationals'] : [];

        $fullName = trim(((string) ($customer->first_name ?? '')) . ' ' . ((string) ($customer->last_name ?? '')));

        $checks = [
            $this->hasProfileValue($customer->customer_code),
            $this->hasProfileValue($identity['full_name_with_initials'] ?? null) || $this->hasProfileValue($fullName),
            $this->hasProfileValue($customer->phone),
            $this->hasProfileValue($customer->nic_passport) || $this->hasProfileValue($customer->old_nic),
            $this->hasProfileValue($customer->current_address) || $this->hasProfileValue($customer->permanent_address) || $this->hasProfileValue($residence['current_address'] ?? null),
            $this->hasProfileValue($contact['second_mobile'] ?? null),
            $this->hasProfileValue($contact['office_phone'] ?? null),
            $this->hasProfileValue($contact['whatsapp_number'] ?? null),
            $this->hasProfileValue($contact['emergency_contact'] ?? null),
            $this->hasProfileValue($contact['preferred_communication_method'] ?? null),
            $this->hasProfileValue($employment['employment_type'] ?? null),
            $this->hasProfileValue($employment['employer_name'] ?? null),
            $this->hasProfileValue($employment['monthly_salary'] ?? null),
            count($relationals) > 0,
            $this->hasProfileValue($banking['primary_bank_name'] ?? null),
            $this->hasProfileValue($risk['total_score'] ?? null),
            ((int) ($residenceEnvironment['images_count'] ?? 0)) > 0,
        ];

        $completed = count(array_filter($checks, fn ($value) => $value));
        return (int) round(($completed / max(count($checks), 1)) * 100);
    }

    private function calculateCustomerDocumentCompletionScore(Customer $customer): int
    {
        $details = is_array($customer->additional_details) ? $customer->additional_details : [];
        $employment = is_array($details['employment'] ?? null) ? $details['employment'] : [];
        $business = is_array($details['business_information'] ?? null) ? $details['business_information'] : [];
        $residenceEnvironment = is_array($details['residence_environment'] ?? null) ? $details['residence_environment'] : [];

        $checks = [
            ((int) ($employment['paysheet_files_count'] ?? 0)) > 0,
            ((int) ($employment['bank_statement_files_count'] ?? 0)) > 0,
            ((int) ($employment['epf_report_files_count'] ?? 0)) > 0,
            ((int) ($employment['tax_return_files_count'] ?? 0)) > 0,
            ((int) ($business['business_documents_count'] ?? 0)) > 0,
            ((int) ($residenceEnvironment['images_count'] ?? 0)) > 0,
        ];

        $completed = count(array_filter($checks, fn ($value) => $value));
        return (int) round(($completed / max(count($checks), 1)) * 100);
    }

    private function hasReleasedLoanActionAccess(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $allowedKeywords = ['finance manager', 'branch manager', 'managing director', 'admin'];

        $designationName = strtolower((string) optional($user->designation)->name);
        foreach ($allowedKeywords as $keyword) {
            if ($designationName !== '' && str_contains($designationName, $keyword)) {
                return true;
            }
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        $roleNames = $user->roles()->pluck('name')->map(function ($name) {
            return strtolower((string) $name);
        });

        foreach ($roleNames as $roleName) {
            foreach ($allowedKeywords as $keyword) {
                if ($roleName !== '' && str_contains($roleName, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function canEditLoanRequest(?object $user, MicrofinanceLoanRequest $loanRequest): bool
    {
        if ($this->hasReleasedLoanActionAccess($user)) {
            return true;
        }

        if (!$user) {
            return false;
        }

        $status = strtolower(trim((string) ($loanRequest->status ?? '')));
        if ($status !== 'hold') {
            return false;
        }

        $userId = (int) ($user->id ?? 0);
        $userEmployeeId = (int) ($user->employee_id ?? 0);
        $createdByUserId = (int) ($loanRequest->created_by ?? 0);
        $assignedEmployeeId = (int) ($loanRequest->approval_employee_id ?? 0);

        if ($userId > 0 && $userId === $createdByUserId) {
            return true;
        }

        if ($userEmployeeId > 0 && $userEmployeeId === $assignedEmployeeId) {
            return true;
        }

        return false;
    }

    private function canRemoveLoan(?object $user): bool
    {
        return $user !== null
            && method_exists($user, 'isSystemAdmin')
            && $user->isSystemAdmin();
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

    private function scopedBranchId(Request $request): ?int
    {
        if ($this->isAdminUser($request->user())) {
            return null;
        }

        $branchId = $this->resolveUserBranchId($request->user());
        return $branchId > 0 ? $branchId : null;
    }

    public function index(Request $request)
    {
        $status = $request->get('status');
        $branchId = (int)$request->get('branch_id', 0);
        $fieldOfficer = trim((string)$request->get('field_officer', ''));
        $viewer = $request->user();

        $query = MicrofinanceLoanRequest::with([
            'branch:id,name',
            'approvalEmployee:id,first_name,last_name',
            'createdBy:id,name,email,employee_id,branch_id',
            'createdBy.employee:id,first_name,last_name,employee_code,branch_id',
            'route:id,name,code',
            'center:id,name,code,meeting_day',
            'group:id,name,code',
            'guarantors',
            'documents',
        ])
            ->withMax('collections as last_pay_date', 'collection_date')
            ->orderBy('id', 'desc');

        if ($status) {
            $statusValues = [];

            if (is_array($status)) {
                foreach ($status as $rawStatus) {
                    $normalized = strtolower(trim((string) $rawStatus));
                    if ($normalized !== '') {
                        $statusValues[] = $normalized;
                    }
                }
            } else {
                $parts = explode(',', (string) $status);
                foreach ($parts as $rawStatus) {
                    $normalized = strtolower(trim((string) $rawStatus));
                    if ($normalized !== '') {
                        $statusValues[] = $normalized;
                    }
                }
            }

            $statusValues = array_values(array_unique($statusValues));

            if (count($statusValues) === 1) {
                $query->where('status', $statusValues[0]);
            } elseif (count($statusValues) > 1) {
                $query->whereIn('status', $statusValues);
            }
        }

        $scopedBranchId = $this->scopedBranchId($request);
        if ($scopedBranchId !== null) {
            $query->where('branch_id', $scopedBranchId);
        } elseif ($branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        if ($fieldOfficer !== '') {
            $query->whereRaw('LOWER(TRIM(field_officer)) = ?', [mb_strtolower($fieldOfficer)]);
        }

        if (!$this->isAdminUser($viewer)) {
            $viewerUserId = (int) ($viewer?->id ?? 0);
            $viewerEmployeeId = (int) ($viewer?->employee_id ?? 0);
            $viewerBranchId = $this->resolveUserBranchId($viewer);
            $allowedBranchSteps = $this->allowedActionCenterStepsForUser($viewer);
            $hasBranchWorkflowScope = $viewerBranchId > 0 && count($allowedBranchSteps) > 0;

            if ($viewerUserId <= 0 && $viewerEmployeeId <= 0) {
                if (!$hasBranchWorkflowScope) {
                    $query->whereRaw('1 = 0');
                }
            }

            $query->where(function ($scope) use ($viewerUserId, $viewerEmployeeId, $viewerBranchId, $allowedBranchSteps, $hasBranchWorkflowScope) {
                if ($viewerUserId > 0) {
                    $scope->orWhere('created_by', $viewerUserId);
                }

                if ($viewerEmployeeId > 0) {
                    $scope->orWhere('approval_employee_id', $viewerEmployeeId);
                }

                if ($hasBranchWorkflowScope) {
                    $scope->orWhere(function ($branchScope) use ($viewerBranchId, $allowedBranchSteps) {
                        $branchScope->where('branch_id', $viewerBranchId);

                        if (count($allowedBranchSteps) > 0) {
                            $branchScope->whereIn('workflow_step', $allowedBranchSteps);
                        }
                    });
                }
            });
        }

        $loans = $query->get();

        $loans->each(function (MicrofinanceLoanRequest $loan) use ($viewer) {
            $currentStep = $this->resolveWorkflowStep($loan);
            $canConfiguredStepAction = $this->canPerformConfiguredStepAction($viewer, $loan, $currentStep);
            $canRequesterAdvance = $this->canLoanRequesterAdvanceStepOne($viewer, $loan);
            $canCreditOfficerMarkCalled = $this->canCreditOfficerHandlePendingCallConfirmation($viewer, $loan);
            $canCreditOfficerSendBack = $this->canCreditOfficerSendBack($viewer, $loan);
            $loan->setAttribute('can_advance_workflow', $canConfiguredStepAction || $canRequesterAdvance);
            $loan->setAttribute('can_send_back_workflow', $canCreditOfficerSendBack);
            $loan->setAttribute('can_mark_called_workflow', $canCreditOfficerMarkCalled);
        });

        $this->attachCustomerPhotoUrls($loans);

        return response()->json($loans);
    }

    private function attachCustomerPhotoUrls($loans): void
    {
        if ($loans->isEmpty()) {
            return;
        }

        $customerCodes = $loans
            ->map(fn ($loan) => strtoupper(trim((string) $loan->customer_no)))
            ->filter()
            ->unique()
            ->values();

        $nics = $loans
            ->map(fn ($loan) => trim((string) $loan->nic))
            ->filter()
            ->unique()
            ->values();

        $customersByReference = collect();
        if ($customerCodes->isNotEmpty()) {
            $customersByCode = Customer::query()
                ->whereIn(DB::raw('UPPER(customer_code)'), $customerCodes->all())
                ->whereNotNull('photo_path')
                ->orderByDesc('id')
                ->get()
                ->unique(fn (Customer $customer) => strtoupper((string) $customer->customer_code))
                ->keyBy(fn (Customer $customer) => strtoupper((string) $customer->customer_code));

            $customersByReference = $customersByReference->merge($customersByCode);

            $accounts = SavingsAccount::query()
                ->with(['customer:id,customer_code,photo_path'])
                ->where('account_type', 'investment')
                ->whereIn(DB::raw('UPPER(account_number)'), $customerCodes->all())
                ->get();

            foreach ($accounts as $account) {
                $customer = $account->customer;
                if (!$customer || empty($customer->photo_path)) {
                    continue;
                }

                $accountNumber = strtoupper(trim((string) ($account->account_number ?? '')));
                if ($accountNumber !== '') {
                    $customersByReference->put($accountNumber, $customer);
                }
            }
        }

        $customersByNic = collect();
        if ($nics->isNotEmpty()) {
            $customersByNic = Customer::query()
                ->whereIn('nic_passport', $nics->all())
                ->whereNotNull('photo_path')
                ->orderByDesc('id')
                ->get()
                ->unique('nic_passport')
                ->keyBy('nic_passport');
        }

        foreach ($loans as $loan) {
            $loan->setAttribute(
                'customer_photo_url',
                $this->resolveLoanCustomerPhotoUrl($loan, $customersByReference, $customersByNic)
            );
        }
    }

    private function resolveLoanCustomerPhotoUrl(
        MicrofinanceLoanRequest $loan,
        $customersByReference,
        $customersByNic
    ): ?string {
        foreach ($loan->documents as $document) {
            if (stripos((string) $document->document_type, 'customer photo') === false) {
                continue;
            }

            if (!$document->file_path) {
                continue;
            }

            return $document->file_url;
        }

        $customerReference = strtoupper(trim((string) $loan->customer_no));
        if ($customerReference !== '' && $customersByReference->has($customerReference)) {
            return $customersByReference->get($customerReference)?->photo_url;
        }

        $nic = trim((string) $loan->nic);
        if ($nic !== '' && $customersByNic->has($nic)) {
            return $customersByNic->get($nic)?->photo_url;
        }

        return null;
    }

    public function customerProfile(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $scopedBranchId = $this->scopedBranchId($request);
        if ($scopedBranchId !== null && (int) ($loanRequest->branch_id ?? 0) !== (int) $scopedBranchId) {
            return response()->json([
                'message' => 'Loan request not found for current branch scope.'
            ], 404);
        }

        $customerCode = strtoupper(trim((string) ($loanRequest->customer_no ?? '')));
        $loanNic = strtoupper(trim((string) ($loanRequest->nic ?? '')));

        $customerQuery = Customer::query()->with(['documents' => function ($query) {
            $query->latest();
        }]);

        if ($customerCode !== '' && $loanNic !== '') {
            $customerQuery->where(function ($query) use ($customerCode, $loanNic) {
                $query->whereRaw('UPPER(customer_code) = ?', [$customerCode])
                    ->orWhereHas('savingsAccounts', function ($accountQuery) use ($customerCode) {
                        $accountQuery->where('account_type', 'investment')
                            ->whereRaw('UPPER(account_number) = ?', [$customerCode]);
                    })
                    ->orWhereRaw('UPPER(nic_passport) = ?', [$loanNic])
                    ->orWhereRaw('UPPER(old_nic) = ?', [$loanNic]);
            });
        } elseif ($customerCode !== '') {
            $customerQuery->where(function ($query) use ($customerCode) {
                $query->whereRaw('UPPER(customer_code) = ?', [$customerCode])
                    ->orWhereHas('savingsAccounts', function ($accountQuery) use ($customerCode) {
                        $accountQuery->where('account_type', 'investment')
                            ->whereRaw('UPPER(account_number) = ?', [$customerCode]);
                    });
            });
        } elseif ($loanNic !== '') {
            $customerQuery->where(function ($query) use ($loanNic) {
                $query->whereRaw('UPPER(nic_passport) = ?', [$loanNic])
                    ->orWhereRaw('UPPER(old_nic) = ?', [$loanNic]);
            });
        } else {
            return response()->json([
                'found' => false,
                'message' => 'Customer reference not available in this loan request.',
                'customer' => null,
                'customer_documents' => [],
            ]);
        }

        $customer = $customerQuery->orderByDesc('id')->first();
        if (!$customer) {
            return response()->json([
                'found' => false,
                'message' => 'Customer record not found for this loan request.',
                'customer' => null,
                'customer_documents' => [],
            ]);
        }

        $customerDocuments = $customer->documents->map(function ($document) {
            $rawPath = (string) ($document->file_path ?? '');
            $normalizedPath = ltrim(preg_replace('/^public\//', '', $rawPath) ?? $rawPath, '/');
            $fileUrl = $normalizedPath !== '' ? asset('storage/' . $normalizedPath) : null;

            return [
                'id' => (int) $document->id,
                'document_type' => (string) ($document->document_type ?? ''),
                'file_path' => $rawPath,
                'original_name' => (string) ($document->original_name ?? ''),
                'file_url' => $fileUrl,
                'uploaded_by' => (int) ($document->uploaded_by ?? 0),
                'created_at' => optional($document->created_at)?->toISOString(),
            ];
        })->values();

        $customerPayload = $customer->toArray();
        $customerPayload['photo_url'] = $customer->photo_url;

        return response()->json([
            'found' => true,
            'customer' => $customerPayload,
            'customer_documents' => $customerDocuments,
        ]);
    }

    public function meta(Request $request)
    {
        $scope = $request->get('loan_scope', 'center_loan');
        $routeId = (int)$request->get('mf_route_id');
        $centerId = (int)$request->get('mf_center_id');

        if (!in_array($scope, ['route_loan', 'center_loan', 'direct_loan'], true)) {
            return response()->json(['message' => 'Invalid loan scope.'], 422);
        }

        if ($scope === 'route_loan' && !$routeId) {
            return response()->json([
                'customer_no' => null,
                'registered_customer_count' => 0,
                'issued_loan_count' => 0,
            ]);
        }

        if ($scope === 'center_loan' && (!$routeId || !$centerId)) {
            return response()->json([
                'customer_no' => null,
                'registered_customer_count' => 0,
                'issued_loan_count' => 0,
            ]);
        }

        $query = MicrofinanceLoanRequest::query()->where('loan_scope', $scope);
        $codePrefix = 'DL';

        $scopedBranchId = $this->scopedBranchId($request);
        if ($scopedBranchId !== null) {
            $query->where('branch_id', $scopedBranchId);
        }

        if ($scope === 'route_loan') {
            $route = MicrofinanceRoute::find($routeId);
            if (!$route) {
                return response()->json(['message' => 'Invalid route.'], 422);
            }

            $query->where('mf_route_id', $routeId);
            $codePrefix = sprintf('RL-%s', strtoupper($route->code));
        }

        if ($scope === 'center_loan') {
            $route = MicrofinanceRoute::find($routeId);
            $center = MicrofinanceCenter::find($centerId);

            if (!$route || !$center) {
                return response()->json(['message' => 'Invalid route or center.'], 422);
            }

            $query->where('mf_route_id', $routeId)
                ->where('mf_center_id', $centerId);

            $codePrefix = sprintf('CL-%s-%s', strtoupper($route->code), strtoupper($center->code));
        }

        $loanCount = (clone $query)->count();
        $issuedLoanCount = (clone $query)->where('status', 'released')->count();

        $customerNo = sprintf('%s-L%04d', $codePrefix, $loanCount + 1);
        $registeredCustomerCount = $loanCount;

        return response()->json([
            'reference_no' => $customerNo,
            'customer_no' => $customerNo,
            'registered_customer_count' => $registeredCustomerCount,
            'issued_loan_count' => $issuedLoanCount,
        ]);
    }

    public function approvalCandidates(Request $request)
    {
        $user = $request->user();
        if (!$this->canReviewLoan($user)) {
            return response()->json([
                'message' => 'Only Loan Approver, Finance Manager, Branch Manager, and Admin can request additional approvals.'
            ], 403);
        }

        $isSystemAdmin = method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin();
        $viewerBranchId = (int) ($user->branch_id ?? 0);

        $employeeQuery = Employee::query()
            ->with([
                'branch:id,name',
                'designation:id,name',
                'user:id,employee_id,branch_id,designation_id,name,email',
                'user.designation:id,name',
                'user.roles:id,name',
            ])
            ->orderBy('first_name')
            ->orderBy('last_name');

        if (\Illuminate\Support\Facades\Schema::hasColumn('employees', 'status')) {
            $employeeQuery->where('status', 'active');
        }

        if (!$isSystemAdmin && $viewerBranchId > 0) {
            $employeeQuery->where('branch_id', $viewerBranchId);
        }

        if (!$isSystemAdmin && $this->isExecutiveLoanRequester($user)) {
            $reportingApprover = $this->resolveReportingApproverEmployee($user);
            if (!$reportingApprover) {
                return response()->json([
                    'data' => [],
                    'message' => 'Reporting person approver is not configured for this executive account.',
                ]);
            }

            return response()->json([
                'data' => [$this->toApprovalCandidatePayload($reportingApprover)],
            ]);
        }

        $rows = $employeeQuery->get();

        $candidates = [];
        foreach ($rows as $employee) {
            $candidateUser = $employee->user;
            if (!$candidateUser || !$this->hasLoanApprovalAccess($candidateUser)) {
                continue;
            }

            $candidates[] = $this->toApprovalCandidatePayload($employee);
        }

        return response()->json([
            'data' => $candidates,
        ]);
    }

    public function requestApproval(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $user = $request->user();
        if (!$this->canReviewLoan($user)) {
            return response()->json([
                'message' => 'Only Loan Approver, Finance Manager, Branch Manager, and Admin can request additional approvals.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can be reassigned for approval.'
            ], 422);
        }

        $validated = $request->validate([
            'approval_employee_id' => 'required|exists:employees,id',
        ]);

        $approvalEmployee = Employee::query()
            ->with(['user:id,employee_id,branch_id,designation_id,name,email', 'user.designation:id,name', 'user.roles:id,name'])
            ->findOrFail((int) $validated['approval_employee_id']);

        $approvalUser = $approvalEmployee->user;
        if (!$approvalUser || !$this->hasLoanApprovalAccess($approvalUser)) {
            return response()->json([
                'message' => 'Selected employee does not have loan approval access.'
            ], 422);
        }

        if (!$this->canAssignToRequestedApprover($user, $approvalEmployee)) {
            return response()->json([
                'message' => 'Executive users can submit approval only to their configured reporting person.'
            ], 422);
        }

        $isRequesterSystemAdmin = method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin();
        $isCandidateSystemAdmin = method_exists($approvalUser, 'isSystemAdmin') && $approvalUser->isSystemAdmin();

        if (
            !$isRequesterSystemAdmin &&
            !$isCandidateSystemAdmin &&
            $loanRequest->branch_id !== null &&
            (int) $approvalEmployee->branch_id !== (int) $loanRequest->branch_id
        ) {
            return response()->json([
                'message' => 'Selected approver must belong to the same branch.'
            ], 422);
        }

        $loanRequest->approval_employee_id = (int) $approvalEmployee->id;
        $loanRequest->save();

        if ($user instanceof User) {
            $this->notifyApprovalRequested($loanRequest, $user, $approvalUser, $approvalEmployee);
        }

        $loanRequest->load(['approvalEmployee:id,first_name,last_name,employee_code,designation_id']);

        return response()->json([
            'message' => 'Approval requested successfully from selected user.',
            'loan' => $loanRequest,
        ]);
    }

    public function sendBack(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $user = $request->user();
        if (!$this->canCreditOfficerSendBack($user, $loanRequest)) {
            return response()->json([
                'message' => 'You are not allowed to send back this loan based on current Action Center flow settings.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can be sent back.'
            ], 422);
        }

        $validated = $request->validate([
            'target_step' => 'required|integer|min:1',
            'note' => 'required|string|max:1000',
        ]);

        $note = trim((string) $validated['note']);
        $actor = $user instanceof User ? $user : null;

        $result = DB::transaction(function () use ($loanRequest, $validated, $note, $actor) {
            $lockedLoan = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            $currentStep = $this->resolveWorkflowStep($lockedLoan);
            if ($currentStep <= 1) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => 'Step 1 loans cannot be moved back.',
                ];
            }

            $targetStep = $this->normalizeWorkflowStep((int) $validated['target_step']);
            if ($targetStep >= $currentStep) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => sprintf('Send back step must be lower than current step (%d).', $currentStep),
                ];
            }

            $lockedLoan->status = 'hold';
            $lockedLoan->hold_at = now();
            $lockedLoan->hold_reason = $note;
            $lockedLoan->workflow_step = $targetStep;
            $lockedLoan->workflow_step_updated_at = now();
            $lockedLoan->save();

            $this->notifyWorkflowStepTransition($lockedLoan, $currentStep, $targetStep, $actor);

            if ($actor instanceof User) {
                $this->notifyLoanSendBack($lockedLoan, $actor, $note, $currentStep, $targetStep);
            }

            return [
                'ok' => true,
                'message' => sprintf('Loan request sent back to Step %d: %s.', $targetStep, $this->workflowStepTitle($targetStep)),
                'loan' => $lockedLoan,
                'from_step' => $currentStep,
                'to_step' => $targetStep,
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Failed to send back this loan request.',
            ], (int) ($result['status'] ?? 422));
        }

        $loan = $result['loan'];
        if ($loan instanceof MicrofinanceLoanRequest) {
            $loan->load([
                'approvalEmployee:id,first_name,last_name,employee_code,designation_id',
                'createdBy:id,name,email,employee_id,branch_id',
                'createdBy.employee:id,first_name,last_name,employee_code,branch_id',
            ]);
        }

        return response()->json([
            'message' => $result['message'],
            'loan' => $loan,
            'from_step' => $result['from_step'],
            'to_step' => $result['to_step'],
        ]);
    }

    private function notifyApprovalRequested(
        MicrofinanceLoanRequest $loanRequest,
        User $requester,
        User $approverUser,
        Employee $approverEmployee
    ): void {
        $recipientUserId = (int) ($approverUser->id ?? 0);
        $requesterUserId = (int) ($requester->id ?? 0);

        if ($recipientUserId <= 0 || $recipientUserId === $requesterUserId) {
            return;
        }

        $customerName = trim((string) ($loanRequest->customer_name ?? 'Customer'));
        $reference = $this->resolveLoanReference($loanRequest);
        $requesterName = trim((string) ($requester->name ?? 'A reviewer'));
        $approverName = trim((string) (($approverEmployee->first_name ?? '') . ' ' . ($approverEmployee->last_name ?? '')));

        UserNotification::query()->create([
            'user_id' => $recipientUserId,
            'title' => 'Approval Request Assigned',
            'message' => sprintf(
                '%s requested your approval for %s (%s) - %s.',
                $requesterName,
                $customerName,
                $reference,
                number_format((float) ($loanRequest->loan_amount ?? 0), 2, '.', ',') . ' LKR'
            ),
            'type' => 'microfinance_approval_request',
            'is_read' => false,
            'is_important' => true,
            'action_url' => '/dashboard/microfinance/loans/approvals',
            'meta' => [
                'loan_request_id' => (int) $loanRequest->id,
                'loan_code' => $reference,
                    'reference_no' => (string) ($loanRequest->reference_no ?? ''),
                'customer_no' => (string) ($loanRequest->customer_no ?? ''),
                'requested_by_user_id' => $requesterUserId,
                'requested_by_name' => $requesterName,
                'assigned_approver_employee_id' => (int) ($approverEmployee->id ?? 0),
                'assigned_approver_name' => $approverName,
            ],
        ]);
    }

    private function notifyLoanSendBack(
        MicrofinanceLoanRequest $loanRequest,
        User $sender,
        string $note,
        int $fromStep,
        int $toStep
    ): void {
        $senderUserId = (int) ($sender->id ?? 0);
        $recipientUserIds = [];

        $createdByUserId = (int) ($loanRequest->created_by ?? 0);
        if ($createdByUserId > 0) {
            $recipientUserIds[] = $createdByUserId;
        }

        $approvalEmployeeId = (int) ($loanRequest->approval_employee_id ?? 0);
        if ($approvalEmployeeId > 0) {
            $approvalUser = User::query()
                ->select(['id'])
                ->where('employee_id', $approvalEmployeeId)
                ->orderByDesc('id')
                ->first();

            if ($approvalUser) {
                $recipientUserIds[] = (int) $approvalUser->id;
            }
        }

        $recipientUserIds = array_values(array_unique(array_filter($recipientUserIds)));

        if (empty($recipientUserIds)) {
            return;
        }

        $customerName = trim((string) ($loanRequest->customer_name ?? 'Customer'));
        $reference = $this->resolveLoanReference($loanRequest);
        $senderName = trim((string) ($sender->name ?? 'A reviewer'));
        $fromStep = $this->normalizeWorkflowStep($fromStep);
        $toStep = $this->normalizeWorkflowStep($toStep);
        $fromTitle = $this->workflowStepTitle($fromStep);
        $toTitle = $this->workflowStepTitle($toStep);

        foreach ($recipientUserIds as $recipientUserId) {
            if ($recipientUserId <= 0 || $recipientUserId === $senderUserId) {
                continue;
            }

            UserNotification::query()->create([
                'user_id' => $recipientUserId,
                'title' => 'Loan Request Sent Back For Correction',
                'message' => sprintf(
                    '%s sent back %s (%s) from Step %d: %s to Step %d: %s. Note: %s',
                    $senderName,
                    $customerName,
                    $reference,
                    $fromStep,
                    $fromTitle,
                    $toStep,
                    $toTitle,
                    $note
                ),
                'type' => 'microfinance_send_back',
                'is_read' => false,
                'is_important' => true,
                'action_url' => '/dashboard/microfinance/loans/request',
                'meta' => [
                    'loan_request_id' => (int) $loanRequest->id,
                    'loan_code' => $reference,
                    'reference_no' => (string) ($loanRequest->reference_no ?? ''),
                    'customer_no' => (string) ($loanRequest->customer_no ?? ''),
                    'sent_by_user_id' => $senderUserId,
                    'sent_by_name' => $senderName,
                    'from_step' => $fromStep,
                    'to_step' => $toStep,
                    'workflow_step' => $toStep,
                    'workflow_step_title' => $toTitle,
                    'note' => $note,
                ],
            ]);
        }
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

    public function store(Request $request)
    {
        $validated = $request->validate([
            'branch_id' => 'nullable|exists:companies,id',
            'manager_employee_id' => 'nullable|exists:employees,id',
            'approval_employee_id' => 'required|exists:employees,id',
            'loan_scope' => 'required|in:route_loan,center_loan,direct_loan',
            'mf_route_id' => 'nullable|exists:mf_routes,id|required_if:loan_scope,route_loan,center_loan',
            'mf_center_id' => 'nullable|exists:mf_centers,id|required_if:loan_scope,center_loan',
            'mf_group_id' => 'nullable|exists:mf_groups,id|required_if:loan_scope,center_loan',
            'manager_name' => 'required|string|max:255',
            'field_officer' => 'required|string|max:255',
            'group_leader' => 'nullable|string|max:255',
            'loan_code' => 'nullable|string|max:100',
            'reference_no' => 'nullable|string|max:100',
            'customer_no' => 'nullable|string|max:100',
            'selected_customer_id' => 'nullable|exists:customers,id',
            'customer_code' => 'nullable|string|max:60|required_without:nic',
            'customer_name' => 'nullable|string|max:255',
            'nick_name' => 'nullable|string|max:255',
            'nic' => 'nullable|string|max:100|required_without:customer_code',
            'address' => 'nullable|string',
            'contact_no' => 'nullable|string|max:100',
            'customer_profile_payload' => 'nullable|array',
            'customer_profile_payload.additional_details' => 'nullable|array',
            'customer_profile_payload.onboarding_payload' => 'nullable|array',
            'customer_profile_payload.existing_loans' => 'nullable|boolean',
            'customer_profile_payload.monthly_loan_obligations' => 'nullable|numeric|min:0',
            'customer_profile_payload.credit_score' => 'nullable|numeric|min:0',
            'evaluation_payload_version' => 'nullable|integer|min:1|max:10',
            'evaluation_payload' => 'nullable|array',
            'evaluation_payload.business_expense_breakdown' => 'nullable|array',
            'evaluation_payload.business_expense_breakdown.*' => 'nullable|numeric|min:0',
            'evaluation_payload.business_1_unit_selling_price' => 'nullable|numeric|min:0',
            'evaluation_payload.business_1_units' => 'nullable|numeric|min:0',
            'evaluation_payload.business_2_unit_selling_price' => 'nullable|numeric|min:0',
            'evaluation_payload.business_2_units' => 'nullable|numeric|min:0',
            'evaluation_payload.business_monthly_expenses' => 'nullable|numeric|min:0',
            'evaluation_payload.business_monthly_income' => 'nullable|numeric|min:0',
            'bank_name' => 'nullable|string|max:190',
            'bank_branch' => 'nullable|string|max:190',
            'bank_account_no' => 'nullable|string|max:80',
            'loan_amount' => 'required|numeric|min:0',
            'reason' => 'nullable|string',
            'refund_option' => 'required|in:day,week,month',
            'assumed_month_days' => 'nullable|integer|min:20|max:31',
            'interest_type' => 'required|in:flat,reducing',
            'interest_rate' => 'required|numeric|min:0',
            'terms_count' => 'required|integer|min:1',
            'refundable_amount' => 'required|numeric|min:0',
            'installment_amount' => 'required|numeric|min:0',
            'document_charges' => 'nullable|numeric|min:0',
            'stamp_charges' => 'nullable|numeric|min:0',
            'insurance_charges' => 'nullable|numeric|min:0',
            'charge_payment_mode' => 'required|in:deduct_from_loan,hand_cash',
            'charges_collection_status' => 'nullable|in:pending,done',
            'loan_request_date' => 'required|date',
            'guarantors' => 'nullable|array',
            'guarantors.*.name' => 'required|string|max:255',
            'guarantors.*.nic' => 'nullable|string|max:100',
            'guarantors.*.address' => 'nullable|string',
            'guarantors.*.contact_no' => 'nullable|string|max:100',
            'guarantors.*.relationship' => 'nullable|string|max:100',
        ]);

        $validated['nic'] = strtoupper(trim((string)($validated['nic'] ?? '')));
        $validated['customer_code'] = strtoupper(trim((string)($validated['customer_code'] ?? '')));

        if ($validated['customer_code'] === '' && $validated['nic'] === '') {
            return response()->json([
                'message' => 'Customer number or NIC is required.'
            ], 422);
        }

        $rawEvaluationPayload = null;
        if (is_array($validated['evaluation_payload'] ?? null)) {
            $rawEvaluationPayload = $validated['evaluation_payload'];
        } elseif (is_array($validated['customer_profile_payload']['additional_details']['evaluation'] ?? null)) {
            $rawEvaluationPayload = $validated['customer_profile_payload']['additional_details']['evaluation'];
        }

        $evaluationPayload = $this->sanitizeEvaluationPayload($rawEvaluationPayload);
        $evaluationPayloadVersion = null;
        if (is_array($evaluationPayload)) {
            $evaluationPayloadVersion = (int) ($validated['evaluation_payload_version']
                ?? ($evaluationPayload['payload_version'] ?? 2));
            $evaluationPayload['payload_version'] = $evaluationPayloadVersion;
        }

        $validated['reference_no'] = strtoupper(trim((string)($validated['reference_no'] ?? $validated['customer_no'] ?? '')));

        $customerRecord = null;
        $selectedCustomerId = (int) ($validated['selected_customer_id'] ?? 0);
        if ($selectedCustomerId > 0) {
            $customerRecord = Customer::query()->find($selectedCustomerId);
        }

        if (!$customerRecord && $validated['customer_code'] !== '') {
            $customerRecord = $this->findCustomerByIdentifier((string) $validated['customer_code']);
        }

        if (!$customerRecord && !empty($validated['customer_no'])) {
            $customerRecord = $this->findCustomerByIdentifier((string) $validated['customer_no']);
        }

        if (!$customerRecord && $validated['nic'] !== '') {
            $customerRecord = Customer::query()
                ->where(function ($query) use ($validated) {
                    $query->whereRaw('UPPER(nic_passport) = ?', [$validated['nic']])
                        ->orWhereRaw('UPPER(old_nic) = ?', [$validated['nic']]);
                })
                ->first();
        }

        if (!$customerRecord) {
            return response()->json([
                'message' => 'No existing customer found for the selected customer number or NIC.'
            ], 422);
        }

        if (is_array($validated['customer_profile_payload'] ?? null)) {
            $customerRecord = $this->applyLoanRequestCustomerProfilePayload($customerRecord, $validated['customer_profile_payload']);
        }

        $profileCompletionScore = $this->calculateCustomerProfileCompletionScore($customerRecord);
        $documentCompletionScore = $this->calculateCustomerDocumentCompletionScore($customerRecord);
        if (
            (
                $profileCompletionScore < self::LOAN_REQUEST_MIN_PROFILE_COMPLETION
                || $documentCompletionScore < self::LOAN_REQUEST_MIN_DOCUMENT_COMPLETION
            )
            && !$this->hasSpecialLoanRequestPermission($request->user())
        ) {
            return response()->json([
                'message' => sprintf(
                    'Loan request blocked. Customer profile completion is %d%% (required %d%%) and document completion is %d%% (required %d%%) unless you have special permission.',
                    $profileCompletionScore,
                    self::LOAN_REQUEST_MIN_PROFILE_COMPLETION,
                    $documentCompletionScore,
                    self::LOAN_REQUEST_MIN_DOCUMENT_COMPLETION
                ),
            ], 403);
        }

        $additionalDetails = is_array($customerRecord->additional_details)
            ? $customerRecord->additional_details
            : [];

        $identity = is_array($additionalDetails['identity'] ?? null)
            ? $additionalDetails['identity']
            : [];
        $banking = is_array($additionalDetails['banking_relationships'] ?? null)
            ? $additionalDetails['banking_relationships']
            : [];

        $customerNoForLoan = $this->resolveCanonicalCustomerNo($customerRecord);
        $customerNicForLoan = strtoupper(trim((string) ($customerRecord->nic_passport ?? '')));
        $customerNameForLoan = trim((string) ($identity['full_name_with_initials'] ?? ''));
        if ($customerNameForLoan === '') {
            $customerNameForLoan = trim(((string) ($customerRecord->first_name ?? '')) . ' ' . ((string) ($customerRecord->last_name ?? '')));
        }
        if ($customerNameForLoan === '') {
            $customerNameForLoan = 'Customer';
        }

        $customerAddressForLoan = trim((string) ($customerRecord->current_address ?: $customerRecord->permanent_address ?: ''));
        $customerContactForLoan = trim((string) ($customerRecord->phone ?? ''));
        $customerNickNameForLoan = trim((string) ($validated['nick_name'] ?? $customerRecord->nick_name ?? ''));

        $scope = $validated['loan_scope'];
        $routeId = $validated['mf_route_id'] ?? null;
        $centerId = $validated['mf_center_id'] ?? null;
        $groupId = $validated['mf_group_id'] ?? null;

        if ($scope === 'direct_loan') {
            $routeId = null;
            $centerId = null;
            $groupId = null;
        }

        if ($scope === 'route_loan') {
            $centerId = null;
            $groupId = null;
        }

        if ($scope === 'center_loan') {
            $center = MicrofinanceCenter::findOrFail($centerId);
            $group = MicrofinanceGroup::findOrFail($groupId);

            if ((int)$center->mf_route_id !== (int)$routeId) {
                return response()->json(['message' => 'Selected center does not belong to selected route.'], 422);
            }

            if ((int)$group->mf_route_id !== (int)$routeId) {
                return response()->json(['message' => 'Selected group does not belong to selected route.'], 422);
            }

            if ((int)$group->mf_center_id !== (int)$centerId) {
                return response()->json(['message' => 'Selected group does not belong to selected center.'], 422);
            }
        }

        $loanAmount = (float)$validated['loan_amount'];
        $totalCharges = (float)($validated['document_charges'] ?? 0)
            + (float)($validated['stamp_charges'] ?? 0)
            + (float)($validated['insurance_charges'] ?? 0);
        $hasBankNameColumn = Schema::hasColumn('mf_loan_requests', 'bank_name');
        $hasBankBranchColumn = Schema::hasColumn('mf_loan_requests', 'bank_branch');
        $hasBankAccountNoColumn = Schema::hasColumn('mf_loan_requests', 'bank_account_no');

        if ($validated['charge_payment_mode'] === 'deduct_from_loan' && $totalCharges > $loanAmount) {
            return response()->json([
                'message' => 'Total charges cannot exceed loan amount when deducting charges from the loan.'
            ], 422);
        }

        $approvalEmployee = Employee::query()
            ->with(['user:id,employee_id,branch_id,designation_id,name,email', 'user.designation:id,name', 'user.roles:id,name'])
            ->findOrFail((int) $validated['approval_employee_id']);

        $approvalUser = $approvalEmployee->user;
        if (!$approvalUser || !$this->hasLoanApprovalAccess($approvalUser)) {
            return response()->json([
                'message' => 'Selected approval person does not have loan approval access.'
            ], 422);
        }

        if (!$this->canAssignToRequestedApprover($request->user(), $approvalEmployee)) {
            return response()->json([
                'message' => 'Executive users can submit loan requests only to their configured reporting person.'
            ], 422);
        }

        $managerEmployee = null;
        if (!empty($validated['manager_employee_id'])) {
            $managerEmployee = Employee::find($validated['manager_employee_id']);
        }

        if (!$managerEmployee && !empty($validated['manager_name'])) {
            $managerEmployee = Employee::query()
                ->whereRaw("TRIM(CONCAT(first_name, ' ', last_name)) = ?", [$validated['manager_name']])
                ->orWhere('email', $validated['manager_name'])
                ->first();
        }

        $resolvedBranchId = (int) (
            $validated['branch_id']
            ?? optional($managerEmployee)->branch_id
            ?? optional($request->user())->branch_id
            ?? 0
        );

        if ($resolvedBranchId <= 0) {
            return response()->json([
                'message' => 'Unable to resolve branch for this loan request. Please select a valid branch manager or sign in with a branch-linked account.',
            ], 422);
        }

        $customerPortalCredentials = null;
        $loanRequest = DB::transaction(function () use ($request, $validated, $loanAmount, $totalCharges, $managerEmployee, $scope, $routeId, $centerId, $groupId, $customerRecord, $customerNoForLoan, $customerNameForLoan, $customerNickNameForLoan, $customerNicForLoan, $customerAddressForLoan, $customerContactForLoan, $banking, $evaluationPayload, $evaluationPayloadVersion, &$customerPortalCredentials, $hasBankNameColumn, $hasBankBranchColumn, $hasBankAccountNoColumn, $resolvedBranchId) {
            $createdBy = optional($request->user())->id ?? 1;

            $loanPayload = [
                'branch_id' => $resolvedBranchId,
                'loan_scope' => $scope,
                'mf_route_id' => $routeId,
                'mf_center_id' => $centerId,
                'mf_group_id' => $groupId,
                'manager_name' => $validated['manager_name'],
                'approval_employee_id' => (int) $validated['approval_employee_id'],
                'field_officer' => $validated['field_officer'],
                'group_leader' => $validated['group_leader'] ?? '',
                'loan_code' => null,
                'reference_no' => $validated['reference_no'] !== '' ? $validated['reference_no'] : null,
                'customer_no' => $customerNoForLoan,
                'customer_name' => $customerNameForLoan,
                'nick_name' => $customerNickNameForLoan !== '' ? $customerNickNameForLoan : null,
                'nic' => $customerNicForLoan,
                'address' => $customerAddressForLoan,
                'contact_no' => $customerContactForLoan,
                'evaluation_payload' => $evaluationPayload,
                'evaluation_payload_version' => $evaluationPayloadVersion,
                'loan_amount' => $validated['loan_amount'],
                'reason' => $validated['reason'] ?? null,
                'refund_option' => $validated['refund_option'],
                'assumed_month_days' => (int) ($validated['assumed_month_days'] ?? 30),
                'interest_type' => $validated['interest_type'],
                'interest_rate' => $validated['interest_rate'],
                'terms_count' => $validated['terms_count'],
                'refundable_amount' => $validated['refundable_amount'],
                'installment_amount' => $validated['installment_amount'],
                'document_charges' => $validated['document_charges'] ?? 0,
                'stamp_charges' => $validated['stamp_charges'] ?? 0,
                'insurance_charges' => $validated['insurance_charges'] ?? 0,
                'charge_payment_mode' => $validated['charge_payment_mode'],
                'charges_collection_status' => $validated['charges_collection_status'] ?? 'pending',
                'net_disbursed_amount' => $validated['charge_payment_mode'] === 'deduct_from_loan'
                    ? $loanAmount - $totalCharges
                    : $loanAmount,
                'loan_request_date' => $validated['loan_request_date'],
                'status' => 'requested',
                'workflow_step' => 1,
                'workflow_step_updated_at' => now(),
                'created_by' => optional($request->user())->id,
            ];
            if ($hasBankNameColumn) {
                $loanPayload['bank_name'] = !empty($banking['primary_bank_name']) ? $banking['primary_bank_name'] : null;
            }
            if ($hasBankBranchColumn) {
                $loanPayload['bank_branch'] = !empty($banking['bank_branch']) ? $banking['bank_branch'] : null;
            }
            if ($hasBankAccountNoColumn) {
                $loanPayload['bank_account_no'] = !empty($banking['account_number']) ? $banking['account_number'] : null;
            }
            $loanRequest = MicrofinanceLoanRequest::create($loanPayload);

            if (trim((string) ($loanRequest->reference_no ?? '')) === '') {
                $loanRequest->reference_no = 'MF-' . (int) $loanRequest->id;
                $loanRequest->save();
            }

            if ($customerRecord) {
                $customerPortalCredentials = $this->ensureCustomerPortalAccess($customerRecord, (int) $createdBy);
            }

            foreach ($validated['guarantors'] ?? [] as $guarantor) {
                $loanRequest->guarantors()->create([
                    'name' => $guarantor['name'],
                    'nic' => $guarantor['nic'] ?? null,
                    'address' => $guarantor['address'] ?? null,
                    'contact_no' => $guarantor['contact_no'] ?? null,
                    'relationship' => $guarantor['relationship'] ?? null,
                ]);
            }

            if (
                ($validated['charge_payment_mode'] ?? '') === 'hand_cash'
                && ($validated['charges_collection_status'] ?? 'pending') === 'done'
            ) {
                $this->creditCollectorWalletForCharges($loanRequest, $totalCharges);
            }

            return $loanRequest;
        });

        try {
            $this->notifyLoanRequestCreated($loanRequest, $request);
        } catch (\Throwable $exception) {
            Log::warning('Failed to create microfinance approval notifications', [
                'loan_request_id' => (int) $loanRequest->id,
                'error' => $exception->getMessage(),
            ]);
        }

        $payload = $loanRequest->load([
            'route:id,name,code',
            'center:id,name,code',
            'group:id,name,code',
            'guarantors',
            'documents',
        ])->toArray();
        $payload['customer_portal_credentials'] = $customerPortalCredentials;

        return response()->json($payload, 201);
    }

    public function update(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->canEditLoanRequest($request->user(), $loanRequest)) {
            return response()->json([
                'message' => 'Only Finance Manager, Branch Manager, Admin, or the send-back assigned employee can edit loan details.'
            ], 403);
        }

        $validated = $request->validate([
            'loan_scope' => 'required|in:route_loan,center_loan,direct_loan',
            'mf_route_id' => 'nullable|exists:mf_routes,id|required_if:loan_scope,route_loan,center_loan',
            'mf_center_id' => 'nullable|exists:mf_centers,id|required_if:loan_scope,center_loan',
            'mf_group_id' => 'nullable|exists:mf_groups,id|required_if:loan_scope,center_loan',
            'approval_employee_id' => 'nullable|exists:employees,id',
            'manager_name' => 'required|string|max:255',
            'field_officer' => 'required|string|max:255',
            'group_leader' => 'nullable|string|max:255',
            'reference_no' => 'nullable|string|max:100',
            'evaluation_payload_version' => 'nullable|integer|min:1|max:10',
            'evaluation_payload' => 'nullable|array',
            'evaluation_payload.business_expense_breakdown' => 'nullable|array',
            'evaluation_payload.business_expense_breakdown.*' => 'nullable|numeric|min:0',
            'evaluation_payload.business_1_unit_selling_price' => 'nullable|numeric|min:0',
            'evaluation_payload.business_1_units' => 'nullable|numeric|min:0',
            'evaluation_payload.business_2_unit_selling_price' => 'nullable|numeric|min:0',
            'evaluation_payload.business_2_units' => 'nullable|numeric|min:0',
            'evaluation_payload.business_monthly_expenses' => 'nullable|numeric|min:0',
            'evaluation_payload.business_monthly_income' => 'nullable|numeric|min:0',
            'customer_name' => 'required|string|max:255',
            'nick_name' => 'nullable|string|max:255',
            'address' => 'required|string',
            'contact_no' => 'required|string|max:100',
            'bank_name' => 'nullable|string|max:190',
            'bank_branch' => 'nullable|string|max:190',
            'bank_account_no' => 'nullable|string|max:80',
            'reason' => 'nullable|string',
            'loan_amount' => 'required|numeric|min:0',
            'refund_option' => 'required|in:day,week,month',
            'assumed_month_days' => 'nullable|integer|min:20|max:31',
            'interest_type' => 'required|in:flat,reducing',
            'interest_rate' => 'required|numeric|min:0',
            'terms_count' => 'required|integer|min:1',
            'refundable_amount' => 'required|numeric|min:0',
            'installment_amount' => 'required|numeric|min:0',
            'document_charges' => 'nullable|numeric|min:0',
            'stamp_charges' => 'nullable|numeric|min:0',
            'insurance_charges' => 'nullable|numeric|min:0',
            'charge_payment_mode' => 'required|in:deduct_from_loan,hand_cash',
            'charges_collection_status' => 'nullable|in:pending,done',
            'loan_request_date' => 'nullable|date',
            'loan_end_date' => 'nullable|date',
            'next_payment_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'guarantors' => 'nullable|array',
            'guarantors.*.name' => 'required|string|max:255',
            'guarantors.*.nic' => 'nullable|string|max:100',
            'guarantors.*.address' => 'nullable|string',
            'guarantors.*.contact_no' => 'nullable|string|max:100',
            'guarantors.*.relationship' => 'nullable|string|max:100',
        ]);

        $scope = $validated['loan_scope'];
        $routeId = $validated['mf_route_id'] ?? null;
        $centerId = $validated['mf_center_id'] ?? null;
        $groupId = $validated['mf_group_id'] ?? null;

        if ($scope === 'direct_loan') {
            $routeId = null;
            $centerId = null;
            $groupId = null;
        }

        if ($scope === 'route_loan') {
            $centerId = null;
            $groupId = null;
        }

        if ($scope === 'center_loan') {
            $center = MicrofinanceCenter::findOrFail($centerId);
            $group = MicrofinanceGroup::findOrFail($groupId);

            if ((int)$center->mf_route_id !== (int)$routeId) {
                return response()->json(['message' => 'Selected center does not belong to selected route.'], 422);
            }

            if ((int)$group->mf_route_id !== (int)$routeId) {
                return response()->json(['message' => 'Selected group does not belong to selected route.'], 422);
            }

            if ((int)$group->mf_center_id !== (int)$centerId) {
                return response()->json(['message' => 'Selected group does not belong to selected center.'], 422);
            }
        }

        $loanAmount = (float) $validated['loan_amount'];
        $totalCharges = (float) ($validated['document_charges'] ?? 0)
            + (float) ($validated['stamp_charges'] ?? 0)
            + (float) ($validated['insurance_charges'] ?? 0);
        $hasBankNameColumn = Schema::hasColumn('mf_loan_requests', 'bank_name');
        $hasBankBranchColumn = Schema::hasColumn('mf_loan_requests', 'bank_branch');
        $hasBankAccountNoColumn = Schema::hasColumn('mf_loan_requests', 'bank_account_no');

        if ($validated['charge_payment_mode'] === 'deduct_from_loan' && $totalCharges > $loanAmount) {
            return response()->json([
                'message' => 'Total charges cannot exceed loan amount when deducting charges from the loan.'
            ], 422);
        }

        $resolvedEvaluationPayload = array_key_exists('evaluation_payload', $validated)
            ? (is_array($validated['evaluation_payload']) ? $this->sanitizeEvaluationPayload($validated['evaluation_payload']) : null)
            : $loanRequest->evaluation_payload;

        $resolvedEvaluationPayloadVersion = array_key_exists('evaluation_payload_version', $validated)
            ? ($validated['evaluation_payload_version'] !== null ? (int) $validated['evaluation_payload_version'] : null)
            : (is_array($resolvedEvaluationPayload)
                ? (int) ($resolvedEvaluationPayload['payload_version'] ?? ($loanRequest->evaluation_payload_version ?? 2))
                : $loanRequest->evaluation_payload_version);

        if (is_array($resolvedEvaluationPayload) && $resolvedEvaluationPayloadVersion !== null) {
            $resolvedEvaluationPayload['payload_version'] = $resolvedEvaluationPayloadVersion;
        }

        $updatePayload = [
            'loan_scope' => $scope,
            'mf_route_id' => $routeId,
            'mf_center_id' => $centerId,
            'mf_group_id' => $groupId,
            'manager_name' => $validated['manager_name'],
            'approval_employee_id' => array_key_exists('approval_employee_id', $validated)
                ? ($validated['approval_employee_id'] !== null ? (int) $validated['approval_employee_id'] : null)
                : $loanRequest->approval_employee_id,
            'field_officer' => $validated['field_officer'],
            'group_leader' => $validated['group_leader'] ?? '',
            'loan_code' => $loanRequest->loan_code,
            'reference_no' => array_key_exists('reference_no', $validated)
                ? (trim((string)$validated['reference_no']) !== '' ? strtoupper(trim((string)$validated['reference_no'])) : $loanRequest->reference_no)
                : $loanRequest->reference_no,
            'evaluation_payload' => $resolvedEvaluationPayload,
            'evaluation_payload_version' => $resolvedEvaluationPayloadVersion,
            'customer_name' => $validated['customer_name'],
            'nick_name' => $validated['nick_name'] ?? null,
            'address' => $validated['address'],
            'contact_no' => $validated['contact_no'],
            'reason' => $validated['reason'] ?? null,
            'loan_amount' => $validated['loan_amount'],
            'refund_option' => $validated['refund_option'],
            'assumed_month_days' => (int) ($validated['assumed_month_days'] ?? ($loanRequest->assumed_month_days ?? 30)),
            'interest_type' => $validated['interest_type'],
            'interest_rate' => $validated['interest_rate'],
            'terms_count' => $validated['terms_count'],
            'refundable_amount' => $validated['refundable_amount'],
            'installment_amount' => $validated['installment_amount'],
            'document_charges' => $validated['document_charges'] ?? 0,
            'stamp_charges' => $validated['stamp_charges'] ?? 0,
            'insurance_charges' => $validated['insurance_charges'] ?? 0,
            'charge_payment_mode' => $validated['charge_payment_mode'],
            'charges_collection_status' => $validated['charges_collection_status'] ?? $loanRequest->charges_collection_status ?? 'pending',
            'net_disbursed_amount' => $validated['charge_payment_mode'] === 'deduct_from_loan'
                ? max($loanAmount - $totalCharges, 0)
                : $loanAmount,
            'loan_request_date' => $validated['loan_request_date'] ?? $loanRequest->loan_request_date,
        ];
        if ($hasBankNameColumn) {
            $updatePayload['bank_name'] = array_key_exists('bank_name', $validated) ? ($validated['bank_name'] ?? null) : $loanRequest->bank_name;
        }
        if ($hasBankBranchColumn) {
            $updatePayload['bank_branch'] = array_key_exists('bank_branch', $validated) ? ($validated['bank_branch'] ?? null) : $loanRequest->bank_branch;
        }
        if ($hasBankAccountNoColumn) {
            $updatePayload['bank_account_no'] = array_key_exists('bank_account_no', $validated) ? ($validated['bank_account_no'] ?? null) : $loanRequest->bank_account_no;
        }
        $previousStatus = strtolower(trim((string) ($loanRequest->status ?? '')));

        $loanRequest->fill($updatePayload);

        if ($previousStatus === 'hold') {
            $loanRequest->status = 'requested';
            $loanRequest->hold_at = null;
            $loanRequest->hold_reason = null;
        }

        if (array_key_exists('loan_end_date', $validated)) {
            $loanRequest->loan_end_date = $validated['loan_end_date'] ?? null;
        }

        $collectionDate = $validated['due_date'] ?? $validated['next_payment_date'] ?? null;
        if ($collectionDate !== null && $collectionDate !== '') {
            $loanRequest->next_payment_date = $collectionDate;
            $loanRequest->setAttribute('due_date', $collectionDate);

            $graceDays = max((int) ($loanRequest->penalty_grace_days ?? 2), 0);
            $loanRequest->penalty_starts_on = (new \DateTimeImmutable((string) $collectionDate))
                ->modify('+' . ($graceDays + 1) . ' days')
                ->format('Y-m-d');
        }

        $loanRequest->save();

        if (
            ($loanRequest->charge_payment_mode ?? '') === 'hand_cash'
            && ($loanRequest->charges_collection_status ?? 'pending') === 'done'
        ) {
            $this->creditCollectorWalletForCharges($loanRequest, $totalCharges);
        }

        if (array_key_exists('guarantors', $validated)) {
            $loanRequest->guarantors()->delete();

            foreach ($validated['guarantors'] ?? [] as $guarantor) {
                $loanRequest->guarantors()->create([
                    'name' => $guarantor['name'],
                    'nic' => $guarantor['nic'] ?? null,
                    'address' => $guarantor['address'] ?? null,
                    'contact_no' => $guarantor['contact_no'] ?? null,
                    'relationship' => $guarantor['relationship'] ?? null,
                ]);
            }
        }

        $customerName = trim((string) $loanRequest->customer_name);
        $nameParts = preg_split('/\s+/', $customerName, 2);
        $firstName = trim($nameParts[0] ?? 'Customer');
        $lastName = trim($nameParts[1] ?? 'Customer');

        $customer = Customer::query()
            ->where('nic_passport', $loanRequest->nic)
            ->first();

        if ($customer) {
            $customer->update([
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => $loanRequest->contact_no,
                'permanent_address' => $loanRequest->address,
                'current_address' => $loanRequest->address,
            ]);
        }

        return response()->json([
            'message' => 'Loan updated successfully.',
            'data' => $loanRequest->load([
                'route:id,name,code',
                'center:id,name,code',
                'group:id,name,code',
                'guarantors',
                'documents',
            ]),
        ]);
    }

    public function updateLifecycle(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $validated = $request->validate([
            'action' => 'required|in:hold,close',
            'reason' => 'nullable|string|max:1000',
        ]);

        $action = (string) $validated['action'];
        $status = strtolower((string) $loanRequest->status);

        if ($action === 'hold') {
            if (!in_array($status, ['approved', 'released'], true)) {
                return response()->json([
                    'message' => 'Only approved or released loans can be put on hold.'
                ], 422);
            }

            $loanRequest->status = 'hold';
            $loanRequest->due_date = null;
            $loanRequest->next_payment_date = null;
            $loanRequest->penalty_starts_on = null;
            $loanRequest->arrears_balance = 0;
            $loanRequest->hold_at = now();
            $loanRequest->hold_reason = $validated['reason'] ?? null;
            $loanRequest->save();

            return response()->json([
                'message' => 'Loan has been put on hold. Due date and arrears calculations are paused.',
                'data' => $loanRequest,
            ]);
        }

        if (!in_array($status, ['requested', 'approved', 'released', 'hold'], true)) {
            return response()->json([
                'message' => 'This loan cannot be marked as closed from its current status.'
            ], 422);
        }

        $loanRequest->status = 'closed';
        $loanRequest->due_date = null;
        $loanRequest->next_payment_date = null;
        $loanRequest->penalty_starts_on = null;
        $loanRequest->arrears_balance = 0;
        $loanRequest->closed_at = now();
        $loanRequest->closed_reason = $validated['reason'] ?? null;
        $loanRequest->save();

        return response()->json([
            'message' => 'Loan has been marked as closed.',
            'data' => $loanRequest,
        ]);
    }

    public function storeDocuments(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $validated = $request->validate([
            'document_types' => 'required|array|min:1',
            'document_types.*' => 'required|string|max:120',
            'documents' => 'required|array|min:1',
            'documents.*' => 'required|file|max:10240',
        ]);

        $documentTypes = $validated['document_types'];
        $documents = $request->file('documents', []);

        if (count($documentTypes) !== count($documents)) {
            return response()->json([
                'message' => 'Document type count and uploaded file count must be equal.'
            ], 422);
        }

        $saved = [];

        foreach ($documents as $index => $file) {
            $path = $file->store(
                'microfinance/loan-requests/' . $loanRequest->id . '/documents',
                'public'
            );

            $saved[] = $loanRequest->documents()->create([
                'document_type' => $documentTypes[$index],
                'file_path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'uploaded_by' => optional($request->user())->id,
            ]);
        }

        return response()->json([
            'message' => 'Documents uploaded successfully.',
            'data' => $saved,
        ], 201);
    }

    public function storeGuarantorMedia(Request $request, MicrofinanceLoanRequest $loanRequest, MicrofinanceLoanGuarantor $guarantor)
    {
        if ((int) $guarantor->mf_loan_request_id !== (int) $loanRequest->id) {
            return response()->json([
                'message' => 'Guarantor does not belong to this loan request.',
            ], 404);
        }

        $request->validate([
            'image' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:5120',
            'signature' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        if (!$request->hasFile('image') && !$request->hasFile('signature')) {
            return response()->json([
                'message' => 'At least one file is required: image or signature.',
            ], 422);
        }

        if ($request->hasFile('image')) {
            if (!empty($guarantor->image_path)) {
                Storage::delete($guarantor->image_path);
            }

            $imageFile = $request->file('image');
            $guarantor->image_path = $imageFile->store(
                'public/microfinance/loan-requests/' . $loanRequest->id . '/guarantors/' . $guarantor->id
            );
            $guarantor->image_original_name = $imageFile->getClientOriginalName();
        }

        if ($request->hasFile('signature')) {
            if (!empty($guarantor->signature_path)) {
                Storage::delete($guarantor->signature_path);
            }

            $signatureFile = $request->file('signature');
            $guarantor->signature_path = $signatureFile->store(
                'public/microfinance/loan-requests/' . $loanRequest->id . '/guarantors/' . $guarantor->id
            );
            $guarantor->signature_original_name = $signatureFile->getClientOriginalName();
        }

        $guarantor->save();

        return response()->json([
            'message' => 'Guarantor media uploaded successfully.',
            'data' => $guarantor,
        ], 201);
    }

    public function approve(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if ($loanRequest->status !== 'requested') {
            return response()->json([
                'message' => 'Only requested loans can be approved.'
            ], 422);
        }

        $currentWorkflowStep = $this->resolveWorkflowStep($loanRequest);
        if ($currentWorkflowStep < self::WORKFLOW_FINAL_STEP) {
            return response()->json([
                'message' => sprintf(
                    'Loan must reach Step %d: %s before final approval.',
                    self::WORKFLOW_FINAL_STEP,
                    $this->workflowStepTitle(self::WORKFLOW_FINAL_STEP)
                )
            ], 422);
        }

        if (!$this->hasLoanApprovalAccess($request->user())) {
            return response()->json([
                'message' => 'Only Loan Approver, Finance Manager, Branch Manager, and Admin can approve loans.'
            ], 403);
        }

        $penaltySetting = MicrofinancePenaltySetting::query()
            ->where('is_active', true)
            ->orderByDesc('id')
            ->first();

        if (!$penaltySetting) {
            return response()->json([
                'message' => 'Please configure an active penalty rate in Microfinance Settings before approving loans.'
            ], 422);
        }

        $validated = $request->validate([
            'approval_date' => ['nullable', 'date'],
            'next_payment_date' => ['nullable', 'date'],
            'loan_end_date' => ['nullable', 'date'],
        ]);

        $graceDays = 2;
        $approveDate = !empty($validated['approval_date'])
            ? new \DateTimeImmutable((string) $validated['approval_date'])
            : new \DateTimeImmutable(date('Y-m-d'));
        $refundOption = (string)$loanRequest->refund_option;
        $termCount = max((int)$loanRequest->terms_count, 1);

        $meetingDay = (string) optional($loanRequest->center)->meeting_day;
        $approvalBaseDate = $approveDate->format('Y-m-d');
        if (!empty($loanRequest->loan_request_date)) {
            try {
                $requestDate = new \DateTimeImmutable((string) $loanRequest->loan_request_date);
                if ($requestDate > $approveDate) {
                    $approvalBaseDate = $requestDate->format('Y-m-d');
                }
            } catch (\Throwable $e) {
                // keep approval date fallback
            }
        }
        $nextPaymentDate = !empty($validated['next_payment_date'])
            ? (string) $validated['next_payment_date']
            : $this->shiftByRefundOption(new \DateTimeImmutable($approvalBaseDate), $refundOption, 1)->format('Y-m-d');

        $dueDate = $nextPaymentDate;
        $loanEndDate = !empty($validated['loan_end_date'])
            ? (string) $validated['loan_end_date']
            : $this->shiftByRefundOption(
                new \DateTimeImmutable($nextPaymentDate),
                $refundOption,
                max($termCount - 1, 0)
            )->format('Y-m-d');

        $penaltyStartsOn = (new \DateTimeImmutable($dueDate))
            ->modify('+' . ($graceDays + 1) . ' days')
            ->format('Y-m-d');

        $loanRequest->status = 'approved';
        $loanRequest->workflow_step = self::WORKFLOW_FINAL_STEP;
        $loanRequest->workflow_step_updated_at = now();
        if (trim((string) ($loanRequest->loan_code ?? '')) === '') {
            $loanRequest->loan_code = $this->resolveLoanReference($loanRequest);
        }
        $loanRequest->next_payment_date = $nextPaymentDate;
        $loanRequest->setAttribute('due_date', $dueDate);
        $loanRequest->loan_end_date = $loanEndDate;
        $loanRequest->arrears_balance = 0;
        $loanRequest->penalty_rate = $penaltySetting->penalty_rate;
        $loanRequest->penalty_grace_days = $graceDays;
        $loanRequest->penalty_starts_on = $penaltyStartsOn;
        $loanRequest->save();

        return response()->json([
            'message' => 'Loan approved successfully.',
            'data' => $loanRequest->load([
                'route:id,name,code',
                'center:id,name,code,meeting_day',
                'group:id,name,code',
                'guarantors',
            ]),
        ]);
    }

    private function alignDateToMeetingDay(string $date, string $meetingDay): string
    {
        $normalizedDay = strtolower(trim($meetingDay));
        if ($normalizedDay === '') {
            return $date;
        }

        $dayMap = [
            'sunday' => 0,
            'monday' => 1,
            'tuesday' => 2,
            'wednesday' => 3,
            'thursday' => 4,
            'friday' => 5,
            'saturday' => 6,
        ];

        if (!array_key_exists($normalizedDay, $dayMap)) {
            return $date;
        }

        try {
            $cursor = new \DateTimeImmutable($date);
        } catch (\Throwable $e) {
            return $date;
        }

        $targetDow = $dayMap[$normalizedDay];
        $currentDow = (int) $cursor->format('w');
        $delta = ($targetDow - $currentDow + 7) % 7;

        return $cursor->modify('+' . $delta . ' days')->format('Y-m-d');
    }

    private function alignDateToUpcomingMeetingDay(string $date, string $meetingDay): string
    {
        $aligned = $this->alignDateToMeetingDay($date, $meetingDay);

        try {
            $original = new \DateTimeImmutable($date);
            $next = new \DateTimeImmutable($aligned);
        } catch (\Throwable $e) {
            return $aligned;
        }

        if ($next < $original) {
            return $next->modify('+7 days')->format('Y-m-d');
        }

        return $aligned;
    }

    public function reject(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $validated = $request->validate([
            'rejection_reason' => 'nullable|string|max:1000',
        ]);

        if ($loanRequest->status !== 'requested') {
            return response()->json([
                'message' => 'Only requested loans can be rejected.'
            ], 422);
        }

        if (!$this->canReviewLoan($request->user())) {
            return response()->json([
                'message' => 'Only Loan Approver, Finance Manager, Branch Manager, and Admin can reject loans.'
            ], 403);
        }

        $result = DB::transaction(function () use ($loanRequest, $validated) {
            $lockedLoanRequest = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($lockedLoanRequest->status !== 'requested') {
                return [
                    'ok' => false,
                    'message' => 'Only requested loans can be rejected.',
                    'status' => 422,
                ];
            }

            $lockedLoanRequest->status = 'rejected';
            $lockedLoanRequest->rejection_reason = $validated['rejection_reason'] ?? null;
            $lockedLoanRequest->rejected_at = now();
            $lockedLoanRequest->save();

            $totalCharges = (float) ($lockedLoanRequest->document_charges ?? 0)
                + (float) ($lockedLoanRequest->stamp_charges ?? 0)
                + (float) ($lockedLoanRequest->insurance_charges ?? 0);

            $refunded = false;
            if (
                (string) ($lockedLoanRequest->charge_payment_mode ?? '') === 'hand_cash'
                && (string) ($lockedLoanRequest->charges_collection_status ?? 'pending') === 'done'
            ) {
                $refunded = $this->refundCollectorWalletForCharges($lockedLoanRequest, $totalCharges);
            }

            return [
                'ok' => true,
                'message' => $refunded
                    ? 'Loan rejected successfully. Charges refunded to collector wallet.'
                    : 'Loan rejected successfully.',
                'data' => $lockedLoanRequest,
                'refund' => [
                    'attempted' => $totalCharges > 0,
                    'refunded' => $refunded,
                    'amount' => round($totalCharges, 2),
                ],
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Unable to reject loan.',
            ], (int) ($result['status'] ?? 422));
        }

        return response()->json([
            'message' => $result['message'],
            'data' => $result['data'],
            'refund' => $result['refund'],
        ]);
    }

    public function requestDocuments(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $validated = $request->validate([
            'document_request_note' => 'nullable|string|max:1000',
        ]);

        if ($loanRequest->status !== 'requested') {
            return response()->json([
                'message' => 'Document request can be sent only for requested loans.'
            ], 422);
        }

        if (!$this->canReviewLoan($request->user())) {
            return response()->json([
                'message' => 'You are not allowed to request documents for this loan.'
            ], 403);
        }

        $loanRequest->documents_requested = true;
        $loanRequest->document_request_note = $validated['document_request_note'] ?? null;
        $loanRequest->document_requested_at = now();
        $loanRequest->save();

        return response()->json([
            'message' => 'Document request has been marked for this loan.',
            'data' => $loanRequest,
        ]);
    }

    public function advanceWorkflowStep(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $actorUser = $request->user();
        $currentStep = $this->resolveWorkflowStep($loanRequest);
        $canStepConfigured = $this->canPerformConfiguredStepAction($actorUser, $loanRequest, $currentStep);
        $canRequesterAdvance = $this->canLoanRequesterAdvanceStepOne($actorUser, $loanRequest);
        $canCreditOfficerAdvance = $this->canCreditOfficerAdvanceStepOne($actorUser, $loanRequest);

        if (!$canStepConfigured && !$canRequesterAdvance && !$canCreditOfficerAdvance) {
            return response()->json([
                'message' => 'You are not allowed to move this workflow step based on current Action Center flow settings.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can be moved to the next workflow step.'
            ], 422);
        }

        $actor = $actorUser;

        $result = DB::transaction(function () use ($loanRequest, $actor) {
            $lockedLoan = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            $currentStep = $this->resolveWorkflowStep($lockedLoan);
            if ($currentStep >= self::WORKFLOW_FINAL_STEP) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => 'Loan is already at the final workflow step (Grant).',
                ];
            }

            if ($currentStep === 7) {
                $balanceResult = $this->applyCashWithdrawalToBranchMainAccount($lockedLoan);
                if (empty($balanceResult['ok'])) {
                    return [
                        'ok' => false,
                        'status' => (int) ($balanceResult['status'] ?? 422),
                        'message' => (string) ($balanceResult['message'] ?? 'Unable to update Branch Main Account for cash withdrawal.'),
                    ];
                }
            }

            $nextStep = $currentStep + 1;
            if ($lockedLoan->status === 'hold') {
                $lockedLoan->status = 'requested';
                $lockedLoan->hold_at = null;
                $lockedLoan->hold_reason = null;
            }
            $lockedLoan->workflow_step = $nextStep;
            $lockedLoan->workflow_step_updated_at = now();
            $lockedLoan->save();

            $this->notifyWorkflowStepTransition($lockedLoan, $currentStep, $nextStep, $actor instanceof User ? $actor : null);

            return [
                'ok' => true,
                'message' => sprintf('Loan moved to Step %d: %s.', $nextStep, $this->workflowStepTitle($nextStep)),
                'data' => $lockedLoan,
                'from_step' => $currentStep,
                'to_step' => $nextStep,
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Unable to move workflow step.',
            ], (int) ($result['status'] ?? 422));
        }

        return response()->json([
            'message' => $result['message'],
            'data' => $result['data'],
            'from_step' => $result['from_step'],
            'to_step' => $result['to_step'],
        ]);
    }

    public function markAsCalled(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        $actorUser = $request->user();
        if (!$this->canCreditOfficerHandlePendingCallConfirmation($actorUser, $loanRequest)) {
            return response()->json([
                'message' => 'You are not allowed to mark calls for this workflow step based on current Action Center flow settings.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can be marked as called.'
            ], 422);
        }

        $validated = $request->validate([
            'no_of_times_called' => 'required|integer|min:1|max:1000',
            'answered_by_customer' => 'required|boolean',
            'answered_by_spouse' => 'required|boolean',
            'customer_contact_no' => 'nullable|string|max:50',
            'spouse_contact_no' => 'nullable|string|max:50',
            'customer_full_name' => 'required|string|max:255',
            'nic_or_dob' => 'required|string|max:255',
            'loan_amount' => 'required|numeric|min:0',
            'given_date' => 'required|date',
            'business_details' => 'nullable|string|max:2000',
            'repayment_card_given' => 'required|in:yes,no',
            'special_notes' => 'nullable|string|max:2000',
            'disbursement_otp' => 'nullable|string|max:255',
            'business_type' => 'nullable|string|max:255',
            'called_date' => 'required|date',
        ]);

        $actor = $actorUser;

        $result = DB::transaction(function () use ($loanRequest, $validated, $actor) {
            $lockedLoan = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            $currentStep = $this->resolveWorkflowStep($lockedLoan);
            if ($currentStep !== 2) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => sprintf('Mark as Called is only allowed in Step 2. Current step is %d.', $currentStep),
                ];
            }

            $payload = [
                'no_of_times_called' => (int) $validated['no_of_times_called'],
                'answered_by_customer' => (bool) $validated['answered_by_customer'],
                'answered_by_spouse' => (bool) $validated['answered_by_spouse'],
                'customer_contact_no' => trim((string) ($validated['customer_contact_no'] ?? '')),
                'spouse_contact_no' => trim((string) ($validated['spouse_contact_no'] ?? '')),
                'customer_full_name' => trim((string) $validated['customer_full_name']),
                'nic_or_dob' => trim((string) $validated['nic_or_dob']),
                'loan_amount' => round((float) $validated['loan_amount'], 2),
                'given_date' => (string) $validated['given_date'],
                'business_details' => trim((string) ($validated['business_details'] ?? '')),
                'repayment_card_given' => (string) $validated['repayment_card_given'],
                'special_notes' => trim((string) ($validated['special_notes'] ?? '')),
                'disbursement_otp' => trim((string) ($validated['disbursement_otp'] ?? '')),
                'business_type' => trim((string) ($validated['business_type'] ?? '')),
                'called_date' => (string) $validated['called_date'],
                'marked_by_user_id' => (int) ($actor?->id ?? 0),
                'marked_by_name' => trim((string) ($actor?->name ?? '')),
                'marked_at' => now()->toDateTimeString(),
            ];

            $nextStep = 3;
            $lockedLoan->call_confirmation_payload = $payload;
            $lockedLoan->call_confirmed_at = now();
            $lockedLoan->status = 'requested';
            $lockedLoan->workflow_step = $nextStep;
            $lockedLoan->workflow_step_updated_at = now();
            $lockedLoan->save();

            $this->notifyWorkflowStepTransition($lockedLoan, $currentStep, $nextStep, $actor instanceof User ? $actor : null);

            return [
                'ok' => true,
                'message' => sprintf('Call confirmation saved and moved to Step %d: %s.', $nextStep, $this->workflowStepTitle($nextStep)),
                'data' => $lockedLoan,
                'from_step' => $currentStep,
                'to_step' => $nextStep,
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Unable to save call confirmation.',
            ], (int) ($result['status'] ?? 422));
        }

        return response()->json([
            'message' => $result['message'],
            'data' => $result['data'],
            'from_step' => $result['from_step'],
            'to_step' => $result['to_step'],
        ]);
    }

    public function approveBmStep(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->canPerformConfiguredStepAction($request->user(), $loanRequest, 3)) {
            return response()->json([
                'message' => 'You are not allowed to complete BM approval based on current Action Center flow settings.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can be BM approved.'
            ], 422);
        }

        $validated = $request->validate([
            'bm_comments' => 'required|string|max:2000',
            'bm_additional_notes' => 'nullable|string|max:2000',
        ]);

        $actor = $request->user();

        $result = DB::transaction(function () use ($loanRequest, $validated, $actor) {
            $lockedLoan = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            $currentStep = $this->resolveWorkflowStep($lockedLoan);
            if ($currentStep !== 3) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => sprintf('BM approval is only allowed in Step 3. Current step is %d.', $currentStep),
                ];
            }

            if ($lockedLoan->status === 'hold') {
                $lockedLoan->status = 'requested';
                $lockedLoan->hold_at = null;
                $lockedLoan->hold_reason = null;
            }

            $nextStep = 4;
            $lockedLoan->bm_approval_payload = [
                'bm_comments' => trim((string) $validated['bm_comments']),
                'bm_additional_notes' => trim((string) ($validated['bm_additional_notes'] ?? '')),
                'approved_by_user_id' => (int) ($actor?->id ?? 0),
                'approved_by_name' => trim((string) ($actor?->name ?? '')),
                'approved_at' => now()->toDateTimeString(),
            ];
            $lockedLoan->bm_approved_at = now();
            $lockedLoan->workflow_step = $nextStep;
            $lockedLoan->workflow_step_updated_at = now();
            $lockedLoan->save();

            $this->notifyWorkflowStepTransition($lockedLoan, $currentStep, $nextStep, $actor instanceof User ? $actor : null);

            return [
                'ok' => true,
                'message' => 'Branch Manager approval saved and moved to Head Office approval step.',
                'data' => $lockedLoan,
                'from_step' => $currentStep,
                'to_step' => $nextStep,
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Unable to complete BM approval.',
            ], (int) ($result['status'] ?? 422));
        }

        return response()->json([
            'message' => $result['message'],
            'data' => $result['data'],
            'from_step' => $result['from_step'],
            'to_step' => $result['to_step'],
        ]);
    }

    public function completeCashAllocationStep(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->canPerformConfiguredStepAction($request->user(), $loanRequest, 5)) {
            return response()->json([
                'message' => 'You are not allowed to complete cash allocation based on current Action Center flow settings.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can complete cash allocation.'
            ], 422);
        }

        $validated = $request->validate([
            'branch_name' => 'required|string|max:255',
            'today_cash_requirement' => 'required|numeric|min:0',
            'tomorrow_cash_requirement' => 'required|numeric|min:0',
            'today_allocation_amount' => 'required|numeric|min:0',
            'tomorrow_allocation_amount' => 'required|numeric|min:0',
        ]);

        $actor = $request->user();

        $result = DB::transaction(function () use ($loanRequest, $validated, $actor) {
            $lockedLoan = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            $currentStep = $this->resolveWorkflowStep($lockedLoan);
            if ($currentStep !== 5) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => sprintf('Cash allocation is only allowed in Step 5. Current step is %d.', $currentStep),
                ];
            }

            if ($lockedLoan->status === 'hold') {
                $lockedLoan->status = 'requested';
                $lockedLoan->hold_at = null;
                $lockedLoan->hold_reason = null;
            }

            $nextStep = 6;
            $lockedLoan->cash_allocation_payload = [
                'branch_name' => trim((string) $validated['branch_name']),
                'today_cash_requirement' => round((float) $validated['today_cash_requirement'], 2),
                'tomorrow_cash_requirement' => round((float) $validated['tomorrow_cash_requirement'], 2),
                'today_allocation_amount' => round((float) $validated['today_allocation_amount'], 2),
                'tomorrow_allocation_amount' => round((float) $validated['tomorrow_allocation_amount'], 2),
                'allocated_by_user_id' => (int) ($actor?->id ?? 0),
                'allocated_by_name' => trim((string) ($actor?->name ?? '')),
                'allocated_at' => now()->toDateTimeString(),
            ];
            $lockedLoan->cash_allocated_at = now();
            $lockedLoan->workflow_step = $nextStep;
            $lockedLoan->workflow_step_updated_at = now();
            $lockedLoan->save();

            $this->notifyWorkflowStepTransition($lockedLoan, $currentStep, $nextStep, $actor instanceof User ? $actor : null);

            return [
                'ok' => true,
                'message' => 'Cash allocation saved and moved to Cash Request step.',
                'data' => $lockedLoan,
                'from_step' => $currentStep,
                'to_step' => $nextStep,
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Unable to complete cash allocation.',
            ], (int) ($result['status'] ?? 422));
        }

        return response()->json([
            'message' => $result['message'],
            'data' => $result['data'],
            'from_step' => $result['from_step'],
            'to_step' => $result['to_step'],
        ]);
    }

    public function confirmSecondCallStep(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->canPerformConfiguredStepAction($request->user(), $loanRequest, 8)) {
            return response()->json([
                'message' => 'You are not allowed to complete second call confirmation based on current Action Center flow settings.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can complete second call confirmation.'
            ], 422);
        }

        $validated = $request->validate([
            'customer_full_name' => 'required|string|max:255',
            'nic_number' => 'required|string|max:255',
            'registered_mobile_number' => 'required|string|max:50',
            'date_of_birth' => 'nullable|string|max:255',
            'address' => 'required|string|max:1000',
            'loan_amount' => 'required|numeric|min:0',
            'loan_purpose' => 'nullable|string|max:1000',
            'loan_term' => 'required|string|max:255',
            'installment' => 'required|numeric|min:0',
            'payment_frequency' => 'required|string|max:100',
            'interest_rate' => 'required|numeric|min:0',
            'first_payment_date' => 'nullable|string|max:255',
            'number_of_installments' => 'required|integer|min:1',
            'confirm_customer_full_name' => 'accepted',
            'confirm_nic_number' => 'accepted',
            'confirm_registered_mobile_number' => 'accepted',
            'confirm_date_of_birth' => 'accepted',
            'confirm_address' => 'accepted',
            'confirm_loan_amount' => 'accepted',
            'confirm_loan_purpose' => 'accepted',
            'confirm_loan_term' => 'accepted',
            'confirm_installment' => 'accepted',
            'confirm_payment_frequency' => 'accepted',
            'confirm_interest_rate' => 'accepted',
            'confirm_first_payment_date' => 'accepted',
            'confirm_number_of_installments' => 'accepted',
        ]);

        $actor = $request->user();

        $result = DB::transaction(function () use ($loanRequest, $validated, $actor) {
            $lockedLoan = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            $currentStep = $this->resolveWorkflowStep($lockedLoan);
            if ($currentStep !== 8) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => sprintf('Second call confirmation is only allowed in Step 8. Current step is %d.', $currentStep),
                ];
            }

            if ($lockedLoan->status === 'hold') {
                $lockedLoan->status = 'requested';
                $lockedLoan->hold_at = null;
                $lockedLoan->hold_reason = null;
            }

            $nextStep = 9;
            $lockedLoan->second_call_confirmation_payload = [
                'customer_full_name' => trim((string) $validated['customer_full_name']),
                'nic_number' => trim((string) $validated['nic_number']),
                'registered_mobile_number' => trim((string) $validated['registered_mobile_number']),
                'date_of_birth' => trim((string) ($validated['date_of_birth'] ?? '')),
                'address' => trim((string) $validated['address']),
                'loan_amount' => round((float) $validated['loan_amount'], 2),
                'loan_purpose' => trim((string) ($validated['loan_purpose'] ?? '')),
                'loan_term' => trim((string) $validated['loan_term']),
                'installment' => round((float) $validated['installment'], 2),
                'payment_frequency' => trim((string) $validated['payment_frequency']),
                'interest_rate' => round((float) $validated['interest_rate'], 2),
                'first_payment_date' => trim((string) ($validated['first_payment_date'] ?? '')),
                'number_of_installments' => (int) $validated['number_of_installments'],
                'confirmations' => [
                    'customer_full_name' => true,
                    'nic_number' => true,
                    'registered_mobile_number' => true,
                    'date_of_birth' => true,
                    'address' => true,
                    'loan_amount' => true,
                    'loan_purpose' => true,
                    'loan_term' => true,
                    'installment' => true,
                    'payment_frequency' => true,
                    'interest_rate' => true,
                    'first_payment_date' => true,
                    'number_of_installments' => true,
                ],
                'confirmed_by_user_id' => (int) ($actor?->id ?? 0),
                'confirmed_by_name' => trim((string) ($actor?->name ?? '')),
                'confirmed_at' => now()->toDateTimeString(),
            ];
            $lockedLoan->second_call_confirmed_at = now();
            $lockedLoan->workflow_step = $nextStep;
            $lockedLoan->workflow_step_updated_at = now();
            $lockedLoan->save();

            $this->notifyWorkflowStepTransition($lockedLoan, $currentStep, $nextStep, $actor instanceof User ? $actor : null);

            return [
                'ok' => true,
                'message' => 'Second call confirmation saved and moved to Step 9: Loan Signature Check.',
                'data' => $lockedLoan,
                'from_step' => $currentStep,
                'to_step' => $nextStep,
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Unable to complete second call confirmation.',
            ], (int) ($result['status'] ?? 422));
        }

        return response()->json([
            'message' => $result['message'],
            'data' => $result['data'],
            'from_step' => $result['from_step'],
            'to_step' => $result['to_step'],
        ]);
    }

    public function confirmDocumentVerificationStep(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->canPerformConfiguredStepAction($request->user(), $loanRequest, 10)) {
            return response()->json([
                'message' => 'You are not allowed to complete document verification based on current Action Center flow settings.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['requested', 'hold'], true)) {
            return response()->json([
                'message' => 'Only requested or hold loans can complete document verification.'
            ], 422);
        }

        $validated = $request->validate([
            'documents' => 'required|array',
            'documents.customer_national_id' => 'required|array',
            'documents.passport' => 'required|array',
            'documents.driving_license' => 'required|array',
            'documents.bank_statements' => 'required|array',
            'documents.epf_reports' => 'required|array',
            'documents.tax_returns' => 'required|array',
            'documents.paysheets' => 'required|array',
            'documents.business_documents' => 'required|array',
            'documents.guarantor_image' => 'required|array',
            'documents.guarantor_signature' => 'required|array',
            'documents.customer_national_id.confirmed' => 'required|boolean',
            'documents.passport.confirmed' => 'required|boolean',
            'documents.driving_license.confirmed' => 'required|boolean',
            'documents.bank_statements.confirmed' => 'required|boolean',
            'documents.epf_reports.confirmed' => 'required|boolean',
            'documents.tax_returns.confirmed' => 'required|boolean',
            'documents.paysheets.confirmed' => 'required|boolean',
            'documents.business_documents.confirmed' => 'required|boolean',
            'documents.guarantor_image.confirmed' => 'required|boolean',
            'documents.guarantor_signature.confirmed' => 'required|boolean',
            'documents.customer_national_id.not_required' => 'required|boolean',
            'documents.passport.not_required' => 'required|boolean',
            'documents.driving_license.not_required' => 'required|boolean',
            'documents.bank_statements.not_required' => 'required|boolean',
            'documents.epf_reports.not_required' => 'required|boolean',
            'documents.tax_returns.not_required' => 'required|boolean',
            'documents.paysheets.not_required' => 'required|boolean',
            'documents.business_documents.not_required' => 'required|boolean',
            'documents.guarantor_image.not_required' => 'required|boolean',
            'documents.guarantor_signature.not_required' => 'required|boolean',
            'documents.customer_national_id.available' => 'required|boolean',
            'documents.passport.available' => 'required|boolean',
            'documents.driving_license.available' => 'required|boolean',
            'documents.bank_statements.available' => 'required|boolean',
            'documents.epf_reports.available' => 'required|boolean',
            'documents.tax_returns.available' => 'required|boolean',
            'documents.paysheets.available' => 'required|boolean',
            'documents.business_documents.available' => 'required|boolean',
            'documents.guarantor_image.available' => 'required|boolean',
            'documents.guarantor_signature.available' => 'required|boolean',
            'documents.customer_national_id.label' => 'required|string|max:255',
            'documents.passport.label' => 'required|string|max:255',
            'documents.driving_license.label' => 'required|string|max:255',
            'documents.bank_statements.label' => 'required|string|max:255',
            'documents.epf_reports.label' => 'required|string|max:255',
            'documents.tax_returns.label' => 'required|string|max:255',
            'documents.paysheets.label' => 'required|string|max:255',
            'documents.business_documents.label' => 'required|string|max:255',
            'documents.guarantor_image.label' => 'required|string|max:255',
            'documents.guarantor_signature.label' => 'required|string|max:255',
            'documents.customer_national_id.url' => 'nullable|string|max:2048',
            'documents.passport.url' => 'nullable|string|max:2048',
            'documents.driving_license.url' => 'nullable|string|max:2048',
            'documents.bank_statements.url' => 'nullable|string|max:2048',
            'documents.epf_reports.url' => 'nullable|string|max:2048',
            'documents.tax_returns.url' => 'nullable|string|max:2048',
            'documents.paysheets.url' => 'nullable|string|max:2048',
            'documents.business_documents.url' => 'nullable|string|max:2048',
            'documents.guarantor_image.url' => 'nullable|string|max:2048',
            'documents.guarantor_signature.url' => 'nullable|string|max:2048',
        ]);

        $documents = $validated['documents'];
        $nationalIdVerified = (bool) ($documents['customer_national_id']['confirmed'] ?? false);
        $nationalIdAvailable = (bool) ($documents['customer_national_id']['available'] ?? false);

        foreach ($documents as $key => $item) {
            $confirmed = (bool) ($item['confirmed'] ?? false);
            $notRequired = (bool) ($item['not_required'] ?? false);
            $available = (bool) ($item['available'] ?? false);
            $label = trim((string) ($item['label'] ?? $key));

            if (!$confirmed && !$notRequired) {
                if (
                    in_array($key, ['passport', 'driving_license'], true)
                    && $nationalIdVerified
                    && $nationalIdAvailable
                ) {
                    // Passport and driving license are optional when NIC is verified.
                } else {
                    return response()->json([
                        'message' => sprintf('%s must be either verified or marked as not required.', $label),
                    ], 422);
                }
            }

            if (!$available && !$notRequired) {
                if (
                    in_array($key, ['passport', 'driving_license'], true)
                    && $nationalIdVerified
                    && $nationalIdAvailable
                ) {
                    continue;
                }

                return response()->json([
                    'message' => sprintf('%s is missing. Upload it or mark as not required.', $label),
                ], 422);
            }
        }

        $actor = $request->user();

        $result = DB::transaction(function () use ($loanRequest, $validated, $actor) {
            $lockedLoan = MicrofinanceLoanRequest::query()
                ->where('id', (int) $loanRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            $currentStep = $this->resolveWorkflowStep($lockedLoan);
            if ($currentStep !== 10) {
                return [
                    'ok' => false,
                    'status' => 422,
                    'message' => sprintf('Document verification is only allowed in Step 10. Current step is %d.', $currentStep),
                ];
            }

            if ($lockedLoan->status === 'hold') {
                $lockedLoan->status = 'requested';
                $lockedLoan->hold_at = null;
                $lockedLoan->hold_reason = null;
            }

            $documentPayload = [];
            foreach ($validated['documents'] as $key => $item) {
                $documentPayload[$key] = [
                    'label' => trim((string) ($item['label'] ?? '')),
                    'available' => (bool) ($item['available'] ?? false),
                    'confirmed' => (bool) ($item['confirmed'] ?? false),
                    'not_required' => (bool) ($item['not_required'] ?? false),
                    'url' => trim((string) ($item['url'] ?? '')),
                ];
            }

            $nextStep = 11;
            $lockedLoan->document_verification_payload = [
                'documents' => $documentPayload,
                'verified_by_user_id' => (int) ($actor?->id ?? 0),
                'verified_by_name' => trim((string) ($actor?->name ?? '')),
                'verified_at' => now()->toDateTimeString(),
            ];
            $lockedLoan->document_verified_at = now();
            $lockedLoan->workflow_step = $nextStep;
            $lockedLoan->workflow_step_updated_at = now();
            $lockedLoan->save();

            $this->notifyWorkflowStepTransition($lockedLoan, $currentStep, $nextStep, $actor instanceof User ? $actor : null);

            return [
                'ok' => true,
                'message' => 'Document verification saved and moved to Step 11: Insurance Request.',
                'data' => $lockedLoan,
                'from_step' => $currentStep,
                'to_step' => $nextStep,
            ];
        });

        if (empty($result['ok'])) {
            return response()->json([
                'message' => $result['message'] ?? 'Unable to complete document verification.',
            ], (int) ($result['status'] ?? 422));
        }

        return response()->json([
            'message' => $result['message'],
            'data' => $result['data'],
            'from_step' => $result['from_step'],
            'to_step' => $result['to_step'],
        ]);
    }

    private function downloadLoanDocumentByTemplate(MicrofinanceLoanRequest $loanRequest, string $templateType, string $filePrefix)
    {
        $companyId = (int) ($loanRequest->branch_id ?: 0);
        if ($companyId <= 0) {
            Log::warning('Download loan document failed: No company ID for loan request', [
                'loan_id' => $loanRequest->id,
                'template_type' => $templateType,
            ]);
            return response()->json([
                'message' => 'Company is not linked to this loan request.'
            ], 422);
        }

        $template = CompanyDocumentTemplate::query()
            ->where('company_id', $companyId)
            ->where('template_type', $templateType)
            ->where('is_active', true)
            ->latest('id')
            ->first();

        if (!$template) {
            Log::warning('Download loan document failed: No active template found', [
                'company_id' => $companyId,
                'loan_id' => $loanRequest->id,
                'template_type' => $templateType,
            ]);
            return response()->json([
                'message' => 'Active template not found for this company.'
            ], 404);
        }

        if (!Storage::disk('public')->exists($template->file_path)) {
            Log::error('Download loan document failed: Template file not found', [
                'template_id' => $template->id,
                'file_path' => $template->file_path,
                'loan_id' => $loanRequest->id,
                'template_type' => $templateType,
            ]);
            return response()->json([
                'message' => 'Template file does not exist in storage.'
            ], 404);
        }

        $inputPath = Storage::disk('public')->path($template->file_path);
        $placeholderKeys = $this->extractPlaceholdersFromDocx($inputPath);
        $templateText = $this->extractTemplateTextFromDocx($inputPath);

        Log::info('Download loan document processing', [
            'loan_id' => $loanRequest->id,
            'template_id' => $template->id,
            'template_type' => $templateType,
            'placeholders_found' => count($placeholderKeys),
            'placeholder_keys' => $placeholderKeys,
            'template_text_length' => strlen($templateText),
        ]);

        if ($templateText === '') {
            return response()->json([
                'message' => 'Template text could not be extracted for AI processing.'
            ], 422);
        }

        $loanData = $this->buildLoanAgreementVariables($loanRequest->load(['route:id,name,code', 'center:id,name,code', 'group:id,name,code']));
        $company = Company::query()->find($companyId);

        if ($company) {
            $loanData['lender_name'] = (string) ($company->name ?? '');
            $loanData['lender_address'] = (string) ($company->address ?? '');
            $loanData['lender_phone'] = (string) ($company->phone ?? '');
            $loanData['company_name'] = (string) ($company->name ?? '');
            $loanData['company_address'] = (string) ($company->address ?? '');
            $loanData['company_phone'] = (string) ($company->phone ?? '');
            $loanData['company_email'] = (string) ($company->email ?? '');
            $loanData['company_website'] = (string) ($company->website ?? '');
            $loanData['company_country'] = (string) ($company->country ?? '');
            $loanData['company_currency'] = (string) ($company->currency ?? '');
        }

        $companyDetails = [
            'name' => (string) ($company?->name ?? ''),
            'address' => (string) ($company?->address ?? ''),
            'phone' => (string) ($company?->phone ?? ''),
            'email' => (string) ($company?->email ?? ''),
            'website' => (string) ($company?->website ?? ''),
            'country' => (string) ($company?->country ?? ''),
            'currency' => (string) ($company?->currency ?? ''),
        ];

        $mapping = $this->mapPlaceholdersWithOpenAi($placeholderKeys, $loanData);
        $filledTemplateText = $this->applyMappingToTemplateText($templateText, $mapping);
        $aiHtml = $this->generateAgreementHtmlWithOpenAi($filledTemplateText, $loanData, $companyDetails);

        if (trim($aiHtml) === '') {
            Log::warning('AI generation unavailable, falling back to deterministic filled content', [
                'loan_id' => $loanRequest->id,
                'template_type' => $templateType,
                'template_text_length' => strlen($templateText),
                'filled_text_length' => strlen($filledTemplateText),
            ]);
        }

        $safeAiHtml = $this->applyMappingToHtml($aiHtml, $mapping);
        $safeFilledTemplateText = $this->applyMappingToTemplateText($filledTemplateText, $mapping);
        $finalHtml = $this->buildTemplateFaithfulPdfHtml($safeFilledTemplateText, $safeAiHtml);

        Log::info('Loan document mapping completed', [
            'loan_id' => $loanRequest->id,
            'template_type' => $templateType,
            'mapping_count' => count($mapping),
            'sample_mapping' => array_slice($mapping, 0, 5),
            'used_ai_html' => $aiHtml !== '',
            'filled_text_length' => strlen($safeFilledTemplateText),
            'filled_text_preview' => mb_substr(preg_replace('/\s+/', ' ', $safeFilledTemplateText), 0, 300),
            'final_html_length' => strlen($finalHtml),
        ]);

        $downloadName = $filePrefix . '_' . ($loanRequest->customer_no ?: $loanRequest->id) . '.pdf';

        Log::info('Download loan document successful', [
            'loan_id' => $loanRequest->id,
            'template_type' => $templateType,
            'download_name' => $downloadName
        ]);

        return Pdf::loadHTML($finalHtml)
            ->setPaper('a4', 'portrait')
            ->download($downloadName);
    }

    public function downloadAgreement(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->hasReleasedLoanActionAccess($request->user())) {
            return response()->json([
                'message' => 'Only Finance Manager, Branch Manager, and Admin can download agreements.'
            ], 403);
        }

        return $this->downloadLoanDocumentByTemplate($loanRequest, 'loan_agreement', 'loan_agreement');
    }

    public function downloadReminderLetter(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->hasReleasedLoanActionAccess($request->user())) {
            return response()->json([
                'message' => 'Only Finance Manager, Branch Manager, and Admin can download reminder letters.'
            ], 403);
        }

        return $this->downloadLoanDocumentByTemplate($loanRequest, 'reminder_letter', 'reminder_letter');
    }

    public function downloadLegalLetter(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->hasReleasedLoanActionAccess($request->user())) {
            return response()->json([
                'message' => 'Only Finance Manager, Branch Manager, and Admin can download legal letters.'
            ], 403);
        }

        return $this->downloadLoanDocumentByTemplate($loanRequest, 'arrears_letter', 'legal_letter');
    }

    public function destroy(Request $request, MicrofinanceLoanRequest $loanRequest)
    {
        if (!$this->canRemoveLoan($request->user())) {
            return response()->json([
                'message' => 'Only Super Admin can remove loans.',
            ], 403);
        }

        DB::transaction(function () use ($loanRequest): void {
            foreach ($loanRequest->documents()->get() as $document) {
                $path = trim((string) $document->file_path);
                if ($path !== '' && Storage::disk('public')->exists($path)) {
                    Storage::disk('public')->delete($path);
                }
            }

            $loanRequest->collections()->withTrashed()->forceDelete();
            $loanRequest->delete();
        });

        return response()->json([
            'message' => 'Loan removed successfully.',
        ]);
    }
}
