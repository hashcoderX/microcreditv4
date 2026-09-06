"use client";

import axios from "axios";
import { getApiBaseUrl } from "@/lib/api";
import { WidgetCloseGate } from "@/lib/useWidgetsFixed";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Home,
  Landmark,
  RefreshCw,
  Search,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import CollectionReceiptBill, { type CollectionReceipt } from "./CollectionReceiptBill";

type CollectionType = "all" | "loan" | "finance" | "microfinance" | "mortgage";

type PaginationMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

type SearchStats = {
  total: number;
  loan: number;
  finance: number;
  microfinance: number;
  mortgage: number;
};

type AuthUser = {
  id?: number;
  name?: string;
  email?: string;
  designation?: { id?: number; name?: string | null } | null;
  roles?: Array<{ id?: number; name?: string }>;
};

const PER_PAGE_OPTIONS = [10, 15, 25, 50] as const;

type CollectibleAccount = {
  type: "loan" | "finance" | "microfinance" | "mortgage";
  source_id: number;
  reference: string;
  customer_name: string | null;
  customer_no: string | null;
  product: string;
  installment_amount: number;
  due_amount: number;
  paid_amount: number;
  due_date: string | null;
  next_payment_date?: string | null;
  balance: number;
  status: string;
  can_collect?: boolean;
  label: string;
};

const TYPE_FILTERS: { key: CollectionType; label: string; icon: typeof Wallet }[] = [
  { key: "all", label: "All products", icon: Sparkles },
  { key: "loan", label: "Instant loan", icon: Wallet },
  { key: "finance", label: "Finance", icon: Landmark },
  { key: "microfinance", label: "Micro credit", icon: HandCoins },
  { key: "mortgage", label: "Mortgage", icon: Home },
];

function typeStyles(type: CollectibleAccount["type"]) {
  switch (type) {
    case "loan":
      return {
        chip: "bg-cyan-100 text-cyan-900 border-cyan-200",
        gradient: "from-cyan-500 to-blue-600",
      };
    case "finance":
      return {
        chip: "bg-emerald-100 text-emerald-900 border-emerald-200",
        gradient: "from-emerald-500 to-teal-600",
      };
    case "microfinance":
      return {
        chip: "bg-blue-100 text-blue-900 border-blue-200",
        gradient: "from-blue-500 to-indigo-600",
      };
    case "mortgage":
      return {
        chip: "bg-violet-100 text-violet-900 border-violet-200",
        gradient: "from-violet-500 to-purple-600",
      };
    default:
      return {
        chip: "bg-slate-100 text-slate-800 border-slate-200",
        gradient: "from-slate-500 to-slate-700",
      };
  }
}

