<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'call_confirmation_payload')) {
                $table->json('call_confirmation_payload')->nullable()->after('evaluation_payload_version');
            }

            if (!Schema::hasColumn('mf_loan_requests', 'call_confirmed_at')) {
                $table->dateTime('call_confirmed_at')->nullable()->after('call_confirmation_payload');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'call_confirmed_at')) {
                $table->dropColumn('call_confirmed_at');
            }

            if (Schema::hasColumn('mf_loan_requests', 'call_confirmation_payload')) {
                $table->dropColumn('call_confirmation_payload');
            }
        });
    }
};
