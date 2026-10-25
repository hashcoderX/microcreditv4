<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Mortgage extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'customer_id',
        'mortgage_type',
        'requested_amount',
        'approved_amount',
        'interest_rate',
        'interest_type',
        'tenure_months',
        'installment_frequency',
        'interest_calculation_frequency',
        'installment_amount',
        'penalty_rate',
        'penalty_scheme',
        'processing_fee',
        'insurance_fee',
        'start_date',
        'previous_mortgages',
        'status',
        'approved_by',
        'responsible_manager_user_id',
        'responsible_manager_name',
        'mortgage_qr_code',
        'mortgage_qr_generated_at',
        'approved_at',
        'due_date',
        'arrears_amount',
        'due_amount',
        'due_interest_amount',
        'created_by',
        'entry_officer_name',
        'entry_officer_designation',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
        'mortgage_qr_generated_at' => 'datetime',
        'start_date' => 'date',
        'due_date' => 'date',
        'arrears_amount' => 'decimal:2',
        'due_amount' => 'decimal:2',
        'due_interest_amount' => 'decimal:2',
    ];

    public function asset()
    {
        return $this->hasOne(MortgageAsset::class);
    }

    public function valuation()
    {
        return $this->hasOne(MortgageValuation::class);
    }

    public function guarantors()
    {
        return $this->hasMany(MortgageGuarantor::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function payments()
    {
        return $this->hasMany(MortgagePayment::class);
    }

    public function documents()
    {
        return $this->hasMany(MortgageDocument::class);
    }
}
