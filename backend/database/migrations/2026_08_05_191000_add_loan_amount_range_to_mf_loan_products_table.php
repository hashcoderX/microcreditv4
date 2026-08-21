<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_products', 'min_loan_amount')) {
                $table->decimal('min_loan_amount', 14, 2)->nullable()->after('name');
            }

            if (!Schema::hasColumn('mf_loan_products', 'max_loan_amount')) {
                $table->decimal('max_loan_amount', 14, 2)->nullable()->after('min_loan_amount');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_products', 'max_loan_amount')) {
                $table->dropColumn('max_loan_amount');
            }

            if (Schema::hasColumn('mf_loan_products', 'min_loan_amount')) {
                $table->dropColumn('min_loan_amount');
            }
        });
    }
};
