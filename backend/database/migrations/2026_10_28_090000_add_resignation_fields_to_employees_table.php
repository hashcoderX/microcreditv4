<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('employees')) {
            return;
        }

        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'resigned_at')) {
                $table->date('resigned_at')->nullable()->after('status');
            }
            if (!Schema::hasColumn('employees', 'resigned_by')) {
                $table->unsignedBigInteger('resigned_by')->nullable()->after('resigned_at');
            }
            if (!Schema::hasColumn('employees', 'resignation_meta')) {
                $table->json('resignation_meta')->nullable()->after('resigned_by');
            }
        });

        if (Schema::hasColumn('employees', 'resigned_by')) {
            Schema::table('employees', function (Blueprint $table) {
                try {
                    $table->foreign('resigned_by')->references('id')->on('users')->nullOnDelete();
                } catch (\Throwable) {
                    // Skip if foreign key already exists.
                }
            });
        }

        DB::statement("ALTER TABLE employees MODIFY status ENUM('active','inactive','resigned') NOT NULL DEFAULT 'active'");
    }

    public function down(): void
    {
        if (!Schema::hasTable('employees')) {
            return;
        }

        DB::statement("UPDATE employees SET status = 'inactive' WHERE status = 'resigned'");
        DB::statement("ALTER TABLE employees MODIFY status ENUM('active','inactive') NOT NULL DEFAULT 'active'");

        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'resigned_by')) {
                try {
                    $table->dropForeign(['resigned_by']);
                } catch (\Throwable) {
                    // Skip if foreign key does not exist.
                }
            }
        });

        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'resignation_meta')) {
                $table->dropColumn('resignation_meta');
            }
            if (Schema::hasColumn('employees', 'resigned_by')) {
                $table->dropColumn('resigned_by');
            }
            if (Schema::hasColumn('employees', 'resigned_at')) {
                $table->dropColumn('resigned_at');
            }
        });
    }
};
