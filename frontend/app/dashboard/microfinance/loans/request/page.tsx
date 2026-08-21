'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type MFRoute = { id: number; name: string; code: string };
type MFCenter = { id: number; mf_route_id: number; name: string; code: string };
type MFGroup = { id: number; mf_route_id: number; mf_center_id: number; name: string; code: string };
type ManagerOption = {
  id: number;
  name: string;
  designation: string;
  branch: string;
  branch_id: number;
  user_id?: number;
  reporting_person?: string;
};
type MFLoanProduct = {
  id: number;
  name: string;
  min_loan_amount?: number | string | null;
  max_loan_amount?: number | string | null;
  loan_amount?: number | string | null;
  amount?: number | string | null;
  principal_amount?: number | string | null;
  document_charge_percentage?: number | string | null;
  stamp_charge_percentage?: number | string | null;
  insurance_charge_percentage?: number | string | null;
  interest_rate: number;
  interest_type: 'flat' | 'reducing';
  terms_count: number;
  refund_option: 'day' | 'week' | 'month';
  assumed_month_days?: number;
  is_active: boolean;
};

type Guarantor = {
  name: string;
  nic: string;
  address: string;
  contact_no: string;
  relationship: string;
  image_file: File | null;
  signature_file: File | null;
};

type GuarantorTextField = 'name' | 'nic' | 'address' | 'contact_no' | 'relationship';

type RegisterRelationalEntry = {
  name: string;
  relationship: string;
  contact_no: string;
  signature_file: File | null;
};

type ExistingLoanEntry = {
  institution: string;
  outstanding_balance: string;
  monthly_installment: string;
};

type GuarantorLookupOption = {
  id: number;
  name: string;
  nic: string;
  address: string;
  contact_no: string;
};

type ExistingCustomer = {
  id: number;
  customer_code?: string;
  full_name_with_initials?: string;
  customer_name?: string;
  first_name?: string;
  last_name?: string;
  nick_name?: string;
  nic_passport?: string;
  old_nic?: string;
  phone?: string;
  monthly_loan_obligations?: number | string | null;
  credit_score?: number | string | null;
  permanent_address?: string;
  current_address?: string;
  additional_details?: Record<string, unknown>;
  photo_path?: string;
  photo_url?: string;
  profile_photo?: string;
  customer_photo?: string;
};

const CUSTOMER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

type ExistingLoanRequest = {
  id?: number;
  reference_no?: string;
  customer_no?: string;
  customer_name?: string;
  nick_name?: string;
  approval_employee_id?: number | null;
  manager_name?: string;
  field_officer?: string;
  group_leader?: string;
  loan_code?: string;
  address?: string;
  contact_no?: string;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_no?: string | null;
  reason?: string | null;
  loan_amount?: number | string;
  refundable_amount?: number | string;
  installment_amount?: number | string;
  document_charges?: number | string;
  stamp_charges?: number | string;
  insurance_charges?: number | string;
  charge_payment_mode?: 'deduct_from_loan' | 'hand_cash' | string;
  charges_collection_status?: 'pending' | 'done' | string;
  refund_option?: 'day' | 'week' | 'month' | string;
  interest_type?: 'flat' | 'reducing' | string;
  interest_rate?: number | string;
  terms_count?: number | string;
  status?: string;
  loan_scope?: 'route_loan' | 'center_loan' | 'direct_loan' | string;
  loan_request_date?: string;
  mf_route_id?: number;
  mf_center_id?: number;
  route?: { id?: number; name?: string } | null;
  center?: { id?: number; name?: string } | null;
  group?: { id?: number; name?: string } | null;
  guarantors?: Array<{
    id?: number;
    name?: string;
    nic?: string;
    relationship?: string;
    contact_no?: string;
  }>;
};

type RequestedLoanPreview = {
  id: number;
  customerNo: string;
  customerName: string;
  loanAmount: number;
  status: string;
  loanScope: string;
  routeName: string;
  centerName: string;
  groupName: string;
  requestDate: string;
};

type RequestedLoanEditForm = {
  loan_scope: 'route_loan' | 'center_loan' | 'direct_loan';
  mf_route_id: number;
  mf_center_id: number;
  mf_group_id: number;
  approval_employee_id: number;
  customer_name: string;
  address: string;
  contact_no: string;
  manager_name: string;
  field_officer: string;
  group_leader: string;
  loan_amount: string;
  interest_rate: string;
  terms_count: string;
  refundable_amount: string;
  installment_amount: string;
  document_charges: string;
  stamp_charges: string;
  insurance_charges: string;
  charge_payment_mode: 'deduct_from_loan' | 'hand_cash';
  charges_collection_status: 'pending' | 'done';
  refund_option: 'day' | 'week' | 'month';
  interest_type: 'flat' | 'reducing';
  reason: string;
  loan_request_date: string;
  bank_name: string;
  bank_branch: string;
  bank_account_no: string;
};

type AuthRole = {
  id?: number;
  name?: string;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  branch_id?: number;
  branch?: { id?: number; name?: string } | null;
  designation?: { id?: number; name?: string } | null;
  employee?: { id?: number; first_name?: string; last_name?: string; email?: string; branch_id?: number } | null;
  roles?: AuthRole[];
};

const API_BASE = getApiBaseUrl();
const INTEREST_RATE_MAX_DECIMALS = 7;
const STEP3_CONTINUE_MIN_COMPLETION = 30;
const LOAN_REQUEST_MIN_COMPLETION = 30;
const EVALUATION_PAYLOAD_VERSION = 2;

const sanitizeInterestRateInput = (value: string) => {
  const normalized = value.replace(/,/g, '.').trim();
  if (normalized === '') {
    return '';
  }

  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }

  const [whole = '', fractional = ''] = normalized.split('.');
  if (fractional.length > INTEREST_RATE_MAX_DECIMALS) {
    return `${whole}.${fractional.slice(0, INTEREST_RATE_MAX_DECIMALS)}`;
  }

  return normalized;
};

const finalizeInterestRate = (value: string) => {
  const sanitized = sanitizeInterestRateInput(value);
  if (sanitized === null || sanitized === '' || sanitized === '.') {
    return '';
  }

  const numeric = Number(sanitized);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return '';
  }

  const [whole = '0', fractional = ''] = sanitized.split('.');
  const trimmedFraction = fractional.slice(0, INTEREST_RATE_MAX_DECIMALS).replace(/0+$/, '');

  if (trimmedFraction === '') {
    return whole === '' ? '0' : whole;
  }

  return `${whole || '0'}.${trimmedFraction}`;
};

const resolveLoanAmountFromProduct = (product: MFLoanProduct): string => {
  const directCandidates = [product.loan_amount, product.amount, product.principal_amount];
  for (const candidate of directCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric.toFixed(2);
    }
  }

  const fromNameMatch = String(product.name || '').match(/(\d+(?:\.\d+)?)/);
  if (!fromNameMatch) return '';

  const fromName = Number(fromNameMatch[1]);
  if (!Number.isFinite(fromName) || fromName <= 0) return '';
  return fromName.toFixed(2);
};

const calculateChargeFromPercentage = (loanAmount: number, percentage: unknown): string => {
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct <= 0 || loanAmount <= 0) {
    return '0';
  }
  return ((loanAmount * pct) / 100).toFixed(2);
};

const isAllowedImageType = (file: File) => {
  const mime = String(file.type || '').toLowerCase();
  if (ALLOWED_IMAGE_TYPES.has(mime)) {
    return true;
  }

  const lowerName = String(file.name || '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].some((ext) => lowerName.endsWith(ext));
};

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image decode failed'));
    };
    image.src = objectUrl;
  });

const compressImageIfNeeded = async (file: File, maxBytes = CUSTOMER_PHOTO_MAX_BYTES): Promise<File> => {
  if (file.size <= maxBytes) {
    return file;
  }

  const image = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  let width = image.width;
  let height = image.height;
  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const outputType = 'image/jpeg';
  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42];
  let scale = 1;
  let bestFile = file;

  for (let pass = 0; pass < 4; pass += 1) {
    for (const quality of qualitySteps) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, quality));
      if (!blob) continue;

      const candidate = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
        type: outputType,
        lastModified: Date.now(),
      });

      if (candidate.size < bestFile.size) {
        bestFile = candidate;
      }

      if (candidate.size <= maxBytes) {
        return candidate;
      }
    }

    scale *= 0.85;
    width = Math.max(720, Math.round(image.width * scale));
    height = Math.max(720, Math.round(image.height * scale));
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  }

  return bestFile;
};

