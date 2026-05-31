import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CategoryProductGrid } from "~/app/[locale]/(storefront)/_components/category-product-grid";
import { StorefrontShell } from "~/app/[locale]/(storefront)/_components/storefront-shell";
import { RevealOnScroll } from "~/app/[locale]/(storefront)/_components/reveal-on-scroll";
import { api, HydrateClient } from "~/trpc/server";

type CategoryPageProps = {
  params: Promise<{ locale: string; segments: string[] }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { segments } = await params;
  const resolvedSearchParams = await searchParams;
  const pageParam = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const pageSize = 12;
  const slugPath = segments.join("/");
  const t = await getTranslations("Storefront.categoryPage");

  const category = await api.catalog.resolveCategory({ slugPath });
  if (!category) {
    notFound();
  }

  const productPage = await api.catalog.listCategoryProducts({
    slugPath,
    page,
    pageSize,
  });

  if (!productPage) {
    notFound();
  }

  void api.catalog.navigationTree.prefetch();

  return (
    <HydrateClient>
      <StorefrontShell currentSlugPath={slugPath}>
        <div className="mx-auto max-w-6xl space-y-8">
          <RevealOnScroll>
            <header className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-store-muted">
                {t("eyebrow")}
              </p>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-store-ink">
                {category.name}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-store-muted">
                {t("description")}
              </p>
            </header>
          </RevealOnScroll>

          <CategoryProductGrid
            initialItems={productPage.items}
            initialPage={productPage.page}
            pageSize={productPage.pageSize}
            slugPath={slugPath}
            totalCount={productPage.totalCount}
            totalPages={productPage.totalPages}
          />
        </div>
      </StorefrontShell>
    </HydrateClient>
  );
}
