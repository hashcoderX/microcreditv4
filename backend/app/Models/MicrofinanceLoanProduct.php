<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MicrofinanceLoanProduct extends Model
{
    use HasFactory;

    protected $table = 'mf_loan_products';

    protected $fillable = [
        'name',
        'min_loan_amount',
        'max_loan_amount',
        'document_charge_percentage',
        'stamp_charge_percentage',
        'insurance_charge_percentage',
        'interest_rate',
        'interest_type',
        'terms_count',
        'refund_option',
        'assumed_month_days',
        'is_active',
    ];

    protected $casts = [
        'min_loan_amount' => 'decimal:2',
        'max_loan_amount' => 'decimal:2',
        'document_charge_percentage' => 'decimal:4',
        'stamp_charge_percentage' => 'decimal:4',
        'insurance_charge_percentage' => 'decimal:4',
        'interest_rate' => 'decimal:7',
        'terms_count' => 'integer',
        'assumed_month_days' => 'integer',
        'is_active' => 'boolean',
    ];
}
