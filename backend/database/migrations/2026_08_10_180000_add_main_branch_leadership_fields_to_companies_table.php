<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->boolean('is_main_branch')->default(false)->after('manager_user_id');
            $table->unsignedBigInteger('business_owner_user_id')->nullable()->after('is_main_branch');
            $table->unsignedBigInteger('ceo_user_id')->nullable()->after('business_owner_user_id');
            $table->unsignedBigInteger('regional_manager_user_id')->nullable()->after('ceo_user_id');

            $table->foreign('business_owner_user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('ceo_user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('regional_manager_user_id')->references('id')->on('users')->nullOnDelete();
        });

        $firstCompanyId = DB::table('companies')->orderBy('id')->value('id');
        if ($firstCompanyId) {
            DB::table('companies')->where('id', $firstCompanyId)->update(['is_main_branch' => true]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropForeign(['business_owner_user_id']);
            $table->dropForeign(['ceo_user_id']);
            $table->dropForeign(['regional_manager_user_id']);
            $table->dropColumn([
                'is_main_branch',
                'business_owner_user_id',
                'ceo_user_id',
                'regional_manager_user_id',
            ]);
        });
    }
};
