<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('mf_loan_requests', function (Blueprint $table) {
            $table->timestamp('hold_at')->nullable()->after('rejected_at');
            $table->text('hold_reason')->nullable()->after('hold_at');
            $table->timestamp('closed_at')->nullable()->after('hold_reason');
            $table->text('closed_reason')->nullable()->after('closed_at');
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE mf_loan_requests MODIFY status ENUM('requested','approved','released','rejected','hold','closed') NOT NULL DEFAULT 'requested'");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE mf_loan_requests MODIFY status ENUM('requested','approved','released','rejected') NOT NULL DEFAULT 'requested'");
        }

        Schema::table('mf_loan_requests', function (Blueprint $table) {
            $table->dropColumn(['hold_at', 'hold_reason', 'closed_at', 'closed_reason']);
        });
    }
};
