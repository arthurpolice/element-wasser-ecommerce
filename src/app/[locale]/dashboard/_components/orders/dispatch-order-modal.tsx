'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  DashboardButton,
  dashDialogClass,
  dashInputClass,
  dashSelectClass
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import type { RouterOutputs } from '~/trpc/react'

type OrderRow = RouterOutputs['order']['list']['items'][number]

type DispatchOrderDialogProps = {
  order: OrderRow | null
  pending: boolean
  error?: string
  onClose: () => void
  onSubmit: (trackingNumber?: string) => void
}

export function DispatchOrderDialog({
  order,
  pending,
  error,
  onClose,
  onSubmit
}: DispatchOrderDialogProps) {
  const t = useTranslations('Orders.dispatch')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [trackingNumber, setTrackingNumber] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (order && !dialog.open) {
      setTrackingNumber('')
      dialog.showModal()
    } else if (!order && dialog.open) {
      dialog.close()
    }
  }, [order])

  return (
    <dialog
      className={`${dashDialogClass} max-w-lg`}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onClose()
      }}
      ref={dialogRef}
    >
      <form
        className="flex flex-col gap-6 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(trackingNumber.trim() || undefined)
        }}
      >
        <div className="border-dash-border border-b pb-4">
          <p className="text-dash-accent text-xs font-semibold tracking-[0.18em] uppercase">
            {order?.orderNumber}
          </p>
          <h2 className="font-display text-dash-ink mt-2 text-xl font-semibold">
            {t('title')}
          </h2>
          <p className="text-dash-muted mt-1 text-sm">{t('description')}</p>
        </div>

        <label className="block text-sm">
          <span className="text-dash-muted mb-1.5 block text-xs font-semibold tracking-wider uppercase">
            {t('carrier')}
          </span>
          <select
            aria-readonly="true"
            className={`${dashSelectClass} w-full`}
            value="SWISS_POST"
            onChange={() => undefined}
          >
            <option value="SWISS_POST">{t('swissPost')}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-dash-muted mb-1.5 block text-xs font-semibold tracking-wider uppercase">
            {t('trackingNumber')}
          </span>
          <input
            autoComplete="off"
            className={dashInputClass}
            maxLength={64}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder={t('trackingPlaceholder')}
            value={trackingNumber}
          />
          <span className="text-dash-muted mt-1.5 block text-xs">
            {t('trackingHint')}
          </span>
        </label>

        {error ? <p className="text-dash-danger text-sm">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <DashboardButton
            disabled={pending}
            onClick={onClose}
            variant="secondary"
          >
            {t('cancel')}
          </DashboardButton>
          <DashboardButton disabled={pending} type="submit">
            {pending ? t('submitting') : t('submit')}
          </DashboardButton>
        </div>
      </form>
    </dialog>
  )
}
