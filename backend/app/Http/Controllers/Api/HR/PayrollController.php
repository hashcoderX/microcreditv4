<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Payroll;
use App\Models\Employee;
use App\Models\Attendance;
use App\Models\FinanceCollection;
use App\Models\LoanRequestCollection;
use App\Models\MicrofinanceLoanCollection;
use App\Models\MortgagePayment;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class PayrollController extends Controller
{
    private function calculateOwnBusinessAchievement(int $employeeId, int $branchId, Carbon $monthStart, Carbon $monthEnd): float
    {
        $employee = Employee::with('user:id,employee_id')->find($employeeId);
        $userId = (int) ($employee?->user?->id ?? 0);

        if ($userId <= 0) {
            return 0.0;
        }

        $financeCollections = (float) FinanceCollection::query()
            ->where('branch_id', $branchId)
            ->where('collector_id', $userId)
            ->whereBetween('payment_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum('payment_amount');

        $instantCollections = (float) LoanRequestCollection::query()
            ->join('loan_requests', 'loan_requests.id', '=', 'loan_request_collections.loan_request_id')
            ->where('loan_requests.branch_id', $branchId)
            ->where('loan_request_collections.created_by', $userId)
            ->whereBetween('loan_request_collections.collection_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum('loan_request_collections.collected_amount');

        $microfinanceCollections = (float) MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->where('mf_loan_requests.branch_id', $branchId)
            ->where('mf_loan_collections.created_by', $userId)
            ->whereBetween('mf_loan_collections.collection_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum('mf_loan_collections.collected_amount');

        $mortgageCollections = (float) MortgagePayment::query()
            ->where('branch_id', $branchId)
            ->where(function ($query) use ($userId) {
                $query->where('user_id', $userId)
                    ->orWhere('collected_by', $userId);
            })
            ->whereBetween('paid_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum('amount');

        return round($financeCollections + $instantCollections + $microfinanceCollections + $mortgageCollections, 2);
    }

    private function calculateCompanyProfitAchievement(int $branchId, Carbon $monthStart, Carbon $monthEnd): float
    {
        $financeProfit = (float) FinanceCollection::query()
            ->where('branch_id', $branchId)
            ->whereBetween('payment_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum('interest_paid');

        $microfinanceProfit = (float) MicrofinanceLoanCollection::query()
            ->join('mf_loan_requests', 'mf_loan_requests.id', '=', 'mf_loan_collections.mf_loan_request_id')
            ->where('mf_loan_requests.branch_id', $branchId)
            ->whereBetween('mf_loan_collections.collection_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum(DB::raw('COALESCE(mf_loan_collections.interest_amount, 0) + COALESCE(mf_loan_collections.penalty_amount, 0)'));

        $instantLoanProfit = (float) LoanRequestCollection::query()
            ->join('loan_requests', 'loan_requests.id', '=', 'loan_request_collections.loan_request_id')
            ->where('loan_requests.branch_id', $branchId)
            ->whereBetween('loan_request_collections.collection_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum(DB::raw(
                'loan_request_collections.collected_amount * CASE WHEN loan_requests.total_payable > 0 '
                . 'THEN ((loan_requests.total_payable - loan_requests.principal) / loan_requests.total_payable) ELSE 0 END'
            ));

        $mortgageProfit = (float) MortgagePayment::query()
            ->where('branch_id', $branchId)
            ->whereBetween('paid_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->sum(DB::raw('COALESCE(NULLIF(profit_amount, 0), interest_amount, 0)'));

        return round($financeProfit + $microfinanceProfit + $instantLoanProfit + $mortgageProfit, 2);
    }

    private function calculateMonthlyAchievement(Employee $employee, int $branchId, Carbon $monthStart, Carbon $monthEnd): float
    {
        $base = (string) ($employee->commission_base ?? 'own_business');

        if ($base === 'company_profit') {
            return $this->calculateCompanyProfitAchievement($branchId, $monthStart, $monthEnd);
        }

        return $this->calculateOwnBusinessAchievement((int) $employee->id, $branchId, $monthStart, $monthEnd);
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');
        $monthYear = $request->input('month_year');

        $query = Payroll::with('employee');

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($monthYear) {
            $query->where('month_year', $monthYear);
        }

        $payrolls = $query->paginate(15);

        return response()->json($payrolls);
    }

    /**
     * Generate payroll for a specific month
     */
    public function generate(Request $request): JsonResponse
    {
        $request->validate([
            'branch_id' => 'nullable|exists:companies,id',
            'month_year' => 'required|date_format:Y-m',
        ]);

        $user = $request->user();
        $tenantId = 1; // Default tenant for now
        $branchId = $request->branch_id ?? $user->branch_id;
        $monthYear = $request->month_year;
        $monthStart = Carbon::createFromFormat('Y-m', $monthYear)->startOfMonth();
        $monthEnd = (clone $monthStart)->endOfMonth();

        // Get all active employees for the branch
        $employees = Employee::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->get();

        $generatedPayrolls = [];

        foreach ($employees as $employee) {
            // Check if payroll already exists
            $existingPayroll = Payroll::where('employee_id', $employee->id)
                ->where('month_year', $monthYear)
                ->first();

            if ($existingPayroll) {
                continue; // Skip if already generated
            }

            // Get attendance for the month
            $attendance = Attendance::where('employee_id', $employee->id)
                ->whereRaw("DATE_FORMAT(date, '%Y-%m') = ?", [$monthYear])
                ->get();

            $workingDays = $attendance->count();
            $presentDays = $attendance->where('status', 'present')->count();
            $absentDays = $attendance->where('status', 'absent')->count();

            // Calculate salary based on attendance
            $dailyRate = $employee->basic_salary / 30; // Assuming 30 working days
            $earnedSalary = $dailyRate * $presentDays;

            $monthlyTarget = (float) ($employee->monthly_target ?? 0);
            $achievedAmount = $this->calculateMonthlyAchievement($employee, (int) $branchId, $monthStart, $monthEnd);
            $isTargetMet = $monthlyTarget <= 0 ? true : $achievedAmount >= $monthlyTarget;
            $commissionRate = (float) ($employee->commission ?? 0);
            $commissionAmount = $isTargetMet ? round($earnedSalary * ($commissionRate / 100), 2) : 0;

            // Simple allowances and deductions (can be expanded)
            $allowances = $commissionAmount; // Commission is included only when monthly target is met.
            $deductions = 0; // Add logic for deductions

            $netSalary = $earnedSalary + $allowances - $deductions;

            $payroll = Payroll::create([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'employee_id' => $employee->id,
                'month_year' => $monthYear,
                'basic_salary' => $employee->basic_salary,
                'allowances' => $allowances,
                'deductions' => $deductions,
                'net_salary' => $netSalary,
                'working_days' => $workingDays,
                'present_days' => $presentDays,
                'absent_days' => $absentDays,
                'overtime_hours' => 0, // Add overtime calculation
                'overtime_amount' => 0,
                'status' => 'pending',
            ]);

            $generatedPayrolls[] = $payroll->load('employee');
        }

        return response()->json([
            'message' => 'Payroll generated successfully',
            'payrolls' => $generatedPayrolls,
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'month_year' => 'required|date_format:Y-m',
            'basic_salary' => 'required|numeric|min:0',
            'allowances' => 'numeric|min:0',
            'deductions' => 'numeric|min:0',
            'net_salary' => 'required|numeric|min:0',
            'working_days' => 'required|integer|min:0',
            'present_days' => 'required|integer|min:0',
            'absent_days' => 'required|integer|min:0',
            'overtime_hours' => 'numeric|min:0',
            'overtime_amount' => 'numeric|min:0',
            'status' => 'in:pending,processed,paid',
        ]);

        // Get tenant_id and branch_id from authenticated user
        $user = $request->user();
        $validated['tenant_id'] = 1; // Default tenant for now
        $validated['branch_id'] = $user->branch_id;

        $payroll = Payroll::create($validated);

        return response()->json($payroll->load('employee'), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Payroll $payroll): JsonResponse
    {
        return response()->json($payroll->load('employee'));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Payroll $payroll): JsonResponse
    {
        $validated = $request->validate([
            'allowances' => 'numeric|min:0',
            'deductions' => 'numeric|min:0',
            'net_salary' => 'numeric|min:0',
            'status' => 'in:pending,processed,paid',
            'processed_at' => 'nullable|date',
        ]);

        $payroll->update($validated);

        return response()->json($payroll->load('employee'));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Payroll $payroll): JsonResponse
    {
        $payroll->delete();

        return response()->json(['message' => 'Payroll record deleted successfully']);
    }

    /**
     * Generate PDF payslip
     */
    public function payslip(Payroll $payroll): JsonResponse
    {
        // This would require a PDF package like dompdf or tcpdf
        // For now, return JSON
        return response()->json([
            'payslip' => $payroll->load('employee'),
            'message' => 'PDF generation would be implemented here',
        ]);
    }
}
