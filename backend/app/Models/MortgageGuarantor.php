<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MortgageGuarantor extends Model
{
    use HasFactory;

    protected $fillable = [
        'mortgage_id',
        'name',
        'nic',
        'relationship',
        'address',
        'income',
        'contact_number',
    ];

    public function mortgage()
    {
        return $this->belongsTo(Mortgage::class);
    }
}
