"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ProductCard } from "~/app/[locale]/(storefront)/_components/product-card";
import type { StorefrontProduct } from "~/lib/catalog-product";
import { api } from "~/trpc/react";

type CategoryProductGridProps = {
  slugPath: string;
  initialItems: StorefrontProduct[];
  initialPage: number;
  initialHasNextPage: boolean;
  pageSize: number;
};

export function CategoryProductGrid({
  slugPath,
  initialItems,
  initialPage,
  initialHasNextPage,
  pageSize,
}: CategoryProductGridProps) {
  const t = useTranslations("Storefront.categoryGrid");
  const [page, setPage] = useState(initialPage);
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasNextPage);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const nextPageQuery = api.catalog.listCategoryProducts.useQuery(
    { slugPath, page: page + 1, pageSize },
    {
      enabled: false,
    },
  );

  useEffect(() => {
    setPage(initialPage);
    setItems(initialItems);
    setHasMore(initialHasNextPage);
  }, [initialHasNextPage, initialItems, initialPage, slugPath]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadNextPage();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  });

  async function loadNextPage() {
    if (loadingRef.current || !hasMore) {
      return;
    }

    loadingRef.current = true;

    try {
      const result = await nextPageQuery.refetch();
      if (result.data?.items.length) {
        setItems((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const nextItems = (result.data?.items ?? []).filter(
            (item) => !existingIds.has(item.id),
          );
          return [...current, ...nextItems];
        });
        setPage((current) => current + 1);
      }
      if (result.data) setHasMore(result.data.hasNextPage);
    } finally {
      loadingRef.current = false;
    }
  }

  if (items.length === 0) {
    return (
      <div className="border-store-border bg-store-surface/70 text-store-muted rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-store-muted text-sm">
        {t("summary", { count: items.length })}
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            revealDelayClassName={
              index % 3 === 1
                ? "storefront-enter-delay-1"
                : index % 3 === 2
                  ? "storefront-enter-delay-2"
                  : ""
            }
          />
        ))}
      </div>

      {hasMore ? (
        <div className="flex flex-col items-center gap-4">
          <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />
          <button
            className="border-store-border bg-store-surface text-store-ink hover:border-store-accent/40 hover:text-store-accent rounded-full border px-5 py-2.5 text-sm font-medium transition disabled:opacity-50"
            disabled={nextPageQuery.isFetching}
            onClick={() => void loadNextPage()}
            type="button"
          >
            {nextPageQuery.isFetching ? t("loadingMore") : t("loadMore")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
