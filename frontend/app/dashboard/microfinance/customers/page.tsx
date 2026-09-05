'use client';

import axios from 'axios';
import { getApiBaseUrl, resolveStorageAssetUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, Eye, Search, SlidersHorizontal, Users, UserPlus, UserRoundPen } from 'lucide-react';

type Customer = {
  id: number;
  branch_id?: number | string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  name?: string;
  customer_code?: string;
  phone?: string;
  contact_number?: string;
  email?: string;
  nic_passport?: string;
  permanent_address?: string;
  current_address?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other' | string;
  marital_status?: 'single' | 'married' | 'divorced' | 'widowed' | string;
  nationality?: string;
  employment_type?: 'salaried' | 'self_employed' | 'business' | string;
  employer_name?: string;
  job_title?: string;
  monthly_income?: number | string;
  other_income_sources?: string;
  existing_loans?: boolean;
  monthly_loan_obligations?: number | string;
  credit_score?: number | string;
  status?: string;
  old_nic?: string;
  additional_details?: Record<string, unknown>;
};

type AuthUser = {
  id: number;
  branch_id?: number | null;
  designation?: { id: number; name: string } | null;
};

type RegisterStepId = 1 | 2;

const REGISTER_STEP_SEQUENCE: RegisterStepId[] = [1, 2];

type RegisterRelationalEntry = {
  name: string;
  relationship: string;
  contact_no: string;
  signature_file: File | null;
};

type UploadedCustomerDocument = {
  id: number;
  document_type: string;
  original_name: string;
  file_path: string;
};

type NicParseResult = {
  normalizedNic: string;
  oldNic?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female';
};

const parseSriLankanNic = (rawNic: string, allowTenDigitLegacy = false): NicParseResult => {
  const normalizedInput = rawNic.replace(/\s+/g, '').toUpperCase();
  let normalizedNic = normalizedInput;
  let oldNic: string | undefined;
  let year: number | null = null;
  let dayCode: number | null = null;

  // Legacy format support: 9306701924V -> 199306701924
  // For 10-digit only values, convert only on blur to avoid mutating a new 12-digit NIC while typing.
  if (/^\d{10}[VX]$/.test(normalizedInput) || (allowTenDigitLegacy && /^\d{10}$/.test(normalizedInput))) {
    const digits = normalizedInput.slice(0, 10);
    year = 1900 + Number(digits.slice(0, 2));
    dayCode = Number(digits.slice(2, 5));
    const suffix = normalizedInput.length === 11 ? normalizedInput.slice(-1) : 'V';
    oldNic = `${digits}${suffix}`;
    normalizedNic = `19${digits}`;
  } else if (/^\d{12}$/.test(normalizedInput)) {
    year = Number(normalizedInput.slice(0, 4));
    dayCode = Number(normalizedInput.slice(4, 7));
    normalizedNic = normalizedInput;
  }

  if (!year || !dayCode || dayCode <= 0) {
    return { normalizedNic, oldNic };
  }

  let gender: 'male' | 'female' = 'male';
  if (dayCode > 500) {
    gender = 'female';
    dayCode -= 500;
  }

  if (dayCode < 1 || dayCode > 366) {
    return { normalizedNic, oldNic, gender };
  }

  const date = new Date(year, 0);
  date.setDate(dayCode);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateOfBirth = `${year}-${month}-${day}`;

  return {
    normalizedNic,
    oldNic,
    dateOfBirth,
    gender,
  };
};

const BUSINESS_TYPE_OPTIONS: string[] = [
  'Retail Shop',
  'Wholesale',
  'Manufacturing',
  'Agriculture',
  'Fisheries',
  'Construction',
  'Transport',
  'Tourism',
  'IT Services',
  'Healthcare',
  'Education',
  'Professional Services',
  'Real Estate',
  'Media & Communication',
  'Energy & Utilities',
  'Mining & Gems',
  'Government & Public Sector',
  'Personal Services',
  'Entertainment',
  'Automotive',
  'Import & Export',
  'Other',
];

const EMPLOYMENT_TYPE_OPTIONS: string[] = [
  'Salaried',
  'Self Employed',
  'Business Owner',
  'Daily Wage',
  'Contract Worker',
  'Farmer',
  'Fisherman',
  'Retired',
  'Unemployed',
  'Other',
];

type IndustryGroup = {
  category: string;
  items: string[];
};

const INDUSTRY_GROUPS: IndustryGroup[] = [
  { category: 'Retail & Trade', items: ['Retail Shop', 'Wholesale', 'Supermarket', 'Pharmacy', 'Hardware'] },
  { category: 'Agriculture', items: ['Crop Farming', 'Livestock', 'Poultry', 'Dairy', 'Agri Services'] },
  { category: 'Manufacturing', items: ['Food Processing', 'Textiles', 'Woodwork', 'Metalwork', 'Small Manufacturing'] },
  { category: 'Services', items: ['Professional Services', 'Personal Services', 'Education', 'Healthcare', 'IT Services'] },
  { category: 'Transport & Logistics', items: ['Transport', 'Courier', 'Delivery', 'Vehicle Hire', 'Warehousing'] },
  { category: 'Construction & Real Estate', items: ['Construction', 'Building Materials', 'Real Estate', 'Property Management'] },
  { category: 'Hospitality & Tourism', items: ['Hotel', 'Restaurant', 'Catering', 'Tour Services', 'Guest House'] },
  { category: 'Automotive', items: ['Vehicle Sales', 'Vehicle Repair', 'Service Station', 'Spare Parts'] },
  { category: 'Import & Export', items: ['Export', 'Import', 'Trading', 'Customs Clearing'] },
  { category: 'Other', items: ['Other'] },
];

const REGISTER_STEPS: Array<{ id: RegisterStepId; title: string; hint: string }> = [
  { id: 1, title: 'Basic & Identity', hint: 'Contact and identity details' },
  { id: 2, title: 'Residence & Employment', hint: 'Living and job information' },
];

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

type CompletionMeta = {
  score: number;
  missing: string[];
};

const computeCompletionMeta = (checks: Array<{ label: string; ok: boolean }>): CompletionMeta => {
  const completed = checks.filter((check) => check.ok).length;
  const missing = checks.filter((check) => !check.ok).map((check) => check.label);

  return {
    score: Math.round((completed / checks.length) * 100),
    missing,
  };
};

const getProfileCompletionMeta = (customer: Customer): CompletionMeta => {
  const details = asRecord(customer.additional_details);
  const identity = asRecord(details.identity);
  const contact = asRecord(details.contact);
  const residence = asRecord(details.residence);
  const employment = asRecord(details.employment);
  const family = asRecord(details.family_information);
  const banking = asRecord(details.banking_relationships);
  const risk = asRecord(details.risk_assessment);
  const residenceEnvironment = asRecord(details.residence_environment);

  const fullName = `${String(customer.first_name || '').trim()} ${String(customer.last_name || '').trim()}`.trim();
  const relationals = Array.isArray(family.relationals) ? family.relationals : [];

  const checks = [
    { label: 'Customer number', ok: hasValue(customer.customer_code) },
    {
      label: 'Full name with initials',
      ok: hasValue(identity.full_name_with_initials) || hasValue(customer.full_name) || hasValue(customer.name) || hasValue(fullName),
    },
    { label: 'Primary mobile number', ok: hasValue(customer.phone) || hasValue(customer.contact_number) },
    { label: 'NIC or old NIC', ok: hasValue(customer.nic_passport) || hasValue(customer.old_nic) },
    { label: 'Email', ok: hasValue(customer.email) },
    { label: 'Date of birth', ok: hasValue(customer.date_of_birth) },
    { label: 'Gender', ok: hasValue(customer.gender) },
    { label: 'Marital status', ok: hasValue(customer.marital_status) },
    { label: 'Nationality', ok: hasValue(customer.nationality) },
    { label: 'Permanent address', ok: hasValue(customer.permanent_address) || hasValue(residence.permanent_address) },
    { label: 'Current address', ok: hasValue(customer.current_address) || hasValue(residence.current_address) },
    { label: 'Second mobile number', ok: hasValue(contact.second_mobile) },
    { label: 'Office phone', ok: hasValue(contact.office_phone) },
    { label: 'WhatsApp number', ok: hasValue(contact.whatsapp_number) },
    { label: 'Emergency contact', ok: hasValue(contact.emergency_contact) },
    { label: 'Preferred communication method', ok: hasValue(contact.preferred_communication_method) },
    { label: 'Employment type', ok: hasValue(customer.employment_type) || hasValue(employment.employment_type) },
    { label: 'Employer name', ok: hasValue(customer.employer_name) || hasValue(employment.employer_name) },
    { label: 'Monthly salary or income', ok: hasValue(customer.monthly_income) || hasValue(employment.monthly_salary) },
    { label: 'Credit score', ok: hasValue(customer.credit_score) },
    { label: 'Family relationals', ok: relationals.length > 0 },
    { label: 'Primary bank name', ok: hasValue(banking.primary_bank_name) },
    { label: 'Bank account number', ok: hasValue(banking.account_number) },
    { label: 'Risk assessment score', ok: hasValue(risk.total_score) },
    { label: 'Residence images', ok: Number(residenceEnvironment.images_count || 0) > 0 },
  ];

  return computeCompletionMeta(checks);
};

const getProfileCompletionScore = (customer: Customer): number => {
  return getProfileCompletionMeta(customer).score;
};

const getDocumentCompletionMeta = (customer: Customer): CompletionMeta => {
  const details = asRecord(customer.additional_details);
  const identity = asRecord(details.identity);
  const employment = asRecord(details.employment);
  const businessInfo = asRecord(details.business_information);
  const residenceEnvironment = asRecord(details.residence_environment);

  const checks = [
    {
      label: 'Identity proof',
      ok:
        hasValue(customer.nic_passport) ||
        hasValue((customer as Customer & { passport_no?: string }).passport_no) ||
        hasValue((customer as Customer & { driving_license_no?: string }).driving_license_no) ||
        hasValue(identity.passport_no) ||
        hasValue(identity.driving_license_no),
    },
    {
      label: 'Paysheet files',
      ok:
        Number(employment.paysheet_files_count || 0) > 0 ||
        (Array.isArray(employment.paysheet_file_names) && employment.paysheet_file_names.length > 0),
    },
    {
      label: 'Business documents',
      ok:
        Number(businessInfo.business_documents_count || 0) > 0 ||
        (Array.isArray(businessInfo.business_document_names) && businessInfo.business_document_names.length > 0),
    },
    {
      label: 'Residence environment images',
      ok:
        Number(residenceEnvironment.images_count || 0) > 0 ||
        (Array.isArray(residenceEnvironment.image_names) && residenceEnvironment.image_names.length > 0),
    },
  ];

  return computeCompletionMeta(checks);
};

