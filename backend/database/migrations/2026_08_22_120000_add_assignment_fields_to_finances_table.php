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
        Schema::table('finances', function (Blueprint $table) {
            if (!Schema::hasColumn('finances', 'branch_manager_user_id')) {
                $table->unsignedBigInteger('branch_manager_user_id')->nullable()->after('start_date');
            }

            if (!Schema::hasColumn('finances', 'responsible_officer_employee_id')) {
                $table->unsignedBigInteger('responsible_officer_employee_id')->nullable()->after('branch_manager_user_id');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('finances', function (Blueprint $table) {
            if (Schema::hasColumn('finances', 'responsible_officer_employee_id')) {
                $table->dropColumn('responsible_officer_employee_id');
            }

            if (Schema::hasColumn('finances', 'branch_manager_user_id')) {
                $table->dropColumn('branch_manager_user_id');
            }
        });
    }
};
