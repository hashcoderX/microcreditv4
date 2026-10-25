<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounting_loan_extra_charges', function (Blueprint $table) {
            if (!Schema::hasColumn('accounting_loan_extra_charges', 'product_type')) {
                $table->string('product_type', 30)->default('microfinance')->after('mf_loan_request_id');
            }

            if (!Schema::hasColumn('accounting_loan_extra_charges', 'source_loan_id')) {
                $table->unsignedBigInteger('source_loan_id')->nullable()->after('product_type');
                $table->index(['product_type', 'source_loan_id'], 'alc_product_source_idx');
            }

            if (!Schema::hasColumn('accounting_loan_extra_charges', 'extra_charges')) {
                $table->decimal('extra_charges', 14, 2)->nullable()->after('title');
            }
        });

        DB::table('accounting_loan_extra_charges')
            ->whereNull('source_loan_id')
            ->whereNotNull('mf_loan_request_id')
            ->update(['source_loan_id' => DB::raw('mf_loan_request_id')]);

        DB::table('accounting_loan_extra_charges')
            ->where(function ($query) {
                $query->whereNull('product_type')->orWhere('product_type', '');
            })
            ->update(['product_type' => 'microfinance']);

        DB::table('accounting_loan_extra_charges')
            ->whereNull('extra_charges')
            ->update(['extra_charges' => DB::raw('amount')]);
    }

    public function down(): void
    {
        Schema::table('accounting_loan_extra_charges', function (Blueprint $table) {
            if (Schema::hasColumn('accounting_loan_extra_charges', 'extra_charges')) {
                $table->dropColumn('extra_charges');
            }

            if (Schema::hasColumn('accounting_loan_extra_charges', 'source_loan_id')) {
                $table->dropIndex('alc_product_source_idx');
                $table->dropColumn('source_loan_id');
            }

            if (Schema::hasColumn('accounting_loan_extra_charges', 'product_type')) {
                $table->dropColumn('product_type');
            }
        });
    }
};
