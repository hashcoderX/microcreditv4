'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  ArrowLeft,
  Banknote,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Landmark,
  Lock,
  PiggyBank,
  Search,
  Sparkles,
  TrendingUp,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  DEFAULT_INTEREST_BY_ACCOUNT,
  formatAccountTypeLabel,
  formatInterestTypeLabel,
  interestTypeUsage,
  RECOMMENDED_INTEREST_BY_ACCOUNT,
  SAVINGS_ACCOUNT_TYPES,
  SAVINGS_INTEREST_TYPES,
  type SavingsAccountType,
  type SavingsInterestType,
} from '@/lib/savingsAccountConfig';

type CustomerSummary = {
  id: number;
  customer_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  nic_passport?: string | null;
};

type SavingsAccountRow = {
  id: number;
  account_number?: string | null;
  account_type?: SavingsAccountType | string | null;
  interest_type?: SavingsInterestType | string | null;
  opening_deposit?: number | string | null;
  balance?: number | string | null;
  interest_rate?: number | string | null;
  status?: string | null;
  customer?: CustomerSummary | null;
};

type AuthRole = { name?: string | null };

type AuthUser = {
  email?: string | null;
  designation?: { name?: string | null } | null;
  roles?: AuthRole[] | null;
  is_system_admin?: boolean | null;
};

const STEPS = [
  { id: 1, label: 'Customer', short: '1' },
  { id: 2, label: 'Account setup', short: '2' },
  { id: 3, label: 'Confirm', short: '3' },
] as const;

const ACCOUNT_ICONS: Record<SavingsAccountType, typeof PiggyBank> = {
  savings: PiggyBank,
  current: Wallet,
  fixed_deposit: Lock,
  investment: TrendingUp,
};

const ACCOUNT_ACCENT: Record<SavingsAccountType, string> = {
  savings: 'from-amber-500 to-orange-500',
  current: 'from-sky-500 to-cyan-500',
  fixed_deposit: 'from-violet-500 to-purple-500',
  investment: 'from-emerald-500 to-teal-500',
};

const inputClass =
  'w-full rounded-xl border border-orange-200/80 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200/80 [color-scheme:light] [&::-webkit-datetime-edit]:text-black';

