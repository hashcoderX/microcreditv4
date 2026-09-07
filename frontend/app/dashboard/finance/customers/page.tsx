'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { resolveStorageAssetUrl } from '@/lib/api';
import { ArrowLeft, Eye, Phone, Search, ShieldCheck, UserCog } from 'lucide-react';

type FinanceRow = {
  id: number;
  finance_type?: string | null;
  product_type?: string | null;
  asset_reference?: string | null;
  amount?: number | string | null;
  down_payment?: number | string | null;
  financed_amount?: number | string | null;
  installment_amount?: number | string | null;
  interest_rate?: number | string | null;
  interest_type?: string | null;
  tenure_months?: number | string | null;
  installment_frequency?: string | null;
  start_date?: string | null;
  vehicle_details?: {
    vehicle_no?: string | null;
    chassis_no?: string | null;
    engine_no?: string | null;
    make_model?: string | null;
    year?: string | number | null;
  } | null;
  valuation_details?: {
    valuation_amount?: string | number | null;
    valuation_date?: string | null;
    valuer_name?: string | null;
  } | null;
  guarantor_details?: Array<{
    name?: string | null;
    nic?: string | null;
    phone?: string | null;
    address?: string | null;
  }> | null;
  repayment_plan?: {
    approval_workflow?: {
      current_step?: number | string | null;
      max_steps?: number | string | null;
      step_title?: string | null;
      updated_at?: string | null;
      history?: Array<{
        from_step?: number | string | null;
        to_step?: number | string | null;
        from_title?: string | null;
        to_title?: string | null;
        changed_at?: string | null;
        changed_by?: number | string | null;
        note?: string | null;
        direction?: string | null;
      }> | null;
    } | null;
    review_data?: Array<{
      action?: string | null;
      from_step?: number | string | null;
      to_step?: number | string | null;
      from_step_title?: string | null;
      to_step_title?: string | null;
      review_note?: string | null;
      reviewed_at?: string | null;
      reviewed_by?: number | string | null;
    }> | null;
    loan_signature_check_payload?: {
      customer_photo_url?: string | null;
      customer_signature_url?: string | null;
    } | null;
  } | null;
  documents?: Array<{
    id: number;
    document_type?: string | null;
    original_name?: string | null;
    file_path?: string | null;
    file_url?: string | null;
  }> | null;
  workflowEvents?: Array<{
    id: number;
    event_type?: string | null;
    from_step?: number | string | null;
    to_step?: number | string | null;
    step_title?: string | null;
    status?: string | null;
    note?: string | null;
    actor_user_id?: number | string | null;
    created_at?: string | null;
  }> | null;
  status?: string | null;
  created_at?: string | null;
  customer?: {
    id?: number;
    customer_code?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    nic_passport?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    customer_photo_url?: string | null;
    photo_path?: string | null;
  } | null;
};

