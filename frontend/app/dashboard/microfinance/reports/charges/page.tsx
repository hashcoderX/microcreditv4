'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type LoanChargeRow = {
  id: number;
  status?: string | null;
  loan_scope?: string | null;
  loan_code?: string | null;
  customer_no?: string | null;
  customer_name?: string | null;
  field_officer?: string | null;
  loan_request_date?: string | null;
  created_at?: string | null;
  charge_payment_mode?: 'deduct_from_loan' | 'hand_cash' | string | null;
  document_charges?: number | string | null;
  stamp_charges?: number | string | null;
  insurance_charges?: number | string | null;
};

type ChargeReportRow = {
  id: number;
  date: string;
  status: string;
  loanScope: string;
  loanCode: string;
  customerNo: string;
  customerName: string;
  fieldOfficer: string;
  chargePaymentMode: string;
  documentCharges: number;
  stampCharges: number;
  insuranceCharges: number;
  totalCharges: number;
};

const API_BASE = getApiBaseUrl();

export default function MicrofinanceChargesReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchId = searchParams.get('branch_id') || '';
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChargeReportRow[]>([]);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loanScopeFilter, setLoanScopeFilter] = useState<'all' | 'route_loan' | 'center_loan' | 'direct_loan'>('all');
  const [keyword, setKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);


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
        if (!key.startsWith('mf_charges_widget_')) continue;
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
        { widget_key: widgetKey, is_visible: isVisible },
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
      setWidgetNotice({
        open: true,
        title: 'Widget Update Failed',
        message: 'Failed to hide this item. Please try again.',
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
        const response = await axios.get(`${API_BASE}/microfinance/loan-requests`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          params: {
            branch_id: branchId,
          },
        });

        const loans: LoanChargeRow[] = Array.isArray(response.data) ? response.data : [];

        const mapped = loans
          .map((loan) => {
            const documentCharges = Number(loan.document_charges || 0);
            const stampCharges = Number(loan.stamp_charges || 0);
            const insuranceCharges = Number(loan.insurance_charges || 0);
            const totalCharges = documentCharges + stampCharges + insuranceCharges;
            const date = String(loan.loan_request_date || loan.created_at || '');
            const status = String(loan.status || '').toLowerCase();
            const loanScope = String(loan.loan_scope || '').trim().toLowerCase();

            return {
              id: Number(loan.id || 0),
              date,
              status,
              loanScope,
              loanCode: String(loan.loan_code || `LR-${loan.id || 0}`),
              customerNo: String(loan.customer_no || '-'),
              customerName: String(loan.customer_name || '-'),
              fieldOfficer: String(loan.field_officer || 'Unassigned'),
              chargePaymentMode: String(loan.charge_payment_mode || '-').replace(/_/g, ' '),
              documentCharges,
              stampCharges,
              insuranceCharges,
              totalCharges,
            } as ChargeReportRow;
          })
          .filter((row) => row.totalCharges > 0)
          .sort((a, b) => b.totalCharges - a.totalCharges);

        setRows(mapped);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [token, branchId]);

  const officerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.fieldOfficer))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    const search = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      const rowDate = row.date ? new Date(row.date) : null;

      if (from && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate < from) {
        return false;
      }

      if (to && rowDate && !Number.isNaN(rowDate.getTime()) && rowDate > to) {
        return false;
      }

      if (officerFilter !== 'all' && row.fieldOfficer.toLowerCase() !== officerFilter) {
        return false;
      }

      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }

      if (loanScopeFilter !== 'all' && row.loanScope !== loanScopeFilter) {
        return false;
      }

      if (!search) return true;

      const haystack = [
        row.loanCode,
        row.customerNo,
        row.customerName,
        row.fieldOfficer,
        row.chargePaymentMode,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [rows, fromDate, toDate, officerFilter, statusFilter, loanScopeFilter, keyword]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.document += row.documentCharges;
        acc.stamp += row.stampCharges;
        acc.insurance += row.insuranceCharges;
        acc.total += row.totalCharges;
        return acc;
      },
      {
        document: 0,
        stamp: 0,
        insurance: 0,
        total: 0,
      }
    );
  }, [filteredRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, officerFilter, statusFilter, loanScopeFilter, keyword, pageSize, rows.length]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const pageStart = filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, filteredRows.length);

  const chargePreview = useMemo(() => {
    const total = summary.total;
    const documentPct = total > 0 ? (summary.document / total) * 100 : 0;
    const stampPct = total > 0 ? (summary.stamp / total) * 100 : 0;
    const insurancePct = total > 0 ? (summary.insurance / total) * 100 : 0;

    const officerTotals = new Map<string, number>();
    filteredRows.forEach((row) => {
      officerTotals.set(row.fieldOfficer, (officerTotals.get(row.fieldOfficer) || 0) + row.totalCharges);
    });

    const topOfficers = Array.from(officerTotals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    return {
      documentPct,
      stampPct,
      insurancePct,
      topOfficers,
    };
  }, [filteredRows, summary]);

  const summaryCards = [
    { key: 'mf_charges_widget_summary_document', label: 'Document Charges', value: summary.document, isCount: false },
    { key: 'mf_charges_widget_summary_stamp', label: 'Stamp Charges', value: summary.stamp, isCount: false },
    { key: 'mf_charges_widget_summary_insurance', label: 'Insurance Charges', value: summary.insurance, isCount: false },
    { key: 'mf_charges_widget_summary_total', label: 'Total Charges', value: summary.total, isCount: false },
    { key: 'mf_charges_widget_summary_loans_count', label: 'Loans Count', value: filteredRows.length, isCount: true },
  ];
  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showHeaderActions = !hiddenWidgetKeys.has('mf_charges_widget_header_actions');
  const showFilterPanel = !hiddenWidgetKeys.has('mf_charges_widget_filter_panel');

  const tableColumns = [
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status' },
    { key: 'loanCode', label: 'Loan Code' },
    { key: 'customer', label: 'Customer' },
    { key: 'fieldOfficer', label: 'Field Officer' },
    { key: 'mode', label: 'Mode' },
    { key: 'document', label: 'Document' },
    { key: 'stamp', label: 'Stamp' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'total', label: 'Total' },
  ];
  const visibleTableColumns = tableColumns.filter((column) => !hiddenWidgetKeys.has(`mf_charges_widget_col_${column.key}`));

  const formatMoney = (value: number) => Number(value || 0).toFixed(2);

  const formatDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value || '-';
    }

    return new Intl.DateTimeFormat('en-LK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
  };

  const getReportFileDate = () => new Date().toISOString().slice(0, 10);

  const handleDownloadCsv = () => {
    const headers = [
      'Date & Time',
      'Status',
      'Loan Code',
      'Customer No',
      'Customer',
      'Field Officer',
      'Charge Payment Mode',
      'Document Charges',
      'Stamp Charges',
      'Insurance Charges',
      'Total Charges',
    ];

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const body = filteredRows.map((row) => [
      formatDateTime(row.date),
      row.status || '-',
      row.loanCode,
      row.customerNo,
      row.customerName,
      row.fieldOfficer,
      row.chargePaymentMode,
      formatMoney(row.documentCharges),
      formatMoney(row.stampCharges),
      formatMoney(row.insuranceCharges),
      formatMoney(row.totalCharges),
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `microfinance-charges-report-${getReportFileDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(15);
    doc.text('Microfinance Charges Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, 40, 58);
    doc.text(`Rows: ${filteredRows.length}`, 40, 72);
    doc.text(`Total Charges: LKR ${formatMoney(summary.total)}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [[
        'Date',
        'Status',
        'Loan Code',
        'Customer',
        'Officer',
        'Mode',
        'Document',
        'Stamp',
        'Insurance',
        'Total',
      ]],
      body: filteredRows.map((row) => [
        formatDateTime(row.date),
        row.status || '-',
        row.loanCode,
        `${row.customerNo} - ${row.customerName}`,
        row.fieldOfficer,
        row.chargePaymentMode,
        formatMoney(row.documentCharges),
        formatMoney(row.stampCharges),
        formatMoney(row.insuranceCharges),
        formatMoney(row.totalCharges),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 5,
      },
      headStyles: {
        fillColor: [14, 116, 144],
        textColor: 255,
      },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 55 },
        2: { cellWidth: 70 },
        3: { cellWidth: 170 },
        4: { cellWidth: 95 },
        5: { cellWidth: 80 },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
      },
    });

    doc.save(`microfinance-charges-report-${getReportFileDate()}.pdf`);
  };

  if (!token || loading || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-cyan-100 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Microfinance Reports</p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Charges Report</h1>
              <p className="mt-1 text-sm text-slate-600">
                Detailed breakdown of document, stamp, and insurance charges by loan and officer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.back()}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700"
              >
                Back
              </button>
              <button
                onClick={handleDownloadCsv}
                disabled={filteredRows.length === 0}
                className="px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-800 disabled:opacity-50"
              >
                Download CSV
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={filteredRows.length === 0}
                className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-sm font-semibold text-white disabled:opacity-50"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl border border-cyan-100 shadow-sm p-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cyan-100 px-3 py-2 text-sm text-black"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cyan-100 px-3 py-2 text-sm text-black"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Field Officer</label>
              <select
                value={officerFilter}
                onChange={(e) => setOfficerFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cyan-100 px-3 py-2 text-sm text-black"
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
              <label className="text-xs font-semibold text-slate-600">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cyan-100 px-3 py-2 text-sm text-black"
              >
                <option value="all">All Statuses</option>
                <option value="requested">Requested</option>
                <option value="approved">Approved</option>
                <option value="released">Released</option>
                <option value="hold">Hold</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Loan Type</label>
              <select
                value={loanScopeFilter}
                onChange={(e) => setLoanScopeFilter(e.target.value as 'all' | 'route_loan' | 'center_loan' | 'direct_loan')}
                className="mt-1 w-full rounded-lg border border-cyan-100 px-3 py-2 text-sm text-black"
              >
                <option value="all">All Loan Types</option>
                <option value="route_loan">Route Loan Charges</option>
                <option value="center_loan">Center Loan Charges</option>
                <option value="direct_loan">Direct Loan Charges</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Search</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Loan code, customer, officer"
                className="mt-1 w-full rounded-lg border border-cyan-100 px-3 py-2 text-sm text-black"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {visibleSummaryCards.map((card) => (
            <div key={card.key} className="relative rounded-xl border border-cyan-100 bg-white p-4">
              <WidgetCloseGate>
<button
                type="button"
                onClick={() => void hideWidget(card.key)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label={`Hide ${card.label} card`}
              >
                ×
              </button>
</WidgetCloseGate>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">
                {loading ? '...' : card.isCount ? Number(card.value).toLocaleString() : `LKR ${formatMoney(Number(card.value))}`}
              </p>
            </div>
          ))}
        </div>
        {visibleSummaryCards.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            All summary cards are hidden. Restore from dashboard with admin approval.
          </div>
        )}

        <div className="rounded-2xl border border-cyan-100 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Charges Composition Preview</h2>
          <p className="mt-1 text-xs text-slate-500">Visual split of document, stamp, and insurance charges for current filters.</p>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Document</span>
                  <span>{chargePreview.documentPct.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.min(chargePreview.documentPct, 100)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Stamp</span>
                  <span>{chargePreview.stampPct.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(chargePreview.stampPct, 100)}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Insurance</span>
                  <span>{chargePreview.insurancePct.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(chargePreview.insurancePct, 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Officers by Charges</p>
              <div className="mt-2 space-y-2 text-sm">
                {chargePreview.topOfficers.length === 0 ? (
                  <p className="text-slate-500">No officer data for selected filters.</p>
                ) : (
                  chargePreview.topOfficers.map((officer) => (
                    <div key={officer.name} className="flex items-center justify-between gap-2">
                      <span className="text-slate-700 truncate">{officer.name}</span>
                      <span className="font-semibold text-slate-900">LKR {formatMoney(officer.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-100 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-cyan-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Loan Code</th>
                <th className="px-3 py-2 text-left font-semibold">Customer</th>
                <th className="px-3 py-2 text-left font-semibold">Field Officer</th>
                <th className="px-3 py-2 text-left font-semibold">Mode</th>
                <th className="px-3 py-2 text-right font-semibold">Document</th>
                <th className="px-3 py-2 text-right font-semibold">Stamp</th>
                <th className="px-3 py-2 text-right font-semibold">Insurance</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => (
                <tr key={row.id} className="border-t border-cyan-50">
                  <td className="px-3 py-2 text-slate-700">{formatDateTime(row.date)}</td>
                  <td className="px-3 py-2 text-slate-700 uppercase">{row.status || '-'}</td>
                  <td className="px-3 py-2 text-slate-800 font-semibold">{row.loanCode}</td>
                  <td className="px-3 py-2 text-slate-700">{row.customerNo} - {row.customerName}</td>
                  <td className="px-3 py-2 text-slate-700">{row.fieldOfficer}</td>
                  <td className="px-3 py-2 text-slate-700 capitalize">{row.chargePaymentMode}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatMoney(row.documentCharges)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatMoney(row.stampCharges)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatMoney(row.insuranceCharges)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-cyan-700">{formatMoney(row.totalCharges)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRows.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-100 bg-white px-4 py-3 text-sm text-slate-600">
            <p>
              Showing {pageStart}-{pageEnd} of {filteredRows.length}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-wide text-slate-500">Rows</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-cyan-100 px-2 py-1.5 text-xs text-black"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-cyan-100 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-xs text-slate-600">Page {safePage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-cyan-100 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {!loading && filteredRows.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No charge records found for the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}
