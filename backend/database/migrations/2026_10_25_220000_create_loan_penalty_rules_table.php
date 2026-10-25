<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loan_penalty_rules', function (Blueprint $table) {
            $table->id();
            $table->string('identification', 120);
            $table->string('applicable_for', 30);
            $table->string('penalty_type', 40);
            $table->string('value_mode', 20)->default('amount');
            $table->decimal('amount_or_rate', 14, 4)->default(0);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('display_order')->default(0);
            $table->timestamps();

            $table->index(['applicable_for', 'is_active']);
            $table->index(['display_order', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_penalty_rules');
    }
};
