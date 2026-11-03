<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mortgages', function (Blueprint $table): void {
            if (!Schema::hasColumn('mortgages', 'document_charges')) {
                $table->decimal('document_charges', 10, 2)->default(0)->after('processing_fee');
            }

            if (!Schema::hasColumn('mortgages', 'additional_charges')) {
                $table->decimal('additional_charges', 10, 2)->default(0)->after('document_charges');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mortgages', function (Blueprint $table): void {
            if (Schema::hasColumn('mortgages', 'additional_charges')) {
                $table->dropColumn('additional_charges');
            }

            if (Schema::hasColumn('mortgages', 'document_charges')) {
                $table->dropColumn('document_charges');
            }
        });
    }
};
