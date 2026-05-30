"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import {
  DASHBOARD_TABS,
  type DashboardTab,
} from "~/app/[locale]/dashboard/_lib/tabs";
import { Link, usePathname } from "~/i18n/navigation";

type DashboardTabNavProps = {
  activeTab: DashboardTab;
};

const TAB_ICONS: Record<DashboardTab, string> = {
  overview: "◈",
  customers: "◎",
  products: "◫",
  orders: "◷",
};

export function DashboardTabNav({ activeTab }: DashboardTabNavProps) {
  const t = useTranslations("Dashboard.nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());

  return (
    <nav aria-label="Dashboard" className="flex flex-row gap-1 lg:flex-col">
      {DASHBOARD_TABS.map((tab) => {
        const isActive = tab === activeTab;

        return (
          <Link
            key={tab}
            aria-current={isActive ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dash-accent/50 ${
              isActive
                ? "bg-white/10 text-white shadow-[inset_3px_0_0_0_var(--color-dash-accent)]"
                : "text-white/60 hover:bg-white/5 hover:text-white/90"
            }`}
            href={{
              pathname,
              query: { ...query, tab },
            }}
          >
            <span
              aria-hidden="true"
              className={`font-display text-base leading-none transition ${
                isActive ? "text-dash-accent" : "text-white/35 group-hover:text-white/55"
              }`}
            >
              {TAB_ICONS[tab]}
            </span>
            {t(tab)}
          </Link>
        );
      })}
    </nav>
  );
}
