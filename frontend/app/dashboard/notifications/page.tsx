'use client';

import axios from 'axios';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';

type NotificationType =
  | 'system'
  | 'task'
  | 'approval'
  | 'finance'
  | 'reminder'
  | 'step_1'
  | 'step_2'
  | 'step_3'
  | 'step_4'
  | 'step_5'
  | 'step_6'
  | 'step_7'
  | 'step_8'
  | 'step_9'
  | 'step_10'
  | 'step_11'
  | 'step_12'
  | 'step_13'
  | 'step_14'
  | 'microfinance_loan_request'
  | 'microfinance_approval_request'
  | 'microfinance_send_back';

type NotificationScope = 'all' | 'important' | 'loan' | 'approval';

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  important: boolean;
  actionUrl?: string;
  meta?: NotificationMeta;
};

type NotificationMeta = {
  finance_id?: number;
  finance_ref?: string;
  customer_no?: string;
  status?: string;
  workflow_step?: number;
  workflow_step_title?: string;
  [key: string]: unknown;
};

type ApiNotificationRow = {
  id?: number | string;
  title?: string;
  message?: string;
  type?: string;
  created_at?: string;
  is_read?: boolean;
  is_important?: boolean;
  action_url?: string | null;
  meta?: Record<string, unknown> | null;
};

type StepRoleOption = {
  id: number;
  name: string;
  is_active?: boolean;
};

type StepRoleSettingRow = {
  workflow_step: number;
  title: string;
  allow_all_roles: boolean;
  role_ids: number[];
  updated_by_user_id?: number | null;
  updated_at?: string | null;
};

const typeStyles: Record<NotificationType, string> = {
  system: 'bg-violet-100 text-violet-700 border-violet-200',
  task: 'bg-blue-100 text-blue-700 border-blue-200',
  approval: 'bg-amber-100 text-amber-700 border-amber-200',
  finance: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  reminder: 'bg-rose-100 text-rose-700 border-rose-200',
  step_1: 'bg-lime-100 text-lime-700 border-lime-200',
  step_2: 'bg-slate-100 text-slate-700 border-slate-200',
  step_3: 'bg-red-100 text-red-700 border-red-200',
  step_4: 'bg-amber-100 text-amber-700 border-amber-200',
  step_5: 'bg-blue-100 text-blue-700 border-blue-200',
  step_6: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  step_7: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  step_8: 'bg-teal-100 text-teal-700 border-teal-200',
  step_9: 'bg-violet-100 text-violet-700 border-violet-200',
  step_10: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  step_11: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  step_12: 'bg-sky-100 text-sky-700 border-sky-200',
  step_13: 'bg-orange-100 text-orange-700 border-orange-200',
  step_14: 'bg-green-100 text-green-700 border-green-200',
  microfinance_loan_request: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  microfinance_approval_request: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  microfinance_send_back: 'bg-rose-100 text-rose-700 border-rose-200',
};

const resolveNotificationType = (value: string): NotificationType => {
  const normalized = String(value || 'system') as NotificationType;
  if (normalized in typeStyles) {
    return normalized;
  }

  return 'system';
};

const isStepType = (type: NotificationType): boolean => /^step_\d+$/.test(type);

const toMetaObject = (value: unknown): NotificationMeta | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as NotificationMeta;
};

const isFinanceWorkflowNotification = (row: NotificationItem): boolean => {
  if (row.type === 'finance') return true;
  if (!isStepType(row.type)) return false;

  const financeId = Number(row.meta?.finance_id || 0);
  const financeRef = String(row.meta?.finance_ref || '').trim();
  return financeId > 0 || financeRef !== '';
};

const resolveActionUrl = (row: NotificationItem): string | undefined => {
  const rawActionUrl = String(row.actionUrl || '').trim();

  if (isFinanceWorkflowNotification(row)) {
    return '/dashboard/finance/approvals';
  }

  if (rawActionUrl) {
    return rawActionUrl;
  }

  if (
    row.type === 'microfinance_loan_request' ||
    row.type === 'microfinance_approval_request' ||
    row.type === 'microfinance_send_back'
  ) {
    return '/dashboard/microfinance/loans/approvals';
  }

  return undefined;
};

const toNotificationSignature = (row: NotificationItem): string => {
  const meta = row.meta || {};
  const normalizedMeta = [
    String(meta.finance_id ?? ''),
    String(meta.finance_ref ?? ''),
    String(meta.customer_no ?? ''),
    String(meta.status ?? ''),
    String(meta.workflow_step ?? ''),
    String(meta.workflow_step_title ?? ''),
  ].join('|');

  return [
    row.type,
    String(row.title || '').trim().toLowerCase(),
    String(row.message || '').trim().toLowerCase(),
    String(row.actionUrl || '').trim().toLowerCase(),
    normalizedMeta,
    new Date(row.createdAt).toISOString().slice(0, 19),
  ].join('||');
};

