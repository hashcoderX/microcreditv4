<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyAccount;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\EmployeeWalletCashHandover;
use App\Models\Finance;
use App\Models\FinanceCollection;
use App\Models\LoanRequest;
use App\Models\EmployeeWalletBankDeposit;
use App\Models\MicrofinanceLoanRequest;
use App\Models\Mortgage;
use App\Models\SavingsAccount;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountingReportsController extends Controller
{
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
            $requested = (int) ($request->get('branch_id', $request->get('company_id', 0)));
            return $requested > 0 ? $requested : null;
        }

        $branchId = (int) ($request->user()?->branch_id ?? 0);
        return $branchId > 0 ? $branchId : null;
    }

    private function ensureCompanyAccess(Request $request, Company $company): ?JsonResponse
    {
        if ($this->isAdminUser($request->user())) {
            return null;
        }

        $branchId = (int) ($request->user()?->branch_id ?? 0);
        if ($branchId <= 0 || $branchId !== (int) $company->id) {
            return response()->json(['message' => 'You do not have access to this branch.'], 403);
        }

        return null;
    }

    private function roundMoney(float $value): float
    {
        return round($value, 2);
    }

    private function userName(?int $userId): string
    {
        if (!$userId) {
            return '';
        }

        return (string) (User::query()->whereKey($userId)->value('name') ?? '');
    }

    private function customerLabel(?Customer $customer): string
    {
        if (!$customer) {
            return 'Unknown Customer';
        }

        $name = trim((string) $customer->first_name . ' ' . (string) $customer->last_name);
        $code = trim((string) ($customer->customer_code ?? ''));

        if ($name !== '' && $code !== '') {
            return $name . ' (' . $code . ')';
        }

        return $name !== '' ? $name : ($code !== '' ? $code : 'Customer #' . $customer->id);
    }

    public function loanReceivableReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'product_type' => ['nullable', 'string', 'max:100'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        } elseif (!$this->isAdminUser($request->user())) {
            $scoped = (int) ($request->user()?->branch_id ?? 0);
            if ($scoped <= 0 || $scoped !== $branchId) {
                return response()->json(['message' => 'You do not have access to this branch.'], 403);
            }
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view loan receivable data.'], 422);
        }

        $company = Company::query()->findOrFail($branchId);
        $productFilter = strtolower(trim((string) ($validated['product_type'] ?? '')));
        $rows = [];

        if ($productFilter === '' || $productFilter === 'finance') {
            $financeRows = Finance::query()
                ->with('customer:id,customer_code,first_name,last_name')
                ->where('branch_id', $branchId)
                ->where('status', 'active')
                ->where('balance_amount', '>', 0)
                ->orderByDesc('balance_amount')
                ->get();

            foreach ($financeRows as $finance) {
                $rows[] = [
                    'product' => 'finance',
                    'product_label' => 'Finance',
                    'reference' => 'FIN-' . $finance->id,
                    'customer' => $this->customerLabel($finance->customer),
                    'customer_id' => (int) ($finance->customer_id ?? 0),
                    'outstanding' => $this->roundMoney((float) ($finance->balance_amount ?? 0)),
                ];
            }
        }

        if ($productFilter === '' || $productFilter === 'microfinance') {
            $mfRows = MicrofinanceLoanRequest::query()
                ->where('branch_id', $branchId)
                ->whereIn('status', ['released', 'approved'])
                ->where('loan_balance', '>', 0)
                ->orderByDesc('loan_balance')
                ->get();

            foreach ($mfRows as $loan) {
                $rows[] = [
                    'product' => 'microfinance',
                    'product_label' => 'Micro Credit',
                    'reference' => (string) ($loan->loan_code ?: ('MF-' . $loan->id)),
                    'customer' => trim((string) ($loan->customer_name ?: $loan->customer_no ?: 'Customer')),
                    'customer_id' => 0,
                    'outstanding' => $this->roundMoney((float) ($loan->loan_balance ?? 0)),
                ];
            }
        }

        if ($productFilter === '' || $productFilter === 'instant') {
            $instantRows = LoanRequest::query()
                ->where('branch_id', $branchId)
                ->whereIn('status', ['approved', 'closed'])
                ->selectRaw('loan_requests.*, GREATEST(principal - COALESCE(total_collected, 0), 0) as outstanding_amount')
                ->having('outstanding_amount', '>', 0)
                ->orderByDesc('outstanding_amount')
                ->get();

            foreach ($instantRows as $loan) {
                $rows[] = [
                    'product' => 'instant',
                    'product_label' => 'Instant Loan',
                    'reference' => (string) ($loan->request_no ?: ('IL-' . $loan->id)),
                    'customer' => trim((string) ($loan->customer_full_name ?: $loan->customer_no ?: 'Customer')),
                    'customer_id' => 0,
                    'outstanding' => $this->roundMoney((float) ($loan->outstanding_amount ?? 0)),
                ];
            }
        }

        if ($productFilter === '' || $productFilter === 'mortgage') {
            $mortgageRows = DB::table('mortgages as m')
                ->leftJoin('customers as c', 'c.id', '=', 'm.customer_id')
                ->leftJoin(
                    DB::raw('(SELECT mortgage_id, COALESCE(SUM(principal_amount), 0) as paid FROM mortgage_payments GROUP BY mortgage_id) mp'),
                    'mp.mortgage_id',
                    '=',
                    'm.id'
                )
                ->where('m.branch_id', $branchId)
                ->whereIn('m.status', ['approved', 'active', 'released'])
                ->selectRaw(
                    'm.id, m.mortgage_no, m.customer_id, c.customer_code, c.first_name, c.last_name, '
                    . 'GREATEST(COALESCE(m.approved_amount, 0) - COALESCE(mp.paid, 0), 0) as outstanding_amount'
                )
                ->having('outstanding_amount', '>', 0)
                ->orderByDesc('outstanding_amount')
                ->get();

            foreach ($mortgageRows as $loan) {
                $customer = new Customer([
                    'id' => (int) ($loan->customer_id ?? 0),
                    'customer_code' => $loan->customer_code ?? null,
                    'first_name' => $loan->first_name ?? null,
                    'last_name' => $loan->last_name ?? null,
                ]);

                $rows[] = [
                    'product' => 'mortgage',
                    'product_label' => 'Mortgage',
                    'reference' => (string) ($loan->mortgage_no ?? $loan->id),
                    'customer' => $this->customerLabel($customer),
                    'customer_id' => (int) ($loan->customer_id ?? 0),
                    'outstanding' => $this->roundMoney((float) ($loan->outstanding_amount ?? 0)),
                ];
            }
        }

        usort($rows, static fn (array $a, array $b) => $b['outstanding'] <=> $a['outstanding']);

        $summary = [
            'accounts_count' => count($rows),
            'total_outstanding' => $this->roundMoney((float) collect($rows)->sum('outstanding')),
            'by_product' => collect($rows)
                ->groupBy('product')
                ->map(fn ($group, $product) => [
                    'product' => $product,
                    'product_label' => (string) ($group->first()['product_label'] ?? $product),
                    'accounts_count' => $group->count(),
                    'total_outstanding' => $this->roundMoney((float) $group->sum('outstanding')),
                ])
                ->values()
                ->all(),
        ];

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'branch_id' => $branchId,
                'product_type' => $validated['product_type'] ?? null,
            ],
            'summary' => $summary,
            'rows' => $rows,
        ]);
    }

    public function interestIncomeReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        } elseif (!$this->isAdminUser($request->user())) {
            $scoped = (int) ($request->user()?->branch_id ?? 0);
            if ($scoped <= 0 || $scoped !== $branchId) {
                return response()->json(['message' => 'You do not have access to this branch.'], 403);
            }
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view interest income.'], 422);
        }

        $company = Company::query()->findOrFail($branchId);
        $fromDate = $validated['from_date'] ?? Carbon::today()->startOfMonth()->toDateString();
        $toDate = $validated['to_date'] ?? Carbon::today()->toDateString();

        $financeInterest = (float) FinanceCollection::query()
            ->join('finances', 'finances.id', '=', 'finance_collections.finance_id')
            ->where('finances.branch_id', $branchId)
            ->whereDate('finance_collections.payment_date', '>=', $fromDate)
            ->whereDate('finance_collections.payment_date', '<=', $toDate)
            ->sum('finance_collections.interest_paid');

        $mfInterest = (float) DB::table('mf_loan_collections')
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->where('mf_loan_requests.branch_id', $branchId)
            ->whereDate('mf_loan_collections.collection_date', '>=', $fromDate)
            ->whereDate('mf_loan_collections.collection_date', '<=', $toDate)
            ->sum('mf_loan_collections.interest_amount');

        $mfPenalty = (float) DB::table('mf_loan_collections')
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->where('mf_loan_requests.branch_id', $branchId)
            ->whereDate('mf_loan_collections.collection_date', '>=', $fromDate)
            ->whereDate('mf_loan_collections.collection_date', '<=', $toDate)
            ->sum('mf_loan_collections.penalty_amount');

        $mortgageInterest = (float) DB::table('mortgage_payments')
            ->where('branch_id', $branchId)
            ->whereDate('paid_date', '>=', $fromDate)
            ->whereDate('paid_date', '<=', $toDate)
            ->sum('interest_amount');

        $mortgageProfit = (float) DB::table('mortgage_payments')
            ->where('branch_id', $branchId)
            ->whereDate('paid_date', '>=', $fromDate)
            ->whereDate('paid_date', '<=', $toDate)
            ->sum('profit_amount');

        $instantInterest = (float) DB::table('loan_request_collections')
            ->join('loan_requests', 'loan_requests.id', '=', 'loan_request_collections.loan_request_id')
            ->where('loan_requests.branch_id', $branchId)
            ->whereDate('loan_request_collections.collection_date', '>=', $fromDate)
            ->whereDate('loan_request_collections.collection_date', '<=', $toDate)
            ->selectRaw(
                'COALESCE(SUM(loan_request_collections.collected_amount * CASE WHEN loan_requests.total_payable > 0 '
                . 'THEN GREATEST(loan_requests.total_payable - loan_requests.principal, 0) / loan_requests.total_payable '
                . 'ELSE 0 END), 0) as total'
            )
            ->value('total');

        $products = [
            ['product' => 'finance', 'label' => 'Finance', 'interest_income' => $this->roundMoney($financeInterest), 'penalty_income' => 0.0],
            ['product' => 'microfinance', 'label' => 'Micro Credit', 'interest_income' => $this->roundMoney($mfInterest), 'penalty_income' => $this->roundMoney($mfPenalty)],
            ['product' => 'mortgage', 'label' => 'Mortgage', 'interest_income' => $this->roundMoney($mortgageInterest + $mortgageProfit), 'penalty_income' => 0.0],
            ['product' => 'instant', 'label' => 'Instant Loan', 'interest_income' => $this->roundMoney($instantInterest), 'penalty_income' => 0.0],
        ];

        $totalInterest = $this->roundMoney(collect($products)->sum('interest_income'));
        $totalPenalty = $this->roundMoney(collect($products)->sum('penalty_income'));

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'branch_id' => $branchId,
            ],
            'summary' => [
                'total_interest_income' => $totalInterest,
                'total_penalty_income' => $totalPenalty,
                'grand_total' => $this->roundMoney($totalInterest + $totalPenalty),
            ],
            'products' => $products,
            'branches' => [[
                'branch_id' => $company->id,
                'branch_name' => $company->name,
                'interest_income' => $totalInterest,
                'penalty_income' => $totalPenalty,
                'total' => $this->roundMoney($totalInterest + $totalPenalty),
            ]],
        ]);
    }

    public function loanDisbursementReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'product_type' => ['nullable', 'string', 'max:100'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        } elseif (!$this->isAdminUser($request->user())) {
            $scoped = (int) ($request->user()?->branch_id ?? 0);
            if ($scoped <= 0 || $scoped !== $branchId) {
                return response()->json(['message' => 'You do not have access to this branch.'], 403);
            }
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view disbursement data.'], 422);
        }

        $company = Company::query()->findOrFail($branchId);
        $fromDate = $validated['from_date'] ?? Carbon::today()->startOfMonth()->toDateString();
        $toDate = $validated['to_date'] ?? Carbon::today()->toDateString();
        $productFilter = strtolower(trim((string) ($validated['product_type'] ?? '')));
        $rows = [];

        if ($productFilter === '' || $productFilter === 'finance') {
            $financeRows = Finance::query()
                ->with('customer:id,customer_code,first_name,last_name')
                ->where('branch_id', $branchId)
                ->whereDate('start_date', '>=', $fromDate)
                ->whereDate('start_date', '<=', $toDate)
                ->orderByDesc('start_date')
                ->get();

            foreach ($financeRows as $finance) {
                $rows[] = [
                    'date' => optional($finance->start_date)->format('Y-m-d'),
                    'product' => 'finance',
                    'product_label' => 'Finance',
                    'reference' => 'FIN-' . $finance->id,
                    'customer' => $this->customerLabel($finance->customer),
                    'amount' => $this->roundMoney((float) ($finance->financed_amount ?? 0)),
                    'officer' => $this->userName((int) ($finance->created_by ?? 0)),
                    'branch_name' => $company->name,
                ];
            }
        }

        if ($productFilter === '' || $productFilter === 'microfinance') {
            $mfRows = MicrofinanceLoanRequest::query()
                ->where('branch_id', $branchId)
                ->whereIn('status', ['released', 'approved'])
                ->whereDate('loan_request_date', '>=', $fromDate)
                ->whereDate('loan_request_date', '<=', $toDate)
                ->orderByDesc('loan_request_date')
                ->get();

            foreach ($mfRows as $loan) {
                $rows[] = [
                    'date' => optional($loan->loan_request_date)->format('Y-m-d'),
                    'product' => 'microfinance',
                    'product_label' => 'Micro Credit',
                    'reference' => (string) ($loan->loan_code ?: ('MF-' . $loan->id)),
                    'customer' => trim((string) ($loan->customer_name ?: $loan->customer_no ?: 'Customer')),
                    'amount' => $this->roundMoney((float) ($loan->loan_amount ?? 0)),
                    'officer' => trim((string) ($loan->field_officer ?? '')),
                    'branch_name' => $company->name,
                ];
            }
        }

        if ($productFilter === '' || $productFilter === 'instant') {
            $instantRows = LoanRequest::query()
                ->where('branch_id', $branchId)
                ->whereIn('status', ['approved', 'closed'])
                ->whereRaw('DATE(COALESCE(last_action_at, created_at)) >= ?', [$fromDate])
                ->whereRaw('DATE(COALESCE(last_action_at, created_at)) <= ?', [$toDate])
                ->orderByDesc('last_action_at')
                ->get();

            foreach ($instantRows as $loan) {
                $rows[] = [
                    'date' => Carbon::parse($loan->last_action_at ?? $loan->created_at)->toDateString(),
                    'product' => 'instant',
                    'product_label' => 'Instant Loan',
                    'reference' => (string) ($loan->request_no ?: ('IL-' . $loan->id)),
                    'customer' => trim((string) ($loan->customer_full_name ?: $loan->customer_no ?: 'Customer')),
                    'amount' => $this->roundMoney((float) ($loan->principal ?? 0)),
                    'officer' => $this->userName((int) ($loan->created_by ?? 0)),
                    'branch_name' => $company->name,
                ];
            }
        }

        if ($productFilter === '' || $productFilter === 'mortgage') {
            $mortgageRows = Mortgage::query()
                ->with('customer:id,customer_code,first_name,last_name')
                ->where('branch_id', $branchId)
                ->whereIn('status', ['approved', 'active', 'released'])
                ->whereDate('approved_at', '>=', $fromDate)
                ->whereDate('approved_at', '<=', $toDate)
                ->orderByDesc('approved_at')
                ->get();

            foreach ($mortgageRows as $mortgage) {
                $rows[] = [
                    'date' => optional($mortgage->approved_at)->format('Y-m-d'),
                    'product' => 'mortgage',
                    'product_label' => 'Mortgage',
                    'reference' => 'MG-' . $mortgage->id,
                    'customer' => $this->customerLabel($mortgage->customer),
                    'amount' => $this->roundMoney((float) ($mortgage->approved_amount ?? 0)),
                    'officer' => $this->userName((int) ($mortgage->approved_by ?? $mortgage->created_by ?? 0)),
                    'branch_name' => $company->name,
                ];
            }
        }

        usort($rows, static fn (array $a, array $b) => strcmp((string) ($b['date'] ?? ''), (string) ($a['date'] ?? '')));

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'branch_id' => $branchId,
                'product_type' => $validated['product_type'] ?? null,
            ],
            'summary' => [
                'disbursement_count' => count($rows),
                'total_disbursed' => $this->roundMoney((float) collect($rows)->sum('amount')),
            ],
            'rows' => $rows,
        ]);
    }

    public function branchProfitabilityReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $fromDate = $validated['from_date'] ?? Carbon::today()->startOfMonth()->toDateString();
        $toDate = $validated['to_date'] ?? Carbon::today()->toDateString();
        $scopedBranchId = $this->scopedBranchId($request);
        $requestedBranchId = (int) ($validated['branch_id'] ?? 0);

        $branchesQuery = Company::query()->orderBy('name');
        if ($scopedBranchId !== null) {
            $branchesQuery->where('id', $scopedBranchId);
        } elseif ($requestedBranchId > 0) {
            $branchesQuery->where('id', $requestedBranchId);
        }

        $overviewController = app(AccountingOverviewController::class);
        $rows = [];

        foreach ($branchesQuery->get() as $branch) {
            $branchId = (int) $branch->id;
            $income = $this->invokePrivate($overviewController, 'sumIncomeForRange', [$branchId, $fromDate, $toDate]);
            $expenses = $this->invokePrivate($overviewController, 'sumManualExpensesForRange', [$branchId, $fromDate, $toDate]);
            $refundExpenses = (float) ($income['refund_expenses'] ?? 0);
            unset($income['refund_expenses']);

            $totalIncome = (float) ($income['total_income'] ?? 0);
            $totalExpense = (float) ($expenses['manual_total'] ?? 0) + $refundExpenses;
            $profit = $this->roundMoney($totalIncome - $totalExpense);

            $rows[] = [
                'branch_id' => $branchId,
                'branch_name' => $branch->name,
                'income' => $this->roundMoney($totalIncome),
                'expense' => $this->roundMoney($totalExpense),
                'profit' => $profit,
            ];
        }

        return response()->json([
            'filters' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'branch_id' => $requestedBranchId > 0 ? $requestedBranchId : null,
            ],
            'summary' => [
                'branch_count' => count($rows),
                'total_income' => $this->roundMoney((float) collect($rows)->sum('income')),
                'total_expense' => $this->roundMoney((float) collect($rows)->sum('expense')),
                'total_profit' => $this->roundMoney((float) collect($rows)->sum('profit')),
            ],
            'rows' => $rows,
        ]);
    }

    public function investorFundingReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        } elseif (!$this->isAdminUser($request->user())) {
            $scoped = (int) ($request->user()?->branch_id ?? 0);
            if ($scoped <= 0 || $scoped !== $branchId) {
                return response()->json(['message' => 'You do not have access to this branch.'], 403);
            }
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view investor funding.'], 422);
        }

        $company = Company::query()->findOrFail($branchId);

        $accounts = SavingsAccount::query()
            ->with(['customer:id,customer_code,first_name,last_name,phone'])
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->where('balance', '>', 0)
            ->orderByDesc('balance')
            ->get();

        $rows = $accounts->map(function (SavingsAccount $account) {
            $customer = $account->customer;
            $name = $this->customerLabel($customer);

            return [
                'investor' => $name,
                'customer_id' => (int) ($account->customer_id ?? 0),
                'account_number' => (string) ($account->account_number ?? ''),
                'account_type' => (string) ($account->account_type ?? ''),
                'capital' => $this->roundMoney((float) ($account->balance ?? 0)),
                'interest_rate' => $this->roundMoney((float) ($account->interest_rate ?? 0)),
                'profit_share' => null,
            ];
        })->values()->all();

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'summary' => [
                'investor_count' => count($rows),
                'total_capital' => $this->roundMoney((float) collect($rows)->sum('capital')),
            ],
            'rows' => $rows,
        ]);
    }

    public function journalEntriesReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view journal entries.'], 422);
        }

        $company = Company::query()->findOrFail($branchId);
        $fromDate = $validated['from_date'] ?? Carbon::today()->startOfMonth()->toDateString();
        $toDate = $validated['to_date'] ?? Carbon::today()->toDateString();

        $ledgerRequest = Request::create('/api/finances/reports/general-ledger', 'GET', [
            'branch_id' => $branchId,
            'company_id' => $branchId,
            'from_date' => $fromDate,
            'to_date' => $toDate,
        ]);
        $ledgerRequest->setUserResolver(fn () => $request->user());

        $ledgerPayload = app(FinanceController::class)->generalLedgerSnapshot($ledgerRequest)->getData(true);
        $entries = [];

        foreach (($ledgerPayload['lines'] ?? []) as $line) {
            $periodDebit = $this->roundMoney((float) ($line['period_debit'] ?? 0));
            $periodCredit = $this->roundMoney((float) ($line['period_credit'] ?? 0));

            if ($periodDebit <= 0 && $periodCredit <= 0) {
                continue;
            }

            $entries[] = [
                'date' => $toDate,
                'voucher' => (string) ($line['account_code'] ?? ''),
                'description' => (string) ($line['account_name'] ?? ''),
                'debit' => $periodDebit,
                'credit' => $periodCredit,
                'account_type' => $line['account_type'] ?? null,
                'source' => $line['source'] ?? null,
            ];
        }

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'branch_id' => $branchId,
            ],
            'summary' => [
                'entries_count' => count($entries),
                'total_debit' => $this->roundMoney((float) collect($entries)->sum('debit')),
                'total_credit' => $this->roundMoney((float) collect($entries)->sum('credit')),
            ],
            'entries' => $entries,
        ]);
    }

    public function bankBookReport(Request $request, Company $company): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
        ]);

        $fromDate = $validated['from_date'] ?? Carbon::today()->startOfMonth()->toDateString();
        $toDate = $validated['to_date'] ?? Carbon::today()->toDateString();
        $branchId = (int) $company->id;

        $banks = CompanyAccount::query()
            ->where('company_id', $branchId)
            ->where('account_type', CompanyAccount::TYPE_BANK)
            ->where('is_active', true)
            ->orderBy('account_name')
            ->get()
            ->map(fn (CompanyAccount $account) => [
                'account_id' => $account->id,
                'account_name' => (string) $account->account_name,
                'bank_name' => (string) ($account->bank_name ?? $account->account_name),
                'account_number' => (string) ($account->account_number ?? ''),
                'opening_balance' => $this->roundMoney((float) ($account->opening_balance ?? 0)),
                'current_balance' => $this->roundMoney((float) ($account->current_balance ?? 0)),
            ])
            ->values()
            ->all();

        $ledgerRequest = Request::create('/api/finances/reports/general-ledger', 'GET', [
            'branch_id' => $branchId,
            'company_id' => $branchId,
            'from_date' => $fromDate,
            'to_date' => $toDate,
        ]);
        $ledgerRequest->setUserResolver(fn () => $request->user());
        $ledgerPayload = app(FinanceController::class)->generalLedgerSnapshot($ledgerRequest)->getData(true);

        $movements = collect($ledgerPayload['lines'] ?? [])
            ->filter(fn (array $line) => ($line['account_type'] ?? null) === CompanyAccount::TYPE_BANK)
            ->map(fn (array $line) => [
                'account_code' => (string) ($line['account_code'] ?? ''),
                'account_name' => (string) ($line['account_name'] ?? ''),
                'deposits' => $this->roundMoney((float) ($line['period_debit'] ?? 0)),
                'withdrawals' => $this->roundMoney((float) ($line['period_credit'] ?? 0)),
                'transfers' => 0.0,
                'closing_balance' => $this->roundMoney(abs((float) ($line['closing_balance'] ?? 0))),
            ])
            ->values()
            ->all();

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
            ],
            'banks' => $banks,
            'movements' => $movements,
            'summary' => [
                'bank_count' => count($banks),
                'total_current_balance' => $this->roundMoney((float) collect($banks)->sum('current_balance')),
                'period_deposits' => $this->roundMoney((float) collect($movements)->sum('deposits')),
                'period_withdrawals' => $this->roundMoney((float) collect($movements)->sum('withdrawals')),
            ],
        ]);
    }

    public function cashBookReport(Request $request, Company $company): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
        ]);

        $fromDate = $validated['from_date'] ?? Carbon::today()->startOfMonth()->toDateString();
        $toDate = $validated['to_date'] ?? Carbon::today()->toDateString();
        $branchId = (int) $company->id;

        $cashAccount = CompanyAccount::query()
            ->where('company_id', $branchId)
            ->where('account_type', CompanyAccount::TYPE_CASH)
            ->where('is_active', true)
            ->first();

        $ledgerRequest = Request::create('/api/finances/reports/general-ledger', 'GET', [
            'branch_id' => $branchId,
            'company_id' => $branchId,
            'from_date' => $fromDate,
            'to_date' => $toDate,
        ]);
        $ledgerRequest->setUserResolver(fn () => $request->user());
        $ledgerPayload = app(FinanceController::class)->generalLedgerSnapshot($ledgerRequest)->getData(true);

        $cashLines = collect($ledgerPayload['lines'] ?? [])
            ->filter(fn (array $line) => in_array($line['account_type'] ?? null, ['cash', CompanyAccount::TYPE_CASH], true)
                || str_contains(strtolower((string) ($line['account_name'] ?? '')), 'cash'))
            ->values()
            ->all();

        $collectionsLine = collect($cashLines)->first(fn (array $line) => str_contains(strtolower((string) ($line['account_name'] ?? '')), 'collection'));
        $cashIn = $this->roundMoney((float) ($collectionsLine['period_debit'] ?? collect($cashLines)->sum('period_debit')));
        $cashOut = $this->roundMoney((float) ($collectionsLine['period_credit'] ?? collect($cashLines)->sum('period_credit')));

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
            ],
            'cash_account' => $cashAccount ? [
                'account_name' => (string) $cashAccount->account_name,
                'opening_balance' => $this->roundMoney((float) ($cashAccount->opening_balance ?? 0)),
                'current_balance' => $this->roundMoney((float) ($cashAccount->current_balance ?? 0)),
            ] : null,
            'summary' => [
                'cash_received' => $cashIn,
                'cash_paid' => $cashOut,
                'net_movement' => $this->roundMoney($cashIn - $cashOut),
            ],
            'lines' => $cashLines,
        ]);
    }

    public function collectorWalletDepositsReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        } elseif (!$this->isAdminUser($request->user())) {
            $scoped = (int) ($request->user()?->branch_id ?? 0);
            if ($scoped <= 0 || $scoped !== $branchId) {
                return response()->json(['message' => 'You do not have access to this branch.'], 403);
            }
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view deposit transactions.'], 422);
        }

        $company = Company::query()->findOrFail($branchId);
        $fromDate = $validated['from_date'] ?? Carbon::today()->startOfMonth()->toDateString();
        $toDate = $validated['to_date'] ?? Carbon::today()->toDateString();

        $query = EmployeeWalletBankDeposit::query()
            ->with([
                'employee:id,employee_code,first_name,last_name',
                'bankAccount:id,company_id,account_type,account_name,bank_name,account_number',
            ])
            ->where('branch_id', $branchId)
            ->whereDate('deposit_date', '>=', $fromDate)
            ->whereDate('deposit_date', '<=', $toDate);

        if (!empty($validated['employee_id'])) {
            $query->where('employee_id', (int) $validated['employee_id']);
        }

        $rows = $query
            ->orderByDesc('deposit_date')
            ->orderByDesc('id')
            ->get()
            ->map(function (EmployeeWalletBankDeposit $row) {
                $employeeCode = trim((string) ($row->employee?->employee_code ?? ''));
                $employeeName = trim((string) ($row->employee?->first_name ?? '') . ' ' . (string) ($row->employee?->last_name ?? ''));
                $bankLabel = trim((string) ($row->bankAccount?->account_name ?? ''));
                if ($bankLabel === '') {
                    $bankLabel = trim((string) ($row->bankAccount?->bank_name ?? ''));
                }

                return [
                    'id' => (int) $row->id,
                    'deposit_date' => (string) ($row->deposit_date ?? ''),
                    'amount' => $this->roundMoney((float) ($row->amount ?? 0)),
                    'employee_id' => (int) ($row->employee_id ?? 0),
                    'employee_code' => $employeeCode,
                    'employee_name' => $employeeName,
                    'bank_account_id' => (int) ($row->bank_account_id ?? 0),
                    'bank_account_name' => $bankLabel,
                    'bank_name' => (string) ($row->bankAccount?->bank_name ?? ''),
                    'account_number' => (string) ($row->bankAccount?->account_number ?? ''),
                    'account_type' => (string) ($row->bankAccount?->account_type ?? ''),
                    'note' => (string) ($row->note ?? ''),
                ];
            })
            ->values();

        $employees = $rows
            ->groupBy('employee_id')
            ->map(function ($group) {
                return [
                    'employee_id' => (int) ($group->first()['employee_id'] ?? 0),
                    'employee_code' => (string) ($group->first()['employee_code'] ?? ''),
                    'employee_name' => (string) ($group->first()['employee_name'] ?? ''),
                    'transactions' => $group->count(),
                    'total_amount' => $this->roundMoney((float) $group->sum('amount')),
                ];
            })
            ->sortByDesc('total_amount')
            ->values()
            ->all();

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'branch_id' => $branchId,
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'employee_id' => isset($validated['employee_id']) ? (int) $validated['employee_id'] : null,
            ],
            'summary' => [
                'transaction_count' => $rows->count(),
                'employee_count' => count($employees),
                'total_amount' => $this->roundMoney((float) $rows->sum('amount')),
            ],
            'employee_totals' => $employees,
            'rows' => $rows,
        ]);
    }

    public function teamMemberWalletsReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'manager_employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'wallet_status' => ['nullable', 'string', 'max:30'],
            'q' => ['nullable', 'string', 'max:120'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        } elseif (!$this->isAdminUser($request->user())) {
            $scoped = (int) ($request->user()?->branch_id ?? 0);
            if ($scoped <= 0 || $scoped !== $branchId) {
                return response()->json(['message' => 'You do not have access to this branch.'], 403);
            }
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view team wallets.'], 422);
        }

        $company = Company::query()->findOrFail($branchId);
        $isAdmin = $this->isAdminUser($request->user());
        $actorEmployeeId = (int) ($request->user()?->employee_id ?? 0);
        $requestedManagerId = (int) ($validated['manager_employee_id'] ?? 0);
        $search = mb_strtolower(trim((string) ($validated['q'] ?? '')));
        $walletStatusFilter = mb_strtolower(trim((string) ($validated['wallet_status'] ?? 'all')));
        if ($walletStatusFilter === '') {
            $walletStatusFilter = 'all';
        }

        $employees = Employee::query()
            ->with([
                'wallet:id,employee_id,wallet_no,opening_balance,current_balance,status',
                'designation:id,name',
            ])
            ->where('branch_id', $branchId)
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get([
                'id',
                'branch_id',
                'employee_code',
                'first_name',
                'last_name',
                'email',
                'designation_id',
                'reporting_person',
                'status',
            ]);

        /** @var array<int, Employee> $employeesById */
        $employeesById = [];
        /** @var array<string, Employee> $employeesByEmail */
        $employeesByEmail = [];
        /** @var array<string, Employee> $employeesByCode */
        $employeesByCode = [];
        /** @var array<string, Employee> $employeesByFullName */
        $employeesByFullName = [];

        foreach ($employees as $employee) {
            $employeeId = (int) ($employee->id ?? 0);
            if ($employeeId <= 0) {
                continue;
            }

            $employeesById[$employeeId] = $employee;

            $email = mb_strtolower(trim((string) ($employee->email ?? '')));
            if ($email !== '') {
                $employeesByEmail[$email] = $employee;
            }

            $code = mb_strtolower(trim((string) ($employee->employee_code ?? '')));
            if ($code !== '') {
                $employeesByCode[$code] = $employee;
            }

            $fullName = mb_strtolower(trim((string) ($employee->first_name ?? '') . ' ' . (string) ($employee->last_name ?? '')));
            if ($fullName !== '') {
                $employeesByFullName[$fullName] = $employee;
            }
        }

        $resolveManager = function (string $rawValue) use ($employeesById, $employeesByEmail, $employeesByCode, $employeesByFullName): ?Employee {
            $value = trim($rawValue);
            if ($value === '') {
                return null;
            }

            if (ctype_digit($value)) {
                $candidate = $employeesById[(int) $value] ?? null;
                if ($candidate instanceof Employee) {
                    return $candidate;
                }
            }

            $normalized = mb_strtolower($value);

            $emailCandidate = $employeesByEmail[$normalized] ?? null;
            if ($emailCandidate instanceof Employee) {
                return $emailCandidate;
            }

            $codeCandidate = $employeesByCode[$normalized] ?? null;
            if ($codeCandidate instanceof Employee) {
                return $codeCandidate;
            }

            $nameCandidate = $employeesByFullName[$normalized] ?? null;
            if ($nameCandidate instanceof Employee) {
                return $nameCandidate;
            }

            return null;
        };

        $managerCounts = [];
        $rows = [];

        foreach ($employees as $employee) {
            $managerEmployee = $resolveManager((string) ($employee->reporting_person ?? ''));
            $managerEmployeeId = (int) ($managerEmployee?->id ?? 0);

            if ($managerEmployeeId > 0) {
                $managerCounts[$managerEmployeeId] = (int) ($managerCounts[$managerEmployeeId] ?? 0) + 1;
            }

            if (!$isAdmin) {
                if ($actorEmployeeId <= 0) {
                    continue;
                }

                if ($managerEmployeeId !== $actorEmployeeId) {
                    continue;
                }
            }

            if ($requestedManagerId > 0 && $managerEmployeeId !== $requestedManagerId) {
                continue;
            }

            $wallet = $employee->wallet;
            $walletStatus = mb_strtolower(trim((string) ($wallet?->status ?? '')));
            $walletStatus = $walletStatus !== '' ? $walletStatus : 'no_wallet';

            if ($walletStatusFilter !== 'all' && $walletStatusFilter !== $walletStatus) {
                continue;
            }

            $employeeName = trim((string) ($employee->first_name ?? '') . ' ' . (string) ($employee->last_name ?? ''));
            $managerName = trim((string) ($managerEmployee?->first_name ?? '') . ' ' . (string) ($managerEmployee?->last_name ?? ''));
            $designationName = trim((string) ($employee->designation?->name ?? ''));
            $searchText = mb_strtolower(implode(' ', [
                (string) ($employee->employee_code ?? ''),
                $employeeName,
                (string) ($employee->email ?? ''),
                $designationName,
                (string) ($wallet?->wallet_no ?? ''),
                $managerName,
            ]));

            if ($search !== '' && !str_contains($searchText, $search)) {
                continue;
            }

            $rows[] = [
                'employee_id' => (int) $employee->id,
                'employee_code' => (string) ($employee->employee_code ?? ''),
                'employee_name' => $employeeName,
                'employee_email' => (string) ($employee->email ?? ''),
                'employee_status' => (string) ($employee->status ?? ''),
                'designation' => $designationName,
                'reporting_person' => (string) ($employee->reporting_person ?? ''),
                'manager_employee_id' => $managerEmployeeId > 0 ? $managerEmployeeId : null,
                'manager_employee_code' => (string) ($managerEmployee?->employee_code ?? ''),
                'manager_name' => $managerName,
                'wallet_id' => (int) ($wallet?->id ?? 0),
                'wallet_no' => (string) ($wallet?->wallet_no ?? ''),
                'wallet_status' => $walletStatus,
                'opening_balance' => $this->roundMoney((float) ($wallet?->opening_balance ?? 0)),
                'current_balance' => $this->roundMoney((float) ($wallet?->current_balance ?? 0)),
            ];
        }

        usort($rows, static function (array $a, array $b): int {
            $balanceCompare = ((float) ($b['current_balance'] ?? 0)) <=> ((float) ($a['current_balance'] ?? 0));
            if ($balanceCompare !== 0) {
                return $balanceCompare;
            }

            return strcmp((string) ($a['employee_name'] ?? ''), (string) ($b['employee_name'] ?? ''));
        });

        $managerOptions = [];
        foreach ($managerCounts as $managerId => $directReports) {
            if ($managerId <= 0 || !isset($employeesById[$managerId])) {
                continue;
            }

            $manager = $employeesById[$managerId];
            $managerName = trim((string) ($manager->first_name ?? '') . ' ' . (string) ($manager->last_name ?? ''));
            if ($managerName === '') {
                $managerName = 'Employee #' . $managerId;
            }

            $managerOptions[] = [
                'employee_id' => $managerId,
                'employee_code' => (string) ($manager->employee_code ?? ''),
                'name' => $managerName,
                'direct_reports' => (int) $directReports,
            ];
        }

        usort($managerOptions, static function (array $a, array $b): int {
            return strcmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? ''));
        });

        if (!$isAdmin) {
            if ($actorEmployeeId <= 0) {
                return response()->json(['message' => 'No employee profile linked to this account.'], 422);
            }

            $managerOptions = array_values(array_filter(
                $managerOptions,
                static fn (array $row): bool => (int) ($row['employee_id'] ?? 0) === $actorEmployeeId
            ));

            if ($requestedManagerId > 0 && $requestedManagerId !== $actorEmployeeId) {
                return response()->json(['message' => 'You can only view your own team wallet balances.'], 403);
            }
        }

        $totalCurrent = array_sum(array_map(static fn (array $row): float => (float) ($row['current_balance'] ?? 0), $rows));
        $totalOpening = array_sum(array_map(static fn (array $row): float => (float) ($row['opening_balance'] ?? 0), $rows));
        $walletHolders = count(array_filter($rows, static fn (array $row): bool => (int) ($row['wallet_id'] ?? 0) > 0));
        $noWalletCount = count($rows) - $walletHolders;

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'filters' => [
                'branch_id' => $branchId,
                'manager_employee_id' => $requestedManagerId > 0 ? $requestedManagerId : null,
                'wallet_status' => $walletStatusFilter,
                'q' => $search,
            ],
            'scope' => [
                'is_admin' => $isAdmin,
                'actor_employee_id' => $actorEmployeeId > 0 ? $actorEmployeeId : null,
            ],
            'summary' => [
                'team_members' => count($rows),
                'wallet_holders' => $walletHolders,
                'no_wallet_members' => $noWalletCount,
                'total_opening_balance' => $this->roundMoney((float) $totalOpening),
                'total_current_balance' => $this->roundMoney((float) $totalCurrent),
            ],
            'manager_options' => $managerOptions,
            'rows' => $rows,
        ]);
    }

    public function teamMemberWalletTransactions(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $branchId = (int) ($validated['branch_id'] ?? $validated['company_id'] ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) ($this->scopedBranchId($request) ?? 0);
        } elseif (!$this->isAdminUser($request->user())) {
            $scoped = (int) ($request->user()?->branch_id ?? 0);
            if ($scoped <= 0 || $scoped !== $branchId) {
                return response()->json(['message' => 'You do not have access to this branch.'], 403);
            }
        }

        if ($branchId <= 0) {
            return response()->json(['message' => 'Select a branch to view wallet transactions.'], 422);
        }

        if ((int) ($employee->branch_id ?? 0) !== $branchId) {
            return response()->json(['message' => 'Employee does not belong to the selected branch.'], 403);
        }

        $isAdmin = $this->isAdminUser($request->user());
        $actorEmployeeId = (int) ($request->user()?->employee_id ?? 0);

        if (!$isAdmin) {
            if ($actorEmployeeId <= 0) {
                return response()->json(['message' => 'No employee profile linked to this account.'], 422);
            }

            $reportingPerson = mb_strtolower(trim((string) ($employee->reporting_person ?? '')));
            $actorEmployee = Employee::query()->find($actorEmployeeId);
            $actorCode = mb_strtolower(trim((string) ($actorEmployee?->employee_code ?? '')));
            $actorEmail = mb_strtolower(trim((string) ($actorEmployee?->email ?? '')));
            $actorName = mb_strtolower(trim((string) ($actorEmployee?->first_name ?? '') . ' ' . (string) ($actorEmployee?->last_name ?? '')));

            $canAccess = false;
            if ($reportingPerson !== '') {
                if ($reportingPerson === (string) $actorEmployeeId) {
                    $canAccess = true;
                }
                if (!$canAccess && $actorCode !== '' && $reportingPerson === $actorCode) {
                    $canAccess = true;
                }
                if (!$canAccess && $actorEmail !== '' && $reportingPerson === $actorEmail) {
                    $canAccess = true;
                }
                if (!$canAccess && $actorName !== '' && $reportingPerson === $actorName) {
                    $canAccess = true;
                }
            }

            if (!$canAccess) {
                return response()->json(['message' => 'You can only view transactions for your own team members.'], 403);
            }
        }

        $limit = (int) ($validated['limit'] ?? 10);
        $company = Company::query()->findOrFail($branchId);

        $wallet = $employee->wallet()
            ->first(['id', 'employee_id', 'wallet_no', 'opening_balance', 'current_balance', 'status']);

        if (!$wallet) {
            return response()->json([
                'company' => [
                    'id' => $company->id,
                    'name' => $company->name,
                    'currency' => $company->currency ?: 'LKR',
                ],
                'employee' => [
                    'id' => (int) $employee->id,
                    'employee_code' => (string) ($employee->employee_code ?? ''),
                    'name' => trim((string) ($employee->first_name ?? '') . ' ' . (string) ($employee->last_name ?? '')),
                ],
                'wallet' => null,
                'summary' => [
                    'deposit_count' => 0,
                    'handover_count' => 0,
                    'total_deposit_amount' => 0,
                    'total_handover_amount' => 0,
                ],
                'recent_deposits' => [],
                'recent_handovers' => [],
            ]);
        }

        $recentDeposits = EmployeeWalletBankDeposit::query()
            ->with('bankAccount:id,account_name,bank_name,account_type,account_number')
            ->where('employee_wallet_id', (int) $wallet->id)
            ->orderByDesc('deposit_date')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (EmployeeWalletBankDeposit $row): array => [
                'id' => (int) $row->id,
                'deposit_date' => (string) ($row->deposit_date ?? ''),
                'amount' => $this->roundMoney((float) ($row->amount ?? 0)),
                'status' => (string) ($row->status ?? ''),
                'note' => (string) ($row->note ?? ''),
                'bank_account_name' => (string) ($row->bankAccount?->account_name ?? ''),
                'bank_name' => (string) ($row->bankAccount?->bank_name ?? ''),
                'account_type' => (string) ($row->bankAccount?->account_type ?? ''),
            ])
            ->values();

        $recentHandovers = EmployeeWalletCashHandover::query()
            ->with([
                'cashAccount:id,account_name,bank_name,account_type,account_number',
                'managerEmployee:id,employee_code,first_name,last_name',
            ])
            ->where('employee_wallet_id', (int) $wallet->id)
            ->orderByDesc('handover_date')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (EmployeeWalletCashHandover $row): array => [
                'id' => (int) $row->id,
                'handover_date' => (string) ($row->handover_date ?? ''),
                'amount' => $this->roundMoney((float) ($row->amount ?? 0)),
                'status' => (string) ($row->status ?? ''),
                'received_by' => (string) ($row->received_by ?? ''),
                'note' => (string) ($row->note ?? ''),
                'cash_account_name' => (string) ($row->cashAccount?->account_name ?? ''),
                'cash_account_type' => (string) ($row->cashAccount?->account_type ?? ''),
                'manager_name' => trim((string) ($row->managerEmployee?->first_name ?? '') . ' ' . (string) ($row->managerEmployee?->last_name ?? '')),
                'manager_employee_code' => (string) ($row->managerEmployee?->employee_code ?? ''),
            ])
            ->values();

        $depositCount = (int) EmployeeWalletBankDeposit::query()
            ->where('employee_wallet_id', (int) $wallet->id)
            ->count();

        $handoverCount = (int) EmployeeWalletCashHandover::query()
            ->where('employee_wallet_id', (int) $wallet->id)
            ->count();

        $totalDepositAmount = (float) EmployeeWalletBankDeposit::query()
            ->where('employee_wallet_id', (int) $wallet->id)
            ->sum('amount');

        $totalHandoverAmount = (float) EmployeeWalletCashHandover::query()
            ->where('employee_wallet_id', (int) $wallet->id)
            ->sum('amount');

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ],
            'employee' => [
                'id' => (int) $employee->id,
                'employee_code' => (string) ($employee->employee_code ?? ''),
                'name' => trim((string) ($employee->first_name ?? '') . ' ' . (string) ($employee->last_name ?? '')),
            ],
            'wallet' => [
                'id' => (int) $wallet->id,
                'wallet_no' => (string) ($wallet->wallet_no ?? ''),
                'status' => (string) ($wallet->status ?? ''),
                'opening_balance' => $this->roundMoney((float) ($wallet->opening_balance ?? 0)),
                'current_balance' => $this->roundMoney((float) ($wallet->current_balance ?? 0)),
            ],
            'summary' => [
                'deposit_count' => $depositCount,
                'handover_count' => $handoverCount,
                'total_deposit_amount' => $this->roundMoney($totalDepositAmount),
                'total_handover_amount' => $this->roundMoney($totalHandoverAmount),
            ],
            'recent_deposits' => $recentDeposits,
            'recent_handovers' => $recentHandovers,
        ]);
    }

    /**
     * @param  array<int, mixed>  $arguments
     */
    private function invokePrivate(object $object, string $method, array $arguments = []): mixed
    {
        $reflection = new \ReflectionMethod($object, $method);
        $reflection->setAccessible(true);

        return $reflection->invoke($object, ...$arguments);
    }
}
