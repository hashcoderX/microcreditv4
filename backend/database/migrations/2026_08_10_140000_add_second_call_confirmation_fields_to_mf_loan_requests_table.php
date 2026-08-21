<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'second_call_confirmation_payload')) {
                $table->json('second_call_confirmation_payload')->nullable()->after('cash_allocated_at');
            }

            if (!Schema::hasColumn('mf_loan_requests', 'second_call_confirmed_at')) {
                $table->dateTime('second_call_confirmed_at')->nullable()->after('second_call_confirmation_payload');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'second_call_confirmed_at')) {
                $table->dropColumn('second_call_confirmed_at');
            }

            if (Schema::hasColumn('mf_loan_requests', 'second_call_confirmation_payload')) {
                $table->dropColumn('second_call_confirmation_payload');
            }
        });
    }
};
