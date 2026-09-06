"use client";

import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  Wallet,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import { WidgetCloseGate } from "@/lib/useWidgetsFixed";

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

export default function LoanDashboardPage() {
  const [token, setToken] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState("");
  const widgetPrefix = "loan_dashboard_widget_";
  const router = useRouter();

  async function fetchNotificationPreview(authToken: string) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/notifications/preview?limit=4`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) throw new Error("Failed to load notification preview");
      const payload = await response.json();
      setActionCenterTotalCount(Number(payload?.action_center_total || 0));
    } catch {
      setActionCenterTotalCount(0);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("auth_user");
    router.push("/");
  }

  const displayName = String(authUser?.name || authUser?.email || "User").trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || "Staff").trim();

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      router.push("/");
      return;
    }
    setToken(storedToken);
    void fetchWidgetPreferences(storedToken);
    void fetchNotificationPreview(storedToken);

    const storedUser = localStorage.getItem("auth_user");
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [router]);

  async function fetchWidgetPreferences(authToken: string) {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/dashboard/widgets`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of rows) {
        const key = String(row?.widget_key || "").trim();
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
    setWidgetNotice("");
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);
    const ok = await saveWidgetPreference(widgetKey, false);
    if (!ok) {
      setHiddenWidgetKeys(previous);
      setWidgetNotice("Failed to hide widget. Please try again.");
    }
  }, [hiddenWidgetKeys, saveWidgetPreference]);

  const showHeaderWidget = !hiddenWidgetKeys.has(`${widgetPrefix}header`);
  const showOperationsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}operations`);
  const showOverviewWidget = !hiddenWidgetKeys.has(`${widgetPrefix}overview`);
  const showQuickActionsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}quick_actions`);
  const operationItems = [
    {
      key: "new_loan_request",
      title: "New Loan Request",
      description: "Open the step-by-step request creation wizard.",
      path: "/dashboard/loan/request",
      icon: PlusCircle,
      cardClass: "rounded-2xl border border-cyan-200 bg-white hover:bg-cyan-50 text-left p-4 transition-colors",
      iconClass: "h-5 w-5 text-cyan-700",
    },
    {
      key: "loan_requests",
      title: "Loan Requests",
      description: "Review submitted requests in a separate module page.",
      path: "/dashboard/loan/requests",
      icon: ListChecks,
      cardClass: "rounded-2xl border border-cyan-200 bg-white hover:bg-cyan-50 text-left p-4 transition-colors",
      iconClass: "h-5 w-5 text-emerald-700",
    },
    {
      key: "request_queue",
      title: "Request Queue",
      description: "Track request statuses and approval progress levels.",
      path: "/dashboard/loan/requests",
      icon: ClipboardList,
      cardClass: "rounded-2xl border border-cyan-200 bg-white hover:bg-cyan-50 text-left p-4 transition-colors",
      iconClass: "h-5 w-5 text-violet-700",
    },
    {
      key: "office_collection",
      title: "Office Collection",
      description: "Collect approved loan installments at the branch office desk.",
      path: "/dashboard/office-collections",
      icon: Wallet,
      cardClass: "rounded-2xl border border-indigo-200 bg-white hover:bg-indigo-50 text-left p-4 transition-colors",
      iconClass: "h-5 w-5 text-indigo-700",
    },
    {
      key: "credit_module",
      title: "Credit Module",
      description: "Jump back to the credit module and related workflows.",
      path: "/dashboard/credit",
      icon: Wallet,
      cardClass: "rounded-2xl border border-cyan-200 bg-white hover:bg-cyan-50 text-left p-4 transition-colors",
      iconClass: "h-5 w-5 text-amber-700",
    },
  ];
  const visibleOperationItems = operationItems.filter(
    (item) => !hiddenWidgetKeys.has(`${widgetPrefix}operation_${item.key}`)
  );
  const showAnyWidget = showHeaderWidget || showOperationsWidget || showOverviewWidget || showQuickActionsWidget;

  if (!token) {
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

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
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
                onClick={() => router.push("/dashboard")}
                className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                Back to Dashboard
              </button>

              <div className="hidden items-center space-x-2 text-xs text-gray-600 sm:flex sm:text-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                <span>System Online</span>
              </div>

              <button
                type="button"
                onClick={() => router.push("/dashboard/action-center")}
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

        {widgetNotice ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
            All widgets are hidden. Use Restore Hidden Widgets from the dashboard to bring them back.
          </div>
        ) : null}

        {showHeaderWidget ? (
        <div className="relative bg-white/82 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_20px_60px_-30px_rgba(14,116,144,0.45)] p-6 md:p-7 flex items-start justify-between gap-4 flex-wrap">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide loan dashboard header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div>
            <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 border border-cyan-100">
              Loan Management
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-3">Loan Control Center</h1>
            <p className="text-sm text-slate-600 mt-1 max-w-xl">
              Manage loan workflow modules, create new requests, and monitor request queues from one page.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => router.push("/dashboard/office-collections")}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-semibold shadow-sm flex items-center gap-2"
            >
              <Wallet className="h-4 w-4" />
              Office Collection
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/loan/request")}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-sm font-semibold shadow-sm flex items-center gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              New Loan Request
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold border border-slate-200 shadow-sm flex items-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              Main Dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/credit")}
              className="px-4 py-2 rounded-xl bg-white hover:bg-cyan-50 text-cyan-800 text-sm font-semibold border border-cyan-200 shadow-sm flex items-center gap-2"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Back to Credit
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
              className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide loan operations widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Loan Operations</h2>
              <p className="text-xs text-slate-600 mt-1">Access each loan function as a dedicated module.</p>
            </div>
          </div>

          {visibleOperationItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {visibleOperationItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => router.push(item.path)}
                  className={`relative ${item.cardClass}`}
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
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          void hideWidget(`${widgetPrefix}operation_${item.key}`);
                        }
                      }}
                      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
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
              All loan operation widgets are hidden.
            </div>
          )}
        </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {showOverviewWidget ? (
          <div className="relative lg:col-span-2 rounded-2xl border border-cyan-100 bg-white/90 p-6">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}overview`)}
                className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide module overview widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Module Overview</p>
            <h2 className="text-lg font-extrabold text-slate-900 mt-1">Structured Loan Workspace</h2>
            <p className="text-sm text-slate-600 mt-2">
              This dashboard now follows the finance-page style with dedicated module entry points and icon-led actions.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard/loan/requests")}
                className="px-4 py-2 rounded-xl bg-white border border-cyan-200 text-cyan-800 text-sm font-semibold hover:bg-cyan-50 flex items-center gap-2"
              >
                <ListChecks className="h-4 w-4" />
                Open Loan Requests Module
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard/loan/request")}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold hover:from-cyan-700 hover:to-blue-700 flex items-center gap-2"
              >
                <PlusCircle className="h-4 w-4" />
                Create New Request
              </button>
            </div>
          </div>
          ) : null}

          {showQuickActionsWidget ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-cyan-100 bg-white/90 p-4">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}quick_actions`)}
                  className="float-right inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide quick actions widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Quick Actions</p>
              <h3 className="mt-1 text-base font-extrabold text-slate-900">What do you want to do?</h3>
              <div className="mt-3 space-y-2 text-sm">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/loan/request")}
                  className="w-full text-left rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2 font-semibold text-cyan-900 hover:bg-cyan-100 flex items-center gap-2"
                >
                  <PlusCircle className="h-4 w-4" />
                  Create new loan request
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/loan/requests")}
                  className="w-full text-left rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2 font-semibold text-cyan-900 hover:bg-cyan-100 flex items-center gap-2"
                >
                  <ListChecks className="h-4 w-4" />
                  View separate loan requests module
                </button>
                <p className="text-xs text-slate-600">
                  Approvals and detailed loan analytics can be added here later.
                </p>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
