'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl, getBackendOrigin } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type MFRoute = { id: number; name: string; code: string };
type MFCenter = { id: number; mf_route_id: number; name: string; code: string };
type MFGroup = { id: number; mf_route_id: number; mf_center_id: number; name: string; code: string };
type EmployeeOption = { id: number; name: string; designation: string };
type LoanGuarantor = {
  id?: number;
  name?: string;
  nic?: string;
  address?: string;
  contact_no?: string;
  relationship?: string;
  image_url?: string | null;
  signature_url?: string | null;
  image_original_name?: string | null;
  signature_original_name?: string | null;
};

type LoanRequest = {
  id: number;
  customer_no: string;
  customer_name: string;
  nick_name?: string | null;
  address?: string | null;
  contact_no?: string | null;
  nic?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_no?: string | null;
  reason?: string | null;
  loan_scope: 'route_loan' | 'center_loan' | 'direct_loan';
  loan_amount: string | number;
  refundable_amount: string | number;
  installment_amount: string | number;
  document_charges?: string | number;
  stamp_charges?: string | number;
  insurance_charges?: string | number;
  charge_payment_mode?: 'deduct_from_loan' | 'hand_cash';
  charges_collection_status?: 'pending' | 'done' | string;
  manager_name?: string;
  field_officer?: string;
  group_leader?: string;
  mf_route_id?: number | null;
  mf_center_id?: number | null;
  mf_group_id?: number | null;
  interest_type: 'flat' | 'reducing';
  interest_rate: string | number;
  terms_count: number;
  refund_option: 'day' | 'week' | 'month';
  status: string;
  workflow_step?: number | null;
  workflow_step_updated_at?: string | null;
  call_confirmation_payload?: Record<string, unknown> | null;
  call_confirmed_at?: string | null;
  bm_approval_payload?: Record<string, unknown> | null;
  bm_approved_at?: string | null;
  cash_allocation_payload?: Record<string, unknown> | null;
  cash_allocated_at?: string | null;
  second_call_confirmation_payload?: Record<string, unknown> | null;
  second_call_confirmed_at?: string | null;
  document_verification_payload?: Record<string, unknown> | null;
  document_verified_at?: string | null;
  route?: { id: number; name: string; code: string } | null;
  center?: { id: number; name: string; code: string } | null;
  group?: { id: number; name: string; code: string } | null;
  loan_request_date: string;
  next_payment_date?: string | null;
  due_date?: string | null;
  loan_end_date?: string | null;
  documents?: {
    id: number;
    document_type: string;
    file_path: string;
    original_name: string;
  }[];
  guarantors?: LoanGuarantor[];
};

type CustomerProfileDocument = {
  id: number;
  document_type: string;
  file_path: string;
  original_name: string;
  file_url?: string | null;
  uploaded_by?: number;
  created_at?: string;
};

