'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  PieChart,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';

type CompanyOption = { id: number; name: string };

type SectionRow = {
  key: string;
  label: string;
  total_due: number;
  total_received: number;
  outstanding: number;
  profit: number;
};

type BranchRow = {
  branch_id: number;
  branch_name: string;
  period_collected: number;
  period_profit: number;
  total_arrears: number;
  total_outstanding: number;
};

type SummaryRow = {
  total_due: number;
  total_received: number;
  outstanding: number;
  credit_profit: number;
  expense_total: number;
  net_profit: number;
};

type DonutSegment = {
  key: string;
  label: string;
  value: number;
  ratio: number;
  offset: number;
  color: string;
};

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(value: unknown): string {
  const amount = Number(value || 0);
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function toPolylinePoints(values: number[], width: number, height: number): string {
  if (!values.length) return '';
  const left = 20;
  const right = width - 12;
  const top = 12;
  const bottom = height - 18;
  const usableW = Math.max(right - left, 1);
  const usableH = Math.max(bottom - top, 1);
  const max = Math.max(...values, 1);

  return values
    .map((value, index) => {
      const x = left + (values.length === 1 ? usableW / 2 : (index / (values.length - 1)) * usableW);
      const y = bottom - (Math.max(value, 0) / max) * usableH;
      return `${x},${y}`;
    })
    .join(' ');
}

function toDonutSegments(rows: SectionRow[]): DonutSegment[] {
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9'];
  const values = rows.map((row) => Math.max(Number(row.total_received || 0), 0));
  const total = values.reduce((sum, value) => sum + value, 0);

  let running = 0;
  return rows.map((row, index) => {
    const value = values[index];
    const ratio = total > 0 ? value / total : 0;
    const segment: DonutSegment = {
      key: row.key,
      label: row.label,
      value,
      ratio,
      offset: running,
      color: colors[index % colors.length],
    };
    running += ratio;
    return segment;
  });
}

export default function TopManagementOverviewPage() {
  const router = useRouter();
  const apiBase = getApiBaseUrl();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromDate, setFromDate] = useState(monthStartIso);
  const [toDate, setToDate] = useState(todayIso);
  const [branchFilter, setBranchFilter] = useState<number | ''>('');
  const [branches, setBranches] = useState<CompanyOption[]>([]);

  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [topCollected, setTopCollected] = useState<BranchRow[]>([]);
  const [topRisk, setTopRisk] = useState<BranchRow[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (!stored) {
      router.push('/');
      return;
    }
    setToken(stored);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    const loadBranches = async () => {
      try {
        const response = await axios.get(`${apiBase}/companies`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        const rows = Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : [];
        setBranches(rows.map((item: { id: number; name: string }) => ({ id: Number(item.id), name: String(item.name || `Branch ${item.id}`) })));
      } catch {
        setBranches([]);
      }
    };

    loadBranches();
  }, [token, apiBase]);

  const loadReport = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      const response = await axios.get(`${apiBase}/reports/top-management-overview`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: {
          from_date: fromDate,
          to_date: toDate,
          branch_id: branchFilter || undefined,
        },
      });

      const payload = response.data || {};
      setSummary((payload.summary || null) as SummaryRow | null);
      setSections(Array.isArray(payload.sections) ? payload.sections : []);
      setTopCollected(Array.isArray(payload.top_collected_branches) ? payload.top_collected_branches : []);
      setTopRisk(Array.isArray(payload.top_risk_branches) ? payload.top_risk_branches : []);
    } catch (loadError: unknown) {
      setSummary(null);
      setSections([]);
      setTopCollected([]);
      setTopRisk([]);
      if (axios.isAxiosError(loadError)) {
        setError((typeof loadError.response?.data?.message === 'string' && loadError.response.data.message) || 'Failed to load top management overview.');
      } else {
        setError('Failed to load top management overview.');
      }
    } finally {
      setLoading(false);
    }
  }, [token, apiBase, fromDate, toDate, branchFilter]);

  useEffect(() => {
    if (!token) return;
    loadReport();
  }, [token, loadReport]);

  const maxCollected = useMemo(() => Math.max(...topCollected.map((row) => Number(row.period_collected || 0)), 1), [topCollected]);
  const maxRisk = useMemo(() => Math.max(...topRisk.map((row) => Number(row.total_arrears || 0)), 1), [topRisk]);

  const summarySafe = useMemo(
    () => ({
      total_due: Number(summary?.total_due || 0),
      total_received: Number(summary?.total_received || 0),
      outstanding: Number(summary?.outstanding || 0),
      credit_profit: Number(summary?.credit_profit || 0),
      expense_total: Number(summary?.expense_total || 0),
      net_profit: Number(summary?.net_profit || 0),
    }),
    [summary]
  );

  const ratios = useMemo(() => {
    const due = summarySafe.total_due;
    const received = summarySafe.total_received;
    const expenses = summarySafe.expense_total;
    const creditProfit = summarySafe.credit_profit;
    const riskArrears = topRisk.reduce((sum, row) => sum + Number(row.total_arrears || 0), 0);

    return {
      collectionRate: due > 0 ? (received / due) * 100 : 0,
      profitMargin: received > 0 ? (creditProfit / received) * 100 : 0,
      expenseRatio: received > 0 ? (expenses / received) * 100 : 0,
      outstandingRatio: due > 0 ? (summarySafe.outstanding / due) * 100 : 0,
      arrearsToOutstanding: summarySafe.outstanding > 0 ? (riskArrears / summarySafe.outstanding) * 100 : 0,
    };
  }, [summarySafe, topRisk]);

  const donutSegments = useMemo(() => toDonutSegments(sections), [sections]);

  const sectionBars = useMemo(() => {
    const max = Math.max(
      1,
      ...sections.map((row) => Math.max(Number(row.total_due || 0), Number(row.total_received || 0), Number(row.outstanding || 0)))
    );
    return sections.map((row) => ({
      ...row,
      dueWidth: (Number(row.total_due || 0) / max) * 100,
      receivedWidth: (Number(row.total_received || 0) / max) * 100,
      outstandingWidth: (Number(row.outstanding || 0) / max) * 100,
    }));
  }, [sections]);

  const lineChartData = useMemo(() => {
    const width = 780;
    const height = 220;
    return {
      width,
      height,
      due: toPolylinePoints(sections.map((row) => Number(row.total_due || 0)), width, height),
      received: toPolylinePoints(sections.map((row) => Number(row.total_received || 0)), width, height),
      outstanding: toPolylinePoints(sections.map((row) => Number(row.outstanding || 0)), width, height),
    };
  }, [sections]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-zinc-50 to-neutral-100">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-zinc-50 to-neutral-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-xl">
          <div className="bg-gradient-to-r from-slate-800 via-zinc-800 to-neutral-800 px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">Owner / CEO / Regional Managers</p>
                <h1 className="text-2xl font-extrabold">Top Management Overview</h1>
                <p className="mt-1 text-sm text-slate-200">Executive view: income, profit, expense, risk, and branch-level performance.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadReport}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/reports')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Reports Hub
                </button>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">From date</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black [color-scheme:light]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">To date</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black [color-scheme:light]" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">Branch scope</label>
                <select
                  value={branchFilter === '' ? '' : String(branchFilter)}
                  onChange={(e) => setBranchFilter(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black [color-scheme:light]"
                >
                  <option value="">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 lg:grid-cols-6 sm:p-6">
            {[
              { label: 'Total Due', value: money(summary?.total_due), icon: Wallet, color: 'text-slate-900' },
              { label: 'Received', value: money(summary?.total_received), icon: TrendingUp, color: 'text-emerald-700' },
              { label: 'Outstanding', value: money(summary?.outstanding), icon: TrendingDown, color: 'text-amber-700' },
              { label: 'Credit Profit', value: money(summary?.credit_profit), icon: Building2, color: 'text-cyan-700' },
              { label: 'Branch Expenses', value: money(summary?.expense_total), icon: TrendingDown, color: 'text-rose-700' },
              { label: 'Net Profit', value: money(summary?.net_profit), icon: Wallet, color: Number(summary?.net_profit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700' },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                    <Icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <p className={`mt-1 text-base font-extrabold tabular-nums sm:text-lg ${card.color}`}>{loading ? '—' : card.value}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3 lg:grid-cols-5 sm:p-6">
            {[
              { label: 'Collection Efficiency', value: percent(ratios.collectionRate), color: 'text-emerald-700' },
              { label: 'Profit Margin', value: percent(ratios.profitMargin), color: 'text-cyan-700' },
              { label: 'Expense Ratio', value: percent(ratios.expenseRatio), color: 'text-rose-700' },
              { label: 'Outstanding Ratio', value: percent(ratios.outstandingRatio), color: 'text-amber-700' },
              { label: 'Arrears / Outstanding', value: percent(ratios.arrearsToOutstanding), color: 'text-fuchsia-700' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                <p className={`mt-0.5 text-lg font-extrabold tabular-nums ${item.color}`}>{loading ? '—' : item.value}</p>
              </div>
            ))}
          </div>

          {!loading && sections.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 border-b border-slate-200 p-4 xl:grid-cols-5 sm:p-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-3">
                <div className="mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-slate-900">Due vs Received vs Outstanding (By Product)</h3>
                </div>
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${lineChartData.width} ${lineChartData.height}`} className="h-[220px] min-w-[560px] w-full">
                    <line x1="20" y1="202" x2="768" y2="202" stroke="#cbd5e1" strokeWidth="1" />
                    <line x1="20" y1="12" x2="20" y2="202" stroke="#cbd5e1" strokeWidth="1" />
                    {[0.25, 0.5, 0.75].map((value) => {
                      const y = 202 - value * 190;
                      return <line key={`grid-${value}`} x1="20" y1={y} x2="768" y2={y} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="1" />;
                    })}

                    <polyline points={lineChartData.due} fill="none" stroke="#334155" strokeWidth="3" className="chart-line-draw" />
                    <polyline points={lineChartData.received} fill="none" stroke="#10b981" strokeWidth="3" className="chart-line-draw delay-1" />
                    <polyline points={lineChartData.outstanding} fill="none" stroke="#f59e0b" strokeWidth="3" className="chart-line-draw delay-2" />

                    {sections.map((row, index) => {
                      const x = 20 + (sections.length === 1 ? 374 : (index / (sections.length - 1)) * 748);
                      return (
                        <text key={`lbl-${row.key}`} x={x} y="216" textAnchor="middle" className="fill-slate-600 text-[11px] font-semibold">
                          {row.label}
                        </text>
                      );
                    })}
                  </svg>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-slate-700"><span className="h-2.5 w-2.5 rounded-full bg-slate-700" />Due</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Received (Income)</span>
                  <span className="inline-flex items-center gap-1.5 text-amber-700"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Outstanding (Risk)</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
                <div className="mb-3 flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-slate-900">Income Share by Product</h3>
                </div>
                <div className="flex flex-col items-center gap-3 md:flex-row md:items-start md:justify-center">
                  <svg viewBox="0 0 180 180" className="h-40 w-40">
                    <circle cx="90" cy="90" r="56" fill="none" stroke="#e2e8f0" strokeWidth="24" />
                    {donutSegments.map((segment) => (
                      <circle
                        key={segment.key}
                        cx="90"
                        cy="90"
                        r="56"
                        fill="none"
                        stroke={segment.color}
                        strokeWidth="24"
                        strokeDasharray={`${Math.max(segment.ratio * 351.86, 0)} 351.86`}
                        strokeDashoffset={`${-(segment.offset * 351.86)}`}
                        strokeLinecap="butt"
                        transform="rotate(-90 90 90)"
                        className="chart-donut-segment"
                      />
                    ))}
                    <text x="90" y="86" textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold uppercase">Income</text>
                    <text x="90" y="102" textAnchor="middle" className="fill-slate-900 text-[13px] font-bold">Mix</text>
                  </svg>

                  <div className="w-full space-y-1.5">
                    {donutSegments.map((segment) => (
                      <div key={`legend-${segment.key}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                          {segment.label}
                        </span>
                        <span className="font-bold text-slate-900">{percent(segment.ratio * 100)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Top Branches by Collections</h3>
              <div className="mt-3 space-y-3">
                {topCollected.length === 0 ? (
                  <p className="text-xs text-slate-500">No branch collections available for selected period.</p>
                ) : (
                  topCollected.map((row) => {
                    const width = Math.max(5, Math.min(100, (Number(row.period_collected || 0) / maxCollected) * 100));
                    return (
                      <div key={row.branch_id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-700">{row.branch_name}</span>
                          <span className="font-bold text-emerald-700">{money(row.period_collected)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-emerald-100">
                          <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-700" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Top Risk Branches (Arrears)</h3>
              <div className="mt-3 space-y-3">
                {topRisk.length === 0 ? (
                  <p className="text-xs text-slate-500">No arrears hotspots in selected scope.</p>
                ) : (
                  topRisk.map((row) => {
                    const width = Math.max(5, Math.min(100, (Number(row.total_arrears || 0) / maxRisk) * 100));
                    return (
                      <div key={row.branch_id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-700">{row.branch_name}</span>
                          <span className="font-bold text-rose-700">{money(row.total_arrears)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-rose-100">
                          <div className="h-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-700" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <h3 className="text-sm font-bold text-slate-900">Product Performance Bars</h3>
              <div className="mt-3 space-y-4">
                {sectionBars.length === 0 ? (
                  <p className="text-xs text-slate-500">No product data to display.</p>
                ) : (
                  sectionBars.map((row) => (
                    <div key={`bars-${row.key}`}>
                      <p className="mb-1 text-xs font-semibold text-slate-700">{row.label}</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] font-semibold text-slate-500">Due</span>
                          <div className="h-2 flex-1 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-slate-700 transition-all duration-700" style={{ width: `${Math.max(row.dueWidth, 4)}%` }} />
                          </div>
                          <span className="w-24 text-right text-[11px] font-bold text-slate-700">{money(row.total_due)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] font-semibold text-slate-500">Received</span>
                          <div className="h-2 flex-1 rounded-full bg-emerald-100">
                            <div className="h-2 rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.max(row.receivedWidth, 4)}%` }} />
                          </div>
                          <span className="w-24 text-right text-[11px] font-bold text-emerald-700">{money(row.total_received)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-24 text-[11px] font-semibold text-slate-500">Outstanding</span>
                          <div className="h-2 flex-1 rounded-full bg-amber-100">
                            <div className="h-2 rounded-full bg-amber-500 transition-all duration-700" style={{ width: `${Math.max(row.outstandingWidth, 4)}%` }} />
                          </div>
                          <span className="w-24 text-right text-[11px] font-bold text-amber-700">{money(row.outstanding)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-200 p-4 sm:grid-cols-2 sm:p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Product Summary</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-700">
                    <tr>
                      <th className="px-2 py-2 text-left">Section</th>
                      <th className="px-2 py-2 text-right">Due</th>
                      <th className="px-2 py-2 text-right">Received</th>
                      <th className="px-2 py-2 text-right">Outstanding</th>
                      <th className="px-2 py-2 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sections.map((row) => (
                      <tr key={row.key}>
                        <td className="px-2 py-2 font-semibold text-slate-700">{row.label}</td>
                        <td className="px-2 py-2 text-right text-slate-700">{money(row.total_due)}</td>
                        <td className="px-2 py-2 text-right text-emerald-700">{money(row.total_received)}</td>
                        <td className="px-2 py-2 text-right text-amber-700">{money(row.outstanding)}</td>
                        <td className="px-2 py-2 text-right font-bold text-cyan-700">{money(row.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Risk Watchlist</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-700">
                    <tr>
                      <th className="px-2 py-2 text-left">Branch</th>
                      <th className="px-2 py-2 text-right">Arrears</th>
                      <th className="px-2 py-2 text-right">Outstanding</th>
                      <th className="px-2 py-2 text-right">Period Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topRisk.map((row) => (
                      <tr key={`risk-${row.branch_id}`}>
                        <td className="px-2 py-2 font-semibold text-slate-700">{row.branch_name}</td>
                        <td className="px-2 py-2 text-right font-bold text-rose-700">{money(row.total_arrears)}</td>
                        <td className="px-2 py-2 text-right text-amber-700">{money(row.total_outstanding)}</td>
                        <td className="px-2 py-2 text-right text-cyan-700">{money(row.period_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {topRisk.length === 0 ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  No high-risk branches for this period.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <style jsx>{`
          .chart-line-draw {
            stroke-dasharray: 1200;
            stroke-dashoffset: 1200;
            animation: drawLine 1.2s ease forwards;
          }

          .chart-line-draw.delay-1 {
            animation-delay: 0.12s;
          }

          .chart-line-draw.delay-2 {
            animation-delay: 0.24s;
          }

          .chart-donut-segment {
            opacity: 0;
            animation: showArc 0.8s ease forwards;
          }

          @keyframes drawLine {
            to {
              stroke-dashoffset: 0;
            }
          }

          @keyframes showArc {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
