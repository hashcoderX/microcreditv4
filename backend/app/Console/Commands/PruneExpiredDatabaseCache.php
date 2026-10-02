<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PruneExpiredDatabaseCache extends Command
{
    protected $signature = 'cache:prune-expired-database {--chunk=1000 : Number of rows to delete per batch} {--dry-run : Only show how many rows would be deleted}';

    protected $description = 'Delete only expired rows from the database cache table in small safe batches';

    public function handle(): int
    {
        $defaultStore = (string) config('cache.default', '');
        if ($defaultStore !== 'database') {
            $this->warn('Skipping prune: default cache store is not database.');
            return self::SUCCESS;
        }

        $table = (string) config('cache.stores.database.table', 'cache');
        if (!Schema::hasTable($table)) {
            $this->error("Cache table '{$table}' not found.");
            return self::FAILURE;
        }

        $chunk = max((int) $this->option('chunk'), 100);
        $now = time();

        $expiredCount = DB::table($table)
            ->where('expiration', '<=', $now)
            ->count();

        if ($expiredCount === 0) {
            $this->info('No expired cache rows found.');
            return self::SUCCESS;
        }

        if ((bool) $this->option('dry-run')) {
            $this->info("Dry run: {$expiredCount} expired cache rows would be deleted from {$table}.");
            return self::SUCCESS;
        }

        $deleted = 0;

        do {
            $keys = DB::table($table)
                ->where('expiration', '<=', $now)
                ->limit($chunk)
                ->pluck('key')
                ->all();

            if (empty($keys)) {
                break;
            }

            $affected = DB::table($table)
                ->whereIn('key', $keys)
                ->delete();

            $deleted += $affected;
        } while (!empty($keys));

        $this->info("Deleted {$deleted} expired cache rows from {$table}.");

        return self::SUCCESS;
    }
}
