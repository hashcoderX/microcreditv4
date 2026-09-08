<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CustomerDocumentController extends Controller
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
        $requestedBranchId = (int) ($request->get('branch_id', 0));

        if ($this->isAdminUser($request->user())) {
            return $requestedBranchId > 0 ? $requestedBranchId : null;
        }

        $branchId = (int) ($request->user()?->branch_id ?? 0);
        return $branchId > 0 ? $branchId : null;
    }

    private function scopedTenantId(Request $request): ?int
    {
        $requestedTenantId = (int) ($request->get('tenant_id', 0));

        if ($this->isAdminUser($request->user())) {
            return $requestedTenantId > 0 ? $requestedTenantId : null;
        }

        $user = $request->user();
        $tenantId = (int) ($user?->tenant_id ?? 0);

        if ($tenantId <= 0) {
            $tenantId = (int) (optional($user?->employee)->tenant_id ?? 0);
        }

        return $tenantId > 0 ? $tenantId : null;
    }

    private function canAccessCustomer(Request $request, Customer $customer): bool
    {
        if ($this->isAdminUser($request->user())) {
            return true;
        }

        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null && (int) ($customer->branch_id ?? 0) !== $branchId) {
            return false;
        }

        $tenantId = $this->scopedTenantId($request);
        if ($tenantId !== null && (int) ($customer->tenant_id ?? 0) !== $tenantId) {
            return false;
        }

        return true;
    }

    public function index(Request $request, Customer $customer): JsonResponse
    {
        if (!$this->canAccessCustomer($request, $customer)) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        return response()->json(['data' => $customer->documents()->latest()->get()]);
    }

    public function store(Request $request, Customer $customer): JsonResponse
    {
        if (!$this->canAccessCustomer($request, $customer)) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        $request->validate([
            'document_type' => ['required', 'string', 'max:120'],
            'file' => ['required', 'file', 'max:5120'],
        ]);

        $file = $request->file('file');
        $path = $file->store('public/customers/' . $customer->id);
        $doc = $customer->documents()->create([
            'document_type' => $request->get('document_type'),
            'file_path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'uploaded_by' => $request->user()->id,
        ]);

        return response()->json($doc, 201);
    }

    public function destroy(Request $request, Customer $customer, CustomerDocument $document): JsonResponse
    {
        if (!$this->canAccessCustomer($request, $customer)) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        if ($document->customer_id !== $customer->id) {
            return response()->json(['message' => 'Not found'], 404);
        }
        if ($document->file_path) {
            Storage::delete($document->file_path);
        }
        $document->delete();
        return response()->json(null, 204);
    }

    public function download(Request $request, Customer $customer, CustomerDocument $document)
    {
        if (!$this->canAccessCustomer($request, $customer)) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        if ($document->customer_id !== $customer->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return Storage::download($document->file_path, $document->original_name ?: null);
    }
}
