'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400';

function extractApiMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const data = error.response?.data;
  if (typeof data === 'string') {
    return sanitizeMessage(data, fallback);
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string') {
      return sanitizeMessage(record.message, fallback);
    }
    if (typeof record.error === 'string') {
      return sanitizeMessage(record.error, fallback);
    }
    if (record.errors && typeof record.errors === 'object') {
      const first = Object.values(record.errors as Record<string, unknown>)[0];
      if (Array.isArray(first) && typeof first[0] === 'string') {
        return sanitizeMessage(first[0], fallback);
      }
    }
  }

  return fallback;
}

function sanitizeMessage(raw: string, fallback: string): string {
  const message = raw.trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();
  if (
    lower.includes('sqlstate') ||
    lower.includes('integrity constraint violation') ||
    lower.includes('foreign key constraint') ||
    lower.includes('duplicate entry') ||
    lower.includes('connection: mysql') ||
    lower.includes('insert into')
  ) {
    return fallback;
  }

  return message;
}

interface Permission {
  id: number;
  name: string;
  module: string;
  description: string;
  is_active: boolean;
}

interface Role {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  permissions?: Permission[];
  created_at?: string;
}

export default function RolesAddPage() {
  const router = useRouter();
  const apiBase = getApiBaseUrl();
  const widgetPrefix = 'hrm_roles_widget_';

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [roleSearchTerm, setRoleSearchTerm] = useState('');
  const [rolesPage, setRolesPage] = useState(1);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('Notice');
  const [noticeMessage, setNoticeMessage] = useState('');

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteRole, setPendingDeleteRole] = useState<Role | null>(null);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState<string | null>(null);

  const openNotice = useCallback((title: string, message: string) => {
    setNoticeTitle(title);
    setNoticeMessage(message);
    setNoticeOpen(true);
  }, []);

  const closeNotice = useCallback(() => {
    setNoticeOpen(false);
    setNoticeTitle('Notice');
    setNoticeMessage('');
  }, []);

  const fetchWidgetPreferences = useCallback(
    async (authToken?: string) => {
      const auth = authToken || token;
      if (!auth) return;

      try {
        const response = await axios.get(`${apiBase}/dashboard/widgets`, {
          headers: {
            Authorization: `Bearer ${auth}`,
            Accept: 'application/json',
          },
        });

        const widgets = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
        const hiddenKeys = widgets
          .filter((item: { widget_key?: string; is_visible?: boolean | number | null }) => !item?.is_visible)
          .map((item: { widget_key?: string }) => item.widget_key)
          .filter((key: unknown): key is string => typeof key === 'string' && key.startsWith(widgetPrefix));

        setHiddenWidgetKeys(hiddenKeys);
        setWidgetNotice(null);
      } catch {
        setWidgetNotice('Failed to load widget preferences.');
      }
    },
    [apiBase, token, widgetPrefix]
  );

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean) => {
      if (!token) return false;

      const normalizedKey = widgetKey.trim();
      if (!normalizedKey || normalizedKey.length > 120) {
        setWidgetNotice('Invalid widget key. Please refresh the page and try again.');
        return false;
      }

      try {
        await axios.patch(
          `${apiBase}/dashboard/widgets`,
          {
            widget_key: normalizedKey,
            is_visible: Boolean(isVisible),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );
        setWidgetNotice(null);
        return true;
      } catch {
        setWidgetNotice('Failed to save widget preference.');
        return false;
      }
    },
    [apiBase, token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string) => {
      const ok = await saveWidgetPreference(widgetKey, false);
      if (!ok) return;

      setHiddenWidgetKeys((prev) => (prev.includes(widgetKey) ? prev : [...prev, widgetKey]));
    },
    [saveWidgetPreference]
  );

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
    void initializePage(storedToken);
  }, [router]);

  useEffect(() => {
    if (!formError) return;
    openNotice('Error', formError);
    setFormError('');
  }, [formError, openNotice]);

  useEffect(() => {
    if (!formSuccess) return;
    openNotice('Success', formSuccess);
    setFormSuccess('');
  }, [formSuccess, openNotice]);

  useEffect(() => {
    if (!widgetNotice) return;
    openNotice('Widget Notice', widgetNotice);
    setWidgetNotice(null);
  }, [widgetNotice, openNotice]);

  const initializePage = async (authToken: string) => {
    await Promise.all([
      fetchRoles(authToken),
      fetchWidgetPreferences(authToken),
    ]);
  };

  const fetchRoles = async (authToken?: string): Promise<Role[]> => {
    const auth = authToken || token;
    if (!auth) return [];

    try {
      setRolesLoading(true);
      const response = await axios.get(`${apiBase}/roles`, {
        headers: { Authorization: `Bearer ${auth}` },
        params: { per_page: 1000 },
      });

      const rows = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setRoles(rows as Role[]);
      return rows as Role[];
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      setRoles([]);
      return [];
    } finally {
      setRolesLoading(false);
    }
  };

  const filteredRoles = useMemo(() => {
    const keyword = roleSearchTerm.trim().toLowerCase();
    if (!keyword) return roles;

    return roles.filter((role) => {
      const text = `${role.name} ${role.description || ''} ${role.is_active ? 'active' : 'inactive'}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [roles, roleSearchTerm]);

  const rolesPageSize = 10;
  const rolesTotalPages = Math.max(1, Math.ceil(filteredRoles.length / rolesPageSize));
  const rolesStartIndex = (rolesPage - 1) * rolesPageSize;
  const rolesEndIndex = Math.min(rolesStartIndex + rolesPageSize, filteredRoles.length);
  const paginatedRoles = filteredRoles.slice(rolesStartIndex, rolesStartIndex + rolesPageSize);

  const activeRolesCount = useMemo(
    () => roles.filter((role) => role.is_active).length,
    [roles]
  );
  const showRoleColumn = !hiddenWidgetKeys.includes(`${widgetPrefix}col_role`);
  const showDescriptionColumn = !hiddenWidgetKeys.includes(`${widgetPrefix}col_description`);
  const showStatusColumn = !hiddenWidgetKeys.includes(`${widgetPrefix}col_status`);
  const showActionsColumn = !hiddenWidgetKeys.includes(`${widgetPrefix}col_actions`);
  const showAnyRoleTableColumn =
    showRoleColumn || showDescriptionColumn || showStatusColumn || showActionsColumn;

  useEffect(() => {
    if (rolesPage > rolesTotalPages) {
      setRolesPage(rolesTotalPages);
    }
  }, [rolesPage, rolesTotalPages]);

  useEffect(() => {
    setRolesPage(1);
  }, [roleSearchTerm]);

  const openCreateForm = () => {
    resetForm();
    setFormError('');
    setFormSuccess('');
    setShowCreateForm(true);
  };

  const resetForm = () => {
    setRoleName('');
    setRoleDescription('');
    setIsActive(true);
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roleName.trim()) {
      setFormError('Role name is required.');
      return;
    }

    setLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      await axios.post(
        `${apiBase}/roles`,
        {
          name: roleName.trim(),
          description: roleDescription.trim(),
          is_active: isActive,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setFormSuccess('Role created successfully.');
      resetForm();
      setShowCreateForm(false);
      await fetchRoles();
      openNotice('Success', 'Role created successfully.');
    } catch (error: unknown) {
      setFormError(
        extractApiMessage(error, 'Failed to create role. Please verify inputs and permissions.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    setPendingDeleteRole(role);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setPendingDeleteRole(null);
  };

  const confirmDeleteRole = async () => {
    const role = pendingDeleteRole;
    if (!role) return;

    setFormError('');
    setFormSuccess('');

    try {
      await axios.delete(`${apiBase}/roles/${role.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchRoles();
      setFormSuccess(`Role "${role.name}" deleted successfully.`);
      closeConfirm();
      openNotice('Success', `Role "${role.name}" deleted successfully.`);
      return;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        try {
          await axios.post(
            `${apiBase}/roles/${role.id}`,
            { _method: 'DELETE' },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          await fetchRoles();
          closeConfirm();
          openNotice('Success', `Role "${role.name}" deleted successfully.`);
          return;
        } catch (fallbackError: unknown) {
          openNotice('Delete failed', extractApiMessage(fallbackError, 'Failed to delete role.'));
          return;
        }
      }

      openNotice('Delete failed', extractApiMessage(error, 'Failed to delete role.'));
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl" />
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl" />
      </div>

      {!hiddenWidgetKeys.includes(`${widgetPrefix}top_nav`) && (
        <nav className="relative z-10 bg-white/85 backdrop-blur-lg shadow-lg border-b border-white/20">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => hideWidget(`${widgetPrefix}top_nav`)}
              className="absolute top-3 right-3 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-20"
              aria-label="Hide top navigation widget"
              title="Hide widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {!hiddenWidgetKeys.includes(`${widgetPrefix}back_button`) && (
              <div className="relative w-fit">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}back_button`)}
                    className="absolute -right-9 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                    aria-label="Hide back to HRM button widget"
                    title="Hide widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/hrm')}
                  className="inline-flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to HRM
                </button>
              </div>
            )}
            {!hiddenWidgetKeys.includes(`${widgetPrefix}title`) && (
              <div className="inline-flex items-center gap-2 text-gray-900 font-semibold relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}title`)}
                    className="absolute -right-9 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                    aria-label="Hide role management title widget"
                    title="Hide widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <Shield className="h-5 w-5 text-blue-600" />
                Role Management
              </div>
            )}
          </div>
        </nav>
      )}

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        {!hiddenWidgetKeys.includes(`${widgetPrefix}hero`) && (
        <div className="rounded-3xl border border-white/80 bg-white/90 shadow-xl overflow-hidden relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => hideWidget(`${widgetPrefix}hero`)}
              className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
              aria-label="Hide roles hero widget"
              title="Hide widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 px-6 py-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-100">Human resources</p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">Roles & permissions</h1>
              <p className="text-sm text-blue-50 mt-1">
                Create roles and assign permissions loaded from the system permission file.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!hiddenWidgetKeys.includes(`${widgetPrefix}hero_stat_roles`) && (
                <div className="rounded-2xl bg-white/15 px-4 py-3 text-center min-w-[88px] relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}hero_stat_roles`)}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full border border-white/60 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                      aria-label="Hide roles count widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <p className="text-2xl font-extrabold text-white">{roles.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-blue-100">Roles</p>
                </div>
              )}
              {!hiddenWidgetKeys.includes(`${widgetPrefix}hero_stat_active`) && (
                <div className="rounded-2xl bg-white/15 px-4 py-3 text-center min-w-[88px] relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}hero_stat_active`)}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full border border-white/60 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                      aria-label="Hide active roles widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <p className="text-2xl font-extrabold text-white">{activeRolesCount}</p>
                  <p className="text-[10px] uppercase tracking-wide text-blue-100">Active</p>
                </div>
              )}
              {!hiddenWidgetKeys.includes(`${widgetPrefix}hero_add_role`) && (
                <div className="relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}hero_add_role`)}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full border border-white/60 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                      aria-label="Hide add role button widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Add role
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {showCreateForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-white">Add new role</h3>
                    <p className="text-white/85 text-sm mt-1">Create a role profile. Access is managed by widget controls.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="w-10 h-10 bg-white/20 rounded-xl text-white hover:bg-white/30"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateRole} className="flex flex-col flex-1 min-h-0">
                <div className="p-6 overflow-y-auto space-y-5 flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Role name *</label>
                      <input
                        type="text"
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => setIsActive(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Active role
                      </label>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                      <textarea
                        value={roleDescription}
                        onChange={(e) => setRoleDescription(e.target.value)}
                        rows={2}
                        className={inputClass}
                      />
                    </div>
                  </div>

                </div>

                <div className="flex justify-end gap-3 p-6 border-t border-gray-100 shrink-0 bg-white">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowCreateForm(false);
                    }}
                    className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold disabled:opacity-60"
                  >
                    {loading ? 'Creating…' : 'Create role'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {!hiddenWidgetKeys.includes(`${widgetPrefix}roles_table_section`) && (
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 overflow-hidden relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => hideWidget(`${widgetPrefix}roles_table_section`)}
              className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
              aria-label="Hide role list widget"
              title="Hide widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Role list</h2>
            <div className="flex flex-wrap items-center gap-2">
              {!hiddenWidgetKeys.includes(`${widgetPrefix}roles_search`) && (
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={roleSearchTerm}
                    onChange={(e) => setRoleSearchTerm(e.target.value)}
                    placeholder="Search roles…"
                    className={`${inputClass} pl-10 py-2.5`}
                  />
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}roles_search`)}
                      className="absolute -right-9 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                      aria-label="Hide role search widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                </div>
              )}
              {!hiddenWidgetKeys.includes(`${widgetPrefix}roles_refresh`) && (
                <div className="relative">
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={() => hideWidget(`${widgetPrefix}roles_refresh`)}
                      className="absolute -right-8 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                      aria-label="Hide role refresh button widget"
                      title="Hide widget"
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => fetchRoles()}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              )}
            </div>
          </div>

          {rolesLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-blue-50" />
              ))}
            </div>
          ) : (
            <>
              {showAnyRoleTableColumn ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {showRoleColumn && (
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>Role</span>
                            <WidgetCloseGate>
                              <button
                                type="button"
                                onClick={() => hideWidget(`${widgetPrefix}col_role`)}
                                className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                aria-label="Hide role column"
                                title="Hide column"
                              >
                                ×
                              </button>
                            </WidgetCloseGate>
                          </div>
                        </th>
                      )}
                      {showDescriptionColumn && (
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>Description</span>
                            <WidgetCloseGate>
                              <button
                                type="button"
                                onClick={() => hideWidget(`${widgetPrefix}col_description`)}
                                className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                aria-label="Hide description column"
                                title="Hide column"
                              >
                                ×
                              </button>
                            </WidgetCloseGate>
                          </div>
                        </th>
                      )}
                      {showStatusColumn && (
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>Status</span>
                            <WidgetCloseGate>
                              <button
                                type="button"
                                onClick={() => hideWidget(`${widgetPrefix}col_status`)}
                                className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                aria-label="Hide status column"
                                title="Hide column"
                              >
                                ×
                              </button>
                            </WidgetCloseGate>
                          </div>
                        </th>
                      )}
                      {showActionsColumn && (
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>Actions</span>
                            <WidgetCloseGate>
                              <button
                                type="button"
                                onClick={() => hideWidget(`${widgetPrefix}col_actions`)}
                                className="h-6 w-6 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300"
                                aria-label="Hide actions column"
                                title="Hide column"
                              >
                                ×
                              </button>
                            </WidgetCloseGate>
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedRoles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={
                            (showRoleColumn ? 1 : 0) +
                            (showDescriptionColumn ? 1 : 0) +
                            (showStatusColumn ? 1 : 0) +
                            (showActionsColumn ? 1 : 0) || 1
                          }
                          className="px-6 py-12 text-center text-sm text-gray-500"
                        >
                          {roleSearchTerm ? 'No roles match your search.' : 'No roles yet. Click Add role to create one.'}
                        </td>
                      </tr>
                    ) : (
                      paginatedRoles.map((role) => (
                        <tr key={role.id} className="hover:bg-blue-50/40 transition-colors">
                          {showRoleColumn && (
                            <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">{role.name}</td>
                          )}
                          {showDescriptionColumn && (
                            <td className="px-6 py-4 text-gray-800">{role.description || '—'}</td>
                          )}
                          {showStatusColumn && (
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  role.is_active
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}
                              >
                                {role.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          )}
                          {showActionsColumn && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDeleteRole(role)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              ) : (
                <div className="px-6 py-12 text-center text-sm text-gray-500">
                  All role table columns are hidden. Use `Restore Hidden Widgets` in the main dashboard.
                </div>
              )}

              <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Showing {filteredRoles.length === 0 ? 0 : rolesStartIndex + 1} to {rolesEndIndex} of {filteredRoles.length}
                  {filteredRoles.length !== roles.length ? ` (filtered from ${roles.length})` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRolesPage((prev) => Math.max(1, prev - 1))}
                    disabled={rolesPage === 1}
                    className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {rolesPage} of {rolesTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRolesPage((prev) => Math.min(rolesTotalPages, prev + 1))}
                    disabled={rolesPage === rolesTotalPages}
                    className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        )}
      </main>

      {confirmOpen && pendingDeleteRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeConfirm} />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900">Confirm delete</h3>
            <p className="mt-2 text-sm text-gray-700">
              Are you sure you want to delete role &quot;{pendingDeleteRole.name}&quot;?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRole}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeNotice} />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900">{noticeTitle}</h3>
            <p className="mt-2 text-sm text-gray-700 leading-relaxed">{noticeMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeNotice}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
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
