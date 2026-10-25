<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mortgages', function (Blueprint $table) {
            if (!Schema::hasColumn('mortgages', 'start_date')) {
                $table->date('start_date')->nullable()->after('insurance_fee');
            }

            if (!Schema::hasColumn('mortgages', 'previous_mortgages')) {
                $table->text('previous_mortgages')->nullable()->after('start_date');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mortgages', function (Blueprint $table) {
            if (Schema::hasColumn('mortgages', 'previous_mortgages')) {
                $table->dropColumn('previous_mortgages');
            }

            if (Schema::hasColumn('mortgages', 'start_date')) {
                $table->dropColumn('start_date');
            }
        });
    }
};
