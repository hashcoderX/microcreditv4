<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement("ALTER TABLE savings_account_transactions MODIFY transaction_type ENUM('deposit', 'withdrawal', 'interest_credit') NOT NULL");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement("UPDATE savings_account_transactions SET transaction_type = 'deposit' WHERE transaction_type = 'interest_credit'");
        DB::statement("ALTER TABLE savings_account_transactions MODIFY transaction_type ENUM('deposit', 'withdrawal') NOT NULL");
    }
};
