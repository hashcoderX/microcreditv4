'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Building2,
  Coins,
  Landmark,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  AccountingSummary,
  AccountFormState,
  BankFormState,
  CompanyAccount,
  accountingInputClass,
  accountingLabelClass,
  emptyAccountForm,
  emptyBankForm,
  formatMoney,
  toAmount,
} from './companyAccountingUtils';

type Notice = { type: 'success' | 'error'; text: string };

type CompanyWalletUserStatus = {
  company_id: number;
  wallet_no: string;
  company_fund: number;
  email: string;
  has_main_account: boolean;
  user_exists: boolean;
  is_branch_linked: boolean;
  has_super_admin_role: boolean;
  generated_password?: string | null;
};

type CompanyAccountingPanelProps = {
  token: string;
  companyId: number | null;
  currency?: string;
  onNotice?: (notice: Notice) => void;
  emptyMessage?: string;
};

export default function CompanyAccountingPanel({
  token,
  companyId,
  currency = 'LKR',
  onNotice,
  emptyMessage = 'Select a company or branch first.',
}: CompanyAccountingPanelProps) {
  const formatDateTime = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountSummary, setAccountSummary] = useState<AccountingSummary | null>(null);
  const [bankAccounts, setBankAccounts] = useState<CompanyAccount[]>([]);
  const [cashForm, setCashForm] = useState<AccountFormState>(emptyAccountForm());
  const [bankForm, setBankForm] = useState<BankFormState>(emptyBankForm());
  const [editingBankId, setEditingBankId] = useState<number | null>(null);
  const [addingMainMoney, setAddingMainMoney] = useState(false);
  const [savingCashAccount, setSavingCashAccount] = useState(false);
  const [savingBankAccount, setSavingBankAccount] = useState(false);
  const [deletingBankId, setDeletingBankId] = useState<number | null>(null);
  const [companyWalletStatus, setCompanyWalletStatus] = useState<CompanyWalletUserStatus | null>(null);
  const [loadingCompanyWalletStatus, setLoadingCompanyWalletStatus] = useState(false);
  const [provisioningCompanyWalletUser, setProvisioningCompanyWalletUser] = useState(false);
  const [mainTopUpAmount, setMainTopUpAmount] = useState('');
  const [mainTopUpNote, setMainTopUpNote] = useState('');

  const totalBankCurrentBalance = (accountSummary?.banks || []).reduce(
    (sum, row) => sum + toAmount(row.current_balance),
    0
  );

  const notify = (notice: Notice) => {
    onNotice?.(notice);
  };

  const accountFromRow = (row: CompanyAccount | null | undefined): AccountFormState => ({
    account_name: row?.account_name || '',
    account_code: row?.account_code || '',
    opening_balance: row?.opening_balance != null ? String(row.opening_balance) : '',
    notes: row?.notes || '',
  });

  const loadAccountingForms = (summary: AccountingSummary | null) => {
    setCashForm(accountFromRow(summary?.cash));
    setBankAccounts(Array.isArray(summary?.banks) ? summary.banks : []);
    if (!editingBankId) {
      setBankForm(emptyBankForm());
    }
  };

  const fetchCompanyAccounts = async (authToken: string, selectedCompanyId: number) => {
    setAccountsLoading(true);
    try {
      const response = await axios.get(`/api/companies/${selectedCompanyId}/accounts`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const summary = (response.data?.summary || null) as AccountingSummary | null;
      setAccountSummary(summary);
      loadAccountingForms(summary);
    } catch {
      setAccountSummary(null);
      setBankAccounts([]);
      setCashForm(emptyAccountForm());
      setBankForm(emptyBankForm());
    } finally {
      setAccountsLoading(false);
    }
  };

  const fetchCompanyWalletStatus = async (authToken: string, selectedCompanyId: number) => {
    setLoadingCompanyWalletStatus(true);
    try {
      const response = await axios.get(`/api/companies/${selectedCompanyId}/wallet-user`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setCompanyWalletStatus((response.data?.wallet || null) as CompanyWalletUserStatus | null);
    } catch {
      setCompanyWalletStatus(null);
    } finally {
      setLoadingCompanyWalletStatus(false);
    }
  };

  useEffect(() => {
    if (!token || !companyId) {
      setAccountSummary(null);
      setBankAccounts([]);
      setCashForm(emptyAccountForm());
      setBankForm(emptyBankForm());
      setCompanyWalletStatus(null);
      setEditingBankId(null);
      return;
    }

    fetchCompanyAccounts(token, companyId);
    fetchCompanyWalletStatus(token, companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, companyId]);

  const refreshCompanyAccounts = async () => {
    if (!token || !companyId) return;
    await fetchCompanyAccounts(token, companyId);
    await fetchCompanyWalletStatus(token, companyId);
  };

  const handleProvisionCompanyWalletUser = async () => {
    if (!token || !companyId) {
      notify({ type: 'error', text: 'Select a company first.' });
      return;
    }

    setProvisioningCompanyWalletUser(true);
    try {
      const response = await axios.post(
        `/api/companies/${companyId}/wallet-user/provision`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const walletData = (response.data?.wallet || null) as CompanyWalletUserStatus | null;
      if (walletData) {
        setCompanyWalletStatus(walletData);
      }

      const generatedPassword = String(walletData?.generated_password || '').trim();
      const generatedEmail = String(walletData?.email || '').trim();
      if (generatedPassword) {
        notify({
          type: 'success',
          text: `Company wallet user is ready. Email: ${generatedEmail} | Temp password: ${generatedPassword}`,
        });
      } else {
        notify({ type: 'success', text: response.data?.message || 'Company wallet user linked successfully.' });
      }

      await refreshCompanyAccounts();
    } catch (error: any) {
      notify({
        type: 'error',
        text: error?.response?.data?.message || 'Failed to provision company wallet user.',
      });
    } finally {
      setProvisioningCompanyWalletUser(false);
    }
  };

  const handleAddMoneyToMainAccount = async () => {
    if (!token || !companyId) {
      notify({ type: 'error', text: 'Select a company first.' });
      return;
    }

    if (!accountSummary?.main?.id) {
      notify({ type: 'error', text: 'Create the main account first, then add money.' });
      return;
    }

    const amount = toAmount(mainTopUpAmount);
    if (amount <= 0) {
      notify({ type: 'error', text: 'Enter a valid amount greater than zero.' });
      return;
    }

    setAddingMainMoney(true);

    const currentBalance = toAmount(accountSummary.main.current_balance);
    const newCurrentBalance = Math.round((currentBalance + amount) * 100) / 100;
    const topUpNote = mainTopUpNote.trim();
    const existingNotes = String(accountSummary.main.notes || '').trim();
    const mergedNotes =
      topUpNote === ''
        ? undefined
        : [
            existingNotes,
            `Top-up ${new Date().toLocaleString('en-GB')}: +${formatMoney(amount, currency)} ${topUpNote}`,
          ]
            .filter(Boolean)
            .join('\n');

    const payload: { current_balance: number; notes?: string } = {
      current_balance: newCurrentBalance,
    };

    if (mergedNotes !== undefined) {
      payload.notes = mergedNotes;
    }

    try {
      await axios.put(`/api/companies/${companyId}/accounts/${accountSummary.main.id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      notify({ type: 'success', text: `Added ${formatMoney(amount, currency)} to main account.` });
      setMainTopUpAmount('');
      setMainTopUpNote('');
      await refreshCompanyAccounts();
    } catch (error: any) {
      notify({ type: 'error', text: error?.response?.data?.message || 'Failed to add money to main account.' });
    } finally {
      setAddingMainMoney(false);
    }
  };

  const handleSaveCashAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !companyId) {
      notify({ type: 'error', text: 'Select a company first.' });
      return;
    }

    setSavingCashAccount(true);

    const payload = {
      account_name: cashForm.account_name.trim() || 'Cash Account',
      account_code: cashForm.account_code.trim() || undefined,
      opening_balance: toAmount(cashForm.opening_balance),
      notes: cashForm.notes.trim() || null,
    };

    try {
      if (accountSummary?.cash?.id) {
        await axios.put(`/api/companies/${companyId}/accounts/${accountSummary.cash.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        notify({ type: 'success', text: 'Cash account opening balance updated.' });
      } else {
        await axios.post(
          `/api/companies/${companyId}/accounts`,
          { ...payload, account_type: 'cash' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        notify({ type: 'success', text: 'Cash account created with opening balance.' });
      }
      await refreshCompanyAccounts();
    } catch (error: any) {
      notify({ type: 'error', text: error?.response?.data?.message || 'Failed to save cash account.' });
    } finally {
      setSavingCashAccount(false);
    }
  };

  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !companyId) {
      notify({ type: 'error', text: 'Select a company first.' });
      return;
    }

    if (!bankForm.bank_name.trim()) {
      notify({ type: 'error', text: 'Bank name is required.' });
      return;
    }

    setSavingBankAccount(true);

    const payload = {
      account_name: bankForm.account_name.trim() || `${bankForm.bank_name.trim()} Account`,
      account_code: bankForm.account_code.trim() || undefined,
      bank_name: bankForm.bank_name.trim(),
      bank_branch: bankForm.bank_branch.trim() || null,
      account_number: bankForm.account_number.trim() || null,
      opening_balance: toAmount(bankForm.opening_balance),
      notes: bankForm.notes.trim() || null,
    };

    try {
      if (editingBankId) {
        await axios.put(`/api/companies/${companyId}/accounts/${editingBankId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        notify({ type: 'success', text: 'Bank account updated.' });
      } else {
        await axios.post(
          `/api/companies/${companyId}/accounts`,
          { ...payload, account_type: 'bank' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        notify({ type: 'success', text: 'Bank account added with opening balance.' });
      }
      setEditingBankId(null);
      setBankForm(emptyBankForm());
      await refreshCompanyAccounts();
    } catch (error: any) {
      notify({ type: 'error', text: error?.response?.data?.message || 'Failed to save bank account.' });
    } finally {
      setSavingBankAccount(false);
    }
  };

  const handleEditBankAccount = (row: CompanyAccount) => {
    setEditingBankId(row.id);
    setBankForm({
      account_name: row.account_name || '',
      account_code: row.account_code || '',
      bank_name: row.bank_name || '',
      bank_branch: row.bank_branch || '',
      account_number: row.account_number || '',
      opening_balance: row.opening_balance != null ? String(row.opening_balance) : '',
      notes: row.notes || '',
    });
  };

  const handleDeleteBankAccount = async (accountId: number) => {
    if (!token || !companyId) return;

    setDeletingBankId(accountId);

    try {
      await axios.delete(`/api/companies/${companyId}/accounts/${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (editingBankId === accountId) {
        setEditingBankId(null);
        setBankForm(emptyBankForm());
      }
      notify({ type: 'success', text: 'Bank account removed.' });
      await refreshCompanyAccounts();
    } catch (error: any) {
      notify({ type: 'error', text: error?.response?.data?.message || 'Failed to delete bank account.' });
    } finally {
      setDeletingBankId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/80 to-cyan-50/50 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">Company accounting setup</p>
        <p className="text-xs text-slate-600 mt-0.5">
          Add money to the main account and manage starting balances for cash and bank accounts.
        </p>
      </div>

      {!companyId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
          <p className="mt-2 text-sm font-semibold text-amber-900">{emptyMessage}</p>
        </div>
      ) : accountsLoading ? (
        <div className="py-12 flex justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              {
                label: 'Main account',
                value: accountSummary?.main ? formatMoney(accountSummary.main.current_balance, currency) : 'Not set',
                sub: accountSummary?.main ? `${accountSummary.main.account_name || 'Main account'} current balance` : 'Company capital / main ledger',
                icon: Landmark,
                accent: 'from-violet-500 to-purple-600',
              },
              {
                label: 'Cash on hand',
                value: accountSummary?.cash ? formatMoney(accountSummary.cash.current_balance, currency) : 'Not set',
                sub: accountSummary?.cash ? 'Current cash balance' : 'Set starting cash float',
                icon: Coins,
                accent: 'from-emerald-500 to-teal-600',
              },
              {
                label: 'Bank accounts',
                value: String(accountSummary?.bank_count ?? 0),
                sub: formatMoney(totalBankCurrentBalance, currency),
                icon: Wallet,
                accent: 'from-blue-500 to-indigo-600',
              },
              {
                label: 'Total current',
                value: formatMoney(accountSummary?.total_current_balance ?? 0, currency),
                sub: 'Main + cash + bank current balances',
                icon: Building2,
                accent: 'from-cyan-500 to-blue-600',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                      <p className="mt-1 text-lg font-extrabold text-slate-900 truncate">{item.value}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 truncate">{item.sub}</p>
                    </div>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.accent} text-white`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Company User Wallet</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Link or create the company super user wallet profile so that company fund appears when that user logs in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleProvisionCompanyWalletUser()}
                disabled={provisioningCompanyWalletUser || loadingCompanyWalletStatus}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              >
                {provisioningCompanyWalletUser ? 'Provisioning…' : 'Make company wallet user'}
              </button>
            </div>

            {loadingCompanyWalletStatus ? (
              <p className="text-xs text-slate-500">Checking wallet user status…</p>
            ) : companyWalletStatus ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">Wallet No</p>
                  <p className="text-sm font-bold text-slate-900">{companyWalletStatus.wallet_no || '-'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">Company Fund</p>
                  <p className="text-sm font-bold text-emerald-800">{formatMoney(companyWalletStatus.company_fund, currency)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">Login Email</p>
                  <p className="text-sm font-bold text-slate-900 truncate" title={companyWalletStatus.email || '-'}>
                    {companyWalletStatus.email || '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">Status</p>
                  <p className="text-xs font-semibold text-slate-800">
                    {companyWalletStatus.user_exists ? 'User ready' : 'User missing'} |{' '}
                    {companyWalletStatus.is_branch_linked ? 'Branch linked' : 'Branch not linked'} |{' '}
                    {companyWalletStatus.has_super_admin_role ? 'Super role linked' : 'Super role missing'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Wallet user status is unavailable for this company.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5">
            <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-violet-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Main company account</h3>
                  <p className="text-xs text-slate-500">Primary ledger / capital account for the company</p>
                </div>
              </div>
              {accountSummary?.main ? (
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-800">Current main balance</p>
                  <p className="mt-1 text-base font-extrabold text-slate-900">{formatMoney(accountSummary.main.current_balance, currency)}</p>

                  <div className="mt-3 grid grid-cols-1 gap-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className={accountingLabelClass}>Add money amount ({currency})</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={mainTopUpAmount}
                          onChange={(e) => setMainTopUpAmount(e.target.value)}
                          className={accountingInputClass}
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div>
                        <label className={accountingLabelClass}>Top-up note (optional)</label>
                        <input
                          value={mainTopUpNote}
                          onChange={(e) => setMainTopUpNote(e.target.value)}
                          className={accountingInputClass}
                          placeholder="Capital injection / owner deposit"
                        />
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => void handleAddMoneyToMainAccount()}
                        disabled={addingMainMoney}
                        className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-white px-3.5 py-2 text-sm font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" />
                        {addingMainMoney ? 'Adding…' : 'Add money to main account'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                  <p className="text-xs font-semibold text-amber-900">
                    Main account is not available yet. Please contact system admin to provision it.
                  </p>
                </div>
              )}

              {accountSummary?.main ? (
                <div className="rounded-xl border border-violet-100 overflow-x-auto">
                  <table className="min-w-full text-sm text-black">
                    <thead className="bg-violet-50/70 text-[10px] font-bold uppercase tracking-wider text-black">
                      <tr>
                        <th className="px-3 py-2 text-left">Account Name</th>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-right">Opening</th>
                        <th className="px-3 py-2 text-right">Current</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                        <th className="px-3 py-2 text-left">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <tr className="border-t border-violet-100">
                        <td className="px-3 py-2 font-semibold text-black">{accountSummary.main.account_name || '-'}</td>
                        <td className="px-3 py-2 text-black">{accountSummary.main.account_code || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-black">
                          {formatMoney(accountSummary.main.opening_balance, currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-black">
                          {formatMoney(accountSummary.main.current_balance, currency)}
                        </td>
                        <td className="px-3 py-2 text-black max-w-[220px] truncate" title={accountSummary.main.notes || ''}>
                          {accountSummary.main.notes || '-'}
                        </td>
                        <td className="px-3 py-2 text-black">{formatDateTime(accountSummary.main.updated_at)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Bank accounts</h3>
                  <p className="text-xs text-slate-500">Add company bank accounts with opening balances</p>
                </div>
              </div>
              {editingBankId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBankId(null);
                    setBankForm(emptyBankForm());
                  }}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>

            <form onSubmit={handleSaveBankAccount} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-end rounded-xl border border-blue-50 bg-slate-50/60 p-4">
              <div>
                <label className={accountingLabelClass}>Bank name *</label>
                <input
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                  className={accountingInputClass}
                  placeholder="Commercial Bank"
                  required
                />
              </div>
              <div>
                <label className={accountingLabelClass}>Branch</label>
                <input
                  value={bankForm.bank_branch}
                  onChange={(e) => setBankForm({ ...bankForm, bank_branch: e.target.value })}
                  className={accountingInputClass}
                  placeholder="Colombo main"
                />
              </div>
              <div>
                <label className={accountingLabelClass}>Account number</label>
                <input
                  value={bankForm.account_number}
                  onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
                  className={accountingInputClass}
                  placeholder="1234567890"
                />
              </div>
              <div>
                <label className={accountingLabelClass}>Display name</label>
                <input
                  value={bankForm.account_name}
                  onChange={(e) => setBankForm({ ...bankForm, account_name: e.target.value })}
                  className={accountingInputClass}
                  placeholder="Operations current account"
                />
              </div>
              <div>
                <label className={accountingLabelClass}>Opening balance ({currency}) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bankForm.opening_balance}
                  onChange={(e) => setBankForm({ ...bankForm, opening_balance: e.target.value })}
                  className={accountingInputClass}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="md:col-span-2 xl:col-span-1">
                <button
                  type="submit"
                  disabled={savingBankAccount}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {editingBankId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {savingBankAccount ? 'Saving…' : editingBankId ? 'Update bank account' : 'Add bank account'}
                </button>
              </div>
            </form>

            <div className="overflow-x-auto rounded-xl border border-blue-100">
              <table className="min-w-full text-sm text-black">
                <thead className="bg-blue-50/70 text-[10px] font-bold uppercase tracking-wider text-black">
                  <tr>
                    <th className="px-4 py-3 text-left">Bank</th>
                    <th className="px-4 py-3 text-left">Account no</th>
                    <th className="px-4 py-3 text-right">Opening</th>
                    <th className="px-4 py-3 text-right">Current</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50 bg-white text-black">
                  {bankAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-black">
                        No bank accounts added yet.
                      </td>
                    </tr>
                  ) : (
                    bankAccounts.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-50/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-black">{row.bank_name || row.account_name}</p>
                          <p className="text-xs text-black">{row.bank_branch || row.account_name}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-black">{row.account_number || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-black">{formatMoney(row.opening_balance, currency)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-black">{formatMoney(row.current_balance, currency)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditBankAccount(row)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBankAccount(row.id)}
                              disabled={deletingBankId === row.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingBankId === row.id ? '…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <form onSubmit={handleSaveCashAccount} className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Cash account</h3>
                <p className="text-xs text-slate-500">Starting cash float for office collections and payments</p>
              </div>
            </div>
            <div>
              <label className={accountingLabelClass}>Account name</label>
              <input
                value={cashForm.account_name}
                onChange={(e) => setCashForm({ ...cashForm, account_name: e.target.value })}
                className={accountingInputClass}
                placeholder="Cash Account"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={accountingLabelClass}>Account code</label>
                <input
                  value={cashForm.account_code}
                  onChange={(e) => setCashForm({ ...cashForm, account_code: e.target.value })}
                  className={accountingInputClass}
                  placeholder="1100"
                />
              </div>
              <div>
                <label className={accountingLabelClass}>Opening cash amount ({currency}) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashForm.opening_balance}
                  onChange={(e) => setCashForm({ ...cashForm, opening_balance: e.target.value })}
                  className={accountingInputClass}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div>
              <label className={accountingLabelClass}>Notes</label>
              <textarea
                value={cashForm.notes}
                onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
                rows={2}
                className={accountingInputClass}
                placeholder="Optional notes"
              />
            </div>
            <button
              type="submit"
              disabled={savingCashAccount}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingCashAccount ? 'Saving…' : accountSummary?.cash ? 'Update cash balance' : 'Create cash account'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
