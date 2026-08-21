<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\SavingsAccount;
use App\Models\SavingsAccountTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SavingsAccountController extends Controller
{
    /** @var list<string> */
    private const ACCOUNT_TYPES = ['savings', 'current', 'fixed_deposit', 'investment'];

    /** @var list<string> */
    private const INTEREST_TYPES = [
        'simple_interest',
        'compound_interest',
        'monthly_payout',
        'quarterly_payout',
        'annual_payout',
        'maturity_payout',
        'tiered_interest',
        'auto_sweep_interest',
    ];

    private function defaultInterestTypeForAccount(string $accountType): string
    {
        return match ($accountType) {
            'fixed_deposit' => 'maturity_payout',
            'investment' => 'compound_interest',
            default => 'simple_interest',
        };
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

    private function isSuperAdminUser(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        $configured = strtolower(trim((string) env('SYSTEM_SUPER_ADMIN_EMAIL', 'superadmin@softcodelk.com')));
        $email = strtolower(trim((string) ($user->email ?? '')));
        if ($email !== '' && ($email === 'superadmin@softcodelk.com' || $email === $configured)) {
            return true;
        }

        $designationName = strtolower(trim((string) optional($user->designation)->name));
        if ($designationName !== '' && str_contains($designationName, 'super admin')) {
            return true;
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized !== '' && str_contains($normalized, 'super admin')) {
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

    private function applySavingsBranchScope($query, Request $request, string $column = 'branch_id')
    {
        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null) {
            $query->where($column, $branchId);
        }

        return $query;
    }

    private function resolveAccountOrFail(Request $request, int $id, array $with = []): SavingsAccount
    {
        $query = SavingsAccount::query();
        if (!empty($with)) {
            $query->with($with);
        }

        $this->applySavingsBranchScope($query, $request);

        return $query->findOrFail($id);
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = (int) ($request->get('per_page', 20));

        $query = SavingsAccount::with(['customer:id,customer_code,first_name,last_name,phone'])
            ->orderByDesc('id');

        $this->applySavingsBranchScope($query, $request);

        if ($request->filled('customer_id')) {
            $query->where('customer_id', (int) $request->get('customer_id'));
        }

        if ($request->filled('customer_no')) {
            $customer = $this->findCustomerByCodeOrSerial((string) $request->get('customer_no'));
            if ($customer) {
                $query->where('customer_id', $customer->id);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        if ($request->filled('account_type')) {
            $query->where('account_type', (string) $request->get('account_type'));
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->get('status'));
        }

        if ($request->filled('q')) {
            $search = (string) $request->get('q');
            $query->where(function ($q) use ($search) {
                $q->where('account_number', 'like', '%' . $search . '%')
                    ->orWhereHas('customer', function ($customerQuery) use ($search) {
                        $customerQuery->where('customer_code', 'like', '%' . $search . '%')
                            ->orWhere('first_name', 'like', '%' . $search . '%')
                            ->orWhere('last_name', 'like', '%' . $search . '%')
                            ->orWhere('phone', 'like', '%' . $search . '%');
                    });
            });
        }

        return response()->json($query->paginate($perPage));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_no' => ['nullable', 'string', 'max:60'],
            'account_type' => ['required', 'in:' . implode(',', self::ACCOUNT_TYPES)],
            'interest_type' => ['nullable', 'in:' . implode(',', self::INTEREST_TYPES)],
            'opening_deposit' => ['nullable', 'numeric', 'min:0'],
            'interest_rate' => ['nullable', 'numeric', 'min:0'],
            'opened_at' => ['nullable', 'date'],
            'status' => ['nullable', 'in:active,dormant,closed'],
        ]);

        $customer = null;
        if (!empty($validated['customer_id'])) {
            $customer = Customer::find((int) $validated['customer_id']);
        }
        if (!$customer && !empty($validated['customer_no'])) {
            $customer = $this->findCustomerByCodeOrSerial((string) $validated['customer_no']);
        }

        if (!$customer) {
            return response()->json([
                'message' => 'Customer not found. Register customer first before opening an account.',
            ], 422);
        }

        $scopedBranchId = $this->scopedBranchId($request);
        if ($scopedBranchId !== null && (int) ($customer->branch_id ?? 0) !== $scopedBranchId) {
            return response()->json([
                'message' => 'You can open accounts only for customers in your branch.',
            ], 403);
        }

        $openingDeposit = round((float) ($validated['opening_deposit'] ?? 0), 2);
        $accountType = (string) $validated['account_type'];

        $account = SavingsAccount::create([
            'tenant_id' => $request->user()?->tenant_id ?? 1,
            'branch_id' => $request->user()?->branch_id ?? $customer->branch_id,
            'customer_id' => $customer->id,
            'account_number' => $this->generateAccountNumber($accountType),
            'account_type' => $accountType,
            'opening_deposit' => $openingDeposit,
            'balance' => $openingDeposit,
            'interest_rate' => round((float) ($validated['interest_rate'] ?? 0), 4),
            'interest_type' => (string) ($validated['interest_type'] ?? $this->defaultInterestTypeForAccount($accountType)),
            'opened_at' => $validated['opened_at'] ?? now()->toDateString(),
            'status' => (string) ($validated['status'] ?? 'active'),
            'created_by' => $request->user()?->id,
        ]);

        return response()->json($account->load('customer:id,customer_code,first_name,last_name,phone'), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $account = $this->resolveAccountOrFail($request, $id, [
            'customer:id,customer_code,first_name,last_name,phone',
            'transactions' => function ($query) {
                $query->orderByDesc('transaction_date')->orderByDesc('id')->limit(30);
            },
        ]);
        return response()->json($account);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if (!$this->isSuperAdminUser($request->user())) {
            return response()->json([
                'message' => 'Only superadmin can edit accounts.',
            ], 403);
        }

        $validated = $request->validate([
            'interest_type' => ['sometimes', 'required', 'in:' . implode(',', self::INTEREST_TYPES)],
            'interest_rate' => ['sometimes', 'required', 'numeric', 'min:0'],
            'opened_at' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', 'required', 'in:active,dormant,closed'],
        ]);

        $account = $this->resolveAccountOrFail($request, $id);

        $payload = [];
        if (array_key_exists('interest_type', $validated)) {
            $payload['interest_type'] = (string) $validated['interest_type'];
        }
        if (array_key_exists('interest_rate', $validated)) {
            $payload['interest_rate'] = round((float) $validated['interest_rate'], 4);
        }
        if (array_key_exists('opened_at', $validated)) {
            $payload['opened_at'] = $validated['opened_at'] ?: null;
        }
        if (array_key_exists('status', $validated)) {
            $payload['status'] = (string) $validated['status'];
        }

        if (!empty($payload)) {
            $account->update($payload);
        }

        return response()->json($account->fresh()->load('customer:id,customer_code,first_name,last_name,phone'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json([
                'message' => 'Only admin can remove accounts.',
            ], 403);
        }

        $account = $this->resolveAccountOrFail($request, $id);

        if (SavingsAccountTransaction::query()->where('savings_account_id', $account->id)->exists()) {
            return response()->json([
                'message' => 'This account has transactions and cannot be removed.',
            ], 422);
        }

        $account->delete();

        return response()->json([
            'message' => 'Account removed successfully.',
        ]);
    }

    public function transactions(Request $request, int $id): JsonResponse
    {
        $account = $this->resolveAccountOrFail($request, $id);
        $perPage = (int) ($request->get('per_page', 20));

        $query = SavingsAccountTransaction::where('savings_account_id', $account->id)
            ->orderByDesc('transaction_date')
            ->orderByDesc('id');

        if ($request->filled('transaction_type')) {
            $query->where('transaction_type', (string) $request->get('transaction_type'));
        }

        return response()->json($query->paginate($perPage));
    }

    public function ledgerReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'account_type' => ['nullable', 'in:' . implode(',', self::ACCOUNT_TYPES)],
            'status' => ['nullable', 'in:active,dormant,closed'],
            'transaction_type' => ['nullable', 'in:deposit,withdrawal'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $perPage = (int) ($validated['per_page'] ?? 25);

        $baseQuery = SavingsAccountTransaction::query()
            ->with([
                'savingsAccount:id,customer_id,account_number,account_type,status,balance',
                'savingsAccount.customer:id,customer_code,first_name,last_name,phone',
            ])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id');

        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null) {
            $baseQuery->whereHas('savingsAccount', function ($query) use ($branchId) {
                $query->where('branch_id', $branchId);
            });
        }

        if (!empty($validated['from_date'])) {
            $baseQuery->whereDate('transaction_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $baseQuery->whereDate('transaction_date', '<=', $validated['to_date']);
        }

        if (!empty($validated['transaction_type'])) {
            $baseQuery->where('transaction_type', $validated['transaction_type']);
        }

        if (!empty($validated['account_type'])) {
            $accountType = strtolower(trim((string) $validated['account_type']));
            $baseQuery->whereHas('savingsAccount', function ($query) use ($accountType) {
                $query->whereRaw('LOWER(account_type) = ?', [$accountType]);
            });
        }

        if (!empty($validated['status'])) {
            $status = strtolower(trim((string) $validated['status']));
            $baseQuery->whereHas('savingsAccount', function ($query) use ($status) {
                $query->whereRaw('LOWER(status) = ?', [$status]);
            });
        }

        if (!empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $baseQuery->where(function ($query) use ($search) {
                $query
                    ->where('reference_no', 'like', "%{$search}%")
                    ->orWhere('note', 'like', "%{$search}%")
                    ->orWhereHas('savingsAccount', function ($accountQuery) use ($search) {
                        $accountQuery
                            ->where('account_number', 'like', "%{$search}%")
                            ->orWhereHas('customer', function ($customerQuery) use ($search) {
                                $customerQuery
                                    ->where('customer_code', 'like', "%{$search}%")
                                    ->orWhere('first_name', 'like', "%{$search}%")
                                    ->orWhere('last_name', 'like', "%{$search}%")
                                    ->orWhere('phone', 'like', "%{$search}%");
                            });
                    });
            });
        }

        $summaryQuery = clone $baseQuery;

        $summary = [
            'total_transactions' => (int) (clone $summaryQuery)->count(),
            'total_deposits' => (float) ((clone $summaryQuery)->where('transaction_type', 'deposit')->sum('amount') ?: 0),
            'total_withdrawals' => (float) ((clone $summaryQuery)->where('transaction_type', 'withdrawal')->sum('amount') ?: 0),
            'accounts_touched' => (int) (clone $summaryQuery)->distinct('savings_account_id')->count('savings_account_id'),
            'latest_transaction_date' => (clone $summaryQuery)->max('transaction_date'),
        ];

        $summary['net_movement'] = round((float) $summary['total_deposits'] - (float) $summary['total_withdrawals'], 2);

        $records = $baseQuery->paginate($perPage);

        return response()->json([
            'summary' => $summary,
            'data' => $records,
            'filters' => [
                'from_date' => $validated['from_date'] ?? null,
                'to_date' => $validated['to_date'] ?? null,
                'account_type' => $validated['account_type'] ?? null,
                'status' => $validated['status'] ?? null,
                'transaction_type' => $validated['transaction_type'] ?? null,
                'search' => $validated['search'] ?? null,
            ],
        ]);
    }

    public function depositGrowthReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'account_type' => ['nullable', 'in:' . implode(',', self::ACCOUNT_TYPES)],
            'status' => ['nullable', 'in:active,dormant,closed'],
            'group_by' => ['nullable', 'in:day,month'],
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        $groupBy = (string) ($validated['group_by'] ?? 'month');

        $baseQuery = SavingsAccountTransaction::query()
            ->join('savings_accounts', 'savings_accounts.id', '=', 'savings_account_transactions.savings_account_id')
            ->leftJoin('customers', 'customers.id', '=', 'savings_accounts.customer_id')
            ->where('savings_account_transactions.transaction_type', 'deposit');

        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null) {
            $baseQuery->where('savings_accounts.branch_id', $branchId);
        }

        if (!empty($validated['from_date'])) {
            $baseQuery->whereDate('savings_account_transactions.transaction_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $baseQuery->whereDate('savings_account_transactions.transaction_date', '<=', $validated['to_date']);
        }

        if (!empty($validated['account_type'])) {
            $baseQuery->whereRaw('LOWER(savings_accounts.account_type) = ?', [strtolower(trim((string) $validated['account_type']))]);
        }

        if (!empty($validated['status'])) {
            $baseQuery->whereRaw('LOWER(savings_accounts.status) = ?', [strtolower(trim((string) $validated['status']))]);
        }

        if (!empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $baseQuery->where(function ($query) use ($search) {
                $query
                    ->where('savings_accounts.account_number', 'like', "%{$search}%")
                    ->orWhere('customers.customer_code', 'like', "%{$search}%")
                    ->orWhere('customers.first_name', 'like', "%{$search}%")
                    ->orWhere('customers.last_name', 'like', "%{$search}%")
                    ->orWhere('customers.phone', 'like', "%{$search}%")
                    ->orWhere('savings_account_transactions.reference_no', 'like', "%{$search}%")
                    ->orWhere('savings_account_transactions.note', 'like', "%{$search}%");
            });
        }

        $summaryQuery = clone $baseQuery;

        $totalDepositAmount = (float) ((clone $summaryQuery)->sum('savings_account_transactions.amount') ?: 0);
        $totalDepositTransactions = (int) ((clone $summaryQuery)->count());
        $uniqueAccounts = (int) ((clone $summaryQuery)->distinct('savings_account_transactions.savings_account_id')->count('savings_account_transactions.savings_account_id'));

        $periodExpression = $groupBy === 'day'
            ? "DATE(savings_account_transactions.transaction_date)"
            : "DATE_FORMAT(savings_account_transactions.transaction_date, '%Y-%m-01')";

        $periodRows = (clone $baseQuery)
            ->selectRaw($periodExpression . ' as period')
            ->selectRaw('SUM(savings_account_transactions.amount) as amount')
            ->selectRaw('COUNT(*) as transactions_count')
            ->selectRaw('COUNT(DISTINCT savings_account_transactions.savings_account_id) as accounts_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $periods = [];
        $previousAmount = null;
        foreach ($periodRows as $row) {
            $currentAmount = round((float) ($row->amount ?? 0), 2);
            $growthPercent = null;

            if ($previousAmount !== null) {
                if ($previousAmount == 0.0) {
                    $growthPercent = $currentAmount > 0 ? 100.0 : 0.0;
                } else {
                    $growthPercent = round((($currentAmount - $previousAmount) / $previousAmount) * 100, 2);
                }
            }

            $periods[] = [
                'period' => $row->period,
                'deposit_amount' => $currentAmount,
                'deposit_transactions' => (int) ($row->transactions_count ?? 0),
                'accounts_count' => (int) ($row->accounts_count ?? 0),
                'previous_amount' => $previousAmount,
                'growth_percent' => $growthPercent,
            ];

            $previousAmount = $currentAmount;
        }

        $firstAmount = count($periods) > 0 ? (float) ($periods[0]['deposit_amount'] ?? 0) : 0.0;
        $lastAmount = count($periods) > 0 ? (float) ($periods[count($periods) - 1]['deposit_amount'] ?? 0) : 0.0;
        $overallGrowthPercent = null;
        if (count($periods) > 1) {
            if ($firstAmount == 0.0) {
                $overallGrowthPercent = $lastAmount > 0 ? 100.0 : 0.0;
            } else {
                $overallGrowthPercent = round((($lastAmount - $firstAmount) / $firstAmount) * 100, 2);
            }
        }

        $summary = [
            'total_deposit_amount' => round($totalDepositAmount, 2),
            'total_deposit_transactions' => $totalDepositTransactions,
            'avg_deposit_amount' => $totalDepositTransactions > 0 ? round($totalDepositAmount / $totalDepositTransactions, 2) : 0.0,
            'unique_accounts' => $uniqueAccounts,
            'periods_count' => count($periods),
            'first_period_amount' => round($firstAmount, 2),
            'last_period_amount' => round($lastAmount, 2),
            'overall_growth_percent' => $overallGrowthPercent,
        ];

        return response()->json([
            'summary' => $summary,
            'periods' => $periods,
            'filters' => [
                'from_date' => $validated['from_date'] ?? null,
                'to_date' => $validated['to_date'] ?? null,
                'account_type' => $validated['account_type'] ?? null,
                'status' => $validated['status'] ?? null,
                'group_by' => $groupBy,
                'search' => $validated['search'] ?? null,
            ],
        ]);
    }

    public function maturityReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'status' => ['nullable', 'in:active,dormant,closed'],
            'maturity_state' => ['nullable', 'in:upcoming,matured'],
            'tenure_months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'window_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $tenureMonths = (int) ($validated['tenure_months'] ?? 12);
        $perPage = (int) ($validated['per_page'] ?? 25);
        $windowDays = isset($validated['window_days']) ? (int) $validated['window_days'] : null;

        $maturityExpression = "DATE_ADD(COALESCE(savings_accounts.opened_at, DATE(savings_accounts.created_at)), INTERVAL {$tenureMonths} MONTH)";

        $baseQuery = SavingsAccount::query()
            ->with(['customer:id,customer_code,first_name,last_name,phone'])
            ->where('account_type', 'fixed_deposit')
            ->select('savings_accounts.*')
            ->selectRaw($maturityExpression . ' as estimated_maturity_date')
            ->selectRaw('DATEDIFF(' . $maturityExpression . ', CURDATE()) as days_to_maturity');

        $this->applySavingsBranchScope($baseQuery, $request, 'savings_accounts.branch_id');

        if (!empty($validated['status'])) {
            $baseQuery->whereRaw('LOWER(savings_accounts.status) = ?', [strtolower(trim((string) $validated['status']))]);
        }

        if (!empty($validated['from_date'])) {
            $baseQuery->whereRaw($maturityExpression . ' >= ?', [$validated['from_date']]);
        }

        if (!empty($validated['to_date'])) {
            $baseQuery->whereRaw($maturityExpression . ' <= ?', [$validated['to_date']]);
        }

        if (!empty($validated['maturity_state'])) {
            if ($validated['maturity_state'] === 'upcoming') {
                $baseQuery->whereRaw('DATEDIFF(' . $maturityExpression . ', CURDATE()) >= 0');
            }

            if ($validated['maturity_state'] === 'matured') {
                $baseQuery->whereRaw('DATEDIFF(' . $maturityExpression . ', CURDATE()) < 0');
            }
        }

        if ($windowDays !== null) {
            $baseQuery->whereRaw('DATEDIFF(' . $maturityExpression . ', CURDATE()) BETWEEN 0 AND ?', [$windowDays]);
        }

        if (!empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $baseQuery->where(function ($query) use ($search) {
                $query
                    ->where('savings_accounts.account_number', 'like', "%{$search}%")
                    ->orWhere('savings_accounts.status', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($customerQuery) use ($search) {
                        $customerQuery
                            ->where('customer_code', 'like', "%{$search}%")
                            ->orWhere('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    });
            });
        }

        $summaryQuery = clone $baseQuery;

        $summary = [
            'total_accounts' => (int) (clone $summaryQuery)->count(),
            'total_balance' => (float) ((clone $summaryQuery)->sum('savings_accounts.balance') ?: 0),
            'upcoming_accounts' => (int) ((clone $summaryQuery)->whereRaw('DATEDIFF(' . $maturityExpression . ', CURDATE()) >= 0')->count()),
            'matured_accounts' => (int) ((clone $summaryQuery)->whereRaw('DATEDIFF(' . $maturityExpression . ', CURDATE()) < 0')->count()),
        ];

        $summary['avg_balance'] = $summary['total_accounts'] > 0
            ? round((float) $summary['total_balance'] / (float) $summary['total_accounts'], 2)
            : 0.0;

        $records = $baseQuery
            ->orderByRaw($maturityExpression . ' asc')
            ->orderByDesc('savings_accounts.id')
            ->paginate($perPage);

        return response()->json([
            'summary' => $summary,
            'data' => $records,
            'filters' => [
                'from_date' => $validated['from_date'] ?? null,
                'to_date' => $validated['to_date'] ?? null,
                'status' => $validated['status'] ?? null,
                'maturity_state' => $validated['maturity_state'] ?? null,
                'tenure_months' => $tenureMonths,
                'window_days' => $windowDays,
                'search' => $validated['search'] ?? null,
            ],
        ]);
    }

    public function deposit(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'transaction_date' => ['nullable', 'date'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $account = $this->resolveAccountOrFail($request, $id);

        if ($account->status === 'closed') {
            return response()->json([
                'message' => 'Cannot post transactions to a closed account.',
            ], 422);
        }

        $amount = round((float) $validated['amount'], 2);

        $transaction = DB::transaction(function () use ($account, $amount, $validated, $request) {
            $before = round((float) $account->balance, 2);
            $after = round($before + $amount, 2);

            $row = SavingsAccountTransaction::create([
                'savings_account_id' => $account->id,
                'transaction_type' => 'deposit',
                'amount' => $amount,
                'balance_before' => $before,
                'balance_after' => $after,
                'transaction_date' => $validated['transaction_date'] ?? now()->toDateString(),
                'reference_no' => $validated['reference_no'] ?? null,
                'note' => $validated['note'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            $account->setAttribute('balance', number_format($after, 2, '.', ''));
            $account->save();

            return $row;
        });

        return response()->json([
            'message' => 'Deposit posted successfully.',
            'account' => $account->fresh('customer:id,customer_code,first_name,last_name,phone'),
            'transaction' => $transaction,
        ], 201);
    }

    public function withdraw(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'transaction_date' => ['nullable', 'date'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $account = $this->resolveAccountOrFail($request, $id);

        if ($account->status === 'closed') {
            return response()->json([
                'message' => 'Cannot post transactions to a closed account.',
            ], 422);
        }

        $amount = round((float) $validated['amount'], 2);
        $currentBalance = round((float) $account->balance, 2);
        if ($amount > $currentBalance) {
            return response()->json([
                'message' => 'Insufficient balance for withdrawal.',
            ], 422);
        }

        $transaction = DB::transaction(function () use ($account, $amount, $validated, $request) {
            $before = round((float) $account->balance, 2);
            $after = round(max($before - $amount, 0), 2);

            $row = SavingsAccountTransaction::create([
                'savings_account_id' => $account->id,
                'transaction_type' => 'withdrawal',
                'amount' => $amount,
                'balance_before' => $before,
                'balance_after' => $after,
                'transaction_date' => $validated['transaction_date'] ?? now()->toDateString(),
                'reference_no' => $validated['reference_no'] ?? null,
                'note' => $validated['note'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            $account->setAttribute('balance', number_format($after, 2, '.', ''));
            $account->save();

            return $row;
        });

        return response()->json([
            'message' => 'Withdrawal posted successfully.',
            'account' => $account->fresh('customer:id,customer_code,first_name,last_name,phone'),
            'transaction' => $transaction,
        ], 201);
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

        return Customer::whereRaw('UPPER(customer_code) = ?', [$normalized])->first();
    }

    private function generateAccountNumber(string $accountType): string
    {
        $prefix = match ($accountType) {
            'current' => 'CUR',
            'fixed_deposit' => 'FD',
            'investment' => 'INV',
            default => 'SAV',
        };

        do {
            $candidate = sprintf('%s-%s-%05d', $prefix, now()->format('ymd'), random_int(1, 99999));
            $exists = SavingsAccount::where('account_number', $candidate)->exists();
        } while ($exists);

        return $candidate;
    }
}
