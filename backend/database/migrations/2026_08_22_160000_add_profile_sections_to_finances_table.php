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
        Schema::table('finances', function (Blueprint $table) {
            if (!Schema::hasColumn('finances', 'family_financial_details')) {
                $table->json('family_financial_details')->nullable()->after('guarantor_details');
            }

            if (!Schema::hasColumn('finances', 'evaluation_payload')) {
                $table->json('evaluation_payload')->nullable()->after('family_financial_details');
            }

            if (!Schema::hasColumn('finances', 'evaluation_payload_version')) {
                $table->unsignedTinyInteger('evaluation_payload_version')->nullable()->after('evaluation_payload');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('finances', function (Blueprint $table) {
            if (Schema::hasColumn('finances', 'evaluation_payload_version')) {
                $table->dropColumn('evaluation_payload_version');
            }

            if (Schema::hasColumn('finances', 'evaluation_payload')) {
                $table->dropColumn('evaluation_payload');
            }

            if (Schema::hasColumn('finances', 'family_financial_details')) {
                $table->dropColumn('family_financial_details');
            }
        });
    }
};
