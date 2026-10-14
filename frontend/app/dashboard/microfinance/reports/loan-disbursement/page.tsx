'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type LoanRow = {
  id: number | string;
  loan_code?: string | null;
  customer_no?: string | null;
  customer_name?: string | null;
  field_officer?: string | null;
  status?: string | null;
  loan_amount?: number | string | null;
  net_disbursed_amount?: number | string | null;
  refundable_amount?: number | string | null;
  loan_balance?: number | string | null;
  arrears_balance?: number | string | null;
  due_date?: string | null;
  next_payment_date?: string | null;
  loan_request_date?: string | null;
  created_at?: string | null;
  center?: { id?: number | string; name?: string | null; code?: string | null } | null;
  group?: { id?: number | string; name?: string | null; code?: string | null } | null;
  route?: { id?: number | string; name?: string | null; code?: string | null } | null;
};

type CollectionRow = {
  mf_loan_request_id: number | string;
  collected_amount?: number | string | null;
};

type DisbursementRow = {
  loanId: number;
  loanCode: string;
  customerNo: string;
  customerName: string;
  fieldOfficer: string;
  status: string;
  loanAmount: number;
  netDisbursedAmount: number;
  refundableAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  arrearsAmount: number;
  disbursedDate: string;
  dueDate: string;
  nextPaymentDate: string;
  centerName: string;
  groupName: string;
  routeName: string;
};

const API_BASE = getApiBaseUrl();
const widgetPrefix = 'mf_loan_disbursement_widget_';

const isUnauthorizedError = (error: unknown): boolean =>
  axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403);

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toLowerCase();

const DISBURSED_STATUSES = new Set(['approved', 'released', 'completed']);
type LoanStatusFilter = 'all' | 'approved' | 'released' | 'completed' | 'active_loan' | 'finished_loan';

export default function MicrofinanceLoanDisbursementReportPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DisbursementRow[]>([]);
  const [totalRegisteredCustomers, setTotalRegisteredCustomers] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>('all');
  const [officerOptions, setOfficerOptions] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

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
      const list = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of list) {
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
        const [loanRes, collectionRes, customerRes] = await Promise.all([
          axios.get(`${API_BASE}/microfinance/loan-requests`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }),
          axios.get(`${API_BASE}/microfinance/collections`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }),
          axios.get(`${API_BASE}/customers`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            params: { per_page: 1000 },
          }),
        ]);

        const loans: LoanRow[] = Array.isArray(loanRes.data) ? loanRes.data : [];
        const collections: CollectionRow[] = Array.isArray(collectionRes.data) ? collectionRes.data : [];
        const customers = Array.isArray(customerRes.data?.data)
          ? customerRes.data.data
          : Array.isArray(customerRes.data)
            ? customerRes.data
            : [];

        const paidByLoan = new Map<number, number>();
        collections.forEach((collection) => {
          const loanId = Number(collection.mf_loan_request_id || 0);
          if (!loanId) return;
          paidByLoan.set(loanId, (paidByLoan.get(loanId) || 0) + toNumber(collection.collected_amount));
        });

        const mapped = loans
          .filter((loan) => DISBURSED_STATUSES.has(normalizeStatus(loan.status)))
          .map((loan) => {
            const loanId = Number(loan.id || 0);
            const loanAmount = toNumber(loan.loan_amount);
            const netDisbursedAmount = toNumber(loan.net_disbursed_amount) || loanAmount;
            const refundableAmount = toNumber(loan.refundable_amount);
            const collectedAmount = paidByLoan.get(loanId) || 0;
            const backendOutstandingAmount = toNumber(loan.loan_balance);
            const derivedOutstandingAmount = Math.max(refundableAmount - collectedAmount, 0);
            const outstandingAmount = Math.max(backendOutstandingAmount, derivedOutstandingAmount, 0);
            const arrearsAmount = Math.max(toNumber(loan.arrears_balance), 0);

            return {
              loanId,
              loanCode: String(loan.loan_code || '').trim() || `LR-${loanId}`,
              customerNo: String(loan.customer_no || '-'),
              customerName: String(loan.customer_name || '-'),
              fieldOfficer: String(loan.field_officer || 'Unassigned'),
              status: String(loan.status || '-'),
              loanAmount,
              netDisbursedAmount,
              refundableAmount,
              collectedAmount,
              outstandingAmount,
              arrearsAmount,
              disbursedDate: String(loan.loan_request_date || loan.created_at || '').slice(0, 10) || '-',
              dueDate: String(loan.due_date || '').slice(0, 10) || '-',
              nextPaymentDate: String(loan.next_payment_date || '').slice(0, 10) || '-',
              centerName: String(loan.center?.name || 'Unassigned Center'),
              groupName: String(loan.group?.name || 'Ungrouped'),
              routeName: String(loan.route?.name || 'Unassigned Route'),
            } satisfies DisbursementRow;
          })
          .sort((a, b) => b.netDisbursedAmount - a.netDisbursedAmount);

        const nextOfficerOptions = Array.from(new Set(mapped.map((row) => row.fieldOfficer))).sort((a, b) =>
          a.localeCompare(b)
        );

        setRows(mapped);
        setOfficerOptions(nextOfficerOptions);
        setTotalRegisteredCustomers(customers.length);
      } catch (error) {
        if (isUnauthorizedError(error)) {
          handleUnauthorized();
          return;
        }
        setRows([]);
        setOfficerOptions([]);
        setTotalRegisteredCustomers(0);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [token]);

  const filteredRows = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      if (officerFilter !== 'all' && row.fieldOfficer.toLowerCase() !== officerFilter) {
        return false;
      }

      const isFinishedLoan = row.outstandingAmount <= 0.0001;
      const isActiveLoan = row.outstandingAmount > 0.0001;

      if (statusFilter === 'active_loan' && !isActiveLoan) {
        return false;
      }

      if (statusFilter === 'finished_loan' && !isFinishedLoan) {
        return false;
      }

      if (
        statusFilter !== 'all' &&
        statusFilter !== 'active_loan' &&
        statusFilter !== 'finished_loan' &&
        row.status.toLowerCase() !== statusFilter
      ) {
        return false;
      }

      if (!search) return true;
      const haystack = [
        row.loanCode,
        row.customerNo,
        row.customerName,
        row.fieldOfficer,
        row.centerName,
        row.groupName,
        row.routeName,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [rows, keyword, officerFilter, statusFilter]);

  const summary = useMemo(() => {
    const customerKeys = new Set<string>();
    const activeCustomerKeys = new Set<string>();

    let finishedLoansCount = 0;
    let totalDisbursementCount = 0;
    let totalLoanAmount = 0;
    let totalNetDisbursed = 0;
    let totalOutstanding = 0;

    filteredRows.forEach((row) => {
      totalDisbursementCount += 1;
      totalLoanAmount += row.loanAmount;
      totalNetDisbursed += row.netDisbursedAmount;
      totalOutstanding += row.outstandingAmount;

      const normalizedCustomerNo = String(row.customerNo || '').trim().toLowerCase();
      const normalizedCustomerName = String(row.customerName || '').trim().toLowerCase();
      const key =
        normalizedCustomerNo && normalizedCustomerNo !== '-'
          ? `no:${normalizedCustomerNo}`
          : normalizedCustomerName && normalizedCustomerName !== '-'
            ? `name:${normalizedCustomerName}`
            : `loan:${row.loanId}`;
      if (key) {
        customerKeys.add(key);
      }

      const isFinishedLoan = row.outstandingAmount <= 0.0001;
      const isActiveLoan = row.outstandingAmount > 0.0001;

      if (isActiveLoan && key) {
        activeCustomerKeys.add(key);
      }

      if (isFinishedLoan) {
        finishedLoansCount += 1;
      }
    });

    const usingDefaultFilters = officerFilter === 'all' && statusFilter === 'all' && keyword.trim() === '';

    return {
      totalCustomerCount: usingDefaultFilters
        ? Math.max(totalRegisteredCustomers, customerKeys.size)
        : customerKeys.size,
      activeLoanCustomerCount: activeCustomerKeys.size,
      totalDisbursementCount,
      finishedLoansCount,
      totalLoanAmount,
      totalNetDisbursed,
      totalOutstanding,
    };
  }, [filteredRows, officerFilter, statusFilter, keyword, totalRegisteredCustomers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, officerFilter, statusFilter, pageSize, rows.length]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const pageStart = filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, filteredRows.length);

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
      'No',
      'Loan Code',
      'Customer No',
      'Customer Name',
      'Field Officer',
      'Status',
      'Center',
      'Group',
      'Route',
      'Loan Amount',
      'Net Disbursed',
      'Collected',
      'Outstanding',
      'Arrears',
      'Disbursed Date',
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

    const body = filteredRows.map((row, index) => [
      index + 1,
      row.loanCode,
      row.customerNo,
      row.customerName,
      row.fieldOfficer,
      row.status,
      row.centerName,
      row.groupName,
      row.routeName,
      formatMoney(row.loanAmount),
      formatMoney(row.netDisbursedAmount),
      formatMoney(row.collectedAmount),
      formatMoney(row.outstandingAmount),
      formatMoney(row.arrearsAmount),
      formatDate(row.disbursedDate),
      formatDate(row.dueDate),
      formatDate(row.nextPaymentDate),
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `loan-disbursement-report-${getReportFileDate()}.csv`;
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
    const statusMap: Record<LoanStatusFilter, string> = {
      all: 'All',
      active_loan: 'Active Loan',
      finished_loan: 'Finished Loan',
      approved: 'Approved',
      released: 'Released',
      completed: 'Completed',
    };
    const statusText = `Status: ${statusMap[statusFilter]}`;

    doc.setFontSize(16);
    doc.text('Micro Finance Loan Disbursement Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`${officerText} | ${statusText} | Generated: ${generatedAt}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [[
        'No',
        'Loan Code',
        'Customer No',
        'Customer Name',
        'Officer',
        'Status',
        'Center',
        'Group',
        'Route',
        'Loan',
        'Net Disbursed',
        'Collected',
        'Outstanding',
        'Arrears',
        'Disbursed',
        'Due',
        'Next Payment',
      ]],
      body: filteredRows.map((row, index) => [
        index + 1,
        row.loanCode,
        row.customerNo,
        row.customerName,
        row.fieldOfficer,
        row.status,
        row.centerName,
        row.groupName,
        row.routeName,
        formatMoney(row.loanAmount),
        formatMoney(row.netDisbursedAmount),
        formatMoney(row.collectedAmount),
        formatMoney(row.outstandingAmount),
        formatMoney(row.arrearsAmount),
        formatDate(row.disbursedDate),
        formatDate(row.dueDate),
        formatDate(row.nextPaymentDate),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [12, 174, 206], textColor: 255 },
      alternateRowStyles: { fillColor: [242, 252, 255] },
      margin: { left: 20, right: 20 },
      tableWidth: 'auto',
    });

    doc.save(`loan-disbursement-report-${getReportFileDate()}.pdf`);
  };

  const summaryCards = [
    {
      key: `${widgetPrefix}summary_total_customers`,
      label: 'Total Customer Count',
      value: String(summary.totalCustomerCount),
      tone: 'text-fuchsia-700',
      boxClass: 'border-fuchsia-100 bg-fuchsia-50/70',
    },
    {
      key: `${widgetPrefix}summary_active_customers`,
      label: 'Active Loan Customers',
      value: String(summary.activeLoanCustomerCount),
      tone: 'text-blue-700',
      boxClass: 'border-blue-100 bg-blue-50/70',
    },
    {
      key: `${widgetPrefix}summary_disbursement_count`,
      label: 'Micro Credit Disbursement Count',
      value: String(summary.totalDisbursementCount),
      tone: 'text-emerald-700',
      boxClass: 'border-emerald-100 bg-emerald-50/70',
    },
    {
      key: `${widgetPrefix}summary_finished_loans`,
      label: 'Finished Micro Finance Loans',
      value: String(summary.finishedLoansCount),
      tone: 'text-rose-700',
      boxClass: 'border-rose-100 bg-rose-50/70',
    },
    {
      key: `${widgetPrefix}summary_net_disbursed`,
      label: 'Total Net Disbursed (LKR)',
      value: formatMoney(summary.totalNetDisbursed),
      tone: 'text-indigo-700',
      boxClass: 'border-indigo-100 bg-indigo-50/70',
    },
    {
      key: `${widgetPrefix}summary_outstanding`,
      label: 'Outstanding (LKR)',
      value: formatMoney(summary.totalOutstanding),
      tone: 'text-amber-700',
      boxClass: 'border-amber-100 bg-amber-50/70',
    },
  ];

  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showFilterSection = !hiddenWidgetKeys.has(`${widgetPrefix}filters_section`);
  const showTableSection = !hiddenWidgetKeys.has(`${widgetPrefix}table_section`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-100 p-5 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-cyan-100 bg-white/85 p-5 shadow-[0_20px_50px_-30px_rgba(14,116,144,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="inline-flex rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
                Report Center
              </p>
              <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900">Micro Finance Loan Disbursement Report</h1>
              <p className="mt-1 text-sm text-slate-600">
                Track disbursed loans, active borrowing customers, completed loans, and portfolio-level disbursement data.
              </p>
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
          <div className="relative rounded-3xl border border-cyan-100 bg-white/85 p-5 backdrop-blur-xl shadow-[0_18px_45px_-28px_rgba(8,145,178,0.35)]">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}filters_section`)}
                className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-cyan-50 hover:text-cyan-700"
                aria-label="Hide filters widget"
              >
                ×
              </button>
            </WidgetCloseGate>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Loan code, customer, officer, center"
                  className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Field Officer</label>
                <select
                  value={officerFilter}
                  onChange={(e) => setOfficerFilter(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
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
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loan Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as LoanStatusFilter)}
                  className="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                >
                  <option value="all">All Status</option>
                  <option value="active_loan">Active Loan</option>
                  <option value="finished_loan">Finished Loan</option>
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
                className="rounded-xl border border-cyan-100 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-cyan-50"
              >
                Reset Filters
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleSummaryCards.map((card) => (
                <div key={card.key} className={`relative rounded-xl border p-3 ${card.boxClass}`}>
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => void hideWidget(card.key)}
                      className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-cyan-50 hover:text-cyan-700"
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
          <div className="relative rounded-3xl border border-cyan-100 bg-white/90 p-4 backdrop-blur-xl shadow-[0_18px_45px_-28px_rgba(8,145,178,0.35)]">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}table_section`)}
                className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-cyan-50 hover:text-cyan-700"
                aria-label="Hide table widget"
              >
                ×
              </button>
            </WidgetCloseGate>

            {loading ? (
              <p className="py-8 text-center text-slate-600">Loading report...</p>
            ) : filteredRows.length === 0 ? (
              <p className="py-8 text-center text-slate-600">No disbursement records found.</p>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3 text-sm text-slate-600">
                  <span>
                    Showing {pageStart}-{pageEnd} of {filteredRows.length} disbursed microfinance loans
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs uppercase tracking-wide text-slate-500">Rows</label>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="rounded-lg border border-cyan-100 bg-white px-2 py-1.5 text-xs text-black focus:outline-none focus:ring-2 focus:ring-cyan-200"
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="mb-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf()}
                    className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700"
                  >
                    Download PDF
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-cyan-100">
                  <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                    <thead className="bg-cyan-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">No</th>
                        <th className="px-3 py-2 font-semibold">Loan Code</th>
                        <th className="px-3 py-2 font-semibold">Customer No</th>
                        <th className="px-3 py-2 font-semibold">Customer</th>
                        <th className="px-3 py-2 font-semibold">Officer</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Center</th>
                        <th className="px-3 py-2 font-semibold">Group</th>
                        <th className="px-3 py-2 font-semibold">Route</th>
                        <th className="px-3 py-2 font-semibold">Loan Amount</th>
                        <th className="px-3 py-2 font-semibold">Net Disbursed</th>
                        <th className="px-3 py-2 font-semibold">Collected</th>
                        <th className="px-3 py-2 font-semibold">Outstanding</th>
                        <th className="px-3 py-2 font-semibold">Arrears</th>
                        <th className="px-3 py-2 font-semibold">Disbursed Date</th>
                        <th className="px-3 py-2 font-semibold">Due Date</th>
                        <th className="px-3 py-2 font-semibold">Next Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row, index) => (
                        <tr key={row.loanId} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40">
                          <td className="px-3 py-2 font-semibold text-slate-900">{(safePage - 1) * pageSize + index + 1}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.loanCode}</td>
                          <td className="px-3 py-2">{row.customerNo}</td>
                          <td className="px-3 py-2">{row.customerName}</td>
                          <td className="px-3 py-2">{row.fieldOfficer}</td>
                          <td className="px-3 py-2 capitalize">{row.status}</td>
                          <td className="px-3 py-2">{row.centerName}</td>
                          <td className="px-3 py-2">{row.groupName}</td>
                          <td className="px-3 py-2">{row.routeName}</td>
                          <td className="px-3 py-2">{formatMoney(row.loanAmount)}</td>
                          <td className="px-3 py-2 text-emerald-700 font-semibold">{formatMoney(row.netDisbursedAmount)}</td>
                          <td className="px-3 py-2 text-blue-700 font-semibold">{formatMoney(row.collectedAmount)}</td>
                          <td className="px-3 py-2 text-rose-700 font-semibold">{formatMoney(row.outstandingAmount)}</td>
                          <td className="px-3 py-2 text-amber-700 font-semibold">{formatMoney(row.arrearsAmount)}</td>
                          <td className="px-3 py-2">{formatDate(row.disbursedDate)}</td>
                          <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                          <td className="px-3 py-2">{formatDate(row.nextPaymentDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Page {safePage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={safePage <= 1}
                      className="rounded-lg border border-cyan-100 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      Prev
                    </button>
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
