'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import ModuleHeader from '../../_components/ModuleHeader';
import SectionCard from '../../_components/SectionCard';
import StatCard from '../../_components/StatCard';
import { CalendarDays, Banknote, PercentCircle } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

export default function MortgageSchedule() {
  const params = useParams();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [mortgage, setMortgage] = useState<any>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState('');
  const id = params?.id as string;
  const widgetPrefix = 'mortgages_schedule_widget_';

  const fetchNotificationPreview = useCallback(async (authToken: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/notifications/preview?limit=4`, {
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
  }, []);

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
    } else {
      setToken(t);
      fetchMortgage(t);
      fetchSchedule(t);
      void fetchWidgetPreferences(t);
      void fetchNotificationPreview(t);

      const storedUser = localStorage.getItem('auth_user');
      if (storedUser) {
        try {
          setAuthUser(JSON.parse(storedUser) as AuthUser);
        } catch {
          setAuthUser(null);
        }
      }
    }
  }, [fetchNotificationPreview, router]);

  const fetchSchedule = async (authToken: string) => {
    try {
      const res = await axios.get(`/api/mortgages/${id}/schedule`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = res.data.data || res.data;
      setSchedule(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMortgage = async (authToken: string) => {
    try {
      const res = await axios.get(`/api/mortgages/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setMortgage(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  async function fetchWidgetPreferences(authToken: string) {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
        headers: { Authorization: `Bearer ${authToken}` },
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
  }

  const saveWidgetPreference = useCallback(async (widgetKey: string, isVisible: boolean) => {
    if (!token) return false;
    try {
      await axios.patch(
        `${getApiBaseUrl()}/dashboard/widgets`,
        { widget_key: widgetKey, is_visible: isVisible },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch {
      return false;
    }
  }, [token]);

  const hideWidget = useCallback(async (widgetKey: string) => {
    setWidgetNotice('');
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);
    const ok = await saveWidgetPreference(widgetKey, false);
    if (!ok) {
      setHiddenWidgetKeys(previous);
      setWidgetNotice('Failed to hide widget. Please try again.');
    }
  }, [hiddenWidgetKeys, saveWidgetPreference]);

  const statCards = mortgage
    ? [
        { key: 'stat_requested', icon: <Banknote className="h-5 w-5" />, label: 'Requested', value: mortgage.requested_amount, tone: 'primary' as const },
        { key: 'stat_interest', icon: <PercentCircle className="h-5 w-5" />, label: 'Interest', value: `${mortgage.interest_rate}% (${mortgage.interest_type})`, tone: 'success' as const },
        { key: 'stat_tenure', icon: <CalendarDays className="h-5 w-5" />, label: 'Tenure', value: `${mortgage.tenure_months} months`, tone: 'warning' as const },
      ]
    : [];
  const visibleStatCards = statCards.filter((card) => !hiddenWidgetKeys.has(`${widgetPrefix}${card.key}`));

  const scheduleColumns: Array<{
    key: string;
    label: string;
    render: (row: any) => string | number;
  }> = [
    { key: 'installment', label: 'Installment', render: (s) => s.installment_no },
    { key: 'due_date', label: 'Due Date', render: (s) => s.due_date },
    { key: 'principal', label: 'Principal', render: (s) => s.principal },
    { key: 'interest', label: 'Interest', render: (s) => s.interest },
    { key: 'total', label: 'Total', render: (s) => s.total_amount },
    { key: 'status', label: 'Status', render: (s) => s.status },
  ];
  const visibleScheduleColumns = scheduleColumns.filter((column) => !hiddenWidgetKeys.has(`${widgetPrefix}column_${column.key}`));

  const showHeaderWidget = !hiddenWidgetKeys.has(`${widgetPrefix}header`);
  const showStatsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}stats_section`);
  const showScheduleWidget = !hiddenWidgetKeys.has(`${widgetPrefix}schedule_table`);
  const showAnyWidget = showHeaderWidget || (showStatsWidget && visibleStatCards.length > 0) || showScheduleWidget;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <nav className="mb-6 rounded-2xl border border-white/20 bg-white/80 p-3 shadow-lg backdrop-blur-lg">
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
                onClick={() => router.push('/dashboard/mortgages')}
                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                Back to Mortgages
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

        {showHeaderWidget ? (
          <ModuleHeader
            title="Repayment Schedule"
            subtitle={`Mortgage #${id}`}
            breadcrumbs={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Mortgages', href: '/dashboard/mortgages' },
              { label: `#${id}`, href: `/dashboard/mortgages/${id}` },
              { label: 'Schedule' },
            ]}
            onHideWidget={() => void hideWidget(`${widgetPrefix}header`)}
            hideWidgetAriaLabel="Hide schedule header widget"
            actions={(
              <div className="flex items-center gap-2">
                <button onClick={() => router.push('/dashboard')} className="rounded-lg bg-gradient-to-r from-slate-600 to-gray-800 px-4 py-2 text-white shadow-sm transition hover:opacity-95">Dashboard</button>
                <button onClick={() => router.push(`/dashboard/mortgages/${id}`)} className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-white shadow-sm transition hover:opacity-95">Details</button>
                <button onClick={() => router.push(`/dashboard/mortgages/${id}/payments`)} className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-white shadow-sm transition hover:opacity-95">Payments</button>
                <button onClick={() => router.push(`/dashboard/mortgages/${id}/documents`)} className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-white shadow-sm transition hover:opacity-95">Documents</button>
                <button onClick={() => router.back()} className="rounded-lg bg-gradient-to-r from-gray-500 to-zinc-700 px-4 py-2 text-white shadow-sm transition hover:opacity-95">Back</button>
              </div>
            )}
          />
        ) : null}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {widgetNotice ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
            All widgets are hidden. Use Restore Hidden Widgets from the dashboard to bring them back.
          </div>
        ) : null}

        {mortgage && showStatsWidget ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-6">
            {visibleStatCards.map((card) => (
              <StatCard
                key={card.key}
                icon={card.icon}
                label={card.label}
                value={card.value}
                tone={card.tone}
                onHideWidget={() => void hideWidget(`${widgetPrefix}${card.key}`)}
                hideWidgetAriaLabel={`Hide ${card.label} widget`}
              />
            ))}
            {visibleStatCards.length === 0 ? (
              <div className="md:col-span-3 rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                All summary cards are hidden.
              </div>
            ) : null}
          </div>
        ) : null}
        {showScheduleWidget ? (
        <SectionCard
          title="Installment Schedule"
          onHideWidget={() => void hideWidget(`${widgetPrefix}schedule_table`)}
          hideWidgetAriaLabel="Hide installment schedule widget"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {visibleScheduleColumns.map((column) => (
                    <th key={column.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-between gap-2">
                        <span>{column.label}</span>
                        <WidgetCloseGate>
                          <button
                            type="button"
                            onClick={() => void hideWidget(`${widgetPrefix}column_${column.key}`)}
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Hide ${column.label} column`}
                          >
                            ×
                          </button>
                        </WidgetCloseGate>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {schedule.map(s => (
                  <tr key={s.id}>
                    {visibleScheduleColumns.map((column) => (
                      <td key={column.key} className="px-6 py-4 text-sm">{column.render(s)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleScheduleColumns.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">All schedule columns are hidden.</p>
              </div>
            )}
            {schedule.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No schedule generated.</p>
                {mortgage && (
                  <p className="mt-2 text-sm text-gray-400">Status {mortgage.status}</p>
                )}
              </div>
            )}
          </div>
        </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
