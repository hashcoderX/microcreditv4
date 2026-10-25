'use client';

import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  accountingInputClass,
  accountingLabelClass,
  formatMoney,
  type AccountingCompany,
} from '@/app/components/accounting/companyAccountingUtils';

type LoanOption = {
  id: number;
  product_type?: string | null;
  reference_no?: string | null;
  customer_no?: string | null;
  customer_name?: string | null;
  status?: string | null;
  loan_amount?: number | string | null;
  refundable_amount?: number | string | null;
  loan_balance?: number | string | null;
};

type ExtraChargeLoan = {
  id: number;
  product_type?: string | null;
  reference_no?: string | null;
  customer_no?: string | null;
  customer_name?: string | null;
  status?: string | null;
  loan_amount?: number | string | null;
  refundable_amount?: number | string | null;
  loan_balance?: number | string | null;
};

type ExtraChargeRow = {
  id: number;
  company_id: number;
  mf_loan_request_id?: number | null;
  product_type?: string | null;
  source_loan_id?: number | null;
  charge_date: string;
  charge_type: string;
  title: string;
  extra_charges?: number | string | null;
  amount: number | string;
  apply_to_loan_balance: boolean;
  reference_no?: string | null;
  notes?: string | null;
  loan?: ExtraChargeLoan | null;
};

type ExtraChargeForm = {
  product_type: string;
  source_loan_id: number;
  charge_date: string;
  charge_type: string;
  title: string;
  amount: string;
  apply_to_loan_balance: boolean;
  reference_no: string;
  notes: string;
};

const PRODUCT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'microfinance', label: 'Micro Finance' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'finance', label: 'Finance' },
];

