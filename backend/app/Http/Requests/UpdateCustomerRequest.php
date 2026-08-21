<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $customerId = (int) ($this->route('customer')?->id ?? 0);

        return [
            'full_name_with_initials' => ['sometimes', 'string', 'max:255'],
            'first_name' => ['sometimes', 'string', 'max:120'],
            'last_name' => ['sometimes', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:20'],
            'nic_passport' => ['sometimes', 'string', 'max:60'],
            'old_nic' => ['nullable', 'string', 'max:60', Rule::unique('customers', 'old_nic')->ignore($customerId)],
            'passport_no' => ['nullable', 'string', 'max:60', Rule::unique('customers', 'passport_no')->ignore($customerId)],
            'driving_license_no' => ['nullable', 'string', 'max:60', Rule::unique('customers', 'driving_license_no')->ignore($customerId)],
            'tax_identification_no' => ['nullable', 'string', 'max:60', Rule::unique('customers', 'tax_identification_no')->ignore($customerId)],
            'biometric_reference' => ['nullable', 'string', 'max:255'],
            'date_of_birth' => ['sometimes', 'date'],
            'gender' => ['sometimes', 'in:male,female,other'],
            'marital_status' => ['nullable', 'in:single,married,divorced,widowed'],
            'nationality' => ['nullable', 'string', 'max:120'],
            'permanent_address' => ['sometimes', 'string', 'max:1000'],
            'current_address' => ['nullable', 'string', 'max:1000'],
            'employment_type' => ['nullable', 'string', 'max:120'],
            'employer_name' => ['nullable', 'string', 'max:255'],
            'job_title' => ['nullable', 'string', 'max:255'],
            'monthly_income' => ['nullable', 'numeric', 'min:0'],
            'other_income_sources' => ['nullable', 'string', 'max:500'],
            'existing_loans' => ['nullable', 'boolean'],
            'monthly_loan_obligations' => ['nullable', 'numeric', 'min:0'],
            'credit_score' => ['nullable', 'integer', 'min:0'],
            'additional_details' => ['nullable', 'array'],
            'additional_details.identity' => ['nullable', 'array'],
            'additional_details.identity.full_name_with_initials' => ['nullable', 'string', 'max:255'],
            'additional_details.identity.old_nic' => ['nullable', 'string', 'max:60'],
            'additional_details.identity.passport_no' => ['nullable', 'string', 'max:60'],
            'additional_details.identity.driving_license_no' => ['nullable', 'string', 'max:60'],
            'additional_details.identity.tax_identification_no' => ['nullable', 'string', 'max:60'],
            'additional_details.identity.biometric_reference' => ['nullable', 'string', 'max:255'],
            'additional_details.contact' => ['nullable', 'array'],
            'additional_details.contact.mobile' => ['nullable', 'string', 'max:20'],
            'additional_details.contact.second_mobile' => ['nullable', 'string', 'max:20'],
            'additional_details.contact.office_phone' => ['nullable', 'string', 'max:20'],
            'additional_details.contact.contact_no_01' => ['nullable', 'string', 'max:20'],
            'additional_details.contact.contact_no_02' => ['nullable', 'string', 'max:20'],
            'additional_details.contact.whatsapp_number' => ['nullable', 'string', 'max:20'],
            'additional_details.contact.email' => ['nullable', 'email', 'max:255'],
            'additional_details.contact.emergency_contact' => ['nullable', 'string', 'max:120'],
            'additional_details.contact.preferred_communication_method' => ['nullable', 'string', 'max:120'],
            'additional_details.residence' => ['nullable', 'array'],
            'additional_details.residence.permanent_address' => ['nullable', 'string', 'max:1000'],
            'additional_details.residence.current_address' => ['nullable', 'string', 'max:1000'],
            'additional_details.employment' => ['nullable', 'array'],
            'additional_details.business_information' => ['nullable', 'array'],
            'additional_details.financial_behaviour' => ['nullable', 'array'],
            'additional_details.banking_relationships' => ['nullable', 'array'],
            'additional_details.existing_loans' => ['nullable', 'array'],
            'additional_details.credit_history' => ['nullable', 'array'],
            'additional_details.risk_assessment' => ['nullable', 'array'],
            'additional_details.risk_assessment.credit_history' => ['nullable', 'numeric', 'min:0'],
            'additional_details.risk_assessment.income_stability' => ['nullable', 'numeric', 'min:0'],
            'additional_details.risk_assessment.existing_debt' => ['nullable', 'numeric', 'min:0'],
            'additional_details.risk_assessment.savings_relationship' => ['nullable', 'numeric', 'min:0'],
            'additional_details.risk_assessment.employment' => ['nullable', 'numeric', 'min:0'],
            'additional_details.risk_assessment.guarantor_strength' => ['nullable', 'numeric', 'min:0'],
            'additional_details.risk_assessment.collateral_quality' => ['nullable', 'numeric', 'min:0'],
            'additional_details.risk_assessment.total_score' => ['nullable', 'numeric', 'min:0'],
            'additional_details.residence_environment' => ['nullable', 'array'],
            'additional_details.residence_environment.images_count' => ['nullable', 'integer', 'min:0'],
            'additional_details.residence_environment.image_names' => ['nullable', 'array'],
            'additional_details.residence_environment.image_names.*' => ['nullable', 'string', 'max:255'],
            'additional_details.family_information' => ['nullable', 'array'],
            'additional_details.family_information.relationals' => ['nullable', 'array'],
            'additional_details.family_information.relationals.*.name' => ['nullable', 'string', 'max:255'],
            'additional_details.family_information.relationals.*.relationship' => ['nullable', 'string', 'max:255'],
            'additional_details.family_information.relationals.*.contact_no' => ['nullable', 'string', 'max:60'],
            'additional_details.family_information.relationals.*.signature_file_name' => ['nullable', 'string', 'max:255'],
            'onboarding_payload' => ['nullable', 'array'],
            'onboarding_payload.step_1' => ['nullable', 'array'],
            'onboarding_payload.step_2' => ['nullable', 'array'],
            'onboarding_payload.step_3' => ['nullable', 'array'],
            'onboarding_payload.step_4' => ['nullable', 'array'],
            'onboarding_payload.step_5' => ['nullable', 'array'],
            'onboarding_payload.step_6' => ['nullable', 'array'],
            'onboarding_payload.completed_steps' => ['nullable', 'integer', 'min:0', 'max:6'],
            'onboarding_payload.submitted_at' => ['nullable', 'date'],
            'status' => ['nullable', 'in:active,inactive,blacklisted'],
        ];
    }
}
