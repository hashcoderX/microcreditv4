<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LoanRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'request_no',
        'loan_product',
        'customer_no',
        'customer_full_name',
        'customer_nic',
        'customer_mobile',
        'customer_address',
        'principal',
        'annual_rate',
        'interest_rate_type',
        'tenure_months',
        'installment_frequency',
        'installments',
        'installment_amount',
        'total_payable',
        'customer_details',
        'guarantor_details',
        'status',
        'approval_level',
        'required_approval_level',
        'created_by',
        'last_action_by',
        'last_action_at',
        'approval_note',
        'due_date',
        'next_due_date',
        'total_collected',
    ];

    protected $casts = [
        'principal' => 'decimal:2',
        'annual_rate' => 'decimal:4',
        'installment_amount' => 'decimal:2',
        'total_payable' => 'decimal:2',
        'installments' => 'integer',
        'tenure_months' => 'integer',
        'approval_level' => 'integer',
        'required_approval_level' => 'integer',
        'customer_details' => 'array',
        'guarantor_details' => 'array',
        'last_action_at' => 'datetime',
        'due_date' => 'date',
        'next_due_date' => 'date',
        'total_collected' => 'decimal:2',
    ];

    public function documents(): HasMany
    {
        return $this->hasMany(LoanRequestDocument::class);
    }

    public function collections(): HasMany
    {
        return $this->hasMany(LoanRequestCollection::class);
    }
}

