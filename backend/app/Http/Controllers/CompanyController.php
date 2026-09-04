<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Employee;
use App\Models\Candidate;
use App\Models\CompanyAccount;
use App\Models\CompanyLeadershipAssignment;
use App\Models\Department;
use App\Models\Designation;
use App\Models\Role;
use App\Models\User;
use App\Services\SmsGatewayService;
use App\Services\WhatsappGatewayService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;
use Throwable;
use ZipArchive;

class CompanyController extends Controller
{
        /**
         * @return array<int, string>
         */
        private function leadershipRoleTypes(): array
        {
            return [
                CompanyLeadershipAssignment::ROLE_BUSINESS_OWNER,
                CompanyLeadershipAssignment::ROLE_CEO,
                CompanyLeadershipAssignment::ROLE_REGIONAL_MANAGER,
                CompanyLeadershipAssignment::ROLE_ZONAL_MANAGER,
            ];
        }

        /**
         * @param array<string, mixed> $validated
         * @return array<int, array{role_type:string,user_id:int}>
         */
        private function normalizeLeadershipAssignments(array $validated): array
        {
            $rows = $validated['leadership_assignments'] ?? [];
            if (!is_array($rows)) {
                return [];
            }

            return collect($rows)
                ->filter(static fn ($row) => is_array($row))
                ->map(static function (array $row): array {
                    return [
                        'role_type' => strtolower(trim((string) ($row['role_type'] ?? ''))),
                        'user_id' => (int) ($row['user_id'] ?? 0),
                    ];
                })
                ->filter(static fn (array $row): bool => $row['role_type'] !== '' && $row['user_id'] > 0)
                ->unique(static fn (array $row): string => $row['role_type'] . '::' . $row['user_id'])
                ->values()
                ->all();
        }

        /**
         * @param array<int, array{role_type:string,user_id:int}> $rows
         */
        private function leadershipUserIdByRole(array $rows, string $roleType): ?int
        {
            foreach ($rows as $row) {
                if (($row['role_type'] ?? '') === $roleType && (int) ($row['user_id'] ?? 0) > 0) {
                    return (int) $row['user_id'];
                }
            }

            return null;
        }

        /**
         * @param array<int, array{role_type:string,user_id:int}> $rows
         */
        private function syncLeadershipAssignments(Company $company, array $rows): void
        {
            $company->leadershipAssignments()->delete();

            if (empty($rows)) {
                return;
            }

            $company->leadershipAssignments()->createMany($rows);
        }

        private function isSystemOnline(): bool
        {
            if (!Schema::hasTable('system_settings')) {
                return true;
            }

            $value = DB::table('system_settings')->where('key', 'system_online')->value('value');
            return (string) ($value ?? '1') === '1';
        }

        private function setSystemOnlineValue(bool $isOnline): void
        {
            DB::table('system_settings')->updateOrInsert(
                ['key' => 'system_online'],
                [
                    'value' => $isOnline ? '1' : '0',
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }

        public function getSystemStatus(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can view system status.'
                ], 403);
            }

