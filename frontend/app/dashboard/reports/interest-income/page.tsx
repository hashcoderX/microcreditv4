'use client';

import axios, { type AxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AccountingReportShell,
  ReportFilters,
  ReportTable,
  SummaryCards,
  amount,
  downloadCsv,
  monthStartIso,
  todayIso,
  toNumber,
  type CompanyOption,
} from '@/app/components/accounting/AccountingReportShell';
import { accountingInputClass, accountingLabelClass } from '@/app/components/accounting/companyAccountingUtils';

type ProductIncomeRow = {
  product: string;
  label: string;
  interest_income: number;
  penalty_income: number;
};

type MicroBreakdownRow = {
  route_id: number;
  route_name: string;
  center_id: number;
  center_name: string;
  officer: string;
  transactions_count: number;
  interest_income: number;
  penalty_income: number;
  total_income: number;
};

export default function InterestIncomeReportPage() {
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
  const [fromDate, setFromDate] = useState(monthStartIso());
  const [toDate, setToDate] = useState(todayIso());
  const [productType, setProductType] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [centerFilter, setCenterFilter] = useState('all');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [products, setProducts] = useState<ProductIncomeRow[]>([]);
  const [microBreakdown, setMicroBreakdown] = useState<MicroBreakdownRow[]>([]);

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
      const response = await axios.get('/api/companies', { headers: { Authorization: `Bearer ${authToken}` } });
      const rows = Array.isArray(response.data) ? response.data : Array.isArray(response.data?.data) ? response.data.data : [];
      setCompanies(rows);
      if (rows.length > 0) {
        setSelectedCompanyId((current) => (current && rows.some((row: CompanyOption) => row.id === current) ? current : Number(rows[0].id)));
      }
    } catch {
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchReport = async (overrides?: { from_date?: string; to_date?: string; product_type?: string }) => {
    if (!token || !selectedCompanyId) return;
    setLoading(true);
    setError('');
    const nextProductType = overrides?.product_type ?? productType;
    try {
      const response = await axios.get('/api/finances/reports/interest-income', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: {
          branch_id: selectedCompanyId,
          company_id: selectedCompanyId,
          from_date: overrides?.from_date ?? fromDate,
          to_date: overrides?.to_date ?? toDate,
          product_type: nextProductType === 'all' ? undefined : nextProductType,
        },
      });
      const payload = response.data || {};
      const nextProducts: ProductIncomeRow[] = Array.isArray(payload.products)
        ? payload.products.map((raw: unknown): ProductIncomeRow => {
            const row = (raw ?? {}) as Record<string, unknown>;
            return {
              product: String(row.product || ''),
              label: String(row.label || '-'),
              interest_income: toNumber(row.interest_income),
              penalty_income: toNumber(row.penalty_income),
            };
          })
        : [];
      const nextBreakdown: MicroBreakdownRow[] = Array.isArray(payload.microfinance_breakdown)
        ? payload.microfinance_breakdown.map((raw: unknown): MicroBreakdownRow => {
            const row = (raw ?? {}) as Record<string, unknown>;
            return {
              route_id: Number(row.route_id || 0),
              route_name: String(row.route_name || 'Unassigned Route'),
              center_id: Number(row.center_id || 0),
              center_name: String(row.center_name || 'Unassigned Center'),
              officer: String(row.officer || 'Unassigned'),
              transactions_count: Number(row.transactions_count || 0),
              interest_income: toNumber(row.interest_income),
              penalty_income: toNumber(row.penalty_income),
              total_income: toNumber(row.total_income),
            };
          })
        : [];

      setProducts(nextProducts);
      setMicroBreakdown(nextBreakdown);
      setCurrency(payload.company?.currency || 'LKR');
    } catch (fetchError: unknown) {
      setProducts([]);
      setMicroBreakdown([]);
      const message = (fetchError as AxiosError<{ message?: string }>)?.response?.data?.message;
      setError(message || 'Failed to load interest income report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchCompanies(token);
  }, [token]);

  useEffect(() => {
    if (!token || loadingCompanies || !selectedCompanyId) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedCompanyId, loadingCompanies]);

  const selectedCompany = useMemo(() => companies.find((c) => c.id === selectedCompanyId) || null, [companies, selectedCompanyId]);

  const routeOptions = useMemo(() => {
    return Array.from(new Set(microBreakdown.map((row) => row.route_name))).sort((a, b) => a.localeCompare(b));
  }, [microBreakdown]);

  const centerOptions = useMemo(() => {
    const source = microBreakdown.filter((row) => routeFilter === 'all' || row.route_name === routeFilter);
    return Array.from(new Set(source.map((row) => row.center_name))).sort((a, b) => a.localeCompare(b));
  }, [microBreakdown, routeFilter]);

  const officerOptions = useMemo(() => {
    const source = microBreakdown.filter((row) => {
      if (routeFilter !== 'all' && row.route_name !== routeFilter) return false;
      if (centerFilter !== 'all' && row.center_name !== centerFilter) return false;
      return true;
    });
    return Array.from(new Set(source.map((row) => row.officer))).sort((a, b) => a.localeCompare(b));
  }, [microBreakdown, routeFilter, centerFilter]);

  const filteredBreakdown = useMemo(() => {
    return microBreakdown.filter((row) => {
      if (routeFilter !== 'all' && row.route_name !== routeFilter) return false;
      if (centerFilter !== 'all' && row.center_name !== centerFilter) return false;
      if (officerFilter !== 'all' && row.officer !== officerFilter) return false;
      return true;
    });
  }, [microBreakdown, routeFilter, centerFilter, officerFilter]);

  const breakdownSummary = useMemo(() => {
    const txCount = filteredBreakdown.reduce((sum, row) => sum + row.transactions_count, 0);
    const totalIncome = filteredBreakdown.reduce((sum, row) => sum + row.total_income, 0);
    const penaltyIncome = filteredBreakdown.reduce((sum, row) => sum + row.penalty_income, 0);
    const topRoute = filteredBreakdown.slice().sort((a, b) => b.total_income - a.total_income)[0] || null;

    return {
      transactionsCount: txCount,
      averageTicket: txCount > 0 ? totalIncome / txCount : 0,
      penaltyRatio: totalIncome > 0 ? (penaltyIncome / totalIncome) * 100 : 0,
      routeCount: new Set(filteredBreakdown.map((row) => row.route_name)).size,
      centerCount: new Set(filteredBreakdown.map((row) => row.center_name)).size,
      officerCount: new Set(filteredBreakdown.map((row) => row.officer)).size,
      topRouteName: topRoute?.route_name || 'N/A',
      topRouteIncome: topRoute?.total_income || 0,
    };
  }, [filteredBreakdown]);

  const productRows = useMemo(() => {
    if (filteredBreakdown.length === 0 || productType !== 'microfinance') {
      return products;
    }

    const mfInterest = filteredBreakdown.reduce((sum, row) => sum + row.interest_income, 0);
    const mfPenalty = filteredBreakdown.reduce((sum, row) => sum + row.penalty_income, 0);

    return products.map((row) => {
      if (row.product !== 'microfinance') return row;
      return {
        ...row,
        interest_income: mfInterest,
        penalty_income: mfPenalty,
      };
    });
  }, [products, filteredBreakdown, productType]);

  const displaySummary = useMemo(() => {
    const totalInterest = productRows.reduce((sum, row) => sum + row.interest_income, 0);
    const totalPenalty = productRows.reduce((sum, row) => sum + row.penalty_income, 0);
    return {
      totalInterest,
      totalPenalty,
      grandTotal: totalInterest + totalPenalty,
    };
  }, [productRows]);

  const exportCsv = () => {
    if (filteredBreakdown.length > 0) {
      downloadCsv(
        `interest-income-breakdown-${selectedCompanyId}.csv`,
        ['Route', 'Center', 'Officer', 'Transactions', 'Interest Income', 'Penalty Income', 'Total Income'],
        filteredBreakdown.map((row) => [
          row.route_name,
          row.center_name,
          row.officer,
          String(row.transactions_count),
          amount(row.interest_income),
          amount(row.penalty_income),
          amount(row.total_income),
        ])
      );
      return;
    }

    downloadCsv(
      `interest-income-product-${selectedCompanyId}.csv`,
      ['Product', 'Interest Income', 'Penalty Income', 'Total Income'],
      productRows.map((row) => [
        row.label,
        amount(row.interest_income),
        amount(row.penalty_income),
        amount(row.interest_income + row.penalty_income),
      ])
    );
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const generatedAt = new Intl.DateTimeFormat('en-LK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    doc.setFontSize(15);
    doc.text('Interest Income Report', 40, 36);
    doc.setFontSize(10);
    doc.text(`Branch: ${selectedCompany?.name || 'N/A'} | Product: ${productType} | Route: ${routeFilter} | Center: ${centerFilter} | Officer: ${officerFilter}`, 40, 54);
    doc.text(`Generated: ${generatedAt} | Total Interest: ${currency} ${amount(displaySummary.totalInterest)} | Total Penalty: ${currency} ${amount(displaySummary.totalPenalty)}`, 40, 68);

    if (filteredBreakdown.length > 0) {
      autoTable(doc, {
        startY: 82,
        head: [['Route', 'Center', 'Officer', 'Transactions', `Interest (${currency})`, `Penalty (${currency})`, `Total (${currency})`]],
        body: filteredBreakdown.map((row) => [
          row.route_name,
          row.center_name,
          row.officer,
          String(row.transactions_count),
          amount(row.interest_income),
          amount(row.penalty_income),
          amount(row.total_income),
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [88, 28, 135] },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      });
    } else {
      autoTable(doc, {
        startY: 82,
        head: [['Product', `Interest (${currency})`, `Penalty (${currency})`, `Total (${currency})`]],
        body: productRows.map((row) => [
          row.label,
          amount(row.interest_income),
          amount(row.penalty_income),
          amount(row.interest_income + row.penalty_income),
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [88, 28, 135] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      });
    }

    doc.save(`interest-income-${selectedCompanyId}-${todayIso()}.pdf`);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <AccountingReportShell badge="Loan Portfolio" title="Interest Income Report" description="Interest and penalty income by product and branch for the selected period." error={error}
      actions={<><button type="button" onClick={exportCsv} disabled={productRows.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"><Download className="h-4 w-4" /> Export CSV</button><button type="button" onClick={exportPdf} disabled={productRows.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"><Download className="h-4 w-4" /> Export PDF</button><button type="button" onClick={() => fetchReport()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button><button type="button" onClick={() => router.push('/dashboard/reports')} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"><ArrowLeft className="h-4 w-4" /> Reports Hub</button></>}
    >
      {selectedCompany ? <p className="text-xs text-black font-semibold">{selectedCompany.name} · {currency}</p> : null}
      <SummaryCards items={[
        { label: 'Interest Income', value: `${currency} ${amount(displaySummary.totalInterest)}`, valueClass: 'text-cyan-700' },
        { label: 'Penalty Income', value: `${currency} ${amount(displaySummary.totalPenalty)}`, valueClass: 'text-amber-700' },
        { label: 'Grand Total', value: `${currency} ${amount(displaySummary.grandTotal)}`, valueClass: 'text-emerald-700' },
        { label: 'Penalty Ratio', value: `${amount(breakdownSummary.penaltyRatio)}%`, valueClass: breakdownSummary.penaltyRatio > 15 ? 'text-rose-700' : 'text-indigo-700' },
        { label: 'MF Transactions', value: String(breakdownSummary.transactionsCount), valueClass: 'text-violet-700' },
        { label: 'Avg Income / Txn', value: `${currency} ${amount(breakdownSummary.averageTicket)}`, valueClass: 'text-teal-700' },
        { label: 'Route / Center Coverage', value: `${breakdownSummary.routeCount} / ${breakdownSummary.centerCount}`, valueClass: 'text-slate-900' },
        { label: 'Officer Coverage', value: String(breakdownSummary.officerCount), valueClass: 'text-fuchsia-700' },
      ]} />
      <ReportFilters companies={companies} selectedCompanyId={selectedCompanyId} fromDate={fromDate} toDate={toDate} onCompanyChange={(value) => { setSelectedCompanyId(value); setRouteFilter('all'); setCenterFilter('all'); setOfficerFilter('all'); }} onFromDateChange={setFromDate} onToDateChange={setToDate} onApply={() => fetchReport()} onReset={() => { const nextFrom = monthStartIso(); const nextTo = todayIso(); setFromDate(nextFrom); setToDate(nextTo); setProductType('all'); setRouteFilter('all'); setCenterFilter('all'); setOfficerFilter('all'); fetchReport({ from_date: nextFrom, to_date: nextTo, product_type: 'all' }); }} loadingCompanies={loadingCompanies}
        extraFilters={<><div><label className={accountingLabelClass}>Product</label><select value={productType} onChange={(e) => { setProductType(e.target.value); setRouteFilter('all'); setCenterFilter('all'); setOfficerFilter('all'); }} className={accountingInputClass}><option value="all">All products</option><option value="finance">Finance</option><option value="microfinance">Micro Credit</option><option value="mortgage">Mortgage</option><option value="instant">Instant Loan</option></select></div><div><label className={accountingLabelClass}>Route</label><select value={routeFilter} onChange={(e) => { setRouteFilter(e.target.value); setCenterFilter('all'); setOfficerFilter('all'); }} className={accountingInputClass} disabled={productType !== 'microfinance'}><option value="all">All routes</option>{routeOptions.map((route) => <option key={route} value={route}>{route}</option>)}</select></div><div><label className={accountingLabelClass}>Center</label><select value={centerFilter} onChange={(e) => { setCenterFilter(e.target.value); setOfficerFilter('all'); }} className={accountingInputClass} disabled={productType !== 'microfinance'}><option value="all">All centers</option>{centerOptions.map((center) => <option key={center} value={center}>{center}</option>)}</select></div><div><label className={accountingLabelClass}>Officer</label><select value={officerFilter} onChange={(e) => setOfficerFilter(e.target.value)} className={accountingInputClass} disabled={productType !== 'microfinance'}><option value="all">All officers</option>{officerOptions.map((officer) => <option key={officer} value={officer}>{officer}</option>)}</select></div></>}
      />
      <div className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm chart-animate-panel">
        <h2 className="text-lg font-bold text-black">Management Brief</h2>
        <p className="text-xs text-slate-600 mt-1">Highlights for concentration and quality of earnings in the selected reporting window.</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-[10px] uppercase tracking-wide font-bold text-violet-700">Top Route Income</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{breakdownSummary.topRouteName}</p>
            <p className="text-xs text-slate-600">{currency} {amount(breakdownSummary.topRouteIncome)}</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-[10px] uppercase tracking-wide font-bold text-violet-700">Penalty Exposure</p>
            <p className={`mt-1 text-sm font-bold ${breakdownSummary.penaltyRatio > 15 ? 'text-rose-700' : 'text-emerald-700'}`}>{amount(breakdownSummary.penaltyRatio)}%</p>
            <p className="text-xs text-slate-600">Penalty as percentage of micro-credit income</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-[10px] uppercase tracking-wide font-bold text-violet-700">Operational Coverage</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{breakdownSummary.routeCount} routes / {breakdownSummary.centerCount} centers</p>
            <p className="text-xs text-slate-600">{breakdownSummary.officerCount} active officers in collections</p>
          </div>
        </div>
      </div>
      <ReportTable title="Product-wise Interest" loading={loading} hasData={productRows.length > 0} emptyTitle="No interest income">
        <div className="overflow-x-auto rounded-xl border border-violet-100">
          <table className="min-w-full text-xs text-black">
            <thead className="bg-violet-50/70 text-[10px] font-bold uppercase tracking-wider"><tr><th className="px-3 py-3 text-left">Product</th><th className="px-3 py-3 text-right">Interest</th><th className="px-3 py-3 text-right">Penalty</th><th className="px-3 py-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-violet-50 bg-white">
              {productRows.map((row) => (
                <tr key={row.label} className="hover:bg-violet-50/40">
                  <td className="px-3 py-2.5 font-semibold">{row.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.interest_income)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.penalty_income)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{amount(row.interest_income + row.penalty_income)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTable>
      <ReportTable title="Micro Credit Route / Center / Officer Breakdown" subtitle="Appears when Micro Credit product data is available for the selected period." loading={loading} hasData={filteredBreakdown.length > 0} emptyTitle="No micro-credit breakdown">
        <div className="overflow-x-auto rounded-xl border border-violet-100">
          <table className="min-w-full text-xs text-black">
            <thead className="bg-violet-50/70 text-[10px] font-bold uppercase tracking-wider"><tr><th className="px-3 py-3 text-left">Route</th><th className="px-3 py-3 text-left">Center</th><th className="px-3 py-3 text-left">Officer</th><th className="px-3 py-3 text-right">Transactions</th><th className="px-3 py-3 text-right">Interest</th><th className="px-3 py-3 text-right">Penalty</th><th className="px-3 py-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-violet-50 bg-white">
              {filteredBreakdown.map((row, index) => (
                <tr key={`${row.route_name}-${row.center_name}-${row.officer}-${index}`} className="hover:bg-violet-50/40">
                  <td className="px-3 py-2.5 font-semibold">{row.route_name}</td>
                  <td className="px-3 py-2.5">{row.center_name}</td>
                  <td className="px-3 py-2.5">{row.officer}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.transactions_count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.interest_income)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{amount(row.penalty_income)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{amount(row.total_income)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTable>
    </AccountingReportShell>
  );
}
