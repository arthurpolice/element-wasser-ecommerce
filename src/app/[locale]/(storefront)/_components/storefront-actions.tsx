'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import {
  FaMinus,
  FaPlus,
  FaRegTrashAlt,
  FaRegUserCircle,
  FaShoppingBag,
  FaSignOutAlt
} from 'react-icons/fa'

import { StorefrontDrawerDialog } from '~/app/[locale]/(storefront)/_components/storefront-drawer-dialog'
import {
  useStorefrontCart,
  type StorefrontAddedCartItem,
  type StorefrontCartItem
} from '~/app/[locale]/(storefront)/_components/storefront-cart'
import { Link } from '~/i18n/navigation'
import { formatPriceCents } from '~/lib/format-catalog'
import { authClient } from '~/server/better-auth/client'
import { api, type RouterOutputs } from '~/trpc/react'

export type StorefrontDropdown = 'user' | 'cart' | 'added'

type CartPreviewItem = RouterOutputs['cart']['preview']['items'][number]

type TopNavActionsProps = {
  addedCartItem: StorefrontAddedCartItem | null
  closingDropdown: StorefrontDropdown | null
  mode: 'desktop' | 'mobile'
  openDropdown: StorefrontDropdown | null
  renderedDropdown: StorefrontDropdown | null
  sessionUserName: string
  setOpenDropdown: (dropdown: StorefrontDropdown | null) => void
  showDashboardLink: boolean
  signedIn: boolean
}

export const iconButtonClass =
  'inline-flex size-10 items-center justify-center text-store-ink transition hover:text-store-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25'

const dropdownClass =
  'absolute right-0 top-full mt-3 w-[min(calc(100vw-2rem),22rem)] border border-store-border bg-store-surface p-5 shadow-[0_24px_70px_-34px_rgba(31,42,36,0.45)]'

const menuLinkClass =
  'block py-2 text-sm font-medium text-store-ink underline decoration-store-border underline-offset-4 transition hover:text-store-accent hover:decoration-store-accent'

const amountButtonClass =
  'inline-flex size-7 items-center justify-center border border-store-border text-store-ink transition hover:border-store-accent/45 hover:text-store-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25 disabled:pointer-events-none disabled:opacity-40'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => window.clearTimeout(timeoutId)
  }, [delayMs, value])

  return debouncedValue
}

export function TopNavActions({
  addedCartItem,
  closingDropdown,
  mode,
  openDropdown,
  renderedDropdown,
  sessionUserName,
  setOpenDropdown,
  showDashboardLink,
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
          showDashboardLink={showDashboardLink}
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
            showDashboardLink={showDashboardLink}
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
  name,
  showDashboardLink
}: {
  animationClass: string
  name: string
  showDashboardLink: boolean
}) {
  return (
    <div className={`${dropdownClass} ${animationClass} hidden lg:block`}>
      <UserMenuContent name={name} showDashboardLink={showDashboardLink} />
    </div>
  )
}

