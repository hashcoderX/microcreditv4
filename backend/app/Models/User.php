<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
        private function isConfiguredSuperAdminEmail(): bool
        {
            $defaultEmail = 'superadmin@softcodelk.com';
            $configuredEmail = trim((string) env('SYSTEM_SUPER_ADMIN_EMAIL', $defaultEmail));

            if ($configuredEmail === '') {
                $configuredEmail = $defaultEmail;
            }

            $email = strtolower((string) $this->email);

            return $email === strtolower($defaultEmail) || $email === strtolower($configuredEmail);
        }

    private function normalizeAccessText(?string $value): string
    {
        return strtolower(trim((string) $value));
    }

    public function hasExecutiveDesignationAccess(): bool
    {
        $designationName = $this->normalizeAccessText((string) optional($this->designation)->name);

        if ($designationName === '') {
            return false;
        }

        return str_contains($designationName, 'managing director')
            || str_contains($designationName, 'business owner');
    }

    public function ensureExecutiveAdminRole(): void
    {
        if (!$this->hasExecutiveDesignationAccess()) {
            return;
        }

        $roles = $this->relationLoaded('roles')
            ? $this->roles
            : $this->roles()->get(['id', 'name']);

        $alreadyPrivileged = $roles->contains(function ($role) {
            $name = $this->normalizeAccessText((string) ($role->name ?? ''));
            return $name !== ''
                && (str_contains($name, 'admin') || str_contains($name, 'super admin') || str_contains($name, 'md'));
        });

        if ($alreadyPrivileged) {
            return;
        }

        $adminRole = Role::query()
            ->where(function ($query) {
                $query->whereRaw('LOWER(name) LIKE ?', ['%super admin%'])
                    ->orWhereRaw('LOWER(name) LIKE ?', ['%admin%']);
            })
            ->orderByRaw("CASE WHEN LOWER(name) LIKE '%super admin%' THEN 0 WHEN LOWER(name) LIKE '%admin%' THEN 1 ELSE 2 END")
            ->first();

        if (!$adminRole) {
            return;
        }

        $this->roles()->syncWithoutDetaching([
            $adminRole->id => [
                'assigned_by' => $this->id,
                'assigned_at' => now(),
            ],
        ]);
    }

    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, HasApiTokens;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'employee_id',
        'branch_id',
        'designation_id',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function branch()
    {
        return $this->belongsTo(Company::class, 'branch_id');
    }

    public function designation()
    {
        return $this->belongsTo(Designation::class);
    }

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'user_roles');
    }

    public function dashboardWidgets()
    {
        return $this->hasMany(UserDashboardWidget::class);
    }

    public function notifications()
    {
        return $this->hasMany(UserNotification::class);
    }

    public function hasRole($role)
    {
        return $this->roles()->where('name', $role)->exists();
    }

    public function hasPermission($permission)
    {
        // Super admins should bypass granular permission checks.
        if ($this->isSystemAdmin()) {
            return true;
        }

        return $this->roles()->whereHas('permissions', function ($query) use ($permission) {
            $query->where('name', $permission);
        })->exists();
    }

    public function isSystemAdmin(): bool
    {
        if ($this->isConfiguredSuperAdminEmail()) {
            return true;
        }

        if ($this->hasExecutiveDesignationAccess()) {
            return true;
        }

        return $this->roles()->where(function ($query) {
            $query->where('name', 'like', '%Admin%')
                ->orWhere('name', 'like', '%Super Admin%')
                ->orWhere('name', 'like', '%MD%');
        })->exists();
    }
}
