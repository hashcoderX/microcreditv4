'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import {
  SAVINGS_ACCOUNT_TYPES,
  SAVINGS_INTEREST_TYPES,
  formatAccountTypeLabel,
  formatInterestTypeLabel,
  type SavingsAccountType,
  type SavingsInterestType,
} from '@/lib/savingsAccountConfig';

type SavingsSettingsApiConfig = {
  minimum_hold_amount: number;
  minimum_opening_deposit: number;
  maximum_daily_withdrawal_amount: number;
  withdrawal_requires_reference: boolean;
  auto_apply_default_interest: boolean;
  allow_early_fixed_deposit_withdrawal: boolean;
  fixed_deposit_lock_months: number;
  interest_posting_frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'maturity';
  default_interest_rates: Record<SavingsAccountType, number>;
  default_interest_types: Record<SavingsAccountType, SavingsInterestType>;
};

type SavingsSettingsFormState = {
  minimum_hold_amount: string;
  minimum_opening_deposit: string;
  maximum_daily_withdrawal_amount: string;
  withdrawal_requires_reference: boolean;
  auto_apply_default_interest: boolean;
  allow_early_fixed_deposit_withdrawal: boolean;
  fixed_deposit_lock_months: string;
  interest_posting_frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'maturity';
  default_interest_rates: Record<SavingsAccountType, string>;
  default_interest_types: Record<SavingsAccountType, SavingsInterestType>;
};

const DEFAULT_FORM: SavingsSettingsFormState = {
  minimum_hold_amount: '0',
  minimum_opening_deposit: '0',
  maximum_daily_withdrawal_amount: '0',
  withdrawal_requires_reference: false,
  auto_apply_default_interest: true,
  allow_early_fixed_deposit_withdrawal: true,
  fixed_deposit_lock_months: '12',
  interest_posting_frequency: 'monthly',
  default_interest_rates: {
    savings: '4.5',
    current: '0',
    fixed_deposit: '10.5',
    investment: '12',
  },
  default_interest_types: {
    savings: 'simple_interest',
    current: 'simple_interest',
    fixed_deposit: 'maturity_payout',
    investment: 'compound_interest',
  },
};

const inputClass =
  'w-full rounded-xl border border-amber-200/80 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200/80 [color-scheme:light]';

const ACCOUNT_TYPES = SAVINGS_ACCOUNT_TYPES.map((row) => row.value as SavingsAccountType);
const INTEREST_TYPE_VALUES = new Set(SAVINGS_INTEREST_TYPES.map((row) => row.value as SavingsInterestType));

function toNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function mapApiToForm(config: SavingsSettingsApiConfig): SavingsSettingsFormState {
  return {
    minimum_hold_amount: String(config.minimum_hold_amount ?? 0),
    minimum_opening_deposit: String(config.minimum_opening_deposit ?? 0),
    maximum_daily_withdrawal_amount: String(config.maximum_daily_withdrawal_amount ?? 0),
    withdrawal_requires_reference: Boolean(config.withdrawal_requires_reference),
    auto_apply_default_interest: Boolean(config.auto_apply_default_interest),
    allow_early_fixed_deposit_withdrawal: Boolean(config.allow_early_fixed_deposit_withdrawal),
    fixed_deposit_lock_months: String(config.fixed_deposit_lock_months ?? 0),
    interest_posting_frequency: config.interest_posting_frequency || 'monthly',
    default_interest_rates: {
      savings: String(config.default_interest_rates?.savings ?? 0),
      current: String(config.default_interest_rates?.current ?? 0),
      fixed_deposit: String(config.default_interest_rates?.fixed_deposit ?? 0),
      investment: String(config.default_interest_rates?.investment ?? 0),
    },
    default_interest_types: {
      savings: (config.default_interest_types?.savings || 'simple_interest') as SavingsInterestType,
      current: (config.default_interest_types?.current || 'simple_interest') as SavingsInterestType,
      fixed_deposit: (config.default_interest_types?.fixed_deposit || 'maturity_payout') as SavingsInterestType,
      investment: (config.default_interest_types?.investment || 'compound_interest') as SavingsInterestType,
    },
  };
}

