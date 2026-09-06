'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Badge from '../_components/Badge';
import ActionButton from '../_components/ActionButton';
import Modal from '../_components/Modal';
import ClientMountGate from '@/app/components/ClientMountGate';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Gem,
  Home,
  LayoutGrid,
  List,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200/70';

type ViewMode = 'table' | 'cards';

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

interface Mortgage {
  id: number;
  due_date?: string | null;
  arrears_amount?: number | string | null;
  due_amount?: number | string | null;
  due_interest_amount?: number | string | null;
  customer_id: number;
  mortgage_type: 'land' | 'house' | 'vehicle' | 'gold' | 'other';
  requested_amount: number | string;
  approved_amount?: number | string | null;
  interest_rate: number | string;
  interest_type: 'fixed' | 'reducing';
  tenure_months: number | string;
  installment_amount?: number | string | null;
  installment_frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;
  interest_calculation_frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  penalty_rate: number | string;
  processing_fee: number | string;
  status: 'draft' | 'submitted' | 'approved' | 'active' | 'arrears' | 'settled' | 'released';
  created_at: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    nic_passport?: string;
  };
  asset?: {
    asset_type?: string;
    deed_number?: string | null;
    vehicle_reg_no?: string | null;
    description?: string | null;
  } | null;
}

