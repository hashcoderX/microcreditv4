<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('accounting_loan_extra_charges')) {
            return;
        }

        Schema::create('accounting_loan_extra_charges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->foreignId('mf_loan_request_id')->nullable()->constrained('mf_loan_requests')->nullOnDelete();
            $table->date('charge_date');
            $table->string('charge_type', 40);
            $table->string('title', 190);
            $table->decimal('amount', 14, 2);
            $table->boolean('apply_to_loan_balance')->default(true);
            $table->string('reference_no', 80)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'charge_date'], 'alc_company_date_idx');
            $table->index(['mf_loan_request_id', 'charge_date'], 'alc_loan_date_idx');
            $table->index(['charge_type', 'charge_date'], 'alc_type_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_loan_extra_charges');
    }
};
