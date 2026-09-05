'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

interface Designation {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function Designations() {
  const [token, setToken] = useState('');
  const apiBase = getApiBaseUrl();
  const widgetPrefix = 'hrm_designations_widget_';
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [designationToDelete, setDesignationToDelete] = useState<Designation | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageModalTitle, setMessageModalTitle] = useState('');
  const [messageModalBody, setMessageModalBody] = useState('');
  const [messageModalType, setMessageModalType] = useState<'error' | 'success'>('error');
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState<string | null>(null);
  const router = useRouter();

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const fetchWidgetPreferences = useCallback(
    async (authToken?: string) => {
      const tokenToUse = authToken || token;
      if (!tokenToUse) return;

      try {
        const response = await axios.get(`${apiBase}/dashboard/widgets`, {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
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
        setWidgetNotice('Invalid widget key. Please refresh and try again.');
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

  const fetchDesignations = useCallback(
    async (authToken?: string, page = 1) => {
      const tokenToUse = authToken || token;
      if (!tokenToUse) return;

      try {
        setListLoading(true);
        const response = await axios.get(`${apiBase}/hr/designations`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          params: { page, per_page: perPage },
        });

        const payload = response.data || {};
        const rows = Array.isArray(payload?.data)
          ? (payload.data as Designation[])
          : Array.isArray(payload)
            ? (payload as Designation[])
            : [];

        const serverPage = Number(payload?.current_page || page || 1);
        const serverLastPage = Number(payload?.last_page || 1);
        const serverTotal = Number(payload?.total || rows.length);

        setDesignations(rows);
        setCurrentPage(serverPage > 0 ? serverPage : 1);
        setTotalPages(serverLastPage > 0 ? serverLastPage : 1);
        setTotalRows(serverTotal >= 0 ? serverTotal : rows.length);
        setApiError(null);
      } catch (error) {
        const err: any = error;
        console.error('Error fetching designations:', err?.response?.status, err?.response?.data || err?.message);
        setApiError(
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          `Failed to fetch designations (${err?.response?.status || 'network error'})`
        );
      } finally {
        setListLoading(false);
      }
    },
    [apiBase, token, perPage]
  );

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      setApiError(null);
      fetchDesignations(storedToken, 1);
      fetchWidgetPreferences(storedToken);
    }
  }, [router, fetchWidgetPreferences, fetchDesignations]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setEditingDesignation(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const designationData = {
      name,
      description,
    };

    try {
      if (editingDesignation) {
        await axios.put(`${apiBase}/hr/designations/${editingDesignation.id}`, designationData, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
      } else {
        await axios.post(`${apiBase}/hr/designations`, designationData, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
      }
      await fetchDesignations(token, 1);
      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving designation:', error);
      setMessageModalType('error');
      setMessageModalTitle('Save Failed');
      setMessageModalBody('Failed to save designation. Please try again.');
      setShowMessageModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (designation: Designation) => {
    setEditingDesignation(designation);
    setName(designation.name);
    setDescription(designation.description);
    setShowForm(true);
  };

  const handleDelete = (designation: Designation) => {
    setDesignationToDelete(designation);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!designationToDelete) return;

    try {
      await axios.delete(`${apiBase}/hr/designations/${designationToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setShowDeleteModal(false);
      setDesignationToDelete(null);
      await fetchDesignations(token, currentPage);
    } catch (error) {
      const err: any = error;
      console.error('Error deleting designation:', err?.response?.status, err?.response?.data || err?.message);
      setShowDeleteModal(false);
      setMessageModalType('error');
      setMessageModalTitle('Delete Failed');
      setMessageModalBody('Failed to delete designation. Please try again.');
      setShowMessageModal(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (!token) {
    return <div>Loading...</div>;
  }

  const showNameColumn = !hiddenWidgetKeys.includes(`${widgetPrefix}col_name`);
  const showDescriptionColumn = !hiddenWidgetKeys.includes(`${widgetPrefix}col_description`);
  const showCreatedColumn = !hiddenWidgetKeys.includes(`${widgetPrefix}col_created`);
  const showAnyColumn = showNameColumn || showDescriptionColumn || showCreatedColumn;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {widgetNotice && (
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{widgetNotice}</div>
        </div>
      )}

      {/* Modern Navigation */}
      {!hiddenWidgetKeys.includes(`${widgetPrefix}top_nav`) && (
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <WidgetCloseGate>
          <button
            type="button"
            onClick={() => hideWidget(`${widgetPrefix}top_nav`)}
            className="absolute top-3 right-3 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm z-20"
            aria-label="Hide designation top navigation widget"
            title="Hide widget"
          >
            ×
          </button>
        </WidgetCloseGate>
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <button
                onClick={() => router.push('/dashboard/hrm')}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium text-sm sm:text-base">Back to HRM</span>
              </button>
            </div>
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  🏷️
                </div>
                <span className="font-medium text-gray-900">Designation Management</span>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      )}

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {apiError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3">
            {apiError}
          </div>
        )}
        {!hiddenWidgetKeys.includes(`${widgetPrefix}hero`) && (
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => hideWidget(`${widgetPrefix}hero`)}
              className="absolute -top-2 right-0 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
              aria-label="Hide designation hero widget"
              title="Hide widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-2xl shadow-lg">
                🏷️
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Designation Management</h2>
                <p className="text-sm sm:text-base md:text-lg text-gray-600">Manage job positions and titles</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:space-x-6 sm:gap-0 mt-2 sm:mt-4">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-blue-600">{totalRows}</div>
                <div className="text-sm text-gray-500">Total Designations</div>
              </div>
            </div>
          </div>
        </div>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">🏷️</div>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {editingDesignation ? 'Edit Designation' : 'Add New Designation'}
                      </h3>
                      <p className="text-white/80">
                        {editingDesignation ? 'Update designation information' : 'Create a new designation'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowForm(false)}
                    className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Designation Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-6 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                      {loading ? 'Saving...' : (editingDesignation ? 'Update Designation' : 'Create Designation')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {!hiddenWidgetKeys.includes(`${widgetPrefix}designation_list`) && (
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 overflow-hidden relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => hideWidget(`${widgetPrefix}designation_list`)}
              className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
              aria-label="Hide designation list widget"
              title="Hide widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Designation List</span>
            </h3>
          </div>
          {listLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="h-12 animate-pulse rounded-xl bg-blue-50" />
              ))}
            </div>
          ) : showAnyColumn ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  {showNameColumn && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>Name</span>
                        <WidgetCloseGate><button type="button" onClick={() => hideWidget(`${widgetPrefix}col_name`)} className="h-5 w-5 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300">×</button></WidgetCloseGate>
                      </div>
                    </th>
                  )}
                  {showDescriptionColumn && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>Description</span>
                        <WidgetCloseGate><button type="button" onClick={() => hideWidget(`${widgetPrefix}col_description`)} className="h-5 w-5 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300">×</button></WidgetCloseGate>
                      </div>
                    </th>
                  )}
                  {showCreatedColumn && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>Created</span>
                        <WidgetCloseGate><button type="button" onClick={() => hideWidget(`${widgetPrefix}col_created`)} className="h-5 w-5 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-rose-600 hover:border-rose-300">×</button></WidgetCloseGate>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {designations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(showNameColumn ? 1 : 0) + (showDescriptionColumn ? 1 : 0) + (showCreatedColumn ? 1 : 0) || 1}
                      className="px-6 py-12 text-center text-sm text-gray-500"
                    >
                      No designations found.
                    </td>
                  </tr>
                ) : (
                designations.map((designation) => (
                  <tr key={designation.id} className="hover:bg-gray-50 transition-colors duration-200">
                    {showNameColumn && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {designation.name}
                      </td>
                    )}
                    {showDescriptionColumn && (
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {designation.description || 'No description'}
                      </td>
                    )}
                    {showCreatedColumn && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(designation.created_at).toLocaleDateString()}
                      </td>
                    )}
                  </tr>
                ))) }
              </tbody>
            </table>
          </div>
          ) : (
            <div className="text-center py-12 text-gray-500">All designation table columns are hidden.</div>
          )}

          <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-600">
              Showing {totalRows === 0 ? 0 : (currentPage - 1) * perPage + 1} to {Math.min(currentPage * perPage, totalRows)} of {totalRows}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchDesignations(token, Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1 || listLoading}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {Math.max(totalPages, 1)}
              </span>
              <button
                type="button"
                onClick={() => fetchDesignations(token, Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages || listLoading}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
        )}

        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-200">
              <div className="px-5 py-4 bg-gradient-to-r from-red-500 to-pink-500">
                <h4 className="text-white font-semibold">Confirm Deletion</h4>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-gray-700">
                  Are you sure you want to delete
                  <span className="font-semibold"> {designationToDelete?.name || 'this designation'}</span>?
                </p>
                <p className="text-xs text-red-700">This action cannot be undone.</p>
              </div>
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDesignationToDelete(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {showMessageModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              <div
                className={`px-5 py-4 ${
                  messageModalType === 'error'
                    ? 'bg-gradient-to-r from-red-500 to-pink-500'
                    : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                }`}
              >
                <h4 className="text-white font-semibold">{messageModalTitle}</h4>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-700">{messageModalBody}</p>
              </div>
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}