'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';
import { ArrowLeft, Building2, PieChart, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

type CompanyOption = { id: number; name: string };

type SectionRow = {
  key: string;
  label: string;
  total_due: number;
  total_received: number;
  outstanding: number;
  profit: number;
};

type SummaryRow = {
  total_due: number;
  total_received: number;
  outstanding: number;
  profit: number;
};

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(value: unknown): string {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function metricMax(rows: SectionRow[]): number {
  if (!rows.length) return 1;
  const maxValue = Math.max(
    ...rows.map((row) => Math.max(Number(row.total_due || 0), Number(row.total_received || 0), Number(row.outstanding || 0), Number(row.profit || 0)))
  );
  return maxValue > 0 ? maxValue : 1;
}

function toPolylinePoints(rows: SectionRow[], accessor: (row: SectionRow) => number, width: number, height: number): string {
  if (!rows.length) return '';
  const max = metricMax(rows);
  const left = 28;
  const right = width - 16;
  const top = 14;
  const bottom = height - 24;
  const usableW = Math.max(right - left, 1);
  const usableH = Math.max(bottom - top, 1);

  return rows
    .map((row, index) => {
      const x = left + (rows.length === 1 ? usableW / 2 : (index / (rows.length - 1)) * usableW);
      const y = bottom - (Math.max(accessor(row), 0) / max) * usableH;
      return `${x},${y}`;
    })
    .join(' ');
}

function donutSegments(rows: SectionRow[]) {
  const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e'];
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.total_received || 0)), 0);
  if (total <= 0) {
    return rows.map((row, index) => ({
      key: row.key,
      label: row.label,
      value: 0,
      ratio: 0,
      color: colors[index % colors.length],
      offsetRatio: 0,
    }));
  }

  let runningRatio = 0;
  return rows.map((row, index) => {
    const value = Math.max(0, Number(row.total_received || 0));
    const ratio = value / total;
    const segment = {
      key: row.key,
      label: row.label,
      value,
      ratio,
      color: colors[index % colors.length],
      offsetRatio: runningRatio,
    };
    runningRatio += ratio;
    return segment;
  });
}

