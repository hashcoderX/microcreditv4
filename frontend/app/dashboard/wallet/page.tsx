'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';

type WalletSummary = {
  id?: number;
  wallet_no?: string;
  cash_in_hand?: number;
  total_deposited?: number;
  total_handed_over?: number;
  opening_balance?: number;
  status?: string;
};

type WalletBankAccount = {
  id: number;
  account_name?: string;
  bank_name?: string;
  account_number?: string;
  current_balance?: number;
};

type WalletManager = {
  employee_id: number;
  name: string;
  employee_code?: string;
};

type WalletDepositHistory = {
  id: number;
  amount?: number;
  deposit_date?: string;
  note?: string | null;
  bank_account?: {
    account_name?: string;
    bank_name?: string;
  } | null;
};

type WalletCashHandoverHistory = {
  id: number;
  amount?: number;
  handover_date?: string;
  received_by?: string | null;
  note?: string | null;
  status?: string;
  approved_at?: string | null;
  branch_cash_transferred_at?: string | null;
  manager_employee?: {
    first_name?: string;
    last_name?: string;
    employee_code?: string;
  } | null;
};

type AuthRole = {
  id?: number;
  name?: string;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  branch_id?: number;
  branch?: {
    name?: string;
  } | null;
  employee?: {
    branch_id?: number;
    branch_name?: string;
    branch?: {
      name?: string;
    } | null;
  } | null;
  designation?: {
    name?: string;
  } | null;
  roles?: AuthRole[];
};

