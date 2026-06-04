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
    <ul
      className={
        depth === 0
          ? "space-y-2"
          : "border-store-border/70 mt-2 space-y-2 border-l pl-3"
      }
    >
      {categories.map((category) => (
        <CategoryNavItem
          key={category.id}
          category={category}
          currentSlugPath={currentSlugPath}
          depth={depth}
          expanded={expanded[category.id] ?? false}
          onNavigate={onNavigate}
          onToggle={() =>
            setExpanded((current) => ({
              ...current,
              [category.id]: !(current[category.id] ?? false),
            }))
          }
        />
      ))}
    </ul>
  );
}

function CategoryNavItem({
  category,
  currentSlugPath,
  depth,
  expanded,
  onNavigate,
  onToggle,
}: {
  category: NavCategory;
  currentSlugPath?: string;
  depth: number;
  expanded: boolean;
  onNavigate?: () => void;
  onToggle: () => void;
}) {
  const t = useTranslations("Storefront.navigation");
  const isActive = currentSlugPath === category.slugPath;
  const hasChildren = category.children.length > 0;
  const isInCurrentPath =
    isActive || currentSlugPath?.startsWith(`${category.slugPath}/`);
  const baseItemClass =
    "border-l-2 py-1.5 pr-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25";
  const inactiveItemClass =
    "border-transparent pl-3 text-store-muted hover:text-store-ink";
  const activeItemClass =
    "border-store-accent pl-3 font-semibold text-store-accent";

  return (
    <li>
      {hasChildren ? (
        <div className="space-y-1">
          <button
            className={`flex w-full items-center justify-between ${baseItemClass} ${
              isInCurrentPath
                ? "border-store-border text-store-ink pl-3 font-semibold"
                : inactiveItemClass
            }`}
            onClick={onToggle}
            type="button"
          >
            <span>{category.name}</span>
            <span aria-hidden="true" className="text-store-muted">
              {expanded ? "−" : "+"}
            </span>
          </button>
          {expanded ? (
            <div className="space-y-1">
              <Link
                className={`block ${baseItemClass} ${
                  isActive ? activeItemClass : inactiveItemClass
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
          className={`block ${baseItemClass} ${
            isActive ? activeItemClass : inactiveItemClass
          }`}
          href={`/categories/${category.slugPath}`}
          onClick={onNavigate}
        >
          {category.name}
        </Link>
      )}
    </li>
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
    return <p className="text-store-muted px-3 py-2 text-sm">{t("loading")}</p>;
  }

  if (navigationQuery.isError || !navigationQuery.data?.length) {
    return <p className="text-store-muted px-3 py-2 text-sm">{t("empty")}</p>;
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