            return response()->json([
                'is_online' => $this->isSystemOnline(),
            ]);
        }

        public function updateSystemStatus(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can change system status.'
                ], 403);
            }

            $validated = $request->validate([
                'is_online' => 'required|boolean',
            ]);

            $isOnline = (bool) $validated['is_online'];
            $this->setSystemOnlineValue($isOnline);

            return response()->json([
                'message' => $isOnline ? 'System is now online.' : 'System is now offline for non-admin users.',
                'is_online' => $isOnline,
            ]);
        }

        public function getSmsGatewayConfig(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can view SMS gateway configuration.'
                ], 403);
            }

            $service = app(SmsGatewayService::class);
            return response()->json([
                'config' => $service->sanitizedConfigForApi(),
            ]);
        }

        public function updateSmsGatewayConfig(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can update SMS gateway configuration.'
                ], 403);
            }

            $validated = $request->validate([
                'enabled' => 'required|boolean',
                'provider_name' => 'nullable|string|max:120',
                'endpoint_url' => 'nullable|string|max:255',
                'http_method' => 'nullable|in:GET,POST',
                'auth_type' => 'nullable|in:none,bearer,basic,api_key',
                'username' => 'nullable|string|max:120',
                'password' => 'nullable|string|max:255',
                'auth_token' => 'nullable|string|max:255',
                'api_key_header' => 'nullable|string|max:120',
                'api_key_value' => 'nullable|string|max:255',
                'sender_id' => 'nullable|string|max:100',
                'timeout_seconds' => 'nullable|integer|min:3|max:60',
                'message_template' => 'nullable|string|max:500',
            ]);

            $service = app(SmsGatewayService::class);
            $config = [
                'enabled' => (bool) ($validated['enabled'] ?? false),
                'provider_name' => trim((string) ($validated['provider_name'] ?? '')),
                'endpoint_url' => trim((string) ($validated['endpoint_url'] ?? '')),
                'http_method' => strtoupper((string) ($validated['http_method'] ?? 'POST')),
                'auth_type' => strtolower((string) ($validated['auth_type'] ?? 'none')),
                'username' => (string) ($validated['username'] ?? ''),
                'password' => (string) ($validated['password'] ?? ''),
                'auth_token' => (string) ($validated['auth_token'] ?? ''),
                'api_key_header' => trim((string) ($validated['api_key_header'] ?? 'X-API-Key')),
                'api_key_value' => (string) ($validated['api_key_value'] ?? ''),
                'sender_id' => trim((string) ($validated['sender_id'] ?? '')),
                'timeout_seconds' => (int) ($validated['timeout_seconds'] ?? 10),
                'message_template' => trim((string) ($validated['message_template'] ?? '')),
            ];
            $service->saveConfig($config);

            return response()->json([
                'message' => 'SMS gateway configuration saved.',
                'config' => $service->sanitizedConfigForApi(),
            ]);
        }

        public function testSmsGateway(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can test SMS gateway.'
                ], 403);
            }

            $validated = $request->validate([
                'phone' => 'required|string|max:30',
                'message' => 'nullable|string|max:500',
            ]);

            $service = app(SmsGatewayService::class);
            $message = trim((string) ($validated['message'] ?? 'Test SMS from Global Capital system.'));
            $result = $service->send((string) $validated['phone'], $message);

            return response()->json($result, $result['ok'] ? 200 : 422);
        }

        public function getWhatsappGatewayConfig(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can view WhatsApp gateway configuration.'
                ], 403);
            }

            $service = app(WhatsappGatewayService::class);
            return response()->json([
                'config' => $service->sanitizedConfigForApi(),
            ]);
        }

        public function updateWhatsappGatewayConfig(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can update WhatsApp gateway configuration.'
                ], 403);
            }

            $validated = $request->validate([
                'enabled' => 'required|boolean',
                'provider_name' => 'nullable|string|max:120',
                'endpoint_url' => 'nullable|string|max:255',
                'http_method' => 'nullable|in:GET,POST',
                'auth_type' => 'nullable|in:none,bearer,basic,api_key',
                'username' => 'nullable|string|max:120',
                'password' => 'nullable|string|max:255',
                'auth_token' => 'nullable|string|max:255',
                'api_key_header' => 'nullable|string|max:120',
                'api_key_value' => 'nullable|string|max:255',
                'sender_id' => 'nullable|string|max:100',
                'timeout_seconds' => 'nullable|integer|min:3|max:60',
                'message_template' => 'nullable|string|max:500',
            ]);

            $service = app(WhatsappGatewayService::class);
            $config = [
                'enabled' => (bool) ($validated['enabled'] ?? false),
                'provider_name' => trim((string) ($validated['provider_name'] ?? '')),
                'endpoint_url' => trim((string) ($validated['endpoint_url'] ?? '')),
                'http_method' => strtoupper((string) ($validated['http_method'] ?? 'POST')),
                'auth_type' => strtolower((string) ($validated['auth_type'] ?? 'none')),
                'username' => (string) ($validated['username'] ?? ''),
                'password' => (string) ($validated['password'] ?? ''),
                'auth_token' => (string) ($validated['auth_token'] ?? ''),
                'api_key_header' => trim((string) ($validated['api_key_header'] ?? 'X-API-Key')),
                'api_key_value' => (string) ($validated['api_key_value'] ?? ''),
                'sender_id' => trim((string) ($validated['sender_id'] ?? '')),
                'timeout_seconds' => (int) ($validated['timeout_seconds'] ?? 10),
                'message_template' => trim((string) ($validated['message_template'] ?? '')),
            ];
            $service->saveConfig($config);

            return response()->json([
                'message' => 'WhatsApp gateway configuration saved.',
                'config' => $service->sanitizedConfigForApi(),
            ]);
        }

        public function testWhatsappGateway(Request $request)
        {
            $user = $request->user();
            if (!$user || !$user->isSystemAdmin()) {
                return response()->json([
                    'message' => 'Only admins can test WhatsApp gateway.'
                ], 403);
            }

            $validated = $request->validate([
                'phone' => 'required|string|max:30',
                'message' => 'nullable|string|max:500',
            ]);

            $service = app(WhatsappGatewayService::class);
            $message = trim((string) ($validated['message'] ?? 'Test WhatsApp message from Global Capital system.'));
            $result = $service->send((string) $validated['phone'], $message);

            return response()->json($result, $result['ok'] ? 200 : 422);
        }

    private const DEFAULT_SUPER_ADMIN_EMAIL = 'superadmin@softcodelk.com';

    public function index()
    {
        $companies = Company::with([
            'manager:id,name,email',
            'businessOwner:id,name,email',
            'ceo:id,name,email',
            'regionalManager:id,name,email',
            'leadershipAssignments.user:id,name,email',
        ])->get();
        return response()->json($companies);
    }

    public function show(Company $company)
    {
        return response()->json($company->load([
            'manager:id,name,email',
            'businessOwner:id,name,email',
            'ceo:id,name,email',
            'regionalManager:id,name,email',
            'leadershipAssignments.user:id,name,email',
        ]));
    }

    public function managerCandidates()
    {
        $users = User::query()
            ->select(['id', 'name', 'email', 'designation_id'])
            ->with(['designation:id,name', 'roles:id,name'])
            ->where(function ($query) {
                $query->whereHas('designation', function ($designationQuery) {
                    $designationQuery->where('name', 'like', '%manager%')
                        ->orWhere('name', 'like', '%ceo%')
                        ->orWhere('name', 'like', '%owner%')
                        ->orWhere('name', 'like', '%regional%')
                        ->orWhere('name', 'like', '%admin%');
                })->orWhereHas('roles', function ($roleQuery) {
                    $roleQuery->where('name', 'like', '%manager%')
                        ->orWhere('name', 'like', '%admin%')
                        ->orWhere('name', 'like', '%owner%')
                        ->orWhere('name', 'like', '%ceo%')
                        ->orWhere('name', 'like', '%regional%');
                })->orWhereRaw('LOWER(name) LIKE ?', ['%owner%'])
                    ->orWhereRaw('LOWER(name) LIKE ?', ['%ceo%'])
                    ->orWhereRaw('LOWER(name) LIKE ?', ['%regional%']);
            })
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:companies',
            'super_admin_password' => 'required|string|min:8',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'secondary_phone' => 'nullable|string|max:30',
            'whatsapp_no' => 'nullable|string|max:30',
            'website' => 'nullable|url',
            'country' => 'nullable|string|max:100',
            'currency' => 'nullable|string|max:10',
            'logo_path' => 'nullable|string|max:255',
            'manager_user_id' => 'nullable|exists:users,id',
            'business_owner_user_id' => 'nullable|exists:users,id',
            'ceo_user_id' => 'nullable|exists:users,id',
            'regional_manager_user_id' => 'nullable|exists:users,id',
            'leadership_assignments' => 'nullable|array',
            'leadership_assignments.*.role_type' => ['required_with:leadership_assignments', Rule::in($this->leadershipRoleTypes())],
            'leadership_assignments.*.user_id' => 'required_with:leadership_assignments|exists:users,id',
            'opening_asset' => 'nullable|numeric|min:0',
            'cash_opening_balance' => 'nullable|numeric|min:0',
            'bank_name' => 'nullable|string|max:190',
            'bank_branch' => 'nullable|string|max:190',
            'bank_account_number' => 'nullable|string|max:80',
            'bank_opening_balance' => 'nullable|numeric|min:0',
            'bank_accounts' => 'nullable|array',
            'bank_accounts.*.bank_name' => 'required_with:bank_accounts|string|max:190',
            'bank_accounts.*.bank_branch' => 'nullable|string|max:190',
            'bank_accounts.*.account_number' => 'nullable|string|max:80',
            'bank_accounts.*.account_name' => 'nullable|string|max:190',
            'bank_accounts.*.opening_balance' => 'nullable|numeric|min:0',
        ]);

        if (User::query()->whereRaw('LOWER(email) = ?', [strtolower(trim((string) $validated['email']))])->exists()) {
            return response()->json([
                'errors' => [
                    'email' => ['This email is already used by an existing user account.'],
                ],
                'message' => 'Validation failed.',
            ], 422);
        }

        $companyPayload = collect($validated)->only([
            'name',
            'email',
            'address',
            'phone',
            'secondary_phone',
            'whatsapp_no',
            'website',
            'country',
            'currency',
            'logo_path',
            'manager_user_id',
            'business_owner_user_id',
            'ceo_user_id',
            'regional_manager_user_id',
            'opening_asset',
        ])->all();

        $leadershipAssignments = $this->normalizeLeadershipAssignments($validated);

        $isFirstBranch = !Company::query()->exists();
        $companyPayload['is_main_branch'] = $isFirstBranch;

        if (!$isFirstBranch) {
            $companyPayload['business_owner_user_id'] = null;
            $companyPayload['ceo_user_id'] = null;
            $companyPayload['regional_manager_user_id'] = null;
            $leadershipAssignments = [];
        } else {
            $companyPayload['business_owner_user_id'] = $this->leadershipUserIdByRole($leadershipAssignments, CompanyLeadershipAssignment::ROLE_BUSINESS_OWNER);
            $companyPayload['ceo_user_id'] = $this->leadershipUserIdByRole($leadershipAssignments, CompanyLeadershipAssignment::ROLE_CEO);
            $companyPayload['regional_manager_user_id'] = $this->leadershipUserIdByRole($leadershipAssignments, CompanyLeadershipAssignment::ROLE_REGIONAL_MANAGER);
        }

        $company = DB::transaction(function () use ($companyPayload, $validated, $request, $leadershipAssignments) {
            $company = Company::create($companyPayload);

            $superAdminUser = User::query()->create([
                'name' => trim((string) $company->name) . ' Super Admin',
                'email' => (string) $company->email,
                'password' => Hash::make((string) $validated['super_admin_password']),
                'employee_id' => null,
                'branch_id' => (int) $company->id,
                'designation_id' => null,
            ]);

            $superAdminRole = Role::firstOrCreate(
                ['name' => 'Super Admin'],
                ['description' => 'Full system access with all permissions']
            );

            $superAdminUser->roles()->syncWithoutDetaching([
                $superAdminRole->id => [
                    'assigned_at' => now(),
                    'assigned_by' => $request->user()?->id ?? $superAdminUser->id,
                ],
            ]);

            CompanyAccount::provisionForCompany($company, [
                'opening_asset' => $validated['opening_asset'] ?? 0,
                'main_opening_balance' => $validated['opening_asset'] ?? 0,
                'cash_opening_balance' => $validated['cash_opening_balance'] ?? 0,
                'bank_name' => $validated['bank_name'] ?? null,
                'bank_branch' => $validated['bank_branch'] ?? null,
                'bank_account_number' => $validated['bank_account_number'] ?? null,
                'bank_opening_balance' => $validated['bank_opening_balance'] ?? 0,
                'bank_accounts' => $validated['bank_accounts'] ?? null,
            ], $request->user()?->id);

            if (!empty($leadershipAssignments)) {
                $this->syncLeadershipAssignments($company, $leadershipAssignments);
            }

            return $company;
        });

        return response()->json($company->load([
            'manager:id,name,email',
            'businessOwner:id,name,email',
            'ceo:id,name,email',
            'regionalManager:id,name,email',
            'leadershipAssignments.user:id,name,email',
            'accounts',
        ]), 201);
    }

    public function update(Request $request, Company $company)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:companies,email,' . $company->id,
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'secondary_phone' => 'nullable|string|max:30',
            'whatsapp_no' => 'nullable|string|max:30',
            'website' => 'nullable|url',
            'country' => 'nullable|string|max:100',
            'currency' => 'nullable|string|max:10',
            'logo_path' => 'nullable|string|max:255',
            'manager_user_id' => 'nullable|exists:users,id',
            'business_owner_user_id' => 'nullable|exists:users,id',
            'ceo_user_id' => 'nullable|exists:users,id',
            'regional_manager_user_id' => 'nullable|exists:users,id',
            'leadership_assignments' => 'nullable|array',
            'leadership_assignments.*.role_type' => ['required_with:leadership_assignments', Rule::in($this->leadershipRoleTypes())],
            'leadership_assignments.*.user_id' => 'required_with:leadership_assignments|exists:users,id',
            'opening_asset' => 'nullable|numeric|min:0',
        ]);

        $leadershipAssignments = $this->normalizeLeadershipAssignments($request->all());
        $payload = $request->all();
        unset($payload['is_main_branch']);
        unset($payload['leadership_assignments']);

        if (!(bool) $company->is_main_branch) {
            $payload['business_owner_user_id'] = null;
            $payload['ceo_user_id'] = null;
            $payload['regional_manager_user_id'] = null;
            $leadershipAssignments = [];
        } else {
            $payload['business_owner_user_id'] = $this->leadershipUserIdByRole($leadershipAssignments, CompanyLeadershipAssignment::ROLE_BUSINESS_OWNER);
            $payload['ceo_user_id'] = $this->leadershipUserIdByRole($leadershipAssignments, CompanyLeadershipAssignment::ROLE_CEO);
            $payload['regional_manager_user_id'] = $this->leadershipUserIdByRole($leadershipAssignments, CompanyLeadershipAssignment::ROLE_REGIONAL_MANAGER);
        }

        DB::transaction(function () use ($company, $payload, $leadershipAssignments): void {
            $company->update($payload);
            $this->syncLeadershipAssignments($company, $leadershipAssignments);
        });

        return response()->json($company->load([
            'manager:id,name,email',
            'businessOwner:id,name,email',
            'ceo:id,name,email',
            'regionalManager:id,name,email',
            'leadershipAssignments.user:id,name,email',
        ]));
    }

    public function uploadLogo(Request $request, Company $company)
    {
        $request->validate([
            'logo' => 'required|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        if ($company->logo_path) {
            Storage::disk('public')->delete($company->logo_path);
        }

        $path = $request->file('logo')->store('company_logos', 'public');
        $company->update(['logo_path' => $path]);

        return response()->json($company->fresh()->load('manager:id,name,email'));
    }

    public function destroy(Company $company)
    {
        // Check if company is referenced in other tables
        $hasEmployees = Employee::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();
        $hasCandidates = Candidate::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();
        $hasDepartments = Department::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();
        $hasDesignations = Designation::where('tenant_id', $company->id)->orWhere('branch_id', $company->id)->exists();

        if ($hasEmployees || $hasCandidates || $hasDepartments || $hasDesignations) {
            return response()->json(['error' => 'Cannot delete company because it is referenced by other records.'], 422);
        }

        $company->delete();
        return response()->json(['message' => 'Company deleted successfully']);
    }

    public function backup(Company $company)
    {
        $company->load(['documentTemplates']);

        $tempBase = tempnam(sys_get_temp_dir(), 'company_backup_');
        $zipPath = $tempBase . '.zip';
        @unlink($tempBase);

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            return response()->json(['message' => 'Failed to create backup archive.'], 500);
        }

        $companyPayload = [
            'id' => $company->id,
            'name' => $company->name,
            'email' => $company->email,
            'address' => $company->address,
            'phone' => $company->phone,
            'secondary_phone' => $company->secondary_phone,
            'whatsapp_no' => $company->whatsapp_no,
            'website' => $company->website,
            'country' => $company->country,
            'currency' => $company->currency,
            'logo_path' => $company->logo_path,
            'created_at' => $company->created_at,
            'updated_at' => $company->updated_at,
        ];

        $templatesPayload = [];

        if (!empty($company->logo_path) && Storage::disk('public')->exists($company->logo_path)) {
            $logoAbsolutePath = Storage::disk('public')->path($company->logo_path);
            $logoName = basename((string) $company->logo_path);
            $zip->addFile($logoAbsolutePath, 'company_logo/' . $logoName);
        }

        foreach ($company->documentTemplates as $template) {
            $templatesPayload[] = [
                'id' => $template->id,
                'template_type' => $template->template_type,
                'file_path' => $template->file_path,
                'original_name' => $template->original_name,
                'is_active' => (bool) $template->is_active,
                'uploaded_by' => $template->uploaded_by,
                'created_at' => $template->created_at,
                'updated_at' => $template->updated_at,
            ];

            if (!Storage::disk('public')->exists($template->file_path)) {
                continue;
            }

            $absolutePath = Storage::disk('public')->path($template->file_path);
            $safeFileName = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', (string) $template->original_name);
            $safeFileName = trim((string) $safeFileName) !== '' ? $safeFileName : basename((string) $template->file_path);
            $zipInternalPath = 'templates/' . $template->template_type . '/' . $template->id . '_' . $safeFileName;

            $zip->addFile($absolutePath, $zipInternalPath);
        }

        $manifest = [
            'backup_type' => 'company_backup',
            'generated_at' => now()->toIso8601String(),
            'company' => $companyPayload,
            'document_templates' => $templatesPayload,
        ];

        $zip->addFromString('backup_manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $zip->close();

        $downloadName = 'company_backup_' . $company->id . '_' . date('Ymd_His') . '.zip';

        return response()->download($zipPath, $downloadName)->deleteFileAfterSend(true);
    }

    private function resolveMysqldumpBinary(): ?string
    {
        $finder = new ExecutableFinder();

        $configured = trim((string) env('DB_DUMP_BINARY', ''));
        if ($configured !== '') {
            if (file_exists($configured)) {
                return $configured;
            }

            $foundConfigured = $finder->find($configured);
            if ($foundConfigured !== null) {
                return $foundConfigured;
            }
        }

        $candidates = [
            'C:\\xampp\\mysql\\bin\\mysqldump.exe',
            'C:\\xampp\\mariadb\\bin\\mysqldump.exe',
            'C:\\Program Files\\MariaDB 10.4\\bin\\mysqldump.exe',
            'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
            'mysqldump.exe',
            'mysqldump',
        ];

        foreach ($candidates as $candidate) {
            if (file_exists($candidate)) {
                return $candidate;
            }

            $found = $finder->find($candidate);
            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }

    private function buildSqlValue(mixed $value, \PDO $pdo): string
    {
        if ($value === null) {
            return 'NULL';
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        return $pdo->quote((string) $value);
    }

    private function buildSqlBackupFromConnection(string $connectionName): string
    {
        $connection = DB::connection($connectionName);
        $pdo = $connection->getPdo();
        $databaseName = (string) $connection->getDatabaseName();

        $sql = [];
        $sql[] = '-- BMS SQL Backup';
        $sql[] = '-- Generated at: ' . now()->toDateTimeString();
        $sql[] = '-- Database: ' . $databaseName;
        $sql[] = 'SET FOREIGN_KEY_CHECKS=0;';
        $sql[] = 'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";';
        $sql[] = 'START TRANSACTION;';
        $sql[] = '';

        $tableRows = $connection->select('SHOW TABLES');

        foreach ($tableRows as $tableRow) {
            $tableValues = array_values((array) $tableRow);
            $tableName = (string) ($tableValues[0] ?? '');

            if ($tableName === '') {
                continue;
            }

            $escapedTable = str_replace('`', '``', $tableName);

            $createRows = $connection->select('SHOW CREATE TABLE `' . $escapedTable . '`');
            if (empty($createRows)) {
                continue;
            }

            $createValues = array_values((array) $createRows[0]);
            $createStatement = (string) ($createValues[1] ?? '');

            if ($createStatement === '') {
                continue;
            }

            $sql[] = '--';
            $sql[] = '-- Table structure for table `' . $escapedTable . '`';
            $sql[] = '--';
            $sql[] = 'DROP TABLE IF EXISTS `' . $escapedTable . '`;';
            $sql[] = $createStatement . ';';
            $sql[] = '';

            $columns = $connection->getSchemaBuilder()->getColumnListing($tableName);
            if (empty($columns)) {
                continue;
            }

            $columnList = array_map(function (string $column): string {
                return '`' . str_replace('`', '``', $column) . '`';
            }, $columns);

            foreach ($connection->table($tableName)->orderBy($columns[0])->cursor() as $row) {
                $rowArray = (array) $row;
                $valueList = [];

                foreach ($columns as $column) {
                    $valueList[] = $this->buildSqlValue($rowArray[$column] ?? null, $pdo);
                }

                $sql[] = 'INSERT INTO `' . $escapedTable . '` (' . implode(', ', $columnList) . ') VALUES (' . implode(', ', $valueList) . ');';
            }

            $sql[] = '';
        }

        $sql[] = 'COMMIT;';
        $sql[] = 'SET FOREIGN_KEY_CHECKS=1;';
        $sql[] = '';

        return implode(PHP_EOL, $sql);
    }

    public function databaseBackup(Company $company)
    {
        $defaultConnection = config('database.default');
        $connection = config('database.connections.' . $defaultConnection);

        if (!is_array($connection) || ($connection['driver'] ?? null) !== 'mysql') {
            return response()->json([
                'message' => 'Database backup currently supports only MySQL connections.'
            ], 422);
        }

        $host = (string) ($connection['host'] ?? '127.0.0.1');
        $port = (string) ($connection['port'] ?? '3306');
        $database = (string) ($connection['database'] ?? '');
        $username = (string) ($connection['username'] ?? '');
        $password = (string) ($connection['password'] ?? '');

        if ($database === '' || $username === '') {
            return response()->json([
                'message' => 'Database credentials are incomplete for backup.'
            ], 500);
        }

        $sqlDump = '';
        $binary = $this->resolveMysqldumpBinary();

        if ($binary !== null) {
            $command = [
                $binary,
                "--host={$host}",
                "--port={$port}",
                "--user={$username}",
                "--password={$password}",
                '--single-transaction',
                '--quick',
                '--routines',
                '--triggers',
                '--events',
                '--no-tablespaces',
                $database,
            ];

            try {
                $process = new Process($command);
                $process->setTimeout(300);
                $process->run();

                if ($process->isSuccessful()) {
                    $sqlDump = $process->getOutput();
                } else {
                    Log::warning('mysqldump failed, using PHP fallback backup builder', [
                        'stderr' => trim($process->getErrorOutput()),
                        'binary' => $binary,
                    ]);
                }
            } catch (Throwable $exception) {
                Log::warning('mysqldump execution threw exception, using PHP fallback backup builder', [
                    'error' => $exception->getMessage(),
                    'binary' => $binary,
                ]);
            }
        }

        if (trim($sqlDump) === '') {
            try {
                $sqlDump = $this->buildSqlBackupFromConnection((string) $defaultConnection);
            } catch (Throwable $exception) {
                return response()->json([
                    'message' => 'Database backup failed. ' . $exception->getMessage()
                ], 500);
            }
        }

        if (trim($sqlDump) === '') {
            return response()->json([
                'message' => 'Database backup output is empty.'
            ], 500);
        }

        $tempBase = tempnam(sys_get_temp_dir(), 'db_backup_');
        $sqlPath = $tempBase . '.sql';
        @unlink($tempBase);
        file_put_contents($sqlPath, $sqlDump);

        $downloadName = 'database_backup_' . $company->id . '_' . date('Ymd_His') . '.sql';

        return response()->download($sqlPath, $downloadName)->deleteFileAfterSend(true);
    }

    private function clearPublicStorageData(): void
    {
        $disk = Storage::disk('public');

        foreach ($disk->allFiles() as $file) {
            if (basename($file) === '.gitignore') {
                continue;
            }

            $disk->delete($file);
        }

        $directories = $disk->allDirectories();
        usort($directories, static function (string $a, string $b): int {
            return strlen($b) <=> strlen($a);
        });

        foreach ($directories as $directory) {
            $disk->deleteDirectory($directory);
        }
    }

    private function filterColumns(string $table, array $payload): array
    {
        if (!Schema::hasTable($table)) {
            return [];
        }

        $allowed = array_flip(Schema::getColumnListing($table));
        return array_filter(
            $payload,
            static fn ($value, $key) => isset($allowed[$key]),
            ARRAY_FILTER_USE_BOTH
        );
    }

    public function resetSystem(Request $request)
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:1'],
        ]);

        $requestUser = $request->user();
        if (!$requestUser || $requestUser->email !== self::DEFAULT_SUPER_ADMIN_EMAIL) {
            return response()->json([
                'message' => 'Only the Super Admin can reset the system.'
            ], 403);
        }

        if (!Hash::check((string) $validated['password'], (string) $requestUser->password)) {
            return response()->json([
                'message' => 'Invalid password. Reset cancelled.'
            ], 422);
        }

        $superAdminEmail = trim((string) env('SYSTEM_SUPER_ADMIN_EMAIL', self::DEFAULT_SUPER_ADMIN_EMAIL));
        if ($superAdminEmail === '') {
            $superAdminEmail = self::DEFAULT_SUPER_ADMIN_EMAIL;
        }

        $generatedPassword = Str::password(14);

        try {
            @set_time_limit(0);

            $preservedDepartments = Department::query()->get()->map(function (Department $department): array {
                return [
                    'tenant_id' => $department->tenant_id,
                    'branch_id' => $department->branch_id,
                    'name' => $department->name,
                    'description' => $department->description,
                    'is_active' => (bool) $department->is_active,
                    'created_at' => $department->created_at,
                    'updated_at' => $department->updated_at,
                ];
            })->all();

            $preservedDesignations = Designation::query()->get()->map(function (Designation $designation): array {
                return [
                    'tenant_id' => $designation->tenant_id,
                    'branch_id' => $designation->branch_id,
                    'name' => $designation->name,
                    'description' => $designation->description,
                    'salary_range_min' => $designation->salary_range_min,
                    'salary_range_max' => $designation->salary_range_max,
                    'is_active' => (bool) $designation->is_active,
                    'created_at' => $designation->created_at,
                    'updated_at' => $designation->updated_at,
                ];
            })->all();

            $preservedSuperAdmin = User::query()
                ->where('email', $superAdminEmail)
                ->first();

            $this->clearPublicStorageData();

            Artisan::call('migrate:fresh', ['--force' => true]);
            Artisan::call('db:seed', ['--force' => true]);

            foreach ($preservedDepartments as $departmentData) {
                $payload = $this->filterColumns('departments', $departmentData);
                if (empty($payload['tenant_id']) || empty($payload['name'])) {
                    continue;
                }

                Department::query()->updateOrCreate(
                    [
                        'tenant_id' => $payload['tenant_id'],
                        'name' => $payload['name'],
                    ],
                    [
                        'branch_id' => $payload['branch_id'] ?? $payload['tenant_id'],
                        'description' => $payload['description'] ?? null,
                        'is_active' => $payload['is_active'] ?? true,
                    ]
                );
            }

            foreach ($preservedDesignations as $designationData) {
                $payload = $this->filterColumns('designations', $designationData);
                if (empty($payload['tenant_id']) || empty($payload['name'])) {
                    continue;
                }

                Designation::query()->updateOrCreate(
                    [
                        'tenant_id' => $payload['tenant_id'],
                        'name' => $payload['name'],
                    ],
                    [
                        'branch_id' => $payload['branch_id'] ?? $payload['tenant_id'],
                        'description' => $payload['description'] ?? null,
                        'salary_range_min' => $payload['salary_range_min'] ?? null,
                        'salary_range_max' => $payload['salary_range_max'] ?? null,
                        'is_active' => $payload['is_active'] ?? true,
                    ]
                );
            }

            $superAdmin = User::firstOrCreate(
                ['email' => $superAdminEmail],
                [
                    'name' => 'Super Admin',
                    'password' => Hash::make($generatedPassword),
                ]
            );

            if ($preservedSuperAdmin) {
                $preservedPayload = $this->filterColumns('users', $preservedSuperAdmin->toArray());
                unset($preservedPayload['id']);
                unset($preservedPayload['email']);
                unset($preservedPayload['created_at']);
                unset($preservedPayload['updated_at']);

                if (!empty($preservedPayload)) {
                    $superAdmin->fill($preservedPayload);
                }
            }

            $superAdmin->name = 'Super Admin';
            $superAdmin->password = Hash::make($generatedPassword);
            $superAdmin->employee_id = null;
            $superAdmin->branch_id = null;
            $superAdmin->designation_id = null;
            $superAdmin->save();

            $superAdminRole = Role::firstOrCreate(
                ['name' => 'Super Admin'],
                ['description' => 'Full system access with all permissions']
            );

            $superAdmin->roles()->sync([
                $superAdminRole->id => [
                    'assigned_at' => now(),
                    'assigned_by' => $superAdmin->id,
                ],
            ]);

            $this->setSystemOnlineValue(true);

            DB::table('personal_access_tokens')->truncate();

            return response()->json([
                'message' => 'System reset completed successfully.',
                'super_admin' => [
                    'email' => $superAdminEmail,
                    'password' => $generatedPassword,
                ],
            ]);
        } catch (Throwable $exception) {
            Log::error('System reset failed', [
                'error' => $exception->getMessage(),
            ]);

            return response()->json([
                'message' => 'System reset failed. ' . $exception->getMessage(),
            ], 500);
        }
    }

    public function resetSystemFull(Request $request)
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:1'],
        ]);

        $requestUser = $request->user();
        if (!$requestUser || $requestUser->email !== self::DEFAULT_SUPER_ADMIN_EMAIL) {
            return response()->json([
                'message' => 'Only the Super Admin can run full reset.'
            ], 403);
        }

        if (!Hash::check((string) $validated['password'], (string) $requestUser->password)) {
            return response()->json([
                'message' => 'Invalid password. Full reset cancelled.'
            ], 422);
        }

        $superAdminEmail = trim((string) env('SYSTEM_SUPER_ADMIN_EMAIL', self::DEFAULT_SUPER_ADMIN_EMAIL));
        if ($superAdminEmail === '') {
            $superAdminEmail = self::DEFAULT_SUPER_ADMIN_EMAIL;
        }

        $generatedPassword = Str::password(14);

        try {
            @set_time_limit(0);

            $preservedSuperAdmin = User::query()
                ->where('email', $superAdminEmail)
                ->first();

            $this->clearPublicStorageData();

            Artisan::call('migrate:fresh', ['--force' => true]);

            $superAdmin = User::firstOrCreate(
                ['email' => $superAdminEmail],
                [
                    'name' => 'Super Admin',
                    'password' => Hash::make($generatedPassword),
                ]
            );

            if ($preservedSuperAdmin) {
                $preservedPayload = $this->filterColumns('users', $preservedSuperAdmin->toArray());
                unset($preservedPayload['id']);
                unset($preservedPayload['email']);
                unset($preservedPayload['created_at']);
                unset($preservedPayload['updated_at']);

                if (!empty($preservedPayload)) {
                    $superAdmin->fill($preservedPayload);
                }
            }

            $superAdmin->name = 'Super Admin';
            $superAdmin->password = Hash::make($generatedPassword);
            $superAdmin->employee_id = null;
            $superAdmin->branch_id = null;
            $superAdmin->designation_id = null;
            $superAdmin->save();

            $superAdminRole = Role::firstOrCreate(
                ['name' => 'Super Admin'],
                ['description' => 'Full system access with all permissions']
            );

            $superAdmin->roles()->sync([
                $superAdminRole->id => [
                    'assigned_at' => now(),
                    'assigned_by' => $superAdmin->id,
                ],
            ]);

            $this->setSystemOnlineValue(true);

            if (Schema::hasTable('personal_access_tokens')) {
                DB::table('personal_access_tokens')->truncate();
            }

            return response()->json([
                'message' => 'Full system reset completed. All table data was deleted and only Super Admin was recreated.',
                'super_admin' => [
                    'email' => $superAdminEmail,
                    'password' => $generatedPassword,
                ],
            ]);
        } catch (Throwable $exception) {
            Log::error('Full system reset failed', [
                'error' => $exception->getMessage(),
            ]);

            return response()->json([
                'message' => 'Full system reset failed. ' . $exception->getMessage(),
            ], 500);
        }
    }
}
