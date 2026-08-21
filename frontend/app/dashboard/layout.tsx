'use client';

import axios from 'axios';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';

const DASHBOARD_WIDGET_ROUTE_MAP: Record<string, string> = {
  module_credit: '/dashboard/credit',
  module_office_collection_center: '/dashboard/office-collections',
  module_hrm: '/dashboard/hrm',
  module_savings_deposits: '/dashboard/savings-deposits',
  module_customer: '/dashboard/microfinance/customers',
  module_branch_management: '/dashboard/branches',
  module_accounting: '/dashboard/accounting',
  module_reports: '/dashboard/reports',
  setting_notifications: '/dashboard/action-center',
  setting_ai_assistant: '/dashboard/assistant',
  setting_company_settings: '/dashboard/company-settings',
};

const DASHBOARD_ROUTE_HIDDEN_KEY_RULES: Array<{ routePrefix: string; hiddenKeys: string[] }> = [
  {
    routePrefix: '/dashboard/reports/expenses',
    hiddenKeys: [
      'module_reports',
      'reports_hub_widget_category_accounting',
      'reports_hub_widget_report_accounting_expenses_report',
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const apiBaseUrl = getApiBaseUrl();
  const [checkingRouteAccess, setCheckingRouteAccess] = useState(true);

  const routeMappings = useMemo(() => Object.entries(DASHBOARD_WIDGET_ROUTE_MAP), []);
  const routeHiddenKeyRules = useMemo(() => DASHBOARD_ROUTE_HIDDEN_KEY_RULES, []);

  useEffect(() => {
    let cancelled = false;

    const checkRouteAccess = async () => {
      if (!pathname || !pathname.startsWith('/dashboard')) {
        if (!cancelled) setCheckingRouteAccess(false);
        return;
      }

      if (pathname === '/dashboard') {
        if (!cancelled) setCheckingRouteAccess(false);
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        if (!cancelled) setCheckingRouteAccess(false);
        return;
      }

      try {
        const response = await axios.get(`${apiBaseUrl}/dashboard/widgets`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const rows = Array.isArray(response.data?.widgets) ? response.data.widgets : [];
        const hiddenKeys = new Set<string>();
        const hiddenRoutePrefixes = new Set<string>();

        for (const row of rows) {
          const key = String(row?.widget_key || '').trim();
          if (!key) continue;
          if (row?.is_visible === false) {
            hiddenKeys.add(key);
            const routePath = String(row?.hidden_route_path || '').trim();
            if (routePath.startsWith('/dashboard')) {
              hiddenRoutePrefixes.add(routePath.replace(/\/+$/, ''));
            }
          }
        }

        const isBlockedByHiddenWidget = routeMappings.some(([widgetKey, routePrefix]) => {
          if (!hiddenKeys.has(widgetKey)) return false;
          return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
        });

        const isBlockedByHiddenKeyRule = routeHiddenKeyRules.some((rule) => {
          const routeMatched = pathname === rule.routePrefix || pathname.startsWith(`${rule.routePrefix}/`);
          if (!routeMatched) return false;
          return rule.hiddenKeys.some((key) => hiddenKeys.has(key));
        });

        const isBlockedBySavedHiddenRoute = Array.from(hiddenRoutePrefixes).some((routePrefix) => {
          if (!routePrefix) return false;
          return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
        });

        if (isBlockedByHiddenWidget || isBlockedByHiddenKeyRule || isBlockedBySavedHiddenRoute) {
          if (!cancelled) {
            setCheckingRouteAccess(false);
            router.replace('/dashboard?blocked=hidden-widget');
          }
          return;
        }
      } catch {
        // Fail-open: keep navigation working if widget preference API is unavailable.
      }

      if (!cancelled) {
        setCheckingRouteAccess(false);
      }
    };

    void checkRouteAccess();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, pathname, routeHiddenKeyRules, routeMappings, router]);

  if (checkingRouteAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
