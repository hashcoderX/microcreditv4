'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';

type SmsLogRow = {
  id: number;
  branchId: number | null;
  userId: number | null;
  module: string;
  reference: string;
  customerName: string;
  phone: string;
  message: string;
  status: 'sent' | 'failed' | string;
  errorMessage: string;
  providerStatusCode: number | null;
  providerResponse: string;
  sentAt: string | null;
};

type SmsReportResponse = {
  summary?: {
    total?: number;
    sent?: number;
    failed?: number;
    success_rate?: number;
  };
  module_options?: string[];
  rows?: SmsLogRow[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = () => {
  const now = new Date();
  now.setDate(1);
  return now.toISOString().slice(0, 10);
};

const formatDateTime = (value: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const truncate = (value: string, length = 120) => {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length)}...` : text;
};

export default function SmsCommunicationReportPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SmsLogRow[]>([]);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [fromDate, setFromDate] = useState(monthStartIso());
  const [toDate, setToDate] = useState(todayIso());
  const [moduleOptions, setModuleOptions] = useState<string[]>([]);

  const [summary, setSummary] = useState({
    total: 0,
    sent: 0,
    failed: 0,
    successRate: 0,
  });

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
    setError('');
    try {
      const response = await axios.get<SmsReportResponse>('/api/reports/sms-communications', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        params: {
          status: statusFilter,
          module: moduleFilter === 'all' ? undefined : moduleFilter,
          phone: phoneFilter.trim() || undefined,
          q: searchText.trim() || undefined,
          from_date: fromDate,
          to_date: toDate,
          limit: 500,
        },
      });

      const data = response.data || {};
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setModuleOptions(Array.isArray(data.module_options) ? data.module_options : []);
      setSummary({
        total: Number(data.summary?.total || 0),
        sent: Number(data.summary?.sent || 0),
        failed: Number(data.summary?.failed || 0),
        successRate: Number(data.summary?.success_rate || 0),
      });
    } catch (fetchError: unknown) {
      const message =
        axios.isAxiosError(fetchError) && typeof fetchError.response?.data?.message === 'string'
          ? fetchError.response.data.message
          : 'Failed to load SMS communication report.';
      setError(message);
      setRows([]);
      setSummary({ total: 0, sent: 0, failed: 0, successRate: 0 });
      setModuleOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter, moduleFilter, fromDate, toDate]);

  const filteredRows = useMemo(() => {
    const phone = phoneFilter.trim().toLowerCase();
    const q = searchText.trim().toLowerCase();

    return rows.filter((row) => {
      if (phone && !String(row.phone || '').toLowerCase().includes(phone)) {
        return false;
      }

      if (q) {
        const haystack = [
          row.module,
          row.reference,
          row.customerName,
          row.phone,
          row.message,
          row.errorMessage,
          row.providerResponse,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [rows, phoneFilter, searchText]);

  const downloadCsv = () => {
    const headers = [
      'Sent At',
      'Status',
      'Module',
      'Reference',
      'Customer',
      'Phone',
      'Message',
      'Error',
      'Provider Status Code',
      'Provider Response',
    ];

    const body = filteredRows.map((row) => [
      formatDateTime(row.sentAt),
      row.status,
      row.module,
      row.reference,
      row.customerName,
      row.phone,
      row.message,
      row.errorMessage,
      row.providerStatusCode ?? '',
      row.providerResponse,
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sms-communication-report-${todayIso()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-100 flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-100 p-5 md:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-3xl border border-cyan-100 bg-white/90 p-5 shadow-[0_18px_45px_-28px_rgba(8,145,178,0.45)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-800">
                Communication
              </p>
              <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900">SMS Sending Records</h1>
              <p className="mt-1 text-sm text-slate-600">
                Track sent and failed SMS records with module, reference, and provider error details.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadCsv}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  void fetchReport();
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard/reports')}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Reports Hub
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Records</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Sent</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-800">{summary.sent}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
            <p className="text-xs uppercase tracking-wide text-rose-700">Failed</p>
            <p className="mt-1 text-2xl font-extrabold text-rose-800">{summary.failed}</p>
          </div>
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
            <p className="text-xs uppercase tracking-wide text-cyan-700">Success Rate</p>
            <p className="mt-1 text-2xl font-extrabold text-cyan-800">{summary.successRate.toFixed(2)}%</p>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-100 bg-white/90 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'sent' | 'failed')}
                className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
              >
                <option value="all">All</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Module</label>
              <select
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
              >
                <option value="all">All Modules</option>
                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {moduleName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
              <input
                value={phoneFilter}
                onChange={(event) => setPhoneFilter(event.target.value)}
                placeholder="Filter by phone"
                className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Reference, customer, message, error"
                className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                void fetchReport();
              }}
              className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setModuleFilter('all');
                setPhoneFilter('');
                setSearchText('');
                setFromDate(monthStartIso());
                setToDate(todayIso());
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-100 bg-white/95">
          <table className="min-w-full text-sm text-left text-slate-700">
            <thead className="bg-cyan-50 text-slate-800">
              <tr>
                <th className="px-3 py-2 font-semibold">Sent At</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Module</th>
                <th className="px-3 py-2 font-semibold">Reference</th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Phone</th>
                <th className="px-3 py-2 font-semibold">Message</th>
                <th className="px-3 py-2 font-semibold">Failure Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Loading SMS records...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No SMS records found for selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-cyan-100 align-top last:border-b-0 hover:bg-cyan-50/40">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.sentAt)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                          row.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.module || '-'}</td>
                    <td className="px-3 py-2">{row.reference || '-'}</td>
                    <td className="px-3 py-2">{row.customerName || '-'}</td>
                    <td className="px-3 py-2">{row.phone || '-'}</td>
                    <td className="px-3 py-2 max-w-[260px]">
                      <p className="break-words" title={row.message}>{truncate(row.message, 140)}</p>
                    </td>
                    <td className="px-3 py-2 max-w-[320px]">
                      {row.status === 'failed' ? (
                        <div className="space-y-1 text-xs text-rose-700">
                          <p className="font-semibold">{row.errorMessage || 'Failed without provider message'}</p>
                          {row.providerStatusCode !== null ? <p>HTTP: {row.providerStatusCode}</p> : null}
                          {row.providerResponse ? (
                            <p className="break-words" title={row.providerResponse}>
                              {truncate(row.providerResponse, 170)}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-700">Delivered to gateway</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
