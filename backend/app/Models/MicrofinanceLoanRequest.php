<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MicrofinanceLoanRequest extends Model
{
    use HasFactory;

    protected $table = 'mf_loan_requests';

    protected $fillable = [
        'branch_id',
        'loan_scope',
        'mf_route_id',
        'mf_center_id',
        'mf_group_id',
        'manager_name',
        'approval_employee_id',
        'field_officer',
        'group_leader',
        'loan_code',
        'reference_no',
        'customer_no',
        'customer_name',
        'nick_name',
        'nic',
        'address',
        'contact_no',
        'bank_name',
        'bank_branch',
        'bank_account_no',
        'evaluation_payload',
        'evaluation_payload_version',
        'call_confirmation_payload',
        'call_confirmed_at',
        'bm_approval_payload',
        'bm_approved_at',
        'cash_allocation_payload',
        'cash_allocated_at',
        'second_call_confirmation_payload',
        'second_call_confirmed_at',
        'document_verification_payload',
        'document_verified_at',
        'loan_amount',
        'reason',
        'refund_option',
        'assumed_month_days',
        'interest_type',
        'interest_rate',
        'terms_count',
        'refundable_amount',
        'installment_amount',
        'loan_balance',
        'document_charges',
        'stamp_charges',
        'insurance_charges',
        'charge_payment_mode',
        'charges_collection_status',
        'net_disbursed_amount',
        'charges_wallet_credited_at',
        'next_payment_date',
        'due_date',
        'loan_end_date',
        'arrears_balance',
        'penalty_rate',
        'penalty_grace_days',
        'penalty_starts_on',
        'documents_requested',
        'document_request_note',
        'document_requested_at',
        'rejection_reason',
        'rejected_at',
        'hold_at',
        'hold_reason',
        'closed_at',
        'closed_reason',
        'loan_request_date',
        'status',
        'workflow_step',
        'workflow_step_updated_at',
        'created_by',
    ];

    protected $casts = [
        'loan_amount' => 'decimal:2',
        'assumed_month_days' => 'integer',
        'refundable_amount' => 'decimal:2',
        'installment_amount' => 'decimal:2',
        'loan_balance' => 'decimal:2',
        'evaluation_payload' => 'array',
        'evaluation_payload_version' => 'integer',
        'call_confirmation_payload' => 'array',
        'call_confirmed_at' => 'datetime',
        'bm_approval_payload' => 'array',
        'bm_approved_at' => 'datetime',
        'cash_allocation_payload' => 'array',
        'cash_allocated_at' => 'datetime',
        'second_call_confirmation_payload' => 'array',
        'second_call_confirmed_at' => 'datetime',
        'document_verification_payload' => 'array',
        'document_verified_at' => 'datetime',
        'workflow_step' => 'integer',
        'workflow_step_updated_at' => 'datetime',
        'due_date' => 'date',
        'charges_wallet_credited_at' => 'datetime',
        'hold_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function route()
    {
        return $this->belongsTo(MicrofinanceRoute::class, 'mf_route_id');
    }

    public function branch()
    {
        return $this->belongsTo(Company::class, 'branch_id');
    }

    public function approvalEmployee()
    {
        return $this->belongsTo(Employee::class, 'approval_employee_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function center()
    {
        return $this->belongsTo(MicrofinanceCenter::class, 'mf_center_id');
    }

    public function group()
    {
        return $this->belongsTo(MicrofinanceGroup::class, 'mf_group_id');
    }

    public function guarantors()
    {
        return $this->hasMany(MicrofinanceLoanGuarantor::class, 'mf_loan_request_id');
    }

    public function documents()
    {
        return $this->hasMany(MicrofinanceLoanRequestDocument::class, 'mf_loan_request_id');
    }

    public function collections()
    {
        return $this->hasMany(MicrofinanceLoanCollection::class, 'mf_loan_request_id');
    }
}