function UserMenuContent({
  name,
  onNavigate,
  showDashboardLink
}: {
  name: string
  onNavigate?: () => void
  showDashboardLink: boolean
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
        {showDashboardLink ? (
          <Link
            className={menuLinkClass}
            href="/dashboard"
            onClick={onNavigate}
          >
            {t('dashboard')}
          </Link>
        ) : null}
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
  const previewLines = useMemo(
    () =>
      items.map((item) => ({
        productId: item.productId,
        quantity: item.amount
      })),
    [items]
  )
  const debouncedPreviewLines = useDebouncedValue(previewLines, 250)
  const previewQuery = api.cart.preview.useQuery(
    { lines: debouncedPreviewLines },
    {
      enabled: debouncedPreviewLines.length > 0,
      placeholderData: (previousData) => previousData,
      refetchOnMount: 'always',
      refetchOnReconnect: 'always',
      refetchOnWindowFocus: 'always'
    }
  )
  const previewItemsById = new Map(
    previewQuery.data?.items.map((item) => [item.productId, item]) ?? []
  )
  const hasKnownLineProblem = items.some(
    (item) => previewItemsById.get(item.productId)?.problemCode != null
  )

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
            {items.map((item) => {
              const previewItem = previewItemsById.get(item.productId)

              return (
                <CartDropdownItem
                  key={item.productId}
                  item={item}
                  previewItem={previewItem}
                  showPreviewSkeleton={
                    previewQuery.isFetching && previewItem == null
                  }
                />
              )
            })}
          </div>
          {hasKnownLineProblem ? (
            <span
              aria-disabled="true"
              className="border-store-border text-store-muted mt-5 inline-flex h-10 w-full cursor-not-allowed items-center justify-center border px-3 text-sm font-semibold opacity-60"
              title={t('resolveCartIssues')}
            >
              {t('checkout')}
            </span>
          ) : (
            <Link
              className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink focus-visible:ring-store-accent/25 mt-5 inline-flex h-10 w-full items-center justify-center border px-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
              href="/checkout"
              onClick={onNavigate}
            >
              {t('checkout')}
            </Link>
          )}
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
  return (
    <StorefrontDrawerDialog
      closeButtonClassName={iconButtonClass}
      closeIconClassName="size-5"
      closeLabel={closeLabel}
      eyebrow="Element Wasser"
      isClosing={isClosing}
      mobileOnly
      onClose={onClose}
      open
      rootDataStorefrontActions
      title={title}
      zIndexClassName="z-40"
    >
      {children}
    </StorefrontDrawerDialog>
  )
}

function CartDropdownItem({
  item,
  previewItem,
  showPreviewSkeleton
}: {
  item: StorefrontCartItem
  previewItem: CartPreviewItem | undefined
  showPreviewSkeleton: boolean
}) {
  const t = useTranslations('Storefront.topNav')
  const locale = useLocale()
  const removeItem = useStorefrontCart((state) => state.removeItem)
  const updateAmount = useStorefrontCart((state) => state.updateAmount)
  const productName = previewItem?.name ?? item.name
  const productSlug = previewItem?.slug ?? item.slug
  const imageUrl = previewItem?.imageUrl ?? item.imageUrl
  const imageAlt = previewItem?.imageAlt ?? item.imageAlt
  const problemCode = previewItem?.problemCode
  const productUnavailable =
    problemCode === 'MISSING_PRODUCT' || problemCode === 'INACTIVE_PRODUCT'
  const availableStock = previewItem?.availableStock
  const noStockAvailable =
    problemCode === 'INSUFFICIENT_STOCK' &&
    availableStock != null &&
    availableStock <= 0
  const quantityControlsDisabled = productUnavailable || noStockAvailable
  const maximumIncreaseAmount =
    previewItem && !productUnavailable
      ? Math.min(99, Math.max(0, previewItem.availableStock))
      : previewItem
        ? 0
        : 99
  const atAvailableStockLimit =
    previewItem != null &&
    !productUnavailable &&
    previewItem.availableStock > 0 &&
    item.amount >= previewItem.availableStock
  const productCanLink = !productUnavailable && Boolean(productSlug)

  return (
    <div className="flex gap-4 py-4">
      <div className="border-store-border/70 bg-store-bg relative size-14 shrink-0 overflow-hidden border">
        {imageUrl ? (
          <Image
            alt={imageAlt ?? productName}
            className="object-cover"
            fill
            sizes="56px"
            src={imageUrl}
          />
        ) : (
          <FaShoppingBag
            aria-hidden="true"
            className="text-store-accent absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {productCanLink ? (
          <Link
            className="text-store-ink decoration-store-border hover:text-store-accent hover:decoration-store-accent block truncate text-sm font-semibold underline underline-offset-4 transition"
            href={`/products/${productSlug}`}
          >
            {productName}
          </Link>
        ) : (
          <p className="text-store-ink truncate text-sm font-semibold">
            {productName}
          </p>
        )}

        {showPreviewSkeleton ? (
          <div
            aria-hidden="true"
            className="mt-2 flex animate-pulse items-center justify-between gap-3"
          >
            <span className="bg-store-border/60 h-3 w-20 rounded-sm" />
            <span className="bg-store-border/60 h-3 w-14 rounded-sm" />
          </div>
        ) : previewItem ? (
          <div className="text-store-muted mt-2 flex items-baseline justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span>
                {formatPriceCents(previewItem.unitPriceCents, locale)}
              </span>
              {previewItem.discountPercent ? (
                <span className="text-store-muted/70 line-through">
                  {formatPriceCents(previewItem.originalUnitPriceCents, locale)}
                </span>
              ) : null}
            </span>
            <span className="text-store-ink shrink-0 font-semibold">
              {productUnavailable
                ? t('unavailable')
                : problemCode
                  ? t('needsAttention')
                  : formatPriceCents(previewItem.lineTotalCents, locale)}
            </span>
          </div>
        ) : null}

        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center"
              role="group"
            >
              <button
                aria-label={t('decreaseAmount')}
                className={amountButtonClass}
                disabled={item.amount <= 1 || quantityControlsDisabled}
                onClick={() =>
                  updateAmount(item.productId, Math.max(1, item.amount - 1))
                }
                type="button"
              >
                <FaMinus aria-hidden="true" className="size-2.5" />
              </button>
              <input
                className="border-store-border bg-store-surface text-store-ink focus:ring-store-accent/25 h-7 w-11 border-y text-center text-xs font-semibold outline-none focus:ring-2"
                inputMode="numeric"
                max={99}
                min={1}
                onChange={(event) =>
                  updateAmount(
                    item.productId,
                    Number.parseInt(event.target.value, 10) || 1
                  )
                }
                disabled={quantityControlsDisabled}
                type="number"
                value={item.amount}
              />
              <button
                aria-label={t('increaseAmount')}
                className={amountButtonClass}
                disabled={
                  quantityControlsDisabled ||
                  item.amount >= maximumIncreaseAmount
                }
                onClick={() =>
                  updateAmount(
                    item.productId,
                    Math.min(maximumIncreaseAmount, item.amount + 1)
                  )
                }
                type="button"
              >
                <FaPlus aria-hidden="true" className="size-2.5" />
              </button>
            </div>
            <button
              aria-label={t('removeItem', { name: productName })}
              className="inline-flex size-7 items-center justify-center text-red-700 transition hover:bg-red-50 hover:text-red-900 focus-visible:ring-2 focus-visible:ring-red-700/25 focus-visible:outline-none"
              onClick={() => removeItem(item.productId)}
              type="button"
            >
              <FaRegTrashAlt aria-hidden="true" className="size-3" />
            </button>
          </div>
        </div>

        {showPreviewSkeleton ? (
          <div aria-hidden="true" className="mt-3 animate-pulse">
            <div className="bg-store-border/60 h-3 w-36 rounded-sm" />
          </div>
        ) : problemCode === 'INSUFFICIENT_STOCK' &&
          availableStock != null &&
          availableStock > 0 ? (
          <div className="mt-3 text-xs font-medium text-red-700">
            <p>{t('insufficientStock', { count: availableStock })}</p>
            <button
              className="focus-visible:ring-store-accent/25 mt-1.5 underline underline-offset-4 transition hover:text-red-900 focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => updateAmount(item.productId, availableStock)}
              type="button"
            >
              {t('setToAvailableStock', { count: availableStock })}
            </button>
          </div>
        ) : noStockAvailable ? (
          <p className="mt-3 text-xs font-medium text-red-700">
            {t('outOfStockAction')}
          </p>
        ) : productUnavailable ? (
          <p className="mt-3 text-xs font-medium text-red-700">
            {t('unavailableAction')}
          </p>
        ) : atAvailableStockLimit && availableStock != null ? (
          <p className="text-store-muted mt-3 text-xs">
            {t('availableStockLimit', { count: availableStock })}
          </p>
        ) : null}
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
