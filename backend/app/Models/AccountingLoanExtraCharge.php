<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountingLoanExtraCharge extends Model
{
    public const PRODUCT_MICROFINANCE = 'microfinance';
    public const PRODUCT_MORTGAGE = 'mortgage';
    public const PRODUCT_FINANCE = 'finance';

    public const TYPE_PROCESSING_FEE = 'processing_fee';
    public const TYPE_SERVICE_FEE = 'service_fee';
    public const TYPE_ADMIN_FEE = 'admin_fee';
    public const TYPE_DOCUMENT_FEE = 'document_fee';
    public const TYPE_FIELD_VISIT_FEE = 'field_visit_fee';
    public const TYPE_OTHER = 'other';

    protected $fillable = [
        'company_id',
        'mf_loan_request_id',
        'product_type',
        'source_loan_id',
        'charge_date',
        'charge_type',
        'title',
        'extra_charges',
        'amount',
        'apply_to_loan_balance',
        'reference_no',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'charge_date' => 'date',
        'extra_charges' => 'decimal:2',
        'amount' => 'decimal:2',
        'apply_to_loan_balance' => 'boolean',
    ];

    public static function productTypes(): array
    {
        return [
            self::PRODUCT_MICROFINANCE,
            self::PRODUCT_MORTGAGE,
            self::PRODUCT_FINANCE,
        ];
    }

    public static function chargeTypes(): array
    {
        return [
            self::TYPE_PROCESSING_FEE,
            self::TYPE_SERVICE_FEE,
            self::TYPE_ADMIN_FEE,
            self::TYPE_DOCUMENT_FEE,
            self::TYPE_FIELD_VISIT_FEE,
            self::TYPE_OTHER,
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(MicrofinanceLoanRequest::class, 'mf_loan_request_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
