<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\MicrofinanceActionCenterStepRole;
use App\Models\MicrofinanceLoanRequest;
use App\Models\Role;
use App\Models\UserNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class UserNotificationController extends Controller
{
    private function notificationSignature(object $row): string
    {
        $meta = is_array($row->meta ?? null) ? $row->meta : [];

        $metaSignature = implode('|', [
            strtolower(trim((string) ($meta['loan_request_id'] ?? ''))),
            strtolower(trim((string) ($meta['loan_code'] ?? ''))),
            strtolower(trim((string) ($meta['reference_no'] ?? ''))),
            strtolower(trim((string) ($meta['customer_no'] ?? ''))),
            strtolower(trim((string) ($meta['workflow_step'] ?? ''))),
            strtolower(trim((string) ($meta['workflow_step_title'] ?? ''))),
            strtolower(trim((string) ($meta['from_step'] ?? ''))),
            strtolower(trim((string) ($meta['to_step'] ?? ''))),
        ]);

        return implode('||', [
            strtolower(trim((string) ($row->type ?? 'system'))),
            strtolower(trim((string) ($row->title ?? ''))),
            strtolower(trim((string) ($row->message ?? ''))),
            strtolower(trim((string) ($row->action_url ?? ''))),
            $metaSignature,
            (string) optional($row->created_at)->format('Y-m-d H:i:s'),
        ]);
    }

    private function normalizeAccessText(?string $value): string
    {
        return strtolower(trim((string) $value));
    }

    private function hasAdministrativeNotificationAccess(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $keywords = [
            'super admin',
            'superadmin',
            'admin',
            'managing director',
            'md',
            'ceo',
            'chief executive officer',
            'director',
            'business owner',
        ];

        $designationName = $this->normalizeAccessText((string) optional($user->designation)->name);
        if ($designationName !== '') {
            foreach ($keywords as $keyword) {
                if (str_contains($designationName, $keyword)) {
                    return true;
                }
            }
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = $this->normalizeAccessText((string) $roleName);
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

    private function visibleNotificationsQuery(Request $request): Builder
    {
        $user = $request->user();
        $query = UserNotification::query();

        if (!$this->hasAdministrativeNotificationAccess($user)) {
            $query->where('user_id', (int) ($user?->id ?? 0));
        }

        return $query;
    }

    private function resolveViewerEmployeeId(?object $user): int
    {
        $directEmployeeId = (int) ($user?->employee_id ?? 0);
        if ($directEmployeeId > 0) {
            return $directEmployeeId;
        }

        $userId = (int) ($user?->id ?? 0);
        if ($userId > 0) {
            $employeeByUserId = Employee::query()
                ->where('user_id', $userId)
                ->orderByDesc('id')
                ->value('id');

            if ((int) $employeeByUserId > 0) {
                return (int) $employeeByUserId;
            }
        }

        $email = strtolower(trim((string) ($user?->email ?? '')));
        if ($email !== '') {
            $employeeByEmail = Employee::query()
                ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
                ->orderByDesc('id')
                ->value('id');

            if ((int) $employeeByEmail > 0) {
                return (int) $employeeByEmail;
            }
        }

        return 0;
    }

    private function resolveViewerBranchId(?object $user): int
    {
        $directBranchId = (int) ($user?->branch_id ?? 0);
        if ($directBranchId > 0) {
            return $directBranchId;
        }

        $directEmployeeId = (int) ($user?->employee_id ?? 0);
        if ($directEmployeeId > 0) {
            $branchByEmployeeId = (int) (Employee::query()->where('id', $directEmployeeId)->value('branch_id') ?? 0);
            if ($branchByEmployeeId > 0) {
                return $branchByEmployeeId;
            }
        }

        $userId = (int) ($user?->id ?? 0);
        if ($userId > 0) {
            $branchByUserId = (int) (Employee::query()
                ->where('user_id', $userId)
                ->orderByDesc('id')
                ->value('branch_id') ?? 0);
            if ($branchByUserId > 0) {
                return $branchByUserId;
            }
        }

        $email = strtolower(trim((string) ($user?->email ?? '')));
        if ($email !== '') {
            $branchByEmail = (int) (Employee::query()
                ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
                ->orderByDesc('id')
                ->value('branch_id') ?? 0);
            if ($branchByEmail > 0) {
                return $branchByEmail;
            }
        }

        return 0;
    }

    private function hasAdministrativeWorkflowOverride(?object $user): bool
    {
        return $this->hasAdministrativeNotificationAccess($user);
    }

    /**
     * @param array<int, string> $keywords
     * @return array<int>
     */
    private function resolveRoleIdsByKeywords(array $keywords): array
    {
        if (count($keywords) === 0) {
            return [];
        }

        $roles = Role::query()->get(['id', 'name']);
        $ids = [];
        foreach ($roles as $role) {
            $name = $this->normalizeAccessText((string) $role->name);
            if ($name === '') {
                continue;
            }

            foreach ($keywords as $keyword) {
                if (str_contains($name, $this->normalizeAccessText((string) $keyword))) {
                    $ids[] = (int) $role->id;
                    break;
                }
            }
        }

        return array_values(array_unique(array_filter($ids, fn ($id) => $id > 0)));
    }

    /**
     * @return array<int, array{allow_all_roles: bool, role_ids: array<int>}>
     */
    private function actionCenterDefaultStepRoleRules(): array
    {
        return [
            1 => ['allow_all_roles' => true, 'role_ids' => []],
            2 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['credit officer'])],
            3 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['branch manager'])],
            4 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            5 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            6 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            7 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            8 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            9 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            10 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            11 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            12 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            13 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
            14 => ['allow_all_roles' => false, 'role_ids' => $this->resolveRoleIdsByKeywords(['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin'])],
        ];
    }

    /**
     * @return array{allow_all_roles: bool, role_ids: array<int>}
     */
    private function actionCenterStepRoleRule(int $step): array
    {
        $safeStep = max(1, min(14, $step));
        $defaults = $this->actionCenterDefaultStepRoleRules();
        $fallback = $defaults[$safeStep] ?? ['allow_all_roles' => false, 'role_ids' => []];

        if (!Schema::hasTable('mf_action_center_step_roles')) {
            return $fallback;
        }

        $row = MicrofinanceActionCenterStepRole::query()
            ->where('workflow_step', $safeStep)
            ->first();

        if (!$row) {
            return $fallback;
        }

        $roleIds = array_values(array_unique(array_filter(array_map('intval', (array) ($row->role_ids ?? [])), fn ($id) => $id > 0)));

        return [
            'allow_all_roles' => (bool) ($row->allow_all_roles ?? false),
            'role_ids' => $roleIds,
        ];
    }

    /**
     * @return array<int>
     */
    private function resolveUserRoleIds(?object $user): array
    {
        if (!$user || !method_exists($user, 'roles')) {
            return [];
        }

        return $user->roles()->pluck('roles.id')->map(fn ($id) => (int) $id)->filter(fn ($id) => $id > 0)->unique()->values()->all();
    }

    private function userHasActionCenterStepAccess(?object $user, int $step): bool
    {
        if (!$user) {
            return false;
        }

        if ($this->hasAdministrativeWorkflowOverride($user)) {
            return true;
        }

        $rule = $this->actionCenterStepRoleRule($step);
        if (!empty($rule['allow_all_roles'])) {
            return true;
        }

        $allowedRoleIds = $rule['role_ids'] ?? [];
        if (count($allowedRoleIds) === 0) {
            return false;
        }

        $userRoleIds = $this->resolveUserRoleIds($user);
        if (count($userRoleIds) === 0) {
            return false;
        }

        return count(array_intersect($allowedRoleIds, $userRoleIds)) > 0;
    }

    /**
     * @return array<int>
     */
    private function allowedActionCenterStepsForUser(?object $user): array
    {
        if (!$user) {
            return [];
        }

        if ($this->hasAdministrativeWorkflowOverride($user)) {
            return range(1, 14);
        }

        $allowed = [];
        for ($step = 1; $step <= 14; $step++) {
            if ($this->userHasActionCenterStepAccess($user, $step)) {
                $allowed[] = $step;
            }
        }

        return $allowed;
    }

    private function scopedActionCenterWorkflowQuery(Request $request): Builder
    {
        $user = $request->user();
        $allowedBranchSteps = $this->allowedActionCenterStepsForUser($user);

        $query = MicrofinanceLoanRequest::query()
            ->whereIn('status', ['requested', 'hold'])
            ->whereNotNull('workflow_step');

        if (!$this->hasAdministrativeNotificationAccess($user)) {
            $viewerUserId = (int) ($user?->id ?? 0);
            $viewerEmployeeId = $this->resolveViewerEmployeeId($user);
            $viewerBranchId = $this->resolveViewerBranchId($user);
            $hasBranchWorkflowScope = $viewerBranchId > 0 && count($allowedBranchSteps) > 0;

            if ($viewerUserId <= 0 && $viewerEmployeeId <= 0) {
                if (!$hasBranchWorkflowScope) {
                    $query->whereRaw('1 = 0');
                }
            } else {
                $query->where(function ($scope) use ($viewerUserId, $viewerEmployeeId, $viewerBranchId, $hasBranchWorkflowScope, $allowedBranchSteps) {
                    if ($viewerUserId > 0) {
                        $scope->orWhere('created_by', $viewerUserId);
                    }

                    if ($viewerEmployeeId > 0) {
                        $scope->orWhere('approval_employee_id', $viewerEmployeeId);
                    }

                    if ($hasBranchWorkflowScope) {
                        $scope->orWhere(function ($creditOfficerScope) use ($viewerBranchId, $allowedBranchSteps) {
                            $creditOfficerScope
                                ->where('branch_id', $viewerBranchId)
                                ->whereIn('workflow_step', $allowedBranchSteps);
                        });
                    }
                });
            }
        }

        return $query;
    }

    /**
     * @return array<string, int>
     */
    private function actionCenterWorkflowTypeCounts(Request $request): array
    {
        $query = $this->scopedActionCenterWorkflowQuery($request)
            ->selectRaw('workflow_step, COUNT(*) as aggregate_count')
            ->groupBy('workflow_step');

        $rows = $query->get();

        $counts = [];
        foreach ($rows as $row) {
            $step = (int) ($row->workflow_step ?? 0);
            if ($step < 1 || $step > 14) {
                continue;
            }

            $counts['step_' . $step] = (int) ($row->aggregate_count ?? 0);
        }

        return $counts;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function actionCenterWorkflowItems(Request $request, int $limit): array
    {
        $rows = $this->scopedActionCenterWorkflowQuery($request)
            ->select([
                'id',
                'customer_name',
                'customer_no',
                'reference_no',
                'loan_code',
                'status',
                'workflow_step',
                'workflow_step_updated_at',
                'created_at',
            ])
            ->orderByDesc('workflow_step_updated_at')
            ->orderByDesc('id')
            ->limit(max(1, min($limit, 20)))
            ->get();

        return $rows->map(function (MicrofinanceLoanRequest $loan) {
            return [
                'loan_request_id' => (int) $loan->id,
                'customer_name' => (string) ($loan->customer_name ?? ''),
                'customer_no' => (string) ($loan->customer_no ?? ''),
                'reference_no' => (string) ($loan->reference_no ?? ''),
                'loan_code' => (string) ($loan->loan_code ?? ''),
                'status' => (string) ($loan->status ?? ''),
                'workflow_step' => (int) ($loan->workflow_step ?? 1),
                'workflow_step_updated_at' => optional($loan->workflow_step_updated_at)->toIso8601String(),
                'created_at' => optional($loan->created_at)->toIso8601String(),
            ];
        })->values()->all();
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'tab' => ['nullable', 'string', 'in:all,unread,important'],
            'q' => ['nullable', 'string', 'max:100'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $tab = (string) ($validated['tab'] ?? 'all');
        $keyword = trim((string) ($validated['q'] ?? ''));
        $limit = (int) ($validated['limit'] ?? 30);
        $isAdminViewer = $this->hasAdministrativeNotificationAccess($user);

        $query = $this->visibleNotificationsQuery($request);

        if ($tab === 'unread') {
            $query->where('is_read', false);
        } elseif ($tab === 'important') {
            $query->where('is_important', true);
        }

        if ($keyword !== '') {
            $query->where(function ($sub) use ($keyword) {
                $sub->where('title', 'like', '%' . $keyword . '%')
                    ->orWhere('message', 'like', '%' . $keyword . '%')
                    ->orWhere('type', 'like', '%' . $keyword . '%');
            });
        }

        $items = $query
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get([
                'id',
                'title',
                'message',
                'type',
                'is_read',
                'is_important',
                'action_url',
                'meta',
                'read_at',
                'created_at',
            ]);

        $baseQuery = $this->visibleNotificationsQuery($request);

        return response()->json([
            'notifications' => $items,
            'viewer_scope' => $isAdminViewer ? 'administrative_all' : 'self_only',
            'summary' => [
                'total' => (clone $baseQuery)->count(),
                'unread' => (clone $baseQuery)->where('is_read', false)->count(),
                'important' => (clone $baseQuery)->where('is_important', true)->count(),
            ],
        ]);
    }

    public function preview(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);
        $limit = (int) ($validated['limit'] ?? 5);
        $isAdminViewer = $this->hasAdministrativeNotificationAccess($user);

        $items = $this->visibleNotificationsQuery($request)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get([
                'id',
                'title',
                'type',
                'is_read',
                'is_important',
                'created_at',
            ]);

        $unreadRows = $this->visibleNotificationsQuery($request)
            ->where('is_read', false)
            ->get([
                'id',
                'title',
                'message',
                'type',
                'is_important',
                'action_url',
                'meta',
                'created_at',
            ]);

        $uniqueUnreadRows = $unreadRows
            ->unique(fn ($row) => $this->notificationSignature($row))
            ->values();

        $unread = $uniqueUnreadRows->count();
        $importantUnread = $uniqueUnreadRows->where('is_important', true)->count();

        $typeCounts = [];
        foreach ($uniqueUnreadRows as $row) {
            $type = trim((string) ($row->type ?? ''));
            if ($type === '') {
                $type = 'system';
            }

            if (preg_match('/^step[_\-]?(\d+)$/i', $type, $matches) === 1) {
                $step = (int) ($matches[1] ?? 0);
                if ($step >= 1 && $step <= 14) {
                    $type = 'step_' . $step;
                }
            }

            if (!array_key_exists($type, $typeCounts)) {
                $typeCounts[$type] = 0;
            }

            $typeCounts[$type]++;
        }

        // Step widgets must always reflect the live workflow queue, not historical notification rows.
        for ($step = 1; $step <= 14; $step++) {
            $typeCounts['step_' . $step] = 0;
        }

        // Step widgets must reflect current workflow queue for creator/assignee/admin scope.
        $workflowTypeCounts = $this->actionCenterWorkflowTypeCounts($request);
        foreach ($workflowTypeCounts as $typeKey => $count) {
            $typeCounts[$typeKey] = $count;
        }

        $workflowTotal = (int) array_sum($workflowTypeCounts);
        $workflowItems = $this->actionCenterWorkflowItems($request, $limit);

        $groupedCounts = [
            'loan_requests' => (int) ($typeCounts['microfinance_loan_request'] ?? 0),
            'approval_requests' => (int) (($typeCounts['microfinance_approval_request'] ?? 0) + ($typeCounts['microfinance_send_back'] ?? 0)),
        ];

        return response()->json([
            'items' => $items,
            'viewer_scope' => $isAdminViewer ? 'administrative_all' : 'self_only',
            'unread_count' => $unread,
            'important_unread_count' => $importantUnread,
            'type_counts' => $typeCounts,
            'grouped_counts' => $groupedCounts,
            'action_center_total' => $workflowTotal,
            'action_center_items' => $workflowItems,
        ]);
    }

    public function markRead(Request $request, UserNotification $notification): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        if (!$this->hasAdministrativeNotificationAccess($user) && (int) $notification->user_id !== (int) $user->id) {
            return response()->json(['message' => 'Notification not found.'], 404);
        }

        $notification->is_read = true;
        $notification->read_at = now();
        $notification->save();

        return response()->json([
            'message' => 'Notification marked as read.',
            'notification' => $notification,
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $updated = $this->visibleNotificationsQuery($request)
            ->where('is_read', false)
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        return response()->json([
            'message' => 'All notifications marked as read.',
            'updated_count' => $updated,
        ]);
    }

    public function clearRead(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $deleted = $this->visibleNotificationsQuery($request)
            ->where('is_read', true)
            ->delete();

        return response()->json([
            'message' => 'Read notifications cleared.',
            'deleted_count' => $deleted,
        ]);
    }

    public function toggleImportant(Request $request, UserNotification $notification): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        if (!$this->hasAdministrativeNotificationAccess($user) && (int) $notification->user_id !== (int) $user->id) {
            return response()->json(['message' => 'Notification not found.'], 404);
        }

        $validated = $request->validate([
            'is_important' => ['required', 'boolean'],
        ]);

        $notification->is_important = (bool) $validated['is_important'];
        $notification->save();

        return response()->json([
            'message' => 'Notification importance updated.',
            'notification' => $notification,
        ]);
    }
}
