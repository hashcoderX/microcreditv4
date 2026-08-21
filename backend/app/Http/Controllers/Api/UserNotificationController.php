<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserNotificationController extends Controller
{
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

        $query = UserNotification::query()->where('user_id', (int) $user->id);

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

        $baseQuery = UserNotification::query()->where('user_id', (int) $user->id);

        return response()->json([
            'notifications' => $items,
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

        $items = UserNotification::query()
            ->where('user_id', (int) $user->id)
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

        $unread = UserNotification::query()
            ->where('user_id', (int) $user->id)
            ->where('is_read', false)
            ->count();

        $importantUnread = UserNotification::query()
            ->where('user_id', (int) $user->id)
            ->where('is_read', false)
            ->where('is_important', true)
            ->count();

        $unreadTypeRows = UserNotification::query()
            ->where('user_id', (int) $user->id)
            ->where('is_read', false)
            ->get(['type']);

        $typeCounts = [];
        foreach ($unreadTypeRows as $row) {
            $type = trim((string) ($row->type ?? ''));
            if ($type === '') {
                $type = 'system';
            }

            if (!array_key_exists($type, $typeCounts)) {
                $typeCounts[$type] = 0;
            }

            $typeCounts[$type]++;
        }

        return response()->json([
            'items' => $items,
            'unread_count' => $unread,
            'important_unread_count' => $importantUnread,
            'type_counts' => $typeCounts,
        ]);
    }

    public function markRead(Request $request, UserNotification $notification): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        if ((int) $notification->user_id !== (int) $user->id) {
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

        $updated = UserNotification::query()
            ->where('user_id', (int) $user->id)
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

        $deleted = UserNotification::query()
            ->where('user_id', (int) $user->id)
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

        if ((int) $notification->user_id !== (int) $user->id) {
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
