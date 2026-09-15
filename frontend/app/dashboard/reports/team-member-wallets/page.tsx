'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bell, Download, Home, LayoutGrid, LogOut, RefreshCw } from 'lucide-react';
import {
  AccountingReportShell,
  ReportTable,
  SummaryCards,
  amount,
  downloadCsv,
  toNumber,
  type CompanyOption,
} from '@/app/components/accounting/AccountingReportShell';

type ManagerOption = {
  employee_id: number;
  employee_code?: string;
  name?: string;
  direct_reports?: number;
};

type WalletRow = {
  employee_id: number;
  employee_code?: string;
  employee_name?: string;
  employee_email?: string;
  employee_status?: string;
  designation?: string;
  reporting_person?: string;
  manager_employee_id?: number | null;
  manager_employee_code?: string;
  manager_name?: string;
  wallet_id?: number;
  wallet_no?: string;
  wallet_status?: string;
  opening_balance?: number;
  current_balance?: number;
};

type ReportSummary = {
  team_members: number;
  wallet_holders: number;
  no_wallet_members: number;
  total_opening_balance: number;
  total_current_balance: number;
};

type AuthUser = {
  name?: string | null;
  email?: string | null;
  designation?: {
    name?: string | null;
  } | null;
  roles?: Array<{
    name?: string | null;
  }>;
};

type WalletDepositTransaction = {
  id: number;
  deposit_date?: string;
  amount?: number;
  status?: string;
  note?: string;
  bank_account_name?: string;
  bank_name?: string;
  account_type?: string;
};

type WalletHandoverTransaction = {
  id: number;
  handover_date?: string;
  amount?: number;
  status?: string;
  received_by?: string;
  note?: string;
  cash_account_name?: string;
  cash_account_type?: string;
  manager_name?: string;
  manager_employee_code?: string;
};

type WalletTransactionSummary = {
  deposit_count: number;
  handover_count: number;
  total_deposit_amount: number;
  total_handover_amount: number;
};

const normalizeLabel = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '-';
  return normalized
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

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