type CustomerProfileRecord = {
  id: number;
  customer_code?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  nic_passport?: string;
  old_nic?: string;
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  nationality?: string;
  permanent_address?: string;
  current_address?: string;
  employer_name?: string;
  job_title?: string;
  monthly_income?: string | number;
  additional_details?: Record<string, unknown>;
  photo_url?: string | null;
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

type CollectionRow = {
  id: number;
  mf_loan_request_id: number | string;
  collection_date?: string | null;
  created_at?: string | null;
  collected_amount?: number | string;
  capital_amount?: number | string;
  interest_amount?: number | string;
  penalty_amount?: number | string;
  profit_amount?: number | string;
  payment_type?: string | null;
  payment_reference?: string | null;
};

type CollectionTransaction = {
  id: number;
  date: string;
  loanId: number;
  loanCode: string;
  customerNo: string;
  customerName: string;
  fieldOfficer: string;
  collected: number;
  capital: number;
  profit: number;
  penalty: number;
  paymentType: string;
  reference: string;
};

type DetailsDocumentItem = {
  id: string;
  source: 'loan' | 'customer' | 'guarantor';
  document_type: string;
  original_name: string;
  file_path?: string;
  access_url?: string;
};

const ACTIVE_LOAN_STATUSES = new Set(['approved', 'released']);

const formatDisplayDate = (value?: string | null) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

const formatProcessValue = (value: unknown) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() === '' ? '-' : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    return value
      .map((item) => {
        if (item === null || item === undefined) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        return JSON.stringify(item);
      })
      .filter((item) => item !== '')
      .join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const resolveAssetUrl = (pathOrUrl: string) => {
  const value = String(pathOrUrl || '').trim();
  if (!value) return '';

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${getBackendOrigin()}${value}`;
  }

  return `${getBackendOrigin()}/storage/${value.replace(/^public\//, '')}`;
};

const EyeIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function ReleasedLoansPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [collectionsError, setCollectionsError] = useState('');
  const [routes, setRoutes] = useState<MFRoute[]>([]);
  const [centers, setCenters] = useState<MFCenter[]>([]);
  const [groups, setGroups] = useState<MFGroup[]>([]);
  const [managers, setManagers] = useState<EmployeeOption[]>([]);
  const [fieldOfficers, setFieldOfficers] = useState<EmployeeOption[]>([]);
  const [modal, setModal] = useState({ open: false, title: '', message: '' });
  const [removeConfirmModal, setRemoveConfirmModal] = useState<{
    open: boolean;
    loanId: number | null;
    customerName: string;
    customerNo: string;
  }>({
    open: false,
    loanId: null,
    customerName: '',
    customerNo: '',
  });
  const [documentsModal, setDocumentsModal] = useState<{
    open: boolean;
    loanCode: string;
    customerName: string;
    documents: NonNullable<LoanRequest['documents']>;
  }>({
    open: false,
    loanCode: '',
    customerName: '',
    documents: [],
  });
  const [detailsModal, setDetailsModal] = useState<{
    open: boolean;
    loan: LoanRequest | null;
    selectedDocumentId: string | null;
    activeTab: 'customer' | 'loan' | 'guarantor';
    customerLoading: boolean;
    customerError: string;
    customerProfile: CustomerProfileRecord | null;
    customerDocuments: CustomerProfileDocument[];
    selectedCustomerDocumentId: number | null;
  }>({
    open: false,
    loan: null,
    selectedDocumentId: null,
    activeTab: 'customer',
    customerLoading: false,
    customerError: '',
    customerProfile: null,
    customerDocuments: [],
    selectedCustomerDocumentId: null,
  });
  const [customerDocPreview, setCustomerDocPreview] = useState<{
    docId: number | null;
    objectUrl: string;
    loading: boolean;
    error: string;
  }>({
    docId: null,
    objectUrl: '',
    loading: false,
    error: '',
  });
  const [editModal, setEditModal] = useState<{
    open: boolean;
    loanId: number | null;
    loan_scope: 'route_loan' | 'center_loan' | 'direct_loan';
    mf_route_id: number;
    mf_center_id: number;
    mf_group_id: number;
    manager_name: string;
    field_officer: string;
    group_leader: string;
    customer_name: string;
    nick_name: string;
    address: string;
    contact_no: string;
    reason: string;
    loan_amount: string;
    refund_option: 'day' | 'week' | 'month';
    interest_type: 'flat' | 'reducing';
    interest_rate: string;
    terms_count: string;
    refundable_amount: string;
    installment_amount: string;
    document_charges: string;
    stamp_charges: string;
    insurance_charges: string;
    charge_payment_mode: 'deduct_from_loan' | 'hand_cash';
    loan_request_date: string;
    next_collection_date: string;
    loan_end_date: string;
    guarantors: Array<{ name: string; nic: string; address: string; contact_no: string; relationship: string }>;
  }>({
    open: false,
    loanId: null,
    loan_scope: 'center_loan',
    mf_route_id: 0,
    mf_center_id: 0,
    mf_group_id: 0,
    manager_name: '',
    field_officer: '',
    group_leader: '',
    customer_name: '',
    nick_name: '',
    address: '',
    contact_no: '',
    reason: '',
    loan_amount: '',
    refund_option: 'month',
    interest_type: 'flat',
    interest_rate: '',
    terms_count: '',
    refundable_amount: '',
    installment_amount: '',
    document_charges: '',
    stamp_charges: '',
    insurance_charges: '',
    charge_payment_mode: 'hand_cash',
    loan_request_date: '',
    next_collection_date: '',
    loan_end_date: '',
    guarantors: [{ name: '', nic: '', address: '', contact_no: '', relationship: '' }],
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [downloadingAgreementId, setDownloadingAgreementId] = useState<number | null>(null);
  const [downloadingReminderId, setDownloadingReminderId] = useState<number | null>(null);
  const [downloadingLegalId, setDownloadingLegalId] = useState<number | null>(null);
  const [editStep, setEditStep] = useState(1);

  const openModal = (message: string, title = 'Notice') => {
    setModal({ open: true, title, message });
  };

  const closeModal = () => {
    setModal({ open: false, title: '', message: '' });
  };
  const widgetPrefix = 'mf_released_loans_widget_';

  const fetchWidgetPreferences = async (authToken: string) => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
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
        `${getApiBaseUrl()}/dashboard/widgets`,
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

  const openRemoveConfirmModal = (loan: LoanRequest) => {
    setRemoveConfirmModal({
      open: true,
      loanId: loan.id,
      customerName: loan.customer_name,
      customerNo: loan.customer_no,
    });
  };

  const closeRemoveConfirmModal = () => {
    setRemoveConfirmModal({
      open: false,
      loanId: null,
      customerName: '',
      customerNo: '',
    });
  };

  const openDocumentsModal = (loan: LoanRequest) => {
    const docs = Array.isArray(loan.documents) ? loan.documents : [];

    if (docs.length === 0) {
      openModal('No documents uploaded for this loan yet.', 'Loan Documents');
      return;
    }

    setDocumentsModal({
      open: true,
      loanCode: loan.customer_no,
      customerName: loan.customer_name,
      documents: docs,
    });
  };

  const closeDocumentsModal = () => {
    setDocumentsModal({ open: false, loanCode: '', customerName: '', documents: [] });
  };

  const openDetailsModal = (loan: LoanRequest) => {
    const docs = Array.isArray(loan.documents) ? loan.documents : [];
    setDetailsModal({
      open: true,
      loan,
      selectedDocumentId: docs.length > 0 ? `loan-${docs[0].id}` : null,
      activeTab: 'customer',
      customerLoading: true,
      customerError: '',
      customerProfile: null,
      customerDocuments: [],
      selectedCustomerDocumentId: null,
    });

    void (async () => {
      try {
        const response = await axios.get(`${getApiBaseUrl()}/microfinance/loan-requests/${loan.id}/customer-profile`, {
          headers,
        });

        const customer = response.data?.customer as CustomerProfileRecord | null;
        const customerDocuments = Array.isArray(response.data?.customer_documents)
          ? (response.data.customer_documents as CustomerProfileDocument[])
          : [];

        setDetailsModal((prev) => {
          if (!prev.open || !prev.loan || prev.loan.id !== loan.id) {
            return prev;
          }

          return {
            ...prev,
            customerLoading: false,
            customerError: customer ? '' : String(response.data?.message || 'Customer details not found.'),
            customerProfile: customer,
            customerDocuments,
            selectedCustomerDocumentId: customerDocuments.length > 0 ? customerDocuments[0].id : null,
          };
        });
      } catch (error: unknown) {
        const message =
          axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Failed to load customer full profile.';

        setDetailsModal((prev) => {
          if (!prev.open || !prev.loan || prev.loan.id !== loan.id) {
            return prev;
          }

          return {
            ...prev,
            customerLoading: false,
            customerError: message,
            customerProfile: null,
            customerDocuments: [],
            selectedCustomerDocumentId: null,
          };
        });
      }
    })();
  };

  const closeDetailsModal = () => {
    if (customerDocPreview.objectUrl) {
      URL.revokeObjectURL(customerDocPreview.objectUrl);
    }

    setDetailsModal({
      open: false,
      loan: null,
      selectedDocumentId: null,
      activeTab: 'customer',
      customerLoading: false,
      customerError: '',
      customerProfile: null,
      customerDocuments: [],
      selectedCustomerDocumentId: null,
    });
    setCustomerDocPreview({ docId: null, objectUrl: '', loading: false, error: '' });
  };

  const openEditModal = (loan: LoanRequest) => {
    if (!canManageSensitiveLoanActions) {
      openModal('Only Finance Manager, Branch Manager, and Admin can edit loans.', 'Access Denied');
      return;
    }

    setEditModal({
      open: true,
      loanId: loan.id,
      loan_scope: loan.loan_scope || 'center_loan',
      mf_route_id: Number(loan.route?.id || loan.mf_route_id || 0),
      mf_center_id: Number(loan.center?.id || loan.mf_center_id || 0),
      mf_group_id: Number(loan.group?.id || loan.mf_group_id || 0),
      manager_name: String(loan.manager_name || ''),
      field_officer: String(loan.field_officer || ''),
      group_leader: String(loan.group_leader || ''),
      customer_name: String(loan.customer_name || ''),
      nick_name: String(loan.nick_name || ''),
      address: String(loan.address || ''),
      contact_no: String(loan.contact_no || ''),
      reason: String(loan.reason || ''),
      loan_amount: String(loan.loan_amount || ''),
      refund_option: loan.refund_option || 'month',
      interest_type: loan.interest_type || 'flat',
      interest_rate: String(loan.interest_rate || ''),
      terms_count: String(loan.terms_count || ''),
      refundable_amount: String(loan.refundable_amount || ''),
      installment_amount: String(loan.installment_amount || ''),
      document_charges: String(loan.document_charges || ''),
      stamp_charges: String(loan.stamp_charges || ''),
      insurance_charges: String(loan.insurance_charges || ''),
      charge_payment_mode: loan.charge_payment_mode || 'hand_cash',
      loan_request_date: String(loan.loan_request_date || '').slice(0, 10),
      next_collection_date: String(loan.due_date || loan.next_payment_date || '').slice(0, 10),
      loan_end_date: String(loan.loan_end_date || '').slice(0, 10),
      guarantors: Array.isArray(loan.guarantors) && loan.guarantors.length > 0
        ? loan.guarantors.map((g) => ({
            name: String(g.name || ''),
            nic: String(g.nic || ''),
            address: String(g.address || ''),
            contact_no: String(g.contact_no || ''),
            relationship: String(g.relationship || ''),
          }))
        : [{ name: '', nic: '', address: '', contact_no: '', relationship: '' }],
    });
    setEditStep(1);
  };

  const closeEditModal = () => {
    if (savingEdit) return;
    setEditModal((prev) => ({ ...prev, open: false, loanId: null }));
  };

  const updateEditField = (field: keyof typeof editModal, value: string) => {
    setEditModal((prev) => ({ ...prev, [field]: value }));
  };

  const saveLoanEdit = async () => {
    if (!editModal.loanId) return;
    if (!canManageSensitiveLoanActions) {
      openModal('Only Finance Manager, Branch Manager, and Admin can edit loans.', 'Access Denied');
      return;
    }

    try {
      setSavingEdit(true);
      const payload = {
        loan_scope: editModal.loan_scope,
        mf_route_id: editModal.loan_scope === 'direct_loan' ? null : (editModal.mf_route_id || null),
        mf_center_id: editModal.loan_scope === 'center_loan' ? (editModal.mf_center_id || null) : null,
        mf_group_id: editModal.loan_scope === 'center_loan' ? (editModal.mf_group_id || null) : null,
        manager_name: editModal.manager_name,
        field_officer: editModal.field_officer,
        group_leader: editModal.group_leader || null,
        customer_name: editModal.customer_name,
        nick_name: editModal.nick_name || null,
        address: editModal.address,
        contact_no: editModal.contact_no,
        reason: editModal.reason || null,
        loan_amount: Number(editModal.loan_amount || 0),
        refund_option: editModal.refund_option,
        interest_type: editModal.interest_type,
        interest_rate: Number(editModal.interest_rate || 0),
        terms_count: Number(editModal.terms_count || 0),
        refundable_amount: Number(editModal.refundable_amount || 0),
        installment_amount: Number(editModal.installment_amount || 0),
        document_charges: Number(editModal.document_charges || 0),
        stamp_charges: Number(editModal.stamp_charges || 0),
        insurance_charges: Number(editModal.insurance_charges || 0),
        charge_payment_mode: editModal.charge_payment_mode,
        loan_request_date: editModal.loan_request_date || null,
        loan_end_date: editModal.loan_end_date || null,
        next_payment_date: editModal.next_collection_date || null,
        due_date: editModal.next_collection_date || null,
        guarantors: editModal.guarantors.filter((g) => g.name.trim() !== ''),
      };

      const response = await axios.put(
        `${getApiBaseUrl()}/microfinance/loan-requests/${editModal.loanId}`,
        payload,
        { headers }
      );

      const updated = (response.data?.data ?? response.data) as LoanRequest;
      setLoans((prev) => prev.map((loan) => (loan.id === updated.id ? { ...loan, ...updated } : loan)));
      setEditModal((prev) => ({ ...prev, open: false, loanId: null }));
      openModal('Loan details updated successfully.', 'Success');
    } catch {
      openModal('Failed to update loan details. Please check required fields.', 'Error');
    } finally {
      setSavingEdit(false);
    }
  };

  const updateGuarantor = (index: number, field: 'name' | 'nic' | 'address' | 'contact_no' | 'relationship', value: string) => {
    setEditModal((prev) => ({
      ...prev,
      guarantors: prev.guarantors.map((g, i) => (i === index ? { ...g, [field]: value } : g)),
    }));
  };

  const addGuarantorRow = () => {
    setEditModal((prev) => ({
      ...prev,
      guarantors: [...prev.guarantors, { name: '', nic: '', address: '', contact_no: '', relationship: '' }],
    }));
  };

  const removeGuarantorRow = (index: number) => {
    setEditModal((prev) => ({
      ...prev,
      guarantors: prev.guarantors.filter((_, i) => i !== index),
    }));
  };

  const buildDocumentUrl = (filePath: string) => {
    const normalizedPath = (filePath || '').replace(/^public\//, '');
    return `${getBackendOrigin()}/storage/${normalizedPath}`;
  };

  const resolveDocumentPreviewType = (doc: { file_path?: string; original_name?: string }) => {
    const source = `${doc.original_name || ''} ${doc.file_path || ''}`.toLowerCase();
    if (/(\.png|\.jpe?g|\.webp|\.gif|\.bmp)/.test(source)) return 'image';
    if (/\.pdf/.test(source)) return 'pdf';
    return 'other';
  };

  const resolveDocumentUrl = (doc: { file_path?: string; file_url?: string | null }) => {
    const fromFilePath = String(doc.file_path || '').trim();
    if (fromFilePath !== '') {
      return buildDocumentUrl(fromFilePath);
    }

    const fromApi = String(doc.file_url || '').trim();
    if (fromApi !== '') {
      const normalizedApiPath = fromApi.replace('/storage/public/', '/storage/');
      if (fromApi.startsWith('http://') || fromApi.startsWith('https://')) {
        return normalizedApiPath;
      }
      if (normalizedApiPath.startsWith('/')) {
        return `${getBackendOrigin()}${normalizedApiPath}`;
      }
      return `${getBackendOrigin()}/${normalizedApiPath}`;
    }

    return '';
  };

  const resolveCustomerDocumentAccessUrl = (customerId: number, documentId: number) => {
    return `${getApiBaseUrl()}/customers/${customerId}/documents/${documentId}/download`;
  };

  const openDocumentInNewTab = async (url: string) => {
    if (!url) return;

    try {
      const response = await axios.get(url, {
        headers,
        responseType: 'blob',
      });

      const objectUrl = URL.createObjectURL(response.data as Blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      openModal('Unable to open document preview. Please try again.', 'Error');
    }
  };

  const pickDetailValue = (source: Record<string, unknown> | undefined, path: string) => {
    if (!source) return '';

    const segments = path.split('.');
    let cursor: unknown = source;

    for (const segment of segments) {
      if (!cursor || typeof cursor !== 'object') {
        return '';
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }

    if (cursor === null || cursor === undefined) return '';
    return String(cursor);
  };

  const detailsModalDocuments = useMemo<DetailsDocumentItem[]>(() => {
    if (!detailsModal.loan) return [];

    const loanDocuments = (detailsModal.loan.documents || []).map((doc) => ({
      id: `loan-${doc.id}`,
      source: 'loan' as const,
      document_type: String(doc.document_type || 'Document'),
      original_name: String(doc.original_name || doc.file_path || ''),
      file_path: String(doc.file_path || ''),
      access_url: resolveDocumentUrl(doc),
    }));

    const customerId = Number(detailsModal.customerProfile?.id || 0);
    const customerDocuments = detailsModal.customerDocuments.map((doc) => ({
      id: `customer-${doc.id}`,
      source: 'customer' as const,
      document_type: String(doc.document_type || 'Customer Document'),
      original_name: String(doc.original_name || doc.file_path || ''),
      file_path: String(doc.file_path || ''),
      access_url:
        customerId > 0 && Number(doc.id || 0) > 0
          ? resolveCustomerDocumentAccessUrl(customerId, Number(doc.id || 0))
          : resolveDocumentUrl(doc),
    }));

    const guarantorDocuments = (detailsModal.loan.guarantors || []).flatMap((guarantor, index) => {
      const rows: DetailsDocumentItem[] = [];
      const guarantorName = String(guarantor.name || `Guarantor ${index + 1}`);

      if (String(guarantor.image_url || '').trim() !== '') {
        rows.push({
          id: `guarantor-image-${detailsModal.loan?.id || 0}-${index}`,
          source: 'guarantor',
          document_type: `${guarantorName} Image`,
          original_name: String(guarantor.image_original_name || guarantor.image_url || ''),
          access_url: resolveAssetUrl(String(guarantor.image_url || '')),
        });
      }

      if (String(guarantor.signature_url || '').trim() !== '') {
        rows.push({
          id: `guarantor-signature-${detailsModal.loan?.id || 0}-${index}`,
          source: 'guarantor',
          document_type: `${guarantorName} Signature`,
          original_name: String(guarantor.signature_original_name || guarantor.signature_url || ''),
          access_url: resolveAssetUrl(String(guarantor.signature_url || '')),
        });
      }

      return rows;
    });

    return [...loanDocuments, ...customerDocuments, ...guarantorDocuments].filter(
      (doc) => String(doc.access_url || '').trim() !== ''
    );
  }, [detailsModal.loan, detailsModal.customerDocuments, detailsModal.customerProfile?.id]);

  const selectedDetailsDocument =
    detailsModalDocuments.find((doc) => doc.id === detailsModal.selectedDocumentId)
    || detailsModalDocuments[0]
    || null;
  const selectedDetailsDocumentType = selectedDetailsDocument ? resolveDocumentPreviewType(selectedDetailsDocument) : 'other';
  const selectedCustomerDocument = detailsModal.customerDocuments.find((doc) => doc.id === detailsModal.selectedCustomerDocumentId) || null;
  const selectedCustomerDocumentType = selectedCustomerDocument ? resolveDocumentPreviewType(selectedCustomerDocument) : 'other';

  useEffect(() => {
    const customerId = Number(detailsModal.customerProfile?.id || 0);
    const selectedDocId = Number(selectedCustomerDocument?.id || 0);

    if (!detailsModal.open || customerId <= 0 || selectedDocId <= 0 || !token) {
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      const url = resolveCustomerDocumentAccessUrl(customerId, selectedDocId);
      setCustomerDocPreview((prev) => {
        if (prev.objectUrl) {
          URL.revokeObjectURL(prev.objectUrl);
        }

        return {
          docId: selectedDocId,
          objectUrl: '',
          loading: true,
          error: '',
        };
      });

      try {
        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          responseType: 'blob',
        });

        if (cancelled) {
          return;
        }

        const objectUrl = URL.createObjectURL(response.data as Blob);
        setCustomerDocPreview({
          docId: selectedDocId,
          objectUrl,
          loading: false,
          error: '',
        });
      } catch {
        if (cancelled) {
          return;
        }

        setCustomerDocPreview({
          docId: selectedDocId,
          objectUrl: '',
          loading: false,
          error: 'Failed to load this document preview.',
        });
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [detailsModal.open, detailsModal.customerProfile?.id, selectedCustomerDocument?.id, token]);

  const handleDownloadAgreement = async (loanId: number, customerNo: string) => {
    if (!token) return;
    if (!canManageSensitiveLoanActions) {
      openModal('Only Finance Manager, Branch Manager, and Admin can download agreements.', 'Access Denied');
      return;
    }

    setDownloadingAgreementId(loanId);
    try {
      const response = await axios.get(
        `${getApiBaseUrl()}/microfinance/loan-requests/${loanId}/download-agreement`,
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
    } catch (error: any) {
      let message = 'Failed to download agreement.';
      const responseData = error?.response?.data;

      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          const parsed = JSON.parse(text);
          message = parsed?.message || message;
        } catch {
          // Keep default message.
        }
      } else if (responseData?.message) {
        message = responseData.message;
      }

      openModal(message, 'Error');
    } finally {
      setDownloadingAgreementId(null);
    }
  };

  const handleDownloadReminderLetter = async (loanId: number, customerNo: string) => {
    if (!token) return;
    if (!canManageSensitiveLoanActions) {
      openModal('Only Finance Manager, Branch Manager, and Admin can download reminder letters.', 'Access Denied');
      return;
    }

    setDownloadingReminderId(loanId);
    try {
      const response = await axios.get(
        `${getApiBaseUrl()}/microfinance/loan-requests/${loanId}/download-reminder-letter`,
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
      link.download = serverFileName || `reminder_letter_${customerNo || loanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      openModal('Reminder letter downloaded successfully.', 'Success');
    } catch (error: any) {
      let message = 'Failed to download reminder letter.';
      const responseData = error?.response?.data;

      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          const parsed = JSON.parse(text);
          message = parsed?.message || message;
        } catch {
          // Keep default message.
        }
      } else if (responseData?.message) {
        message = responseData.message;
      }

      openModal(message, 'Error');
    } finally {
      setDownloadingReminderId(null);
    }
  };

  const handleDownloadLegalLetter = async (loanId: number, customerNo: string) => {
    if (!token) return;
    if (!canManageSensitiveLoanActions) {
      openModal('Only Finance Manager, Branch Manager, and Admin can download legal letters.', 'Access Denied');
      return;
    }

    setDownloadingLegalId(loanId);
    try {
      const response = await axios.get(
        `${getApiBaseUrl()}/microfinance/loan-requests/${loanId}/download-legal-letter`,
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
      link.download = serverFileName || `legal_letter_${customerNo || loanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      openModal('Legal letter downloaded successfully.', 'Success');
    } catch (error: any) {
      let message = 'Failed to download legal letter.';
      const responseData = error?.response?.data;

      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          const parsed = JSON.parse(text);
          message = parsed?.message || message;
        } catch {
          // Keep default message.
        }
      } else if (responseData?.message) {
        message = responseData.message;
      }

      openModal(message, 'Error');
    } finally {
      setDownloadingLegalId(null);
    }
  };

  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [centerFilter, setCenterFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const collectionOfficerNameCandidates = useMemo(() => {
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

  const preferredCollectionOfficerName = useMemo(() => {
    const rawCandidates = [
      String(authUser?.name || '').trim(),
      [authUser?.employee?.first_name || '', authUser?.employee?.last_name || ''].join(' ').trim(),
      String(authUser?.employee?.email || '').trim(),
      String(authUser?.email || '').trim(),
    ].filter((value, index, arr) => value !== '' && arr.indexOf(value) === index);

    return rawCandidates[0] || '';
  }, [authUser]);

  const canManageSensitiveLoanActions = useMemo(() => {
    const email = normalizeText(String(authUser?.email || ''));
    if (email === 'superadmin softcodelk com') {
      return true;
    }

    const allowedRoleKeywords = ['finance manager', 'branch manager', 'admin'];
    const roleNames = (authUser?.roles || []).map((role) => normalizeText(String(role?.name || '')));
    const designationName = normalizeText(String(authUser?.designation?.name || ''));

    const hasAllowedRole = roleNames.some((roleName) =>
      allowedRoleKeywords.some((keyword) => roleName.includes(keyword))
    );
    const hasAllowedDesignation = allowedRoleKeywords.some((keyword) => designationName.includes(keyword));

    return hasAllowedRole || hasAllowedDesignation;
  }, [authUser]);

  const isSuperAdmin = useMemo(() => {
    const email = normalizeText(String(authUser?.email || ''));
    if (email === 'superadmin softcodelk com') {
      return true;
    }

    const roleNames = (authUser?.roles || []).map((role) => normalizeText(String(role?.name || '')));
    return roleNames.some((roleName) =>
      ['super admin', 'superadmin', 'system admin'].some((keyword) => roleName.includes(keyword))
    );
  }, [authUser]);

  const [removingLoanId, setRemovingLoanId] = useState<number | null>(null);
  const confirmRemoveLoan = async () => {
    if (!isSuperAdmin || !removeConfirmModal.loanId) return;

    const loanId = removeConfirmModal.loanId;
    closeRemoveConfirmModal();
    setRemovingLoanId(loanId);

    try {
      await axios.delete(`${getApiBaseUrl()}/microfinance/loan-requests/${loanId}`, { headers });
      setLoans((prev) => prev.filter((loan) => loan.id !== loanId));
      openModal('Loan removed successfully.', 'Success');
    } catch {
      openModal('Failed to remove loan.', 'Error');
    } finally {
      setRemovingLoanId(null);
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
    } else {
      setAuthUser(null);
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadApprovedLoans = async () => {
      setLoading(true);
      setCollectionsError('');
      try {
        const [loanRes, collectionRes] = await Promise.all([
          axios.get(`${getApiBaseUrl()}/microfinance/loan-requests`, {
            headers,
            params: {
              ...(isCollectionOfficer && preferredCollectionOfficerName
                ? { field_officer: preferredCollectionOfficerName }
                : {}),
            },
          }),
          axios.get(`${getApiBaseUrl()}/microfinance/collections`, { headers }),
        ]);

        const loanRows = Array.isArray(loanRes.data) ? loanRes.data : [];
        setLoans(
          loanRows.filter((loan: LoanRequest) => ACTIVE_LOAN_STATUSES.has(String(loan.status || '').toLowerCase()))
        );
        setCollections(Array.isArray(collectionRes.data) ? collectionRes.data : []);
      } catch {
        setLoans([]);
        setCollections([]);
        setCollectionsError('Failed to load loans or collection transactions.');
        openModal('Failed to load approved loans.', 'Error');
      } finally {
        setLoading(false);
      }
    };

    loadApprovedLoans();
  }, [token, headers, isCollectionOfficer, preferredCollectionOfficerName]);

  const scopedLoans = useMemo(() => {
    if (!isCollectionOfficer) {
      return loans;
    }

    if (collectionOfficerNameCandidates.length === 0) {
      return [];
    }

    return loans.filter((loan) => {
      const loanOfficerName = normalizeText(String(loan.field_officer || ''));
      if (!loanOfficerName) {
        return false;
      }

      return collectionOfficerNameCandidates.includes(loanOfficerName);
    });
  }, [loans, isCollectionOfficer, collectionOfficerNameCandidates]);

  useEffect(() => {
    if (!token) return;

    const loadMasterData = async () => {
      try {
        const [routeRes, centerRes, groupRes, employeeRes] = await Promise.all([
          axios.get(`${getApiBaseUrl()}/microfinance/settings/routes`, { headers }),
          axios.get(`${getApiBaseUrl()}/microfinance/settings/centers`, { headers }),
          axios.get(`${getApiBaseUrl()}/microfinance/settings/groups`, { headers }),
          axios.get(`${getApiBaseUrl()}/hr/employees`, { headers }),
        ]);

        setRoutes(Array.isArray(routeRes.data) ? routeRes.data : []);
        setCenters(Array.isArray(centerRes.data) ? centerRes.data : []);
        setGroups(Array.isArray(groupRes.data) ? groupRes.data : []);

        const employeeRows = Array.isArray(employeeRes.data?.data) ? employeeRes.data.data : [];
        const mapped: EmployeeOption[] = employeeRows
          .map((emp: any) => ({
            id: Number(emp?.id || 0),
            name: `${emp?.first_name || ''} ${emp?.last_name || ''}`.trim() || emp?.email || '',
            designation: String(emp?.designation?.name || ''),
          }))
          .filter((emp: EmployeeOption) => emp.id > 0 && emp.name);

        const managerOnly = mapped.filter((emp) => /manager/i.test(emp.designation));
        const officerOnly = mapped.filter((emp) => /officer/i.test(emp.designation));

        setManagers(managerOnly.length > 0 ? managerOnly : mapped);
        setFieldOfficers(officerOnly.length > 0 ? officerOnly : mapped);
      } catch {
        // keep fallbacks empty
      }
    };

    loadMasterData();
  }, [token, headers]);

  const routeOptions = useMemo(() => {
    const routeMap = new Map<number, string>();
    scopedLoans.forEach((loan) => {
      if (loan.route?.id && loan.route?.name) {
        routeMap.set(loan.route.id, loan.route.name);
      }
    });
    return Array.from(routeMap.entries()).map(([id, name]) => ({ id, name }));
  }, [scopedLoans]);

  const centerOptions = useMemo(() => {
    const centerMap = new Map<number, { id: number; name: string; routeId: number | null }>();
    scopedLoans.forEach((loan) => {
      if (loan.center?.id && loan.center?.name) {
        centerMap.set(loan.center.id, {
          id: loan.center.id,
          name: loan.center.name,
          routeId: loan.route?.id ?? null,
        });
      }
    });

    const selectedRouteId = routeFilter === 'all' ? null : Number(routeFilter);
    return Array.from(centerMap.values()).filter((center) => {
      if (!selectedRouteId) return true;
      return center.routeId === selectedRouteId;
    });
  }, [scopedLoans, routeFilter]);

  const editSteps = [
    { id: 1, label: 'Location' },
    { id: 2, label: 'Team' },
    { id: 3, label: 'Customer' },
    { id: 4, label: 'Guarantors' },
    { id: 5, label: 'Loan Details' },
  ] as const;

  const editFilteredCenters = useMemo(
    () => centers.filter((c) => c.mf_route_id === editModal.mf_route_id),
    [centers, editModal.mf_route_id]
  );
  const editFilteredGroups = useMemo(
    () => groups.filter((g) => g.mf_route_id === editModal.mf_route_id && g.mf_center_id === editModal.mf_center_id),
    [groups, editModal.mf_route_id, editModal.mf_center_id]
  );

  const editTermUnitLabel =
    editModal.refund_option === 'day' ? 'Days' : editModal.refund_option === 'week' ? 'Weeks' : 'Months';

  const editFieldClass = 'px-3 py-2 rounded-lg border border-cyan-100 text-sm w-full';
  const editLabelClass = 'block mb-1.5 text-[0.78rem] font-bold uppercase tracking-wide text-slate-800';

  useEffect(() => {
    if (!editModal.open) return;

    const amount = Number(editModal.loan_amount || 0);
    const rate = Number(editModal.interest_rate || 0);
    const termCount = Number(editModal.terms_count || 0);

    let monthsEquivalent = termCount;
    if (editModal.refund_option === 'week') {
      monthsEquivalent = termCount / 4;
    } else if (editModal.refund_option === 'day') {
      monthsEquivalent = termCount / 26;
    }

    const monthlyRate = rate / 100;
    let refundable = 0;
    let installment = 0;

    if (editModal.interest_type === 'reducing') {
      const periodsPerMonth = editModal.refund_option === 'day' ? 26 : editModal.refund_option === 'week' ? 4 : 1;
      const periodicRate = monthlyRate / periodsPerMonth;

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
      refundable = amount + amount * monthlyRate * monthsEquivalent;
      installment = termCount > 0 ? refundable / termCount : 0;
    }

    setEditModal((prev) => ({
      ...prev,
      refundable_amount: refundable ? refundable.toFixed(2) : '',
      installment_amount: installment ? installment.toFixed(2) : '',
    }));
  }, [editModal.open, editModal.loan_amount, editModal.interest_rate, editModal.terms_count, editModal.refund_option, editModal.interest_type]);

  const filteredLoans = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const selectedRouteId = routeFilter === 'all' ? null : Number(routeFilter);
    const selectedCenterId = centerFilter === 'all' ? null : Number(centerFilter);

    return scopedLoans.filter((loan) => {
      if (scopeFilter !== 'all' && loan.loan_scope !== scopeFilter) return false;
      if (selectedRouteId && loan.route?.id !== selectedRouteId) return false;
      if (selectedCenterId && loan.center?.id !== selectedCenterId) return false;

      if (fromDate && loan.loan_request_date < fromDate) return false;
      if (toDate && loan.loan_request_date > toDate) return false;

      if (keyword) {
        const haystack = [
          loan.customer_no,
          loan.customer_name,
          loan.route?.name || '',
          loan.center?.name || '',
          loan.group?.name || '',
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(keyword)) return false;
      }

      return true;
    });
  }, [scopedLoans, query, scopeFilter, routeFilter, centerFilter, fromDate, toDate]);

  const loanLookup = useMemo(() => {
    const map = new Map<number, LoanRequest>();
    scopedLoans.forEach((loan) => {
      map.set(Number(loan.id), loan);
    });
    return map;
  }, [scopedLoans]);

  const collectionTransactions = useMemo(() => {
    const scopedLoanIds = new Set(scopedLoans.map((loan) => Number(loan.id)));

    return collections
      .map((collection) => {
        const loanId = Number(collection.mf_loan_request_id || 0);
        if (!scopedLoanIds.has(loanId)) {
          return null;
        }

        const loan = loanLookup.get(loanId);
        const interest = Number(collection.interest_amount || 0);
        const penalty = Number(collection.penalty_amount || 0);
        const profit =
          collection.profit_amount != null && collection.profit_amount !== ''
            ? Number(collection.profit_amount)
            : interest;

        return {
          id: Number(collection.id),
          date: String(collection.collection_date || collection.created_at || ''),
          loanId,
          loanCode: String(loan?.customer_no || `LR-${loanId}`),
          customerNo: String(loan?.customer_no || '-'),
          customerName: String(loan?.customer_name || '-'),
          fieldOfficer: String(loan?.field_officer || 'Unassigned'),
          collected: Number(collection.collected_amount || 0),
          capital: Number(collection.capital_amount || 0),
          profit,
          penalty,
          paymentType: String(collection.payment_type || '-').replace(/_/g, ' '),
          reference: String(collection.payment_reference || '-'),
        } satisfies CollectionTransaction;
      })
      .filter((row): row is CollectionTransaction => row !== null)
      .sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
  }, [collections, scopedLoans, loanLookup]);

  const filteredTransactions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return collectionTransactions.filter((row) => {
      const rowDate = row.date ? new Date(row.date) : null;
      if (from && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate < from) {
        return false;
      }
      if (to && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate > to) {
        return false;
      }

      if (keyword) {
        const haystack = [row.loanCode, row.customerNo, row.customerName, row.fieldOfficer, row.reference, row.paymentType]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      return true;
    });
  }, [collectionTransactions, fromDate, toDate, query]);

  const transactionSummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let totalCollected = 0;
    let totalCapital = 0;
    let totalProfit = 0;
    let totalPenalty = 0;
    let todayCollected = 0;
    const officers = new Set<string>();

    filteredTransactions.forEach((row) => {
      totalCollected += row.collected;
      totalCapital += row.capital;
      totalProfit += row.profit;
      totalPenalty += row.penalty;

      if (String(row.date).slice(0, 10) === today) {
        todayCollected += row.collected;
      }

      if (row.fieldOfficer && row.fieldOfficer !== 'Unassigned') {
        officers.add(row.fieldOfficer);
      }
    });

    return {
      transactionCount: filteredTransactions.length,
      totalCollected,
      totalCapital,
      totalProfit,
      totalPenalty,
      todayCollected,
      officerCount: officers.size,
    };
  }, [filteredTransactions]);

  const formatMoney = (value: number) =>
    Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatTransactionDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value || '-';
    }

    return new Intl.DateTimeFormat('en-LK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [query, scopeFilter, routeFilter, centerFilter, fromDate, toDate, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredLoans.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedLoans = filteredLoans.slice(startIndex, startIndex + pageSize);
  const showHeaderWidget = !hiddenWidgetKeys.has(`${widgetPrefix}header`);
  const showFiltersWidget = !hiddenWidgetKeys.has(`${widgetPrefix}filters`);
  const showTransactionsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}transactions`);
  const showResultsMetaWidget = !hiddenWidgetKeys.has(`${widgetPrefix}results_meta`);
  const showPaginationWidget = !hiddenWidgetKeys.has(`${widgetPrefix}pagination`);
  const transactionCards: Array<{
    key: string;
    title: string;
    value: string;
    cardClass: string;
    titleClass: string;
    valueClass: string;
    note?: string;
    noteClass?: string;
  }> = [
    {
      key: 'txn_card_transactions',
      title: 'Transactions',
      value: String(transactionSummary.transactionCount),
      cardClass: 'rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm',
      titleClass: 'text-[0.68rem] font-bold uppercase tracking-wide text-slate-500',
      valueClass: 'mt-1 text-lg font-extrabold text-slate-900',
    },
    {
      key: 'txn_card_total_collected',
      title: 'Total Collected',
      value: formatMoney(transactionSummary.totalCollected),
      cardClass: 'rounded-xl border border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/60 p-3 shadow-sm',
      titleClass: 'text-[0.68rem] font-bold uppercase tracking-wide text-emerald-700',
      valueClass: 'mt-1 text-sm sm:text-base font-extrabold text-emerald-800',
    },
    {
      key: 'txn_card_capital',
      title: 'Capital',
      value: formatMoney(transactionSummary.totalCapital),
      cardClass: 'rounded-xl border border-blue-200/80 bg-gradient-to-br from-white to-blue-50/60 p-3 shadow-sm',
      titleClass: 'text-[0.68rem] font-bold uppercase tracking-wide text-blue-700',
      valueClass: 'mt-1 text-sm sm:text-base font-extrabold text-blue-800',
    },
    {
      key: 'txn_card_profit',
      title: 'Profit (Interest)',
      value: formatMoney(transactionSummary.totalProfit),
      cardClass: 'rounded-xl border border-violet-200/80 bg-gradient-to-br from-white to-violet-50/60 p-3 shadow-sm',
      titleClass: 'text-[0.68rem] font-bold uppercase tracking-wide text-violet-700',
      valueClass: 'mt-1 text-sm sm:text-base font-extrabold text-violet-800',
    },
    {
      key: 'txn_card_penalty',
      title: 'Penalty',
      value: formatMoney(transactionSummary.totalPenalty),
      cardClass: 'rounded-xl border border-amber-200/80 bg-gradient-to-br from-white to-amber-50/60 p-3 shadow-sm',
      titleClass: 'text-[0.68rem] font-bold uppercase tracking-wide text-amber-700',
      valueClass: 'mt-1 text-sm sm:text-base font-extrabold text-amber-800',
    },
    {
      key: 'txn_card_today_officers',
      title: 'Today / Officers',
      value: formatMoney(transactionSummary.todayCollected),
      note: `${transactionSummary.officerCount} officer(s)`,
      cardClass: 'rounded-xl border border-cyan-200/80 bg-gradient-to-br from-white to-cyan-50/60 p-3 shadow-sm sm:col-span-2 xl:col-span-1',
      titleClass: 'text-[0.68rem] font-bold uppercase tracking-wide text-cyan-700',
      valueClass: 'mt-1 text-sm sm:text-base font-extrabold text-cyan-800',
      noteClass: 'text-xs text-slate-500 mt-0.5',
    },
  ];
  const visibleTransactionCards = transactionCards.filter(
    (card) => !hiddenWidgetKeys.has(`${widgetPrefix}${card.key}`)
  );
  const transactionColumns = [
    { key: 'date', label: 'Date', headerClass: 'px-3 py-2.5 font-semibold', cellClass: 'px-3 py-2 whitespace-nowrap text-slate-700' },
    { key: 'loanCode', label: 'Loan Code', headerClass: 'px-3 py-2.5 font-semibold', cellClass: 'px-3 py-2 font-medium text-slate-900' },
    { key: 'customerName', label: 'Customer', headerClass: 'px-3 py-2.5 font-semibold', cellClass: 'px-3 py-2 text-slate-700' },
    { key: 'fieldOfficer', label: 'Officer', headerClass: 'px-3 py-2.5 font-semibold', cellClass: 'px-3 py-2 text-slate-600' },
    { key: 'paymentType', label: 'Pay Type', headerClass: 'px-3 py-2.5 font-semibold', cellClass: 'px-3 py-2 capitalize text-slate-600' },
    { key: 'collected', label: 'Collected', headerClass: 'px-3 py-2.5 font-semibold text-right', cellClass: 'px-3 py-2 text-right font-semibold text-emerald-700' },
    { key: 'capital', label: 'Capital', headerClass: 'px-3 py-2.5 font-semibold text-right', cellClass: 'px-3 py-2 text-right text-blue-700' },
    { key: 'profit', label: 'Profit', headerClass: 'px-3 py-2.5 font-semibold text-right', cellClass: 'px-3 py-2 text-right font-semibold text-violet-700' },
    { key: 'penalty', label: 'Penalty', headerClass: 'px-3 py-2.5 font-semibold text-right', cellClass: 'px-3 py-2 text-right text-amber-700' },
  ] as const;
  const visibleTransactionColumns = transactionColumns.filter(
    (column) => !hiddenWidgetKeys.has(`${widgetPrefix}txn_col_${column.key}`)
  );
  const visiblePaginatedLoans = paginatedLoans.filter(
    (loan) => !hiddenWidgetKeys.has(`${widgetPrefix}loan_card_${loan.id}`)
  );
  const renderTransactionCellValue = (row: CollectionTransaction, key: (typeof transactionColumns)[number]['key']) => {
    if (key === 'date') return formatTransactionDate(row.date);
    if (key === 'loanCode') return row.loanCode;
    if (key === 'customerName') return row.customerName;
    if (key === 'fieldOfficer') return row.fieldOfficer;
    if (key === 'paymentType') return row.paymentType;
    if (key === 'collected') return formatMoney(row.collected);
    if (key === 'capital') return formatMoney(row.capital);
    if (key === 'profit') return formatMoney(row.profit);
    return formatMoney(row.penalty);
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 p-6">
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
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Approved Loans</h1>
            <p className="text-sm text-gray-600 mt-1">View all approved loan records and filter quickly.</p>
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
        <div className="bg-white/90 rounded-2xl shadow-lg border border-cyan-100 p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 text-black relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide filters widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <input
            className="px-3 py-2 rounded-lg border border-cyan-100 text-sm text-black"
            placeholder="Search customer / no"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="px-3 py-2 rounded-lg border border-cyan-100 text-sm text-black" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
            <option value="all">All Scopes</option>
            <option value="center_loan">Center Loan</option>
            <option value="route_loan">Route Loan</option>
            <option value="direct_loan">Direct Loan</option>
          </select>
          <select
            className="px-3 py-2 rounded-lg border border-cyan-100 text-sm text-black"
            value={routeFilter}
            onChange={(e) => {
              setRouteFilter(e.target.value);
              setCenterFilter('all');
            }}
          >
            <option value="all">All Routes</option>
            {routeOptions.map((route) => (
              <option key={route.id} value={route.id}>{route.name}</option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-lg border border-cyan-100 text-sm text-black"
            value={centerFilter}
            onChange={(e) => setCenterFilter(e.target.value)}
          >
            <option value="all">All Centers</option>
            {centerOptions.map((center) => (
              <option key={center.id} value={center.id}>{center.name}</option>
            ))}
          </select>
          <input className="px-3 py-2 rounded-lg border border-cyan-100 text-sm text-black" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input className="px-3 py-2 rounded-lg border border-cyan-100 text-sm text-black" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        )}

        {showTransactionsWidget && (
        <div className="bg-white/95 rounded-2xl shadow-lg border border-cyan-100 p-4 sm:p-5 space-y-4 relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}transactions`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide transactions widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Collection Transactions</h2>
              <p className="text-sm text-gray-600">
                Payment history for active loans. Profit follows interest realized on each collection (same as mortgage profit report).
              </p>
            </div>
            <p className="text-sm text-gray-600">
              Showing <span className="font-bold text-cyan-700">{transactionSummary.transactionCount}</span> transaction(s)
            </p>
          </div>

          {collectionsError ? (
            <p className="text-sm text-rose-600">{collectionsError}</p>
          ) : null}

          {visibleTransactionCards.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              All transaction summary cards are hidden. Restore hidden widgets from dashboard.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
              {visibleTransactionCards.map((card) => (
                <div key={card.key} className={`${card.cardClass} relative`}>
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => void hideWidget(`${widgetPrefix}${card.key}`)}
                      className="absolute right-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`Hide ${card.title} summary widget`}
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <p className={card.titleClass}>{card.title}</p>
                  <p className={card.valueClass}>{card.value}</p>
                  {card.note ? <p className={card.noteClass}>{card.note}</p> : null}
                </div>
              ))}
            </div>
          )}

          {visibleTransactionColumns.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              All transaction table columns are hidden. Restore hidden widgets from dashboard.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-red-700 text-left text-white">
                    {visibleTransactionColumns.map((column) => (
                      <th key={column.key} className={`${column.headerClass} relative`}>
                        {column.label}
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void hideWidget(`${widgetPrefix}txn_col_${column.key}`);
                            }}
                            className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-white/20 text-[10px] font-bold text-white transition hover:bg-white hover:text-rose-700"
                            aria-label={`Hide ${column.label} column`}
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={visibleTransactionColumns.length} className="px-3 py-8 text-center text-slate-500">
                        No collection transactions found for the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.slice(0, 50).map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60">
                        {visibleTransactionColumns.map((column) => (
                          <td key={`${row.id}-${column.key}`} className={column.cellClass}>
                            {renderTransactionCellValue(row, column.key)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          {filteredTransactions.length > 50 ? (
            <p className="text-xs text-slate-500">Showing latest 50 of {filteredTransactions.length} transactions. Use date filters to narrow results.</p>
          ) : null}
        </div>
        )}

        {showResultsMetaWidget && (
        <div className="flex items-center justify-between gap-3 relative rounded-xl p-2">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}results_meta`)}
              className="absolute -right-1 -top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide results meta widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <p className="text-sm text-gray-600">
            Showing {filteredLoans.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredLoans.length)} of {filteredLoans.length}
          </p>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Rows:</label>
            <select
              className="px-2 py-1 rounded-md border border-cyan-100 text-sm text-black"
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

        {filteredLoans.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center text-gray-600">
            No approved loans found for selected filters.
          </div>
        ) : visiblePaginatedLoans.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-lg p-8 text-center text-amber-800">
            All released loan widgets are hidden for this page. Restore hidden widgets from dashboard to show them.
          </div>
        ) : (
          <div className="space-y-4">
            {visiblePaginatedLoans.map((loan) => (
              <div key={loan.id} className="bg-white/90 rounded-2xl shadow-lg border border-cyan-100 p-4 sm:p-5 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}loan_card_${loan.id}`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide released loan widget ${loan.customer_no}`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <h2 className="text-lg font-bold text-gray-900">{loan.customer_name}</h2>
                    <p className="text-sm text-gray-600">Loan Code: {loan.customer_no}</p>
                    <p className="text-sm text-gray-600">
                      Scope: {loan.loan_scope === 'center_loan' ? 'Center Loan' : loan.loan_scope === 'route_loan' ? 'Route Loan' : 'Direct Loan'}
                    </p>
                    <p className="text-sm text-gray-600 break-words">
                      Route: {loan.route?.name || '-'} | Center: {loan.center?.name || '-'} | Group: {loan.group?.name || '-'}
                    </p>
                  </div>

                  <div className="w-full lg:w-auto lg:min-w-[22rem] text-left lg:text-right">
                    <div className="mb-2 flex flex-wrap justify-start lg:justify-end gap-2">
                      {canManageSensitiveLoanActions && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDownloadAgreement(loan.id, loan.customer_no)}
                            disabled={downloadingAgreementId === loan.id}
                            className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {downloadingAgreementId === loan.id ? 'Downloading...' : 'Download Agreement'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadReminderLetter(loan.id, loan.customer_no)}
                            disabled={downloadingReminderId === loan.id}
                            className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {downloadingReminderId === loan.id ? 'Downloading...' : 'Reminder Letter'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadLegalLetter(loan.id, loan.customer_no)}
                            disabled={downloadingLegalId === loan.id}
                            className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {downloadingLegalId === loan.id ? 'Downloading...' : 'Legal Letter'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(loan)}
                            className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold"
                          >
                            Edit Loan
                          </button>
                        </>
                      )}
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => openRemoveConfirmModal(loan)}
                          disabled={removingLoanId === loan.id}
                          className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-800 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {removingLoanId === loan.id ? 'Removing...' : 'Remove Loan'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openDocumentsModal(loan)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 text-xs font-semibold"
                      >
                        <EyeIcon className="h-3.5 w-3.5" />
                        <span>View Documents ({Array.isArray(loan.documents) ? loan.documents.length : 0})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openDetailsModal(loan)}
                        className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold"
                      >
                        View More Details
                      </button>
                    </div>
                    <p className="text-sm text-gray-600">Loan Amount</p>
                    <p className="text-xl font-extrabold text-cyan-700">{Number(loan.loan_amount || 0).toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {loan.interest_type} | {Number(loan.interest_rate || 0)}% | {loan.terms_count} {loan.refund_option}(s)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3 mt-4">
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Refundable</p>
                    <p className="text-sm font-bold text-gray-900">{Number(loan.refundable_amount || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Installment</p>
                    <p className="text-sm font-bold text-gray-900">{Number(loan.installment_amount || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Loan Request Date</p>
                    <p className="text-sm font-bold text-gray-900">{formatDisplayDate(loan.loan_request_date)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Next Payment Date</p>
                    <p className="text-sm font-bold text-gray-900">{formatDisplayDate(loan.next_payment_date)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Due Date</p>
                    <p className="text-sm font-bold text-gray-900">{formatDisplayDate(loan.due_date)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Loan End Date</p>
                    <p className="text-sm font-bold text-gray-900">{formatDisplayDate(loan.loan_end_date)}</p>
                  </div>
                  <div className="rounded-lg bg-cyan-50 border border-cyan-100 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Approved Status</p>
                    <p className="text-sm font-bold text-emerald-700 capitalize">{loan.status}</p>
                  </div>
                </div>
              </div>
            ))}

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
                className="px-3 py-1.5 rounded-lg border border-cyan-100 bg-white text-sm text-gray-700 disabled:opacity-50"
              >
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .map((page, idx, arr) => {
                  const prevPage = idx > 0 ? arr[idx - 1] : null;
                  const showGap = prevPage !== null && page - prevPage > 1;

                  return (
                    <div key={page} className="flex items-center gap-2">
                      {showGap && <span className="text-sm text-gray-500">...</span>}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg text-sm ${
                          safePage === page
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                            : 'border border-cyan-100 bg-white text-gray-700'
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}

              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-cyan-100 bg-white text-sm text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            )}
          </div>
        )}

        {removeConfirmModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-red-100">
              <h3 className="text-lg font-bold text-slate-900">Remove Loan</h3>
              <p className="mt-2 text-sm text-slate-600">
                Are you sure you want to remove this loan? This action cannot be undone.
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-800">{removeConfirmModal.customerName}</p>
              <p className="text-xs text-slate-500">Loan Code: {removeConfirmModal.customerNo}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRemoveConfirmModal}
                  disabled={removingLoanId === removeConfirmModal.loanId}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemoveLoan}
                  disabled={removingLoanId === removeConfirmModal.loanId}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {removingLoanId === removeConfirmModal.loanId ? 'Removing...' : 'Remove Loan'}
                </button>
              </div>
            </div>
          </div>
        )}

        {modal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-cyan-100">
              <h3 className="text-lg font-bold text-slate-900">{modal.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{modal.message}</p>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {editModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl border border-cyan-100 max-h-[90vh] overflow-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Edit Loan Details</h3>
                  <p className="text-sm text-slate-600 mt-1">Step based full editor, same style as Request Loan.</p>
                </div>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {editSteps.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setEditStep(step.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${editStep === step.id ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-700 border-cyan-100'}`}
                  >
                    {step.id}. {step.label}
                  </button>
                ))}
              </div>

              {editStep === 1 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-black">
                  <div>
                    <label className={editLabelClass} htmlFor="edit-loan-scope">Loan Scope</label>
                    <select
                      id="edit-loan-scope"
                      className={editFieldClass}
                      value={editModal.loan_scope}
                      onChange={(e) => {
                        const nextScope = e.target.value as 'route_loan' | 'center_loan' | 'direct_loan';
                        setEditModal((prev) => ({
                          ...prev,
                          loan_scope: nextScope,
                          mf_route_id: 0,
                          mf_center_id: 0,
                          mf_group_id: 0,
                        }));
                      }}
                    >
                      <option value="center_loan">Center Loan</option>
                      <option value="route_loan">Route Loan</option>
                      <option value="direct_loan">Direct Loan</option>
                    </select>
                  </div>

                  {editModal.loan_scope !== 'direct_loan' && (
                    <div>
                      <label className={editLabelClass} htmlFor="edit-route">Route</label>
                      <select
                        id="edit-route"
                        className={editFieldClass}
                        value={editModal.mf_route_id}
                        onChange={(e) => setEditModal((prev) => ({ ...prev, mf_route_id: Number(e.target.value), mf_center_id: 0, mf_group_id: 0 }))}
                      >
                        <option value={0}>Select Route</option>
                        {routes.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                      </select>
                    </div>
                  )}

                  {editModal.loan_scope === 'center_loan' && (
                    <div>
                      <label className={editLabelClass} htmlFor="edit-center">Center</label>
                      <select
                        id="edit-center"
                        className={editFieldClass}
                        value={editModal.mf_center_id}
                        onChange={(e) => setEditModal((prev) => ({ ...prev, mf_center_id: Number(e.target.value), mf_group_id: 0 }))}
                      >
                        <option value={0}>Select Center</option>
                        {editFilteredCenters.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                      </select>
                    </div>
                  )}

                  {editModal.loan_scope === 'center_loan' && (
                    <div>
                      <label className={editLabelClass} htmlFor="edit-group">Group</label>
                      <select
                        id="edit-group"
                        className={editFieldClass}
                        value={editModal.mf_group_id}
                        onChange={(e) => setEditModal((prev) => ({ ...prev, mf_group_id: Number(e.target.value) }))}
                      >
                        <option value={0}>Select Group</option>
                        {editFilteredGroups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {editStep === 2 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-black">
                  <div>
                    <label className={editLabelClass} htmlFor="edit-manager">Manager</label>
                    <select
                      id="edit-manager"
                      className={editFieldClass}
                      value={editModal.manager_name}
                      onChange={(e) => updateEditField('manager_name', e.target.value)}
                    >
                      <option value="">Select Manager</option>
                      {managers.map((m) => <option key={m.id} value={m.name}>{m.name}{m.designation ? ` (${m.designation})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-field-officer">Field Officer</label>
                    <select
                      id="edit-field-officer"
                      className={editFieldClass}
                      value={editModal.field_officer}
                      onChange={(e) => updateEditField('field_officer', e.target.value)}
                    >
                      <option value="">Select Field Officer</option>
                      {fieldOfficers.map((o) => <option key={o.id} value={o.name}>{o.name}{o.designation ? ` (${o.designation})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-group-leader">Group Leader</label>
                    <input
                      id="edit-group-leader"
                      className={editFieldClass}
                      value={editModal.group_leader}
                      onChange={(e) => updateEditField('group_leader', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {editStep === 3 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-black">
                  <div>
                    <label className={editLabelClass} htmlFor="edit-customer-name">Customer Name</label>
                    <input
                      id="edit-customer-name"
                      className={editFieldClass}
                      value={editModal.customer_name}
                      onChange={(e) => updateEditField('customer_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-nick-name">Nick Name</label>
                    <input
                      id="edit-nick-name"
                      className={editFieldClass}
                      value={editModal.nick_name}
                      onChange={(e) => updateEditField('nick_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-contact-no">Contact No</label>
                    <input
                      id="edit-contact-no"
                      className={editFieldClass}
                      value={editModal.contact_no}
                      onChange={(e) => updateEditField('contact_no', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-loan-request-date">Loan Request Date</label>
                    <input
                      id="edit-loan-request-date"
                      className={editFieldClass}
                      type="date"
                      value={editModal.loan_request_date}
                      onChange={(e) => updateEditField('loan_request_date', e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={editLabelClass} htmlFor="edit-address">Address</label>
                    <input
                      id="edit-address"
                      className={editFieldClass}
                      value={editModal.address}
                      onChange={(e) => updateEditField('address', e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={editLabelClass} htmlFor="edit-reason">Reason</label>
                    <input
                      id="edit-reason"
                      className={editFieldClass}
                      value={editModal.reason}
                      onChange={(e) => updateEditField('reason', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {editStep === 4 && (
                <div className="mt-4 space-y-3 text-black">
                  <div className="flex justify-end">
                    <button type="button" onClick={addGuarantorRow} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold">+ Add Guarantor</button>
                  </div>
                  {editModal.guarantors.map((g, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 rounded-lg border border-cyan-100 p-3">
                      <div>
                        <label className={editLabelClass} htmlFor={`edit-guarantor-name-${index}`}>Guarantor Name</label>
                        <input
                          id={`edit-guarantor-name-${index}`}
                          className={editFieldClass}
                          value={g.name}
                          onChange={(e) => updateGuarantor(index, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={editLabelClass} htmlFor={`edit-guarantor-nic-${index}`}>NIC</label>
                        <input
                          id={`edit-guarantor-nic-${index}`}
                          className={editFieldClass}
                          value={g.nic}
                          onChange={(e) => updateGuarantor(index, 'nic', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={editLabelClass} htmlFor={`edit-guarantor-contact-${index}`}>Contact No</label>
                        <input
                          id={`edit-guarantor-contact-${index}`}
                          className={editFieldClass}
                          value={g.contact_no}
                          onChange={(e) => updateGuarantor(index, 'contact_no', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={editLabelClass} htmlFor={`edit-guarantor-relationship-${index}`}>Relationship</label>
                        <input
                          id={`edit-guarantor-relationship-${index}`}
                          className={editFieldClass}
                          value={g.relationship}
                          onChange={(e) => updateGuarantor(index, 'relationship', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={editLabelClass} htmlFor={`edit-guarantor-address-${index}`}>Address</label>
                        <div className="flex gap-2">
                          <input
                            id={`edit-guarantor-address-${index}`}
                            className={editFieldClass}
                            value={g.address}
                            onChange={(e) => updateGuarantor(index, 'address', e.target.value)}
                          />
                          {editModal.guarantors.length > 1 && (
                            <button type="button" onClick={() => removeGuarantorRow(index)} className="shrink-0 px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-semibold self-end">Remove</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {editStep === 5 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-black">
                  <div>
                    <label className={editLabelClass} htmlFor="edit-loan-amount">Loan Amount</label>
                    <input
                      id="edit-loan-amount"
                      className={editFieldClass}
                      type="number"
                      min="0"
                      value={editModal.loan_amount}
                      onChange={(e) => updateEditField('loan_amount', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-interest-rate">Interest Rate (%)</label>
                    <input
                      id="edit-interest-rate"
                      className={editFieldClass}
                      type="number"
                      min="0"
                      step="0.01"
                      value={editModal.interest_rate}
                      onChange={(e) => updateEditField('interest_rate', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-terms-count">Terms Count ({editTermUnitLabel})</label>
                    <input
                      id="edit-terms-count"
                      className={editFieldClass}
                      type="number"
                      min="1"
                      value={editModal.terms_count}
                      onChange={(e) => updateEditField('terms_count', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-refund-option">Refund Option</label>
                    <select
                      id="edit-refund-option"
                      className={editFieldClass}
                      value={editModal.refund_option}
                      onChange={(e) => updateEditField('refund_option', e.target.value)}
                    >
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </select>
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-interest-type">Interest Type</label>
                    <select
                      id="edit-interest-type"
                      className={editFieldClass}
                      value={editModal.interest_type}
                      onChange={(e) => updateEditField('interest_type', e.target.value)}
                    >
                      <option value="flat">Flat</option>
                      <option value="reducing">Reducing</option>
                    </select>
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-charge-payment-mode">Charges Collection Mode</label>
                    <select
                      id="edit-charge-payment-mode"
                      className={editFieldClass}
                      value={editModal.charge_payment_mode}
                      onChange={(e) => updateEditField('charge_payment_mode', e.target.value)}
                    >
                      <option value="deduct_from_loan">Deduct from loan</option>
                      <option value="hand_cash">Hand cash</option>
                    </select>
                  </div>

                  <div>
                    <label className={editLabelClass} htmlFor="edit-refundable-amount">Refundable Amount</label>
                    <input
                      id="edit-refundable-amount"
                      className={`${editFieldClass} bg-slate-50`}
                      value={editModal.refundable_amount}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-installment-amount">Installment Amount</label>
                    <input
                      id="edit-installment-amount"
                      className={`${editFieldClass} bg-slate-50`}
                      value={editModal.installment_amount}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className={editLabelClass}>Net Disbursed</label>
                    <div className={`${editFieldClass} bg-slate-50 font-semibold text-slate-800`}>
                      {(
                        editModal.charge_payment_mode === 'deduct_from_loan'
                          ? Math.max(
                            Number(editModal.loan_amount || 0)
                              - Number(editModal.document_charges || 0)
                              - Number(editModal.stamp_charges || 0)
                              - Number(editModal.insurance_charges || 0),
                            0
                          )
                          : Number(editModal.loan_amount || 0)
                      ).toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <label className={editLabelClass} htmlFor="edit-document-charges">Document Charges</label>
                    <input
                      id="edit-document-charges"
                      className={editFieldClass}
                      type="number"
                      min="0"
                      step="0.01"
                      value={editModal.document_charges}
                      onChange={(e) => updateEditField('document_charges', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-stamp-charges">Stamp Charges</label>
                    <input
                      id="edit-stamp-charges"
                      className={editFieldClass}
                      type="number"
                      min="0"
                      step="0.01"
                      value={editModal.stamp_charges}
                      onChange={(e) => updateEditField('stamp_charges', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-insurance-charges">Insurance Charges</label>
                    <input
                      id="edit-insurance-charges"
                      className={editFieldClass}
                      type="number"
                      min="0"
                      step="0.01"
                      value={editModal.insurance_charges}
                      onChange={(e) => updateEditField('insurance_charges', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className={editLabelClass} htmlFor="edit-next-collection-date">Next Collection Date (Due Date)</label>
                    <input
                      id="edit-next-collection-date"
                      className={editFieldClass}
                      type="date"
                      value={editModal.next_collection_date}
                      onChange={(e) => updateEditField('next_collection_date', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={editLabelClass} htmlFor="edit-loan-end-date">Loan End Date</label>
                    <input
                      id="edit-loan-end-date"
                      className={editFieldClass}
                      type="date"
                      value={editModal.loan_end_date}
                      onChange={(e) => updateEditField('loan_end_date', e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="mt-5 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setEditStep((prev) => Math.max(prev - 1, 1))}
                  disabled={editStep === 1}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold disabled:opacity-50"
                >
                  Back Step
                </button>
                <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                {editStep < editSteps.length ? (
                  <button
                    type="button"
                    onClick={() => setEditStep((prev) => Math.min(prev + 1, editSteps.length))}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={saveLoanEdit}
                    disabled={savingEdit}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
                </div>
              </div>
            </div>
          </div>
        )}

        {documentsModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl border border-cyan-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Loan Documents</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {documentsModal.customerName} | Loan Code: {documentsModal.loanCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDocumentsModal}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 max-h-[60vh] overflow-auto space-y-2">
                {documentsModal.documents.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-100 bg-cyan-50/60 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{doc.document_type}</p>
                      <p className="text-xs text-slate-500 break-all">{doc.original_name || doc.file_path}</p>
                    </div>
                    <a
                      href={buildDocumentUrl(doc.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-semibold"
                    >
                      <EyeIcon className="h-3.5 w-3.5" />
                      <span>Open</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {detailsModal.open && detailsModal.loan && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/65 px-3 py-5">
            <div className="w-full max-w-[96rem] rounded-2xl bg-white p-5 shadow-2xl border border-cyan-100 max-h-[95vh] overflow-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Loan and Customer Full Details</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {detailsModal.loan.customer_name} | Loan Code: {detailsModal.loan.customer_no}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDetailsModal}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDetailsModal((prev) => ({ ...prev, activeTab: 'customer' }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border ${detailsModal.activeTab === 'customer' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-emerald-200'}`}
                >
                  Customer Profile
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsModal((prev) => ({ ...prev, activeTab: 'loan' }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border ${detailsModal.activeTab === 'loan' ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-700 border-cyan-200'}`}
                >
                  Loan Details
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsModal((prev) => ({ ...prev, activeTab: 'guarantor' }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border ${detailsModal.activeTab === 'guarantor' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-700 border-amber-200'}`}
                >
                  Guarantor Details
                </button>
              </div>

              {detailsModal.activeTab === 'customer' && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Customer Full Record (customers table)</p>
                    {detailsModal.customerLoading ? (
                      <p className="mt-3 text-sm text-slate-600">Loading customer profile...</p>
                    ) : detailsModal.customerError ? (
                      <p className="mt-3 text-sm text-rose-700">{detailsModal.customerError}</p>
                    ) : detailsModal.customerProfile ? (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-sm text-slate-800">
                        <p><span className="font-semibold">Customer Code:</span> {detailsModal.customerProfile.customer_code || detailsModal.loan.customer_no || '-'}</p>
                        <p><span className="font-semibold">First Name:</span> {detailsModal.customerProfile.first_name || '-'}</p>
                        <p><span className="font-semibold">Last Name:</span> {detailsModal.customerProfile.last_name || '-'}</p>
                        <p><span className="font-semibold">NIC/Passport:</span> {detailsModal.customerProfile.nic_passport || detailsModal.customerProfile.old_nic || detailsModal.loan.nic || '-'}</p>
                        <p><span className="font-semibold">Phone:</span> {detailsModal.customerProfile.phone || detailsModal.loan.contact_no || '-'}</p>
                        <p><span className="font-semibold">Email:</span> {detailsModal.customerProfile.email || '-'}</p>
                        <p><span className="font-semibold">DOB:</span> {formatDisplayDate(detailsModal.customerProfile.date_of_birth)}</p>
                        <p><span className="font-semibold">Gender:</span> {detailsModal.customerProfile.gender || '-'}</p>
                        <p><span className="font-semibold">Marital Status:</span> {detailsModal.customerProfile.marital_status || '-'}</p>
                        <p><span className="font-semibold">Nationality:</span> {detailsModal.customerProfile.nationality || '-'}</p>
                        <p><span className="font-semibold">Current Address:</span> {detailsModal.customerProfile.current_address || detailsModal.loan.address || '-'}</p>
                        <p><span className="font-semibold">Permanent Address:</span> {detailsModal.customerProfile.permanent_address || '-'}</p>
                        <p><span className="font-semibold">Employer:</span> {detailsModal.customerProfile.employer_name || '-'}</p>
                        <p><span className="font-semibold">Job Title:</span> {detailsModal.customerProfile.job_title || '-'}</p>
                        <p><span className="font-semibold">Monthly Income:</span> {detailsModal.customerProfile.monthly_income || '-'}</p>
                        <p><span className="font-semibold">Identity Name:</span> {pickDetailValue(detailsModal.customerProfile.additional_details, 'identity.full_name_with_initials') || '-'}</p>
                        <p><span className="font-semibold">Second Mobile:</span> {pickDetailValue(detailsModal.customerProfile.additional_details, 'contact.second_mobile') || '-'}</p>
                        <p><span className="font-semibold">Emergency Contact:</span> {pickDetailValue(detailsModal.customerProfile.additional_details, 'contact.emergency_contact') || '-'}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">Customer profile not available.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Customer Uploaded Documents (customer_documents table)</p>
                    {detailsModal.customerDocuments.length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
                        <div className="xl:col-span-1 max-h-[26rem] overflow-auto space-y-2">
                          {detailsModal.customerDocuments.map((doc) => (
                            <button
                              key={`customer-doc-${doc.id}`}
                              type="button"
                              onClick={() => setDetailsModal((prev) => ({ ...prev, selectedCustomerDocumentId: doc.id }))}
                              className={`w-full rounded-lg border p-2 text-left transition ${doc.id === detailsModal.selectedCustomerDocumentId ? 'border-cyan-400 bg-cyan-100' : 'border-cyan-100 bg-white hover:bg-cyan-50'}`}
                            >
                              <p className="text-sm font-semibold text-slate-900">{doc.document_type}</p>
                              <p className="text-[11px] text-slate-500 break-all">{doc.original_name || doc.file_path}</p>
                            </button>
                          ))}
                        </div>
                        <div className="xl:col-span-2 rounded-lg border border-cyan-100 bg-white p-3 min-h-[18rem]">
                          {selectedCustomerDocument ? (
                            <>
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{selectedCustomerDocument.document_type}</p>
                                  <p className="text-xs text-slate-500">{selectedCustomerDocument.original_name || selectedCustomerDocument.file_path}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const customerId = Number(detailsModal.customerProfile?.id || 0);
                                    const documentId = Number(selectedCustomerDocument.id || 0);
                                    if (customerId > 0 && documentId > 0) {
                                      void openDocumentInNewTab(resolveCustomerDocumentAccessUrl(customerId, documentId));
                                      return;
                                    }
                                    void openDocumentInNewTab(resolveDocumentUrl(selectedCustomerDocument));
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-semibold"
                                >
                                  <EyeIcon className="h-3.5 w-3.5" />
                                  <span>Open in new tab</span>
                                </button>
                              </div>

                              {customerDocPreview.loading && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                  Loading preview...
                                </div>
                              )}

                              {!customerDocPreview.loading && customerDocPreview.error && (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                  {customerDocPreview.error}
                                </div>
                              )}

                              {selectedCustomerDocumentType === 'image' && (
                                <img
                                  src={customerDocPreview.objectUrl || resolveDocumentUrl(selectedCustomerDocument)}
                                  alt={selectedCustomerDocument.document_type}
                                  className="w-full max-h-[58vh] rounded-lg border border-cyan-100 object-contain bg-slate-50"
                                />
                              )}

                              {selectedCustomerDocumentType === 'pdf' && (
                                <iframe
                                  src={customerDocPreview.objectUrl || resolveDocumentUrl(selectedCustomerDocument)}
                                  title={selectedCustomerDocument.document_type}
                                  className="h-[58vh] w-full rounded-lg border border-cyan-100"
                                />
                              )}

                              {selectedCustomerDocumentType === 'other' && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                  Preview is not available for this file type. Use "Open in new tab".
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                              Select a customer document from the list to preview.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">No customer documents found.</p>
                    )}
                  </div>
                </div>
              )}

              {detailsModal.activeTab === 'loan' && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Loan Details</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-slate-800 text-sm">
                      <p><span className="font-semibold">Status:</span> <span className="capitalize">{detailsModal.loan.status || '-'}</span></p>
                      <p><span className="font-semibold">Scope:</span> {detailsModal.loan.loan_scope || '-'}</p>
                      <p><span className="font-semibold">Amount:</span> {Number(detailsModal.loan.loan_amount || 0).toFixed(2)}</p>
                      <p><span className="font-semibold">Refundable:</span> {Number(detailsModal.loan.refundable_amount || 0).toFixed(2)}</p>
                      <p><span className="font-semibold">Installment:</span> {Number(detailsModal.loan.installment_amount || 0).toFixed(2)}</p>
                      <p><span className="font-semibold">Interest:</span> {Number(detailsModal.loan.interest_rate || 0).toFixed(2)}% ({detailsModal.loan.interest_type})</p>
                      <p><span className="font-semibold">Terms:</span> {detailsModal.loan.terms_count} {detailsModal.loan.refund_option}(s)</p>
                      <p><span className="font-semibold">Charge Mode:</span> {String(detailsModal.loan.charge_payment_mode || '-').replaceAll('_', ' ')}</p>
                      <p><span className="font-semibold">Collection Status:</span> {String(detailsModal.loan.charges_collection_status || '-').replaceAll('_', ' ')}</p>
                      <p><span className="font-semibold">Document Charges:</span> {Number(detailsModal.loan.document_charges || 0).toFixed(2)}</p>
                      <p><span className="font-semibold">Stamp Charges:</span> {Number(detailsModal.loan.stamp_charges || 0).toFixed(2)}</p>
                      <p><span className="font-semibold">Insurance Charges:</span> {Number(detailsModal.loan.insurance_charges || 0).toFixed(2)}</p>
                      <p><span className="font-semibold">Route:</span> {detailsModal.loan.route?.name || '-'}</p>
                      <p><span className="font-semibold">Center:</span> {detailsModal.loan.center?.name || '-'}</p>
                      <p><span className="font-semibold">Group:</span> {detailsModal.loan.group?.name || '-'}</p>
                      <p><span className="font-semibold">Manager:</span> {detailsModal.loan.manager_name || '-'}</p>
                      <p><span className="font-semibold">Field Officer:</span> {detailsModal.loan.field_officer || '-'}</p>
                      <p><span className="font-semibold">Group Leader:</span> {detailsModal.loan.group_leader || '-'}</p>
                      <p><span className="font-semibold">Request Date:</span> {formatDisplayDate(detailsModal.loan.loan_request_date)}</p>
                      <p><span className="font-semibold">Next Payment:</span> {formatDisplayDate(detailsModal.loan.next_payment_date)}</p>
                      <p><span className="font-semibold">Due Date:</span> {formatDisplayDate(detailsModal.loan.due_date)}</p>
                      <p><span className="font-semibold">Loan End Date:</span> {formatDisplayDate(detailsModal.loan.loan_end_date)}</p>
                      <p><span className="font-semibold">Bank:</span> {detailsModal.loan.bank_name || '-'} / {detailsModal.loan.bank_branch || '-'}</p>
                      <p><span className="font-semibold">Account No:</span> {detailsModal.loan.bank_account_no || '-'}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Loan Process and Verification Details</p>
                    {(() => {
                      const workflowStep = Number(detailsModal.loan.workflow_step || 0);
                      const callPayload = asRecord(detailsModal.loan.call_confirmation_payload);
                      const bmPayload = asRecord(detailsModal.loan.bm_approval_payload);
                      const cashPayload = asRecord(detailsModal.loan.cash_allocation_payload);
                      const secondCallPayload = asRecord(detailsModal.loan.second_call_confirmation_payload);
                      const documentVerificationPayload = asRecord(detailsModal.loan.document_verification_payload);
                      const documentVerificationDocuments = asRecord(documentVerificationPayload.documents);

                      return (
                        <div className="mt-3 space-y-3 text-sm text-slate-800">
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                            <p><span className="font-semibold">Workflow Step:</span> {workflowStep > 0 ? `Step ${workflowStep}` : '-'}</p>
                            <p><span className="font-semibold">Workflow Updated:</span> {formatDisplayDate(detailsModal.loan.workflow_step_updated_at)}</p>
                            <p><span className="font-semibold">Status:</span> <span className="capitalize">{detailsModal.loan.status || '-'}</span></p>
                          </div>

                          {Object.keys(callPayload).length > 0 && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Step 2: Call Confirmation</p>
                              <p className="mt-1 text-xs text-slate-600">Confirmed at: {formatDisplayDate(detailsModal.loan.call_confirmed_at)}</p>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                {Object.entries(callPayload).map(([key, value]) => (
                                  <p key={`call-${key}`}><span className="font-semibold">{key.replaceAll('_', ' ')}:</span> {formatProcessValue(value)}</p>
                                ))}
                              </div>
                            </div>
                          )}

                          {Object.keys(bmPayload).length > 0 && (
                            <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Step 3: BM Approval</p>
                              <p className="mt-1 text-xs text-slate-600">Approved at: {formatDisplayDate(detailsModal.loan.bm_approved_at)}</p>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                {Object.entries(bmPayload).map(([key, value]) => (
                                  <p key={`bm-${key}`}><span className="font-semibold">{key.replaceAll('_', ' ')}:</span> {formatProcessValue(value)}</p>
                                ))}
                              </div>
                            </div>
                          )}

                          {Object.keys(cashPayload).length > 0 && (
                            <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Step 5: Cash Allocation</p>
                              <p className="mt-1 text-xs text-slate-600">Allocated at: {formatDisplayDate(detailsModal.loan.cash_allocated_at)}</p>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                {Object.entries(cashPayload).map(([key, value]) => (
                                  <p key={`cash-${key}`}><span className="font-semibold">{key.replaceAll('_', ' ')}:</span> {formatProcessValue(value)}</p>
                                ))}
                              </div>
                            </div>
                          )}

                          {Object.keys(secondCallPayload).length > 0 && (
                            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Step 8: Second Call Confirmation</p>
                              <p className="mt-1 text-xs text-slate-600">Confirmed at: {formatDisplayDate(detailsModal.loan.second_call_confirmed_at)}</p>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                {Object.entries(secondCallPayload)
                                  .filter(([key]) => key !== 'confirmations')
                                  .map(([key, value]) => (
                                    <p key={`second-${key}`}><span className="font-semibold">{key.replaceAll('_', ' ')}:</span> {formatProcessValue(value)}</p>
                                  ))}
                              </div>
                            </div>
                          )}

                          {Object.keys(documentVerificationPayload).length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Step 10: Document Verification</p>
                              <p className="mt-1 text-xs text-slate-600">Verified at: {formatDisplayDate(detailsModal.loan.document_verified_at)}</p>

                              {Object.keys(documentVerificationDocuments).length > 0 ? (
                                <div className="mt-2 overflow-x-auto">
                                  <table className="min-w-full text-xs">
                                    <thead>
                                      <tr className="bg-white/70">
                                        <th className="px-2 py-1 text-left font-semibold text-slate-700">Document</th>
                                        <th className="px-2 py-1 text-left font-semibold text-slate-700">Available</th>
                                        <th className="px-2 py-1 text-left font-semibold text-slate-700">Verified</th>
                                        <th className="px-2 py-1 text-left font-semibold text-slate-700">Not Required</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-100">
                                      {Object.entries(documentVerificationDocuments).map(([key, value]) => {
                                        const row = asRecord(value);
                                        return (
                                          <tr key={`doc-check-${key}`}>
                                            <td className="px-2 py-1 text-slate-800">{formatProcessValue(row.label || key)}</td>
                                            <td className="px-2 py-1 text-slate-800">{formatProcessValue(row.available)}</td>
                                            <td className="px-2 py-1 text-slate-800">{formatProcessValue(row.confirmed)}</td>
                                            <td className="px-2 py-1 text-slate-800">{formatProcessValue(row.not_required)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-slate-600">No document verification checklist items found.</p>
                              )}
                            </div>
                          )}

                          {Object.keys(callPayload).length === 0
                            && Object.keys(bmPayload).length === 0
                            && Object.keys(cashPayload).length === 0
                            && Object.keys(secondCallPayload).length === 0
                            && Object.keys(documentVerificationPayload).length === 0 && (
                              <p className="text-sm text-slate-600">No stored process verification payloads found for this loan record.</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Loan Request Uploaded Documents</p>
                    {detailsModalDocuments.length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
                        <div className="xl:col-span-1 max-h-[28rem] overflow-auto space-y-2">
                          {detailsModalDocuments.map((doc) => (
                            <button
                              key={`details-doc-${doc.id}`}
                              type="button"
                              onClick={() => setDetailsModal((prev) => ({ ...prev, selectedDocumentId: doc.id }))}
                              className={`w-full rounded-lg border p-2 text-left transition ${doc.id === detailsModal.selectedDocumentId ? 'border-cyan-400 bg-cyan-100' : 'border-cyan-100 bg-white hover:bg-cyan-50'}`}
                            >
                              <p className="text-sm font-semibold text-slate-900">{doc.document_type}</p>
                              <p className="text-[11px] text-slate-500 break-all">{doc.original_name || doc.file_path || '-'}</p>
                              <p className="text-[10px] mt-1 uppercase tracking-wide text-slate-500">Source: {doc.source}</p>
                            </button>
                          ))}
                        </div>

                        <div className="xl:col-span-2 rounded-lg border border-cyan-100 bg-white p-3 min-h-[18rem]">
                          {selectedDetailsDocument ? (
                            <>
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{selectedDetailsDocument.document_type}</p>
                                  <p className="text-xs text-slate-500">{selectedDetailsDocument.original_name || selectedDetailsDocument.file_path || '-'}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedDetailsDocument.access_url) {
                                      void openDocumentInNewTab(selectedDetailsDocument.access_url);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-semibold"
                                >
                                  <EyeIcon className="h-3.5 w-3.5" />
                                  <span>Open in new tab</span>
                                </button>
                              </div>

                              {selectedDetailsDocument.source === 'customer' && (
                                <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                  Customer document is protected. Use "Open in new tab" for authenticated preview.
                                </div>
                              )}

                              {selectedDetailsDocumentType === 'image' && selectedDetailsDocument.source !== 'customer' && (
                                <img
                                  src={selectedDetailsDocument.access_url || ''}
                                  alt={selectedDetailsDocument.document_type}
                                  className="w-full max-h-[60vh] rounded-lg border border-cyan-100 object-contain bg-slate-50"
                                />
                              )}

                              {selectedDetailsDocumentType === 'pdf' && selectedDetailsDocument.source !== 'customer' && (
                                <iframe
                                  src={selectedDetailsDocument.access_url || ''}
                                  title={selectedDetailsDocument.document_type}
                                  className="h-[60vh] w-full rounded-lg border border-cyan-100"
                                />
                              )}

                              {(selectedDetailsDocumentType === 'other' || selectedDetailsDocument.source === 'customer') && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                  Preview is not available for this file type. Use "Open in new tab" to view or download.
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                              Select a document from the left list to preview.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">No uploaded loan request documents available.</p>
                    )}
                  </div>
                </div>
              )}

              {detailsModal.activeTab === 'guarantor' && (
                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Guarantor Details</p>
                  {Array.isArray(detailsModal.loan.guarantors) && detailsModal.loan.guarantors.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white/70">
                          <tr>
                            <th className="px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Name</th>
                            <th className="px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600">NIC</th>
                            <th className="px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Contact</th>
                            <th className="px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Relationship</th>
                            <th className="px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Address</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {detailsModal.loan.guarantors.map((g, index) => (
                            <tr key={`details-guarantor-${detailsModal.loan?.id}-${index}`}>
                              <td className="px-2 py-1.5 text-slate-800">{g.name || '-'}</td>
                              <td className="px-2 py-1.5 text-slate-800">{g.nic || '-'}</td>
                              <td className="px-2 py-1.5 text-slate-800">{g.contact_no || '-'}</td>
                              <td className="px-2 py-1.5 text-slate-800">{g.relationship || '-'}</td>
                              <td className="px-2 py-1.5 text-slate-800">{g.address || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">No guarantor information available.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
