import { beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(() => ({ CRON_SECRET: 'cron-secret' }))
const dbMock = vi.hoisted(() => ({ $transaction: vi.fn() }))
const expirePendingPaymentOrdersMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({
  env: envMock
}))

vi.mock('~/server/db', () => ({
  db: dbMock
}))

vi.mock('~/server/commerce/order-lifecycle', () => ({
  expirePendingPaymentOrders: expirePendingPaymentOrdersMock
}))

import { GET } from './route'

describe('GET /api/cron/payments/expire', () => {
  beforeEach(() => {
    expirePendingPaymentOrdersMock.mockReset()
  })

  it('expires pending-payment orders for an authorized cron request', async () => {
    expirePendingPaymentOrdersMock.mockResolvedValue([
      { id: 'order-1' },
      { id: 'order-2' }
    ])

    const response = await GET(
      new Request('https://store.example.com/api/cron/payments/expire', {
        headers: { authorization: 'Bearer cron-secret' }
      })
    )

    expect(expirePendingPaymentOrdersMock).toHaveBeenCalledWith(dbMock)
    await expect(response.json()).resolves.toEqual({ cancelledCount: 2 })
  })

  it('rejects requests without the cron secret', async () => {
    const response = await GET(
      new Request('https://store.example.com/api/cron/payments/expire')
    )

    expect(response.status).toBe(401)
    expect(expirePendingPaymentOrdersMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized.' })
  })
})