export default function OverallCreditSummaryPage() {
  const router = useRouter();
  const apiBase = getApiBaseUrl();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(monthStartIso);
  const [toDate, setToDate] = useState(todayIso);
  const [branchFilter, setBranchFilter] = useState<number | ''>('');
  const [branches, setBranches] = useState<CompanyOption[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [animateCharts, setAnimateCharts] = useState(false);

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
    try {
      const response = await axios.get(`${apiBase}/reports/overall-credit-summary`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: {
          from_date: fromDate,
          to_date: toDate,
          branch_id: branchFilter || undefined,
        },
      });

      const rows = Array.isArray(response.data?.sections) ? response.data.sections : [];
      setSections(rows as SectionRow[]);
      setSummary((response.data?.summary || null) as SummaryRow | null);
      setRange({
        from: String(response.data?.from_date || fromDate),
        to: String(response.data?.to_date || toDate),
      });
    } catch {
      setSections([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [token, apiBase, fromDate, toDate, branchFilter]);

  useEffect(() => {
    if (!token) return;
    loadReport();
  }, [token, loadReport]);

  useEffect(() => {
    if (loading || sections.length === 0) {
      setAnimateCharts(false);
      return;
    }

    const timer = window.setTimeout(() => setAnimateCharts(true), 80);
    return () => window.clearTimeout(timer);
  }, [loading, sections]);

  const cards = useMemo(() => {
    return [
      { label: 'Total Amount Due', value: money(summary?.total_due), icon: Wallet, color: 'text-indigo-700' },
      { label: 'Total Amount Received', value: money(summary?.total_received), icon: TrendingUp, color: 'text-emerald-700' },
      { label: 'Outstanding Amount', value: money(summary?.outstanding), icon: TrendingDown, color: 'text-amber-700' },
      { label: 'Profit', value: money(summary?.profit), icon: Building2, color: 'text-cyan-700' },
    ];
  }, [summary]);

  const lineChartData = useMemo(() => {
    const width = 920;
    const height = 250;
    return {
      width,
      height,
      duePoints: toPolylinePoints(sections, (row) => Number(row.total_due || 0), width, height),
      receivedPoints: toPolylinePoints(sections, (row) => Number(row.total_received || 0), width, height),
      outstandingPoints: toPolylinePoints(sections, (row) => Number(row.outstanding || 0), width, height),
    };
  }, [sections]);

  const donutData = useMemo(() => donutSegments(sections), [sections]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50/30 to-cyan-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-3xl border border-white/80 bg-white/90 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-cyan-700 px-6 py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-100">Business Owner View</p>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Overall Credit Summary</h1>
                <p className="text-sm text-indigo-50 mt-1">
                  Micro Finance, Finance, and Mortgage performance summary
                  {range.from && range.to ? ` (${range.from} to ${range.to})` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/reports')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={loadReport}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 border-b border-indigo-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">From date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm text-black [color-scheme:light]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">To date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm text-black [color-scheme:light]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Branch</label>
                <select
                  value={branchFilter === '' ? '' : String(branchFilter)}
                  onChange={(e) => setBranchFilter(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm text-black [color-scheme:light]"
                >
                  <option value="">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 sm:p-6 border-b border-indigo-100">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-indigo-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                    <Icon className="h-4 w-4 text-indigo-500" />
                  </div>
                  <p className={`mt-1 text-lg sm:text-xl font-extrabold tabular-nums ${card.color}`}>
                    {loading ? '—' : card.value}
                  </p>
                </div>
              );
            })}
          </div>

          {!loading && sections.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 p-4 sm:p-6 border-b border-indigo-100">
              <div className="xl:col-span-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Line Graph</p>
                    <h3 className="text-base font-bold text-slate-900">Due vs Received vs Outstanding</h3>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${lineChartData.width} ${lineChartData.height}`} className="min-w-[620px] w-full h-[250px]">
                    <line x1="28" y1="20" x2="28" y2="226" stroke="#cbd5e1" strokeWidth="1" />
                    <line x1="28" y1="226" x2="904" y2="226" stroke="#cbd5e1" strokeWidth="1" />

                    {[0.25, 0.5, 0.75].map((t) => {
                      const y = 226 - t * 206;
                      return <line key={`grid-${t}`} x1="28" y1={y} x2="904" y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 4" />;
                    })}

                    <polyline
                      points={lineChartData.duePoints}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="3"
                      className={animateCharts ? 'chart-line-draw' : ''}
                    />
                    <polyline
                      points={lineChartData.receivedPoints}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      className={animateCharts ? 'chart-line-draw delay-1' : ''}
                    />
                    <polyline
                      points={lineChartData.outstandingPoints}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      className={animateCharts ? 'chart-line-draw delay-2' : ''}
                    />

                    {sections.map((row, index) => {
                      const x = 28 + (sections.length === 1 ? 438 : (index / (sections.length - 1)) * 876);
                      return (
                        <text key={`label-${row.key}`} x={x} y="246" textAnchor="middle" className="fill-slate-600 text-[11px] font-semibold">
                          {row.label}
                        </text>
                      );
                    })}
                  </svg>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-indigo-700"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />Total Due</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Total Received</span>
                  <span className="inline-flex items-center gap-1.5 text-amber-700"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Outstanding</span>
                </div>
              </div>

              <div className="xl:col-span-2 rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-cyan-50/40 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Donut Chart</p>
                    <h3 className="text-base font-bold text-slate-900">Received Share by Section</h3>
                  </div>
                  <PieChart className="h-5 w-5 text-cyan-600" />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <svg viewBox="0 0 220 220" className="h-[210px] w-[210px]">
                    <circle cx="110" cy="110" r="70" fill="none" stroke="#e2e8f0" strokeWidth="24" />
                    {donutData.map((segment, index) => {
                      const circumference = 2 * Math.PI * 70;
                      const dash = Math.max(segment.ratio * circumference, 0);
                      const gap = Math.max(circumference - dash, 0);
                      const dashArray = `${dash} ${gap}`;
                      const dashOffset = -segment.offsetRatio * circumference;
                      return (
                        <circle
                          key={segment.key}
                          cx="110"
                          cy="110"
                          r="70"
                          fill="none"
                          stroke={segment.color}
                          strokeWidth="24"
                          strokeDasharray={dashArray}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="butt"
                          transform="rotate(-90 110 110)"
                          className={animateCharts ? `donut-segment delay-${index % 3}` : ''}
                        />
                      );
                    })}
                    <text x="110" y="108" textAnchor="middle" className="fill-slate-900 text-[13px] font-bold">Received</text>
                    <text x="110" y="126" textAnchor="middle" className="fill-slate-700 text-[14px] font-extrabold">{money(summary?.total_received)}</text>
                  </svg>

                  <div className="w-full space-y-2">
                    {donutData.map((segment) => (
                      <div key={`legend-${segment.key}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white/80 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                          <span className="text-sm font-semibold text-slate-800">{segment.label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">{money(segment.value)}</p>
                          <p className="text-xs text-slate-500">{(segment.ratio * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="p-4 sm:p-6">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-indigo-50" />
                ))}
              </div>
            ) : sections.length === 0 ? (
              <p className="text-center py-10 text-slate-600 font-medium">No summary data for selected period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-indigo-900 border-b-2 border-indigo-200">
                      <th className="py-3 pr-3">Section</th>
                      <th className="py-3 pr-3 text-right">Total Amount Due</th>
                      <th className="py-3 pr-3 text-right">Total Amount Received</th>
                      <th className="py-3 pr-3 text-right">Outstanding Amount</th>
                      <th className="py-3 pr-3 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-50">
                    {sections.map((row) => (
                      <tr key={row.key} className="hover:bg-indigo-50/40">
                        <td className="py-3 pr-3 font-semibold text-slate-900">{row.label}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{money(row.total_due)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-emerald-700 font-semibold">{money(row.total_received)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-amber-700 font-semibold">{money(row.outstanding)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-cyan-700 font-semibold">{money(row.profit)}</td>
                      </tr>
                    ))}
                    {summary && sections.length > 1 ? (
                      <tr className="bg-indigo-100/70 font-bold">
                        <td className="py-3 pr-3 text-slate-900">TOTAL</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{money(summary.total_due)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-emerald-800">{money(summary.total_received)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-amber-800">{money(summary.outstanding)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums text-cyan-800">{money(summary.profit)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
      <style jsx global>{`
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
        .donut-segment {
          transform-origin: 110px 110px;
          animation: donutIn 0.9s ease both;
        }
        .donut-segment.delay-0 {
          animation-delay: 0.05s;
        }
        .donut-segment.delay-1 {
          animation-delay: 0.16s;
        }
        .donut-segment.delay-2 {
          animation-delay: 0.27s;
        }
        @keyframes drawLine {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes donutIn {
          from {
            opacity: 0;
            transform: rotate(-90deg) scale(0.96);
          }
          to {
            opacity: 1;
            transform: rotate(-90deg) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
