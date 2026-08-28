'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { ArrowLeft, CalendarDays, Eye, HandCoins, Search, ShieldCheck, Trash2, Users, Wallet } from 'lucide-react';

type FinanceRow = {
  id: number;
  finance_type?: string | null;
  product_type?: string | null;
  asset_reference?: string | null;
  amount?: number | string | null;
  down_payment?: number | string | null;
  vehicle_details?: {
    vehicle_no?: string | null;
    chassis_no?: string | null;
    engine_no?: string | null;
    make_model?: string | null;
    year?: string | number | null;
  } | null;
  valuation_details?: {
    valuation_amount?: string | number | null;
    valuation_date?: string | null;
    valuer_name?: string | null;
  } | null;
  guarantor_details?: Array<{
    name?: string | null;
    nic?: string | null;
    phone?: string | null;
    address?: string | null;
  }> | null;
  repayment_plan?: {
    schedule_mode?: 'auto' | 'fixed_day' | 'custom_date' | null;
    first_installment_date?: string | null;
    collection_day_of_month?: number | string | null;
    grace_period_days?: number | string | null;
    installment_mode?: 'auto' | 'manual' | null;
    manual_installment_amount?: number | string | null;
    total_planned_amount?: number | string | null;
    next_installment_index?: number | string | null;
    installments?: Array<{
      installment_no?: number | string | null;
      payment_date?: string | null;
      amount?: number | string | null;
    }> | null;
  } | null;
  documents?: Array<{
    id: number;
    document_type?: string | null;
    original_name?: string | null;
    file_path?: string | null;
  }> | null;
  collections?: Array<{
    id: number;
    payment_date?: string | null;
    payment_amount?: number | string | null;
    refund_amount?: number | string | null;
    pay_type?: string | null;
    reference_no?: string | null;
    cheque_no?: string | null;
    cheque_date?: string | null;
    cheque_bank?: string | null;
    interest_charged?: number | string | null;
    interest_paid?: number | string | null;
    principal_paid?: number | string | null;
    arrears?: number | string | null;
    remaining_capital?: number | string | null;
    meta?: {
      opening_capital?: number | string | null;
      opening_arrears?: number | string | null;
      interest_rate_period?: number | string | null;
      interest_rate_monthly?: number | string | null;
    } | null;
    created_at?: string | null;
  }> | null;
  financed_amount?: number | string | null;
  due_capital_amount?: number | string | null;
  due_amount?: number | string | null;
  due_date?: string | null;
  next_collection_date?: string | null;
  installment_amount?: number | string | null;
  refund_amount?: number | string | null;
  total_paid_amount?: number | string | null;
  balance_amount?: number | string | null;
  arrears?: number | string | null;
  interest_rate?: number | string | null;
  interest_type?: string | null;
  tenure_months?: number | string | null;
  installment_frequency?: string | null;
  status?: string | null;
  created_at?: string | null;
  start_date?: string | null;
  customer?: {
    customer_code?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    nic_passport?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
};

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function formatAmount(v: unknown): string {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(v: unknown): string {
  if (!v) return '-';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

type CustomerLike = {
  customer_code?: string | null;
  nic_passport?: string | null;
} | null | undefined;

function looksLikeNic(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return false;
  return /^\d{9}[VX]$|^\d{12}$/.test(normalized);
}

function looksLikeProperCustomerCode(value: string): boolean {
  return /^CUS-\d{6}-\d{5}$/i.test(value.trim());
}

function displayCustomerNo(customer: CustomerLike): string {
  const code = String(customer?.customer_code || '').trim();
  const nic = String(customer?.nic_passport || '').trim();
  if (!code) return '-';
  if (nic && code.toUpperCase() === nic.toUpperCase()) return '-';
  if (!looksLikeProperCustomerCode(code) && looksLikeNic(code)) return '-';
  return code;
}

function isDraftProductType(productType: unknown): boolean {
  const normalized = String(productType || '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.includes('draft');
}

function getCollectionHealth(dueDate: unknown, graceDaysRaw: unknown): {
  label: 'On Time' | 'In Grace' | 'Past Grace' | 'No Due Date';
  tone: string;
  hint: string;
} {
  if (!dueDate) {
    return {
      label: 'No Due Date',
      tone: 'border-slate-200 bg-slate-100 text-slate-700',
      hint: 'No schedule due date is currently set for this account.',
    };
  }

  const due = new Date(String(dueDate));
  if (Number.isNaN(due.getTime())) {
    return {
      label: 'No Due Date',
      tone: 'border-slate-200 bg-slate-100 text-slate-700',
      hint: 'Current due date is invalid or unavailable.',
    };
  }

  const graceDays = Math.max(0, Number(graceDaysRaw || 0));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  if (today <= due) {
    return {
      label: 'On Time',
      tone: 'border-emerald-300 bg-emerald-100 text-emerald-800',
      hint: 'Collection is before or on the scheduled due date.',
    };
  }

  const graceEnd = new Date(due);
  graceEnd.setDate(graceEnd.getDate() + graceDays);
  if (today <= graceEnd) {
    return {
      label: 'In Grace',
      tone: 'border-amber-300 bg-amber-100 text-amber-800',
      hint: 'Past due date but still inside configured grace period.',
    };
  }

  return {
    label: 'Past Grace',
    tone: 'border-rose-300 bg-rose-100 text-rose-800',
    hint: 'Past due date and outside grace period; arrears may apply.',
  };
}

export default function FinanceCollectionsPage() {
  const PAGE_SIZE = 10;
  const widgetPrefix = 'finance_collections_widget_';
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending_approval' | 'rejected'>('all');
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<FinanceRow | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectionDate, setCollectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionPayType, setCollectionPayType] = useState<'cash' | 'bank_transfer' | 'cheque' | 'card' | 'online'>('cash');
  const [collectionReference, setCollectionReference] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [collectionError, setCollectionError] = useState('');
  const [deletingCollectionId, setDeletingCollectionId] = useState<number | null>(null);
  const [lastCalculation, setLastCalculation] = useState<{
    interest: number;
    interest_paid: number;
    principal_paid: number;
    profit_collected: number;
    capital_collected: number;
    new_capital: number;
    new_arrears: number;
    refund_amount: number;
    total_paid_amount: number;
    balance_amount: number;
  } | null>(null);

  const fetchFinanceRows = async (authToken: string) => {
    const response = await fetch('/api/finances?per_page=1000', {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) throw new Error('Failed to load finance records');

    const payload = await response.json();
    const data = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

    setRows(data as FinanceRow[]);
  };

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      setLoading(true);
      try {
        await fetchFinanceRows(token);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [token]);

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      const widgets = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.widgets)
          ? response.data.widgets
          : [];
      const hidden = widgets
        .filter(
          (item: { widget_key?: unknown; is_visible?: unknown }) =>
            typeof item.widget_key === 'string' &&
            item.widget_key.startsWith(widgetPrefix) &&
            (item.is_visible === false || Number(item.is_visible) === 0)
        )
        .map((item: { widget_key: string }) => item.widget_key);
      setHiddenWidgetKeys(hidden);
    } catch {
      setWidgetNotice('Failed to load widget preferences.');
    }
  }, []);

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean) => {
      if (!token) return;
      try {
        await axios.post(
          `${getApiBaseUrl()}/dashboard/widgets`,
          { widget_key: widgetKey, is_visible: isVisible ? 1 : 0 },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );
        setWidgetNotice('');
      } catch {
        setWidgetNotice('Failed to save widget preference.');
      }
    },
    [token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string) => {
      setHiddenWidgetKeys((prev) => (prev.includes(widgetKey) ? prev : [...prev, widgetKey]));
      await saveWidgetPreference(widgetKey, false);
    },
    [saveWidgetPreference]
  );

  useEffect(() => {
    if (!token) return;
    void fetchWidgetPreferences(token);
  }, [token, fetchWidgetPreferences]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const statusMatched = statusFilter === 'all'
      ? rows
      : rows.filter((r) => (r.status || '') === statusFilter);

    if (!term) return statusMatched;

    return statusMatched.filter((row) => {
      const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim().toLowerCase();
      const customerCode = displayCustomerNo(row.customer).toLowerCase();
      const nic = String(row.customer?.nic_passport || '').toLowerCase();
      const phone = String(row.customer?.phone || '').toLowerCase();
      const financeId = String(row.id || '').toLowerCase();
      const product = String(row.product_type || '').toLowerCase();
      const vehicleNo = String(row.vehicle_details?.vehicle_no || '').toLowerCase();
      return customerName.includes(term)
        || customerCode.includes(term)
        || nic.includes(term)
        || phone.includes(term)
        || financeId.includes(term)
        || product.includes(term)
        || vehicleNo.includes(term);
    });
  }, [rows, searchTerm, statusFilter]);

  const totalAccounts = filteredRows.length;
  const activeAccounts = filteredRows.filter((r) => r.status === 'active').length;
  const pendingAccounts = filteredRows.filter((r) => r.status === 'pending_approval').length;
  const expectedInstallment = filteredRows
    .filter((r) => r.status === 'active')
    .reduce((sum, r) => sum + (Number.isFinite(toNumber(r.installment_amount)) ? toNumber(r.installment_amount) : 0), 0);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const statsCards = [
    { key: 'accounts', title: 'Accounts', value: String(totalAccounts), icon: Users, tone: 'text-cyan-700', border: 'border-cyan-100' },
    { key: 'active', title: 'Active', value: String(activeAccounts), icon: ShieldCheck, tone: 'text-emerald-700', border: 'border-emerald-100' },
    { key: 'pending', title: 'Pending', value: String(pendingAccounts), icon: CalendarDays, tone: 'text-amber-700', border: 'border-amber-100' },
    { key: 'installment_book', title: 'Installment Book', value: formatAmount(expectedInstallment), icon: Wallet, tone: 'text-violet-700', border: 'border-violet-100' },
  ];
  const tableColumns = [
    { key: 'finance_id', label: 'Finance ID' },
    { key: 'customer_no', label: 'Customer No' },
    { key: 'customer', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'vehicle_no', label: 'Vehicle No' },
    { key: 'product', label: 'Product' },
    { key: 'financed', label: 'Financed' },
    { key: 'arrears', label: 'Arrears' },
    { key: 'installment', label: 'Installment' },
    { key: 'terms', label: 'Terms' },
    { key: 'start_date', label: 'Start Date' },
    { key: 'status', label: 'Status' },
    { key: 'action', label: 'Action' },
  ];
  const showHeaderWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}header`);
  const showStatsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}stats`);
  const showFiltersWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}filters`);
  const showTableWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}table`);
  const visibleStatsCards = statsCards.filter((card) => !hiddenWidgetKeys.includes(`${widgetPrefix}stat_${card.key}`));
  const visibleTableColumns = tableColumns.filter((column) => !hiddenWidgetKeys.includes(`${widgetPrefix}col_${column.key}`));
  const showAnyWidget = showHeaderWidget || showStatsWidget || showFiltersWidget || showTableWidget;
  const collectionHealth = useMemo(
    () => getCollectionHealth(selectedRecord?.due_date, selectedRecord?.repayment_plan?.grace_period_days),
    [selectedRecord?.due_date, selectedRecord?.repayment_plan?.grace_period_days],
  );
  const isSelectedRecordDraft = useMemo(
    () => isDraftProductType(selectedRecord?.product_type),
    [selectedRecord?.product_type],
  );

  const openFullRecord = async (id: number) => {
    if (!token) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setSelectedRecord(null);

    try {
      const response = await fetch(`/api/finances/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to load finance details');

      const payload = await response.json();
      setSelectedRecord(payload as FinanceRow);
      setCollectionError('');
      setLastCalculation(null);
      setCollectionAmount('');
      setCollectionPayType('cash');
      setCollectionReference('');
      setChequeNo('');
      setChequeDate('');
      setChequeBank('');
      setCollectionDate(new Date().toISOString().slice(0, 10));
    } catch {
      setDetailError('Failed to load full finance record details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const submitCollection = async () => {
    if (!token || !selectedRecord) return;

    const amount = Number(collectionAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setCollectionError('Enter a valid payment amount.');
      return;
    }

    if (!collectionDate) {
      setCollectionError('Payment date is required.');
      return;
    }

    if (collectionPayType === 'cheque') {
      if (!chequeNo.trim() || !chequeDate || !chequeBank.trim()) {
        setCollectionError('Cheque No, Cheque Date, and Cheque Bank are required for cheque payments.');
        return;
      }
    }

    try {
      setCollecting(true);
      setCollectionError('');

      const response = await fetch(`/api/finances/${selectedRecord.id}/collections`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_date: collectionDate,
          payment_amount: amount,
          pay_type: collectionPayType,
          reference_no: collectionReference.trim() || null,
          cheque_no: collectionPayType === 'cheque' ? chequeNo.trim() : null,
          cheque_date: collectionPayType === 'cheque' ? chequeDate : null,
          cheque_bank: collectionPayType === 'cheque' ? chequeBank.trim() : null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setCollectionError(String(payload?.message || 'Failed to post collection.'));
        return;
      }

      const calc = payload?.calculation;
      if (calc) {
        setLastCalculation({
          interest: Number(calc.interest || 0),
          interest_paid: Number(calc.interest_paid || 0),
          principal_paid: Number(calc.principal_paid || 0),
          profit_collected: Number(calc.profit_collected ?? calc.interest_paid ?? 0),
          capital_collected: Number(calc.capital_collected ?? calc.principal_paid ?? 0),
          new_capital: Number(calc.new_capital || 0),
          new_arrears: Number(calc.new_arrears || 0),
          refund_amount: Number(calc.refund_amount || 0),
          total_paid_amount: Number(calc.total_paid_amount || 0),
          balance_amount: Number(calc.balance_amount || 0),
        });
      }

      await openFullRecord(selectedRecord.id);
      await fetchFinanceRows(token);
      setCollectionAmount('');
      setCollectionReference('');
      setChequeNo('');
      setChequeDate('');
      setChequeBank('');
    } catch {
      setCollectionError('Failed to post collection.');
    } finally {
      setCollecting(false);
    }
  };

  const deleteCollection = async (collectionId: number) => {
    if (!token || !selectedRecord) return;

    const shouldDelete = window.confirm('Delete this payment? Loan balances and schedule will be recalculated from remaining payments.');
    if (!shouldDelete) return;

    try {
      setDeletingCollectionId(collectionId);
      setCollectionError('');

      const response = await fetch(`/api/finances/${selectedRecord.id}/collections/${collectionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const payload = await response.json();
      if (!response.ok) {
        setCollectionError(String(payload?.message || 'Failed to delete payment.'));
        return;
      }

      setLastCalculation(null);
      await openFullRecord(selectedRecord.id);
      await fetchFinanceRows(token);
    } catch {
      setCollectionError('Failed to delete payment.');
    } finally {
      setDeletingCollectionId(null);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  if (!token || loading) {
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

      <div className="relative z-10 max-w-6xl mx-auto space-y-5">
        {widgetNotice ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-5 text-sm font-semibold text-cyan-900">
            All widgets are currently hidden. Use `Restore Hidden Widgets` from the main dashboard to show them again.
          </div>
        ) : null}

        {showHeaderWidget ? (
        <div className="relative bg-white/90 rounded-3xl border border-cyan-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
              aria-label="Hide finance collection header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Finance Section</p>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Finance Collection</h1>
            <p className="text-sm text-slate-600 mt-1">Collections desk with active account tracking and installment monitoring.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/dashboard/finance')}
            className="px-4 py-2 rounded-xl bg-white border border-cyan-200 text-cyan-800 text-sm font-semibold inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
        ) : null}

        {showStatsWidget ? (
          <div className="relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}stats`)}
                className="absolute right-2 -top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                aria-label="Hide collection stats widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            {visibleStatsCards.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {visibleStatsCards.map((card) => (
                  <div key={card.key} className={`relative rounded-2xl border ${card.border} bg-white/86 backdrop-blur-xl p-4`}>
                    <WidgetCloseGate>
                      <button
                        type="button"
                        onClick={() => void hideWidget(`${widgetPrefix}stat_${card.key}`)}
                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                        aria-label={`Hide ${card.title} stat widget`}
                      >
                        ×
                      </button>
                    </WidgetCloseGate>
                    <div className={`inline-flex items-center gap-2 ${card.tone}`}>
                      <card.icon className="h-4 w-4" />
                      <p className="text-xs font-bold uppercase tracking-wide">{card.title}</p>
                    </div>
                    <p className="mt-2 text-2xl font-extrabold text-slate-900">{card.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                All collection stat widgets are hidden.
              </div>
            )}
          </div>
        ) : null}

        {showFiltersWidget ? (
        <div className="relative bg-white/90 rounded-3xl border border-cyan-100 p-5 space-y-3">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters`)}
              className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
              aria-label="Hide collection filters widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2">
              <Search className="h-4 w-4 text-cyan-700" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by customer, customer no, phone, vehicle no, finance id, product"
                className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-500 outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'pending_approval' | 'rejected')}
              className="rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900 min-w-[180px]"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        ) : null}

        {showTableWidget ? (
        <div className="relative bg-white/90 rounded-3xl border border-cyan-100 p-5">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}table`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
              aria-label="Hide collection table widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between mb-3">
            <div className="inline-flex items-center gap-2 text-cyan-800">
              <HandCoins className="h-5 w-5" />
              <p className="font-bold">Collection Accounts</p>
            </div>
            <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">{filteredRows.length} records</span>
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/35 p-8 text-center">
              <HandCoins className="h-10 w-10 text-cyan-700 mx-auto" />
              <p className="mt-3 text-lg font-bold text-slate-900">No collection records found</p>
              <p className="mt-1 text-sm text-slate-600">Adjust your search or filter to view finance collection accounts.</p>
            </div>
          ) : visibleTableColumns.length === 0 ? (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
              All collection table columns are hidden.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-cyan-100">
              <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                <thead className="bg-cyan-50/70 text-slate-700">
                  <tr>
                    {visibleTableColumns.map((column) => (
                      <th key={column.key} className="px-3 py-2 font-semibold">
                        <div className="inline-flex items-center gap-2">
                          <span>{column.label}</span>
                          <WidgetCloseGate>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void hideWidget(`${widgetPrefix}col_${column.key}`);
                              }}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
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
                  {pagedRows.map((row) => {
                    const customer = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim();
                    return (
                      <tr key={row.id} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40 transition-colors">
                        {visibleTableColumns.map((column) => {
                          if (column.key === 'finance_id') return <td key={column.key} className="px-3 py-2 font-semibold text-slate-900">#{row.id}</td>;
                          if (column.key === 'customer_no') return <td key={column.key} className="px-3 py-2">{displayCustomerNo(row.customer)}</td>;
                          if (column.key === 'customer') return <td key={column.key} className="px-3 py-2">{customer || '-'}</td>;
                          if (column.key === 'phone') return <td key={column.key} className="px-3 py-2">{row.customer?.phone || '-'}</td>;
                          if (column.key === 'vehicle_no') return <td key={column.key} className="px-3 py-2">{row.vehicle_details?.vehicle_no || '-'}</td>;
                          if (column.key === 'product') return <td key={column.key} className="px-3 py-2">{row.product_type || '-'}</td>;
                          if (column.key === 'financed') return <td key={column.key} className="px-3 py-2">{formatAmount(row.financed_amount)}</td>;
                          if (column.key === 'arrears') return <td key={column.key} className="px-3 py-2">{formatAmount(row.arrears)}</td>;
                          if (column.key === 'installment') return <td key={column.key} className="px-3 py-2">{formatAmount(row.installment_amount)}</td>;
                          if (column.key === 'terms') return <td key={column.key} className="px-3 py-2">{Number.isFinite(toNumber(row.interest_rate)) ? `${toNumber(row.interest_rate).toFixed(2)}%` : '-'} / {row.tenure_months || '-'} mo</td>;
                          if (column.key === 'start_date') return <td key={column.key} className="px-3 py-2">{formatDate(row.start_date)}</td>;
                          if (column.key === 'status') {
                            return (
                              <td key={column.key} className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${row.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : row.status === 'pending_approval' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  {row.status || '-'}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={column.key} className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => openFullRecord(row.id)}
                                className="rounded-lg bg-cyan-100 hover:bg-cyan-200 border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-800 inline-flex items-center gap-1.5"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-cyan-100 bg-cyan-50/30">
                  <p className="text-xs text-slate-600">
                    Showing {(safePage - 1) * PAGE_SIZE + 1} - {Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-semibold text-slate-600">Page {safePage} / {pageCount}</span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={safePage >= pageCount}
                      className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        ) : null}
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center px-4 py-6">
          <div className="w-full max-w-5xl h-[88vh] rounded-2xl bg-white border border-cyan-100 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Full Finance Record</p>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  {selectedRecord ? `Finance #${selectedRecord.id}` : 'Loading Record'}
                </h3>
                <p className="text-sm text-slate-600 mt-1">Complete details with related documents.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setSelectedRecord(null);
                  setDetailError('');
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40 space-y-4">
              {detailLoading && (
                <div className="h-full min-h-[260px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
                </div>
              )}

              {!detailLoading && detailError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {detailError}
                </div>
              )}

              {!detailLoading && !detailError && selectedRecord && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Customer</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{`${selectedRecord.customer?.first_name || ''} ${selectedRecord.customer?.last_name || ''}`.trim() || '-'}</p>
                      <p className="text-xs text-slate-500 mt-1">Customer No: {displayCustomerNo(selectedRecord.customer)}</p>
                      <p className="text-xs text-slate-500">NIC: {selectedRecord.customer?.nic_passport || '-'}</p>
                      <p className="text-xs text-slate-500">Phone: {selectedRecord.customer?.phone || '-'}</p>
                      <p className="text-xs text-slate-500">Email: {selectedRecord.customer?.email || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Agreement</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900 capitalize">{selectedRecord.finance_type || '-'}</p>
                      <p className="text-xs text-slate-500 mt-1">Product: {selectedRecord.product_type || '-'}</p>
                      <p className="text-xs text-slate-500">Status: {selectedRecord.status || '-'}</p>
                      <p className="text-xs text-slate-500">Ref: {selectedRecord.asset_reference || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Timeline</p>
                      <p className="mt-2 text-xs text-slate-500">Start: {formatDate(selectedRecord.start_date)}</p>
                      <p className="text-xs text-slate-500">Created: {formatDate(selectedRecord.created_at)}</p>
                      <p className="text-xs text-slate-500">Frequency: {selectedRecord.installment_frequency || '-'}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Financial Terms</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div><span className="text-slate-500">Asset Value: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.amount)}</span></div>
                      <div><span className="text-slate-500">Down Payment: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.down_payment)}</span></div>
                      <div><span className="text-slate-500">{isSelectedRecordDraft ? 'Draft Value: ' : 'Financed: '}</span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.financed_amount)}</span></div>
                      <div><span className="text-slate-500">Installment: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.installment_amount)}</span></div>
                      <div><span className="text-slate-500">{isSelectedRecordDraft ? 'Due Draft Value: ' : 'Due Capital: '}</span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.due_capital_amount)}</span></div>
                      <div><span className="text-slate-500">Current Due Amount: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.due_amount)}</span></div>
                      <div><span className="text-slate-500">Current Due Date: </span><span className="font-semibold text-slate-900">{formatDate(selectedRecord.due_date)}</span></div>
                      <div><span className="text-slate-500">Next Collection Date: </span><span className="font-semibold text-slate-900">{formatDate(selectedRecord.next_collection_date)}</span></div>
                      <div><span className="text-slate-500">Interest: </span><span className="font-semibold text-slate-900">{Number.isFinite(toNumber(selectedRecord.interest_rate)) ? `${toNumber(selectedRecord.interest_rate).toFixed(2)}%` : '-'}</span></div>
                      <div><span className="text-slate-500">Interest Type: </span><span className="font-semibold text-slate-900 capitalize">{selectedRecord.interest_type || '-'}</span></div>
                      <div><span className="text-slate-500">Total Paid: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.total_paid_amount)}</span></div>
                      <div><span className="text-slate-500">Balance: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.balance_amount)}</span></div>
                      <div><span className="text-slate-500">Refund: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.refund_amount)}</span></div>
                      <div><span className="text-slate-500">Arrears: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.arrears)}</span></div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Repayment Plan</p>
                    <div className="mb-3 rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Collection Health</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${collectionHealth.tone}`}>
                          {collectionHealth.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{collectionHealth.hint}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                      <div><span className="text-slate-500">Installment Mode: </span><span className="font-semibold text-slate-900 capitalize">{selectedRecord.repayment_plan?.installment_mode || 'auto'}</span></div>
                      <div><span className="text-slate-500">Schedule Mode: </span><span className="font-semibold text-slate-900 capitalize">{String(selectedRecord.repayment_plan?.schedule_mode || 'auto').replace('_', ' ')}</span></div>
                      <div><span className="text-slate-500">First Installment: </span><span className="font-semibold text-slate-900">{formatDate(selectedRecord.repayment_plan?.first_installment_date)}</span></div>
                      <div><span className="text-slate-500">Collection Day: </span><span className="font-semibold text-slate-900">{selectedRecord.repayment_plan?.collection_day_of_month || '-'}</span></div>
                      <div><span className="text-slate-500">Grace Days: </span><span className="font-semibold text-slate-900">{selectedRecord.repayment_plan?.grace_period_days || 0}</span></div>
                      <div><span className="text-slate-500">Grace Until: </span><span className="font-semibold text-slate-900">{(() => {
                        const due = selectedRecord.due_date;
                        const grace = Math.max(0, Number(selectedRecord.repayment_plan?.grace_period_days || 0));
                        if (!due) return '-';
                        const d = new Date(String(due));
                        if (Number.isNaN(d.getTime())) return '-';
                        d.setDate(d.getDate() + grace);
                        return d.toLocaleDateString();
                      })()}</span></div>
                      <div><span className="text-slate-500">Planned Total: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.repayment_plan?.total_planned_amount)}</span></div>
                    </div>

                    {Array.isArray(selectedRecord.repayment_plan?.installments) && selectedRecord.repayment_plan?.installments.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-cyan-100">
                        <div className="px-2 py-2 text-[11px] font-semibold text-cyan-800 bg-cyan-50/60 border-b border-cyan-100">
                          Upcoming installment highlighted based on saved schedule progress.
                        </div>
                        <table className="min-w-full text-xs text-left text-slate-700 bg-white">
                          <thead className="bg-cyan-50/70">
                            <tr>
                              <th className="px-2 py-2 font-semibold">Installment #</th>
                              <th className="px-2 py-2 font-semibold">Payment Date</th>
                              <th className="px-2 py-2 font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRecord.repayment_plan.installments.map((item, index) => {
                              const nextIndexRaw = toNumber(selectedRecord.repayment_plan?.next_installment_index);
                              const nextIndex = Number.isFinite(nextIndexRaw) ? Math.max(0, Math.floor(nextIndexRaw)) : 0;
                              const isUpcoming = index === nextIndex;

                              return (
                              <tr key={`rp-${index}`} className={`border-b border-cyan-100 last:border-b-0 ${isUpcoming ? 'bg-emerald-50/70' : ''}`}>
                                <td className="px-2 py-2">
                                  {item.installment_no || index + 1}
                                  {isUpcoming && (
                                    <span className="ml-2 inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Upcoming</span>
                                  )}
                                </td>
                                <td className="px-2 py-2">{formatDate(item.payment_date)}</td>
                                <td className="px-2 py-2">{formatAmount(item.amount)}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Default equal-installment plan (no custom installment rows).</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Vehicle Details</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-slate-500">Vehicle No: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.vehicle_no || '-'}</span></p>
                        <p><span className="text-slate-500">Chassis No: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.chassis_no || '-'}</span></p>
                        <p><span className="text-slate-500">Engine No: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.engine_no || '-'}</span></p>
                        <p><span className="text-slate-500">Make/Model: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.make_model || '-'}</span></p>
                        <p><span className="text-slate-500">Year: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.year || '-'}</span></p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Valuation Details</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-slate-500">Amount: </span><span className="text-slate-900 font-semibold">{formatAmount(selectedRecord.valuation_details?.valuation_amount)}</span></p>
                        <p><span className="text-slate-500">Date: </span><span className="text-slate-900 font-semibold">{formatDate(selectedRecord.valuation_details?.valuation_date)}</span></p>
                        <p><span className="text-slate-500">Valuer: </span><span className="text-slate-900 font-semibold">{selectedRecord.valuation_details?.valuer_name || '-'}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Guarantors</p>
                    {Array.isArray(selectedRecord.guarantor_details) && selectedRecord.guarantor_details.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedRecord.guarantor_details.map((g, index) => (
                          <div key={`g-${index}`} className="rounded-lg border border-cyan-100 bg-cyan-50/35 p-3 text-sm">
                            <p><span className="text-slate-500">Name: </span><span className="text-slate-900 font-semibold">{g.name || '-'}</span></p>
                            <p><span className="text-slate-500">NIC: </span><span className="text-slate-900 font-semibold">{g.nic || '-'}</span></p>
                            <p><span className="text-slate-500">Phone: </span><span className="text-slate-900 font-semibold">{g.phone || '-'}</span></p>
                            <p><span className="text-slate-500">Address: </span><span className="text-slate-900 font-semibold">{g.address || '-'}</span></p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No guarantor details found.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Documents</p>
                    {Array.isArray(selectedRecord.documents) && selectedRecord.documents.length > 0 ? (
                      <div className="space-y-2">
                        {selectedRecord.documents.map((doc) => (
                          <div key={doc.id} className="rounded-lg border border-cyan-100 bg-cyan-50/35 px-3 py-2 text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{doc.original_name || 'Unnamed file'}</span>
                            <span className="text-slate-500"> ({doc.document_type || 'document'})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No documents uploaded.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-3">Post Collection</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date</label>
                        <input
                          type="date"
                          value={collectionDate}
                          onChange={(e) => setCollectionDate(e.target.value)}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Amount</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={collectionAmount}
                          onChange={(e) => setCollectionAmount(e.target.value)}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Pay Type</label>
                        <select
                          value={collectionPayType}
                          onChange={(e) => {
                            const next = e.target.value as 'cash' | 'bank_transfer' | 'cheque' | 'card' | 'online';
                            setCollectionPayType(next);
                            if (next !== 'cheque') {
                              setChequeNo('');
                              setChequeDate('');
                              setChequeBank('');
                            }
                          }}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          <option value="cash">Cash</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="cheque">Cheque</option>
                          <option value="card">Card</option>
                          <option value="online">Online</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Reference No</label>
                        <input
                          value={collectionReference}
                          onChange={(e) => setCollectionReference(e.target.value)}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                          placeholder="Receipt / TXN reference"
                        />
                      </div>
                    </div>

                    {collectionPayType === 'cheque' && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Cheque No</label>
                          <input
                            value={chequeNo}
                            onChange={(e) => setChequeNo(e.target.value)}
                            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                            placeholder="Cheque number"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Cheque Date</label>
                          <input
                            type="date"
                            value={chequeDate}
                            onChange={(e) => setChequeDate(e.target.value)}
                            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Cheque Bank</label>
                          <input
                            value={chequeBank}
                            onChange={(e) => setChequeBank(e.target.value)}
                            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900"
                            placeholder="Bank name"
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={submitCollection}
                          disabled={collecting || detailLoading}
                          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                        >
                          {collecting ? 'Posting...' : 'Collect Payment'}
                        </button>
                      </div>
                    </div>

                    {collectionError && (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        {collectionError}
                      </div>
                    )}

                    {lastCalculation && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 grid grid-cols-1 md:grid-cols-8 gap-2 text-xs">
                        <div><span className="text-slate-500">Profit Due (Period): </span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.interest)}</span></div>
                        <div><span className="text-slate-500">Profit Collected: </span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.profit_collected)}</span></div>
                        <div><span className="text-slate-500">{isSelectedRecordDraft ? 'Draft Value Collected: ' : 'Capital Collected: '}</span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.capital_collected)}</span></div>
                        <div><span className="text-slate-500">{isSelectedRecordDraft ? 'New Draft Value: ' : 'New Capital: '}</span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.new_capital)}</span></div>
                        <div><span className="text-slate-500">New Arrears: </span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.new_arrears)}</span></div>
                        <div><span className="text-slate-500">Refund: </span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.refund_amount)}</span></div>
                        <div><span className="text-slate-500">Total Paid: </span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.total_paid_amount)}</span></div>
                        <div><span className="text-slate-500">Balance: </span><span className="font-bold text-slate-900">{formatAmount(lastCalculation.balance_amount)}</span></div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Collection History</p>
                    {Array.isArray(selectedRecord.collections) && selectedRecord.collections.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-cyan-100">
                        <table className="min-w-full text-xs text-left text-slate-700 bg-white">
                          <thead className="bg-cyan-50/70">
                            <tr>
                              <th className="px-2 py-2 font-semibold">Date</th>
                              <th className="px-2 py-2 font-semibold">Paid</th>
                              <th className="px-2 py-2 font-semibold">Refund</th>
                              <th className="px-2 py-2 font-semibold">Pay Type</th>
                              <th className="px-2 py-2 font-semibold">Reference</th>
                              <th className="px-2 py-2 font-semibold">Cheque Details</th>
                              <th className="px-2 py-2 font-semibold">Profit</th>
                              <th className="px-2 py-2 font-semibold">{isSelectedRecordDraft ? 'Draft Value' : 'Capital'}</th>
                              <th className="px-2 py-2 font-semibold">Arrears</th>
                              <th className="px-2 py-2 font-semibold">{isSelectedRecordDraft ? 'Draft Balance' : 'Balance'}</th>
                              <th className="px-2 py-2 font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRecord.collections.map((item) => (
                              <tr key={item.id} className="border-b border-cyan-100 last:border-b-0">
                                <td className="px-2 py-2">{formatDate(item.payment_date)}</td>
                                <td className="px-2 py-2">{formatAmount(item.payment_amount)}</td>
                                <td className="px-2 py-2">{formatAmount(item.refund_amount)}</td>
                                <td className="px-2 py-2 capitalize">{String(item.pay_type || 'cash').replace('_', ' ')}</td>
                                <td className="px-2 py-2">{item.reference_no || '-'}</td>
                                <td className="px-2 py-2">
                                  {item.pay_type === 'cheque'
                                    ? `${item.cheque_no || '-'} / ${formatDate(item.cheque_date)} / ${item.cheque_bank || '-'}`
                                    : '-'}
                                </td>
                                <td className="px-2 py-2">{formatAmount(item.interest_paid)}</td>
                                <td className="px-2 py-2">{formatAmount(item.principal_paid)}</td>
                                <td className="px-2 py-2">{formatAmount(item.arrears)}</td>
                                <td className="px-2 py-2">{formatAmount(item.remaining_capital)}</td>
                                <td className="px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => deleteCollection(item.id)}
                                    disabled={deletingCollectionId === item.id || collecting || detailLoading}
                                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    {deletingCollectionId === item.id ? 'Deleting...' : 'Delete'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No collections posted yet.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
