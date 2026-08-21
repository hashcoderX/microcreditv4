<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('customers', 'employment_type')) {
            return;
        }

        DB::statement("ALTER TABLE customers MODIFY employment_type VARCHAR(120) NULL");
    }

    public function down(): void
    {
        if (!Schema::hasColumn('customers', 'employment_type')) {
            return;
        }

        DB::statement("ALTER TABLE customers MODIFY employment_type ENUM('salaried','self_employed','business') NULL");
    }
};
