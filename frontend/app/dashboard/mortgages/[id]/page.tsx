'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import Badge from '../_components/Badge';
import ActionButton from '../_components/ActionButton';
import ClientMountGate from '@/app/components/ClientMountGate';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  FileText,
  Gem,
  Home,
  Landmark,
  MapPin,
  PercentCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

type StatusAction = 'submit' | 'approve' | 'reject' | 'release';

type AuthUser = {
  id?: number;
  name?: string | null;
  email?: string | null;
  designation?: { name?: string | null } | null;
  roles?: Array<{ name?: string | null }> | null;
};

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

function formatAmount(v: number | string | null | undefined): string {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(v: unknown): string {
  if (!v) return '—';
  const raw = String(v).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

function statusVariant(status: string): 'success' | 'warning' | 'info' | 'danger' | 'default' {
  const s = status.toLowerCase();
  if (s === 'active' || s === 'released') return 'success';
  if (s === 'arrears') return 'warning';
  if (s === 'approved') return 'info';
  if (s === 'rejected') return 'danger';
  if (s === 'submitted') return 'info';
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

export default function MortgageDetails() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mortgage, setMortgage] = useState<any>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<StatusAction | null>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const widgetPrefix = 'mortgages_details_widget_';

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

  const fetchMortgage = useCallback(
    async (authToken: string) => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await axios.get(`${getApiBaseUrl()}/mortgages/${id}`, {
          headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
        });
        setMortgage(res.data?.data ?? res.data);
      } catch {
        setMortgage(null);
        openToast('error', 'Failed to load mortgage details.');
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);
    void fetchNotificationPreview(t);
    fetchMortgage(t);
    void fetchWidgetPreferences(t);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [router, fetchMortgage, fetchNotificationPreview]);

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

  const handleStatus = async (action: StatusAction) => {
    if (!token || !id) return;
    try {
      setActionLoading(true);
      setActionInProgress(action);
      const res = await axios.post(
        `${getApiBaseUrl()}/mortgages/${id}/status`,
        { action },
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      await fetchMortgage(token);
      openToast('success', `Status updated to ${res.data?.status ?? action}.`);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Failed to update status.';
      openToast('error', message);
    } finally {
      setActionLoading(false);
      setActionInProgress(null);
    }
  };

  const monthlyFigures = useMemo(() => {
    if (!mortgage) return { monthlyInstallment: NaN, monthlyInterest: NaN, totalInterest: NaN };
    const principal = toNumber(mortgage.approved_amount ?? mortgage.requested_amount);
    const annualRate = toNumber(mortgage.interest_rate) / 100;
    const months = Math.round(toNumber(mortgage.tenure_months));
    if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(months) || months <= 0) {
      return { monthlyInstallment: NaN, monthlyInterest: NaN, totalInterest: NaN };
    }
    const r = annualRate / 12;
    if (mortgage.interest_type === 'reducing') {
      const pow = Math.pow(1 + r, months);
      const emi = (principal * r * pow) / (pow - 1);
      const firstInterest = principal * r;
      const totalPayment = emi * months;
      return { monthlyInstallment: emi, monthlyInterest: firstInterest, totalInterest: totalPayment - principal };
    }
    const monthlyInterest = principal * r;
    const totalInterest = principal * annualRate * (months / 12);
    return { monthlyInstallment: (principal + totalInterest) / months, monthlyInterest, totalInterest };
  }, [mortgage]);

  const status = String(mortgage?.status || '').toLowerCase();
  const canSubmit = status === 'draft';
  const canApproveReject = status === 'draft' || status === 'submitted';
  const canRelease = status === 'approved';

  const typeMeta = mortgageTypeMeta(String(mortgage?.mortgage_type || 'other'));
  const TypeIcon = typeMeta.icon;
  const statCards = [
    { key: 'stat_requested', icon: Banknote, label: 'Requested', value: formatAmount(mortgage.requested_amount), tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
    { key: 'stat_approved', icon: CheckCircle2, label: 'Approved', value: formatAmount(mortgage.approved_amount), tone: 'text-cyan-700', bg: 'from-cyan-500/10 to-blue-500/5' },
    { key: 'stat_installment', icon: Wallet, label: 'Installment', value: formatAmount(mortgage.installment_amount ?? monthlyFigures.monthlyInstallment), tone: 'text-indigo-700', bg: 'from-indigo-500/10 to-violet-500/5' },
    { key: 'stat_total_interest', icon: PercentCircle, label: 'Total Interest', value: formatAmount(monthlyFigures.totalInterest), tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-green-500/5' },
    { key: 'stat_due_principal', icon: Landmark, label: 'Due Principal', value: formatAmount(mortgage.due_amount), tone: 'text-slate-800', bg: 'from-slate-400/10 to-zinc-500/5' },
    { key: 'stat_due_interest', icon: PercentCircle, label: 'Due Interest', value: formatAmount(mortgage.due_interest_amount), tone: 'text-amber-700', bg: 'from-amber-500/10 to-orange-500/5' },
    { key: 'stat_total_paid', icon: Banknote, label: 'Total Paid', value: formatAmount(mortgage.total_paid_amount), tone: 'text-violet-700', bg: 'from-violet-500/10 to-purple-500/5' },
    { key: 'stat_tenure', icon: CalendarDays, label: 'Tenure', value: `${mortgage.tenure_months || '—'} mo`, tone: 'text-teal-700', bg: 'from-teal-500/10 to-cyan-500/5' },
  ];
  const visibleStatCards = statCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const guarantorColumns = [
    { key: 'name', label: 'Name', render: (g: any) => g.name || g.full_name || '—', className: 'font-semibold text-slate-900' },
    { key: 'nic', label: 'NIC', render: (g: any) => g.nic || '—', className: 'text-black' },
    { key: 'relationship', label: 'Relationship', render: (g: any) => g.relationship || '—', className: 'text-black' },
    { key: 'income', label: 'Income', render: (g: any) => formatAmount(g.income ?? g.monthly_income), className: 'text-black' },
    { key: 'contact', label: 'Contact', render: (g: any) => g.contact_number || '—', className: 'text-black' },
  ];
  const visibleGuarantorColumns = guarantorColumns.filter((column) => !hiddenWidgetKeys.has(`${widgetPrefix}guarantor_column_${column.key}`));

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showStatsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}stats_section`);
  const showFinancialWidget = !hiddenWidgetKeys.has(`${widgetPrefix}financial_details`);
  const showWorkflowWidget = !hiddenWidgetKeys.has(`${widgetPrefix}workflow`);
  const showRepaymentWidget = !hiddenWidgetKeys.has(`${widgetPrefix}repayment_terms`);
  const showCollateralWidget = !hiddenWidgetKeys.has(`${widgetPrefix}collateral`);
  const showValuationWidget = !hiddenWidgetKeys.has(`${widgetPrefix}valuation`);
  const showGuarantorsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}guarantors`);
  const showAnyWidget =
    showHeroWidget ||
    (showStatsWidget && visibleStatCards.length > 0) ||
    showFinancialWidget ||
    showWorkflowWidget ||
    showRepaymentWidget ||
    showCollateralWidget ||
    showValuationWidget ||
    showGuarantorsWidget;

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#071a22]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
        <p className="text-sm font-medium text-cyan-100/80">Loading mortgage profile...</p>
      </div>
    </div>
  );

  if (!token) {
    return <ClientMountGate fallback={pageFallback}>{pageFallback}</ClientMountGate>;
  }

  if (loading && !mortgage) {
    return <ClientMountGate fallback={pageFallback}>{pageFallback}</ClientMountGate>;
  }

  if (!mortgage) {
    return (
      <ClientMountGate fallback={pageFallback}>
        <div className="flex min-h-screen items-center justify-center bg-[#f3f8fb] px-4">
          <div className="rounded-3xl border border-white/90 bg-white p-8 text-center shadow-lg">
            <p className="text-lg font-bold text-slate-900">Mortgage not found</p>
            <button
              type="button"
              onClick={() => router.push('/dashboard/mortgages')}
              className="mt-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Back to Mortgages Hub
            </button>
          </div>
        </div>
      </ClientMountGate>
    );
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
                  aria-label="Hide mortgage hero widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${typeMeta.color} text-white shadow-lg`}>
                    <TypeIcon className="h-7 w-7" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">
                      <Sparkles className="h-3.5 w-3.5" />
                      Mortgage Profile
                    </span>
                    <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                      {typeMeta.label} Mortgage #{id}
                    </h1>
                    <p className="mt-2 text-sm text-cyan-50/90">
                      Customer #{mortgage.customer_id} • Created {formatDate(mortgage.created_at)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge label={mortgage.status} variant={statusVariant(status)} />
                      {mortgage.due_date && (
                        <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-cyan-100">
                          Due {formatDate(mortgage.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/mortgages/${id}/payments`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    <Wallet className="h-4 w-4" />
                    Payments
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/mortgages/${id}/documents`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    <FileText className="h-4 w-4" />
                    Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/mortgages/${id}/schedule`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages/portfolio')}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Portfolio
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages')}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => token && fetchMortgage(token)}
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
            {visibleStatCards.map((item) => (
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
            {visibleStatCards.length === 0 ? (
              <div className="sm:col-span-2 xl:col-span-4 2xl:col-span-8 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                All summary cards are hidden.
              </div>
            ) : null}
          </section>
          ) : null}

          {showFinancialWidget || showWorkflowWidget || showRepaymentWidget ? (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {showFinancialWidget ? (
            <div className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_22px_55px_-34px_rgba(14,116,144,0.45)] backdrop-blur-xl lg:col-span-2">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}financial_details`)}
                  className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide financial details widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="border-b border-slate-100 bg-gradient-to-r from-cyan-50/80 to-blue-50/50 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Financial Details</p>
                <h2 className="mt-1 text-lg font-extrabold text-slate-900">Core finance snapshot</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                {[
                  { icon: MapPin, label: 'Type', value: typeMeta.label },
                  { icon: Banknote, label: 'Requested', value: formatAmount(mortgage.requested_amount) },
                  { icon: PercentCircle, label: 'Interest', value: `${mortgage.interest_rate}% (${mortgage.interest_type})` },
                  { icon: CalendarDays, label: 'Tenure', value: `${mortgage.tenure_months} months` },
                  { icon: Banknote, label: 'Processing Fee', value: formatAmount(mortgage.processing_fee) },
                  { icon: PercentCircle, label: 'Penalty Rate', value: `${mortgage.penalty_rate ?? '—'}%` },
                  { icon: Banknote, label: 'Monthly Installment', value: formatAmount(monthlyFigures.monthlyInstallment) },
                  { icon: PercentCircle, label: 'Monthly Interest', value: formatAmount(monthlyFigures.monthlyInterest) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm">
                    <row.icon className="h-4 w-4 shrink-0 text-cyan-700" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{row.label}</p>
                      <p className="font-semibold capitalize text-slate-900">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            ) : null}

            {showWorkflowWidget || showRepaymentWidget ? (
            <div className="space-y-6">
              {showWorkflowWidget ? (
              <div className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-sm backdrop-blur-xl">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}workflow`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide workflow widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Workflow</p>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-900">Status actions</h2>
                </div>
                <div className="space-y-2 p-5">
                  <ActionButton
                    label={actionInProgress === 'submit' ? 'Submitting...' : 'Submit for Approval'}
                    icon={actionInProgress === 'submit' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    variant="primary"
                    onClick={() => handleStatus('submit')}
                    disabled={!canSubmit || actionLoading}
                    className="w-full"
                  />
                  <ActionButton
                    label={actionInProgress === 'approve' ? 'Approving...' : 'Approve'}
                    icon={actionInProgress === 'approve' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    variant="success"
                    onClick={() => handleStatus('approve')}
                    disabled={!canApproveReject || actionLoading}
                    className="w-full"
                  />
                  <ActionButton
                    label={actionInProgress === 'reject' ? 'Rejecting...' : 'Reject'}
                    icon={actionInProgress === 'reject' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    variant="danger"
                    onClick={() => handleStatus('reject')}
                    disabled={!canApproveReject || actionLoading}
                    className="w-full"
                  />
                  <ActionButton
                    label={actionInProgress === 'release' ? 'Releasing...' : 'Release'}
                    icon={actionInProgress === 'release' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                    variant="info"
                    onClick={() => handleStatus('release')}
                    disabled={!canRelease || actionLoading}
                    className="w-full"
                  />
                </div>
                <div className="mx-5 mb-5 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
                    Only actions allowed for the current status are enabled.
                  </div>
                </div>
              </div>
              ) : null}

              {showRepaymentWidget ? (
              <div className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-sm backdrop-blur-xl">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}repayment_terms`)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide repayment terms widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Structure</p>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-900">Repayment terms</h2>
                </div>
                <div className="space-y-2 p-5 text-sm">
                  {[
                    ['Refund Frequency', mortgage.installment_frequency],
                    ['Interest Calc Frequency', mortgage.interest_calculation_frequency],
                    ['Installment Amount', formatAmount(mortgage.installment_amount)],
                    ['Interest Type', mortgage.interest_type],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-semibold capitalize text-slate-900">{String(value || '—')}</span>
                    </div>
                  ))}
                </div>
              </div>
              ) : null}
            </div>
            ) : null}
          </section>
          ) : null}

          {showCollateralWidget || showValuationWidget ? (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {showCollateralWidget ? (
            <div className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-sm backdrop-blur-xl">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}collateral`)}
                  className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide collateral widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Collateral</p>
                <h2 className="mt-1 text-lg font-extrabold text-slate-900">Asset details</h2>
              </div>
              <div className="p-5">
                {mortgage.asset ? (
                  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    {[
                      ['Type', mortgage.asset.asset_type],
                      ['Description', mortgage.asset.description],
                      ['Address', mortgage.asset.address],
                      ['Deed No', mortgage.asset.deed_number],
                      ['Deed Date', mortgage.asset.deed_date],
                      ['Survey Plan', mortgage.asset.survey_plan_number],
                      ['Registry', mortgage.asset.registration_office],
                      ['Area', mortgage.asset.land_size_or_area],
                      ['Vehicle Reg', mortgage.asset.vehicle_reg_no],
                      ['Engine No', mortgage.asset.engine_no],
                      ['Chassis No', mortgage.asset.chassis_no],
                    ]
                      .filter(([, value]) => value != null && String(value).trim() !== '')
                      .map(([label, value]) => (
                        <div key={String(label)} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                          <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
                          <p className="mt-0.5 font-semibold capitalize text-slate-900">{String(value)}</p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No asset details provided.</p>
                )}
              </div>
            </div>
            ) : null}

            {showValuationWidget ? (
            <div className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-sm backdrop-blur-xl">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}valuation`)}
                  className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide valuation widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Valuation</p>
                <h2 className="mt-1 text-lg font-extrabold text-slate-900">Market values</h2>
              </div>
              <div className="p-5">
                {mortgage.valuation ? (
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                      <p className="text-xs font-bold uppercase text-emerald-800">Market Value</p>
                      <p className="mt-1 text-lg font-bold text-emerald-700">{formatAmount(mortgage.valuation.market_value)}</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                      <p className="text-xs font-bold uppercase text-amber-800">Forced Sale</p>
                      <p className="mt-1 text-lg font-bold text-amber-700">{formatAmount(mortgage.valuation.forced_sale_value)}</p>
                    </div>
                    {mortgage.valuation.valuation_date && (
                      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 sm:col-span-2">
                        <p className="text-xs font-bold uppercase text-slate-500">Valuation Date</p>
                        <p className="font-semibold text-slate-900">{formatDate(mortgage.valuation.valuation_date)}</p>
                      </div>
                    )}
                    {mortgage.valuation.valuer_name && (
                      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 sm:col-span-2">
                        <p className="text-xs font-bold uppercase text-slate-500">Valuer</p>
                        <p className="font-semibold text-slate-900">{mortgage.valuation.valuer_name}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No valuation provided.</p>
                )}
              </div>
            </div>
            ) : null}
          </section>
          ) : null}

          {showGuarantorsWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_24px_60px_-34px_rgba(14,116,144,0.5)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}guarantors`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide guarantors widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Guarantors</p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900">People backing this mortgage</h2>
            </div>
            <div className="p-5">
              {Array.isArray(mortgage.guarantors) && mortgage.guarantors.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-cyan-100">
                  {visibleGuarantorColumns.length > 0 ? (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-black">
                          {visibleGuarantorColumns.map((column) => (
                            <th key={column.key} className="px-4 py-3 text-black">
                              <div className="flex items-center justify-between gap-2">
                                <span>{column.label}</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => void hideWidget(`${widgetPrefix}guarantor_column_${column.key}`)}
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                    aria-label={`Hide guarantor ${column.label} column`}
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
                        {mortgage.guarantors.map((g: any, idx: number) => (
                          <tr key={idx} className="hover:bg-cyan-50/40">
                            {visibleGuarantorColumns.map((column) => (
                              <td key={column.key} className={`px-4 py-2.5 ${column.className}`}>
                                {column.render(g)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-sm text-slate-600">
                      All guarantor columns are hidden.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm text-slate-600">
                  <Users className="h-5 w-5 text-cyan-700" />
                  No guarantors added.
                </div>
              )}
            </div>
          </section>
          ) : null}
        </div>

        {toast && (
          <div className="fixed bottom-5 right-5 z-50">
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
