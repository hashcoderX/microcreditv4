<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyAccount;
use App\Models\Employee;
use App\Models\EmployeeWallet;
use App\Models\EmployeeWalletBankDeposit;
use App\Models\EmployeeWalletCashHandover;
use App\Models\User;
use App\Models\UserDashboardWidget;
use App\Http\Requests\StoreEmployeeRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class EmployeeController extends Controller
{
    private function walletManagerRoleKeywords(): array
    {
        return ['branch manager', 'bank manager', 'regional manager', 'head office'];
    }

    private function resolveWalletManagersForBranch(int $branchCompanyId): array
    {
        if ($branchCompanyId <= 0) {
            return [];
        }

        $rows = [];

        $branch = Company::query()->with('manager:id,name,employee_id')->find($branchCompanyId);
        $managerUser = $branch?->manager;
        if ($managerUser && (int) ($managerUser->employee_id ?? 0) > 0) {
            $managerEmployee = Employee::query()->find((int) $managerUser->employee_id);
            if ($managerEmployee) {
                $rows[] = [
                    'employee_id' => (int) $managerEmployee->id,
                    'user_id' => (int) $managerUser->id,
                    'branch_id' => (int) ($managerEmployee->branch_id ?? $branchCompanyId),
                    'name' => (string) ($managerUser->name ?: trim(($managerEmployee->first_name ?? '') . ' ' . ($managerEmployee->last_name ?? ''))),
                    'employee_code' => (string) ($managerEmployee->employee_code ?? ''),
                ];
            }
        }

        $roleBasedManagers = User::query()
            ->with(['employee:id,first_name,last_name,employee_code,branch_id,status', 'designation:id,name', 'employee.designation:id,name'])
            ->where(function ($scope) use ($branchCompanyId) {
                $scope
                    ->where('branch_id', $branchCompanyId)
                    ->orWhereHas('employee', function ($employeeScope) use ($branchCompanyId) {
                        $employeeScope->where('branch_id', $branchCompanyId);
                    });
            })
            ->where(function ($query) {
                $keywords = $this->walletManagerRoleKeywords();
                $query
                    ->whereHas('designation', function ($designationQuery) use ($keywords) {
                        $designationQuery->where(function ($designationScope) use ($keywords) {
                            foreach ($keywords as $keyword) {
                                $designationScope->orWhereRaw('LOWER(name) LIKE ?', ['%' . $keyword . '%']);
                            }
                        });
                    })
                    ->orWhereHas('employee.designation', function ($designationQuery) use ($keywords) {
                        $designationQuery->where(function ($designationScope) use ($keywords) {
                            foreach ($keywords as $keyword) {
                                $designationScope->orWhereRaw('LOWER(name) LIKE ?', ['%' . $keyword . '%']);
                            }
                        });
                    })
                    ->orWhereHas('roles', function ($roleQuery) use ($keywords) {
                        $roleQuery->where(function ($roleScope) use ($keywords) {
                            foreach ($keywords as $keyword) {
                                $roleScope->orWhereRaw('LOWER(name) LIKE ?', ['%' . $keyword . '%']);
                            }
                        });
                    });
            })
            ->orderBy('id')
            ->get();

        foreach ($roleBasedManagers as $candidateUser) {
            $employee = $candidateUser->employee;
            if (!$employee || (int) ($employee->id ?? 0) <= 0) {
                continue;
            }

            $rows[] = [
                'employee_id' => (int) $employee->id,
                'user_id' => (int) ($candidateUser->id ?? 0),
                'branch_id' => (int) ($employee->branch_id ?? $branchCompanyId),
                'name' => (string) (
                    trim((string) ($employee->first_name ?? '') . ' ' . (string) ($employee->last_name ?? ''))
                    ?: (string) ($candidateUser->name ?? 'Branch Manager')
                ),
                'employee_code' => (string) ($employee->employee_code ?? ''),
            ];
        }

        $uniqueByEmployee = [];
        foreach ($rows as $row) {
            $employeeId = (int) ($row['employee_id'] ?? 0);
            if ($employeeId <= 0) {
                continue;
            }

            $uniqueByEmployee[$employeeId] = $row;
        }

        return array_values($uniqueByEmployee);
    }

    private function resolveHeadOfficeHandoverOptions(?int $excludeBranchId = null): array
    {
        $headOfficeBranches = Company::query()
            ->where('is_main_branch', true)
            ->orderBy('id')
            ->get(['id', 'name', 'is_main_branch']);

        if ($headOfficeBranches->isEmpty()) {
            $headOfficeBranches = Company::query()
                ->whereRaw('LOWER(name) LIKE ?', ['%head office%'])
                ->orWhereRaw('LOWER(name) LIKE ?', ['%head-office%'])
                ->orWhereRaw('LOWER(name) LIKE ?', ['%hq%'])
                ->orderBy('id')
                ->get(['id', 'name', 'is_main_branch']);
        }

        $rows = [];
        foreach ($headOfficeBranches as $branch) {
            $branchId = (int) ($branch->id ?? 0);
            if ($branchId <= 0) {
                continue;
            }
            if ($excludeBranchId !== null && $excludeBranchId > 0 && $branchId === $excludeBranchId) {
                continue;
            }

            $managers = $this->resolveWalletManagersForBranch($branchId);
            $rows[] = [
                'branch_id' => $branchId,
                'branch_name' => (string) ($branch->name ?? ('Branch #' . $branchId)),
                'is_main_branch' => (bool) ($branch->is_main_branch ?? false),
                'managers' => $managers,
            ];
        }

        return $rows;
    }

    private function canOverrideWalletApprovals(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        return $user->isSystemAdmin();
    }

    private function hasWalletApprovalManagerAccess(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        $keywords = ['branch manager', 'bank manager', 'regional manager'];

        $designationName = strtolower(trim((string) optional($user->designation)->name));
        foreach ($keywords as $keyword) {
            if ($designationName !== '' && str_contains($designationName, $keyword)) {
                return true;
            }
        }

        $employeeDesignationName = strtolower(trim((string) optional(optional($user->employee)->designation)->name));
        foreach ($keywords as $keyword) {
            if ($employeeDesignationName !== '' && str_contains($employeeDesignationName, $keyword)) {
                return true;
            }
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized === '') {
                continue;
            }

            foreach ($keywords as $keyword) {
                if (str_contains($normalized, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return array<int>
     */
    private function resolveWalletApprovalBranchIds(?User $user): array
    {
        if (!$user) {
            return [];
        }

        if ($this->canOverrideWalletApprovals($user)) {
            return Company::query()
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->filter(fn ($id) => $id > 0)
                ->unique()
                ->values()
                ->all();
        }

        $branchIds = Company::query()
            ->where('manager_user_id', (int) $user->id)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->values()
            ->all();

        $userEmployeeBranchId = (int) ($user->employee()->value('branch_id') ?? 0);
        $directBranchCandidates = [
            (int) ($user->branch_id ?? 0),
            $userEmployeeBranchId,
        ];

        if ($this->hasWalletApprovalManagerAccess($user)) {
            foreach ($directBranchCandidates as $candidateBranchId) {
                if ($candidateBranchId > 0) {
                    $branchIds[] = $candidateBranchId;
                }
            }
        }

        $employeeId = (int) ($user->employee_id ?? 0);
        if ($employeeId > 0) {
            $assignedBranchIds = EmployeeWalletCashHandover::query()
                ->where('manager_employee_id', $employeeId)
                ->pluck('branch_id')
                ->map(fn ($id) => (int) $id)
                ->filter(fn ($id) => $id > 0)
                ->values()
                ->all();

            foreach ($assignedBranchIds as $assignedBranchId) {
                $branchIds[] = $assignedBranchId;
            }
        }

        return array_values(array_unique(array_filter($branchIds, fn ($id) => (int) $id > 0)));
    }

    private function canApproveWalletBranch(?User $user, int $branchId): bool
    {
        if (!$user || $branchId <= 0) {
            return false;
        }

        if ($this->canOverrideWalletApprovals($user)) {
            return true;
        }

        return in_array($branchId, $this->resolveWalletApprovalBranchIds($user), true);
    }

    private function buildBaseWalletNo(int $employeeId): string
    {
        return 'EW' . str_pad((string) $employeeId, 6, '0', STR_PAD_LEFT);
    }

    private function generateUniqueWalletNo(int $employeeId): string
    {
        $baseWalletNo = $this->buildBaseWalletNo($employeeId);
        $walletNo = $baseWalletNo;
        $suffix = 1;

        while (EmployeeWallet::query()->where('wallet_no', $walletNo)->exists()) {
            $walletNo = $baseWalletNo . '-' . $suffix;
            $suffix++;
        }

        return $walletNo;
    }

    private function ensureEmployeeWallet(Employee $employee, int $tenantId, int $branchId): EmployeeWallet
    {
        $existing = EmployeeWallet::query()
            ->where('employee_id', (int) $employee->id)
            ->lockForUpdate()
            ->first();

        if ($existing) {
            return $existing;
        }

        return EmployeeWallet::create([
            'tenant_id' => $tenantId,
            'branch_id' => $branchId,
            'employee_id' => (int) $employee->id,
            'wallet_no' => $this->generateUniqueWalletNo((int) $employee->id),
            'opening_balance' => 0,
            'current_balance' => 0,
            'status' => 'active',
        ]);
    }

    private function scopedBranchId(Request $request): ?int
    {
        $requestedBranchId = (int) ($request->get('branch_id', 0));

        if ($this->canOverrideWalletApprovals($request->user())) {
            return $requestedBranchId > 0 ? $requestedBranchId : null;
        }

        $user = $request->user();
        $branchId = (int) ($user?->branch_id ?? 0);
        if ($branchId <= 0) {
            $branchId = (int) (optional($user?->employee)->branch_id ?? 0);
        }

        return $branchId > 0 ? $branchId : null;
    }

    private function scopedTenantId(Request $request): ?int
    {
        $requestedTenantId = (int) ($request->get('tenant_id', 0));

        if ($this->canOverrideWalletApprovals($request->user())) {
            return $requestedTenantId > 0 ? $requestedTenantId : null;
        }

        $user = $request->user();
        $tenantId = (int) ($user?->tenant_id ?? 0);
        if ($tenantId <= 0) {
            $tenantId = (int) (optional($user?->employee)->tenant_id ?? 0);
        }

        if ($tenantId <= 0) {
            $tenantId = (int) ($user?->branch_id ?? 0);
        }

        return $tenantId > 0 ? $tenantId : null;
    }

    private function applyEmployeeAccessScope(Builder $query, Request $request): Builder
    {
        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null) {
            $query->where('branch_id', $branchId);
        }

        $tenantId = $this->scopedTenantId($request);
        if ($tenantId !== null) {
            $query->where('tenant_id', $tenantId);
        }

        return $query;
    }

    private function canAccessEmployee(Request $request, Employee $employee): bool
    {
        if ($this->canOverrideWalletApprovals($request->user())) {
            return true;
        }

        $branchId = $this->scopedBranchId($request);
        if ($branchId !== null && (int) ($employee->branch_id ?? 0) !== $branchId) {
            return false;
        }

        $tenantId = $this->scopedTenantId($request);
        if ($tenantId !== null && (int) ($employee->tenant_id ?? 0) !== $tenantId) {
            return false;
        }

        return true;
    }

    private function canManageEmployees(Request $request, string $permission): bool
    {
        $user = $request->user();
        if (!$user) {
            return false;
        }

        return $user->isSystemAdmin() || $user->hasPermission($permission);
    }

    private function findDesignationWidgetTemplateUser(int $designationId, ?int $excludeUserId = null): ?User
    {
        if ($designationId <= 0) {
            return null;
        }

        $query = User::query()
            ->where('designation_id', $designationId);

        if ($excludeUserId !== null && $excludeUserId > 0) {
            $query->where('id', '!=', $excludeUserId);
        }

        return $query
            ->whereHas('dashboardWidgets', function ($builder) {
                $builder->where('is_visible', false);
            })
            ->with(['employee:id,first_name,last_name,employee_code'])
            ->withCount([
                'dashboardWidgets as hidden_widgets_count' => function ($builder) {
                    $builder->where('is_visible', false);
                },
            ])
            ->orderByDesc('hidden_widgets_count')
            ->orderByDesc('id')
            ->first();
    }

    private function copyHiddenWidgetsFromDesignationTemplate(User $targetUser, int $designationId): int
    {
        if ($designationId <= 0 || (int) ($targetUser->id ?? 0) <= 0) {
            return 0;
        }

        $sourceUser = $this->findDesignationWidgetTemplateUser($designationId, (int) $targetUser->id);
        if (!$sourceUser) {
            return 0;
        }

        $hiddenWidgets = UserDashboardWidget::query()
            ->where('user_id', (int) $sourceUser->id)
            ->where('is_visible', false)
            ->get(['widget_key', 'hidden_at']);

        $copiedCount = 0;
        foreach ($hiddenWidgets as $widget) {
            $widgetKey = trim((string) ($widget->widget_key ?? ''));
            if ($widgetKey === '') {
                continue;
            }

            UserDashboardWidget::query()->updateOrCreate(
                [
                    'user_id' => (int) $targetUser->id,
                    'widget_key' => $widgetKey,
                ],
                [
                    'is_visible' => false,
                    'hidden_at' => $widget->hidden_at ?? now(),
                ]
            );

            $copiedCount++;
        }

        return $copiedCount;
    }

    public function designationWidgetTemplateSummary(Request $request): JsonResponse
    {
        if (!$this->canManageEmployees($request, 'create_employees')) {
            return response()->json(['message' => 'You do not have permission to view designation widget templates.'], 403);
        }

        $validated = $request->validate([
            'designation_id' => 'required|integer|exists:designations,id',
        ]);

        $designationId = (int) $validated['designation_id'];
        $sourceUser = $this->findDesignationWidgetTemplateUser($designationId);

        if (!$sourceUser) {
            return response()->json([
                'designation_id' => $designationId,
                'has_template' => false,
                'hidden_count' => 0,
                'source_user_id' => null,
                'source_employee_id' => null,
                'source_employee_name' => null,
                'source_employee_code' => null,
            ]);
        }

        $employee = $sourceUser->employee;
        $employeeName = trim((string) (($employee->first_name ?? '') . ' ' . ($employee->last_name ?? '')));

        return response()->json([
            'designation_id' => $designationId,
            'has_template' => true,
            'hidden_count' => (int) ($sourceUser->hidden_widgets_count ?? 0),
            'source_user_id' => (int) $sourceUser->id,
            'source_employee_id' => $employee ? (int) $employee->id : null,
            'source_employee_name' => $employeeName !== '' ? $employeeName : null,
            'source_employee_code' => $employee ? (string) ($employee->employee_code ?? '') : null,
        ]);
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Employee::with(['department', 'designation', 'branch', 'wallet', 'user:id,employee_id,email']);
        $this->applyEmployeeAccessScope($query, $request);

        $employees = $query->paginate(15);

        return response()->json($employees);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        if (!$this->canManageEmployees($request, 'create_employees')) {
            return response()->json(['message' => 'You do not have permission to create employees.'], 403);
        }

        $actor = $request->user();
        if (!$actor) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validated();
        $actorEmployee = $actor->employee;

        $requestedBranchId = (int) ($validated['branch_id'] ?? 0);
        $requestedTenantId = (int) ($request->input('tenant_id', 0));

        $resolvedBranchId = (int) ($actor->branch_id ?? optional($actorEmployee)->branch_id ?? 0);
        $resolvedTenantId = (int) ($actor->tenant_id ?? optional($actorEmployee)->tenant_id ?? 0);

        if ($this->canOverrideWalletApprovals($actor)) {
            if ($requestedBranchId > 0) {
                $resolvedBranchId = $requestedBranchId;
            }

            if ($requestedTenantId > 0) {
                $resolvedTenantId = $requestedTenantId;
            }
        }

        if ($resolvedBranchId <= 0 && $requestedBranchId > 0) {
            $resolvedBranchId = $requestedBranchId;
        }

        // Backward compatibility: in this codebase, tenant and branch commonly share company IDs.
        if ($resolvedTenantId <= 0 && $resolvedBranchId > 0) {
            $resolvedTenantId = $resolvedBranchId;
        }

        if ($resolvedTenantId <= 0 || !Company::query()->whereKey($resolvedTenantId)->exists()) {
            return response()->json([
                'message' => 'Unable to resolve a valid tenant for this user. Please contact an administrator.',
            ], 422);
        }

        if ($resolvedBranchId <= 0 || !Company::query()->whereKey($resolvedBranchId)->exists()) {
            return response()->json([
                'message' => 'Unable to resolve a valid branch for this employee. Please choose a valid branch.',
            ], 422);
        }

        // Set default values for required fields
        $employeeData = [
            'tenant_id' => $resolvedTenantId,
            'branch_id' => $resolvedBranchId,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'],
            'mobile' => $validated['phone'] ?? '',
            'reporting_person' => $validated['reporting_person'] ?? null,
            'nic_passport' => $validated['nic_passport'],
            'address' => $validated['address'] ?? '',
            'photo_path' => $validated['photo_path'] ?? null,
            'date_of_birth' => $validated['date_of_birth'] ?? null,
            'gender' => 'other', // Default gender
            'department_id' => $validated['department_id'],
            'designation_id' => $validated['designation_id'],
            'join_date' => $validated['hire_date'],
            'basic_salary' => $validated['basic_salary'],
            'commission' => $validated['commission'] ?? null,
            'commission_base' => $validated['commission_base'] ?? null,
            'monthly_target' => $validated['monthly_target'] ?? null,
            'overtime_payment_per_hour' => $validated['overtime_payment_per_hour'] ?? null,
            'deduction_late_hour' => $validated['deduction_late_hour'] ?? null,
            'epf_employee_contribution' => $validated['epf_employee_contribution'] ?? 8.00,
            'epf_employer_contribution' => $validated['epf_employer_contribution'] ?? 12.00,
            'etf_employee_contribution' => $validated['etf_employee_contribution'] ?? 0.00,
            'etf_employer_contribution' => $validated['etf_employer_contribution'] ?? 3.00,
            'tin' => $validated['tin'] ?? null,
            'tax_applicable' => (bool) ($validated['tax_applicable'] ?? false),
            'tax_relief_eligible' => (bool) ($validated['tax_relief_eligible'] ?? false),
            'apit_tax_amount' => $validated['apit_tax_amount'] ?? null,
            'apit_tax_rate' => $validated['apit_tax_rate'] ?? null,
            'employee_type' => 'full_time', // Default type
            'status' => $validated['status'] ?? 'active',
        ];

        // Generate a collision-safe employee code, including soft-deleted rows.
        $latestCode = Employee::withTrashed()
            ->whereNotNull('employee_code')
            ->where('employee_code', 'like', 'EMP%')
            ->orderByDesc('id')
            ->value('employee_code');

        $nextNumber = 1;
        if (is_string($latestCode) && preg_match('/^EMP(\d+)$/', $latestCode, $matches)) {
            $nextNumber = ((int) $matches[1]) + 1;
        }

        do {
            $candidateCode = 'EMP' . str_pad((string) $nextNumber, 4, '0', STR_PAD_LEFT);
            $nextNumber++;
        } while (Employee::withTrashed()->where('employee_code', $candidateCode)->exists());

        $employeeData['employee_code'] = $candidateCode;

        $employee = DB::transaction(function () use ($validated, $employeeData, $resolvedBranchId) {
            $employee = Employee::create($employeeData);

            // Create user account for the employee.
            $createdUser = User::create([
                'name' => $validated['first_name'] . ' ' . $validated['last_name'],
                'email' => trim((string) $validated['user_id']),
                'password' => Hash::make($validated['password']),
                'employee_id' => $employee->id,
                'branch_id' => $resolvedBranchId,
                'designation_id' => $validated['designation_id'],
            ]);

            $this->copyHiddenWidgetsFromDesignationTemplate($createdUser, (int) ($validated['designation_id'] ?? 0));

            $shouldCreateWallet = (bool) ($validated['create_wallet'] ?? false);
            if ($shouldCreateWallet) {
                $openingBalance = (float) ($validated['wallet_opening_balance'] ?? 0);
                $walletNo = 'EW' . str_pad((string) $employee->id, 6, '0', STR_PAD_LEFT);

                EmployeeWallet::create([
                    'tenant_id' => $employee->tenant_id,
                    'branch_id' => $employee->branch_id,
                    'employee_id' => $employee->id,
                    'wallet_no' => $walletNo,
                    'opening_balance' => $openingBalance,
                    'current_balance' => $openingBalance,
                    'status' => 'active',
                ]);
            }

            return $employee;
        });

        return response()->json($employee->load(['department', 'designation', 'branch', 'wallet', 'user:id,employee_id,email']), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        return response()->json($employee->load(['department', 'designation', 'branch', 'wallet', 'user:id,employee_id,email']));
    }

    /**
     * Get authenticated employee wallet summary for field/collection officers.
     */
    public function myWallet(Request $request): JsonResponse
    {
        $user = $request->user();
        $employeeId = (int) ($user?->employee_id ?? 0);

        if ($employeeId <= 0) {
            return response()->json(['message' => 'No employee profile linked to this account.'], 422);
        }

        $employee = Employee::with('wallet')->find($employeeId);
        if (!$employee || !$employee->wallet) {
            return response()->json(['message' => 'Employee wallet not found.'], 404);
        }

        $wallet = $employee->wallet;

        $bankAccounts = CompanyAccount::query()
            ->where('company_id', (int) ($wallet->branch_id ?? 0))
            ->where('account_type', CompanyAccount::TYPE_BANK)
            ->where('is_active', true)
            ->orderBy('account_name')
            ->get([
                'id',
                'company_id',
                'account_type',
                'account_name',
                'bank_name',
                'account_number',
                'current_balance',
            ]);

        $branchCompanyId = (int) ($wallet->branch_id ?? 0);
        $cashAccounts = CompanyAccount::query()
            ->where('company_id', $branchCompanyId)
            ->whereIn('account_type', [CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_MAIN])
            ->where('is_active', true)
            ->orderBy('account_name')
            ->get([
                'id',
                'company_id',
                'account_type',
                'account_name',
                'bank_name',
                'account_number',
                'current_balance',
            ]);

        $managers = $this->resolveWalletManagersForBranch($branchCompanyId);
        $headOfficeOptions = $this->resolveHeadOfficeHandoverOptions();

        $totalDeposited = (float) EmployeeWalletBankDeposit::query()
            ->where('employee_wallet_id', $wallet->id)
            ->where('status', 'approved')
            ->sum('amount');

        $totalHandedOver = (float) EmployeeWalletCashHandover::query()
            ->where('employee_wallet_id', $wallet->id)
            ->where('status', 'approved')
            ->sum('amount');

        $recentDeposits = EmployeeWalletBankDeposit::query()
            ->with('bankAccount:id,account_name,bank_name,account_number')
            ->where('employee_wallet_id', $wallet->id)
            ->orderByDesc('deposit_date')
            ->orderByDesc('id')
            ->limit(10)
            ->get();

        $recentHandovers = EmployeeWalletCashHandover::query()
            ->with([
                'cashAccount:id,account_name,bank_name,account_number',
                'managerEmployee:id,first_name,last_name,employee_code',
            ])
            ->where('employee_wallet_id', $wallet->id)
            ->orderByDesc('handover_date')
            ->orderByDesc('id')
            ->limit(10)
            ->get();

        return response()->json([
            'wallet' => [
                'id' => (int) $wallet->id,
                'wallet_no' => (string) $wallet->wallet_no,
                'cash_in_hand' => round((float) ($wallet->current_balance ?? 0), 2),
                'total_deposited' => round($totalDeposited, 2),
                'total_handed_over' => round($totalHandedOver, 2),
                'opening_balance' => round((float) ($wallet->opening_balance ?? 0), 2),
                'status' => (string) $wallet->status,
            ],
            'bank_accounts' => $bankAccounts,
            'cash_accounts' => $cashAccounts,
            'managers' => $managers,
            'head_office_options' => $headOfficeOptions,
            'recent_deposits' => $recentDeposits,
            'recent_handovers' => $recentHandovers,
            'pending' => [
                'deposits' => (int) EmployeeWalletBankDeposit::query()
                    ->where('employee_wallet_id', $wallet->id)
                    ->where('status', 'pending')
                    ->count(),
                'handovers' => (int) EmployeeWalletCashHandover::query()
                    ->where('employee_wallet_id', $wallet->id)
                    ->where('status', 'pending')
                    ->count(),
            ],
        ]);
    }

    /**
     * Deposit cash-in-hand from employee wallet to a branch bank account.
     */
    public function depositToBank(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'bank_account_id' => 'required|exists:company_accounts,id',
            'deposit_date' => 'nullable|date',
            'note' => 'nullable|string|max:500',
        ]);

        $user = $request->user();
        $employeeId = (int) ($user?->employee_id ?? 0);
        if ($employeeId <= 0) {
            return response()->json(['message' => 'No employee profile linked to this account.'], 422);
        }

        $amount = round((float) $validated['amount'], 2);
        $summary = null;
        $depositRow = null;

        DB::transaction(function () use (
            $validated,
            $employeeId,
            $amount,
            $user,
            &$summary,
            &$depositRow
        ): void {
            $wallet = EmployeeWallet::query()
                ->where('employee_id', $employeeId)
                ->lockForUpdate()
                ->first();

            if (!$wallet) {
                throw new HttpResponseException(response()->json(['message' => 'Employee wallet not found.'], 404));
            }

            $branchCompanyId = (int) ($wallet->branch_id ?? 0);
            if ($branchCompanyId <= 0) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Branch is not linked for this wallet.',
                ], 422));
            }

            $bankAccount = CompanyAccount::query()
                ->where('id', (int) $validated['bank_account_id'])
                ->where('account_type', CompanyAccount::TYPE_BANK)
                ->where('company_id', $branchCompanyId)
                ->where('is_active', true)
                ->lockForUpdate()
                ->first();

            if (!$bankAccount) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Selected branch bank account is not available for this branch.',
                ], 422));
            }

            $cashInHand = round((float) ($wallet->current_balance ?? 0), 2);
            if ($amount > $cashInHand) {
                throw new HttpResponseException(response()->json(['message' => 'Deposit amount exceeds cash in hand.'], 422));
            }

            $depositRow = EmployeeWalletBankDeposit::create([
                'employee_wallet_id' => (int) $wallet->id,
                'employee_id' => (int) $wallet->employee_id,
                'branch_id' => (int) $wallet->branch_id,
                'bank_account_id' => (int) $bankAccount->id,
                'amount' => $amount,
                'deposit_date' => $validated['deposit_date'] ?? now()->toDateString(),
                'note' => $validated['note'] ?? null,
                'status' => 'pending',
                'created_by' => (int) ($user?->id ?? 0) ?: null,
            ]);

            $totalDeposited = (float) EmployeeWalletBankDeposit::query()
                ->where('employee_wallet_id', $wallet->id)
                ->where('status', 'approved')
                ->sum('amount');

            $summary = [
                'wallet_no' => (string) $wallet->wallet_no,
                'cash_in_hand' => round((float) ($wallet->current_balance ?? 0), 2),
                'total_deposited' => round($totalDeposited, 2),
                'pending_deposits' => (int) EmployeeWalletBankDeposit::query()
                    ->where('employee_wallet_id', $wallet->id)
                    ->where('status', 'pending')
                    ->count(),
                'bank_account_id' => (int) $bankAccount->id,
                'bank_account_name' => (string) $bankAccount->account_name,
                'bank_balance' => round((float) ($bankAccount->current_balance ?? 0), 2),
            ];
        });

        return response()->json([
            'message' => 'Deposit request submitted. Awaiting branch manager approval.',
            'summary' => $summary,
            'deposit' => $depositRow,
        ]);
    }

    /**
     * Handover cash-in-hand from employee wallet to a branch cash/main account.
     */
    public function handoverCash(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'manager_employee_id' => 'required|exists:employees,id',
            'handover_target' => 'nullable|in:branch,head_office',
            'target_branch_id' => 'nullable|integer|exists:companies,id',
            'handover_date' => 'nullable|date',
            'received_by' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:500',
        ]);

        $user = $request->user();
        $employeeId = (int) ($user?->employee_id ?? 0);
        if ($employeeId <= 0) {
            return response()->json(['message' => 'No employee profile linked to this account.'], 422);
        }

        $amount = round((float) $validated['amount'], 2);
        $summary = null;
        $handoverRow = null;

        DB::transaction(function () use (
            $validated,
            $employeeId,
            $amount,
            $user,
            &$summary,
            &$handoverRow
        ): void {
            $wallet = EmployeeWallet::query()
                ->where('employee_id', $employeeId)
                ->lockForUpdate()
                ->first();

            if (!$wallet) {
                throw new HttpResponseException(response()->json(['message' => 'Employee wallet not found.'], 404));
            }

            $branchCompanyId = (int) ($wallet->branch_id ?? 0);
            if ($branchCompanyId <= 0) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Branch is not linked for this wallet.',
                ], 422));
            }

            $handoverTarget = (string) ($validated['handover_target'] ?? 'branch');
            $requestedTargetBranchId = (int) ($validated['target_branch_id'] ?? 0);
            $destinationBranchId = $branchCompanyId;

            if ($handoverTarget === 'head_office') {
                $headOfficeBranchIds = Company::query()
                    ->where('is_main_branch', true)
                    ->pluck('id')
                    ->map(fn ($id) => (int) $id)
                    ->filter(fn ($id) => $id > 0)
                    ->values()
                    ->all();

                if (empty($headOfficeBranchIds)) {
                    $headOfficeBranchIds = Company::query()
                        ->whereRaw('LOWER(name) LIKE ?', ['%head office%'])
                        ->orWhereRaw('LOWER(name) LIKE ?', ['%head-office%'])
                        ->orWhereRaw('LOWER(name) LIKE ?', ['%hq%'])
                        ->pluck('id')
                        ->map(fn ($id) => (int) $id)
                        ->filter(fn ($id) => $id > 0)
                        ->values()
                        ->all();
                }

                if (empty($headOfficeBranchIds)) {
                    throw new HttpResponseException(response()->json([
                        'message' => 'Head office is not configured yet.',
                    ], 422));
                }

                if ($requestedTargetBranchId > 0) {
                    if (!in_array($requestedTargetBranchId, $headOfficeBranchIds, true)) {
                        throw new HttpResponseException(response()->json([
                            'message' => 'Selected head office branch is not valid.',
                        ], 422));
                    }

                    $destinationBranchId = $requestedTargetBranchId;
                } else {
                    $destinationBranchId = (int) ($headOfficeBranchIds[0] ?? 0);
                }
            }

            $cashInHand = round((float) ($wallet->current_balance ?? 0), 2);
            if ($amount > $cashInHand) {
                throw new HttpResponseException(response()->json(['message' => 'Handover amount exceeds cash in hand.'], 422));
            }

            $cashAccount = CompanyAccount::query()
                ->where('company_id', $destinationBranchId)
                ->whereIn('account_type', [CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_MAIN])
                ->where('is_active', true)
                ->orderByRaw("CASE WHEN account_type = 'cash' THEN 0 ELSE 1 END")
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            if (!$cashAccount) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Cash/main account is not available for the selected destination office.',
                ], 422));
            }

            $managerEmployee = Employee::query()
                ->where('id', (int) $validated['manager_employee_id'])
                ->where('branch_id', $destinationBranchId)
                ->first();

            if (!$managerEmployee) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Selected manager is not valid for the selected destination office.',
                ], 422));
            }

            $handoverRow = EmployeeWalletCashHandover::create([
                'employee_wallet_id' => (int) $wallet->id,
                'employee_id' => (int) $wallet->employee_id,
                'branch_id' => $destinationBranchId,
                'cash_account_id' => (int) $cashAccount->id,
                'manager_employee_id' => (int) $managerEmployee->id,
                'amount' => $amount,
                'handover_date' => $validated['handover_date'] ?? now()->toDateString(),
                'received_by' => $validated['received_by'] ?? trim(($managerEmployee->first_name ?? '') . ' ' . ($managerEmployee->last_name ?? '')),
                'note' => $validated['note'] ?? null,
                'status' => 'pending',
                'created_by' => (int) ($user?->id ?? 0) ?: null,
            ]);

            $totalDeposited = (float) EmployeeWalletBankDeposit::query()
                ->where('employee_wallet_id', $wallet->id)
                ->where('status', 'approved')
                ->sum('amount');

            $totalHandedOver = (float) EmployeeWalletCashHandover::query()
                ->where('employee_wallet_id', $wallet->id)
                ->where('status', 'approved')
                ->sum('amount');

            $summary = [
                'wallet_no' => (string) $wallet->wallet_no,
                'cash_in_hand' => round((float) ($wallet->current_balance ?? 0), 2),
                'total_deposited' => round($totalDeposited, 2),
                'total_handed_over' => round($totalHandedOver, 2),
                'pending_handovers' => (int) EmployeeWalletCashHandover::query()
                    ->where('employee_wallet_id', $wallet->id)
                    ->where('status', 'pending')
                    ->count(),
                'handover_target' => $handoverTarget,
                'target_branch_id' => $destinationBranchId,
                'target_cash_account_id' => (int) ($cashAccount->id ?? 0),
                'manager_employee_id' => (int) $managerEmployee->id,
                'manager_name' => trim((string) (($managerEmployee->first_name ?? '') . ' ' . ($managerEmployee->last_name ?? ''))),
                'manager_wallet_balance' => null,
            ];
        });

        return response()->json([
            'message' => ((string) ($summary['handover_target'] ?? 'branch') === 'head_office')
                ? 'Cash handover request submitted. Awaiting head office approval.'
                : 'Cash handover request submitted. Awaiting branch manager approval.',
            'summary' => $summary,
            'handover' => $handoverRow,
        ]);
    }

    /**
     * List pending wallet transactions for branch manager approval.
     */
    public function pendingWalletTransactions(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $branchIds = $this->resolveWalletApprovalBranchIds($user);

        if (empty($branchIds)) {
            return response()->json([
                'deposits' => [],
                'handovers' => [],
                'accepted_handovers' => [],
                'transferred_handovers' => [],
            ]);
        }

        $deposits = EmployeeWalletBankDeposit::query()
            ->with([
                'employee:id,first_name,last_name,employee_code',
                'employee.wallet:id,employee_id,wallet_no,current_balance',
                'bankAccount:id,account_name,bank_name,account_number,current_balance',
            ])
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'pending')
            ->orderByDesc('created_at')
            ->limit(300)
            ->get();

        $handovers = EmployeeWalletCashHandover::query()
            ->with([
                'employee:id,first_name,last_name,employee_code',
                'employee.wallet:id,employee_id,wallet_no,current_balance',
                'managerEmployee:id,first_name,last_name,employee_code',
                'managerEmployee.wallet:id,employee_id,wallet_no,current_balance',
                'cashAccount:id,account_name,bank_name,account_number,current_balance',
            ])
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'pending')
            ->orderByDesc('created_at')
            ->limit(300)
            ->get();

        $acceptedHandovers = EmployeeWalletCashHandover::query()
            ->with([
                'employee:id,first_name,last_name,employee_code',
                'employee.wallet:id,employee_id,wallet_no,current_balance',
                'managerEmployee:id,first_name,last_name,employee_code',
                'managerEmployee.wallet:id,employee_id,wallet_no,current_balance',
                'cashAccount:id,account_name,bank_name,account_number,current_balance',
            ])
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'approved')
            ->whereNull('branch_cash_transferred_at')
            ->orderByDesc('approved_at')
            ->orderByDesc('id')
            ->limit(300)
            ->get();

        $transferredHandovers = EmployeeWalletCashHandover::query()
            ->with([
                'employee:id,first_name,last_name,employee_code',
                'managerEmployee:id,first_name,last_name,employee_code',
                'cashAccount:id,account_name,bank_name,account_number,current_balance',
            ])
            ->whereIn('branch_id', $branchIds)
            ->where('status', 'approved')
            ->whereNotNull('branch_cash_transferred_at')
            ->orderByDesc('branch_cash_transferred_at')
            ->orderByDesc('id')
            ->limit(300)
            ->get();

        return response()->json([
            'deposits' => $deposits,
            'handovers' => $handovers,
            'accepted_handovers' => $acceptedHandovers,
            'transferred_handovers' => $transferredHandovers,
        ]);
    }

    /**
     * Approve pending wallet deposit or handover transactions.
     */
    public function approvePendingWalletTransaction(Request $request, string $type, int $id): JsonResponse
    {
        $validated = $request->validate([
            'approval_note' => 'nullable|string|max:500',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $approvalNote = $validated['approval_note'] ?? null;
        $summary = null;

        DB::transaction(function () use ($type, $id, $user, $approvalNote, &$summary): void {
            if ($type === 'deposit') {
                $row = EmployeeWalletBankDeposit::query()
                    ->where('id', $id)
                    ->where('status', 'pending')
                    ->lockForUpdate()
                    ->first();

                if (!$row) {
                    throw new HttpResponseException(response()->json(['message' => 'Pending deposit request not found.'], 404));
                }

                $branch = Company::query()
                    ->where('id', (int) $row->branch_id)
                    ->first();

                if (!$branch) {
                    throw new HttpResponseException(response()->json(['message' => 'Branch not found for this transaction.'], 404));
                }

                if (!$this->canApproveWalletBranch($user, (int) $branch->id)) {
                    throw new HttpResponseException(response()->json(['message' => 'You are not allowed to approve this transaction.'], 403));
                }

                $wallet = EmployeeWallet::query()
                    ->where('id', (int) $row->employee_wallet_id)
                    ->lockForUpdate()
                    ->first();

                if (!$wallet) {
                    throw new HttpResponseException(response()->json(['message' => 'Employee wallet not found.'], 404));
                }

                $bankAccount = CompanyAccount::query()
                    ->where('id', (int) $row->bank_account_id)
                    ->where('company_id', (int) $row->branch_id)
                    ->where('account_type', CompanyAccount::TYPE_BANK)
                    ->where('is_active', true)
                    ->lockForUpdate()
                    ->first();

                if (!$bankAccount) {
                    throw new HttpResponseException(response()->json(['message' => 'Branch bank account is not available.'], 422));
                }

                $amount = round((float) ($row->amount ?? 0), 2);
                $cashInHand = round((float) ($wallet->current_balance ?? 0), 2);
                if ($amount <= 0 || $amount > $cashInHand) {
                    throw new HttpResponseException(response()->json(['message' => 'Collector cash in hand is insufficient for this approval.'], 422));
                }

                $wallet->current_balance = round($cashInHand - $amount, 2);
                $wallet->save();

                $bankAccount->current_balance = round((float) ($bankAccount->current_balance ?? 0) + $amount, 2);
                $bankAccount->save();

                $row->status = 'approved';
                $row->approved_by = (int) $user->id;
                $row->approved_at = now();
                $row->approval_note = $approvalNote;
                $row->save();

                $summary = [
                    'type' => 'deposit',
                    'id' => (int) $row->id,
                    'amount' => $amount,
                    'wallet_cash_in_hand' => round((float) ($wallet->current_balance ?? 0), 2),
                    'branch_account_balance' => round((float) ($bankAccount->current_balance ?? 0), 2),
                ];

                return;
            }

            if ($type === 'handover') {
                $row = EmployeeWalletCashHandover::query()
                    ->where('id', $id)
                    ->where('status', 'pending')
                    ->lockForUpdate()
                    ->first();

                if (!$row) {
                    throw new HttpResponseException(response()->json(['message' => 'Pending handover request not found.'], 404));
                }

                $branch = Company::query()
                    ->where('id', (int) $row->branch_id)
                    ->first();

                if (!$branch) {
                    throw new HttpResponseException(response()->json(['message' => 'Branch not found for this transaction.'], 404));
                }

                if (!$this->canApproveWalletBranch($user, (int) $branch->id)) {
                    throw new HttpResponseException(response()->json(['message' => 'You are not allowed to approve this transaction.'], 403));
                }

                $wallet = EmployeeWallet::query()
                    ->where('id', (int) $row->employee_wallet_id)
                    ->lockForUpdate()
                    ->first();

                if (!$wallet) {
                    throw new HttpResponseException(response()->json(['message' => 'Employee wallet not found.'], 404));
                }

                $managerEmployee = Employee::query()
                    ->where('id', (int) ($row->manager_employee_id ?? 0))
                    ->where('branch_id', (int) $row->branch_id)
                    ->first();

                if (!$managerEmployee) {
                    throw new HttpResponseException(response()->json(['message' => 'Manager employee is not valid for this branch.'], 422));
                }

                $amount = round((float) ($row->amount ?? 0), 2);
                $cashInHand = round((float) ($wallet->current_balance ?? 0), 2);
                if ($amount <= 0 || $amount > $cashInHand) {
                    throw new HttpResponseException(response()->json(['message' => 'Collector cash in hand is insufficient for this approval.'], 422));
                }

                $wallet->current_balance = round($cashInHand - $amount, 2);
                $wallet->save();

                $managerTenantId = (int) ($managerEmployee->tenant_id ?? $wallet->tenant_id ?? $row->branch_id);
                $managerBranchId = (int) ($managerEmployee->branch_id ?? $row->branch_id);
                $managerWallet = $this->ensureEmployeeWallet($managerEmployee, $managerTenantId, $managerBranchId);
                $managerWallet->current_balance = round((float) ($managerWallet->current_balance ?? 0) + $amount, 2);
                $managerWallet->save();

                $row->status = 'approved';
                $row->approved_by = (int) $user->id;
                $row->approved_at = now();
                $row->approval_note = $approvalNote;
                $row->save();

                $summary = [
                    'type' => 'handover',
                    'id' => (int) $row->id,
                    'amount' => $amount,
                    'wallet_cash_in_hand' => round((float) ($wallet->current_balance ?? 0), 2),
                    'branch_account_balance' => null,
                    'manager_wallet_balance' => round((float) ($managerWallet->current_balance ?? 0), 2),
                ];

                return;
            }

            throw new HttpResponseException(response()->json(['message' => 'Unsupported transaction type.'], 422));
        });

        return response()->json([
            'message' => 'Transaction approved successfully.',
            'summary' => $summary,
        ]);
    }

    /**
     * Reject pending wallet deposit or handover transactions.
     */
    public function rejectPendingWalletTransaction(Request $request, string $type, int $id): JsonResponse
    {
        $validated = $request->validate([
            'rejection_reason' => 'required|string|max:500',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $rejectionReason = trim((string) ($validated['rejection_reason'] ?? ''));
        if ($rejectionReason === '') {
            throw new HttpResponseException(response()->json(['message' => 'Rejection reason is required.'], 422));
        }

        $summary = null;

        DB::transaction(function () use ($type, $id, $user, $rejectionReason, &$summary): void {
            if ($type === 'deposit') {
                $row = EmployeeWalletBankDeposit::query()
                    ->where('id', $id)
                    ->where('status', 'pending')
                    ->lockForUpdate()
                    ->first();

                if (!$row) {
                    throw new HttpResponseException(response()->json(['message' => 'Pending deposit request not found.'], 404));
                }

                $branch = Company::query()
                    ->where('id', (int) $row->branch_id)
                    ->first();

                if (!$branch) {
                    throw new HttpResponseException(response()->json(['message' => 'Branch not found for this transaction.'], 404));
                }

                if (!$this->canApproveWalletBranch($user, (int) $branch->id)) {
                    throw new HttpResponseException(response()->json(['message' => 'You are not allowed to reject this transaction.'], 403));
                }

                $row->status = 'rejected';
                $row->approved_by = (int) $user->id;
                $row->approved_at = now();
                $row->approval_note = $rejectionReason;
                $row->save();

                $summary = [
                    'type' => 'deposit',
                    'id' => (int) $row->id,
                    'amount' => round((float) ($row->amount ?? 0), 2),
                    'rejection_reason' => $rejectionReason,
                ];

                return;
            }

            if ($type === 'handover') {
                $row = EmployeeWalletCashHandover::query()
                    ->where('id', $id)
                    ->where('status', 'pending')
                    ->lockForUpdate()
                    ->first();

                if (!$row) {
                    throw new HttpResponseException(response()->json(['message' => 'Pending handover request not found.'], 404));
                }

                $branch = Company::query()
                    ->where('id', (int) $row->branch_id)
                    ->first();

                if (!$branch) {
                    throw new HttpResponseException(response()->json(['message' => 'Branch not found for this transaction.'], 404));
                }

                if (!$this->canApproveWalletBranch($user, (int) $branch->id)) {
                    throw new HttpResponseException(response()->json(['message' => 'You are not allowed to reject this transaction.'], 403));
                }

                $row->status = 'rejected';
                $row->approved_by = (int) $user->id;
                $row->approved_at = now();
                $row->approval_note = $rejectionReason;
                $row->save();

                $summary = [
                    'type' => 'handover',
                    'id' => (int) $row->id,
                    'amount' => round((float) ($row->amount ?? 0), 2),
                    'rejection_reason' => $rejectionReason,
                ];

                return;
            }

            throw new HttpResponseException(response()->json(['message' => 'Unsupported transaction type.'], 422));
        });

        return response()->json([
            'message' => 'Transaction rejected successfully.',
            'summary' => $summary,
        ]);
    }

    /**
     * Transfer an accepted handover amount into branch cash/main account.
     */
    public function transferAcceptedHandoverToBranchCash(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'target_branch_id' => 'nullable|integer|exists:companies,id',
            'target_account_type' => 'nullable|in:cash,main',
        ]);

        $targetBranchIdFromRequest = array_key_exists('target_branch_id', $validated)
            ? (int) $validated['target_branch_id']
            : null;
        $targetAccountType = array_key_exists('target_account_type', $validated)
            ? (string) $validated['target_account_type']
            : null;

        $summary = null;

        DB::transaction(function () use ($id, $user, $targetBranchIdFromRequest, $targetAccountType, &$summary): void {
            $row = EmployeeWalletCashHandover::query()
                ->where('id', $id)
                ->where('status', 'approved')
                ->lockForUpdate()
                ->first();

            if (!$row) {
                throw new HttpResponseException(response()->json(['message' => 'Accepted handover not found.'], 404));
            }

            if (!empty($row->branch_cash_transferred_at)) {
                throw new HttpResponseException(response()->json(['message' => 'This handover is already transferred to branch cash account.'], 422));
            }

            $branch = Company::query()
                ->where('id', (int) $row->branch_id)
                ->first();

            if (!$branch) {
                throw new HttpResponseException(response()->json(['message' => 'Branch not found for this handover.'], 404));
            }

            if (!$this->canApproveWalletBranch($user, (int) $branch->id)) {
                throw new HttpResponseException(response()->json(['message' => 'You are not allowed to transfer this handover.'], 403));
            }

            $destinationBranchId = $targetBranchIdFromRequest ?: (int) $row->branch_id;
            $destinationBranch = Company::query()
                ->where('id', $destinationBranchId)
                ->first();

            if (!$destinationBranch) {
                throw new HttpResponseException(response()->json(['message' => 'Destination branch not found.'], 404));
            }

            if (!$this->canApproveWalletBranch($user, (int) $destinationBranch->id)) {
                throw new HttpResponseException(response()->json(['message' => 'You are not allowed to transfer funds to the selected branch.'], 403));
            }

            $managerEmployee = Employee::query()
                ->where('id', (int) ($row->manager_employee_id ?? 0))
                ->where('branch_id', (int) $row->branch_id)
                ->first();

            if (!$managerEmployee) {
                throw new HttpResponseException(response()->json(['message' => 'Manager employee is not valid for this branch.'], 422));
            }

            $managerWallet = EmployeeWallet::query()
                ->where('employee_id', (int) $managerEmployee->id)
                ->lockForUpdate()
                ->first();

            if (!$managerWallet) {
                throw new HttpResponseException(response()->json(['message' => 'Manager wallet not found.'], 422));
            }

            $cashAccountId = (int) ($row->cash_account_id ?? 0);

            $preferredAccountType = $targetAccountType ?: CompanyAccount::TYPE_CASH;

            $preferredCashAccount = CompanyAccount::query()
                ->where('company_id', $destinationBranchId)
                ->where('account_type', $preferredAccountType)
                ->where('is_active', true)
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            $linkedAccount = null;
            if ($cashAccountId > 0 && !$targetBranchIdFromRequest && !$targetAccountType) {
                $linkedAccount = CompanyAccount::query()
                    ->where('id', $cashAccountId)
                    ->where('company_id', $destinationBranchId)
                    ->whereIn('account_type', [CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_MAIN])
                    ->where('is_active', true)
                    ->lockForUpdate()
                    ->first();
            }

            $cashAccount = $preferredCashAccount ?: $linkedAccount;

            if (!$cashAccount) {
                $cashAccount = CompanyAccount::query()
                    ->where('company_id', $destinationBranchId)
                    ->whereIn('account_type', [CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_MAIN])
                    ->where('is_active', true)
                    ->orderByRaw("CASE WHEN account_type = 'cash' THEN 0 ELSE 1 END")
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->first();
            }

            if (!$cashAccount) {
                throw new HttpResponseException(response()->json(['message' => 'Branch cash/main account is not available.'], 422));
            }

            $amount = round((float) ($row->amount ?? 0), 2);
            $managerBalance = round((float) ($managerWallet->current_balance ?? 0), 2);
            if ($amount <= 0 || $amount > $managerBalance) {
                throw new HttpResponseException(response()->json(['message' => 'Manager wallet has insufficient balance for transfer.'], 422));
            }

            $managerWallet->current_balance = round($managerBalance - $amount, 2);
            $managerWallet->save();

            $cashAccount->current_balance = round((float) ($cashAccount->current_balance ?? 0) + $amount, 2);
            $cashAccount->save();

            $row->cash_account_id = (int) $cashAccount->id;
            $row->branch_cash_transferred_at = now();
            $row->branch_cash_transferred_by = (int) $user->id;
            $row->save();

            $summary = [
                'handover_id' => (int) $row->id,
                'amount' => $amount,
                'manager_wallet_balance' => round((float) ($managerWallet->current_balance ?? 0), 2),
                'source_branch_id' => (int) $row->branch_id,
                'branch_cash_account_id' => (int) $cashAccount->id,
                'target_branch_id' => $destinationBranchId,
                'target_branch_name' => (string) ($destinationBranch->name ?? ''),
                'target_account_type' => (string) ($cashAccount->account_type ?? ''),
                'branch_cash_account_balance' => round((float) ($cashAccount->current_balance ?? 0), 2),
            ];
        });

        return response()->json([
            'message' => 'Accepted handover transferred to branch cash account successfully.',
            'summary' => $summary,
        ]);
    }

    /**
     * Create wallet for an existing employee.
     */
    public function createWallet(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees') && !$this->canManageEmployees($request, 'create_employees')) {
            return response()->json(['message' => 'You do not have permission to create employee wallets.'], 403);
        }

        $validated = $request->validate([
            'opening_balance' => 'nullable|numeric|min:0',
        ]);

        if ($employee->wallet()->exists()) {
            return response()->json(['message' => 'Wallet already exists for this employee.'], 422);
        }

        $openingBalance = (float) ($validated['opening_balance'] ?? 0);
        $baseWalletNo = 'EW' . str_pad((string) $employee->id, 6, '0', STR_PAD_LEFT);
        $walletNo = $baseWalletNo;
        $suffix = 1;

        while (EmployeeWallet::where('wallet_no', $walletNo)->exists()) {
            $walletNo = $baseWalletNo . '-' . $suffix;
            $suffix++;
        }

        EmployeeWallet::create([
            'tenant_id' => $employee->tenant_id,
            'branch_id' => $employee->branch_id,
            'employee_id' => $employee->id,
            'wallet_no' => $walletNo,
            'opening_balance' => $openingBalance,
            'current_balance' => $openingBalance,
            'status' => 'active',
        ]);

        return response()->json([
            'message' => 'Employee wallet created successfully.',
            'employee' => $employee->fresh()->load(['department', 'designation', 'branch', 'wallet']),
        ], 201);
    }

    /**
     * Update wallet values for an employee (admin only).
     */
    public function updateWallet(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        $user = $request->user();
        if (!$user || !$user->isSystemAdmin()) {
            return response()->json(['message' => 'Only administrators can edit wallet values.'], 403);
        }

        $validated = $request->validate([
            'current_balance' => 'required|numeric|min:0',
            'opening_balance' => 'nullable|numeric|min:0',
            'status' => 'nullable|in:active,inactive',
        ]);

        $wallet = EmployeeWallet::query()
            ->where('employee_id', (int) $employee->id)
            ->first();

        if (!$wallet) {
            return response()->json(['message' => 'Wallet not found for this employee.'], 404);
        }

        DB::transaction(function () use ($wallet, $validated): void {
            $lockedWallet = EmployeeWallet::query()
                ->where('id', (int) $wallet->id)
                ->lockForUpdate()
                ->first();

            if (!$lockedWallet) {
                throw new HttpResponseException(response()->json(['message' => 'Wallet not found for this employee.'], 404));
            }

            $lockedWallet->current_balance = round((float) $validated['current_balance'], 2);

            if (array_key_exists('opening_balance', $validated) && $validated['opening_balance'] !== null) {
                $lockedWallet->opening_balance = round((float) $validated['opening_balance'], 2);
            }

            if (!empty($validated['status'])) {
                $lockedWallet->status = (string) $validated['status'];
            }

            $lockedWallet->save();
        });

        return response()->json([
            'message' => 'Employee wallet updated successfully.',
            'wallet' => $wallet->fresh(),
            'employee' => $employee->fresh()->load(['department', 'designation', 'branch', 'wallet']),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'edit_employees')) {
            return response()->json(['message' => 'You do not have permission to edit employees.'], 403);
        }

        $validated = $request->validate([
            'first_name' => 'sometimes|required|string|max:255',
            'last_name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|required|email|unique:employees,email,' . $employee->id,
            'user_id' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('users', 'email')->ignore((int) ($employee->user?->id ?? 0)),
            ],
            'nic_passport' => 'sometimes|required|string|max:100|unique:employees,nic_passport,' . $employee->id,
            'password' => 'nullable|string|min:8',
            'phone' => 'nullable|string|max:20',
            'reporting_person' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'date_of_birth' => 'nullable|date|before:today',
            'hire_date' => 'sometimes|required|date',
            'basic_salary' => 'sometimes|required|numeric|min:0',
            'commission' => 'nullable|numeric|min:0|max:100',
            'commission_base' => 'nullable|in:company_profit,own_business',
            'monthly_target' => 'nullable|numeric|min:0',
            'overtime_payment_per_hour' => 'nullable|numeric|min:0',
            'deduction_late_hour' => 'nullable|numeric|min:0',
            'epf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'epf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'tin' => 'nullable|string|max:50',
            'tax_applicable' => 'nullable|boolean',
            'tax_relief_eligible' => 'nullable|boolean',
            'apit_tax_amount' => 'nullable|numeric|min:0',
            'apit_tax_rate' => 'nullable|numeric|min:0|max:100',
            'department_id' => 'sometimes|required|exists:departments,id',
            'designation_id' => 'sometimes|required|exists:designations,id',
            'branch_id' => 'sometimes|required|exists:companies,id',
            'status' => 'in:active,inactive',
        ]);

        // Map frontend fields to backend fields
        $updateData = [
            'first_name' => $validated['first_name'] ?? $employee->first_name,
            'last_name' => $validated['last_name'] ?? $employee->last_name,
            'email' => $validated['email'] ?? $employee->email,
            'nic_passport' => $validated['nic_passport'] ?? $employee->nic_passport,
            'mobile' => $validated['phone'] ?? $employee->mobile,
            'reporting_person' => array_key_exists('reporting_person', $validated)
                ? ($validated['reporting_person'] ?: null)
                : $employee->reporting_person,
            'address' => $validated['address'] ?? $employee->address,
            'date_of_birth' => $validated['date_of_birth'] ?? $employee->date_of_birth,
            'department_id' => $validated['department_id'] ?? $employee->department_id,
            'designation_id' => $validated['designation_id'] ?? $employee->designation_id,
            'branch_id' => $validated['branch_id'] ?? $employee->branch_id,
            'join_date' => $validated['hire_date'] ?? $employee->join_date,
            'basic_salary' => $validated['basic_salary'] ?? $employee->basic_salary,
            'commission' => $validated['commission'] ?? $employee->commission,
            'commission_base' => $validated['commission_base'] ?? $employee->commission_base,
            'monthly_target' => array_key_exists('monthly_target', $validated) ? ($validated['monthly_target'] ?: null) : $employee->monthly_target,
            'overtime_payment_per_hour' => $validated['overtime_payment_per_hour'] ?? $employee->overtime_payment_per_hour,
            'deduction_late_hour' => $validated['deduction_late_hour'] ?? $employee->deduction_late_hour,
            'epf_employee_contribution' => $validated['epf_employee_contribution'] ?? $employee->epf_employee_contribution,
            'epf_employer_contribution' => $validated['epf_employer_contribution'] ?? $employee->epf_employer_contribution,
            'etf_employee_contribution' => $validated['etf_employee_contribution'] ?? $employee->etf_employee_contribution,
            'etf_employer_contribution' => $validated['etf_employer_contribution'] ?? $employee->etf_employer_contribution,
            'tin' => array_key_exists('tin', $validated) ? ($validated['tin'] ?: null) : $employee->tin,
            'tax_applicable' => array_key_exists('tax_applicable', $validated)
                ? (bool) $validated['tax_applicable']
                : (bool) $employee->tax_applicable,
            'tax_relief_eligible' => array_key_exists('tax_relief_eligible', $validated)
                ? (bool) $validated['tax_relief_eligible']
                : (bool) $employee->tax_relief_eligible,
            'apit_tax_amount' => array_key_exists('apit_tax_amount', $validated) ? ($validated['apit_tax_amount'] ?: null) : $employee->apit_tax_amount,
            'apit_tax_rate' => array_key_exists('apit_tax_rate', $validated) ? ($validated['apit_tax_rate'] ?: null) : $employee->apit_tax_rate,
            'status' => $validated['status'] ?? $employee->status,
        ];

        $employee->update($updateData);

        if (array_key_exists('user_id', $validated) && $employee->user) {
            $employee->user->update(['email' => trim((string) $validated['user_id'])]);
        }

        if (!empty($validated['password']) && $employee->user) {
            $employee->user->update(['password' => Hash::make($validated['password'])]);
        }

        // Update user's designation if changed
        if (isset($validated['designation_id']) && $employee->user) {
            $employee->user->update(['designation_id' => $validated['designation_id']]);
        }

        // Keep auth scope aligned with employee branch reassignment.
        if (array_key_exists('branch_id', $validated) && $employee->user) {
            $employee->user->update(['branch_id' => (int) $validated['branch_id']]);
        }

        return response()->json($employee->load(['department', 'designation', 'branch', 'user:id,employee_id,email']));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        if (!$this->canAccessEmployee($request, $employee)) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (!$this->canManageEmployees($request, 'delete_employees')) {
            return response()->json(['message' => 'You do not have permission to delete employees.'], 403);
        }

        DB::transaction(function () use ($employee): void {
            $employeeId = (int) $employee->id;

            // Remove or nullify dependent rows that don't have ON DELETE CASCADE.
            DB::table('attendance')->where('employee_id', $employeeId)->delete();
            DB::table('payrolls')->where('employee_id', $employeeId)->delete();
            DB::table('leaves')->where('employee_id', $employeeId)->delete();

            if (Schema::hasColumn('leaves', 'approved_by')) {
                DB::table('leaves')->where('approved_by', $employeeId)->update(['approved_by' => null]);
            }
            if (Schema::hasColumn('leaves', 'section_head_approved_by')) {
                DB::table('leaves')->where('section_head_approved_by', $employeeId)->update(['section_head_approved_by' => null]);
            }
            if (Schema::hasColumn('leaves', 'hr_approved_by')) {
                DB::table('leaves')->where('hr_approved_by', $employeeId)->update(['hr_approved_by' => null]);
            }

            // Prevent FK failures by removing the linked login account first.
            if ($employee->user) {
                $employee->user->delete();
            }

            // SoftDeletes model: forceDelete removes physical row from employees table.
            $employee->forceDelete();
        });

        return response()->json(['message' => 'Employee deleted successfully and removed from database.']);
    }
}
