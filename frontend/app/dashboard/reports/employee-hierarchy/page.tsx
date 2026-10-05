'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';

import {
  AccountingReportShell,
  ReportTable,
  SummaryCards,
  type CompanyOption,
} from '@/app/components/accounting/AccountingReportShell';

type AuthUser = {
  name?: string | null;
  email?: string | null;
  designation?: { name?: string | null } | null;
  roles?: Array<{ name?: string | null }>;
};

type HierarchyRow = {
  employee_id: number;
  employee_code?: string;
  employee_name?: string;
  employee_email?: string;
  status?: string;
  designation?: string;
  branch_name?: string;
  wallet_no?: string;
  wallet_status?: string;
  wallet_opening_balance?: number;
  wallet_current_balance?: number;
  manager_employee_id?: number | null;
  manager_name?: string | null;
  level: number;
  direct_reports: number;
  total_reports: number;
};

type ManagerOption = {
  employee_id: number;
  name?: string;
  direct_reports?: number;
  total_reports?: number;
};

type LevelDistribution = {
  level: number;
  count: number;
};

type ReportPayload = {
  scope?: {
    top_level_access?: boolean;
    scope_type?: string;
    scope_label?: string;
    branch_id?: number | null;
    allowed_branch_ids?: number[];
    allowed_branches?: Array<{ id: number; name: string }>;
    can_switch_branch?: boolean;
  };
  summary?: {
    total_employees?: number;
    managers?: number;
    individual_contributors?: number;
    top_level_employees?: number;
    max_level?: number;
  };
  level_distribution?: LevelDistribution[];
  manager_options?: ManagerOption[];
  rows?: HierarchyRow[];
};

type CollectionRow = {
  id?: number | string;
  collected_amount?: number | string | null;
  capital_amount?: number | string | null;
  interest_amount?: number | string | null;
  penalty_amount?: number | string | null;
  loan_request?: {
    field_officer?: string | null;
  } | null;
};

