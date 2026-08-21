'use client';

import axios from 'axios';
import { getApiBaseUrl, resolveStorageAssetUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type LoanDocument = {
  id: number;
  document_type: string;
  file_path: string;
  original_name?: string | null;
  file_url?: string | null;
};

type CustomerDocument = {
  id: number;
  customer_id?: number;
  document_type: string;
  file_path: string;
  original_name?: string | null;
};

type LoanGuarantor = {
  id: number;
  name: string;
  nic?: string | null;
  address?: string | null;
  contact_no?: string | null;
  relationship?: string | null;
  image_url?: string | null;
  signature_url?: string | null;
  image_original_name?: string | null;
  signature_original_name?: string | null;
};

type LoanRequest = {
  id: number;
  created_by?: number | null;
  reference_no?: string | null;
  loan_code?: string | null;
  customer_no: string;
  customer_name: string;
  nic?: string | null;
  address?: string | null;
  contact_no?: string | null;
  evaluation_payload?: Record<string, unknown> | null;
  call_confirmation_payload?: Record<string, unknown> | null;
  call_confirmed_at?: string | null;
  bm_approval_payload?: Record<string, unknown> | null;
  bm_approved_at?: string | null;
  cash_allocation_payload?: Record<string, unknown> | null;
  cash_allocated_at?: string | null;
  second_call_confirmation_payload?: Record<string, unknown> | null;
  second_call_confirmed_at?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_no?: string | null;
  reason?: string | null;
  group_leader?: string | null;
  approval_employee_id?: number | null;
  approvalEmployee?: { id?: number; first_name?: string | null; last_name?: string | null } | null;
  createdBy?: {
    id?: number;
    name?: string | null;
    email?: string | null;
    employee?: {
      id?: number;
      first_name?: string | null;
      last_name?: string | null;
      employee_code?: string | null;
    } | null;
  } | null;
  customer_photo_url?: string | null;
  documents?: LoanDocument[];
  guarantors?: LoanGuarantor[];
  manager_name?: string | null;
  field_officer?: string | null;
  branch_id?: number | null;
  loan_scope: 'route_loan' | 'center_loan' | 'direct_loan';
  loan_amount: string | number;
  refundable_amount: string | number;
  installment_amount: string | number;
  document_charges?: string | number;
  stamp_charges?: string | number;
  insurance_charges?: string | number;
  charge_payment_mode?: string | null;
  charges_collection_status?: string | null;
  net_disbursed_amount?: string | number;
  interest_type: 'flat' | 'reducing';
  interest_rate: string | number;
  terms_count: number;
  refund_option: 'day' | 'week' | 'month';
  assumed_month_days?: number | null;
  status: string;
  workflow_step?: number | null;
  workflow_step_updated_at?: string | null;
  route?: { id: number; name: string; code: string } | null;
  branch?: { id: number; name: string } | null;
  center?: { id: number; name: string; code: string; meeting_day?: string | null } | null;
  group?: { id: number; name: string; code: string } | null;
  loan_request_date: string;
  documents_requested?: boolean;
  document_request_note?: string | null;
  document_requested_at?: string | null;
};

type AuthRole = {
  id?: number;
  name?: string;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  branch_id?: number | null;
  designation?: { id?: number; name?: string } | null;
  employee?: { id?: number; first_name?: string; last_name?: string; email?: string } | null;
  roles?: AuthRole[];
};

type ApprovalCandidate = {
  id: number;
  name: string;
  employee_code?: string | null;
  designation?: string | null;
  branch_id?: number | null;
  branch_name?: string | null;
  email?: string | null;
};

type EditLoanForm = {
  customer_name: string;
  contact_no: string;
  address: string;
  bank_name: string;
  bank_branch: string;
  bank_account_no: string;
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
  reason: string;
  charge_payment_mode: 'deduct_from_loan' | 'hand_cash';
  charges_collection_status: 'pending' | 'done';
  refund_option: 'day' | 'week' | 'month';
  interest_type: 'flat' | 'reducing';
  loan_request_date: string;
};

const API_BASE = getApiBaseUrl();

const resolveLoanCustomerPhotoUrl = (loan: LoanRequest): string => {
  const directUrl = String(loan.customer_photo_url || '').trim();
  if (directUrl) {
    return resolveStorageAssetUrl(directUrl);
  }

  const photoDocument = (loan.documents || []).find((doc) =>
    String(doc.document_type || '').toLowerCase().includes('customer photo')
  );

  if (photoDocument) {
    const documentWithUrl = photoDocument as LoanDocument & { file_url?: string | null };
    if (documentWithUrl.file_url) {
      return resolveStorageAssetUrl(documentWithUrl.file_url);
    }
    if (photoDocument.file_path) {
      return resolveStorageAssetUrl(photoDocument.file_path);
    }
  }

  return '';
};

const resolveLoanCustomerSignatureUrl = (loan: LoanRequest): string => {
  const signatureDocument = (loan.documents || []).find((doc) => {
    const type = String(doc.document_type || '').toLowerCase();
    return type.includes('customer signature') || type === 'signature' || type.includes('signature');
  });

  if (!signatureDocument) {
    return '';
  }

  const documentWithUrl = signatureDocument as LoanDocument & { file_url?: string | null };
  if (documentWithUrl.file_url) {
    return resolveStorageAssetUrl(documentWithUrl.file_url);
  }

  if (signatureDocument.file_path) {
    return resolveStorageAssetUrl(signatureDocument.file_path);
  }

  return '';
};

const resolveDocumentUrl = (document: LoanDocument): string => {
  const direct = String(document.file_url || '').trim();
  if (direct) {
    return resolveStorageAssetUrl(direct);
  }

  const fallback = String(document.file_path || '').trim();
  if (fallback) {
    return resolveStorageAssetUrl(fallback);
  }

  return '';
};

const isImageLike = (value: string): boolean => {
  const lower = value.toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].some((ext) => lower.endsWith(ext));
};

const isPdfLike = (value: string): boolean => {
  return value.toLowerCase().endsWith('.pdf');
};

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type LoanSchedule = {
  approvalDate: string;
  nextPaymentDate: string;
  loanEndDate: string;
};

type CallConfirmationForm = {
  no_of_times_called: string;
  answered_by_customer: boolean;
  answered_by_spouse: boolean;
  customer_contact_no: string;
  spouse_contact_no: string;
  customer_full_name: string;
  nic_or_dob: string;
  loan_amount: string;
  given_date: string;
  business_details: string;
  repayment_card_given: 'yes' | 'no';
  special_notes: string;
  disbursement_otp: string;
  business_type: string;
  called_date: string;
};

type BmApprovalForm = {
  bm_comments: string;
  bm_additional_notes: string;
};

type CashAllocationForm = {
  branch_name: string;
  today_cash_requirement: string;
  tomorrow_cash_requirement: string;
  today_allocation_amount: string;
  tomorrow_allocation_amount: string;
};

type SecondCallConfirmationForm = {
  customer_full_name: boolean;
  nic_number: boolean;
  registered_mobile_number: boolean;
  date_of_birth: boolean;
  address: boolean;
  loan_amount: boolean;
  loan_purpose: boolean;
  loan_term: boolean;
  installment: boolean;
  payment_frequency: boolean;
  interest_rate: boolean;
  first_payment_date: boolean;
  number_of_installments: boolean;
};

type LoanSignatureCheckForm = {
  confirm_customer_photo: boolean;
  confirm_customer_signature: boolean;
};

type DocumentVerificationForm = {
  customer_national_id: boolean;
  passport: boolean;
  driving_license: boolean;
  bank_statements: boolean;
  epf_reports: boolean;
  tax_returns: boolean;
  paysheets: boolean;
  business_documents: boolean;
  guarantor_image: boolean;
  guarantor_signature: boolean;
};

type DocumentVerificationNotRequiredForm = {
  customer_national_id: boolean;
  passport: boolean;
  driving_license: boolean;
  bank_statements: boolean;
  epf_reports: boolean;
  tax_returns: boolean;
  paysheets: boolean;
  business_documents: boolean;
  guarantor_image: boolean;
  guarantor_signature: boolean;
};

type DocumentVerificationItem = {
  key: keyof DocumentVerificationForm;
  label: string;
  available: boolean;
  url: string;
};

const shiftDateFromBase = (
  baseDate: string,
  refundOption: LoanRequest['refund_option'],
  steps = 1
) => {
  const base = new Date(`${baseDate}T12:00:00`);

  if (refundOption === 'day') {
    base.setDate(base.getDate() + steps);
    return toInputDate(base);
  }

  if (refundOption === 'week') {
    base.setDate(base.getDate() + 7 * steps);
    return toInputDate(base);
  }

  base.setMonth(base.getMonth() + steps);
  return toInputDate(base);
};

