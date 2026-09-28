<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mortgages', function (Blueprint $table) {
            if (!Schema::hasColumn('mortgages', 'mortgage_qr_code')) {
                $table->string('mortgage_qr_code', 64)->nullable()->after('responsible_manager_name');
                $table->unique('mortgage_qr_code', 'mortgages_qr_code_unique');
            }

            if (!Schema::hasColumn('mortgages', 'mortgage_qr_generated_at')) {
                $table->timestamp('mortgage_qr_generated_at')->nullable()->after('mortgage_qr_code');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mortgages', function (Blueprint $table) {
            if (Schema::hasColumn('mortgages', 'mortgage_qr_generated_at')) {
                $table->dropColumn('mortgage_qr_generated_at');
            }

            if (Schema::hasColumn('mortgages', 'mortgage_qr_code')) {
                $table->dropUnique('mortgages_qr_code_unique');
                $table->dropColumn('mortgage_qr_code');
            }
        });
    }
};
