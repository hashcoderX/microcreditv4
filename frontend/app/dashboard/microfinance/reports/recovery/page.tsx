'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type LoanRow = {
  id: number;
  customer_no?: string | null;
  customer_name?: string | null;
  field_officer?: string | null;
  status?: string | null;
  refundable_amount?: number | string | null;
  loan_balance?: number | string | null;
  loan_amount?: number | string | null;
  arrears_balance?: number | string | null;
  due_date?: string | null;
  next_payment_date?: string | null;
};

type CollectionRow = {
  mf_loan_request_id: number | string;
  collected_amount?: number | string | null;
};

type RecoveryRow = {
  loanId: number;
  customerNo: string;
  customerName: string;
  fieldOfficer: string;
  loanStatus: string;
  loanAmount: number;
  refundableAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  arrearsAmount: number;
  dueDate: string;
  nextPaymentDate: string;
  overdueDays: number;
  recoveryPriority: 'urgent' | 'high' | 'medium' | 'low';
};

const API_BASE = getApiBaseUrl();

const buildConicGradient = (segments: Array<{ value: number; color: string }>): string => {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  if (total <= 0) {
    return 'conic-gradient(#e2e8f0 0deg 360deg)';
  }

  let running = 0;
  const parts: string[] = [];
  segments.forEach((segment) => {
    const value = Math.max(segment.value, 0);
    if (value <= 0) return;

    const start = (running / total) * 360;
    running += value;
    const end = (running / total) * 360;
    parts.push(`${segment.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
  });

  return parts.length > 0
    ? `conic-gradient(${parts.join(', ')})`
    : 'conic-gradient(#e2e8f0 0deg 360deg)';
};

export default function RecoveryReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecoveryRow[]>([]);
  const [officerFilter, setOfficerFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const branchId = Number(searchParams.get('branch_id') || 0) || undefined;

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
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

        const paidByLoan = new Map<number, number>();
        collections.forEach((collection) => {
          const loanId = Number(collection.mf_loan_request_id || 0);
          if (!loanId) return;
          paidByLoan.set(loanId, (paidByLoan.get(loanId) || 0) + Number(collection.collected_amount || 0));
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const mapped: RecoveryRow[] = loans
          .filter((loan) => {
            const status = String(loan.status || '').toLowerCase();
            return status === 'approved' || status === 'released' || status === 'completed';
          })
          .map((loan) => {
            const loanId = Number(loan.id || 0);
            const refundableAmount = Number(loan.refundable_amount || 0);
            const collectedAmount = paidByLoan.get(loanId) || 0;
            const backendOutstandingAmount = Number(loan.loan_balance || 0);
            const derivedOutstandingAmount = Math.max(refundableAmount - collectedAmount, 0);
            const pendingAmount = Math.max(backendOutstandingAmount, derivedOutstandingAmount, 0);
            const arrearsAmount = Math.max(Number(loan.arrears_balance || 0), 0);

            const dueDateText = String(loan.due_date || '').slice(0, 10);
            const dueDate = dueDateText ? new Date(`${dueDateText}T00:00:00`) : null;
            const overdueDays =
              dueDate && !Number.isNaN(dueDate.getTime()) && pendingAmount > 0
                ? Math.max(Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)), 0)
                : 0;

            let recoveryPriority: RecoveryRow['recoveryPriority'] = 'low';
            if (arrearsAmount >= 100000 || overdueDays >= 60 || pendingAmount >= 500000) {
              recoveryPriority = 'urgent';
            } else if (arrearsAmount > 0 || overdueDays >= 30 || pendingAmount >= 250000) {
              recoveryPriority = 'high';
            } else if (overdueDays > 0 || pendingAmount > 0) {
              recoveryPriority = 'medium';
            }

            return {
              loanId,
              customerNo: String(loan.customer_no || '-'),
              customerName: String(loan.customer_name || '-'),
              fieldOfficer: String(loan.field_officer || 'Unassigned'),
              loanStatus: String(loan.status || '-'),
              loanAmount: Number(loan.loan_amount || 0),
              refundableAmount,
              collectedAmount,
              pendingAmount,
              arrearsAmount,
              dueDate: dueDateText || '-',
              nextPaymentDate: String(loan.next_payment_date || '').slice(0, 10) || '-',
              overdueDays,
              recoveryPriority,
            };
          })
          .filter((row) => row.pendingAmount > 0 || row.arrearsAmount > 0)
          .sort((a, b) => {
            const rank = { urgent: 4, high: 3, medium: 2, low: 1 };
            if (rank[b.recoveryPriority] !== rank[a.recoveryPriority]) {
              return rank[b.recoveryPriority] - rank[a.recoveryPriority];
            }
            return b.pendingAmount + b.arrearsAmount - (a.pendingAmount + a.arrearsAmount);
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

  const officerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.fieldOfficer))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (officerFilter !== 'all' && row.fieldOfficer.toLowerCase() !== officerFilter) {
        return false;
      }

      if (priorityFilter !== 'all' && row.recoveryPriority !== priorityFilter) {
        return false;
      }

      return true;
    });
  }, [rows, officerFilter, priorityFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [officerFilter, priorityFilter, rows.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filteredRows.length);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.loanAmount += row.loanAmount;
        acc.refundable += row.refundableAmount;
        acc.collected += row.collectedAmount;
        acc.pending += row.pendingAmount;
        acc.arrears += row.arrearsAmount;
        if (row.recoveryPriority === 'urgent') acc.urgent += 1;
        if (row.recoveryPriority === 'high') acc.high += 1;
        if (row.recoveryPriority === 'medium') acc.medium += 1;
        if (row.recoveryPriority === 'low') acc.low += 1;
        return acc;
      },
      {
        count: 0,
        loanAmount: 0,
        refundable: 0,
        collected: 0,
        pending: 0,
        arrears: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      }
    );
  }, [filteredRows]);

  const totalExposure = useMemo(() => summary.pending + summary.arrears, [summary.pending, summary.arrears]);
  const urgentHighRatio = useMemo(() => {
    if (summary.count <= 0) return 0;
    return ((summary.urgent + summary.high) / summary.count) * 100;
  }, [summary.count, summary.urgent, summary.high]);

  const priorityChartData = useMemo(
    () => [
      { label: 'Urgent', value: summary.urgent, color: '#ef4444' },
      { label: 'High', value: summary.high, color: '#f97316' },
      { label: 'Medium', value: summary.medium, color: '#f59e0b' },
      { label: 'Low', value: summary.low, color: '#10b981' },
    ],
    [summary.urgent, summary.high, summary.medium, summary.low]
  );

  const priorityTotal = useMemo(
    () => priorityChartData.reduce((sum, item) => sum + item.value, 0),
    [priorityChartData]
  );

  const priorityChartBackground = useMemo(
    () => buildConicGradient(priorityChartData),
    [priorityChartData]
  );

  const amountChartData = useMemo(
    () => [
      { label: 'Outstanding', value: summary.pending, color: '#e11d48' },
      { label: 'Arrears', value: summary.arrears, color: '#ea580c' },
      { label: 'Collected', value: summary.collected, color: '#059669' },
    ],
    [summary.pending, summary.arrears, summary.collected]
  );

  const amountTotal = useMemo(
    () => amountChartData.reduce((sum, item) => sum + item.value, 0),
    [amountChartData]
  );

  const amountChartBackground = useMemo(
    () => buildConicGradient(amountChartData),
    [amountChartData]
  );

  const formatMoney = (value: number) => Number(value || 0).toFixed(2);

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
      'Loan ID',
      'Customer No',
      'Customer Name',
      'Field Officer',
      'Loan Status',
      'Loan Amount',
      'Refundable Amount',
      'Collected Amount',
      'Outstanding Amount',
      'Arrears Amount',
      'Due Date',
      'Next Payment Date',
      'Overdue Days',
      'Recovery Priority',
    ];

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const body = filteredRows.map((row) => [
      row.loanId,
      row.customerNo,
      row.customerName,
      row.fieldOfficer,
      row.loanStatus,
      formatMoney(row.loanAmount),
      formatMoney(row.refundableAmount),
      formatMoney(row.collectedAmount),
      formatMoney(row.pendingAmount),
      formatMoney(row.arrearsAmount),
      formatDate(row.dueDate),
      formatDate(row.nextPaymentDate),
      row.overdueDays,
      row.recoveryPriority,
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `recovery-report-${getReportFileDate()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleDownloadPdf = () => {
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
    const priorityText = `Priority: ${priorityFilter}`;

    doc.setFontSize(16);
    doc.text('Recovery Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`${officerText} | ${priorityText} | Generated: ${generatedAt}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [[
        'Loan ID',
        'Customer No',
        'Customer',
        'Officer',
        'Outstanding',
        'Arrears',
        'Overdue Days',
        'Priority',
      ]],
      body: filteredRows.map((row) => [
        row.loanId,
        row.customerNo,
        row.customerName,
        row.fieldOfficer,
        formatMoney(row.pendingAmount),
        formatMoney(row.arrearsAmount),
        row.overdueDays,
        row.recoveryPriority,
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [13, 148, 136],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [240, 253, 250],
      },
      margin: { left: 24, right: 24, top: 72, bottom: 24 },
      theme: 'striped',
    });

    doc.save(`recovery-report-${getReportFileDate()}.pdf`);
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#e6f7ff] via-[#eefcf7] to-[#f0f9ff] flex items-center justify-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#e6f7ff] via-[#eefcf7] to-[#f0f9ff] p-6">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-24 left-10 h-80 w-80 rounded-full bg-cyan-300/70 blur-3xl" />
        <div className="absolute top-20 right-0 h-[26rem] w-[26rem] rounded-full bg-emerald-200/70 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-200/70 blur-3xl" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(8,145,178,0.12) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-6">
        <div className="rounded-[2rem] border border-cyan-100/80 bg-gradient-to-br from-[#064e63] via-[#0f766e] to-[#065f46] p-6 text-white shadow-[0_25px_70px_-28px_rgba(6,95,70,0.65)] md:p-7">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100">
                Recovery Intelligence Desk
              </span>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">Recovery Report</h1>
              <p className="mt-1 max-w-3xl text-sm text-cyan-100/95 md:text-base">Monitor recovery portfolio, spotlight at-risk accounts, and drive branch action with clear priority signals.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1">Exposure: {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(totalExposure)}</span>
                <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1">Urgent + High: {urgentHighRatio.toFixed(1)}%</span>
                <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1">Branch Scope: {branchId ? `#${branchId}` : 'All Branches'}</span>
              </div>
            </div>
            <button
              onClick={() => router.back()}
              className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Back
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
              <p className="text-[10px] uppercase tracking-wide text-cyan-100">Recovery Accounts</p>
              <p className="mt-1 text-lg font-black text-white">{summary.count}</p>
            </div>
            <div className="rounded-2xl border border-rose-200/70 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-rose-500">Outstanding</p>
              <p className="mt-1 text-lg font-black text-rose-700">
                {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.pending)}
              </p>
            </div>
            <div className="rounded-2xl border border-orange-200/70 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-orange-500">Arrears</p>
              <p className="mt-1 text-lg font-black text-orange-700">
                {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.arrears)}
              </p>
            </div>
            <div className="rounded-2xl border border-red-200/70 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-red-500">Urgent / High</p>
              <p className="mt-1 text-lg font-black text-red-700">{summary.urgent} / {summary.high}</p>
            </div>
            <div className="rounded-2xl border border-cyan-200/70 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-cyan-500">Medium / Low</p>
              <p className="mt-1 text-lg font-black text-cyan-700">{summary.medium} / {summary.low}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200/70 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-emerald-500">Collected</p>
              <p className="mt-1 text-lg font-black text-emerald-700">
                {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.collected)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-cyan-100 bg-white/90 p-4 shadow-[0_20px_45px_-24px_rgba(14,116,144,0.45)] backdrop-blur-xl md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-cyan-100/80 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">Recovery Portfolio</h2>
              <p className="text-xs text-slate-500">Filter and export account-level recovery priorities.</p>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="rounded-xl border border-emerald-200 bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-200"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="rounded-xl border border-cyan-200 bg-cyan-100 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-200"
              >
                Download PDF
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Officer</label>
              <select
                value={officerFilter}
                onChange={(e) => setOfficerFilter(e.target.value)}
                className="mt-1 rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
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
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as 'all' | 'urgent' | 'high' | 'medium' | 'low')}
                className="mt-1 rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">All</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setOfficerFilter('all');
                setPriorityFilter('all');
              }}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Reset
            </button>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Rows</label>
              <select
                value={String(pageSize)}
                onChange={(e) => setPageSize(Number(e.target.value) || 15)}
                className="mt-1 rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Priority Mix</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
              <div className="flex h-full">
                <div className="bg-red-500" style={{ width: `${summary.count ? (summary.urgent / summary.count) * 100 : 0}%` }} />
                <div className="bg-orange-500" style={{ width: `${summary.count ? (summary.high / summary.count) * 100 : 0}%` }} />
                <div className="bg-amber-400" style={{ width: `${summary.count ? (summary.medium / summary.count) * 100 : 0}%` }} />
                <div className="bg-emerald-500" style={{ width: `${summary.count ? (summary.low / summary.count) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Urgent {summary.urgent}</span>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">High {summary.high}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Medium {summary.medium}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Low {summary.low}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Graphical Preview</p>
                  <h3 className="text-base font-black text-slate-900">Priority Distribution</h3>
                </div>
                <span className="rounded-lg bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-700">Filtered Accounts: {priorityTotal}</span>
              </div>
              <div className="mt-3 flex flex-col items-center gap-4 lg:flex-row lg:items-start">
                <div className="relative h-44 w-44 shrink-0 rounded-full border border-cyan-100 bg-white p-2 shadow-inner">
                  <div className="h-full w-full rounded-full" style={{ backgroundImage: priorityChartBackground }} />
                  <div className="absolute inset-[30%] flex items-center justify-center rounded-full border border-cyan-100 bg-white/95 text-center shadow-sm">
                    <div>
                      <p className="text-lg font-black text-slate-900">{priorityTotal}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Accounts</p>
                    </div>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  {priorityChartData.map((item) => {
                    const percentage = priorityTotal > 0 ? (item.value / priorityTotal) * 100 : 0;
                    return (
                      <div key={item.label} className="rounded-xl border border-slate-100 bg-white p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <p className="text-xs font-semibold text-slate-700">{item.label}</p>
                          </div>
                          <p className="text-sm font-black text-slate-900">{item.value}</p>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{percentage.toFixed(1)}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-white to-emerald-50/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Graphical Preview</p>
                  <h3 className="text-base font-black text-slate-900">Amount Mix</h3>
                </div>
                <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  Total: {new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(amountTotal)}
                </span>
              </div>
              <div className="mt-3 flex flex-col items-center gap-4 lg:flex-row lg:items-start">
                <div className="relative h-44 w-44 shrink-0 rounded-full border border-emerald-100 bg-white p-2 shadow-inner">
                  <div className="h-full w-full rounded-full" style={{ backgroundImage: amountChartBackground }} />
                  <div className="absolute inset-[28%] flex items-center justify-center rounded-full border border-emerald-100 bg-white/95 text-center shadow-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exposure</p>
                      <p className="text-sm font-black text-slate-900">{new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(totalExposure)}</p>
                    </div>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                  {amountChartData.map((item) => {
                    const percentage = amountTotal > 0 ? (item.value / amountTotal) * 100 : 0;
                    return (
                      <div key={item.label} className="rounded-xl border border-slate-100 bg-white p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <p className="text-xs font-semibold text-slate-700">{item.label}</p>
                        </div>
                        <p className="mt-1 text-sm font-black text-slate-900">{new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(item.value)}</p>
                        <p className="text-[11px] text-slate-500">{percentage.toFixed(1)}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-100/60 to-teal-100/40 p-8 text-center text-sm text-slate-700">
              No recovery data found for selected filters.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100 bg-white">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="bg-cyan-50/80 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Loan ID</th>
                    <th className="px-3 py-2 font-semibold">Customer No</th>
                    <th className="px-3 py-2 font-semibold">Customer</th>
                    <th className="px-3 py-2 font-semibold">Field Officer</th>
                    <th className="px-3 py-2 font-semibold">Loan Status</th>
                    <th className="px-3 py-2 font-semibold">Outstanding</th>
                    <th className="px-3 py-2 font-semibold">Arrears</th>
                    <th className="px-3 py-2 font-semibold">Due Date</th>
                    <th className="px-3 py-2 font-semibold">Next Payment</th>
                    <th className="px-3 py-2 font-semibold">Overdue Days</th>
                    <th className="px-3 py-2 font-semibold">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => (
                    <tr key={row.loanId} className="border-b border-cyan-100 transition-colors hover:bg-cyan-50/40 last:border-b-0">
                      <td className="px-3 py-2">{row.loanId}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.customerNo}</td>
                      <td className="px-3 py-2">{row.customerName}</td>
                      <td className="px-3 py-2">{row.fieldOfficer}</td>
                      <td className="px-3 py-2 capitalize">{row.loanStatus}</td>
                      <td className="px-3 py-2 font-semibold text-rose-700">{formatMoney(row.pendingAmount)}</td>
                      <td className="px-3 py-2 font-semibold text-orange-700">{formatMoney(row.arrearsAmount)}</td>
                      <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                      <td className="px-3 py-2">{formatDate(row.nextPaymentDate)}</td>
                      <td className="px-3 py-2">{row.overdueDays}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
                          row.recoveryPriority === 'urgent'
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : row.recoveryPriority === 'high'
                            ? 'border-orange-200 bg-orange-50 text-orange-800'
                            : row.recoveryPriority === 'medium'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}>
                          {row.recoveryPriority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredRows.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-cyan-100 bg-cyan-50/45 px-3 py-2 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {pageStart}-{pageEnd} of {filteredRows.length} rows
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
