'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Banknote, Calculator, Car, Check, FileText, Plus, Shield, User, X } from 'lucide-react';

type ProductTypeRow = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  interest_rate?: number | string | null;
  interest_type?: 'fixed' | 'reducing' | null;
  tenure_months?: number | null;
  installment_frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;
};
function isRemovedProductTypeName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  return normalized === 'hirepurchase'
    || normalized === 'loan'
    || normalized === 'hirepurchaseloan'
    || normalized === 'hirepurcheseloan';
}

type GuarantorInput = {
  name: string;
  nic: string;
  phone: string;
  address: string;
};

type RepaymentInstallmentRow = {
  installment_no: number;
  payment_date: string;
  amount: string;
};

type InterestRatePeriod = 'yearly' | 'monthly';

function toAnnualRatePercent(ratePercent: number, period: InterestRatePeriod): number {
  if (!Number.isFinite(ratePercent)) return NaN;
  return period === 'monthly' ? ratePercent * 12 : ratePercent;
}

function toMonthlyRatePercent(ratePercent: number, period: InterestRatePeriod): number {
  if (!Number.isFinite(ratePercent)) return NaN;
  return period === 'monthly' ? ratePercent : ratePercent / 12;
}

function formatRatePercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function formatAmount(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputClass =
  'w-full rounded-xl border border-cyan-200/80 bg-white/90 px-3 py-2 text-[13px] font-medium text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/80 [color-scheme:light]';

const inputClassSm =
  'w-full rounded-lg border border-cyan-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200/80 [color-scheme:light]';

function SectionHeader({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-cyan-100/90 bg-gradient-to-r from-cyan-50 via-white to-blue-50/70 px-4 py-2.5 shadow-[0_8px_24px_rgba(8,145,178,0.08)]">
      {Icon ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-100 bg-white/95 text-cyan-700 shadow-sm">
          <Icon className="h-4.5 w-4.5" />
        </div>
      ) : null}
      <div>
        <p className="text-[13px] font-bold tracking-tight text-slate-900">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function RatePeriodToggle({
  value,
  onChange,
}: {
  value: InterestRatePeriod;
  onChange: (period: InterestRatePeriod) => void;
}) {
  return (
    <div className="inline-flex w-full sm:w-auto rounded-xl border border-cyan-200 bg-cyan-50/60 p-1 shadow-inner">
      {(['yearly', 'monthly'] as const).map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => onChange(period)}
          className={`flex-1 sm:flex-none rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            value === period
              ? 'bg-white text-cyan-900 shadow-sm border border-cyan-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {period === 'yearly' ? 'Yearly (%)' : 'Monthly (%)'}
        </button>
      ))}
    </div>
  );
}

type CustomerDetail = {
  id: number;
  customer_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nic_passport?: string | null;
  passport_no?: string | null;
  date_of_birth?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  marital_status?: 'single' | 'married' | 'divorced' | 'widowed' | null;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  employment_type?: 'salaried' | 'self_employed' | 'business' | null;
  employer_name?: string | null;
  job_title?: string | null;
  monthly_income?: number | string | null;
  other_income_sources?: string | null;
  existing_loans?: boolean | null;
  monthly_loan_obligations?: number | string | null;
  credit_score?: number | string | null;
};

type FinanceCustomerSearchMatch = {
  customer: CustomerDetail;
  matched_by?: string[];
  matched_investment_account_no?: string | null;
  matched_savings_account_no?: string | null;
};

type BranchManagerOption = {
  user_id?: number | null;
  employee_id?: number | null;
  name: string;
  employee_code?: string;
  designation?: string;
};

type ResponsibleOfficerOption = {
  id: number;
  name: string;
  employee_code?: string;
  designation?: string;
};

type FinanceIssueDraftSnapshot = {
  registerStep: number;
  regCustomerNo: string;
  regCustomerSearchBy: 'nic_passport' | 'passport' | 'investment_account_no';
  regCustomerSearchValue: string;
  regMatchedInvestmentAccountNo: string;
  regFinanceType: string;
  regProductType: string;
  regStartDate: string;
  regResponsibleOfficerId: string;
  regInterestRate: string;
  regInterestRatePeriod: InterestRatePeriod;
  regInterestType: 'fixed' | 'reducing';
  regTenureMonths: string;
  regFrequency: string;
  regScheduleMode: 'auto' | 'fixed_day' | 'custom_date';
  regFirstInstallmentDate: string;
  regCollectionDayOfMonth: string;
  regGraceDays: string;
  regInstallmentMode: 'auto' | 'manual';
  regManualInstallmentAmount: string;
  regInstallmentPlan: RepaymentInstallmentRow[];
  regVehicleNo: string;
  regChassisNo: string;
  regEngineNo: string;
  regMakeModel: string;
  regVehicleYear: string;
  regAssetRef: string;
  regAmount: string;
  regLoanAmount: string;
  regLoanDetails: string;
  regDraftValue: string;
  regDownPayment: string;
  regValuationAmount: string;
  regValuationDate: string;
  regValuerName: string;
  regGuarantors: GuarantorInput[];
  regFamilyMembersCount: string;
  regDependentsCount: string;
  regEmploymentType: string;
  regMainIncomeSource: string;
  regMonthlyHouseholdIncome: string;
  regMonthlyHouseholdExpenses: string;
  regExistingLoanCommitments: string;
  regBankingRelationship: string;
  regFamilyFinancialNotes: string;
  regEvaluationIncomeActivities: string[];
  regEvaluationBusiness1: string;
  regEvaluationBusiness1MonthlyIncome: string;
  regEvaluationBusiness2: string;
  regEvaluationBusiness2MonthlyIncome: string;
  regEvaluationLoanReason: string;
  regEvaluationHouseOwnership: string;
  regEvaluationWallMaterial: string;
  regEvaluationFloorMaterial: string;
  regEvaluationRoofMaterial: string;
  regEvaluationVehicleAssets: string;
  regEvaluationOtherLoansDetails: string;
  regEvaluationOtherLoansMonthlyInstallment: string;
  regEvaluationLeasingDetails: string;
  regEvaluationLeasingMonthlyInstallment: string;
  regEvaluationOtherLiabilities: string;
  regEvaluationFamilyExpenseBreakdown: Record<string, string>;
  regEvaluationBusinessExpenseBreakdown: Record<string, string>;
  regEvaluationFamilyIncomeWithoutBusiness: string;
  regEvaluationFamilyIncomeItem1: string;
  regEvaluationFamilyIncomeItem2: string;
  regEvaluationFamilyIncomeItem3: string;
  regEvaluationWageEarner1Name: string;
  regEvaluationWageEarner1Salary: string;
  regEvaluationWageEarner2Name: string;
  regEvaluationWageEarner2Salary: string;
  regEvaluationWageEarner3Name: string;
  regEvaluationWageEarner3Salary: string;
  regEvaluationRentOutHouse: string;
  regEvaluationRentOutVehicle: string;
  regEvaluationInterestCommission: string;
  regEvaluationOtherIncome: string;
  regEvaluationBusiness1UnitPrice: string;
  regEvaluationBusiness1Units: string;
  regEvaluationBusiness2UnitPrice: string;
  regEvaluationBusiness2Units: string;
  regEvaluationRecommendation: string;
  vehicleImageNames: string[];
  residenceImageNames: string[];
  vehicleCrFileName: string;
  documentNames: string[];
};

type FinanceIssueDraft = {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  snapshot: FinanceIssueDraftSnapshot;
};

const FINANCE_ISSUE_DRAFTS_KEY = 'finance_issue_wizard_drafts_v1';

function isCustomerDetail(value: unknown): value is CustomerDetail {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'number';
}

export default function IssueFinancePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [productTypes, setProductTypes] = useState<ProductTypeRow[]>([]);

  const [registerStep, setRegisterStep] = useState(1);
  const [savingRegister, setSavingRegister] = useState(false);
  const [regCustomerNo, setRegCustomerNo] = useState('');
  const [regFinanceType, setRegFinanceType] = useState('vehicle');
  const [regProductType, setRegProductType] = useState('');
  const [regStartDate, setRegStartDate] = useState('');
  const [regResponsibleOfficerId, setRegResponsibleOfficerId] = useState('');
  const [branchManagerOption, setBranchManagerOption] = useState<BranchManagerOption | null>(null);
  const [responsibleOfficerOptions, setResponsibleOfficerOptions] = useState<ResponsibleOfficerOption[]>([]);
  const [regInterestRate, setRegInterestRate] = useState('18');
  const [regInterestRatePeriod, setRegInterestRatePeriod] = useState<InterestRatePeriod>('yearly');
  const [regInterestType, setRegInterestType] = useState<'fixed' | 'reducing'>('fixed');
  const [regTenureMonths, setRegTenureMonths] = useState('36');
  const [regFrequency, setRegFrequency] = useState('monthly');
  const [regScheduleMode, setRegScheduleMode] = useState<'auto' | 'fixed_day' | 'custom_date'>('auto');
  const [regFirstInstallmentDate, setRegFirstInstallmentDate] = useState('');
  const [regCollectionDayOfMonth, setRegCollectionDayOfMonth] = useState('1');
  const [regGraceDays, setRegGraceDays] = useState('0');
  const [regInstallmentMode, setRegInstallmentMode] = useState<'auto' | 'manual'>('auto');
  const [regManualInstallmentAmount, setRegManualInstallmentAmount] = useState('');
  const [regInstallmentPlan, setRegInstallmentPlan] = useState<RepaymentInstallmentRow[]>([]);
  const [regYear1Amount, setRegYear1Amount] = useState('');
  const [regYear2Amount, setRegYear2Amount] = useState('');
  const [regYear3PlusAmount, setRegYear3PlusAmount] = useState('');
  const [regBulkRegularAmount, setRegBulkRegularAmount] = useState('');
  const [regBulkLastAmount, setRegBulkLastAmount] = useState('');

  const [regVehicleNo, setRegVehicleNo] = useState('');
  const [regChassisNo, setRegChassisNo] = useState('');
  const [regEngineNo, setRegEngineNo] = useState('');
  const [regMakeModel, setRegMakeModel] = useState('');
  const [regVehicleYear, setRegVehicleYear] = useState('');
  const [regAssetRef, setRegAssetRef] = useState('');
  const [regAmount, setRegAmount] = useState('');
  const [regLoanAmount, setRegLoanAmount] = useState('');
  const [regLoanDetails, setRegLoanDetails] = useState('');
  const [regDraftValue, setRegDraftValue] = useState('');
  const [regDownPayment, setRegDownPayment] = useState('');
  const [regValuationAmount, setRegValuationAmount] = useState('');
  const [regValuationDate, setRegValuationDate] = useState('');
  const [regValuerName, setRegValuerName] = useState('');

  const [regGuarantors, setRegGuarantors] = useState<GuarantorInput[]>([
    { name: '', nic: '', phone: '', address: '' },
  ]);

  const [regVehicleImages, setRegVehicleImages] = useState<File[]>([]);
  const [regVehicleCrFile, setRegVehicleCrFile] = useState<File | null>(null);
  const [regResidenceImages, setRegResidenceImages] = useState<File[]>([]);
  const [regFamilyMembersCount, setRegFamilyMembersCount] = useState('');
  const [regDependentsCount, setRegDependentsCount] = useState('');
  const [regEmploymentType, setRegEmploymentType] = useState('');
  const [regMainIncomeSource, setRegMainIncomeSource] = useState('');
  const [regMonthlyHouseholdIncome, setRegMonthlyHouseholdIncome] = useState('');
  const [regMonthlyHouseholdExpenses, setRegMonthlyHouseholdExpenses] = useState('');
  const [regExistingLoanCommitments, setRegExistingLoanCommitments] = useState('');
  const [regBankingRelationship, setRegBankingRelationship] = useState('');
  const [regFamilyFinancialNotes, setRegFamilyFinancialNotes] = useState('');
  const [regEvaluationIncomeActivities, setRegEvaluationIncomeActivities] = useState<string[]>([]);
  const [regEvaluationBusiness1, setRegEvaluationBusiness1] = useState('');
  const [regEvaluationBusiness1MonthlyIncome, setRegEvaluationBusiness1MonthlyIncome] = useState('');
  const [regEvaluationBusiness2, setRegEvaluationBusiness2] = useState('');
  const [regEvaluationBusiness2MonthlyIncome, setRegEvaluationBusiness2MonthlyIncome] = useState('');
  const [regEvaluationLoanReason, setRegEvaluationLoanReason] = useState('');
  const [regEvaluationHouseOwnership, setRegEvaluationHouseOwnership] = useState('');
  const [regEvaluationWallMaterial, setRegEvaluationWallMaterial] = useState('');
  const [regEvaluationFloorMaterial, setRegEvaluationFloorMaterial] = useState('');
  const [regEvaluationRoofMaterial, setRegEvaluationRoofMaterial] = useState('');
  const [regEvaluationVehicleAssets, setRegEvaluationVehicleAssets] = useState('');
  const [regEvaluationOtherLoansDetails, setRegEvaluationOtherLoansDetails] = useState('');
  const [regEvaluationOtherLoansMonthlyInstallment, setRegEvaluationOtherLoansMonthlyInstallment] = useState('');
  const [regEvaluationLeasingDetails, setRegEvaluationLeasingDetails] = useState('');
  const [regEvaluationLeasingMonthlyInstallment, setRegEvaluationLeasingMonthlyInstallment] = useState('');
  const [regEvaluationOtherLiabilities, setRegEvaluationOtherLiabilities] = useState('');
  const [regEvaluationFamilyExpenseBreakdown, setRegEvaluationFamilyExpenseBreakdown] = useState<Record<string, string>>({});
  const [regEvaluationBusinessExpenseBreakdown, setRegEvaluationBusinessExpenseBreakdown] = useState<Record<string, string>>({});
  const [regEvaluationFamilyIncomeWithoutBusiness, setRegEvaluationFamilyIncomeWithoutBusiness] = useState('');
  const [regEvaluationFamilyIncomeItem1, setRegEvaluationFamilyIncomeItem1] = useState('');
  const [regEvaluationFamilyIncomeItem2, setRegEvaluationFamilyIncomeItem2] = useState('');
  const [regEvaluationFamilyIncomeItem3, setRegEvaluationFamilyIncomeItem3] = useState('');
  const [regEvaluationWageEarner1Name, setRegEvaluationWageEarner1Name] = useState('');
  const [regEvaluationWageEarner1Salary, setRegEvaluationWageEarner1Salary] = useState('');
  const [regEvaluationWageEarner2Name, setRegEvaluationWageEarner2Name] = useState('');
  const [regEvaluationWageEarner2Salary, setRegEvaluationWageEarner2Salary] = useState('');
  const [regEvaluationWageEarner3Name, setRegEvaluationWageEarner3Name] = useState('');
  const [regEvaluationWageEarner3Salary, setRegEvaluationWageEarner3Salary] = useState('');
  const [regEvaluationRentOutHouse, setRegEvaluationRentOutHouse] = useState('');
  const [regEvaluationRentOutVehicle, setRegEvaluationRentOutVehicle] = useState('');
  const [regEvaluationInterestCommission, setRegEvaluationInterestCommission] = useState('');
  const [regEvaluationOtherIncome, setRegEvaluationOtherIncome] = useState('');
  const [regEvaluationBusiness1UnitPrice, setRegEvaluationBusiness1UnitPrice] = useState('');
  const [regEvaluationBusiness1Units, setRegEvaluationBusiness1Units] = useState('');
  const [regEvaluationBusiness2UnitPrice, setRegEvaluationBusiness2UnitPrice] = useState('');
  const [regEvaluationBusiness2Units, setRegEvaluationBusiness2Units] = useState('');
  const [regEvaluationRecommendation, setRegEvaluationRecommendation] = useState('');
  const [regDocuments, setRegDocuments] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [regCustomerSearchBy, setRegCustomerSearchBy] = useState<'nic_passport' | 'passport' | 'investment_account_no'>('nic_passport');
  const [regCustomerSearchValue, setRegCustomerSearchValue] = useState('');
  const [regMatchedInvestmentAccountNo, setRegMatchedInvestmentAccountNo] = useState('');
  const [loadingCustomerSuggestions, setLoadingCustomerSuggestions] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<FinanceCustomerSearchMatch[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [showAdvancedCustomerSearch, setShowAdvancedCustomerSearch] = useState(false);
  const [advancedSearchNic, setAdvancedSearchNic] = useState('');
  const [advancedSearchPassport, setAdvancedSearchPassport] = useState('');
  const [advancedSearchInvestmentAccountNo, setAdvancedSearchInvestmentAccountNo] = useState('');
  const [advancedSearchCustomerNo, setAdvancedSearchCustomerNo] = useState('');
  const [advancedSearchName, setAdvancedSearchName] = useState('');
  const [advancedSearchPhone, setAdvancedSearchPhone] = useState('');
  const [advancedSearchMatches, setAdvancedSearchMatches] = useState<FinanceCustomerSearchMatch[]>([]);
  const [regCustomerDetail, setRegCustomerDetail] = useState<CustomerDetail | null>(null);
  const [showInterestTerms, setShowInterestTerms] = useState(false);
  const [showProductTypeModal, setShowProductTypeModal] = useState(false);
  const [newProductTypeName, setNewProductTypeName] = useState('');
  const [newProductTypeDescription, setNewProductTypeDescription] = useState('');
  const [newProductInterestRate, setNewProductInterestRate] = useState('18');
  const [newProductInterestRatePeriod, setNewProductInterestRatePeriod] = useState<InterestRatePeriod>('yearly');
  const [newProductInterestType, setNewProductInterestType] = useState<'fixed' | 'reducing'>('fixed');
  const [newProductTenureMonths, setNewProductTenureMonths] = useState('36');
  const [newProductFrequency, setNewProductFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [showNewProductInterestTerms, setShowNewProductInterestTerms] = useState(false);
  const [savingProductType, setSavingProductType] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState('');
  const [savedDrafts, setSavedDrafts] = useState<FinanceIssueDraft[]>([]);

  const wizardStep3Label = regFinanceType === 'other'
    ? 'Loan'
    : regFinanceType === 'equipment'
      ? 'Equipment'
      : 'Vehicle';

  const wizardSteps = [
    { id: 1, label: 'Basic', hint: 'Product setup and finance terms' },
    { id: 2, label: 'Customer', hint: 'Load and verify customer profile' },
    { id: 3, label: wizardStep3Label, hint: `${wizardStep3Label} and valuation details` },
    { id: 4, label: 'Guarantor', hint: 'Security party details' },
    { id: 5, label: 'Repayment', hint: 'Repayment plan and scheduling' },
    { id: 6, label: 'Family & Financial', hint: 'Household and financial profile' },
    { id: 7, label: 'Residence Images', hint: 'Residence environment photos' },
    { id: 8, label: 'Evaluation', hint: 'Income, liabilities, and recommendation' },
    { id: 9, label: 'Documents', hint: 'Supporting files upload' },
  ];

  const activeWizardStep = useMemo(
    () => wizardSteps.find((s) => s.id === registerStep) ?? wizardSteps[0],
    [registerStep],
  );
  const isDraftLoanSelected = useMemo(() => {
    const normalized = String(regProductType || '')
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized.includes('draft');
  }, [regProductType]);
  const isLoanProductSelected = useMemo(() => {
    const normalized = String(regProductType || '')
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized.includes('loan');
  }, [regProductType]);
  const visibleWizardSteps = useMemo(
    () => wizardSteps.filter((step) => !(isDraftLoanSelected && step.id === 5)),
    [wizardSteps, isDraftLoanSelected],
  );
  const activeWizardIndex = useMemo(
    () => Math.max(0, visibleWizardSteps.findIndex((step) => step.id === registerStep)),
    [visibleWizardSteps, registerStep],
  );
  const progressPercent = useMemo(
    () => ((activeWizardIndex + 1) / Math.max(visibleWizardSteps.length, 1)) * 100,
    [activeWizardIndex, visibleWizardSteps.length],
  );
  const isVehicleFinanceSelected = regFinanceType === 'vehicle';
  const isOtherFinanceSelected = regFinanceType === 'other';
  const effectiveAmountInput = isOtherFinanceSelected ? regLoanAmount : regAmount;
  const financedPreview = useMemo(() => {
    const asset = Number(effectiveAmountInput);
    const down = Number(regDownPayment || 0);
    if (!Number.isFinite(asset) || asset <= 0) return null;
    if (!Number.isFinite(down) || down < 0) return null;
    return Math.max(asset - down, 0);
  }, [effectiveAmountInput, regDownPayment]);

  const incomeGenerationActivityOptions = [
    'Trading',
    'Service',
    'Daily Work',
    'Agriculture',
    'Other',
  ];

  const familyExpenseRows = [
    { no: '1.1', key: 'foods', label: 'Foods' },
    { no: '1.2', key: 'electricity', label: 'Electricity' },
    { no: '1.3', key: 'water', label: 'Water' },
    { no: '1.4', key: 'gas', label: 'Gas' },
    { no: '1.5', key: 'clothes', label: 'Clothes' },
    { no: '1.6', key: 'mobile_telephone', label: 'Mobile Telephone' },
    { no: '1.7', key: 'television', label: 'Television' },
    { no: '1.8', key: 'transport', label: 'Transport' },
    { no: '1.9', key: 'education', label: 'Education' },
    { no: '1.10', key: 'entertainment', label: 'Entertainment' },
    { no: '1.11', key: 'family_expenses_other', label: 'Family Expenses - Other' },
  ] as const;

  const businessExpenseRows = [
    { no: '3.1', key: 'business_purchase', label: 'Business Purchase' },
    { no: '3.2', key: 'salaries', label: 'Salaries' },
    { no: '3.3', key: 'business_rent', label: 'Business Rent' },
    { no: '3.4', key: 'utilities', label: 'Utilities' },
    { no: '3.5', key: 'transport', label: 'Transport' },
  ] as const;

  const evaluationNumber = (value: string): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const updateFamilyExpenseValue = (key: string, value: string) => {
    setRegEvaluationFamilyExpenseBreakdown((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateBusinessExpenseValue = (key: string, value: string) => {
    setRegEvaluationBusinessExpenseBreakdown((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const familyExpenseTotal = familyExpenseRows.reduce((sum, row) => (
    sum + evaluationNumber(regEvaluationFamilyExpenseBreakdown[row.key] || '')
  ), 0);

  const businessExpenseTotal = businessExpenseRows.reduce((sum, row) => (
    sum + evaluationNumber(regEvaluationBusinessExpenseBreakdown[row.key] || '')
  ), 0);

  const familyWageContributionTotal =
    evaluationNumber(regEvaluationWageEarner1Salary)
    + evaluationNumber(regEvaluationWageEarner2Salary)
    + evaluationNumber(regEvaluationWageEarner3Salary);

  const businessIncome1 = evaluationNumber(regEvaluationBusiness1UnitPrice) * evaluationNumber(regEvaluationBusiness1Units);
  const businessIncome2 = evaluationNumber(regEvaluationBusiness2UnitPrice) * evaluationNumber(regEvaluationBusiness2Units);
  const businessIncomeTotal = businessIncome1 + businessIncome2;

  const familyIncomeTotal =
    evaluationNumber(regEvaluationFamilyIncomeWithoutBusiness)
    + evaluationNumber(regEvaluationFamilyIncomeItem1)
    + evaluationNumber(regEvaluationFamilyIncomeItem2)
    + evaluationNumber(regEvaluationFamilyIncomeItem3)
    + familyWageContributionTotal
    + evaluationNumber(regEvaluationRentOutHouse)
    + evaluationNumber(regEvaluationRentOutVehicle)
    + evaluationNumber(regEvaluationInterestCommission)
    + evaluationNumber(regEvaluationOtherIncome);

  const totalIncomeWithBusiness = familyIncomeTotal + businessIncomeTotal;
  const loanAndLeasingTotal =
    evaluationNumber(regEvaluationOtherLoansMonthlyInstallment)
    + evaluationNumber(regEvaluationLeasingMonthlyInstallment);
  const loanPaymentsAndFamilyExpensesTotal = familyExpenseTotal + loanAndLeasingTotal;
  const remainingCashWithFamily = totalIncomeWithBusiness - loanPaymentsAndFamilyExpensesTotal;
  const averageCashPerWeek = remainingCashWithFamily / 4;

  const persistDraftsToStorage = (drafts: FinanceIssueDraft[]) => {
    try {
      localStorage.setItem(FINANCE_ISSUE_DRAFTS_KEY, JSON.stringify(drafts));
    } catch {
      // ignore local storage failures
    }
  };

  const buildDraftSnapshot = (): FinanceIssueDraftSnapshot => ({
    registerStep,
    regCustomerNo,
    regCustomerSearchBy,
    regCustomerSearchValue,
    regMatchedInvestmentAccountNo,
    regFinanceType,
    regProductType,
    regStartDate,
    regResponsibleOfficerId,
    regInterestRate,
    regInterestRatePeriod,
    regInterestType,
    regTenureMonths,
    regFrequency,
    regScheduleMode,
    regFirstInstallmentDate,
    regCollectionDayOfMonth,
    regGraceDays,
    regInstallmentMode,
    regManualInstallmentAmount,
    regInstallmentPlan,
    regVehicleNo,
    regChassisNo,
    regEngineNo,
    regMakeModel,
    regVehicleYear,
    regAssetRef,
    regAmount,
    regLoanAmount,
    regLoanDetails,
    regDraftValue,
    regDownPayment,
    regValuationAmount,
    regValuationDate,
    regValuerName,
    regGuarantors,
    regFamilyMembersCount,
    regDependentsCount,
    regEmploymentType,
    regMainIncomeSource,
    regMonthlyHouseholdIncome,
    regMonthlyHouseholdExpenses,
    regExistingLoanCommitments,
    regBankingRelationship,
    regFamilyFinancialNotes,
    regEvaluationIncomeActivities,
    regEvaluationBusiness1,
    regEvaluationBusiness1MonthlyIncome,
    regEvaluationBusiness2,
    regEvaluationBusiness2MonthlyIncome,
    regEvaluationLoanReason,
    regEvaluationHouseOwnership,
    regEvaluationWallMaterial,
    regEvaluationFloorMaterial,
    regEvaluationRoofMaterial,
    regEvaluationVehicleAssets,
    regEvaluationOtherLoansDetails,
    regEvaluationOtherLoansMonthlyInstallment,
    regEvaluationLeasingDetails,
    regEvaluationLeasingMonthlyInstallment,
    regEvaluationOtherLiabilities,
    regEvaluationFamilyExpenseBreakdown,
    regEvaluationBusinessExpenseBreakdown,
    regEvaluationFamilyIncomeWithoutBusiness,
    regEvaluationFamilyIncomeItem1,
    regEvaluationFamilyIncomeItem2,
    regEvaluationFamilyIncomeItem3,
    regEvaluationWageEarner1Name,
    regEvaluationWageEarner1Salary,
    regEvaluationWageEarner2Name,
    regEvaluationWageEarner2Salary,
    regEvaluationWageEarner3Name,
    regEvaluationWageEarner3Salary,
    regEvaluationRentOutHouse,
    regEvaluationRentOutVehicle,
    regEvaluationInterestCommission,
    regEvaluationOtherIncome,
    regEvaluationBusiness1UnitPrice,
    regEvaluationBusiness1Units,
    regEvaluationBusiness2UnitPrice,
    regEvaluationBusiness2Units,
    regEvaluationRecommendation,
    vehicleImageNames: regVehicleImages.map((file) => file.name),
    residenceImageNames: regResidenceImages.map((file) => file.name),
    vehicleCrFileName: regVehicleCrFile?.name || '',
    documentNames: regDocuments.map((file) => file.name),
  });

  const saveCurrentDraft = () => {
    if (!regCustomerSearchValue.trim() && !regCustomerNo.trim() && !regProductType.trim()) {
      return;
    }

    const now = new Date().toISOString();
    const labelBase = regCustomerNo.trim() || regCustomerSearchValue.trim() || 'Unidentified customer';
    const label = `${labelBase} - ${regProductType || 'Finance Draft'}`;
    const snapshot = buildDraftSnapshot();

    const nextDraft: FinanceIssueDraft = {
      id: activeDraftId || `draft-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      label,
      snapshot,
    };

    setSavedDrafts((prev) => {
      const existing = prev.find((draft) => draft.id === nextDraft.id);
      const merged = existing
        ? prev.map((draft) => (draft.id === nextDraft.id ? { ...nextDraft, createdAt: existing.createdAt } : draft))
        : [nextDraft, ...prev];
      persistDraftsToStorage(merged);
      return merged;
    });

    setActiveDraftId(nextDraft.id);
  };

  const loadDraftToForm = (draft: FinanceIssueDraft) => {
    const d = draft.snapshot;
    setActiveDraftId(draft.id);
    setRegisterStep(d.registerStep || 1);
    setRegCustomerNo(d.regCustomerNo || '');
    setRegCustomerSearchBy(d.regCustomerSearchBy || 'nic_passport');
    setRegCustomerSearchValue(d.regCustomerSearchValue || '');
    setRegMatchedInvestmentAccountNo(d.regMatchedInvestmentAccountNo || '');
    setRegFinanceType(d.regFinanceType || 'vehicle');
    setRegProductType(d.regProductType || '');
    setRegStartDate(d.regStartDate || '');
    setRegResponsibleOfficerId(d.regResponsibleOfficerId || '');
    setRegInterestRate(d.regInterestRate || '18');
    setRegInterestRatePeriod(d.regInterestRatePeriod || 'yearly');
    setRegInterestType(d.regInterestType || 'fixed');
    setRegTenureMonths(d.regTenureMonths || '36');
    setRegFrequency(d.regFrequency || 'monthly');
    setRegScheduleMode(d.regScheduleMode || 'auto');
    setRegFirstInstallmentDate(d.regFirstInstallmentDate || '');
    setRegCollectionDayOfMonth(d.regCollectionDayOfMonth || '1');
    setRegGraceDays(d.regGraceDays || '0');
    setRegInstallmentMode(d.regInstallmentMode || 'auto');
    setRegManualInstallmentAmount(d.regManualInstallmentAmount || '');
    setRegInstallmentPlan(Array.isArray(d.regInstallmentPlan) ? d.regInstallmentPlan : []);
    setRegVehicleNo(d.regVehicleNo || '');
    setRegChassisNo(d.regChassisNo || '');
    setRegEngineNo(d.regEngineNo || '');
    setRegMakeModel(d.regMakeModel || '');
    setRegVehicleYear(d.regVehicleYear || '');
    setRegAssetRef(d.regAssetRef || '');
    setRegAmount(d.regAmount || '');
    setRegLoanAmount(d.regLoanAmount || '');
    setRegLoanDetails(d.regLoanDetails || '');
    setRegDraftValue(d.regDraftValue || '');
    setRegDownPayment(d.regDownPayment || '');
    setRegValuationAmount(d.regValuationAmount || '');
    setRegValuationDate(d.regValuationDate || '');
    setRegValuerName(d.regValuerName || '');
    setRegGuarantors(Array.isArray(d.regGuarantors) && d.regGuarantors.length > 0 ? d.regGuarantors : [{ name: '', nic: '', phone: '', address: '' }]);
    setRegFamilyMembersCount(d.regFamilyMembersCount || '');
    setRegDependentsCount(d.regDependentsCount || '');
    setRegEmploymentType(d.regEmploymentType || '');
    setRegMainIncomeSource(d.regMainIncomeSource || '');
    setRegMonthlyHouseholdIncome(d.regMonthlyHouseholdIncome || '');
    setRegMonthlyHouseholdExpenses(d.regMonthlyHouseholdExpenses || '');
    setRegExistingLoanCommitments(d.regExistingLoanCommitments || '');
    setRegBankingRelationship(d.regBankingRelationship || '');
    setRegFamilyFinancialNotes(d.regFamilyFinancialNotes || '');
    setRegEvaluationIncomeActivities(Array.isArray(d.regEvaluationIncomeActivities) ? d.regEvaluationIncomeActivities : []);
    setRegEvaluationBusiness1(d.regEvaluationBusiness1 || '');
    setRegEvaluationBusiness1MonthlyIncome(d.regEvaluationBusiness1MonthlyIncome || '');
    setRegEvaluationBusiness2(d.regEvaluationBusiness2 || '');
    setRegEvaluationBusiness2MonthlyIncome(d.regEvaluationBusiness2MonthlyIncome || '');
    setRegEvaluationLoanReason(d.regEvaluationLoanReason || '');
    setRegEvaluationHouseOwnership(d.regEvaluationHouseOwnership || '');
    setRegEvaluationWallMaterial(d.regEvaluationWallMaterial || '');
    setRegEvaluationFloorMaterial(d.regEvaluationFloorMaterial || '');
    setRegEvaluationRoofMaterial(d.regEvaluationRoofMaterial || '');
    setRegEvaluationVehicleAssets(d.regEvaluationVehicleAssets || '');
    setRegEvaluationOtherLoansDetails(d.regEvaluationOtherLoansDetails || '');
    setRegEvaluationOtherLoansMonthlyInstallment(d.regEvaluationOtherLoansMonthlyInstallment || '');
    setRegEvaluationLeasingDetails(d.regEvaluationLeasingDetails || '');
    setRegEvaluationLeasingMonthlyInstallment(d.regEvaluationLeasingMonthlyInstallment || '');
    setRegEvaluationOtherLiabilities(d.regEvaluationOtherLiabilities || '');
    setRegEvaluationFamilyExpenseBreakdown(d.regEvaluationFamilyExpenseBreakdown || {});
    setRegEvaluationBusinessExpenseBreakdown(d.regEvaluationBusinessExpenseBreakdown || {});
    setRegEvaluationFamilyIncomeWithoutBusiness(d.regEvaluationFamilyIncomeWithoutBusiness || '');
    setRegEvaluationFamilyIncomeItem1(d.regEvaluationFamilyIncomeItem1 || '');
    setRegEvaluationFamilyIncomeItem2(d.regEvaluationFamilyIncomeItem2 || '');
    setRegEvaluationFamilyIncomeItem3(d.regEvaluationFamilyIncomeItem3 || '');
    setRegEvaluationWageEarner1Name(d.regEvaluationWageEarner1Name || '');
    setRegEvaluationWageEarner1Salary(d.regEvaluationWageEarner1Salary || '');
    setRegEvaluationWageEarner2Name(d.regEvaluationWageEarner2Name || '');
    setRegEvaluationWageEarner2Salary(d.regEvaluationWageEarner2Salary || '');
    setRegEvaluationWageEarner3Name(d.regEvaluationWageEarner3Name || '');
    setRegEvaluationWageEarner3Salary(d.regEvaluationWageEarner3Salary || '');
    setRegEvaluationRentOutHouse(d.regEvaluationRentOutHouse || '');
    setRegEvaluationRentOutVehicle(d.regEvaluationRentOutVehicle || '');
    setRegEvaluationInterestCommission(d.regEvaluationInterestCommission || '');
    setRegEvaluationOtherIncome(d.regEvaluationOtherIncome || '');
    setRegEvaluationBusiness1UnitPrice(d.regEvaluationBusiness1UnitPrice || '');
    setRegEvaluationBusiness1Units(d.regEvaluationBusiness1Units || '');
    setRegEvaluationBusiness2UnitPrice(d.regEvaluationBusiness2UnitPrice || '');
    setRegEvaluationBusiness2Units(d.regEvaluationBusiness2Units || '');
    setRegEvaluationRecommendation(d.regEvaluationRecommendation || '');

    // File objects cannot be restored from localStorage; user should reattach files.
    setRegVehicleImages([]);
    setRegVehicleCrFile(null);
    setRegResidenceImages([]);
    setRegDocuments([]);
  };

  const deleteDraft = (draftId: string) => {
    setSavedDrafts((prev) => {
      const next = prev.filter((draft) => draft.id !== draftId);
      persistDraftsToStorage(next);
      return next;
    });

    if (activeDraftId === draftId) {
      setActiveDraftId('');
    }
  };

  useEffect(() => {
    if (isDraftLoanSelected && registerStep === 5) {
      setRegisterStep(6);
    }
  }, [isDraftLoanSelected, registerStep]);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FINANCE_ISSUE_DRAFTS_KEY);
      if (!raw) {
        setSavedDrafts([]);
        return;
      }

      const parsed = JSON.parse(raw) as FinanceIssueDraft[];
      setSavedDrafts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedDrafts([]);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      await Promise.all([fetchProductTypes(token), fetchAssignmentOptions(token)]);
    };

    run();
  }, [token]);

  const fetchAssignmentOptions = async (authToken: string, customerReference?: string) => {
    try {
      const response = await axios.get('/api/finances/assignment-options', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: {
          customer_no: (customerReference || '').trim() || undefined,
        },
      });

      const branchManager = response.data?.branch_manager || null;
      const officers = Array.isArray(response.data?.responsible_officers)
        ? response.data.responsible_officers
        : [];

      setBranchManagerOption(branchManager as BranchManagerOption | null);
      setResponsibleOfficerOptions(officers as ResponsibleOfficerOption[]);
    } catch {
      setBranchManagerOption(null);
      setResponsibleOfficerOptions([]);
    }
  };

  const fetchProductTypes = async (authToken: string) => {
    try {
      const response = await axios.get('/api/finance-product-types', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });

      const data = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      const allowedProductTypes = (data as ProductTypeRow[])
        .filter((item) => !isRemovedProductTypeName(String(item.name || '')))
        .sort((a, b) => a.name.localeCompare(b.name));
      setProductTypes(allowedProductTypes);
      if (allowedProductTypes.length > 0 && (!regProductType || isRemovedProductTypeName(regProductType))) {
        const first = allowedProductTypes[0];
        if (first?.name) {
          setRegProductType(first.name);
          applyProductTypeDefaults(first);
        }
      }
    } catch {
      setProductTypes([]);
    }
  };

  const applyProductTypeDefaults = (productType: ProductTypeRow) => {
    if (productType.interest_rate !== null && productType.interest_rate !== undefined && productType.interest_rate !== '') {
      setRegInterestRate(String(productType.interest_rate));
      setRegInterestRatePeriod('yearly');
    }

    if (productType.interest_type === 'fixed' || productType.interest_type === 'reducing') {
      setRegInterestType(productType.interest_type);
    }

    if (productType.tenure_months !== null && productType.tenure_months !== undefined) {
      setRegTenureMonths(String(productType.tenure_months));
    }

    if (productType.installment_frequency) {
      setRegFrequency(productType.installment_frequency);
    }
  };

  const handleProductTypeChange = (name: string) => {
    setRegProductType(name);
    const selected = productTypes.find((pt) => pt.name === name);
    if (selected) {
      applyProductTypeDefaults(selected);
    }
  };

  const resetProductTypeModal = () => {
    setShowProductTypeModal(false);
    setNewProductTypeName('');
    setNewProductTypeDescription('');
    setNewProductInterestRate('18');
    setNewProductInterestRatePeriod('yearly');
    setNewProductInterestType('fixed');
    setNewProductTenureMonths('36');
    setNewProductFrequency('monthly');
    setShowNewProductInterestTerms(false);
  };

  const saveNewProductType = async () => {
    if (!token) return;

    const name = newProductTypeName.trim();
    const interestRate = Number(newProductInterestRate);
    const tenureMonths = Number(newProductTenureMonths);

    if (!name) {
      setErrorMessage('Product type name is required.');
          if (isRemovedProductTypeName(name)) {
            setErrorMessage('Hire Purchase/Loan product type has been removed.');
            return;
          }
      return;
    }
    if (!Number.isFinite(interestRate) || interestRate < 0) {
      setErrorMessage('Interest rate must be a valid number.');
      return;
    }
    if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) {
      setErrorMessage('Tenure must be a valid number of months.');
      return;
    }

    try {
      setSavingProductType(true);
      setErrorMessage('');
      const response = await axios.post(
        '/api/finance-product-types',
        {
          name,
          description: newProductTypeDescription.trim() || undefined,
          interest_rate: toAnnualRatePercent(interestRate, newProductInterestRatePeriod),
          interest_type: newProductInterestType,
          tenure_months: tenureMonths,
          installment_frequency: newProductFrequency,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );

      const created = response.data as ProductTypeRow;
      setProductTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      handleProductTypeChange(created.name);
      resetProductTypeModal();
    } catch {
      setErrorMessage('Failed to create product type.');
    } finally {
      setSavingProductType(false);
    }
  };

  const getInstallmentsPerYear = (frequency: string) => {
    switch (String(frequency).toLowerCase()) {
      case 'daily':
        return 365;
      case 'weekly':
        return 52;
      case 'quarterly':
        return 4;
      case 'yearly':
        return 1;
      default:
        return 12;
    }
  };

  const computeInstallmentCount = () => {
    const tenureMonths = Number(regTenureMonths);
    if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) return 0;
    const years = tenureMonths / 12;
    const count = Math.round(years * getInstallmentsPerYear(regFrequency));
    return Math.max(1, count);
  };

  const calculateBaseInstallmentFromLeaseTerms = (): number | null => {
    const assetAmount = Number(effectiveAmountInput);
    const downPayment = Number(regDownPayment || 0);
    const annualRatePercent = toAnnualRatePercent(Number(regInterestRate), regInterestRatePeriod);
    const tenureMonths = Number(regTenureMonths);

    if (!Number.isFinite(assetAmount) || assetAmount <= 0) return null;
    if (!Number.isFinite(downPayment) || downPayment < 0) return null;
    if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) return null;
    if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) return null;

    const financedAmount = Math.max(assetAmount - downPayment, 0);
    if (financedAmount <= 0) return null;

    const installmentsPerYear = getInstallmentsPerYear(regFrequency);
    const years = tenureMonths / 12;
    const installmentCount = Math.max(1, Math.round(years * installmentsPerYear));
    const annualRate = annualRatePercent / 100;
    const periodRate = installmentsPerYear > 0 ? annualRate / installmentsPerYear : 0;

    let installment = 0;
    if (regInterestType === 'reducing' && periodRate > 0) {
      const pow = Math.pow(1 + periodRate, installmentCount);
      installment = financedAmount * periodRate * pow / (pow - 1);
    } else {
      const totalInterest = financedAmount * annualRate * years;
      installment = (financedAmount + totalInterest) / installmentCount;
    }

    if (!Number.isFinite(installment) || installment <= 0) return null;
    return Math.round(installment * 100) / 100;
  };

  const calculatedBaseInstallment = useMemo(
    () => calculateBaseInstallmentFromLeaseTerms(),
    [effectiveAmountInput, regDownPayment, regInterestRate, regInterestRatePeriod, regTenureMonths, regFrequency, regInterestType],
  );
  const interestRateSummary = useMemo(() => {
    const entered = Number(regInterestRate);
    if (!Number.isFinite(entered) || entered < 0) return null;

    const annual = toAnnualRatePercent(entered, regInterestRatePeriod);
    const monthly = toMonthlyRatePercent(entered, regInterestRatePeriod);
    const installmentsPerYear = getInstallmentsPerYear(regFrequency);
    const perInstallment = installmentsPerYear > 0 ? annual / installmentsPerYear : annual;

    return { annual, monthly, perInstallment };
  }, [regInterestRate, regInterestRatePeriod, regFrequency]);
  const calculatedSpeedDraftMonthlyInterest = useMemo(() => {
    if (!isDraftLoanSelected) return null;

    const draftValue = Number(regDraftValue);
    const monthlyRatePercent = toMonthlyRatePercent(Number(regInterestRate), regInterestRatePeriod);

    if (!Number.isFinite(draftValue) || draftValue <= 0) return null;
    if (!Number.isFinite(monthlyRatePercent) || monthlyRatePercent < 0) return null;

    const monthlyInterest = draftValue * (monthlyRatePercent / 100);
    if (!Number.isFinite(monthlyInterest) || monthlyInterest < 0) return null;

    return Math.round(monthlyInterest * 100) / 100;
  }, [isDraftLoanSelected, regDraftValue, regInterestRate, regInterestRatePeriod]);
  const shouldShowLoanMonthlyInterest = isOtherFinanceSelected || (isLoanProductSelected && !isDraftLoanSelected);
  const calculatedLoanMonthlyInterest = useMemo(() => {
    if (!shouldShowLoanMonthlyInterest) return null;

    const principal = Number(effectiveAmountInput);
    const monthlyRatePercent = toMonthlyRatePercent(Number(regInterestRate), regInterestRatePeriod);

    if (!Number.isFinite(principal) || principal <= 0) return null;
    if (!Number.isFinite(monthlyRatePercent) || monthlyRatePercent < 0) return null;

    const monthlyInterest = principal * (monthlyRatePercent / 100);
    if (!Number.isFinite(monthlyInterest) || monthlyInterest < 0) return null;

    return Math.round(monthlyInterest * 100) / 100;
  }, [shouldShowLoanMonthlyInterest, effectiveAmountInput, regInterestRate, regInterestRatePeriod]);

  const applicationSummary = useMemo(
    () => ({
      customerLabel: regCustomerNo.trim() || 'Not set',
      productLabel: regProductType.trim() || 'Select product',
      financeTypeLabel: regFinanceType.replace(/_/g, ' '),
      financedAmount: financedPreview,
      installmentPreview: calculatedBaseInstallment,
      draftMonthlyInterest: calculatedSpeedDraftMonthlyInterest,
      loanMonthlyInterest: calculatedLoanMonthlyInterest,
    }),
    [
      regCustomerNo,
      regProductType,
      regFinanceType,
      financedPreview,
      calculatedBaseInstallment,
      calculatedSpeedDraftMonthlyInterest,
      calculatedLoanMonthlyInterest,
    ],
  );

  const interestTermsPreview = useMemo(() => {
    const rateLabel = regInterestRate.trim() || '-';
    const periodLabel = regInterestRatePeriod === 'monthly' ? 'monthly' : 'yearly';
    const annualHint =
      interestRateSummary && regInterestRate.trim()
        ? ` (${formatRatePercent(interestRateSummary.annual)}% p.a.)`
        : '';
    return `${rateLabel}% ${periodLabel}${annualHint} · ${regInterestType} · ${regTenureMonths || '-'} mo · ${regFrequency}`;
  }, [
    regInterestRate,
    regInterestRatePeriod,
    regInterestType,
    regTenureMonths,
    regFrequency,
    interestRateSummary,
  ]);

  useEffect(() => {
    if (regInstallmentMode !== 'manual') return;
    if (regManualInstallmentAmount.trim() !== '') return;
    if (!Number.isFinite(calculatedBaseInstallment || NaN) || (calculatedBaseInstallment || 0) <= 0) return;

    setRegManualInstallmentAmount((calculatedBaseInstallment as number).toFixed(2));
  }, [regInstallmentMode, regManualInstallmentAmount, calculatedBaseInstallment]);

  const getSeedDate = () => {
    const seed = regFirstInstallmentDate || regStartDate;
    if (seed) return seed;
    return new Date().toISOString().slice(0, 10);
  };

  const incrementByFrequency = (dateText: string) => {
    const date = new Date(`${dateText}T00:00:00`);
    const frequency = String(regFrequency).toLowerCase();

    if (frequency === 'daily') date.setDate(date.getDate() + 1);
    else if (frequency === 'weekly') date.setDate(date.getDate() + 7);
    else if (frequency === 'quarterly') date.setMonth(date.getMonth() + 3);
    else if (frequency === 'yearly') date.setFullYear(date.getFullYear() + 1);
    else date.setMonth(date.getMonth() + 1);

    return date.toISOString().slice(0, 10);
  };

  const generateInstallmentPlan = (defaultAmount?: number) => {
    const count = computeInstallmentCount();
    const manual = Number(regManualInstallmentAmount);
    const calculated = calculateBaseInstallmentFromLeaseTerms();
    const amount = Number.isFinite(defaultAmount) && (defaultAmount ?? 0) > 0
      ? Number(defaultAmount)
      : Number.isFinite(manual) && manual > 0
        ? manual
        : Number.isFinite(calculated || NaN) && (calculated || 0) > 0
          ? Number(calculated)
          : 0;

    if (count <= 0) {
      setRegInstallmentPlan([]);
      return;
    }

    let paymentDate = getSeedDate();
    const rows: RepaymentInstallmentRow[] = [];
    for (let i = 1; i <= count; i++) {
      rows.push({
        installment_no: i,
        payment_date: paymentDate,
        amount: amount > 0 ? amount.toFixed(2) : '',
      });
      paymentDate = incrementByFrequency(paymentDate);
    }

    setRegInstallmentPlan(rows);
  };

  const applyEqualAmounts = () => {
    const manual = Number(regManualInstallmentAmount);
    const calculated = calculateBaseInstallmentFromLeaseTerms();
    const baseAmount = Number.isFinite(manual) && manual > 0
      ? manual
      : Number.isFinite(calculated || NaN) && (calculated || 0) > 0
        ? Number(calculated)
        : NaN;

    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      setErrorMessage('Enter Manual Monthly Payment Amount first.');
      return;
    }

    if (!Number.isFinite(manual) || manual <= 0) {
      setRegManualInstallmentAmount(baseAmount.toFixed(2));
    }

    if (regInstallmentPlan.length === 0) {
      generateInstallmentPlan(baseAmount);
      return;
    }

    setRegInstallmentPlan((prev) => prev.map((r) => ({ ...r, amount: baseAmount.toFixed(2) })));
  };

  const applyYearlyStepUp = () => {
    const year1 = Number(regYear1Amount);
    const year2 = Number(regYear2Amount);
    const year3 = Number(regYear3PlusAmount);
    if (!Number.isFinite(year1) || year1 <= 0 || !Number.isFinite(year2) || year2 <= 0 || !Number.isFinite(year3) || year3 <= 0) {
      setErrorMessage('Year 1, Year 2, and Year 3+ amounts must be valid.');
      return;
    }

    const count = computeInstallmentCount();
    if (count <= 0) return;
    if (regInstallmentPlan.length === 0) {
      generateInstallmentPlan(year1);
    }

    const perYear = Math.max(1, getInstallmentsPerYear(regFrequency));
    setRegInstallmentPlan((prev) => prev.map((row, idx) => {
      const yearNo = Math.floor(idx / perYear) + 1;
      const selected = yearNo === 1 ? year1 : yearNo === 2 ? year2 : year3;
      return { ...row, amount: selected.toFixed(2) };
    }));
  };

  const applyBulkLastPayment = () => {
    const regular = Number(regBulkRegularAmount);
    const last = Number(regBulkLastAmount);
    if (!Number.isFinite(regular) || regular <= 0 || !Number.isFinite(last) || last <= 0) {
      setErrorMessage('Regular amount and last bulk amount must be valid.');
      return;
    }

    if (regInstallmentPlan.length === 0) {
      generateInstallmentPlan(regular);
    }

    setRegInstallmentPlan((prev) => prev.map((row, idx) => {
      if (idx === prev.length - 1) {
        return { ...row, amount: last.toFixed(2) };
      }
      return { ...row, amount: regular.toFixed(2) };
    }));
  };

  const totalPlannedInstallments = useMemo(() => {
    return regInstallmentPlan.reduce((sum, row) => {
      const amount = Number(row.amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [regInstallmentPlan]);

  const applyCustomerDetailToForm = (customer: CustomerDetail, canonicalCustomerNo?: string | null) => {
    setRegCustomerDetail(customer);
    const canonical = String(canonicalCustomerNo || '').trim();
    setRegCustomerNo(canonical || String(customer.customer_code || '').trim());
  };

  const selectAdvancedSearchMatch = (match: FinanceCustomerSearchMatch) => {
    if (!match || !isCustomerDetail(match.customer)) return;
    const matchedAccountNo = String(match.matched_savings_account_no || match.matched_investment_account_no || '').trim();
    applyCustomerDetailToForm(match.customer, matchedAccountNo || null);
    setRegMatchedInvestmentAccountNo(matchedAccountNo);
    setErrorMessage('');
    setShowCustomerSuggestions(false);
    setCustomerSuggestions([]);

    if (token) {
      const fallbackCustomerRef = String(match.customer.customer_code || '').trim();
      void fetchAssignmentOptions(token, matchedAccountNo || fallbackCustomerRef);
    }
  };

  const mapQuickSearchParams = (searchBy: 'nic_passport' | 'passport' | 'investment_account_no', value: string) => {
    const keyword = value.trim();
    if (!keyword) return {};

    if (searchBy === 'passport') {
      return { passport_no: keyword, limit: 8 };
    }
    if (searchBy === 'investment_account_no') {
      return { investment_account_no: keyword, limit: 8 };
    }
    return { nic_passport: keyword, limit: 8 };
  };

  const loadCustomerSuggestions = async (authToken: string, searchBy: 'nic_passport' | 'passport' | 'investment_account_no', value: string) => {
    const keyword = value.trim();
    if (keyword.length < 1) {
      setCustomerSuggestions([]);
      return;
    }

    try {
      setLoadingCustomerSuggestions(true);
      const response = await axios.get('/api/customers/finance-search', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: mapQuickSearchParams(searchBy, keyword),
      });

      const rows = Array.isArray(response.data?.matches) ? response.data.matches : [];
      const next = rows.filter((row: unknown) => {
        if (!row || typeof row !== 'object') return false;
        const candidate = row as { customer?: unknown };
        return isCustomerDetail(candidate.customer);
      }) as FinanceCustomerSearchMatch[];

      setCustomerSuggestions(next);
    } catch {
      setCustomerSuggestions([]);
    } finally {
      setLoadingCustomerSuggestions(false);
    }
  };

  const handleSelectQuickSuggestion = (match: FinanceCustomerSearchMatch) => {
    const customer = match.customer;
    if (!isCustomerDetail(customer)) return;

    if (regCustomerSearchBy === 'investment_account_no' && (match.matched_savings_account_no || match.matched_investment_account_no)) {
      setRegCustomerSearchValue(String(match.matched_savings_account_no || match.matched_investment_account_no));
    } else if (regCustomerSearchBy === 'passport') {
      setRegCustomerSearchValue(String(customer.passport_no || customer.nic_passport || customer.customer_code || ''));
    } else {
      setRegCustomerSearchValue(String(customer.nic_passport || customer.customer_code || ''));
    }

    selectAdvancedSearchMatch(match);
  };

  const searchCustomerForFinance = async (authToken: string) => {
    const keyword = regCustomerSearchValue.trim();
    if (!keyword) {
      setErrorMessage('Enter search value to find customer.');
      return false;
    }

    try {
      setSearchingCustomer(true);
      setErrorMessage('');

      const response = await axios.get('/api/customers/finance-lookup', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params: {
          search_by: regCustomerSearchBy,
          q: keyword,
        },
      });

      const payload = response.data as {
        found?: boolean;
        data?: unknown;
        matched_investment_account_no?: string | null;
        matched_savings_account_no?: string | null;
        message?: string;
      };

      const customer = isCustomerDetail(payload?.data) ? payload.data : null;
      if (!payload?.found || !customer) {
        setRegCustomerDetail(null);
        setRegMatchedInvestmentAccountNo('');
        setErrorMessage(payload?.message || 'Customer not found.');
        return false;
      }

      const matchedAccountNo = String(payload.matched_savings_account_no || payload.matched_investment_account_no || '').trim();
      applyCustomerDetailToForm(customer, matchedAccountNo || null);
      setRegMatchedInvestmentAccountNo(matchedAccountNo);
      setAdvancedSearchMatches([]);
      const fallbackCustomerRef = String(customer.customer_code || '').trim();
      await fetchAssignmentOptions(authToken, matchedAccountNo || fallbackCustomerRef);
      return true;
    } catch (error: unknown) {
      setRegCustomerDetail(null);
      setRegMatchedInvestmentAccountNo('');
      if (axios.isAxiosError(error)) {
        setErrorMessage(String(error.response?.data?.message || 'Customer not found.'));
      } else {
        setErrorMessage('Customer search failed.');
      }
      return false;
    } finally {
      setSearchingCustomer(false);
    }
  };

  const runAdvancedCustomerSearch = async (authToken: string) => {
    const params = {
      nic_passport: advancedSearchNic.trim() || undefined,
      passport_no: advancedSearchPassport.trim() || undefined,
      investment_account_no: advancedSearchInvestmentAccountNo.trim() || undefined,
      customer_no: advancedSearchCustomerNo.trim() || undefined,
      name: advancedSearchName.trim() || undefined,
      phone: advancedSearchPhone.trim() || undefined,
      limit: 20,
    };

    const hasAnyField = Object.values(params).some((value) => value !== undefined);
    if (!hasAnyField) {
      setErrorMessage('Enter at least one field for advanced search.');
      return;
    }

    try {
      setSearchingCustomer(true);
      setErrorMessage('');
      const response = await axios.get('/api/customers/finance-search', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
        params,
      });

      const matches = Array.isArray(response.data?.matches) ? response.data.matches : [];
      const typedMatches = matches.filter((row: unknown) => {
        if (!row || typeof row !== 'object') return false;
        const candidate = row as { customer?: unknown };
        return isCustomerDetail(candidate.customer);
      }) as FinanceCustomerSearchMatch[];

      setAdvancedSearchMatches(typedMatches);
      if (typedMatches.length === 1) {
        selectAdvancedSearchMatch(typedMatches[0]);
      }
      if (typedMatches.length === 0) {
        setRegCustomerDetail(null);
        setRegMatchedInvestmentAccountNo('');
        setErrorMessage('No customer found for advanced search criteria.');
      }
    } catch (error: unknown) {
      setAdvancedSearchMatches([]);
      if (axios.isAxiosError(error)) {
        setErrorMessage(String(error.response?.data?.message || 'Advanced search failed.'));
      } else {
        setErrorMessage('Advanced search failed.');
      }
    } finally {
      setSearchingCustomer(false);
    }
  };

  useEffect(() => {
    if (!token || registerStep !== 2 || !regCustomerSearchValue.trim()) return;
    void searchCustomerForFinance(token);
  }, [token, registerStep, regCustomerSearchBy, regCustomerSearchValue]);

  useEffect(() => {
    if (!token) return;

    const keyword = regCustomerSearchValue.trim();
    if (keyword.length < 1) {
      setCustomerSuggestions([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void loadCustomerSuggestions(token, regCustomerSearchBy, keyword);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [token, regCustomerSearchBy, regCustomerSearchValue]);

  const goToNextStep = async () => {
    if (registerStep === 2) {
      if (!token) return;
      const ok = await searchCustomerForFinance(token);
      if (!ok) {
        setErrorMessage('Customer not found. Search and select an existing customer before continuing.');
        return;
      }
    }

    const currentIndex = visibleWizardSteps.findIndex((s) => s.id === registerStep);
    if (currentIndex < 0) {
      setRegisterStep(visibleWizardSteps[0]?.id ?? 1);
      return;
    }

    const nextStep = visibleWizardSteps[currentIndex + 1];
    if (nextStep) {
      if (registerStep >= 3) {
        saveCurrentDraft();
      }
      setRegisterStep(nextStep.id);
    }
  };

  const submitRegister = async () => {
    if (!token) return;

    const amount = Number(effectiveAmountInput);
    const down = regDownPayment ? Number(regDownPayment) : 0;
    const draftValue = regDraftValue ? Number(regDraftValue) : NaN;
    const rate = toAnnualRatePercent(Number(regInterestRate), regInterestRatePeriod);
    const tenure = Number(regTenureMonths);
    const manualInstallment = regManualInstallmentAmount ? Number(regManualInstallmentAmount) : 0;

    if (!regCustomerSearchValue.trim()) {
      setErrorMessage('Customer search value is required.');
      setRegisterStep(1);
      return;
    }
    if (!regProductType.trim()) {
      setErrorMessage('Product Type is required.');
      setRegisterStep(1);
      return;
    }
    let ensuredCustomerDetail = regCustomerDetail;
    if (!ensuredCustomerDetail) {
      const fetched = await searchCustomerForFinance(token);
      if (fetched) {
        ensuredCustomerDetail = regCustomerDetail;
      } else {
        setErrorMessage('Customer not found. Search and select an existing customer in Step 1 or Step 2.');
        setRegisterStep(2);
        return;
      }
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage(isOtherFinanceSelected ? 'Loan amount must be a valid amount.' : 'Asset value must be a valid amount.');
      setRegisterStep(3);
      return;
    }
    if (isOtherFinanceSelected && !regLoanDetails.trim()) {
      setErrorMessage('Loan details are required for Other finance type.');
      setRegisterStep(3);
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setErrorMessage('Interest rate must be valid.');
      setRegisterStep(1);
      return;
    }
    if (!Number.isFinite(tenure) || tenure <= 0) {
      setErrorMessage('Tenure must be valid.');
      setRegisterStep(1);
      return;
    }
    if (!isDraftLoanSelected && regInstallmentMode === 'manual' && (!Number.isFinite(manualInstallment) || manualInstallment <= 0)) {
      setErrorMessage('Manual monthly payment must be a valid amount.');
      setRegisterStep(5);
      return;
    }
    if (!isDraftLoanSelected && regInstallmentMode === 'manual' && regInstallmentPlan.length === 0) {
      setErrorMessage('Generate the installment plan in Repayment step.');
      setRegisterStep(5);
      return;
    }

    if (isDraftLoanSelected && Number.isFinite(draftValue) && draftValue > amount) {
      setErrorMessage(isOtherFinanceSelected ? 'Draft Value cannot be greater than Loan Amount.' : 'Draft Value cannot be greater than Vehicle Value.');
      setRegisterStep(3);
      return;
    }

    const normalizedManualRows = regInstallmentPlan.map((row) => ({
      installment_no: row.installment_no,
      payment_date: row.payment_date,
      amount: Number(row.amount),
    }));

    if (!isDraftLoanSelected && regInstallmentMode === 'manual') {
      const invalidRow = normalizedManualRows.find((row) => !row.payment_date || !Number.isFinite(row.amount) || row.amount <= 0);
      if (invalidRow) {
        setErrorMessage('Each installment row must have payment date and valid amount.');
        setRegisterStep(5);
        return;
      }
    }

    const effectiveDownPayment = isDraftLoanSelected && Number.isFinite(draftValue) && draftValue > 0
      ? Math.max(amount - draftValue, 0)
      : (Number.isFinite(down) ? down : 0);

    try {
      setSavingRegister(true);
      setErrorMessage('');

      const createResponse = await axios.post(
        '/api/finances',
        {
          customer_no: regCustomerNo.trim(),
          finance_type: regFinanceType,
          product_type: regProductType,
          asset_reference: isOtherFinanceSelected
            ? (regAssetRef || undefined)
            : (regAssetRef || regVehicleNo || undefined),
          amount,
          down_payment: effectiveDownPayment,
          interest_rate: rate,
          interest_type: regInterestType,
          tenure_months: tenure,
          installment_frequency: regFrequency,
          manual_installment_amount: !isDraftLoanSelected && regInstallmentMode === 'manual'
            ? Number(normalizedManualRows[0]?.amount || manualInstallment)
            : undefined,
          start_date: regStartDate || undefined,
          status: 'pending_approval',
          responsible_officer_employee_id: Number(regResponsibleOfficerId || 0) || undefined,
          vehicle_details: isVehicleFinanceSelected
            ? {
              vehicle_no: regVehicleNo || null,
              chassis_no: regChassisNo || null,
              engine_no: regEngineNo || null,
              make_model: regMakeModel || null,
              year: regVehicleYear || null,
            }
            : isOtherFinanceSelected
              ? {
                loan_details: regLoanDetails || null,
              }
              : {
                make_model: regMakeModel || null,
                year: regVehicleYear || null,
              },
          valuation_details: isOtherFinanceSelected
            ? null
            : {
              valuation_amount: regValuationAmount || null,
              valuation_date: regValuationDate || null,
              valuer_name: regValuerName || null,
            },
          guarantor_details: regGuarantors
            .filter((g) => g.name.trim() !== '' || g.nic.trim() !== '' || g.phone.trim() !== '' || g.address.trim() !== '')
            .map((g) => ({
              name: g.name || null,
              nic: g.nic || null,
              phone: g.phone || null,
              address: g.address || null,
            })),
          family_financial_details: {
            family_members_count: Number(regFamilyMembersCount || 0) || null,
            dependents_count: Number(regDependentsCount || 0) || null,
            employment_type: regEmploymentType || null,
            main_income_source: regMainIncomeSource || null,
            monthly_household_income: Number(regMonthlyHouseholdIncome || 0) || null,
            monthly_household_expenses: Number(regMonthlyHouseholdExpenses || 0) || null,
            existing_loan_commitments: Number(regExistingLoanCommitments || 0) || null,
            banking_relationship: regBankingRelationship || null,
            notes: regFamilyFinancialNotes || null,
          },
          evaluation_payload_version: 2,
          evaluation_payload: {
            income_generation_activities: regEvaluationIncomeActivities,
            business_1: regEvaluationBusiness1 || null,
            business_1_monthly_income: Number(regEvaluationBusiness1MonthlyIncome || 0) || null,
            business_2: regEvaluationBusiness2 || null,
            business_2_monthly_income: Number(regEvaluationBusiness2MonthlyIncome || 0) || null,
            loan_reason: regEvaluationLoanReason || null,
            house_ownership: regEvaluationHouseOwnership || null,
            wall_material: regEvaluationWallMaterial || null,
            floor_material: regEvaluationFloorMaterial || null,
            roof_material: regEvaluationRoofMaterial || null,
            vehicle_assets: regEvaluationVehicleAssets || null,
            other_loans_details: regEvaluationOtherLoansDetails || null,
            other_loans_monthly_installment: Number(regEvaluationOtherLoansMonthlyInstallment || 0) || null,
            leasing_details: regEvaluationLeasingDetails || null,
            leasing_monthly_installment: Number(regEvaluationLeasingMonthlyInstallment || 0) || null,
            family_expense_breakdown: regEvaluationFamilyExpenseBreakdown,
            business_expense_breakdown: regEvaluationBusinessExpenseBreakdown,
            family_income_without_business: Number(regEvaluationFamilyIncomeWithoutBusiness || 0) || null,
            family_income_item_1: Number(regEvaluationFamilyIncomeItem1 || 0) || null,
            family_income_item_2: Number(regEvaluationFamilyIncomeItem2 || 0) || null,
            family_income_item_3: Number(regEvaluationFamilyIncomeItem3 || 0) || null,
            family_wage_earners: [
              { name: regEvaluationWageEarner1Name || null, salary: Number(regEvaluationWageEarner1Salary || 0) || null },
              { name: regEvaluationWageEarner2Name || null, salary: Number(regEvaluationWageEarner2Salary || 0) || null },
              { name: regEvaluationWageEarner3Name || null, salary: Number(regEvaluationWageEarner3Salary || 0) || null },
            ],
            family_rent_out_house: Number(regEvaluationRentOutHouse || 0) || null,
            family_rent_out_vehicle: Number(regEvaluationRentOutVehicle || 0) || null,
            family_interest_commission: Number(regEvaluationInterestCommission || 0) || null,
            other_income: Number(regEvaluationOtherIncome || 0) || null,
            business_1_unit_selling_price: Number(regEvaluationBusiness1UnitPrice || 0) || null,
            business_1_units: Number(regEvaluationBusiness1Units || 0) || null,
            business_2_unit_selling_price: Number(regEvaluationBusiness2UnitPrice || 0) || null,
            business_2_units: Number(regEvaluationBusiness2Units || 0) || null,
            total_family_expenses_a: Number(familyExpenseTotal.toFixed(2)),
            total_business_expenses_b: Number(businessExpenseTotal.toFixed(2)),
            total_income_family_c: Number(totalIncomeWithBusiness.toFixed(2)),
            loan_payments_and_family_expenses_d: Number(loanPaymentsAndFamilyExpensesTotal.toFixed(2)),
            remaining_cash_with_family_e: Number(remainingCashWithFamily.toFixed(2)),
            average_cash_per_week: Number(averageCashPerWeek.toFixed(2)),
            assets_summary: regEvaluationVehicleAssets || null,
            liabilities_summary: regEvaluationOtherLiabilities || null,
            recommendation: regEvaluationRecommendation || null,
          },
          repayment_plan: isDraftLoanSelected ? undefined : {
            schedule_mode: regScheduleMode,
            first_installment_date: regFirstInstallmentDate || null,
            collection_day_of_month: regScheduleMode === 'fixed_day' ? Number(regCollectionDayOfMonth || 1) : null,
            grace_period_days: Number(regGraceDays || 0),
            installment_frequency: regFrequency,
            installment_mode: regInstallmentMode,
            manual_installment_amount: regInstallmentMode === 'manual' ? Number(normalizedManualRows[0]?.amount || manualInstallment) : null,
            installments: regInstallmentMode === 'manual' ? normalizedManualRows : [],
            total_planned_amount: regInstallmentMode === 'manual' ? Number(totalPlannedInstallments.toFixed(2)) : null,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );

      const financeId = Number(createResponse?.data?.id || 0);

      if (financeId > 0 && regVehicleCrFile) {
        const formData = new FormData();
        formData.append('document_type', 'finance_vehicle_cr');
        formData.append('file', regVehicleCrFile);

        await axios.post(
          `/api/finances/${financeId}/documents`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              'Content-Type': 'multipart/form-data',
            },
          },
        );
      }

      if (financeId > 0 && regVehicleImages.length > 0) {
        for (const file of regVehicleImages) {
          const formData = new FormData();
          formData.append('document_type', 'finance_vehicle_image');
          formData.append('file', file);

          await axios.post(
            `/api/finances/${financeId}/documents`,
            formData,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'multipart/form-data',
              },
            },
          );
        }
      }

      if (financeId > 0 && regResidenceImages.length > 0) {
        for (const file of regResidenceImages) {
          const formData = new FormData();
          formData.append('document_type', 'finance_residence_image');
          formData.append('file', file);

          await axios.post(
            `/api/finances/${financeId}/documents`,
            formData,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'multipart/form-data',
              },
            },
          );
        }
      }

      if (financeId > 0 && regDocuments.length > 0) {
        for (const file of regDocuments) {
          const formData = new FormData();
          formData.append('document_type', 'finance_supporting');
          formData.append('file', file);

          await axios.post(
            `/api/finances/${financeId}/documents`,
            formData,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'multipart/form-data',
              },
            },
          );
        }
      }

      router.push('/dashboard/finance');
    } catch (error: unknown) {
      const fallback = 'Failed to register finance agreement.';
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as {
          message?: string;
          errors?: Record<string, string[] | string>;
        } | undefined;

        const firstValidationMessage = responseData?.errors
          ? Object.values(responseData.errors)
            .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
            .find((entry) => typeof entry === 'string' && entry.trim() !== '')
          : undefined;

        setErrorMessage(String(firstValidationMessage || responseData?.message || fallback));
      } else {
        setErrorMessage(fallback);
      }
    } finally {
      setSavingRegister(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_16%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(6,182,212,0.16),transparent_32%),radial-gradient(circle_at_52%_84%,rgba(45,212,191,0.15),transparent_30%),linear-gradient(135deg,#effbff_0%,#f3fcff_45%,#f6fdfb_100%)] p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-20 left-14 h-72 w-72 rounded-full bg-blue-300/80 blur-3xl" />
        <div className="absolute top-20 right-8 h-80 w-80 rounded-full bg-cyan-300/75 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-300/70 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(14,116,144,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.06)_1px,transparent_1px)] bg-[size:26px_26px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-5">
        <div className="rounded-3xl border border-white/80 bg-white/88 backdrop-blur-md shadow-[0_22px_40px_rgba(14,116,144,0.14)] overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-700 via-sky-700 to-teal-600 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/20 backdrop-blur">
                  <Banknote className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100">Finance Module</p>
                  <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">Issue Finance</h1>
                  <p className="mt-1 max-w-xl text-xs text-cyan-50/95 sm:text-[13px]">
                    Register vehicle and asset finance with customer onboarding, terms, and repayment planning.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/dashboard/finance')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Finance Dashboard
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-cyan-100 border-t border-cyan-100/80 bg-gradient-to-r from-cyan-50/70 via-white to-teal-50/60">
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Product types</p>
              <p className="text-lg font-extrabold text-slate-900 tabular-nums">{productTypes.length}</p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Wizard progress</p>
              <p className="text-lg font-extrabold text-cyan-800 tabular-nums">
                {activeWizardIndex + 1}/{visibleWizardSteps.length}
              </p>
            </div>
            <div className="px-4 py-3 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current product</p>
              <p className="text-sm font-extrabold text-slate-900 truncate">{applicationSummary.productLabel}</p>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-700 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="rounded-3xl border border-cyan-100/90 bg-white/88 backdrop-blur-md shadow-[0_18px_36px_rgba(14,116,144,0.12)] overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-cyan-100 bg-gradient-to-r from-cyan-50/80 to-blue-50/50">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-700">
                    Step {activeWizardIndex + 1} of {visibleWizardSteps.length}
                  </p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{activeWizardStep.hint}</p>
                </div>
                <span className="rounded-full bg-white border border-cyan-200 px-3 py-1 text-xs font-bold text-cyan-800">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-cyan-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex overflow-x-auto border-b border-cyan-100 bg-white">
              {visibleWizardSteps.map((step) => {
                const isActive = registerStep === step.id;
                const isDone = registerStep > step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setRegisterStep(step.id)}
                    className={`min-w-[7.25rem] flex-1 px-2.5 py-2.5 text-center transition border-b-2 ${
                      isActive
                        ? 'border-cyan-500 bg-cyan-50/60'
                        : isDone
                          ? 'border-transparent text-emerald-700'
                          : 'border-transparent text-slate-400'
                    }`}
                  >
                    <span
                      className={`mb-1 inline-flex h-6.5 w-6.5 items-center justify-center rounded-full text-[11px] font-bold ${
                        isActive
                          ? 'bg-cyan-600 text-white'
                          : isDone
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : step.id}
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-800 sm:text-[11px]">{step.label}</span>
                  </button>
                );
              })}
            </div>

          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50/75 to-cyan-50/35 text-[13px] flex-1">
            {registerStep === 1 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Banknote}
                  title="Basic details & finance terms"
                  description="Identify the customer, choose the product type, and set interest and tenure."
                />
                <div className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Find Existing Customer</label>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr_auto_auto]">
                      <select
                        value={regCustomerSearchBy}
                        onChange={(e) => setRegCustomerSearchBy(e.target.value as 'nic_passport' | 'passport' | 'investment_account_no')}
                        className={inputClass}
                      >
                        <option value="nic_passport">NIC</option>
                        <option value="passport">Passport</option>
                        <option value="investment_account_no">Savings Account No</option>
                      </select>
                      <input
                        value={regCustomerSearchValue}
                        onFocus={() => setShowCustomerSuggestions(true)}
                        onChange={(e) => {
                          setRegCustomerSearchValue(e.target.value);
                          setShowCustomerSuggestions(true);
                        }}
                        className={inputClass}
                        placeholder={regCustomerSearchBy === 'investment_account_no' ? 'Enter savings account no' : regCustomerSearchBy === 'passport' ? 'Enter passport number' : 'Enter NIC'}
                      />
                      {showCustomerSuggestions && (loadingCustomerSuggestions || customerSuggestions.length > 0) && (
                        <div className="relative md:col-start-2">
                          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-cyan-200 bg-white shadow-xl">
                            {loadingCustomerSuggestions ? (
                              <div className="px-3 py-2 text-xs text-slate-600">Searching customers...</div>
                            ) : (
                              customerSuggestions.map((match) => {
                                const customer = match.customer;
                                const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'N/A';
                                return (
                                  <button
                                    key={`quick-suggestion-step1-${customer.id}`}
                                    type="button"
                                    onClick={() => handleSelectQuickSuggestion(match)}
                                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-cyan-50"
                                  >
                                    <p className="font-semibold text-slate-900">{fullName}</p>
                                    <p className="mt-0.5 text-slate-600">No: {customer.customer_code || '-'} | NIC: {customer.nic_passport || '-'}</p>
                                    <p className="mt-0.5 text-slate-500">Savings: {match.matched_savings_account_no || match.matched_investment_account_no || '-'}</p>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!token) return;
                          const ok = await searchCustomerForFinance(token);
                          if (ok) {
                            setErrorMessage('');
                            setRegisterStep(2);
                          }
                        }}
                        disabled={searchingCustomer}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 transition shrink-0"
                      >
                        {searchingCustomer ? 'Searching…' : 'Search'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegisterStep(2)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-200 bg-white px-4 py-2.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 transition shrink-0"
                      >
                        Open Step 2
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Customer No</p>
                        <p className="text-sm font-semibold text-slate-900">{regCustomerNo || '-'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Savings Account No</p>
                        <p className="text-sm font-semibold text-slate-900">{regMatchedInvestmentAccountNo || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Finance Type</label>
                    <select value={regFinanceType} onChange={(e) => setRegFinanceType(e.target.value)} className={inputClass}>
                      <option value="vehicle">Vehicle</option>
                      <option value="equipment">Equipment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Product Type</label>
                    <div className="space-y-2">
                      <select value={regProductType} onChange={(e) => handleProductTypeChange(e.target.value)} className={inputClass}>
                        <option value="">Select product type</option>
                        {productTypes.map((pt) => (
                          <option key={pt.id} value={pt.name}>{pt.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowProductTypeModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add product type
                      </button>
                      {isDraftLoanSelected && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                          Draft Loan selected: this issue will also be saved in the dedicated Draft Loans table for separate calculations.
                        </p>
                      )}
                    </div>
                  </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">Interest & repayment terms</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {showInterestTerms
                          ? 'Set rate period, interest type, tenure, and installment frequency.'
                          : 'Uses product defaults — turn on to customize.'}
                      </p>
                      {!showInterestTerms && (
                        <p className="mt-2 text-xs font-semibold text-cyan-800 truncate">{interestTermsPreview}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showInterestTerms}
                      aria-label="Show interest and repayment terms"
                      onClick={() => setShowInterestTerms((prev) => !prev)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 ${
                        showInterestTerms ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300 bg-slate-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          showInterestTerms ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {showInterestTerms && (
                    <div className="border-t border-slate-200 bg-white p-4 space-y-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">
                          Rate period
                        </label>
                        <RatePeriodToggle
                          value={regInterestRatePeriod}
                          onChange={setRegInterestRatePeriod}
                        />
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2 mt-4">
                          Interest rate ({regInterestRatePeriod === 'monthly' ? 'monthly' : 'yearly'} %)
                        </label>
                        <input
                          value={regInterestRate}
                          onChange={(e) => setRegInterestRate(e.target.value)}
                          className={`${inputClass} text-base font-semibold min-h-[46px] max-w-md`}
                          placeholder={regInterestRatePeriod === 'monthly' ? 'e.g. 1.5' : 'e.g. 18'}
                          inputMode="decimal"
                        />
                        <p className="mt-2 text-xs text-slate-600">
                          {regInterestRatePeriod === 'monthly'
                            ? 'Enter the monthly rate. Calculations convert to annual before applying tenure and frequency.'
                            : 'Enter the annual rate (per year). This is the standard rate stored for finance records.'}
                        </p>
                        {isDraftLoanSelected && (
                          <p className="mt-1 text-xs font-medium text-amber-800">
                            Draft loan monthly interest = Draft Value × monthly rate%.
                          </p>
                        )}
                        {shouldShowLoanMonthlyInterest && (
                          <p className="mt-1 text-xs font-medium text-cyan-800">
                            Monthly interest estimate = Principal Amount × monthly rate%.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Interest Type</label>
                          <select value={regInterestType} onChange={(e) => setRegInterestType(e.target.value as 'fixed' | 'reducing')} className={inputClass}>
                            <option value="fixed">Fixed</option>
                            <option value="reducing">Reducing</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Tenure (Months)</label>
                          <input value={regTenureMonths} onChange={(e) => setRegTenureMonths(e.target.value)} className={inputClass} placeholder="e.g. 36" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Installment Frequency</label>
                          <select value={regFrequency} onChange={(e) => setRegFrequency(e.target.value)} className={inputClass}>
                            <option value="monthly">Monthly</option>
                            <option value="weekly">Weekly</option>
                            <option value="daily">Daily</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>
                      </div>

                      {interestRateSummary && (
                        <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 px-4 py-3 text-xs text-slate-600">
                          <p className="font-semibold text-cyan-900">How this rate is used in calculations</p>
                          <p className="mt-1">
                            Stored annual rate: <span className="font-semibold text-slate-900">{formatRatePercent(interestRateSummary.annual)}%</span>
                            {' · '}
                            Monthly equivalent: <span className="font-semibold text-slate-900">{formatRatePercent(interestRateSummary.monthly)}%</span>
                            {' · '}
                            Per {regFrequency} installment: <span className="font-semibold text-slate-900">{formatRatePercent(interestRateSummary.perInstallment)}%</span>
                          </p>
                          <p className="mt-1">
                            {regInterestType === 'reducing'
                              ? 'Reducing balance: each installment applies the per-period rate to the outstanding capital.'
                              : 'Fixed: total interest = financed amount × annual rate × (tenure ÷ 12), then split across installments.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-cyan-100 bg-white p-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Auto Assigned Branch Manager</label>
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2.5 text-sm text-slate-900 min-h-[44px] flex items-center">
                      {branchManagerOption
                        ? `${branchManagerOption.name}${branchManagerOption.employee_code ? ` (${branchManagerOption.employee_code})` : ''}`
                        : 'No branch manager found for this branch.'}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">Loan is automatically assigned to branch manager for approval handling.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Responsible Officer (Optional)</label>
                    <select
                      value={regResponsibleOfficerId}
                      onChange={(e) => setRegResponsibleOfficerId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select responsible officer</option>
                      {responsibleOfficerOptions.map((officer) => (
                        <option key={officer.id} value={String(officer.id)}>
                          {officer.name}
                          {officer.employee_code ? ` (${officer.employee_code})` : ''}
                          {officer.designation ? ` - ${officer.designation}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">Choose officer responsible for follow-up and collections.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-cyan-100 bg-white p-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Start Date</label>
                    <input type="date" value={regStartDate} onChange={(e) => setRegStartDate(e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
            )}

            {registerStep === 2 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={User}
                  title="Customer profile"
                  description="Search and load an existing customer profile for finance issue."
                />

                <div className="rounded-xl border border-cyan-100 bg-white p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr_auto]">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Search By</label>
                      <select
                        value={regCustomerSearchBy}
                        onChange={(e) => setRegCustomerSearchBy(e.target.value as 'nic_passport' | 'passport' | 'investment_account_no')}
                        className={inputClass}
                      >
                        <option value="nic_passport">NIC</option>
                        <option value="passport">Passport</option>
                        <option value="investment_account_no">Savings Account No</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Search Value</label>
                      <input
                        value={regCustomerSearchValue}
                        onFocus={() => setShowCustomerSuggestions(true)}
                        onChange={(e) => {
                          setRegCustomerSearchValue(e.target.value);
                          setShowCustomerSuggestions(true);
                        }}
                        className={inputClass}
                        placeholder={regCustomerSearchBy === 'investment_account_no' ? 'Enter savings account no' : regCustomerSearchBy === 'passport' ? 'Enter passport number' : 'Enter NIC'}
                      />
                      {showCustomerSuggestions && (loadingCustomerSuggestions || customerSuggestions.length > 0) && (
                        <div className="relative">
                          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-cyan-200 bg-white shadow-xl">
                            {loadingCustomerSuggestions ? (
                              <div className="px-3 py-2 text-xs text-slate-600">Searching customers...</div>
                            ) : (
                              customerSuggestions.map((match) => {
                                const customer = match.customer;
                                const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'N/A';
                                return (
                                  <button
                                    key={`quick-suggestion-step1-${customer.id}`}
                                    type="button"
                                    onClick={() => handleSelectQuickSuggestion(match)}
                                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-cyan-50"
                                  >
                                    <p className="font-semibold text-slate-900">{fullName}</p>
                                    <p className="mt-0.5 text-slate-600">No: {customer.customer_code || '-'} | NIC: {customer.nic_passport || '-'}</p>
                                    <p className="mt-0.5 text-slate-500">Savings: {match.matched_savings_account_no || match.matched_investment_account_no || '-'}</p>
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
                      onClick={async () => {
                        if (!token) return;
                        const ok = await searchCustomerForFinance(token);
                        if (!ok) setErrorMessage('Customer not found. Check NIC/Passport/Savings account and search again.');
                        else setErrorMessage('');
                      }}
                      disabled={searchingCustomer}
                      className="rounded-lg border border-cyan-200 bg-white px-4 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50 disabled:opacity-60"
                    >
                      {searchingCustomer ? 'Searching...' : 'Search Customer'}
                    </button>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedCustomerSearch((prev) => !prev)}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                    >
                      {showAdvancedCustomerSearch ? 'Hide Advanced Search' : 'Advanced Search'}
                    </button>
                  </div>

                  {showAdvancedCustomerSearch && (
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Advanced Search Filters</p>
                      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <input value={advancedSearchNic} onChange={(e) => setAdvancedSearchNic(e.target.value)} className={inputClassSm} placeholder="NIC / Old NIC" />
                        <input value={advancedSearchPassport} onChange={(e) => setAdvancedSearchPassport(e.target.value)} className={inputClassSm} placeholder="Passport No" />
                        <input value={advancedSearchInvestmentAccountNo} onChange={(e) => setAdvancedSearchInvestmentAccountNo(e.target.value)} className={inputClassSm} placeholder="Savings Account No" />
                        <input value={advancedSearchCustomerNo} onChange={(e) => setAdvancedSearchCustomerNo(e.target.value)} className={inputClassSm} placeholder="Customer No" />
                        <input value={advancedSearchName} onChange={(e) => setAdvancedSearchName(e.target.value)} className={inputClassSm} placeholder="Customer Name" />
                        <input value={advancedSearchPhone} onChange={(e) => setAdvancedSearchPhone(e.target.value)} className={inputClassSm} placeholder="Phone" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!token) return;
                            await runAdvancedCustomerSearch(token);
                          }}
                          disabled={searchingCustomer}
                          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-60"
                        >
                          {searchingCustomer ? 'Searching...' : 'Run Advanced Search'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAdvancedSearchNic('');
                            setAdvancedSearchPassport('');
                            setAdvancedSearchInvestmentAccountNo('');
                            setAdvancedSearchCustomerNo('');
                            setAdvancedSearchName('');
                            setAdvancedSearchPhone('');
                            setAdvancedSearchMatches([]);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Clear Filters
                        </button>
                      </div>

                      {advancedSearchMatches.length > 0 && (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-indigo-100 bg-white">
                          <table className="min-w-full text-xs">
                            <thead className="bg-indigo-50/70">
                              <tr>
                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-indigo-700">Customer</th>
                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-indigo-700">Customer No</th>
                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-indigo-700">NIC/Passport</th>
                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-indigo-700">Savings Account</th>
                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-indigo-700">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {advancedSearchMatches.map((match) => (
                                <tr key={match.customer.id} className="border-t border-indigo-50">
                                  <td className="px-3 py-2 text-slate-800">{`${match.customer.first_name || ''} ${match.customer.last_name || ''}`.trim() || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{match.customer.customer_code || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{match.customer.nic_passport || match.customer.passport_no || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{match.matched_savings_account_no || match.matched_investment_account_no || '-'}</td>
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() => selectAdvancedSearchMatch(match)}
                                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                                    >
                                      Select
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {regCustomerDetail ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Selected Customer</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-emerald-900 md:grid-cols-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Name</p>
                        <p className="font-semibold">{`${regCustomerDetail.first_name || ''} ${regCustomerDetail.last_name || ''}`.trim() || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Customer No (Account)</p>
                        <p className="font-semibold">{regCustomerNo || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">NIC / Passport</p>
                        <p className="font-semibold">{regCustomerDetail.nic_passport || regCustomerDetail.passport_no || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Phone</p>
                        <p className="font-semibold">{regCustomerDetail.phone || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Email</p>
                        <p className="font-semibold">{regCustomerDetail.email || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Savings Account</p>
                        <p className="font-semibold">{regMatchedInvestmentAccountNo || '-'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Search and select an existing customer to continue. Customer profile editing is removed from this screen.
                  </div>
                )}
              </div>
            )}

            {registerStep === 3 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Car}
                  title={isVehicleFinanceSelected ? 'Vehicle & valuation' : isOtherFinanceSelected ? 'Loan details' : 'Equipment & valuation'}
                  description={
                    isVehicleFinanceSelected
                      ? 'Capture vehicle identity, asset value, and professional valuation figures.'
                      : isOtherFinanceSelected
                        ? 'Capture loan amount and loan details for Other finance type.'
                        : 'Capture equipment value and supporting valuation figures.'
                  }
                />
                {isVehicleFinanceSelected && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Vehicle No</label>
                        <input value={regVehicleNo} onChange={(e) => setRegVehicleNo(e.target.value)} className={inputClass} placeholder="e.g. CAB-1234" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Chassis No</label>
                        <input value={regChassisNo} onChange={(e) => setRegChassisNo(e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Engine No</label>
                        <input value={regEngineNo} onChange={(e) => setRegEngineNo(e.target.value)} className={inputClass} />
                      </div>
                    </div>

                    <div className="rounded-2xl border-2 border-dashed border-cyan-200 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-800">Vehicle CR</p>
                      <p className="mt-1 text-xs text-slate-500">Upload vehicle registration certificate as a separate file.</p>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setRegVehicleCrFile(file);
                          e.currentTarget.value = '';
                        }}
                        className="mt-3 w-full max-w-md text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
                      />

                      {regVehicleCrFile ? (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-xs text-slate-700">
                          <span className="truncate">{regVehicleCrFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setRegVehicleCrFile(null)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <X className="h-3 w-3" />
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border-2 border-dashed border-cyan-200 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-800">Vehicle Images</p>
                      <p className="mt-1 text-xs text-slate-500">Upload multiple vehicle photos (front, back, sides, interior, documents).</p>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const incoming = Array.from(e.target.files || []);
                          if (incoming.length === 0) return;
                          setRegVehicleImages((prev) => {
                            const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
                            const uniqueIncoming = incoming.filter((f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`));
                            return [...prev, ...uniqueIncoming];
                          });
                          e.currentTarget.value = '';
                        }}
                        className="mt-3 w-full max-w-md text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
                      />

                      {regVehicleImages.length > 0 ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
                          {regVehicleImages.map((file, index) => (
                            <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700 border border-cyan-100">
                              <span className="truncate">{file.name}</span>
                              <button
                                type="button"
                                onClick={() => setRegVehicleImages((prev) => prev.filter((_, i) => i !== index))}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                <X className="h-3 w-3" />
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {isOtherFinanceSelected ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Loan Amount</label>
                      <input value={regLoanAmount} onChange={(e) => setRegLoanAmount(e.target.value)} className={inputClass} placeholder="Enter loan amount" />
                      {calculatedLoanMonthlyInterest !== null && (
                        <p className="mt-1 text-[11px] font-semibold text-cyan-700">
                          Estimated Monthly Interest: {calculatedLoanMonthlyInterest.toFixed(2)}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Loan Details</label>
                      <textarea
                        value={regLoanDetails}
                        onChange={(e) => setRegLoanDetails(e.target.value)}
                        className={`${inputClass} min-h-[108px]`}
                        placeholder="Enter loan purpose/details"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Make / Model</label>
                        <input value={regMakeModel} onChange={(e) => setRegMakeModel(e.target.value)} className={inputClass} placeholder="e.g. Toyota Axio" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Year</label>
                        <input value={regVehicleYear} onChange={(e) => setRegVehicleYear(e.target.value)} className={inputClass} placeholder="e.g. 2020" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Asset Reference</label>
                        <input value={regAssetRef} onChange={(e) => setRegAssetRef(e.target.value)} className={inputClass} placeholder="Optional ref" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">{isVehicleFinanceSelected ? 'Vehicle Value' : 'Equipment Value'}</label>
                        <input value={regAmount} onChange={(e) => setRegAmount(e.target.value)} className={inputClass} placeholder="Total value" />
                      </div>
                      {isDraftLoanSelected && (
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Draft Value</label>
                          <input value={regDraftValue} onChange={(e) => setRegDraftValue(e.target.value)} className={inputClass} placeholder="Draft value to issue" />
                          {Number.isFinite(calculatedSpeedDraftMonthlyInterest || NaN) && (calculatedSpeedDraftMonthlyInterest || 0) >= 0 && (
                            <p className="mt-1 text-[11px] font-semibold text-cyan-700">
                              Estimated Monthly Interest: {(calculatedSpeedDraftMonthlyInterest as number).toFixed(2)}
                            </p>
                          )}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Down Payment</label>
                        <input
                          value={isDraftLoanSelected && Number.isFinite(Number(regDraftValue)) && Number(regDraftValue) > 0 && Number(regAmount) >= Number(regDraftValue)
                            ? String((Number(regAmount) - Number(regDraftValue)).toFixed(2))
                            : regDownPayment}
                          onChange={(e) => setRegDownPayment(e.target.value)}
                          className={inputClass}
                          placeholder="Customer contribution"
                          readOnly={isDraftLoanSelected && Number.isFinite(Number(regDraftValue)) && Number(regDraftValue) > 0}
                        />
                        {isDraftLoanSelected && (
                          <p className="mt-1 text-[11px] text-slate-500">For Speed Draft, Down Payment is auto-derived as Vehicle Value - Draft Value.</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Valuation Amount</label>
                        <input value={regValuationAmount} onChange={(e) => setRegValuationAmount(e.target.value)} className={inputClass} placeholder="Valued amount" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Valuation Date</label>
                        <input type="date" value={regValuationDate} onChange={(e) => setRegValuationDate(e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Valuer Name</label>
                        <input value={regValuerName} onChange={(e) => setRegValuerName(e.target.value)} className={inputClass} placeholder="Valuer" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {registerStep === 4 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Shield}
                  title="Guarantor profile"
                  description="Capture one or more guarantors for risk mitigation and security."
                />
                <div className="space-y-3">
                  {regGuarantors.map((guarantor, index) => (
                    <div key={`guarantor-${index}`} className="rounded-xl border border-cyan-100 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Guarantor {index + 1}</p>
                        {regGuarantors.length > 1 && (
                          <button type="button" onClick={() => setRegGuarantors((prev) => prev.filter((_, i) => i !== index))} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100">Remove</button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Guarantor Name</label>
                          <input value={guarantor.name} onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, name: e.target.value } : g))} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">NIC</label>
                          <input value={guarantor.nic} onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, nic: e.target.value } : g))} className={inputClass} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Phone</label>
                          <input value={guarantor.phone} onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, phone: e.target.value } : g))} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Address</label>
                          <input value={guarantor.address} onChange={(e) => setRegGuarantors((prev) => prev.map((g, i) => i === index ? { ...g, address: e.target.value } : g))} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={() => setRegGuarantors((prev) => [...prev, { name: '', nic: '', phone: '', address: '' }])} className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50">
                    + Add Another Guarantor
                  </button>
                </div>
              </div>
            )}

            {registerStep === 5 && !isDraftLoanSelected && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Calculator}
                  title="Repayment plan"
                  description="Define installment mode, scheduling, and optional custom payment loops."
                />

                <div className="rounded-xl border border-cyan-100 bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Monthly Payment Mode</label>
                    <select
                      value={regInstallmentMode}
                      onChange={(e) => setRegInstallmentMode(e.target.value as 'auto' | 'manual')}
                      className={inputClass}
                    >
                      <option value="auto">Auto Calculate</option>
                      <option value="manual">Manual Monthly Payment</option>
                    </select>
                  </div>

                  {regInstallmentMode === 'manual' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Base Installment Amount</label>
                        <input
                          value={regManualInstallmentAmount}
                          onChange={(e) => setRegManualInstallmentAmount(e.target.value)}
                          className={inputClass}
                          placeholder="e.g. 25000"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="text-slate-600">
                            Calculated from lease amount, interest, tenure: <span className="font-semibold text-cyan-800">{calculatedBaseInstallment ? calculatedBaseInstallment.toFixed(2) : '-'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (!calculatedBaseInstallment || calculatedBaseInstallment <= 0) {
                                setErrorMessage('Enter valid lease amount, interest rate and tenure to calculate installment.');
                                return;
                              }
                              setErrorMessage('');
                              setRegManualInstallmentAmount(calculatedBaseInstallment.toFixed(2));
                            }}
                            className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 font-semibold text-cyan-800 hover:bg-cyan-100"
                          >
                            Use Calculated
                          </button>
                        </div>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMessage('');
                            generateInstallmentPlan();
                          }}
                          className="w-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                        >
                          Generate Installment Loop by Tenure
                        </button>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Scheduling Mode</label>
                    <select
                      value={regScheduleMode}
                      onChange={(e) => setRegScheduleMode(e.target.value as 'auto' | 'fixed_day' | 'custom_date')}
                      className={inputClass}
                    >
                      <option value="auto">Auto (Based on Start Date + Frequency)</option>
                      <option value="fixed_day">Fixed Day of Month</option>
                      <option value="custom_date">Custom First Installment Date</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Grace Period (Days)</label>
                    <input
                      value={regGraceDays}
                      onChange={(e) => setRegGraceDays(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. 0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">First Installment Date</label>
                    <input
                      type="date"
                      value={regFirstInstallmentDate}
                      onChange={(e) => setRegFirstInstallmentDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Installment Frequency</label>
                    <select
                      value={regFrequency}
                      onChange={(e) => setRegFrequency(e.target.value)}
                      className={inputClass}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  {regScheduleMode === 'fixed_day' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Collection Day of Month</label>
                      <input
                        value={regCollectionDayOfMonth}
                        onChange={(e) => setRegCollectionDayOfMonth(e.target.value)}
                        className={inputClass}
                        placeholder="1-31"
                      />
                    </div>
                  )}
                </div>

                {regInstallmentMode === 'manual' && (
                  <div className="rounded-xl border border-cyan-100 bg-white p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <button type="button" onClick={applyEqualAmounts} className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50">Apply Same for All</button>
                      <div>
                        <input value={regYear1Amount} onChange={(e) => setRegYear1Amount(e.target.value)} className={inputClassSm} placeholder="Year 1 amount" />
                      </div>
                      <div>
                        <input value={regYear2Amount} onChange={(e) => setRegYear2Amount(e.target.value)} className={inputClassSm} placeholder="Year 2 amount" />
                      </div>
                      <div>
                        <input value={regYear3PlusAmount} onChange={(e) => setRegYear3PlusAmount(e.target.value)} className={inputClassSm} placeholder="Year 3+ amount" />
                      </div>
                      <button type="button" onClick={applyYearlyStepUp} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">Apply Year Step-Up</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <input value={regBulkRegularAmount} onChange={(e) => setRegBulkRegularAmount(e.target.value)} className={inputClassSm} placeholder="Regular installment amount" />
                      </div>
                      <div>
                        <input value={regBulkLastAmount} onChange={(e) => setRegBulkLastAmount(e.target.value)} className={inputClassSm} placeholder="Last bulk payment amount" />
                      </div>
                      <button type="button" onClick={applyBulkLastPayment} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100">Apply Bulk Last Payment</button>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="grid grid-cols-12 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        <div className="col-span-2">Installment</div>
                        <div className="col-span-5">Payment Date</div>
                        <div className="col-span-5">Amount</div>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                        {regInstallmentPlan.map((row, index) => (
                          <div key={`plan-${row.installment_no}`} className="grid grid-cols-12 items-center px-3 py-2 gap-2">
                            <div className="col-span-2 text-xs font-semibold text-slate-700">#{row.installment_no}</div>
                            <div className="col-span-5">
                              <input
                                type="date"
                                value={row.payment_date}
                                onChange={(e) => setRegInstallmentPlan((prev) => prev.map((r, i) => i === index ? { ...r, payment_date: e.target.value } : r))}
                                className={inputClassSm}
                              />
                            </div>
                            <div className="col-span-5">
                              <input
                                value={row.amount}
                                onChange={(e) => setRegInstallmentPlan((prev) => prev.map((r, i) => i === index ? { ...r, amount: e.target.value } : r))}
                                className={inputClassSm}
                                placeholder="Amount"
                              />
                            </div>
                          </div>
                        ))}
                        {regInstallmentPlan.length === 0 && (
                          <div className="px-3 py-6 text-xs text-slate-500 text-center">Generate installment loop to edit payment dates and values.</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                      Installments: <span className="font-semibold">{regInstallmentPlan.length}</span> | Planned Total: <span className="font-semibold">{totalPlannedInstallments.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {registerStep === 6 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={User}
                  title="Family & financial"
                  description="Capture household and financial profile similar to microfinance onboarding."
                />

                <div className="rounded-xl border border-cyan-100 bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Family Members Count</label>
                    <input value={regFamilyMembersCount} onChange={(e) => setRegFamilyMembersCount(e.target.value)} className={inputClass} placeholder="e.g. 4" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Dependents Count</label>
                    <input value={regDependentsCount} onChange={(e) => setRegDependentsCount(e.target.value)} className={inputClass} placeholder="e.g. 2" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Employment Type</label>
                    <input value={regEmploymentType} onChange={(e) => setRegEmploymentType(e.target.value)} className={inputClass} placeholder="e.g. Salaried / Business" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Main Income Source</label>
                    <input value={regMainIncomeSource} onChange={(e) => setRegMainIncomeSource(e.target.value)} className={inputClass} placeholder="Primary income source" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Monthly Household Income</label>
                    <input value={regMonthlyHouseholdIncome} onChange={(e) => setRegMonthlyHouseholdIncome(e.target.value)} className={inputClass} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Monthly Household Expenses</label>
                    <input value={regMonthlyHouseholdExpenses} onChange={(e) => setRegMonthlyHouseholdExpenses(e.target.value)} className={inputClass} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Existing Loan Commitments</label>
                    <input value={regExistingLoanCommitments} onChange={(e) => setRegExistingLoanCommitments(e.target.value)} className={inputClass} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Banking Relationship</label>
                    <input value={regBankingRelationship} onChange={(e) => setRegBankingRelationship(e.target.value)} className={inputClass} placeholder="Bank / account relationship" />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Notes</label>
                    <textarea value={regFamilyFinancialNotes} onChange={(e) => setRegFamilyFinancialNotes(e.target.value)} className={`${inputClass} min-h-[92px]`} placeholder="Family and financial background notes" />
                  </div>
                </div>
              </div>
            )}

            {registerStep === 7 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Car}
                  title="Residence images"
                  description="Upload residence environment photos similar to microfinance loan request."
                />
                <div className="rounded-2xl border-2 border-dashed border-cyan-200 bg-white p-6 text-center">
                  <p className="text-sm font-semibold text-slate-800">Attach residence images</p>
                  <p className="text-xs text-slate-500 mt-1">House front, interior, environment, utilities, and related proof images.</p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const incoming = Array.from(e.target.files || []);
                      if (incoming.length === 0) return;
                      setRegResidenceImages((prev) => {
                        const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
                        const uniqueIncoming = incoming.filter((f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`));
                        return [...prev, ...uniqueIncoming];
                      });
                      e.currentTarget.value = '';
                    }}
                    className="mt-4 w-full max-w-md mx-auto text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
                  />
                </div>
                {regResidenceImages.length > 0 && (
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 text-xs text-slate-700 space-y-2">
                    {regResidenceImages.map((f, index) => (
                      <div key={`${f.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-cyan-100">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setRegResidenceImages((prev) => prev.filter((_, i) => i !== index))}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <X className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {registerStep === 8 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={Calculator}
                  title="Evaluation"
                  description="Capture income activities, liabilities, household expenses, business flow, and recommendation."
                />

                <div className="rounded-xl border border-cyan-100 bg-white p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Income Generation Activities</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {incomeGenerationActivityOptions.map((item) => {
                        const checked = regEvaluationIncomeActivities.includes(item);
                        return (
                          <label key={item} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${checked ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setRegEvaluationIncomeActivities((prev) => {
                                  if (e.target.checked) return [...prev, item];
                                  return prev.filter((entry) => entry !== item);
                                });
                              }}
                            />
                            {item}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Business 1</label>
                      <input value={regEvaluationBusiness1} onChange={(e) => setRegEvaluationBusiness1(e.target.value)} className={inputClassSm} placeholder="Business / activity" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Monthly Income (LKR)</label>
                      <input value={regEvaluationBusiness1MonthlyIncome} onChange={(e) => setRegEvaluationBusiness1MonthlyIncome(e.target.value)} className={inputClassSm} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Business 2</label>
                      <input value={regEvaluationBusiness2} onChange={(e) => setRegEvaluationBusiness2(e.target.value)} className={inputClassSm} placeholder="Business / activity" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Monthly Income (LKR)</label>
                      <input value={regEvaluationBusiness2MonthlyIncome} onChange={(e) => setRegEvaluationBusiness2MonthlyIncome(e.target.value)} className={inputClassSm} placeholder="0.00" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Reason for Requested Loan</label>
                      <input value={regEvaluationLoanReason} onChange={(e) => setRegEvaluationLoanReason(e.target.value)} className={inputClassSm} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">House Ownership</label>
                      <input value={regEvaluationHouseOwnership} onChange={(e) => setRegEvaluationHouseOwnership(e.target.value)} className={inputClassSm} placeholder="Own / Rent / Parent" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Vehicle Assets</label>
                      <input value={regEvaluationVehicleAssets} onChange={(e) => setRegEvaluationVehicleAssets(e.target.value)} className={inputClassSm} placeholder="Type and count" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Wall Material</label>
                      <input value={regEvaluationWallMaterial} onChange={(e) => setRegEvaluationWallMaterial(e.target.value)} className={inputClassSm} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Floor Material</label>
                      <input value={regEvaluationFloorMaterial} onChange={(e) => setRegEvaluationFloorMaterial(e.target.value)} className={inputClassSm} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Roof Material</label>
                      <input value={regEvaluationRoofMaterial} onChange={(e) => setRegEvaluationRoofMaterial(e.target.value)} className={inputClassSm} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-cyan-100 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Other Loans</p>
                      <input value={regEvaluationOtherLoansDetails} onChange={(e) => setRegEvaluationOtherLoansDetails(e.target.value)} className={inputClassSm} placeholder="Loan details" />
                      <input value={regEvaluationOtherLoansMonthlyInstallment} onChange={(e) => setRegEvaluationOtherLoansMonthlyInstallment(e.target.value)} className={`${inputClassSm} mt-2`} placeholder="Monthly installment total (LKR)" />
                    </div>
                    <div className="rounded-lg border border-cyan-100 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Leasing Facility</p>
                      <input value={regEvaluationLeasingDetails} onChange={(e) => setRegEvaluationLeasingDetails(e.target.value)} className={inputClassSm} placeholder="Leasing details" />
                      <input value={regEvaluationLeasingMonthlyInstallment} onChange={(e) => setRegEvaluationLeasingMonthlyInstallment(e.target.value)} className={`${inputClassSm} mt-2`} placeholder="Monthly installment total (LKR)" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-cyan-100 overflow-hidden">
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-cyan-800">A. Family Expenses</div>
                      <div className="p-3 space-y-2">
                        {familyExpenseRows.map((row) => (
                          <div key={row.key} className="grid grid-cols-[52px_1fr_120px] gap-2 items-center">
                            <span className="text-[11px] font-semibold text-slate-500">{row.no}</span>
                            <span className="text-xs text-slate-700">{row.label}</span>
                            <input value={regEvaluationFamilyExpenseBreakdown[row.key] || ''} onChange={(e) => updateFamilyExpenseValue(row.key, e.target.value)} className={inputClassSm} placeholder="0.00" />
                          </div>
                        ))}
                      </div>
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold text-slate-900">Total: {formatAmount(familyExpenseTotal)}</div>
                    </div>

                    <div className="rounded-lg border border-cyan-100 overflow-hidden">
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-cyan-800">B. Family Income</div>
                      <div className="p-3 grid grid-cols-1 gap-2">
                        <input value={regEvaluationFamilyIncomeWithoutBusiness} onChange={(e) => setRegEvaluationFamilyIncomeWithoutBusiness(e.target.value)} className={inputClassSm} placeholder="Income without business" />
                        <input value={regEvaluationFamilyIncomeItem1} onChange={(e) => setRegEvaluationFamilyIncomeItem1(e.target.value)} className={inputClassSm} placeholder="Income item 1" />
                        <input value={regEvaluationFamilyIncomeItem2} onChange={(e) => setRegEvaluationFamilyIncomeItem2(e.target.value)} className={inputClassSm} placeholder="Income item 2" />
                        <input value={regEvaluationFamilyIncomeItem3} onChange={(e) => setRegEvaluationFamilyIncomeItem3(e.target.value)} className={inputClassSm} placeholder="Income item 3" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <input value={regEvaluationWageEarner1Name} onChange={(e) => setRegEvaluationWageEarner1Name(e.target.value)} className={inputClassSm} placeholder="Wage earner 1 name" />
                          <input value={regEvaluationWageEarner1Salary} onChange={(e) => setRegEvaluationWageEarner1Salary(e.target.value)} className={inputClassSm} placeholder="Wage earner 1 salary" />
                          <input value={regEvaluationWageEarner2Name} onChange={(e) => setRegEvaluationWageEarner2Name(e.target.value)} className={inputClassSm} placeholder="Wage earner 2 name" />
                          <input value={regEvaluationWageEarner2Salary} onChange={(e) => setRegEvaluationWageEarner2Salary(e.target.value)} className={inputClassSm} placeholder="Wage earner 2 salary" />
                          <input value={regEvaluationWageEarner3Name} onChange={(e) => setRegEvaluationWageEarner3Name(e.target.value)} className={inputClassSm} placeholder="Wage earner 3 name" />
                          <input value={regEvaluationWageEarner3Salary} onChange={(e) => setRegEvaluationWageEarner3Salary(e.target.value)} className={inputClassSm} placeholder="Wage earner 3 salary" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <input value={regEvaluationRentOutHouse} onChange={(e) => setRegEvaluationRentOutHouse(e.target.value)} className={inputClassSm} placeholder="Rent out house" />
                          <input value={regEvaluationRentOutVehicle} onChange={(e) => setRegEvaluationRentOutVehicle(e.target.value)} className={inputClassSm} placeholder="Rent out vehicle" />
                          <input value={regEvaluationInterestCommission} onChange={(e) => setRegEvaluationInterestCommission(e.target.value)} className={inputClassSm} placeholder="Interest / commission" />
                          <input value={regEvaluationOtherIncome} onChange={(e) => setRegEvaluationOtherIncome(e.target.value)} className={inputClassSm} placeholder="Other income" />
                        </div>
                      </div>
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold text-slate-900">Total: {formatAmount(familyIncomeTotal)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-cyan-100 overflow-hidden">
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-cyan-800">C. Business Expenses</div>
                      <div className="p-3 space-y-2">
                        {businessExpenseRows.map((row) => (
                          <div key={row.key} className="grid grid-cols-[52px_1fr_120px] gap-2 items-center">
                            <span className="text-[11px] font-semibold text-slate-500">{row.no}</span>
                            <span className="text-xs text-slate-700">{row.label}</span>
                            <input value={regEvaluationBusinessExpenseBreakdown[row.key] || ''} onChange={(e) => updateBusinessExpenseValue(row.key, e.target.value)} className={inputClassSm} placeholder="0.00" />
                          </div>
                        ))}
                      </div>
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold text-slate-900">Total: {formatAmount(businessExpenseTotal)}</div>
                    </div>

                    <div className="rounded-lg border border-cyan-100 overflow-hidden">
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-cyan-800">D. Business Income</div>
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input value={regEvaluationBusiness1UnitPrice} onChange={(e) => setRegEvaluationBusiness1UnitPrice(e.target.value)} className={inputClassSm} placeholder="Business 1 unit selling price" />
                          <input value={regEvaluationBusiness1Units} onChange={(e) => setRegEvaluationBusiness1Units(e.target.value)} className={inputClassSm} placeholder="Business 1 units" />
                          <input value={regEvaluationBusiness2UnitPrice} onChange={(e) => setRegEvaluationBusiness2UnitPrice(e.target.value)} className={inputClassSm} placeholder="Business 2 unit selling price" />
                          <input value={regEvaluationBusiness2Units} onChange={(e) => setRegEvaluationBusiness2Units(e.target.value)} className={inputClassSm} placeholder="Business 2 units" />
                        </div>
                      </div>
                      <div className="bg-cyan-50 px-3 py-2 text-xs font-bold text-slate-900">Total: {formatAmount(businessIncomeTotal)}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/30 p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg bg-white border border-cyan-100 p-2">
                      <p className="font-semibold text-slate-600">Total Income with Business (C)</p>
                      <p className="text-sm font-bold text-slate-900">{formatAmount(totalIncomeWithBusiness)}</p>
                    </div>
                    <div className="rounded-lg bg-white border border-cyan-100 p-2">
                      <p className="font-semibold text-slate-600">Loan + Leasing Monthly (D)</p>
                      <p className="text-sm font-bold text-slate-900">{formatAmount(loanAndLeasingTotal)}</p>
                    </div>
                    <div className="rounded-lg bg-white border border-cyan-100 p-2">
                      <p className="font-semibold text-slate-600">Loan + Family Expenses (E)</p>
                      <p className="text-sm font-bold text-slate-900">{formatAmount(loanPaymentsAndFamilyExpensesTotal)}</p>
                    </div>
                    <div className="rounded-lg bg-white border border-cyan-100 p-2">
                      <p className="font-semibold text-slate-600">Remaining / Week</p>
                      <p className="text-sm font-bold text-emerald-700">{formatAmount(averageCashPerWeek)}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Liabilities Summary</label>
                    <textarea value={regEvaluationOtherLiabilities} onChange={(e) => setRegEvaluationOtherLiabilities(e.target.value)} className={`${inputClass} min-h-[76px]`} placeholder="Outstanding loans, guarantees, and liabilities" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Officer Recommendation</label>
                    <textarea value={regEvaluationRecommendation} onChange={(e) => setRegEvaluationRecommendation(e.target.value)} className={`${inputClass} min-h-[100px]`} placeholder="Final recommendation and risk remarks" />
                  </div>
                </div>
              </div>
            )}

            {registerStep === 9 && (
              <div className="space-y-4">
                <SectionHeader
                  icon={FileText}
                  title="Supporting documents"
                  description="Upload files now or add them later after registration."
                />
                <div className="rounded-2xl border-2 border-dashed border-cyan-200 bg-white p-6 text-center">
                  <FileText className="mx-auto h-10 w-10 text-cyan-400" />
                  <p className="mt-2 text-sm font-semibold text-slate-800">Attach finance documents</p>
                  <p className="text-xs text-slate-500 mt-1">NIC copies, valuation reports, agreements, etc.</p>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setRegDocuments(Array.from(e.target.files || []))}
                    className="mt-4 w-full max-w-md mx-auto text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-700"
                  />
                </div>
                {regDocuments.length > 0 && (
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 text-xs text-slate-700 space-y-1">
                    {regDocuments.map((f, index) => (
                      <div key={`${f.name}-${index}`}>{f.name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-5 sm:px-6 py-4 border-t border-cyan-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-slate-500">
              Step {activeWizardIndex + 1}/{visibleWizardSteps.length}:{' '}
              <span className="font-semibold text-slate-700">{activeWizardStep.label}</span>
            </div>

            <div className="flex items-center gap-2">
              {registerStep >= 3 && (
                <button
                  type="button"
                  onClick={saveCurrentDraft}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition"
                >
                  Save Draft
                </button>
              )}
              {registerStep > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = visibleWizardSteps.findIndex((s) => s.id === registerStep);
                    if (currentIndex > 0) {
                      setRegisterStep(visibleWizardSteps[currentIndex - 1].id);
                    }
                  }}
                  className="rounded-xl border border-cyan-200 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 transition"
                >
                  Previous
                </button>
              )}
              {registerStep !== visibleWizardSteps[visibleWizardSteps.length - 1]?.id && (
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
                >
                  Continue
                </button>
              )}
              {registerStep === visibleWizardSteps[visibleWizardSteps.length - 1]?.id && (
                <button
                  type="button"
                  disabled={savingRegister}
                  onClick={submitRegister}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-cyan-700 hover:to-blue-700 disabled:opacity-60 transition"
                >
                  <Banknote className="h-4 w-4" />
                  {savingRegister ? 'Saving…' : 'Complete registration'}
                </button>
              )}
            </div>
          </div>
        </div>

          <aside className="xl:sticky xl:top-6 space-y-4">
            <div className="rounded-3xl border border-cyan-100 bg-white/88 backdrop-blur-md shadow-[0_16px_30px_rgba(14,116,144,0.12)] overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-700 to-blue-700 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-100">Application summary</p>
                <p className="text-sm font-bold text-white mt-0.5">Live preview</p>
              </div>
              <div className="p-4 space-y-3 text-[13px]">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{applicationSummary.customerLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Product</p>
                  <p className="font-semibold text-slate-900 mt-0.5 capitalize">{applicationSummary.productLabel}</p>
                  <p className="text-xs text-slate-500 capitalize">{applicationSummary.financeTypeLabel}</p>
                </div>
                {interestRateSummary && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Interest rate</p>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {formatRatePercent(interestRateSummary.annual)}% p.a.
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatRatePercent(interestRateSummary.monthly)}% monthly · {regInterestType}
                    </p>
                  </div>
                )}
                {applicationSummary.financedAmount !== null && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Financed amount</p>
                    <p className="font-semibold text-cyan-800 mt-0.5 tabular-nums">
                      LKR {formatAmount(applicationSummary.financedAmount)}
                    </p>
                  </div>
                )}
                {applicationSummary.installmentPreview && !isDraftLoanSelected && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Est. installment</p>
                    <p className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                      LKR {formatAmount(applicationSummary.installmentPreview)}
                    </p>
                  </div>
                )}
                {isDraftLoanSelected && applicationSummary.draftMonthlyInterest !== null && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Draft monthly interest</p>
                    <p className="font-semibold text-amber-800 mt-0.5 tabular-nums">
                      LKR {formatAmount(applicationSummary.draftMonthlyInterest)}
                    </p>
                  </div>
                )}
                {shouldShowLoanMonthlyInterest && applicationSummary.loanMonthlyInterest !== null && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Monthly interest</p>
                    <p className="font-semibold text-cyan-800 mt-0.5 tabular-nums">
                      LKR {formatAmount(applicationSummary.loanMonthlyInterest)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-100 bg-white/88 backdrop-blur-md shadow-[0_16px_30px_rgba(14,116,144,0.1)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Step checklist</p>
              <ul className="space-y-2">
                {visibleWizardSteps.map((step) => {
                  const isActive = registerStep === step.id;
                  const isDone = registerStep > step.id;
                  return (
                    <li
                      key={step.id}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
                        isActive
                          ? 'bg-cyan-50 border border-cyan-200 text-cyan-900 font-semibold'
                          : isDone
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                      }`}
                    >
                      <span
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          isActive
                            ? 'bg-cyan-600 text-white'
                            : isDone
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isDone ? <Check className="h-3 w-3" /> : step.id}
                      </span>
                      {step.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>

        <div className="mt-6 rounded-3xl border border-amber-200 bg-white/88 backdrop-blur-md shadow-[0_18px_34px_rgba(217,119,6,0.16)] overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-100">Continue later</p>
            <h3 className="text-sm font-bold text-white">Started drafts</h3>
          </div>
          <div className="p-4">
            {savedDrafts.length === 0 ? (
              <p className="text-sm text-slate-500">No started drafts yet. Complete up to step 3 and click Save Draft.</p>
            ) : (
              <div className="space-y-3">
                {savedDrafts.map((draft) => (
                  <div key={draft.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{draft.label}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Step {draft.snapshot.registerStep || 1} · Updated {new Date(draft.updatedAt).toLocaleString()}
                      </p>
                      {draft.snapshot.vehicleImageNames.length > 0 || draft.snapshot.vehicleCrFileName || draft.snapshot.residenceImageNames.length > 0 || draft.snapshot.documentNames.length > 0 ? (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Saved file names: {[
                            ...draft.snapshot.vehicleImageNames,
                            ...(draft.snapshot.vehicleCrFileName ? [draft.snapshot.vehicleCrFileName] : []),
                            ...draft.snapshot.residenceImageNames,
                            ...draft.snapshot.documentNames,
                          ].join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => loadDraftToForm(draft)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDraft(draft.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeDraftId && (
              <p className="mt-3 text-xs font-semibold text-emerald-700">
                Active draft loaded. Continue from the saved step and reattach files before final submit.
              </p>
            )}
          </div>
        </div>

        {showProductTypeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
            <div className="w-full max-w-2xl rounded-2xl border border-cyan-100 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100">Finance setup</p>
                  <h3 className="text-lg font-bold text-white">Add product type</h3>
                </div>
                <button
                  type="button"
                  onClick={resetProductTypeModal}
                  className="rounded-lg border border-white/30 bg-white/10 p-1.5 text-white hover:bg-white/20 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Type Name</label>
                    <input
                      value={newProductTypeName}
                      onChange={(e) => setNewProductTypeName(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Balloon Lease"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Description</label>
                    <input
                      value={newProductTypeDescription}
                      onChange={(e) => setNewProductTypeDescription(e.target.value)}
                      className={inputClass}
                      placeholder="Optional description"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">Default interest & terms</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {showNewProductInterestTerms
                          ? 'Set default rate, type, tenure, and frequency for this product.'
                          : 'Turn on to configure product interest settings.'}
                      </p>
                      {!showNewProductInterestTerms && (
                        <p className="mt-2 text-xs font-semibold text-cyan-800 truncate">
                          {newProductInterestRate || '-'}% {newProductInterestRatePeriod} · {newProductInterestType} · {newProductTenureMonths} mo · {newProductFrequency}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showNewProductInterestTerms}
                      aria-label="Show product interest settings"
                      onClick={() => setShowNewProductInterestTerms((prev) => !prev)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 ${
                        showNewProductInterestTerms ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300 bg-slate-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          showNewProductInterestTerms ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {showNewProductInterestTerms && (
                    <div className="border-t border-slate-200 bg-white p-4 space-y-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Rate period</label>
                        <RatePeriodToggle
                          value={newProductInterestRatePeriod}
                          onChange={setNewProductInterestRatePeriod}
                        />
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2 mt-4">
                          Interest rate ({newProductInterestRatePeriod === 'monthly' ? 'monthly' : 'yearly'} %)
                        </label>
                        <input
                          value={newProductInterestRate}
                          onChange={(e) => setNewProductInterestRate(e.target.value)}
                          className={`${inputClass} text-base font-semibold min-h-[46px] max-w-md`}
                          placeholder={newProductInterestRatePeriod === 'monthly' ? 'e.g. 1.5' : 'e.g. 18'}
                          inputMode="decimal"
                        />
                        <p className="mt-2 text-xs text-slate-600">
                          Product types save the annual rate.{' '}
                          {newProductInterestRatePeriod === 'monthly'
                            ? 'Monthly entry is multiplied by 12 before saving.'
                            : 'Yearly entry is saved as entered.'}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Interest Type</label>
                          <select
                            value={newProductInterestType}
                            onChange={(e) => setNewProductInterestType(e.target.value as 'fixed' | 'reducing')}
                            className={inputClass}
                          >
                            <option value="fixed">Fixed</option>
                            <option value="reducing">Reducing</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Tenure (Months)</label>
                          <input
                            value={newProductTenureMonths}
                            onChange={(e) => setNewProductTenureMonths(e.target.value)}
                            className={inputClass}
                            placeholder="e.g. 36"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Installment Frequency</label>
                          <select
                            value={newProductFrequency}
                            onChange={(e) => setNewProductFrequency(e.target.value as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly')}
                            className={inputClass}
                          >
                            <option value="monthly">Monthly</option>
                            <option value="weekly">Weekly</option>
                            <option value="daily">Daily</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-cyan-100 bg-slate-50/50 px-5 py-4">
                <button
                  type="button"
                  onClick={resetProductTypeModal}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNewProductType}
                  disabled={savingProductType}
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-cyan-700 hover:to-blue-700 disabled:opacity-60 transition"
                >
                  {savingProductType ? 'Saving…' : 'Save product type'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
