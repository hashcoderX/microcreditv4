'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type MFRoute = {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
};

type MFGroup = {
  id: number;
  mf_route_id: number;
  mf_center_id: number;
  name: string;
  code: string;
  is_active: boolean;
  route?: { id: number; name: string; code: string };
  center?: { id: number; name: string; code: string; mf_route_id: number };
};

type MFCenter = {
  id: number;
  mf_route_id: number;
  name: string;
  code: string;
  meeting_day: string | null;
  is_active: boolean;
  route?: { id: number; name: string; code: string };
};

type MFPenaltySetting = {
  id: number;
  penalty_rate: number;
  is_active: boolean;
};

type LoanLifecycleRow = {
  id: number;
  loan_code?: string | null;
  customer_no?: string | null;
  customer_name?: string | null;
  field_officer?: string | null;
  status?: string | null;
  refund_option?: 'day' | 'week' | 'month' | string | null;
  installment_amount?: number | string | null;
  assumed_month_days?: number | null;
  due_date?: string | null;
  next_payment_date?: string | null;
  arrears_balance?: number | string | null;
};

type MFLoanProduct = {
  id: number;
  name: string;
  min_loan_amount?: number | string | null;
  max_loan_amount?: number | string | null;
  document_charge_percentage?: number | string | null;
  stamp_charge_percentage?: number | string | null;
  insurance_charge_percentage?: number | string | null;
  interest_rate: number;
  interest_type: 'flat' | 'reducing';
  terms_count: number;
  refund_option: 'day' | 'week' | 'month';
  assumed_month_days?: number;
  is_active: boolean;
};

type TabType = 'routes' | 'groups' | 'centers' | 'loan_products' | 'penalty' | 'loan_lifecycle';
type DeleteType = 'routes' | 'groups' | 'centers' | 'loan-products';

const API_BASE = '/api/microfinance/settings';
const shellCardClass =
  'bg-white/80 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_24px_65px_-30px_rgba(14,116,144,0.5)]';
const inputClass =
  'w-full rounded-xl border border-cyan-100 bg-white/95 px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200';
const fieldLabelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-600';
const fieldHintClass = 'text-[11px] text-slate-500';

const tabs: Array<{ key: TabType; label: string; icon: string; desc: string }> = [
  { key: 'routes', label: 'Routes', icon: '🛣️', desc: 'Manage field routes' },
  { key: 'centers', label: 'Centers', icon: '🏢', desc: 'Configure centers' },
  { key: 'groups', label: 'Groups', icon: '👥', desc: 'Build borrower groups' },
  { key: 'loan_products', label: 'Loan Products', icon: '💳', desc: 'Product setup' },
  { key: 'penalty', label: 'Penalty Rate', icon: '📈', desc: 'Late fee settings' },
  { key: 'loan_lifecycle', label: 'Loan Hold/Close', icon: '⏸️', desc: 'Lifecycle actions' },
];

const CENTER_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const formatCenterDay = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return 'N/A';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

