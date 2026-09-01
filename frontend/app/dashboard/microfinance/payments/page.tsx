'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type AuthUser = {
  id: number;
  name?: string;
  email?: string;
  branch_id?: number | null;
  designation?: { id: number; name: string } | null;
  employee?: { id: number; first_name?: string; last_name?: string; email?: string } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

type LoanRow = {
  id: number;
  branch_id?: number | string | null;
  field_officer?: string | null;
  field_officer_id?: number | string | null;
  loan_code?: string | null;
  next_payment_date?: string | null;
  customer_no?: string | null;
  customer_name?: string | null;
  nic?: string | null;
  loan_amount?: number | string | null;
  net_disbursed_amount?: number | string | null;
  loan_request_date?: string | null;
  created_at?: string | null;
};

type LoanLookupRow = {
  id: number;
  loan_code: string;
  customer_no: string;
  customer_name: string;
  customer_nic: string;
  field_officer: string;
  issue_amount: number;
  issue_date: string;
};

type PaymentRow = {
  id: number;
  mf_loan_request_id: number;
  collection_date?: string | null;
  created_at?: string | null;
  collected_amount?: number | string;
  capital_amount?: number | string;
  interest_amount?: number | string;
  penalty_amount?: number | string;
  payment_type?: 'cash' | 'check' | 'bank_transfer' | string;
  payment_reference?: string | null;
  note?: string | null;
  loanRequest?: {
    customer_no?: string;
    customer_name?: string;
  } | null;
  loan_request?: {
    customer_no?: string;
    customer_name?: string;
  } | null;
  customer_no?: string;
  loan_code?: string;
  customer_name?: string;
  customer_nic?: string;
  field_officer?: string;
  field_officer_id?: number;
  balance?: number | string | null;
  remaining_balance?: number | string | null;
  outstanding_balance?: number | string | null;
  loan_balance?: number | string | null;
  arrears_balance?: number | string | null;
  arrears_outstanding_after?: number | string | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_by_name?: string | null;
  deleted_by_email?: string | null;
  deletion_reason?: string | null;
  is_deleted?: boolean;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDateValue = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (DATE_ONLY_PATTERN.test(raw)) {
    const [yearText, monthText, dayText] = raw.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }

    const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const hasExplicitTime = (value?: string | null) => {
  const raw = String(value || '').trim();
  return /T\d{2}:\d{2}|\s\d{2}:\d{2}/.test(raw);
};

const extractDateOnlyText = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (DATE_ONLY_PATTERN.test(raw)) return raw;

  const datePrefix = raw.slice(0, 10);
  if (DATE_ONLY_PATTERN.test(datePrefix)) return datePrefix;

  return '';
};

const formatDateOnlyText = (value?: string | null) => {
  const dateText = extractDateOnlyText(value);
  if (!dateText) return '';

  const [yearText, monthText, dayText] = dateText.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateText;
  }

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return dateText;

  return new Intl.DateTimeFormat('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(parsed);
};

const getPaymentPrimaryDate = (row: PaymentRow) => {
  const collectionRaw = String(row.collection_date || '').trim();
  const createdRaw = String(row.created_at || '').trim();

  if (collectionRaw !== '') {
    return parseDateValue(collectionRaw);
  }

  return parseDateValue(createdRaw);
};

const API_BASE = getApiBaseUrl();

