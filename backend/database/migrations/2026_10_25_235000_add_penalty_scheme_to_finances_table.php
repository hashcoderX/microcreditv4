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
        if (!Schema::hasTable('finances')) {
            return;
        }

        Schema::table('finances', function (Blueprint $table) {
            if (!Schema::hasColumn('finances', 'penalty_scheme')) {
                $table->string('penalty_scheme', 64)
                    ->nullable()
                    ->after('penalty');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('finances')) {
            return;
        }

        Schema::table('finances', function (Blueprint $table) {
            if (Schema::hasColumn('finances', 'penalty_scheme')) {
                $table->dropColumn('penalty_scheme');
            }
        });
    }
};
