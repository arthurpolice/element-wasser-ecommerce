'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  FaCheckCircle,
  FaClock,
  FaCreditCard,
  FaExclamationCircle,
  FaMobileAlt,
  FaSpinner
} from 'react-icons/fa'

import { Link } from '~/i18n/navigation'
import { formatPriceCents } from '~/lib/format-catalog'
import { getSwissPostTrackingUrl } from '~/lib/order-tracking'
import { api, type RouterOutputs } from '~/trpc/react'

type OrderConfirmation = RouterOutputs['checkout']['orderConfirmation']
type RetryPaymentMethod = 'CARD' | 'TWINT'

type CheckoutConfirmationClientProps = {
  orderAccessToken: string | null
  orderNumber: string | null
  stripeResult: string | null
}

function paymentTone(paymentStatus: OrderConfirmation['paymentStatus']) {
  switch (paymentStatus) {
    case 'PAID':
      return {
        icon: <FaCheckCircle aria-hidden="true" className="size-4" />,
        className: 'text-store-accent'
      }
    case 'FAILED':
    case 'CANCELLED':
      return {
        icon: <FaExclamationCircle aria-hidden="true" className="size-4" />,
        className: 'text-red-700'
      }
    case 'PENDING':
    default:
      return {
        icon: <FaClock aria-hidden="true" className="size-4" />,
        className: 'text-store-muted'
      }
  }
}

function formatAddress(parts: Array<string | null>) {
  return parts.filter(Boolean).join(', ')
}

