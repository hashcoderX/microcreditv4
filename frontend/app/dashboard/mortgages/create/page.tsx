"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import ClientMountGate from "@/app/components/ClientMountGate";
import { getApiBaseUrl } from "@/lib/api";
import { WidgetCloseGate } from "@/lib/useWidgetsFixed";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  Home,
  Sparkles,
  User,
  Users,
  Wallet,
} from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200/70";

const labelClass = "mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500";

const sectionTitleClass = "mb-3 text-xs font-bold uppercase tracking-[0.16em] text-cyan-700";

type CustomerDetail = {
  id: number;
  customer_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nic_passport?: string | null;
  old_nic?: string | null;
  passport_no?: string | null;
  date_of_birth?: string | null;
  gender?: "male" | "female" | "other" | string | null;
  marital_status?: "single" | "married" | "divorced" | "widowed" | string | null;
  nationality?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  phone?: string | null;
  email?: string | null;
  employment_type?: "salaried" | "self_employed" | "business" | string | null;
  employer_name?: string | null;
  job_title?: string | null;
  monthly_income?: string | number | null;
  other_income_sources?: string | null;
  existing_loans?: boolean | number | null;
  monthly_loan_obligations?: string | number | null;
  credit_score?: string | number | null;
};

type FinanceCustomerSearchMatch = {
  customer: CustomerDetail;
  matched_by?: string[];
  matched_investment_account_no?: string | null;
};

type Step =
  | "profile"
  | "financial"
  | "coBorrower"
  | "loanCollateral"
  | "documentsReview";

const STEP_ORDER: Step[] = [
  "profile",
  "financial",
  "coBorrower",
  "loanCollateral",
  "documentsReview",
];

const STEP_LABELS: Record<Step, string> = {
  profile: "Profile",
  financial: "Financial",
  coBorrower: "Guarantor",
  loanCollateral: "Loan & Collateral",
  documentsReview: "Documents & Review",
};

const STEP_ICONS: Record<Step, typeof User> = {
  profile: User,
  financial: Wallet,
  coBorrower: Users,
  loanCollateral: Building2,
  documentsReview: FileText,
};

const hasText = (value: string) => value.trim().length > 0;
const hasPositiveNumber = (value: string) => {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0;
};

const generateFileCode = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `CUS-${yyyy}${mm}${dd}-${random}`;
};

const isCustomerDetail = (value: unknown): value is CustomerDetail => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CustomerDetail>;
  return typeof candidate.id === "number";
};

