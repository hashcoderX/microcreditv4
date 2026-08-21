'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, CheckCircle2, RefreshCcw } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type PendingDeposit = {
  id: number;
  amount?: number;
  deposit_date?: string;
  note?: string | null;
  created_at?: string;
  employee?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    employee_code?: string;
    wallet?: {
      wallet_no?: string;
      current_balance?: number;
    } | null;
  } | null;
  bank_account?: {
    id?: number;
    account_name?: string;
    bank_name?: string;
    account_number?: string;
    current_balance?: number;
  } | null;
};

type PendingHandover = {
  id: number;
  branch_id?: number;
  amount?: number;
  handover_date?: string;
  note?: string | null;
  received_by?: string | null;
  created_at?: string;
  employee?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    employee_code?: string;
    wallet?: {
      wallet_no?: string;
      current_balance?: number;
    } | null;
  } | null;
  manager_employee?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    employee_code?: string;
    wallet?: {
      wallet_no?: string;
      current_balance?: number;
    } | null;
  } | null;
  cash_account?: {
    id?: number;
    account_name?: string;
    bank_name?: string;
    account_number?: string;
    current_balance?: number;
  } | null;
  branch_cash_transferred_at?: string | null;
};

type BranchTarget = {
  id: number;
  name: string;
};

const formatLkr = (value: number) =>
  `LKR ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function PaymentReceivePage() {
  const router = useRouter();
  const apiBaseUrl = getApiBaseUrl();
  const widgetPrefix = 'accounting_payment_receive_widget_';

  const [token] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deposits, setDeposits] = useState<PendingDeposit[]>([]);
  const [handovers, setHandovers] = useState<PendingHandover[]>([]);
  const [acceptedHandovers, setAcceptedHandovers] = useState<PendingHandover[]>([]);
  const [transferredHandovers, setTransferredHandovers] = useState<PendingHandover[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState('');
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedTransferRow, setSelectedTransferRow] = useState<PendingHandover | null>(null);
  const [branchTargets, setBranchTargets] = useState<BranchTarget[]>([]);
  const [loadingTransferTargets, setLoadingTransferTargets] = useState(false);
  const [targetBranchId, setTargetBranchId] = useState<number | null>(null);
  const [targetAccountType, setTargetAccountType] = useState<'cash' | 'main'>('cash');
  const [targetAccountPreview, setTargetAccountPreview] = useState<{
    branchName: string;
    cashBalance: number;
    mainBalance: number;
  } | null>(null);
  const [branchTransferSourceBranchId, setBranchTransferSourceBranchId] = useState<number | null>(null);
  const [branchTransferTargetBranchId, setBranchTransferTargetBranchId] = useState<number | null>(null);
  const [branchTransferSourceAccountType, setBranchTransferSourceAccountType] = useState<'cash' | 'main'>('cash');
  const [branchTransferTargetAccountType, setBranchTransferTargetAccountType] = useState<'cash' | 'main'>('cash');
  const [branchTransferAmount, setBranchTransferAmount] = useState('');
  const [branchTransferLoading, setBranchTransferLoading] = useState(false);
  const [sourceBranchBalancePreview, setSourceBranchBalancePreview] = useState<{ cash: number; main: number } | null>(null);
  const [targetBranchBalancePreview, setTargetBranchBalancePreview] = useState<{ cash: number; main: number } | null>(null);

  useEffect(() => {
    if (!token) {
      router.push('/');
    }
  }, [router, token]);

  const loadPending = useCallback(async (authToken: string, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const response = await axios.get(`${apiBaseUrl}/hr/wallet/pending-transactions`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setDeposits(Array.isArray(response.data?.deposits) ? (response.data.deposits as PendingDeposit[]) : []);
      setHandovers(Array.isArray(response.data?.handovers) ? (response.data.handovers as PendingHandover[]) : []);
      setAcceptedHandovers(
        Array.isArray(response.data?.accepted_handovers)
          ? (response.data.accepted_handovers as PendingHandover[])
          : []
      );
      setTransferredHandovers(
        Array.isArray(response.data?.transferred_handovers)
          ? (response.data.transferred_handovers as PendingHandover[])
          : []
      );
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to load pending wallet transactions.';
      setNotice({ type: 'error', message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!token) return;
    void loadPending(token);
  }, [token, loadPending]);

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${apiBaseUrl}/dashboard/widgets`, {
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
  }, [apiBaseUrl]);

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean) => {
      if (!token) return;
      const normalizedKey = String(widgetKey || '').trim();
      if (!normalizedKey || normalizedKey.length > 120) {
        setWidgetNotice('Failed to save widget preference.');
        return;
      }
      try {
        await axios.patch(
          `${apiBaseUrl}/dashboard/widgets`,
          { widget_key: normalizedKey, is_visible: Boolean(isVisible) },
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
    [apiBaseUrl, token]
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

  const approveTransaction = async (type: 'deposit' | 'handover', id: number) => {
    if (!token) return;

    const key = `${type}-${id}`;
    try {
      setBusyKey(key);
      setNotice(null);

      const response = await axios.post(
        `${apiBaseUrl}/hr/wallet/pending-transactions/${type}/${id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNotice({ type: 'success', message: response.data?.message || 'Transaction approved successfully.' });
      await loadPending(token, true);
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to approve pending transaction.';
      setNotice({ type: 'error', message });
    } finally {
      setBusyKey(null);
    }
  };

  const transferAcceptedHandover = async (
    id: number,
    options?: { targetBranchId?: number; targetAccountType?: 'cash' | 'main' }
  ) => {
    if (!token) return;

    const isOtherBranchTransfer = Number(options?.targetBranchId || 0) > 0;
    const key = isOtherBranchTransfer ? `transfer-other-${id}` : `transfer-${id}`;
    try {
      setBusyKey(key);
      setNotice(null);

      const payload: { target_branch_id?: number; target_account_type?: 'cash' | 'main' } = {};
      if (options?.targetBranchId) {
        payload.target_branch_id = options.targetBranchId;
      }
      if (options?.targetAccountType) {
        payload.target_account_type = options.targetAccountType;
      }

      const response = await axios.post(
        `${apiBaseUrl}/hr/wallet/accepted-handovers/${id}/transfer-cash`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNotice({
        type: 'success',
        message: response.data?.message || 'Accepted handover transferred to branch cash account.',
      });
      await loadPending(token, true);
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to transfer accepted handover to branch cash account.';
      setNotice({ type: 'error', message });
    } finally {
      setBusyKey(null);
    }
  };

  const loadBranchTargets = useCallback(async (): Promise<BranchTarget[]> => {
    if (!token) return [];

    setLoadingTransferTargets(true);
    try {
      const response = await axios.get(`${apiBaseUrl}/companies`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const rows = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      const mapped: BranchTarget[] = rows
        .map((row: { id?: unknown; name?: unknown }) => ({
          id: Number(row?.id || 0),
          name: String(row?.name || '').trim(),
        }))
        .filter((row: BranchTarget) => row.id > 0 && row.name !== '');

      setBranchTargets(mapped);
      return mapped;
    } catch {
      setBranchTargets([]);
      setNotice({ type: 'error', message: 'Failed to load branch list for transfer.' });
      return [];
    } finally {
      setLoadingTransferTargets(false);
    }
  }, [apiBaseUrl, token]);

  useEffect(() => {
    if (!token) return;
    void loadBranchTargets();
  }, [token, loadBranchTargets]);

  const openTransferToOtherBranch = async (row: PendingHandover) => {
    setSelectedTransferRow(row);
    setTargetAccountType('cash');
    setTargetAccountPreview(null);

    const loadedTargets = branchTargets.length === 0 ? await loadBranchTargets() : branchTargets;

    const sourceBranchId = Number(row.branch_id || 0);
    const availableTargets = loadedTargets.filter((b) => b.id !== sourceBranchId);
    if (availableTargets.length > 0) {
      setTargetBranchId(availableTargets[0].id);
    } else {
      setTargetBranchId(null);
    }

    setTransferModalOpen(true);
  };

  useEffect(() => {
    if (branchTargets.length === 0) {
      setBranchTransferSourceBranchId(null);
      setBranchTransferTargetBranchId(null);
      return;
    }

    setBranchTransferSourceBranchId((current) => {
      if (current && branchTargets.some((row) => row.id === current)) {
        return current;
      }
      return branchTargets[0].id;
    });

    setBranchTransferTargetBranchId((current) => {
      if (current && branchTargets.some((row) => row.id === current)) {
        return current;
      }
      return branchTargets.length > 1 ? branchTargets[1].id : null;
    });
  }, [branchTargets]);

  const loadBranchBalancePreview = useCallback(
    async (branchId: number, setPreview: (value: { cash: number; main: number } | null) => void) => {
      if (!token || !branchId) {
        setPreview(null);
        return;
      }

      try {
        const response = await axios.get(`${apiBaseUrl}/companies/${branchId}/accounts`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const summary = response.data?.summary || {};
        setPreview({
          cash: Number(summary?.cash?.current_balance || 0),
          main: Number(summary?.main?.current_balance || 0),
        });
      } catch {
        setPreview(null);
      }
    },
    [apiBaseUrl, token]
  );

  useEffect(() => {
    if (!branchTransferSourceBranchId) {
      setSourceBranchBalancePreview(null);
      return;
    }
    void loadBranchBalancePreview(branchTransferSourceBranchId, setSourceBranchBalancePreview);
  }, [branchTransferSourceBranchId, loadBranchBalancePreview]);

  useEffect(() => {
    if (!branchTransferTargetBranchId) {
      setTargetBranchBalancePreview(null);
      return;
    }
    void loadBranchBalancePreview(branchTransferTargetBranchId, setTargetBranchBalancePreview);
  }, [branchTransferTargetBranchId, loadBranchBalancePreview]);

  const submitBranchFundTransfer = async () => {
    if (!token) return;

    const sourceBranchId = Number(branchTransferSourceBranchId || 0);
    const targetBranchId = Number(branchTransferTargetBranchId || 0);
    const amount = Number(branchTransferAmount || 0);

    if (!sourceBranchId || !targetBranchId) {
      setNotice({ type: 'error', message: 'Select source and target branches.' });
      return;
    }

    if (sourceBranchId === targetBranchId) {
      setNotice({ type: 'error', message: 'Source and target branches must be different.' });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ type: 'error', message: 'Enter a valid transfer amount greater than zero.' });
      return;
    }

    try {
      setBranchTransferLoading(true);
      setNotice(null);

      const response = await axios.post(
        `${apiBaseUrl}/companies/${sourceBranchId}/accounts/transfer-to-branch`,
        {
          target_branch_id: targetBranchId,
          amount,
          source_account_type: branchTransferSourceAccountType,
          target_account_type: branchTransferTargetAccountType,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      setBranchTransferAmount('');
      setNotice({
        type: 'success',
        message: response.data?.message || 'Funds transferred to target branch successfully.',
      });

      await Promise.all([
        loadBranchBalancePreview(sourceBranchId, setSourceBranchBalancePreview),
        loadBranchBalancePreview(targetBranchId, setTargetBranchBalancePreview),
      ]);
    } catch (error) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to transfer funds to target branch.';
      setNotice({ type: 'error', message });
    } finally {
      setBranchTransferLoading(false);
    }
  };

  useEffect(() => {
    if (!transferModalOpen || !token || !targetBranchId) {
      setTargetAccountPreview(null);
      return;
    }

    let cancelled = false;

    const fetchBranchAccountPreview = async () => {
      try {
        const response = await axios.get(`${apiBaseUrl}/companies/${targetBranchId}/accounts`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (cancelled) return;

        const summary = response.data?.summary || {};
        const selectedBranchName =
          branchTargets.find((row) => row.id === targetBranchId)?.name || `Branch #${targetBranchId}`;

        setTargetAccountPreview({
          branchName: selectedBranchName,
          cashBalance: Number(summary?.cash?.current_balance || 0),
          mainBalance: Number(summary?.main?.current_balance || 0),
        });
      } catch {
        if (!cancelled) {
          setTargetAccountPreview(null);
        }
      }
    };

    void fetchBranchAccountPreview();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, branchTargets, targetBranchId, token, transferModalOpen]);

  const submitOtherBranchTransfer = async () => {
    if (!selectedTransferRow || !targetBranchId) return;

    await transferAcceptedHandover(selectedTransferRow.id, {
      targetBranchId,
      targetAccountType,
    });

    setTransferModalOpen(false);
    setSelectedTransferRow(null);
    setTargetBranchId(null);
    setTargetAccountPreview(null);
  };

  const openOtherBranchTransferFromSection = async () => {
    if (acceptedHandovers.length === 0) {
      setNotice({
        type: 'error',
        message: 'No accepted handovers available. Accept a pending handover first, then transfer to another branch.',
      });
      return;
    }

    await openTransferToOtherBranch(acceptedHandovers[0]);
  };

  const stats = useMemo(() => ({
    deposits: deposits.length,
    handovers: handovers.length,
    acceptedHandovers: acceptedHandovers.length,
    transferredHandovers: transferredHandovers.length,
    total: deposits.length + handovers.length,
  }), [deposits.length, handovers.length, acceptedHandovers.length, transferredHandovers.length]);
  const statCards = [
    { key: 'pending_deposits', label: 'Pending Deposits', value: stats.deposits, border: 'border-amber-100', tone: 'text-amber-700' },
    { key: 'pending_handovers', label: 'Pending Handovers', value: stats.handovers, border: 'border-orange-100', tone: 'text-orange-700' },
    { key: 'total_pending', label: 'Total Pending', value: stats.total, border: 'border-yellow-100', tone: 'text-yellow-700' },
    { key: 'accepted_handovers', label: 'Accepted Handovers', value: stats.acceptedHandovers, border: 'border-sky-100', tone: 'text-sky-700' },
    { key: 'transferred_history', label: 'Transferred History', value: stats.transferredHandovers, border: 'border-indigo-100', tone: 'text-indigo-700' },
  ];
  const showHeaderWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}header`);
  const showStatsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}stats`);
  const showNoticeWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}notice`);
  const showPendingDepositsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}pending_deposits`);
  const showPendingHandoversWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}pending_handovers`);
  const showAcceptedWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}accepted_handovers`);
  const showTransferredWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}transferred_history`);
  const showBranchFundTransferWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}branch_fund_transfer`);
  const visibleStatCards = statCards.filter((card) => !hiddenWidgetKeys.includes(`${widgetPrefix}stat_${card.key}`));
  const showAnyWidget =
    showHeaderWidget ||
    showStatsWidget ||
    showNoticeWidget ||
    showPendingDepositsWidget ||
    showPendingHandoversWidget ||
    showAcceptedWidget ||
    showTransferredWidget ||
    showBranchFundTransferWidget;

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {widgetNotice ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {widgetNotice}
          </section>
        ) : null}

        {!showAnyWidget ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-semibold text-amber-900">
            All widgets are currently hidden. Use `Restore Hidden Widgets` from the main dashboard to show them again.
          </section>
        ) : null}

        {showHeaderWidget ? (
        <section className="relative rounded-3xl border border-amber-100 bg-white/90 p-6 shadow-sm">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
              aria-label="Hide payment receive header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Accounting Approval Desk</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900">Payment Receive and Transfer</h1>
              <p className="mt-1 text-sm text-slate-600">
                Review pending wallet transactions, accept payments, then transfer accepted handovers to branch cash account.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard/accounting')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Accounting
              </button>
              <button
                type="button"
                onClick={() => void loadPending(token, true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </section>
        ) : null}

        {showStatsWidget ? (
          <section className="relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}stats`)}
                className="absolute right-2 -top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                aria-label="Hide payment receive stats widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            {visibleStatCards.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {visibleStatCards.map((card) => (
                  <div key={card.key} className={`relative rounded-2xl border ${card.border} bg-white p-4`}>
                    <WidgetCloseGate>
                      <button
                        type="button"
                        onClick={() => void hideWidget(`${widgetPrefix}stat_${card.key}`)}
                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                        aria-label={`Hide ${card.label} stat widget`}
                      >
                        ×
                      </button>
                    </WidgetCloseGate>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${card.tone}`}>{card.label}</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-900">
                All payment stats are hidden.
              </div>
            )}
          </section>
        ) : null}

        {notice && showNoticeWidget ? (
          <section className={`relative rounded-2xl border p-4 ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}notice`)}
                className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-current/20 bg-white/70 text-current hover:bg-white"
                aria-label="Hide notice widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <p className="text-sm font-semibold">{notice.message}</p>
          </section>
        ) : null}

        {showPendingDepositsWidget ? (
        <section className="relative rounded-3xl border border-emerald-100 bg-white/90 p-5 shadow-sm">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}pending_deposits`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              aria-label="Hide pending deposits widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <h2 className="text-lg font-bold text-slate-900">Pending Wallet Deposits</h2>
          {deposits.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No pending deposit requests.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-left text-slate-700">
                <thead className="bg-emerald-50 text-emerald-800">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Collection Officer</th>
                    <th className="px-4 py-2 font-semibold">Officer Wallet</th>
                    <th className="px-4 py-2 font-semibold">Branch Bank Account</th>
                    <th className="px-4 py-2 font-semibold">Bank Balance</th>
                    <th className="px-4 py-2 font-semibold text-right">Amount</th>
                    <th className="px-4 py-2 font-semibold">Note</th>
                    <th className="px-4 py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((row) => {
                    const rowKey = `deposit-${row.id}`;
                    return (
                      <tr key={row.id} className="border-t border-emerald-100">
                        <td className="px-4 py-3">{formatDate(row.deposit_date || row.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{`${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() || '-'}</div>
                          <div className="text-xs text-slate-500">{row.employee?.employee_code || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.employee?.wallet?.wallet_no || '-'}</div>
                          <div className="text-xs text-slate-500">Balance: {formatLkr(Number(row.employee?.wallet?.current_balance || 0))}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.bank_account?.account_name || '-'}</div>
                          <div className="text-xs text-slate-500">{row.bank_account?.bank_name || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{formatLkr(Number(row.bank_account?.current_balance || 0))}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                        <td className="px-4 py-3 text-slate-600">{row.note || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void approveTransaction('deposit', row.id)}
                            disabled={busyKey === rowKey}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {busyKey === rowKey ? 'Accepting...' : 'Accept'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}

        {showPendingHandoversWidget ? (
        <section className="relative rounded-3xl border border-orange-100 bg-white/90 p-5 shadow-sm">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}pending_handovers`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
              aria-label="Hide pending handovers widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <h2 className="text-lg font-bold text-slate-900">Pending Cash Handovers</h2>
          {handovers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No pending cash handover requests.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-left text-slate-700">
                <thead className="bg-orange-50 text-orange-800">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Collection Officer</th>
                    <th className="px-4 py-2 font-semibold">Officer Wallet</th>
                    <th className="px-4 py-2 font-semibold">Target Manager</th>
                    <th className="px-4 py-2 font-semibold">Manager Wallet</th>
                    <th className="px-4 py-2 font-semibold">Branch Account</th>
                    <th className="px-4 py-2 font-semibold">Branch Account Balance</th>
                    <th className="px-4 py-2 font-semibold text-right">Amount</th>
                    <th className="px-4 py-2 font-semibold">Note</th>
                    <th className="px-4 py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {handovers.map((row) => {
                    const rowKey = `handover-${row.id}`;
                    return (
                      <tr key={row.id} className="border-t border-orange-100">
                        <td className="px-4 py-3">{formatDate(row.handover_date || row.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{`${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() || '-'}</div>
                          <div className="text-xs text-slate-500">{row.employee?.employee_code || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.employee?.wallet?.wallet_no || '-'}</div>
                          <div className="text-xs text-slate-500">Balance: {formatLkr(Number(row.employee?.wallet?.current_balance || 0))}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{`${row.manager_employee?.first_name || ''} ${row.manager_employee?.last_name || ''}`.trim() || '-'}</div>
                          <div className="text-xs text-slate-500">{row.manager_employee?.employee_code || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.manager_employee?.wallet?.wallet_no || '-'}</div>
                          <div className="text-xs text-slate-500">Balance: {formatLkr(Number(row.manager_employee?.wallet?.current_balance || 0))}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.cash_account?.account_name || '-'}</div>
                          <div className="text-xs text-slate-500">{row.cash_account?.bank_name || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{formatLkr(Number(row.cash_account?.current_balance || 0))}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                        <td className="px-4 py-3 text-slate-600">{row.note || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void approveTransaction('handover', row.id)}
                            disabled={busyKey === rowKey}
                            className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {busyKey === rowKey ? 'Accepting...' : 'Accept'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}

        {showAcceptedWidget ? (
        <section className="relative rounded-3xl border border-sky-100 bg-white/90 p-5 shadow-sm">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}accepted_handovers`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
              aria-label="Hide accepted handovers widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-slate-900">Accepted Payments (After Pending Cash Handovers)</h2>
            <button
              type="button"
              onClick={() => void openOtherBranchTransferFromSection()}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Transfer to Other Branch
            </button>
          </div>
          {acceptedHandovers.length === 0 ? (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-slate-500">No accepted handovers waiting for transfer.</p>
              <p className="text-xs text-slate-400">
                Tip: approve a pending cash handover first to enable branch-to-branch transfer.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-left text-slate-700">
                <thead className="bg-sky-50 text-sky-800">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Accepted Date</th>
                    <th className="px-4 py-2 font-semibold">Collection Officer</th>
                    <th className="px-4 py-2 font-semibold">Manager Wallet</th>
                    <th className="px-4 py-2 font-semibold">Branch Cash Account</th>
                    <th className="px-4 py-2 font-semibold text-right">Amount</th>
                    <th className="px-4 py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptedHandovers.map((row) => {
                    const rowKey = `transfer-${row.id}`;
                    return (
                      <tr key={row.id} className="border-t border-sky-100">
                        <td className="px-4 py-3">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{`${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() || '-'}</div>
                          <div className="text-xs text-slate-500">{row.employee?.employee_code || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.manager_employee?.wallet?.wallet_no || '-'}</div>
                          <div className="text-xs text-slate-500">Balance: {formatLkr(Number(row.manager_employee?.wallet?.current_balance || 0))}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.cash_account?.account_name || '-'}</div>
                          <div className="text-xs text-slate-500">Balance: {formatLkr(Number(row.cash_account?.current_balance || 0))}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => void transferAcceptedHandover(row.id)}
                              disabled={busyKey === rowKey}
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {busyKey === rowKey ? 'Transferring...' : 'Transfer to Branch Cash Account'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void openTransferToOtherBranch(row)}
                              disabled={busyKey === `transfer-other-${row.id}` || loadingTransferTargets}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                            >
                              {busyKey === `transfer-other-${row.id}` ? 'Transferring...' : 'Transfer to Other Branch'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}

        {showTransferredWidget ? (
        <section className="relative rounded-3xl border border-indigo-100 bg-white/90 p-5 shadow-sm">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}transferred_history`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
              aria-label="Hide transferred history widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <h2 className="text-lg font-bold text-slate-900">Transferred History</h2>
          {transferredHandovers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No transferred handovers yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-left text-slate-700">
                <thead className="bg-indigo-50 text-indigo-800">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Transferred Date</th>
                    <th className="px-4 py-2 font-semibold">Collection Officer</th>
                    <th className="px-4 py-2 font-semibold">Target Manager</th>
                    <th className="px-4 py-2 font-semibold">Branch Cash Account</th>
                    <th className="px-4 py-2 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transferredHandovers.map((row) => (
                    <tr key={row.id} className="border-t border-indigo-100">
                      <td className="px-4 py-3">{formatDate(row.branch_cash_transferred_at || row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{`${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() || '-'}</div>
                        <div className="text-xs text-slate-500">{row.employee?.employee_code || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{`${row.manager_employee?.first_name || ''} ${row.manager_employee?.last_name || ''}`.trim() || '-'}</div>
                        <div className="text-xs text-slate-500">{row.manager_employee?.employee_code || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{row.cash_account?.account_name || '-'}</div>
                        <div className="text-xs text-slate-500">{row.cash_account?.bank_name || ''}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}

        {showBranchFundTransferWidget ? (
        <section className="relative rounded-3xl border border-indigo-100 bg-white/90 p-5 shadow-sm">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}branch_fund_transfer`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
              aria-label="Hide branch fund transfer widget"
            >
              ×
            </button>
          </WidgetCloseGate>

          <h2 className="text-lg font-bold text-slate-900">Transfer Funds to Other Branches</h2>
          <p className="mt-1 text-sm text-slate-600">
            Transfer from source branch main/cash account to target branch account.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Source Branch</label>
              <select
                value={branchTransferSourceBranchId ?? ''}
                onChange={(e) => setBranchTransferSourceBranchId(Number(e.target.value) || null)}
                className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                <option value="">Select source branch</option>
                {branchTargets.map((row) => (
                  <option key={`source-${row.id}`} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Target Branch</label>
              <select
                value={branchTransferTargetBranchId ?? ''}
                onChange={(e) => setBranchTransferTargetBranchId(Number(e.target.value) || null)}
                className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                <option value="">Select target branch</option>
                {branchTargets
                  .filter((row) => row.id !== Number(branchTransferSourceBranchId || 0))
                  .map((row) => (
                    <option key={`target-${row.id}`} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Source Account Type</label>
              <select
                value={branchTransferSourceAccountType}
                onChange={(e) => setBranchTransferSourceAccountType(e.target.value === 'main' ? 'main' : 'cash')}
                className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                <option value="cash">Cash Account</option>
                <option value="main">Main Account</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Target Account Type</label>
              <select
                value={branchTransferTargetAccountType}
                onChange={(e) => setBranchTransferTargetAccountType(e.target.value === 'main' ? 'main' : 'cash')}
                className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                <option value="cash">Cash Account</option>
                <option value="main">Main Account</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Transfer Amount (LKR)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={branchTransferAmount}
                onChange={(e) => setBranchTransferAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              />
            </div>
          </div>

          {(sourceBranchBalancePreview || targetBranchBalancePreview) ? (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900">
                <p className="font-semibold">Source branch balances</p>
                <p className="mt-1">Cash: {formatLkr(Number(sourceBranchBalancePreview?.cash || 0))}</p>
                <p>Main: {formatLkr(Number(sourceBranchBalancePreview?.main || 0))}</p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900">
                <p className="font-semibold">Target branch balances</p>
                <p className="mt-1">Cash: {formatLkr(Number(targetBranchBalancePreview?.cash || 0))}</p>
                <p>Main: {formatLkr(Number(targetBranchBalancePreview?.main || 0))}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => void submitBranchFundTransfer()}
              disabled={branchTransferLoading || !branchTransferSourceBranchId || !branchTransferTargetBranchId}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {branchTransferLoading ? 'Transferring...' : 'Transfer Funds'}
            </button>
          </div>
        </section>
        ) : null}

        {transferModalOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => {
                if (busyKey === `transfer-other-${selectedTransferRow?.id || 0}`) return;
                setTransferModalOpen(false);
                setSelectedTransferRow(null);
                setTargetBranchId(null);
                setTargetAccountPreview(null);
              }}
            />
            <div className="relative w-full max-w-xl rounded-2xl border border-indigo-100 bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900">Transfer to Other Branch</h3>
              <p className="mt-1 text-sm text-slate-600">
                Move accepted handover funds from manager wallet into another branch account.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-semibold">Amount:</span>{' '}
                  {formatLkr(Number(selectedTransferRow?.amount || 0))}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Target Branch</label>
                  <select
                    value={targetBranchId ?? ''}
                    onChange={(e) => setTargetBranchId(Number(e.target.value) || null)}
                    className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                  >
                    <option value="">Select target branch</option>
                    {branchTargets
                      .filter((row) => row.id !== Number(selectedTransferRow?.branch_id || 0))
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Destination Account Type</label>
                  <select
                    value={targetAccountType}
                    onChange={(e) => setTargetAccountType(e.target.value === 'main' ? 'main' : 'cash')}
                    className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                  >
                    <option value="cash">Cash Account</option>
                    <option value="main">Main Account</option>
                  </select>
                </div>

                {targetAccountPreview ? (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
                    <p className="font-semibold">Current balances in {targetAccountPreview.branchName}</p>
                    <p className="mt-1">Cash: {formatLkr(targetAccountPreview.cashBalance)}</p>
                    <p>Main: {formatLkr(targetAccountPreview.mainBalance)}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTransferModalOpen(false);
                    setSelectedTransferRow(null);
                    setTargetBranchId(null);
                    setTargetAccountPreview(null);
                  }}
                  disabled={busyKey === `transfer-other-${selectedTransferRow?.id || 0}`}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitOtherBranchTransfer()}
                  disabled={!targetBranchId || busyKey === `transfer-other-${selectedTransferRow?.id || 0}`}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {busyKey === `transfer-other-${selectedTransferRow?.id || 0}`
                    ? 'Transferring...'
                    : 'Confirm Transfer'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
