'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { getApiBaseUrl, getBackendOrigin } from '@/lib/api';
import { useWidgetsFixed, WidgetCloseGate } from '@/lib/useWidgetsFixed';

type AuthPermission = {
  id: number;
  name: string;
  module?: string | null;
  description?: string | null;
};

type AuthRole = {
  id: number;
  name: string;
  permissions?: AuthPermission[];
};

type AuthEmployeeWallet = {
  id?: number;
  employee_id?: number;
  wallet_no?: string;
  opening_balance?: number;
  current_balance?: number;
  status?: string;
};

type AuthEmployee = {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  branch_id?: number;
  branch_name?: string;
  branch?: {
    id?: number;
    name?: string;
  } | null;
  designation_id?: number;
  wallet?: AuthEmployeeWallet | null;
};

type AuthUser = {
  id: number;
  name?: string;
  email: string;
  branch_id?: number;
  branch?: {
    id?: number;
    name?: string;
  } | null;
  role?: string;
  designation?: { id?: number; name?: string } | null;
  roles?: AuthRole[];
  employee?: AuthEmployee | null;
};

type WalletSummary = {
  id?: number;
  wallet_no?: string;
  cash_in_hand?: number;
  total_deposited?: number;
  total_handed_over?: number;
  opening_balance?: number;
  status?: string;
};

type WalletBankAccount = {
  id: number;
  company_id?: number;
  account_type?: string;
  account_name?: string;
  bank_name?: string;
  account_number?: string;
  current_balance?: number;
};

type WalletDepositHistory = {
  id: number;
  amount?: number;
  deposit_date?: string;
  note?: string | null;
  bank_account?: {
    id?: number;
    account_name?: string;
    bank_name?: string;
    account_number?: string;
  } | null;
};

type WalletCashHandoverHistory = {
  id: number;
  amount?: number;
  handover_date?: string;
  received_by?: string | null;
  note?: string | null;
  manager_employee?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    employee_code?: string;
  } | null;
  cash_account?: {
    id?: number;
    account_name?: string;
    bank_name?: string;
    account_number?: string;
  } | null;
};

type WalletManager = {
  employee_id: number;
  user_id?: number;
  name: string;
  employee_code?: string;
};

type DashboardModule = {
  key: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  path: string;
};

type DashboardSetting = {
  key: string;
  icon: string;
  title: string;
  desc: string;
  color: string;
  path: string;
};

type NotificationPreviewItem = {
  id: number;
  title: string;
  type: string;
  is_read: boolean;
  is_important: boolean;
  created_at: string;
};

