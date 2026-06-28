import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  CustomerAreaSummary,
  CustomerOrders,
} from "~/app/[locale]/customer-area/_components/customer-area-details";
import { CustomerAreaPageFrame } from "~/app/[locale]/customer-area/_components/customer-area-page-frame";
import {
  customerAreaPaths,
  loadCustomerArea,
  redirectToCustomerOnboarding,
} from "~/app/[locale]/customer-area/_lib/load-customer-area";

type OrdersPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function OrdersPage({ params }: OrdersPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CustomerArea");
  const path = customerAreaPaths.orders;
  const customerArea = await loadCustomerArea(locale, path);

  if (customerArea.status === "needs-onboarding") {
    redirectToCustomerOnboarding(locale, path);
  }

  return (
    <CustomerAreaPageFrame description={t("description")} title={t("title")}>
      <div className="grid gap-10">
        <CustomerAreaSummary customer={customerArea.customer} />
        <CustomerOrders customer={customerArea.customer} />
      </div>
    </CustomerAreaPageFrame>
  );
}