const dedupeNotifications = (rows: NotificationItem[]): NotificationItem[] => {
  const signatures = new Set<string>();
  const uniqueRows: NotificationItem[] = [];

  for (const row of rows) {
    const signature = toNotificationSignature(row);
    if (signatures.has(signature)) {
      continue;
    }

    signatures.add(signature);
    uniqueRows.push(row);
  }

  return uniqueRows;
};

export default function NotificationsPage() {
  const router = useRouter();
  const apiBaseUrl = getApiBaseUrl();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'unread' | 'important'>('all');
  const [scope, setScope] = useState<NotificationScope>('all');
  const [summary, setSummary] = useState({ total: 0, unread: 0, important: 0 });
  const [barUnreadCount, setBarUnreadCount] = useState(0);
  const [barImportantUnreadCount, setBarImportantUnreadCount] = useState(0);
  const [barTypeCounts, setBarTypeCounts] = useState<Record<string, number>>({});
  const [barGroupedCounts, setBarGroupedCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [settingsRoles, setSettingsRoles] = useState<StepRoleOption[]>([]);
  const [settingsSteps, setSettingsSteps] = useState<StepRoleSettingRow[]>([]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setNotice('');
    try {
      const response = await axios.get(`${apiBaseUrl}/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        params: {
          tab,
          q: query,
          limit: 100,
        },
      });

      const rows = Array.isArray(response.data?.notifications) ? response.data.notifications : [];
      const mappedRows = (rows as ApiNotificationRow[]).map((row) => ({
          id: Number(row.id),
          title: String(row.title || 'Notification'),
          message: String(row.message || ''),
          type: resolveNotificationType(String(row.type || 'system')),
          createdAt: String(row.created_at || new Date().toISOString()),
          read: Boolean(row.is_read),
          important: Boolean(row.is_important),
          actionUrl: typeof row.action_url === 'string' ? row.action_url : undefined,
          meta: toMetaObject(row.meta),
        }));

      setNotifications(dedupeNotifications(mappedRows));
      setSummary({
        total: Number(response.data?.summary?.total || 0),
        unread: Number(response.data?.summary?.unread || 0),
        important: Number(response.data?.summary?.important || 0),
      });
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to load notifications.';
      setNotice(message);
      setNotifications([]);
      setSummary({ total: 0, unread: 0, important: 0 });
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, token, tab, query]);

  const fetchNotificationBarSnapshot = useCallback(async () => {
    if (!token) return;

    try {
      const response = await axios.get(`${apiBaseUrl}/notifications/preview`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        params: { limit: 8 },
      });

      setBarUnreadCount(Number(response.data?.unread_count || 0));
      setBarImportantUnreadCount(Number(response.data?.important_unread_count || 0));
      const nextTypeCounts =
        response.data?.type_counts && typeof response.data.type_counts === 'object'
          ? (response.data.type_counts as Record<string, number>)
          : {};
      setBarTypeCounts(nextTypeCounts);

      const nextGroupedCounts =
        response.data?.grouped_counts && typeof response.data.grouped_counts === 'object'
          ? (response.data.grouped_counts as Record<string, number>)
          : {};
      setBarGroupedCounts(nextGroupedCounts);
    } catch {
      setBarUnreadCount(0);
      setBarImportantUnreadCount(0);
      setBarTypeCounts({});
      setBarGroupedCounts({});
    }
  }, [apiBaseUrl, token]);

  const fetchFlowStepRoleSettings = useCallback(async (preserveNotice = false) => {
    if (!token) return false;

    try {
      setSettingsLoading(true);
      if (!preserveNotice) {
        setSettingsNotice('');
      }

      const response = await axios.get(`${apiBaseUrl}/microfinance/action-center/step-roles`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const roles = Array.isArray(response.data?.roles) ? response.data.roles : [];
      const steps = Array.isArray(response.data?.steps) ? response.data.steps : [];

      setSettingsRoles(
        roles.map((row: Record<string, unknown>) => ({
          id: Number(row.id || 0),
          name: String(row.name || ''),
          is_active: Boolean(row.is_active ?? true),
        }))
      );

      setSettingsSteps(
        steps.map((row: Record<string, unknown>) => ({
          workflow_step: Number(row.workflow_step || 0),
          title: String(row.title || ''),
          allow_all_roles: Boolean(row.allow_all_roles),
          role_ids: Array.isArray(row.role_ids)
            ? row.role_ids.map((id) => Number(id || 0)).filter((id) => Number.isFinite(id) && id > 0)
            : [],
          updated_by_user_id: row.updated_by_user_id == null ? null : Number(row.updated_by_user_id || 0),
          updated_at: row.updated_at == null ? null : String(row.updated_at),
        }))
      );

      return true;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setSettingsNotice('Only Super Admin, Admin, MD, CEO, Director, or Business Owner can manage flow settings.');
      } else {
        setSettingsNotice('Failed to load flow settings.');
      }

      return false;
    } finally {
      setSettingsLoading(false);
    }
  }, [apiBaseUrl, token]);

  const openFlowSettingsModal = async () => {
    setSettingsOpen(true);
    const ok = await fetchFlowStepRoleSettings();
    if (!ok) {
      return;
    }
  };

  const closeFlowSettingsModal = () => {
    if (settingsSaving) return;
    setSettingsOpen(false);
  };

  const toggleStepAllowAll = (workflowStep: number, nextValue: boolean) => {
    setSettingsSteps((prev) =>
      prev.map((step) =>
        step.workflow_step === workflowStep
          ? {
              ...step,
              allow_all_roles: nextValue,
            }
          : step
      )
    );
  };

  const toggleStepRole = (workflowStep: number, roleId: number) => {
    setSettingsSteps((prev) =>
      prev.map((step) => {
        if (step.workflow_step !== workflowStep) return step;

        const exists = step.role_ids.includes(roleId);
        return {
          ...step,
          role_ids: exists ? step.role_ids.filter((id) => id !== roleId) : [...step.role_ids, roleId],
        };
      })
    );
  };

  const saveFlowSettings = async () => {
    if (!token) return;

    try {
      setSettingsSaving(true);
      setSettingsNotice('');

      await axios.put(
        `${apiBaseUrl}/microfinance/action-center/step-roles`,
        {
          steps: settingsSteps.map((step) => ({
            workflow_step: step.workflow_step,
            allow_all_roles: Boolean(step.allow_all_roles),
            role_ids: Array.from(new Set(step.role_ids.map((id) => Number(id)).filter((id) => id > 0))),
          })),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      setSettingsNotice('Flow settings saved successfully.');
      await fetchNotificationBarSnapshot();
      await fetchNotifications();
      await fetchFlowStepRoleSettings(true);
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to save flow settings.';
      setSettingsNotice(message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const loanRequestCount = Number(barGroupedCounts.loan_requests ?? barTypeCounts['microfinance_loan_request'] ?? 0);
  const approvalRequestCount = Number(
    barGroupedCounts.approval_requests
      ?? (Number(barTypeCounts['microfinance_approval_request'] || 0) + Number(barTypeCounts['microfinance_send_back'] || 0))
  );

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    void fetchNotificationBarSnapshot();
  }, [fetchNotificationBarSnapshot]);

  const markAsRead = async (id: number) => {
    if (!token) return;
    try {
      await axios.patch(
        `${apiBaseUrl}/notifications/${id}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );
      await fetchNotifications();
      await fetchNotificationBarSnapshot();
    } catch {
      setNotice('Failed to mark notification as read.');
    }
  };

  const toggleImportant = async (id: number, nextValue: boolean) => {
    if (!token) return;
    try {
      await axios.patch(
        `${apiBaseUrl}/notifications/${id}/important`,
        { is_important: nextValue },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );
      await fetchNotifications();
      await fetchNotificationBarSnapshot();
    } catch {
      setNotice('Failed to update notification.');
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    try {
      await axios.patch(
        `${apiBaseUrl}/notifications/read-all`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );
      await fetchNotifications();
      await fetchNotificationBarSnapshot();
    } catch {
      setNotice('Failed to mark all notifications as read.');
    }
  };

  const clearRead = async () => {
    if (!token) return;
    try {
      await axios.delete(`${apiBaseUrl}/notifications/read`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      await fetchNotifications();
      await fetchNotificationBarSnapshot();
    } catch {
      setNotice('Failed to clear read notifications.');
    }
  };

  const unreadCount = summary.unread;
  const importantCount = summary.important;
  const totalCount = summary.total;

  const scopedNotifications = useMemo(() => {
    if (scope === 'all') return notifications;
    if (scope === 'important') return notifications.filter((row) => row.important);
    if (scope === 'loan') return notifications.filter((row) => row.type === 'microfinance_loan_request');
    return notifications.filter((row) => row.type === 'microfinance_approval_request' || row.type === 'microfinance_send_back');
  }, [notifications, scope]);

  const notificationBarItems = [
    {
      key: 'all' as NotificationScope,
      icon: '🔔',
      title: 'All Unread',
      count: barUnreadCount,
      color: 'bg-red-100 text-red-800 border-red-200',
    },
    {
      key: 'important' as NotificationScope,
      icon: '⚠️',
      title: 'Important',
      count: barImportantUnreadCount,
      color: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    {
      key: 'loan' as NotificationScope,
      icon: '📄',
      title: 'Loan Requests',
      count: loanRequestCount,
      color: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    {
      key: 'approval' as NotificationScope,
      icon: '✅',
      title: 'Approval Requests',
      count: approvalRequestCount,
      color: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-amber-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-white/80 bg-white/85 p-5 shadow-xl backdrop-blur sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Action Center
              </p>
              <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Action Center</h1>
              <p className="mt-1 text-sm text-slate-600">Stay updated with alerts, approvals, and workflow actions.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void openFlowSettingsModal()}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
              >
                Flow Settings
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-amber-600">Unread</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{unreadCount}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-rose-600">Important</p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{importantCount}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h3 className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">Dashboard Action Center</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">Quick Filter</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {notificationBarItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setScope(item.key);
                  setTab(item.key === 'all' || item.key === 'loan' || item.key === 'approval' ? 'all' : 'important');
                }}
                className={`inline-flex min-w-[150px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition hover:shadow ${item.color} ${
                  scope === item.key ? 'ring-2 ring-slate-300' : ''
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <div className="leading-tight">
                  <p className="text-[11px] font-semibold uppercase tracking-wide">{item.title}</p>
                  <p className="text-base font-extrabold">{item.count}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              {(['all', 'unread', 'important'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    tab === key
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notifications..."
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
              <button
                onClick={() => void markAllAsRead()}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Mark All Read
              </button>
              <button
                onClick={() => void clearRead()}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                Clear Read
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 text-center text-slate-500 shadow-sm">
              Loading notifications...
            </div>
          ) : scopedNotifications.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 text-center text-slate-500 shadow-sm">
              No notifications found for this filter.
            </div>
          ) : (
            scopedNotifications.map((row) => (
              <div
                key={row.id}
                className={`rounded-2xl border p-4 shadow-sm transition ${
                  row.read ? 'border-slate-200 bg-white/90' : 'border-amber-200 bg-amber-50/60'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{row.title}</h3>
                      {!row.read && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                          Unread
                        </span>
                      )}
                      {row.important && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                          Important
                        </span>
                      )}
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${typeStyles[row.type] || typeStyles.system}`}>
                        {row.type}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{row.message}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(row.createdAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {resolveActionUrl(row) && (
                      <button
                        onClick={() => router.push(resolveActionUrl(row) as string)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Open
                      </button>
                    )}
                    {!row.read && (
                      <button
                        onClick={() => void markAsRead(row.id)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Mark Read
                      </button>
                    )}
                    <button
                      onClick={() => void toggleImportant(row.id, !row.important)}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      {row.important ? 'Unstar' : 'Star'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {settingsOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Action Center Flow Settings</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Assign roles for each workflow step. Super Admin, MD, CEO, Directors, and Admin keep full override access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeFlowSettingsModal}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  disabled={settingsSaving}
                >
                  Close
                </button>
              </div>

              {settingsNotice && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {settingsNotice}
                </div>
              )}

              {settingsLoading ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Loading flow settings...
                </div>
              ) : (
                <div className="mt-4 max-h-[62vh] overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Step</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Allow All Roles</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Allowed Roles</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {settingsSteps.map((step) => (
                        <tr key={step.workflow_step}>
                          <td className="px-3 py-3 align-top">
                            <p className="font-semibold text-slate-900">Step {step.workflow_step}</p>
                            <p className="text-xs text-slate-600">{step.title}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={step.allow_all_roles}
                                onChange={(e) => toggleStepAllowAll(step.workflow_step, e.target.checked)}
                                disabled={settingsSaving}
                              />
                              Enabled
                            </label>
                          </td>
                          <td className="px-3 py-3 align-top">
                            {step.allow_all_roles ? (
                              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">All roles can access this step.</p>
                            ) : (
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                {settingsRoles.map((role) => {
                                  const checked = step.role_ids.includes(role.id);
                                  return (
                                    <label key={`${step.workflow_step}-${role.id}`} className="inline-flex items-center gap-2 text-xs text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleStepRole(step.workflow_step, role.id)}
                                        disabled={settingsSaving || step.allow_all_roles}
                                      />
                                      {role.name}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeFlowSettingsModal}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  disabled={settingsSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveFlowSettings()}
                  className="rounded-lg border border-indigo-300 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-70"
                  disabled={settingsSaving || settingsLoading || settingsSteps.length === 0}
                >
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
