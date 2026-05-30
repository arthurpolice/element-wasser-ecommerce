export const DASHBOARD_TABS = [
  "overview",
  "customers",
  "products",
  "orders",
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export function parseDashboardTab(
  value: string | string[] | undefined,
): DashboardTab {
  const tab = Array.isArray(value) ? value[0] : value;

  if (tab && DASHBOARD_TABS.includes(tab as DashboardTab)) {
    return tab as DashboardTab;
  }

  return "overview";
}