export default function TeamMemberWalletsReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCompanyId = Number(searchParams.get('branch_id') || searchParams.get('company_id') || 0) || null;

  const [token, setToken] = useState('');
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(initialCompanyId);
  const [currency, setCurrency] = useState('LKR');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({
    team_members: 0,
    wallet_holders: 0,
    no_wallet_members: 0,
    total_opening_balance: 0,
    total_current_balance: 0,
  });
  const [searchText, setSearchText] = useState('');
  const [managerFilter, setManagerFilter] = useState('all');
  const [walletStatusFilter, setWalletStatusFilter] = useState<'all' | 'active' | 'inactive' | 'no_wallet'>('all');
  const [selectedWalletRow, setSelectedWalletRow] = useState<WalletRow | null>(null);
  const [modalTransactionsLoading, setModalTransactionsLoading] = useState(false);
  const [modalTransactionsError, setModalTransactionsError] = useState('');
  const [modalRecentDeposits, setModalRecentDeposits] = useState<WalletDepositTransaction[]>([]);
  const [modalRecentHandovers, setModalRecentHandovers] = useState<WalletHandoverTransaction[]>([]);
  const [modalTransactionSummary, setModalTransactionSummary] = useState<WalletTransactionSummary>({
    deposit_count: 0,
    handover_count: 0,
    total_deposit_amount: 0,
    total_handover_amount: 0,
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterUnreadCount, setActionCenterUnreadCount] = useState(0);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
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

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const fetchNotificationPreview = async () => {
      try {
        const response = await axios.get('/api/notifications/preview', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        setActionCenterUnreadCount(Number(response.data?.unread_count || 0));
      } catch {
        setActionCenterUnreadCount(0);
      }
    };

    void fetchNotificationPreview();
  }, [token]);

  const fetchCompanies = async (authToken: string) => {
    setLoadingCompanies(true);
    try {
      const response = await axios.get('/api/companies', { headers: { Authorization: `Bearer ${authToken}` } });
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      setCompanies(list);
      if (list.length > 0) {
        setSelectedCompanyId((current) =>
          current && list.some((row: CompanyOption) => row.id === current) ? current : Number(list[0].id)
        );
      }
    } catch {
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchReport = async (overrides?: { q?: string; manager_employee_id?: string; wallet_status?: string }) => {
    if (!token || !selectedCompanyId) return;

    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/reports/team-member-wallets', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: {
          branch_id: selectedCompanyId,
          q: overrides?.q ?? searchText,
          manager_employee_id:
            (overrides?.manager_employee_id ?? managerFilter) !== 'all'
              ? Number(overrides?.manager_employee_id ?? managerFilter)
              : undefined,
          wallet_status: overrides?.wallet_status ?? walletStatusFilter,
        },
      });

      const payload = response.data || {};
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setManagerOptions(Array.isArray(payload.manager_options) ? payload.manager_options : []);
      setSummary({
        team_members: Number(payload.summary?.team_members || 0),
        wallet_holders: Number(payload.summary?.wallet_holders || 0),
        no_wallet_members: Number(payload.summary?.no_wallet_members || 0),
        total_opening_balance: toNumber(payload.summary?.total_opening_balance),
        total_current_balance: toNumber(payload.summary?.total_current_balance),
      });
      setCurrency(payload.company?.currency || 'LKR');
    } catch (fetchError: unknown) {
      const message =
        axios.isAxiosError(fetchError) && typeof fetchError.response?.data?.message === 'string'
          ? fetchError.response?.data?.message
          : 'Failed to load team member wallets report.';
      setRows([]);
      setManagerOptions([]);
      setSummary({
        team_members: 0,
        wallet_holders: 0,
        no_wallet_members: 0,
        total_opening_balance: 0,
        total_current_balance: 0,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchCompanies(token);
    }
  }, [token]);

  useEffect(() => {
    if (!token || loadingCompanies || !selectedCompanyId) return;
    void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedCompanyId, loadingCompanies]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  );

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    router.push('/');
  };

  const selectedWalletDelta = useMemo(() => {
    if (!selectedWalletRow) return 0;
    return toNumber(selectedWalletRow.current_balance) - toNumber(selectedWalletRow.opening_balance);
  }, [selectedWalletRow]);

  const openWalletModal = async (row: WalletRow) => {
    setSelectedWalletRow(row);
    setModalTransactionsError('');
    setModalRecentDeposits([]);
    setModalRecentHandovers([]);
    setModalTransactionSummary({
      deposit_count: 0,
      handover_count: 0,
      total_deposit_amount: 0,
      total_handover_amount: 0,
    });

    if (!token || !selectedCompanyId) {
      return;
    }

    setModalTransactionsLoading(true);
    try {
      const response = await axios.get(`/api/reports/team-member-wallets/${row.employee_id}/transactions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        params: {
          branch_id: selectedCompanyId,
          limit: 10,
        },
      });

      const payload = response.data || {};
      setModalRecentDeposits(Array.isArray(payload.recent_deposits) ? payload.recent_deposits : []);
      setModalRecentHandovers(Array.isArray(payload.recent_handovers) ? payload.recent_handovers : []);
      setModalTransactionSummary({
        deposit_count: Number(payload.summary?.deposit_count || 0),
        handover_count: Number(payload.summary?.handover_count || 0),
        total_deposit_amount: toNumber(payload.summary?.total_deposit_amount),
        total_handover_amount: toNumber(payload.summary?.total_handover_amount),
      });
    } catch (fetchError: unknown) {
      const message =
        axios.isAxiosError(fetchError) && typeof fetchError.response?.data?.message === 'string'
          ? fetchError.response?.data?.message
          : 'Failed to load previous wallet transactions.';
      setModalTransactionsError(message);
    } finally {
      setModalTransactionsLoading(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedWalletRow(null);
        setModalTransactionsError('');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const exportCsv = () => {
    downloadCsv(
      `team-member-wallets-${selectedCompanyId}.csv`,
      [
        'Employee Code',
        'Employee Name',
        'Email',
        'Designation',
        'Manager',
        'Wallet No',
        'Wallet Status',
        'Opening Balance',
        'Current Balance',
      ],
      rows.map((row) => [
        row.employee_code || '',
        row.employee_name || '',
        row.employee_email || '',
        row.designation || '',
        row.manager_name || row.reporting_person || '',
        row.wallet_no || '',
        normalizeLabel(String(row.wallet_status || '')),
        amount(row.opening_balance),
        amount(row.current_balance),
      ])
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-violet-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">Desk Of Finance</p>
              <p className="text-sm font-bold text-slate-900">Management Reports</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50"
            >
              <Home className="h-3.5 w-3.5" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/action-center')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              <Bell className="h-3.5 w-3.5" />
              Action Center
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                {actionCenterUnreadCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/reports')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Reports Hub
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="leading-tight">
              <p className="text-xs font-semibold text-slate-900">{displayName}</p>
              <p className="text-[11px] text-slate-500">{roleName}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
            >
              <LogOut className="h-3 w-3" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <AccountingReportShell
        badge="Management"
        title="Team Member Wallets"
        description="Monitor team wallet balances using reporting hierarchy from employees data."
        error={error}
        actions={
          <>
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                void fetchReport();
              }}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/reports')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Reports Hub
            </button>
          </>
        }
      >
      {selectedCompany ? (
        <p className="text-xs text-black font-semibold">
          {selectedCompany.name} · {currency}
        </p>
      ) : null}

      <SummaryCards
        items={[
          { label: 'Team Members', value: String(summary.team_members) },
          { label: 'Wallet Holders', value: String(summary.wallet_holders) },
          { label: 'No Wallet', value: String(summary.no_wallet_members) },
          {
            label: 'Total Wallet Balance',
            value: `${currency} ${amount(summary.total_current_balance)}`,
            valueClass: 'text-emerald-700',
          },
        ]}
      />

      <div className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-black">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-black mb-1">Branch</label>
            <select
              value={selectedCompanyId ?? ''}
              onChange={(event) => setSelectedCompanyId(Number(event.target.value) || null)}
              disabled={loadingCompanies}
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            >
              {companies.length === 0 ? <option value="">No branches</option> : null}
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-black mb-1">Manager</label>
            <select
              value={managerFilter}
              onChange={(event) => setManagerFilter(event.target.value)}
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            >
              <option value="all">All Managers</option>
              {managerOptions.map((option) => (
                <option key={option.employee_id} value={String(option.employee_id)}>
                  {option.name || `Employee #${option.employee_id}`} ({option.direct_reports || 0})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-black mb-1">Wallet Status</label>
            <select
              value={walletStatusFilter}
              onChange={(event) => setWalletStatusFilter(event.target.value as 'all' | 'active' | 'inactive' | 'no_wallet')}
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="no_wallet">No Wallet</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-black mb-1">Search Team Member</label>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Code, name, email, designation, wallet"
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void fetchReport();
            }}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-xs font-bold text-white hover:opacity-95 disabled:opacity-60"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setManagerFilter('all');
              setWalletStatusFilter('all');
              void fetchReport({ q: '', manager_employee_id: 'all', wallet_status: 'all' });
            }}
            className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50"
          >
            Reset
          </button>
        </div>
      </div>

      <ReportTable
        title="Team Wallet Balances"
        countLabel={`${rows.length} rows`}
        loading={loading}
        hasData={rows.length > 0}
        emptyTitle="No team wallet records found"
      >
        <div className="overflow-x-auto rounded-xl border border-violet-100">
          <table className="min-w-full text-xs text-black">
            <thead className="bg-violet-50/70 text-[10px] font-bold uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3 text-left">Employee</th>
                <th className="px-3 py-3 text-left">Designation</th>
                <th className="px-3 py-3 text-left">Manager</th>
                <th className="px-3 py-3 text-left">Wallet</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right">Opening</th>
                <th className="px-3 py-3 text-right">Current</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-50 bg-white">
              {rows.map((row) => (
                <tr
                  key={row.employee_id}
                  className="cursor-pointer hover:bg-violet-50/40"
                  onClick={() => {
                    void openWalletModal(row);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void openWalletModal(row);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open wallet details for ${row.employee_name || 'employee'}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-semibold">{row.employee_name || '-'}</div>
                    <div className="text-[11px] text-black/65">{row.employee_code || '-'}</div>
                    <div className="text-[11px] text-black/55">{row.employee_email || '-'}</div>
                  </td>
                  <td className="px-3 py-2.5">{row.designation || '-'}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{row.manager_name || '-'}</div>
                    <div className="text-[11px] text-black/60">{row.manager_employee_code || row.reporting_person || ''}</div>
                  </td>
                  <td className="px-3 py-2.5">{row.wallet_no || '-'}</td>
                  <td className="px-3 py-2.5">{normalizeLabel(String(row.wallet_status || ''))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.opening_balance)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{amount(row.current_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTable>

      {selectedWalletRow ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[1px]"
          onClick={() => {
            setSelectedWalletRow(null);
            setModalTransactionsError('');
          }}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-violet-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rounded-t-3xl bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100">Wallet Details</p>
                  <h3 className="mt-1 text-xl font-bold">{selectedWalletRow.employee_name || 'Team Member'}</h3>
                  <p className="mt-1 text-xs text-violet-100">
                    {selectedWalletRow.employee_code || '-'} · {selectedWalletRow.designation || 'No Designation'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWalletRow(null);
                    setModalTransactionsError('');
                  }}
                  className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Opening Balance</p>
                  <p className="mt-1 text-lg font-bold text-emerald-800">{currency} {amount(selectedWalletRow.opening_balance)}</p>
                </div>
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Current Balance</p>
                  <p className="mt-1 text-lg font-bold text-cyan-800">{currency} {amount(selectedWalletRow.current_balance)}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Balance Change</p>
                  <p className={`mt-1 text-lg font-bold ${selectedWalletDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {selectedWalletDelta >= 0 ? '+' : '-'}{currency} {amount(Math.abs(selectedWalletDelta))}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-violet-100 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-black/70">Wallet Number</p>
                  <p className="mt-1 text-sm font-bold text-black">{selectedWalletRow.wallet_no || 'No Wallet Assigned'}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-black/70">Wallet Status</p>
                  <p className="mt-1 text-sm font-bold text-black">{normalizeLabel(String(selectedWalletRow.wallet_status || ''))}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-black/70">Reporting Manager</p>
                  <p className="mt-1 text-sm font-semibold text-black">{selectedWalletRow.manager_name || '-'}</p>
                  <p className="text-xs text-black/60">{selectedWalletRow.manager_employee_code || selectedWalletRow.reporting_person || ''}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-black/70">Employee Status</p>
                  <p className="mt-1 text-sm font-semibold text-black">{normalizeLabel(String(selectedWalletRow.employee_status || 'active'))}</p>
                  <p className="text-xs text-black/60">{selectedWalletRow.employee_email || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700">Deposits</p>
                  <p className="mt-1 text-sm font-bold text-cyan-800">{modalTransactionSummary.deposit_count}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Handovers</p>
                  <p className="mt-1 text-sm font-bold text-amber-800">{modalTransactionSummary.handover_count}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Total Deposited</p>
                  <p className="mt-1 text-sm font-bold text-emerald-800">{currency} {amount(modalTransactionSummary.total_deposit_amount)}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">Total Handed Over</p>
                  <p className="mt-1 text-sm font-bold text-violet-800">{currency} {amount(modalTransactionSummary.total_handover_amount)}</p>
                </div>
              </div>

              {modalTransactionsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
                  {modalTransactionsError}
                </div>
              ) : null}

              {modalTransactionsLoading ? (
                <div className="rounded-2xl border border-violet-100 bg-violet-50/50 px-4 py-6 text-center text-sm font-semibold text-violet-800">
                  Loading previous wallet transactions...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-violet-100 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900">Recent Deposits</h4>
                      <span className="text-[11px] font-semibold text-slate-500">{modalRecentDeposits.length} items</span>
                    </div>
                    {modalRecentDeposits.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">No deposit transactions found.</p>
                    ) : (
                      <div className="max-h-64 overflow-auto rounded-xl border border-violet-100">
                        <table className="min-w-full text-xs text-black">
                          <thead className="bg-violet-50 text-[10px] font-bold uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2 text-left">Date</th>
                              <th className="px-3 py-2 text-left">Account</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-violet-50">
                            {modalRecentDeposits.map((item) => (
                              <tr key={item.id}>
                                <td className="px-3 py-2">{formatDate(item.deposit_date)}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium">{item.bank_account_name || '-'}</div>
                                  <div className="text-[11px] text-black/60">{item.bank_name || item.account_type || '-'}</div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{amount(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-violet-100 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900">Recent Handovers</h4>
                      <span className="text-[11px] font-semibold text-slate-500">{modalRecentHandovers.length} items</span>
                    </div>
                    {modalRecentHandovers.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">No handover transactions found.</p>
                    ) : (
                      <div className="max-h-64 overflow-auto rounded-xl border border-violet-100">
                        <table className="min-w-full text-xs text-black">
                          <thead className="bg-violet-50 text-[10px] font-bold uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2 text-left">Date</th>
                              <th className="px-3 py-2 text-left">Manager</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-violet-50">
                            {modalRecentHandovers.map((item) => (
                              <tr key={item.id}>
                                <td className="px-3 py-2">{formatDate(item.handover_date)}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium">{item.manager_name || '-'}</div>
                                  <div className="text-[11px] text-black/60">{item.manager_employee_code || item.cash_account_name || '-'}</div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">{amount(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      </AccountingReportShell>
    </>
  );
}
