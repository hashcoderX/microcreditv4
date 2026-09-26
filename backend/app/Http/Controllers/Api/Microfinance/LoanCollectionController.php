<?php

namespace App\Http\Controllers\Api\Microfinance;

use App\Http\Controllers\Controller;
use App\Models\EmployeeWallet;
use App\Models\MicrofinanceLoanCollection;
use App\Models\MicrofinanceLoanRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class LoanCollectionController extends Controller
{
    private const CACHE_VERSION_KEY = 'mf_collections:version';
    private const INDEX_CACHE_TTL_SECONDS = 20;

    private function cacheVersion(): int
    {
        return max((int) Cache::get(self::CACHE_VERSION_KEY, 1), 1);
    }

    private function bumpCacheVersion(): void
    {
        if (!Cache::has(self::CACHE_VERSION_KEY)) {
            Cache::forever(self::CACHE_VERSION_KEY, 1);
        }

        Cache::increment(self::CACHE_VERSION_KEY);
    }

    private function cacheScopeKey(Request $request, bool $includeDeleted, bool $compact, int $limit, int $loanRequestId): string
    {
        $user = $request->user();
        $scope = $this->isAdminUser($user)
            ? 'admin'
            : ('branch_' . ((int) ($user?->branch_id ?? 0)));

        return implode(':', [
            'mf_collections',
            'index',
            'v' . $this->cacheVersion(),
            $scope,
            'deleted_' . ($includeDeleted ? '1' : '0'),
            'compact_' . ($compact ? '1' : '0'),
            'loan_' . ($loanRequestId > 0 ? $loanRequestId : 'all'),
            'limit_' . ($limit > 0 ? $limit : 'all'),
        ]);
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

    private function ensureCollectorWallet(
        MicrofinanceLoanRequest $loanRequest,
        User $collectorUser,
        int $employeeId
    ): ?EmployeeWallet {
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

        return EmployeeWallet::create([
            'tenant_id' => (int) ($employee->tenant_id ?? $loanRequest->tenant_id ?? $loanRequest->branch_id ?? 1),
            'branch_id' => (int) ($employee->branch_id ?? $loanRequest->branch_id ?? 1),
            'employee_id' => $employeeId,
            'wallet_no' => $this->generateUniqueWalletNo($employeeId),
            'opening_balance' => 0,
            'current_balance' => 0,
            'status' => 'active',
        ]);
    }

    private function adjustCollectorWalletBalance(MicrofinanceLoanRequest $loanRequest, ?int $createdByUserId, float $amountDelta): void
    {
        if ($amountDelta == 0.0 || !$createdByUserId) {
            return;
        }

        $collectorUser = User::query()->with('employee')->find((int) $createdByUserId);
        if (!$collectorUser) {
            return;
        }

        $employeeId = (int) ($collectorUser->employee_id ?? 0);
        if ($employeeId <= 0) {
            return;
        }

        $wallet = $this->ensureCollectorWallet($loanRequest, $collectorUser, $employeeId);
        if (!$wallet) {
            return;
        }

        $newBalance = round((float) ($wallet->current_balance ?? 0) + $amountDelta, 2);
        $wallet->setAttribute('current_balance', $newBalance);
        $wallet->save();
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
        $requestedBranchId = (int) ($request->get('branch_id', 0));

        if ($this->isAdminUser($request->user())) {
            return $requestedBranchId > 0 ? $requestedBranchId : null;
        }

        $branchId = (int) ($request->user()?->branch_id ?? 0);
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

    private function alignDateToMeetingDay(\DateTimeImmutable $date, ?string $meetingDay): \DateTimeImmutable
    {
        $normalizedDay = strtolower(trim((string) $meetingDay));
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

        $targetDow = $dayMap[$normalizedDay];
        $currentDow = (int) $date->format('w');
        $delta = ($targetDow - $currentDow + 7) % 7;

        return $date->modify('+' . $delta . ' days');
    }

    private function shiftDateByRefundOption(
        \DateTimeImmutable $date,
        string $refundOption,
        int $steps = 1,
        ?string $meetingDay = null
    ): \DateTimeImmutable
    {
        if ($steps === 0) {
            return $this->alignDateToMeetingDay($date, $meetingDay);
        }

        $interval = '+1 month';
        if ($refundOption === 'day') {
            $interval = '+1 day';
        } elseif ($refundOption === 'week') {
            $interval = '+7 days';
        }

        $cursor = $date;
        $iterations = abs($steps);

        for ($i = 0; $i < $iterations; $i++) {
            if ($steps > 0) {
                $cursor = $cursor->modify($interval);
            } else {
                $cursor = $cursor->modify(str_replace('+', '-', $interval));
            }

            $cursor = $this->alignDateToMeetingDay($cursor, $meetingDay);
        }

        return $cursor;
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $includeDeletedRequested = filter_var($request->get('include_deleted', false), FILTER_VALIDATE_BOOLEAN);
        $canViewDeleted = $this->isAdminUser($user) || $this->isManagerUser($user);
        $includeDeleted = $includeDeletedRequested && $canViewDeleted;
        $compact = filter_var($request->get('compact', false), FILTER_VALIDATE_BOOLEAN);
        $loanRequestId = (int) $request->get('loan_request_id', 0);
        $limit = (int) $request->get('limit', 0);
        if ($limit < 0) {
            $limit = 0;
        }
        if ($limit > 2000) {
            $limit = 2000;
        }

        $cacheKey = $this->cacheScopeKey($request, $includeDeleted, $compact, $limit, $loanRequestId);

        $payload = Cache::remember($cacheKey, now()->addSeconds(self::INDEX_CACHE_TTL_SECONDS), function () use ($request, $includeDeleted, $compact, $limit, $loanRequestId) {
            $query = MicrofinanceLoanCollection::query()
                ->orderByDesc('id');

            if ($compact) {
                $query->select(['id', 'mf_loan_request_id', 'collected_amount', 'collection_date']);
            } else {
                $query->with([
                    'loanRequest:id,branch_id,customer_no,customer_name,nic,field_officer,loan_code,mf_route_id,mf_center_id,mf_group_id,loan_scope,refund_option,status,loan_amount,net_disbursed_amount,loan_request_date,created_at,installment_amount,refundable_amount',
                    'loanRequest.route:id,name,code',
                    'loanRequest.center:id,name,code,meeting_day,mf_route_id',
                    'loanRequest.group:id,name,code,mf_center_id,mf_route_id',
                    'deletedByUser:id,name,email',
                ]);
            }

            if ($includeDeleted) {
                $query->withTrashed();
            }

            if ($loanRequestId > 0) {
                $query->where('mf_loan_request_id', $loanRequestId);
            }

            $branchId = $this->scopedBranchId($request);
            if ($branchId !== null) {
                $query->whereHas('loanRequest', function ($loanQuery) use ($branchId) {
                    $loanQuery->where('branch_id', $branchId);
                });
            }

            if ($limit > 0) {
                $query->limit($limit);
            }

            if ($compact) {
                return $query->get()->map(function (MicrofinanceLoanCollection $collection) {
                    $collectionDate = $collection->collection_date;
                    if ($collectionDate instanceof \DateTimeInterface) {
                        $collectionDate = $collectionDate->format('Y-m-d');
                    }

                    return [
                        'id' => (int) $collection->id,
                        'mf_loan_request_id' => (int) $collection->mf_loan_request_id,
                        'collected_amount' => (float) ($collection->collected_amount ?? 0),
                        'collection_date' => $collectionDate ? (string) $collectionDate : null,
                    ];
                })->values()->all();
            }

            return $query->get()->map(function (MicrofinanceLoanCollection $collection) {
                $payload = $collection->toArray();
                $collectionDate = $collection->collection_date;
                if ($collectionDate instanceof \DateTimeInterface) {
                    $payload['collection_date'] = $collectionDate->format('Y-m-d');
                } else {
                    $payload['collection_date'] = $collectionDate ? (string) $collectionDate : null;
                }
                $interestAmount = (float) ($collection->interest_amount ?? 0);
                $penaltyAmount = (float) ($collection->penalty_amount ?? 0);
                $payload['profit_amount'] = round($interestAmount + $penaltyAmount, 2);
                $payload['is_deleted'] = $collection->trashed();
                $payload['deleted_by_name'] = $collection->deletedByUser?->name;
                $payload['deleted_by_email'] = $collection->deletedByUser?->email;

                return $payload;
            })->values()->all();
        });

        return response()->json($payload);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'loan_request_id' => 'required|exists:mf_loan_requests,id',
            'collection_date' => 'required|date',
            'collected_amount' => 'required|numeric|min:0.01',
            'payment_type' => 'required|in:cash,check,bank_transfer',
            'payment_reference' => 'nullable|string|max:255|required_unless:payment_type,cash',
            'note' => 'nullable|string|max:1000',
            'client_reference' => 'nullable|string|max:64',
        ]);

        if (!empty($validated['client_reference'])) {
            $existing = MicrofinanceLoanCollection::query()
                ->where('client_reference', $validated['client_reference'])
                ->first();

            if ($existing) {
                $loanRequest = MicrofinanceLoanRequest::find($existing->mf_loan_request_id);
                $breakdown = [
                    'arrears_outstanding_before' => null,
                    'arrears_deducted' => null,
                    'arrears_outstanding_after' => round((float) ($loanRequest?->arrears_balance ?? 0), 2),
                    'extra_payment_after' => null,
                    'capital_amount' => round((float) ($existing->capital_amount ?? 0), 2),
                    'interest_amount' => round((float) ($existing->interest_amount ?? 0), 2),
                    'penalty_amount' => round((float) ($existing->penalty_amount ?? 0), 2),
                    'outstanding_principal_after' => null,
                ];

                return response()->json([
                    'message' => 'Collection already synced.',
                    'data' => $existing,
                    'loan_dates' => [
                        'next_payment_date' => $loanRequest?->next_payment_date,
                        'due_date' => $loanRequest?->due_date,
                    ],
                    'breakdown' => $breakdown,
                    'receipt' => $loanRequest
                        ? $this->buildReceipt(
                            $loanRequest,
                            $existing,
                            $breakdown,
                            (string) ($loanRequest->due_date ?? ''),
                            (string) ($existing->payment_type ?? 'cash'),
                            $existing->payment_reference,
                            $existing->note
                        )
                        : null,
                    'synced_from_offline' => true,
                ], 200);
            }
        }

        $loanRequest = MicrofinanceLoanRequest::with('center:id,meeting_day')->findOrFail((int)$validated['loan_request_id']);
        $meetingDay = (string) optional($loanRequest->center)->meeting_day;

        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null && (int) ($loanRequest->branch_id ?? 0) !== $branchId) {
            return response()->json([
                'message' => 'You can collect payments only for loans in your branch.'
            ], 403);
        }

        if (!in_array($loanRequest->status, ['approved', 'released'], true)) {
            return response()->json([
                'message' => 'Collections can be added only for approved or released loans.'
            ], 422);
        }

        $loanAmount = (float)$loanRequest->loan_amount;
        $termCount = max((int)$loanRequest->terms_count, 1);
        $installmentAmount = (float)$loanRequest->installment_amount;

        $principalPerInstallment = $loanAmount / $termCount;
        $interestPerInstallment = max($installmentAmount - $principalPerInstallment, 0);

        $collectedAmount = (float)$validated['collected_amount'];
        $totalCollectedAmount = (float) MicrofinanceLoanCollection::query()
            ->where('mf_loan_request_id', $loanRequest->id)
            ->sum('collected_amount');
        $outstandingAmount = max((float) $loanRequest->refundable_amount - $totalCollectedAmount, 0);

        if ($collectedAmount - $outstandingAmount > 0.0001) {
            return response()->json([
                'message' => 'Collected amount cannot be greater than outstanding amount.',
                'outstanding_amount' => round($outstandingAmount, 2),
            ], 422);
        }

        $collectionDate = new \DateTimeImmutable((string)$validated['collection_date']);
        $dueCursor = !empty($loanRequest->due_date)
            ? new \DateTimeImmutable((string)$loanRequest->due_date)
            : $collectionDate;
        $dueCursor = $this->alignDateToMeetingDay($dueCursor, $meetingDay);
        $refundOption = (string)($loanRequest->refund_option ?: 'month');

        $accrualCapDate = $collectionDate;
        if (!empty($loanRequest->loan_end_date)) {
            try {
                $loanEndDate = new \DateTimeImmutable((string) $loanRequest->loan_end_date);
                if ($loanEndDate < $accrualCapDate) {
                    $accrualCapDate = $loanEndDate;
                }
            } catch (\Throwable) {
                // Ignore invalid loan_end_date
            }
        }

        $arrearsBalanceBefore = (float)($loanRequest->arrears_balance ?? 0);
        $accruedInstallmentCount = 0;

        // Accrue expected installments for all due cycles reached by collection date.
        while ($dueCursor <= $accrualCapDate) {
            $arrearsBalanceBefore += $installmentAmount;
            $dueCursor = $this->shiftDateByRefundOption($dueCursor, $refundOption, 1, $meetingDay);
            $accruedInstallmentCount++;
        }

        $arrearsOutstandingBefore = max($arrearsBalanceBefore, 0);
        $arrearsDeducted = min($collectedAmount, $arrearsOutstandingBefore);
        $arrearsBalanceAfterPayment = $arrearsBalanceBefore - $collectedAmount;
        $arrearsOutstandingAfter = max($arrearsBalanceAfterPayment, 0);
        $extraPaymentAfter = max(-$arrearsBalanceAfterPayment, 0);

        $penaltyRate = (float)($loanRequest->penalty_rate ?? 0);
        $graceDays = max((int)($loanRequest->penalty_grace_days ?? 2), 0);
        $lateDays = 0;
        $penaltyAmount = 0.0;

        if (!empty($loanRequest->due_date) && $penaltyRate > 0) {
            $dueDate = new \DateTimeImmutable((string)$loanRequest->due_date);
            $payDate = new \DateTimeImmutable((string)$validated['collection_date']);
            $dayDiff = (int)$dueDate->diff($payDate)->format('%r%a');

            if ($dayDiff > $graceDays) {
                $lateDays = $dayDiff - $graceDays;
                // Daily penalty based on installment amount and penalty rate.
                $penaltyAmount = ($installmentAmount * $penaltyRate * $lateDays) / 100;
            }
        }

        $totalCapitalCollected = (float)MicrofinanceLoanCollection::query()
            ->where('mf_loan_request_id', $loanRequest->id)
            ->sum('capital_amount');

        $outstandingPrincipal = max($loanAmount - $totalCapitalCollected, 0);

        // For accounting split, allocate from collected amount after penalty.
        // Arrears remains a schedule-tracking figure and should not zero-out principal/interest split.
        $remainingAfterPenalty = max($collectedAmount - $penaltyAmount, 0);
        $interestAmount = min($remainingAfterPenalty, $interestPerInstallment);
        $capitalAmount = max($remainingAfterPenalty - $interestAmount, 0);

        if ($capitalAmount > $outstandingPrincipal) {
            $overflow = $capitalAmount - $outstandingPrincipal;
            $capitalAmount = $outstandingPrincipal;
            $interestAmount += $overflow;
        }

        $collection = null;

        $nextPaymentBaseDate = !empty($loanRequest->next_payment_date)
            ? new \DateTimeImmutable((string)$loanRequest->next_payment_date)
            : $collectionDate;
        $nextPaymentBaseDate = $this->alignDateToMeetingDay($nextPaymentBaseDate, $meetingDay);

        if ($collectionDate > $nextPaymentBaseDate) {
            $nextPaymentBaseDate = $collectionDate;
        }

        $dueBaseDate = !empty($loanRequest->due_date)
            ? new \DateTimeImmutable((string)$loanRequest->due_date)
            : $collectionDate;
        $dueBaseDate = $this->alignDateToMeetingDay($dueBaseDate, $meetingDay);

        if ($collectionDate > $dueBaseDate) {
            $dueBaseDate = $collectionDate;
        }

        DB::transaction(function () use (
            $request,
            $validated,
            $loanRequest,
            $collectedAmount,
            $capitalAmount,
            $interestAmount,
            $penaltyAmount,
            $nextPaymentBaseDate,
            $meetingDay,
            $dueCursor,
            $arrearsBalanceAfterPayment,
            $outstandingPrincipal,
            &$collection
        ): void {
            $collection = MicrofinanceLoanCollection::create([
                'mf_loan_request_id' => $loanRequest->id,
                'collection_date' => $validated['collection_date'],
                'collected_amount' => $collectedAmount,
                'capital_amount' => $capitalAmount,
                'interest_amount' => $interestAmount,
                'penalty_amount' => $penaltyAmount,
                'payment_type' => $validated['payment_type'],
                'payment_reference' => $validated['payment_reference'] ?? null,
                'note' => $validated['note'] ?? null,
                'client_reference' => $validated['client_reference'] ?? null,
                'created_by' => optional($request->user())->id,
            ]);

            $loanRequest->next_payment_date = $this->shiftDateByRefundOption(
                $nextPaymentBaseDate,
                (string) $loanRequest->refund_option,
                1,
                $meetingDay
            )->format('Y-m-d');

            // Due date must represent the next unpaid schedule point after accrual.
            $loanRequest->due_date = $dueCursor->format('Y-m-d');
            $loanRequest->arrears_balance = round($arrearsBalanceAfterPayment, 2);

            if ((float) ($outstandingPrincipal - $capitalAmount) <= 0.01) {
                $loanRequest->status = 'released';
            }

            $loanRequest->save();

            // Credit collector wallet with received payment amount.
            $this->adjustCollectorWalletBalance($loanRequest, (int) ($collection?->created_by ?? 0), (float) $collectedAmount);
        });

        if (!$collection instanceof MicrofinanceLoanCollection) {
            return response()->json([
                'message' => 'Failed to save collection record.'
            ], 500);
        }

        $this->bumpCacheVersion();

        $breakdown = [
            'arrears_outstanding_before' => round($arrearsOutstandingBefore, 2),
            'arrears_deducted' => round($arrearsDeducted, 2),
            'arrears_outstanding_after' => round($arrearsOutstandingAfter, 2),
            'extra_payment_after' => round($extraPaymentAfter, 2),
            'accrued_installment_count' => $accruedInstallmentCount,
            'capital_amount' => round($capitalAmount, 2),
            'interest_amount' => round($interestAmount, 2),
            'penalty_amount' => round($penaltyAmount, 2),
            'penalty_rate' => round($penaltyRate, 4),
            'grace_days' => $graceDays,
            'late_days' => $lateDays,
            'profit_amount' => round($interestAmount + $penaltyAmount, 2),
            'business_fund_amount' => round($capitalAmount, 2),
            'outstanding_principal_after' => round(max($outstandingPrincipal - $capitalAmount, 0), 2),
        ];

        return response()->json([
            'message' => 'Collection saved successfully.',
            'data' => $collection,
            'loan_dates' => [
                'next_payment_date' => $loanRequest->next_payment_date,
                'due_date' => $loanRequest->due_date,
            ],
            'breakdown' => $breakdown,
            'receipt' => $this->buildReceipt(
                $loanRequest,
                $collection,
                $breakdown,
                (string) $loanRequest->due_date,
                (string) $validated['payment_type'],
                $validated['payment_reference'] ?? null,
                $validated['note'] ?? null
            ),
        ], 201);
    }

    public function destroy(Request $request, MicrofinanceLoanCollection $collection)
    {
        $user = $request->user();
        if (!$this->isAdminUser($user) && !$this->isManagerUser($user)) {
            return response()->json([
                'message' => 'Only manager-level users can delete payment invoices.'
            ], 403);
        }

        if ($collection->trashed()) {
            return response()->json([
                'message' => 'Invoice is already deleted.'
            ], 422);
        }

        $validated = $request->validate([
            'deletion_reason' => 'nullable|string|max:500',
        ]);

        $loanRequest = MicrofinanceLoanRequest::find($collection->mf_loan_request_id);
        if (!$loanRequest) {
            return response()->json([
                'message' => 'Loan request not found for this invoice.'
            ], 404);
        }

        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null && (int) ($loanRequest->branch_id ?? 0) !== $branchId) {
            return response()->json([
                'message' => 'You can delete invoices only for loans in your branch.'
            ], 403);
        }

        DB::transaction(function () use ($request, $collection, $validated, $loanRequest): void {
            // Reverse collector wallet balance for deleted invoice amount.
            $this->adjustCollectorWalletBalance($loanRequest, (int) ($collection->created_by ?? 0), 0 - (float) ($collection->collected_amount ?? 0));

            $collection->deleted_by = optional($request->user())->id;
            $collection->deletion_reason = $validated['deletion_reason'] ?? null;
            $collection->save();
            $collection->delete();

            $this->rebuildLoanStateFromCollections($loanRequest);
        });

        $this->bumpCacheVersion();

        return response()->json([
            'message' => 'Invoice deleted successfully. Loan balances and related totals were reversed.',
        ]);
    }

    private function rebuildLoanStateFromCollections(MicrofinanceLoanRequest $loanRequest): void
    {
        $loanRequest->loadMissing('center:id,meeting_day');
        $loanAmount = (float) $loanRequest->loan_amount;
        $termCount = max((int) $loanRequest->terms_count, 1);
        $installmentAmount = (float) $loanRequest->installment_amount;
        $refundOption = (string) ($loanRequest->refund_option ?: 'month');
        $meetingDay = (string) optional($loanRequest->center)->meeting_day;

        $loanEndDate = null;
        if (!empty($loanRequest->loan_end_date)) {
            try {
                $loanEndDate = new \DateTimeImmutable((string) $loanRequest->loan_end_date);
            } catch (\Throwable) {
                $loanEndDate = null;
            }
        }

        $firstDueDate = $this->resolveFirstDueDate($loanRequest, $refundOption, $termCount);
        $dueCursor = $firstDueDate;
        $nextPaymentDate = $firstDueDate;

        $arrearsBalance = 0.0;
        $totalCapitalCollected = 0.0;

        $collections = MicrofinanceLoanCollection::query()
            ->where('mf_loan_request_id', $loanRequest->id)
            ->orderBy('collection_date')
            ->orderBy('id')
            ->get();

        foreach ($collections as $row) {
            $collectionDate = new \DateTimeImmutable((string) $row->collection_date);
            $accrualCapDate = $collectionDate;
            if ($loanEndDate instanceof \DateTimeImmutable && $loanEndDate < $accrualCapDate) {
                $accrualCapDate = $loanEndDate;
            }
            $collectedAmount = (float) $row->collected_amount;

            while ($dueCursor <= $accrualCapDate) {
                $arrearsBalance += $installmentAmount;
                $dueCursor = $this->shiftDateByRefundOption($dueCursor, $refundOption, 1, $meetingDay);
            }

            $arrearsBalance = round($arrearsBalance - $collectedAmount, 2);
            $totalCapitalCollected += (float) $row->capital_amount;

            if ($collectionDate > $nextPaymentDate) {
                $nextPaymentDate = $collectionDate;
            }

            $nextPaymentDate = $this->shiftDateByRefundOption($nextPaymentDate, $refundOption, 1, $meetingDay);
        }

        $graceDays = max((int) ($loanRequest->penalty_grace_days ?? 2), 0);
        $outstandingPrincipal = max($loanAmount - $totalCapitalCollected, 0);

        $loanRequest->setAttribute('loan_balance', number_format($outstandingPrincipal, 2, '.', ''));
        $loanRequest->arrears_balance = round($arrearsBalance, 2);
        $loanRequest->setAttribute('due_date', $dueCursor->format('Y-m-d'));
        $loanRequest->next_payment_date = $nextPaymentDate->format('Y-m-d');
        $loanRequest->penalty_starts_on = $dueCursor->modify('+' . ($graceDays + 1) . ' days')->format('Y-m-d');
        $loanRequest->status = $outstandingPrincipal <= 0.01 ? 'released' : 'approved';
        $loanRequest->save();
    }

    /**
     * @param  array<string, mixed>  $breakdown
     * @return array<string, mixed>
     */
    private function buildReceipt(
        MicrofinanceLoanRequest $loanRequest,
        MicrofinanceLoanCollection $collection,
        array $breakdown,
        ?string $nextDueDate,
        string $paymentType,
        ?string $paymentReference,
        ?string $note
    ): array {
        $referenceCode = (string) ($loanRequest->loan_code ?: ('MF-' . $loanRequest->id));
        $refundable = (float) ($loanRequest->refundable_amount ?? 0);
        $totalPaidCumulative = (float) MicrofinanceLoanCollection::query()
            ->where('mf_loan_request_id', $loanRequest->id)
            ->sum('collected_amount');
        $arrearsAfter = (float) ($breakdown['arrears_outstanding_after'] ?? $loanRequest->arrears_balance ?? 0);
        $extraAfter = (float) ($breakdown['extra_payment_after'] ?? 0);

        return [
            'bill_no' => sprintf('BILL-MIC-%d-%d', $loanRequest->id, $collection->id),
            'product_type' => 'microfinance',
            'product_label' => 'Micro Credit',
            'reference' => $referenceCode,
            'source_id' => (int) $loanRequest->id,
            'customer_name' => (string) ($loanRequest->customer_name ?: ''),
            'customer_no' => $loanRequest->customer_no,
            'loan_product' => 'Micro Loan',
            'payment_date' => (string) $collection->collection_date,
            'payment_type' => $paymentType,
            'payment_reference' => $paymentReference !== null && $paymentReference !== '' ? $paymentReference : null,
            'paid_amount' => round((float) $collection->collected_amount, 2),
            'principal_paid' => round((float) ($breakdown['capital_amount'] ?? $collection->capital_amount ?? 0), 2),
            'interest_paid' => round((float) ($breakdown['interest_amount'] ?? $collection->interest_amount ?? 0), 2),
            'penalty_paid' => round((float) ($breakdown['penalty_amount'] ?? $collection->penalty_amount ?? 0), 2),
            'arrears_before' => round((float) ($breakdown['arrears_outstanding_before'] ?? 0), 2),
            'arrears_after' => round(max($arrearsAfter - $extraAfter, 0), 2),
            'outstanding' => round(max($refundable - $totalPaidCumulative, 0), 2),
            'total_paid_cumulative' => round($totalPaidCumulative, 2),
            'installment_amount' => round((float) ($loanRequest->installment_amount ?? 0), 2),
            'next_due_date' => $nextDueDate
                ? Carbon::parse($nextDueDate)->toDateString()
                : null,
            'note' => $note,
            'collection_id' => (int) $collection->id,
            'printed_at' => now()->toDateTimeString(),
        ];
    }

    private function resolveFirstDueDate(MicrofinanceLoanRequest $loanRequest, string $refundOption, int $termCount): \DateTimeImmutable
    {
        $meetingDay = (string) optional($loanRequest->center)->meeting_day;

        if (!empty($loanRequest->loan_end_date)) {
            $loanEndDate = new \DateTimeImmutable((string) $loanRequest->loan_end_date);
            if ($termCount <= 1) {
                return $this->alignDateToMeetingDay($loanEndDate, $meetingDay);
            }

            return $this->shiftDateByRefundOption($loanEndDate, $refundOption, 0 - ($termCount - 1), $meetingDay);
        }

        if (!empty($loanRequest->next_payment_date)) {
            return $this->alignDateToMeetingDay(new \DateTimeImmutable((string) $loanRequest->next_payment_date), $meetingDay);
        }

        if (!empty($loanRequest->due_date)) {
            return $this->alignDateToMeetingDay(new \DateTimeImmutable((string) $loanRequest->due_date), $meetingDay);
        }

        return $this->alignDateToMeetingDay(new \DateTimeImmutable(date('Y-m-d')), $meetingDay);
    }
}
