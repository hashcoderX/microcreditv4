<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'old_nic')) {
                $table->string('old_nic', 60)->nullable()->unique()->after('nic_passport');
            }
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'old_nic')) {
                $table->dropUnique('customers_old_nic_unique');
                $table->dropColumn('old_nic');
            }
        });
    }
};
