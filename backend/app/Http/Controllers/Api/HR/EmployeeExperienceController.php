<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeExperience;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class EmployeeExperienceController extends Controller
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

    public function index(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        return response()->json($employee->experiences()->latest()->get());
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        $validated = $request->validate([
            'company' => 'required|string|max:255',
            'role' => 'required|string|max:255',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'is_current' => 'boolean',
            'responsibilities' => 'nullable|string',
            'achievements' => 'nullable|string',
        ]);

        $exp = $employee->experiences()->create(array_merge($validated, [
            'branch_id' => $employee->branch_id,
        ]));
        return response()->json($exp, 201);
    }

    public function update(Request $request, Employee $employee, EmployeeExperience $experience): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        if ($experience->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $validated = $request->validate([
            'company' => 'sometimes|required|string|max:255',
            'role' => 'sometimes|required|string|max:255',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'is_current' => 'boolean',
            'responsibilities' => 'nullable|string',
            'achievements' => 'nullable|string',
        ]);

        $experience->update($validated);
        return response()->json($experience);
    }

    public function destroy(Employee $employee, EmployeeExperience $experience): JsonResponse
    {
        $request = request();
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        if ($experience->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        $experience->delete();
        return response()->json(['message' => 'Experience removed']);
    }
}