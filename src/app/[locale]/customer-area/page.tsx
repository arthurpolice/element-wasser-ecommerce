import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { CustomerAreaDetails } from "~/app/[locale]/customer-area/_components/customer-area-details";
import { CustomerOnboardingForm } from "~/app/[locale]/customer-area/_components/customer-onboarding-form";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

type CustomerAreaPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function CustomerAreaPage({
  params,
}: CustomerAreaPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();

  if (!session?.user) {
    redirect(
      `/${locale}/sign-in?returnTo=${encodeURIComponent(`/${locale}/customer-area`)}`,
    );
  }

  const t = await getTranslations("CustomerArea");
  const customerArea = await api.customer.me();

  return (
    <main className="storefront-root storefront-grain min-h-screen px-5 py-8 lg:px-10 lg:py-12">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <section className="storefront-enter rounded-lg border border-store-border/80 bg-store-surface/80 p-6 shadow-[0_24px_80px_-48px_rgba(31,42,36,0.45)] backdrop-blur-sm lg:sticky lg:top-8">
          <p className="font-display text-xs font-semibold tracking-[0.24em] text-store-accent uppercase">
            Element Wasser
          </p>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-store-ink">
            {t("title")}
          </h1>
          <p className="mt-4 text-sm leading-6 text-store-muted">
            {t("description")}
          </p>
        </section>

        {customerArea.status === "needs-onboarding" ? (
          <section className="storefront-enter storefront-enter-delay-1 rounded-lg border border-store-border bg-store-surface p-6 shadow-[0_24px_80px_-48px_rgba(31,42,36,0.42)]">
            <p className="text-xs font-semibold tracking-[0.18em] text-store-water uppercase">
              {t("onboarding.eyebrow")}
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-store-ink">
              {t("onboarding.title")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-store-muted">
              {t("onboarding.description")}
            </p>
            <CustomerOnboardingForm
              defaultEmail={customerArea.user.email}
              defaultName={customerArea.user.name}
            />
          </section>
        ) : (
          <div className="storefront-enter storefront-enter-delay-1">
            <CustomerAreaDetails customer={customerArea.customer} status="registered" />
          </div>
        )}
      </div>
    </main>
  );
}
