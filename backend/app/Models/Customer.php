<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id', 'branch_id', 'customer_code',
        'first_name', 'last_name', 'email', 'phone', 'nic_passport', 'old_nic',
        'passport_no', 'driving_license_no', 'tax_identification_no', 'biometric_reference',
        'date_of_birth', 'gender', 'marital_status', 'nationality',
        'permanent_address', 'current_address', 'photo_path',
        'employment_type', 'employer_name', 'job_title', 'monthly_income', 'other_income_sources',
        'existing_loans', 'monthly_loan_obligations', 'credit_score',
        'risk_total_score', 'risk_grade',
        'additional_details',
        'onboarding_payload',
        'created_by', 'status', 'user_id',
    ];

    protected $appends = [
        'photo_url',
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'existing_loans' => 'boolean',
        'monthly_income' => 'decimal:2',
        'monthly_loan_obligations' => 'decimal:2',
        'credit_score' => 'integer',
        'risk_total_score' => 'integer',
        'additional_details' => 'array',
        'onboarding_payload' => 'array',
    ];

    public function getPhotoUrlAttribute(): ?string
    {
        if (!$this->photo_path) {
            return null;
        }

        return '/media/customers/' . $this->id . '/photo';
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CustomerDocument::class);
    }

    public function savingsAccounts(): HasMany
    {
        return $this->hasMany(SavingsAccount::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function generateUniqueCustomerCode(): string
    {
        $prefix = 'CUS-' . now()->format('ymd') . '-';

        do {
            $candidate = $prefix . str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT);
        } while (self::where('customer_code', $candidate)->exists());

        return $candidate;
    }

    /**
     * Some legacy flows saved NIC/passport into customer_code (common on mortgage-related records).
     * Replace with a proper generated customer number when detected.
     */
    public function repairCustomerCodeIfNeeded(): void
    {
        $code = strtoupper(trim((string) $this->customer_code));
        $nic = strtoupper(trim((string) $this->nic_passport));

        $needsRepair = $code === ''
            || ($nic !== '' && $code === $nic)
            || (!$this->looksLikeProperCustomerCode($code) && $this->looksLikeNic($code));

        if (!$needsRepair) {
            return;
        }

        $this->forceFill([
            'customer_code' => self::generateUniqueCustomerCode(),
        ])->saveQuietly();
    }

    private function looksLikeProperCustomerCode(string $code): bool
    {
        return (bool) preg_match('/^CUS-\d{6}-\d{5}$/', strtoupper(trim($code)));
    }

    private function looksLikeNic(string $value): bool
    {
        $normalized = strtoupper(trim($value));

        if ($normalized === '') {
            return false;
        }

        return (bool) preg_match('/^\d{9}[VX]$|^\d{12}$/', $normalized);
    }
}
