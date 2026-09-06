'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Badge from '../_components/Badge';
import ClientMountGate from '@/app/components/ClientMountGate';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  Car,
  CheckCircle2,
  Clock3,
  Eye,
  FileSearch,
  Filter,
  Gem,
  Home,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

const inputClass =
  'w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200/70';

type ViewMode = 'table' | 'cards';

type MortgageApprovalRow = {
  id: number;
  due_date?: string | null;
  mortgage_type?: string | null;
  requested_amount?: number | string | null;
  approved_amount?: number | string | null;
  installment_amount?: number | string | null;
  installment_frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | string | null;
  interest_rate?: number | string | null;
  interest_type?: 'fixed' | 'reducing' | string | null;
  tenure_months?: number | string | null;
  status?: string | null;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    nic_passport?: string;
  } | null;
};

type ActionType = 'approve' | 'reject' | 'delete';

type AuthUser = {
  email?: string | null;
  designation?: { name?: string | null } | null;
  roles?: Array<{ name?: string | null }> | null;
};

function normalizeRoleText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAdminOrSuperAdminRole(name: unknown): boolean {
  const normalized = normalizeRoleText(name);
  return normalized === 'admin' || normalized === 'superadmin' || normalized === 'super admin';
}

function userCanDeleteMortgage(authUser: AuthUser | null): boolean {
  if (!authUser) return false;
  if (String(authUser.email || '').toLowerCase() === 'superadmin@softcodelk.com') return true;

  const designation = normalizeRoleText(authUser.designation?.name);
  if (isAdminOrSuperAdminRole(designation)) return true;

  return (authUser.roles || []).some((role) => isAdminOrSuperAdminRole(role?.name));
}

type MortgageDetail = MortgageApprovalRow & {
  created_at?: string | null;
  processing_fee?: number | string | null;
  penalty_rate?: number | string | null;
  customer_id?: number | string | null;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    nic_passport?: string;
    email?: string;
    address?: string;
  } | null;
  asset?: {
    asset_type?: string | null;
    deed_number?: string | null;
    vehicle_reg_no?: string | null;
    description?: string | null;
    estimated_value?: number | string | null;
  } | null;
};

