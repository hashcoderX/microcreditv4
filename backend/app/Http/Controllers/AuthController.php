<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Throwable;

class AuthController extends Controller
{
    private function normalizedEmailAliases(string $email): array
    {
        $normalized = strtolower(trim($email));
        $aliases = [$normalized];

        $configuredSuperAdminEmail = strtolower(trim((string) env('SYSTEM_SUPER_ADMIN_EMAIL', 'superadmin@softcodelk.com')));
        $legacySuperAdminEmails = [
            'superadmin@softcodelk.com',
            'superadmin@gmail.com',
        ];

        if ($normalized === $configuredSuperAdminEmail || in_array($normalized, $legacySuperAdminEmails, true)) {
            $aliases = array_values(array_unique(array_merge($aliases, [$configuredSuperAdminEmail], $legacySuperAdminEmails)));
        }

        return $aliases;
    }

    private function resolveLoginUserByEmail(string $email): ?User
    {
        $aliases = $this->normalizedEmailAliases($email);

        return User::query()
            ->where(function ($query) use ($aliases) {
                foreach ($aliases as $alias) {
                    $query->orWhereRaw('LOWER(TRIM(email)) = ?', [$alias]);
                }
            })
            ->first();
    }

    private function isSystemOnline(): bool
    {
        if (!Schema::hasTable('system_settings')) {
            return true;
        }

        $value = DB::table('system_settings')->where('key', 'system_online')->value('value');
        return (string) ($value ?? '1') === '1';
    }

    private function loadAuthUser(User $user): User
    {
        return $user->load([
            'branch:id,name',
            'designation:id,name',
            'employee:id,first_name,last_name,email,branch_id,designation_id',
            'roles:id,name,description',
            'roles.permissions:id,name,module,description',
        ]);
    }

    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
        ]);

        $token = $user->createToken('API Token')->plainTextToken;

        return response()->json([
            'user' => $this->loadAuthUser($user),
            'token' => $token,
        ]);
    }

    public function login(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|string|max:255',
                'password' => 'required|string',
            ]);

            $emailInput = trim((string) $request->input('email'));
            $passwordInput = (string) $request->input('password');

            // API-first auth: resolve user + verify password directly (no session guard dependency).
            $user = $this->resolveLoginUserByEmail($emailInput);
            if (!$user || !Hash::check($passwordInput, (string) $user->password)) {
                // Emergency local fallback for development:
                // - if user exists, normalize default password
                // - if user is missing (e.g. wrong DB), bootstrap super admin account
                if (app()->environment('local') && $passwordInput === 'password') {
                    if ($user) {
                        if (!Hash::check('password', (string) $user->password)) {
                            $user->password = Hash::make('password');
                            $user->save();
                        }
                    } else {
                        $seedEmail = strtolower(trim((string) env('SYSTEM_SUPER_ADMIN_EMAIL', 'superadmin@softcodelk.com')));
                        $user = User::query()->firstOrCreate(
                            ['email' => $seedEmail],
                            [
                                'name' => 'Super Admin',
                                'password' => Hash::make('password'),
                            ]
                        );
                    }

                    // Re-check against the provided password after normalization/bootstrap.
                    if (!Hash::check($passwordInput, (string) $user->password)) {
                        $user = null;
                    }
                } else {
                    $user = null;
                }
            }

            if (!$user) {
                throw ValidationException::withMessages([
                    'email' => ['The provided credentials are incorrect.'],
                ]);
            }

            if (!$this->isSystemOnline() && !$user->isSystemAdmin()) {
                throw ValidationException::withMessages([
                    'email' => ['System is currently offline. Only admins can log in at this time.'],
                ]);
            }

            $token = $user->createToken('API Token')->plainTextToken;

            return response()->json([
                'user' => $this->loadAuthUser($user),
                'token' => $token,
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Login is temporarily unavailable. Please check database connectivity and try again.',
            ], 503);
        }
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function forgotPassword(Request $request)
    {
        try {
            $validated = $request->validate([
                'email' => ['required', 'string', 'email', 'max:255'],
                'password' => ['required', 'string', 'min:8', 'confirmed'],
            ]);

            $email = strtolower(trim((string) $validated['email']));
            $user = User::query()
                ->whereRaw('LOWER(email) = ?', [$email])
                ->first();

            if (!$user) {
                throw ValidationException::withMessages([
                    'email' => ['No account found for this email address.'],
                ]);
            }

            $user->password = Hash::make((string) $validated['password']);
            $user->save();

            DB::table('personal_access_tokens')
                ->where('tokenable_type', User::class)
                ->where('tokenable_id', (int) $user->id)
                ->delete();

            return response()->json([
                'message' => 'Password reset successful. You can now sign in with your new password.',
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Password reset is temporarily unavailable. Please check database connectivity and try again.',
            ], 503);
        }
    }
}
