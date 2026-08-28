<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountingExpense;
use App\Models\AccountingRefund;
use App\Models\Company;
use App\Models\CompanyAccount;
use App\Models\Customer;
use App\Models\DraftLoan;
use App\Models\Finance;
use App\Models\FinanceCollection;
use App\Models\FinanceDocument;
use App\Models\LoanRequest;
use App\Models\LoanRequestCollection;
use App\Models\MicrofinanceLoanCollection;
use App\Models\MicrofinanceLoanRequest;
use App\Models\Mortgage;
use App\Models\MortgagePayment;
use App\Models\SavingsAccount;
use App\Models\EmployeeWalletBankDeposit;
use App\Models\EmployeeWalletCashHandover;
use App\Models\Employee;
use App\Models\User;
use App\Services\SmsGatewayService;
use App\Services\WhatsappGatewayService;
use App\Services\SpeedDraftCalculator;
use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinanceController extends Controller
{
    public function __construct(private readonly SpeedDraftCalculator $speedDraftCalculator)
    {
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

    private function resolveBranchManagerUserId(int $branchId): ?int
    {
        if ($branchId <= 0) {
            return null;
        }

        $manager = User::query()
            ->with(['designation:id,name'])
            ->where('branch_id', $branchId)
            ->where(function ($query) {
                $query
                    ->whereHas('designation', function ($designationQuery) {
                        $designationQuery->whereRaw('LOWER(name) LIKE ?', ['%branch manager%']);
                    })
                    ->orWhereHas('employee.designation', function ($designationQuery) {
                        $designationQuery->whereRaw('LOWER(name) LIKE ?', ['%branch manager%']);
                    })
                    ->orWhereHas('roles', function ($roleQuery) {
                        $roleQuery->whereRaw('LOWER(name) LIKE ?', ['%branch manager%']);
                    });
            })
            ->orderBy('id')
            ->first();

        return $manager ? (int) $manager->id : null;
    }

    private function resolveBranchManagerEmployee(int $branchId): ?Employee
    {
        if ($branchId <= 0) {
            return null;
        }

        return Employee::query()
            ->with(['designation:id,name'])
            ->where('branch_id', $branchId)
            ->whereHas('designation', function ($query) {
                $query->whereRaw('LOWER(name) LIKE ?', ['%branch manager%']);
            })
            ->orderByRaw("CASE WHEN status IS NULL OR LOWER(status) = 'active' THEN 0 ELSE 1 END")
            ->orderBy('id')
            ->first();
    }

    public function assignmentOptions(Request $request): JsonResponse
    {
        $branchId = $this->scopedBranchId($request);
        $customerNo = trim((string) $request->get('customer_no', ''));

        if (($branchId === null || $branchId <= 0) && $customerNo !== '') {
            $customer = $this->resolveCustomerFromReference($customerNo);
            $branchFromCustomer = (int) ($customer?->branch_id ?? 0);
            if ($branchFromCustomer > 0) {
                $branchId = $branchFromCustomer;
            }
        }

        if ($branchId === null) {
            $branchId = (int) ($request->get('branch_id', 0));
        }

        if (!$branchId || $branchId <= 0) {
            return response()->json([
                'branch_id' => null,
                'branch_manager' => null,
                'responsible_officers' => [],
            ]);
        }

        $branchManagerUser = User::query()
            ->with(['employee:id,first_name,last_name,employee_code', 'designation:id,name'])
            ->where('branch_id', $branchId)
            ->where(function ($query) {
                $query
                    ->whereHas('designation', function ($designationQuery) {
                        $designationQuery->whereRaw('LOWER(name) LIKE ?', ['%branch manager%']);
                    })
                    ->orWhereHas('employee.designation', function ($designationQuery) {
                        $designationQuery->whereRaw('LOWER(name) LIKE ?', ['%branch manager%']);
                    })
                    ->orWhereHas('roles', function ($roleQuery) {
                        $roleQuery->whereRaw('LOWER(name) LIKE ?', ['%branch manager%']);
                    });
            })
            ->orderBy('id')
            ->first();

        $branchManagerEmployee = $this->resolveBranchManagerEmployee($branchId);

        $branchManager = null;
        if ($branchManagerUser || $branchManagerEmployee) {
            $employee = $branchManagerUser?->employee ?: $branchManagerEmployee;
            $fullName = trim((string) ($employee?->first_name ?? '') . ' ' . (string) ($employee?->last_name ?? ''));
            $branchManager = [
                'user_id' => $branchManagerUser ? (int) $branchManagerUser->id : null,
                'employee_id' => $employee ? (int) $employee->id : null,
                'name' => $fullName !== '' ? $fullName : (string) ($branchManagerUser?->name ?? 'N/A'),
                'employee_code' => (string) ($employee?->employee_code ?? ''),
                'designation' => (string) ($employee?->designation?->name ?? $branchManagerUser?->designation?->name ?? ''),
            ];
        }

        $responsibleOfficers = Employee::query()
            ->with(['designation:id,name'])
            ->where('branch_id', $branchId)
            ->whereHas('designation', function ($query) {
                $query->where(function ($designationQuery) {
                    $designationQuery
                        ->whereRaw('LOWER(name) LIKE ?', ['%credit officer%'])
                        ->orWhereRaw('LOWER(name) LIKE ?', ['%collection officer%'])
                        ->orWhereRaw('LOWER(name) LIKE ?', ['%loan officer%']);
                });
            })
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get()
            ->map(function (Employee $employee) {
                $fullName = trim((string) ($employee->first_name ?? '') . ' ' . (string) ($employee->last_name ?? ''));
                return [
                    'id' => (int) $employee->id,
                    'name' => $fullName !== '' ? $fullName : 'N/A',
                    'employee_code' => (string) ($employee->employee_code ?? ''),
                    'designation' => (string) ($employee->designation?->name ?? ''),
                ];
            })
            ->values();

        return response()->json([
            'branch_id' => $branchId,
            'branch_manager' => $branchManager,
            'responsible_officers' => $responsibleOfficers,
        ]);
    }

    private function resolveCustomerFromReference(string $reference): ?Customer
    {
        $normalized = strtoupper(trim($reference));
        if ($normalized === '') {
            return null;
        }

        if (ctype_digit($normalized) && strlen($normalized) <= 5) {
            $serial = str_pad($normalized, 5, '0', STR_PAD_LEFT);
            $bySerial = Customer::where('customer_code', 'like', '%-' . $serial)
                ->orderByDesc('id')
                ->first();
            if ($bySerial) {
                return $bySerial;
            }
        }

        $byCode = Customer::whereRaw('UPPER(customer_code) = ?', [$normalized])->first();
        if ($byCode) {
            return $byCode;
        }

        $account = SavingsAccount::query()
            ->with('customer')
            ->whereIn('account_type', ['savings', 'investment'])
            ->whereRaw('UPPER(account_number) = ?', [$normalized])
            ->orderByRaw("CASE WHEN account_type = 'savings' THEN 0 ELSE 1 END")
            ->first();

        if ($account?->customer) {
            return $account->customer;
        }

        return null;
    }

    private function resolveCanonicalCustomerNo(Customer $customer): string
    {
        $account = SavingsAccount::query()
            ->where('customer_id', (int) $customer->id)
            ->whereIn('account_type', ['savings', 'investment'])
            ->orderByRaw("CASE WHEN account_type = 'savings' THEN 0 ELSE 1 END")
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
            ->orderBy('id')
            ->first();

        $accountNo = trim((string) ($account->account_number ?? ''));
        if ($accountNo !== '') {
            return $accountNo;
        }

        return (string) ($customer->customer_code ?? '');
    }

    private function periodGroupExpression(string $column, string $groupBy): string
    {
        if ($groupBy === 'day') {
            return "DATE({$column})";
        }

        return "DATE_FORMAT({$column}, '%Y-%m-01')";
    }

    private function applyFinanceBranchScope($query, Request $request, string $column = 'branch_id')
    {
        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null) {
            $query->where($column, $branchId);
        }

        return $query;
    }

    private function resolveFinanceOrFail(Request $request, int $id, array $with = []): Finance
    {
        $query = Finance::query();
        if (!empty($with)) {
            $query->with($with);
        }

        $this->applyFinanceBranchScope($query, $request);

        return $query->findOrFail($id);
    }

    private function normalizeFinanceCustomer(?Customer $customer): ?Customer
    {
        if (!$customer) {
            return null;
        }

        $customer->repairCustomerCodeIfNeeded();

        return $customer->fresh();
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = (int) ($request->get('per_page', 20));

        $query = Finance::with(['customer', 'documents'])
            ->orderBy('id', 'desc');

        $this->applyFinanceBranchScope($query, $request);

        if ($request->filled('customer_id')) {
            $query->where('customer_id', (int) $request->get('customer_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->get('status'));
        }

        $data = $query->paginate($perPage);
        $data->getCollection()->transform(function (Finance $finance) {
            if ($finance->relationLoaded('customer') && $finance->customer) {
                $finance->setRelation('customer', $this->normalizeFinanceCustomer($finance->customer));
            }

            return $finance;
        });

        return response()->json($data);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $finance = $this->resolveFinanceOrFail($request, $id, ['customer', 'documents', 'collections' => function ($query) {
            $query->orderByDesc('payment_date')->orderByDesc('id');
        }]);

        if ($finance->relationLoaded('customer') && $finance->customer) {
            $finance->setRelation('customer', $this->normalizeFinanceCustomer($finance->customer));
        }

        return response()->json($finance);
    }

    public function incomeExpenseReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'product_type' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'max:50'],
            'group_by' => ['nullable', 'in:day,month'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $groupBy = (string) ($validated['group_by'] ?? 'month');

        $collectionsBase = FinanceCollection::query()
            ->join('finances', 'finances.id', '=', 'finance_collections.finance_id');

        $disbursementsBase = Finance::query();

        $requestedCompanyId = (int) ($validated['company_id'] ?? $validated['branch_id'] ?? 0);
        $branchId = $requestedCompanyId > 0 ? $requestedCompanyId : $this->scopedBranchId($request);
        $company = $branchId ? Company::query()->find($branchId) : null;

        if ($branchId !== null) {
            $collectionsBase->where('finances.branch_id', $branchId);
            $disbursementsBase->where('finances.branch_id', $branchId);
        }

        if (!empty($validated['from_date'])) {
            $collectionsBase->whereDate('finance_collections.payment_date', '>=', $validated['from_date']);
            $disbursementsBase->whereDate('finances.start_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $collectionsBase->whereDate('finance_collections.payment_date', '<=', $validated['to_date']);
            $disbursementsBase->whereDate('finances.start_date', '<=', $validated['to_date']);
        }

        if (!empty($validated['product_type'])) {
            $productType = strtolower(trim((string) $validated['product_type']));
            $collectionsBase->whereRaw('LOWER(finances.product_type) = ?', [$productType]);
            $disbursementsBase->whereRaw('LOWER(finances.product_type) = ?', [$productType]);
        }

        if (!empty($validated['status'])) {
            $status = strtolower(trim((string) $validated['status']));
            $collectionsBase->whereRaw('LOWER(finances.status) = ?', [$status]);
            $disbursementsBase->whereRaw('LOWER(finances.status) = ?', [$status]);
        }

        $incomeRows = (clone $collectionsBase)
            ->selectRaw($this->periodGroupExpression('finance_collections.payment_date', $groupBy) . ' as period')
            ->selectRaw('SUM(finance_collections.interest_paid) as interest_income')
            ->selectRaw('SUM(finance_collections.payment_amount) as total_collections')
            ->selectRaw('SUM(finance_collections.refund_amount) as refund_expense')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $disbursementRows = (clone $disbursementsBase)
            ->selectRaw($this->periodGroupExpression('finances.start_date', $groupBy) . ' as period')
            ->selectRaw('SUM(finances.financed_amount) as disbursement_expense')
            ->selectRaw('COUNT(*) as disbursement_accounts')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $loanCollectionsBase = LoanRequestCollection::query()
            ->join('loan_requests', 'loan_requests.id', '=', 'loan_request_collections.loan_request_id');

        $loanDisbursementsBase = LoanRequest::query()
            ->whereIn('loan_requests.status', ['approved', 'closed']);

        if ($branchId !== null) {
            $loanCollectionsBase->where('loan_requests.branch_id', $branchId);
            $loanDisbursementsBase->where('loan_requests.branch_id', $branchId);
        }

        if (!empty($validated['from_date'])) {
            $loanCollectionsBase->whereDate('loan_request_collections.collection_date', '>=', $validated['from_date']);
            $loanDisbursementsBase->whereRaw('DATE(COALESCE(loan_requests.last_action_at, loan_requests.created_at)) >= ?', [$validated['from_date']]);
        }

        if (!empty($validated['to_date'])) {
            $loanCollectionsBase->whereDate('loan_request_collections.collection_date', '<=', $validated['to_date']);
            $loanDisbursementsBase->whereRaw('DATE(COALESCE(loan_requests.last_action_at, loan_requests.created_at)) <= ?', [$validated['to_date']]);
        }

        if (!empty($validated['product_type'])) {
            $productType = strtolower(trim((string) $validated['product_type']));
            $loanCollectionsBase->whereRaw('LOWER(loan_requests.loan_product) = ?', [$productType]);
            $loanDisbursementsBase->whereRaw('LOWER(loan_requests.loan_product) = ?', [$productType]);
        }

        if (!empty($validated['status'])) {
            $status = strtolower(trim((string) $validated['status']));
            if ($status === 'active') {
                $loanCollectionsBase->where('loan_requests.status', 'approved');
                $loanDisbursementsBase->where('loan_requests.status', 'approved');
            } else {
                $loanCollectionsBase->whereRaw('LOWER(loan_requests.status) = ?', [$status]);
                $loanDisbursementsBase->whereRaw('LOWER(loan_requests.status) = ?', [$status]);
            }
        }

        $instantLoanCollectionCount = (int) (clone $loanCollectionsBase)->count('loan_request_collections.id');

        $loanCollectionRows = (clone $loanCollectionsBase)
            ->selectRaw($this->periodGroupExpression('loan_request_collections.collection_date', $groupBy) . ' as period')
            ->selectRaw('SUM(loan_request_collections.collected_amount) as total_collections')
            ->selectRaw(
                'SUM(loan_request_collections.collected_amount * CASE WHEN loan_requests.total_payable > 0 '
                . 'THEN GREATEST(loan_requests.total_payable - loan_requests.principal, 0) / loan_requests.total_payable '
                . 'ELSE 0 END) as interest_income'
            )
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $loanDisbursementRows = (clone $loanDisbursementsBase)
            ->selectRaw($this->periodGroupExpression('COALESCE(loan_requests.last_action_at, loan_requests.created_at)', $groupBy) . ' as period')
            ->selectRaw('SUM(loan_requests.principal) as disbursement_expense')
            ->selectRaw('COUNT(*) as disbursement_accounts')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $periodMap = [];

        $ensurePeriod = static function (array &$map, string $period): void {
            if (!isset($map[$period])) {
                $map[$period] = [
                    'period' => $period,
                    'interest_income' => 0.0,
                    'collection_inflow' => 0.0,
                    'refund_expense' => 0.0,
                    'disbursement_expense' => 0.0,
                    'disbursement_accounts' => 0,
                ];
            }
        };

        foreach ($incomeRows as $row) {
            $period = (string) $row->period;
            $ensurePeriod($periodMap, $period);
            $periodMap[$period]['interest_income'] += round((float) ($row->interest_income ?? 0), 2);
            $periodMap[$period]['collection_inflow'] += round((float) ($row->total_collections ?? 0), 2);
            $periodMap[$period]['refund_expense'] += round((float) ($row->refund_expense ?? 0), 2);
        }

        foreach ($loanCollectionRows as $row) {
            $period = (string) $row->period;
            $ensurePeriod($periodMap, $period);
            $periodMap[$period]['interest_income'] += round((float) ($row->interest_income ?? 0), 2);
            $periodMap[$period]['collection_inflow'] += round((float) ($row->total_collections ?? 0), 2);
        }

        foreach ($disbursementRows as $row) {
            $period = (string) $row->period;
            $ensurePeriod($periodMap, $period);
            $periodMap[$period]['disbursement_expense'] += round((float) ($row->disbursement_expense ?? 0), 2);
            $periodMap[$period]['disbursement_accounts'] += (int) ($row->disbursement_accounts ?? 0);
        }

        foreach ($loanDisbursementRows as $row) {
            $period = (string) $row->period;
            $ensurePeriod($periodMap, $period);
            $periodMap[$period]['disbursement_expense'] += round((float) ($row->disbursement_expense ?? 0), 2);
            $periodMap[$period]['disbursement_accounts'] += (int) ($row->disbursement_accounts ?? 0);
        }

        ksort($periodMap);

        $periods = array_map(function (array $row) {
            $totalExpense = round((float) $row['disbursement_expense'] + (float) $row['refund_expense'], 2);
            $netProfit = round((float) $row['interest_income'] - $totalExpense, 2);

            return [
                ...$row,
                'total_expense' => $totalExpense,
                'net_profit' => $netProfit,
            ];
        }, array_values($periodMap));

        $summary = [
            'periods_count' => count($periods),
            'total_interest_income' => round((float) collect($periods)->sum('interest_income'), 2),
            'total_collection_inflow' => round((float) collect($periods)->sum('collection_inflow'), 2),
            'total_disbursement_expense' => round((float) collect($periods)->sum('disbursement_expense'), 2),
            'total_refund_expense' => round((float) collect($periods)->sum('refund_expense'), 2),
            'total_expense' => round((float) collect($periods)->sum('total_expense'), 2),
            'net_profit' => round((float) collect($periods)->sum('net_profit'), 2),
            'disbursement_accounts' => (int) collect($periods)->sum('disbursement_accounts'),
            'instant_loan_collections' => $instantLoanCollectionCount,
        ];

        return response()->json([
            'summary' => $summary,
            'periods' => $periods,
            'company' => $company ? [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ] : null,
            'filters' => [
                'from_date' => $validated['from_date'] ?? null,
                'to_date' => $validated['to_date'] ?? null,
                'product_type' => $validated['product_type'] ?? null,
                'status' => $validated['status'] ?? null,
                'group_by' => $groupBy,
                'branch_id' => $branchId,
                'company_id' => $branchId,
            ],
        ]);
    }

    private function emptyCashFlowPeriodRow(string $period): array
    {
        return [
            'period' => $period,
            'cash_in' => 0.0,
            'cash_out' => 0.0,
            'refund_out' => 0.0,
            'collection_count' => 0,
            'disbursement_count' => 0,
        ];
    }

    private function ensureCashFlowPeriod(array &$periodMap, string $period): void
    {
        if (!isset($periodMap[$period])) {
            $periodMap[$period] = $this->emptyCashFlowPeriodRow($period);
        }
    }

    private function applyCashFlowInflowRows(array &$periodMap, $rows): void
    {
        foreach ($rows as $row) {
            $period = (string) $row->period;
            $this->ensureCashFlowPeriod($periodMap, $period);
            $periodMap[$period]['cash_in'] = round($periodMap[$period]['cash_in'] + (float) ($row->cash_in ?? 0), 2);
            $periodMap[$period]['collection_count'] += (int) ($row->collection_count ?? 0);
        }
    }

    private function applyCashFlowOutflowRows(array &$periodMap, $rows): void
    {
        foreach ($rows as $row) {
            $period = (string) $row->period;
            $this->ensureCashFlowPeriod($periodMap, $period);
            $periodMap[$period]['cash_out'] = round($periodMap[$period]['cash_out'] + (float) ($row->cash_out ?? 0), 2);
            $periodMap[$period]['disbursement_count'] += (int) ($row->disbursement_count ?? 0);
        }
    }

    private function applyCashFlowRefundRows(array &$periodMap, $rows): void
    {
        foreach ($rows as $row) {
            $period = (string) $row->period;
            $this->ensureCashFlowPeriod($periodMap, $period);
            $periodMap[$period]['refund_out'] = round($periodMap[$period]['refund_out'] + (float) ($row->refund_out ?? 0), 2);
        }
    }

    private function mergeCashFlowPeriodMaps(array ...$maps): array
    {
        $merged = [];

        foreach ($maps as $map) {
            foreach ($map as $period => $row) {
                $this->ensureCashFlowPeriod($merged, (string) $period);
                $merged[$period]['cash_in'] = round($merged[$period]['cash_in'] + (float) ($row['cash_in'] ?? 0), 2);
                $merged[$period]['cash_out'] = round($merged[$period]['cash_out'] + (float) ($row['cash_out'] ?? 0), 2);
                $merged[$period]['refund_out'] = round($merged[$period]['refund_out'] + (float) ($row['refund_out'] ?? 0), 2);
                $merged[$period]['collection_count'] += (int) ($row['collection_count'] ?? 0);
                $merged[$period]['disbursement_count'] += (int) ($row['disbursement_count'] ?? 0);
            }
        }

        return $merged;
    }

    private function finalizeCashFlowPeriodMap(array $periodMap): array
    {
        ksort($periodMap);

        $runningBalance = 0.0;

        return array_map(function (array $row) use (&$runningBalance) {
            $effectiveCashOut = round((float) $row['cash_out'] + (float) $row['refund_out'], 2);
            $netCashFlow = round((float) $row['cash_in'] - $effectiveCashOut, 2);
            $runningBalance = round($runningBalance + $netCashFlow, 2);

            return [
                ...$row,
                'effective_cash_out' => $effectiveCashOut,
                'net_cash_flow' => $netCashFlow,
                'running_cash_balance' => $runningBalance,
            ];
        }, array_values($periodMap));
    }

    private function summarizeCashFlowPeriods(array $periods): array
    {
        return [
            'periods_count' => count($periods),
            'total_cash_in' => round((float) collect($periods)->sum('cash_in'), 2),
            'total_cash_out' => round((float) collect($periods)->sum('cash_out'), 2),
            'total_refund_out' => round((float) collect($periods)->sum('refund_out'), 2),
            'total_effective_cash_out' => round((float) collect($periods)->sum('effective_cash_out'), 2),
            'net_cash_flow' => round((float) collect($periods)->sum('net_cash_flow'), 2),
            'ending_cash_balance' => count($periods) > 0 ? (float) ($periods[count($periods) - 1]['running_cash_balance'] ?? 0) : 0.0,
            'total_collections' => (int) collect($periods)->sum('collection_count'),
            'total_disbursements' => (int) collect($periods)->sum('disbursement_count'),
        ];
    }

    private function buildFinanceCashFlowPeriodMap(?int $branchId, array $validated, string $groupBy): array
    {
        $collectionsBase = FinanceCollection::query()
            ->join('finances', 'finances.id', '=', 'finance_collections.finance_id');

        $disbursementsBase = Finance::query();

        if ($branchId !== null) {
            $collectionsBase->where('finances.branch_id', $branchId);
            $disbursementsBase->where('finances.branch_id', $branchId);
        }

        if (!empty($validated['from_date'])) {
            $collectionsBase->whereDate('finance_collections.payment_date', '>=', $validated['from_date']);
            $disbursementsBase->whereDate('finances.start_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $collectionsBase->whereDate('finance_collections.payment_date', '<=', $validated['to_date']);
            $disbursementsBase->whereDate('finances.start_date', '<=', $validated['to_date']);
        }

        if (!empty($validated['product_type'])) {
            $productType = strtolower(trim((string) $validated['product_type']));
            $collectionsBase->whereRaw('LOWER(finances.product_type) = ?', [$productType]);
            $disbursementsBase->whereRaw('LOWER(finances.product_type) = ?', [$productType]);
        }

        if (!empty($validated['status'])) {
            $status = strtolower(trim((string) $validated['status']));
            $collectionsBase->whereRaw('LOWER(finances.status) = ?', [$status]);
            $disbursementsBase->whereRaw('LOWER(finances.status) = ?', [$status]);
        }

        $periodMap = [];

        $inflowRows = (clone $collectionsBase)
            ->selectRaw($this->periodGroupExpression('finance_collections.payment_date', $groupBy) . ' as period')
            ->selectRaw('SUM(finance_collections.payment_amount) as cash_in')
            ->selectRaw('COUNT(*) as collection_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $outflowRows = (clone $disbursementsBase)
            ->selectRaw($this->periodGroupExpression('finances.start_date', $groupBy) . ' as period')
            ->selectRaw('SUM(finances.financed_amount) as cash_out')
            ->selectRaw('COUNT(*) as disbursement_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $refundRows = (clone $collectionsBase)
            ->selectRaw($this->periodGroupExpression('finance_collections.payment_date', $groupBy) . ' as period')
            ->selectRaw('SUM(finance_collections.refund_amount) as refund_out')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $this->applyCashFlowInflowRows($periodMap, $inflowRows);
        $this->applyCashFlowOutflowRows($periodMap, $outflowRows);
        $this->applyCashFlowRefundRows($periodMap, $refundRows);

        return $periodMap;
    }

    private function buildMicrofinanceCashFlowPeriodMap(?int $branchId, array $validated, string $groupBy): array
    {
        if ($branchId === null) {
            return [];
        }

        $collectionsBase = MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->where('mf_loan_requests.branch_id', $branchId);

        $disbursementsBase = MicrofinanceLoanRequest::query()
            ->where('branch_id', $branchId)
            ->where('status', 'released');

        if (!empty($validated['from_date'])) {
            $collectionsBase->whereDate('mf_loan_collections.collection_date', '>=', $validated['from_date']);
            $disbursementsBase->whereDate('loan_request_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $collectionsBase->whereDate('mf_loan_collections.collection_date', '<=', $validated['to_date']);
            $disbursementsBase->whereDate('loan_request_date', '<=', $validated['to_date']);
        }

        $periodMap = [];

        $inflowRows = (clone $collectionsBase)
            ->selectRaw($this->periodGroupExpression('mf_loan_collections.collection_date', $groupBy) . ' as period')
            ->selectRaw('SUM(mf_loan_collections.collected_amount) as cash_in')
            ->selectRaw('COUNT(*) as collection_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $outflowRows = (clone $disbursementsBase)
            ->selectRaw($this->periodGroupExpression('mf_loan_requests.loan_request_date', $groupBy) . ' as period')
            ->selectRaw('SUM(COALESCE(NULLIF(mf_loan_requests.net_disbursed_amount, 0), mf_loan_requests.loan_amount)) as cash_out')
            ->selectRaw('COUNT(*) as disbursement_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $this->applyCashFlowInflowRows($periodMap, $inflowRows);
        $this->applyCashFlowOutflowRows($periodMap, $outflowRows);

        return $periodMap;
    }

    private function buildMortgageCashFlowPeriodMap(?int $branchId, array $validated, string $groupBy): array
    {
        if ($branchId === null) {
            return [];
        }

        $collectionsBase = MortgagePayment::query()->where('branch_id', $branchId);

        $disbursementsBase = Mortgage::query()
            ->where('branch_id', $branchId)
            ->whereIn('status', ['approved', 'active', 'released'])
            ->whereNotNull('approved_at');

        if (!empty($validated['from_date'])) {
            $collectionsBase->whereDate('paid_date', '>=', $validated['from_date']);
            $disbursementsBase->whereDate('approved_at', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $collectionsBase->whereDate('paid_date', '<=', $validated['to_date']);
            $disbursementsBase->whereDate('approved_at', '<=', $validated['to_date']);
        }

        $periodMap = [];

        $inflowRows = (clone $collectionsBase)
            ->selectRaw($this->periodGroupExpression('paid_date', $groupBy) . ' as period')
            ->selectRaw('SUM(amount) as cash_in')
            ->selectRaw('COUNT(*) as collection_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $outflowRows = (clone $disbursementsBase)
            ->selectRaw($this->periodGroupExpression('approved_at', $groupBy) . ' as period')
            ->selectRaw('SUM(COALESCE(approved_amount, 0)) as cash_out')
            ->selectRaw('COUNT(*) as disbursement_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $this->applyCashFlowInflowRows($periodMap, $inflowRows);
        $this->applyCashFlowOutflowRows($periodMap, $outflowRows);

        return $periodMap;
    }

    private function buildInstantLoanCashFlowPeriodMap(?int $branchId, array $validated, string $groupBy): array
    {
        if ($branchId === null) {
            return [];
        }

        $collectionsBase = LoanRequestCollection::query()
            ->join('loan_requests', 'loan_requests.id', '=', 'loan_request_collections.loan_request_id')
            ->where('loan_requests.branch_id', $branchId);

        $disbursementsBase = LoanRequest::query()
            ->where('loan_requests.branch_id', $branchId)
            ->whereIn('loan_requests.status', ['approved', 'closed']);

        if (!empty($validated['from_date'])) {
            $collectionsBase->whereDate('loan_request_collections.collection_date', '>=', $validated['from_date']);
            $disbursementsBase->whereRaw('DATE(COALESCE(loan_requests.last_action_at, loan_requests.created_at)) >= ?', [$validated['from_date']]);
        }

        if (!empty($validated['to_date'])) {
            $collectionsBase->whereDate('loan_request_collections.collection_date', '<=', $validated['to_date']);
            $disbursementsBase->whereRaw('DATE(COALESCE(loan_requests.last_action_at, loan_requests.created_at)) <= ?', [$validated['to_date']]);
        }

        $periodMap = [];

        $inflowRows = (clone $collectionsBase)
            ->selectRaw($this->periodGroupExpression('loan_request_collections.collection_date', $groupBy) . ' as period')
            ->selectRaw('SUM(loan_request_collections.collected_amount) as cash_in')
            ->selectRaw('COUNT(*) as collection_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $outflowRows = (clone $disbursementsBase)
            ->selectRaw($this->periodGroupExpression('COALESCE(loan_requests.last_action_at, loan_requests.created_at)', $groupBy) . ' as period')
            ->selectRaw('SUM(loan_requests.principal) as cash_out')
            ->selectRaw('COUNT(*) as disbursement_count')
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $this->applyCashFlowInflowRows($periodMap, $inflowRows);
        $this->applyCashFlowOutflowRows($periodMap, $outflowRows);

        return $periodMap;
    }

    private function buildCashFlowSourcePayload(string $key, string $label, array $periodMap): array
    {
        $periods = $this->finalizeCashFlowPeriodMap($periodMap);

        return [
            'key' => $key,
            'label' => $label,
            'summary' => $this->summarizeCashFlowPeriods($periods),
            'periods' => $periods,
        ];
    }

    public function cashFlowReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'product_type' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'max:50'],
            'group_by' => ['nullable', 'in:day,month'],
            'source' => ['nullable', 'in:all,finance,microfinance,mortgage,instant_loan'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $groupBy = (string) ($validated['group_by'] ?? 'month');
        $sourceFilter = strtolower(trim((string) ($validated['source'] ?? 'all')));

        $requestedCompanyId = (int) ($validated['company_id'] ?? $validated['branch_id'] ?? 0);
        $branchId = $requestedCompanyId > 0 ? $requestedCompanyId : $this->scopedBranchId($request);
        $company = $branchId ? Company::query()->find($branchId) : null;

        $includeFinance = $sourceFilter === 'all' || $sourceFilter === 'finance';
        $includeMicrofinance = $sourceFilter === 'all' || $sourceFilter === 'microfinance';
        $includeMortgage = $sourceFilter === 'all' || $sourceFilter === 'mortgage';
        $includeInstantLoan = $sourceFilter === 'all' || $sourceFilter === 'instant_loan';

        $financeMap = $includeFinance ? $this->buildFinanceCashFlowPeriodMap($branchId, $validated, $groupBy) : [];
        $microfinanceMap = $includeMicrofinance ? $this->buildMicrofinanceCashFlowPeriodMap($branchId, $validated, $groupBy) : [];
        $mortgageMap = $includeMortgage ? $this->buildMortgageCashFlowPeriodMap($branchId, $validated, $groupBy) : [];
        $instantLoanMap = $includeInstantLoan ? $this->buildInstantLoanCashFlowPeriodMap($branchId, $validated, $groupBy) : [];

        $combinedMap = $this->mergeCashFlowPeriodMaps($financeMap, $microfinanceMap, $mortgageMap, $instantLoanMap);
        $periods = $this->finalizeCashFlowPeriodMap($combinedMap);
        $summary = $this->summarizeCashFlowPeriods($periods);

        $sources = [];

        if ($includeFinance) {
            $sources['finance'] = $this->buildCashFlowSourcePayload('finance', 'Finance', $financeMap);
        }
        if ($includeMicrofinance) {
            $sources['microfinance'] = $this->buildCashFlowSourcePayload('microfinance', 'Micro Credit', $microfinanceMap);
        }
        if ($includeMortgage) {
            $sources['mortgage'] = $this->buildCashFlowSourcePayload('mortgage', 'Mortgage', $mortgageMap);
        }
        if ($includeInstantLoan) {
            $sources['instant_loan'] = $this->buildCashFlowSourcePayload('instant_loan', 'Instant Loan', $instantLoanMap);
        }

        return response()->json([
            'company' => $company ? [
                'id' => (int) $company->id,
                'name' => (string) $company->name,
                'currency' => $company->currency,
            ] : null,
            'summary' => $summary,
            'periods' => $periods,
            'sources' => $sources,
            'filters' => [
                'from_date' => $validated['from_date'] ?? null,
                'to_date' => $validated['to_date'] ?? null,
                'product_type' => $validated['product_type'] ?? null,
                'status' => $validated['status'] ?? null,
                'group_by' => $groupBy,
                'source' => $sourceFilter,
                'branch_id' => $branchId,
            ],
        ]);
    }

    public function generalLedgerSnapshot(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'product_type' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'max:50'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:companies,id'],
        ]);

        $fromDate = $validated['from_date'] ?? null;
        $toDate = $validated['to_date'] ?? null;

        $requestedCompanyId = (int) ($validated['company_id'] ?? $validated['branch_id'] ?? 0);
        $branchId = $requestedCompanyId > 0 ? $requestedCompanyId : $this->scopedBranchId($request);

        $company = $branchId ? Company::query()->find($branchId) : null;

        $collectionsBase = FinanceCollection::query()
            ->join('finances', 'finances.id', '=', 'finance_collections.finance_id');

        $financesBase = Finance::query();

        if ($branchId !== null) {
            $collectionsBase->where('finances.branch_id', $branchId);
            $financesBase->where('finances.branch_id', $branchId);
        }

        if (!empty($validated['product_type'])) {
            $productType = strtolower(trim((string) $validated['product_type']));
            $collectionsBase->whereRaw('LOWER(finances.product_type) = ?', [$productType]);
            $financesBase->whereRaw('LOWER(finances.product_type) = ?', [$productType]);
        }

        if (!empty($validated['status'])) {
            $status = strtolower(trim((string) $validated['status']));
            $collectionsBase->whereRaw('LOWER(finances.status) = ?', [$status]);
            $financesBase->whereRaw('LOWER(finances.status) = ?', [$status]);
        }

        $applyDateWindow = function ($query, string $dateColumn, string $windowType) use ($fromDate, $toDate) {
            if ($windowType === 'opening') {
                if (!empty($fromDate)) {
                    $query->whereDate($dateColumn, '<', $fromDate);
                } else {
                    $query->whereRaw('1 = 0');
                }

                return;
            }

            if (!empty($fromDate)) {
                $query->whereDate($dateColumn, '>=', $fromDate);
            }

            if (!empty($toDate)) {
                $query->whereDate($dateColumn, '<=', $toDate);
            }
        };

        $disbursementOpening = (float) ((clone $financesBase)->tap(fn ($q) => $applyDateWindow($q, 'finances.start_date', 'opening'))->sum('finances.financed_amount') ?: 0);
        $disbursementPeriod = (float) ((clone $financesBase)->tap(fn ($q) => $applyDateWindow($q, 'finances.start_date', 'period'))->sum('finances.financed_amount') ?: 0);

        $principalOpening = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'opening'))->sum('finance_collections.principal_paid') ?: 0);
        $principalPeriod = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'period'))->sum('finance_collections.principal_paid') ?: 0);

        $interestOpening = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'opening'))->sum('finance_collections.interest_paid') ?: 0);
        $interestPeriod = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'period'))->sum('finance_collections.interest_paid') ?: 0);

        $cashInOpening = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'opening'))->sum('finance_collections.payment_amount') ?: 0);
        $cashInPeriod = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'period'))->sum('finance_collections.payment_amount') ?: 0);

        $refundOpening = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'opening'))->sum('finance_collections.refund_amount') ?: 0);
        $refundPeriod = (float) ((clone $collectionsBase)->tap(fn ($q) => $applyDateWindow($q, 'finance_collections.payment_date', 'period'))->sum('finance_collections.refund_amount') ?: 0);

        $manualExpensesBase = AccountingExpense::query();
        $accountingRefundsBase = AccountingRefund::query();
        $walletDepositsBase = EmployeeWalletBankDeposit::query()->where('status', 'approved');
        $walletTransfersBase = EmployeeWalletCashHandover::query()
            ->where('status', 'approved')
            ->whereNotNull('branch_cash_transferred_at');

        if ($branchId !== null) {
            $manualExpensesBase->where('company_id', $branchId);
            $accountingRefundsBase->where('company_id', $branchId);
            $walletDepositsBase->where('branch_id', $branchId);
            $walletTransfersBase->where('branch_id', $branchId);
        }

        $manualExpenseOpeningTotal = (float) ((clone $manualExpensesBase)->tap(fn ($q) => $applyDateWindow($q, 'expense_date', 'opening'))->sum('amount') ?: 0);
        $manualExpensePeriodTotal = (float) ((clone $manualExpensesBase)->tap(fn ($q) => $applyDateWindow($q, 'expense_date', 'period'))->sum('amount') ?: 0);

        $accountingRefundOpeningTotal = (float) ((clone $accountingRefundsBase)->tap(fn ($q) => $applyDateWindow($q, 'refund_date', 'opening'))->sum('amount') ?: 0);
        $accountingRefundPeriodTotal = (float) ((clone $accountingRefundsBase)->tap(fn ($q) => $applyDateWindow($q, 'refund_date', 'period'))->sum('amount') ?: 0);

        $manualExpenseOpeningByMethod = (clone $manualExpensesBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'expense_date', 'opening'))
            ->selectRaw('payment_method, SUM(amount) as total_amount')
            ->groupBy('payment_method')
            ->pluck('total_amount', 'payment_method')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $manualExpensePeriodByMethod = (clone $manualExpensesBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'expense_date', 'period'))
            ->selectRaw('payment_method, SUM(amount) as total_amount')
            ->groupBy('payment_method')
            ->pluck('total_amount', 'payment_method')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $accountingRefundOpeningByMethod = (clone $accountingRefundsBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'refund_date', 'opening'))
            ->selectRaw('payment_method, SUM(amount) as total_amount')
            ->groupBy('payment_method')
            ->pluck('total_amount', 'payment_method')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $accountingRefundPeriodByMethod = (clone $accountingRefundsBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'refund_date', 'period'))
            ->selectRaw('payment_method, SUM(amount) as total_amount')
            ->groupBy('payment_method')
            ->pluck('total_amount', 'payment_method')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $walletDepositOpeningByAccount = (clone $walletDepositsBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'approved_at', 'opening'))
            ->selectRaw('bank_account_id, SUM(amount) as total_amount')
            ->whereNotNull('bank_account_id')
            ->groupBy('bank_account_id')
            ->pluck('total_amount', 'bank_account_id')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $walletDepositPeriodByAccount = (clone $walletDepositsBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'approved_at', 'period'))
            ->selectRaw('bank_account_id, SUM(amount) as total_amount')
            ->whereNotNull('bank_account_id')
            ->groupBy('bank_account_id')
            ->pluck('total_amount', 'bank_account_id')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $walletTransferOpeningByAccount = (clone $walletTransfersBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'branch_cash_transferred_at', 'opening'))
            ->selectRaw('cash_account_id, SUM(amount) as total_amount')
            ->whereNotNull('cash_account_id')
            ->groupBy('cash_account_id')
            ->pluck('total_amount', 'cash_account_id')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $walletTransferPeriodByAccount = (clone $walletTransfersBase)
            ->tap(fn ($q) => $applyDateWindow($q, 'branch_cash_transferred_at', 'period'))
            ->selectRaw('cash_account_id, SUM(amount) as total_amount')
            ->whereNotNull('cash_account_id')
            ->groupBy('cash_account_id')
            ->pluck('total_amount', 'cash_account_id')
            ->map(fn ($value) => round((float) $value, 2))
            ->all();

        $walletPostingOpeningTotal = round(
            array_sum(array_map('floatval', $walletDepositOpeningByAccount))
            + array_sum(array_map('floatval', $walletTransferOpeningByAccount)),
            2
        );
        $walletPostingPeriodTotal = round(
            array_sum(array_map('floatval', $walletDepositPeriodByAccount))
            + array_sum(array_map('floatval', $walletTransferPeriodByAccount)),
            2
        );

        $recalculateLine = static function (array $line): array {
            $openingDebit = round((float) ($line['opening_debit'] ?? 0), 2);
            $openingCredit = round((float) ($line['opening_credit'] ?? 0), 2);
            $periodDebit = round((float) ($line['period_debit'] ?? 0), 2);
            $periodCredit = round((float) ($line['period_credit'] ?? 0), 2);

            $openingBalance = round($openingDebit - $openingCredit, 2);
            $periodMovement = round($periodDebit - $periodCredit, 2);
            $closingBalance = round($openingBalance + $periodMovement, 2);

            return [
                'account_code' => (string) ($line['account_code'] ?? ''),
                'account_name' => (string) ($line['account_name'] ?? ''),
                'account_type' => $line['account_type'] ?? null,
                'source' => $line['source'] ?? null,
                'opening_debit' => $openingDebit,
                'opening_credit' => $openingCredit,
                'period_debit' => $periodDebit,
                'period_credit' => $periodCredit,
                'opening_balance' => $openingBalance,
                'period_movement' => $periodMovement,
                'closing_balance' => $closingBalance,
                'closing_side' => $closingBalance >= 0 ? 'debit' : 'credit',
                'closing_debit' => $closingBalance >= 0 ? abs($closingBalance) : 0.0,
                'closing_credit' => $closingBalance < 0 ? abs($closingBalance) : 0.0,
            ];
        };

        $mergeLine = static function (array $existing, array $incoming) use ($recalculateLine): array {
            return $recalculateLine([
                'account_code' => $existing['account_code'],
                'account_name' => $existing['account_name'] ?: $incoming['account_name'],
                'account_type' => $existing['account_type'] ?? $incoming['account_type'] ?? null,
                'source' => $existing['source'] === 'company_account' || ($incoming['source'] ?? null) === 'company_account'
                    ? 'company_account'
                    : ($existing['source'] ?? $incoming['source'] ?? 'finance'),
                'opening_debit' => ($existing['opening_debit'] ?? 0) + ($incoming['opening_debit'] ?? 0),
                'opening_credit' => ($existing['opening_credit'] ?? 0) + ($incoming['opening_credit'] ?? 0),
                'period_debit' => ($existing['period_debit'] ?? 0) + ($incoming['period_debit'] ?? 0),
                'period_credit' => ($existing['period_credit'] ?? 0) + ($incoming['period_credit'] ?? 0),
            ]);
        };

        $lineMap = [];

        $upsertLine = function (array $line) use (&$lineMap, $recalculateLine, $mergeLine): void {
            $normalized = $recalculateLine($line);
            $code = $normalized['account_code'];

            if ($code === '') {
                return;
            }

            if (isset($lineMap[$code])) {
                $lineMap[$code] = $mergeLine($lineMap[$code], $normalized);
                return;
            }

            $lineMap[$code] = $normalized;
        };

        if ($branchId) {
            $companyAccounts = CompanyAccount::query()
                ->where('company_id', $branchId)
                ->where('is_active', true)
                ->orderBy('account_type')
                ->orderBy('id')
                ->get();

            foreach ($companyAccounts as $account) {
                $code = trim((string) ($account->account_code ?: CompanyAccount::defaultAccountCode((string) $account->account_type)));
                $opening = round((float) ($account->opening_balance ?? 0), 2);
                $name = trim((string) $account->account_name);

                if ($account->account_type === CompanyAccount::TYPE_MAIN) {
                    $upsertLine([
                        'account_code' => $code,
                        'account_name' => $name,
                        'account_type' => $account->account_type,
                        'source' => 'company_account',
                        'opening_debit' => 0.0,
                        'opening_credit' => $opening,
                        'period_debit' => 0.0,
                        'period_credit' => 0.0,
                    ]);
                    continue;
                }

                $upsertLine([
                    'account_code' => $code,
                    'account_name' => $name,
                    'account_type' => $account->account_type,
                    'source' => 'company_account',
                    'opening_debit' => $opening,
                    'opening_credit' => 0.0,
                    'period_debit' => 0.0,
                    'period_credit' => 0.0,
                ]);
            }
        }

        $activeAccountsByType = [];
        if ($branchId) {
            $activeAccountsByType = CompanyAccount::query()
                ->where('company_id', $branchId)
                ->where('is_active', true)
                ->orderBy('id')
                ->get()
                ->groupBy('account_type');
        }

        $resolveAccountByMethod = static function (string $method) use ($activeAccountsByType): ?CompanyAccount {
            $normalized = strtolower(trim($method));
            $targetType = match ($normalized) {
                'cash' => CompanyAccount::TYPE_CASH,
                'bank' => CompanyAccount::TYPE_BANK,
                default => CompanyAccount::TYPE_MAIN,
            };

            $bucket = $activeAccountsByType[$targetType] ?? collect();
            /** @var CompanyAccount|null $account */
            $account = $bucket instanceof \Illuminate\Support\Collection ? $bucket->first() : null;
            return $account;
        };

        $financeLines = [
            [
                'account_code' => '1100',
                'account_name' => 'Cash Account (Collections)',
                'account_type' => 'cash',
                'source' => 'finance',
                'opening_debit' => $cashInOpening,
                'opening_credit' => $disbursementOpening + $refundOpening,
                'period_debit' => $cashInPeriod,
                'period_credit' => $disbursementPeriod + $refundPeriod,
            ],
            [
                'account_code' => '1150',
                'account_name' => 'Loan Receivable',
                'account_type' => 'receivable',
                'source' => 'finance',
                'opening_debit' => $disbursementOpening,
                'opening_credit' => $principalOpening,
                'period_debit' => $disbursementPeriod,
                'period_credit' => $principalPeriod,
            ],
            [
                'account_code' => '4100',
                'account_name' => 'Interest Income',
                'account_type' => 'income',
                'source' => 'finance',
                'opening_debit' => 0.0,
                'opening_credit' => $interestOpening,
                'period_debit' => 0.0,
                'period_credit' => $interestPeriod,
            ],
            [
                'account_code' => '5100',
                'account_name' => 'Refund Expense',
                'account_type' => 'expense',
                'source' => 'finance',
                'opening_debit' => $refundOpening,
                'opening_credit' => 0.0,
                'period_debit' => $refundPeriod,
                'period_credit' => 0.0,
            ],
        ];

        foreach ($financeLines as $financeLine) {
            $upsertLine($financeLine);
        }

        $upsertAccountCreditByMethod = function (
            array $openingByMethod,
            array $periodByMethod
        ) use ($upsertLine, $resolveAccountByMethod): void {
            foreach (['cash', 'bank', 'main'] as $method) {
                $openingAmount = round((float) ($openingByMethod[$method] ?? 0), 2);
                $periodAmount = round((float) ($periodByMethod[$method] ?? 0), 2);
                if ($openingAmount <= 0 && $periodAmount <= 0) {
                    continue;
                }

                $account = $resolveAccountByMethod($method);
                $accountCode = $account
                    ? trim((string) ($account->account_code ?: CompanyAccount::defaultAccountCode((string) $account->account_type)))
                    : CompanyAccount::defaultAccountCode(match ($method) {
                        'cash' => CompanyAccount::TYPE_CASH,
                        'bank' => CompanyAccount::TYPE_BANK,
                        default => CompanyAccount::TYPE_MAIN,
                    });
                $accountName = $account?->account_name ?: strtoupper($method) . ' Account';
                $accountType = $account?->account_type ?: match ($method) {
                    'cash' => CompanyAccount::TYPE_CASH,
                    'bank' => CompanyAccount::TYPE_BANK,
                    default => CompanyAccount::TYPE_MAIN,
                };

                $upsertLine([
                    'account_code' => $accountCode,
                    'account_name' => (string) $accountName,
                    'account_type' => $accountType,
                    'source' => 'accounting',
                    'opening_debit' => 0.0,
                    'opening_credit' => $openingAmount,
                    'period_debit' => 0.0,
                    'period_credit' => $periodAmount,
                ]);
            }
        };

        $upsertAccountCreditByMethod($manualExpenseOpeningByMethod, $manualExpensePeriodByMethod);
        $upsertAccountCreditByMethod($accountingRefundOpeningByMethod, $accountingRefundPeriodByMethod);

        if ($manualExpenseOpeningTotal > 0 || $manualExpensePeriodTotal > 0) {
            $upsertLine([
                'account_code' => '5200',
                'account_name' => 'Operating Expense',
                'account_type' => 'expense',
                'source' => 'accounting',
                'opening_debit' => $manualExpenseOpeningTotal,
                'opening_credit' => 0.0,
                'period_debit' => $manualExpensePeriodTotal,
                'period_credit' => 0.0,
            ]);
        }

        if ($accountingRefundOpeningTotal > 0 || $accountingRefundPeriodTotal > 0) {
            $upsertLine([
                'account_code' => '5100',
                'account_name' => 'Refund Expense',
                'account_type' => 'expense',
                'source' => 'accounting',
                'opening_debit' => $accountingRefundOpeningTotal,
                'opening_credit' => 0.0,
                'period_debit' => $accountingRefundPeriodTotal,
                'period_credit' => 0.0,
            ]);
        }

        $upsertWalletAccountDebits = function (array $openingByAccount, array $periodByAccount) use ($upsertLine): void {
            foreach (array_unique(array_merge(array_keys($openingByAccount), array_keys($periodByAccount))) as $accountId) {
                $id = (int) $accountId;
                if ($id <= 0) {
                    continue;
                }
                $openingAmount = round((float) ($openingByAccount[$accountId] ?? 0), 2);
                $periodAmount = round((float) ($periodByAccount[$accountId] ?? 0), 2);
                if ($openingAmount <= 0 && $periodAmount <= 0) {
                    continue;
                }

                $account = CompanyAccount::query()->find($id);
                if (!$account) {
                    continue;
                }

                $code = trim((string) ($account->account_code ?: CompanyAccount::defaultAccountCode((string) $account->account_type)));
                $upsertLine([
                    'account_code' => $code,
                    'account_name' => (string) $account->account_name,
                    'account_type' => (string) $account->account_type,
                    'source' => 'wallet',
                    'opening_debit' => $openingAmount,
                    'opening_credit' => 0.0,
                    'period_debit' => $periodAmount,
                    'period_credit' => 0.0,
                ]);
            }
        };

        $upsertWalletAccountDebits($walletDepositOpeningByAccount, $walletDepositPeriodByAccount);
        $upsertWalletAccountDebits($walletTransferOpeningByAccount, $walletTransferPeriodByAccount);

        if ($walletPostingOpeningTotal > 0 || $walletPostingPeriodTotal > 0) {
            $upsertLine([
                'account_code' => '2300',
                'account_name' => 'Collector Wallet Clearing',
                'account_type' => 'liability',
                'source' => 'wallet',
                'opening_debit' => 0.0,
                'opening_credit' => $walletPostingOpeningTotal,
                'period_debit' => 0.0,
                'period_credit' => $walletPostingPeriodTotal,
            ]);
        }

        $lines = array_values($lineMap);
        usort($lines, static fn (array $a, array $b) => strcmp((string) $a['account_code'], (string) $b['account_code']));

        $summary = [
            'opening_debits' => round((float) collect($lines)->sum('opening_debit'), 2),
            'opening_credits' => round((float) collect($lines)->sum('opening_credit'), 2),
            'period_debits' => round((float) collect($lines)->sum('period_debit'), 2),
            'period_credits' => round((float) collect($lines)->sum('period_credit'), 2),
            'closing_debits' => round((float) collect($lines)->sum('closing_debit'), 2),
            'closing_credits' => round((float) collect($lines)->sum('closing_credit'), 2),
            'net_period_movement' => round((float) collect($lines)->sum('period_movement'), 2),
            'accounts_count' => count($lines),
        ];

        return response()->json([
            'summary' => $summary,
            'lines' => $lines,
            'company' => $company ? [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency ?: 'LKR',
            ] : null,
            'filters' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'product_type' => $validated['product_type'] ?? null,
                'status' => $validated['status'] ?? null,
                'branch_id' => $branchId,
                'company_id' => $branchId,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_no' => ['nullable', 'string', 'max:60'],
            'finance_type' => ['required', 'string', 'max:100'],
            'product_type' => ['required', 'string', 'max:100'],
            'asset_reference' => ['nullable', 'string', 'max:190'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'down_payment' => ['nullable', 'numeric', 'min:0'],
            'interest_rate' => ['required', 'numeric', 'min:0'],
            'interest_type' => ['nullable', 'in:fixed,reducing'],
            'tenure_months' => ['required', 'integer', 'min:1'],
            'installment_frequency' => ['nullable', 'in:daily,weekly,monthly,quarterly,yearly'],
            'manual_installment_amount' => ['nullable', 'numeric', 'min:0.01'],
            'start_date' => ['nullable', 'date'],
            'status' => ['nullable', 'in:pending_approval,active'],
            'responsible_officer_employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'vehicle_details' => ['nullable', 'array'],
            'valuation_details' => ['nullable', 'array'],
            'guarantor_details' => ['nullable', 'array'],
            'family_financial_details' => ['nullable', 'array'],
            'evaluation_payload_version' => ['nullable', 'integer', 'min:1', 'max:10'],
            'evaluation_payload' => ['nullable', 'array'],
            'repayment_plan' => ['nullable', 'array'],
            'repayment_plan.installments' => ['nullable', 'array'],
            'repayment_plan.installments.*.installment_no' => ['nullable', 'integer', 'min:1'],
            'repayment_plan.installments.*.payment_date' => ['required_with:repayment_plan.installments', 'date'],
            'repayment_plan.installments.*.amount' => ['required_with:repayment_plan.installments', 'numeric', 'min:0.01'],
        ]);

        $customer = null;
        if (!empty($validated['customer_id'])) {
            $customer = Customer::findOrFail((int) $validated['customer_id']);
        } elseif (!empty($validated['customer_no'])) {
            $customer = $this->resolveCustomerFromReference((string) $validated['customer_no']);
            if (!$customer) {
                return response()->json([
                    'message' => 'Customer not found for provided Customer No.',
                ], 422);
            }
        }

        if (!$customer) {
            return response()->json([
                'message' => 'customer_id or customer_no is required.',
            ], 422);
        }

        $scopedBranchId = $this->scopedBranchId($request);
        if ($scopedBranchId !== null && (int) ($customer->branch_id ?? 0) !== $scopedBranchId) {
            return response()->json([
                'message' => 'You can create finance records only for customers in your branch.',
            ], 403);
        }

        $customerBranchId = (int) ($customer->branch_id ?? 0);
        $responsibleOfficerId = (int) ($validated['responsible_officer_employee_id'] ?? 0);
        if ($responsibleOfficerId > 0) {
            $officer = Employee::query()->find($responsibleOfficerId);
            if (!$officer) {
                return response()->json([
                    'message' => 'Selected responsible officer was not found.',
                ], 422);
            }

            if ($customerBranchId > 0 && (int) ($officer->branch_id ?? 0) !== $customerBranchId) {
                return response()->json([
                    'message' => 'Responsible officer must belong to the same branch as the customer.',
                ], 422);
            }
        }

        $downPayment = (float) ($validated['down_payment'] ?? 0);
        $assetAmount = (float) $validated['amount'];
        $financedAmount = max($assetAmount - $downPayment, 0);

        $annualRate = (float) $validated['interest_rate'] / 100;
        $tenureMonths = (int) $validated['tenure_months'];
        $frequency = (string) ($validated['installment_frequency'] ?? 'monthly');
        $interestType = (string) ($validated['interest_type'] ?? 'fixed');
        $repaymentPlan = is_array($validated['repayment_plan'] ?? null) ? $validated['repayment_plan'] : null;

        $installmentsPerYear = match (strtolower($frequency)) {
            'daily' => 365,
            'weekly' => 52,
            'quarterly' => 4,
            'yearly' => 1,
            default => 12,
        };

        $years = $tenureMonths / 12;
        $installmentCount = max(1, (int) round($years * $installmentsPerYear));

        if ($financedAmount <= 0 || $installmentCount <= 0) {
            return response()->json([
                'message' => 'Financed amount or tenure invalid for calculating installment.',
            ], 422);
        }

        // Simple vehicle finance model: fixed-rate by default, reducing if asked.
        $effectiveAnnualRate = $annualRate;
        $periodRate = $effectiveAnnualRate / $installmentsPerYear;

        if ($interestType === 'reducing' && $periodRate > 0) {
            $pow = pow(1 + $periodRate, $installmentCount);
            $installment = $financedAmount * $periodRate * $pow / ($pow - 1);
        } else {
            $totalInterest = $financedAmount * $annualRate * $years;
            $installment = ($financedAmount + $totalInterest) / $installmentCount;
        }

        $installmentAmount = round($installment, 2);
        if (isset($validated['manual_installment_amount']) && (float) $validated['manual_installment_amount'] > 0) {
            $installmentAmount = round((float) $validated['manual_installment_amount'], 2);
        }

        $planInstallments = $this->extractInstallmentPlanRows($repaymentPlan);
        if (!empty($planInstallments)) {
            $installmentAmount = round((float) ($planInstallments[0]['amount'] ?? $installmentAmount), 2);
            $repaymentPlan = [
                ...$repaymentPlan,
                'installments' => $planInstallments,
                'next_installment_index' => 0,
                'total_planned_amount' => round(array_sum(array_map(static fn ($row) => (float) $row['amount'], $planInstallments)), 2),
            ];
        }

        $isDraftLoan = self::isDraftLoanProductType((string) ($validated['product_type'] ?? ''));
        if ($isDraftLoan) {
            // Speed Draft uses monthly interest based on draft/financed amount.
            $installmentAmount = round($financedAmount * ($annualRate / 12), 2);
        }

        $effectiveFrequency = $isDraftLoan ? 'monthly' : ($validated['installment_frequency'] ?? 'monthly');

        $result = DB::transaction(function () use ($validated, $user, $customer, $financedAmount, $installmentAmount, $repaymentPlan, $isDraftLoan, $effectiveFrequency, $customerBranchId, $responsibleOfficerId) {
            $initialStatus = (string) ($validated['status'] ?? 'pending_approval');
            $branchManagerUserId = $this->resolveBranchManagerUserId($customerBranchId);

            $finance = Finance::create([
                'tenant_id' => 1,
                'branch_id' => $customer->branch_id ?? null,
                'customer_id' => $customer->id,
                'finance_type' => $validated['finance_type'],
                'product_type' => $validated['product_type'] ?? null,
                'asset_reference' => $validated['asset_reference'] ?? null,
                'vehicle_details' => $validated['vehicle_details'] ?? null,
                'valuation_details' => $validated['valuation_details'] ?? null,
                'guarantor_details' => $validated['guarantor_details'] ?? null,
                'family_financial_details' => $validated['family_financial_details'] ?? null,
                'evaluation_payload' => $validated['evaluation_payload'] ?? null,
                'evaluation_payload_version' => $validated['evaluation_payload_version'] ?? null,
                'repayment_plan' => $repaymentPlan,
                'amount' => $validated['amount'],
                'down_payment' => $validated['down_payment'] ?? 0,
                'financed_amount' => $financedAmount,
                'interest_rate' => $validated['interest_rate'],
                'interest_type' => $validated['interest_type'] ?? 'fixed',
                'tenure_months' => $validated['tenure_months'],
                'installment_frequency' => $effectiveFrequency,
                'installment_amount' => $installmentAmount,
                'status' => $initialStatus,
                'start_date' => $validated['start_date'] ?? now()->toDateString(),
                'branch_manager_user_id' => $branchManagerUserId,
                'responsible_officer_employee_id' => $responsibleOfficerId > 0 ? $responsibleOfficerId : null,
                'created_by' => $user?->id,
            ]);

            $draftLoanId = null;
            if ($isDraftLoan) {
                $monthlyInterestAmount = round(
                    ((float) $finance->financed_amount) * ((((float) $finance->interest_rate) / 12) / 100),
                    2,
                );

                $draftLoan = DraftLoan::create([
                    'finance_id' => $finance->id,
                    'tenant_id' => (int) $finance->tenant_id,
                    'branch_id' => $finance->branch_id,
                    'customer_id' => $finance->customer_id,
                    'customer_no' => $this->resolveCanonicalCustomerNo($customer),
                    'finance_type' => $finance->finance_type,
                    'product_type' => $finance->product_type,
                    'asset_reference' => $finance->asset_reference,
                    'vehicle_details' => $finance->vehicle_details,
                    'valuation_details' => $finance->valuation_details,
                    'guarantor_details' => $finance->guarantor_details,
                    'amount' => $finance->amount,
                    'interest_rate' => $finance->interest_rate,
                    'tenure_months' => $finance->tenure_months,
                    'installment_frequency' => $finance->installment_frequency,
                    'interest_amount' => max($monthlyInterestAmount, 0),
                    'status' => $finance->status,
                    'start_date' => $finance->start_date,
                    'due_date' => $finance->due_date,
                    'due_amount' => round((float) ($finance->due_amount ?? 0), 2),
                    'total_paid_amount' => round((float) ($finance->total_paid_amount ?? 0), 2),
                    'balance_amount' => round((float) ($finance->balance_amount ?? 0), 2),
                    'next_collection_date' => $finance->next_collection_date,
                    'created_by' => $finance->created_by,
                ]);

                $draftLoanId = $draftLoan->id;
            }

            return [
                'finance' => $finance,
                'draft_loan_id' => $draftLoanId,
            ];
        });

        /** @var \App\Models\Finance $finance */
        $finance = $result['finance'];
        $draftLoanId = $result['draft_loan_id'];

        return response()->json([
            'id' => $finance->id,
            'status' => $finance->status,
            'branch_manager_user_id' => $finance->branch_manager_user_id,
            'responsible_officer_employee_id' => $finance->responsible_officer_employee_id,
            'installment_amount' => $finance->installment_amount,
            'draft_loan_id' => $draftLoanId,
            'saved_table' => $draftLoanId ? 'draft_loans' : 'finances',
        ], 201);
    }

    private static function isDraftLoanProductType(string $productType): bool
    {
        $normalized = strtolower(trim(str_replace(['_', '-'], ' ', $productType)));
        $normalized = preg_replace('/\s+/', ' ', $normalized) ?? $normalized;

        return str_contains($normalized, 'draft');
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'in:approve,reject,activate'],
            'note' => ['nullable', 'string'],
            'deduction_order' => ['nullable', 'array'],
            'deduction_order.mode' => ['required_with:deduction_order', 'in:flat,front_loaded,installment_wise'],
            'deduction_order.profit_percentage' => ['required_with:deduction_order', 'numeric', 'min:0', 'max:100'],
            'deduction_order.capital_percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'deduction_order.initial_installments' => ['nullable', 'integer', 'min:0', 'max:600'],
            'deduction_order.initial_profit_percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'deduction_order.remaining_profit_percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'deduction_order.installment_rules' => ['nullable', 'array'],
            'deduction_order.installment_rules.*.installment_no' => ['required_with:deduction_order.installment_rules', 'integer', 'min:1'],
            'deduction_order.installment_rules.*.profit_percentage' => ['required_with:deduction_order.installment_rules', 'numeric', 'min:0', 'max:100'],
            'deduction_order.installment_rules.*.installment_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $finance = $this->resolveFinanceOrFail($request, $id);
        $action = (string) $validated['action'];
        $wasActive = $finance->status === 'active';

        if ($action === 'approve' || $action === 'activate') {
            $finance->status = 'active';

            if (!empty($validated['deduction_order']) && is_array($validated['deduction_order'])) {
                $deductionOrder = $validated['deduction_order'];
                $mode = (string) ($deductionOrder['mode'] ?? 'flat');
                $profitPercentage = round((float) ($deductionOrder['profit_percentage'] ?? 0), 2);
                $capitalPercentage = round(max(0, 100 - $profitPercentage), 2);

                $normalizedDeductionOrder = [
                    'mode' => $mode,
                    'profit_percentage' => $profitPercentage,
                    'capital_percentage' => $capitalPercentage,
                ];

                if ($mode === 'front_loaded') {
                    $initialProfit = round((float) ($deductionOrder['initial_profit_percentage'] ?? $profitPercentage), 2);
                    $remainingProfit = round((float) ($deductionOrder['remaining_profit_percentage'] ?? $profitPercentage), 2);

                    $normalizedDeductionOrder['initial_installments'] = (int) ($deductionOrder['initial_installments'] ?? 0);
                    $normalizedDeductionOrder['initial_profit_percentage'] = $initialProfit;
                    $normalizedDeductionOrder['initial_capital_percentage'] = round(max(0, 100 - $initialProfit), 2);
                    $normalizedDeductionOrder['remaining_profit_percentage'] = $remainingProfit;
                    $normalizedDeductionOrder['remaining_capital_percentage'] = round(max(0, 100 - $remainingProfit), 2);
                } elseif ($mode === 'installment_wise') {
                    $rules = is_array($deductionOrder['installment_rules'] ?? null)
                        ? $deductionOrder['installment_rules']
                        : [];

                    $normalizedRules = [];
                    foreach ($rules as $rule) {
                        if (!is_array($rule)) {
                            continue;
                        }

                        $ruleInstallmentNo = (int) ($rule['installment_no'] ?? 0);
                        $ruleProfit = round((float) ($rule['profit_percentage'] ?? $profitPercentage), 2);
                        $ruleCapital = round(max(0, 100 - $ruleProfit), 2);

                        if ($ruleInstallmentNo <= 0) {
                            continue;
                        }

                        $normalizedRule = [
                            'installment_no' => $ruleInstallmentNo,
                            'profit_percentage' => $ruleProfit,
                            'capital_percentage' => $ruleCapital,
                        ];

                        if (isset($rule['installment_amount']) && is_numeric($rule['installment_amount'])) {
                            $normalizedRule['installment_amount'] = round((float) $rule['installment_amount'], 2);
                            $normalizedRule['profit_amount'] = round(((float) $normalizedRule['installment_amount']) * ($ruleProfit / 100), 2);
                            $normalizedRule['capital_amount'] = round(((float) $normalizedRule['installment_amount']) * ($ruleCapital / 100), 2);
                        }

                        $normalizedRules[] = $normalizedRule;
                    }

                    usort($normalizedRules, static fn ($a, $b) => $a['installment_no'] <=> $b['installment_no']);
                    $normalizedDeductionOrder['installment_rules'] = $normalizedRules;
                }

                $repaymentPlan = is_array($finance->repayment_plan) ? $finance->repayment_plan : [];
                $repaymentPlan['deduction_order'] = $normalizedDeductionOrder;
                $finance->repayment_plan = $repaymentPlan;
            }

            if (!$wasActive) {
                $this->initializeApprovalTrackingFields($finance);
            }
        } elseif ($action === 'reject') {
            $finance->status = 'rejected';
        }

        $finance->save();

        return response()->json([
            'id' => $finance->id,
            'status' => $finance->status,
        ]);
    }

    private function initializeApprovalTrackingFields(Finance $finance): void
    {
        $isSpeedDraft = self::isDraftLoanProductType((string) ($finance->product_type ?? ''));
        $planRows = $this->extractInstallmentPlanRows($finance->repayment_plan);
        $planFirst = $planRows[0] ?? null;

        $startDate = $finance->start_date
            ? Carbon::parse($finance->start_date)
            : Carbon::today();

        $dueDate = $planFirst && !empty($planFirst['payment_date'])
            ? Carbon::parse((string) $planFirst['payment_date'])
            : $this->computeNextDueDate($startDate, $isSpeedDraft ? 'monthly' : (string) $finance->installment_frequency);
        $financeEndDate = (clone $startDate)->addMonthsNoOverflow((int) $finance->tenure_months);

        $annualRate = ((float) $finance->interest_rate) / 100;
        $installmentsPerYear = $isSpeedDraft
            ? 12
            : match (strtolower((string) $finance->installment_frequency)) {
                'daily' => 365,
                'weekly' => 52,
                'quarterly' => 4,
                'yearly' => 1,
                default => 12,
            };

        $periodRate = $installmentsPerYear > 0 ? $annualRate / $installmentsPerYear : 0.0;
        $dueInterestAmount = round(((float) $finance->financed_amount) * $periodRate, 2);
        $dueCapitalAmount = $isSpeedDraft ? 0.0 : $this->computeDueCapitalAmount($finance);

        $totalPayable = $this->computeTotalPayableAmount($finance);
        $isLease = strtolower((string) ($finance->product_type ?? '')) === 'lease';
        $openingOutstanding = $isLease ? $totalPayable : round((float) $finance->financed_amount, 2);

        $dueInstallmentAmount = $isSpeedDraft
            ? $dueInterestAmount
            : ($planFirst
                ? round((float) ($planFirst['amount'] ?? $finance->installment_amount), 2)
                : round((float) $finance->installment_amount, 2));

        $repaymentPlan = is_array($finance->repayment_plan) ? $finance->repayment_plan : [];
        if (!empty($planRows)) {
            $repaymentPlan['next_installment_index'] = 0;
            $repaymentPlan['total_planned_amount'] = round(array_sum(array_map(static fn ($row) => (float) $row['amount'], $planRows)), 2);
        }

        $finance->forceFill([
            'refund_amount' => $openingOutstanding,
            'total_paid_amount' => 0.00,
            'balance_amount' => $openingOutstanding,
            'due_date' => $dueDate->toDateString(),
            'due_amount' => $dueInstallmentAmount,
            'due_capital_amount' => $dueCapitalAmount,
            'due_interest_amount' => $dueInterestAmount,
            'arrears' => 0.00,
            'penalty' => 0.00,
            'next_collection_date' => $dueDate->toDateString(),
            'finance_end_date' => $financeEndDate->toDateString(),
            'repayment_plan' => !empty($repaymentPlan) ? $repaymentPlan : null,
        ]);
    }

    private function computeNextDueDate(Carbon $baseDate, string $frequency): Carbon
    {
        return match (strtolower($frequency)) {
            'daily' => (clone $baseDate)->addDay(),
            'weekly' => (clone $baseDate)->addWeek(),
            'quarterly' => (clone $baseDate)->addMonthsNoOverflow(3),
            'yearly' => (clone $baseDate)->addYear(),
            default => (clone $baseDate)->addMonthNoOverflow(),
        };
    }

    private function computeInstallmentCount(Finance $finance): int
    {
        $installmentsPerYear = match (strtolower((string) $finance->installment_frequency)) {
            'daily' => 365,
            'weekly' => 52,
            'quarterly' => 4,
            'yearly' => 1,
            default => 12,
        };

        $years = ((int) $finance->tenure_months) / 12;
        return max(1, (int) round($years * $installmentsPerYear));
    }

    private function computeTotalPayableAmount(Finance $finance): float
    {
        $planRows = $this->extractInstallmentPlanRows($finance->repayment_plan);
        if (!empty($planRows)) {
            return round(array_sum(array_map(static fn ($row) => (float) $row['amount'], $planRows)), 2);
        }

        $count = $this->computeInstallmentCount($finance);
        return round((float) $finance->installment_amount * $count, 2);
    }

    /**
     * @param mixed $repaymentPlan
     * @return array<int, array{installment_no:int,payment_date:string,amount:float}>
     */
    private function extractInstallmentPlanRows(mixed $repaymentPlan): array
    {
        if (!is_array($repaymentPlan)) {
            return [];
        }

        $rows = Arr::get($repaymentPlan, 'installments', []);
        if (!is_array($rows)) {
            return [];
        }

        $normalized = [];
        foreach ($rows as $index => $row) {
            if (!is_array($row)) {
                continue;
            }

            $amount = (float) ($row['amount'] ?? 0);
            $paymentDate = (string) ($row['payment_date'] ?? '');
            if ($amount <= 0 || $paymentDate === '') {
                continue;
            }

            $normalized[] = [
                'installment_no' => (int) ($row['installment_no'] ?? ($index + 1)),
                'payment_date' => Carbon::parse($paymentDate)->toDateString(),
                'amount' => round($amount, 2),
            ];
        }

        usort($normalized, static fn ($a, $b) => ($a['installment_no'] <=> $b['installment_no']));
        return $normalized;
    }

    private function computeDueCapitalAmount(Finance $finance): float
    {
        $tenureMonths = (int) $finance->tenure_months;
        if ($tenureMonths <= 0) {
            return 0.0;
        }

        return round(((float) $finance->financed_amount) / $tenureMonths, 2);
    }

    public function collections(Request $request, int $id): JsonResponse
    {
        $finance = $this->resolveFinanceOrFail($request, $id);

        $collections = FinanceCollection::where('finance_id', $finance->id)
            ->orderByDesc('payment_date')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => $collections,
        ]);
    }

    public function storeCollection(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_date' => ['required', 'date'],
            'payment_amount' => ['required', 'numeric', 'min:0'],
            'pay_type' => ['nullable', 'in:cash,bank_transfer,cheque,card,online'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'cheque_no' => ['nullable', 'required_if:pay_type,cheque', 'string', 'max:100'],
            'cheque_date' => ['nullable', 'required_if:pay_type,cheque', 'date'],
            'cheque_bank' => ['nullable', 'required_if:pay_type,cheque', 'string', 'max:120'],
        ]);

        $finance = $this->resolveFinanceOrFail($request, $id);
        $user = $request->user();

        $latest = FinanceCollection::where('finance_id', $finance->id)
            ->orderByDesc('payment_date')
            ->orderByDesc('id')
            ->first();

        $isSpeedDraft = self::isDraftLoanProductType((string) ($finance->product_type ?? ''));
        $currentCapital = $latest ? (float) $latest->remaining_capital : (float) $finance->financed_amount;
        $currentArrears = $latest ? (float) $latest->arrears : 0.0;
        $paymentAmount = (float) $validated['payment_amount'];
        $paymentDate = Carbon::parse((string) $validated['payment_date']);
        $installmentsPerYear = $isSpeedDraft
            ? 12
            : match (strtolower((string) $finance->installment_frequency)) {
                'daily' => 365,
                'weekly' => 52,
                'quarterly' => 4,
                'yearly' => 1,
                default => 12,
            };
        $periodRatePercent = $installmentsPerYear > 0
            ? ((float) $finance->interest_rate) / $installmentsPerYear
            : (float) $finance->interest_rate;

        $paidInterestInPeriod = 0.0;
        if ($isSpeedDraft) {
            $periodStart = (clone $paymentDate)->startOfMonth()->toDateString();
            $periodEnd = (clone $paymentDate)->endOfMonth()->toDateString();

            $paidInterestInPeriod = round((float) FinanceCollection::query()
                ->where('finance_id', $finance->id)
                ->whereBetween('payment_date', [$periodStart, $periodEnd])
                ->sum('interest_paid'), 2);
        }

        $calculation = $isSpeedDraft
            ? $this->speedDraftCalculator->calculateSpeedDraftMonthlyPaymentWithHistory(
                $currentCapital,
                $periodRatePercent,
                $paymentAmount,
                $paidInterestInPeriod,
            )
            : $this->speedDraftCalculator->calculateMonthlyPayment(
                $currentCapital,
                $periodRatePercent,
                $paymentAmount,
                $currentArrears,
            );

        $isLease = strtolower((string) ($finance->product_type ?? '')) === 'lease';
        $openingOutstanding = (float) $finance->balance_amount;
        if ($openingOutstanding <= 0) {
            $openingOutstanding = $isLease
                ? $this->computeTotalPayableAmount($finance)
                : round((float) $finance->financed_amount, 2);
        }

        $paidTowardOutstanding = round(min($paymentAmount, $openingOutstanding), 2);
        $txnOverPayment = round(max($paymentAmount - $paidTowardOutstanding, 0), 2);
        $newTotalPaid = round((float) $finance->total_paid_amount + $paidTowardOutstanding, 2);
        $newBalance = $isSpeedDraft
            ? round((float) $calculation['new_capital'], 2)
            : round(max($openingOutstanding - $paidTowardOutstanding, 0), 2);
        $newRefundTotal = $newBalance;

        $nextDueDate = $isSpeedDraft
            ? $this->computeNextDueDate($paymentDate, 'monthly')
            : $this->computeNextDueDate($paymentDate, (string) $finance->installment_frequency);
        $periodRateDecimal = $periodRatePercent / 100;
        $nextDueInterest = round(((float) $calculation['new_capital']) * $periodRateDecimal, 2);
        $dueCapitalAmount = $isSpeedDraft ? 0.0 : $this->computeDueCapitalAmount($finance);

        $planRows = $this->extractInstallmentPlanRows($finance->repayment_plan);
        $planState = is_array($finance->repayment_plan) ? $finance->repayment_plan : [];
        $currentInstallmentIndex = max(0, (int) ($planState['next_installment_index'] ?? 0));
        $currentPlanRow = $planRows[$currentInstallmentIndex] ?? null;
        $currentDueAmount = $currentPlanRow
            ? round((float) ($currentPlanRow['amount'] ?? $finance->installment_amount), 2)
            : round((float) $finance->due_amount > 0 ? (float) $finance->due_amount : (float) $finance->installment_amount, 2);
        $graceDays = max(0, (int) ($planState['grace_period_days'] ?? 0));
        $currentDueDate = $currentPlanRow && !empty($currentPlanRow['payment_date'])
            ? Carbon::parse((string) $currentPlanRow['payment_date'])
            : ($finance->due_date ? Carbon::parse((string) $finance->due_date) : $paymentDate);
        $graceEndDate = (clone $currentDueDate)->addDays($graceDays);
        $isPastGrace = $paymentDate->gt($graceEndDate);
        $uncoveredDue = round(max($currentDueAmount - $paymentAmount, 0), 2);
        $scheduleArrears = ($isSpeedDraft || !$isPastGrace) ? 0.0 : $uncoveredDue;
        $finalArrears = $isSpeedDraft
            ? round((float) $calculation['new_arrears'], 2)
            : round(max((float) $calculation['new_arrears'], $scheduleArrears), 2);

        $advanceInstallment = $paymentAmount + 0.0001 >= $currentDueAmount;
        $updatedInstallmentIndex = $currentInstallmentIndex;
        $nextPlanRow = null;
        if (!$isSpeedDraft && !empty($planRows)) {
            $updatedInstallmentIndex = $currentInstallmentIndex + ($advanceInstallment ? 1 : 0);
            $nextPlanRow = $planRows[$updatedInstallmentIndex] ?? null;
        }

        $collection = DB::transaction(function () use ($finance, $validated, $paymentAmount, $txnOverPayment, $calculation, $currentCapital, $currentArrears, $user, $newTotalPaid, $newBalance, $newRefundTotal, $nextDueDate, $nextDueInterest, $dueCapitalAmount, $periodRatePercent, $planState, $planRows, $updatedInstallmentIndex, $nextPlanRow, $currentPlanRow, $currentDueAmount, $finalArrears, $isSpeedDraft, $paidInterestInPeriod) {
            /** @var \App\Models\FinanceCollection $created */
            $created = FinanceCollection::create([
                'finance_id' => $finance->id,
                'branch_id' => $finance->branch_id ?? $user?->branch_id,
                'collector_id' => $user?->id,
                'payment_date' => $validated['payment_date'],
                'payment_amount' => round($paymentAmount, 2),
                'refund_amount' => $txnOverPayment,
                'pay_type' => (string) ($validated['pay_type'] ?? 'cash'),
                'reference_no' => $validated['reference_no'] ?? null,
                'cheque_no' => $validated['cheque_no'] ?? null,
                'cheque_date' => $validated['cheque_date'] ?? null,
                'cheque_bank' => $validated['cheque_bank'] ?? null,
                'interest_charged' => $calculation['interest'],
                'interest_paid' => $calculation['interest_paid'],
                'principal_paid' => $calculation['principal_paid'],
                'arrears' => $finalArrears,
                'remaining_capital' => $calculation['new_capital'],
                'meta' => [
                    'model' => $isSpeedDraft ? 'speed_draft_interest_first' : 'standard_interest_first',
                    'opening_capital' => round($currentCapital, 2),
                    'opening_arrears' => round($currentArrears, 2),
                    'interest_rate_period' => round($periodRatePercent, 4),
                    'interest_paid_in_period_before' => round($paidInterestInPeriod, 2),
                    'due_amount' => $currentDueAmount,
                ],
                'created_by' => $user?->id,
            ]);

            $plan = $planState;
            if (!$isSpeedDraft && !empty($planRows)) {
                $plan['next_installment_index'] = $updatedInstallmentIndex;
            }

            if ($calculation['new_capital'] <= 0.0 && $calculation['new_arrears'] <= 0.0) {
                $finance->forceFill([
                    'status' => 'settled',
                    'refund_amount' => $newRefundTotal,
                    'total_paid_amount' => $newTotalPaid,
                    'balance_amount' => 0.00,
                    'installment_amount' => $isSpeedDraft ? 0.00 : $finance->installment_amount,
                    'due_amount' => 0.00,
                    'due_capital_amount' => 0.00,
                    'due_interest_amount' => 0.00,
                    'arrears' => 0.00,
                    'due_date' => null,
                    'next_collection_date' => null,
                    'repayment_plan' => !empty($plan) ? $plan : null,
                ]);
            } else {
                $finance->forceFill([
                    'refund_amount' => $newRefundTotal,
                    'total_paid_amount' => $newTotalPaid,
                    'balance_amount' => $newBalance,
                    'installment_amount' => $isSpeedDraft ? $nextDueInterest : $finance->installment_amount,
                    'due_amount' => $isSpeedDraft
                        ? $nextDueInterest
                        : ($nextPlanRow
                            ? round((float) ($nextPlanRow['amount'] ?? $finance->installment_amount), 2)
                            : ($currentPlanRow
                                ? round((float) ($currentPlanRow['amount'] ?? $finance->installment_amount), 2)
                                : round((float) $finance->installment_amount, 2))),
                    'due_capital_amount' => $dueCapitalAmount,
                    'due_interest_amount' => $nextDueInterest,
                    'arrears' => $finalArrears,
                    'due_date' => $isSpeedDraft
                        ? $nextDueDate->toDateString()
                        : ($nextPlanRow
                            ? Carbon::parse((string) $nextPlanRow['payment_date'])->toDateString()
                            : ($currentPlanRow
                                ? Carbon::parse((string) $currentPlanRow['payment_date'])->toDateString()
                                : $nextDueDate->toDateString())),
                    'next_collection_date' => $isSpeedDraft
                        ? $nextDueDate->toDateString()
                        : ($nextPlanRow
                            ? Carbon::parse((string) $nextPlanRow['payment_date'])->toDateString()
                            : ($currentPlanRow
                                ? Carbon::parse((string) $currentPlanRow['payment_date'])->toDateString()
                                : $nextDueDate->toDateString())),
                    'repayment_plan' => !empty($plan) ? $plan : null,
                ]);
            }

            $finance->save();

            if ($isSpeedDraft) {
                $draftLoan = DraftLoan::where('finance_id', $finance->id)->first();
                if ($draftLoan) {
                    $draftLoan->forceFill([
                        'status' => $finance->status,
                        'interest_amount' => round((float) ($finance->due_interest_amount ?? 0), 2),
                        'due_amount' => round((float) ($finance->due_amount ?? 0), 2),
                        'total_paid_amount' => round((float) ($finance->total_paid_amount ?? 0), 2),
                        'balance_amount' => round((float) ($finance->balance_amount ?? 0), 2),
                        'due_date' => $finance->due_date,
                        'next_collection_date' => $finance->next_collection_date,
                    ]);
                    $draftLoan->save();
                }
            }

            return $created;
        });

        $finance->loadMissing('customer:id,first_name,last_name,phone');
        $customerPhone = trim((string) optional($finance->customer)->phone);
        if ($customerPhone !== '') {
            /** @var SmsGatewayService $smsService */
            $smsService = app(SmsGatewayService::class);
            $customerName = trim(
                ((string) optional($finance->customer)->first_name) . ' ' .
                ((string) optional($finance->customer)->last_name)
            ) ?: 'Customer';
            $messageContext = [
                'customer_name' => $customerName,
                'amount' => number_format((float) $paymentAmount, 2, '.', ''),
                'date' => (string) $validated['payment_date'],
                'reference' => (string) ($finance->id ?? 'FIN'),
                'module' => 'Finance',
            ];
            $smsMessage = $smsService->buildCollectionMessage($messageContext);
            $smsService->send($customerPhone, $smsMessage);

            /** @var WhatsappGatewayService $whatsappService */
            $whatsappService = app(WhatsappGatewayService::class);
            $whatsappMessage = $whatsappService->buildCollectionMessage($messageContext);
            $whatsappService->send($customerPhone, $whatsappMessage);
        }

        return response()->json([
            'message' => 'Collection posted successfully',
            'collection' => $collection,
            'calculation' => [
                'interest' => $calculation['interest'],
                'interest_paid' => $calculation['interest_paid'],
                'principal_paid' => $calculation['principal_paid'],
                'profit_collected' => $calculation['interest_paid'],
                'capital_collected' => $calculation['principal_paid'],
                'new_capital' => $calculation['new_capital'],
                'new_arrears' => $finalArrears,
                'refund_amount' => $txnOverPayment,
                'total_paid_amount' => $newTotalPaid,
                'balance_amount' => $newBalance,
            ],
        ], 201);
    }

    public function destroyCollection(Request $request, int $id, int $collectionId): JsonResponse
    {
        $finance = $this->resolveFinanceOrFail($request, $id);

        $collection = FinanceCollection::query()
            ->where('finance_id', $finance->id)
            ->whereKey($collectionId)
            ->first();

        if (!$collection) {
            return response()->json([
                'message' => 'Collection payment not found for this finance record.',
            ], 404);
        }

        DB::transaction(function () use ($finance, $collection): void {
            $collection->delete();

            /** @var Finance $lockedFinance */
            $lockedFinance = Finance::query()->whereKey($finance->id)->lockForUpdate()->firstOrFail();
            $this->recalculateFinanceCollectionsState($lockedFinance);
        });

        return response()->json([
            'message' => 'Collection payment deleted and loan values recovered successfully.',
        ]);
    }

    private function recalculateFinanceCollectionsState(Finance $finance): void
    {
        $isSpeedDraft = self::isDraftLoanProductType((string) ($finance->product_type ?? ''));

        $existingPlan = is_array($finance->repayment_plan) ? $finance->repayment_plan : [];
        $planRows = $this->extractInstallmentPlanRows($existingPlan);

        $this->initializeApprovalTrackingFields($finance);

        if (!empty($planRows)) {
            $resetPlan = is_array($finance->repayment_plan) ? $finance->repayment_plan : [];
            $resetPlan['next_installment_index'] = 0;
            $resetPlan['installments'] = $planRows;
            $resetPlan['total_planned_amount'] = round(array_sum(array_map(static fn ($row) => (float) $row['amount'], $planRows)), 2);
            $finance->repayment_plan = $resetPlan;
        }

        if (!in_array((string) $finance->status, ['pending_approval', 'rejected'], true)) {
            $finance->status = 'active';
        }

        $finance->save();

        $collections = FinanceCollection::query()
            ->where('finance_id', $finance->id)
            ->orderBy('payment_date')
            ->orderBy('id')
            ->get();

        if ($collections->isEmpty()) {
            $this->syncDraftLoanFromFinance($finance);
            return;
        }

        $installmentsPerYear = $isSpeedDraft
            ? 12
            : match (strtolower((string) $finance->installment_frequency)) {
                'daily' => 365,
                'weekly' => 52,
                'quarterly' => 4,
                'yearly' => 1,
                default => 12,
            };
        $periodRatePercent = $installmentsPerYear > 0
            ? ((float) $finance->interest_rate) / $installmentsPerYear
            : (float) $finance->interest_rate;
        $periodRateDecimal = $periodRatePercent / 100;

        $planState = is_array($finance->repayment_plan) ? $finance->repayment_plan : [];
        $currentInstallmentIndex = 0;
        $openingOutstanding = (float) $finance->balance_amount;
        $runningTotalPaid = 0.0;
        $runningBalance = (float) $finance->balance_amount;
        $runningArrears = 0.0;
        $runningCapital = (float) $finance->financed_amount;

        $speedDraftInterestPaidByPeriod = [];

        foreach ($collections as $entry) {
            $paymentAmount = round((float) $entry->payment_amount, 2);
            $paymentDate = Carbon::parse((string) $entry->payment_date);
            $paidInterestInPeriod = 0.0;

            if ($isSpeedDraft) {
                $periodKey = $paymentDate->format('Y-m');
                $paidInterestInPeriod = round((float) ($speedDraftInterestPaidByPeriod[$periodKey] ?? 0), 2);
            }

            $calculation = $isSpeedDraft
                ? $this->speedDraftCalculator->calculateSpeedDraftMonthlyPaymentWithHistory(
                    $runningCapital,
                    $periodRatePercent,
                    $paymentAmount,
                    $paidInterestInPeriod,
                )
                : $this->speedDraftCalculator->calculateMonthlyPayment(
                    $runningCapital,
                    $periodRatePercent,
                    $paymentAmount,
                    $runningArrears,
                );

            $paidTowardOutstanding = round(min($paymentAmount, $openingOutstanding), 2);
            $txnOverPayment = round(max($paymentAmount - $paidTowardOutstanding, 0), 2);
            $newTotalPaid = round($runningTotalPaid + $paidTowardOutstanding, 2);
            $newBalance = $isSpeedDraft
                ? round((float) $calculation['new_capital'], 2)
                : round(max($openingOutstanding - $paidTowardOutstanding, 0), 2);
            $nextDueDate = $isSpeedDraft
                ? $this->computeNextDueDate($paymentDate, 'monthly')
                : $this->computeNextDueDate($paymentDate, (string) $finance->installment_frequency);
            $nextDueInterest = round(((float) $calculation['new_capital']) * $periodRateDecimal, 2);
            $dueCapitalAmount = $isSpeedDraft ? 0.0 : $this->computeDueCapitalAmount($finance);

            $currentPlanRow = $planRows[$currentInstallmentIndex] ?? null;
            $currentDueAmount = $currentPlanRow
                ? round((float) ($currentPlanRow['amount'] ?? $finance->installment_amount), 2)
                : round((float) $finance->due_amount > 0 ? (float) $finance->due_amount : (float) $finance->installment_amount, 2);

            $graceDays = max(0, (int) ($planState['grace_period_days'] ?? 0));
            $currentDueDate = $currentPlanRow && !empty($currentPlanRow['payment_date'])
                ? Carbon::parse((string) $currentPlanRow['payment_date'])
                : ($finance->due_date ? Carbon::parse((string) $finance->due_date) : $paymentDate);
            $graceEndDate = (clone $currentDueDate)->addDays($graceDays);
            $isPastGrace = $paymentDate->gt($graceEndDate);
            $uncoveredDue = round(max($currentDueAmount - $paymentAmount, 0), 2);
            $scheduleArrears = ($isSpeedDraft || !$isPastGrace) ? 0.0 : $uncoveredDue;
            $finalArrears = $isSpeedDraft
                ? round((float) $calculation['new_arrears'], 2)
                : round(max((float) $calculation['new_arrears'], $scheduleArrears), 2);

            $advanceInstallment = $paymentAmount + 0.0001 >= $currentDueAmount;
            $updatedInstallmentIndex = $currentInstallmentIndex;
            $nextPlanRow = null;
            if (!$isSpeedDraft && !empty($planRows)) {
                $updatedInstallmentIndex = $currentInstallmentIndex + ($advanceInstallment ? 1 : 0);
                $nextPlanRow = $planRows[$updatedInstallmentIndex] ?? null;
                $planState['next_installment_index'] = $updatedInstallmentIndex;
            }

            $entry->forceFill([
                'refund_amount' => $txnOverPayment,
                'interest_charged' => round((float) $calculation['interest'], 2),
                'interest_paid' => round((float) $calculation['interest_paid'], 2),
                'principal_paid' => round((float) $calculation['principal_paid'], 2),
                'arrears' => $finalArrears,
                'remaining_capital' => round((float) $calculation['new_capital'], 2),
                'meta' => [
                    'model' => $isSpeedDraft ? 'speed_draft_interest_first' : 'standard_interest_first',
                    'opening_capital' => round($runningCapital, 2),
                    'opening_arrears' => round($runningArrears, 2),
                    'interest_rate_period' => round($periodRatePercent, 4),
                    'interest_paid_in_period_before' => round($paidInterestInPeriod, 2),
                    'due_amount' => $currentDueAmount,
                ],
            ]);
            $entry->save();

            if ($calculation['new_capital'] <= 0.0 && $calculation['new_arrears'] <= 0.0) {
                $finance->forceFill([
                    'status' => 'settled',
                    'refund_amount' => $newBalance,
                    'total_paid_amount' => $newTotalPaid,
                    'balance_amount' => 0.00,
                    'installment_amount' => $isSpeedDraft ? 0.00 : $finance->installment_amount,
                    'due_amount' => 0.00,
                    'due_capital_amount' => 0.00,
                    'due_interest_amount' => 0.00,
                    'arrears' => 0.00,
                    'due_date' => null,
                    'next_collection_date' => null,
                    'repayment_plan' => !empty($planState) ? $planState : null,
                ]);
            } else {
                $finance->forceFill([
                    'status' => in_array((string) $finance->status, ['pending_approval', 'rejected'], true)
                        ? $finance->status
                        : 'active',
                    'refund_amount' => $newBalance,
                    'total_paid_amount' => $newTotalPaid,
                    'balance_amount' => $newBalance,
                    'installment_amount' => $isSpeedDraft ? $nextDueInterest : $finance->installment_amount,
                    'due_amount' => $isSpeedDraft
                        ? $nextDueInterest
                        : ($nextPlanRow
                            ? round((float) ($nextPlanRow['amount'] ?? $finance->installment_amount), 2)
                            : ($currentPlanRow
                                ? round((float) ($currentPlanRow['amount'] ?? $finance->installment_amount), 2)
                                : round((float) $finance->installment_amount, 2))),
                    'due_capital_amount' => $dueCapitalAmount,
                    'due_interest_amount' => $nextDueInterest,
                    'arrears' => $finalArrears,
                    'due_date' => $isSpeedDraft
                        ? $nextDueDate->toDateString()
                        : ($nextPlanRow
                            ? Carbon::parse((string) $nextPlanRow['payment_date'])->toDateString()
                            : ($currentPlanRow
                                ? Carbon::parse((string) $currentPlanRow['payment_date'])->toDateString()
                                : $nextDueDate->toDateString())),
                    'next_collection_date' => $isSpeedDraft
                        ? $nextDueDate->toDateString()
                        : ($nextPlanRow
                            ? Carbon::parse((string) $nextPlanRow['payment_date'])->toDateString()
                            : ($currentPlanRow
                                ? Carbon::parse((string) $currentPlanRow['payment_date'])->toDateString()
                                : $nextDueDate->toDateString())),
                    'repayment_plan' => !empty($planState) ? $planState : null,
                ]);
            }

            $finance->save();

            if ($isSpeedDraft) {
                $periodKey = $paymentDate->format('Y-m');
                $speedDraftInterestPaidByPeriod[$periodKey] = round(
                    ((float) ($speedDraftInterestPaidByPeriod[$periodKey] ?? 0)) + (float) $calculation['interest_paid'],
                    2,
                );
            }

            $runningTotalPaid = $newTotalPaid;
            $runningBalance = $newBalance;
            $openingOutstanding = $runningBalance;
            $runningCapital = round((float) $calculation['new_capital'], 2);
            $runningArrears = $finalArrears;
            $currentInstallmentIndex = $updatedInstallmentIndex;
        }

        $this->syncDraftLoanFromFinance($finance);
    }

    private function syncDraftLoanFromFinance(Finance $finance): void
    {
        if (!self::isDraftLoanProductType((string) ($finance->product_type ?? ''))) {
            return;
        }

        $draftLoan = DraftLoan::where('finance_id', $finance->id)->first();
        if (!$draftLoan) {
            return;
        }

        $draftLoan->forceFill([
            'status' => $finance->status,
            'interest_amount' => round((float) ($finance->due_interest_amount ?? 0), 2),
            'due_amount' => round((float) ($finance->due_amount ?? 0), 2),
            'total_paid_amount' => round((float) ($finance->total_paid_amount ?? 0), 2),
            'balance_amount' => round((float) ($finance->balance_amount ?? 0), 2),
            'due_date' => $finance->due_date,
            'next_collection_date' => $finance->next_collection_date,
        ]);
        $draftLoan->save();
    }

    public function documents(Request $request, int $id): JsonResponse
    {
        $finance = $this->resolveFinanceOrFail($request, $id);
        $documents = FinanceDocument::where('finance_id', $finance->id)->get();
        return response()->json([
            'data' => $documents,
        ]);
    }

    public function storeDocument(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'document_type' => ['required', 'string', 'max:100'],
            'file' => ['required', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png,webp', 'max:10240'],
        ]);

        $finance = $this->resolveFinanceOrFail($request, $id);
        $user = $request->user();

        if (!$request->hasFile('file')) {
            return response()->json([
                'message' => 'No file uploaded',
            ], 400);
        }

        $file = $request->file('file');
        $originalName = $file->getClientOriginalName();
        $fileName = time() . '_' . $originalName;
        $filePath = $file->storeAs('finance_documents', $fileName, 'public');

        $document = FinanceDocument::create([
            'finance_id' => $finance->id,
            'document_type' => $request->document_type,
            'file_path' => $filePath,
            'original_name' => $originalName,
            'uploaded_by' => $user?->id,
        ]);

        return response()->json([
            'message' => 'Document uploaded successfully',
            'document' => $document,
        ], 201);
    }
}
