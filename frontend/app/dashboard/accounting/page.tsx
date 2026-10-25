'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calculator,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LineChart,
  Search,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

type HubModule = {
  title: string;
  description: string;
  tag: string;
  path: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  accent: string;
  category: 'operations' | 'financial' | 'reports';
};

const hubModules: HubModule[] = [
  {
    title: 'Account Setup',
    description: 'Configure main, cash, and bank accounts with opening balances for each branch.',
    tag: 'Setup',
    path: '/dashboard/accounting/accounts',
    icon: Landmark,
    color: 'from-violet-500 to-purple-600',
    bg: 'from-violet-50/90 to-purple-50/60',
    accent: 'from-violet-500 to-purple-500',
    category: 'operations',
  },
  {
    title: 'Expenses',
    description: 'Record and manage branch operating expenses such as rent, utilities, and supplies.',
    tag: 'Operations',
    path: '/dashboard/accounting/expenses',
    icon: Calculator,
    color: 'from-rose-500 to-red-600',
    bg: 'from-rose-50/90 to-red-50/60',
    accent: 'from-rose-500 to-red-500',
    category: 'operations',
  },
  {
    title: 'Refunds (Cash / Bank Deposit)',
    description: 'Choose refund mode and route the refund entry through cash account or bank deposit workflow.',
    tag: 'Refunds',
    path: '/dashboard/accounting/refunds',
    icon: HandCoins,
    color: 'from-teal-500 to-cyan-600',
    bg: 'from-teal-50/90 to-cyan-50/60',
    accent: 'from-teal-500 to-cyan-500',
    category: 'operations',
  },
  {
    title: 'Loan Extra Charges',
    description: 'Add additional charges to loans and optionally apply them directly to loan balances.',
    tag: 'Loan Charges',
    path: '/dashboard/accounting/loan-extra-charges',
    icon: Wallet,
    color: 'from-amber-500 to-orange-600',
    bg: 'from-amber-50/90 to-orange-50/60',
    accent: 'from-amber-500 to-orange-500',
    category: 'operations',
  },
  {
    title: 'Financial Overview',
    description: 'View assets, liabilities, income, expenses, and profit in one structured summary.',
    tag: 'Overview',
    path: '/dashboard/accounting/overview',
    icon: LayoutDashboard,
    color: 'from-emerald-500 to-teal-600',
    bg: 'from-emerald-50/90 to-teal-50/60',
    accent: 'from-emerald-500 to-teal-500',
    category: 'financial',
  },
  {
    title: 'General Ledger',
    description: 'Review ledger entries and account movements across the organization.',
    tag: 'Ledger',
    path: '/dashboard/reports/general-ledger',
    icon: BookOpen,
    color: 'from-indigo-500 to-violet-600',
    bg: 'from-indigo-50/90 to-violet-50/60',
    accent: 'from-indigo-500 to-violet-500',
    category: 'financial',
  },
  {
    title: 'Cash Flow',
    description: 'Monitor cash inflows and outflows across finance, micro credit, mortgage, and instant loans.',
    tag: 'Cash Flow',
    path: '/dashboard/reports/cash-flow',
    icon: LineChart,
    color: 'from-cyan-500 to-blue-600',
    bg: 'from-cyan-50/90 to-blue-50/60',
    accent: 'from-cyan-500 to-blue-500',
    category: 'financial',
  },
  {
    title: 'Payment Receive & Transfer',
    description: 'Branch manager approval desk for pending wallet deposits, handover acceptance, and transfer to branch cash.',
    tag: 'Approvals',
    path: '/dashboard/accounting/payment-receive',
    icon: HandCoins,
    color: 'from-amber-500 to-orange-600',
    bg: 'from-amber-50/90 to-orange-50/60',
    accent: 'from-amber-500 to-orange-500',
    category: 'financial',
  },
  {
    title: 'All Accounting Reports',
    description: 'Open trial balance, balance sheet, P&L, journal entries, bank book, and more.',
    tag: 'Reports Hub',
    path: '/dashboard/reports',
    icon: FileText,
    color: 'from-fuchsia-500 to-pink-600',
    bg: 'from-fuchsia-50/90 to-pink-50/60',
    accent: 'from-fuchsia-500 to-pink-500',
    category: 'reports',
  },
  {
    title: 'Collector Wallet Deposits Report',
    description: 'Track field and collection officer deposit transactions with branch/date filters.',
    tag: 'Transactions',
    path: '/dashboard/reports/collector-wallet-deposits',
    icon: Wallet,
    color: 'from-emerald-500 to-cyan-600',
    bg: 'from-emerald-50/90 to-cyan-50/60',
    accent: 'from-emerald-500 to-cyan-500',
    category: 'reports',
  },
  {
    title: 'Finance Portfolio Reports',
    description: 'Portfolio KPIs, monthly trends, arrears, and profitability by finance account.',
    tag: 'Finance',
    path: '/dashboard/finance/reports',
    icon: Wallet,
    color: 'from-blue-500 to-indigo-600',
    bg: 'from-blue-50/90 to-indigo-50/60',
    accent: 'from-blue-500 to-indigo-500',
    category: 'reports',
  },
];

