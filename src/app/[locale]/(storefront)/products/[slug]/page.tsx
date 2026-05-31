import Image from "next/image";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { StorefrontShell } from "~/app/[locale]/(storefront)/_components/storefront-shell";
import { RevealOnScroll } from "~/app/[locale]/(storefront)/_components/reveal-on-scroll";
import { formatDispatchEstimate, formatPriceCents } from "~/lib/format-catalog";
import { api, HydrateClient } from "~/trpc/server";

type ProductPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("Storefront.productPage");

  const product = await api.catalog.getProductBySlug({ slug });
  if (!product) {
    notFound();
  }

  void api.catalog.navigationTree.prefetch();

  const unitPriceCents = product.discountPercent
    ? Math.round(product.priceCents * (1 - product.discountPercent / 100))
    : product.priceCents;

  return (
    <HydrateClient>
      <StorefrontShell>
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <RevealOnScroll>
            <div className="border-store-border/80 bg-store-surface relative aspect-4/5 overflow-hidden rounded-2xl border">
              {product.imageUrl ? (
                <Image
                  alt={product.imageAlt ?? product.name}
                  className="object-cover"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  src={product.imageUrl}
                />
              ) : (
                <div className="text-store-muted flex h-full items-center justify-center text-sm">
                  {t("noImage")}
                </div>
              )}
            </div>
          </RevealOnScroll>

          <RevealOnScroll delayClassName="storefront-enter-delay-1">
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-store-muted text-xs tracking-[0.18em] uppercase">
                  {product.manufacturerName}
                </p>
                <h1 className="font-display text-store-ink text-4xl font-semibold tracking-tight">
                  {product.name}
                </h1>
              </div>

              <div className="space-y-2">
                <p className="text-store-ink text-2xl font-medium">
                  {formatPriceCents(unitPriceCents, locale)}
                </p>
                {product.discountPercent ? (
                  <p className="text-store-muted text-sm line-through">
                    {formatPriceCents(product.priceCents, locale)}
                  </p>
                ) : null}
              </div>

              <div className="border-store-border/80 bg-store-surface text-store-muted rounded-2xl border px-5 py-4 text-sm">
                <p>
                  {t("dispatchEstimate", {
                    range: formatDispatchEstimate(
                      product.dispatchMinDays,
                      product.dispatchMaxDays,
                    ),
                  })}
                </p>
              </div>

              {product.reviewCount > 0 && product.averageRating ? (
                <p className="text-store-accent text-sm">
                  {t("reviewsSummary", {
                    rating: product.averageRating.toFixed(1),
                    count: product.reviewCount,
                  })}
                </p>
              ) : (
                <p className="text-store-muted text-sm">{t("noReviews")}</p>
              )}

              {product.description ? (
                <div className="border-store-border/80 bg-store-surface text-store-muted rounded-2xl border px-5 py-4 text-sm leading-7">
                  <p>{t("descriptionPlaceholder")}</p>
                </div>
              ) : (
                <p className="text-store-muted text-sm">{t("noDescription")}</p>
              )}
            </div>
          </RevealOnScroll>
        </div>
      </StorefrontShell>
    </HydrateClient>
  );
}
