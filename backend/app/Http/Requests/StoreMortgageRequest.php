<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreMortgageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'mortgage_type' => ['required', 'in:land,house,vehicle,gold,other'],
            'requested_amount' => ['required', 'numeric', 'min:0'],
            'approved_amount' => ['nullable', 'numeric', 'min:0'],
            'interest_rate' => ['required', 'numeric', 'min:0'],
            'interest_type' => ['required', 'in:fixed,reducing'],
            'tenure_months' => ['required', 'integer', 'min:1'],
            'installment_frequency' => ['required', 'in:daily,weekly,monthly,quarterly,yearly'],
            'interest_calculation_frequency' => ['required', 'in:daily,weekly,monthly,yearly'],
            'processing_fee' => ['nullable', 'numeric', 'min:0'],
            'insurance_fee' => ['nullable', 'numeric', 'min:0'],
            'penalty_scheme' => ['nullable', 'string', 'max:64'],
            'penalty_rate' => ['nullable', 'numeric', 'min:0'],
            'start_date' => ['nullable', 'date'],
            'previous_mortgages' => ['nullable', 'string', 'max:1000'],
            'responsible_manager_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'responsible_manager_name' => ['nullable', 'string', 'max:120'],
            'entry_officer_name' => ['nullable', 'string', 'max:120'],
            'entry_officer_designation' => ['nullable', 'string', 'max:120'],

            // Optional nested sections
            'asset' => ['nullable', 'array'],
            'asset.asset_type' => ['required_with:asset', 'in:land,house,vehicle,gold,other'],
            'asset.description' => ['required_with:asset', 'string'],
            'asset.ownership_type' => ['required_with:asset', 'in:single,joint'],
            'asset.address' => ['nullable', 'string'],
            'asset.deed_number' => ['nullable', 'string'],
            'asset.deed_date' => ['nullable', 'date'],
            'asset.survey_plan_number' => ['nullable', 'string'],
            'asset.registration_office' => ['nullable', 'string'],
            'asset.land_size_or_area' => ['nullable', 'string'],
            'asset.vehicle_reg_no' => ['nullable', 'string'],
            'asset.engine_no' => ['nullable', 'string'],
            'asset.chassis_no' => ['nullable', 'string'],

            'valuation' => ['nullable', 'array'],
            'valuation.market_value' => ['nullable', 'numeric', 'min:0'],
            'valuation.forced_sale_value' => ['nullable', 'numeric', 'min:0'],
            'valuation.valuation_date' => ['nullable', 'date'],
            'valuation.valuer_name' => ['nullable', 'string'],

            'co_borrower' => ['nullable', 'array'],
            'co_borrower.full_name' => ['nullable', 'string'],
            'co_borrower.nic' => ['nullable', 'string'],
            'co_borrower.relationship' => ['nullable', 'string'],
            'co_borrower.address' => ['nullable', 'string'],
            'co_borrower.contact_number' => ['nullable', 'string'],
            'co_borrower.monthly_income' => ['nullable', 'numeric', 'min:0'],

            // Optional guarantors array
            'guarantors' => ['nullable', 'array'],
            'guarantors.*.name' => ['nullable', 'string'],
            'guarantors.*.full_name' => ['nullable', 'string'],
            'guarantors.*.nic' => ['nullable', 'string'],
            'guarantors.*.relationship' => ['nullable', 'string'],
            'guarantors.*.address' => ['nullable', 'string'],
            'guarantors.*.income' => ['nullable', 'numeric', 'min:0'],
            'guarantors.*.monthly_income' => ['nullable', 'numeric', 'min:0'],
            'guarantors.*.contact_number' => ['nullable', 'string'],

            // Optional nested asset sub-sections (legal, valuation, physical, vehicle)
            'asset.legal' => ['nullable', 'array'],
            'asset.legal.deed_number' => ['nullable', 'string'],
            'asset.legal.deed_date' => ['nullable', 'date'],
            'asset.legal.survey_plan_number' => ['nullable', 'string'],
            'asset.legal.registration_office' => ['nullable', 'string'],
            'asset.legal.lawyer_name' => ['nullable', 'string'],

            'asset.valuation' => ['nullable', 'array'],
            'asset.valuation.market_value' => ['nullable', 'numeric', 'min:0'],
            'asset.valuation.forced_sale_value' => ['nullable', 'numeric', 'min:0'],
            'asset.valuation.valuation_date' => ['nullable', 'date'],
            'asset.valuation.valuer_name' => ['nullable', 'string'],

            'asset.physical' => ['nullable', 'array'],
            'asset.physical.address' => ['nullable', 'string'],
            'asset.physical.area' => ['nullable', 'string'],
            'asset.physical.boundaries' => ['nullable', 'string'],

            'asset.vehicle' => ['nullable', 'array'],
            'asset.vehicle.registration_number' => ['nullable', 'string'],
            'asset.vehicle.engine_number' => ['nullable', 'string'],
            'asset.vehicle.chassis_number' => ['nullable', 'string'],
            'asset.vehicle.manufacture_year' => ['nullable', 'string'],
        ];
    }
}
