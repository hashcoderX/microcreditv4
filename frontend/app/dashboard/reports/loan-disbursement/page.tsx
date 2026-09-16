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

type DisbursementRow = {
  date: string;
  product?: string;
  product_label: string;
  reference: string;
  customer: string;
  amount: number;
  officer: string;
  route_id?: number | null;
  route_name?: string | null;
  center_id?: number | null;
  center_name?: string | null;
  branch_name: string;
};

export default function LoanDisbursementReportPage() {
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
  const [rows, setRows] = useState<DisbursementRow[]>([]);

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
      const list = Array.isArray(response.data) ? response.data : Array.isArray(response.data?.data) ? response.data.data : [];
      setCompanies(list);
      if (list.length > 0) {
        setSelectedCompanyId((current) => (current && list.some((row: CompanyOption) => row.id === current) ? current : Number(list[0].id)));
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
    try {
      const response = await axios.get('/api/finances/reports/loan-disbursement', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: {
          branch_id: selectedCompanyId,
          company_id: selectedCompanyId,
          from_date: overrides?.from_date ?? fromDate,
          to_date: overrides?.to_date ?? toDate,
          product_type: (overrides?.product_type ?? productType) === 'all' ? undefined : overrides?.product_type ?? productType,
        },
      });
      const payload = response.data || {};
      const normalizedRows: DisbursementRow[] = Array.isArray(payload.rows)
        ? payload.rows.map((raw: unknown): DisbursementRow => {
            const row = (raw ?? {}) as Record<string, unknown>;
            return {
              date: String(row.date || ''),
              product: String(row.product || ''),
              product_label: String(row.product_label || '-'),
              reference: String(row.reference || '-'),
              customer: String(row.customer || '-'),
              amount: toNumber(row.amount),
              officer: String(row.officer || 'Unassigned'),
              route_id: row.route_id ? Number(row.route_id) : null,
              route_name: String(row.route_name || 'N/A'),
              center_id: row.center_id ? Number(row.center_id) : null,
              center_name: String(row.center_name || 'N/A'),
              branch_name: String(row.branch_name || '-'),
            };
          })
        : [];
      setRows(normalizedRows);
      setCurrency(payload.company?.currency || 'LKR');
    } catch (fetchError: unknown) {
      setRows([]);
      const message = (fetchError as AxiosError<{ message?: string }>)?.response?.data?.message;
      setError(message || 'Failed to load loan disbursement report.');
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
    return Array.from(new Set(rows.map((row) => String(row.route_name || 'N/A')))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const centerOptions = useMemo(() => {
    const source = rows.filter((row) => routeFilter === 'all' || String(row.route_name || 'N/A') === routeFilter);
    return Array.from(new Set(source.map((row) => String(row.center_name || 'N/A')))).sort((a, b) => a.localeCompare(b));
  }, [rows, routeFilter]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (routeFilter !== 'all' && String(row.route_name || 'N/A') !== routeFilter) {
        return false;
      }
      if (centerFilter !== 'all' && String(row.center_name || 'N/A') !== centerFilter) {
        return false;
      }
      return true;
    });
  }, [rows, routeFilter, centerFilter]);

  const summary = useMemo(() => {
    const totalDisbursed = filteredRows.reduce((sum, row) => sum + toNumber(row.amount), 0);
    const averageTicket = filteredRows.length > 0 ? totalDisbursed / filteredRows.length : 0;
    const uniqueBorrowers = new Set(filteredRows.map((row) => row.customer)).size;
    const uniqueOfficers = new Set(filteredRows.map((row) => row.officer || 'Unassigned')).size;
    const microCreditTotal = filteredRows
      .filter((row) => (row.product || '').toLowerCase() === 'microfinance')
      .reduce((sum, row) => sum + toNumber(row.amount), 0);

    return {
      disbursementCount: filteredRows.length,
      totalDisbursed,
      averageTicket,
      uniqueBorrowers,
      uniqueOfficers,
      microCreditShare: totalDisbursed > 0 ? (microCreditTotal / totalDisbursed) * 100 : 0,
    };
  }, [filteredRows]);

  const routePerformance = useMemo(() => {
    const bucket = new Map<string, { count: number; amount: number }>();
    for (const row of filteredRows) {
      const key = String(row.route_name || 'N/A');
      const entry = bucket.get(key) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += toNumber(row.amount);
      bucket.set(key, entry);
    }
    return Array.from(bucket.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  const centerPerformance = useMemo(() => {
    const bucket = new Map<string, { count: number; amount: number }>();
    for (const row of filteredRows) {
      const key = String(row.center_name || 'N/A');
      const entry = bucket.get(key) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += toNumber(row.amount);
      bucket.set(key, entry);
    }
    return Array.from(bucket.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  const officerPerformance = useMemo(() => {
    const bucket = new Map<string, { count: number; amount: number }>();
    for (const row of filteredRows) {
      const key = String(row.officer || 'Unassigned');
      const entry = bucket.get(key) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += toNumber(row.amount);
      bucket.set(key, entry);
    }
    return Array.from(bucket.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  const topRouteAmount = routePerformance[0]?.amount || 0;
  const topRouteConcentration = summary.totalDisbursed > 0 ? (topRouteAmount / summary.totalDisbursed) * 100 : 0;
  const rowsWithMissingGeo = filteredRows.filter((row) => (row.product || '').toLowerCase() === 'microfinance' && (!row.route_id || !row.center_id)).length;

  const exportCsv = () => {
    downloadCsv(
      `loan-disbursement-${selectedCompanyId}.csv`,
      ['Date', 'Product', 'Route', 'Center', 'Reference', 'Customer', 'Amount', 'Officer', 'Branch'],
      filteredRows.map((row) => [
        row.date,
        row.product_label,
        row.route_name || 'N/A',
        row.center_name || 'N/A',
        row.reference,
        row.customer,
        amount(row.amount),
        row.officer,
        row.branch_name,
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
    doc.text('Loan Disbursement Report', 40, 36);
    doc.setFontSize(10);
    doc.text(`Generated: ${generatedAt}`, 40, 54);
    doc.text(`Branch: ${selectedCompany?.name || 'N/A'} | Product: ${productType} | Route: ${routeFilter} | Center: ${centerFilter}`, 40, 68);
    doc.text(`Disbursements: ${summary.disbursementCount} | Total: ${currency} ${amount(summary.totalDisbursed)} | Avg Ticket: ${currency} ${amount(summary.averageTicket)}`, 40, 82);

    autoTable(doc, {
      startY: 94,
      head: [['Date', 'Product', 'Route', 'Center', 'Reference', 'Customer', 'Officer', `Amount (${currency})`]],
      body: filteredRows.map((row) => [
        row.date,
        row.product_label,
        row.route_name || 'N/A',
        row.center_name || 'N/A',
        row.reference,
        row.customer,
        row.officer,
        amount(row.amount),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [88, 28, 135] },
      columnStyles: { 7: { halign: 'right' } },
    });

    doc.save(`loan-disbursement-${selectedCompanyId}-${todayIso()}.pdf`);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <AccountingReportShell badge="Loan Portfolio" title="Loan Disbursement Report" description="New loans disbursed by amount, branch, and officer." error={error}
      actions={<><button type="button" onClick={exportCsv} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"><Download className="h-4 w-4" /> Export CSV</button><button type="button" onClick={exportPdf} disabled={filteredRows.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"><Download className="h-4 w-4" /> Export PDF</button><button type="button" onClick={() => fetchReport()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button><button type="button" onClick={() => router.push('/dashboard/reports')} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"><ArrowLeft className="h-4 w-4" /> Reports Hub</button></>}
    >
      {selectedCompany ? <p className="text-xs text-black font-semibold">{selectedCompany.name} · {currency}</p> : null}
      <SummaryCards items={[
        { label: 'Disbursements', value: String(summary.disbursementCount) },
        { label: 'Total Disbursed', value: `${currency} ${amount(summary.totalDisbursed)}`, valueClass: 'text-rose-700' },
        { label: 'Avg Ticket', value: `${currency} ${amount(summary.averageTicket)}`, valueClass: 'text-indigo-700' },
        { label: 'Unique Borrowers', value: String(summary.uniqueBorrowers), valueClass: 'text-cyan-800' },
        { label: 'Active Officers', value: String(summary.uniqueOfficers), valueClass: 'text-emerald-700' },
        { label: 'Micro Credit Share', value: `${amount(summary.microCreditShare)}%`, valueClass: 'text-fuchsia-700' },
        { label: 'Top Route Concentration', value: `${amount(topRouteConcentration)}%`, valueClass: topRouteConcentration > 40 ? 'text-rose-700' : 'text-emerald-700' },
        { label: 'Geo Mapping Alerts', value: String(rowsWithMissingGeo), valueClass: rowsWithMissingGeo > 0 ? 'text-rose-700' : 'text-emerald-700' },
      ]} />
      <ReportFilters companies={companies} selectedCompanyId={selectedCompanyId} onCompanyChange={setSelectedCompanyId} fromDate={fromDate} toDate={toDate} onFromDateChange={setFromDate} onToDateChange={setToDate} onApply={() => fetchReport()} onReset={() => { const nextFrom = monthStartIso(); const nextTo = todayIso(); setFromDate(nextFrom); setToDate(nextTo); setProductType('all'); setRouteFilter('all'); setCenterFilter('all'); fetchReport({ from_date: nextFrom, to_date: nextTo, product_type: 'all' }); }} loadingCompanies={loadingCompanies}
        extraFilters={<><div><label className={accountingLabelClass}>Product</label><select value={productType} onChange={(e) => setProductType(e.target.value)} className={accountingInputClass}><option value="all">All products</option><option value="finance">Finance</option><option value="microfinance">Micro Credit</option><option value="mortgage">Mortgage</option><option value="instant">Instant Loan</option></select></div><div><label className={accountingLabelClass}>Route</label><select value={routeFilter} onChange={(e) => { setRouteFilter(e.target.value); setCenterFilter('all'); }} className={accountingInputClass}><option value="all">All routes</option>{routeOptions.map((route) => <option key={route} value={route}>{route}</option>)}</select></div><div><label className={accountingLabelClass}>Center</label><select value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)} className={accountingInputClass}><option value="all">All centers</option>{centerOptions.map((center) => <option key={center} value={center}>{center}</option>)}</select></div></>}
      />
      <div className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm chart-animate-panel">
        <h2 className="text-lg font-bold text-black">Management Brief</h2>
        <p className="text-xs text-slate-600 mt-1">Executive view of concentration, team productivity, and channel-level disbursement performance.</p>
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-[10px] uppercase tracking-wide font-bold text-violet-700">Top Route</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{routePerformance[0]?.name || 'N/A'}</p>
            <p className="text-xs text-slate-600">{currency} {amount(routePerformance[0]?.amount || 0)} across {routePerformance[0]?.count || 0} disbursement(s)</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-[10px] uppercase tracking-wide font-bold text-violet-700">Top Center</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{centerPerformance[0]?.name || 'N/A'}</p>
            <p className="text-xs text-slate-600">{currency} {amount(centerPerformance[0]?.amount || 0)} across {centerPerformance[0]?.count || 0} disbursement(s)</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-[10px] uppercase tracking-wide font-bold text-violet-700">Top Officer</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{officerPerformance[0]?.name || 'Unassigned'}</p>
            <p className="text-xs text-slate-600">{currency} {amount(officerPerformance[0]?.amount || 0)} across {officerPerformance[0]?.count || 0} disbursement(s)</p>
          </div>
        </div>
      </div>
      <ReportTable title="Disbursement Lines" countLabel={`${filteredRows.length} records`} loading={loading} hasData={filteredRows.length > 0} emptyTitle="No disbursements">
        <div className="overflow-x-auto rounded-xl border border-violet-100">
          <table className="min-w-full text-xs text-black">
            <thead className="bg-violet-50/70 text-[10px] font-bold uppercase tracking-wider"><tr><th className="px-3 py-3 text-left">Date</th><th className="px-3 py-3 text-left">Customer</th><th className="px-3 py-3 text-left">Product</th><th className="px-3 py-3 text-left">Route</th><th className="px-3 py-3 text-left">Center</th><th className="px-3 py-3 text-left">Officer</th><th className="px-3 py-3 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-violet-50 bg-white">
              {filteredRows.map((row, index) => (
                <tr key={`${row.reference}-${index}`} className="hover:bg-violet-50/40">
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.date}</td>
                  <td className="px-3 py-2.5 font-semibold">{row.customer}</td>
                  <td className="px-3 py-2.5">{row.product_label}</td>
                  <td className="px-3 py-2.5">{row.route_name || 'N/A'}</td>
                  <td className="px-3 py-2.5">{row.center_name || 'N/A'}</td>
                  <td className="px-3 py-2.5">{row.officer || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-rose-700">{amount(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTable>
    </AccountingReportShell>
  );
}
