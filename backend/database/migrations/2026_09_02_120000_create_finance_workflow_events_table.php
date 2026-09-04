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
        Schema::create('finance_workflow_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('finance_id')->constrained('finances')->cascadeOnDelete();
            $table->string('event_type', 40);
            $table->unsignedTinyInteger('from_step')->nullable();
            $table->unsignedTinyInteger('to_step')->nullable();
            $table->string('step_title', 120)->nullable();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 60)->nullable();
            $table->text('note')->nullable();
            $table->json('event_payload')->nullable();
            $table->json('workflow_snapshot')->nullable();
            $table->timestamps();

            $table->index(['finance_id', 'created_at']);
            $table->index(['finance_id', 'to_step']);
            $table->index(['event_type', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('finance_workflow_events');
    }
};
