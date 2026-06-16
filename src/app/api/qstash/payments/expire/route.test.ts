import { describe, expect, it, vi } from 'vitest'

const dbMock = vi.hoisted(() => ({ $transaction: vi.fn() }))
const expirePendingPaymentOrdersMock = vi.hoisted(() => vi.fn())
const verifyQstashSignatureMock = vi.hoisted(() =>
  vi.fn((handler: unknown) => handler)
)

vi.mock('~/server/db', () => ({
  db: dbMock
}))

vi.mock('~/server/commerce/order-lifecycle', () => ({
  expirePendingPaymentOrders: expirePendingPaymentOrdersMock
}))

vi.mock('~/server/queue/qstash', () => ({
  verifyQstashSignature: verifyQstashSignatureMock
}))

import { POST } from './route'

describe('POST /api/qstash/payments/expire', () => {
  it('verifies the QStash signature and expires pending-payment orders', async () => {
    expirePendingPaymentOrdersMock.mockResolvedValue([
      { id: 'order-1' },
      { id: 'order-2' }
    ])

    const response = await POST(new Request('https://store.example.com'))

    expect(verifyQstashSignatureMock).toHaveBeenCalledWith(expect.any(Function))
    expect(expirePendingPaymentOrdersMock).toHaveBeenCalledWith(dbMock)
    await expect(response.json()).resolves.toEqual({ cancelledCount: 2 })
  })
})
