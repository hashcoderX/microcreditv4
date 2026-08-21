<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'approval_employee_id')) {
                $table->foreignId('approval_employee_id')
                    ->nullable()
                    ->after('manager_name')
                    ->constrained('employees')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'approval_employee_id')) {
                $table->dropForeign(['approval_employee_id']);
                $table->dropColumn('approval_employee_id');
            }
        });
    }
};
