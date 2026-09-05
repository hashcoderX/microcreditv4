<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\Api\HR\DepartmentController;
use App\Http\Controllers\Api\HR\DesignationController;
use App\Http\Controllers\Api\HR\EmployeeController;
use App\Http\Controllers\Api\HR\AttendanceController;
use App\Http\Controllers\Api\HR\LeaveController;
use App\Http\Controllers\Api\HR\LeaveTypeController;
use App\Http\Controllers\Api\HR\PayrollController;
use App\Http\Controllers\Api\HR\CandidateController;
use App\Http\Controllers\Api\HR\CandidateDocumentController;
use App\Http\Controllers\Api\HR\CandidateEducationController;
use App\Http\Controllers\Api\HR\CandidateExperienceController;
use App\Http\Controllers\Api\HR\CandidateInterviewController;
use App\Http\Controllers\Api\HR\EmployeeDocumentController;
use App\Http\Controllers\Api\HR\EmployeeEducationController;
use App\Http\Controllers\Api\HR\EmployeeExperienceController;
use App\Http\Controllers\Api\HR\EmployeeAllowanceDeductionController;
use App\Http\Controllers\Api\MortgageController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerDocumentController;
use App\Http\Controllers\Api\AccountingExpenseController;
use App\Http\Controllers\Api\AccountingRefundController;
use App\Http\Controllers\Api\AccountingOverviewController;
use App\Http\Controllers\Api\AccountingReportsController;
use App\Http\Controllers\Api\UserDashboardWidgetController;
use App\Http\Controllers\Api\UserNotificationController;
use App\Http\Controllers\Api\CompanyAccountController;
use App\Http\Controllers\Api\CompanyDocumentTemplateController;
use App\Http\Controllers\Api\Microfinance\RouteController as MicrofinanceRouteController;
use App\Http\Controllers\Api\Microfinance\GroupController as MicrofinanceGroupController;
use App\Http\Controllers\Api\Microfinance\CenterController as MicrofinanceCenterController;
use App\Http\Controllers\Api\Microfinance\HolidayController as MicrofinanceHolidayController;
use App\Http\Controllers\Api\Microfinance\PenaltySettingController as MicrofinancePenaltySettingController;
use App\Http\Controllers\Api\Microfinance\LoanProductController as MicrofinanceLoanProductController;
use App\Http\Controllers\Api\Microfinance\LoanRequestController as MicrofinanceLoanRequestController;
use App\Http\Controllers\Api\Microfinance\LoanCollectionController as MicrofinanceLoanCollectionController;
use App\Http\Controllers\Api\Microfinance\ActionCenterStepRoleController;
use App\Http\Controllers\Api\FinanceController;
use App\Http\Controllers\Api\FinanceProductTypeController;
use App\Http\Controllers\Api\LoanProductController as LoanModuleProductController;
use App\Http\Controllers\Api\LoanRequestController;
use App\Http\Controllers\Api\OfficeCollectionController;
use App\Http\Controllers\Api\AiAssistantController;
use App\Http\Controllers\Reports\BranchCollectionReportController;
use App\Http\Controllers\Reports\BranchPerformanceReportController;
use App\Http\Controllers\Reports\BranchRepaymentReportController;
use App\Http\Controllers\Api\SavingsAccountController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\PermissionController;
use App\Models\User;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    $user = $request->user()?->load([
        'branch:id,name',
        'designation:id,name',
        'employee:id,first_name,last_name,email,branch_id,designation_id',
        'employee.wallet:id,employee_id,wallet_no,opening_balance,current_balance,status',
        'roles:id,name,description',
        'roles.permissions:id,name,module,description',
    ]);

    if ($user) {
        $user->ensureExecutiveAdminRole();
        $user->load([
            'roles:id,name,description',
            'roles.permissions:id,name,module,description',
        ]);
    }

    if (
        $user &&
        $user->roles->isEmpty() &&
        $user->designation &&
        !empty($user->designation->name)
    ) {
        $matchedRole = Role::where('name', $user->designation->name)->first();

        if ($matchedRole) {
            $user->roles()->syncWithoutDetaching([
                $matchedRole->id => [
                    'assigned_by' => $user->id,
                    'assigned_at' => now(),
                ],
            ]);

            $user->load([
                'roles:id,name,description',
                'roles.permissions:id,name,module,description',
            ]);
        }
    }

    return $user;
})->middleware('auth:sanctum');

