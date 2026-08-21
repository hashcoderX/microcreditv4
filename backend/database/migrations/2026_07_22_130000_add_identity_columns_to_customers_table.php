<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'passport_no')) {
                $table->string('passport_no')->nullable()->after('nic_passport');
                $table->unique('passport_no');
            }

            if (!Schema::hasColumn('customers', 'driving_license_no')) {
                $table->string('driving_license_no')->nullable()->after('passport_no');
                $table->unique('driving_license_no');
            }

            if (!Schema::hasColumn('customers', 'tax_identification_no')) {
                $table->string('tax_identification_no')->nullable()->after('driving_license_no');
                $table->unique('tax_identification_no');
            }

            if (!Schema::hasColumn('customers', 'biometric_reference')) {
                $table->string('biometric_reference')->nullable()->after('tax_identification_no');
            }
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'biometric_reference')) {
                $table->dropColumn('biometric_reference');
            }

            if (Schema::hasColumn('customers', 'tax_identification_no')) {
                $table->dropUnique('customers_tax_identification_no_unique');
                $table->dropColumn('tax_identification_no');
            }

            if (Schema::hasColumn('customers', 'driving_license_no')) {
                $table->dropUnique('customers_driving_license_no_unique');
                $table->dropColumn('driving_license_no');
            }

            if (Schema::hasColumn('customers', 'passport_no')) {
                $table->dropUnique('customers_passport_no_unique');
                $table->dropColumn('passport_no');
            }
        });
    }
};
