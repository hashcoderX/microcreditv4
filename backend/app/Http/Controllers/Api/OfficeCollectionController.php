<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Microfinance\LoanCollectionController as MicrofinanceLoanCollectionController;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Finance;
use App\Models\LoanRequest;
use App\Models\LoanRequestCollection;
use App\Models\MicrofinanceLoanCollection;
use App\Models\MicrofinanceLoanRequest;
use App\Models\Mortgage;
use App\Services\SmsGatewayService;
use App\Services\WhatsappGatewayService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OfficeCollectionController extends Controller
{
    /**
     * @param array<string, mixed> $messageContext
     */
    private function sendCollectionSmsAlert(string $phone, array $messageContext): void
    {
        $trimmedPhone = trim($phone);
        if ($trimmedPhone === '') {
            return;
        }

        try {
            /** @var SmsGatewayService $smsService */
            $smsService = app(SmsGatewayService::class);
            $smsMessage = $smsService->buildCollectionMessage($messageContext);
            $smsResult = $smsService->send($trimmedPhone, $smsMessage, [
                'module' => (string) (($messageContext['module'] ?? 'Office Collection') . ' Collection'),
                'reference' => (string) ($messageContext['reference'] ?? ''),
                'customer_name' => (string) ($messageContext['customer_name'] ?? 'Customer'),
            ]);

            if (!($smsResult['ok'] ?? false)) {
                Log::warning('Office collection SMS failed', [
                    'phone' => $trimmedPhone,
                    'context' => $messageContext,
                    'result' => $smsResult,
                ]);
            }
        } catch (\Throwable $exception) {
            Log::warning('Office collection SMS dispatch exception', [
                'phone' => $trimmedPhone,
                'context' => $messageContext,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    private function dispatchOfficeCollectionSms(string $type, int $sourceId, float $amount, string $paymentDate): void
    {
        if ($type === 'loan') {
            $loan = LoanRequest::query()->find($sourceId);
            if (!$loan) {
                return;
            }

            $this->sendCollectionSmsAlert(
                (string) ($loan->customer_mobile ?? ''),
                [
                    'customer_name' => (string) ($loan->customer_full_name ?? 'Customer'),
                    'amount' => number_format($amount, 2, '.', ''),
                    'date' => $paymentDate,
                    'reference' => (string) ($loan->request_no ?? ('LOAN-' . $sourceId)),
                    'module' => 'Loan',
                ]
            );

            return;
        }

        if ($type === 'finance') {
            $finance = Finance::query()->with('customer:id,first_name,last_name,phone')->find($sourceId);
            if (!$finance) {
                return;
            }

            $customerName = trim(((string) ($finance->customer?->first_name ?? '')) . ' ' . ((string) ($finance->customer?->last_name ?? '')));
            $this->sendCollectionSmsAlert(
                (string) ($finance->customer?->phone ?? ''),
                [
                    'customer_name' => $customerName !== '' ? $customerName : 'Customer',
                    'amount' => number_format($amount, 2, '.', ''),
                    'date' => $paymentDate,
                    'reference' => 'FIN-' . $sourceId,
                    'module' => 'Finance',
                ]
            );

            return;
        }

        if ($type === 'mortgage') {
            $mortgage = Mortgage::query()->with('customer:id,first_name,last_name,phone')->find($sourceId);
            if (!$mortgage) {
                return;
            }

            $customerName = trim(((string) ($mortgage->customer?->first_name ?? '')) . ' ' . ((string) ($mortgage->customer?->last_name ?? '')));
            $this->sendCollectionSmsAlert(
                (string) ($mortgage->customer?->phone ?? ''),
                [
                    'customer_name' => $customerName !== '' ? $customerName : 'Customer',
                    'amount' => number_format($amount, 2, '.', ''),
                    'date' => $paymentDate,
                    'reference' => 'MORT-' . $sourceId,
                    'module' => 'Mortgage',
                ]
            );
        }
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
        $branchId = (int) ($request->user()?->branch_id ?? 0);
        if ($this->isAdminUser($request->user())) {
            $requested = (int) $request->get('branch_id', 0);
            return $requested > 0 ? $requested : null;
        }

        return $branchId > 0 ? $branchId : null;
    }

    private function isManagerUser(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        $designationName = strtolower(trim((string) optional($user->designation)->name));
        if ($designationName !== '' && str_contains($designationName, 'manager')) {
            return true;
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized !== '' && str_contains($normalized, 'manager')) {
                return true;
            }
        }

        return false;
    }

    private function applySearchFilter($query, string $q, array $columns): void
    {
        if ($q === '') {
            return;
        }

        $like = '%' . $q . '%';
        $query->where(function ($builder) use ($like, $columns) {
            foreach ($columns as $index => $column) {
                if ($index === 0) {
                    $builder->where($column, 'like', $like);
                } else {
                    $builder->orWhere($column, 'like', $like);
                }
            }
        });
    }

    private function resolveCustomerNo(?Customer $customer): ?string
    {
        if (!$customer) {
            return null;
        }

        $customer->repairCustomerCodeIfNeeded();
        $code = trim((string) $customer->customer_code);

        return $code !== '' ? $code : null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function searchLoanAccounts(string $q, ?int $branchId, bool $includeCompletedPreview): array
    {
        $loanQuery = LoanRequest::query()->orderByDesc('id');

        if ($includeCompletedPreview) {
            $loanQuery->whereIn('status', ['approved', 'closed']);
        } else {
            $loanQuery->where('status', 'approved');
        }

        if ($branchId !== null) {
            $loanQuery->where('branch_id', $branchId);
        }

        $this->applySearchFilter($loanQuery, $q, [
            'request_no',
            'customer_full_name',
            'customer_no',
            'loan_product',
            'customer_nic',
            'customer_mobile',
        ]);

        return $loanQuery->get()->map(function (LoanRequest $loan) {
            $totalPayable = (float) $loan->total_payable;
            $collected = (float) $loan->total_collected;
            $balance = max($totalPayable - $collected, 0);
            $dueDate = $loan->due_date ? Carbon::parse((string) $loan->due_date)->toDateString() : null;
            $nextPaymentDate = $loan->next_due_date ? Carbon::parse((string) $loan->next_due_date)->toDateString() : $dueDate;
            $canCollect = strtolower((string) $loan->status) === 'approved' && $balance > 0;

            return [
                'type' => 'loan',
                'source_id' => $loan->id,
                'reference' => $loan->request_no,
                'customer_name' => $loan->customer_full_name,
                'customer_no' => $loan->customer_no,
                'product' => $loan->loan_product,
                'installment_amount' => (float) $loan->installment_amount,
                'due_amount' => $balance,
                'paid_amount' => $collected,
                'due_date' => $dueDate,
                'next_payment_date' => $nextPaymentDate,
                'balance' => $balance,
                'status' => $loan->status,
                'can_collect' => $canCollect,
                'label' => 'Instant Loan',
                'sort_id' => $loan->id,
            ];
        })->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function searchFinanceAccounts(string $q, ?int $branchId): array
    {
        $financeQuery = Finance::query()
            ->with('customer:id,customer_code,first_name,last_name,phone,nic_passport')
            ->where('status', 'active')
            ->orderByDesc('id');

        if ($branchId !== null) {
            $financeQuery->where('branch_id', $branchId);
        }

        if ($q !== '') {
            $financeQuery->where(function ($builder) use ($q) {
                $like = '%' . $q . '%';
                $builder->where('id', 'like', $like)
                    ->orWhere('product_type', 'like', $like)
                    ->orWhere('finance_type', 'like', $like)
                    ->orWhere('asset_reference', 'like', $like)
                    ->orWhereHas('customer', function ($customerQuery) use ($like) {
                        $customerQuery->where('customer_code', 'like', $like)
                            ->orWhere('first_name', 'like', $like)
                            ->orWhere('last_name', 'like', $like)
                            ->orWhere('phone', 'like', $like)
                            ->orWhere('nic_passport', 'like', $like);
                    });
            });
        }

        return $financeQuery->get()->map(function (Finance $finance) {
            $customer = $finance->customer;
            $customerName = trim(((string) ($customer->first_name ?? '')) . ' ' . ((string) ($customer->last_name ?? '')));

            return [
                'type' => 'finance',
                'source_id' => $finance->id,
                'reference' => 'FIN-' . $finance->id,
                'customer_name' => $customerName !== '' ? $customerName : null,
                'customer_no' => $this->resolveCustomerNo($customer),
                'product' => (string) ($finance->product_type ?: $finance->finance_type ?: 'Finance'),
                'installment_amount' => (float) ($finance->installment_amount ?? 0),
                'due_amount' => (float) ($finance->due_amount ?? $finance->installment_amount ?? 0),
                'paid_amount' => (float) ($finance->total_paid_amount ?? 0),
                'due_date' => $finance->due_date ? Carbon::parse((string) $finance->due_date)->toDateString() : null,
                'next_payment_date' => $finance->due_date ? Carbon::parse((string) $finance->due_date)->toDateString() : null,
                'balance' => (float) ($finance->balance_amount ?? 0),
                'status' => $finance->status,
                'label' => 'Finance',
                'sort_id' => $finance->id,
            ];
        })->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function searchMicrofinanceAccounts(string $q, ?int $branchId, bool $includeCompletedPreview): array
    {
        $mfQuery = MicrofinanceLoanRequest::query()
            ->withSum('collections as total_collected_sum', 'collected_amount')
            ->orderByDesc('id');

        if ($includeCompletedPreview) {
            $mfQuery->whereIn('status', ['approved', 'released']);
        } else {
            $mfQuery->where('status', 'approved');
        }

        if ($branchId !== null) {
            $mfQuery->where('branch_id', $branchId);
        }

        $this->applySearchFilter($mfQuery, $q, [
            'loan_code',
            'customer_no',
            'customer_name',
            'loan_product',
        ]);

        return $mfQuery->get()->map(function (MicrofinanceLoanRequest $loan) {
            $refundable = (float) ($loan->refundable_amount ?? 0);
            $collected = (float) ($loan->total_collected_sum ?? 0);
            $balance = max($refundable - $collected, 0);
            $arrearsOutstanding = max((float) ($loan->arrears_balance ?? 0), 0);
            $dueAmount = round($arrearsOutstanding, 2);
            $canCollect = strtolower((string) $loan->status) === 'approved' && $dueAmount > 0;

            return [
                'type' => 'microfinance',
                'source_id' => $loan->id,
                'reference' => (string) ($loan->loan_code ?: ('MF-' . $loan->id)),
                'customer_name' => $loan->customer_name,
                'customer_no' => $loan->customer_no,
                'product' => (string) ($loan->loan_product ?: 'Micro Loan'),
                'installment_amount' => (float) ($loan->installment_amount ?? 0),
                'due_amount' => $dueAmount,
                'paid_amount' => $collected,
                'due_date' => $loan->due_date ? Carbon::parse((string) $loan->due_date)->toDateString() : null,
                'next_payment_date' => $loan->next_payment_date ? Carbon::parse((string) $loan->next_payment_date)->toDateString() : null,
                'balance' => $balance,
                'status' => $loan->status,
                'can_collect' => $canCollect,
                'label' => 'Micro Credit',
                'sort_id' => $loan->id,
            ];
        })->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function searchMortgageAccounts(string $q, ?int $branchId, bool $includeCompletedPreview): array
    {
        $mortgageQuery = Mortgage::query()
            ->with('customer:id,customer_code,first_name,last_name,phone,nic_passport')
            ->withSum('payments as total_paid_amount', 'amount')
            ->orderByDesc('id');

        if ($includeCompletedPreview) {
            $mortgageQuery->whereIn('status', ['approved', 'active', 'arrears', 'released']);
        } else {
            $mortgageQuery->whereIn('status', ['approved', 'active', 'arrears']);
        }

        if ($branchId !== null) {
            $mortgageQuery->where('branch_id', $branchId);
        }

        if ($q !== '') {
            $mortgageQuery->where(function ($builder) use ($q) {
                $like = '%' . $q . '%';
                $builder->where('id', 'like', $like)
                    ->orWhere('mortgage_type', 'like', $like)
                    ->orWhereHas('customer', function ($customerQuery) use ($like) {
                        $customerQuery->where('customer_code', 'like', $like)
                            ->orWhere('first_name', 'like', $like)
                            ->orWhere('last_name', 'like', $like)
                            ->orWhere('phone', 'like', $like)
                            ->orWhere('nic_passport', 'like', $like);
                    });
            });
        }

        return $mortgageQuery->get()->map(function (Mortgage $mortgage) {
            $customer = $mortgage->customer;
            $customerName = trim(((string) ($customer->first_name ?? '')) . ' ' . ((string) ($customer->last_name ?? '')));
            $duePrincipal = (float) ($mortgage->due_amount ?? 0);
            $dueInterest = (float) ($mortgage->due_interest_amount ?? 0);
            $dueTotal = round($duePrincipal + $dueInterest, 2);
            $canCollect = in_array(strtolower((string) $mortgage->status), ['approved', 'active', 'arrears'], true)
                && $dueTotal > 0;

            return [
                'type' => 'mortgage',
                'source_id' => $mortgage->id,
                'reference' => 'MORT-' . $mortgage->id,
                'customer_name' => $customerName !== '' ? $customerName : null,
                'customer_no' => $this->resolveCustomerNo($customer),
                'product' => ucfirst((string) ($mortgage->mortgage_type ?: 'Mortgage')),
                'installment_amount' => (float) ($mortgage->installment_amount ?? 0),
                'due_amount' => $dueTotal,
                'paid_amount' => (float) ($mortgage->total_paid_amount ?? 0),
                'due_date' => $mortgage->due_date ? Carbon::parse((string) $mortgage->due_date)->toDateString() : null,
                'next_payment_date' => $mortgage->due_date ? Carbon::parse((string) $mortgage->due_date)->toDateString() : null,
                'balance' => $dueTotal,
                'status' => $mortgage->status,
                'can_collect' => $canCollect,
                'label' => 'Mortgage',
                'sort_id' => $mortgage->id,
            ];
        })->all();
    }

    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'type' => ['nullable', 'in:all,loan,finance,microfinance,mortgage'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $q = trim((string) ($validated['q'] ?? ''));
        $type = (string) ($validated['type'] ?? 'all');
        $page = max(1, (int) ($validated['page'] ?? 1));
        $perPage = max(5, min(100, (int) ($validated['per_page'] ?? 15)));
        $branchId = $this->scopedBranchId($request);
        $includeCompletedLoanPreview = $this->isAdminUser($request->user()) || $this->isManagerUser($request->user());

        $accounts = [];

        if ($type === 'all' || $type === 'loan') {
            $accounts = array_merge($accounts, $this->searchLoanAccounts($q, $branchId, $includeCompletedLoanPreview));
        }
        if ($type === 'all' || $type === 'finance') {
            $accounts = array_merge($accounts, $this->searchFinanceAccounts($q, $branchId));
        }
        if ($type === 'all' || $type === 'microfinance') {
            $accounts = array_merge($accounts, $this->searchMicrofinanceAccounts($q, $branchId, $includeCompletedLoanPreview));
        }
        if ($type === 'all' || $type === 'mortgage') {
            $accounts = array_merge($accounts, $this->searchMortgageAccounts($q, $branchId, $includeCompletedLoanPreview));
        }

        usort($accounts, static function (array $a, array $b) {
            return ((int) ($b['sort_id'] ?? 0)) <=> ((int) ($a['sort_id'] ?? 0));
        });

        $stats = [
            'loan' => 0,
            'finance' => 0,
            'microfinance' => 0,
            'mortgage' => 0,
        ];
        foreach ($accounts as $row) {
            $rowType = (string) ($row['type'] ?? '');
            if (isset($stats[$rowType])) {
                $stats[$rowType]++;
            }
        }

        $total = count($accounts);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);
        $offset = ($page - 1) * $perPage;
        $pageRows = array_slice($accounts, $offset, $perPage);

        $data = array_map(static function (array $row) {
            unset($row['sort_id']);

            return $row;
        }, $pageRows);

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
                'from' => $total > 0 ? $offset + 1 : null,
                'to' => $total > 0 ? min($offset + $perPage, $total) : null,
            ],
            'stats' => [
                'total' => $total,
                'loan' => $stats['loan'],
                'finance' => $stats['finance'],
                'microfinance' => $stats['microfinance'],
                'mortgage' => $stats['mortgage'],
            ],
        ]);
    }

    public function collect(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:loan,finance,microfinance,mortgage'],
            'source_id' => ['required', 'integer', 'min:1'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_date' => ['required', 'date'],
            'payment_type' => ['nullable', 'string', 'max:30'],
            'payment_reference' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:1000'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'cheque_no' => ['nullable', 'string', 'max:100'],
            'cheque_date' => ['nullable', 'date'],
            'cheque_bank' => ['nullable', 'string', 'max:120'],
        ]);

        $type = (string) $validated['type'];
        $sourceId = (int) $validated['source_id'];
        $amount = (float) $validated['amount'];
        $paymentDate = (string) $validated['payment_date'];
        $paymentType = strtolower((string) ($validated['payment_type'] ?? 'cash'));
        $reference = trim((string) ($validated['payment_reference'] ?? $validated['reference_no'] ?? ''));
        $note = $validated['note'] ?? null;

        $response = match ($type) {
            'loan' => $this->collectLoan($request, $sourceId, $amount, $paymentDate, $paymentType, $reference, $note),
            'finance' => $this->collectFinance($request, $sourceId, $amount, $paymentDate, $paymentType, $reference, $note, $validated),
            'microfinance' => $this->collectMicrofinance($request, $sourceId, $amount, $paymentDate, $paymentType, $reference, $note),
            'mortgage' => $this->collectMortgage($request, $sourceId, $amount, $paymentDate, $paymentType, $note),
            default => null,
        };

        if ($response === null) {
            return response()->json(['message' => 'Unsupported collection type.'], 422);
        }

        if ($response->getStatusCode() >= 400) {
            return $response;
        }

        $payload = $response->getData(true);
        if (!is_array($payload)) {
            return $response;
        }

        $payload['receipt'] = $this->buildReceipt(
            $type,
            $sourceId,
            $amount,
            $paymentDate,
            $paymentType,
            $reference,
            $note,
            $payload
        );

        if ($type === 'loan') {
            $loan = data_get($payload, 'loan');
            $phone = trim((string) (data_get($loan, 'customer_mobile') ?? ''));
            if ($phone !== '') {
                /** @var SmsGatewayService $smsService */
                $smsService = app(SmsGatewayService::class);
                $messageContext = [
                    'customer_name' => (string) (data_get($loan, 'customer_full_name') ?? 'Customer'),
                    'amount' => number_format($amount, 2, '.', ''),
                    'date' => $paymentDate,
                    'reference' => (string) (data_get($loan, 'request_no') ?? ('LOAN-' . $sourceId)),
                    'module' => 'Loan',
                ];
                $smsMessage = $smsService->buildCollectionMessage($messageContext);
                $smsService->send($phone, $smsMessage, [
                    'module' => 'Loan Collection',
                    'reference' => (string) (data_get($loan, 'request_no') ?? ('LOAN-' . $sourceId)),
                    'customer_name' => (string) (data_get($loan, 'customer_full_name') ?? 'Customer'),
                    'branch_id' => isset($payload['branch_id']) ? (int) $payload['branch_id'] : null,
                ]);

                /** @var WhatsappGatewayService $whatsappService */
                $whatsappService = app(WhatsappGatewayService::class);
                $whatsappMessage = $whatsappService->buildCollectionMessage($messageContext);
                $whatsappService->send($phone, $whatsappMessage);
            }
        }

        // Send SMS for successful finance/mortgage office collections. Loan path
        // already sends SMS/WhatsApp above; microfinance is handled in
        // Microfinance\LoanCollectionController to avoid duplicate sends.
        if (in_array($type, ['finance', 'mortgage'], true)) {
            $this->dispatchOfficeCollectionSms($type, $sourceId, $amount, $paymentDate);
        }

        return response()->json($payload, $response->getStatusCode());
    }

    /**
     * @param  array<string, mixed>  $collectPayload
     * @return array<string, mixed>
     */
    private function buildReceipt(
        string $type,
        int $sourceId,
        float $paidAmount,
        string $paymentDate,
        string $paymentType,
        string $reference,
        ?string $note,
        array $collectPayload
    ): array {
        $billPrefix = strtoupper(substr($type, 0, 3));
        $collectionId = (int) (
            data_get($collectPayload, 'data.id')
            ?? data_get($collectPayload, 'collection.id')
            ?? data_get($collectPayload, 'id')
            ?? 0
        );
        $billNo = sprintf('BILL-%s-%d-%s', $billPrefix, $sourceId, $collectionId > 0 ? $collectionId : now()->format('YmdHis'));

        $principalPaid = 0.0;
        $interestPaid = 0.0;
        $penaltyPaid = 0.0;
        $arrearsBefore = 0.0;
        $arrearsAfter = 0.0;
        $outstanding = 0.0;
        $totalPaidCumulative = 0.0;
        $installmentAmount = 0.0;
        $nextDueDate = null;
        $referenceCode = '';
        $customerName = '';
        $customerNo = null;
        $productLabel = '';
        $loanProduct = '';

        if ($type === 'loan') {
            $loan = data_get($collectPayload, 'loan');
            $productLabel = 'Instant Loan';
            $referenceCode = (string) (data_get($loan, 'request_no') ?: ('LOAN-' . $sourceId));
            $customerName = (string) (data_get($loan, 'customer_full_name') ?: '');
            $customerNo = data_get($loan, 'customer_no');
            $loanProduct = (string) (data_get($loan, 'loan_product') ?: '');
            $installmentAmount = (float) (data_get($loan, 'installment_amount') ?? 0);
            $totalPayable = (float) (data_get($loan, 'total_payable') ?? 0);
            $totalPaidCumulative = (float) (data_get($loan, 'total_collected') ?? 0);
            $outstanding = max($totalPayable - $totalPaidCumulative, 0);
            $principalPaid = round($paidAmount, 2);
            $nextDueDate = data_get($loan, 'next_due_date') ?: data_get($loan, 'due_date');
        } elseif ($type === 'finance') {
            $calc = (array) (data_get($collectPayload, 'calculation') ?? []);
            $collection = data_get($collectPayload, 'collection');
            $finance = Finance::with('customer')->find($sourceId);

            $productLabel = 'Finance';
            $referenceCode = 'FIN-' . $sourceId;
            $customerName = trim(
                ((string) optional(optional($finance)->customer)->first_name) . ' ' .
                ((string) optional(optional($finance)->customer)->last_name)
            );
            $customerNo = $this->resolveCustomerNo(optional($finance)->customer);
            $loanProduct = (string) (optional($finance)->product_type ?: optional($finance)->finance_type ?: 'Finance');
            $installmentAmount = (float) (optional($finance)->installment_amount ?? 0);
            $principalPaid = (float) ($calc['principal_paid'] ?? data_get($collection, 'principal_paid') ?? 0);
            $interestPaid = (float) ($calc['interest_paid'] ?? data_get($collection, 'interest_paid') ?? 0);
            $arrearsBefore = (float) (data_get($collection, 'meta.opening_arrears') ?? optional($finance)->arrears ?? 0);
            $arrearsAfter = (float) ($calc['new_arrears'] ?? optional($finance)->arrears ?? 0);
            $outstanding = (float) ($calc['balance_amount'] ?? optional($finance)->balance_amount ?? 0);
            $totalPaidCumulative = (float) ($calc['total_paid_amount'] ?? optional($finance)->total_paid_amount ?? 0);
            $nextDueDate = optional($finance)->due_date;
        } elseif ($type === 'microfinance') {
            $breakdown = (array) (data_get($collectPayload, 'breakdown') ?? []);
            $collection = data_get($collectPayload, 'data');
            $loan = MicrofinanceLoanRequest::find($sourceId);

            $productLabel = 'Micro Credit';
            $referenceCode = (string) (optional($loan)->loan_code ?: ('MF-' . $sourceId));
            $customerName = (string) (optional($loan)->customer_name ?: '');
            $customerNo = optional($loan)->customer_no;
            $loanProduct = (string) (optional($loan)->loan_product ?: 'Micro Loan');
            $installmentAmount = (float) (optional($loan)->installment_amount ?? 0);
            $principalPaid = (float) ($breakdown['capital_amount'] ?? data_get($collection, 'capital_amount') ?? 0);
            $interestPaid = (float) ($breakdown['interest_amount'] ?? data_get($collection, 'interest_amount') ?? 0);
            $penaltyPaid = (float) ($breakdown['penalty_amount'] ?? data_get($collection, 'penalty_amount') ?? 0);
            $arrearsBefore = (float) ($breakdown['arrears_outstanding_before'] ?? 0);
            $arrearsOutstandingAfter = (float) ($breakdown['arrears_outstanding_after'] ?? optional($loan)->arrears_balance ?? 0);
            $extraPaymentAfter = (float) ($breakdown['extra_payment_after'] ?? 0);
            $arrearsAfter = max($arrearsOutstandingAfter - $extraPaymentAfter, 0);
            $refundable = (float) (optional($loan)->refundable_amount ?? 0);
            $totalPaidCumulative = (float) MicrofinanceLoanCollection::query()
                ->where('mf_loan_request_id', $sourceId)
                ->sum('collected_amount');
            $outstanding = max($refundable - $totalPaidCumulative, 0);
            $nextDueDate = data_get($collectPayload, 'loan_dates.due_date') ?: optional($loan)->due_date;
        } elseif ($type === 'mortgage') {
            $mortgage = Mortgage::with('customer')->find($sourceId);

            $productLabel = 'Mortgage';
            $referenceCode = 'MORT-' . $sourceId;
            $customerName = trim(
                ((string) optional(optional($mortgage)->customer)->first_name) . ' ' .
                ((string) optional(optional($mortgage)->customer)->last_name)
            );
            $customerNo = $this->resolveCustomerNo(optional($mortgage)->customer);
            $loanProduct = ucfirst((string) (optional($mortgage)->mortgage_type ?: 'Mortgage'));
            $installmentAmount = (float) (optional($mortgage)->installment_amount ?? 0);
            $principalPaid = (float) (data_get($collectPayload, 'principal_paid') ?? 0);
            $interestPaid = (float) (data_get($collectPayload, 'interest_paid') ?? 0);
            $arrearsBefore = 0.0;
            $arrearsAfter = (float) (data_get($collectPayload, 'arrears_amount') ?? optional($mortgage)->arrears_amount ?? 0);
            $duePrincipal = (float) (data_get($collectPayload, 'due_amount') ?? optional($mortgage)->due_amount ?? 0);
            $dueInterest = (float) (data_get($collectPayload, 'due_interest_amount') ?? optional($mortgage)->due_interest_amount ?? 0);
            $outstanding = round($duePrincipal + $dueInterest, 2);
            $totalPaidCumulative = (float) (optional($mortgage)->total_paid_amount ?? 0);
            $nextDueDate = data_get($collectPayload, 'due_date') ?: optional($mortgage)->due_date;
        }

        return [
            'bill_no' => $billNo,
            'product_type' => $type,
            'product_label' => $productLabel,
            'reference' => $referenceCode,
            'source_id' => $sourceId,
            'customer_name' => $customerName,
            'customer_no' => $customerNo,
            'loan_product' => $loanProduct,
            'payment_date' => $paymentDate,
            'payment_type' => $paymentType,
            'payment_reference' => $reference !== '' ? $reference : null,
            'paid_amount' => round($paidAmount, 2),
            'principal_paid' => round($principalPaid, 2),
            'interest_paid' => round($interestPaid, 2),
            'penalty_paid' => round($penaltyPaid, 2),
            'arrears_before' => round($arrearsBefore, 2),
            'arrears_after' => round($arrearsAfter, 2),
            'outstanding' => round($outstanding, 2),
            'total_paid_cumulative' => round($totalPaidCumulative, 2),
            'installment_amount' => round($installmentAmount, 2),
            'next_due_date' => $nextDueDate ? Carbon::parse((string) $nextDueDate)->toDateString() : null,
            'note' => $note,
            'collection_id' => $collectionId > 0 ? $collectionId : null,
            'printed_at' => now()->toDateTimeString(),
        ];
    }

    private function collectLoan(
        Request $request,
        int $loanRequestId,
        float $amount,
        string $paymentDate,
        string $paymentType,
        string $reference,
        ?string $note
    ): JsonResponse {
        $query = LoanRequest::query()->where('status', 'approved');
        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null) {
            $query->where('branch_id', $branchId);
        }

        $loan = $query->findOrFail($loanRequestId);

        $mappedType = in_array($paymentType, ['cash', 'bank_transfer', 'cheque', 'check'], true)
            ? ($paymentType === 'check' ? 'cheque' : $paymentType)
            : 'cash';

        if ($mappedType !== 'cash' && $reference === '') {
            return response()->json(['message' => 'Payment reference is required for non-cash payments.'], 422);
        }

        $collection = DB::transaction(function () use ($loan, $request, $amount, $paymentDate, $mappedType, $reference, $note) {
            $created = LoanRequestCollection::create([
                'loan_request_id' => $loan->id,
                'collection_date' => $paymentDate,
                'collected_amount' => $amount,
                'payment_type' => $mappedType,
                'payment_reference' => $reference !== '' ? $reference : null,
                'note' => $note,
                'created_by' => $request->user()?->id,
            ]);

            $loan->total_collected = round(((float) $loan->total_collected) + $amount, 2);

            if (!$loan->due_date) {
                $loan->due_date = $paymentDate;
                $loan->next_due_date = $this->shiftInstallmentDate(Carbon::parse($paymentDate), (string) $loan->installment_frequency)->toDateString();
            } elseif ($amount + 0.0001 >= (float) $loan->installment_amount) {
                $baseDate = $loan->next_due_date
                    ? Carbon::parse((string) $loan->next_due_date)
                    : Carbon::parse((string) $loan->due_date);
                $loan->next_due_date = $this->shiftInstallmentDate($baseDate, (string) $loan->installment_frequency)->toDateString();
                $loan->due_date = $loan->next_due_date;
            }

            $totalPayable = (float) $loan->total_payable;
            if ($loan->total_collected + 0.0001 >= $totalPayable && $totalPayable > 0) {
                $loan->status = 'closed';
            }

            $loan->save();

            return $created;
        });

        return response()->json([
            'message' => 'Instant loan installment collected successfully.',
            'data' => $collection,
            'loan' => $loan->fresh(),
        ]);
    }

    private function shiftInstallmentDate(Carbon $date, string $frequency): Carbon
    {
        $normalized = strtolower(trim($frequency));
        if ($normalized === 'weekly') {
            return $date->copy()->addWeek();
        }
        if ($normalized === 'daily') {
            return $date->copy()->addDay();
        }

        return $date->copy()->addMonth();
    }

    private function collectFinance(
        Request $request,
        int $financeId,
        float $amount,
        string $paymentDate,
        string $paymentType,
        string $reference,
        ?string $note,
        array $validated
    ): JsonResponse {
        $payTypeMap = [
            'bank' => 'bank_transfer',
            'transfer' => 'bank_transfer',
            'check' => 'cheque',
        ];
        $payType = $payTypeMap[$paymentType] ?? $paymentType;
        if (!in_array($payType, ['cash', 'bank_transfer', 'cheque', 'card', 'online'], true)) {
            $payType = 'cash';
        }

        $inner = Request::create(
            '/api/finances/' . $financeId . '/collections',
            'POST',
            [
                'payment_date' => $paymentDate,
                'payment_amount' => $amount,
                'pay_type' => $payType,
                'reference_no' => $reference !== '' ? $reference : null,
                'cheque_no' => $validated['cheque_no'] ?? null,
                'cheque_date' => $validated['cheque_date'] ?? null,
                'cheque_bank' => $validated['cheque_bank'] ?? null,
            ]
        );
        $inner->headers->set('Accept', 'application/json');
        $inner->setUserResolver(fn () => $request->user());

        return app(FinanceController::class)->storeCollection($inner, $financeId);
    }

    private function collectMicrofinance(
        Request $request,
        int $loanRequestId,
        float $amount,
        string $paymentDate,
        string $paymentType,
        string $reference,
        ?string $note
    ): JsonResponse {
        $mfTypeMap = [
            'cheque' => 'check',
            'bank' => 'bank_transfer',
            'transfer' => 'bank_transfer',
        ];
        $mfType = $mfTypeMap[$paymentType] ?? $paymentType;
        if (!in_array($mfType, ['cash', 'check', 'bank_transfer'], true)) {
            $mfType = 'cash';
        }

        $inner = Request::create(
            '/api/microfinance/collections',
            'POST',
            [
                'loan_request_id' => $loanRequestId,
                'collection_date' => $paymentDate,
                'collected_amount' => $amount,
                'payment_type' => $mfType,
                'payment_reference' => $reference !== '' ? $reference : null,
                'note' => $note,
            ]
        );
        $inner->headers->set('Accept', 'application/json');
        $inner->setUserResolver(fn () => $request->user());

        return app(MicrofinanceLoanCollectionController::class)->store($inner);
    }

    private function collectMortgage(
        Request $request,
        int $mortgageId,
        float $amount,
        string $paymentDate,
        string $paymentType,
        ?string $note
    ): JsonResponse {
        $methodMap = [
            'bank_transfer' => 'bank',
            'transfer' => 'transfer',
            'cheque' => 'cheque',
            'check' => 'cheque',
            'card' => 'card',
        ];
        $method = $methodMap[$paymentType] ?? $paymentType;
        if (!in_array($method, ['cash', 'bank', 'transfer', 'cheque', 'card'], true)) {
            $method = 'cash';
        }

        $inner = Request::create(
            '/api/mortgages/' . $mortgageId . '/payments',
            'POST',
            [
                'amount' => $amount,
                'paid_date' => $paymentDate,
                'payment_method' => $method,
                'remarks' => $note,
            ]
        );
        $inner->headers->set('Accept', 'application/json');
        $inner->setUserResolver(fn () => $request->user());

        return app(MortgageController::class)->storePayment($inner, $mortgageId);
    }
}