export default function CreateMortgage() {
  const [token, setToken] = useState("");
  const [step, setStep] = useState<Step>("profile");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<"confirm" | "error" | "info">("info");
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [widgetNotice, setWidgetNotice] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedInvestmentAccountNo, setSelectedInvestmentAccountNo] = useState("");
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerSearchBy, setCustomerSearchBy] = useState<"nic_passport" | "passport" | "investment_account_no">("nic_passport");
  const [customerSearchValue, setCustomerSearchValue] = useState("");
  const [loadingCustomerSuggestions, setLoadingCustomerSuggestions] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<FinanceCustomerSearchMatch[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const widgetPrefix = "mortgages_create_widget_";
  const router = useRouter();

  // Customer details
  const [fullName, setFullName] = useState("");
  const [fileCode, setFileCode] = useState("");
  const [nic, setNic] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  // Employment & Income
  const [employmentType, setEmploymentType] = useState<
    "salaried" | "self_employed" | "business"
  >("salaried");
  const [employerName, setEmployerName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [otherIncomeSources, setOtherIncomeSources] = useState("");
  // Credit & Risk
  const [existingLoans, setExistingLoans] = useState(false);
  const [monthlyLoanObligations, setMonthlyLoanObligations] = useState("");
  const [creditScore, setCreditScore] = useState("");
  // Co-Borrower / Guarantor
  const [coBorrowerName, setCoBorrowerName] = useState("");
  const [coBorrowerNic, setCoBorrowerNic] = useState("");
  const [coBorrowerRelationship, setCoBorrowerRelationship] = useState("");
  const [coBorrowerAddress, setCoBorrowerAddress] = useState("");
  const [coBorrowerContact, setCoBorrowerContact] = useState("");
  const [coBorrowerIncome, setCoBorrowerIncome] = useState("");

  // Mortgage Loan Details
  const [requestedAmount, setRequestedAmount] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestType, setInterestType] = useState<"fixed" | "reducing">(
    "fixed"
  );
  const [tenureMonths, setTenureMonths] = useState("");
  const [installmentFrequency, setInstallmentFrequency] = useState<
    "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
  >("monthly");
  const [interestCalculationFrequency, setInterestCalculationFrequency] = useState<
    "daily" | "weekly" | "monthly" | "yearly"
  >("monthly");
  const [processingFee, setProcessingFee] = useState("");
  const [insuranceFee, setInsuranceFee] = useState("");
  const [penaltyRate, setPenaltyRate] = useState("");

  // Collateral Details
  const [assetType, setAssetType] = useState<
    "land" | "house" | "vehicle" | "gold" | "other"
  >("land");
  const [assetDescription, setAssetDescription] = useState("");
  const [ownershipType, setOwnershipType] = useState<"single" | "joint">(
    "single"
  );
  // Legal
  const [deedNumber, setDeedNumber] = useState("");
  const [deedDate, setDeedDate] = useState("");
  const [surveyPlanNumber, setSurveyPlanNumber] = useState("");
  const [registrationOffice, setRegistrationOffice] = useState("");
  const [lawyerName, setLawyerName] = useState("");
  // Valuation
  const [marketValue, setMarketValue] = useState("");
  const [forcedSaleValue, setForcedSaleValue] = useState("");
  const [valuationDate, setValuationDate] = useState("");
  const [valuerName, setValuerName] = useState("");
  // Physical
  const [assetAddress, setAssetAddress] = useState("");
  const [landSizeOrBuildingArea, setLandSizeOrBuildingArea] = useState("");
  const [boundaries, setBoundaries] = useState("");
  // Vehicle
  const [vehicleRegNo, setVehicleRegNo] = useState("");
  const [vehicleEngineNo, setVehicleEngineNo] = useState("");
  const [vehicleChassisNo, setVehicleChassisNo] = useState("");
  const [vehicleManufactureYear, setVehicleManufactureYear] = useState("");

  // Documents
  const [customerDocuments, setCustomerDocuments] = useState<{ type: string; file: File }[]>([]);
  const [assetDocuments, setAssetDocuments] = useState<{ type: string; file: File }[]>([]);
  const [legalDocuments, setLegalDocuments] = useState<{ type: string; file: File }[]>([]);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) {
      router.push("/");
    } else {
      setToken(t);
      setFileCode((prev) => prev || generateFileCode());
      void fetchWidgetPreferences(t);
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

  const nextStep = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  };

  const prevStep = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  const applyCustomerDetailToForm = useCallback(
    (customer: CustomerDetail, investmentAccountNo?: string | null) => {
      const firstName = String(customer.first_name || "").trim();
      const lastName = String(customer.last_name || "").trim();
      const joinedName = `${firstName} ${lastName}`.trim();
      setSelectedCustomerId(Number(customer.id || 0) || null);
      setSelectedInvestmentAccountNo(String(investmentAccountNo || "").trim());
      setFullName(joinedName || fullName);
      setFileCode(String(customer.customer_code || "").trim() || fileCode);
      setNic(String(customer.nic_passport || customer.passport_no || "").trim() || nic);
      setDateOfBirth(String(customer.date_of_birth || "").slice(0, 10));
      setMobileNumber(String(customer.phone || "").trim() || mobileNumber);
      setEmail(String(customer.email || "").trim() || email);

      const nextEmploymentType = String(customer.employment_type || "").toLowerCase();
      if (nextEmploymentType === "salaried" || nextEmploymentType === "self_employed" || nextEmploymentType === "business") {
        setEmploymentType(nextEmploymentType as "salaried" | "self_employed" | "business");
      }

      setEmployerName(String(customer.employer_name || "").trim() || employerName);
      setJobTitle(String(customer.job_title || "").trim() || jobTitle);
      setMonthlyIncome(String(customer.monthly_income ?? "").trim() || monthlyIncome);
      setOtherIncomeSources(String(customer.other_income_sources || "").trim() || otherIncomeSources);
      setExistingLoans(Boolean(customer.existing_loans));
      setMonthlyLoanObligations(String(customer.monthly_loan_obligations ?? "").trim() || monthlyLoanObligations);
      setCreditScore(String(customer.credit_score ?? "").trim() || creditScore);
    },
    [
      fullName,
      fileCode,
      nic,
      mobileNumber,
      email,
      employerName,
      jobTitle,
      monthlyIncome,
      otherIncomeSources,
      monthlyLoanObligations,
      creditScore,
    ]
  );

  const mapQuickSearchParams = (
    searchBy: "nic_passport" | "passport" | "investment_account_no",
    value: string
  ) => {
    const keyword = value.trim();
    if (!keyword) return {};
    if (searchBy === "passport") return { passport_no: keyword, limit: 8 };
    if (searchBy === "investment_account_no") return { investment_account_no: keyword, limit: 8 };
    return { nic_passport: keyword, limit: 8 };
  };

  const loadCustomerSuggestions = useCallback(
    async (authToken: string, searchBy: "nic_passport" | "passport" | "investment_account_no", value: string) => {
      const keyword = value.trim();
      if (!keyword) {
        setCustomerSuggestions([]);
        return;
      }
      try {
        setLoadingCustomerSuggestions(true);
        const response = await axios.get(`${getApiBaseUrl()}/customers/finance-search`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            Accept: "application/json",
          },
          params: mapQuickSearchParams(searchBy, keyword),
        });

        const rows = Array.isArray(response.data?.matches) ? response.data.matches : [];
        const next = rows.filter((row: unknown) => {
          if (!row || typeof row !== "object") return false;
          const candidate = row as { customer?: unknown };
          return isCustomerDetail(candidate.customer);
        }) as FinanceCustomerSearchMatch[];

        setCustomerSuggestions(next);
      } catch {
        setCustomerSuggestions([]);
      } finally {
        setLoadingCustomerSuggestions(false);
      }
    },
    []
  );

  const selectQuickSuggestion = useCallback(
    (match: FinanceCustomerSearchMatch) => {
      if (!match || !isCustomerDetail(match.customer)) return;
      const matchedAccount = String(match.matched_investment_account_no || "").trim();

      if (customerSearchBy === "investment_account_no" && matchedAccount) {
        setCustomerSearchValue(matchedAccount);
      } else if (customerSearchBy === "passport") {
        setCustomerSearchValue(String(match.customer.passport_no || match.customer.nic_passport || ""));
      } else {
        setCustomerSearchValue(String(match.customer.nic_passport || match.customer.customer_code || ""));
      }

      applyCustomerDetailToForm(match.customer, matchedAccount || null);
      setShowCustomerSuggestions(false);
      setCustomerSuggestions([]);
    },
    [applyCustomerDetailToForm, customerSearchBy]
  );

  const searchCustomerForMortgage = useCallback(
    async (authToken: string) => {
      const keyword = customerSearchValue.trim();
      if (!keyword) {
        openModal("error", "Missing Search Value", "Enter search value to find customer.");
        return false;
      }

      try {
        setSearchingCustomer(true);
        const response = await axios.get(`${getApiBaseUrl()}/customers/finance-lookup`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            Accept: "application/json",
          },
          params: {
            search_by: customerSearchBy,
            q: keyword,
          },
        });

        const payload = response.data as {
          found?: boolean;
          data?: unknown;
          matched_investment_account_no?: string | null;
          message?: string;
        };

        const customer = isCustomerDetail(payload?.data) ? payload.data : null;
        if (!payload?.found || !customer) {
          openModal("error", "Customer Not Found", String(payload?.message || "Customer not found."));
          return false;
        }

        applyCustomerDetailToForm(customer, payload.matched_investment_account_no || null);
        setShowCustomerSuggestions(false);
        setCustomerSuggestions([]);
        return true;
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          openModal("error", "Customer Search Failed", String(error.response?.data?.message || "Customer search failed."));
        } else {
          openModal("error", "Customer Search Failed", "Customer search failed.");
        }
        return false;
      } finally {
        setSearchingCustomer(false);
      }
    },
    [applyCustomerDetailToForm, customerSearchBy, customerSearchValue]
  );

  useEffect(() => {
    if (!token || step !== "profile") return;
    const keyword = customerSearchValue.trim();
    if (!keyword) {
      setCustomerSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadCustomerSuggestions(token, customerSearchBy, keyword);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [token, step, customerSearchBy, customerSearchValue, loadCustomerSuggestions]);

  const stepTitle = useMemo(() => {
    switch (step) {
      case "profile":
        return "Customer & Contact Profile";
      case "financial":
        return "Employment, Income & Credit";
      case "coBorrower":
        return "Co-Borrower / Guarantor Details";
      case "loanCollateral":
        return "Loan & Collateral Details";
      case "documentsReview":
        return "Documents, Review & Submit";
    }
  }, [step]);

  const isProfileStepComplete = useMemo(() => {
    return Number(selectedCustomerId || 0) > 0;
  }, [selectedCustomerId]);

  const isFinancialStepComplete = useMemo(() => {
    return hasPositiveNumber(monthlyIncome);
  }, [monthlyIncome]);

  const isCoBorrowerStepComplete = useMemo(() => {
    const hasAny =
      hasText(coBorrowerName) ||
      hasText(coBorrowerNic) ||
      hasText(coBorrowerRelationship) ||
      hasText(coBorrowerAddress) ||
      hasText(coBorrowerContact) ||
      hasText(coBorrowerIncome);

    if (!hasAny) return true;

    return (
      hasText(coBorrowerName) &&
      hasText(coBorrowerNic) &&
      hasText(coBorrowerRelationship) &&
      hasText(coBorrowerAddress) &&
      hasPositiveNumber(coBorrowerIncome)
    );
  }, [coBorrowerName, coBorrowerNic, coBorrowerRelationship, coBorrowerAddress, coBorrowerContact, coBorrowerIncome]);

  const isLoanCollateralStepComplete = useMemo(() => {
    const approvedOk = !hasText(approvedAmount) || hasPositiveNumber(approvedAmount);
    return (
      hasPositiveNumber(requestedAmount) &&
      hasPositiveNumber(interestRate) &&
      hasPositiveNumber(tenureMonths) &&
      approvedOk
    );
  }, [requestedAmount, approvedAmount, interestRate, tenureMonths]);

  const isDocumentsReviewStepComplete = true;

  const isStepComplete = (targetStep: Step) => {
    switch (targetStep) {
      case "profile":
        return isProfileStepComplete;
      case "financial":
        return isFinancialStepComplete;
      case "coBorrower":
        return isCoBorrowerStepComplete;
      case "loanCollateral":
        return isLoanCollateralStepComplete;
      case "documentsReview":
        return isDocumentsReviewStepComplete;
      default:
        return false;
    }
  };

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const firstIncompleteIndex = STEP_ORDER.findIndex((s) => !isStepComplete(s));
  const maxReachableIndex = firstIncompleteIndex === -1 ? STEP_ORDER.length - 1 : firstIncompleteIndex;
  const isCurrentStepComplete = isStepComplete(step);

  const openModal = (kind: "confirm" | "error" | "info", title: string, message: string) => {
    setModalKind(kind);
    setModalTitle(title);
    setModalMessage(message);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const handleSubmit = async () => {
    if (!token || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const createdCustomerId: number | null = selectedCustomerId;

      if (!createdCustomerId) {
        throw new Error("Select an existing customer before submitting mortgage.");
      }

      // Upload selected customer documents
      for (const doc of customerDocuments) {
        const fd = new FormData();
        fd.append("document_type", doc.type);
        fd.append("file", doc.file);
        await axios.post(
          `${getApiBaseUrl()}/customers/${createdCustomerId}/documents`,
          fd,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          }
        );
      }

      // Create Mortgage
      // Conditionally include sub-sections only if provided
      const hasLegal = deedNumber || deedDate || surveyPlanNumber || registrationOffice || lawyerName;
      const hasValuation = marketValue || forcedSaleValue || valuationDate || valuerName;
      const hasPhysical = assetAddress || landSizeOrBuildingArea || boundaries;
      const normalizedAssetDescription = assetDescription.trim() || `${assetType} collateral`;

      const normalizedMortgageType = assetType;

      const mortgagePayload: any = {
        customer_id: createdCustomerId,
        mortgage_type: normalizedMortgageType,
        requested_amount: parseFloat(requestedAmount || "0"),
        approved_amount: approvedAmount
          ? parseFloat(approvedAmount)
          : undefined,
        interest_rate: parseFloat(interestRate || "0"),
        interest_type: interestType,
        tenure_months: parseInt(tenureMonths || "0"),
        installment_frequency: installmentFrequency,
        interest_calculation_frequency: interestCalculationFrequency,
        processing_fee: parseFloat(processingFee || "0"),
        insurance_fee: parseFloat(insuranceFee || "0"),
        penalty_rate: parseFloat(penaltyRate || "0"),
        asset: {
          asset_type: assetType,
          description: normalizedAssetDescription,
          ownership_type: ownershipType,
        },
      };

      // Attach co-borrower only if provided
      if (coBorrowerName || coBorrowerNic || coBorrowerRelationship || coBorrowerAddress || coBorrowerIncome) {
        mortgagePayload.co_borrower = {
          full_name: coBorrowerName,
          nic: coBorrowerNic,
          relationship: coBorrowerRelationship,
          address: coBorrowerAddress,
          contact_number: coBorrowerContact || undefined,
          monthly_income: coBorrowerIncome ? parseFloat(coBorrowerIncome) : undefined,
        };
      }

      // Attach optional legal/valuation/physical sections only if they have values
      if (hasLegal) {
        mortgagePayload.asset.legal = {
          deed_number: deedNumber || undefined,
          deed_date: deedDate || undefined,
          survey_plan_number: surveyPlanNumber || undefined,
          registration_office: registrationOffice || undefined,
          lawyer_name: lawyerName || undefined,
        };
      }
      if (hasValuation) {
        mortgagePayload.asset.valuation = {
          market_value: marketValue ? parseFloat(marketValue) : undefined,
          forced_sale_value: forcedSaleValue ? parseFloat(forcedSaleValue) : undefined,
          valuation_date: valuationDate || undefined,
          valuer_name: valuerName || undefined,
        };
      }
      if (hasPhysical) {
        mortgagePayload.asset.physical = {
          address: assetAddress || undefined,
          area: landSizeOrBuildingArea || undefined,
          boundaries: boundaries || undefined,
        };
      }
      // Always include vehicle section only if assetType is vehicle and any value provided
      if (assetType === "vehicle" && (vehicleRegNo || vehicleEngineNo || vehicleChassisNo || vehicleManufactureYear)) {
        mortgagePayload.asset.vehicle = {
          registration_number: vehicleRegNo || undefined,
          engine_number: vehicleEngineNo || undefined,
          chassis_number: vehicleChassisNo || undefined,
          manufacture_year: vehicleManufactureYear || undefined,
        };
      }

      console.log('Mortgage Payload:', mortgagePayload);

      const mortRes = await axios.post(
        `${getApiBaseUrl()}/mortgages`,
        mortgagePayload,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }
      );
      const mortgageId = mortRes.data.id;

      // Upload mortgage asset documents
      for (const doc of assetDocuments) {
        const fd = new FormData();
        fd.append("document_type", doc.type);
        fd.append("file", doc.file);
        await axios.post(
          `${getApiBaseUrl()}/mortgages/${mortgageId}/documents`,
          fd,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          }
        );
      }

      // Upload mortgage legal documents
      for (const doc of legalDocuments) {
        const fd = new FormData();
        fd.append("document_type", doc.type);
        fd.append("file", doc.file);
        await axios.post(
          `${getApiBaseUrl()}/mortgages/${mortgageId}/documents`,
          fd,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          }
        );
      }

      router.push(`/dashboard/mortgages/${mortgageId}`);
    } catch (e: any) {
      console.error('Mortgage creation error:', e);
      if (e.response && e.response.data) {
        if (e.response.data.errors) {
          // Validation errors
          const errorMessages = Object.values(e.response.data.errors).flat().join('\n');
          openModal("error", "Validation Errors", errorMessages);
        } else if (e.response.data.message) {
          openModal("error", "Submission Error", String(e.response.data.message));
        } else {
          openModal("error", "Server Error", JSON.stringify(e.response.data));
        }
      } else {
        openModal("error", "Network Error", "Failed to create mortgage. Please check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestSubmit = () => {
    if (isSubmitting || !isCurrentStepComplete) return;
    openModal("confirm", "Confirm Submission", "Are you sure you want to submit this mortgage application?");
  };

  const progressStats = useMemo(() => {
    const completedSteps = STEP_ORDER.filter((s) => isStepComplete(s)).length;
    const totalDocs = customerDocuments.length + assetDocuments.length + legalDocuments.length;
    return {
      completedSteps,
      totalSteps: STEP_ORDER.length,
      progressPercent: Math.round((completedSteps / STEP_ORDER.length) * 100),
      totalDocs,
    };
  }, [
    isProfileStepComplete,
    isFinancialStepComplete,
    isCoBorrowerStepComplete,
    isLoanCollateralStepComplete,
    customerDocuments.length,
    assetDocuments.length,
    legalDocuments.length,
  ]);

  const statsCards = [
    { key: "stat_current_step", label: "Current Step", value: STEP_LABELS[step], tone: "text-cyan-700", bg: "from-cyan-500/10 to-blue-500/5" },
    { key: "stat_steps_complete", label: "Steps Complete", value: `${progressStats.completedSteps}/${progressStats.totalSteps}`, tone: "text-emerald-700", bg: "from-emerald-500/10 to-green-500/5" },
    { key: "stat_progress", label: "Progress", value: `${progressStats.progressPercent}%`, tone: "text-indigo-700", bg: "from-indigo-500/10 to-violet-500/5" },
    { key: "stat_docs_added", label: "Documents Added", value: progressStats.totalDocs, tone: "text-amber-700", bg: "from-amber-500/10 to-orange-500/5" },
  ];
  const visibleStatsCards = statsCards.filter((item) => !hiddenWidgetKeys.has(`${widgetPrefix}${item.key}`));

  const currentStepWidgetKey = `${widgetPrefix}step_${step}`;
  const isActiveStepWidgetVisible = !hiddenWidgetKeys.has(currentStepWidgetKey);

  const showHeroWidget = !hiddenWidgetKeys.has(`${widgetPrefix}hero`);
  const showStatsWidget = !hiddenWidgetKeys.has(`${widgetPrefix}stats`);
  const showStepNavigatorWidget = !hiddenWidgetKeys.has(`${widgetPrefix}step_navigator`);
  const showStepContentWidget = !hiddenWidgetKeys.has(`${widgetPrefix}step_content`);
  const showActionBarWidget = !hiddenWidgetKeys.has(`${widgetPrefix}actions`);
  const showAnyWidget =
    showHeroWidget ||
    (showStatsWidget && visibleStatsCards.length > 0) ||
    showStepNavigatorWidget ||
    (showStepContentWidget && isActiveStepWidgetVisible) ||
    showActionBarWidget;

  const pageFallback = (
    <div className="flex min-h-screen items-center justify-center bg-[#071a22]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
        <p className="text-sm font-medium text-cyan-100/80">Loading application form...</p>
      </div>
    </div>
  );

  if (!token) {
    return <ClientMountGate fallback={pageFallback}>{pageFallback}</ClientMountGate>;
  }

  return (
    <ClientMountGate fallback={pageFallback}>
      <div className="relative min-h-screen overflow-hidden bg-[#f3f8fb]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute right-0 top-16 h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.3]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(14,116,144,0.1) 1px, transparent 0)",
              backgroundSize: "26px 26px",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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

          {showHeroWidget ? (
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0a1a24] via-[#0f3a52] to-[#0c5a7a] text-white shadow-[0_30px_80px_-24px_rgba(14,116,144,0.8)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.25),transparent_42%)]" />
            <div className="relative p-6 md:p-8">
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(`${widgetPrefix}hero`)}
                  className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/85 text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Hide create mortgage hero widget"
                >
                  ×
                </button>
              </WidgetCloseGate>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    New Application
                  </span>
                  <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Mortgage Application</h1>
                  <p className="mt-2 text-sm leading-relaxed text-cyan-50/90 md:text-base">
                    Guided multi-step onboarding for customer profile, financials, collateral, and document capture.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-cyan-100/90">
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">Mortgages</span>
                    <span className="text-cyan-200/50">/</span>
                    <span className="rounded-lg bg-cyan-400/20 px-2.5 py-1 font-semibold text-white">Create</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard/mortgages")}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Mortgages Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    <Home className="h-4 w-4" />
                    Dashboard
                  </button>
                </div>
              </div>
            </div>
          </section>
          ) : null}

          {showStatsWidget ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visibleStatsCards.map((item) => (
              <div
                key={item.label}
                className={`relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${item.bg} p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5`}
              >
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={() => void hideWidget(`${widgetPrefix}${item.key}`)}
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/70 bg-white/85 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${item.label} widget`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                <p className={`mt-2 text-xl font-black capitalize ${item.tone}`}>{item.value}</p>
              </div>
            ))}
            {visibleStatsCards.length === 0 ? (
              <div className="sm:col-span-2 xl:col-span-4 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                All progress cards are hidden.
              </div>
            ) : null}
          </section>
          ) : null}

          {showStepNavigatorWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 p-4 shadow-[0_22px_55px_-34px_rgba(14,116,144,0.45)] backdrop-blur-xl sm:p-5">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}step_navigator`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide step navigator widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Application Steps</p>
                <p className="mt-1 text-sm text-slate-600">Complete each section to unlock the next step.</p>
              </div>
              <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-slate-100 sm:block">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all"
                  style={{ width: `${progressStats.progressPercent}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {STEP_ORDER.map((key, i) => {
                const active = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                const isLocked = i > maxReachableIndex;
                const complete = isStepComplete(key);
                const StepIcon = STEP_ICONS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (!isLocked) setStep(key);
                    }}
                    disabled={isLocked}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      isCurrent
                        ? "border-cyan-300 bg-gradient-to-r from-cyan-50 to-blue-50 shadow-sm"
                        : complete
                          ? "border-emerald-200 bg-emerald-50/70"
                          : active
                            ? "border-cyan-100 bg-cyan-50/60"
                            : "border-slate-200 bg-slate-50"
                    } ${isLocked ? "cursor-not-allowed opacity-50" : "hover:-translate-y-0.5 hover:shadow-md"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                          isCurrent
                            ? "bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-sm"
                            : complete
                              ? "bg-emerald-600 text-white"
                              : active
                                ? "bg-cyan-500 text-white"
                                : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {complete && !isCurrent ? <CheckCircle2 className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className={`text-[11px] font-bold uppercase tracking-wide ${isCurrent ? "text-cyan-800" : "text-slate-600"}`}>
                          Step {i + 1}
                        </p>
                        <p className={`text-sm font-semibold ${isCurrent ? "text-slate-900" : "text-slate-700"}`}>{STEP_LABELS[key]}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          ) : null}

          {showStepContentWidget ? (
          <section className="relative overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-[0_24px_60px_-34px_rgba(14,116,144,0.5)] backdrop-blur-xl">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}step_content`)}
                className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide step content widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <div className="border-b border-slate-100 bg-gradient-to-r from-cyan-50/80 to-blue-50/50 px-5 py-4 md:px-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Step {currentStepIndex + 1} of {STEP_ORDER.length}</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900">{stepTitle}</h2>
              <p className="mt-1 text-sm text-slate-600">Provide the required information for this step.</p>
              {!isCurrentStepComplete && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  <Circle className="h-3 w-3 fill-amber-500 text-amber-500" />
                  Required fields incomplete
                </p>
              )}
              <WidgetCloseGate>
                <button
                  type="button"
                  onClick={() => void hideWidget(currentStepWidgetKey)}
                  className="mt-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                  aria-label={`Hide ${STEP_LABELS[step]} step widget`}
                >
                  ×
                </button>
              </WidgetCloseGate>
            </div>
            <div className="space-y-6 p-5 md:p-6">
          {!isActiveStepWidgetVisible ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
              Current step widget is hidden. Move to another step or restore hidden widgets.
            </div>
          ) : null}
          {step === "profile" && isActiveStepWidgetVisible && (
            <>
            <div>
              <p className={sectionTitleClass}>Find Existing Customer</p>
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[210px_1fr_auto]">
                  <div>
                    <label className={labelClass}>Search By</label>
                    <select
                      value={customerSearchBy}
                      onChange={(e) => setCustomerSearchBy(e.target.value as "nic_passport" | "passport" | "investment_account_no")}
                      className={inputClass}
                    >
                      <option value="nic_passport">NIC</option>
                      <option value="passport">Passport</option>
                      <option value="investment_account_no">Investment Account No</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Search Value</label>
                    <input
                      value={customerSearchValue}
                      onFocus={() => setShowCustomerSuggestions(true)}
                      onChange={(e) => {
                        setCustomerSearchValue(e.target.value);
                        setShowCustomerSuggestions(true);
                        if (selectedCustomerId) {
                          setSelectedCustomerId(null);
                          setSelectedInvestmentAccountNo("");
                        }
                      }}
                      className={inputClass}
                      placeholder={
                        customerSearchBy === "investment_account_no"
                          ? "Enter investment account no"
                          : customerSearchBy === "passport"
                            ? "Enter passport number"
                            : "Enter NIC"
                      }
                    />
                    {showCustomerSuggestions && (loadingCustomerSuggestions || customerSuggestions.length > 0) && (
                      <div className="relative">
                        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-cyan-200 bg-white shadow-xl">
                          {loadingCustomerSuggestions ? (
                            <div className="px-3 py-2 text-xs text-slate-600">Searching customers...</div>
                          ) : (
                            customerSuggestions.map((match) => {
                              const customer = match.customer;
                              const full = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "N/A";
                              return (
                                <button
                                  key={`mortgage-customer-suggestion-${customer.id}`}
                                  type="button"
                                  onClick={() => selectQuickSuggestion(match)}
                                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-cyan-50"
                                >
                                  <p className="font-semibold text-slate-900">{full}</p>
                                  <p className="mt-0.5 text-slate-600">No: {customer.customer_code || "-"} | NIC: {customer.nic_passport || "-"}</p>
                                  <p className="mt-0.5 text-slate-500">Investment: {match.matched_investment_account_no || "-"}</p>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!token) return;
                      void searchCustomerForMortgage(token);
                    }}
                    disabled={searchingCustomer}
                    className="mt-0 rounded-xl border border-cyan-200 bg-white px-4 py-2.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 disabled:opacity-60 md:mt-7"
                  >
                    {searchingCustomer ? "Searching..." : "Search Customer"}
                  </button>
                </div>

                {selectedCustomerId ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Existing customer selected. Mortgage will be created under this customer account.
                    {selectedInvestmentAccountNo ? ` Investment Account: ${selectedInvestmentAccountNo}` : ""}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <p className={sectionTitleClass}>Selected Customer</p>
              {selectedCustomerId ? (
                <div className="grid grid-cols-1 gap-3 text-sm text-emerald-900 md:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Full Name</p>
                    <p className="font-semibold">{fullName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Customer Code</p>
                    <p className="font-semibold">{fileCode || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">NIC / Passport</p>
                    <p className="font-semibold">{nic || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Date of Birth</p>
                    <p className="font-semibold">{dateOfBirth || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Phone</p>
                    <p className="font-semibold">{mobileNumber || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Email</p>
                    <p className="font-semibold">{email || "-"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-800">
                  Search and select an existing customer to continue.
                </p>
              )}
            </div>
            </>
          )}

          {step === "financial" && isActiveStepWidgetVisible && (
            <>
            <div>
              <p className={sectionTitleClass}>Employment & Income</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Employment Type
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as any)}
                  className={inputClass}
                >
                  <option value="salaried">Salaried</option>
                  <option value="self_employed">Self-employed</option>
                  <option value="business">Business</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Employer / Business Name
                </label>
                <input
                  value={employerName}
                  onChange={(e) => setEmployerName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Job Title / Business Type
                </label>
                <input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Monthly Income
                </label>
                <input
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Other Income Sources
                </label>
                <textarea
                  value={otherIncomeSources}
                  onChange={(e) => setOtherIncomeSources(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            </div>

            <div>
              <p className={sectionTitleClass}>Credit & Risk</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Existing Loans
                </label>
                <select
                  value={existingLoans ? "yes" : "no"}
                  onChange={(e) => setExistingLoans(e.target.value === "yes")}
                  className={inputClass}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Monthly Loan Obligations
                </label>
                <input
                  value={monthlyLoanObligations}
                  onChange={(e) => setMonthlyLoanObligations(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Credit Score (if available)
                </label>
                <input
                  value={creditScore}
                  onChange={(e) => setCreditScore(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Bank Statements (uploads)
                </label>
                <input type="file" multiple />
              </div>
            </div>
            </div>
            </>
          )}

          {step === "coBorrower" && isActiveStepWidgetVisible && (
            <>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm text-slate-600">
              Guarantor details are optional. Leave blank to skip this step, or complete all fields if adding a co-borrower.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Full Name
                </label>
                <input
                  value={coBorrowerName}
                  onChange={(e) => setCoBorrowerName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  NIC / Passport
                </label>
                <input
                  value={coBorrowerNic}
                  onChange={(e) => setCoBorrowerNic(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Relationship to Borrower
                </label>
                <input
                  value={coBorrowerRelationship}
                  onChange={(e) => setCoBorrowerRelationship(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Address
                </label>
                <textarea
                  value={coBorrowerAddress}
                  onChange={(e) => setCoBorrowerAddress(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Contact Number
                </label>
                <input
                  value={coBorrowerContact}
                  onChange={(e) => setCoBorrowerContact(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Income Details (Monthly)
                </label>
                <input
                  value={coBorrowerIncome}
                  onChange={(e) => setCoBorrowerIncome(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            </>
          )}

          {step === "loanCollateral" && isActiveStepWidgetVisible && (
            <>
            <div>
              <p className={sectionTitleClass}>Loan Terms & Repayment</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Requested Amount
                </label>
                <input
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Approved Amount
                </label>
                <input
                  value={approvedAmount}
                  onChange={(e) => setApprovedAmount(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Interest Rate (%)
                </label>
                <input
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Interest Type
                </label>
                <select
                  value={interestType}
                  onChange={(e) => setInterestType(e.target.value as any)}
                  className={inputClass}
                >
                  <option value="fixed">Fixed</option>
                  <option value="reducing">Reducing Balance</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Loan Tenure (months)
                </label>
                <input
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Refund Frequency
                </label>
                <select
                  value={installmentFrequency}
                  onChange={(e) =>
                    setInstallmentFrequency(e.target.value as any)
                  }
                  className={inputClass}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Interest Calculation Frequency
                </label>
                <select
                  value={interestCalculationFrequency}
                  onChange={(e) =>
                    setInterestCalculationFrequency(e.target.value as any)
                  }
                  className={inputClass}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Processing Fee
                </label>
                <input
                  value={processingFee}
                  onChange={(e) => setProcessingFee(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Insurance Fee
                </label>
                <input
                  value={insuranceFee}
                  onChange={(e) => setInsuranceFee(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Penalty Rate (%)
                </label>
                <input
                  value={penaltyRate}
                  onChange={(e) => setPenaltyRate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            </div>

            <div>
              <p className={sectionTitleClass}>Collateral Details</p>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Collateral Type
                  </label>
                  <select
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value as any)}
                    className={inputClass}
                  >
                    {["land", "house", "vehicle", "gold", "other"].map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    Ownership Type
                  </label>
                  <select
                    value={ownershipType}
                    onChange={(e) => setOwnershipType(e.target.value as any)}
                    className={inputClass}
                  >
                    <option value="single">Single</option>
                    <option value="joint">Joint</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  Asset Description
                </label>
                <textarea
                  value={assetDescription}
                  onChange={(e) => setAssetDescription(e.target.value)}
                  className={inputClass}
                />
              </div>

              <p className={sectionTitleClass}>Legal Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Deed Number
                  </label>
                  <input
                    value={deedNumber}
                    onChange={(e) => setDeedNumber(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Deed Date
                  </label>
                  <input
                    type="date"
                    value={deedDate}
                    onChange={(e) => setDeedDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Survey Plan Number
                  </label>
                  <input
                    value={surveyPlanNumber}
                    onChange={(e) => setSurveyPlanNumber(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Registration Office
                  </label>
                  <input
                    value={registrationOffice}
                    onChange={(e) => setRegistrationOffice(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    Lawyer Name
                  </label>
                  <input
                    value={lawyerName}
                    onChange={(e) => setLawyerName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <p className={sectionTitleClass}>Valuation Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Market Value
                  </label>
                  <input
                    value={marketValue}
                    onChange={(e) => setMarketValue(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Forced Sale Value
                  </label>
                  <input
                    value={forcedSaleValue}
                    onChange={(e) => setForcedSaleValue(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Valuation Date
                  </label>
                  <input
                    type="date"
                    value={valuationDate}
                    onChange={(e) => setValuationDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Valuer Name
                  </label>
                  <input
                    value={valuerName}
                    onChange={(e) => setValuerName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <p className={sectionTitleClass}>Physical Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Address / Location
                  </label>
                  <input
                    value={assetAddress}
                    onChange={(e) => setAssetAddress(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Land Size / Building Area
                  </label>
                  <input
                    value={landSizeOrBuildingArea}
                    onChange={(e) => setLandSizeOrBuildingArea(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    Boundaries / Identification marks
                  </label>
                  <textarea
                    value={boundaries}
                    onChange={(e) => setBoundaries(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {assetType === "vehicle" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>
                      Registration Number
                    </label>
                    <input
                      value={vehicleRegNo}
                      onChange={(e) => setVehicleRegNo(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Engine Number
                    </label>
                    <input
                      value={vehicleEngineNo}
                      onChange={(e) => setVehicleEngineNo(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Chassis Number
                    </label>
                    <input
                      value={vehicleChassisNo}
                      onChange={(e) => setVehicleChassisNo(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Manufacture Year
                    </label>
                    <input
                      value={vehicleManufactureYear}
                      onChange={(e) => setVehicleManufactureYear(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
            </div>
            </div>
            </>
          )}

          {step === "documentsReview" && isActiveStepWidgetVisible && (
            <div className="space-y-6">
              <p className={sectionTitleClass}>Customer Documents</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    NIC / Passport copy
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setCustomerDocuments((prev) => [
                        ...prev,
                        { type: "nic_passport", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Address verification
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setCustomerDocuments((prev) => [
                        ...prev,
                        {
                          type: "address_verification",
                          file: e.target.files![0],
                        },
                      ])
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Salary slips (last 3 months)
                  </label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setCustomerDocuments((prev) => [
                        ...prev,
                        ...files.map((f) => ({ type: "salary_slip", file: f })),
                      ]);
                    }}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Bank statements
                  </label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setCustomerDocuments((prev) => [
                        ...prev,
                        ...files.map((f) => ({ type: "bank_statement", file: f })),
                      ]);
                    }}
                  />
                </div>
              </div>

              <p className={sectionTitleClass}>Mortgage Asset Documents</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Deed copy
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setAssetDocuments((prev) => [
                        ...prev,
                        { type: "deed_copy", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Survey plan
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setAssetDocuments((prev) => [
                        ...prev,
                        { type: "survey_plan", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Valuation report
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setAssetDocuments((prev) => [
                        ...prev,
                        { type: "valuation_report", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Insurance policy
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setAssetDocuments((prev) => [
                        ...prev,
                        { type: "insurance_policy", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
              </div>

              <p className={sectionTitleClass}>Legal & Internal Docs</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Mortgage agreement (PDF)
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setLegalDocuments((prev) => [
                        ...prev,
                        { type: "mortgage_agreement", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Approval note
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setLegalDocuments((prev) => [
                        ...prev,
                        { type: "approval_note", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Release letter (after settlement)
                  </label>
                  <input
                    type="file"
                    onChange={(e) =>
                      e.target.files &&
                      setLegalDocuments((prev) => [
                        ...prev,
                        { type: "release_letter", file: e.target.files![0] },
                      ])
                    }
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50/60 p-5">
                <p className="text-sm font-extrabold text-slate-900">Ready to submit</p>
                <p className="mt-1 text-sm text-slate-600">
                  Review customer, loan, collateral, and uploaded documents before submitting for approval.
                </p>
                <p className="mt-3 text-xs font-semibold text-cyan-800">
                  {progressStats.totalDocs} document{progressStats.totalDocs === 1 ? "" : "s"} attached
                </p>
              </div>
            </div>
          )}
            </div>
          </section>
          ) : null}

          {showActionBarWidget ? (
          <section className="relative flex flex-col gap-3 rounded-3xl border border-white/90 bg-white/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <WidgetCloseGate>
              <button
                type="button"
                onClick={() => void hideWidget(`${widgetPrefix}actions`)}
                className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                aria-label="Hide step action bar widget"
              >
                ×
              </button>
            </WidgetCloseGate>
            <button
              type="button"
              onClick={prevStep}
              disabled={isSubmitting || currentStepIndex === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            {step === "documentsReview" ? (
              <button
                type="button"
                onClick={requestSubmit}
                disabled={isSubmitting || !isCurrentStepComplete}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-cyan-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit Application"}
                <CheckCircle2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={nextStep}
                disabled={isSubmitting || !isCurrentStepComplete}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-cyan-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next Step
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </section>
          ) : null}
        </div>

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-2xl">
              <div className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 px-6 py-4">
                <h3 className="text-lg font-extrabold text-slate-900">{modalTitle}</h3>
              </div>
              <div className="px-6 py-4">
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{modalMessage}</p>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                {modalKind === "confirm" ? (
                  <>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        closeModal();
                        await handleSubmit();
                      }}
                      className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                    >
                      Confirm Submit
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  >
                    OK
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientMountGate>
  );
}