const categoryMeta = {
  operations: { label: 'Setup & Operations', hint: 'Configure accounts and record daily expenses.' },
  financial: { label: 'Financial Views', hint: 'Structured summaries and ledger movement.' },
  reports: { label: 'Reports & Analytics', hint: 'Accounting statements and portfolio analytics.' },
} as const;

export default function AccountingModulePage() {
  const router = useRouter();
  const token = useSyncExternalStore(
    () => () => {},
    () => localStorage.getItem('token') || '',
    () => ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | HubModule['category']>('all');

  useEffect(() => {
    if (!token) {
      router.push('/');
    }
  }, [router, token]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredModules = useMemo(() => {
    return hubModules.filter((module) => {
      const matchesCategory = activeCategory === 'all' || module.category === activeCategory;
      if (!matchesCategory) return false;
      if (!normalizedSearch) return true;
      const haystack = `${module.title} ${module.description} ${module.tag}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [activeCategory, normalizedSearch]);

  const groupedModules = useMemo(() => {
    const groups: Array<{ key: HubModule['category']; modules: HubModule[] }> = [];
    (['operations', 'financial', 'reports'] as const).forEach((key) => {
      const modules = filteredModules.filter((module) => module.category === key);
      if (modules.length > 0) groups.push({ key, modules });
    });
    return groups;
  }, [filteredModules]);

  const hubStats = useMemo(
    () => ({
      modules: hubModules.length,
      operations: hubModules.filter((m) => m.category === 'operations').length,
      financial: hubModules.filter((m) => m.category === 'financial').length,
      reports: hubModules.filter((m) => m.category === 'reports').length,
    }),
    []
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-violet-400/25 blur-3xl" />
        <div className="absolute right-0 top-16 h-[28rem] w-[28rem] rounded-full bg-purple-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-indigo-400/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.28]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(124,58,237,0.12) 1px, transparent 0)',
            backgroundSize: '26px 26px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#2e1064] via-[#5b21b6] to-[#4338ca] text-white shadow-[0_30px_80px_-24px_rgba(91,33,182,0.75)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.28),transparent_42%)]" />
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Accounting Command Center
                </span>
                <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Accounting Dashboard</h1>
                <p className="mt-2 text-sm leading-relaxed text-violet-50/90 md:text-base">
                  Manage company accounts, opening balances, expenses, ledger views, and financial reports from one workspace.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-violet-100/90">
                  <span className="rounded-lg bg-white/10 px-2.5 py-1">Dashboard</span>
                  <span className="text-violet-200/50">/</span>
                  <span className="rounded-lg bg-violet-400/20 px-2.5 py-1 font-semibold text-white">Accounting</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/accounting/accounts')}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-300 to-fuchsia-300 px-4 py-2.5 text-sm font-bold text-violet-950 shadow-lg shadow-violet-500/30 transition hover:brightness-110"
                >
                  <Landmark className="h-4 w-4" />
                  Account Setup
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/reports')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  <FileText className="h-4 w-4" />
                  Reports Hub
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { label: 'Overview', href: '/dashboard/accounting/overview' },
                { label: 'Expenses', href: '/dashboard/accounting/expenses' },
                { label: 'Refunds', href: '/dashboard/accounting/refunds' },
                { label: 'Loan Extra Charges', href: '/dashboard/accounting/loan-extra-charges' },
                { label: 'General Ledger', href: '/dashboard/reports/general-ledger' },
                { label: 'Payment Receive & Transfer', href: '/dashboard/accounting/payment-receive' },
                { label: 'Trial Balance', href: '/dashboard/reports/trial-balance' },
                { label: 'Balance Sheet', href: '/dashboard/reports/balance-sheet' },
              ].map((link) => (
                <button
                  key={link.href}
                  type="button"
                  onClick={() => router.push(link.href)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Workspace Modules', value: String(hubStats.modules), tone: 'text-violet-700', bg: 'from-violet-500/10 to-purple-500/5', icon: LayoutDashboard },
            { label: 'Setup & Ops', value: String(hubStats.operations), tone: 'text-rose-700', bg: 'from-rose-500/10 to-red-500/5', icon: Calculator },
            { label: 'Financial Views', value: String(hubStats.financial), tone: 'text-emerald-700', bg: 'from-emerald-500/10 to-teal-500/5', icon: BookOpen },
            { label: 'Report Links', value: String(hubStats.reports), tone: 'text-fuchsia-700', bg: 'from-fuchsia-500/10 to-pink-500/5', icon: FileText },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`overflow-hidden rounded-2xl border border-violet-100/80 bg-gradient-to-br ${item.bg} bg-white/85 p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 chart-animate-panel`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-black">{item.label}</p>
                    <p className={`mt-2 text-2xl font-black ${item.tone}`}>{item.value}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 shadow-sm chart-animate-icon">
                    <Icon className="h-5 w-5 text-violet-700" />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-3xl border border-violet-100/80 bg-white/90 p-5 shadow-sm space-y-4 chart-animate-panel">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-violet-700" />
            <h2 className="text-sm font-bold text-black">Find a Workspace</h2>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search accounting tools..."
              className="w-full rounded-xl border border-violet-200/80 bg-white py-2.5 pl-10 pr-4 text-sm text-black shadow-sm transition focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/80 placeholder:text-violet-300"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Areas' },
              { key: 'operations', label: 'Setup & Ops' },
              { key: 'financial', label: 'Financial Views' },
              { key: 'reports', label: 'Reports' },
            ].map((filter) => {
              const active = activeCategory === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveCategory(filter.key as typeof activeCategory)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                      : 'border-violet-100 bg-white text-black hover:border-violet-200 hover:bg-violet-50'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </section>

        {filteredModules.length === 0 ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-amber-900">No modules match your search</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="mt-4 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-black hover:bg-amber-100"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedModules.map((group) => (
              <section key={group.key} className="space-y-4">
                <div>
                  <h2 className="text-xl font-extrabold text-black">{categoryMeta[group.key].label}</h2>
                  <p className="text-sm text-black/80 mt-1">{categoryMeta[group.key].hint}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.modules.map((module) => {
                    const Icon = module.icon;
                    return (
                      <button
                        key={module.title}
                        type="button"
                        onClick={() => router.push(module.path)}
                        className="group relative overflow-hidden rounded-[1.5rem] border border-violet-100/80 bg-white/85 text-left shadow-sm backdrop-blur transition duration-500 hover:-translate-y-1 hover:shadow-xl chart-animate-panel"
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${module.bg} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />
                        <div className="relative p-5">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${module.color} text-white shadow-lg transition duration-300 group-hover:scale-110 chart-animate-icon`}>
                              <Icon className="h-6 w-6" />
                            </div>
                            <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-800">
                              {module.tag}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-black">{module.title}</h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-black/80">{module.description}</p>
                          <div className="mt-5 flex items-center justify-between">
                            <span className="text-xs font-semibold text-violet-700">Open workspace</span>
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
                              <ArrowRight className="h-4 w-4" />
                            </span>
                          </div>
                          <div className={`absolute bottom-0 left-0 h-1 w-0 bg-gradient-to-r ${module.accent} transition-all duration-500 group-hover:w-full`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <section className="rounded-[1.5rem] border border-violet-100 bg-white/85 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Need full reporting?</p>
              <h2 className="mt-1 text-lg font-extrabold text-black">Accounting Reports Hub</h2>
              <p className="mt-1 text-sm text-black/80">
                Trial balance, balance sheet, profit & loss, journal entries, bank book, cash book, and more.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard/reports')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-95"
            >
              Open Reports Hub
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
