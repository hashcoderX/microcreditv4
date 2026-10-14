'use client';

import axios from 'axios';
import { getApiBaseUrl, getBackendOrigin } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Customer = {
  id: number;
  branch_id?: number | string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  customer_code?: string | null;
  phone?: string | null;
  contact_number?: string | null;
  email?: string | null;
  nic_passport?: string | null;
  status?: string | null;
};

type LoanRow = {
  id: number;
  customer_no?: string | null;
  customer_name?: string | null;
  nic?: string | null;
  status?: string | null;
  field_officer?: string | null;
  refundable_amount?: number | string | null;
  arrears_balance?: number | string | null;
};

type CollectionRow = {
  mf_loan_request_id: number | string;
  collected_amount?: number | string | null;
};

type AuthUser = {
  id: number;
  branch_id?: number | null;
  designation?: { id: number; name: string } | null;
};

type BlacklistedReportRow = {
  customerId: number;
  customerNo: string;
  customerName: string;
  nic: string;
  contact: string;
  email: string;
  status: string;
  linkedLoans: number;
  totalRefundable: number;
  totalCollected: number;
  pendingAmount: number;
  arrearsAmount: number;
  riskLevel: 'high' | 'medium' | 'low';
  fieldOfficer: string;
};

const API_BASE = getApiBaseUrl();

export default function MicrofinanceBlacklistedCustomersReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BlacklistedReportRow[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const branchId = Number(searchParams.get('branch_id') || 0) || undefined;
  const designationName = String(authUser?.designation?.name || '').toLowerCase();
  const isFieldOfficer = designationName.includes('field officer');


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
        if (!key.startsWith('mf_blacklisted_widget_')) continue;
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

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser));
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
        const customerParams =
          branchId
            ? { per_page: 1000, branch_id: branchId }
            : isFieldOfficer && authUser?.branch_id
              ? { per_page: 1000, branch_id: authUser.branch_id }
              : { per_page: 1000 };

        const [customerRes, loanRes, collectionRes] = await Promise.all([
          axios.get(`${API_BASE}/customers`, {
            params: customerParams,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }),
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

        const customerPayload = customerRes.data;
        const customers: Customer[] = Array.isArray(customerPayload)
          ? customerPayload
          : Array.isArray(customerPayload?.data)
          ? customerPayload.data
          : Array.isArray(customerPayload?.customers)
          ? customerPayload.customers
          : [];

        const loans: LoanRow[] = Array.isArray(loanRes.data) ? loanRes.data : [];
        const collections: CollectionRow[] = Array.isArray(collectionRes.data) ? collectionRes.data : [];

        const paidByLoan = new Map<number, number>();
        collections.forEach((collection) => {
          const loanId = Number(collection.mf_loan_request_id || 0);
          if (!loanId) return;
          paidByLoan.set(loanId, (paidByLoan.get(loanId) || 0) + Number(collection.collected_amount || 0));
        });

        const blacklistedCustomers = customers.filter(
          (customer) => String(customer.status || '').toLowerCase() === 'blacklisted'
        );

        const mapped: BlacklistedReportRow[] = blacklistedCustomers.map((customer) => {
          const customerNo = String(customer.customer_code || '').trim();
          const customerNic = String(customer.nic_passport || '').trim().toLowerCase();

          const linkedLoans = loans.filter((loan) => {
            const loanNo = String(loan.customer_no || '').trim();
            const loanNic = String(loan.nic || '').trim().toLowerCase();

            if (customerNo && loanNo && customerNo === loanNo) return true;
            if (customerNic && loanNic && customerNic === loanNic) return true;
            return false;
          });

          let totalRefundable = 0;
          let totalCollected = 0;
          let arrearsAmount = 0;
          let officer = 'Unassigned';

          linkedLoans.forEach((loan) => {
            const loanId = Number(loan.id || 0);
            totalRefundable += Number(loan.refundable_amount || 0);
            totalCollected += paidByLoan.get(loanId) || 0;
            arrearsAmount += Math.max(Number(loan.arrears_balance || 0), 0);
            if (officer === 'Unassigned' && String(loan.field_officer || '').trim() !== '') {
              officer = String(loan.field_officer);
            }
          });

          const pendingAmount = Math.max(totalRefundable - totalCollected, 0);
          const riskScore = pendingAmount + arrearsAmount;

          const riskLevel: 'high' | 'medium' | 'low' =
            riskScore >= 500000 || arrearsAmount >= 100000
              ? 'high'
              : riskScore >= 150000 || arrearsAmount > 0
              ? 'medium'
              : 'low';

          const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

          return {
            customerId: Number(customer.id),
            customerNo: customerNo || '-',
            customerName:
              String(customer.full_name || customer.name || fullName || `Customer #${customer.id}`).trim(),
            nic: String(customer.nic_passport || '-'),
            contact: String(customer.phone || customer.contact_number || '-'),
            email: String(customer.email || '-'),
            status: String(customer.status || '-'),
            linkedLoans: linkedLoans.length,
            totalRefundable,
            totalCollected,
            pendingAmount,
            arrearsAmount,
            riskLevel,
            fieldOfficer: officer,
          };
        });

        mapped.sort((a, b) => {
          const riskRank = { high: 3, medium: 2, low: 1 };
          if (riskRank[b.riskLevel] !== riskRank[a.riskLevel]) {
            return riskRank[b.riskLevel] - riskRank[a.riskLevel];
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
  }, [token, isFieldOfficer, authUser?.branch_id, branchId]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => (riskFilter === 'all' ? true : row.riskLevel === riskFilter));
  }, [rows, riskFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [riskFilter, rows.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const pageStart = filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, filteredRows.length);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.linkedLoans += row.linkedLoans;
        acc.totalRefundable += row.totalRefundable;
        acc.totalCollected += row.totalCollected;
        acc.pending += row.pendingAmount;
        acc.arrears += row.arrearsAmount;
        if (row.riskLevel === 'high') acc.high += 1;
        if (row.riskLevel === 'medium') acc.medium += 1;
        if (row.riskLevel === 'low') acc.low += 1;
        return acc;
      },
      {
        count: 0,
        linkedLoans: 0,
        totalRefundable: 0,
        totalCollected: 0,
        pending: 0,
        arrears: 0,
        high: 0,
        medium: 0,
        low: 0,
      }
    );
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

  const riskPieChart = useMemo(() => {
    return buildPieChart([
      { key: 'high', label: 'High Risk', value: summary.high, color: '#dc2626' },
      { key: 'medium', label: 'Medium Risk', value: summary.medium, color: '#f59e0b' },
      { key: 'low', label: 'Low Risk', value: summary.low, color: '#10b981' },
    ]);
  }, [summary.high, summary.medium, summary.low]);

  const exposurePieChart = useMemo(() => {
    return buildPieChart([
      { key: 'pending', label: 'Pending Exposure', value: summary.pending, color: '#e11d48' },
      { key: 'arrears', label: 'Arrears Exposure', value: summary.arrears, color: '#ea580c' },
    ]);
  }, [summary.pending, summary.arrears]);

  const topOfficerExposureBars = useMemo(() => {
    const map = new Map<string, number>();
    filteredRows.forEach((row) => {
      const officer = String(row.fieldOfficer || 'Unassigned').trim() || 'Unassigned';
      map.set(officer, (map.get(officer) || 0) + row.pendingAmount + row.arrearsAmount);
    });

    const list = Array.from(map.entries())
      .map(([officer, amount]) => ({ officer, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    const max = list.reduce((acc, item) => Math.max(acc, item.amount), 0);
    return list.map((item) => ({
      ...item,
      widthPercent: max > 0 ? (item.amount / max) * 100 : 0,
    }));
  }, [filteredRows]);

  const summaryCards = [
    { key: 'mf_blacklisted_widget_summary_count', label: 'Blacklisted', value: String(summary.count), valueClass: 'text-slate-900' },
    { key: 'mf_blacklisted_widget_summary_linked_loans', label: 'Linked Loans', value: String(summary.linkedLoans), valueClass: 'text-slate-900' },
    {
      key: 'mf_blacklisted_widget_summary_pending',
      label: 'Pending',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.pending),
      valueClass: 'text-rose-700',
    },
    {
      key: 'mf_blacklisted_widget_summary_arrears',
      label: 'Arrears',
      value: new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(summary.arrears),
      valueClass: 'text-orange-700',
    },
    {
      key: 'mf_blacklisted_widget_summary_high_medium',
      label: 'High / Medium',
      value: `${summary.high} / ${summary.medium}`,
      valueClass: 'text-red-700',
    },
    { key: 'mf_blacklisted_widget_summary_low', label: 'Low', value: String(summary.low), valueClass: 'text-emerald-700' },
  ];

  const visibleSummaryCards = summaryCards.filter((card) => !hiddenWidgetKeys.has(card.key));
  const showToolbar = !hiddenWidgetKeys.has('mf_blacklisted_widget_toolbar');
  const showVisuals = !hiddenWidgetKeys.has('mf_blacklisted_widget_visuals');
  const tableColumns = [
    { key: 'id', label: 'ID' },
    { key: 'customerNo', label: 'Customer No' },
    { key: 'customer', label: 'Customer' },
    { key: 'nic', label: 'NIC' },
    { key: 'contact', label: 'Contact' },
    { key: 'fieldOfficer', label: 'Field Officer' },
    { key: 'loans', label: 'Loans' },
    { key: 'collected', label: 'Collected' },
    { key: 'pending', label: 'Pending' },
    { key: 'arrears', label: 'Arrears' },
    { key: 'risk', label: 'Risk' },
  ];
  const visibleTableColumns = tableColumns.filter(
    (column) => !hiddenWidgetKeys.has(`mf_blacklisted_widget_col_${column.key}`)
  );

  const formatMoney = (value: number) => Number(value || 0).toFixed(2);

  const getReportFileDate = () => new Date().toISOString().slice(0, 10);

  const handleDownloadCsv = () => {
    const headers = [
      'Customer ID',
      'Customer No',
      'Customer Name',
      'NIC',
      'Contact',
      'Email',
      'Status',
      'Risk Level',
      'Field Officer',
      'Linked Loans',
      'Total Refundable',
      'Total Collected',
      'Pending Amount',
      'Arrears Amount',
    ];

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const body = filteredRows.map((row) => [
      row.customerId,
      row.customerNo,
      row.customerName,
      row.nic,
      row.contact,
      row.email,
      row.status,
      row.riskLevel,
      row.fieldOfficer,
      row.linkedLoans,
      formatMoney(row.totalRefundable),
      formatMoney(row.totalCollected),
      formatMoney(row.pendingAmount),
      formatMoney(row.arrearsAmount),
    ]);

    const csv = [headers, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `blacklisted-customer-report-${getReportFileDate()}.csv`;
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

    const riskText = `Risk: ${riskFilter}`;

    doc.setFontSize(16);
    doc.text('Blacklisted Customer Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`${riskText} | Generated: ${generatedAt}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [[
        'Customer ID',
        'Customer No',
        'Customer Name',
        'Risk',
        'Field Officer',
        'Loans',
        'Refundable',
        'Collected',
        'Pending',
        'Arrears',
      ]],
      body: filteredRows.map((row) => [
        row.customerId,
        row.customerNo,
        row.customerName,
        row.riskLevel,
        row.fieldOfficer,
        row.linkedLoans,
        formatMoney(row.totalRefundable),
        formatMoney(row.totalCollected),
        formatMoney(row.pendingAmount),
        formatMoney(row.arrearsAmount),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [220, 38, 38],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [254, 242, 242],
      },
      margin: { left: 24, right: 24, top: 72, bottom: 24 },
      theme: 'striped',
    });

    doc.save(`blacklisted-customer-report-${getReportFileDate()}.pdf`);
  };

  if (!token || loading || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_8%_10%,rgba(251,113,133,0.22),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(56,189,248,0.2),transparent_34%),radial-gradient(circle_at_78%_88%,rgba(16,185,129,0.18),transparent_32%),linear-gradient(150deg,#fff1f2_0%,#eff6ff_46%,#ecfdf5_100%)] p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-rose-300 blur-3xl"></div>
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-sky-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-300 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        <div className="bg-white/82 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(190,24,93,0.42)] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-rose-700 border border-rose-100">
                Risk Radar
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Blacklisted Customer Report</h1>
              <p className="text-sm text-slate-600 mt-1">Analyze blacklisted customers with linked loan exposure and arrears risk profile.</p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold border border-slate-800 shadow-sm"
            >
              Back
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {visibleSummaryCards.map((card) => (
              <div key={card.key} className="relative overflow-hidden rounded-xl bg-white/90 border border-rose-100 shadow-sm p-4">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 via-orange-400 to-emerald-400"></div>
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
                <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className={`text-2xl font-extrabold mt-1 ${card.valueClass}`}>{card.value}</p>
              </div>
            ))}
          </div>
          {visibleSummaryCards.length === 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              All summary cards are hidden. Restore from dashboard with admin approval.
            </div>
          )}
        </div>

        {showVisuals && (
        <div className="relative bg-white/88 backdrop-blur-xl rounded-3xl border border-rose-100 shadow-[0_18px_44px_-24px_rgba(190,24,93,0.36)] p-4 md:p-5">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget('mf_blacklisted_widget_visuals')}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide visual analytics widget"
            >
              ×
            </button>
          </WidgetCloseGate>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Visual Risk Analytics</h2>
            <p className="text-xs text-slate-500">Charts use current risk filter selection.</p>
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-rose-100 bg-white/90 p-4">
              <h3 className="text-sm font-bold text-slate-900">Customer Risk Split</h3>
              <p className="mt-1 text-xs text-slate-500">Distribution by high, medium, and low risk levels.</p>
              <div className="mt-4 flex items-center gap-4 flex-wrap">
                <div
                  className="h-32 w-32 rounded-full border border-slate-200 shadow-inner"
                  style={{ background: riskPieChart.gradient }}
                  aria-label="Customer risk split pie chart"
                />
                <div className="space-y-2">
                  {riskPieChart.segments.map((segment) => (
                    <div key={segment.key} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                      <span className="font-semibold">{segment.label}</span>
                      <span>{segment.percent.toFixed(1)}%</span>
                      <span className="text-slate-500">({segment.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-white/90 p-4">
              <h3 className="text-sm font-bold text-slate-900">Exposure Mix</h3>
              <p className="mt-1 text-xs text-slate-500">Pending versus arrears value contribution.</p>
              <div className="mt-4 flex items-center gap-4 flex-wrap">
                <div
                  className="h-32 w-32 rounded-full border border-slate-200 shadow-inner"
                  style={{ background: exposurePieChart.gradient }}
                  aria-label="Exposure mix pie chart"
                />
                <div className="space-y-2">
                  {exposurePieChart.segments.map((segment) => (
                    <div key={segment.key} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                      <span className="font-semibold">{segment.label}</span>
                      <span>{segment.percent.toFixed(1)}%</span>
                      <span className="text-slate-500">(LKR {formatMoney(segment.value)})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-white/90 p-4">
              <h3 className="text-sm font-bold text-slate-900">Top Officers by Exposure</h3>
              <p className="mt-1 text-xs text-slate-500">Pending + arrears concentration per officer.</p>
              <div className="mt-4 space-y-3">
                {topOfficerExposureBars.length === 0 ? (
                  <p className="text-xs text-slate-500">No data available for selected filter.</p>
                ) : (
                  topOfficerExposureBars.map((item) => (
                    <div key={item.officer} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-slate-700">{item.officer}</span>
                        <span className="text-slate-500">LKR {formatMoney(item.amount)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-rose-100">
                        <div
                          className="h-2.5 rounded-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-orange-500"
                          style={{ width: `${item.widthPercent}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        <div className="bg-white/86 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Blacklisted Customers</h2>
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
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Risk Level</label>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
                  className="mt-1 px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm text-slate-900"
                >
                  <option value="all">All</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRiskFilter('all');
                  setCurrentPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
              >
                Reset
              </button>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-100/60 to-teal-100/40 p-8 text-sm text-slate-700 text-center">
              No blacklisted customers found for selected filters.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-cyan-100 bg-cyan-50/40 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-900">
                  Showing {pageStart}-{pageEnd} of {filteredRows.length} blacklisted customers
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Rows</label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) || 15);
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-cyan-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-cyan-100">
              <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                <thead className="bg-cyan-50/70 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 font-semibold">ID</th>
                    <th className="px-3 py-2 font-semibold">Customer No</th>
                    <th className="px-3 py-2 font-semibold">Customer</th>
                    <th className="px-3 py-2 font-semibold">NIC</th>
                    <th className="px-3 py-2 font-semibold">Contact</th>
                    <th className="px-3 py-2 font-semibold">Field Officer</th>
                    <th className="px-3 py-2 font-semibold">Loans</th>
                    <th className="px-3 py-2 font-semibold">Collected</th>
                    <th className="px-3 py-2 font-semibold">Pending</th>
                    <th className="px-3 py-2 font-semibold">Arrears</th>
                    <th className="px-3 py-2 font-semibold">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => (
                    <tr key={row.customerId} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors">
                      <td className="px-3 py-2">{row.customerId}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.customerNo}</td>
                      <td className="px-3 py-2">{row.customerName}</td>
                      <td className="px-3 py-2">{row.nic}</td>
                      <td className="px-3 py-2">{row.contact}</td>
                      <td className="px-3 py-2">{row.fieldOfficer}</td>
                      <td className="px-3 py-2">{row.linkedLoans}</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">{formatMoney(row.totalCollected)}</td>
                      <td className="px-3 py-2 text-rose-700 font-semibold">{formatMoney(row.pendingAmount)}</td>
                      <td className="px-3 py-2 text-orange-700 font-semibold">{formatMoney(row.arrearsAmount)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
                          row.riskLevel === 'high'
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : row.riskLevel === 'medium'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}>
                          {row.riskLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-slate-600">
                  Page {safePage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
