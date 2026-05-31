import { Suspense } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "~/app/[locale]/dashboard/_components/dashboard-shell";
import { parseDashboardTab } from "~/app/[locale]/dashboard/_lib/tabs";
import { getSession } from "~/server/better-auth/server";
import { isOwnerRole } from "~/server/auth/roles";

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function DashboardPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { locale } = await params;
  const session = await getSession();
  const resolvedSearchParams = await searchParams;
  const activeTab = parseDashboardTab(resolvedSearchParams.tab);

  if (!session?.user) {
    redirect(`/${locale}/sign-in`);
  }

  const role = (session.user as { role?: string }).role;

  if (!isOwnerRole(role)) {
    redirect(`/${locale}/access-denied`);
  }

  return (
    <Suspense fallback={null}>
      <DashboardShell
        activeTab={activeTab}
        userName={session.user.name ?? session.user.email}
      />
    </Suspense>
  );
}
