<?php

namespace App\Http\Controllers\Api\Microfinance;

use App\Http\Controllers\Controller;
use App\Models\MicrofinanceLoanProduct;
use Illuminate\Http\Request;

class LoanProductController extends Controller
{
    public function index()
    {
        return response()->json(
            MicrofinanceLoanProduct::orderBy('id', 'desc')->get()
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:mf_loan_products,name',
            'min_loan_amount' => 'nullable|numeric|min:0',
            'max_loan_amount' => 'nullable|numeric|min:0|gte:min_loan_amount',
            'document_charge_percentage' => 'nullable|numeric|min:0|max:100',
            'stamp_charge_percentage' => 'nullable|numeric|min:0|max:100',
            'insurance_charge_percentage' => 'nullable|numeric|min:0|max:100',
            'interest_rate' => 'required|numeric|min:0',
            'interest_type' => 'required|in:flat,reducing',
            'terms_count' => 'required|integer|min:1|max:10000',
            'refund_option' => 'required|in:day,week,month',
            'assumed_month_days' => 'nullable|integer|min:20|max:31',
            'is_active' => 'nullable|boolean',
        ]);

        $product = MicrofinanceLoanProduct::create([
            'name' => $validated['name'],
            'min_loan_amount' => $validated['min_loan_amount'] ?? null,
            'max_loan_amount' => $validated['max_loan_amount'] ?? null,
            'document_charge_percentage' => $validated['document_charge_percentage'] ?? null,
            'stamp_charge_percentage' => $validated['stamp_charge_percentage'] ?? null,
            'insurance_charge_percentage' => $validated['insurance_charge_percentage'] ?? null,
            'interest_rate' => $validated['interest_rate'],
            'interest_type' => $validated['interest_type'],
            'terms_count' => (int) $validated['terms_count'],
            'refund_option' => $validated['refund_option'],
            'assumed_month_days' => (int) ($validated['assumed_month_days'] ?? 30),
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json($product, 201);
    }

    public function show(MicrofinanceLoanProduct $loanProduct)
    {
        return response()->json($loanProduct);
    }

    public function update(Request $request, MicrofinanceLoanProduct $loanProduct)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:mf_loan_products,name,' . $loanProduct->id,
            'min_loan_amount' => 'nullable|numeric|min:0',
            'max_loan_amount' => 'nullable|numeric|min:0|gte:min_loan_amount',
            'document_charge_percentage' => 'nullable|numeric|min:0|max:100',
            'stamp_charge_percentage' => 'nullable|numeric|min:0|max:100',
            'insurance_charge_percentage' => 'nullable|numeric|min:0|max:100',
            'interest_rate' => 'required|numeric|min:0',
            'interest_type' => 'required|in:flat,reducing',
            'terms_count' => 'required|integer|min:1|max:10000',
            'refund_option' => 'required|in:day,week,month',
            'assumed_month_days' => 'nullable|integer|min:20|max:31',
            'is_active' => 'nullable|boolean',
        ]);

        $loanProduct->update([
            'name' => $validated['name'],
            'min_loan_amount' => $validated['min_loan_amount'] ?? null,
            'max_loan_amount' => $validated['max_loan_amount'] ?? null,
            'document_charge_percentage' => $validated['document_charge_percentage'] ?? null,
            'stamp_charge_percentage' => $validated['stamp_charge_percentage'] ?? null,
            'insurance_charge_percentage' => $validated['insurance_charge_percentage'] ?? null,
            'interest_rate' => $validated['interest_rate'],
            'interest_type' => $validated['interest_type'],
            'terms_count' => (int) $validated['terms_count'],
            'refund_option' => $validated['refund_option'],
            'assumed_month_days' => (int) ($validated['assumed_month_days'] ?? ($loanProduct->assumed_month_days ?? 30)),
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json($loanProduct);
    }

    public function destroy(MicrofinanceLoanProduct $loanProduct)
    {
        $loanProduct->delete();

        return response()->json(['message' => 'Loan product deleted successfully']);
    }
}
