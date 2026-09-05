'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Coins,
  Globe,
  Landmark,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserCircle2,
  Wallet,
  X,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

interface Company {
  id: number;
  name: string;
  email: string;
  address: string;
  phone: string;
  website: string;
  manager_user_id?: number | null;
  is_main_branch?: boolean;
  business_owner_user_id?: number | null;
  ceo_user_id?: number | null;
  regional_manager_user_id?: number | null;
  opening_asset?: string | number | null;
  manager?: {
    id: number;
    name: string;
    email: string;
  } | null;
  business_owner?: {
    id: number;
    name: string;
    email: string;
  } | null;
  ceo?: {
    id: number;
    name: string;
    email: string;
  } | null;
  regional_manager?: {
    id: number;
    name: string;
    email: string;
  } | null;
  leadership_assignments?: Array<{
    id: number;
    role_type: LeadershipRoleType;
    user_id: number;
    user?: {
      id: number;
      name: string;
      email: string;
    } | null;
  }>;
  created_at: string;
  updated_at: string;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

const inputClass =
  'w-full rounded-xl border border-teal-200/80 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200/80 placeholder:text-slate-400 [color-scheme:light]';

const labelClass = 'block text-xs font-bold text-slate-700 mb-1.5';

function formatMoney(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extractMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data;
  if (typeof data === 'object' && data && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }
  return fallback;
}

type BankFormRow = {
  key: string;
  bank_name: string;
  bank_branch: string;
  account_number: string;
  account_name: string;
  opening_balance: string;
};

type LeadershipRoleType = 'business_owner' | 'ceo' | 'regional_manager' | 'zonal_manager';

type LeadershipFormRow = {
  key: string;
  role_type: LeadershipRoleType;
  user_id: string;
};

const leadershipRoleOptions: Array<{ value: LeadershipRoleType; label: string }> = [
  { value: 'business_owner', label: 'Business Owner' },
  { value: 'ceo', label: 'CEO' },
  { value: 'regional_manager', label: 'Regional Manager' },
  { value: 'zonal_manager', label: 'Zonal Manager' },
];

function roleLabel(roleType: LeadershipRoleType): string {
  const hit = leadershipRoleOptions.find((option) => option.value === roleType);
  return hit?.label || roleType;
}

function newLeadershipRow(roleType: LeadershipRoleType = 'regional_manager'): LeadershipFormRow {
  return {
    key: `leader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role_type: roleType,
    user_id: '',
  };
}

function defaultLeadershipRows(): LeadershipFormRow[] {
  return [
    newLeadershipRow('business_owner'),
    newLeadershipRow('ceo'),
    newLeadershipRow('regional_manager'),
  ];
}

function leadershipNames(company: Company, roleType: LeadershipRoleType): string[] {
  const fromAssignments = Array.isArray(company.leadership_assignments)
    ? company.leadership_assignments
        .filter((row) => row.role_type === roleType)
        .map((row) => String(row.user?.name || '').trim())
        .filter(Boolean)
    : [];

  if (fromAssignments.length > 0) {
    return Array.from(new Set(fromAssignments));
  }

  if (roleType === 'business_owner' && company.business_owner?.name) {
    return [company.business_owner.name];
  }

  if (roleType === 'ceo' && company.ceo?.name) {
    return [company.ceo.name];
  }

  if (roleType === 'regional_manager' && company.regional_manager?.name) {
    return [company.regional_manager.name];
  }

  return [];
}

function newBankRow(): BankFormRow {
  return {
    key: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    bank_name: '',
    bank_branch: '',
    account_number: '',
    account_name: '',
    opening_balance: '0',
  };
}

export default function Branches() {
  const router = useRouter();
  const widgetPrefix = 'branches_dashboard_widget_';

  const [token, setToken] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; company: Company | null }>({
    open: false,
    company: null,
  });
  const [deleting, setDeleting] = useState(false);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [managerUserId, setManagerUserId] = useState('');
  const [leadershipRows, setLeadershipRows] = useState<LeadershipFormRow[]>(defaultLeadershipRows());
  const [openingAsset, setOpeningAsset] = useState('0');
  const [cashOpeningBalance, setCashOpeningBalance] = useState('0');
  const [bankRows, setBankRows] = useState<BankFormRow[]>([newBankRow()]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
    fetchCompanies(storedToken);
    fetchUsers(storedToken);
    void fetchWidgetPreferences(storedToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((company) => {
      const haystack = [
        company.name,
        company.email,
        company.phone,
        company.address,
        company.manager?.name,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [companies, searchQuery]);

  const stats = useMemo(() => {
    const totalOpening = companies.reduce((sum, c) => sum + Number(c.opening_asset || 0), 0);
    const withManager = companies.filter((c) => c.manager?.name).length;
    const mainBranch = companies.find((c) => c.is_main_branch) || null;
    return {
      total: companies.length,
      withManager,
      totalOpening,
      mainBranch,
    };
  }, [companies]);
  const statCards = [
    { key: 'total_branches', label: 'Total branches', value: stats.total, sub: 'Active locations', icon: Building2, accent: 'from-teal-500 to-emerald-600' },
    { key: 'with_manager', label: 'With manager', value: stats.withManager, sub: 'Assigned leadership', icon: UserCircle2, accent: 'from-blue-500 to-indigo-600' },
    { key: 'opening_assets', label: 'Opening assets', value: formatMoney(stats.totalOpening), sub: 'Combined main balances', icon: Landmark, accent: 'from-violet-500 to-purple-600' },
  ];
  const showHeroWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}hero`);
  const showStatsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}stats`);
  const showNoticeWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}notice`);
  const showSearchListWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}search_list`);
  const visibleStatCards = statCards.filter((card) => !hiddenWidgetKeys.includes(`${widgetPrefix}stat_${card.key}`));
  const showAnyWidget = showHeroWidget || showStatsWidget || showNoticeWidget || showSearchListWidget;

  const mainBranchId = useMemo(() => {
    const flagged = companies.find((company) => company.is_main_branch);
    if (flagged) return flagged.id;

    if (companies.length === 0) return null;
    const first = [...companies].sort((a, b) => a.id - b.id)[0];
    return first?.id ?? null;
  }, [companies]);

  const isCreatingFirstBranch = !editingCompany && companies.length === 0;
  const isEditingMainBranch = Boolean(editingCompany && mainBranchId && editingCompany.id === mainBranchId);
  const showMainBranchSetup = isCreatingFirstBranch || isEditingMainBranch;

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
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
  }, []);

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
          `${getApiBaseUrl()}/dashboard/widgets`,
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
    [token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string) => {
      setHiddenWidgetKeys((prev) => (prev.includes(widgetKey) ? prev : [...prev, widgetKey]));
      await saveWidgetPreference(widgetKey, false);
    },
    [saveWidgetPreference]
  );

  const fetchUsers = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      // Primary source: load all users linked to employees (paginated).
      const employeeUsers: UserOption[] = [];
      const seen = new Set<number>();
      let page = 1;
      let lastPage = 1;

      do {
        const employeeResponse = await axios.get(`/api/hr/employees`, {
          headers: { Authorization: `Bearer ${tokenToUse}` },
          params: { page },
        });

        const employeePayload: unknown = employeeResponse.data;
        const employeePayloadRecord = (employeePayload && typeof employeePayload === 'object')
          ? (employeePayload as { data?: unknown; last_page?: unknown })
          : null;
        const employeeRows = Array.isArray(employeePayload)
          ? employeePayload
          : (Array.isArray(employeePayloadRecord?.data) ? employeePayloadRecord.data : []);

        employeeRows.forEach((row: any) => {
          const userId = Number(row?.user?.id || 0);
          if (userId <= 0 || seen.has(userId)) return;

          const firstName = String(row?.first_name || '').trim();
          const lastName = String(row?.last_name || '').trim();
          const fullName = `${firstName} ${lastName}`.trim();

          employeeUsers.push({
            id: userId,
            name: fullName || String(row?.user?.email || `User #${userId}`),
            email: String(row?.user?.email || row?.email || ''),
          });
          seen.add(userId);
        });

        const parsedLastPage = Number(employeePayloadRecord?.last_page || 1);
        lastPage = Number.isFinite(parsedLastPage) && parsedLastPage > 0 ? parsedLastPage : 1;
        page += 1;
      } while (page <= lastPage && page <= 100);

      if (employeeUsers.length > 0) {
        setUsers(employeeUsers);
        return;
      }

      // Fallback: if there are no employee-linked users, use manager-candidates endpoint.
      const response = await axios.get(`/api/manager-candidates`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });

      const payload: unknown = response.data;
      const payloadRecord = (payload && typeof payload === 'object') ? (payload as { data?: unknown }) : null;
      const rows = Array.isArray(payload)
        ? payload
        : (Array.isArray(payloadRecord?.data) ? payloadRecord.data : []);

      const normalizedRows: UserOption[] = rows
        .map((user: { id: number; name?: string; email?: string }) => ({
          id: Number(user.id),
          name: String(user.name || 'Unknown User'),
          email: String(user.email || ''),
        }))
        .filter((user) => user.id > 0);

      setUsers(normalizedRows);
    } catch {
      setUsers([]);
    }
  };

  const fetchCompanies = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    setListLoading(true);
    try {
      const response = await axios.get(`/api/companies`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      setCompanies(response.data.data || response.data || []);
    } catch {
      setCompanies([]);
      setNotice({ type: 'error', text: 'Failed to load branches.' });
    } finally {
      setListLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setAddress('');
    setPhone('');
    setWebsite('');
    setManagerUserId('');
    setLeadershipRows(defaultLeadershipRows());
    setOpeningAsset('0');
    setCashOpeningBalance('0');
    setBankRows([newBankRow()]);
    setEditingCompany(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const addLeadershipRow = (roleType: LeadershipRoleType = 'regional_manager') => {
    setLeadershipRows((rows) => [...rows, newLeadershipRow(roleType)]);
  };

  const removeLeadershipRow = (key: string) => {
    setLeadershipRows((rows) => {
      if (rows.length <= 1) {
        return rows;
      }

      return rows.filter((row) => row.key !== key);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);

    const formData: Record<string, unknown> = {
      name,
      email,
      address,
      phone,
      website,
      manager_user_id: managerUserId ? Number(managerUserId) : null,
      opening_asset: openingAsset ? Number(openingAsset) : 0,
    };

    if (showMainBranchSetup) {
      const leadershipAssignments = leadershipRows
        .map((row) => ({
          role_type: row.role_type,
          user_id: row.user_id ? Number(row.user_id) : 0,
        }))
        .filter((row) => row.user_id > 0);

      formData.leadership_assignments = leadershipAssignments;
    }

    if (!editingCompany) {
      formData.cash_opening_balance = cashOpeningBalance ? Number(cashOpeningBalance) : 0;

      const bankAccounts = bankRows
        .filter((row) => row.bank_name.trim())
        .map((row) => ({
          bank_name: row.bank_name.trim(),
          bank_branch: row.bank_branch.trim() || null,
          account_number: row.account_number.trim() || null,
          account_name: row.account_name.trim() || null,
          opening_balance: row.opening_balance ? Number(row.opening_balance) : 0,
        }));

      if (bankAccounts.length > 0) {
        formData.bank_accounts = bankAccounts;
      }
    }

    try {
      if (editingCompany) {
        await axios.put(`/api/companies/${editingCompany.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setNotice({ type: 'success', text: 'Branch updated successfully.' });
      } else {
        await axios.post(`/api/companies`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setNotice({ type: 'success', text: 'Branch created with main, cash, and bank account(s).' });
      }
      await fetchCompanies();
      setShowForm(false);
      resetForm();
    } catch (error) {
      setNotice({
        type: 'error',
        text: extractMessage(error, 'Failed to save branch. Please try again.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (company: Company) => {
    if (users.length === 0) {
      void fetchUsers();
    }

    setEditingCompany(company);
    setName(company.name);
    setEmail(company.email);
    setAddress(company.address || '');
    setPhone(company.phone || '');
    setWebsite(company.website || '');
    setManagerUserId(company.manager_user_id ? String(company.manager_user_id) : '');

    const normalizedAssignments = Array.isArray(company.leadership_assignments)
      ? company.leadership_assignments
          .filter((row) => row && row.user_id)
          .map((row) => ({
            key: `leader-existing-${row.id}`,
            role_type: row.role_type,
            user_id: String(row.user_id),
          }))
      : [];

    if (normalizedAssignments.length > 0) {
      setLeadershipRows(normalizedAssignments);
    } else {
      const legacyRows: LeadershipFormRow[] = [];
      if (company.business_owner_user_id) {
        legacyRows.push({
          key: `legacy-owner-${company.id}`,
          role_type: 'business_owner',
          user_id: String(company.business_owner_user_id),
        });
      }
      if (company.ceo_user_id) {
        legacyRows.push({
          key: `legacy-ceo-${company.id}`,
          role_type: 'ceo',
          user_id: String(company.ceo_user_id),
        });
      }
      if (company.regional_manager_user_id) {
        legacyRows.push({
          key: `legacy-regional-${company.id}`,
          role_type: 'regional_manager',
          user_id: String(company.regional_manager_user_id),
        });
      }

      setLeadershipRows(legacyRows.length > 0 ? legacyRows : defaultLeadershipRows());
    }

    setOpeningAsset(String(company.opening_asset ?? 0));
    setShowForm(true);
  };

  const confirmDelete = async () => {
    if (!deleteModal.company) return;

    setDeleting(true);
    setNotice(null);

    try {
      await axios.delete(`/api/companies/${deleteModal.company.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotice({ type: 'success', text: 'Branch deleted successfully.' });
      setDeleteModal({ open: false, company: null });
      await fetchCompanies();
    } catch (error) {
      setNotice({
        type: 'error',
        text: extractMessage(error, 'Failed to delete branch. It may be linked to other records.'),
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/60 to-emerald-50 p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-20 left-0 h-80 w-80 rounded-full bg-teal-300/40 blur-3xl" />
        <div className="absolute top-10 right-0 h-96 w-96 rounded-full bg-emerald-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {widgetNotice ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-5 text-sm font-semibold text-teal-900">
            All widgets are currently hidden. Use `Restore Hidden Widgets` from the main dashboard to show them again.
          </div>
        ) : null}

        {/* Hero */}
        {showHeroWidget ? (
        <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}hero`)}
              className="absolute right-4 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white hover:bg-white/30"
              aria-label="Hide branch hero widget"
            >
              <X className="h-4 w-4" />
            </button>
          </WidgetCloseGate>
          <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
                  <Building2 className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-100">Organization</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">Branch Management</h1>
                  <p className="text-sm text-teal-50/95 mt-1 max-w-2xl">
                    Create branches with opening main, cash, and bank accounts. Open a branch to access its module dashboard.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fetchCompanies()}
                  disabled={listLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-teal-700 hover:bg-teal-50 shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add branch
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {/* KPIs */}
        {showStatsWidget ? (
          <div className="relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}stats`)}
                className="absolute right-2 -top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-teal-200 bg-white text-teal-700 hover:bg-teal-50"
                aria-label="Hide branch stats widget"
              >
                <X className="h-4 w-4" />
              </button>
            </WidgetCloseGate>
            {visibleStatCards.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {visibleStatCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.key} className="relative rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                      <WidgetCloseGate>
                        <button
                          type="button"
                          onClick={() => void hideWidget(`${widgetPrefix}stat_${item.key}`)}
                          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-teal-200 bg-white text-teal-700 hover:bg-teal-50"
                          aria-label={`Hide ${item.label} stat widget`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </WidgetCloseGate>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                          <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">{item.value}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{item.sub}</p>
                        </div>
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.accent} text-white shadow-sm`}>
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm font-medium text-teal-900">
                All branch stats are hidden.
              </div>
            )}
          </div>
        ) : null}

        {notice && showNoticeWidget ? (
          <div
            className={`relative flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}notice`)}
                className="absolute right-3 top-3 rounded-lg p-1 hover:bg-black/5"
                aria-label="Hide branch notice widget"
              >
                <X className="h-4 w-4" />
              </button>
            </WidgetCloseGate>
            <div className="flex items-start gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{notice.text}</span>
            </div>
            <button type="button" onClick={() => setNotice(null)} className="rounded-lg p-1 hover:bg-black/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* Search + grid */}
        {showSearchListWidget ? (
        <div className="relative rounded-3xl border border-white/80 bg-white/90 shadow-lg overflow-hidden">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}search_list`)}
              className="absolute right-4 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-teal-200 bg-white text-teal-700 hover:bg-teal-50"
              aria-label="Hide branch list widget"
            >
              <X className="h-4 w-4" />
            </button>
          </WidgetCloseGate>
          <div className="border-b border-teal-100 px-4 sm:px-6 py-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-500/70" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search branch name, email, manager…"
                className="w-full rounded-xl border border-teal-100 bg-white py-2.5 pl-10 pr-3 text-sm text-black focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {listLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                <p className="text-sm font-medium text-slate-600">Loading branches…</p>
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="h-10 w-10 text-teal-500 mx-auto" />
                <p className="mt-3 text-lg font-bold text-slate-900">
                  {companies.length === 0 ? 'No branches yet' : 'No matching branches'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {companies.length === 0
                    ? 'Create your first branch with opening accounting balances and main-branch leadership assignments.'
                    : 'Try a different search term.'}
                </p>
                {companies.length === 0 ? (
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add branch
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredCompanies.map((company) => (
                  <div
                    key={company.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/dashboard/branches/${company.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/dashboard/branches/${company.id}`);
                      }
                    }}
                    className="group rounded-2xl border border-teal-100 bg-white hover:border-teal-200 hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                  >
                    <div className="h-1.5 bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500" />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(company);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModal({ open: true, company });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>

                      <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-teal-800 transition-colors">
                        {company.name}
                      </h3>
                      {mainBranchId && company.id === mainBranchId ? (
                        <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          Main Branch
                        </div>
                      ) : null}
                      <p className="text-sm text-slate-600 mt-0.5 flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {company.email}
                      </p>

                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        {company.phone ? (
                          <p className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                            {company.phone}
                          </p>
                        ) : null}
                        {company.address ? (
                          <p className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-600 mt-0.5" />
                            <span className="line-clamp-2">{company.address}</span>
                          </p>
                        ) : null}
                        {company.website ? (
                          <p className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                            <span className="truncate text-teal-700">{company.website}</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-4 pt-4 border-t border-teal-50 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-slate-500">Manager</p>
                          <p className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                            {company.manager?.name || 'Not assigned'}
                          </p>
                        </div>
                        <div className="rounded-xl bg-teal-50/70 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-teal-700">Main opening</p>
                          <p className="text-xs font-bold text-slate-900 mt-0.5 tabular-nums">
                            {formatMoney(company.opening_asset)}
                          </p>
                        </div>
                      </div>

                      {mainBranchId && company.id === mainBranchId ? (
                        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-[11px] text-amber-900 space-y-1">
                          {(['business_owner', 'ceo', 'regional_manager', 'zonal_manager'] as LeadershipRoleType[]).map((roleType) => {
                            const names = leadershipNames(company, roleType);
                            return (
                              <p key={`${company.id}-${roleType}`}>
                                <span className="font-bold">{roleLabel(roleType)}:</span> {names.length > 0 ? names.join(', ') : 'Not assigned'}
                              </p>
                            );
                          })}
                        </div>
                      ) : null}

                      <p className="mt-3 text-[11px] font-semibold text-teal-700">Open branch dashboard →</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        ) : null}
      </div>

      {/* Add / Edit modal */}
      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/55 backdrop-blur-md">
          <div className="w-full max-w-2xl max-h-[94vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
            <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 px-5 py-4 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-100">
                    {editingCompany ? 'Update branch' : 'New branch setup'}
                  </p>
                  <h2 className="text-xl font-extrabold text-white mt-0.5">
                    {editingCompany ? editingCompany.name : 'Add branch'}
                  </h2>
                  {!editingCompany ? (
                    <p className="text-sm text-teal-50 mt-1">Profile details + starting accounting accounts</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-lg border border-white/30 bg-white/10 p-2 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="rounded-2xl border border-teal-100 bg-teal-50/40 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">Branch profile</p>
                <p className="text-xs text-slate-600 mt-0.5">Contact and location information</p>
              </div>

              {showMainBranchSetup ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                  <p className="text-sm font-bold text-amber-900">Main branch leadership setup</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    {isCreatingFirstBranch
                      ? 'This first branch will be marked as the Main Branch.'
                      : 'Main Branch leadership assignments can be updated here.'}
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Branch name *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>Email *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Address</label>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Website</label>
                  <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Branch manager</label>
                  <select value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)} className={inputClass}>
                    <option value="">Not assigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

                {showMainBranchSetup ? (
                  <div className="sm:col-span-2 rounded-2xl border border-amber-100 bg-white/90 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Leadership assignments</p>
                      <button
                        type="button"
                        onClick={() => addLeadershipRow('zonal_manager')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add assignment
                      </button>
                    </div>

                    <div className="space-y-3">
                      {leadershipRows.map((row) => (
                        <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_auto] gap-2 items-end rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                          <div>
                            <label className={labelClass}>Position</label>
                            <select
                              value={row.role_type}
                              onChange={(e) =>
                                setLeadershipRows((rows) =>
                                  rows.map((item) =>
                                    item.key === row.key
                                      ? { ...item, role_type: e.target.value as LeadershipRoleType }
                                      : item
                                  )
                                )
                              }
                              className={inputClass}
                            >
                              {leadershipRoleOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className={labelClass}>Assigned user</label>
                            <select
                              value={row.user_id}
                              onChange={(e) =>
                                setLeadershipRows((rows) =>
                                  rows.map((item) =>
                                    item.key === row.key ? { ...item, user_id: e.target.value } : item
                                  )
                                )
                              }
                              className={inputClass}
                            >
                              <option value="">Not assigned</option>
                              {users.map((user) => (
                                <option key={`${row.key}-${user.id}`} value={user.id}>
                                  {user.name} ({user.email})
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeLeadershipRow(row.key)}
                            disabled={leadershipRows.length <= 1}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-amber-800/90">
                      Multiple users can be assigned to the same position (for example multiple Regional Managers or Zonal Managers).
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3">
                <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-violet-700" />
                  Opening accounting
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {editingCompany
                    ? 'Adjust balances in Accounting → Account Setup.'
                    : 'Main, cash, and optional bank accounts are created automatically.'}
                </p>
              </div>

              <div>
                <label className={labelClass}>Main account opening balance (LKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingAsset}
                  onChange={(e) => setOpeningAsset(e.target.value)}
                  className={inputClass}
                />
              </div>

              {!editingCompany ? (
                <>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
                    <p className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                      <Coins className="h-4 w-4" />
                      Cash account
                    </p>
                    <div>
                      <label className={labelClass}>Cash opening amount *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashOpeningBalance}
                        onChange={(e) => setCashOpeningBalance(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        Bank accounts (optional)
                      </p>
                      <button
                        type="button"
                        onClick={() => setBankRows((rows) => [...rows, newBankRow()])}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add another bank
                      </button>
                    </div>

                    <div className="space-y-4">
                      {bankRows.map((row, index) => (
                        <div key={row.key} className="rounded-xl border border-blue-100 bg-white p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                              Bank account {index + 1}
                            </p>
                            {bankRows.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => setBankRows((rows) => rows.filter((item) => item.key !== row.key))}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remove
                              </button>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2">
                              <label className={labelClass}>Bank name</label>
                              <input
                                value={row.bank_name}
                                onChange={(e) =>
                                  setBankRows((rows) =>
                                    rows.map((item) =>
                                      item.key === row.key ? { ...item, bank_name: e.target.value } : item
                                    )
                                  )
                                }
                                className={inputClass}
                                placeholder="Commercial Bank"
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Branch</label>
                              <input
                                value={row.bank_branch}
                                onChange={(e) =>
                                  setBankRows((rows) =>
                                    rows.map((item) =>
                                      item.key === row.key ? { ...item, bank_branch: e.target.value } : item
                                    )
                                  )
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Account number</label>
                              <input
                                value={row.account_number}
                                onChange={(e) =>
                                  setBankRows((rows) =>
                                    rows.map((item) =>
                                      item.key === row.key ? { ...item, account_number: e.target.value } : item
                                    )
                                  )
                                }
                                className={inputClass}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelClass}>Display name</label>
                              <input
                                value={row.account_name}
                                onChange={(e) =>
                                  setBankRows((rows) =>
                                    rows.map((item) =>
                                      item.key === row.key ? { ...item, account_name: e.target.value } : item
                                    )
                                  )
                                }
                                className={inputClass}
                                placeholder="Operations current account"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelClass}>Opening balance (LKR)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.opening_balance}
                                onChange={(e) =>
                                  setBankRows((rows) =>
                                    rows.map((item) =>
                                      item.key === row.key ? { ...item, opening_balance: e.target.value } : item
                                    )
                                  )
                                }
                                className={inputClass}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-blue-800/80">
                      Leave bank name empty to skip a row. You can add more banks later in Accounting → Account Setup.
                    </p>
                  </div>
                </>
              ) : null}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : editingCompany ? 'Update branch' : 'Create branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete modal */}
      {deleteModal.open && deleteModal.company ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-rose-500 to-red-600 px-5 py-4 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-white" />
              <h3 className="text-lg font-extrabold text-white">Delete branch</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-700">
                Are you sure you want to delete <span className="font-bold">{deleteModal.company.name}</span>? This cannot
                be undone if the branch has linked records.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteModal({ open: false, company: null })}
                  disabled={deleting}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