type CustomerDetail = {
  id: number;
  customer_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  nic_passport?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  nationality?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  employment_type?: string | null;
  employer_name?: string | null;
  job_title?: string | null;
  monthly_income?: number | string | null;
  existing_loans?: boolean | number | string | null;
  monthly_loan_obligations?: number | string | null;
  credit_score?: number | string | null;
  status?: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function formatAmount(value: unknown): string {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: unknown): string {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric.toFixed(2)}%`;
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function formatYesNo(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const lowered = String(value ?? '').toLowerCase();
  if (lowered === '1' || lowered === 'true' || lowered === 'yes') return 'Yes';
  if (lowered === '0' || lowered === 'false' || lowered === 'no') return 'No';
  return '-';
}

function getInstallmentCount(tenureMonths: unknown, frequency: unknown): number {
  const tenure = toNumber(tenureMonths);
  if (!Number.isFinite(tenure) || tenure <= 0) return 0;

  const perYearMap: Record<string, number> = {
    daily: 365,
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
  };

  const perYear = perYearMap[String(frequency || 'monthly').toLowerCase()] ?? 12;
  const years = tenure / 12;
  return Math.max(1, Math.round(years * perYear));
}

function canReviewStatus(status: unknown): boolean {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'draft' || normalized === 'submitted';
}

function statusVariant(status: string | null | undefined): 'success' | 'warning' | 'info' | 'danger' | 'default' {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'active' || s === 'released') return 'success';
  if (s === 'rejected') return 'danger';
  if (s === 'arrears') return 'warning';
  if (s === 'submitted') return 'info';
  if (s === 'draft') return 'default';
  return 'default';
}

function mortgageTypeMeta(type: string) {
  const key = String(type || 'other').toLowerCase();
  if (key === 'vehicle') return { icon: Car, color: 'from-sky-500 to-blue-600', label: 'Vehicle' };
  if (key === 'land') return { icon: Building2, color: 'from-emerald-500 to-teal-600', label: 'Land' };
  if (key === 'house') return { icon: Home, color: 'from-violet-500 to-indigo-600', label: 'House' };
  if (key === 'gold') return { icon: Gem, color: 'from-amber-500 to-orange-600', label: 'Gold' };
  return { icon: Briefcase, color: 'from-slate-500 to-slate-700', label: 'Other' };
}

function calculateRefundAmount(row: MortgageApprovalRow | MortgageDetail): number {
  const installment = toNumber(row.installment_amount);
  const count = getInstallmentCount(row.tenure_months, row.installment_frequency);
  if (!Number.isFinite(installment) || count <= 0) return NaN;
  return installment * count;
}

export default function MortgageApprovals() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [rows, setRows] = useState<MortgageApprovalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const widgetPrefix = 'mortgages_approvals_widget_';

  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('approve');
  const [actionRow, setActionRow] = useState<MortgageApprovalRow | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRow, setDetailRow] = useState<MortgageDetail | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);

  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const fetchNotificationPreview = useCallback(async (authToken: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/notifications/preview?limit=4`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to load notifications preview');
      const payload = await response.json();
      setActionCenterTotalCount(Number(payload?.action_center_total || 0));
    } catch {
      setActionCenterTotalCount(0);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    router.push('/');
  };

  const displayName = String(authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  const openToast = (kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }

    setToken(t);
    void fetchNotificationPreview(t);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser));
      } catch {
        setAuthUser(null);
      }
    }
  }, [fetchNotificationPreview, router]);

  const canDeleteMortgage = useMemo(() => userCanDeleteMortgage(authUser), [authUser]);

  useEffect(() => {
    if (!token) return;
    fetchApprovals(token);
    void fetchWidgetPreferences(token);
  }, [token]);

  const fetchApprovals = async (authToken: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`${getApiBaseUrl()}/mortgages`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 300 },
      });

      const data = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      setRows(data);
    } catch {
      setRows([]);
      openToast('error', 'Failed to load mortgage records.');
    } finally {
      setLoading(false);
    }
  };

  async function fetchWidgetPreferences(authToken: string) {
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
  }

  const saveWidgetPreference = useCallback(async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        `${getApiBaseUrl()}/dashboard/widgets`,
        { widget_key: widgetKey, is_visible: isVisible },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch {
      return false;
    }
  }, [token]);

  const hideWidget = useCallback(async (widgetKey: string) => {
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
  }, [hiddenWidgetKeys, saveWidgetPreference]);

  const statusOptions = useMemo(() => {
    const values = Array.from(
      new Set(rows.map((row) => String(row.status || '').toLowerCase()).filter((v) => v !== ''))
    );
    return values.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const mortgageTypes = useMemo(() => {
    const values = Array.from(
      new Set(rows.map((row) => String(row.mortgage_type || '').toLowerCase()).filter((v) => v !== ''))
    );
    return values.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return rows.filter((row) => {
      const type = String(row.mortgage_type || '').toLowerCase();
      const status = String(row.status || '').toLowerCase();
      if (typeFilter !== 'all' && type !== typeFilter) return false;
      if (statusFilter !== 'all' && status !== statusFilter) return false;

      if (!keyword) return true;

      const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim();
      const haystack = [
        row.id,
        type,
        customerName,
        row.customer?.phone || '',
        row.customer?.nic_passport || '',
        row.interest_type || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [rows, query, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const requestedTotal = filteredRows.reduce((sum, row) => {
      const amount = toNumber(row.requested_amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const averageRate = filteredRows.length
      ? filteredRows.reduce((sum, row) => {
          const rate = toNumber(row.interest_rate);
          return sum + (Number.isFinite(rate) ? rate : 0);
        }, 0) / filteredRows.length
      : 0;

    const reducingCount = filteredRows.filter((row) => String(row.interest_type || '').toLowerCase() === 'reducing').length;
    const reviewable = filteredRows.filter((row) => canReviewStatus(row.status)).length;
    const draftCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'draft').length;
    const submittedCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'submitted').length;
    const approvedCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'approved').length;

    return {
      visible: filteredRows.length,
      reviewable,
      draftCount,
      submittedCount,
      approvedCount,
      requestedTotal,
      averageRate,
      reducingCount,
    };
  }, [filteredRows, rows]);

  const openActionModal = (type: ActionType, row: MortgageApprovalRow) => {
    setActionType(type);
    setActionRow(row);
    setActionNote('');
    setActionModalOpen(true);
  };

  const runStatusAction = async (type: ActionType, row: MortgageApprovalRow, note?: string) => {
    if (!token) return;

    if (!canReviewStatus(row.status)) {
      openToast('error', `Mortgage #${row.id} is already "${row.status || 'unknown'}" and cannot be ${type === 'approve' ? 'approved' : 'rejected'}.`);
      return;
    }

    try {
      setActionLoading(true);
      const response = await axios.post(
        `${getApiBaseUrl()}/mortgages/${row.id}/status`,
        {
          action: type,
          note: note?.trim() || undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      const nextStatus = String(response.data?.status || (type === 'approve' ? 'approved' : 'rejected'));
      setRows((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, status: nextStatus } : item))
      );
      if (detailRow?.id === row.id) {
        setDetailRow((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      }
      setActionModalOpen(false);
      openToast('success', `Mortgage #${row.id} ${type === 'approve' ? 'approved' : 'rejected'} successfully.`);
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        (error?.response?.data?.current
          ? `Cannot ${type} while status is "${error.response.data.current}".`
          : 'Action failed. Please try again.');
      openToast('error', message);
    } finally {
      setActionLoading(false);
    }
  };

  const openDetailModal = async (id: number) => {
    if (!token) return;

    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailRow(null);
    setCustomerDetail(null);
    setCustomerLoading(false);

    try {
      const response = await axios.get(`${getApiBaseUrl()}/mortgages/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const payload = response.data?.data ?? response.data;
      setDetailRow(payload || null);

      const customerId = payload?.customer_id;
      if (customerId) {
        setCustomerLoading(true);

        try {
          const customerResponse = await axios.get(`${getApiBaseUrl()}/customers/${customerId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });

          const customerPayload = customerResponse.data?.data ?? customerResponse.data;
          setCustomerDetail(customerPayload || null);
        } catch {
          setCustomerDetail(null);
        } finally {
          setCustomerLoading(false);
        }
      }
    } catch {
      setDetailRow(null);
      openToast('error', 'Failed to load mortgage details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const runDelete = async (row: MortgageApprovalRow) => {
    if (!token || !canDeleteMortgage) return;

    try {
      setActionLoading(true);
      const response = await axios.delete(`${getApiBaseUrl()}/mortgages/${row.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      setRows((prev) => prev.filter((item) => item.id !== row.id));
      if (detailRow?.id === row.id) {
        setDetailModalOpen(false);
        setDetailRow(null);
      }
      setActionModalOpen(false);
      const deletedPayments = Number(response.data?.deleted_payments ?? 0);
      openToast(
        'success',
        deletedPayments > 0
          ? `Mortgage #${row.id} and ${deletedPayments} payment record${deletedPayments === 1 ? '' : 's'} deleted.`
          : `Mortgage #${row.id} deleted successfully.`
      );
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to delete mortgage.';
      openToast('error', message);
    } finally {
      setActionLoading(false);
    }
  };

  const submitAction = async () => {
    if (!actionRow) return;
    if (actionType === 'delete') {
      await runDelete(actionRow);
      return;
    }
    await runStatusAction(actionType, actionRow, actionNote);
  };

  const openDeleteModal = (row: MortgageApprovalRow) => {
    setActionType('delete');
    setActionRow(row);
    setActionNote('');
    setActionModalOpen(true);
  };

  const resetFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const renderRowActions = (row: MortgageApprovalRow, stacked = false) => (
    <div className={`flex ${stacked ? 'flex-col' : 'flex-wrap'} items-center gap-2`}>
      {canReviewStatus(row.status) && (
        <>
          <button
            type="button"
            onClick={() => openActionModal('approve', row)}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => openActionModal('reject', row)}
            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => openDetailModal(row.id)}
        className="inline-flex items-center gap-1 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
      {canDeleteMortgage && (
        <button
          type="button"
          onClick={() => openDeleteModal(row)}
          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      )}
    </div>
  );

  const statsCards = [
    { key: 'stat_visible', icon: FileSearch, label: 'Visible', value: stats.visible, tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
    { key: 'stat_reviewable', icon: Clock3, label: 'Awaiting Review', value: stats.reviewable, tone: 'text-amber-700', bg: 'from-amber-500/10 to-orange-500/5' },
    { key: 'stat_draft', icon: ShieldAlert, label: 'Draft', value: stats.draftCount, tone: 'text-slate-600', bg: 'from-slate-400/10 to-zinc-500/5' },
    { key: 'stat_submitted', icon: CheckCircle2, label: 'Submitted', value: stats.submittedCount, tone: 'text-cyan-700', bg: 'from-cyan-500/10 to-blue-500/5' },
    { key: 'stat_requested_total', icon: Banknote, label: 'Requested Total', value: formatAmount(stats.requestedTotal), tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-green-500/5' },
    { key: 'stat_avg_rate', icon: TrendingUp, label: 'Avg Rate', value: formatPercent(stats.averageRate), tone: 'text-indigo-700', bg: 'from-indigo-500/10 to-violet-500/5' },
    { key: 'stat_approved', icon: CheckCircle2, label: 'Approved', value: stats.approvedCount, tone: 'text-teal-700', bg: 'from-teal-500/10 to-cyan-500/5' },
    { key: 'stat_reducing', icon: TrendingUp, label: 'Reducing Loans', value: stats.reducingCount, tone: 'text-violet-700', bg: 'from-violet-500/10 to-purple-500/5' },
  ];
  const visibleStatsCards = statsCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const tableColumns: Array<{
    key: string;
    label: string;
    className?: string;
    render: (row: MortgageApprovalRow, index: number) => React.ReactNode;
  }> = [
    { key: 'id', label: 'ID', className: 'font-bold text-slate-900', render: (row) => `#${row.id}` },
    { key: 'customer', label: 'Customer', className: 'font-semibold text-black', render: (row) => `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || '—' },
    { key: 'contact', label: 'Contact', className: 'text-black', render: (row) => row.customer?.phone || '—' },
    { key: 'nic', label: 'NIC', className: 'text-black', render: (row) => row.customer?.nic_passport || '—' },
    { key: 'type', label: 'Type', className: 'capitalize text-black', render: (row) => row.mortgage_type || '—' },
    { key: 'requested', label: 'Requested', className: 'font-bold text-cyan-800', render: (row) => formatAmount(row.requested_amount) },
    { key: 'installment', label: 'Installment', className: 'font-bold text-indigo-700', render: (row) => formatAmount(row.installment_amount) },
    { key: 'total_repay', label: 'Total Repay', className: 'font-bold text-emerald-700', render: (row) => formatAmount(calculateRefundAmount(row)) },
    { key: 'rate', label: 'Rate', className: 'text-black', render: (row) => `${formatPercent(row.interest_rate)} (${row.interest_type || '—'})` },
    { key: 'tenure', label: 'Tenure', className: 'text-black', render: (row) => `${row.tenure_months || '—'} mo` },
    { key: 'due_date', label: 'Due Date', className: 'text-black', render: (row) => formatDate(row.due_date) },
    { key: 'status', label: 'Status', render: (row) => <Badge label={String(row.status || '—')} variant={statusVariant(row.status)} /> },
    { key: 'actions', label: 'Actions', className: 'text-center', render: (row) => <div className="flex justify-center">{renderRowActions(row)}</div> },
  ];
  const visibleTableColumns = tableColumns.filter((column) => !hiddenWidgetKeys.has(`${widgetPrefix}table_column_${column.key}`));

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showStatsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}stats_section`);
  const showFiltersWidget = !hiddenWidgetKeys.has(`${widgetPrefix}filters`);
  const showRequestsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}requests`);
  const showAnyWidget =
    showHeroWidget ||
    (showStatsWidget && visibleStatsCards.length > 0) ||
    showFiltersWidget ||
    showRequestsWidget;

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#071a22]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
        <p className="text-sm font-medium text-cyan-100/80">Loading approval desk...</p>
      </div>
    </div>
  );

  if (!token) {
    return <ClientMountGate fallback={pageFallback}>{pageFallback}</ClientMountGate>;
  }

  return (
    <ClientMountGate fallback={pageFallback}>
    <div className="relative min-h-screen overflow-hidden bg-[#f3f8fb]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-0 top-16 h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(14,116,144,0.1) 1px, transparent 0)',
            backgroundSize: '26px 26px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <nav className="relative z-10 rounded-2xl border border-white/20 bg-white/80 p-3 shadow-lg backdrop-blur-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500">
                  <span className="text-sm font-bold text-white">DOF</span>
                </div>
                <h1 className="max-w-[220px] truncate bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-base font-bold text-transparent sm:max-w-none sm:text-xl">
                  Desk of Finance
                </h1>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard/mortgages')}
                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                Back to Mortgages
              </button>

              <div className="hidden items-center space-x-2 text-xs text-gray-600 sm:flex sm:text-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                <span>System Online</span>
              </div>

              <button
                type="button"
                onClick={() => router.push('/dashboard/action-center')}
                className="flex w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-left transition hover:bg-amber-100 sm:w-auto"
              >
                <span className="text-base">🔔</span>
                <span className="text-xs font-semibold text-amber-800">Action Center</span>
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-300 px-1.5 text-[11px] font-bold text-amber-900">
                  {actionCenterTotalCount}
                </span>
              </button>

              <div className="hidden items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-left sm:flex">
                <div className="leading-tight">
                  <p className="max-w-[220px] truncate text-xs font-semibold text-slate-900">{displayName}</p>
                  <p className="truncate text-[11px] text-slate-500">{roleName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-emerald-600 hover:to-cyan-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        {widgetNotice ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
            All widgets are hidden. Use Restore Hidden Widgets from the dashboard to bring them back.
          </div>
        ) : null}

        {showHeroWidget ? (
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0a1a24] via-[#0f3a52] to-[#0c5a7a] text-white shadow-[0_30px_80px_-24px_rgba(14,116,144,0.8)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.25),transparent_42%)]" />
          <div className="relative p-6 md:p-8">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}hero`)}
                className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/85 text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide approvals hero widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Approval Desk
                </span>
                <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Mortgage Approval Workspace</h1>
                <p className="mt-2 text-sm leading-relaxed text-cyan-50/90 md:text-base">
                  Review draft and submitted applications, approve or reject with notes, and inspect full customer and collateral profiles.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-cyan-100/90">
                  <span className="rounded-lg bg-white/10 px-2.5 py-1">Mortgages</span>
                  <span className="text-cyan-200/50">/</span>
                  <span className="rounded-lg bg-cyan-400/20 px-2.5 py-1 font-semibold text-white">Approvals</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/mortgages/create')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  New Application
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/mortgages')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Mortgages Hub
                </button>
                <button
                  type="button"
                  onClick={() => fetchApprovals(token)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:brightness-110 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {showStatsWidget ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          {visibleStatsCards.map((item) => (
            <div
              key={item.label}
              className={`relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5`}
            >
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}${item.key}`)}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/70 bg-white/85 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label={`Hide ${item.label} widget`}
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                  <p className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                  <item.icon className="h-5 w-5 text-slate-600" />
                </div>
              </div>
            </div>
          ))}
          {visibleStatsCards.length === 0 ? (
            <div className="sm:col-span-2 xl:col-span-4 2xl:col-span-8 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
              All summary cards are hidden.
            </div>
          ) : null}
        </section>
        ) : null}

        {showFiltersWidget ? (
        <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_22px_55px_-34px_rgba(14,116,144,0.45)] backdrop-blur-xl">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide filters widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50/80"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-cyan-700" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Filters</p>
                <p className="mt-1 text-sm text-slate-600">Search, mortgage type, and status.</p>
              </div>
            </div>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">{filtersOpen ? 'Hide' : 'Show'}</span>
          </button>
          {filtersOpen && (
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="relative lg:col-span-6">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by id, customer, NIC, phone..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Type</label>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputClass}>
                    <option value="all">All Types</option>
                    {mortgageTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-3">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                    <option value="all">All Status</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={resetFilters} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Reset Filters
                </button>
              </div>
            </div>
          )}
        </section>
        ) : null}

        {showRequestsWidget ? (
        <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_24px_60px_-34px_rgba(14,116,144,0.5)] backdrop-blur-xl">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}requests`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide mortgage requests widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Mortgage Requests</h2>
              <p className="text-sm text-slate-500">
                {filteredRows.length} record{filteredRows.length === 1 ? '' : 's'} • {stats.reviewable} awaiting review
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === 'cards' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-600'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === 'table' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-600'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Table
              </button>
            </div>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
                <p className="text-sm text-slate-500">Loading mortgage requests...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <FileSearch className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">No records found</h3>
                <p className="mt-1 max-w-md text-sm text-slate-500">Adjust filters or refresh to load mortgage applications.</p>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredRows.map((row) => {
                  const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || '—';
                  const refundAmount = calculateRefundAmount(row);
                  const typeMeta = mortgageTypeMeta(String(row.mortgage_type || 'other'));
                  const TypeIcon = typeMeta.icon;
                  const reviewable = canReviewStatus(row.status);

                  return (
                    <article
                      key={row.id}
                      className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                        reviewable
                          ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/40 to-white'
                          : 'border-slate-200/90 bg-gradient-to-br from-white to-cyan-50/30'
                      }`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${typeMeta.color}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${typeMeta.color} text-white shadow-md`}>
                            <TypeIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">#{row.id} • {typeMeta.label}</p>
                            <h3 className="mt-1 text-lg font-extrabold text-slate-900">{customerName}</h3>
                            <p className="text-sm text-slate-500">{row.customer?.phone || '—'} • {row.customer?.nic_passport || '—'}</p>
                          </div>
                        </div>
                        <Badge label={String(row.status || '—')} variant={statusVariant(row.status)} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-3">
                          <p className="text-[11px] font-bold uppercase text-cyan-800">Requested</p>
                          <p className="mt-1 font-bold text-cyan-800">{formatAmount(row.requested_amount)}</p>
                        </div>
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                          <p className="text-[11px] font-bold uppercase text-indigo-800">Installment</p>
                          <p className="mt-1 font-bold text-indigo-700">{formatAmount(row.installment_amount)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                          <p className="text-[11px] font-bold uppercase text-emerald-800">Total Repay</p>
                          <p className="mt-1 font-bold text-emerald-700">{formatAmount(refundAmount)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/90 p-3">
                          <p className="text-[11px] font-bold uppercase text-slate-500">Rate / Tenure</p>
                          <p className="mt-1 font-bold text-slate-900">{formatPercent(row.interest_rate)}</p>
                          <p className="text-xs text-slate-500">{row.tenure_months || '—'} mo • {formatDate(row.due_date)}</p>
                        </div>
                      </div>
                      <div className="mt-4 border-t border-slate-100 pt-4">{renderRowActions(row, true)}</div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-cyan-100">
                <table className="min-w-[1200px] w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-black">
                      {visibleTableColumns.map((column) => (
                        <th key={column.key} className={`px-3 py-3 text-black ${column.className || ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span>{column.label}</span>
                            <WidgetCloseGate>
                              <button
                                type="button"
                                onClick={() => void hideWidget(`${widgetPrefix}table_column_${column.key}`)}
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                aria-label={`Hide ${column.label} column`}
                              >
                                ×
                              </button>
                            </WidgetCloseGate>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row, index) => {
                      return (
                        <tr key={row.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          {visibleTableColumns.map((column) => (
                            <td key={column.key} className={`px-3 py-2.5 ${column.className || ''}`}>
                              {column.render(row, index)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleTableColumns.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-600">
                    All request table columns are hidden.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
        ) : null}
      </div>

      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 px-6 py-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">Mortgage Details</h3>
                <p className="mt-1 text-sm text-slate-600">Full application, financial terms, asset, and customer profile.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canDeleteMortgage && detailRow && (
                  <button
                    type="button"
                    onClick={() => openDeleteModal(detailRow)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                )}
                {detailRow && canReviewStatus(detailRow.status) && (
                  <>
                    <button
                      type="button"
                      onClick={() => openActionModal('reject', detailRow)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => openActionModal('approve', detailRow)}
                      className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
                    >
                      Approve
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setDetailModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto">
              {detailLoading ? (
                <div className="py-10 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
                </div>
              ) : !detailRow ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
                  Unable to load mortgage detail.
                </div>
              ) : (
                (() => {
                  const refundAmount = calculateRefundAmount(detailRow);
                  const installmentCount = getInstallmentCount(detailRow.tenure_months, detailRow.installment_frequency);
                  return (
                <div className="space-y-4 text-sm">
                  <div className="rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Mortgage #{detailRow.id}</p>
                        <p className="text-lg font-bold text-slate-900 capitalize mt-1">{detailRow.mortgage_type || '-'}</p>
                      </div>
                      <p className="inline-flex rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-800">
                        {detailRow.status || '-'}
                      </p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-cyan-100 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Requested</p>
                        <p className="font-bold text-slate-900 mt-1">{formatAmount(detailRow.requested_amount)}</p>
                      </div>
                      <div className="rounded-lg border border-cyan-100 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Approved</p>
                        <p className="font-bold text-slate-900 mt-1">{formatAmount(detailRow.approved_amount)}</p>
                      </div>
                      <div className="rounded-lg border border-cyan-100 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Installment</p>
                        <p className="font-bold text-indigo-700 mt-1">{formatAmount(detailRow.installment_amount)}</p>
                      </div>
                      <div className="rounded-lg border border-cyan-100 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Refund Amount</p>
                        <p className="font-bold text-emerald-700 mt-1">{formatAmount(refundAmount)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                    <div className="xl:col-span-7 space-y-4">
                      <div className="rounded-xl border border-cyan-100 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Financial Terms</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <p className="text-slate-700">Interest: <span className="font-semibold">{formatPercent(detailRow.interest_rate)} ({detailRow.interest_type || '-'})</span></p>
                          <p className="text-slate-700">Tenure: <span className="font-semibold">{detailRow.tenure_months || '-'} months</span></p>
                          <p className="text-slate-700">Due Date: <span className="font-semibold">{formatDate(detailRow.due_date)}</span></p>
                          <p className="text-slate-700">Processing Fee: <span className="font-semibold">{formatAmount(detailRow.processing_fee)}</span></p>
                          <p className="text-slate-700">Penalty Rate: <span className="font-semibold">{formatPercent(detailRow.penalty_rate)}</span></p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-cyan-100 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Repayment Summary</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <p className="text-slate-700">Installment Amount: <span className="font-semibold">{formatAmount(detailRow.installment_amount)}</span></p>
                          <p className="text-slate-700">Installment Count: <span className="font-semibold">{installmentCount || '-'}</span></p>
                          <p className="text-slate-700">Refund Frequency: <span className="font-semibold capitalize">{detailRow.installment_frequency || '-'}</span></p>
                          <p className="text-slate-700">Refund Amount: <span className="font-semibold">{formatAmount(refundAmount)}</span></p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-cyan-100 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Asset</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <p className="text-slate-700">Type: <span className="font-semibold capitalize">{detailRow.asset?.asset_type || '-'}</span></p>
                          <p className="text-slate-700">Deed No: <span className="font-semibold">{detailRow.asset?.deed_number || '-'}</span></p>
                          <p className="text-slate-700">Vehicle No: <span className="font-semibold">{detailRow.asset?.vehicle_reg_no || '-'}</span></p>
                          <p className="text-slate-700">Estimated Value: <span className="font-semibold">{formatAmount(detailRow.asset?.estimated_value)}</span></p>
                          <p className="text-slate-700 md:col-span-2">Description: <span className="font-semibold">{detailRow.asset?.description || '-'}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="xl:col-span-5">
                      <div className="rounded-xl border border-cyan-100 p-4 h-full">
                        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Customer Profile</p>
                    <p className="text-slate-700">
                      Name: <span className="font-semibold">{`${customerDetail?.first_name || detailRow.customer?.first_name || ''} ${customerDetail?.last_name || detailRow.customer?.last_name || ''}`.trim() || '-'}</span>
                    </p>
                    <p className="text-slate-700">Phone: <span className="font-semibold">{customerDetail?.phone || detailRow.customer?.phone || '-'}</span></p>
                    <p className="text-slate-700">NIC: <span className="font-semibold">{customerDetail?.nic_passport || detailRow.customer?.nic_passport || '-'}</span></p>
                    <p className="text-slate-700">Email: <span className="font-semibold">{customerDetail?.email || detailRow.customer?.email || '-'}</span></p>
                    <p className="text-slate-700">Customer Code: <span className="font-semibold">{customerDetail?.customer_code || '-'}</span></p>
                    <p className="text-slate-700">DOB: <span className="font-semibold">{formatDate(customerDetail?.date_of_birth)}</span></p>
                    <p className="text-slate-700">Gender: <span className="font-semibold capitalize">{customerDetail?.gender || '-'}</span></p>
                    <p className="text-slate-700">Marital Status: <span className="font-semibold capitalize">{customerDetail?.marital_status || '-'}</span></p>
                    <p className="text-slate-700">Nationality: <span className="font-semibold">{customerDetail?.nationality || '-'}</span></p>
                    <p className="text-slate-700">Employment: <span className="font-semibold capitalize">{customerDetail?.employment_type || '-'}</span></p>
                    <p className="text-slate-700">Employer: <span className="font-semibold">{customerDetail?.employer_name || '-'}</span></p>
                    <p className="text-slate-700">Job Title: <span className="font-semibold">{customerDetail?.job_title || '-'}</span></p>
                    <p className="text-slate-700">Monthly Income: <span className="font-semibold">{formatAmount(customerDetail?.monthly_income)}</span></p>
                    <p className="text-slate-700">Existing Loans: <span className="font-semibold">{formatYesNo(customerDetail?.existing_loans)}</span></p>
                    <p className="text-slate-700">Loan Obligations: <span className="font-semibold">{formatAmount(customerDetail?.monthly_loan_obligations)}</span></p>
                    <p className="text-slate-700">Credit Score: <span className="font-semibold">{customerDetail?.credit_score || '-'}</span></p>
                    <p className="text-slate-700">Status: <span className="font-semibold capitalize">{customerDetail?.status || '-'}</span></p>
                    <p className="text-slate-700">Permanent Address: <span className="font-semibold">{customerDetail?.permanent_address || '-'}</span></p>
                    <p className="text-slate-700">Current Address: <span className="font-semibold">{customerDetail?.current_address || detailRow.customer?.address || '-'}</span></p>
                    {customerLoading && <p className="text-xs text-cyan-700 mt-2">Loading full customer profile...</p>}
                      </div>
                    </div>
                  </div>
                </div>
                  );
                })()
              )}
            </div>

            {(canDeleteMortgage || (detailRow && canReviewStatus(detailRow.status))) && (
              <div className="flex items-center justify-end gap-2 border-t border-cyan-100 bg-slate-50/80 px-6 py-4">
                {canDeleteMortgage && detailRow && (
                  <button
                    type="button"
                    onClick={() => openDeleteModal(detailRow)}
                    className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-200"
                  >
                    Delete
                  </button>
                )}
                {detailRow && canReviewStatus(detailRow.status) && (
                  <>
                    <button
                      type="button"
                      onClick={() => openActionModal('reject', detailRow)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => openActionModal('approve', detailRow)}
                      className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                    >
                      Confirm Approve
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {actionModalOpen && actionRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-2xl">
            <div
              className={`border-b px-6 py-4 ${
                actionType === 'delete'
                  ? 'border-rose-100 bg-gradient-to-r from-rose-50 to-red-50'
                  : 'border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50'
              }`}
            >
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                {actionType === 'approve' && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                {actionType === 'reject' && <ShieldAlert className="h-5 w-5 text-rose-600" />}
                {actionType === 'delete' && <Trash2 className="h-5 w-5 text-rose-600" />}
                {actionType === 'approve' ? 'Approve Mortgage' : actionType === 'reject' ? 'Reject Mortgage' : 'Delete Mortgage'}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Mortgage #{actionRow.id} • Requested {formatAmount(actionRow.requested_amount)}
              </p>
            </div>

            {actionType === 'delete' ? (
              <div className="p-6">
                <p className="text-sm leading-relaxed text-slate-700">
                  This permanently removes the mortgage application, all payment history, schedules, collateral records, and uploaded documents. This action cannot be undone.
                </p>
              </div>
            ) : (
              <div className="p-6">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Note (optional)</label>
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  rows={4}
                  placeholder={actionType === 'approve' ? 'Approval note' : 'Reason for rejection'}
                  className={inputClass}
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button
                type="button"
                onClick={() => setActionModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAction}
                disabled={actionLoading}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${
                  actionType === 'approve'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700'
                    : actionType === 'delete'
                      ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800'
                      : 'bg-gradient-to-r from-indigo-600 to-slate-700 hover:from-indigo-700 hover:to-slate-800'
                }`}
              >
                {actionLoading
                  ? 'Processing...'
                  : actionType === 'approve'
                    ? 'Confirm Approve'
                    : actionType === 'delete'
                      ? 'Confirm Delete'
                      : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[70]">
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${
              toast.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {toast.message}
            </div>
          </div>
        </div>
      )}
    </div>
    </ClientMountGate>
  );
}
