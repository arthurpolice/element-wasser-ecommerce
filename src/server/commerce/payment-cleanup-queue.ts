import 'server-only'

import { isQstashConfigured, publishQstashJson } from '~/server/queue/qstash'

export const EXPIRE_PENDING_PAYMENTS_QSTASH_PATH =
  '/api/qstash/payments/expire'

export async function scheduleExpiredPaymentCleanup(input: {
  paymentExpiresAt: Date | null
}) {
  if (!input.paymentExpiresAt || !isQstashConfigured()) {
    return null
  }

  return publishQstashJson({
    path: EXPIRE_PENDING_PAYMENTS_QSTASH_PATH,
    body: {},
    notBefore: Math.ceil(input.paymentExpiresAt.getTime() / 1000),
    deduplicationId: `expire-pending-payments:${input.paymentExpiresAt.toISOString()}`,
    retries: 3,
    label: 'expire-pending-payments'
  })
}