export default function WalletPage() {
  const router = useRouter();
  const apiBaseUrl = getApiBaseUrl();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletBankAccounts, setWalletBankAccounts] = useState<WalletBankAccount[]>([]);
  const [walletManagers, setWalletManagers] = useState<WalletManager[]>([]);
  const [walletRecentDeposits, setWalletRecentDeposits] = useState<WalletDepositHistory[]>([]);
  const [walletRecentHandovers, setWalletRecentHandovers] = useState<WalletCashHandoverHistory[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [walletNotice, setWalletNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [depositModal, setDepositModal] = useState<{
    open: boolean;
    amount: string;
    bankAccountId: string;
    depositDate: string;
    note: string;
    saving: boolean;
  }>({
    open: false,
    amount: '',
    bankAccountId: '',
    depositDate: new Date().toISOString().slice(0, 10),
    note: '',
    saving: false,
  });
  const [handoverModal, setHandoverModal] = useState<{
    open: boolean;
    amount: string;
    managerEmployeeId: string;
    handoverDate: string;
    receivedBy: string;
    note: string;
    saving: boolean;
  }>({
    open: false,
    amount: '',
    managerEmployeeId: '',
    handoverDate: new Date().toISOString().slice(0, 10),
    receivedBy: '',
    note: '',
    saving: false,
  });
  const [walletMode, setWalletMode] = useState<'employee' | 'company' | 'none'>('none');

  const normalizeText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const isPrivilegedForCompanyWallet = (user: AuthUser | null): boolean => {
    if (!user) return false;
    const roleNames = (user.roles || []).map((role) => normalizeText(String(role?.name || '')));
    const designationName = normalizeText(String(user.designation?.name || ''));
    const directRoleName = normalizeText(String(user.role || ''));
    const sources = [directRoleName, designationName, ...roleNames].filter(Boolean);
    return sources.some((value) => value.includes('admin'));
  };

  const formatLkr = (value: number) =>
    `LKR ${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatDate = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const fetchNavContext = async (authToken: string) => {
    try {
      const userResponse = await axios.get(`${apiBaseUrl}/user`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setAuthUser((userResponse.data || null) as AuthUser | null);
    } catch {
      setAuthUser(null);
    }

    try {
      const notificationResponse = await axios.get(`${apiBaseUrl}/notifications/preview`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setNotificationUnreadCount(Number(notificationResponse.data?.unread_count || 0));
    } catch {
      setNotificationUnreadCount(0);
    }
  };

  const getHandoverBadge = (row: WalletCashHandoverHistory) => {
    const status = String(row.status || '').trim().toLowerCase();
    if (status === 'approved') {
      return { label: 'Complete', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    }
    if (status === 'pending') {
      return { label: 'Pending', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    }
    return { label: 'Draft', className: 'border-slate-200 bg-slate-50 text-slate-600' };
  };

  const fetchWalletData = async (authToken: string) => {
    setLoading(true);
    try {
      const walletResponse = await axios.get(`${apiBaseUrl}/hr/wallet/my`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setWalletSummary((walletResponse.data?.wallet || null) as WalletSummary | null);
      setWalletMode('employee');
      setWalletBankAccounts(
        Array.isArray(walletResponse.data?.bank_accounts)
          ? (walletResponse.data.bank_accounts as WalletBankAccount[])
          : []
      );
      setWalletManagers(
        Array.isArray(walletResponse.data?.managers)
          ? (walletResponse.data.managers as WalletManager[])
          : []
      );
      setWalletRecentDeposits(
        Array.isArray(walletResponse.data?.recent_deposits)
          ? (walletResponse.data.recent_deposits as WalletDepositHistory[])
          : []
      );
      setWalletRecentHandovers(
        Array.isArray(walletResponse.data?.recent_handovers)
          ? (walletResponse.data.recent_handovers as WalletCashHandoverHistory[])
          : []
      );
    } catch (error: unknown) {
      try {
        const userResponse = await axios.get(`${apiBaseUrl}/user`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        const user = (userResponse.data || null) as AuthUser | null;
        const branchId = Number(user?.branch_id || user?.employee?.branch_id || 0);
        const canUseCompanyWallet = branchId > 0 && isPrivilegedForCompanyWallet(user);

        if (!canUseCompanyWallet) {
          throw error;
        }

        const accountResponse = await axios.get(`${apiBaseUrl}/companies/${branchId}/accounts`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        const summary = accountResponse.data?.summary || {};
        const main = summary?.main || null;

        setWalletMode('company');
        setWalletSummary({
          id: Number(main?.id || 0) || undefined,
          wallet_no: `CW${String(branchId).padStart(6, '0')}`,
          cash_in_hand: Number(main?.current_balance || 0),
          total_deposited: 0,
          total_handed_over: 0,
          opening_balance: Number(main?.opening_balance || 0),
          status: main ? 'active' : 'inactive',
        });
        setWalletBankAccounts(Array.isArray(summary?.banks) ? (summary.banks as WalletBankAccount[]) : []);
        setWalletManagers([]);
        setWalletRecentDeposits([]);
        setWalletRecentHandovers([]);
      } catch {
        const message =
          axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Failed to load wallet details.';
        setWalletMode('none');
        setWalletSummary(null);
        setWalletBankAccounts([]);
        setWalletManagers([]);
        setWalletRecentDeposits([]);
        setWalletRecentHandovers([]);
        setWalletNotice({ open: true, title: 'Wallet', message });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
    void fetchNavContext(storedToken);
    void fetchWalletData(storedToken);
  }, [router]);

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const firstRoleName =
    authUser?.roles?.find((role) => String(role?.name || '').trim())?.name ||
    authUser?.designation?.name ||
    authUser?.role ||
    'User';
  const primaryRoleName = String(firstRoleName || 'User').trim();
  const resolvedBranchName = String(
    authUser?.branch?.name || authUser?.employee?.branch?.name || authUser?.employee?.branch_name || ''
  ).trim();
  const resolvedBranchId = Number(authUser?.branch_id || authUser?.employee?.branch_id || 0);
  const branchBadgeLabel = resolvedBranchName || (resolvedBranchId > 0 ? `Branch #${resolvedBranchId}` : 'No Branch');
  const walletPreviewBalance = Number(walletSummary?.cash_in_hand ?? 0);
  const walletPreviewHasWallet = Boolean(walletSummary?.wallet_no);
  const walletPreviewNo = String(walletSummary?.wallet_no || '-');

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  const cashInHand = Number(walletSummary?.cash_in_hand ?? 0);
  const totalDeposited = Number(walletSummary?.total_deposited ?? 0);
  const totalHandedOver = Number(walletSummary?.total_handed_over ?? 0);
  const hasWallet = Boolean(walletSummary?.wallet_no);
  const portfolioTotal = Math.max(cashInHand + totalDeposited + totalHandedOver, 1);
  const cashShare = Math.min((cashInHand / portfolioTotal) * 100, 100);
  const depositShare = Math.min((totalDeposited / portfolioTotal) * 100, 100);
  const handoverShare = Math.min((totalHandedOver / portfolioTotal) * 100, 100);
  const totalBankBalance = walletBankAccounts.reduce((sum, row) => sum + Number(row.current_balance || 0), 0);

  const recentDepositBars = walletRecentDeposits.slice(0, 6);
  const maxDepositBarAmount = Math.max(
    1,
    ...recentDepositBars.map((row) => Number(row.amount || 0))
  );
  const recentHandoverBars = walletRecentHandovers.slice(0, 6);
  const maxHandoverBarAmount = Math.max(
    1,
    ...recentHandoverBars.map((row) => Number(row.amount || 0))
  );

  const openDepositModal = () => {
    const defaultBankId = walletBankAccounts[0]?.id ? String(walletBankAccounts[0].id) : '';
    setDepositModal({
      open: true,
      amount: '',
      bankAccountId: defaultBankId,
      depositDate: new Date().toISOString().slice(0, 10),
      note: '',
      saving: false,
    });
  };

  const closeDepositModal = () => {
    if (depositModal.saving) return;
    setDepositModal((prev) => ({ ...prev, open: false }));
  };

  const openHandoverModal = () => {
    const defaultManagerId = walletManagers[0]?.employee_id ? String(walletManagers[0].employee_id) : '';
    setHandoverModal({
      open: true,
      amount: '',
      managerEmployeeId: defaultManagerId,
      handoverDate: new Date().toISOString().slice(0, 10),
      receivedBy: '',
      note: '',
      saving: false,
    });
  };

  const closeHandoverModal = () => {
    if (handoverModal.saving) return;
    setHandoverModal((prev) => ({ ...prev, open: false }));
  };

  const submitWalletDeposit = async () => {
    const amount = Number(depositModal.amount || 0);
    const bankAccountId = Number(depositModal.bankAccountId || 0);

    if (amount <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please enter a valid deposit amount.' });
      return;
    }
    if (amount > cashInHand) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Deposit amount cannot exceed cash in hand.' });
      return;
    }
    if (bankAccountId <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please select a branch bank account.' });
      return;
    }

    try {
      setDepositModal((prev) => ({ ...prev, saving: true }));
      const response = await axios.post(
        `${apiBaseUrl}/hr/wallet/my/deposit-bank`,
        {
          amount,
          bank_account_id: bankAccountId,
          deposit_date: depositModal.depositDate,
          note: depositModal.note.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchWalletData(token);
      setWalletNotice({
        open: true,
        title: 'Success',
        message: response.data?.message || 'Wallet deposit posted successfully.',
      });
      setDepositModal((prev) => ({ ...prev, open: false, saving: false }));
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response?.data?.message
          : 'Failed to deposit wallet amount to bank. Please try again.';
      setWalletNotice({ open: true, title: 'Deposit Error', message });
      setDepositModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const submitWalletHandover = async () => {
    const amount = Number(handoverModal.amount || 0);
    const managerEmployeeId = Number(handoverModal.managerEmployeeId || 0);

    if (amount <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please enter a valid handover amount.' });
      return;
    }
    if (amount > cashInHand) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Handover amount cannot exceed cash in hand.' });
      return;
    }
    if (managerEmployeeId <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please select a manager.' });
      return;
    }

    try {
      setHandoverModal((prev) => ({ ...prev, saving: true }));
      const response = await axios.post(
        `${apiBaseUrl}/hr/wallet/my/cash-handover`,
        {
          amount,
          manager_employee_id: managerEmployeeId,
          handover_date: handoverModal.handoverDate,
          received_by: handoverModal.receivedBy.trim() || undefined,
          note: handoverModal.note.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchWalletData(token);
      setWalletNotice({
        open: true,
        title: 'Success',
        message: response.data?.message || 'Cash handover posted successfully.',
      });
      setHandoverModal((prev) => ({ ...prev, open: false, saving: false }));
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response?.data?.message
          : 'Failed to complete cash handover. Please try again.';
      setWalletNotice({ open: true, title: 'Handover Error', message });
      setHandoverModal((prev) => ({ ...prev, saving: false }));
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.14),transparent_40%),radial-gradient(circle_at_85%_12%,rgba(6,182,212,0.16),transparent_42%),linear-gradient(120deg,#f8fafc_0%,#f0fdfa_55%,#ecfeff_100%)] p-4 sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute -left-24 top-14 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{ backgroundImage: 'linear-gradient(rgba(15,23,42,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <nav className="relative z-20 mb-6 rounded-2xl border border-white/70 bg-white/85 shadow-lg backdrop-blur-lg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-red-500 to-pink-500">
                  <span className="text-sm font-bold text-white">DOF</span>
                </div>
                <h1 className="max-w-[180px] truncate bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-base font-bold text-transparent sm:max-w-none sm:text-xl">
                  Desk of Finance
                </h1>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <div className="hidden items-center space-x-2 text-xs text-gray-600 sm:flex sm:text-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span>System Online</span>
              </div>

              <div className="hidden items-center rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1.5 text-xs font-semibold text-sky-900 sm:flex">
                <span className="mr-1.5 inline-flex h-2 w-2 rounded-full bg-sky-500" />
                {branchBadgeLabel}
              </div>

              <div className="hidden items-center rounded-full border border-red-100 bg-white/80 px-3 py-1.5 text-left sm:flex">
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-900">{displayName}</p>
                  <p className="text-[11px] font-medium text-slate-500">{primaryRoleName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push('/dashboard/action-center')}
                className="flex w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-left transition hover:bg-amber-100 sm:w-auto"
              >
                <span className="text-sm">🔔</span>
                <span className="text-xs font-semibold text-amber-800">Action Center</span>
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {notificationUnreadCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/dashboard/wallet')}
                className="flex w-full items-center rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-left transition hover:bg-emerald-100 sm:w-auto"
              >
                <div className="leading-tight">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Wallet Preview</p>
                  <p className="text-xs font-semibold text-emerald-900">{formatLkr(walletPreviewBalance)}</p>
                  <p className="text-[11px] font-medium text-emerald-700">Wallet No: {walletPreviewHasWallet ? walletPreviewNo : 'Not created'}</p>
                </div>
              </button>

              <button
                onClick={handleLogout}
                className="w-full rounded-full bg-gradient-to-r from-red-500 to-pink-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-red-600 hover:to-pink-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative mx-auto max-w-6xl space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/85 p-5 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.55)] backdrop-blur sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-cyan-300/35 to-transparent blur-2xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-24 h-60 w-60 rounded-full bg-gradient-to-br from-emerald-300/30 to-transparent blur-2xl" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex rounded-full border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Wallet Command Deck
              </p>
              <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                {walletMode === 'company' ? 'Company Wallet' : 'Employee Wallet'}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {walletMode === 'company'
                  ? 'View company fund available in the main company account.'
                  : 'Track balance, bank deposits, and cash handovers in one place.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800">
                <p className="font-semibold">Cash</p>
                <p>{formatLkr(cashInHand)}</p>
              </div>
              <div className="rounded-xl border border-cyan-100 bg-cyan-50/80 px-3 py-2 text-xs text-cyan-800">
                <p className="font-semibold">Bank</p>
                <p>{formatLkr(totalBankBalance)}</p>
              </div>
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/80 bg-white/80 p-10 text-center text-slate-500 shadow-lg backdrop-blur">
            Loading wallet...
          </div>
        ) : !hasWallet ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
            No wallet is linked to this account yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-emerald-50 to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Wallet No</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{walletSummary?.wallet_no || '-'}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Cash In Hand</p>
                <p className="mt-2 text-lg font-bold text-emerald-800">{formatLkr(cashInHand)}</p>
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs uppercase tracking-wide text-cyan-700">Total Deposited</p>
                <p className="mt-2 text-lg font-bold text-cyan-800">{formatLkr(totalDeposited)}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs uppercase tracking-wide text-amber-700">Total Handed Over</p>
                <p className="mt-2 text-lg font-bold text-amber-800">{formatLkr(totalHandedOver)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-800 p-6 text-white shadow-xl xl:col-span-2">
                <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -left-10 bottom-6 h-24 w-24 rounded-full bg-white/10" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/90">Cash Vault</p>
                <p className="mt-2 text-3xl font-black tracking-tight">{formatLkr(cashInHand)}</p>
                <p className="mt-2 text-sm text-emerald-50/90">
                  Ready cash available now for field collection operations and immediate movements.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-100">Opening</p>
                    <p className="mt-1 text-sm font-semibold">{formatLkr(Number(walletSummary?.opening_balance || 0))}</p>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-100">Status</p>
                    <p className="mt-1 text-sm font-semibold capitalize">{walletSummary?.status || 'active'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-cyan-100 bg-white/90 p-6 shadow-lg backdrop-blur xl:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Bank Accounts</h3>
                    <p className="mt-1 text-xs text-slate-500">Linked branch/company bank accounts and live balances.</p>
                  </div>
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-right">
                    <p className="text-[11px] uppercase tracking-wide text-cyan-700">Total Bank Balance</p>
                    <p className="text-sm font-bold text-cyan-800">{formatLkr(totalBankBalance)}</p>
                  </div>
                </div>

                {walletBankAccounts.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No bank account is connected to this wallet yet.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {walletBankAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="group rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{account.account_name || 'Bank Account'}</p>
                            <p className="text-xs text-slate-500">
                              {account.bank_name || 'Unknown bank'}
                              {account.account_number ? ` | ${account.account_number}` : ''}
                            </p>
                          </div>
                          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-sm font-bold text-cyan-800">
                            {formatLkr(Number(account.current_balance || 0))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {walletMode === 'employee' && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-lg backdrop-blur xl:col-span-1">
                <h3 className="text-sm font-semibold text-slate-900">Wallet Distribution</h3>
                <p className="mt-1 text-xs text-slate-500">Visual split of current wallet movement.</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-emerald-700">
                      <span>Cash In Hand</span>
                      <span>{cashShare.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-emerald-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${cashShare}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-cyan-700">
                      <span>Total Deposited</span>
                      <span>{depositShare.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-cyan-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400" style={{ width: `${depositShare}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-amber-700">
                      <span>Total Handed Over</span>
                      <span>{handoverShare.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-amber-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: `${handoverShare}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-lg backdrop-blur xl:col-span-1">
                <h3 className="text-sm font-semibold text-slate-900">Recent Deposits Graph</h3>
                <p className="mt-1 text-xs text-slate-500">Last six deposit transactions.</p>
                <div className="mt-4 flex h-36 items-end gap-2">
                  {recentDepositBars.length === 0 ? (
                    <p className="text-sm text-slate-500">No deposit data.</p>
                  ) : (
                    recentDepositBars.map((row) => {
                      const value = Number(row.amount || 0);
                      const heightPct = Math.max((value / maxDepositBarAmount) * 100, 8);
                      return (
                        <div key={`dep-bar-${row.id}`} className="flex flex-1 flex-col items-center">
                          <div
                            className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-cyan-300"
                            style={{ height: `${heightPct}%` }}
                            title={`${formatDate(row.deposit_date)} - ${formatLkr(value)}`}
                          />
                          <span className="mt-2 text-[10px] font-medium text-slate-500">{formatDate(row.deposit_date)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-lg backdrop-blur xl:col-span-1">
                <h3 className="text-sm font-semibold text-slate-900">Recent Handovers Graph</h3>
                <p className="mt-1 text-xs text-slate-500">Last six cash handovers.</p>
                <div className="mt-4 flex h-36 items-end gap-2">
                  {recentHandoverBars.length === 0 ? (
                    <p className="text-sm text-slate-500">No handover data.</p>
                  ) : (
                    recentHandoverBars.map((row) => {
                      const value = Number(row.amount || 0);
                      const heightPct = Math.max((value / maxHandoverBarAmount) * 100, 8);
                      return (
                        <div key={`han-bar-${row.id}`} className="flex flex-1 flex-col items-center">
                          <div
                            className="w-full rounded-t-md bg-gradient-to-t from-amber-500 to-amber-300"
                            style={{ height: `${heightPct}%` }}
                            title={`${formatDate(row.handover_date)} - ${formatLkr(value)}`}
                          />
                          <span className="mt-2 text-[10px] font-medium text-slate-500">{formatDate(row.handover_date)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            )}

            {walletMode === 'employee' ? (
              <div className="flex flex-wrap gap-3 rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur">
                <button
                  onClick={openDepositModal}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:from-emerald-600 hover:to-teal-600"
                >
                  Deposit to Bank
                </button>
                <button
                  onClick={openHandoverModal}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:from-amber-600 hover:to-orange-600"
                >
                  Cash Handover
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                Company wallet view is enabled for this login. Use Company Accounting tab to add or manage company funds.
              </div>
            )}

            {walletMode === 'employee' && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-lg backdrop-blur">
                <div className="border-b border-slate-100 bg-slate-50/90 px-5 py-4">
                  <h4 className="text-sm font-semibold text-slate-900">Recent Deposits</h4>
                </div>
                {walletRecentDeposits.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">No deposits yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-slate-700">
                      <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Date</th>
                          <th className="px-5 py-3 font-semibold">Bank Account</th>
                          <th className="px-5 py-3 text-right font-semibold">Amount</th>
                          <th className="px-5 py-3 font-semibold">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletRecentDeposits.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                            <td className="px-5 py-3">{formatDate(row.deposit_date)}</td>
                            <td className="px-5 py-3">
                              <div className="font-medium text-slate-900">{row.bank_account?.account_name || '-'}</div>
                              <div className="text-xs text-slate-500">{row.bank_account?.bank_name || ''}</div>
                            </td>
                            <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                            <td className="px-5 py-3 text-slate-600">{row.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-lg backdrop-blur">
                <div className="border-b border-slate-100 bg-slate-50/90 px-5 py-4">
                  <h4 className="text-sm font-semibold text-slate-900">Recent Cash Handovers</h4>
                </div>
                {walletRecentHandovers.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500">No cash handovers yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-slate-700">
                      <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Date</th>
                          <th className="px-5 py-3 font-semibold">Manager</th>
                          <th className="px-5 py-3 font-semibold">Received By</th>
                          <th className="px-5 py-3 font-semibold">Status</th>
                          <th className="px-5 py-3 text-right font-semibold">Amount</th>
                          <th className="px-5 py-3 font-semibold">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletRecentHandovers.map((row) => {
                          const badge = getHandoverBadge(row);
                          return (
                            <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                              <td className="px-5 py-3">{formatDate(row.handover_date)}</td>
                              <td className="px-5 py-3">
                                <div className="font-medium text-slate-900">
                                  {row.manager_employee
                                    ? `${row.manager_employee.first_name || ''} ${row.manager_employee.last_name || ''}`.trim() || '-'
                                    : '-'}
                                </div>
                                <div className="text-xs text-slate-500">{row.manager_employee?.employee_code || ''}</div>
                              </td>
                              <td className="px-5 py-3 text-slate-600">{row.received_by || '-'}</td>
                              <td className="px-5 py-3">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                              <td className="px-5 py-3 text-slate-600">{row.note || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            )}
          </>
        )}
      </div>

      {walletMode === 'employee' && depositModal.open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={closeDepositModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-emerald-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-emerald-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Deposit to Bank</h3>
                <p className="mt-1 text-sm text-slate-600">Move collected cash from your wallet to a bank account.</p>
              </div>
              <button onClick={closeDepositModal} className="text-slate-500 hover:text-slate-800" disabled={depositModal.saving}>✕</button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">Cash in Hand: {formatLkr(cashInHand)}</p>
                <p className="mt-1">Total Deposited: {formatLkr(totalDeposited)}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositModal.amount}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Bank Account</label>
                <select
                  value={depositModal.bankAccountId}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, bankAccountId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  <option value="">Select bank account</option>
                  {walletBankAccounts.map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {account.account_name || '-'}
                      {account.bank_name ? ` - ${account.bank_name}` : ''}
                      {account.account_number ? ` (${account.account_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Deposit Date</label>
                <input
                  type="date"
                  value={depositModal.depositDate}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, depositDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Note</label>
                <textarea
                  rows={3}
                  value={depositModal.note}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  placeholder="Optional note"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={closeDepositModal}
                disabled={depositModal.saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submitWalletDeposit}
                disabled={depositModal.saving || walletBankAccounts.length === 0}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow hover:from-emerald-600 hover:to-teal-600 disabled:opacity-60"
              >
                {depositModal.saving ? 'Posting...' : 'Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {walletMode === 'employee' && handoverModal.open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={closeHandoverModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-amber-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Cash Handover</h3>
                <p className="mt-1 text-sm text-slate-600">Handover collected cash from your wallet to cash/main account.</p>
              </div>
              <button onClick={closeHandoverModal} className="text-slate-500 hover:text-slate-800" disabled={handoverModal.saving}>✕</button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Cash in Hand: {formatLkr(cashInHand)}</p>
                <p className="mt-1">Total Handed Over: {formatLkr(totalHandedOver)}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={handoverModal.amount}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Manager</label>
                <select
                  value={handoverModal.managerEmployeeId}
                  onChange={(e) => {
                    const selectedManager = walletManagers.find((manager) => String(manager.employee_id) === e.target.value);
                    setHandoverModal((prev) => ({
                      ...prev,
                      managerEmployeeId: e.target.value,
                      receivedBy: selectedManager?.name || prev.receivedBy,
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="">Select manager</option>
                  {walletManagers.map((manager) => (
                    <option key={manager.employee_id} value={String(manager.employee_id)}>
                      {manager.name}
                      {manager.employee_code ? ` (${manager.employee_code})` : ''}
                    </option>
                  ))}
                </select>
                {walletManagers.length === 0 && (
                  <p className="mt-2 text-xs text-rose-600">
                    No managers found for this branch. Please assign a branch manager in branch settings.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Handover Date</label>
                <input
                  type="date"
                  value={handoverModal.handoverDate}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, handoverDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Received By</label>
                <input
                  type="text"
                  value={handoverModal.receivedBy}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, receivedBy: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Receiver name (optional)"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Note</label>
                <textarea
                  rows={3}
                  value={handoverModal.note}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Optional note"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={closeHandoverModal}
                disabled={handoverModal.saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submitWalletHandover}
                disabled={handoverModal.saving || walletManagers.length === 0}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
              >
                {handoverModal.saving ? 'Posting...' : 'Cash Handover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {walletNotice.open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setWalletNotice({ open: false, title: '', message: '' })} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">{walletNotice.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{walletNotice.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setWalletNotice({ open: false, title: '', message: '' })}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
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
