<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'extra_document_charges')) {
                $table->decimal('extra_document_charges', 15, 2)
                    ->default(0)
                    ->after('document_charges');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'extra_document_charges')) {
                $table->dropColumn('extra_document_charges');
            }
        });
    }
};
