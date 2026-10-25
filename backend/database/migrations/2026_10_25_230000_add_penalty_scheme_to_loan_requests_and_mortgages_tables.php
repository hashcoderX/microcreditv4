<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('loan_requests') && !Schema::hasColumn('loan_requests', 'penalty_scheme')) {
            Schema::table('loan_requests', function (Blueprint $table): void {
                $table->string('penalty_scheme', 64)
                    ->nullable()
                    ->after('installment_frequency');
            });
        }

        if (Schema::hasTable('mortgages') && !Schema::hasColumn('mortgages', 'penalty_scheme')) {
            Schema::table('mortgages', function (Blueprint $table): void {
                $table->string('penalty_scheme', 64)
                    ->nullable()
                    ->after('penalty_rate');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('loan_requests') && Schema::hasColumn('loan_requests', 'penalty_scheme')) {
            Schema::table('loan_requests', function (Blueprint $table): void {
                $table->dropColumn('penalty_scheme');
            });
        }

        if (Schema::hasTable('mortgages') && Schema::hasColumn('mortgages', 'penalty_scheme')) {
            Schema::table('mortgages', function (Blueprint $table): void {
                $table->dropColumn('penalty_scheme');
            });
        }
    }
};