function statusLabel(status: string): string {
  const normalized = String(status || "").toLowerCase().trim();
  if (normalized === "closed") return "Complete";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAmount(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export default function OfficeCollectionsPage() {
  const apiBase = getApiBaseUrl();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actionCenterTotalCount, setActionCenterTotalCount] = useState(0);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterCustomerName, setFilterCustomerName] = useState("");
  const [filterCustomerNo, setFilterCustomerNo] = useState("");
  const [filterNic, setFilterNic] = useState("");
  const [filterRoute, setFilterRoute] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterCenter, setFilterCenter] = useState("");
  const [filterDueDay, setFilterDueDay] = useState("");
  const [filterNextPaymentDate, setFilterNextPaymentDate] = useState("");
  const [typeFilter, setTypeFilter] = useState<CollectionType>("all");
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
  const [stats, setStats] = useState<SearchStats>({
    total: 0,
    loan: 0,
    finance: 0,
    microfinance: 0,
    mortgage: 0,
  });
  const [accounts, setAccounts] = useState<CollectibleAccount[]>([]);
  const [selected, setSelected] = useState<CollectibleAccount | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState("");
  const [collectSuccess, setCollectSuccess] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentType, setPaymentType] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<CollectionReceipt | null>(null);
  const widgetPrefix = "office_collections_widget_";

  const fetchWidgetPreferences = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${apiBase}/dashboard/widgets`, {
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
  }, [apiBase]);

  const saveWidgetPreference = useCallback(async (widgetKey: string, isVisible: boolean) => {
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
  }, [apiBase, token]);

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

  const fetchNotificationPreview = useCallback(async (authToken: string) => {
    try {
      const response = await fetch(`${apiBase}/notifications/preview?limit=4`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) throw new Error("Failed to load notifications preview");
      const payload = await response.json();
      setActionCenterTotalCount(Number(payload?.action_center_total || 0));
    } catch {
      setActionCenterTotalCount(0);
    }
  }, [apiBase]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("auth_user");
    router.push("/");
  };

  const displayName = String(authUser?.name || authUser?.email || "User").trim();
  const roleName = String(authUser?.designation?.name || authUser?.roles?.[0]?.name || "Staff").trim();

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (!stored) {
      router.push("/");
      return;
    }
    setToken(stored);
    void fetchWidgetPreferences(stored);
    void fetchNotificationPreview(stored);

    const storedUser = localStorage.getItem("auth_user");
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setAuthUser(null);
      }
    }
  }, [router, fetchWidgetPreferences, fetchNotificationPreview]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const searchAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setCollectError("");
    try {
      const response = await axios.get(`${apiBase}/office-collections/search`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        params: {
          q: debouncedSearch.trim() || undefined,
          type: typeFilter,
          page,
          per_page: perPage,
        },
      });
      setAccounts(Array.isArray(response.data?.data) ? response.data.data : []);
      const meta = response.data?.meta;
      setPagination({
        current_page: Number(meta?.current_page ?? 1),
        last_page: Number(meta?.last_page ?? 1),
        per_page: Number(meta?.per_page ?? perPage),
        total: Number(meta?.total ?? 0),
        from: meta?.from != null ? Number(meta.from) : null,
        to: meta?.to != null ? Number(meta.to) : null,
      });
      const apiStats = response.data?.stats;
      setStats({
        total: Number(apiStats?.total ?? 0),
        loan: Number(apiStats?.loan ?? 0),
        finance: Number(apiStats?.finance ?? 0),
        microfinance: Number(apiStats?.microfinance ?? 0),
        mortgage: Number(apiStats?.mortgage ?? 0),
      });
    } catch {
      setAccounts([]);
      setPagination({ current_page: 1, last_page: 1, per_page: perPage, total: 0, from: null, to: null });
      setStats({ total: 0, loan: 0, finance: 0, microfinance: 0, mortgage: 0 });
      setCollectError("Unable to load collectible accounts.");
    } finally {
      setLoading(false);
    }
  }, [token, apiBase, debouncedSearch, typeFilter, page, perPage]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!token) return;
    searchAccounts();
  }, [token, searchAccounts]);

  const includesText = (source: unknown, needle: string) => {
    const text = String(source ?? "").toLowerCase().trim();
    const query = String(needle || "").toLowerCase().trim();
    if (!query) return true;
    return text.includes(query);
  };

  const normalizeDateKey = useCallback((value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return raw.includes("T") ? raw.split("T")[0] : raw.slice(0, 10);
  }, []);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const raw = account as CollectibleAccount & Record<string, unknown>;
      const routeObj = (raw.route as { name?: string } | undefined) || undefined;
      const groupObj = (raw.group as { name?: string } | undefined) || undefined;
      const centerObj = (raw.center as { name?: string } | undefined) || undefined;

      const customerName = account.customer_name || "";
      const customerNo = account.customer_no || String(raw.customer_code || "");
      const nic = String(raw.customer_nic || raw.nic || raw.national_id || raw.national_identity_card || "");
      const routeName = String(raw.route_name || routeObj?.name || "");
      const groupName = String(raw.group_name || groupObj?.name || "");
      const centerName = String(raw.center_name || centerObj?.name || "");
      const dueDate = normalizeDateKey(
        account.due_date ??
          (raw.due_date as string | null | undefined) ??
          (raw.dueDate as string | null | undefined) ??
          (raw.next_due_date as string | null | undefined) ??
          ""
      );
      const nextPaymentDate = normalizeDateKey(
        (raw.next_payment_date as string | null | undefined) ??
          (raw.nextPaymentDate as string | null | undefined) ??
          (raw.next_due_date as string | null | undefined) ??
          account.next_payment_date ??
          ""
      );
      const dueDayMatches = filterDueDay.trim() === "" || dueDate === normalizeDateKey(filterDueDay);

      return (
        includesText(customerName, filterCustomerName) &&
        includesText(customerNo, filterCustomerNo) &&
        includesText(nic, filterNic) &&
        includesText(routeName, filterRoute) &&
        includesText(groupName, filterGroup) &&
        includesText(centerName, filterCenter) &&
        dueDayMatches &&
        (filterNextPaymentDate.trim() === "" || nextPaymentDate === filterNextPaymentDate)
      );
    });
  }, [
    accounts,
    filterCenter,
    filterCustomerName,
    filterCustomerNo,
    filterDueDay,
    filterGroup,
    filterNextPaymentDate,
    filterNic,
    filterRoute,
    normalizeDateKey,
  ]);

  const hasAdvancedFilters = useMemo(
    () =>
      [
        filterCustomerName,
        filterCustomerNo,
        filterNic,
        filterRoute,
        filterGroup,
        filterCenter,
        filterDueDay,
        filterNextPaymentDate,
      ].some((value) => value.trim() !== ""),
    [
      filterCenter,
      filterCustomerName,
      filterCustomerNo,
      filterDueDay,
      filterGroup,
      filterNextPaymentDate,
      filterNic,
      filterRoute,
    ]
  );

  const openCollectModal = (account: CollectibleAccount) => {
    if (account.can_collect === false) {
      return;
    }
    setSelected(account);
    setPaymentAmount(String(account.due_amount || account.installment_amount || ""));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentType("cash");
    setPaymentReference("");
    setPaymentNote("");
    setChequeNo("");
    setChequeDate("");
    setChequeBank("");
    setCollectError("");
    setCollectSuccess("");
    setCollectOpen(true);
  };

  const closeCollectModal = () => {
    if (collecting) return;
    setCollectOpen(false);
    setSelected(null);
  };

  const submitCollection = async () => {
    if (!token || !selected) return;

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCollectError("Enter a valid collection amount.");
      return;
    }

    if (!paymentDate) {
      setCollectError("Payment date is required.");
      return;
    }

    const needsReference =
      paymentType !== "cash" &&
      (selected.type === "microfinance" ||
        selected.type === "loan" ||
        (selected.type === "finance" && paymentType !== "cash"));

    if (needsReference && !paymentReference.trim() && paymentType !== "cheque") {
      setCollectError("Payment reference is required for this payment type.");
      return;
    }

    if (selected.type === "finance" && paymentType === "cheque") {
      if (!chequeNo.trim() || !chequeDate || !chequeBank.trim()) {
        setCollectError("Cheque number, date, and bank are required.");
        return;
      }
    }

    setCollecting(true);
    setCollectError("");
    setCollectSuccess("");

    try {
      const payload: Record<string, unknown> = {
        type: selected.type,
        source_id: selected.source_id,
        amount,
        payment_date: paymentDate,
        payment_type: paymentType,
        payment_reference: paymentReference.trim() || null,
        note: paymentNote.trim() || null,
      };

      if (selected.type === "finance" && paymentType === "cheque") {
        payload.cheque_no = chequeNo.trim();
        payload.cheque_date = chequeDate;
        payload.cheque_bank = chequeBank.trim();
      }

      const response = await axios.post(`${apiBase}/office-collections/collect`, payload, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      const receipt = response.data?.receipt as CollectionReceipt | undefined;
      if (receipt?.bill_no) {
        setReceiptData(receipt);
        setReceiptOpen(true);
      }

      setCollectSuccess("Installment collected successfully.");
      setCollectOpen(false);
      setSelected(null);
      await searchAccounts();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setCollectError(
          (typeof err.response?.data?.message === "string" && err.response.data.message) ||
            "Collection failed. Please try again."
        );
      } else {
        setCollectError("Collection failed. Please try again.");
      }
    } finally {
      setCollecting(false);
    }
  };

  const showHeaderWidget = !hiddenWidgetKeys.has(`${widgetPrefix}header`);
  const summaryCards = [
    { key: "summary_results", label: "Results", value: stats.total },
    { key: "summary_loan", label: "Instant loan", value: stats.loan },
    { key: "summary_finance", label: "Finance", value: stats.finance },
    { key: "summary_micro", label: "Micro", value: stats.microfinance },
    { key: "summary_mortgage", label: "Mortgage", value: stats.mortgage },
  ];
  const visibleSummaryCards = summaryCards.filter(
    (card) => !hiddenWidgetKeys.has(`${widgetPrefix}${card.key}`)
  );
  const showFiltersWidget = !hiddenWidgetKeys.has(`${widgetPrefix}filters`);
  const showPaginationWidget = !hiddenWidgetKeys.has(`${widgetPrefix}pagination`);
  const tableColumns = [
    { key: "product", label: "Product", className: "py-3 pr-4 pl-1 whitespace-nowrap" },
    { key: "reference", label: "Reference", className: "py-3 pr-4 whitespace-nowrap" },
    { key: "customer", label: "Customer", className: "py-3 pr-4 whitespace-nowrap" },
    { key: "customer_no", label: "Customer no", className: "py-3 pr-4 whitespace-nowrap" },
    { key: "loan_product", label: "Loan product", className: "py-3 pr-4 whitespace-nowrap" },
    { key: "installment", label: "Installment", className: "py-3 pr-4 whitespace-nowrap text-right" },
    { key: "due_amount", label: "Due amount", className: "py-3 pr-4 whitespace-nowrap text-right" },
    { key: "paid_amount", label: "Paid amount", className: "py-3 pr-4 whitespace-nowrap text-right" },
    { key: "balance", label: "Balance", className: "py-3 pr-4 whitespace-nowrap text-right" },
    { key: "due_date", label: "Due date", className: "py-3 pr-4 whitespace-nowrap" },
    { key: "next_payment", label: "Next payment", className: "py-3 pr-4 whitespace-nowrap" },
    { key: "status", label: "Status", className: "py-3 pr-4 whitespace-nowrap" },
    { key: "action", label: "Action", className: "py-3 pr-4 text-right whitespace-nowrap" },
  ] as const;
  const visibleTableColumns = tableColumns.filter(
    (column) => !hiddenWidgetKeys.has(`${widgetPrefix}col_${column.key}`)
  );
  const isMainWidgetVisible =
    showHeaderWidget || showFiltersWidget || visibleSummaryCards.length > 0 || showPaginationWidget;

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/50 to-cyan-50 p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-20 left-0 h-80 w-80 rounded-full bg-indigo-300/40 blur-3xl" />
        <div className="absolute top-10 right-0 h-96 w-96 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
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
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
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
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {widgetNotice}
          </div>
        ) : null}

        {!isMainWidgetVisible ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm font-medium text-amber-800">
            All widgets on this page are hidden. Restore hidden widgets from dashboard.
          </div>
        ) : null}

        {showHeaderWidget ? (
        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-xl backdrop-blur-xl relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}header`)}
              className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/70 bg-white/85 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide header widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
                  <Building2 className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-100">Office operations</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">Collection Center</h1>
                  <p className="text-sm text-indigo-50/95 mt-1 max-w-2xl">
                    Collect installments for credit loans, finance, micro credit, and mortgages from one office desk.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={searchAccounts}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {visibleSummaryCards.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {visibleSummaryCards.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}${item.key}`)}
                    className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${item.label} widget`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">{loading ? "—" : item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {showFiltersWidget ? (
        <div className="rounded-3xl border border-white/80 bg-white/90 shadow-lg overflow-hidden relative">
          <WidgetCloseGate>
            <button
              type="button"
              onClick={() => void hideWidget(`${widgetPrefix}filters`)}
              className="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
              aria-label="Hide filters and table widget"
            >
              ×
            </button>
          </WidgetCloseGate>
          <div className="border-b border-slate-100 px-4 sm:px-6 py-4 space-y-4">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500/70" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer name, number, reference, product…"
                className="w-full rounded-xl border border-indigo-100 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <input
                value={filterCustomerName}
                onChange={(e) => setFilterCustomerName(e.target.value)}
                placeholder="Filter by customer name"
                className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <input
                value={filterCustomerNo}
                onChange={(e) => setFilterCustomerNo(e.target.value)}
                placeholder="Filter by customer no"
                className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <input
                value={filterNic}
                onChange={(e) => setFilterNic(e.target.value)}
                placeholder="Filter by NIC"
                className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <input
                value={filterRoute}
                onChange={(e) => setFilterRoute(e.target.value)}
                placeholder="Filter by route"
                className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <input
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                placeholder="Filter by group"
                className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <div className="flex gap-2">
                <input
                  value={filterCenter}
                  onChange={(e) => setFilterCenter(e.target.value)}
                  placeholder="Filter by center"
                  className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFilterCustomerName("");
                    setFilterCustomerNo("");
                    setFilterNic("");
                    setFilterRoute("");
                    setFilterGroup("");
                    setFilterCenter("");
                    setFilterDueDay("");
                    setFilterNextPaymentDate("");
                  }}
                  className="shrink-0 rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1">Due Day</label>
                <input
                  type="date"
                  value={filterDueDay}
                  onChange={(e) => setFilterDueDay(e.target.value)}
                  className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1">Next Payment Date</label>
                <input
                  type="date"
                  value={filterNextPaymentDate}
                  onChange={(e) => setFilterNextPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {TYPE_FILTERS.map((filter) => {
                const active = typeFilter === filter.key;
                const Icon = filter.icon;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => {
                      setTypeFilter(filter.key);
                      setPage(1);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                      active
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {collectSuccess ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {collectSuccess}
              </div>
            ) : null}

            {collectError && !collectOpen ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                {collectError}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-gradient-to-r from-slate-100 via-indigo-50 to-slate-100" />
                ))}
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="py-16 text-center">
                <Banknote className="mx-auto h-10 w-10 text-indigo-400" />
                <p className="mt-3 text-lg font-bold text-slate-900">No accounts to collect</p>
                <p className="mt-1 text-sm text-slate-600">
                  {hasAdvancedFilters
                    ? "No records match your selected filters."
                    : "Try another search term or product filter."}
                </p>
              </div>
            ) : visibleTableColumns.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                All table columns are hidden. Restore hidden widgets from dashboard.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-indigo-900 border-b-2 border-indigo-100">
                      {visibleTableColumns.map((column) => (
                        <th key={column.key} className={`${column.className} relative`}>
                          {column.label}
                          <WidgetCloseGate>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void hideWidget(`${widgetPrefix}col_${column.key}`);
                              }}
                              className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-indigo-300 bg-white text-[10px] font-bold text-indigo-700 hover:bg-rose-50 hover:text-rose-700"
                              aria-label={`Hide ${column.label} column`}
                            >
                              ×
                            </button>
                          </WidgetCloseGate>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAccounts.map((account) => {
                      const styles = typeStyles(account.type);
                      const canCollect = account.can_collect !== false;
                      return (
                        <tr
                          key={`${account.type}-${account.source_id}`}
                          className="hover:bg-indigo-50/50 transition-colors"
                        >
                          {visibleTableColumns.map((column) => {
                            if (column.key === "product") {
                              return (
                                <td key={column.key} className="py-3.5 pr-4 pl-1 whitespace-nowrap">
                                  <span
                                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${styles.chip}`}
                                  >
                                    {account.label}
                                  </span>
                                </td>
                              );
                            }
                            if (column.key === "reference") {
                              return (
                                <td key={column.key} className="py-3.5 pr-4 font-mono text-xs font-bold text-slate-800 whitespace-nowrap">
                                  {account.reference}
                                </td>
                              );
                            }
                            if (column.key === "customer") {
                              return (
                                <td key={column.key} className="py-3.5 pr-4 font-semibold text-slate-900 whitespace-nowrap">
                                  {account.customer_name || "—"}
                                </td>
                              );
                            }
                            if (column.key === "customer_no") {
                              return (
                                <td key={column.key} className="py-3.5 pr-4 font-mono text-xs text-indigo-900 whitespace-nowrap">
                                  {account.customer_no || "—"}
                                </td>
                              );
                            }
                            if (column.key === "loan_product") {
                              return (
                                <td key={column.key} className="py-3.5 pr-4 text-slate-800 max-w-[160px] truncate" title={account.product}>
                                  {account.product}
                                </td>
                              );
                            }
                            if (column.key === "installment") {
                              return <td key={column.key} className="py-3.5 pr-4 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatAmount(account.installment_amount)}</td>;
                            }
                            if (column.key === "due_amount") {
                              return <td key={column.key} className="py-3.5 pr-4 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatAmount(account.due_amount)}</td>;
                            }
                            if (column.key === "paid_amount") {
                              return <td key={column.key} className="py-3.5 pr-4 text-right font-semibold text-emerald-800 tabular-nums whitespace-nowrap">{formatAmount(account.paid_amount)}</td>;
                            }
                            if (column.key === "balance") {
                              return <td key={column.key} className="py-3.5 pr-4 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{formatAmount(account.balance)}</td>;
                            }
                            if (column.key === "due_date") {
                              return <td key={column.key} className="py-3.5 pr-4 text-slate-800 whitespace-nowrap">{formatDate(account.due_date)}</td>;
                            }
                            if (column.key === "next_payment") {
                              return <td key={column.key} className="py-3.5 pr-4 text-slate-800 whitespace-nowrap">{formatDate(account.next_payment_date || null)}</td>;
                            }
                            if (column.key === "status") {
                              return (
                                <td key={column.key} className="py-3.5 pr-4 whitespace-nowrap">
                                    <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${canCollect ? "bg-slate-100 text-slate-800" : "bg-emerald-100 text-emerald-800"}`}>
                                    {canCollect ? statusLabel(account.status) : "Complete"}
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td key={column.key} className="py-3.5 pr-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                    disabled={!canCollect}
                                  onClick={() => openCollectModal(account)}
                                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-sm ${
                                      canCollect
                                        ? `bg-gradient-to-r ${styles.gradient} text-white hover:opacity-95`
                                        : "bg-slate-200 text-slate-500 cursor-not-allowed"
                                    }`}
                                >
                                  <HandCoins className="h-3.5 w-3.5" />
                                    {canCollect ? "Collect" : "Completed"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && filteredAccounts.length > 0 && showPaginationWidget ? (
              <div className="mt-5 flex flex-col gap-3 border-t border-indigo-100 pt-4 sm:flex-row sm:items-center sm:justify-between relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}pagination`)}
                    className="absolute -right-1 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Hide pagination widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">
                    Showing {hasAdvancedFilters ? filteredAccounts.length : `${pagination.from ?? 0}–${pagination.to ?? 0}`} of {hasAdvancedFilters ? filteredAccounts.length : pagination.total}
                  </span>
                  <label className="inline-flex items-center gap-2">
                    <span className="font-medium">Per page</span>
                    <select
                      value={perPage}
                      onChange={(e) => {
                        setPerPage(Number(e.target.value));
                        setPage(1);
                      }}
                      className="rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
                    className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={pagination.current_page >= pagination.last_page || loading}
                    onClick={() => setPage((prev) => Math.min(pagination.last_page, prev + 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        ) : null}
      </div>

      <CollectionReceiptBill
        open={receiptOpen}
        receipt={receiptData}
        onClose={() => {
          setReceiptOpen(false);
          setReceiptData(null);
        }}
      />

      {collectOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/55 backdrop-blur-md">
          <div className="w-full max-w-lg max-h-[94vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className={`bg-gradient-to-r ${typeStyles(selected.type).gradient} px-5 py-4 rounded-t-3xl`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">Collect payment</p>
                  <h2 className="text-lg font-extrabold text-white">{selected.label}</h2>
                  <p className="text-sm text-white/90 mt-0.5">{selected.customer_name} · {selected.reference}</p>
                </div>
                <button
                  type="button"
                  onClick={closeCollectModal}
                  className="rounded-lg border border-white/30 bg-white/10 p-2 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Due amount</p>
                  <p className="font-extrabold text-slate-900">{formatAmount(selected.due_amount)}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Balance</p>
                  <p className="font-extrabold text-slate-900">{formatAmount(selected.balance)}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment date *</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount (LKR) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment type</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  {selected.type === "microfinance" ? (
                    <option value="check">Cheque</option>
                  ) : (
                    <option value="cheque">Cheque</option>
                  )}
                  {selected.type === "finance" ? <option value="card">Card</option> : null}
                  {selected.type === "finance" ? <option value="online">Online</option> : null}
                </select>
              </div>

              {paymentType !== "cash" ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reference *</label>
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    placeholder="Transaction / cheque reference"
                  />
                </div>
              ) : null}

              {selected.type === "finance" && paymentType === "cheque" ? (
                <div className="grid grid-cols-1 gap-2">
                  <input
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    placeholder="Cheque no *"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={chequeBank}
                    onChange={(e) => setChequeBank(e.target.value)}
                    placeholder="Cheque bank *"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Note</label>
                <textarea
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  placeholder="Optional collection note"
                />
              </div>

              {collectError ? (
                <p className="text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {collectError}
                </p>
              ) : null}

              <button
                type="button"
                onClick={submitCollection}
                disabled={collecting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                <HandCoins className="h-4 w-4" />
                {collecting ? "Processing…" : "Post collection"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
