'use client'

import { useEffect, useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import {
  DashboardButton,
  dashDialogClass
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import { api } from '~/trpc/react'

type OrderDetailDialogProps = {
  orderId: string | null
  onClose: () => void
}

const statusClasses = {
  PENDING: 'bg-amber-50 text-amber-800 ring-amber-200',
  SENT: 'bg-blue-50 text-blue-800 ring-blue-200',
  DELIVERED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  FAILED: 'bg-red-50 text-red-800 ring-red-200'
} as const

export function OrderDetailDialog({
  orderId,
  onClose
}: OrderDetailDialogProps) {
  const t = useTranslations('Orders.detail')
  const format = useFormatter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const utils = api.useUtils()
  const query = api.order.detail.useQuery(
    { orderId: orderId ?? '' },
    { enabled: Boolean(orderId) }
  )
  const retry = api.order.retryEmailNotification.useMutation({
    onSuccess: async () => {
      await utils.order.detail.invalidate()
    }
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (orderId && !dialog.open) dialog.showModal()
    if (!orderId && dialog.open) dialog.close()
  }, [orderId])

  function date(value: Date | null) {
    return value
      ? format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' })
      : t('notAvailable')
  }

  return (
    <dialog
      className={`${dashDialogClass} max-w-4xl`}
      onCancel={(event) => {
        event.preventDefault()
        if (!retry.isPending) onClose()
      }}
      ref={dialogRef}
    >
      <div className="max-h-[90vh] overflow-y-auto p-6">
        <div className="border-dash-border flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-dash-accent text-xs font-semibold tracking-[0.18em] uppercase">
              {query.data?.orderNumber}
            </p>
            <h2 className="font-display text-dash-ink mt-2 text-xl font-semibold">
              {t('title')}
            </h2>
            {query.data ? (
              <p className="text-dash-muted mt-1 text-sm">
                {query.data.customerFirstName} {query.data.customerLastName} ·{' '}
                {query.data.customerEmail}
              </p>
            ) : null}
          </div>
          <DashboardButton
            disabled={retry.isPending}
            onClick={onClose}
            variant="ghost"
          >
            {t('close')}
          </DashboardButton>
        </div>

        {query.isLoading ? (
          <p className="text-dash-muted py-8 text-sm">{t('loading')}</p>
        ) : query.isError ? (
          <p className="text-dash-danger py-8 text-sm">{t('error')}</p>
        ) : query.data?.emailNotifications.length === 0 ? (
          <p className="text-dash-muted py-8 text-sm">{t('empty')}</p>
        ) : (
          <div className="mt-6 grid gap-4">
            {query.data?.emailNotifications.map((notification) => (
              <article
                className="border-dash-border rounded-xl border p-4"
                key={notification.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-dash-ink font-semibold">
                      {t(`types.${notification.type}`)}
                    </h3>
                    <p className="text-dash-muted mt-1 text-sm">
                      {notification.recipientEmail}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClasses[notification.status]}`}
                  >
                    {t(`statuses.${notification.status}`)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-dash-muted">{t('createdAt')}</dt>
                    <dd className="text-dash-ink mt-1">
                      {date(notification.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-dash-muted">{t('sentAt')}</dt>
                    <dd className="text-dash-ink mt-1">
                      {date(notification.sentAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-dash-muted">{t('deliveredAt')}</dt>
                    <dd className="text-dash-ink mt-1">
                      {date(notification.deliveredAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-dash-muted">{t('attemptCount')}</dt>
                    <dd className="text-dash-ink mt-1">
                      {notification.attemptCount}
                    </dd>
                  </div>
                </dl>

                {notification.lastError ? (
                  <p className="bg-dash-danger-bg text-dash-danger mt-4 rounded-lg px-3 py-2 text-sm">
                    {notification.lastError}
                  </p>
                ) : null}

                {notification.status === 'FAILED' ? (
                  <div className="mt-4 flex justify-end">
                    <DashboardButton
                      disabled={retry.isPending}
                      onClick={() =>
                        retry.mutate({
                          emailNotificationId: notification.id
                        })
                      }
                      variant="secondary"
                    >
                      {retry.isPending ? t('retrying') : t('retry')}
                    </DashboardButton>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </dialog>
  )
}
