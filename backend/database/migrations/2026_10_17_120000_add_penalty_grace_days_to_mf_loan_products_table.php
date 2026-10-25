<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_products', 'penalty_grace_days')) {
                $table->unsignedInteger('penalty_grace_days')->default(2)->after('refund_option');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_products', 'penalty_grace_days')) {
                $table->dropColumn('penalty_grace_days');
            }
        });
    }
};
