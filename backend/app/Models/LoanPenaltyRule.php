<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LoanPenaltyRule extends Model
{
    use HasFactory;

    protected $table = 'loan_penalty_rules';

    protected $fillable = [
        'identification',
        'applicable_for',
        'penalty_type',
        'value_mode',
        'amount_or_rate',
        'is_active',
        'display_order',
    ];
}