function amount(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function accountTypeBadgeClass(type: string | null | undefined): string {
  const t = String(type || '').toLowerCase();
  if (t === 'investment') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (t === 'fixed_deposit') return 'bg-violet-100 text-violet-800 border-violet-200';
  if (t === 'current') return 'bg-sky-100 text-sky-800 border-sky-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

function accountTypeDisplayLabel(type: string | null | undefined): string {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'fixed_deposit') {
    return 'Deposit';
  }

  return formatAccountTypeLabel(type);
}

export default function SavingsOpenAccountPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const [activeStep, setActiveStep] = useState(1);
  const [showInterestGuide, setShowInterestGuide] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [detailsRow, setDetailsRow] = useState<SavingsAccountRow | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);
  const [deleteTargetRow, setDeleteTargetRow] = useState<SavingsAccountRow | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editTargetRow, setEditTargetRow] = useState<SavingsAccountRow | null>(null);
  const [editInterestType, setEditInterestType] = useState<SavingsInterestType>('simple_interest');
  const [editInterestRate, setEditInterestRate] = useState('0');
  const [editStatus, setEditStatus] = useState('active');
  const [editOpenedAt, setEditOpenedAt] = useState('');

  const [accounts, setAccounts] = useState<SavingsAccountRow[]>([]);
  const [accountCustomerNo, setAccountCustomerNo] = useState('');
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [accountType, setAccountType] = useState<SavingsAccountType>('savings');
  const [interestType, setInterestType] = useState<SavingsInterestType>(DEFAULT_INTEREST_BY_ACCOUNT.savings);
  const [openingDeposit, setOpeningDeposit] = useState('0');
  const [interestRate, setInterestRate] = useState('4.5');
  const [interestCalcMonths, setInterestCalcMonths] = useState('12');
  const [openedAt, setOpenedAt] = useState('');
  const [resolvedCustomer, setResolvedCustomer] = useState<CustomerSummary | null>(null);
  const widgetPrefix = 'savings_accounts_widget_';

  const availableAccountTypes = useMemo(
    () => SAVINGS_ACCOUNT_TYPES.filter((item) => item.value !== 'fixed_deposit'),
    []
  );

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

  const selectedAccountMeta = useMemo(
    () => availableAccountTypes.find((item) => item.value === accountType),
    [availableAccountTypes, accountType]
  );

  const recommendedInterestTypes = useMemo(
    () => RECOMMENDED_INTEREST_BY_ACCOUNT[accountType] || [],
    [accountType]
  );

  const selectedInterestUsage = useMemo(() => interestTypeUsage(interestType), [interestType]);

  const headerStats = useMemo(() => {
    const active = accounts.filter((a) => String(a.status || '').toLowerCase() === 'active').length;
    const totalBalance = accounts.reduce((sum, row) => {
      const n = Number(row.balance);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { total: accounts.length, active, totalBalance };
  }, [accounts]);

  const interestProjection = useMemo(() => {
    const principal = Number(openingDeposit);
    const annualRatePercent = Number(interestRate);
    const periodMonthsRaw = Number(interestCalcMonths);

    const normalizedPrincipal = Number.isFinite(principal) && principal > 0 ? principal : 0;
    const normalizedRate = Number.isFinite(annualRatePercent) && annualRatePercent > 0 ? annualRatePercent : 0;
    const normalizedMonths = Number.isFinite(periodMonthsRaw) ? Math.min(Math.max(periodMonthsRaw, 1), 600) : 12;

    const years = normalizedMonths / 12;
    const earnedInterest = normalizedPrincipal * (normalizedRate / 100) * years;
    const maturityAmount = normalizedPrincipal + earnedInterest;
    const monthlyInterest = normalizedMonths > 0 ? earnedInterest / normalizedMonths : 0;

    return {
      months: normalizedMonths,
      earnedInterest,
      maturityAmount,
      monthlyInterest,
    };
  }, [openingDeposit, interestRate, interestCalcMonths]);

  const canProceedStep1 = Boolean(resolvedCustomer);
  const canProceedStep2 =
    Number.isFinite(Number(openingDeposit)) &&
    Number(openingDeposit) >= 0 &&
    Number.isFinite(Number(interestRate)) &&
    Number(interestRate) >= 0;

  const isAdminUser = useMemo(() => {
    if (authUser?.is_system_admin === true) {
      return true;
    }

    const normalize = (value: string) => value.toLowerCase().trim();
    const designation = normalize(String(authUser?.designation?.name || ''));
    if (designation.includes('admin')) {
      return true;
    }

    const roleNames = Array.isArray(authUser?.roles) ? authUser.roles : [];
    return roleNames.some((role) => normalize(String(role?.name || '')).includes('admin'));
  }, [authUser]);

  const isSuperAdminUser = useMemo(() => {
    if (authUser?.is_system_admin === true) {
      return true;
    }

    const normalize = (value: string) => value.toLowerCase().trim();
    const email = normalize(String(authUser?.email || ''));
    if (email === 'superadmin@softcodelk.com') {
      return true;
    }

    const designation = normalize(String(authUser?.designation?.name || ''));
    if (designation.includes('super admin')) {
      return true;
    }

    const roleNames = Array.isArray(authUser?.roles) ? authUser.roles : [];
    return roleNames.some((role) => normalize(String(role?.name || '')).includes('super admin'));
  }, [authUser]);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }

    setToken(t);
    void fetchWidgetPreferences(t);
    const today = new Date().toISOString().slice(0, 10);
    setOpenedAt(today);
  }, [router]);

  const removeAccount = async (row: SavingsAccountRow) => {
    if (!token) return;

    const accountId = Number(row.id || 0);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      setErrorMessage('Invalid account selected.');
      return;
    }

    try {
      setDeletingAccountId(accountId);
      setErrorMessage('');
      setSuccessMessage('');

      await axios.delete(`/api/savings-accounts/${accountId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });

      setAccounts((prev) => prev.filter((item) => Number(item.id) !== accountId));
      if (Number(detailsRow?.id || 0) === accountId) {
        setDetailsRow(null);
      }
      setDeleteTargetRow(null);
      setSuccessMessage('Account removed successfully.');
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Failed to remove account.';
        setErrorMessage(message);
      } else {
        setErrorMessage('Failed to remove account.');
      }
    } finally {
      setDeletingAccountId(null);
    }
  };

  const openEditModal = (row: SavingsAccountRow) => {
    setEditTargetRow(row);
    setEditInterestType((row.interest_type as SavingsInterestType) || 'simple_interest');
    setEditInterestRate(String(Number(row.interest_rate || 0)));
    setEditStatus(String(row.status || 'active').toLowerCase());
    const opened = String((row as unknown as { opened_at?: string | null }).opened_at || '').slice(0, 10);
    setEditOpenedAt(opened);
  };

  const saveAccountEdit = async () => {
    if (!token || !editTargetRow) return;

    const accountId = Number(editTargetRow.id || 0);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      setErrorMessage('Invalid account selected for edit.');
      return;
    }

    try {
      setEditingAccountId(accountId);
      setErrorMessage('');
      setSuccessMessage('');

      const response = await axios.put(
        `/api/savings-accounts/${accountId}`,
        {
          interest_type: editInterestType,
          interest_rate: Number(editInterestRate || 0),
          status: editStatus,
          opened_at: editOpenedAt || null,
        },
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );

      const updated = (response.data || {}) as SavingsAccountRow;
      setAccounts((prev) => prev.map((item) => (Number(item.id) === accountId ? { ...item, ...updated } : item)));
      if (Number(detailsRow?.id || 0) === accountId) {
        setDetailsRow((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      setEditTargetRow(null);
      setSuccessMessage('Account updated successfully.');
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Failed to update account.';
        setErrorMessage(message);
      } else {
        setErrorMessage('Failed to update account.');
      }
    } finally {
      setEditingAccountId(null);
    }
  };

  const loadAccounts = async (authToken: string) => {
    setLoadingAccounts(true);
    try {
      const response = await axios.get('/api/savings-accounts', {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
        params: { per_page: 200 },
      });
      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];
      setAccounts(rows as SavingsAccountRow[]);
    } catch {
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadAccounts(token);
  }, [token]);

  const handleAccountTypeChange = (nextType: SavingsAccountType) => {
    setAccountType(nextType);
    setInterestType(DEFAULT_INTEREST_BY_ACCOUNT[nextType]);
  };

  const resolveByCustomerNo = async () => {
    const code = accountCustomerNo.trim() || customerSearchText.trim();
    if (!token || !code) {
      setResolvedCustomer(null);
      setErrorMessage('Enter a Customer No or NIC to verify.');
      return;
    }

    try {
      const response = await axios.get(`/api/customers/by-code/${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });

      const payload = response.data as {
        found?: boolean;
        data?: CustomerSummary | null;
      };
      const customer = payload?.data ?? (response.data as CustomerSummary | null);
      const found = typeof payload?.found === 'boolean'
        ? payload.found
        : Boolean(customer && (customer.id || customer.customer_code));

      if (!found || !customer) {
        setResolvedCustomer(null);
        setErrorMessage('Customer not found. Register the customer first.');
        setSuccessMessage('');
        return;
      }

      setResolvedCustomer(customer);
      setAccountCustomerNo(String(customer.customer_code || code));
      setSuccessMessage('Customer verified successfully.');
      setErrorMessage('');
      setActiveStep(2);
    } catch {
      setResolvedCustomer(null);
      setErrorMessage('Customer not found. Register the customer first.');
    }
  };

  const searchCustomersAdvanced = async (termOverride?: string, silent = false) => {
    if (!token) return;
    const term = (termOverride ?? customerSearchText).trim();
    if (!term) {
      setCustomerResults([]);
      setShowCustomerSuggestions(false);
      if (!silent) {
        setErrorMessage('Enter customer number, NIC, name, or phone to search.');
      }
      return;
    }

    try {
      setSearchingCustomers(true);
      setErrorMessage('');
      setSuccessMessage('');

      const response = await axios.get('/api/customers', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: { per_page: 25, q: term },
      });

      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      const normalized = term.toLowerCase();
      const narrowed = (rows as CustomerSummary[]).filter((row) => {
        const code = String(row.customer_code || '').toLowerCase();
        const nic = String(row.nic_passport || '').toLowerCase();
        const name = `${row.first_name || ''} ${row.last_name || ''}`.toLowerCase();
        const phoneText = String(row.phone || '').toLowerCase();
        return (
          code.includes(normalized) ||
          nic.includes(normalized) ||
          name.includes(normalized) ||
          phoneText.includes(normalized)
        );
      });

      setCustomerResults(narrowed.slice(0, 8));
      setShowCustomerSuggestions(narrowed.length > 0);
      if (!silent && narrowed.length === 0) setErrorMessage('No customers matched your search.');
    } catch {
      setCustomerResults([]);
      setShowCustomerSuggestions(false);
      if (!silent) {
        setErrorMessage('Customer search failed. Try again.');
      }
    } finally {
      setSearchingCustomers(false);
    }
  };

  useEffect(() => {
    if (!token || activeStep !== 1) return;

    const term = customerSearchText.trim();
    if (term.length < 2) {
      setCustomerResults([]);
      setShowCustomerSuggestions(false);
      return;
    }

    const timer = setTimeout(() => {
      void searchCustomersAdvanced(term, true);
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearchText, token, activeStep]);

  const selectCustomer = (customer: CustomerSummary) => {
    const code = String(customer.customer_code || '').trim();
    setResolvedCustomer(customer);
    setAccountCustomerNo(code);
    setCustomerSearchText(`${code} | ${customer.first_name || ''} ${customer.last_name || ''}`.trim());
    setCustomerResults([]);
    setShowCustomerSuggestions(false);
    setSuccessMessage('Customer selected.');
    setErrorMessage('');
    setActiveStep(2);
  };

  const clearCustomer = () => {
    setResolvedCustomer(null);
    setAccountCustomerNo('');
    setCustomerSearchText('');
    setCustomerResults([]);
    setShowCustomerSuggestions(false);
    setActiveStep(1);
  };

  const openAccount = async () => {
    if (!token) return;
    const resolvedCustomerId = Number(resolvedCustomer?.id || 0);
    const hasResolvedCustomerId = Number.isInteger(resolvedCustomerId) && resolvedCustomerId > 0;
    const customerNo = accountCustomerNo.trim() || String(resolvedCustomer?.customer_code || '').trim();
    if (!hasResolvedCustomerId && !customerNo) {
      setErrorMessage('Select a customer before opening an account.');
      setActiveStep(1);
      return;
    }

    const depositValue = Number(openingDeposit || 0);
    const rateValue = Number(interestRate || 0);
    if (!Number.isFinite(depositValue) || depositValue < 0) {
      setErrorMessage('Opening deposit must be zero or greater.');
      return;
    }
    if (!Number.isFinite(rateValue) || rateValue < 0) {
      setErrorMessage('Interest rate must be zero or greater.');
      return;
    }

    try {
      setOpeningAccount(true);
      setErrorMessage('');
      setSuccessMessage('');

      await axios.post(
        '/api/savings-accounts',
        {
          customer_id: hasResolvedCustomerId ? resolvedCustomerId : undefined,
          customer_no: customerNo || undefined,
          account_type: accountType,
          interest_type: interestType,
          opening_deposit: depositValue,
          interest_rate: rateValue,
          opened_at: openedAt || undefined,
        },
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );

      setSuccessMessage('Account opened successfully.');
      setOpeningDeposit('0');
      setActiveStep(1);
      await loadAccounts(token);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const message =
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Failed to open account.';
        const firstValidationError = Object.values(error.response?.data?.errors || {})
          .flat()
          .find((value) => typeof value === 'string');
        setErrorMessage(firstValidationError ? `${message} ${firstValidationError}` : message);
      } else {
        setErrorMessage('Failed to open account.');
      }
    } finally {
      setOpeningAccount(false);
    }
  };

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showMainFormWidget = !hiddenWidgetKeys.has(`${widgetPrefix}main_form`);
  const showSidebarWidget = !hiddenWidgetKeys.has(`${widgetPrefix}sidebar`);
  const showAccountsListWidget = !hiddenWidgetKeys.has(`${widgetPrefix}accounts_list`);
  const tableColumns = [
    { key: 'account', label: 'Account' },
    { key: 'customer', label: 'Customer' },
    { key: 'type', label: 'Type' },
    { key: 'interest', label: 'Interest' },
    { key: 'rate', label: 'Rate' },
    { key: 'balance', label: 'Balance' },
    { key: 'details', label: 'Details' },
  ] as const;
  const visibleTableColumns = tableColumns.filter(
    (column) => !hiddenWidgetKeys.has(`${widgetPrefix}col_${column.key}`)
  );
  const isAnyWidgetVisible =
    showHeroWidget || showMainFormWidget || showSidebarWidget || showAccountsListWidget;

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50/80 to-yellow-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
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
        {/* Hero */}
        {showHeroWidget ? (
        <div className="rounded-3xl border border-white/80 bg-white/95 shadow-xl overflow-hidden relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}hero`)}
              className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide hero widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 px-6 py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                  <Landmark className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-100">Savings & Deposits</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Open Account</h1>
                  <p className="text-sm text-amber-50/95 mt-1 max-w-xl">
                    Register savings, current, or investment accounts with the right interest structure.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/dashboard/savings-deposits')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-orange-100 border-t border-orange-100/80 bg-orange-50/40">
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total accounts</p>
              <p className="text-xl font-extrabold text-slate-900 tabular-nums">{headerStats.total}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active</p>
              <p className="text-xl font-extrabold text-emerald-700 tabular-nums">{headerStats.active}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Portfolio balance</p>
              <p className="text-xl font-extrabold text-orange-800 tabular-nums">{amount(headerStats.totalBalance)}</p>
            </div>
          </div>
        </div>
        ) : null}

        {/* Alerts */}
        {errorMessage && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {successMessage && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              {successMessage}
            </span>
            <button type="button" onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
          {/* Main form */}
          {showMainFormWidget ? (
          <div className="rounded-3xl border border-orange-100 bg-white/95 shadow-lg overflow-hidden relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}main_form`)}
                className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide account form widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            {/* Stepper */}
            <div className="flex border-b border-orange-100 bg-gradient-to-r from-orange-50/80 to-amber-50/50">
              {STEPS.map((step) => {
                const done = activeStep > step.id;
                const current = activeStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      if (step.id === 1) setActiveStep(1);
                      if (step.id === 2 && canProceedStep1) setActiveStep(2);
                      if (step.id === 3 && canProceedStep1 && canProceedStep2) setActiveStep(3);
                    }}
                    className={`flex-1 px-3 py-4 text-center transition border-b-2 ${
                      current
                        ? 'border-orange-500 bg-white/60'
                        : done
                          ? 'border-transparent text-orange-700'
                          : 'border-transparent text-slate-400'
                    }`}
                  >
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold mb-1 ${
                        current
                          ? 'bg-orange-600 text-white'
                          : done
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : step.short}
                    </span>
                    <span className="block text-[11px] sm:text-xs font-bold uppercase tracking-wide">{step.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              {/* Step 1 */}
              {activeStep === 1 && (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Find customer</h2>
                    <p className="text-sm text-slate-600 mt-0.5">Search by customer number, NIC, name, or phone.</p>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={customerSearchText}
                      onChange={(e) => {
                        setCustomerSearchText(e.target.value);
                        setShowCustomerSuggestions(true);
                      }}
                      onFocus={() => setShowCustomerSuggestions(customerResults.length > 0)}
                      onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 120)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void searchCustomersAdvanced();
                        }
                      }}
                      className={`${inputClass} pl-10`}
                      placeholder="Customer No, NIC, name, or phone"
                    />

                    {showCustomerSuggestions && customerResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-orange-200 bg-white shadow-lg overflow-hidden">
                        {customerResults.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onMouseDown={() => selectCustomer(row)}
                            className="w-full border-b border-orange-100 px-3.5 py-2.5 text-left hover:bg-orange-50 last:border-b-0"
                          >
                            <p className="text-sm font-semibold text-slate-900">{row.first_name} {row.last_name}</p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {row.customer_code || '—'} · {row.nic_passport || '—'} · {row.phone || '—'}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void searchCustomersAdvanced()}
                      disabled={searchingCustomers}
                      className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition"
                    >
                      <Search className="h-4 w-4" />
                      {searchingCustomers ? 'Searching…' : 'Search'}
                    </button>
                    <button
                      type="button"
                      onClick={resolveByCustomerNo}
                      className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-orange-800 hover:bg-orange-50 transition"
                    >
                      <UserCheck className="h-4 w-4" />
                      Verify exact code
                    </button>
                  </div>

                  {resolvedCustomer && (
                    <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="h-11 w-11 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                          {(resolvedCustomer.first_name?.[0] || 'C').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Selected customer</p>
                          <p className="text-base font-bold text-slate-900 mt-0.5">
                            {resolvedCustomer.first_name} {resolvedCustomer.last_name}
                          </p>
                          <p className="text-sm text-slate-600 mt-1">
                            <span className="font-semibold text-slate-800">{resolvedCustomer.customer_code}</span>
                            {resolvedCustomer.nic_passport ? ` · NIC ${resolvedCustomer.nic_passport}` : ''}
                            {resolvedCustomer.phone ? ` · ${resolvedCustomer.phone}` : ''}
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={clearCustomer} className="text-slate-400 hover:text-slate-600 p-1">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  )}

                  {customerResults.length > 0 && !showCustomerSuggestions && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {customerResults.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => selectCustomer(row)}
                          className="rounded-xl border border-orange-100 bg-white p-3 text-left hover:border-orange-300 hover:shadow-md transition"
                        >
                          <p className="font-bold text-slate-900">{row.customer_code}</p>
                          <p className="text-sm text-slate-700 mt-0.5">
                            {row.first_name} {row.last_name}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">{row.nic_passport || '—'} · {row.phone || '—'}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={!canProceedStep1}
                      onClick={() => setActiveStep(2)}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-slate-800 transition"
                    >
                      Continue to account setup
                    </button>
                  </div>
                </section>
              )}

              {/* Step 2 */}
              {activeStep === 2 && (
                <section className="space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Account & interest setup</h2>
                    <p className="text-sm text-slate-600 mt-0.5">Choose product type and how interest is calculated.</p>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Account type</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {availableAccountTypes.map((type) => {
                        const active = accountType === type.value;
                        const Icon = ACCOUNT_ICONS[type.value];
                        return (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => handleAccountTypeChange(type.value)}
                            className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                              active
                                ? 'border-orange-400 shadow-md ring-2 ring-orange-200'
                                : 'border-orange-100 hover:border-orange-300 hover:shadow-sm'
                            }`}
                          >
                            <div
                              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${ACCOUNT_ACCENT[type.value]} text-white shadow-sm`}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <p className="mt-3 text-sm font-bold text-slate-900">{type.label}</p>
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{type.description}</p>
                            {active && (
                              <span className="absolute top-3 right-3 h-6 w-6 rounded-full bg-orange-500 flex items-center justify-center">
                                <Check className="h-3.5 w-3.5 text-white" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">
                        Interest type
                      </label>
                      <select
                        value={interestType}
                        onChange={(e) => setInterestType(e.target.value as SavingsInterestType)}
                        className={inputClass}
                      >
                        <optgroup label="Recommended">
                          {SAVINGS_INTEREST_TYPES.filter((i) => recommendedInterestTypes.includes(i.value)).map(
                            (item) => (
                              <option key={`r-${item.value}`} value={item.value}>
                                {item.label}
                              </option>
                            )
                          )}
                        </optgroup>
                        <optgroup label="Other">
                          {SAVINGS_INTEREST_TYPES.filter((i) => !recommendedInterestTypes.includes(i.value)).map(
                            (item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            )
                          )}
                        </optgroup>
                      </select>
                      {selectedInterestUsage && (
                        <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-900">
                          <span className="font-semibold">Typical use:</span> {selectedInterestUsage}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">
                        Interest rate (% per year)
                      </label>
                      <input
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        className={inputClass}
                        placeholder="4.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">
                        Opening deposit (LKR)
                      </label>
                      <input
                        value={openingDeposit}
                        onChange={(e) => setOpeningDeposit(e.target.value)}
                        className={inputClass}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">
                        Opened date
                      </label>
                      <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} className={inputClass} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowInterestGuide((v) => !v)}
                    className="w-full flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm font-semibold text-orange-900 hover:bg-orange-50 transition"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Interest type reference guide
                    </span>
                    {showInterestGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showInterestGuide && (
                    <div className="rounded-2xl border border-orange-100 overflow-hidden divide-y divide-orange-50">
                      {SAVINGS_INTEREST_TYPES.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setInterestType(item.value)}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition ${
                            interestType === item.value ? 'bg-orange-50' : 'bg-white hover:bg-orange-50/40'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{item.usage}</p>
                          </div>
                          {interestType === item.value && <Check className="h-4 w-4 text-orange-600 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-between pt-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={!canProceedStep2}
                      onClick={() => setActiveStep(3)}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-slate-800"
                    >
                      Review & confirm
                    </button>
                  </div>
                </section>
              )}

              {/* Step 3 */}
              {activeStep === 3 && (
                <section className="space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Review & open account</h2>
                    <p className="text-sm text-slate-600 mt-0.5">Confirm details before creating the account.</p>
                  </div>

                  <dl className="rounded-2xl border border-orange-100 divide-y divide-orange-50 overflow-hidden">
                    {[
                      ['Customer', `${resolvedCustomer?.customer_code} — ${resolvedCustomer?.first_name} ${resolvedCustomer?.last_name}`],
                      ['Account type', selectedAccountMeta?.label || accountTypeDisplayLabel(accountType)],
                      ['Interest type', formatInterestTypeLabel(interestType)],
                      ['Interest usage', selectedInterestUsage],
                      ['Interest rate', `${interestRate}%`],
                      ['Opening deposit', `LKR ${amount(openingDeposit)}`],
                      ['Opened date', openedAt || 'Today'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 bg-white">
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500 sm:w-36 shrink-0">{label}</dt>
                        <dd className="text-sm font-semibold text-slate-900">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="flex flex-col sm:flex-row justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit setup
                    </button>
                    <button
                      type="button"
                      disabled={openingAccount}
                      onClick={openAccount}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200/50 hover:from-amber-700 hover:to-orange-700 disabled:opacity-60 transition"
                    >
                      <PiggyBank className="h-5 w-5" />
                      {openingAccount ? 'Opening account…' : 'Open account now'}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
          ) : null}

          {/* Sidebar summary */}
          {showSidebarWidget ? (
          <aside className="xl:sticky xl:top-6 space-y-4 relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}sidebar`)}
                className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide sidebar widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="rounded-3xl border border-orange-100 bg-white/95 p-5 shadow-lg">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Live summary</h3>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Customer</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {resolvedCustomer
                      ? `${resolvedCustomer.first_name} ${resolvedCustomer.last_name}`
                      : 'Not selected'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Product</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{selectedAccountMeta?.label || '—'}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{formatInterestTypeLabel(interestType)}</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 p-3">
                  <p className="text-[10px] font-bold uppercase text-orange-700">Opening deposit</p>
                  <p className="text-xl font-extrabold text-orange-900 mt-1 tabular-nums">LKR {amount(openingDeposit)}</p>
                  <p className="text-xs text-slate-600 mt-1">@ {interestRate}% p.a.</p>
                </div>
                <div className="rounded-xl border border-orange-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase text-orange-700">Interest calculator</p>
                    <span className="text-[10px] font-semibold text-slate-500">Simple estimate</span>
                  </div>
                  <div className="mt-2">
                    <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Period (months)</label>
                    <input
                      value={interestCalcMonths}
                      onChange={(e) => setInterestCalcMonths(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-orange-200 bg-orange-50/50 px-2.5 py-1.5 text-sm font-semibold text-slate-900"
                      placeholder="12"
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-[10px] uppercase font-bold text-slate-500">Est. interest</p>
                      <p className="mt-1 font-bold text-slate-900 tabular-nums">LKR {amount(interestProjection.earnedInterest)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-[10px] uppercase font-bold text-slate-500">Maturity</p>
                      <p className="mt-1 font-bold text-emerald-700 tabular-nums">LKR {amount(interestProjection.maturityAmount)}</p>
                    </div>
                    <div className="col-span-2 rounded-lg bg-amber-50 px-2.5 py-2">
                      <p className="text-[10px] uppercase font-bold text-amber-700">Avg monthly interest</p>
                      <p className="mt-1 font-bold text-amber-900 tabular-nums">LKR {amount(interestProjection.monthlyInterest)}</p>
                      <p className="mt-1 text-[10px] text-slate-500">Based on {interestProjection.months} month(s) at {interestRate}% per annum.</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
                Step {activeStep} of 3 — complete each section before submitting.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 p-4 text-xs text-orange-900/90 leading-relaxed">
              <p className="font-bold text-orange-800 mb-1">Tip</p>
              Pick the account type first — we’ll suggest the best interest types for that product.
            </div>
          </aside>
          ) : null}
        </div>

        {/* Accounts list */}
        {showAccountsListWidget ? (
        <div className="rounded-3xl border border-orange-100 bg-white/95 shadow-lg overflow-hidden relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}accounts_list`)}
              className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide accounts list widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-orange-100 bg-gradient-to-r from-orange-50/80 to-transparent">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-orange-700" />
              <h2 className="text-lg font-bold text-slate-900">Recent accounts</h2>
            </div>
            <span className="text-xs font-semibold text-slate-500">{accounts.length} total</span>
          </div>

          {loadingAccounts ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-orange-50" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-16 text-center px-6">
              <Banknote className="h-12 w-12 text-orange-200 mx-auto" />
              <p className="mt-3 text-sm font-semibold text-slate-700">No accounts yet</p>
              <p className="text-xs text-slate-500 mt-1">Open your first savings or deposit account above.</p>
            </div>
          ) : visibleTableColumns.length === 0 ? (
            <div className="py-16 text-center px-6">
              <p className="text-sm text-amber-800">All table columns are hidden. Restore hidden widgets from dashboard.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50/80">
                    {visibleTableColumns.map((column) => (
                      <th key={column.key} className="py-3 px-4 relative">
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
                <tbody className="divide-y divide-orange-50">
                  {accounts.slice(0, 15).map((row) => (
                    <tr key={row.id} className="hover:bg-orange-50/40 transition">
                      {visibleTableColumns.map((column) => {
                        if (column.key === 'account') {
                          return (
                            <td key={column.key} className="py-3 px-4">
                              <p className="font-bold text-slate-900">{row.account_number || '—'}</p>
                              <p className="text-[10px] text-slate-500 capitalize">{row.status || 'active'}</p>
                            </td>
                          );
                        }
                        if (column.key === 'customer') {
                          return (
                            <td key={column.key} className="py-3 px-4">
                              <p className="font-medium text-slate-800">{row.customer?.first_name} {row.customer?.last_name}</p>
                              <p className="text-xs text-slate-500">{row.customer?.customer_code}</p>
                            </td>
                          );
                        }
                        if (column.key === 'type') {
                          return (
                            <td key={column.key} className="py-3 px-4">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${accountTypeBadgeClass(row.account_type)}`}
                              >
                                {accountTypeDisplayLabel(row.account_type)}
                              </span>
                            </td>
                          );
                        }
                        if (column.key === 'interest') {
                          return <td key={column.key} className="py-3 px-4 text-slate-700">{formatInterestTypeLabel(row.interest_type)}</td>;
                        }
                        if (column.key === 'rate') {
                          return <td key={column.key} className="py-3 px-4 text-right tabular-nums font-medium text-black">{amount(row.interest_rate)}%</td>;
                        }
                        if (column.key === 'details') {
                          return (
                            <td key={column.key} className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDetailsRow(row)}
                                  className="inline-flex items-center rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                                >
                                  More details
                                </button>
                                {isSuperAdminUser && (
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(row)}
                                    className="inline-flex items-center rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                                  >
                                    Edit
                                  </button>
                                )}
                                {isAdminUser && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTargetRow(row)}
                                    className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        }
                        return <td key={column.key} className="py-3 px-4 text-right tabular-nums font-bold text-emerald-800">{amount(row.balance)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        ) : null}

        {detailsRow ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
            onClick={() => setDetailsRow(null)}
          >
            <div
              className="w-full max-w-xl rounded-3xl border border-orange-100 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-orange-100 px-5 py-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">Account details</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{detailsRow.account_number || 'Savings account'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsRow(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Close details modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 px-5 py-4">
                <div className="rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Customer</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {detailsRow.customer?.first_name || '—'} {detailsRow.customer?.last_name || ''}
                  </p>
                  <p className="text-xs text-slate-600">{detailsRow.customer?.customer_code || 'No customer code'}</p>
                </div>

                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    ['Status', String(detailsRow.status || 'active')],
                    ['Account type', accountTypeDisplayLabel(detailsRow.account_type)],
                    ['Interest type', formatInterestTypeLabel(detailsRow.interest_type)],
                    ['Interest rate', `${amount(detailsRow.interest_rate)}%`],
                    ['Opening deposit', `LKR ${amount(detailsRow.opening_deposit)}`],
                    ['Current balance', `LKR ${amount(detailsRow.balance)}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex justify-end pt-1">
                  {isSuperAdminUser && (
                    <button
                      type="button"
                      onClick={() => openEditModal(detailsRow)}
                      className="mr-auto rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-100"
                    >
                      Edit account
                    </button>
                  )}
                  {isAdminUser && (
                    <button
                      type="button"
                      onClick={() => setDeleteTargetRow(detailsRow)}
                      className="mr-auto rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                    >
                      Remove account
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailsRow(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {deleteTargetRow ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
            onClick={() => (deletingAccountId ? null : setDeleteTargetRow(null))}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-base font-bold text-slate-900">Remove account</h3>
              <p className="mt-2 text-sm text-slate-700">
                Are you sure you want to remove account{' '}
                <span className="font-semibold">{deleteTargetRow.account_number || '—'}</span>?
              </p>
              <p className="mt-1 text-xs text-slate-500">Only admin can perform this action.</p>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTargetRow(null)}
                  disabled={deletingAccountId === Number(deleteTargetRow.id || 0)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void removeAccount(deleteTargetRow)}
                  disabled={deletingAccountId === Number(deleteTargetRow.id || 0)}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {deletingAccountId === Number(deleteTargetRow.id || 0) ? 'Removing…' : 'Confirm remove'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {editTargetRow ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
            onClick={() => (editingAccountId ? null : setEditTargetRow(null))}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-cyan-100 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-base font-bold text-slate-900">Edit account</h3>
              <p className="mt-1 text-xs text-slate-500">Only superadmin can edit account details.</p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Account</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{editTargetRow.account_number || '—'}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Interest type</label>
                  <select
                    value={editInterestType}
                    onChange={(e) => setEditInterestType(e.target.value as SavingsInterestType)}
                    className={inputClass}
                  >
                    {SAVINGS_INTEREST_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Interest rate (%)</label>
                  <input
                    value={editInterestRate}
                    onChange={(e) => setEditInterestRate(e.target.value)}
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.0001"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Status</label>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={inputClass}>
                    <option value="active">Active</option>
                    <option value="dormant">Dormant</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Opened date</label>
                  <input
                    value={editOpenedAt}
                    onChange={(e) => setEditOpenedAt(e.target.value)}
                    className={inputClass}
                    type="date"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditTargetRow(null)}
                  disabled={editingAccountId === Number(editTargetRow.id || 0)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveAccountEdit()}
                  disabled={editingAccountId === Number(editTargetRow.id || 0)}
                  className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
                >
                  {editingAccountId === Number(editTargetRow.id || 0) ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