export default function MicrofinanceSettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('routes');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());

  const [routes, setRoutes] = useState<MFRoute[]>([]);
  const [groups, setGroups] = useState<MFGroup[]>([]);
  const [centers, setCenters] = useState<MFCenter[]>([]);
  const [loanProducts, setLoanProducts] = useState<MFLoanProduct[]>([]);
  const [penaltySetting, setPenaltySetting] = useState<MFPenaltySetting | null>(null);
  const [loanLifecycleRows, setLoanLifecycleRows] = useState<LoanLifecycleRow[]>([]);

  const [routeForm, setRouteForm] = useState({ id: 0, name: '', code: '', is_active: true });
  const [groupForm, setGroupForm] = useState({ id: 0, mf_route_id: 0, mf_center_id: 0, name: '', code: '', is_active: true });
  const [centerForm, setCenterForm] = useState({ id: 0, mf_route_id: 0, name: '', code: '', meeting_day: '', is_active: true });
  const [loanProductForm, setLoanProductForm] = useState({
    id: 0,
    name: '',
    min_loan_amount: '',
    max_loan_amount: '',
    document_charge_percentage: '',
    stamp_charge_percentage: '',
    insurance_charge_percentage: '',
    interest_rate: '',
    interest_type: 'flat' as 'flat' | 'reducing',
    terms_count: '',
    refund_option: 'month' as 'day' | 'week' | 'month',
    assumed_month_days: '30',
    is_active: true,
  });
  const [penaltyForm, setPenaltyForm] = useState({ id: 0, penalty_rate: '', is_active: true });
  const [routeLoading, setRouteLoading] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [centerLoading, setCenterLoading] = useState(false);
  const [loanProductLoading, setLoanProductLoading] = useState(false);
  const [penaltyLoading, setPenaltyLoading] = useState(false);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleActionLoading, setLifecycleActionLoading] = useState(false);
  const [lifecycleSearch, setLifecycleSearch] = useState('');
  const [lifecycleStatusFilter, setLifecycleStatusFilter] = useState<'all' | 'requested' | 'approved' | 'released' | 'hold'>('all');
  const [lifecycleActionFilter, setLifecycleActionFilter] = useState<'all' | 'can_hold' | 'can_close'>('all');
  const [modal, setModal] = useState({ open: false, title: '', message: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: DeleteType | null; id: number | null }>({
    open: false,
    type: null,
    id: null,
  });
  const [lifecycleModal, setLifecycleModal] = useState<{
    open: boolean;
    action: 'hold' | 'close';
    reason: string;
    loan: LoanLifecycleRow | null;
  }>({
    open: false,
    action: 'hold',
    reason: '',
    loan: null,
  });

  const openModal = useCallback((message: string, title = 'Notice') => {
    setModal({ open: true, title, message });
  }, []);

  const closeModal = useCallback(() => {
    setModal({ open: false, title: '', message: '' });
  }, []);

  const widgetPrefix = 'mf_settings_widget_';

  const fetchWidgetPreferences = async (authToken: string) => {
    try {
      const response = await axios.get('/api/dashboard/widgets', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of rows) {
        const key = String(row?.widget_key || '').trim();
        if (!key.startsWith(widgetPrefix)) continue;
        if (row?.is_visible === false) nextHidden.add(key);
      }
      setHiddenWidgetKeys(nextHidden);
    } catch {
      setHiddenWidgetKeys(new Set());
    }
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        '/api/dashboard/widgets',
        { widget_key: widgetKey, is_visible: isVisible },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );
      return true;
    } catch {
      return false;
    }
  };

  const hideWidget = async (widgetKey: string) => {
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);

    const ok = await saveWidgetPreference(widgetKey, false);
    if (!ok) {
      setHiddenWidgetKeys(previous);
      openModal('Failed to hide this widget. Please try again.', 'Widget Update Failed');
    }
  };

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }),
    [token]
  );

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
    void fetchWidgetPreferences(storedToken);
  }, [router]);

  const loadAll = useCallback(async () => {
    try {
      const [routeRes, groupRes, centerRes, loanProductRes, penaltyRes, loanRes] = await Promise.all([
        axios.get(`${API_BASE}/routes`, { headers }),
        axios.get(`${API_BASE}/groups`, { headers }),
        axios.get(`${API_BASE}/centers`, { headers }),
        axios.get(`${API_BASE}/loan-products`, { headers }),
        axios.get(`${API_BASE}/penalty-rate`, { headers }),
        axios.get('/api/microfinance/loan-requests', { headers }),
      ]);

      setRoutes(routeRes.data);
      setGroups(groupRes.data);
      setCenters(centerRes.data);
      setLoanProducts(Array.isArray(loanProductRes.data) ? loanProductRes.data : []);
      setPenaltySetting(penaltyRes.data);
      const loanRows = Array.isArray(loanRes.data) ? loanRes.data : [];
      setLoanLifecycleRows(
        loanRows
          .filter((loan: LoanLifecycleRow) => {
            const status = String(loan.status || '').toLowerCase();
            return ['requested', 'approved', 'released', 'hold'].includes(status);
          })
          .sort((a: LoanLifecycleRow, b: LoanLifecycleRow) => Number(b.id || 0) - Number(a.id || 0))
      );
      if (penaltyRes.data) {
        setPenaltyForm({
          id: penaltyRes.data.id,
          penalty_rate: String(penaltyRes.data.penalty_rate ?? ''),
          is_active: penaltyRes.data.is_active ?? true,
        });
      } else {
        setPenaltyForm({ id: 0, penalty_rate: '', is_active: true });
      }
    } catch {
      openModal('Failed to load microfinance settings.', 'Error');
    }
  }, [headers, openModal]);

  useEffect(() => {
    if (!token) return;
    void loadAll();
  }, [token, loadAll]);

  const resetRouteForm = () => setRouteForm({ id: 0, name: '', code: '', is_active: true });
  const resetGroupForm = () => setGroupForm({ id: 0, mf_route_id: 0, mf_center_id: 0, name: '', code: '', is_active: true });
  const resetCenterForm = () => setCenterForm({ id: 0, mf_route_id: 0, name: '', code: '', meeting_day: '', is_active: true });
  const resetLoanProductForm = () =>
    setLoanProductForm({
      id: 0,
      name: '',
      min_loan_amount: '',
      max_loan_amount: '',
      document_charge_percentage: '',
      stamp_charge_percentage: '',
      insurance_charge_percentage: '',
      interest_rate: '',
      interest_type: 'flat',
      terms_count: '',
      refund_option: 'month',
      assumed_month_days: '30',
      is_active: true,
    });
  const resetPenaltyForm = () =>
    setPenaltyForm({
      id: penaltySetting?.id ?? 0,
      penalty_rate: penaltySetting ? String(penaltySetting.penalty_rate ?? '') : '',
      is_active: penaltySetting?.is_active ?? true,
    });

  const submitRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setRouteLoading(true);
    try {
      if (routeForm.id) {
        await axios.put(`${API_BASE}/routes/${routeForm.id}`, routeForm, { headers });
      } else {
        await axios.post(`${API_BASE}/routes`, routeForm, { headers });
      }
      await loadAll();
      resetRouteForm();
    } catch {
      openModal('Failed to save route. Ensure code is unique.', 'Error');
    } finally {
      setRouteLoading(false);
    }
  };

  const submitGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupLoading(true);
    try {
      if (groupForm.id) {
        await axios.put(`${API_BASE}/groups/${groupForm.id}`, groupForm, { headers });
      } else {
        await axios.post(`${API_BASE}/groups`, groupForm, { headers });
      }
      await loadAll();
      resetGroupForm();
    } catch {
      openModal('Failed to save group. Ensure route and center are selected and code is unique.', 'Error');
    } finally {
      setGroupLoading(false);
    }
  };

  const submitCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    setCenterLoading(true);
    try {
      if (centerForm.id) {
        await axios.put(`${API_BASE}/centers/${centerForm.id}`, centerForm, { headers });
      } else {
        await axios.post(`${API_BASE}/centers`, centerForm, { headers });
      }
      await loadAll();
      resetCenterForm();
    } catch {
      openModal('Failed to save center. Ensure route is selected and code is unique.', 'Error');
    } finally {
      setCenterLoading(false);
    }
  };

  const submitPenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    setPenaltyLoading(true);
    try {
      const payload = {
        penalty_rate: Number(penaltyForm.penalty_rate || 0),
        is_active: penaltyForm.is_active,
      };

      if (penaltyForm.id) {
        await axios.put(`${API_BASE}/penalty-rate/${penaltyForm.id}`, payload, { headers });
      } else {
        await axios.post(`${API_BASE}/penalty-rate`, payload, { headers });
      }

      await loadAll();
    } catch {
      openModal('Failed to save penalty rate setting.', 'Error');
    } finally {
      setPenaltyLoading(false);
    }
  };

  const submitLoanProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoanProductLoading(true);

    try {
      const payload = {
        name: loanProductForm.name.trim(),
        min_loan_amount: loanProductForm.min_loan_amount === '' ? null : Number(loanProductForm.min_loan_amount),
        max_loan_amount: loanProductForm.max_loan_amount === '' ? null : Number(loanProductForm.max_loan_amount),
        document_charge_percentage:
          loanProductForm.document_charge_percentage === '' ? null : Number(loanProductForm.document_charge_percentage),
        stamp_charge_percentage:
          loanProductForm.stamp_charge_percentage === '' ? null : Number(loanProductForm.stamp_charge_percentage),
        insurance_charge_percentage:
          loanProductForm.insurance_charge_percentage === '' ? null : Number(loanProductForm.insurance_charge_percentage),
        interest_rate: loanProductForm.interest_rate.trim(),
        interest_type: loanProductForm.interest_type,
        terms_count: Number(loanProductForm.terms_count || 0),
        refund_option: loanProductForm.refund_option,
        assumed_month_days: Number(loanProductForm.assumed_month_days || 30),
        is_active: loanProductForm.is_active,
      };

      if (loanProductForm.id) {
        await axios.put(`${API_BASE}/loan-products/${loanProductForm.id}`, payload, { headers });
      } else {
        await axios.post(`${API_BASE}/loan-products`, payload, { headers });
      }

      await loadAll();
      resetLoanProductForm();
    } catch {
      openModal('Failed to save loan product. Please check required fields and uniqueness.', 'Error');
    } finally {
      setLoanProductLoading(false);
    }
  };

  const deleteItem = (type: DeleteType, id: number) => {
    setDeleteConfirm({ open: true, type, id });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm({ open: false, type: null, id: null });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.type || !deleteConfirm.id) return;

    try {
      const response = await axios.delete(`${API_BASE}/${deleteConfirm.type}/${deleteConfirm.id}`, { headers });
      await loadAll();
      closeDeleteConfirm();

      const successMessage = response?.data?.message || 'Item deleted successfully.';
      openModal(successMessage, 'Delete Success');
    } catch {
      openModal('Delete failed. Item may have dependent records.', 'Error');
    }
  };

  const openLifecycleModal = (loan: LoanLifecycleRow, action: 'hold' | 'close') => {
    setLifecycleModal({ open: true, action, reason: '', loan });
  };

  const closeLifecycleModal = () => {
    if (lifecycleActionLoading) return;
    setLifecycleModal({ open: false, action: 'hold', reason: '', loan: null });
  };

  const submitLifecycleAction = async () => {
    if (!lifecycleModal.loan) return;

    setLifecycleActionLoading(true);
    try {
      await axios.post(
        `/api/microfinance/loan-requests/${lifecycleModal.loan.id}/lifecycle`,
        {
          action: lifecycleModal.action,
          reason: lifecycleModal.reason || null,
        },
        { headers }
      );

      closeLifecycleModal();
      setLifecycleLoading(true);
      await loadAll();
      openModal(
        lifecycleModal.action === 'hold'
          ? 'Loan is now on hold. Arrears and due-date progression are paused.'
          : 'Loan has been closed successfully.',
        'Success'
      );
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? String(error.response?.data?.message || 'Failed to update loan lifecycle.')
        : 'Failed to update loan lifecycle.';
      openModal(message, 'Error');
    } finally {
      setLifecycleLoading(false);
      setLifecycleActionLoading(false);
    }
  };

  const formatDate = (value?: string | null) => {
    const raw = String(value || '').slice(0, 10);
    if (!raw) return '-';
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat('en-LK', { year: 'numeric', month: 'short', day: '2-digit' }).format(parsed);
  };

  const shiftDateByRefundOption = (date: Date, refundOption?: string | null, assumedMonthDays?: number | null) => {
    const next = new Date(date);
    if (refundOption === 'day') {
      next.setDate(next.getDate() + 1);
      return next;
    }
    if (refundOption === 'week') {
      next.setDate(next.getDate() + 7);
      return next;
    }
    const monthDays = Math.max(Number(assumedMonthDays || 30), 1);
    next.setDate(next.getDate() + monthDays);
    return next;
  };

  const getProjectedArrears = (loan: LoanLifecycleRow) => {
    const status = String(loan.status || '').toLowerCase();
    if (status === 'hold' || status === 'closed') {
      return 0;
    }

    let balance = Number(loan.arrears_balance || 0);
    const installment = Number(loan.installment_amount || 0);
    const dueDateText = String(loan.due_date || '').slice(0, 10);
    if (installment <= 0 || !dueDateText) return Math.max(balance, 0);

    let dueCursor = new Date(`${dueDateText}T00:00:00`);
    if (Number.isNaN(dueCursor.getTime())) return Math.max(balance, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    while (dueCursor <= today) {
      balance += installment;
      dueCursor = shiftDateByRefundOption(dueCursor, loan.refund_option, loan.assumed_month_days);
    }

    return Math.max(balance, 0);
  };

  const filteredLoanLifecycleRows = useMemo(() => {
    const keyword = lifecycleSearch.trim().toLowerCase();

    return loanLifecycleRows.filter((loan) => {
      const status = String(loan.status || '').toLowerCase();
      const canHold = status === 'approved' || status === 'released';
      const canClose = status !== 'closed' && status !== 'rejected';

      if (lifecycleStatusFilter !== 'all' && status !== lifecycleStatusFilter) return false;
      if (lifecycleActionFilter === 'can_hold' && !canHold) return false;
      if (lifecycleActionFilter === 'can_close' && !canClose) return false;

      if (!keyword) return true;

      const haystack = [
        loan.loan_code || `LR-${loan.id}`,
        loan.customer_no || '',
        loan.customer_name || '',
        loan.field_officer || '',
        status,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [loanLifecycleRows, lifecycleSearch, lifecycleStatusFilter, lifecycleActionFilter]);

  const dashboardStats = useMemo(
    () => [
      { label: 'Routes', value: routes.length, accent: 'text-cyan-700', bg: 'from-cyan-500/20 to-sky-500/20' },
      { label: 'Centers', value: centers.length, accent: 'text-sky-700', bg: 'from-sky-500/20 to-indigo-500/20' },
      { label: 'Groups', value: groups.length, accent: 'text-indigo-700', bg: 'from-indigo-500/20 to-violet-500/20' },
      { label: 'Loan Products', value: loanProducts.length, accent: 'text-violet-700', bg: 'from-violet-500/20 to-fuchsia-500/20' },
      {
        label: 'Penalty %',
        value: Number(penaltySetting?.penalty_rate || 0).toFixed(2),
        accent: 'text-emerald-700',
        bg: 'from-emerald-500/20 to-teal-500/20',
      },
    ],
    [routes.length, centers.length, groups.length, loanProducts.length, penaltySetting?.penalty_rate]
  );
  const visibleDashboardStats = dashboardStats.filter(
    (stat) => !hiddenWidgetKeys.has(`${widgetPrefix}stat_${String(stat.label).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`)
  );
  const visibleTabs = tabs.filter((tab) => !hiddenWidgetKeys.has(`${widgetPrefix}tab_${tab.key}`));

  const getStatusBadgeClass = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'active' || normalized === 'released') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (normalized === 'approved') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    if (normalized === 'hold') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (normalized === 'requested') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (normalized === 'closed' || normalized === 'inactive') return 'bg-rose-100 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const formatRate = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '0';
    const num = Number(raw);
    if (Number.isNaN(num)) return raw;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 7,
      useGrouping: false,
    });
  };

  const isColumnVisible = (columnKey: string) => !hiddenWidgetKeys.has(`${widgetPrefix}lifecycle_col_${columnKey}`);

  useEffect(() => {
    if (hiddenWidgetKeys.has(`${widgetPrefix}tab_${activeTab}`)) {
      const fallback = visibleTabs[0]?.key;
      if (fallback) {
        setActiveTab(fallback);
      }
    }
  }, [activeTab, hiddenWidgetKeys, visibleTabs]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-sky-50 to-teal-100 px-4 py-8 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-16 -left-10 h-72 w-72 rounded-full bg-cyan-300 blur-3xl"></div>
        <div className="absolute top-40 right-0 h-96 w-96 rounded-full bg-sky-200 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-teal-200 blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        {!hiddenWidgetKeys.has(`${widgetPrefix}header`) && (
        <div className={`${shellCardClass} relative overflow-hidden p-6 md:p-8`}>
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="inline-flex rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
              Microfinance Admin
              </span>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Settings Workspace</h1>
              <p className="mt-1 text-sm text-slate-600">Create, organize, and maintain routes, centers, groups, penalty rules, and lifecycle controls.</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/microfinance')}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700"
            >
              Back
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {visibleDashboardStats.map((stat) => (
              <div key={stat.label} className={`relative rounded-2xl border border-white/80 bg-gradient-to-r ${stat.bg} p-4`}>
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}stat_${String(stat.label).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`)}
                    className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${stat.label} widget`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
                <p className={`mt-1 text-2xl font-black ${stat.accent}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`relative rounded-2xl border px-4 py-3 text-left transition-all ${
                activeTab === tab.key
                  ? 'border-cyan-300 bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-xl shadow-cyan-700/30'
                  : 'border-white/80 bg-white/80 text-slate-700 hover:bg-white hover:-translate-y-0.5'
              }`}
            >
              <WidgetCloseGate>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void hideWidget(`${widgetPrefix}tab_${tab.key}`);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      void hideWidget(`${widgetPrefix}tab_${tab.key}`);
                    }
                  }}
                  className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                  aria-label={`Hide ${tab.label} tab widget`}
                >
                  ×
                </span>
              </WidgetCloseGate>
              <p className="text-base">{tab.icon}</p>
              <p className="mt-1 text-sm font-bold">{tab.label}</p>
              <p className={`text-xs mt-0.5 ${activeTab === tab.key ? 'text-white/85' : 'text-slate-500'}`}>{tab.desc}</p>
            </button>
          ))}
        </div>
        {visibleTabs.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            All tab widgets are hidden. Use Restore Hidden Widgets on dashboard to show them again.
          </div>
        )}

        {activeTab === 'routes' && !hiddenWidgetKeys.has(`${widgetPrefix}tab_routes`) && (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}tab_routes`)}
                className="absolute right-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide routes widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <form onSubmit={submitRoute} className={`${shellCardClass} p-6 md:p-7 space-y-4`}>
              <h2 className="text-lg font-bold text-slate-900">{routeForm.id ? 'Edit Route' : 'Create Route'}</h2>
              <p className="text-xs text-slate-500">Define operational routes used for center and group mapping.</p>
              <p className={fieldHintClass}>Fields marked with * are required.</p>
              <div className="space-y-1.5">
                <label htmlFor="route_name" className={fieldLabelClass}>Route Name *</label>
                <input
                  id="route_name"
                  value={routeForm.name}
                  onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
                  placeholder="Enter route name"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="route_code" className={fieldLabelClass}>Route Code *</label>
                <input
                  id="route_code"
                  value={routeForm.code}
                  onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })}
                  placeholder="Enter route code"
                  className={inputClass}
                  required
                />
              </div>
              <label htmlFor="route_is_active" className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  id="route_is_active"
                  type="checkbox"
                  checked={routeForm.is_active}
                  onChange={(e) => setRouteForm({ ...routeForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <div className="flex gap-2">
                <button disabled={routeLoading} className="rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-cyan-700 hover:to-sky-700 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2">
                  {routeLoading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>}
                  {routeLoading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={resetRouteForm} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">Clear</button>
              </div>
            </form>

            <div className={`${shellCardClass} p-6 md:p-7`}>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Route List</h2>
              <div className="space-y-3 max-h-[420px] overflow-auto">
                {routes.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-cyan-100/80 bg-white/90 p-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-xs text-slate-500">Code: {item.code}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(item.is_active ? 'active' : 'inactive')}`}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setRouteForm(item)} className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-semibold transition hover:bg-amber-200">Edit</button>
                      <button onClick={() => deleteItem('routes', item.id)} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-semibold transition hover:bg-red-200">Delete</button>
                    </div>
                  </div>
                ))}
                {!routes.length && <p className="text-sm text-slate-500">No routes yet.</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'groups' && !hiddenWidgetKeys.has(`${widgetPrefix}tab_groups`) && (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}tab_groups`)}
                className="absolute right-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide groups widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <form onSubmit={submitGroup} className={`${shellCardClass} p-6 md:p-7 space-y-4`}>
              <h2 className="text-lg font-bold text-slate-900">{groupForm.id ? 'Edit Group' : 'Create Group'}</h2>
              <p className="text-xs text-slate-500">Attach groups under a route and center for field operations.</p>
              <p className={fieldHintClass}>Fields marked with * are required.</p>
              <div className="space-y-1.5">
                <label htmlFor="group_route" className={fieldLabelClass}>Route *</label>
                <select
                  id="group_route"
                  value={groupForm.mf_route_id}
                  onChange={(e) =>
                    setGroupForm({
                      ...groupForm,
                      mf_route_id: Number(e.target.value),
                      mf_center_id: 0,
                    })
                  }
                  className={inputClass}
                  required
                >
                  <option value={0}>Select route</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>{route.name} ({route.code})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="group_center" className={fieldLabelClass}>Center *</label>
                <select
                  id="group_center"
                  value={groupForm.mf_center_id}
                  onChange={(e) => setGroupForm({ ...groupForm, mf_center_id: Number(e.target.value) })}
                  className={inputClass}
                  disabled={!groupForm.mf_route_id}
                  required
                >
                  <option value={0}>{groupForm.mf_route_id ? 'Select center' : 'Select route first'}</option>
                  {centers
                    .filter((center) => center.mf_route_id === groupForm.mf_route_id)
                    .map((center) => (
                      <option key={center.id} value={center.id}>{center.name} ({center.code})</option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="group_name" className={fieldLabelClass}>Group Name *</label>
                <input
                  id="group_name"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="Enter group name"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="group_code" className={fieldLabelClass}>Group Code *</label>
                <input
                  id="group_code"
                  value={groupForm.code}
                  onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value })}
                  placeholder="Enter group code"
                  className={inputClass}
                  required
                />
              </div>
              <label htmlFor="group_is_active" className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  id="group_is_active"
                  type="checkbox"
                  checked={groupForm.is_active}
                  onChange={(e) => setGroupForm({ ...groupForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <div className="flex gap-2">
                <button disabled={groupLoading} className="rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-cyan-700 hover:to-sky-700 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2">
                  {groupLoading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>}
                  {groupLoading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={resetGroupForm} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">Clear</button>
              </div>
            </form>

            <div className={`${shellCardClass} p-6 md:p-7`}>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Group List</h2>
              <div className="space-y-3 max-h-[420px] overflow-auto">
                {groups.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-cyan-100/80 bg-white/90 p-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Code: {item.code} • Route: {item.route?.name ?? 'N/A'} • Center: {item.center?.name ?? 'N/A'}</p>
                      <span className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(item.is_active ? 'active' : 'inactive')}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setGroupForm({ id: item.id, mf_route_id: item.mf_route_id, mf_center_id: item.mf_center_id, name: item.name, code: item.code, is_active: item.is_active })} className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-semibold transition hover:bg-amber-200">Edit</button>
                      <button onClick={() => deleteItem('groups', item.id)} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-semibold transition hover:bg-red-200">Delete</button>
                    </div>
                  </div>
                ))}
                {!groups.length && <p className="text-sm text-slate-500">No groups yet.</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'centers' && !hiddenWidgetKeys.has(`${widgetPrefix}tab_centers`) && (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}tab_centers`)}
                className="absolute right-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide centers widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <form onSubmit={submitCenter} className={`${shellCardClass} p-6 md:p-7 space-y-4`}>
              <h2 className="text-lg font-bold text-slate-900">{centerForm.id ? 'Edit Center' : 'Create Center'}</h2>
              <p className="text-xs text-slate-500">Set center details and meeting cycle under a selected route.</p>
              <p className={fieldHintClass}>Fields marked with * are required.</p>
              <div className="space-y-1.5">
                <label htmlFor="center_route" className={fieldLabelClass}>Route *</label>
                <select
                  id="center_route"
                  value={centerForm.mf_route_id}
                  onChange={(e) => setCenterForm({ ...centerForm, mf_route_id: Number(e.target.value) })}
                  className={inputClass}
                  required
                >
                  <option value={0}>Select route</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>{route.name} ({route.code})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="center_name" className={fieldLabelClass}>Center Name *</label>
                <input
                  id="center_name"
                  value={centerForm.name}
                  onChange={(e) => setCenterForm({ ...centerForm, name: e.target.value })}
                  placeholder="Enter center name"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="center_code" className={fieldLabelClass}>Center Code *</label>
                <input
                  id="center_code"
                  value={centerForm.code}
                  onChange={(e) => setCenterForm({ ...centerForm, code: e.target.value })}
                  placeholder="Enter center code"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="center_meeting_day" className={fieldLabelClass}>Meeting Day *</label>
                <select
                  id="center_meeting_day"
                  value={centerForm.meeting_day}
                  onChange={(e) => setCenterForm({ ...centerForm, meeting_day: e.target.value })}
                  className={inputClass}
                  required
                >
                  <option value="">Select center day</option>
                  {CENTER_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {formatCenterDay(day)}
                    </option>
                  ))}
                </select>
              </div>
              <label htmlFor="center_is_active" className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  id="center_is_active"
                  type="checkbox"
                  checked={centerForm.is_active}
                  onChange={(e) => setCenterForm({ ...centerForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <div className="flex gap-2">
                <button disabled={centerLoading} className="rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-cyan-700 hover:to-sky-700 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2">
                  {centerLoading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>}
                  {centerLoading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={resetCenterForm} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">Clear</button>
              </div>
            </form>

            <div className={`${shellCardClass} p-6 md:p-7`}>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Center List</h2>
              <div className="space-y-3 max-h-[420px] overflow-auto">
                {centers.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-cyan-100/80 bg-white/90 p-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-1">Code: {item.code} • Route: {item.route?.name ?? 'N/A'} • Day: {formatCenterDay(item.meeting_day)}</p>
                      <span className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(item.is_active ? 'active' : 'inactive')}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setCenterForm({ id: item.id, mf_route_id: item.mf_route_id, name: item.name, code: item.code, meeting_day: String(item.meeting_day || '').toLowerCase(), is_active: item.is_active })} className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-semibold transition hover:bg-amber-200">Edit</button>
                      <button onClick={() => deleteItem('centers', item.id)} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-semibold transition hover:bg-red-200">Delete</button>
                    </div>
                  </div>
                ))}
                {!centers.length && <p className="text-sm text-slate-500">No centers yet.</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'loan_products' && !hiddenWidgetKeys.has(`${widgetPrefix}tab_loan_products`) && (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}tab_loan_products`)}
                className="absolute right-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide loan products widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <form onSubmit={submitLoanProduct} className={`${shellCardClass} p-6 md:p-7 space-y-4`}>
              <h2 className="text-lg font-bold text-slate-900">{loanProductForm.id ? 'Edit Loan Product' : 'Create Loan Product'}</h2>
              <p className="text-xs text-slate-500">Define product terms used during microfinance loan request setup.</p>
              <p className={fieldHintClass}>Fields marked with * are required.</p>

              <div className="space-y-1.5">
                <label htmlFor="loan_product_name" className={fieldLabelClass}>Product Name *</label>
                <input
                  id="loan_product_name"
                  value={loanProductForm.name}
                  onChange={(e) => setLoanProductForm({ ...loanProductForm, name: e.target.value })}
                  placeholder="Enter product name"
                  className={inputClass}
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="loan_product_min_loan_amount" className={fieldLabelClass}>Minimum Loan Amount (LKR)</label>
                  <input
                    id="loan_product_min_loan_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loanProductForm.min_loan_amount}
                    onChange={(e) => setLoanProductForm({ ...loanProductForm, min_loan_amount: e.target.value })}
                    placeholder="Enter minimum amount"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="loan_product_max_loan_amount" className={fieldLabelClass}>Maximum Loan Amount (LKR)</label>
                  <input
                    id="loan_product_max_loan_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loanProductForm.max_loan_amount}
                    onChange={(e) => setLoanProductForm({ ...loanProductForm, max_loan_amount: e.target.value })}
                    placeholder="Enter maximum amount"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="loan_product_document_charge_percentage" className={fieldLabelClass}>Document Charge (%)</label>
                  <input
                    id="loan_product_document_charge_percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={loanProductForm.document_charge_percentage}
                    onChange={(e) => setLoanProductForm({ ...loanProductForm, document_charge_percentage: e.target.value })}
                    placeholder="Enter %"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="loan_product_stamp_charge_percentage" className={fieldLabelClass}>Stamp Charge (%)</label>
                  <input
                    id="loan_product_stamp_charge_percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={loanProductForm.stamp_charge_percentage}
                    onChange={(e) => setLoanProductForm({ ...loanProductForm, stamp_charge_percentage: e.target.value })}
                    placeholder="Enter %"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="loan_product_insurance_charge_percentage" className={fieldLabelClass}>Insurance Charge (%)</label>
                  <input
                    id="loan_product_insurance_charge_percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={loanProductForm.insurance_charge_percentage}
                    onChange={(e) => setLoanProductForm({ ...loanProductForm, insurance_charge_percentage: e.target.value })}
                    placeholder="Enter %"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="loan_product_interest_rate" className={fieldLabelClass}>Interest Rate (%) *</label>
                <input
                  id="loan_product_interest_rate"
                  type="number"
                  min="0"
                  step="any"
                  value={loanProductForm.interest_rate}
                  onChange={(e) => setLoanProductForm({ ...loanProductForm, interest_rate: e.target.value })}
                  placeholder="Enter interest rate"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="loan_product_interest_type" className={fieldLabelClass}>Interest Type *</label>
                <select
                  id="loan_product_interest_type"
                  value={loanProductForm.interest_type}
                  onChange={(e) => setLoanProductForm({ ...loanProductForm, interest_type: e.target.value as 'flat' | 'reducing' })}
                  className={inputClass}
                  required
                >
                  <option value="flat">Flat</option>
                  <option value="reducing">Reducing</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="loan_product_terms_count" className={fieldLabelClass}>Repayment Terms Count *</label>
                <input
                  id="loan_product_terms_count"
                  type="number"
                  min="1"
                  step="1"
                  value={loanProductForm.terms_count}
                  onChange={(e) => setLoanProductForm({ ...loanProductForm, terms_count: e.target.value })}
                  placeholder="Enter terms count"
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="loan_product_refund_option" className={fieldLabelClass}>Refund Option *</label>
                <select
                  id="loan_product_refund_option"
                  value={loanProductForm.refund_option}
                  onChange={(e) => setLoanProductForm({ ...loanProductForm, refund_option: e.target.value as 'day' | 'week' | 'month' })}
                  className={inputClass}
                  required
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>
              {loanProductForm.refund_option === 'day' && (
                <div className="space-y-1.5">
                  <label htmlFor="loan_product_assumed_month_days" className={fieldLabelClass}>Assumed Month Days *</label>
                  <select
                    id="loan_product_assumed_month_days"
                    value={loanProductForm.assumed_month_days}
                    onChange={(e) => setLoanProductForm({ ...loanProductForm, assumed_month_days: e.target.value })}
                    className={inputClass}
                    required
                  >
                    <option value="24">Assume Month = 24 days</option>
                    <option value="25">Assume Month = 25 days</option>
                    <option value="26">Assume Month = 26 days</option>
                    <option value="30">Assume Month = 30 days</option>
                    <option value="31">Assume Month = 31 days</option>
                  </select>
                </div>
              )}

              <label htmlFor="loan_product_is_active" className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  id="loan_product_is_active"
                  type="checkbox"
                  checked={loanProductForm.is_active}
                  onChange={(e) => setLoanProductForm({ ...loanProductForm, is_active: e.target.checked })}
                />
                Active
              </label>

              <div className="flex gap-2">
                <button disabled={loanProductLoading} className="rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-cyan-700 hover:to-sky-700 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2">
                  {loanProductLoading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>}
                  {loanProductLoading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={resetLoanProductForm} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">Clear</button>
              </div>
            </form>

            <div className={`${shellCardClass} p-6 md:p-7`}>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Loan Product List</h2>
              <div className="space-y-3 max-h-[420px] overflow-auto">
                {loanProducts.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-cyan-100/80 bg-white/90 p-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Interest: {formatRate(item.interest_rate)}% ({item.interest_type}) • Terms: {item.terms_count} • Refund: {item.refund_option}
                        {item.refund_option === 'month' ? ` (${Number(item.assumed_month_days || 30)} days)` : ''}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Loan Range: {item.min_loan_amount !== null && item.min_loan_amount !== undefined && String(item.min_loan_amount) !== '' ? Number(item.min_loan_amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                        {' '}to{' '}
                        {item.max_loan_amount !== null && item.max_loan_amount !== undefined && String(item.max_loan_amount) !== '' ? Number(item.max_loan_amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Charges (%): D {item.document_charge_percentage !== null && item.document_charge_percentage !== undefined && String(item.document_charge_percentage) !== '' ? Number(item.document_charge_percentage).toFixed(2) : '0.00'}%
                        {' '}| S {item.stamp_charge_percentage !== null && item.stamp_charge_percentage !== undefined && String(item.stamp_charge_percentage) !== '' ? Number(item.stamp_charge_percentage).toFixed(2) : '0.00'}%
                        {' '}| I {item.insurance_charge_percentage !== null && item.insurance_charge_percentage !== undefined && String(item.insurance_charge_percentage) !== '' ? Number(item.insurance_charge_percentage).toFixed(2) : '0.00'}%
                      </p>
                      <span className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(item.is_active ? 'active' : 'inactive')}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setLoanProductForm({
                            id: item.id,
                            name: item.name,
                            min_loan_amount: item.min_loan_amount === null || item.min_loan_amount === undefined ? '' : String(item.min_loan_amount),
                            max_loan_amount: item.max_loan_amount === null || item.max_loan_amount === undefined ? '' : String(item.max_loan_amount),
                            document_charge_percentage:
                              item.document_charge_percentage === null || item.document_charge_percentage === undefined
                                ? ''
                                : String(item.document_charge_percentage),
                            stamp_charge_percentage:
                              item.stamp_charge_percentage === null || item.stamp_charge_percentage === undefined
                                ? ''
                                : String(item.stamp_charge_percentage),
                            insurance_charge_percentage:
                              item.insurance_charge_percentage === null || item.insurance_charge_percentage === undefined
                                ? ''
                                : String(item.insurance_charge_percentage),
                            interest_rate: String(item.interest_rate ?? ''),
                            interest_type: item.interest_type,
                            terms_count: String(item.terms_count ?? ''),
                            refund_option: item.refund_option,
                            assumed_month_days: String(item.assumed_month_days ?? 30),
                            is_active: item.is_active,
                          })
                        }
                        className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-semibold transition hover:bg-amber-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteItem('loan-products', item.id)}
                        className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-semibold transition hover:bg-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {!loanProducts.length && <p className="text-sm text-slate-500">No loan products yet.</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'penalty' && !hiddenWidgetKeys.has(`${widgetPrefix}tab_penalty`) && (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}tab_penalty`)}
                className="absolute right-2 -top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide penalty widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <form onSubmit={submitPenalty} className={`${shellCardClass} p-6 md:p-7 space-y-4`}>
              <h2 className="text-lg font-bold text-slate-900">{penaltyForm.id ? 'Update Penalty Rate' : 'Add Initial Penalty Rate'}</h2>
              <p className="text-sm text-slate-600">
                Create the initial late-payment penalty record first, then update it later when needed.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="penalty_rate" className={fieldLabelClass}>Penalty Rate (%) *</label>
                <input
                  id="penalty_rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={penaltyForm.penalty_rate}
                  onChange={(e) => setPenaltyForm({ ...penaltyForm, penalty_rate: e.target.value })}
                  placeholder="Enter penalty rate"
                  className={inputClass}
                  required
                />
              </div>
              <label htmlFor="penalty_is_active" className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  id="penalty_is_active"
                  type="checkbox"
                  checked={penaltyForm.is_active}
                  onChange={(e) => setPenaltyForm({ ...penaltyForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <div className="flex gap-2">
                <button disabled={penaltyLoading} className="rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-cyan-700 hover:to-sky-700 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2">
                  {penaltyLoading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>}
                  {penaltyLoading ? 'Saving...' : penaltyForm.id ? 'Update' : 'Add Initial Record'}
                </button>
                <button type="button" onClick={resetPenaltyForm} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">Reset</button>
              </div>
            </form>

            <div className={`${shellCardClass} p-6 md:p-7`}>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Current Penalty Setting</h2>
              {penaltySetting ? (
                <div className="rounded-2xl border border-cyan-100/80 bg-white/90 p-4 shadow-sm">
                  <p className="font-semibold text-slate-900">Late Payment Penalty</p>
                  <p className="text-sm text-slate-600 mt-1">Rate: {Number(penaltySetting.penalty_rate || 0).toFixed(2)}%</p>
                  <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeClass(penaltySetting.is_active ? 'active' : 'inactive')}`}>
                    {penaltySetting.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No penalty setting found. Add the initial record from the form.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'loan_lifecycle' && !hiddenWidgetKeys.has(`${widgetPrefix}tab_loan_lifecycle`) && (
          <div className={`${shellCardClass} relative p-6 md:p-7 space-y-4`}>
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}tab_loan_lifecycle`)}
                className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide loan lifecycle widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Loan Hold / Close Control</h2>
                <p className="text-sm text-slate-600">
                  Hold loan: stop arrears and remove due dates temporarily. Close loan: permanently close in critical situations.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAll}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-cyan-700 font-semibold">Visible Loans</p>
                <p className="text-2xl font-black text-cyan-900">{filteredLoanLifecycleRows.length}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold">Can Hold</p>
                <p className="text-2xl font-black text-amber-900">
                  {filteredLoanLifecycleRows.filter((loan) => {
                    const status = String(loan.status || '').toLowerCase();
                    return status === 'approved' || status === 'released';
                  }).length}
                </p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-rose-700 font-semibold">Can Close</p>
                <p className="text-2xl font-black text-rose-900">
                  {filteredLoanLifecycleRows.filter((loan) => {
                    const status = String(loan.status || '').toLowerCase();
                    return status !== 'closed' && status !== 'rejected';
                  }).length}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="lifecycle_search" className={fieldLabelClass}>Search Loans</label>
                <input
                  id="lifecycle_search"
                  value={lifecycleSearch}
                  onChange={(e) => setLifecycleSearch(e.target.value)}
                  className={inputClass}
                  placeholder="Loan code, customer, officer"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lifecycle_status_filter" className={fieldLabelClass}>Status Filter</label>
                <select
                  id="lifecycle_status_filter"
                  value={lifecycleStatusFilter}
                  onChange={(e) => setLifecycleStatusFilter(e.target.value as 'all' | 'requested' | 'approved' | 'released' | 'hold')}
                  className={inputClass}
                >
                  <option value="all">All Status</option>
                  <option value="requested">Requested</option>
                  <option value="approved">Approved</option>
                  <option value="released">Released</option>
                  <option value="hold">Hold</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lifecycle_action_filter" className={fieldLabelClass}>Action Filter</label>
                <select
                  id="lifecycle_action_filter"
                  value={lifecycleActionFilter}
                  onChange={(e) => setLifecycleActionFilter(e.target.value as 'all' | 'can_hold' | 'can_close')}
                  className={inputClass}
                >
                  <option value="all">All Action Types</option>
                  <option value="can_hold">Can Hold</option>
                  <option value="can_close">Can Close</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-cyan-100 bg-white">
              <table className="min-w-full text-sm text-left text-slate-700">
                <thead className="bg-cyan-50 text-slate-700">
                  <tr>
                    {isColumnVisible('loan_code') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Loan Code
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_loan_code`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('customer_no') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Customer No
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_customer_no`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('customer') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Customer
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_customer`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('field_officer') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Field Officer
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_field_officer`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('status') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Status
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_status`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('due_date') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Due Date
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_due_date`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('next_payment') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Next Payment
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_next_payment`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('arrears') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Arrears
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_arrears`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                    {isColumnVisible('action') && (
                      <th className="relative px-3 py-2 pr-8 font-semibold">
                        Action
                        <WidgetCloseGate>
                          <button type="button" onClick={() => void hideWidget(`${widgetPrefix}lifecycle_col_action`)} className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700">×</button>
                        </WidgetCloseGate>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredLoanLifecycleRows.map((loan) => {
                    const status = String(loan.status || '').toLowerCase();

                    return (
                      <tr key={loan.id} className="border-b border-cyan-100 last:border-b-0 hover:bg-cyan-50/40">
                        {isColumnVisible('loan_code') && <td className="px-3 py-2 font-semibold text-slate-900">{loan.loan_code || `LR-${loan.id}`}</td>}
                        {isColumnVisible('customer_no') && <td className="px-3 py-2">{loan.customer_no || '-'}</td>}
                        {isColumnVisible('customer') && <td className="px-3 py-2">{loan.customer_name || '-'}</td>}
                        {isColumnVisible('field_officer') && <td className="px-3 py-2">{loan.field_officer || '-'}</td>}
                        {isColumnVisible('status') && (
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusBadgeClass(status)}`}>
                              {status || '-'}
                            </span>
                          </td>
                        )}
                        {isColumnVisible('due_date') && <td className="px-3 py-2">{formatDate(loan.due_date)}</td>}
                        {isColumnVisible('next_payment') && <td className="px-3 py-2">{formatDate(loan.next_payment_date)}</td>}
                        {isColumnVisible('arrears') && <td className="px-3 py-2">{getProjectedArrears(loan).toFixed(2)}</td>}
                        {isColumnVisible('action') && (
                          <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {(status === 'approved' || status === 'released') && (
                              <button
                                type="button"
                                onClick={() => openLifecycleModal(loan, 'hold')}
                                className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-semibold transition hover:bg-amber-200"
                              >
                                Put on Hold
                              </button>
                            )}
                            {status !== 'closed' && status !== 'rejected' && (
                              <button
                                type="button"
                                onClick={() => openLifecycleModal(loan, 'close')}
                                className="text-xs px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg font-semibold transition hover:bg-rose-200"
                              >
                                Close Loan
                              </button>
                            )}
                          </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!filteredLoanLifecycleRows.length && !lifecycleLoading && (
                    <tr>
                      <td className="px-3 py-5 text-center text-slate-500" colSpan={9}>
                        No loans match the selected filters.
                      </td>
                    </tr>
                  )}
                  {lifecycleLoading && (
                    <tr>
                      <td className="px-3 py-5 text-center text-slate-500" colSpan={9}>
                        Loading loans...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {modal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-cyan-100">
              <h3 className="text-lg font-bold text-slate-900">{modal.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{modal.message}</p>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-600 text-white text-sm font-semibold"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-cyan-100">
              <h3 className="text-lg font-bold text-slate-900">Confirm Delete</h3>
              <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete this item?</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={closeDeleteConfirm}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {lifecycleModal.open && lifecycleModal.loan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl border border-cyan-100">
              <h3 className="text-lg font-bold text-slate-900">
                {lifecycleModal.action === 'hold' ? 'Put Loan On Hold' : 'Close Loan'}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Loan: {lifecycleModal.loan.loan_code || `LR-${lifecycleModal.loan.id}`} • Customer: {lifecycleModal.loan.customer_name || '-'}
              </p>
              <div className="mt-3 space-y-1.5">
                <label htmlFor="lifecycle_reason" className={fieldLabelClass}>
                  {lifecycleModal.action === 'hold' ? 'Hold Reason' : 'Close Reason'}
                </label>
                <textarea
                  id="lifecycle_reason"
                  className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  rows={4}
                  value={lifecycleModal.reason}
                  onChange={(e) => setLifecycleModal((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder={
                    lifecycleModal.action === 'hold'
                      ? 'Enter reason (for example: customer accident or emergency)'
                      : 'Enter reason (for example: customer death)'
                  }
                />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={closeLifecycleModal}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={submitLifecycleAction}
                  disabled={lifecycleActionLoading}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-600 text-white text-sm font-semibold disabled:opacity-70"
                >
                  {lifecycleActionLoading ? 'Saving...' : lifecycleModal.action === 'hold' ? 'Confirm Hold' : 'Confirm Close'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