export function CheckoutConfirmationClient({
  orderAccessToken,
  orderNumber,
  stripeResult
}: CheckoutConfirmationClientProps) {
  const t = useTranslations('Storefront.checkoutConfirmation')
  const tPaymentStatus = useTranslations('OrderPaymentStatus')
  const locale = useLocale()
  const format = useFormatter()
  const [retryPaymentMethod, setRetryPaymentMethod] =
    useState<RetryPaymentMethod>('CARD')
  const orderQuery = api.checkout.orderConfirmation.useQuery(
    {
      orderNumber: orderNumber ?? '',
      accessToken: orderAccessToken ?? undefined
    },
    { enabled: Boolean(orderNumber) }
  )
  const retryPayment = api.checkout.retryPayment.useMutation({
    onSuccess: (result) => {
      window.location.assign(result.checkoutUrl)
    }
  })
  const reconcilePayment = api.checkout.reconcilePayment.useMutation({
    onSuccess: async () => {
      await orderQuery.refetch()
    }
  })

  useEffect(() => {
    if (
      stripeResult !== 'success' ||
      orderQuery.data?.paymentStatus !== 'PENDING'
    ) {
      return
    }

    const interval = window.setInterval(() => {
      if (!reconcilePayment.isPending) {
        reconcilePayment.mutate({
          orderNumber: orderNumber ?? '',
          accessToken: orderAccessToken ?? undefined
        })
      }
    }, 30000)

    return () => window.clearInterval(interval)
  }, [
    orderAccessToken,
    orderNumber,
    orderQuery.data?.paymentStatus,
    reconcilePayment,
    stripeResult
  ])

  if (!orderNumber) {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 lg:px-10">
        <EmptyConfirmationState
          actionHref="/checkout"
          actionLabel={t('returnToCheckout')}
          message={t('missingOrder')}
          title={t('missingTitle')}
        />
      </main>
    )
  }

  if (orderQuery.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 lg:px-10">
        <p className="text-store-muted border-store-border border-y py-8 text-sm">
          {t('loading')}
        </p>
      </main>
    )
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 lg:px-10">
        <EmptyConfirmationState
          actionHref="/customer-area/orders"
          actionLabel={t('viewOrders')}
          message={t('error')}
          title={t('errorTitle')}
        />
      </main>
    )
  }

  const order = orderQuery.data
  const trackingUrl = getSwissPostTrackingUrl(order.trackingNumber)
  const tone = paymentTone(order.paymentStatus)
  const canShowRetryPayment =
    order.canRetryPayment && stripeResult !== 'success'

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:px-10 lg:py-16">
      <div className="border-store-border border-b pb-8">
        <p className="text-store-accent text-xs font-semibold tracking-[0.22em] uppercase">
          {t('eyebrow')}
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-store-ink text-3xl font-semibold tracking-normal sm:text-5xl">
              {order.orderNumber}
            </h1>
            <p className="text-store-muted mt-3 text-sm leading-6 sm:text-base">
              {format.dateTime(order.placedAt, {
                dateStyle: 'medium',
              })}
            </p>
          </div>
          <p className="font-display text-store-ink text-3xl font-semibold">
            {formatPriceCents(order.totalCents, locale)}
          </p>
        </div>
      </div>

      <section className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-12">
        <div>
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${tone.className}`}
          >
            {tone.icon}
            {t('paymentStatus', {
              status: tPaymentStatus(order.paymentStatus)
            })}
          </div>
          {order.dispatchedAt ? (
            <div className="border-store-border bg-store-paper mt-6 border-l-2 px-4 py-4">
              <p className="text-store-ink font-semibold">
                {t('dispatchedWithSwissPost')}
              </p>
              <p className="text-store-muted mt-1 text-sm">
                {format.dateTime(order.dispatchedAt, {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </p>
              {trackingUrl ? (
                <a
                  className="text-store-accent mt-3 inline-flex text-sm font-semibold underline underline-offset-4"
                  href={trackingUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t('trackShipment')}
                </a>
              ) : null}
            </div>
          ) : null}
          {canShowRetryPayment ? (
            <PaymentRetryPanel
              disabled={retryPayment.isPending}
              error={retryPayment.isError ? t('retryError') : null}
              method={retryPaymentMethod}
              onMethodChange={setRetryPaymentMethod}
              onRetry={() =>
                retryPayment.mutate({
                  orderNumber: order.orderNumber,
                  accessToken: orderAccessToken ?? undefined,
                  paymentMethod: retryPaymentMethod,
                  locale: locale === 'en' ? 'en' : 'de'
                })
              }
            />
          ) : null}

          <div className="divide-store-border border-store-border mt-8 divide-y border-y">
            {order.lines.map((line) => (
              <div
                className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_8rem]"
                key={line.id}
              >
                <div>
                  <p className="text-store-ink font-semibold">
                    {line.productName}
                  </p>
                  <p className="text-store-muted mt-1 text-sm">
                    {line.productSku} ·{' '}
                    {t('quantity', { quantity: line.quantity })}
                  </p>
                </div>
                <p className="text-store-ink font-semibold sm:text-right">
                  {formatPriceCents(line.lineTotalCents, locale)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <aside className="text-sm">
          <h2 className="text-store-ink font-semibold">{t('addresses')}</h2>
          <dl className="mt-4 grid gap-4">
            <div>
              <dt className="text-store-muted">{t('shipping')}</dt>
              <dd className="text-store-ink mt-1">
                {formatAddress([
                  `${order.shippingFirstName} ${order.shippingLastName}`,
                  order.shippingStreetLine1,
                  order.shippingStreetLine2,
                  `${order.shippingPostalCode} ${order.shippingCity}`,
                  order.shippingCountryCode
                ])}
              </dd>
            </div>
            <div>
              <dt className="text-store-muted">{t('billing')}</dt>
              <dd className="text-store-ink mt-1">
                {formatAddress([
                  `${order.billingFirstName} ${order.billingLastName}`,
                  order.billingStreetLine1,
                  order.billingStreetLine2,
                  `${order.billingPostalCode} ${order.billingCity}`,
                  order.billingCountryCode
                ])}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  )
}

function PaymentRetryPanel({
  disabled,
  error,
  method,
  onMethodChange,
  onRetry
}: {
  disabled: boolean
  error: string | null
  method: RetryPaymentMethod
  onMethodChange: (method: RetryPaymentMethod) => void
  onRetry: () => void
}) {
  const t = useTranslations('Storefront.checkoutConfirmation')

  return (
    <div className="border-store-border bg-store-surface/55 mt-6 border p-4">
      <p className="text-store-ink text-sm font-semibold">{t('retryTitle')}</p>
      <p className="text-store-muted mt-2 text-sm leading-6">
        {t('retryDescription')}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <RetryMethodButton
          checked={method === 'CARD'}
          disabled={disabled}
          icon={<FaCreditCard aria-hidden="true" className="size-3.5" />}
          label={t('retryCard')}
          onClick={() => onMethodChange('CARD')}
        />
        <RetryMethodButton
          checked={method === 'TWINT'}
          disabled={disabled}
          icon={<FaMobileAlt aria-hidden="true" className="size-3.5" />}
          label={t('retryTwint')}
          onClick={() => onMethodChange('TWINT')}
        />
      </div>
      <button
        className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink disabled:border-store-border disabled:text-store-muted/45 focus-visible:ring-store-accent/25 mt-5 inline-flex h-11 items-center justify-center gap-2 border px-5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={onRetry}
        type="button"
      >
        {disabled ? (
          <FaSpinner aria-hidden="true" className="size-3.5 animate-spin" />
        ) : null}
        {disabled ? t('retryRedirecting') : t('retryAction')}
      </button>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  )
}

function RetryMethodButton({
  checked,
  disabled,
  icon,
  label,
  onClick
}: {
  checked: boolean
  disabled: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`border-store-border focus-visible:ring-store-accent/25 inline-flex h-10 items-center gap-2 border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? 'border-store-accent text-store-ink shadow-[inset_0_0_0_1px_var(--color-store-accent)]'
          : 'text-store-muted hover:border-store-accent/45 hover:text-store-ink'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  )
}

function EmptyConfirmationState({
  actionHref,
  actionLabel,
  message,
  title
}: {
  actionHref: string
  actionLabel: string
  message: string
  title: string
}) {
  return (
    <section className="grid min-h-[20rem] place-items-center text-center">
      <div className="max-w-md">
        <h1 className="font-display text-store-ink text-3xl font-semibold">
          {title}
        </h1>
        <p className="text-store-muted mt-3 text-sm leading-6">{message}</p>
        <Link
          className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink focus-visible:ring-store-accent/25 mt-7 inline-flex h-11 items-center justify-center border px-5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      </div>
    </section>
  )
}
