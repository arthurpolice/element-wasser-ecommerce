import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { CustomerAreaPageFrame } from "~/app/[locale]/customer-area/_components/customer-area-page-frame";
import { CustomerOnboardingForm } from "~/app/[locale]/customer-area/_components/customer-onboarding-form";
import { loadCustomerArea } from "~/app/[locale]/customer-area/_lib/load-customer-area";

type CustomerAreaPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function CustomerAreaPage({
  params,
}: CustomerAreaPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CustomerArea");
  const customerArea = await loadCustomerArea(locale, "/customer-area");

  if (customerArea.status === "registered") {
    redirect(`/${locale}/customer-area/personal-information`);
  }

  return (
    <CustomerAreaPageFrame description={t("description")} title={t("title")}>
      <section className="max-w-2xl">
        <p className="text-store-water text-xs font-semibold tracking-[0.18em] uppercase">
          {t("onboarding.eyebrow")}
        </p>
        <h2 className="font-display text-store-ink mt-3 text-2xl font-semibold tracking-tight">
          {t("onboarding.title")}
        </h2>
        <p className="text-store-muted mt-3 text-sm leading-6">
          {t("onboarding.description")}
        </p>
        <CustomerOnboardingForm
          defaultEmail={customerArea.user.email}
          defaultName={customerArea.user.name}
        />
      </section>
    </CustomerAreaPageFrame>
  );
}
