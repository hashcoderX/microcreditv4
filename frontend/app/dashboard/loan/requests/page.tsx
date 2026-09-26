"use client";

import axios from "axios";
import { getApiBaseUrl, getBackendOrigin } from "@/lib/api";
import { WidgetCloseGate } from "@/lib/useWidgetsFixed";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  ExternalLink,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

type AlertModalState = {
  open: boolean;
  title: string;
  message: string;
  type: "success" | "error" | "warning";
};

type LoanRequestSummary = {
  id: number;
  request_no: string;
  loan_product: string;
  customer_full_name: string | null;
  customer_no: string | null;
  status: string;
  approval_level: number;
  required_approval_level: number;
};

type LoanRequestDocument = {
  id: number;
  document_type: string;
  file_path: string;
  original_name: string;
};

type LoanRequestDetail = LoanRequestSummary & {
  principal: number;
  annual_rate: number;
  tenure_months: number;
  installment_frequency: string;
  installments: number;
  installment_amount: number;
  total_payable: number;
  customer_nic?: string | null;
  customer_mobile?: string | null;
  customer_address?: string | null;
  customer_details?: {
    incomeSource?: string;
    monthlyIncome?: string | number;
    additionalIncome?: string | number;
    businessName?: string;
  };
  guarantor_details?: Array<{
    fullName?: string;
    nic?: string;
    mobile?: string;
    relation?: string;
    address?: string;
    monthlyIncome?: string | number;
  }> | null;
  documents?: LoanRequestDocument[];
};

type StatusFilter = "all" | "pending_approval" | "approved" | "rejected";

type PaginationMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

type RequestStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

type RequestTableColumn = {
  key: string;
  label: string;
  className: string;
};

const PER_PAGE_OPTIONS = [10, 15, 25, 50] as const;

