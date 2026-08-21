<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'document_verification_payload')) {
                $table->json('document_verification_payload')->nullable()->after('second_call_confirmed_at');
            }

            if (!Schema::hasColumn('mf_loan_requests', 'document_verified_at')) {
                $table->dateTime('document_verified_at')->nullable()->after('document_verification_payload');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'document_verified_at')) {
                $table->dropColumn('document_verified_at');
            }

            if (Schema::hasColumn('mf_loan_requests', 'document_verification_payload')) {
                $table->dropColumn('document_verification_payload');
            }
        });
    }
};
