"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "~/i18n/navigation";
import { api } from "~/trpc/react";

type CategoryNavProps = {
  currentSlugPath?: string;
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
};

type NavCategory = {
  id: string;
  name: string;
  slugPath: string;
  children: NavCategory[];
};

function CategoryNavList({
  categories,
  currentSlugPath,
  onNavigate,
  depth = 0,
}: {
  categories: NavCategory[];
  currentSlugPath?: string;
  onNavigate?: () => void;
  depth?: number;
}) {
  const t = useTranslations("Storefront.navigation");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const category of categories) {
      if (
        currentSlugPath === category.slugPath ||
        currentSlugPath?.startsWith(`${category.slugPath}/`)
      ) {
        initial[category.id] = true;
      }
    }
    return initial;
  });

  return (
    <ul className={depth === 0 ? "space-y-1" : "mt-1 space-y-1 border-l border-store-border/70 pl-3"}>
      {categories.map((category) => {
        const isActive = currentSlugPath === category.slugPath;
        const hasChildren = category.children.length > 0;
        const isExpanded = expanded[category.id] ?? false;

        return (
          <li key={category.id}>
            {hasChildren ? (
              <div className="space-y-1">
                <button
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-store-ink transition hover:bg-store-accent/8"
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [category.id]: !isExpanded,
                    }))
                  }
                  type="button"
                >
                  <span>{category.name}</span>
                  <span aria-hidden="true" className="text-store-muted">
                    {isExpanded ? "−" : "+"}
                  </span>
                </button>
                {isExpanded ? (
                  <div className="space-y-1">
                    <Link
                      className={`block rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? "bg-store-accent/12 font-medium text-store-accent"
                          : "text-store-muted hover:bg-store-accent/8 hover:text-store-ink"
                      }`}
                      href={`/categories/${category.slugPath}`}
                      onClick={onNavigate}
                    >
                      {t("allInCategory", { category: category.name })}
                    </Link>
                    <CategoryNavList
                      categories={category.children}
                      currentSlugPath={currentSlugPath}
                      depth={depth + 1}
                      onNavigate={onNavigate}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-store-accent/12 font-medium text-store-accent"
                    : "text-store-muted hover:bg-store-accent/8 hover:text-store-ink"
                }`}
                href={`/categories/${category.slugPath}`}
                onClick={onNavigate}
              >
                {category.name}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CategoryNav({
  currentSlugPath,
  variant,
  onNavigate,
}: CategoryNavProps) {
  const t = useTranslations("Storefront.navigation");
  const navigationQuery = api.catalog.navigationTree.useQuery();

  if (navigationQuery.isLoading) {
    return (
      <p className="px-3 py-2 text-sm text-store-muted">{t("loading")}</p>
    );
  }

  if (navigationQuery.isError || !navigationQuery.data?.length) {
    return (
      <p className="px-3 py-2 text-sm text-store-muted">{t("empty")}</p>
    );
  }

  return (
    <nav
      aria-label={t("label")}
      className={variant === "drawer" ? "px-2 py-2" : "px-1 py-2"}
    >
      <CategoryNavList
        categories={navigationQuery.data}
        currentSlugPath={currentSlugPath}
        onNavigate={onNavigate}
      />
    </nav>
  );
}
