<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LoanProduct extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name',
        'interest_rate',
        'description',
        'icon',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'interest_rate' => 'decimal:4',
        'tenant_id' => 'integer',
        'branch_id' => 'integer',
        'created_by' => 'integer',
        'updated_by' => 'integer',
    ];
}
