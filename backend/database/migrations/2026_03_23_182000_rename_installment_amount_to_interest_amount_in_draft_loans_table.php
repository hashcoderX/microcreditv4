<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            if (Schema::hasTable('draft_loans')
                && Schema::hasColumn('draft_loans', 'installment_amount')
                && !Schema::hasColumn('draft_loans', 'interest_amount')) {
                DB::statement('ALTER TABLE draft_loans RENAME COLUMN installment_amount TO interest_amount');
            }

            return;
        }

        DB::statement('ALTER TABLE draft_loans CHANGE installment_amount interest_amount DECIMAL(15,2) NOT NULL DEFAULT 0');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            if (Schema::hasTable('draft_loans')
                && Schema::hasColumn('draft_loans', 'interest_amount')
                && !Schema::hasColumn('draft_loans', 'installment_amount')) {
                DB::statement('ALTER TABLE draft_loans RENAME COLUMN interest_amount TO installment_amount');
            }

            return;
        }

        DB::statement('ALTER TABLE draft_loans CHANGE interest_amount installment_amount DECIMAL(15,2) NOT NULL DEFAULT 0');
    }
};
