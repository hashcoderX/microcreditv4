<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyLeadershipAssignment extends Model
{
    public const ROLE_BUSINESS_OWNER = 'business_owner';
    public const ROLE_CEO = 'ceo';
    public const ROLE_REGIONAL_MANAGER = 'regional_manager';
    public const ROLE_ZONAL_MANAGER = 'zonal_manager';

    protected $fillable = [
        'company_id',
        'role_type',
        'user_id',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
