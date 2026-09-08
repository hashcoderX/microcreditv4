<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class EmployeeDocumentController extends Controller
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

        return response()->json($employee->documents()->latest()->get());
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
            'type' => 'required|string',
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,jpeg,png|max:10240',
            'notes' => 'nullable|string',
        ]);

        $path = $request->file('file')->store('employee_documents', 'public');

        $doc = $employee->documents()->create([
            'branch_id' => $employee->branch_id,
            'type' => $validated['type'],
            'file_path' => $path,
            'original_name' => $request->file('file')->getClientOriginalName(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json($doc, 201);
    }

    public function destroy(Request $request, Employee $employee, EmployeeDocument $document): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        if ($document->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        Storage::disk('public')->delete($document->file_path);
        $document->delete();
        return response()->json(['message' => 'Document deleted']);
    }

    public function download(Request $request, Employee $employee, EmployeeDocument $document)
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if ($document->employee_id !== $employee->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        return response()->download(
            Storage::disk('public')->path($document->file_path),
            $document->original_name ?: null
        );
    }
}