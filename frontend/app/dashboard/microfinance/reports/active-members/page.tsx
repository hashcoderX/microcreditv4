'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type ActiveMemberRow = {
  loanId: number;
  customerNo: string;
  customerName: string;
  nic: string;
  contact: string;
  fieldOfficer: string;
  status: string;
  loanAmount: number;
  refundableAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  dueDate: string;
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

const API_BASE = getApiBaseUrl();

export default function MicrofinanceActiveMembersReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchId = searchParams.get('branch_id') || '';
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ActiveMemberRow[]>([]);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [officerFilter, setOfficerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'released'>('all');
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
        if (!key.startsWith('mf_active_members_widget_')) continue;
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
    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
    void fetchWidgetPreferences(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadReport = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/reports/active-members`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          params: {
            branch_id: branchId,
          },
        });

        const apiRows: unknown[] = Array.isArray(response.data?.rows) ? response.data.rows : [];
        const mapped: ActiveMemberRow[] = apiRows.map((raw: unknown) => {
          const row = (raw ?? {}) as Record<string, unknown>;
          return {
            loanId: Number(row.loanId || 0),
            customerNo: String(row.customerNo || '-'),
            customerName: String(row.customerName || '-'),
            nic: String(row.nic || '-'),
            contact: String(row.contact || '-'),
            fieldOfficer: String(row.fieldOfficer || 'Unassigned'),
            status: String(row.status || '-'),
            loanAmount: Number(row.loanAmount || 0),
            refundableAmount: Number(row.refundableAmount || 0),
            collectedAmount: Number(row.collectedAmount || 0),
            pendingAmount: Number(row.pendingAmount || 0),
            dueDate: String(row.dueDate || '-'),
          };
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

      if (statusFilter !== 'all' && row.status.toLowerCase() !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [rows, officerFilter, statusFilter]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.memberCount += 1;
        acc.loanAmount += row.loanAmount;
        acc.refundable += row.refundableAmount;
        acc.collected += row.collectedAmount;
        acc.pending += row.pendingAmount;
        return acc;
      },
      {
        memberCount: 0,
        loanAmount: 0,
        refundable: 0,
        collected: 0,
        pending: 0,
      }
    );
  }, [filteredRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [officerFilter, statusFilter, rows.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filteredRows.length);

  const summaryCards = [
    {
      key: 'mf_active_members_widget_summary_member_count',
      label: 'Active Members (Outstanding)',
      value: String(summary.memberCount),
      valueClass: 'text-slate-900',
    },
    {
      key: 'mf_active_members_widget_summary_loan_amount',
      label: 'Loan Amount',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.loanAmount),
      valueClass: 'text-slate-900',
    },
    {
      key: 'mf_active_members_widget_summary_refundable',
      label: 'Refundable',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.refundable),
      valueClass: 'text-slate-900',
    },
    {
      key: 'mf_active_members_widget_summary_collected',
      label: 'Collected',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.collected),
      valueClass: 'text-emerald-700',
    },
    {
      key: 'mf_active_members_widget_summary_pending',
      label: 'Pending',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.pending),
      valueClass: 'text-rose-700',
    },
  ];

  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showActionToolbar = !hiddenWidgetKeys.has('mf_active_members_widget_action_toolbar');

  const tableColumns = [
    { key: 'loanId', label: 'Loan ID' },
    { key: 'customerNo', label: 'Customer No' },
    { key: 'customer', label: 'Customer' },
    { key: 'nic', label: 'NIC' },
    { key: 'contact', label: 'Contact' },
    { key: 'fieldOfficer', label: 'Field Officer' },
    { key: 'status', label: 'Status' },
    { key: 'loanAmount', label: 'Loan Amount' },
    { key: 'refundable', label: 'Refundable' },
    { key: 'collected', label: 'Collected' },
    { key: 'pending', label: 'Pending' },
    { key: 'dueDate', label: 'Due Date' },
  ];
  const visibleTableColumns = tableColumns.filter(
    (column) => !hiddenWidgetKeys.has(`mf_active_members_widget_col_${column.key}`)
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
      'NIC',
      'Contact',
      'Field Officer',
      'Status',
      'Loan Amount',
      'Refundable Amount',
      'Collected Amount',
      'Pending Amount',
      'Due Date',
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
      row.nic,
      row.contact,
      row.fieldOfficer,
      row.status,
      formatMoney(row.loanAmount),
      formatMoney(row.refundableAmount),
      formatMoney(row.collectedAmount),
      formatMoney(row.pendingAmount),
      formatDate(row.dueDate),
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `active-member-report-${getReportFileDate()}.csv`;
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

    doc.setFontSize(16);
    doc.text('Active Member Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`${officerText} | ${statusText} | Generated: ${generatedAt}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [[
        'Loan ID',
        'Customer No',
        'Customer Name',
        'NIC',
        'Contact',
        'Field Officer',
        'Status',
        'Loan',
        'Refundable',
        'Collected',
        'Pending',
        'Due Date',
      ]],
      body: filteredRows.map((row) => [
        row.loanId,
        row.customerNo,
        row.customerName,
        row.nic,
        row.contact,
        row.fieldOfficer,
        row.status,
        formatMoney(row.loanAmount),
        formatMoney(row.refundableAmount),
        formatMoney(row.collectedAmount),
        formatMoney(row.pendingAmount),
        formatDate(row.dueDate),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [236, 253, 245],
      },
      margin: { left: 24, right: 24, top: 72, bottom: 24 },
      theme: 'striped',
    });

    doc.save(`active-member-report-${getReportFileDate()}.pdf`);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    router.push('/');
  };

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_8%_12%,rgba(14,165,233,0.2),transparent_36%),radial-gradient(circle_at_88%_14%,rgba(16,185,129,0.2),transparent_34%),linear-gradient(155deg,#ecfeff_0%,#eff6ff_45%,#f0fdfa_100%)] p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-blue-300 blur-3xl"></div>
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-300 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        <nav className="relative z-10 rounded-2xl border border-white/20 bg-white/80 p-3 shadow-lg backdrop-blur-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
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
                className="w-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-emerald-600 hover:to-cyan-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <div className="bg-white/82 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(14,116,144,0.45)] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 border border-cyan-100">
                Reports Desk
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Active Member Report</h1>
              <p className="text-sm text-slate-600 mt-1">View active members with loan exposure, collected amount, and pending balance profile.</p>
              {loadingWidgets ? (
                <p className="mt-2 text-xs font-semibold text-cyan-700">Syncing widget preferences...</p>
              ) : null}
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold border border-slate-200 shadow-sm"
            >
              Back
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {visibleSummaryCards.map((card) => (
              <div
                key={card.key}
                className="group relative overflow-hidden rounded-2xl border border-cyan-100/80 bg-gradient-to-br from-white via-cyan-50/35 to-white p-3.5 shadow-[0_10px_25px_-18px_rgba(6,95,70,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-20px_rgba(14,116,144,0.45)] sm:p-4"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-sky-500 opacity-70"></div>
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
                <p className="pr-8 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-[11px]">
                  {card.label}
                </p>
                <p className={`mt-1.5 text-xl font-black leading-tight sm:text-2xl ${card.valueClass}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>
          {visibleSummaryCards.length === 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              All summary cards are hidden. Restore from dashboard with admin approval.
            </div>
          )}
        </div>

        <div className="bg-white/86 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Active Member Accounts</h2>
            {showActionToolbar && (
              <div className="relative flex items-end gap-2 flex-wrap">
              <WidgetCloseGate>
<button
                type="button"
                onClick={() => void hideWidget('mf_active_members_widget_action_toolbar')}
                className="absolute -top-2 -left-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide action toolbar"
              >
                ×
              </button>
</WidgetCloseGate>
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
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'approved' | 'released')}
                  className="mt-1 px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900"
                >
                  <option value="all">All</option>
                  <option value="approved">Approved</option>
                  <option value="released">Released</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOfficerFilter('all');
                  setStatusFilter('all');
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
              >
                Reset
              </button>
              </div>
            )}
          </div>
          {!showActionToolbar && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Toolbar controls are hidden. Restore from dashboard with admin approval.
            </div>
          )}

          {loading ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-100/60 to-teal-100/40 p-8 text-sm text-slate-700 text-center">
              Loading active member data...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-100/60 to-teal-100/40 p-8 text-sm text-slate-700 text-center">
              No active member data found for selected filters.
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-xs text-slate-700">
                <p>
                  Showing {pageStart} to {pageEnd} of {filteredRows.length} records
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Rows</label>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value) || 15)}
                    className="rounded-lg border border-cyan-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-100">
                <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                  <thead className="bg-cyan-50/70 text-slate-700">
                    <tr>
                      {visibleTableColumns.map((column) => (
                        <th key={column.key} className="px-3 py-2 font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{column.label}</span>
                            <WidgetCloseGate>
<button
                              type="button"
                              onClick={() => void hideWidget(`mf_active_members_widget_col_${column.key}`)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
                              aria-label={`Hide ${column.label} column`}
                            >
                              ×
                            </button>
</WidgetCloseGate>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTableColumns.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-center text-amber-700" colSpan={1}>
                          All table columns are hidden. Restore from dashboard with admin approval.
                        </td>
                      </tr>
                    )}
                    {paginatedRows.map((row) => (
                      <tr key={row.loanId} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors">
                        {visibleTableColumns.map((column) => {
                          if (column.key === 'loanId') return <td key={column.key} className="px-3 py-2">{row.loanId || '-'}</td>;
                          if (column.key === 'customerNo') return <td key={column.key} className="px-3 py-2 font-semibold text-slate-900">{row.customerNo}</td>;
                          if (column.key === 'customer') return <td key={column.key} className="px-3 py-2">{row.customerName}</td>;
                          if (column.key === 'nic') return <td key={column.key} className="px-3 py-2">{row.nic}</td>;
                          if (column.key === 'contact') return <td key={column.key} className="px-3 py-2">{row.contact}</td>;
                          if (column.key === 'fieldOfficer') return <td key={column.key} className="px-3 py-2">{row.fieldOfficer}</td>;
                          if (column.key === 'status') {
                            return (
                              <td key={column.key} className="px-3 py-2">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
                                  String(row.status).toLowerCase() === 'released'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-blue-200 bg-blue-50 text-blue-800'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                            );
                          }
                          if (column.key === 'loanAmount') return <td key={column.key} className="px-3 py-2">{formatMoney(row.loanAmount)}</td>;
                          if (column.key === 'refundable') return <td key={column.key} className="px-3 py-2">{formatMoney(row.refundableAmount)}</td>;
                          if (column.key === 'collected') return <td key={column.key} className="px-3 py-2 text-emerald-700 font-semibold">{formatMoney(row.collectedAmount)}</td>;
                          if (column.key === 'pending') return <td key={column.key} className="px-3 py-2 text-rose-700 font-semibold">{formatMoney(row.pendingAmount)}</td>;
                          if (column.key === 'dueDate') return <td key={column.key} className="px-3 py-2">{formatDate(row.dueDate)}</td>;
                          return null;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-cyan-100 bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-600">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1)
                    .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                    .map((page, index, arr) => {
                      const prevPage = arr[index - 1];
                      const showDots = index > 0 && prevPage !== undefined && page - prevPage > 1;
                      return (
                        <div key={page} className="flex items-center gap-2">
                          {showDots && <span className="text-xs text-slate-400">...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                              page === currentPage
                                ? 'bg-cyan-600 text-white shadow-sm'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-cyan-50'
                            }`}
                          >
                            {page}
                          </button>
                        </div>
                      );
                    })}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {widgetNotice.open && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/35 backdrop-blur-sm"
              onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
            />
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
    </div>
  );
}
