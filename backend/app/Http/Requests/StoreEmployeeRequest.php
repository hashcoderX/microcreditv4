<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreEmployeeRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // For now, allow all authenticated users
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'user_id' => 'required|string|max:255|unique:users,email',
            'email' => 'required|email|unique:employees,email',
            'nic_passport' => 'required|string|max:100|unique:employees,nic_passport',
            'password' => 'required|string|min:8',
            'phone' => 'nullable|string|max:20',
            'reporting_person' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'photo_path' => 'nullable|string',
            'date_of_birth' => 'nullable|date|before:today',
            'hire_date' => 'required|date',
            'basic_salary' => 'required|numeric|min:0',
            'commission' => 'nullable|numeric|min:0|max:100',
            'commission_base' => 'nullable|in:company_profit,own_business',
            'monthly_target' => 'nullable|numeric|min:0',
            'overtime_payment_per_hour' => 'nullable|numeric|min:0',
            'deduction_late_hour' => 'nullable|numeric|min:0',
            'epf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'epf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'tin' => 'nullable|string|max:50',
            'tax_applicable' => 'nullable|boolean',
            'tax_relief_eligible' => 'nullable|boolean',
            'apit_tax_amount' => 'nullable|numeric|min:0',
            'apit_tax_rate' => 'nullable|numeric|min:0|max:100',
            'department_id' => 'required|exists:departments,id',
            'designation_id' => 'required|exists:designations,id',
            'branch_id' => 'required|exists:companies,id',
            'status' => 'in:active,inactive',
            'create_wallet' => 'nullable|boolean',
            'wallet_opening_balance' => 'nullable|numeric|min:0',
        ];
    }
}
