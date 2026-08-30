'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, UserPlus, PiggyBank, Wallet } from 'lucide-react';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type SavingsAccountRow = {
  id: number;
  account_number?: string | null;
  account_type?: 'savings' | 'current' | 'fixed_deposit' | null;
  opening_deposit?: number | string | null;
  balance?: number | string | null;
  interest_rate?: number | string | null;
  status?: string | null;
  opened_at?: string | null;
  customer?: CustomerSummary | null;
};

type CustomerSummary = {
  id: number;
  customer_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
};

function amount(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SavingsDepositsPage() {
  const OVERVIEW_PAGE_SIZE = 10;
  const router = useRouter();
  const [token, setToken] = useState('');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<SavingsAccountRow[]>([]);
  const [overviewPage, setOverviewPage] = useState(1);
  const widgetPrefix = 'savings_deposits_widget_';

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
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }

    setToken(t);
    void fetchWidgetPreferences(t);
  }, [router]);

  const loadAccounts = async (authToken: string) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/savings-accounts', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 500 },
      });

      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      setAccounts(rows);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadAccounts(token);
  }, [token]);

  const dashboardMetrics = useMemo(() => {
    const totalAccounts = accounts.length;
    const activeAccounts = accounts.filter((row) => String(row.status || '').toLowerCase() === 'active').length;
    const totalBalances = accounts.reduce((sum, row) => {
      const n = Number(row.balance);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    const savingsAccounts = accounts.filter((row) => String(row.account_type || '').toLowerCase() === 'savings').length;

    return {
      totalAccounts,
      activeAccounts,
      totalBalances,
      savingsAccounts,
    };
  }, [accounts]);

  const showHeaderWidget = !hiddenWidgetKeys.has(`${widgetPrefix}header`);
  const statCards = [
    { key: 'stat_total_accounts', label: 'Total Accounts', value: dashboardMetrics.totalAccounts, valueClass: 'text-2xl font-extrabold text-slate-900 mt-1' },
    { key: 'stat_active_accounts', label: 'Active Accounts', value: dashboardMetrics.activeAccounts, valueClass: 'text-2xl font-extrabold text-emerald-700 mt-1' },
    { key: 'stat_total_balance', label: 'Total Balance', value: amount(dashboardMetrics.totalBalances), valueClass: 'text-2xl font-extrabold text-orange-700 mt-1' },
    { key: 'stat_savings_accounts', label: 'Savings Accounts', value: dashboardMetrics.savingsAccounts, valueClass: 'text-2xl font-extrabold text-slate-900 mt-1' },
  ];
  const visibleStatCards = statCards.filter((card) => !hiddenWidgetKeys.has(`${widgetPrefix}${card.key}`));
  const actionCards = [
    { key: 'action_register_customer', path: '/dashboard/savings-deposits/customers', title: '1. Register Customer', desc: 'Customer onboarding details in a dedicated page.', Icon: UserPlus },
    { key: 'action_open_account', path: '/dashboard/savings-deposits/accounts', title: '2. Open Account', desc: 'Open savings, current, or fixed-deposit accounts.', Icon: PiggyBank },
    { key: 'action_transactions', path: '/dashboard/savings-deposits/transactions', title: '3. Deposit & Withdrawals', desc: 'Post deposits and withdrawals in a separate operations page.', Icon: Wallet },
  ];
  const visibleActionCards = actionCards.filter((card) => !hiddenWidgetKeys.has(`${widgetPrefix}${card.key}`));
  const showOverviewWidget = !hiddenWidgetKeys.has(`${widgetPrefix}overview`);
  const tableColumns = [
    { key: 'account_number', label: 'Account No' },
    { key: 'customer', label: 'Customer' },
    { key: 'type', label: 'Type' },
    { key: 'opening_deposit', label: 'Opening Deposit' },
    { key: 'balance', label: 'Balance' },
    { key: 'rate', label: 'Rate %' },
    { key: 'status', label: 'Status' },
  ] as const;
  const visibleTableColumns = tableColumns.filter((col) => !hiddenWidgetKeys.has(`${widgetPrefix}col_${col.key}`));
  const overviewPageCount = Math.max(1, Math.ceil(accounts.length / OVERVIEW_PAGE_SIZE));
  const safeOverviewPage = Math.min(Math.max(overviewPage, 1), overviewPageCount);
  const pagedAccounts = useMemo(
    () => accounts.slice((safeOverviewPage - 1) * OVERVIEW_PAGE_SIZE, safeOverviewPage * OVERVIEW_PAGE_SIZE),
    [accounts, safeOverviewPage],
  );
  const overviewRangeStart = accounts.length === 0 ? 0 : (safeOverviewPage - 1) * OVERVIEW_PAGE_SIZE + 1;
  const overviewRangeEnd = Math.min(safeOverviewPage * OVERVIEW_PAGE_SIZE, accounts.length);
  const isAnyWidgetVisible =
    showHeaderWidget ||
    visibleStatCards.length > 0 ||
    visibleActionCards.length > 0 ||
    showOverviewWidget;

  useEffect(() => {
    setOverviewPage((prev) => Math.min(Math.max(prev, 1), Math.max(1, Math.ceil(accounts.length / OVERVIEW_PAGE_SIZE))));
  }, [accounts.length]);


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
        <div className="bg-white/90 rounded-3xl border border-orange-100 p-6 flex items-start justify-between gap-3 flex-wrap relative">
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
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-700">Savings & Deposits</p>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">Savings & Deposits Dashboard</h1>
            <p className="text-sm text-slate-600 mt-1">Use separate pages for customer registration, account opening, and deposit or withdrawal operations.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 rounded-xl bg-white border border-orange-200 text-orange-800 text-sm font-semibold inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Main Dashboard
          </button>
        </div>
        ) : null}

        {visibleStatCards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {visibleStatCards.map((card) => (
              <div key={card.key} className="rounded-2xl border border-orange-100 bg-white/90 p-4 relative">
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
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className={card.valueClass}>{loading ? '-' : card.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {visibleActionCards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {visibleActionCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => router.push(card.path)}
                className="rounded-2xl border border-orange-200 bg-white hover:bg-orange-50 text-left p-5 transition-colors relative"
              >
                <WidgetCloseGate>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void hideWidget(`${widgetPrefix}${card.key}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        void hideWidget(`${widgetPrefix}${card.key}`);
                      }
                    }}
                    className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${card.title} widget`}
                  >
                    ×
                  </span>
                </WidgetCloseGate>
                <card.Icon className="h-5 w-5 text-orange-700" />
                <p className="mt-2 text-sm font-bold text-slate-900">{card.title}</p>
                <p className="mt-1 text-xs text-slate-600">{card.desc}</p>
              </button>
            ))}
          </div>
        ) : null}

        {showOverviewWidget ? (
        <div className="bg-white/90 rounded-3xl border border-orange-100 p-5 space-y-4 relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}overview`)}
              className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide overview widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">Recent Accounts Overview</h2>
            <button
              type="button"
              onClick={() => router.push('/dashboard/savings-deposits/accounts')}
              className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800"
            >
              Manage Accounts
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-sm text-slate-500">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-sm text-slate-500">No savings/deposit accounts found.</div>
          ) : visibleTableColumns.length === 0 ? (
            <div className="py-8 text-sm text-amber-800">All table columns are hidden. Restore hidden widgets from dashboard.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-orange-100">
                      {visibleTableColumns.map((column) => (
                        <th key={column.key} className="py-2 pr-3 relative">
                          {column.label}
                          <WidgetCloseGate>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void hideWidget(`${widgetPrefix}col_${column.key}`);
                              }}
                              className="absolute right-0 top-0 inline-flex h-4 w-4 items-center justify-center rounded-full border border-orange-200 bg-white text-[10px] font-bold text-orange-700 hover:bg-rose-50 hover:text-rose-700"
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
                    {pagedAccounts.map((row) => (
                      <tr key={row.id} className="border-b border-orange-50 text-slate-700">
                        {visibleTableColumns.map((column) => {
                          if (column.key === 'account_number') {
                            return <td key={column.key} className="py-2 pr-3 font-semibold">{row.account_number || '-'}</td>;
                          }
                          if (column.key === 'customer') {
                            return <td key={column.key} className="py-2 pr-3">{row.customer?.customer_code || '-'} - {row.customer?.first_name || ''} {row.customer?.last_name || ''}</td>;
                          }
                          if (column.key === 'type') {
                            return <td key={column.key} className="py-2 pr-3 capitalize">{String(row.account_type || '-').replace('_', ' ')}</td>;
                          }
                          if (column.key === 'opening_deposit') {
                            return <td key={column.key} className="py-2 pr-3">{amount(row.opening_deposit)}</td>;
                          }
                          if (column.key === 'balance') {
                            return <td key={column.key} className="py-2 pr-3">{amount(row.balance)}</td>;
                          }
                          if (column.key === 'rate') {
                            return <td key={column.key} className="py-2 pr-3">{amount(row.interest_rate)}</td>;
                          }
                          return <td key={column.key} className="py-2 pr-3 capitalize">{row.status || '-'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {accounts.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-orange-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-600">
                    Showing {overviewRangeStart} - {overviewRangeEnd} of {accounts.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOverviewPage((prev) => Math.max(prev - 1, 1))}
                      disabled={safeOverviewPage <= 1}
                      className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-semibold text-slate-600">
                      Page {safeOverviewPage} / {overviewPageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverviewPage((prev) => Math.min(prev + 1, overviewPageCount))}
                      disabled={safeOverviewPage >= overviewPageCount}
                      className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        ) : null}
      </div>
    </div>
  );
}
