'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type CreditModule = {
  key: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  path: string;
  hidden?: boolean;
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

export default function CreditDashboardPage() {
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const router = useRouter();
  const apiBase = getApiBaseUrl();
  const officeCollectionWidgetKey = 'credit_widget_office_collection_center';

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      void fetchWidgetPreferences(storedToken);
      void fetchNotificationPreview(storedToken);

      const storedUser = localStorage.getItem('auth_user');
      if (storedUser) {
        try {
          setAuthUser(JSON.parse(storedUser));
        } catch {
          setAuthUser(null);
        }
      }
    }
  }, [router]);

  const fetchNotificationPreview = async (authToken: string) => {
    try {
      const response = await axios.get(`${apiBase}/notifications/preview`, {
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

  const fetchWidgetPreferences = async (authToken: string) => {
    setLoadingWidgets(true);
    try {
      const response = await axios.get(`${apiBase}/dashboard/widgets`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of rows) {
        const key = String(row?.widget_key || '').trim();
        if (!key.startsWith('credit_widget_')) continue;
        if (row?.is_visible === false) {
          nextHidden.add(key);
        }
      }
      setHiddenWidgetKeys(nextHidden);
    } catch {
      setHiddenWidgetKeys(new Set());
    } finally {
      setLoadingWidgets(false);
    }
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        `${apiBase}/dashboard/widgets`,
        { widget_key: widgetKey, is_visible: isVisible },
        { headers: { Authorization: `Bearer ${token}` } }
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
      setWidgetNotice({
        open: true,
        title: 'Widget Update Failed',
        message: 'Failed to hide this card. Please try again.',
      });
    }
  };

  const modules: CreditModule[] = [
    {
      key: 'credit_widget_loan_management',
      name: 'Loan Management',
      icon: '🧾',
      color: 'from-lime-500 to-emerald-500',
      bgColor: 'from-lime-50 to-emerald-50',
      path: '/dashboard/loan',
      hidden: true,
    },
    {
      key: 'credit_widget_finance_management',
      name: 'Finance Management',
      icon: '💰',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'from-green-50 to-emerald-50',
      path: '/dashboard/finance',
    },
    {
      key: 'credit_widget_microfinance',
      name: 'Loan And Microfinance',
      icon: '🏦',
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'from-blue-50 to-cyan-50',
      path: '/dashboard/microfinance',
    },
    {
      key: 'credit_widget_mortgage_management',
      name: 'Mortgage Management',
      icon: '🏠',
      color: 'from-purple-500 to-indigo-500',
      bgColor: 'from-purple-50 to-indigo-50',
      path: '/dashboard/mortgages',
    },
  ];

  const visibleModules = modules.filter((module) => !module.hidden && !hiddenWidgetKeys.has(module.key));
  const showOfficeCollectionCard = !hiddenWidgetKeys.has(officeCollectionWidgetKey);

  if (!token || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 relative overflow-hidden">
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">DOF</span>
                </div>
                <h1 className="text-gray-900 text-base sm:text-xl font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent truncate max-w-[180px] sm:max-w-none">
                  Desk of Finance
                </h1>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Back to Dashboard
              </button>

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
                className="w-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-emerald-600 hover:to-cyan-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6 p-6">
        <div className="bg-white/85 backdrop-blur-sm rounded-3xl border border-emerald-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Section</p>
            <h1 className="text-3xl font-extrabold text-slate-900 mt-1">Credit</h1>
            <p className="text-sm text-slate-600 mt-1">Manage all credit products from one place.</p>
          </div>
        </div>

        {showOfficeCollectionCard && (
          <div
            className="relative rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 p-6 text-white shadow-lg cursor-pointer hover:opacity-95 transition"
            onClick={() => router.push('/dashboard/office-collections')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') router.push('/dashboard/office-collections');
            }}
            role="button"
            tabIndex={0}
          >
            <WidgetCloseGate>
<button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void hideWidget(officeCollectionWidgetKey);
              }}
              className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/20 text-sm font-bold text-white transition hover:bg-white/30"
              aria-label="Hide Office Collection Center widget"
            >
              ×
            </button>
</WidgetCloseGate>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-100">Office operations</p>
            <h2 className="mt-1 text-2xl font-extrabold">Collection Center</h2>
            <p className="text-sm text-indigo-50 mt-1 max-w-2xl">
              Collect installments for credit loans, finance, micro credit, and mortgages from one desk — built for branch office collection.
            </p>
            <span className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-700">
              Open Collection Center →
            </span>
          </div>
        )}

        <div className="rounded-3xl border border-emerald-100 bg-white/85 backdrop-blur-sm p-6">
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Section</p>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Credit Products</h2>
            <p className="text-sm text-slate-600 mt-1">Manage lending operations across all credit products.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleModules.map((module) => (
              <div
                key={module.key}
                onClick={() => router.push(module.path)}
                className="group relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-white/30 overflow-hidden transform hover:-translate-y-2 hover:scale-105"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${module.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

                <div className="relative p-6">
                  <WidgetCloseGate>
<button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void hideWidget(module.key);
                    }}
                    className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${module.name} widget`}
                  >
                    ×
                  </button>
</WidgetCloseGate>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-14 h-14 bg-gradient-to-r ${module.color} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      {module.icon}
                    </div>
                    <div className="w-8 h-8 bg-white/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                      {module.name}
                    </h3>
                    <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                      Open module and manage credit operations.
                    </p>
                  </div>

                  <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-500 group-hover:w-full transition-all duration-500"></div>
                </div>
              </div>
            ))}
            {visibleModules.length === 0 && (
              <div className="col-span-full rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                <p className="text-sm font-semibold text-amber-900">All credit cards are hidden.</p>
                <p className="mt-1 text-xs text-amber-700">Use dashboard restore with admin approval to show them again.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {widgetNotice.open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-emerald-100 bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">{widgetNotice.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{widgetNotice.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
