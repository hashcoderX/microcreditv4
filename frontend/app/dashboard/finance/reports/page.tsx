'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarRange,
  Download,
  FileText,
  HandCoins,
  Layers,
  PieChart,
  Search,
  ShieldAlert,
  TrendingUp,
  X,
} from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-cyan-200/80 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200/80 placeholder:text-slate-400 [color-scheme:light]';

type FinanceRow = {
  id: number;
  finance_type?: string | null;
  product_type?: string | null;
  asset_reference?: string | null;
  financed_amount?: number | string | null;
  amount?: number | string | null;
  total_paid_amount?: number | string | null;
  balance_amount?: number | string | null;
  arrears?: number | string | null;
  due_amount?: number | string | null;
  due_date?: string | null;
  installment_amount?: number | string | null;
  installment_frequency?: string | null;
  tenure_months?: number | string | null;
  interest_rate?: number | string | null;
  refund_amount?: number | string | null;
  status?: string | null;
  created_at?: string | null;
  repayment_plan?: {
    installments?: Array<{ amount?: number | string | null }>;
  } | null;
  vehicle_details?: {
    vehicle_no?: string | null;
    chassis_no?: string | null;
  } | null;
  customer?: {
    customer_code?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
};

type MonthlyTrendRow = {
  key: string;
  month: string;
  financeId: number;
  customerNo: string;
  vehicleNo: string;
  reference: string;
  financed: number;
  totalRefundable: number;
  collected: number;
  collectionRate: number;
  profitLoss: number;
  profitLossRate: number;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatAmount(value: unknown): string {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function daysPastDue(value: unknown): number {
  if (!value) return 0;
  const due = new Date(String(value));
  if (Number.isNaN(due.getTime())) return 0;

  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function getFinancedAmount(row: FinanceRow): number {
  const value = toNumber(row.financed_amount ?? row.amount);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function getCollectedAmount(row: FinanceRow): number {
  const paid = toNumber(row.total_paid_amount);
  if (Number.isFinite(paid) && paid > 0) return paid;

  const financed = getFinancedAmount(row);
  const balance = toNumber(row.balance_amount);
  if (Number.isFinite(balance) && financed > 0) {
    return Math.max(financed - balance, 0);
  }

  return 0;
}

function getOutstandingAmount(row: FinanceRow): number {
  const balance = toNumber(row.balance_amount);
  if (Number.isFinite(balance) && balance >= 0) return balance;

  const financed = getFinancedAmount(row);
  const collected = getCollectedAmount(row);
  return Math.max(financed - collected, 0);
}

function getArrearsAmount(row: FinanceRow): number {
  const value = toNumber(row.arrears);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function isPortfolioBookStatus(status: unknown): boolean {
  const key = String(status || '').toLowerCase();
  return key === 'active' || key === 'settled';
}

function computeInstallmentCount(row: FinanceRow): number {
  const tenure = Number(row.tenure_months || 0);
  const frequency = String(row.installment_frequency || 'monthly').toLowerCase();
  const installmentsPerYear =
    frequency === 'daily'
      ? 365
      : frequency === 'weekly'
        ? 52
        : frequency === 'quarterly'
          ? 4
          : frequency === 'yearly'
            ? 1
            : 12;

  return Math.max(1, Math.round((tenure / 12) * installmentsPerYear));
}

function getTotalRefundableValue(row: FinanceRow): number {
  const installments = row.repayment_plan?.installments;
  if (Array.isArray(installments) && installments.length > 0) {
    const plannedTotal = installments.reduce((sum, item) => {
      const amount = toNumber(item?.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    if (plannedTotal > 0) return plannedTotal;
  }

  const installment = toNumber(row.installment_amount);
  if (Number.isFinite(installment) && installment > 0) {
    return installment * computeInstallmentCount(row);
  }

  return getFinancedAmount(row);
}

function getFinanceReference(row: FinanceRow): { customerNo: string; vehicleNo: string; reference: string } {
  const customerNo = String(row.customer?.customer_code || '').trim();
  const vehicleNo = String(row.vehicle_details?.vehicle_no || '').trim();
  const assetRef = String(row.asset_reference || '').trim();
  const reference = customerNo || vehicleNo || assetRef || `#${row.id}`;

  return {
    customerNo: customerNo || '-',
    vehicleNo: vehicleNo || '-',
    reference,
  };
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, headers: string[], data: Array<Array<string>>) {
  const csv = [headers, ...data].map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function statusBadgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === 'active') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (key === 'settled') return 'bg-sky-100 text-sky-800 border-sky-200';
  if (key === 'pending_approval') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (key === 'rejected') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: { border: string; iconBg: string; iconText: string; glow: string };
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white/95 p-3.5 shadow-sm ${accent.border}`}>
      <div className={`pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full blur-2xl opacity-40 ${accent.glow}`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-xs font-bold text-slate-900 tabular-nums truncate leading-snug">{value}</p>
          <p className="mt-0.5 text-[10px] text-slate-500 leading-snug">{sub}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent.iconBg} ${accent.iconText}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

function ReportPanel({
  title,
  description,
  icon: Icon,
  headerClass,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  headerClass: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-cyan-100 bg-white/95 shadow-lg overflow-hidden">
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 ${headerClass}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-slate-900">{title}</p>
            {description ? <p className="text-xs text-slate-600 mt-0.5">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export default function FinanceReportsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinanceRow[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);

    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      try {
        setAuthUser(JSON.parse(rawUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }

    const fetchNotificationPreview = async () => {
      try {
        const response = await fetch('/api/notifications/preview?limit=4', {
          headers: {
            Authorization: `Bearer ${t}`,
            Accept: 'application/json',
          },
        });

        if (!response.ok) throw new Error('Failed to load notification preview');
        const payload = await response.json();
        setActionCenterTotalCount(Number(payload?.action_center_total || 0));
      } catch {
        setActionCenterTotalCount(0);
      }
    };

    void fetchNotificationPreview();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    router.push('/');
  };

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  useEffect(() => {
    if (!token) return;

    const fetchRows = async () => {
      setLoading(true);
      try {
        const allRows: FinanceRow[] = [];
        let page = 1;
        let lastPage = 1;

        do {
          const response = await fetch(`/api/finances?per_page=500&page=${page}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });

          if (!response.ok) {
            setRows([]);
            return;
          }

          const payload = await response.json();
          const data = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
              ? payload
              : [];

          allRows.push(...(data as FinanceRow[]));
          lastPage = Number(payload?.last_page || 1);
          page += 1;
        } while (page <= lastPage);

        setRows(allRows);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [token]);

  const productOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => String(r.product_type || '').trim()).filter((v) => v !== '')))
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return rows.filter((row) => {
      if (statusFilter !== 'all' && String(row.status || '').toLowerCase() !== statusFilter) return false;
      if (productFilter !== 'all' && String(row.product_type || '').toLowerCase() !== productFilter) return false;

      if (from || to) {
        const created = row.created_at ? new Date(String(row.created_at)) : null;
        if (!created || Number.isNaN(created.getTime())) return false;
        if (from && created < from) return false;
        if (to && created > to) return false;
      }

      if (!q) return true;

      const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim();
      const haystack = [
        row.id,
        row.product_type || '',
        row.finance_type || '',
        row.status || '',
        row.customer?.customer_code || '',
        row.vehicle_details?.vehicle_no || '',
        row.asset_reference || '',
        customerName,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, search, statusFilter, productFilter, fromDate, toDate]);

  const metrics = useMemo(() => {
    const totalAccounts = filteredRows.length;
    const portfolioRows = filteredRows.filter((row) => isPortfolioBookStatus(row.status));

    const totalFinanced = portfolioRows.reduce((sum, row) => sum + getFinancedAmount(row), 0);
    const totalCollected = portfolioRows.reduce((sum, row) => sum + getCollectedAmount(row), 0);
    const totalOutstanding = portfolioRows.reduce((sum, row) => sum + getOutstandingAmount(row), 0);
    const totalArrears = portfolioRows.reduce((sum, row) => sum + getArrearsAmount(row), 0);

    const activeCount = filteredRows.filter((r) => String(r.status || '').toLowerCase() === 'active').length;
    const settledCount = filteredRows.filter((r) => String(r.status || '').toLowerCase() === 'settled').length;
    const pendingCount = filteredRows.filter((r) => String(r.status || '').toLowerCase() === 'pending_approval').length;

    const atRiskCount = portfolioRows.filter((row) => {
      const arrears = getArrearsAmount(row);
      const overdueDays = daysPastDue(row.due_date);
      return arrears > 0 || overdueDays > 0;
    }).length;

    const collectionRate = totalFinanced > 0 ? (totalCollected / totalFinanced) * 100 : 0;

    return {
      totalAccounts,
      totalFinanced,
      totalCollected,
      totalOutstanding,
      totalArrears,
      activeCount,
      settledCount,
      pendingCount,
      atRiskCount,
      collectionRate,
      portfolioAccounts: portfolioRows.length,
    };
  }, [filteredRows]);

  const statusReport = useMemo(() => {
    const map = new Map<string, { count: number; financed: number; outstanding: number; arrears: number }>();

    filteredRows.forEach((row) => {
      const key = String(row.status || 'unknown').toLowerCase();
      const financed = Number(row.financed_amount ?? row.amount ?? 0);
      const outstanding = Number(row.balance_amount || 0);
      const arrears = Number(row.arrears || 0);
      const prev = map.get(key) || { count: 0, financed: 0, outstanding: 0, arrears: 0 };

      map.set(key, {
        count: prev.count + 1,
        financed: prev.financed + (Number.isFinite(financed) ? financed : 0),
        outstanding: prev.outstanding + (Number.isFinite(outstanding) ? outstanding : 0),
        arrears: prev.arrears + (Number.isFinite(arrears) ? arrears : 0),
      });
    });

    return Array.from(map.entries())
      .map(([status, info]) => ({ status, ...info }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const productReport = useMemo(() => {
    const map = new Map<string, { count: number; financed: number; avgRate: number; rateSamples: number }>();

    filteredRows.forEach((row) => {
      const key = String(row.product_type || 'unassigned').trim() || 'unassigned';
      const financed = Number(row.financed_amount ?? row.amount ?? 0);
      const rate = Number(row.interest_rate || 0);
      const prev = map.get(key) || { count: 0, financed: 0, avgRate: 0, rateSamples: 0 };

      map.set(key, {
        count: prev.count + 1,
        financed: prev.financed + (Number.isFinite(financed) ? financed : 0),
        avgRate: prev.avgRate + (Number.isFinite(rate) ? rate : 0),
        rateSamples: prev.rateSamples + (Number.isFinite(rate) ? 1 : 0),
      });
    });

    return Array.from(map.entries())
      .map(([product, info]) => ({
        product,
        count: info.count,
        financed: info.financed,
        avgRate: info.rateSamples > 0 ? info.avgRate / info.rateSamples : 0,
      }))
      .sort((a, b) => b.financed - a.financed);
  }, [filteredRows]);

  const arrearsAgingReport = useMemo(() => {
    const buckets = [
      { label: 'Current (0 days)', key: 'current', count: 0, arrears: 0 },
      { label: '1-30 days', key: 'd30', count: 0, arrears: 0 },
      { label: '31-60 days', key: 'd60', count: 0, arrears: 0 },
      { label: '61-90 days', key: 'd90', count: 0, arrears: 0 },
      { label: '90+ days', key: 'd90p', count: 0, arrears: 0 },
    ];

    filteredRows.forEach((row) => {
      const days = daysPastDue(row.due_date);
      const arrears = Math.max(0, Number(row.arrears || 0));

      if (days <= 0) {
        buckets[0].count += 1;
        buckets[0].arrears += arrears;
      } else if (days <= 30) {
        buckets[1].count += 1;
        buckets[1].arrears += arrears;
      } else if (days <= 60) {
        buckets[2].count += 1;
        buckets[2].arrears += arrears;
      } else if (days <= 90) {
        buckets[3].count += 1;
        buckets[3].arrears += arrears;
      } else {
        buckets[4].count += 1;
        buckets[4].arrears += arrears;
      }
    });

    return buckets;
  }, [filteredRows]);

  const riskWatchlist = useMemo(() => {
    return filteredRows
      .map((row) => {
        const financed = Number(row.financed_amount ?? row.amount ?? 0);
        const arrears = Math.max(0, Number(row.arrears || 0));
        const outstanding = Math.max(0, Number(row.balance_amount || 0));
        const due = Math.max(0, Number(row.due_amount || 0));
        const overdueDays = daysPastDue(row.due_date);
        const riskScore = arrears + overdueDays * 100 + due * 0.1;

        return {
          ...row,
          financed,
          arrears,
          outstanding,
          due,
          overdueDays,
          riskScore,
        };
      })
      .filter((row) => row.arrears > 0 || row.overdueDays > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);
  }, [filteredRows]);

  const monthlyReport = useMemo(() => {
    const rows: MonthlyTrendRow[] = filteredRows
      .map((row) => {
        const date = row.created_at ? new Date(String(row.created_at)) : null;
        if (!date || Number.isNaN(date.getTime())) return null;

        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const financed = getFinancedAmount(row);
        const collected = getCollectedAmount(row);
        const totalRefundable = getTotalRefundableValue(row);
        const refs = getFinanceReference(row);
        const collectionRate = totalRefundable > 0 ? (collected / totalRefundable) * 100 : 0;
        const profitLoss = collected - totalRefundable;
        const profitLossRate = totalRefundable > 0 ? (profitLoss / totalRefundable) * 100 : 0;

        return {
          key: `${month}-${row.id}`,
          month,
          financeId: row.id,
          customerNo: refs.customerNo,
          vehicleNo: refs.vehicleNo,
          reference: refs.reference,
          financed,
          totalRefundable,
          collected,
          collectionRate,
          profitLoss,
          profitLossRate,
        };
      })
      .filter((row): row is MonthlyTrendRow => row !== null)
      .sort((a, b) => b.month.localeCompare(a.month) || b.financeId - a.financeId);

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 11);
    cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);

    return rows.filter((row) => {
      const [year, month] = row.month.split('-').map(Number);
      const rowDate = new Date(year, (month || 1) - 1, 1);
      return rowDate >= cutoff;
    });
  }, [filteredRows]);

  const monthlyTrendTotals = useMemo(() => {
    return monthlyReport.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.financed += row.financed;
        acc.totalRefundable += row.totalRefundable;
        acc.collected += row.collected;
        return acc;
      },
      { count: 0, financed: 0, totalRefundable: 0, collected: 0 }
    );
  }, [monthlyReport]);

  const monthlyTrendSummary = useMemo(() => {
    const collectionRate =
      monthlyTrendTotals.totalRefundable > 0
        ? (monthlyTrendTotals.collected / monthlyTrendTotals.totalRefundable) * 100
        : 0;
    const profitLoss = monthlyTrendTotals.collected - monthlyTrendTotals.totalRefundable;
    const profitLossRate =
      monthlyTrendTotals.totalRefundable > 0 ? (profitLoss / monthlyTrendTotals.totalRefundable) * 100 : 0;

    return {
      collectionRate,
      profitLoss,
      profitLossRate,
    };
  }, [monthlyTrendTotals]);

  const exportPortfolioSnapshot = () => {
    const headers = [
      'Finance ID',
      'Customer Code',
      'Product',
      'Status',
      'Financed',
      'Collected',
      'Outstanding',
      'Arrears',
      'Due Amount',
      'Due Date',
      'Created At',
    ];

    const data = filteredRows.map((row) => [
      String(row.id),
      String(row.customer?.customer_code || '-'),
      String(row.product_type || '-'),
      String(row.status || '-'),
      formatAmount(row.financed_amount ?? row.amount),
      formatAmount(row.total_paid_amount),
      formatAmount(row.balance_amount),
      formatAmount(row.arrears),
      formatAmount(row.due_amount),
      formatDate(row.due_date),
      formatDate(row.created_at),
    ]);

    downloadCsv('finance-portfolio-snapshot.csv', headers, data);
  };

  const exportRiskWatchlist = () => {
    const headers = [
      'Finance ID',
      'Customer Code',
      'Product',
      'Status',
      'Overdue Days',
      'Arrears',
      'Due Amount',
      'Outstanding',
      'Risk Score',
    ];

    const data = riskWatchlist.map((row) => [
      String(row.id),
      String(row.customer?.customer_code || '-'),
      String(row.product_type || '-'),
      String(row.status || '-'),
      String(row.overdueDays),
      formatAmount(row.arrears),
      formatAmount(row.due),
      formatAmount(row.outstanding),
      formatAmount(row.riskScore),
    ]);

    downloadCsv('finance-risk-watchlist.csv', headers, data);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    productFilter !== 'all' ||
    fromDate !== '' ||
    toDate !== '';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setProductFilter('all');
    setFromDate('');
    setToDate('');
  };

  const maxAgingArrears = useMemo(
    () => Math.max(...arrearsAgingReport.map((b) => b.arrears), 1),
    [arrearsAgingReport],
  );

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-blue-300 blur-3xl" />
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-cyan-300 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-300 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-5">
        <nav className="relative z-10 rounded-2xl border border-white/20 bg-white/80 p-3 shadow-lg backdrop-blur-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500">
                  <span className="text-sm font-bold text-white">DOF</span>
                </div>
                <h1 className="max-w-[220px] truncate bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-base font-bold text-transparent sm:max-w-none sm:text-xl">
                  Desk of Finance
                </h1>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard/finance')}
                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                Back to Finance
              </button>

              <div className="hidden items-center space-x-2 text-xs text-gray-600 sm:flex sm:text-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                <span>System Online</span>
              </div>

              <button
                type="button"
                onClick={() => router.push('/dashboard/action-center')}
                className="flex w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-left transition hover:bg-amber-100 sm:w-auto"
              >
                <span className="text-base">🔔</span>
                <span className="text-xs font-semibold text-amber-800">Action Center</span>
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-300 px-1.5 text-[11px] font-bold text-amber-900">
                  {actionCenterTotalCount}
                </span>
              </button>

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

        {/* Hero */}
        <div className="rounded-3xl border border-white/80 bg-white/95 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 px-6 py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                  <BarChart3 className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">Finance Analytics</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Portfolio Reports</h1>
                  <p className="text-sm text-cyan-50/95 mt-1 max-w-2xl">
                    Live portfolio intelligence — status mix, product performance, arrears aging, risk watchlist, and monthly trends.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportPortfolioSnapshot}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
                >
                  <Download className="h-4 w-4" />
                  Export portfolio
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/reports/general-ledger')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
                >
                  <FileText className="h-4 w-4" />
                  More reports
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/finance')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-cyan-100 border-t border-cyan-100/80 bg-cyan-50/40">
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Filtered accounts</p>
              <p className="text-xs font-bold text-slate-900 tabular-nums">{metrics.totalAccounts}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Collection rate</p>
              <p className="text-xs font-bold text-emerald-700 tabular-nums">{metrics.collectionRate.toFixed(1)}%</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">At-risk</p>
              <p className="text-xs font-bold text-rose-700 tabular-nums">{metrics.atRiskCount}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Total arrears</p>
              <p className="text-xs font-bold text-amber-800 tabular-nums truncate">{formatAmount(metrics.totalArrears)}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-3xl border border-cyan-100 bg-white/95 shadow-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Report filters</p>
              <p className="text-xs text-slate-500 mt-0.5">Narrow the portfolio snapshot and all tables below.</p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
            <div className="xl:col-span-4 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, customer, product, status…"
                className={`${inputClass} pl-10`}
              />
            </div>
            <div className="xl:col-span-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="pending_approval">Pending approval</option>
                <option value="settled">Settled</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="xl:col-span-2">
              <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className={inputClass}>
                <option value="all">All products</option>
                {productOptions.map((p) => (
                  <option key={p} value={p.toLowerCase()}>{p}</option>
                ))}
              </select>
            </div>
            <div className="xl:col-span-4 flex flex-col sm:flex-row items-stretch gap-2 rounded-xl border border-cyan-200/80 bg-cyan-50/30 px-3 py-2">
              <div className="flex items-center gap-2 shrink-0">
                <CalendarRange className="h-4 w-4 text-cyan-700" />
                <span className="text-xs font-semibold text-slate-600">Created</span>
              </div>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputClass} py-2`} />
              <span className="self-center text-xs text-slate-400 hidden sm:inline">→</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${inputClass} py-2`} />
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <MetricCard
            label="Accounts"
            value={String(metrics.totalAccounts)}
            sub={`Active ${metrics.activeCount} · Pending ${metrics.pendingCount}`}
            icon={Layers}
            accent={{ border: 'border-cyan-100', iconBg: 'bg-cyan-100', iconText: 'text-cyan-700', glow: 'bg-cyan-400' }}
          />
          <MetricCard
            label="Financed"
            value={formatAmount(metrics.totalFinanced)}
            sub={`${metrics.portfolioAccounts} in book · ${metrics.settledCount} settled`}
            icon={TrendingUp}
            accent={{ border: 'border-emerald-100', iconBg: 'bg-emerald-100', iconText: 'text-emerald-700', glow: 'bg-emerald-400' }}
          />
          <MetricCard
            label="Collected"
            value={formatAmount(metrics.totalCollected)}
            sub={`${metrics.collectionRate.toFixed(2)}% of financed book`}
            icon={HandCoins}
            accent={{ border: 'border-blue-100', iconBg: 'bg-blue-100', iconText: 'text-blue-700', glow: 'bg-blue-400' }}
          />
          <MetricCard
            label="Outstanding"
            value={formatAmount(metrics.totalOutstanding)}
            sub="Active & settled balance"
            icon={BarChart3}
            accent={{ border: 'border-amber-100', iconBg: 'bg-amber-100', iconText: 'text-amber-700', glow: 'bg-amber-400' }}
          />
          <MetricCard
            label="Arrears"
            value={formatAmount(metrics.totalArrears)}
            sub={`${metrics.atRiskCount} accounts need attention`}
            icon={AlertTriangle}
            accent={{ border: 'border-rose-100', iconBg: 'bg-rose-100', iconText: 'text-rose-700', glow: 'bg-rose-400' }}
          />
        </div>

        {/* Collection progress */}
        <div className="rounded-3xl border border-cyan-100 bg-white/95 shadow-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <p className="text-xs font-bold text-slate-900">Portfolio collection progress</p>
            <p className="text-xs font-bold text-cyan-800 tabular-nums">{metrics.collectionRate.toFixed(2)}%</p>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, metrics.collectionRate))}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Collected {formatAmount(metrics.totalCollected)} of {formatAmount(metrics.totalFinanced)} financed volume
            (active & settled accounts only).
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ReportPanel
            title="Status breakdown"
            description="Accounts and balances grouped by finance status."
            icon={PieChart}
            headerClass="bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-cyan-100 text-cyan-900"
          >
            <div className="overflow-x-auto rounded-2xl border border-cyan-100">
              <table className="min-w-full text-sm text-left">
                <thead>
                  <tr className="bg-cyan-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Count</th>
                    <th className="px-4 py-3">Financed</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Arrears</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-50">
                  {statusReport.map((item) => (
                    <tr key={item.status} className="hover:bg-cyan-50/40 transition">
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(item.status)}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{item.count}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-800">{formatAmount(item.financed)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-800">{formatAmount(item.outstanding)}</td>
                      <td className="px-4 py-3 tabular-nums text-rose-700 font-medium">{formatAmount(item.arrears)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportPanel>

          <ReportPanel
            title="Product performance"
            description="Financed volume and average rate by product type."
            icon={FileText}
            headerClass="bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 text-indigo-900"
          >
            <div className="overflow-x-auto rounded-2xl border border-indigo-100">
              <table className="min-w-full text-sm text-left">
                <thead>
                  <tr className="bg-indigo-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Accounts</th>
                    <th className="px-4 py-3">Financed</th>
                    <th className="px-4 py-3">Avg rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50">
                  {productReport.map((item) => (
                    <tr key={item.product} className="hover:bg-indigo-50/40 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.product}</td>
                      <td className="px-4 py-3 tabular-nums">{item.count}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-800">{formatAmount(item.financed)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-lg bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800 tabular-nums">
                          {item.avgRate.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportPanel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ReportPanel
            title="Arrears aging"
            description="Overdue exposure by days past due bucket."
            icon={ShieldAlert}
            headerClass="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 text-amber-900"
          >
            <div className="space-y-3">
              {arrearsAgingReport.map((item) => {
                const width = maxAgingArrears > 0 ? (item.arrears / maxAgingArrears) * 100 : 0;
                return (
                  <div key={item.key} className="rounded-xl border border-amber-100 bg-white p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.count} accounts</p>
                    </div>
                    <div className="h-2 rounded-full bg-amber-100 overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p className="text-xs font-bold text-amber-800 tabular-nums">{formatAmount(item.arrears)}</p>
                  </div>
                );
              })}
            </div>
          </ReportPanel>

          <ReportPanel
            title="Risk watchlist"
            description="Top 10 accounts by combined arrears and overdue days."
            icon={AlertTriangle}
            headerClass="bg-gradient-to-r from-rose-50 to-red-50 border-b border-rose-100 text-rose-900"
            action={
              <button
                type="button"
                onClick={exportRiskWatchlist}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            }
          >
            <div className="overflow-x-auto rounded-2xl border border-rose-100">
              <table className="min-w-full text-sm text-left">
                <thead>
                  <tr className="bg-rose-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Finance</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Overdue</th>
                    <th className="px-4 py-3">Arrears</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50">
                  {riskWatchlist.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center">
                        <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-sm text-slate-500">No at-risk accounts for selected filters.</p>
                      </td>
                    </tr>
                  ) : (
                    riskWatchlist.map((item) => (
                      <tr key={item.id} className="hover:bg-rose-50/30 transition">
                        <td className="px-4 py-3 font-semibold text-slate-900">#{item.id}</td>
                        <td className="px-4 py-3">{item.customer?.customer_code || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${item.overdueDays > 30 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                            {item.overdueDays}d
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-rose-700 font-medium">{formatAmount(item.arrears)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatAmount(item.due)}</td>
                        <td className="px-4 py-3 font-bold text-indigo-800 tabular-nums">{formatAmount(item.riskScore)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ReportPanel>
        </div>

        <ReportPanel
          title="Monthly trend"
          description="Finance accounts from the last 12 months with customer or vehicle reference and total refundable value."
          icon={BarChart3}
          headerClass="bg-gradient-to-r from-cyan-50 via-blue-50 to-teal-50 border-b border-cyan-100 text-cyan-900"
        >
          <div className="overflow-x-auto rounded-2xl border border-cyan-100">
            <table className="min-w-full text-sm text-left text-black">
              <thead>
                <tr className="bg-cyan-50/80 text-[11px] font-bold uppercase tracking-wide text-black">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Customer No</th>
                  <th className="px-4 py-3">Vehicle No</th>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Financed</th>
                  <th className="px-4 py-3">Total Refundable</th>
                  <th className="px-4 py-3">Collected</th>
                  <th className="px-4 py-3">Collected %</th>
                  <th className="px-4 py-3">Profit / loss</th>
                  <th className="px-4 py-3">P/L %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-50">
                {monthlyReport.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                      No monthly trend data for selected filters.
                    </td>
                  </tr>
                ) : (
                  <>
                    {monthlyReport.map((item) => (
                      <tr key={item.key} className="hover:bg-cyan-50/40 transition">
                        <td className="px-4 py-3 font-semibold text-black whitespace-nowrap">{item.month}</td>
                        <td className="px-4 py-3 text-black whitespace-nowrap">{item.customerNo}</td>
                        <td className="px-4 py-3 text-black whitespace-nowrap">{item.vehicleNo}</td>
                        <td className="px-4 py-3 text-black font-semibold whitespace-nowrap">{item.reference}</td>
                        <td className="px-4 py-3 tabular-nums text-black">{formatAmount(item.financed)}</td>
                        <td className="px-4 py-3 tabular-nums text-black font-semibold">{formatAmount(item.totalRefundable)}</td>
                        <td className="px-4 py-3 tabular-nums text-black">{formatAmount(item.collected)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-lg bg-cyan-100 px-2 py-0.5 text-xs font-bold text-black tabular-nums">
                            {item.collectionRate.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-black">
                          {item.profitLoss >= 0 ? '+' : '-'}{formatAmount(Math.abs(item.profitLoss))}
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-black">
                          {item.profitLossRate >= 0 ? '+' : '-'}{Math.abs(item.profitLossRate).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-cyan-50/70 font-semibold">
                      <td className="px-4 py-3 text-black" colSpan={4}>
                        Total ({monthlyTrendTotals.count} accounts)
                      </td>
                      <td className="px-4 py-3 tabular-nums text-black">{formatAmount(monthlyTrendTotals.financed)}</td>
                      <td className="px-4 py-3 tabular-nums text-black">{formatAmount(monthlyTrendTotals.totalRefundable)}</td>
                      <td className="px-4 py-3 tabular-nums text-black">{formatAmount(monthlyTrendTotals.collected)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-lg bg-cyan-200/80 px-2 py-0.5 text-xs font-bold text-black tabular-nums">
                          {monthlyTrendSummary.collectionRate.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-black">
                        {monthlyTrendSummary.profitLoss >= 0 ? '+' : '-'}
                        {formatAmount(Math.abs(monthlyTrendSummary.profitLoss))}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-black">
                        {monthlyTrendSummary.profitLossRate >= 0 ? '+' : '-'}
                        {Math.abs(monthlyTrendSummary.profitLossRate).toFixed(2)}%
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </ReportPanel>
      </div>
    </div>
  );
}
