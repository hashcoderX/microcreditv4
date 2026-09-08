<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('savings_account_transactions')) {
            Schema::create('savings_account_transactions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('savings_account_id')->constrained('savings_accounts')->cascadeOnDelete();
                $table->enum('transaction_type', ['deposit', 'withdrawal']);
                $table->decimal('amount', 15, 2);
                $table->decimal('balance_before', 15, 2)->default(0);
                $table->decimal('balance_after', 15, 2)->default(0);
                $table->date('transaction_date')->nullable();
                $table->string('reference_no', 100)->nullable();
                $table->string('note', 255)->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
            });
        }

        if (!$this->indexExists('savings_account_transactions', 'sat_account_date_idx')) {
            Schema::table('savings_account_transactions', function (Blueprint $table) {
                $table->index(['savings_account_id', 'transaction_date'], 'sat_account_date_idx');
            });
        }

        if (!$this->indexExists('savings_account_transactions', 'sat_type_date_idx')) {
            Schema::table('savings_account_transactions', function (Blueprint $table) {
                $table->index(['transaction_type', 'transaction_date'], 'sat_type_date_idx');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('savings_account_transactions');
    }

    private function indexExists(string $table, string $indexName): bool
    {
        if (DB::getDriverName() === 'sqlite') {
            $indexes = DB::select("PRAGMA index_list('{$table}')");

            foreach ($indexes as $index) {
                $name = is_array($index) ? ($index['name'] ?? null) : ($index->name ?? null);

                if ($name === $indexName) {
                    return true;
                }
            }

            return false;
        }

        $database = DB::getDatabaseName();

        $count = DB::table('information_schema.statistics')
            ->where('table_schema', $database)
            ->where('table_name', $table)
            ->where('index_name', $indexName)
            ->count();

        return $count > 0;
    }
};
