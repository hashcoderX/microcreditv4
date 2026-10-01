<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_message_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('module', 80)->default('General')->index();
            $table->string('reference', 120)->nullable()->index();
            $table->string('customer_name', 160)->nullable()->index();
            $table->string('phone', 30)->nullable()->index();
            $table->text('message');
            $table->string('status', 20)->index();
            $table->string('error_message', 500)->nullable();
            $table->integer('provider_status_code')->nullable()->index();
            $table->text('provider_response')->nullable();
            $table->timestamp('sent_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_message_logs');
    }
};
