<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_products', 'document_charge_percentage')) {
                $table->decimal('document_charge_percentage', 8, 4)->nullable()->after('max_loan_amount');
            }

            if (!Schema::hasColumn('mf_loan_products', 'stamp_charge_percentage')) {
                $table->decimal('stamp_charge_percentage', 8, 4)->nullable()->after('document_charge_percentage');
            }

            if (!Schema::hasColumn('mf_loan_products', 'insurance_charge_percentage')) {
                $table->decimal('insurance_charge_percentage', 8, 4)->nullable()->after('stamp_charge_percentage');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_products', 'insurance_charge_percentage')) {
                $table->dropColumn('insurance_charge_percentage');
            }
            if (Schema::hasColumn('mf_loan_products', 'stamp_charge_percentage')) {
                $table->dropColumn('stamp_charge_percentage');
            }
            if (Schema::hasColumn('mf_loan_products', 'document_charge_percentage')) {
                $table->dropColumn('document_charge_percentage');
            }
        });
    }
};