export default function Dashboard() {
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loadingPrivileges, setLoadingPrivileges] = useState(true);
  const [loadingWidgets, setLoadingWidgets] = useState(true);
  const [hiddenWidgetKeys, setHiddenWidgetKeys] = useState<Set<string>>(new Set());
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletBankAccounts, setWalletBankAccounts] = useState<WalletBankAccount[]>([]);
  const [walletManagers, setWalletManagers] = useState<WalletManager[]>([]);
  const [walletRecentDeposits, setWalletRecentDeposits] = useState<WalletDepositHistory[]>([]);
  const [walletRecentHandovers, setWalletRecentHandovers] = useState<WalletCashHandoverHistory[]>([]);
  const [walletNotice, setWalletNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: '',
  });
  const [depositModal, setDepositModal] = useState<{
    open: boolean;
    amount: string;
    bankAccountId: string;
    depositDate: string;
    note: string;
    saving: boolean;
  }>({
    open: false,
    amount: '',
    bankAccountId: '',
    depositDate: new Date().toISOString().slice(0, 10),
    note: '',
    saving: false,
  });
  const [accountPreviewOpen, setAccountPreviewOpen] = useState(false);
  const [handoverModal, setHandoverModal] = useState<{
    open: boolean;
    amount: string;
    managerEmployeeId: string;
    handoverDate: string;
    receivedBy: string;
    note: string;
    saving: boolean;
  }>({
    open: false,
    amount: '',
    managerEmployeeId: '',
    handoverDate: new Date().toISOString().slice(0, 10),
    receivedBy: '',
    note: '',
    saving: false,
  });
  const [restoreWidgetsModal, setRestoreWidgetsModal] = useState<{
    open: boolean;
    adminEmail: string;
    adminPassword: string;
    verifying: boolean;
  }>({
    open: false,
    adminEmail: '',
    adminPassword: '',
    verifying: false,
  });
  const [fixWidgetsModal, setFixWidgetsModal] = useState<{
    open: boolean;
    action: 'fix' | 'unfix';
    adminEmail: string;
    adminPassword: string;
    verifying: boolean;
  }>({
    open: false,
    action: 'fix',
    adminEmail: '',
    adminPassword: '',
    verifying: false,
  });
  const [notificationPreviewOpen, setNotificationPreviewOpen] = useState(false);
  const [notificationPreviewLoading, setNotificationPreviewLoading] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationTypeCounts, setNotificationTypeCounts] = useState<Record<string, number>>({});
  const [notificationPreviewItems, setNotificationPreviewItems] = useState<NotificationPreviewItem[]>([]);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorInput, setCalculatorInput] = useState('');
  const [calculatorResult, setCalculatorResult] = useState('0');
  const notificationPreviewRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiBaseUrl = getApiBaseUrl();
  const companyLogoUrl = `${getBackendOrigin()}/media/company/logo`;

  const formatCalculatorNumber = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      throw new Error('Invalid result');
    }

    if (Number.isInteger(value)) {
      return String(value);
    }

    return String(parseFloat(value.toFixed(12)));
  }, []);

  const evaluateScientificExpression = useCallback((rawExpression: string): number => {
    const expression = String(rawExpression || '')
      .replace(/\s+/g, '')
      .replace(/×/g, '*')
      .replace(/÷/g, '/');

    if (!expression) {
      throw new Error('Expression is empty');
    }

    type Token =
      | { type: 'number'; value: number }
      | { type: 'operator'; value: '+' | '-' | '*' | '/' | '%' | '^' }
      | { type: 'leftParen' }
      | { type: 'rightParen' }
      | { type: 'identifier'; value: string };

    const tokens: Token[] = [];
    const allowedFunctions = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'log', 'ln', 'abs', 'exp']);

    let index = 0;
    while (index < expression.length) {
      const char = expression[index];

      if (/[0-9.]/.test(char)) {
        let end = index + 1;
        while (end < expression.length && /[0-9.]/.test(expression[end])) {
          end += 1;
        }

        const numberValue = Number(expression.slice(index, end));
        if (!Number.isFinite(numberValue)) {
          throw new Error('Invalid number');
        }

        tokens.push({ type: 'number', value: numberValue });
        index = end;
        continue;
      }

      if (/[A-Za-zπ]/.test(char)) {
        let end = index + 1;
        while (end < expression.length && /[A-Za-z]/.test(expression[end])) {
          end += 1;
        }

        const identifier = expression.slice(index, end) === 'π' ? 'pi' : expression.slice(index, end).toLowerCase();
        if (identifier !== 'pi' && identifier !== 'e' && !allowedFunctions.has(identifier)) {
          throw new Error('Unsupported function');
        }

        tokens.push({ type: 'identifier', value: identifier });
        index = end;
        continue;
      }

      if (char === '(') {
        tokens.push({ type: 'leftParen' });
        index += 1;
        continue;
      }

      if (char === ')') {
        tokens.push({ type: 'rightParen' });
        index += 1;
        continue;
      }

      if (['+', '-', '*', '/', '%', '^'].includes(char)) {
        tokens.push({ type: 'operator', value: char as '+' | '-' | '*' | '/' | '%' | '^' });
        index += 1;
        continue;
      }

      throw new Error('Invalid character');
    }

    let cursor = 0;

    const match = (type: Token['type']) => tokens[cursor]?.type === type;
    const current = () => tokens[cursor];

    const parsePrimary = (): number => {
      const token = current();
      if (!token) {
        throw new Error('Unexpected end of expression');
      }

      if (token.type === 'number') {
        cursor += 1;
        return token.value;
      }

      if (token.type === 'identifier') {
        cursor += 1;

        if (token.value === 'pi') return Math.PI;
        if (token.value === 'e') return Math.E;

        if (!match('leftParen')) {
          throw new Error('Function requires parentheses');
        }

        cursor += 1;
        const innerValue = parseExpression();
        if (!match('rightParen')) {
          throw new Error('Missing closing parenthesis');
        }
        cursor += 1;

        switch (token.value) {
          case 'sin':
            return Math.sin(innerValue);
          case 'cos':
            return Math.cos(innerValue);
          case 'tan':
            return Math.tan(innerValue);
          case 'asin':
            return Math.asin(innerValue);
          case 'acos':
            return Math.acos(innerValue);
          case 'atan':
            return Math.atan(innerValue);
          case 'sqrt':
            return Math.sqrt(innerValue);
          case 'log':
            return Math.log10(innerValue);
          case 'ln':
            return Math.log(innerValue);
          case 'abs':
            return Math.abs(innerValue);
          case 'exp':
            return Math.exp(innerValue);
          default:
            throw new Error('Unsupported function');
        }
      }

      if (token.type === 'leftParen') {
        cursor += 1;
        const value = parseExpression();
        if (!match('rightParen')) {
          throw new Error('Missing closing parenthesis');
        }
        cursor += 1;
        return value;
      }

      throw new Error('Invalid expression');
    };

    const parseUnary = (): number => {
      const token = current();
      if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
        cursor += 1;
        const value = parseUnary();
        return token.value === '-' ? -value : value;
      }
      return parsePrimary();
    };

    const parsePower = (): number => {
      let value = parseUnary();
      const token = current();
      if (token?.type === 'operator' && token.value === '^') {
        cursor += 1;
        const exponent = parsePower();
        value = Math.pow(value, exponent);
      }
      return value;
    };

    const parseTerm = (): number => {
      let value = parsePower();
      while (true) {
        const token = current();
        if (!token || token.type !== 'operator' || !['*', '/', '%'].includes(token.value)) {
          break;
        }

        cursor += 1;
        const right = parsePower();
        if (token.value === '*') value *= right;
        if (token.value === '/') value /= right;
        if (token.value === '%') value %= right;
      }
      return value;
    };

    const parseExpression = (): number => {
      let value = parseTerm();
      while (true) {
        const token = current();
        if (!token || token.type !== 'operator' || !['+', '-'].includes(token.value)) {
          break;
        }

        cursor += 1;
        const right = parseTerm();
        if (token.value === '+') value += right;
        if (token.value === '-') value -= right;
      }
      return value;
    };

    const finalValue = parseExpression();
    if (cursor < tokens.length) {
      throw new Error('Unexpected token');
    }

    if (!Number.isFinite(finalValue)) {
      throw new Error('Invalid calculation');
    }

    return finalValue;
  }, []);

  const appendCalculatorValue = useCallback((value: string) => {
    const normalized =
      value === '√(' ? 'sqrt(' :
      value === 'π' ? 'pi' :
      value;

    setCalculatorInput((prev) => `${prev}${normalized}`);
  }, []);

  const clearCalculator = useCallback(() => {
    setCalculatorInput('');
    setCalculatorResult('0');
  }, []);

  const backspaceCalculator = useCallback(() => {
    setCalculatorInput((prev) => prev.slice(0, -1));
  }, []);

  const calculateResult = useCallback(() => {
    try {
      const numericResult = evaluateScientificExpression(calculatorInput);
      const normalized = formatCalculatorNumber(numericResult);
      setCalculatorResult(normalized);
      setCalculatorInput(normalized);
    } catch {
      setCalculatorResult('Error');
    }
  }, [calculatorInput, evaluateScientificExpression, formatCalculatorNumber]);

  useEffect(() => {
    if (!calculatorOpen) return;

    const handleCalculatorKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTypingField =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(target?.isContentEditable);

      if (isTypingField) {
        return;
      }

      const key = event.key;

      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        appendCalculatorValue(key);
        return;
      }

      if (/^[a-zA-Z]$/.test(key)) {
        event.preventDefault();
        if (key === 'x' || key === 'X') {
          appendCalculatorValue('*');
          return;
        }
        appendCalculatorValue(key.toLowerCase());
        return;
      }

      const keyMap: Record<string, string> = {
        '.': '.',
        ',': '.',
        '+': '+',
        '-': '-',
        '*': '*',
        '/': '/',
        '%': '%',
        '^': '^',
        '(': '(',
        ')': ')',
      };

      if (key in keyMap) {
        event.preventDefault();
        appendCalculatorValue(keyMap[key]);
        return;
      }

      if (key === 'Backspace') {
        event.preventDefault();
        backspaceCalculator();
        return;
      }

      if (key === 'Delete') {
        event.preventDefault();
        clearCalculator();
        return;
      }

      if (key === 'Enter' || key === '=') {
        event.preventDefault();
        calculateResult();
        return;
      }

      if (key === 'Escape') {
        event.preventDefault();
        setCalculatorOpen(false);
      }
    };

    window.addEventListener('keydown', handleCalculatorKeyDown);
    return () => window.removeEventListener('keydown', handleCalculatorKeyDown);
  }, [calculatorOpen, appendCalculatorValue, backspaceCalculator, clearCalculator, calculateResult]);

  const normalizeText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const roleNames = (authUser?.roles || []).map((role) => normalizeText(role.name));
  const designationName = normalizeText(String(authUser?.designation?.name || ''));
  const directRoleName = normalizeText(String(authUser?.role || ''));
  const normalizedRoleSources = [directRoleName, designationName, ...roleNames].filter(Boolean);

  const hasOfficerKeyword = (keyword: string) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedRoleSources.some((value) => value.includes(normalizedKeyword));
  };

  const displayName = String(authUser?.name || authUser?.email || 'User').trim();
  const primaryRoleRaw =
    authUser?.roles?.[0]?.name ||
    authUser?.role ||
    (roleNames.some((roleName) => roleName.includes('admin')) ? 'Super Admin' : 'User');
  const primaryRoleName = String(primaryRoleRaw || 'User').trim();
  const resolvedBranchName = String(
    authUser?.branch?.name ||
    authUser?.employee?.branch?.name ||
    authUser?.employee?.branch_name ||
    ''
  ).trim();
  const resolvedBranchId = Number(authUser?.branch_id || authUser?.employee?.branch_id || 0);
  const branchBadgeLabel = resolvedBranchName || (resolvedBranchId > 0 ? `Branch #${resolvedBranchId}` : 'No Branch');
  const isCollectionOfficer = hasOfficerKeyword('collection officer');
  const isFieldOfficer = hasOfficerKeyword('field officer');
  const canRestoreHiddenWidgets = normalizedRoleSources.some(
    (value) => value === 'admin' || value === 'super admin'
  );
  const canUseWalletDeposit = isCollectionOfficer || isFieldOfficer;
  const collectorCashInHand = Number(
    walletSummary?.cash_in_hand ?? authUser?.employee?.wallet?.current_balance ?? 0
  );
  const collectorDepositedAmount = Number(walletSummary?.total_deposited ?? 0);
  const collectorHandedOverAmount = Number(walletSummary?.total_handed_over ?? 0);
  const walletPreviewBalance = Number(
    walletSummary?.cash_in_hand ?? authUser?.employee?.wallet?.current_balance ?? 0
  );
  const walletPreviewHasWallet = Boolean(walletSummary?.wallet_no || authUser?.employee?.wallet?.wallet_no);
  const walletPreviewNo = String(walletSummary?.wallet_no || authUser?.employee?.wallet?.wallet_no || '-');

  const formatLkr = (value: number) =>
    `LKR ${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const previewAllFeaturesForAllUsers = true;
  const canUseWidgetCloseFeature = true;
  const { widgetsFixed, toggleWidgetsFixed } = useWidgetsFixed();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchAuthUser(storedToken);
      fetchWidgetPreferences(storedToken);
      fetchNotificationPreview(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (!token || !canUseWalletDeposit) {
      setWalletSummary(null);
      setWalletBankAccounts([]);
      setWalletManagers([]);
      setWalletRecentDeposits([]);
      setWalletRecentHandovers([]);
      return;
    }

    const fetchMyWallet = async () => {
      try {
        const response = await axios.get(`${apiBaseUrl}/hr/wallet/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setWalletSummary((response.data?.wallet || null) as WalletSummary | null);
        setWalletBankAccounts(
          Array.isArray(response.data?.bank_accounts)
            ? (response.data.bank_accounts as WalletBankAccount[])
            : []
        );
        setWalletManagers(
          Array.isArray(response.data?.managers)
            ? (response.data.managers as WalletManager[])
            : []
        );
        setWalletRecentDeposits(
          Array.isArray(response.data?.recent_deposits)
            ? (response.data.recent_deposits as WalletDepositHistory[])
            : []
        );
        setWalletRecentHandovers(
          Array.isArray(response.data?.recent_handovers)
            ? (response.data.recent_handovers as WalletCashHandoverHistory[])
            : []
        );
      } catch {
        setWalletSummary(null);
        setWalletBankAccounts([]);
        setWalletManagers([]);
        setWalletRecentDeposits([]);
        setWalletRecentHandovers([]);
      }
    };

    void fetchMyWallet();
  }, [token, canUseWalletDeposit, apiBaseUrl]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationPreviewOpen) return;
      if (notificationPreviewRef.current && !notificationPreviewRef.current.contains(event.target as Node)) {
        setNotificationPreviewOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [notificationPreviewOpen]);

  const fetchNotificationPreview = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setNotificationPreviewLoading(true);
      const response = await axios.get(`${apiBaseUrl}/notifications/preview`, {
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
          Accept: 'application/json',
        },
        params: { limit: 4 },
      });

      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      setNotificationPreviewItems(items as NotificationPreviewItem[]);
      setNotificationUnreadCount(Number(response.data?.unread_count || 0));
      const nextTypeCounts =
        response.data?.type_counts && typeof response.data.type_counts === 'object'
          ? (response.data.type_counts as Record<string, number>)
          : {};
      setNotificationTypeCounts(nextTypeCounts);
    } catch {
      setNotificationPreviewItems([]);
      setNotificationUnreadCount(0);
      setNotificationTypeCounts({});
    } finally {
      setNotificationPreviewLoading(false);
    }
  };

  const fetchAuthUser = async (authToken: string) => {
    setLoadingPrivileges(true);
    try {
      const response = await axios.get(`${apiBaseUrl}/user`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setAuthUser(response.data || null);
      localStorage.setItem('auth_user', JSON.stringify(response.data || null));
    } catch (error) {
      console.error('Failed to load user privileges:', error);
      const stored = localStorage.getItem('auth_user');
      const cached = stored ? JSON.parse(stored) : null;
      setAuthUser(cached);

      // Avoid stale/no-data cache causing false "No Module Access Assigned".
      if (!cached) {
        localStorage.removeItem('auth_user');
      }
    } finally {
      setLoadingPrivileges(false);
    }
  };

  useEffect(() => {
    const blockedReason = String(searchParams.get('blocked') || '').trim();
    if (blockedReason !== 'hidden-widget') {
      return;
    }

    setWalletNotice({
      open: true,
      title: 'Route Blocked',
      message: 'This URL is blocked because its related widget is hidden for your account.',
    });

    router.replace('/dashboard');
  }, [router, searchParams]);

  const fetchWidgetPreferences = async (authToken: string) => {
    setLoadingWidgets(true);
    try {
      const response = await axios.get(`${apiBaseUrl}/dashboard/widgets`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
      const nextHidden = new Set<string>();
      for (const row of rows) {
        const key = String(row?.widget_key || '').trim();
        if (!key) continue;
        if (row?.is_visible === false) {
          nextHidden.add(key);
        }
      }
      setHiddenWidgetKeys(nextHidden);
    } catch {
      setHiddenWidgetKeys(new Set());
    } finally {
      setLoadingWidgets(false);
    }
  };

  const saveWidgetPreference = async (widgetKey: string, isVisible: boolean, hiddenRoutePath?: string) => {
    if (!token) return false;
    const normalizedKey = String(widgetKey || '').trim();
    if (!normalizedKey) return false;
    if (normalizedKey.length > 120) return false;
    const normalizedHiddenRoutePath = String(hiddenRoutePath || '').trim();
    try {
      await axios.patch(
        `${apiBaseUrl}/dashboard/widgets`,
        {
          widget_key: normalizedKey,
          is_visible: Boolean(isVisible),
          hidden_route_path:
            !isVisible && normalizedHiddenRoutePath.startsWith('/dashboard') ? normalizedHiddenRoutePath : null,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );
      return true;
    } catch {
      return false;
    }
  };

  const hideWidget = async (widgetKey: string, hiddenRoutePath?: string) => {
    const previous = new Set(hiddenWidgetKeys);
    const next = new Set(hiddenWidgetKeys);
    next.add(widgetKey);
    setHiddenWidgetKeys(next);

    const ok = await saveWidgetPreference(widgetKey, false, hiddenRoutePath);
    if (!ok) {
      setHiddenWidgetKeys(previous);
      setWalletNotice({
        open: true,
        title: 'Widget Update Failed',
        message: 'Failed to update widget visibility. Please try again.',
      });
    }
  };

  const resetHiddenWidgets = async () => {
    if (!token) return;
    const adminEmail = restoreWidgetsModal.adminEmail.trim();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);
    if (!adminEmail || !emailLooksValid || !restoreWidgetsModal.adminPassword) {
      setWalletNotice({
        open: true,
        title: 'Validation',
        message: 'Valid admin email and password are required.',
      });
      return;
    }

    try {
      setRestoreWidgetsModal((prev) => ({ ...prev, verifying: true }));
      await axios.delete(`${apiBaseUrl}/dashboard/widgets`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        data: {
          admin_email: adminEmail,
          admin_password: restoreWidgetsModal.adminPassword,
        },
      });
      setHiddenWidgetKeys(new Set());
      setRestoreWidgetsModal({
        open: false,
        adminEmail: '',
        adminPassword: '',
        verifying: false,
      });
      setWalletNotice({
        open: true,
        title: 'Widgets Restored',
        message: 'All dashboard widgets are visible again.',
      });
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Failed to restore dashboard widgets. Please verify admin credentials and try again.';
      setWalletNotice({
        open: true,
        title: 'Reset Failed',
        message,
      });
    } finally {
      setRestoreWidgetsModal((prev) => ({ ...prev, verifying: false }));
    }
  };

  const openFixWidgetsApprovalModal = () => {
    setFixWidgetsModal({
      open: true,
      action: widgetsFixed ? 'unfix' : 'fix',
      adminEmail: '',
      adminPassword: '',
      verifying: false,
    });
  };

  const approveAndToggleWidgetsFixed = async () => {
    if (!token) return;

    const adminEmail = fixWidgetsModal.adminEmail.trim();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);
    if (!adminEmail || !emailLooksValid || !fixWidgetsModal.adminPassword) {
      setWalletNotice({
        open: true,
        title: 'Validation',
        message: 'Valid admin email and password are required.',
      });
      return;
    }

    try {
      setFixWidgetsModal((prev) => ({ ...prev, verifying: true }));
      const approvalResponse = await axios.post(
        `${apiBaseUrl}/dashboard/widgets/authorize-admin`,
        {
          admin_email: adminEmail,
          admin_password: fixWidgetsModal.adminPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      if (approvalResponse?.data?.approved !== true) {
        setWalletNotice({
          open: true,
          title: 'Approval Failed',
          message:
            typeof approvalResponse?.data?.message === 'string'
              ? approvalResponse.data.message
              : 'Admin approval failed. Please verify credentials and try again.',
        });
        return;
      }

      const isFixing = fixWidgetsModal.action === 'fix';
      toggleWidgetsFixed();
      setFixWidgetsModal({
        open: false,
        action: isFixing ? 'fix' : 'unfix',
        adminEmail: '',
        adminPassword: '',
        verifying: false,
      });
      setWalletNotice({
        open: true,
        title: isFixing ? 'Widgets Fixed' : 'Widgets Unfixed',
        message: isFixing
          ? 'Widget close buttons are now hidden.'
          : 'Widget close buttons are now enabled.',
      });
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Admin approval failed. Please verify credentials and try again.';
      setWalletNotice({
        open: true,
        title: 'Approval Failed',
        message,
      });
    } finally {
      setFixWidgetsModal((prev) => ({ ...prev, verifying: false }));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  const openDepositModal = () => {
    const defaultBankId = walletBankAccounts[0]?.id ? String(walletBankAccounts[0].id) : '';
    setAccountPreviewOpen(false);
    setDepositModal({
      open: true,
      amount: '',
      bankAccountId: defaultBankId,
      depositDate: new Date().toISOString().slice(0, 10),
      note: '',
      saving: false,
    });
  };

  const closeDepositModal = () => {
    if (depositModal.saving) return;
    setDepositModal((prev) => ({ ...prev, open: false }));
  };

  const openHandoverModal = () => {
    const defaultManagerId = walletManagers[0]?.employee_id ? String(walletManagers[0].employee_id) : '';
    setAccountPreviewOpen(false);
    setHandoverModal({
      open: true,
      amount: '',
      managerEmployeeId: defaultManagerId,
      handoverDate: new Date().toISOString().slice(0, 10),
      receivedBy: '',
      note: '',
      saving: false,
    });
  };

  const closeHandoverModal = () => {
    if (handoverModal.saving) return;
    setHandoverModal((prev) => ({ ...prev, open: false }));
  };

  const formatDate = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;

    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const submitWalletDeposit = async () => {
    const amount = Number(depositModal.amount || 0);
    const bankAccountId = Number(depositModal.bankAccountId || 0);

    if (amount <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please enter a valid deposit amount.' });
      return;
    }

    if (amount > collectorCashInHand) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Deposit amount cannot exceed cash in hand.' });
      return;
    }

    if (bankAccountId <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please select a branch bank account.' });
      return;
    }

    try {
      setDepositModal((prev) => ({ ...prev, saving: true }));

      const response = await axios.post(
        `${apiBaseUrl}/hr/wallet/my/deposit-bank`,
        {
          amount,
          bank_account_id: bankAccountId,
          deposit_date: depositModal.depositDate,
          note: depositModal.note.trim() || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      try {
        const walletResponse = await axios.get(`${apiBaseUrl}/hr/wallet/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setWalletSummary((walletResponse.data?.wallet || null) as WalletSummary | null);
        setWalletBankAccounts(
          Array.isArray(walletResponse.data?.bank_accounts)
            ? (walletResponse.data.bank_accounts as WalletBankAccount[])
            : []
        );
        setWalletRecentDeposits(
          Array.isArray(walletResponse.data?.recent_deposits)
            ? (walletResponse.data.recent_deposits as WalletDepositHistory[])
            : []
        );
      } catch {
        const summary = (response.data?.summary || {}) as Partial<WalletSummary>;
        setWalletSummary((prev) => ({
          ...(prev || {}),
          ...summary,
        }));
      }

      setWalletNotice({
        open: true,
        title: 'Success',
        message: response.data?.message || 'Wallet deposit posted successfully.',
      });

      setDepositModal((prev) => ({ ...prev, open: false, saving: false }));
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response?.data?.message
          : 'Failed to deposit wallet amount to bank. Please try again.';

      setWalletNotice({ open: true, title: 'Deposit Error', message });
      setDepositModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const submitWalletHandover = async () => {
    const amount = Number(handoverModal.amount || 0);
    const managerEmployeeId = Number(handoverModal.managerEmployeeId || 0);

    if (amount <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please enter a valid handover amount.' });
      return;
    }

    if (amount > collectorCashInHand) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Handover amount cannot exceed cash in hand.' });
      return;
    }

    if (managerEmployeeId <= 0) {
      setWalletNotice({ open: true, title: 'Validation', message: 'Please select a manager.' });
      return;
    }

    try {
      setHandoverModal((prev) => ({ ...prev, saving: true }));

      const response = await axios.post(
        `${apiBaseUrl}/hr/wallet/my/cash-handover`,
        {
          amount,
          manager_employee_id: managerEmployeeId,
          handover_date: handoverModal.handoverDate,
          received_by: handoverModal.receivedBy.trim() || undefined,
          note: handoverModal.note.trim() || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      try {
        const walletResponse = await axios.get(`${apiBaseUrl}/hr/wallet/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setWalletSummary((walletResponse.data?.wallet || null) as WalletSummary | null);
        setWalletBankAccounts(
          Array.isArray(walletResponse.data?.bank_accounts)
            ? (walletResponse.data.bank_accounts as WalletBankAccount[])
            : []
        );
        setWalletManagers(
          Array.isArray(walletResponse.data?.managers)
            ? (walletResponse.data.managers as WalletManager[])
            : []
        );
        setWalletRecentDeposits(
          Array.isArray(walletResponse.data?.recent_deposits)
            ? (walletResponse.data.recent_deposits as WalletDepositHistory[])
            : []
        );
        setWalletRecentHandovers(
          Array.isArray(walletResponse.data?.recent_handovers)
            ? (walletResponse.data.recent_handovers as WalletCashHandoverHistory[])
            : []
        );
      } catch {
        const summary = (response.data?.summary || {}) as Partial<WalletSummary>;
        setWalletSummary((prev) => ({
          ...(prev || {}),
          ...summary,
        }));
      }

      setWalletNotice({
        open: true,
        title: 'Success',
        message: response.data?.message || 'Cash handover posted successfully.',
      });

      setHandoverModal((prev) => ({ ...prev, open: false, saving: false }));
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response?.data?.message
          : 'Failed to post cash handover. Please try again.';

      setWalletNotice({ open: true, title: 'Handover Error', message });
      setHandoverModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const allModules: DashboardModule[] = [
    {
      key: 'module_credit',
      name: 'Credit',
      icon: '💳',
      color: 'from-emerald-500 to-cyan-500',
      bgColor: 'from-emerald-50 to-cyan-50',
      path: '/dashboard/credit',
    },
    {
      key: 'module_office_collection_center',
      name: 'Office Collection Center',
      icon: '🏛️',
      color: 'from-indigo-500 to-violet-500',
      bgColor: 'from-indigo-50 to-violet-50',
      path: '/dashboard/office-collections',
    },
    {
      key: 'module_hrm',
      name: 'HRM (Human Resource Management)',
      icon: '👥',
      color: 'from-red-500 to-pink-500',
      bgColor: 'from-red-50 to-pink-50',
      path: '/dashboard/hrm',
    },
    {
      key: 'module_savings_deposits',
      name: 'Savings & Deposits',
      icon: '💸',
      color: 'from-yellow-500 to-orange-500',
      bgColor: 'from-yellow-50 to-orange-50',
      path: '/dashboard/savings-deposits',
    },
    {
      key: 'module_customer',
      name: 'Customer',
      icon: '🧾',
      color: 'from-emerald-500 to-teal-500',
      bgColor: 'from-emerald-50 to-teal-50',
      path: '/dashboard/microfinance/customers',
    },
    {
      key: 'module_branch_management',
      name: 'Branch Management',
      icon: '🏢',
      color: 'from-teal-500 to-green-500',
      bgColor: 'from-teal-50 to-green-50',
      path: '/dashboard/branches',
    },
    {
      key: 'module_accounting',
      name: 'Accounting',
      icon: '📒',
      color: 'from-violet-500 to-purple-500',
      bgColor: 'from-violet-50 to-purple-50',
      path: '/dashboard/accounting',
    },
    {
      key: 'module_reports',
      name: 'Reports',
      icon: '📈',
      color: 'from-rose-500 to-red-500',
      bgColor: 'from-rose-50 to-red-50',
      path: '/dashboard/reports',
    },
  ];

  const otherModules = allModules.filter((module) => {
    if (canUseWidgetCloseFeature && hiddenWidgetKeys.has(module.key)) {
      return false;
    }
    return true;
  });

  const settings: DashboardSetting[] = [
    {
      key: 'setting_notifications',
      icon: '🔔',
      title: 'Action Center',
      desc: 'View alerts, reminders, and workflow updates',
      color: 'from-amber-500 to-orange-500',
      path: '/dashboard/action-center',
    },
    {
      key: 'setting_ai_assistant',
      icon: '🤖',
      title: 'AI Assistant',
      desc: 'Ask questions about live system information',
      color: 'from-cyan-500 to-blue-500',
      path: '/dashboard/assistant',
    },
    {
      key: 'setting_company_settings',
      icon: '🏢',
      title: 'Company Settings',
      desc: 'Manage company information',
      color: 'from-blue-500 to-cyan-500',
      path: '/dashboard/company-settings',
    },
  ].filter((setting) => {
    if (canUseWidgetCloseFeature && hiddenWidgetKeys.has(setting.key)) {
      return false;
    }
    return true;
  });

  const handleModuleClick = (moduleName: string) => {
    const selectedModule = allModules.find((item) => item.name === moduleName);
    if (selectedModule) {
      router.push(selectedModule.path);
    }
  };

  const notificationWorkflowSteps = [
    {
      key: 'step_1',
      icon: '📁',
      title: 'CRO Check Pending',
      typeKeys: ['step_1', 'step1', 'cro_check_pending'],
    },
    {
      key: 'step_2',
      icon: '📞',
      title: 'Pending Call Confirmation',
      typeKeys: ['step_2', 'step2', 'pending_call_confirmation'],
    },
    {
      key: 'step_3',
      icon: '🧑‍💼',
      title: 'BM approval',
      typeKeys: ['step_3', 'step3', 'bm_approval'],
    },
    {
      key: 'step_4',
      icon: '🏛️',
      title: 'Head Office Approval',
      typeKeys: ['step_4', 'step4', 'head_office_approval'],
    },
    {
      key: 'step_5',
      icon: '💼',
      title: 'Cash Allocation',
      typeKeys: ['step_5', 'step5', 'cash_allocation'],
    },
    {
      key: 'step_6',
      icon: '💳',
      title: 'Cash Request',
      typeKeys: ['step_6', 'step6', 'cash_request'],
    },
    {
      key: 'step_7',
      icon: '🏦',
      title: 'Cash Withdrawal',
      typeKeys: ['step_7', 'step7', 'cash_withdrawal'],
    },
    {
      key: 'step_8',
      icon: '☎️',
      title: 'Second Call Confirmation',
      typeKeys: ['step_8', 'step8', 'second_call_confirmation'],
    },
    {
      key: 'step_9',
      icon: '✍️',
      title: 'Loan Signature Check',
      typeKeys: ['step_9', 'step9', 'loan_signature_check'],
    },
    {
      key: 'step_10',
      icon: '🗂️',
      title: 'Document failing',
      typeKeys: ['step_10', 'step10', 'document_failing'],
    },
    {
      key: 'step_11',
      icon: '🛡️',
      title: 'Insurance Request',
      typeKeys: ['step_11', 'step11', 'insurance_request'],
    },
    {
      key: 'step_12',
      icon: '🏢',
      title: 'Branch Insurance Request',
      typeKeys: ['step_12', 'step12', 'branch_insurance_request'],
    },
    {
      key: 'step_13',
      icon: '🏬',
      title: 'Head Office Insurance Request',
      typeKeys: ['step_13', 'step13', 'head_office_insurance_request'],
    },
    {
      key: 'step_14',
      icon: '🎉',
      title: 'Grant',
      typeKeys: ['step_14', 'step14', 'grant'],
    },
  ];

  const notificationStepBadgeTones = [
    'bg-lime-200 text-lime-800',
    'bg-slate-200 text-slate-700',
    'bg-red-200 text-red-700',
    'bg-amber-200 text-amber-800',
    'bg-blue-200 text-blue-800',
  ];

  const getWorkflowStepCount = (typeKeys: string[]) => {
    const uniqueKeys = Array.from(new Set(typeKeys.map((key) => String(key || '').trim()).filter(Boolean)));
    return uniqueKeys.reduce((sum, key) => sum + Number(notificationTypeCounts[key] || 0), 0);
  };

  if (!token || loadingPrivileges || loadingWidgets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">DOF</span>
                </div>
                <h1 className="text-gray-900 text-base sm:text-xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent truncate max-w-[180px] sm:max-w-none">
                  Desk of Finance
                </h1>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <div className="hidden sm:flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>System Online</span>
              </div>
              <div className="hidden sm:flex items-center rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1.5 text-xs font-semibold text-sky-900">
                <span className="mr-1.5 inline-flex h-2 w-2 rounded-full bg-sky-500"></span>
                {branchBadgeLabel}
              </div>
              <div className="hidden sm:flex items-center rounded-full border border-red-100 bg-white/80 px-3 py-1.5 text-left">
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-900">{displayName}</p>
                  <p className="text-[11px] font-medium text-slate-500">{primaryRoleName}</p>
                </div>
              </div>
              <div className="relative" ref={notificationPreviewRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationPreviewOpen(false);
                    router.push('/dashboard/action-center');
                  }}
                  className="flex w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-left transition hover:bg-amber-100 sm:w-auto"
                >
                  <span className="text-sm">🔔</span>
                  <span className="text-xs font-semibold text-amber-800">Action Center</span>
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    {notificationUnreadCount}
                  </span>
                </button>

                {notificationPreviewOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-amber-100 bg-white/95 p-3 shadow-2xl backdrop-blur z-30">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Action Center</h4>
                      <span className="text-xs text-slate-500">{notificationUnreadCount} unread</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {notificationPreviewLoading ? (
                        <p className="text-xs text-slate-500">Loading...</p>
                      ) : notificationPreviewItems.length === 0 ? (
                        <p className="text-xs text-slate-500">No notifications.</p>
                      ) : (
                        notificationPreviewItems.map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-xl border px-3 py-2 ${
                              item.is_read ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'
                            }`}
                          >
                            <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {new Date(item.created_at).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                    <Link
                      href="/dashboard/action-center"
                      onClick={() => setNotificationPreviewOpen(false)}
                      className="mt-3 block w-full rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-700"
                    >
                      Open Action Center
                    </Link>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => router.push('/dashboard/wallet')}
                className="flex w-full items-center rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-left transition hover:bg-emerald-100 sm:w-auto"
              >
                <div className="leading-tight">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Wallet Preview</p>
                  <p className="text-xs font-semibold text-emerald-900">{formatLkr(walletPreviewBalance)}</p>
                  <p className="text-[11px] font-medium text-emerald-700">Wallet No: {walletPreviewHasWallet ? walletPreviewNo : 'Not created'}</p>
                </div>
              </button>
              <button
                onClick={handleLogout}
                className="w-full rounded-full bg-gradient-to-r from-red-500 to-pink-500 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 hover:from-red-600 hover:to-pink-600 hover:shadow-xl sm:w-auto sm:px-6 sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">Action Center</h3>
            <button
              type="button"
              onClick={() => router.push('/dashboard/action-center')}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              Open Action Center
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto overflow-y-visible pb-1">
            {notificationWorkflowSteps.map((step, index) => {
              const count = getWorkflowStepCount(step.typeKeys);
              const badgeTone = notificationStepBadgeTones[index % notificationStepBadgeTones.length];
              const tooltip = `${index + 1}. ${step.title} - ${count} request${count === 1 ? '' : 's'}`;

              return (
                <div key={step.key} className="group relative shrink-0">
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/action-center')}
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg transition hover:border-blue-200 hover:bg-blue-50 hover:shadow"
                    aria-label={tooltip}
                    title={tooltip}
                  >
                    <span aria-hidden="true">{step.icon}</span>
                    <span className={`absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold ${badgeTone}`}>
                      {count}
                    </span>
                  </button>
                  <div className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-30 hidden w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-white shadow-xl group-hover:block">
                    {tooltip}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-block p-1 bg-gradient-to-r from-red-500 to-pink-500 rounded-3xl mb-6">
            <div className="bg-white rounded-3xl p-3">
              {logoLoadFailed ? (
                <span className="text-3xl sm:text-4xl">🚀</span>
              ) : (
                <img
                  src={companyLogoUrl}
                  alt="Company logo"
                  className="h-28 w-28 sm:h-36 sm:w-36 rounded-2xl object-contain"
                  onError={() => setLogoLoadFailed(true)}
                />
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center mt-6 gap-2 sm:gap-4">
            <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>All Systems Operational</span>
            </div>
            <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-500">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Real-time Updates</span>
            </div>
          </div>
          {canUseWidgetCloseFeature && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {canRestoreHiddenWidgets && (
                <button
                  onClick={() =>
                    setRestoreWidgetsModal({
                      open: true,
                      adminEmail: '',
                      adminPassword: '',
                      verifying: false,
                    })
                  }
                  className="rounded-full border border-red-200 bg-white/80 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                >
                  Restore Hidden Widgets
                </button>
              )}
              <button
                onClick={openFixWidgetsApprovalModal}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  widgetsFixed
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {widgetsFixed ? 'Unfix Widgets' : 'Fix Widget'}
              </button>
            </div>
          )}
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16">
          {otherModules.map((module) => (
            <div
              key={module.key}
              onClick={() => handleModuleClick(module.name)}
              className={`group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-white/20 overflow-hidden transform hover:-translate-y-2 hover:scale-105 ${
                module.name === 'HRM (Human Resource Management)' ? 'ring-2 ring-red-500/50' : ''
              }`}
            >
              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${module.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

              {/* Content */}
              <div className="relative p-6">
                <WidgetCloseGate>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void hideWidget(module.key, module.path);
                    }}
                    className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Hide ${module.name} widget`}
                  >
                    ×
                  </button>
                </WidgetCloseGate>
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 bg-gradient-to-r ${module.color} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {module.icon}
                  </div>
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                    {module.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {module.name === 'HRM (Human Resource Management)'
                      ? 'Manage your workforce efficiently'
                      : 'Access comprehensive management tools'
                    }
                  </p>
                </div>

                {/* Hover Effect Line */}
                <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-red-500 to-pink-500 group-hover:w-full transition-all duration-500"></div>
              </div>

              {/* Floating Particles Effect */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-white/30 rounded-full opacity-0 group-hover:opacity-100 animate-ping"></div>
              <div className="absolute top-8 right-6 w-1 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 animate-ping animation-delay-300"></div>
            </div>
          ))}
        </div>

        {otherModules.length === 0 && (
          <div className="mb-16 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <h3 className="text-lg font-semibold text-amber-800">No Widgets Available</h3>
            <p className="text-amber-700 mt-2">
              All feature widgets are currently hidden for this user. Use &quot;Restore Hidden Widgets&quot; to show them again.
            </p>
          </div>
        )}

        {/* Settings & Configuration Section */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          <div className="bg-gradient-to-r from-red-500 to-pink-500 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                ⚙️
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white">Settings & System Configuration</h3>
                <p className="text-sm sm:text-base text-white/80">Configure and customize your system preferences</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {settings.map((setting) => (
                <div
                  key={setting.key}
                  onClick={() => {
                    if (setting.path) router.push(setting.path);
                  }}
                  className="group relative bg-white/50 hover:bg-white/80 rounded-xl p-4 border border-white/30 hover:border-white/50 transition-all duration-300 cursor-pointer transform hover:scale-105"
                >
                  <WidgetCloseGate>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void hideWidget(setting.key, setting.path);
                      }}
                      className="absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`Hide ${setting.title} widget`}
                    >
                      ×
                    </button>
                  </WidgetCloseGate>
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 bg-gradient-to-r ${setting.color} rounded-lg flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      {setting.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                        {setting.title}
                      </h4>
                      <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                        {setting.desc}
                      </p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {depositModal.open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDepositModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-emerald-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-emerald-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Deposit Wallet to Bank</h3>
                <p className="mt-1 text-sm text-slate-600">Move collected cash from your wallet to a bank account.</p>
              </div>
              <button onClick={closeDepositModal} className="text-slate-500 hover:text-slate-800" disabled={depositModal.saving}>✕</button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">Cash in Hand: {formatLkr(collectorCashInHand)}</p>
                <p className="mt-1">Total Deposited: {formatLkr(collectorDepositedAmount)}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositModal.amount}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Branch Bank Account</label>
                <select
                  value={depositModal.bankAccountId}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, bankAccountId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Select branch bank account</option>
                  {walletBankAccounts.map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {account.account_name || `Account #${account.id}`}
                      {account.bank_name ? ` - ${account.bank_name}` : ''}
                      {account.account_type ? ` (${String(account.account_type).toUpperCase()})` : ''}
                    </option>
                  ))}
                </select>
                {walletBankAccounts.length === 0 && (
                  <p className="mt-2 text-xs text-rose-600">
                    No branch bank accounts found. Please create a bank account for this branch in Company Settings.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Deposit Date</label>
                <input
                  type="date"
                  value={depositModal.depositDate}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, depositDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Note</label>
                <textarea
                  rows={3}
                  value={depositModal.note}
                  onChange={(e) => setDepositModal((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Optional note"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={closeDepositModal}
                disabled={depositModal.saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submitWalletDeposit}
                disabled={depositModal.saving || walletBankAccounts.length === 0}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white hover:from-emerald-600 hover:to-teal-600 disabled:opacity-60"
              >
                {depositModal.saving ? 'Posting...' : 'Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreWidgetsModal.open && (
        <div className="fixed inset-0 z-[94] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => {
              if (restoreWidgetsModal.verifying) return;
              setRestoreWidgetsModal((prev) => ({ ...prev, open: false }));
            }}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-red-200 bg-white px-6 py-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Admin Approval Required</h3>
            <p className="mt-1 text-sm text-slate-600">
              Enter super admin or admin credentials to restore hidden widgets for this logged user.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Admin Email</label>
                <input
                  type="email"
                  value={restoreWidgetsModal.adminEmail}
                  onChange={(e) => setRestoreWidgetsModal((prev) => ({ ...prev, adminEmail: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-red-200"
                  placeholder="admin@example.com"
                  disabled={restoreWidgetsModal.verifying}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Admin Password</label>
                <input
                  type="password"
                  value={restoreWidgetsModal.adminPassword}
                  onChange={(e) => setRestoreWidgetsModal((prev) => ({ ...prev, adminPassword: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-red-200"
                  placeholder="Enter password"
                  disabled={restoreWidgetsModal.verifying}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRestoreWidgetsModal((prev) => ({ ...prev, open: false }))}
                disabled={restoreWidgetsModal.verifying}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={resetHiddenWidgets}
                disabled={restoreWidgetsModal.verifying}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {restoreWidgetsModal.verifying ? 'Verifying...' : 'Verify & Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fixWidgetsModal.open && (
        <div className="fixed inset-0 z-[94] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => {
              if (fixWidgetsModal.verifying) return;
              setFixWidgetsModal((prev) => ({ ...prev, open: false }));
            }}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Admin Approval Required</h3>
            <p className="mt-1 text-sm text-slate-600">
              Enter admin credentials to {fixWidgetsModal.action === 'fix' ? 'fix' : 'unfix'} widgets.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Admin Email</label>
                <input
                  type="email"
                  value={fixWidgetsModal.adminEmail}
                  onChange={(e) => setFixWidgetsModal((prev) => ({ ...prev, adminEmail: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="admin@example.com"
                  disabled={fixWidgetsModal.verifying}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Admin Password</label>
                <input
                  type="password"
                  value={fixWidgetsModal.adminPassword}
                  onChange={(e) => setFixWidgetsModal((prev) => ({ ...prev, adminPassword: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Enter password"
                  disabled={fixWidgetsModal.verifying}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setFixWidgetsModal((prev) => ({ ...prev, open: false }))}
                disabled={fixWidgetsModal.verifying}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={approveAndToggleWidgetsFixed}
                disabled={fixWidgetsModal.verifying}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {fixWidgetsModal.verifying
                  ? 'Verifying...'
                  : fixWidgetsModal.action === 'fix'
                    ? 'Verify & Fix'
                    : 'Verify & Unfix'}
              </button>
            </div>
          </div>
        </div>
      )}

      {walletNotice.open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setWalletNotice({ open: false, title: '', message: '' })} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{walletNotice.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{walletNotice.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setWalletNotice({ open: false, title: '', message: '' })}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {accountPreviewOpen && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAccountPreviewOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-cyan-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-cyan-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Collection Officer Account Preview</h3>
                <p className="mt-1 text-sm text-slate-600">Wallet cash, deposited total, and latest bank deposits.</p>
              </div>
              <button onClick={() => setAccountPreviewOpen(false)} className="text-slate-500 hover:text-slate-800">✕</button>
            </div>

            <div className="space-y-4 px-6 py-5 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Wallet No</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-900">{walletSummary?.wallet_no || '-'}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Cash In Hand</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-900">{formatLkr(collectorCashInHand)}</p>
                </div>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-cyan-700">Total Deposited</p>
                  <p className="mt-1 text-sm font-semibold text-cyan-900">{formatLkr(collectorDepositedAmount)}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-amber-700">Total Handed Over</p>
                  <p className="mt-1 text-sm font-semibold text-amber-900">{formatLkr(collectorHandedOverAmount)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-900">Recent Deposits</h4>
                </div>

                {walletRecentDeposits.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-500">No deposits yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-slate-700">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Date</th>
                          <th className="px-4 py-2 font-semibold">Bank Account</th>
                          <th className="px-4 py-2 font-semibold text-right">Amount</th>
                          <th className="px-4 py-2 font-semibold">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletRecentDeposits.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-4 py-2">{formatDate(row.deposit_date)}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium text-slate-900">{row.bank_account?.account_name || '-'}</div>
                              <div className="text-xs text-slate-500">{row.bank_account?.bank_name || ''}</div>
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                            <td className="px-4 py-2 text-slate-600">{row.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-900">Recent Cash Handovers</h4>
                </div>

                {walletRecentHandovers.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-500">No cash handovers yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-slate-700">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Date</th>
                          <th className="px-4 py-2 font-semibold">Manager</th>
                          <th className="px-4 py-2 font-semibold">Received By</th>
                          <th className="px-4 py-2 font-semibold text-right">Amount</th>
                          <th className="px-4 py-2 font-semibold">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletRecentHandovers.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-4 py-2">{formatDate(row.handover_date)}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium text-slate-900">
                                {row.manager_employee
                                  ? `${row.manager_employee.first_name || ''} ${row.manager_employee.last_name || ''}`.trim() || '-'
                                  : '-'}
                              </div>
                              <div className="text-xs text-slate-500">{row.manager_employee?.employee_code || ''}</div>
                            </td>
                            <td className="px-4 py-2 text-slate-600">{row.received_by || '-'}</td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatLkr(Number(row.amount || 0))}</td>
                            <td className="px-4 py-2 text-slate-600">{row.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 px-6 py-4">
              <button
                onClick={openDepositModal}
                className="mr-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Deposit to Bank
              </button>
              <button
                onClick={openHandoverModal}
                className="mr-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cash Handover
              </button>
              <button
                onClick={() => setAccountPreviewOpen(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {handoverModal.open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeHandoverModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-amber-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Cash Handover</h3>
                <p className="mt-1 text-sm text-slate-600">Handover collected cash from your wallet to cash/main account.</p>
              </div>
              <button onClick={closeHandoverModal} className="text-slate-500 hover:text-slate-800" disabled={handoverModal.saving}>✕</button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Cash in Hand: {formatLkr(collectorCashInHand)}</p>
                <p className="mt-1">Total Handed Over: {formatLkr(collectorHandedOverAmount)}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={handoverModal.amount}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Manager</label>
                <select
                  value={handoverModal.managerEmployeeId}
                  onChange={(e) => {
                    const selectedManager = walletManagers.find((manager) => String(manager.employee_id) === e.target.value);
                    setHandoverModal((prev) => ({
                      ...prev,
                      managerEmployeeId: e.target.value,
                      receivedBy: selectedManager?.name || prev.receivedBy,
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <option value="">Select manager</option>
                  {walletManagers.map((manager) => (
                    <option key={manager.employee_id} value={String(manager.employee_id)}>
                      {manager.name}
                      {manager.employee_code ? ` (${manager.employee_code})` : ''}
                    </option>
                  ))}
                </select>
                {walletManagers.length === 0 && (
                  <p className="mt-2 text-xs text-rose-600">
                    No managers found for this branch. Please assign a branch manager in branch settings.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Handover Date</label>
                <input
                  type="date"
                  value={handoverModal.handoverDate}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, handoverDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Received By</label>
                <input
                  type="text"
                  value={handoverModal.receivedBy}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, receivedBy: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="Receiver name (optional)"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Note</label>
                <textarea
                  rows={3}
                  value={handoverModal.note}
                  onChange={(e) => setHandoverModal((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="Optional note"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={closeHandoverModal}
                disabled={handoverModal.saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={submitWalletHandover}
                disabled={handoverModal.saving || walletManagers.length === 0}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
              >
                {handoverModal.saving ? 'Posting...' : 'Cash Handover'}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setCalculatorOpen(true)}
        className="fixed bottom-24 right-5 z-[97] inline-flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200 bg-cyan-500 text-2xl text-white shadow-[0_16px_35px_-14px_rgba(6,182,212,0.9)] transition-transform duration-300 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-cyan-200"
        aria-label="Open scientific calculator"
        title="Scientific Calculator"
      >
        🧮
      </button>

      {calculatorOpen && (
        <div className="fixed inset-0 z-[98] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setCalculatorOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-cyan-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-cyan-100 px-4 py-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Scientific Calculator</h3>
                <p className="text-xs text-slate-500">Use keyboard keys: 0-9, operators, Enter, Backspace, Esc.</p>
              </div>
              <button
                type="button"
                onClick={() => setCalculatorOpen(false)}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="min-h-[24px] break-all text-right font-mono text-sm text-slate-700">{calculatorInput || '0'}</p>
                <p className="mt-1 break-all text-right font-mono text-xl font-bold text-slate-900">{calculatorResult}</p>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {['sin(', 'cos(', 'tan(', 'log(', 'ln('].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => appendCalculatorValue(key)}
                    className="rounded-lg border border-cyan-100 bg-cyan-50 px-2 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                  >
                    {key}
                  </button>
                ))}
                {['7', '8', '9', '÷', '^'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => appendCalculatorValue(key)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {key}
                  </button>
                ))}
                {['4', '5', '6', '×', '%'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => appendCalculatorValue(key)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {key}
                  </button>
                ))}
                {['1', '2', '3', '-', '√('].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => appendCalculatorValue(key)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {key}
                  </button>
                ))}
                {['0', '.', '(', ')', '+'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => appendCalculatorValue(key)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {key}
                  </button>
                ))}
                {['π', 'e', 'abs(', 'exp('].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => appendCalculatorValue(key)}
                    className="rounded-lg border border-cyan-100 bg-cyan-50 px-2 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                  >
                    {key}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={backspaceCalculator}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                >
                  ⌫
                </button>
                <button
                  type="button"
                  onClick={clearCalculator}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  C
                </button>
                <button
                  type="button"
                  onClick={calculateResult}
                  className="col-span-3 rounded-lg bg-slate-900 px-2 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  =
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}