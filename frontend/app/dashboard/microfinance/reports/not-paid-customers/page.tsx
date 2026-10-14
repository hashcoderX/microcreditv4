'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type NotPaidRow = {
  loanId: number;
  loanCode: string;
  loanScope?: string;
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
  rows?: NotPaidRow[];
  officer_options?: string[];
};

const API_BASE = getApiBaseUrl();
const isUnauthorizedError = (error: unknown): boolean =>
  axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403);

export default function NotPaidCustomersReportPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NotPaidRow[]>([]);
  const [keyword, setKeyword] = useState('');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'released' | 'completed'>('all');
  const [loanTypeFilter, setLoanTypeFilter] = useState<'all' | 'route_loan' | 'center_loan' | 'direct_loan'>('all');
  const [officerOptions, setOfficerOptions] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const widgetPrefix = 'mf_not_paid_customers_widget_';

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
        const response = await axios.get<ReportResponse>(`${API_BASE}/reports/not-paid-customers`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          params: {
            status: statusFilter,
            loan_scope: loanTypeFilter,
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
  }, [token, statusFilter, loanTypeFilter, keyword]);

  const filteredRows = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      if (officerFilter !== 'all' && row.fieldOfficer.toLowerCase() !== officerFilter) {
        return false;
      }

      if (loanTypeFilter !== 'all' && String(row.loanScope || '').toLowerCase() !== loanTypeFilter) {
        return false;
      }

      if (!search) return true;
      const haystack = [row.loanCode, row.customerNo, row.customerName, row.fieldOfficer].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }, [rows, keyword, officerFilter, loanTypeFilter]);

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '').trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const summary = useMemo(() => {
    const totals = filteredRows.reduce(
      (acc, row) => {
        const customerKey = String(row.customerNo || row.customerName || '').trim();
        if (customerKey) {
          acc.customerKeys.add(customerKey.toLowerCase());
        }

        acc.outstanding += toNumber(row.outstandingAmount);
        acc.arrears += toNumber(row.arrearsAmount);
        return acc;
      },
      {
        customerKeys: new Set<string>(),
        outstanding: 0,
        arrears: 0,
      }
    );

    return {
      customers: totals.customerKeys.size,
      outstanding: totals.outstanding,
      arrears: totals.arrears,
    };
  }, [filteredRows]);

  const buildPieChart = (segments: Array<{ key: string; label: string; value: number; color: string }>) => {
    const total = segments.reduce((acc, segment) => acc + segment.value, 0);
    if (total <= 0) {
      return {
        total,
        gradient: '#e2e8f0',
        segments: segments.map((segment) => ({ ...segment, percent: 0 })),
      };
    }

    let cursor = 0;
    const gradientParts = segments.map((segment) => {
      const percent = (segment.value / total) * 100;
      const start = cursor;
      const end = cursor + percent;
      cursor = end;
      return `${segment.color} ${start}% ${end}%`;
    });

    return {
      total,
      gradient: `conic-gradient(${gradientParts.join(', ')})`,
      segments: segments.map((segment) => ({
        ...segment,
        percent: total > 0 ? (segment.value / total) * 100 : 0,
      })),
    };
  };

  const amountPieChart = useMemo(() => {
    return buildPieChart([
      { key: 'outstanding', label: 'Outstanding', value: summary.outstanding, color: '#e11d48' },
      { key: 'arrears', label: 'Arrears', value: summary.arrears, color: '#f97316' },
    ]);
  }, [summary.outstanding, summary.arrears]);

  const statusPieChart = useMemo(() => {
    const counts = filteredRows.reduce(
      (acc, row) => {
        const key = String(row.status || '').trim().toLowerCase() || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const colorMap: Record<string, string> = {
      approved: '#6366f1',
      released: '#0ea5e9',
      completed: '#10b981',
      unknown: '#94a3b8',
    };

    const labelMap: Record<string, string> = {
      approved: 'Approved',
      released: 'Released',
      completed: 'Completed',
      unknown: 'Unknown',
    };

    const segments = Object.entries(counts)
      .map(([key, value]) => ({
        key,
        label: labelMap[key] || key,
        value,
        color: colorMap[key] || '#94a3b8',
      }))
      .sort((a, b) => b.value - a.value);

    return buildPieChart(segments);
  }, [filteredRows]);

  const topOfficerBars = useMemo(() => {
    const officerTotals = filteredRows.reduce((acc, row) => {
      const officer = String(row.fieldOfficer || 'Unassigned').trim() || 'Unassigned';
      acc.set(officer, (acc.get(officer) || 0) + toNumber(row.outstandingAmount));
      return acc;
    }, new Map<string, number>());

    const list = Array.from(officerTotals.entries())
      .map(([officer, total]) => ({ officer, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const max = list.reduce((acc, item) => Math.max(acc, item.total), 0);
    return list.map((item) => ({
      ...item,
      widthPercent: max > 0 ? (item.total / max) * 100 : 0,
    }));
  }, [filteredRows]);

  const formatMoney = (value: number) => Number(value || 0).toFixed(2);

  const formatLoanType = (value?: string) => {
    const key = String(value || '').toLowerCase();
    if (key === 'route_loan') return 'Route Loan';
    if (key === 'center_loan') return 'Center Loan';
    if (key === 'direct_loan') return 'Direct Loan';
    return '-';
  };

  const getReportFileDate = () => new Date().toISOString().slice(0, 10);

  const handleDownloadCsv = () => {
    const headers = [
      'Loan Code',
      'Loan Type',
      'Customer No',
      'Customer Name',
      'Field Officer',
      'Status',
      'Loan Amount',
      'Refundable',
      'Collected',
      'Outstanding',
      'Arrears',
      'Due Date',
      'Next Payment',
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
      formatLoanType(row.loanScope),
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
    link.download = `not-paid-customers-report-${getReportFileDate()}.csv`;
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
    const loanTypeText = `Loan Type: ${loanTypeFilter === 'all' ? 'All' : formatLoanType(loanTypeFilter)}`;

    doc.setFontSize(16);
    doc.text('Not Paid Customer Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`${officerText} | ${statusText} | ${loanTypeText} | Generated: ${generatedAt}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [[
        'Loan Code',
        'Loan Type',
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
        formatLoanType(row.loanScope),
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
        fillColor: [190, 24, 93],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [255, 241, 242],
      },
      margin: { left: 24, right: 24, top: 72, bottom: 24 },
      theme: 'striped',
    });

    doc.save(`not-paid-customers-report-${getReportFileDate()}.pdf`);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, officerFilter, statusFilter, loanTypeFilter, pageSize, rows.length]);

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
              <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900">Not Paid Customer Report</h1>
              <p className="mt-1 text-sm text-slate-600">Customers with unpaid loan balances and related loan details.</p>
            </div>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Back
            </button>
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
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loan Type</label>
              <select
                value={loanTypeFilter}
                onChange={(e) => setLoanTypeFilter(e.target.value as 'all' | 'route_loan' | 'center_loan' | 'direct_loan')}
                className="mt-1 w-full rounded-xl border border-rose-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-rose-200"
              >
                <option value="all">All Loan Types</option>
                <option value="route_loan">Route Loan</option>
                <option value="center_loan">Center Loan</option>
                <option value="direct_loan">Direct Loan</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-200"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="rounded-xl border border-cyan-200 bg-cyan-100 px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-200"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setOfficerFilter('all');
                setStatusFilter('all');
                setLoanTypeFilter('all');
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

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-rose-100 bg-white/90 p-4 xl:col-span-1">
              <h3 className="text-sm font-bold text-slate-900">Amount Mix</h3>
              <p className="mt-1 text-xs text-slate-500">Outstanding vs arrears contribution.</p>
              <div className="mt-4 flex items-center gap-4 flex-wrap">
                <div
                  className="h-32 w-32 rounded-full border border-slate-200 shadow-inner"
                  style={{ background: amountPieChart.gradient }}
                  aria-label="Outstanding and arrears pie chart"
                />
                <div className="space-y-2">
                  {amountPieChart.segments.map((segment) => (
                    <div key={segment.key} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                      <span className="font-semibold">{segment.label}</span>
                      <span>{segment.percent.toFixed(1)}%</span>
                      <span className="text-slate-500">({formatMoney(segment.value)})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-white/90 p-4 xl:col-span-1">
              <h3 className="text-sm font-bold text-slate-900">Loan Status Split</h3>
              <p className="mt-1 text-xs text-slate-500">Customer loan records by status.</p>
              <div className="mt-4 flex items-center gap-4 flex-wrap">
                <div
                  className="h-32 w-32 rounded-full border border-slate-200 shadow-inner"
                  style={{ background: statusPieChart.gradient }}
                  aria-label="Status distribution pie chart"
                />
                <div className="space-y-2">
                  {statusPieChart.segments.length === 0 ? (
                    <p className="text-xs text-slate-500">No data for selected filters.</p>
                  ) : (
                    statusPieChart.segments.map((segment) => (
                      <div key={segment.key} className="flex items-center gap-2 text-xs text-slate-700">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="font-semibold">{segment.label}</span>
                        <span>{segment.percent.toFixed(1)}%</span>
                        <span className="text-slate-500">({segment.value})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-white/90 p-4 xl:col-span-1">
              <h3 className="text-sm font-bold text-slate-900">Top Officers by Outstanding</h3>
              <p className="mt-1 text-xs text-slate-500">Graph chart based on current filters.</p>
              <div className="mt-4 space-y-3">
                {topOfficerBars.length === 0 ? (
                  <p className="text-xs text-slate-500">No data for selected filters.</p>
                ) : (
                  topOfficerBars.map((item) => (
                    <div key={item.officer} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-slate-700">{item.officer}</span>
                        <span className="text-slate-500">{formatMoney(item.total)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-rose-100">
                        <div
                          className="h-2.5 rounded-full bg-gradient-to-r from-rose-500 via-pink-500 to-orange-500"
                          style={{ width: `${item.widthPercent}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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
            <p className="py-8 text-center text-slate-600">No unpaid customers found.</p>
          ) : (
            <>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>
                Showing {pageStart}-{pageEnd} of {filteredRows.length} unpaid customers
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
                    <th className="px-3 py-2 font-semibold">Loan Type</th>
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
                      <td className="px-3 py-2">{formatLoanType(row.loanScope)}</td>
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