function mapRequestRow(item: Record<string, unknown>): LoanRequestSummary {
  return {
    id: Number(item.id),
    request_no: String(item.request_no || ""),
    loan_product: String(item.loan_product || ""),
    customer_full_name: (item.customer_full_name as string | null) ?? null,
    customer_no: (item.customer_no as string | null) ?? null,
    status: String(item.status || "pending_approval"),
    approval_level: Number(item.approval_level ?? 1),
    required_approval_level: Number(item.required_approval_level ?? 1),
  };
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles =
    normalized === "approved"
      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-200/60"
      : normalized === "rejected"
        ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-rose-200/60"
        : "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-amber-200/60";

  const Icon =
    normalized === "approved" ? CheckCircle2 : normalized === "rejected" ? XCircle : Clock3;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm ${styles}`}>
      <Icon className="h-3.5 w-3.5" />
      {statusLabel(status)}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-cyan-100/80 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function LoanRequestsPage() {
  const apiBase = getApiBaseUrl();
  const widgetPrefix = "loan_requests_widget_";
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState<LoanRequestSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(15);
  const [pagination, setPagination] = useState<PaginationMeta>({
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: 0,
    from: null,
    to: null,
  });
  const [stats, setStats] = useState<RequestStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewLoan, setReviewLoan] = useState<LoanRequestDetail | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    open: false,
    title: "",
    message: "",
    type: "success",
  });
  const requestsAbortRef = useRef<AbortController | null>(null);
  const statsAbortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const openAlertModal = (type: AlertModalState["type"], title: string, message: string) => {
    setAlertModal({ open: true, type, title, message });
  };

  const closeAlertModal = () => {
    setAlertModal((prev) => ({ ...prev, open: false }));
  };

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${apiBase}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: "application/json",
        },
      });

      const widgets = Array.isArray(response.data?.data) ? response.data.data : [];
      const hidden = widgets
        .filter(
          (item: { widget_key?: unknown; is_visible?: unknown }) =>
            typeof item.widget_key === "string" &&
            item.widget_key.startsWith(widgetPrefix) &&
            Number(item.is_visible) === 0
        )
        .map((item: { widget_key: string }) => item.widget_key);

      setHiddenWidgetKeys(hidden);
    } catch {
      setWidgetNotice("Failed to load widget preferences.");
    }
  }, [apiBase]);

  const saveWidgetPreference = useCallback(
    async (widgetKey: string, isVisible: boolean) => {
      if (!token) return;

      try {
        await axios.post(
          `${apiBase}/dashboard/widgets`,
          { widget_key: widgetKey, is_visible: isVisible ? 1 : 0 },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }
        );
        setWidgetNotice("");
      } catch {
        setWidgetNotice("Failed to save widget preference.");
      }
    },
    [apiBase, token]
  );

  const hideWidget = useCallback(
    async (widgetKey: string) => {
      setHiddenWidgetKeys((prev) => (prev.includes(widgetKey) ? prev : [...prev, widgetKey]));
      await saveWidgetPreference(widgetKey, false);
    },
    [saveWidgetPreference]
  );

  const formatAmount = (value: unknown): string => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "-";
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const documentUrl = (filePath: string): string => {
    if (!filePath) return "#";
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) return filePath;
    return `${getBackendOrigin()}/storage/${filePath}`;
  };

  const fetchStats = useCallback(async (authToken: string) => {
    statsAbortRef.current?.abort();
    const controller = new AbortController();
    statsAbortRef.current = controller;

    setStatsLoading(true);

    try {
      const response = await axios.get(`${apiBase}/loan-requests/summary`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: "application/json",
        },
      });

      const payload = response.data?.data ?? response.data;

      setStats({
        total: Number(payload?.total ?? 0),
        pending: Number(payload?.pending ?? 0),
        approved: Number(payload?.approved ?? 0),
        rejected: Number(payload?.rejected ?? 0),
      });
    } catch (err) {
      if (axios.isAxiosError(err) && err.code === "ERR_CANCELED") {
        return;
      }
      // Keep previous stats on failure.
    } finally {
      if (!controller.signal.aborted) {
        setStatsLoading(false);
      }
    }
  }, [apiBase]);

  const fetchRequests = useCallback(
    async (authToken: string, pageToLoad: number, pageSize: number, filter: StatusFilter, search: string) => {
      requestsAbortRef.current?.abort();
      const controller = new AbortController();
      requestsAbortRef.current = controller;

      setLoading(true);
      setError("");
      try {
        const params: Record<string, string | number> = {
          page: pageToLoad,
          per_page: pageSize,
        };
        if (filter !== "all") params.status = filter;
        if (search.trim()) params.q = search.trim();

        const response = await axios.get(`${apiBase}/loan-requests`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${authToken}`,
            Accept: "application/json",
          },
          params,
        });

        const pageData = response.data;
        const rows = Array.isArray(pageData?.data) ? pageData.data : [];
        setRequests(rows.map((item: Record<string, unknown>) => mapRequestRow(item)));
        setPagination({
          current_page: Number(pageData?.current_page ?? 1),
          last_page: Number(pageData?.last_page ?? 1),
          per_page: Number(pageData?.per_page ?? pageSize),
          total: Number(pageData?.total ?? 0),
          from: pageData?.from != null ? Number(pageData.from) : null,
          to: pageData?.to != null ? Number(pageData.to) : null,
        });
      } catch (err) {
        if (axios.isAxiosError(err) && err.code === "ERR_CANCELED") {
          return;
        }
        const message = "Unable to load loan requests.";
        setError(message);
        setRequests([]);
        openAlertModal("error", "Load Failed", message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [apiBase]
  );

  const reloadList = useCallback(() => {
    if (!token) return;
    fetchRequests(token, page, perPage, statusFilter, debouncedSearch);
    fetchStats(token);
  }, [token, page, perPage, statusFilter, debouncedSearch, fetchRequests, fetchStats]);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      router.push("/");
      return;
    }
    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!token) return;
    fetchStats(token);
    fetchWidgetPreferences(token);
  }, [token, fetchStats, fetchWidgetPreferences]);

  useEffect(() => {
    if (!token) return;
    fetchRequests(token, page, perPage, statusFilter, debouncedSearch);
  }, [token, page, perPage, statusFilter, debouncedSearch, fetchRequests]);

  useEffect(() => {
    return () => {
      requestsAbortRef.current?.abort();
      statsAbortRef.current?.abort();
    };
  }, []);

  const openReviewModal = async (loanRequestId: number) => {
    if (!token) return;

    setReviewOpen(true);
    setReviewLoading(true);
    setReviewLoan(null);
    setReviewNote("");
    setReviewConfirmed(false);

    try {
      const response = await axios.get(`${apiBase}/loan-requests/${loanRequestId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const data = response.data?.data || response.data;
      setReviewLoan({
        id: Number(data?.id),
        request_no: data?.request_no || "-",
        loan_product: data?.loan_product || "-",
        customer_full_name: data?.customer_full_name ?? null,
        customer_no: data?.customer_no ?? null,
        status: data?.status || "pending_approval",
        approval_level: Number(data?.approval_level ?? 1),
        required_approval_level: Number(data?.required_approval_level ?? 1),
        principal: Number(data?.principal ?? 0),
        annual_rate: Number(data?.annual_rate ?? 0),
        tenure_months: Number(data?.tenure_months ?? 0),
        installment_frequency: data?.installment_frequency || "-",
        installments: Number(data?.installments ?? 0),
        installment_amount: Number(data?.installment_amount ?? 0),
        total_payable: Number(data?.total_payable ?? 0),
        customer_nic: data?.customer_nic ?? null,
        customer_mobile: data?.customer_mobile ?? null,
        customer_address: data?.customer_address ?? null,
        customer_details: data?.customer_details ?? {},
        guarantor_details: Array.isArray(data?.guarantor_details) ? data.guarantor_details : [],
        documents: Array.isArray(data?.documents) ? data.documents : [],
      });
    } catch (err) {
      closeReviewModal();
      if (axios.isAxiosError(err)) {
        openAlertModal(
          "error",
          "Review Load Failed",
          (typeof err.response?.data?.message === "string" && err.response?.data?.message) ||
            "Failed to load loan request details."
        );
      } else {
        openAlertModal("error", "Review Load Failed", "Failed to load loan request details.");
      }
    } finally {
      setReviewLoading(false);
    }
  };

  const closeReviewModal = () => {
    if (actionLoadingId !== null) return;
    setReviewOpen(false);
    setReviewLoan(null);
    setReviewNote("");
    setReviewConfirmed(false);
  };

  const handleStatusAction = async (loanRequestId: number, action: "approve" | "reject") => {
    if (!token || actionLoadingId !== null) return;

    if (!reviewConfirmed) {
      openAlertModal(
        "warning",
        "Review Confirmation Required",
        "Please confirm you reviewed loan details and documents before proceeding."
      );
      return;
    }

    const note = reviewNote.trim();
    if (action === "reject" && !note) {
      openAlertModal("warning", "Rejection Note Required", "Rejection note is required.");
      return;
    }

    setActionLoadingId(loanRequestId);

    try {
      const response = await axios.post(
        `${apiBase}/loan-requests/${loanRequestId}/status`,
        { action, note: note || null },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const updated = response.data?.data;
      setRequests((prev) =>
        prev.map((item) =>
          item.id === loanRequestId
            ? {
                ...item,
                status: updated?.status ?? item.status,
                approval_level: Number(updated?.approval_level ?? item.approval_level),
                required_approval_level: Number(updated?.required_approval_level ?? item.required_approval_level),
              }
            : item
        )
      );

      openAlertModal(
        "success",
        "Status Updated",
        action === "approve" ? "Loan request approved successfully." : "Loan request rejected successfully."
      );
      setReviewNote("");
      setReviewConfirmed(false);
      setReviewOpen(false);
      setReviewLoan(null);
      fetchStats(token);
      fetchRequests(token, page, perPage, statusFilter, debouncedSearch);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        openAlertModal(
          "error",
          "Status Update Failed",
          (typeof err.response?.data?.message === "string" && err.response?.data?.message) ||
            "Failed to update loan request status."
        );
      } else {
        openAlertModal("error", "Status Update Failed", "Failed to update loan request status.");
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      key: "stat_total_requests",
      label: "Total Requests",
      value: stats.total,
      icon: ClipboardList,
      gradient: "from-cyan-500 to-blue-600",
      ring: "ring-cyan-200/60",
    },
    {
      key: "stat_pending_review",
      label: "Pending Review",
      value: stats.pending,
      icon: Clock3,
      gradient: "from-amber-400 to-orange-500",
      ring: "ring-amber-200/60",
    },
    {
      key: "stat_approved",
      label: "Approved",
      value: stats.approved,
      icon: CheckCircle2,
      gradient: "from-emerald-500 to-teal-600",
      ring: "ring-emerald-200/60",
    },
    {
      key: "stat_rejected",
      label: "Rejected",
      value: stats.rejected,
      icon: XCircle,
      gradient: "from-rose-500 to-pink-600",
      ring: "ring-rose-200/60",
    },
  ];

  const filterPills: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending_approval", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  const tableColumns: RequestTableColumn[] = [
    { key: "col_request", label: "Request", className: "py-3 pr-4 pl-1" },
    { key: "col_customer", label: "Customer", className: "py-3 pr-4" },
    { key: "col_product", label: "Product", className: "py-3 pr-4" },
    { key: "col_status", label: "Status", className: "py-3 pr-4" },
    { key: "col_approval", label: "Approval", className: "py-3 pr-4" },
    { key: "col_action", label: "Action", className: "py-3 pr-4 text-right" },
  ];

  const showHeaderWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}header`);
  const showStatsWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}stats`);
  const showPipelineHeaderWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}pipeline_header`);
  const showPipelineTableWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}pipeline_table`);
  const visibleStatCards = statCards.filter((card) => !hiddenWidgetKeys.includes(`${widgetPrefix}${card.key}`));
  const visibleTableColumns = tableColumns.filter((column) => !hiddenWidgetKeys.includes(`${widgetPrefix}${column.key}`));
  const showAnyWidget =
    showHeaderWidget || showStatsWidget || showPipelineHeaderWidget || showPipelineTableWidget;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/80 to-blue-50 p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-24 left-0 h-80 w-80 rounded-full bg-cyan-300/40 blur-3xl" />
        <div className="absolute top-20 right-0 h-96 w-96 rounded-full bg-blue-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-teal-300/30 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {widgetNotice ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {widgetNotice}
          </div>
        ) : null}

        {!showAnyWidget ? (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-5 text-sm font-semibold text-cyan-900">
            All widgets are currently hidden. Use `Restore Hidden Widgets` from the main dashboard to show them again.
          </div>
        ) : null}

        {/* Hero header */}
        {showHeaderWidget ? (
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-xl shadow-cyan-100/50 backdrop-blur-xl relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => hideWidget(`${widgetPrefix}header`)}
              className="absolute right-4 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white hover:bg-white/30"
              aria-label="Hide header widget"
            >
              <X className="h-4 w-4" />
            </button>
          </WidgetCloseGate>
          <div className="bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">Credit Module</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">Loan Requests</h1>
                  <p className="text-sm text-cyan-50/90 mt-1 max-w-xl">
                    Review, approve, or reject submitted loan applications in one place.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={reloadList}
                  disabled={loading || statsLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60 transition"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/loan")}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/loan/request")}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-cyan-700 shadow-lg shadow-cyan-900/20 hover:bg-cyan-50 transition"
                >
                  <Plus className="h-4 w-4" />
                  New Request
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {/* Stats */}
        {showStatsWidget ? (
          <div className="relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => hideWidget(`${widgetPrefix}stats`)}
                className="absolute right-2 -top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 shadow-sm hover:bg-cyan-50"
                aria-label="Hide stats widget"
              >
                <X className="h-4 w-4" />
              </button>
            </WidgetCloseGate>
            {visibleStatCards.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {visibleStatCards.map((card) => (
                  <div
                    key={card.key}
                    className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/40 ring-1 ${card.ring} backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl`}
                  >
                    <WidgetCloseGate>
                      <button
                        type="button"
                        onClick={() => hideWidget(`${widgetPrefix}${card.key}`)}
                        className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                        aria-label={`Hide ${card.label} widget`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </WidgetCloseGate>
                    <div className={`absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br ${card.gradient} opacity-15 blur-xl`} />
                    <div className="relative flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                        <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                          {statsLoading ? "—" : card.value}
                        </p>
                      </div>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-md`}>
                        <card.icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                All summary cards are hidden.
              </div>
            )}
          </div>
        ) : null}

        {/* List panel */}
        {(showPipelineHeaderWidget || showPipelineTableWidget) ? (
          <div className="rounded-3xl border border-white/80 bg-white/90 shadow-xl shadow-slate-200/30 backdrop-blur overflow-hidden">
            {showPipelineHeaderWidget ? (
              <div className="border-b border-cyan-100/80 bg-gradient-to-r from-white to-cyan-50/50 px-4 sm:px-6 py-4 space-y-4 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}pipeline_header`)}
                    className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                    aria-label="Hide request pipeline filters widget"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </WidgetCloseGate>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-cyan-700" />
                    <h2 className="text-base font-extrabold text-slate-900">Request pipeline</h2>
                  </div>
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-600/70" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search request, customer, product…"
                      className="w-full rounded-xl border border-cyan-100 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filterPills.map((pill) => {
                    const active = statusFilter === pill.key;
                    return (
                      <button
                        key={pill.key}
                        type="button"
                        onClick={() => {
                          setStatusFilter(pill.key);
                          setPage(1);
                        }}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                          active
                            ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-200/50"
                            : "border border-cyan-100 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50"
                        }`}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {showPipelineTableWidget ? (
              <div className="p-4 sm:p-6 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}pipeline_table`)}
                    className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                    aria-label="Hide request pipeline table widget"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </WidgetCloseGate>
                {error && !loading ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                    {error}
                  </div>
                ) : null}

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-cyan-50 to-slate-100" />
                    ))}
                  </div>
                ) : requests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100">
                      <ClipboardList className="h-8 w-8 text-cyan-700" />
                    </div>
                    <p className="mt-4 text-lg font-bold text-slate-900">No requests found</p>
                    <p className="mt-1 text-sm text-slate-600 max-w-sm">
                      {pagination.total === 0 && !debouncedSearch && statusFilter === "all"
                        ? "Start by creating a new loan request."
                        : "Try a different search or filter."}
                    </p>
                    {pagination.total === 0 && !debouncedSearch && statusFilter === "all" ? (
                      <button
                        type="button"
                        onClick={() => router.push("/dashboard/loan/request")}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-200/50 hover:from-cyan-700 hover:to-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                        Create first request
                      </button>
                    ) : null}
                  </div>
                ) : visibleTableColumns.length === 0 ? (
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                    All table columns are hidden.
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-cyan-900 border-b-2 border-cyan-100">
                          {visibleTableColumns.map((column) => (
                            <th key={column.key} className={column.className}>
                              <div className={`inline-flex items-center ${column.key === "col_action" ? "justify-end w-full" : ""} gap-2`}>
                                <span>{column.label}</span>
                                <WidgetCloseGate>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      hideWidget(`${widgetPrefix}${column.key}`);
                                    }}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                                    aria-label={`Hide ${column.label} column`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </WidgetCloseGate>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-50">
                        {requests.map((item) => (
                          <tr
                            key={item.id}
                            className="group hover:bg-gradient-to-r hover:from-cyan-50/80 hover:to-blue-50/40 transition-colors"
                          >
                            {visibleTableColumns.map((column) => {
                              if (column.key === "col_request") {
                                return (
                                  <td key={column.key} className="py-4 pr-4 pl-1">
                                    <p className="font-bold text-slate-900">{item.request_no}</p>
                                    <p className="text-[10px] font-medium text-cyan-700 mt-0.5">ID #{item.id}</p>
                                  </td>
                                );
                              }

                              if (column.key === "col_customer") {
                                return (
                                  <td key={column.key} className="py-4 pr-4">
                                    <div className="flex items-center gap-2">
                                      <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-100 to-blue-100 text-cyan-800">
                                        <UserRound className="h-4 w-4" />
                                      </div>
                                      <div>
                                        <p className="font-semibold text-slate-900">{item.customer_full_name || "—"}</p>
                                        {item.customer_no ? (
                                          <p className="text-xs font-mono text-cyan-800 mt-0.5">{item.customer_no}</p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                );
                              }

                              if (column.key === "col_product") {
                                return (
                                  <td key={column.key} className="py-4 pr-4">
                                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                                      {item.loan_product}
                                    </span>
                                  </td>
                                );
                              }

                              if (column.key === "col_status") {
                                return (
                                  <td key={column.key} className="py-4 pr-4">
                                    <StatusBadge status={item.status} />
                                  </td>
                                );
                              }

                              if (column.key === "col_approval") {
                                return (
                                  <td key={column.key} className="py-4 pr-4">
                                    <div className="flex items-center gap-2">
                                      <ShieldCheck className="h-4 w-4 text-cyan-600 shrink-0" />
                                      <span className="font-semibold text-slate-900 tabular-nums">
                                        {item.approval_level}
                                        <span className="text-slate-400 font-normal"> / </span>
                                        {item.required_approval_level}
                                      </span>
                                    </div>
                                  </td>
                                );
                              }

                              return (
                                <td key={column.key} className="py-4 pr-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => openReviewModal(item.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold shadow-sm transition ${
                                      item.status === "pending_approval"
                                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700 shadow-cyan-200/50"
                                        : "border border-cyan-200 bg-white text-cyan-800 hover:bg-cyan-50"
                                    }`}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    {item.status === "pending_approval" ? "Review" : "View"}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loading && requests.length > 0 ? (
                  <div className="mt-5 flex flex-col gap-3 border-t border-cyan-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">
                        Showing {pagination.from ?? 0}–{pagination.to ?? 0} of {pagination.total}
                      </span>
                      <label className="inline-flex items-center gap-2">
                        <span className="font-medium">Per page</span>
                        <select
                          value={perPage}
                          onChange={(e) => {
                            setPerPage(Number(e.target.value));
                            setPage(1);
                          }}
                          className="rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                        >
                          {PER_PAGE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-slate-600 mr-1">
                        Page {pagination.current_page} of {pagination.last_page}
                      </p>
                      <button
                        type="button"
                        disabled={pagination.current_page <= 1 || loading}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        className="inline-flex items-center gap-1 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={pagination.current_page >= pagination.last_page || loading}
                        onClick={() => setPage((prev) => Math.min(pagination.last_page, prev + 1))}
                        className="inline-flex items-center gap-1 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-4 sm:p-6">
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                  Request table widget is hidden.
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Review modal */}
        {reviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/55 backdrop-blur-md">
            <div className="w-full max-w-4xl max-h-[94vh] overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl shadow-cyan-900/20 flex flex-col">
              <div className="shrink-0 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100">Loan review</p>
                    <h2 className="text-lg sm:text-xl font-extrabold text-white mt-0.5">
                      {reviewLoan?.request_no || "Loading…"}
                    </h2>
                    {reviewLoan ? (
                      <div className="mt-2">
                        <StatusBadge status={reviewLoan.status} />
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={closeReviewModal}
                    className="rounded-xl border border-white/30 bg-white/10 p-2 text-white hover:bg-white/20 transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-gradient-to-b from-slate-50/50 to-white">
                {reviewLoading ? (
                  <div className="py-16 flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-200 border-t-cyan-600" />
                    <p className="text-sm font-medium text-slate-600">Loading request details…</p>
                  </div>
                ) : reviewLoan ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">Principal</p>
                        <p className="mt-1 text-xl font-extrabold text-slate-900">{formatAmount(reviewLoan.principal)}</p>
                      </div>
                      <div className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">Installment</p>
                        <p className="mt-1 text-xl font-extrabold text-slate-900">{formatAmount(reviewLoan.installment_amount)}</p>
                      </div>
                      <div className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">Total payable</p>
                        <p className="mt-1 text-xl font-extrabold text-slate-900">{formatAmount(reviewLoan.total_payable)}</p>
                      </div>
                    </div>

                    <section className="rounded-2xl border border-cyan-100 bg-white p-4 sm:p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-800">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900">Customer details</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <DetailRow label="Full name" value={reviewLoan.customer_full_name || "—"} />
                        <DetailRow label="Customer no" value={reviewLoan.customer_no || "—"} />
                        <DetailRow label="NIC" value={reviewLoan.customer_nic || "—"} />
                        <DetailRow label="Mobile" value={reviewLoan.customer_mobile || "—"} />
                        <DetailRow label="Income source" value={reviewLoan.customer_details?.incomeSource || "—"} />
                        <DetailRow label="Monthly income" value={formatAmount(reviewLoan.customer_details?.monthlyIncome)} />
                        <div className="md:col-span-2">
                          <DetailRow label="Address" value={reviewLoan.customer_address || "—"} />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-cyan-100 bg-white p-4 sm:p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-800">
                          <Banknote className="h-4 w-4" />
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900">Loan terms</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <DetailRow label="Product" value={reviewLoan.loan_product} />
                        <DetailRow label="Frequency" value={reviewLoan.installment_frequency} />
                        <DetailRow label="Annual rate" value={`${reviewLoan.annual_rate}%`} />
                        <DetailRow label="Tenure" value={`${reviewLoan.tenure_months} months`} />
                        <DetailRow label="Installments" value={reviewLoan.installments} />
                        <DetailRow label="Approval level" value={`${reviewLoan.approval_level} / ${reviewLoan.required_approval_level}`} />
                      </div>
                    </section>

                    {(reviewLoan.guarantor_details?.length ?? 0) > 0 && (
                      <section className="rounded-2xl border border-cyan-100 bg-white p-4 sm:p-5 shadow-sm">
                        <h3 className="text-sm font-extrabold text-slate-900 mb-3">
                          Guarantors ({reviewLoan.guarantor_details?.length})
                        </h3>
                        <div className="space-y-2">
                          {reviewLoan.guarantor_details?.map((g, idx) => (
                            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-900">
                              <span className="font-bold">{g.fullName || "—"}</span>
                              {g.relation ? <span className="text-cyan-800"> · {g.relation}</span> : null}
                              {g.mobile ? <span className="text-slate-600"> · {g.mobile}</span> : null}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <section className="rounded-2xl border border-cyan-100 bg-white p-4 sm:p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800">
                          <FileText className="h-4 w-4" />
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900">Documents</h3>
                      </div>
                      {reviewLoan.documents && reviewLoan.documents.length > 0 ? (
                        <div className="space-y-2">
                          {reviewLoan.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50/50 to-white px-3 py-2.5"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-cyan-700 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{doc.original_name}</p>
                                  <p className="text-xs text-cyan-800">{doc.document_type}</p>
                                </div>
                              </div>
                              <a
                                href={documentUrl(doc.file_path)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:from-cyan-700 hover:to-blue-700 shrink-0"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          No documents uploaded for this request.
                        </p>
                      )}
                    </section>

                    {reviewLoan.status === "pending_approval" && (
                      <section className="rounded-2xl border-2 border-dashed border-cyan-200 bg-cyan-50/30 p-4 sm:p-5 space-y-3">
                        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-cyan-700" />
                          Approval decision
                        </h3>
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Enter approval or rejection note (required for reject)"
                          rows={3}
                          className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                        />
                        <label className="flex items-start gap-3 rounded-xl border border-cyan-100 bg-white px-3 py-3 text-sm text-slate-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reviewConfirmed}
                            onChange={(e) => setReviewConfirmed(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                          />
                          I reviewed the full loan details and supporting documents.
                        </label>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleStatusAction(reviewLoan.id, "approve")}
                            disabled={actionLoadingId !== null || !reviewConfirmed}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-200/50 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {actionLoadingId === reviewLoan.id ? "Processing…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusAction(reviewLoan.id, "reject")}
                            disabled={actionLoadingId !== null || !reviewConfirmed}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-rose-200/50 hover:from-rose-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XCircle className="h-4 w-4" />
                            {actionLoadingId === reviewLoan.id ? "Processing…" : "Reject"}
                          </button>
                        </div>
                      </section>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Alert modal */}
        {alertModal.open && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
              <div
                className={`px-5 py-4 ${
                  alertModal.type === "success"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                    : alertModal.type === "warning"
                      ? "bg-gradient-to-r from-amber-400 to-orange-500"
                      : "bg-gradient-to-r from-rose-500 to-pink-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-white">{alertModal.title}</h3>
                  <button
                    type="button"
                    onClick={closeAlertModal}
                    className="rounded-lg border border-white/30 bg-white/10 p-1.5 text-white hover:bg-white/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-medium text-slate-900">{alertModal.message}</p>
              </div>
              <div className="px-5 pb-5 flex justify-end">
                <button
                  type="button"
                  onClick={closeAlertModal}
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-sm font-bold text-white hover:from-cyan-700 hover:to-blue-700"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
