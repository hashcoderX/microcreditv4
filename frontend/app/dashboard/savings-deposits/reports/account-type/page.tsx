'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, Filter, Layers3 } from 'lucide-react';

type AccountTypeRow = {
  account_type: string;
  accounts_count: number;
  total_transactions: number;
  deposit_transactions: number;
  withdrawal_transactions: number;
  total_deposits: number;
  total_withdrawals: number;
  net_movement: number;
};

type ReportSummary = {
  account_types_count: number;
  accounts_touched: number;
  total_transactions: number;
  total_deposits: number;
  total_withdrawals: number;
  net_movement: number;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(value: unknown): string {
  return toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function titleCase(value: unknown): string {
  return String(value || '-')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

const filterFieldClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 [color-scheme:light]';

export default function SavingsAccountTypeReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchId = Number(searchParams.get('branch_id') || 0) || undefined;

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [accountType, setAccountType] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const [summary, setSummary] = useState<ReportSummary>({
    account_types_count: 0,
    accounts_touched: 0,
    total_transactions: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    net_movement: 0,
  });
  const [rows, setRows] = useState<AccountTypeRow[]>([]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const fetchReport = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await axios.get('/api/savings-accounts/reports/account-type', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        params: {
          branch_id: branchId,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          account_type: accountType === 'all' ? undefined : accountType,
          status: status === 'all' ? undefined : status,
          search: search.trim() || undefined,
        },
      });

      const payload = response.data || {};
      setSummary({
        account_types_count: Number(payload.summary?.account_types_count || 0),
        accounts_touched: Number(payload.summary?.accounts_touched || 0),
        total_transactions: Number(payload.summary?.total_transactions || 0),
        total_deposits: toNumber(payload.summary?.total_deposits),
        total_withdrawals: toNumber(payload.summary?.total_withdrawals),
        net_movement: toNumber(payload.summary?.net_movement),
      });
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    } catch {
      setSummary({
        account_types_count: 0,
        accounts_touched: 0,
        total_transactions: 0,
        total_deposits: 0,
        total_withdrawals: 0,
        net_movement: 0,
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, branchId]);

  const applyFilters = () => {
    void fetchReport();
  };

  const resetFilters = () => {
    setFromDate('');
    setToDate('');
    setAccountType('all');
    setStatus('all');
    setSearch('');
    setTimeout(() => {
      void fetchReport();
    }, 0);
  };

  const exportCsv = () => {
    const headers = [
      'Account Type',
      'Accounts Count',
      'Total Transactions',
      'Deposit Transactions',
      'Withdrawal Transactions',
      'Total Deposits',
      'Total Withdrawals',
      'Net Movement',
    ];

    const records = rows.map((row) => [
      titleCase(row.account_type),
      String(row.accounts_count),
      String(row.total_transactions),
      String(row.deposit_transactions),
      String(row.withdrawal_transactions),
      amount(row.total_deposits),
      amount(row.total_withdrawals),
      amount(row.net_movement),
    ]);

    const csv = [headers, ...records].map((line) => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'savings-account-type-report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-amber-50 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-yellow-300 blur-3xl"></div>
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-orange-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-300 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        <div className="bg-white/85 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(146,64,14,0.45)] p-6 md:p-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-700 border border-orange-100">
                Savings Reports
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Account Type Report</h1>
              <p className="text-sm text-slate-600 mt-1">Analyze transactions and net movement by savings account type.</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={exportCsv}
                className="px-4 py-2 rounded-xl bg-white hover:bg-orange-50 text-orange-800 text-sm font-semibold border border-orange-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold border border-slate-200 shadow-sm inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Reports Hub
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/90 border border-orange-100 shadow-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account Types</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{summary.account_types_count}</p>
            </div>
            <div className="rounded-xl bg-white/90 border border-orange-100 shadow-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts Touched</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{summary.accounts_touched}</p>
            </div>
            <div className="rounded-xl bg-white/90 border border-orange-100 shadow-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Transactions</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{summary.total_transactions}</p>
            </div>
            <div className="rounded-xl bg-white/90 border border-orange-100 shadow-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Deposits</p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">{amount(summary.total_deposits)}</p>
            </div>
            <div className="rounded-xl bg-white/90 border border-orange-100 shadow-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Withdrawals</p>
              <p className="text-2xl font-extrabold text-rose-700 mt-1">{amount(summary.total_withdrawals)}</p>
            </div>
            <div className="rounded-xl bg-white/90 border border-orange-100 shadow-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net Movement</p>
              <p className={`text-2xl font-extrabold mt-1 ${summary.net_movement >= 0 ? 'text-cyan-700' : 'text-rose-700'}`}>
                {amount(summary.net_movement)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-orange-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-orange-700" />
            <h3 className="text-sm font-bold text-slate-900">Filter Report</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={filterFieldClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={filterFieldClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Account Type</label>
              <select value={accountType} onChange={(e) => setAccountType(e.target.value)} className={filterFieldClass}>
                <option value="all" className="text-slate-900">All account types</option>
                <option value="savings" className="text-slate-900">Savings</option>
                <option value="current" className="text-slate-900">Current</option>
                <option value="fixed_deposit" className="text-slate-900">Fixed Deposit</option>
                <option value="investment" className="text-slate-900">Investment</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={filterFieldClass}>
                <option value="all" className="text-slate-900">All statuses</option>
                <option value="active" className="text-slate-900">Active</option>
                <option value="dormant" className="text-slate-900">Dormant</option>
                <option value="closed" className="text-slate-900">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Account no / customer"
                className={filterFieldClass}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-orange-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Layers3 className="h-4 w-4 text-orange-700" />
            <h3 className="text-sm font-bold text-slate-900">Breakdown by Account Type</h3>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
              Loading report...
            </div>
          ) : !hasRows ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
              No report data found for selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left text-slate-700">
                <thead>
                  <tr className="border-b border-orange-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Account Type</th>
                    <th className="py-2 pr-3 text-right">Accounts</th>
                    <th className="py-2 pr-3 text-right">Transactions</th>
                    <th className="py-2 pr-3 text-right">Deposit Txn</th>
                    <th className="py-2 pr-3 text-right">Withdrawal Txn</th>
                    <th className="py-2 pr-3 text-right">Total Deposits</th>
                    <th className="py-2 pr-3 text-right">Total Withdrawals</th>
                    <th className="py-2 pr-0 text-right">Net Movement</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.account_type} className="border-b border-orange-50">
                      <td className="py-2 pr-3 font-semibold text-slate-900">{titleCase(row.account_type)}</td>
                      <td className="py-2 pr-3 text-right">{row.accounts_count}</td>
                      <td className="py-2 pr-3 text-right">{row.total_transactions}</td>
                      <td className="py-2 pr-3 text-right">{row.deposit_transactions}</td>
                      <td className="py-2 pr-3 text-right">{row.withdrawal_transactions}</td>
                      <td className="py-2 pr-3 text-right text-emerald-700 font-semibold">{amount(row.total_deposits)}</td>
                      <td className="py-2 pr-3 text-right text-rose-700 font-semibold">{amount(row.total_withdrawals)}</td>
                      <td className={`py-2 pr-0 text-right font-semibold ${row.net_movement >= 0 ? 'text-cyan-700' : 'text-rose-700'}`}>
                        {amount(row.net_movement)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
