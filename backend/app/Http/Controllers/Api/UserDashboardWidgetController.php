<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserDashboardWidget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserDashboardWidgetController extends Controller
{
    private function isAdminUser(User $user): bool
    {
        if ($user->isSystemAdmin()) {
            return true;
        }

        $designationName = strtolower(trim((string) optional($user->designation)->name));
        if ($designationName !== '' && str_contains($designationName, 'admin')) {
            return true;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized !== '' && str_contains($normalized, 'admin')) {
                return true;
            }
        }

        return false;
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $widgets = UserDashboardWidget::query()
            ->where('user_id', (int) $user->id)
            ->orderBy('widget_key')
            ->get(['widget_key', 'is_visible', 'hidden_at']);

        return response()->json([
            'widgets' => $widgets,
        ]);
    }

    public function upsert(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'widget_key' => ['required', 'string', 'max:120'],
            'is_visible' => ['required', 'boolean'],
        ]);

        $isVisible = (bool) $validated['is_visible'];

        $row = UserDashboardWidget::query()->updateOrCreate(
            [
                'user_id' => (int) $user->id,
                'widget_key' => trim((string) $validated['widget_key']),
            ],
            [
                'is_visible' => $isVisible,
                'hidden_at' => $isVisible ? null : now(),
            ]
        );

        return response()->json([
            'message' => 'Dashboard widget preference saved.',
            'widget' => $row,
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'admin_email' => ['required', 'email', 'max:255'],
            'admin_password' => ['required', 'string', 'min:1'],
        ]);

        $adminEmail = strtolower(trim((string) $validated['admin_email']));
        $adminPassword = (string) $validated['admin_password'];

        $adminUser = User::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$adminEmail])
            ->first();

        if (!$adminUser || !Hash::check($adminPassword, (string) $adminUser->password)) {
            return response()->json(['message' => 'Invalid admin email or password.'], 422);
        }

        if (!$this->isAdminUser($adminUser)) {
            return response()->json(['message' => 'Only admin or super admin can restore widgets.'], 403);
        }

        UserDashboardWidget::query()
            ->where('user_id', (int) $user->id)
            ->delete();

        return response()->json([
            'message' => 'Dashboard widget preferences reset.',
            'approved_by' => [
                'id' => (int) $adminUser->id,
                'email' => (string) $adminUser->email,
            ],
        ]);
    }

    public function restoreEmployeeWidgets(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        if (!$this->isAdminUser($user)) {
            return response()->json(['message' => 'Only admin or super admin can restore employee widgets.'], 403);
        }

        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'widget_prefix' => ['nullable', 'string', 'max:120'],
        ]);

        $employeeId = (int) $validated['employee_id'];
        $widgetPrefix = trim((string) ($validated['widget_prefix'] ?? ''));

        $targetUser = User::query()
            ->where('employee_id', $employeeId)
            ->first();

        if (!$targetUser) {
            return response()->json(['message' => 'No user account found for this employee.'], 404);
        }

        $query = UserDashboardWidget::query()
            ->where('user_id', (int) $targetUser->id)
            ->where('is_visible', false);

        if ($widgetPrefix !== '') {
            $query->where('widget_key', 'like', $widgetPrefix . '%');
        }

        $updatedCount = $query->update([
            'is_visible' => true,
            'hidden_at' => null,
        ]);

        return response()->json([
            'message' => 'Employee widget preferences restored.',
            'employee_id' => $employeeId,
            'user_id' => (int) $targetUser->id,
            'restored_count' => $updatedCount,
        ]);
    }

    public function employeeHiddenWidgets(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
        ]);

        $employeeId = (int) $validated['employee_id'];

        $targetUser = User::query()
            ->where('employee_id', $employeeId)
            ->first();

        if (!$targetUser) {
            return response()->json([
                'employee_id' => $employeeId,
                'user_id' => null,
                'hidden_widgets' => [],
                'hidden_count' => 0,
            ]);
        }

        $widgets = UserDashboardWidget::query()
            ->where('user_id', (int) $targetUser->id)
            ->where('is_visible', false)
            ->orderByDesc('hidden_at')
            ->orderBy('widget_key')
            ->get(['widget_key', 'hidden_at']);

        return response()->json([
            'employee_id' => $employeeId,
            'user_id' => (int) $targetUser->id,
            'hidden_widgets' => $widgets,
            'hidden_count' => $widgets->count(),
        ]);
    }

    public function authorizeAdminAction(Request $request): JsonResponse
    {
        $sessionUser = $request->user();
        if (!$sessionUser) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        // If the current authenticated user is already an admin, no extra credentials are required.
        if ($this->isAdminUser($sessionUser)) {
            return response()->json([
                'approved' => true,
                'message' => 'Admin approval verified from current session.',
                'approved_by' => [
                    'id' => (int) $sessionUser->id,
                    'email' => (string) $sessionUser->email,
                ],
            ]);
        }

        $validated = $request->validate([
            'admin_email' => ['nullable', 'email', 'max:255'],
            'admin_password' => ['nullable', 'string', 'min:1'],
        ]);

        $adminEmail = strtolower(trim((string) ($validated['admin_email'] ?? '')));
        $adminPassword = (string) ($validated['admin_password'] ?? '');

        if ($adminEmail === '' || $adminPassword === '') {
            return response()->json([
                'approved' => false,
                'message' => 'Admin email and password are required for this action.',
            ]);
        }

        $adminUser = User::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$adminEmail])
            ->first();

        if (!$adminUser || !Hash::check($adminPassword, (string) $adminUser->password)) {
            return response()->json([
                'approved' => false,
                'message' => 'Invalid admin email or password.',
            ]);
        }

        if (!$this->isAdminUser($adminUser)) {
            return response()->json([
                'approved' => false,
                'message' => 'Only admin or super admin credentials are allowed.',
            ]);
        }

        return response()->json([
            'approved' => true,
            'message' => 'Admin approval verified.',
            'approved_by' => [
                'id' => (int) $adminUser->id,
                'email' => (string) $adminUser->email,
            ],
        ]);
    }
}
