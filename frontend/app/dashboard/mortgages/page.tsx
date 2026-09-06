'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import ClientMountGate from '@/app/components/ClientMountGate';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Home,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';

type MortgageStatusRow = {
  id: number;
  status?: string | null;
};

type DashboardStats = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  active: number;
  arrears: number;
  settled: number;
  released: number;
};

type HubModule = {
  title: string;
  description: string;
  tag: string;
  path: string;
  icon: typeof Plus;
  color: string;
  bg: string;
  accent: string;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

export default function MortgagesDashboard() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    active: 0,
    arrears: 0,
    settled: 0,
    released: 0,
  });
  const widgetPrefix = 'mortgages_dashboard_widget_';

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
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
    void fetchWidgetPreferences(storedToken);
    void fetchNotificationPreview(storedToken);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [fetchNotificationPreview, router]);

  const loadStats = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`${getApiBaseUrl()}/mortgages`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 1000 },
      });

      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      const normalized = rows as MortgageStatusRow[];
      const count = (status: string) =>
        normalized.filter((m) => String(m.status || '').toLowerCase() === status).length;

      setStats({
        total: normalized.length,
        draft: count('draft'),
        submitted: count('submitted'),
        approved: count('approved'),
        active: count('active'),
        arrears: count('arrears'),
        settled: count('settled'),
        released: count('released'),
      });
    } catch {
      setStats({
        total: 0,
        draft: 0,
        submitted: 0,
        approved: 0,
        active: 0,
        arrears: 0,
        settled: 0,
        released: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

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
    loadStats(token);
  }, [token, loadStats]);

  const modules = useMemo<HubModule[]>(
    () => [
      {
        title: 'Create Mortgage',
        description: 'Register a new mortgage request with customer profile, collateral, and documents.',
        tag: 'Origination',
        path: '/dashboard/mortgages/create',
        icon: Plus,
        color: 'from-cyan-500 to-blue-600',
        bg: 'from-cyan-50/90 to-blue-50/60',
        accent: 'from-cyan-500 to-blue-500',
      },
      {
        title: 'Mortgage Approvals',
        description: 'Review pending applications, approve or reject, and move accounts to release.',
        tag: 'Approval Desk',
        path: '/dashboard/mortgages/approvals',
        icon: CheckCircle2,
        color: 'from-emerald-500 to-teal-600',
        bg: 'from-emerald-50/90 to-teal-50/60',
        accent: 'from-emerald-500 to-teal-500',
      },
      {
        title: 'Mortgage Portfolio',
        description: 'Browse all mortgages with filters, schedules, status tracking, and account actions.',
        tag: 'Portfolio',
        path: '/dashboard/mortgages/portfolio',
        icon: BarChart3,
        color: 'from-indigo-500 to-violet-600',
        bg: 'from-indigo-50/90 to-violet-50/60',
        accent: 'from-indigo-500 to-violet-500',
      },
      {
        title: 'Collection Management',
        description: 'Post collections, monitor arrears, adjust interest, and print payment receipts.',
        tag: 'Collections',
        path: '/dashboard/mortgages/collections',
        icon: Wallet,
        color: 'from-teal-500 to-cyan-600',
        bg: 'from-teal-50/90 to-cyan-50/60',
        accent: 'from-teal-500 to-cyan-500',
      },
      {
        title: 'Mortgage Reports',
        description: 'Collection, profit, arrears, and portfolio analytics with export-ready views.',
        tag: 'Reports',
        path: '/dashboard/mortgages/reports',
        icon: FileText,
        color: 'from-rose-500 to-orange-600',
        bg: 'from-rose-50/90 to-orange-50/60',
        accent: 'from-rose-500 to-orange-500',
      },
    ],
    []
  );

  const statsCards = [
    { key: 'stat_total_accounts', icon: ClipboardList, label: 'Total Accounts', value: loading ? '—' : stats.total, tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
    { key: 'stat_draft', icon: FileText, label: 'Draft', value: loading ? '—' : stats.draft, tone: 'text-slate-600', bg: 'from-slate-400/10 to-zinc-500/5' },
    { key: 'stat_submitted', icon: TrendingUp, label: 'Submitted', value: loading ? '—' : stats.submitted, tone: 'text-amber-700', bg: 'from-amber-500/10 to-orange-500/5' },
    { key: 'stat_approved', icon: CheckCircle2, label: 'Approved', value: loading ? '—' : stats.approved, tone: 'text-cyan-700', bg: 'from-cyan-500/10 to-blue-500/5' },
    { key: 'stat_running_book', icon: Banknote, label: 'Running Book', value: loading ? '—' : stats.active + stats.arrears + stats.released, tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-green-500/5' },
    { key: 'stat_arrears', icon: AlertTriangle, label: 'Arrears', value: loading ? '—' : stats.arrears, tone: 'text-rose-700', bg: 'from-rose-500/10 to-red-500/5' },
    { key: 'stat_settled', icon: Home, label: 'Settled', value: loading ? '—' : stats.settled, tone: 'text-indigo-700', bg: 'from-indigo-500/10 to-violet-500/5' },
    { key: 'stat_released', icon: Wallet, label: 'Released', value: loading ? '—' : stats.released, tone: 'text-teal-700', bg: 'from-teal-500/10 to-cyan-500/5' },
  ] as const;
  const quickActions = [
    {
      key: 'quick_start_application',
      icon: Plus,
      title: 'Start Application',
      desc: 'Capture customer, financials, collateral, and supporting documents.',
      color: 'text-cyan-700',
      href: '/dashboard/mortgages/create',
    },
    {
      key: 'quick_approval_queue',
      icon: CheckCircle2,
      title: 'Approval Queue',
      desc: `${stats.submitted} submitted application${stats.submitted === 1 ? '' : 's'} awaiting review.`,
      color: 'text-emerald-700',
      href: '/dashboard/mortgages/approvals',
    },
    {
      key: 'quick_arrears_focus',
      icon: AlertTriangle,
      title: 'Arrears Focus',
      desc: `${stats.arrears} account${stats.arrears === 1 ? '' : 's'} currently in arrears status.`,
      color: 'text-rose-700',
      href: '/dashboard/mortgages/collections',
    },
  ] as const;
  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const visibleStatsCards = statsCards.filter((card) => !hiddenWidgetKeys.has(`${widgetPrefix}${card.key}`));
  const visibleQuickActions = quickActions.filter((action) => !hiddenWidgetKeys.has(`${widgetPrefix}${action.key}`));
  const visibleModules = modules.filter((module) => !hiddenWidgetKeys.has(`${widgetPrefix}module_${module.path.replace(/\//g, '_')}`));
  const showWorkspacesWidget = !hiddenWidgetKeys.has(`${widgetPrefix}workspaces`);
  const isAnyWidgetVisible = showHeroWidget || visibleStatsCards.length > 0 || visibleQuickActions.length > 0 || showWorkspacesWidget;

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#071a22]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
        <p className="text-sm font-medium text-cyan-100/80">Loading mortgage hub...</p>
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
                  onClick={() => router.push('/dashboard')}
                  className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
                >
                  Back to Dashboard
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {widgetNotice}
            </div>
          ) : null}
          {!isAnyWidgetVisible ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              All widgets are hidden on this page. Restore hidden widgets from dashboard.
            </div>
          ) : null}

          {showHeroWidget ? (
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0a1a24] via-[#0f3a52] to-[#0c5a7a] text-white shadow-[0_30px_80px_-24px_rgba(14,116,144,0.8)]">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}hero`)}
                className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-white/80 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide hero widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.25),transparent_42%)]" />
            <div className="relative p-6 md:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Mortgage Command Center
                  </span>
                  <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Mortgage Operations Hub</h1>
                  <p className="mt-2 text-sm leading-relaxed text-cyan-50/90 md:text-base">
                    Originate applications, process approvals, manage collections, and analyze portfolio performance from one workspace.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-cyan-100/90">
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">Dashboard</span>
                    <span className="text-cyan-200/50">/</span>
                    <span className="rounded-lg bg-cyan-400/20 px-2.5 py-1 font-semibold text-white">Mortgages</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages/create')}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:brightness-110"
                  >
                    <Plus className="h-4 w-4" />
                    New Application
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard')}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => token && loadStats(token)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { label: 'Approvals', href: '/dashboard/mortgages/approvals' },
                  { label: 'Portfolio', href: '/dashboard/mortgages/portfolio' },
                  { label: 'Collections', href: '/dashboard/mortgages/collections' },
                  { label: 'Reports', href: '/dashboard/mortgages/reports' },
                ].map((link) => (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => router.push(link.href)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
          ) : null}

          {visibleStatsCards.length > 0 ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            {visibleStatsCards.map((item) => (
              <div
                key={item.key}
                className={`relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5`}
              >
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}${item.key}`)}
                    className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                    <item.icon className="h-5 w-5 text-slate-600" />
                  </div>
                </div>
              </div>
            ))}
          </section>
          ) : null}

          {visibleQuickActions.length > 0 ? (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {visibleQuickActions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => router.push(item.href)}
                className="rounded-2xl border border-white/90 bg-white/95 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg relative"
              >
                <WidgetCloseGate>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void hideWidget(`${widgetPrefix}${item.key}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        void hideWidget(`${widgetPrefix}${item.key}`);
                      }
                    }}
                    className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${item.title} widget`}
                  >
                    ×
                  </span>
                </WidgetCloseGate>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <item.icon className={`h-5 w-5 ${item.color}`} />
                    <p className="font-bold text-slate-900">{item.title}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
              </button>
            ))}
          </section>
          ) : null}

          {showWorkspacesWidget ? (
          <section className="relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}workspaces`)}
                className="absolute right-0 top-0 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide workspaces widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Modules</p>
                <h2 className="mt-1 text-lg font-extrabold text-slate-900">Mortgage Workspaces</h2>
                <p className="text-sm text-slate-500">Open a dedicated page for each mortgage operation.</p>
              </div>
            </div>

            {visibleModules.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                All workspace cards are hidden. Restore hidden widgets from dashboard.
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visibleModules.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.title}
                    type="button"
                    onClick={() => router.push(option.path)}
                    className="group relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 text-left shadow-[0_22px_55px_-34px_rgba(14,116,144,0.45)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_28px_60px_-30px_rgba(14,116,144,0.55)]"
                  >
                    <WidgetCloseGate>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void hideWidget(`${widgetPrefix}module_${option.path.replace(/\//g, '_')}`);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            void hideWidget(`${widgetPrefix}module_${option.path.replace(/\//g, '_')}`);
                          }
                        }}
                        className="absolute right-2 top-2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Hide ${option.title} widget`}
                      >
                        ×
                      </span>
                    </WidgetCloseGate>
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${option.accent}`} />
                    <div className={`absolute inset-0 bg-gradient-to-br ${option.bg} opacity-0 transition group-hover:opacity-100`} />
                    <div className="relative p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${option.color} text-white shadow-lg transition group-hover:scale-105`}>
                          <Icon className="h-7 w-7" />
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                          {option.tag}
                        </span>
                      </div>
                      <h3 className="mt-4 text-xl font-black tracking-tight text-slate-900">{option.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{option.description}</p>
                      <div className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-cyan-800 transition group-hover:gap-3">
                        Open workspace
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </section>
          ) : null}
        </div>
      </div>
    </ClientMountGate>
  );
}
