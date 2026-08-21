<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_products', 'assumed_month_days')) {
                $table->unsignedTinyInteger('assumed_month_days')->default(30)->after('refund_option');
            }
        });

        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'assumed_month_days')) {
                $table->unsignedTinyInteger('assumed_month_days')->default(30)->after('refund_option');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_products', 'assumed_month_days')) {
                $table->dropColumn('assumed_month_days');
            }
        });

        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'assumed_month_days')) {
                $table->dropColumn('assumed_month_days');
            }
        });
    }
};
