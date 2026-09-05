<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mf_action_center_step_roles', function (Blueprint $table) {
            $table->id();
            $table->unsignedTinyInteger('workflow_step')->unique();
            $table->boolean('allow_all_roles')->default(false);
            $table->json('role_ids')->nullable();
            $table->unsignedBigInteger('updated_by_user_id')->nullable();
            $table->timestamps();

            $table->index('updated_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mf_action_center_step_roles');
    }
};
