<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerAuthorizationScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_same_branch_user_can_access_scoped_customer_records(): void
    {
        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');

        $user = $this->createBranchUser($branchA, 'staff.branch.a@example.com');
        $sameBranchCustomer = $this->createCustomer($user, $branchA, [
            'customer_code' => 'CUS-260909-10001',
            'nic_passport' => '199001010001',
        ]);
        $this->createCustomer($user, $branchB, [
            'customer_code' => 'CUS-260909-10002',
            'nic_passport' => '199001010002',
            'email' => 'cross-branch@example.com',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/customers')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $sameBranchCustomer->id);

        $this->getJson('/api/customers/' . $sameBranchCustomer->id)
            ->assertOk()
            ->assertJsonPath('id', $sameBranchCustomer->id);

        $this->getJson('/api/customers/by-code/' . $sameBranchCustomer->customer_code)
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('data.id', $sameBranchCustomer->id);

        $this->getJson('/api/customers/finance-lookup?search_by=nic_passport&q=' . $sameBranchCustomer->nic_passport)
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('data.id', $sameBranchCustomer->id);

        $this->getJson('/api/customers/finance-search?customer_no=' . $sameBranchCustomer->customer_code)
            ->assertOk()
            ->assertJsonPath('count', 1);
    }

    public function test_non_admin_cannot_access_cross_branch_customer_by_id_or_lookup(): void
    {
        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');

        $user = $this->createBranchUser($branchA, 'staff.scope@example.com');
        $otherBranchCustomer = $this->createCustomer($user, $branchB, [
            'customer_code' => 'CUS-260909-20001',
            'nic_passport' => '199001010101',
            'email' => 'other-branch@example.com',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/customers/' . $otherBranchCustomer->id)
            ->assertStatus(404);

        $this->getJson('/api/customers/by-code/' . $otherBranchCustomer->customer_code)
            ->assertOk()
            ->assertJsonPath('found', false);

        $this->getJson('/api/customers/finance-lookup?search_by=nic_passport&q=' . $otherBranchCustomer->nic_passport)
            ->assertOk()
            ->assertJsonPath('found', false);

        $this->getJson('/api/customers/finance-search?customer_no=' . $otherBranchCustomer->customer_code)
            ->assertOk()
            ->assertJsonPath('count', 0);
    }

    public function test_admin_can_access_cross_branch_customers(): void
    {
        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');

        $admin = $this->createBranchUser($branchA, 'superadmin@softcodelk.com');
        $otherBranchCustomer = $this->createCustomer($admin, $branchB, [
            'customer_code' => 'CUS-260909-30001',
            'nic_passport' => '199001010201',
            'email' => 'admin-cross-branch@example.com',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/customers/' . $otherBranchCustomer->id)
            ->assertOk()
            ->assertJsonPath('id', $otherBranchCustomer->id);

        $this->getJson('/api/customers/by-code/' . $otherBranchCustomer->customer_code)
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('data.id', $otherBranchCustomer->id);

        $this->getJson('/api/customers/finance-lookup?search_by=nic_passport&q=' . $otherBranchCustomer->nic_passport)
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('data.id', $otherBranchCustomer->id);
    }

    public function test_non_admin_update_and_delete_are_blocked_for_cross_branch_customer(): void
    {
        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');

        $user = $this->createBranchUser($branchA, 'staff.update.delete@example.com');
        $otherBranchCustomer = $this->createCustomer($user, $branchB, [
            'customer_code' => 'CUS-260909-40001',
            'nic_passport' => '199001010301',
            'email' => 'cross-update-delete@example.com',
        ]);

        Sanctum::actingAs($user);

        $this->putJson('/api/customers/' . $otherBranchCustomer->id, [
            'first_name' => 'BlockedName',
        ])->assertStatus(404);

        $this->assertDatabaseMissing('customers', [
            'id' => $otherBranchCustomer->id,
            'first_name' => 'BlockedName',
        ]);

        $this->deleteJson('/api/customers/' . $otherBranchCustomer->id)
            ->assertStatus(404);

        $this->assertDatabaseHas('customers', [
            'id' => $otherBranchCustomer->id,
        ]);
    }

    public function test_same_branch_update_and_delete_are_allowed(): void
    {
        $branchA = $this->createBranch('Branch A');

        $user = $this->createBranchUser($branchA, 'staff.same-branch@example.com');
        $customer = $this->createCustomer($user, $branchA, [
            'customer_code' => 'CUS-260909-50001',
            'nic_passport' => '199001010401',
            'email' => 'same-branch-update@example.com',
        ]);

        Sanctum::actingAs($user);

        $this->putJson('/api/customers/' . $customer->id, [
            'first_name' => 'UpdatedName',
            'phone' => '0710000000',
            'date_of_birth' => '1990-01-01',
            'gender' => 'male',
            'permanent_address' => 'Updated Address',
        ])
            ->assertOk()
            ->assertJsonPath('first_name', 'UpdatedName');

        $this->deleteJson('/api/customers/' . $customer->id)
            ->assertStatus(204);

        $this->assertDatabaseMissing('customers', [
            'id' => $customer->id,
        ]);
    }

    public function test_photo_lookup_and_upload_are_scope_protected(): void
    {
        Storage::fake('public');

        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');

        $user = $this->createBranchUser($branchA, 'staff.photo.scope@example.com');

        $sameBranchCustomer = $this->createCustomer($user, $branchA, [
            'customer_code' => 'CUS-260909-60001',
            'nic_passport' => '199001010501',
            'email' => 'same-photo@example.com',
            'photo_path' => 'customer_photos/same.jpg',
        ]);

        $otherBranchCustomer = $this->createCustomer($user, $branchB, [
            'customer_code' => 'CUS-260909-60002',
            'nic_passport' => '199001010502',
            'email' => 'other-photo@example.com',
            'photo_path' => 'customer_photos/other.jpg',
        ]);

        Storage::disk('public')->put('customer_photos/same.jpg', 'same');
        Storage::disk('public')->put('customer_photos/other.jpg', 'other');

        Sanctum::actingAs($user);

        $this->get('/api/customers/by-code/' . $sameBranchCustomer->customer_code . '/photo')
            ->assertStatus(200);

        $this->get('/api/customers/by-code/' . $otherBranchCustomer->customer_code . '/photo')
            ->assertStatus(204);

        $this->postJson('/api/customers/by-code/' . $otherBranchCustomer->customer_code . '/photo', [
            'photo' => UploadedFile::fake()->image('blocked.jpg'),
        ])->assertStatus(404);

        $this->postJson('/api/customers/by-code/' . $sameBranchCustomer->customer_code . '/photo', [
            'photo' => UploadedFile::fake()->image('allowed.jpg'),
        ])
            ->assertOk();

        $sameBranchCustomer->refresh();
        $this->assertNotNull($sameBranchCustomer->photo_path);
        $this->assertNotSame('customer_photos/same.jpg', $sameBranchCustomer->photo_path);
    }

    public function test_customer_document_endpoints_are_scope_protected(): void
    {
        Storage::fake('public');

        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');

        $user = $this->createBranchUser($branchA, 'staff.docs.scope@example.com');
        $sameBranchCustomer = $this->createCustomer($user, $branchA, [
            'customer_code' => 'CUS-260909-70001',
            'nic_passport' => '199001010601',
            'email' => 'same-docs@example.com',
        ]);

        $otherBranchCustomer = $this->createCustomer($user, $branchB, [
            'customer_code' => 'CUS-260909-70002',
            'nic_passport' => '199001010602',
            'email' => 'other-docs@example.com',
        ]);

        $sameBranchFilePath = 'public/customers/' . $sameBranchCustomer->id . '/same-proof.pdf';
        Storage::put($sameBranchFilePath, 'same-branch-document');

        $sameBranchDocument = CustomerDocument::query()->create([
            'customer_id' => $sameBranchCustomer->id,
            'document_type' => 'NIC Copy',
            'file_path' => $sameBranchFilePath,
            'original_name' => 'same-proof.pdf',
            'uploaded_by' => $user->id,
        ]);

        $otherBranchFilePath = 'public/customers/' . $otherBranchCustomer->id . '/other-proof.pdf';
        Storage::put($otherBranchFilePath, 'other-branch-document');

        $otherBranchDocument = CustomerDocument::query()->create([
            'customer_id' => $otherBranchCustomer->id,
            'document_type' => 'NIC Copy',
            'file_path' => $otherBranchFilePath,
            'original_name' => 'other-proof.pdf',
            'uploaded_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/customers/' . $sameBranchCustomer->id . '/documents')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/customers/' . $otherBranchCustomer->id . '/documents')
            ->assertStatus(404);

        $this->post('/api/customers/' . $sameBranchCustomer->id . '/documents', [
            'document_type' => 'Paysheet',
            'file' => UploadedFile::fake()->create('allowed-paysheet.pdf', 100, 'application/pdf'),
        ])->assertStatus(201);

        $this->post('/api/customers/' . $otherBranchCustomer->id . '/documents', [
            'document_type' => 'Paysheet',
            'file' => UploadedFile::fake()->create('blocked-paysheet.pdf', 100, 'application/pdf'),
        ])->assertStatus(404);

        $this->get('/api/customers/' . $sameBranchCustomer->id . '/documents/' . $sameBranchDocument->id . '/download')
            ->assertOk();

        $this->get('/api/customers/' . $otherBranchCustomer->id . '/documents/' . $otherBranchDocument->id . '/download')
            ->assertStatus(404);

        $this->deleteJson('/api/customers/' . $sameBranchCustomer->id . '/documents/' . $sameBranchDocument->id)
            ->assertStatus(204);

        $this->deleteJson('/api/customers/' . $otherBranchCustomer->id . '/documents/' . $otherBranchDocument->id)
            ->assertStatus(404);
    }

    public function test_customer_photo_media_route_requires_valid_signature(): void
    {
        Storage::fake('public');

        $branch = $this->createBranch('Branch A');
        $user = $this->createBranchUser($branch, 'staff.media.route@example.com');

        $customer = $this->createCustomer($user, $branch, [
            'customer_code' => 'CUS-260909-80001',
            'nic_passport' => '199001010701',
            'email' => 'media-route@example.com',
            'photo_path' => 'customer_photos/signed-photo.jpg',
        ]);

        Storage::disk('public')->put('customer_photos/signed-photo.jpg', 'signed-photo-bytes');

        $this->get('/media/customers/' . $customer->id . '/photo')
            ->assertStatus(403);

        $signedUrl = URL::temporarySignedRoute('customer.photo', now()->addMinutes(10), [
            'customer' => $customer->id,
        ]);

        $this->get($signedUrl)
            ->assertOk();
    }

    private function createBranch(string $name): Company
    {
        $slug = strtolower(str_replace(' ', '-', $name));

        return Company::query()->create([
            'name' => $name,
            'email' => $slug . '@company.test',
            'address' => 'Address for ' . $name,
        ]);
    }

    private function createBranchUser(Company $branch, string $email): User
    {
        return User::factory()->create([
            'branch_id' => $branch->id,
            'email' => $email,
        ]);
    }

    private function createCustomer(User $creator, Company $branch, array $overrides = []): Customer
    {
        $defaults = [
            'tenant_id' => $branch->id,
            'branch_id' => $branch->id,
            'customer_code' => 'CUS-' . now()->format('ymd') . '-' . str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'email' => 'customer-' . random_int(1000, 9999) . '@example.test',
            'phone' => '0771234567',
            'nic_passport' => (string) random_int(100000000000, 999999999999),
            'permanent_address' => 'No 1, Main Street',
            'date_of_birth' => '1990-01-01',
            'gender' => 'female',
            'created_by' => $creator->id,
            'status' => 'active',
        ];

        return Customer::query()->create(array_merge($defaults, $overrides));
    }
}
