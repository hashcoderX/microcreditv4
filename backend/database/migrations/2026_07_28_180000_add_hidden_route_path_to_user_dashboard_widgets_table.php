<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_dashboard_widgets', function (Blueprint $table) {
            $table->string('hidden_route_path', 255)->nullable()->after('is_visible');
            $table->index('hidden_route_path');
        });
    }

    public function down(): void
    {
        Schema::table('user_dashboard_widgets', function (Blueprint $table) {
            $table->dropIndex(['hidden_route_path']);
            $table->dropColumn('hidden_route_path');
        });
    }
};
