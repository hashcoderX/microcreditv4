<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('finances', function (Blueprint $table): void {
            if (!Schema::hasColumn('finances', 'document_charges')) {
                $table->decimal('document_charges', 15, 2)->default(0)->after('evaluation_payload_version');
            }

            if (!Schema::hasColumn('finances', 'insurance_charges')) {
                $table->decimal('insurance_charges', 15, 2)->default(0)->after('document_charges');
            }

            if (!Schema::hasColumn('finances', 'stamp_charges')) {
                $table->decimal('stamp_charges', 15, 2)->default(0)->after('insurance_charges');
            }

            if (!Schema::hasColumn('finances', 'processing_fee')) {
                $table->decimal('processing_fee', 15, 2)->default(0)->after('stamp_charges');
            }

            if (!Schema::hasColumn('finances', 'other_charges')) {
                $table->decimal('other_charges', 15, 2)->default(0)->after('processing_fee');
            }
        });
    }

    public function down(): void
    {
        Schema::table('finances', function (Blueprint $table): void {
            if (Schema::hasColumn('finances', 'other_charges')) {
                $table->dropColumn('other_charges');
            }

            if (Schema::hasColumn('finances', 'processing_fee')) {
                $table->dropColumn('processing_fee');
            }

            if (Schema::hasColumn('finances', 'stamp_charges')) {
                $table->dropColumn('stamp_charges');
            }

            if (Schema::hasColumn('finances', 'insurance_charges')) {
                $table->dropColumn('insurance_charges');
            }

            if (Schema::hasColumn('finances', 'document_charges')) {
                $table->dropColumn('document_charges');
            }
        });
    }
};
