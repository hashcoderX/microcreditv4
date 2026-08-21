export type CompanyAccountType = 'main' | 'cash' | 'bank';

export type CompanyAccount = {
  id: number;
  company_id: number;
  account_type: CompanyAccountType;
  account_name: string;
  account_code?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  account_number?: string | null;
  opening_balance?: number | string | null;
  current_balance?: number | string | null;
  is_active?: boolean;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AccountingSummary = {
  main: CompanyAccount | null;
  cash: CompanyAccount | null;
  banks: CompanyAccount[];
  bank_count: number;
  total_opening_balance: number;
  total_current_balance: number;
};

export type AccountFormState = {
  account_name: string;
  account_code: string;
  opening_balance: string;
  notes: string;
};

export type BankFormState = AccountFormState & {
  bank_name: string;
  bank_branch: string;
  account_number: string;
};

export type AccountingCompany = {
  id: number;
  name: string;
  currency?: string | null;
};

export const emptyAccountForm = (): AccountFormState => ({
  account_name: '',
  account_code: '',
  opening_balance: '',
  notes: '',
});

export const emptyBankForm = (): BankFormState => ({
  ...emptyAccountForm(),
  bank_name: '',
  bank_branch: '',
  account_number: '',
});

export function toAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: unknown, currency = 'LKR'): string {
  return `${currency} ${toAmount(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const accountingInputClass =
  'w-full rounded-xl border border-violet-200/80 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/80 placeholder:text-slate-400 [color-scheme:light]';

export const accountingLabelClass = 'block text-xs font-bold text-black mb-1.5';
