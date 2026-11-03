<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\AccountingExpense;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Finance;
use App\Models\FinanceCollection;
use App\Models\LoanRequest;
use App\Models\LoanRequestCollection;
use App\Models\MicrofinanceLoanCollection;
use App\Models\MicrofinanceLoanRequest;
use App\Models\Mortgage;
use App\Models\MortgagePayment;
use App\Models\SavingsAccount;
use App\Models\SavingsAccountTransaction;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class BranchPerformanceReportController extends Controller
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

    private function isTopManagementUser(?object $user): bool
    {
        if ($this->isAdminUser($user)) {
            return true;
        }

        if (!$user) {
            return false;
        }

        $keywords = ['owner', 'ceo', 'regional manager', 'regional head', 'director', 'managing director', 'top management'];

        $matches = static function (string $value) use ($keywords): bool {
            $normalized = strtolower(trim($value));
            if ($normalized === '') {
                return false;
            }

            foreach ($keywords as $keyword) {
                if (str_contains($normalized, $keyword)) {
                    return true;
                }
            }

            return false;
        };

        if ($matches((string) optional($user->designation)->name)) {
            return true;
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            if ($matches((string) $roleName)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array{sections: array<int, array<string, float|string>>, summary: array<string, float>}
     */
    private function computeOverallCreditSections(array $branchIds, string $fromDate, string $toDate): array
    {
        $mfLoanBase = MicrofinanceLoanRequest::query()
            ->whereIn('branch_id', $branchIds)
            ->whereIn('status', ['approved', 'released']);
        $mfTotalDue = (float) ((clone $mfLoanBase)->sum('refundable_amount') ?: 0);
        $mfLifetimeReceived = (float) (MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->whereIn('mf_loan_requests.branch_id', $branchIds)
            ->whereIn('mf_loan_requests.status', ['approved', 'released'])
            ->whereNull('mf_loan_collections.deleted_at')
            ->sum('mf_loan_collections.collected_amount') ?: 0);
        $mfPeriodReceived = (float) (MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->whereIn('mf_loan_requests.branch_id', $branchIds)
            ->whereIn('mf_loan_requests.status', ['approved', 'released'])
            ->whereNull('mf_loan_collections.deleted_at')
            ->whereDate('mf_loan_collections.collection_date', '>=', $fromDate)
            ->whereDate('mf_loan_collections.collection_date', '<=', $toDate)
            ->sum('mf_loan_collections.collected_amount') ?: 0);
        $mfPeriodProfit = (float) (MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->whereIn('mf_loan_requests.branch_id', $branchIds)
            ->whereIn('mf_loan_requests.status', ['approved', 'released'])
            ->whereNull('mf_loan_collections.deleted_at')
            ->whereDate('mf_loan_collections.collection_date', '>=', $fromDate)
            ->whereDate('mf_loan_collections.collection_date', '<=', $toDate)
            ->selectRaw('COALESCE(SUM(mf_loan_collections.interest_amount + mf_loan_collections.penalty_amount), 0) as profit')
            ->value('profit') ?: 0);
        $mfOutstanding = max($mfTotalDue - $mfLifetimeReceived, 0);

        $financeBase = Finance::query()
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'active');
        $financeTotalDue = (float) ((clone $financeBase)->sum('refund_amount') ?: 0);
        $financeOutstanding = (float) ((clone $financeBase)->sum('balance_amount') ?: 0);
        $financeBranchExpr = 'COALESCE(finance_collections.branch_id, finances.branch_id, customers.branch_id)';
        $financePeriodReceived = (float) (FinanceCollection::query()
            ->leftJoin('finances', 'finances.id', '=', 'finance_collections.finance_id')
            ->leftJoin('customers', 'customers.id', '=', 'finances.customer_id')
            ->whereIn(DB::raw($financeBranchExpr), $branchIds)
            ->whereDate('finance_collections.payment_date', '>=', $fromDate)
            ->whereDate('finance_collections.payment_date', '<=', $toDate)
            ->sum('finance_collections.payment_amount') ?: 0);
        $financePeriodProfit = (float) (FinanceCollection::query()
            ->leftJoin('finances', 'finances.id', '=', 'finance_collections.finance_id')
            ->leftJoin('customers', 'customers.id', '=', 'finances.customer_id')
            ->whereIn(DB::raw($financeBranchExpr), $branchIds)
            ->whereDate('finance_collections.payment_date', '>=', $fromDate)
            ->whereDate('finance_collections.payment_date', '<=', $toDate)
            ->sum('finance_collections.interest_paid') ?: 0);

        $mortgageBase = Mortgage::query()
            ->whereIn('branch_id', $branchIds)
            ->whereIn('status', ['approved', 'active', 'arrears', 'released']);
        $mortgageTotalDue = (float) ((clone $mortgageBase)->sum('approved_amount') ?: 0);
        $mortgageBranchExpr = 'COALESCE(mortgage_payments.branch_id, mortgages.branch_id)';
        $mortgageLifetimePrincipalPaid = (float) (MortgagePayment::query()
            ->leftJoin('mortgages', 'mortgages.id', '=', 'mortgage_payments.mortgage_id')
            ->whereIn(DB::raw($mortgageBranchExpr), $branchIds)
            ->sum('mortgage_payments.principal_amount') ?: 0);
        $mortgageOutstanding = max($mortgageTotalDue - $mortgageLifetimePrincipalPaid, 0);
        $mortgagePeriodReceived = (float) (MortgagePayment::query()
            ->leftJoin('mortgages', 'mortgages.id', '=', 'mortgage_payments.mortgage_id')
            ->whereIn(DB::raw($mortgageBranchExpr), $branchIds)
            ->whereDate('mortgage_payments.paid_date', '>=', $fromDate)
            ->whereDate('mortgage_payments.paid_date', '<=', $toDate)
            ->sum('mortgage_payments.amount') ?: 0);
        $mortgagePeriodProfit = (float) (MortgagePayment::query()
            ->leftJoin('mortgages', 'mortgages.id', '=', 'mortgage_payments.mortgage_id')
            ->whereIn(DB::raw($mortgageBranchExpr), $branchIds)
            ->whereDate('mortgage_payments.paid_date', '>=', $fromDate)
            ->whereDate('mortgage_payments.paid_date', '<=', $toDate)
            ->sum('mortgage_payments.profit_amount') ?: 0);

        $sections = [
            [
                'key' => 'microfinance',
                'label' => 'Micro Finance',
                'total_due' => round($mfTotalDue, 2),
                'total_received' => round($mfPeriodReceived, 2),
                'outstanding' => round($mfOutstanding, 2),
                'profit' => round($mfPeriodProfit, 2),
            ],
            [
                'key' => 'finance',
                'label' => 'Finance',
                'total_due' => round($financeTotalDue, 2),
                'total_received' => round($financePeriodReceived, 2),
                'outstanding' => round($financeOutstanding, 2),
                'profit' => round($financePeriodProfit, 2),
            ],
            [
                'key' => 'mortgage',
                'label' => 'Mortgage',
                'total_due' => round($mortgageTotalDue, 2),
                'total_received' => round($mortgagePeriodReceived, 2),
                'outstanding' => round($mortgageOutstanding, 2),
                'profit' => round($mortgagePeriodProfit, 2),
            ],
        ];

        $summary = [
            'total_due' => round(array_sum(array_map(static fn (array $item) => (float) $item['total_due'], $sections)), 2),
            'total_received' => round(array_sum(array_map(static fn (array $item) => (float) $item['total_received'], $sections)), 2),
            'outstanding' => round(array_sum(array_map(static fn (array $item) => (float) $item['outstanding'], $sections)), 2),
            'profit' => round(array_sum(array_map(static fn (array $item) => (float) $item['profit'], $sections)), 2),
        ];

        return ['sections' => $sections, 'summary' => $summary];
    }

    private function scopedBranchId(Request $request): ?int
    {
        if ($this->isAdminUser($request->user())) {
            $requested = (int) $request->get('branch_id', 0);
            return $requested > 0 ? $requested : null;
        }

        $branchId = (int) ($request->user()?->branch_id ?? 0);
        return $branchId > 0 ? $branchId : null;
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $fromDate = !empty($validated['from_date'])
            ? Carbon::parse((string) $validated['from_date'])->toDateString()
            : now()->startOfMonth()->toDateString();
        $toDate = !empty($validated['to_date'])
            ? Carbon::parse((string) $validated['to_date'])->toDateString()
            : now()->toDateString();

        $scopedBranchId = $this->scopedBranchId($request);

        $branchesQuery = Company::query()->with('manager:id,name,email')->orderBy('name');
        if ($scopedBranchId !== null) {
            $branchesQuery->where('id', $scopedBranchId);
        }

        $branches = $branchesQuery->get();
        $branchIds = $branches->pluck('id')->map(fn ($id) => (int) $id)->all();

        if (empty($branchIds)) {
            return response()->json([
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'data' => [],
                'summary' => $this->emptySummary(),
            ]);
        }

        $mfCollections = $this->mfCollectionsByBranch($branchIds, $fromDate, $toDate);
        $financeCollections = $this->financeCollectionsByBranch($branchIds, $fromDate, $toDate);
        $mortgageCollections = $this->mortgageCollectionsByBranch($branchIds, $fromDate, $toDate);
        $instantCollections = $this->instantLoanCollectionsByBranch($branchIds, $fromDate, $toDate);

        $mfPortfolio = $this->mfPortfolioByBranch($branchIds);
        $financePortfolio = $this->financePortfolioByBranch($branchIds);
        $mortgagePortfolio = $this->mortgagePortfolioByBranch($branchIds);
        $instantPortfolio = $this->instantLoanPortfolioByBranch($branchIds);
        $mfCharges = $this->mfChargesByBranch($branchIds);
        $financeCharges = $this->financeChargesByBranch($branchIds);
        $mortgageCharges = $this->mortgageChargesByBranch($branchIds);
        $savingsDeposits = $this->savingsDepositsByBranch($branchIds, $fromDate, $toDate);
        $savingsCounts = $this->savingsCountByBranch($branchIds);
        $employeeCounts = $this->employeeCountByBranch($branchIds);
        $expensesByBranch = $this->expensesByBranch($branchIds, $fromDate, $toDate);

        $rows = [];
        foreach ($branches as $branch) {
            $id = (int) $branch->id;
            $mfCol = $mfCollections[$id] ?? [];
            $finCol = $financeCollections[$id] ?? [];
            $mortCol = $mortgageCollections[$id] ?? [];
            $instCol = $instantCollections[$id] ?? [];
            $mfPort = $mfPortfolio[$id] ?? [];
            $finPort = $financePortfolio[$id] ?? [];
            $mortPort = $mortgagePortfolio[$id] ?? [];
            $instPort = $instantPortfolio[$id] ?? [];
            $mfCharge = $mfCharges[$id] ?? [];
            $finCharge = $financeCharges[$id] ?? [];
            $mortCharge = $mortgageCharges[$id] ?? [];
            $savDeposit = $savingsDeposits[$id] ?? [];
            $expense = $expensesByBranch[$id] ?? [];

            $periodCollected = round(
                (float) ($mfCol['collected'] ?? 0)
                + (float) ($finCol['collected'] ?? 0)
                + (float) ($mortCol['collected'] ?? 0)
                + (float) ($instCol['collected'] ?? 0),
                2
            );

            $periodProfit = round(
                (float) ($mfCol['interest'] ?? 0)
                + (float) ($mfCol['penalty'] ?? 0)
                + (float) ($finCol['interest_paid'] ?? 0)
                + (float) ($mortCol['profit'] ?? 0),
                2
            );

            $periodExpenses = round((float) ($expense['period_expenses'] ?? 0), 2);

            $rows[] = [
                'branch_id' => $id,
                'branch_name' => $branch->name,
                'manager_name' => optional($branch->manager)->name,
                'opening_asset' => (float) ($branch->opening_asset ?? 0),
                'employee_count' => (int) ($employeeCounts[$id] ?? 0),
                'savings_accounts' => (int) ($savingsCounts[$id] ?? 0),
                'savings_deposits' => (float) ($savDeposit['savings_deposits'] ?? 0),
                'fixed_deposit_deposits' => (float) ($savDeposit['fixed_deposit_deposits'] ?? 0),
                'investment_deposits' => (float) ($savDeposit['investment_deposits'] ?? 0),
                'savings_period_deposits' => (float) ($savDeposit['savings_period_deposits'] ?? 0),
                'fixed_deposit_period_deposits' => (float) ($savDeposit['fixed_deposit_period_deposits'] ?? 0),
                'investment_period_deposits' => (float) ($savDeposit['investment_period_deposits'] ?? 0),
                'savings_interest_expense' => (float) ($savDeposit['savings_interest_expense'] ?? 0),
                'fixed_deposit_interest_expense' => (float) ($savDeposit['fixed_deposit_interest_expense'] ?? 0),
                'investment_interest_expense' => (float) ($savDeposit['investment_interest_expense'] ?? 0),
                'mf_active_loans' => (int) ($mfPort['active_loans'] ?? 0),
                'mf_arrears' => (float) ($mfPort['arrears'] ?? 0),
                'mf_outstanding' => (float) ($mfPort['outstanding'] ?? 0),
                'mf_collected' => (float) ($mfCol['collected'] ?? 0),
                'mf_capital' => (float) ($mfCol['capital'] ?? 0),
                'mf_interest' => (float) ($mfCol['interest'] ?? 0),
                'mf_penalty' => (float) ($mfCol['penalty'] ?? 0),
                'mf_transactions' => (int) ($mfCol['transactions'] ?? 0),
                'mf_document_charges' => (float) ($mfCharge['document_charges'] ?? 0),
                'mf_stamp_charges' => (float) ($mfCharge['stamp_charges'] ?? 0),
                'mf_insurance_charges' => (float) ($mfCharge['insurance_charges'] ?? 0),
                'mf_other_charges' => (float) ($mfCharge['other_charges'] ?? 0),
                'finance_active' => (int) ($finPort['active_accounts'] ?? 0),
                'finance_arrears' => (float) ($finPort['arrears'] ?? 0),
                'finance_outstanding' => (float) ($finPort['outstanding'] ?? 0),
                'finance_collected' => (float) ($finCol['collected'] ?? 0),
                'finance_interest' => (float) ($finCol['interest_paid'] ?? 0),
                'finance_transactions' => (int) ($finCol['transactions'] ?? 0),
                'finance_document_charges' => (float) ($finCharge['document_charges'] ?? 0),
                'finance_stamp_charges' => (float) ($finCharge['stamp_charges'] ?? 0),
                'finance_insurance_charges' => (float) ($finCharge['insurance_charges'] ?? 0),
                'finance_other_charges' => (float) ($finCharge['other_charges'] ?? 0),
                'mortgage_active' => (int) ($mortPort['active_accounts'] ?? 0),
                'mortgage_arrears' => (float) ($mortPort['arrears'] ?? 0),
                'mortgage_collected' => (float) ($mortCol['collected'] ?? 0),
                'mortgage_profit' => (float) ($mortCol['profit'] ?? 0),
                'mortgage_transactions' => (int) ($mortCol['transactions'] ?? 0),
                'mortgage_document_charges' => (float) ($mortCharge['document_charges'] ?? 0),
                'mortgage_stamp_charges' => (float) ($mortCharge['stamp_charges'] ?? 0),
                'mortgage_insurance_charges' => (float) ($mortCharge['insurance_charges'] ?? 0),
                'mortgage_other_charges' => (float) ($mortCharge['other_charges'] ?? 0),
                'instant_active' => (int) ($instPort['active_loans'] ?? 0),
                'instant_outstanding' => (float) ($instPort['outstanding'] ?? 0),
                'instant_collected' => (float) ($instCol['collected'] ?? 0),
                'instant_transactions' => (int) ($instCol['transactions'] ?? 0),
                'period_collected' => $periodCollected,
                'period_profit' => $periodProfit,
                'period_expenses' => $periodExpenses,
                'net_profit_after_expenses' => round($periodProfit - $periodExpenses, 2),
                'total_arrears' => round(
                    (float) ($mfPort['arrears'] ?? 0)
                    + (float) ($finPort['arrears'] ?? 0)
                    + (float) ($mortPort['arrears'] ?? 0),
                    2
                ),
                'total_outstanding' => round(
                    (float) ($mfPort['outstanding'] ?? 0)
                    + (float) ($finPort['outstanding'] ?? 0)
                    + (float) ($instPort['outstanding'] ?? 0),
                    2
                ),
            ];
        }

        usort($rows, static fn (array $a, array $b) => ($b['period_collected'] <=> $a['period_collected']));

        $summary = $this->buildSummary($rows);

        return response()->json([
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'data' => $rows,
            'summary' => $summary,
        ]);
    }

    public function overallCreditSummary(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $fromDate = !empty($validated['from_date'])
            ? Carbon::parse((string) $validated['from_date'])->toDateString()
            : now()->startOfMonth()->toDateString();
        $toDate = !empty($validated['to_date'])
            ? Carbon::parse((string) $validated['to_date'])->toDateString()
            : now()->toDateString();

        $scopedBranchId = $this->scopedBranchId($request);
        $branchesQuery = Company::query()->orderBy('name');
        if ($scopedBranchId !== null) {
            $branchesQuery->where('id', $scopedBranchId);
        }

        $branchIds = $branchesQuery->pluck('id')->map(fn ($id) => (int) $id)->all();

        if (empty($branchIds)) {
            return response()->json([
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'sections' => [],
                'summary' => [
                    'total_due' => 0.0,
                    'total_received' => 0.0,
                    'outstanding' => 0.0,
                    'profit' => 0.0,
                ],
            ]);
        }

        $credit = $this->computeOverallCreditSections($branchIds, $fromDate, $toDate);

        return response()->json([
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'sections' => $credit['sections'],
            'summary' => $credit['summary'],
            'branch_count' => count($branchIds),
        ]);
    }

    public function topManagementOverview(Request $request): JsonResponse
    {
        if (!$this->isTopManagementUser($request->user())) {
            return response()->json([
                'message' => 'Only top management roles can view this report.',
            ], 403);
        }

        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'branch_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $fromDate = !empty($validated['from_date'])
            ? Carbon::parse((string) $validated['from_date'])->toDateString()
            : now()->startOfMonth()->toDateString();
        $toDate = !empty($validated['to_date'])
            ? Carbon::parse((string) $validated['to_date'])->toDateString()
            : now()->toDateString();

        $requestedBranchId = (int) ($validated['branch_id'] ?? 0);
        $branchesQuery = Company::query()->orderBy('name');
        if ($requestedBranchId > 0) {
            $branchesQuery->where('id', $requestedBranchId);
        }

        $branches = $branchesQuery->get(['id', 'name']);
        $branchIds = $branches->pluck('id')->map(fn ($id) => (int) $id)->all();

        if (empty($branchIds)) {
            return response()->json([
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'summary' => [
                    'total_due' => 0.0,
                    'total_received' => 0.0,
                    'outstanding' => 0.0,
                    'credit_profit' => 0.0,
                    'expense_total' => 0.0,
                    'net_profit' => 0.0,
                ],
                'sections' => [],
                'top_collected_branches' => [],
                'top_risk_branches' => [],
                'branch_count' => 0,
            ]);
        }

        $credit = $this->computeOverallCreditSections($branchIds, $fromDate, $toDate);
        $summaryRows = $credit['summary'];

        $mfCollections = $this->mfCollectionsByBranch($branchIds, $fromDate, $toDate);
        $financeCollections = $this->financeCollectionsByBranch($branchIds, $fromDate, $toDate);
        $mortgageCollections = $this->mortgageCollectionsByBranch($branchIds, $fromDate, $toDate);
        $instantCollections = $this->instantLoanCollectionsByBranch($branchIds, $fromDate, $toDate);
        $mfPortfolio = $this->mfPortfolioByBranch($branchIds);
        $financePortfolio = $this->financePortfolioByBranch($branchIds);
        $mortgagePortfolio = $this->mortgagePortfolioByBranch($branchIds);
        $instantPortfolio = $this->instantLoanPortfolioByBranch($branchIds);

        $branchPerformanceRows = [];
        foreach ($branches as $branch) {
            $id = (int) $branch->id;
            $mfCol = $mfCollections[$id] ?? [];
            $finCol = $financeCollections[$id] ?? [];
            $mortCol = $mortgageCollections[$id] ?? [];
            $instCol = $instantCollections[$id] ?? [];
            $mfPort = $mfPortfolio[$id] ?? [];
            $finPort = $financePortfolio[$id] ?? [];
            $mortPort = $mortgagePortfolio[$id] ?? [];
            $instPort = $instantPortfolio[$id] ?? [];

            $branchPerformanceRows[] = [
                'branch_id' => $id,
                'branch_name' => (string) $branch->name,
                'period_collected' => round(
                    (float) ($mfCol['collected'] ?? 0)
                    + (float) ($finCol['collected'] ?? 0)
                    + (float) ($mortCol['collected'] ?? 0)
                    + (float) ($instCol['collected'] ?? 0),
                    2
                ),
                'period_profit' => round(
                    (float) ($mfCol['interest'] ?? 0)
                    + (float) ($mfCol['penalty'] ?? 0)
                    + (float) ($finCol['interest_paid'] ?? 0)
                    + (float) ($mortCol['profit'] ?? 0),
                    2
                ),
                'total_arrears' => round(
                    (float) ($mfPort['arrears'] ?? 0)
                    + (float) ($finPort['arrears'] ?? 0)
                    + (float) ($mortPort['arrears'] ?? 0),
                    2
                ),
                'total_outstanding' => round(
                    (float) ($mfPort['outstanding'] ?? 0)
                    + (float) ($finPort['outstanding'] ?? 0)
                    + (float) ($instPort['outstanding'] ?? 0),
                    2
                ),
            ];
        }

        $topCollected = $branchPerformanceRows;
        usort($topCollected, static fn (array $a, array $b) => ((float) $b['period_collected']) <=> ((float) $a['period_collected']));
        $topCollected = array_slice($topCollected, 0, 8);

        $topRisk = $branchPerformanceRows;
        usort($topRisk, static fn (array $a, array $b) => ((float) $b['total_arrears']) <=> ((float) $a['total_arrears']));
        $topRisk = array_values(array_filter($topRisk, static fn (array $item) => ((float) $item['total_arrears']) > 0));
        $topRisk = array_slice($topRisk, 0, 8);

        $expenseTotal = (float) (AccountingExpense::query()
            ->whereIn('company_id', $branchIds)
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->sum('amount') ?: 0);

        $creditProfit = (float) ($summaryRows['profit'] ?? 0);
        $netProfit = $creditProfit - $expenseTotal;

        return response()->json([
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'sections' => $credit['sections'],
            'summary' => [
                'total_due' => round((float) ($summaryRows['total_due'] ?? 0), 2),
                'total_received' => round((float) ($summaryRows['total_received'] ?? 0), 2),
                'outstanding' => round((float) ($summaryRows['outstanding'] ?? 0), 2),
                'credit_profit' => round($creditProfit, 2),
                'expense_total' => round($expenseTotal, 2),
                'net_profit' => round($netProfit, 2),
            ],
            'top_collected_branches' => $topCollected,
            'top_risk_branches' => $topRisk,
            'branch_count' => count($branchIds),
        ]);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function mfCollectionsByBranch(array $branchIds, string $fromDate, string $toDate): array
    {
        $branchExpr = 'COALESCE(mf_loan_requests.branch_id, customers.branch_id)';

        $rows = MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->leftJoin('customers', 'customers.customer_code', '=', 'mf_loan_requests.customer_no')
            ->whereNull('mf_loan_collections.deleted_at')
            ->whereIn(DB::raw($branchExpr), $branchIds)
            ->whereDate('mf_loan_collections.collection_date', '>=', $fromDate)
            ->whereDate('mf_loan_collections.collection_date', '<=', $toDate)
            ->groupBy(DB::raw($branchExpr))
            ->selectRaw($branchExpr . ' as branch_id')
            ->selectRaw('COALESCE(SUM(mf_loan_collections.collected_amount), 0) as collected')
            ->selectRaw('COALESCE(SUM(mf_loan_collections.capital_amount), 0) as capital')
            ->selectRaw('COALESCE(SUM(mf_loan_collections.interest_amount), 0) as interest')
            ->selectRaw('COALESCE(SUM(mf_loan_collections.penalty_amount), 0) as penalty')
            ->selectRaw('COUNT(*) as transactions')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function mfChargesByBranch(array $branchIds): array
    {
        if (!DB::getSchemaBuilder()->hasTable('mf_loan_requests')) {
            return [];
        }

        $hasDocumentCharges = DB::getSchemaBuilder()->hasColumn('mf_loan_requests', 'document_charges');
        $hasStampCharges = DB::getSchemaBuilder()->hasColumn('mf_loan_requests', 'stamp_charges');
        $hasInsuranceCharges = DB::getSchemaBuilder()->hasColumn('mf_loan_requests', 'insurance_charges');
        $hasOtherCharges = DB::getSchemaBuilder()->hasColumn('mf_loan_requests', 'extra_document_charges');

        $rows = MicrofinanceLoanRequest::query()
            ->whereIn('branch_id', $branchIds)
            ->whereIn('status', ['approved', 'released'])
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw($hasDocumentCharges ? 'COALESCE(SUM(document_charges), 0) as document_charges' : '0 as document_charges')
            ->selectRaw($hasStampCharges ? 'COALESCE(SUM(stamp_charges), 0) as stamp_charges' : '0 as stamp_charges')
            ->selectRaw($hasInsuranceCharges ? 'COALESCE(SUM(insurance_charges), 0) as insurance_charges' : '0 as insurance_charges')
            ->selectRaw($hasOtherCharges ? 'COALESCE(SUM(extra_document_charges), 0) as other_charges' : '0 as other_charges')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function financeChargesByBranch(array $branchIds): array
    {
        if (!DB::getSchemaBuilder()->hasTable('finances')) {
            return [];
        }

        $hasDocumentCharges = DB::getSchemaBuilder()->hasColumn('finances', 'document_charges');
        $hasStampCharges = DB::getSchemaBuilder()->hasColumn('finances', 'stamp_charges');
        $hasInsuranceCharges = DB::getSchemaBuilder()->hasColumn('finances', 'insurance_charges');
        $hasOtherCharges = DB::getSchemaBuilder()->hasColumn('finances', 'other_charges');

        $rows = Finance::query()
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'active')
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw($hasDocumentCharges ? 'COALESCE(SUM(document_charges), 0) as document_charges' : '0 as document_charges')
            ->selectRaw($hasStampCharges ? 'COALESCE(SUM(stamp_charges), 0) as stamp_charges' : '0 as stamp_charges')
            ->selectRaw($hasInsuranceCharges ? 'COALESCE(SUM(insurance_charges), 0) as insurance_charges' : '0 as insurance_charges')
            ->selectRaw($hasOtherCharges ? 'COALESCE(SUM(other_charges), 0) as other_charges' : '0 as other_charges')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function mortgageChargesByBranch(array $branchIds): array
    {
        if (!DB::getSchemaBuilder()->hasTable('mortgages')) {
            return [];
        }

        $hasDocumentCharges = DB::getSchemaBuilder()->hasColumn('mortgages', 'document_charges');
        $hasStampCharges = DB::getSchemaBuilder()->hasColumn('mortgages', 'stamp_charges');
        $hasInsuranceCharges = DB::getSchemaBuilder()->hasColumn('mortgages', 'insurance_fee');
        $hasOtherCharges = DB::getSchemaBuilder()->hasColumn('mortgages', 'additional_charges');

        $rows = Mortgage::query()
            ->whereIn('branch_id', $branchIds)
            ->whereIn('status', ['approved', 'active', 'arrears', 'released'])
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw($hasDocumentCharges ? 'COALESCE(SUM(document_charges), 0) as document_charges' : '0 as document_charges')
            ->selectRaw($hasStampCharges ? 'COALESCE(SUM(stamp_charges), 0) as stamp_charges' : '0 as stamp_charges')
            ->selectRaw($hasInsuranceCharges ? 'COALESCE(SUM(insurance_fee), 0) as insurance_charges' : '0 as insurance_charges')
            ->selectRaw($hasOtherCharges ? 'COALESCE(SUM(additional_charges), 0) as other_charges' : '0 as other_charges')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function financeCollectionsByBranch(array $branchIds, string $fromDate, string $toDate): array
    {
        $branchExpr = 'COALESCE(finance_collections.branch_id, finances.branch_id, customers.branch_id)';

        $rows = FinanceCollection::query()
            ->leftJoin('finances', 'finances.id', '=', 'finance_collections.finance_id')
            ->leftJoin('customers', 'customers.id', '=', 'finances.customer_id')
            ->whereIn(DB::raw($branchExpr), $branchIds)
            ->whereDate('finance_collections.payment_date', '>=', $fromDate)
            ->whereDate('finance_collections.payment_date', '<=', $toDate)
            ->groupBy(DB::raw($branchExpr))
            ->selectRaw($branchExpr . ' as branch_id')
            ->selectRaw('COALESCE(SUM(finance_collections.payment_amount), 0) as collected')
            ->selectRaw('COALESCE(SUM(finance_collections.interest_paid), 0) as interest_paid')
            ->selectRaw('COUNT(*) as transactions')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function mortgageCollectionsByBranch(array $branchIds, string $fromDate, string $toDate): array
    {
        $branchExpr = 'COALESCE(mortgage_payments.branch_id, mortgages.branch_id)';

        $rows = MortgagePayment::query()
            ->leftJoin('mortgages', 'mortgages.id', '=', 'mortgage_payments.mortgage_id')
            ->whereIn(DB::raw($branchExpr), $branchIds)
            ->whereDate('mortgage_payments.paid_date', '>=', $fromDate)
            ->whereDate('mortgage_payments.paid_date', '<=', $toDate)
            ->groupBy(DB::raw($branchExpr))
            ->selectRaw($branchExpr . ' as branch_id')
            ->selectRaw('COALESCE(SUM(mortgage_payments.amount), 0) as collected')
            ->selectRaw('COALESCE(SUM(mortgage_payments.profit_amount), 0) as profit')
            ->selectRaw('COUNT(*) as transactions')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function instantLoanCollectionsByBranch(array $branchIds, string $fromDate, string $toDate): array
    {
        $rows = LoanRequestCollection::query()
            ->join('loan_requests', 'loan_requests.id', '=', 'loan_request_collections.loan_request_id')
            ->whereIn('loan_requests.branch_id', $branchIds)
            ->whereDate('loan_request_collections.collection_date', '>=', $fromDate)
            ->whereDate('loan_request_collections.collection_date', '<=', $toDate)
            ->groupBy('loan_requests.branch_id')
            ->selectRaw('loan_requests.branch_id as branch_id')
            ->selectRaw('COALESCE(SUM(loan_request_collections.collected_amount), 0) as collected')
            ->selectRaw('COUNT(*) as transactions')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function mfPortfolioByBranch(array $branchIds): array
    {
        $stats = MicrofinanceLoanRequest::query()
            ->whereIn('branch_id', $branchIds)
            ->whereIn('status', ['approved', 'released'])
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw('COUNT(*) as active_loans')
            ->selectRaw('COALESCE(SUM(arrears_balance), 0) as arrears')
            ->selectRaw('COALESCE(SUM(refundable_amount), 0) as refundable_total')
            ->get()
            ->keyBy('branch_id');

        $collectedTotals = MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->whereNull('mf_loan_collections.deleted_at')
            ->whereIn('mf_loan_requests.branch_id', $branchIds)
            ->whereIn('mf_loan_requests.status', ['approved', 'released'])
            ->groupBy('mf_loan_requests.branch_id')
            ->selectRaw('mf_loan_requests.branch_id as branch_id')
            ->selectRaw('COALESCE(SUM(mf_loan_collections.collected_amount), 0) as collected_total')
            ->get()
            ->keyBy('branch_id');

        $mapped = [];
        foreach ($branchIds as $branchId) {
            $stat = $stats->get($branchId);
            $collected = $collectedTotals->get($branchId);
            $refundable = (float) ($stat->refundable_total ?? 0);
            $paid = (float) ($collected->collected_total ?? 0);

            $mapped[$branchId] = [
                'branch_id' => $branchId,
                'active_loans' => (int) ($stat->active_loans ?? 0),
                'arrears' => (float) ($stat->arrears ?? 0),
                'outstanding' => max($refundable - $paid, 0),
            ];
        }

        return $mapped;
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function financePortfolioByBranch(array $branchIds): array
    {
        $rows = Finance::query()
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'active')
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw('COUNT(*) as active_accounts')
            ->selectRaw('COALESCE(SUM(arrears), 0) as arrears')
            ->selectRaw('COALESCE(SUM(balance_amount), 0) as outstanding')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function mortgagePortfolioByBranch(array $branchIds): array
    {
        $rows = Mortgage::query()
            ->whereIn('branch_id', $branchIds)
            ->whereIn('status', ['approved', 'active', 'arrears', 'released'])
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw('COUNT(*) as active_accounts')
            ->selectRaw('COALESCE(SUM(arrears_amount), 0) as arrears')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function instantLoanPortfolioByBranch(array $branchIds): array
    {
        $rows = LoanRequest::query()
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'approved')
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw('COUNT(*) as active_loans')
            ->selectRaw('COALESCE(SUM(GREATEST(total_payable - total_collected, 0)), 0) as outstanding')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function expensesByBranch(array $branchIds, string $fromDate, string $toDate): array
    {
        if (!DB::getSchemaBuilder()->hasTable('accounting_expenses')) {
            return [];
        }

        $rows = AccountingExpense::query()
            ->whereIn('company_id', $branchIds)
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->groupBy('company_id')
            ->selectRaw('company_id as branch_id')
            ->selectRaw('COALESCE(SUM(amount), 0) as period_expenses')
            ->get();

        return $this->mapByBranchId($rows);
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, int>
     */
    private function savingsCountByBranch(array $branchIds): array
    {
        if (!DB::getSchemaBuilder()->hasTable('savings_accounts')) {
            return [];
        }

        return SavingsAccount::query()
            ->whereIn('branch_id', $branchIds)
            ->groupBy('branch_id')
            ->selectRaw('branch_id, COUNT(*) as total')
            ->pluck('total', 'branch_id')
            ->map(fn ($v) => (int) $v)
            ->all();
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, float|int>>
     */
    private function savingsDepositsByBranch(array $branchIds, string $fromDate, string $toDate): array
    {
        if (!DB::getSchemaBuilder()->hasTable('savings_accounts') || !DB::getSchemaBuilder()->hasTable('savings_account_transactions')) {
            return [];
        }

        $accountRows = SavingsAccount::query()
            ->whereIn('branch_id', $branchIds)
            ->groupBy('branch_id')
            ->selectRaw('branch_id')
            ->selectRaw("COALESCE(SUM(CASE WHEN account_type IN ('savings', 'current') THEN balance ELSE 0 END), 0) as savings_deposits")
            ->selectRaw("COALESCE(SUM(CASE WHEN account_type = 'fixed_deposit' THEN balance ELSE 0 END), 0) as fixed_deposit_deposits")
            ->selectRaw("COALESCE(SUM(CASE WHEN account_type = 'investment' THEN balance ELSE 0 END), 0) as investment_deposits")
            ->get();

        $periodRows = SavingsAccountTransaction::query()
            ->join('savings_accounts', 'savings_accounts.id', '=', 'savings_account_transactions.savings_account_id')
            ->whereIn('savings_accounts.branch_id', $branchIds)
            ->whereIn('savings_account_transactions.transaction_type', ['deposit', 'interest_credit'])
            ->whereRaw('DATE(COALESCE(savings_account_transactions.transaction_date, savings_account_transactions.created_at)) >= ?', [$fromDate])
            ->whereRaw('DATE(COALESCE(savings_account_transactions.transaction_date, savings_account_transactions.created_at)) <= ?', [$toDate])
            ->groupBy('savings_accounts.branch_id')
            ->selectRaw('savings_accounts.branch_id as branch_id')
            ->selectRaw("COALESCE(SUM(CASE WHEN savings_accounts.account_type IN ('savings', 'current') THEN savings_account_transactions.amount ELSE 0 END), 0) as savings_period_deposits")
            ->selectRaw("COALESCE(SUM(CASE WHEN savings_accounts.account_type = 'fixed_deposit' THEN savings_account_transactions.amount ELSE 0 END), 0) as fixed_deposit_period_deposits")
            ->selectRaw("COALESCE(SUM(CASE WHEN savings_accounts.account_type = 'investment' THEN savings_account_transactions.amount ELSE 0 END), 0) as investment_period_deposits")
            ->selectRaw("COALESCE(SUM(CASE WHEN savings_accounts.account_type IN ('savings', 'current') AND savings_account_transactions.transaction_type = 'interest_credit' THEN savings_account_transactions.amount ELSE 0 END), 0) as savings_interest_expense")
            ->selectRaw("COALESCE(SUM(CASE WHEN savings_accounts.account_type = 'fixed_deposit' AND savings_account_transactions.transaction_type = 'interest_credit' THEN savings_account_transactions.amount ELSE 0 END), 0) as fixed_deposit_interest_expense")
            ->selectRaw("COALESCE(SUM(CASE WHEN savings_accounts.account_type = 'investment' AND savings_account_transactions.transaction_type = 'interest_credit' THEN savings_account_transactions.amount ELSE 0 END), 0) as investment_interest_expense")
            ->get();

        $accountMap = $this->mapByBranchId($accountRows);
        $periodMap = $this->mapByBranchId($periodRows);

        $merged = [];
        foreach ($branchIds as $branchId) {
            $book = $accountMap[$branchId] ?? [];
            $period = $periodMap[$branchId] ?? [];

            $merged[$branchId] = [
                'branch_id' => $branchId,
                'savings_deposits' => (float) ($book['savings_deposits'] ?? 0),
                'fixed_deposit_deposits' => (float) ($book['fixed_deposit_deposits'] ?? 0),
                'investment_deposits' => (float) ($book['investment_deposits'] ?? 0),
                'savings_period_deposits' => (float) ($period['savings_period_deposits'] ?? 0),
                'fixed_deposit_period_deposits' => (float) ($period['fixed_deposit_period_deposits'] ?? 0),
                'investment_period_deposits' => (float) ($period['investment_period_deposits'] ?? 0),
                'savings_interest_expense' => (float) ($period['savings_interest_expense'] ?? 0),
                'fixed_deposit_interest_expense' => (float) ($period['fixed_deposit_interest_expense'] ?? 0),
                'investment_interest_expense' => (float) ($period['investment_interest_expense'] ?? 0),
            ];
        }

        return $merged;
    }

    /**
     * @param  array<int, int>  $branchIds
     * @return array<int, int>
     */
    private function employeeCountByBranch(array $branchIds): array
    {
        return Employee::query()
            ->whereIn('branch_id', $branchIds)
            ->groupBy('branch_id')
            ->selectRaw('branch_id, COUNT(*) as total')
            ->pluck('total', 'branch_id')
            ->map(fn ($v) => (int) $v)
            ->all();
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object>|\Illuminate\Database\Eloquent\Collection<int, object>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function mapByBranchId($rows): array
    {
        $mapped = [];
        foreach ($rows as $row) {
            if ($row instanceof Model) {
                $payload = $row->getAttributes();
            } elseif (is_array($row)) {
                $payload = $row;
            } else {
                $payload = (array) $row;
            }

            $branchId = (int) ($payload['branch_id'] ?? 0);
            if ($branchId <= 0) {
                continue;
            }
            $mapped[$branchId] = $payload;
        }

        return $mapped;
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<string, float|int>
     */
    private function buildSummary(array $rows): array
    {
        $summary = $this->emptySummary();
        foreach ($rows as $row) {
            $summary['branch_count']++;
            $summary['period_collected'] += (float) ($row['period_collected'] ?? 0);
            $summary['period_profit'] += (float) ($row['period_profit'] ?? 0);
            $summary['period_expenses'] += (float) ($row['period_expenses'] ?? 0);
            $summary['net_profit_after_expenses'] += (float) ($row['net_profit_after_expenses'] ?? 0);
            $summary['total_arrears'] += (float) ($row['total_arrears'] ?? 0);
            $summary['total_outstanding'] += (float) ($row['total_outstanding'] ?? 0);
            $summary['mf_collected'] += (float) ($row['mf_collected'] ?? 0);
            $summary['finance_collected'] += (float) ($row['finance_collected'] ?? 0);
            $summary['mortgage_collected'] += (float) ($row['mortgage_collected'] ?? 0);
            $summary['instant_collected'] += (float) ($row['instant_collected'] ?? 0);
            $summary['mf_active_loans'] += (int) ($row['mf_active_loans'] ?? 0);
            $summary['finance_active'] += (int) ($row['finance_active'] ?? 0);
            $summary['mortgage_active'] += (int) ($row['mortgage_active'] ?? 0);
            $summary['instant_active'] += (int) ($row['instant_active'] ?? 0);
        }

        foreach (['period_collected', 'period_profit', 'period_expenses', 'net_profit_after_expenses', 'total_arrears', 'total_outstanding', 'mf_collected', 'finance_collected', 'mortgage_collected', 'instant_collected'] as $key) {
            $summary[$key] = round((float) $summary[$key], 2);
        }

        return $summary;
    }

    /**
     * @return array<string, float|int>
     */
    private function emptySummary(): array
    {
        return [
            'branch_count' => 0,
            'period_collected' => 0.0,
            'period_profit' => 0.0,
            'period_expenses' => 0.0,
            'net_profit_after_expenses' => 0.0,
            'total_arrears' => 0.0,
            'total_outstanding' => 0.0,
            'mf_collected' => 0.0,
            'finance_collected' => 0.0,
            'mortgage_collected' => 0.0,
            'instant_collected' => 0.0,
            'mf_active_loans' => 0,
            'finance_active' => 0,
            'mortgage_active' => 0,
            'instant_active' => 0,
        ];
    }
}
