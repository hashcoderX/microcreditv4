<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LoanProduct;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LoanProductController extends Controller
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

    private function applyScope($query, Request $request)
    {
        $query->where('tenant_id', (int) ($request->user()?->tenant_id ?? 1));

        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null) {
            $query->where('branch_id', $branchId);
        }

        return $query;
    }

    public function index(Request $request): JsonResponse
    {
        $query = LoanProduct::query()->orderByDesc('id');
        $this->applyScope($query, $request);

        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->boolean('is_active'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->user()?->tenant_id ?? 1);
        $branchId = $this->scopedBranchId($request);

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('loan_products', 'name')
                    ->where(fn ($query) => $query
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)
                    ),
            ],
                    'interest_rate' => ['required', 'numeric', 'min:0'],
            'description' => ['nullable', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:16'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $product = LoanProduct::create([
            'tenant_id' => $tenantId,
            'branch_id' => $branchId,
            'name' => trim((string) $validated['name']),
            'interest_rate' => round((float) $validated['interest_rate'], 4),
            'description' => isset($validated['description']) ? trim((string) $validated['description']) : null,
            'icon' => isset($validated['icon']) ? trim((string) $validated['icon']) : null,
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return response()->json($product, 201);
    }

    public function show(Request $request, LoanProduct $loanProduct): JsonResponse
    {
        $query = LoanProduct::query()->whereKey($loanProduct->id);
        $this->applyScope($query, $request);

        return response()->json($query->firstOrFail());
    }

    public function update(Request $request, LoanProduct $loanProduct): JsonResponse
    {
        $tenantId = (int) ($request->user()?->tenant_id ?? 1);
        $branchId = $this->scopedBranchId($request);

        $query = LoanProduct::query()->whereKey($loanProduct->id);
        $this->applyScope($query, $request);
        $target = $query->firstOrFail();

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('loan_products', 'name')
                    ->ignore($target->id)
                    ->where(fn ($uniqueQuery) => $uniqueQuery
                        ->where('tenant_id', $tenantId)
                        ->where('branch_id', $branchId)
                    ),
            ],
                    'interest_rate' => ['required', 'numeric', 'min:0'],
            'description' => ['nullable', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:16'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $target->update([
            'name' => trim((string) $validated['name']),
            'interest_rate' => round((float) $validated['interest_rate'], 4),
            'description' => isset($validated['description']) ? trim((string) $validated['description']) : null,
            'icon' => isset($validated['icon']) ? trim((string) $validated['icon']) : null,
            'is_active' => $validated['is_active'] ?? true,
            'updated_by' => $request->user()?->id,
        ]);

        return response()->json($target->fresh());
    }

    public function destroy(Request $request, LoanProduct $loanProduct): JsonResponse
    {
        $query = LoanProduct::query()->whereKey($loanProduct->id);
        $this->applyScope($query, $request);
        $target = $query->firstOrFail();

        $target->delete();

        return response()->json(['message' => 'Loan product deleted successfully']);
    }
}
