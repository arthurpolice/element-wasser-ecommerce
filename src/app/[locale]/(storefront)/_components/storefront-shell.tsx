"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FaBars, FaSearch } from "react-icons/fa";

import { CategoryNav } from "~/app/[locale]/(storefront)/_components/category-nav";
import {
  iconButtonClass,
  TopNavActions,
  type StorefrontDropdown,
} from "~/app/[locale]/(storefront)/_components/storefront-actions";
import { StorefrontMobileCategoryDrawer } from "~/app/[locale]/(storefront)/_components/storefront-mobile-category-drawer";
import { Link } from "~/i18n/navigation";
import { authClient } from "~/server/better-auth/client";

type StorefrontShellProps = {
  children: React.ReactNode;
  currentSlugPath?: string;
};

const dropdownCloseDurationMs = 150;

export function StorefrontShell({
  children,
  currentSlugPath,
}: StorefrontShellProps) {
  const t = useTranslations("Storefront");
  const { data: session } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<StorefrontDropdown | null>(
    null,
  );
  const [closingDropdown, setClosingDropdown] =
    useState<StorefrontDropdown | null>(null);
  const userName = session?.user.name ?? session?.user.email ?? "";
  const renderedDropdown = openDropdown ?? closingDropdown;

  useEffect(() => {
    if (!openDropdown) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      const targetElement =
        target instanceof Element ? target : target.parentElement;

      if (!targetElement?.closest("[data-storefront-actions-root]")) {
        setClosingDropdown(openDropdown);
        setOpenDropdown(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openDropdown]);

  useEffect(() => {
    if (!closingDropdown) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setClosingDropdown(null);
    }, dropdownCloseDurationMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [closingDropdown]);

  function handleDropdownChange(dropdown: StorefrontDropdown | null) {
    if (dropdown) {
      setClosingDropdown(null);
      setOpenDropdown(dropdown);
      return;
    }

    if (openDropdown) {
      setClosingDropdown(openDropdown);
    }

    setOpenDropdown(null);
  }

  return (
    <div className="storefront-root storefront-grain min-h-screen">
      <header className="border-store-border/70 bg-store-bg/88 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto grid w-full max-w-[1920px] gap-4 px-5 py-4 lg:flex lg:items-center lg:px-10">
          <div className="flex items-center justify-between gap-3 lg:block lg:w-(--store-sidebar-width) lg:shrink-0">
            <button
              aria-expanded={menuOpen}
              aria-label={t("openCategories")}
              className={`${iconButtonClass} lg:hidden`}
              onClick={() => {
                setMenuOpen(true);
                setOpenDropdown(null);
              }}
              type="button"
            >
              <FaBars aria-hidden="true" className="size-5" />
            </button>
            <Link className="block text-center lg:text-left" href="/">
              <p className="font-display text-store-accent text-xs font-semibold tracking-[0.24em] uppercase">
                Element Wasser
              </p>
              <p className="text-store-muted mt-1 hidden text-sm lg:block">
                {t("tagline")}
              </p>
            </Link>
            <div className="lg:hidden">
              <TopNavActions
                closingDropdown={closingDropdown}
                openDropdown={openDropdown}
                renderedDropdown={renderedDropdown}
                sessionUserName={userName}
                setOpenDropdown={handleDropdownChange}
                signedIn={Boolean(session?.user)}
              />
            </div>
          </div>
          <div className="min-w-0 lg:flex-1">
            <SearchBar />
          </div>
          <div className="hidden shrink-0 lg:block">
            <TopNavActions
              closingDropdown={closingDropdown}
              openDropdown={openDropdown}
              renderedDropdown={renderedDropdown}
              sessionUserName={userName}
              setOpenDropdown={handleDropdownChange}
              signedIn={Boolean(session?.user)}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1920px]">
        <aside className="hidden shrink-0 lg:sticky lg:top-24 lg:flex lg:h-[calc(100vh-6rem)] lg:w-(--store-sidebar-width) lg:flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <p className="text-store-muted mb-5 text-xs tracking-[0.18em] uppercase">
              {t("categoriesTitle")}
            </p>
            <CategoryNav currentSlugPath={currentSlugPath} variant="sidebar" />
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <main className="flex-1 px-5 py-8 lg:px-10 lg:py-12">{children}</main>
        </div>
      </div>

      {menuOpen ? (
        <StorefrontMobileCategoryDrawer
          currentSlugPath={currentSlugPath}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SearchBar() {
  const t = useTranslations("Storefront.topNav");

  return (
    <label className="border-store-border/80 bg-store-surface/80 focus-within:border-store-accent/60 focus-within:bg-store-surface flex h-14 w-full max-w-[1400px] min-w-0 items-center gap-3 rounded-full border px-5 shadow-[0_16px_44px_-34px_rgba(31,42,36,0.55)] transition focus-within:shadow-[0_18px_48px_-32px_rgba(47,111,99,0.35)]">
      <FaSearch aria-hidden="true" className="text-store-accent size-4" />
      <span className="sr-only">{t("searchLabel")}</span>
      <input
        className="placeholder:text-store-muted/75 text-store-ink h-full min-w-0 flex-1 bg-transparent text-base outline-none"
        placeholder={t("searchPlaceholder")}
        type="search"
      />
    </label>
  );
}
