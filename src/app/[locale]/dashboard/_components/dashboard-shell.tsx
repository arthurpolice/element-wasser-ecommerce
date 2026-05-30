"use client";

import { useTranslations } from "next-intl";

import { CustomersTab } from "~/app/[locale]/dashboard/_components/customers/customers-tab";
import { OverviewTab } from "~/app/[locale]/dashboard/_components/overview/overview-tab";
import { ProductsTab } from "~/app/[locale]/dashboard/_components/products/products-tab";
import { OrdersTab } from "~/app/[locale]/dashboard/_components/orders/orders-tab";
import { type DashboardTab } from "~/app/[locale]/dashboard/_lib/tabs";
import { DashboardTabNav } from "~/app/[locale]/dashboard/_components/dashboard-tab-nav";
import { LanguageSwitcher } from "~/app/[locale]/dashboard/_components/language-switcher";

type DashboardShellProps = {
  activeTab: DashboardTab;
  userName: string;
};

export function DashboardShell({ activeTab, userName }: DashboardShellProps) {
  const t = useTranslations("Dashboard");

  return (
    <div className="dashboard-root dashboard-noise min-h-screen lg:flex">
      <aside className="relative flex w-full shrink-0 flex-col border-b border-white/5 bg-dash-sidebar text-white lg:fixed lg:inset-y-0 lg:w-[var(--dash-sidebar-width)] lg:border-b-0 lg:border-r">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,183,0.18),transparent_55%)]"
        />

        <div className="relative flex flex-1 flex-col px-5 py-6 lg:py-8">
          <div className="dashboard-enter">
            <p className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-dash-accent">
              Element Wasser
            </p>
            <h1 className="font-display mt-2 text-xl font-semibold tracking-tight text-white">
              {t("title")}
            </h1>
          </div>

          <div className="dashboard-enter dashboard-enter-delay-1 mt-8 flex-1">
            <DashboardTabNav activeTab={activeTab} />
          </div>

          <div className="dashboard-enter dashboard-enter-delay-2 mt-8 border-t border-white/10 pt-5">
            <p className="truncate text-sm font-medium text-white/90">{userName}</p>
            <p className="mt-0.5 text-xs text-white/45">{t("subtitle")}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-[var(--dash-sidebar-width)]">
        <header className="dashboard-enter sticky top-0 z-10 border-b border-dash-border/80 bg-dash-bg/85 px-6 py-4 backdrop-blur-md lg:px-10">
          <div className="flex items-center justify-end">
            <LanguageSwitcher />
          </div>
        </header>

        <main className="dashboard-enter dashboard-enter-delay-1 flex-1 px-6 py-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">
            {activeTab === "overview" ? (
              <OverviewTab />
            ) : activeTab === "customers" ? (
              <CustomersTab />
            ) : activeTab === "products" ? (
              <ProductsTab />
            ) : activeTab === "orders" ? (
              <OrdersTab />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
