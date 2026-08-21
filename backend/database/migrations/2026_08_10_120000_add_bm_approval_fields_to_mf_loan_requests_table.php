<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'bm_approval_payload')) {
                $table->json('bm_approval_payload')->nullable()->after('call_confirmed_at');
            }

            if (!Schema::hasColumn('mf_loan_requests', 'bm_approved_at')) {
                $table->dateTime('bm_approved_at')->nullable()->after('bm_approval_payload');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'bm_approved_at')) {
                $table->dropColumn('bm_approved_at');
            }

            if (Schema::hasColumn('mf_loan_requests', 'bm_approval_payload')) {
                $table->dropColumn('bm_approval_payload');
            }
        });
    }
};
