<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'penalty_scheme')) {
                $table->string('penalty_scheme', 40)
                    ->default('daily_percentage')
                    ->after('terms_count');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'penalty_scheme')) {
                $table->dropColumn('penalty_scheme');
            }
        });
    }
};
