import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import { recordStripeWebhookEvent } from '~/server/payments/stripe-webhook'
import { firstMockCall } from '~/test/mock-calls'

type MockPayment = {
  id: string
  orderId: string
  status: string
  providerReference: string | null
  order: {
    id: string
    status: string
    paymentStatus: string
    fulfillmentStatus: string
  }
}

type MockDb = {
  payment: {
    findFirst: Mock<
      (args: Record<string, unknown>) => Promise<MockPayment | null>
    >
    update: Mock<(args: Record<string, unknown>) => Promise<MockPayment>>
  }
  order: {
    update: Mock<
      (args: Record<string, unknown>) => Promise<MockPayment['order']>
    >
  }
  product: {
    update: Mock<(args: Record<string, unknown>) => Promise<null>>
  }
  $transaction: Mock<
    (callback: (tx: MockDb) => Promise<unknown>) => Promise<unknown>
  >
}

function createPayment(overrides: Partial<MockPayment> = {}): MockPayment {
  return {
    id: 'payment-1',
    orderId: 'order-1',
    status: 'PENDING',
    providerReference: null,
    order: {
      id: 'order-1',
      status: 'PLACED',
      paymentStatus: 'PENDING',
      fulfillmentStatus: 'UNFULFILLED'
    },
    ...overrides
  }
}

function createMockDb(payment: MockPayment | null = createPayment()): MockDb {
  const db: MockDb = {
    payment: {
      findFirst: vi.fn(async () => payment),
      update: vi.fn(async () => payment ?? createPayment())
    },
    order: {
      update: vi.fn(async () => payment?.order ?? createPayment().order)
    },
    product: {
      update: vi.fn(async () => null)
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }

  return db
}

function stripeEvent(type: Stripe.Event.Type, object: unknown): Stripe.Event {
  return {
    id: `evt_${type}`,
    object: 'event',
    type,
    data: { object },
    api_version: '2025-12-17.clover',
    created: 1,
    livemode: false,
    pending_webhooks: 1,
    request: null
  } as unknown as Stripe.Event
}

function checkoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_payment',
    object: 'checkout.session',
    payment_status: 'paid',
    metadata: {
      orderId: 'order-1',
      paymentId: 'payment-1'
    },
    ...overrides
  } as unknown as Stripe.Checkout.Session
}

function paymentIntent(
  overrides: Partial<Stripe.PaymentIntent> = {}
): Stripe.PaymentIntent {
  return {
    id: 'pi_test_failed',
    object: 'payment_intent',
    metadata: {
      orderId: 'order-1',
      paymentId: 'payment-1'
    },
    last_payment_error: {
      message: 'Card was declined.'
    },
    ...overrides
  } as unknown as Stripe.PaymentIntent
}

