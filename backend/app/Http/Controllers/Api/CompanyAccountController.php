<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CompanyAccountController extends Controller
{
    public function index(Company $company): JsonResponse
    {
        $accounts = CompanyAccount::query()
            ->where('company_id', $company->id)
            ->orderByRaw("FIELD(account_type, 'main', 'cash', 'bank')")
            ->orderBy('id')
            ->get();

        $main = $accounts->firstWhere('account_type', CompanyAccount::TYPE_MAIN);
        $cash = $accounts->firstWhere('account_type', CompanyAccount::TYPE_CASH);
        $banks = $accounts->where('account_type', CompanyAccount::TYPE_BANK)->values();

        $totalOpening = round(
            (float) ($main?->opening_balance ?? 0)
            + (float) ($cash?->opening_balance ?? 0)
            + (float) $banks->sum('opening_balance'),
            2
        );

        $totalCurrent = round(
            (float) ($main?->current_balance ?? 0)
            + (float) ($cash?->current_balance ?? 0)
            + (float) $banks->sum('current_balance'),
            2
        );

        return response()->json([
            'accounts' => $accounts,
            'summary' => [
                'main' => $main,
                'cash' => $cash,
                'banks' => $banks,
                'bank_count' => $banks->count(),
                'total_opening_balance' => $totalOpening,
                'total_current_balance' => $totalCurrent,
            ],
        ]);
    }

    public function store(Request $request, Company $company): JsonResponse
    {
        $validated = $request->validate([
            'account_type' => ['required', Rule::in([
                CompanyAccount::TYPE_MAIN,
                CompanyAccount::TYPE_CASH,
                CompanyAccount::TYPE_BANK,
            ])],
            'account_name' => ['nullable', 'string', 'max:190'],
            'account_code' => ['nullable', 'string', 'max:30'],
            'bank_name' => ['nullable', 'string', 'max:190'],
            'bank_branch' => ['nullable', 'string', 'max:190'],
            'account_number' => ['nullable', 'string', 'max:80'],
            'opening_balance' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $accountType = (string) $validated['account_type'];

        if (in_array($accountType, [CompanyAccount::TYPE_MAIN, CompanyAccount::TYPE_CASH], true)) {
            $exists = CompanyAccount::query()
                ->where('company_id', $company->id)
                ->where('account_type', $accountType)
                ->exists();

            if ($exists) {
                return response()->json([
                    'message' => ucfirst($accountType) . ' account already exists for this company. Update the existing record instead.',
                ], 422);
            }
        }

        if ($accountType === CompanyAccount::TYPE_BANK) {
            $bankName = trim((string) ($validated['bank_name'] ?? ''));
            $accountNumber = trim((string) ($validated['account_number'] ?? ''));

            if ($bankName === '') {
                return response()->json(['message' => 'Bank name is required for bank accounts.'], 422);
            }

            if ($accountNumber !== '') {
                $duplicate = CompanyAccount::query()
                    ->where('company_id', $company->id)
                    ->where('account_type', CompanyAccount::TYPE_BANK)
                    ->where('account_number', $accountNumber)
                    ->exists();

                if ($duplicate) {
                    return response()->json(['message' => 'A bank account with this account number already exists.'], 422);
                }
            }
        }

        $openingBalance = round((float) ($validated['opening_balance'] ?? 0), 2);
        $accountName = trim((string) ($validated['account_name'] ?? ''));
        if ($accountName === '') {
            $accountName = CompanyAccount::defaultAccountName($accountType);
            if ($accountType === CompanyAccount::TYPE_BANK && !empty($validated['bank_name'])) {
                $accountName = trim((string) $validated['bank_name']) . ' Account';
            }
        }

        $account = DB::transaction(function () use ($company, $accountType, $accountName, $validated, $openingBalance, $request) {
            if (in_array($accountType, [CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_BANK], true) && $openingBalance > 0) {
                $mainAccount = CompanyAccount::query()
                    ->where('company_id', (int) $company->id)
                    ->where('account_type', CompanyAccount::TYPE_MAIN)
                    ->where('is_active', true)
                    ->lockForUpdate()
                    ->first();

                if (!$mainAccount) {
                    abort(response()->json([
                        'message' => 'Main account is required before creating cash or bank balances.',
                    ], 422));
                }

                $mainBalance = round((float) ($mainAccount->current_balance ?? 0), 2);
                if ($openingBalance > $mainBalance) {
                    abort(response()->json([
                        'message' => 'Main account has insufficient balance for this opening allocation.',
                    ], 422));
                }

                $mainAccount->current_balance = round($mainBalance - $openingBalance, 2);
                $mainAccount->save();
            }

            return CompanyAccount::create([
                'company_id' => $company->id,
                'account_type' => $accountType,
                'account_name' => $accountName,
                'account_code' => trim((string) ($validated['account_code'] ?? '')) ?: CompanyAccount::defaultAccountCode($accountType),
                'bank_name' => $validated['bank_name'] ?? null,
                'bank_branch' => $validated['bank_branch'] ?? null,
                'account_number' => $validated['account_number'] ?? null,
                'opening_balance' => $openingBalance,
                'current_balance' => $openingBalance,
                'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
                'notes' => $validated['notes'] ?? null,
                'created_by' => $request->user()?->id,
            ]);
        });

        return response()->json([
            'message' => 'Company account created successfully.',
            'account' => $account,
        ], 201);
    }

    public function update(Request $request, Company $company, CompanyAccount $account): JsonResponse
    {
        if ((int) $account->company_id !== (int) $company->id) {
            return response()->json(['message' => 'Account does not belong to this company.'], 404);
        }

        $validated = $request->validate([
            'account_name' => ['sometimes', 'required', 'string', 'max:190'],
            'account_code' => ['nullable', 'string', 'max:30'],
            'bank_name' => ['nullable', 'string', 'max:190'],
            'bank_branch' => ['nullable', 'string', 'max:190'],
            'account_number' => ['nullable', 'string', 'max:80'],
            'opening_balance' => ['nullable', 'numeric', 'min:0'],
            'current_balance' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        if ($account->account_type === CompanyAccount::TYPE_BANK) {
            $bankName = array_key_exists('bank_name', $validated)
                ? trim((string) ($validated['bank_name'] ?? ''))
                : trim((string) ($account->bank_name ?? ''));

            if ($bankName === '') {
                return response()->json(['message' => 'Bank name is required for bank accounts.'], 422);
            }

            $accountNumber = array_key_exists('account_number', $validated)
                ? trim((string) ($validated['account_number'] ?? ''))
                : trim((string) ($account->account_number ?? ''));

            if ($accountNumber !== '') {
                $duplicate = CompanyAccount::query()
                    ->where('company_id', $company->id)
                    ->where('account_type', CompanyAccount::TYPE_BANK)
                    ->where('account_number', $accountNumber)
                    ->where('id', '!=', $account->id)
                    ->exists();

                if ($duplicate) {
                    return response()->json(['message' => 'A bank account with this account number already exists.'], 422);
                }
            }
        }

        DB::transaction(function () use ($validated, $company, $account): void {
            $lockedAccount = CompanyAccount::query()
                ->where('id', (int) $account->id)
                ->where('company_id', (int) $company->id)
                ->lockForUpdate()
                ->first();

            if (!$lockedAccount) {
                abort(response()->json(['message' => 'Account does not belong to this company.'], 404));
            }

            $payload = $validated;

            if (array_key_exists('opening_balance', $payload)) {
                $newOpening = round((float) $payload['opening_balance'], 2);
                $oldOpening = round((float) $lockedAccount->opening_balance, 2);
                $oldCurrent = round((float) $lockedAccount->current_balance, 2);

                $payload['opening_balance'] = $newOpening;

                if (!array_key_exists('current_balance', $payload) && abs($oldCurrent - $oldOpening) < 0.0001) {
                    $payload['current_balance'] = $newOpening;
                }

                if (in_array($lockedAccount->account_type, [CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_BANK], true)) {
                    $delta = round($newOpening - $oldOpening, 2);
                    if (abs($delta) > 0.0001) {
                        $mainAccount = CompanyAccount::query()
                            ->where('company_id', (int) $company->id)
                            ->where('account_type', CompanyAccount::TYPE_MAIN)
                            ->where('is_active', true)
                            ->lockForUpdate()
                            ->first();

                        if (!$mainAccount) {
                            abort(response()->json([
                                'message' => 'Main account is required before updating cash or bank balances.',
                            ], 422));
                        }

                        $mainBalance = round((float) ($mainAccount->current_balance ?? 0), 2);
                        if ($delta > 0 && $delta > $mainBalance) {
                            abort(response()->json([
                                'message' => 'Main account has insufficient balance for this opening allocation update.',
                            ], 422));
                        }

                        $mainAccount->current_balance = round($mainBalance - $delta, 2);
                        $mainAccount->save();
                    }
                }
            }

            if (array_key_exists('current_balance', $payload)) {
                $payload['current_balance'] = round((float) $payload['current_balance'], 2);
            }

            $lockedAccount->update($payload);
        });

        return response()->json([
            'message' => 'Company account updated successfully.',
            'account' => $account->fresh(),
        ]);
    }

    public function destroy(Company $company, CompanyAccount $account): JsonResponse
    {
        if ((int) $account->company_id !== (int) $company->id) {
            return response()->json(['message' => 'Account does not belong to this company.'], 404);
        }

        if ($account->account_type !== CompanyAccount::TYPE_BANK) {
            return response()->json([
                'message' => 'Main and cash accounts cannot be deleted. Update their opening balances instead.',
            ], 422);
        }

        $account->delete();

        return response()->json(['message' => 'Bank account removed successfully.']);
    }

    public function transferToBranch(Request $request, Company $company): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'target_branch_id' => ['required', 'integer', 'exists:companies,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'source_account_type' => ['nullable', Rule::in([CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_MAIN])],
            'target_account_type' => ['nullable', Rule::in([CompanyAccount::TYPE_CASH, CompanyAccount::TYPE_MAIN])],
        ]);

        $targetBranchId = (int) $validated['target_branch_id'];
        if ((int) $company->id === $targetBranchId) {
            return response()->json(['message' => 'Source and target branches must be different.'], 422);
        }

        $amount = round((float) $validated['amount'], 2);
        $sourceAccountType = (string) ($validated['source_account_type'] ?? CompanyAccount::TYPE_CASH);
        $targetAccountType = (string) ($validated['target_account_type'] ?? CompanyAccount::TYPE_CASH);

        $canTransferAnyBranch = method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin();
        if (!$canTransferAnyBranch && (int) ($company->manager_user_id ?? 0) !== (int) $user->id) {
            return response()->json(['message' => 'You are not allowed to transfer funds from this branch.'], 403);
        }

        $targetBranch = Company::query()->where('id', $targetBranchId)->first();
        if (!$targetBranch) {
            return response()->json(['message' => 'Target branch not found.'], 404);
        }

        DB::beginTransaction();

        try {
            $sourceAccount = CompanyAccount::query()
                ->where('company_id', (int) $company->id)
                ->where('account_type', $sourceAccountType)
                ->where('is_active', true)
                ->lockForUpdate()
                ->first();

            if (!$sourceAccount) {
                DB::rollBack();
                return response()->json(['message' => 'Source branch account is not available.'], 422);
            }

            $targetAccount = CompanyAccount::query()
                ->where('company_id', $targetBranchId)
                ->where('account_type', $targetAccountType)
                ->where('is_active', true)
                ->lockForUpdate()
                ->first();

            if (!$targetAccount) {
                DB::rollBack();
                return response()->json(['message' => 'Target branch account is not available.'], 422);
            }

            $sourceBalance = round((float) ($sourceAccount->current_balance ?? 0), 2);
            if ($amount > $sourceBalance) {
                DB::rollBack();
                return response()->json(['message' => 'Insufficient source account balance for this transfer.'], 422);
            }

            $sourceAccount->current_balance = round($sourceBalance - $amount, 2);
            $sourceAccount->save();

            $targetAccount->current_balance = round((float) ($targetAccount->current_balance ?? 0) + $amount, 2);
            $targetAccount->save();

            DB::commit();

            return response()->json([
                'message' => 'Funds transferred to target branch successfully.',
                'summary' => [
                    'source_branch_id' => (int) $company->id,
                    'source_branch_name' => (string) ($company->name ?? ''),
                    'source_account_id' => (int) $sourceAccount->id,
                    'source_account_type' => (string) $sourceAccount->account_type,
                    'source_account_balance' => round((float) ($sourceAccount->current_balance ?? 0), 2),
                    'target_branch_id' => (int) $targetBranch->id,
                    'target_branch_name' => (string) ($targetBranch->name ?? ''),
                    'target_account_id' => (int) $targetAccount->id,
                    'target_account_type' => (string) $targetAccount->account_type,
                    'target_account_balance' => round((float) ($targetAccount->current_balance ?? 0), 2),
                    'amount' => $amount,
                ],
            ]);
        } catch (\Throwable $exception) {
            DB::rollBack();
            throw $exception;
        }
    }
}
