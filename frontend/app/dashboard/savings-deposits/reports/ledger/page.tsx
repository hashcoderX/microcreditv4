'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, Filter, ListOrdered, TrendingDown, TrendingUp } from 'lucide-react';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type LedgerRow = {
  id: number;
  transaction_type?: string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
  reference_no?: string | null;
  note?: string | null;
  balance_before?: number | string | null;
  balance_after?: number | string | null;
  savings_account?: {
    id: number;
    account_number?: string | null;
    account_type?: string | null;
    status?: string | null;
    balance?: number | string | null;
    customer?: {
      customer_code?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
    } | null;
  } | null;
};

type Summary = {
  total_transactions: number;
  total_deposits: number;
  total_withdrawals: number;
  total_interest_credits: number;
  net_movement: number;
  accounts_touched: number;
  latest_transaction_date?: string | null;
};

type LedgerData = {
  data: LedgerRow[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(value: unknown): string {
  return toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function csvEscape(value: unknown): string {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

export default function SavingsLedgerReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const API_URL = '' /* use /api via getApiBaseUrl in new code */;

  const branchId = Number(searchParams.get('branch_id') || 0) || undefined;

  const [token, setToken] = useState('');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [transactionType, setTransactionType] = useState('all');
  const [accountType, setAccountType] = useState('all');
  const [status, setStatus] = useState('all');

  const [page, setPage] = useState(1);
  const [perPage] = useState(25);

  const [summary, setSummary] = useState<Summary>({
    total_transactions: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    total_interest_credits: 0,
    net_movement: 0,
    accounts_touched: 0,
    latest_transaction_date: null,
  });
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [pagination, setPagination] = useState<LedgerData>({
    data: [],
    current_page: 1,
    last_page: 1,
    total: 0,
    per_page: 25,
  });
  const widgetPrefix = 'savings_ledger_widget_';

  const fetchWidgetPreferences = async (authToken: string) => {
    try {
      const response = await axios.get('/api/dashboard/widgets', {
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
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        '/api/dashboard/widgets',
        { widget_key: widgetKey, is_visible: isVisible },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch {
      return false;
    }
  };

  const hideWidget = async (widgetKey: string) => {
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

  const fetchLedger = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await axios.get(`/api/savings-accounts/reports/ledger`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        params: {
          branch_id: branchId,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          transaction_type: transactionType === 'all' ? undefined : transactionType,
          account_type: accountType === 'all' ? undefined : accountType,
          status: status === 'all' ? undefined : status,
          search: search.trim() || undefined,
          page,
          per_page: perPage,
        },
      });

      const payload = response.data || {};
      const pageData = payload.data || {};
      const nextRows = Array.isArray(pageData.data) ? pageData.data : [];

      setSummary({
        total_transactions: Number(payload.summary?.total_transactions || 0),
        total_deposits: toNumber(payload.summary?.total_deposits),
        total_withdrawals: toNumber(payload.summary?.total_withdrawals),
        total_interest_credits: toNumber(payload.summary?.total_interest_credits),
        net_movement: toNumber(payload.summary?.net_movement),
        accounts_touched: Number(payload.summary?.accounts_touched || 0),
        latest_transaction_date: payload.summary?.latest_transaction_date || null,
      });

      setRows(nextRows);
      setPagination({
        data: nextRows,
        current_page: Number(pageData.current_page || 1),
        last_page: Number(pageData.last_page || 1),
        total: Number(pageData.total || nextRows.length),
        per_page: Number(pageData.per_page || perPage),
      });
    } catch {
      setSummary({
        total_transactions: 0,
        total_deposits: 0,
        total_withdrawals: 0,
        total_interest_credits: 0,
        net_movement: 0,
        accounts_touched: 0,
        latest_transaction_date: null,
      });
      setRows([]);
      setPagination({
        data: [],
        current_page: 1,
        last_page: 1,
        total: 0,
        per_page: perPage,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, branchId]);

  const applyFilters = () => {
    setPage(1);
    fetchLedger();
  };

  const resetFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
    setTransactionType('all');
    setAccountType('all');
    setStatus('all');
    setPage(1);
    setTimeout(() => {
      fetchLedger();
    }, 0);
  };

  const exportCsv = () => {
    const headers = [
      'Date',
      'Account Number',
      'Customer',
      'Customer Code',
      'Account Type',
      'Status',
      'Transaction Type',
      'Amount',
      'Balance Before',
      'Balance After',
      'Reference No',
      'Note',
    ];

    const records = rows.map((row) => {
      const customerName = `${row.savings_account?.customer?.first_name || ''} ${row.savings_account?.customer?.last_name || ''}`.trim();
      return [
        formatDate(row.transaction_date),
        String(row.savings_account?.account_number || '-'),
        customerName || '-',
        String(row.savings_account?.customer?.customer_code || '-'),
        String(row.savings_account?.account_type || '-'),
        String(row.savings_account?.status || '-'),
        String(row.transaction_type || '-'),
        amount(row.amount),
        amount(row.balance_before),
        amount(row.balance_after),
        String(row.reference_no || '-'),
        String(row.note || '-'),
      ];
    });

    const csv = [headers, ...records].map((line) => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'savings-ledger-report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasRows = useMemo(() => rows.length > 0, [rows]);
  const showHeaderWidget = !hiddenWidgetKeys.has(`${widgetPrefix}header`);
  const statsCards = [
    { key: 'stat_total_transactions', label: 'Total Transactions', value: summary.total_transactions, valueClass: 'text-2xl font-extrabold text-slate-900 mt-1' },
    { key: 'stat_total_deposits', label: 'Total Deposits', value: amount(summary.total_deposits), valueClass: 'text-2xl font-extrabold text-emerald-700 mt-1' },
    { key: 'stat_total_withdrawals', label: 'Total Withdrawals', value: amount(summary.total_withdrawals), valueClass: 'text-2xl font-extrabold text-rose-700 mt-1' },
    { key: 'stat_total_interest', label: 'Interest Credits', value: amount(summary.total_interest_credits), valueClass: 'text-2xl font-extrabold text-cyan-700 mt-1' },
    {
      key: 'stat_net_movement',
      label: 'Net Movement',
      value: amount(summary.net_movement),
      valueClass: `text-2xl font-extrabold mt-1 ${summary.net_movement >= 0 ? 'text-cyan-700' : 'text-rose-700'}`,
    },
    { key: 'stat_accounts_touched', label: 'Accounts Touched', value: summary.accounts_touched, valueClass: 'text-2xl font-extrabold text-slate-900 mt-1' },
  ];
  const visibleStatsCards = statsCards.filter((card) => !hiddenWidgetKeys.has(`${widgetPrefix}${card.key}`));
  const showFiltersWidget = !hiddenWidgetKeys.has(`${widgetPrefix}filters`);
  const showLedgerWidget = !hiddenWidgetKeys.has(`${widgetPrefix}ledger_entries`);
  const showInsightsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}insights`);
  const ledgerColumns = [
    { key: 'date', label: 'Date' },
    { key: 'account', label: 'Account' },
    { key: 'customer', label: 'Customer' },
    { key: 'txn_type', label: 'Txn Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'before', label: 'Before' },
    { key: 'after', label: 'After' },
    { key: 'reference', label: 'Reference' },
    { key: 'note', label: 'Note' },
  ] as const;
  const visibleLedgerColumns = ledgerColumns.filter(
    (column) => !hiddenWidgetKeys.has(`${widgetPrefix}col_${column.key}`)
  );
  const isAnyWidgetVisible =
    showHeaderWidget || visibleStatsCards.length > 0 || showFiltersWidget || showLedgerWidget || showInsightsWidget;

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-amber-50 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-yellow-300 blur-3xl"></div>
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-orange-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-300 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {widgetNotice ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {widgetNotice}
          </div>
        ) : null}
        {!isAnyWidgetVisible ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            All widgets are hidden on this page. Restore hidden widgets from dashboard.
          </div>
        ) : null}

        {showHeaderWidget ? (
        <div className="bg-white/85 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(146,64,14,0.45)] p-6 md:p-7 relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-700 border border-orange-100">
                Savings Reports
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Savings Ledger Report</h1>
              <p className="text-sm text-slate-600 mt-1">Track deposits, withdrawals, and account-level balance movements in one ledger.</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={!hasRows}
                onClick={exportCsv}
                className="px-4 py-2 rounded-xl bg-white hover:bg-orange-50 text-orange-800 text-sm font-semibold border border-orange-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold border border-slate-200 shadow-sm inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Reports Hub
              </button>
            </div>
          </div>

          {visibleStatsCards.length > 0 ? (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
              {visibleStatsCards.map((card) => (
                <div key={card.key} className="rounded-xl bg-white/90 border border-orange-100 shadow-sm p-4 relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => void hideWidget(`${widgetPrefix}${card.key}`)}
                      className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`Hide ${card.label} widget`}
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className={card.valueClass}>{card.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        ) : null}

        {showFiltersWidget ? (
        <div className="bg-white/86 backdrop-blur-xl rounded-3xl border border-orange-100 shadow-[0_18px_40px_-24px_rgba(146,64,14,0.45)] p-5 relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide filters widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-orange-700" />
              <h2 className="text-sm font-bold text-slate-900">Filters</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-orange-700 hover:to-amber-700"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-50"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by account, customer, reference"
              className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm text-slate-900 xl:col-span-2"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All Txn Types</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="interest_credit">Interest Credit</option>
            </select>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All Account Types</option>
              <option value="savings">Savings</option>
              <option value="current">Current</option>
              <option value="fixed_deposit">Fixed Deposit</option>
              <option value="investment">Investment</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All Account Statuses</option>
              <option value="active">Active</option>
              <option value="dormant">Dormant</option>
              <option value="closed">Closed</option>
            </select>
            <div className="rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2 text-xs text-slate-600">
              Latest Transaction: <span className="font-semibold text-slate-900">{formatDate(summary.latest_transaction_date)}</span>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2 text-xs text-slate-600 flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-orange-700" />
              Showing {rows.length} rows on this page
            </div>
          </div>
        </div>
        ) : null}

        {showLedgerWidget ? (
        <div className="bg-white/86 backdrop-blur-xl rounded-3xl border border-orange-100 shadow-[0_18px_40px_-24px_rgba(146,64,14,0.45)] p-5 relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}ledger_entries`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide ledger entries widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Ledger Entries</h2>
              <p className="text-xs text-slate-600 mt-1">Transaction-level detail with before and after balances.</p>
            </div>
            <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">
              {pagination.total} records
            </span>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">No ledger entries found for the selected filters.</p>
          ) : visibleLedgerColumns.length === 0 ? (
            <p className="text-sm text-amber-800">All table columns are hidden. Restore hidden widgets from dashboard.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-orange-100">
                <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                  <thead className="bg-orange-50/70 text-slate-700">
                    <tr>
                      {visibleLedgerColumns.map((column) => (
                        <th key={column.key} className="px-3 py-2 font-semibold relative">
                          {column.label}
                          <WidgetCloseGate>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void hideWidget(`${widgetPrefix}col_${column.key}`);
                              }}
                              className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-orange-200 bg-white text-[10px] font-bold text-orange-700 hover:bg-rose-50 hover:text-rose-700"
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
                    {rows.map((row) => {
                      const customerName = `${row.savings_account?.customer?.first_name || ''} ${row.savings_account?.customer?.last_name || ''}`.trim();
                      const txnType = String(row.transaction_type || '').toLowerCase();
                      const isDeposit = txnType === 'deposit';
                      const isInterestCredit = txnType === 'interest_credit';
                      return (
                        <tr key={row.id} className="border-b border-orange-100 last:border-b-0">
                          {visibleLedgerColumns.map((column) => {
                            if (column.key === 'date') {
                              return <td key={column.key} className="px-3 py-2 whitespace-nowrap">{formatDate(row.transaction_date)}</td>;
                            }
                            if (column.key === 'account') {
                              return (
                                <td key={column.key} className="px-3 py-2">
                                  <p className="font-semibold text-slate-900">{row.savings_account?.account_number || '-'}</p>
                                  <p className="text-xs text-slate-500 capitalize">{row.savings_account?.account_type || '-'} | {row.savings_account?.status || '-'}</p>
                                </td>
                              );
                            }
                            if (column.key === 'customer') {
                              return (
                                <td key={column.key} className="px-3 py-2">
                                  <p className="font-semibold text-slate-900">{customerName || '-'}</p>
                                  <p className="text-xs text-slate-500">{row.savings_account?.customer?.customer_code || '-'}</p>
                                </td>
                              );
                            }
                            if (column.key === 'txn_type') {
                              return (
                                <td key={column.key} className="px-3 py-2">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${isDeposit ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : isInterestCredit ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                    {row.transaction_type || '-'}
                                  </span>
                                </td>
                              );
                            }
                            if (column.key === 'amount') {
                              return <td key={column.key} className={`px-3 py-2 font-semibold ${isDeposit ? 'text-emerald-700' : isInterestCredit ? 'text-cyan-700' : 'text-rose-700'}`}>{amount(row.amount)}</td>;
                            }
                            if (column.key === 'before') {
                              return <td key={column.key} className="px-3 py-2">{amount(row.balance_before)}</td>;
                            }
                            if (column.key === 'after') {
                              return <td key={column.key} className="px-3 py-2 font-semibold text-slate-900">{amount(row.balance_after)}</td>;
                            }
                            if (column.key === 'reference') {
                              return <td key={column.key} className="px-3 py-2">{row.reference_no || '-'}</td>;
                            }
                            return <td key={column.key} className="px-3 py-2 max-w-[240px] truncate" title={row.note || '-'}>{row.note || '-'}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-slate-600">Page {pagination.current_page} of {pagination.last_page}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={pagination.current_page >= pagination.last_page}
                    onClick={() => setPage((prev) => Math.min(pagination.last_page, prev + 1))}
                    className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        ) : null}

        {showInsightsWidget ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}insights`)}
              className="absolute right-0 -top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide insights widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="rounded-2xl border border-orange-100 bg-white/86 backdrop-blur-xl p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-700" />
              <p className="font-bold text-slate-900">Deposit Momentum</p>
            </div>
            <p className="text-sm text-slate-600 mt-2">Watch inflow consistency by filtering account types, dates, and customer patterns.</p>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-white/86 backdrop-blur-xl p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-rose-700" />
              <p className="font-bold text-slate-900">Withdrawal Pressure</p>
            </div>
            <p className="text-sm text-slate-600 mt-2">Identify outflow-heavy accounts quickly using ledger-level transaction visibility.</p>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
