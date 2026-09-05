<?php

namespace App\Http\Controllers\Api\Microfinance;

use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActionCenterStepRoleController extends Controller
{
    /**
     * @var array<int, string>
     */
    private const WORKFLOW_STEP_TITLES = [
        1 => 'CRO Check Pending',
        2 => 'Pending Call Confirmation',
        3 => 'BM approval',
        4 => 'Head Office Approval',
        5 => 'Cash Allocation',
        6 => 'Cash Request',
        7 => 'Cash Withdrawal',
        8 => 'Second Call Confirmation',
        9 => 'Loan Signature Check',
        10 => 'Document failing',
        11 => 'Insurance Request',
        12 => 'Branch Insurance Request',
        13 => 'Head Office Insurance Request',
        14 => 'Grant',
    ];

    /**
     * @var array<int, array{allow_all_roles: bool, role_keywords: array<int, string>}>
     */
    private const DEFAULT_RULES = [
        1 => ['allow_all_roles' => true, 'role_keywords' => []],
        2 => ['allow_all_roles' => false, 'role_keywords' => ['credit officer']],
        3 => ['allow_all_roles' => false, 'role_keywords' => ['branch manager']],
        4 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        5 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        6 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        7 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        8 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        9 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        10 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        11 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        12 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        13 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
        14 => ['allow_all_roles' => false, 'role_keywords' => ['loan approver', 'finance manager', 'managing director', 'director', 'ceo', 'admin']],
    ];

    private function normalizeAccessText(?string $value): string
    {
        return strtolower(trim((string) $value));
    }

    private function canManageFlowSettings(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $keywords = ['super admin', 'admin', 'managing director', 'md', 'ceo', 'director', 'business owner'];
        $designation = $this->normalizeAccessText((string) optional($user->designation)->name);
        foreach ($keywords as $keyword) {
            if ($designation !== '' && str_contains($designation, $keyword)) {
                return true;
            }
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = $this->normalizeAccessText((string) $roleName);
            foreach ($keywords as $keyword) {
                if ($normalized !== '' && str_contains($normalized, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return array<int>
     */
    private function defaultRoleIdsForStep(int $step): array
    {
        $defaultRule = self::DEFAULT_RULES[$step] ?? ['role_keywords' => []];
        $keywords = is_array($defaultRule['role_keywords'] ?? null) ? $defaultRule['role_keywords'] : [];
        if (count($keywords) === 0) {
            return [];
        }

        $roles = Role::query()->get(['id', 'name']);

        $ids = [];
        foreach ($roles as $role) {
            $roleName = $this->normalizeAccessText((string) $role->name);
            foreach ($keywords as $keyword) {
                if ($roleName !== '' && str_contains($roleName, $this->normalizeAccessText((string) $keyword))) {
                    $ids[] = (int) $role->id;
                    break;
                }
            }
        }

        return array_values(array_unique(array_filter($ids, fn ($id) => $id > 0)));
    }

    private function ensureSettingsRows(int $actorUserId): void
    {
        for ($step = 1; $step <= 14; $step++) {
            $row = DB::table('mf_action_center_step_roles')->where('workflow_step', $step)->first();
            if ($row) {
                continue;
            }

            $defaultRule = self::DEFAULT_RULES[$step] ?? ['allow_all_roles' => false, 'role_keywords' => []];
            DB::table('mf_action_center_step_roles')->insert([
                'workflow_step' => $step,
                'allow_all_roles' => (bool) ($defaultRule['allow_all_roles'] ?? false),
                'role_ids' => json_encode($this->defaultRoleIdsForStep($step)),
                'updated_by_user_id' => $actorUserId > 0 ? $actorUserId : null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$this->canManageFlowSettings($user)) {
            return response()->json(['message' => 'You are not allowed to manage Action Center flow settings.'], 403);
        }

        $actorUserId = (int) ($user?->id ?? 0);
        $this->ensureSettingsRows($actorUserId);

        $roles = Role::query()
            ->orderBy('name')
            ->get(['id', 'name', 'is_active'])
            ->map(fn (Role $role) => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'is_active' => (bool) ($role->is_active ?? true),
            ])
            ->values();

        $rows = DB::table('mf_action_center_step_roles')
            ->orderBy('workflow_step')
            ->get();

        $settingsByStep = $rows->keyBy(fn ($row) => (int) ($row->workflow_step ?? 0));

        $steps = [];
        for ($step = 1; $step <= 14; $step++) {
            $row = $settingsByStep->get($step);
            $rawRoleIds = $row?->role_ids;
            if (is_string($rawRoleIds)) {
                $decoded = json_decode($rawRoleIds, true);
                $rawRoleIds = is_array($decoded) ? $decoded : [];
            }
            $roleIds = array_values(array_unique(array_filter(array_map('intval', (array) ($rawRoleIds ?? [])), fn ($id) => $id > 0)));

            $steps[] = [
                'workflow_step' => $step,
                'title' => self::WORKFLOW_STEP_TITLES[$step] ?? ('Step ' . $step),
                'allow_all_roles' => (bool) ($row?->allow_all_roles ?? false),
                'role_ids' => $roleIds,
                'updated_by_user_id' => $row?->updated_by_user_id !== null ? (int) $row->updated_by_user_id : null,
                'updated_at' => $row?->updated_at ? (string) $row->updated_at : null,
            ];
        }

        return response()->json([
            'roles' => $roles,
            'steps' => $steps,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$this->canManageFlowSettings($user)) {
            return response()->json(['message' => 'You are not allowed to manage Action Center flow settings.'], 403);
        }

        $validated = $request->validate([
            'steps' => ['required', 'array', 'min:1'],
            'steps.*.workflow_step' => ['required', 'integer', 'min:1', 'max:14'],
            'steps.*.allow_all_roles' => ['required', 'boolean'],
            'steps.*.role_ids' => ['nullable', 'array'],
            'steps.*.role_ids.*' => ['integer', 'exists:roles,id'],
        ]);

        $steps = collect($validated['steps'])
            ->keyBy(fn ($row) => (int) ($row['workflow_step'] ?? 0));

        $actorUserId = (int) ($user?->id ?? 0);

        for ($step = 1; $step <= 14; $step++) {
            $incoming = $steps->get($step);

            if (!$incoming) {
                continue;
            }

            $roleIds = array_values(array_unique(array_filter(array_map('intval', (array) ($incoming['role_ids'] ?? [])), fn ($id) => $id > 0)));

            $existing = DB::table('mf_action_center_step_roles')->where('workflow_step', $step)->first();
            if ($existing) {
                DB::table('mf_action_center_step_roles')
                    ->where('workflow_step', $step)
                    ->update([
                        'allow_all_roles' => (bool) ($incoming['allow_all_roles'] ?? false),
                        'role_ids' => json_encode($roleIds),
                        'updated_by_user_id' => $actorUserId > 0 ? $actorUserId : null,
                        'updated_at' => now(),
                    ]);
            } else {
                DB::table('mf_action_center_step_roles')->insert([
                    'workflow_step' => $step,
                    'allow_all_roles' => (bool) ($incoming['allow_all_roles'] ?? false),
                    'role_ids' => json_encode($roleIds),
                    'updated_by_user_id' => $actorUserId > 0 ? $actorUserId : null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        return response()->json([
            'message' => 'Action Center flow settings saved successfully.',
        ]);
    }
}
