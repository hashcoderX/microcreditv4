'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarRange,
  Download,
  HandCoins,
  Layers,
  Search,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';

type FinanceRow = {
  id: number;
  finance_type?: string | null;
  product_type?: string | null;
  asset_reference?: string | null;
  financed_amount?: number | string | null;
  amount?: number | string | null;
  total_paid_amount?: number | string | null;
  balance_amount?: number | string | null;
  arrears?: number | string | null;
  due_amount?: number | string | null;
  due_date?: string | null;
  installment_amount?: number | string | null;
  installment_frequency?: string | null;
  tenure_months?: number | string | null;
  interest_rate?: number | string | null;
  status?: string | null;
  created_at?: string | null;
  repayment_plan?: {
    installments?: Array<{ amount?: number | string | null }>;
  } | null;
  vehicle_details?: {
    vehicle_no?: string | null;
  } | null;
  customer?: {
    customer_code?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    nic_passport?: string | null;
  } | null;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatAmount(value: unknown): string {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getFinancedAmount(row: FinanceRow): number {
  const value = toNumber(row.financed_amount ?? row.amount);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function computeInstallmentCount(row: FinanceRow): number {
  const tenure = Number(row.tenure_months || 0);
  const frequency = String(row.installment_frequency || 'monthly').toLowerCase();
  const installmentsPerYear =
    frequency === 'daily'
      ? 365
      : frequency === 'weekly'
        ? 52
        : frequency === 'quarterly'
          ? 4
          : frequency === 'yearly'
            ? 1
            : 12;

  return Math.max(1, Math.round((tenure / 12) * installmentsPerYear));
}

function getTotalRefundableValue(row: FinanceRow): number {
  const installments = row.repayment_plan?.installments;
  if (Array.isArray(installments) && installments.length > 0) {
    const plannedTotal = installments.reduce((sum, item) => {
      const amount = toNumber(item?.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    if (plannedTotal > 0) return plannedTotal;
  }

  const installment = toNumber(row.installment_amount);
  if (Number.isFinite(installment) && installment > 0) {
    return installment * computeInstallmentCount(row);
  }

  return getFinancedAmount(row);
}

function getCollectedAmount(row: FinanceRow): number {
  const paid = toNumber(row.total_paid_amount);
  if (Number.isFinite(paid) && paid > 0) return paid;

  const financed = getFinancedAmount(row);
  const balance = toNumber(row.balance_amount);
  if (Number.isFinite(balance) && financed > 0) {
    return Math.max(financed - balance, 0);
  }

  return 0;
}

function getOutstandingAmount(row: FinanceRow): number {
  const balance = toNumber(row.balance_amount);
  if (Number.isFinite(balance) && balance >= 0) return balance;

  const refundable = getTotalRefundableValue(row);
  const collected = getCollectedAmount(row);
  return Math.max(refundable - collected, 0);
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, headers: string[], data: Array<Array<string>>) {
  const csv = [headers, ...data].map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const inputClass =
  'w-full rounded-xl border border-cyan-200/80 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200/80 placeholder:text-slate-400 [color-scheme:light]';

export default function FinanceCollectionReportPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinanceRow[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'with' | 'without'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);

    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      try {
        setAuthUser(JSON.parse(rawUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const fetchRows = async () => {
      setLoading(true);
      try {
        const allRows: FinanceRow[] = [];
        let page = 1;
        let lastPage = 1;

        do {
          const response = await fetch(`/api/finances?per_page=500&page=${page}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });

          if (!response.ok) {
            setRows([]);
            return;
          }

          const payload = await response.json();
          const data = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
              ? payload
              : [];

          allRows.push(...(data as FinanceRow[]));
          lastPage = Number(payload?.last_page || 1);
          page += 1;
        } while (page <= lastPage);

        setRows(allRows);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchRows();
  }, [token]);

  const productOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => String(r.product_type || '').trim()).filter((v) => v !== '')))
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const normalizedRows = useMemo(() => {
    return rows.map((row) => {
      const financed = getFinancedAmount(row);
      const refundable = getTotalRefundableValue(row);
      const collected = getCollectedAmount(row);
      const outstanding = getOutstandingAmount(row);
      const arrears = Math.max(0, Number(row.arrears || 0));
      const collectionRate = refundable > 0 ? (collected / refundable) * 100 : 0;

      return {
        ...row,
        financed,
        refundable,
        collected,
        outstanding,
        arrears,
        collectionRate,
      };
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return normalizedRows.filter((row) => {
      if (statusFilter !== 'all' && String(row.status || '').toLowerCase() !== statusFilter) return false;
      if (productFilter !== 'all' && String(row.product_type || '').toLowerCase() !== productFilter) return false;

      if (collectionFilter === 'with' && row.collected <= 0) return false;
      if (collectionFilter === 'without' && row.collected > 0) return false;

      if (from || to) {
        const created = row.created_at ? new Date(String(row.created_at)) : null;
        if (!created || Number.isNaN(created.getTime())) return false;
        if (from && created < from) return false;
        if (to && created > to) return false;
      }

      if (!q) return true;
      const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim();
      const haystack = [
        row.id,
        row.product_type || '',
        row.finance_type || '',
        row.status || '',
        row.customer?.customer_code || '',
        row.customer?.phone || '',
        row.customer?.nic_passport || '',
        row.vehicle_details?.vehicle_no || '',
        row.asset_reference || '',
        customerName,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [normalizedRows, search, statusFilter, productFilter, collectionFilter, fromDate, toDate]);

  const metrics = useMemo(() => {
    const totalAccounts = filteredRows.length;
    const withCollection = filteredRows.filter((row) => row.collected > 0).length;
    const totalFinanced = filteredRows.reduce((sum, row) => sum + row.financed, 0);
    const totalRefundable = filteredRows.reduce((sum, row) => sum + row.refundable, 0);
    const totalCollected = filteredRows.reduce((sum, row) => sum + row.collected, 0);
    const totalOutstanding = filteredRows.reduce((sum, row) => sum + row.outstanding, 0);
    const totalArrears = filteredRows.reduce((sum, row) => sum + row.arrears, 0);
    const collectionRate = totalRefundable > 0 ? (totalCollected / totalRefundable) * 100 : 0;

    return {
      totalAccounts,
      withCollection,
      totalFinanced,
      totalRefundable,
      totalCollected,
      totalOutstanding,
      totalArrears,
      collectionRate,
    };
  }, [filteredRows]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setProductFilter('all');
    setCollectionFilter('all');
    setFromDate('');
    setToDate('');
  };

  const exportCsv = () => {
    const headers = [
      'Finance ID',
      'Customer Code',
      'Customer Name',
      'Product',
      'Status',
      'Financed',
      'Refundable Target',
      'Collected',
      'Outstanding',
      'Arrears',
      'Collection Rate %',
      'Due Amount',
      'Due Date',
      'Vehicle No',
      'Created At',
    ];

    const data = filteredRows.map((row) => [
      String(row.id),
      String(row.customer?.customer_code || '-'),
      `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || '-',
      String(row.product_type || '-'),
      String(row.status || '-'),
      formatAmount(row.financed),
      formatAmount(row.refundable),
      formatAmount(row.collected),
      formatAmount(row.outstanding),
      formatAmount(row.arrears),
      row.collectionRate.toFixed(2),
      formatAmount(row.due_amount),
      formatDate(row.due_date),
      String(row.vehicle_details?.vehicle_no || '-'),
      formatDate(row.created_at),
    ]);

    downloadCsv('finance-collection-report.csv', headers, data);
  };

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <nav className="rounded-2xl border border-white/20 bg-white/80 p-3 shadow-lg backdrop-blur-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500">
                <span className="text-sm font-bold text-white">DOF</span>
              </div>
              <h1 className="max-w-[220px] truncate bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-base font-bold text-transparent sm:max-w-none sm:text-xl">
                Desk of Finance
              </h1>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard/reports')}
                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                <ArrowLeft className="mr-1 inline-block h-3.5 w-3.5" />
                Back to Reports
              </button>
              <div className="hidden items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-left sm:flex">
                <div className="leading-tight">
                  <p className="max-w-[220px] truncate text-xs font-semibold text-slate-900">{displayName}</p>
                  <p className="truncate text-[11px] text-slate-500">{roleName}</p>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <div className="rounded-3xl border border-white/80 bg-white/95 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 px-6 py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                  <HandCoins className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">Finance Management</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Finance Collection Report</h1>
                  <p className="text-sm text-cyan-50/95 mt-1 max-w-2xl">
                    Separate report view with collection-focused filters, summary totals, and finance-level collection details.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-cyan-100 border-t border-cyan-100/80 bg-cyan-50/40">
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Accounts</p>
              <p className="text-xs font-bold text-slate-900 tabular-nums">{metrics.totalAccounts}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Total Collected</p>
              <p className="text-xs font-bold text-emerald-700 tabular-nums truncate">{formatAmount(metrics.totalCollected)}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Outstanding</p>
              <p className="text-xs font-bold text-amber-700 tabular-nums truncate">{formatAmount(metrics.totalOutstanding)}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Collection Rate</p>
              <p className="text-xs font-bold text-cyan-700 tabular-nums">{metrics.collectionRate.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-cyan-100 bg-white/95 shadow-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Report filters</p>
              <p className="text-xs text-slate-500 mt-0.5">Filter and validate finance collection details with focused criteria.</p>
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Clear filters
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
            <div className="xl:col-span-3 relative min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, phone, ID, NIC, product..."
                className={`${inputClass} pl-10`}
              />
            </div>

            <div className="xl:col-span-2 min-w-0">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="pending_approval">Pending approval</option>
                <option value="settled">Settled</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="xl:col-span-2 min-w-0">
              <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className={inputClass}>
                <option value="all">All products</option>
                {productOptions.map((p) => (
                  <option key={p} value={p.toLowerCase()}>{p}</option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2 min-w-0">
              <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value as 'all' | 'with' | 'without')} className={inputClass}>
                <option value="all">All collection state</option>
                <option value="with">With collections</option>
                <option value="without">No collections yet</option>
              </select>
            </div>

            <div className="xl:col-span-3 min-w-0 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200/80 bg-cyan-50/30 px-3 py-2">
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <CalendarRange className="h-4 w-4 text-cyan-700" />
                <span className="text-xs font-semibold text-slate-600">Created</span>
              </div>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={`${inputClass} py-2 w-auto min-w-[140px] flex-1`}
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={`${inputClass} py-2 w-auto min-w-[140px] flex-1`}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="rounded-2xl border border-cyan-100 bg-white/95 p-3.5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">With collections</p>
            <p className="mt-1 text-sm font-bold text-cyan-700 tabular-nums">{metrics.withCollection}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white/95 p-3.5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Total financed</p>
            <p className="mt-1 text-sm font-bold text-emerald-700 tabular-nums truncate">{formatAmount(metrics.totalFinanced)}</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white/95 p-3.5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Refundable target</p>
            <p className="mt-1 text-sm font-bold text-blue-700 tabular-nums truncate">{formatAmount(metrics.totalRefundable)}</p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white/95 p-3.5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Collected</p>
            <p className="mt-1 text-sm font-bold text-indigo-700 tabular-nums truncate">{formatAmount(metrics.totalCollected)}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-white/95 p-3.5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Outstanding</p>
            <p className="mt-1 text-sm font-bold text-amber-700 tabular-nums truncate">{formatAmount(metrics.totalOutstanding)}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-white/95 p-3.5 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Arrears</p>
            <p className="mt-1 text-sm font-bold text-rose-700 tabular-nums truncate">{formatAmount(metrics.totalArrears)}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-cyan-100 bg-white/95 shadow-lg p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-900">Finance collection details</p>
            <p className="text-xs text-slate-500">{filteredRows.length} records</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-cyan-100">
            <table className="min-w-full text-sm text-left text-slate-700 bg-white">
              <thead className="bg-cyan-50/70 text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">Finance</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Product</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Financed</th>
                  <th className="px-3 py-2 font-semibold">Refundable</th>
                  <th className="px-3 py-2 font-semibold">Collected</th>
                  <th className="px-3 py-2 font-semibold">Outstanding</th>
                  <th className="px-3 py-2 font-semibold">Arrears</th>
                  <th className="px-3 py-2 font-semibold">Rate</th>
                  <th className="px-3 py-2 font-semibold">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-slate-500">
                      No finance collection data found for selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || '-';
                    const status = String(row.status || '-');

                    return (
                      <tr key={row.id} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40">
                        <td className="px-3 py-2 font-semibold text-slate-900">#{row.id}</td>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">{customerName}</div>
                          <div className="text-xs text-slate-500">{row.customer?.customer_code || '-'} / {row.customer?.phone || '-'}</div>
                        </td>
                        <td className="px-3 py-2">{row.product_type || '-'}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{formatAmount(row.financed)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatAmount(row.refundable)}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-emerald-700">{formatAmount(row.collected)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatAmount(row.outstanding)}</td>
                        <td className="px-3 py-2 tabular-nums text-rose-700">{formatAmount(row.arrears)}</td>
                        <td className="px-3 py-2 tabular-nums">{row.collectionRate.toFixed(2)}%</td>
                        <td className="px-3 py-2">{formatDate(row.due_date)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 text-xs text-slate-700">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-cyan-700 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Accuracy note</p>
              <p className="mt-0.5">
                Collection Rate is calculated as Collected / Refundable Target. Refundable Target is derived from repayment plan installments when available,
                otherwise estimated from installment amount and term count.
              </p>
            </div>
          </div>
        </div>

        <div className="pb-4" />
      </div>
    </div>
  );
}