Route::get('/users', function () {
    return User::all();
});

Route::get('/reset-password', function () {
    $defaultEmail = trim((string) env('SYSTEM_SUPER_ADMIN_EMAIL', 'superadmin@softcodelk.com'));
    $candidates = array_values(array_unique([
        strtolower($defaultEmail),
        'superadmin@softcodelk.com',
        'superadmin@gmail.com',
    ]));

    $targetUser = User::query()
        ->where(function ($query) use ($candidates) {
            foreach ($candidates as $candidate) {
                $query->orWhereRaw('LOWER(TRIM(email)) = ?', [$candidate]);
            }
        })
        ->first();

    if (!$targetUser) {
        return response()->json(['message' => 'No super admin account found to reset.'], 404);
    }

    $targetUser->password = \Illuminate\Support\Facades\Hash::make('password');
    $targetUser->save();

    return response()->json([
        'message' => 'Password reset',
        'email' => $targetUser->email,
    ]);
});

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');

Route::middleware(['auth:sanctum', 'system.online'])->group(function () {
    Route::get('dashboard/widgets', [UserDashboardWidgetController::class, 'index']);
    Route::patch('dashboard/widgets', [UserDashboardWidgetController::class, 'upsert']);
    Route::delete('dashboard/widgets', [UserDashboardWidgetController::class, 'reset']);
    Route::post('dashboard/widgets/authorize-admin', [UserDashboardWidgetController::class, 'authorizeAdminAction']);
    Route::post('dashboard/widgets/restore-employee', [UserDashboardWidgetController::class, 'restoreEmployeeWidgets']);
    Route::post('dashboard/widgets/unhide-employee-widget', [UserDashboardWidgetController::class, 'unhideEmployeeWidget']);
    Route::get('dashboard/widgets/employee-hidden', [UserDashboardWidgetController::class, 'employeeHiddenWidgets']);
    Route::get('notifications', [UserNotificationController::class, 'index']);
    Route::get('notifications/preview', [UserNotificationController::class, 'preview']);
    Route::get('microfinance/action-center/step-roles', [ActionCenterStepRoleController::class, 'index']);
    Route::put('microfinance/action-center/step-roles', [ActionCenterStepRoleController::class, 'update']);
    Route::patch('notifications/{notification}/read', [UserNotificationController::class, 'markRead']);
    Route::patch('notifications/{notification}/important', [UserNotificationController::class, 'toggleImportant']);
    Route::patch('notifications/read-all', [UserNotificationController::class, 'markAllRead']);
    Route::delete('notifications/read', [UserNotificationController::class, 'clearRead']);
    Route::post('ai/assistant/chat', [AiAssistantController::class, 'chat']);

    Route::get('system/status', [CompanyController::class, 'getSystemStatus']);
    Route::post('system/status', [CompanyController::class, 'updateSystemStatus']);
    Route::get('system/sms-gateway', [CompanyController::class, 'getSmsGatewayConfig']);
    Route::post('system/sms-gateway', [CompanyController::class, 'updateSmsGatewayConfig']);
    Route::post('system/sms-gateway/test', [CompanyController::class, 'testSmsGateway']);
    Route::get('system/whatsapp-gateway', [CompanyController::class, 'getWhatsappGatewayConfig']);
    Route::post('system/whatsapp-gateway', [CompanyController::class, 'updateWhatsappGatewayConfig']);
    Route::post('system/whatsapp-gateway/test', [CompanyController::class, 'testWhatsappGateway']);
    Route::post('system/reset', [CompanyController::class, 'resetSystem']);
    Route::post('system/reset-full', [CompanyController::class, 'resetSystemFull']);
    Route::get('manager-candidates', [CompanyController::class, 'managerCandidates']);
    Route::apiResource('companies', CompanyController::class);
    Route::post('companies/{company}/logo', [CompanyController::class, 'uploadLogo']);
    Route::get('companies/{company}/backup', [CompanyController::class, 'backup']);
    Route::get('companies/{company}/database-backup', [CompanyController::class, 'databaseBackup']);
    Route::get('companies/{company}/document-templates', [CompanyDocumentTemplateController::class, 'index']);
    Route::post('companies/{company}/document-templates', [CompanyDocumentTemplateController::class, 'store']);
    Route::get('companies/{company}/document-templates/{template}/view', [CompanyDocumentTemplateController::class, 'view']);
    Route::delete('companies/{company}/document-templates/{template}', [CompanyDocumentTemplateController::class, 'destroy']);
    Route::get('companies/{company}/accounts', [CompanyAccountController::class, 'index']);
    Route::post('companies/{company}/accounts', [CompanyAccountController::class, 'store']);
    Route::post('companies/{company}/accounts/transfer-to-branch', [CompanyAccountController::class, 'transferToBranch']);
    Route::get('companies/{company}/wallet-user', [CompanyAccountController::class, 'companyWalletStatus']);
    Route::post('companies/{company}/wallet-user/provision', [CompanyAccountController::class, 'provisionCompanyWalletUser']);
    Route::put('companies/{company}/accounts/{account}', [CompanyAccountController::class, 'update']);
    Route::delete('companies/{company}/accounts/{account}', [CompanyAccountController::class, 'destroy']);
    Route::get('companies/{company}/expenses', [AccountingExpenseController::class, 'index']);
    Route::post('companies/{company}/expenses', [AccountingExpenseController::class, 'store']);
    Route::delete('companies/{company}/expenses/{accountingExpense}', [AccountingExpenseController::class, 'destroy']);
    Route::get('companies/{company}/refunds', [AccountingRefundController::class, 'index']);
    Route::post('companies/{company}/refunds', [AccountingRefundController::class, 'store']);
    Route::delete('companies/{company}/refunds/{accountingRefund}', [AccountingRefundController::class, 'destroy']);
    Route::get('companies/{company}/accounting-overview', [AccountingOverviewController::class, 'show']);
    Route::get('companies/{company}/reports/bank-book', [AccountingReportsController::class, 'bankBookReport']);
    Route::get('companies/{company}/reports/cash-book', [AccountingReportsController::class, 'cashBookReport']);

    // HRM Routes
    Route::prefix('hr')->group(function () {
        Route::get('wallet/my', [EmployeeController::class, 'myWallet']);
        Route::post('wallet/my/deposit-bank', [EmployeeController::class, 'depositToBank']);
        Route::post('wallet/my/cash-handover', [EmployeeController::class, 'handoverCash']);
        Route::get('wallet/pending-transactions', [EmployeeController::class, 'pendingWalletTransactions']);
        Route::post('wallet/pending-transactions/{type}/{id}/approve', [EmployeeController::class, 'approvePendingWalletTransaction']);
        Route::post('wallet/accepted-handovers/{id}/transfer-cash', [EmployeeController::class, 'transferAcceptedHandoverToBranchCash']);

        Route::apiResource('departments', DepartmentController::class);
        Route::apiResource('designations', DesignationController::class);
        Route::get('employees/designation-widget-template', [EmployeeController::class, 'designationWidgetTemplateSummary']);
        Route::apiResource('employees', EmployeeController::class);
        Route::post('employees/{employee}/wallet', [EmployeeController::class, 'createWallet']);
        Route::put('employees/{employee}/wallet', [EmployeeController::class, 'updateWallet']);
        Route::apiResource('candidates', CandidateController::class);

        // Candidate nested resources
        Route::get('candidates/{candidate}/documents', [CandidateDocumentController::class, 'index']);
        Route::post('candidates/{candidate}/documents', [CandidateDocumentController::class, 'store']);
        Route::delete('candidates/{candidate}/documents/{document}', [CandidateDocumentController::class, 'destroy']);
        Route::get('candidates/{candidate}/documents/{document}/download', [CandidateDocumentController::class, 'download']);

        Route::get('candidates/{candidate}/educations', [CandidateEducationController::class, 'index']);
        Route::post('candidates/{candidate}/educations', [CandidateEducationController::class, 'store']);
        Route::put('candidates/{candidate}/educations/{education}', [CandidateEducationController::class, 'update']);
        Route::delete('candidates/{candidate}/educations/{education}', [CandidateEducationController::class, 'destroy']);

        Route::get('candidates/{candidate}/experiences', [CandidateExperienceController::class, 'index']);
        Route::post('candidates/{candidate}/experiences', [CandidateExperienceController::class, 'store']);
        Route::put('candidates/{candidate}/experiences/{experience}', [CandidateExperienceController::class, 'update']);
        Route::delete('candidates/{candidate}/experiences/{experience}', [CandidateExperienceController::class, 'destroy']);
        Route::post('candidates/{candidate}/generate-appointment-letter', [CandidateController::class, 'generateAppointmentLetter']);
        Route::post('candidates/{candidate}/convert-to-employee', [CandidateController::class, 'convertToEmployee']);
        Route::post('candidates/{candidate}/schedule-interview', [CandidateController::class, 'scheduleInterview']);
        // Multiple interviews per candidate
        Route::get('candidates/{candidate}/interviews', [CandidateInterviewController::class, 'index']);
        Route::post('candidates/{candidate}/interviews', [CandidateInterviewController::class, 'store']);
        Route::put('candidates/{candidate}/interviews/{interview}', [CandidateInterviewController::class, 'update']);
        Route::get('interviews/upcoming', [CandidateInterviewController::class, 'upcoming']);
        Route::get('candidates/{candidate}/download-cv', [CandidateController::class, 'downloadCv']);
        Route::get('candidates/{candidate}/download-appointment-letter', [CandidateController::class, 'downloadAppointmentLetter']);

        // Employee nested resources
        Route::get('employees/{employee}/documents', [EmployeeDocumentController::class, 'index']);
        Route::post('employees/{employee}/documents', [EmployeeDocumentController::class, 'store']);
        Route::delete('employees/{employee}/documents/{document}', [EmployeeDocumentController::class, 'destroy']);
        Route::get('employees/{employee}/documents/{document}/download', [EmployeeDocumentController::class, 'download']);

        Route::get('employees/{employee}/education', [EmployeeEducationController::class, 'index']);
        Route::post('employees/{employee}/education', [EmployeeEducationController::class, 'store']);
        Route::put('employees/{employee}/education/{education}', [EmployeeEducationController::class, 'update']);
        Route::delete('employees/{employee}/education/{education}', [EmployeeEducationController::class, 'destroy']);

        Route::get('employees/{employee}/experience', [EmployeeExperienceController::class, 'index']);
        Route::post('employees/{employee}/experience', [EmployeeExperienceController::class, 'store']);
        Route::put('employees/{employee}/experience/{experience}', [EmployeeExperienceController::class, 'update']);
        Route::delete('employees/{employee}/experience/{experience}', [EmployeeExperienceController::class, 'destroy']);

        // Employee Allowances and Deductions
        Route::get('employees/{employee}/allowances-deductions', [EmployeeAllowanceDeductionController::class, 'index']);
        Route::post('employees/{employee}/allowances-deductions', [EmployeeAllowanceDeductionController::class, 'store']);
        Route::put('employees/{employee}/allowances-deductions/{allowanceDeduction}', [EmployeeAllowanceDeductionController::class, 'update']);
        Route::delete('employees/{employee}/allowances-deductions/{allowanceDeduction}', [EmployeeAllowanceDeductionController::class, 'destroy']);

        Route::get('attendance/fingerprint-config', [AttendanceController::class, 'fingerprintConfig']);
        Route::put('attendance/fingerprint-config', [AttendanceController::class, 'updateFingerprintConfig']);
        Route::post('attendance/fingerprint-sync', [AttendanceController::class, 'syncFingerprintLogs']);
        Route::apiResource('attendance', AttendanceController::class);
        Route::post('attendance/mark', [AttendanceController::class, 'markBasic']);
        Route::post('attendance/mark-out', [AttendanceController::class, 'markOut']);
        Route::post('attendance/upload-csv', [AttendanceController::class, 'uploadCsv']);
        Route::get('attendance/employee/{employeeId}', [AttendanceController::class, 'getEmployeeAttendance']);
        Route::apiResource('leaves', LeaveController::class);
        Route::post('leaves/{leave}/section-head-approve', [LeaveController::class, 'sectionHeadApprove']);
        Route::post('leaves/{leave}/hr-approve', [LeaveController::class, 'hrApprove']);
        Route::apiResource('leave-types', LeaveTypeController::class);
        Route::apiResource('payrolls', PayrollController::class);
        Route::post('payrolls/generate', [PayrollController::class, 'generate']);
        Route::get('payrolls/{payroll}/payslip', [PayrollController::class, 'payslip']);
    });

    // Role and Permission Management Routes
    Route::get('roles', [RoleController::class, 'index']);
    Route::get('permissions', [PermissionController::class, 'index']);
    Route::get('permissions/template-file', [PermissionController::class, 'permissionFileTemplates']);
    
    Route::middleware('permission:view_roles')->group(function () {
        Route::get('roles/{role}', [RoleController::class, 'show']);
        Route::get('users/{userId}/roles', [RoleController::class, 'getUserRoles']);
    });
    Route::middleware('permission:create_roles')->group(function () {
        Route::post('roles', [RoleController::class, 'store']);
    });
    Route::middleware('permission:edit_roles')->group(function () {
        Route::put('roles/{role}', [RoleController::class, 'update']);
        Route::put('roles/{role}/permissions', [RoleController::class, 'updatePermissions']);
    });
    Route::middleware('permission:delete_roles')->group(function () {
        Route::delete('roles/{role}', [RoleController::class, 'destroy']);
    });
    Route::middleware('permission:assign_roles')->group(function () {
        Route::post('roles/assign-to-user', [RoleController::class, 'assignToUser']);
        Route::post('roles/remove-from-user', [RoleController::class, 'removeFromUser']);
    });

    Route::middleware('permission:view_permissions')->group(function () {
        Route::get('permissions/{permission}', [PermissionController::class, 'show']);
    });
    Route::middleware('permission:create_permissions')->group(function () {
        Route::post('permissions', [PermissionController::class, 'store']);
    });
    Route::middleware('permission:edit_permissions')->group(function () {
        Route::put('permissions/{permission}', [PermissionController::class, 'update']);
    });
    Route::post('permissions/sync-routes', [PermissionController::class, 'syncFromRoutes']);
    Route::middleware('permission:delete_permissions')->group(function () {
        Route::delete('permissions/{permission}', [PermissionController::class, 'destroy']);
    });

    // Mortgage Management Routes
    Route::apiResource('mortgages', MortgageController::class)->only(['index', 'store', 'show', 'destroy']);
    Route::post('mortgages/{mortgage}/status', [MortgageController::class, 'updateStatus']);
    Route::get('mortgages/reports/collections', [MortgageController::class, 'collectionReport']);
    Route::get('mortgages/reports/profit', [MortgageController::class, 'profitReport']);
    Route::get('mortgages/reports/arrears', [MortgageController::class, 'arrearsReport']);
    Route::get('mortgages/reports/portfolio', [MortgageController::class, 'portfolioReport']);
    Route::get('mortgages/{mortgage}/payments', [MortgageController::class, 'payments']);
    Route::post('mortgages/{mortgage}/payments', [MortgageController::class, 'storePayment']);
    Route::post('mortgages/{mortgage}/interest-adjustments', [MortgageController::class, 'adjustInterest']);
    Route::get('mortgages/{mortgage}/documents', [MortgageController::class, 'documents']);
    Route::post('mortgages/{mortgage}/documents', [MortgageController::class, 'storeDocument']);
    Route::get('mortgages/{mortgage}/schedule', [MortgageController::class, 'schedule']);

    // Finance Management Routes (non-mortgage finance agreements)
    Route::get('finances/reports/income-expense', [FinanceController::class, 'incomeExpenseReport']);
    Route::get('finances/reports/cash-flow', [FinanceController::class, 'cashFlowReport']);
    Route::get('finances/reports/general-ledger', [FinanceController::class, 'generalLedgerSnapshot']);
    Route::get('finances/reports/journal-entries', [AccountingReportsController::class, 'journalEntriesReport']);
    Route::get('finances/reports/loan-receivable', [AccountingReportsController::class, 'loanReceivableReport']);
    Route::get('finances/reports/interest-income', [AccountingReportsController::class, 'interestIncomeReport']);
    Route::get('finances/reports/loan-disbursement', [AccountingReportsController::class, 'loanDisbursementReport']);
    Route::get('finances/assignment-options', [FinanceController::class, 'assignmentOptions']);
    Route::apiResource('finances', FinanceController::class)->only(['index', 'store', 'show']);
    Route::delete('finances/{finance}', [FinanceController::class, 'destroy']);
    Route::post('finances/{finance}/status', [FinanceController::class, 'updateStatus']);
    Route::get('finances/{finance}/collections', [FinanceController::class, 'collections']);
    Route::post('finances/{finance}/collections', [FinanceController::class, 'storeCollection']);
    Route::delete('finances/{finance}/collections/{collection}', [FinanceController::class, 'destroyCollection']);
    Route::get('finances/{finance}/documents', [FinanceController::class, 'documents']);
    Route::post('finances/{finance}/documents', [FinanceController::class, 'storeDocument']);
    Route::get('finance-product-types', [FinanceProductTypeController::class, 'index']);
    Route::post('finance-product-types', [FinanceProductTypeController::class, 'store']);

    // Reports
    Route::get('reports/branch-performance', [BranchPerformanceReportController::class, 'index']);
    Route::get('reports/branch-profitability', [AccountingReportsController::class, 'branchProfitabilityReport']);
    Route::get('reports/investor-funding', [AccountingReportsController::class, 'investorFundingReport']);
    Route::get('reports/collector-wallet-deposits', [AccountingReportsController::class, 'collectorWalletDepositsReport']);
    Route::get('reports/branch-collection', [BranchCollectionReportController::class, 'index']);
    Route::get('reports/branch-repayment', [BranchRepaymentReportController::class, 'index']);

    // Office collection center (unified installment collection)
    Route::get('office-collections/search', [OfficeCollectionController::class, 'search']);
    Route::post('office-collections/collect', [OfficeCollectionController::class, 'collect']);

    // Loan Requests (step-by-step loan module)
    Route::apiResource('loan-products', LoanModuleProductController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
    Route::get('loan-requests', [LoanRequestController::class, 'index']);
    Route::post('loan-requests', [LoanRequestController::class, 'store']);
    Route::get('loan-requests/{id}', [LoanRequestController::class, 'show']);
    Route::post('loan-requests/{id}/status', [LoanRequestController::class, 'updateStatus']);

    // Customers
    Route::get('customers/generate-code', [CustomerController::class, 'generateCode']);
    Route::get('customers/finance-lookup', [CustomerController::class, 'financeLookup']);
    Route::get('customers/finance-search', [CustomerController::class, 'financeSearch']);
    Route::get('customers/by-code/{customerCode}', [CustomerController::class, 'findByCode']);
    Route::get('customers/by-code/{customerCode}/photo', [CustomerController::class, 'photoByCode']);
    Route::post('customers/by-code/{customerCode}/photo', [CustomerController::class, 'uploadPhotoByCode']);
    Route::apiResource('customers', CustomerController::class);
    Route::get('customers/{customer}/documents', [CustomerDocumentController::class, 'index']);
    Route::post('customers/{customer}/documents', [CustomerDocumentController::class, 'store']);
    Route::delete('customers/{customer}/documents/{document}', [CustomerDocumentController::class, 'destroy']);
    Route::get('customers/{customer}/documents/{document}/download', [CustomerDocumentController::class, 'download']);

    // Savings & Deposits
    Route::get('savings-accounts/reports/ledger', [SavingsAccountController::class, 'ledgerReport']);
    Route::get('savings-accounts/reports/deposit-growth', [SavingsAccountController::class, 'depositGrowthReport']);
    Route::get('savings-accounts/reports/maturity', [SavingsAccountController::class, 'maturityReport']);
    Route::apiResource('savings-accounts', SavingsAccountController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
    Route::get('savings-accounts/{account}/transactions', [SavingsAccountController::class, 'transactions']);
    Route::post('savings-accounts/{account}/deposit', [SavingsAccountController::class, 'deposit']);
    Route::post('savings-accounts/{account}/withdraw', [SavingsAccountController::class, 'withdraw']);

    // Microfinance Settings
    Route::prefix('microfinance/settings')->group(function () {
        Route::apiResource('routes', MicrofinanceRouteController::class);
        Route::apiResource('groups', MicrofinanceGroupController::class);
        Route::apiResource('centers', MicrofinanceCenterController::class);
        Route::apiResource('loan-products', MicrofinanceLoanProductController::class);
        Route::apiResource('holidays', MicrofinanceHolidayController::class);
        Route::get('penalty-rate', [MicrofinancePenaltySettingController::class, 'show']);
        Route::post('penalty-rate', [MicrofinancePenaltySettingController::class, 'store']);
        Route::put('penalty-rate/{penaltySetting}', [MicrofinancePenaltySettingController::class, 'update']);
    });

    // Microfinance Loan Requests
    Route::prefix('microfinance/loan-requests')->group(function () {
        Route::get('/', [MicrofinanceLoanRequestController::class, 'index']);
        Route::get('/meta', [MicrofinanceLoanRequestController::class, 'meta']);
        Route::get('/approval-candidates', [MicrofinanceLoanRequestController::class, 'approvalCandidates']);
        Route::post('/', [MicrofinanceLoanRequestController::class, 'store']);
        Route::put('/{loanRequest}', [MicrofinanceLoanRequestController::class, 'update']);
        Route::delete('/{loanRequest}', [MicrofinanceLoanRequestController::class, 'destroy']);
        Route::post('/{loanRequest}/lifecycle', [MicrofinanceLoanRequestController::class, 'updateLifecycle']);
        Route::post('/{loanRequest}/documents', [MicrofinanceLoanRequestController::class, 'storeDocuments']);
        Route::get('/{loanRequest}/customer-profile', [MicrofinanceLoanRequestController::class, 'customerProfile']);
        Route::post('/{loanRequest}/guarantors/{guarantor}/media', [MicrofinanceLoanRequestController::class, 'storeGuarantorMedia']);
        Route::get('/{loanRequest}/download-agreement', [MicrofinanceLoanRequestController::class, 'downloadAgreement']);
        Route::get('/{loanRequest}/download-reminder-letter', [MicrofinanceLoanRequestController::class, 'downloadReminderLetter']);
        Route::get('/{loanRequest}/download-legal-letter', [MicrofinanceLoanRequestController::class, 'downloadLegalLetter']);
        Route::post('/{loanRequest}/approve', [MicrofinanceLoanRequestController::class, 'approve']);
        Route::post('/{loanRequest}/reject', [MicrofinanceLoanRequestController::class, 'reject']);
        Route::post('/{loanRequest}/request-approval', [MicrofinanceLoanRequestController::class, 'requestApproval']);
        Route::post('/{loanRequest}/approve-bm-step', [MicrofinanceLoanRequestController::class, 'approveBmStep']);
        Route::post('/{loanRequest}/complete-cash-allocation-step', [MicrofinanceLoanRequestController::class, 'completeCashAllocationStep']);
        Route::post('/{loanRequest}/confirm-second-call-step', [MicrofinanceLoanRequestController::class, 'confirmSecondCallStep']);
        Route::post('/{loanRequest}/confirm-document-verification-step', [MicrofinanceLoanRequestController::class, 'confirmDocumentVerificationStep']);
        Route::post('/{loanRequest}/advance-workflow-step', [MicrofinanceLoanRequestController::class, 'advanceWorkflowStep']);
        Route::post('/{loanRequest}/mark-as-called', [MicrofinanceLoanRequestController::class, 'markAsCalled']);
        Route::post('/{loanRequest}/send-back', [MicrofinanceLoanRequestController::class, 'sendBack']);
        Route::post('/{loanRequest}/request-documents', [MicrofinanceLoanRequestController::class, 'requestDocuments']);
    });

    // Microfinance Collections
    Route::prefix('microfinance/collections')->group(function () {
        Route::get('/', [MicrofinanceLoanCollectionController::class, 'index']);
        Route::post('/', [MicrofinanceLoanCollectionController::class, 'store']);
        Route::delete('/{collection}', [MicrofinanceLoanCollectionController::class, 'destroy']);
    });
});