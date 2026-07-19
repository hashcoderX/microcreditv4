"use client";

import axios from "axios";
import { getApiBaseUrl } from "@/lib/api";
import { WidgetCloseGate } from "@/lib/useWidgetsFixed";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileCheck2,
  Info,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

type LoanProduct = {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  interestRate?: number;
};

type PersistedLoanProduct = {
  id: number;
  name: string;
  interest_rate?: number | string;
  description?: string;
  icon?: string;
  is_active?: boolean;
};

type CustomerDetails = {
  customerNo: string;
  fullName: string;
  nic: string;
  mobile: string;
  address: string;
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  businessName: string;
  monthlyIncome: string;
  additionalIncome: string;
  incomeSource: string;
};

type GuarantorDetails = {
  fullName: string;
  nic: string;
  mobile: string;
  relation: string;
  address: string;
  monthlyIncome: string;
};

type ConfirmationModalState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  action:
    | {
        type: "delete-loan-product";
        productKey: string;
      }
    | null;
};

const PRODUCT_COLORS = [
  "from-cyan-500 to-blue-500",
  "from-teal-500 to-cyan-500",
  "from-emerald-500 to-cyan-500",
  "from-indigo-500 to-blue-500",
  "from-orange-500 to-amber-500",
  "from-violet-500 to-fuchsia-500",
];

const PRODUCT_ICONS = ["\ud83c\udfe2", "\ud83e\uddd1", "\ud83d\udecd", "\ud83d\ude9c", "\ud83c\udfe0", "\ud83d\ude97", "\ud83c\udf93", "\ud83d\udcb3", "\ud83d\udedf"];

function FieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-700 mb-1.5">
      {children}
      {optional ? <span className="font-normal text-slate-500"> (optional)</span> : null}
    </label>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-white shadow-sm ${className}`}>{children}</div>;
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

function Separator({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-slate-200 ${className}`}></div>;
}

function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${safeValue}%` }}></div>
    </div>
  );
}

function AlertBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{children}</div>;
}

function AvatarChip({ label }: { label: string }) {
  const display = label.trim();
  const initials = display
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "NA";

  return (
    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-xs font-bold text-cyan-800">
      {initials}
    </div>
  );
}

function TooltipText({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white group-hover:block">
        {text}
      </span>
    </span>
  );
}

function SkeletonBox({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`}></div>;
}

const fieldClass =
  "w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-100";

const readOnlyFieldClass =
  "w-full rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-sm text-slate-800";

function codeSegment(value: string, maxLen = 4): string {
  const trimmed = value.trim();
  if (!trimmed) return "GEN";

  const fromWords = trimmed
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();

  if (fromWords.length >= 2) return fromWords.slice(0, maxLen);

  const compact = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (compact || "GEN").slice(0, maxLen);
}

function formatCustomerNumberTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  );
}

function buildCustomerNumber(branchName: string, loanProductKey: string, loanProductName: string): string {
  const branchCode = codeSegment(branchName, 4);
  const loanCode = codeSegment(loanProductKey.replace(/_/g, " ") || loanProductName, 4);
  const timestamp = formatCustomerNumberTimestamp(new Date());
  return `${branchCode}-${loanCode}-${timestamp}`;
}