describe('recordStripeWebhookEvent', () => {
  it('marks a paid Checkout Session payment captured and the Order payment status paid', async () => {
    const db = createMockDb()

    const outcome = await recordStripeWebhookEvent(
      db as never,
      stripeEvent('checkout.session.completed', checkoutSession())
    )

    expect(outcome).toEqual({
      action: 'captured',
      paymentId: 'payment-1',
      orderId: 'order-1'
    })
    const [paymentLookupArgs] = firstMockCall(db.payment.findFirst)
    expect(paymentLookupArgs).toMatchObject({
      where: {
        id: 'payment-1',
        provider: 'STRIPE',
        type: 'CHARGE'
      }
    })
    const [paymentUpdateArgs] = firstMockCall(db.payment.update)
    expect(paymentUpdateArgs).toMatchObject({
      where: { id: 'payment-1' },
      data: {
        status: 'CAPTURED',
        failureReason: null,
        providerReference: 'cs_test_payment'
      }
    })
    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs).toEqual({
      where: { id: 'order-1' },
      data: {
        paymentStatus: 'PAID'
      }
    })
    expect(db.product.update).not.toHaveBeenCalled()
  })

  it('ignores completed Checkout Sessions that Stripe has not marked paid', async () => {
    const db = createMockDb()

    const outcome = await recordStripeWebhookEvent(
      db as never,
      stripeEvent(
        'checkout.session.completed',
        checkoutSession({ payment_status: 'unpaid' })
      )
    )

    expect(outcome).toEqual({
      action: 'ignored',
      reason: 'checkout_session_not_paid'
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('marks an expired Checkout Session payment cancelled without cancelling the Order or releasing stock', async () => {
    const db = createMockDb()

    const outcome = await recordStripeWebhookEvent(
      db as never,
      stripeEvent('checkout.session.expired', checkoutSession())
    )

    expect(outcome).toEqual({
      action: 'cancelled',
      paymentId: 'payment-1',
      orderId: 'order-1'
    })
    const [paymentUpdateArgs] = firstMockCall(db.payment.update)
    expect(paymentUpdateArgs).toMatchObject({
      where: { id: 'payment-1' },
      data: {
        status: 'CANCELLED',
        failureReason: null,
        providerReference: 'cs_test_payment'
      }
    })
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.product.update).not.toHaveBeenCalled()
  })

  it('does not let a stale expired Checkout Session downgrade an already paid Order', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        order: {
          id: 'order-1',
          status: 'PLACED',
          paymentStatus: 'PAID',
          fulfillmentStatus: 'UNFULFILLED'
        }
      })
    )

    const outcome = await recordStripeWebhookEvent(
      db as never,
      stripeEvent('checkout.session.expired', checkoutSession())
    )

    expect(outcome).toEqual({ action: 'ignored', reason: 'already_paid' })
    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.product.update).not.toHaveBeenCalled()
  })

  it('marks a failed PaymentIntent payment failed while keeping the placed Order retryable', async () => {
    const db = createMockDb()

    const outcome = await recordStripeWebhookEvent(
      db as never,
      stripeEvent('payment_intent.payment_failed', paymentIntent())
    )

    expect(outcome).toEqual({
      action: 'failed',
      paymentId: 'payment-1',
      orderId: 'order-1'
    })
    const [paymentUpdateArgs] = firstMockCall(db.payment.update)
    expect(paymentUpdateArgs).toMatchObject({
      where: { id: 'payment-1' },
      data: {
        status: 'FAILED',
        failureReason: 'Card was declined.'
      }
    })
    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs).toEqual({
      where: { id: 'order-1' },
      data: {
        paymentStatus: 'FAILED'
      }
    })
    expect(db.product.update).not.toHaveBeenCalled()
  })

  it('does not let a stale failed PaymentIntent downgrade an already paid Order', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        order: {
          id: 'order-1',
          status: 'PLACED',
          paymentStatus: 'PAID',
          fulfillmentStatus: 'UNFULFILLED'
        }
      })
    )

    const outcome = await recordStripeWebhookEvent(
      db as never,
      stripeEvent('payment_intent.payment_failed', paymentIntent())
    )

    expect(outcome).toEqual({ action: 'ignored', reason: 'already_paid' })
    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.product.update).not.toHaveBeenCalled()
  })

  it('falls back to the Checkout Session provider reference when metadata is unavailable', async () => {
    const db = createMockDb(
      createPayment({ providerReference: 'cs_test_payment' })
    )

    await recordStripeWebhookEvent(
      db as never,
      stripeEvent(
        'checkout.session.completed',
        checkoutSession({ metadata: null })
      )
    )

    expect(db.payment.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          provider: 'STRIPE',
          providerReference: 'cs_test_payment',
          type: 'CHARGE'
        }
      })
    )
  })

  it('replays the same event idempotently without touching stock reservations', async () => {
    const db = createMockDb()
    const event = stripeEvent('checkout.session.expired', checkoutSession())

    await recordStripeWebhookEvent(db as never, event)
    await recordStripeWebhookEvent(db as never, event)

    expect(db.payment.update).toHaveBeenCalledTimes(2)
    expect(db.payment.update.mock.calls[0]).toEqual(
      db.payment.update.mock.calls[1]
    )
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.product.update).not.toHaveBeenCalled()
  })

  it('acknowledges irrelevant Stripe events without mutating commerce state', async () => {
    const db = createMockDb()

    const outcome = await recordStripeWebhookEvent(
      db as never,
      stripeEvent('customer.created', { id: 'cus_test' })
    )

    expect(outcome).toEqual({ action: 'ignored', reason: 'irrelevant_event' })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.product.update).not.toHaveBeenCalled()
  })
})
