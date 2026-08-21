<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Notifications\Notifiable;

class Employee extends Model
{
    use SoftDeletes, Notifiable;

    protected $appends = [
        'phone',
        'hire_date',
    ];

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'employee_code',
        'first_name',
        'last_name',
        'email',
        'mobile',
        'nic_passport',
        'address',
        'photo_path',
        'date_of_birth',
        'gender',
        'department_id',
        'designation_id',
        'reporting_person',
        'join_date',
        'basic_salary',
        'commission',
        'commission_base',
        'monthly_target',
        'overtime_payment_per_hour',
        'deduction_late_hour',
        'epf_employee_contribution',
        'epf_employer_contribution',
        'etf_employee_contribution',
        'etf_employer_contribution',
        'tin',
        'tax_applicable',
        'tax_relief_eligible',
        'apit_tax_amount',
        'apit_tax_rate',
        'employee_type',
        'status',
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'join_date' => 'date',
        'basic_salary' => 'decimal:2',
        'commission' => 'decimal:2',
        'monthly_target' => 'decimal:2',
        'overtime_payment_per_hour' => 'decimal:2',
        'deduction_late_hour' => 'decimal:2',
        'epf_employee_contribution' => 'decimal:2',
        'epf_employer_contribution' => 'decimal:2',
        'etf_employee_contribution' => 'decimal:2',
        'etf_employer_contribution' => 'decimal:2',
        'apit_tax_amount' => 'decimal:2',
        'apit_tax_rate' => 'decimal:2',
        'tax_applicable' => 'boolean',
        'tax_relief_eligible' => 'boolean',
    ];

    public function getPhoneAttribute(): ?string
    {
        return $this->mobile;
    }

    public function getHireDateAttribute(): ?string
    {
        if (!$this->join_date) {
            return null;
        }

        return $this->join_date instanceof \DateTimeInterface
            ? $this->join_date->format('Y-m-d')
            : (string) $this->join_date;
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'tenant_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'branch_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function designation(): BelongsTo
    {
        return $this->belongsTo(Designation::class);
    }

    public function attendance(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    public function leaves(): HasMany
    {
        return $this->hasMany(Leave::class);
    }

    public function payrolls(): HasMany
    {
        return $this->hasMany(Payroll::class);
    }

    public function approvedLeaves(): HasMany
    {
        return $this->hasMany(Leave::class, 'approved_by');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(EmployeeDocument::class);
    }

    public function educations(): HasMany
    {
        return $this->hasMany(EmployeeEducation::class);
    }

    public function experiences(): HasMany
    {
        return $this->hasMany(EmployeeExperience::class);
    }

    public function allowancesAndDeductions(): HasMany
    {
        return $this->hasMany(EmployeeAllowanceDeduction::class);
    }

    public function allowances(): HasMany
    {
        return $this->hasMany(EmployeeAllowanceDeduction::class)->where('type', 'allowance');
    }

    public function deductions(): HasMany
    {
        return $this->hasMany(EmployeeAllowanceDeduction::class)->where('type', 'deduction');
    }

    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }

    public function wallet(): HasOne
    {
        return $this->hasOne(EmployeeWallet::class);
    }

    public function getFullNameAttribute(): string
    {
        return $this->first_name . ' ' . $this->last_name;
    }
}
