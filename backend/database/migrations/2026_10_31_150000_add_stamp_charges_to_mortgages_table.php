<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mortgages', function (Blueprint $table): void {
            if (!Schema::hasColumn('mortgages', 'stamp_charges')) {
                $table->decimal('stamp_charges', 10, 2)->default(0)->after('document_charges');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mortgages', function (Blueprint $table): void {
            if (Schema::hasColumn('mortgages', 'stamp_charges')) {
                $table->dropColumn('stamp_charges');
            }
        });
    }
};
