<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountingExpense;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountingExpenseController extends Controller
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

    public function index(Request $request, Company $company): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'category' => ['nullable', Rule::in(AccountingExpense::categories())],
            'search' => ['nullable', 'string', 'max:190'],
        ]);

        $query = AccountingExpense::query()
            ->where('company_id', $company->id)
            ->orderByDesc('expense_date')
            ->orderByDesc('id');

        if (!empty($validated['from_date'])) {
            $query->whereDate('expense_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $query->whereDate('expense_date', '<=', $validated['to_date']);
        }

        if (!empty($validated['category'])) {
            $query->where('category', $validated['category']);
        }

        if (!empty($validated['search'])) {
            $term = trim((string) $validated['search']);
            $query->where(function ($builder) use ($term) {
                $builder
                    ->where('title', 'like', "%{$term}%")
                    ->orWhere('reference_no', 'like', "%{$term}%")
                    ->orWhere('notes', 'like', "%{$term}%");
            });
        }

        $expenses = $query->get();
        $totalAmount = round((float) $expenses->sum('amount'), 2);

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency,
            ],
            'expenses' => $expenses,
            'summary' => [
                'count' => $expenses->count(),
                'total_amount' => $totalAmount,
            ],
            'categories' => AccountingExpense::categories(),
            'payment_methods' => AccountingExpense::paymentMethods(),
        ]);
    }

    public function store(Request $request, Company $company): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        $validated = $request->validate([
            'expense_date' => ['required', 'date'],
            'category' => ['required', Rule::in(AccountingExpense::categories())],
            'title' => ['required', 'string', 'max:190'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in(AccountingExpense::paymentMethods())],
            'reference_no' => ['nullable', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $expense = AccountingExpense::create([
            'company_id' => $company->id,
            'expense_date' => $validated['expense_date'],
            'category' => $validated['category'],
            'title' => trim((string) $validated['title']),
            'amount' => round((float) $validated['amount'], 2),
            'payment_method' => $validated['payment_method'],
            'reference_no' => isset($validated['reference_no']) ? trim((string) $validated['reference_no']) : null,
            'notes' => isset($validated['notes']) ? trim((string) $validated['notes']) : null,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'message' => 'Expense recorded successfully.',
            'expense' => $expense,
        ], 201);
    }

    public function destroy(Request $request, Company $company, AccountingExpense $accountingExpense): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        if ((int) $accountingExpense->company_id !== (int) $company->id) {
            return response()->json(['message' => 'Expense not found for this branch.'], 404);
        }

        $accountingExpense->delete();

        return response()->json(['message' => 'Expense deleted successfully.']);
    }

    public function allBranchReport(Request $request): JsonResponse
    {
        if (!$this->isTopManagementUser($request->user())) {
            return response()->json([
                'message' => 'Only top management roles can view all-branch expense report.',
            ], 403);
        }

        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'category' => ['nullable', Rule::in(AccountingExpense::categories())],
            'payment_method' => ['nullable', Rule::in(AccountingExpense::paymentMethods())],
            'branch_id' => ['nullable', 'integer', 'min:1'],
            'search' => ['nullable', 'string', 'max:190'],
        ]);

        $query = AccountingExpense::query()
            ->with(['company:id,name,currency'])
            ->orderByDesc('expense_date')
            ->orderByDesc('id');

        if (!empty($validated['branch_id'])) {
            $query->where('company_id', (int) $validated['branch_id']);
        }

        if (!empty($validated['from_date'])) {
            $query->whereDate('expense_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $query->whereDate('expense_date', '<=', $validated['to_date']);
        }

        if (!empty($validated['category'])) {
            $query->where('category', $validated['category']);
        }

        if (!empty($validated['payment_method'])) {
            $query->where('payment_method', $validated['payment_method']);
        }

        if (!empty($validated['search'])) {
            $term = trim((string) $validated['search']);
            $query->where(function ($builder) use ($term) {
                $builder
                    ->where('title', 'like', "%{$term}%")
                    ->orWhere('reference_no', 'like', "%{$term}%")
                    ->orWhere('notes', 'like', "%{$term}%");
            });
        }

        $expenses = $query->get();

        $branchSummary = AccountingExpense::query()
            ->join('companies', 'companies.id', '=', 'accounting_expenses.company_id')
            ->when(!empty($validated['branch_id']), fn ($builder) => $builder->where('accounting_expenses.company_id', (int) $validated['branch_id']))
            ->when(!empty($validated['from_date']), fn ($builder) => $builder->whereDate('accounting_expenses.expense_date', '>=', $validated['from_date']))
            ->when(!empty($validated['to_date']), fn ($builder) => $builder->whereDate('accounting_expenses.expense_date', '<=', $validated['to_date']))
            ->when(!empty($validated['category']), fn ($builder) => $builder->where('accounting_expenses.category', $validated['category']))
            ->when(!empty($validated['payment_method']), fn ($builder) => $builder->where('accounting_expenses.payment_method', $validated['payment_method']))
            ->when(!empty($validated['search']), function ($builder) use ($validated) {
                $term = trim((string) $validated['search']);
                $builder->where(function ($sub) use ($term) {
                    $sub
                        ->where('accounting_expenses.title', 'like', "%{$term}%")
                        ->orWhere('accounting_expenses.reference_no', 'like', "%{$term}%")
                        ->orWhere('accounting_expenses.notes', 'like', "%{$term}%");
                });
            })
            ->groupBy('accounting_expenses.company_id', 'companies.name')
            ->selectRaw('accounting_expenses.company_id as branch_id')
            ->selectRaw('companies.name as branch_name')
            ->selectRaw('COUNT(*) as expense_count')
            ->selectRaw('COALESCE(SUM(accounting_expenses.amount), 0) as total_amount')
            ->orderByDesc('total_amount')
            ->get();

        $categorySummary = AccountingExpense::query()
            ->when(!empty($validated['branch_id']), fn ($builder) => $builder->where('company_id', (int) $validated['branch_id']))
            ->when(!empty($validated['from_date']), fn ($builder) => $builder->whereDate('expense_date', '>=', $validated['from_date']))
            ->when(!empty($validated['to_date']), fn ($builder) => $builder->whereDate('expense_date', '<=', $validated['to_date']))
            ->when(!empty($validated['payment_method']), fn ($builder) => $builder->where('payment_method', $validated['payment_method']))
            ->when(!empty($validated['search']), function ($builder) use ($validated) {
                $term = trim((string) $validated['search']);
                $builder->where(function ($sub) use ($term) {
                    $sub
                        ->where('title', 'like', "%{$term}%")
                        ->orWhere('reference_no', 'like', "%{$term}%")
                        ->orWhere('notes', 'like', "%{$term}%");
                });
            })
            ->groupBy('category')
            ->selectRaw('category')
            ->selectRaw('COUNT(*) as expense_count')
            ->selectRaw('COALESCE(SUM(amount), 0) as total_amount')
            ->orderByDesc('total_amount')
            ->get();

        $paymentSummary = AccountingExpense::query()
            ->when(!empty($validated['branch_id']), fn ($builder) => $builder->where('company_id', (int) $validated['branch_id']))
            ->when(!empty($validated['from_date']), fn ($builder) => $builder->whereDate('expense_date', '>=', $validated['from_date']))
            ->when(!empty($validated['to_date']), fn ($builder) => $builder->whereDate('expense_date', '<=', $validated['to_date']))
            ->when(!empty($validated['category']), fn ($builder) => $builder->where('category', $validated['category']))
            ->when(!empty($validated['search']), function ($builder) use ($validated) {
                $term = trim((string) $validated['search']);
                $builder->where(function ($sub) use ($term) {
                    $sub
                        ->where('title', 'like', "%{$term}%")
                        ->orWhere('reference_no', 'like', "%{$term}%")
                        ->orWhere('notes', 'like', "%{$term}%");
                });
            })
            ->groupBy('payment_method')
            ->selectRaw('payment_method')
            ->selectRaw('COUNT(*) as expense_count')
            ->selectRaw('COALESCE(SUM(amount), 0) as total_amount')
            ->orderByDesc('total_amount')
            ->get();

        return response()->json([
            'filters' => [
                'from_date' => $validated['from_date'] ?? null,
                'to_date' => $validated['to_date'] ?? null,
                'branch_id' => $validated['branch_id'] ?? null,
                'category' => $validated['category'] ?? null,
                'payment_method' => $validated['payment_method'] ?? null,
                'search' => $validated['search'] ?? null,
            ],
            'expenses' => $expenses,
            'branch_summary' => $branchSummary,
            'category_summary' => $categorySummary,
            'payment_summary' => $paymentSummary,
            'summary' => [
                'expense_count' => (int) $expenses->count(),
                'total_amount' => round((float) $expenses->sum('amount'), 2),
                'branch_count' => (int) $branchSummary->count(),
            ],
            'categories' => AccountingExpense::categories(),
            'payment_methods' => AccountingExpense::paymentMethods(),
        ]);
    }
}
