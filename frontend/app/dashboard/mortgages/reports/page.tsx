'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Badge from '../_components/Badge';
import ClientMountGate from '@/app/components/ClientMountGate';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  ArrowLeft,
  BarChart3,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  FileText,
  History,
  PieChart,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const inputClass =
  'w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200/70';

type ReportTab = 'running' | 'rejected' | 'analytics' | 'settled';

type MortgageRow = {
  id: number;
  created_at?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  mortgage_type?: string | null;
  requested_amount?: number | string | null;
  approved_amount?: number | string | null;
  installment_amount?: number | string | null;
  interest_rate?: number | string | null;
  interest_type?: string | null;
  tenure_months?: number | string | null;
  status?: string | null;
  installment_frequency?: string | null;
  interest_calculation_frequency?: string | null;
  customer?: {
    first_name?: string;
    last_name?: string;
  } | null;
};

type PaymentRow = {
  id: number;
  paid_date?: string | null;
  amount?: number | string | null;
  payment_method?: string | null;
  remarks?: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatAmount(value: unknown): string {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getPeriodsPerYear(frequency: unknown): number {
  const map: Record<string, number> = {
    daily: 365,
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
  };
  const key = String(frequency || 'monthly').toLowerCase();
  return map[key] ?? 12;
}

function calculateInstallmentAmount(row: MortgageRow): number {
  const stored = toNumber(row.installment_amount);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const principal = toNumber(row.approved_amount ?? row.requested_amount);
  const annualRate = toNumber(row.interest_rate) / 100;
  const months = Math.max(1, Math.round(toNumber(row.tenure_months)));

  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(annualRate)) return NaN;

  const installmentPerYear = getPeriodsPerYear(row.installment_frequency);
  const interestCalcPerYear = getPeriodsPerYear(row.interest_calculation_frequency || 'monthly');
  const years = months / 12;
  const installmentCount = Math.max(1, Math.round(years * installmentPerYear));

  const effectiveAnnualRate = Math.pow(1 + annualRate / interestCalcPerYear, interestCalcPerYear) - 1;
  const installmentRate = Math.pow(1 + effectiveAnnualRate, 1 / installmentPerYear) - 1;

  if (String(row.interest_type || '').toLowerCase() === 'reducing') {
    if (!Number.isFinite(installmentRate) || installmentRate <= 0) {
      return principal / installmentCount;
    }
    const pow = Math.pow(1 + installmentRate, installmentCount);
    return (principal * installmentRate * pow) / (pow - 1);
  }

  const totalInterest = principal * annualRate * years;
  return (principal + totalInterest) / installmentCount;
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

function statusVariant(status: string): 'success' | 'warning' | 'info' | 'default' {
  const s = status.toLowerCase();
  if (s === 'active' || s === 'released' || s === 'settled') return 'success';
  if (s === 'arrears' || s === 'rejected') return 'warning';
  if (s === 'approved' || s === 'submitted') return 'info';
  return 'default';
}

export default function MortgageReportsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MortgageRow[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTab>('running');
  const [runningPage, setRunningPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);
  const PAGE_SIZE = 10;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMortgage, setHistoryMortgage] = useState<MortgageRow | null>(null);
  const [historyRows, setHistoryRows] = useState<PaymentRow[]>([]);

  const [settledQuery, setSettledQuery] = useState('');
  const [settledFrom, setSettledFrom] = useState('');
  const [settledTo, setSettledTo] = useState('');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const widgetPrefix = 'mortgages_reports_widget_';

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);
    void fetchWidgetPreferences(t);
  }, [router]);

  async function fetchWidgetPreferences(authToken: string) {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
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
    } catch {
      setHiddenWidgetKeys(new Set());
    }
  }

  const saveWidgetPreference = useCallback(async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        `${getApiBaseUrl()}/dashboard/widgets`,
        { widget_key: widgetKey, is_visible: isVisible },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch {
      return false;
    }
  }, [token]);

  const hideWidget = useCallback(async (widgetKey: string) => {
    setWidgetNotice('');
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);
    const ok = await saveWidgetPreference(widgetKey, false);
    if (!ok) {
      setHiddenWidgetKeys(previous);
      setWidgetNotice('Failed to hide widget. Please try again.');
    }
  }, [hiddenWidgetKeys, saveWidgetPreference]);

  const fetchRows = async (authToken: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`${getApiBaseUrl()}/mortgages`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 1000 },
      });

      const data = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchRows(token);
  }, [token]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const approved = rows.filter((row) => String(row.status || '').toLowerCase() === 'approved').length;
    const submitted = rows.filter((row) => String(row.status || '').toLowerCase() === 'submitted').length;
    const rejected = rows.filter((row) => String(row.status || '').toLowerCase() === 'rejected').length;
    const settled = rows.filter((row) => String(row.status || '').toLowerCase() === 'settled').length;

    const totalRequested = rows.reduce((sum, row) => {
      const amount = toNumber(row.requested_amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const totalApproved = rows.reduce((sum, row) => {
      const amount = toNumber(row.approved_amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const totalInstallment = rows.reduce((sum, row) => {
      const amount = toNumber(row.installment_amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const runningStatuses = new Set(['approved', 'active', 'arrears', 'released']);
    const running = rows.filter((row) => runningStatuses.has(String(row.status || '').trim().toLowerCase())).length;

    return {
      total,
      approved,
      submitted,
      rejected,
      settled,
      running,
      totalRequested,
      totalApproved,
      totalInstallment,
    };
  }, [rows]);

  const byType = useMemo(() => {
    const map = new Map<string, { count: number; requested: number; approved: number }>();

    rows.forEach((row) => {
      const key = String(row.mortgage_type || 'unknown').toLowerCase();
      const requested = toNumber(row.requested_amount);
      const approved = toNumber(row.approved_amount);
      const current = map.get(key) || { count: 0, requested: 0, approved: 0 };
      map.set(key, {
        count: current.count + 1,
        requested: current.requested + (Number.isFinite(requested) ? requested : 0),
        approved: current.approved + (Number.isFinite(approved) ? approved : 0),
      });
    });

    return Array.from(map.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const key = String(row.status || 'unknown').toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const maxTypeCount = useMemo(() => Math.max(1, ...byType.map((t) => t.count)), [byType]);
  const maxStatusCount = useMemo(() => Math.max(1, ...byStatus.map((s) => s.count)), [byStatus]);

  const runningRows = useMemo(() => {
    const runningStatuses = new Set(['approved', 'active', 'arrears', 'released']);
    return rows.filter((row) => runningStatuses.has(String(row.status || '').trim().toLowerCase()));
  }, [rows]);

  const rejectedRows = useMemo(() => rows.filter((row) => String(row.status || '').toLowerCase() === 'rejected'), [rows]);
  const settledRows = useMemo(() => rows.filter((row) => String(row.status || '').toLowerCase() === 'settled'), [rows]);

  const filteredSettledRows = useMemo(() => {
    const q = settledQuery.trim().toLowerCase();
    return settledRows.filter((row) => {
      const haystack = [row.id, row.mortgage_type || '', row.status || ''].join(' ').toLowerCase();
      const matchesText = !q || haystack.includes(q);
      const created = parseDateValue(row.created_at);
      const fromDate = settledFrom ? parseDateValue(settledFrom) : null;
      const toDate = settledTo ? parseDateValue(settledTo) : null;
      if (fromDate) fromDate.setHours(0, 0, 0, 0);
      if (toDate) toDate.setHours(23, 59, 59, 999);
      const matchesFrom = !fromDate || (!!created && created >= fromDate);
      const matchesTo = !toDate || (!!created && created <= toDate);
      return matchesText && matchesFrom && matchesTo;
    });
  }, [settledRows, settledQuery, settledFrom, settledTo]);

  useEffect(() => setRunningPage(1), [runningRows.length]);
  useEffect(() => setRejectedPage(1), [rejectedRows.length]);

  const runningLastPage = Math.max(1, Math.ceil(runningRows.length / PAGE_SIZE));
  const rejectedLastPage = Math.max(1, Math.ceil(rejectedRows.length / PAGE_SIZE));

  const pagedRunningRows = useMemo(() => {
    const start = (runningPage - 1) * PAGE_SIZE;
    return runningRows.slice(start, start + PAGE_SIZE);
  }, [runningRows, runningPage]);

  const pagedRejectedRows = useMemo(() => {
    const start = (rejectedPage - 1) * PAGE_SIZE;
    return rejectedRows.slice(start, start + PAGE_SIZE);
  }, [rejectedRows, rejectedPage]);

  const downloadCsv = (fileName: string, headers: string[], data: Array<Array<string>>) => {
    const csv = [headers, ...data].map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = (title: string, fileName: string, headers: string[], data: Array<Array<string>>) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(title, 14, 14);
    autoTable(doc, {
      head: [headers],
      body: data,
      startY: 20,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [13, 148, 136] },
    });
    doc.save(fileName);
  };

  const exportRunningCsv = () => {
    const headers = ['ID', 'Type', 'Approved Amount', 'Installment Amount', 'Interest', 'Tenure (Months)', 'Start Date', 'Due Date', 'Refund Frequency', 'Interest Calc Frequency', 'Status', 'Created At'];
    const data = runningRows.map((row) => [
      String(row.id),
      String(row.mortgage_type || '—'),
      formatAmount(row.approved_amount ?? row.requested_amount),
      formatAmount(calculateInstallmentAmount(row)),
      Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}% (${row.interest_type || '—'})` : '—',
      String(row.tenure_months || '—'),
      formatDate(row.start_date),
      formatDate(row.due_date),
      String(row.installment_frequency || '—'),
      String(row.interest_calculation_frequency || '—'),
      String(row.status || '—'),
      formatDate(row.created_at),
    ]);
    downloadCsv('running-mortgages-report.csv', headers, data);
  };

  const exportRunningPdf = () => {
    const headers = ['ID', 'Type', 'Approved Amount', 'Installment Amount', 'Interest', 'Tenure', 'Start Date', 'Due Date', 'Refund Freq', 'Interest Calc Freq', 'Status', 'Created At'];
    const data = runningRows.map((row) => [
      String(row.id),
      String(row.mortgage_type || '—'),
      formatAmount(row.approved_amount ?? row.requested_amount),
      formatAmount(calculateInstallmentAmount(row)),
      Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}%` : '—',
      String(row.tenure_months || '—'),
      formatDate(row.start_date),
      formatDate(row.due_date),
      String(row.installment_frequency || '—'),
      String(row.interest_calculation_frequency || '—'),
      String(row.status || '—'),
      formatDate(row.created_at),
    ]);
    downloadPdf('Running Mortgages Report', 'running-mortgages-report.pdf', headers, data);
  };

  const exportRejectedCsv = () => {
    const headers = ['ID', 'Type', 'Requested Amount', 'Interest Rate', 'Start Date', 'Due Date', 'Status', 'Created At'];
    const data = rejectedRows.map((row) => [
      String(row.id),
      String(row.mortgage_type || '—'),
      formatAmount(row.requested_amount),
      Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}%` : '—',
      formatDate(row.start_date),
      formatDate(row.due_date),
      String(row.status || '—'),
      formatDate(row.created_at),
    ]);
    downloadCsv('rejected-mortgages-report.csv', headers, data);
  };

  const exportRejectedPdf = () => {
    const headers = ['ID', 'Type', 'Requested Amount', 'Interest Rate', 'Start Date', 'Due Date', 'Status', 'Created At'];
    const data = rejectedRows.map((row) => [
      String(row.id),
      String(row.mortgage_type || '—'),
      formatAmount(row.requested_amount),
      Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}%` : '—',
      formatDate(row.start_date),
      formatDate(row.due_date),
      String(row.status || '—'),
      formatDate(row.created_at),
    ]);
    downloadPdf('Rejected Mortgages Report', 'rejected-mortgages-report.pdf', headers, data);
  };

  const exportHistoryCsv = () => {
    if (!historyMortgage || historyRows.length === 0) return;
    const headers = ['Payment ID', 'Paid Date', 'Amount', 'Method', 'Remarks'];
    const data = historyRows.map((p) => [
      String(p.id),
      formatDate(p.paid_date),
      formatAmount(p.amount),
      String(p.payment_method || '—'),
      String(p.remarks || ''),
    ]);
    downloadCsv(`mortgage-${historyMortgage.id}-payments.csv`, headers, data);
  };

  const exportHistoryPdf = () => {
    if (!historyMortgage || historyRows.length === 0) return;
    const headers = ['Payment ID', 'Paid Date', 'Amount', 'Method', 'Remarks'];
    const data = historyRows.map((p) => [
      String(p.id),
      formatDate(p.paid_date),
      formatAmount(p.amount),
      String(p.payment_method || '—'),
      String(p.remarks || ''),
    ]);
    downloadPdf(`Mortgage Payment History #${historyMortgage.id}`, `mortgage-${historyMortgage.id}-payments.pdf`, headers, data);
  };

  const openHistoryModal = async (row: MortgageRow) => {
    if (!token) return;
    setHistoryMortgage(row);
    setHistoryRows([]);
    setHistoryOpen(true);
    try {
      setHistoryLoading(true);
      const response = await axios.get(`${getApiBaseUrl()}/mortgages/${row.id}/payments`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const data = Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : [];
      setHistoryRows(data as PaymentRow[]);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const Pagination = ({
    page,
    lastPage,
    onPrev,
    onNext,
  }: {
    page: number;
    lastPage: number;
    onPrev: () => void;
    onNext: () => void;
  }) => (
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
      <p className="text-xs font-medium text-slate-600">
        Page {page} of {lastPage}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <button
          type="button"
          disabled={page >= lastPage}
          onClick={onNext}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  const ExportButtons = ({ onCsv, onPdf, accent }: { onCsv: () => void; onPdf: () => void; accent: 'cyan' | 'rose' | 'emerald' }) => {
    const pdfClass =
      accent === 'rose'
        ? 'from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700'
        : accent === 'emerald'
          ? 'from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
          : 'from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700';
    const borderClass =
      accent === 'rose' ? 'border-rose-200 text-rose-800 hover:bg-rose-50' : accent === 'emerald' ? 'border-emerald-200 text-emerald-800 hover:bg-emerald-50' : 'border-teal-200 text-teal-800 hover:bg-teal-50';

    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCsv} className={`inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold ${borderClass}`}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          CSV
        </button>
        <button type="button" onClick={onPdf} className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r px-3 py-1.5 text-xs font-semibold text-white shadow-sm ${pdfClass}`}>
          <FileText className="h-3.5 w-3.5" />
          PDF
        </button>
      </div>
    );
  };

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#0a1418]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-400" />
        <p className="text-sm font-medium text-teal-100/80">Loading report center...</p>
      </div>
    </div>
  );

  const tabs: { id: ReportTab; label: string; count: number }[] = [
    { id: 'running', label: 'Running Book', count: runningRows.length },
    { id: 'rejected', label: 'Rejected', count: rejectedRows.length },
    { id: 'analytics', label: 'Analytics', count: byType.length },
    { id: 'settled', label: 'Settled', count: filteredSettledRows.length },
  ];

  const kpiCards = [
    { key: 'kpi_total', label: 'Total', value: metrics.total, tone: 'text-slate-700', bg: 'from-slate-500/10 to-gray-500/5' },
    { key: 'kpi_running', label: 'Running', value: metrics.running, tone: 'text-teal-700', bg: 'from-teal-500/10 to-cyan-500/5' },
    { key: 'kpi_approved', label: 'Approved', value: metrics.approved, tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-green-500/5' },
    { key: 'kpi_submitted', label: 'Submitted', value: metrics.submitted, tone: 'text-amber-700', bg: 'from-amber-500/10 to-orange-500/5' },
    { key: 'kpi_rejected', label: 'Rejected', value: metrics.rejected, tone: 'text-rose-700', bg: 'from-rose-500/10 to-red-500/5' },
    { key: 'kpi_settled', label: 'Settled', value: metrics.settled, tone: 'text-cyan-700', bg: 'from-cyan-500/10 to-blue-500/5' },
    { key: 'kpi_requested', label: 'Requested', value: formatAmount(metrics.totalRequested), tone: 'text-indigo-700', bg: 'from-indigo-500/10 to-violet-500/5' },
    { key: 'kpi_approved_value', label: 'Approved Value', value: formatAmount(metrics.totalApproved), tone: 'text-teal-700', bg: 'from-teal-500/10 to-emerald-500/5' },
  ];
  const visibleKpiCards = kpiCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const runningColumns = [
    { key: 'id', label: 'ID', render: (row: MortgageRow) => <span className="font-bold text-slate-900">#{row.id}</span> },
    { key: 'type', label: 'Type', render: (row: MortgageRow) => <span className="capitalize text-black">{row.mortgage_type || '—'}</span> },
    { key: 'approved', label: 'Approved', render: (row: MortgageRow) => <span className="font-semibold text-teal-700">{formatAmount(row.approved_amount ?? row.requested_amount)}</span> },
    { key: 'installment', label: 'Installment', render: (row: MortgageRow) => <span className="font-semibold text-cyan-700">{formatAmount(calculateInstallmentAmount(row))}</span> },
    { key: 'interest', label: 'Interest', render: (row: MortgageRow) => Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}%` : '—' },
    { key: 'start_date', label: 'Start Date', render: (row: MortgageRow) => formatDate(row.start_date) },
    { key: 'due_date', label: 'Due Date', render: (row: MortgageRow) => formatDate(row.due_date) },
    { key: 'status', label: 'Status', render: (row: MortgageRow) => <Badge label={String(row.status || '—')} variant={statusVariant(String(row.status || ''))} /> },
  ];
  const visibleRunningColumns = runningColumns.filter((col) => !hiddenWidgetKeys.has(`${widgetPrefix}running_col_${col.key}`));

  const rejectedColumns = [
    { key: 'id', label: 'ID', render: (row: MortgageRow) => <span className="font-bold text-slate-900">#{row.id}</span> },
    { key: 'type', label: 'Type', render: (row: MortgageRow) => <span className="capitalize text-black">{row.mortgage_type || '—'}</span> },
    { key: 'requested', label: 'Requested', render: (row: MortgageRow) => <span className="text-black">{formatAmount(row.requested_amount)}</span> },
    { key: 'interest', label: 'Interest', render: (row: MortgageRow) => Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}%` : '—' },
    { key: 'start_date', label: 'Start Date', render: (row: MortgageRow) => formatDate(row.start_date) },
    { key: 'due_date', label: 'Due Date', render: (row: MortgageRow) => formatDate(row.due_date) },
    { key: 'created', label: 'Created', render: (row: MortgageRow) => formatDate(row.created_at) },
  ];
  const visibleRejectedColumns = rejectedColumns.filter((col) => !hiddenWidgetKeys.has(`${widgetPrefix}rejected_col_${col.key}`));

  const settledColumns = [
    { key: 'id', label: 'ID', render: (row: MortgageRow) => <span className="font-bold text-slate-900">#{row.id}</span> },
    { key: 'type', label: 'Type', render: (row: MortgageRow) => <span className="capitalize text-black">{row.mortgage_type || '—'}</span> },
    { key: 'customer', label: 'Customer', render: (row: MortgageRow) => `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || '—' },
    { key: 'approved', label: 'Approved', render: (row: MortgageRow) => formatAmount(row.approved_amount ?? row.requested_amount) },
    { key: 'start_date', label: 'Start Date', render: (row: MortgageRow) => formatDate(row.start_date) },
    { key: 'installment', label: 'Installment', render: (row: MortgageRow) => <span className="font-semibold text-emerald-700">{formatAmount(calculateInstallmentAmount(row))}</span> },
    { key: 'created', label: 'Created', render: (row: MortgageRow) => formatDate(row.created_at) },
    {
      key: 'history',
      label: 'History',
      render: (row: MortgageRow) => (
        <button
          type="button"
          onClick={() => openHistoryModal(row)}
          className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          <History className="h-3.5 w-3.5" />
          History
        </button>
      ),
    },
  ];
  const visibleSettledColumns = settledColumns.filter((col) => !hiddenWidgetKeys.has(`${widgetPrefix}settled_col_${col.key}`));

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showKpiWidget = !hiddenWidgetKeys.has(`${widgetPrefix}kpis`);
  const showInsightsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}insights`);
  const showTabsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}tabs`);
  const showFooterNoteWidget = !hiddenWidgetKeys.has(`${widgetPrefix}footer_note`);
  const showAnyWidget =
    showHeroWidget ||
    (showKpiWidget && visibleKpiCards.length > 0) ||
    showInsightsWidget ||
    showTabsWidget ||
    showFooterNoteWidget;

  if (!token) {
    return <ClientMountGate fallback={pageFallback}>{pageFallback}</ClientMountGate>;
  }

  return (
    <ClientMountGate fallback={pageFallback}>
      <div className="relative min-h-screen overflow-hidden bg-[#f2f7f6]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="absolute right-0 top-20 h-[28rem] w-[28rem] rounded-full bg-cyan-500/12 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.3]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(20,184,166,0.1) 1px, transparent 0)',
              backgroundSize: '26px 26px',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {widgetNotice ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {widgetNotice}
            </div>
          ) : null}

          {!showAnyWidget ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
              All widgets are hidden. Use Restore Hidden Widgets from the dashboard to bring them back.
            </div>
          ) : null}

          {/* Hero */}
          {showHeroWidget ? (
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0a1816] via-[#0f3d38] to-[#115e59] text-white shadow-[0_30px_80px_-24px_rgba(17,94,89,0.8)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.25),transparent_42%)]" />
            <div className="relative p-6 md:p-8">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}hero`)}
                  className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/85 text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide mortgage reports hero widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-teal-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Mortgage Analytics
                  </span>
                  <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Mortgage Report Center</h1>
                  <p className="mt-2 text-sm leading-relaxed text-teal-50/90 md:text-base">
                    Dedicated mortgage intelligence — running book, rejections, portfolio mix, and settled account histories with export tools.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/mortgages')}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Mortgages Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => token && fetchRows(token)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/30 transition hover:brightness-110 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { label: 'Arrears Report', href: '/dashboard/mortgages/reports/arrears' },
                  { label: 'Collection Report', href: '/dashboard/mortgages/reports/collection' },
                  { label: 'Profit Report', href: '/dashboard/mortgages/reports/profit' },
                  { label: 'Portfolio Report', href: '/dashboard/mortgages/reports/portfolio' },
                ].map((link) => (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => router.push(link.href)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
          ) : null}

          {/* KPIs */}
          {showKpiWidget ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            {visibleKpiCards.map((item) => (
              <div key={item.label} className={`rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-3 shadow-sm backdrop-blur`}>
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}${item.key}`)}
                    className="float-right inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/70 bg-white/85 text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${item.label} widget`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
                <p className={`mt-1 text-lg font-black ${item.tone}`}>{item.value}</p>
              </div>
            ))}
            {visibleKpiCards.length === 0 ? (
              <div className="sm:col-span-2 xl:col-span-4 2xl:col-span-8 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                All KPI widgets are hidden.
              </div>
            ) : null}
          </section>
          ) : null}

          {/* Insight cards */}
          {showInsightsWidget ? (
          <section className="relative grid grid-cols-1 gap-4 md:grid-cols-3">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}insights`)}
                className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide insights widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            {[
              { icon: Banknote, title: 'Portfolio Value Lens', desc: 'Track requested vs approved scale before release decisions.', color: 'text-emerald-700' },
              { icon: CheckCircle2, title: 'Approval Throughput', desc: 'Measure pipeline movement from submitted to approved.', color: 'text-teal-700' },
              { icon: TrendingUp, title: 'Repayment Strength', desc: 'Monitor installment volume for collection planning.', color: 'text-cyan-700' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/90 bg-white/95 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2">
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                  <p className="font-bold text-slate-900">{item.title}</p>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
              </div>
            ))}
          </section>
          ) : null}

          {/* Tabs */}
          {showTabsWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_24px_60px_-34px_rgba(17,94,89,0.45)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}tabs`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide report tabs widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab.id ? 'bg-white/20' : 'bg-white text-slate-700'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                  <p className="text-sm text-slate-500">Building reports...</p>
                </div>
              ) : activeTab === 'running' ? (
                <div>
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">Running Mortgages</h2>
                      <p className="text-sm text-slate-500">Statuses: approved, active, arrears, released</p>
                    </div>
                    <ExportButtons onCsv={exportRunningCsv} onPdf={exportRunningPdf} accent="cyan" />
                  </div>
                  {runningRows.length === 0 ? (
                    <p className="py-12 text-center text-sm text-slate-500">No running mortgages found.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-2xl border border-teal-100">
                        {visibleRunningColumns.length > 0 ? (
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-black">
                                {visibleRunningColumns.map((column) => (
                                  <th key={column.key} className="px-3 py-3 text-black">
                                    <div className="flex items-center justify-between gap-2">
                                      <span>{column.label}</span>
                                      <WidgetCloseGate>
                                        <button
                                          type="button"
                                          onClick={() => void hideWidget(`${widgetPrefix}running_col_${column.key}`)}
                                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                          aria-label={`Hide running ${column.label} column`}
                                        >
                                          ×
                                        </button>
                                      </WidgetCloseGate>
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {pagedRunningRows.map((row, i) => (
                                <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                  {visibleRunningColumns.map((column) => (
                                    <td key={column.key} className="px-3 py-2.5 text-black">
                                      {column.render(row)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="py-8 text-center text-sm text-slate-600">All running table columns are hidden.</div>
                        )}
                      </div>
                      {runningRows.length > PAGE_SIZE && (
                        <Pagination
                          page={runningPage}
                          lastPage={runningLastPage}
                          onPrev={() => setRunningPage((p) => Math.max(1, p - 1))}
                          onNext={() => setRunningPage((p) => Math.min(runningLastPage, p + 1))}
                        />
                      )}
                    </>
                  )}
                </div>
              ) : activeTab === 'rejected' ? (
                <div>
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">Rejected Mortgages</h2>
                      <p className="text-sm text-slate-500">Applications that ended in rejected status</p>
                    </div>
                    <ExportButtons onCsv={exportRejectedCsv} onPdf={exportRejectedPdf} accent="rose" />
                  </div>
                  {rejectedRows.length === 0 ? (
                    <p className="py-12 text-center text-sm text-slate-500">No rejected mortgages found.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-2xl border border-rose-100">
                        {visibleRejectedColumns.length > 0 ? (
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-black">
                                {visibleRejectedColumns.map((column) => (
                                  <th key={column.key} className="px-3 py-3 text-black">
                                    <div className="flex items-center justify-between gap-2">
                                      <span>{column.label}</span>
                                      <WidgetCloseGate>
                                        <button
                                          type="button"
                                          onClick={() => void hideWidget(`${widgetPrefix}rejected_col_${column.key}`)}
                                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                          aria-label={`Hide rejected ${column.label} column`}
                                        >
                                          ×
                                        </button>
                                      </WidgetCloseGate>
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-rose-50 bg-white">
                              {pagedRejectedRows.map((row) => (
                                <tr key={row.id}>
                                  {visibleRejectedColumns.map((column) => (
                                    <td key={column.key} className="px-3 py-2.5 text-black">
                                      {column.render(row)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="py-8 text-center text-sm text-slate-600">All rejected table columns are hidden.</div>
                        )}
                      </div>
                      {rejectedRows.length > PAGE_SIZE && (
                        <Pagination
                          page={rejectedPage}
                          lastPage={rejectedLastPage}
                          onPrev={() => setRejectedPage((p) => Math.max(1, p - 1))}
                          onNext={() => setRejectedPage((p) => Math.min(rejectedLastPage, p + 1))}
                        />
                      )}
                    </>
                  )}
                </div>
              ) : activeTab === 'analytics' ? (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-2xl border border-teal-100 bg-teal-50/30 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-teal-700" />
                      <h2 className="text-lg font-extrabold text-slate-900">By Mortgage Type</h2>
                    </div>
                    <div className="space-y-3">
                      {byType.length === 0 ? (
                        <p className="text-sm text-slate-500">No data available.</p>
                      ) : (
                        byType.map((item) => (
                          <div key={item.type} className="rounded-xl border border-white bg-white/90 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold capitalize text-slate-900">{item.type}</p>
                              <span className="text-sm font-bold text-teal-700">{item.count}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
                                style={{ width: `${(item.count / maxTypeCount) * 100}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-slate-600">
                              Approved {formatAmount(item.approved)} • Requested {formatAmount(item.requested)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-cyan-100 bg-cyan-50/30 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-cyan-700" />
                      <h2 className="text-lg font-extrabold text-slate-900">By Status</h2>
                    </div>
                    <div className="space-y-3">
                      {byStatus.length === 0 ? (
                        <p className="text-sm text-slate-500">No data available.</p>
                      ) : (
                        byStatus.map((item) => (
                          <div key={item.status} className="rounded-xl border border-white bg-white/90 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Badge label={item.status} variant={statusVariant(item.status)} />
                              <span className="text-sm font-bold text-cyan-700">{item.count}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                                style={{ width: `${(item.count / maxStatusCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">Settled Mortgages</h2>
                      <p className="text-sm text-slate-500">Closed accounts with payment history access</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                      {filteredSettledRows.length} records
                    </span>
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="relative md:col-span-2">
                      <input
                        value={settledQuery}
                        onChange={(e) => setSettledQuery(e.target.value)}
                        placeholder="Filter by id or type"
                        className={inputClass}
                      />
                    </div>
                    <input type="date" value={settledFrom} onChange={(e) => setSettledFrom(e.target.value)} className={inputClass} />
                    <input type="date" value={settledTo} onChange={(e) => setSettledTo(e.target.value)} className={inputClass} />
                  </div>
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSettledQuery('');
                        setSettledFrom('');
                        setSettledTo('');
                      }}
                      className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                    >
                      Clear Filters
                    </button>
                  </div>

                  {filteredSettledRows.length === 0 ? (
                    <p className="py-12 text-center text-sm text-slate-500">No settled mortgages found.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-emerald-100">
                      {visibleSettledColumns.length > 0 ? (
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-black">
                              {visibleSettledColumns.map((column) => (
                                <th key={column.key} className="px-3 py-3 text-black">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{column.label}</span>
                                    <WidgetCloseGate>
                                      <button
                                        type="button"
                                        onClick={() => void hideWidget(`${widgetPrefix}settled_col_${column.key}`)}
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                        aria-label={`Hide settled ${column.label} column`}
                                      >
                                        ×
                                      </button>
                                    </WidgetCloseGate>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50 bg-white">
                            {filteredSettledRows.map((row) => (
                              <tr key={row.id}>
                                {visibleSettledColumns.map((column) => (
                                  <td key={column.key} className="px-3 py-2.5 text-black">
                                    {column.render(row)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="py-8 text-center text-sm text-slate-600">All settled table columns are hidden.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
          ) : null}

          {showFooterNoteWidget ? (
            <div className="relative flex items-center gap-2 rounded-2xl border border-teal-100 bg-white/90 px-4 py-3 text-xs text-slate-500 backdrop-blur">
              <Clock3 className="h-4 w-4 shrink-0 text-teal-700" />
              Dedicated mortgage report surface — separate from the global dashboard reports module.
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}footer_note`)}
                  className="absolute right-3 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide reports footer note widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
            </div>
          ) : null}
        </div>

        {/* History modal */}
        {historyOpen && historyMortgage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Payment History #{historyMortgage.id}</h3>
                  <p className="text-sm text-slate-600">Chronological payments for this settled mortgage.</p>
                </div>
                <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50">
                  <X className="h-4 w-4 text-slate-600" />
                </button>
              </div>
              <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-6">
                {historyLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-emerald-700">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading payments...
                  </div>
                ) : historyRows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-500">No payments found for this mortgage.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-2xl border border-emerald-100">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wide text-black">
                            <th className="px-3 py-2 text-black">ID</th>
                            <th className="px-3 py-2 text-black">Paid Date</th>
                            <th className="px-3 py-2 text-black">Amount</th>
                            <th className="px-3 py-2 text-black">Method</th>
                            <th className="px-3 py-2 text-black">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-50">
                          {historyRows.map((p) => (
                            <tr key={p.id}>
                              <td className="px-3 py-2 font-semibold text-slate-900">#{p.id}</td>
                              <td className="px-3 py-2">{formatDate(p.paid_date)}</td>
                              <td className="px-3 py-2 font-bold text-emerald-700">{formatAmount(p.amount)}</td>
                              <td className="px-3 py-2 capitalize">{p.payment_method || '—'}</td>
                              <td className="px-3 py-2">{p.remarks || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <ExportButtons onCsv={exportHistoryCsv} onPdf={exportHistoryPdf} accent="emerald" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientMountGate>
  );
}
