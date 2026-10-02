<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PruneExpiredDatabaseCacheCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_does_not_delete_rows_and_prune_removes_only_expired_rows(): void
    {
        config([
            'cache.default' => 'database',
            'cache.stores.database.connection' => config('database.default'),
            'cache.stores.database.table' => 'cache',
        ]);

        $now = time();

        DB::table('cache')->insert([
            [
                'key' => 'laravel-cache-expired-row',
                'value' => serialize('expired'),
                'expiration' => $now - 60,
            ],
            [
                'key' => 'laravel-cache-active-row',
                'value' => serialize('active'),
                'expiration' => $now + 3600,
            ],
        ]);

        $this->artisan('cache:prune-expired-database --dry-run')
            ->assertExitCode(0);

        $this->assertDatabaseHas('cache', ['key' => 'laravel-cache-expired-row']);
        $this->assertDatabaseHas('cache', ['key' => 'laravel-cache-active-row']);

        $this->artisan('cache:prune-expired-database --chunk=100')
            ->assertExitCode(0);

        $this->assertDatabaseMissing('cache', ['key' => 'laravel-cache-expired-row']);
        $this->assertDatabaseHas('cache', ['key' => 'laravel-cache-active-row']);
    }

    public function test_command_skips_when_default_cache_store_is_not_database(): void
    {
        config(['cache.default' => 'array']);

        $this->artisan('cache:prune-expired-database')
            ->assertExitCode(0);
    }
}
