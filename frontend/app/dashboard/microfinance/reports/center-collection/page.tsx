'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type LoanRow = {
  id: number;
  loan_code?: string | null;
  customer_no?: string | null;
  customer_name?: string | null;
  field_officer?: string | null;
  center?: {
    id?: number | null;
    name?: string | null;
    code?: string | null;
  } | null;
};

type CollectionRow = {
  id: number;
  mf_loan_request_id: number | string;
  collection_date?: string | null;
  created_at?: string | null;
  collected_amount?: number | string;
  capital_amount?: number | string;
  interest_amount?: number | string;
  penalty_amount?: number | string;
  payment_type?: string | null;
  payment_reference?: string | null;
};

type AuthUser = {
  name?: string | null;
  email?: string | null;
  designation?: {
    name?: string | null;
  } | null;
  roles?: Array<{
    name?: string | null;
  }>;
};

type ReportRow = {
  id: number;
  date: string;
  loanCode: string;
  customerNo: string;
  customerName: string;
  centerId: number | null;
  centerName: string;
  centerCode: string;
  fieldOfficer: string;
  collected: number;
  capital: number;
  interest: number;
  penalty: number;
  paymentType: string;
  reference: string;
};

const API_BASE = getApiBaseUrl();

export default function CenterCollectionReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchId = searchParams.get('branch_id') || '';

  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [centerFilter, setCenterFilter] = useState('all');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
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
        const [loanRes, collectionRes] = await Promise.all([
          axios.get(`${API_BASE}/microfinance/loan-requests`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            params: {
              branch_id: branchId,
            },
          }),
          axios.get(`${API_BASE}/microfinance/collections`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            params: {
              branch_id: branchId,
            },
          }),
        ]);

        const loans: LoanRow[] = Array.isArray(loanRes.data) ? loanRes.data : [];
        const collections: CollectionRow[] = Array.isArray(collectionRes.data) ? collectionRes.data : [];

        const loanMap = new Map<number, LoanRow>();
        loans.forEach((loan) => {
          loanMap.set(Number(loan.id), loan);
        });

        const mapped: ReportRow[] = collections
          .map((collection) => {
            const loanId = Number(collection.mf_loan_request_id || 0);
            const loan = loanMap.get(loanId);
            const centerId = Number(loan?.center?.id || 0) || null;

            return {
              id: Number(collection.id),
              date: String(collection.collection_date || collection.created_at || ''),
              loanCode: String(loan?.loan_code || `LR-${loanId || 0}`),
              customerNo: String(loan?.customer_no || '-'),
              customerName: String(loan?.customer_name || '-'),
              centerId,
              centerName: String(loan?.center?.name || 'Unassigned Center'),
              centerCode: String(loan?.center?.code || '-'),
              fieldOfficer: String(loan?.field_officer || 'Unassigned'),
              collected: Number(collection.collected_amount || 0),
              capital: Number(collection.capital_amount || 0),
              interest: Number(collection.interest_amount || 0),
              penalty: Number(collection.penalty_amount || 0),
              paymentType: String(collection.payment_type || '-').replace('_', ' '),
              reference: String(collection.payment_reference || '-'),
            };
          })
          .sort((a, b) => {
            const aTime = new Date(a.date).getTime();
            const bTime = new Date(b.date).getTime();
            return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
          });

        setRows(mapped);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [token, branchId]);

  const centerOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    rows.forEach((row) => {
      const value = row.centerId ? String(row.centerId) : `name:${row.centerName}`;
      const label = row.centerCode && row.centerCode !== '-' ? `${row.centerName} (${row.centerCode})` : row.centerName;
      if (!map.has(value)) {
        map.set(value, { value, label });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const officerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.fieldOfficer))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return rows.filter((row) => {
      const rowDate = row.date ? new Date(row.date) : null;
      const rowDay = row.date ? String(row.date).slice(0, 10) : '';

      if (dateFilter) {
        if (rowDay !== dateFilter) {
          return false;
        }
      } else {
        if (from && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate < from) {
          return false;
        }

        if (to && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate > to) {
          return false;
        }
      }

      if (centerFilter !== 'all') {
        const centerValue = row.centerId ? String(row.centerId) : `name:${row.centerName}`;
        if (centerValue !== centerFilter) {
          return false;
        }
      }

      if (officerFilter !== 'all') {
        if (row.fieldOfficer.toLowerCase() !== officerFilter) {
          return false;
        }
      }

      return true;
    });
  }, [rows, dateFilter, fromDate, toDate, centerFilter, officerFilter]);

  const summary = useMemo(() => {
    const totals = filteredRows.reduce(
      (acc, row) => {
        acc.collected += row.collected;
        acc.capital += row.capital;
        acc.interest += row.interest;
        acc.penalty += row.penalty;
        return acc;
      },
      { collected: 0, capital: 0, interest: 0, penalty: 0 }
    );

    const uniqueCenters = new Set(filteredRows.map((row) => row.centerId || row.centerName));
    const uniqueOfficers = new Set(filteredRows.map((row) => row.fieldOfficer));

    return {
      ...totals,
      transactionCount: filteredRows.length,
      centerCount: uniqueCenters.size,
      officerCount: uniqueOfficers.size,
    };
  }, [filteredRows]);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(value || 0);

  const formatDateTime = (value: string) => {
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
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    router.push('/');
  };

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_15%,rgba(14,165,233,0.24),transparent_36%),radial-gradient(circle_at_88%_12%,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_70%_90%,rgba(59,130,246,0.14),transparent_34%),linear-gradient(155deg,#ecfeff_0%,#eff6ff_45%,#f0fdfa_100%)] p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-10 top-16 h-56 w-56 rounded-full bg-cyan-300/40 blur-3xl"></div>
        <div className="absolute right-0 top-8 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-300/30 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        <nav className="relative z-10 rounded-2xl border border-white/20 bg-white/80 p-3 shadow-lg backdrop-blur-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500">
                <span className="text-sm font-bold text-white">DOF</span>
              </div>
              <h1 className="max-w-[220px] truncate bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-base font-bold text-transparent sm:max-w-none sm:text-xl">
                Desk of Finance
              </h1>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard/microfinance')}
                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                Back to Microfinance
              </button>

              <div className="hidden items-center space-x-2 text-xs text-gray-600 sm:flex sm:text-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                <span>System Online</span>
              </div>

              <div className="hidden items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-left sm:flex">
                <div className="leading-tight">
                  <p className="max-w-[220px] truncate text-xs font-semibold text-slate-900">{displayName}</p>
                  <p className="truncate text-[11px] text-slate-500">{roleName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-cyan-600 hover:to-blue-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_28px_70px_-36px_rgba(2,132,199,0.45)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">
                Reports Desk
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Center Collection Report</h1>
              <p className="text-sm text-slate-600">Collection details filtered by center, field officer, and date window.</p>
            </div>
            <button
              onClick={() => router.back()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back
            </button>
          </div>

          <div className="mt-5 h-1.5 w-44 rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-500"></div>
        </div>

        <div className="rounded-3xl border border-cyan-100 bg-white/90 p-5 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] backdrop-blur-xl">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-black">Center</label>
              <select
                value={centerFilter}
                onChange={(event) => setCenterFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black"
              >
                <option value="all">All Centers</option>
                {centerOptions.map((center) => (
                  <option key={center.value} value={center.value}>
                    {center.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-black">Field Officer</label>
              <select
                value={officerFilter}
                onChange={(event) => setOfficerFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black"
              >
                <option value="all">All Field Officers</option>
                {officerOptions.map((officer) => (
                  <option key={officer} value={officer.toLowerCase()}>
                    {officer}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-black">Exact Date</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black placeholder:text-black"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-black">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black placeholder:text-black"
                disabled={Boolean(dateFilter)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-black">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black placeholder:text-black"
                disabled={Boolean(dateFilter)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Transactions" value={String(summary.transactionCount)} accent="text-slate-900" />
          <SummaryCard label="Centers" value={String(summary.centerCount)} accent="text-cyan-700" />
          <SummaryCard label="Field Officers" value={String(summary.officerCount)} accent="text-blue-700" />
          <SummaryCard label="Collected" value={formatMoney(summary.collected)} accent="text-emerald-700" />
          <SummaryCard label="Capital" value={formatMoney(summary.capital)} accent="text-slate-900" />
          <SummaryCard label="Interest + Penalty" value={formatMoney(summary.interest + summary.penalty)} accent="text-orange-700" />
        </div>

        <div className="rounded-3xl border border-cyan-100 bg-white/90 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] backdrop-blur-xl">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-lg font-semibold text-slate-900">Center Collection Details</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Date & Time</Th>
                  <Th>Center</Th>
                  <Th>Field Officer</Th>
                  <Th>Loan Code</Th>
                  <Th>Customer No</Th>
                  <Th>Customer</Th>
                  <Th>Payment Type</Th>
                  <Th>Reference</Th>
                  <Th align="right">Collected</Th>
                  <Th align="right">Capital</Th>
                  <Th align="right">Interest</Th>
                  <Th align="right">Penalty</Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={12}>
                      Loading center collection report...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={12}>
                      No collection records found for selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-cyan-50/40">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(row.date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {row.centerName}
                        {row.centerCode && row.centerCode !== '-' ? ` (${row.centerCode})` : ''}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.fieldOfficer}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.loanCode}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.customerNo}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.customerName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.paymentType}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.reference}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">{formatMoney(row.collected)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatMoney(row.capital)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatMoney(row.interest)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatMoney(row.penalty)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

type ThProps = {
  children: ReactNode;
  align?: 'left' | 'right';
};

function Th({ children, align = 'left' }: ThProps) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

type SummaryCardProps = {
  label: string;
  value: string;
  accent?: string;
};

function SummaryCard({ label, value, accent = 'text-slate-900' }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-white via-cyan-50/60 to-sky-50/70 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}
