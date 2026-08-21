<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mf_loan_guarantors', function (Blueprint $table) {
            if (!Schema::hasColumn('mf_loan_guarantors', 'image_path')) {
                $table->string('image_path')->nullable()->after('relationship');
            }

            if (!Schema::hasColumn('mf_loan_guarantors', 'image_original_name')) {
                $table->string('image_original_name')->nullable()->after('image_path');
            }

            if (!Schema::hasColumn('mf_loan_guarantors', 'signature_path')) {
                $table->string('signature_path')->nullable()->after('image_original_name');
            }

            if (!Schema::hasColumn('mf_loan_guarantors', 'signature_original_name')) {
                $table->string('signature_original_name')->nullable()->after('signature_path');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mf_loan_guarantors', function (Blueprint $table) {
            if (Schema::hasColumn('mf_loan_guarantors', 'signature_original_name')) {
                $table->dropColumn('signature_original_name');
            }

            if (Schema::hasColumn('mf_loan_guarantors', 'signature_path')) {
                $table->dropColumn('signature_path');
            }

            if (Schema::hasColumn('mf_loan_guarantors', 'image_original_name')) {
                $table->dropColumn('image_original_name');
            }

            if (Schema::hasColumn('mf_loan_guarantors', 'image_path')) {
                $table->dropColumn('image_path');
            }
        });
    }
};
