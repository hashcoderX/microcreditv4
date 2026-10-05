<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_products', 'base_document_charge_allowed_months')) {
                $table->unsignedInteger('base_document_charge_allowed_months')
                    ->nullable()
                    ->after('document_charge_percentage');
            }

            if (!Schema::hasColumn('mf_loan_products', 'additional_document_charge_per_extra_month_percentage')) {
                $table->decimal('additional_document_charge_per_extra_month_percentage', 8, 4)
                    ->nullable()
                    ->after('base_document_charge_allowed_months');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_products', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_products', 'additional_document_charge_per_extra_month_percentage')) {
                $table->dropColumn('additional_document_charge_per_extra_month_percentage');
            }

            if (Schema::hasColumn('mf_loan_products', 'base_document_charge_allowed_months')) {
                $table->dropColumn('base_document_charge_allowed_months');
            }
        });
    }
};
