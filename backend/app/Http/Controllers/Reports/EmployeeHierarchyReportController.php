<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyLeadershipAssignment;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeHierarchyReportController extends Controller
{
    private function normalizeText(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9]+/', ' ', $normalized) ?? '';
        $normalized = preg_replace('/\s+/', ' ', $normalized) ?? '';

        return trim($normalized);
    }

    private function isTopLevelUser(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $tokens = [
            $this->normalizeText((string) optional($user->designation)->name),
        ];

        if (method_exists($user, 'roles')) {
            foreach ($user->roles()->pluck('name') as $roleName) {
                $tokens[] = $this->normalizeText((string) $roleName);
            }
        }

        $keywords = [
            'super admin',
            'system admin',
            'admin',
            'owner',
            'ceo',
            'director',
            'regional manager',
            'senior management',
            'business owner',
        ];

        foreach ($tokens as $token) {
            if ($token === '') {
                continue;
            }

            foreach ($keywords as $keyword) {
                if (str_contains($token, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return array<int, string>
     */
    private function userAccessTokens(?object $user): array
    {
        if (!$user) {
            return [];
        }

        $tokens = [
            $this->normalizeText((string) optional($user->designation)->name),
        ];

        if (method_exists($user, 'roles')) {
            foreach ($user->roles()->pluck('name') as $roleName) {
                $tokens[] = $this->normalizeText((string) $roleName);
            }
        }

        return array_values(array_filter(array_unique($tokens), static fn (string $item) => $item !== ''));
    }

    /**
     * @param  array<int, string>  $tokens
     * @param  array<int, string>  $keywords
     */
    private function tokenMatches(array $tokens, array $keywords): bool
    {
        foreach ($tokens as $token) {
            foreach ($keywords as $keyword) {
                if (str_contains($token, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function isRegionalManagerUser(?object $user): bool
    {
        $tokens = $this->userAccessTokens($user);
        if (empty($tokens)) {
            return false;
        }

        return $this->tokenMatches($tokens, ['regional manager', 'regional head', 'regional']);
    }

    private function isBranchManagerUser(?object $user): bool
    {
        $tokens = $this->userAccessTokens($user);
        if (empty($tokens)) {
            return false;
        }

        return $this->tokenMatches($tokens, ['branch manager', 'bank manager', 'manager']);
    }

    /**
     * @return array<int, int>
     */
    private function resolveRegionalBranchIds(int $userId): array
    {
        if ($userId <= 0) {
            return [];
        }

        $direct = Company::query()
            ->where('regional_manager_user_id', $userId)
            ->pluck('id')
            ->map(static fn ($id) => (int) $id)
            ->all();

        $assigned = Company::query()
            ->whereHas('leadershipAssignments', function ($query) use ($userId) {
                $query->where('user_id', $userId)
                    ->where('role_type', CompanyLeadershipAssignment::ROLE_REGIONAL_MANAGER);
            })
            ->pluck('id')
            ->map(static fn ($id) => (int) $id)
            ->all();

        $merged = array_values(array_unique(array_merge($direct, $assigned)));
        sort($merged);

        return $merged;
    }

    /**
     * @return array<int, int>
     */
    private function resolveBranchManagerBranchIds(int $userId, ?int $fallbackBranchId): array
    {
        $ids = [];

        if ($userId > 0) {
            $managed = Company::query()
                ->where('manager_user_id', $userId)
                ->pluck('id')
                ->map(static fn ($id) => (int) $id)
                ->all();
            $ids = array_merge($ids, $managed);
        }

        if ($fallbackBranchId !== null && $fallbackBranchId > 0) {
            $ids[] = $fallbackBranchId;
        }

        $ids = array_values(array_unique(array_filter($ids, static fn (int $id) => $id > 0)));
        sort($ids);

        return $ids;
    }

    private function employeeName(object $employee): string
    {
        $name = trim(((string) $employee->first_name) . ' ' . ((string) $employee->last_name));
        if ($name !== '') {
            return $name;
        }

        return trim((string) $employee->email) !== '' ? (string) $employee->email : ('Employee #' . (int) $employee->id);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isTopLevel = $this->isTopLevelUser($user);
        $isRegionalManager = !$isTopLevel && $this->isRegionalManagerUser($user);
        $isBranchManager = !$isTopLevel && !$isRegionalManager && $this->isBranchManagerUser($user);

        $userId = (int) ($user?->id ?? 0);
        $userBranchId = (int) ($user?->branch_id ?? 0);
        $requestedBranchId = (int) $request->get('branch_id', 0);

        $scopeType = 'branch_employee';
        $scopeLabel = 'Branch Employee Scope';
        $allowedBranchIds = [];
        $canSwitchBranch = false;
        $scopedBranchId = null;

        if ($isTopLevel) {
            $scopeType = 'top_level';
            $scopeLabel = 'Top Level Scope';
            $canSwitchBranch = true;
            $scopedBranchId = $requestedBranchId > 0 ? $requestedBranchId : null;
        } elseif ($isRegionalManager) {
            $scopeType = 'regional_manager';
            $scopeLabel = 'Regional Manager Scope';
            $allowedBranchIds = $this->resolveRegionalBranchIds($userId);

            if (empty($allowedBranchIds) && $userBranchId > 0) {
                $allowedBranchIds[] = $userBranchId;
            }

            $canSwitchBranch = count($allowedBranchIds) > 1;
            if ($requestedBranchId > 0 && in_array($requestedBranchId, $allowedBranchIds, true)) {
                $scopedBranchId = $requestedBranchId;
            } else {
                $scopedBranchId = $allowedBranchIds[0] ?? null;
            }
        } elseif ($isBranchManager) {
            $scopeType = 'branch_manager';
            $scopeLabel = 'Branch Manager Scope';
            $allowedBranchIds = $this->resolveBranchManagerBranchIds($userId, $userBranchId > 0 ? $userBranchId : null);
            $canSwitchBranch = count($allowedBranchIds) > 1;

            if ($requestedBranchId > 0 && in_array($requestedBranchId, $allowedBranchIds, true)) {
                $scopedBranchId = $requestedBranchId;
            } else {
                $scopedBranchId = $allowedBranchIds[0] ?? null;
            }
        } else {
            if ($userBranchId > 0) {
                $allowedBranchIds[] = $userBranchId;
                $scopedBranchId = $userBranchId;
            }
        }

        $allowedBranchIds = array_values(array_unique(array_map(static fn ($id) => (int) $id, $allowedBranchIds)));
        sort($allowedBranchIds);

        $allowedBranchRecords = empty($allowedBranchIds)
            ? []
            : Company::query()
                ->whereIn('id', $allowedBranchIds)
                ->orderBy('name')
                ->get(['id', 'name']);

        $allowedBranches = $allowedBranchRecords
            ->map(static fn (Company $company) => [
                'id' => (int) $company->id,
                'name' => (string) ($company->name ?? ''),
            ])
            ->values()
            ->all();

        $query = Employee::query()
            ->with([
                'designation:id,name',
                'branch:id,name',
                'user:id,employee_id,email',
                'wallet:id,employee_id,opening_balance,current_balance,status,wallet_no',
            ])
            ->orderBy('first_name')
            ->orderBy('last_name');

        if (!$isTopLevel && empty($allowedBranchIds) && $scopedBranchId === null) {
            $query->whereRaw('1 = 0');
        }

        if (!empty($allowedBranchIds)) {
            $query->whereIn('branch_id', $allowedBranchIds);
        }

        if ($scopedBranchId !== null) {
            $query->where('branch_id', $scopedBranchId);
        }

        $employees = $query->get();

        $employeeById = [];
        $employeeByCode = [];
        $employeeByEmail = [];
        $employeeByName = [];

        foreach ($employees as $employee) {
            $id = (int) $employee->id;
            $code = strtoupper(trim((string) ($employee->employee_code ?? '')));
            $email = strtolower(trim((string) ($employee->email ?? optional($employee->user)->email ?? '')));
            $name = $this->normalizeText($this->employeeName($employee));

            $employeeById[$id] = $employee;

            if ($code !== '') {
                $employeeByCode[$code] = $employee;
            }
            if ($email !== '') {
                $employeeByEmail[$email] = $employee;
            }
            if ($name !== '' && !isset($employeeByName[$name])) {
                $employeeByName[$name] = $employee;
            }
        }

        $managerIdByEmployeeId = [];

        foreach ($employees as $employee) {
            $employeeId = (int) $employee->id;
            $managerId = null;
            $reporting = trim((string) ($employee->reporting_person ?? ''));

            if ($reporting !== '') {
                if (ctype_digit($reporting)) {
                    $candidateId = (int) $reporting;
                    if (isset($employeeById[$candidateId])) {
                        $managerId = $candidateId;
                    }
                }

                if ($managerId === null) {
                    $reportingCode = strtoupper($reporting);
                    if (isset($employeeByCode[$reportingCode])) {
                        $managerId = (int) $employeeByCode[$reportingCode]->id;
                    }
                }

                if ($managerId === null) {
                    $reportingEmail = strtolower($reporting);
                    if (isset($employeeByEmail[$reportingEmail])) {
                        $managerId = (int) $employeeByEmail[$reportingEmail]->id;
                    }
                }

                if ($managerId === null) {
                    $reportingName = $this->normalizeText($reporting);
                    if ($reportingName !== '' && isset($employeeByName[$reportingName])) {
                        $managerId = (int) $employeeByName[$reportingName]->id;
                    }
                }
            }

            if ($managerId !== null && $managerId === $employeeId) {
                $managerId = null;
            }

            $managerIdByEmployeeId[$employeeId] = $managerId;
        }

        $childrenByManager = [];
        foreach ($employees as $employee) {
            $employeeId = (int) $employee->id;
            $managerId = $managerIdByEmployeeId[$employeeId] ?? null;
            if ($managerId === null) {
                continue;
            }

            if (!isset($childrenByManager[$managerId])) {
                $childrenByManager[$managerId] = [];
            }
            $childrenByManager[$managerId][] = $employeeId;
        }

        $levels = [];
        $queue = [];

        foreach ($employees as $employee) {
            $employeeId = (int) $employee->id;
            $managerId = $managerIdByEmployeeId[$employeeId] ?? null;
            if ($managerId === null || !isset($employeeById[$managerId])) {
                $levels[$employeeId] = 0;
                $queue[] = $employeeId;
            }
        }

        while (!empty($queue)) {
            $managerId = array_shift($queue);
            $managerLevel = (int) ($levels[$managerId] ?? 0);
            $children = $childrenByManager[$managerId] ?? [];

            foreach ($children as $childId) {
                if (!isset($levels[$childId])) {
                    $levels[$childId] = $managerLevel + 1;
                    $queue[] = $childId;
                }
            }
        }

        foreach ($employees as $employee) {
            $employeeId = (int) $employee->id;
            if (!isset($levels[$employeeId])) {
                $levels[$employeeId] = 0;
            }
        }

        $descendantMemo = [];
        $countDescendants = function (int $employeeId, array $trail = []) use (&$countDescendants, &$descendantMemo, $childrenByManager): int {
            if (isset($descendantMemo[$employeeId])) {
                return $descendantMemo[$employeeId];
            }

            if (in_array($employeeId, $trail, true)) {
                return 0;
            }

            $children = $childrenByManager[$employeeId] ?? [];
            $count = count($children);

            $nextTrail = $trail;
            $nextTrail[] = $employeeId;

            foreach ($children as $childId) {
                $count += $countDescendants($childId, $nextTrail);
            }

            $descendantMemo[$employeeId] = $count;
            return $count;
        };

        $rows = [];
        $managerOptions = [];
        $levelsSummary = [];

        foreach ($employees as $employee) {
            $employeeId = (int) $employee->id;
            $managerId = $managerIdByEmployeeId[$employeeId] ?? null;
            $managerEmployee = $managerId !== null ? ($employeeById[$managerId] ?? null) : null;
            $employeeName = $this->employeeName($employee);
            $directReports = count($childrenByManager[$employeeId] ?? []);
            $totalReports = $countDescendants($employeeId);
            $level = (int) ($levels[$employeeId] ?? 0);

            $levelsSummary[$level] = (int) ($levelsSummary[$level] ?? 0) + 1;

            if ($directReports > 0) {
                $managerOptions[] = [
                    'employee_id' => $employeeId,
                    'employee_code' => (string) ($employee->employee_code ?? ''),
                    'name' => $employeeName,
                    'direct_reports' => $directReports,
                    'total_reports' => $totalReports,
                ];
            }

            $rows[] = [
                'employee_id' => $employeeId,
                'employee_code' => (string) ($employee->employee_code ?? ''),
                'employee_name' => $employeeName,
                'employee_email' => (string) ($employee->email ?? optional($employee->user)->email ?? ''),
                'mobile' => (string) ($employee->mobile ?? ''),
                'status' => (string) ($employee->status ?? ''),
                'designation' => (string) optional($employee->designation)->name,
                'branch_id' => (int) ($employee->branch_id ?? 0),
                'branch_name' => (string) optional($employee->branch)->name,
                'monthly_target' => (float) ($employee->monthly_target ?? 0),
                'wallet_no' => (string) optional($employee->wallet)->wallet_no,
                'wallet_status' => (string) optional($employee->wallet)->status,
                'wallet_opening_balance' => (float) (optional($employee->wallet)->opening_balance ?? 0),
                'wallet_current_balance' => (float) (optional($employee->wallet)->current_balance ?? 0),
                'reporting_person' => (string) ($employee->reporting_person ?? ''),
                'manager_employee_id' => $managerEmployee ? (int) $managerEmployee->id : null,
                'manager_employee_code' => $managerEmployee ? (string) ($managerEmployee->employee_code ?? '') : null,
                'manager_name' => $managerEmployee ? $this->employeeName($managerEmployee) : null,
                'level' => $level,
                'direct_reports' => $directReports,
                'total_reports' => $totalReports,
            ];
        }

        usort($rows, static function (array $a, array $b): int {
            $levelCompare = ((int) $a['level']) <=> ((int) $b['level']);
            if ($levelCompare !== 0) {
                return $levelCompare;
            }

            $nameA = strtolower((string) ($a['employee_name'] ?? ''));
            $nameB = strtolower((string) ($b['employee_name'] ?? ''));

            return $nameA <=> $nameB;
        });

        usort($managerOptions, static function (array $a, array $b): int {
            return strtolower((string) ($a['name'] ?? '')) <=> strtolower((string) ($b['name'] ?? ''));
        });

        ksort($levelsSummary);

        $managersCount = 0;
        foreach ($rows as $row) {
            if ((int) ($row['direct_reports'] ?? 0) > 0) {
                $managersCount++;
            }
        }

        $topLevelCount = 0;
        foreach ($rows as $row) {
            if ((int) ($row['level'] ?? 0) === 0) {
                $topLevelCount++;
            }
        }

        $company = null;
        if ($scopedBranchId !== null) {
            $companyRecord = Company::query()->find($scopedBranchId);
            if ($companyRecord) {
                $company = [
                    'id' => (int) $companyRecord->id,
                    'name' => (string) ($companyRecord->name ?? ''),
                    'currency' => (string) ($companyRecord->currency ?? 'LKR'),
                ];
            }
        }

        return response()->json([
            'scope' => [
                'top_level_access' => $isTopLevel,
                'scope_type' => $scopeType,
                'scope_label' => $scopeLabel,
                'branch_id' => $scopedBranchId,
                'allowed_branch_ids' => $allowedBranchIds,
                'allowed_branches' => $allowedBranches,
                'can_switch_branch' => $canSwitchBranch,
            ],
            'company' => $company,
            'summary' => [
                'total_employees' => count($rows),
                'managers' => $managersCount,
                'individual_contributors' => max(count($rows) - $managersCount, 0),
                'top_level_employees' => $topLevelCount,
                'max_level' => !empty($levelsSummary) ? (int) max(array_keys($levelsSummary)) : 0,
            ],
            'level_distribution' => array_map(
                static fn ($level, $count) => [
                    'level' => (int) $level,
                    'count' => (int) $count,
                ],
                array_keys($levelsSummary),
                array_values($levelsSummary)
            ),
            'manager_options' => $managerOptions,
            'rows' => $rows,
        ]);
    }
}
