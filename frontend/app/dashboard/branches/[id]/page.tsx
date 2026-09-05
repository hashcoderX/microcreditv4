'use client';

import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Branch = {
  id: number;
  name?: string;
  email?: string;
  address?: string;
  phone?: string;
  website?: string;
  opening_asset?: string | number | null;
  manager?: {
    id?: number;
    name?: string;
    email?: string;
  } | null;
};

type BranchAccount = {
  id: number;
  company_id?: number;
  account_type?: string;
  account_name?: string;
  bank_name?: string;
  bank_branch?: string;
  account_number?: string;
  opening_balance?: number;
  current_balance?: number;
  is_active?: boolean;
};

type BankAccountDraft = {
  account_name: string;
  bank_name: string;
  bank_branch: string;
  account_number: string;
  opening_balance: string;
  notes: string;
};

type CashAccountDraft = {
  account_name: string;
  opening_balance: string;
  notes: string;
};

type ReportItem = {
  title: string;
  description: string;
  path?: string;
};

type ReportCategory = {
  key: string;
  title: string;
  icon: string;
  gradient: string;
  bg: string;
  reports: ReportItem[];
};

export default function BranchDashboardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const branchId = Number(params?.id || 0);

  const apiBase = getApiBaseUrl();

  const [token, setToken] = useState('');
  const widgetPrefix = 'branch_detail_dashboard_widget_';
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [branchAccounts, setBranchAccounts] = useState<BranchAccount[]>([]);
  const [bankAccountModalOpen, setBankAccountModalOpen] = useState(false);
  const [cashAccountModalOpen, setCashAccountModalOpen] = useState(false);
  const [bankAccountRows, setBankAccountRows] = useState<BankAccountDraft[]>([
    {
      account_name: '',
      bank_name: '',
      bank_branch: '',
      account_number: '',
      opening_balance: '0',
      notes: '',
    },
  ]);
  const [bankAccountSaving, setBankAccountSaving] = useState(false);
  const [cashAccountSaving, setCashAccountSaving] = useState(false);
  const [cashAccountDraft, setCashAccountDraft] = useState<CashAccountDraft>({
    account_name: '',
    opening_balance: '0',
    notes: '',
  });
  const [bankAccountNotice, setBankAccountNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  const fetchWidgetPreferences = useCallback(async () => {
    if (!token) return;

    try {
      const response = await axios.get(`${apiBase}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const widgets = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const hiddenKeys = widgets
        .filter((item: { widget_key?: string; is_visible?: boolean | number | null }) => !item?.is_visible)
        .map((item: { widget_key?: string }) => item.widget_key)
        .filter((key: unknown): key is string => typeof key === 'string' && key.startsWith(widgetPrefix));

      setHiddenWidgetKeys(hiddenKeys);
      setWidgetNotice(null);
    } catch {
      setWidgetNotice('Failed to load widget preferences.');
    }
  }, [apiBase, token, widgetPrefix]);

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean) => {
      if (!token) return false;

      const normalizedKey = widgetKey.trim();
      if (!normalizedKey || normalizedKey.length > 120) {
        setWidgetNotice('Invalid widget key. Please refresh the page and try again.');
        return false;
      }

      try {
        await axios.patch(
          `${apiBase}/dashboard/widgets`,
          {
            widget_key: normalizedKey,
            is_visible: Boolean(isVisible),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );
        setWidgetNotice(null);
        return true;
      } catch {
        setWidgetNotice('Failed to save widget preference.');
        return false;
      }
    },
    [apiBase, token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string) => {
      const ok = await saveWidgetPreference(widgetKey, false);
      if (!ok) return;

      setHiddenWidgetKeys((prev) => (prev.includes(widgetKey) ? prev : [...prev, widgetKey]));
    },
    [saveWidgetPreference]
  );

  useEffect(() => {
    if (!token || !branchId) return;

    const loadBranch = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${apiBase}/companies/${branchId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        setBranch(res.data?.data || res.data || null);
      } catch {
        setBranch(null);
      } finally {
        setLoading(false);
      }
    };

    loadBranch();
  }, [apiBase, token, branchId]);

  useEffect(() => {
    if (!token) return;
    fetchWidgetPreferences();
  }, [token, fetchWidgetPreferences]);

  useEffect(() => {
    if (!token || !branchId) return;

    const loadBranchAccounts = async () => {
      setAccountsLoading(true);
      try {
        const res = await axios.get(`${apiBase}/companies/${branchId}/accounts`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const rows = Array.isArray(res.data?.accounts) ? res.data.accounts : [];
        setBranchAccounts(rows as BranchAccount[]);
      } catch {
        setBranchAccounts([]);
      } finally {
        setAccountsLoading(false);
      }
    };

    loadBranchAccounts();
  }, [apiBase, token, branchId]);

  const visibleBranchAccounts = useMemo(() => {
    const activeRows = branchAccounts.filter((account) => account.is_active !== false);
    return activeRows.length > 0 ? activeRows : branchAccounts;
  }, [branchAccounts]);

  const bankAccounts = useMemo(
    () =>
      [...visibleBranchAccounts]
        .filter((account) => String(account.account_type || '').toLowerCase() === 'bank')
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0)),
    [visibleBranchAccounts]
  );

  const cashAccount = useMemo(() => {
    const rows = [...visibleBranchAccounts]
      .filter((account) => String(account.account_type || '').toLowerCase() === 'cash')
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    return rows[0] || null;
  }, [visibleBranchAccounts]);

  const mainAccount = useMemo(() => {
    const rows = [...visibleBranchAccounts]
      .filter((account) => String(account.account_type || '').toLowerCase() === 'main')
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    return rows[0] || null;
  }, [visibleBranchAccounts]);

  const cashOpeningValue = Number(cashAccount?.opening_balance || 0);
  const cashCurrentValue = Number(cashAccount?.current_balance || 0);
  const mainOpeningValue = Number(mainAccount?.opening_balance || 0);
  const mainCurrentValue = Number(mainAccount?.current_balance || 0);

  const showMainBalanceAsCashFallback =
    !!cashAccount &&
    cashOpeningValue <= 0 &&
    cashCurrentValue <= 0 &&
    (mainOpeningValue > 0 || mainCurrentValue > 0);

  const displayedCashOpeningValue = showMainBalanceAsCashFallback ? mainOpeningValue : cashOpeningValue;
  const displayedCashCurrentValue = showMainBalanceAsCashFallback ? mainCurrentValue : cashCurrentValue;

  const addBankAccountRow = () => {
    setBankAccountRows((prev) => [
      ...prev,
      {
        account_name: '',
        bank_name: '',
        bank_branch: '',
        account_number: '',
        opening_balance: '0',
        notes: '',
      },
    ]);
  };

  const removeBankAccountRow = (index: number) => {
    setBankAccountRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const updateBankAccountRow = (index: number, key: keyof BankAccountDraft, value: string) => {
    setBankAccountRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
  };

  const openBankAccountsModal = () => {
    setBankAccountRows([
      {
        account_name: '',
        bank_name: '',
        bank_branch: '',
        account_number: '',
        opening_balance: '0',
        notes: '',
      },
    ]);
    setBankAccountModalOpen(true);
  };

  const openCashAccountModal = () => {
    setCashAccountDraft({
      account_name: cashAccount?.account_name || '',
      opening_balance: '0',
      notes: '',
    });
    setCashAccountModalOpen(true);
  };

  const submitMultipleBankAccounts = async () => {
    if (!token || !branchId) return;

    const payloadRows = bankAccountRows
      .map((row) => ({
        account_type: 'bank',
        account_name: row.account_name.trim() || undefined,
        bank_name: row.bank_name.trim(),
        bank_branch: row.bank_branch.trim() || undefined,
        account_number: row.account_number.trim() || undefined,
        opening_balance: Number(row.opening_balance || 0),
        notes: row.notes.trim() || undefined,
      }))
      .filter((row) => row.bank_name.length > 0);

    if (payloadRows.length === 0) {
      setBankAccountNotice({
        open: true,
        title: 'Validation',
        message: 'Please add at least one row with a bank name.',
      });
      return;
    }

    if (payloadRows.some((row) => !Number.isFinite(row.opening_balance) || row.opening_balance < 0)) {
      setBankAccountNotice({
        open: true,
        title: 'Validation',
        message: 'Opening balance must be a valid non-negative number for all rows.',
      });
      return;
    }

    try {
      setBankAccountSaving(true);
      for (const row of payloadRows) {
        await axios.post(`${apiBase}/companies/${branchId}/accounts`, row, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
      }

      const refreshed = await axios.get(`${apiBase}/companies/${branchId}/accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const refreshedRows = Array.isArray(refreshed.data?.accounts) ? refreshed.data.accounts : [];
      setBranchAccounts(refreshedRows as BranchAccount[]);

      setBankAccountModalOpen(false);
      setBankAccountNotice({
        open: true,
        title: 'Success',
        message: `${payloadRows.length} branch bank account(s) created successfully.`,
      });
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to create bank accounts. Please try again.';

      setBankAccountNotice({ open: true, title: 'Error', message });
    } finally {
      setBankAccountSaving(false);
    }
  };

  const submitCashAccount = async () => {
    if (!token || !branchId) return;

    const openingBalance = Number(cashAccountDraft.opening_balance || 0);
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      setBankAccountNotice({
        open: true,
        title: 'Validation',
        message: 'Opening balance must be a valid non-negative number.',
      });
      return;
    }

    try {
      setCashAccountSaving(true);

      await axios.post(
        `${apiBase}/companies/${branchId}/accounts`,
        {
          account_type: 'cash',
          account_name: cashAccountDraft.account_name.trim() || undefined,
          opening_balance: openingBalance,
          notes: cashAccountDraft.notes.trim() || undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      const refreshed = await axios.get(`${apiBase}/companies/${branchId}/accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const refreshedRows = Array.isArray(refreshed.data?.accounts) ? refreshed.data.accounts : [];
      setBranchAccounts(refreshedRows as BranchAccount[]);

      setCashAccountModalOpen(false);
      setBankAccountNotice({
        open: true,
        title: 'Success',
        message: 'Branch cash account created successfully.',
      });
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to create cash account. Please try again.';

      setBankAccountNotice({ open: true, title: 'Error', message });
    } finally {
      setCashAccountSaving(false);
    }
  };

  const withBranch = (path: string) => {
    if (!branchId) return path;
    if (path.includes('?')) return `${path}&branch_id=${branchId}`;
    return `${path}?branch_id=${branchId}`;
  };

  const categories = useMemo<ReportCategory[]>(
    () => [
      {
        key: 'microfinance',
        title: 'Micro Finance Related Reports',
        icon: '🏦',
        gradient: 'from-cyan-500 to-blue-500',
        bg: 'from-cyan-50 to-blue-50',
        reports: [
          {
            title: 'Collection Report',
            description: 'Daily and range-wise collections with breakdown details.',
            path: withBranch('/dashboard/microfinance/reports/collection'),
          },
          {
            title: 'Field Officer Collection Report',
            description: 'Performance and totals by field officer.',
            path: withBranch('/dashboard/microfinance/reports/field-officer-collection'),
          },
          {
            title: 'Arrears Report',
            description: 'Overdue and arrears-focused loan analysis.',
            path: withBranch('/dashboard/microfinance/reports/arrears'),
          },
          {
            title: 'Active Member Report',
            description: 'Active borrowers and repayment visibility.',
            path: withBranch('/dashboard/microfinance/reports/active-members'),
          },
          {
            title: 'Blacklisted Customer Report',
            description: 'Risk profile and blacklisted customer exposure.',
            path: withBranch('/dashboard/microfinance/reports/blacklisted-customers'),
          },
          {
            title: 'Re-Payment Report',
            description: 'Repayment rate and pending amounts by account.',
            path: withBranch('/dashboard/microfinance/reports/repayment'),
          },
          {
            title: 'Recovery Report',
            description: 'Recovery priority and difficult portfolio tracking.',
            path: withBranch('/dashboard/microfinance/reports/recovery'),
          },
        ],
      },
      {
        key: 'mortgage',
        title: 'Mortgage Management Related Reports',
        icon: '🏠',
        gradient: 'from-indigo-500 to-violet-500',
        bg: 'from-indigo-50 to-violet-50',
        reports: [
          {
            title: 'Mortgage Collection Report',
            description: 'Track mortgage installment collections and dues.',
            path: withBranch('/dashboard/mortgages/reports/collection'),
          },
          {
            title: 'Mortgage Profit Report',
            description: 'Interest income and profit from mortgage collections.',
            path: withBranch('/dashboard/mortgages/reports/profit'),
          },
          {
            title: 'Mortgage Arrears Report',
            description: 'Identify overdue mortgage accounts and balances.',
            path: withBranch('/dashboard/mortgages/reports/arrears'),
          },
          {
            title: 'Mortgage Portfolio Report',
            description: 'Overall mortgage portfolio health and statuses.',
            path: withBranch('/dashboard/mortgages/reports/portfolio'),
          },
        ],
      },
      {
        key: 'savings',
        title: 'Savings and Deposit Related Reports',
        icon: '💸',
        gradient: 'from-amber-500 to-orange-500',
        bg: 'from-amber-50 to-orange-50',
        reports: [
          {
            title: 'Savings Ledger Report',
            description: 'Savings deposits, withdrawals, and balances by account.',
            path: withBranch('/dashboard/savings-deposits/reports/ledger'),
          },
          {
            title: 'Deposit Growth Report',
            description: 'Period-over-period savings and deposit growth summary.',
            path: withBranch('/dashboard/savings-deposits/reports/deposit-growth'),
          },
          {
            title: 'Maturity Report',
            description: 'Upcoming and completed deposit maturities.',
            path: withBranch('/dashboard/savings-deposits/reports/maturity'),
          },
        ],
      },
      {
        key: 'finance',
        title: 'Finance Management Related Reports',
        icon: '💰',
        gradient: 'from-emerald-500 to-teal-500',
        bg: 'from-emerald-50 to-teal-50',
        reports: [
          {
            title: 'Income and Expense Report',
            description: 'Track revenue, expenses, and profitability.',
            path: withBranch('/dashboard/reports/income-expense'),
          },
          {
            title: 'Cash Flow Report',
            description: 'Cash-in and cash-out summary over selected periods.',
            path: withBranch('/dashboard/reports/cash-flow'),
          },
          {
            title: 'General Ledger Snapshot',
            description: 'Account-wise ledger balances and movement.',
            path: withBranch('/dashboard/reports/general-ledger'),
          },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchId]
  );

  const visibleCategories = categories.filter(
    (category) => !hiddenWidgetKeys.includes(`${widgetPrefix}report_category_${category.key}`)
  );
  const showActionAddBankButton = !hiddenWidgetKeys.includes(`${widgetPrefix}actions_btn_add_bank`);
  const showActionCreateCashButton = !hiddenWidgetKeys.includes(`${widgetPrefix}actions_btn_create_cash`);
  const showActionPerformanceReportButton = !hiddenWidgetKeys.includes(`${widgetPrefix}actions_btn_performance_report`);
  const showActionCollectionReportButton = !hiddenWidgetKeys.includes(`${widgetPrefix}actions_btn_collection_report`);
  const showActionRepaymentReportButton = !hiddenWidgetKeys.includes(`${widgetPrefix}actions_btn_repayment_report`);
  const showActionViewReportsButton = !hiddenWidgetKeys.includes(`${widgetPrefix}actions_btn_view_reports`);
  const showActionBackDashboardButton = !hiddenWidgetKeys.includes(`${widgetPrefix}actions_btn_back_dashboard`);
  const showAnyActionButton =
    showActionAddBankButton ||
    showActionCreateCashButton ||
    showActionPerformanceReportButton ||
    showActionCollectionReportButton ||
    showActionRepaymentReportButton ||
    showActionViewReportsButton ||
    showActionBackDashboardButton;

  const showBankColumnAccountName = !hiddenWidgetKeys.includes(`${widgetPrefix}bank_col_account_name`);
  const showBankColumnBankName = !hiddenWidgetKeys.includes(`${widgetPrefix}bank_col_bank_name`);
  const showBankColumnBranch = !hiddenWidgetKeys.includes(`${widgetPrefix}bank_col_branch`);
  const showBankColumnAccountNumber = !hiddenWidgetKeys.includes(`${widgetPrefix}bank_col_account_number`);
  const showBankColumnCurrentBalance = !hiddenWidgetKeys.includes(`${widgetPrefix}bank_col_current_balance`);
  const showAnyBankColumn =
    showBankColumnAccountName ||
    showBankColumnBankName ||
    showBankColumnBranch ||
    showBankColumnAccountNumber ||
    showBankColumnCurrentBalance;

  const showCashColumnAccountName = !hiddenWidgetKeys.includes(`${widgetPrefix}cash_col_account_name`);
  const showCashColumnType = !hiddenWidgetKeys.includes(`${widgetPrefix}cash_col_type`);
  const showCashColumnOpeningBalance = !hiddenWidgetKeys.includes(`${widgetPrefix}cash_col_opening_balance`);
  const showCashColumnCurrentBalance = !hiddenWidgetKeys.includes(`${widgetPrefix}cash_col_current_balance`);
  const showAnyCashColumn =
    showCashColumnAccountName ||
    showCashColumnType ||
    showCashColumnOpeningBalance ||
    showCashColumnCurrentBalance;

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-green-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-green-50 to-cyan-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-green-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/dashboard/branches')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to Branches</span>
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Branch Dashboard</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {!hiddenWidgetKeys.includes(`${widgetPrefix}header`) && (
          <div className="mb-8 relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => hideWidget(`${widgetPrefix}header`)}
                className="absolute -top-2 right-0 z-20 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                aria-label="Hide branch page header widget"
                title="Hide widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-green-500 rounded-xl flex items-center justify-center text-white text-xl">
                    🏢
                  </div>
                  {branch?.name || `Branch #${branchId || '-'}`}
                </h1>
                <p className="mt-2 text-gray-600">Branch reports and quick access</p>
              </div>
            </div>
          </div>
        )}

        {widgetNotice && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{widgetNotice}</div>
        )}

        {loading ? (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-8 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
          </div>
        ) : !branch ? (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-8">
            <p className="text-gray-700 font-semibold">Branch not found or you don’t have access.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {!hiddenWidgetKeys.includes(`${widgetPrefix}branch_details`) && (
                <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6 relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}branch_details`)}
                      className="absolute top-3 right-3 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                      aria-label="Hide branch details widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Branch Details</h2>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>
                      <span className="font-semibold">Email:</span> {branch.email || '-'}
                    </div>
                    <div>
                      <span className="font-semibold">Phone:</span> {branch.phone || '-'}
                    </div>
                    <div>
                      <span className="font-semibold">Address:</span> {branch.address || '-'}
                    </div>
                    <div>
                      <span className="font-semibold">Opening Asset:</span>{' '}
                      {Number(branch.opening_asset || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>
              )}

              {!hiddenWidgetKeys.includes(`${widgetPrefix}manager`) && (
                <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6 relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}manager`)}
                      className="absolute top-3 right-3 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                      aria-label="Hide branch manager widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Manager</h2>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>
                      <span className="font-semibold">Name:</span> {branch.manager?.name || 'Not assigned'}
                    </div>
                    <div>
                      <span className="font-semibold">Email:</span> {branch.manager?.email || '-'}
                    </div>
                  </div>
                </div>
              )}

              {!hiddenWidgetKeys.includes(`${widgetPrefix}actions`) && (
                <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6 relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}actions`)}
                      className="absolute top-3 right-3 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                      aria-label="Hide branch action widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Actions</h2>
                  <div className="flex flex-col gap-3">
                    {showActionAddBankButton && (
                      <div className="relative">
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => hideWidget(`${widgetPrefix}actions_btn_add_bank`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-white/70 bg-white/95 text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-10"
                            aria-label="Hide add branch bank accounts button"
                            title="Hide widget"
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                        <button
                          type="button"
                          onClick={openBankAccountsModal}
                          className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-semibold shadow-sm hover:from-teal-700 hover:to-cyan-700"
                        >
                          Add Branch Bank Accounts
                        </button>
                      </div>
                    )}
                    {showActionCreateCashButton && (
                      <div className="relative">
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => hideWidget(`${widgetPrefix}actions_btn_create_cash`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-white/70 bg-white/95 text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-10"
                            aria-label="Hide create branch cash account button"
                            title="Hide widget"
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                        <button
                          type="button"
                          onClick={openCashAccountModal}
                          disabled={!!cashAccount}
                          className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-sm font-semibold shadow-sm hover:from-amber-700 hover:to-orange-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {cashAccount ? 'Cash Account Created' : 'Create Branch Cash Account'}
                        </button>
                      </div>
                    )}
                    {showActionPerformanceReportButton && (
                      <div className="relative">
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => hideWidget(`${widgetPrefix}actions_btn_performance_report`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-white/70 bg-white/95 text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-10"
                            aria-label="Hide branch performance report button"
                            title="Hide widget"
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/reports/branch-performance?branch_id=${branchId}`)}
                          className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-semibold shadow-sm hover:from-rose-700 hover:to-red-700"
                        >
                          Branch Performance Report
                        </button>
                      </div>
                    )}
                    {showActionCollectionReportButton && (
                      <div className="relative">
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => hideWidget(`${widgetPrefix}actions_btn_collection_report`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-white/70 bg-white/95 text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-10"
                            aria-label="Hide branch collection report button"
                            title="Hide widget"
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/reports/branch-collection?branch_id=${branchId}`)}
                          className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white text-sm font-semibold shadow-sm hover:from-orange-700 hover:to-amber-700"
                        >
                          Branch Collection Report
                        </button>
                      </div>
                    )}
                    {showActionRepaymentReportButton && (
                      <div className="relative">
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => hideWidget(`${widgetPrefix}actions_btn_repayment_report`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-white/70 bg-white/95 text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-10"
                            aria-label="Hide branch repayment report button"
                            title="Hide widget"
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/reports/branch-repayment?branch_id=${branchId}`)}
                          className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-semibold shadow-sm hover:from-violet-700 hover:to-purple-700"
                        >
                          Branch Repayment Report
                        </button>
                      </div>
                    )}
                    {showActionViewReportsButton && (
                      <div className="relative">
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => hideWidget(`${widgetPrefix}actions_btn_view_reports`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-10"
                            aria-label="Hide view all branch reports button"
                            title="Hide widget"
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/branches/${branchId}#reports`)}
                          className="w-full px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-gray-800 text-sm font-semibold border border-gray-200 shadow-sm"
                        >
                          View All Branch Reports
                        </button>
                      </div>
                    )}
                    {showActionBackDashboardButton && (
                      <div className="relative">
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => hideWidget(`${widgetPrefix}actions_btn_back_dashboard`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-10"
                            aria-label="Hide back to main dashboard button"
                            title="Hide widget"
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => router.push('/dashboard')}
                          className="w-full px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-gray-800 text-sm font-semibold border border-gray-200 shadow-sm"
                        >
                          Back to Main Dashboard
                        </button>
                      </div>
                    )}
                    {!showAnyActionButton && (
                      <p className="rounded-xl border border-dashed border-gray-300 bg-white/70 px-4 py-3 text-sm text-gray-600">
                        Action buttons are hidden. Use `Restore Hidden Widgets` in the main dashboard to bring them back.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {hiddenWidgetKeys.includes(`${widgetPrefix}branch_details`) &&
            hiddenWidgetKeys.includes(`${widgetPrefix}manager`) &&
            hiddenWidgetKeys.includes(`${widgetPrefix}actions`) ? (
              <div className="mb-8 rounded-2xl border border-dashed border-gray-300 bg-white/60 px-5 py-4 text-sm text-gray-600">
                Overview widgets are hidden. Use `Restore Hidden Widgets` in the main dashboard to bring them back.
              </div>
            ) : null}

            {!hiddenWidgetKeys.includes(`${widgetPrefix}bank_accounts`) && (
              <div className="mb-8 bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}bank_accounts`)}
                    className="absolute top-3 right-3 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                    aria-label="Hide branch bank accounts widget"
                    title="Hide widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Branch Bank Accounts</h2>
                  {!hiddenWidgetKeys.includes(`${widgetPrefix}bank_btn_add_multiple`) ? (
                    <div className="relative">
                      <WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => hideWidget(`${widgetPrefix}bank_btn_add_multiple`)}
                          className="absolute -left-9 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                          aria-label="Hide add multiple bank accounts button"
                          title="Hide widget"
                        >
                          ×
                        </button>
                      </WidgetCloseGate>
                      <button
                        type="button"
                        onClick={openBankAccountsModal}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-gray-800 text-sm font-semibold border border-gray-200 shadow-sm"
                      >
                        Add Multiple
                      </button>
                    </div>
                  ) : null}
                </div>

                {accountsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                  </div>
                ) : bankAccounts.length === 0 ? (
                  <p className="text-sm text-gray-600">No bank accounts created for this branch yet.</p>
                ) : !showAnyBankColumn ? (
                  <p className="text-sm text-gray-600">All bank account table columns are hidden.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-gray-700">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          {showBankColumnAccountName && (
                            <th className="px-4 py-2 font-semibold">
                              <div className="flex items-center gap-2">
                                <span>Account Name</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}bank_col_account_name`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide bank account name column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                              </div>
                            </th>
                          )}
                          {showBankColumnBankName && (
                            <th className="px-4 py-2 font-semibold">
                              <div className="flex items-center gap-2">
                                <span>Bank Name</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}bank_col_bank_name`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide bank name column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                              </div>
                            </th>
                          )}
                          {showBankColumnBranch && (
                            <th className="px-4 py-2 font-semibold">
                              <div className="flex items-center gap-2">
                                <span>Branch</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}bank_col_branch`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide bank branch column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                              </div>
                            </th>
                          )}
                          {showBankColumnAccountNumber && (
                            <th className="px-4 py-2 font-semibold">
                              <div className="flex items-center gap-2">
                                <span>Account Number</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}bank_col_account_number`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide bank account number column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                              </div>
                            </th>
                          )}
                          {showBankColumnCurrentBalance && (
                            <th className="px-4 py-2 font-semibold text-right">
                              <div className="flex items-center justify-end gap-2">
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}bank_col_current_balance`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide bank current balance column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                                <span>Current Balance</span>
                              </div>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {bankAccounts.map((account) => (
                          <tr key={account.id} className="border-t border-gray-100">
                            {showBankColumnAccountName && (
                              <td className="px-4 py-2 font-semibold text-gray-900">{account.account_name || '-'}</td>
                            )}
                            {showBankColumnBankName && <td className="px-4 py-2">{account.bank_name || '-'}</td>}
                            {showBankColumnBranch && <td className="px-4 py-2">{account.bank_branch || '-'}</td>}
                            {showBankColumnAccountNumber && <td className="px-4 py-2">{account.account_number || '-'}</td>}
                            {showBankColumnCurrentBalance && (
                              <td className="px-4 py-2 text-right font-semibold text-gray-900">
                                {Number(account.current_balance || 0).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {!hiddenWidgetKeys.includes(`${widgetPrefix}cash_account`) && (
              <div className="mb-8 bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}cash_account`)}
                    className="absolute top-3 right-3 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                    aria-label="Hide branch cash account widget"
                    title="Hide widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Branch Cash Account</h2>
                  {!hiddenWidgetKeys.includes(`${widgetPrefix}cash_btn_create`) ? (
                    <div className="relative">
                      <WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => hideWidget(`${widgetPrefix}cash_btn_create`)}
                          className="absolute -left-9 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                          aria-label="Hide create cash account button"
                          title="Hide widget"
                        >
                          ×
                        </button>
                      </WidgetCloseGate>
                      <button
                        type="button"
                        onClick={openCashAccountModal}
                        disabled={!!cashAccount}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-gray-50 text-gray-800 text-sm font-semibold border border-gray-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {cashAccount ? 'Already Created' : 'Create Cash Account'}
                      </button>
                    </div>
                  ) : null}
                </div>

                {!cashAccount ? (
                  <p className="text-sm text-gray-600">No cash account created for this branch yet.</p>
                ) : !showAnyCashColumn ? (
                  <p className="text-sm text-gray-600">All cash account table columns are hidden.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-gray-700">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          {showCashColumnAccountName && (
                            <th className="px-4 py-2 font-semibold">
                              <div className="flex items-center gap-2">
                                <span>Account Name</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}cash_col_account_name`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide cash account name column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                              </div>
                            </th>
                          )}
                          {showCashColumnType && (
                            <th className="px-4 py-2 font-semibold">
                              <div className="flex items-center gap-2">
                                <span>Type</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}cash_col_type`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide cash account type column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                              </div>
                            </th>
                          )}
                          {showCashColumnOpeningBalance && (
                            <th className="px-4 py-2 font-semibold text-right">
                              <div className="flex items-center justify-end gap-2">
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}cash_col_opening_balance`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide cash opening balance column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                                <span>Opening Balance</span>
                              </div>
                            </th>
                          )}
                          {showCashColumnCurrentBalance && (
                            <th className="px-4 py-2 font-semibold text-right">
                              <div className="flex items-center justify-end gap-2">
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={() => hideWidget(`${widgetPrefix}cash_col_current_balance`)}
                                    className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                    aria-label="Hide cash current balance column"
                                    title="Hide column"
                                  >
                                    ×
                                  </button>
                                </WidgetCloseGate>
                                <span>Current Balance</span>
                              </div>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-gray-100">
                          {showCashColumnAccountName && (
                            <td className="px-4 py-2 font-semibold text-gray-900">{cashAccount.account_name || '-'}</td>
                          )}
                          {showCashColumnType && (
                            <td className="px-4 py-2 uppercase">{String(cashAccount.account_type || '-')}</td>
                          )}
                          {showCashColumnOpeningBalance && (
                            <td className="px-4 py-2 text-right font-semibold text-gray-900">
                              {Number(displayedCashOpeningValue || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              {showMainBalanceAsCashFallback ? (
                                <p className="text-[10px] font-medium text-cyan-700">Main account sync view</p>
                              ) : null}
                            </td>
                          )}
                          {showCashColumnCurrentBalance && (
                            <td className="px-4 py-2 text-right font-semibold text-gray-900">
                              {Number(displayedCashCurrentValue || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              {showMainBalanceAsCashFallback ? (
                                <p className="text-[10px] font-medium text-cyan-700">Main account sync view</p>
                              ) : null}
                            </td>
                          )}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {hiddenWidgetKeys.includes(`${widgetPrefix}bank_accounts`) && hiddenWidgetKeys.includes(`${widgetPrefix}cash_account`) ? (
              <div className="mb-8 rounded-2xl border border-dashed border-gray-300 bg-white/60 px-5 py-4 text-sm text-gray-600">
                Account widgets are hidden. Use `Restore Hidden Widgets` in the main dashboard to bring them back.
              </div>
            ) : null}

            {!hiddenWidgetKeys.includes(`${widgetPrefix}reports_header`) && (
              <div id="reports" className="mb-4 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}reports_header`)}
                    className="absolute top-1 right-0 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                    aria-label="Hide reports header widget"
                    title="Hide widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <h2 className="text-2xl font-bold text-gray-900">Branch Reports</h2>
                <p className="text-gray-600 mt-1">Same Reports Hub, auto-filtered by this branch.</p>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {visibleCategories.map((category) => (
                <div
                  key={category.key}
                  className="group relative bg-white/80 backdrop-blur-sm rounded-3xl shadow-[0_20px_40px_-30px_rgba(8,47,73,0.85)] border border-white/50 overflow-hidden"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${category.bg} opacity-40`}></div>

                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}report_category_${category.key}`)}
                      className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                      aria-label={`Hide ${category.title} widget`}
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>

                  <div className="relative p-6">
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-12 w-12 rounded-xl bg-gradient-to-r ${category.gradient} flex items-center justify-center text-2xl shadow-lg`}
                        >
                          {category.icon}
                        </div>
                        <div>
                          <h2 className="text-lg font-extrabold text-slate-900">{category.title}</h2>
                          <p className="text-xs text-slate-500">{category.reports.length} reports</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {category.reports.map((report) => (
                        <div
                          key={`${category.key}-${report.title}`}
                          className="rounded-xl border border-white/70 bg-white/75 p-3 flex items-start justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{report.title}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{report.description}</p>
                          </div>

                          {report.path ? (
                            <button
                              type="button"
                              onClick={() => router.push(report.path as string)}
                              className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700"
                            >
                              Open
                            </button>
                          ) : (
                            <span className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-semibold">
                              Coming Soon
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {visibleCategories.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 px-5 py-4 text-sm text-gray-600">
                Report widgets are hidden. Use `Restore Hidden Widgets` in the main dashboard to bring them back.
              </div>
            )}
          </>
        )}
      </main>

      {bankAccountModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !bankAccountSaving && setBankAccountModalOpen(false)} />
          <div className="relative w-full max-w-5xl rounded-2xl border border-teal-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-teal-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create Branch Bank Accounts</h3>
                <p className="mt-1 text-sm text-slate-600">Add multiple bank accounts for this branch in one step.</p>
              </div>
              <button
                onClick={() => !bankAccountSaving && setBankAccountModalOpen(false)}
                className="text-slate-500 hover:text-slate-800"
                disabled={bankAccountSaving}
              >
                ✕
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-4">
              {bankAccountRows.map((row, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Bank Account #{index + 1}</p>
                    {bankAccountRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBankAccountRow(index)}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                        disabled={bankAccountSaving}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Account Name</label>
                      <input
                        type="text"
                        value={row.account_name}
                        onChange={(e) => updateBankAccountRow(index, 'account_name', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-200"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Bank Name *</label>
                      <input
                        type="text"
                        value={row.bank_name}
                        onChange={(e) => updateBankAccountRow(index, 'bank_name', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-200"
                        placeholder="Required"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Bank Branch</label>
                      <input
                        type="text"
                        value={row.bank_branch}
                        onChange={(e) => updateBankAccountRow(index, 'bank_branch', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-200"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Account Number</label>
                      <input
                        type="text"
                        value={row.account_number}
                        onChange={(e) => updateBankAccountRow(index, 'account_number', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-200"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Opening Balance</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.opening_balance}
                        onChange={(e) => updateBankAccountRow(index, 'opening_balance', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-200"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Note</label>
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => updateBankAccountRow(index, 'notes', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-teal-200"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addBankAccountRow}
                className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100"
                disabled={bankAccountSaving}
              >
                + Add Another Account
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setBankAccountModalOpen(false)}
                disabled={bankAccountSaving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submitMultipleBankAccounts}
                disabled={bankAccountSaving}
                className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:from-teal-600 hover:to-cyan-600 disabled:opacity-60"
              >
                {bankAccountSaving ? 'Saving...' : 'Create Accounts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bankAccountNotice.open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setBankAccountNotice({ open: false, title: '', message: '' })} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{bankAccountNotice.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{bankAccountNotice.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setBankAccountNotice({ open: false, title: '', message: '' })}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {cashAccountModalOpen && (
        <div className="fixed inset-0 z-[91] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !cashAccountSaving && setCashAccountModalOpen(false)} />
          <div className="relative w-full max-w-xl rounded-2xl border border-amber-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-amber-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create Branch Cash Account</h3>
                <p className="mt-1 text-sm text-slate-600">Create a cash account for this branch.</p>
              </div>
              <button
                onClick={() => !cashAccountSaving && setCashAccountModalOpen(false)}
                className="text-slate-500 hover:text-slate-800"
                disabled={cashAccountSaving}
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Account Name</label>
                <input
                  type="text"
                  value={cashAccountDraft.account_name}
                  onChange={(e) => setCashAccountDraft((prev) => ({ ...prev, account_name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Opening Balance</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAccountDraft.opening_balance}
                  onChange={(e) => setCashAccountDraft((prev) => ({ ...prev, opening_balance: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Note</label>
                <input
                  type="text"
                  value={cashAccountDraft.notes}
                  onChange={(e) => setCashAccountDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setCashAccountModalOpen(false)}
                disabled={cashAccountSaving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submitCashAccount}
                disabled={cashAccountSaving}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
              >
                {cashAccountSaving ? 'Saving...' : 'Create Cash Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
