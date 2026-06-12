'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  FaRegTrashAlt,
  FaRegUserCircle,
  FaShoppingBag,
  FaSignOutAlt
} from 'react-icons/fa'

import { signOutAction } from '~/app/[locale]/_components/auth-actions'
import {
  useStorefrontCart,
  type StorefrontAddedCartItem,
  type StorefrontCartItem
} from '~/app/[locale]/(storefront)/_components/storefront-cart'
import { Link } from '~/i18n/navigation'

export type StorefrontDropdown = 'user' | 'cart' | 'added'

type TopNavActionsProps = {
  addedCartItem: StorefrontAddedCartItem | null
  closingDropdown: StorefrontDropdown | null
  openDropdown: StorefrontDropdown | null
  renderedDropdown: StorefrontDropdown | null
  sessionUserName: string
  setOpenDropdown: (dropdown: StorefrontDropdown | null) => void
  signedIn: boolean
}

export const iconButtonClass =
  'inline-flex size-10 items-center justify-center text-store-ink transition hover:text-store-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25'

const dropdownClass =
  'absolute right-0 top-full mt-3 w-[min(calc(100vw-2rem),22rem)] border border-store-border bg-store-surface p-5 shadow-[0_24px_70px_-34px_rgba(31,42,36,0.45)]'

const menuLinkClass =
  'block py-2 text-sm font-medium text-store-ink underline decoration-store-border underline-offset-4 transition hover:text-store-accent hover:decoration-store-accent'

export function TopNavActions({
  addedCartItem,
  closingDropdown,
  openDropdown,
  renderedDropdown,
  sessionUserName,
  setOpenDropdown,
  signedIn
}: TopNavActionsProps) {
  const t = useTranslations('Storefront.topNav')
  const cartAmount = useStorefrontCart((state) =>
    state.items.reduce((sum, item) => sum + item.amount, 0)
  )
  const dropdownAnimationClass = closingDropdown
    ? 'storefront-dropdown-exit'
    : 'storefront-dropdown-enter'

  return (
    <div
      className="relative flex items-center gap-2"
      data-storefront-actions-root
    >
      {signedIn ? (
        <button
          aria-expanded={openDropdown === 'user'}
          aria-label={t('userMenu')}
          className={iconButtonClass}
          onClick={() =>
            setOpenDropdown(openDropdown === 'user' ? null : 'user')
          }
          type="button"
        >
          <FaRegUserCircle aria-hidden="true" className="size-5" />
        </button>
      ) : (
        <Link
          aria-label={t('signIn')}
          className={iconButtonClass}
          href="/sign-in"
          title={t('signIn')}
        >
          <FaRegUserCircle aria-hidden="true" className="size-5" />
        </Link>
      )}

      <button
        aria-expanded={openDropdown === 'cart'}
        aria-label={t('cart')}
        className={`${iconButtonClass} relative`}
        onClick={() => setOpenDropdown(openDropdown === 'cart' ? null : 'cart')}
        type="button"
      >
        <FaShoppingBag aria-hidden="true" className="size-5" />
        {cartAmount > 0 ? (
          <span className="bg-store-accent text-store-surface absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[0.625rem] font-semibold">
            {Math.min(cartAmount, 9)}
          </span>
        ) : null}
      </button>

      {renderedDropdown === 'user' && signedIn ? (
        <UserDropdown
          animationClass={dropdownAnimationClass}
          name={sessionUserName}
        />
      ) : null}
      {renderedDropdown === 'cart' ? (
        <CartDropdown animationClass={dropdownAnimationClass} />
      ) : null}
      {renderedDropdown === 'added' && addedCartItem ? (
        <AddedCartItemDropdown
          animationClass={dropdownAnimationClass}
          item={addedCartItem}
        />
      ) : null}
    </div>
  )
}

function UserDropdown({
  animationClass,
  name
}: {
  animationClass: string
  name: string
}) {
  const t = useTranslations('Storefront.topNav')

  return (
    <div className={`${dropdownClass} ${animationClass}`}>
      <p className="font-display text-store-ink text-lg font-semibold">
        {t('hello', { name })}
      </p>
      <div className="mt-5 grid gap-1">
        <Link className={menuLinkClass} href="/customer-area/orders">
          {t('orders')}
        </Link>
        <Link
          className={menuLinkClass}
          href="/customer-area/personal-information"
        >
          {t('personalInformation')}
        </Link>
        <Link className={menuLinkClass} href="/customer-area/addresses">
          {t('addresses')}
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
          {t('signOut')}
        </button>
      </form>
    </div>
  )
}

