<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Finance extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'customer_id',
        'finance_type',
        'product_type',
        'asset_reference',
        'vehicle_details',
        'valuation_details',
        'guarantor_details',
        'repayment_plan',
        'family_financial_details',
        'evaluation_payload',
        'evaluation_payload_version',
        'amount',
        'down_payment',
        'financed_amount',
        'interest_rate',
        'interest_type',
        'tenure_months',
        'installment_frequency',
        'installment_amount',
        'refund_amount',
        'total_paid_amount',
        'balance_amount',
        'due_date',
        'due_amount',
        'due_capital_amount',
        'due_interest_amount',
        'arrears',
        'penalty',
        'next_collection_date',
        'finance_end_date',
        'status',
        'start_date',
        'branch_manager_user_id',
        'responsible_officer_employee_id',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'down_payment' => 'decimal:2',
        'financed_amount' => 'decimal:2',
        'interest_rate' => 'decimal:4',
        'refund_amount' => 'decimal:2',
        'total_paid_amount' => 'decimal:2',
        'balance_amount' => 'decimal:2',
        'due_amount' => 'decimal:2',
        'due_capital_amount' => 'decimal:2',
        'due_interest_amount' => 'decimal:2',
        'arrears' => 'decimal:2',
        'penalty' => 'decimal:2',
        'tenure_months' => 'integer',
        'branch_manager_user_id' => 'integer',
        'responsible_officer_employee_id' => 'integer',
        'evaluation_payload_version' => 'integer',
        'start_date' => 'date',
        'due_date' => 'date',
        'next_collection_date' => 'date',
        'finance_end_date' => 'date',
        'vehicle_details' => 'array',
        'valuation_details' => 'array',
        'guarantor_details' => 'array',
        'repayment_plan' => 'array',
        'family_financial_details' => 'array',
        'evaluation_payload' => 'array',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function documents()
    {
        return $this->hasMany(FinanceDocument::class);
    }

    public function collections()
    {
        return $this->hasMany(FinanceCollection::class);
    }

    public function draftLoan()
    {
        return $this->hasOne(DraftLoan::class);
    }
}
