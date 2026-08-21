<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_requests', 'workflow_step')) {
                $table->unsignedTinyInteger('workflow_step')->default(1)->after('status');
            }

            if (!Schema::hasColumn('mf_loan_requests', 'workflow_step_updated_at')) {
                $table->timestamp('workflow_step_updated_at')->nullable()->after('workflow_step');
            }
        });

        DB::table('mf_loan_requests')
            ->whereNull('workflow_step_updated_at')
            ->update([
                'workflow_step_updated_at' => DB::raw('COALESCE(updated_at, created_at, NOW())'),
            ]);

        DB::table('mf_loan_requests')
            ->whereIn('status', ['approved', 'released', 'closed'])
            ->update([
                'workflow_step' => 14,
                'workflow_step_updated_at' => DB::raw('COALESCE(updated_at, created_at, NOW())'),
            ]);

        DB::table('mf_loan_requests')
            ->whereNotIn('status', ['approved', 'released', 'closed'])
            ->where(function ($query) {
                $query->whereNull('workflow_step')->orWhere('workflow_step', '<', 1);
            })
            ->update([
                'workflow_step' => 1,
                'workflow_step_updated_at' => DB::raw('COALESCE(updated_at, created_at, NOW())'),
            ]);
    }

    public function down(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_requests', 'workflow_step_updated_at')) {
                $table->dropColumn('workflow_step_updated_at');
            }

            if (Schema::hasColumn('mf_loan_requests', 'workflow_step')) {
                $table->dropColumn('workflow_step');
            }
        });
    }
};
