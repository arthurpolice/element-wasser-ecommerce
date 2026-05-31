import { getTranslations } from "next-intl/server";

import { ProductCard } from "~/app/[locale]/(storefront)/_components/product-card";
import { RevealOnScroll } from "~/app/[locale]/(storefront)/_components/reveal-on-scroll";
import { StorefrontShell } from "~/app/[locale]/(storefront)/_components/storefront-shell";
import { Link } from "~/i18n/navigation";
import { api, HydrateClient } from "~/trpc/server";

export default async function StorefrontHomePage() {
  const t = await getTranslations("Storefront.home");
  void api.catalog.navigationTree.prefetch();
  void api.catalog.homepageSections.prefetch();

  const sections = await api.catalog.homepageSections();

  return (
    <HydrateClient>
      <StorefrontShell>
        <div className="mx-auto max-w-6xl space-y-14">
          <RevealOnScroll>
            <section className="border-store-border/80 bg-store-surface relative overflow-hidden rounded-2xl border px-8 py-12 shadow-[0_24px_80px_-40px_rgba(31,42,36,0.35)] sm:px-12 sm:py-16">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(91,142,168,0.16),transparent_40%),linear-gradient(135deg,rgba(143,182,168,0.12),transparent_55%)]"
              />
              <div className="relative max-w-2xl space-y-5">
                <p className="text-store-accent text-xs font-semibold tracking-[0.24em] uppercase">
                  {t("eyebrow")}
                </p>
                <h1 className="font-display text-store-ink text-4xl font-semibold tracking-tight sm:text-5xl">
                  {t("title")}
                </h1>
                <p className="text-store-muted max-w-xl text-base leading-7">
                  {t("description")}
                </p>
              </div>
            </section>
          </RevealOnScroll>

          {sections.length === 0 ? (
            <div className="border-store-border bg-store-surface/70 text-store-muted rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
              {t("empty")}
            </div>
          ) : (
            sections.map((section, sectionIndex) => (
              <section key={section.category.id} className="space-y-6">
                <RevealOnScroll delayClassName="storefront-enter-delay-1">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-store-muted text-xs tracking-[0.18em] uppercase">
                        {t("sectionEyebrow")}
                      </p>
                      <h2 className="font-display text-store-ink mt-2 text-3xl font-semibold tracking-tight">
                        {section.category.name}
                      </h2>
                    </div>
                    <Link
                      className="text-store-accent hover:text-store-ink text-sm font-medium transition"
                      href={`/categories/${section.slugPath}`}
                    >
                      {t("viewAll")}
                    </Link>
                  </div>
                </RevealOnScroll>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {section.products.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      revealDelayClassName={
                        sectionIndex % 2 === 0 && index % 2 === 1
                          ? "storefront-enter-delay-1"
                          : index % 2 === 1
                            ? "storefront-enter-delay-2"
                            : ""
                      }
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </StorefrontShell>
    </HydrateClient>
  );
}
