import { beforeEach, describe, expect, it, vi } from 'vitest'

const isQstashConfiguredMock = vi.hoisted(() => vi.fn())
const publishQstashJsonMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/queue/qstash', () => ({
  isQstashConfigured: isQstashConfiguredMock,
  publishQstashJson: publishQstashJsonMock
}))

import {
  EXPIRE_PENDING_PAYMENTS_QSTASH_PATH,
  scheduleExpiredPaymentCleanup
} from '~/server/commerce/payment-cleanup-queue'

describe('scheduleExpiredPaymentCleanup', () => {
  beforeEach(() => {
    isQstashConfiguredMock.mockReset()
    publishQstashJsonMock.mockReset()
  })

  it('publishes a delayed QStash cleanup job for the payment expiration time', async () => {
    const paymentExpiresAt = new Date('2026-05-15T10:15:00Z')
    isQstashConfiguredMock.mockReturnValue(true)
    publishQstashJsonMock.mockResolvedValue({ messageId: 'msg_123' })

    await expect(
      scheduleExpiredPaymentCleanup({ paymentExpiresAt })
    ).resolves.toEqual({ messageId: 'msg_123' })

    expect(publishQstashJsonMock).toHaveBeenCalledWith({
      path: EXPIRE_PENDING_PAYMENTS_QSTASH_PATH,
      body: {},
      notBefore: 1778840100,
      deduplicationId:
        'expire-pending-payments:2026-05-15T10:15:00.000Z',
      retries: 3,
      label: 'expire-pending-payments'
    })
  })

  it('skips publishing when QStash is not configured', async () => {
    isQstashConfiguredMock.mockReturnValue(false)

    await expect(
      scheduleExpiredPaymentCleanup({
        paymentExpiresAt: new Date('2026-05-15T10:15:00Z')
      })
    ).resolves.toBeNull()

    expect(publishQstashJsonMock).not.toHaveBeenCalled()
  })

  it('skips publishing when the order has no payment expiration', async () => {
    isQstashConfiguredMock.mockReturnValue(true)

    await expect(
      scheduleExpiredPaymentCleanup({ paymentExpiresAt: null })
    ).resolves.toBeNull()

    expect(publishQstashJsonMock).not.toHaveBeenCalled()
  })
})
