<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'cash_allocation_payload')) {
                $table->json('cash_allocation_payload')->nullable()->after('bm_approved_at');
            }

            if (!Schema::hasColumn('mf_loan_requests', 'cash_allocated_at')) {
                $table->dateTime('cash_allocated_at')->nullable()->after('cash_allocation_payload');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'cash_allocated_at')) {
                $table->dropColumn('cash_allocated_at');
            }

            if (Schema::hasColumn('mf_loan_requests', 'cash_allocation_payload')) {
                $table->dropColumn('cash_allocation_payload');
            }
        });
    }
};