export default function MicrofinancePaymentsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loansCatalog, setLoansCatalog] = useState<LoanLookupRow[]>([]);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fieldOfficerFilter, setFieldOfficerFilter] = useState('all');
  const [loanIdFilter, setLoanIdFilter] = useState('');
  const [customerNoFilter, setCustomerNoFilter] = useState('');
  const [customerNicFilter, setCustomerNicFilter] = useState('');
  const [customerNameFilter, setCustomerNameFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<number | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteInvoiceId, setPendingDeleteInvoiceId] = useState<number | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [alertModal, setAlertModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

  const normalizeText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const designationName = normalizeText(String(authUser?.designation?.name || ''));
  const roleNames = (authUser?.roles || []).map((role) => normalizeText(String(role?.name || '')));

  const isAdmin =
    normalizeText(String(authUser?.email || '')) === 'superadmin softcodelk com' ||
    designationName.includes('managing director') ||
    designationName.includes('business owner') ||
    designationName.includes('admin') ||
    roleNames.some((name) => name.includes('admin') || name.includes('managing director') || name.includes('business owner'));

  const isManager =
    designationName.includes('manager') ||
    designationName.includes('managing director') ||
    designationName.includes('business owner') ||
    roleNames.some((name) => name.includes('manager') || name.includes('managing director') || name.includes('business owner'));

  const isCollectionOfficer =
    designationName.includes('collection officer') ||
    roleNames.some((name) => name.includes('collection officer'));

  const canDeletePayments = isManager || isAdmin;

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }),
    [token]
  );

  const officerNameCandidates = useMemo(() => {
    const fullName = [authUser?.employee?.first_name || '', authUser?.employee?.last_name || '']
      .join(' ')
      .trim();

    return [authUser?.name, fullName, authUser?.email, authUser?.employee?.email]
        .map((v) => normalizeText(String(v || '')))
      .filter((v, i, arr) => v !== '' && arr.indexOf(v) === i);
  }, [authUser]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser));
      } catch {
        setAuthUser(null);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadPayments = async () => {
      setLoading(true);
      try {
        const [loanRes, paymentRes] = await Promise.all([
          axios.get(`${API_BASE}/microfinance/loan-requests`, {
            headers,
          }),
          axios.get(`${API_BASE}/microfinance/collections`, {
            headers,
            params: {
              include_deleted: canDeletePayments && showDeleted ? 1 : 0,
            },
          }),
        ]);

        const allLoans: LoanRow[] = Array.isArray(loanRes.data) ? loanRes.data : [];
        const rawPayments: PaymentRow[] = Array.isArray(paymentRes.data) ? paymentRes.data : [];

        const loanMetaMap = new Map<number, { loan_code: string; customer_no: string; customer_name: string; customer_nic: string }>();
        const loanOfficerMap = new Map<number, { field_officer: string; field_officer_id: number }>();
        allLoans.forEach((loan) => {
          const loanId = Number(loan.id);
          loanMetaMap.set(Number(loan.id), {
            loan_code: String(loan.loan_code || ''),
            customer_no: String(loan.customer_no || ''),
            customer_name: String(loan.customer_name || ''),
            customer_nic: String(loan.nic || ''),
          });

          loanOfficerMap.set(loanId, {
            field_officer: String(loan.field_officer || '').trim(),
            field_officer_id: Number(loan.field_officer_id || 0),
          });
        });

        const allPayments: PaymentRow[] = rawPayments.map((row) => {
          const loanId = Number(row.mf_loan_request_id || 0);
          const relationMeta = row.loanRequest || row.loan_request;
          const mapMeta = loanMetaMap.get(loanId);
          const officerMeta = loanOfficerMap.get(loanId);

          const customerNo =
            String(row.customer_no || relationMeta?.customer_no || mapMeta?.customer_no || '').trim();
          const loanCode = String(row.loan_code || mapMeta?.loan_code || '').trim();
          const customerName =
            String(row.customer_name || relationMeta?.customer_name || mapMeta?.customer_name || '').trim();
          const customerNic = String(row.customer_nic || mapMeta?.customer_nic || '').trim();

          return {
            ...row,
            loan_code: loanCode || '-',
            customer_no: customerNo || '-',
            customer_name: customerName || '-',
            customer_nic: customerNic || '-',
            field_officer: String(officerMeta?.field_officer || '').trim() || 'Unassigned',
            field_officer_id: Number(officerMeta?.field_officer_id || 0),
            loanRequest: {
              customer_no: customerNo || '-',
              customer_name: customerName || '-',
            },
          };
        });

        const branchId = Number(authUser?.branch_id || 0);
        const authOfficerId = Number(authUser?.employee?.id || 0);

        const scopedLoans = allLoans.filter((loan) => {
          const loanBranchId = Number(loan.branch_id || 0);
          const loanOfficerId = Number(loan.field_officer_id || 0);
          const loanOfficer = normalizeText(String(loan.field_officer || '').trim());

          if (isAdmin) {
            return true;
          }

          if (isManager) {
            return branchId > 0 && loanBranchId === branchId;
          }

          if (isCollectionOfficer) {
            const isOfficerIdMatch = authOfficerId > 0 && loanOfficerId > 0 ? loanOfficerId === authOfficerId : false;
            const isOfficerNameMatch = loanOfficer !== '' ? officerNameCandidates.includes(loanOfficer) : false;
            const isBranchMatch = branchId > 0 ? loanBranchId === branchId : true;
            return isBranchMatch && (isOfficerIdMatch || isOfficerNameMatch);
          }

          return branchId > 0 ? loanBranchId === branchId : false;
        });

        const scopedLoanIds = new Set(scopedLoans.map((loan) => Number(loan.id)));
        setPayments(allPayments.filter((row) => scopedLoanIds.has(Number(row.mf_loan_request_id || 0))));

        const catalog = scopedLoans.map((loan) => ({
            id: Number(loan.id),
          loan_code: String(loan.loan_code || '-'),
            customer_no: String(loan.customer_no || '-'),
            customer_name: String(loan.customer_name || '-'),
            customer_nic: String(loan.nic || '-'),
            field_officer: String(loan.field_officer || 'Unassigned'),
            issue_amount: Number(loan.net_disbursed_amount || loan.loan_amount || 0),
            issue_date: String(loan.loan_request_date || loan.created_at || ''),
          }));
        setLoansCatalog(catalog);
      } catch {
        setPayments([]);
        setLoansCatalog([]);
      } finally {
        setLoading(false);
      }
    };

    loadPayments();
  }, [token, headers, isAdmin, isManager, isCollectionOfficer, authUser?.branch_id, authUser?.employee?.id, officerNameCandidates, reloadCounter, canDeletePayments, showDeleted]);

  const openDeleteConfirm = (invoiceId: number) => {
    if (!canDeletePayments) {
      openAlert('Access Denied', 'Only manager-level users can delete payments.');
      return;
    }
    setPendingDeleteInvoiceId(invoiceId);
    setDeleteReason('');
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setPendingDeleteInvoiceId(null);
    setDeleteReason('');
  };

  const openAlert = (title: string, message: string) => {
    setAlertModal({ open: true, title, message });
  };

  const closeAlert = () => {
    setAlertModal({ open: false, title: '', message: '' });
  };

  const deleteInvoice = async () => {
    if (!token || deletingInvoiceId) return;
    if (!pendingDeleteInvoiceId) return;
    if (!canDeletePayments) {
      openAlert('Access Denied', 'Only manager-level users can delete payments.');
      return;
    }

    setDeletingInvoiceId(pendingDeleteInvoiceId);
    try {
      await axios.delete(`${API_BASE}/microfinance/collections/${pendingDeleteInvoiceId}`, {
        headers,
        data: {
          deletion_reason: deleteReason.trim() === '' ? null : deleteReason.trim(),
        },
      });

      setReloadCounter((prev) => prev + 1);
      closeDeleteConfirm();
      openAlert('Deleted', 'Invoice deleted. Loan balances were reversed successfully.');
    } catch (error: unknown) {
      const apiMessage =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to delete invoice. Please try again.';
      openAlert('Delete Failed', String(apiMessage));
    } finally {
      setDeletingInvoiceId(null);
    }
  };

  const filteredPayments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return payments.filter((row) => {
      const rowDate = getPaymentPrimaryDate(row);

      if (from && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate < from) {
        return false;
      }

      if (to && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate > to) {
        return false;
      }

      if (fieldOfficerFilter !== 'all') {
        const officer = String(row.field_officer || '').trim().toLowerCase();
        if (officer !== fieldOfficerFilter) {
          return false;
        }
      }

      if (loanIdFilter.trim() !== '' && !String(row.mf_loan_request_id || '').includes(loanIdFilter.trim())) {
        return false;
      }

      if (customerNoFilter.trim() !== '') {
        const customerNo = String(row.loanRequest?.customer_no || row.customer_no || '').toLowerCase();
        if (!customerNo.includes(customerNoFilter.trim().toLowerCase())) {
          return false;
        }
      }

      if (customerNicFilter.trim() !== '') {
        const customerNic = String(row.customer_nic || '').toLowerCase();
        if (!customerNic.includes(customerNicFilter.trim().toLowerCase())) {
          return false;
        }
      }

      if (customerNameFilter.trim() !== '') {
        const customerName = String(row.loanRequest?.customer_name || row.customer_name || '').toLowerCase();
        if (!customerName.includes(customerNameFilter.trim().toLowerCase())) {
          return false;
        }
      }

      if (!keyword) return true;

      const haystack = [
        row.loanRequest?.customer_no || '',
        row.loanRequest?.customer_name || '',
        row.customer_nic || '',
        row.field_officer || '',
        row.payment_type || '',
        row.payment_reference || '',
        row.collection_date || '',
        row.note || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [
    payments,
    query,
    fromDate,
    toDate,
    fieldOfficerFilter,
    loanIdFilter,
    customerNoFilter,
    customerNicFilter,
    customerNameFilter,
  ]);

  const officerOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        payments
          .map((row) => String(row.field_officer || '').trim())
          .filter((value) => value !== '' && value !== 'Unassigned')
      )
    ).sort((a, b) => a.localeCompare(b));

    return values;
  }, [payments]);

  const showLoanLookup =
    loanIdFilter.trim() !== '' ||
    customerNoFilter.trim() !== '' ||
    customerNicFilter.trim() !== '' ||
    customerNameFilter.trim() !== '';

  const matchingLoans = useMemo(() => {
    if (!showLoanLookup) return [];

    const loanIdKeyword = loanIdFilter.trim().toLowerCase();
    const loanCodeKeyword = customerNoFilter.trim().toLowerCase();
    const nicKeyword = customerNicFilter.trim().toLowerCase();
    const nameKeyword = customerNameFilter.trim().toLowerCase();

    return loansCatalog
      .filter((loan) => {
        if (loanIdKeyword && !String(loan.id).toLowerCase().includes(loanIdKeyword)) return false;
        if (loanCodeKeyword && !String(loan.customer_no || '').toLowerCase().includes(loanCodeKeyword)) return false;
        if (nicKeyword && !String(loan.customer_nic || '').toLowerCase().includes(nicKeyword)) return false;
        if (nameKeyword && !String(loan.customer_name || '').toLowerCase().includes(nameKeyword)) return false;
        return true;
      })
      .slice(0, 20);
  }, [showLoanLookup, loansCatalog, loanIdFilter, customerNoFilter, customerNicFilter, customerNameFilter]);

  const selectedLoan = useMemo(
    () => loansCatalog.find((loan) => loan.id === selectedLoanId) || null,
    [loansCatalog, selectedLoanId]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query, fromDate, toDate, fieldOfficerFilter, loanIdFilter, customerNoFilter, customerNicFilter, customerNameFilter, pageSize]);

  const selectedLoanPayments = useMemo(() => {
    if (!selectedLoanId) return [];

    return payments
      .filter((row) => Number(row.mf_loan_request_id || 0) === selectedLoanId)
      .sort((a, b) => {
        const aTime = getPaymentPrimaryDate(a)?.getTime() ?? 0;
        const bTime = getPaymentPrimaryDate(b)?.getTime() ?? 0;
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
  }, [payments, selectedLoanId]);

  const selectedLoanTimeline = useMemo(() => {
    if (!selectedLoan) return [];

    const orderedPayments = [...selectedLoanPayments].sort((a, b) => {
      const aTime = getPaymentPrimaryDate(a)?.getTime() ?? 0;
      const bTime = getPaymentPrimaryDate(b)?.getTime() ?? 0;
      return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
    });

    let runningBalance = Number(selectedLoan.issue_amount || 0);

    const timeline: Array<{
      id: string | number;
      kind: 'issue' | 'payment';
      date: string;
      created_at?: string | null;
      customer_no: string;
      customer_name: string;
      field_officer: string;
      payment_type: string;
      payment_reference: string;
      collected_amount: number;
      capital_amount: number;
      interest_amount: number;
      penalty_amount: number;
      balance: number;
      note: string;
      is_deleted?: boolean;
      deleted_by_name?: string;
      deletion_reason?: string;
    }> = [
      {
        id: `issue-${selectedLoan.id}`,
        kind: 'issue',
        date: selectedLoan.issue_date,
        customer_no: selectedLoan.customer_no,
        customer_name: selectedLoan.customer_name,
        field_officer: selectedLoan.field_officer,
        payment_type: 'loan_issue',
        payment_reference: '-',
        collected_amount: 0,
        capital_amount: 0,
        interest_amount: 0,
        penalty_amount: 0,
        balance: runningBalance,
        note: 'Loan issued',
        is_deleted: false,
        deleted_by_name: '',
        deletion_reason: '',
      },
    ];

    orderedPayments.forEach((row) => {
      const capitalDeduction = Number(row.capital_amount || 0);
      runningBalance = Math.max(runningBalance - capitalDeduction, 0);

      timeline.push({
        id: row.id,
        kind: 'payment',
        date: String(row.collection_date || row.created_at || ''),
        created_at: row.created_at,
        customer_no: row.loanRequest?.customer_no || row.customer_no || '-',
        customer_name: row.loanRequest?.customer_name || row.customer_name || '-',
        field_officer: row.field_officer || '-',
        payment_type: String(row.payment_type || '-'),
        payment_reference: row.payment_reference || '-',
        collected_amount: Number(row.collected_amount || 0),
        capital_amount: Number(row.capital_amount || 0),
        interest_amount: Number(row.interest_amount || 0),
        penalty_amount: Number(row.penalty_amount || 0),
        balance: runningBalance,
        note: row.note || '-',
        is_deleted: Boolean(row.is_deleted),
        deleted_by_name: String(row.deleted_by_name || ''),
        deletion_reason: String(row.deletion_reason || ''),
      });
    });

    return timeline;
  }, [selectedLoan, selectedLoanPayments]);

  const selectedLoanHistoryStats = useMemo(() => {
    return selectedLoanPayments.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.collected += Number(row.collected_amount || 0);
        acc.capital += Number(row.capital_amount || 0);
        acc.interest += Number(row.interest_amount || 0);
        return acc;
      },
      { count: 0, collected: 0, capital: 0, interest: 0 }
    );
  }, [selectedLoanPayments]);

  const totals = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    let totalAmount = 0;
    let totalCapital = 0;
    let totalInterest = 0;
    let todayAmount = 0;
    let cashCount = 0;
    let bankCount = 0;

    filteredPayments.forEach((row) => {
      const amount = Number(row.collected_amount || 0);
      const capital = Number(row.capital_amount || 0);
      const interest = Number(row.interest_amount || 0);
      const date = String(row.collection_date || '').slice(0, 10);
      const payType = String(row.payment_type || '').toLowerCase();

      totalAmount += amount;
      totalCapital += capital;
      totalInterest += interest;
      if (date === today) todayAmount += amount;

      if (payType === 'cash') {
        cashCount += 1;
      } else if (payType === 'check' || payType === 'bank_transfer') {
        bankCount += 1;
      }
    });

    return {
      count: filteredPayments.length,
      totalAmount,
      totalCapital,
      totalInterest,
      todayAmount,
      cashCount,
      bankCount,
    };
  }, [filteredPayments]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedPayments = filteredPayments.slice(startIndex, startIndex + pageSize);

  const formatDisplayDateTime = (collectionDate?: string | null, createdAt?: string | null) => {
    const dateText = String(collectionDate || '').trim();
    const createdText = String(createdAt || '').trim();

    // Business collection date should be treated as a pure date, without timezone-converted time.
    const collectionDateOnly = formatDateOnlyText(dateText);
    if (collectionDateOnly) {
      const parsedCreated = parseDateValue(createdText);
      const createdHasTime = hasExplicitTime(createdText);

      if (parsedCreated && createdHasTime) {
        const timePart = new Intl.DateTimeFormat('en-LK', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(parsedCreated);

        return `${collectionDateOnly} ${timePart}`;
      }

      return collectionDateOnly;
    }

    const parsedCollection = parseDateValue(dateText);
    const parsedCreated = parseDateValue(createdText);

    const hasCollection = parsedCollection !== null;
    const hasCreated = parsedCreated !== null;

    if (!hasCollection && !hasCreated) {
      return dateText || createdText || '-';
    }

    const baseDate = hasCollection ? parsedCollection! : parsedCreated!;
    const datePart = new Intl.DateTimeFormat('en-LK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(baseDate);

    // Show time only when the source value explicitly includes time.
    const collectionHasTime = hasExplicitTime(dateText);
    const createdHasTime = hasExplicitTime(createdText);

    let timeSource: Date | null = null;
    if (hasCollection && collectionHasTime) {
      timeSource = parsedCollection;
    } else if (!hasCollection && hasCreated && createdHasTime) {
      timeSource = parsedCreated;
    }

    if (!timeSource) return datePart;

    const timePart = new Intl.DateTimeFormat('en-LK', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(timeSource);

    return `${datePart} ${timePart}`;
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#eef8ff] via-[#ecfcf7] to-[#f2f9ff] flex items-center justify-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef8ff] via-[#ecfcf7] to-[#f2f9ff] p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-55">
        <div className="absolute -top-24 left-10 h-80 w-80 rounded-full bg-sky-300/75 blur-3xl"></div>
        <div className="absolute top-16 right-8 h-[26rem] w-[26rem] rounded-full bg-cyan-300/65 blur-3xl"></div>
        <div className="absolute -bottom-8 left-1/3 h-80 w-80 rounded-full bg-emerald-300/60 blur-3xl"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.65),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(20,184,166,0.12),transparent_40%)]"></div>
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(8,145,178,0.12) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        <div className="rounded-[2rem] border border-cyan-100/80 bg-gradient-to-br from-[#0b4f6c] via-[#0e7490] to-[#0f766e] p-6 text-white shadow-[0_26px_70px_-34px_rgba(8,47,73,0.65)] md:p-7">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100 shadow-sm">
                Finance Collections Studio
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-3">Microfinance Payments</h1>
              <p className="text-sm text-cyan-100/95 mt-1 max-w-2xl">Track received payments, methods, and transaction references with a richer real-time operations view.</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/microfinance')}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/25 shadow-sm"
            >
              Back
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-2xl bg-white/10 border border-white/20 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-cyan-100">Payments</p>
              <p className="text-xl font-bold text-white mt-1">{totals.count}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-white to-cyan-50 border border-cyan-100 shadow-[0_12px_28px_-20px_rgba(6,182,212,0.35)] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Collection</p>
              <p className="text-lg md:text-xl font-bold text-slate-900 mt-1">
                {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(totals.totalAmount)}
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-white to-sky-50 border border-sky-100 shadow-[0_12px_28px_-20px_rgba(14,165,233,0.35)] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Capital</p>
              <p className="text-lg md:text-xl font-bold text-slate-900 mt-1">
                {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(totals.totalCapital)}
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-white to-indigo-50 border border-indigo-100 shadow-[0_12px_28px_-20px_rgba(99,102,241,0.3)] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Interest</p>
              <p className="text-lg md:text-xl font-bold text-slate-900 mt-1">
                {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(totals.totalInterest)}
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-white to-emerald-50 border border-emerald-100 shadow-[0_12px_28px_-20px_rgba(16,185,129,0.4)] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Today Collected</p>
              <p className="text-lg md:text-xl font-bold text-emerald-700 mt-1">
                {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(totals.todayAmount)}
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-white to-amber-50 border border-amber-100 shadow-[0_12px_28px_-20px_rgba(245,158,11,0.35)] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Cash / Bank</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{totals.cashCount} / {totals.bankCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-2xl rounded-3xl border border-cyan-100 shadow-[0_20px_46px_-26px_rgba(14,116,144,0.5)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-black text-slate-900">
              {selectedLoan
                ? `Payment History - ${selectedLoan.customer_no} | ${selectedLoan.customer_name}`
                : 'Payment Transactions'}
            </h2>
            <div className="relative min-w-[280px]">
              <input
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-200"
                placeholder="Search by loan, customer, field officer, type, reference"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">⌕</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/70 to-sky-50/60 p-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900 shadow-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900 shadow-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Field Officer</label>
              <select
                value={fieldOfficerFilter}
                onChange={(e) => setFieldOfficerFilter(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900 shadow-sm"
              >
                <option value="all">All Officers</option>
                {officerOptions.map((officer) => (
                  <option key={officer} value={officer.toLowerCase()}>
                    {officer}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setFieldOfficerFilter('all');
                  setLoanIdFilter('');
                  setCustomerNoFilter('');
                  setCustomerNicFilter('');
                  setCustomerNameFilter('');
                  setSelectedLoanId(null);
                  setIsHistoryModalOpen(false);
                  setQuery('');
                  setShowDeleted(false);
                }}
                className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-slate-100 to-cyan-50 hover:from-slate-200 hover:to-cyan-100 text-slate-700 text-sm font-semibold border border-slate-200"
              >
                Reset Filters
              </button>
            </div>
          </div>

          {canDeletePayments && (
            <div className="mt-2 flex items-center justify-end">
              <label className="inline-flex items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-800">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="h-4 w-4 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                />
                Show Deleted Records
              </label>
            </div>
          )}

          <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 rounded-2xl border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/30 p-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Loan ID</label>
              <input
                value={loanIdFilter}
                onChange={(e) => {
                  setSelectedLoanId(null);
                  setIsHistoryModalOpen(false);
                  setLoanIdFilter(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900 shadow-sm"
                placeholder="e.g. 120"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Loan Code / Customer No</label>
              <input
                value={customerNoFilter}
                onChange={(e) => {
                  setSelectedLoanId(null);
                  setIsHistoryModalOpen(false);
                  setCustomerNoFilter(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900 shadow-sm"
                placeholder="e.g. RL-001"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Customer NIC</label>
              <input
                value={customerNicFilter}
                onChange={(e) => {
                  setSelectedLoanId(null);
                  setIsHistoryModalOpen(false);
                  setCustomerNicFilter(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900 shadow-sm"
                placeholder="NIC / passport"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Customer Name</label>
              <input
                value={customerNameFilter}
                onChange={(e) => {
                  setSelectedLoanId(null);
                  setIsHistoryModalOpen(false);
                  setCustomerNameFilter(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900 shadow-sm"
                placeholder="Customer name"
              />
            </div>
          </div>

          {showLoanLookup && (
            <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-3">
              <p className="text-xs font-semibold text-cyan-800 uppercase tracking-wide mb-2">Matching Loans</p>
              {matchingLoans.length === 0 ? (
                <p className="text-sm text-slate-600">No matching loans found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-auto pr-1">
                  {matchingLoans.map((loan) => (
                    <button
                      key={loan.id}
                      type="button"
                      onClick={() => {
                        setSelectedLoanId(loan.id);
                        setLoanIdFilter(String(loan.id));
                        setCustomerNoFilter(loan.customer_no);
                        setCustomerNicFilter(loan.customer_nic === '-' ? '' : loan.customer_nic);
                        setCustomerNameFilter(loan.customer_name === '-' ? '' : loan.customer_name);
                        setIsHistoryModalOpen(true);
                      }}
                      className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                        selectedLoanId === loan.id
                          ? 'border-cyan-300 bg-white text-cyan-900'
                          : 'border-cyan-100 bg-white/80 hover:bg-white text-slate-700'
                      }`}
                    >
                      <p className="text-sm font-semibold">{loan.loan_code || '-'} | {loan.customer_no}</p>
                      <p className="text-xs text-slate-600">{loan.customer_name} | NIC: {loan.customer_nic}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {filteredPayments.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-100/60 to-teal-100/40 p-8 text-sm text-slate-700 text-center">
              No payment records found.
            </div>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100 shadow-[0_18px_34px_-24px_rgba(8,47,73,0.45)]">
                <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                  <thead className="bg-gradient-to-r from-cyan-50 via-sky-50 to-emerald-50/60 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Date & Time</th>
                      <th className="px-3 py-2 font-semibold">Loan Code</th>
                      <th className="px-3 py-2 font-semibold">Customer No</th>
                      <th className="px-3 py-2 font-semibold">Customer</th>
                      <th className="px-3 py-2 font-semibold">Customer NIC</th>
                      <th className="px-3 py-2 font-semibold">Field Officer</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Reference</th>
                      <th className="px-3 py-2 font-semibold">Collected</th>
                      <th className="px-3 py-2 font-semibold">Capital</th>
                      <th className="px-3 py-2 font-semibold">Interest</th>
                      <th className="px-3 py-2 font-semibold">Penalty</th>
                      <th className="px-3 py-2 font-semibold">Note</th>
                      <th className="px-3 py-2 font-semibold">Record</th>
                      <th className="px-3 py-2 font-semibold">Deleted By</th>
                      {canDeletePayments && <th className="px-3 py-2 font-semibold">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPayments.map((row) => (
                      <tr key={row.id} className="border-b border-cyan-100/90 last:border-b-0 odd:bg-white even:bg-cyan-50/25 hover:bg-cyan-50/55 transition-colors">
                        <td className="px-3 py-2">{formatDisplayDateTime(row.collection_date, row.created_at)}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.loan_code || '-'}</td>
                        <td className="px-3 py-2">{row.loanRequest?.customer_no || row.customer_no || '-'}</td>
                        <td className="px-3 py-2">{row.loanRequest?.customer_name || row.customer_name || '-'}</td>
                        <td className="px-3 py-2">{row.customer_nic || '-'}</td>
                        <td className="px-3 py-2">{row.field_officer || '-'}</td>
                        <td className="px-3 py-2 capitalize">{String(row.payment_type || '-').replace('_', ' ')}</td>
                        <td className="px-3 py-2">{row.payment_reference || '-'}</td>
                        <td className="px-3 py-2 font-semibold text-emerald-700">{Number(row.collected_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.capital_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.interest_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.penalty_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{row.note || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${row.is_deleted ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                            {row.is_deleted ? 'Deleted' : 'Active'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {row.is_deleted
                            ? `${row.deleted_by_name || '-'}${row.deletion_reason ? ` (${row.deletion_reason})` : ''}`
                            : '-'}
                        </td>
                        {canDeletePayments && (
                          <td className="px-3 py-2">
                            {row.is_deleted ? (
                              <span className="text-xs text-slate-400">-</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openDeleteConfirm(row.id)}
                                disabled={deletingInvoiceId === row.id}
                                className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingInvoiceId === row.id ? 'Deleting...' : 'Delete'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Showing {filteredPayments.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredPayments.length)} of {filteredPayments.length}
                </p>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600">Rows:</label>
                  <select
                    className="px-2 py-1 rounded-lg border border-cyan-100 bg-white text-sm text-slate-800"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage === 1}
                    className="px-3 py-1.5 rounded-lg border border-cyan-100 bg-white text-sm text-slate-700 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1.5 rounded-lg border border-cyan-100 bg-white text-sm text-slate-700">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-cyan-100 bg-white text-sm text-slate-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {isHistoryModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
          <button
            type="button"
            aria-label="Close payment history modal"
            className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-cyan-950/45 to-slate-900/60 backdrop-blur-[2px]"
            onClick={() => setIsHistoryModalOpen(false)}
          />

          <div className="relative z-10 w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-[28px] border border-white/50 bg-white/85 shadow-[0_40px_110px_-35px_rgba(8,47,73,0.8)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -top-16 -left-10 h-52 w-52 rounded-full bg-cyan-300/40 blur-3xl"></div>
            <div className="pointer-events-none absolute -bottom-20 right-0 h-60 w-60 rounded-full bg-emerald-300/30 blur-3xl"></div>

            <div className="relative border-b border-cyan-100/80 px-5 py-5 md:px-6 bg-gradient-to-r from-cyan-100/80 via-sky-100/70 to-emerald-100/70">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="inline-flex rounded-full border border-cyan-200 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-700">
                    Loan Payment History
                  </p>
                  <h3 className="text-xl font-extrabold text-slate-900 mt-3">
                  {selectedLoan.loan_code || '-'} | {selectedLoan.customer_no}
                  </h3>
                  <p className="text-sm text-slate-700 mt-1.5">
                    {selectedLoan.customer_name} | NIC: {selectedLoan.customer_nic}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="shrink-0 rounded-xl border border-cyan-200 bg-white/90 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-white transition-colors"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-3 sm:px-4 sm:py-3.5 min-h-[84px] flex flex-col justify-between">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500">Payments</p>
                  <p className="text-base sm:text-lg lg:text-xl leading-tight font-extrabold text-slate-900 break-words">{selectedLoanHistoryStats.count}</p>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-3 sm:px-4 sm:py-3.5 min-h-[84px] flex flex-col justify-between">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500">Collected</p>
                  <p className="text-base sm:text-lg lg:text-xl leading-tight font-extrabold text-emerald-700 break-words [overflow-wrap:anywhere]">
                    {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(selectedLoanHistoryStats.collected)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-3 sm:px-4 sm:py-3.5 min-h-[84px] flex flex-col justify-between">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500">Capital</p>
                  <p className="text-base sm:text-lg lg:text-xl leading-tight font-extrabold text-slate-900 break-words [overflow-wrap:anywhere]">
                    {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(selectedLoanHistoryStats.capital)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-3 sm:px-4 sm:py-3.5 min-h-[84px] flex flex-col justify-between">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500">Interest</p>
                  <p className="text-base sm:text-lg lg:text-xl leading-tight font-extrabold text-slate-900 break-words [overflow-wrap:anywhere]">
                    {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(selectedLoanHistoryStats.interest)}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative p-5 md:p-6 overflow-auto max-h-[72vh]">
              {selectedLoanTimeline.length === 0 ? (
                <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/80 to-emerald-50/70 p-10 text-sm text-slate-700 text-center">
                  No payment records found for this loan.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-cyan-100 shadow-[0_12px_30px_-20px_rgba(8,47,73,0.5)]">
                  <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                    <thead className="sticky top-0 z-10 bg-gradient-to-r from-cyan-50 to-sky-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Date & Time</th>
                        <th className="px-3 py-2 font-semibold">Loan Code</th>
                        <th className="px-3 py-2 font-semibold">Customer</th>
                        <th className="px-3 py-2 font-semibold">Field Officer</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Reference</th>
                        <th className="px-3 py-2 font-semibold">Collected</th>
                        <th className="px-3 py-2 font-semibold">Capital</th>
                        <th className="px-3 py-2 font-semibold">Interest</th>
                        <th className="px-3 py-2 font-semibold">Penalty</th>
                        <th className="px-3 py-2 font-semibold">Balance</th>
                        <th className="px-3 py-2 font-semibold">Note</th>
                        <th className="px-3 py-2 font-semibold">Record</th>
                        <th className="px-3 py-2 font-semibold">Deleted By</th>
                        {canDeletePayments && <th className="px-3 py-2 font-semibold">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLoanTimeline.map((row) => (
                        <tr key={row.id} className="border-b border-cyan-100/80 last:border-b-0 odd:bg-white even:bg-cyan-50/25 hover:bg-cyan-50/60 transition-colors">
                          <td className="px-3 py-2">{formatDisplayDateTime(row.date, row.created_at)}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.customer_no}</td>
                          <td className="px-3 py-2">{row.customer_name}</td>
                          <td className="px-3 py-2">{row.field_officer}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
                              row.kind === 'issue'
                                ? 'border-violet-200 bg-violet-50 text-violet-800'
                                : 'border-cyan-200 bg-cyan-50 text-cyan-800'
                            }`}>
                              {String(row.payment_type || '-').replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2">{row.payment_reference}</td>
                          <td className={`px-3 py-2 font-semibold ${row.kind === 'issue' ? 'text-violet-700' : 'text-emerald-700'}`}>
                            {Number(row.collected_amount || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2">{Number(row.capital_amount || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">{Number(row.interest_amount || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">{Number(row.penalty_amount || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 font-semibold text-rose-700">{Number(row.balance || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">{row.note}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${row.is_deleted ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                              {row.is_deleted ? 'Deleted' : 'Active'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            {row.is_deleted
                              ? `${row.deleted_by_name || '-'}${row.deletion_reason ? ` (${row.deletion_reason})` : ''}`
                              : '-'}
                          </td>
                          {canDeletePayments && (
                            <td className="px-3 py-2">
                              {row.kind === 'payment' && !row.is_deleted ? (
                                <button
                                  type="button"
                                  onClick={() => openDeleteConfirm(Number(row.id))}
                                  disabled={deletingInvoiceId === Number(row.id)}
                                  className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingInvoiceId === Number(row.id) ? 'Deleting...' : 'Delete'}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {canDeletePayments && deleteConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close delete confirmation"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
            onClick={closeDeleteConfirm}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Delete Invoice</h3>
            <p className="mt-2 text-sm text-slate-600">
              Deleting this invoice will reverse the loan balance and related repayment values. This action keeps the deleted record for audit history.
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-600">Reason (Optional)</label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Reason for deletion"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteInvoice}
                disabled={deletingInvoiceId !== null}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingInvoiceId !== null ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal.open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close alert"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
            onClick={closeAlert}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-cyan-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">{alertModal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{alertModal.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeAlert}
                className="rounded-lg bg-gradient-to-r from-cyan-600 to-sky-600 px-3.5 py-2 text-sm font-semibold text-white hover:from-cyan-700 hover:to-sky-700"
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
