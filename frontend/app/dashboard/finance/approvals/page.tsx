'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl, resolveStorageAssetUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Clock3, Eye, Sparkles, Trash2, XCircle } from 'lucide-react';

type FinanceApprovalRow = {
  id: number;
  branch_id?: number | string | null;
  finance_type?: string | null;
  product_type?: string | null;
  asset_reference?: string | null;
  amount?: number | string | null;
  down_payment?: number | string | null;
  financed_amount?: number | string | null;
  interest_rate?: number | string | null;
  interest_type?: string | null;
  tenure_months?: number | string | null;
  installment_frequency?: string | null;
  installment_amount?: number | string | null;
  refund_amount?: number | string | null;
  total_paid_amount?: number | string | null;
  balance_amount?: number | string | null;
  status?: string | null;
  start_date?: string | null;
  created_at?: string | null;
  vehicle_details?: {
    vehicle_no?: string | null;
    chassis_no?: string | null;
    engine_no?: string | null;
    make_model?: string | null;
    year?: string | number | null;
  } | null;
  valuation_details?: {
    valuation_amount?: string | number | null;
    valuation_date?: string | null;
    valuer_name?: string | null;
  } | null;
  guarantor_details?: Array<{
    name?: string | null;
    nic?: string | null;
    phone?: string | null;
    address?: string | null;
  }> | null;
  family_financial_details?: Record<string, unknown> | null;
  evaluation_payload?: Record<string, unknown> | null;
  evaluation_payload_version?: number | string | null;
  repayment_plan?: {
    schedule_mode?: 'auto' | 'fixed_day' | 'custom_date' | null;
    first_installment_date?: string | null;
    collection_day_of_month?: number | string | null;
    grace_period_days?: number | string | null;
    installment_mode?: 'auto' | 'manual' | null;
    manual_installment_amount?: number | string | null;
    total_planned_amount?: number | string | null;
    next_installment_index?: number | string | null;
    installments?: Array<{
      installment_no?: number | string | null;
      payment_date?: string | null;
      amount?: number | string | null;
    }> | null;
    deduction_order?: {
      mode?: 'flat' | 'front_loaded' | 'installment_wise' | null;
      profit_percentage?: number | string | null;
      capital_percentage?: number | string | null;
      initial_installments?: number | string | null;
      initial_profit_percentage?: number | string | null;
      initial_capital_percentage?: number | string | null;
      remaining_profit_percentage?: number | string | null;
      remaining_capital_percentage?: number | string | null;
      installment_rules?: Array<{
        installment_no?: number | string | null;
        installment_amount?: number | string | null;
        profit_percentage?: number | string | null;
        capital_percentage?: number | string | null;
      }> | null;
    } | null;
    call_confirmation_payload?: Record<string, unknown> | null;
    bm_approval_payload?: Record<string, unknown> | null;
    ho_approval_payload?: Record<string, unknown> | null;
    cash_allocation_payload?: Record<string, unknown> | null;
    cash_request_payload?: Record<string, unknown> | null;
    cash_withdrawal_payload?: Record<string, unknown> | null;
    second_call_confirmation_payload?: Record<string, unknown> | null;
    loan_signature_check_payload?: Record<string, unknown> | null;
    document_filing_payload?: Record<string, unknown> | null;
    approval_workflow?: {
      current_step?: number | string | null;
      max_steps?: number | string | null;
      step_title?: string | null;
      updated_at?: string | null;
      history?: Array<Record<string, unknown>> | null;
    } | null;
  } | null;
  documents?: Array<{
    id: number;
    document_type?: string | null;
    original_name?: string | null;
    file_path?: string | null;
    file_url?: string | null;
  }> | null;
  customer?: {
    customer_code?: string | null;
    first_name?: string;
    last_name?: string;
    nic_passport?: string | null;
    nic?: string | null;
    phone?: string | null;
    address?: string | null;
    dob?: string | null;
    date_of_birth?: string | null;
    customer_photo_url?: string | null;
    photo_path?: string | null;
  } | null;
};

type DeductionInstallmentRule = {
  installment_no: number;
  installment_amount: string;
  profit_percentage: string;
};

type FinanceCallConfirmationForm = {
  no_of_times_called: string;
  called_date: string;
  answered_by_customer: boolean;
  answered_by_spouse: boolean;
  customer_contact_no: string;
  spouse_contact_no: string;
  customer_full_name: string;
  nic_or_dob: string;
  loan_amount: string;
  given_date: string;
  business_type: string;
  repayment_card_given: 'yes' | 'no';
  business_details: string;
  special_notes: string;
  disbursement_otp: string;
};

type FinanceBmApprovalForm = {
  bm_comments: string;
  bm_additional_notes: string;
};

type FinanceHoApprovalForm = {
  confirm_customer_photo: boolean;
  confirm_customer_signature: boolean;
  ho_additional_notes: string;
};

type FinanceCashAllocationForm = {
  branch_id: string;
  branch_name: string;
  today_cash_requirement: string;
  today_allocation_amount: string;
  tomorrow_allocation_amount: string;
};

type FinanceCashRequestForm = {
  customer_name: string;
  customer_number: string;
  loan_amount: string;
};

type FinanceCashWithdrawalForm = {
  customer_name: string;
  customer_number: string;
  loan_amount: string;
};

type FinanceSecondCallConfirmationForm = {
  customer_full_name: string;
  nic_number: string;
  registered_mobile_number: string;
  date_of_birth: string;
  address: string;
  loan_amount: string;
  loan_purpose: string;
  loan_term: string;
  installment: string;
  payment_frequency: string;
  interest_rate: string;
  first_payment_date: string;
  number_of_installments: string;
  confirm_customer_full_name: boolean;
  confirm_nic_number: boolean;
  confirm_registered_mobile_number: boolean;
  confirm_date_of_birth: boolean;
  confirm_address: boolean;
  confirm_loan_amount: boolean;
  confirm_loan_purpose: boolean;
  confirm_loan_term: boolean;
  confirm_installment: boolean;
  confirm_payment_frequency: boolean;
  confirm_interest_rate: boolean;
  confirm_first_payment_date: boolean;
  confirm_number_of_installments: boolean;
};

type FinanceLoanSignatureCheckForm = {
  confirm_customer_photo: boolean;
  confirm_customer_signature: boolean;
  customer_photo_url: string;
  customer_signature_url: string;
};

type FinanceDocumentVerificationItem = {
  key: string;
  label: string;
  keywords: string[];
};

type FinanceDocumentVerificationDecision = {
  key: string;
  label: string;
  document_url: string;
  document_available: boolean;
  verify: boolean;
  not_required: boolean;
};

type FinanceDocumentFilingForm = {
  documents: FinanceDocumentVerificationDecision[];
};

const FINANCE_DOCUMENT_VERIFICATION_ITEMS: FinanceDocumentVerificationItem[] = [
  { key: 'customer_national_id', label: 'Customer National ID', keywords: ['nic', 'national id', 'id card'] },
  { key: 'passport', label: 'Passport', keywords: ['passport'] },
  { key: 'driving_license', label: 'Driving License', keywords: ['driving license', 'driving licence', 'license', 'licence'] },
  { key: 'bank_statements', label: 'Bank Statements', keywords: ['bank statement', 'statement'] },
  { key: 'epf_reports', label: 'EPF Reports', keywords: ['epf'] },
  { key: 'tax_returns', label: 'Tax Returns', keywords: ['tax return', 'tax'] },
  { key: 'paysheets', label: 'Paysheets', keywords: ['paysheet', 'pay sheet', 'salary slip', 'pay slip'] },
  { key: 'business_documents', label: 'Business Documents', keywords: ['business document', 'business registration', 'business'] },
  { key: 'guarantor_image', label: 'Guarantor Image', keywords: ['guarantor image', 'guarantor photo'] },
  { key: 'guarantor_signature', label: 'Guarantor Signature', keywords: ['guarantor signature'] },
];

type BranchOption = {
  id: number;
  name: string;
};

type AuthUser = {
  id?: number;
  name?: string;
  roles?: Array<{ id?: number; name?: string }>;
  designation?: { id?: number; name?: string | null } | null;
  employee?: { designation?: { id?: number; name?: string | null } | null } | null;
};

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function formatAmount(v: unknown): string {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(v: unknown): string {
  if (!v) return '-';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

function toInputDate(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveFinanceCustomerPhotoUrl(finance: FinanceApprovalRow): string {
  const direct = String(finance.customer?.customer_photo_url || '').trim();
  if (direct) {
    return resolveStorageAssetUrl(direct);
  }

  const customerPath = String(finance.customer?.photo_path || '').trim();
  if (customerPath) {
    return resolveStorageAssetUrl(customerPath);
  }

  const doc = (finance.documents || []).find((item) =>
    String(item.document_type || '').toLowerCase().includes('customer photo')
  );
  if (!doc) return '';

  const byUrl = String(doc.file_url || '').trim();
  if (byUrl) return resolveStorageAssetUrl(byUrl);

  const byPath = String(doc.file_path || '').trim();
  if (byPath) return resolveStorageAssetUrl(byPath);

  return '';
}

function resolveFinanceCustomerSignatureUrl(finance: FinanceApprovalRow): string {
  const doc = (finance.documents || []).find((item) => {
    const type = String(item.document_type || '').toLowerCase();
    return type.includes('customer signature') || type === 'signature' || type.includes('signature');
  });

  if (!doc) return '';

  const byUrl = String(doc.file_url || '').trim();
  if (byUrl) return resolveStorageAssetUrl(byUrl);

  const byPath = String(doc.file_path || '').trim();
  if (byPath) return resolveStorageAssetUrl(byPath);

  return '';
}

function resolveFinanceDocumentUrlByKeywords(finance: FinanceApprovalRow, keywords: string[]): string {
  const normalizedKeywords = keywords
    .map((item) => String(item || '').toLowerCase().trim())
    .filter((item) => item !== '');

  if (normalizedKeywords.length === 0) return '';

  const doc = (finance.documents || []).find((item) => {
    const type = String(item.document_type || '').toLowerCase();
    return normalizedKeywords.some((keyword) => type.includes(keyword));
  });

  if (!doc) return '';

  const byUrl = String(doc.file_url || '').trim();
  if (byUrl) return resolveStorageAssetUrl(byUrl);

  const byPath = String(doc.file_path || '').trim();
  if (byPath) return resolveStorageAssetUrl(byPath);

  return '';
}

function hasAnyMeaningfulValue(input: unknown): boolean {
  if (input === null || input === undefined) return false;
  if (typeof input === 'string') return input.trim() !== '';
  if (typeof input === 'number') return Number.isFinite(input);
  if (typeof input === 'boolean') return true;
  if (Array.isArray(input)) return input.length > 0;
  if (typeof input === 'object') return Object.keys(input as Record<string, unknown>).length > 0;
  return false;
}

function toPreviewLabel(key: string): string {
  const clean = key.replace(/[_-]+/g, ' ').trim();
  if (!clean) return '-';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function toPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-';
  if (typeof value === 'string') return value.trim() || '-';
  if (Array.isArray(value)) return value.length > 0 ? value.map((item) => toPreviewValue(item)).join(', ') : '-';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).length > 0 ? JSON.stringify(obj) : '-';
  }
  return String(value);
}

function isCurrencyLikeKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return [
    'amount',
    'expense',
    'income',
    'salary',
    'value',
    'cost',
    'price',
    'payment',
    'installment',
    'profit',
    'capital',
    'allocation',
  ].some((token) => normalized.includes(token));
}

function formatReadableNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const decimals = Number.isInteger(value) ? 0 : 2;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatEvaluationScalarValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    return isCurrencyLikeKey(key) ? `LKR ${formatReadableNumber(value)}` : formatReadableNumber(value);
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '-';
    const numeric = Number(text);
    if (Number.isFinite(numeric) && text !== '' && /^-?\d+(\.\d+)?$/.test(text)) {
      return isCurrencyLikeKey(key) ? `LKR ${formatReadableNumber(numeric)}` : formatReadableNumber(numeric);
    }
    return text;
  }

  return toPreviewValue(value);
}

function resolveFinanceCollateralType(finance: FinanceApprovalRow): { type: 'vehicle' | 'land' | 'gold' | 'equipment' | 'other'; label: string } {
  const vehicleDetails = finance.vehicle_details as Record<string, unknown> | null | undefined;
  const vehicleKeys = ['vehicle_no', 'registration_no', 'make_model', 'engine_no', 'chassis_no', 'year'];
  if (vehicleDetails && vehicleKeys.some((key) => hasAnyMeaningfulValue(vehicleDetails[key]))) {
    return { type: 'vehicle', label: 'Vehicle Details' };
  }

  const evalPayload = finance.evaluation_payload as Record<string, unknown> | null | undefined;
  const evalAssetType = String(evalPayload?.asset_type || evalPayload?.collateral_type || '').toLowerCase().trim();
  if (evalAssetType.includes('vehicle')) return { type: 'vehicle', label: 'Vehicle Details' };
  if (evalAssetType.includes('land')) return { type: 'land', label: 'Land Details' };
  if (evalAssetType.includes('gold')) return { type: 'gold', label: 'Gold Details' };
  if (evalAssetType.includes('equipment')) return { type: 'equipment', label: 'Equipment Details' };

  const financeType = String(finance.finance_type || '').toLowerCase().trim();
  if (financeType.includes('vehicle')) return { type: 'vehicle', label: 'Vehicle Details' };
  if (financeType.includes('land')) return { type: 'land', label: 'Land Details' };
  if (financeType.includes('gold')) return { type: 'gold', label: 'Gold Details' };
  if (financeType.includes('equipment')) return { type: 'equipment', label: 'Equipment Details' };

  const docTypes = (finance.documents || []).map((doc) => String(doc.document_type || '').toLowerCase());
  if (docTypes.some((t) => t.includes('vehicle') || t.includes('chassis') || t.includes('engine'))) return { type: 'vehicle', label: 'Vehicle Details' };
  if (docTypes.some((t) => t.includes('land') || t.includes('deed'))) return { type: 'land', label: 'Land Details' };
  if (docTypes.some((t) => t.includes('gold') || t.includes('jewellery') || t.includes('jewelry'))) return { type: 'gold', label: 'Gold Details' };
  if (docTypes.some((t) => t.includes('equipment') || t.includes('machine'))) return { type: 'equipment', label: 'Equipment Details' };

  return { type: 'other', label: 'Other Details' };
}

const FINANCE_WORKFLOW_STEPS = [
  'CRO Check Pending',
  'Pending Call Confirmation',
  'BM Approval',
  'Head Office Approval',
  'Cash Allocation',
  'Cash Request',
  'Cash Withdrawal',
  'Second Call Confirmation',
  'Loan Signature Check',
  'Document Filing',
  'Insurance Request',
  'Branch Insurance Request',
  'Head Office Insurance Request',
  'Grant',
];

const FINANCE_WORKFLOW_STEP_DEFINITIONS: Record<number, string> = {
  1: 'Initial CRO review of customer basics and field-level readiness.',
  2: 'First call verification to confirm customer intent and details.',
  3: 'Branch Manager approval checkpoint before head office flow.',
  4: 'Head office approval review for policy and risk compliance.',
  5: 'Cash allocation planning for the approved loan amount.',
  6: 'Cash request submission to prepare withdrawal processing.',
  7: 'Cash withdrawal execution and transfer readiness.',
  8: 'Second call confirmation before signature and final checks.',
  9: 'Loan signature verification and document completeness check.',
  10: 'Document filing stage for missing or invalid paperwork.',
  11: 'Insurance request creation for required loan protection.',
  12: 'Branch-level insurance processing and confirmation.',
  13: 'Head office insurance final confirmation and clearance.',
  14: 'Final grant stage for loan release completion.',
};

function getFinanceWorkflowStepLabel(step: number): string {
  const normalized = Math.min(Math.max(Math.floor(step || 1), 1), FINANCE_WORKFLOW_STEPS.length);
  return FINANCE_WORKFLOW_STEPS[normalized - 1] || 'Workflow Step';
}

function getFinanceWorkflowStepDefinition(step: number): string {
  const normalized = Math.min(Math.max(Math.floor(step || 1), 1), FINANCE_WORKFLOW_STEPS.length);
  return FINANCE_WORKFLOW_STEP_DEFINITIONS[normalized] || 'Workflow step definition is not available.';
}

function getFinanceBackStepOptions(currentStep: number): number[] {
  const normalizedCurrentStep = Math.min(Math.max(Math.floor(currentStep || 1), 1), FINANCE_WORKFLOW_STEPS.length);
  const options: number[] = [];

  for (let step = normalizedCurrentStep - 1; step >= 1; step -= 1) {
    options.push(step);
  }

  return options;
}

function getFinanceStepActionText(currentStep: number): string {
  switch (currentStep) {
    case 1:
      return 'Complete CRO Check & Move to Call Confirmation';
    case 2:
      return 'Open Call Confirmation';
    case 3:
      return 'Approve as BM & Move to Head Office';
    case 4:
      return 'Approve at Head Office & Move to Cash Allocation';
    case 5:
      return 'Cash Allocation Complete & Move to Cash Request';
    case 6:
      return 'Cash Request Complete & Move to Cash Withdrawal';
    case 7:
      return 'Cash Withdrawal Complete & Move to Second Call';
    case 8:
      return 'Second Call Complete & Move to Signature Check';
    case 9:
      return 'Signature Check Complete & Move to Document Filing';
    case 10:
      return 'Document Filing Complete & Move to Insurance Request';
    case 11:
      return 'Insurance Request Complete & Move to Branch Insurance';
    case 12:
      return 'Branch Insurance Complete & Move to Head Office Insurance';
    case 13:
      return 'Head Office Insurance Complete & Move to Grant';
    default:
      return 'Move Next Step';
  }
}