const getDocumentCompletionScore = (customer: Customer): number => {
  return getDocumentCompletionMeta(customer).score;
};

const API_BASE = getApiBaseUrl();

const extractAxiosErrorMessage = (error: unknown, fallback: string): string => {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const responseData = error.response?.data as
    | { message?: unknown; errors?: Record<string, unknown> }
    | undefined;

  const errors = responseData?.errors;
  if (errors && typeof errors === 'object') {
    for (const value of Object.values(errors)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
        return value[0];
      }
      if (typeof value === 'string' && value.trim() !== '') {
        return value;
      }
    }
  }

  if (typeof responseData?.message === 'string' && responseData.message.trim() !== '') {
    return responseData.message;
  }

  return fallback;
};

export default function MicrofinanceCustomersPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageSize, setPageSize] = useState(12);
  const [currentPage, setCurrentPage] = useState(1);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [hoveredScoreDetails, setHoveredScoreDetails] = useState<{
    title: string;
    missing: string[];
  } | null>(null);
  const [registerSaving, setRegisterSaving] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerStep, setRegisterStep] = useState<RegisterStepId>(1);
  const [registerMode, setRegisterMode] = useState<'create' | 'update'>('create');
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [registerDocuments, setRegisterDocuments] = useState<Record<string, File | null>>({});
  const [existingCustomerDocuments, setExistingCustomerDocuments] = useState<UploadedCustomerDocument[]>([]);
  const [removingDocumentIds, setRemovingDocumentIds] = useState<number[]>([]);
  const [documentPreview, setDocumentPreview] = useState<{
    open: boolean;
    title: string;
    url: string;
    kind: 'image' | 'pdf' | 'other';
    usesObjectUrl: boolean;
  }>({
    open: false,
    title: '',
    url: '',
    kind: 'other',
    usesObjectUrl: false,
  });
  const [registerPhotoFile, setRegisterPhotoFile] = useState<File | null>(null);
  const [registerPaysheetFiles, setRegisterPaysheetFiles] = useState<File[]>([]);
  const [registerBusinessDocumentFiles, setRegisterBusinessDocumentFiles] = useState<File[]>([]);
  const [registerRelationals, setRegisterRelationals] = useState<RegisterRelationalEntry[]>([
    { name: '', relationship: '', contact_no: '', signature_file: null },
  ]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [profileError, setProfileError] = useState('');
  const [registerForm, setRegisterForm] = useState({
    customer_code: '',
    full_name_with_initials: '',
    phone: '',
    phone_secondary: '',
    whatsapp_number: '',
    office_phone: '',
    email: '',
    emergency_contact: '',
    preferred_communication_method: '',
    nic_passport: '',
    old_nic: '',
    passport_no: '',
    driving_license_no: '',
    tax_identification_no: '',
    biometric_reference: '',
    date_of_birth: '',
    gender: 'male',
    marital_status: '',
    nationality: '',
    employment_type: '',
    employer_name: '',
    designation: '',
    industry: '',
    years_of_service: '',
    monthly_salary: '',
    other_income: '',
    salary_bank: '',
    salary_date: '',
    job_title: '',
    monthly_income: '',
    business_name: '',
    business_registration_no: '',
    business_address: '',
    business_type: '',
    years_in_business: '',
    family_members_count: '',
    dependents_count: '',
    spouse_name: '',
    emergency_contact_name: '',
    emergency_contact_no: '',
    monthly_expenses: '',
    savings_habit: '',
    repayment_behaviour: '',
    primary_bank_name: '',
    bank_branch: '',
    account_number: '',
    relationship_years: '',
    existing_loan_lender: '',
    existing_loan_outstanding: '',
    credit_history_notes: '',
    permanent_address: '',
    current_address: '',
    other_income_sources: '',
    existing_loans: false,
    monthly_loan_obligations: '',
    credit_score: '',
  });
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    nic_passport: '',
    email: '',
    date_of_birth: '',
    gender: 'other',
    marital_status: '',
    nationality: '',
    permanent_address: '',
    current_address: '',
    employment_type: '',
    employer_name: '',
    job_title: '',
    monthly_income: '',
    other_income_sources: '',
    existing_loans: false,
    monthly_loan_obligations: '',
    credit_score: '',
    status: 'active',
  });

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }),
    [token]
  );

  const designationName = String(authUser?.designation?.name || '').toLowerCase();
  const isFieldOfficer = designationName.includes('field') && designationName.includes('officer');

  const fetchWidgetPreferences = async (authToken: string) => {
    setLoadingWidgets(true);
    try {
      const response = await axios.get(`${API_BASE}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of rows) {
        const key = String(row?.widget_key || '').trim();
        if (!key.startsWith('mf_customers_widget_')) continue;
        if (row?.is_visible === false) nextHidden.add(key);
      }
      setHiddenWidgetKeys(nextHidden);
    } catch {
      setHiddenWidgetKeys(new Set());
    } finally {
      setLoadingWidgets(false);
    }
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        `${API_BASE}/dashboard/widgets`,
        { widget_key: widgetKey, is_visible: isVisible },
        { headers }
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
      setWidgetNotice({
        open: true,
        title: 'Widget Update Failed',
        message: 'Failed to hide this card. Please try again.',
      });
    }
  };

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
    }
  }, [router]);

  const filteredCustomers = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return customers.filter((customer) => {
      if (statusFilter !== 'all' && (customer.status || '').toLowerCase() !== statusFilter) {
        return false;
      }

      if (!keyword) return true;

      const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
      const haystack = [
        customer.full_name || '',
        customer.name || '',
        fullName,
        customer.customer_code || '',
        customer.nic_passport || '',
        customer.phone || customer.contact_number || '',
        customer.current_address || '',
        customer.permanent_address || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [customers, query, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + pageSize);

  const activeCount = useMemo(
    () => customers.filter((c) => (c.status || '').toLowerCase() === 'active').length,
    [customers]
  );

  const averageCompletionScore = useMemo(() => {
    if (customers.length === 0) return 0;
    const total = customers.reduce((sum, customer) => sum + getProfileCompletionScore(customer), 0);
    return Math.round(total / customers.length);
  }, [customers]);

  const averageDocumentCompletionScore = useMemo(() => {
    if (customers.length === 0) return 0;
    const total = customers.reduce((sum, customer) => sum + getDocumentCompletionScore(customer), 0);
    return Math.round(total / customers.length);
  }, [customers]);

  const summaryCards = [
    {
      key: 'mf_customers_widget_total_customers',
      label: 'Total Customers',
      value: String(customers.length),
      valueClass: 'text-amber-600',
      borderClass: 'border-amber-100',
    },
    {
      key: 'mf_customers_widget_active_customers',
      label: 'Active Customers',
      value: String(activeCount),
      valueClass: 'text-cyan-600',
      borderClass: 'border-cyan-100',
    },
    {
      key: 'mf_customers_widget_showing_range',
      label: 'Showing',
      value:
        filteredCustomers.length === 0
          ? '0'
          : `${startIndex + 1}-${Math.min(startIndex + pageSize, filteredCustomers.length)}`,
      valueClass: 'text-blue-600',
      borderClass: 'border-blue-100',
    },
    {
      key: 'mf_customers_widget_average_profile_completion',
      label: 'Avg Completion',
      value: `${averageCompletionScore}%`,
      valueClass: 'text-emerald-600',
      borderClass: 'border-emerald-100',
    },
    {
      key: 'mf_customers_widget_average_document_completion',
      label: 'Avg Document Completion',
      value: `${averageDocumentCompletionScore}%`,
      valueClass: 'text-teal-600',
      borderClass: 'border-teal-100',
    },
  ];

  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showFiltersPanel = !hiddenWidgetKeys.has('mf_customers_widget_filters_panel');
  const showExportButtons = !hiddenWidgetKeys.has('mf_customers_widget_export_buttons');
  const showPaginationControls = !hiddenWidgetKeys.has('mf_customers_widget_pagination_controls');

  const exportRows = useMemo(
    () =>
      filteredCustomers.map((customer) => {
        const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
        return {
          id: customer.id,
          name: customer.full_name || customer.name || fullName || `Customer #${customer.id}`,
          customerNo: customer.customer_code || '',
          nic: customer.nic_passport || '',
          phone: customer.phone || customer.contact_number || '',
          status: customer.status || '',
          address: customer.current_address || customer.permanent_address || '',
          completionScore: `${getProfileCompletionScore(customer)}%`,
          documentCompletionScore: `${getDocumentCompletionScore(customer)}%`,
        };
      }),
    [filteredCustomers]
  );

  const downloadCsv = () => {
    if (exportRows.length === 0) return;

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? '');
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const headersRow = ['ID', 'Customer Name', 'Customer No', 'NIC', 'Phone', 'Address', 'Status', 'Completion Score', 'Document Completion'];
    const bodyRows = exportRows.map((row) => [
      row.id,
      row.name,
      row.customerNo,
      row.nic,
      row.phone,
      row.address,
      row.status,
      row.completionScore,
      row.documentCompletionScore,
    ]);

    const csvContent = [headersRow, ...bodyRows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `microfinance-customers-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (exportRows.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const stamp = new Date().toISOString().slice(0, 10);

    doc.setFontSize(14);
    doc.text('Microfinance Customers', 40, 36);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Export Date: ${stamp}`, 40, 52);

    autoTable(doc, {
      startY: 64,
      head: [['ID', 'Customer Name', 'Customer No', 'NIC', 'Phone', 'Address', 'Status', 'Completion Score', 'Document Completion']],
      body: exportRows.map((row) => [
        row.id,
        row.name,
        row.customerNo,
        row.nic,
        row.phone,
        row.address,
        row.status,
        row.completionScore,
        row.documentCompletionScore,
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      margin: { left: 26, right: 26 },
    });

    doc.save(`microfinance-customers-${stamp}.pdf`);
  };

  const resetRegisterForm = () => {
    setRegisterForm({
      customer_code: '',
      full_name_with_initials: '',
      phone: '',
      phone_secondary: '',
      whatsapp_number: '',
      office_phone: '',
      email: '',
      emergency_contact: '',
      preferred_communication_method: '',
      nic_passport: '',
      old_nic: '',
      passport_no: '',
      driving_license_no: '',
      tax_identification_no: '',
      biometric_reference: '',
      date_of_birth: '',
      gender: 'male',
      marital_status: '',
      nationality: '',
      employment_type: '',
      employer_name: '',
      designation: '',
      industry: '',
      years_of_service: '',
      monthly_salary: '',
      other_income: '',
      salary_bank: '',
      salary_date: '',
      job_title: '',
      monthly_income: '',
      business_name: '',
      business_registration_no: '',
      business_address: '',
      business_type: '',
      years_in_business: '',
      family_members_count: '',
      dependents_count: '',
      spouse_name: '',
      emergency_contact_name: '',
      emergency_contact_no: '',
      monthly_expenses: '',
      savings_habit: '',
      repayment_behaviour: '',
      primary_bank_name: '',
      bank_branch: '',
      account_number: '',
      relationship_years: '',
      existing_loan_lender: '',
      existing_loan_outstanding: '',
      credit_history_notes: '',
      permanent_address: '',
      current_address: '',
      other_income_sources: '',
      existing_loans: false,
      monthly_loan_obligations: '',
      credit_score: '',
    });
    setRegisterDocuments({});
    setExistingCustomerDocuments([]);
    setRemovingDocumentIds([]);
    setRegisterPhotoFile(null);
    setRegisterPaysheetFiles([]);
    setRegisterBusinessDocumentFiles([]);
    setRegisterRelationals([{ name: '', relationship: '', contact_no: '', signature_file: null }]);
    setRegisterStep(1);
    setRegisterError('');
  };

  const openRegisterModal = () => {
    resetRegisterForm();
    setRegisterMode('create');
    setEditingCustomerId(null);
    setRegisterModalOpen(true);
  };

  const closeRegisterModal = () => {
    if (registerSaving) return;
    setRegisterModalOpen(false);
    setRegisterMode('create');
    setEditingCustomerId(null);
    setRegisterError('');
  };

  const updateRegisterDocument = (label: string, file: File | null) => {
    setRegisterDocuments((prev) => ({
      ...prev,
      [label]: file,
    }));
  };

  const getExistingDocuments = (matcher: (document: UploadedCustomerDocument) => boolean) => {
    return existingCustomerDocuments.filter(matcher);
  };

  const closeDocumentPreview = () => {
    setDocumentPreview((prev) => {
      if (prev.usesObjectUrl && prev.url.startsWith('blob:')) {
        URL.revokeObjectURL(prev.url);
      }

      return {
        open: false,
        title: '',
        url: '',
        kind: 'other',
        usesObjectUrl: false,
      };
    });
  };

  const detectDocumentKind = (nameOrPath: string): 'image' | 'pdf' | 'other' => {
    const value = nameOrPath.toLowerCase();
    if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.bmp|\.svg)$/.test(value)) return 'image';
    if (value.endsWith('.pdf')) return 'pdf';
    return 'other';
  };

  const openDocumentPreview = (title: string, url: string, kindHint: string, usesObjectUrl = false) => {
    if (!url) {
      setWidgetNotice({
        open: true,
        title: 'Preview Unavailable',
        message: 'Could not open preview for this document.',
      });
      return;
    }

    setDocumentPreview((prev) => {
      if (prev.usesObjectUrl && prev.url.startsWith('blob:')) {
        URL.revokeObjectURL(prev.url);
      }

      return {
        open: true,
        title,
        url,
        kind: detectDocumentKind(kindHint),
        usesObjectUrl,
      };
    });
  };

  const openExistingDocumentPreview = async (document: UploadedCustomerDocument, label: string) => {
    const title = document.original_name || 'Document';
    const kindHint = `${document.original_name} ${document.file_path}`;

    if (editingCustomerId) {
      try {
        const response = await axios.get(
          `${API_BASE}/customers/${editingCustomerId}/documents/${document.id}/download`,
          {
            headers,
            responseType: 'blob',
          }
        );

        const blobUrl = URL.createObjectURL(response.data as Blob);
        openDocumentPreview(title, blobUrl, kindHint, true);
        return;
      } catch {
        // Fallback to storage path preview below.
      }
    }

    const fallbackUrl = resolveStorageAssetUrl(document.file_path);
    if (!fallbackUrl) {
      setWidgetNotice({
        open: true,
        title: 'Preview Unavailable',
        message: `Could not open ${label} document preview.`,
      });
      return;
    }

    openDocumentPreview(title, fallbackUrl, kindHint, false);
  };

  const removeExistingDocument = async (documentId: number) => {
    if (!editingCustomerId) return;

    setRemovingDocumentIds((prev) => [...prev, documentId]);

    try {
      await axios.delete(`${API_BASE}/customers/${editingCustomerId}/documents/${documentId}`, { headers });
      setExistingCustomerDocuments((prev) => prev.filter((document) => document.id !== documentId));
      await loadCustomers();
    } catch {
      setWidgetNotice({
        open: true,
        title: 'Document Remove Failed',
        message: 'Could not remove the uploaded document. Please try again.',
      });
    } finally {
      setRemovingDocumentIds((prev) => prev.filter((id) => id !== documentId));
    }
  };

  const renderExistingDocumentChip = (document: UploadedCustomerDocument, label: string) => {
    return (
      <div
        key={`existing-${label}-${document.id}`}
        className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
      >
        <span className="truncate">{document.original_name}</span>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100"
          onClick={() => void openExistingDocumentPreview(document, label)}
          aria-label={`View uploaded ${label} document`}
        >
          <Eye className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="h-5 w-5 rounded-full border border-slate-300 text-[11px] font-bold leading-none text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          onClick={() => void removeExistingDocument(document.id)}
          disabled={removingDocumentIds.includes(document.id)}
          aria-label={`Remove uploaded ${label} document`}
        >
          ×
        </button>
      </div>
    );
  };

  const handleRegisterNicChange = (value: string) => {
    const parsed = parseSriLankanNic(value, false);

    setRegisterForm((prev) => ({
      ...prev,
      nic_passport: parsed.normalizedNic,
      old_nic: parsed.oldNic || '',
      date_of_birth: parsed.dateOfBirth || prev.date_of_birth,
      gender: parsed.gender || prev.gender,
    }));
  };

  const handleRegisterNicBlur = () => {
    const parsed = parseSriLankanNic(registerForm.nic_passport, true);

    setRegisterForm((prev) => ({
      ...prev,
      nic_passport: parsed.normalizedNic,
      old_nic: parsed.oldNic || '',
      date_of_birth: parsed.dateOfBirth || prev.date_of_birth,
      gender: parsed.gender || prev.gender,
    }));
  };

  const validateRegisterStep = (step: RegisterStepId): string | null => {
    if (step === 1) {
      if (!registerForm.full_name_with_initials.trim()) return 'Full Name with Initials is required.';
      if (!registerForm.phone.trim()) return 'Contact No. 01 is required.';
      if (!registerForm.nic_passport.trim()) return 'NIC is required.';
      if (!registerForm.date_of_birth) return 'Date of Birth is required.';
      return null;
    }

    if (step === 2) {
      if (!registerForm.permanent_address.trim()) return 'Permanent Address is required.';
      return null;
    }

    return null;
  };

  const goNextRegisterStep = () => {
    const error = validateRegisterStep(registerStep);
    if (error) {
      setRegisterError(error);
      return;
    }

    setRegisterError('');
    setRegisterStep((prev) => {
      const currentIndex = REGISTER_STEP_SEQUENCE.indexOf(prev);
      if (currentIndex < 0) return 1;
      return REGISTER_STEP_SEQUENCE[Math.min(currentIndex + 1, REGISTER_STEP_SEQUENCE.length - 1)];
    });
  };

  const goPreviousRegisterStep = () => {
    setRegisterError('');
    setRegisterStep((prev) => {
      const currentIndex = REGISTER_STEP_SEQUENCE.indexOf(prev);
      if (currentIndex < 0) return 1;
      return REGISTER_STEP_SEQUENCE[Math.max(currentIndex - 1, 0)];
    });
  };

  const generateCustomerCode = async () => {
    try {
      const response = await axios.get(`${API_BASE}/customers/generate-code`, { headers });
      const generated = String(response.data?.customer_no || '').trim();
      if (!generated) {
        setRegisterError('Could not generate customer code.');
        return;
      }

      setRegisterForm((prev) => ({ ...prev, customer_code: generated }));
      setRegisterError('');
    } catch {
      setRegisterError('Failed to generate customer code.');
    }
  };

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/customers`, {
        headers,
        params:
          isFieldOfficer && authUser?.branch_id
            ? { per_page: 1000, branch_id: authUser.branch_id }
            : { per_page: 1000 },
      });

      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      const scopedRows =
        isFieldOfficer && authUser?.branch_id
          ? rows.filter((row: Customer) => Number(row.branch_id || 0) === Number(authUser.branch_id || 0))
          : rows;

      setCustomers(scopedRows);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [headers, isFieldOfficer, authUser?.branch_id]);

  useEffect(() => {
    if (!token) return;
    void loadCustomers();
  }, [token, loadCustomers]);

  const openProfileModal = async (customerId: number) => {
    setProfileLoading(true);
    setProfileError('');

    try {
      const response = await axios.get(`${API_BASE}/customers/${customerId}`, { headers });
      const documentsResponse = await axios.get(`${API_BASE}/customers/${customerId}/documents`, { headers });
      const c = response.data || {};
      const documentsRows = Array.isArray(documentsResponse.data?.data) ? documentsResponse.data.data : [];
      const details = c.additional_details && typeof c.additional_details === 'object' ? c.additional_details : {};
      const identity = details.identity && typeof details.identity === 'object' ? details.identity : {};
      const contact = details.contact && typeof details.contact === 'object' ? details.contact : {};
      const residence = details.residence && typeof details.residence === 'object' ? details.residence : {};
      const employment = details.employment && typeof details.employment === 'object' ? details.employment : {};
      const businessInfo = details.business_information && typeof details.business_information === 'object' ? details.business_information : {};
      const familyInfo = details.family_information && typeof details.family_information === 'object' ? details.family_information : {};
      const financialBehaviour = details.financial_behaviour && typeof details.financial_behaviour === 'object' ? details.financial_behaviour : {};
      const banking = details.banking_relationships && typeof details.banking_relationships === 'object' ? details.banking_relationships : {};
      const existingLoans = details.existing_loans && typeof details.existing_loans === 'object' ? details.existing_loans : {};
      const creditHistory = details.credit_history && typeof details.credit_history === 'object' ? details.credit_history : {};
      const relationalsSource = Array.isArray(familyInfo.relationals) ? familyInfo.relationals : [];

      const fullNameWithInitials =
        (typeof identity.full_name_with_initials === 'string' ? identity.full_name_with_initials : '').trim() ||
        `${String(c.first_name || '').trim()} ${String(c.last_name || '').trim()}`.trim();

      setRegisterForm((prev) => ({
        ...prev,
        customer_code: String(c.customer_code || ''),
        full_name_with_initials: fullNameWithInitials,
        phone: String(c.phone || ''),
        phone_secondary: String(contact.second_mobile || contact.contact_no_02 || ''),
        whatsapp_number: String(contact.whatsapp_number || contact.whatsapp || ''),
        office_phone: String(contact.office_phone || contact.contact_no_02 || ''),
        email: String(c.email || ''),
        emergency_contact: String(contact.emergency_contact || familyInfo.emergency_contact_no || ''),
        preferred_communication_method: String(
          contact.preferred_communication_method || contact.preferred_contact_method || ''
        ),
        nic_passport: String(c.nic_passport || ''),
        old_nic: String(c.old_nic || identity.old_nic || ''),
        passport_no: String(c.passport_no || identity.passport_no || ''),
        driving_license_no: String(c.driving_license_no || identity.driving_license_no || ''),
        tax_identification_no: String(c.tax_identification_no || identity.tax_identification_no || ''),
        biometric_reference: String(c.biometric_reference || identity.biometric_reference || ''),
        date_of_birth: c.date_of_birth ? String(c.date_of_birth).slice(0, 10) : '',
        gender: String(c.gender || 'male'),
        marital_status: String(c.marital_status || ''),
        nationality: String(c.nationality || ''),
        employment_type: String(c.employment_type || employment.employment_type || ''),
        employer_name: String(c.employer_name || employment.employer_name || ''),
        designation: String(employment.designation || c.job_title || ''),
        industry: String(employment.industry || ''),
        years_of_service:
          employment.years_of_service === null || employment.years_of_service === undefined
            ? ''
            : String(employment.years_of_service),
        monthly_salary:
          employment.monthly_salary === null || employment.monthly_salary === undefined
            ? c.monthly_income === null || c.monthly_income === undefined
              ? ''
              : String(c.monthly_income)
            : String(employment.monthly_salary),
        other_income: String(employment.other_income || c.other_income_sources || ''),
        salary_bank: String(employment.salary_bank || ''),
        salary_date: String(employment.salary_date || ''),
        job_title: String(c.job_title || ''),
        monthly_income: c.monthly_income === null || c.monthly_income === undefined ? '' : String(c.monthly_income),
        business_name: String(businessInfo.business_name || ''),
        business_registration_no: String(businessInfo.business_registration_no || ''),
        business_address: String(businessInfo.business_address || ''),
        business_type: String(businessInfo.business_type || ''),
        years_in_business:
          businessInfo.years_in_business === null || businessInfo.years_in_business === undefined
            ? ''
            : String(businessInfo.years_in_business),
        family_members_count:
          familyInfo.family_members_count === null || familyInfo.family_members_count === undefined
            ? ''
            : String(familyInfo.family_members_count),
        dependents_count:
          familyInfo.dependents_count === null || familyInfo.dependents_count === undefined
            ? ''
            : String(familyInfo.dependents_count),
        spouse_name: String(familyInfo.spouse_name || ''),
        emergency_contact_name: String(familyInfo.emergency_contact_name || ''),
        emergency_contact_no: String(familyInfo.emergency_contact_no || ''),
        monthly_expenses:
          financialBehaviour.monthly_expenses === null || financialBehaviour.monthly_expenses === undefined
            ? ''
            : String(financialBehaviour.monthly_expenses),
        savings_habit: String(financialBehaviour.savings_habit || ''),
        repayment_behaviour: String(financialBehaviour.repayment_behaviour || ''),
        primary_bank_name: String(banking.primary_bank_name || ''),
        bank_branch: String(banking.bank_branch || ''),
        account_number: String(banking.account_number || ''),
        relationship_years:
          banking.relationship_years === null || banking.relationship_years === undefined
            ? ''
            : String(banking.relationship_years),
        existing_loan_lender: String(existingLoans.lender || ''),
        existing_loan_outstanding:
          existingLoans.outstanding_balance === null || existingLoans.outstanding_balance === undefined
            ? ''
            : String(existingLoans.outstanding_balance),
        credit_history_notes: String(creditHistory.notes || ''),
        permanent_address: String(c.permanent_address || residence.permanent_address || ''),
        current_address: String(c.current_address || residence.current_address || ''),
        other_income_sources: String(c.other_income_sources || employment.other_income_sources || ''),
        existing_loans: Boolean(c.existing_loans),
        monthly_loan_obligations:
          c.monthly_loan_obligations === null || c.monthly_loan_obligations === undefined
            ? ''
            : String(c.monthly_loan_obligations),
        credit_score: c.credit_score === null || c.credit_score === undefined ? '' : String(c.credit_score),
      }));

      setRegisterRelationals(
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

      setRegisterDocuments({});
      setExistingCustomerDocuments(
        documentsRows.map((document: Record<string, unknown>) => ({
          id: Number(document.id || 0),
          document_type: String(document.document_type || ''),
          original_name: String(document.original_name || 'Document'),
          file_path: String(document.file_path || ''),
        }))
      );
      setRegisterPhotoFile(null);
      setRegisterPaysheetFiles([]);
      setRegisterBusinessDocumentFiles([]);
      setRegisterMode('update');
      setEditingCustomerId(customerId);
      setRegisterStep(1);
      setRegisterError('');
      setRegisterModalOpen(true);
    } catch {
      setProfileError('Failed to load customer details.');
      setWidgetNotice({
        open: true,
        title: 'Error',
        message: 'Failed to load customer details for profile update.',
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setSelectedCustomerId(null);
    setProfileError('');
  };

  const handleProfileSave = async () => {
    if (!selectedCustomerId) return;

    setProfileSaving(true);
    setProfileError('');

    try {
      await axios.put(
        `${API_BASE}/customers/${selectedCustomerId}`,
        {
          first_name: profileForm.first_name,
          last_name: profileForm.last_name,
          phone: profileForm.phone,
          nic_passport: profileForm.nic_passport,
          email: profileForm.email || null,
          date_of_birth: profileForm.date_of_birth || null,
          gender: profileForm.gender,
          marital_status: profileForm.marital_status || null,
          nationality: profileForm.nationality || null,
          permanent_address: profileForm.permanent_address,
          current_address: profileForm.current_address || null,
          employment_type: profileForm.employment_type || null,
          employer_name: profileForm.employer_name || null,
          job_title: profileForm.job_title || null,
          monthly_income: profileForm.monthly_income === '' ? null : Number(profileForm.monthly_income),
          other_income_sources: profileForm.other_income_sources || null,
          existing_loans: profileForm.existing_loans,
          monthly_loan_obligations:
            profileForm.monthly_loan_obligations === ''
              ? null
              : Number(profileForm.monthly_loan_obligations),
          credit_score: profileForm.credit_score === '' ? null : Number(profileForm.credit_score),
          status: profileForm.status || null,
        },
        { headers }
      );

      await loadCustomers();
      closeProfileModal();
    } catch (error: unknown) {
      const message = extractAxiosErrorMessage(error, 'Failed to update customer profile.');
      setProfileError(message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleRegisterCustomer = async () => {
    const stepError = validateRegisterStep(registerStep);
    if (stepError) {
      setRegisterError(stepError);
      return;
    }

    const existingPaysheetNames = getExistingDocuments((document) =>
      document.document_type.startsWith('Paysheet')
    ).map((document) => document.original_name);
    const existingBusinessDocumentNames = getExistingDocuments((document) =>
      document.document_type.startsWith('Business Document')
    ).map((document) => document.original_name);

    const allPaysheetNames = [...existingPaysheetNames, ...registerPaysheetFiles.map((file) => file.name)];
    const allBusinessDocumentNames = [
      ...existingBusinessDocumentNames,
      ...registerBusinessDocumentFiles.map((file) => file.name),
    ];

    const additionalDetails = {
      identity: {
        full_name_with_initials: registerForm.full_name_with_initials.trim() || null,
        old_nic: registerForm.old_nic.trim() || null,
        passport_no: registerForm.passport_no.trim() || null,
        driving_license_no: registerForm.driving_license_no.trim() || null,
        tax_identification_no: registerForm.tax_identification_no.trim() || null,
        biometric_reference: registerForm.biometric_reference.trim() || null,
      },
      contact: {
        mobile: registerForm.phone.trim(),
        second_mobile: registerForm.phone_secondary.trim() || null,
        office_phone: registerForm.office_phone.trim() || registerForm.phone_secondary.trim() || null,
        contact_no_01: registerForm.phone.trim(),
        contact_no_02: registerForm.office_phone.trim() || registerForm.phone_secondary.trim() || null,
        whatsapp_number: registerForm.whatsapp_number.trim() || null,
        email: registerForm.email.trim() || null,
        emergency_contact: registerForm.emergency_contact.trim() || null,
        preferred_communication_method: registerForm.preferred_communication_method.trim() || null,
      },
      residence: {
        permanent_address: registerForm.permanent_address.trim(),
        current_address: registerForm.current_address.trim() || null,
      },
      employment: {
        employment_type: registerForm.employment_type || null,
        employer_name: registerForm.employer_name.trim() || null,
        employer: registerForm.employer_name.trim() || null,
        designation: registerForm.designation.trim() || registerForm.job_title.trim() || null,
        job_title: registerForm.designation.trim() || registerForm.job_title.trim() || null,
        industry: registerForm.industry.trim() || null,
        years_of_service: registerForm.years_of_service === '' ? null : Number(registerForm.years_of_service),
        monthly_salary:
          registerForm.monthly_salary === ''
            ? registerForm.monthly_income === ''
              ? null
              : Number(registerForm.monthly_income)
            : Number(registerForm.monthly_salary),
        monthly_income:
          registerForm.monthly_salary === ''
            ? registerForm.monthly_income === ''
              ? null
              : Number(registerForm.monthly_income)
            : Number(registerForm.monthly_salary),
        other_income: registerForm.other_income.trim() || registerForm.other_income_sources.trim() || null,
        other_income_sources: registerForm.other_income.trim() || registerForm.other_income_sources.trim() || null,
        salary_bank: registerForm.salary_bank.trim() || null,
        salary_date: registerForm.salary_date || null,
        paysheet_files_count: allPaysheetNames.length,
        paysheet_file_names: allPaysheetNames,
      },
      business_information: {
        business_name: registerForm.business_name.trim() || null,
        business_registration_no: registerForm.business_registration_no.trim() || null,
        business_address: registerForm.business_address.trim() || null,
        business_type: registerForm.business_type.trim() || null,
        years_in_business: registerForm.years_in_business === '' ? null : Number(registerForm.years_in_business),
        business_documents_count: allBusinessDocumentNames.length,
        business_document_names: allBusinessDocumentNames,
      },
      family_information: {
        family_members_count: registerForm.family_members_count === '' ? null : Number(registerForm.family_members_count),
        dependents_count: registerForm.dependents_count === '' ? null : Number(registerForm.dependents_count),
        spouse_name: registerForm.spouse_name.trim() || null,
        emergency_contact_name: registerForm.emergency_contact_name.trim() || null,
        emergency_contact_no: registerForm.emergency_contact_no.trim() || null,
        relationals: registerRelationals
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
        monthly_expenses: registerForm.monthly_expenses === '' ? null : Number(registerForm.monthly_expenses),
        savings_habit: registerForm.savings_habit.trim() || null,
        repayment_behaviour: registerForm.repayment_behaviour.trim() || null,
      },
      banking_relationships: {
        primary_bank_name: registerForm.primary_bank_name.trim() || null,
        bank_branch: registerForm.bank_branch.trim() || null,
        account_number: registerForm.account_number.trim() || null,
        relationship_years: registerForm.relationship_years === '' ? null : Number(registerForm.relationship_years),
      },
      existing_loans: {
        has_existing_loans: registerForm.existing_loans,
        lender: registerForm.existing_loan_lender.trim() || null,
        outstanding_balance: registerForm.existing_loan_outstanding === '' ? null : Number(registerForm.existing_loan_outstanding),
      },
      credit_history: {
        credit_score: registerForm.credit_score === '' ? null : Number(registerForm.credit_score),
        notes: registerForm.credit_history_notes.trim() || null,
      },
    };

    const onboardingPayload = {
      step_1: {
        customer_code: registerForm.customer_code.trim() || null,
        full_name_with_initials: registerForm.full_name_with_initials.trim() || null,
        phone: registerForm.phone.trim() || null,
        phone_secondary: registerForm.phone_secondary.trim() || null,
        whatsapp_number: registerForm.whatsapp_number.trim() || null,
        office_phone: registerForm.office_phone.trim() || null,
        email: registerForm.email.trim() || null,
        emergency_contact: registerForm.emergency_contact.trim() || null,
        preferred_communication_method: registerForm.preferred_communication_method.trim() || null,
        nic_passport: registerForm.nic_passport.trim() || null,
        old_nic: registerForm.old_nic.trim() || null,
        passport_no: registerForm.passport_no.trim() || null,
        driving_license_no: registerForm.driving_license_no.trim() || null,
        tax_identification_no: registerForm.tax_identification_no.trim() || null,
        biometric_reference: registerForm.biometric_reference.trim() || null,
        date_of_birth: registerForm.date_of_birth || null,
        gender: registerForm.gender || null,
        marital_status: registerForm.marital_status || null,
        nationality: registerForm.nationality || null,
      },
      step_2: {
        permanent_address: registerForm.permanent_address.trim() || null,
        current_address: registerForm.current_address.trim() || null,
        employer_name: registerForm.employer_name.trim() || null,
        employment_type: registerForm.employment_type || null,
        designation: registerForm.designation.trim() || null,
        industry: registerForm.industry || null,
        years_of_service: registerForm.years_of_service || null,
        monthly_salary: registerForm.monthly_salary || null,
        other_income: registerForm.other_income.trim() || null,
        salary_bank: registerForm.salary_bank.trim() || null,
        salary_date: registerForm.salary_date || null,
        paysheet_file_names: allPaysheetNames,
        business_name: registerForm.business_name.trim() || null,
        business_registration_no: registerForm.business_registration_no.trim() || null,
        business_type: registerForm.business_type || null,
        years_in_business: registerForm.years_in_business || null,
        business_document_names: allBusinessDocumentNames,
        business_address: registerForm.business_address.trim() || null,
      },
      step_3: {
        family_members_count: registerForm.family_members_count || null,
        dependents_count: registerForm.dependents_count || null,
        spouse_name: registerForm.spouse_name.trim() || null,
        emergency_contact_name: registerForm.emergency_contact_name.trim() || null,
        emergency_contact_no: registerForm.emergency_contact_no.trim() || null,
        relationals: registerRelationals.map((entry) => ({
          name: entry.name.trim() || null,
          relationship: entry.relationship.trim() || null,
          contact_no: entry.contact_no.trim() || null,
          signature_file_name: entry.signature_file ? entry.signature_file.name : null,
        })),
        monthly_expenses: registerForm.monthly_expenses || null,
        savings_habit: registerForm.savings_habit.trim() || null,
        repayment_behaviour: registerForm.repayment_behaviour.trim() || null,
        primary_bank_name: registerForm.primary_bank_name.trim() || null,
        bank_branch: registerForm.bank_branch.trim() || null,
        account_number: registerForm.account_number.trim() || null,
        relationship_years: registerForm.relationship_years || null,
        existing_loans: registerForm.existing_loans,
        existing_loan_lender: registerForm.existing_loan_lender.trim() || null,
        existing_loan_outstanding: registerForm.existing_loan_outstanding || null,
        monthly_loan_obligations: registerForm.monthly_loan_obligations || null,
        credit_score: registerForm.credit_score || null,
        credit_history_notes: registerForm.credit_history_notes.trim() || null,
      },
      completed_steps: 2,
      submitted_at: new Date().toISOString(),
    };

    const payload = {
      customer_code: registerForm.customer_code.trim() || undefined,
      full_name_with_initials: registerForm.full_name_with_initials.trim(),
      phone: registerForm.phone.trim(),
      email: registerForm.email.trim() || undefined,
      nic_passport: registerForm.nic_passport.trim(),
      old_nic: registerForm.old_nic.trim() || undefined,
      passport_no: registerForm.passport_no.trim() || undefined,
      driving_license_no: registerForm.driving_license_no.trim() || undefined,
      tax_identification_no: registerForm.tax_identification_no.trim() || undefined,
      biometric_reference: registerForm.biometric_reference.trim() || undefined,
      date_of_birth: registerForm.date_of_birth,
      gender: registerForm.gender,
      marital_status: registerForm.marital_status || undefined,
      nationality: registerForm.nationality.trim() || undefined,
      employment_type: registerForm.employment_type,
      employer_name: registerForm.employer_name.trim() || undefined,
      job_title: registerForm.designation.trim() || registerForm.job_title.trim() || undefined,
      monthly_income:
        registerForm.monthly_salary === ''
          ? registerForm.monthly_income === ''
            ? undefined
            : Number(registerForm.monthly_income)
          : Number(registerForm.monthly_salary),
      other_income_sources: registerForm.other_income.trim() || registerForm.other_income_sources.trim() || undefined,
      existing_loans: registerForm.existing_loans,
      monthly_loan_obligations:
        registerForm.monthly_loan_obligations === '' ? undefined : Number(registerForm.monthly_loan_obligations),
      credit_score: registerForm.credit_score === '' ? undefined : Number(registerForm.credit_score),
      permanent_address: registerForm.permanent_address.trim(),
      current_address: registerForm.current_address.trim() || undefined,
      additional_details: additionalDetails,
      onboarding_payload: onboardingPayload,
    };

    if (
      !payload.full_name_with_initials ||
      !payload.phone ||
      !payload.nic_passport ||
      !payload.date_of_birth ||
      !payload.permanent_address
    ) {
      setRegisterError('Please fill required fields: Full Name with Initials, Phone, NIC, Date of Birth, and Permanent Address.');
      return;
    }

    setRegisterSaving(true);
    setRegisterError('');

    try {
      const isUpdateMode = registerMode === 'update' && editingCustomerId !== null;
      const response = isUpdateMode
        ? await axios.put(`${API_BASE}/customers/${editingCustomerId}`, payload, { headers })
        : await axios.post(`${API_BASE}/customers`, payload, { headers });
      const createdCustomerId = isUpdateMode ? Number(editingCustomerId || 0) : Number(response.data?.id || 0);
      const createdCustomerCode = String(response.data?.customer_code || payload.customer_code || '').trim();

      if (registerPhotoFile && createdCustomerCode) {
        const photoForm = new FormData();
        photoForm.append('photo', registerPhotoFile);

        await axios.post(`${API_BASE}/customers/by-code/${encodeURIComponent(createdCustomerCode)}/photo`, photoForm, {
          headers: {
            ...headers,
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      if (createdCustomerId > 0) {
        const documentEntries = Object.entries(registerDocuments).filter(([, file]) => file instanceof File);

        for (const [documentType, file] of documentEntries) {
          const formData = new FormData();
          formData.append('document_type', documentType);
          formData.append('file', file as File);

          await axios.post(`${API_BASE}/customers/${createdCustomerId}/documents`, formData, {
            headers: {
              ...headers,
              'Content-Type': 'multipart/form-data',
            },
          });
        }


        for (const [index, file] of registerPaysheetFiles.entries()) {
          const paysheetFormData = new FormData();
          paysheetFormData.append('document_type', `Paysheet ${index + 1}`);
          paysheetFormData.append('file', file);

          await axios.post(`${API_BASE}/customers/${createdCustomerId}/documents`, paysheetFormData, {
            headers: {
              ...headers,
              'Content-Type': 'multipart/form-data',
            },
          });
        }

        for (const [index, file] of registerBusinessDocumentFiles.entries()) {
          const businessDocFormData = new FormData();
          businessDocFormData.append('document_type', `Business Document ${index + 1}`);
          businessDocFormData.append('file', file);

          await axios.post(`${API_BASE}/customers/${createdCustomerId}/documents`, businessDocFormData, {
            headers: {
              ...headers,
              'Content-Type': 'multipart/form-data',
            },
          });
        }

        const relationalEntriesWithSignature = registerRelationals.filter((entry) => entry.signature_file instanceof File);

        for (const [index, entry] of relationalEntriesWithSignature.entries()) {
          const relationalSignatureFormData = new FormData();
          const suffix = entry.name.trim() || `Relational ${index + 1}`;
          relationalSignatureFormData.append('document_type', `Relational Signature - ${suffix}`);
          relationalSignatureFormData.append('file', entry.signature_file as File);

          await axios.post(`${API_BASE}/customers/${createdCustomerId}/documents`, relationalSignatureFormData, {
            headers: {
              ...headers,
              'Content-Type': 'multipart/form-data',
            },
          });
        }

      }

      await loadCustomers();
      setRegisterModalOpen(false);
      resetRegisterForm();
      setRegisterMode('create');
      setEditingCustomerId(null);
      setWidgetNotice({
        open: true,
        title: 'Success',
        message:
          registerMode === 'update'
            ? 'Customer profile updated successfully with step-based details and documents.'
            : 'Customer registered successfully with onboarding details and documents.',
      });
    } catch (error: unknown) {
      const message = extractAxiosErrorMessage(
        error,
        registerMode === 'update' ? 'Failed to update customer profile.' : 'Failed to register customer.'
      );

      setRegisterError(message);
    } finally {
      setRegisterSaving(false);
    }
  };

  if (!token || loading || loadingWidgets) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.25),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(251,191,36,0.22),transparent_34%),linear-gradient(145deg,#ecfeff_0%,#eff6ff_42%,#fff7ed_100%)] flex items-center justify-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_15%,rgba(34,211,238,0.22),transparent_36%),radial-gradient(circle_at_88%_12%,rgba(251,191,36,0.22),transparent_34%),radial-gradient(circle_at_70%_90%,rgba(45,212,191,0.14),transparent_34%),linear-gradient(155deg,#ecfeff_0%,#f0f9ff_45%,#fff7ed_100%)] p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-10 top-16 h-56 w-56 rounded-full bg-cyan-300/40 blur-3xl"></div>
        <div className="absolute right-0 top-8 h-72 w-72 rounded-full bg-amber-300/35 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-teal-300/30 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        <div className="rounded-3xl border border-white/60 bg-white/75 p-5 shadow-[0_28px_70px_-36px_rgba(2,132,199,0.45)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">
                <Users className="h-3.5 w-3.5" />
                Customer Portfolio
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Microfinance Customers</h1>
              <p className="mt-1 text-sm text-slate-600">Explore customer records, complete profiles, and export branch-ready reports in one workspace.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openRegisterModal}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-emerald-600 hover:to-teal-600"
              >
                <UserPlus className="h-4 w-4" />
                Register Customer
              </button>
              <button
                type="button"
                onClick={() => void loadCustomers()}
                className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50"
              >
                Refresh
              </button>
              <button
                onClick={() => router.push('/dashboard/microfinance')}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
              >
                Back
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {visibleSummaryCards.map((card) => (
            <div key={card.key} className={`relative overflow-hidden rounded-2xl border ${card.borderClass} bg-white/85 p-4 shadow-[0_14px_35px_-28px_rgba(15,23,42,0.6)] backdrop-blur-md`}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-cyan-400"></div>
              <WidgetCloseGate>
<button
                type="button"
                onClick={() => void hideWidget(card.key)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label={`Hide ${card.label} card`}
              >
                ×
              </button>
</WidgetCloseGate>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{card.label}</p>
              <p className={`mt-1 text-3xl font-black ${card.valueClass}`}>{card.value}</p>
            </div>
          ))}
        </div>
        {visibleSummaryCards.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            All customer summary cards are hidden. Restore from dashboard with admin approval.
          </div>
        )}

        {showFiltersPanel && (
          <div className="relative grid grid-cols-1 gap-3 rounded-3xl border border-amber-100/80 bg-white/88 p-5 text-black shadow-[0_20px_50px_-34px_rgba(245,158,11,0.55)] backdrop-blur-md md:grid-cols-3 lg:grid-cols-5">
            <WidgetCloseGate>
<button
              type="button"
              onClick={() => void hideWidget('mf_customers_widget_filters_panel')}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide filter controls widget"
            >
              ×
            </button>
</WidgetCloseGate>
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
              <input
                className="w-full rounded-xl border border-amber-100 bg-white px-9 py-2.5 text-sm outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                placeholder="Search by name, NIC, code, phone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-600" />
              <select className="w-full appearance-none rounded-xl border border-amber-100 bg-white px-9 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blacklisted">Blacklisted</option>
              </select>
            </div>
            <div className="md:col-span-1 lg:col-span-2"></div>
            <div className="flex items-center gap-2 justify-start lg:justify-end">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rows</label>
              <select
                className="rounded-lg border border-amber-100 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
              </select>
            </div>
          </div>
        )}
        {!showFiltersPanel && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Filter controls are hidden. Restore from dashboard with admin approval.
          </div>
        )}

        {showExportButtons && (
          <div className="relative flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/60 bg-white/65 px-4 py-3 shadow-sm backdrop-blur-sm">
            <WidgetCloseGate>
<button
              type="button"
              onClick={() => void hideWidget('mf_customers_widget_export_buttons')}
              className="absolute -top-3 left-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide export buttons widget"
            >
              ×
            </button>
</WidgetCloseGate>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={exportRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={exportRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2 text-sm font-semibold text-white shadow-md transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>
        )}
        {!showExportButtons && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Export buttons are hidden. Restore from dashboard with admin approval.
          </div>
        )}

        {filteredCustomers.length === 0 ? (
          <div className="rounded-3xl border border-white/60 bg-white/80 p-10 text-center shadow-[0_20px_60px_-36px_rgba(15,23,42,0.5)]">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Users className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-700">No customers found for current filters.</p>
            <p className="mt-1 text-sm text-slate-500">Try adjusting search text or status to widen results.</p>
          </div>
        ) : (
          <div className="rounded-3xl border border-amber-100/80 bg-white/92 shadow-[0_24px_70px_-38px_rgba(30,64,175,0.4)] backdrop-blur-md">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full text-sm text-left text-gray-700">
                <thead className="bg-gradient-to-r from-amber-500 via-orange-500 to-teal-500 text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ID</th>
                    <th className="px-4 py-3 font-semibold">Customer Name</th>
                    <th className="px-4 py-3 font-semibold">Customer No</th>
                    <th className="px-4 py-3 font-semibold">NIC</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Address</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Completion Score</th>
                    <th className="px-4 py-3 font-semibold">Document Score</th>
                    <th className="px-4 py-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomers.map((customer) => {
                    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
                    const displayName = customer.full_name || customer.name || fullName || `Customer #${customer.id}`;
                    const phone = customer.phone || customer.contact_number || 'N/A';
                    const address = customer.current_address || customer.permanent_address || 'N/A';
                    const status = (customer.status || 'unknown').toLowerCase();
                    const completionScore = getProfileCompletionScore(customer);
                    const documentScore = getDocumentCompletionScore(customer);
                    const profileCompletionMeta = getProfileCompletionMeta(customer);
                    const documentCompletionMeta = getDocumentCompletionMeta(customer);

                    return (
                      <tr key={customer.id} className="border-b border-amber-100/70 last:border-b-0 hover:bg-amber-50/35">
                        <td className="px-4 py-3 font-medium text-gray-900">{customer.id}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{displayName}</td>
                        <td className="px-4 py-3">{customer.customer_code || 'N/A'}</td>
                        <td className="px-4 py-3">{customer.nic_passport || 'N/A'}</td>
                        <td className="px-4 py-3">{phone}</td>
                        <td className="px-4 py-3 min-w-[220px]">{address}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold ${
                              status === 'active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : status === 'inactive'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[220px]">
                          <div
                            className="relative flex items-center gap-2"
                            onMouseEnter={() =>
                              setHoveredScoreDetails({
                                title: 'Profile Completion Details',
                                missing: profileCompletionMeta.missing,
                              })
                            }
                            onMouseLeave={() => setHoveredScoreDetails(null)}
                          >
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${completionScore >= 80 ? 'bg-emerald-500' : completionScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${completionScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold text-slate-700">{completionScore}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[220px]">
                          <div
                            className="relative flex items-center gap-2"
                            onMouseEnter={() =>
                              setHoveredScoreDetails({
                                title: 'Document Completion Details',
                                missing: documentCompletionMeta.missing,
                              })
                            }
                            onMouseLeave={() => setHoveredScoreDetails(null)}
                          >
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${documentScore >= 80 ? 'bg-teal-500' : documentScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${documentScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold text-slate-700">{documentScore}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openProfileModal(customer.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-amber-600 hover:to-orange-600"
                          >
                            <UserRoundPen className="h-3.5 w-3.5" />
                            Complete Profile
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filteredCustomers.length > 0 && showPaginationControls && (
          <div className="relative flex items-center justify-center gap-2 pt-2">
            <WidgetCloseGate>
<button
              type="button"
              onClick={() => void hideWidget('mf_customers_widget_pagination_controls')}
              className="absolute left-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide pagination controls widget"
            >
              ×
            </button>
</WidgetCloseGate>
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
              className="rounded-xl border border-amber-100 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
            >
              Prev
            </button>

            <span className="rounded-xl border border-amber-100 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              Page {safePage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
              className="rounded-xl border border-amber-100 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
        {filteredCustomers.length > 0 && !showPaginationControls && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Pagination controls are hidden. Restore from dashboard with admin approval.
          </div>
        )}

        {profileModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm px-4 py-6 overflow-y-auto">
            <div className="w-full max-w-7xl mx-auto rounded-3xl bg-white shadow-[0_28px_85px_-36px_rgba(5,150,105,0.55)] border border-emerald-200 overflow-hidden">
              <div className="relative bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-5 text-white">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl"></div>
                <div className="absolute left-16 -bottom-10 h-24 w-24 rounded-full bg-white/10 blur-xl"></div>
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/85">Customer Onboarding</p>
                    <h3 className="text-2xl font-extrabold mt-1">Complete Customer Profile</h3>
                    <p className="text-sm text-white/90 mt-1">Fill missing fields and keep the profile complete for approvals and collections.</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeProfileModal}
                    className="rounded-lg border border-white/35 bg-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/30"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="p-5 md:p-6 max-h-[72vh] overflow-y-auto bg-gradient-to-b from-emerald-50/30 to-white">

              {profileLoading ? (
                <div className="py-12 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600"></div>
                </div>
              ) : (
                <>
                  {profileError && (
                    <div className="mt-1 mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {profileError}
                    </div>
                  )}

                  <div className="space-y-4 text-black">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-emerald-700">Basic Information</h4>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">First Name</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.first_name} onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Last Name</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.last_name} onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Customer Phone</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">NIC / Passport</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.nic_passport} onChange={(e) => setProfileForm((p) => ({ ...p, nic_passport: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Email</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Date of Birth</label>
                          <input type="date" className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.date_of_birth} onChange={(e) => setProfileForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Gender</label>
                          <select className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.gender} onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))}>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Marital Status</label>
                          <select className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.marital_status} onChange={(e) => setProfileForm((p) => ({ ...p, marital_status: e.target.value }))}>
                            <option value="">Select</option>
                            <option value="single">Single</option>
                            <option value="married">Married</option>
                            <option value="divorced">Divorced</option>
                            <option value="widowed">Widowed</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Nationality</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.nationality} onChange={(e) => setProfileForm((p) => ({ ...p, nationality: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Status</label>
                          <select className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" value={profileForm.status} onChange={(e) => setProfileForm((p) => ({ ...p, status: e.target.value }))}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="blacklisted">Blacklisted</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-cyan-100 bg-white p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-cyan-700">Address Information</h4>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="text-xs font-semibold uppercase text-slate-600">Permanent Address</label>
                          <textarea className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-cyan-50/30 focus:outline-none focus:ring-2 focus:ring-cyan-200" rows={2} value={profileForm.permanent_address} onChange={(e) => setProfileForm((p) => ({ ...p, permanent_address: e.target.value }))}></textarea>
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-xs font-semibold uppercase text-slate-600">Current Address</label>
                          <textarea className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-cyan-50/30 focus:outline-none focus:ring-2 focus:ring-cyan-200" rows={2} value={profileForm.current_address} onChange={(e) => setProfileForm((p) => ({ ...p, current_address: e.target.value }))}></textarea>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-white p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-indigo-700">Employment & Finance</h4>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Employment Type</label>
                          <select className="mt-1 w-full px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={profileForm.employment_type} onChange={(e) => setProfileForm((p) => ({ ...p, employment_type: e.target.value }))}>
                            <option value="">Select</option>
                            {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Employer Name</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={profileForm.employer_name} onChange={(e) => setProfileForm((p) => ({ ...p, employer_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Job Title</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={profileForm.job_title} onChange={(e) => setProfileForm((p) => ({ ...p, job_title: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Monthly Income</label>
                          <input type="number" min="0" step="0.01" className="mt-1 w-full px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={profileForm.monthly_income} onChange={(e) => setProfileForm((p) => ({ ...p, monthly_income: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Other Income Sources</label>
                          <input className="mt-1 w-full px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={profileForm.other_income_sources} onChange={(e) => setProfileForm((p) => ({ ...p, other_income_sources: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Monthly Loan Obligations</label>
                          <input type="number" min="0" step="0.01" className="mt-1 w-full px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={profileForm.monthly_loan_obligations} onChange={(e) => setProfileForm((p) => ({ ...p, monthly_loan_obligations: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-600">Credit Score</label>
                          <input type="number" min="0" step="1" className="mt-1 w-full px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-200" value={profileForm.credit_score} onChange={(e) => setProfileForm((p) => ({ ...p, credit_score: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/30 px-3 py-2">
                          <input
                            id="existing_loans"
                            type="checkbox"
                            checked={profileForm.existing_loans}
                            onChange={(e) => setProfileForm((p) => ({ ...p, existing_loans: e.target.checked }))}
                            className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <label htmlFor="existing_loans" className="text-sm text-slate-700">Customer has existing loans</label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="sticky bottom-0 mt-5 bg-white/95 backdrop-blur-sm border-t border-emerald-100 pt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeProfileModal}
                      className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleProfileSave}
                      disabled={profileSaving || profileLoading}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold disabled:opacity-60 shadow-lg shadow-emerald-300/40"
                    >
                      {profileSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        )}

        {registerModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 px-4 py-6 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-[0_28px_85px_-36px_rgba(5,150,105,0.55)]">
              <div className="relative bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-5 text-white">
                <div className="absolute -right-12 -top-8 h-28 w-28 rounded-full bg-white/20 blur-2xl"></div>
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/85">Customer Onboarding</p>
                    <h3 className="mt-1 text-2xl font-extrabold">{registerMode === 'update' ? 'Complete Customer Profile' : 'Register New Customer'}</h3>
                    <p className="mt-1 text-sm text-white/90">
                      {registerMode === 'update'
                        ? 'Update existing customer details using the same step-by-step workflow.'
                        : 'Add a customer profile directly from this workspace.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeRegisterModal}
                    className="rounded-lg border border-white/35 bg-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/30"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="space-y-4 bg-gradient-to-b from-emerald-50/30 to-white p-5 text-black md:p-6">
                <div className="grid grid-cols-1 gap-2 rounded-2xl border border-emerald-100 bg-white p-2 md:grid-cols-4">
                  {REGISTER_STEPS.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setRegisterStep(step.id)}
                      className={`rounded-xl px-3 py-2 text-left transition ${
                        registerStep === step.id
                          ? 'bg-emerald-500 text-white shadow'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Step {step.id}</p>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className={`text-xs ${registerStep === step.id ? 'text-white/85' : 'text-emerald-700'}`}>{step.hint}</p>
                    </button>
                  ))}
                </div>

                {registerError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {registerError}
                  </div>
                )}

                {registerStep === 1 && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer No</label>
                      <div className="mt-1 flex items-center gap-2">
                        <input className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.customer_code} onChange={(e) => setRegisterForm((prev) => ({ ...prev, customer_code: e.target.value }))} placeholder="Auto or manual" />
                        <button type="button" onClick={generateCustomerCode} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Generate</button>
                      </div>
                    </div>

                    <div className="md:col-span-2"><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Full Name with Initials *</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.full_name_with_initials} onChange={(e) => setRegisterForm((prev) => ({ ...prev, full_name_with_initials: e.target.value }))} placeholder="K.A. Perera" /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Mobile *</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.phone} onChange={(e) => setRegisterForm((prev) => ({ ...prev, phone: e.target.value }))} /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Second Mobile Number</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.phone_secondary} onChange={(e) => setRegisterForm((prev) => ({ ...prev, phone_secondary: e.target.value }))} /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Office Phone</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.office_phone} onChange={(e) => setRegisterForm((prev) => ({ ...prev, office_phone: e.target.value }))} /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">WhatsApp Number</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.whatsapp_number} onChange={(e) => setRegisterForm((prev) => ({ ...prev, whatsapp_number: e.target.value }))} /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Email</label><input type="email" className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.email} onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Emergency Contact</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.emergency_contact} onChange={(e) => setRegisterForm((prev) => ({ ...prev, emergency_contact: e.target.value }))} /></div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Preferred Communication Method</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                        value={registerForm.preferred_communication_method}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, preferred_communication_method: e.target.value }))}
                      >
                        <option value="">Select method</option>
                        <option value="Call">Call</option>
                        <option value="SMS">SMS</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Email">Email</option>
                      </select>
                    </div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Date of Birth *</label><input type="date" className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.date_of_birth} onChange={(e) => setRegisterForm((prev) => ({ ...prev, date_of_birth: e.target.value }))} /></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Gender</label><select className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.gender} onChange={(e) => setRegisterForm((prev) => ({ ...prev, gender: e.target.value }))}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
                    <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Marital Status</label><select className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.marital_status} onChange={(e) => setRegisterForm((prev) => ({ ...prev, marital_status: e.target.value }))}><option value="">Select</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option></select></div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Nationality</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                        value={registerForm.nationality}
                        onChange={(e) => setRegisterForm((prev) => ({ ...prev, nationality: e.target.value }))}
                      >
                        <option value="Sri Lankan">Sri Lankan</option>
                        <option value="Indian">Indian</option>
                        <option value="Bangladeshi">Bangladeshi</option>
                        <option value="Pakistani">Pakistani</option>
                        <option value="Maldivian">Maldivian</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-emerald-700">Identity</h4>
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">National ID *</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.nic_passport} onChange={(e) => handleRegisterNicChange(e.target.value)} onBlur={handleRegisterNicBlur} /></div>
                        {registerForm.old_nic && (
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Old NIC (Preview)</label>
                            <input
                              className="mt-1 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-sm text-slate-700"
                              value={registerForm.old_nic}
                              readOnly
                            />
                          </div>
                        )}
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Passport</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.passport_no} onChange={(e) => setRegisterForm((prev) => ({ ...prev, passport_no: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Driving License</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.driving_license_no} onChange={(e) => setRegisterForm((prev) => ({ ...prev, driving_license_no: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Tax Identification Number</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.tax_identification_no} onChange={(e) => setRegisterForm((prev) => ({ ...prev, tax_identification_no: e.target.value }))} /></div>
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer Photograph</label>
                          <input
                            type="file"
                            accept="image/*"
                            className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-700"
                            onChange={(e) => setRegisterPhotoFile(e.target.files?.[0] || null)}
                          />
                          {registerPhotoFile && (
                            <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                              <span className="truncate">{registerPhotoFile.name}</span>
                              <button
                                type="button"
                                className="h-5 w-5 rounded-full border border-emerald-300 text-[11px] font-bold leading-none text-emerald-700 hover:bg-emerald-100"
                                onClick={() => setRegisterPhotoFile(null)}
                                aria-label="Remove selected customer photograph"
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Signature</label>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-700"
                            onChange={(e) => updateRegisterDocument('Signature', e.target.files?.[0] || null)}
                          />
                          {registerDocuments.Signature && (
                            <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                              <span className="truncate">{registerDocuments.Signature.name}</span>
                              <button
                                type="button"
                                className="h-5 w-5 rounded-full border border-emerald-300 text-[11px] font-bold leading-none text-emerald-700 hover:bg-emerald-100"
                                onClick={() => updateRegisterDocument('Signature', null)}
                                aria-label="Remove selected signature file"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {getExistingDocuments((document) => document.document_type === 'Signature').map((document) =>
                            renderExistingDocumentChip(document, 'signature')
                          )}
                        </div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Biometric (Future)</label><input className="mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200" value={registerForm.biometric_reference} onChange={(e) => setRegisterForm((prev) => ({ ...prev, biometric_reference: e.target.value }))} placeholder="Reserved / reference" /></div>
                      </div>
                    </div>
                  </div>
                )}

                {registerStep === 2 && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/30 p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-cyan-700">Residence</h4>
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2"><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Permanent Address *</label><textarea rows={2} className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200" value={registerForm.permanent_address} onChange={(e) => setRegisterForm((prev) => ({ ...prev, permanent_address: e.target.value }))}></textarea></div>
                        <div className="md:col-span-2"><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Current Address</label><textarea rows={2} className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200" value={registerForm.current_address} onChange={(e) => setRegisterForm((prev) => ({ ...prev, current_address: e.target.value }))}></textarea></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-indigo-700">Employment</h4>
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Employer</label><input className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.employer_name} onChange={(e) => setRegisterForm((prev) => ({ ...prev, employer_name: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Employment Type</label><select className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.employment_type} onChange={(e) => setRegisterForm((prev) => ({ ...prev, employment_type: e.target.value }))}><option value="">Select</option>{EMPLOYMENT_TYPE_OPTIONS.map((option) => (<option key={option} value={option}>{option}</option>))}</select></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Designation</label><input className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.designation} onChange={(e) => setRegisterForm((prev) => ({ ...prev, designation: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Industry</label><select className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.industry} onChange={(e) => setRegisterForm((prev) => ({ ...prev, industry: e.target.value }))}><option value="">Select industry</option>{INDUSTRY_GROUPS.map((group) => (<optgroup key={group.category} label={group.category}>{group.items.map((item) => (<option key={`${group.category}-${item}`} value={item}>{item}</option>))}</optgroup>))}</select></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Years of Service</label><input type="number" min="0" step="1" className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.years_of_service} onChange={(e) => setRegisterForm((prev) => ({ ...prev, years_of_service: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Monthly Salary</label><input type="number" min="0" step="0.01" className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.monthly_salary} onChange={(e) => setRegisterForm((prev) => ({ ...prev, monthly_salary: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Other Income</label><input className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.other_income} onChange={(e) => setRegisterForm((prev) => ({ ...prev, other_income: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Salary Bank</label><input className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.salary_bank} onChange={(e) => setRegisterForm((prev) => ({ ...prev, salary_bank: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Salary Date</label><input type="date" className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" value={registerForm.salary_date} onChange={(e) => setRegisterForm((prev) => ({ ...prev, salary_date: e.target.value }))} /></div>
                        <div className="md:col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Paysheets (Multiple)</label>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,image/*"
                            className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700"
                            onChange={(e) => setRegisterPaysheetFiles(Array.from(e.target.files || []))}
                          />
                          <p className="mt-1 text-xs text-slate-500">Upload 3, 6, or any required number of paysheets.</p>
                          {registerPaysheetFiles.length > 0 && (
                            <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-2 text-xs text-indigo-700">
                              <p className="font-semibold">Selected files: {registerPaysheetFiles.length}</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {registerPaysheetFiles.map((file, index) => (
                                  <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-indigo-200 bg-white px-2 py-1">
                                    <span className="truncate">{file.name}</span>
                                    <button
                                      type="button"
                                      className="h-5 w-5 rounded-full border border-indigo-300 text-[11px] font-bold leading-none hover:bg-indigo-100"
                                      onClick={() => setRegisterPaysheetFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                                      aria-label="Remove selected paysheet"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {getExistingDocuments((document) => document.document_type.startsWith('Paysheet')).map((document) =>
                            renderExistingDocumentChip(document, 'paysheet')
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-amber-700">Business Information</h4>
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Business Name</label><input className="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200" value={registerForm.business_name} onChange={(e) => setRegisterForm((prev) => ({ ...prev, business_name: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Business Registration No.</label><input className="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200" value={registerForm.business_registration_no} onChange={(e) => setRegisterForm((prev) => ({ ...prev, business_registration_no: e.target.value }))} /></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Business Type</label><select className="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200" value={registerForm.business_type} onChange={(e) => setRegisterForm((prev) => ({ ...prev, business_type: e.target.value }))}><option value="">Select business type</option>{BUSINESS_TYPE_OPTIONS.map((option) => (<option key={option} value={option}>{option}</option>))}</select></div>
                        <div><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Years in Business</label><input type="number" min="0" step="1" className="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200" value={registerForm.years_in_business} onChange={(e) => setRegisterForm((prev) => ({ ...prev, years_in_business: e.target.value }))} /></div>
                        <div className="md:col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Business Related Documents (Multiple)</label>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,image/*,.doc,.docx"
                            className="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-amber-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-amber-700"
                            onChange={(e) => setRegisterBusinessDocumentFiles(Array.from(e.target.files || []))}
                          />
                          <p className="mt-1 text-xs text-slate-500">Upload all required business documents together.</p>
                          {registerBusinessDocumentFiles.length > 0 && (
                            <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/40 p-2 text-xs text-amber-700">
                              <p className="font-semibold">Selected files: {registerBusinessDocumentFiles.length}</p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {registerBusinessDocumentFiles.map((file, index) => (
                                  <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-amber-200 bg-white px-2 py-1">
                                    <span className="truncate">{file.name}</span>
                                    <button
                                      type="button"
                                      className="h-5 w-5 rounded-full border border-amber-300 text-[11px] font-bold leading-none hover:bg-amber-100"
                                      onClick={() =>
                                        setRegisterBusinessDocumentFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))
                                      }
                                      aria-label="Remove selected business document"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {getExistingDocuments((document) => document.document_type.startsWith('Business Document')).map((document) =>
                            renderExistingDocumentChip(document, 'business')
                          )}
                        </div>
                        <div className="md:col-span-2"><label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Business Address</label><textarea rows={2} className="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200" value={registerForm.business_address} onChange={(e) => setRegisterForm((prev) => ({ ...prev, business_address: e.target.value }))}></textarea></div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-emerald-100 pt-4">
                  <button
                    type="button"
                    onClick={closeRegisterModal}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  {registerStep > 1 && (
                    <button
                      type="button"
                      onClick={goPreviousRegisterStep}
                      className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      Previous
                    </button>
                  )}
                  {registerStep < 2 ? (
                    <button
                      type="button"
                      onClick={goNextRegisterStep}
                      className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-300/40"
                    >
                      Next Step
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRegisterCustomer}
                      disabled={registerSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-300/40 disabled:opacity-60"
                    >
                      <UserPlus className="h-4 w-4" />
                      {registerSaving
                        ? registerMode === 'update'
                          ? 'Updating...'
                          : 'Registering...'
                        : registerMode === 'update'
                          ? 'Update Customer Profile'
                          : 'Register Customer'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {hoveredScoreDetails && (
          <div className="pointer-events-none fixed right-6 top-24 z-[220] w-80 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-2xl">
            <p className="font-semibold text-slate-900">{hoveredScoreDetails.title}</p>
            {hoveredScoreDetails.missing.length === 0 ? (
              <p className="mt-1 text-emerald-700">All required items are complete.</p>
            ) : (
              <>
                <p className="mt-1 text-amber-700">Missing items:</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {hoveredScoreDetails.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {documentPreview.open && (
          <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-sm"
              onClick={closeDocumentPreview}
            />
            <div className="relative w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <p className="truncate text-sm font-semibold text-slate-900">{documentPreview.title}</p>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100"
                  onClick={closeDocumentPreview}
                  aria-label="Close document preview"
                >
                  ×
                </button>
              </div>

              <div className="h-[70vh] overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
                {documentPreview.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={documentPreview.url} alt={documentPreview.title} className="mx-auto max-h-full w-auto rounded-lg" />
                ) : documentPreview.kind === 'pdf' ? (
                  <iframe
                    src={documentPreview.url}
                    title={documentPreview.title}
                    className="h-full w-full rounded-lg border-0 bg-white"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-600">
                    <p>Preview is not available for this file type.</p>
                    <a
                      href={documentPreview.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 font-semibold text-cyan-700 hover:bg-cyan-100"
                    >
                      Open Document
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {widgetNotice.open && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
            />
            <div className="relative w-full max-w-sm rounded-2xl border border-amber-100 bg-white p-5 shadow-xl">
              <h3 className="text-base font-bold text-slate-900">{widgetNotice.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{widgetNotice.message}</p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
