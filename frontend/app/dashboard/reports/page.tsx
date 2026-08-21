'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Clock3,
  FileText,
  Home,
  Landmark,
  LayoutGrid,
  LineChart,
  PiggyBank,
  Search,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

type ReportItem = {
  title: string;
  description: string;
  path?: string;
};

type ReportCategory = {
  key: string;
  title: string;
  shortTitle: string;
  icon: LucideIcon;
  gradient: string;
  bg: string;
  border: string;
  badge: string;
  iconBg: string;
  reports: ReportItem[];
};

const slugifyWidgetPart = (value: string) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export default function ReportsHubPage() {
  const router = useRouter();
  const apiBase = getApiBaseUrl();
  const widgetPrefix = 'reports_hub_widget_';
  const [token, setToken] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());

  const normalizeText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const fetchWidgetPreferences = useCallback(
    async (authToken: string) => {
      setLoadingWidgets(true);
      try {
        const response = await axios.get(`${apiBase}/dashboard/widgets`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            Accept: 'application/json',
          },
        });

        const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
        const nextHidden = new Set<string>();
        for (const row of rows) {
          const key = String(row?.widget_key || '').trim();
          if (!key) continue;
          if (row?.is_visible === false) {
            nextHidden.add(key);
          }
        }
        setHiddenWidgetKeys(nextHidden);
      } catch {
        setHiddenWidgetKeys(new Set());
      } finally {
        setLoadingWidgets(false);
      }
    },
    [apiBase]
  );

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean, hiddenRoutePath?: string) => {
      if (!token) return false;
      const normalizedKey = String(widgetKey || '').trim();
      if (!normalizedKey || normalizedKey.length > 120) return false;
      const normalizedHiddenRoutePath = String(hiddenRoutePath || '').trim();

      try {
        await axios.patch(
          `${apiBase}/dashboard/widgets`,
          {
            widget_key: normalizedKey,
            is_visible: Boolean(isVisible),
            hidden_route_path:
              !isVisible && normalizedHiddenRoutePath.startsWith('/dashboard') ? normalizedHiddenRoutePath : null,
          },
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
    },
    [apiBase, token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string, hiddenRoutePath?: string) => {
      const previous = new Set(hiddenWidgetKeys);
      const next = new Set(hiddenWidgetKeys);
      next.add(widgetKey);
      setHiddenWidgetKeys(next);

      const ok = await saveWidgetPreference(widgetKey, false, hiddenRoutePath);
      if (!ok) {
        setHiddenWidgetKeys(previous);
      }
    },
    [hiddenWidgetKeys, saveWidgetPreference]
  );

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
    void fetchWidgetPreferences(storedToken);
  }, [fetchWidgetPreferences, router]);

  const categories = useMemo<ReportCategory[]>(
    () => [
      {
        key: 'accounting',
        title: 'Accounting Related Reports',
        shortTitle: 'Accounting',
        icon: BookOpen,
        gradient: 'from-violet-500 to-purple-600',
        bg: 'from-violet-50 to-purple-50',
        border: 'border-violet-100',
        badge: 'bg-violet-50 text-violet-800 border-violet-200',
        iconBg: 'from-violet-500 to-purple-600',
        reports: [
          {
            title: 'Trial Balance',
            description: 'Verify debit and credit balances for every account. Essential for auditors.',
            path: '/dashboard/reports/trial-balance',
          },
          {
            title: 'Balance Sheet',
            description: 'Assets, liabilities, and equity showing the business financial position.',
            path: '/dashboard/reports/balance-sheet',
          },
          {
            title: 'Profit and Loss Statement',
            description: 'Income, expenses, and net profit showing actual business profitability.',
            path: '/dashboard/reports/profit-loss',
          },
          {
            title: 'Journal Entries Report',
            description: 'Audit trail of account movements with debit and credit verification.',
            path: '/dashboard/reports/journal-entries',
          },
          {
            title: 'Bank Book',
            description: 'Deposits, withdrawals, and balances for each bank account.',
            path: '/dashboard/reports/bank-book',
          },
          {
            title: 'Cash Book',
            description: 'All cash receipts and payments for daily cash verification.',
            path: '/dashboard/reports/cash-book',
          },
          {
            title: 'Collector Wallet Deposits Report',
            description: 'Admin report for field and collection officer wallet-to-bank deposits.',
            path: '/dashboard/reports/collector-wallet-deposits',
          },
          {
            title: 'Financial Overview',
            description: 'Assets, liabilities, income, expenses, and profit in one structured summary.',
            path: '/dashboard/accounting/overview',
          },
          {
            title: 'Income and Expense Report',
            description: 'Track revenue, expenses, and profitability across all lending products.',
            path: '/dashboard/reports/income-expense',
          },
          {
            title: 'Cash Flow Report',
            description: 'Unified cash in and cash out across finance, micro credit, mortgage, and instant loans.',
            path: '/dashboard/reports/cash-flow',
          },
          {
            title: 'General Ledger Snapshot',
            description: 'Account-wise ledger balances and movement for the selected branch.',
            path: '/dashboard/reports/general-ledger',
          },
          {
            title: 'Expenses Report',
            description: 'Branch operating expenses by category, payment method, and date range.',
            path: '/dashboard/reports/expenses',
          },
        ],
      },
      {
        key: 'loan-portfolio',
        title: 'Loan Portfolio Reports',
        shortTitle: 'Loans',
        icon: LineChart,
        gradient: 'from-fuchsia-500 to-pink-600',
        bg: 'from-fuchsia-50 to-pink-50',
        border: 'border-fuchsia-100',
        badge: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
        iconBg: 'from-fuchsia-500 to-pink-600',
        reports: [
          {
            title: 'Loan Receivable Report',
            description: 'Outstanding amounts customers still owe across all lending products.',
            path: '/dashboard/reports/loan-receivable',
          },
          {
            title: 'Portfolio Arrears Report',
            description: 'Overdue loans and days overdue for collection management.',
            path: '/dashboard/microfinance/reports/arrears',
          },
          {
            title: 'Interest Income Report',
            description: 'Interest and penalty income by period, branch, and product.',
            path: '/dashboard/reports/interest-income',
          },
          {
            title: 'Loan Disbursement Report',
            description: 'New loans disbursed with amount, branch, and officer details.',
            path: '/dashboard/reports/loan-disbursement',
          },
        ],
      },
      {
        key: 'management',
        title: 'Management Reports',
        shortTitle: 'Management',
        icon: Briefcase,
        gradient: 'from-slate-600 to-zinc-700',
        bg: 'from-slate-50 to-zinc-50',
        border: 'border-slate-200',
        badge: 'bg-slate-50 text-slate-800 border-slate-200',
        iconBg: 'from-slate-600 to-zinc-700',
        reports: [
          {
            title: 'Branch Profitability Report',
            description: 'Income, expense, and profit comparison by branch.',
            path: '/dashboard/reports/branch-profitability',
          },
          {
            title: 'Investor Funding Report',
            description: 'Investor capital and deposit balances from savings accounts.',
            path: '/dashboard/reports/investor-funding',
          },
        ],
      },
      {
        key: 'microfinance',
        title: 'Micro Finance Related Reports',
        shortTitle: 'Micro Finance',
        icon: Landmark,
        gradient: 'from-cyan-500 to-blue-600',
        bg: 'from-cyan-50 to-blue-50',
        border: 'border-cyan-100',
        badge: 'bg-cyan-50 text-cyan-800 border-cyan-200',
        iconBg: 'from-cyan-500 to-blue-600',
        reports: [
          {
            title: 'Collection Report',
            description: 'Daily and range-wise collections with breakdown details.',
            path: '/dashboard/microfinance/reports/collection',
          },
          {
            title: 'Field Officer Collection Report',
            description: 'Performance and totals by field officer.',
            path: '/dashboard/microfinance/reports/field-officer-collection',
          },
          {
            title: 'Arrears Report',
            description: 'Overdue and arrears-focused loan analysis.',
            path: '/dashboard/microfinance/reports/arrears',
          },
          {
            title: 'Active Member Report',
            description: 'Active borrowers and repayment visibility.',
            path: '/dashboard/microfinance/reports/active-members',
          },
          {
            title: 'Blacklisted Customer Report',
            description: 'Risk profile and blacklisted customer exposure.',
            path: '/dashboard/microfinance/reports/blacklisted-customers',
          },
          {
            title: 'Re-Payment Report',
            description: 'Repayment rate and pending amounts by account.',
            path: '/dashboard/microfinance/reports/repayment',
          },
          {
            title: 'Recovery Report',
            description: 'Recovery priority and difficult portfolio tracking.',
            path: '/dashboard/microfinance/reports/recovery',
          },
        ],
      },
      {
        key: 'mortgage',
        title: 'Mortgage Management Related Reports',
        shortTitle: 'Mortgage',
        icon: Home,
        gradient: 'from-indigo-500 to-violet-600',
        bg: 'from-indigo-50 to-violet-50',
        border: 'border-indigo-100',
        badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        iconBg: 'from-indigo-500 to-violet-600',
        reports: [
          {
            title: 'Mortgage Collection Report',
            description: 'Track mortgage installment collections and dues.',
            path: '/dashboard/mortgages/reports/collection',
          },
          {
            title: 'Mortgage Profit Report',
            description: 'Interest income and profit from mortgage collections.',
            path: '/dashboard/mortgages/reports/profit',
          },
          {
            title: 'Mortgage Arrears Report',
            description: 'Identify overdue mortgage accounts and balances.',
            path: '/dashboard/mortgages/reports/arrears',
          },
          {
            title: 'Mortgage Portfolio Report',
            description: 'Overall mortgage portfolio health and statuses.',
            path: '/dashboard/mortgages/reports/portfolio',
          },
        ],
      },
      {
        key: 'savings',
        title: 'Savings and Deposit Related Reports',
        shortTitle: 'Savings',
        icon: PiggyBank,
        gradient: 'from-amber-500 to-orange-600',
        bg: 'from-amber-50 to-orange-50',
        border: 'border-amber-100',
        badge: 'bg-amber-50 text-amber-800 border-amber-200',
        iconBg: 'from-amber-500 to-orange-600',
        reports: [
          {
            title: 'Savings Ledger Report',
            description: 'Savings deposits, withdrawals, and balances by account.',
            path: '/dashboard/savings-deposits/reports/ledger',
          },
          {
            title: 'Deposit Growth Report',
            description: 'Period-over-period savings and deposit growth summary.',
            path: '/dashboard/savings-deposits/reports/deposit-growth',
          },
          {
            title: 'Maturity Report',
            description: 'Upcoming and completed deposit maturities.',
            path: '/dashboard/savings-deposits/reports/maturity',
          },
        ],
      },
      {
        key: 'finance',
        title: 'Finance Management Related Reports',
        shortTitle: 'Finance',
        icon: TrendingUp,
        gradient: 'from-emerald-500 to-teal-600',
        bg: 'from-emerald-50 to-teal-50',
        border: 'border-emerald-100',
        badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        iconBg: 'from-emerald-500 to-teal-600',
        reports: [
          {
            title: 'Finance Portfolio Reports',
            description: 'Portfolio KPIs, monthly trends, arrears, and profitability by finance account.',
            path: '/dashboard/finance/reports',
          },
        ],
      },
      {
        key: 'branch',
        title: 'Branch Management Related Reports',
        shortTitle: 'Branch',
        icon: Building2,
        gradient: 'from-rose-500 to-red-600',
        bg: 'from-rose-50 to-red-50',
        border: 'border-rose-100',
        badge: 'bg-rose-50 text-rose-800 border-rose-200',
        iconBg: 'from-rose-500 to-red-600',
        reports: [
          {
            title: 'Branch Performance Report',
            description: 'Operational and financial KPI comparison by branch.',
            path: '/dashboard/reports/branch-performance',
          },
          {
            title: 'Branch Collection Report',
            description: 'Collections and pending balances per branch.',
            path: '/dashboard/reports/branch-collection',
          },
          {
            title: 'Branch Repayment Report',
            description: 'Repayment rates, amounts repaid, and pending balances by branch.',
            path: '/dashboard/reports/branch-repayment',
          },
          {
            title: 'Branch Staff Productivity Report',
            description: 'Team-level work output and service delivery metrics.',
          },
        ],
      },
    ],
    []
  );

  const normalizedSearch = normalizeText(searchQuery);

  const getReportWidgetKey = useCallback(
    (categoryKey: string, reportTitle: string) =>
      `${widgetPrefix}report_${slugifyWidgetPart(categoryKey)}_${slugifyWidgetPart(reportTitle)}`,
    [widgetPrefix]
  );

  const filteredCategories = useMemo(() => {
    return categories
      .filter((category) => activeCategory === 'all' || category.key === activeCategory)
      .map((category) => {
        if (!normalizedSearch) {
          return category;
        }

        const reports = category.reports.filter((report) => {
          const haystack = normalizeText(`${report.title} ${report.description}`);
          return haystack.includes(normalizedSearch);
        });

        return { ...category, reports };
      })
      .filter((category) => category.reports.length > 0);
  }, [categories, activeCategory, normalizedSearch]);

  const visibleFilteredCategories = useMemo(() => {
    return filteredCategories
      .filter((category) => !hiddenWidgetKeys.has(`${widgetPrefix}category_${category.key}`))
      .map((category) => {
        const visibleReports = category.reports.filter(
          (report) => !hiddenWidgetKeys.has(getReportWidgetKey(category.key, report.title))
        );

        return {
          ...category,
          reports: visibleReports,
        };
      })
      .filter((category) => category.reports.length > 0);
  }, [filteredCategories, getReportWidgetKey, hiddenWidgetKeys, widgetPrefix]);

  const hubStats = useMemo(() => {
    const allReports = categories.flatMap((category) => category.reports);
    const available = allReports.filter((report) => Boolean(report.path)).length;
    const comingSoon = allReports.length - available;

    return {
      categories: categories.length,
      totalReports: allReports.length,
      available,
      comingSoon,
    };
  }, [categories]);

  const categoryFilters = useMemo(
    () => [{ key: 'all', label: 'All Domains' }, ...categories.map((c) => ({ key: c.key, label: c.shortTitle }))],
    [categories]
  );

  const openReport = (path: string) => {
    router.push(path);
  };

  if (!token || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-100 relative overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-10 h-72 w-72 rounded-full bg-cyan-300 blur-3xl" />
        <div className="absolute top-24 right-8 h-80 w-80 rounded-full bg-blue-300 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-indigo-300 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {!hiddenWidgetKeys.has(`${widgetPrefix}hero`) && (
        <div className="relative rounded-3xl border border-cyan-100 bg-gradient-to-r from-cyan-700 via-blue-700 to-indigo-700 p-6 text-white shadow-lg">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}hero`)}
              className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/15 text-sm font-bold text-white hover:bg-rose-500"
              aria-label="Hide reports hero widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100">Reports Center</p>
              <h1 className="text-2xl md:text-3xl font-extrabold mt-1">All Reports Hub</h1>
              <p className="text-sm text-cyan-50 mt-1 max-w-2xl">
                Browse accounting, micro finance, mortgage, savings, finance, and branch reports from one organized hub.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Main Dashboard
            </button>
          </div>
        </div>
        )}

        {!hiddenWidgetKeys.has(`${widgetPrefix}stats`) && (
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}stats`)}
              className="absolute -right-2 -top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 shadow hover:border-rose-300 hover:text-rose-700"
              aria-label="Hide reports stats widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          {[
            {
              label: 'Domains',
              value: String(hubStats.categories),
              icon: LayoutGrid,
              accent: 'from-cyan-500 to-blue-600',
              valueClass: 'text-cyan-700',
            },
            {
              label: 'Total Reports',
              value: String(hubStats.totalReports),
              icon: FileText,
              accent: 'from-indigo-500 to-violet-600',
              valueClass: 'text-indigo-700',
            },
            {
              label: 'Available Now',
              value: String(hubStats.available),
              icon: BarChart3,
              accent: 'from-emerald-500 to-teal-600',
              valueClass: 'text-emerald-700',
            },
            {
              label: 'Coming Soon',
              value: String(hubStats.comingSoon),
              icon: Clock3,
              accent: 'from-amber-500 to-orange-600',
              valueClass: 'text-amber-700',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                    <p className={`mt-1 text-sm font-bold truncate tabular-nums leading-snug ${item.valueClass}`}>{item.value}</p>
                  </div>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.accent} text-white`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}

        {!hiddenWidgetKeys.has(`${widgetPrefix}filters`) && (
        <div className="relative rounded-3xl border border-white/80 bg-white/90 p-5 shadow-sm space-y-4">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters`)}
              className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700"
              aria-label="Hide reports filter widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-cyan-700" />
            <h2 className="text-sm font-bold text-black">Find a Report</h2>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by report name or description..."
              className="w-full rounded-xl border border-cyan-200/80 bg-white py-2.5 pl-10 pr-4 text-sm text-black shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200/80 placeholder:text-slate-400"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categoryFilters.map((filter) => {
              const active = activeCategory === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveCategory(filter.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'border-cyan-600 bg-cyan-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {filteredCategories.length === 0 ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-amber-900">No reports match your search</p>
            <p className="text-xs text-amber-800 mt-1">Try a different keyword or clear the domain filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="mt-4 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              Clear filters
            </button>
          </div>
        ) : visibleFilteredCategories.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white/90 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">All report category widgets are hidden.</p>
            <p className="text-xs text-slate-500 mt-1">Use restore hidden widgets from dashboard settings if needed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {visibleFilteredCategories.map((category) => {
              const CategoryIcon = category.icon;

              return (
                <div
                  key={category.key}
                  className={`group relative overflow-hidden rounded-3xl border ${category.border} bg-white/90 shadow-sm`}
                >
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => void hideWidget(`${widgetPrefix}category_${category.key}`)}
                      className="absolute right-4 top-4 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 shadow hover:border-rose-300 hover:text-rose-700"
                      aria-label={`Hide ${category.shortTitle} category widget`}
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <div className={`absolute inset-0 bg-gradient-to-br ${category.bg} opacity-50`} />

                  <div className="relative p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${category.iconBg} text-white shadow-md`}
                        >
                          <CategoryIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-extrabold text-slate-900">{category.title}</h2>
                          <p className="text-xs text-slate-500">{category.reports.length} reports in this domain</p>
                        </div>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${category.badge}`}>
                        {category.shortTitle}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {category.reports.map((report) => {
                        const isAvailable = Boolean(report.path);

                        if (isAvailable) {
                          return (
                            <div key={`${category.key}-${report.title}`} className="relative">
                              <WidgetCloseGate>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void hideWidget(getReportWidgetKey(category.key, report.title), report.path);
                                  }}
                                  className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:border-rose-300 hover:text-rose-700"
                                  aria-label={`Hide ${report.title} report card`}
                                >
                                  ×
                                </button>
                              </WidgetCloseGate>
                              <button
                                type="button"
                                onClick={() => openReport(report.path as string)}
                                className="w-full rounded-xl border border-white/80 bg-white/90 p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50/60 hover:shadow-sm group/item"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover/item:bg-white">
                                      <BarChart3 className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 pr-8">
                                      <p className="text-sm font-semibold text-slate-900">{report.title}</p>
                                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{report.description}</p>
                                    </div>
                                  </div>
                                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover/item:text-cyan-700 mt-1" />
                                </div>
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div key={`${category.key}-${report.title}`} className="relative">
                            <WidgetCloseGate>
                              <button
                                type="button"
                                onClick={() => void hideWidget(getReportWidgetKey(category.key, report.title))}
                                className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:border-rose-300 hover:text-rose-700"
                                aria-label={`Hide ${report.title} report card`}
                              >
                                ×
                              </button>
                            </WidgetCloseGate>
                            <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                    <Clock3 className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 pr-8">
                                    <p className="text-sm font-semibold text-slate-700">{report.title}</p>
                                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{report.description}</p>
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                                  Coming Soon
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
