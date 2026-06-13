import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { firstMockCall } from '~/test/mock-calls'

const constructEvent = vi.hoisted(() => vi.fn())
const envMock = vi.hoisted(() => ({
  STRIPE_SECRET_KEY: 'sk_test_element_wasser',
  STRIPE_WEBHOOK_SECRET: 'whsec_element_wasser'
}))
const paymentUpdate = vi.hoisted(() => vi.fn())
const orderUpdate = vi.hoisted(() => vi.fn())
const productUpdate = vi.hoisted(() => vi.fn())
const paymentFindFirst = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    webhooks: {
      constructEvent
    }
  }))
}))

vi.mock('~/env', () => ({
  env: envMock
}))

vi.mock('~/server/db', () => ({
  db: {
    $transaction: transaction
  }
}))

function checkoutSessionEvent(): Stripe.Event {
  return {
    id: 'evt_paid',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_paid',
        object: 'checkout.session',
        payment_status: 'paid',
        metadata: {
          orderId: 'order-1',
          paymentId: 'payment-1'
        }
      }
    },
    api_version: '2025-12-17.clover',
    created: 1,
    livemode: false,
    pending_webhooks: 1,
    request: null
  } as unknown as Stripe.Event
}

describe('Stripe webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    envMock.STRIPE_SECRET_KEY = 'sk_test_element_wasser'
    envMock.STRIPE_WEBHOOK_SECRET = 'whsec_element_wasser'
    paymentFindFirst.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      status: 'PENDING',
      providerReference: null,
      order: {
        id: 'order-1',
        status: 'PLACED',
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED'
      }
    })
    paymentUpdate.mockResolvedValue({})
    orderUpdate.mockResolvedValue({})
    productUpdate.mockResolvedValue(null)
    transaction.mockImplementation(async (callback) =>
      callback({
        payment: {
          findFirst: paymentFindFirst,
          update: paymentUpdate
        },
        order: {
          update: orderUpdate
        },
        product: {
          update: productUpdate
        }
      })
    )
  })

  it('verifies the raw Stripe payload before recording the payment outcome', async () => {
    constructEvent.mockReturnValue(checkoutSessionEvent())
    const { POST } = await import('~/app/api/stripe/webhook/route')

    const response = await POST(
      new Request('https://shop.example.com/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'signed-payload'
        },
        body: '{"raw":true}'
      }) as never
    )

    expect(constructEvent).toHaveBeenCalledWith(
      '{"raw":true}',
      'signed-payload',
      'whsec_element_wasser'
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true })
    const [paymentUpdateArgs] = firstMockCall(paymentUpdate)
    expect(paymentUpdateArgs).toMatchObject({
      where: { id: 'payment-1' },
      data: {
        status: 'CAPTURED',
        failureReason: null,
        providerReference: 'cs_paid'
      }
    })
    const [orderUpdateArgs] = firstMockCall(orderUpdate)
    expect(orderUpdateArgs).toEqual({
      where: { id: 'order-1' },
      data: { paymentStatus: 'PAID' }
    })
  })

  it('rejects requests without a Stripe signature before touching payment state', async () => {
    const { POST } = await import('~/app/api/stripe/webhook/route')

    const response = await POST(
      new Request('https://shop.example.com/api/stripe/webhook', {
        method: 'POST',
        body: '{"raw":true}'
      }) as never
    )

    expect(response.status).toBe(400)
    expect(constructEvent).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects invalid Stripe signatures before touching payment state', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('signature mismatch')
    })
    const { POST } = await import('~/app/api/stripe/webhook/route')

    const response = await POST(
      new Request('https://shop.example.com/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'bad-signature'
        },
        body: '{"raw":true}'
      }) as never
    )

    expect(response.status).toBe(400)
    expect(transaction).not.toHaveBeenCalled()
    expect(paymentUpdate).not.toHaveBeenCalled()
    expect(orderUpdate).not.toHaveBeenCalled()
  })
})
