<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountingLoanExtraCharge;
use App\Models\Company;
use App\Models\Finance;
use App\Models\Mortgage;
use App\Models\MicrofinanceLoanRequest;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AccountingLoanExtraChargeController extends Controller
{
    private const PRODUCT_TYPE_LABELS = [
        AccountingLoanExtraCharge::PRODUCT_MICROFINANCE => 'Micro Finance',
        AccountingLoanExtraCharge::PRODUCT_MORTGAGE => 'Mortgage',
        AccountingLoanExtraCharge::PRODUCT_FINANCE => 'Finance',
    ];

    private function isAdminUser(?object $user): bool
    {
        if (!$user) {
            return false;
        }

        if (method_exists($user, 'isSystemAdmin') && $user->isSystemAdmin()) {
            return true;
        }

        $designationName = strtolower(trim((string) optional($user->designation)->name));
        if ($designationName !== '' && str_contains($designationName, 'admin')) {
            return true;
        }

        if (!method_exists($user, 'roles')) {
            return false;
        }

        foreach ($user->roles()->pluck('name') as $roleName) {
            $normalized = strtolower(trim((string) $roleName));
            if ($normalized !== '' && str_contains($normalized, 'admin')) {
                return true;
            }
        }

        return false;
    }

    private function ensureCompanyAccess(Request $request, Company $company): ?JsonResponse
    {
        if ($this->isAdminUser($request->user())) {
            return null;
        }

        $branchId = (int) ($request->user()?->branch_id ?? 0);
        if ($branchId <= 0 || $branchId !== (int) $company->id) {
            return response()->json(['message' => 'You do not have access to this branch.'], 403);
        }

        return null;
    }

    public function index(Request $request, Company $company): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        $validated = $request->validate([
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'mf_loan_request_id' => ['nullable', 'integer', 'min:1'],
            'product_type' => ['nullable', Rule::in(AccountingLoanExtraCharge::productTypes())],
            'charge_type' => ['nullable', Rule::in(AccountingLoanExtraCharge::chargeTypes())],
            'search' => ['nullable', 'string', 'max:190'],
            'loan_product_type' => ['nullable', Rule::in(AccountingLoanExtraCharge::productTypes())],
        ]);

        $query = AccountingLoanExtraCharge::query()
            ->where('company_id', $company->id)
            ->orderByDesc('charge_date')
            ->orderByDesc('id');

        if (!empty($validated['from_date'])) {
            $query->whereDate('charge_date', '>=', $validated['from_date']);
        }

        if (!empty($validated['to_date'])) {
            $query->whereDate('charge_date', '<=', $validated['to_date']);
        }

        if (!empty($validated['mf_loan_request_id'])) {
            $query->where(function ($builder) use ($validated) {
                $builder
                    ->where('source_loan_id', (int) $validated['mf_loan_request_id'])
                    ->orWhere('mf_loan_request_id', (int) $validated['mf_loan_request_id']);
            });
        }

        if (!empty($validated['product_type'])) {
            $query->where('product_type', $validated['product_type']);
        }

        if (!empty($validated['charge_type'])) {
            $query->where('charge_type', $validated['charge_type']);
        }

        if (!empty($validated['search'])) {
            $term = trim((string) $validated['search']);
            $query->where(function ($builder) use ($term) {
                $builder
                    ->where('title', 'like', "%{$term}%")
                    ->orWhere('reference_no', 'like', "%{$term}%")
                    ->orWhere('notes', 'like', "%{$term}%");
            });
        }

        $charges = $this->hydrateChargeLoans($query->get(), (int) $company->id);

        $loanProductType = $this->normalizeProductType((string) ($validated['loan_product_type'] ?? AccountingLoanExtraCharge::PRODUCT_MICROFINANCE));
        $loanOptions = $this->getLoanOptionsByProductType((int) $company->id, $loanProductType);

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'currency' => $company->currency,
            ],
            'charges' => $charges,
            'summary' => [
                'count' => $charges->count(),
                'total_amount' => round((float) $charges->sum(function ($row) {
                    return (float) ($row->extra_charges ?? $row->amount ?? 0);
                }), 2),
            ],
            'charge_types' => AccountingLoanExtraCharge::chargeTypes(),
            'product_types' => self::PRODUCT_TYPE_LABELS,
            'loan_options' => $loanOptions,
        ]);
    }

    public function store(Request $request, Company $company): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        $validated = $request->validate([
            'product_type' => ['required', Rule::in(AccountingLoanExtraCharge::productTypes())],
            'source_loan_id' => ['nullable', 'integer', 'min:1'],
            'mf_loan_request_id' => ['nullable', 'integer', 'min:1'],
            'charge_date' => ['required', 'date'],
            'charge_type' => ['required', Rule::in(AccountingLoanExtraCharge::chargeTypes())],
            'title' => ['required', 'string', 'max:190'],
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'extra_charges' => ['nullable', 'numeric', 'min:0.01'],
            'apply_to_loan_balance' => ['nullable', 'boolean'],
            'reference_no' => ['nullable', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $productType = $this->normalizeProductType((string) $validated['product_type']);
        $sourceLoanId = (int) ($validated['source_loan_id'] ?? $validated['mf_loan_request_id'] ?? 0);

        if ($sourceLoanId <= 0) {
            return response()->json(['message' => 'Loan is required.'], 422);
        }

        $loan = $this->findLoanForProductType($productType, (int) $company->id, $sourceLoanId);

        if (!$loan) {
            return response()->json(['message' => 'Loan not found for this branch.'], 404);
        }

        $amount = round((float) ($validated['extra_charges'] ?? $validated['amount'] ?? 0), 2);
        if ($amount <= 0) {
            return response()->json(['message' => 'Extra charges amount must be greater than zero.'], 422);
        }

        $applyToLoanBalance = true;

        $charge = DB::transaction(function () use ($request, $company, $loan, $validated, $amount, $applyToLoanBalance, $productType, $sourceLoanId) {
            $record = AccountingLoanExtraCharge::create([
                'company_id' => $company->id,
                'mf_loan_request_id' => $productType === AccountingLoanExtraCharge::PRODUCT_MICROFINANCE ? (int) $loan->id : null,
                'product_type' => $productType,
                'source_loan_id' => $sourceLoanId,
                'charge_date' => $validated['charge_date'],
                'charge_type' => $validated['charge_type'],
                'title' => trim((string) $validated['title']),
                'extra_charges' => $amount,
                'amount' => $amount,
                'apply_to_loan_balance' => $applyToLoanBalance,
                'reference_no' => isset($validated['reference_no']) ? trim((string) $validated['reference_no']) : null,
                'notes' => isset($validated['notes']) ? trim((string) $validated['notes']) : null,
                'created_by' => $request->user()?->id,
            ]);

            if ($applyToLoanBalance) {
                $this->applyAmountToLoanBalance($loan, $productType, $amount);
            }

            return $record->fresh();
        });

        $charge = $this->hydrateChargeLoans(new EloquentCollection([$charge]), (int) $company->id)->first();

        return response()->json([
            'message' => 'Loan extra charge added successfully.',
            'charge' => $charge,
        ], 201);
    }

    public function destroy(Request $request, Company $company, AccountingLoanExtraCharge $loanExtraCharge): JsonResponse
    {
        if ($denied = $this->ensureCompanyAccess($request, $company)) {
            return $denied;
        }

        if ((int) $loanExtraCharge->company_id !== (int) $company->id) {
            return response()->json(['message' => 'Charge not found for this branch.'], 404);
        }

        DB::transaction(function () use ($loanExtraCharge) {
            if ((bool) $loanExtraCharge->apply_to_loan_balance) {
                $productType = $this->normalizeProductType((string) ($loanExtraCharge->product_type ?: AccountingLoanExtraCharge::PRODUCT_MICROFINANCE));
                $sourceLoanId = (int) ($loanExtraCharge->source_loan_id ?? $loanExtraCharge->mf_loan_request_id ?? 0);
                $loan = $this->findLoanForProductType($productType, (int) $loanExtraCharge->company_id, $sourceLoanId);
                if ($loan) {
                    $amount = (float) ($loanExtraCharge->extra_charges ?? $loanExtraCharge->amount ?? 0);
                    $this->removeAmountFromLoanBalance($loan, $productType, $amount);
                }
            }

            $loanExtraCharge->delete();
        });

        return response()->json(['message' => 'Loan extra charge deleted successfully.']);
    }

    private function normalizeProductType(string $value): string
    {
        $normalized = strtolower(trim($value));
        if (!in_array($normalized, AccountingLoanExtraCharge::productTypes(), true)) {
            return AccountingLoanExtraCharge::PRODUCT_MICROFINANCE;
        }

        return $normalized;
    }

    private function getLoanOptionsByProductType(int $companyId, string $productType): Collection
    {
        if ($productType === AccountingLoanExtraCharge::PRODUCT_MORTGAGE) {
            return Mortgage::query()
                ->with(['customer:id,customer_code,first_name,last_name'])
                ->where('branch_id', $companyId)
                ->orderByDesc('id')
                ->limit(250)
                ->get()
                ->map(function ($loan) {
                    return [
                        'id' => (int) $loan->id,
                        'product_type' => AccountingLoanExtraCharge::PRODUCT_MORTGAGE,
                        'reference_no' => (string) ($loan->mortgage_qr_code ?: ('MORTGAGE-' . $loan->id)),
                        'customer_no' => (string) (optional($loan->customer)->customer_code ?? '-'),
                        'customer_name' => trim((string) ((optional($loan->customer)->first_name ?? '') . ' ' . (optional($loan->customer)->last_name ?? ''))),
                        'status' => (string) ($loan->status ?? '-'),
                        'loan_amount' => (float) ($loan->approved_amount ?? $loan->requested_amount ?? 0),
                        'refundable_amount' => (float) ($loan->approved_amount ?? $loan->requested_amount ?? 0),
                        'loan_balance' => round((float) ($loan->due_amount ?? 0) + (float) ($loan->arrears_amount ?? 0), 2),
                    ];
                })
                ->values();
        }

        if ($productType === AccountingLoanExtraCharge::PRODUCT_FINANCE) {
            return Finance::query()
                ->with(['customer:id,customer_code,first_name,last_name'])
                ->where('branch_id', $companyId)
                ->orderByDesc('id')
                ->limit(250)
                ->get()
                ->map(function ($loan) {
                    return [
                        'id' => (int) $loan->id,
                        'product_type' => AccountingLoanExtraCharge::PRODUCT_FINANCE,
                        'reference_no' => (string) ($loan->asset_reference ?: ('FINANCE-' . $loan->id)),
                        'customer_no' => (string) (optional($loan->customer)->customer_code ?? '-'),
                        'customer_name' => trim((string) ((optional($loan->customer)->first_name ?? '') . ' ' . (optional($loan->customer)->last_name ?? ''))),
                        'status' => (string) ($loan->status ?? '-'),
                        'loan_amount' => (float) ($loan->amount ?? 0),
                        'refundable_amount' => (float) ($loan->refund_amount ?? 0),
                        'loan_balance' => (float) ($loan->balance_amount ?? 0),
                    ];
                })
                ->values();
        }

        return MicrofinanceLoanRequest::query()
            ->select(['id', 'branch_id', 'reference_no', 'customer_no', 'customer_name', 'status', 'loan_amount', 'refundable_amount', 'loan_balance'])
            ->where('branch_id', $companyId)
            ->whereIn('status', ['requested', 'approved', 'released', 'hold'])
            ->orderByDesc('id')
            ->limit(250)
            ->get()
            ->map(function ($loan) {
                return [
                    'id' => (int) $loan->id,
                    'product_type' => AccountingLoanExtraCharge::PRODUCT_MICROFINANCE,
                    'reference_no' => (string) ($loan->reference_no ?? ''),
                    'customer_no' => (string) ($loan->customer_no ?? '-'),
                    'customer_name' => (string) ($loan->customer_name ?? '-'),
                    'status' => (string) ($loan->status ?? '-'),
                    'loan_amount' => (float) ($loan->loan_amount ?? 0),
                    'refundable_amount' => (float) ($loan->refundable_amount ?? 0),
                    'loan_balance' => (float) ($loan->loan_balance ?? 0),
                ];
            })
            ->values();
    }

    private function findLoanForProductType(string $productType, int $companyId, int $sourceLoanId): MicrofinanceLoanRequest|Mortgage|Finance|null
    {
        if ($productType === AccountingLoanExtraCharge::PRODUCT_MORTGAGE) {
            return Mortgage::query()
                ->where('id', $sourceLoanId)
                ->where('branch_id', $companyId)
                ->first();
        }

        if ($productType === AccountingLoanExtraCharge::PRODUCT_FINANCE) {
            return Finance::query()
                ->where('id', $sourceLoanId)
                ->where('branch_id', $companyId)
                ->first();
        }

        return MicrofinanceLoanRequest::query()
            ->where('id', $sourceLoanId)
            ->where('branch_id', $companyId)
            ->first();
    }

    private function applyAmountToLoanBalance(MicrofinanceLoanRequest|Mortgage|Finance $loan, string $productType, float $amount): void
    {
        if ($productType === AccountingLoanExtraCharge::PRODUCT_MORTGAGE && $loan instanceof Mortgage) {
            $loan->setAttribute('due_amount', number_format(round((float) ($loan->due_amount ?? 0) + $amount, 2), 2, '.', ''));
            $loan->setAttribute('arrears_amount', number_format(round((float) ($loan->arrears_amount ?? 0) + $amount, 2), 2, '.', ''));
            $loan->save();

            return;
        }

        if ($productType === AccountingLoanExtraCharge::PRODUCT_FINANCE && $loan instanceof Finance) {
            $loan->setAttribute('refund_amount', number_format(round((float) ($loan->refund_amount ?? 0) + $amount, 2), 2, '.', ''));
            $loan->setAttribute('balance_amount', number_format(round((float) ($loan->balance_amount ?? 0) + $amount, 2), 2, '.', ''));
            $loan->save();

            return;
        }

        if ($loan instanceof MicrofinanceLoanRequest) {
            $loan->setAttribute('refundable_amount', number_format(round((float) ($loan->refundable_amount ?? 0) + $amount, 2), 2, '.', ''));
            $loan->setAttribute('loan_balance', number_format(round((float) ($loan->loan_balance ?? 0) + $amount, 2), 2, '.', ''));
            $loan->save();
        }
    }

    private function removeAmountFromLoanBalance(MicrofinanceLoanRequest|Mortgage|Finance $loan, string $productType, float $amount): void
    {
        if ($productType === AccountingLoanExtraCharge::PRODUCT_MORTGAGE && $loan instanceof Mortgage) {
            $loan->setAttribute('due_amount', number_format(round(max((float) ($loan->due_amount ?? 0) - $amount, 0), 2), 2, '.', ''));
            $loan->setAttribute('arrears_amount', number_format(round(max((float) ($loan->arrears_amount ?? 0) - $amount, 0), 2), 2, '.', ''));
            $loan->save();

            return;
        }

        if ($productType === AccountingLoanExtraCharge::PRODUCT_FINANCE && $loan instanceof Finance) {
            $loan->setAttribute('refund_amount', number_format(round(max((float) ($loan->refund_amount ?? 0) - $amount, 0), 2), 2, '.', ''));
            $loan->setAttribute('balance_amount', number_format(round(max((float) ($loan->balance_amount ?? 0) - $amount, 0), 2), 2, '.', ''));
            $loan->save();

            return;
        }

        if ($loan instanceof MicrofinanceLoanRequest) {
            $loan->setAttribute('refundable_amount', number_format(round(max((float) ($loan->refundable_amount ?? 0) - $amount, 0), 2), 2, '.', ''));
            $loan->setAttribute('loan_balance', number_format(round(max((float) ($loan->loan_balance ?? 0) - $amount, 0), 2), 2, '.', ''));
            $loan->save();
        }
    }

    private function hydrateChargeLoans(EloquentCollection $charges, int $companyId): EloquentCollection
    {
        $microIds = [];
        $mortgageIds = [];
        $financeIds = [];

        foreach ($charges as $charge) {
            $productType = $this->normalizeProductType((string) ($charge->product_type ?: AccountingLoanExtraCharge::PRODUCT_MICROFINANCE));
            $charge->setAttribute('product_type', $productType);

            $sourceLoanId = (int) ($charge->source_loan_id ?? $charge->mf_loan_request_id ?? 0);
            if ($sourceLoanId <= 0) {
                continue;
            }

            if ($productType === AccountingLoanExtraCharge::PRODUCT_MORTGAGE) {
                $mortgageIds[] = $sourceLoanId;
            } elseif ($productType === AccountingLoanExtraCharge::PRODUCT_FINANCE) {
                $financeIds[] = $sourceLoanId;
            } else {
                $microIds[] = $sourceLoanId;
            }

            if ($charge->extra_charges === null && $charge->amount !== null) {
                $charge->setAttribute('extra_charges', $charge->amount);
            }
        }

        $microMap = MicrofinanceLoanRequest::query()
            ->select(['id', 'branch_id', 'reference_no', 'customer_no', 'customer_name', 'status', 'loan_amount', 'refundable_amount', 'loan_balance'])
            ->where('branch_id', $companyId)
            ->whereIn('id', array_values(array_unique($microIds)))
            ->get()
            ->keyBy('id');

        $mortgageMap = Mortgage::query()
            ->with(['customer:id,customer_code,first_name,last_name'])
            ->where('branch_id', $companyId)
            ->whereIn('id', array_values(array_unique($mortgageIds)))
            ->get()
            ->keyBy('id');

        $financeMap = Finance::query()
            ->with(['customer:id,customer_code,first_name,last_name'])
            ->where('branch_id', $companyId)
            ->whereIn('id', array_values(array_unique($financeIds)))
            ->get()
            ->keyBy('id');

        foreach ($charges as $charge) {
            $productType = $this->normalizeProductType((string) ($charge->product_type ?: AccountingLoanExtraCharge::PRODUCT_MICROFINANCE));
            $sourceLoanId = (int) ($charge->source_loan_id ?? $charge->mf_loan_request_id ?? 0);

            $loanPayload = null;
            if ($sourceLoanId > 0) {
                if ($productType === AccountingLoanExtraCharge::PRODUCT_MORTGAGE) {
                    $loan = $mortgageMap->get($sourceLoanId);
                    if ($loan) {
                        $loanPayload = [
                            'id' => (int) $loan->id,
                            'product_type' => $productType,
                            'reference_no' => (string) ($loan->mortgage_qr_code ?: ('MORTGAGE-' . $loan->id)),
                            'customer_no' => (string) (optional($loan->customer)->customer_code ?? '-'),
                            'customer_name' => trim((string) ((optional($loan->customer)->first_name ?? '') . ' ' . (optional($loan->customer)->last_name ?? ''))),
                            'status' => (string) ($loan->status ?? '-'),
                            'loan_amount' => (float) ($loan->approved_amount ?? $loan->requested_amount ?? 0),
                            'refundable_amount' => (float) ($loan->approved_amount ?? $loan->requested_amount ?? 0),
                            'loan_balance' => round((float) ($loan->due_amount ?? 0) + (float) ($loan->arrears_amount ?? 0), 2),
                        ];
                    }
                } elseif ($productType === AccountingLoanExtraCharge::PRODUCT_FINANCE) {
                    $loan = $financeMap->get($sourceLoanId);
                    if ($loan) {
                        $loanPayload = [
                            'id' => (int) $loan->id,
                            'product_type' => $productType,
                            'reference_no' => (string) ($loan->asset_reference ?: ('FINANCE-' . $loan->id)),
                            'customer_no' => (string) (optional($loan->customer)->customer_code ?? '-'),
                            'customer_name' => trim((string) ((optional($loan->customer)->first_name ?? '') . ' ' . (optional($loan->customer)->last_name ?? ''))),
                            'status' => (string) ($loan->status ?? '-'),
                            'loan_amount' => (float) ($loan->amount ?? 0),
                            'refundable_amount' => (float) ($loan->refund_amount ?? 0),
                            'loan_balance' => (float) ($loan->balance_amount ?? 0),
                        ];
                    }
                } else {
                    $loan = $microMap->get($sourceLoanId);
                    if ($loan) {
                        $loanPayload = [
                            'id' => (int) $loan->id,
                            'product_type' => $productType,
                            'reference_no' => (string) ($loan->reference_no ?? ''),
                            'customer_no' => (string) ($loan->customer_no ?? '-'),
                            'customer_name' => (string) ($loan->customer_name ?? '-'),
                            'status' => (string) ($loan->status ?? '-'),
                            'loan_amount' => (float) ($loan->loan_amount ?? 0),
                            'refundable_amount' => (float) ($loan->refundable_amount ?? 0),
                            'loan_balance' => (float) ($loan->loan_balance ?? 0),
                        ];
                    }
                }
            }

            $charge->setRelation('loan', (object) ($loanPayload ?? []));
        }

        return $charges;
    }
}
