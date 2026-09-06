'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Badge from '../_components/Badge';
import ClientMountGate from '@/app/components/ClientMountGate';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  CalendarRange,
  Car,
  CheckCircle2,
  Clock3,
  Eye,
  Gem,
  Home,
  LayoutGrid,
  List,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200/70';

type ViewMode = 'table' | 'cards';

type MortgageRow = {
  id: number;
  due_date?: string | null;
  arrears_amount?: number | string | null;
  due_amount?: number | string | null;
  due_interest_amount?: number | string | null;
  created_at?: string | null;
  mortgage_type?: string | null;
  requested_amount?: number | string | null;
  approved_amount?: number | string | null;
  installment_amount?: number | string | null;
  total_paid_amount?: number | string | null;
  installment_frequency?: string | null;
  interest_rate?: number | string | null;
  interest_type?: string | null;
  tenure_months?: number | string | null;
  status?: string | null;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    nic_passport?: string;
  } | null;
  asset?: {
    deed_number?: string | null;
    vehicle_reg_no?: string | null;
    description?: string | null;
  } | null;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatAmount(v: unknown): string {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(v: unknown): string {
  const date = parseDateValue(v);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function frequencyLabel(frequency: unknown): string {
  const f = String(frequency || 'monthly').toLowerCase();
  if (f === 'daily') return 'Daily';
  if (f === 'weekly') return 'Weekly';
  if (f === 'monthly') return 'Monthly';
  if (f === 'quarterly') return 'Quarterly';
  if (f === 'yearly') return 'Yearly';
  return 'Monthly';
}

function daysOverdue(dueDate: string | null | undefined): number | null {
  const due = parseDateValue(dueDate);
  if (!due) return null;
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function mortgageTypeMeta(type: string) {
  const key = String(type || 'other').toLowerCase();
  if (key === 'vehicle') return { icon: Car, color: 'from-sky-500 to-blue-600', label: 'Vehicle' };
  if (key === 'land') return { icon: Building2, color: 'from-emerald-500 to-teal-600', label: 'Land' };
  if (key === 'house') return { icon: Home, color: 'from-violet-500 to-indigo-600', label: 'House' };
  if (key === 'gold') return { icon: Gem, color: 'from-amber-500 to-orange-600', label: 'Gold' };
  return { icon: Briefcase, color: 'from-slate-500 to-slate-700', label: 'Other' };
}

function statusTone(status: string): 'success' | 'warning' | 'info' | 'default' {
  const s = status.toLowerCase();
  if (s === 'active' || s === 'released') return 'success';
  if (s === 'arrears') return 'warning';
  if (s === 'approved') return 'info';
  return 'default';
}

export default function MortgageCollectionsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MortgageRow[]>([]);
  const [query, setQuery] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const widgetPrefix = 'mortgages_collections_widget_';

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentRow, setPaymentRow] = useState<MortgageRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsRow, setDetailsRow] = useState<MortgageRow | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [billData, setBillData] = useState<{
    billNo: string;
    paymentId: number;
    mortgageId: number;
    paidDate: string;
    customerName: string;
    amount: number;
    paymentMethod: string;
    remarks?: string;
    interestPaid?: number;
    principalPaid?: number;
    dueAmount?: number;
    dueInterestAmount?: number;
    arrearsAmount?: number;
  } | null>(null);

  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustRow, setAdjustRow] = useState<MortgageRow | null>(null);
  const [adjustMode, setAdjustMode] = useState<'waive' | 'add'>('waive');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

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

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
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

    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      try {
        setAuthUser(JSON.parse(rawUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [fetchNotificationPreview, router]);

  const fetchRows = async (authToken: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`${getApiBaseUrl()}/mortgages`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 1000, with_payment_totals: 1 },
      });

      const data = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      const allowed = new Set(['approved', 'active', 'arrears', 'released']);
      setRows(data.filter((row: MortgageRow) => allowed.has(String(row.status || '').toLowerCase())));
    } catch {
      setRows([]);
      openToast('error', 'Failed to load collection accounts.');
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

  useEffect(() => {
    if (!token) return;
    fetchRows(token);
    void fetchWidgetPreferences(token);
  }, [token]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = String(row.status || '').toLowerCase();
      if (statusFilter !== 'all' && status !== statusFilter) return false;

      const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim();
      const haystack = [
        row.id,
        row.mortgage_type || '',
        row.status || '',
        customerName,
        row.customer?.phone || '',
        row.customer?.nic_passport || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesText = !q || haystack.includes(q);

      const due = parseDateValue(row.due_date);
      const fromDate = dueFrom ? parseDateValue(dueFrom) : null;
      const toDate = dueTo ? parseDateValue(dueTo) : null;
      if (fromDate) fromDate.setHours(0, 0, 0, 0);
      if (toDate) toDate.setHours(23, 59, 59, 999);

      const matchesDueFrom = !fromDate || (!!due && due >= fromDate);
      const matchesDueTo = !toDate || (!!due && due <= toDate);

      return matchesText && matchesDueFrom && matchesDueTo;
    });
  }, [rows, query, dueFrom, dueTo, statusFilter]);

  const stats = useMemo(() => {
    let totalArrears = 0;
    let totalDuePrincipal = 0;
    let totalDueInterest = 0;
    let totalPaid = 0;
    let overdueCount = 0;

    filteredRows.forEach((row) => {
      const arrears = toNumber(row.arrears_amount);
      const duePrincipal = toNumber(row.due_amount);
      const dueInterest = toNumber(row.due_interest_amount);
      const paid = toNumber(row.total_paid_amount);
      if (Number.isFinite(arrears)) totalArrears += arrears;
      if (Number.isFinite(duePrincipal)) totalDuePrincipal += duePrincipal;
      if (Number.isFinite(dueInterest)) totalDueInterest += dueInterest;
      if (Number.isFinite(paid)) totalPaid += paid;
      if ((daysOverdue(row.due_date) ?? 0) > 0) overdueCount += 1;
    });

    const installmentBook = filteredRows.reduce((sum, row) => {
      const value = toNumber(row.installment_amount);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    const arrearsAccounts = filteredRows.filter((row) => String(row.status || '').toLowerCase() === 'arrears').length;

    return {
      total: filteredRows.length,
      arrearsAccounts,
      installmentBook,
      totalArrears,
      totalDuePrincipal,
      totalDueInterest,
      totalPaid,
      overdueCount,
    };
  }, [filteredRows]);

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((r) => String(r.status || '').toLowerCase()).filter(Boolean)));
    return values.sort();
  }, [rows]);

  const openPaymentModal = (row: MortgageRow) => {
    setPaymentRow(row);
    setPaymentAmount(String(toNumber(row.installment_amount) || ''));
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setPaymentDate(`${yyyy}-${mm}-${dd}`);
    setPaymentMethod('cash');
    setPaymentNote('');
    setPaymentOpen(true);
  };

  const openAdjustModal = (row: MortgageRow) => {
    setAdjustRow(row);
    setAdjustMode('waive');
    setAdjustAmount('');
    setAdjustNote('');
    setAdjustOpen(true);
  };

  const openDetailsModal = async (row: MortgageRow) => {
    setDetailsRow(row);
    setDetailsOpen(true);

    if (!token) return;

    try {
      setDetailsLoading(true);
      const response = await axios.get(`${getApiBaseUrl()}/mortgages/${row.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const data = response?.data;
      if (data && typeof data === 'object') {
        setDetailsRow((prev) => ({ ...(prev || row), ...data }));
      }
    } catch {
      openToast('error', `Failed to load full details for mortgage #${row.id}.`);
    } finally {
      setDetailsLoading(false);
    }
  };

  const submitPayment = async () => {
    if (!token || !paymentRow) return;

    const amount = toNumber(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      openToast('error', 'Enter a valid collection amount.');
      return;
    }

    try {
      setSavingPayment(true);
      const response = await axios.post(
        `${getApiBaseUrl()}/mortgages/${paymentRow.id}/payments`,
        {
          mortgage_id: paymentRow.id,
          branch_id: null,
          user_id: null,
          schedule_id: null,
          paid_date: paymentDate,
          amount,
          payment_method: paymentMethod,
          remarks: paymentNote.trim() || undefined,
          collected_by: null,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      const resData = response?.data || {};
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');

      const customerName = `${paymentRow.customer?.first_name || ''} ${paymentRow.customer?.last_name || ''}`.trim() || 'N/A';
      const paymentId = Number(resData.id || 0);
      const billNo = `BILL-MTG-${paymentRow.id}-${paymentId || `${yyyy}${mm}${dd}`}`;

      setBillData({
        billNo,
        paymentId,
        mortgageId: paymentRow.id,
        paidDate: paymentDate,
        customerName,
        amount,
        paymentMethod,
        remarks: paymentNote.trim() || undefined,
        interestPaid: Number(resData.interest_paid || 0),
        principalPaid: Number(resData.principal_paid || 0),
        dueAmount: Number(resData.due_amount || 0),
        dueInterestAmount: Number(resData.due_interest_amount || 0),
        arrearsAmount: Number(resData.arrears_amount || 0),
      });

      setRows((prev) =>
        prev
          .map((r) => {
            if (r.id !== paymentRow.id) return r;
            return {
              ...r,
              due_amount: Number(resData.due_amount ?? r.due_amount ?? 0),
              due_interest_amount: Number(resData.due_interest_amount ?? r.due_interest_amount ?? 0),
              arrears_amount: Number(resData.arrears_amount ?? r.arrears_amount ?? 0),
              due_date: (resData.due_date ?? r.due_date ?? null) as string | null,
              status: String(resData.mortgage_status || r.status || 'active'),
            };
          })
          .filter((r) => {
            const allowed = new Set(['approved', 'active', 'arrears', 'released']);
            return allowed.has(String(r.status || '').toLowerCase());
          })
      );

      await fetchRows(token);

      setPaymentOpen(false);
      setBillOpen(true);
      openToast('success', `Collection recorded for mortgage #${paymentRow.id}.`);
    } catch {
      openToast('error', 'Failed to record collection.');
    } finally {
      setSavingPayment(false);
    }
  };

  const submitAdjust = async () => {
    if (!token || !adjustRow) return;
    const value = toNumber(adjustAmount);
    if (!Number.isFinite(value) || value <= 0) {
      openToast('error', 'Enter a valid adjustment amount.');
      return;
    }
    try {
      setSavingAdjust(true);
      const response = await axios.post(
        `${getApiBaseUrl()}/mortgages/${adjustRow.id}/interest-adjustments`,
        {
          mode: adjustMode,
          amount: value,
          note: adjustNote.trim() || undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      const data = response?.data || {};

      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== adjustRow.id) return r;
          return {
            ...r,
            due_interest_amount: Number(data.due_interest_amount ?? r.due_interest_amount ?? 0),
            arrears_amount: Number(data.arrears_amount ?? r.arrears_amount ?? 0),
            status: String(data.status || r.status || 'active'),
          };
        })
      );

      openToast('success', 'Interest adjusted successfully.');
      setAdjustOpen(false);
    } catch {
      openToast('error', 'Failed to adjust interest.');
    } finally {
      setSavingAdjust(false);
    }
  };

  const printBill = () => {
    if (!billData) return;

    const content = `
      <html>
        <head>
          <title>Mortgage Bill ${billData.billNo}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; }
            .meta { margin-bottom: 18px; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>Mortgage Collection Bill</h1>
          <div class="meta">
            <div>Bill No: ${billData.billNo}</div>
            <div>Payment ID: ${billData.paymentId || '—'}</div>
            <div>Date: ${formatDate(billData.paidDate)}</div>
            <div>Mortgage ID: #${billData.mortgageId}</div>
            <div>Customer: ${billData.customerName}</div>
          </div>
          <table>
            <tr><th>Description</th><th>Amount</th></tr>
            <tr><td>Collected Amount</td><td>${formatAmount(billData.amount)}</td></tr>
            <tr><td>Interest Paid (Profit)</td><td>${formatAmount(billData.interestPaid ?? 0)}</td></tr>
            <tr><td>Principal Paid</td><td>${formatAmount(billData.principalPaid ?? 0)}</td></tr>
            <tr><td>Remaining Due Principal</td><td>${formatAmount(billData.dueAmount ?? 0)}</td></tr>
            <tr><td>Next Due Interest</td><td>${formatAmount(billData.dueInterestAmount ?? 0)}</td></tr>
            <tr><td>Arrears</td><td>${formatAmount(billData.arrearsAmount ?? 0)}</td></tr>
            <tr><td>Payment Method</td><td>${billData.paymentMethod}</td></tr>
            <tr><td>Remarks</td><td>${billData.remarks || '—'}</td></tr>
          </table>
        </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(content);
    win.document.close();
    win.focus();
    win.print();
  };

  const clearFilters = () => {
    setQuery('');
    setDueFrom('');
    setDueTo('');
    setStatusFilter('all');
  };

  const renderRowActions = (row: MortgageRow, compact = false) => (
    <div className={`flex ${compact ? 'flex-col gap-2' : 'flex-wrap gap-2'}`}>
      <button
        type="button"
        onClick={() => openDetailsModal(row)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
      >
        <Eye className="h-3.5 w-3.5" />
        Details
      </button>
      <button
        type="button"
        onClick={() => openPaymentModal(row)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:from-emerald-600 hover:to-teal-700"
      >
        <Banknote className="h-3.5 w-3.5" />
        Collect
      </button>
      <button
        type="button"
        onClick={() => router.push(`/dashboard/mortgages/${row.id}/payments`)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100"
      >
        <ReceiptText className="h-3.5 w-3.5" />
        History
      </button>
      <button
        type="button"
        onClick={() => openAdjustModal(row)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Adjust
      </button>
    </div>
  );

  const statsCards = [
    { key: 'stat_accounts', icon: Wallet, label: 'Accounts', value: stats.total, tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-teal-500/5' },
    { key: 'stat_arrears', icon: AlertTriangle, label: 'Arrears', value: stats.arrearsAccounts, tone: 'text-rose-700', bg: 'from-rose-500/10 to-red-500/5' },
    { key: 'stat_installment_book', icon: TrendingUp, label: 'Installment Book', value: formatAmount(stats.installmentBook), tone: 'text-cyan-700', bg: 'from-cyan-500/10 to-blue-500/5' },
    { key: 'stat_total_paid', icon: ReceiptText, label: 'Total Paid', value: formatAmount(stats.totalPaid), tone: 'text-violet-700', bg: 'from-violet-500/10 to-purple-500/5' },
    { key: 'stat_due_principal', icon: Banknote, label: 'Due Principal', value: formatAmount(stats.totalDuePrincipal), tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
    { key: 'stat_due_interest', icon: Clock3, label: 'Due Interest', value: formatAmount(stats.totalDueInterest), tone: 'text-amber-700', bg: 'from-amber-500/10 to-orange-500/5' },
    { key: 'stat_overdue', icon: CalendarRange, label: 'Overdue', value: stats.overdueCount, tone: 'text-orange-700', bg: 'from-orange-500/10 to-amber-500/5' },
  ];
  const visibleStatsCards = statsCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const tableColumns: Array<{
    key: string;
    label: string;
    thClassName?: string;
    tdClassName?: string;
    render: (row: MortgageRow, index: number) => any;
  }> = [
    {
      key: 'account',
      label: 'Account',
      thClassName: 'sticky left-0 z-10 bg-[#0a1814]',
      tdClassName: 'sticky left-0 z-10 bg-inherit',
      render: (row) => {
        const typeMeta = mortgageTypeMeta(String(row.mortgage_type || 'other'));
        const TypeIcon = typeMeta.icon;
        return (
          <div className="flex items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${typeMeta.color} text-white`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">#{row.id}</p>
              <p className="text-xs capitalize text-slate-500">{typeMeta.label}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row) => {
        const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || '—';
        return (
          <div className="text-sm">
            <p className="font-semibold text-slate-900">{customerName}</p>
            <p className="text-xs text-slate-500">{row.customer?.phone || '—'}</p>
          </div>
        );
      },
    },
    {
      key: 'installment',
      label: 'Installment',
      tdClassName: 'text-sm font-bold text-emerald-700',
      render: (row) => (
        <>
          {formatAmount(row.installment_amount)}
          <div className="text-xs font-medium text-slate-500">{frequencyLabel(row.installment_frequency)}</div>
        </>
      ),
    },
    { key: 'paid_amount', label: 'Paid Amount', tdClassName: 'text-sm font-bold text-violet-800', render: (row) => formatAmount(row.total_paid_amount ?? 0) },
    {
      key: 'due_date',
      label: 'Due Date',
      render: (row) => {
        const overdueDays = daysOverdue(row.due_date);
        return (
          <div className="text-sm">
            <p className="font-semibold text-slate-900">{formatDate(row.due_date)}</p>
            {(overdueDays ?? 0) > 0 ? (
              <p className="text-xs font-semibold text-rose-600">{overdueDays}d overdue</p>
            ) : (
              <p className="text-xs text-emerald-600">On schedule</p>
            )}
          </div>
        );
      },
    },
    { key: 'arrears', label: 'Arrears', tdClassName: 'text-sm font-bold text-rose-700', render: (row) => formatAmount(row.arrears_amount ?? 0) },
    { key: 'due_principal', label: 'Due Principal', tdClassName: 'text-sm font-bold text-slate-800', render: (row) => formatAmount(row.due_amount ?? 0) },
    { key: 'due_interest', label: 'Due Interest', tdClassName: 'text-sm font-bold text-amber-700', render: (row) => formatAmount(row.due_interest_amount ?? 0) },
    { key: 'status', label: 'Status', render: (row) => <Badge label={String(row.status || '—')} variant={statusTone(String(row.status || ''))} /> },
    { key: 'actions', label: 'Actions', render: (row) => renderRowActions(row) },
  ];
  const visibleTableColumns = tableColumns.filter((column) => !hiddenWidgetKeys.has(`${widgetPrefix}table_column_${column.key}`));

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showStatsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}stats_section`);
  const showFiltersWidget = !hiddenWidgetKeys.has(`${widgetPrefix}filters`);
  const showListWidget = !hiddenWidgetKeys.has(`${widgetPrefix}list`);
  const showAnyWidget =
    showHeroWidget ||
    (showStatsWidget && visibleStatsCards.length > 0) ||
    showFiltersWidget ||
    showListWidget;

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#071210]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
        <p className="text-sm font-medium text-emerald-100/80">Loading collections desk...</p>
      </div>
    </div>
  );

  if (!token) {
    return <ClientMountGate fallback={pageFallback}>{pageFallback}</ClientMountGate>;
  }

  return (
    <ClientMountGate fallback={pageFallback}>
      <div className="relative min-h-screen overflow-hidden bg-[#f3f8f6]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute right-0 top-20 h-[26rem] w-[26rem] rounded-full bg-teal-500/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.32]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(16,185,129,0.1) 1px, transparent 0)',
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

          {/* Hero */}
          {showHeroWidget ? (
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0a1814] via-[#0f3d32] to-[#0c6e58] text-white shadow-[0_30px_80px_-24px_rgba(6,78,59,0.8)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.25),transparent_42%)]" />
            <div className="relative p-6 md:p-8">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}hero`)}
                  className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/85 text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide collections hero widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Collection Desk
                  </span>
                  <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Mortgage Collection Command</h1>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-50/90 md:text-base">
                    Post collections, monitor arrears exposure, adjust interest, and print bills — all from one premium workspace.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-emerald-100/90">
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">Mortgages</span>
                    <span className="text-emerald-200/50">/</span>
                    <span className="rounded-lg bg-emerald-400/20 px-2.5 py-1 font-semibold text-white">Collections</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages')}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Mortgages Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => token && fetchRows(token)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:brightness-110 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </section>
          ) : null}

          {/* Stats */}
          {showStatsWidget ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {visibleStatsCards.map((item) => (
              <div
                key={item.label}
                className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-[0_16px_40px_-28px_rgba(6,95,70,0.5)] backdrop-blur transition hover:-translate-y-0.5`}
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
                    <p className={`mt-2 text-2xl font-black ${item.tone}`}>{item.value}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-slate-700 shadow-sm">
                    <item.icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            ))}
            {visibleStatsCards.length === 0 ? (
              <div className="sm:col-span-2 xl:col-span-3 2xl:col-span-6 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                All summary cards are hidden.
              </div>
            ) : null}
          </section>
          ) : null}

          {/* Filters */}
          {showFiltersWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_22px_55px_-34px_rgba(6,95,70,0.45)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}filters`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide collections filters widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50/80"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Search & Filters</p>
                <p className="mt-1 text-sm text-slate-600">Find accounts by customer, status, or due date window.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{filtersOpen ? 'Hide' : 'Show'}</span>
            </button>

            {filtersOpen && (
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className="relative lg:col-span-5">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className={`${inputClass} pl-9`}
                      placeholder="Search id, customer, NIC, phone..."
                    />
                  </div>
                  <div className="lg:col-span-2">
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
                  <div className="lg:col-span-2">
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Due From</label>
                    <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} className={inputClass} />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Due To</label>
                    <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={clearFilters} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Clear
                  </button>
                </div>
              </div>
            )}
          </section>
          ) : null}

          {/* List */}
          {showListWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_24px_60px_-34px_rgba(6,95,70,0.5)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}list`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide collections list widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Collection-Eligible Accounts</h2>
                <p className="text-sm text-slate-500">
                  {filteredRows.length} visible • Total arrears {formatAmount(stats.totalArrears)}
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === 'cards' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === 'table' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  Table
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
                <p className="text-sm font-medium text-slate-500">Loading accounts...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Banknote className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">No accounts match your filters</h3>
                <p className="mt-1 max-w-md text-sm text-slate-500">Clear filters or refresh to load the latest collection-eligible mortgages.</p>
                <button type="button" onClick={clearFilters} className="mt-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md">
                  Clear Filters
                </button>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                {filteredRows.map((row) => {
                  const overdueDays = daysOverdue(row.due_date);
                  const typeMeta = mortgageTypeMeta(String(row.mortgage_type || 'other'));
                  const TypeIcon = typeMeta.icon;
                  const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || '—';
                  const isOverdue = (overdueDays ?? 0) > 0;
                  const isArrears = String(row.status || '').toLowerCase() === 'arrears' || toNumber(row.arrears_amount) > 0;

                  return (
                    <article
                      key={row.id}
                      className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                        isArrears
                          ? 'border-rose-200/90 bg-gradient-to-br from-rose-50/50 to-white'
                          : 'border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80'
                      }`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${typeMeta.color}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${typeMeta.color} text-white shadow-md`}>
                            <TypeIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              #{row.id} • {typeMeta.label}
                            </p>
                            <h3 className="mt-1 text-lg font-extrabold text-slate-900">{customerName}</h3>
                            <p className="text-sm text-slate-500">
                              {row.customer?.phone || '—'} • {row.customer?.nic_passport || '—'}
                            </p>
                          </div>
                        </div>
                        <Badge label={String(row.status || '—')} variant={statusTone(String(row.status || ''))} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Installment</p>
                          <p className="mt-1 font-bold text-emerald-700">{formatAmount(row.installment_amount)}</p>
                          <p className="text-xs text-slate-500">{frequencyLabel(row.installment_frequency)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/90 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Due Date</p>
                          <p className="mt-1 font-bold text-slate-900">{formatDate(row.due_date)}</p>
                          <p className={`mt-0.5 text-xs font-semibold ${isOverdue ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {isOverdue ? `${overdueDays}d overdue` : 'On schedule'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">Arrears</p>
                          <p className="mt-1 font-bold text-rose-700">{formatAmount(row.arrears_amount ?? 0)}</p>
                        </div>
                        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Due Interest</p>
                          <p className="mt-1 font-bold text-amber-800">{formatAmount(row.due_interest_amount ?? 0)}</p>
                        </div>
                        <div className="col-span-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Paid Amount</p>
                          <p className="mt-1 font-bold text-violet-800">{formatAmount(row.total_paid_amount ?? 0)}</p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                        Principal due: <span className="font-bold text-slate-900">{formatAmount(row.due_amount ?? 0)}</span>
                        {' • '}
                        Paid: <span className="font-bold text-violet-800">{formatAmount(row.total_paid_amount ?? 0)}</span>
                        {' • '}
                        Approved: <span className="font-bold">{formatAmount(row.approved_amount)}</span>
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-4">{renderRowActions(row, true)}</div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                {visibleTableColumns.length > 0 ? (
                  <table className="min-w-[1320px] w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-[#0a1814] via-[#0f3d32] to-[#0c6e58] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                        {visibleTableColumns.map((column) => (
                          <th key={column.key} className={`${column.thClassName || ''} px-4 py-3`}>
                            <div className="flex items-center justify-between gap-2">
                              <span>{column.label}</span>
                              <WidgetCloseGate>
                                <button
                                  type="button"
                                  onClick={() => void hideWidget(`${widgetPrefix}table_column_${column.key}`)}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-200/80 bg-white/90 text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
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
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row, index) => (
                        <tr
                          key={row.id}
                          className={`transition hover:bg-emerald-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                        >
                          {visibleTableColumns.map((column) => (
                            <td key={column.key} className={`${column.tdClassName || ''} px-4 py-3`}>
                              {column.render(row, index)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-8 text-center text-sm text-slate-600">
                    All collections table columns are hidden.
                  </div>
                )}
              </div>
            )}
          </section>
          ) : null}
        </div>

        {/* Details modal */}
        {detailsOpen && detailsRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Mortgage #{detailsRow.id}</h3>
                  <p className="text-sm text-slate-600">Full account snapshot for collection decisions.</p>
                </div>
                <button type="button" onClick={() => setDetailsOpen(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[calc(90vh-80px)] space-y-5 overflow-y-auto p-6">
                {detailsLoading && <p className="text-sm font-medium text-emerald-700">Loading full details...</p>}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {[
                    { label: 'Status', value: detailsRow.status || '—', tone: 'text-slate-900' },
                    { label: 'Due Date', value: formatDate(detailsRow.due_date), tone: 'text-slate-900' },
                    { label: 'Arrears', value: formatAmount(detailsRow.arrears_amount ?? 0), tone: 'text-rose-700' },
                    { label: 'Due Principal', value: formatAmount(detailsRow.due_amount ?? 0), tone: 'text-slate-900' },
                    { label: 'Due Interest', value: formatAmount(detailsRow.due_interest_amount ?? 0), tone: 'text-amber-700' },
                    { label: 'Paid Amount', value: formatAmount(detailsRow.total_paid_amount ?? 0), tone: 'text-violet-800' },
                    { label: 'Installment', value: formatAmount(detailsRow.installment_amount), tone: 'text-emerald-700' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className={`mt-1 text-sm font-bold capitalize ${item.tone}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Customer</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {(detailsRow.customer?.first_name || detailsRow.customer?.last_name)
                        ? `${detailsRow.customer?.first_name ?? ''} ${detailsRow.customer?.last_name ?? ''}`.trim()
                        : '—'}
                    </p>
                    <p className="text-sm text-slate-600">Phone: {detailsRow.customer?.phone || '—'}</p>
                    <p className="text-sm text-slate-600">NIC: {detailsRow.customer?.nic_passport || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Loan Terms</p>
                    <p className="text-sm text-slate-700 capitalize">Type: {detailsRow.mortgage_type || '—'}</p>
                    <p className="text-sm text-slate-700">Approved: {formatAmount(detailsRow.approved_amount)}</p>
                    <p className="text-sm text-slate-700">
                      Interest: {Number.isFinite(toNumber(detailsRow.interest_rate)) ? `${toNumber(detailsRow.interest_rate).toFixed(2)}%` : '—'} ({detailsRow.interest_type || '—'})
                    </p>
                    <p className="text-sm text-slate-700">Tenure: {detailsRow.tenure_months || '—'} months</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => { setDetailsOpen(false); openPaymentModal(detailsRow); }} className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white">
                    Collect Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment modal */}
        {paymentOpen && paymentRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
              <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4">
                <h3 className="text-xl font-black text-slate-900">Record Collection</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Mortgage #{paymentRow.id} • Suggested {formatAmount(paymentRow.installment_amount)}
                </p>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Amount</label>
                  <input value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="e.g. 25000" className={inputClass} />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Date</label>
                    <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Method</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="transfer">Transfer</option>
                      <option value="card">Card</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Note</label>
                  <textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} rows={3} placeholder="Optional collection note" className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <button type="button" onClick={() => setPaymentOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitPayment}
                  disabled={savingPayment}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md disabled:opacity-60"
                >
                  {savingPayment ? 'Saving...' : 'Record Collection'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Adjust modal */}
        {adjustOpen && adjustRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-amber-100 bg-white shadow-2xl">
              <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4">
                <h3 className="text-xl font-black text-slate-900">Interest Adjustment</h3>
                <p className="mt-1 text-sm text-slate-600">Mortgage #{adjustRow.id}</p>
              </div>
              <div className="space-y-4 p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Action</label>
                    <select value={adjustMode} onChange={(e) => setAdjustMode(e.target.value as 'waive' | 'add')} className={inputClass}>
                      <option value="waive">Waive / Cutoff Interest</option>
                      <option value="add">Add Special Interest</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Amount</label>
                    <input value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="e.g. 1000" className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Note</label>
                  <textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} rows={3} placeholder="Reason for adjustment" className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <button type="button" onClick={() => setAdjustOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingAdjust}
                  onClick={submitAdjust}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingAdjust ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bill modal */}
        {billOpen && billData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
              <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-6 py-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-xl font-black text-slate-900">Collection Bill Generated</h3>
                </div>
                <p className="mt-1 text-sm text-slate-600">{billData.billNo}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 p-6 text-sm md:grid-cols-2">
                {[
                  ['Mortgage', `#${billData.mortgageId}`],
                  ['Date', formatDate(billData.paidDate)],
                  ['Customer', billData.customerName],
                  ['Method', billData.paymentMethod],
                  ['Collected', formatAmount(billData.amount)],
                  ['Interest (Profit)', formatAmount(billData.interestPaid ?? 0)],
                  ['Principal Paid', formatAmount(billData.principalPaid ?? 0)],
                  ['Due Principal', formatAmount(billData.dueAmount ?? 0)],
                  ['Due Interest', formatAmount(billData.dueInterestAmount ?? 0)],
                  ['Arrears', formatAmount(billData.arrearsAmount ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                    <span className="text-slate-500">{label}: </span>
                    <span className="font-semibold text-slate-900">{value}</span>
                  </div>
                ))}
                <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                  <span className="text-slate-500">Remarks: </span>
                  <span className="font-semibold text-slate-900">{billData.remarks || '—'}</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <button type="button" onClick={() => setBillOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Close
                </button>
                <button
                  type="button"
                  onClick={printBill}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  <Printer className="h-4 w-4" />
                  Print Bill
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-24 right-5 z-[60]">
            <div
              className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${
                toast.kind === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {toast.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {toast.message}
            </div>
          </div>
        )}
      </div>
    </ClientMountGate>
  );
}
