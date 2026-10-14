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
        if (!Schema::hasTable('mortgage_guarantors')) {
            return;
        }

        Schema::table('mortgage_guarantors', function (Blueprint $table) {
            if (!Schema::hasColumn('mortgage_guarantors', 'address')) {
                $table->text('address')->nullable()->after('relationship');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('mortgage_guarantors')) {
            return;
        }

        Schema::table('mortgage_guarantors', function (Blueprint $table) {
            if (Schema::hasColumn('mortgage_guarantors', 'address')) {
                $table->dropColumn('address');
            }
        });
    }
};