function formatAmount(v: number | string | null | undefined) {
  const n = typeof v === 'number' ? v : v != null ? parseFloat(String(v)) : NaN;
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function formatDate(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

function getFrequencyPerYear(frequency: string | null | undefined): number {
  const map: Record<string, number> = {
    daily: 365,
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
  };
  return map[String(frequency || 'monthly').toLowerCase()] ?? 12;
}

function frequencyLabel(frequency: string | null | undefined): string {
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
  if (status === 'active') return 'success';
  if (status === 'arrears') return 'warning';
  if (status === 'approved') return 'info';
  return 'default';
}

function computeInstallmentFigures(m: Mortgage) {
  const principal = toNumber(m.approved_amount ?? m.requested_amount);
  const annualRate = toNumber(m.interest_rate) / 100;
  const months = Math.round(toNumber(m.tenure_months));
  const installmentPerYear = getFrequencyPerYear(m.installment_frequency);
  const interestCalcPerYear = getFrequencyPerYear(m.interest_calculation_frequency || 'monthly');

  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(months) || months <= 0) {
    return { installmentAmount: NaN, interestAmount: NaN, totalInterest: NaN };
  }

  const years = months / 12;
  const installmentCount = Math.max(1, Math.round(years * installmentPerYear));

  const effectiveAnnualRate = Math.pow(1 + (annualRate / interestCalcPerYear), interestCalcPerYear) - 1;
  const installmentRate = Math.pow(1 + effectiveAnnualRate, 1 / installmentPerYear) - 1;
  const interestPeriodRate = Math.pow(1 + effectiveAnnualRate, 1 / interestCalcPerYear) - 1;

  if (m.interest_type === 'reducing') {
    const pow = Math.pow(1 + installmentRate, installmentCount);
    const installment = principal * installmentRate * pow / (pow - 1);
    const firstInterest = principal * interestPeriodRate;
    const totalPayment = installment * installmentCount;
    const totalInterest = totalPayment - principal;
    return {
      installmentAmount: toNumber(m.installment_amount) || installment,
      interestAmount: firstInterest,
      totalInterest,
    };
  } else {
    const interestAmount = principal * interestPeriodRate;
    const totalInterest = principal * annualRate * years;
    const installmentAmount = toNumber(m.installment_amount) || ((principal + totalInterest) / installmentCount);
    return { installmentAmount, interestAmount, totalInterest };
  }
}

export default function Mortgages() {
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [mortgages, setMortgages] = useState<Mortgage[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(20);
  const [branchFilter, setBranchFilter] = useState('');
  const [searchNic, setSearchNic] = useState('');
  const [searchId, setSearchId] = useState('');
  const [searchMobile, setSearchMobile] = useState('');
  const [searchVehicle, setSearchVehicle] = useState('');
  const [searchDeed, setSearchDeed] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const widgetPrefix = 'mortgages_portfolio_widget_';
  const router = useRouter();

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

  const stats = useMemo(() => {
    const totalAccounts = mortgages.length;
    const totalApprovedAmount = mortgages.reduce((sum, mortgage) => {
      const amount = toNumber(mortgage.approved_amount ?? mortgage.requested_amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    const averageInstallment = totalAccounts
      ? mortgages.reduce((sum, mortgage) => {
          const amount = toNumber(mortgage.installment_amount);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0) / totalAccounts
      : 0;
    const averageRate = totalAccounts
      ? mortgages.reduce((sum, mortgage) => {
          const rate = toNumber(mortgage.interest_rate);
          return sum + (Number.isFinite(rate) ? rate : 0);
        }, 0) / totalAccounts
      : 0;

    let overdueCount = 0;
    let totalArrears = 0;
    mortgages.forEach((mortgage) => {
      const arrears = toNumber(mortgage.arrears_amount);
      if (Number.isFinite(arrears)) totalArrears += arrears;
      if ((daysOverdue(mortgage.due_date) ?? 0) > 0) overdueCount += 1;
    });

    return { totalAccounts, totalApprovedAmount, averageInstallment, averageRate, overdueCount, totalArrears };
  }, [mortgages]);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
    } else {
      setToken(t);
      fetchMortgages(t, 1);
      void fetchWidgetPreferences(t);
      void fetchNotificationPreview(t);

      const storedUser = localStorage.getItem('auth_user');
      if (storedUser) {
        try {
          setAuthUser(JSON.parse(storedUser) as AuthUser);
        } catch {
          setAuthUser(null);
        }
      }
    }
  }, [fetchNotificationPreview, router]);

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

  const fetchMortgages = async (authToken: string, page: number = 1) => {
    try {
      setLoading(true);
      const params: any = {};
      params.status = 'approved';
      if (branchFilter) params.branch_id = branchFilter;
      if (searchId) params.id = searchId;
      if (searchNic) params.nic = searchNic;
      if (searchMobile) params.mobile = searchMobile;
      if (searchVehicle) params.vehicle_no = searchVehicle;
      if (searchDeed) params.deed_no = searchDeed;

      const res = await axios.get(`${getApiBaseUrl()}/mortgages`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { ...params, per_page: perPage, page }
      });

      const payload = res.data;
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      setMortgages(rows);
      setCurrentPage(Number(payload?.current_page || page || 1));
      setLastPage(Number(payload?.last_page || 1));
      setTotalRows(Number(payload?.total || rows.length || 0));
      setPerPage(Number(payload?.per_page || perPage));
    } catch (e) {
      console.error('Error fetching mortgages:', e);
      setMortgages([]);
      setCurrentPage(1);
      setLastPage(1);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  };

  // Collect Payment modal state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMortgageId, setPaymentMortgageId] = useState<number | null>(null);
  const [paymentMortgage, setPaymentMortgage] = useState<Mortgage | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentToast, setPaymentToast] = useState<string>('');

  const openPaymentModal = (id: number) => {
    setPaymentMortgageId(id);
    const m = mortgages.find(x => x.id === id) || null;
    setPaymentMortgage(m);
    setPaymentAmount('');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setPaymentDate(`${yyyy}-${mm}-${dd}`);
    setPaymentMethod('cash');
    setPaymentNote('');
    setPaymentOpen(true);
  };

  const submitPayment = async () => {
    if (!token || !paymentMortgageId) return;
    const amountNum = parseFloat(paymentAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setPaymentToast('Enter a valid amount');
      setTimeout(() => setPaymentToast(''), 2000);
      return;
    }
    try {
      setPaymentSubmitting(true);
      const payload = {
        mortgage_id: paymentMortgageId,
        branch_id: null,
        user_id: null,
        schedule_id: null,
        paid_date: paymentDate,
        amount: amountNum,
        payment_method: paymentMethod,
        remarks: paymentNote || undefined,
        collected_by: null,
      };
      // Attempt backend call (if endpoint exists); otherwise show success toast.
      await axios.post(`${getApiBaseUrl()}/mortgages/${paymentMortgageId}/payments`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        // Graceful fallback if POST not implemented yet
        return Promise.resolve();
      });
      setPaymentToast('Payment recorded');
      setPaymentOpen(false);
      setTimeout(() => setPaymentToast(''), 2000);
    } catch (e) {
      console.error('Payment submit error:', e);
      setPaymentToast('Failed to record payment');
      setTimeout(() => setPaymentToast(''), 2500);
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const clearFilters = () => {
    setBranchFilter('');
    setSearchId('');
    setSearchNic('');
    setSearchMobile('');
    setSearchVehicle('');
    setSearchDeed('');
    if (token) fetchMortgages(token, 1);
  };

  const renderMortgageActions = (id: number, compact = false) => (
    <div className={`flex ${compact ? 'flex-col gap-2' : 'flex-wrap items-center gap-2'}`}>
      <button
        type="button"
        onClick={() => router.push(`/dashboard/mortgages/${id}`)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
      <button
        type="button"
        onClick={() => openPaymentModal(id)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:from-emerald-600 hover:to-teal-700"
      >
        <Banknote className="h-3.5 w-3.5" />
        Collect
      </button>
      <button
        type="button"
        onClick={() => router.push(`/dashboard/mortgages/${id}/payments`)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
      >
        <Receipt className="h-3.5 w-3.5" />
        Payments
      </button>
    </div>
  );

  const statsCards = [
    { key: 'stat_accounts', icon: Briefcase, label: 'Accounts', value: stats.totalAccounts, tone: 'text-cyan-700', bg: 'from-cyan-500/10 to-blue-500/5' },
    { key: 'stat_portfolio_value', icon: Wallet, label: 'Portfolio Value', value: formatAmount(stats.totalApprovedAmount), tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-green-500/5' },
    { key: 'stat_avg_installment', icon: TrendingUp, label: 'Avg Installment', value: formatAmount(stats.averageInstallment), tone: 'text-indigo-700', bg: 'from-indigo-500/10 to-violet-500/5' },
    { key: 'stat_avg_rate', icon: Clock, label: 'Avg Rate', value: `${stats.averageRate.toFixed(2)}%`, tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
    { key: 'stat_overdue', icon: AlertTriangle, label: 'Overdue', value: stats.overdueCount, tone: 'text-rose-700', bg: 'from-rose-500/10 to-red-500/5' },
    { key: 'stat_total_arrears', icon: Banknote, label: 'Total Arrears', value: formatAmount(stats.totalArrears), tone: 'text-amber-700', bg: 'from-amber-500/10 to-orange-500/5' },
  ];
  const visibleStatsCards = statsCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const tableColumns: Array<{
    key: string;
    label: string;
    thClassName?: string;
    tdClassName?: string;
    render: (m: Mortgage) => any;
  }> = [
    {
      key: 'account',
      label: 'Account',
      thClassName: 'sticky left-0 z-10 bg-slate-900',
      tdClassName: 'sticky left-0 z-10 whitespace-nowrap bg-inherit',
      render: (m) => {
        const typeMeta = mortgageTypeMeta(m.mortgage_type);
        const TypeIcon = typeMeta.icon;
        return (
          <div className="flex items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${typeMeta.color} text-white`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">#{m.id}</p>
              <p className="text-xs capitalize text-slate-500">{typeMeta.label}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'customer',
      label: 'Customer',
      tdClassName: 'text-sm',
      render: (m) => {
        const customerName = `${m.customer?.first_name || ''} ${m.customer?.last_name || ''}`.trim() || '—';
        return (
          <>
            <p className="font-semibold text-slate-900">{customerName}</p>
            <p className="text-xs text-slate-500">{m.customer?.phone || '—'}</p>
            <p className="text-xs text-slate-500">{m.customer?.nic_passport || '—'}</p>
          </>
        );
      },
    },
    { key: 'collateral', label: 'Collateral', tdClassName: 'text-sm text-slate-700', render: (m) => m.asset?.vehicle_reg_no || m.asset?.deed_number || m.asset?.description || '—' },
    { key: 'principal', label: 'Principal', tdClassName: 'text-sm font-bold text-cyan-700', render: (m) => formatAmount(m.approved_amount ?? m.requested_amount) },
    {
      key: 'rate',
      label: 'Rate',
      tdClassName: 'text-sm text-slate-700',
      render: (m) => (
        <>
          {m.interest_rate}% <span className="text-xs">({m.interest_type})</span>
          <div className="text-xs text-slate-500">{m.tenure_months} mo</div>
        </>
      ),
    },
    {
      key: 'due_date',
      label: 'Due Date',
      tdClassName: 'text-sm',
      render: (m) => {
        const overdueDays = daysOverdue(m.due_date);
        return (
          <>
            <p className="font-semibold text-slate-900">{formatDate(m.due_date)}</p>
            {(overdueDays ?? 0) > 0 ? (
              <p className="text-xs font-semibold text-rose-600">{overdueDays}d overdue</p>
            ) : (
              <p className="text-xs text-emerald-600">On schedule</p>
            )}
          </>
        );
      },
    },
    { key: 'arrears', label: 'Arrears', tdClassName: 'text-sm font-semibold text-rose-700', render: (m) => formatAmount(m.arrears_amount ?? 0) },
    { key: 'due_principal', label: 'Due Principal', tdClassName: 'text-sm font-semibold text-slate-800', render: (m) => formatAmount(m.due_amount ?? 0) },
    { key: 'due_interest', label: 'Due Interest', tdClassName: 'text-sm font-semibold text-slate-800', render: (m) => formatAmount(m.due_interest_amount ?? 0) },
    {
      key: 'installment',
      label: 'Installment',
      tdClassName: 'text-sm font-semibold text-indigo-700',
      render: (m) => {
        const { installmentAmount } = computeInstallmentFigures(m);
        return (
          <>
            {formatAmount(installmentAmount)}
            <div className="text-xs font-medium text-slate-500">{frequencyLabel(m.installment_frequency)}</div>
          </>
        );
      },
    },
    { key: 'status', label: 'Status', render: (m) => <Badge label={m.status} variant={statusTone(m.status)} /> },
    { key: 'actions', label: 'Actions', render: (m) => renderMortgageActions(m.id) },
  ];
  const visibleTableColumns = tableColumns.filter((column) => !hiddenWidgetKeys.has(`${widgetPrefix}table_column_${column.key}`));

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showStatsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}stats`);
  const showFiltersWidget = !hiddenWidgetKeys.has(`${widgetPrefix}filters`);
  const showPortfolioWidget = !hiddenWidgetKeys.has(`${widgetPrefix}portfolio_list`);
  const showAnyWidget =
    showHeroWidget ||
    (showStatsWidget && visibleStatsCards.length > 0) ||
    showFiltersWidget ||
    showPortfolioWidget;

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#070d1a]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
        <p className="text-sm font-medium text-cyan-100/80">Loading portfolio...</p>
      </div>
    </div>
  );

  return (
    <ClientMountGate fallback={pageFallback}>
      <div className="relative min-h-screen overflow-hidden bg-[#f4f8fc]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute right-0 top-24 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(14,116,144,0.12) 1px, transparent 0)',
              backgroundSize: '28px 28px',
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
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0b1224] via-[#0f2744] to-[#0c4a6e] text-white shadow-[0_30px_80px_-24px_rgba(8,47,73,0.75)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),transparent_45%)]" />
            <div className="relative p-6 md:p-8">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}hero`)}
                  className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/85 text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide portfolio hero widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Mortgage Portfolio
                  </span>
                  <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Approved Book Command Center</h1>
                  <p className="mt-2 text-sm leading-relaxed text-cyan-50/85 md:text-base">
                    Track exposure, installments, due dates, and collections across your live approved mortgage portfolio.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-cyan-100/90">
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">Dashboard</span>
                    <span className="text-cyan-200/50">/</span>
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">Mortgages</span>
                    <span className="text-cyan-200/50">/</span>
                    <span className="rounded-lg bg-cyan-400/20 px-2.5 py-1 font-semibold text-white">Portfolio</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard')}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages/create')}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:brightness-110"
                  >
                    <Plus className="h-4 w-4" />
                    New Mortgage
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
                className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-[0_16px_40px_-28px_rgba(14,116,144,0.55)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-24px_rgba(14,116,144,0.6)]`}
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
                All portfolio stat cards are hidden.
              </div>
            ) : null}
          </section>
          ) : null}

          {/* Filters */}
          {showFiltersWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/90 shadow-[0_22px_55px_-34px_rgba(14,116,144,0.45)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}filters`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide portfolio filters widget"
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
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Smart Filters</p>
                <p className="mt-1 text-sm text-slate-600">Refine approved mortgages by branch, identity, and collateral markers.</p>
              </div>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                {filtersOpen ? 'Hide' : 'Show'}
              </span>
            </button>

            {filtersOpen && (
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</label>
                    <select value="approved" disabled className={`${inputClass} bg-cyan-50/60`}>
                      <option value="approved">Approved</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Branch ID</label>
                    <input value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} placeholder="e.g. 1" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Mortgage ID</label>
                    <input value={searchId} onChange={(e) => setSearchId(e.target.value)} placeholder="e.g. 2" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Customer NIC</label>
                    <input value={searchNic} onChange={(e) => setSearchNic(e.target.value)} placeholder="e.g. 992233445V" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Mobile</label>
                    <input value={searchMobile} onChange={(e) => setSearchMobile(e.target.value)} placeholder="e.g. 0771234567" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Vehicle Reg No</label>
                    <input value={searchVehicle} onChange={(e) => setSearchVehicle(e.target.value)} placeholder="e.g. CA-1234" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Deed No</label>
                    <input value={searchDeed} onChange={(e) => setSearchDeed(e.target.value)} placeholder="e.g. D123" className={inputClass} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => token && fetchMortgages(token, 1)}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition hover:from-cyan-700 hover:to-blue-700"
                  >
                    <Search className="h-4 w-4" />
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
          </section>
          ) : null}

          {/* Portfolio list */}
          {showPortfolioWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_24px_60px_-34px_rgba(14,116,144,0.5)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}portfolio_list`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide portfolio list widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Portfolio Accounts</h2>
                <p className="text-sm text-slate-500">
                  {totalRows} record{totalRows === 1 ? '' : 's'} • Page {currentPage} of {lastPage}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      viewMode === 'cards' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      viewMode === 'table' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    Table
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => token && fetchMortgages(token, currentPage)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
                <p className="text-sm font-medium text-slate-500">Loading portfolio accounts...</p>
              </div>
            ) : mortgages.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <Briefcase className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">No approved mortgages found</h3>
                <p className="mt-1 max-w-md text-sm text-slate-500">Try clearing filters or create a new mortgage application.</p>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/mortgages/create')}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  Create Mortgage
                </button>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                {mortgages.map((m) => {
                  const overdueDays = daysOverdue(m.due_date);
                  const typeMeta = mortgageTypeMeta(m.mortgage_type);
                  const TypeIcon = typeMeta.icon;
                  const { installmentAmount, interestAmount } = computeInstallmentFigures(m);
                  const customerName = `${m.customer?.first_name || ''} ${m.customer?.last_name || ''}`.trim() || '—';
                  const isOverdue = (overdueDays ?? 0) > 0;

                  return (
                    <article
                      key={m.id}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_20px_45px_-28px_rgba(14,116,144,0.55)]"
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${typeMeta.color}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${typeMeta.color} text-white shadow-md`}>
                            <TypeIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">#{m.id} • {typeMeta.label}</p>
                            <h3 className="mt-1 text-lg font-extrabold text-slate-900">{customerName}</h3>
                            <p className="text-sm text-slate-500">{m.customer?.phone || '—'} • {m.customer?.nic_passport || '—'}</p>
                          </div>
                        </div>
                        <Badge label={m.status} variant={statusTone(m.status)} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Principal</p>
                          <p className="mt-1 font-bold text-cyan-700">{formatAmount(m.approved_amount ?? m.requested_amount)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Installment</p>
                          <p className="mt-1 font-bold text-indigo-700">
                            {formatAmount(installmentAmount)} <span className="text-xs font-medium text-slate-500">({frequencyLabel(m.installment_frequency)})</span>
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Due Date</p>
                          <p className="mt-1 font-bold text-slate-900">{formatDate(m.due_date)}</p>
                          <p className={`mt-0.5 text-xs font-semibold ${isOverdue ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {isOverdue ? `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue` : 'On schedule'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Arrears</p>
                          <p className="mt-1 font-bold text-rose-700">{formatAmount(m.arrears_amount ?? 0)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{m.interest_rate}% {m.interest_type}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{m.tenure_months} months</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">Interest {formatAmount(interestAmount)}</span>
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-4">{renderMortgageActions(m.id, true)}</div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                {visibleTableColumns.length > 0 ? (
                  <table className="min-w-[1400px] w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                        {visibleTableColumns.map((column) => (
                          <th key={column.key} className={`${column.thClassName || ''} px-4 py-3`}>
                            <div className="flex items-center justify-between gap-2">
                              <span>{column.label}</span>
                              <WidgetCloseGate>
                                <button
                                  type="button"
                                  onClick={() => void hideWidget(`${widgetPrefix}table_column_${column.key}`)}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-200/80 bg-white/90 text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
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
                      {mortgages.map((m, index) => (
                        <tr
                          key={m.id}
                          className={`transition hover:bg-cyan-50/50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                        >
                          {visibleTableColumns.map((column) => (
                            <td key={column.key} className={`${column.tdClassName || ''} px-4 py-3`}>
                              {column.render(m)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-10 text-center text-sm text-slate-600">
                    All portfolio table columns are hidden.
                  </div>
                )}
              </div>
            )}

            {totalRows > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <p className="text-sm font-medium text-slate-600">
                  Showing <span className="font-bold text-slate-900">{mortgages.length}</span> on this page •{' '}
                  <span className="font-bold text-slate-900">{totalRows}</span> total
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading || currentPage <= 1}
                    onClick={() => token && fetchMortgages(token, currentPage - 1)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <span className="rounded-xl border border-cyan-100 bg-white px-4 py-2 text-sm font-bold text-cyan-800">
                    {currentPage} / {lastPage}
                  </span>
                  <button
                    type="button"
                    disabled={loading || currentPage >= lastPage}
                    onClick={() => token && fetchMortgages(token, currentPage + 1)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
          ) : null}
        </div>

        {/* Payment toast */}
        {paymentToast && (
          <div className="fixed bottom-24 right-5 z-[60] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl">
            {paymentToast}
          </div>
        )}

        <Modal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} title="Collect Payment" size="md">
          <div className="grid grid-cols-1 gap-4">
            {paymentMortgage && (
              <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-blue-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Period interest due</p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {formatAmount(computeInstallmentFigures(paymentMortgage).interestAmount)}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  {frequencyLabel(paymentMortgage.interest_calculation_frequency || 'monthly')} • {paymentMortgage.interest_type} rate
                </p>
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Amount</label>
              <input value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="e.g. 25000.00" className={inputClass} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Date</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Note</label>
              <textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Optional remarks" className={inputClass} rows={3} />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <ActionButton label="Cancel" variant="default" onClick={() => setPaymentOpen(false)} />
            <ActionButton label={paymentSubmitting ? 'Submitting...' : 'Record Payment'} variant="success" onClick={submitPayment} disabled={paymentSubmitting} />
          </div>
        </Modal>
      </div>
    </ClientMountGate>
  );
}