export default function SavingsSettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SavingsSettingsFormState>(DEFAULT_FORM);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }

    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadSettings = async () => {
      setLoading(true);
      setNotice(null);
      try {
        const response = await axios.get('/api/system/savings-deposits-settings', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const config = response.data?.config;
        if (config && typeof config === 'object') {
          setForm(mapApiToForm(config as SavingsSettingsApiConfig));
        } else {
          setForm(DEFAULT_FORM);
        }
      } catch (error: any) {
        setNotice({
          type: 'error',
          text: error?.response?.data?.message || 'Failed to load savings settings.',
        });
      } finally {
        setLoading(false);
      }
    };

    void loadSettings();
  }, [token]);

  const frequencyLabel = useMemo(() => {
    if (form.interest_posting_frequency === 'semi_annual') return 'Semi Annual';
    return form.interest_posting_frequency.charAt(0).toUpperCase() + form.interest_posting_frequency.slice(1);
  }, [form.interest_posting_frequency]);

  const updateRate = (accountType: SavingsAccountType, value: string) => {
    setForm((prev) => ({
      ...prev,
      default_interest_rates: {
        ...prev.default_interest_rates,
        [accountType]: value,
      },
    }));
  };

  const updateType = (accountType: SavingsAccountType, value: string) => {
    const normalized = value as SavingsInterestType;
    if (!INTEREST_TYPE_VALUES.has(normalized)) return;

    setForm((prev) => ({
      ...prev,
      default_interest_types: {
        ...prev.default_interest_types,
        [accountType]: normalized,
      },
    }));
  };

  const saveSettings = async () => {
    if (!token) return;

    setSaving(true);
    setNotice(null);

    const payload = {
      minimum_hold_amount: Math.max(toNumber(form.minimum_hold_amount), 0),
      minimum_opening_deposit: Math.max(toNumber(form.minimum_opening_deposit), 0),
      maximum_daily_withdrawal_amount: Math.max(toNumber(form.maximum_daily_withdrawal_amount), 0),
      withdrawal_requires_reference: Boolean(form.withdrawal_requires_reference),
      auto_apply_default_interest: Boolean(form.auto_apply_default_interest),
      allow_early_fixed_deposit_withdrawal: Boolean(form.allow_early_fixed_deposit_withdrawal),
      fixed_deposit_lock_months: Math.max(Math.round(toNumber(form.fixed_deposit_lock_months)), 0),
      interest_posting_frequency: form.interest_posting_frequency,
      default_interest_rates: {
        savings: Math.max(toNumber(form.default_interest_rates.savings), 0),
        current: Math.max(toNumber(form.default_interest_rates.current), 0),
        fixed_deposit: Math.max(toNumber(form.default_interest_rates.fixed_deposit), 0),
        investment: Math.max(toNumber(form.default_interest_rates.investment), 0),
      },
      default_interest_types: {
        savings: form.default_interest_types.savings,
        current: form.default_interest_types.current,
        fixed_deposit: form.default_interest_types.fixed_deposit,
        investment: form.default_interest_types.investment,
      },
    };

    try {
      const response = await axios.post('/api/system/savings-deposits-settings', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const config = response.data?.config;
      if (config && typeof config === 'object') {
        setForm(mapApiToForm(config as SavingsSettingsApiConfig));
      }

      setNotice({ type: 'success', text: response.data?.message || 'Savings settings saved.' });
    } catch (error: any) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || 'Failed to save savings settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
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

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <div className="rounded-3xl border border-white/80 bg-white/90 shadow-lg p-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Bank Operations</p>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">Savings Settings Workspace</h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Control hold amount, default interest rates, withdrawal policy, and fixed deposit lock rules from one place.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => router.push('/dashboard/savings-deposits')}
              className="px-4 py-2 rounded-xl bg-white border border-amber-200 text-amber-800 text-sm font-semibold inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-70"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {notice ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-amber-100 bg-white/90 p-5">
            <h2 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Withdrawal Controls
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Minimum Hold Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimum_hold_amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, minimum_hold_amount: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Maximum Daily Withdrawal Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maximum_daily_withdrawal_amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, maximum_daily_withdrawal_amount: e.target.value }))}
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-500 mt-1">Set 0 for no daily limit.</p>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">Withdrawal requires reference number</span>
                <input
                  type="checkbox"
                  checked={form.withdrawal_requires_reference}
                  onChange={(e) => setForm((prev) => ({ ...prev, withdrawal_requires_reference: e.target.checked }))}
                  className="h-4 w-4"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-100 bg-white/90 p-5">
            <h2 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-amber-600" />
              Account Opening Rules
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Minimum Opening Deposit</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimum_opening_deposit}
                  onChange={(e) => setForm((prev) => ({ ...prev, minimum_opening_deposit: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Fixed Deposit Lock Months</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.fixed_deposit_lock_months}
                  onChange={(e) => setForm((prev) => ({ ...prev, fixed_deposit_lock_months: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <label className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">Allow early fixed deposit withdrawal</span>
                <input
                  type="checkbox"
                  checked={form.allow_early_fixed_deposit_withdrawal}
                  onChange={(e) => setForm((prev) => ({ ...prev, allow_early_fixed_deposit_withdrawal: e.target.checked }))}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">Auto apply default interest on account creation</span>
                <input
                  type="checkbox"
                  checked={form.auto_apply_default_interest}
                  onChange={(e) => setForm((prev) => ({ ...prev, auto_apply_default_interest: e.target.checked }))}
                  className="h-4 w-4"
                />
              </label>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Interest Posting Frequency</label>
                <select
                  value={form.interest_posting_frequency}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      interest_posting_frequency: e.target.value as SavingsSettingsFormState['interest_posting_frequency'],
                    }))
                  }
                  className={inputClass}
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi_annual">Semi Annual</option>
                  <option value="annual">Annual</option>
                  <option value="maturity">On Maturity</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">Current: {frequencyLabel}</p>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-amber-100 bg-white/90 p-5">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Default Interest Matrix</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ACCOUNT_TYPES.map((accountType) => (
              <div key={accountType} className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                <p className="text-sm font-bold text-slate-900">{formatAccountTypeLabel(accountType)}</p>

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Default Interest Rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.default_interest_rates[accountType]}
                      onChange={(e) => updateRate(accountType, e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Default Interest Type</label>
                    <select
                      value={form.default_interest_types[accountType]}
                      onChange={(e) => updateType(accountType, e.target.value)}
                      className={inputClass}
                    >
                      {SAVINGS_INTEREST_TYPES.map((interestType) => (
                        <option key={`${accountType}-${interestType.value}`} value={interestType.value}>
                          {formatInterestTypeLabel(interestType.value)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
