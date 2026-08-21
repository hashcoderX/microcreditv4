'use client';

import axios from 'axios';
import { getApiBaseUrl, getBackendOrigin } from '@/lib/api';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type LoanRow = {
  id: number;
  customer_no?: string | null;
  customer_name?: string | null;
  field_officer?: string | null;
  status?: string | null;
  refundable_amount?: number | string | null;
  loan_amount?: number | string | null;
  installment_amount?: number | string | null;
  arrears_balance?: number | string | null;
  due_date?: string | null;
  next_payment_date?: string | null;
  center?: { id: number; name?: string | null; code?: string | null } | null;
  group?: { id: number; name?: string | null; code?: string | null } | null;
};

type CollectionRow = {
  mf_loan_request_id: number | string;
  collected_amount?: number | string | null;
  collection_date?: string | null;
};

type RepaymentRow = {
  loanId: number;
  customerNo: string;
  customerName: string;
  centerName: string;
  centerCode: string;
  groupName: string;
  groupCode: string;
  fieldOfficer: string;
  loanStatus: string;
  loanAmount: number;
  dueAmount: number;
  arrearsBalance: number;
  refundableAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  repaymentRate: number;
  dueDate: string;
  nextPaymentDate: string;
  overdueDays: number;
  repaymentStatus: 'excellent' | 'good' | 'watch' | 'critical';
};

const API_BASE = getApiBaseUrl();

