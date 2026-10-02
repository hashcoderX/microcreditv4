<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MicrofinanceCenter;
use App\Models\MicrofinanceGroup;
use App\Models\MicrofinanceLoanRequest;
use App\Models\MicrofinanceRoute;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MicrofinanceLoanRequestFieldOfficerScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_field_officer_can_view_assigned_issued_loans_in_index(): void
    {
        $branch = Company::query()->create([
            'name' => 'Branch One',
            'email' => 'branch-one@example.com',
            'address' => 'Address',
            'phone' => '0710000000',
        ]);

        $route = MicrofinanceRoute::query()->create([
            'name' => 'Route One',
            'code' => 'R-1',
            'is_active' => true,
        ]);

        $group = MicrofinanceGroup::query()->create([
            'mf_route_id' => $route->id,
            'name' => 'Group One',
            'code' => 'G-1',
            'is_active' => true,
        ]);

        $center = MicrofinanceCenter::query()->create([
            'mf_route_id' => $route->id,
            'name' => 'Center One',
            'code' => 'C-1',
            'meeting_day' => 'monday',
            'is_active' => true,
        ]);

        $fieldOfficer = User::factory()->create([
            'name' => 'Field Officer A',
            'email' => 'field.officer.a@example.com',
            'branch_id' => $branch->id,
        ]);

        $creator = User::factory()->create([
            'name' => 'Creator User',
            'email' => 'creator.user@example.com',
            'branch_id' => $branch->id,
        ]);

        $loan = MicrofinanceLoanRequest::query()->create([
            'branch_id' => $branch->id,
            'loan_scope' => 'center_loan',
            'mf_route_id' => $route->id,
            'mf_center_id' => $center->id,
            'mf_group_id' => $group->id,
            'manager_name' => 'Manager',
            'field_officer' => 'Field Officer A',
            'group_leader' => 'Leader',
            'customer_no' => 'CUS-FO-1001',
            'customer_name' => 'Customer Fo',
            'nic' => '199001010777',
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
            'created_by' => $creator->id,
        ]);

        Sanctum::actingAs($fieldOfficer);

        $response = $this->getJson('/api/microfinance/loan-requests');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $loan->id);
        $response->assertJsonPath('0.field_officer', 'Field Officer A');
    }
}
