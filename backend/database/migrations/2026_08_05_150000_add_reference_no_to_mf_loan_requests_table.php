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
            if (!Schema::hasColumn('mf_loan_requests', 'reference_no')) {
                $table->string('reference_no', 100)->nullable()->after('loan_code');
                $table->index('reference_no', 'mf_loan_requests_reference_no_index');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'reference_no')) {
                $table->dropIndex('mf_loan_requests_reference_no_index');
                $table->dropColumn('reference_no');
            }
        });
    }
};
