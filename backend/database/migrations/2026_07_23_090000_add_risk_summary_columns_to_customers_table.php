<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'risk_total_score')) {
                $table->integer('risk_total_score')->nullable()->after('credit_score');
            }

            if (!Schema::hasColumn('customers', 'risk_grade')) {
                $table->string('risk_grade', 40)->nullable()->after('risk_total_score');
            }
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'risk_grade')) {
                $table->dropColumn('risk_grade');
            }

            if (Schema::hasColumn('customers', 'risk_total_score')) {
                $table->dropColumn('risk_total_score');
            }
        });
    }
};
