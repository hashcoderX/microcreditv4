'use client';

import axios from 'axios';
import { getApiBaseUrl, getBackendOrigin, resolveStorageAssetUrl } from '@/lib/api';
import CollectionReceiptBill, {
  type CollectionReceipt,
} from '@/app/components/collections/CollectionReceiptBill';
import MfOfflineBanner from '@/app/components/microfinance/MfOfflineBanner';
import {
  buildScopeKey,
  cacheMfCollectionData,
  enqueueMfCollection,
  loadMfCollectionCache,
} from '@/lib/offline/mfOfflineSync';
import { useMfOffline } from '@/lib/offline/useMfOffline';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type LoanRow = {
  id: number;
  branch_id?: number | string | null;
  field_officer?: string | null;
  field_officer_id?: number | string | null;
  loan_code?: string | null;
  customer_no: string;
  customer_code?: string | null;
  customer_name: string;
  loan_scope: 'route_loan' | 'center_loan' | 'direct_loan';
  mf_route_id?: number | string | null;
  route_name?: string | null;
  route_code?: string | null;
  route?: { id: number; name: string; code: string } | null;
  center?: { id: number; name: string; code: string; meeting_day?: string | null } | null;
  group?: { id: number; name: string; code: string } | null;
  loan_amount?: number | string;
  installment_amount: number | string;
  refundable_amount: number | string;
  penalty_rate?: number | string | null;
  penalty_grace_days?: number | string | null;
  due_date?: string | null;
  next_payment_date?: string | null;
  loan_end_date?: string | null;
  last_pay_date?: string | null;
  collections_max_collection_date?: string | null;
  refund_option?: 'day' | 'week' | 'month' | string;
  arrears_balance?: number | string;
  status: string;
};

type CollectionRow = {
  id?: number;
  mf_loan_request_id: number;
  collected_amount: number | string;
  collection_date?: string;
};

type BulkCollectionMember = {
  loanId: number;
  loanCode: string;
  customerNo: string;
  customerName: string;
  dueDate: string;
  installmentAmount: number;
  outstandingAmount: number;
  amount: string;
  selected: boolean;
};

const normalizeCollectionDate = (row: Record<string, unknown>) => {
  const candidates = [row.collection_date, row.collectionDate, row.created_at, row.createdAt];

  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed.includes('T') ? trimmed.split('T')[0] : trimmed.slice(0, 10);
      }
    }

    if (typeof candidate === 'object' && candidate !== null && 'date' in candidate) {
      const nested = String((candidate as { date?: string }).date || '').trim();
      if (nested) {
        return nested.includes('T') ? nested.split('T')[0] : nested.slice(0, 10);
      }
    }
  }

  return '';
};

const normalizeCollectionRow = (row: Record<string, unknown>): CollectionRow => ({
  id: Number(row.id || 0),
  mf_loan_request_id: Number(
    row.mf_loan_request_id ?? row.loan_request_id ?? (row.loan_request as { id?: number } | undefined)?.id ?? 0
  ),
  collected_amount: row.collected_amount as number | string,
  collection_date: normalizeCollectionDate(row),
});

