'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import Badge from '../../_components/Badge';
import ClientMountGate from '@/app/components/ClientMountGate';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronRight,
  FileText,
  History,
  LayoutGrid,
  List,
  PercentCircle,
  Receipt,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Wallet,
} from 'lucide-react';

type ViewMode = 'table' | 'cards';

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
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
  if (!Number.isFinite(n) && v == null) return '—';
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

function capitalizeMethod(method: unknown): string {
  const value = String(method || '—');
  if (value === '—') return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function MortgagePayments() {
  const params = useParams();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [mortgage, setMortgage] = useState<any>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const id = params?.id as string;
  const widgetPrefix = 'mortgages_payments_widget_';

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
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [fetchNotificationPreview, router]);

  const loadData = async (authToken: string) => {
    setLoading(true);
    try {
      await Promise.all([fetchMortgage(authToken), fetchPayments(authToken)]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !id) return;
    loadData(token);
    void fetchWidgetPreferences(token);
  }, [token, id]);

  const fetchPayments = async (authToken: string) => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/mortgages/${id}/payments`, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });
      const data = res.data.data || res.data;
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setPayments([]);
    }
  };

  const fetchMortgage = async (authToken: string) => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/mortgages/${id}`, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });
      setMortgage(res.data?.data ?? res.data);
    } catch (e) {
      console.error(e);
      setMortgage(null);
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

  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
  }, [payments]);

  const monthlyRate = useMemo(() => {
    const annual = toNumber(mortgage?.interest_rate) / 100;
    return annual / 12;
  }, [mortgage]);

  const principal = useMemo(() => {
    if (!mortgage) return 0;
    const raw = mortgage.approved_amount ?? mortgage.requested_amount;
    return toNumber(raw);
  }, [mortgage]);

  const parseDate = (d: string | Date | undefined): Date | null => parseDateValue(d);

  const diffMonths = (from: Date, to: Date): number => {
    const y = to.getFullYear() - from.getFullYear();
    const m = to.getMonth() - from.getMonth();
    const total = y * 12 + m;
    return total < 0 ? 0 : total;
  };

  const enriched = useMemo(() => {
    if (!mortgage) return { rows: payments, principalAfter: principal, arrears: 0 };
    const start = parseDate(mortgage.created_at) || new Date();
    let runningPrincipal = principal;
    let arrears = 0;
    let prevDate = start;
    const rows = payments.map((p) => {
      const paidDate = parseDate(p.paid_date) || prevDate;
      const missed = diffMonths(prevDate, paidDate);
      for (let i = 0; i < missed; i++) {
        const monthInterest =
          mortgage.interest_type === 'reducing' ? runningPrincipal * monthlyRate : principal * monthlyRate;
        arrears += monthInterest;
      }

      const currentInterest =
        mortgage.interest_type === 'reducing' ? runningPrincipal * monthlyRate : principal * monthlyRate;

      const amount = toNumber(p.amount);
      const payToArrears = Math.min(amount, arrears);
      arrears -= payToArrears;
      let remaining = amount - payToArrears;

      const payToCurrentInterest = Math.min(remaining, currentInterest);
      remaining -= payToCurrentInterest;

      const totalDueThisPeriod = arrears + currentInterest;
      const deficitThisPeriod = Math.max(0, totalDueThisPeriod - (payToArrears + payToCurrentInterest));
      arrears = deficitThisPeriod;

      const principalApplied = Math.max(0, remaining);
      runningPrincipal = Math.max(0, runningPrincipal - principalApplied);

      const prevPaidDate = prevDate;
      prevDate = paidDate;
      return {
        ...p,
        last_paid_date: prevPaidDate
          ? `${prevPaidDate.getFullYear()}-${String(prevPaidDate.getMonth() + 1).padStart(2, '0')}-${String(prevPaidDate.getDate()).padStart(2, '0')}`
          : '',
        interest_due: currentInterest,
        interest_paid: payToArrears + payToCurrentInterest,
        principal_applied: principalApplied,
        arrears_after: arrears,
        principal_balance_after: runningPrincipal,
      };
    });

    return { rows, principalAfter: runningPrincipal, arrears };
  }, [payments, mortgage, principal, monthlyRate]);

  const totalInterestPaid = useMemo(
    () => enriched.rows.reduce((sum, p) => sum + toNumber(p.interest_paid), 0),
    [enriched.rows]
  );

  const totalPrincipalApplied = useMemo(
    () => enriched.rows.reduce((sum, p) => sum + toNumber(p.principal_applied), 0),
    [enriched.rows]
  );

  const customerName = useMemo(() => {
    const c = mortgage?.customer;
    if (!c) return '—';
    return `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—';
  }, [mortgage]);

  const snapshotCards = mortgage
    ? [
        { key: 'snapshot_approved', icon: Wallet, label: 'Approved', value: formatAmount(mortgage.approved_amount ?? mortgage.requested_amount), tone: 'text-indigo-700', bg: 'from-indigo-500/10 to-violet-500/5' },
        { key: 'snapshot_interest', icon: PercentCircle, label: 'Interest', value: `${mortgage.interest_rate}% (${mortgage.interest_type})`, tone: 'text-violet-700', bg: 'from-violet-500/10 to-purple-500/5' },
        { key: 'snapshot_tenure', icon: CalendarDays, label: 'Tenure', value: `${mortgage.tenure_months} months`, tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
        { key: 'snapshot_status', icon: Sparkles, label: 'Status', value: String(mortgage.status || '—'), tone: 'text-cyan-700', bg: 'from-cyan-500/10 to-blue-500/5' },
      ]
    : [];
  const visibleSnapshotCards = snapshotCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const paymentStatsCards = [
    { key: 'payment_stats_count', icon: Receipt, label: 'Payments', value: payments.length, tone: 'text-indigo-700', bg: 'from-indigo-500/10 to-violet-500/5' },
    { key: 'payment_stats_collected', icon: Banknote, label: 'Total Collected', value: formatAmount(totalPaid), tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-green-500/5' },
    { key: 'payment_stats_interest_paid', icon: PercentCircle, label: 'Interest Paid', value: formatAmount(totalInterestPaid), tone: 'text-violet-700', bg: 'from-violet-500/10 to-purple-500/5' },
    { key: 'payment_stats_principal', icon: TrendingDown, label: 'Principal Applied', value: formatAmount(totalPrincipalApplied), tone: 'text-blue-700', bg: 'from-blue-500/10 to-cyan-500/5' },
    { key: 'payment_stats_outstanding', icon: Wallet, label: 'Outstanding', value: mortgage ? formatAmount(enriched.principalAfter) : '—', tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
    { key: 'payment_stats_arrears', icon: History, label: 'Interest Arrears', value: formatAmount(enriched.arrears), tone: 'text-rose-700', bg: 'from-rose-500/10 to-red-500/5' },
  ];
  const visiblePaymentStatsCards = paymentStatsCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const paymentTableColumns = [
    { key: 'paid_date', label: 'Paid Date', render: (p: any) => formatDate(p.paid_date), className: 'text-sm font-semibold text-slate-900' },
    { key: 'last_paid', label: 'Last Paid', render: (p: any) => formatDate(p.last_paid_date), className: 'text-sm text-slate-600' },
    { key: 'amount', label: 'Amount', render: (p: any) => formatAmount(p.amount), className: 'text-sm font-bold text-emerald-700' },
    { key: 'method', label: 'Method', render: (p: any) => <Badge label={capitalizeMethod(p.payment_method)} variant="info" />, className: '' },
    { key: 'interest_due', label: 'Interest Due', render: (p: any) => formatAmount(p.interest_due), className: 'text-sm font-semibold text-violet-700' },
    { key: 'interest_paid', label: 'Interest Paid', render: (p: any) => formatAmount(p.interest_paid), className: 'text-sm font-semibold text-emerald-700' },
    { key: 'principal_applied', label: 'Principal Applied', render: (p: any) => formatAmount(p.principal_applied), className: 'text-sm font-semibold text-blue-700' },
    { key: 'arrears_after', label: 'Arrears After', render: (p: any) => formatAmount(p.arrears_after), className: 'text-sm font-semibold text-rose-700' },
    { key: 'principal_balance', label: 'Principal Balance', render: (p: any) => formatAmount(p.principal_balance_after), className: 'text-sm font-bold text-slate-900' },
  ];
  const visiblePaymentTableColumns = paymentTableColumns.filter((column) => !hiddenWidgetKeys.has(`${widgetPrefix}table_column_${column.key}`));

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showSnapshotWidget = !hiddenWidgetKeys.has(`${widgetPrefix}snapshot_section`);
  const showPaymentStatsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}payment_stats_section`);
  const showPaymentHistoryWidget = !hiddenWidgetKeys.has(`${widgetPrefix}payment_history`);
  const showAnyWidget =
    showHeroWidget ||
    (showSnapshotWidget && visibleSnapshotCards.length > 0) ||
    (showPaymentStatsWidget && visiblePaymentStatsCards.length > 0) ||
    showPaymentHistoryWidget;

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#0c1020]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
        <p className="text-sm font-medium text-indigo-100/80">Loading payment history...</p>
      </div>
    </div>
  );

  if (!token) {
    return <ClientMountGate fallback={pageFallback}>{pageFallback}</ClientMountGate>;
  }

  return (
    <ClientMountGate fallback={pageFallback}>
      <div className="relative min-h-screen overflow-hidden bg-[#f5f6fc]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
          <div className="absolute right-0 top-16 h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.3]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(99,102,241,0.1) 1px, transparent 0)',
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
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0e1024] via-[#1a1f4b] to-[#312e81] text-white shadow-[0_30px_80px_-24px_rgba(49,46,129,0.75)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.28),transparent_42%)]" />
            <div className="relative p-6 md:p-8">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}hero`)}
                  className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/85 text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide payments hero widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/30 bg-indigo-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-100">
                    <History className="h-3.5 w-3.5" />
                    Payment Ledger
                  </span>
                  <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Mortgage #{id} Payments</h1>
                  <p className="mt-2 text-sm leading-relaxed text-indigo-50/90 md:text-base">
                    {customerName !== '—' ? (
                      <>
                        Customer: <span className="font-semibold text-white">{customerName}</span> — review collections,
                        interest allocation, and principal balance progression.
                      </>
                    ) : (
                      'Review collections, interest allocation, and principal balance progression.'
                    )}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-indigo-100/90">
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">Mortgages</span>
                    <span className="text-indigo-200/50">/</span>
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">#{id}</span>
                    <span className="text-indigo-200/50">/</span>
                    <span className="rounded-lg bg-indigo-400/20 px-2.5 py-1 font-semibold text-white">Payments</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/mortgages/${id}`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages/collections')}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-400 to-violet-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-indigo-500/30 transition hover:brightness-110"
                  >
                    <Banknote className="h-4 w-4" />
                    Collect
                  </button>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
              </div>

              {mortgage && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/mortgages/${id}/schedule`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    Schedule <ChevronRight className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/mortgages/${id}/documents`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    <FileText className="h-3 w-3" />
                    Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages/portfolio')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    Portfolio
                  </button>
                </div>
              )}
            </div>
          </section>
          ) : null}

          {/* Loan snapshot */}
          {mortgage && showSnapshotWidget ? (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {visibleSnapshotCards.map((item) => (
                <div
                  key={item.label}
                  className={`relative rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-sm backdrop-blur`}
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
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                      <p className={`mt-2 text-lg font-black capitalize ${item.tone}`}>{item.value}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                      <item.icon className="h-5 w-5 text-slate-600" />
                    </div>
                  </div>
                </div>
              ))}
              {visibleSnapshotCards.length === 0 ? (
                <div className="sm:col-span-2 xl:col-span-4 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                  All snapshot widgets are hidden.
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Payment stats */}
          {showPaymentStatsWidget ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {visiblePaymentStatsCards.map((item) => (
              <div
                key={item.label}
                className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-[0_16px_40px_-28px_rgba(79,70,229,0.45)] transition hover:-translate-y-0.5`}
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
            {visiblePaymentStatsCards.length === 0 ? (
              <div className="sm:col-span-2 xl:col-span-3 2xl:col-span-6 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                All payment stats widgets are hidden.
              </div>
            ) : null}
          </section>
          ) : null}

          {/* Payments list */}
          {showPaymentHistoryWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_24px_60px_-34px_rgba(79,70,229,0.45)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}payment_history`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide payment history widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Payment History</h2>
                <p className="text-sm text-slate-500">{enriched.rows.length} transaction{enriched.rows.length === 1 ? '' : 's'} recorded</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      viewMode === 'cards' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      viewMode === 'table' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    Table
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => token && loadData(token)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm font-medium text-slate-500">Loading payments...</p>
              </div>
            ) : enriched.rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                  <Receipt className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">No payments recorded yet</h3>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  Collections posted for this mortgage will appear here with interest and principal breakdown.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/mortgages/collections')}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md"
                >
                  <Banknote className="h-4 w-4" />
                  Go to Collections
                </button>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                {enriched.rows.map((p, index) => (
                  <article
                    key={p.id ?? index}
                    className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-indigo-50/30 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment #{p.id ?? index + 1}</p>
                        <p className="mt-1 text-xl font-black text-slate-900">{formatAmount(p.amount)}</p>
                        <p className="mt-1 text-sm text-slate-600">{formatDate(p.paid_date)}</p>
                      </div>
                      <Badge label={capitalizeMethod(p.payment_method)} variant="info" />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Interest Due</p>
                        <p className="mt-1 font-bold text-violet-700">{formatAmount(p.interest_due)}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Interest Paid</p>
                        <p className="mt-1 font-bold text-emerald-700">{formatAmount(p.interest_paid)}</p>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">Principal Applied</p>
                        <p className="mt-1 font-bold text-blue-700">{formatAmount(p.principal_applied)}</p>
                      </div>
                      <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-rose-800">Arrears After</p>
                        <p className="mt-1 font-bold text-rose-700">{formatAmount(p.arrears_after)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                      <span>
                        Last paid: <span className="font-semibold text-slate-900">{formatDate(p.last_paid_date)}</span>
                      </span>
                      <span>
                        Balance: <span className="font-semibold text-slate-900">{formatAmount(p.principal_balance_after)}</span>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                {visiblePaymentTableColumns.length > 0 ? (
                  <table className="min-w-[1100px] w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-[#0e1024] via-[#1a1f4b] to-[#312e81] text-left text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                        {visiblePaymentTableColumns.map((column) => (
                          <th key={column.key} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span>{column.label}</span>
                              <WidgetCloseGate>
                                <button
                                  type="button"
                                  onClick={() => void hideWidget(`${widgetPrefix}table_column_${column.key}`)}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-indigo-200/70 bg-white/90 text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
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
                      {enriched.rows.map((p, index) => (
                        <tr
                          key={p.id ?? index}
                          className={`transition hover:bg-indigo-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                        >
                          {visiblePaymentTableColumns.map((column) => (
                            <td key={column.key} className={`px-4 py-3 ${column.className}`}>
                              {column.render(p)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-10 text-center text-sm text-slate-600">
                    All payment table columns are hidden.
                  </div>
                )}
              </div>
            )}
          </section>
          ) : null}
        </div>
      </div>
    </ClientMountGate>
  );
}