function CartDropdown({ animationClass }: { animationClass: string }) {
  const t = useTranslations('Storefront.topNav')
  const items = useStorefrontCart((state) => state.items)

  return (
    <div className={`${dropdownClass} ${animationClass}`}>
      <h2 className="font-display text-store-ink text-lg font-semibold">
        {t('cartSummary')}
      </h2>
      {items.length > 0 ? (
        <>
          <div className="border-store-border/70 divide-store-border/70 mt-4 divide-y border-t">
            {items.map((item) => (
              <CartDropdownItem key={item.productId} item={item} />
            ))}
          </div>
          <Link
            className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink focus-visible:ring-store-accent/25 mt-5 inline-flex h-10 w-full items-center justify-center border px-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
            href="/checkout"
          >
            {t('checkout')}
          </Link>
        </>
      ) : (
        <p className="text-store-muted border-store-border/70 mt-4 border-t pt-4 text-sm">
          {t('cartEmpty')}
        </p>
      )}
    </div>
  )
}

function CartDropdownItem({ item }: { item: StorefrontCartItem }) {
  const t = useTranslations('Storefront.topNav')
  const removeItem = useStorefrontCart((state) => state.removeItem)
  const updateAmount = useStorefrontCart((state) => state.updateAmount)

  return (
    <div className="flex gap-4 py-4">
      <div className="border-store-border/70 bg-store-bg relative size-14 shrink-0 overflow-hidden border">
        {item.imageUrl ? (
          <Image
            alt={item.imageAlt ?? item.name}
            className="object-cover"
            fill
            sizes="56px"
            src={item.imageUrl}
          />
        ) : (
          <FaShoppingBag
            aria-hidden="true"
            className="text-store-accent absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          className="text-store-ink decoration-store-border hover:text-store-accent hover:decoration-store-accent block truncate text-sm font-semibold underline underline-offset-4 transition"
          href={`/products/${item.slug}`}
        >
          {item.name}
        </Link>
        <label className="text-store-muted mt-2 flex items-center gap-2 text-xs">
          {t('amount')}
          <select
            className="border-store-border bg-store-surface text-store-ink focus:border-store-accent border-b px-1 py-0.5 outline-none"
            onChange={(event) =>
              updateAmount(item.productId, Number(event.target.value))
            }
            value={item.amount}
          >
            {Array.from({ length: 99 }, (_, index) => index + 1).map(
              (amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              )
            )}
          </select>
        </label>
        <button
          aria-label={t('removeItem', { name: item.name })}
          className="text-store-muted hover:text-store-ink focus-visible:ring-store-accent/25 mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => removeItem(item.productId)}
          type="button"
        >
          <FaRegTrashAlt aria-hidden="true" className="size-3" />
          {t('remove')}
        </button>
      </div>
    </div>
  )
}

function AddedCartItemDropdown({
  animationClass,
  item
}: {
  animationClass: string
  item: StorefrontAddedCartItem
}) {
  const t = useTranslations('Storefront.topNav')

  return (
    <div className={`${dropdownClass} ${animationClass}`}>
      <p className="text-store-accent text-xs font-semibold tracking-[0.18em] uppercase">
        {t('addedToCart')}
      </p>
      <div className="mt-4 flex gap-4">
        <div className="border-store-border/70 bg-store-bg relative size-16 shrink-0 overflow-hidden border">
          {item.imageUrl ? (
            <Image
              alt={item.imageAlt ?? item.name}
              className="object-cover"
              fill
              sizes="64px"
              src={item.imageUrl}
            />
          ) : (
            <FaShoppingBag
              aria-hidden="true"
              className="text-store-accent absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-store-ink line-clamp-2 text-sm font-semibold">
            {item.name}
          </p>
          <p className="text-store-muted mt-2 text-xs">
            {t('amount')}: {item.amount}
          </p>
        </div>
      </div>
    </div>
  )
}