export default function NewLoanRequestPage() {
  const apiBase = getApiBaseUrl();
  const widgetPrefix = "loan_create_widget_";
  const [token, setToken] = useState("");
  const router = useRouter();
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [loanProduct, setLoanProduct] = useState<string>("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductInterestRate, setNewProductInterestRate] = useState("18");
  const [newProductDescription, setNewProductDescription] = useState("");
  const [newProductIcon, setNewProductIcon] = useState(PRODUCT_ICONS[0]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [loanProductsLoading, setLoanProductsLoading] = useState(false);
  const [loanProductsError, setLoanProductsError] = useState("");
  const [addProductLoading, setAddProductLoading] = useState(false);
  const [addProductError, setAddProductError] = useState("");
  const [editingProductKey, setEditingProductKey] = useState<string | null>(null);
  const [deletingProductKey, setDeletingProductKey] = useState<string | null>(null);
  const [manageProductError, setManageProductError] = useState("");
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    tone: "primary",
    action: null,
  });
  const [principal, setPrincipal] = useState("1000000");
  const [annualRate, setAnnualRate] = useState("18");
  const [interestRateType, setInterestRateType] = useState<"fixed" | "reducing">("fixed");
  const [tenureMonths, setTenureMonths] = useState("36");
  const [frequency, setFrequency] = useState<"monthly" | "weekly">("monthly");
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails>({
    customerNo: "",
    fullName: "",
    nic: "",
    mobile: "",
    address: "",
    bankName: "",
    bankBranch: "",
    bankAccountNo: "",
    businessName: "",
    monthlyIncome: "",
    additionalIncome: "",
    incomeSource: "",
  });
  const [guarantors, setGuarantors] = useState<GuarantorDetails[]>([
    {
      fullName: "",
      nic: "",
      mobile: "",
      relation: "",
      address: "",
      monthlyIncome: "",
    },
  ]);
  const [activeStep, setActiveStep] = useState(1);
  const [stepNotice, setStepNotice] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [documents, setDocuments] = useState<File[]>([]);
  const [branchName, setBranchName] = useState("");
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<string[]>([]);
  const [widgetNotice, setWidgetNotice] = useState("");

  const generateCustomerNumber = useCallback(() => {
    const product = loanProducts.find((item) => item.key === loanProduct);
    return buildCustomerNumber(
      branchName,
      product?.key || loanProduct || "loan",
      product?.name || "Loan"
    );
  }, [branchName, loanProduct, loanProducts]);

  const applyGeneratedCustomerNumber = useCallback(() => {
    setCustomerDetails((prev) => ({
      ...prev,
      customerNo: generateCustomerNumber(),
    }));
  }, [generateCustomerNumber]);

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

  const mapPersistedProduct = useCallback((item: PersistedLoanProduct, index: number): LoanProduct | null => {
    const productName = String(item.name || "").trim();
    if (!productName) return null;

    const numericRate = Number(item.interest_rate ?? 0);
    const interestRate = Number.isFinite(numericRate) ? Number(numericRate.toFixed(4)) : 0;
    const fallbackDescription = `${interestRate}% annual interest`;

    return {
      key: `loan_product_${item.id}`,
      name: productName,
      description: String(item.description || fallbackDescription),
      icon: String(item.icon || PRODUCT_ICONS[index % PRODUCT_ICONS.length]),
      color: PRODUCT_COLORS[index % PRODUCT_COLORS.length],
      interestRate,
    };
  }, []);

  const getPersistedProductId = useCallback((key: string): number | null => {
    if (!key.startsWith("loan_product_")) return null;

    const numericId = Number(key.replace("loan_product_", ""));
    if (!Number.isInteger(numericId) || numericId <= 0) return null;

    return numericId;
  }, []);

  const resetProductForm = useCallback(() => {
    setNewProductName("");
    setNewProductInterestRate("18");
    setNewProductDescription("");
    setNewProductIcon(PRODUCT_ICONS[0]);
    setEditingProductKey(null);
    setAddProductError("");
  }, []);

  const loadLoanProductsFromDatabase = useCallback(
    async (authToken: string) => {
      setLoanProductsLoading(true);
      setLoanProductsError("");

      try {
        const response = await axios.get(`${apiBase}/loan-products`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            Accept: "application/json",
          },
        });

        const rows: PersistedLoanProduct[] = Array.isArray(response.data) ? response.data : [];
        const dbProducts = rows
          .filter((item) => item && typeof item === "object" && item.is_active !== false)
          .map((item, index) => mapPersistedProduct(item, index))
          .filter((item): item is LoanProduct => item !== null);

        setLoanProducts(dbProducts);
        setLoanProduct((prev) => {
          if (dbProducts.some((item) => item.key === prev)) {
            return prev;
          }
          return dbProducts[0]?.key || "";
        });
      } catch {
        setLoanProductsError("Failed to load loan products from database.");
      } finally {
        setLoanProductsLoading(false);
      }
    },
    [apiBase, mapPersistedProduct]
  );

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      router.push("/");
    } else {
      setToken(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const readBranchFromUser = (user: unknown) => {
      if (!user || typeof user !== "object") return "";
      const record = user as {
        branch?: { name?: string };
        employee?: { branch?: { name?: string } };
      };
      return String(record.branch?.name || record.employee?.branch?.name || "").trim();
    };

    const cached = localStorage.getItem("auth_user");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const name = readBranchFromUser(parsed);
        if (name) setBranchName(name);
      } catch {
        // ignore invalid cache
      }
    }

    const loadUser = async () => {
      try {
        const response = await axios.get(`${apiBase}/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const name = readBranchFromUser(response.data);
        if (name) setBranchName(name);
        localStorage.setItem("auth_user", JSON.stringify(response.data || null));
      } catch {
        // keep cached branch name when API fails
      }
    };

    loadUser();
  }, [token, apiBase]);

  useEffect(() => {
    if (!token) return;
    fetchWidgetPreferences(token);
  }, [token, fetchWidgetPreferences]);

  useEffect(() => {
    if (!token) return;
    loadLoanProductsFromDatabase(token);
  }, [token, loadLoanProductsFromDatabase]);

  useEffect(() => {
    if (activeStep !== 2) return;
    applyGeneratedCustomerNumber();
  }, [activeStep, loanProduct, branchName, applyGeneratedCustomerNumber]);

  const selectedProduct = useMemo(
    () => loanProducts.find((item) => item.key === loanProduct) || null,
    [loanProducts, loanProduct]
  );

  useEffect(() => {
    if (!selectedProduct) return;
    if (typeof selectedProduct.interestRate !== "number") return;
    if (!Number.isFinite(selectedProduct.interestRate)) return;

    setAnnualRate(String(selectedProduct.interestRate));
  }, [selectedProduct]);

  const steps = useMemo(
    () => [
      { id: 1, title: "Loan Product", hint: "Select the loan product for this application" },
      { id: 2, title: "Customer Details", hint: "Capture primary applicant details" },
      { id: 3, title: "Guarantor Details", hint: "Capture one or more guarantors" },
      { id: 4, title: "Loan Terms", hint: "Amount, rate, tenure, and frequency" },
      { id: 5, title: "Review", hint: "Final confirmation before submission" },
      { id: 6, title: "Document Upload", hint: "Upload supporting documents" },
    ],
    []
  );
  const progressPercent = (activeStep / steps.length) * 100;

  const addLoanProduct = async () => {
    if (!token) {
      setAddProductError("Authentication is required to create a loan product.");
      return;
    }

    const name = newProductName.trim();
    const description = newProductDescription.trim() || "Custom loan product.";
    const parsedInterestRate = Number(newProductInterestRate);
    if (!name) return;
    if (!Number.isFinite(parsedInterestRate) || parsedInterestRate < 0) {
      setAddProductError("Interest rate must be a valid number (0 or higher).");
      return;
    }

    const editingId = editingProductKey ? getPersistedProductId(editingProductKey) : null;
    if (editingProductKey && editingId === null) {
      setAddProductError("Selected product cannot be edited.");
      return;
    }

    setAddProductLoading(true);
    setAddProductError("");
    setManageProductError("");

    try {
      const payload = {
        name,
        interest_rate: Number(parsedInterestRate.toFixed(4)),
        description,
        icon: newProductIcon,
        is_active: true,
      };

      const response = await axios({
        method: editingId ? "put" : "post",
        url: editingId ? `${apiBase}/loan-products/${editingId}` : `${apiBase}/loan-products`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        data: payload,
      });

      const saved = response.data as PersistedLoanProduct;
      const savedRate = Number(saved.interest_rate ?? parsedInterestRate);
      const nextProduct: LoanProduct = {
        key: `loan_product_${saved.id}`,
        name: String(saved.name || name),
        description: String(saved.description || description),
        icon: String(saved.icon || newProductIcon),
        color: PRODUCT_COLORS[loanProducts.length % PRODUCT_COLORS.length],
        interestRate: Number.isFinite(savedRate) ? Number(savedRate.toFixed(4)) : Number(parsedInterestRate.toFixed(4)),
      };

      setLoanProducts((prev) => {
        if (editingProductKey) {
          return prev.map((item) => (item.key === editingProductKey ? nextProduct : item));
        }

        const existingByName = new Set(prev.map((item) => item.name.trim().toLowerCase()));
        if (existingByName.has(nextProduct.name.trim().toLowerCase())) {
          return prev;
        }
        return [...prev, nextProduct];
      });

      setLoanProduct(nextProduct.key);
      setNewProductName("");
      setNewProductInterestRate("18");
      setNewProductDescription("");
      setNewProductIcon(PRODUCT_ICONS[(loanProducts.length + 1) % PRODUCT_ICONS.length]);
      setShowAddProduct(false);
      setEditingProductKey(null);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data?.message === "string" && error.response.data.message) ||
          "Failed to save loan product in database.";
        setAddProductError(message);
      } else {
        setAddProductError("Failed to save loan product in database.");
      }
    } finally {
      setAddProductLoading(false);
    }
  };

  const handleEditLoanProduct = (product: LoanProduct) => {
    const productId = getPersistedProductId(product.key);
    if (!productId) {
      setManageProductError("Only saved custom products can be edited.");
      return;
    }

    setManageProductError("");
    setShowAddProduct(true);
    setEditingProductKey(product.key);
    setNewProductName(product.name);
    setNewProductInterestRate(String(product.interestRate ?? 0));
    setNewProductDescription(product.description);
    setNewProductIcon(product.icon || PRODUCT_ICONS[0]);
  };

  const performDeleteLoanProduct = async (product: LoanProduct) => {
    if (!token) {
      setManageProductError("Authentication is required to delete a loan product.");
      return;
    }

    const productId = getPersistedProductId(product.key);
    if (!productId) {
      setManageProductError("Only saved custom products can be deleted.");
      return;
    }

    setDeletingProductKey(product.key);
    setManageProductError("");

    try {
      await axios.delete(`${apiBase}/loan-products/${productId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const nextProducts = loanProducts.filter((item) => item.key !== product.key);
      setLoanProducts(nextProducts);

      if (loanProduct === product.key) {
        setLoanProduct(nextProducts[0]?.key || "");
      }

      if (editingProductKey === product.key) {
        resetProductForm();
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data?.message === "string" && error.response.data.message) ||
          "Failed to delete loan product.";
        setManageProductError(message);
      } else {
        setManageProductError("Failed to delete loan product.");
      }
    } finally {
      setDeletingProductKey(null);
    }
  };

  const openDeleteLoanProductConfirmation = (product: LoanProduct) => {
    setConfirmationModal({
      open: true,
      title: "Delete loan product",
      message: `Are you sure you want to delete \"${product.name}\"? This action cannot be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
      action: {
        type: "delete-loan-product",
        productKey: product.key,
      },
    });
  };

  const closeConfirmationModal = () => {
    setConfirmationModal((prev) => ({
      ...prev,
      open: false,
      action: null,
    }));
  };

  const handleConfirmationAction = async () => {
    if (!confirmationModal.action) {
      closeConfirmationModal();
      return;
    }

    if (confirmationModal.action.type === "delete-loan-product") {
      const target = loanProducts.find((item) => item.key === confirmationModal.action?.productKey);
      closeConfirmationModal();
      if (target) {
        await performDeleteLoanProduct(target);
      }
      return;
    }

    closeConfirmationModal();
  };

  const calculation = useMemo(() => {
    const principalAmount = Number(principal);
    const rate = Number(annualRate);
    const months = Number(tenureMonths);

    if (!Number.isFinite(principalAmount) || principalAmount <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(months) || months <= 0) {
      return {
        installments: 0,
        installmentAmount: 0,
        totalPayable: 0,
      };
    }

    const installmentsPerYear = frequency === "weekly" ? 52 : 12;
    const years = months / 12;
    const installments = Math.max(1, Math.round(years * installmentsPerYear));
    const totalInterest = principalAmount * (rate / 100) * years;
    const totalPayable = principalAmount + totalInterest;
    const installmentAmount = totalPayable / installments;

    return {
      installments,
      installmentAmount,
      totalPayable,
    };
  }, [principal, annualRate, tenureMonths, frequency]);

  const formatAmount = (value: number): string => {
    if (!Number.isFinite(value)) return "-";
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const updateGuarantor = (index: number, field: keyof GuarantorDetails, value: string) => {
    setGuarantors((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  const addGuarantor = () => {
    setGuarantors((prev) => [
      ...prev,
      {
        fullName: "",
        nic: "",
        mobile: "",
        relation: "",
        address: "",
        monthlyIncome: "",
      },
    ]);
  };

  const removeGuarantor = (index: number) => {
    setGuarantors((prev) => (prev.length <= 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)));
  };

  const handleDocumentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;

    setDocuments((prev) => {
      const existingKey = new Set(prev.map((file) => `${file.name}_${file.size}_${file.lastModified}`));
      const appendable = selected.filter(
        (file) => !existingKey.has(`${file.name}_${file.size}_${file.lastModified}`)
      );
      return [...prev, ...appendable];
    });

    event.target.value = "";
  };

  const removeDocument = (index: number) => {
    setDocuments((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const customerInfoComplete =
    customerDetails.customerNo.trim() &&
    customerDetails.fullName.trim() &&
    customerDetails.nic.trim() &&
    customerDetails.mobile.trim() &&
    customerDetails.address.trim() &&
    customerDetails.bankName.trim() &&
    customerDetails.bankBranch.trim() &&
    customerDetails.bankAccountNo.trim() &&
    customerDetails.monthlyIncome.trim() &&
    customerDetails.incomeSource.trim();

  const guarantorHasAnyData = guarantors.some(
    (item) =>
      item.fullName.trim() ||
      item.nic.trim() ||
      item.mobile.trim() ||
      item.relation.trim() ||
      item.address.trim() ||
      item.monthlyIncome.trim()
  );

  const guarantorInfoComplete =
    !guarantorHasAnyData ||
    guarantors.every(
      (item) =>
        !(
          item.fullName.trim() ||
          item.nic.trim() ||
          item.mobile.trim() ||
          item.relation.trim() ||
          item.address.trim() ||
          item.monthlyIncome.trim()
        ) ||
        (item.fullName.trim() && item.nic.trim() && item.mobile.trim() && item.relation.trim() && item.address.trim())
    );

  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!selectedProduct) return "Please select a loan product.";
      return null;
    }

    if (step === 2) {
      if (!customerDetails.customerNo.trim()) return "Customer Number is required.";
      if (!customerDetails.fullName.trim()) return "Customer Full Name is required.";
      if (!customerDetails.nic.trim()) return "Customer NIC / Passport is required.";
      if (!customerDetails.mobile.trim()) return "Customer Mobile Number is required.";
      if (!customerDetails.address.trim()) return "Customer Address is required.";
      if (!customerDetails.bankName.trim()) return "Bank Name is required.";
      if (!customerDetails.bankBranch.trim()) return "Bank Branch is required.";
      if (!customerDetails.bankAccountNo.trim()) return "Bank Account No is required.";
      const monthlyIncome = Number(customerDetails.monthlyIncome);
      if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return "Customer monthly income is required.";
      if (!customerDetails.incomeSource.trim()) return "Primary income source is required.";
      return null;
    }

    if (step === 3) {
      if (!guarantorInfoComplete) return "Guarantor is optional, but if entered please complete required guarantor fields.";
      return null;
    }

    if (step === 4) {
      const principalAmount = Number(principal);
      const rate = Number(annualRate);
      const months = Number(tenureMonths);
      if (!Number.isFinite(principalAmount) || principalAmount <= 0) return "Enter a valid principal amount.";
      if (!Number.isFinite(rate) || rate < 0) return "Enter a valid yearly interest rate.";
      if (!["fixed", "reducing"].includes(interestRateType)) return "Select an interest rate type.";
      if (!Number.isFinite(months) || months <= 0) return "Enter a valid tenure in months.";
      return null;
    }

    if (step === 6) {
      if (documents.length === 0) return "Please upload at least one supporting document.";
      return null;
    }

    return null;
  };

  const handleNextStep = () => {
    const error = validateStep(activeStep);
    if (error) {
      setStepNotice(error);
      return;
    }

    setStepNotice("");
    setActiveStep((prev) => Math.min(prev + 1, steps.length));
  };

  const handleStepClick = (stepId: number) => {
    if (stepId <= activeStep) {
      setActiveStep(stepId);
      setStepNotice("");
      return;
    }

    const error = validateStep(activeStep);
    if (error) {
      setStepNotice(error);
      return;
    }

    setStepNotice("");
    setActiveStep(stepId);
  };

  const handleSubmitLoanRequest = async () => {
    const step1Error = validateStep(1);
    const step2Error = validateStep(2);
    const step3Error = validateStep(3);
    const step4Error = validateStep(4);
    const step6Error = validateStep(6);

    if (step1Error) {
      setActiveStep(1);
      setStepNotice(step1Error);
      return;
    }

    if (step2Error) {
      setActiveStep(2);
      setStepNotice(step2Error);
      return;
    }

    if (step3Error) {
      setActiveStep(3);
      setStepNotice(step3Error);
      return;
    }

    if (step4Error) {
      setActiveStep(4);
      setStepNotice(step4Error);
      return;
    }

    if (step6Error) {
      setActiveStep(6);
      setStepNotice(step6Error);
      return;
    }

    const nonEmptyGuarantors = guarantors.filter(
      (item) =>
        item.fullName.trim() ||
        item.nic.trim() ||
        item.mobile.trim() ||
        item.relation.trim() ||
        item.address.trim() ||
        item.monthlyIncome.trim()
    );

    setSubmitLoading(true);
    setSubmitError("");
    setSubmitMessage("");

    try {
      const payload = new FormData();
      payload.append("loan_product", selectedProduct?.name || loanProduct);
      payload.append("principal", String(Number(principal)));
      payload.append("annual_rate", String(Number(annualRate)));
      payload.append("interest_rate_type", interestRateType);
      payload.append("tenure_months", String(Number(tenureMonths)));
      payload.append("installment_frequency", frequency);
      payload.append("installments", String(calculation.installments));
      payload.append("installment_amount", String(Number(calculation.installmentAmount.toFixed(2))));
      payload.append("total_payable", String(Number(calculation.totalPayable.toFixed(2))));
      payload.append("customer_details", JSON.stringify(customerDetails));
      payload.append("guarantor_details", JSON.stringify(nonEmptyGuarantors.length ? nonEmptyGuarantors : []));
      payload.append("required_approval_level", "2");

      documents.forEach((document) => {
        payload.append("documents[]", document);
      });

      const response = await axios.post(`/api/loan-requests`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const requestNo = response.data?.data?.request_no;
      const portalCredentials = response.data?.customer_portal_credentials || null;
      let message = requestNo
        ? `Loan request submitted successfully (${requestNo}).`
        : "Loan request submitted successfully.";
      if (portalCredentials?.is_new_account && portalCredentials?.email && portalCredentials?.password) {
        message += ` Customer portal account created. Email: ${portalCredentials.email} | Temporary Password: ${portalCredentials.password}`;
      } else if (portalCredentials?.email) {
        message += ` Customer portal account linked. Email: ${portalCredentials.email}`;
      }
      setSubmitMessage(message);
      setIsSubmitted(true);
      setDocuments([]);
      setStepNotice("");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          (typeof error.response?.data?.message === "string" && error.response.data.message) ||
          "Failed to submit loan request. Please try again.";
        setSubmitError(message);
      } else {
        setSubmitError("Failed to submit loan request. Please try again.");
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const showHeaderWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}header`);
  const showStepNavigatorWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}step_navigator`);
  const showStepContentWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}step_content`);
  const showActionBarWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}action_bar`);
  const showPreviewWidget = !hiddenWidgetKeys.includes(`${widgetPrefix}preview`);
  const activeStepWidgetKey = `${widgetPrefix}step_content_${activeStep}`;
  const isActiveStepWidgetVisible = !hiddenWidgetKeys.includes(activeStepWidgetKey);
  const showAnyWidget =
    showHeaderWidget || showStepNavigatorWidget || showStepContentWidget || showActionBarWidget || showPreviewWidget;
  const isConfirmationBusy =
    confirmationModal.action?.type === "delete-loan-product" &&
    deletingProductKey === confirmationModal.action.productKey;

  const totalInterest = useMemo(() => {
    const principalAmount = Number(principal);
    const totalPayable = Number(calculation.totalPayable);
    if (!Number.isFinite(principalAmount) || !Number.isFinite(totalPayable)) return 0;
    return Number(Math.max(totalPayable - principalAmount, 0).toFixed(2));
  }, [principal, calculation.totalPayable]);

  const progressStep = useMemo(() => {
    if (isSubmitted) return 5;
    if (activeStep >= 6) return 3;
    if (activeStep >= 5) return 4;
    if (activeStep >= 4) return 2;
    return 1;
  }, [activeStep, isSubmitted]);

  const progressPercentDashboard = ((progressStep - 1) / 4) * 100;

  const handleContinueApplication = () => {
    if (isSubmitted) return;
    if (activeStep < steps.length) {
      handleNextStep();
      return;
    }
    void handleSubmitLoanRequest();
  };

  const handleSaveDraft = () => {
    const payload = {
      activeStep,
      loanProduct,
      principal,
      annualRate,
      interestRateType,
      tenureMonths,
      frequency,
      customerDetails,
      guarantors,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem("loan_request_draft", JSON.stringify(payload));
    setStepNotice("Draft saved locally.");
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-35">
        <div className="absolute -top-20 left-10 h-72 w-72 rounded-full bg-cyan-200 blur-3xl"></div>
        <div className="absolute top-10 right-10 h-72 w-72 rounded-full bg-blue-200 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-200 blur-3xl"></div>
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

        {showHeaderWidget ? (
          <div className="bg-white/90 rounded-3xl border border-cyan-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => hideWidget(`${widgetPrefix}header`)}
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                aria-label="Hide page header widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Credit Module</p>
              <h1 className="text-3xl font-extrabold text-slate-900 mt-1">New Loan Request</h1>
              <p className="text-sm text-slate-600 mt-1">Step-by-step process to capture a new loan request.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard/loan")}
              className="px-4 py-2 rounded-xl bg-white border border-cyan-200 text-cyan-800 text-sm font-semibold hover:bg-cyan-50"
            >
              Back to Loan Dashboard
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-2xl border border-cyan-100 bg-white/90 p-6">
            {showStepNavigatorWidget ? (
              <div className="rounded-xl border border-cyan-100 bg-white p-4 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}step_navigator`)}
                    className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                    aria-label="Hide step navigator widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="h-2 rounded-full bg-cyan-100 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-2">
                  {steps.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => handleStepClick(step.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition-all ${
                        activeStep === step.id
                          ? "border-cyan-300 bg-cyan-50"
                          : step.id < activeStep
                          ? "border-emerald-200 bg-emerald-50/70"
                          : "border-cyan-100 bg-white"
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-800">Step {step.id}</p>
                      <p className="text-xs font-semibold text-slate-700">{step.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                Step navigator widget is hidden.
              </div>
            )}

            {showStepContentWidget ? (
              isActiveStepWidgetVisible ? (
                <div className="relative">
                  <WidgetCloseGate>
                    <div className="absolute right-0 top-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => hideWidget(`${widgetPrefix}step_content`)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                        aria-label="Hide step content section widget"
                        title="Hide step content section"
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        onClick={() => hideWidget(activeStepWidgetKey)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                        aria-label="Hide current step widget"
                        title="Hide current step only"
                      >
                        ×
                      </button>
                    </div>
                  </WidgetCloseGate>

            {activeStep === 1 && (
              <>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Step 1</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Loan Products</h2>
                <p className="text-sm text-slate-600 mt-1">Choose a product for this loan request.</p>

                <p className="mt-4 text-xs font-semibold text-slate-700">Select loan product *</p>
                {loanProductsLoading ? (
                  <p className="mt-2 text-xs text-cyan-700">Loading loan products from database...</p>
                ) : null}
                {loanProductsError ? (
                  <p className="mt-2 text-xs text-amber-700">{loanProductsError}</p>
                ) : null}
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {loanProducts.map((item) => {
                    const active = loanProduct === item.key;
                    const isPersisted = item.key.startsWith("loan_product_");
                    const isDeleting = deletingProductKey === item.key;

                    return (
                      <div key={item.key} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setLoanProduct(item.key)}
                          className={`w-full text-left rounded-xl border p-4 transition-all ${
                            active
                              ? "border-cyan-300 bg-cyan-50 shadow-sm"
                              : "border-cyan-100 bg-white hover:bg-cyan-50/60"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 bg-gradient-to-r ${item.color} rounded-lg flex items-center justify-center text-xl text-white`}>
                              {item.icon}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{item.name}</p>
                              <p className="text-xs text-slate-600">{item.description}</p>
                            </div>
                          </div>
                        </button>

                        {isPersisted ? (
                          <div className="flex items-center gap-2 px-1">
                            <button
                              type="button"
                              onClick={() => handleEditLoanProduct(item)}
                              className="px-3 py-1.5 rounded-md border border-cyan-200 bg-white text-xs font-semibold text-cyan-800 hover:bg-cyan-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteLoanProductConfirmation(item)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 rounded-md border border-rose-200 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {loanProducts.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    No loan products found. Add a custom loan product to continue.
                  </div>
                ) : null}
                {manageProductError ? (
                  <p className="mt-2 text-xs text-rose-700">{manageProductError}</p>
                ) : null}

                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {editingProductKey ? "Edit custom loan product" : "Add custom loan product"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Manage saved loan products without leaving this page.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showAddProduct}
                      aria-label="Show add custom loan product form"
                      onClick={() => setShowAddProduct((prev) => !prev)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 ${
                        showAddProduct ? "border-cyan-500 bg-cyan-500" : "border-slate-300 bg-slate-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          showAddProduct ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {showAddProduct && (
                    <div className="border-t border-slate-200 bg-white p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <FieldLabel htmlFor="new-product-name">Product name</FieldLabel>
                          <input
                            id="new-product-name"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            placeholder="e.g. Agriculture Loan"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="new-product-interest-rate">Interest rate (%)</FieldLabel>
                          <input
                            id="new-product-interest-rate"
                            type="number"
                            min="0"
                            step="0.0001"
                            value={newProductInterestRate}
                            onChange={(e) => setNewProductInterestRate(e.target.value)}
                            placeholder="e.g. 18"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="new-product-description" optional>
                            Short description
                          </FieldLabel>
                          <input
                            id="new-product-description"
                            value={newProductDescription}
                            onChange={(e) => setNewProductDescription(e.target.value)}
                            placeholder="Brief product summary"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="new-product-icon">Product icon</FieldLabel>
                          <select
                            id="new-product-icon"
                            value={newProductIcon}
                            onChange={(e) => setNewProductIcon(e.target.value)}
                            className={fieldClass}
                          >
                            {PRODUCT_ICONS.map((icon) => (
                              <option key={icon} value={icon}>
                                {icon}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={addLoanProduct}
                          disabled={!newProductName.trim() || !newProductInterestRate.trim() || addProductLoading}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {addProductLoading ? "Saving..." : editingProductKey ? "Update product" : "Add product"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddProduct(false);
                            resetProductForm();
                          }}
                          className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                      {addProductError ? (
                        <p className="text-xs text-rose-700">{addProductError}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeStep === 2 && (
              <>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Step 2</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Customer Details</h2>
                <p className="text-sm text-slate-600 mt-1">Capture complete applicant and income details.</p>

                <div className="mt-6 rounded-xl border border-cyan-100 bg-white p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="customer-no">Customer number *</FieldLabel>
                      <div className="flex gap-2">
                        <input
                          id="customer-no"
                          value={customerDetails.customerNo}
                          readOnly
                          placeholder="Auto-generated on open"
                          className={readOnlyFieldClass}
                          title="Branch + loan type + date/time"
                        />
                        <button
                          type="button"
                          onClick={applyGeneratedCustomerNumber}
                          className="shrink-0 px-3 py-2 rounded-xl border border-cyan-200 bg-cyan-50 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                        >
                          Regenerate
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Format: branch – loan type – date/time
                        {branchName ? ` (${branchName})` : ""}
                        {selectedProduct ? ` · ${selectedProduct.name}` : ""}
                      </p>
                    </div>
                    <div>
                      <FieldLabel htmlFor="customer-full-name">Full name *</FieldLabel>
                      <input
                        id="customer-full-name"
                        value={customerDetails.fullName}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, fullName: e.target.value }))
                        }
                        placeholder="As per NIC / passport"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="customer-nic">NIC / passport number *</FieldLabel>
                      <input
                        id="customer-nic"
                        value={customerDetails.nic}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, nic: e.target.value }))
                        }
                        placeholder="National ID or passport"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="customer-mobile">Mobile number *</FieldLabel>
                      <input
                        id="customer-mobile"
                        type="tel"
                        value={customerDetails.mobile}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, mobile: e.target.value }))
                        }
                        placeholder="e.g. 0771234567"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="customer-bank-name">Bank name *</FieldLabel>
                      <input
                        id="customer-bank-name"
                        value={customerDetails.bankName}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, bankName: e.target.value }))
                        }
                        placeholder="e.g. Bank of Ceylon"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="customer-bank-branch">Bank branch *</FieldLabel>
                      <input
                        id="customer-bank-branch"
                        value={customerDetails.bankBranch}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, bankBranch: e.target.value }))
                        }
                        placeholder="e.g. Eheliyagoda Branch"
                        className={fieldClass}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="customer-bank-account-no">Bank account no *</FieldLabel>
                      <input
                        id="customer-bank-account-no"
                        value={customerDetails.bankAccountNo}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, bankAccountNo: e.target.value }))
                        }
                        placeholder="Enter account number"
                        className={fieldClass}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="customer-business" optional>
                        Business name
                      </FieldLabel>
                      <input
                        id="customer-business"
                        value={customerDetails.businessName}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, businessName: e.target.value }))
                        }
                        placeholder="If applicant is a business"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="customer-monthly-income">Monthly income (LKR) *</FieldLabel>
                      <input
                        id="customer-monthly-income"
                        type="number"
                        min="0"
                        value={customerDetails.monthlyIncome}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, monthlyIncome: e.target.value }))
                        }
                        placeholder="0.00"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="customer-income-source">Primary income source *</FieldLabel>
                      <input
                        id="customer-income-source"
                        value={customerDetails.incomeSource}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, incomeSource: e.target.value }))
                        }
                        placeholder="e.g. Salary, business, farming"
                        className={fieldClass}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="customer-additional-income" optional>
                        Additional income (LKR)
                      </FieldLabel>
                      <input
                        id="customer-additional-income"
                        type="number"
                        min="0"
                        value={customerDetails.additionalIncome}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, additionalIncome: e.target.value }))
                        }
                        placeholder="Other monthly income, if any"
                        className={fieldClass}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="customer-address">Residential / business address *</FieldLabel>
                      <textarea
                        id="customer-address"
                        value={customerDetails.address}
                        onChange={(e) =>
                          setCustomerDetails((prev) => ({ ...prev, address: e.target.value }))
                        }
                        placeholder="Full address"
                        className={fieldClass}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeStep === 3 && (
              <>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Step 3</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Guarantor Details</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Guarantor is optional. If you add a guarantor, complete every field marked with * for that person.
                </p>

                <div className="mt-6 rounded-xl border border-cyan-100 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">
                      Guarantors
                    </p>
                    <button
                      type="button"
                      onClick={addGuarantor}
                      className="px-3 py-1.5 rounded-lg bg-cyan-100 text-cyan-800 text-xs font-semibold hover:bg-cyan-200"
                    >
                      Add Guarantor
                    </button>
                  </div>

                  {guarantors.map((item, index) => (
                    <div
                      key={`guarantor_${index}`}
                      className="rounded-lg border border-cyan-100 bg-cyan-50/30 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">Guarantor {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeGuarantor(index)}
                          className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-xs font-semibold hover:bg-rose-200"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <FieldLabel htmlFor={`guarantor-${index}-name`}>Full name *</FieldLabel>
                          <input
                            id={`guarantor-${index}-name`}
                            value={item.fullName}
                            onChange={(e) => updateGuarantor(index, "fullName", e.target.value)}
                            placeholder="Guarantor full name"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={`guarantor-${index}-nic`}>NIC / passport *</FieldLabel>
                          <input
                            id={`guarantor-${index}-nic`}
                            value={item.nic}
                            onChange={(e) => updateGuarantor(index, "nic", e.target.value)}
                            placeholder="National ID or passport"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={`guarantor-${index}-mobile`}>Mobile number *</FieldLabel>
                          <input
                            id={`guarantor-${index}-mobile`}
                            type="tel"
                            value={item.mobile}
                            onChange={(e) => updateGuarantor(index, "mobile", e.target.value)}
                            placeholder="e.g. 0771234567"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={`guarantor-${index}-relation`}>
                            Relationship to customer *
                          </FieldLabel>
                          <input
                            id={`guarantor-${index}-relation`}
                            value={item.relation}
                            onChange={(e) => updateGuarantor(index, "relation", e.target.value)}
                            placeholder="e.g. Spouse, parent, sibling"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={`guarantor-${index}-income`} optional>
                            Monthly income (LKR)
                          </FieldLabel>
                          <input
                            id={`guarantor-${index}-income`}
                            type="number"
                            min="0"
                            value={item.monthlyIncome}
                            onChange={(e) => updateGuarantor(index, "monthlyIncome", e.target.value)}
                            placeholder="If known"
                            className={fieldClass}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <FieldLabel htmlFor={`guarantor-${index}-address`}>Address *</FieldLabel>
                          <textarea
                            id={`guarantor-${index}-address`}
                            value={item.address}
                            onChange={(e) => updateGuarantor(index, "address", e.target.value)}
                            placeholder="Full address"
                            className={fieldClass}
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeStep === 4 && (
              <>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Step 4</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Loan Terms</h2>
                <p className="text-sm text-slate-600 mt-1">Set repayment frequency, amount, rate, and tenure.</p>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="loan-selected-product">Selected loan product</FieldLabel>
                    <input
                      id="loan-selected-product"
                      value={selectedProduct?.name || "-"}
                      readOnly
                      className="w-full rounded-xl border border-cyan-100 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="loan-frequency">Installment frequency *</FieldLabel>
                    <select
                      id="loan-frequency"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as "monthly" | "weekly")}
                      className={fieldClass}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="loan-principal">Principal amount (LKR) *</FieldLabel>
                    <input
                      id="loan-principal"
                      type="number"
                      min="0"
                      value={principal}
                      onChange={(e) => setPrincipal(e.target.value)}
                      placeholder="Loan amount"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="loan-rate">Interest rate per year (%) *</FieldLabel>
                    <input
                      id="loan-rate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={annualRate}
                      onChange={(e) => setAnnualRate(e.target.value)}
                      placeholder="e.g. 18"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="loan-rate-type">Interest rate type *</FieldLabel>
                    <select
                      id="loan-rate-type"
                      value={interestRateType}
                      onChange={(e) => setInterestRateType(e.target.value as "fixed" | "reducing")}
                      className={fieldClass}
                    >
                      <option value="fixed">Fixed</option>
                      <option value="reducing">Reducing</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="loan-tenure">Loan tenure (months) *</FieldLabel>
                    <input
                      id="loan-tenure"
                      type="number"
                      min="1"
                      value={tenureMonths}
                      onChange={(e) => setTenureMonths(e.target.value)}
                      placeholder="e.g. 36"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </>
            )}

            {activeStep === 5 && (
              <>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Step 5</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Review</h2>
                <p className="text-sm text-slate-800 mt-1">
                  Confirm selected product, customer, guarantor, and loan terms.
                </p>

                <div className="mt-4 rounded-xl border border-cyan-200 bg-white p-4 space-y-2.5 text-sm text-slate-900">
                  <p>
                    <span className="font-semibold text-cyan-900">Product:</span>{" "}
                    <span className="font-medium text-slate-900">{selectedProduct?.name || "-"}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-900">Customer:</span>{" "}
                    <span className="font-medium text-slate-900">
                      {customerDetails.fullName || "-"} ({customerDetails.customerNo || "-"})
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-900">Monthly Income:</span>{" "}
                    <span className="font-medium text-slate-900">
                      {formatAmount(Number(customerDetails.monthlyIncome || 0))}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-900">Income Source:</span>{" "}
                    <span className="font-medium text-slate-900">{customerDetails.incomeSource || "-"}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-900">Guarantors:</span>{" "}
                    <span className="font-medium text-slate-900">{guarantors.length}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-900">Principal:</span>{" "}
                    <span className="font-medium text-slate-900">{formatAmount(Number(principal || 0))}</span>
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-900">Interest:</span>{" "}
                    <span className="font-medium text-slate-900">
                      {annualRate || "0"}% ({interestRateType === "reducing" ? "Reducing" : "Fixed"})
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold text-cyan-900">Tenure:</span>{" "}
                    <span className="font-medium text-slate-900">{tenureMonths || "0"} months</span>
                  </p>
                </div>
              </>
            )}

            {activeStep === 6 && (
              <>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Step 6</p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Document Upload</h2>
                <p className="text-sm text-slate-600 mt-1">Upload one or more supporting documents before submission.</p>

                <div className="mt-6 rounded-xl border border-cyan-100 bg-white p-4 space-y-3">
                  <FieldLabel htmlFor="loan-documents">
                    Supporting documents * (PDF, DOC, DOCX, JPG, PNG — multiple files allowed)
                  </FieldLabel>
                  <input
                    id="loan-documents"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={handleDocumentSelect}
                    className={fieldClass}
                  />

                  {documents.length > 0 ? (
                    <div className="space-y-2">
                      {documents.map((document, index) => (
                        <div
                          key={`${document.name}_${document.lastModified}_${index}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{document.name}</p>
                            <p className="text-xs text-slate-500">{(document.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDocument(index)}
                            className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-xs font-semibold hover:bg-rose-200"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700">No documents selected yet. You can choose multiple files at once or add more in batches.</p>
                  )}
                </div>
              </>
            )}

            {stepNotice && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {stepNotice}
              </div>
            )}

            {submitMessage && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {submitMessage}
              </div>
            )}

            {submitError && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {submitError}
              </div>
            )}
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                  Current step content widget is hidden.
                </div>
              )
            ) : null}

            {showActionBarWidget ? (
              <div className="mt-6 flex items-center justify-between gap-3 relative">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => hideWidget(`${widgetPrefix}action_bar`)}
                    className="absolute right-0 -top-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                    aria-label="Hide action bar widget"
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => {
                    setActiveStep((prev) => Math.max(prev - 1, 1));
                    setStepNotice("");
                  }}
                  disabled={activeStep === 1}
                  className="px-4 py-2 rounded-lg border border-cyan-200 bg-white text-cyan-800 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back Step
                </button>

                {activeStep < steps.length ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold hover:from-cyan-700 hover:to-blue-700"
                  >
                    Next Step
                  </button>
                ) : isSubmitted ? (
                  <div className="px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-semibold">
                    Loan Request Already Submitted
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmitLoanRequest}
                    disabled={submitLoading}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitLoading ? "Submitting..." : "Submit Loan Request"}
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
                Action bar widget is hidden.
              </div>
            )}
          </div>

          {showPreviewWidget ? (
            <div className="rounded-2xl border border-cyan-100 bg-white/90 p-6 relative">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => hideWidget(`${widgetPrefix}preview`)}
                  className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50"
                  aria-label="Hide calculation preview widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Draft Dashboard</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <h3 className="text-xl font-extrabold text-slate-900">TD Speed Draft Summary</h3>
                <AvatarChip label={customerDetails.fullName || selectedProduct?.name || "TD"} />
              </div>
              <p className="text-sm text-slate-600 mt-1">Review your draft facility before submitting your application.</p>

              {loanProductsLoading ? (
                <div className="mt-4 space-y-3">
                  <SkeletonBox className="h-16 w-full" />
                  <SkeletonBox className="h-16 w-full" />
                  <SkeletonBox className="h-16 w-full" />
                </div>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Card className="p-3 bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200">
                      <div className="flex items-start justify-between">
                        <p className="text-xs font-semibold text-cyan-800">Loan Amount</p>
                        <CircleDollarSign className="h-4 w-4 text-cyan-700" />
                      </div>
                      <p className="mt-2 text-2xl font-extrabold text-cyan-900">LKR {formatAmount(Number(principal || 0))}</p>
                      <Badge className="mt-2 border-cyan-200 bg-cyan-100 text-cyan-800">Primary</Badge>
                    </Card>

                    <Card className="p-3">
                      <div className="flex items-start justify-between">
                        <p className="text-xs font-semibold text-slate-700">Loan Period</p>
                        <CalendarDays className="h-4 w-4 text-slate-500" />
                      </div>
                      <p className="mt-2 text-lg font-bold text-slate-900">{tenureMonths || "0"} Months</p>
                    </Card>

                    <Card className="p-3 border-emerald-200 bg-emerald-50">
                      <div className="flex items-start justify-between">
                        <p className="text-xs font-semibold text-emerald-800">Monthly Installment</p>
                        <Wallet className="h-4 w-4 text-emerald-700" />
                      </div>
                      <p className="mt-2 text-2xl font-extrabold text-emerald-900">LKR {formatAmount(calculation.installmentAmount)}</p>
                    </Card>

                    <Card className="p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">Interest Rate</p>
                        <TooltipText text="Effective rate is shown when provided by product configuration.">
                          <Info className="h-4 w-4 text-slate-500" />
                        </TooltipText>
                      </div>
                      <p className="mt-2 text-lg font-bold text-slate-900">{annualRate || "0"}% / year</p>
                      <p className="text-xs text-slate-500">Effective: Not available</p>
                    </Card>

                    <Card className="p-3">
                      <p className="text-xs font-semibold text-slate-700">Processing Fee</p>
                      <p className="mt-2 text-lg font-bold text-slate-900">Not available</p>
                    </Card>

                    <Card className="p-3">
                      <p className="text-xs font-semibold text-slate-700">Total Interest</p>
                      <p className="mt-2 text-lg font-bold text-slate-900">LKR {formatAmount(totalInterest)}</p>
                    </Card>

                    <Card className="p-3">
                      <p className="text-xs font-semibold text-slate-700">Total Amount Payable</p>
                      <p className="mt-2 text-lg font-bold text-slate-900">LKR {formatAmount(calculation.totalPayable)}</p>
                    </Card>

                    <Card className="p-3">
                      <p className="text-xs font-semibold text-slate-700">Available Credit Limit</p>
                      <p className="mt-2 text-lg font-bold text-slate-900">Not available</p>
                    </Card>
                  </div>

                  <Separator className="my-4" />

                  <div>
                    <p className="text-sm font-bold text-slate-900">Eligibility Status</p>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">Customer Profile</p>
                          <CheckCircle2 className={`h-4 w-4 ${customerInfoComplete ? "text-emerald-600" : "text-amber-500"}`} />
                        </div>
                        <Badge className={`mt-2 ${customerInfoComplete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {customerInfoComplete ? "Completed" : "Missing"}
                        </Badge>
                      </Card>

                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">Guarantor</p>
                          <FileCheck2 className={`h-4 w-4 ${guarantorInfoComplete ? "text-emerald-600" : "text-amber-500"}`} />
                        </div>
                        <Badge className={`mt-2 ${guarantorInfoComplete ? "border-slate-200 bg-slate-50 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {guarantorHasAnyData ? (guarantorInfoComplete ? "Completed" : "Required") : "Optional"}
                        </Badge>
                      </Card>

                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">Documents</p>
                          <CreditCard className={`h-4 w-4 ${documents.length > 0 ? "text-emerald-600" : "text-amber-500"}`} />
                        </div>
                        <Badge className={`mt-2 ${documents.length > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {documents.length > 0 ? "Completed" : "Pending Upload"}
                        </Badge>
                      </Card>

                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">Credit Verification</p>
                          <Clock3 className="h-4 w-4 text-blue-500" />
                        </div>
                        <Badge className="mt-2 border-blue-200 bg-blue-50 text-blue-700">Pending</Badge>
                      </Card>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">Application Progress</p>
                      <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">Step {progressStep} / 5</Badge>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={progressPercentDashboard} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {[
                        "Customer Details",
                        "Loan Details",
                        "Documents",
                        "Verification",
                        "Approval",
                      ].map((label, index) => {
                        const stepIndex = index + 1;
                        const isCurrent = progressStep === stepIndex;
                        const isComplete = progressStep > stepIndex;

                        return (
                          <div key={label} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isCurrent ? "border-cyan-300 bg-cyan-50 text-cyan-800" : isComplete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
                            {stepIndex}. {label}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div>
                    <p className="text-sm font-bold text-slate-900">Speed Draft Features</p>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Card className="p-3"><p className="text-xs font-semibold text-slate-700 inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-yellow-500" /> Fast Approval</p></Card>
                      <Card className="p-3"><p className="text-xs font-semibold text-slate-700 inline-flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-emerald-600" /> Instant Disbursement</p></Card>
                      <Card className="p-3"><p className="text-xs font-semibold text-slate-700 inline-flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-cyan-600" /> Minimum Documentation</p></Card>
                      <Card className="p-3"><p className="text-xs font-semibold text-slate-700 inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-indigo-600" /> Flexible Repayment</p></Card>
                      <Card className="p-3 md:col-span-2"><p className="text-xs font-semibold text-slate-700 inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" /> Secure Processing</p></Card>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <AlertBox>
                    <div className="inline-flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 text-blue-600" />
                      <p>
                        Your monthly installment and total payable are estimated based on the selected loan amount and repayment period. Final approval is subject to verification.
                      </p>
                    </div>
                  </AlertBox>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleContinueApplication}
                      disabled={submitLoading}
                      className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-cyan-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Continue Application
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-100"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStep((prev) => Math.max(prev - 1, 1));
                        setStepNotice("");
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-medium text-cyan-900">
              Calculation preview widget is hidden.
            </div>
          )}
        </div>
      </div>

      {confirmationModal.open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">{confirmationModal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{confirmationModal.message}</p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirmationModal}
                disabled={isConfirmationBusy}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmationAction}
                disabled={isConfirmationBusy}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                  confirmationModal.tone === "danger"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-cyan-600 hover:bg-cyan-700"
                }`}
              >
                {isConfirmationBusy ? "Processing..." : confirmationModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