type PerformanceStats = {
  transactions: number;
  collected: number;
  capital: number;
  interest: number;
  penalty: number;
};

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function EmployeeHierarchyReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(Number(searchParams.get('branch_id') || 0) || null);

  const [scopeInfo, setScopeInfo] = useState<{
    top_level_access: boolean;
    scope_type: string;
    scope_label: string;
    branch_id: number | null;
    allowed_branch_ids: number[];
    allowed_branches: Array<{ id: number; name: string }>;
    can_switch_branch: boolean;
  }>({
    top_level_access: false,
    scope_type: 'branch_employee',
    scope_label: 'Branch Employee Scope',
    branch_id: null,
    allowed_branch_ids: [],
    allowed_branches: [],
    can_switch_branch: false,
  });
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [rows, setRows] = useState<HierarchyRow[]>([]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [levelDistribution, setLevelDistribution] = useState<LevelDistribution[]>([]);
  const [summary, setSummary] = useState({
    total_employees: 0,
    managers: 0,
    individual_contributors: 0,
    top_level_employees: 0,
    max_level: 0,
  });

  const [searchText, setSearchText] = useState('');
  const [managerFilter, setManagerFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [performanceByOfficer, setPerformanceByOfficer] = useState<Record<string, PerformanceStats>>({});

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);

    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser));
      } catch {
        setAuthUser(null);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadCompanies = async () => {
      setLoadingCompanies(true);
      try {
        const response = await axios.get('/api/companies', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const list = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        setCompanies(list);
        if (!selectedCompanyId && list.length > 0) {
          setSelectedCompanyId(Number(list[0].id));
        }
      } catch {
        setCompanies([]);
      } finally {
        setLoadingCompanies(false);
      }
    };

    void loadCompanies();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const loadReport = async () => {
      setLoading(true);
      setError('');
      try {
        const [userRes, reportRes, collectionRes] = await Promise.all([
          axios.get('/api/user', {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }),
          axios.get<ReportPayload>('/api/reports/employee-hierarchy', {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            params: {
              branch_id: selectedCompanyId || undefined,
            },
          }),
          axios.get('/api/microfinance/collections', {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            params: {
              branch_id: selectedCompanyId || undefined,
              today_only: true,
            },
          }),
        ]);

        const user = (userRes.data || null) as AuthUser | null;
        setAuthUser(user);
        localStorage.setItem('auth_user', JSON.stringify(user));

        const payload = reportRes.data || {};
        const normalizedAllowedIds = Array.isArray(payload.scope?.allowed_branch_ids)
          ? payload.scope?.allowed_branch_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
          : [];
        const normalizedAllowedBranches = Array.isArray(payload.scope?.allowed_branches)
          ? payload.scope.allowed_branches
            .map((branch) => ({
              id: Number(branch.id),
              name: String(branch.name || ''),
            }))
            .filter((branch) => Number.isFinite(branch.id) && branch.id > 0)
          : [];
        const appliedBranchId = Number(payload.scope?.branch_id || 0) || null;
        const canSwitchBranch = Boolean(payload.scope?.can_switch_branch);

        setScopeInfo({
          top_level_access: Boolean(payload.scope?.top_level_access),
          scope_type: String(payload.scope?.scope_type || 'branch_employee'),
          scope_label: String(payload.scope?.scope_label || 'Branch Employee Scope'),
          branch_id: appliedBranchId,
          allowed_branch_ids: normalizedAllowedIds,
          allowed_branches: normalizedAllowedBranches,
          can_switch_branch: canSwitchBranch,
        });

        if (!canSwitchBranch) {
          setSelectedCompanyId(appliedBranchId);
        } else if (appliedBranchId && !normalizedAllowedIds.includes(Number(selectedCompanyId || 0))) {
          setSelectedCompanyId(appliedBranchId);
        }

        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setManagerOptions(Array.isArray(payload.manager_options) ? payload.manager_options : []);
        setLevelDistribution(Array.isArray(payload.level_distribution) ? payload.level_distribution : []);
        setSummary({
          total_employees: Number(payload.summary?.total_employees || 0),
          managers: Number(payload.summary?.managers || 0),
          individual_contributors: Number(payload.summary?.individual_contributors || 0),
          top_level_employees: Number(payload.summary?.top_level_employees || 0),
          max_level: Number(payload.summary?.max_level || 0),
        });

        const rawCollections = collectionRes.data;
        const collections: CollectionRow[] = Array.isArray(rawCollections)
          ? rawCollections
          : Array.isArray(rawCollections?.data)
            ? rawCollections.data
            : [];

        const perfMap: Record<string, PerformanceStats> = {};
        collections.forEach((row) => {
          const officerKey = normalizeText(String(row.loan_request?.field_officer || ''));
          if (!officerKey) return;

          if (!perfMap[officerKey]) {
            perfMap[officerKey] = {
              transactions: 0,
              collected: 0,
              capital: 0,
              interest: 0,
              penalty: 0,
            };
          }

          perfMap[officerKey].transactions += 1;
          perfMap[officerKey].collected += Number(row.collected_amount || 0);
          perfMap[officerKey].capital += Number(row.capital_amount || 0);
          perfMap[officerKey].interest += Number(row.interest_amount || 0);
          perfMap[officerKey].penalty += Number(row.penalty_amount || 0);
        });

        setPerformanceByOfficer(perfMap);
      } catch (fetchError: unknown) {
        const message =
          axios.isAxiosError(fetchError) && typeof fetchError.response?.data?.message === 'string'
            ? fetchError.response?.data?.message
            : 'Failed to load employee hierarchy report.';

        setError(message);
        setRows([]);
        setManagerOptions([]);
        setLevelDistribution([]);
        setSummary({
          total_employees: 0,
          managers: 0,
          individual_contributors: 0,
          top_level_employees: 0,
          max_level: 0,
        });
        setPerformanceByOfficer({});
      } finally {
        setLoading(false);
      }
    };

    void loadReport();
  }, [token, selectedCompanyId]);

  const scopedBranchOptions = useMemo(() => {
    if (scopeInfo.top_level_access) {
      return companies;
    }

    if (scopeInfo.allowed_branches.length > 0) {
      return scopeInfo.allowed_branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
      }));
    }

    if (scopeInfo.allowed_branch_ids.length > 0) {
      return companies.filter((company) => scopeInfo.allowed_branch_ids.includes(Number(company.id)));
    }

    return companies;
  }, [companies, scopeInfo]);

  const scopeHint = useMemo(() => {
    const branchNames = scopedBranchOptions.map((branch) => branch.name).filter(Boolean);

    if (scopeInfo.scope_type === 'top_level') {
      return 'Top-level users can review all branches or switch a specific branch.';
    }

    if (scopeInfo.scope_type === 'regional_manager') {
      if (branchNames.length > 0) {
        return `Regional manager access: ${branchNames.join(', ')}`;
      }
      return 'Regional manager access is limited to assigned branches.';
    }

    if (scopeInfo.scope_type === 'branch_manager') {
      if (branchNames.length > 0) {
        return `Branch manager access: ${branchNames.join(', ')}`;
      }
      return 'Branch manager access is limited to managed branch employees.';
    }

    return 'Employee access is limited to own branch employees.';
  }, [scopeInfo.scope_type, scopedBranchOptions]);

  const visibleRows = useMemo(() => {
    const keyword = normalizeText(searchText);

    return rows.filter((row) => {
      if (managerFilter !== 'all') {
        const managerId = Number(managerFilter);
        if (Number(row.manager_employee_id || 0) !== managerId && Number(row.employee_id) !== managerId) {
          return false;
        }
      }

      if (levelFilter !== 'all' && Number(row.level) !== Number(levelFilter)) {
        return false;
      }

      if (!keyword) return true;

      const haystack = normalizeText([
        row.employee_code,
        row.employee_name,
        row.employee_email,
        row.designation,
        row.manager_name,
        row.branch_name,
      ]
        .filter(Boolean)
        .join(' '));

      return haystack.includes(keyword);
    });
  }, [rows, searchText, managerFilter, levelFilter]);

  const rowsByEmployeeId = useMemo(() => {
    const map = new Map<number, HierarchyRow>();
    rows.forEach((row) => {
      map.set(Number(row.employee_id), row);
    });
    return map;
  }, [rows]);

  const childrenByManagerId = useMemo(() => {
    const map = new Map<number, HierarchyRow[]>();
    rows.forEach((row) => {
      const managerId = Number(row.manager_employee_id || 0);
      if (!managerId) return;
      if (!map.has(managerId)) {
        map.set(managerId, []);
      }
      map.get(managerId)!.push(row);
    });
    return map;
  }, [rows]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return rowsByEmployeeId.get(selectedEmployeeId) || null;
  }, [selectedEmployeeId, rowsByEmployeeId]);

  const directReportedEmployees = useMemo(() => {
    if (!selectedEmployee) return [];
    return (childrenByManagerId.get(Number(selectedEmployee.employee_id)) || []).slice().sort((a, b) => {
      return String(a.employee_name || '').localeCompare(String(b.employee_name || ''));
    });
  }, [selectedEmployee, childrenByManagerId]);

  const selectedEmployeePerformance = useMemo(() => {
    if (!selectedEmployee) return { transactions: 0, collected: 0, capital: 0, interest: 0, penalty: 0 };
    return performanceByOfficer[normalizeText(String(selectedEmployee.employee_name || ''))] || {
      transactions: 0,
      collected: 0,
      capital: 0,
      interest: 0,
      penalty: 0,
    };
  }, [selectedEmployee, performanceByOfficer]);

  const teamPerformance = useMemo(() => {
    const summaryStats = {
      transactions: 0,
      collected: 0,
      capital: 0,
      interest: 0,
      penalty: 0,
    };

    directReportedEmployees.forEach((employee) => {
      const stats = performanceByOfficer[normalizeText(String(employee.employee_name || ''))] || {
        transactions: 0,
        collected: 0,
        capital: 0,
        interest: 0,
        penalty: 0,
      };

      summaryStats.transactions += stats.transactions;
      summaryStats.collected += stats.collected;
      summaryStats.capital += stats.capital;
      summaryStats.interest += stats.interest;
      summaryStats.penalty += stats.penalty;
    });

    return summaryStats;
  }, [directReportedEmployees, performanceByOfficer]);

  const teamWalletSummary = useMemo(() => {
    return directReportedEmployees.reduce(
      (acc, employee) => {
        acc.opening += Number(employee.wallet_opening_balance || 0);
        acc.current += Number(employee.wallet_current_balance || 0);
        if (String(employee.wallet_status || '').toLowerCase() === 'active') {
          acc.activeWallets += 1;
        }
        if (String(employee.wallet_no || '').trim() !== '') {
          acc.walletHolders += 1;
        }
        return acc;
      },
      {
        opening: 0,
        current: 0,
        activeWallets: 0,
        walletHolders: 0,
      }
    );
  }, [directReportedEmployees]);

  const visibleSummary = useMemo(() => {
    const managers = visibleRows.filter((row) => Number(row.direct_reports || 0) > 0).length;
    const topLevelEmployees = visibleRows.filter((row) => Number(row.level || 0) === 0).length;
    const maxLevel = visibleRows.reduce((max, row) => Math.max(max, Number(row.level || 0)), 0);

    return {
      total_employees: visibleRows.length,
      managers,
      individual_contributors: Math.max(visibleRows.length - managers, 0),
      top_level_employees: topLevelEmployees,
      max_level: maxLevel,
    };
  }, [visibleRows]);

  const levelBarMax = useMemo(
    () => levelDistribution.reduce((max, item) => Math.max(max, Number(item.count || 0)), 0),
    [levelDistribution]
  );

  return (
    <AccountingReportShell
      badge="Business Owner Monitoring"
      title="Employee Hierarchy Report"
      description="Monitor employee levels up/down and track who reports under each employee across your organization."
      error={error}
      actions={
        <button
          type="button"
          onClick={() => router.push('/dashboard/reports')}
          className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30"
        >
          <ArrowLeft size={14} /> Back to Reports
        </button>
      }
    >
      <div className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm space-y-4">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Access Scope</p>
          <p className="mt-1 text-sm font-semibold text-indigo-900">{scopeInfo.scope_label}</p>
          <p className="mt-1 text-xs text-indigo-800">{scopeHint}</p>
        </div>

        <h2 className="text-sm font-bold text-black">Monitor Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-black">Search Employee</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-violet-200 px-3 py-2 text-sm text-black"
              placeholder="Name, code, designation, reporting person"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-black">Manager</label>
            <select
              className="mt-1 w-full rounded-xl border border-violet-200 px-3 py-2 text-sm text-black"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            >
              <option value="all">All Managers</option>
              {managerOptions.map((manager) => (
                <option key={manager.employee_id} value={String(manager.employee_id)}>
                  {manager.name || 'Manager'} ({Number(manager.direct_reports || 0)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-black">Reporting Level</label>
            <select
              className="mt-1 w-full rounded-xl border border-violet-200 px-3 py-2 text-sm text-black"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              <option value="all">All Levels</option>
              {Array.from({ length: Math.max(summary.max_level, visibleSummary.max_level) + 1 }).map((_, idx) => (
                <option key={idx} value={String(idx)}>
                  Level {idx}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-black">Branch Scope</label>
            <select
              className="mt-1 w-full rounded-xl border border-violet-200 px-3 py-2 text-sm text-black"
              value={selectedCompanyId ?? ''}
              disabled={!scopeInfo.can_switch_branch || loadingCompanies}
              onChange={(e) => setSelectedCompanyId(Number(e.target.value) || null)}
            >
              {scopedBranchOptions.length === 0 && <option value="">No branches</option>}
              {scopedBranchOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {!scopeInfo.can_switch_branch && <p className="mt-1 text-[11px] text-slate-500">Scope locked by your role access.</p>}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-800 hover:bg-violet-50"
            onClick={() => {
              setSearchText('');
              setManagerFilter('all');
              setLevelFilter('all');
            }}
          >
            Reset Filters
          </button>
        </div>
      </div>

      <SummaryCards
        items={[
          { label: 'Total Employees', value: String(visibleSummary.total_employees), valueClass: 'text-black' },
          { label: 'Managers', value: String(visibleSummary.managers), valueClass: 'text-indigo-700' },
          { label: 'Contributors', value: String(visibleSummary.individual_contributors), valueClass: 'text-emerald-700' },
          { label: 'Top Level', value: String(visibleSummary.top_level_employees), valueClass: 'text-amber-700' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-black">Level Distribution</h3>
          <div className="mt-4 space-y-3">
            {levelDistribution.length === 0 && (
              <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
                No level distribution available.
              </div>
            )}

            {levelDistribution.map((row) => {
              const width = levelBarMax > 0 ? (Number(row.count || 0) / levelBarMax) * 100 : 0;
              return (
                <div key={row.level}>
                  <div className="mb-1 flex items-center justify-between text-xs text-black">
                    <span className="font-semibold">Level {row.level}</span>
                    <span>{row.count} employees</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-violet-100">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600"
                      style={{ width: `${Math.max(width, row.count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-black">Manager Team Size</h3>
          <div className="mt-4 max-h-72 overflow-y-auto rounded-2xl border border-violet-100">
            <table className="min-w-full text-sm">
              <thead className="bg-violet-50 text-black">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Manager</th>
                  <th className="px-3 py-2 text-right font-semibold">Direct</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {managerOptions.map((manager) => (
                  <tr key={manager.employee_id} className="border-t border-violet-100">
                    <td className="px-3 py-2 text-black">{manager.name || '-'}</td>
                    <td className="px-3 py-2 text-right text-black">{Number(manager.direct_reports || 0)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-black">{Number(manager.total_reports || 0)}</td>
                  </tr>
                ))}
                {managerOptions.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-slate-600">
                      No manager hierarchy in current scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ReportTable
        title="Employees Listed Under Reporting Levels"
        subtitle="Indentation shows reporting depth (level)."
        countLabel={`${visibleRows.length} employees`}
        loading={loading}
        hasData={visibleRows.length > 0}
        emptyTitle="No employees found"
        emptyMessage="Try changing branch or filter criteria."
      >
        <div className="overflow-x-auto rounded-2xl border border-violet-100">
          <table className="min-w-full text-sm">
            <thead className="bg-violet-50 text-black">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Employee</th>
                <th className="px-3 py-2 text-left font-semibold">Code</th>
                <th className="px-3 py-2 text-left font-semibold">Designation</th>
                <th className="px-3 py-2 text-left font-semibold">Reporting Person</th>
                <th className="px-3 py-2 text-center font-semibold">Level</th>
                <th className="px-3 py-2 text-right font-semibold">Direct</th>
                <th className="px-3 py-2 text-right font-semibold">Total Under</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Branch</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.employee_id} className="border-t border-violet-100">
                  <td className="px-3 py-2 font-semibold text-black">
                    <button
                      type="button"
                      onClick={() => setSelectedEmployeeId(Number(row.employee_id))}
                      className="text-left text-violet-800 hover:text-violet-600 hover:underline"
                    >
                      {`${'· '.repeat(Math.max(Number(row.level || 0), 0))}${row.employee_name || '-'}`}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-black">{row.employee_code || '-'}</td>
                  <td className="px-3 py-2 text-black">{row.designation || '-'}</td>
                  <td className="px-3 py-2 text-black">{row.manager_name || '-'}</td>
                  <td className="px-3 py-2 text-center text-black">L{Number(row.level || 0)}</td>
                  <td className="px-3 py-2 text-right text-black">{Number(row.direct_reports || 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-black">{Number(row.total_reports || 0)}</td>
                  <td className={`px-3 py-2 font-semibold ${normalizeText(String(row.status || '')).includes('active') ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {row.status || '-'}
                  </td>
                  <td className="px-3 py-2 text-black">{row.branch_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportTable>

      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-6 py-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Employee Monitoring Preview</h3>
                <p className="text-sm text-slate-600">{selectedEmployee.employee_name || '-'} ({selectedEmployee.employee_code || '-'})</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployeeId(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-white text-slate-600 hover:bg-violet-50"
                aria-label="Close preview"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[calc(90vh-80px)] overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">My Txn Today</p>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">{selectedEmployeePerformance.transactions}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">My Collection</p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-800">{selectedEmployeePerformance.collected.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Direct Reports</p>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">{directReportedEmployees.length}</p>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Team Txn Today</p>
                  <p className="mt-1 text-lg font-extrabold text-indigo-900">{teamPerformance.transactions}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Team Collection</p>
                  <p className="mt-1 text-lg font-extrabold text-amber-900">{formatMoney(teamPerformance.collected)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">My Wallet No</p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900">{String(selectedEmployee.wallet_no || '-')}</p>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">My Wallet Status</p>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">{String(selectedEmployee.wallet_status || '-')}</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">My Opening Wallet</p>
                  <p className="mt-1 text-lg font-extrabold text-blue-900">{formatMoney(Number(selectedEmployee.wallet_opening_balance || 0))}</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">My Current Wallet</p>
                  <p className="mt-1 text-lg font-extrabold text-blue-900">{formatMoney(Number(selectedEmployee.wallet_current_balance || 0))}</p>
                </div>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">Team Wallet Current</p>
                  <p className="mt-1 text-lg font-extrabold text-cyan-900">{formatMoney(teamWalletSummary.current)}</p>
                </div>
              </div>

              <section className="rounded-2xl border border-violet-100 bg-white">
                <div className="border-b border-violet-100 px-4 py-3">
                  <h4 className="text-sm font-extrabold text-slate-900">Reported Employees (Direct)</h4>
                  <p className="text-xs text-slate-600">Click any employee in the main table to inspect their own downline and performance.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-violet-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Employee</th>
                        <th className="px-3 py-2 text-left font-semibold">Designation</th>
                        <th className="px-3 py-2 text-center font-semibold">Level</th>
                        <th className="px-3 py-2 text-right font-semibold">My Txn</th>
                        <th className="px-3 py-2 text-right font-semibold">My Collection</th>
                        <th className="px-3 py-2 text-right font-semibold">Capital</th>
                        <th className="px-3 py-2 text-right font-semibold">Interest</th>
                        <th className="px-3 py-2 text-right font-semibold">Penalty</th>
                        <th className="px-3 py-2 text-right font-semibold">Wallet Open</th>
                        <th className="px-3 py-2 text-right font-semibold">Wallet Current</th>
                        <th className="px-3 py-2 text-left font-semibold">Wallet Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directReportedEmployees.map((employee) => {
                        const perf = performanceByOfficer[normalizeText(String(employee.employee_name || ''))] || {
                          transactions: 0,
                          collected: 0,
                          capital: 0,
                          interest: 0,
                          penalty: 0,
                        };

                        return (
                          <tr key={employee.employee_id} className="border-t border-violet-100">
                            <td className="px-3 py-2 font-semibold text-slate-900">{employee.employee_name || '-'}</td>
                            <td className="px-3 py-2 text-slate-700">{employee.designation || '-'}</td>
                            <td className="px-3 py-2 text-center text-slate-700">L{employee.level}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{perf.transactions}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{perf.capital.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{perf.interest.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{perf.penalty.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatMoney(Number(employee.wallet_opening_balance || 0))}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-800">{formatMoney(Number(employee.wallet_current_balance || 0))}</td>
                            <td className="px-3 py-2 text-slate-700">{String(employee.wallet_status || '-')}</td>
                          </tr>
                        );
                      })}

                      {directReportedEmployees.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                            No direct reported employees under this person.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </AccountingReportShell>
  );
}