const CHARGE_LABELS: Record<string, string> = {
  processing_fee: 'Processing Fee',
  service_fee: 'Service Fee',
  admin_fee: 'Admin Fee',
  document_fee: 'Document Fee',
  field_visit_fee: 'Field Visit Fee',
  other: 'Other',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function emptyForm(defaultChargeType = 'service_fee'): ExtraChargeForm {
  return {
    product_type: 'microfinance',
    source_loan_id: 0,
    charge_date: todayIso(),
    charge_type: defaultChargeType,
    title: '',
    amount: '',
    apply_to_loan_balance: true,
    reference_no: '',
    notes: '',
  };
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function chargeTypeLabel(value: string): string {
  return CHARGE_LABELS[value] || value.replace(/_/g, ' ');
}

export default function AccountingLoanExtraChargesPage() {
  const router = useRouter();

  const [token, setToken] = useState('');
  const [companies, setCompanies] = useState<AccountingCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<ExtraChargeRow[]>([]);
  const [loanOptions, setLoanOptions] = useState<LoanOption[]>([]);
  const [chargeTypes, setChargeTypes] = useState<string[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [fromDate, setFromDate] = useState(monthStartIso());
  const [toDate, setToDate] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState<ExtraChargeForm>(emptyForm());
  const [loanSearch, setLoanSearch] = useState('');
  const [showLoanDropdown, setShowLoanDropdown] = useState(false);
  const [activeLoanIndex, setActiveLoanIndex] = useState(0);
  const loanSearchRef = useRef<HTMLDivElement | null>(null);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  );

  const currency = selectedCompany?.currency || 'LKR';

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const fetchCompanies = async (authToken: string) => {
    setLoadingCompanies(true);
    try {
      const response = await axios.get('/api/companies', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const list = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];
      setCompanies(list);
      if (list.length > 0) {
        setSelectedCompanyId((prev) => prev ?? Number(list[0].id));
      } else {
        setSelectedCompanyId(null);
      }
    } catch {
      setCompanies([]);
      setSelectedCompanyId(null);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchRows = async (loanProductType?: string) => {
    if (!token || !selectedCompanyId) {
      setRows([]);
      setLoanOptions([]);
      setChargeTypes([]);
      setTotalAmount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await axios.get(`/api/companies/${selectedCompanyId}/loan-extra-charges`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          charge_type: typeFilter === 'all' ? undefined : typeFilter,
          search: search.trim() || undefined,
          loan_product_type: loanProductType || form.product_type,
        },
      });

      setRows(Array.isArray(response.data?.charges) ? response.data.charges : []);
      setLoanOptions(Array.isArray(response.data?.loan_options) ? response.data.loan_options : []);
      const nextTypes = Array.isArray(response.data?.charge_types) ? response.data.charge_types : [];
      setChargeTypes(nextTypes);
      setTotalAmount(Number(response.data?.summary?.total_amount || 0));

      if (nextTypes.length > 0 && !nextTypes.includes(form.charge_type)) {
        setForm((prev) => ({ ...prev, charge_type: nextTypes[0] }));
      }
    } catch (error: unknown) {
      setRows([]);
      setLoanOptions([]);
      setChargeTypes([]);
      setTotalAmount(0);
      if (axios.isAxiosError(error)) {
        setNotice({
          type: 'error',
          text: String(error.response?.data?.message || 'Failed to load loan extra charges.'),
        });
      } else {
        setNotice({ type: 'error', text: 'Failed to load loan extra charges.' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void fetchCompanies(token);
  }, [token]);

  useEffect(() => {
    if (!token || loadingCompanies) return;
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedCompanyId, loadingCompanies]);

  const selectedLoan = useMemo(
    () => loanOptions.find((loan) => Number(loan.id) === Number(form.source_loan_id)) || null,
    [loanOptions, form.source_loan_id]
  );

  const loanAmountNumber = Number(form.amount || 0);

  const filteredLoans = useMemo(() => {
    const term = loanSearch.trim().toLowerCase();
    if (!term) {
      return loanOptions.slice(0, 12);
    }

    return loanOptions
      .filter((loan) => {
        const haystack = [
          String(loan.id || ''),
          String(loan.reference_no || ''),
          String(loan.customer_name || ''),
          String(loan.customer_no || ''),
          String(loan.status || ''),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(term);
      })
      .slice(0, 20);
  }, [loanOptions, loanSearch]);

  const stats = useMemo(() => {
    const count = rows.length;
    const appliedCount = rows.filter((row) => row.apply_to_loan_balance).length;
    const average = count > 0 ? totalAmount / count : 0;

    return {
      count,
      appliedCount,
      average,
    };
  }, [rows, totalAmount]);

  useEffect(() => {
    if (!showLoanDropdown) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!loanSearchRef.current?.contains(target)) {
        setShowLoanDropdown(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showLoanDropdown]);

  useEffect(() => {
    if (!selectedLoan) return;
    const label = `${selectedLoan.reference_no || `Loan #${selectedLoan.id}`} • ${selectedLoan.customer_name || '-'} (${selectedLoan.customer_no || '-'})`;
    setLoanSearch(label);
  }, [selectedLoan]);

  const openAddModal = () => {
    setForm(emptyForm(chargeTypes[0] || 'service_fee'));
    setLoanSearch('');
    setShowLoanDropdown(false);
    setActiveLoanIndex(0);
    setShowAddModal(true);
    void fetchRows('microfinance');
  };

  const onProductTypeChange = async (productType: string) => {
    setForm((prev) => ({ ...prev, product_type: productType, source_loan_id: 0 }));
    setLoanSearch('');
    setActiveLoanIndex(0);
    setShowLoanDropdown(false);
    await fetchRows(productType);
  };

  const selectLoan = (loan: LoanOption) => {
    setForm((prev) => ({ ...prev, source_loan_id: Number(loan.id) }));
    setLoanSearch(`${loan.reference_no || `Loan #${loan.id}`} • ${loan.customer_name || '-'} (${loan.customer_no || '-'})`);
    setShowLoanDropdown(false);
  };

  const submitCharge = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token || !selectedCompanyId) {
      setNotice({ type: 'error', text: 'Please select a branch first.' });
      return;
    }

    if (!form.source_loan_id) {
      setNotice({ type: 'error', text: 'Please select a loan.' });
      return;
    }

    if (loanAmountNumber <= 0) {
      setNotice({ type: 'error', text: 'Amount must be greater than zero.' });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      await axios.post(
        `/api/companies/${selectedCompanyId}/loan-extra-charges`,
        {
          product_type: form.product_type,
          source_loan_id: Number(form.source_loan_id),
          charge_date: form.charge_date,
          charge_type: form.charge_type,
          title: form.title.trim(),
          extra_charges: Number(form.amount || 0),
          amount: Number(form.amount || 0),
          apply_to_loan_balance: form.apply_to_loan_balance,
          reference_no: form.reference_no.trim() || null,
          notes: form.notes.trim() || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setShowAddModal(false);
      await fetchRows();
      setNotice({ type: 'success', text: 'Loan extra charge saved successfully.' });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setNotice({
          type: 'error',
          text: String(error.response?.data?.message || 'Failed to save loan extra charge.'),
        });
      } else {
        setNotice({ type: 'error', text: 'Failed to save loan extra charge.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteCharge = async (id: number) => {
    if (!token || !selectedCompanyId) return;
    const confirmed = window.confirm('Delete this extra charge?');
    if (!confirmed) return;

    setNotice(null);
    try {
      await axios.delete(`/api/companies/${selectedCompanyId}/loan-extra-charges/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchRows();
      setNotice({ type: 'success', text: 'Loan extra charge deleted successfully.' });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setNotice({
          type: 'error',
          text: String(error.response?.data?.message || 'Failed to delete loan extra charge.'),
        });
      } else {
        setNotice({ type: 'error', text: 'Failed to delete loan extra charge.' });
      }
    }
  };

  const productTypeLabel = (value?: string | null): string => {
    const normalized = (value || '').toLowerCase();
    return PRODUCT_TYPE_OPTIONS.find((option) => option.value === normalized)?.label || 'Micro Finance';
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100 p-4 md:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <div className="rounded-3xl border border-violet-200 bg-white/90 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-black text-black">Loan Extra Charges</h1>
              <p className="text-sm text-slate-600">Add additional accounting charges against loans and optionally apply them to loan balances.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard/accounting')}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => void fetchRows()}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:from-violet-700 hover:to-fuchsia-700"
              >
                <Plus className="h-4 w-4" />
                Add Charge
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-violet-200 bg-white/90 p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Entries</p>
              <p className="mt-1 text-2xl font-black text-violet-900">{stats.count}</p>
            </div>
            <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">Applied to Balance</p>
              <p className="mt-1 text-2xl font-black text-fuchsia-900">{stats.appliedCount}</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Average Charge</p>
              <p className="mt-1 text-2xl font-black text-indigo-900">{formatMoney(stats.average, currency)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <div className="xl:col-span-2">
              <label className={accountingLabelClass}>Branch</label>
              <select
                className={accountingInputClass}
                value={selectedCompanyId || ''}
                onChange={(e) => setSelectedCompanyId(Number(e.target.value) || null)}
                disabled={loadingCompanies || companies.length === 0}
              >
                {companies.length === 0 && <option value="">No branches available</option>}
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={accountingLabelClass}>From</label>
              <input className={accountingInputClass} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className={accountingLabelClass}>To</label>
              <input className={accountingInputClass} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div>
              <label className={accountingLabelClass}>Charge Type</label>
              <select className={accountingInputClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                {chargeTypes.map((type) => (
                  <option key={type} value={type}>
                    {chargeTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={accountingLabelClass}>Search</label>
              <input
                className={accountingInputClass}
                placeholder="Title, ref no, notes"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void fetchRows()}
              className="rounded-xl bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-200"
            >
              Apply Filters
            </button>
          </div>

          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm font-semibold text-violet-900">
            Total Extra Charges: {formatMoney(totalAmount, currency)}
          </div>

          {notice && (
            <div
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                notice.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {notice.text}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-violet-100">
            <table className="min-w-full text-sm">
              <thead className="bg-violet-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Product Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Loan</th>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Title</th>
                  <th className="px-3 py-2 text-right font-semibold">Extra Charges</th>
                  <th className="px-3 py-2 text-left font-semibold">Applied to Balance</th>
                  <th className="px-3 py-2 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      No extra charges found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t border-violet-100">
                      <td className="px-3 py-2">{formatDate(row.charge_date)}</td>
                      <td className="px-3 py-2">{productTypeLabel(row.product_type || row.loan?.product_type)}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{row.loan?.reference_no || '-'}</div>
                        <div className="text-xs text-slate-500">{row.loan?.customer_name || '-'} / {row.loan?.customer_no || '-'}</div>
                      </td>
                      <td className="px-3 py-2">{chargeTypeLabel(row.charge_type)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{row.title}</div>
                        {row.reference_no && <div className="text-xs text-slate-500">Ref: {row.reference_no}</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(row.extra_charges ?? row.amount, currency)}</td>
                      <td className="px-3 py-2">{row.apply_to_loan_balance ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void deleteCharge(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-3 py-4 sm:px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-violet-200 bg-white p-4 shadow-2xl sm:p-5 max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900">Add Loan Extra Charge</h2>
            <p className="mt-1 text-sm text-slate-600">Use advanced loan search, review the loan snapshot, then post the charge.</p>

            <form className="mt-4 space-y-4" onSubmit={submitCharge}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={accountingLabelClass}>Charge Date *</label>
                  <input
                    className={accountingInputClass}
                    type="date"
                    value={form.charge_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, charge_date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className={accountingLabelClass}>Product Type *</label>
                  <select
                    className={accountingInputClass}
                    value={form.product_type}
                    onChange={(e) => void onProductTypeChange(e.target.value)}
                    required
                  >
                    {PRODUCT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={accountingLabelClass}>Loan *</label>
                  <div className="relative" ref={loanSearchRef}>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className={`${accountingInputClass} pl-9`}
                        value={loanSearch}
                        onChange={(e) => {
                          setLoanSearch(e.target.value);
                          setShowLoanDropdown(true);
                          setActiveLoanIndex(0);
                          setForm((prev) => ({ ...prev, source_loan_id: 0 }));
                        }}
                        onFocus={() => setShowLoanDropdown(true)}
                        onKeyDown={(event) => {
                          if (!showLoanDropdown || filteredLoans.length === 0) return;

                          if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setActiveLoanIndex((prev) => (prev + 1 >= filteredLoans.length ? 0 : prev + 1));
                          }

                          if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setActiveLoanIndex((prev) => (prev - 1 < 0 ? filteredLoans.length - 1 : prev - 1));
                          }

                          if (event.key === 'Enter') {
                            event.preventDefault();
                            const nextLoan = filteredLoans[activeLoanIndex];
                            if (nextLoan) {
                              selectLoan(nextLoan);
                            }
                          }

                          if (event.key === 'Escape') {
                            setShowLoanDropdown(false);
                          }
                        }}
                        placeholder={`Search ${productTypeLabel(form.product_type)} loan by ref, customer name/no, status`}
                        autoComplete="off"
                        required
                      />
                    </div>

                    {showLoanDropdown && (
                      <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-violet-200 bg-white shadow-lg">
                        {filteredLoans.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">No matching loans found.</div>
                        ) : (
                          filteredLoans.map((loan, index) => {
                            const isActive = index === activeLoanIndex;
                            const isSelected = Number(loan.id) === Number(form.source_loan_id);

                            return (
                              <button
                                key={loan.id}
                                type="button"
                                onMouseEnter={() => setActiveLoanIndex(index)}
                                onClick={() => selectLoan(loan)}
                                className={`block w-full px-3 py-2 text-left ${
                                  isActive ? 'bg-violet-50' : 'bg-white'
                                } ${isSelected ? 'ring-1 ring-inset ring-violet-300' : ''}`}
                              >
                                <div className="font-semibold text-slate-900">{loan.reference_no || `Loan #${loan.id}`}</div>
                                <div className="text-xs text-slate-500">{loan.customer_name || '-'} ({loan.customer_no || '-'})</div>
                                <div className="mt-0.5 text-xs text-slate-500">
                                  Status: {loan.status || '-'} | Balance: {formatMoney(loan.loan_balance || 0, currency)}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={accountingLabelClass}>Charge Type *</label>
                  <select
                    className={accountingInputClass}
                    value={form.charge_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, charge_type: e.target.value }))}
                    required
                  >
                    {chargeTypes.map((type) => (
                      <option key={type} value={type}>
                        {chargeTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={accountingLabelClass}>Amount *</label>
                  <input
                    className={accountingInputClass}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {selectedLoan && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-violet-900">Selected Loan Preview</p>
                      <p className="text-xs text-slate-600">
                        {selectedLoan.reference_no || `Loan #${selectedLoan.id}`} • {selectedLoan.customer_name || '-'} ({selectedLoan.customer_no || '-'})
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 border border-violet-200">
                      {selectedLoan.status || 'unknown'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-white px-3 py-2 border border-violet-100">
                      <p className="text-xs text-slate-500">Loan Amount</p>
                      <p className="text-sm font-bold text-slate-900">{formatMoney(selectedLoan.loan_amount || 0, currency)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 border border-violet-100">
                      <p className="text-xs text-slate-500">Refundable</p>
                      <p className="text-sm font-bold text-slate-900">{formatMoney(selectedLoan.refundable_amount || 0, currency)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 border border-violet-100">
                      <p className="text-xs text-slate-500">Current Balance</p>
                      <p className="text-sm font-bold text-slate-900">{formatMoney(selectedLoan.loan_balance || 0, currency)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 border border-violet-100">
                      <p className="text-xs text-slate-500">Balance After Charge</p>
                      <p className="text-sm font-bold text-violet-900">
                        {formatMoney(
                          (Number(selectedLoan.loan_balance || 0) || 0) + (form.apply_to_loan_balance ? loanAmountNumber : 0),
                          currency
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className={accountingLabelClass}>Title *</label>
                <input
                  className={accountingInputClass}
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="E.g. Special handling fee"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={accountingLabelClass}>Reference No</label>
                  <input
                    className={accountingInputClass}
                    value={form.reference_no}
                    onChange={(e) => setForm((prev) => ({ ...prev, reference_no: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      readOnly
                    />
                    Apply to loan balance (always on)
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  This charge will increase the selected loan balance.
                </span>
              </div>

              <div>
                <label className={accountingLabelClass}>Notes</label>
                <textarea
                  className={accountingInputClass}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.source_loan_id || loanAmountNumber <= 0}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Charge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
