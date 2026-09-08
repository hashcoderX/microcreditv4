<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_wallet_cash_handovers', function (Blueprint $table) {
            if (!Schema::hasColumn('employee_wallet_cash_handovers', 'manager_employee_id')) {
                $table->unsignedBigInteger('manager_employee_id')->nullable()->after('cash_account_id');
                $table->foreign('manager_employee_id')->references('id')->on('employees')->nullOnDelete();
                $table->index('manager_employee_id', 'ewch_manager_employee_idx');
            }
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE employee_wallet_cash_handovers MODIFY cash_account_id BIGINT UNSIGNED NULL');
        }
    }

    public function down(): void
    {
        Schema::table('employee_wallet_cash_handovers', function (Blueprint $table) {
            if (Schema::hasColumn('employee_wallet_cash_handovers', 'manager_employee_id')) {
                $table->dropIndex('ewch_manager_employee_idx');
                $table->dropForeign(['manager_employee_id']);
                $table->dropColumn('manager_employee_id');
            }

        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE employee_wallet_cash_handovers MODIFY cash_account_id BIGINT UNSIGNED NOT NULL');
        }
    }
};
