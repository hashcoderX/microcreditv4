'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Target, TrendingUp, Wallet2, Activity } from 'lucide-react';

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string } | null;
  roles?: Array<{ id?: number; name?: string }>;
  branch_id?: number | null;
  employee?: {
    id?: number;
    monthly_target?: number | string | null;
  } | null;
};

type CollectionRow = {
  id: number;
  collection_date?: string | null;
  created_at?: string | null;
  collected_amount?: number | string | null;
  capital_amount?: number | string | null;
  interest_amount?: number | string | null;
  penalty_amount?: number | string | null;
  payment_type?: string | null;
  payment_reference?: string | null;
  loan_request?: {
    id?: number | string;
    customer_no?: string | null;
    customer_name?: string | null;
    field_officer?: string | null;
    route_name?: string | null;
    route_code?: string | null;
    route?: { name?: string | null } | null;
  } | null;
};

type ReportRow = {
  id: number;
  date: string;
  eventTime: string;
  customerNo: string;
  customerName: string;
  fieldOfficer: string;
  routeName: string;
  collected: number;
  capital: number;
  interest: number;
  penalty: number;
  paymentType: string;
  reference: string;
};

const API_BASE = getApiBaseUrl();

type BarPoint = {
  label: string;
  value: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || '-';

  return new Intl.DateTimeFormat('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
}

function donutStyle(percentage: number) {
  const normalized = Math.max(0, Math.min(percentage, 100));
  return {
    background: `conic-gradient(#0e7490 ${normalized}%, #cffafe ${normalized}% 100%)`,
  };
}

function KPI({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
        </div>
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function RouteBarChart({ points }: { points: BarPoint[] }) {
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);

  return (
    <div className="space-y-3">
      {points.length === 0 && (
        <div className="rounded-xl border border-dashed border-cyan-200 bg-cyan-50/50 p-4 text-sm text-slate-600">
          No route data to visualize today.
        </div>
      )}
      {points.map((point) => {
        const width = max > 0 ? (point.value / max) * 100 : 0;
        return (
          <div key={point.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="max-w-[70%] truncate font-semibold text-slate-700">{point.label}</span>
              <span className="font-bold text-cyan-800">{formatMoney(point.value)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-cyan-100">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500"
                style={{ width: `${Math.max(width, point.value > 0 ? 5 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTopLevelUser(user: AuthUser | null) {
  const tokens = [
    normalizeText(user?.designation?.name || ''),
    ...(Array.isArray(user?.roles) ? user!.roles!.map((r) => normalizeText(r?.name || '')) : []),
  ];

  return tokens.some((token) =>
    ['super admin', 'system admin', 'admin', 'owner', 'ceo', 'director', 'regional manager', 'senior management']
      .some((keyword) => token.includes(keyword))
  );
}

function isFieldOfficerUser(user: AuthUser | null) {
  const tokens = [
    normalizeText(user?.designation?.name || ''),
    ...(Array.isArray(user?.roles) ? user!.roles!.map((r) => normalizeText(r?.name || '')) : []),
  ];

  return tokens.some((token) => token.includes('field officer'));
}

export default function TodayCollectionReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [officerFilter, setOfficerFilter] = useState('all');
  const widgetPrefix = 'mf_today_collection_widget_';
  const reportPath = '/dashboard/microfinance/reports/today-collection';

  const branchId = Number(searchParams.get('branch_id') || 0) || undefined;

  const fetchWidgetPreferences = async (authToken: string) => {
    setLoadingWidgets(true);
    try {
      const response = await axios.get(`${API_BASE}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });

      const list = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of list) {
        const key = String(row?.widget_key || '').trim();
        if (!key.startsWith(widgetPrefix)) continue;
        if (row?.is_visible === false) nextHidden.add(key);
      }
      setHiddenWidgetKeys(nextHidden);
    } catch {
      setHiddenWidgetKeys(new Set());
    } finally {
      setLoadingWidgets(false);
    }
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        `${API_BASE}/dashboard/widgets`,
        {
          widget_key: widgetKey,
          is_visible: isVisible,
          hidden_route_path: isVisible ? null : reportPath,
        },
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
  };

  const hideWidget = async (widgetKey: string) => {
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);

    const ok = await saveWidgetPreference(widgetKey, false);
    if (!ok) {
      setHiddenWidgetKeys(previous);
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
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadReport = async () => {
      setLoading(true);
      try {
        const userRes = await axios.get(`${API_BASE}/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const user = (userRes.data || null) as AuthUser | null;
        setAuthUser(user);
        localStorage.setItem('auth_user', JSON.stringify(user));

        const topLevel = isTopLevelUser(user);
        const fieldOfficerOnly = isFieldOfficerUser(user) && !topLevel;

        const collectionRes = await axios.get(`${API_BASE}/microfinance/collections`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            params: {
              branch_id: branchId,
              today_only: true,
              self_only: fieldOfficerOnly,
            },
          });

        const payload = collectionRes.data;
        const collections: CollectionRow[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

        const mapped: ReportRow[] = collections
          .map((item) => ({
            id: Number(item.id || 0),
            date: String(item.collection_date || item.created_at || ''),
            eventTime: String(item.created_at || item.collection_date || ''),
            customerNo: String(item.loan_request?.customer_no || '-'),
            customerName: String(item.loan_request?.customer_name || '-'),
            fieldOfficer: String(item.loan_request?.field_officer || 'Unassigned'),
            routeName: String(item.loan_request?.route?.name || item.loan_request?.route_name || item.loan_request?.route_code || '-'),
            collected: Number(item.collected_amount || 0),
            capital: Number(item.capital_amount || 0),
            interest: Number(item.interest_amount || 0),
            penalty: Number(item.penalty_amount || 0),
            paymentType: String(item.payment_type || '-').replace('_', ' '),
            reference: String(item.payment_reference || '-'),
          }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setRows(mapped);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    void loadReport();
  }, [token, branchId]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.transactions += 1;
        acc.collected += row.collected;
        acc.capital += row.capital;
        acc.interest += row.interest;
        acc.penalty += row.penalty;
        return acc;
      },
      {
        transactions: 0,
        collected: 0,
        capital: 0,
        interest: 0,
        penalty: 0,
      }
    );
  }, [rows]);

  const officerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.fieldOfficer).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const topLevel = isTopLevelUser(authUser);
  const fieldOfficerOnly = isFieldOfficerUser(authUser) && !topLevel;

  const visibleRows = useMemo(() => {
    if (!topLevel || officerFilter === 'all') return rows;
    return rows.filter((row) => normalizeText(row.fieldOfficer) === officerFilter);
  }, [rows, topLevel, officerFilter]);

  const routeChart = useMemo(() => {
    const map = new Map<string, number>();
    visibleRows.forEach((row) => {
      const key = row.routeName || 'Unknown Route';
      map.set(key, (map.get(key) || 0) + row.collected);
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [visibleRows]);

  const monthlyTarget = Number(authUser?.employee?.monthly_target || 0);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyTarget = monthlyTarget > 0 ? monthlyTarget / daysInMonth : 0;
  const activeSummary = useMemo(() => {
    return visibleRows.reduce(
      (acc, row) => {
        acc.transactions += 1;
        acc.collected += row.collected;
        acc.capital += row.capital;
        acc.interest += row.interest;
        acc.penalty += row.penalty;
        return acc;
      },
      {
        transactions: 0,
        collected: 0,
        capital: 0,
        interest: 0,
        penalty: 0,
      }
    );
  }, [visibleRows]);

  const targetProgress = dailyTarget > 0 ? (activeSummary.collected / dailyTarget) * 100 : 0;
  const targetProgressClamped = Math.max(0, Math.min(targetProgress, 100));
  const remainingToTarget = Math.max(dailyTarget - activeSummary.collected, 0);

  const collectionMixTotal = Math.max(activeSummary.capital + activeSummary.interest + activeSummary.penalty, 0);
  const capitalShare = collectionMixTotal > 0 ? (activeSummary.capital / collectionMixTotal) * 100 : 0;
  const interestShare = collectionMixTotal > 0 ? (activeSummary.interest / collectionMixTotal) * 100 : 0;
  const penaltyShare = collectionMixTotal > 0 ? (activeSummary.penalty / collectionMixTotal) * 100 : 0;

  const mixDonut = {
    background: `conic-gradient(#14b8a6 0 ${capitalShare}%, #4f46e5 ${capitalShare}% ${capitalShare + interestShare}%, #f43f5e ${capitalShare + interestShare}% 100%)`,
  };

  const summaryCards = [
    {
      key: `${widgetPrefix}summary_transactions`,
      label: 'Transactions',
      value: String(activeSummary.transactions),
      tone: 'from-cyan-500 to-blue-600',
      icon: <Activity size={18} />,
    },
    {
      key: `${widgetPrefix}summary_collected`,
      label: 'Collected',
      value: formatMoney(activeSummary.collected),
      tone: 'from-emerald-500 to-teal-600',
      icon: <Wallet2 size={18} />,
    },
    {
      key: `${widgetPrefix}summary_capital`,
      label: 'Capital',
      value: formatMoney(activeSummary.capital),
      tone: 'from-teal-500 to-cyan-600',
      icon: <TrendingUp size={18} />,
    },
    {
      key: `${widgetPrefix}summary_interest`,
      label: 'Interest',
      value: formatMoney(activeSummary.interest),
      tone: 'from-indigo-500 to-blue-600',
      icon: <TrendingUp size={18} />,
    },
    {
      key: `${widgetPrefix}summary_penalty`,
      label: 'Penalty',
      value: formatMoney(activeSummary.penalty),
      tone: 'from-rose-500 to-pink-600',
      icon: <TrendingUp size={18} />,
    },
  ];

  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showHero = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showTargetWidget = !hiddenWidgetKeys.has(`${widgetPrefix}target_progress`);
  const showMixWidget = !hiddenWidgetKeys.has(`${widgetPrefix}collection_mix`);
  const showRouteWidget = !hiddenWidgetKeys.has(`${widgetPrefix}route_bar_chart`);
  const showTransactionsTable = !hiddenWidgetKeys.has(`${widgetPrefix}transactions_table`);

  if (!token || loading || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#a5f3fc_0%,#ecfeff_35%,#f8fafc_100%)] p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -top-24 left-10 h-80 w-80 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute top-10 right-4 h-96 w-96 rounded-full bg-sky-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-200 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {showHero && (
        <div className="relative rounded-3xl border border-white/80 bg-white/85 p-6 shadow-[0_28px_70px_-35px_rgba(8,47,73,0.6)] backdrop-blur-xl md:p-7">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}hero`)}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide hero section"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-800">
                Performance Dashboard
              </span>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Today Collection Command Center</h1>
              <p className="mt-1 text-sm text-slate-600">Rich view for today only, auto-scoped to logged user and field collection activity.</p>
            </div>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-cyan-50"
            >
              <ArrowLeft size={16} /> Back
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-sky-50 p-4 text-sm text-slate-700">
            <p>
              Logged User: <span className="font-semibold text-slate-900">{String(authUser?.name || authUser?.email || 'User')}</span>
            </p>
            <p>
              Designation: <span className="font-semibold text-slate-900">{String(authUser?.designation?.name || 'Staff')}</span>
            </p>
              <p>
                View Scope: <span className="font-semibold text-slate-900">{topLevel ? 'All Officers (Top Level Access)' : fieldOfficerOnly ? 'My Collections Only' : 'Assigned Scope'}</span>
              </p>
            <p>
              Monthly Target: <span className="font-semibold text-slate-900">{monthlyTarget > 0 ? formatMoney(monthlyTarget) : 'Not Set'}</span>
            </p>
          </div>

          {topLevel && (
            <div className="mt-4 flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Field Officer Filter</label>
                <select
                  className="mt-1 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={officerFilter}
                  onChange={(e) => setOfficerFilter(e.target.value)}
                >
                  <option value="all">All Field Officers</option>
                  {officerOptions.map((officer) => (
                    <option key={officer} value={normalizeText(officer)}>{officer}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {visibleSummaryCards.map((card) => (
              <div key={card.key} className="relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(card.key)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${card.label} widget`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <KPI label={card.label} value={card.value} tone={card.tone} icon={card.icon} />
              </div>
            ))}
          </div>
          {visibleSummaryCards.length === 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              All summary cards are hidden. Restore them from dashboard with admin approval.
            </div>
          )}
        </div>
        )}

        {!showHero && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Main widget is hidden. Restore it from dashboard with admin approval.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {showTargetWidget && (
          <div className="relative rounded-3xl border border-white/80 bg-white/88 p-5 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.6)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}target_progress`)}
                className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide daily target progress widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                <Target size={16} />
              </span>
              <h2 className="text-base font-extrabold text-slate-900">Daily Target Progress</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative h-36 w-36 rounded-full p-2" style={donutStyle(targetProgressClamped)}>
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-inner">
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Achieved</p>
                    <p className="text-2xl font-black text-cyan-800">{targetProgressClamped.toFixed(0)}%</p>
                  </div>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-slate-600">Daily Target</p>
                <p className="text-lg font-extrabold text-slate-900">{dailyTarget > 0 ? formatMoney(dailyTarget) : 'Not Set'}</p>
                <p className="text-slate-600">Remaining</p>
                <p className="text-base font-bold text-amber-700">{dailyTarget > 0 ? formatMoney(remainingToTarget) : '-'}</p>
                {targetProgress > 100 && (
                  <p className="text-xs font-semibold text-emerald-700">Over target by {formatMoney(activeSummary.collected - dailyTarget)}</p>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Daily target is derived from employee monthly target / days in current month.
            </p>
          </div>
          )}

          {showMixWidget && (
          <div className="relative rounded-3xl border border-white/80 bg-white/88 p-5 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.6)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}collection_mix`)}
                className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide collection mix widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <h2 className="text-base font-extrabold text-slate-900">Collection Mix (Donut)</h2>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-36 w-36 rounded-full p-2" style={mixDonut}>
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-inner">
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p>
                    <p className="text-sm font-black text-slate-900">{formatMoney(collectionMixTotal)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500"></span><span>Capital {capitalShare.toFixed(1)}%</span></div>
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-600"></span><span>Interest {interestShare.toFixed(1)}%</span></div>
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500"></span><span>Penalty {penaltyShare.toFixed(1)}%</span></div>
              </div>
            </div>
          </div>
          )}

          {showRouteWidget && (
          <div className="relative rounded-3xl border border-white/80 bg-white/88 p-5 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.6)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}route_bar_chart`)}
                className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide route bar chart widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <h2 className="text-base font-extrabold text-slate-900">Top Routes by Collection (Bar)</h2>
            <div className="mt-4">
              <RouteBarChart points={routeChart} />
            </div>
          </div>
          )}
        </div>

        {!showTargetWidget && !showMixWidget && !showRouteWidget && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            All analytic widgets are hidden. Restore them from dashboard with admin approval.
          </div>
        )}

        {showTransactionsTable && (
        <div className="relative rounded-3xl border border-cyan-100 bg-white/90 p-4 shadow-[0_24px_56px_-32px_rgba(14,116,144,0.5)] backdrop-blur-xl md:p-5">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}transactions_table`)}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide transactions table widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <h2 className="text-lg font-black tracking-tight text-slate-900">Today Collection Transactions</h2>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100 bg-white">
            <table className="min-w-full text-sm text-black">
              <thead className="bg-gradient-to-r from-cyan-50 to-sky-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Date & Time</th>
                  <th className="px-3 py-2 text-left font-semibold">Customer No</th>
                  <th className="px-3 py-2 text-left font-semibold">Customer</th>
                  <th className="px-3 py-2 text-left font-semibold">Field Officer</th>
                  <th className="px-3 py-2 text-left font-semibold">Route</th>
                  <th className="px-3 py-2 text-right font-semibold">Collected</th>
                  <th className="px-3 py-2 text-right font-semibold">Capital</th>
                  <th className="px-3 py-2 text-right font-semibold">Interest</th>
                  <th className="px-3 py-2 text-right font-semibold">Penalty</th>
                  <th className="px-3 py-2 text-left font-semibold">Payment Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-t border-cyan-50 hover:bg-cyan-50/40">
                    <td className="px-3 py-2">{formatDateTime(row.eventTime)}</td>
                    <td className="px-3 py-2">{row.customerNo}</td>
                    <td className="px-3 py-2">{row.customerName}</td>
                    <td className="px-3 py-2">{row.fieldOfficer}</td>
                    <td className="px-3 py-2">{row.routeName}</td>
                    <td className="px-3 py-2 text-right font-semibold text-cyan-800">{formatMoney(row.collected)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.capital)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.interest)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.penalty)}</td>
                    <td className="px-3 py-2">{row.paymentType}</td>
                    <td className="px-3 py-2">{row.reference}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-slate-600">
                      No collections found for selected scope today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {!showTransactionsTable && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Transactions table widget is hidden. Restore it from dashboard with admin approval.
          </div>
        )}
      </div>
    </div>
  );
}
