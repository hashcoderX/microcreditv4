<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_products', 'interest_calculation_scheme')) {
                $table->enum('interest_calculation_scheme', ['day', 'week', 'month', 'year'])
                    ->default('month')
                    ->after('interest_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_products', 'interest_calculation_scheme')) {
                $table->dropColumn('interest_calculation_scheme');
            }
        });
    }
};