type AuthUser = {
  id: number;
  name?: string;
  email?: string;
  branch_id?: number | null;
  designation?: { id: number; name: string } | null;
  employee?: { id: number; first_name?: string; last_name?: string; email?: string } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

type CompanyInfo = {
  id: number;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  logo_path?: string | null;
  logo_url?: string | null;
};

const API_BASE = getApiBaseUrl();

export default function CollectionManagementPage() {
  const router = useRouter();
  const backendOrigin = useMemo(() => getBackendOrigin(), []);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [activeMode, setActiveMode] = useState<'center' | 'route' | 'office' | 'today' | 'next'>('center');
  const [finderCustomerNo, setFinderCustomerNo] = useState('');
  const [officeView, setOfficeView] = useState<'all' | 'today_debt' | 'date_debt'>('all');
  const [debtTargetDate, setDebtTargetDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [query, setQuery] = useState('');
  const [loanOfficerFilter, setLoanOfficerFilter] = useState('all');
  const [loanRouteFilter, setLoanRouteFilter] = useState('all');
  const [loanCenterFilter, setLoanCenterFilter] = useState('all');
  const [selectedCenterId, setSelectedCenterId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [collectModal, setCollectModal] = useState<{
    open: boolean;
    loanId: number | null;
    loanCode: string;
    customerName: string;
    customerNo: string;
    amount: string;
    paymentType: 'cash' | 'check' | 'bank_transfer';
    paymentReference: string;
    installmentAmount: number;
    refundableAmount: number;
    dueDate: string;
    penaltyRate: number;
    graceDays: number;
    note: string;
    date: string;
  }>({
    open: false,
    loanId: null,
    loanCode: '',
    customerName: '',
    customerNo: '',
    amount: '',
    paymentType: 'cash',
    paymentReference: '',
    installmentAmount: 0,
    refundableAmount: 0,
    dueDate: '',
    penaltyRate: 0,
    graceDays: 0,
    note: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [collectSaving, setCollectSaving] = useState(false);
  const [bulkCollectSaving, setBulkCollectSaving] = useState(false);
  const [bulkCollectModal, setBulkCollectModal] = useState<{
    open: boolean;
    centerId: number | null;
    centerName: string;
    groupId: number | null;
    groupName: string;
    groupCode: string;
    date: string;
    paymentType: 'cash' | 'check' | 'bank_transfer';
    paymentReference: string;
    note: string;
    members: BulkCollectionMember[];
  }>({
    open: false,
    centerId: null,
    centerName: '',
    groupId: null,
    groupName: '',
    groupCode: '',
    date: new Date().toISOString().split('T')[0],
    paymentType: 'cash',
    paymentReference: '',
    note: '',
    members: [],
  });
  const [cacheMeta, setCacheMeta] = useState<{ available: boolean; cachedAt: string | null }>({
    available: false,
    cachedAt: null,
  });
  const [noticeModal, setNoticeModal] = useState({ open: false, title: '', message: '' });
  const [receiptModal, setReceiptModal] = useState<{ open: boolean; receipt: CollectionReceipt | null }>({
    open: false,
    receipt: null,
  });
  const [loanDetailsModal, setLoanDetailsModal] = useState<{ open: boolean; loan: LoanRow | null }>({
    open: false,
    loan: null,
  });
  const [receiptCompany, setReceiptCompany] = useState<{
    name: string;
    address: string;
    contactNo: string;
    logoUrl: string;
  }>({
    name: 'BMS Collection Center',
    address: '',
    contactNo: '',
    logoUrl: '/media/company/logo',
  });

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
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
        if (!key.startsWith('mf_collections_widget_')) continue;
        if (row?.is_visible === false) nextHidden.add(key);
      }
      setHiddenWidgetKeys(nextHidden);
    } catch {
      setHiddenWidgetKeys(new Set());
    } finally {
      setLoadingWidgets(false);
    }
  }, []);

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean) => {
      if (!token) return false;
      try {
        await axios.patch(
          `${API_BASE}/dashboard/widgets`,
          { widget_key: widgetKey, is_visible: isVisible },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );
        return true;
      } catch {
        return false;
      }
    },
    [token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string) => {
      const previous = new Set(hiddenWidgetKeys);
      const next = new Set(hiddenWidgetKeys);
      next.add(widgetKey);
      setHiddenWidgetKeys(next);

      const ok = await saveWidgetPreference(widgetKey, false);
      if (!ok) {
        setHiddenWidgetKeys(previous);
        setNoticeModal({
          open: true,
          title: 'Widget Update Failed',
          message: 'Failed to hide this card. Please try again.',
        });
      }
    },
    [hiddenWidgetKeys, saveWidgetPreference]
  );

  const normalizeText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const designationName = normalizeText(String(authUser?.designation?.name || ''));
  const roleNames = (authUser?.roles || []).map((role) => normalizeText(String(role?.name || '')));

  const hasRoleOrDesignation = (keywords: string[]) => {
    return keywords.some((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      if (normalizedKeyword === '') return false;

      if (designationName.includes(normalizedKeyword)) return true;
      return roleNames.some((name) => name.includes(normalizedKeyword));
    });
  };

  const isFieldOfficer = hasRoleOrDesignation(['field officer']);
  const isAdmin =
    hasRoleOrDesignation(['admin']) || normalizeText(String(authUser?.email || '')) === 'superadmin softcodelk com';

  // Allow all logged-in roles to access collection modes.
  const canViewOfficeCollection = true;
  const canViewCenterRouteCollections = true;

  const officerNameCandidates = useMemo(() => {
    const fullName = [authUser?.employee?.first_name || '', authUser?.employee?.last_name || '']
      .join(' ')
      .trim();

    return [authUser?.name, fullName, authUser?.email, authUser?.employee?.email]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value, index, arr) => value !== '' && arr.indexOf(value) === index);
  }, [authUser]);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }),
    [token]
  );

  const resolveCompanyLogoUrl = useCallback(
    (company: CompanyInfo | null) => {
      const direct = String(company?.logo_url || '').trim();
      if (direct) {
        const normalized = resolveStorageAssetUrl(direct);
        return normalized.startsWith('/') ? `${backendOrigin}${normalized}` : normalized;
      }

      const path = String(company?.logo_path || '').trim();
      if (path) {
        const normalized = resolveStorageAssetUrl(path);
        return normalized.startsWith('/') ? `${backendOrigin}${normalized}` : normalized;
      }

      return '/media/company/logo';
    },
    [backendOrigin]
  );

  const scopeKey = useMemo(
    () => buildScopeKey(authUser?.branch_id, isFieldOfficer ? authUser?.name : null),
    [authUser?.branch_id, authUser?.name, isFieldOfficer]
  );

  const loadLoans = useCallback(async () => {
    if (!token) return;

    setLoading(true);

    const applyCacheMeta = (available: boolean, cachedAt: string | null) => {
      setCacheMeta({ available, cachedAt });
    };

    const readCache = async () => {
      const cached = await loadMfCollectionCache(scopeKey);
      if (!cached) {
        applyCacheMeta(false, null);
        return false;
      }

      setLoans(cached.loans as LoanRow[]);
      setCollections(
        (cached.collections as Record<string, unknown>[]).map((row) => normalizeCollectionRow(row))
      );
      applyCacheMeta(true, cached.cachedAt);
      return true;
    };

    const online = typeof navigator === 'undefined' ? true : navigator.onLine;

    if (!online) {
      await readCache();
      setLoading(false);
      return;
    }

    try {
      const [loanResponse, collectionResponse] = await Promise.all([
        axios.get(`${API_BASE}/microfinance/loan-requests`, {
          headers,
          params:
            isFieldOfficer && authUser?.branch_id
              ? {
                  status: 'approved',
                  branch_id: authUser.branch_id,
                  field_officer: authUser?.name || undefined,
                }
              : { status: 'approved' },
        }),
        axios.get(`${API_BASE}/microfinance/collections`, {
          headers,
        }),
      ]);

      const loanRows = Array.isArray(loanResponse.data) ? loanResponse.data : [];
      const collectionRows = Array.isArray(collectionResponse.data) ? collectionResponse.data : [];
      const normalizedCollections = collectionRows.map((row) =>
        normalizeCollectionRow(row as Record<string, unknown>)
      );

      setLoans(loanRows);
      setCollections(normalizedCollections);

      const cachedAt = new Date().toISOString();
      await cacheMfCollectionData(scopeKey, loanRows, normalizedCollections);
      applyCacheMeta(true, cachedAt);
    } catch {
      const restored = await readCache();
      if (!restored) {
        setLoans([]);
        setCollections([]);
      }
    } finally {
      setLoading(false);
    }
  }, [token, headers, isFieldOfficer, authUser?.branch_id, authUser?.name, scopeKey]);

  const refreshAuthUserSnapshot = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_BASE}/user`, { headers });
      if (response?.data) {
        setAuthUser(response.data as AuthUser);
        localStorage.setItem('auth_user', JSON.stringify(response.data));
      }
    } catch {
      // Ignore snapshot refresh failures; collection should still succeed.
    }
  }, [token, headers]);

  const { isOnline, pendingCount, syncing, lastSyncMessage, syncNow, refreshPendingCount } = useMfOffline(
    token,
    headers,
    () => {
      void loadLoans();
    }
  );

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
  }, [fetchWidgetPreferences, router]);

  useEffect(() => {
    if (!token) return;

    const loadReceiptCompany = async () => {
      try {
        const response = await axios.get(`${API_BASE}/companies`, { headers });
        const list = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        const branchId = Number(authUser?.branch_id || 0);
        const matched = (list as CompanyInfo[]).find((item) => Number(item.id) === branchId) || (list[0] as CompanyInfo | undefined);

        if (!matched) return;

        setReceiptCompany({
          name: String(matched.name || 'BMS Collection Center'),
          address: String(matched.address || ''),
          contactNo: String(matched.phone || ''),
          logoUrl: resolveCompanyLogoUrl(matched),
        });
      } catch {
        setReceiptCompany((prev) => ({
          ...prev,
          logoUrl: '/media/company/logo',
        }));
      }
    };

    loadReceiptCompany();
  }, [authUser?.branch_id, headers, resolveCompanyLogoUrl, token]);

  useEffect(() => {
    if (!token) return;
    void loadLoans();
  }, [token, loadLoans]);

  const scopedLoans = useMemo(() => {
    if (!isFieldOfficer) return loans;

    const branchId = Number(authUser?.branch_id || 0);
    const authOfficerId = Number(authUser?.employee?.id || 0);

    return loans.filter((loan) => {
      const loanBranchId = Number(loan.branch_id || 0);
      const loanOfficer = String(loan.field_officer || '').trim().toLowerCase();
      const loanOfficerId = Number(loan.field_officer_id || 0);

      const isBranchMatch = branchId > 0 ? loanBranchId === branchId : true;
      const isOfficerIdMatch = authOfficerId > 0 && loanOfficerId > 0 ? loanOfficerId === authOfficerId : false;
      const isOfficerNameMatch = loanOfficer !== '' ? officerNameCandidates.includes(loanOfficer) : false;
      const isOfficerMatch = isOfficerIdMatch || isOfficerNameMatch;

      return isBranchMatch && isOfficerMatch;
    });
  }, [loans, isFieldOfficer, authUser?.branch_id, authUser?.employee?.id, officerNameCandidates]);

  const paidTotalByLoan = useMemo(() => {
    const map = new Map<number, number>();

    collections.forEach((row) => {
      const loanId = Number(row.mf_loan_request_id || 0);
      if (!loanId) return;

      const amount = Number(row.collected_amount || 0);
      map.set(loanId, (map.get(loanId) || 0) + amount);
    });

    return map;
  }, [collections]);

  const lastPayDateByLoan = useMemo(() => {
    const map = new Map<number, string>();

    collections.forEach((row) => {
      const loanId = Number(row.mf_loan_request_id || 0);
      const collectionDate = String(row.collection_date || '').trim();
      if (!loanId || !collectionDate) return;

      const datePart = collectionDate.includes('T') ? collectionDate.split('T')[0] : collectionDate;
      const existing = map.get(loanId);

      if (!existing || datePart > existing) {
        map.set(loanId, datePart);
      }
    });

    return map;
  }, [collections]);

  const getPaidTotal = (loanId: number) => paidTotalByLoan.get(loanId) || 0;

  const getLastPayDate = (loan: LoanRow) => {
    const fromLoan = String(loan.last_pay_date || loan.collections_max_collection_date || '').trim();
    if (fromLoan) {
      return fromLoan.includes('T') ? fromLoan.split('T')[0] : fromLoan.slice(0, 10);
    }

    return lastPayDateByLoan.get(loan.id) || null;
  };
  const getOutstandingBalance = (loan: LoanRow) => {
    const totalPayable = Number(loan.refundable_amount || 0);
    const paidTotal = getPaidTotal(loan.id);
    return Math.max(totalPayable - paidTotal, 0);
  };

  const normalizeDateKey = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.includes('T') ? raw.split('T')[0] : raw.slice(0, 10);
  };

  const hasCollectionOnDate = (loanId: number, dateKey: string) => {
    if (!dateKey) return false;

    return collections.some((row) => {
      const rowLoanId = Number(row.mf_loan_request_id || 0);
      if (rowLoanId !== loanId) return false;

      const collectedOn = normalizeDateKey(row.collection_date || '');
      return collectedOn === dateKey;
    });
  };

  const getLoanRecordRowState = (loan: LoanRow, targetDate: string): 'paid' | 'pending' | 'neutral' => {
    const dueDate = normalizeDateKey(loan.due_date || '');
    if (!targetDate || dueDate !== targetDate) return 'neutral';

    if (hasCollectionOnDate(loan.id, targetDate)) return 'paid';
    return 'pending';
  };

  const getLoanRecordRowClass = (loan: LoanRow, targetDate: string) => {
    const state = getLoanRecordRowState(loan, targetDate);

    if (state === 'paid') {
      return 'border-b border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 transition-colors cursor-pointer';
    }

    if (state === 'pending') {
      return 'border-b border-rose-200 bg-rose-50/60 hover:bg-rose-100/70 transition-colors cursor-pointer';
    }

    return 'border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors cursor-pointer';
  };

  const alignToMeetingDay = (date: Date, meetingDay?: string | null) => {
    const dayName = String(meetingDay || '')
      .trim()
      .toLowerCase();

    if (!dayName) {
      return new Date(date);
    }

    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    if (!(dayName in dayMap)) {
      return new Date(date);
    }

    const cursor = new Date(date);
    const delta = (dayMap[dayName] - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + delta);
    return cursor;
  };

  const shiftDateByRefundOption = (date: Date, refundOption: string, meetingDay?: string | null) => {
    const next = new Date(date);

    if (refundOption === 'day') {
      next.setDate(next.getDate() + 1);
      return alignToMeetingDay(next, meetingDay);
    }

    if (refundOption === 'week') {
      next.setDate(next.getDate() + 7);
      return alignToMeetingDay(next, meetingDay);
    }

    next.setMonth(next.getMonth() + 1);
    return alignToMeetingDay(next, meetingDay);
  };

  const getProjectedArrearsBalance = (loan: LoanRow) => {
    let balance = Number(loan.arrears_balance || 0);
    const installmentAmount = Number(loan.installment_amount || 0);
    if (installmentAmount <= 0 || !loan.due_date) return balance;

    let dueCursor = alignToMeetingDay(new Date(`${loan.due_date}T00:00:00`), loan.center?.meeting_day);
    if (Number.isNaN(dueCursor.getTime())) return balance;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mode = String(loan.refund_option || 'month');

    while (dueCursor <= today) {
      balance += installmentAmount;
      dueCursor = shiftDateByRefundOption(dueCursor, mode, loan.center?.meeting_day);
    }

    return balance;
  };

  const getExtraPayment = (loan: LoanRow) => {
    const projectedBalance = getProjectedArrearsBalance(loan);
    return Math.max(-projectedBalance, 0);
  };

  const getArrearsAmount = (loan: LoanRow) => {
    const projectedBalance = getProjectedArrearsBalance(loan);
    return Math.max(projectedBalance, 0);
  };

  const formatDateDisplay = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';

    const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
    const parts = datePart.split('-');

    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);

      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const parsed = new Date(year, month - 1, day);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        }
      }
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;

    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const isLoanCodeText = (value: string) => /^(RL-|CL-|DL-)/i.test(value.trim());

  const getFinderLoanCode = (loan: LoanRow) => {
    const loanCodeField = String(loan.loan_code || '').trim();
    return loanCodeField || '-';
  };

  const getFinderCustomerNo = (loan: LoanRow) => {
    const customerNoField = String(loan.customer_no || '').trim();
    return customerNoField || '-';
  };

  const scopeType = activeMode === 'center' ? 'center_loan' : activeMode === 'route' ? 'route_loan' : null;

  const commonFinderResults = useMemo(() => {
    const keyword = finderCustomerNo.trim().toLowerCase();
    if (!keyword) return [] as LoanRow[];

    return scopedLoans
      .filter((loan) => {
        const customerNo = String(loan.customer_no || '').toLowerCase();
        const customerCode = String(loan.customer_code || '').toLowerCase();
        return customerNo.includes(keyword) || customerCode.includes(keyword);
      })
      .sort((a, b) => String(a.customer_no || '').localeCompare(String(b.customer_no || '')))
      .slice(0, 20);
  }, [finderCustomerNo, scopedLoans]);

  const filteredLoans = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const selectedRouteId = loanRouteFilter === 'all' ? null : Number(loanRouteFilter);
    const selectedCenterIdByFilter = loanCenterFilter === 'all' ? null : Number(loanCenterFilter);

    return scopedLoans.filter((loan) => {
      if (loanOfficerFilter !== 'all') {
        const officerName = String(loan.field_officer || '').trim().toLowerCase();
        if (officerName !== loanOfficerFilter) return false;
      }

      if (selectedRouteId) {
        const routeId = Number(loan.route?.id ?? loan.mf_route_id ?? 0);
        if (routeId !== selectedRouteId) return false;
      }

      if (selectedCenterIdByFilter) {
        const centerId = Number(loan.center?.id || 0);
        if (centerId !== selectedCenterIdByFilter) return false;
      }

      if (scopeType && loan.loan_scope !== scopeType) return false;
      if (!keyword) return true;

      const haystack = [
        loan.customer_no || '',
        loan.customer_name || '',
        loan.route?.name || loan.route_name || '',
        loan.center?.name || '',
        loan.group?.name || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [scopedLoans, query, scopeType, loanOfficerFilter, loanRouteFilter, loanCenterFilter]);

  const loanOfficerOptions = useMemo(() => {
    return Array.from(
      new Set(
        scopedLoans
          .map((loan) => String(loan.field_officer || '').trim())
          .filter((name) => name !== '')
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [scopedLoans]);

  const loanRouteOptions = useMemo(() => {
    const routeMap = new Map<number, string>();

    scopedLoans.forEach((loan) => {
      const routeId = Number(loan.route?.id ?? loan.mf_route_id ?? 0);
      if (!routeId) return;

      const routeName = String(loan.route?.name || loan.route_name || `Route ${routeId}`).trim();
      routeMap.set(routeId, routeName);
    });

    return Array.from(routeMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedLoans]);

  const loanCenterOptions = useMemo(() => {
    const centerMap = new Map<number, { id: number; name: string; routeId: number | null }>();
    const selectedRouteId = loanRouteFilter === 'all' ? null : Number(loanRouteFilter);

    scopedLoans.forEach((loan) => {
      const centerId = Number(loan.center?.id || 0);
      if (!centerId) return;

      centerMap.set(centerId, {
        id: centerId,
        name: String(loan.center?.name || `Center ${centerId}`).trim(),
        routeId: Number(loan.route?.id ?? loan.mf_route_id ?? 0) || null,
      });
    });

    return Array.from(centerMap.values())
      .filter((center) => (selectedRouteId ? center.routeId === selectedRouteId : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedLoans, loanRouteFilter]);

  const filteredScopedLoans = useMemo(() => {
    const selectedRouteId = loanRouteFilter === 'all' ? null : Number(loanRouteFilter);
    const selectedCenterIdByFilter = loanCenterFilter === 'all' ? null : Number(loanCenterFilter);

    return scopedLoans.filter((loan) => {
      if (loanOfficerFilter !== 'all') {
        const officerName = String(loan.field_officer || '').trim().toLowerCase();
        if (officerName !== loanOfficerFilter) return false;
      }

      if (selectedRouteId) {
        const routeId = Number(loan.route?.id ?? loan.mf_route_id ?? 0);
        if (routeId !== selectedRouteId) return false;
      }

      if (selectedCenterIdByFilter) {
        const centerId = Number(loan.center?.id || 0);
        if (centerId !== selectedCenterIdByFilter) return false;
      }

      return true;
    });
  }, [scopedLoans, loanOfficerFilter, loanRouteFilter, loanCenterFilter]);

  const routeCollections = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const routeMap = new Map<
      number,
      {
        routeId: number;
        routeName: string;
        routeCode: string;
        loanCount: number;
        totalInstallment: number;
        nextDueDate: string | null;
      }
    >();

    const getRouteMeta = (loan: LoanRow) => {
      const routeId = Number(loan.route?.id ?? loan.mf_route_id ?? 0);
      const routeName = loan.route?.name || loan.route_name || (routeId ? `Route ${routeId}` : '-');
      const routeCode = loan.route?.code || loan.route_code || (routeId ? `R${String(routeId).padStart(3, '0')}` : '-');
      return { routeId, routeName, routeCode };
    };

    filteredScopedLoans
      .filter((loan) => {
        if (loan.loan_scope !== 'route_loan') return false;
        const routeId = Number(loan.route?.id ?? loan.mf_route_id ?? 0);
        return routeId > 0;
      })
      .forEach((loan) => {
        const { routeId, routeName, routeCode } = getRouteMeta(loan);
        const existing = routeMap.get(routeId) || {
          routeId,
          routeName,
          routeCode,
          loanCount: 0,
          totalInstallment: 0,
          nextDueDate: null,
        };

        existing.loanCount += 1;
        existing.totalInstallment += Number(loan.installment_amount || 0);

        if (loan.due_date) {
          if (!existing.nextDueDate || loan.due_date < existing.nextDueDate) {
            existing.nextDueDate = loan.due_date;
          }
        }

        routeMap.set(routeId, existing);
      });

    const rows = Array.from(routeMap.values());

    if (!keyword) {
      return rows.sort((a, b) => a.routeName.localeCompare(b.routeName));
    }

    return rows
      .filter((row) => [row.routeName, row.routeCode].join(' ').toLowerCase().includes(keyword))
      .sort((a, b) => a.routeName.localeCompare(b.routeName));
  }, [filteredScopedLoans, query]);

  const centerCollections = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const centerMap = new Map<
      number,
      {
        centerId: number;
        centerName: string;
        centerCode: string;
        routeName: string;
        routeCode: string;
        loanCount: number;
        totalInstallment: number;
        nextDueDate: string | null;
      }
    >();

    filteredScopedLoans
      .filter((loan) => loan.loan_scope === 'center_loan' && loan.center?.id)
      .forEach((loan) => {
        const centerId = loan.center!.id;
        const existing = centerMap.get(centerId) || {
          centerId,
          centerName: loan.center?.name || '-',
          centerCode: loan.center?.code || '-',
          routeName: loan.route?.name || '-',
          routeCode: loan.route?.code || '-',
          loanCount: 0,
          totalInstallment: 0,
          nextDueDate: null,
        };

        existing.loanCount += 1;
        existing.totalInstallment += Number(loan.installment_amount || 0);

        if (loan.due_date) {
          if (!existing.nextDueDate || loan.due_date < existing.nextDueDate) {
            existing.nextDueDate = loan.due_date;
          }
        }

        centerMap.set(centerId, existing);
      });

    const rows = Array.from(centerMap.values());

    if (!keyword) {
      return rows.sort((a, b) => a.centerName.localeCompare(b.centerName));
    }

    return rows
      .filter((row) => {
        const haystack = [row.centerName, row.centerCode, row.routeName, row.routeCode].join(' ').toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => a.centerName.localeCompare(b.centerName));
  }, [filteredScopedLoans, query]);

  const groupCollections = useMemo(() => {
    if (!selectedCenterId) return [];

    const keyword = query.trim().toLowerCase();
    const groupMap = new Map<
      number,
      {
        groupId: number;
        groupName: string;
        groupCode: string;
        loanCount: number;
        totalInstallment: number;
        nextDueDate: string | null;
      }
    >();

    filteredScopedLoans
      .filter((loan) => loan.loan_scope === 'center_loan' && loan.center?.id === selectedCenterId)
      .forEach((loan) => {
        const groupId = loan.group?.id || 0;
        const existing = groupMap.get(groupId) || {
          groupId,
          groupName: loan.group?.name || 'No Group',
          groupCode: loan.group?.code || '-',
          loanCount: 0,
          totalInstallment: 0,
          nextDueDate: null,
        };

        existing.loanCount += 1;
        existing.totalInstallment += Number(loan.installment_amount || 0);

        if (loan.due_date) {
          if (!existing.nextDueDate || loan.due_date < existing.nextDueDate) {
            existing.nextDueDate = loan.due_date;
          }
        }

        groupMap.set(groupId, existing);
      });

    const rows = Array.from(groupMap.values());

    if (!keyword) {
      return rows.sort((a, b) => a.groupName.localeCompare(b.groupName));
    }

    return rows
      .filter((row) => [row.groupName, row.groupCode].join(' ').toLowerCase().includes(keyword))
      .sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [filteredScopedLoans, selectedCenterId, query]);

  const selectedCenter = useMemo(
    () => centerCollections.find((row) => row.centerId === selectedCenterId) || null,
    [centerCollections, selectedCenterId]
  );

  const selectedGroup = useMemo(
    () => groupCollections.find((row) => row.groupId === selectedGroupId) || null,
    [groupCollections, selectedGroupId]
  );

  const selectedRoute = useMemo(
    () => routeCollections.find((row) => row.routeId === selectedRouteId) || null,
    [routeCollections, selectedRouteId]
  );

  const groupLoanRecords = useMemo(() => {
    if (!selectedCenterId || selectedGroupId === null) return [];

    const keyword = query.trim().toLowerCase();

    const rows = filteredScopedLoans.filter(
      (loan) =>
        loan.loan_scope === 'center_loan' &&
        loan.center?.id === selectedCenterId &&
        (loan.group?.id || 0) === selectedGroupId
    );

    if (!keyword) return rows;

    return rows.filter((loan) => {
      const haystack = [loan.customer_no, loan.customer_name, loan.group?.name || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [filteredScopedLoans, selectedCenterId, selectedGroupId, query]);

  const routeLoanRecords = useMemo(() => {
    if (!selectedRouteId) return [];

    const keyword = query.trim().toLowerCase();

    const rows = filteredScopedLoans.filter(
      (loan) =>
        loan.loan_scope === 'route_loan' && Number(loan.route?.id ?? loan.mf_route_id ?? 0) === selectedRouteId
    );

    if (!keyword) return rows;

    return rows.filter((loan) => {
      const haystack = [loan.customer_no, loan.customer_name, loan.route?.name || loan.route_name || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [filteredScopedLoans, selectedRouteId, query]);

  const totalInstallment = useMemo(
    () => filteredLoans.reduce((sum, loan) => sum + Number(loan.installment_amount || 0), 0),
    [filteredLoans]
  );

  const todayDate = new Date().toISOString().slice(0, 10);
  const officeDebtDate =
    officeView === 'today_debt' ? todayDate : officeView === 'date_debt' ? debtTargetDate : null;

  const officeDisplayLoans = useMemo(() => {
    if (activeMode === 'today') {
      return filteredLoans.filter((loan) => {
        const dueDate = String(loan.due_date || '').slice(0, 10);
        return dueDate === todayDate;
      });
    }

    if (activeMode === 'next') {
      return filteredLoans.filter((loan) => {
        const dueDate = String(loan.due_date || '').slice(0, 10);
        return dueDate === debtTargetDate;
      });
    }

    if (activeMode !== 'office') return filteredLoans;
    if (!officeDebtDate) return filteredLoans;

    return filteredLoans.filter((loan) => {
      const dueDate = String(loan.due_date || '').slice(0, 10);
      return dueDate === officeDebtDate;
    });
  }, [activeMode, officeDebtDate, filteredLoans, todayDate, debtTargetDate]);

  const loanRecordHighlightDate =
    activeMode === 'today'
      ? todayDate
      : activeMode === 'next'
        ? debtTargetDate
        : activeMode === 'office' && officeDebtDate
          ? officeDebtDate
          : todayDate;

  const currentLoanRecordRows =
    activeMode === 'center'
      ? selectedGroupId !== null
        ? groupLoanRecords
        : []
      : activeMode === 'route'
        ? selectedRouteId !== null
          ? routeLoanRecords
          : []
        : officeDisplayLoans;

  const highlightedPaidCount = currentLoanRecordRows.filter(
    (loan) => getLoanRecordRowState(loan, loanRecordHighlightDate) === 'paid'
  ).length;

  const highlightedPendingCount = currentLoanRecordRows.filter(
    (loan) => getLoanRecordRowState(loan, loanRecordHighlightDate) === 'pending'
  ).length;

  const officeDebtAmount = useMemo(
    () =>
      officeDisplayLoans.reduce(
        (sum, loan) => sum + Math.min(Number(loan.installment_amount || 0), getOutstandingBalance(loan)),
        0
      ),
    [officeDisplayLoans]
  );

  const withDueDateCount = useMemo(
    () => filteredLoans.filter((loan) => Boolean(loan.due_date)).length,
    [filteredLoans]
  );

  const displayRecordCount =
    activeMode === 'center'
      ? selectedGroupId !== null
        ? groupLoanRecords.length
        : selectedCenterId
          ? groupCollections.length
          : centerCollections.length
      : activeMode === 'route'
        ? selectedRouteId
          ? routeLoanRecords.length
          : routeCollections.length
      : officeDisplayLoans.length;

  const displayInstallmentTotal =
    activeMode === 'center'
      ? selectedGroupId !== null
        ? groupLoanRecords.reduce((sum, row) => sum + Number(row.installment_amount || 0), 0)
        : selectedCenterId
          ? groupCollections.reduce((sum, row) => sum + Number(row.totalInstallment || 0), 0)
          : centerCollections.reduce((sum, row) => sum + Number(row.totalInstallment || 0), 0)
      : activeMode === 'route'
        ? selectedRouteId
          ? routeLoanRecords.reduce((sum, row) => sum + Number(row.installment_amount || 0), 0)
          : routeCollections.reduce((sum, row) => sum + Number(row.totalInstallment || 0), 0)
      : activeMode === 'today' || activeMode === 'next' || officeDebtDate
        ? officeDebtAmount
        : totalInstallment;

  const displayDueDateCount =
    activeMode === 'center'
      ? selectedGroupId !== null
        ? groupLoanRecords.filter((row) => Boolean(row.due_date)).length
        : selectedCenterId
          ? groupCollections.filter((row) => Boolean(row.nextDueDate)).length
          : centerCollections.filter((row) => Boolean(row.nextDueDate)).length
      : activeMode === 'route'
        ? selectedRouteId
          ? routeLoanRecords.filter((row) => Boolean(row.due_date)).length
          : routeCollections.filter((row) => Boolean(row.nextDueDate)).length
      : officeDisplayLoans.filter((loan) => Boolean(loan.due_date)).length;

  useEffect(() => {
    if (activeMode !== 'center' && selectedCenterId !== null) {
      setSelectedCenterId(null);
    }
    if (activeMode !== 'center' && selectedGroupId !== null) {
      setSelectedGroupId(null);
    }
    if (activeMode !== 'route') {
      setSelectedRouteId((prev) => (prev !== null ? null : prev));
    }
  }, [activeMode, selectedCenterId, selectedGroupId]);

  useEffect(() => {
    if (selectedCenterId === null && selectedGroupId !== null) {
      setSelectedGroupId(null);
    }
  }, [selectedCenterId, selectedGroupId]);

  useEffect(() => {
    if (activeMode !== 'office' && officeView !== 'all') {
      setOfficeView('all');
    }
  }, [activeMode, officeView]);

  const openCollectModal = (loan: LoanRow) => {
    const graceDays = Number(loan.penalty_grace_days ?? 2);
    const penaltyRate = Number(loan.penalty_rate ?? 0);

    setCollectModal({
      open: true,
      loanId: loan.id,
      loanCode: getFinderLoanCode(loan),
      customerName: loan.customer_name,
      customerNo: loan.customer_no || '',
      amount: Number(loan.installment_amount || 0).toFixed(2),
      paymentType: 'cash',
      paymentReference: '',
      installmentAmount: Number(loan.installment_amount || 0),
      refundableAmount: Number(loan.refundable_amount || 0),
      dueDate: loan.due_date || '',
      penaltyRate: Number.isFinite(penaltyRate) ? penaltyRate : 0,
      graceDays: Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : 0,
      note: '',
      date: new Date().toISOString().split('T')[0],
    });
  };

  const openLoanDetailsModal = (loan: LoanRow) => {
    setLoanDetailsModal({ open: true, loan });
  };

  const closeLoanDetailsModal = () => {
    setLoanDetailsModal({ open: false, loan: null });
  };

  const closeCollectModal = () => {
    setCollectModal({
      open: false,
      loanId: null,
      loanCode: '',
      customerName: '',
      customerNo: '',
      amount: '',
      paymentType: 'cash',
      paymentReference: '',
      installmentAmount: 0,
      refundableAmount: 0,
      dueDate: '',
      penaltyRate: 0,
      graceDays: 0,
      note: '',
      date: new Date().toISOString().split('T')[0],
    });
  };

  const closeBulkCollectModal = () => {
    setBulkCollectModal({
      open: false,
      centerId: null,
      centerName: '',
      groupId: null,
      groupName: '',
      groupCode: '',
      date: new Date().toISOString().split('T')[0],
      paymentType: 'cash',
      paymentReference: '',
      note: '',
      members: [],
    });
  };

  const openBulkCollectModal = (groupRow: { groupId: number; groupName: string; groupCode: string }) => {
    if (!selectedCenterId) {
      setNoticeModal({ open: true, title: 'Missing Center', message: 'Please select a center before bulk collection.' });
      return;
    }

    const members = filteredScopedLoans
      .filter(
        (loan) =>
          loan.loan_scope === 'center_loan' &&
          Number(loan.center?.id || 0) === selectedCenterId &&
          Number(loan.group?.id || 0) === Number(groupRow.groupId || 0)
      )
      .sort((a, b) => String(a.customer_name || '').localeCompare(String(b.customer_name || '')))
      .map((loan) => {
        const installment = Number(loan.installment_amount || 0);
        const outstanding = getOutstandingBalance(loan);
        const suggestedAmount = Math.min(installment, outstanding);
        return {
          loanId: loan.id,
          loanCode: getFinderLoanCode(loan),
          customerNo: getFinderCustomerNo(loan),
          customerName: loan.customer_name,
          dueDate: loan.due_date || '',
          installmentAmount: installment,
          outstandingAmount: outstanding,
          amount: suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '',
          selected: suggestedAmount > 0,
        };
      });

    setBulkCollectModal({
      open: true,
      centerId: selectedCenterId,
      centerName: selectedCenter?.centerName || '',
      groupId: groupRow.groupId,
      groupName: groupRow.groupName,
      groupCode: groupRow.groupCode,
      date: new Date().toISOString().split('T')[0],
      paymentType: 'cash',
      paymentReference: '',
      note: '',
      members,
    });
  };

  const printBulkMemberReceipts = useCallback(
    (receipts: CollectionReceipt[]) => {
      if (!receipts.length) return;
      if (typeof window === 'undefined') return;
      const printWindow = window.open('', '_blank', 'width=1000,height=760');
      if (!printWindow) return;

      const escapeHtml = (value: string) =>
        String(value || '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#039;');

      const formatAmount = (value: unknown) =>
        Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formatDate = (value?: string | null) => {
        const raw = String(value || '').trim();
        if (!raw) return '-';
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw;
        return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      };
      const line = (label: string, value: string, bold = false) => `
        <div class="row ${bold ? 'bold' : ''}">
          <span>${escapeHtml(label)}</span>
          <span>${escapeHtml(value)}</span>
        </div>
      `;

      const slipsHtml = receipts
        .map((receipt) => {
          const logoHtml = receiptCompany.logoUrl
            ? `<img src="${escapeHtml(receiptCompany.logoUrl)}" alt="Company logo" class="logo" />`
            : '';
          return `
            <section class="receipt">
              <div class="center">
                ${logoHtml}
                <p class="title">${escapeHtml(receiptCompany.name || 'BMS Collection Center')}</p>
                ${receiptCompany.address ? `<p class="small">${escapeHtml(receiptCompany.address)}</p>` : ''}
                ${receiptCompany.contactNo ? `<p class="small">Contact: ${escapeHtml(receiptCompany.contactNo)}</p>` : ''}
                <p class="small bold">OFFICIAL COLLECTION RECEIPT</p>
                <p class="small">${escapeHtml(receipt.product_label || 'Micro Credit')}</p>
              </div>
              <hr class="divider" />
              ${line('Bill No', receipt.bill_no)}
              ${line('Date', formatDate(receipt.payment_date))}
              ${line('Reference', receipt.reference)}
              ${line('Customer', receipt.customer_name || '-', true)}
              ${line('Customer No', receipt.customer_no || '-')}
              ${line('Product', receipt.loan_product || '-')}
              <hr class="divider" />
              <div class="paid-box">
                <p class="small">AMOUNT PAID TODAY</p>
                <p class="paid">LKR ${formatAmount(receipt.paid_amount)}</p>
              </div>
              ${line('Principal paid', formatAmount(receipt.principal_paid))}
              ${line('Interest paid', formatAmount(receipt.interest_paid))}
              ${line('Penalty paid', formatAmount(receipt.penalty_paid))}
              ${line('Arrears (before)', formatAmount(receipt.arrears_before))}
              ${line('Arrears (after)', formatAmount(receipt.arrears_after))}
              ${line('Total paid to date', formatAmount(receipt.total_paid_cumulative), true)}
              ${line('Outstanding balance', formatAmount(receipt.outstanding), true)}
              ${line('Installment', formatAmount(receipt.installment_amount))}
              ${line('Next due date', formatDate(receipt.next_due_date))}
              <hr class="divider" />
              ${line('Pay type', String(receipt.payment_type || '').replaceAll('_', ' ').toUpperCase())}
              ${receipt.payment_reference ? line('Reference no', receipt.payment_reference) : ''}
              ${receipt.note ? line('Note', receipt.note) : ''}
              <p class="thanks">Thank you — keep this receipt<br/>${
                receipt.printed_at ? new Date(receipt.printed_at).toLocaleString() : new Date().toLocaleString()
              }</p>
            </section>
          `;
        })
        .join('');

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Bulk Collection Receipts</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: "Courier New", monospace; background: #fff; color: #000; }
              .receipt {
                width: 72mm;
                max-width: 72mm;
                margin: 0 auto 12px auto;
                border: 1px dashed #94a3b8;
                padding: 6px;
                page-break-after: always;
              }
              .receipt:last-child { page-break-after: auto; }
              .center { text-align: center; }
              .title { font-size: 12px; font-weight: 700; text-transform: uppercase; }
              .small { font-size: 10px; margin-top: 2px; }
              .bold { font-weight: 700; }
              .logo { height: 54px; width: 54px; object-fit: contain; margin: 0 auto 2px auto; }
              .divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
              .row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; font-size: 11px; }
              .row span:last-child { text-align: right; max-width: 58%; word-break: break-word; }
              .paid-box { border: 1px solid #000; padding: 6px; margin: 6px 0; text-align: center; }
              .paid { font-size: 14px; font-weight: 700; margin-top: 2px; }
              .thanks { text-align: center; font-size: 9px; margin-top: 10px; color: #334155; }
              @media print {
                @page { size: 80mm auto; margin: 3mm; }
                body { margin: 0; padding: 0; }
                .receipt { border: none; margin: 0 auto; padding: 0; }
              }
            </style>
          </head>
          <body>
            ${slipsHtml}
            <script>window.onload = function(){ window.focus(); window.print(); }</script>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    },
    [receiptCompany]
  );

  const submitBulkCollection = async () => {
    if (!bulkCollectModal.groupId || !bulkCollectModal.centerId) {
      setNoticeModal({ open: true, title: 'Missing Group', message: 'Group details are missing for bulk collection.' });
      return;
    }

    const selectedRows = bulkCollectModal.members
      .filter((member) => member.selected)
      .map((member) => ({
        ...member,
        amountNumber: Number(member.amount || 0),
      }))
      .filter((member) => Number.isFinite(member.amountNumber) && member.amountNumber > 0);

    if (!selectedRows.length) {
      setNoticeModal({ open: true, title: 'Validation', message: 'Select at least one member with a valid amount.' });
      return;
    }

    if (bulkCollectModal.paymentType !== 'cash' && !bulkCollectModal.paymentReference.trim()) {
      setNoticeModal({
        open: true,
        title: 'Validation',
        message: 'Reference is required for check and bank transfer payments.',
      });
      return;
    }

    const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (browserOffline) {
      setNoticeModal({
        open: true,
        title: 'Offline Not Supported',
        message: 'Bulk collection requires an internet connection right now. Please reconnect and try again.',
      });
      return;
    }

    setBulkCollectSaving(true);
    try {
      const successRows: Array<{ loanCode: string; customerNo: string; customerName: string; amount: number; dueDate: string }> = [];
      const successReceipts: CollectionReceipt[] = [];
      let nextCollections = [...collections];
      let nextLoans = [...loans];
      let failedCount = 0;

      for (const member of selectedRows) {
        try {
          const response = await axios.post(
            `${API_BASE}/microfinance/collections`,
            {
              loan_request_id: member.loanId,
              collection_date: bulkCollectModal.date,
              collected_amount: member.amountNumber,
              payment_type: bulkCollectModal.paymentType,
              payment_reference: bulkCollectModal.paymentReference || undefined,
              note: bulkCollectModal.note || undefined,
            },
            { headers }
          );

          const savedCollection = response?.data?.data;
          if (savedCollection?.mf_loan_request_id) {
            const normalizedCollection = normalizeCollectionRow(savedCollection as Record<string, unknown>);
            nextCollections = [...nextCollections, normalizedCollection];
            nextLoans = nextLoans.map((loan) =>
              loan.id === normalizedCollection.mf_loan_request_id
                ? { ...loan, last_pay_date: normalizedCollection.collection_date || loan.last_pay_date }
                : loan
            );
          }

          const loanDates = response?.data?.loan_dates;
          const breakdown = response?.data?.breakdown || {};
          if (loanDates?.due_date || loanDates?.next_payment_date) {
            nextLoans = nextLoans.map((loan) => {
              if (loan.id !== member.loanId) return loan;
              return {
                ...loan,
                due_date: loanDates.due_date || loan.due_date,
                next_payment_date: loanDates.next_payment_date || loan.next_payment_date,
                arrears_balance:
                  typeof breakdown.arrears_outstanding_after !== 'undefined'
                    ? Number(breakdown.arrears_outstanding_after || 0) - Number(breakdown.extra_payment_after || 0)
                    : loan.arrears_balance,
              };
            });
          }

          const serverReceipt = response?.data?.receipt as CollectionReceipt | undefined;
          const activeLoan = nextLoans.find((loan) => loan.id === member.loanId) || loans.find((loan) => loan.id === member.loanId);
          const totalPaidCumulative = nextCollections
            .filter((row) => Number(row.mf_loan_request_id || 0) === member.loanId)
            .reduce((sum, row) => sum + Number(row.collected_amount || 0), 0);
          const fallbackReceipt: CollectionReceipt = {
            bill_no: `BILL-MIC-${member.loanId}-${Date.now()}`,
            product_type: 'microfinance',
            product_label: 'Micro Credit',
            reference: member.loanCode,
            source_id: member.loanId,
            customer_name: member.customerName,
            customer_no: member.customerNo || null,
            loan_product: 'Micro Loan',
            payment_date: bulkCollectModal.date,
            payment_type: bulkCollectModal.paymentType,
            payment_reference: bulkCollectModal.paymentReference || null,
            paid_amount: member.amountNumber,
            principal_paid: Number(breakdown.capital_amount ?? 0),
            interest_paid: Number(breakdown.interest_amount ?? 0),
            penalty_paid: Number(breakdown.penalty_amount ?? 0),
            arrears_before: Number(breakdown.arrears_outstanding_before ?? 0),
            arrears_after: Math.max(
              Number(breakdown.arrears_outstanding_after ?? 0) - Number(breakdown.extra_payment_after ?? 0),
              0
            ),
            outstanding: Math.max(Number(activeLoan?.refundable_amount || 0) - totalPaidCumulative, 0),
            total_paid_cumulative: totalPaidCumulative,
            installment_amount: Number(activeLoan?.installment_amount || member.installmentAmount || 0),
            next_due_date: loanDates?.due_date || activeLoan?.due_date || member.dueDate || null,
            note: bulkCollectModal.note || null,
            collection_id: Number(savedCollection?.id || 0) || null,
            printed_at: new Date().toISOString(),
          };
          successReceipts.push(serverReceipt || fallbackReceipt);

          successRows.push({
            loanCode: member.loanCode,
            customerNo: member.customerNo,
            customerName: member.customerName,
            amount: member.amountNumber,
            dueDate: member.dueDate,
          });
        } catch {
          failedCount += 1;
        }
      }

      if (!successRows.length) {
        setNoticeModal({
          open: true,
          title: 'Collection Error',
          message: 'No member collection could be saved. Please try again.',
        });
        return;
      }

      setCollections(nextCollections);
      setLoans(nextLoans);
      await cacheMfCollectionData(scopeKey, nextLoans, nextCollections);
      setCacheMeta((prev) => ({ ...prev, available: true, cachedAt: new Date().toISOString() }));
      await refreshAuthUserSnapshot();
      closeBulkCollectModal();

      printBulkMemberReceipts(successReceipts);

      setNoticeModal({
        open: true,
        title: 'Bulk Collection Completed',
        message:
          failedCount > 0
            ? `${successRows.length} member collections saved. ${failedCount} failed. Member receipts opened for print.`
            : `${successRows.length} member collections saved successfully. Member receipts opened for print.`,
      });
    } finally {
      setBulkCollectSaving(false);
    }
  };

  const penaltyPreview = useMemo(() => {
    if (!collectModal.open) {
      return { lateDays: 0, penaltyAmount: 0 };
    }

    if (!collectModal.dueDate || !collectModal.date || collectModal.penaltyRate <= 0) {
      return { lateDays: 0, penaltyAmount: 0 };
    }

    const dueDate = new Date(`${collectModal.dueDate}T00:00:00`);
    const payDate = new Date(`${collectModal.date}T00:00:00`);

    if (Number.isNaN(dueDate.getTime()) || Number.isNaN(payDate.getTime())) {
      return { lateDays: 0, penaltyAmount: 0 };
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const dayDiff = Math.floor((payDate.getTime() - dueDate.getTime()) / msPerDay);

    if (dayDiff <= collectModal.graceDays) {
      return { lateDays: 0, penaltyAmount: 0 };
    }

    const lateDays = dayDiff - collectModal.graceDays;
    const penaltyAmount = (collectModal.installmentAmount * collectModal.penaltyRate * lateDays) / 100;

    return {
      lateDays,
      penaltyAmount,
    };
  }, [
    collectModal.open,
    collectModal.dueDate,
    collectModal.date,
    collectModal.penaltyRate,
    collectModal.graceDays,
    collectModal.installmentAmount,
  ]);

  const buildLocalMfReceipt = useCallback(
    (
      modal: typeof collectModal,
      options?: {
        breakdown?: Record<string, unknown>;
        savedCollection?: Record<string, unknown>;
        loanDates?: { due_date?: string | null; next_payment_date?: string | null };
        offline?: boolean;
      }
    ): CollectionReceipt => {
      const paid = Number(options?.savedCollection?.collected_amount ?? modal.amount ?? 0);
      const breakdown = options?.breakdown ?? {};
      const priorPaid = collections
        .filter((row) => row.mf_loan_request_id === modal.loanId)
        .reduce((sum, row) => sum + Number(row.collected_amount || 0), 0);
      const totalPaidCumulative = priorPaid + (options?.offline ? paid : 0);
      const outstanding = Math.max(modal.refundableAmount - totalPaidCumulative, 0);
      const arrearsAfterRaw = Number(breakdown.arrears_outstanding_after ?? 0);
      const extraAfter = Number(breakdown.extra_payment_after ?? 0);
      const collectionId = Number(options?.savedCollection?.id ?? 0);
      const offlineNote = options?.offline
        ? 'Saved offline — will sync when internet is available.'
        : null;
      const mergedNote = [modal.note || '', offlineNote || ''].filter(Boolean).join(' ').trim() || null;

      return {
        bill_no: options?.offline
          ? `BILL-MF-OFF-${Date.now()}`
          : `BILL-MIC-${modal.loanId}-${collectionId > 0 ? collectionId : Date.now()}`,
        product_type: 'microfinance',
        product_label: 'Micro Credit',
        reference: modal.loanCode,
        source_id: modal.loanId || 0,
        customer_name: modal.customerName,
        customer_no: modal.customerNo || null,
        loan_product: 'Micro Loan',
        payment_date: String(options?.savedCollection?.collection_date ?? modal.date),
        payment_type: modal.paymentType,
        payment_reference: modal.paymentReference.trim() || null,
        paid_amount: paid,
        principal_paid: Number(breakdown.capital_amount ?? options?.savedCollection?.capital_amount ?? 0),
        interest_paid: Number(breakdown.interest_amount ?? options?.savedCollection?.interest_amount ?? 0),
        penalty_paid: Number(breakdown.penalty_amount ?? options?.savedCollection?.penalty_amount ?? 0),
        arrears_before: Number(breakdown.arrears_outstanding_before ?? 0),
        arrears_after: Math.max(arrearsAfterRaw - extraAfter, 0),
        outstanding,
        total_paid_cumulative: totalPaidCumulative,
        installment_amount: modal.installmentAmount,
        next_due_date: options?.loanDates?.due_date || modal.dueDate || null,
        note: mergedNote,
        collection_id: collectionId > 0 ? collectionId : null,
        printed_at: new Date().toISOString(),
      };
    },
    [collections]
  );

  const submitCollection = async () => {
    if (!collectModal.loanId) {
      setNoticeModal({ open: true, title: 'Error', message: 'Loan record is missing.' });
      return;
    }

    if (!collectModal.amount || Number(collectModal.amount) <= 0) {
      setNoticeModal({ open: true, title: 'Validation', message: 'Please enter a valid collection amount.' });
      return;
    }

    if (collectModal.paymentType !== 'cash' && !collectModal.paymentReference.trim()) {
      setNoticeModal({ open: true, title: 'Validation', message: 'Reference is required for check and bank transfer payments.' });
      return;
    }

    const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (browserOffline) {
      if (!cacheMeta.available) {
        setNoticeModal({
          open: true,
          title: 'Offline Data Missing',
          message: 'Connect to the internet once and open this page to download loan data before collecting offline.',
        });
        return;
      }

      setCollectSaving(true);
      try {
        await enqueueMfCollection({
          scopeKey,
          loanRequestId: collectModal.loanId,
          loanCode: collectModal.loanCode,
          customerName: collectModal.customerName,
          collectionDate: collectModal.date,
          collectedAmount: Number(collectModal.amount),
          paymentType: collectModal.paymentType,
          paymentReference: collectModal.paymentReference || undefined,
          note: collectModal.note || undefined,
        });

        const optimisticCollection = normalizeCollectionRow({
          id: -Date.now(),
          mf_loan_request_id: collectModal.loanId,
          collected_amount: Number(collectModal.amount),
          collection_date: collectModal.date,
        });

        const nextCollections = [...collections, optimisticCollection];
        setCollections(nextCollections);
        setLoans((prev) =>
          prev.map((loan) =>
            loan.id === collectModal.loanId
              ? { ...loan, last_pay_date: collectModal.date || loan.last_pay_date }
              : loan
          )
        );

        await cacheMfCollectionData(scopeKey, loans, nextCollections);
        await refreshPendingCount();
        const offlineReceipt = buildLocalMfReceipt(collectModal, { offline: true });
        closeCollectModal();
        setReceiptModal({ open: true, receipt: offlineReceipt });
      } catch {
        setNoticeModal({
          open: true,
          title: 'Offline Save Failed',
          message: 'Could not save collection locally. Check browser storage and try again.',
        });
      } finally {
        setCollectSaving(false);
      }
      return;
    }

    setCollectSaving(true);
    try {
      const response = await axios.post(
        `${API_BASE}/microfinance/collections`,
        {
          loan_request_id: collectModal.loanId,
          collection_date: collectModal.date,
          collected_amount: Number(collectModal.amount),
          payment_type: collectModal.paymentType,
          payment_reference: collectModal.paymentReference || undefined,
          note: collectModal.note || undefined,
        },
        { headers }
      );

      const savedCollection = response?.data?.data;
      let nextCollections = collections;
      let nextLoans = loans;

      if (savedCollection?.mf_loan_request_id) {
        const normalizedCollection = normalizeCollectionRow(savedCollection as Record<string, unknown>);
        nextCollections = [...collections, normalizedCollection];
        setCollections(nextCollections);
        nextLoans = loans.map((loan) =>
          loan.id === normalizedCollection.mf_loan_request_id
            ? { ...loan, last_pay_date: normalizedCollection.collection_date || loan.last_pay_date }
            : loan
        );
        setLoans(nextLoans);
      }

      const loanDates = response?.data?.loan_dates;
      const breakdown = response?.data?.breakdown || {};
      if (loanDates?.due_date || loanDates?.next_payment_date) {
        nextLoans = nextLoans.map((loan) => {
          if (loan.id !== collectModal.loanId) return loan;

          return {
            ...loan,
            due_date: loanDates.due_date || loan.due_date,
            next_payment_date: loanDates.next_payment_date || loan.next_payment_date,
            arrears_balance:
              typeof breakdown.arrears_outstanding_after !== 'undefined'
                ? Number(breakdown.arrears_outstanding_after || 0) - Number(breakdown.extra_payment_after || 0)
                : loan.arrears_balance,
          };
        });
        setLoans(nextLoans);
      }

      await cacheMfCollectionData(scopeKey, nextLoans, nextCollections);
      setCacheMeta((prev) => ({ ...prev, available: true, cachedAt: new Date().toISOString() }));
      await refreshAuthUserSnapshot();

      const serverReceipt = response?.data?.receipt as CollectionReceipt | undefined;
      const receipt =
        serverReceipt ||
        buildLocalMfReceipt(collectModal, {
          breakdown,
          savedCollection: savedCollection as Record<string, unknown> | undefined,
          loanDates,
        });

      closeCollectModal();
      setReceiptModal({ open: true, receipt });
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to save collection.';
      setNoticeModal({ open: true, title: 'Collection Error', message });
    } finally {
      setCollectSaving(false);
    }
  };

  const modeMeta =
    activeMode === 'center'
      ? {
          badge: 'Center Desk',
          title: 'Center Collection',
          subtitle: 'Daily center-level collection tracking with due-date visibility.',
          glow: 'from-emerald-400/50 to-teal-400/20',
          accent: 'from-emerald-500 to-teal-500',
        }
      : activeMode === 'route'
        ? {
            badge: 'Route Desk',
            title: 'Route Collection',
            subtitle: 'Manage route-based installments and upcoming payment windows.',
            glow: 'from-blue-400/50 to-cyan-400/20',
            accent: 'from-blue-500 to-cyan-500',
          }
        : activeMode === 'today'
          ? {
              badge: 'Today Desk',
              title: 'Debt To Be Collected Today',
              subtitle: 'Focus on all due installments scheduled for today.',
              glow: 'from-rose-400/45 to-orange-300/25',
              accent: 'from-rose-500 to-orange-500',
            }
          : activeMode === 'next'
            ? {
                badge: 'Next Day Desk',
                title: 'Next Collection Loans',
                subtitle: 'Prepare upcoming collections for the next day.',
                glow: 'from-indigo-400/45 to-sky-300/25',
                accent: 'from-indigo-500 to-sky-500',
              }
        : {
            badge: 'Office Desk',
            title: 'Office Collection',
            subtitle: 'Handle direct office collections and manual repayment follow-up.',
            glow: 'from-amber-400/55 to-orange-400/20',
            accent: 'from-amber-500 to-orange-500',
          };

  const cards = [
    ...(canViewCenterRouteCollections
      ? [
          {
            id: 'center' as const,
            widgetKey: 'mf_collections_widget_mode_center',
            title: 'Center Collection',
            subtitle: 'Collect installments center-wise',
            color: 'from-emerald-500 to-teal-500',
            bg: 'from-emerald-50 to-teal-50',
          },
          {
            id: 'route' as const,
            widgetKey: 'mf_collections_widget_mode_route',
            title: 'Route Collection',
            subtitle: 'Collect installments route-wise',
            color: 'from-blue-500 to-cyan-500',
            bg: 'from-blue-50 to-cyan-50',
          },
        ]
      : []),
    ...(isFieldOfficer
      ? [
          {
            id: 'today' as const,
            widgetKey: 'mf_collections_widget_mode_today',
            title: 'Debt Today',
            subtitle: 'Loans due for collection today',
            color: 'from-rose-500 to-orange-500',
            bg: 'from-rose-50 to-orange-50',
          },
          {
            id: 'next' as const,
            widgetKey: 'mf_collections_widget_mode_next',
            title: 'Next Collection',
            subtitle: 'Loans scheduled for next day collection',
            color: 'from-indigo-500 to-sky-500',
            bg: 'from-indigo-50 to-sky-50',
          },
        ]
      : []),
    ...(canViewOfficeCollection
      ? [
          {
            id: 'office' as const,
            widgetKey: 'mf_collections_widget_mode_office',
            title: 'Office Collection',
            subtitle: 'Collect direct/office installments',
            color: 'from-amber-500 to-orange-500',
            bg: 'from-amber-50 to-orange-50',
          },
        ]
      : []),
  ];

  const visibleCards = cards.filter((card) => !hiddenWidgetKeys.has(card.widgetKey));

  const summaryCards = [
    {
      key: 'mf_collections_widget_summary_records',
      label: 'Collection Records',
      value: String(displayRecordCount),
    },
    {
      key: 'mf_collections_widget_summary_installment_total',
      label: 'Total Installment',
      value: displayInstallmentTotal.toFixed(2),
    },
    {
      key: 'mf_collections_widget_summary_due_date',
      label: 'With Due Date',
      value: String(displayDueDateCount),
    },
  ];

  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const isColumnVisible = (columnKey: string) =>
    !hiddenWidgetKeys.has(`mf_collections_widget_col_${columnKey}`);
  const renderColumnHeader = (columnKey: string, label: string) => (
    <th key={columnKey} className="relative px-3 py-2 pr-8 font-semibold">
      {label}
      <WidgetCloseGate>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void hideWidget(`mf_collections_widget_col_${columnKey}`);
          }}
          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
          aria-label={`Hide ${label} column`}
        >
          ×
        </button>
      </WidgetCloseGate>
    </th>
  );

  useEffect(() => {
    const isOfficeModeBlocked = activeMode === 'office' && !canViewOfficeCollection;
    const isCenterRouteModeBlocked =
      (activeMode === 'center' || activeMode === 'route') && !canViewCenterRouteCollections;

    if (isOfficeModeBlocked || isCenterRouteModeBlocked) {
      const fallbackMode = visibleCards[0]?.id || cards[0]?.id || 'today';
      setActiveMode(fallbackMode);
    }
  }, [activeMode, canViewOfficeCollection, canViewCenterRouteCollections, cards, visibleCards]);

  if (!token || loading || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-100 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -top-20 left-16 h-72 w-72 rounded-full bg-emerald-300 blur-3xl"></div>
        <div className="absolute top-24 right-4 h-80 w-80 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-blue-300 blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        <MfOfflineBanner
          isOnline={isOnline}
          pendingCount={pendingCount}
          syncing={syncing}
          cacheAvailable={cacheMeta.available}
          cachedAt={cacheMeta.cachedAt}
          lastSyncMessage={lastSyncMessage}
          onSyncNow={() => {
            void syncNow();
          }}
          onRefreshCache={() => {
            void loadLoans();
          }}
        />

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(14,116,144,0.45)] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 border border-cyan-100">
                {modeMeta.badge}
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">{modeMeta.title}</h1>
              <p className="text-sm text-slate-600 mt-1">{modeMeta.subtitle}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/microfinance')}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold border border-slate-200 shadow-sm"
            >
              Back
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {visibleSummaryCards.map((card) => (
              <div key={card.key} className="relative rounded-xl bg-white/85 border border-white shadow-sm p-4">
                <WidgetCloseGate>
<button
                  type="button"
                  onClick={() => {
                    void hideWidget(card.key);
                  }}
                  className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                  aria-label={`Hide ${card.label} card`}
                >
                  ×
                </button>
</WidgetCloseGate>
                <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{card.value}</p>
              </div>
            ))}
          </div>
          {visibleSummaryCards.length === 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              All summary cards are hidden. Restore from dashboard with admin approval.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visibleCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setActiveMode(card.id);
                setQuery('');
              }}
              className={`text-left rounded-2xl border p-4 shadow-sm transition-all duration-300 bg-gradient-to-br ${card.bg} relative overflow-hidden ${
                activeMode === card.id
                  ? 'border-transparent ring-2 ring-cyan-300 shadow-xl scale-[1.01]'
                  : 'border-white/70 hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              <WidgetCloseGate>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  void hideWidget(card.widgetKey);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    void hideWidget(card.widgetKey);
                  }
                }}
                className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label={`Hide ${card.title} card`}
              >
                ×
              </span>
              </WidgetCloseGate>
              <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-r ${card.color} opacity-20 blur-xl`}></div>
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-white bg-gradient-to-r ${card.color}`}>
                {card.id === 'center' ? 'C' : card.id === 'route' ? 'R' : card.id === 'today' ? 'T' : card.id === 'next' ? 'N' : 'O'}
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900">{card.title}</h3>
              <p className="text-xs text-slate-600 mt-1">{card.subtitle}</p>
            </button>
          ))}
        </div>
        {visibleCards.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            All collection mode cards are hidden. Restore from dashboard with admin approval.
          </div>
        )}

        <div className="bg-white/86 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Common Loan Finder</h2>
            <div className="relative min-w-[280px]">
              <input
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                placeholder="Find by Customer No"
                value={finderCustomerNo}
                onChange={(e) => setFinderCustomerNo(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">⌕</span>
            </div>
          </div>

          {!finderCustomerNo.trim() ? (
            <p className="mt-3 text-sm text-slate-500">Type customer number to quickly find any loan and collect installment.</p>
          ) : commonFinderResults.length === 0 ? (
            <p className="mt-3 text-sm text-rose-600">No loan found for this customer number.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-cyan-100">
              <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                <thead className="bg-cyan-50/70 text-slate-700">
                  <tr>
                    {isColumnVisible('finder_loan_code') && renderColumnHeader('finder_loan_code', 'Loan Code')}
                    {isColumnVisible('finder_customer_no') && renderColumnHeader('finder_customer_no', 'Customer No')}
                    {isColumnVisible('finder_customer') && renderColumnHeader('finder_customer', 'Customer')}
                    {isColumnVisible('finder_scope') && renderColumnHeader('finder_scope', 'Scope')}
                    {isColumnVisible('finder_installment') && renderColumnHeader('finder_installment', 'Installment')}
                    {isColumnVisible('finder_outstanding') && renderColumnHeader('finder_outstanding', 'Outstanding')}
                    {isColumnVisible('finder_due_date') && renderColumnHeader('finder_due_date', 'Due Date')}
                    {isColumnVisible('finder_loan_end_date') && renderColumnHeader('finder_loan_end_date', 'Loan End Date')}
                    {isColumnVisible('finder_action') && renderColumnHeader('finder_action', 'Action')}
                  </tr>
                </thead>
                <tbody>
                  {commonFinderResults.map((loan) => (
                    <tr key={`finder-${loan.id}`} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors">
                      {isColumnVisible('finder_loan_code') && (
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{getFinderLoanCode(loan)}</span>
                        </td>
                      )}
                      {isColumnVisible('finder_customer_no') && <td className="px-3 py-2">{getFinderCustomerNo(loan)}</td>}
                      {isColumnVisible('finder_customer') && <td className="px-3 py-2">{loan.customer_name}</td>}
                      {isColumnVisible('finder_scope') && <td className="px-3 py-2 capitalize">{String(loan.loan_scope || '-').replace('_', ' ')}</td>}
                      {isColumnVisible('finder_installment') && <td className="px-3 py-2">{Number(loan.installment_amount || 0).toFixed(2)}</td>}
                      {isColumnVisible('finder_outstanding') && (
                        <td className="px-3 py-2 text-rose-700 font-semibold">{getOutstandingBalance(loan).toFixed(2)}</td>
                      )}
                      {isColumnVisible('finder_due_date') && <td className="px-3 py-2">{formatDateDisplay(loan.due_date)}</td>}
                      {isColumnVisible('finder_loan_end_date') && <td className="px-3 py-2">{formatDateDisplay(loan.loan_end_date)}</td>}
                      {isColumnVisible('finder_action') && (
                        <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openLoanDetailsModal(loan)}
                            className="px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-semibold"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => openCollectModal(loan)}
                            disabled={getOutstandingBalance(loan) <= 0}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:text-slate-100"
                          >
                            Collect
                          </button>
                        </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white/86 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-r ${modeMeta.accent}`}></span>
                {activeMode === 'center'
                  ? selectedGroupId !== null
                    ? `Loan Records - ${selectedGroup?.groupName || 'Selected Group'}`
                    : selectedCenterId
                      ? `Group Collection List - ${selectedCenter?.centerName || 'Selected Center'}`
                    : 'Center Collection List'
                  : activeMode === 'route'
                    ? selectedRouteId
                      ? `Loan Records - ${selectedRoute?.routeName || 'Selected Route'}`
                      : 'Route Collection List'
                    : activeMode === 'today'
                      ? 'Debt To Be Collected Today'
                      : activeMode === 'next'
                        ? `Collection Loans - ${debtTargetDate}`
                    : officeView === 'today_debt'
                      ? 'Debt To Be Collected Today'
                      : officeView === 'date_debt'
                        ? `Debt To Be Collected - ${debtTargetDate || 'Selected Date'}`
                      : 'Office Collection List'}
              </h2>
              {currentLoanRecordRows.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                    Paid ({highlightedPaidCount})
                  </span>
                  <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-rose-800">
                    Pending ({highlightedPendingCount})
                  </span>
                  <span className="text-slate-500">for {formatDateDisplay(loanRecordHighlightDate)}</span>
                </div>
              )}
            </div>
            {activeMode === 'center' && selectedGroupId !== null && (
              <button
                type="button"
                onClick={() => setSelectedGroupId(null)}
                className="px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-semibold"
              >
                Back to Groups
              </button>
            )}
            {activeMode === 'center' && selectedCenterId && selectedGroupId === null && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGroupId(null);
                  setSelectedCenterId(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-semibold"
              >
                Back to Centers
              </button>
            )}
            {activeMode === 'route' && selectedRouteId !== null && (
              <button
                type="button"
                onClick={() => setSelectedRouteId(null)}
                className="px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-semibold"
              >
                Back to Routes
              </button>
            )}
            {activeMode === 'office' && isAdmin && (
              <div className="inline-flex rounded-xl border border-cyan-200 bg-cyan-50 p-1">
                <button
                  type="button"
                  onClick={() => setOfficeView('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    officeView === 'all' ? 'bg-white text-cyan-800 shadow-sm' : 'text-cyan-700'
                  }`}
                >
                  All Active Loans
                </button>
                <button
                  type="button"
                  onClick={() => setOfficeView('today_debt')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    officeView === 'today_debt' ? 'bg-white text-cyan-800 shadow-sm' : 'text-cyan-700'
                  }`}
                >
                  Debt Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setDebtTargetDate(tomorrow.toISOString().slice(0, 10));
                    setOfficeView('date_debt');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    officeView === 'date_debt' ? 'bg-white text-cyan-800 shadow-sm' : 'text-cyan-700'
                  }`}
                >
                  Next Day
                </button>
              </div>
            )}
            {activeMode === 'office' && isAdmin && officeView === 'date_debt' && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={debtTargetDate}
                  onChange={(e) => {
                    setDebtTargetDate(e.target.value);
                    setOfficeView('date_debt');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-cyan-200 bg-white text-sm text-slate-800"
                />
              </div>
            )}
            {isFieldOfficer && activeMode === 'next' && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={debtTargetDate}
                  onChange={(e) => setDebtTargetDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-cyan-200 bg-white text-sm text-slate-800"
                />
              </div>
            )}
            <div className="relative min-w-[260px]">
              <div className="mb-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  className="px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  value={loanOfficerFilter}
                  onChange={(e) => setLoanOfficerFilter(e.target.value)}
                >
                  <option value="all">All Collection Officers</option>
                  {loanOfficerOptions.map((officer) => (
                    <option key={officer} value={officer.toLowerCase()}>
                      {officer}
                    </option>
                  ))}
                </select>

                <select
                  className="px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  value={loanRouteFilter}
                  onChange={(e) => {
                    setLoanRouteFilter(e.target.value);
                    setLoanCenterFilter('all');
                  }}
                >
                  <option value="all">All Routes</option>
                  {loanRouteOptions.map((route) => (
                    <option key={route.id} value={String(route.id)}>
                      {route.name}
                    </option>
                  ))}
                </select>

                <select
                  className="px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  value={loanCenterFilter}
                  onChange={(e) => setLoanCenterFilter(e.target.value)}
                >
                  <option value="all">All Centers</option>
                  {loanCenterOptions.map((center) => (
                    <option key={center.id} value={String(center.id)}>
                      {center.name}
                    </option>
                  ))}
                </select>
              </div>

              <input
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                placeholder={
                  activeMode === 'center' && selectedGroupId !== null
                    ? 'Search loan code / customer'
                    : activeMode === 'center' && selectedCenterId
                      ? 'Search group name / code'
                      : activeMode === 'route' && selectedRouteId !== null
                        ? 'Search loan code / customer'
                        : activeMode === 'route'
                          ? 'Search route name / code'
                          : activeMode === 'today'
                            ? 'Search today debt by loan / customer / route'
                            : activeMode === 'next'
                              ? 'Search selected day loans by loan / customer / route'
                          : activeMode === 'office' && officeView === 'today_debt'
                            ? 'Search debt today by loan / customer / route'
                            : activeMode === 'office' && officeView === 'date_debt'
                              ? 'Search selected day debt by loan / customer / route'
                    : 'Search loan code / customer / route'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">⌕</span>
            </div>
          </div>

          {(activeMode === 'center'
            ? selectedGroupId !== null
              ? groupLoanRecords.length
              : selectedCenterId
                ? groupCollections.length
                : centerCollections.length
            : activeMode === 'route'
              ? selectedRouteId !== null
                ? routeLoanRecords.length
                : routeCollections.length
            : officeDisplayLoans.length) === 0 ? (
            <div className={`mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br ${modeMeta.glow} p-8 text-sm text-slate-700 text-center`}>
              {activeMode === 'center'
                ? selectedGroupId !== null
                  ? 'No loans found for selected group.'
                  : selectedCenterId
                    ? 'No groups found for selected center.'
                  : 'No centers found for center collection mode.'
                : activeMode === 'route'
                  ? selectedRouteId !== null
                    ? 'No loans found for selected route.'
                    : 'No routes found for route collection mode.'
                : activeMode === 'today'
                  ? 'No due debt found for today.'
                  : activeMode === 'next'
                    ? `No due loans found for ${debtTargetDate}.`
                : officeView === 'today_debt'
                  ? 'No due debt found for today.'
                  : officeView === 'date_debt'
                    ? `No due debt found for ${debtTargetDate || 'selected date'}.`
                  : 'No records found for this collection mode.'}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100">
              <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                {activeMode === 'center' ? (
                  <>
                    <thead className="bg-gradient-to-r from-slate-100 to-cyan-50 text-slate-800">
                      {selectedGroupId !== null ? (
                        <tr>
                          {isColumnVisible('main_loan_code') && renderColumnHeader('main_loan_code', 'Loan Code')}
                          {isColumnVisible('main_customer_no') && renderColumnHeader('main_customer_no', 'Customer No')}
                          {isColumnVisible('main_customer') && renderColumnHeader('main_customer', 'Customer')}
                          {isColumnVisible('main_loan_amount') && renderColumnHeader('main_loan_amount', 'Loan Amount')}
                          {isColumnVisible('main_installment') && renderColumnHeader('main_installment', 'Installment')}
                          {isColumnVisible('main_paid_total') && renderColumnHeader('main_paid_total', 'Paid Total')}
                          {isColumnVisible('main_outstanding') && renderColumnHeader('main_outstanding', 'Outstanding')}
                          {isColumnVisible('main_arrears') && renderColumnHeader('main_arrears', 'Arrears')}
                          {isColumnVisible('main_extra_payment') && renderColumnHeader('main_extra_payment', 'Extra Payment')}
                          {isColumnVisible('main_due_date') && renderColumnHeader('main_due_date', 'Due Date')}
                          {isColumnVisible('main_next_payment') && renderColumnHeader('main_next_payment', 'Next Payment')}
                          {isColumnVisible('main_action') && renderColumnHeader('main_action', 'Action')}
                        </tr>
                      ) : selectedCenterId ? (
                        <tr>
                          {isColumnVisible('center_group_code') && renderColumnHeader('center_group_code', 'Group Code')}
                          {isColumnVisible('center_group_name') && renderColumnHeader('center_group_name', 'Group Name')}
                          {isColumnVisible('center_loan_count') && renderColumnHeader('center_loan_count', 'Loan Count')}
                          {isColumnVisible('center_total_installment') && renderColumnHeader('center_total_installment', 'Total Installment')}
                          {isColumnVisible('center_next_due_date') && renderColumnHeader('center_next_due_date', 'Next Due Date')}
                          {isColumnVisible('center_group_bulk_collection_action') &&
                            renderColumnHeader('center_group_bulk_collection_action', 'Action')}
                        </tr>
                      ) : (
                        <tr>
                          {isColumnVisible('center_center_code') && renderColumnHeader('center_center_code', 'Center Code')}
                          {isColumnVisible('center_center_name') && renderColumnHeader('center_center_name', 'Center Name')}
                          {isColumnVisible('center_route') && renderColumnHeader('center_route', 'Route')}
                          {isColumnVisible('center_loan_count') && renderColumnHeader('center_loan_count', 'Loan Count')}
                          {isColumnVisible('center_total_installment') && renderColumnHeader('center_total_installment', 'Total Installment')}
                          {isColumnVisible('center_next_due_date') && renderColumnHeader('center_next_due_date', 'Next Due Date')}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {selectedGroupId !== null
                        ? groupLoanRecords.map((loan) => (
                            <tr
                              key={`loan-${loan.id}`}
                              onClick={() => openLoanDetailsModal(loan)}
                              className={getLoanRecordRowClass(loan, loanRecordHighlightDate)}
                            >
                              {isColumnVisible('main_loan_code') && (
                                <td className="px-3 py-2 font-semibold text-slate-900">
                                  <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{loan.loan_code || '-'}</span>
                                </td>
                              )}
                              {isColumnVisible('main_customer_no') && <td className="px-3 py-2">{loan.customer_no || '-'}</td>}
                              {isColumnVisible('main_customer') && <td className="px-3 py-2">{loan.customer_name}</td>}
                              {isColumnVisible('main_loan_amount') && <td className="px-3 py-2">{Number(loan.loan_amount || 0).toFixed(2)}</td>}
                              {isColumnVisible('main_installment') && <td className="px-3 py-2">{Number(loan.installment_amount || 0).toFixed(2)}</td>}
                              {isColumnVisible('main_paid_total') && (
                                <td className="px-3 py-2 text-emerald-700 font-semibold">{getPaidTotal(loan.id).toFixed(2)}</td>
                              )}
                              {isColumnVisible('main_outstanding') && (
                                <td className="px-3 py-2 text-rose-700 font-semibold">{getOutstandingBalance(loan).toFixed(2)}</td>
                              )}
                              {isColumnVisible('main_arrears') && (
                                <td className="px-3 py-2 text-red-700 font-semibold">{getArrearsAmount(loan).toFixed(2)}</td>
                              )}
                              {isColumnVisible('main_extra_payment') && (
                                <td className="px-3 py-2 text-violet-700 font-semibold">{getExtraPayment(loan).toFixed(2)}</td>
                              )}
                              {isColumnVisible('main_due_date') && <td className="px-3 py-2">{formatDateDisplay(loan.due_date)}</td>}
                              {isColumnVisible('main_next_payment') && <td className="px-3 py-2">{formatDateDisplay(loan.next_payment_date)}</td>}
                              {isColumnVisible('main_action') && (
                                <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCollectModal(loan);
                                  }}
                                  disabled={getOutstandingBalance(loan) <= 0}
                                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:text-slate-100"
                                >
                                  Collect
                                </button>
                                </td>
                              )}
                            </tr>
                          ))
                        : selectedCenterId
                          ? groupCollections.map((row) => (
                            <tr key={`group-${row.groupId}`} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors">
                              {isColumnVisible('center_group_code') && (
                                <td className="px-3 py-2 font-semibold text-slate-900">
                                  <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{row.groupCode}</span>
                                </td>
                              )}
                              {isColumnVisible('center_group_name') && (
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedGroupId(row.groupId)}
                                    className="text-cyan-700 hover:text-cyan-900 font-semibold"
                                  >
                                    {row.groupName}
                                  </button>
                                </td>
                              )}
                              {isColumnVisible('center_loan_count') && <td className="px-3 py-2">{row.loanCount}</td>}
                              {isColumnVisible('center_total_installment') && <td className="px-3 py-2">{row.totalInstallment.toFixed(2)}</td>}
                              {isColumnVisible('center_next_due_date') && <td className="px-3 py-2">{formatDateDisplay(row.nextDueDate)}</td>}
                              {isColumnVisible('center_group_bulk_collection_action') && (
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openBulkCollectModal(row);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-semibold hover:from-cyan-600 hover:to-blue-600"
                                  >
                                    Bulk Collection
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))
                        : centerCollections.map((row) => (
                            <tr
                              key={row.centerId}
                              onClick={() => setSelectedCenterId(row.centerId)}
                              className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors cursor-pointer"
                            >
                              {isColumnVisible('center_center_code') && (
                                <td className="px-3 py-2 font-semibold text-slate-900">
                                  <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{row.centerCode}</span>
                                </td>
                              )}
                              {isColumnVisible('center_center_name') && <td className="px-3 py-2">{row.centerName}</td>}
                              {isColumnVisible('center_route') && <td className="px-3 py-2">{row.routeName}</td>}
                              {isColumnVisible('center_loan_count') && <td className="px-3 py-2">{row.loanCount}</td>}
                              {isColumnVisible('center_total_installment') && <td className="px-3 py-2">{row.totalInstallment.toFixed(2)}</td>}
                              {isColumnVisible('center_next_due_date') && <td className="px-3 py-2">{formatDateDisplay(row.nextDueDate)}</td>}
                            </tr>
                          ))}
                    </tbody>
                  </>
                ) : activeMode === 'route' ? (
                  <>
                    <thead className="bg-gradient-to-r from-slate-100 to-cyan-50 text-slate-800">
                      {selectedRouteId !== null ? (
                        <tr>
                          {isColumnVisible('route_loan_code') && renderColumnHeader('route_loan_code', 'Loan Code')}
                          {isColumnVisible('route_customer_no') && renderColumnHeader('route_customer_no', 'Customer No')}
                          {isColumnVisible('route_customer') && renderColumnHeader('route_customer', 'Customer')}
                          {isColumnVisible('route_center') && renderColumnHeader('route_center', 'Center')}
                          {isColumnVisible('route_loan_amount') && renderColumnHeader('route_loan_amount', 'Loan Amount')}
                          {isColumnVisible('route_installment') && renderColumnHeader('route_installment', 'Installment')}
                          {isColumnVisible('route_paid_total') && renderColumnHeader('route_paid_total', 'Paid Total')}
                          {isColumnVisible('route_outstanding') && renderColumnHeader('route_outstanding', 'Outstanding')}
                          {isColumnVisible('route_arrears') && renderColumnHeader('route_arrears', 'Arrears')}
                          {isColumnVisible('route_extra_payment') && renderColumnHeader('route_extra_payment', 'Extra Payment')}
                          {isColumnVisible('route_due_date') && renderColumnHeader('route_due_date', 'Due Date')}
                          {isColumnVisible('route_next_payment') && renderColumnHeader('route_next_payment', 'Next Payment')}
                          {isColumnVisible('route_action') && renderColumnHeader('route_action', 'Action')}
                        </tr>
                      ) : (
                        <tr>
                          {isColumnVisible('route_route_code') && renderColumnHeader('route_route_code', 'Route Code')}
                          {isColumnVisible('route_route_name') && renderColumnHeader('route_route_name', 'Route Name')}
                          {isColumnVisible('route_loan_count') && renderColumnHeader('route_loan_count', 'Loan Count')}
                          {isColumnVisible('route_total_installment') && renderColumnHeader('route_total_installment', 'Total Installment')}
                          {isColumnVisible('route_next_due_date') && renderColumnHeader('route_next_due_date', 'Next Due Date')}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {selectedRouteId !== null
                        ? routeLoanRecords.map((loan) => (
                            <tr
                              key={`route-loan-${loan.id}`}
                              onClick={() => openLoanDetailsModal(loan)}
                              className={getLoanRecordRowClass(loan, loanRecordHighlightDate)}
                            >
                              {isColumnVisible('route_loan_code') && (
                                <td className="px-3 py-2 font-semibold text-slate-900">
                                  <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{loan.loan_code || '-'}</span>
                                </td>
                              )}
                              {isColumnVisible('route_customer_no') && <td className="px-3 py-2">{loan.customer_no || '-'}</td>}
                              {isColumnVisible('route_customer') && <td className="px-3 py-2">{loan.customer_name}</td>}
                              {isColumnVisible('route_center') && <td className="px-3 py-2">{loan.center?.name || '-'}</td>}
                              {isColumnVisible('route_loan_amount') && <td className="px-3 py-2">{Number(loan.loan_amount || 0).toFixed(2)}</td>}
                              {isColumnVisible('route_installment') && <td className="px-3 py-2">{Number(loan.installment_amount || 0).toFixed(2)}</td>}
                              {isColumnVisible('route_paid_total') && (
                                <td className="px-3 py-2 text-emerald-700 font-semibold">{getPaidTotal(loan.id).toFixed(2)}</td>
                              )}
                              {isColumnVisible('route_outstanding') && (
                                <td className="px-3 py-2 text-rose-700 font-semibold">{getOutstandingBalance(loan).toFixed(2)}</td>
                              )}
                              {isColumnVisible('route_arrears') && (
                                <td className="px-3 py-2 text-red-700 font-semibold">{getArrearsAmount(loan).toFixed(2)}</td>
                              )}
                              {isColumnVisible('route_extra_payment') && (
                                <td className="px-3 py-2 text-violet-700 font-semibold">{getExtraPayment(loan).toFixed(2)}</td>
                              )}
                              {isColumnVisible('route_due_date') && <td className="px-3 py-2">{formatDateDisplay(loan.due_date)}</td>}
                              {isColumnVisible('route_next_payment') && <td className="px-3 py-2">{formatDateDisplay(loan.next_payment_date)}</td>}
                              {isColumnVisible('route_action') && (
                                <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCollectModal(loan);
                                  }}
                                  disabled={getOutstandingBalance(loan) <= 0}
                                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:text-slate-100"
                                >
                                  Collect
                                </button>
                                </td>
                              )}
                            </tr>
                          ))
                        : routeCollections.map((row) => (
                            <tr
                              key={`route-${row.routeId}`}
                              onClick={() => setSelectedRouteId(row.routeId)}
                              className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors cursor-pointer"
                            >
                              {isColumnVisible('route_route_code') && (
                                <td className="px-3 py-2 font-semibold text-slate-900">
                                  <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{row.routeCode}</span>
                                </td>
                              )}
                              {isColumnVisible('route_route_name') && <td className="px-3 py-2">{row.routeName}</td>}
                              {isColumnVisible('route_loan_count') && <td className="px-3 py-2">{row.loanCount}</td>}
                              {isColumnVisible('route_total_installment') && <td className="px-3 py-2">{row.totalInstallment.toFixed(2)}</td>}
                              {isColumnVisible('route_next_due_date') && <td className="px-3 py-2">{formatDateDisplay(row.nextDueDate)}</td>}
                            </tr>
                          ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead className="bg-gradient-to-r from-slate-100 to-cyan-50 text-slate-800">
                      <tr>
                        {isColumnVisible('office_loan_code') && renderColumnHeader('office_loan_code', 'Loan Code')}
                        {isColumnVisible('office_customer_no') && renderColumnHeader('office_customer_no', 'Customer No')}
                        {isColumnVisible('office_customer') && renderColumnHeader('office_customer', 'Customer')}
                        {isColumnVisible('office_route') && renderColumnHeader('office_route', 'Route')}
                        {isColumnVisible('office_center') && renderColumnHeader('office_center', 'Center')}
                        {isColumnVisible('office_loan_amount') && renderColumnHeader('office_loan_amount', 'Loan Amount')}
                        {isColumnVisible('office_installment') && renderColumnHeader('office_installment', 'Installment')}
                        {isColumnVisible('office_paid_total') && renderColumnHeader('office_paid_total', 'Paid Total')}
                        {isColumnVisible('office_outstanding') && renderColumnHeader('office_outstanding', 'Outstanding')}
                        {isColumnVisible('office_arrears') && renderColumnHeader('office_arrears', 'Arrears')}
                        {isColumnVisible('office_extra_payment') && renderColumnHeader('office_extra_payment', 'Extra Payment')}
                        {isColumnVisible('office_due_date') && renderColumnHeader('office_due_date', 'Due Date')}
                        {isColumnVisible('office_next_payment') && renderColumnHeader('office_next_payment', 'Next Payment')}
                        {isColumnVisible('office_status') && renderColumnHeader('office_status', 'Status')}
                      </tr>
                    </thead>
                    <tbody>
                      {officeDisplayLoans.map((loan) => (
                        <tr
                          key={loan.id}
                          onClick={() => openLoanDetailsModal(loan)}
                          className={getLoanRecordRowClass(loan, loanRecordHighlightDate)}
                        >
                          {isColumnVisible('office_loan_code') && (
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{loan.loan_code || '-'}</span>
                            </td>
                          )}
                          {isColumnVisible('office_customer_no') && <td className="px-3 py-2">{loan.customer_no || '-'}</td>}
                          {isColumnVisible('office_customer') && <td className="px-3 py-2">{loan.customer_name}</td>}
                          {isColumnVisible('office_route') && <td className="px-3 py-2">{loan.route?.name || loan.route_name || '-'}</td>}
                          {isColumnVisible('office_center') && <td className="px-3 py-2">{loan.center?.name || '-'}</td>}
                          {isColumnVisible('office_loan_amount') && <td className="px-3 py-2">{Number(loan.loan_amount || 0).toFixed(2)}</td>}
                          {isColumnVisible('office_installment') && <td className="px-3 py-2">{Number(loan.installment_amount || 0).toFixed(2)}</td>}
                          {isColumnVisible('office_paid_total') && (
                            <td className="px-3 py-2 text-emerald-700 font-semibold">{getPaidTotal(loan.id).toFixed(2)}</td>
                          )}
                          {isColumnVisible('office_outstanding') && (
                            <td className="px-3 py-2 text-rose-700 font-semibold">{getOutstandingBalance(loan).toFixed(2)}</td>
                          )}
                          {isColumnVisible('office_arrears') && (
                            <td className="px-3 py-2 text-red-700 font-semibold">{getArrearsAmount(loan).toFixed(2)}</td>
                          )}
                          {isColumnVisible('office_extra_payment') && (
                            <td className="px-3 py-2 text-violet-700 font-semibold">{getExtraPayment(loan).toFixed(2)}</td>
                          )}
                          {isColumnVisible('office_due_date') && <td className="px-3 py-2">{formatDateDisplay(loan.due_date)}</td>}
                          {isColumnVisible('office_next_payment') && <td className="px-3 py-2">{formatDateDisplay(loan.next_payment_date)}</td>}
                          {isColumnVisible('office_status') && (
                            <td className="px-3 py-2 capitalize">
                              <span className="inline-flex rounded-full px-2 py-1 text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                                {loan.status}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
        </div>

        {bulkCollectModal.open && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-slate-900/55 backdrop-blur-sm px-4 py-4 sm:py-6">
            <div className="my-auto w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.75)]">
              <div className="relative bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-500 px-5 py-5 text-white">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/85">Group Collection Desk</p>
                    <h3 className="text-xl font-extrabold mt-1">Bulk Collection</h3>
                    <p className="mt-1 text-sm text-white/90 break-words">
                      {bulkCollectModal.centerName || '-'} | {bulkCollectModal.groupName || '-'} ({bulkCollectModal.groupCode || '-'})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBulkCollectModal}
                    className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white text-sm font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4 sm:p-5 space-y-4 text-black bg-gradient-to-b from-cyan-50/35 to-white">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Collection Date</label>
                    <input
                      type="date"
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-cyan-100 bg-white"
                      value={bulkCollectModal.date}
                      onChange={(e) => setBulkCollectModal((prev) => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Pay Type</label>
                    <select
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-cyan-100 bg-white"
                      value={bulkCollectModal.paymentType}
                      onChange={(e) =>
                        setBulkCollectModal((prev) => ({
                          ...prev,
                          paymentType: e.target.value as 'cash' | 'check' | 'bank_transfer',
                        }))
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase text-slate-600">Reference</label>
                    <input
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-cyan-100 bg-white"
                      value={bulkCollectModal.paymentReference}
                      onChange={(e) =>
                        setBulkCollectModal((prev) => ({
                          ...prev,
                          paymentReference: e.target.value,
                        }))
                      }
                      placeholder="Cheque no / TXN ID / Bank reference"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-slate-600">Note</label>
                  <textarea
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-cyan-100 bg-white"
                    rows={2}
                    value={bulkCollectModal.note}
                    onChange={(e) => setBulkCollectModal((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="Optional note for the whole group collection"
                  />
                </div>

                <div className="overflow-x-auto rounded-2xl border border-cyan-100">
                  <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                    <thead className="bg-gradient-to-r from-slate-100 to-cyan-50 text-slate-800">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Select</th>
                        <th className="px-3 py-2 font-semibold">Loan Code</th>
                        <th className="px-3 py-2 font-semibold">Customer No</th>
                        <th className="px-3 py-2 font-semibold">Member Name</th>
                        <th className="px-3 py-2 font-semibold">Due Date</th>
                        <th className="px-3 py-2 font-semibold text-right">Installment</th>
                        <th className="px-3 py-2 font-semibold text-right">Outstanding</th>
                        <th className="px-3 py-2 font-semibold text-right">Collect Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkCollectModal.members.map((member) => (
                        <tr
                          key={`bulk-member-${member.loanId}`}
                          className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors"
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={member.selected}
                              onChange={(e) =>
                                setBulkCollectModal((prev) => ({
                                  ...prev,
                                  members: prev.members.map((row) =>
                                    row.loanId === member.loanId ? { ...row, selected: e.target.checked } : row
                                  ),
                                }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{member.loanCode || '-'}</td>
                          <td className="px-3 py-2">{member.customerNo || '-'}</td>
                          <td className="px-3 py-2">{member.customerName}</td>
                          <td className="px-3 py-2">{formatDateDisplay(member.dueDate)}</td>
                          <td className="px-3 py-2 text-right">{member.installmentAmount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-rose-700 font-semibold">{member.outstandingAmount.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <input
                              className="w-28 ml-auto block px-2 py-1.5 rounded-lg border border-cyan-100 bg-white text-right"
                              value={member.amount}
                              onChange={(e) =>
                                setBulkCollectModal((prev) => ({
                                  ...prev,
                                  members: prev.members.map((row) =>
                                    row.loanId === member.loanId ? { ...row, amount: e.target.value } : row
                                  ),
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-cyan-100 bg-white px-4 sm:px-5 py-4 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Selected Members:{' '}
                  <span className="font-semibold text-slate-700">
                    {bulkCollectModal.members.filter((member) => member.selected).length}
                  </span>
                </p>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={closeBulkCollectModal}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitBulkCollection}
                    disabled={bulkCollectSaving}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {bulkCollectSaving ? 'Saving...' : 'Complete Collection'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {collectModal.open && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-slate-900/55 backdrop-blur-sm px-4 py-4 sm:py-6">
            <div className="my-auto w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.75)]">
              <div className="relative bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-5 text-white">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/85">Collection Desk</p>
                    <h3 className="text-xl font-extrabold mt-1">Collect Installment</h3>
                    <p className="mt-1 text-sm text-white/90 break-words">{collectModal.customerName} | {collectModal.loanCode}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCollectModal}
                    className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white text-sm font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4 sm:p-5 space-y-4 text-black bg-gradient-to-b from-emerald-50/35 to-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 rounded-2xl border border-emerald-100 bg-white p-3 text-xs">
                  <div>
                    <p className="uppercase text-slate-500">Due Date</p>
                    <p className="font-semibold text-slate-800">{formatDateDisplay(collectModal.dueDate)}</p>
                  </div>
                  <div>
                    <p className="uppercase text-slate-500">Penalty Rate</p>
                    <p className="font-semibold text-slate-800">{collectModal.penaltyRate.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="uppercase text-slate-500">Grace Days</p>
                    <p className="font-semibold text-slate-800">{collectModal.graceDays}</p>
                  </div>
                  <div>
                    <p className="uppercase text-slate-500">Late Days</p>
                    <p className="font-semibold text-slate-800">{penaltyPreview.lateDays}</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1">
                    <p className="uppercase text-slate-500">Est. Penalty</p>
                    <p className="font-semibold text-rose-700">{penaltyPreview.penaltyAmount.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Amount</label>
                    <input
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-white"
                      value={collectModal.amount}
                      onChange={(e) => setCollectModal((p) => ({ ...p, amount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Collection Date</label>
                    <input
                      type="date"
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-white"
                      value={collectModal.date}
                      onChange={(e) => setCollectModal((p) => ({ ...p, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Pay Type</label>
                    <select
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-white"
                      value={collectModal.paymentType}
                      onChange={(e) =>
                        setCollectModal((p) => ({
                          ...p,
                          paymentType: e.target.value as 'cash' | 'check' | 'bank_transfer',
                        }))
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-600">Reference</label>
                    <input
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-white"
                      value={collectModal.paymentReference}
                      onChange={(e) => setCollectModal((p) => ({ ...p, paymentReference: e.target.value }))}
                      placeholder="Cheque no / TXN ID / Bank reference"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase text-slate-600">Note</label>
                    <textarea
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-white"
                      rows={3}
                      value={collectModal.note}
                      onChange={(e) => setCollectModal((p) => ({ ...p, note: e.target.value }))}
                      placeholder="Optional collection note"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-emerald-100 bg-white px-4 sm:px-5 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCollectModal}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCollection}
                  disabled={collectSaving}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {collectSaving ? 'Saving...' : 'Confirm Collection'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loanDetailsModal.open && loanDetailsModal.loan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm px-4 py-6">
            <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.75)]">
              <div className="relative bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-500 px-5 py-5 text-white">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/85">Loan Intelligence Card</p>
                    <h3 className="text-xl font-extrabold mt-1">Loan Details</h3>
                    <p className="text-sm text-white/90 mt-1">{loanDetailsModal.loan.customer_name} | {loanDetailsModal.loan.customer_no}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeLoanDetailsModal}
                    className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white text-sm font-semibold"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide">{loanDetailsModal.loan.loan_scope}</span>
                  <span className="inline-flex rounded-full bg-emerald-400/25 px-3 py-1 text-xs font-semibold uppercase tracking-wide">{loanDetailsModal.loan.status}</span>
                </div>
              </div>

              <div className="p-5 bg-gradient-to-b from-cyan-50/35 to-white">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-700">
                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Route</p><p className="font-semibold">{loanDetailsModal.loan.route?.name || loanDetailsModal.loan.route_name || '-'}</p></div>
                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Center</p><p className="font-semibold">{loanDetailsModal.loan.center?.name || '-'}</p></div>
                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Group</p><p className="font-semibold">{loanDetailsModal.loan.group?.name || '-'}</p></div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Loan Amount</p><p className="font-semibold text-slate-900">{Number(loanDetailsModal.loan.loan_amount || 0).toFixed(2)}</p></div>
                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Refundable Amount</p><p className="font-semibold text-slate-900">{Number(loanDetailsModal.loan.refundable_amount || 0).toFixed(2)}</p></div>
                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Installment Amount</p><p className="font-semibold text-slate-900">{Number(loanDetailsModal.loan.installment_amount || 0).toFixed(2)}</p></div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"><p className="text-xs text-emerald-700">Paid Total</p><p className="font-extrabold text-emerald-700">{getPaidTotal(loanDetailsModal.loan.id).toFixed(2)}</p></div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3"><p className="text-xs text-rose-700">Outstanding Balance</p><p className="font-extrabold text-rose-700">{getOutstandingBalance(loanDetailsModal.loan).toFixed(2)}</p></div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3"><p className="text-xs text-amber-700">Arrears</p><p className="font-extrabold text-amber-700">{getArrearsAmount(loanDetailsModal.loan).toFixed(2)}</p></div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3"><p className="text-xs text-violet-700">Extra Payment</p><p className="font-extrabold text-violet-700">{getExtraPayment(loanDetailsModal.loan).toFixed(2)}</p></div>
                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Due Date</p><p className="font-semibold">{formatDateDisplay(loanDetailsModal.loan.due_date)}</p></div>
                  <div className="rounded-xl border border-cyan-100 bg-white p-3"><p className="text-xs text-slate-500">Next Payment Date</p><p className="font-semibold">{formatDateDisplay(loanDetailsModal.loan.next_payment_date)}</p></div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                    <p className="text-xs text-indigo-700">Last Pay Date</p>
                    <p className="font-semibold text-indigo-900">{formatDateDisplay(getLastPayDate(loanDetailsModal.loan))}</p>
                  </div>
                  <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3">
                    <p className="text-xs text-orange-700">Loan End Date</p>
                    <p className="font-semibold text-orange-900">{formatDateDisplay(loanDetailsModal.loan.loan_end_date)}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-cyan-100 bg-white px-5 py-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeLoanDetailsModal}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeLoanDetailsModal();
                    openCollectModal(loanDetailsModal.loan as LoanRow);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold"
                >
                  Collect From This Loan
                </button>
              </div>
            </div>
          </div>
        )}

        <CollectionReceiptBill
          open={receiptModal.open}
          receipt={receiptModal.receipt}
          companyName={receiptCompany.name}
          companyAddress={receiptCompany.address}
          companyContactNo={receiptCompany.contactNo}
          companyLogoUrl={receiptCompany.logoUrl}
          onClose={() => setReceiptModal({ open: false, receipt: null })}
        />

        {noticeModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-cyan-100">
              <h3 className="text-lg font-bold text-slate-900">{noticeModal.title}</h3>
              <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{noticeModal.message}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setNoticeModal({ open: false, title: '', message: '' })}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-semibold"
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
