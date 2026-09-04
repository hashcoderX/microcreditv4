<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FinanceWorkflowEvent extends Model
{
    use HasFactory;

    protected $fillable = [
        'finance_id',
        'event_type',
        'from_step',
        'to_step',
        'step_title',
        'actor_user_id',
        'status',
        'note',
        'event_payload',
        'workflow_snapshot',
    ];

    protected $casts = [
        'from_step' => 'integer',
        'to_step' => 'integer',
        'actor_user_id' => 'integer',
        'event_payload' => 'array',
        'workflow_snapshot' => 'array',
    ];

    public function finance()
    {
        return $this->belongsTo(Finance::class);
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