export default function RepaymentReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RepaymentRow[]>([]);
  const [collectionRows, setCollectionRows] = useState<CollectionRow[]>([]);
  const [officerFilter, setOfficerFilter] = useState('all');
  const [repaymentFilter, setRepaymentFilter] = useState<'all' | 'excellent' | 'good' | 'watch' | 'critical'>('all');
  const [centerFilter, setCenterFilter] = useState('all');
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

  const branchId = Number(searchParams.get('branch_id') || 0) || undefined;
  const widgetPrefix = 'mf_repayment_widget_';

  const fetchWidgetPreferences = async (authToken: string) => {
    setLoadingWidgets(true);
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
        { headers: { Authorization: `Bearer ${token}` } }
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
        setCollectionRows(collections);

        const paidByLoan = new Map<number, number>();
        collections.forEach((collection) => {
          const loanId = Number(collection.mf_loan_request_id || 0);
          if (!loanId) return;
          paidByLoan.set(loanId, (paidByLoan.get(loanId) || 0) + Number(collection.collected_amount || 0));
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const mapped: RepaymentRow[] = loans
          .filter((loan) => {
            const status = String(loan.status || '').toLowerCase();
            return status === 'approved' || status === 'released' || status === 'completed';
          })
          .map((loan) => {
            const loanId = Number(loan.id || 0);
            const refundableAmount = Number(loan.refundable_amount || 0);
            const collectedAmount = paidByLoan.get(loanId) || 0;
            const pendingAmount = Math.max(refundableAmount - collectedAmount, 0);
            const repaymentRate = refundableAmount > 0 ? (collectedAmount / refundableAmount) * 100 : 0;

            const dueDateText = String(loan.due_date || '').slice(0, 10);
            const dueDate = dueDateText ? new Date(`${dueDateText}T00:00:00`) : null;
            const overdueDays =
              dueDate && !Number.isNaN(dueDate.getTime()) && pendingAmount > 0
                ? Math.max(Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)), 0)
                : 0;

            let repaymentStatus: RepaymentRow['repaymentStatus'] = 'good';
            if (repaymentRate >= 90) repaymentStatus = 'excellent';
            else if (repaymentRate >= 70) repaymentStatus = 'good';
            else if (repaymentRate >= 40 || overdueDays <= 15) repaymentStatus = 'watch';
            else repaymentStatus = 'critical';

            return {
              loanId,
              customerNo: String(loan.customer_no || '-'),
              customerName: String(loan.customer_name || '-'),
              centerName: String(loan.center?.name || 'Unassigned Center'),
              centerCode: String(loan.center?.code || '-'),
              groupName: String(loan.group?.name || 'Ungrouped'),
              groupCode: String(loan.group?.code || '-'),
              fieldOfficer: String(loan.field_officer || 'Unassigned'),
              loanStatus: String(loan.status || '-'),
              loanAmount: Number(loan.loan_amount || 0),
              dueAmount: Number(loan.installment_amount || 0),
              arrearsBalance: Number(loan.arrears_balance || 0),
              refundableAmount,
              collectedAmount,
              pendingAmount,
              repaymentRate,
              dueDate: dueDateText || '-',
              nextPaymentDate: String(loan.next_payment_date || '').slice(0, 10) || '-',
              overdueDays,
              repaymentStatus,
            };
          })
          .sort((a, b) => b.pendingAmount - a.pendingAmount);

        setRows(mapped);
      } catch {
        setRows([]);
        setCollectionRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [token, branchId]);

  const officerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.fieldOfficer))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const centerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.centerName))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (officerFilter !== 'all' && row.fieldOfficer.toLowerCase() !== officerFilter) {
        return false;
      }

      if (repaymentFilter !== 'all' && row.repaymentStatus !== repaymentFilter) {
        return false;
      }

      return true;
    });
  }, [rows, officerFilter, repaymentFilter]);

  const monthPaidByLoan = useMemo(() => {
    const monthKey = reportMonth.trim();
    const map = new Map<number, number>();

    collectionRows.forEach((row) => {
      const loanId = Number(row.mf_loan_request_id || 0);
      if (!loanId) return;

      const rawDate = String(row.collection_date || '').slice(0, 10);
      if (monthKey && rawDate && !rawDate.startsWith(monthKey)) return;

      map.set(loanId, (map.get(loanId) || 0) + Number(row.collected_amount || 0));
    });

    return map;
  }, [collectionRows, reportMonth]);

  const centerReportRows = useMemo(() => {
    return rows
      .filter((row) => centerFilter === 'all' || row.centerName.toLowerCase() === centerFilter)
      .sort((a, b) => {
        if (a.centerName !== b.centerName) return a.centerName.localeCompare(b.centerName);
        if (a.groupName !== b.groupName) return a.groupName.localeCompare(b.groupName);
        return a.customerName.localeCompare(b.customerName);
      });
  }, [rows, centerFilter]);

  const centerSectionSummary = useMemo(() => {
    return centerReportRows.reduce(
      (acc, row) => {
        acc.members += 1;
        acc.loanAmount += row.loanAmount;
        acc.dueAmount += row.dueAmount;
        acc.balance += row.pendingAmount;
        acc.arrears += row.arrearsBalance;
        acc.monthPaid += monthPaidByLoan.get(row.loanId) || 0;
        return acc;
      },
      { members: 0, loanAmount: 0, dueAmount: 0, balance: 0, arrears: 0, monthPaid: 0 }
    );
  }, [centerReportRows, monthPaidByLoan]);

  const centerGroupedRows = useMemo(() => {
    const centerMap = new Map<
      string,
      {
        key: string;
        centerName: string;
        centerCode: string;
        rows: RepaymentRow[];
        groupMap: Map<string, RepaymentRow[]>;
      }
    >();

    centerReportRows.forEach((row) => {
      const centerKey = `${row.centerCode}__${row.centerName}`;
      if (!centerMap.has(centerKey)) {
        centerMap.set(centerKey, {
          key: centerKey,
          centerName: row.centerName,
          centerCode: row.centerCode,
          rows: [],
          groupMap: new Map<string, RepaymentRow[]>(),
        });
      }

      const centerEntry = centerMap.get(centerKey)!;
      centerEntry.rows.push(row);

      const groupKey = `${row.groupCode}__${row.groupName}`;
      if (!centerEntry.groupMap.has(groupKey)) {
        centerEntry.groupMap.set(groupKey, []);
      }
      centerEntry.groupMap.get(groupKey)!.push(row);
    });

    return Array.from(centerMap.values());
  }, [centerReportRows]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.loanAmount += row.loanAmount;
        acc.refundable += row.refundableAmount;
        acc.collected += row.collectedAmount;
        acc.pending += row.pendingAmount;
        acc.repaymentRate += row.repaymentRate;
        if (row.repaymentStatus === 'excellent') acc.excellent += 1;
        if (row.repaymentStatus === 'good') acc.good += 1;
        if (row.repaymentStatus === 'watch') acc.watch += 1;
        if (row.repaymentStatus === 'critical') acc.critical += 1;
        return acc;
      },
      {
        count: 0,
        loanAmount: 0,
        refundable: 0,
        collected: 0,
        pending: 0,
        repaymentRate: 0,
        excellent: 0,
        good: 0,
        watch: 0,
        critical: 0,
      }
    );
  }, [filteredRows]);

  const averageRepaymentRate = summary.count > 0 ? summary.repaymentRate / summary.count : 0;

  const formatMoney = (value: number) => Number(value || 0).toFixed(2);
  const summaryCards = [
    {
      key: `${widgetPrefix}summary_active_accounts`,
      label: 'Active Accounts',
      value: String(summary.count),
      valueClass: 'text-slate-900',
    },
    {
      key: `${widgetPrefix}summary_refundable`,
      label: 'Refundable',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.refundable),
      valueClass: 'text-slate-900',
    },
    {
      key: `${widgetPrefix}summary_collected`,
      label: 'Collected',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.collected),
      valueClass: 'text-emerald-700',
    },
    {
      key: `${widgetPrefix}summary_pending`,
      label: 'Pending',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.pending),
      valueClass: 'text-rose-700',
    },
    {
      key: `${widgetPrefix}summary_avg_repayment`,
      label: 'Avg Repayment %',
      value: `${averageRepaymentRate.toFixed(2)}%`,
      valueClass: 'text-indigo-700',
    },
    {
      key: `${widgetPrefix}summary_excellent_critical`,
      label: 'Excellent / Critical',
      value: `${summary.excellent} / ${summary.critical}`,
      valueClass: 'text-slate-900',
    },
  ];
  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showRepaymentAccountsSection = !hiddenWidgetKeys.has(`${widgetPrefix}accounts_section`);
  const showCenterRepaymentSection = !hiddenWidgetKeys.has(`${widgetPrefix}center_section`);

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

  const tableColumns: Array<{
    key: string;
    label: string;
    render: (row: RepaymentRow) => ReactNode;
    tdClassName?: string;
  }> = [
    { key: 'loan_id', label: 'Loan ID', render: (row) => row.loanId },
    { key: 'customer_no', label: 'Customer No', render: (row) => row.customerNo, tdClassName: 'font-semibold text-slate-900' },
    { key: 'customer_name', label: 'Customer', render: (row) => row.customerName },
    { key: 'field_officer', label: 'Field Officer', render: (row) => row.fieldOfficer },
    { key: 'loan_status', label: 'Loan Status', render: (row) => row.loanStatus, tdClassName: 'capitalize' },
    { key: 'refundable', label: 'Refundable', render: (row) => formatMoney(row.refundableAmount) },
    { key: 'collected', label: 'Collected', render: (row) => formatMoney(row.collectedAmount), tdClassName: 'text-emerald-700 font-semibold' },
    { key: 'pending', label: 'Pending', render: (row) => formatMoney(row.pendingAmount), tdClassName: 'text-rose-700 font-semibold' },
    { key: 'repayment_rate', label: 'Repayment %', render: (row) => `${row.repaymentRate.toFixed(2)}%`, tdClassName: 'font-semibold text-indigo-700' },
    { key: 'due_date', label: 'Due Date', render: (row) => formatDate(row.dueDate) },
    { key: 'next_payment', label: 'Next Payment', render: (row) => formatDate(row.nextPaymentDate) },
    { key: 'overdue_days', label: 'Overdue Days', render: (row) => row.overdueDays },
    {
      key: 'repayment_status',
      label: 'Repayment Status',
      render: (row) => (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
          row.repaymentStatus === 'excellent'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : row.repaymentStatus === 'good'
            ? 'border-cyan-200 bg-cyan-50 text-cyan-800'
            : row.repaymentStatus === 'watch'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          {row.repaymentStatus}
        </span>
      ),
    },
  ];
  const visibleTableColumns = tableColumns.filter(
    (column) => !hiddenWidgetKeys.has(`${widgetPrefix}table_col_${column.key}`)
  );

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
      'Pending Amount',
      'Repayment Rate (%)',
      'Due Date',
      'Next Payment Date',
      'Overdue Days',
      'Repayment Status',
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
      row.repaymentRate.toFixed(2),
      formatDate(row.dueDate),
      formatDate(row.nextPaymentDate),
      row.overdueDays,
      row.repaymentStatus,
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `repayment-report-${getReportFileDate()}.csv`;
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
    const statusText = `Repayment Status: ${repaymentFilter}`;

    doc.setFontSize(16);
    doc.text('Re-Payment Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`${officerText} | ${statusText} | Generated: ${generatedAt}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [[
        'Loan ID',
        'Customer No',
        'Customer',
        'Officer',
        'Refundable',
        'Collected',
        'Pending',
        'Rate %',
        'Overdue Days',
        'Status',
      ]],
      body: filteredRows.map((row) => [
        row.loanId,
        row.customerNo,
        row.customerName,
        row.fieldOfficer,
        formatMoney(row.refundableAmount),
        formatMoney(row.collectedAmount),
        formatMoney(row.pendingAmount),
        row.repaymentRate.toFixed(2),
        row.overdueDays,
        row.repaymentStatus,
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [67, 56, 202],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [238, 242, 255],
      },
      margin: { left: 24, right: 24, top: 72, bottom: 24 },
      theme: 'striped',
    });

    doc.save(`repayment-report-${getReportFileDate()}.pdf`);
  };

  if (!token || loading || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-blue-300 blur-3xl"></div>
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-300 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        <div className="bg-white/82 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(14,116,144,0.45)] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 border border-cyan-100">
                Reports Desk
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Re-Payment Report</h1>
              <p className="text-sm text-slate-600 mt-1">Review repayment performance, overdue pressure, and recovery progress by account.</p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold border border-slate-200 shadow-sm"
            >
              Back
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {visibleSummaryCards.map((card) => (
              <div key={card.key} className="relative rounded-xl bg-white/90 border border-white shadow-sm p-4">
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
                <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className={`text-2xl font-extrabold mt-1 ${card.valueClass}`}>{card.value}</p>
              </div>
            ))}
          </div>
          {visibleSummaryCards.length === 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              All summary widgets are hidden. Restore from dashboard with admin approval.
            </div>
          )}
        </div>

        {showRepaymentAccountsSection && (
        <div className="relative bg-white/86 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] p-4 md:p-5">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}accounts_section`)}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide repayment accounts widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Repayment Accounts</h2>
            <div className="flex items-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="px-3 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-sm font-semibold border border-emerald-200"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="px-3 py-2 rounded-xl bg-cyan-100 hover:bg-cyan-200 text-cyan-800 text-sm font-semibold border border-cyan-200"
              >
                Download PDF
              </button>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Officer</label>
                <select
                  value={officerFilter}
                  onChange={(e) => setOfficerFilter(e.target.value)}
                  className="mt-1 px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900"
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
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Repayment</label>
                <select
                  value={repaymentFilter}
                  onChange={(e) => setRepaymentFilter(e.target.value as 'all' | 'excellent' | 'good' | 'watch' | 'critical')}
                  className="mt-1 px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900"
                >
                  <option value="all">All</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="watch">Watch</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOfficerFilter('all');
                  setRepaymentFilter('all');
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
              >
                Reset
              </button>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-100/60 to-teal-100/40 p-8 text-sm text-slate-700 text-center">
              No repayment data found for selected filters.
            </div>
          ) : visibleTableColumns.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800 text-center">
              All table columns are hidden. Restore from dashboard with admin approval.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100">
              <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                <thead className="bg-cyan-50/70 text-slate-700">
                  <tr>
                    {visibleTableColumns.map((column) => (
                      <th key={column.key} className="relative px-3 py-2 font-semibold">
                        {column.label}
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => void hideWidget(`${widgetPrefix}table_col_${column.key}`)}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Hide ${column.label} column`}
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.loanId} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors">
                      {visibleTableColumns.map((column) => (
                        <td key={`${row.loanId}-${column.key}`} className={`px-3 py-2 ${column.tdClassName || ''}`}>
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {showCenterRepaymentSection && (
        <div className="relative bg-white/86 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] p-4 md:p-5">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}center_section`)}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide center repayment widget"
            >
              ×
            </button>
          </WidgetCloseGate>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Center-Based Repayment</h2>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Select Center</label>
                <select
                  value={centerFilter}
                  onChange={(e) => setCenterFilter(e.target.value)}
                  className="mt-1 px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900"
                >
                  <option value="all">All Centers</option>
                  {centerOptions.map((center) => (
                    <option key={center} value={center.toLowerCase()}>
                      {center}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Month</label>
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="mt-1 px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-700">Members</p>
              <p className="text-xl font-extrabold text-slate-900">{centerSectionSummary.members}</p>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-700">Loan Amount</p>
              <p className="text-xl font-extrabold text-slate-900">{formatMoney(centerSectionSummary.loanAmount)}</p>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-700">Due Amount</p>
              <p className="text-xl font-extrabold text-slate-900">{formatMoney(centerSectionSummary.dueAmount)}</p>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-700">Total Balance</p>
              <p className="text-xl font-extrabold text-rose-700">{formatMoney(centerSectionSummary.balance)}</p>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-700">Arrears</p>
              <p className="text-xl font-extrabold text-amber-700">{formatMoney(centerSectionSummary.arrears)}</p>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-700">Paid ({reportMonth || 'All'})</p>
              <p className="text-xl font-extrabold text-emerald-700">{formatMoney(centerSectionSummary.monthPaid)}</p>
            </div>
          </div>

          {centerGroupedRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-100/60 to-teal-100/40 p-8 text-sm text-slate-700 text-center">
              No center-based repayment data found.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100">
              <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                <thead className="bg-cyan-50/70 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Member No</th>
                    <th className="px-3 py-2 font-semibold">Member Name</th>
                    <th className="px-3 py-2 font-semibold">Loan Amount</th>
                    <th className="px-3 py-2 font-semibold">Due Amount</th>
                    <th className="px-3 py-2 font-semibold">Total Balance</th>
                    <th className="px-3 py-2 font-semibold">Arrears</th>
                    <th className="px-3 py-2 font-semibold">Paid ({reportMonth || 'All'})</th>
                    <th className="px-3 py-2 font-semibold">Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {centerGroupedRows.map((centerBlock) => {
                    const centerTotal = centerBlock.rows.reduce(
                      (acc, row) => {
                        acc.loan += row.loanAmount;
                        acc.due += row.dueAmount;
                        acc.balance += row.pendingAmount;
                        acc.arrears += row.arrearsBalance;
                        acc.paid += monthPaidByLoan.get(row.loanId) || 0;
                        return acc;
                      },
                      { loan: 0, due: 0, balance: 0, arrears: 0, paid: 0 }
                    );

                    return (
                      <Fragment key={`center-block-${centerBlock.key}`}>
                        <tr className="bg-slate-200/80 border-t border-slate-300">
                          <td colSpan={8} className="px-3 py-2 font-bold text-slate-900 uppercase tracking-wide">
                            {centerBlock.centerName} ({centerBlock.centerCode})
                          </td>
                        </tr>

                        {Array.from(centerBlock.groupMap.entries()).map(([groupKey, groupRows]) => {
                          const [groupCode, groupName] = groupKey.split('__');
                          const groupTotal = groupRows.reduce(
                            (acc, row) => {
                              acc.loan += row.loanAmount;
                              acc.due += row.dueAmount;
                              acc.balance += row.pendingAmount;
                              acc.arrears += row.arrearsBalance;
                              acc.paid += monthPaidByLoan.get(row.loanId) || 0;
                              return acc;
                            },
                            { loan: 0, due: 0, balance: 0, arrears: 0, paid: 0 }
                          );

                          return (
                            <Fragment key={`group-block-${centerBlock.key}-${groupKey}`}>
                              <tr className="bg-slate-100 border-t border-slate-200">
                                <td colSpan={8} className="px-3 py-2 font-semibold text-slate-800">
                                  Group {groupCode} - {groupName}
                                </td>
                              </tr>

                              {groupRows.map((row) => (
                                <tr key={`center-${centerBlock.key}-group-${groupKey}-loan-${row.loanId}`} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors">
                                  <td className="px-3 py-2 font-semibold text-slate-900">{row.customerNo}</td>
                                  <td className="px-3 py-2">{row.customerName}</td>
                                  <td className="px-3 py-2">{formatMoney(row.loanAmount)}</td>
                                  <td className="px-3 py-2">{formatMoney(row.dueAmount)}</td>
                                  <td className="px-3 py-2 text-rose-700 font-semibold">{formatMoney(row.pendingAmount)}</td>
                                  <td className="px-3 py-2 text-amber-700 font-semibold">{formatMoney(row.arrearsBalance)}</td>
                                  <td className="px-3 py-2 text-emerald-700 font-semibold">{formatMoney(monthPaidByLoan.get(row.loanId) || 0)}</td>
                                  <td className="px-3 py-2">-</td>
                                </tr>
                              ))}

                              <tr className="bg-cyan-100/70 border-b border-cyan-200 font-bold">
                                <td className="px-3 py-2">Group Total</td>
                                <td className="px-3 py-2">-</td>
                                <td className="px-3 py-2">{formatMoney(groupTotal.loan)}</td>
                                <td className="px-3 py-2">{formatMoney(groupTotal.due)}</td>
                                <td className="px-3 py-2">{formatMoney(groupTotal.balance)}</td>
                                <td className="px-3 py-2">{formatMoney(groupTotal.arrears)}</td>
                                <td className="px-3 py-2">{formatMoney(groupTotal.paid)}</td>
                                <td className="px-3 py-2">-</td>
                              </tr>
                            </Fragment>
                          );
                        })}

                        <tr className="bg-cyan-200/70 border-y border-cyan-300 font-extrabold text-slate-900">
                          <td className="px-3 py-2">Center Total</td>
                          <td className="px-3 py-2">-</td>
                          <td className="px-3 py-2">{formatMoney(centerTotal.loan)}</td>
                          <td className="px-3 py-2">{formatMoney(centerTotal.due)}</td>
                          <td className="px-3 py-2">{formatMoney(centerTotal.balance)}</td>
                          <td className="px-3 py-2">{formatMoney(centerTotal.arrears)}</td>
                          <td className="px-3 py-2">{formatMoney(centerTotal.paid)}</td>
                          <td className="px-3 py-2">-</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
        {!showRepaymentAccountsSection && visibleSummaryCards.length === 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            All widgets on this page are hidden. Use "Restore Hidden Widgets" on dashboard to show them again.
          </div>
        )}
      </div>
      {widgetNotice.open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setWidgetNotice({ open: false, title: '', message: '' })} />
          <div className="relative w-full max-w-sm rounded-2xl border border-cyan-100 bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">{widgetNotice.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{widgetNotice.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
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
