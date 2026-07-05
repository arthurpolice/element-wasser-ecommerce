'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FaRegTrashAlt,
  FaRegUserCircle,
  FaShoppingBag,
  FaTimes,
  FaSignOutAlt
} from 'react-icons/fa'

import {
  useStorefrontCart,
  type StorefrontAddedCartItem,
  type StorefrontCartItem
} from '~/app/[locale]/(storefront)/_components/storefront-cart'
import { Link } from '~/i18n/navigation'
import { authClient } from '~/server/better-auth/client'

export type StorefrontDropdown = 'user' | 'cart' | 'added'

type TopNavActionsProps = {
  addedCartItem: StorefrontAddedCartItem | null
  closingDropdown: StorefrontDropdown | null
  mode: 'desktop' | 'mobile'
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
  mode,
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

      {mode === 'desktop' && renderedDropdown === 'user' && signedIn ? (
        <UserDropdown
          animationClass={dropdownAnimationClass}
          name={sessionUserName}
        />
      ) : null}
      {mode === 'mobile' && renderedDropdown === 'user' && signedIn ? (
        <StorefrontMobileActionDrawer
          closeLabel={t('closePanel')}
          isClosing={closingDropdown === 'user'}
          onClose={() => setOpenDropdown(null)}
          title={t('userMenu')}
        >
          <UserMenuContent
            name={sessionUserName}
            onNavigate={() => setOpenDropdown(null)}
          />
        </StorefrontMobileActionDrawer>
      ) : null}
      {mode === 'desktop' && renderedDropdown === 'cart' ? (
        <CartDropdown animationClass={dropdownAnimationClass} />
      ) : null}
      {mode === 'mobile' && renderedDropdown === 'cart' ? (
        <StorefrontMobileActionDrawer
          closeLabel={t('closePanel')}
          isClosing={closingDropdown === 'cart'}
          onClose={() => setOpenDropdown(null)}
          title={t('cartSummary')}
        >
          <CartContent
            onNavigate={() => setOpenDropdown(null)}
            showTitle={false}
          />
        </StorefrontMobileActionDrawer>
      ) : null}
      {mode === 'desktop' && renderedDropdown === 'added' && addedCartItem ? (
        <AddedCartItemDropdown
          animationClass={dropdownAnimationClass}
          item={addedCartItem}
        />
      ) : null}
      {mode === 'mobile' && renderedDropdown === 'added' && addedCartItem ? (
        <>
          <StorefrontMobileActionDrawer
            closeLabel={t('closePanel')}
            isClosing={closingDropdown === 'added'}
            onClose={() => setOpenDropdown(null)}
            title={t('addedToCart')}
          >
            <AddedCartItemContent item={addedCartItem} />
          </StorefrontMobileActionDrawer>
        </>
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
  return (
    <div className={`${dropdownClass} ${animationClass} hidden lg:block`}>
      <UserMenuContent name={name} />
    </div>
  )
}

function UserMenuContent({
  name,
  onNavigate
}: {
  name: string
  onNavigate?: () => void
}) {
  const router = useRouter()
  const t = useTranslations('Storefront.topNav')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  return (
    <>
      <p className="font-display text-store-ink text-lg font-semibold">
        {t('hello', { name })}
      </p>
      <div className="mt-5 grid gap-1">
        <Link
          className={menuLinkClass}
          href="/customer-area/orders"
          onClick={onNavigate}
        >
          {t('orders')}
        </Link>
        <Link
          className={menuLinkClass}
          href="/customer-area/personal-information"
          onClick={onNavigate}
        >
          {t('personalInformation')}
        </Link>
        <Link
          className={menuLinkClass}
          href="/customer-area/addresses"
          onClick={onNavigate}
        >
          {t('addresses')}
        </Link>
      </div>
      <form
        className="border-store-border/70 mt-5 border-t pt-5"
        onSubmit={(event) => {
          event.preventDefault()
          void (async () => {
            setError(null)
            setSubmitting(true)

            try {
              await authClient.signOut()
              router.replace('/')
              router.refresh()
            } catch {
              setError('Could not sign out. Please try again.')
            } finally {
              setSubmitting(false)
            }
          })()
        }}
      >
        {error ? (
          <p
            aria-live="polite"
            className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}
        <button
          className="text-store-muted decoration-store-border hover:text-store-ink hover:decoration-store-ink focus-visible:ring-store-accent/25 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
          disabled={submitting}
          type="submit"
        >
          <FaSignOutAlt aria-hidden="true" className="size-3.5" />
          {submitting ? 'Signing out...' : t('signOut')}
        </button>
      </form>
    </>
  )
}

function CartDropdown({ animationClass }: { animationClass: string }) {
  return (
    <div className={`${dropdownClass} ${animationClass} hidden lg:block`}>
      <CartContent />
    </div>
  )
}

function CartContent({
  onNavigate,
  showTitle = true
}: {
  onNavigate?: () => void
  showTitle?: boolean
}) {
  const t = useTranslations('Storefront.topNav')
  const items = useStorefrontCart((state) => state.items)

  return (
    <>
      {showTitle ? (
        <h2 className="font-display text-store-ink text-lg font-semibold">
          {t('cartSummary')}
        </h2>
      ) : null}
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
            onClick={onNavigate}
          >
            {t('checkout')}
          </Link>
        </>
      ) : (
        <p className="text-store-muted border-store-border/70 mt-4 border-t pt-4 text-sm">
          {t('cartEmpty')}
        </p>
      )}
    </>
  )
}

function StorefrontMobileActionDrawer({
  children,
  closeLabel,
  isClosing,
  onClose,
  title
}: {
  children: React.ReactNode
  closeLabel: string
  isClosing: boolean
  onClose: () => void
  title: string
}) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [mobileViewport, setMobileViewport] = useState(false)

  useEffect(() => {
    setPortalTarget(document.body)

    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const updateMobileViewport = () => setMobileViewport(mediaQuery.matches)

    updateMobileViewport()
    mediaQuery.addEventListener('change', updateMobileViewport)

    return () => {
      mediaQuery.removeEventListener('change', updateMobileViewport)
    }
  }, [])

  useEffect(() => {
    if (!portalTarget || !mobileViewport) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileViewport, portalTarget])

  if (!portalTarget || !mobileViewport) {
    return null
  }

  return createPortal(
    <div
      aria-modal="true"
      className={`fixed inset-0 z-40 flex items-end bg-black/35 backdrop-blur-sm lg:hidden ${
        isClosing
          ? 'storefront-mobile-drawer-backdrop-exit pointer-events-none'
          : 'storefront-mobile-drawer-backdrop-enter'
      }`}
      data-storefront-actions-root
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="dialog"
    >
      <div
        className={`bg-store-bg border-store-border h-[86dvh] w-full overflow-y-auto rounded-t-lg border p-5 shadow-2xl ${
          isClosing
            ? 'storefront-mobile-drawer-exit'
            : 'storefront-mobile-drawer-enter'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-store-accent text-xs font-semibold tracking-[0.24em] uppercase">
              Element Wasser
            </p>
            <h2 className="font-display text-store-ink mt-1 text-lg font-semibold">
              {title}
            </h2>
          </div>
          <button
            aria-label={closeLabel}
            className={iconButtonClass}
            onClick={onClose}
            type="button"
          >
            <FaTimes aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    portalTarget
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
      <AddedCartItemContent item={item} />
    </div>
  )
}

function AddedCartItemContent({ item }: { item: StorefrontAddedCartItem }) {
  const t = useTranslations('Storefront.topNav')

  return (
    <>
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
    </>
  )
}
