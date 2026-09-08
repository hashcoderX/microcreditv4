<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE savings_accounts MODIFY account_type ENUM('savings', 'current', 'fixed_deposit', 'investment') NOT NULL DEFAULT 'savings'"
            );
        }

        Schema::table('savings_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('savings_accounts', 'interest_type')) {
                $table->string('interest_type', 40)->default('simple_interest')->after('interest_rate');
            }
        });
    }

    public function down(): void
    {
        Schema::table('savings_accounts', function (Blueprint $table) {
            if (Schema::hasColumn('savings_accounts', 'interest_type')) {
                $table->dropColumn('interest_type');
            }
        });

        DB::statement(
            "UPDATE savings_accounts SET account_type = 'savings' WHERE account_type = 'investment'"
        );
        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE savings_accounts MODIFY account_type ENUM('savings', 'current', 'fixed_deposit') NOT NULL DEFAULT 'savings'"
            );
        }
    }
};
