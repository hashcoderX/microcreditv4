<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Department;
use App\Models\Designation;
use App\Models\Employee;
use App\Models\EmployeeAllowanceDeduction;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeAuthorizationScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_admin_index_and_show_are_branch_scoped(): void
    {
        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');
        [$departmentA, $designationA] = $this->createDepartmentAndDesignation($branchA);
        [$departmentB, $designationB] = $this->createDepartmentAndDesignation($branchB);

        $viewer = $this->createBranchUser($branchA, 'viewer.branch.a@example.com');
        $sameBranchEmployee = $this->createEmployee($branchA, $departmentA, $designationA, [
            'email' => 'same-branch.employee@example.com',
            'nic_passport' => 'EMP-NIC-1001',
        ]);
        $otherBranchEmployee = $this->createEmployee($branchB, $departmentB, $designationB, [
            'email' => 'other-branch.employee@example.com',
            'nic_passport' => 'EMP-NIC-1002',
        ]);

        Sanctum::actingAs($viewer);

        $this->getJson('/api/hr/employees')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $sameBranchEmployee->id);

        $this->getJson('/api/hr/employees/' . $sameBranchEmployee->id)
            ->assertOk()
            ->assertJsonPath('id', $sameBranchEmployee->id);

        $this->getJson('/api/hr/employees/' . $otherBranchEmployee->id)
            ->assertStatus(404);
    }

    public function test_non_admin_with_permissions_cannot_update_or_delete_cross_branch_employee(): void
    {
        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');
        [$departmentA, $designationA] = $this->createDepartmentAndDesignation($branchA);
        [$departmentB, $designationB] = $this->createDepartmentAndDesignation($branchB);

        $editor = $this->createBranchUser($branchA, 'editor.branch.a@example.com');
        $this->grantEmployeePermissions($editor, ['edit_employees', 'delete_employees']);

        $sameBranchEmployee = $this->createEmployee($branchA, $departmentA, $designationA, [
            'email' => 'editable.employee@example.com',
            'nic_passport' => 'EMP-NIC-2001',
        ]);
        $otherBranchEmployee = $this->createEmployee($branchB, $departmentB, $designationB, [
            'email' => 'blocked.employee@example.com',
            'nic_passport' => 'EMP-NIC-2002',
        ]);

        Sanctum::actingAs($editor);

        $this->putJson('/api/hr/employees/' . $otherBranchEmployee->id, [
            'first_name' => 'Blocked',
            'last_name' => 'Update',
            'hire_date' => '2026-01-01',
            'basic_salary' => 10000,
            'department_id' => $departmentB->id,
            'designation_id' => $designationB->id,
            'branch_id' => $branchB->id,
            'status' => 'active',
        ])->assertStatus(404);

        $this->deleteJson('/api/hr/employees/' . $otherBranchEmployee->id)
            ->assertStatus(404);

        $this->putJson('/api/hr/employees/' . $sameBranchEmployee->id, [
            'first_name' => 'Allowed',
            'last_name' => 'Update',
            'hire_date' => '2026-01-01',
            'basic_salary' => 12500,
            'department_id' => $departmentA->id,
            'designation_id' => $designationA->id,
            'branch_id' => $branchA->id,
            'status' => 'active',
        ])
            ->assertOk()
            ->assertJsonPath('first_name', 'Allowed');

        $this->deleteJson('/api/hr/employees/' . $sameBranchEmployee->id)
            ->assertOk();
    }

    public function test_employee_document_endpoints_are_scope_protected(): void
    {
        Storage::fake('public');

        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');
        [$departmentA, $designationA] = $this->createDepartmentAndDesignation($branchA);
        [$departmentB, $designationB] = $this->createDepartmentAndDesignation($branchB);

        $viewer = $this->createBranchUser($branchA, 'doc.viewer@example.com');
        $this->grantEmployeePermissions($viewer, ['edit_employees']);
        $sameBranchEmployee = $this->createEmployee($branchA, $departmentA, $designationA, [
            'email' => 'docs.same@example.com',
            'nic_passport' => 'EMP-NIC-3001',
        ]);
        $otherBranchEmployee = $this->createEmployee($branchB, $departmentB, $designationB, [
            'email' => 'docs.other@example.com',
            'nic_passport' => 'EMP-NIC-3002',
        ]);

        Sanctum::actingAs($viewer);

        $this->post('/api/hr/employees/' . $sameBranchEmployee->id . '/documents', [
            'type' => 'NIC Copy',
            'file' => UploadedFile::fake()->create('same-nic.pdf', 100, 'application/pdf'),
        ])->assertStatus(201);

        $this->post('/api/hr/employees/' . $otherBranchEmployee->id . '/documents', [
            'type' => 'NIC Copy',
            'file' => UploadedFile::fake()->create('other-nic.pdf', 100, 'application/pdf'),
        ])->assertStatus(404);

        $this->getJson('/api/hr/employees/' . $sameBranchEmployee->id . '/documents')
            ->assertOk();

        $this->getJson('/api/hr/employees/' . $otherBranchEmployee->id . '/documents')
            ->assertStatus(404);
    }

    public function test_allowance_deduction_update_cannot_reassign_employee_and_cross_branch_is_blocked(): void
    {
        $branchA = $this->createBranch('Branch A');
        $branchB = $this->createBranch('Branch B');
        [$departmentA, $designationA] = $this->createDepartmentAndDesignation($branchA);
        [$departmentB, $designationB] = $this->createDepartmentAndDesignation($branchB);

        $viewer = $this->createBranchUser($branchA, 'allowance.viewer@example.com');
        $this->grantEmployeePermissions($viewer, ['edit_employees']);
        $sameBranchEmployee = $this->createEmployee($branchA, $departmentA, $designationA, [
            'email' => 'allowance.same@example.com',
            'nic_passport' => 'EMP-NIC-4001',
        ]);
        $otherBranchEmployee = $this->createEmployee($branchB, $departmentB, $designationB, [
            'email' => 'allowance.other@example.com',
            'nic_passport' => 'EMP-NIC-4002',
        ]);

        $allowance = EmployeeAllowanceDeduction::query()->create([
            'employee_id' => $sameBranchEmployee->id,
            'name' => 'Transport',
            'amount' => 5000,
            'type' => 'allowance',
            'amount_type' => 'fixed',
            'is_active' => true,
        ]);

        Sanctum::actingAs($viewer);

        $this->putJson('/api/hr/employees/' . $sameBranchEmployee->id . '/allowances-deductions/' . $allowance->id, [
            'name' => 'Transport Revised',
            'employee_id' => $otherBranchEmployee->id,
            'amount' => 5500,
        ])
            ->assertOk()
            ->assertJsonPath('name', 'Transport Revised')
            ->assertJsonPath('employee_id', $sameBranchEmployee->id);

        $this->getJson('/api/hr/employees/' . $otherBranchEmployee->id . '/allowances-deductions')
            ->assertStatus(404);
    }

    public function test_user_without_edit_permission_cannot_mutate_employee_nested_resources(): void
    {
        Storage::fake('public');

        $branch = $this->createBranch('Main Branch');
        [$department, $designation] = $this->createDepartmentAndDesignation($branch);
        $viewer = $this->createBranchUser($branch, 'no.permission.viewer@example.com');
        $employee = $this->createEmployee($branch, $department, $designation, [
            'email' => 'nested.target@example.com',
            'nic_passport' => 'EMP-NIC-5001',
        ]);

        $education = $employee->educations()->create([
            'branch_id' => $employee->branch_id,
            'institution' => 'Institute',
            'degree' => 'BSc',
            'field_of_study' => 'IT',
            'start_date' => '2020-01-01',
            'end_date' => '2023-01-01',
        ]);

        $experience = $employee->experiences()->create([
            'branch_id' => $employee->branch_id,
            'company' => 'ABC Pvt',
            'role' => 'Officer',
            'start_date' => '2023-02-01',
        ]);

        $allowance = EmployeeAllowanceDeduction::query()->create([
            'employee_id' => $employee->id,
            'name' => 'Transport',
            'amount' => 500,
            'type' => 'allowance',
            'amount_type' => 'fixed',
            'is_active' => true,
        ]);

        $document = $employee->documents()->create([
            'branch_id' => $employee->branch_id,
            'type' => 'NIC Copy',
            'file_path' => 'employee_documents/existing-doc.pdf',
            'original_name' => 'existing-doc.pdf',
        ]);

        Sanctum::actingAs($viewer);

        $this->post('/api/hr/employees/' . $employee->id . '/documents', [
            'type' => 'Passport',
            'file' => UploadedFile::fake()->create('passport.pdf', 100, 'application/pdf'),
        ])->assertStatus(403);

        $this->deleteJson('/api/hr/employees/' . $employee->id . '/documents/' . $document->id)
            ->assertStatus(403);

        $this->postJson('/api/hr/employees/' . $employee->id . '/education', [
            'institution' => 'Blocked University',
        ])->assertStatus(403);

        $this->putJson('/api/hr/employees/' . $employee->id . '/education/' . $education->id, [
            'institution' => 'Blocked Update',
        ])->assertStatus(403);

        $this->deleteJson('/api/hr/employees/' . $employee->id . '/education/' . $education->id)
            ->assertStatus(403);

        $this->postJson('/api/hr/employees/' . $employee->id . '/experience', [
            'company' => 'Blocked Company',
            'role' => 'Blocked Role',
        ])->assertStatus(403);

        $this->putJson('/api/hr/employees/' . $employee->id . '/experience/' . $experience->id, [
            'role' => 'Blocked Update',
        ])->assertStatus(403);

        $this->deleteJson('/api/hr/employees/' . $employee->id . '/experience/' . $experience->id)
            ->assertStatus(403);

        $this->postJson('/api/hr/employees/' . $employee->id . '/allowances-deductions', [
            'name' => 'Blocked Allowance',
            'amount' => 100,
            'type' => 'allowance',
            'amount_type' => 'fixed',
        ])->assertStatus(403);

        $this->putJson('/api/hr/employees/' . $employee->id . '/allowances-deductions/' . $allowance->id, [
            'name' => 'Blocked Update',
        ])->assertStatus(403);

        $this->deleteJson('/api/hr/employees/' . $employee->id . '/allowances-deductions/' . $allowance->id)
            ->assertStatus(403);
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

    /** @return array{0: Department, 1: Designation} */
    private function createDepartmentAndDesignation(Company $branch): array
    {
        $department = Department::query()->create([
            'tenant_id' => $branch->id,
            'branch_id' => $branch->id,
            'name' => 'Operations ' . $branch->id,
            'description' => 'Operations Department',
            'is_active' => true,
        ]);

        $designation = Designation::query()->create([
            'tenant_id' => $branch->id,
            'branch_id' => $branch->id,
            'name' => 'Officer ' . $branch->id,
            'description' => 'Loan Officer',
            'salary_range_min' => 0,
            'salary_range_max' => 100000,
            'is_active' => true,
        ]);

        return [$department, $designation];
    }

    private function createBranchUser(Company $branch, string $email): User
    {
        return User::factory()->create([
            'branch_id' => $branch->id,
            'email' => $email,
        ]);
    }

    /** @param array<int, string> $permissionNames */
    private function grantEmployeePermissions(User $user, array $permissionNames): void
    {
        $role = Role::query()->create([
            'name' => 'Test HR Role ' . $user->id,
            'description' => 'Role for employee scope tests',
            'is_active' => true,
        ]);

        foreach ($permissionNames as $permissionName) {
            $permission = Permission::query()->firstOrCreate(
                ['name' => $permissionName],
                [
                    'module' => 'hr',
                    'description' => 'Test permission',
                    'is_active' => true,
                ]
            );

            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        $user->roles()->syncWithoutDetaching([
            $role->id => [
                'assigned_by' => $user->id,
                'assigned_at' => now(),
            ],
        ]);
    }

    private function createEmployee(Company $branch, Department $department, Designation $designation, array $overrides = []): Employee
    {
        static $counter = 1;

        $index = $counter++;
        $defaults = [
            'tenant_id' => $branch->id,
            'branch_id' => $branch->id,
            'employee_code' => 'EMP' . str_pad((string) (1000 + $index), 4, '0', STR_PAD_LEFT),
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'email' => 'employee-' . $index . '@example.test',
            'mobile' => '0710000' . str_pad((string) $index, 3, '0', STR_PAD_LEFT),
            'nic_passport' => 'NIC-' . str_pad((string) $index, 6, '0', STR_PAD_LEFT),
            'address' => 'No 1, Main Street',
            'date_of_birth' => '1990-01-01',
            'gender' => 'male',
            'department_id' => $department->id,
            'designation_id' => $designation->id,
            'join_date' => '2026-01-01',
            'basic_salary' => 10000,
            'employee_type' => 'full_time',
            'status' => 'active',
        ];

        $employee = Employee::query()->create(array_merge($defaults, $overrides));

        if (!$employee->user && empty($overrides['skip_user'])) {
            User::query()->create([
                'name' => trim(($employee->first_name ?? '') . ' ' . ($employee->last_name ?? '')),
                'email' => 'user-' . $employee->id . '@example.test',
                'password' => Hash::make('password1234'),
                'employee_id' => $employee->id,
                'branch_id' => $employee->branch_id,
                'designation_id' => $employee->designation_id,
            ]);
        }

        return $employee->fresh();
    }
}
