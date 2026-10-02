'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';
import { ArrowLeft, Building2, Download, Filter, RefreshCw, TrendingDown, Wallet } from 'lucide-react';

type CompanyOption = { id: number; name: string };

type BranchSummaryRow = {
  branch_id: number;
  branch_name: string;
  expense_count: number;
  total_amount: number;
};

type CategorySummaryRow = {
  category: string;
  expense_count: number;
  total_amount: number;
};

type PaymentSummaryRow = {
  payment_method: string;
  expense_count: number;
  total_amount: number;
};

type ExpenseRow = {
  id: number;
  expense_date: string;
  title: string;
  category: string;
  amount: number;
  payment_method: string;
  reference_no?: string | null;
  notes?: string | null;
  company?: { id: number; name: string; currency?: string | null } | null;
};

type ReportPayload = {
  summary?: {
    expense_count?: number;
    total_amount?: number;
    branch_count?: number;
  };
  branch_summary?: BranchSummaryRow[];
  category_summary?: CategorySummaryRow[];
  payment_summary?: PaymentSummaryRow[];
  expenses?: ExpenseRow[];
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

function categoryLabel(value: string): string {
  if (!value) return 'Other';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function paymentLabel(value: string): string {
  if (!value) return 'Cash';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function AllBranchExpensesPage() {
  const router = useRouter();
  const apiBase = getApiBaseUrl();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<CompanyOption[]>([]);
  const [fromDate, setFromDate] = useState(monthStartIso);
  const [toDate, setToDate] = useState(todayIso);
  const [branchFilter, setBranchFilter] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const [summary, setSummary] = useState({ expense_count: 0, total_amount: 0, branch_count: 0 });
  const [branchSummary, setBranchSummary] = useState<BranchSummaryRow[]>([]);
  const [categorySummary, setCategorySummary] = useState<CategorySummaryRow[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummaryRow[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<ExpenseRow[]>([]);

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
      const response = await axios.get(`${apiBase}/reports/all-branch-expenses`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: {
          from_date: fromDate,
          to_date: toDate,
          branch_id: branchFilter || undefined,
          search: search.trim() || undefined,
        },
      });

      const payload: ReportPayload = response.data || {};
      setSummary({
        expense_count: Number(payload.summary?.expense_count || 0),
        total_amount: Number(payload.summary?.total_amount || 0),
        branch_count: Number(payload.summary?.branch_count || 0),
      });
      setBranchSummary(Array.isArray(payload.branch_summary) ? payload.branch_summary : []);
      setCategorySummary(Array.isArray(payload.category_summary) ? payload.category_summary : []);
      setPaymentSummary(Array.isArray(payload.payment_summary) ? payload.payment_summary : []);
      setRecentExpenses(Array.isArray(payload.expenses) ? payload.expenses.slice(0, 12) : []);
    } catch (loadError: unknown) {
      setSummary({ expense_count: 0, total_amount: 0, branch_count: 0 });
      setBranchSummary([]);
      setCategorySummary([]);
      setPaymentSummary([]);
      setRecentExpenses([]);

      if (axios.isAxiosError(loadError)) {
        setError((typeof loadError.response?.data?.message === 'string' && loadError.response.data.message) || 'Failed to load all-branch expenses report.');
      } else {
        setError('Failed to load all-branch expenses report.');
      }
    } finally {
      setLoading(false);
    }
  }, [token, apiBase, fromDate, toDate, branchFilter, search]);

  useEffect(() => {
    if (!token) return;
    loadReport();
  }, [token, loadReport]);

  const maxBranchAmount = useMemo(() => {
    if (!branchSummary.length) return 1;
    return Math.max(...branchSummary.map((row) => Number(row.total_amount || 0)), 1);
  }, [branchSummary]);

  const exportCsv = () => {
    const header = ['Branch', 'Expense Count', 'Total Amount'];
    const rows = branchSummary.map((row) => [row.branch_name, String(row.expense_count), money(row.total_amount)]);
    const csv = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'all-branch-expenses-summary.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-rose-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50/60 to-amber-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-xl">
          <div className="bg-gradient-to-r from-rose-700 via-orange-700 to-amber-700 px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-100">Top Management View</p>
                <h1 className="text-2xl font-extrabold">All Branch Expense Report</h1>
                <p className="mt-1 text-sm text-rose-50">Compare expense performance across every branch in one report.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={branchSummary.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
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
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/reports')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Reports Hub
                </button>
              </div>
            </div>
          </div>

          <div className="border-b border-rose-100 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">From date</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-black [color-scheme:light]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">To date</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-black [color-scheme:light]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Branch</label>
                <select
                  value={branchFilter === '' ? '' : String(branchFilter)}
                  onChange={(e) => setBranchFilter(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-black [color-scheme:light]"
                >
                  <option value="">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">Search</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Title, notes, reference"
                    className="w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-black"
                  />
                  <button
                    type="button"
                    onClick={loadReport}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="px-6 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

          <div className="grid grid-cols-2 gap-3 border-b border-rose-100 p-4 sm:grid-cols-4 sm:p-6">
            {[
              { label: 'Total Expenses', value: money(summary.total_amount), icon: TrendingDown, color: 'text-rose-700' },
              { label: 'Expense Count', value: String(summary.expense_count), icon: Wallet, color: 'text-slate-900' },
              { label: 'Branches Covered', value: String(summary.branch_count), icon: Building2, color: 'text-cyan-700' },
              {
                label: 'Average Expense',
                value: summary.expense_count > 0 ? money(summary.total_amount / summary.expense_count) : money(0),
                icon: Wallet,
                color: 'text-amber-700',
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-rose-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                    <Icon className="h-4 w-4 text-rose-500" />
                  </div>
                  <p className={`mt-1 text-lg font-extrabold tabular-nums ${card.color}`}>{loading ? '—' : card.value}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-5 sm:p-6">
            <div className="rounded-2xl border border-rose-100 bg-white p-4 sm:col-span-3">
              <h3 className="text-sm font-bold text-slate-900">Branch Expense Comparison</h3>
              <div className="mt-3 space-y-3">
                {branchSummary.length === 0 ? (
                  <p className="text-xs text-slate-500">No branch expense data for selected filters.</p>
                ) : (
                  branchSummary.map((row) => {
                    const widthPercent = Math.max(6, Math.min(100, (Number(row.total_amount || 0) / maxBranchAmount) * 100));
                    return (
                      <div key={row.branch_id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-700">{row.branch_name}</span>
                          <span className="font-bold text-rose-700">{money(row.total_amount)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-rose-100">
                          <div className="h-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-700" style={{ width: `${widthPercent}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-white p-4 sm:col-span-2">
              <h3 className="text-sm font-bold text-slate-900">Category Mix</h3>
              <div className="mt-3 space-y-2">
                {categorySummary.length === 0 ? (
                  <p className="text-xs text-slate-500">No category data.</p>
                ) : (
                  categorySummary.map((row) => (
                    <div key={row.category} className="flex items-center justify-between rounded-xl border border-rose-100 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{categoryLabel(row.category)}</span>
                      <span className="font-bold text-rose-700">{money(row.total_amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-rose-100 p-4 sm:grid-cols-2 sm:p-6">
            <div className="rounded-2xl border border-rose-100 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Payment Method Split</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-rose-50 text-[10px] uppercase tracking-wider text-slate-700">
                    <tr>
                      <th className="px-2 py-2 text-left">Method</th>
                      <th className="px-2 py-2 text-right">Count</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {paymentSummary.map((row) => (
                      <tr key={row.payment_method}>
                        <td className="px-2 py-2 font-semibold text-slate-700">{paymentLabel(row.payment_method)}</td>
                        <td className="px-2 py-2 text-right text-slate-700">{Number(row.expense_count || 0)}</td>
                        <td className="px-2 py-2 text-right font-bold text-rose-700">{money(row.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Recent Expense Records</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-rose-50 text-[10px] uppercase tracking-wider text-slate-700">
                    <tr>
                      <th className="px-2 py-2 text-left">Date</th>
                      <th className="px-2 py-2 text-left">Branch</th>
                      <th className="px-2 py-2 text-left">Title</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {recentExpenses.map((row) => (
                      <tr key={row.id}>
                        <td className="px-2 py-2 text-slate-700">{formatDate(row.expense_date)}</td>
                        <td className="px-2 py-2 text-slate-700">{row.company?.name || '—'}</td>
                        <td className="px-2 py-2">
                          <p className="font-semibold text-slate-700">{row.title}</p>
                          <p className="text-[10px] text-slate-500">{categoryLabel(row.category)}</p>
                        </td>
                        <td className="px-2 py-2 text-right font-bold text-rose-700">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
