"use client";

import { useTranslations } from "next-intl";
import type { IconType } from "react-icons";
import {
  FaLeaf,
  FaRegUserCircle,
  FaShoppingBag,
  FaSignOutAlt,
  FaTint,
  FaWater,
  FaWind,
} from "react-icons/fa";

import { signOutAction } from "~/app/[locale]/_components/auth-actions";
import { Link } from "~/i18n/navigation";

export type StorefrontDropdown = "user" | "cart";

type TopNavActionsProps = {
  closingDropdown: StorefrontDropdown | null;
  openDropdown: StorefrontDropdown | null;
  renderedDropdown: StorefrontDropdown | null;
  sessionUserName: string;
  setOpenDropdown: (dropdown: StorefrontDropdown | null) => void;
  signedIn: boolean;
};

type CartItem = {
  name: string;
  href: string;
  amount: string;
  icon: IconType;
};

export const iconButtonClass =
  "inline-flex size-10 items-center justify-center text-store-ink transition hover:text-store-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25";

const dropdownClass =
  "absolute right-0 top-full mt-3 w-[min(calc(100vw-2rem),22rem)] border border-store-border bg-store-surface p-5 shadow-[0_24px_70px_-34px_rgba(31,42,36,0.45)]";

const menuLinkClass =
  "block py-2 text-sm font-medium text-store-ink underline decoration-store-border underline-offset-4 transition hover:text-store-accent hover:decoration-store-accent";

const fakeCartItems: CartItem[] = [
  {
    name: "Mineral Filter Set",
    href: "/products/mineral-filter-set",
    amount: "1",
    icon: FaWater,
  },
  {
    name: "Air Purifying Blend",
    href: "/products/air-purifying-blend",
    amount: "2",
    icon: FaWind,
  },
  {
    name: "Glass Carafe",
    href: "/products/glass-carafe",
    amount: "1",
    icon: FaTint,
  },
  {
    name: "Plant Carbon Pack",
    href: "/products/plant-carbon-pack",
    amount: "3",
    icon: FaLeaf,
  },
];

export function TopNavActions({
  closingDropdown,
  openDropdown,
  renderedDropdown,
  sessionUserName,
  setOpenDropdown,
  signedIn,
}: TopNavActionsProps) {
  const t = useTranslations("Storefront.topNav");
  const dropdownAnimationClass = closingDropdown
    ? "storefront-dropdown-exit"
    : "storefront-dropdown-enter";

  return (
    <div
      className="relative flex items-center gap-2"
      data-storefront-actions-root
    >
      {signedIn ? (
        <button
          aria-expanded={openDropdown === "user"}
          aria-label={t("userMenu")}
          className={iconButtonClass}
          onClick={() =>
            setOpenDropdown(openDropdown === "user" ? null : "user")
          }
          type="button"
        >
          <FaRegUserCircle aria-hidden="true" className="size-5" />
        </button>
      ) : (
        <Link
          aria-label={t("signIn")}
          className={iconButtonClass}
          href="/sign-in"
          title={t("signIn")}
        >
          <FaRegUserCircle aria-hidden="true" className="size-5" />
        </Link>
      )}

      <button
        aria-expanded={openDropdown === "cart"}
        aria-label={t("cart")}
        className={iconButtonClass}
        onClick={() => setOpenDropdown(openDropdown === "cart" ? null : "cart")}
        type="button"
      >
        <FaShoppingBag aria-hidden="true" className="size-5" />
      </button>

      {renderedDropdown === "user" && signedIn ? (
        <UserDropdown
          animationClass={dropdownAnimationClass}
          name={sessionUserName}
        />
      ) : null}
      {renderedDropdown === "cart" ? (
        <CartDropdown animationClass={dropdownAnimationClass} />
      ) : null}
    </div>
  );
}

function UserDropdown({
  animationClass,
  name,
}: {
  animationClass: string;
  name: string;
}) {
  const t = useTranslations("Storefront.topNav");

  return (
    <div className={`${dropdownClass} ${animationClass}`}>
      <p className="font-display text-store-ink text-lg font-semibold">
        {t("hello", { name })}
      </p>
      <div className="mt-5 grid gap-1">
        <Link className={menuLinkClass} href="/customer-area/orders">
          {t("orders")}
        </Link>
        <Link
          className={menuLinkClass}
          href="/customer-area/personal-information"
        >
          {t("personalInformation")}
        </Link>
        <Link className={menuLinkClass} href="/customer-area/addresses">
          {t("addresses")}
        </Link>
      </div>
      <form
        action={signOutAction}
        className="border-store-border/70 mt-5 border-t pt-5"
      >
        <button
          className="text-store-muted decoration-store-border hover:text-store-ink hover:decoration-store-ink focus-visible:ring-store-accent/25 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
          type="submit"
        >
          <FaSignOutAlt aria-hidden="true" className="size-3.5" />
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}

function CartDropdown({ animationClass }: { animationClass: string }) {
  const t = useTranslations("Storefront.topNav");

  return (
    <div className={`${dropdownClass} ${animationClass}`}>
      <h2 className="font-display text-store-ink text-lg font-semibold">
        {t("cartSummary")}
      </h2>
      <div className="border-store-border/70 divide-store-border/70 mt-4 divide-y border-t">
        {fakeCartItems.map((item) => (
          <CartDropdownItem key={item.name} item={item} />
        ))}
      </div>
    </div>
  );
}

function CartDropdownItem({ item }: { item: CartItem }) {
  const t = useTranslations("Storefront.topNav");
  const Icon = item.icon;

  return (
    <div className="flex gap-4 py-4">
      <div className="border-store-border/70 text-store-accent flex size-14 shrink-0 items-center justify-center border">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          className="text-store-ink decoration-store-border hover:text-store-accent hover:decoration-store-accent block truncate text-sm font-semibold underline underline-offset-4 transition"
          href={item.href}
        >
          {item.name}
        </Link>
        <label className="text-store-muted mt-2 flex items-center gap-2 text-xs">
          {t("amount")}
          <select
            className="border-store-border bg-store-surface text-store-ink focus:border-store-accent border-b px-1 py-0.5 outline-none"
            defaultValue={item.amount}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
      </div>
    </div>
  );
}
