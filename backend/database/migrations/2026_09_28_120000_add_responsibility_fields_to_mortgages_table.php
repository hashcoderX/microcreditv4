<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mortgages', function (Blueprint $table) {
            if (!Schema::hasColumn('mortgages', 'responsible_manager_user_id')) {
                $table->unsignedBigInteger('responsible_manager_user_id')->nullable()->after('approved_by');
                $table->foreign('responsible_manager_user_id')->references('id')->on('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('mortgages', 'responsible_manager_name')) {
                $table->string('responsible_manager_name', 120)->nullable()->after('responsible_manager_user_id');
            }

            if (!Schema::hasColumn('mortgages', 'entry_officer_name')) {
                $table->string('entry_officer_name', 120)->nullable()->after('created_by');
            }

            if (!Schema::hasColumn('mortgages', 'entry_officer_designation')) {
                $table->string('entry_officer_designation', 120)->nullable()->after('entry_officer_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mortgages', function (Blueprint $table) {
            if (Schema::hasColumn('mortgages', 'responsible_manager_user_id')) {
                $table->dropForeign(['responsible_manager_user_id']);
                $table->dropColumn('responsible_manager_user_id');
            }

            if (Schema::hasColumn('mortgages', 'responsible_manager_name')) {
                $table->dropColumn('responsible_manager_name');
            }

            if (Schema::hasColumn('mortgages', 'entry_officer_name')) {
                $table->dropColumn('entry_officer_name');
            }

            if (Schema::hasColumn('mortgages', 'entry_officer_designation')) {
                $table->dropColumn('entry_officer_designation');
            }
        });
    }
};
