'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import { Banknote, Car, FileText, PieChart, TrendingUp, Users, ClipboardCheck, HandCoins, UserCog, FileBarChart2, LayoutDashboard } from 'lucide-react';

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
  status?: string | null;
  created_at?: string | null;
  customer?: {
    first_name?: string;
    last_name?: string;
  } | null;
};

type ProductTypeRow = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
};

type GuarantorInput = {
  name: string;
  nic: string;
  phone: string;
  address: string;
};

type AuthRole = {
  id?: number;
  name?: string;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string } | null;
  roles?: AuthRole[];
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
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export default function FinanceManagementPage() {
  const router = useRouter();
  const widgetPrefix = 'finance_dashboard_widget_';
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [productTypes, setProductTypes] = useState<ProductTypeRow[]>([]);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState('');

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerStep, setRegisterStep] = useState(1);
  const [savingRegister, setSavingRegister] = useState(false);
  const [regCustomerNo, setRegCustomerNo] = useState('');
  const [regFinanceType, setRegFinanceType] = useState('vehicle');
  const [regProductType, setRegProductType] = useState('hire-purchase');
  const [regStartDate, setRegStartDate] = useState('');
  const [regInterestRate, setRegInterestRate] = useState('18');
  const [regInterestType, setRegInterestType] = useState<'fixed' | 'reducing'>('fixed');
  const [regTenureMonths, setRegTenureMonths] = useState('36');
  const [regFrequency, setRegFrequency] = useState('monthly');

  const [regVehicleNo, setRegVehicleNo] = useState('');
  const [regChassisNo, setRegChassisNo] = useState('');
  const [regEngineNo, setRegEngineNo] = useState('');
  const [regMakeModel, setRegMakeModel] = useState('');
  const [regVehicleYear, setRegVehicleYear] = useState('');
  const [regAssetRef, setRegAssetRef] = useState('');
  const [regAmount, setRegAmount] = useState('');
  const [regDownPayment, setRegDownPayment] = useState('');
  const [regValuationAmount, setRegValuationAmount] = useState('');
  const [regValuationDate, setRegValuationDate] = useState('');
  const [regValuerName, setRegValuerName] = useState('');

  const [regGuarantors, setRegGuarantors] = useState<GuarantorInput[]>([
    { name: '', nic: '', phone: '', address: '' },
  ]);

  const [regDocuments, setRegDocuments] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [generatingCustomerNo, setGeneratingCustomerNo] = useState(false);
  const [addingProductType, setAddingProductType] = useState(false);
  const [newProductTypeName, setNewProductTypeName] = useState('');
  const [newProductTypeDescription, setNewProductTypeDescription] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser));
      } catch {
        setAuthUser(null);
      }
    }

    void fetchNotificationPreview(t);
  }, [router]);

  const fetchNotificationPreview = async (authToken: string) => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/notifications/preview`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { limit: 4 },
      });

      setActionCenterTotalCount(Number(response.data?.action_center_total || 0));
    } catch {
      setActionCenterTotalCount(0);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

  const fetchData = async (authToken: string) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/finances', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 1000 },
      });

      const data = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchData(token);
  }, [token]);

  const fetchProductTypes = async (authToken: string) => {
    try {
      const response = await axios.get('/api/finance-product-types', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });

      const data = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      setProductTypes(data as ProductTypeRow[]);

      if (data.length > 0 && !regProductType) {
        const first = data[0] as ProductTypeRow;
        if (first?.name) setRegProductType(first.name);
      }
    } catch {
      setProductTypes([]);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchProductTypes(token);
  }, [token]);

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.widgets)
          ? response.data.widgets
          : [];
      const hidden = rows
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
      try {
        await axios.post(
          `${getApiBaseUrl()}/dashboard/widgets`,
          { widget_key: widgetKey, is_visible: isVisible ? 1 : 0 },
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

  useEffect(() => {
    if (!token) return;
    void fetchWidgetPreferences(token);
  }, [token, fetchWidgetPreferences]);

  const metrics = useMemo(() => {
    const totalAccounts = rows.length;
    const vehicleRows = rows.filter((r) => String(r.finance_type || '').toLowerCase() === 'vehicle');
    const vehicleAccounts = vehicleRows.length;

    const portfolioTotal = rows.reduce((sum, r) => {
      const v = toNumber(r.financed_amount ?? r.amount);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    const vehiclePortfolio = vehicleRows.reduce((sum, r) => {
      const v = toNumber(r.financed_amount ?? r.amount);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    const arrearsAccounts = 0; // arrears logic for finance can be added later
    const arrearsAmount = 0;

    const runningStatuses = new Set(['active']);
    const runningInstallmentBook = rows.reduce((sum, r) => {
      if (!runningStatuses.has(String(r.status || '').toLowerCase())) return sum;
      const v = toNumber(r.installment_amount);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    const settledRows = rows.filter((r) => String(r.status || '').toLowerCase() === 'settled');
    const settledPortfolio = settledRows.reduce((sum, r) => {
      const v = toNumber(r.financed_amount ?? r.amount);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    return {
      totalAccounts,
      vehicleAccounts,
      portfolioTotal,
      vehiclePortfolio,
      arrearsAccounts,
      arrearsAmount,
      runningInstallmentBook,
      settledCount: settledRows.length,
      settledPortfolio,
    };
  }, [rows]);

  const runningVehicleRows = useMemo(() => {
    const runningStatuses = new Set(['active']);
    return rows.filter((r) =>
      String(r.finance_type || '').toLowerCase() === 'vehicle' &&
      runningStatuses.has(String(r.status || '').toLowerCase()),
    );
  }, [rows]);

  const arrearsRows = useMemo(() => {
    return [] as FinanceRow[]; // arrears for finance can be implemented later
  }, [rows]);

  const wizardSteps = [
    { id: 1, label: 'Basic', hint: 'Customer and product setup' },
    { id: 2, label: 'Vehicle', hint: 'Vehicle and valuation details' },
    { id: 3, label: 'Guarantor', hint: 'Security party details' },
    { id: 4, label: 'Documents', hint: 'Supporting files upload' },
  ] as const;

  const activeWizardStep = wizardSteps.find((s) => s.id === registerStep) ?? wizardSteps[0];

  const openIssueFinance = () => {
    router.push('/dashboard/finance/issue');
  };

  const loadLatestRegisteredCustomerNo = async (authToken: string) => {
    try {
      setGeneratingCustomerNo(true);
      const response = await axios.get('/api/customers', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: { per_page: 1 },
      });

      const latest = Array.isArray(response.data?.data) ? response.data.data[0] : null;
      const latestCode = String(latest?.customer_code || '').trim();
      if (latestCode) {
        setRegCustomerNo(latestCode);
      }
    } catch {
      // Keep manual entry fallback if generation fails.
    } finally {
      setGeneratingCustomerNo(false);
    }
  };

  const resetRegisterForm = () => {
    setRegisterStep(1);
    setRegCustomerNo('');
    setRegFinanceType('vehicle');
    setRegProductType('');
    setRegStartDate('');
    setRegInterestRate('18');
    setRegInterestType('fixed');
    setRegTenureMonths('36');
    setRegFrequency('monthly');

    setRegVehicleNo('');
    setRegChassisNo('');
    setRegEngineNo('');
    setRegMakeModel('');
    setRegVehicleYear('');
    setRegAssetRef('');
    setRegAmount('');
    setRegDownPayment('');
    setRegValuationAmount('');
    setRegValuationDate('');
    setRegValuerName('');

    setRegGuarantors([{ name: '', nic: '', phone: '', address: '' }]);
    setRegDocuments([]);
    setErrorMessage('');
    setAddingProductType(false);
    setNewProductTypeName('');
    setNewProductTypeDescription('');
  };

  const submitRegister = async () => {
    if (!token) return;

    const amount = Number(regAmount);
    const down = regDownPayment ? Number(regDownPayment) : 0;
    const rate = Number(regInterestRate);
    const tenure = Number(regTenureMonths);

    if (!regCustomerNo.trim()) {
      setErrorMessage('Customer No is required.');
      setRegisterStep(1);
      return;
    }
    if (!regProductType.trim()) {
      setErrorMessage('Product Type is required.');
      setRegisterStep(1);
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Asset value must be a valid amount.');
      setRegisterStep(2);
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setErrorMessage('Interest rate must be valid.');
      setRegisterStep(1);
      return;
    }
    if (!Number.isFinite(tenure) || tenure <= 0) {
      setErrorMessage('Tenure must be valid.');
      setRegisterStep(1);
      return;
    }

    try {
      setSavingRegister(true);
      setErrorMessage('');

      const createResponse = await axios.post(
        '/api/finances',
        {
          customer_no: regCustomerNo.trim(),
          finance_type: regFinanceType,
          product_type: regProductType,
          asset_reference: regAssetRef || regVehicleNo || undefined,
          amount,
          down_payment: Number.isFinite(down) ? down : 0,
          interest_rate: rate,
          interest_type: regInterestType,
          tenure_months: tenure,
          installment_frequency: regFrequency,
          start_date: regStartDate || undefined,
          vehicle_details: {
            vehicle_no: regVehicleNo || null,
            chassis_no: regChassisNo || null,
            engine_no: regEngineNo || null,
            make_model: regMakeModel || null,
            year: regVehicleYear || null,
          },
          valuation_details: {
            valuation_amount: regValuationAmount || null,
            valuation_date: regValuationDate || null,
            valuer_name: regValuerName || null,
          },
          guarantor_details: regGuarantors
            .filter((g) => g.name.trim() !== '' || g.nic.trim() !== '' || g.phone.trim() !== '' || g.address.trim() !== '')
            .map((g) => ({
              name: g.name || null,
              nic: g.nic || null,
              phone: g.phone || null,
              address: g.address || null,
            })),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );

      const financeId = Number(createResponse?.data?.id || 0);

      if (financeId > 0 && regDocuments.length > 0) {
        for (const file of regDocuments) {
          const formData = new FormData();
          formData.append('document_type', 'finance_supporting');
          formData.append('file', file);

          await axios.post(
            `/api/finances/${financeId}/documents`,
            formData,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'multipart/form-data',
              },
            },
          );
        }
      }

      setRegisterOpen(false);
      resetRegisterForm();
      await fetchData(token);
    } catch (error: unknown) {
      const fallback = 'Failed to register finance agreement.';
      if (axios.isAxiosError(error)) {
        setErrorMessage(String(error.response?.data?.message || fallback));
      } else {
        setErrorMessage(fallback);
      }
    } finally {
      setSavingRegister(false);
    }
  };

  const operationItems = [
    {
      key: 'issue_finance',
      title: 'Issue Finance',
      description: 'Create and onboard a new finance agreement.',
      onClick: openIssueFinance,
      icon: Banknote,
      iconClass: 'h-5 w-5 text-cyan-700',
    },
    {
      key: 'approvals',
      title: 'Approvals',
      description: 'Review, approve, or reject finance applications.',
      onClick: () => router.push('/dashboard/finance/approvals'),
      icon: ClipboardCheck,
      iconClass: 'h-5 w-5 text-emerald-700',
    },
    {
      key: 'customer_handling',
      title: 'Finance Customer Handling',
      description: 'Manage finance-linked customer workflows.',
      onClick: () => router.push('/dashboard/finance/customers'),
      icon: UserCog,
      iconClass: 'h-5 w-5 text-indigo-700',
    },
    {
      key: 'finance_reports',
      title: 'Finance Reports',
      description: 'Track portfolio, quality, and performance trends.',
      onClick: () => router.push('/dashboard/finance/reports'),
      icon: FileBarChart2,
      iconClass: 'h-5 w-5 text-violet-700',
    },
    {
      key: 'finance_collection',
      title: 'Finance Collection',
      description: 'Post and monitor repayments and dues.',
      onClick: () => router.push('/dashboard/finance/collections'),
      icon: HandCoins,
      iconClass: 'h-5 w-5 text-amber-700',
    },
  ];
  const insightCards = [
    {
      key: 'customer_centric_view',
      title: 'Customer Centric View',
      description: 'Focus on vehicle customers with quick insight into active, arrears, and settled positions.',
      icon: Users,
      iconClass: 'h-5 w-5 text-cyan-700',
    },
    {
      key: 'cash_flow_planning',
      title: 'Cash Flow Planning',
      description: 'Use the running installment book and arrears exposure to plan daily and monthly collections.',
      icon: Banknote,
      iconClass: 'h-5 w-5 text-emerald-700',
    },
    {
      key: 'portfolio_quality',
      title: 'Portfolio Quality',
      description: 'Track portfolio mix between vehicle and other mortgage products.',
      icon: PieChart,
      iconClass: 'h-5 w-5 text-indigo-700',
    },
  ];
  const showHeaderWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}header`);
  const showOperationsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}operations`);
  const showInsightsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}insights`);
  const visibleOperationItems = operationItems.filter(
    (item) => !hiddenWidgetKeys.includes(`${widgetPrefix}operation_${item.key}`)
  );
  const visibleInsightCards = insightCards.filter(
    (item) => !hiddenWidgetKeys.includes(`${widgetPrefix}insight_${item.key}`)
  );
  const showAnyWidget = showHeaderWidget || showOperationsWidget || showInsightsWidget;

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

      <nav className="relative z-10 mb-6 bg-white/80 backdrop-blur-lg shadow-lg border border-white/20 rounded-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">DOF</span>
                </div>
                <h1 className="text-gray-900 text-base sm:text-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent truncate max-w-[180px] sm:max-w-none">
                  Desk of Finance
                </h1>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <div className="hidden sm:flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
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

              <div className="hidden sm:flex items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-left">
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-900 max-w-[220px] truncate">{displayName}</p>
                  <p className="text-[11px] text-slate-500 truncate">{roleName}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-cyan-600 hover:to-blue-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {widgetNotice ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-5 text-sm font-semibold text-cyan-900">
            All widgets are currently hidden. Use `Restore Hidden Widgets` from the main dashboard to show them again.
          </div>
        ) : null}

        {showHeaderWidget ? (
        <div className="relative bg-white/82 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(14,116,144,0.45)] p-6 md:p-7 flex items-start justify-between gap-4 flex-wrap">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
              aria-label="Hide finance header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div>
            <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 border border-cyan-100">
              Finance Management
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Vehicle Finance Control Center</h1>
            <p className="text-sm text-slate-600 mt-1 max-w-xl">
              Monitor your vehicle finance portfolio, arrears exposure, and running installment book in one dedicated view.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold border border-slate-200 shadow-sm flex items-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              Main Dashboard
            </button>
            <button
              type="button"
              onClick={openIssueFinance}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-sm font-semibold shadow-sm flex items-center gap-2"
            >
              <Banknote className="h-4 w-4" />
              Issue Finance
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/mortgages')}
              className="px-4 py-2 rounded-xl bg-white hover:bg-cyan-50 text-cyan-800 text-sm font-semibold border border-cyan-200 shadow-sm flex items-center gap-2"
            >
              <Car className="h-4 w-4" />
              Go to Mortgage Module
            </button>
          </div>
        </div>
        ) : null}

        {showOperationsWidget ? (
        <div className="relative bg-white/86 backdrop-blur-xl rounded-3xl border border-cyan-100 shadow-[0_18px_40px_-24px_rgba(14,116,144,0.5)] p-5">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}operations`)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
              aria-label="Hide finance operations widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Finance Operations</h2>
              <p className="text-xs text-slate-600 mt-1">Core sections for day-to-day vehicle finance operations.</p>
            </div>
          </div>

          {visibleOperationItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {visibleOperationItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className="relative rounded-2xl border border-cyan-200 bg-white hover:bg-cyan-50 text-left p-4 transition-colors"
                >
                  <WidgetCloseGate>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        void hideWidget(`${widgetPrefix}operation_${item.key}`);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          void hideWidget(`${widgetPrefix}operation_${item.key}`);
                        }
                      }}
                      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                      aria-label={`Hide ${item.title} widget`}
                    >
                      ×
                    </span>
                  </WidgetCloseGate>
                  <item.icon className={item.iconClass} />
                  <p className="mt-2 text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
              All finance operation widgets are hidden.
            </div>
          )}
        </div>
        ) : null}

        {showInsightsWidget ? (
          <div className="relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}insights`)}
                className="absolute right-2 -top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                aria-label="Hide finance insights widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            {visibleInsightCards.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {visibleInsightCards.map((item) => (
                  <div key={item.key} className="relative rounded-2xl border border-cyan-100 bg-white/86 backdrop-blur-xl p-4">
                    <WidgetCloseGate>
                      <button
                        type="button"
                        onClick={() => void hideWidget(`${widgetPrefix}insight_${item.key}`)}
                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                        aria-label={`Hide ${item.title} widget`}
                      >
                        ×
                      </button>
                    </WidgetCloseGate>
                    <div className="flex items-center gap-2">
                      <item.icon className={item.iconClass} />
                      <p className="font-bold text-slate-900">{item.title}</p>
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{item.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                All finance insight widgets are hidden.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {registerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-5xl h-[88vh] rounded-2xl bg-white border border-cyan-100 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Finance Onboarding</p>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">Register New Finance Agreement</h3>
                <p className="text-sm text-slate-600 mt-1">Step {activeWizardStep.id} of 4: {activeWizardStep.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRegisterOpen(false);
                  resetRegisterForm();
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="px-6 py-4 border-b border-cyan-100 bg-white">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-semibold">
                {wizardSteps.map((step) => {
                  const isActive = registerStep === step.id;
                  const isDone = registerStep > step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setRegisterStep(step.id)}
                      className={`rounded-xl px-3 py-2 border text-left transition-colors ${isActive ? 'bg-cyan-50 text-cyan-800 border-cyan-200' : isDone ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-white text-slate-500 border-slate-200'}`}
                    >
                      <div className="font-bold">{step.id}. {step.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-80">{step.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-slate-50/40">
              {registerStep === 1 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Basic Details</p>
                    <p className="text-xs text-slate-500 mt-1">Identify the customer and define the finance product terms.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Customer No</label>
                      <div className="flex items-center gap-2">
                        <input
                          value={regCustomerNo}
                          onChange={(e) => setRegCustomerNo(e.target.value)}
                          className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                          placeholder="e.g. CUS-20260321-154530-00001"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!token) return;
                            await loadLatestRegisteredCustomerNo(token);
                          }}
                          disabled={generatingCustomerNo}
                          className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 disabled:opacity-60"
                        >
                          {generatingCustomerNo ? 'Loading...' : 'Load Latest'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Finance Type</label>
                      <select value={regFinanceType} onChange={(e) => setRegFinanceType(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900">
                        <option value="vehicle">Vehicle</option>
                        <option value="equipment">Equipment</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Product Type</label>
                      <div className="space-y-2">
                        <select value={regProductType} onChange={(e) => setRegProductType(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900">
                          <option value="">Select product type</option>
                          {productTypes.map((pt) => (
                            <option key={pt.id} value={pt.name}>{pt.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setAddingProductType((v) => !v)}
                          className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50"
                        >
                          {addingProductType ? 'Close Add Product Type' : 'Add Product Type'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {addingProductType && (
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Type Name</label>
                        <input
                          value={newProductTypeName}
                          onChange={(e) => setNewProductTypeName(e.target.value)}
                          className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                          placeholder="e.g. Balloon Lease"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Description</label>
                        <div className="flex items-center gap-2">
                          <input
                            value={newProductTypeDescription}
                            onChange={(e) => setNewProductTypeDescription(e.target.value)}
                            className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                            placeholder="Optional description"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!token) return;
                              const name = newProductTypeName.trim();
                              if (!name) return;
                              try {
                                const response = await axios.post(
                                  '/api/finance-product-types',
                                  {
                                    name,
                                    description: newProductTypeDescription.trim() || undefined,
                                  },
                                  {
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                      Accept: 'application/json',
                                    },
                                  },
                                );

                                const created = response.data as ProductTypeRow;
                                setProductTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
                                setRegProductType(created.name);
                                setNewProductTypeName('');
                                setNewProductTypeDescription('');
                                setAddingProductType(false);
                              } catch {
                                setErrorMessage('Failed to create product type.');
                              }
                            }}
                            className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-2 text-xs font-semibold text-white hover:from-cyan-700 hover:to-blue-700"
                          >
                            Save Type
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-xl border border-cyan-100 bg-white p-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Interest Rate %</label>
                      <input value={regInterestRate} onChange={(e) => setRegInterestRate(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="e.g. 18" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Interest Type</label>
                      <select value={regInterestType} onChange={(e) => setRegInterestType(e.target.value as 'fixed' | 'reducing')} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900">
                        <option value="fixed">Fixed</option>
                        <option value="reducing">Reducing</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Tenure (Months)</label>
                      <input value={regTenureMonths} onChange={(e) => setRegTenureMonths(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="e.g. 36" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Installment Frequency</label>
                      <select value={regFrequency} onChange={(e) => setRegFrequency(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900">
                        <option value="monthly">Monthly</option>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-cyan-100 bg-white p-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Start Date</label>
                      <input type="date" value={regStartDate} onChange={(e) => setRegStartDate(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" />
                    </div>
                  </div>
                </div>
              )}

              {registerStep === 2 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Vehicle & Valuation</p>
                    <p className="text-xs text-slate-500 mt-1">Capture vehicle identity and valuation figures used for approval.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Vehicle No</label>
                      <input value={regVehicleNo} onChange={(e) => setRegVehicleNo(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="e.g. CAB-1234" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Chassis No</label>
                      <input value={regChassisNo} onChange={(e) => setRegChassisNo(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Engine No</label>
                      <input value={regEngineNo} onChange={(e) => setRegEngineNo(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Make / Model</label>
                      <input value={regMakeModel} onChange={(e) => setRegMakeModel(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="e.g. Toyota Axio" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Year</label>
                      <input value={regVehicleYear} onChange={(e) => setRegVehicleYear(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="e.g. 2020" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Asset Reference</label>
                      <input value={regAssetRef} onChange={(e) => setRegAssetRef(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Optional ref" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Vehicle Value</label>
                      <input value={regAmount} onChange={(e) => setRegAmount(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Total value" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Down Payment</label>
                      <input value={regDownPayment} onChange={(e) => setRegDownPayment(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Customer contribution" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Valuation Amount</label>
                      <input value={regValuationAmount} onChange={(e) => setRegValuationAmount(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Valued amount" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Valuation Date</label>
                      <input type="date" value={regValuationDate} onChange={(e) => setRegValuationDate(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Valuer Name</label>
                      <input value={regValuerName} onChange={(e) => setRegValuerName(e.target.value)} className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Valuer" />
                    </div>
                  </div>
                </div>
              )}

              {registerStep === 3 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Guarantor Profile</p>
                    <p className="text-xs text-slate-500 mt-1">Capture one or many guarantors for risk mitigation.</p>
                  </div>
                  <div className="space-y-3">
                    {regGuarantors.map((guarantor, index) => (
                      <div key={`guarantor-${index}`} className="rounded-xl border border-cyan-100 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Guarantor {index + 1}</p>
                          {regGuarantors.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setRegGuarantors((prev) => prev.filter((_, i) => i !== index))}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Guarantor Name</label>
                            <input
                              value={guarantor.name}
                              onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, name: e.target.value } : g))}
                              className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">NIC</label>
                            <input
                              value={guarantor.nic}
                              onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, nic: e.target.value } : g))}
                              className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Phone</label>
                            <input
                              value={guarantor.phone}
                              onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, phone: e.target.value } : g))}
                              className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Address</label>
                            <input
                              value={guarantor.address}
                              onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, address: e.target.value } : g))}
                              className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => setRegGuarantors((prev) => [...prev, { name: '', nic: '', phone: '', address: '' }])}
                      className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50"
                    >
                      + Add Another Guarantor
                    </button>
                  </div>
                </div>
              )}

              {registerStep === 4 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-cyan-100 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Document Checklist</p>
                    <p className="text-xs text-slate-500 mt-1">Upload supporting files. You can submit without documents and upload later as well.</p>
                  </div>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setRegDocuments(Array.from(e.target.files || []))}
                    className="w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  {regDocuments.length > 0 && (
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 text-xs text-slate-700 space-y-1">
                      {regDocuments.map((f, index) => (
                        <div key={`${f.name}-${index}`}>{f.name}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-cyan-100 bg-white flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Step {activeWizardStep.id}/4: <span className="font-semibold text-slate-700">{activeWizardStep.label}</span>
              </div>

              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRegisterOpen(false);
                  resetRegisterForm();
                }}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              {registerStep > 1 && (
                <button
                  type="button"
                  onClick={() => setRegisterStep((s) => Math.max(1, s - 1))}
                  className="px-4 py-2 rounded-lg bg-white border border-cyan-200 text-cyan-800 text-sm font-semibold"
                >
                  Previous
                </button>
              )}
              {registerStep < 4 && (
                <button
                  type="button"
                  onClick={() => setRegisterStep((s) => Math.min(4, s + 1))}
                  className="px-4 py-2 rounded-lg bg-cyan-100 border border-cyan-200 text-cyan-800 text-sm font-semibold"
                >
                  Next
                </button>
              )}
              {registerStep === 4 && (
                <button
                  type="button"
                  disabled={savingRegister}
                  onClick={submitRegister}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {savingRegister ? 'Saving...' : 'Complete Registration'}
                </button>
              )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