export default function RequestLoanPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onClose?: () => void;
    onConfirm?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
  }>({
    open: false,
    title: '',
    message: '',
  });

  const openModal = (message: string, title = 'Notice', onClose?: () => void) => {
    setModal({ open: true, title, message, onClose, onConfirm: undefined });
  };

  const closeModal = () => {
    const callback = modal.onClose;
    setModal({ open: false, title: '', message: '' });
    if (callback) callback();
  };

  const confirmModal = () => {
    const callback = modal.onConfirm;
    setModal({ open: false, title: '', message: '' });
    if (callback) callback();
  };
  const widgetPrefix = 'mf_loan_request_widget_';

  const fetchWidgetPreferences = async (authToken: string) => {
    try {
      const response = await axios.get('/api/dashboard/widgets', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of rows) {
        const key = String(row?.widget_key || '').trim();
        if (!key.startsWith(widgetPrefix)) continue;
        if (row?.is_visible === false) nextHidden.add(key);
      }
      setHiddenWidgetKeys(nextHidden);
    } catch {
      setHiddenWidgetKeys(new Set());
    }
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        '/api/dashboard/widgets',
        { widget_key: widgetKey, is_visible: isVisible },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch {
      return false;
    }
  };

  const hideWidget = async (widgetKey: string) => {
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);
    const ok = await saveWidgetPreference(widgetKey, false);
    if (!ok) {
      setHiddenWidgetKeys(previous);
      openModal('Failed to hide this widget. Please try again.', 'Widget Update Failed');
    }
  };

  const [routes, setRoutes] = useState<MFRoute[]>([]);
  const [centers, setCenters] = useState<MFCenter[]>([]);
  const [groups, setGroups] = useState<MFGroup[]>([]);
  const [loanProducts, setLoanProducts] = useState<MFLoanProduct[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [fieldOfficers, setFieldOfficers] = useState<ManagerOption[]>([]);
  const [approvalEmployees, setApprovalEmployees] = useState<ManagerOption[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [customers, setCustomers] = useState<ExistingCustomer[]>([]);
  const [loanRequestNicknamesByCustomerNo, setLoanRequestNicknamesByCustomerNo] = useState<Record<string, string>>({});
  const [requestedLoansRaw, setRequestedLoansRaw] = useState<ExistingLoanRequest[]>([]);
  const [requestedLoanPreviews, setRequestedLoanPreviews] = useState<RequestedLoanPreview[]>([]);
  const [requestedLoanEditModal, setRequestedLoanEditModal] = useState<{
    open: boolean;
    loanId: number;
    activeStep: number;
    saving: boolean;
    form: RequestedLoanEditForm;
  }>({
    open: false,
    loanId: 0,
    activeStep: 1,
    saving: false,
    form: {
      loan_scope: 'center_loan',
      mf_route_id: 0,
      mf_center_id: 0,
      mf_group_id: 0,
      approval_employee_id: 0,
      customer_name: '',
      address: '',
      contact_no: '',
      manager_name: '',
      field_officer: '',
      group_leader: '',
      loan_amount: '0',
      interest_rate: '0',
      terms_count: '1',
      refundable_amount: '0',
      installment_amount: '0',
      document_charges: '0',
      stamp_charges: '0',
      insurance_charges: '0',
      charge_payment_mode: 'hand_cash',
      charges_collection_status: 'pending',
      refund_option: 'month',
      interest_type: 'flat',
      reason: '',
      loan_request_date: '',
      bank_name: '',
      bank_branch: '',
      bank_account_no: '',
    },
  });
  const [branchScopedRouteIds, setBranchScopedRouteIds] = useState<number[]>([]);
  const [branchScopedCenterIds, setBranchScopedCenterIds] = useState<number[]>([]);
  const [customerLookupQuery, setCustomerLookupQuery] = useState('');
  const [showCustomerLookupOptions, setShowCustomerLookupOptions] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(0);
  const [activeStep, setActiveStep] = useState(1);

  const [form, setForm] = useState({
    loan_scope: 'center_loan',
    loan_product_id: 0,
    mf_route_id: 0,
    mf_center_id: 0,
    mf_group_id: 0,
    manager_employee_id: 0,
    approval_employee_id: 0,
    manager_name: '',
    field_officer: '',
    group_leader: '',
    customer_no: '',
    customer_code: '',
    customer_name: '',
    nic: '',
    address: '',
    contact_no: '',
    loan_amount: '',
    reason: '',
    refund_option: 'month',
    assumed_month_days: 30,
    interest_type: 'flat',
    interest_rate: '',
    terms_count: '',
    refundable_amount: '',
    installment_amount: '',
    document_charges: '',
    stamp_charges: '',
    insurance_charges: '',
    charge_payment_mode: 'hand_cash',
    loan_request_date: new Date().toISOString().split('T')[0],
    charges_collection_status: 'pending',
  });

  const [guarantors, setGuarantors] = useState<Guarantor[]>([
    { name: '', nic: '', address: '', contact_no: '', relationship: '', image_file: null, signature_file: null },
  ]);
  const [customerRelationals, setCustomerRelationals] = useState<RegisterRelationalEntry[]>([
    { name: '', relationship: '', contact_no: '', signature_file: null },
  ]);
  const [customerRegisterDocuments, setCustomerRegisterDocuments] = useState<Record<string, File | null>>({});
  const [customerBankStatementFiles, setCustomerBankStatementFiles] = useState<File[]>([]);
  const [customerEpfReportFiles, setCustomerEpfReportFiles] = useState<File[]>([]);
  const [customerTaxReturnFiles, setCustomerTaxReturnFiles] = useState<File[]>([]);
  const [customerPaysheetFiles, setCustomerPaysheetFiles] = useState<File[]>([]);
  const [customerBusinessDocumentFiles, setCustomerBusinessDocumentFiles] = useState<File[]>([]);
  const [customerResidenceEnvironmentFiles, setCustomerResidenceEnvironmentFiles] = useState<File[]>([]);
  const [customerEnhancementForm, setCustomerEnhancementForm] = useState({
    family_members_count: '',
    dependents_count: '',
    spouse_name: '',
    spouse_nic: '',
    spouse_contact_no: '',
    emergency_contact_name: '',
    emergency_contact_no: '',
    monthly_expenses: '',
    savings_habit: '',
    repayment_behaviour: '',
    primary_bank_name: '',
    bank_branch: '',
    account_number: '',
    relationship_years: '',
    existing_loans: false,
    existing_loan_lender: '',
    existing_loan_outstanding: '',
    existing_loan_entries: [
      { institution: '', outstanding_balance: '', monthly_installment: '' },
    ] as ExistingLoanEntry[],
    monthly_loan_obligations: '',
    credit_score: '',
    credit_history_notes: '',
    evaluation_income_generation_activities: [] as string[],
    evaluation_business_1: '',
    evaluation_business_1_monthly_income: '',
    evaluation_business_2: '',
    evaluation_business_2_monthly_income: '',
    evaluation_loan_reason: '',
    evaluation_house_ownership: '',
    evaluation_house_roof_material: '',
    evaluation_house_wall_material: '',
    evaluation_house_floor_material: '',
    evaluation_vehicle_assets: '',
    evaluation_other_loans_details: '',
    evaluation_other_loans_monthly_installment: '',
    evaluation_leasing_details: '',
    evaluation_leasing_monthly_installment: '',
    evaluation_family_expense_breakdown: {} as Record<string, string>,
    evaluation_family_income_without_business: '',
    evaluation_family_income_item_1: '',
    evaluation_family_income_item_2: '',
    evaluation_family_income_item_3: '',
    evaluation_family_wage_earner_1_name: '',
    evaluation_family_wage_earner_1_salary: '',
    evaluation_family_wage_earner_2_name: '',
    evaluation_family_wage_earner_2_salary: '',
    evaluation_family_wage_earner_3_name: '',
    evaluation_family_wage_earner_3_salary: '',
    evaluation_family_rent_out_house: '',
    evaluation_family_rent_out_vehicle: '',
    evaluation_family_interest_commission: '',
    evaluation_family_other_income: '',
    evaluation_family_monthly_expenses: '',
    evaluation_family_monthly_income: '',
    evaluation_family_wage_contribution: '',
    evaluation_business_expense_breakdown: {} as Record<string, string>,
    evaluation_business_1_unit_selling_price: '',
    evaluation_business_1_units: '',
    evaluation_business_2_unit_selling_price: '',
    evaluation_business_2_units: '',
    evaluation_business_monthly_expenses: '',
    evaluation_business_monthly_income: '',
  });
  const [guarantorFinderQueryByIndex, setGuarantorFinderQueryByIndex] = useState<Record<number, string>>({});
  const [activeGuarantorFinderIndex, setActiveGuarantorFinderIndex] = useState<number | null>(null);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }),
    [token]
  );
  const loanCodeMetaKey = `${form.loan_scope}|${form.mf_route_id}|${form.mf_center_id}`;
  const steps = useMemo(
    () => [
      { id: 1, title: 'Location Mapping', hint: 'Scope, route, center, group' },
      { id: 2, title: 'Officer & Team', hint: 'Manager and field team details' },
      { id: 3, title: 'Customer Details', hint: 'Reference no, customer profile, NIC' },
      { id: 4, title: 'Family & Financial', hint: 'Family, financial behaviour, banking, credit' },
      { id: 5, title: 'Documents', hint: 'Upload customer support documents' },
      { id: 6, title: 'Residence Images', hint: 'Residence environment photos' },
      { id: 7, title: 'Evaluation', hint: 'Income, assets, liabilities, and cash flow' },
      { id: 8, title: 'Guarantors', hint: 'Guarantor information' },
      { id: 9, title: 'Loan Details', hint: 'Amount, terms, and charges' },
    ],
    []
  );
  const progressPercent = (activeStep / steps.length) * 100;

  const normalizeText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const incomeGenerationActivityOptions = [
    'Trading',
    'Services',
    'Production',
    'Crop Farming',
    'Animal Husbandry',
    'Fisheries',
    'Other',
  ];

  const familyExpenseRows = useMemo(
    () => [
      { no: '1', key: 'food', label: 'Food' },
      { no: '1.1', key: 'electricity', label: 'Electricity' },
      { no: '1.2', key: 'water', label: 'Water' },
      { no: '1.3', key: 'house_rent', label: 'House Rent' },
      { no: '1.4', key: 'cloths', label: 'Cloths' },
      { no: '1.5', key: 'health', label: 'Health' },
      { no: '1.6', key: 'education', label: 'Education' },
      { no: '1.7', key: 'mobile_telephone', label: 'Mobile/Telephone' },
      { no: '1.8', key: 'transport', label: 'Transport' },
      { no: '1.9', key: 'donation_social', label: 'Donation/Social' },
      { no: '1.10', key: 'other_consumption', label: 'Other Consumption' },
      { no: '1.11', key: 'entertainment', label: 'Entertainment' },
      { no: '1.12', key: 'insurance', label: 'Insurance' },
      { no: '2', key: 'family_expenses', label: 'Family Expenses' },
      { no: '3', key: 'other', label: 'Other' },
    ],
    []
  );

  const businessExpenseRows = useMemo(
    () => [
      { no: '1', key: 'raw_materials', label: 'Raw Materials' },
      { no: '1.1', key: 'cost_of_employees', label: 'Cost of Employees' },
      { no: '1.2', key: 'cost_of_fuel', label: 'Cost of Fuel' },
      { no: '1.3', key: 'rent', label: 'Rent' },
      { no: '1.4', key: 'electricity', label: 'Electricity' },
      { no: '1.5', key: 'water', label: 'Water' },
      { no: '1.6', key: 'mobile_telephone', label: 'Mobile/Telephone' },
      { no: '1.7', key: 'transport', label: 'Transport' },
      { no: '2', key: 'other', label: 'Other' },
    ],
    []
  );

  const familyExpenseTotal = familyExpenseRows.reduce((sum, row) => {
    const rawValue = customerEnhancementForm.evaluation_family_expense_breakdown?.[row.key] || '';
    const amount = Number(rawValue);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const businessExpenseTotal = businessExpenseRows.reduce((sum, row) => {
    const rawValue = customerEnhancementForm.evaluation_business_expense_breakdown?.[row.key] || '';
    const amount = Number(rawValue);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const updateFamilyExpenseValue = (key: string, value: string) => {
    setCustomerEnhancementForm((prev) => ({
      ...prev,
      evaluation_family_expense_breakdown: {
        ...(prev.evaluation_family_expense_breakdown || {}),
        [key]: value,
      },
    }));
  };

  const updateBusinessExpenseValue = (key: string, value: string) => {
    setCustomerEnhancementForm((prev) => ({
      ...prev,
      evaluation_business_expense_breakdown: {
        ...(prev.evaluation_business_expense_breakdown || {}),
        [key]: value,
      },
    }));
  };

  const addExistingLoanEntry = () => {
    setCustomerEnhancementForm((prev) => ({
      ...prev,
      existing_loan_entries: [
        ...(Array.isArray(prev.existing_loan_entries) ? prev.existing_loan_entries : []),
        { institution: '', outstanding_balance: '', monthly_installment: '' },
      ],
    }));
  };

  const updateExistingLoanEntry = (index: number, field: keyof ExistingLoanEntry, value: string) => {
    setCustomerEnhancementForm((prev) => ({
      ...prev,
      existing_loan_entries: (Array.isArray(prev.existing_loan_entries) ? prev.existing_loan_entries : []).map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: value,
            }
          : entry
      ),
    }));
  };

  const removeExistingLoanEntry = (index: number) => {
    setCustomerEnhancementForm((prev) => {
      const rows = (Array.isArray(prev.existing_loan_entries) ? prev.existing_loan_entries : []).filter((_, i) => i !== index);
      return {
        ...prev,
        existing_loan_entries:
          rows.length > 0 ? rows : [{ institution: '', outstanding_balance: '', monthly_installment: '' }],
      };
    });
  };

  const toAmount = (value: string) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  };

  const familyWageContributionTotal =
    toAmount(customerEnhancementForm.evaluation_family_wage_earner_1_salary) +
    toAmount(customerEnhancementForm.evaluation_family_wage_earner_2_salary) +
    toAmount(customerEnhancementForm.evaluation_family_wage_earner_3_salary);

  const business1IncomeTotal =
    toAmount(customerEnhancementForm.evaluation_business_1_unit_selling_price) *
    toAmount(customerEnhancementForm.evaluation_business_1_units);

  const business2IncomeTotal =
    toAmount(customerEnhancementForm.evaluation_business_2_unit_selling_price) *
    toAmount(customerEnhancementForm.evaluation_business_2_units);

  const businessIncomeTotal = business1IncomeTotal + business2IncomeTotal;

  const familyIncomeTotal =
    toAmount(customerEnhancementForm.evaluation_family_income_without_business) +
    toAmount(customerEnhancementForm.evaluation_family_income_item_1) +
    toAmount(customerEnhancementForm.evaluation_family_income_item_2) +
    toAmount(customerEnhancementForm.evaluation_family_income_item_3) +
    familyWageContributionTotal +
    toAmount(customerEnhancementForm.evaluation_family_rent_out_house) +
    toAmount(customerEnhancementForm.evaluation_family_rent_out_vehicle) +
    toAmount(customerEnhancementForm.evaluation_family_interest_commission) +
    toAmount(customerEnhancementForm.evaluation_family_other_income);

  const totalIncomeWithBusiness = familyIncomeTotal + businessIncomeTotal;
  const monthlyLoanInstallmentsTotal = toAmount(customerEnhancementForm.evaluation_other_loans_monthly_installment);
  const monthlyLeasingInstallmentsTotal = toAmount(customerEnhancementForm.evaluation_leasing_monthly_installment);
  const loanAndLeasingTotal = monthlyLoanInstallmentsTotal + monthlyLeasingInstallmentsTotal;
  const loanPaymentsAndFamilyExpensesTotal = familyExpenseTotal + loanAndLeasingTotal;
  const remainingCashWithFamily = totalIncomeWithBusiness - loanPaymentsAndFamilyExpensesTotal;
  const averageCashPerWeek = remainingCashWithFamily / 4;

  const existingLoanEntries = useMemo(
    () =>
      (Array.isArray(customerEnhancementForm.existing_loan_entries)
        ? customerEnhancementForm.existing_loan_entries
        : []) as ExistingLoanEntry[],
    [customerEnhancementForm.existing_loan_entries]
  );

  const normalizedExistingLoanEntries = useMemo(
    () =>
      existingLoanEntries
        .map((entry) => ({
          institution: String(entry.institution || '').trim(),
          outstanding_balance: String(entry.outstanding_balance || '').trim(),
          monthly_installment: String(entry.monthly_installment || '').trim(),
        }))
        .filter(
          (entry) =>
            entry.institution !== '' || entry.outstanding_balance !== '' || entry.monthly_installment !== ''
        ),
    [existingLoanEntries]
  );

  const monthlyLoanObligationsTotal = useMemo(
    () =>
      normalizedExistingLoanEntries.reduce((sum, entry) => {
        const installment = Number(entry.monthly_installment);
        return sum + (Number.isFinite(installment) ? installment : 0);
      }, 0),
    [normalizedExistingLoanEntries]
  );

  const toggleIncomeGenerationActivity = (activity: string) => {
    setCustomerEnhancementForm((prev) => {
      const current = Array.isArray(prev.evaluation_income_generation_activities)
        ? prev.evaluation_income_generation_activities
        : [];
      const exists = current.includes(activity);
      return {
        ...prev,
        evaluation_income_generation_activities: exists
          ? current.filter((item) => item !== activity)
          : [...current, activity],
      };
    });
  };

  const asRecord = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  };

  const hasValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return false;
  };

  const isCollectionOfficer = useMemo(() => {
    const designationName = normalizeText(String(authUser?.designation?.name || ''));
    const roleNames = (authUser?.roles || []).map((role) => normalizeText(String(role?.name || '')));

    if (designationName.includes('collection officer')) {
      return true;
    }

    return roleNames.some((name) => name.includes('collection officer'));
  }, [authUser]);

  const authUserCandidateNames = useMemo(() => {
    const fullEmployeeName = [authUser?.employee?.first_name || '', authUser?.employee?.last_name || '']
      .join(' ')
      .trim();

    return [
      String(authUser?.name || '').trim(),
      fullEmployeeName,
      String(authUser?.employee?.email || '').trim(),
      String(authUser?.email || '').trim(),
    ].filter((value, index, arr) => value !== '' && arr.indexOf(value) === index);
  }, [authUser]);

  const loggedInEmployeeOption = useMemo(() => {
    const authEmployeeId = Number(authUser?.employee?.id || 0);
    if (authEmployeeId > 0) {
      const directMatch = approvalEmployees.find((employee) => Number(employee.id) === authEmployeeId);
      if (directMatch) {
        return directMatch;
      }
    }

    const candidateNames = authUserCandidateNames.map((name) => normalizeText(name));
    return approvalEmployees.find((employee) => candidateNames.includes(normalizeText(employee.name))) || null;
  }, [approvalEmployees, authUser, authUserCandidateNames]);

  const loggedInBranchId = useMemo(() => {
    const candidates = [
      Number(authUser?.branch_id || 0),
      Number(authUser?.employee?.branch_id || 0),
      Number(authUser?.branch?.id || 0),
      Number(loggedInEmployeeOption?.branch_id || 0),
    ].filter((value) => value > 0);

    return candidates[0] || 0;
  }, [authUser, loggedInEmployeeOption]);

  const loggedInBranchName = useMemo(() => {
    const candidates = [
      String(authUser?.branch?.name || '').trim(),
      String(loggedInEmployeeOption?.branch || '').trim(),
    ].filter((value) => value !== '');

    return candidates[0] || '';
  }, [authUser, loggedInEmployeeOption]);

  const approvalBranchManagers = useMemo(() => {
    const managerSource = managers.length > 0
      ? managers
      : approvalEmployees.filter((employee) => normalizeText(employee.designation).includes('manager'));

    if (managerSource.length === 0) {
      return [] as ManagerOption[];
    }

    if (loggedInBranchId > 0) {
      const byBranchId = managerSource.filter((manager) => Number(manager.branch_id || 0) === loggedInBranchId);
      if (byBranchId.length > 0) {
        return byBranchId;
      }
    }

    if (loggedInBranchName) {
      const branchKey = normalizeText(loggedInBranchName);
      const byBranchName = managerSource.filter((manager) => normalizeText(manager.branch) === branchKey);
      if (byBranchName.length > 0) {
        return byBranchName;
      }
    }

    return managerSource;
  }, [approvalEmployees, managers, loggedInBranchId, loggedInBranchName]);

  const managerOptions = useMemo(
    () => (managers.length > 0 ? managers : approvalBranchManagers),
    [managers, approvalBranchManagers]
  );

  const hasSpecialLoanPermission = useMemo(() => {
    const keywords = ['admin', 'finance manager', 'branch manager', 'loan approver', 'special permission'];
    const designationName = normalizeText(String(authUser?.designation?.name || ''));
    const roleNames = (authUser?.roles || []).map((role) => normalizeText(String(role?.name || '')));

    if (keywords.some((keyword) => designationName.includes(keyword))) {
      return true;
    }

    return roleNames.some((name) => keywords.some((keyword) => name.includes(keyword)));
  }, [authUser]);

  useEffect(() => {
    if (approvalBranchManagers.length === 0) return;

    const preferredManagerId = Number(approvalBranchManagers[0].id || 0);
    if (preferredManagerId <= 0) return;

    setForm((prev) => {
      if (Number(prev.approval_employee_id || 0) === preferredManagerId) {
        return prev;
      }

      return {
        ...prev,
        approval_employee_id: preferredManagerId,
      };
    });
  }, [approvalBranchManagers]);

  useEffect(() => {
    if (managerOptions.length === 0) return;
    if (approvalEmployees.length === 0) return;

    const authUserId = Number(authUser?.id || 0);
    const authEmployeeId = Number(authUser?.employee?.id || 0);

    const currentEmployee =
      (authUserId > 0
        ? approvalEmployees.find((employee) => Number(employee.user_id || 0) === authUserId)
        : undefined) ||
      (authEmployeeId > 0
        ? approvalEmployees.find((employee) => Number(employee.id || 0) === authEmployeeId)
        : undefined);

    const normalizeName = (value: string) =>
      String(value || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

    const reportingPerson = normalizeName(String(currentEmployee?.reporting_person || ''));
    const managerFromReporting =
      reportingPerson !== ''
        ? managerOptions.find((manager) => normalizeName(manager.name) === reportingPerson)
        : undefined;

    const preferredManager = managerFromReporting || managerOptions[0];
    const preferredManagerId = Number(preferredManager.id || 0);
    if (preferredManagerId <= 0) return;

    setForm((prev) => {
      const currentId = Number(prev.manager_employee_id || 0);
      const currentName = String(prev.manager_name || '').trim();

      if (currentId === preferredManagerId && currentName === preferredManager.name) {
        return prev;
      }

      return {
        ...prev,
        manager_employee_id: preferredManagerId,
        manager_name: preferredManager.name,
      };
    });
  }, [managerOptions, approvalEmployees, authUser]);

  useEffect(() => {
    if (!requestedLoanEditModal.open) return;
    if (approvalBranchManagers.length === 0) return;

    const availableIds = new Set(approvalBranchManagers.map((manager) => Number(manager.id || 0)).filter((id) => id > 0));
    const currentId = Number(requestedLoanEditModal.form.approval_employee_id || 0);

    if (currentId > 0 && availableIds.has(currentId)) {
      return;
    }

    const preferredManagerId = Number(approvalBranchManagers[0].id || 0);
    if (preferredManagerId <= 0) return;

    setRequestedLoanEditModal((prev) => ({
      ...prev,
      form: {
        ...prev.form,
        approval_employee_id: preferredManagerId,
      },
    }));
  }, [requestedLoanEditModal.open, requestedLoanEditModal.form.approval_employee_id, approvalBranchManagers]);

  const normalizeCustomerNo = (value: string) => value.trim().toUpperCase();

  const selectedLoanProduct = useMemo(
    () => loanProducts.find((product) => product.id === Number(form.loan_product_id || 0)) || null,
    [loanProducts, form.loan_product_id]
  );

  const getLoanAmountRangeValidationMessage = useCallback(
    (loanAmountValue: string | number): string | null => {
      if (!selectedLoanProduct) {
        return null;
      }

      const loanAmount = Number(loanAmountValue || 0);
      if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
        return 'Not valid amount. Please enter a valid loan amount.';
      }

      const minLoanAmount = Number(selectedLoanProduct.min_loan_amount);
      const maxLoanAmount = Number(selectedLoanProduct.max_loan_amount);
      const hasMin = Number.isFinite(minLoanAmount);
      const hasMax = Number.isFinite(maxLoanAmount);

      if (hasMin && loanAmount < minLoanAmount) {
        return `Not valid amount. Loan amount must be at least ${minLoanAmount.toLocaleString('en-LK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} for ${selectedLoanProduct.name}.`;
      }

      if (hasMax && loanAmount > maxLoanAmount) {
        return `Not valid amount. Loan amount must not exceed ${maxLoanAmount.toLocaleString('en-LK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} for ${selectedLoanProduct.name}.`;
      }

      return null;
    },
    [selectedLoanProduct]
  );

  const handleLoanAmountBlur = () => {
    const message = getLoanAmountRangeValidationMessage(form.loan_amount);
    if (message) {
      openModal(message, 'Validation');
    }
  };

  const handleInterestRateChange = (value: string) => {
    const sanitized = sanitizeInterestRateInput(value);
    if (sanitized === null) {
      return;
    }

    setForm((prev) => ({ ...prev, interest_rate: sanitized }));
  };

  const handleInterestRateBlur = () => {
    setForm((prev) => {
      const finalized = finalizeInterestRate(prev.interest_rate);
      if (finalized === prev.interest_rate) {
        return prev;
      }

      return { ...prev, interest_rate: finalized };
    });
  };

  const applyLoanProduct = (productId: number) => {
    const selected = loanProducts.find((item) => item.id === productId);
    setForm((prev) => {
      if (!selected) {
        return {
          ...prev,
          loan_product_id: 0,
        };
      }

      const resolvedLoanAmountText = resolveLoanAmountFromProduct(selected) || prev.loan_amount || '0';
      const resolvedLoanAmount = Number(resolvedLoanAmountText || 0);

      return {
        ...prev,
        loan_product_id: selected.id,
        loan_amount: resolvedLoanAmountText,
        interest_rate: finalizeInterestRate(String(selected.interest_rate ?? '')) || '0',
        interest_type: selected.interest_type || 'flat',
        terms_count: String(selected.terms_count ?? ''),
        refund_option: selected.refund_option || 'month',
        assumed_month_days: Number(selected.assumed_month_days || 30),
        document_charges: calculateChargeFromPercentage(resolvedLoanAmount, selected.document_charge_percentage),
        stamp_charges: calculateChargeFromPercentage(resolvedLoanAmount, selected.stamp_charge_percentage),
        insurance_charges: calculateChargeFromPercentage(resolvedLoanAmount, selected.insurance_charge_percentage),
      };
    });
  };

  useEffect(() => {
    if (!selectedLoanProduct) {
      return;
    }

    const resolvedLoanAmount = Number(form.loan_amount || 0);
    const nextDocumentCharges = calculateChargeFromPercentage(
      resolvedLoanAmount,
      selectedLoanProduct.document_charge_percentage
    );
    const nextStampCharges = calculateChargeFromPercentage(
      resolvedLoanAmount,
      selectedLoanProduct.stamp_charge_percentage
    );
    const nextInsuranceCharges = calculateChargeFromPercentage(
      resolvedLoanAmount,
      selectedLoanProduct.insurance_charge_percentage
    );

    if (
      form.document_charges === nextDocumentCharges &&
      form.stamp_charges === nextStampCharges &&
      form.insurance_charges === nextInsuranceCharges
    ) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      document_charges: nextDocumentCharges,
      stamp_charges: nextStampCharges,
      insurance_charges: nextInsuranceCharges,
    }));
  }, [selectedLoanProduct, form.loan_amount, form.document_charges, form.stamp_charges, form.insurance_charges]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
    void fetchWidgetPreferences(storedToken);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser));
      } catch {
        setAuthUser(null);
      }
    } else {
      setAuthUser(null);
    }
  }, [router]);

  useEffect(() => {
    if (!isCollectionOfficer) return;
    if (fieldOfficers.length === 0) return;

    const authEmployeeId = Number(authUser?.employee?.id || 0);
    const candidateNames = authUserCandidateNames.map((name) => normalizeText(name));

    let matchedOfficer =
      authEmployeeId > 0 ? fieldOfficers.find((officer) => Number(officer.id) === authEmployeeId) : undefined;

    if (!matchedOfficer) {
      matchedOfficer = fieldOfficers.find((officer) => candidateNames.includes(normalizeText(officer.name)));
    }

    if (!matchedOfficer) {
      return;
    }

    setForm((prev) =>
      prev.field_officer === matchedOfficer.name
        ? prev
        : {
            ...prev,
            field_officer: matchedOfficer.name,
          }
    );
  }, [isCollectionOfficer, fieldOfficers, authUser, authUserCandidateNames]);

  useEffect(() => {
    if (!token) return;

    const loadMasterData = async () => {
      setManagersLoading(true);
      try {
        const [routeRes, centerRes, groupRes, loanProductRes, employeeRes, customerRes, loanRequestRes] = await Promise.all([
          axios.get(`${API_BASE}/microfinance/settings/routes`, { headers }),
          axios.get(`${API_BASE}/microfinance/settings/centers`, { headers }),
          axios.get(`${API_BASE}/microfinance/settings/groups`, { headers }),
          axios.get(`${API_BASE}/microfinance/settings/loan-products`, { headers }),
          axios.get(`${API_BASE}/hr/employees`, { headers }),
          axios.get(`${API_BASE}/customers`, { headers, params: { per_page: 1000 } }),
          axios.get(`${API_BASE}/microfinance/loan-requests`, { headers }),
        ]);

        setRoutes(routeRes.data || []);
        setCenters(centerRes.data || []);
        setGroups(groupRes.data || []);
        setLoanProducts(Array.isArray(loanProductRes.data) ? loanProductRes.data : []);

        const employeeRows = Array.isArray(employeeRes.data?.data) ? employeeRes.data.data : [];
        const mappedEmployees: ManagerOption[] = employeeRows
          .map((emp: unknown) => {
            const row = emp && typeof emp === 'object' ? (emp as Record<string, unknown>) : {};
            const designation =
              row.designation && typeof row.designation === 'object'
                ? (row.designation as Record<string, unknown>)
                : {};
            const branch = row.branch && typeof row.branch === 'object' ? (row.branch as Record<string, unknown>) : {};
            const user = row.user && typeof row.user === 'object' ? (row.user as Record<string, unknown>) : {};

            const firstName = String(row.first_name || '');
            const lastName = String(row.last_name || '');
            const fullName = `${firstName} ${lastName}`.trim();
            const branchName = String(branch.name || row.branch_name || '').trim();

            return {
              id: Number(row.id || 0),
              name: fullName || String(row.email || ''),
              designation: String(designation.name || ''),
              branch: branchName,
              branch_id: Number(branch.id || row.branch_id || 0),
              user_id: Number(user.id || 0),
              reporting_person: String(row.reporting_person || '').trim(),
            };
          })
          .filter((emp: ManagerOption) => emp.id > 0 && emp.name);

        const managerOnly = mappedEmployees.filter((emp) =>
          normalizeText(String(emp.designation || '')).includes('manager')
        );
        const officerOnly = mappedEmployees.filter((emp) => /officer/i.test(emp.designation));
        setManagers(managerOnly);
        setFieldOfficers(officerOnly.length > 0 ? officerOnly : mappedEmployees);
        setApprovalEmployees(mappedEmployees);

        const customerRows = Array.isArray(customerRes.data?.data) ? customerRes.data.data : [];
        setCustomers(customerRows);

        const loanRequestRows: ExistingLoanRequest[] = Array.isArray(loanRequestRes.data) ? loanRequestRes.data : [];
        const nicknameMap = loanRequestRows.reduce<Record<string, string>>((acc, request) => {
          const customerNo = normalizeCustomerNo(String(request.customer_no || ''));
          const nickName = String(request.nick_name || '').trim();

          if (customerNo && nickName) {
            acc[customerNo] = nickName;
          }

          return acc;
        }, {});

        const scopedRouteIdSet = new Set<number>();
        const scopedCenterIdSet = new Set<number>();

        loanRequestRows.forEach((request) => {
          const routeId = Number(request.mf_route_id || request.route?.id || 0);
          const centerId = Number(request.mf_center_id || request.center?.id || 0);

          if (routeId > 0) {
            scopedRouteIdSet.add(routeId);
          }

          if (centerId > 0) {
            scopedCenterIdSet.add(centerId);
          }
        });

        const previewRows = loanRequestRows
          .map((request) => {
            const id = Number(request.id || 0);
            const customerNo = normalizeCustomerNo(String(request.customer_no || ''));
            const customerName = String(request.customer_name || '').trim();
            const loanAmount = Number(request.loan_amount || 0);
            const status = String(request.status || '').trim() || 'unknown';
            const loanScope = String(request.loan_scope || '').trim() || 'unknown';
            const routeName = String(request.route?.name || '').trim() || '-';
            const centerName = String(request.center?.name || '').trim() || '-';
            const groupName = String(request.group?.name || '').trim() || '-';
            const requestDate = String(request.loan_request_date || '').slice(0, 10) || '-';

            return {
              id,
              customerNo,
              customerName,
              loanAmount: Number.isFinite(loanAmount) ? loanAmount : 0,
              status,
              loanScope,
              routeName,
              centerName,
              groupName,
              requestDate,
            } satisfies RequestedLoanPreview;
          })
          .filter((item) => item.id > 0)
          .sort((a, b) => {
            if (a.requestDate === b.requestDate) {
              return b.id - a.id;
            }
            return a.requestDate < b.requestDate ? 1 : -1;
          })
          .slice(0, 15);

        setLoanRequestNicknamesByCustomerNo(nicknameMap);
        setBranchScopedRouteIds(Array.from(scopedRouteIdSet));
        setBranchScopedCenterIds(Array.from(scopedCenterIdSet));
        setRequestedLoansRaw(loanRequestRows);
        setRequestedLoanPreviews(previewRows);
      } catch {
        openModal('Failed to load route/center/group data.', 'Error');
      } finally {
        setManagersLoading(false);
      }
    };

    loadMasterData();
  }, [token, headers]);

  useEffect(() => {
    const amount = Number(form.loan_amount || 0);
    const interest = Number(form.interest_rate || 0);
    const termCount = Number(form.terms_count || 0);
    const assumedMonthDays = Math.max(Number(form.assumed_month_days || 30), 1);
    const rateDecimal = interest / 100;
    let refundable = 0;
    let installment = 0;

    if (form.interest_type === 'reducing') {
      // Treat entered product rate as total for the full loan term.
      const periodicRate = termCount > 0 ? rateDecimal / termCount : 0;

      if (termCount > 0) {
        if (periodicRate > 0) {
          const factor = Math.pow(1 + periodicRate, termCount);
          installment = (amount * periodicRate * factor) / (factor - 1);
        } else {
          installment = amount / termCount;
        }
        refundable = installment * termCount;
      }
    } else {
      // Flat interest: for daily products, rate is applied by month-equivalent cycles.
      const effectiveTermMultiplier = form.refund_option === 'day'
        ? termCount / assumedMonthDays
        : 1;
      refundable = amount + amount * rateDecimal * effectiveTermMultiplier;
      installment = termCount > 0 ? refundable / termCount : 0;
    }

    setForm((prev) => ({
      ...prev,
      refundable_amount: refundable ? refundable.toFixed(2) : '',
      installment_amount: installment ? installment.toFixed(2) : '',
    }));
  }, [form.loan_amount, form.interest_rate, form.terms_count, form.interest_type, form.refund_option, form.assumed_month_days]);

  useEffect(() => {
    if (!token) return;

    if (form.loan_scope === 'route_loan' && !form.mf_route_id) {
      setForm((prev) => ({ ...prev, customer_no: '' }));
      return;
    }

    if (form.loan_scope === 'center_loan' && (!form.mf_route_id || !form.mf_center_id)) {
      setForm((prev) => ({ ...prev, customer_no: '' }));
      return;
    }

    const loadCustomerNo = async () => {
      try {
        const response = await axios.get(`${API_BASE}/microfinance/loan-requests/meta`, {
          headers,
          params: {
            loan_scope: form.loan_scope,
            mf_route_id: form.mf_route_id || null,
            mf_center_id: form.mf_center_id || null,
          },
        });

        setForm((prev) => ({ ...prev, customer_no: response.data.reference_no || response.data.customer_no || '' }));
      } catch {
        setForm((prev) => ({ ...prev, customer_no: '' }));
      }
    };

    loadCustomerNo();
  }, [loanCodeMetaKey, token, headers, form.loan_scope, form.mf_route_id, form.mf_center_id]);

  const branchScopedCenterSet = useMemo(() => new Set(branchScopedCenterIds), [branchScopedCenterIds]);
  const branchScopedRouteSet = useMemo(() => new Set(branchScopedRouteIds), [branchScopedRouteIds]);

  const branchCenters = useMemo(() => {
    if (branchScopedCenterSet.size === 0) {
      return centers;
    }

    return centers.filter((center) => branchScopedCenterSet.has(center.id));
  }, [centers, branchScopedCenterSet]);

  const routeCandidatesForBranch = useMemo(() => {
    if (branchScopedRouteSet.size === 0 && branchCenters.length === centers.length) {
      return routes;
    }

    const derivedRouteIds = new Set<number>();
    branchCenters.forEach((center) => {
      if (center.mf_route_id > 0) {
        derivedRouteIds.add(center.mf_route_id);
      }
    });

    branchScopedRouteIds.forEach((id) => {
      if (id > 0) {
        derivedRouteIds.add(id);
      }
    });

    if (derivedRouteIds.size === 0) {
      return routes;
    }

    return routes.filter((route) => derivedRouteIds.has(route.id));
  }, [routes, centers.length, branchCenters, branchScopedRouteIds, branchScopedRouteSet]);

  const filteredCenters = branchCenters.filter((center) =>
    form.mf_route_id ? center.mf_route_id === form.mf_route_id : true
  );
  const filteredGroups = groups.filter(
    (g) => g.mf_route_id === form.mf_route_id && g.mf_center_id === form.mf_center_id
  );
  const selectedRoute = routes.find((r) => r.id === form.mf_route_id);
  const selectedCenter = centers.find((c) => c.id === form.mf_center_id);
  const selectedGroup = groups.find((g) => g.id === form.mf_group_id);
  const termUnitLabel = form.refund_option === 'day' ? 'Days' : form.refund_option === 'week' ? 'Weeks' : 'Months';
  const activeGuarantorCount = guarantors.filter((g) => g.name.trim() !== '').length;
  const totalCharges =
    Number(form.document_charges || 0) +
    Number(form.stamp_charges || 0) +
    Number(form.insurance_charges || 0);
  const netDisbursedAmount = form.charge_payment_mode === 'deduct_from_loan'
    ? Math.max(Number(form.loan_amount || 0) - totalCharges, 0)
    : Number(form.loan_amount || 0);
  const balanceAmount = netDisbursedAmount;

  const guarantorLookupOptions = useMemo<GuarantorLookupOption[]>(() => {
    const unique = new Map<string, GuarantorLookupOption>();

    customers.forEach((customer) => {
      const firstName = String(customer.first_name || '').trim();
      const lastName = String(customer.last_name || '').trim();
      const name = `${firstName} ${lastName}`.trim();
      const nic = String(customer.nic_passport || '').trim();

      if (!name || !nic) {
        return;
      }

      const key = `${name.toLowerCase()}|${nic.toLowerCase()}`;
      if (unique.has(key)) {
        return;
      }

      unique.set(key, {
        id: Number(customer.id || 0),
        name,
        nic,
        address: String(customer.current_address || customer.permanent_address || '').trim(),
        contact_no: String(customer.phone || '').trim(),
      });
    });

    return Array.from(unique.values());
  }, [customers]);

  const findGuarantorMatches = (query: string) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];

    return guarantorLookupOptions
      .filter((option) =>
        option.name.toLowerCase().includes(keyword) || option.nic.toLowerCase().includes(keyword)
      )
      .slice(0, 8);
  };

  const getCustomerDisplayName = useCallback((customer: ExistingCustomer) => {
    const fullNameWithInitials = String(customer.full_name_with_initials || '').trim();
    if (fullNameWithInitials) {
      return fullNameWithInitials;
    }

    const directName = String(customer.customer_name || '').trim();
    if (directName) {
      return directName;
    }

    const first = String(customer.first_name || '').trim();
    const last = String(customer.last_name || '').trim();
    return `${first} ${last}`.trim();
  }, []);

  const customerLookupOptions = useMemo(() => {
    const keyword = normalizeText(customerLookupQuery);

    const mapped = customers
      .map((customer) => {
        const customerCode = normalizeCustomerNo(String(customer.customer_code || ''));
        const nic = String(customer.nic_passport || '').trim();
        const name = getCustomerDisplayName(customer);
        const phone = String(customer.phone || '').trim();
        const searchBlob = normalizeText([customerCode, name, nic, phone].filter(Boolean).join(' '));

        return {
          customer,
          name,
          customerCode,
          nic,
          searchBlob,
        };
      })
      .filter((entry) => entry.name || entry.customerCode || entry.nic);

    const filtered = keyword
      ? mapped.filter((entry) => entry.searchBlob.includes(keyword))
      : mapped;

    return filtered.slice(0, 10);
  }, [customers, customerLookupQuery, getCustomerDisplayName]);

  const fillCustomerFromRecord = useCallback(
    (customer: ExistingCustomer) => {
      const fullName = getCustomerDisplayName(customer);
      const address = (customer.current_address || customer.permanent_address || '').trim();
      const customerCode = normalizeCustomerNo(String(customer.customer_code || ''));
      const nic = String(customer.nic_passport || '').trim();

      setForm((prev) => ({
        ...prev,
        customer_code: customerCode || prev.customer_code,
        nic: nic || prev.nic,
        customer_name: fullName || prev.customer_name,
        nick_name:
          (customer.nick_name || '').trim() ||
          loanRequestNicknamesByCustomerNo[customerCode] ||
          '',
        address: address || prev.address,
        contact_no: customer.phone || prev.contact_no,
      }));
      setSelectedCustomerId(Number(customer.id || 0));
      setCustomerLookupQuery([customerCode, fullName, nic].filter(Boolean).join(' | '));
      setShowCustomerLookupOptions(false);
    },
    [loanRequestNicknamesByCustomerNo, getCustomerDisplayName]
  );

  const applyCustomerFromSuggestion = (customer: ExistingCustomer) => {
    fillCustomerFromRecord(customer);
    setShowCustomerLookupOptions(false);
  };

  const selectedCustomer = useMemo(
    () => customers.find((customer) => Number(customer.id) === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const updateCustomerRelational = (
    index: number,
    field: 'name' | 'relationship' | 'contact_no' | 'signature_file',
    value: string | File | null
  ) => {
    setCustomerRelationals((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              [field]: value,
            }
          : entry
      )
    );
  };

  const addCustomerRelational = () => {
    setCustomerRelationals((prev) => [...prev, { name: '', relationship: '', contact_no: '', signature_file: null }]);
  };

  const removeCustomerRelational = (index: number) => {
    setCustomerRelationals((prev) => {
      if (prev.length <= 1) {
        return [{ name: '', relationship: '', contact_no: '', signature_file: null }];
      }
      return prev.filter((_, entryIndex) => entryIndex !== index);
    });
  };

  useEffect(() => {
    if (!selectedCustomer) return;

    const details = asRecord(selectedCustomer.additional_details);
    const family = asRecord(details.family_information);
    const financial = asRecord(details.financial_behaviour);
    const banking = asRecord(details.banking_relationships);
    const existingLoans = asRecord(details.existing_loans);
    const creditHistory = asRecord(details.credit_history);
    const existingLoanRowsRaw = Array.isArray(existingLoans.loans)
      ? existingLoans.loans
      : Array.isArray(existingLoans.entries)
      ? existingLoans.entries
      : [];

    const hydratedExistingLoanEntries = existingLoanRowsRaw
      .map((row) => asRecord(row))
      .map((row) => ({
        institution: String(row.institution ?? row.lender ?? row.provider ?? ''),
        outstanding_balance:
          row.outstanding_balance === null || row.outstanding_balance === undefined
            ? ''
            : String(row.outstanding_balance),
        monthly_installment:
          row.monthly_installment === null || row.monthly_installment === undefined
            ? row.installment === null || row.installment === undefined
              ? ''
              : String(row.installment)
            : String(row.monthly_installment),
      }))
      .filter(
        (row) =>
          row.institution.trim() !== '' || row.outstanding_balance.trim() !== '' || row.monthly_installment.trim() !== ''
      );

    const firstHydratedExistingLoan = hydratedExistingLoanEntries[0] || {
      institution: String(existingLoans.lender || ''),
      outstanding_balance:
        existingLoans.outstanding_balance === null || existingLoans.outstanding_balance === undefined
          ? ''
          : String(existingLoans.outstanding_balance),
      monthly_installment: String(selectedCustomer.monthly_loan_obligations ?? ''),
    };
    const evaluation = asRecord(details.evaluation);
    const familyExpenseBreakdown = asRecord(evaluation.family_expense_breakdown);
    const businessExpenseBreakdown = asRecord(evaluation.business_expense_breakdown);
    const familyWageEarners = Array.isArray(evaluation.family_wage_earners)
      ? evaluation.family_wage_earners
      : [];

    const wage1 = familyWageEarners[0] && typeof familyWageEarners[0] === 'object'
      ? (familyWageEarners[0] as Record<string, unknown>)
      : {};
    const wage2 = familyWageEarners[1] && typeof familyWageEarners[1] === 'object'
      ? (familyWageEarners[1] as Record<string, unknown>)
      : {};
    const wage3 = familyWageEarners[2] && typeof familyWageEarners[2] === 'object'
      ? (familyWageEarners[2] as Record<string, unknown>)
      : {};

    const incomeGenerationActivities = Array.isArray(evaluation.income_generation_activities)
      ? evaluation.income_generation_activities.map((entry) => String(entry || '')).filter(Boolean)
      : typeof evaluation.income_generation_activities === 'string'
        ? String(evaluation.income_generation_activities)
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    const relationalsSource = Array.isArray(family.relationals) ? family.relationals : [];
    setCustomerRelationals(
      relationalsSource.length > 0
        ? relationalsSource.map((entry: unknown) => {
            const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
            return {
              name: String(row.name || ''),
              relationship: String(row.relationship || ''),
              contact_no: String(row.contact_no || ''),
              signature_file: null,
            };
          })
        : [{ name: '', relationship: '', contact_no: '', signature_file: null }]
    );

    setCustomerEnhancementForm((prev) => ({
      ...prev,
      family_members_count:
        family.family_members_count === null || family.family_members_count === undefined
          ? ''
          : String(family.family_members_count),
      dependents_count:
        family.dependents_count === null || family.dependents_count === undefined
          ? ''
          : String(family.dependents_count),
      spouse_name: String(family.spouse_name || ''),
      spouse_nic: String(family.spouse_nic || ''),
      spouse_contact_no: String(family.spouse_contact_no || ''),
      emergency_contact_name: String(family.emergency_contact_name || ''),
      emergency_contact_no: String(family.emergency_contact_no || ''),
      monthly_expenses:
        financial.monthly_expenses === null || financial.monthly_expenses === undefined
          ? ''
          : String(financial.monthly_expenses),
      savings_habit: String(financial.savings_habit || ''),
      repayment_behaviour: String(financial.repayment_behaviour || ''),
      primary_bank_name: String(banking.primary_bank_name || ''),
      bank_branch: String(banking.bank_branch || ''),
      account_number: String(banking.account_number || ''),
      relationship_years:
        banking.relationship_years === null || banking.relationship_years === undefined
          ? ''
          : String(banking.relationship_years),
      existing_loans: Boolean(existingLoans.has_existing_loans),
      existing_loan_lender: firstHydratedExistingLoan.institution,
      existing_loan_outstanding: firstHydratedExistingLoan.outstanding_balance,
      existing_loan_entries:
        hydratedExistingLoanEntries.length > 0
          ? hydratedExistingLoanEntries
          : [
              {
                institution: firstHydratedExistingLoan.institution,
                outstanding_balance: firstHydratedExistingLoan.outstanding_balance,
                monthly_installment: firstHydratedExistingLoan.monthly_installment,
              },
            ],
      monthly_loan_obligations: String(
        hydratedExistingLoanEntries.length > 0
          ? hydratedExistingLoanEntries.reduce((sum, row) => {
              const amount = Number(row.monthly_installment);
              return sum + (Number.isFinite(amount) ? amount : 0);
            }, 0)
          : selectedCustomer.monthly_loan_obligations ?? ''
      ),
      credit_score: String(selectedCustomer.credit_score ?? ''),
      credit_history_notes: String(creditHistory.notes || ''),
      evaluation_income_generation_activities: incomeGenerationActivities,
      evaluation_business_1: String(evaluation.business_1 || ''),
      evaluation_business_1_monthly_income:
        evaluation.business_1_monthly_income === null || evaluation.business_1_monthly_income === undefined
          ? ''
          : String(evaluation.business_1_monthly_income),
      evaluation_business_2: String(evaluation.business_2 || ''),
      evaluation_business_2_monthly_income:
        evaluation.business_2_monthly_income === null || evaluation.business_2_monthly_income === undefined
          ? ''
          : String(evaluation.business_2_monthly_income),
      evaluation_loan_reason: String(evaluation.loan_reason || ''),
      evaluation_house_ownership: String(evaluation.house_ownership || ''),
      evaluation_house_roof_material: String(evaluation.house_roof_material || ''),
      evaluation_house_wall_material: String(evaluation.house_wall_material || ''),
      evaluation_house_floor_material: String(evaluation.house_floor_material || ''),
      evaluation_vehicle_assets: String(evaluation.vehicle_assets || ''),
      evaluation_other_loans_details: String(evaluation.other_loans_details || ''),
      evaluation_other_loans_monthly_installment:
        evaluation.other_loans_monthly_installment === null || evaluation.other_loans_monthly_installment === undefined
          ? ''
          : String(evaluation.other_loans_monthly_installment),
      evaluation_leasing_details: String(evaluation.leasing_details || ''),
      evaluation_leasing_monthly_installment:
        evaluation.leasing_monthly_installment === null || evaluation.leasing_monthly_installment === undefined
          ? ''
          : String(evaluation.leasing_monthly_installment),
      evaluation_family_expense_breakdown: familyExpenseRows.reduce((acc, row) => {
        acc[row.key] = String(familyExpenseBreakdown[row.key] ?? '');
        return acc;
      }, {} as Record<string, string>),
      evaluation_family_income_without_business:
        evaluation.family_income_without_business === null || evaluation.family_income_without_business === undefined
          ? ''
          : String(evaluation.family_income_without_business),
      evaluation_family_income_item_1:
        evaluation.family_income_item_1 === null || evaluation.family_income_item_1 === undefined
          ? ''
          : String(evaluation.family_income_item_1),
      evaluation_family_income_item_2:
        evaluation.family_income_item_2 === null || evaluation.family_income_item_2 === undefined
          ? ''
          : String(evaluation.family_income_item_2),
      evaluation_family_income_item_3:
        evaluation.family_income_item_3 === null || evaluation.family_income_item_3 === undefined
          ? ''
          : String(evaluation.family_income_item_3),
      evaluation_family_wage_earner_1_name: String(evaluation.family_wage_earner_1_name ?? wage1.name ?? ''),
      evaluation_family_wage_earner_1_salary:
        evaluation.family_wage_earner_1_salary === null || evaluation.family_wage_earner_1_salary === undefined
          ? String(wage1.salary ?? '')
          : String(evaluation.family_wage_earner_1_salary),
      evaluation_family_wage_earner_2_name: String(evaluation.family_wage_earner_2_name ?? wage2.name ?? ''),
      evaluation_family_wage_earner_2_salary:
        evaluation.family_wage_earner_2_salary === null || evaluation.family_wage_earner_2_salary === undefined
          ? String(wage2.salary ?? '')
          : String(evaluation.family_wage_earner_2_salary),
      evaluation_family_wage_earner_3_name: String(evaluation.family_wage_earner_3_name ?? wage3.name ?? ''),
      evaluation_family_wage_earner_3_salary:
        evaluation.family_wage_earner_3_salary === null || evaluation.family_wage_earner_3_salary === undefined
          ? String(wage3.salary ?? '')
          : String(evaluation.family_wage_earner_3_salary),
      evaluation_family_rent_out_house:
        evaluation.family_rent_out_house === null || evaluation.family_rent_out_house === undefined
          ? ''
          : String(evaluation.family_rent_out_house),
      evaluation_family_rent_out_vehicle:
        evaluation.family_rent_out_vehicle === null || evaluation.family_rent_out_vehicle === undefined
          ? ''
          : String(evaluation.family_rent_out_vehicle),
      evaluation_family_interest_commission:
        evaluation.family_interest_commission === null || evaluation.family_interest_commission === undefined
          ? ''
          : String(evaluation.family_interest_commission),
      evaluation_family_other_income:
        evaluation.family_other_income === null || evaluation.family_other_income === undefined
          ? ''
          : String(evaluation.family_other_income),
      evaluation_business_expense_breakdown: businessExpenseRows.reduce((acc, row) => {
        acc[row.key] = String(businessExpenseBreakdown[row.key] ?? '');
        return acc;
      }, {} as Record<string, string>),
      evaluation_business_1_unit_selling_price:
        evaluation.business_1_unit_selling_price === null || evaluation.business_1_unit_selling_price === undefined
          ? ''
          : String(evaluation.business_1_unit_selling_price),
      evaluation_business_1_units:
        evaluation.business_1_units === null || evaluation.business_1_units === undefined
          ? ''
          : String(evaluation.business_1_units),
      evaluation_business_2_unit_selling_price:
        evaluation.business_2_unit_selling_price === null || evaluation.business_2_unit_selling_price === undefined
          ? ''
          : String(evaluation.business_2_unit_selling_price),
      evaluation_business_2_units:
        evaluation.business_2_units === null || evaluation.business_2_units === undefined
          ? ''
          : String(evaluation.business_2_units),
      evaluation_family_monthly_expenses:
        evaluation.family_monthly_expenses === null || evaluation.family_monthly_expenses === undefined
          ? ''
          : String(evaluation.family_monthly_expenses),
      evaluation_family_monthly_income:
        evaluation.family_monthly_income === null || evaluation.family_monthly_income === undefined
          ? ''
          : String(evaluation.family_monthly_income),
      evaluation_family_wage_contribution:
        evaluation.family_wage_contribution === null || evaluation.family_wage_contribution === undefined
          ? ''
          : String(evaluation.family_wage_contribution),
      evaluation_business_monthly_expenses:
        evaluation.business_monthly_expenses === null || evaluation.business_monthly_expenses === undefined
          ? String(businessExpenseTotal || '')
          : String(evaluation.business_monthly_expenses),
      evaluation_business_monthly_income:
        evaluation.business_monthly_income === null || evaluation.business_monthly_income === undefined
          ? String(businessIncomeTotal || '')
          : String(evaluation.business_monthly_income),
    }));

    setCustomerRegisterDocuments({});
    setCustomerBankStatementFiles([]);
    setCustomerEpfReportFiles([]);
    setCustomerTaxReturnFiles([]);
    setCustomerPaysheetFiles([]);
    setCustomerBusinessDocumentFiles([]);
    setCustomerResidenceEnvironmentFiles([]);
  }, [selectedCustomer, familyExpenseRows, businessExpenseRows, businessExpenseTotal, businessIncomeTotal]);

  const buildCustomerProfilePayload = () => {
    const selectedDetails = asRecord(selectedCustomer?.additional_details);

    const additionalDetails = {
      ...selectedDetails,
      existing_loan_entries: normalizedExistingLoanEntries.map((entry) => ({
        institution: entry.institution || null,
        outstanding_balance: entry.outstanding_balance === '' ? null : Number(entry.outstanding_balance),
        monthly_installment: entry.monthly_installment === '' ? null : Number(entry.monthly_installment),
      })),
      family_information: {
        ...asRecord(selectedDetails.family_information),
        family_members_count:
          customerEnhancementForm.family_members_count === '' ? null : Number(customerEnhancementForm.family_members_count),
        dependents_count:
          customerEnhancementForm.dependents_count === '' ? null : Number(customerEnhancementForm.dependents_count),
        spouse_name: customerEnhancementForm.spouse_name.trim() || null,
        spouse_nic: customerEnhancementForm.spouse_nic.trim() || null,
        spouse_contact_no: customerEnhancementForm.spouse_contact_no.trim() || null,
        emergency_contact_name: customerEnhancementForm.emergency_contact_name.trim() || null,
        emergency_contact_no: customerEnhancementForm.emergency_contact_no.trim() || null,
        relationals: customerRelationals
          .filter(
            (entry) =>
              entry.name.trim() !== '' ||
              entry.relationship.trim() !== '' ||
              entry.contact_no.trim() !== '' ||
              entry.signature_file instanceof File
          )
          .map((entry) => ({
            name: entry.name.trim() || null,
            relationship: entry.relationship.trim() || null,
            contact_no: entry.contact_no.trim() || null,
            signature_file_name: entry.signature_file ? entry.signature_file.name : null,
          })),
      },
      financial_behaviour: {
        ...asRecord(selectedDetails.financial_behaviour),
        monthly_expenses: customerEnhancementForm.monthly_expenses === '' ? null : Number(customerEnhancementForm.monthly_expenses),
        savings_habit: customerEnhancementForm.savings_habit.trim() || null,
        repayment_behaviour: customerEnhancementForm.repayment_behaviour.trim() || null,
      },
      banking_relationships: {
        ...asRecord(selectedDetails.banking_relationships),
        primary_bank_name: customerEnhancementForm.primary_bank_name.trim() || null,
        bank_branch: customerEnhancementForm.bank_branch.trim() || null,
        account_number: customerEnhancementForm.account_number.trim() || null,
        relationship_years: customerEnhancementForm.relationship_years === '' ? null : Number(customerEnhancementForm.relationship_years),
      },
      existing_loans: {
        ...asRecord(selectedDetails.existing_loans),
        has_existing_loans: customerEnhancementForm.existing_loans,
        loans: normalizedExistingLoanEntries.map((entry) => ({
          institution: entry.institution || null,
          lender: entry.institution || null,
          outstanding_balance: entry.outstanding_balance === '' ? null : Number(entry.outstanding_balance),
          monthly_installment: entry.monthly_installment === '' ? null : Number(entry.monthly_installment),
        })),
        lender: normalizedExistingLoanEntries[0]?.institution || null,
        outstanding_balance:
          normalizedExistingLoanEntries[0]?.outstanding_balance === '' || !normalizedExistingLoanEntries[0]
            ? null
            : Number(normalizedExistingLoanEntries[0].outstanding_balance),
        monthly_obligations_total: monthlyLoanObligationsTotal,
      },
      credit_history: {
        ...asRecord(selectedDetails.credit_history),
        credit_score: customerEnhancementForm.credit_score === '' ? null : Number(customerEnhancementForm.credit_score),
        notes: customerEnhancementForm.credit_history_notes.trim() || null,
      },
      risk_assessment: {
        ...asRecord(selectedDetails.risk_assessment),
      },
      evaluation: {
        ...asRecord(selectedDetails.evaluation),
        payload_version: EVALUATION_PAYLOAD_VERSION,
        income_generation_activities: customerEnhancementForm.evaluation_income_generation_activities,
        business_1: customerEnhancementForm.evaluation_business_1.trim() || null,
        business_1_monthly_income:
          customerEnhancementForm.evaluation_business_1_monthly_income === ''
            ? null
            : Number(customerEnhancementForm.evaluation_business_1_monthly_income),
        business_2: customerEnhancementForm.evaluation_business_2.trim() || null,
        business_2_monthly_income:
          customerEnhancementForm.evaluation_business_2_monthly_income === ''
            ? null
            : Number(customerEnhancementForm.evaluation_business_2_monthly_income),
        loan_reason: customerEnhancementForm.evaluation_loan_reason.trim() || null,
        house_ownership: customerEnhancementForm.evaluation_house_ownership || null,
        house_roof_material: customerEnhancementForm.evaluation_house_roof_material || null,
        house_wall_material: customerEnhancementForm.evaluation_house_wall_material || null,
        house_floor_material: customerEnhancementForm.evaluation_house_floor_material || null,
        vehicle_assets: customerEnhancementForm.evaluation_vehicle_assets.trim() || null,
        other_loans_details: customerEnhancementForm.evaluation_other_loans_details.trim() || null,
        other_loans_monthly_installment:
          customerEnhancementForm.evaluation_other_loans_monthly_installment === ''
            ? null
            : Number(customerEnhancementForm.evaluation_other_loans_monthly_installment),
        leasing_details: customerEnhancementForm.evaluation_leasing_details.trim() || null,
        leasing_monthly_installment:
          customerEnhancementForm.evaluation_leasing_monthly_installment === ''
            ? null
            : Number(customerEnhancementForm.evaluation_leasing_monthly_installment),
        family_expense_breakdown: familyExpenseRows.reduce((acc, row) => {
          const value = String(customerEnhancementForm.evaluation_family_expense_breakdown?.[row.key] || '').trim();
          acc[row.key] = value === '' ? null : Number(value);
          return acc;
        }, {} as Record<string, number | null>),
        family_income_without_business:
          customerEnhancementForm.evaluation_family_income_without_business === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_income_without_business),
        family_income_item_1:
          customerEnhancementForm.evaluation_family_income_item_1 === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_income_item_1),
        family_income_item_2:
          customerEnhancementForm.evaluation_family_income_item_2 === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_income_item_2),
        family_income_item_3:
          customerEnhancementForm.evaluation_family_income_item_3 === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_income_item_3),
        family_wage_earner_1_name: customerEnhancementForm.evaluation_family_wage_earner_1_name.trim() || null,
        family_wage_earner_1_salary:
          customerEnhancementForm.evaluation_family_wage_earner_1_salary === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_wage_earner_1_salary),
        family_wage_earner_2_name: customerEnhancementForm.evaluation_family_wage_earner_2_name.trim() || null,
        family_wage_earner_2_salary:
          customerEnhancementForm.evaluation_family_wage_earner_2_salary === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_wage_earner_2_salary),
        family_wage_earner_3_name: customerEnhancementForm.evaluation_family_wage_earner_3_name.trim() || null,
        family_wage_earner_3_salary:
          customerEnhancementForm.evaluation_family_wage_earner_3_salary === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_wage_earner_3_salary),
        family_wage_earners: [
          {
            name: customerEnhancementForm.evaluation_family_wage_earner_1_name.trim() || null,
            salary:
              customerEnhancementForm.evaluation_family_wage_earner_1_salary === ''
                ? null
                : Number(customerEnhancementForm.evaluation_family_wage_earner_1_salary),
          },
          {
            name: customerEnhancementForm.evaluation_family_wage_earner_2_name.trim() || null,
            salary:
              customerEnhancementForm.evaluation_family_wage_earner_2_salary === ''
                ? null
                : Number(customerEnhancementForm.evaluation_family_wage_earner_2_salary),
          },
          {
            name: customerEnhancementForm.evaluation_family_wage_earner_3_name.trim() || null,
            salary:
              customerEnhancementForm.evaluation_family_wage_earner_3_salary === ''
                ? null
                : Number(customerEnhancementForm.evaluation_family_wage_earner_3_salary),
          },
        ],
        family_rent_out_house:
          customerEnhancementForm.evaluation_family_rent_out_house === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_rent_out_house),
        family_rent_out_vehicle:
          customerEnhancementForm.evaluation_family_rent_out_vehicle === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_rent_out_vehicle),
        family_interest_commission:
          customerEnhancementForm.evaluation_family_interest_commission === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_interest_commission),
        family_other_income:
          customerEnhancementForm.evaluation_family_other_income === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_other_income),
        family_monthly_expenses:
          familyExpenseRows.some((row) => String(customerEnhancementForm.evaluation_family_expense_breakdown?.[row.key] || '').trim() !== '')
            ? familyExpenseTotal
            : customerEnhancementForm.evaluation_family_monthly_expenses === ''
            ? null
            : Number(customerEnhancementForm.evaluation_family_monthly_expenses),
        family_monthly_income: familyIncomeTotal,
        family_wage_contribution: familyWageContributionTotal,
        business_expense_breakdown: businessExpenseRows.reduce((acc, row) => {
          const value = String(customerEnhancementForm.evaluation_business_expense_breakdown?.[row.key] || '').trim();
          acc[row.key] = value === '' ? null : Number(value);
          return acc;
        }, {} as Record<string, number | null>),
        business_1_unit_selling_price:
          customerEnhancementForm.evaluation_business_1_unit_selling_price === ''
            ? null
            : Number(customerEnhancementForm.evaluation_business_1_unit_selling_price),
        business_1_units:
          customerEnhancementForm.evaluation_business_1_units === ''
            ? null
            : Number(customerEnhancementForm.evaluation_business_1_units),
        business_1_income: business1IncomeTotal,
        business_2_unit_selling_price:
          customerEnhancementForm.evaluation_business_2_unit_selling_price === ''
            ? null
            : Number(customerEnhancementForm.evaluation_business_2_unit_selling_price),
        business_2_units:
          customerEnhancementForm.evaluation_business_2_units === ''
            ? null
            : Number(customerEnhancementForm.evaluation_business_2_units),
        business_2_income: business2IncomeTotal,
        total_family_expenses_a: familyExpenseTotal,
        total_income_family_b: totalIncomeWithBusiness,
        total_loans_and_leasing_c: loanAndLeasingTotal,
        loan_payments_and_family_expenses_d: loanPaymentsAndFamilyExpensesTotal,
        remaining_cash_with_family_e: remainingCashWithFamily,
        average_cash_per_week: averageCashPerWeek,
        business_monthly_expenses:
          businessExpenseRows.some((row) => String(customerEnhancementForm.evaluation_business_expense_breakdown?.[row.key] || '').trim() !== '')
            ? businessExpenseTotal
            : customerEnhancementForm.evaluation_business_monthly_expenses === ''
            ? null
            : Number(customerEnhancementForm.evaluation_business_monthly_expenses),
        business_monthly_income: businessIncomeTotal,
      },
      employment: {
        ...asRecord(selectedDetails.employment),
        paysheet_files_count: customerPaysheetFiles.length,
        paysheet_file_names: customerPaysheetFiles.map((file) => file.name),
        bank_statement_files_count: customerBankStatementFiles.length,
        bank_statement_file_names: customerBankStatementFiles.map((file) => file.name),
        epf_report_files_count: customerEpfReportFiles.length,
        epf_report_file_names: customerEpfReportFiles.map((file) => file.name),
        tax_return_files_count: customerTaxReturnFiles.length,
        tax_return_file_names: customerTaxReturnFiles.map((file) => file.name),
      },
      business_information: {
        ...asRecord(selectedDetails.business_information),
        business_documents_count: customerBusinessDocumentFiles.length,
        business_document_names: customerBusinessDocumentFiles.map((file) => file.name),
      },
      residence_environment: {
        ...asRecord(selectedDetails.residence_environment),
        images_count: customerResidenceEnvironmentFiles.length,
        image_names: customerResidenceEnvironmentFiles.map((file) => file.name),
      },
    };

    const onboardingPayload = {
      ...(asRecord((selectedCustomer as ExistingCustomer & { onboarding_payload?: unknown })?.onboarding_payload)),
      step_3: {
        family_members_count: customerEnhancementForm.family_members_count || null,
        dependents_count: customerEnhancementForm.dependents_count || null,
        spouse_name: customerEnhancementForm.spouse_name.trim() || null,
        spouse_nic: customerEnhancementForm.spouse_nic.trim() || null,
        spouse_contact_no: customerEnhancementForm.spouse_contact_no.trim() || null,
        emergency_contact_name: customerEnhancementForm.emergency_contact_name.trim() || null,
        emergency_contact_no: customerEnhancementForm.emergency_contact_no.trim() || null,
        relationals: customerRelationals.map((entry) => ({
          name: entry.name.trim() || null,
          relationship: entry.relationship.trim() || null,
          contact_no: entry.contact_no.trim() || null,
          signature_file_name: entry.signature_file ? entry.signature_file.name : null,
        })),
        monthly_expenses: customerEnhancementForm.monthly_expenses || null,
        savings_habit: customerEnhancementForm.savings_habit.trim() || null,
        repayment_behaviour: customerEnhancementForm.repayment_behaviour.trim() || null,
        primary_bank_name: customerEnhancementForm.primary_bank_name.trim() || null,
        bank_branch: customerEnhancementForm.bank_branch.trim() || null,
        account_number: customerEnhancementForm.account_number.trim() || null,
        relationship_years: customerEnhancementForm.relationship_years || null,
        existing_loans: customerEnhancementForm.existing_loans,
        existing_loan_entries: normalizedExistingLoanEntries.map((entry) => ({
          institution: entry.institution || null,
          outstanding_balance: entry.outstanding_balance || null,
          monthly_installment: entry.monthly_installment || null,
        })),
        existing_loan_lender: normalizedExistingLoanEntries[0]?.institution || null,
        existing_loan_outstanding: normalizedExistingLoanEntries[0]?.outstanding_balance || null,
        monthly_loan_obligations:
          normalizedExistingLoanEntries.length > 0 ? monthlyLoanObligationsTotal.toFixed(2) : customerEnhancementForm.monthly_loan_obligations || null,
        credit_score: customerEnhancementForm.credit_score || null,
        credit_history_notes: customerEnhancementForm.credit_history_notes.trim() || null,
      },
      step_4: {
        register_documents: Object.entries(customerRegisterDocuments)
          .filter(([, file]) => file instanceof File)
          .map(([label, file]) => ({ label, file_name: (file as File).name })),
        bank_statement_file_names: customerBankStatementFiles.map((file) => file.name),
        epf_report_file_names: customerEpfReportFiles.map((file) => file.name),
        tax_return_file_names: customerTaxReturnFiles.map((file) => file.name),
      },
      step_5: {
        residence_environment_image_names: customerResidenceEnvironmentFiles.map((file) => file.name),
      },
      step_6: {
        payload_version: EVALUATION_PAYLOAD_VERSION,
        income_generation_activities: customerEnhancementForm.evaluation_income_generation_activities,
        business_1: customerEnhancementForm.evaluation_business_1.trim() || null,
        business_1_monthly_income: customerEnhancementForm.evaluation_business_1_monthly_income || null,
        business_2: customerEnhancementForm.evaluation_business_2.trim() || null,
        business_2_monthly_income: customerEnhancementForm.evaluation_business_2_monthly_income || null,
        loan_reason: customerEnhancementForm.evaluation_loan_reason.trim() || null,
        house_ownership: customerEnhancementForm.evaluation_house_ownership || null,
        house_roof_material: customerEnhancementForm.evaluation_house_roof_material || null,
        house_wall_material: customerEnhancementForm.evaluation_house_wall_material || null,
        house_floor_material: customerEnhancementForm.evaluation_house_floor_material || null,
        vehicle_assets: customerEnhancementForm.evaluation_vehicle_assets.trim() || null,
        other_loans_details: customerEnhancementForm.evaluation_other_loans_details.trim() || null,
        other_loans_monthly_installment: customerEnhancementForm.evaluation_other_loans_monthly_installment || null,
        leasing_details: customerEnhancementForm.evaluation_leasing_details.trim() || null,
        leasing_monthly_installment: customerEnhancementForm.evaluation_leasing_monthly_installment || null,
        family_expense_breakdown: familyExpenseRows.reduce((acc, row) => {
          acc[row.key] = String(customerEnhancementForm.evaluation_family_expense_breakdown?.[row.key] || '').trim() || null;
          return acc;
        }, {} as Record<string, string | null>),
        family_income_without_business: customerEnhancementForm.evaluation_family_income_without_business || null,
        family_income_item_1: customerEnhancementForm.evaluation_family_income_item_1 || null,
        family_income_item_2: customerEnhancementForm.evaluation_family_income_item_2 || null,
        family_income_item_3: customerEnhancementForm.evaluation_family_income_item_3 || null,
        family_wage_earner_1_name: customerEnhancementForm.evaluation_family_wage_earner_1_name.trim() || null,
        family_wage_earner_1_salary: customerEnhancementForm.evaluation_family_wage_earner_1_salary || null,
        family_wage_earner_2_name: customerEnhancementForm.evaluation_family_wage_earner_2_name.trim() || null,
        family_wage_earner_2_salary: customerEnhancementForm.evaluation_family_wage_earner_2_salary || null,
        family_wage_earner_3_name: customerEnhancementForm.evaluation_family_wage_earner_3_name.trim() || null,
        family_wage_earner_3_salary: customerEnhancementForm.evaluation_family_wage_earner_3_salary || null,
        family_wage_earners: [
          {
            name: customerEnhancementForm.evaluation_family_wage_earner_1_name.trim() || null,
            salary: customerEnhancementForm.evaluation_family_wage_earner_1_salary || null,
          },
          {
            name: customerEnhancementForm.evaluation_family_wage_earner_2_name.trim() || null,
            salary: customerEnhancementForm.evaluation_family_wage_earner_2_salary || null,
          },
          {
            name: customerEnhancementForm.evaluation_family_wage_earner_3_name.trim() || null,
            salary: customerEnhancementForm.evaluation_family_wage_earner_3_salary || null,
          },
        ],
        family_rent_out_house: customerEnhancementForm.evaluation_family_rent_out_house || null,
        family_rent_out_vehicle: customerEnhancementForm.evaluation_family_rent_out_vehicle || null,
        family_interest_commission: customerEnhancementForm.evaluation_family_interest_commission || null,
        family_other_income: customerEnhancementForm.evaluation_family_other_income || null,
        family_monthly_expenses:
          familyExpenseRows.some((row) => String(customerEnhancementForm.evaluation_family_expense_breakdown?.[row.key] || '').trim() !== '')
            ? familyExpenseTotal.toFixed(2)
            : customerEnhancementForm.evaluation_family_monthly_expenses || null,
        family_monthly_income: familyIncomeTotal.toFixed(2),
        family_wage_contribution: familyWageContributionTotal.toFixed(2),
        business_expense_breakdown: businessExpenseRows.reduce((acc, row) => {
          acc[row.key] = String(customerEnhancementForm.evaluation_business_expense_breakdown?.[row.key] || '').trim() || null;
          return acc;
        }, {} as Record<string, string | null>),
        business_1_unit_selling_price: customerEnhancementForm.evaluation_business_1_unit_selling_price || null,
        business_1_units: customerEnhancementForm.evaluation_business_1_units || null,
        business_1_income: business1IncomeTotal.toFixed(2),
        business_2_unit_selling_price: customerEnhancementForm.evaluation_business_2_unit_selling_price || null,
        business_2_units: customerEnhancementForm.evaluation_business_2_units || null,
        business_2_income: business2IncomeTotal.toFixed(2),
        total_family_expenses_a: familyExpenseTotal.toFixed(2),
        total_income_family_b: totalIncomeWithBusiness.toFixed(2),
        total_loans_and_leasing_c: loanAndLeasingTotal.toFixed(2),
        loan_payments_and_family_expenses_d: loanPaymentsAndFamilyExpensesTotal.toFixed(2),
        remaining_cash_with_family_e: remainingCashWithFamily.toFixed(2),
        average_cash_per_week: averageCashPerWeek.toFixed(2),
        business_monthly_expenses:
          businessExpenseRows.some((row) => String(customerEnhancementForm.evaluation_business_expense_breakdown?.[row.key] || '').trim() !== '')
            ? businessExpenseTotal.toFixed(2)
            : customerEnhancementForm.evaluation_business_monthly_expenses || null,
        business_monthly_income: businessIncomeTotal.toFixed(2),
      },
      completed_steps: 6,
      submitted_at: new Date().toISOString(),
    };

    return {
      additional_details: additionalDetails,
      onboarding_payload: onboardingPayload,
      existing_loans: customerEnhancementForm.existing_loans,
      monthly_loan_obligations:
        normalizedExistingLoanEntries.length > 0
          ? monthlyLoanObligationsTotal
          : customerEnhancementForm.monthly_loan_obligations === ''
          ? null
          : Number(customerEnhancementForm.monthly_loan_obligations),
      credit_score: customerEnhancementForm.credit_score === '' ? null : Number(customerEnhancementForm.credit_score),
    };
  };

  const uploadCustomerSupportDocuments = async (customerId: number) => {
    const uploadEntries: Array<{ documentType: string; file: File }> = [];

    Object.entries(customerRegisterDocuments).forEach(([documentType, file]) => {
      if (file instanceof File) {
        uploadEntries.push({ documentType, file });
      }
    });

    customerBankStatementFiles.forEach((file, index) => uploadEntries.push({ documentType: `Bank Statement ${index + 1}`, file }));
    customerEpfReportFiles.forEach((file, index) => uploadEntries.push({ documentType: `EPF Report ${index + 1}`, file }));
    customerTaxReturnFiles.forEach((file, index) => uploadEntries.push({ documentType: `Tax Return ${index + 1}`, file }));
    customerPaysheetFiles.forEach((file, index) => uploadEntries.push({ documentType: `Paysheet ${index + 1}`, file }));
    customerBusinessDocumentFiles.forEach((file, index) => uploadEntries.push({ documentType: `Business Document ${index + 1}`, file }));
    customerResidenceEnvironmentFiles.forEach((file, index) =>
      uploadEntries.push({ documentType: `Residence Environment Image ${index + 1}`, file })
    );

    customerRelationals.forEach((entry, index) => {
      if (entry.signature_file instanceof File) {
        const suffix = entry.name.trim() || `Relational ${index + 1}`;
        uploadEntries.push({ documentType: `Relational Signature - ${suffix}`, file: entry.signature_file });
      }
    });

    for (const entry of uploadEntries) {
      const formData = new FormData();
      formData.append('document_type', entry.documentType);
      formData.append('file', entry.file);
      await axios.post(`${API_BASE}/customers/${customerId}/documents`, formData, {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data',
        },
      });
    }
  };

  const customerProfileCompletionScore = useMemo(() => {
    if (!selectedCustomer) return 0;

    const details = asRecord(selectedCustomer.additional_details);
    const identity = asRecord(details.identity);
    const contact = asRecord(details.contact);
    const residence = asRecord(details.residence);
    const employment = asRecord(details.employment);
    const family = asRecord(details.family_information);
    const banking = asRecord(details.banking_relationships);
    const risk = asRecord(details.risk_assessment);
    const residenceEnvironment = asRecord(details.residence_environment);
    const fullName = getCustomerDisplayName(selectedCustomer);
    const relationals = Array.isArray(family.relationals) ? family.relationals : [];

    const checks = [
      hasValue(selectedCustomer.customer_code),
      hasValue(identity.full_name_with_initials) || hasValue(fullName),
      hasValue(selectedCustomer.phone),
      hasValue(selectedCustomer.nic_passport) || hasValue(selectedCustomer.old_nic),
      hasValue(selectedCustomer.current_address) || hasValue(selectedCustomer.permanent_address) || hasValue(residence.current_address),
      hasValue(contact.second_mobile),
      hasValue(contact.office_phone),
      hasValue(contact.whatsapp_number),
      hasValue(contact.emergency_contact),
      hasValue(contact.preferred_communication_method),
      hasValue(employment.employment_type),
      hasValue(employment.employer_name),
      hasValue(employment.monthly_salary),
      relationals.length > 0,
      hasValue(banking.primary_bank_name),
      hasValue(risk.total_score),
      Number(residenceEnvironment.images_count || 0) > 0,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [selectedCustomer, getCustomerDisplayName]);

  useEffect(() => {
    if (!form.mf_center_id) {
      return;
    }

    const selected = centers.find((center) => center.id === form.mf_center_id);
    if (!selected || !selected.mf_route_id) {
      return;
    }

    if (selected.mf_route_id === form.mf_route_id) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      mf_route_id: selected.mf_route_id,
      mf_group_id: 0,
    }));
  }, [form.mf_center_id, form.mf_route_id, centers]);

  const addGuarantor = () => {
    setGuarantors((prev) => [
      ...prev,
      { name: '', nic: '', address: '', contact_no: '', relationship: '', image_file: null, signature_file: null },
    ]);
  };

  const removeGuarantor = (index: number) => {
    setGuarantors((prev) => prev.filter((_, i) => i !== index));
    setGuarantorFinderQueryByIndex((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const currentIndex = Number(key);
        if (currentIndex < index) {
          next[currentIndex] = value;
        } else if (currentIndex > index) {
          next[currentIndex - 1] = value;
        }
      });
      return next;
    });
    if (activeGuarantorFinderIndex === index) {
      setActiveGuarantorFinderIndex(null);
    }
  };

  const updateGuarantor = (index: number, field: GuarantorTextField, value: string) => {
    setGuarantors((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };

  const updateGuarantorFile = async (index: number, field: 'image_file' | 'signature_file', file: File | null) => {
    if (!file) {
      setGuarantors((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: null } : g)));
      return;
    }

    if (!isAllowedImageType(file)) {
      openModal('Only JPG, JPEG, PNG, and WEBP images are allowed for guarantor media.', 'Validation');
      return;
    }

    try {
      const optimizedFile = await compressImageIfNeeded(file, CUSTOMER_PHOTO_MAX_BYTES);
      if (optimizedFile.size > CUSTOMER_PHOTO_MAX_BYTES) {
        openModal('Selected guarantor image/signature is too large. Please use an image under 5 MB.', 'Validation');
        return;
      }

      setGuarantors((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: optimizedFile } : g)));
    } catch {
      openModal('Unable to process this guarantor file. Please choose another image.', 'Validation');
    }
  };

  const applyGuarantorFromFinder = (index: number, option: GuarantorLookupOption) => {
    setGuarantors((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              name: option.name,
              nic: option.nic,
              contact_no: option.contact_no || row.contact_no,
              address: option.address || row.address,
            }
          : row
      )
    );

    setGuarantorFinderQueryByIndex((prev) => ({
      ...prev,
      [index]: `${option.name} (${option.nic})`,
    }));
    setActiveGuarantorFinderIndex(null);
  };

  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if ((form.loan_scope === 'route_loan' || form.loan_scope === 'center_loan') && !form.mf_route_id) {
        return 'Please select a route to continue.';
      }

      if (form.loan_scope === 'center_loan' && !form.mf_center_id) {
        return 'Please select a center to continue.';
      }

      if (form.loan_scope === 'center_loan' && !form.mf_group_id) {
        return 'Please select a group to continue.';
      }
    }

    if (step === 2) {
      if (!form.manager_employee_id) {
        return 'Please select a manager to continue.';
      }

      if (!form.approval_employee_id) {
        return 'Please select an approval employee to continue.';
      }

      if (!form.field_officer.trim()) {
        return 'Please select a field officer to continue.';
      }
    }

    if (step === 3) {
      if (!selectedCustomerId || !form.customer_code.trim()) {
        return 'Please select an existing customer using customer number, NIC, or name.';
      }
    }

    if (step === 9) {
      if (!form.loan_amount || Number(form.loan_amount) <= 0) {
        return 'Please enter a valid loan amount.';
      }

      const loanAmountRangeMessage = getLoanAmountRangeValidationMessage(form.loan_amount);
      if (loanAmountRangeMessage) {
        return loanAmountRangeMessage;
      }

      const finalizedInterestRate = finalizeInterestRate(form.interest_rate);
      if (!finalizedInterestRate || Number(finalizedInterestRate) < 0) {
        return 'Please enter a valid interest rate.';
      }

      if (!form.terms_count || Number(form.terms_count) < 1) {
        return 'Please enter terms count.';
      }

      if (!form.loan_request_date) {
        return 'Please select loan request date.';
      }
    }

    return null;
  };

  const handleNextStep = () => {
    const error = validateStep(activeStep);
    if (error) {
      openModal(error, 'Validation');
      return;
    }

    setActiveStep((prev) => Math.min(prev + 1, steps.length));
  };

  const handleStepClick = (stepId: number) => {
    if (stepId <= activeStep) {
      setActiveStep(stepId);
      return;
    }

    const error = validateStep(activeStep);
    if (error) {
      openModal(error, 'Validation');
      return;
    }

    setActiveStep(stepId);
  };

  const validateBeforeSubmit = () => {
    for (let i = 1; i <= steps.length; i += 1) {
      const error = validateStep(i);
      if (error) {
        setActiveStep(i);
        openModal(error, 'Validation');
        return false;
      }
    }

    return true;
  };

  const submitLoanRequest = async () => {
    setLoading(true);

    try {
      if (!selectedCustomerId) {
        openModal('Please select an existing customer before submitting the loan request.', 'Validation');
        return;
      }

      const customerProfilePayload = buildCustomerProfilePayload();
      await axios.put(`${API_BASE}/customers/${selectedCustomerId}`, customerProfilePayload, { headers });
      await uploadCustomerSupportDocuments(selectedCustomerId);

      setCustomers((prev) =>
        prev.map((customer) =>
          Number(customer.id) === Number(selectedCustomerId)
            ? {
                ...customer,
                additional_details: customerProfilePayload.additional_details as Record<string, unknown>,
                existing_loans: customerProfilePayload.existing_loans as boolean,
                monthly_loan_obligations: customerProfilePayload.monthly_loan_obligations as number | null,
                credit_score: customerProfilePayload.credit_score as number | null,
              }
            : customer
        )
      );

      const loanResponse = await axios.post(
        `${API_BASE}/microfinance/loan-requests`,
        {
          ...form,
          reference_no: form.customer_no,
          evaluation_payload_version: EVALUATION_PAYLOAD_VERSION,
          evaluation_payload: asRecord((customerProfilePayload.additional_details as Record<string, unknown>)?.evaluation),
          customer_no: normalizeCustomerNo(form.customer_code),
          customer_code: normalizeCustomerNo(form.customer_code),
          selected_customer_id: selectedCustomerId,
          branch_id: Number(authUser?.branch_id || authUser?.employee?.branch_id || authUser?.branch?.id || 0) || null,
          approval_employee_id: Number(form.approval_employee_id || 0),
          loan_scope: form.loan_scope,
          mf_route_id: form.mf_route_id || null,
          mf_center_id: form.mf_center_id || null,
          mf_group_id: form.mf_group_id || null,
          manager_employee_id: Number(form.manager_employee_id || 0),
          loan_amount: Number(form.loan_amount),
          interest_rate: Number(finalizeInterestRate(form.interest_rate)),
          terms_count: Number(form.terms_count),
          refundable_amount: Number(form.refundable_amount),
          installment_amount: Number(form.installment_amount),
          document_charges: Number(form.document_charges || 0),
          stamp_charges: Number(form.stamp_charges || 0),
          insurance_charges: Number(form.insurance_charges || 0),
          charge_payment_mode: form.charge_payment_mode,
          charges_collection_status: form.charges_collection_status,
          interest_type: form.interest_type,
          assumed_month_days: Number(form.assumed_month_days || 30),
          customer_profile_payload: customerProfilePayload,
          guarantors: guarantors
            .filter((g) => g.name.trim() !== '')
            .map((g) => ({
              name: g.name,
              nic: g.nic,
              address: g.address,
              contact_no: g.contact_no,
              relationship: g.relationship,
            })),
        },
        { headers }
      );
      const portalCredentials = loanResponse?.data?.customer_portal_credentials || null;

      const loanId = loanResponse?.data?.id;
      const createdGuarantors = Array.isArray(loanResponse?.data?.guarantors) ? loanResponse.data.guarantors : [];
      if (loanId) {
        const activeGuarantors = guarantors.filter((g) => g.name.trim() !== '');

        for (const [index, guarantor] of activeGuarantors.entries()) {
          const createdGuarantor = createdGuarantors[index];
          if (!createdGuarantor?.id) {
            continue;
          }

          if (guarantor.image_file || guarantor.signature_file) {
            const guarantorMediaFormData = new FormData();
            if (guarantor.image_file) {
              guarantorMediaFormData.append('image', guarantor.image_file);
            }
            if (guarantor.signature_file) {
              guarantorMediaFormData.append('signature', guarantor.signature_file);
            }

            await axios.post(
              `${API_BASE}/microfinance/loan-requests/${loanId}/guarantors/${createdGuarantor.id}/media`,
              guarantorMediaFormData,
              {
                headers: {
                  ...headers,
                  'Content-Type': 'multipart/form-data',
                },
              }
            );
          }
        }

      }

      const baseSuccessMessage = 'Loan request registered successfully.';
      let accountMessage = '';
      if (portalCredentials?.is_new_account && portalCredentials?.email && portalCredentials?.password) {
        accountMessage = ` Customer portal account created. Email: ${portalCredentials.email} | Temporary Password: ${portalCredentials.password}`;
      } else if (portalCredentials?.email) {
        accountMessage = ` Customer portal account is already linked. Email: ${portalCredentials.email}`;
      }

      openModal(
        `${baseSuccessMessage}${accountMessage}`,
        'Success',
        () => {
          router.push('/dashboard/microfinance/loans');
        }
      );
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to register loan request.';
      openModal(message, 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBeforeSubmit()) {
      return;
    }

    void submitLoanRequest();
  };

  const showStepPanel = !hiddenWidgetKeys.has(`${widgetPrefix}step_panel`);
  const showStep1 = !hiddenWidgetKeys.has(`${widgetPrefix}step_1_location_mapping`);
  const showStep2 = !hiddenWidgetKeys.has(`${widgetPrefix}step_2_officer_team`);
  const showStep3 = !hiddenWidgetKeys.has(`${widgetPrefix}step_3_customer_details`);
  const showStep4 = !hiddenWidgetKeys.has(`${widgetPrefix}step_4_family_financial`);
  const showStep5 = !hiddenWidgetKeys.has(`${widgetPrefix}step_5_documents`);
  const showStep6 = !hiddenWidgetKeys.has(`${widgetPrefix}step_6_residence_images`);
  const showStep7 = !hiddenWidgetKeys.has(`${widgetPrefix}step_7_risk_assessment`);
  const showStep8 = !hiddenWidgetKeys.has(`${widgetPrefix}step_8_guarantors`);
  const showStep9 = !hiddenWidgetKeys.has(`${widgetPrefix}step_9_loan_details`);
  const showLiveSummary = !hiddenWidgetKeys.has(`${widgetPrefix}live_summary`);
  const isActiveStepVisible =
    (activeStep === 1 && showStep1) ||
    (activeStep === 2 && showStep2) ||
    (activeStep === 3 && showStep3) ||
    (activeStep === 4 && showStep4) ||
    (activeStep === 5 && showStep5) ||
    (activeStep === 6 && showStep6) ||
    (activeStep === 7 && showStep7) ||
    (activeStep === 8 && showStep8) ||
    (activeStep === 9 && showStep9);

  const isStep3AttentionActive =
    activeStep === 3 &&
    (
      !selectedCustomer ||
      (customerProfileCompletionScore < STEP3_CONTINUE_MIN_COMPLETION && !hasSpecialLoanPermission)
    );

  const showRequestedLoanPreview = !hiddenWidgetKeys.has(`${widgetPrefix}requested_loan_preview`);

  const requestedLoanPreviewRows = useMemo(() => {
    const requestedRows = requestedLoanPreviews.filter(
      (row) => normalizeText(row.status) === 'requested'
    );

    return requestedRows.length > 0 ? requestedRows : requestedLoanPreviews;
  }, [requestedLoanPreviews]);

  const currentRequestedEditLoan = useMemo(
    () => requestedLoansRaw.find((item) => Number(item.id || 0) === requestedLoanEditModal.loanId) || null,
    [requestedLoansRaw, requestedLoanEditModal.loanId]
  );

  const requestedLoanEditSteps = useMemo(
    () => [
      { id: 1, title: 'Location Mapping', hint: 'Scope, route, center, group' },
      { id: 2, title: 'Officer & Team', hint: 'Manager and field team details' },
      { id: 3, title: 'Customer Details', hint: 'Customer profile details' },
      { id: 4, title: 'Guarantors', hint: 'Guarantor information' },
      { id: 5, title: 'Loan Details', hint: 'Amount, terms, and charges' },
    ],
    []
  );

  const requestedLoanEditProgress = (requestedLoanEditModal.activeStep / requestedLoanEditSteps.length) * 100;

  const requestedLoanEditFilteredCenters = useMemo(
    () =>
      centers.filter((center) =>
        requestedLoanEditModal.form.mf_route_id ? center.mf_route_id === requestedLoanEditModal.form.mf_route_id : true
      ),
    [centers, requestedLoanEditModal.form.mf_route_id]
  );

  const requestedLoanEditFilteredGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          group.mf_route_id === requestedLoanEditModal.form.mf_route_id &&
          group.mf_center_id === requestedLoanEditModal.form.mf_center_id
      ),
    [groups, requestedLoanEditModal.form.mf_route_id, requestedLoanEditModal.form.mf_center_id]
  );

  const setRequestedLoanEditField = <K extends keyof RequestedLoanEditForm>(field: K, value: RequestedLoanEditForm[K]) => {
    setRequestedLoanEditModal((prev) => ({
      ...prev,
      form: {
        ...prev.form,
        [field]: value,
      },
    }));
  };

  const validateRequestedLoanEditStep = (stepId: number): string | null => {
    const modalForm = requestedLoanEditModal.form;

    if (stepId === 1) {
      if ((modalForm.loan_scope === 'route_loan' || modalForm.loan_scope === 'center_loan') && !modalForm.mf_route_id) {
        return 'Please select a route.';
      }
      if (modalForm.loan_scope === 'center_loan' && !modalForm.mf_center_id) {
        return 'Please select a center.';
      }
      if (modalForm.loan_scope === 'center_loan' && !modalForm.mf_group_id) {
        return 'Please select a group.';
      }
    }

    if (stepId === 2) {
      if (!modalForm.manager_name.trim()) return 'Please select a manager.';
      if (!modalForm.field_officer.trim()) return 'Please select a field officer.';
      if (!modalForm.approval_employee_id) return 'Please select Request Approval To employee.';
    }

    if (stepId === 3) {
      if (!modalForm.customer_name.trim() || !modalForm.address.trim() || !modalForm.contact_no.trim()) {
        return 'Customer name, address, and contact are required.';
      }
    }

    if (stepId === 5) {
      if (Number(modalForm.loan_amount || 0) <= 0) return 'Please enter a valid loan amount.';
      if (Number(modalForm.terms_count || 0) < 1) return 'Please enter valid terms count.';
      if (Number(modalForm.interest_rate || 0) < 0) return 'Please enter a valid interest rate.';
    }

    return null;
  };

  const goToRequestedLoanEditStep = (stepId: number) => {
    if (stepId <= requestedLoanEditModal.activeStep) {
      setRequestedLoanEditModal((prev) => ({ ...prev, activeStep: stepId }));
      return;
    }

    const error = validateRequestedLoanEditStep(requestedLoanEditModal.activeStep);
    if (error) {
      openModal(error, 'Validation');
      return;
    }

    setRequestedLoanEditModal((prev) => ({ ...prev, activeStep: stepId }));
  };

  const nextRequestedLoanEditStep = () => {
    const error = validateRequestedLoanEditStep(requestedLoanEditModal.activeStep);
    if (error) {
      openModal(error, 'Validation');
      return;
    }

    setRequestedLoanEditModal((prev) => ({
      ...prev,
      activeStep: Math.min(prev.activeStep + 1, requestedLoanEditSteps.length),
    }));
  };

  const prevRequestedLoanEditStep = () => {
    setRequestedLoanEditModal((prev) => ({ ...prev, activeStep: Math.max(prev.activeStep - 1, 1) }));
  };

  const openRequestedLoanEditModal = (loanId: number) => {
    const target = requestedLoansRaw.find((loan) => Number(loan.id || 0) === loanId);
    if (!target) {
      openModal('Unable to find the selected loan record.', 'Edit Loan');
      return;
    }

    const chargePaymentMode = target.charge_payment_mode === 'deduct_from_loan' ? 'deduct_from_loan' : 'hand_cash';
    const collectionStatus = target.charges_collection_status === 'done' ? 'done' : 'pending';
    const refundOption = target.refund_option === 'day' || target.refund_option === 'week' || target.refund_option === 'month'
      ? target.refund_option
      : 'month';
    const interestType = target.interest_type === 'reducing' ? 'reducing' : 'flat';

    setRequestedLoanEditModal({
      open: true,
      loanId,
      activeStep: 1,
      saving: false,
      form: {
        loan_scope:
          target.loan_scope === 'route_loan' || target.loan_scope === 'direct_loan'
            ? target.loan_scope
            : 'center_loan',
        mf_route_id: Number(target.mf_route_id || target.route?.id || 0),
        mf_center_id: Number(target.mf_center_id || target.center?.id || 0),
        mf_group_id: Number(target.group?.id || 0),
        approval_employee_id: Number(target.approval_employee_id || 0),
        customer_name: String(target.customer_name || '').trim(),
        address: String(target.address || '').trim(),
        contact_no: String(target.contact_no || '').trim(),
        manager_name: String(target.manager_name || '').trim(),
        field_officer: String(target.field_officer || '').trim(),
        group_leader: String(target.group_leader || '').trim(),
        loan_amount: String(Number(target.loan_amount || 0)),
        interest_rate: String(Number(target.interest_rate || 0)),
        terms_count: String(Math.max(Number(target.terms_count || 1), 1)),
        refundable_amount: String(Number(target.refundable_amount || 0)),
        installment_amount: String(Number(target.installment_amount || 0)),
        document_charges: String(Number(target.document_charges || 0)),
        stamp_charges: String(Number(target.stamp_charges || 0)),
        insurance_charges: String(Number(target.insurance_charges || 0)),
        charge_payment_mode: chargePaymentMode,
        charges_collection_status: collectionStatus,
        refund_option: refundOption,
        interest_type: interestType,
        reason: String(target.reason || '').trim(),
        loan_request_date: String(target.loan_request_date || '').slice(0, 10),
        bank_name: String(target.bank_name || '').trim(),
        bank_branch: String(target.bank_branch || '').trim(),
        bank_account_no: String(target.bank_account_no || '').trim(),
      },
    });
  };

  const closeRequestedLoanEditModal = () => {
    if (requestedLoanEditModal.saving) return;
    setRequestedLoanEditModal((prev) => ({ ...prev, open: false, loanId: 0, activeStep: 1 }));
  };

  const submitRequestedLoanEdit = async () => {
    if (!token || !requestedLoanEditModal.loanId) return;

    const loan = requestedLoansRaw.find((item) => Number(item.id || 0) === requestedLoanEditModal.loanId);
    if (!loan) {
      openModal('Unable to find this loan request for update.', 'Edit Loan');
      return;
    }

    const formData = requestedLoanEditModal.form;
    for (let step = 1; step <= requestedLoanEditSteps.length; step += 1) {
      const stepError = validateRequestedLoanEditStep(step);
      if (stepError) {
        setRequestedLoanEditModal((prev) => ({ ...prev, activeStep: step }));
        openModal(stepError, 'Validation');
        return;
      }
    }

    setRequestedLoanEditModal((prev) => ({ ...prev, saving: true }));
    try {
      const response = await axios.put(
        `${API_BASE}/microfinance/loan-requests/${requestedLoanEditModal.loanId}`,
        {
          loan_scope: formData.loan_scope,
          mf_route_id: formData.loan_scope === 'direct_loan' ? null : Number(formData.mf_route_id || 0) || null,
          mf_center_id: formData.loan_scope === 'center_loan' ? Number(formData.mf_center_id || 0) || null : null,
          mf_group_id: formData.loan_scope === 'center_loan' ? Number(formData.mf_group_id || 0) || null : null,
          approval_employee_id: Number(formData.approval_employee_id || 0) || null,
          manager_name: formData.manager_name.trim(),
          field_officer: formData.field_officer.trim(),
          group_leader: formData.group_leader.trim(),
          reference_no: String(loan.reference_no || loan.loan_code || '').trim() || null,
          customer_name: formData.customer_name.trim(),
          nick_name: String(loan.nick_name || '').trim() || null,
          address: formData.address.trim(),
          contact_no: formData.contact_no.trim(),
          bank_name: formData.bank_name.trim() || null,
          bank_branch: formData.bank_branch.trim() || null,
          bank_account_no: formData.bank_account_no.trim() || null,
          reason: formData.reason.trim() || null,
          loan_amount: Number(formData.loan_amount || 0),
          refund_option: formData.refund_option,
          interest_type: formData.interest_type,
          interest_rate: Number(formData.interest_rate || 0),
          terms_count: Number(formData.terms_count || 1),
          refundable_amount: Number(formData.refundable_amount || 0),
          installment_amount: Number(formData.installment_amount || 0),
          document_charges: Number(formData.document_charges || 0),
          stamp_charges: Number(formData.stamp_charges || 0),
          insurance_charges: Number(formData.insurance_charges || 0),
          charge_payment_mode: formData.charge_payment_mode,
          charges_collection_status: formData.charges_collection_status,
          loan_request_date: formData.loan_request_date,
        },
        { headers }
      );

      const updatedLoan = response.data?.data as ExistingLoanRequest | undefined;
      if (updatedLoan && Number(updatedLoan.id || 0) > 0) {
        setRequestedLoansRaw((prev) =>
          prev.map((item) => (Number(item.id || 0) === Number(updatedLoan.id || 0) ? { ...item, ...updatedLoan } : item))
        );

        setRequestedLoanPreviews((prev) =>
          prev.map((item) => {
            if (item.id !== Number(updatedLoan.id || 0)) return item;
            return {
              ...item,
              customerNo: normalizeCustomerNo(String(updatedLoan.customer_no || item.customerNo || '')),
              customerName: String(updatedLoan.customer_name || item.customerName || '').trim(),
              loanAmount: Number(updatedLoan.loan_amount || item.loanAmount || 0),
              status: String(updatedLoan.status || item.status || 'unknown'),
              loanScope: String(updatedLoan.loan_scope || item.loanScope || 'unknown'),
              routeName: String(updatedLoan.route?.name || item.routeName || '-'),
              centerName: String(updatedLoan.center?.name || item.centerName || '-'),
              groupName: String(updatedLoan.group?.name || item.groupName || '-'),
              requestDate: String(updatedLoan.loan_request_date || item.requestDate || '').slice(0, 10) || '-',
            };
          })
        );
      }

      openModal('Requested loan updated successfully.', 'Success');
      setRequestedLoanEditModal((prev) => ({ ...prev, open: false, loanId: 0, activeStep: 1, saving: false }));
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to update requested loan.';
      openModal(message, 'Error');
      setRequestedLoanEditModal((prev) => ({ ...prev, saving: false }));
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-20 -left-16 h-80 w-80 rounded-full bg-emerald-300 blur-3xl"></div>
        <div className="absolute top-32 right-0 h-96 w-96 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-200 blur-3xl"></div>
      </div>
      <div className="max-w-7xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/80 shadow-[0_20px_60px_-25px_rgba(13,148,136,0.5)] p-6 md:p-8 space-y-8 relative z-10">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Loan Officer Workspace
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Request Loan</h1>
              <p className="text-sm text-slate-600 mt-1">Fast, guided registration with auto-generated reference no and existing-customer lookup by customer number, NIC, or name.</p>
            </div>
            <button type="button" onClick={() => router.push('/dashboard/microfinance/loans')} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold shadow-lg">
              Back
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {showStepPanel && (
              <div className="stepPanel relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_panel`)}
                    className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide step navigator widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="stepProgressBar">
                  <div className="stepProgressFill" style={{ width: `${progressPercent}%` }}></div>
                </div>
                <div className="stepTabs mt-4">
                  {steps.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => handleStepClick(step.id)}
                      className={`stepTab ${activeStep === step.id ? 'active' : ''} ${step.id < activeStep ? 'done' : ''}`}
                    >
                      <span className="stepNumber">{step.id}</span>
                      <span className="stepText">
                        <span className="stepTitle">{step.title}</span>
                        <span className="stepHint">{step.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              )}

              {activeStep === 1 && showStep1 && (
              <div className="sectionCard relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_1_location_mapping`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Location Mapping widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Location Mapping</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <label className="fieldLabel">Loan Scope *</label>
                    <select
                      className="input"
                      value={form.loan_scope}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          loan_scope: e.target.value,
                          mf_route_id: 0,
                          mf_center_id: 0,
                          mf_group_id: 0,
                          customer_no: '',
                        }))
                      }
                      required
                    >
                      <option value="route_loan">Route Loan</option>
                      <option value="center_loan">Center Loan</option>
                      <option value="direct_loan">Direct Loan</option>
                    </select>
                  </div>
                  {form.loan_scope !== 'direct_loan' && (
                  <div>
                    <label className="fieldLabel">Route *</label>
                    <select className="input" value={form.mf_route_id} onChange={(e) => setForm((p) => ({ ...p, mf_route_id: Number(e.target.value), mf_center_id: 0, mf_group_id: 0 }))} required>
                      <option value={0}>Select Route</option>
                      {routeCandidatesForBranch.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                    </select>
                  </div>
                  )}
                  {form.loan_scope === 'center_loan' && (
                  <div>
                    <label className="fieldLabel">Center *</label>
                    <select
                      className="input"
                      value={form.mf_center_id}
                      onChange={(e) => {
                        const centerId = Number(e.target.value);
                        const selected = filteredCenters.find((center) => center.id === centerId);

                        setForm((prev) => ({
                          ...prev,
                          mf_center_id: centerId,
                          mf_route_id: selected?.mf_route_id || prev.mf_route_id,
                          mf_group_id: 0,
                        }));
                      }}
                      required
                    >
                      <option value={0}>Select Center</option>
                      {filteredCenters.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </select>
                  </div>
                  )}
                  {form.loan_scope === 'center_loan' && (
                  <div>
                    <label className="fieldLabel">Group *</label>
                    <select className="input" value={form.mf_group_id} onChange={(e) => setForm((p) => ({ ...p, mf_group_id: Number(e.target.value) }))} required>
                      <option value={0}>Select Group</option>
                      {filteredGroups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
                    </select>
                  </div>
                  )}
                </div>
              </div>
              )}

              {activeStep === 2 && showStep2 && (
              <div className="sectionCard relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_2_officer_team`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Officer and Team widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Officer & Team Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="fieldLabel">Manager *</label>
                    <input
                      className="input bg-slate-100"
                      value={
                        form.manager_name ||
                        (managersLoading ? 'Auto assigning manager...' : 'Manager will be auto assigned')
                      }
                      readOnly
                      placeholder="Manager will be auto assigned"
                    />
                  </div>
                  <div>
                    <label className="fieldLabel">Field Officer *</label>
                    <select
                      className="input"
                      value={form.field_officer}
                      onChange={(e) => setForm((p) => ({ ...p, field_officer: e.target.value }))}
                      required
                      disabled={managersLoading || isCollectionOfficer}
                    >
                      <option value="">{managersLoading ? 'Loading Field Officers...' : 'Select Field Officer'}</option>
                      {fieldOfficers.map((officer) => (
                        <option key={officer.id} value={officer.name}>
                          {officer.name}
                          {officer.designation || officer.branch
                            ? ` (${[officer.designation, officer.branch].filter(Boolean).join(' - ')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hidden">
                    <label className="fieldLabel">Request Approval To *</label>
                    <select
                      className="input"
                      value={form.approval_employee_id}
                      onChange={(e) => setForm((p) => ({ ...p, approval_employee_id: Number(e.target.value || 0) }))}
                      required
                      disabled={managersLoading || approvalBranchManagers.length === 0}
                    >
                      <option value={0}>{managersLoading ? 'Loading Branch Managers...' : 'Select Branch Manager'}</option>
                      {approvalBranchManagers.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                          {employee.designation || employee.branch
                            ? ` (${[employee.designation, employee.branch].filter(Boolean).join(' - ')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="fieldLabel">Group Leader</label>
                    <input className="input" placeholder="Enter group leader name" value={form.group_leader} onChange={(e) => setForm((p) => ({ ...p, group_leader: e.target.value }))} />
                  </div>
                </div>
              </div>
              )}

              {activeStep === 3 && showStep3 && (
              <div className="sectionCard emerald relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_3_customer_details`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Customer Details widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Customer Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="fieldLabel">Reference No</label>
                    <input className="input bg-slate-100" placeholder="Auto generated from scope/route/center" value={form.customer_no} readOnly />
                  </div>
                  <div className="md:col-span-2">
                    <label className="fieldLabel">Select Existing Customer</label>
                    <div className="relative">
                      <input
                        className="input"
                        placeholder="Search by customer number, name, or NIC"
                        value={customerLookupQuery}
                        onFocus={() => setShowCustomerLookupOptions(true)}
                        onBlur={() => setTimeout(() => setShowCustomerLookupOptions(false), 150)}
                        onChange={(e) => {
                          setCustomerLookupQuery(e.target.value);
                          setSelectedCustomerId(0);
                          setShowCustomerLookupOptions(true);
                        }}
                      />

                      {showCustomerLookupOptions && customerLookupOptions.length > 0 && (
                        <div className="absolute z-30 mt-1 w-full rounded-xl border border-emerald-100 bg-white shadow-xl max-h-64 overflow-auto">
                          {customerLookupOptions.map(({ customer, name, customerCode, nic }) => (
                            <button
                              key={customer.id}
                              type="button"
                              onMouseDown={() => applyCustomerFromSuggestion(customer)}
                              className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-emerald-50 last:border-b-0"
                            >
                              <p className="text-sm font-semibold text-slate-800">{name || 'Unnamed customer'}</p>
                              <p className="text-xs text-slate-500">
                                {[customerCode, nic].filter(Boolean).join(' | ') || 'No customer number or NIC'}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedCustomer ? (
                    <div className="md:col-span-3 space-y-3">
                      <div className={`rounded-xl border p-3 text-sm ${customerProfileCompletionScore >= LOAN_REQUEST_MIN_COMPLETION ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                        <p className="font-semibold uppercase tracking-wide">Step 3 Attention</p>
                        <p className="mt-1">
                          Profile completion: <span className="font-bold">{customerProfileCompletionScore}%</span>
                        </p>
                        <p className="mt-1 text-xs">
                          {customerProfileCompletionScore >= LOAN_REQUEST_MIN_COMPLETION
                            ? `Customer meets ${LOAN_REQUEST_MIN_COMPLETION}% requirement and is eligible for loan request.`
                            : hasSpecialLoanPermission
                              ? `Customer is below ${STEP3_CONTINUE_MIN_COMPLETION}%. You can proceed only with special-permission confirmation.`
                              : `Customer is below ${STEP3_CONTINUE_MIN_COMPLETION}%. Complete profile details to continue.`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Selected Customer</p>
                      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Customer Number</p>
                          <p className="text-sm font-semibold text-slate-900">{form.customer_code || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Name</p>
                          <p className="text-sm font-semibold text-slate-900">{form.customer_name || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">NIC</p>
                          <p className="text-sm font-semibold text-slate-900">{form.nic || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Contact</p>
                          <p className="text-sm font-semibold text-slate-900">{form.contact_no || '-'}</p>
                        </div>
                      </div>
                    </div>

                    </div>
                  ) : (
                    <div className="md:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Select a registered customer before continuing.
                    </div>
                  )}
                </div>
              </div>
              )}

              {activeStep === 4 && showStep4 && (
              <div className="sectionCard cyan relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_4_family_financial`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Family and Financial widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Family, Financial Behaviour, Banking, Existing Loans & Credit</h2>
                {!selectedCustomer ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Select a registered customer in Step 3 before continuing.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3 text-xs text-cyan-900">
                      Fill these details section by section. Use numbers for counts/amounts and short notes for behavior/history fields.
                    </div>

                    <div className="mt-4 space-y-4">
                      <div className="rounded-xl border border-cyan-200 bg-white/90 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Family Information</p>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div>
                            <label className="fieldLabel">Family Members Count</label>
                            <input className="input" type="number" min="0" step="1" placeholder="e.g. 5" value={customerEnhancementForm.family_members_count} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, family_members_count: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Dependents Count</label>
                            <input className="input" type="number" min="0" step="1" placeholder="e.g. 2" value={customerEnhancementForm.dependents_count} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, dependents_count: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Spouse Name</label>
                            <input className="input" placeholder="Enter spouse full name" value={customerEnhancementForm.spouse_name} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, spouse_name: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Spouse NIC</label>
                            <input className="input" placeholder="Enter spouse NIC" value={customerEnhancementForm.spouse_nic} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, spouse_nic: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Spouse Contact Number</label>
                            <input className="input" placeholder="Enter spouse contact number" value={customerEnhancementForm.spouse_contact_no} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, spouse_contact_no: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Emergency Contact Name</label>
                            <input className="input" placeholder="Enter emergency contact name" value={customerEnhancementForm.emergency_contact_name} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Emergency Contact Number</label>
                            <input className="input" placeholder="Enter contact number" value={customerEnhancementForm.emergency_contact_no} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, emergency_contact_no: e.target.value }))} />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-cyan-200 bg-white/90 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Financial Behaviour</p>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div>
                            <label className="fieldLabel">Monthly Expenses (LKR)</label>
                            <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 45000" value={customerEnhancementForm.monthly_expenses} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, monthly_expenses: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Savings Habit</label>
                            <input className="input" placeholder="e.g. Saves monthly in bank" value={customerEnhancementForm.savings_habit} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, savings_habit: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Repayment Behaviour</label>
                            <input className="input" placeholder="e.g. Pays on time" value={customerEnhancementForm.repayment_behaviour} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, repayment_behaviour: e.target.value }))} />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-cyan-200 bg-white/90 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Banking Relationship</p>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div>
                            <label className="fieldLabel">Primary Bank Name</label>
                            <input className="input" placeholder="Enter bank name" value={customerEnhancementForm.primary_bank_name} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, primary_bank_name: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Bank Branch</label>
                            <input className="input" placeholder="Enter branch name" value={customerEnhancementForm.bank_branch} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, bank_branch: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Bank Account Number</label>
                            <input className="input" placeholder="Enter account number" value={customerEnhancementForm.account_number} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, account_number: e.target.value }))} />
                          </div>
                          <div>
                            <label className="fieldLabel">Relationship Duration (Years)</label>
                            <input className="input" type="number" min="0" step="1" placeholder="e.g. 4" value={customerEnhancementForm.relationship_years} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, relationship_years: e.target.value }))} />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-cyan-200 bg-white/90 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Existing Loans & Credit</p>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div>
                            <label className="fieldLabel">Has Existing Loans?</label>
                            <select className="input" value={customerEnhancementForm.existing_loans ? 'yes' : 'no'} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, existing_loans: e.target.value === 'yes' }))}>
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </div>
                          <div>
                            <label className="fieldLabel">Monthly Loan Obligations (LKR)</label>
                            <input className="input bg-slate-100" type="number" min="0" step="0.01" placeholder="Auto total from loans" value={normalizedExistingLoanEntries.length > 0 ? monthlyLoanObligationsTotal.toFixed(2) : customerEnhancementForm.monthly_loan_obligations} readOnly />
                          </div>
                          <div>
                            <label className="fieldLabel">Credit Score</label>
                            <input className="input" type="number" min="0" step="1" placeholder="e.g. 720" value={customerEnhancementForm.credit_score} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, credit_score: e.target.value }))} />
                          </div>
                          <div className="md:col-span-3">
                            <label className="fieldLabel">Credit History Notes</label>
                            <input className="input" placeholder="Brief notes about previous credit behavior" value={customerEnhancementForm.credit_history_notes} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, credit_history_notes: e.target.value }))} />
                          </div>
                        </div>

                        {customerEnhancementForm.existing_loans && (
                          <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Loan Details (Multiple Institutions)</p>
                              <button
                                type="button"
                                className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs font-semibold text-cyan-800"
                                onClick={addExistingLoanEntry}
                              >
                                + Add Loan
                              </button>
                            </div>
                            <div className="mt-2 space-y-2">
                              {existingLoanEntries.map((loan, index) => (
                                <div key={`existing-loan-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                                  <div>
                                    <label className="fieldLabel">Institution / Lender</label>
                                    <input
                                      className="input"
                                      placeholder="e.g. ABC Finance"
                                      value={loan.institution}
                                      onChange={(e) => updateExistingLoanEntry(index, 'institution', e.target.value)}
                                    />
                                  </div>
                                  <div>
                                    <label className="fieldLabel">Outstanding Balance (LKR)</label>
                                    <input
                                      className="input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="e.g. 250000"
                                      value={loan.outstanding_balance}
                                      onChange={(e) => updateExistingLoanEntry(index, 'outstanding_balance', e.target.value)}
                                    />
                                  </div>
                                  <div>
                                    <label className="fieldLabel">Monthly Installment (LKR)</label>
                                    <input
                                      className="input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="e.g. 15000"
                                      value={loan.monthly_installment}
                                      onChange={(e) => updateExistingLoanEntry(index, 'monthly_installment', e.target.value)}
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs font-semibold text-red-700"
                                      onClick={() => removeExistingLoanEntry(index)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-cyan-200 bg-white/80 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Relationals</p>
                        <button type="button" className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800" onClick={addCustomerRelational}>+ Add</button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {customerRelationals.map((entry, index) => (
                          <div key={`customer-relational-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-5">
                            <div>
                              <label className="fieldLabel">Name</label>
                              <input className="input" placeholder="Enter person name" value={entry.name} onChange={(e) => updateCustomerRelational(index, 'name', e.target.value)} />
                            </div>
                            <div>
                              <label className="fieldLabel">Relationship</label>
                              <input className="input" placeholder="e.g. Brother, Sister" value={entry.relationship} onChange={(e) => updateCustomerRelational(index, 'relationship', e.target.value)} />
                            </div>
                            <div>
                              <label className="fieldLabel">Contact Number</label>
                              <input className="input" placeholder="Enter contact number" value={entry.contact_no} onChange={(e) => updateCustomerRelational(index, 'contact_no', e.target.value)} />
                            </div>
                            <div>
                              <label className="fieldLabel">Signature Image</label>
                              <input className="input" type="file" accept="image/*" onChange={(e) => updateCustomerRelational(index, 'signature_file', e.target.files?.[0] || null)} />
                            </div>
                            <div className="flex items-end">
                              <button type="button" className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs font-semibold text-red-700" onClick={() => removeCustomerRelational(index)}>Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}

              {activeStep === 5 && showStep5 && (
              <div className="sectionCard indigo relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_5_documents`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Documents widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Documents</h2>
                {!selectedCustomer ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Select a registered customer in Step 3 before continuing.
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="fieldLabel">National ID</label>
                      <input className="input" type="file" onChange={(e) => setCustomerRegisterDocuments((prev) => ({ ...prev, 'National ID': e.target.files?.[0] || null }))} />
                    </div>
                    <div>
                      <label className="fieldLabel">Passport</label>
                      <input className="input" type="file" onChange={(e) => setCustomerRegisterDocuments((prev) => ({ ...prev, Passport: e.target.files?.[0] || null }))} />
                    </div>
                    <div>
                      <label className="fieldLabel">Driving License</label>
                      <input className="input" type="file" onChange={(e) => setCustomerRegisterDocuments((prev) => ({ ...prev, 'Driving License': e.target.files?.[0] || null }))} />
                    </div>
                    <div>
                      <label className="fieldLabel">Bank Statements</label>
                      <input className="input" type="file" multiple onChange={(e) => setCustomerBankStatementFiles(Array.from(e.target.files || []))} />
                    </div>
                    <div>
                      <label className="fieldLabel">EPF Reports</label>
                      <input className="input" type="file" multiple onChange={(e) => setCustomerEpfReportFiles(Array.from(e.target.files || []))} />
                    </div>
                    <div>
                      <label className="fieldLabel">Tax Returns</label>
                      <input className="input" type="file" multiple onChange={(e) => setCustomerTaxReturnFiles(Array.from(e.target.files || []))} />
                    </div>
                    <div>
                      <label className="fieldLabel">Paysheets</label>
                      <input className="input" type="file" multiple onChange={(e) => setCustomerPaysheetFiles(Array.from(e.target.files || []))} />
                    </div>
                    <div>
                      <label className="fieldLabel">Business Documents</label>
                      <input className="input" type="file" multiple onChange={(e) => setCustomerBusinessDocumentFiles(Array.from(e.target.files || []))} />
                    </div>
                  </div>
                )}
              </div>
              )}

              {activeStep === 6 && showStep6 && (
              <div className="sectionCard violet relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_6_residence_images`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Residence Images widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Residence Environment Images</h2>
                {!selectedCustomer ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Select a registered customer in Step 3 before continuing.
                  </div>
                ) : (
                  <div className="mt-3">
                    <input className="input" type="file" multiple accept="image/*" onChange={(e) => setCustomerResidenceEnvironmentFiles(Array.from(e.target.files || []))} />
                  </div>
                )}
              </div>
              )}

              {activeStep === 7 && showStep7 && (
              <div className="sectionCard amber relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_7_risk_assessment`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Evaluation widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Evaluation</h2>
                {!selectedCustomer ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Select a registered customer in Step 3 before continuing.
                  </div>
                ) : (
                  <div className="mt-3 space-y-4">
                    <div className="rounded-xl border border-amber-200 bg-white/90 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">1. Income Generation Activities</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {incomeGenerationActivityOptions.map((activity) => {
                          const checked = customerEnhancementForm.evaluation_income_generation_activities.includes(activity);
                          return (
                            <label key={activity} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleIncomeGenerationActivity(activity)}
                              />
                              {activity}
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="fieldLabel">Business 1</label>
                          <input className="input" placeholder="Enter business activity name" value={customerEnhancementForm.evaluation_business_1} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_1: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Business 1 Monthly Income (LKR)</label>
                          <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 80000" value={customerEnhancementForm.evaluation_business_1_monthly_income} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_1_monthly_income: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Business 2</label>
                          <input className="input" placeholder="Enter second business activity" value={customerEnhancementForm.evaluation_business_2} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_2: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Business 2 Monthly Income (LKR)</label>
                          <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 50000" value={customerEnhancementForm.evaluation_business_2_monthly_income} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_2_monthly_income: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2">
                          <label className="fieldLabel">Reason for Requesting the Loan</label>
                          <input className="input" placeholder="Enter loan purpose" value={customerEnhancementForm.evaluation_loan_reason} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_loan_reason: e.target.value }))} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-white/90 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">2. Information of Assets</p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                        <div>
                          <label className="fieldLabel">House Ownership</label>
                          <select className="input" value={customerEnhancementForm.evaluation_house_ownership} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_house_ownership: e.target.value }))}>
                            <option value="">Select ownership</option>
                            <option value="own">Own</option>
                            <option value="shared">Shared</option>
                            <option value="rented">Rented</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="fieldLabel">Roof Material</label>
                          <input className="input" placeholder="e.g. Tin, Asbestos" value={customerEnhancementForm.evaluation_house_roof_material} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_house_roof_material: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Wall Material</label>
                          <input className="input" placeholder="e.g. Cement, Wooden" value={customerEnhancementForm.evaluation_house_wall_material} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_house_wall_material: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Floor Material</label>
                          <input className="input" placeholder="e.g. Tiles, Terrazzo" value={customerEnhancementForm.evaluation_house_floor_material} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_house_floor_material: e.target.value }))} />
                        </div>
                        <div className="md:col-span-4">
                          <label className="fieldLabel">Vehicle Assets</label>
                          <input className="input" placeholder="e.g. Bike, Three Wheeler, Car/Van" value={customerEnhancementForm.evaluation_vehicle_assets} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_vehicle_assets: e.target.value }))} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-white/90 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">3. Details of Loans Taken from Other Institutions</p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="fieldLabel">Other Loan Details</label>
                          <textarea className="input min-h-[88px]" placeholder="Institution, branch, loan amount, date, payment method, etc." value={customerEnhancementForm.evaluation_other_loans_details} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_other_loans_details: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Monthly Loan Installments Total (LKR)</label>
                          <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 22000" value={customerEnhancementForm.evaluation_other_loans_monthly_installment} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_other_loans_monthly_installment: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Leasing Facility Details</label>
                          <textarea className="input min-h-[88px]" placeholder="Institution, branch, leasing amount, installments left, etc." value={customerEnhancementForm.evaluation_leasing_details} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_leasing_details: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Monthly Leasing Installments Total (LKR)</label>
                          <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 18000" value={customerEnhancementForm.evaluation_leasing_monthly_installment} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_leasing_monthly_installment: e.target.value }))} />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-white/90 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">4. Income & Expenses of the Family</p>
                      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="overflow-x-auto rounded-xl border border-amber-100">
                          <table className="min-w-full text-sm">
                            <thead className="bg-amber-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">No</th>
                                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Details (Only Family)</th>
                                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Monthly Expenses</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-100 bg-white">
                              {familyExpenseRows.map((row) => (
                                <tr key={row.key}>
                                  <td className="px-3 py-2 text-slate-700">{row.no}</td>
                                  <td className="px-3 py-2 text-slate-800">{row.label}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      className="input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={customerEnhancementForm.evaluation_family_expense_breakdown?.[row.key] || ''}
                                      onChange={(e) => updateFamilyExpenseValue(row.key, e.target.value)}
                                    />
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-amber-50/60">
                                <td className="px-3 py-2 text-slate-700"></td>
                                <td className="px-3 py-2 font-bold text-amber-900">Total</td>
                                <td className="px-3 py-2">
                                  <input className="input bg-slate-100 font-bold" readOnly value={familyExpenseTotal.toFixed(2)} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-amber-100">
                          <table className="min-w-full text-sm">
                            <thead className="bg-amber-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">No</th>
                                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Details</th>
                                <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Monthly Income</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-100 bg-white">
                              <tr>
                                <td className="px-3 py-2 text-slate-700">4</td>
                                <td className="px-3 py-2 text-slate-800">Family Income without Business Income</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_income_without_business} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_income_without_business: e.target.value }))} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700">4.1</td>
                                <td className="px-3 py-2 text-slate-800">Additional Family Income 1</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_income_item_1} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_income_item_1: e.target.value }))} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700">4.2</td>
                                <td className="px-3 py-2 text-slate-800">Additional Family Income 2</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_income_item_2} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_income_item_2: e.target.value }))} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700">4.3</td>
                                <td className="px-3 py-2 text-slate-800">Additional Family Income 3</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_income_item_3} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_income_item_3: e.target.value }))} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 align-top text-slate-700">4.4</td>
                                <td className="px-3 py-2 text-slate-800">Wage Earners in the Family (Contribution)</td>
                                <td className="px-3 py-2">
                                  <div className="rounded-lg border border-amber-100 p-2 space-y-2">
                                    <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                      <span className="col-span-1">No</span>
                                      <span className="col-span-6">Name</span>
                                      <span className="col-span-5">Salary</span>
                                    </div>
                                    <div className="grid grid-cols-12 gap-2">
                                      <span className="col-span-1 self-center text-xs text-slate-600">i</span>
                                      <input className="input col-span-6" placeholder="Name" value={customerEnhancementForm.evaluation_family_wage_earner_1_name} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_wage_earner_1_name: e.target.value }))} />
                                      <input className="input col-span-5" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_wage_earner_1_salary} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_wage_earner_1_salary: e.target.value }))} />
                                    </div>
                                    <div className="grid grid-cols-12 gap-2">
                                      <span className="col-span-1 self-center text-xs text-slate-600">ii</span>
                                      <input className="input col-span-6" placeholder="Name" value={customerEnhancementForm.evaluation_family_wage_earner_2_name} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_wage_earner_2_name: e.target.value }))} />
                                      <input className="input col-span-5" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_wage_earner_2_salary} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_wage_earner_2_salary: e.target.value }))} />
                                    </div>
                                    <div className="grid grid-cols-12 gap-2">
                                      <span className="col-span-1 self-center text-xs text-slate-600">iii</span>
                                      <input className="input col-span-6" placeholder="Name" value={customerEnhancementForm.evaluation_family_wage_earner_3_name} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_wage_earner_3_name: e.target.value }))} />
                                      <input className="input col-span-5" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_wage_earner_3_salary} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_wage_earner_3_salary: e.target.value }))} />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700">4.5</td>
                                <td className="px-3 py-2 text-slate-800">Rent out House</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_rent_out_house} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_rent_out_house: e.target.value }))} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700">4.6</td>
                                <td className="px-3 py-2 text-slate-800">Rent out Vehicle</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_rent_out_vehicle} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_rent_out_vehicle: e.target.value }))} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700">4.7</td>
                                <td className="px-3 py-2 text-slate-800">Interest and Commission</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_interest_commission} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_interest_commission: e.target.value }))} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700"></td>
                                <td className="px-3 py-2 text-slate-800">Other</td>
                                <td className="px-3 py-2">
                                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_family_other_income} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_family_other_income: e.target.value }))} />
                                </td>
                              </tr>
                              <tr className="bg-amber-50/60">
                                <td className="px-3 py-2 text-slate-700"></td>
                                <td className="px-3 py-2 font-bold text-amber-900">Total</td>
                                <td className="px-3 py-2">
                                  <input className="input bg-slate-100 font-bold" readOnly value={familyIncomeTotal.toFixed(2)} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-white/90 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">5. Income & Expenses of the Business</p>
                      <div className="mt-3 space-y-4">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          <div className="overflow-x-auto rounded-xl border border-amber-100">
                            <table className="min-w-full text-sm">
                              <thead className="bg-amber-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">No</th>
                                  <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Details</th>
                                  <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Monthly Expenses</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-amber-100 bg-white">
                                {businessExpenseRows.map((row) => (
                                  <tr key={row.key}>
                                    <td className="px-3 py-2 text-slate-700">{row.no}</td>
                                    <td className="px-3 py-2 text-slate-800">{row.label}</td>
                                    <td className="px-3 py-2">
                                      <input
                                        className="input"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={customerEnhancementForm.evaluation_business_expense_breakdown?.[row.key] || ''}
                                        onChange={(e) => updateBusinessExpenseValue(row.key, e.target.value)}
                                      />
                                    </td>
                                  </tr>
                                ))}
                                <tr className="bg-amber-50/60">
                                  <td className="px-3 py-2 text-slate-700"></td>
                                  <td className="px-3 py-2 font-bold text-amber-900">Total</td>
                                  <td className="px-3 py-2">
                                    <input className="input bg-slate-100 font-bold" readOnly value={businessExpenseTotal.toFixed(2)} />
                                  </td>
                                </tr>
                                <tr className="bg-amber-50/60">
                                  <td className="px-3 py-2 font-bold text-amber-900" colSpan={2}>A</td>
                                  <td className="px-3 py-2">
                                    <input className="input bg-slate-100 font-bold" readOnly value={familyExpenseTotal.toFixed(2)} />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-amber-100">
                            <table className="min-w-full text-sm">
                              <thead className="bg-amber-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">No</th>
                                  <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Details</th>
                                  <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-amber-900">Monthly Income</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-amber-100 bg-white">
                                <tr>
                                  <td className="px-3 py-2 text-slate-700">3</td>
                                  <td className="px-3 py-2 text-slate-800">Business 1 - Information</td>
                                  <td className="px-3 py-2"></td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-slate-700">3.1</td>
                                  <td className="px-3 py-2 text-slate-800">Unit Selling Price</td>
                                  <td className="px-3 py-2">
                                    <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_business_1_unit_selling_price} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_1_unit_selling_price: e.target.value }))} />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-slate-700">3.2</td>
                                  <td className="px-3 py-2 text-slate-800">Units</td>
                                  <td className="px-3 py-2">
                                    <input className="input" type="number" min="0" step="1" placeholder="0" value={customerEnhancementForm.evaluation_business_1_units} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_1_units: e.target.value }))} />
                                  </td>
                                </tr>
                                <tr className="bg-amber-50/40">
                                  <td className="px-3 py-2 text-slate-700">3.3</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800">Income</td>
                                  <td className="px-3 py-2">
                                    <input className="input bg-slate-100" readOnly value={business1IncomeTotal.toFixed(2)} />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-slate-700">4</td>
                                  <td className="px-3 py-2 text-slate-800">Business 2 - Information</td>
                                  <td className="px-3 py-2"></td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-slate-700">4.1</td>
                                  <td className="px-3 py-2 text-slate-800">Unit Selling Price</td>
                                  <td className="px-3 py-2">
                                    <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={customerEnhancementForm.evaluation_business_2_unit_selling_price} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_2_unit_selling_price: e.target.value }))} />
                                  </td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-slate-700">4.2</td>
                                  <td className="px-3 py-2 text-slate-800">Units</td>
                                  <td className="px-3 py-2">
                                    <input className="input" type="number" min="0" step="1" placeholder="0" value={customerEnhancementForm.evaluation_business_2_units} onChange={(e) => setCustomerEnhancementForm((p) => ({ ...p, evaluation_business_2_units: e.target.value }))} />
                                  </td>
                                </tr>
                                <tr className="bg-amber-50/40">
                                  <td className="px-3 py-2 text-slate-700">4.3</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800">Income</td>
                                  <td className="px-3 py-2">
                                    <input className="input bg-slate-100" readOnly value={business2IncomeTotal.toFixed(2)} />
                                  </td>
                                </tr>
                                <tr className="bg-amber-50/60">
                                  <td className="px-3 py-2 text-slate-700"></td>
                                  <td className="px-3 py-2 font-bold text-amber-900">Total</td>
                                  <td className="px-3 py-2">
                                    <input className="input bg-slate-100 font-bold" readOnly value={businessIncomeTotal.toFixed(2)} />
                                  </td>
                                </tr>
                                <tr className="bg-amber-50/60">
                                  <td className="px-3 py-2 font-bold text-amber-900">B</td>
                                  <td className="px-3 py-2 font-bold text-amber-900">Total Income of the Family (Family Income + Business Income)</td>
                                  <td className="px-3 py-2">
                                    <input className="input bg-slate-100 font-bold" readOnly value={totalIncomeWithBusiness.toFixed(2)} />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-amber-100">
                          <table className="min-w-full text-sm">
                            <tbody className="divide-y divide-amber-100 bg-white">
                              <tr>
                                <td className="px-3 py-2 font-bold text-amber-900">C</td>
                                <td className="px-3 py-2 text-slate-800">Loans, Leasing Taken from other Institutions (Monthly)</td>
                                <td className="px-3 py-2 text-slate-700">Total of Loan Installments + Total of Leasing Installments</td>
                                <td className="px-3 py-2">
                                  <input className="input bg-slate-100" readOnly value={loanAndLeasingTotal.toFixed(2)} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-bold text-amber-900">D</td>
                                <td className="px-3 py-2 text-slate-800">Loan Payments and Family Expenses</td>
                                <td className="px-3 py-2 text-slate-700">Total Family Expenditure (A) + C</td>
                                <td className="px-3 py-2">
                                  <input className="input bg-slate-100" readOnly value={loanPaymentsAndFamilyExpensesTotal.toFixed(2)} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 font-bold text-amber-900">E</td>
                                <td className="px-3 py-2 text-slate-800">Remaining Cash with Family</td>
                                <td className="px-3 py-2 text-slate-700">Total Income of Family (B) - D</td>
                                <td className="px-3 py-2">
                                  <input className="input bg-slate-100" readOnly value={remainingCashWithFamily.toFixed(2)} />
                                </td>
                              </tr>
                              <tr>
                                <td className="px-3 py-2 text-slate-700"></td>
                                <td className="px-3 py-2 font-semibold text-slate-800">Average Cash per Week</td>
                                <td className="px-3 py-2 text-slate-700">(E) / 4</td>
                                <td className="px-3 py-2">
                                  <input className="input bg-slate-100" readOnly value={averageCashPerWeek.toFixed(2)} />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

              {activeStep === 8 && showStep8 && (
              <div className="sectionCard cyan relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_8_guarantors`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Guarantors widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="sectionTitle">Guarantors</h2>
                  <button type="button" onClick={addGuarantor} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold">+ Add Guarantor</button>
                </div>
                <div className="space-y-4">
                  {guarantors.map((g, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 border border-cyan-100 rounded-xl p-3 bg-white/95">
                      <div className="md:col-span-5 relative">
                        <label className="fieldLabel">Find Existing Guarantor (Name or NIC)</label>
                        <input
                          className="input"
                          placeholder="Type guarantor name or NIC"
                          value={guarantorFinderQueryByIndex[index] || ''}
                          onFocus={() => setActiveGuarantorFinderIndex(index)}
                          onBlur={() => setTimeout(() => setActiveGuarantorFinderIndex((prev) => (prev === index ? null : prev)), 150)}
                          onChange={(e) => {
                            const value = e.target.value;
                            setGuarantorFinderQueryByIndex((prev) => ({ ...prev, [index]: value }));
                            setActiveGuarantorFinderIndex(index);
                          }}
                        />

                        {activeGuarantorFinderIndex === index && (guarantorFinderQueryByIndex[index] || '').trim() !== '' && (
                          <div className="absolute z-20 mt-1 w-full rounded-xl border border-cyan-100 bg-white shadow-xl max-h-56 overflow-auto">
                            {findGuarantorMatches(guarantorFinderQueryByIndex[index] || '').length === 0 ? (
                              <p className="px-3 py-2 text-xs text-slate-500">No guarantor matches found.</p>
                            ) : (
                              findGuarantorMatches(guarantorFinderQueryByIndex[index] || '').map((option) => (
                                <button
                                  key={`${option.id}-${option.nic}`}
                                  type="button"
                                  onMouseDown={() => applyGuarantorFromFinder(index, option)}
                                  className="w-full text-left px-3 py-2 hover:bg-cyan-50 border-b border-cyan-50 last:border-b-0"
                                >
                                  <p className="text-sm font-semibold text-slate-800">{option.name}</p>
                                  <p className="text-xs text-slate-500">{option.nic}{option.contact_no ? ` • ${option.contact_no}` : ''}</p>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="fieldLabel">Guarantor Name</label>
                        <input className="input" placeholder="Enter name" value={g.name} onChange={(e) => updateGuarantor(index, 'name', e.target.value)} />
                      </div>
                      <div>
                        <label className="fieldLabel">NIC</label>
                        <input className="input" placeholder="Enter NIC" value={g.nic} onChange={(e) => updateGuarantor(index, 'nic', e.target.value)} />
                      </div>
                      <div>
                        <label className="fieldLabel">Contact No</label>
                        <input className="input" placeholder="Enter contact number" value={g.contact_no} onChange={(e) => updateGuarantor(index, 'contact_no', e.target.value)} />
                      </div>
                      <div>
                        <label className="fieldLabel">Relationship</label>
                        <input className="input" placeholder="Enter relationship" value={g.relationship} onChange={(e) => updateGuarantor(index, 'relationship', e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <div className="w-full">
                          <label className="fieldLabel">Address</label>
                          <input className="input" placeholder="Enter address" value={g.address} onChange={(e) => updateGuarantor(index, 'address', e.target.value)} />
                        </div>
                        {guarantors.length > 1 && (
                          <button type="button" onClick={() => removeGuarantor(index)} className="px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-semibold">Remove</button>
                        )}
                      </div>
                      <div>
                        <label className="fieldLabel">Guarantor Image</label>
                        <input
                          type="file"
                          accept="image/*"
                          className="input"
                          onChange={(e) => void updateGuarantorFile(index, 'image_file', e.target.files?.[0] || null)}
                        />
                        {g.image_file && (
                          <div className="mt-1 inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-800">
                            <span className="truncate max-w-[170px]">{g.image_file.name}</span>
                            <button type="button" onClick={() => void updateGuarantorFile(index, 'image_file', null)} className="font-bold">×</button>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="fieldLabel">Guarantor Signature</label>
                        <input
                          type="file"
                          accept="image/*"
                          className="input"
                          onChange={(e) => void updateGuarantorFile(index, 'signature_file', e.target.files?.[0] || null)}
                        />
                        {g.signature_file && (
                          <div className="mt-1 inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-800">
                            <span className="truncate max-w-[170px]">{g.signature_file.name}</span>
                            <button type="button" onClick={() => void updateGuarantorFile(index, 'signature_file', null)} className="font-bold">×</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {activeStep === 9 && showStep9 && (
              <div className="sectionCard blue relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}step_9_loan_details`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Loan Details widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="sectionTitle">Loan Details</h2>
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-white/90 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-blue-800">Select Loan Product</h3>
                    <p className="mt-1 text-xs text-slate-600">Choose a product from settings to auto-fill interest type, rate, terms count, and refund option.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      <div>
                        <label className="fieldLabel">Loan Product</label>
                        <select
                          className="input"
                          value={form.loan_product_id}
                          onChange={(e) => applyLoanProduct(Number(e.target.value))}
                        >
                          <option value={0}>Select Loan Product (Optional)</option>
                          {loanProducts
                            .filter((product) => Boolean(product.is_active))
                            .map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} - {finalizeInterestRate(String(product.interest_rate || 0))}% ({product.interest_type}) / {product.terms_count} {product.refund_option}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-slate-700">
                        {selectedLoanProduct ? (
                          <div className="space-y-1">
                            <p><span className="font-semibold text-slate-900">Selected:</span> {selectedLoanProduct.name}</p>
                            <p><span className="font-semibold text-slate-900">Rate:</span> {finalizeInterestRate(String(selectedLoanProduct.interest_rate || 0))}% ({selectedLoanProduct.interest_type})</p>
                            <p><span className="font-semibold text-slate-900">Terms:</span> {selectedLoanProduct.terms_count} ({selectedLoanProduct.refund_option}{selectedLoanProduct.refund_option === 'month' ? `, ${Number(selectedLoanProduct.assumed_month_days || 30)} days` : ''})</p>
                            <p>
                              <span className="font-semibold text-slate-900">Loan Range:</span>{' '}
                              {selectedLoanProduct.min_loan_amount !== null && selectedLoanProduct.min_loan_amount !== undefined && String(selectedLoanProduct.min_loan_amount) !== ''
                                ? Number(selectedLoanProduct.min_loan_amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '-'}
                              {' '}to{' '}
                              {selectedLoanProduct.max_loan_amount !== null && selectedLoanProduct.max_loan_amount !== undefined && String(selectedLoanProduct.max_loan_amount) !== ''
                                ? Number(selectedLoanProduct.max_loan_amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '-'}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-900">Charges (%):</span>{' '}
                              D {Number(selectedLoanProduct.document_charge_percentage || 0).toFixed(2)}% | S {Number(selectedLoanProduct.stamp_charge_percentage || 0).toFixed(2)}% | I {Number(selectedLoanProduct.insurance_charge_percentage || 0).toFixed(2)}%
                            </p>
                          </div>
                        ) : (
                          <p>Select a product to auto-fill defaults. You can still modify values below.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {!selectedLoanProduct ? (
                    <div className="rounded-xl border border-blue-200 bg-white/95 p-4">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-blue-800">Custom Loan Details</h3>
                      <p className="mt-1 text-xs text-slate-600">Adjust any values below as needed before final submission.</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                        <div>
                          <label className="fieldLabel">Reference No</label>
                          <input className="input bg-slate-100" placeholder="Auto generated from scope/route/center" value={form.customer_no} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Loan Amount *</label>
                          <input
                            className="input bg-slate-100"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Enter loan amount"
                            value={form.loan_amount}
                            onChange={(e) => setForm((p) => ({ ...p, loan_amount: e.target.value }))}
                            onBlur={handleLoanAmountBlur}
                            required
                            disabled
                          />
                        </div>
                        <div>
                          <label className="fieldLabel">Reason</label>
                          <input className="input" placeholder="Enter reason for loan" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
                        </div>
                        <div>
                          <label className="fieldLabel">Refund Option *</label>
                          <select className="input" value={form.refund_option} onChange={(e) => setForm((p) => ({ ...p, refund_option: e.target.value }))} required>
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                          </select>
                        </div>
                        <div>
                          <label className="fieldLabel">Interest Rate (%) *</label>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.0000001"
                            inputMode="decimal"
                            placeholder="e.g. 5.5555555"
                            value={form.interest_rate}
                            onChange={(e) => handleInterestRateChange(e.target.value)}
                            onBlur={handleInterestRateBlur}
                            required
                          />
                          <p className="text-[11px] text-slate-500 mt-1">Up to {INTEREST_RATE_MAX_DECIMALS} decimal places</p>
                        </div>
                        <div>
                          <label className="fieldLabel">Interest Type *</label>
                          <select className="input" value={form.interest_type} onChange={(e) => setForm((p) => ({ ...p, interest_type: e.target.value }))} required>
                            <option value="flat">Flat</option>
                            <option value="reducing">Reducing</option>
                          </select>
                        </div>
                        <div>
                          <label className="fieldLabel">Terms Count ({termUnitLabel}) *</label>
                          <input className="input" type="number" min="1" step="1" placeholder={`Enter number of ${termUnitLabel.toLowerCase()}`} value={form.terms_count} onChange={(e) => setForm((p) => ({ ...p, terms_count: e.target.value }))} required />
                          <p className="text-[11px] text-slate-500 mt-1">Daily conversion: {Number(form.assumed_month_days || 30)} days = 1 month</p>
                        </div>
                        <div>
                          <label className="fieldLabel">Refundable Amount</label>
                          <input className="input bg-slate-100" placeholder="Auto calculated" value={form.refundable_amount} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Installment Amount</label>
                          <input className="input bg-slate-100" placeholder="Auto calculated" value={form.installment_amount} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Document Charges</label>
                          <input className="input" type="number" min="0" step="0.01" placeholder="Auto from percentage" value={form.document_charges} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Stamp Charges</label>
                          <input className="input" type="number" min="0" step="0.01" placeholder="Auto from percentage" value={form.stamp_charges} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Insurance Charges</label>
                          <input className="input" type="number" min="0" step="0.01" placeholder="Auto from percentage" value={form.insurance_charges} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Charges Collection Mode *</label>
                          <select className="input" value={form.charge_payment_mode} onChange={(e) => setForm((p) => ({ ...p, charge_payment_mode: e.target.value }))} required>
                            <option value="hand_cash">Collect by Hand Cash</option>
                            <option value="deduct_from_loan">Reduce from Loan Amount</option>
                          </select>
                        </div>
                        <div>
                          <label className="fieldLabel">Balance Amount</label>
                          <input
                            className="input bg-slate-100"
                            value={balanceAmount.toFixed(2)}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="fieldLabel">Loan Request Date *</label>
                          <input className="input" type="date" value={form.loan_request_date} onChange={(e) => setForm((p) => ({ ...p, loan_request_date: e.target.value }))} required />
                        </div>
                        <div className="md:col-span-2">
                          <label className="fieldLabel">Charges Collection</label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm font-semibold text-emerald-900">
                            <input
                              type="checkbox"
                              checked={form.charges_collection_status === 'done'}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  charges_collection_status: e.target.checked ? 'done' : 'pending',
                                }))
                              }
                            />
                            Charges collection done
                          </label>
                          <p className="mt-1 text-xs text-slate-600">
                            Status: {form.charges_collection_status === 'done' ? 'Done' : 'Pending'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-200 bg-white/95 p-4">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wide text-blue-800">Product Loan Details</h3>
                        <p className="mt-1 text-xs text-slate-600">Loan terms are auto-filled from selected product. Only loan amount and loan request date are editable.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                        <div>
                          <label className="fieldLabel">Reference No</label>
                          <input className="input bg-slate-100" placeholder="Auto generated from scope/route/center" value={form.customer_no} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Loan Amount *</label>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Enter loan amount"
                            value={form.loan_amount}
                            onChange={(e) => setForm((p) => ({ ...p, loan_amount: e.target.value }))}
                            onBlur={handleLoanAmountBlur}
                            required
                          />
                        </div>
                        <div>
                          <label className="fieldLabel">Reason</label>
                          <input className="input bg-slate-100" placeholder="Enter reason for loan" value={form.reason} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Refund Option</label>
                          <select
                            className="input bg-slate-100"
                            value={form.refund_option}
                            disabled
                          >
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                          </select>
                        </div>
                        <div>
                          <label className="fieldLabel">Interest Rate (%)</label>
                          <input
                            className="input bg-slate-100"
                            type="number"
                            min="0"
                            step="0.0000001"
                            inputMode="decimal"
                            value={form.interest_rate}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="fieldLabel">Interest Type</label>
                          <select
                            className="input bg-slate-100"
                            value={form.interest_type}
                            disabled
                          >
                            <option value="flat">Flat</option>
                            <option value="reducing">Reducing</option>
                          </select>
                        </div>
                        <div>
                          <label className="fieldLabel">Terms Count ({termUnitLabel})</label>
                          <input
                            className="input bg-slate-100"
                            type="number"
                            min="1"
                            step="1"
                            value={form.terms_count || ''}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="fieldLabel">Refundable Amount</label>
                          <input className="input bg-slate-100" placeholder="Auto calculated" value={form.refundable_amount} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Installment Amount</label>
                          <input className="input bg-slate-100" placeholder="Auto calculated" value={form.installment_amount} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Document Charges</label>
                          <input className="input bg-slate-100" type="number" min="0" step="0.01" placeholder="Auto from percentage" value={form.document_charges} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Stamp Charges</label>
                          <input className="input bg-slate-100" type="number" min="0" step="0.01" placeholder="Auto from percentage" value={form.stamp_charges} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Insurance Charges</label>
                          <input className="input bg-slate-100" type="number" min="0" step="0.01" placeholder="Auto from percentage" value={form.insurance_charges} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Charges Collection Mode *</label>
                          <select className="input bg-slate-100" value={form.charge_payment_mode} disabled>
                            <option value="hand_cash">Collect by Hand Cash</option>
                            <option value="deduct_from_loan">Reduce from Loan Amount</option>
                          </select>
                        </div>
                        <div>
                          <label className="fieldLabel">Balance Amount</label>
                          <input className="input bg-slate-100" value={balanceAmount.toFixed(2)} readOnly />
                        </div>
                        <div>
                          <label className="fieldLabel">Loan Request Date *</label>
                          <input className="input" type="date" value={form.loan_request_date} onChange={(e) => setForm((p) => ({ ...p, loan_request_date: e.target.value }))} required />
                        </div>
                        <div className="md:col-span-2">
                          <label className="fieldLabel">Charges Collection</label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm font-semibold text-emerald-900 opacity-80">
                            <input
                              type="checkbox"
                              checked={form.charges_collection_status === 'done'}
                              disabled
                            />
                            Charges collection done
                          </label>
                          <p className="mt-1 text-xs text-slate-600">
                            Status: {form.charges_collection_status === 'done' ? 'Done' : 'Pending'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )}

              {!isActiveStepVisible && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  This step widget is hidden. Use the step tabs to continue, or restore hidden widgets from dashboard.
                </div>
              )}

              <div className="flex justify-end">
                <div className="w-full flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveStep((prev) => Math.max(prev - 1, 1))}
                    disabled={activeStep === 1}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Back Step
                  </button>

                  {activeStep < steps.length ? (
                    <button
                      type="button"
                      onClick={handleNextStep}
                      disabled={isStep3AttentionActive}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-lg hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Continue
                    </button>
                  ) : (
                    <button disabled={loading} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-lg disabled:opacity-70 disabled:cursor-not-allowed hover:from-emerald-700 hover:to-teal-700">
                      {loading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>}
                      {loading ? 'Registering Loan...' : 'Register Loan'}
                    </button>
                  )}
                </div>
              </div>

              {showRequestedLoanPreview && (
              <div className="sectionCard relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}requested_loan_preview`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Requested Loan Preview widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>

                <div className="flex items-start justify-between gap-3 pr-8">
                  <div>
                    <h2 className="sectionTitle">Requested Loan List Preview</h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Latest requests for this branch scope. Showing status Requested first.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/microfinance/loans/approvals')}
                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                  >
                    Open Approvals
                  </button>
                </div>

                {requestedLoanPreviewRows.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    No requested loans available yet.
                  </div>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-100/80">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Code</th>
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Customer</th>
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Scope</th>
                          <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Location</th>
                          <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-slate-600">Amount</th>
                          <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-600">Status</th>
                          <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-600">Date</th>
                          <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-600">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {requestedLoanPreviewRows.map((loan) => {
                          const normalizedStatus = normalizeText(loan.status);
                          const statusClass =
                            normalizedStatus === 'requested'
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : normalizedStatus === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : normalizedStatus === 'rejected'
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200';
                          const scopeLabel =
                            loan.loanScope === 'center_loan'
                              ? 'Center Loan'
                              : loan.loanScope === 'route_loan'
                                ? 'Route Loan'
                                : loan.loanScope === 'direct_loan'
                                  ? 'Direct Loan'
                                  : loan.loanScope;

                          return (
                            <tr key={loan.id} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2 font-semibold text-slate-800">{loan.customerNo || '-'}</td>
                              <td className="px-3 py-2 text-slate-700">{loan.customerName || '-'}</td>
                              <td className="px-3 py-2 text-slate-700">{scopeLabel}</td>
                              <td className="px-3 py-2 text-slate-700">{loan.routeName} / {loan.centerName} / {loan.groupName}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">{loan.loanAmount.toFixed(2)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                                  {loan.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center text-slate-600">{loan.requestDate}</td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => openRequestedLoanEditModal(loan.id)}
                                  className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}
            </div>

            <div className="xl:col-span-1">
              {showLiveSummary && (
              <div className="sticky top-6 relative rounded-2xl border border-emerald-100 bg-white/90 shadow-lg p-5 space-y-4">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}live_summary`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide Live Summary widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h3 className="text-lg font-bold text-slate-900">Live Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="summaryTile">
                    <p className="summaryLabel">Reference No</p>
                    <p className="summaryValue text-xs break-all">{form.customer_no || '-'}</p>
                  </div>
                  <div className="summaryTile">
                    <p className="summaryLabel">Refund Mode</p>
                    <p className="summaryValue capitalize">{form.refund_option}</p>
                  </div>
                  <div className="summaryTile">
                    <p className="summaryLabel">Installment</p>
                    <p className="summaryValue">{form.installment_amount || '0.00'}</p>
                  </div>
                  <div className="summaryTile">
                    <p className="summaryLabel">Refundable</p>
                    <p className="summaryValue">{form.refundable_amount || '0.00'}</p>
                  </div>
                  <div className="summaryTile">
                    <p className="summaryLabel">Interest Type</p>
                    <p className="summaryValue capitalize">{form.interest_type}</p>
                  </div>
                  <div className="summaryTile">
                    <p className="summaryLabel">Total Charges</p>
                    <p className="summaryValue">{totalCharges.toFixed(2)}</p>
                  </div>
                  <div className="summaryTile">
                    <p className="summaryLabel">Net Disbursement</p>
                    <p className="summaryValue">{netDisbursedAmount.toFixed(2)}</p>
                  </div>
                  <div className="summaryTile">
                    <p className="summaryLabel">Balance Amount</p>
                    <p className="summaryValue">{balanceAmount.toFixed(2)}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm space-y-1 text-black">
                  <p><span className="font-semibold">Loan Scope:</span> {form.loan_scope === 'center_loan' ? 'Center Loan' : form.loan_scope === 'route_loan' ? 'Route Loan' : 'Direct Loan'}</p>
                  <p><span className="font-semibold">Route:</span> {selectedRoute?.name || '-'}</p>
                  <p><span className="font-semibold">Center:</span> {selectedCenter?.name || '-'}</p>
                  <p><span className="font-semibold">Group:</span> {selectedGroup?.name || '-'}</p>
                  <p><span className="font-semibold">Guarantors:</span> {activeGuarantorCount}</p>
                  <p><span className="font-semibold">Charges Mode:</span> {form.charge_payment_mode === 'deduct_from_loan' ? 'Reduce from loan' : 'Hand cash'}</p>
                </div>

                <p className="text-xs text-slate-500">
                  Tip: select loan scope, route, and center to generate reference no automatically.
                </p>
              </div>
              )}
            </div>
          </div>
        </form>
      </div>

      <style jsx>{`
        .stepPanel {
          border: 1px solid #a7f3d0;
          border-radius: 1rem;
          padding: 1rem;
          background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(6,182,212,0.09) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
        }
        .stepProgressBar {
          width: 100%;
          height: 0.55rem;
          border-radius: 999px;
          background: rgba(148,163,184,0.22);
          overflow: hidden;
        }
        .stepProgressFill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #10b981 0%, #14b8a6 55%, #06b6d4 100%);
          transition: width 0.3s ease;
        }
        .stepTabs {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.5rem;
        }
        @media (min-width: 768px) {
          .stepTabs {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .stepTab {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 0.85rem;
          padding: 0.55rem 0.7rem;
          text-align: left;
          background: rgba(255,255,255,0.86);
          color: #0f172a;
          transition: all 0.2s ease;
        }
        .stepTab:hover {
          border-color: #67e8f9;
          transform: translateY(-1px);
        }
        .stepTab.active {
          border-color: #14b8a6;
          background: rgba(240,253,250,0.95);
          box-shadow: 0 0 0 3px rgba(45,212,191,0.15);
        }
        .stepTab.done {
          border-color: #6ee7b7;
        }
        .stepNumber {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.7rem;
          height: 1.7rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 800;
          background: #e2e8f0;
          color: #334155;
          flex-shrink: 0;
        }
        .stepTab.active .stepNumber,
        .stepTab.done .stepNumber {
          background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
          color: #ffffff;
        }
        .stepText {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .stepTitle {
          font-size: 0.82rem;
          font-weight: 700;
          line-height: 1.1;
        }
        .stepHint {
          font-size: 0.72rem;
          color: #64748b;
          line-height: 1.2;
        }
        .input {
          width: 100%;
          border: 1px solid #d1fae5;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 0.75rem;
          padding: 0.68rem 0.9rem;
          font-size: 0.9rem;
          color: #0f172a;
          outline: none;
          transition: all 0.2s ease;
        }
        .input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.2);
        }
        .customerPhotoInput {
          width: 100%;
          border: 1px solid #d1fae5;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 0.75rem;
          padding: 0.68rem 0.9rem;
          font-size: 0.9rem;
          color: #0f172a;
        }
        .customerPhotoInput::file-selector-button {
          margin-right: 0.75rem;
          border: 0;
          border-radius: 0.55rem;
          padding: 0.45rem 0.85rem;
          font-size: 0.82rem;
          font-weight: 600;
          background: #d1fae5;
          color: #047857;
          cursor: pointer;
        }
        .customerPhotoInput::file-selector-button:hover {
          background: #a7f3d0;
        }
        .sectionCard {
          border: 1px solid #d1fae5;
          border-radius: 1rem;
          padding: 1.1rem;
          background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(240,253,250,0.72) 100%);
        }
        .sectionCard.cyan {
          border-color: #bae6fd;
          background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(236,254,255,0.8) 100%);
        }
        .sectionCard.blue {
          border-color: #bfdbfe;
          background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(239,246,255,0.78) 100%);
        }
        .sectionCard.emerald {
          border-color: #a7f3d0;
        }
        .sectionTitle {
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: 0.01em;
        }
        .fieldLabel {
          display: block;
          margin-bottom: 0.35rem;
          color: #0f172a;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .summaryTile {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 0.7rem;
          padding: 0.55rem;
        }
        .summaryLabel {
          color: #64748b;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 0.2rem;
        }
        .summaryValue {
          color: #0f172a;
          font-weight: 700;
        }
      `}</style>

      {requestedLoanEditModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 py-8">
          <div className="w-full max-w-5xl rounded-2xl border border-cyan-100 bg-white p-5 shadow-2xl max-h-[92vh] overflow-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Requested Loan</h3>
                <p className="text-sm text-slate-600">Update and save selected requested loan details.</p>
              </div>
              <button
                type="button"
                onClick={closeRequestedLoanEditModal}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={requestedLoanEditModal.saving}
              >
                Close
              </button>
            </div>

            <div className="stepPanel mb-4">
              <div className="stepProgressBar">
                <div className="stepProgressFill" style={{ width: `${requestedLoanEditProgress}%` }}></div>
              </div>
              <div className="stepTabs mt-4">
                {requestedLoanEditSteps.map((step) => (
                  <button
                    key={`requested-loan-edit-step-${step.id}`}
                    type="button"
                    onClick={() => goToRequestedLoanEditStep(step.id)}
                    className={`stepTab ${requestedLoanEditModal.activeStep === step.id ? 'active' : ''} ${step.id < requestedLoanEditModal.activeStep ? 'done' : ''}`}
                  >
                    <span className="stepNumber">{step.id}</span>
                    <span className="stepText">
                      <span className="stepTitle">{step.title}</span>
                      <span className="stepHint">{step.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {requestedLoanEditModal.activeStep === 1 && (
              <div className="sectionCard">
                <h4 className="sectionTitle">Location Mapping</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <label className="fieldLabel">Loan Scope *</label>
                    <select className="input" value={requestedLoanEditModal.form.loan_scope} onChange={(e) => {
                      const nextScope = e.target.value as RequestedLoanEditForm['loan_scope'];
                      setRequestedLoanEditModal((prev) => ({
                        ...prev,
                        form: {
                          ...prev.form,
                          loan_scope: nextScope,
                          mf_center_id: nextScope === 'center_loan' ? prev.form.mf_center_id : 0,
                          mf_group_id: nextScope === 'center_loan' ? prev.form.mf_group_id : 0,
                        },
                      }));
                    }}>
                      <option value="route_loan">Route Loan</option>
                      <option value="center_loan">Center Loan</option>
                      <option value="direct_loan">Direct Loan</option>
                    </select>
                  </div>

                  {requestedLoanEditModal.form.loan_scope !== 'direct_loan' && (
                    <div>
                      <label className="fieldLabel">Route *</label>
                      <select className="input" value={requestedLoanEditModal.form.mf_route_id} onChange={(e) => {
                        const routeId = Number(e.target.value || 0);
                        setRequestedLoanEditModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, mf_route_id: routeId, mf_center_id: 0, mf_group_id: 0 },
                        }));
                      }}>
                        <option value={0}>Select Route</option>
                        {routeCandidatesForBranch.map((route) => (
                          <option key={route.id} value={route.id}>{route.name} ({route.code})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {requestedLoanEditModal.form.loan_scope === 'center_loan' && (
                    <>
                      <div>
                        <label className="fieldLabel">Center *</label>
                        <select className="input" value={requestedLoanEditModal.form.mf_center_id} onChange={(e) => {
                          const centerId = Number(e.target.value || 0);
                          const selected = requestedLoanEditFilteredCenters.find((center) => center.id === centerId);
                          setRequestedLoanEditModal((prev) => ({
                            ...prev,
                            form: {
                              ...prev.form,
                              mf_center_id: centerId,
                              mf_route_id: selected?.mf_route_id || prev.form.mf_route_id,
                              mf_group_id: 0,
                            },
                          }));
                        }}>
                          <option value={0}>Select Center</option>
                          {requestedLoanEditFilteredCenters.map((center) => (
                            <option key={center.id} value={center.id}>{center.name} ({center.code})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="fieldLabel">Group *</label>
                        <select className="input" value={requestedLoanEditModal.form.mf_group_id} onChange={(e) => setRequestedLoanEditField('mf_group_id', Number(e.target.value || 0))}>
                          <option value={0}>Select Group</option>
                          {requestedLoanEditFilteredGroups.map((group) => (
                            <option key={group.id} value={group.id}>{group.name} ({group.code})</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {requestedLoanEditModal.activeStep === 2 && (
              <div className="sectionCard">
                <h4 className="sectionTitle">Officer & Team</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="fieldLabel">Manager *</label>
                    <select className="input" value={requestedLoanEditModal.form.manager_name} onChange={(e) => setRequestedLoanEditField('manager_name', e.target.value)}>
                      <option value="">Select Manager</option>
                      {managers.map((manager) => (
                        <option key={`edit-manager-${manager.id}`} value={manager.name}>{manager.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="fieldLabel">Field Officer *</label>
                    <select className="input" value={requestedLoanEditModal.form.field_officer} onChange={(e) => setRequestedLoanEditField('field_officer', e.target.value)}>
                      <option value="">Select Field Officer</option>
                      {fieldOfficers.map((officer) => (
                        <option key={`edit-officer-${officer.id}`} value={officer.name}>{officer.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="hidden">
                    <label className="fieldLabel">Request Approval To *</label>
                    <select className="input" value={requestedLoanEditModal.form.approval_employee_id} onChange={(e) => setRequestedLoanEditField('approval_employee_id', Number(e.target.value || 0))}>
                      <option value={0}>Select Branch Manager</option>
                      {approvalBranchManagers.map((employee) => (
                        <option key={`edit-approval-employee-${employee.id}`} value={employee.id}>{employee.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="fieldLabel">Group Leader</label>
                    <input className="input" value={requestedLoanEditModal.form.group_leader} onChange={(e) => setRequestedLoanEditField('group_leader', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {requestedLoanEditModal.activeStep === 3 && (
              <div className="sectionCard emerald">
                <h4 className="sectionTitle">Customer Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="fieldLabel">Customer Name *</label>
                    <input className="input" value={requestedLoanEditModal.form.customer_name} onChange={(e) => setRequestedLoanEditField('customer_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Contact *</label>
                    <input className="input" value={requestedLoanEditModal.form.contact_no} onChange={(e) => setRequestedLoanEditField('contact_no', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Loan Request Date *</label>
                    <input className="input" type="date" value={requestedLoanEditModal.form.loan_request_date} onChange={(e) => setRequestedLoanEditField('loan_request_date', e.target.value)} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="fieldLabel">Address *</label>
                    <input className="input" value={requestedLoanEditModal.form.address} onChange={(e) => setRequestedLoanEditField('address', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Bank Name</label>
                    <input className="input" value={requestedLoanEditModal.form.bank_name} onChange={(e) => setRequestedLoanEditField('bank_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Bank Branch</label>
                    <input className="input" value={requestedLoanEditModal.form.bank_branch} onChange={(e) => setRequestedLoanEditField('bank_branch', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Bank Account No</label>
                    <input className="input" value={requestedLoanEditModal.form.bank_account_no} onChange={(e) => setRequestedLoanEditField('bank_account_no', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {requestedLoanEditModal.activeStep === 4 && (
              <div className="sectionCard cyan">
                <h4 className="sectionTitle">Guarantors</h4>
                <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 text-sm text-slate-700">
                  {(currentRequestedEditLoan?.guarantors || []).length === 0 ? (
                    <p>No guarantors available for this request.</p>
                  ) : (
                    <div className="space-y-2">
                      {(currentRequestedEditLoan?.guarantors || []).map((guarantor, index) => (
                        <div key={`preview-guarantor-${index}`} className="rounded-lg border border-cyan-100 bg-white p-3">
                          <p className="font-semibold text-slate-900">{guarantor.name || '-'}</p>
                          <p className="text-xs text-slate-600">NIC: {guarantor.nic || '-'} | Relationship: {guarantor.relationship || '-'} | Contact: {guarantor.contact_no || '-'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {requestedLoanEditModal.activeStep === 5 && (
              <div className="sectionCard blue">
                <h4 className="sectionTitle">Loan Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="fieldLabel">Loan Amount *</label>
                    <input className="input" type="number" min="0" step="0.01" value={requestedLoanEditModal.form.loan_amount} onChange={(e) => setRequestedLoanEditField('loan_amount', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Interest Rate (%) *</label>
                    <input className="input" type="number" min="0" step="0.0000001" value={requestedLoanEditModal.form.interest_rate} onChange={(e) => setRequestedLoanEditField('interest_rate', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Terms Count *</label>
                    <input className="input" type="number" min="1" step="1" value={requestedLoanEditModal.form.terms_count} onChange={(e) => setRequestedLoanEditField('terms_count', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Refund Option *</label>
                    <select className="input" value={requestedLoanEditModal.form.refund_option} onChange={(e) => setRequestedLoanEditField('refund_option', e.target.value as RequestedLoanEditForm['refund_option'])}>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </select>
                  </div>
                  <div>
                    <label className="fieldLabel">Interest Type *</label>
                    <select className="input" value={requestedLoanEditModal.form.interest_type} onChange={(e) => setRequestedLoanEditField('interest_type', e.target.value as RequestedLoanEditForm['interest_type'])}>
                      <option value="flat">Flat</option>
                      <option value="reducing">Reducing</option>
                    </select>
                  </div>
                  <div>
                    <label className="fieldLabel">Collection Mode *</label>
                    <select className="input" value={requestedLoanEditModal.form.charge_payment_mode} onChange={(e) => setRequestedLoanEditField('charge_payment_mode', e.target.value as RequestedLoanEditForm['charge_payment_mode'])}>
                      <option value="hand_cash">Hand Cash</option>
                      <option value="deduct_from_loan">Deduct From Loan</option>
                    </select>
                  </div>
                  <div>
                    <label className="fieldLabel">Refundable Amount</label>
                    <input className="input" type="number" min="0" step="0.01" value={requestedLoanEditModal.form.refundable_amount} onChange={(e) => setRequestedLoanEditField('refundable_amount', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Installment Amount</label>
                    <input className="input" type="number" min="0" step="0.01" value={requestedLoanEditModal.form.installment_amount} onChange={(e) => setRequestedLoanEditField('installment_amount', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Charges Collection Status</label>
                    <select className="input" value={requestedLoanEditModal.form.charges_collection_status} onChange={(e) => setRequestedLoanEditField('charges_collection_status', e.target.value as RequestedLoanEditForm['charges_collection_status'])}>
                      <option value="pending">Pending</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <div>
                    <label className="fieldLabel">Document Charges</label>
                    <input className="input" type="number" min="0" step="0.01" value={requestedLoanEditModal.form.document_charges} onChange={(e) => setRequestedLoanEditField('document_charges', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Stamp Charges</label>
                    <input className="input" type="number" min="0" step="0.01" value={requestedLoanEditModal.form.stamp_charges} onChange={(e) => setRequestedLoanEditField('stamp_charges', e.target.value)} />
                  </div>
                  <div>
                    <label className="fieldLabel">Insurance Charges</label>
                    <input className="input" type="number" min="0" step="0.01" value={requestedLoanEditModal.form.insurance_charges} onChange={(e) => setRequestedLoanEditField('insurance_charges', e.target.value)} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="fieldLabel">Reason</label>
                    <textarea className="input" rows={3} value={requestedLoanEditModal.form.reason} onChange={(e) => setRequestedLoanEditField('reason', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={prevRequestedLoanEditStep}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                disabled={requestedLoanEditModal.saving || requestedLoanEditModal.activeStep === 1}
              >
                Back Step
              </button>
              {requestedLoanEditModal.activeStep < requestedLoanEditSteps.length ? (
                <button
                  type="button"
                  onClick={nextRequestedLoanEditStep}
                  className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white"
                  disabled={requestedLoanEditModal.saving}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitRequestedLoanEdit}
                  className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                  disabled={requestedLoanEditModal.saving}
                >
                  {requestedLoanEditModal.saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
              <button
                type="button"
                onClick={closeRequestedLoanEditModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                disabled={requestedLoanEditModal.saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-emerald-100">
            <h3 className="text-lg font-bold text-slate-900">{modal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{modal.message}</p>
            <div className="mt-5 flex justify-end">
              {modal.onConfirm ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold"
                  >
                    {modal.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    onClick={confirmModal}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold"
                  >
                    {modal.confirmLabel || 'Confirm'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
