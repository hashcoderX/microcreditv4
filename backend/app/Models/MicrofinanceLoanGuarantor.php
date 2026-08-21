<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MicrofinanceLoanGuarantor extends Model
{
    use HasFactory;

    protected $table = 'mf_loan_guarantors';

    protected $fillable = [
        'mf_loan_request_id',
        'name',
        'nic',
        'address',
        'contact_no',
        'relationship',
        'image_path',
        'image_original_name',
        'signature_path',
        'signature_original_name',
    ];

    protected $appends = [
        'image_url',
        'signature_url',
    ];

    public function getImageUrlAttribute(): ?string
    {
        if (!$this->image_path) {
            return null;
        }

        return '/storage/' . ltrim(preg_replace('/^public\//', '', (string) $this->image_path), '/');
    }

    public function getSignatureUrlAttribute(): ?string
    {
        if (!$this->signature_path) {
            return null;
        }

        return '/storage/' . ltrim(preg_replace('/^public\//', '', (string) $this->signature_path), '/');
    }

    public function loanRequest()
    {
        return $this->belongsTo(MicrofinanceLoanRequest::class, 'mf_loan_request_id');
    }
}
