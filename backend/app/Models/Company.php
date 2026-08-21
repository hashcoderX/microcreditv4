<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;
use App\Support\StoredFile;

class Company extends Model
{
    protected $fillable = [
        'name',
        'email',
        'address',
        'phone',
        'secondary_phone',
        'whatsapp_no',
        'website',
        'country',
        'currency',
        'logo_path',
        'manager_user_id',
        'is_main_branch',
        'business_owner_user_id',
        'ceo_user_id',
        'regional_manager_user_id',
        'opening_asset',
    ];

    protected $appends = [
        'logo_url',
    ];

    protected $casts = [
        'opening_asset' => 'decimal:2',
        'is_main_branch' => 'boolean',
    ];

    public function documentTemplates(): HasMany
    {
        return $this->hasMany(CompanyDocumentTemplate::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    public function businessOwner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'business_owner_user_id');
    }

    public function ceo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ceo_user_id');
    }

    public function regionalManager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'regional_manager_user_id');
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(CompanyAccount::class);
    }

    public function leadershipAssignments(): HasMany
    {
        return $this->hasMany(CompanyLeadershipAssignment::class);
    }

    public function accountingExpenses(): HasMany
    {
        return $this->hasMany(AccountingExpense::class);
    }

    public function getLogoUrlAttribute(): ?string
    {
        if (!$this->logo_path) {
            return null;
        }

        return StoredFile::publicPath($this->logo_path);
    }
}
