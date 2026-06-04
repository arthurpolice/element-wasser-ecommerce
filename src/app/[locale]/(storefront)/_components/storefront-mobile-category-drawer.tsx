"use client";

import { useTranslations } from "next-intl";
import { FaTimes } from "react-icons/fa";

import { CategoryNav } from "~/app/[locale]/(storefront)/_components/category-nav";
import { iconButtonClass } from "~/app/[locale]/(storefront)/_components/storefront-actions";

type StorefrontMobileCategoryDrawerProps = {
  currentSlugPath?: string;
  onClose: () => void;
};

export function StorefrontMobileCategoryDrawer({
  currentSlugPath,
  onClose,
}: StorefrontMobileCategoryDrawerProps) {
  const t = useTranslations("Storefront");

  return (
    <div className="bg-store-bg fixed inset-0 z-40 flex animate-[store-menu-down_0.22s_ease-out_both] flex-col lg:hidden">
      <div className="border-store-border/70 flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="font-display text-store-accent text-xs font-semibold tracking-[0.24em] uppercase">
            Element Wasser
          </p>
          <p className="text-store-muted mt-1 text-sm">
            {t("categoriesTitle")}
          </p>
        </div>
        <button
          aria-label={t("closeCategories")}
          className={iconButtonClass}
          onClick={onClose}
          type="button"
        >
          <FaTimes aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <CategoryNav
          currentSlugPath={currentSlugPath}
          onNavigate={onClose}
          variant="drawer"
        />
      </div>
    </div>
  );
}