const alignToCenterMeetingDay = (baseDate: string, meetingDay?: string | null) => {
  const normalized = String(meetingDay || '').trim().toLowerCase();
  if (!normalized) return baseDate;

  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  if (!(normalized in dayMap)) return baseDate;

  const base = new Date(`${baseDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return baseDate;

  const targetDay = dayMap[normalized];
  const currentDay = base.getDay();
  const delta = (targetDay - currentDay + 7) % 7;
  base.setDate(base.getDate() + delta);
  return toInputDate(base);
};

const buildDefaultLoanSchedule = (loan: LoanRequest): LoanSchedule => {
  const approvalDate = toInputDate(new Date());
  const termCount = Math.max(Number(loan.terms_count || 1), 1);
  const nextPaymentDate = shiftDateFromBase(approvalDate, loan.refund_option, 1);

  return {
    approvalDate,
    nextPaymentDate,
    loanEndDate: shiftDateFromBase(nextPaymentDate, loan.refund_option, Math.max(termCount - 1, 0)),
  };
};

const getResponsibleRoles = (loanAmount: number): string[] => {
  if (loanAmount < 10000) {
    return ['Assistant Manager', 'Loan Approver', 'Finance Manager', 'Branch Manager', 'Admin'];
  }

  return ['Loan Approver', 'Finance Manager', 'Branch Manager', 'Admin'];
};

const formatLoanType = (refundOption: LoanRequest['refund_option']) => {
  if (refundOption === 'day') return 'Day';
  if (refundOption === 'week') return 'Week';
  return 'Month';
};

const WORKFLOW_STEP_LABELS = [
  'CRO Check Pending',
  'Pending Call Confirmation',
  'BM approval',
  'Head Office Approval',
  'Cash Allocation',
  'Cash Request',
  'Cash Withdrawal',
  'Second Call Confirmation',
  'Loan Signature Check',
  'Document failing',
  'Insurance Request',
  'Branch Insurance Request',
  'Head Office Insurance Request',
  'Grant',
];

const resolveWorkflowStep = (loan: LoanRequest): number => {
  const raw = Number(loan.workflow_step || 1);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  if (raw > WORKFLOW_STEP_LABELS.length) return WORKFLOW_STEP_LABELS.length;
  return Math.floor(raw);
};

const getWorkflowStepLabel = (step: number) => {
  const normalized = Math.min(Math.max(Math.floor(step || 1), 1), WORKFLOW_STEP_LABELS.length);
  return WORKFLOW_STEP_LABELS[normalized - 1] || 'Workflow Step';
};

const WORKFLOW_STEP_DEFINITIONS: Record<number, string> = {
  1: 'Initial CRO review of customer basics and field-level readiness.',
  2: 'First call verification to confirm customer intent and details.',
  3: 'Branch Manager approval checkpoint before head office flow.',
  4: 'Head office approval review for policy and risk compliance.',
  5: 'Cash allocation planning for the approved loan amount.',
  6: 'Cash request submission to prepare withdrawal processing.',
  7: 'Cash withdrawal execution and transfer readiness.',
  8: 'Second call confirmation before signature and final checks.',
  9: 'Loan signature verification and document completeness check.',
  10: 'Document correction stage for missing or invalid paperwork.',
  11: 'Insurance request creation for required loan protection.',
  12: 'Branch-level insurance processing and confirmation.',
  13: 'Head office insurance final confirmation and clearance.',
  14: 'Final grant stage for loan release completion.',
};

const getWorkflowStepDefinition = (step: number) => {
  const normalized = Math.min(Math.max(Math.floor(step || 1), 1), WORKFLOW_STEP_LABELS.length);
  return WORKFLOW_STEP_DEFINITIONS[normalized] || 'Workflow step definition is not available.';
};

const getBackStepOptions = (currentStep: number): number[] => {
  const normalizedCurrentStep = Math.min(Math.max(Math.floor(currentStep || 1), 1), WORKFLOW_STEP_LABELS.length);
  const options: number[] = [];

  for (let step = normalizedCurrentStep - 1; step >= 1; step -= 1) {
    options.push(step);
  }

  return options;
};

export default function LoanApprovalsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const [requests, setRequests] = useState<LoanRequest[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [advancingId, setAdvancingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [documentRequestingId, setDocumentRequestingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState<{ open: boolean; title: string; message: string; onClose?: () => void }>({
    open: false,
    title: '',
    message: '',
  });
  const [scheduleByLoanId, setScheduleByLoanId] = useState<Record<number, LoanSchedule>>({});
  const [photoViewer, setPhotoViewer] = useState<{ open: boolean; title: string; imageUrl: string }>({
    open: false,
    title: '',
    imageUrl: '',
  });
  const [detailsViewer, setDetailsViewer] = useState<{ open: boolean; loan: LoanRequest | null }>({
    open: false,
    loan: null,
  });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [customerDocumentsByLoanId, setCustomerDocumentsByLoanId] = useState<Record<number, CustomerDocument[]>>({});
  const [customerIdByLoanId, setCustomerIdByLoanId] = useState<Record<number, number>>({});
  const [approvalCandidates, setApprovalCandidates] = useState<ApprovalCandidate[]>([]);
  const [approvalCandidatesLoading, setApprovalCandidatesLoading] = useState(false);
  const [requestApprovalModal, setRequestApprovalModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    employeeId: string;
  }>({
    open: false,
    loan: null,
    employeeId: '',
  });
  const [approvalRequestingId, setApprovalRequestingId] = useState<number | null>(null);
  const [sendBackModal, setSendBackModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    targetStep: string;
    note: string;
  }>({
    open: false,
    loan: null,
    targetStep: '',
    note: '',
  });
  const [sendBackSubmittingId, setSendBackSubmittingId] = useState<number | null>(null);
  const [markCalledSubmittingId, setMarkCalledSubmittingId] = useState<number | null>(null);
  const [cashAllocatingId, setCashAllocatingId] = useState<number | null>(null);
  const [secondCallConfirmingId, setSecondCallConfirmingId] = useState<number | null>(null);
  const [documentVerifyingId, setDocumentVerifyingId] = useState<number | null>(null);
  const [bmApprovalModal, setBmApprovalModal] = useState<{ open: boolean; loan: LoanRequest | null; form: BmApprovalForm }>({
    open: false,
    loan: null,
    form: {
      bm_comments: '',
      bm_additional_notes: '',
    },
  });
  const [hoApprovalModal, setHoApprovalModal] = useState<{ open: boolean; loan: LoanRequest | null }>({
    open: false,
    loan: null,
  });
  const [cashAllocationModal, setCashAllocationModal] = useState<{ open: boolean; loan: LoanRequest | null; form: CashAllocationForm }>({
    open: false,
    loan: null,
    form: {
      branch_name: '',
      today_cash_requirement: '0',
      tomorrow_cash_requirement: '0',
      today_allocation_amount: '0',
      tomorrow_allocation_amount: '0',
    },
  });
  const [cashRequestModal, setCashRequestModal] = useState<{ open: boolean; loan: LoanRequest | null }>({
    open: false,
    loan: null,
  });
  const [cashWithdrawalModal, setCashWithdrawalModal] = useState<{ open: boolean; loan: LoanRequest | null }>({
    open: false,
    loan: null,
  });
  const [loanSignatureCheckModal, setLoanSignatureCheckModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    form: LoanSignatureCheckForm;
  }>({
    open: false,
    loan: null,
    form: {
      confirm_customer_photo: false,
      confirm_customer_signature: false,
    },
  });
  const [documentVerificationModal, setDocumentVerificationModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    form: DocumentVerificationForm;
    notRequired: DocumentVerificationNotRequiredForm;
  }>({
    open: false,
    loan: null,
    form: {
      customer_national_id: false,
      passport: false,
      driving_license: false,
      bank_statements: false,
      epf_reports: false,
      tax_returns: false,
      paysheets: false,
      business_documents: false,
      guarantor_image: false,
      guarantor_signature: false,
    },
    notRequired: {
      customer_national_id: false,
      passport: false,
      driving_license: false,
      bank_statements: false,
      epf_reports: false,
      tax_returns: false,
      paysheets: false,
      business_documents: false,
      guarantor_image: false,
      guarantor_signature: false,
    },
  });
  const [secondCallConfirmationModal, setSecondCallConfirmationModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    form: SecondCallConfirmationForm;
  }>({
    open: false,
    loan: null,
    form: {
      customer_full_name: false,
      nic_number: false,
      registered_mobile_number: false,
      date_of_birth: false,
      address: false,
      loan_amount: false,
      loan_purpose: false,
      loan_term: false,
      installment: false,
      payment_frequency: false,
      interest_rate: false,
      first_payment_date: false,
      number_of_installments: false,
    },
  });
  const [markCalledModal, setMarkCalledModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    form: CallConfirmationForm;
  }>({
    open: false,
    loan: null,
    form: {
      no_of_times_called: '1',
      answered_by_customer: true,
      answered_by_spouse: false,
      customer_contact_no: '',
      spouse_contact_no: '',
      customer_full_name: '',
      nic_or_dob: '',
      loan_amount: '0',
      given_date: '',
      business_details: '',
      repayment_card_given: 'no',
      special_notes: '',
      disbursement_otp: '',
      business_type: '',
      called_date: toInputDate(new Date()),
    },
  });
  const [editLoanModal, setEditLoanModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    form: EditLoanForm;
    saving: boolean;
  }>({
    open: false,
    loan: null,
    form: {
      customer_name: '',
      contact_no: '',
      address: '',
      bank_name: '',
      bank_branch: '',
      bank_account_no: '',
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
      reason: '',
      charge_payment_mode: 'deduct_from_loan',
      charges_collection_status: 'pending',
      refund_option: 'month',
      interest_type: 'flat',
      loan_request_date: '',
    },
    saving: false,
  });
  const [documentViewerLoading, setDocumentViewerLoading] = useState(false);
  const [documentViewer, setDocumentViewer] = useState<{
    open: boolean;
    title: string;
    url: string;
    type: 'image' | 'pdf' | 'other';
    isBlobUrl: boolean;
  }>({
    open: false,
    title: '',
    url: '',
    type: 'other',
    isBlobUrl: false,
  });

  const openModal = (message: string, title = 'Notice', onClose?: () => void) => {
    setModal({ open: true, title, message, onClose });
  };

  const closeModal = () => {
    const callback = modal.onClose;
    setModal({ open: false, title: '', message: '' });
    if (callback) callback();
  };

  const openPhotoViewer = (loan: LoanRequest) => {
    const imageUrl = resolveLoanCustomerPhotoUrl(loan);
    if (!imageUrl) {
      openModal('No customer photo uploaded for this loan.', 'Customer Photo');
      return;
    }

    setPhotoViewer({
      open: true,
      title: `${loan.customer_name} (${loan.customer_no})`,
      imageUrl,
    });
  };

  const closePhotoViewer = () => {
    setPhotoViewer({ open: false, title: '', imageUrl: '' });
  };

  const ensureCustomerDocumentsLoaded = async (loan: LoanRequest) => {
    if (customerDocumentsByLoanId[loan.id]) {
      return;
    }

    setDetailsLoading(true);
    try {
      const normalizedCode = String(loan.customer_no || '').trim();
      if (!normalizedCode) {
        setCustomerDocumentsByLoanId((prev) => ({ ...prev, [loan.id]: [] }));
        return;
      }

      const customerLookupResponse = await axios.get(
        `${API_BASE}/customers/by-code/${encodeURIComponent(normalizedCode)}`,
        { headers }
      );

      const customerId = Number(customerLookupResponse.data?.data?.id || 0);
      if (!customerId) {
        setCustomerDocumentsByLoanId((prev) => ({ ...prev, [loan.id]: [] }));
        return;
      }

      setCustomerIdByLoanId((prev) => ({ ...prev, [loan.id]: customerId }));

      const customerDocumentsResponse = await axios.get(`${API_BASE}/customers/${customerId}/documents`, {
        headers,
      });

      const customerDocumentsRows = Array.isArray(customerDocumentsResponse.data?.data)
        ? customerDocumentsResponse.data.data
        : [];

      setCustomerDocumentsByLoanId((prev) => ({
        ...prev,
        [loan.id]: customerDocumentsRows.map((row: Record<string, unknown>) => ({
          id: Number(row.id || 0),
          customer_id: Number(row.customer_id || customerId || 0),
          document_type: String(row.document_type || ''),
          file_path: String(row.file_path || ''),
          original_name: String(row.original_name || ''),
        })),
      }));
    } catch {
      setCustomerDocumentsByLoanId((prev) => ({ ...prev, [loan.id]: [] }));
    } finally {
      setDetailsLoading(false);
    }
  };

  const openDetailsViewer = async (loan: LoanRequest) => {
    setDetailsViewer({ open: true, loan });
    await ensureCustomerDocumentsLoaded(loan);
  };

  const closeDetailsViewer = () => {
    setDetailsViewer({ open: false, loan: null });
  };

  const detectViewerType = (title: string, url: string, contentType?: string): 'image' | 'pdf' | 'other' => {
    const normalizedContentType = String(contentType || '').toLowerCase();
    if (normalizedContentType.startsWith('image/')) return 'image';
    if (normalizedContentType.includes('pdf')) return 'pdf';
    if (isImageLike(url) || isImageLike(title)) return 'image';
    if (isPdfLike(url) || isPdfLike(title)) return 'pdf';
    return 'other';
  };

  const releaseBlobViewerUrl = (url: string, isBlobUrl: boolean) => {
    if (isBlobUrl && typeof window !== 'undefined' && url.startsWith('blob:')) {
      window.URL.revokeObjectURL(url);
    }
  };

  const openDocumentViewer = async (title: string, url: string) => {
    if (!url) {
      openModal('Document preview is not available for this file.', 'Preview');
      return;
    }

    setDocumentViewerLoading(true);
    try {
      const canTryAuthenticatedFetch = Boolean(token) && !url.startsWith('blob:') && !url.startsWith('data:');

      if (canTryAuthenticatedFetch) {
        try {
          const response = await axios.get(url, {
            headers,
            responseType: 'blob',
          });

          const contentType = String(response.headers['content-type'] || 'application/octet-stream');
          const blob = new Blob([response.data], { type: contentType });
          const blobUrl = window.URL.createObjectURL(blob);
          const type = detectViewerType(title, blobUrl, contentType);

          setDocumentViewer((prev) => {
            releaseBlobViewerUrl(prev.url, prev.isBlobUrl);
            return {
              open: true,
              title,
              url: blobUrl,
              type,
              isBlobUrl: true,
            };
          });
          return;
        } catch (error: unknown) {
          if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            openModal('You do not have permission to preview this document.', 'Preview');
            return;
          }
          // Fall back to direct URL preview below for non-auth failures.
        }
      }

      const type = detectViewerType(title, url);
      setDocumentViewer((prev) => {
        releaseBlobViewerUrl(prev.url, prev.isBlobUrl);
        return {
          open: true,
          title,
          url,
          type,
          isBlobUrl: false,
        };
      });
    } finally {
      setDocumentViewerLoading(false);
    }
  };

  const openCustomerDocumentViewer = async (loan: LoanRequest, customerDocument: CustomerDocument) => {
    if (!token) return;

    const title = customerDocument.original_name || customerDocument.document_type || 'Document';
    setDocumentViewerLoading(true);
    try {
      let customerId = Number(customerIdByLoanId[loan.id] || customerDocument.customer_id || 0);

      if (!customerId) {
        const normalizedCode = String(loan.customer_no || '').trim();
        if (normalizedCode) {
          const customerLookupResponse = await axios.get(
            `${API_BASE}/customers/by-code/${encodeURIComponent(normalizedCode)}`,
            { headers }
          );
          customerId = Number(customerLookupResponse.data?.data?.id || 0);
          if (customerId) {
            setCustomerIdByLoanId((prev) => ({ ...prev, [loan.id]: customerId }));
          }
        }
      }

      if (!customerId) {
        openModal('Unable to verify document owner for preview.', 'Preview');
        return;
      }

      const response = await axios.get(
        `${API_BASE}/customers/${customerId}/documents/${customerDocument.id}/download`,
        {
          headers,
          responseType: 'blob',
        }
      );

      const contentType = String(response.headers['content-type'] || 'application/octet-stream');
      const blob = new Blob([response.data], { type: contentType });
      const blobUrl = window.URL.createObjectURL(blob);
      const type = detectViewerType(title, blobUrl, contentType);

      setDocumentViewer((prev) => {
        releaseBlobViewerUrl(prev.url, prev.isBlobUrl);
        return {
          open: true,
          title,
          url: blobUrl,
          type,
          isBlobUrl: true,
        };
      });
    } catch (error: unknown) {
      let message = 'Document preview is not available for this file.';
      const responseData = axios.isAxiosError(error) ? error.response?.data : null;

      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          const parsed = JSON.parse(text);
          if (typeof parsed?.message === 'string' && parsed.message.trim() !== '') {
            message = parsed.message;
          }
        } catch {
          // Keep default message.
        }
      }

      openModal(message, 'Preview');
    } finally {
      setDocumentViewerLoading(false);
    }
  };

  const closeDocumentViewer = () => {
    setDocumentViewer((prev) => {
      releaseBlobViewerUrl(prev.url, prev.isBlobUrl);
      return { open: false, title: '', url: '', type: 'other', isBlobUrl: false };
    });
  };

  const getApprovalEmployeeName = (loan: LoanRequest) => {
    const firstName = String(loan.approvalEmployee?.first_name || '').trim();
    const lastName = String(loan.approvalEmployee?.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
    if (loan.approval_employee_id) return `Employee #${loan.approval_employee_id}`;
    return '-';
  };

  const readEvaluationValue = (loan: LoanRequest, keys: string[]): string => {
    const payload = loan.evaluation_payload;
    if (!payload || typeof payload !== 'object') return '';

    for (const key of keys) {
      const value = payload[key];
      if (value === null || value === undefined) continue;
      const normalized = String(value).trim();
      if (normalized !== '') return normalized;
    }

    return '';
  };

  const resolveSpouseContactNo = (loan: LoanRequest) =>
    readEvaluationValue(loan, ['spouse_contact_no', 'spouse_contact', 'spouse_phone', 'spouse_mobile', 'spouse_telephone']);

  const resolveNicOrDob = (loan: LoanRequest) => {
    const dob = readEvaluationValue(loan, ['date_of_birth', 'dob', 'customer_date_of_birth']);
    if (dob) {
      const nicText = String(loan.nic || '').trim();
      return nicText ? `${nicText} / ${dob}` : dob;
    }
    return String(loan.nic || '').trim();
  };

  const resolveCustomerDob = (loan: LoanRequest) => readEvaluationValue(loan, ['date_of_birth', 'dob', 'customer_date_of_birth']);

  const buildDocumentVerificationItems = (loan: LoanRequest): DocumentVerificationItem[] => {
    const customerDocuments = customerDocumentsByLoanId[loan.id] || [];
    const loanDocuments = loan.documents || [];

    const findCustomerDocument = (keywords: string[]): CustomerDocument | null => {
      const match = customerDocuments.find((doc) => {
        const type = String(doc.document_type || '').toLowerCase();
        return keywords.some((keyword) => type.includes(keyword));
      });
      return match || null;
    };

    const findLoanDocument = (keywords: string[]): LoanDocument | null => {
      const match = loanDocuments.find((doc) => {
        const type = String(doc.document_type || '').toLowerCase();
        return keywords.some((keyword) => type.includes(keyword));
      });
      return match || null;
    };

    const resolveAnyDocumentUrl = (keywords: string[]): string => {
      const customerDoc = findCustomerDocument(keywords);
      if (customerDoc) {
        const customerId = Number(customerIdByLoanId[loan.id] || customerDoc.customer_id || 0);
        if (customerId > 0 && customerDoc.id > 0) {
          return `${API_BASE}/customers/${customerId}/documents/${customerDoc.id}/download`;
        }
        return resolveStorageAssetUrl(String(customerDoc.file_path || ''));
      }

      const loanDoc = findLoanDocument(keywords);
      if (loanDoc) {
        return resolveDocumentUrl(loanDoc);
      }

      return '';
    };

    const guarantorWithImage = (loan.guarantors || []).find((guarantor) => String(guarantor.image_url || '').trim() !== '');
    const guarantorWithSignature = (loan.guarantors || []).find((guarantor) => String(guarantor.signature_url || '').trim() !== '');

    const items: DocumentVerificationItem[] = [
      {
        key: 'customer_national_id',
        label: 'Customer National ID',
        url: resolveAnyDocumentUrl(['national id', 'nic', 'id card']),
        available: false,
      },
      {
        key: 'passport',
        label: 'Passport',
        url: resolveAnyDocumentUrl(['passport']),
        available: false,
      },
      {
        key: 'driving_license',
        label: 'Driving License',
        url: resolveAnyDocumentUrl(['driving license', 'driving licence', 'license', 'licence']),
        available: false,
      },
      {
        key: 'bank_statements',
        label: 'Bank Statements',
        url: resolveAnyDocumentUrl(['bank statement', 'statement']),
        available: false,
      },
      {
        key: 'epf_reports',
        label: 'EPF Reports',
        url: resolveAnyDocumentUrl(['epf']),
        available: false,
      },
      {
        key: 'tax_returns',
        label: 'Tax Returns',
        url: resolveAnyDocumentUrl(['tax return', 'tax']),
        available: false,
      },
      {
        key: 'paysheets',
        label: 'Paysheets',
        url: resolveAnyDocumentUrl(['paysheet', 'pay sheet', 'salary slip', 'pay slip']),
        available: false,
      },
      {
        key: 'business_documents',
        label: 'Business Documents',
        url: resolveAnyDocumentUrl(['business document', 'business registration', 'br certificate']),
        available: false,
      },
      {
        key: 'guarantor_image',
        label: 'Guarantor Image',
        url: guarantorWithImage ? resolveStorageAssetUrl(String(guarantorWithImage.image_url || '')) : '',
        available: false,
      },
      {
        key: 'guarantor_signature',
        label: 'Guarantor Signature',
        url: guarantorWithSignature ? resolveStorageAssetUrl(String(guarantorWithSignature.signature_url || '')) : '',
        available: false,
      },
    ];

    return items.map((item) => ({ ...item, available: String(item.url || '').trim() !== '' }));
  };

  const openMarkCalledModal = (loan: LoanRequest) => {
    const spouseContactNo = resolveSpouseContactNo(loan);
    const nicOrDob = resolveNicOrDob(loan);

    setMarkCalledModal({
      open: true,
      loan,
      form: {
        no_of_times_called: '1',
        answered_by_customer: true,
        answered_by_spouse: false,
        customer_contact_no: String(loan.contact_no || '').trim(),
        spouse_contact_no: spouseContactNo,
        customer_full_name: String(loan.customer_name || '').trim(),
        nic_or_dob: nicOrDob,
        loan_amount: String(Number(loan.loan_amount || 0)),
        given_date: String(loan.loan_request_date || '').trim() || toInputDate(new Date()),
        business_details: readEvaluationValue(loan, ['business_details', 'business_description', 'business_name']),
        repayment_card_given: 'no',
        special_notes: '',
        disbursement_otp: '',
        business_type: readEvaluationValue(loan, ['business_type']),
        called_date: toInputDate(new Date()),
      },
    });
  };

  const closeMarkCalledModal = () => {
    setMarkCalledModal((prev) => ({ ...prev, open: false, loan: null }));
  };

  const openBmApprovalModal = async (loan: LoanRequest) => {
    const payload = (loan.bm_approval_payload || {}) as Record<string, unknown>;
    setBmApprovalModal({
      open: true,
      loan,
      form: {
        bm_comments: String(payload.bm_comments || '').trim(),
        bm_additional_notes: String(payload.bm_additional_notes || '').trim(),
      },
    });

    await ensureCustomerDocumentsLoaded(loan);
  };

  const closeBmApprovalModal = () => {
    setBmApprovalModal((prev) => ({
      ...prev,
      open: false,
      loan: null,
    }));
  };

  const openHoApprovalModal = async (loan: LoanRequest) => {
    setHoApprovalModal({ open: true, loan });
    await ensureCustomerDocumentsLoaded(loan);
  };

  const closeHoApprovalModal = () => {
    setHoApprovalModal({ open: false, loan: null });
  };

  const openCashAllocationModal = (loan: LoanRequest) => {
    const payload = (loan.cash_allocation_payload || {}) as Record<string, unknown>;
    setCashAllocationModal({
      open: true,
      loan,
      form: {
        branch_name: String(payload.branch_name || loan.branch?.name || '').trim(),
        today_cash_requirement: String(payload.today_cash_requirement ?? Number(loan.loan_amount || 0)),
        tomorrow_cash_requirement: String(payload.tomorrow_cash_requirement ?? 0),
        today_allocation_amount: String(payload.today_allocation_amount ?? Number(loan.loan_amount || 0)),
        tomorrow_allocation_amount: String(payload.tomorrow_allocation_amount ?? 0),
      },
    });
  };

  const closeCashAllocationModal = () => {
    setCashAllocationModal((prev) => ({ ...prev, open: false, loan: null }));
  };

  const openCashRequestModal = (loan: LoanRequest) => {
    setCashRequestModal({ open: true, loan });
  };

  const closeCashRequestModal = () => {
    setCashRequestModal({ open: false, loan: null });
  };

  const openCashWithdrawalModal = (loan: LoanRequest) => {
    setCashWithdrawalModal({ open: true, loan });
  };

  const closeCashWithdrawalModal = () => {
    setCashWithdrawalModal({ open: false, loan: null });
  };

  const openSecondCallConfirmationModal = (loan: LoanRequest) => {
    setSecondCallConfirmationModal({
      open: true,
      loan,
      form: {
        customer_full_name: false,
        nic_number: false,
        registered_mobile_number: false,
        date_of_birth: false,
        address: false,
        loan_amount: false,
        loan_purpose: false,
        loan_term: false,
        installment: false,
        payment_frequency: false,
        interest_rate: false,
        first_payment_date: false,
        number_of_installments: false,
      },
    });
  };

  const closeSecondCallConfirmationModal = () => {
    setSecondCallConfirmationModal((prev) => ({ ...prev, open: false, loan: null }));
  };

  const openLoanSignatureCheckModal = (loan: LoanRequest) => {
    setLoanSignatureCheckModal({
      open: true,
      loan,
      form: {
        confirm_customer_photo: false,
        confirm_customer_signature: false,
      },
    });
  };

  const closeLoanSignatureCheckModal = () => {
    setLoanSignatureCheckModal((prev) => ({
      ...prev,
      open: false,
      loan: null,
      form: {
        confirm_customer_photo: false,
        confirm_customer_signature: false,
      },
    }));
  };

  const openDocumentVerificationModal = async (loan: LoanRequest) => {
    await ensureCustomerDocumentsLoaded(loan);

    setDocumentVerificationModal({
      open: true,
      loan,
      form: {
        customer_national_id: false,
        passport: false,
        driving_license: false,
        bank_statements: false,
        epf_reports: false,
        tax_returns: false,
        paysheets: false,
        business_documents: false,
        guarantor_image: false,
        guarantor_signature: false,
      },
      notRequired: {
        customer_national_id: false,
        passport: false,
        driving_license: false,
        bank_statements: false,
        epf_reports: false,
        tax_returns: false,
        paysheets: false,
        business_documents: false,
        guarantor_image: false,
        guarantor_signature: false,
      },
    });
  };

  const closeDocumentVerificationModal = () => {
    setDocumentVerificationModal((prev) => ({
      ...prev,
      open: false,
      loan: null,
      form: {
        customer_national_id: false,
        passport: false,
        driving_license: false,
        bank_statements: false,
        epf_reports: false,
        tax_returns: false,
        paysheets: false,
        business_documents: false,
        guarantor_image: false,
        guarantor_signature: false,
      },
      notRequired: {
        customer_national_id: false,
        passport: false,
        driving_license: false,
        bank_statements: false,
        epf_reports: false,
        tax_returns: false,
        paysheets: false,
        business_documents: false,
        guarantor_image: false,
        guarantor_signature: false,
      },
    }));
  };

  const submitMarkAsCalled = async () => {
    if (!token || !markCalledModal.loan) return;

    const loanId = markCalledModal.loan.id;
    const form = markCalledModal.form;
    setMarkCalledSubmittingId(loanId);

    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loanId}/mark-as-called`,
        {
          no_of_times_called: Number(form.no_of_times_called || 0),
          answered_by_customer: form.answered_by_customer,
          answered_by_spouse: form.answered_by_spouse,
          customer_contact_no: form.customer_contact_no,
          spouse_contact_no: form.spouse_contact_no,
          customer_full_name: form.customer_full_name,
          nic_or_dob: form.nic_or_dob,
          loan_amount: Number(form.loan_amount || 0),
          given_date: form.given_date,
          business_details: form.business_details,
          repayment_card_given: form.repayment_card_given,
          special_notes: form.special_notes,
          disbursement_otp: form.disbursement_otp,
          business_type: form.business_type,
          called_date: form.called_date,
        },
        { headers }
      );

      const updatedLoan = (response.data?.data || null) as LoanRequest | null;
      if (updatedLoan && Number(updatedLoan.id || 0) > 0) {
        setRequests((prev) => prev.map((item) => (item.id === updatedLoan.id ? { ...item, ...updatedLoan } : item)));

        if (detailsViewer.open && detailsViewer.loan?.id === updatedLoan.id) {
          setDetailsViewer((prev) => {
            if (!prev.loan) return prev;
            return { ...prev, loan: { ...prev.loan, ...updatedLoan } };
          });
        }
      }

      const message =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Call confirmation saved successfully.';

      closeMarkCalledModal();
      openModal(message, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to save call confirmation details.';
      openModal(message, 'Error');
    } finally {
      setMarkCalledSubmittingId(null);
    }
  };

  const submitBmApprovalAndMoveNext = async () => {
    if (!token || !bmApprovalModal.loan) return;

    const comments = String(bmApprovalModal.form.bm_comments || '').trim();
    if (!comments) {
      openModal('Please add BM comments before approval.', 'BM Approval');
      return;
    }

    const loanId = bmApprovalModal.loan.id;
    setAdvancingId(loanId);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loanId}/approve-bm-step`,
        {
          bm_comments: comments,
          bm_additional_notes: String(bmApprovalModal.form.bm_additional_notes || '').trim(),
        },
        { headers }
      );

      const updatedLoan = (response.data?.data || null) as LoanRequest | null;
      if (updatedLoan && Number(updatedLoan.id || 0) > 0) {
        setRequests((prev) => prev.map((item) => (item.id === updatedLoan.id ? { ...item, ...updatedLoan } : item)));

        if (detailsViewer.open && detailsViewer.loan?.id === updatedLoan.id) {
          setDetailsViewer((prev) => {
            if (!prev.loan) return prev;
            return { ...prev, loan: { ...prev.loan, ...updatedLoan } };
          });
        }
      }

      const message =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Branch Manager approval saved and moved to Head Office step.';

      closeBmApprovalModal();
      openModal(message, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to complete Branch Manager approval.';
      openModal(message, 'Error');
    } finally {
      setAdvancingId(null);
    }
  };

  const submitHeadOfficeApprovalAndMoveNext = async () => {
    if (!hoApprovalModal.loan) return;

    const ok = await handleAdvanceWorkflowStep(hoApprovalModal.loan);
    if (ok) {
      closeHoApprovalModal();
    }
  };

  const submitCashAllocationAndMoveNext = async () => {
    if (!token || !cashAllocationModal.loan) return;

    const form = cashAllocationModal.form;
    const branchName = String(form.branch_name || '').trim();
    if (!branchName) {
      openModal('Branch name is required for cash allocation.', 'Cash Allocation');
      return;
    }

    const loanId = cashAllocationModal.loan.id;
    setCashAllocatingId(loanId);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loanId}/complete-cash-allocation-step`,
        {
          branch_name: branchName,
          today_cash_requirement: Number(form.today_cash_requirement || 0),
          tomorrow_cash_requirement: Number(form.tomorrow_cash_requirement || 0),
          today_allocation_amount: Number(form.today_allocation_amount || 0),
          tomorrow_allocation_amount: Number(form.tomorrow_allocation_amount || 0),
        },
        { headers }
      );

      const updatedLoan = (response.data?.data || null) as LoanRequest | null;
      if (updatedLoan && Number(updatedLoan.id || 0) > 0) {
        setRequests((prev) => prev.map((item) => (item.id === updatedLoan.id ? { ...item, ...updatedLoan } : item)));

        if (detailsViewer.open && detailsViewer.loan?.id === updatedLoan.id) {
          setDetailsViewer((prev) => {
            if (!prev.loan) return prev;
            return { ...prev, loan: { ...prev.loan, ...updatedLoan } };
          });
        }
      }

      const message =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Cash allocation saved and moved to next step.';

      closeCashAllocationModal();
      openModal(message, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to complete cash allocation.';
      openModal(message, 'Error');
    } finally {
      setCashAllocatingId(null);
    }
  };

  const submitCashRequestAndMoveNext = async () => {
    if (!cashRequestModal.loan) return;

    const ok = await handleAdvanceWorkflowStep(cashRequestModal.loan);
    if (ok) {
      closeCashRequestModal();
    }
  };

  const submitCashWithdrawalAndMoveNext = async () => {
    if (!cashWithdrawalModal.loan) return;

    const ok = await handleAdvanceWorkflowStep(cashWithdrawalModal.loan);
    if (ok) {
      closeCashWithdrawalModal();
    }
  };

  const submitSecondCallConfirmationAndMoveNext = async () => {
    if (!token || !secondCallConfirmationModal.loan) return;

    const form = secondCallConfirmationModal.form;
    const allConfirmed = Object.values(form).every(Boolean);
    if (!allConfirmed) {
      openModal('Please confirm all details with customer before moving to Step 9.', 'Second Call Confirmation');
      return;
    }

    const loan = secondCallConfirmationModal.loan;
    const schedule = getLoanSchedule(loan);
    const loanTypeLabel = formatLoanType(loan.refund_option);
    const loanTerm = `${loan.terms_count} ${loanTypeLabel}(s)`;
    const dateOfBirth = resolveCustomerDob(loan);
    const firstPaymentDate = schedule.nextPaymentDate || '';

    setSecondCallConfirmingId(loan.id);
    setAdvancingId(loan.id);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loan.id}/confirm-second-call-step`,
        {
          customer_full_name: String(loan.customer_name || '').trim(),
          nic_number: String(loan.nic || '').trim(),
          registered_mobile_number: String(loan.contact_no || '').trim(),
          date_of_birth: dateOfBirth,
          address: String(loan.address || '').trim(),
          loan_amount: Number(loan.loan_amount || 0),
          loan_purpose: String(loan.reason || '').trim(),
          loan_term: loanTerm,
          installment: Number(loan.installment_amount || 0),
          payment_frequency: loanTypeLabel,
          interest_rate: Number(loan.interest_rate || 0),
          first_payment_date: firstPaymentDate,
          number_of_installments: Number(loan.terms_count || 0),
          confirm_customer_full_name: form.customer_full_name,
          confirm_nic_number: form.nic_number,
          confirm_registered_mobile_number: form.registered_mobile_number,
          confirm_date_of_birth: form.date_of_birth,
          confirm_address: form.address,
          confirm_loan_amount: form.loan_amount,
          confirm_loan_purpose: form.loan_purpose,
          confirm_loan_term: form.loan_term,
          confirm_installment: form.installment,
          confirm_payment_frequency: form.payment_frequency,
          confirm_interest_rate: form.interest_rate,
          confirm_first_payment_date: form.first_payment_date,
          confirm_number_of_installments: form.number_of_installments,
        },
        { headers }
      );

      const updatedLoan = (response.data?.data || null) as LoanRequest | null;
      if (updatedLoan && Number(updatedLoan.id || 0) > 0) {
        setRequests((prev) => prev.map((item) => (item.id === updatedLoan.id ? { ...item, ...updatedLoan } : item)));

        if (detailsViewer.open && detailsViewer.loan?.id === updatedLoan.id) {
          setDetailsViewer((prev) => {
            if (!prev.loan) return prev;
            return { ...prev, loan: { ...prev.loan, ...updatedLoan } };
          });
        }
      }

      const message =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Second call confirmation saved and moved to Step 9: Loan Signature Check.';

      closeSecondCallConfirmationModal();
      openModal(message, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to save second call confirmation details.';
      openModal(message, 'Error');
    } finally {
      setSecondCallConfirmingId(null);
      setAdvancingId(null);
    }
  };

  const submitLoanSignatureCheckAndMoveNext = async () => {
    if (!loanSignatureCheckModal.loan) return;

    const { confirm_customer_photo, confirm_customer_signature } = loanSignatureCheckModal.form;
    if (!confirm_customer_photo || !confirm_customer_signature) {
      openModal('Please confirm both customer photo and customer signature before moving to Step 10.', 'Loan Signature Check');
      return;
    }

    const ok = await handleAdvanceWorkflowStep(loanSignatureCheckModal.loan);
    if (ok) {
      closeLoanSignatureCheckModal();
    }
  };

  const submitDocumentVerificationAndMoveNext = async () => {
    if (!token || !documentVerificationModal.loan) return;

    const loan = documentVerificationModal.loan;
    const form = documentVerificationModal.form;
    const notRequired = documentVerificationModal.notRequired;
    const items = buildDocumentVerificationItems(loan);

    const nationalIdVerified = Boolean(form.customer_national_id);

    const missingItems = items.filter((item) => {
      if (notRequired[item.key]) return false;
      if ((item.key === 'passport' || item.key === 'driving_license') && nationalIdVerified) return false;
      return !item.available;
    });
    if (missingItems.length > 0) {
      openModal(
        `Missing documents: ${missingItems.map((item) => item.label).join(', ')}. Please upload all required documents before verification.`,
        'Document Verification'
      );
      return;
    }

    const uncheckedItems = items.filter((item) => {
      if (form[item.key]) return false;
      if (notRequired[item.key]) return false;
      if ((item.key === 'passport' || item.key === 'driving_license') && nationalIdVerified) return false;
      return true;
    });
    if (uncheckedItems.length > 0) {
      openModal(
        `Please verify all documents. Pending: ${uncheckedItems.map((item) => item.label).join(', ')}.`,
        'Document Verification'
      );
      return;
    }

    setDocumentVerifyingId(loan.id);
    setAdvancingId(loan.id);
    try {
      const documentsPayload = items.reduce<Record<string, { label: string; available: boolean; confirmed: boolean; not_required: boolean; url: string }>>(
        (acc, item) => {
          acc[item.key] = {
            label: item.label,
            available: item.available,
            confirmed: Boolean(form[item.key]),
            not_required: Boolean(notRequired[item.key]),
            url: item.url,
          };
          return acc;
        },
        {}
      );

      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loan.id}/confirm-document-verification-step`,
        {
          documents: documentsPayload,
        },
        { headers }
      );

      const updatedLoan = (response.data?.data || null) as LoanRequest | null;
      if (updatedLoan && Number(updatedLoan.id || 0) > 0) {
        setRequests((prev) => prev.map((item) => (item.id === updatedLoan.id ? { ...item, ...updatedLoan } : item)));

        if (detailsViewer.open && detailsViewer.loan?.id === updatedLoan.id) {
          setDetailsViewer((prev) => {
            if (!prev.loan) return prev;
            return { ...prev, loan: { ...prev.loan, ...updatedLoan } };
          });
        }
      }

      const message =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Document verification saved and moved to Step 11: Insurance Request.';

      closeDocumentVerificationModal();
      openModal(message, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to save document verification.';
      openModal(message, 'Error');
    } finally {
      setDocumentVerifyingId(null);
      setAdvancingId(null);
    }
  };

  const loadApprovalCandidates = async () => {
    if (!token) return;

    setApprovalCandidatesLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/microfinance/loan-requests/approval-candidates`, {
        headers,
      });
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setApprovalCandidates(
        rows
          .map((row: Record<string, unknown>) => ({
            id: Number(row.id || 0),
            name: String(row.name || ''),
            employee_code: String(row.employee_code || ''),
            designation: String(row.designation || ''),
            branch_id: row.branch_id !== null && row.branch_id !== undefined ? Number(row.branch_id) : null,
            branch_name: String(row.branch_name || ''),
            email: String(row.email || ''),
          }))
          .filter((item: ApprovalCandidate) => item.id > 0 && item.name.trim() !== '')
      );
    } catch {
      setApprovalCandidates([]);
      openModal('Failed to load approval candidates.', 'Error');
    } finally {
      setApprovalCandidatesLoading(false);
    }
  };

  const openRequestApprovalModal = async (loan: LoanRequest) => {
    const presetEmployeeId = loan.approval_employee_id ? String(loan.approval_employee_id) : '';
    setRequestApprovalModal({
      open: true,
      loan,
      employeeId: presetEmployeeId,
    });

    if (approvalCandidates.length === 0) {
      await loadApprovalCandidates();
    }
  };

  const closeRequestApprovalModal = () => {
    setRequestApprovalModal({ open: false, loan: null, employeeId: '' });
  };

  const openSendBackModal = (loan: LoanRequest) => {
    const currentStep = resolveWorkflowStep(loan);
    const defaultTargetStep = Math.max(currentStep - 1, 1);
    setSendBackModal({
      open: true,
      loan,
      targetStep: String(defaultTargetStep),
      note: '',
    });
  };

  const handleSendBackButtonClick = (loan: LoanRequest, event?: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openSendBackModal(loan);
  };

  const closeSendBackModal = () => {
    setSendBackModal({ open: false, loan: null, targetStep: '', note: '' });
  };

  const openEditLoanModal = (loan: LoanRequest) => {
    setEditLoanModal({
      open: true,
      loan,
      saving: false,
      form: {
        customer_name: String(loan.customer_name || '').trim(),
        contact_no: String(loan.contact_no || '').trim(),
        address: String(loan.address || '').trim(),
        bank_name: String(loan.bank_name || '').trim(),
        bank_branch: String(loan.bank_branch || '').trim(),
        bank_account_no: String(loan.bank_account_no || '').trim(),
        manager_name: String(loan.manager_name || '').trim(),
        field_officer: String(loan.field_officer || '').trim(),
        group_leader: String(loan.group_leader || '').trim(),
        loan_amount: String(Number(loan.loan_amount || 0)),
        interest_rate: String(Number(loan.interest_rate || 0)),
        terms_count: String(Math.max(Number(loan.terms_count || 1), 1)),
        refundable_amount: String(Number(loan.refundable_amount || 0)),
        installment_amount: String(Number(loan.installment_amount || 0)),
        document_charges: String(Number(loan.document_charges || 0)),
        stamp_charges: String(Number(loan.stamp_charges || 0)),
        insurance_charges: String(Number(loan.insurance_charges || 0)),
        reason: String(loan.reason || '').trim(),
        charge_payment_mode:
          loan.charge_payment_mode === 'hand_cash' ? 'hand_cash' : 'deduct_from_loan',
        charges_collection_status:
          loan.charges_collection_status === 'done' ? 'done' : 'pending',
        refund_option: loan.refund_option,
        interest_type: loan.interest_type,
        loan_request_date: String(loan.loan_request_date || '').slice(0, 10),
      },
    });
  };

  const closeEditLoanModal = () => {
    if (editLoanModal.saving) return;
    setEditLoanModal((prev) => ({ ...prev, open: false, loan: null }));
  };

  const submitEditLoanDetails = async () => {
    if (!token || !editLoanModal.loan) return;

    const loan = editLoanModal.loan;
    const form = editLoanModal.form;

    if (!form.customer_name.trim() || !form.contact_no.trim() || !form.address.trim()) {
      openModal('Customer name, contact number, and address are required.', 'Validation');
      return;
    }

    if (!form.manager_name.trim() || !form.field_officer.trim()) {
      openModal('Manager and collection officer are required.', 'Validation');
      return;
    }

    const loanAmount = Number(form.loan_amount || 0);
    const refundableAmount = Number(form.refundable_amount || 0);
    const installmentAmount = Number(form.installment_amount || 0);
    const interestRate = Number(form.interest_rate || 0);
    const termsCount = Number(form.terms_count || 0);
    const documentCharges = Number(form.document_charges || 0);
    const stampCharges = Number(form.stamp_charges || 0);
    const insuranceCharges = Number(form.insurance_charges || 0);

    if (loanAmount <= 0 || refundableAmount < 0 || installmentAmount < 0 || interestRate < 0 || termsCount < 1) {
      openModal('Please enter valid numeric values for loan amount, interest, terms, and repayment amounts.', 'Validation');
      return;
    }

    setEditLoanModal((prev) => ({ ...prev, saving: true }));
    try {
      const response = await axios.put(
        `${API_BASE}/microfinance/loan-requests/${loan.id}`,
        {
          loan_scope: loan.loan_scope,
          mf_route_id: loan.route?.id ?? null,
          mf_center_id: loan.center?.id ?? null,
          mf_group_id: loan.group?.id ?? null,
          approval_employee_id: loan.approval_employee_id ?? null,
          manager_name: form.manager_name.trim(),
          field_officer: form.field_officer.trim(),
          group_leader: form.group_leader.trim(),
          reference_no: String(loan.reference_no || loan.loan_code || '').trim() || null,
          customer_name: form.customer_name.trim(),
          nick_name: null,
          address: form.address.trim(),
          contact_no: form.contact_no.trim(),
          bank_name: form.bank_name.trim() || null,
          bank_branch: form.bank_branch.trim() || null,
          bank_account_no: form.bank_account_no.trim() || null,
          reason: form.reason.trim() || null,
          loan_amount: loanAmount,
          refund_option: form.refund_option,
          interest_type: form.interest_type,
          interest_rate: interestRate,
          terms_count: termsCount,
          refundable_amount: refundableAmount,
          installment_amount: installmentAmount,
          document_charges: Math.max(documentCharges, 0),
          stamp_charges: Math.max(stampCharges, 0),
          insurance_charges: Math.max(insuranceCharges, 0),
          charge_payment_mode: form.charge_payment_mode,
          charges_collection_status: form.charges_collection_status,
          loan_request_date: form.loan_request_date || loan.loan_request_date,
          guarantors: (loan.guarantors || []).map((guarantor) => ({
            name: String(guarantor.name || '').trim(),
            nic: guarantor.nic || null,
            address: guarantor.address || null,
            contact_no: guarantor.contact_no || null,
            relationship: guarantor.relationship || null,
          })),
        },
        { headers }
      );

      const updatedLoan = (response.data?.data || null) as LoanRequest | null;
      if (!updatedLoan) {
        openModal('Loan details were updated, but updated data was not returned.', 'Success');
      } else {
        setRequests((prev) => prev.map((item) => (item.id === updatedLoan.id ? { ...item, ...updatedLoan } : item)));
        setDetailsViewer((prev) => {
          if (!prev.loan || prev.loan.id !== updatedLoan.id) return prev;
          return { ...prev, loan: { ...prev.loan, ...updatedLoan } };
        });
        openModal('Loan details updated successfully.', 'Success');
      }

      setEditLoanModal((prev) => ({ ...prev, open: false, loan: null, saving: false }));
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to update loan details.';
      openModal(message, 'Error');
      setEditLoanModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const submitRequestApproval = async () => {
    if (!token) return;
    if (!requestApprovalModal.loan) return;

    const targetEmployeeId = Number(requestApprovalModal.employeeId || 0);
    if (!targetEmployeeId) {
      openModal('Please select an approver before submitting.', 'Request Approval');
      return;
    }

    const loanId = requestApprovalModal.loan.id;
    setApprovalRequestingId(loanId);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loanId}/request-approval`,
        {
          approval_employee_id: targetEmployeeId,
        },
        { headers }
      );

      const returnedLoan = response.data?.loan as Partial<LoanRequest> | undefined;
      const selectedCandidate = approvalCandidates.find((candidate) => candidate.id === targetEmployeeId);

      setRequests((prev) =>
        prev.map((loan) => {
          if (loan.id !== loanId) return loan;

          const approvalEmployee = returnedLoan?.approvalEmployee
            ? {
                id: returnedLoan.approvalEmployee.id,
                first_name: returnedLoan.approvalEmployee.first_name || null,
                last_name: returnedLoan.approvalEmployee.last_name || null,
              }
            : {
                id: targetEmployeeId,
                first_name: selectedCandidate?.name?.split(' ').slice(0, -1).join(' ') || selectedCandidate?.name || null,
                last_name: selectedCandidate?.name?.split(' ').slice(-1).join(' ') || null,
              };

          return {
            ...loan,
            approval_employee_id: targetEmployeeId,
            approvalEmployee: approvalEmployee,
          };
        })
      );

      if (detailsViewer.open && detailsViewer.loan?.id === loanId) {
        setDetailsViewer((prev) => {
          if (!prev.loan) return prev;

          return {
            ...prev,
            loan: {
              ...prev.loan,
              approval_employee_id: targetEmployeeId,
              approvalEmployee: returnedLoan?.approvalEmployee || prev.loan.approvalEmployee,
            },
          };
        });
      }

      closeRequestApprovalModal();
      const successMessage =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Approval requested successfully from selected user.';
      openModal(successMessage, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to request additional approval.';
      openModal(message, 'Error');
    } finally {
      setApprovalRequestingId(null);
    }
  };

  const submitSendBack = async () => {
    if (!token || !sendBackModal.loan) return;

    const loanId = sendBackModal.loan.id;
    const note = String(sendBackModal.note || '').trim();
    if (!note) {
      openModal('Please add a note before sending back the loan request.', 'Send Back');
      return;
    }

    const currentStep = resolveWorkflowStep(sendBackModal.loan);
    if (currentStep <= 1) {
      openModal('Step 1 loans cannot be moved back. They are already at the first step.', 'Send Back');
      return;
    }

    const targetStep = Number(sendBackModal.targetStep || 0);
    if (!Number.isFinite(targetStep) || targetStep < 1 || targetStep >= currentStep) {
      openModal(`Please enter a valid previous step between 1 and ${currentStep - 1}.`, 'Send Back');
      return;
    }

    setSendBackSubmittingId(loanId);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loanId}/send-back`,
        {
          target_step: targetStep,
          note,
        },
        { headers }
      );

      const returnedLoan = response.data?.loan as Partial<LoanRequest> | undefined;
      const successMessage =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Loan request sent back successfully.';

      if (returnedLoan && Number(returnedLoan.id || 0) > 0) {
        setRequests((prev) => prev.map((item) => (item.id === Number(returnedLoan.id || 0) ? { ...item, ...returnedLoan } : item)));
      }

      if (detailsViewer.open && detailsViewer.loan?.id === loanId) {
        setDetailsViewer((prev) => {
          if (!prev.loan) return prev;
          return {
            ...prev,
            loan: returnedLoan ? { ...prev.loan, ...returnedLoan } : prev.loan,
          };
        });
      }

      closeSendBackModal();
      openModal(successMessage, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to send back this loan request.';
      openModal(message, 'Error');
    } finally {
      setSendBackSubmittingId(null);
    }
  };
  const widgetPrefix = 'mf_loan_approvals_widget_';

  const fetchWidgetPreferences = async (authToken: string) => {
    try {
      const response = await axios.get(`${API_BASE}/dashboard/widgets`, {
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
    setWidgetNotice('');
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);
    const ok = await saveWidgetPreference(widgetKey, false);
    if (!ok) {
      setHiddenWidgetKeys(previous);
      setWidgetNotice('Failed to hide widget. Please try again.');
    }
  };

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }),
    [token]
  );

  const normalizeText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const isCollectionOfficer = useMemo(() => {
    const designationName = normalizeText(String(authUser?.designation?.name || ''));
    const roleNames = (authUser?.roles || []).map((role) => normalizeText(String(role?.name || '')));

    if (designationName.includes('collection officer')) {
      return true;
    }

    return roleNames.some((name) => name.includes('collection officer'));
  }, [authUser]);

  const officerNameCandidates = useMemo(() => {
    const employeeFullName = [authUser?.employee?.first_name || '', authUser?.employee?.last_name || '']
      .join(' ')
      .trim();

    return [
      String(authUser?.name || '').trim(),
      employeeFullName,
      String(authUser?.employee?.email || '').trim(),
      String(authUser?.email || '').trim(),
    ]
      .map((value) => normalizeText(value))
      .filter((value, index, arr) => value !== '' && arr.indexOf(value) === index);
  }, [authUser]);

  const preferredOfficerName = useMemo(() => {
    const rawCandidates = [
      String(authUser?.name || '').trim(),
      [authUser?.employee?.first_name || '', authUser?.employee?.last_name || ''].join(' ').trim(),
      String(authUser?.employee?.email || '').trim(),
      String(authUser?.email || '').trim(),
    ].filter((value, index, arr) => value !== '' && arr.indexOf(value) === index);

    return rawCandidates[0] || '';
  }, [authUser]);

  const canApproveOrReject = useMemo(() => {
    const normalize = (value: string) =>
      String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const allowedRoleKeywords = ['loan approver', 'finance manager', 'branch manager', 'admin'];

    const email = normalize(String(authUser?.email || ''));
    if (email === 'superadmin softcodelk com') {
      return true;
    }

    const roleNames = (authUser?.roles || []).map((role) => normalize(String(role?.name || '')));
    const designationName = normalize(String(authUser?.designation?.name || ''));

    const hasAllowedRole = roleNames.some((roleName) =>
      allowedRoleKeywords.some((keyword) => roleName.includes(keyword))
    );
    const hasAllowedDesignation = allowedRoleKeywords.some((keyword) => designationName.includes(keyword));

    return hasAllowedRole || hasAllowedDesignation;
  }, [authUser]);

  const canEditLoanDetails = useMemo(() => {
    const normalize = (value: string) =>
      String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const allowedRoleKeywords = ['finance manager', 'branch manager', 'admin'];

    const email = normalize(String(authUser?.email || ''));
    if (email === 'superadmin softcodelk com') {
      return true;
    }

    const roleNames = (authUser?.roles || []).map((role) => normalize(String(role?.name || '')));
    const designationName = normalize(String(authUser?.designation?.name || ''));

    const hasAllowedRole = roleNames.some((roleName) =>
      allowedRoleKeywords.some((keyword) => roleName.includes(keyword))
    );
    const hasAllowedDesignation = allowedRoleKeywords.some((keyword) => designationName.includes(keyword));

    return hasAllowedRole || hasAllowedDesignation;
  }, [authUser]);

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

  const loadRequests = async (authHeaders: { Authorization: string; Accept: string }) => {
    const response = await axios.get(`${API_BASE}/microfinance/loan-requests`, {
      headers: authHeaders,
      params: {
        status: 'requested,hold',
        ...(isCollectionOfficer && preferredOfficerName ? { field_officer: preferredOfficerName } : {}),
      },
    });
    const rows: LoanRequest[] = Array.isArray(response.data) ? response.data : [];
    setRequests(rows);
  };

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      setPageLoading(true);
      try {
        await loadRequests(headers);
      } catch {
        openModal('Failed to load requested loans.', 'Error');
      } finally {
        setPageLoading(false);
      }
    };

    run();
  }, [token, headers, isCollectionOfficer, preferredOfficerName]);

  const scopedRequests = useMemo(() => {
    if (!isCollectionOfficer) {
      return requests;
    }

    if (officerNameCandidates.length === 0) {
      return [];
    }

    return requests.filter((loan) => {
      const loanOfficerName = normalizeText(String(loan.field_officer || ''));
      if (!loanOfficerName) return false;
      return officerNameCandidates.includes(loanOfficerName);
    });
  }, [requests, isCollectionOfficer, officerNameCandidates]);

  useEffect(() => {
    setCurrentPage(1);
  }, [scopedRequests.length, pageSize, query, scopeFilter, routeFilter, fromDate, toDate]);

  const routeOptions = useMemo(() => {
    const routeMap = new Map<number, string>();

    scopedRequests.forEach((loan) => {
      if (loan.route?.id && loan.route?.name) {
        routeMap.set(loan.route.id, loan.route.name);
      }
    });

    return Array.from(routeMap.entries()).map(([id, name]) => ({ id, name }));
  }, [scopedRequests]);

  const filteredRequests = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const selectedRouteId = routeFilter === 'all' ? null : Number(routeFilter);

    return scopedRequests.filter((loan) => {
      if (scopeFilter !== 'all' && loan.loan_scope !== scopeFilter) return false;
      if (selectedRouteId && loan.route?.id !== selectedRouteId) return false;
      if (fromDate && loan.loan_request_date < fromDate) return false;
      if (toDate && loan.loan_request_date > toDate) return false;

      if (!keyword) return true;

      const haystack = [
        loan.customer_no,
        loan.customer_name,
        loan.route?.name || '',
        loan.center?.name || '',
        loan.group?.name || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [scopedRequests, query, scopeFilter, routeFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedRequests = filteredRequests.slice(startIndex, startIndex + pageSize);

  const getLoanSchedule = (loan: LoanRequest): LoanSchedule => ({
    ...buildDefaultLoanSchedule(loan),
    ...scheduleByLoanId[loan.id],
  });

  const handleApprovalDateChange = (loan: LoanRequest, approvalDate: string) => {
    const termCount = Math.max(Number(loan.terms_count || 1), 1);
    const nextPaymentDate = shiftDateFromBase(approvalDate, loan.refund_option, 1);

    setScheduleByLoanId((prev) => ({
      ...prev,
      [loan.id]: {
        approvalDate,
        nextPaymentDate,
        loanEndDate: shiftDateFromBase(nextPaymentDate, loan.refund_option, Math.max(termCount - 1, 0)),
      },
    }));
  };

  const handleLoanEndDateChange = (loan: LoanRequest, loanEndDate: string) => {
    setScheduleByLoanId((prev) => {
      const current = prev[loan.id] ?? buildDefaultLoanSchedule(loan);

      return {
        ...prev,
        [loan.id]: {
          ...current,
          loanEndDate,
        },
      };
    });
  };

  const handleAdvanceWorkflowStep = async (loan: LoanRequest): Promise<boolean> => {
    if (!token) return false;
    if (!canApproveOrReject) {
      openModal('Only Loan Approver, Finance Manager, Branch Manager, and Admin can move workflow steps.', 'Access Denied');
      return false;
    }

    const currentStep = resolveWorkflowStep(loan);
    if (currentStep >= WORKFLOW_STEP_LABELS.length) {
      openModal('Loan is already at final workflow step (Grant). Use Accept to finalize approval.', 'Workflow');
      return false;
    }

    setAdvancingId(loan.id);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loan.id}/advance-workflow-step`,
        {},
        { headers }
      );

      const updatedLoan = (response.data?.data || null) as LoanRequest | null;
      if (updatedLoan && Number(updatedLoan.id || 0) > 0) {
        setRequests((prev) => prev.map((item) => (item.id === updatedLoan.id ? { ...item, ...updatedLoan } : item)));

        if (detailsViewer.open && detailsViewer.loan?.id === updatedLoan.id) {
          setDetailsViewer((prev) => {
            if (!prev.loan) return prev;
            return { ...prev, loan: { ...prev.loan, ...updatedLoan } };
          });
        }
      }

      const message =
        typeof response.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Loan moved to next workflow step successfully.';

      openModal(message, 'Success');
      return true;
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to move loan to the next workflow step.';
      openModal(message, 'Error');
      return false;
    } finally {
      setAdvancingId(null);
    }
  };

  const handleApprove = async (loan: LoanRequest) => {
    if (!token) return;
    if (!canApproveOrReject) {
      openModal('Only Loan Approver, Finance Manager, Branch Manager, and Admin can accept loans.', 'Access Denied');
      return;
    }

    const schedule = getLoanSchedule(loan);

    setApprovingId(loan.id);
    try {
      await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loan.id}/approve`,
        {
          approval_date: schedule.approvalDate,
          next_payment_date: schedule.nextPaymentDate,
          loan_end_date: schedule.loanEndDate,
        },
        { headers }
      );
      setRequests((prev) => prev.filter((item) => item.id !== loan.id));
      setScheduleByLoanId((prev) => {
        const next = { ...prev };
        delete next[loan.id];
        return next;
      });
      openModal('Loan approved successfully.', 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to approve loan.';
      openModal(message, 'Error');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (loanId: number) => {
    if (!token) return;
    if (!canApproveOrReject) {
      openModal('Only Loan Approver, Finance Manager, Branch Manager, and Admin can reject loans.', 'Access Denied');
      return;
    }

    setRejectingId(loanId);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loanId}/reject`,
        {},
        { headers }
      );
      setRequests((prev) => prev.filter((loan) => loan.id !== loanId));
      const successMessage =
        typeof response?.data?.message === 'string' && response.data.message.trim() !== ''
          ? response.data.message
          : 'Loan rejected successfully.';
      openModal(successMessage, 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to reject loan.';
      openModal(message, 'Error');
    } finally {
      setRejectingId(null);
    }
  };

  const handleDocumentRequest = async (loanId: number) => {
    if (!token) return;

    setDocumentRequestingId(loanId);
    try {
      await axios.post(
        `${API_BASE}/microfinance/loan-requests/${loanId}/request-documents`,
        {},
        { headers }
      );

      setRequests((prev) =>
        prev.map((loan) =>
          loan.id === loanId
            ? {
                ...loan,
                documents_requested: true,
                document_requested_at: new Date().toISOString(),
              }
            : loan
        )
      );

      openModal('Document request marked for this loan.', 'Success');
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to request documents.';
      openModal(message, 'Error');
    } finally {
      setDocumentRequestingId(null);
    }
  };

  const handleDownloadAgreement = async (loanId: number, customerNo: string) => {
    if (!token) return;

    setDownloadingId(loanId);
    try {
      const response = await axios.get(
        `${API_BASE}/microfinance/loan-requests/${loanId}/download-agreement`,
        {
          headers,
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/pdf',
      });

      const contentDisposition = response.headers['content-disposition'] || '';
      const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const serverFileName = decodeURIComponent(fileNameMatch?.[1] || fileNameMatch?.[2] || '');

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = serverFileName || `loan_agreement_${customerNo || loanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      openModal('Agreement downloaded successfully.', 'Success');
    } catch (error: unknown) {
      let message = 'Failed to download agreement.';
      const responseData = axios.isAxiosError(error) ? error.response?.data : null;

      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          const parsed = JSON.parse(text);
          message = parsed?.message || message;
        } catch {
          // Keep default message.
        }
      } else if (responseData && typeof responseData === 'object' && 'message' in responseData) {
        message = responseData.message;
      }

      openModal(message, 'Error');
    } finally {
      setDownloadingId(null);
    }
  };

  const showHeaderWidget = !hiddenWidgetKeys.has(`${widgetPrefix}header`);
  const showFiltersWidget = !hiddenWidgetKeys.has(`${widgetPrefix}filters`);
  const showResultsMetaWidget = !hiddenWidgetKeys.has(`${widgetPrefix}results_meta`);
  const showPaginationWidget = !hiddenWidgetKeys.has(`${widgetPrefix}pagination`);
  const visiblePaginatedRequests = paginatedRequests.filter(
    (loan) => !hiddenWidgetKeys.has(`${widgetPrefix}loan_card_${loan.id}`)
  );

  if (!token || pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {widgetNotice && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {widgetNotice}
          </div>
        )}
        {showHeaderWidget && (
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg border border-white/20 p-6 flex items-center justify-between relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Loan Approvals</h1>
            <p className="text-sm text-gray-600 mt-1">
              Assistant Manager can approve amounts under 10000. Manager can approve amounts up to 10000.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Late payment penalty is calculated after a 2-day free grace period from the due date.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/microfinance/loans')}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
          >
            Back
          </button>
        </div>
        )}

        {showFiltersWidget && (
        <div className="bg-white/90 rounded-2xl shadow-lg border border-orange-100 p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 text-black relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide filter widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <input
            className="px-3 py-2 rounded-lg border border-orange-100 text-sm text-black"
            placeholder="Search customer / loan code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="px-3 py-2 rounded-lg border border-orange-100 text-sm text-black" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
            <option value="all">All Scopes</option>
            <option value="center_loan">Center Loan</option>
            <option value="route_loan">Route Loan</option>
            <option value="direct_loan">Direct Loan</option>
          </select>
          <select className="px-3 py-2 rounded-lg border border-orange-100 text-sm text-black" value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}>
            <option value="all">All Routes</option>
            {routeOptions.map((route) => (
              <option key={route.id} value={route.id}>{route.name}</option>
            ))}
          </select>
          <input className="px-3 py-2 rounded-lg border border-orange-100 text-sm text-black" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input className="px-3 py-2 rounded-lg border border-orange-100 text-sm text-black" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        )}

        {showResultsMetaWidget && (
        <div className="flex items-center justify-between gap-3 relative rounded-xl p-2">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}results_meta`)}
              className="absolute -right-1 -top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide result meta widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <p className="text-sm text-gray-600">
            Showing {filteredRequests.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredRequests.length)} of {filteredRequests.length}
          </p>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Rows:</label>
            <select
              className="px-2 py-1 rounded-md border border-orange-100 text-sm text-black"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        )}

        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center text-gray-600">
            No requested loans found for selected filters.
          </div>
        ) : visiblePaginatedRequests.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-lg p-8 text-center text-amber-800">
            All widgets on this page are hidden for the current results. Restore hidden widgets from dashboard to show them again.
          </div>
        ) : (
          <div className="space-y-4">
            {visiblePaginatedRequests.map((loan) => {
              const schedule = getLoanSchedule(loan);
              const customerPhotoUrl = resolveLoanCustomerPhotoUrl(loan);
              const documentCharges = Number(loan.document_charges || 0);
              const stampCharges = Number(loan.stamp_charges || 0);
              const insuranceCharges = Number(loan.insurance_charges || 0);
              const totalCollectedCharges = documentCharges + stampCharges + insuranceCharges;
              const chargePaymentMode = String(loan.charge_payment_mode || '-').replaceAll('_', ' ');
              const chargesCollectionStatus = String(loan.charges_collection_status || 'pending').replaceAll('_', ' ');
              const currentWorkflowStep = resolveWorkflowStep(loan);
              const currentWorkflowLabel = getWorkflowStepLabel(currentWorkflowStep);
              const isPendingCallConfirmationStep = currentWorkflowStep === 2;
              const isBmApprovalStep = currentWorkflowStep === 3;
              const isHeadOfficeApprovalStep = currentWorkflowStep === 4;
              const isCashAllocationStep = currentWorkflowStep === 5;
              const isCashRequestStep = currentWorkflowStep === 6;
              const isCashWithdrawalStep = currentWorkflowStep === 7;
              const isSecondCallConfirmationStep = currentWorkflowStep === 8;
              const isLoanSignatureCheckStep = currentWorkflowStep === 9;
              const isDocumentFailingStep = currentWorkflowStep === 10;
              const isFinalWorkflowStep = currentWorkflowStep >= WORKFLOW_STEP_LABELS.length;
              const nextWorkflowStep = isFinalWorkflowStep ? WORKFLOW_STEP_LABELS.length : currentWorkflowStep + 1;
              const nextWorkflowLabel = getWorkflowStepLabel(nextWorkflowStep);

              return (
              <div key={loan.id} className="bg-white/90 rounded-2xl shadow-lg border border-orange-100 p-5 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}loan_card_${loan.id}`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide loan widget ${loan.customer_no}`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <button
                      type="button"
                      onClick={() => openPhotoViewer(loan)}
                      className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-orange-200 bg-orange-50 shadow-sm transition hover:border-orange-400 hover:shadow-md"
                      title={customerPhotoUrl ? 'View customer photo' : 'No customer photo uploaded'}
                    >
                      {customerPhotoUrl ? (
                        <img
                          src={customerPhotoUrl}
                          alt={`${loan.customer_name} photo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center px-2 text-center text-[11px] font-semibold text-orange-700">
                          <span>No Photo</span>
                        </div>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-slate-900/65 px-1 py-1 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                        View
                      </span>
                    </button>

                    <div className="space-y-1 min-w-0">
                    <h2 className="text-lg font-bold text-gray-900">{loan.customer_name}</h2>
                    <p className="text-sm text-gray-600">Reference No: {loan.reference_no || loan.loan_code || '-'}</p>
                    {loan.documents_requested && (
                      <p className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        Documents Requested
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      Scope: {loan.loan_scope === 'center_loan' ? 'Center Loan' : loan.loan_scope === 'route_loan' ? 'Route Loan' : 'Direct Loan'}
                    </p>
                    <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
                      <span>Step {currentWorkflowStep}: {currentWorkflowLabel}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Route: {loan.route?.name || '-'} | Center: {loan.center?.name || '-'} | Group: {loan.group?.name || '-'}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openPhotoViewer(loan)}
                        className="inline-flex items-center rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                      >
                        {customerPhotoUrl ? 'View Customer Photo' : 'Customer Photo Not Available'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openDetailsViewer(loan)}
                        className="inline-flex items-center rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
                      >
                        View More Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canEditLoanDetails) {
                            openModal('Only Finance Manager, Branch Manager, and Admin can edit loan details.', 'Permission');
                            return;
                          }
                          openEditLoanModal(loan);
                        }}
                        className="hidden"
                      >
                        Edit Loan Details
                      </button>
                    </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-600">Loan Amount</p>
                    <p className="text-xl font-extrabold text-orange-700">{Number(loan.loan_amount || 0).toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {loan.interest_type} | {Number(loan.interest_rate || 0)}% | {loan.terms_count} {formatLoanType(loan.refund_option)}(s)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                  <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Refundable</p>
                    <p className="text-sm font-bold text-gray-900">{Number(loan.refundable_amount || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Installment</p>
                    <p className="text-sm font-bold text-gray-900">{Number(loan.installment_amount || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Request Date</p>
                    <p className="text-sm font-bold text-gray-900">{loan.loan_request_date}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Charge Payment Mode</p>
                    <p className="text-sm font-bold text-gray-900 capitalize">{chargePaymentMode}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Collection Status</p>
                    <p className="text-sm font-bold text-gray-900 capitalize">{chargesCollectionStatus}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Document Charges</p>
                    <p className="text-sm font-bold text-gray-900">{documentCharges.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Stamp Charges</p>
                    <p className="text-sm font-bold text-gray-900">{stampCharges.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Insurance Charges</p>
                    <p className="text-sm font-bold text-gray-900">{insuranceCharges.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Collected Payment Total</p>
                    <p className="text-sm font-bold text-gray-900">{totalCollectedCharges.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-600 mt-1">Net Disbursed: {Number(loan.net_disbursed_amount || 0).toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Branch</p>
                    <p className="text-sm font-bold text-gray-900">{loan.branch?.name || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Manager</p>
                    <p className="text-sm font-bold text-gray-900">{loan.manager_name || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Collection Officer</p>
                    <p className="text-sm font-bold text-gray-900">{loan.field_officer || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Request Approval To</p>
                    <p className="text-sm font-bold text-gray-900">{getApprovalEmployeeName(loan)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Responsible Roles</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {getResponsibleRoles(Number(loan.loan_amount || 0)).map((role) => (
                        <span
                          key={`${loan.id}-${role}`}
                          className="inline-flex rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wide text-gray-600 mb-1">Approval Date</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Schedule will be generated from this approval date.
                    </p>
                    <input
                      type="date"
                      className="w-full px-3 py-2 rounded-lg border border-orange-100 text-sm text-black bg-white"
                      value={schedule.approvalDate}
                      onChange={(e) => handleApprovalDateChange(loan, e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wide text-gray-600 mb-1">Auto Next Payment Date</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Loan Type: {formatLoanType(loan.refund_option)}. Calculated from this type and center meeting day.
                    </p>
                    <div className="w-full px-3 py-2 rounded-lg border border-orange-100 text-sm text-black bg-slate-50 font-semibold">
                      {schedule.nextPaymentDate}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs uppercase tracking-wide text-gray-600 mb-1">Auto Loan End Date</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Default is calculated from approval date + terms. You can change it before accepting.
                    </p>
                    <input
                      type="date"
                      className="w-full px-3 py-2 rounded-lg border border-orange-100 text-sm text-black bg-white font-semibold"
                      value={schedule.loanEndDate}
                      min={schedule.approvalDate}
                      onChange={(e) => handleLoanEndDateChange(loan, e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDownloadAgreement(loan.id, loan.customer_no);
                      }}
                      disabled={downloadingId === loan.id}
                      className="hidden"
                    >
                      {downloadingId === loan.id ? 'Processing...' : 'Download Agreement'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canEditLoanDetails) {
                          openModal('Only Finance Manager, Branch Manager, and Admin can edit loan details.', 'Permission');
                          return;
                        }
                        openEditLoanModal(loan);
                      }}
                      className="hidden"
                    >
                      Edit Loan Details
                    </button>
                    {canApproveOrReject && (
                      <>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void openRequestApprovalModal(loan);
                          }}
                          disabled={approvalRequestingId === loan.id}
                          className="hidden"
                        >
                          {approvalRequestingId === loan.id ? 'Processing...' : 'Request Approval'}
                        </button>
                        <button
                          onClick={(e) => {
                            handleSendBackButtonClick(loan, e);
                          }}
                          disabled={sendBackSubmittingId === loan.id}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow disabled:opacity-70"
                        >
                          {sendBackSubmittingId === loan.id ? 'Sending...' : 'Send Back'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleReject(loan.id);
                          }}
                          disabled={rejectingId === loan.id}
                          className="hidden"
                        >
                          {rejectingId === loan.id ? 'Processing...' : 'Reject'}
                        </button>
                        {isPendingCallConfirmationStep && !isFinalWorkflowStep ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openMarkCalledModal(loan);
                            }}
                            disabled={markCalledSubmittingId === loan.id || approvingId === loan.id}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow disabled:opacity-70"
                          >
                            {(markCalledSubmittingId === loan.id || approvingId === loan.id) && (
                              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                            )}
                            {markCalledSubmittingId === loan.id ? 'Saving...' : 'Mark as Called'}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!isFinalWorkflowStep) {
                                if (isBmApprovalStep) {
                                  void openBmApprovalModal(loan);
                                  return;
                                }
                                if (isHeadOfficeApprovalStep) {
                                  void openHoApprovalModal(loan);
                                  return;
                                }
                                if (isCashAllocationStep) {
                                  openCashAllocationModal(loan);
                                  return;
                                }
                                if (isCashRequestStep) {
                                  openCashRequestModal(loan);
                                  return;
                                }
                                if (isCashWithdrawalStep) {
                                  openCashWithdrawalModal(loan);
                                  return;
                                }
                                if (isSecondCallConfirmationStep) {
                                  openSecondCallConfirmationModal(loan);
                                  return;
                                }
                                if (isLoanSignatureCheckStep) {
                                  openLoanSignatureCheckModal(loan);
                                  return;
                                }
                                if (isDocumentFailingStep) {
                                  void openDocumentVerificationModal(loan);
                                  return;
                                }
                                handleAdvanceWorkflowStep(loan);
                                return;
                              }

                              handleApprove(loan);
                            }}
                            disabled={approvingId === loan.id || advancingId === loan.id}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold shadow disabled:opacity-70"
                          >
                            {(approvingId === loan.id || advancingId === loan.id) && (
                              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                            )}
                            {advancingId === loan.id
                              ? 'Moving...'
                              : approvingId === loan.id
                                ? 'Accepting...'
                                : isFinalWorkflowStep
                                  ? 'Accept (Grant)'
                                  : isBmApprovalStep
                                    ? 'BM Approve & Move to Step 4'
                                  : isHeadOfficeApprovalStep
                                    ? 'Head Office Approve and Move to Next Step Cash Allocation'
                                  : isCashAllocationStep
                                    ? 'Cash Allocate and Move to Next Step'
                                  : isCashRequestStep
                                    ? 'Cash Request and Move to Step 7'
                                  : isCashWithdrawalStep
                                    ? 'Cash Withdraw and Move to Next Step'
                                  : isSecondCallConfirmationStep
                                    ? 'Call Confirm and Move to Step 9 Loan Signature Check'
                                  : isLoanSignatureCheckStep
                                    ? 'Confirm Signature and Move to Step 10'
                                  : isDocumentFailingStep
                                    ? 'Verify Documents and Move to Step 11'
                                  : `Move to Step ${nextWorkflowStep}: ${nextWorkflowLabel}`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
            })}

            {showPaginationWidget && (
            <div className="flex items-center justify-center gap-2 pt-2 relative">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}pagination`)}
                  className="absolute -right-1 -top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide pagination widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg border border-orange-100 bg-white text-sm text-gray-700 disabled:opacity-50"
              >
                Prev
              </button>

              <span className="px-3 py-1.5 rounded-lg bg-white border border-orange-100 text-sm text-gray-700">
                Page {safePage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-orange-100 bg-white text-sm text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            )}
          </div>
        )}
      </div>

      {photoViewer.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/75 px-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl border border-orange-100">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Customer Photo</h3>
                <p className="text-sm text-slate-600">{photoViewer.title}</p>
              </div>
              <button
                type="button"
                onClick={closePhotoViewer}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <div className="rounded-xl border border-orange-100 bg-slate-50 p-3 flex items-center justify-center min-h-[280px]">
              <img
                src={photoViewer.imageUrl}
                alt={photoViewer.title}
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {bmApprovalModal.open && bmApprovalModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-3 py-6">
          <div className="w-full max-w-[96vw] rounded-2xl bg-white p-5 shadow-2xl border border-amber-100 max-h-[95vh] overflow-auto">
            {(() => {
              const loan = bmApprovalModal.loan;
              const customerPhotoUrl = resolveLoanCustomerPhotoUrl(loan);
              const customerSignatureUrl = resolveLoanCustomerSignatureUrl(loan);
              const spouseName = readEvaluationValue(loan, ['spouse_name', 'spouse_full_name', 'husband_name', 'wife_name']);
              const spouseNic = readEvaluationValue(loan, ['spouse_nic', 'spouse_nic_no', 'spouse_id_no']);
              const spouseDob = readEvaluationValue(loan, ['spouse_date_of_birth', 'spouse_dob']);
              const spouseContact = readEvaluationValue(loan, ['spouse_contact_no', 'spouse_contact', 'spouse_phone', 'spouse_mobile', 'spouse_telephone']);
              const spouseAddress = readEvaluationValue(loan, ['spouse_address']);
              const spouseOccupation = readEvaluationValue(loan, ['spouse_occupation', 'spouse_job']);
              const bmPayload = (loan.bm_approval_payload || {}) as Record<string, unknown>;
              const callPayload = (loan.call_confirmation_payload || {}) as Record<string, unknown>;
              const payloadValue = (key: string) => {
                const value = callPayload[key];
                if (value === null || value === undefined || value === '') return '-';
                if (typeof value === 'boolean') return value ? 'Yes' : 'No';
                return String(value);
              };

              return (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900">Branch Manager Approval Review</h3>
                      <p className="text-sm text-slate-600">
                        {loan.customer_name} ({loan.customer_no}) - Step 3 Approval Before Head Office
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={closeBmApprovalModal}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        disabled={advancingId === loan.id}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitBmApprovalAndMoveNext()}
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                        disabled={advancingId === loan.id || String(bmApprovalModal.form.bm_comments || '').trim() === ''}
                      >
                        {advancingId === loan.id && (
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                        )}
                        {advancingId === loan.id ? 'Approving...' : 'Approve as BM & Move to Head Office'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 text-sm">
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Customer Profile</p>
                      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="rounded-lg border border-cyan-100 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Photo</p>
                          <div className="mt-2 flex h-44 items-center justify-center rounded-lg border border-dashed border-cyan-200 bg-slate-50">
                            {customerPhotoUrl ? (
                              <img src={customerPhotoUrl} alt="Customer Photo" className="h-full w-full rounded-lg object-cover" />
                            ) : (
                              <span className="text-xs text-slate-500">No photo available</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-100 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Signature</p>
                          <div className="mt-2 flex h-44 items-center justify-center rounded-lg border border-dashed border-cyan-200 bg-slate-50">
                            {customerSignatureUrl ? (
                              <img src={customerSignatureUrl} alt="Customer Signature" className="h-full w-full rounded-lg object-contain" />
                            ) : (
                              <span className="text-xs text-slate-500">No signature available</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-100 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Details</p>
                          <div className="mt-2 space-y-1.5 text-slate-700">
                            <p><span className="font-semibold text-slate-900">Name:</span> {loan.customer_name || '-'}</p>
                            <p><span className="font-semibold text-slate-900">Customer No:</span> {loan.customer_no || '-'}</p>
                            <p><span className="font-semibold text-slate-900">NIC:</span> {loan.nic || '-'}</p>
                            <p><span className="font-semibold text-slate-900">Contact:</span> {loan.contact_no || '-'}</p>
                            <p><span className="font-semibold text-slate-900">Address:</span> {loan.address || '-'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Customer Full Details & Spouse Details</p>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Customer Name</p><p className="font-bold text-slate-900">{loan.customer_name || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Customer No</p><p className="font-bold text-slate-900">{loan.customer_no || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">NIC</p><p className="font-bold text-slate-900">{loan.nic || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Contact</p><p className="font-bold text-slate-900">{loan.contact_no || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Branch</p><p className="font-bold text-slate-900">{loan.branch?.name || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Route</p><p className="font-bold text-slate-900">{loan.route?.name || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Center</p><p className="font-bold text-slate-900">{loan.center?.name || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Group</p><p className="font-bold text-slate-900">{loan.group?.name || '-'}</p></div>
                        <div className="md:col-span-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">Address</p><p className="font-bold text-slate-900">{loan.address || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Bank Name</p><p className="font-bold text-slate-900">{loan.bank_name || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Bank Branch</p><p className="font-bold text-slate-900">{loan.bank_branch || '-'}</p></div>
                        <div className="md:col-span-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">Bank Account No</p><p className="font-bold text-slate-900">{loan.bank_account_no || '-'}</p></div>
                      </div>

                      <div className="mt-4 rounded-lg border border-sky-100 bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Spouse Details</p>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Name</p><p className="font-bold text-slate-900">{spouseName || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse NIC</p><p className="font-bold text-slate-900">{spouseNic || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Date of Birth</p><p className="font-bold text-slate-900">{spouseDob || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Contact No</p><p className="font-bold text-slate-900">{spouseContact || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Occupation</p><p className="font-bold text-slate-900">{spouseOccupation || '-'}</p></div>
                          <div className="md:col-span-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Address</p><p className="font-bold text-slate-900">{spouseAddress || '-'}</p></div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Loan Details</p>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Reference</p><p className="font-bold text-slate-900">{loan.reference_no || loan.loan_code || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Loan Amount</p><p className="font-bold text-slate-900">{Number(loan.loan_amount || 0).toFixed(2)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Refundable</p><p className="font-bold text-slate-900">{Number(loan.refundable_amount || 0).toFixed(2)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Installment</p><p className="font-bold text-slate-900">{Number(loan.installment_amount || 0).toFixed(2)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Interest</p><p className="font-bold text-slate-900">{loan.interest_type} / {Number(loan.interest_rate || 0)}%</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Terms</p><p className="font-bold text-slate-900">{loan.terms_count} {formatLoanType(loan.refund_option)}(s)</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Request Date</p><p className="font-bold text-slate-900">{loan.loan_request_date || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Workflow Step</p><p className="font-bold text-slate-900">Step {resolveWorkflowStep(loan)} - {getWorkflowStepLabel(resolveWorkflowStep(loan))}</p></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-700">Guarantor Details</p>
                      {(loan.guarantors || []).length === 0 ? (
                        <p className="mt-2 text-slate-600">No guarantors available.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {(loan.guarantors || []).map((guarantor) => (
                            <div key={guarantor.id} className="rounded-lg border border-fuchsia-100 bg-white p-3">
                              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Name</p><p className="font-bold text-slate-900">{guarantor.name || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">NIC</p><p className="font-bold text-slate-900">{guarantor.nic || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Contact</p><p className="font-bold text-slate-900">{guarantor.contact_no || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Relationship</p><p className="font-bold text-slate-900">{guarantor.relationship || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Address</p><p className="font-bold text-slate-900">{guarantor.address || '-'}</p></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Documents for Branch Manager Review</p>
                      {detailsLoading ? (
                        <p className="mt-2 text-slate-600">Loading documents...</p>
                      ) : (
                        (() => {
                          const loanDocuments = loan.documents || [];
                          const customerDocuments = customerDocumentsByLoanId[loan.id] || [];
                          const guarantorDocuments = (loan.guarantors || []).flatMap((guarantor) => {
                            const docs: Array<{
                              id: string;
                              title: string;
                              fileName: string;
                              url: string;
                            }> = [];

                            if (guarantor.image_url) {
                              docs.push({
                                id: `guarantor-image-${guarantor.id}`,
                                title: `${guarantor.name || 'Guarantor'} - Image`,
                                fileName: guarantor.image_original_name || 'Guarantor Image',
                                url: resolveStorageAssetUrl(String(guarantor.image_url || '')),
                              });
                            }

                            if (guarantor.signature_url) {
                              docs.push({
                                id: `guarantor-signature-${guarantor.id}`,
                                title: `${guarantor.name || 'Guarantor'} - Signature`,
                                fileName: guarantor.signature_original_name || 'Guarantor Signature',
                                url: resolveStorageAssetUrl(String(guarantor.signature_url || '')),
                              });
                            }

                            return docs;
                          });

                          const hasNoDocuments = loanDocuments.length === 0 && customerDocuments.length === 0 && guarantorDocuments.length === 0;

                          if (hasNoDocuments) {
                            return <p className="mt-2 text-slate-600">No documents available.</p>;
                          }

                          return (
                            <div className="mt-3 space-y-3">
                              {customerDocuments.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cyan-700">Customer Registered Documents</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {customerDocuments.map((document) => (
                                      <div key={`bm-customer-doc-${document.id}`} className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-900 truncate">{document.document_type || 'Document'}</p>
                                          <p className="text-[11px] text-slate-600 truncate">{document.original_name || document.file_path || '-'}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void openCustomerDocumentViewer(loan, document)}
                                          className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
                                        >
                                          Preview
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {loanDocuments.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">Loan Request Documents</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {loanDocuments.map((document) => (
                                      <div key={`bm-loan-doc-${document.id}`} className="rounded-lg border border-blue-100 bg-white p-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-900 truncate">{document.document_type || 'Document'}</p>
                                          <p className="text-[11px] text-slate-600 truncate">{document.original_name || document.file_path || '-'}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void openDocumentViewer(document.original_name || document.document_type || 'Document', resolveDocumentUrl(document))}
                                          className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                        >
                                          Preview
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {guarantorDocuments.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fuchsia-700">Guarantor Documents</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {guarantorDocuments.map((document) => (
                                      <div key={document.id} className="rounded-lg border border-fuchsia-100 bg-white p-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-900 truncate">{document.title}</p>
                                          <p className="text-[11px] text-slate-600 truncate">{document.fileName}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void openDocumentViewer(document.fileName, document.url)}
                                          className="rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-50"
                                        >
                                          Preview
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Call Confirmation Details</p>
                      {Object.keys(callPayload).length === 0 ? (
                        <p className="mt-2 text-slate-600">No call confirmation data available.</p>
                      ) : (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">No of Times Called</p><p className="font-bold text-slate-900">{payloadValue('no_of_times_called')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Answered By Customer</p><p className="font-bold text-slate-900">{payloadValue('answered_by_customer')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Answered By Spouse</p><p className="font-bold text-slate-900">{payloadValue('answered_by_spouse')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Called Date</p><p className="font-bold text-slate-900">{payloadValue('called_date')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Customer Contact</p><p className="font-bold text-slate-900">{payloadValue('customer_contact_no')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Contact</p><p className="font-bold text-slate-900">{payloadValue('spouse_contact_no')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Customer Full Name</p><p className="font-bold text-slate-900">{payloadValue('customer_full_name')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">NIC / DOB</p><p className="font-bold text-slate-900">{payloadValue('nic_or_dob')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Given Date</p><p className="font-bold text-slate-900">{payloadValue('given_date')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Business Type</p><p className="font-bold text-slate-900">{payloadValue('business_type')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Repayment Card Given</p><p className="font-bold text-slate-900">{payloadValue('repayment_card_given')}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Disbursement OTP</p><p className="font-bold text-slate-900">{payloadValue('disbursement_otp')}</p></div>
                          <div className="md:col-span-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">Business Details</p><p className="font-bold text-slate-900">{payloadValue('business_details')}</p></div>
                          <div className="md:col-span-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">Special Notes</p><p className="font-bold text-slate-900">{payloadValue('special_notes')}</p></div>
                        </div>
                      )}
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
                            value={bmApprovalModal.form.bm_comments}
                            onChange={(e) =>
                              setBmApprovalModal((prev) => ({
                                ...prev,
                                form: {
                                  ...prev.form,
                                  bm_comments: e.target.value,
                                },
                              }))
                            }
                            disabled={advancingId === loan.id}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Additional Notes</label>
                          <textarea
                            rows={3}
                            className="mt-1 w-full rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm text-black"
                            placeholder="Optional additional notes for Head Office."
                            value={bmApprovalModal.form.bm_additional_notes}
                            onChange={(e) =>
                              setBmApprovalModal((prev) => ({
                                ...prev,
                                form: {
                                  ...prev.form,
                                  bm_additional_notes: e.target.value,
                                },
                              }))
                            }
                            disabled={advancingId === loan.id}
                          />
                        </div>
                        {Object.keys(bmPayload).length > 0 && (
                          <p className="text-xs text-slate-600">
                            Existing saved BM approval detected. Submitting again will update BM approval comments.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {hoApprovalModal.open && hoApprovalModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-3 py-6">
          <div className="w-full max-w-[96vw] rounded-2xl bg-white p-5 shadow-2xl border border-indigo-100 max-h-[95vh] overflow-auto">
            {(() => {
              const loan = hoApprovalModal.loan;
              const customerPhotoUrl = resolveLoanCustomerPhotoUrl(loan);
              const customerSignatureUrl = resolveLoanCustomerSignatureUrl(loan);
              const spouseName = readEvaluationValue(loan, ['spouse_name', 'spouse_full_name', 'husband_name', 'wife_name']);
              const spouseNic = readEvaluationValue(loan, ['spouse_nic', 'spouse_nic_no', 'spouse_id_no']);
              const spouseDob = readEvaluationValue(loan, ['spouse_date_of_birth', 'spouse_dob']);
              const spouseContact = readEvaluationValue(loan, ['spouse_contact_no', 'spouse_contact', 'spouse_phone', 'spouse_mobile', 'spouse_telephone']);
              const spouseAddress = readEvaluationValue(loan, ['spouse_address']);
              const spouseOccupation = readEvaluationValue(loan, ['spouse_occupation', 'spouse_job']);
              const bmPayload = (loan.bm_approval_payload || {}) as Record<string, unknown>;
              const bmValue = (key: string) => {
                const value = bmPayload[key];
                if (value === null || value === undefined || value === '') return '-';
                return String(value);
              };

              return (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900">Head Office Approval Review</h3>
                      <p className="text-sm text-slate-600">
                        {loan.customer_name} ({loan.customer_no}) - Step 4 Head Office Approval
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={closeHoApprovalModal}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        disabled={advancingId === loan.id}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitHeadOfficeApprovalAndMoveNext()}
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                        disabled={advancingId === loan.id}
                      >
                        {advancingId === loan.id && (
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                        )}
                        {advancingId === loan.id ? 'Approving...' : 'Head Office Approve and Move to Cash Allocation'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 text-sm">
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Customer Details</p>
                      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="rounded-lg border border-cyan-100 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Photo</p>
                          <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-dashed border-cyan-200 bg-slate-50">
                            {customerPhotoUrl ? (
                              <img src={customerPhotoUrl} alt="Customer Photo" className="h-full w-full rounded-lg object-cover" />
                            ) : (
                              <span className="text-xs text-slate-500">No photo available</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-100 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Signature</p>
                          <div className="mt-2 flex h-40 items-center justify-center rounded-lg border border-dashed border-cyan-200 bg-slate-50">
                            {customerSignatureUrl ? (
                              <img src={customerSignatureUrl} alt="Customer Signature" className="h-full w-full rounded-lg object-contain" />
                            ) : (
                              <span className="text-xs text-slate-500">No signature available</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-100 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile Snapshot</p>
                          <div className="mt-2 space-y-1.5 text-slate-700">
                            <p><span className="font-semibold text-slate-900">Name:</span> {loan.customer_name || '-'}</p>
                            <p><span className="font-semibold text-slate-900">Customer No:</span> {loan.customer_no || '-'}</p>
                            <p><span className="font-semibold text-slate-900">NIC:</span> {loan.nic || '-'}</p>
                            <p><span className="font-semibold text-slate-900">Contact:</span> {loan.contact_no || '-'}</p>
                            <p><span className="font-semibold text-slate-900">Address:</span> {loan.address || '-'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Loan Details</p>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Reference</p><p className="font-bold text-slate-900">{loan.reference_no || loan.loan_code || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Loan Amount</p><p className="font-bold text-slate-900">{Number(loan.loan_amount || 0).toFixed(2)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Refundable</p><p className="font-bold text-slate-900">{Number(loan.refundable_amount || 0).toFixed(2)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Installment</p><p className="font-bold text-slate-900">{Number(loan.installment_amount || 0).toFixed(2)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Interest</p><p className="font-bold text-slate-900">{loan.interest_type} / {Number(loan.interest_rate || 0)}%</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Terms</p><p className="font-bold text-slate-900">{loan.terms_count} {formatLoanType(loan.refund_option)}(s)</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Request Date</p><p className="font-bold text-slate-900">{loan.loan_request_date || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Next Step</p><p className="font-bold text-slate-900">Step 5 - Cash Allocation</p></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Spouse Details</p>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Name</p><p className="font-bold text-slate-900">{spouseName || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse NIC</p><p className="font-bold text-slate-900">{spouseNic || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Date of Birth</p><p className="font-bold text-slate-900">{spouseDob || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Contact No</p><p className="font-bold text-slate-900">{spouseContact || '-'}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Occupation</p><p className="font-bold text-slate-900">{spouseOccupation || '-'}</p></div>
                        <div className="md:col-span-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Spouse Address</p><p className="font-bold text-slate-900">{spouseAddress || '-'}</p></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-700">Guarantor Details</p>
                      {(loan.guarantors || []).length === 0 ? (
                        <p className="mt-2 text-slate-600">No guarantors available.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {(loan.guarantors || []).map((guarantor) => (
                            <div key={`ho-guarantor-${guarantor.id}`} className="rounded-lg border border-fuchsia-100 bg-white p-3">
                              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Name</p><p className="font-bold text-slate-900">{guarantor.name || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">NIC</p><p className="font-bold text-slate-900">{guarantor.nic || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Contact</p><p className="font-bold text-slate-900">{guarantor.contact_no || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Relationship</p><p className="font-bold text-slate-900">{guarantor.relationship || '-'}</p></div>
                                <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Address</p><p className="font-bold text-slate-900">{guarantor.address || '-'}</p></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Branch Manager Approval Details</p>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Approved By</p><p className="font-bold text-slate-900">{bmValue('approved_by_name')}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Approved At</p><p className="font-bold text-slate-900">{bmValue('approved_at')}</p></div>
                        <div className="md:col-span-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">BM Comments</p><p className="font-bold text-slate-900">{bmValue('bm_comments')}</p></div>
                        <div className="md:col-span-4"><p className="text-[11px] uppercase tracking-wide text-slate-500">Additional Notes</p><p className="font-bold text-slate-900">{bmValue('bm_additional_notes')}</p></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Documents for Head Office Review</p>
                      {detailsLoading ? (
                        <p className="mt-2 text-slate-600">Loading documents...</p>
                      ) : (
                        (() => {
                          const loanDocuments = loan.documents || [];
                          const customerDocuments = customerDocumentsByLoanId[loan.id] || [];
                          const guarantorDocuments = (loan.guarantors || []).flatMap((guarantor) => {
                            const docs: Array<{
                              id: string;
                              title: string;
                              fileName: string;
                              url: string;
                            }> = [];

                            if (guarantor.image_url) {
                              docs.push({
                                id: `ho-guarantor-image-${guarantor.id}`,
                                title: `${guarantor.name || 'Guarantor'} - Image`,
                                fileName: guarantor.image_original_name || 'Guarantor Image',
                                url: resolveStorageAssetUrl(String(guarantor.image_url || '')),
                              });
                            }

                            if (guarantor.signature_url) {
                              docs.push({
                                id: `ho-guarantor-signature-${guarantor.id}`,
                                title: `${guarantor.name || 'Guarantor'} - Signature`,
                                fileName: guarantor.signature_original_name || 'Guarantor Signature',
                                url: resolveStorageAssetUrl(String(guarantor.signature_url || '')),
                              });
                            }

                            return docs;
                          });

                          const hasNoDocuments = loanDocuments.length === 0 && customerDocuments.length === 0 && guarantorDocuments.length === 0;

                          if (hasNoDocuments) {
                            return <p className="mt-2 text-slate-600">No documents available.</p>;
                          }

                          return (
                            <div className="mt-3 space-y-3">
                              {customerDocuments.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cyan-700">Customer Registered Documents</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {customerDocuments.map((document) => (
                                      <div key={`ho-customer-doc-${document.id}`} className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-900 truncate">{document.document_type || 'Document'}</p>
                                          <p className="text-[11px] text-slate-600 truncate">{document.original_name || document.file_path || '-'}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void openCustomerDocumentViewer(loan, document)}
                                          className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
                                        >
                                          Preview
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {loanDocuments.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">Loan Request Documents</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {loanDocuments.map((document) => (
                                      <div key={`ho-loan-doc-${document.id}`} className="rounded-lg border border-blue-100 bg-white p-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-900 truncate">{document.document_type || 'Document'}</p>
                                          <p className="text-[11px] text-slate-600 truncate">{document.original_name || document.file_path || '-'}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void openDocumentViewer(document.original_name || document.document_type || 'Document', resolveDocumentUrl(document))}
                                          className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                        >
                                          Preview
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {guarantorDocuments.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fuchsia-700">Guarantor Documents</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {guarantorDocuments.map((document) => (
                                      <div key={document.id} className="rounded-lg border border-fuchsia-100 bg-white p-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-slate-900 truncate">{document.title}</p>
                                          <p className="text-[11px] text-slate-600 truncate">{document.fileName}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void openDocumentViewer(document.fileName, document.url)}
                                          className="rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-50"
                                        >
                                          Preview
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {cashAllocationModal.open && cashAllocationModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl border border-cyan-100 max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-3 text-white">
              <h3 className="text-lg font-bold">HO Cash Allocations</h3>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">Account Journal Entry</p>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Branch</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-black"
                    value={cashAllocationModal.form.branch_name}
                    onChange={(e) =>
                      setCashAllocationModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, branch_name: e.target.value },
                      }))
                    }
                    disabled={cashAllocatingId === cashAllocationModal.loan.id}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Today Cash Requirement</label>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white">
                    <span className="px-3 text-slate-500">Rs</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-r-lg px-3 py-2 text-black"
                      value={cashAllocationModal.form.today_cash_requirement}
                      onChange={(e) =>
                        setCashAllocationModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, today_cash_requirement: e.target.value },
                        }))
                      }
                      disabled={cashAllocatingId === cashAllocationModal.loan.id}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Tomorrow Cash Requirement</label>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white">
                    <span className="px-3 text-slate-500">Rs</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-r-lg px-3 py-2 text-black"
                      value={cashAllocationModal.form.tomorrow_cash_requirement}
                      onChange={(e) =>
                        setCashAllocationModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, tomorrow_cash_requirement: e.target.value },
                        }))
                      }
                      disabled={cashAllocatingId === cashAllocationModal.loan.id}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Today Allocation Amount</label>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white">
                    <span className="px-3 text-slate-500">Rs</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-r-lg px-3 py-2 text-black"
                      value={cashAllocationModal.form.today_allocation_amount}
                      onChange={(e) =>
                        setCashAllocationModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, today_allocation_amount: e.target.value },
                        }))
                      }
                      disabled={cashAllocatingId === cashAllocationModal.loan.id}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Tomorrow Allocation Amount</label>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white">
                    <span className="px-3 text-slate-500">Rs</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-r-lg px-3 py-2 text-black"
                      value={cashAllocationModal.form.tomorrow_allocation_amount}
                      onChange={(e) =>
                        setCashAllocationModal((prev) => ({
                          ...prev,
                          form: { ...prev.form, tomorrow_allocation_amount: e.target.value },
                        }))
                      }
                      disabled={cashAllocatingId === cashAllocationModal.loan.id}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={submitCashAllocationAndMoveNext}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={cashAllocatingId === cashAllocationModal.loan.id}
                >
                  {cashAllocatingId === cashAllocationModal.loan.id ? 'Allocating...' : 'Allocate Cash'}
                </button>
                <button
                  type="button"
                  onClick={closeCashAllocationModal}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={cashAllocatingId === cashAllocationModal.loan.id}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cashRequestModal.open && cashRequestModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl border border-amber-100">
            <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white">
              <h3 className="text-lg font-bold">Cash Request</h3>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
              <p className="text-sm text-slate-700">
                Click Request to submit this loan for cash request processing and move workflow to Step 7.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="font-semibold text-slate-900">{cashRequestModal.loan.customer_name || '-'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Loan Amount</p>
                  <p className="font-semibold text-slate-900">
                    LKR {Number(cashRequestModal.loan.loan_amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void submitCashRequestAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={advancingId === cashRequestModal.loan.id}
                >
                  {advancingId === cashRequestModal.loan.id ? 'Requesting...' : 'Request'}
                </button>
                <button
                  type="button"
                  onClick={closeCashRequestModal}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={advancingId === cashRequestModal.loan.id}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cashWithdrawalModal.open && cashWithdrawalModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl border border-emerald-100">
            <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white">
              <h3 className="text-lg font-bold">Cash Withdrawal</h3>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
              <p className="text-sm text-slate-700">
                Click Withdraw Cash to complete cash withdrawal, update the Branch Main Account balance, and move to the next step.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="font-semibold text-slate-900">{cashWithdrawalModal.loan.customer_name || '-'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Loan Amount</p>
                  <p className="font-semibold text-slate-900">
                    LKR {Number(cashWithdrawalModal.loan.loan_amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void submitCashWithdrawalAndMoveNext()}
                  className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                  disabled={advancingId === cashWithdrawalModal.loan.id}
                >
                  {advancingId === cashWithdrawalModal.loan.id ? 'Withdrawing...' : 'Withdraw Cash'}
                </button>
                <button
                  type="button"
                  onClick={closeCashWithdrawalModal}
                  className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                  disabled={advancingId === cashWithdrawalModal.loan.id}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {secondCallConfirmationModal.open && secondCallConfirmationModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl border border-indigo-100 max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-3 text-white">
              <h3 className="text-lg font-bold">Second Call Confirmation</h3>
            </div>

            {(() => {
              const loan = secondCallConfirmationModal.loan!;
              const form = secondCallConfirmationModal.form;
              const schedule = getLoanSchedule(loan);
              const loanTypeLabel = formatLoanType(loan.refund_option);
              const dateOfBirth = resolveCustomerDob(loan) || '-';
              const items: Array<{ key: keyof SecondCallConfirmationForm; label: string; value: string }> = [
                { key: 'customer_full_name', label: 'Customer full name', value: String(loan.customer_name || '-') },
                { key: 'nic_number', label: 'NIC number', value: String(loan.nic || '-') },
                { key: 'registered_mobile_number', label: 'Registered mobile number', value: String(loan.contact_no || '-') },
                { key: 'date_of_birth', label: 'Date of birth', value: dateOfBirth },
                { key: 'address', label: 'Address', value: String(loan.address || '-') },
                {
                  key: 'loan_amount',
                  label: 'Loan Amount',
                  value: `LKR ${Number(loan.loan_amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
                { key: 'loan_purpose', label: 'Loan Purpose', value: String(loan.reason || '-') },
                { key: 'loan_term', label: 'Loan Term', value: `${loan.terms_count} ${loanTypeLabel}(s)` },
                {
                  key: 'installment',
                  label: 'Installment',
                  value: `LKR ${Number(loan.installment_amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
                { key: 'payment_frequency', label: 'Payment Frequency', value: loanTypeLabel },
                { key: 'interest_rate', label: 'Interest Rate', value: `${Number(loan.interest_rate || 0).toFixed(2)}%` },
                { key: 'first_payment_date', label: 'First Payment Date', value: schedule.nextPaymentDate || '-' },
                { key: 'number_of_installments', label: 'Number of Installments', value: String(loan.terms_count || '-') },
              ];

              return (
                <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
                  <p className="text-sm text-slate-700">Confirm each detail after customer verification on second call.</p>

                  <div className="mt-4 space-y-2">
                    {items.map((item) => (
                      <label key={item.key} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={form[item.key]}
                          onChange={(e) =>
                            setSecondCallConfirmationModal((prev) => ({
                              ...prev,
                              form: { ...prev.form, [item.key]: e.target.checked },
                            }))
                          }
                          disabled={secondCallConfirmingId === loan.id}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{item.label}</p>
                          <p className="text-sm font-semibold text-slate-900 break-words">{item.value || '-'}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void submitSecondCallConfirmationAndMoveNext()}
                      className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                      disabled={secondCallConfirmingId === loan.id}
                    >
                      {secondCallConfirmingId === loan.id ? 'Confirming...' : 'Call Confirm and Move to Step 9'}
                    </button>
                    <button
                      type="button"
                      onClick={closeSecondCallConfirmationModal}
                      className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                      disabled={secondCallConfirmingId === loan.id}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {loanSignatureCheckModal.open && loanSignatureCheckModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl border border-emerald-100 max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-white">
              <h3 className="text-lg font-bold">Loan Signature Check</h3>
            </div>

            {(() => {
              const loan = loanSignatureCheckModal.loan!;
              const form = loanSignatureCheckModal.form;
              const customerPhotoUrl = resolveLoanCustomerPhotoUrl(loan);
              const customerSignatureUrl = resolveLoanCustomerSignatureUrl(loan);

              return (
                <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
                  <p className="text-sm text-slate-700">Verify customer photo and customer signature before moving to Step 10: Document failing.</p>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Photo</p>
                      <div className="mt-2 h-52 w-full rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                        {customerPhotoUrl ? (
                          <img src={customerPhotoUrl} alt="Customer Photo" className="h-full w-full rounded-lg object-contain" />
                        ) : (
                          <span className="text-xs text-slate-500">No customer photo available</span>
                        )}
                      </div>
                      <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={form.confirm_customer_photo}
                          onChange={(e) =>
                            setLoanSignatureCheckModal((prev) => ({
                              ...prev,
                              form: { ...prev.form, confirm_customer_photo: e.target.checked },
                            }))
                          }
                          disabled={advancingId === loan.id}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        />
                        Confirm Customer Photo
                      </label>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Signature</p>
                      <div className="mt-2 h-52 w-full rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                        {customerSignatureUrl ? (
                          <img src={customerSignatureUrl} alt="Customer Signature" className="h-full w-full rounded-lg object-contain" />
                        ) : (
                          <span className="text-xs text-slate-500">No customer signature available</span>
                        )}
                      </div>
                      <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={form.confirm_customer_signature}
                          onChange={(e) =>
                            setLoanSignatureCheckModal((prev) => ({
                              ...prev,
                              form: { ...prev.form, confirm_customer_signature: e.target.checked },
                            }))
                          }
                          disabled={advancingId === loan.id}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        />
                        Confirm Customer Signature
                      </label>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void submitLoanSignatureCheckAndMoveNext()}
                      className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                      disabled={advancingId === loan.id}
                    >
                      {advancingId === loan.id ? 'Moving...' : 'Confirm Signature and Move to Step 10'}
                    </button>
                    <button
                      type="button"
                      onClick={closeLoanSignatureCheckModal}
                      className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                      disabled={advancingId === loan.id}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {documentVerificationModal.open && documentVerificationModal.loan && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl border border-amber-100 max-h-[92vh] overflow-auto">
            <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white">
              <h3 className="text-lg font-bold">Document Verification</h3>
            </div>

            {(() => {
              const loan = documentVerificationModal.loan!;
              const form = documentVerificationModal.form;
              const notRequired = documentVerificationModal.notRequired;
              const items = buildDocumentVerificationItems(loan);

              return (
                <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
                  <p className="text-sm text-slate-700">
                    Verify required documents: Customer National ID, Passport, Driving License, Bank Statements, EPF Reports, Tax Returns,
                    Paysheets, Business Documents, Guarantor Image, and Guarantor Signature.
                  </p>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((item) => (
                      <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{item.label}</p>
                        <p className={`mt-1 text-xs font-semibold ${item.available ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {item.available ? 'Document Available' : 'Document Not Available'}
                        </p>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void openDocumentViewer(item.label, item.url)}
                            disabled={!item.available || documentVerifyingId === loan.id}
                            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                          >
                            Preview
                          </button>
                          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <input
                              type="checkbox"
                              checked={form[item.key]}
                              onChange={(e) =>
                                setDocumentVerificationModal((prev) => ({
                                  ...prev,
                                  form: { ...prev.form, [item.key]: e.target.checked },
                                  notRequired: {
                                    ...prev.notRequired,
                                    [item.key]: e.target.checked ? false : prev.notRequired[item.key],
                                  },
                                }))
                              }
                              disabled={!item.available || documentVerifyingId === loan.id}
                              className="h-4 w-4 rounded border-slate-300 text-amber-600"
                            />
                            Verify
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={notRequired[item.key]}
                              onChange={(e) =>
                                setDocumentVerificationModal((prev) => ({
                                  ...prev,
                                  notRequired: { ...prev.notRequired, [item.key]: e.target.checked },
                                  form: {
                                    ...prev.form,
                                    [item.key]: e.target.checked ? false : prev.form[item.key],
                                  },
                                }))
                              }
                              disabled={documentVerifyingId === loan.id}
                              className="h-4 w-4 rounded border-slate-300 text-slate-600"
                            />
                            Not Required
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void submitDocumentVerificationAndMoveNext()}
                      className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-70"
                      disabled={documentVerifyingId === loan.id}
                    >
                      {documentVerifyingId === loan.id ? 'Verifying...' : 'Verify Documents and Move to Step 11'}
                    </button>
                    <button
                      type="button"
                      onClick={closeDocumentVerificationModal}
                      className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-400"
                      disabled={documentVerifyingId === loan.id}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {detailsViewer.open && detailsViewer.loan && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-900/65 px-4 py-8">
          <div className="w-full max-w-7xl rounded-2xl bg-white p-4 shadow-2xl border border-cyan-100 max-h-[94vh] overflow-auto">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Loan Request Details</h3>
                <p className="text-sm text-slate-600">{detailsViewer.loan.customer_name} ({detailsViewer.loan.customer_no})</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!canEditLoanDetails) {
                      openModal('Only Finance Manager, Branch Manager, and Admin can edit loan details.', 'Permission');
                      return;
                    }
                    openEditLoanModal(detailsViewer.loan!);
                  }}
                  className="hidden"
                >
                  Edit Loan Details
                </button>
                {canApproveOrReject && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSendBackButtonClick(detailsViewer.loan!);
                    }}
                    className="rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-200"
                  >
                    Send Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeDetailsViewer}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Step 1 - Location Mapping</p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Loan Scope</p><p className="font-bold text-slate-900">{detailsViewer.loan.loan_scope}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Route</p><p className="font-bold text-slate-900">{detailsViewer.loan.route?.name || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Center</p><p className="font-bold text-slate-900">{detailsViewer.loan.center?.name || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Group</p><p className="font-bold text-slate-900">{detailsViewer.loan.group?.name || '-'}</p></div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Step 2 - Officer & Team</p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Request Approval To</p><p className="font-bold text-slate-900">{getApprovalEmployeeName(detailsViewer.loan)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Manager</p><p className="font-bold text-slate-900">{detailsViewer.loan.manager_name || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Collection Officer</p><p className="font-bold text-slate-900">{detailsViewer.loan.field_officer || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Group Leader</p><p className="font-bold text-slate-900">{detailsViewer.loan.group_leader || '-'}</p></div>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Step 3 - Customer Details</p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Customer No</p><p className="font-bold text-slate-900">{detailsViewer.loan.customer_no || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Customer Name</p><p className="font-bold text-slate-900">{detailsViewer.loan.customer_name || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">NIC</p><p className="font-bold text-slate-900">{detailsViewer.loan.nic || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Contact</p><p className="font-bold text-slate-900">{detailsViewer.loan.contact_no || '-'}</p></div>
                  <div className="md:col-span-2"><p className="text-[11px] uppercase tracking-wide text-slate-500">Address</p><p className="font-bold text-slate-900">{detailsViewer.loan.address || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Bank Name</p><p className="font-bold text-slate-900">{detailsViewer.loan.bank_name || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Bank Branch</p><p className="font-bold text-slate-900">{detailsViewer.loan.bank_branch || '-'}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Bank Account</p><p className="font-bold text-slate-900">{detailsViewer.loan.bank_account_no || '-'}</p></div>
                </div>
              </div>

              <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-700">Step 4 - Guarantors</p>
                {(detailsViewer.loan.guarantors || []).length === 0 ? (
                  <p className="mt-2 text-slate-600">No guarantors available.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {(detailsViewer.loan.guarantors || []).map((guarantor) => (
                      <div key={guarantor.id} className="rounded-lg border border-fuchsia-100 bg-white p-3">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Name</p><p className="font-bold text-slate-900">{guarantor.name || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">NIC</p><p className="font-bold text-slate-900">{guarantor.nic || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Contact</p><p className="font-bold text-slate-900">{guarantor.contact_no || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Relationship</p><p className="font-bold text-slate-900">{guarantor.relationship || '-'}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Address</p><p className="font-bold text-slate-900">{guarantor.address || '-'}</p></div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void openDocumentViewer(guarantor.image_original_name || 'Guarantor Image', resolveStorageAssetUrl(String(guarantor.image_url || '')))}
                            className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
                            disabled={!guarantor.image_url}
                          >
                            View Guarantor Image
                          </button>
                          <button
                            type="button"
                            onClick={() => void openDocumentViewer(guarantor.signature_original_name || 'Guarantor Signature', resolveStorageAssetUrl(String(guarantor.signature_url || '')))}
                            className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
                            disabled={!guarantor.signature_url}
                          >
                            View Guarantor Signature
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Step 5 - Loan Details & Documents</p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Loan Amount</p><p className="font-bold text-slate-900">{Number(detailsViewer.loan.loan_amount || 0).toFixed(2)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Refundable Amount</p><p className="font-bold text-slate-900">{Number(detailsViewer.loan.refundable_amount || 0).toFixed(2)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Installment Amount</p><p className="font-bold text-slate-900">{Number(detailsViewer.loan.installment_amount || 0).toFixed(2)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Request Date</p><p className="font-bold text-slate-900">{detailsViewer.loan.loan_request_date}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Interest</p><p className="font-bold text-slate-900">{detailsViewer.loan.interest_type} / {Number(detailsViewer.loan.interest_rate || 0)}%</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Terms</p><p className="font-bold text-slate-900">{detailsViewer.loan.terms_count} {formatLoanType(detailsViewer.loan.refund_option)}(s)</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Charge Mode</p><p className="font-bold text-slate-900">{String(detailsViewer.loan.charge_payment_mode || '-').replaceAll('_', ' ')}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Collection Status</p><p className="font-bold text-slate-900">{String(detailsViewer.loan.charges_collection_status || '-').replaceAll('_', ' ')}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Document Charges</p><p className="font-bold text-slate-900">{Number(detailsViewer.loan.document_charges || 0).toFixed(2)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Stamp Charges</p><p className="font-bold text-slate-900">{Number(detailsViewer.loan.stamp_charges || 0).toFixed(2)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Insurance Charges</p><p className="font-bold text-slate-900">{Number(detailsViewer.loan.insurance_charges || 0).toFixed(2)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-500">Net Disbursed</p><p className="font-bold text-slate-900">{Number(detailsViewer.loan.net_disbursed_amount || 0).toFixed(2)}</p></div>
                  <div className="md:col-span-4"><p className="text-[11px] uppercase tracking-wide text-slate-500">Reason</p><p className="font-bold text-slate-900">{detailsViewer.loan.reason || '-'}</p></div>
                </div>

                <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Documents</p>
                  {detailsLoading ? (
                    <p className="mt-2 text-slate-600">Loading documents...</p>
                  ) : (
                    (() => {
                      const loanDocuments = detailsViewer.loan.documents || [];
                      const customerDocuments = customerDocumentsByLoanId[detailsViewer.loan.id] || [];
                      const hasNoDocuments = loanDocuments.length === 0 && customerDocuments.length === 0;

                      if (hasNoDocuments) {
                        return <p className="mt-2 text-slate-600">No documents available.</p>;
                      }

                      return (
                        <div className="mt-2 space-y-3">
                          {customerDocuments.length > 0 && (
                            <div>
                              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cyan-700">Customer Registered Documents</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {customerDocuments.map((document) => (
                                  <div key={`customer-doc-${document.id}`} className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-2 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-slate-900 truncate">{document.document_type || 'Document'}</p>
                                      <p className="text-[11px] text-slate-600 truncate">{document.original_name || document.file_path || '-'}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void openCustomerDocumentViewer(detailsViewer.loan!, document)}
                                      className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
                                    >
                                      Preview
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {loanDocuments.length > 0 && (
                            <div>
                              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">Loan Request Documents</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {loanDocuments.map((document) => (
                                  <div key={`loan-doc-${document.id}`} className="rounded-lg border border-blue-100 bg-blue-50/50 p-2 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-slate-900 truncate">{document.document_type || 'Document'}</p>
                                      <p className="text-[11px] text-slate-600 truncate">{document.original_name || document.file_path || '-'}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void openDocumentViewer(document.original_name || document.document_type || 'Document', resolveDocumentUrl(document))}
                                      className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                    >
                                      Preview
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {documentViewer.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-6xl rounded-2xl bg-white p-4 shadow-2xl border border-cyan-100 max-h-[92vh] overflow-auto">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Document Preview</h3>
                <p className="text-sm text-slate-600 break-all">{documentViewer.title}</p>
              </div>
              <button
                type="button"
                onClick={closeDocumentViewer}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="rounded-xl border border-cyan-100 bg-slate-50 p-3 min-h-[360px] flex items-center justify-center">
              {documentViewerLoading ? (
                <div className="text-center text-sm text-slate-700">Loading document preview...</div>
              ) : documentViewer.type === 'image' ? (
                <img src={documentViewer.url} alt={documentViewer.title} className="max-h-[72vh] w-auto max-w-full rounded-lg object-contain" />
              ) : documentViewer.type === 'pdf' ? (
                <iframe src={documentViewer.url} title={documentViewer.title} className="h-[72vh] w-full rounded-lg border border-slate-200 bg-white" />
              ) : (
                <div className="text-center text-sm text-slate-700">
                  <p className="mb-3">Inline preview is not available for this file type.</p>
                  <a href={documentViewer.url} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 font-semibold text-cyan-700 hover:bg-cyan-100">
                    Open Document
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {requestApprovalModal.open && requestApprovalModal.loan && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl border border-indigo-100">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Request Another Approval</h3>
                <p className="text-sm text-slate-600">
                  {requestApprovalModal.loan.customer_name} ({requestApprovalModal.loan.customer_no})
                </p>
              </div>
              <button
                type="button"
                onClick={closeRequestApprovalModal}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={approvalRequestingId === requestApprovalModal.loan.id}
              >
                Close
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Select Approver</label>
              <select
                className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-black"
                value={requestApprovalModal.employeeId}
                onChange={(e) =>
                  setRequestApprovalModal((prev) => ({
                    ...prev,
                    employeeId: e.target.value,
                  }))
                }
                disabled={approvalCandidatesLoading || approvalRequestingId === requestApprovalModal.loan.id}
              >
                <option value="">Select employee</option>
                {approvalCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                    {candidate.designation ? ` - ${candidate.designation}` : ''}
                    {candidate.employee_code ? ` (${candidate.employee_code})` : ''}
                  </option>
                ))}
              </select>
              {approvalCandidatesLoading && <p className="text-xs text-slate-500">Loading approval candidates...</p>}
              {!approvalCandidatesLoading && approvalCandidates.length === 0 && (
                <p className="text-xs text-amber-700">No approval candidates available for your branch.</p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!approvalCandidatesLoading) {
                    void loadApprovalCandidates();
                  }
                }}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                disabled={approvalCandidatesLoading || approvalRequestingId === requestApprovalModal.loan.id}
              >
                {approvalCandidatesLoading ? 'Refreshing...' : 'Refresh List'}
              </button>
              <button
                type="button"
                onClick={submitRequestApproval}
                className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                disabled={approvalRequestingId === requestApprovalModal.loan.id || approvalCandidatesLoading}
              >
                {approvalRequestingId === requestApprovalModal.loan.id ? 'Submitting...' : 'Send Approval Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {markCalledModal.open && markCalledModal.loan && (
        <div className="fixed inset-0 z-[73] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl border border-emerald-100 max-h-[92vh] overflow-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Call Confirmation - Step 2</h3>
                <p className="text-sm text-slate-600">
                  {markCalledModal.loan.customer_name} ({markCalledModal.loan.customer_no})
                </p>
              </div>
              <button
                type="button"
                onClick={closeMarkCalledModal}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={markCalledSubmittingId === markCalledModal.loan.id}
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
                  value={markCalledModal.form.no_of_times_called}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, no_of_times_called: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Called Date *</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.called_date}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, called_date: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={markCalledModal.form.answered_by_customer}
                    onChange={(e) =>
                      setMarkCalledModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, answered_by_customer: e.target.checked },
                      }))
                    }
                    disabled={markCalledSubmittingId === markCalledModal.loan.id}
                  />
                  Answer By Customer
                </label>
                <p className="mt-1 text-xs text-slate-600">Preview Contact: {markCalledModal.form.customer_contact_no || '-'}</p>
              </div>

              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    checked={markCalledModal.form.answered_by_spouse}
                    onChange={(e) =>
                      setMarkCalledModal((prev) => ({
                        ...prev,
                        form: { ...prev.form, answered_by_spouse: e.target.checked },
                      }))
                    }
                    disabled={markCalledSubmittingId === markCalledModal.loan.id}
                  />
                  Answer By Spouse
                </label>
                <p className="mt-1 text-xs text-slate-600">Preview Contact: {markCalledModal.form.spouse_contact_no || '-'}</p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Customer Full Name *</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.customer_full_name}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, customer_full_name: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">NIC / Date Of Birth *</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.nic_or_dob}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, nic_or_dob: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Loan Amount *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.loan_amount}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, loan_amount: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Given Date *</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.given_date}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, given_date: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Business Type</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.business_type}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, business_type: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Repayment Card Given *</label>
                <select
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.repayment_card_given}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, repayment_card_given: e.target.value as CallConfirmationForm['repayment_card_given'] },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
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
                  value={markCalledModal.form.business_details}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, business_details: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Special Notes</label>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.special_notes}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, special_notes: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Disbursement OTP</label>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-black"
                  value={markCalledModal.form.disbursement_otp}
                  onChange={(e) =>
                    setMarkCalledModal((prev) => ({
                      ...prev,
                      form: { ...prev.form, disbursement_otp: e.target.value },
                    }))
                  }
                  disabled={markCalledSubmittingId === markCalledModal.loan.id}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeMarkCalledModal}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={markCalledSubmittingId === markCalledModal.loan.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitMarkAsCalled}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                disabled={markCalledSubmittingId === markCalledModal.loan.id}
              >
                {markCalledSubmittingId === markCalledModal.loan.id ? 'Saving...' : 'Save & Move Next Step'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendBackModal.open && sendBackModal.loan && (
        <div className="fixed inset-0 z-[73] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl border border-rose-100 max-h-[92vh] overflow-auto">
            {(() => {
              const currentSendBackStep = resolveWorkflowStep(sendBackModal.loan);
              const backStepOptions = getBackStepOptions(currentSendBackStep);
              const selectedBackStep = Number(sendBackModal.targetStep || 0);

              return (
                <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Send Back Loan Request</h3>
                <p className="text-sm text-slate-600">
                  {sendBackModal.loan.customer_name} ({sendBackModal.loan.customer_no})
                </p>
              </div>
              <button
                type="button"
                onClick={closeSendBackModal}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={sendBackSubmittingId === sendBackModal.loan.id}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Send Back Step *</label>
                <p className="mt-1 text-xs text-slate-500">
                  Current step: {currentSendBackStep} - {getWorkflowStepLabel(currentSendBackStep)}
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
                  disabled={sendBackSubmittingId === sendBackModal.loan.id || backStepOptions.length === 0}
                >
                  {backStepOptions.map((step) => (
                    <option key={`send-back-step-option-${step}`} value={String(step)}>
                      Step {step} - {getWorkflowStepLabel(step)}
                    </option>
                  ))}
                </select>
                {backStepOptions.length === 0 && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">This loan is already at Step 1 and cannot be sent back further.</p>
                )}
              </div>

              {backStepOptions.length > 0 && (
                <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Selected Step Definition</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    Step {selectedBackStep} - {getWorkflowStepLabel(selectedBackStep)}
                  </p>
                  <p className="mt-1 text-slate-700">{getWorkflowStepDefinition(selectedBackStep)}</p>
                </div>
              )}

              {backStepOptions.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Available Back Steps (Definitions)</p>
                  <div className="mt-2 space-y-1.5">
                    {backStepOptions.map((step) => (
                      <p key={`send-back-step-definition-${step}`} className="text-slate-700">
                        <span className="font-semibold text-slate-900">Step {step} - {getWorkflowStepLabel(step)}:</span>{' '}
                        {getWorkflowStepDefinition(step)}
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
                  disabled={sendBackSubmittingId === sendBackModal.loan.id}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeSendBackModal}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={sendBackSubmittingId === sendBackModal.loan.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSendBack}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                disabled={sendBackSubmittingId === sendBackModal.loan.id}
              >
                {sendBackSubmittingId === sendBackModal.loan.id ? 'Sending...' : 'Send Back With Note'}
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {editLoanModal.open && editLoanModal.loan && (
        <div className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl border border-cyan-100 max-h-[92vh] overflow-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Loan Details</h3>
                <p className="text-sm text-slate-600">
                  {editLoanModal.loan.customer_name} ({editLoanModal.loan.customer_no})
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditLoanModal}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={editLoanModal.saving}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <input className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Customer Name" value={editLoanModal.form.customer_name} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, customer_name: e.target.value } }))} />
              <input className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Contact No" value={editLoanModal.form.contact_no} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, contact_no: e.target.value } }))} />
              <input className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Manager Name" value={editLoanModal.form.manager_name} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, manager_name: e.target.value } }))} />
              <input className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Collection Officer" value={editLoanModal.form.field_officer} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, field_officer: e.target.value } }))} />
              <input className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Group Leader" value={editLoanModal.form.group_leader} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, group_leader: e.target.value } }))} />
              <input type="date" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" value={editLoanModal.form.loan_request_date} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, loan_request_date: e.target.value } }))} />
              <input className="md:col-span-2 rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Address" value={editLoanModal.form.address} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, address: e.target.value } }))} />
              <input className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Bank Name" value={editLoanModal.form.bank_name} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, bank_name: e.target.value } }))} />
              <input className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Bank Branch" value={editLoanModal.form.bank_branch} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, bank_branch: e.target.value } }))} />
              <input className="md:col-span-2 rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Bank Account No" value={editLoanModal.form.bank_account_no} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, bank_account_no: e.target.value } }))} />

              <input type="number" min="0" step="0.01" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Loan Amount" value={editLoanModal.form.loan_amount} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, loan_amount: e.target.value } }))} />
              <input type="number" min="0" step="0.01" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Interest Rate" value={editLoanModal.form.interest_rate} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, interest_rate: e.target.value } }))} />
              <input type="number" min="1" step="1" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Terms Count" value={editLoanModal.form.terms_count} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, terms_count: e.target.value } }))} />
              <select className="rounded-lg border border-cyan-100 px-3 py-2 text-black" value={editLoanModal.form.refund_option} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, refund_option: e.target.value as EditLoanForm['refund_option'] } }))}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
              <input type="number" min="0" step="0.01" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Refundable Amount" value={editLoanModal.form.refundable_amount} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, refundable_amount: e.target.value } }))} />
              <input type="number" min="0" step="0.01" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Installment Amount" value={editLoanModal.form.installment_amount} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, installment_amount: e.target.value } }))} />
              <select className="rounded-lg border border-cyan-100 px-3 py-2 text-black" value={editLoanModal.form.interest_type} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, interest_type: e.target.value as EditLoanForm['interest_type'] } }))}>
                <option value="flat">Flat</option>
                <option value="reducing">Reducing</option>
              </select>

              <input type="number" min="0" step="0.01" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Document Charges" value={editLoanModal.form.document_charges} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, document_charges: e.target.value } }))} />
              <input type="number" min="0" step="0.01" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Stamp Charges" value={editLoanModal.form.stamp_charges} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, stamp_charges: e.target.value } }))} />
              <input type="number" min="0" step="0.01" className="rounded-lg border border-cyan-100 px-3 py-2 text-black" placeholder="Insurance Charges" value={editLoanModal.form.insurance_charges} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, insurance_charges: e.target.value } }))} />
              <select className="rounded-lg border border-cyan-100 px-3 py-2 text-black" value={editLoanModal.form.charge_payment_mode} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, charge_payment_mode: e.target.value as EditLoanForm['charge_payment_mode'] } }))}>
                <option value="deduct_from_loan">Deduct from loan</option>
                <option value="hand_cash">Hand cash</option>
              </select>
              <select className="rounded-lg border border-cyan-100 px-3 py-2 text-black" value={editLoanModal.form.charges_collection_status} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, charges_collection_status: e.target.value as EditLoanForm['charges_collection_status'] } }))}>
                <option value="pending">Pending</option>
                <option value="done">Done</option>
              </select>

              <textarea className="md:col-span-2 rounded-lg border border-cyan-100 px-3 py-2 text-black" rows={3} placeholder="Reason" value={editLoanModal.form.reason} onChange={(e) => setEditLoanModal((prev) => ({ ...prev, form: { ...prev.form, reason: e.target.value } }))} />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditLoanModal}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={editLoanModal.saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEditLoanDetails}
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-70"
                disabled={editLoanModal.saving}
              >
                {editLoanModal.saving ? 'Saving...' : 'Save Loan Details'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-orange-100">
            <h3 className="text-lg font-bold text-slate-900">{modal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{modal.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
