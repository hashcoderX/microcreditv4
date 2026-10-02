<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MicrofinanceCenter;
use App\Models\MicrofinanceGroup;
use App\Models\MicrofinanceLoanCollection;
use App\Models\MicrofinanceLoanRequest;
use App\Models\MicrofinanceRoute;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MicrofinanceCollectionsCachePolicyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'cache.default' => 'database',
            'cache.stores.database.connection' => config('database.default'),
            'cache.stores.database.table' => 'cache',
        ]);

        Cache::flush();
    }

    public function test_compact_bounded_collection_list_is_cached(): void
    {
        [$user, $loanRequest] = $this->makeLoanRequestContext();
        $this->seedCollections($loanRequest, 2);

        Sanctum::actingAs($user);

        $this->getJson('/api/microfinance/collections?compact=1&limit=50')
            ->assertOk()
            ->assertJsonCount(2);

        $cachedCount = DB::table('cache')
            ->where('key', 'like', '%mf_collections:index:%compact_1:%limit_50%')
            ->count();

        $this->assertSame(1, $cachedCount);
    }

    public function test_non_compact_unbounded_collection_list_is_not_cached(): void
    {
        [$user, $loanRequest] = $this->makeLoanRequestContext();
        $this->seedCollections($loanRequest, 1);

        Sanctum::actingAs($user);

        $this->getJson('/api/microfinance/collections?compact=0')
            ->assertOk();

        $cachedCount = DB::table('cache')
            ->where('key', 'like', '%mf_collections:index:%compact_0:%limit_all%')
            ->count();

        $this->assertSame(0, $cachedCount);
    }

    public function test_paginated_collection_list_returns_meta_and_is_not_cached(): void
    {
        [$user, $loanRequest] = $this->makeLoanRequestContext();
        $this->seedCollections($loanRequest, 3);

        Sanctum::actingAs($user);

        $this->getJson('/api/microfinance/collections?compact=1&per_page=2&page=2')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.page', 2)
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.last_page', 2);

        $cachedCount = DB::table('cache')
            ->where('key', 'like', '%mf_collections:index:%per_page_2%')
            ->count();

        $this->assertSame(0, $cachedCount);
    }

    public function test_cache_registry_is_invalidated_after_collection_delete(): void
    {
        [$adminUser, $loanRequest] = $this->makeLoanRequestContext(true);
        $collection = $this->seedCollections($loanRequest, 1)->first();

        Sanctum::actingAs($adminUser);

        $this->getJson('/api/microfinance/collections?compact=1&limit=10')
            ->assertOk();

        $beforeDelete = DB::table('cache')
            ->where('key', 'like', '%mf_collections:index:%compact_1:%limit_10%')
            ->count();

        $this->assertSame(1, $beforeDelete);

        $this->deleteJson('/api/microfinance/collections/' . $collection->id, [
            'deletion_reason' => 'Regression test delete',
        ])->assertOk();

        $afterDelete = DB::table('cache')
            ->where('key', 'like', '%mf_collections:index:%compact_1:%limit_10%')
            ->count();

        $this->assertSame(0, $afterDelete);
    }

    /**
     * @return array{0: User, 1: MicrofinanceLoanRequest}
     */
    private function makeLoanRequestContext(bool $adminUser = false): array
    {
        $branch = Company::query()->create([
            'name' => 'Branch A',
            'email' => 'branch-a@example.com',
            'address' => 'Address',
            'phone' => '0710000000',
        ]);

        $route = MicrofinanceRoute::query()->create([
            'name' => 'Route A',
            'code' => 'R-A',
            'is_active' => true,
        ]);

        $group = MicrofinanceGroup::query()->create([
            'mf_route_id' => $route->id,
            'name' => 'Group A',
            'code' => 'G-A',
            'is_active' => true,
        ]);

        $center = MicrofinanceCenter::query()->create([
            'mf_route_id' => $route->id,
            'name' => 'Center A',
            'code' => 'C-A',
            'meeting_day' => 'monday',
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'email' => $adminUser ? 'superadmin@softcodelk.com' : 'staff.collections@example.com',
            'branch_id' => $branch->id,
        ]);

        $loanRequest = MicrofinanceLoanRequest::query()->create([
            'branch_id' => $branch->id,
            'loan_scope' => 'center_loan',
            'mf_route_id' => $route->id,
            'mf_center_id' => $center->id,
            'mf_group_id' => $group->id,
            'manager_name' => 'Manager',
            'field_officer' => 'Officer',
            'group_leader' => 'Leader',
            'customer_no' => 'CUS-1001',
            'customer_name' => 'Customer 1',
            'nic' => '199001010001',
            'address' => 'Address',
            'contact_no' => '0771234567',
            'loan_amount' => 10000,
            'refund_option' => 'week',
            'interest_rate' => 10,
            'terms_count' => 10,
            'refundable_amount' => 11000,
            'installment_amount' => 1100,
            'document_charges' => 0,
            'loan_request_date' => now()->toDateString(),
            'status' => 'approved',
            'created_by' => $user->id,
        ]);

        return [$user, $loanRequest];
    }

    /**
     * @return \Illuminate\Support\Collection<int, MicrofinanceLoanCollection>
     */
    private function seedCollections(MicrofinanceLoanRequest $loanRequest, int $count)
    {
        $rows = collect();

        for ($i = 0; $i < $count; $i++) {
            $rows->push(MicrofinanceLoanCollection::query()->create([
                'mf_loan_request_id' => $loanRequest->id,
                'collection_date' => now()->subDays($i)->toDateString(),
                'collected_amount' => 1000 + ($i * 10),
                'capital_amount' => 900 + ($i * 10),
                'interest_amount' => 100,
                'penalty_amount' => 0,
                'note' => 'Test collection',
                'created_by' => null,
            ]));
        }

        return $rows;
    }
}
