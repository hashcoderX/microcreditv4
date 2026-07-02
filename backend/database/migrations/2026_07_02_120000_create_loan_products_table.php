<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loan_products', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->default(1);
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->string('name', 255);
            $table->string('description', 255)->nullable();
            $table->string('icon', 16)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'branch_id', 'name'], 'loan_products_tenant_branch_name_unique');
            $table->index(['tenant_id', 'branch_id', 'is_active'], 'loan_products_scope_active_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_products');
    }
};
