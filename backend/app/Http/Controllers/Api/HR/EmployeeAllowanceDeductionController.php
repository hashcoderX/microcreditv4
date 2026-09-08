<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeAllowanceDeduction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class EmployeeAllowanceDeductionController extends Controller
{
    private function canManageEmployees(Request $request, string $permission): bool
    {
        $user = $request->user();
        if (!$user) {
            return false;
        }

        return $user->isSystemAdmin() || $user->hasPermission($permission);
    }

    private function canAccessEmployee(Request $request, Employee $employee): bool
    {
        $user = $request->user();
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $viewerBranchId = (int) ($user->branch_id ?? optional($user->employee)->branch_id ?? 0);
        if ($viewerBranchId > 0 && (int) ($employee->branch_id ?? 0) !== $viewerBranchId) {
            return false;
        }

        $viewerTenantId = (int) ($user->tenant_id ?? optional($user->employee)->tenant_id ?? 0);
        if ($viewerTenantId <= 0) {
            $viewerTenantId = $viewerBranchId;
        }

        if ($viewerTenantId > 0 && (int) ($employee->tenant_id ?? 0) !== $viewerTenantId) {
            return false;
        }

        return true;
    }

    /**
     * Display a listing of allowances and deductions for a specific employee.
     */
    public function index(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        // Get allowances and deductions for the specific employee
        $allowancesDeductions = EmployeeAllowanceDeduction::where('employee_id', (int) $employee->id)
            ->where('is_active', true)
            ->orderBy('type')
            ->orderBy('name')
            ->get();

        return response()->json($allowancesDeductions);
    }

    /**
     * Store a newly created allowance or deduction.
     */
    public function store(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'type' => 'required|in:allowance,deduction',
            'amount_type' => 'required|in:fixed,percentage',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $allowanceDeduction = EmployeeAllowanceDeduction::create([
            'employee_id' => (int) $employee->id,
            'name' => $request->name,
            'amount' => $request->amount,
            'type' => $request->type,
            'amount_type' => $request->amount_type,
        ]);

        return response()->json($allowanceDeduction->load('employee'), 201);
    }

    /**
     * Display the specified allowance or deduction.
     */
    public function show(Request $request, Employee $employee, EmployeeAllowanceDeduction $allowanceDeduction): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if ((int) $allowanceDeduction->employee_id !== (int) $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($allowanceDeduction->load('employee'));
    }

    /**
     * Update the specified allowance or deduction.
     */
    public function update(Request $request, Employee $employee, EmployeeAllowanceDeduction $allowanceDeduction): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        if ((int) $allowanceDeduction->employee_id !== (int) $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'amount' => 'sometimes|required|numeric|min:0',
            'type' => 'sometimes|required|in:allowance,deduction',
            'amount_type' => 'sometimes|required|in:fixed,percentage',
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validated = $validator->validated();
        $allowanceDeduction->update([
            'name' => $validated['name'] ?? $allowanceDeduction->name,
            'amount' => $validated['amount'] ?? $allowanceDeduction->amount,
            'type' => $validated['type'] ?? $allowanceDeduction->type,
            'amount_type' => $validated['amount_type'] ?? $allowanceDeduction->amount_type,
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : (bool) $allowanceDeduction->is_active,
        ]);

        return response()->json($allowanceDeduction->load('employee'));
    }

    /**
     * Remove the specified allowance or deduction.
     */
    public function destroy(Request $request, Employee $employee, EmployeeAllowanceDeduction $allowanceDeduction): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        if ((int) $allowanceDeduction->employee_id !== (int) $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $allowanceDeduction->delete();

        return response()->json(['message' => 'Allowance/Deduction deleted successfully']);
    }
}
