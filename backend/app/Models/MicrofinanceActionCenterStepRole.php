<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MicrofinanceActionCenterStepRole extends Model
{
    protected $table = 'mf_action_center_step_roles';

    protected $fillable = [
        'workflow_step',
        'allow_all_roles',
        'role_ids',
        'updated_by_user_id',
    ];

    protected $casts = [
        'workflow_step' => 'integer',
        'allow_all_roles' => 'boolean',
        'role_ids' => 'array',
        'updated_by_user_id' => 'integer',
    ];
}
