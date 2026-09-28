'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type OutstandingRow = {
  loanId: number;
  loanCode: string;
  customerNo: string;
  customerName: string;
  fieldOfficer: string;
  status: string;
  loanAmount: number;
  refundableAmount: number;
  collectedAmount: number;
  paidTodayAmount: number;
  outstandingAmount: number;
  arrearsAmount: number;
  dueDate: string;
  nextPaymentDate: string;
};

type ReportResponse = {
  rows?: OutstandingRow[];
  officer_options?: string[];
};

const API_BASE = getApiBaseUrl();
const isUnauthorizedError = (error: unknown): boolean =>
  axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403);

export default function OutstandingCustomersReportPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OutstandingRow[]>([]);
  const [keyword, setKeyword] = useState('');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'released' | 'completed'>('all');
  const [officerOptions, setOfficerOptions] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const widgetPrefix = 'mf_outstanding_customers_widget_';

  const handleUnauthorized = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    router.replace('/');
  };

  const fetchWidgetPreferences = async (authToken: string) => {
    try {
      const response = await axios.get(`${API_BASE}/dashboard/widgets`, {
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
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
        return;
      }
      setHiddenWidgetKeys(new Set());
    }
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        `${API_BASE}/dashboard/widgets`,
        { widget_key: widgetKey, is_visible: isVisible },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorized();
      }
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
      setWidgetNotice({
        open: true,
        title: 'Widget Update Failed',
        message: 'Failed to hide this widget. Please try again.',
      });
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
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadReport = async () => {
      setLoading(true);
      try {
        const response = await axios.get<ReportResponse>(`${API_BASE}/reports/outstanding-customers`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          params: {
            status: statusFilter,
            q: keyword.trim() || undefined,
          },
        });

        const nextRows = Array.isArray(response.data?.rows) ? response.data.rows : [];
        const optionsFromRows = Array.from(
          new Set(nextRows.map((row) => (String(row.fieldOfficer || '').trim() || 'Unassigned')))
        ).sort((a, b) => a.localeCompare(b));

        setRows(nextRows);
        if (Array.isArray(response.data?.officer_options) && response.data.officer_options.length > 0) {
          setOfficerOptions(response.data.officer_options);
        } else {
          setOfficerOptions(optionsFromRows);
        }
      } catch (error) {
        if (isUnauthorizedError(error)) {
          handleUnauthorized();
          return;
        }
        setRows([]);
        setOfficerOptions([]);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [token, statusFilter, keyword]);

  const filteredRows = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      if (officerFilter !== 'all' && row.fieldOfficer.toLowerCase() !== officerFilter) {
        return false;
      }

      if (!search) return true;
      const haystack = [row.loanCode, row.customerNo, row.customerName, row.fieldOfficer].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }, [rows, keyword, officerFilter]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.customers += 1;
        acc.loanAmount += row.loanAmount;
        acc.refundable += row.refundableAmount;
        acc.collected += row.collectedAmount;
        acc.outstanding += row.outstandingAmount;
        acc.arrears += row.arrearsAmount;
        return acc;
      },
      {
        customers: 0,
        loanAmount: 0,
        refundable: 0,
        collected: 0,
        outstanding: 0,
        arrears: 0,
      }
    );
  }, [filteredRows]);

  const formatMoney = (value: number) => Number(value || 0).toFixed(2);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, officerFilter, statusFilter, pageSize, rows.length]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize, totalPages]);

  const pageStart = filteredRows.length === 0 ? 0 : (Math.min(currentPage, totalPages) - 1) * pageSize + 1;
  const pageEnd = Math.min(Math.min(currentPage, totalPages) * pageSize, filteredRows.length);

  const formatDate = (value: string) => {
    if (!value || value === '-') return '-';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;

    return new Intl.DateTimeFormat('en-LK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(parsed);
  };

  const getReportFileDate = () => new Date().toISOString().slice(0, 10);

  const handleDownloadCsv = () => {
    const headers = [
      'Loan Code',
      'Customer No',
      'Customer Name',
      'Field Officer',
      'Status',
      'Loan Amount',
      'Refundable Amount',
      'Collected Amount',
      'Outstanding Amount',
      'Arrears Amount',
      'Due Date',
      'Next Payment Date',
    ];

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const body = filteredRows.map((row) => [
      row.loanCode,
      row.customerNo,
      row.customerName,
      row.fieldOfficer,
      row.status,
      formatMoney(row.loanAmount),
      formatMoney(row.refundableAmount),
      formatMoney(row.collectedAmount),
      formatMoney(row.outstandingAmount),
      formatMoney(row.arrearsAmount),
      formatDate(row.dueDate),
      formatDate(row.nextPaymentDate),
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `outstanding-customer-report-${getReportFileDate()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleDownloadPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const generatedAt = new Intl.DateTimeFormat('en-LK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());

    const officerText = officerFilter === 'all' ? 'Officer: All' : `Officer: ${officerFilter}`;
    const statusText = `Status: ${statusFilter === 'all' ? 'All' : statusFilter}`;
    const keywordText = keyword.trim() ? `Search: ${keyword.trim()}` : 'Search: -';

    doc.setFontSize(16);
    doc.text('Outstanding Customer Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`${officerText} | ${statusText} | ${keywordText} | Generated: ${generatedAt}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [[
        'Loan Code',
        'Customer No',
        'Customer Name',
        'Field Officer',
        'Status',
        'Loan',
        'Refundable',
        'Collected',
        'Outstanding',
        'Arrears',
        'Due Date',
        'Next Payment',
      ]],
      body: filteredRows.map((row) => [
        row.loanCode,
        row.customerNo,
        row.customerName,
        row.fieldOfficer,
        row.status,
        formatMoney(row.loanAmount),
        formatMoney(row.refundableAmount),
        formatMoney(row.collectedAmount),
        formatMoney(row.outstandingAmount),
        formatMoney(row.arrearsAmount),
        formatDate(row.dueDate),
        formatDate(row.nextPaymentDate),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [244, 63, 94],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [255, 241, 242],
      },
      margin: { left: 24, right: 24, top: 72, bottom: 24 },
      theme: 'striped',
    });

    doc.save(`outstanding-customer-report-${getReportFileDate()}.pdf`);
  };

  const summaryCards = [
    {
      key: `${widgetPrefix}summary_customers`,
      label: 'Customers',
      value: String(summary.customers),
      tone: 'text-rose-700',
      boxClass: 'border-rose-100 bg-rose-50/70',
    },
    {
      key: `${widgetPrefix}summary_outstanding`,
      label: 'Outstanding',
      value: formatMoney(summary.outstanding),
      tone: 'text-amber-700',
      boxClass: 'border-amber-100 bg-amber-50/70',
    },
    {
      key: `${widgetPrefix}summary_arrears`,
      label: 'Arrears',
      value: formatMoney(summary.arrears),
      tone: 'text-orange-700',
      boxClass: 'border-orange-100 bg-orange-50/70',
    },
    {
      key: `${widgetPrefix}summary_collected`,
      label: 'Collected',
      value: formatMoney(summary.collected),
      tone: 'text-emerald-700',
      boxClass: 'border-emerald-100 bg-emerald-50/70',
    },
  ];
  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showFilterSection = !hiddenWidgetKeys.has(`${widgetPrefix}filters_section`);
  const showTableSection = !hiddenWidgetKeys.has(`${widgetPrefix}table_section`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-100 p-5 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-rose-100 bg-white/85 p-5 shadow-[0_20px_50px_-30px_rgba(190,24,93,0.4)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
                Report Center
              </p>
              <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900">Outstanding Customer Report</h1>
              <p className="mt-1 text-sm text-slate-600">Customers with outstanding loan balances and unpaid installments.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={loading || filteredRows.length === 0}
                className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={loading || filteredRows.length === 0}
                className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Back
              </button>
            </div>
          </div>
        </div>

        {showFilterSection && (
        <div className="relative rounded-3xl border border-rose-100 bg-white/85 p-5 backdrop-blur-xl shadow-[0_18px_45px_-28px_rgba(190,24,93,0.35)]">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters_section`)}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide filters widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Loan code, customer no, customer name"
                className="mt-1 w-full rounded-xl border border-rose-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Field Officer</label>
              <select
                value={officerFilter}
                onChange={(e) => setOfficerFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-rose-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-rose-200"
              >
                <option value="all">All Officers</option>
                {officerOptions.map((officer) => (
                  <option key={officer} value={officer.toLowerCase()}>
                    {officer}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'approved' | 'released' | 'completed')}
                className="mt-1 w-full rounded-xl border border-rose-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-rose-200"
              >
                <option value="all">All Status</option>
                <option value="approved">Approved</option>
                <option value="released">Released</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setOfficerFilter('all');
                setStatusFilter('all');
              }}
              className="rounded-xl border border-rose-100 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-rose-50"
            >
              Reset Filters
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {visibleSummaryCards.map((card) => (
              <div key={card.key} className={`relative rounded-xl border p-3 ${card.boxClass}`}>
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(card.key)}
                    className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${card.label} summary card`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <p className={`text-xs uppercase tracking-wide ${card.tone}`}>{card.label}</p>
                <p className={`mt-1 text-xl font-extrabold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>
          {visibleSummaryCards.length === 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              All summary widgets are hidden. Restore from dashboard with admin approval.
            </div>
          )}
        </div>
        )}

        {showTableSection && (
        <div className="relative rounded-3xl border border-rose-100 bg-white/90 p-4 backdrop-blur-xl shadow-[0_18px_45px_-28px_rgba(190,24,93,0.35)]">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}table_section`)}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide table widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          {loading ? (
            <p className="py-8 text-center text-slate-600">Loading report...</p>
          ) : filteredRows.length === 0 ? (
            <p className="py-8 text-center text-slate-600">No outstanding customers found.</p>
          ) : (
            <>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>
                Showing {pageStart}-{pageEnd} of {filteredRows.length} outstanding customers
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase tracking-wide text-slate-500">Rows</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-rose-100 bg-white px-2 py-1.5 text-xs text-black focus:outline-none focus:ring-2 focus:ring-rose-200"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-rose-100">
              <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                <thead className="bg-rose-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Loan Code</th>
                    <th className="px-3 py-2 font-semibold">Customer No</th>
                    <th className="px-3 py-2 font-semibold">Customer</th>
                    <th className="px-3 py-2 font-semibold">Field Officer</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Loan Amount</th>
                    <th className="px-3 py-2 font-semibold">Refundable</th>
                    <th className="px-3 py-2 font-semibold">Collected</th>
                    <th className="px-3 py-2 font-semibold">Outstanding</th>
                    <th className="px-3 py-2 font-semibold">Arrears</th>
                    <th className="px-3 py-2 font-semibold">Due Date</th>
                    <th className="px-3 py-2 font-semibold">Next Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => (
                    <tr key={row.loanId} className="border-b border-rose-100 last:border-b-0 hover:bg-rose-50/40">
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.loanCode}</td>
                      <td className="px-3 py-2">{row.customerNo}</td>
                      <td className="px-3 py-2">{row.customerName}</td>
                      <td className="px-3 py-2">{row.fieldOfficer}</td>
                      <td className="px-3 py-2 capitalize">{row.status}</td>
                      <td className="px-3 py-2">{formatMoney(row.loanAmount)}</td>
                      <td className="px-3 py-2">{formatMoney(row.refundableAmount)}</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">{formatMoney(row.collectedAmount)}</td>
                      <td className="px-3 py-2 text-rose-700 font-semibold">{formatMoney(row.outstandingAmount)}</td>
                      <td className="px-3 py-2 text-orange-700 font-semibold">{formatMoney(row.arrearsAmount)}</td>
                      <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                      <td className="px-3 py-2">{formatDate(row.nextPaymentDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Page {Math.min(currentPage, totalPages)} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-rose-100 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-rose-100 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
            </>
          )}
        </div>
        )}
        {!showFilterSection && !showTableSection && visibleSummaryCards.length === 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            All widgets on this page are hidden. Use "Restore Hidden Widgets" on dashboard to show them again.
          </div>
        )}
      </div>
      {widgetNotice.open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setWidgetNotice({ open: false, title: '', message: '' })} />
          <div className="relative w-full max-w-sm rounded-2xl border border-rose-100 bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">{widgetNotice.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{widgetNotice.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}