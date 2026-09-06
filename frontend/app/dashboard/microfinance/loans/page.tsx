'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { WidgetCloseGate } from '@/lib/useWidgetsFixed';

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

export default function LoanManagementPage() {
    const [token] = useState(() => {
        if (typeof window === 'undefined') {
            return '';
        }

        return localStorage.getItem('token') || '';
    });
    const [authUser, setAuthUser] = useState<AuthUser | null>(null);
    const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
    const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
    const [widgetNotice, setWidgetNotice] = useState<{ open: boolean; title: string; message: string }>({
        open: false,
        title: '',
        message: '',
    });
    const router = useRouter();
    const widgetPrefix = 'mf_loans_widget_';

    const fetchNotificationPreview = async (authToken: string) => {
        try {
            const response = await axios.get('/api/notifications/preview', {
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

    const fetchWidgetPreferences = async (authToken: string) => {
        try {
            const response = await axios.get('/api/dashboard/widgets', {
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
    };

    const saveWidgetPreference = async (widgetKey: string, isVisible: boolean) => {
        if (!token) return false;
        try {
            await axios.patch(
                '/api/dashboard/widgets',
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
                message: 'Failed to hide this widget. Please try again.',
            });
        }
    };

    useEffect(() => {
        if (!token) {
            router.push('/');
        } else {
            queueMicrotask(() => {
                void fetchWidgetPreferences(token);
                void fetchNotificationPreview(token);
                const storedUser = localStorage.getItem('auth_user');
                if (storedUser) {
                    try {
                        setAuthUser(JSON.parse(storedUser));
                    } catch {
                        setAuthUser(null);
                    }
                }
            });
        }
    }, [router, token]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('auth_user');
        router.push('/');
    };

    const displayName = String(authUser?.name || authUser?.email || 'User').trim();
    const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || 'Staff').trim();

    const options = [
        {
            key: `${widgetPrefix}request_loan`,
            title: 'Request Loan',
            description: 'Create and submit new loan requests for customers.',
            icon: '📝',
            color: 'from-emerald-500 to-green-500',
            bgColor: 'from-emerald-50 to-green-50',
            accent: 'bg-emerald-500',
            tag: 'Origination',
            path: '/dashboard/microfinance/loans/request',
        },
        {
            key: `${widgetPrefix}loan_approvals`,
            title: 'Loan Approvals',
            description: 'Review pending approvals and approve or reject loans.',
            icon: '🔎',
            color: 'from-amber-500 to-orange-500',
            bgColor: 'from-amber-50 to-orange-50',
            accent: 'bg-amber-500',
            tag: 'Decision Desk',
            path: '/dashboard/microfinance/loans/approvals',
        },
        {
            key: `${widgetPrefix}released_loans`,
            title: 'View Released Loans',
            description: 'View all disbursed/released loans with status details.',
            icon: '✅',
            color: 'from-blue-500 to-cyan-500',
            bgColor: 'from-blue-50 to-cyan-50',
            accent: 'bg-cyan-500',
            tag: 'Portfolio',
            path: '/dashboard/microfinance/loans/released',
        },
    ];
    const visibleOptions = options.filter((option) => !hiddenWidgetKeys.has(option.key));

    if (!token) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-100 px-4 py-8 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="absolute -top-14 left-10 h-72 w-72 rounded-full bg-cyan-300/70 blur-3xl"></div>
                <div className="absolute top-24 right-8 h-80 w-80 rounded-full bg-emerald-300/70 blur-3xl"></div>
                <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-300/70 blur-3xl"></div>
            </div>

            <nav className="max-w-7xl mx-auto relative z-10 mb-6 bg-white/80 backdrop-blur-lg shadow-lg border border-white/20 rounded-2xl">
                <div className="px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center">
                            <div className="flex-shrink-0 flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-lg flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">DOF</span>
                                </div>
                                <h1 className="text-gray-900 text-base sm:text-xl font-bold bg-gradient-to-r from-cyan-600 to-emerald-600 bg-clip-text text-transparent truncate max-w-[180px] sm:max-w-none">
                                    Desk of Finance
                                </h1>
                            </div>
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                            <button
                                type="button"
                                onClick={() => router.push('/dashboard/microfinance')}
                                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
                            >
                                Back to Microfinance
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
                                className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-cyan-600 hover:to-emerald-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto space-y-8 relative z-10">
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_24px_60px_-28px_rgba(8,47,73,0.65)] border border-white/50 p-6 md:p-8">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-700 uppercase">
                                Credit Operations Hub
                            </span>
                            <h1 className="text-3xl md:text-4xl font-black text-slate-900 mt-3 tracking-tight">Loan Management</h1>
                            <p className="text-sm md:text-base text-slate-600 mt-2 max-w-2xl">
                                Orchestrate the full loan lifecycle from origination to approval and released portfolio monitoring in one workspace.
                            </p>
                        </div>
                        <button
                            onClick={() => router.push('/dashboard/microfinance')}
                            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold border border-slate-200 shadow-sm"
                        >
                            Back
                        </button>
                    </div>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-cyan-100 bg-white/90 p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Workspaces</p>
                            <p className="text-2xl font-extrabold text-slate-900 mt-1">{visibleOptions.length}</p>
                        </div>
                        <div className="rounded-xl border border-cyan-100 bg-white/90 p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                            <p className="text-2xl font-extrabold text-emerald-700 mt-1">Ready</p>
                        </div>
                        <div className="rounded-xl border border-cyan-100 bg-white/90 p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Mode</p>
                            <p className="text-2xl font-extrabold text-slate-900 mt-1">Production</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {visibleOptions.map((option, index) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => router.push(option.path)}
                            className="group relative text-left bg-white/80 backdrop-blur-sm rounded-3xl shadow-[0_20px_40px_-30px_rgba(8,47,73,0.85)] hover:shadow-[0_28px_55px_-28px_rgba(8,47,73,0.75)] transition-all duration-500 cursor-pointer border border-white/50 overflow-hidden transform hover:-translate-y-2 hover:scale-[1.01]"
                            style={{ animationDelay: `${index * 70}ms` }}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${option.bgColor} opacity-40 group-hover:opacity-100 transition-opacity duration-500`}></div>
                            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/50 blur-2xl"></div>

                            <div className="relative p-6">
                                <WidgetCloseGate>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            void hideWidget(option.key);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void hideWidget(option.key);
                                            }
                                        }}
                                        className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                                        aria-label={`Hide ${option.title} widget`}
                                    >
                                        ×
                                    </span>
                                </WidgetCloseGate>
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`h-14 w-14 bg-gradient-to-r ${option.color} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                        {option.icon}
                                    </div>
                                    <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                                        <span className={`h-2 w-2 rounded-full ${option.accent}`}></span>
                                        {option.tag}
                                    </span>
                                </div>

                                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{option.title}</h3>
                                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{option.description}</p>

                                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                                    Open Workspace
                                    <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>

                                <div className="absolute bottom-0 left-0 h-1 w-0 bg-gradient-to-r from-cyan-500 to-emerald-500 group-hover:w-full transition-all duration-500"></div>
                            </div>
                        </button>
                    ))}
                </div>
                {visibleOptions.length === 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        All loan workspace widgets are hidden. Use &quot;Restore Hidden Widgets&quot; on dashboard to show them again.
                    </div>
                )}
            </div>
            {widgetNotice.open && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setWidgetNotice({ open: false, title: '', message: '' })} />
                    <div className="relative w-full max-w-sm rounded-2xl border border-cyan-100 bg-white p-5 shadow-xl">
                        <h3 className="text-base font-bold text-slate-900">{widgetNotice.title}</h3>
                        <p className="mt-2 text-sm text-slate-600">{widgetNotice.message}</p>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setWidgetNotice({ open: false, title: '', message: '' })}
                                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
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