type FinanceCustomerGroup = {
  customerId: number;
  customerCode: string;
  name: string;
  nic: string;
  phone: string;
  email: string;
  address: string;
  totalFinanced: number;
  activeCount: number;
  pendingCount: number;
  records: FinanceRow[];
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function formatAmount(v: unknown): string {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(v: unknown): string {
  if (!v) return '-';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

function formatDateTime(v: unknown): string {
  if (!v) return '-';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function formatWorkflowActionLabel(action: unknown): string {
  const normalized = String(action || '')
    .replace(/[_\-]+/g, ' ')
    .trim();
  if (!normalized) return 'Workflow Update';

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

function resolveFinanceCustomerPhotoUrl(finance: FinanceRow): string {
  const direct = String(finance.customer?.customer_photo_url || '').trim();
  if (direct) {
    return resolveStorageAssetUrl(direct);
  }

  const customerPath = String(finance.customer?.photo_path || '').trim();
  if (customerPath) {
    return resolveStorageAssetUrl(customerPath);
  }

  const payloadPhoto = String(finance.repayment_plan?.loan_signature_check_payload?.customer_photo_url || '').trim();
  if (payloadPhoto) {
    return resolveStorageAssetUrl(payloadPhoto);
  }

  const doc = (finance.documents || []).find((item) =>
    String(item.document_type || '').toLowerCase().includes('customer photo')
  );
  if (!doc) return '';

  const byUrl = String(doc.file_url || '').trim();
  if (byUrl) return resolveStorageAssetUrl(byUrl);

  const byPath = String(doc.file_path || '').trim();
  if (byPath) return resolveStorageAssetUrl(byPath);

  return '';
}

function resolveFinanceCustomerSignatureUrl(finance: FinanceRow): string {
  const payloadSignature = String(finance.repayment_plan?.loan_signature_check_payload?.customer_signature_url || '').trim();
  if (payloadSignature) {
    return resolveStorageAssetUrl(payloadSignature);
  }

  const doc = (finance.documents || []).find((item) => {
    const type = String(item.document_type || '').toLowerCase();
    return type.includes('customer signature') || type === 'signature' || type.includes('signature');
  });

  if (!doc) return '';

  const byUrl = String(doc.file_url || '').trim();
  if (byUrl) return resolveStorageAssetUrl(byUrl);

  const byPath = String(doc.file_path || '').trim();
  if (byPath) return resolveStorageAssetUrl(byPath);

  return '';
}

export default function FinanceCustomersPage() {
  const RECORDS_PER_PAGE = 5;
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [recordPages, setRecordPages] = useState<Record<number, number>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<FinanceRow | null>(null);

  const fetchNotificationPreview = async (authToken: string) => {
    try {
      const response = await fetch('/api/notifications/preview?limit=4', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to load notifications preview');
      const payload = await response.json();
      setActionCenterTotalCount(Number(payload?.action_center_total || 0));
    } catch {
      setActionCenterTotalCount(0);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    router.push('/');
  };

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);
    void fetchNotificationPreview(t);

    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      try {
        setAuthUser(JSON.parse(rawUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/finances?per_page=1000', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!response.ok) throw new Error('Failed to load finance records');

        const payload = await response.json();
        const data = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        setRows(data as FinanceRow[]);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [token]);

  const customerGroups = useMemo(() => {
    const map = new Map<number, FinanceCustomerGroup>();

    for (const row of rows) {
      const customerId = Number(row.customer?.id || 0);
      if (!Number.isFinite(customerId) || customerId <= 0) continue;

      const current = map.get(customerId);
      const customerName = `${row.customer?.first_name || ''} ${row.customer?.last_name || ''}`.trim() || 'Unknown Customer';
      const financed = Number.isFinite(toNumber(row.financed_amount)) ? toNumber(row.financed_amount) : 0;

      if (!current) {
        map.set(customerId, {
          customerId,
          customerCode: String(row.customer?.customer_code || '-'),
          name: customerName,
          nic: String(row.customer?.nic_passport || '-'),
          phone: String(row.customer?.phone || '-'),
          email: String(row.customer?.email || '-'),
          address: String(row.customer?.address || '-'),
          totalFinanced: financed,
          activeCount: row.status === 'active' ? 1 : 0,
          pendingCount: row.status === 'pending_approval' ? 1 : 0,
          records: [row],
        });
      } else {
        current.totalFinanced += financed;
        current.activeCount += row.status === 'active' ? 1 : 0;
        current.pendingCount += row.status === 'pending_approval' ? 1 : 0;
        current.records.push(row);
      }
    }

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        records: [...group.records].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)),
      }))
      .sort((a, b) => b.totalFinanced - a.totalFinanced);
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customerGroups;

    return customerGroups.filter((group) =>
      group.name.toLowerCase().includes(term)
      || group.customerCode.toLowerCase().includes(term)
      || group.nic.toLowerCase().includes(term)
      || group.phone.toLowerCase().includes(term),
    );
  }, [customerGroups, searchTerm]);

  const totalCustomers = filteredGroups.length;
  const totalRecords = filteredGroups.reduce((sum, g) => sum + g.records.length, 0);
  const totalExposure = filteredGroups.reduce((sum, g) => sum + g.totalFinanced, 0);

  const getCurrentPageForCustomer = (customerId: number, totalRecordsForCustomer: number) => {
    const pageCount = Math.max(1, Math.ceil(totalRecordsForCustomer / RECORDS_PER_PAGE));
    const current = recordPages[customerId] || 1;
    return Math.min(Math.max(current, 1), pageCount);
  };

  const setCustomerPage = (customerId: number, nextPage: number, totalRecordsForCustomer: number) => {
    const pageCount = Math.max(1, Math.ceil(totalRecordsForCustomer / RECORDS_PER_PAGE));
    const safePage = Math.min(Math.max(nextPage, 1), pageCount);
    setRecordPages((prev) => ({ ...prev, [customerId]: safePage }));
  };

  const openFullRecord = async (id: number) => {
    if (!token) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setSelectedRecord(null);

    try {
      const response = await fetch(`/api/finances/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to load finance details');
      const payload = await response.json();
      setSelectedRecord(payload as FinanceRow);
    } catch {
      setDetailError('Failed to load full finance record details.');
    } finally {
      setDetailLoading(false);
    }
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-blue-300 blur-3xl"></div>
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-300 blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-5">
        <nav className="relative z-10 rounded-2xl border border-white/20 bg-white/80 p-3 shadow-lg backdrop-blur-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500">
                  <span className="text-sm font-bold text-white">DOF</span>
                </div>
                <h1 className="max-w-[220px] truncate bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-base font-bold text-transparent sm:max-w-none sm:text-xl">
                  Desk of Finance
                </h1>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard/finance')}
                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                Back to Finance
              </button>

              <div className="hidden items-center space-x-2 text-xs text-gray-600 sm:flex sm:text-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                <span>System Online</span>
              </div>

              <button
                type="button"
                onClick={() => router.push('/dashboard/action-center')}
                className="flex w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-left transition hover:bg-amber-100 sm:w-auto"
              >
                <span className="text-base">🔔</span>
                <span className="text-xs font-semibold text-amber-800">Action Center</span>
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-300 px-1.5 text-[11px] font-bold text-amber-900">
                  {actionCenterTotalCount}
                </span>
              </button>

              <div className="hidden items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-left sm:flex">
                <div className="leading-tight">
                  <p className="max-w-[220px] truncate text-xs font-semibold text-slate-900">{displayName}</p>
                  <p className="truncate text-[11px] text-slate-500">{roleName}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-emerald-600 hover:to-cyan-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <div className="bg-white/90 rounded-3xl border border-cyan-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Finance Section</p>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Finance Customer Handling</h1>
            <p className="text-sm text-slate-600 mt-1">Loaded customer profile view with linked finance records and exposure details.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/dashboard/finance')}
            className="px-4 py-2 rounded-xl bg-white border border-cyan-200 text-cyan-800 text-sm font-semibold inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-cyan-100 bg-white/86 backdrop-blur-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Customers</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalCustomers}</p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-white/86 backdrop-blur-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Finance Records</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalRecords}</p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-white/86 backdrop-blur-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Total Exposure</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{formatAmount(totalExposure)}</p>
          </div>
        </div>

        <div className="bg-white/90 rounded-3xl border border-cyan-100 p-5">
          <div className="flex items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2">
            <Search className="h-4 w-4 text-cyan-700" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, customer no, NIC, or phone"
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-500 outline-none"
            />
          </div>
        </div>

        <div className="space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="bg-white/90 rounded-3xl border border-cyan-100 p-8 text-center">
              <UserCog className="h-10 w-10 text-cyan-700 mx-auto" />
              <p className="mt-3 text-lg font-bold text-slate-900">No finance customer details found</p>
              <p className="mt-1 text-sm text-slate-600">Try a different search term or create finance records first.</p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.customerId} className="bg-white/90 rounded-3xl border border-cyan-100 p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">{group.customerCode}</p>
                    <h2 className="text-lg font-extrabold text-slate-900 mt-1">{group.name}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span>NIC: <span className="font-semibold text-slate-800">{group.nic}</span></span>
                      <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{group.phone}</span>
                      <span>{group.email}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{group.address}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 min-w-[280px]">
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2 text-center">
                      <p className="text-[10px] uppercase font-bold tracking-wide text-cyan-700">Exposure</p>
                      <p className="text-sm font-bold text-slate-900">{formatAmount(group.totalFinanced)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-center">
                      <p className="text-[10px] uppercase font-bold tracking-wide text-emerald-700">Active</p>
                      <p className="text-sm font-bold text-slate-900">{group.activeCount}</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 text-center">
                      <p className="text-[10px] uppercase font-bold tracking-wide text-amber-700">Pending</p>
                      <p className="text-sm font-bold text-slate-900">{group.pendingCount}</p>
                    </div>
                  </div>
                </div>

                {(() => {
                  const currentPage = getCurrentPageForCustomer(group.customerId, group.records.length);
                  const pageCount = Math.max(1, Math.ceil(group.records.length / RECORDS_PER_PAGE));
                  const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
                  const pagedRecords = group.records.slice(startIndex, startIndex + RECORDS_PER_PAGE);

                  return (
                <div className="overflow-x-auto rounded-xl border border-cyan-100">
                  <table className="min-w-full text-sm text-left text-slate-700 bg-white">
                    <thead className="bg-cyan-50/70 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Finance ID</th>
                        <th className="px-3 py-2 font-semibold">Customer No</th>
                        <th className="px-3 py-2 font-semibold">Customer Name</th>
                        <th className="px-3 py-2 font-semibold">Phone</th>
                        <th className="px-3 py-2 font-semibold">NIC</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Product</th>
                        <th className="px-3 py-2 font-semibold">Financed</th>
                        <th className="px-3 py-2 font-semibold">Installment</th>
                        <th className="px-3 py-2 font-semibold">Terms</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRecords.map((record) => (
                        <tr key={record.id} className="border-b border-cyan-100 last:border-b-0">
                          <td className="px-3 py-2 font-semibold text-slate-900">#{record.id}</td>
                          <td className="px-3 py-2">{group.customerCode}</td>
                          <td className="px-3 py-2">{group.name}</td>
                          <td className="px-3 py-2">{group.phone}</td>
                          <td className="px-3 py-2">{group.nic}</td>
                          <td className="px-3 py-2 capitalize">{record.finance_type || '-'}</td>
                          <td className="px-3 py-2">{record.product_type || '-'}</td>
                          <td className="px-3 py-2">{formatAmount(record.financed_amount)}</td>
                          <td className="px-3 py-2">{formatAmount(record.installment_amount)}</td>
                          <td className="px-3 py-2">
                            {Number.isFinite(toNumber(record.interest_rate)) ? `${toNumber(record.interest_rate).toFixed(2)}%` : '-'} / {record.tenure_months || '-'} mo
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${record.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : record.status === 'pending_approval' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {record.status || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => openFullRecord(record.id)}
                              className="rounded-lg bg-cyan-100 hover:bg-cyan-200 border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-800 inline-flex items-center gap-1.5"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View Full Record
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {pageCount > 1 && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-cyan-100 bg-cyan-50/30">
                      <p className="text-xs text-slate-600">
                        Showing {startIndex + 1} - {Math.min(startIndex + RECORDS_PER_PAGE, group.records.length)} of {group.records.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomerPage(group.customerId, currentPage - 1, group.records.length)}
                          disabled={currentPage <= 1}
                          className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <span className="text-xs font-semibold text-slate-600">Page {currentPage} / {pageCount}</span>
                        <button
                          type="button"
                          onClick={() => setCustomerPage(group.customerId, currentPage + 1, group.records.length)}
                          disabled={currentPage >= pageCount}
                          className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center px-4 py-6">
          <div className="w-full max-w-5xl h-[88vh] rounded-2xl bg-white border border-cyan-100 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Full Finance Record</p>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  {selectedRecord ? `Finance #${selectedRecord.id}` : 'Loading Record'}
                </h3>
                <p className="text-sm text-slate-600 mt-1">Complete details with related documents.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setSelectedRecord(null);
                  setDetailError('');
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40 space-y-4">
              {detailLoading && (
                <div className="h-full min-h-[260px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
                </div>
              )}

              {!detailLoading && detailError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {detailError}
                </div>
              )}

              {!detailLoading && !detailError && selectedRecord && (
                <>
                  {(() => {
                    const customerPhotoUrl = resolveFinanceCustomerPhotoUrl(selectedRecord);
                    const customerSignatureUrl = resolveFinanceCustomerSignatureUrl(selectedRecord);

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-cyan-100 bg-white p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Customer Photo</p>
                          {customerPhotoUrl ? (
                            <div className="overflow-hidden rounded-xl border border-cyan-100 bg-cyan-50/40">
                              <Image
                                src={customerPhotoUrl}
                                alt="Customer photo"
                                width={640}
                                height={360}
                                className="h-52 w-full object-contain"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">Customer photo not available.</p>
                          )}
                        </div>

                        <div className="rounded-xl border border-cyan-100 bg-white p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Customer Signature</p>
                          {customerSignatureUrl ? (
                            <div className="overflow-hidden rounded-xl border border-cyan-100 bg-cyan-50/40">
                              <Image
                                src={customerSignatureUrl}
                                alt="Customer signature"
                                width={640}
                                height={360}
                                className="h-52 w-full object-contain"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">Customer signature not available.</p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const workflow = selectedRecord.repayment_plan?.approval_workflow;
                    const currentStep = Number(workflow?.current_step || 1);
                    const maxSteps = Number(workflow?.max_steps || 14);
                    const historyRows = Array.isArray(workflow?.history) ? workflow.history : [];
                    const reviewRows = Array.isArray(selectedRecord.repayment_plan?.review_data)
                      ? selectedRecord.repayment_plan?.review_data || []
                      : [];
                    const eventRows = Array.isArray(selectedRecord.workflowEvents) ? selectedRecord.workflowEvents : [];

                    return (
                      <div className="rounded-xl border border-cyan-100 bg-white p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Approval Workflow</p>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm mb-4">
                          <div><span className="text-slate-500">Current Step: </span><span className="font-semibold text-slate-900">{Number.isFinite(currentStep) ? currentStep : '-'}</span></div>
                          <div><span className="text-slate-500">Max Steps: </span><span className="font-semibold text-slate-900">{Number.isFinite(maxSteps) ? maxSteps : '-'}</span></div>
                          <div><span className="text-slate-500">Step Title: </span><span className="font-semibold text-slate-900">{workflow?.step_title || '-'}</span></div>
                          <div><span className="text-slate-500">Updated: </span><span className="font-semibold text-slate-900">{formatDateTime(workflow?.updated_at)}</span></div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="rounded-lg border border-cyan-100 bg-cyan-50/35 p-3">
                            <p className="text-xs font-bold text-cyan-800 mb-2">Step History</p>
                            {historyRows.length > 0 ? (
                              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                                {historyRows
                                  .slice()
                                  .reverse()
                                  .map((row, idx) => (
                                    <div key={`history-${idx}`} className="rounded-md border border-cyan-100 bg-white px-2.5 py-2 text-xs text-slate-700">
                                      <p className="font-semibold text-slate-900">
                                        Step {String(row?.from_step ?? '-')} {'->'} Step {String(row?.to_step ?? '-')}
                                      </p>
                                      <p className="text-slate-600">
                                        {String(row?.from_title || '-')} {'->'} {String(row?.to_title || '-')}
                                      </p>
                                      <p className="text-slate-500 mt-0.5">{formatDateTime(row?.changed_at)}</p>
                                      {String(row?.note || '').trim() !== '' && (
                                        <p className="mt-1 text-slate-700"><span className="font-semibold">Comment: </span>{String(row?.note || '')}</p>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">No workflow step history available.</p>
                            )}
                          </div>

                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/35 p-3">
                            <p className="text-xs font-bold text-emerald-800 mb-2">Approval Comments</p>
                            {reviewRows.length > 0 ? (
                              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                                {reviewRows
                                  .slice()
                                  .reverse()
                                  .map((row, idx) => (
                                    <div key={`review-${idx}`} className="rounded-md border border-emerald-100 bg-white px-2.5 py-2 text-xs text-slate-700">
                                      <p className="font-semibold text-slate-900">{formatWorkflowActionLabel(row?.action)}</p>
                                      <p className="text-slate-600">
                                        {String(row?.from_step_title || `Step ${String(row?.from_step ?? '-')}`)} {'->'} {String(row?.to_step_title || `Step ${String(row?.to_step ?? '-')}`)}
                                      </p>
                                      <p className="text-slate-500 mt-0.5">{formatDateTime(row?.reviewed_at)}</p>
                                      <p className="text-slate-500">By User ID: {String(row?.reviewed_by ?? '-')}</p>
                                      {String(row?.review_note || '').trim() !== '' ? (
                                        <p className="mt-1 text-slate-700"><span className="font-semibold">Comment: </span>{String(row?.review_note || '')}</p>
                                      ) : (
                                        <p className="mt-1 text-slate-500">No comment provided.</p>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">No approval comments recorded.</p>
                            )}
                          </div>

                          <div className="rounded-lg border border-indigo-100 bg-indigo-50/35 p-3">
                            <p className="text-xs font-bold text-indigo-800 mb-2">Workflow Events</p>
                            {eventRows.length > 0 ? (
                              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                                {eventRows.map((event) => (
                                  <div key={`event-${event.id}`} className="rounded-md border border-indigo-100 bg-white px-2.5 py-2 text-xs text-slate-700">
                                    <p className="font-semibold text-slate-900">{formatWorkflowActionLabel(event.event_type)}</p>
                                    <p className="text-slate-600">
                                      Step {String(event.from_step ?? '-')} {'->'} Step {String(event.to_step ?? '-')} ({event.step_title || '-'})
                                    </p>
                                    <p className="text-slate-500 mt-0.5">{formatDateTime(event.created_at)}</p>
                                    {String(event.note || '').trim() !== '' && (
                                      <p className="mt-1 text-slate-700"><span className="font-semibold">Comment: </span>{String(event.note || '')}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">No workflow events found.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Customer</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{`${selectedRecord.customer?.first_name || ''} ${selectedRecord.customer?.last_name || ''}`.trim() || '-'}</p>
                      <p className="text-xs text-slate-500 mt-1">{selectedRecord.customer?.customer_code || '-'}</p>
                      <p className="text-xs text-slate-500">NIC: {selectedRecord.customer?.nic_passport || '-'}</p>
                      <p className="text-xs text-slate-500">Phone: {selectedRecord.customer?.phone || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Agreement</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900 capitalize">{selectedRecord.finance_type || '-'}</p>
                      <p className="text-xs text-slate-500 mt-1">Product: {selectedRecord.product_type || '-'}</p>
                      <p className="text-xs text-slate-500">Status: {selectedRecord.status || '-'}</p>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Timeline</p>
                      <p className="mt-2 text-xs text-slate-500">Start: {formatDate(selectedRecord.start_date)}</p>
                      <p className="text-xs text-slate-500">Created: {formatDate(selectedRecord.created_at)}</p>
                      <p className="text-xs text-slate-500">Reference: {selectedRecord.asset_reference || '-'}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Financial Terms</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div><span className="text-slate-500">Asset Value: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.amount)}</span></div>
                      <div><span className="text-slate-500">Down Payment: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.down_payment)}</span></div>
                      <div><span className="text-slate-500">Financed: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.financed_amount)}</span></div>
                      <div><span className="text-slate-500">Interest: </span><span className="font-semibold text-slate-900">{Number.isFinite(toNumber(selectedRecord.interest_rate)) ? `${toNumber(selectedRecord.interest_rate).toFixed(2)}%` : '-'}</span></div>
                      <div><span className="text-slate-500">Interest Type: </span><span className="font-semibold text-slate-900 capitalize">{selectedRecord.interest_type || '-'}</span></div>
                      <div><span className="text-slate-500">Tenure: </span><span className="font-semibold text-slate-900">{selectedRecord.tenure_months || '-'} mo</span></div>
                      <div><span className="text-slate-500">Frequency: </span><span className="font-semibold text-slate-900 capitalize">{selectedRecord.installment_frequency || '-'}</span></div>
                      <div><span className="text-slate-500">Installment: </span><span className="font-semibold text-slate-900">{formatAmount(selectedRecord.installment_amount)}</span></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Vehicle Details</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-slate-500">Vehicle No: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.vehicle_no || '-'}</span></p>
                        <p><span className="text-slate-500">Chassis No: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.chassis_no || '-'}</span></p>
                        <p><span className="text-slate-500">Engine No: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.engine_no || '-'}</span></p>
                        <p><span className="text-slate-500">Make/Model: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.make_model || '-'}</span></p>
                        <p><span className="text-slate-500">Year: </span><span className="text-slate-900 font-semibold">{selectedRecord.vehicle_details?.year || '-'}</span></p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Valuation Details</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-slate-500">Amount: </span><span className="text-slate-900 font-semibold">{formatAmount(selectedRecord.valuation_details?.valuation_amount)}</span></p>
                        <p><span className="text-slate-500">Date: </span><span className="text-slate-900 font-semibold">{formatDate(selectedRecord.valuation_details?.valuation_date)}</span></p>
                        <p><span className="text-slate-500">Valuer: </span><span className="text-slate-900 font-semibold">{selectedRecord.valuation_details?.valuer_name || '-'}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Guarantors</p>
                    {Array.isArray(selectedRecord.guarantor_details) && selectedRecord.guarantor_details.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedRecord.guarantor_details.map((g, index) => (
                          <div key={`g-${index}`} className="rounded-lg border border-cyan-100 bg-cyan-50/35 p-3 text-sm">
                            <p><span className="text-slate-500">Name: </span><span className="text-slate-900 font-semibold">{g.name || '-'}</span></p>
                            <p><span className="text-slate-500">NIC: </span><span className="text-slate-900 font-semibold">{g.nic || '-'}</span></p>
                            <p><span className="text-slate-500">Phone: </span><span className="text-slate-900 font-semibold">{g.phone || '-'}</span></p>
                            <p><span className="text-slate-500">Address: </span><span className="text-slate-900 font-semibold">{g.address || '-'}</span></p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No guarantor details found.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 mb-3">Documents</p>
                    {Array.isArray(selectedRecord.documents) && selectedRecord.documents.length > 0 ? (
                      <div className="space-y-2">
                        {selectedRecord.documents.map((doc) => (
                          <div key={doc.id} className="rounded-lg border border-cyan-100 bg-cyan-50/35 px-3 py-2 text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{doc.original_name || 'Unnamed file'}</span>
                            <span className="text-slate-500"> ({doc.document_type || 'document'})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No documents uploaded.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