export default function FinanceApprovalsPage() {
  const router = useRouter();
  const widgetPrefix = 'finance_approvals_widget_';
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinanceApprovalRow[]>([]);
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedFinance, setSelectedFinance] = useState<FinanceApprovalRow | null>(null);
  const [deductionMode, setDeductionMode] = useState<'flat' | 'front_loaded' | 'installment_wise'>('flat');
  const [deductionProfitPercentage, setDeductionProfitPercentage] = useState('18');
  const [deductionInitialInstallments, setDeductionInitialInstallments] = useState('12');
  const [deductionInitialProfitPercentage, setDeductionInitialProfitPercentage] = useState('25');
  const [deductionRemainingProfitPercentage, setDeductionRemainingProfitPercentage] = useState('15');
  const [deductionInstallmentRules, setDeductionInstallmentRules] = useState<DeductionInstallmentRule[]>([]);
  const [deductionError, setDeductionError] = useState('');
  const [alertModal, setAlertModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: '' | 'remove_loan';
    financeId: number | null;
  }>({
    open: false,
    title: '',
    message: '',
    action: '',
    financeId: null,
  });
  const [activeReviewSection, setActiveReviewSection] = useState<
    'basic'
    | 'customer'
    | 'asset'
    | 'guarantor'
    | 'repayment'
    | 'family_financial'
    | 'residence_images'
    | 'evaluation'
    | 'documents'
  >('basic');
  const [stepTwoModalOpen, setStepTwoModalOpen] = useState(false);
  const [bmApprovalModalOpen, setBmApprovalModalOpen] = useState(false);
  const [bmApprovalForm, setBmApprovalForm] = useState<FinanceBmApprovalForm>({
    bm_comments: '',
    bm_additional_notes: '',
  });
  const [hoApprovalModalOpen, setHoApprovalModalOpen] = useState(false);
  const [hoApprovalForm, setHoApprovalForm] = useState<FinanceHoApprovalForm>({
    confirm_customer_photo: false,
    confirm_customer_signature: false,
    ho_additional_notes: '',
  });
  const [cashAllocationModalOpen, setCashAllocationModalOpen] = useState(false);
  const [cashAllocationForm, setCashAllocationForm] = useState<FinanceCashAllocationForm>({
    branch_id: '',
    branch_name: '',
    today_cash_requirement: '',
    today_allocation_amount: '',
    tomorrow_allocation_amount: '',
  });
  const [cashRequestModalOpen, setCashRequestModalOpen] = useState(false);
  const [cashRequestForm, setCashRequestForm] = useState<FinanceCashRequestForm>({
    customer_name: '',
    customer_number: '',
    loan_amount: '',
  });
  const [cashWithdrawalModalOpen, setCashWithdrawalModalOpen] = useState(false);
  const [cashWithdrawalForm, setCashWithdrawalForm] = useState<FinanceCashWithdrawalForm>({
    customer_name: '',
    customer_number: '',
    loan_amount: '',
  });
  const [secondCallModalOpen, setSecondCallModalOpen] = useState(false);
  const [secondCallForm, setSecondCallForm] = useState<FinanceSecondCallConfirmationForm>({
    customer_full_name: '',
    nic_number: '',
    registered_mobile_number: '',
    date_of_birth: '-',
    address: '-',
    loan_amount: '',
    loan_purpose: '-',
    loan_term: '-',
    installment: '',
    payment_frequency: '-',
    interest_rate: '-',
    first_payment_date: '-',
    number_of_installments: '-',
    confirm_customer_full_name: false,
    confirm_nic_number: false,
    confirm_registered_mobile_number: false,
    confirm_date_of_birth: false,
    confirm_address: false,
    confirm_loan_amount: false,
    confirm_loan_purpose: false,
    confirm_loan_term: false,
    confirm_installment: false,
    confirm_payment_frequency: false,
    confirm_interest_rate: false,
    confirm_first_payment_date: false,
    confirm_number_of_installments: false,
  });
  const [loanSignatureModalOpen, setLoanSignatureModalOpen] = useState(false);
  const [loanSignatureForm, setLoanSignatureForm] = useState<FinanceLoanSignatureCheckForm>({
    confirm_customer_photo: false,
    confirm_customer_signature: false,
    customer_photo_url: '',
    customer_signature_url: '',
  });
  const [documentFilingModalOpen, setDocumentFilingModalOpen] = useState(false);
  const [documentFilingForm, setDocumentFilingForm] = useState<FinanceDocumentFilingForm>({
    documents: [],
  });
  const [sendBackModal, setSendBackModal] = useState<{ open: boolean; targetStep: string; note: string }>({
    open: false,
    targetStep: '',
    note: '',
  });
  const [stepTwoForm, setStepTwoForm] = useState<FinanceCallConfirmationForm>({
    no_of_times_called: '1',
    called_date: toInputDate(new Date()) || '',
    answered_by_customer: true,
    answered_by_spouse: false,
    customer_contact_no: '',
    spouse_contact_no: '',
    customer_full_name: '',
    nic_or_dob: '',
    loan_amount: '',
    given_date: toInputDate(new Date()) || '',
    business_type: '',
    repayment_card_given: 'no',
    business_details: '',
    special_notes: '',
    disbursement_otp: '',
  });

  const pendingCount = rows.length;

  const totalPendingAmount = useMemo(
    () => rows.reduce((sum, row) => sum + (Number.isFinite(toNumber(row.financed_amount)) ? toNumber(row.financed_amount) : 0), 0),
    [rows],
  );

  const averageTenure = useMemo(() => {
    if (rows.length === 0) return 0;
    const valid = rows.map((r) => toNumber(r.tenure_months)).filter((n) => Number.isFinite(n));
    if (valid.length === 0) return 0;
    return valid.reduce((sum, n) => sum + n, 0) / valid.length;
  }, [rows]);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);

    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      try {
        setAuthUser(JSON.parse(rawUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const refreshUser = async () => {
      try {
        const response = await axios.get('/api/user', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        const user = (response.data || null) as AuthUser | null;
        if (user) {
          setAuthUser(user);
          localStorage.setItem('auth_user', JSON.stringify(user));
        }
      } catch {
        // Keep previously cached auth user when refresh fails.
      }
    };

    void refreshUser();
  }, [token]);

  const fetchRows = async (authToken: string) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/finances', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 1000, status: 'pending_approval' },
      });

      const data = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      setRows(data as FinanceApprovalRow[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchRows(token);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const fetchBranchOptions = async () => {
      try {
        const response = await axios.get('/api/companies', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const rows = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        const options = rows
          .map((row: Record<string, unknown>) => {
            const id = Number(row.id);
            const name = String(row.name || row.company_name || row.branch_name || '').trim();
            if (!Number.isFinite(id) || id <= 0 || name === '') {
              return null;
            }
            return { id, name };
          })
          .filter((row: BranchOption | null): row is BranchOption => Boolean(row));

        setBranchOptions(options);
      } catch {
        setBranchOptions([]);
      }
    };

    void fetchBranchOptions();
  }, [token]);

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      const widgets = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.widgets)
          ? response.data.widgets
          : [];
      const hidden = widgets
        .filter(
          (item: { widget_key?: unknown; is_visible?: unknown }) =>
            typeof item.widget_key === 'string' &&
            item.widget_key.startsWith(widgetPrefix) &&
            (item.is_visible === false || Number(item.is_visible) === 0)
        )
        .map((item: { widget_key: string }) => item.widget_key);
      setHiddenWidgetKeys(hidden);
    } catch {
      setWidgetNotice('Failed to load widget preferences.');
    }
  }, []);

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean) => {
      if (!token) return;
      try {
        await axios.post(
          `${getApiBaseUrl()}/dashboard/widgets`,
          { widget_key: widgetKey, is_visible: isVisible ? 1 : 0 },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );
        setWidgetNotice('');
      } catch {
        setWidgetNotice('Failed to save widget preference.');
      }
    },
    [token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string) => {
      setHiddenWidgetKeys((prev) => (prev.includes(widgetKey) ? prev : [...prev, widgetKey]));
      await saveWidgetPreference(widgetKey, false);
    },
    [saveWidgetPreference]
  );

  useEffect(() => {
    if (!token) return;
    void fetchWidgetPreferences(token);
  }, [token, fetchWidgetPreferences]);

  useEffect(() => {
    setActiveReviewSection('basic');
  }, [selectedFinance?.id]);

  const buildDefaultDeductionRules = (finance: FinanceApprovalRow, defaultProfit: string): DeductionInstallmentRule[] => {
    const profitText = Number.isFinite(toNumber(defaultProfit)) ? toNumber(defaultProfit).toFixed(2) : '18.00';
    const planInstallments = Array.isArray(finance.repayment_plan?.installments)
      ? finance.repayment_plan?.installments
      : [];

    if (planInstallments && planInstallments.length > 0) {
      return planInstallments.map((row, index) => ({
        installment_no: Number.isFinite(toNumber(row.installment_no)) ? Math.max(1, Math.floor(toNumber(row.installment_no))) : index + 1,
        installment_amount: Number.isFinite(toNumber(row.amount)) ? toNumber(row.amount).toFixed(2) : (Number.isFinite(toNumber(finance.installment_amount)) ? toNumber(finance.installment_amount).toFixed(2) : '0.00'),
        profit_percentage: profitText,
      }));
    }

    const tenure = Number.isFinite(toNumber(finance.tenure_months)) ? Math.max(1, Math.floor(toNumber(finance.tenure_months))) : 1;
    const installmentAmountText = Number.isFinite(toNumber(finance.installment_amount)) ? toNumber(finance.installment_amount).toFixed(2) : '0.00';

    return Array.from({ length: tenure }, (_, i) => ({
      installment_no: i + 1,
      installment_amount: installmentAmountText,
      profit_percentage: profitText,
    }));
  };

  useEffect(() => {
    if (!selectedFinance) return;

    const existing = selectedFinance.repayment_plan?.deduction_order;
    const defaultProfit = Number.isFinite(toNumber(selectedFinance.interest_rate))
      ? toNumber(selectedFinance.interest_rate).toFixed(2)
      : '18';

    setDeductionMode((existing?.mode as 'flat' | 'front_loaded' | 'installment_wise') || 'flat');
    setDeductionProfitPercentage(Number.isFinite(toNumber(existing?.profit_percentage)) ? toNumber(existing?.profit_percentage).toFixed(2) : defaultProfit);
    setDeductionInitialInstallments(Number.isFinite(toNumber(existing?.initial_installments)) ? String(Math.floor(toNumber(existing?.initial_installments))) : '12');
    setDeductionInitialProfitPercentage(Number.isFinite(toNumber(existing?.initial_profit_percentage)) ? toNumber(existing?.initial_profit_percentage).toFixed(2) : '25');
    setDeductionRemainingProfitPercentage(Number.isFinite(toNumber(existing?.remaining_profit_percentage)) ? toNumber(existing?.remaining_profit_percentage).toFixed(2) : defaultProfit);

    const existingRules = Array.isArray(existing?.installment_rules)
      ? existing?.installment_rules
      : [];

    if (existingRules && existingRules.length > 0) {
      setDeductionInstallmentRules(existingRules.map((rule, idx) => ({
        installment_no: Number.isFinite(toNumber(rule.installment_no)) ? Math.max(1, Math.floor(toNumber(rule.installment_no))) : idx + 1,
        installment_amount: Number.isFinite(toNumber(rule.installment_amount)) ? toNumber(rule.installment_amount).toFixed(2) : (Number.isFinite(toNumber(selectedFinance.installment_amount)) ? toNumber(selectedFinance.installment_amount).toFixed(2) : '0.00'),
        profit_percentage: Number.isFinite(toNumber(rule.profit_percentage)) ? toNumber(rule.profit_percentage).toFixed(2) : defaultProfit,
      })));
    } else {
      setDeductionInstallmentRules(buildDefaultDeductionRules(selectedFinance, defaultProfit));
    }

    setDeductionError('');
  }, [selectedFinance]);

  const buildDeductionOrderPayload = () => {
    const profit = toNumber(deductionProfitPercentage);
    if (!Number.isFinite(profit) || profit < 0 || profit > 100) {
      setDeductionError('Profit percentage must be between 0 and 100.');
      openAlertModal('Profit percentage must be between 0 and 100.', 'Validation');
      return null;
    }

    const payload: Record<string, number | string> = {
      mode: deductionMode,
      profit_percentage: Number(profit.toFixed(2)),
      capital_percentage: Number((100 - profit).toFixed(2)),
    };

    if (deductionMode === 'front_loaded') {
      const initialInstallments = toNumber(deductionInitialInstallments);
      const initialProfit = toNumber(deductionInitialProfitPercentage);
      const remainingProfit = toNumber(deductionRemainingProfitPercentage);

      if (!Number.isFinite(initialInstallments) || initialInstallments < 1) {
        setDeductionError('Initial installment count must be at least 1.');
        openAlertModal('Initial installment count must be at least 1.', 'Validation');
        return null;
      }
      if (!Number.isFinite(initialProfit) || initialProfit < 0 || initialProfit > 100) {
        setDeductionError('Initial profit percentage must be between 0 and 100.');
        openAlertModal('Initial profit percentage must be between 0 and 100.', 'Validation');
        return null;
      }
      if (!Number.isFinite(remainingProfit) || remainingProfit < 0 || remainingProfit > 100) {
        setDeductionError('Remaining profit percentage must be between 0 and 100.');
        openAlertModal('Remaining profit percentage must be between 0 and 100.', 'Validation');
        return null;
      }

      payload.initial_installments = Math.floor(initialInstallments);
      payload.initial_profit_percentage = Number(initialProfit.toFixed(2));
      payload.remaining_profit_percentage = Number(remainingProfit.toFixed(2));
    } else if (deductionMode === 'installment_wise') {
      if (deductionInstallmentRules.length === 0) {
        setDeductionError('Installment-wise rules are empty.');
        openAlertModal('Installment-wise rules are empty.', 'Validation');
        return null;
      }

      const rules = deductionInstallmentRules.map((rule) => ({
        installment_no: Math.max(1, Math.floor(toNumber(rule.installment_no))),
        installment_amount: Number.isFinite(toNumber(rule.installment_amount)) ? Number(toNumber(rule.installment_amount).toFixed(2)) : NaN,
        profit_percentage: Number.isFinite(toNumber(rule.profit_percentage)) ? Number(toNumber(rule.profit_percentage).toFixed(2)) : NaN,
      }));

      const invalid = rules.find((rule) => !Number.isFinite(rule.installment_no) || !Number.isFinite(rule.profit_percentage) || rule.profit_percentage < 0 || rule.profit_percentage > 100);
      if (invalid) {
        setDeductionError('Each installment row needs a valid profit % (0-100).');
        openAlertModal('Each installment row needs a valid profit % (0-100).', 'Validation');
        return null;
      }

      const payloadWithRules = payload as Record<string, unknown>;
      payloadWithRules.installment_rules = rules;
      setDeductionError('');
      return payloadWithRules;
    }

    setDeductionError('');
    return payload;
  };

  const currentWorkflowStep = useMemo(() => {
    const rawStep = Number(selectedFinance?.repayment_plan?.approval_workflow?.current_step || 1);
    if (!Number.isFinite(rawStep)) return 1;
    return Math.max(1, Math.min(FINANCE_WORKFLOW_STEPS.length, Math.floor(rawStep)));
  }, [selectedFinance]);

  const userRoleNames = useMemo(() => {
    if (!Array.isArray(authUser?.roles)) return [] as string[];
    return authUser.roles.map((role) => String(role?.name || '').toLowerCase()).filter((value) => value.trim() !== '');
  }, [authUser]);

  const userDesignationNames = useMemo(() => {
    const values = [
      String(authUser?.designation?.name || '').toLowerCase(),
      String(authUser?.employee?.designation?.name || '').toLowerCase(),
    ].filter((value) => value.trim() !== '');

    return values;
  }, [authUser]);

  const userHasKeyword = useCallback((keyword: string) => {
    const needle = keyword.toLowerCase();
    return userRoleNames.some((value) => value.includes(needle)) || userDesignationNames.some((value) => value.includes(needle));
  }, [userRoleNames, userDesignationNames]);

  const currentWorkflowLabel = FINANCE_WORKFLOW_STEPS[currentWorkflowStep - 1] || FINANCE_WORKFLOW_STEPS[0];
  const isFinalWorkflowStep = currentWorkflowStep >= FINANCE_WORKFLOW_STEPS.length;
  const advanceActionText = isFinalWorkflowStep ? 'Final Step Reached' : getFinanceStepActionText(currentWorkflowStep);
  const isPrivilegedApprover = useMemo(() => {
    return userHasKeyword('super admin')
      || userHasKeyword('admin')
      || userHasKeyword('managing director')
      || userHasKeyword('business owner')
      || userHasKeyword('md');
  }, [userHasKeyword]);
  const isSuperAdmin = useMemo(() => userHasKeyword('super admin'), [userHasKeyword]);

  const canHandleCurrentStep = useMemo(() => {
    if (isPrivilegedApprover) return true;

    if (currentWorkflowStep === 1) {
      return userHasKeyword('cro') || userHasKeyword('loan approver') || userHasKeyword('finance manager');
    }
    if (currentWorkflowStep === 2) {
      return userHasKeyword('cro') || userHasKeyword('loan approver') || userHasKeyword('finance manager');
    }
    if (currentWorkflowStep === 3) {
      return userHasKeyword('branch manager');
    }
    if (currentWorkflowStep === 4) {
      return userHasKeyword('head office') || userHasKeyword('finance manager');
    }
    if (currentWorkflowStep === 5 || currentWorkflowStep === 6 || currentWorkflowStep === 7) {
      return userHasKeyword('cash') || userHasKeyword('finance manager') || userHasKeyword('accountant');
    }
    if (currentWorkflowStep === 8 || currentWorkflowStep === 9 || currentWorkflowStep === 10) {
      return userHasKeyword('loan approver') || userHasKeyword('finance manager') || userHasKeyword('document');
    }
    if (currentWorkflowStep === 11 || currentWorkflowStep === 12 || currentWorkflowStep === 13) {
      return userHasKeyword('insurance') || userHasKeyword('finance manager');
    }

    return false;
  }, [currentWorkflowStep, isPrivilegedApprover, userHasKeyword]);

  const bmAlreadySubmitted = useMemo(() => {
    const comments = String(selectedFinance?.repayment_plan?.bm_approval_payload?.bm_comments || '').trim();
    return comments !== '';
  }, [selectedFinance]);

  const isBmLockedForCurrentUser = currentWorkflowStep === 3 && bmAlreadySubmitted && !isPrivilegedApprover;
  const canAdvanceCurrentStep = canHandleCurrentStep && !isFinalWorkflowStep && !isBmLockedForCurrentUser;
  const canSendBackCurrentStep = canHandleCurrentStep && currentWorkflowStep > 1;
  const canRejectCurrentStep = canHandleCurrentStep;
  const canFinalApprove = isFinalWorkflowStep && isPrivilegedApprover;

  const openAlertModal = (message: string, title = 'Notice') => {
    setAlertModal({
      open: true,
      title,
      message,
    });
  };

  const closeAlertModal = () => {
    setAlertModal({ open: false, title: '', message: '' });
  };

  const openConfirmModal = (action: '' | 'remove_loan', financeId: number | null, message: string, title = 'Confirmation') => {
    setConfirmModal({
      open: true,
      title,
      message,
      action,
      financeId,
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ open: false, title: '', message: '', action: '', financeId: null });
  };

  const deductionPreviewRows = useMemo(() => {
    if (!selectedFinance) return [] as Array<{ installmentAmount: number; profitPct: number; capitalPct: number; profitAmount: number; capitalAmount: number }>;

    const planInstallments = Array.isArray(selectedFinance.repayment_plan?.installments)
      ? selectedFinance.repayment_plan.installments
      : [];

    const fallbackInstallmentAmount = Number.isFinite(toNumber(selectedFinance.installment_amount))
      ? toNumber(selectedFinance.installment_amount)
      : 0;

    const fallbackCount = Number.isFinite(toNumber(selectedFinance.tenure_months))
      ? Math.max(1, Math.floor(toNumber(selectedFinance.tenure_months)))
      : 1;

    if (deductionMode === 'installment_wise') {
      return deductionInstallmentRules
        .map((rule) => {
          const installmentAmount = Number.isFinite(toNumber(rule.installment_amount)) ? toNumber(rule.installment_amount) : fallbackInstallmentAmount;
          const profitPct = Number.isFinite(toNumber(rule.profit_percentage)) ? toNumber(rule.profit_percentage) : 0;
          const capitalPct = Math.max(0, 100 - profitPct);
          return {
            installmentAmount,
            profitPct,
            capitalPct,
            profitAmount: installmentAmount * (profitPct / 100),
            capitalAmount: installmentAmount * (capitalPct / 100),
          };
        })
        .filter((r) => Number.isFinite(r.installmentAmount) && r.installmentAmount >= 0);
    }

    const scheduleAmounts = planInstallments.length > 0
      ? planInstallments.map((row) => (Number.isFinite(toNumber(row.amount)) ? toNumber(row.amount) : fallbackInstallmentAmount))
      : Array.from({ length: fallbackCount }, () => fallbackInstallmentAmount);

    const baseProfit = Number.isFinite(toNumber(deductionProfitPercentage)) ? toNumber(deductionProfitPercentage) : 0;
    const initialCount = Number.isFinite(toNumber(deductionInitialInstallments)) ? Math.max(0, Math.floor(toNumber(deductionInitialInstallments))) : 0;
    const initialProfit = Number.isFinite(toNumber(deductionInitialProfitPercentage)) ? toNumber(deductionInitialProfitPercentage) : baseProfit;
    const remainingProfit = Number.isFinite(toNumber(deductionRemainingProfitPercentage)) ? toNumber(deductionRemainingProfitPercentage) : baseProfit;

    return scheduleAmounts.map((installmentAmount, idx) => {
      const profitPct = deductionMode === 'front_loaded'
        ? (idx < initialCount ? initialProfit : remainingProfit)
        : baseProfit;
      const capitalPct = Math.max(0, 100 - profitPct);
      return {
        installmentAmount,
        profitPct,
        capitalPct,
        profitAmount: installmentAmount * (profitPct / 100),
        capitalAmount: installmentAmount * (capitalPct / 100),
      };
    });
  }, [selectedFinance, deductionMode, deductionProfitPercentage, deductionInitialInstallments, deductionInitialProfitPercentage, deductionRemainingProfitPercentage, deductionInstallmentRules]);

  const deductionTotals = useMemo(() => {
    const totalInstallments = deductionPreviewRows.reduce((sum, row) => sum + row.installmentAmount, 0);
    const totalInterest = deductionPreviewRows.reduce((sum, row) => sum + row.profitAmount, 0);
    const totalCapital = deductionPreviewRows.reduce((sum, row) => sum + row.capitalAmount, 0);
    const financed = selectedFinance && Number.isFinite(toNumber(selectedFinance.financed_amount)) ? toNumber(selectedFinance.financed_amount) : 0;
    const previewBalance = financed - totalCapital;

    return {
      totalInstallments,
      totalInterest,
      totalCapital,
      financed,
      previewBalance,
    };
  }, [deductionPreviewRows, selectedFinance]);

  const autoBalanceSuggestion = useMemo(() => {
    const financed = deductionTotals.financed;
    const totalInstallments = deductionTotals.totalInstallments;

    if (!Number.isFinite(financed) || financed <= 0 || !Number.isFinite(totalInstallments) || totalInstallments <= 0) {
      return {
        canApply: false,
        suggestedCapitalPct: 0,
        suggestedProfitPct: 0,
      };
    }

    const capitalPctRaw = (financed / totalInstallments) * 100;
    const suggestedCapitalPct = Math.min(100, Math.max(0, capitalPctRaw));
    const suggestedProfitPct = Math.max(0, 100 - suggestedCapitalPct);

    return {
      canApply: true,
      suggestedCapitalPct: Number(suggestedCapitalPct.toFixed(2)),
      suggestedProfitPct: Number(suggestedProfitPct.toFixed(2)),
    };
  }, [deductionTotals]);

  const applyAutoBalanceHelper = () => {
    if (!autoBalanceSuggestion.canApply) {
      setDeductionError('Cannot auto-balance without financed amount and installment total.');
      openAlertModal('Cannot auto-balance without financed amount and installment total.', 'Validation');
      return;
    }

    const suggestedProfit = autoBalanceSuggestion.suggestedProfitPct.toFixed(2);
    setDeductionProfitPercentage(suggestedProfit);

    if (deductionMode === 'front_loaded') {
      setDeductionInitialProfitPercentage(suggestedProfit);
      setDeductionRemainingProfitPercentage(suggestedProfit);
    } else if (deductionMode === 'installment_wise') {
      setDeductionInstallmentRules((prev) => prev.map((row) => ({ ...row, profit_percentage: suggestedProfit })));
    }

    setDeductionError('');
  };

  const updateStatus = async (
    id: number,
    action: 'approve' | 'reject' | 'send_back',
    options?: { target_step?: number; note?: string }
  ) => {
    if (!token) return false;
    try {
      setProcessingId(id);
      const payload: Record<string, unknown> = { action };

      if (action === 'approve') {
        const sourceFinance = selectedFinance?.id === id
          ? selectedFinance
          : rows.find((row) => row.id === id) || null;
        const deductionOrder = sourceFinance?.repayment_plan?.deduction_order;

        if (!deductionOrder || typeof deductionOrder !== 'object') {
          setDeductionError('No deduction order found in loan request. Please update the request before final approval.');
          openAlertModal('No deduction order found in loan request. Please update the request before final approval.', 'Validation');
          setProcessingId(null);
          return false;
        }
        payload.deduction_order = deductionOrder;
      }

      if (action === 'send_back') {
        if (typeof options?.target_step === 'number') {
          payload.target_step = options.target_step;
        }
        if (typeof options?.note === 'string') {
          payload.note = options.note;
        }
      }

      const response = await axios.post(
        `/api/finances/${id}/status`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );

      if (action === 'send_back') {
        const nextWorkflow = response.data?.workflow;
        if (nextWorkflow && typeof nextWorkflow === 'object') {
          setRows((prev) => prev.map((r) => (
            r.id === id
              ? {
                  ...r,
                  repayment_plan: {
                    ...(r.repayment_plan || {}),
                    approval_workflow: nextWorkflow as Record<string, unknown>,
                  },
                }
              : r
          )));

          if (selectedFinance?.id === id) {
            setSelectedFinance((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                repayment_plan: {
                  ...(prev.repayment_plan || {}),
                  approval_workflow: nextWorkflow as Record<string, unknown>,
                },
              };
            });
          }
        }
        setDeductionError('');
        openAlertModal(String(response.data?.message || 'Finance workflow sent back successfully.'), 'Send Back Complete');
        return true;
      }

      setRows((prev) => prev.filter((r) => r.id !== id));
      if (selectedFinance?.id === id) {
        setDetailOpen(false);
        setSelectedFinance(null);
      }

      if (action === 'approve') {
        openAlertModal(String(response.data?.message || 'Finance approved successfully.'), 'Final Approval Complete');
      } else if (action === 'reject') {
        openAlertModal(String(response.data?.message || 'Finance rejected successfully.'), 'Rejected');
      }
      return true;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = String(error.response?.data?.message || 'Failed to update status.');
        setDeductionError(message);
        openAlertModal(message, 'Action Failed');
      } else {
        setDeductionError('Failed to update status.');
        openAlertModal('Failed to update status.', 'Action Failed');
      }
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const removeLoan = async (id: number) => {
    if (!token) return false;

    try {
      setProcessingId(id);
      await axios.delete(`/api/finances/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      setRows((prev) => prev.filter((row) => row.id !== id));
      if (selectedFinance?.id === id) {
        setDetailOpen(false);
        setSelectedFinance(null);
      }

      openAlertModal('Loan removed successfully.', 'Removed');
      return true;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = String(error.response?.data?.message || 'Failed to remove loan.');
        setDeductionError(message);
        openAlertModal(message, 'Remove Failed');
      } else {
        setDeductionError('Failed to remove loan.');
        openAlertModal('Failed to remove loan.', 'Remove Failed');
      }
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const submitConfirmModal = async () => {
    if (!confirmModal.open) return;

    const action = confirmModal.action;
    const financeId = confirmModal.financeId;
    closeConfirmModal();

    if (action === 'remove_loan' && financeId) {
      await removeLoan(financeId);
    }
  };

  const closeSendBackModal = () => {
    setSendBackModal({ open: false, targetStep: '', note: '' });
  };

  const openSendBackModal = () => {
    if (!selectedFinance) return;
    const options = getFinanceBackStepOptions(currentWorkflowStep);
    setSendBackModal({
      open: true,
      targetStep: options.length > 0 ? String(options[0]) : '',
      note: '',
    });
    setDeductionError('');
  };

  const submitSendBack = async () => {
    if (!selectedFinance) return;

    const note = String(sendBackModal.note || '').trim();
    if (!note) {
      setDeductionError('Please add a note before sending back this finance request.');
      openAlertModal('Please add a note before sending back this finance request.', 'Validation');
      return;
    }

    if (currentWorkflowStep <= 1) {
      setDeductionError('Step 1 records cannot be sent back further.');
      openAlertModal('Step 1 records cannot be sent back further.', 'Validation');
      return;
    }

    const targetStep = Number(sendBackModal.targetStep || 0);
    if (!Number.isFinite(targetStep) || targetStep < 1 || targetStep >= currentWorkflowStep) {
      setDeductionError(`Please select a valid previous step between 1 and ${currentWorkflowStep - 1}.`);
      openAlertModal(`Please select a valid previous step between 1 and ${currentWorkflowStep - 1}.`, 'Validation');
      return;
    }

    const success = await updateStatus(selectedFinance.id, 'send_back', {
      target_step: targetStep,
      note,
    });

    if (success) {
      closeSendBackModal();
    }
  };

  const advanceWorkflowStep = async (options?: {
    bm_approval_payload?: FinanceBmApprovalForm;
    ho_approval_payload?: FinanceHoApprovalForm;
    cash_allocation_payload?: FinanceCashAllocationForm;
    cash_request_payload?: FinanceCashRequestForm;
    cash_withdrawal_payload?: FinanceCashWithdrawalForm;
    second_call_confirmation_payload?: FinanceSecondCallConfirmationForm;
    loan_signature_check_payload?: FinanceLoanSignatureCheckForm;
    document_filing_payload?: FinanceDocumentFilingForm;
  }) => {
    if (!token || !selectedFinance) return;

    try {
      setProcessingId(selectedFinance.id);
      setDeductionError('');

      const response = await axios.post(
        `/api/finances/${selectedFinance.id}/status`,
        {
          action: 'advance',
          call_confirmation_payload: currentWorkflowStep === 2 ? stepTwoForm : undefined,
          bm_approval_payload: currentWorkflowStep === 3 ? options?.bm_approval_payload : undefined,
          ho_approval_payload: currentWorkflowStep === 4 ? options?.ho_approval_payload : undefined,
          cash_allocation_payload: currentWorkflowStep === 5 ? options?.cash_allocation_payload : undefined,
          cash_request_payload: currentWorkflowStep === 6 ? options?.cash_request_payload : undefined,
          cash_withdrawal_payload: currentWorkflowStep === 7 ? options?.cash_withdrawal_payload : undefined,
          second_call_confirmation_payload: currentWorkflowStep === 8 ? options?.second_call_confirmation_payload : undefined,
          loan_signature_check_payload: currentWorkflowStep === 9 ? options?.loan_signature_check_payload : undefined,
          document_filing_payload: currentWorkflowStep === 10 ? options?.document_filing_payload : undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );

      const nextWorkflow = response.data?.workflow;

      if (nextWorkflow && typeof nextWorkflow === 'object') {
        setSelectedFinance((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            repayment_plan: {
              ...(prev.repayment_plan || {}),
              approval_workflow: nextWorkflow,
              ...(currentWorkflowStep === 2 ? { call_confirmation_payload: stepTwoForm as unknown as Record<string, unknown> } : {}),
              ...(currentWorkflowStep === 3 && options?.bm_approval_payload
                ? { bm_approval_payload: options.bm_approval_payload as unknown as Record<string, unknown> }
                : {}),
              ...(currentWorkflowStep === 4 && options?.ho_approval_payload
                ? { ho_approval_payload: options.ho_approval_payload as unknown as Record<string, unknown> }
                : {}),
              ...(currentWorkflowStep === 5 && options?.cash_allocation_payload
                ? { cash_allocation_payload: options.cash_allocation_payload as unknown as Record<string, unknown> }
                : {}),
              ...(currentWorkflowStep === 6 && options?.cash_request_payload
                ? { cash_request_payload: options.cash_request_payload as unknown as Record<string, unknown> }
                : {}),
              ...(currentWorkflowStep === 7 && options?.cash_withdrawal_payload
                ? { cash_withdrawal_payload: options.cash_withdrawal_payload as unknown as Record<string, unknown> }
                : {}),
              ...(currentWorkflowStep === 8 && options?.second_call_confirmation_payload
                ? { second_call_confirmation_payload: options.second_call_confirmation_payload as unknown as Record<string, unknown> }
                : {}),
              ...(currentWorkflowStep === 9 && options?.loan_signature_check_payload
                ? { loan_signature_check_payload: options.loan_signature_check_payload as unknown as Record<string, unknown> }
                : {}),
              ...(currentWorkflowStep === 10 && options?.document_filing_payload
                ? { document_filing_payload: options.document_filing_payload as unknown as Record<string, unknown> }
                : {}),
            },
          };
        });
      }

      if (currentWorkflowStep === 2) {
        setStepTwoModalOpen(false);
      }
      if (currentWorkflowStep === 3) {
        setBmApprovalModalOpen(false);
      }
      if (currentWorkflowStep === 4) {
        setHoApprovalModalOpen(false);
      }
      if (currentWorkflowStep === 5) {
        setCashAllocationModalOpen(false);
      }
      if (currentWorkflowStep === 6) {
        setCashRequestModalOpen(false);
      }
      if (currentWorkflowStep === 7) {
        setCashWithdrawalModalOpen(false);
      }
      if (currentWorkflowStep === 8) {
        setSecondCallModalOpen(false);
      }
      if (currentWorkflowStep === 9) {
        setLoanSignatureModalOpen(false);
      }
      if (currentWorkflowStep === 10) {
        setDocumentFilingModalOpen(false);
      }
      openAlertModal(String(response.data?.message || 'Finance workflow moved to the next step.'), 'Step Completed');
      return true;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message = String(error.response?.data?.message || 'Failed to move workflow step.');
        setDeductionError(message);
        openAlertModal(message, 'Step Action Failed');
      } else {
        setDeductionError('Failed to move workflow step.');
        openAlertModal('Failed to move workflow step.', 'Step Action Failed');
      }
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const openStepTwoCallModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.call_confirmation_payload || {}) as Record<string, unknown>;
    const customerName = `${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim();

    setStepTwoForm({
      no_of_times_called: String(payload.no_of_times_called ?? 1),
      called_date: toInputDate(payload.called_date) || toInputDate(new Date()),
      answered_by_customer: Boolean(payload.answered_by_customer ?? true),
      answered_by_spouse: Boolean(payload.answered_by_spouse ?? false),
      customer_contact_no: String(payload.customer_contact_no ?? selectedFinance.customer?.phone ?? ''),
      spouse_contact_no: String(payload.spouse_contact_no ?? ''),
      customer_full_name: String(payload.customer_full_name ?? customerName),
      nic_or_dob: String(payload.nic_or_dob ?? selectedFinance.customer?.nic_passport ?? selectedFinance.customer?.nic ?? ''),
      loan_amount: String(payload.loan_amount ?? selectedFinance.financed_amount ?? ''),
      given_date: toInputDate(payload.given_date) || toInputDate(selectedFinance.start_date) || toInputDate(new Date()),
      business_type: String(payload.business_type ?? ''),
      repayment_card_given: String(payload.repayment_card_given ?? 'no').toLowerCase() === 'yes' ? 'yes' : 'no',
      business_details: String(payload.business_details ?? ''),
      special_notes: String(payload.special_notes ?? ''),
      disbursement_otp: String(payload.disbursement_otp ?? ''),
    });
    setStepTwoModalOpen(true);
    setDeductionError('');
  };

  const openBmApprovalModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.bm_approval_payload || {}) as Record<string, unknown>;
    setBmApprovalForm({
      bm_comments: String(payload.bm_comments || '').trim(),
      bm_additional_notes: String(payload.bm_additional_notes || '').trim(),
    });
    setBmApprovalModalOpen(true);
    setDeductionError('');
  };

  const openHoApprovalModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.ho_approval_payload || {}) as Record<string, unknown>;
    setHoApprovalForm({
      confirm_customer_photo: Boolean(payload.confirm_customer_photo ?? false),
      confirm_customer_signature: Boolean(payload.confirm_customer_signature ?? false),
      ho_additional_notes: String(payload.ho_additional_notes || '').trim(),
    });
    setHoApprovalModalOpen(true);
    setDeductionError('');
  };

  const submitBmApprovalAndMoveNext = async () => {
    if (isBmLockedForCurrentUser) {
      setDeductionError('BM approval is already submitted. Branch Manager cannot edit or modify it again.');
      openAlertModal('BM approval is already submitted. Branch Manager cannot edit or modify it again.', 'Permission');
      return;
    }

    const comments = String(bmApprovalForm.bm_comments || '').trim();
    if (!comments) {
      setDeductionError('Please add BM comments before approval.');
      openAlertModal('Please add BM comments before approval.', 'BM Approval');
      return;
    }

    await advanceWorkflowStep({
      bm_approval_payload: {
        bm_comments: comments,
        bm_additional_notes: String(bmApprovalForm.bm_additional_notes || '').trim(),
      },
    });
  };

  const submitHoApprovalAndMoveNext = async () => {
    if (!hoApprovalForm.confirm_customer_photo || !hoApprovalForm.confirm_customer_signature) {
      setDeductionError('Please confirm both customer photo and customer signature before moving to Cash Allocation.');
      openAlertModal('Please confirm both customer photo and customer signature before moving to Cash Allocation.', 'Head Office Approval');
      return;
    }

    await advanceWorkflowStep({
      ho_approval_payload: {
        confirm_customer_photo: hoApprovalForm.confirm_customer_photo,
        confirm_customer_signature: hoApprovalForm.confirm_customer_signature,
        ho_additional_notes: String(hoApprovalForm.ho_additional_notes || '').trim(),
      },
    });
  };

  const openCashAllocationModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.cash_allocation_payload || {}) as Record<string, unknown>;
    const payloadBranchId = Number(payload.branch_id ?? 0);
    const financeBranchId = Number(selectedFinance.branch_id ?? 0);
    const selectedBranchId = payloadBranchId > 0
      ? payloadBranchId
      : financeBranchId > 0
        ? financeBranchId
        : 0;
    const selectedBranchName = selectedBranchId > 0
      ? (branchOptions.find((row) => row.id === selectedBranchId)?.name || '')
      : '';
    const financedAmount = Number.isFinite(toNumber(selectedFinance.financed_amount))
      ? toNumber(selectedFinance.financed_amount).toFixed(2)
      : '0';

    setCashAllocationForm({
      branch_id: selectedBranchId > 0 ? String(selectedBranchId) : '',
      branch_name: String(payload.branch_name || selectedBranchName || '').trim(),
      today_cash_requirement: String(payload.today_cash_requirement ?? financedAmount),
      today_allocation_amount: String(payload.today_allocation_amount ?? financedAmount),
      tomorrow_allocation_amount: String(payload.tomorrow_allocation_amount ?? '0'),
    });
    setCashAllocationModalOpen(true);
    setDeductionError('');
  };

  const submitCashAllocationAndMoveNext = async () => {
    const branchId = Number(cashAllocationForm.branch_id || 0);
    const branchName = String(
      branchOptions.find((row) => row.id === branchId)?.name
      || cashAllocationForm.branch_name
      || ''
    ).trim();
    const todayRequirement = toNumber(cashAllocationForm.today_cash_requirement);
    const todayAllocation = toNumber(cashAllocationForm.today_allocation_amount);
    const tomorrowAllocation = toNumber(cashAllocationForm.tomorrow_allocation_amount);

    if (!Number.isFinite(branchId) || branchId <= 0) {
      setDeductionError('Please select a branch.');
      openAlertModal('Please select a branch.', 'Cash Allocation');
      return;
    }

    if (!branchName) {
      setDeductionError('Selected branch is invalid.');
      openAlertModal('Selected branch is invalid.', 'Cash Allocation');
      return;
    }

    if (!Number.isFinite(todayRequirement) || todayRequirement < 0) {
      setDeductionError('Today cash requirement must be a valid amount.');
      openAlertModal('Today cash requirement must be a valid amount.', 'Cash Allocation');
      return;
    }

    if (!Number.isFinite(todayAllocation) || todayAllocation < 0) {
      setDeductionError('Today allocation amount must be a valid amount.');
      openAlertModal('Today allocation amount must be a valid amount.', 'Cash Allocation');
      return;
    }

    if (!Number.isFinite(tomorrowAllocation) || tomorrowAllocation < 0) {
      setDeductionError('Tomorrow allocation amount must be a valid amount.');
      openAlertModal('Tomorrow allocation amount must be a valid amount.', 'Cash Allocation');
      return;
    }

    await advanceWorkflowStep({
      cash_allocation_payload: {
        branch_id: String(branchId),
        branch_name: branchName,
        today_cash_requirement: String(Number(todayRequirement.toFixed(2))),
        today_allocation_amount: String(Number(todayAllocation.toFixed(2))),
        tomorrow_allocation_amount: String(Number(tomorrowAllocation.toFixed(2))),
      },
    });
  };

  const openCashRequestModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.cash_request_payload || {}) as Record<string, unknown>;
    const customerName = `${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || 'Customer';
    const customerNumber = String(selectedFinance.customer?.customer_code || `FIN-${String(selectedFinance.id).padStart(6, '0')}`);
    const loanAmount = Number.isFinite(toNumber(selectedFinance.financed_amount))
      ? Number(toNumber(selectedFinance.financed_amount)).toFixed(2)
      : '0.00';

    setCashRequestForm({
      customer_name: String(payload.customer_name || customerName).trim(),
      customer_number: String(payload.customer_number || customerNumber).trim(),
      loan_amount: String(payload.loan_amount ?? loanAmount),
    });
    setCashRequestModalOpen(true);
    setDeductionError('');
  };

  const submitCashRequestAndMoveNext = async () => {
    const customerName = String(cashRequestForm.customer_name || '').trim();
    const customerNumber = String(cashRequestForm.customer_number || '').trim();
    const loanAmount = toNumber(cashRequestForm.loan_amount);

    if (!customerName || !customerNumber) {
      setDeductionError('Customer details are required for cash request.');
      openAlertModal('Customer details are required for cash request.', 'Cash Request');
      return;
    }

    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      setDeductionError('Loan amount must be greater than zero.');
      openAlertModal('Loan amount must be greater than zero.', 'Cash Request');
      return;
    }

    await advanceWorkflowStep({
      cash_request_payload: {
        customer_name: customerName,
        customer_number: customerNumber,
        loan_amount: String(Number(loanAmount.toFixed(2))),
      },
    });
  };

  const openCashWithdrawalModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.cash_withdrawal_payload || {}) as Record<string, unknown>;
    const fallbackRequestPayload = (selectedFinance.repayment_plan?.cash_request_payload || {}) as Record<string, unknown>;
    const customerName = `${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || 'Customer';
    const customerNumber = String(selectedFinance.customer?.customer_code || `FIN-${String(selectedFinance.id).padStart(6, '0')}`);
    const loanAmount = Number.isFinite(toNumber(selectedFinance.financed_amount))
      ? Number(toNumber(selectedFinance.financed_amount)).toFixed(2)
      : '0.00';

    setCashWithdrawalForm({
      customer_name: String(payload.customer_name || fallbackRequestPayload.customer_name || customerName).trim(),
      customer_number: String(payload.customer_number || fallbackRequestPayload.customer_number || customerNumber).trim(),
      loan_amount: String(payload.loan_amount ?? fallbackRequestPayload.loan_amount ?? loanAmount),
    });
    setCashWithdrawalModalOpen(true);
    setDeductionError('');
  };

  const submitCashWithdrawalAndMoveNext = async () => {
    const customerName = String(cashWithdrawalForm.customer_name || '').trim();
    const customerNumber = String(cashWithdrawalForm.customer_number || '').trim();
    const loanAmount = toNumber(cashWithdrawalForm.loan_amount);

    if (!customerName || !customerNumber) {
      setDeductionError('Customer details are required for cash withdrawal.');
      openAlertModal('Customer details are required for cash withdrawal.', 'Cash Withdrawal');
      return;
    }

    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      setDeductionError('Loan amount must be greater than zero.');
      openAlertModal('Loan amount must be greater than zero.', 'Cash Withdrawal');
      return;
    }

    await advanceWorkflowStep({
      cash_withdrawal_payload: {
        customer_name: customerName,
        customer_number: customerNumber,
        loan_amount: String(Number(loanAmount.toFixed(2))),
      },
    });
  };

  const openSecondCallModal = () => {
    if (!selectedFinance) return;

    const payload = (selectedFinance.repayment_plan?.second_call_confirmation_payload || {}) as Record<string, unknown>;
    const customerName = `${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || 'Customer';
    const rawCustomer = (selectedFinance.customer || {}) as Record<string, unknown>;
    const customerDob = String(rawCustomer.date_of_birth || rawCustomer.dob || '-').trim() || '-';
    const customerNic = String(selectedFinance.customer?.nic_passport || selectedFinance.customer?.nic || '-').trim() || '-';
    const customerPhone = String(selectedFinance.customer?.phone || '-').trim() || '-';
    const customerAddress = String(selectedFinance.customer?.address || '-').trim() || '-';
    const loanAmount = Number.isFinite(toNumber(selectedFinance.financed_amount))
      ? `LKR ${formatAmount(selectedFinance.financed_amount)}`
      : '-';
    const loanPurpose = String(selectedFinance.asset_reference || selectedFinance.finance_type || selectedFinance.product_type || '-').trim() || '-';
    const loanTerm = Number.isFinite(toNumber(selectedFinance.tenure_months))
      ? `${Math.max(1, Math.floor(toNumber(selectedFinance.tenure_months)))} Day(s)`
      : '-';
    const installment = Number.isFinite(toNumber(selectedFinance.installment_amount))
      ? `LKR ${formatAmount(selectedFinance.installment_amount)}`
      : '-';
    const paymentFrequency = String(selectedFinance.installment_frequency || '-').trim() || '-';
    const interestRate = Number.isFinite(toNumber(selectedFinance.interest_rate))
      ? `${toNumber(selectedFinance.interest_rate).toFixed(2)}%`
      : '-';
    const firstPaymentDate = toInputDate(selectedFinance.repayment_plan?.first_installment_date) || '-';
    const numberOfInstallments = Array.isArray(selectedFinance.repayment_plan?.installments)
      ? String(selectedFinance.repayment_plan?.installments.length || 0)
      : Number.isFinite(toNumber(selectedFinance.tenure_months))
        ? String(Math.max(1, Math.floor(toNumber(selectedFinance.tenure_months))))
        : '-';

    setSecondCallForm({
      customer_full_name: String(payload.customer_full_name || customerName).trim() || '-',
      nic_number: String(payload.nic_number || customerNic).trim() || '-',
      registered_mobile_number: String(payload.registered_mobile_number || customerPhone).trim() || '-',
      date_of_birth: String(payload.date_of_birth || customerDob).trim() || '-',
      address: String(payload.address || customerAddress).trim() || '-',
      loan_amount: String(payload.loan_amount || loanAmount).trim() || '-',
      loan_purpose: String(payload.loan_purpose || loanPurpose).trim() || '-',
      loan_term: String(payload.loan_term || loanTerm).trim() || '-',
      installment: String(payload.installment || installment).trim() || '-',
      payment_frequency: String(payload.payment_frequency || paymentFrequency).trim() || '-',
      interest_rate: String(payload.interest_rate || interestRate).trim() || '-',
      first_payment_date: String(payload.first_payment_date || firstPaymentDate).trim() || '-',
      number_of_installments: String(payload.number_of_installments || numberOfInstallments).trim() || '-',
      confirm_customer_full_name: Boolean(payload.confirm_customer_full_name ?? false),
      confirm_nic_number: Boolean(payload.confirm_nic_number ?? false),
      confirm_registered_mobile_number: Boolean(payload.confirm_registered_mobile_number ?? false),
      confirm_date_of_birth: Boolean(payload.confirm_date_of_birth ?? false),
      confirm_address: Boolean(payload.confirm_address ?? false),
      confirm_loan_amount: Boolean(payload.confirm_loan_amount ?? false),
      confirm_loan_purpose: Boolean(payload.confirm_loan_purpose ?? false),
      confirm_loan_term: Boolean(payload.confirm_loan_term ?? false),
      confirm_installment: Boolean(payload.confirm_installment ?? false),
      confirm_payment_frequency: Boolean(payload.confirm_payment_frequency ?? false),
      confirm_interest_rate: Boolean(payload.confirm_interest_rate ?? false),
      confirm_first_payment_date: Boolean(payload.confirm_first_payment_date ?? false),
      confirm_number_of_installments: Boolean(payload.confirm_number_of_installments ?? false),
    });

    setSecondCallModalOpen(true);
    setDeductionError('');
  };

  const submitSecondCallAndMoveNext = async () => {
    const allConfirmed =
      secondCallForm.confirm_customer_full_name
      && secondCallForm.confirm_nic_number
      && secondCallForm.confirm_registered_mobile_number
      && secondCallForm.confirm_date_of_birth
      && secondCallForm.confirm_address
      && secondCallForm.confirm_loan_amount
      && secondCallForm.confirm_loan_purpose
      && secondCallForm.confirm_loan_term
      && secondCallForm.confirm_installment
      && secondCallForm.confirm_payment_frequency
      && secondCallForm.confirm_interest_rate
      && secondCallForm.confirm_first_payment_date
      && secondCallForm.confirm_number_of_installments;

    if (!allConfirmed) {
      setDeductionError('Please confirm all second call details before moving to Signature Check.');
      openAlertModal('Please confirm all second call details before moving to Signature Check.', 'Second Call Confirmation');
      return;
    }

    await advanceWorkflowStep({
      second_call_confirmation_payload: secondCallForm,
    });
  };

  const openLoanSignatureModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.loan_signature_check_payload || {}) as Record<string, unknown>;
    const customerPhotoUrl = resolveFinanceCustomerPhotoUrl(selectedFinance);
    const customerSignatureUrl = resolveFinanceCustomerSignatureUrl(selectedFinance);

    setLoanSignatureForm({
      confirm_customer_photo: Boolean(payload.confirm_customer_photo ?? false),
      confirm_customer_signature: Boolean(payload.confirm_customer_signature ?? false),
      customer_photo_url: String(payload.customer_photo_url || customerPhotoUrl || '').trim(),
      customer_signature_url: String(payload.customer_signature_url || customerSignatureUrl || '').trim(),
    });

    setLoanSignatureModalOpen(true);
    setDeductionError('');
  };

  const submitLoanSignatureCheckAndMoveNext = async () => {
    if (!loanSignatureForm.confirm_customer_photo || !loanSignatureForm.confirm_customer_signature) {
      setDeductionError('Please confirm both customer photo and customer signature before moving to Document Filing.');
      openAlertModal('Please confirm both customer photo and customer signature before moving to Document Filing.', 'Loan Signature Check');
      return;
    }

    await advanceWorkflowStep({
      loan_signature_check_payload: {
        confirm_customer_photo: loanSignatureForm.confirm_customer_photo,
        confirm_customer_signature: loanSignatureForm.confirm_customer_signature,
        customer_photo_url: String(loanSignatureForm.customer_photo_url || '').trim(),
        customer_signature_url: String(loanSignatureForm.customer_signature_url || '').trim(),
      },
    });
  };

  const openDocumentFilingModal = () => {
    if (!selectedFinance) return;
    const payload = (selectedFinance.repayment_plan?.document_filing_payload || {}) as Record<string, unknown>;
    const existingRowsRaw = Array.isArray(payload.documents) ? payload.documents : [];
    const existingRows = existingRowsRaw
      .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
      .reduce((acc, row) => {
        const key = String(row.key || '').trim();
        if (key !== '') {
          acc[key] = row;
        }
        return acc;
      }, {} as Record<string, Record<string, unknown>>);

    const rows = FINANCE_DOCUMENT_VERIFICATION_ITEMS.map((item) => {
      const foundUrl = resolveFinanceDocumentUrlByKeywords(selectedFinance, item.keywords);
      const existing = (existingRows[item.key] || {}) as Record<string, unknown>;
      const existingUrl = String(existing['document_url'] || '').trim();
      const documentUrl = existingUrl || foundUrl;

      return {
        key: item.key,
        label: item.label,
        document_url: documentUrl,
        document_available: documentUrl !== '',
        verify: Boolean(existing['verify'] ?? false),
        not_required: Boolean(existing['not_required'] ?? false),
      } satisfies FinanceDocumentVerificationDecision;
    });

    setDocumentFilingForm({ documents: rows });
    setDocumentFilingModalOpen(true);
    setDeductionError('');
  };

  const submitDocumentFilingAndMoveNext = async () => {
    const decisions = Array.isArray(documentFilingForm.documents) ? documentFilingForm.documents : [];
    if (decisions.length === 0) {
      setDeductionError('Required document list is empty.');
      openAlertModal('Required document list is empty.', 'Document Verification');
      return;
    }

    const hasIncomplete = decisions.some((row) => !row.verify && !row.not_required);
    if (hasIncomplete) {
      setDeductionError('Please set Verify or Not Required for every document before moving to Insurance Request.');
      openAlertModal('Please set Verify or Not Required for every document before moving to Insurance Request.', 'Document Verification');
      return;
    }

    await advanceWorkflowStep({
      document_filing_payload: {
        documents: decisions.map((row) => ({
          key: row.key,
          label: row.label,
          document_url: row.document_url,
          document_available: row.document_available,
          verify: row.verify,
          not_required: row.not_required,
        })),
      },
    });
  };

  const submitStepTwoCallConfirmation = async () => {
    if (!selectedFinance) return;

    const noOfTimes = Number(stepTwoForm.no_of_times_called || 0);
    const loanAmount = Number(stepTwoForm.loan_amount || 0);
    if (!Number.isFinite(noOfTimes) || noOfTimes < 1) {
      setDeductionError('No of times called must be at least 1.');
      openAlertModal('No of times called must be at least 1.', 'Validation');
      return;
    }
    if (!stepTwoForm.called_date || !stepTwoForm.given_date) {
      setDeductionError('Called date and given date are required.');
      openAlertModal('Called date and given date are required.', 'Validation');
      return;
    }
    if (!stepTwoForm.customer_full_name.trim() || !stepTwoForm.nic_or_dob.trim()) {
      setDeductionError('Customer full name and NIC / date of birth are required.');
      openAlertModal('Customer full name and NIC / date of birth are required.', 'Validation');
      return;
    }
    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      setDeductionError('Loan amount must be greater than zero.');
      openAlertModal('Loan amount must be greater than zero.', 'Validation');
      return;
    }
    if (!stepTwoForm.answered_by_customer && !stepTwoForm.answered_by_spouse) {
      setDeductionError('Select at least one answer source: customer or spouse.');
      openAlertModal('Select at least one answer source: customer or spouse.', 'Validation');
      return;
    }

    await advanceWorkflowStep();
  };

  const openDetails = async (id: number) => {
    if (!token) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setSelectedFinance(null);

    try {
      const response = await axios.get(`/api/finances/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      setSelectedFinance(response.data as FinanceApprovalRow);
    } catch {
      setDetailError('');
      setDetailOpen(false);
      openAlertModal('Failed to load finance details.', 'Load Failed');
    } finally {
      setDetailLoading(false);
    }
  };

  const statsCards = [
    {
      key: 'pending_queue',
      title: 'Pending Queue',
      value: String(pendingCount),
      subtitle: 'Records waiting for decision',
      icon: Clock3,
      toneClass: 'text-cyan-800',
    },
    {
      key: 'exposure',
      title: 'Exposure',
      value: formatAmount(totalPendingAmount),
      subtitle: 'Total financed amount awaiting approval',
      icon: CheckCircle2,
      toneClass: 'text-emerald-800',
    },
    {
      key: 'avg_tenure',
      title: 'Avg Tenure',
      value: averageTenure > 0 ? `${averageTenure.toFixed(1)} mo` : '-',
      subtitle: 'Average tenure of queued applications',
      icon: ClipboardCheck,
      toneClass: 'text-violet-800',
    },
  ];
  const showHeaderWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}header`);
  const showStatsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}stats`);
  const showQueueWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}queue`);
  const visibleStatsCards = statsCards.filter((card) => !hiddenWidgetKeys.includes(`${widgetPrefix}stat_${card.key}`));
  const showAnyWidget = showHeaderWidget || showStatsWidget || showQueueWidget;

  const selectedCollateralPreview = useMemo(() => {
    if (!selectedFinance) {
      return { type: 'other', label: 'Other Details' } as {
        type: 'vehicle' | 'land' | 'gold' | 'equipment' | 'other';
        label: string;
      };
    }

    return resolveFinanceCollateralType(selectedFinance);
  }, [selectedFinance]);

  const selectedAssetDetailsEntries = useMemo(() => {
    if (!selectedFinance) return [] as Array<{ label: string; value: string }>;
    const details = (selectedFinance.vehicle_details || {}) as Record<string, unknown>;
    return Object.entries(details)
      .filter(([, value]) => hasAnyMeaningfulValue(value))
      .map(([key, value]) => ({ label: toPreviewLabel(key), value: toPreviewValue(value) }));
  }, [selectedFinance]);

  const familyFinancialEntries = useMemo(() => {
    if (!selectedFinance) return [] as Array<{ label: string; value: string }>;
    const details = (selectedFinance.family_financial_details || {}) as Record<string, unknown>;
    return Object.entries(details)
      .filter(([, value]) => hasAnyMeaningfulValue(value))
      .map(([key, value]) => ({ label: toPreviewLabel(key), value: toPreviewValue(value) }));
  }, [selectedFinance]);

  const evaluationEntries = useMemo(() => {
    if (!selectedFinance) return [] as Array<{ key: string; label: string; value: unknown }>;
    const details = (selectedFinance.evaluation_payload || {}) as Record<string, unknown>;
    return Object.entries(details)
      .filter(([, value]) => hasAnyMeaningfulValue(value))
      .map(([key, value]) => ({ key, label: toPreviewLabel(key), value }));
  }, [selectedFinance]);

  const residenceImageDocs = useMemo(() => {
    if (!Array.isArray(selectedFinance?.documents)) return [] as Array<NonNullable<FinanceApprovalRow['documents']>[number]>;
    return selectedFinance.documents.filter((doc) => {
      const t = String(doc.document_type || '').toLowerCase();
      return t.includes('residence') || t.includes('house') || t.includes('home') || t.includes('address');
    });
  }, [selectedFinance]);

  const basicCustomerPhotoUrl = useMemo(() => {
    if (!selectedFinance) return '';
    return resolveFinanceCustomerPhotoUrl(selectedFinance);
  }, [selectedFinance]);

  const basicCustomerSignatureUrl = useMemo(() => {
    if (!selectedFinance) return '';
    return resolveFinanceCustomerSignatureUrl(selectedFinance);
  }, [selectedFinance]);

  const workflowStepSummaries = useMemo(() => {
    if (!selectedFinance?.repayment_plan) return [] as Array<{ key: string; title: string; status: string; lines: Array<{ label: string; value: string }> }>;

    const plan = selectedFinance.repayment_plan as Record<string, unknown>;
    const summaries: Array<{ key: string; title: string; status: string; lines: Array<{ label: string; value: string }> }> = [];

    const pushSummary = (
      key: string,
      title: string,
      payload: unknown,
      linesBuilder: (record: Record<string, unknown>) => Array<{ label: string; value: string }>
    ) => {
      if (!payload || typeof payload !== 'object') return;
      const record = payload as Record<string, unknown>;
      const lines = linesBuilder(record).filter((line) => line.value.trim() !== '' && line.value.trim() !== '-');
      if (lines.length === 0) return;
      summaries.push({ key, title, status: 'Completed', lines });
    };

    pushSummary('step2', 'Step 2: Call Confirmation', plan.call_confirmation_payload, (payload) => [
      { label: 'No. of Calls', value: String(payload.no_of_times_called ?? '-') },
      { label: 'Called Date', value: String(payload.called_date ?? '-') },
      { label: 'Customer Answered', value: Boolean(payload.answered_by_customer) ? 'Yes' : 'No' },
      { label: 'Spouse Answered', value: Boolean(payload.answered_by_spouse) ? 'Yes' : 'No' },
      { label: 'Special Notes', value: String(payload.special_notes ?? '-') },
    ]);

    pushSummary('step3', 'Step 3: BM Approval', plan.bm_approval_payload, (payload) => [
      { label: 'BM Remarks', value: String(payload.bm_comments ?? '-') },
      { label: 'Additional Notes', value: String(payload.bm_additional_notes ?? '-') },
    ]);

    pushSummary('step4', 'Step 4: Head Office Approval', plan.ho_approval_payload, (payload) => [
      { label: 'Customer Photo Confirmed', value: Boolean(payload.confirm_customer_photo) ? 'Yes' : 'No' },
      { label: 'Signature Confirmed', value: Boolean(payload.confirm_customer_signature) ? 'Yes' : 'No' },
      { label: 'HO Notes', value: String(payload.ho_additional_notes ?? '-') },
    ]);

    pushSummary('step5', 'Step 5: Cash Allocation', plan.cash_allocation_payload, (payload) => [
      { label: 'Branch', value: String(payload.branch_name ?? '-') },
      { label: 'Today Requirement', value: formatEvaluationScalarValue('today_cash_requirement', payload.today_cash_requirement) },
      { label: 'Today Allocation', value: formatEvaluationScalarValue('today_allocation_amount', payload.today_allocation_amount) },
      { label: 'Tomorrow Allocation', value: formatEvaluationScalarValue('tomorrow_allocation_amount', payload.tomorrow_allocation_amount) },
    ]);

    pushSummary('step6', 'Step 6: Cash Request', plan.cash_request_payload, (payload) => [
      { label: 'Customer', value: String(payload.customer_name ?? '-') },
      { label: 'Customer Number', value: String(payload.customer_number ?? '-') },
      { label: 'Loan Amount', value: formatEvaluationScalarValue('loan_amount', payload.loan_amount) },
    ]);

    pushSummary('step7', 'Step 7: Cash Withdrawal', plan.cash_withdrawal_payload, (payload) => [
      { label: 'Customer', value: String(payload.customer_name ?? '-') },
      { label: 'Customer Number', value: String(payload.customer_number ?? '-') },
      { label: 'Loan Amount', value: formatEvaluationScalarValue('loan_amount', payload.loan_amount) },
    ]);

    pushSummary('step8', 'Step 8: Second Call Confirmation', plan.second_call_confirmation_payload, (payload) => {
      const confirmationKeys = Object.keys(payload).filter((k) => k.startsWith('confirm_'));
      const confirmedCount = confirmationKeys.filter((k) => Boolean(payload[k])).length;
      return [
        { label: 'Customer Name', value: String(payload.customer_full_name ?? '-') },
        { label: 'Loan Amount', value: String(payload.loan_amount ?? '-') },
        { label: 'Confirmed Items', value: `${confirmedCount}/${confirmationKeys.length}` },
      ];
    });

    pushSummary('step9', 'Step 9: Loan Signature Check', plan.loan_signature_check_payload, (payload) => [
      { label: 'Photo Verified', value: Boolean(payload.confirm_customer_photo) ? 'Yes' : 'No' },
      { label: 'Signature Verified', value: Boolean(payload.confirm_customer_signature) ? 'Yes' : 'No' },
    ]);

    pushSummary('step10', 'Step 10: Document Filing', plan.document_filing_payload, (payload) => {
      const docs = Array.isArray(payload.documents) ? payload.documents : [];
      const verifiedCount = docs.filter((doc) => doc && typeof doc === 'object' && Boolean((doc as Record<string, unknown>).verify)).length;
      const notRequiredCount = docs.filter((doc) => doc && typeof doc === 'object' && Boolean((doc as Record<string, unknown>).not_required)).length;
      return [
        { label: 'Documents Checked', value: String(docs.length) },
        { label: 'Verified', value: String(verifiedCount) },
        { label: 'Not Required', value: String(notRequiredCount) },
      ];
    });

    return summaries;
  }, [selectedFinance]);

  const reviewSectionTabs: Array<{ key: typeof activeReviewSection; label: string }> = [
    { key: 'basic', label: 'Basic' },
    { key: 'customer', label: 'Customer Full Details' },
    { key: 'asset', label: 'Chosen Asset Details' },
    { key: 'guarantor', label: 'Guarantor' },
    { key: 'repayment', label: 'Repayment' },
    { key: 'family_financial', label: 'Family & Financial' },
    { key: 'residence_images', label: 'Residence Images' },
    { key: 'evaluation', label: 'Evaluation' },
    { key: 'documents', label: 'Documents' },
  ];

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Loading approvals</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-24 left-10 h-80 w-80 rounded-full bg-blue-300 blur-3xl"></div>
        <div className="absolute top-24 right-8 h-96 w-96 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute -bottom-10 left-1/3 h-72 w-72 rounded-full bg-teal-300 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-5">
        {widgetNotice ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-5 text-sm font-semibold text-cyan-900">
            All widgets are currently hidden. Use `Restore Hidden Widgets` from the main dashboard to show them again.
          </div>
        ) : null}

        {showHeaderWidget ? (
        <div className="relative bg-white/90 rounded-3xl border border-cyan-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-[0_24px_50px_-28px_rgba(8,145,178,0.45)]">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
              aria-label="Hide finance approvals header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">
              <Sparkles className="h-3.5 w-3.5" />
              Finance Section
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-3">Finance Approvals</h1>
            <p className="text-sm text-slate-600 mt-1">Review every application with decision confidence before activation.</p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/dashboard/finance')}
            className="px-4 py-2 rounded-xl bg-white border border-cyan-200 text-cyan-800 text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-cyan-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
        ) : null}

        {showStatsWidget ? (
          <div className="relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}stats`)}
                className="absolute right-2 -top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                aria-label="Hide approvals stats widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            {visibleStatsCards.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {visibleStatsCards.map((card) => (
                  <div key={card.key} className="relative rounded-2xl border border-cyan-100 bg-white/90 backdrop-blur-xl p-4">
                    <WidgetCloseGate>
                      <button
                        type="button"
                        onClick={() => void hideWidget(`${widgetPrefix}stat_${card.key}`)}
                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                        aria-label={`Hide ${card.title} stat widget`}
                      >
                        ×
                      </button>
                    </WidgetCloseGate>
                    <div className={`inline-flex items-center gap-2 ${card.toneClass}`}>
                      <card.icon className="h-5 w-5" />
                      <p className="text-xs font-bold uppercase tracking-wide">{card.title}</p>
                    </div>
                    <p className="mt-2 text-2xl font-extrabold text-slate-900">{card.value}</p>
                    <p className="text-xs text-slate-500">{card.subtitle}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                All stats widgets are hidden.
              </div>
            )}
          </div>
        ) : null}

        {showQueueWidget ? (
          <div className="relative bg-white/90 rounded-3xl border border-cyan-100 p-5 shadow-[0_24px_50px_-28px_rgba(8,145,178,0.35)]">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}queue`)}
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                aria-label="Hide pending queue widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div className="inline-flex items-center gap-2 text-cyan-800">
                <ClipboardCheck className="h-5 w-5" />
                <p className="font-bold">Pending Approval Queue</p>
              </div>
              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">{rows.length} records</span>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-6 text-center">
                <div className="mx-auto h-10 w-10 rounded-full bg-white border border-cyan-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-cyan-700" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">No pending finance approvals.</p>
                <p className="text-xs text-slate-500 mt-1">New applications sent for approval will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rows.map((row) => {
                  const customer = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || 'Customer';
                  const customerCode = String(row.customer?.customer_code || `FIN-${String(row.id).padStart(6, '0')}`);
                  const rowStep = Number(row.repayment_plan?.approval_workflow?.current_step || 1);
                  const safeStep = Number.isFinite(rowStep)
                    ? Math.max(1, Math.min(FINANCE_WORKFLOW_STEPS.length, Math.floor(rowStep)))
                    : 1;
                  const stepTitle = String(
                    row.repayment_plan?.approval_workflow?.step_title
                    || FINANCE_WORKFLOW_STEPS[safeStep - 1]
                    || 'Approval Review'
                  );
                  const branchName = Number.isFinite(toNumber(row.branch_id))
                    ? (branchOptions.find((item) => item.id === Math.floor(toNumber(row.branch_id)))?.name || '-')
                    : '-';
                  const interestRate = Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}%` : '-';
                  const tenureDays = Number.isFinite(toNumber(row.tenure_months)) ? `${Math.max(1, Math.floor(toNumber(row.tenure_months)))} Day(s)` : '-';
                  const requestDate = toInputDate(row.created_at) || toInputDate(row.start_date) || '-';
                  const installmentAmount = Number.isFinite(toNumber(row.installment_amount))
                    ? Number(toNumber(row.installment_amount)).toFixed(2)
                    : '0.00';
                  const refundableAmount = Number.isFinite(toNumber(row.refund_amount))
                    ? Number(toNumber(row.refund_amount)).toFixed(2)
                    : Number.isFinite(toNumber(row.financed_amount))
                      ? Number(toNumber(row.financed_amount)).toFixed(2)
                      : '0.00';
                  const documentCharge = Number.isFinite(toNumber(row.amount))
                    ? Number((toNumber(row.amount) * 0.007).toFixed(2))
                    : 0;
                  const stampCharge = Number.isFinite(toNumber(row.amount))
                    ? Number((toNumber(row.amount) * 0.01).toFixed(2))
                    : 0;
                  const insuranceCharge = Number.isFinite(toNumber(row.amount))
                    ? Number((toNumber(row.amount) * 0.003).toFixed(2))
                    : 0;
                  const collectedPayment = Number.isFinite(toNumber(row.total_paid_amount))
                    ? Number(toNumber(row.total_paid_amount)).toFixed(2)
                    : '0.00';
                  const customerPhoto = resolveFinanceCustomerPhotoUrl(row);

                  return (
                    <div key={row.id} className="rounded-2xl border border-amber-200/80 bg-[#fffdf7] p-4 shadow-[0_20px_40px_-30px_rgba(217,119,6,0.45)]">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-xl border border-amber-300 bg-amber-50 overflow-hidden flex items-center justify-center text-[9px] font-bold uppercase text-amber-700">
                            {customerPhoto ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={customerPhoto} alt="Customer" className="h-full w-full object-cover" />
                            ) : (
                              'No Photo'
                            )}
                          </div>

                          <div>
                            <p className="text-sm font-extrabold text-slate-900">{customer}</p>
                            <p className="text-[11px] text-slate-500">Reference No: {customerCode}</p>
                            <p className="mt-2 text-[11px] text-slate-600">Scope: {String(row.finance_type || 'Route Loan')}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                                Step {safeStep}: {stepTitle}
                              </span>
                              <span className="text-[10px] text-slate-500">{branchName !== '-' ? `Branch: ${branchName}` : 'Branch not assigned'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Loan Amount</p>
                          <p className="text-2xl leading-none font-extrabold text-orange-600">{formatAmount(row.financed_amount)}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">{interestRate} | {tenureDays}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-slate-500">Refundable</p>
                          <p className="text-xs font-extrabold text-slate-900">{refundableAmount}</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-slate-500">Installment</p>
                          <p className="text-xs font-extrabold text-slate-900">{installmentAmount}</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-slate-500">Request Date</p>
                          <p className="text-xs font-extrabold text-slate-900">{requestDate}</p>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2">
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Charge Mode</p>
                          <p className="text-[11px] font-extrabold text-slate-900">Hand Cash</p>
                        </div>
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Collection Status</p>
                          <p className="text-[11px] font-extrabold text-slate-900">Pending</p>
                        </div>
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Document Charges</p>
                          <p className="text-[11px] font-extrabold text-slate-900">{documentCharge.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Stamp Charges</p>
                          <p className="text-[11px] font-extrabold text-slate-900">{stampCharge.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Insurance Charges</p>
                          <p className="text-[11px] font-extrabold text-slate-900">{insuranceCharge.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Collected Payment</p>
                          <p className="text-[11px] font-extrabold text-slate-900">{collectedPayment}</p>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div className="rounded-lg border border-amber-100 bg-amber-50/30 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Branch</p>
                          <p className="text-[11px] font-extrabold text-slate-900">{branchName}</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50/30 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Manager</p>
                          <p className="text-[11px] font-extrabold text-slate-900">-</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50/30 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Collection Officer</p>
                          <p className="text-[11px] font-extrabold text-slate-900">-</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50/30 px-2 py-2">
                          <p className="text-[9px] font-bold uppercase text-slate-500">Request Approval To</p>
                          <p className="text-[11px] font-extrabold text-slate-900">Employee #{String(row.id)}</p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/30 px-3 py-2">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Responsible Roles</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {['Loan Approver', 'Finance Manager', 'Branch Manager', 'Managing Director', 'Admin'].map((role) => (
                            <span key={role} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] text-slate-500">Auto next payment date will be calculated during approval workflow progression.</p>
                        <div className="flex items-center gap-2">
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                openConfirmModal('remove_loan', row.id, 'Are you sure you want to remove this loan? This action cannot be undone.', 'Remove Loan');
                              }}
                              disabled={processingId === row.id}
                              className="rounded-lg bg-rose-600 hover:bg-rose-700 border border-rose-700 px-4 py-2 text-xs font-bold text-white inline-flex items-center gap-1.5 disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {processingId === row.id ? 'Removing...' : 'Remove Loan'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openDetails(row.id)}
                            className="rounded-lg bg-orange-500 hover:bg-orange-600 border border-orange-600 px-4 py-2 text-xs font-bold text-white inline-flex items-center gap-1.5"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View More Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center px-4 py-4 md:py-6">
          <div className="w-full max-w-7xl h-[94vh] rounded-3xl bg-white/95 border border-cyan-200 shadow-[0_28px_80px_-32px_rgba(2,132,199,0.45)] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">
                  {currentWorkflowStep === 3 ? 'Branch Manager Approval Review' : 'Approval Review'}
                </p>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  {selectedFinance ? `Finance #${selectedFinance.id}` : 'Finance Details'}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {currentWorkflowStep === 3
                    ? 'Step 3 approval before Head Office. Review and confirm as Branch Manager.'
                    : 'Review full application details before taking action.'}
                </p>
                {selectedFinance && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-800">
                    Step {currentWorkflowStep}/{FINANCE_WORKFLOW_STEPS.length}: {currentWorkflowLabel}
                  </div>
                )}
                {selectedFinance && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 font-semibold text-cyan-800">
                      Customer: {`${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || '-'}
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
                      Financed: LKR {formatAmount(selectedFinance.financed_amount)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                      Branch: {branchOptions.find((item) => item.id === Number(selectedFinance.branch_id || 0))?.name || '-'}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setSelectedFinance(null);
                  setDetailError('');
                  closeSendBackModal();
                  setStepTwoModalOpen(false);
                  setBmApprovalModalOpen(false);
                  setHoApprovalModalOpen(false);
                  setCashAllocationModalOpen(false);
                  setCashRequestModalOpen(false);
                  setCashWithdrawalModalOpen(false);
                  setSecondCallModalOpen(false);
                  setLoanSignatureModalOpen(false);
                  setDocumentFilingModalOpen(false);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gradient-to-b from-slate-50 to-cyan-50/20 space-y-4">
              {detailLoading && (
                <div className="h-full min-h-[260px] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Loading details</p>
                  </div>
                </div>
              )}

              {!detailLoading && !detailError && selectedFinance && (
                <>
                  <div className="rounded-2xl border border-cyan-200 bg-white p-4 md:p-5 shadow-[0_24px_50px_-32px_rgba(8,145,178,0.45)]">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Approval Review Navigator</p>
                        <h4 className="mt-1 text-base font-extrabold text-slate-900">Structured Preview</h4>
                        <p className="text-xs text-slate-500 mt-1">Preview key sections before taking approval action. Collateral panel only shows the chosen asset category.</p>
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                        Current Asset Type: <span className="font-bold">{selectedCollateralPreview.label}</span>
                      </div>
                    </div>

                    <div className="mt-4 sticky top-0 z-10 -mx-2 px-2 py-2 bg-white/90 backdrop-blur-sm rounded-xl border border-cyan-100 flex flex-wrap gap-2">
                      {reviewSectionTabs.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveReviewSection(tab.key)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors ${activeReviewSection === tab.key ? 'border-cyan-300 bg-cyan-600 text-white' : 'border-cyan-100 bg-cyan-50 text-cyan-800 hover:bg-cyan-100'}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:p-5">
                      {activeReviewSection === 'basic' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div><span className="text-slate-500">Finance ID: </span><span className="font-semibold text-slate-900">#{selectedFinance.id}</span></div>
                          <div><span className="text-slate-500">Status: </span><span className="font-semibold text-slate-900 capitalize">{selectedFinance.status || '-'}</span></div>
                          <div><span className="text-slate-500">Current Step: </span><span className="font-semibold text-slate-900">Step {currentWorkflowStep}</span></div>
                          <div><span className="text-slate-500">Finance Type: </span><span className="font-semibold text-slate-900 capitalize">{selectedFinance.finance_type || '-'}</span></div>
                          <div><span className="text-slate-500">Product Type: </span><span className="font-semibold text-slate-900">{selectedFinance.product_type || '-'}</span></div>
                          <div><span className="text-slate-500">Reference: </span><span className="font-semibold text-slate-900">{selectedFinance.asset_reference || '-'}</span></div>
                          <div><span className="text-slate-500">Created At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.created_at)}</span></div>
                          <div><span className="text-slate-500">Start Date: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.start_date)}</span></div>
                          <div><span className="text-slate-500">Branch: </span><span className="font-semibold text-slate-900">{branchOptions.find((item) => item.id === Number(selectedFinance.branch_id || 0))?.name || '-'}</span></div>
                          <div className="md:col-span-3 mt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-3">
                              <p className="text-[11px] uppercase font-bold tracking-wide text-slate-500">Customer Image</p>
                              {basicCustomerPhotoUrl ? (
                                <>
                                  <img
                                    src={basicCustomerPhotoUrl}
                                    alt="Customer"
                                    className="mt-2 h-32 w-full rounded-md border border-cyan-100 object-cover bg-slate-100"
                                  />
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      onClick={() => window.open(basicCustomerPhotoUrl, '_blank', 'noopener,noreferrer')}
                                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800"
                                    >
                                      Preview Image
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">Customer image not found.</p>
                              )}
                            </div>

                            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-3">
                              <p className="text-[11px] uppercase font-bold tracking-wide text-slate-500">Customer Signature</p>
                              {basicCustomerSignatureUrl ? (
                                <>
                                  <img
                                    src={basicCustomerSignatureUrl}
                                    alt="Customer Signature"
                                    className="mt-2 h-32 w-full rounded-md border border-cyan-100 object-contain bg-slate-100"
                                  />
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      onClick={() => window.open(basicCustomerSignatureUrl, '_blank', 'noopener,noreferrer')}
                                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800"
                                    >
                                      Preview Signature
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">Customer signature not found.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {activeReviewSection === 'customer' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div><span className="text-slate-500">Customer Code: </span><span className="font-semibold text-slate-900">{selectedFinance.customer?.customer_code || '-'}</span></div>
                          <div><span className="text-slate-500">Full Name: </span><span className="font-semibold text-slate-900">{`${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || '-'}</span></div>
                          <div><span className="text-slate-500">NIC/Passport: </span><span className="font-semibold text-slate-900">{selectedFinance.customer?.nic_passport || selectedFinance.customer?.nic || '-'}</span></div>
                          <div><span className="text-slate-500">Mobile: </span><span className="font-semibold text-slate-900">{selectedFinance.customer?.phone || '-'}</span></div>
                          <div className="md:col-span-2"><span className="text-slate-500">Address: </span><span className="font-semibold text-slate-900">{selectedFinance.customer?.address || '-'}</span></div>
                          <div><span className="text-slate-500">Date of Birth: </span><span className="font-semibold text-slate-900">{selectedFinance.customer?.date_of_birth || selectedFinance.customer?.dob || '-'}</span></div>
                        </div>
                      )}

                      {activeReviewSection === 'asset' && (
                        <div className="space-y-3 text-sm">
                          <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
                            <span className="text-slate-500">Showing: </span>
                            <span className="font-semibold text-slate-900">{selectedCollateralPreview.label}</span>
                          </div>

                          {selectedAssetDetailsEntries.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {selectedAssetDetailsEntries.map((entry) => (
                                <div key={`asset-entry-${entry.label}`}><span className="text-slate-500">{entry.label}: </span><span className="font-semibold text-slate-900">{entry.value}</span></div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-3 text-slate-700">
                              <p className="text-sm">{selectedCollateralPreview.label} is selected for this loan.</p>
                              <p className="mt-1 text-xs text-slate-500">No structured asset details were found in the finance database payload.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {activeReviewSection === 'guarantor' && (
                        <div>
                          {Array.isArray(selectedFinance.guarantor_details) && selectedFinance.guarantor_details.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {selectedFinance.guarantor_details.map((g, index) => (
                                <div key={`preview-g-${index}`} className="rounded-lg border border-cyan-100 bg-white px-3 py-2 text-sm">
                                  <p><span className="text-slate-500">Name: </span><span className="font-semibold text-slate-900">{g.name || '-'}</span></p>
                                  <p><span className="text-slate-500">NIC: </span><span className="font-semibold text-slate-900">{g.nic || '-'}</span></p>
                                  <p><span className="text-slate-500">Phone: </span><span className="font-semibold text-slate-900">{g.phone || '-'}</span></p>
                                  <p><span className="text-slate-500">Address: </span><span className="font-semibold text-slate-900">{g.address || '-'}</span></p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">No guarantor details found.</p>
                          )}
                        </div>
                      )}

                      {activeReviewSection === 'repayment' && (
                        <div className="space-y-3 text-sm">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div><span className="text-slate-500">Installment Mode: </span><span className="font-semibold text-slate-900 capitalize">{selectedFinance.repayment_plan?.installment_mode || 'auto'}</span></div>
                            <div><span className="text-slate-500">Schedule Mode: </span><span className="font-semibold text-slate-900 capitalize">{String(selectedFinance.repayment_plan?.schedule_mode || 'auto').replace('_', ' ')}</span></div>
                            <div><span className="text-slate-500">First Installment: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan?.first_installment_date)}</span></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div><span className="text-slate-500">Financed Amount: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.financed_amount)}</span></div>
                            <div><span className="text-slate-500">Installment: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.installment_amount)}</span></div>
                            <div><span className="text-slate-500">Balance: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.balance_amount)}</span></div>
                          </div>
                        </div>
                      )}

                      {activeReviewSection === 'family_financial' && (
                        <div className="space-y-2 text-sm">
                          {familyFinancialEntries.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {familyFinancialEntries.map((entry) => (
                                <div key={`family-entry-${entry.label}`} className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
                                  <span className="text-slate-500">{entry.label}: </span>
                                  <span className="font-semibold text-slate-900">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">No family and financial details found in database payload.</p>
                          )}
                        </div>
                      )}

                      {activeReviewSection === 'residence_images' && (
                        <div>
                          {residenceImageDocs.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {residenceImageDocs.map((doc) => (
                                <div key={`res-doc-${doc.id}`} className="rounded-lg border border-cyan-100 bg-white px-3 py-2 text-sm flex items-center justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-slate-900">{doc.original_name || 'Residence Image'}</p>
                                    <p className="text-xs text-slate-500">{doc.document_type || '-'}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const url = resolveStorageAssetUrl(String(doc.file_url || doc.file_path || ''));
                                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800"
                                  >
                                    Preview
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">No residence image documents found.</p>
                          )}
                        </div>
                      )}

                      {activeReviewSection === 'evaluation' && (
                        <div className="space-y-3 text-sm">
                          <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
                            <p><span className="text-slate-500">Valuation Amount: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.valuation_details?.valuation_amount)}</span></p>
                            <p><span className="text-slate-500">Valuation Date: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.valuation_details?.valuation_date)}</span></p>
                            <p><span className="text-slate-500">Valuer Name: </span><span className="font-semibold text-slate-900">{selectedFinance.valuation_details?.valuer_name || '-'}</span></p>
                          </div>

                          {evaluationEntries.length > 0 ? (
                            <div className="space-y-2">
                              {evaluationEntries.map((entry) => (
                                <div key={`eval-entry-${entry.key}`} className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
                                  <p className="text-[11px] uppercase font-bold tracking-wide text-cyan-700">{entry.label}</p>

                                  {Array.isArray(entry.value) ? (
                                    entry.value.length > 0 ? (
                                      <div className="mt-2 space-y-2">
                                        {entry.value.map((item, itemIndex) => {
                                          if (item && typeof item === 'object' && !Array.isArray(item)) {
                                            const objectItem = item as Record<string, unknown>;
                                            const objectEntries = Object.entries(objectItem).filter(([, value]) => hasAnyMeaningfulValue(value));

                                            return (
                                              <div key={`eval-entry-${entry.key}-row-${itemIndex}`} className="rounded border border-cyan-100 bg-cyan-50 px-2 py-2">
                                                <p className="text-[11px] font-bold text-cyan-800">Record {itemIndex + 1}</p>
                                                <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
                                                  {objectEntries.length > 0 ? objectEntries.map(([subKey, subValue]) => (
                                                    <p key={`eval-entry-${entry.key}-row-${itemIndex}-${subKey}`}>
                                                      <span className="text-slate-500">{toPreviewLabel(subKey)}: </span>
                                                      <span className="font-semibold text-slate-900">{formatEvaluationScalarValue(subKey, subValue)}</span>
                                                    </p>
                                                  )) : <p className="text-slate-500">-</p>}
                                                </div>
                                              </div>
                                            );
                                          }

                                          return (
                                            <p key={`eval-entry-${entry.key}-row-${itemIndex}`}>
                                              <span className="text-slate-500">Record {itemIndex + 1}: </span>
                                              <span className="font-semibold text-slate-900">{formatEvaluationScalarValue(entry.key, item)}</span>
                                            </p>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="mt-1 text-slate-500">-</p>
                                    )
                                  ) : entry.value && typeof entry.value === 'object' ? (
                                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
                                      {Object.entries(entry.value as Record<string, unknown>)
                                        .filter(([, value]) => hasAnyMeaningfulValue(value))
                                        .map(([subKey, subValue]) => (
                                          <p key={`eval-entry-${entry.key}-${subKey}`}>
                                            <span className="text-slate-500">{toPreviewLabel(subKey)}: </span>
                                            <span className="font-semibold text-slate-900">{formatEvaluationScalarValue(subKey, subValue)}</span>
                                          </p>
                                        ))}
                                    </div>
                                  ) : (
                                    <p className="mt-1 text-slate-700">
                                      <span className="font-semibold text-slate-900">{formatEvaluationScalarValue(entry.key, entry.value)}</span>
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
                              <p><span className="text-slate-500">BM Review: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan?.bm_approval_payload ? 'Completed' : 'Pending'}</span></p>
                              <p><span className="text-slate-500">HO Review: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan?.ho_approval_payload ? 'Completed' : 'Pending'}</span></p>
                              <p><span className="text-slate-500">Second Call: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan?.second_call_confirmation_payload ? 'Completed' : 'Pending'}</span></p>
                            </div>
                          )}
                        </div>
                      )}

                      {activeReviewSection === 'documents' && (
                        <div>
                          {Array.isArray(selectedFinance.documents) && selectedFinance.documents.length > 0 ? (
                            <div className="space-y-2">
                              {selectedFinance.documents.map((doc) => (
                                <div key={`all-doc-${doc.id}`} className="rounded-lg border border-cyan-100 bg-white px-3 py-2 text-sm flex items-center justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-slate-900">{doc.original_name || 'Unnamed file'}</p>
                                    <p className="text-xs text-slate-500">{doc.document_type || 'document'}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const url = resolveStorageAssetUrl(String(doc.file_url || doc.file_path || ''));
                                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800"
                                  >
                                    Preview
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">No documents uploaded.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Customer</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {`${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || '-'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{selectedFinance.customer?.customer_code || '-'}</p>
                      <p className="text-xs text-slate-500">NIC: {selectedFinance.customer?.nic_passport || selectedFinance.customer?.nic || '-'}</p>
                      <p className="text-xs text-slate-500">Phone: {selectedFinance.customer?.phone || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Finance Type</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900 capitalize">{selectedFinance.finance_type || '-'}</p>
                      <p className="text-xs text-slate-500 mt-1">Product: {selectedFinance.product_type || '-'}</p>
                      <p className="text-xs text-slate-500">Status: {selectedFinance.status || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Timeline</p>
                      <p className="mt-2 text-xs text-slate-500">Start: {formatDate(selectedFinance.start_date)}</p>
                      <p className="text-xs text-slate-500">Created: {formatDate(selectedFinance.created_at)}</p>
                      <p className="text-xs text-slate-500">Reference: {selectedFinance.asset_reference || '-'}</p>
                    </div>
                  </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Workflow Step Summaries</p>
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                          Saved In Database
                        </span>
                      </div>

                      {workflowStepSummaries.length > 0 ? (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {workflowStepSummaries.map((item) => (
                            <div key={item.key} className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-800">{item.title}</p>
                                <span className="text-[10px] font-bold text-emerald-700">{item.status}</span>
                              </div>
                              <div className="mt-1.5 space-y-1">
                                {item.lines.map((line) => (
                                  <p key={`${item.key}-${line.label}`} className="text-xs text-slate-700">
                                    <span className="text-slate-500">{line.label}: </span>
                                    <span className="font-semibold text-slate-900">{line.value}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">No completed workflow summaries found yet.</p>
                      )}
                    </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Financial Terms</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div><span className="text-slate-500">Asset Value: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.amount)}</span></div>
                      <div><span className="text-slate-500">Down Payment: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.down_payment)}</span></div>
                      <div><span className="text-slate-500">Financed: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.financed_amount)}</span></div>
                      <div><span className="text-slate-500">Interest: </span><span className="font-semibold text-slate-900">{Number.isFinite(toNumber(selectedFinance.interest_rate)) ? `${toNumber(selectedFinance.interest_rate).toFixed(2)}%` : '-'}</span></div>
                      <div><span className="text-slate-500">Interest Type: </span><span className="font-semibold text-slate-900 capitalize">{selectedFinance.interest_type || '-'}</span></div>
                      <div><span className="text-slate-500">Tenure: </span><span className="font-semibold text-slate-900">{selectedFinance.tenure_months || '-'} mo</span></div>
                      <div><span className="text-slate-500">Frequency: </span><span className="font-semibold text-slate-900 capitalize">{selectedFinance.installment_frequency || '-'}</span></div>
                      <div><span className="text-slate-500">Installment: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.installment_amount)}</span></div>
                      <div><span className="text-slate-500">Total Paid: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.total_paid_amount)}</span></div>
                      <div><span className="text-slate-500">Balance: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.balance_amount)}</span></div>
                      <div><span className="text-slate-500">Refund: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.refund_amount)}</span></div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4 space-y-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Deduction Order Preview</p>
                      <p className="text-xs text-slate-500 mt-1">Read-only preview from the loan request. Approval review does not edit these values.</p>
                    </div>

                    {selectedFinance.repayment_plan?.deduction_order ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Allocation Mode</label>
                            <div className="w-full rounded-lg border border-cyan-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 capitalize">
                              {String(selectedFinance.repayment_plan?.deduction_order?.mode || 'flat').replace('_', ' ')}
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Base Profit %</label>
                            <div className="w-full rounded-lg border border-cyan-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                              {Number.isFinite(toNumber(selectedFinance.repayment_plan?.deduction_order?.profit_percentage))
                                ? `${toNumber(selectedFinance.repayment_plan?.deduction_order?.profit_percentage).toFixed(2)}%`
                                : '-'}
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Base Capital %</label>
                            <div className="w-full rounded-lg border border-cyan-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                              {Number.isFinite(toNumber(selectedFinance.repayment_plan?.deduction_order?.capital_percentage))
                                ? `${toNumber(selectedFinance.repayment_plan?.deduction_order?.capital_percentage).toFixed(2)}%`
                                : Number.isFinite(toNumber(selectedFinance.repayment_plan?.deduction_order?.profit_percentage))
                                  ? `${(100 - toNumber(selectedFinance.repayment_plan?.deduction_order?.profit_percentage)).toFixed(2)}%`
                                  : '-'}
                            </div>
                          </div>
                        </div>

                        {String(selectedFinance.repayment_plan?.deduction_order?.mode || '') === 'front_loaded' && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Initial Installments</p>
                              <p className="font-semibold text-slate-900">{selectedFinance.repayment_plan?.deduction_order?.initial_installments || '-'}</p>
                            </div>
                            <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Initial Profit %</p>
                              <p className="font-semibold text-slate-900">
                                {Number.isFinite(toNumber(selectedFinance.repayment_plan?.deduction_order?.initial_profit_percentage))
                                  ? `${toNumber(selectedFinance.repayment_plan?.deduction_order?.initial_profit_percentage).toFixed(2)}%`
                                  : '-'}
                              </p>
                            </div>
                            <div className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Remaining Profit %</p>
                              <p className="font-semibold text-slate-900">
                                {Number.isFinite(toNumber(selectedFinance.repayment_plan?.deduction_order?.remaining_profit_percentage))
                                  ? `${toNumber(selectedFinance.repayment_plan?.deduction_order?.remaining_profit_percentage).toFixed(2)}%`
                                  : '-'}
                              </p>
                            </div>
                          </div>
                        )}

                        {String(selectedFinance.repayment_plan?.deduction_order?.mode || '') === 'installment_wise' && Array.isArray(selectedFinance.repayment_plan?.deduction_order?.installment_rules) && selectedFinance.repayment_plan?.deduction_order?.installment_rules.length > 0 && (
                          <div className="overflow-x-auto rounded-lg border border-cyan-100">
                            <table className="min-w-full text-xs text-left text-slate-700 bg-white">
                              <thead className="bg-cyan-50/70">
                                <tr>
                                  <th className="px-2 py-2 font-semibold">Installment #</th>
                                  <th className="px-2 py-2 font-semibold">Installment Amount</th>
                                  <th className="px-2 py-2 font-semibold">Profit %</th>
                                  <th className="px-2 py-2 font-semibold">Capital %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedFinance.repayment_plan?.deduction_order?.installment_rules?.map((rule, idx) => (
                                  <tr key={`dor-preview-${idx}`} className="border-b border-cyan-100 last:border-b-0">
                                    <td className="px-2 py-2">{rule.installment_no || idx + 1}</td>
                                    <td className="px-2 py-2">{formatAmount(rule.installment_amount)}</td>
                                    <td className="px-2 py-2">{Number.isFinite(toNumber(rule.profit_percentage)) ? `${toNumber(rule.profit_percentage).toFixed(2)}%` : '-'}</td>
                                    <td className="px-2 py-2">
                                      {Number.isFinite(toNumber(rule.capital_percentage))
                                        ? `${toNumber(rule.capital_percentage).toFixed(2)}%`
                                        : Number.isFinite(toNumber(rule.profit_percentage))
                                          ? `${(100 - toNumber(rule.profit_percentage)).toFixed(2)}%`
                                          : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-3 text-xs text-cyan-900 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div>Total Installment Sum: <span className="font-semibold">{formatAmount(deductionTotals.totalInstallments)}</span></div>
                            <div>Total Interest Amount: <span className="font-semibold">{formatAmount(deductionTotals.totalInterest)}</span></div>
                            <div>Total Capital Amount: <span className="font-semibold">{formatAmount(deductionTotals.totalCapital)}</span></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div>Financed Amount: <span className="font-semibold">{formatAmount(deductionTotals.financed)}</span></div>
                            <div>Current Balance: <span className="font-semibold">{formatAmount(selectedFinance.balance_amount)}</span></div>
                            <div>
                              Preview Balance: <span className={`font-semibold ${deductionTotals.previewBalance < 0 ? 'text-rose-700' : 'text-cyan-900'}`}>{formatAmount(deductionTotals.previewBalance)}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        No deduction order data found in this loan request.
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Repayment Plan</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                      <div><span className="text-slate-500">Installment Mode: </span><span className="font-semibold text-slate-900 capitalize">{selectedFinance.repayment_plan?.installment_mode || 'auto'}</span></div>
                      <div><span className="text-slate-500">Schedule Mode: </span><span className="font-semibold text-slate-900 capitalize">{String(selectedFinance.repayment_plan?.schedule_mode || 'auto').replace('_', ' ')}</span></div>
                      <div><span className="text-slate-500">First Installment: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan?.first_installment_date)}</span></div>
                      <div><span className="text-slate-500">Collection Day: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan?.collection_day_of_month || '-'}</span></div>
                      <div><span className="text-slate-500">Grace Days: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan?.grace_period_days || 0}</span></div>
                      <div><span className="text-slate-500">Planned Total: </span><span className="font-semibold text-slate-900">{formatAmount(selectedFinance.repayment_plan?.total_planned_amount)}</span></div>
                    </div>

                    {Array.isArray(selectedFinance.repayment_plan?.installments) && selectedFinance.repayment_plan?.installments.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-cyan-100">
                        <div className="px-2 py-2 text-[11px] font-semibold text-cyan-800 bg-cyan-50/60 border-b border-cyan-100">
                          Upcoming installment highlighted based on saved schedule progress.
                        </div>
                        <table className="min-w-full text-xs text-left text-slate-700 bg-white">
                          <thead className="bg-cyan-50/70">
                            <tr>
                              <th className="px-2 py-2 font-semibold">Installment #</th>
                              <th className="px-2 py-2 font-semibold">Payment Date</th>
                              <th className="px-2 py-2 font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedFinance.repayment_plan.installments.map((item, index) => {
                              const nextIndexRaw = toNumber(selectedFinance.repayment_plan?.next_installment_index);
                              const nextIndex = Number.isFinite(nextIndexRaw) ? Math.max(0, Math.floor(nextIndexRaw)) : 0;
                              const isUpcoming = index === nextIndex;

                              return (
                              <tr key={`rp-${index}`} className={`border-b border-cyan-100 last:border-b-0 ${isUpcoming ? 'bg-emerald-50/70' : ''}`}>
                                <td className="px-2 py-2">
                                  {item.installment_no || index + 1}
                                  {isUpcoming && (
                                    <span className="ml-2 inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Upcoming</span>
                                  )}
                                </td>
                                <td className="px-2 py-2">{formatDate(item.payment_date)}</td>
                                <td className="px-2 py-2">{formatAmount(item.amount)}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Default equal-installment plan (no custom installment rows).</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Vehicle Details</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-slate-500">Vehicle No: </span><span className="text-slate-900 font-semibold">{selectedFinance.vehicle_details?.vehicle_no || '-'}</span></p>
                        <p><span className="text-slate-500">Chassis No: </span><span className="text-slate-900 font-semibold">{selectedFinance.vehicle_details?.chassis_no || '-'}</span></p>
                        <p><span className="text-slate-500">Engine No: </span><span className="text-slate-900 font-semibold">{selectedFinance.vehicle_details?.engine_no || '-'}</span></p>
                        <p><span className="text-slate-500">Make/Model: </span><span className="text-slate-900 font-semibold">{selectedFinance.vehicle_details?.make_model || '-'}</span></p>
                        <p><span className="text-slate-500">Year: </span><span className="text-slate-900 font-semibold">{selectedFinance.vehicle_details?.year || '-'}</span></p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Valuation Details</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-slate-500">Amount: </span><span className="text-slate-900 font-semibold">{formatAmount(selectedFinance.valuation_details?.valuation_amount)}</span></p>
                        <p><span className="text-slate-500">Date: </span><span className="text-slate-900 font-semibold">{formatDate(selectedFinance.valuation_details?.valuation_date)}</span></p>
                        <p><span className="text-slate-500">Valuer: </span><span className="text-slate-900 font-semibold">{selectedFinance.valuation_details?.valuer_name || '-'}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Guarantors</p>
                    {Array.isArray(selectedFinance.guarantor_details) && selectedFinance.guarantor_details.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedFinance.guarantor_details.map((g, index) => (
                          <div key={`g-${index}`} className="rounded-lg border border-cyan-100 bg-cyan-50/35 p-3 text-sm">
                            <p><span className="text-slate-500">Name: </span><span className="text-slate-900 font-semibold">{g.name || '-'}</span></p>
                            <p><span className="text-slate-500">NIC: </span><span className="text-slate-900 font-semibold">{g.nic || '-'}</span></p>
                            <p><span className="text-slate-500">Phone: </span><span className="text-slate-900 font-semibold">{g.phone || '-'}</span></p>
                            <p><span className="text-slate-500">Address: </span><span className="text-slate-900 font-semibold">{g.address || '-'}</span></p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No guarantor details found.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Documents</p>
                    {Array.isArray(selectedFinance.documents) && selectedFinance.documents.length > 0 ? (
                      <div className="space-y-2">
                        {selectedFinance.documents.map((doc) => (
                          <div key={doc.id} className="rounded-lg border border-cyan-100 bg-cyan-50/35 px-3 py-2 text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{doc.original_name || 'Unnamed file'}</span>
                            <span className="text-slate-500"> ({doc.document_type || 'document'})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No documents uploaded.</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-cyan-200 bg-white p-4 md:p-5 shadow-[0_22px_40px_-34px_rgba(8,145,178,0.45)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Process History</p>
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[10px] font-bold text-cyan-800">Step-wise Order</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">All completed workflow notes are shown in correct process order.</p>

                    <div className="mt-3 space-y-3">
                  {selectedFinance.repayment_plan?.call_confirmation_payload && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-3">Call Confirmation Details (Step 2)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div><span className="text-slate-500">Times Called: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.call_confirmation_payload.no_of_times_called ?? '-')}</span></div>
                        <div><span className="text-slate-500">Called Date: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.call_confirmation_payload.called_date)}</span></div>
                        <div><span className="text-slate-500">Given Date: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.call_confirmation_payload.given_date)}</span></div>
                        <div><span className="text-slate-500">Answer by Customer: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan.call_confirmation_payload.answered_by_customer ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-500">Answer by Spouse: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan.call_confirmation_payload.answered_by_spouse ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-500">Repayment Card: </span><span className="font-semibold text-slate-900 uppercase">{String(selectedFinance.repayment_plan.call_confirmation_payload.repayment_card_given ?? '-')}</span></div>
                        <div className="md:col-span-2"><span className="text-slate-500">Customer Name: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.call_confirmation_payload.customer_full_name ?? '-')}</span></div>
                        <div><span className="text-slate-500">NIC / DOB: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.call_confirmation_payload.nic_or_dob ?? '-')}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.bm_approval_payload && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-3">Branch Manager Approval Details (Step 3)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div className="md:col-span-2"><span className="text-slate-500">BM Comments: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.bm_approval_payload.bm_comments ?? '-')}</span></div>
                        <div><span className="text-slate-500">Reviewed At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.bm_approval_payload.reviewed_at)}</span></div>
                        <div className="md:col-span-3"><span className="text-slate-500">Additional Notes: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.bm_approval_payload.bm_additional_notes ?? '-')}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.ho_approval_payload && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 mb-3">Head Office Verification Details (Step 4)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div><span className="text-slate-500">Photo Verified: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan.ho_approval_payload.confirm_customer_photo ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-500">Signature Verified: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan.ho_approval_payload.confirm_customer_signature ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-500">Reviewed At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.ho_approval_payload.reviewed_at)}</span></div>
                        <div className="md:col-span-3"><span className="text-slate-500">Additional Notes: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.ho_approval_payload.ho_additional_notes ?? '-')}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.cash_allocation_payload && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700 mb-3">HO Cash Allocation Details (Step 5)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div><span className="text-slate-500">Branch: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.cash_allocation_payload.branch_name ?? '-')}</span></div>
                        <div><span className="text-slate-500">Today Requirement: </span><span className="font-semibold text-slate-900">Rs {formatAmount(selectedFinance.repayment_plan.cash_allocation_payload.today_cash_requirement)}</span></div>
                        <div><span className="text-slate-500">Today Allocation: </span><span className="font-semibold text-slate-900">Rs {formatAmount(selectedFinance.repayment_plan.cash_allocation_payload.today_allocation_amount)}</span></div>
                        <div><span className="text-slate-500">Tomorrow Allocation: </span><span className="font-semibold text-slate-900">Rs {formatAmount(selectedFinance.repayment_plan.cash_allocation_payload.tomorrow_allocation_amount)}</span></div>
                        <div><span className="text-slate-500">Reviewed At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.cash_allocation_payload.reviewed_at)}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.cash_request_payload && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700 mb-3">Cash Request Details (Step 6)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div><span className="text-slate-500">Customer: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.cash_request_payload.customer_name ?? '-')}</span></div>
                        <div><span className="text-slate-500">Customer No: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.cash_request_payload.customer_number ?? '-')}</span></div>
                        <div><span className="text-slate-500">Loan Amount: </span><span className="font-semibold text-slate-900">LKR {formatAmount(selectedFinance.repayment_plan.cash_request_payload.loan_amount)}</span></div>
                        <div><span className="text-slate-500">Requested At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.cash_request_payload.requested_at)}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.cash_withdrawal_payload && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-3">Cash Withdrawal Details (Step 7)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div><span className="text-slate-500">Customer: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.cash_withdrawal_payload.customer_name ?? '-')}</span></div>
                        <div><span className="text-slate-500">Customer No: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.cash_withdrawal_payload.customer_number ?? '-')}</span></div>
                        <div><span className="text-slate-500">Loan Amount: </span><span className="font-semibold text-slate-900">LKR {formatAmount(selectedFinance.repayment_plan.cash_withdrawal_payload.loan_amount)}</span></div>
                        <div><span className="text-slate-500">Withdrawn At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.cash_withdrawal_payload.withdrawn_at)}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.second_call_confirmation_payload && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 mb-3">Second Call Confirmation Details (Step 8)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div><span className="text-slate-500">Customer: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.second_call_confirmation_payload.customer_full_name ?? '-')}</span></div>
                        <div><span className="text-slate-500">NIC: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.second_call_confirmation_payload.nic_number ?? '-')}</span></div>
                        <div><span className="text-slate-500">Mobile: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.second_call_confirmation_payload.registered_mobile_number ?? '-')}</span></div>
                        <div><span className="text-slate-500">Loan Amount: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.second_call_confirmation_payload.loan_amount ?? '-')}</span></div>
                        <div><span className="text-slate-500">Installment: </span><span className="font-semibold text-slate-900">{String(selectedFinance.repayment_plan.second_call_confirmation_payload.installment ?? '-')}</span></div>
                        <div><span className="text-slate-500">Confirmed At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.second_call_confirmation_payload.confirmed_at)}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.loan_signature_check_payload && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-3">Loan Signature Check Details (Step 9)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div><span className="text-slate-500">Photo Confirmed: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan.loan_signature_check_payload.confirm_customer_photo ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-500">Signature Confirmed: </span><span className="font-semibold text-slate-900">{selectedFinance.repayment_plan.loan_signature_check_payload.confirm_customer_signature ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-500">Checked At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.loan_signature_check_payload.checked_at)}</span></div>
                      </div>
                    </div>
                  )}

                  {selectedFinance.repayment_plan?.document_filing_payload && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700 mb-3">Document Verification Details (Step 10)</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div>
                          <span className="text-slate-500">Verified Documents: </span>
                          <span className="font-semibold text-slate-900">
                            {Array.isArray(selectedFinance.repayment_plan.document_filing_payload.documents)
                              ? selectedFinance.repayment_plan.document_filing_payload.documents.filter((row) => Boolean(row?.verify)).length
                              : 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Marked Not Required: </span>
                          <span className="font-semibold text-slate-900">
                            {Array.isArray(selectedFinance.repayment_plan.document_filing_payload.documents)
                              ? selectedFinance.repayment_plan.document_filing_payload.documents.filter((row) => Boolean(row?.not_required)).length
                              : 0}
                          </span>
                        </div>
                        <div><span className="text-slate-500">Checked At: </span><span className="font-semibold text-slate-900">{formatDate(selectedFinance.repayment_plan.document_filing_payload.checked_at)}</span></div>
                      </div>
                    </div>
                  )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-cyan-100 bg-white flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setSelectedFinance(null);
                  setDetailError('');
                  closeSendBackModal();
                  setStepTwoModalOpen(false);
                  setBmApprovalModalOpen(false);
                  setHoApprovalModalOpen(false);
                  setCashAllocationModalOpen(false);
                  setCashRequestModalOpen(false);
                  setCashWithdrawalModalOpen(false);
                  setSecondCallModalOpen(false);
                  setLoanSignatureModalOpen(false);
                  setDocumentFilingModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canAdvanceCurrentStep) {
                    if (isBmLockedForCurrentUser) {
                      openAlertModal('BM approval is already submitted. Branch Manager cannot edit or modify it again.', 'Permission');
                    } else {
                      openAlertModal('You do not have permission to complete this step. This action is restricted to related role users or Admin/Managing Director.', 'Permission');
                    }
                    return;
                  }

                  if (currentWorkflowStep === 2) {
                    openStepTwoCallModal();
                    return;
                  }
                  if (currentWorkflowStep === 3) {
                    openBmApprovalModal();
                    return;
                  }
                  if (currentWorkflowStep === 4) {
                    openHoApprovalModal();
                    return;
                  }
                  if (currentWorkflowStep === 5) {
                    openCashAllocationModal();
                    return;
                  }
                  if (currentWorkflowStep === 6) {
                    openCashRequestModal();
                    return;
                  }
                  if (currentWorkflowStep === 7) {
                    openCashWithdrawalModal();
                    return;
                  }
                  if (currentWorkflowStep === 8) {
                    openSecondCallModal();
                    return;
                  }
                  if (currentWorkflowStep === 9) {
                    openLoanSignatureModal();
                    return;
                  }
                  if (currentWorkflowStep === 10) {
                    openDocumentFilingModal();
                    return;
                  }
                  void advanceWorkflowStep();
                }}
                disabled={!selectedFinance || detailLoading || processingId === selectedFinance?.id || !canAdvanceCurrentStep}
                className="px-4 py-2 rounded-lg bg-cyan-100 hover:bg-cyan-200 border border-cyan-200 text-cyan-800 text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <ClipboardCheck className="h-4 w-4" />
                {isBmLockedForCurrentUser ? 'BM Approval Locked' : advanceActionText}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canSendBackCurrentStep) {
                    openAlertModal('You do not have permission to send back this step.', 'Permission');
                    return;
                  }
                  openSendBackModal();
                }}
                disabled={!selectedFinance || detailLoading || processingId === selectedFinance?.id || !canSendBackCurrentStep}
                className="px-4 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-200 text-amber-900 text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Send Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedFinance) return;
                  if (!canRejectCurrentStep) {
                    openAlertModal('You do not have permission to reject at this step.', 'Permission');
                    return;
                  }
                  void updateStatus(selectedFinance.id, 'reject');
                }}
                disabled={!selectedFinance || detailLoading || processingId === selectedFinance?.id || !canRejectCurrentStep}
                className="px-4 py-2 rounded-lg bg-rose-100 hover:bg-rose-200 border border-rose-200 text-rose-800 text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedFinance) return;
                    openConfirmModal('remove_loan', selectedFinance.id, 'Are you sure you want to remove this loan? This action cannot be undone.', 'Remove Loan');
                  }}
                  disabled={!selectedFinance || detailLoading || processingId === selectedFinance?.id}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 border border-rose-700 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove Loan
                </button>
              )}
              {canFinalApprove && (
                <button
                  type="button"
                  onClick={() => selectedFinance && updateStatus(selectedFinance.id, 'approve')}
                  disabled={!selectedFinance || detailLoading || processingId === selectedFinance?.id}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve Final
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {detailOpen && sendBackModal.open && selectedFinance && (
        <div className="fixed inset-0 z-[73] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl border border-rose-100 max-h-[92vh] overflow-auto">
            {(() => {
              const customerName = `${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || 'Customer';
              const customerRef = selectedFinance.customer?.customer_code || `FIN-${String(selectedFinance.id).padStart(6, '0')}`;
              const backStepOptions = getFinanceBackStepOptions(currentWorkflowStep);
              const selectedBackStep = Number(sendBackModal.targetStep || 0);

              return (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Send Back Loan Request</h3>
                      <p className="text-sm text-slate-600">
                        {customerName} ({customerRef})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeSendBackModal}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                      disabled={processingId === selectedFinance.id}
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Send Back Step *</label>
                      <p className="mt-1 text-xs text-slate-500">
                        Current step: {currentWorkflowStep} - {getFinanceWorkflowStepLabel(currentWorkflowStep)}
                      </p>
                      <select
                        className="mt-1 w-full rounded-lg border border-rose-100 bg-white px-3 py-2 text-sm text-black"
                        value={sendBackModal.targetStep}
                        onChange={(e) =>
                          setSendBackModal((prev) => ({
                            ...prev,
                            targetStep: e.target.value,
                          }))
                        }
                        disabled={processingId === selectedFinance.id || backStepOptions.length === 0}
                      >
                        {backStepOptions.map((step) => (
                          <option key={`finance-send-back-step-option-${step}`} value={String(step)}>
                            Step {step} - {getFinanceWorkflowStepLabel(step)}
                          </option>
                        ))}
                      </select>
                      {backStepOptions.length === 0 && (
                        <p className="mt-1 text-xs font-semibold text-rose-600">This finance request is already at Step 1 and cannot be sent back further.</p>
                      )}
                    </div>

                    {backStepOptions.length > 0 && (
                      <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3 text-sm">
                        <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Selected Step Definition</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          Step {selectedBackStep} - {getFinanceWorkflowStepLabel(selectedBackStep)}
                        </p>
                        <p className="mt-1 text-slate-700">{getFinanceWorkflowStepDefinition(selectedBackStep)}</p>
                      </div>
                    )}

                    {backStepOptions.length > 0 && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Available Back Steps (Definitions)</p>
                        <div className="mt-2 space-y-1.5">
                          {backStepOptions.map((step) => (
                            <p key={`finance-send-back-step-definition-${step}`} className="text-slate-700">
                              <span className="font-semibold text-slate-900">Step {step} - {getFinanceWorkflowStepLabel(step)}:</span>{' '}
                              {getFinanceWorkflowStepDefinition(step)}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Send Back Note *</label>
                      <textarea
                        rows={4}
                        className="mt-1 w-full rounded-lg border border-rose-100 bg-white px-3 py-2 text-sm text-black"
                        placeholder="Explain what should be corrected before resubmission."
                        value={sendBackModal.note}
                        onChange={(e) =>
                          setSendBackModal((prev) => ({
                            ...prev,
                            note: e.target.value,
                          }))
                        }
                        disabled={processingId === selectedFinance.id}
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeSendBackModal}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      disabled={processingId === selectedFinance.id}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitSendBack()}
                      className="rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                      disabled={processingId === selectedFinance.id}
                    >
                      {processingId === selectedFinance.id ? 'Sending...' : 'Send Back With Note'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {detailOpen && stepTwoModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[73] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl border border-emerald-100 max-h-[92vh] overflow-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Call Confirmation - Step 2</h3>
                <p className="text-sm text-slate-600">
                  {`${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || 'Customer'} (FIN-{String(selectedFinance.id).padStart(6, '0')})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStepTwoModalOpen(false)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={processingId === selectedFinance.id}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">No of Times Called *</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.no_of_times_called}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, no_of_times_called: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Called Date *</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.called_date}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, called_date: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={stepTwoForm.answered_by_customer}
                    onChange={(e) => setStepTwoForm((prev) => ({ ...prev, answered_by_customer: e.target.checked }))}
                    disabled={processingId === selectedFinance.id}
                  />
                  Answer By Customer
                </label>
                <p className="mt-1 text-xs text-slate-600">Preview Contact: {stepTwoForm.customer_contact_no || '-'}</p>
              </div>

              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={stepTwoForm.answered_by_spouse}
                    onChange={(e) => setStepTwoForm((prev) => ({ ...prev, answered_by_spouse: e.target.checked }))}
                    disabled={processingId === selectedFinance.id}
                  />
                  Answer By Spouse
                </label>
                <p className="mt-1 text-xs text-slate-600">Preview Contact: {stepTwoForm.spouse_contact_no || '-'}</p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Customer Full Name *</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.customer_full_name}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, customer_full_name: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">NIC / Date Of Birth *</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.nic_or_dob}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, nic_or_dob: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Loan Amount *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.loan_amount}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, loan_amount: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Given Date *</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.given_date}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, given_date: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Business Type</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.business_type}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, business_type: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Repayment Card Given *</label>
                <select
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.repayment_card_given}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, repayment_card_given: e.target.value as 'yes' | 'no' }))}
                  disabled={processingId === selectedFinance.id}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Business Details</label>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.business_details}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, business_details: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Special Notes</label>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.special_notes}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, special_notes: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Disbursement OTP</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={stepTwoForm.disbursement_otp}
                  onChange={(e) => setStepTwoForm((prev) => ({ ...prev, disbursement_otp: e.target.value }))}
                  disabled={processingId === selectedFinance.id}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStepTwoModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={processingId === selectedFinance.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitStepTwoCallConfirmation()}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                disabled={processingId === selectedFinance.id}
              >
                {processingId === selectedFinance.id ? 'Saving...' : 'Save & Move Next Step'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && bmApprovalModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl border border-amber-100 max-h-[92vh] overflow-auto">
            {(() => {
              const customerPhotoUrl = resolveFinanceCustomerPhotoUrl(selectedFinance);
              const customerSignatureUrl = resolveFinanceCustomerSignatureUrl(selectedFinance);
              const customerName = `${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || '-';
              const customerNo = selectedFinance.customer?.customer_code || `FIN-${String(selectedFinance.id).padStart(6, '0')}`;
              const customerNic = selectedFinance.customer?.nic_passport || selectedFinance.customer?.nic || '-';
              const customerContact = selectedFinance.customer?.phone || '-';
              const customerAddress = selectedFinance.customer?.address || '-';

              return (
                <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Branch Manager Approval Review</h3>
                <p className="text-sm text-slate-600">
                  {`${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || 'Customer'} (FIN-{String(selectedFinance.id).padStart(6, '0')}) - Step 3 Approval Before Head Office
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBmApprovalModalOpen(false)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={processingId === selectedFinance.id}
              >
                Close
              </button>
            </div>

            <div className="rounded-xl border border-sky-100 bg-sky-50/35 p-4 mb-4">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-700 mb-3">Customer Profile</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-sky-100 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Photo</p>
                  <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-dashed border-sky-200 bg-slate-50 overflow-hidden">
                    {customerPhotoUrl ? (
                      <img src={customerPhotoUrl} alt="Customer Photo" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-500">No photo available</span>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-sky-100 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Signature</p>
                  <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-dashed border-sky-200 bg-slate-50 overflow-hidden">
                    {customerSignatureUrl ? (
                      <img src={customerSignatureUrl} alt="Customer Signature" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-500">No signature available</span>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-sky-100 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Details</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <p><span className="font-semibold text-slate-900">Name:</span> {customerName}</p>
                    <p><span className="font-semibold text-slate-900">Customer No:</span> {customerNo}</p>
                    <p><span className="font-semibold text-slate-900">NIC:</span> {customerNic}</p>
                    <p><span className="font-semibold text-slate-900">Contact:</span> {customerContact}</p>
                    <p><span className="font-semibold text-slate-900">Address:</span> {customerAddress}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Branch Manager Approval Comments</p>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">BM Comments *</label>
                  <textarea
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm text-black"
                    placeholder="Enter Branch Manager approval comments."
                    value={bmApprovalForm.bm_comments}
                    onChange={(e) =>
                      setBmApprovalForm((prev) => ({
                        ...prev,
                        bm_comments: e.target.value,
                      }))
                    }
                    disabled={processingId === selectedFinance.id || isBmLockedForCurrentUser}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Additional Notes</label>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm text-black"
                    placeholder="Optional additional notes for Head Office."
                    value={bmApprovalForm.bm_additional_notes}
                    onChange={(e) =>
                      setBmApprovalForm((prev) => ({
                        ...prev,
                        bm_additional_notes: e.target.value,
                      }))
                    }
                    disabled={processingId === selectedFinance.id || isBmLockedForCurrentUser}
                  />
                </div>

                {selectedFinance.repayment_plan?.bm_approval_payload && (
                  <p className="text-xs text-slate-600">
                    Existing saved BM approval detected. Submitting again will update BM approval comments.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBmApprovalModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={processingId === selectedFinance.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitBmApprovalAndMoveNext()}
                className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                disabled={processingId === selectedFinance.id || isBmLockedForCurrentUser}
              >
                {isBmLockedForCurrentUser
                  ? 'BM Approval Locked'
                  : processingId === selectedFinance.id
                    ? 'Saving...'
                    : 'Approve as BM & Move to Head Office'}
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {detailOpen && hoApprovalModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl border border-indigo-100 max-h-[92vh] overflow-auto">
            {(() => {
              const customerPhotoUrl = resolveFinanceCustomerPhotoUrl(selectedFinance);
              const customerSignatureUrl = resolveFinanceCustomerSignatureUrl(selectedFinance);
              const customerName = `${selectedFinance.customer?.first_name || ''} ${selectedFinance.customer?.last_name || ''}`.trim() || '-';
              const customerNo = selectedFinance.customer?.customer_code || `FIN-${String(selectedFinance.id).padStart(6, '0')}`;
              const customerNic = selectedFinance.customer?.nic_passport || selectedFinance.customer?.nic || '-';

              return (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Head Office Approval Review</h3>
                      <p className="text-sm text-slate-600">
                        {customerName} ({customerNo}) - Step 4 Approval Before Cash Allocation
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHoApprovalModalOpen(false)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                      disabled={processingId === selectedFinance.id}
                    >
                      Close
                    </button>
                  </div>

                  <div className="rounded-xl border border-sky-100 bg-sky-50/35 p-4 mb-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-sky-700 mb-3">Customer Profile Verification</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-sky-100 bg-white p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Photo</p>
                        <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-dashed border-sky-200 bg-slate-50 overflow-hidden">
                          {customerPhotoUrl ? (
                            <img src={customerPhotoUrl} alt="Customer Photo" className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-xs text-slate-500">No photo available</span>
                          )}
                        </div>
                        <label className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <input
                            type="checkbox"
                            checked={hoApprovalForm.confirm_customer_photo}
                            onChange={(e) => setHoApprovalForm((prev) => ({ ...prev, confirm_customer_photo: e.target.checked }))}
                            disabled={processingId === selectedFinance.id}
                          />
                          Photo Verified
                        </label>
                      </div>

                      <div className="rounded-lg border border-sky-100 bg-white p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Signature</p>
                        <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-dashed border-sky-200 bg-slate-50 overflow-hidden">
                          {customerSignatureUrl ? (
                            <img src={customerSignatureUrl} alt="Customer Signature" className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-xs text-slate-500">No signature available</span>
                          )}
                        </div>
                        <label className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <input
                            type="checkbox"
                            checked={hoApprovalForm.confirm_customer_signature}
                            onChange={(e) => setHoApprovalForm((prev) => ({ ...prev, confirm_customer_signature: e.target.checked }))}
                            disabled={processingId === selectedFinance.id}
                          />
                          Signature Verified
                        </label>
                      </div>

                      <div className="rounded-lg border border-sky-100 bg-white p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Details</p>
                        <div className="mt-2 space-y-1 text-sm text-slate-700">
                          <p><span className="font-semibold text-slate-900">Name:</span> {customerName}</p>
                          <p><span className="font-semibold text-slate-900">Customer No:</span> {customerNo}</p>
                          <p><span className="font-semibold text-slate-900">NIC:</span> {customerNic}</p>
                          <p><span className="font-semibold text-slate-900">Current Step:</span> Step {currentWorkflowStep} - {currentWorkflowLabel}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Head Office Notes</label>
                    <textarea
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-black"
                      placeholder="Optional notes before moving to Cash Allocation."
                      value={hoApprovalForm.ho_additional_notes}
                      onChange={(e) => setHoApprovalForm((prev) => ({ ...prev, ho_additional_notes: e.target.value }))}
                      disabled={processingId === selectedFinance.id}
                    />
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setHoApprovalModalOpen(false)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      disabled={processingId === selectedFinance.id}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitHoApprovalAndMoveNext()}
                      className="rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                      disabled={processingId === selectedFinance.id}
                    >
                      {processingId === selectedFinance.id ? 'Saving...' : 'Approve at Head Office & Move to Cash Allocation'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {detailOpen && cashAllocationModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[76] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-3 text-white text-3xl font-bold">
              HO Cash Allocations
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-2xl font-bold text-slate-700 mb-4">Account Journal Entry</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Branch</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-black"
                    value={cashAllocationForm.branch_id}
                    onChange={(e) => {
                      const value = e.target.value;
                      const selected = branchOptions.find((row) => String(row.id) === value);
                      setCashAllocationForm((prev) => ({
                        ...prev,
                        branch_id: value,
                        branch_name: selected?.name || '',
                      }));
                    }}
                    disabled={processingId === selectedFinance.id}
                  >
                    <option value="">Select branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Today Cash Requirement</label>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="mr-3 text-slate-500">Rs</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full bg-transparent text-sm text-black outline-none"
                      value={cashAllocationForm.today_cash_requirement}
                      onChange={(e) => setCashAllocationForm((prev) => ({ ...prev, today_cash_requirement: e.target.value }))}
                      disabled={processingId === selectedFinance.id}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Today Allocation Amount</label>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="mr-3 text-slate-500">Rs</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full bg-transparent text-sm text-black outline-none"
                      value={cashAllocationForm.today_allocation_amount}
                      onChange={(e) => setCashAllocationForm((prev) => ({ ...prev, today_allocation_amount: e.target.value }))}
                      disabled={processingId === selectedFinance.id}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Tomorrow Allocation Amount</label>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="mr-3 text-slate-500">Rs</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full bg-transparent text-sm text-black outline-none"
                      value={cashAllocationForm.tomorrow_allocation_amount}
                      onChange={(e) => setCashAllocationForm((prev) => ({ ...prev, tomorrow_allocation_amount: e.target.value }))}
                      disabled={processingId === selectedFinance.id}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCashAllocationModalOpen(false)}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={processingId === selectedFinance.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitCashAllocationAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={processingId === selectedFinance.id}
                >
                  {processingId === selectedFinance.id ? 'Saving...' : 'Allocate Cash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOpen && cashRequestModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[77] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white text-3xl font-bold">
              Cash Request
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-sm text-slate-700 mb-4">
                Click Request to submit this loan for cash request processing and move workflow to Step 7.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{cashRequestForm.customer_name || '-'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Loan Amount</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">LKR {formatAmount(cashRequestForm.loan_amount)}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCashRequestModalOpen(false)}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={processingId === selectedFinance.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitCashRequestAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={processingId === selectedFinance.id}
                >
                  {processingId === selectedFinance.id ? 'Saving...' : 'Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOpen && cashWithdrawalModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[78] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white text-3xl font-bold">
              Cash Withdrawal
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-sm text-slate-700 mb-4">
                Click Withdraw Cash to complete cash withdrawal, update the Branch Main Account balance, and move to the next step.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{cashWithdrawalForm.customer_name || '-'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Loan Amount</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">LKR {formatAmount(cashWithdrawalForm.loan_amount)}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCashWithdrawalModalOpen(false)}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={processingId === selectedFinance.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitCashWithdrawalAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={processingId === selectedFinance.id}
                >
                  {processingId === selectedFinance.id ? 'Saving...' : 'Withdraw Cash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOpen && secondCallModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[79] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-3 text-white text-3xl font-bold">
              Second Call Confirmation
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-sm text-slate-700 mb-4">Confirm each detail after customer verification on second call.</p>

              {[
                { key: 'confirm_customer_full_name', label: 'Customer Full Name', value: secondCallForm.customer_full_name },
                { key: 'confirm_nic_number', label: 'NIC Number', value: secondCallForm.nic_number },
                { key: 'confirm_registered_mobile_number', label: 'Registered Mobile Number', value: secondCallForm.registered_mobile_number },
                { key: 'confirm_date_of_birth', label: 'Date of Birth', value: secondCallForm.date_of_birth },
                { key: 'confirm_address', label: 'Address', value: secondCallForm.address },
                { key: 'confirm_loan_amount', label: 'Loan Amount', value: secondCallForm.loan_amount },
                { key: 'confirm_loan_purpose', label: 'Loan Purpose', value: secondCallForm.loan_purpose },
                { key: 'confirm_loan_term', label: 'Loan Term', value: secondCallForm.loan_term },
                { key: 'confirm_installment', label: 'Installment', value: secondCallForm.installment },
                { key: 'confirm_payment_frequency', label: 'Payment Frequency', value: secondCallForm.payment_frequency },
                { key: 'confirm_interest_rate', label: 'Interest Rate', value: secondCallForm.interest_rate },
                { key: 'confirm_first_payment_date', label: 'First Payment Date', value: secondCallForm.first_payment_date },
                { key: 'confirm_number_of_installments', label: 'Number of Installments', value: secondCallForm.number_of_installments },
              ].map((item) => (
                <div key={item.key} className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={Boolean(secondCallForm[item.key as keyof FinanceSecondCallConfirmationForm])}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSecondCallForm((prev) => ({
                          ...prev,
                          [item.key]: checked,
                        }));
                      }}
                      disabled={processingId === selectedFinance.id}
                    />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className="text-[12px] font-bold text-slate-900">{item.value || '-'}</p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSecondCallModalOpen(false)}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={processingId === selectedFinance.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitSecondCallAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={processingId === selectedFinance.id}
                >
                  {processingId === selectedFinance.id ? 'Saving...' : 'Call Confirm and Move to Step 9'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOpen && loanSignatureModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white text-3xl font-bold">
              Loan Signature Check
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-sm text-slate-700 mb-4">Verify customer photo and customer signature before moving to Step 10: Document Filing.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Photo</p>
                  <div className="mt-2 flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                    {loanSignatureForm.customer_photo_url ? (
                      <img src={loanSignatureForm.customer_photo_url} alt="Customer Photo" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-sm text-slate-500">No customer photo available</span>
                    )}
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-2xl font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={loanSignatureForm.confirm_customer_photo}
                      onChange={(e) => setLoanSignatureForm((prev) => ({ ...prev, confirm_customer_photo: e.target.checked }))}
                      disabled={processingId === selectedFinance.id}
                    />
                    Confirm Customer Photo
                  </label>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer Signature</p>
                  <div className="mt-2 flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                    {loanSignatureForm.customer_signature_url ? (
                      <img src={loanSignatureForm.customer_signature_url} alt="Customer Signature" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-sm text-slate-500">No customer signature available</span>
                    )}
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-2xl font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={loanSignatureForm.confirm_customer_signature}
                      onChange={(e) => setLoanSignatureForm((prev) => ({ ...prev, confirm_customer_signature: e.target.checked }))}
                      disabled={processingId === selectedFinance.id}
                    />
                    Confirm Customer Signature
                  </label>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setLoanSignatureModalOpen(false)}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={processingId === selectedFinance.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitLoanSignatureCheckAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={processingId === selectedFinance.id}
                >
                  {processingId === selectedFinance.id ? 'Saving...' : 'Confirm Signature and Move to Step 10'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOpen && documentFilingModalOpen && selectedFinance && (
        <div className="fixed inset-0 z-[81] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white text-3xl font-bold">
              Document Verification
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <p className="text-sm text-slate-700 mb-4">
                Verify required documents: Customer National ID, Passport, Driving License, Bank Statements, EPF Reports, Tax Returns, Paysheets, Business Documents, Guarantor Image, and Guarantor Signature.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {documentFilingForm.documents.map((row, index) => (
                  <div key={row.key} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{row.label}</p>
                    <p className={`mt-1 text-sm font-bold ${row.document_available ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {row.document_available ? 'Document Available' : 'Document Not Available'}
                    </p>

                    <div className="mt-2 flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          if (!row.document_url) return;
                          window.open(row.document_url, '_blank', 'noopener,noreferrer');
                        }}
                        disabled={!row.document_url}
                        className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-500 disabled:opacity-50"
                      >
                        Preview
                      </button>

                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.verify}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setDocumentFilingForm((prev) => ({
                              documents: prev.documents.map((item, itemIndex) => itemIndex === index
                                ? { ...item, verify: checked, not_required: checked ? false : item.not_required }
                                : item),
                            }));
                          }}
                          disabled={processingId === selectedFinance.id}
                        />
                        Verify
                      </label>

                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.not_required}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setDocumentFilingForm((prev) => ({
                              documents: prev.documents.map((item, itemIndex) => itemIndex === index
                                ? { ...item, not_required: checked, verify: checked ? false : item.verify }
                                : item),
                            }));
                          }}
                          disabled={processingId === selectedFinance.id}
                        />
                        Not Required
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDocumentFilingModalOpen(false)}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={processingId === selectedFinance.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitDocumentFilingAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={processingId === selectedFinance.id}
                >
                  {processingId === selectedFinance.id ? 'Saving...' : 'Verify Documents and Move to Step 11'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {alertModal.open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-cyan-100 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">{alertModal.title || 'Notice'}</h3>
              <button
                type="button"
                onClick={closeAlertModal}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-slate-700">{alertModal.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeAlertModal}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.open && (
        <div className="fixed inset-0 z-[91] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">{confirmModal.title || 'Confirmation'}</h3>
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-slate-700">{confirmModal.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitConfirmModal()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
