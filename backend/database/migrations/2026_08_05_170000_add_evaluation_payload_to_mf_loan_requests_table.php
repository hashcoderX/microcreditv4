<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'evaluation_payload')) {
                $table->json('evaluation_payload')->nullable()->after('bank_account_no');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'evaluation_payload')) {
                $table->dropColumn('evaluation_payload');
            }
        });
    }
};
