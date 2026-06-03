"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FaRegUserCircle } from "react-icons/fa";

import { CategoryNav } from "~/app/[locale]/(storefront)/_components/category-nav";
import { Link } from "~/i18n/navigation";

type StorefrontShellProps = {
  children: React.ReactNode;
  currentSlugPath?: string;
};

export function StorefrontShell({
  children,
  currentSlugPath,
}: StorefrontShellProps) {
  const t = useTranslations("Storefront");
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="storefront-root storefront-grain min-h-screen lg:flex">
      <aside className="hidden shrink-0 border-r border-store-border/80 bg-store-surface/70 backdrop-blur-sm lg:fixed lg:inset-y-0 lg:flex lg:w-(--store-sidebar-width) lg:flex-col">
        <div className="border-b border-store-border/70 px-6 py-8">
          <Link className="block" href="/">
            <p className="font-display text-xs font-semibold tracking-[0.24em] text-store-accent uppercase">
              Element Wasser
            </p>
            <p className="mt-2 text-sm text-store-muted">{t("tagline")}</p>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <CategoryNav currentSlugPath={currentSlugPath} variant="sidebar" />
        </div>
        <div className="border-t border-store-border/70 px-6 py-5 text-xs text-store-muted">
          <div className="flex items-center justify-between gap-3">
            <Link className="hover:text-store-accent" href="/sign-in">
              {t("ownerSignIn")}
            </Link>
            <Link
              aria-label={t("customerArea")}
              className="inline-flex size-10 items-center justify-center rounded-full border border-store-border bg-store-surface text-store-ink shadow-sm transition hover:border-store-accent/50 hover:text-store-accent"
              href="/customer-area"
              title={t("customerArea")}
            >
              <FaRegUserCircle aria-hidden="true" className="size-5" />
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-(--store-sidebar-width)">
        <header className="sticky top-0 z-20 border-b border-store-border/70 bg-store-bg/85 px-5 py-4 backdrop-blur-md lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Link className="font-display text-lg font-semibold tracking-tight text-store-ink lg:hidden" href="/">
                Element Wasser
              </Link>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <Link
                aria-label={t("customerArea")}
                className="inline-flex size-10 items-center justify-center rounded-full border border-store-border bg-store-surface text-store-ink shadow-sm"
                href="/customer-area"
                title={t("customerArea")}
              >
                <FaRegUserCircle aria-hidden="true" className="size-5" />
              </Link>
              <button
                className="rounded-full border border-store-border bg-store-surface px-4 py-2 text-sm font-medium text-store-ink"
                onClick={() => setDrawerOpen(true)}
                type="button"
              >
                {t("openCategories")}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 lg:px-10 lg:py-12">{children}</main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label={t("closeCategories")}
            className="absolute inset-0 bg-store-ink/20 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col border-r border-store-border bg-store-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-store-border/70 px-5 py-4">
              <p className="font-display text-sm font-semibold text-store-ink">
                {t("categoriesTitle")}
              </p>
              <button
                className="rounded-full px-3 py-1 text-sm text-store-muted"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                {t("closeCategories")}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CategoryNav
                currentSlugPath={currentSlugPath}
                onNavigate={() => setDrawerOpen(false)}
                variant="drawer"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
