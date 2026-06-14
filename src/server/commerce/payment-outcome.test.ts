import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type Stripe from 'stripe'
import type {
  OrderPaymentStatus,
  PaymentStatus
} from '../../../generated/prisma'

import { handleStripeWebhookEvent } from '~/server/commerce/payment-outcome'
import { firstMockCall } from '~/test/mock-calls'

type MockPayment = {
  id: string
  orderId: string
  status: PaymentStatus
  providerReference: string | null
  stripeCheckoutSessionId: string | null
  order: {
    id: string
    paymentStatus: OrderPaymentStatus
  }
}

type MockDb = {
  payment: {
    findUnique: Mock<() => Promise<MockPayment | null>>
    findFirst: Mock<() => Promise<MockPayment | null>>
    update: Mock<
      (args: {
        where: { id: string }
        data: Partial<MockPayment>
      }) => Promise<MockPayment>
    >
  }
  order: {
    update: Mock<
      (args: {
        where: { id: string }
        data: Partial<MockPayment['order']>
      }) => Promise<MockPayment['order']>
    >
  }
  $transaction: Mock<(callback: (tx: MockDb) => Promise<void>) => Promise<void>>
}

function createPayment(overrides: Partial<MockPayment> = {}): MockPayment {
  return {
    id: 'payment-1',
    orderId: 'order-1',
    status: 'PENDING',
    providerReference: null,
    stripeCheckoutSessionId: 'cs_test_123',
    order: {
      id: 'order-1',
      paymentStatus: 'PENDING'
    },
    ...overrides
  }
}

function createMockDb(payment = createPayment()): MockDb {
  const db: MockDb = {
    payment: {
      findUnique: vi.fn(async () => payment),
      findFirst: vi.fn(async () => payment),
      update: vi.fn(async ({ data }) => ({ ...payment, ...data }))
    },
    order: {
      update: vi.fn(async ({ data }) => ({ ...payment.order, ...data }))
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }

  return db
}

function createEvent<TObject>(type: Stripe.Event.Type, object: TObject) {
  return {
    id: `evt_${type}`,
    type,
    data: { object }
  } as unknown as Stripe.Event
}

describe('handleStripeWebhookEvent', () => {
  it('marks a paid Checkout Session captured and sets the Order Payment Status to paid', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.completed', {
        id: 'cs_test_123',
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      })
    )

    expect(db.payment.findUnique).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      include: { order: true }
    })
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        stripeCheckoutSessionId: 'cs_test_123',
        failureReason: null
      }
    })
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'PAID' }
    })
  })

  it('is idempotent when the successful Payment was already captured', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        order: { id: 'order-1', paymentStatus: 'PAID' }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.completed', {
        id: 'cs_test_123',
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      })
    )

    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
  })

  it('marks an expired Checkout Session cancelled without releasing stock', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.expired', {
        id: 'cs_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      })
    )

    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: 'CANCELLED',
        failureReason: 'Stripe Checkout Session expired.',
        providerReference: null
      }
    })
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'FAILED' }
    })
    expect('product' in db).toBe(false)
  })

  it('does not downgrade a captured Payment when a stale Checkout Session expiry arrives', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        order: { id: 'order-1', paymentStatus: 'PAID' }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('checkout.session.expired', {
        id: 'cs_test_123',
        metadata: {
          paymentId: 'payment-1'
        }
      })
    )

    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
  })

  it('marks a failed PaymentIntent failed while keeping retry represented by failed Order Payment Status', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        },
        last_payment_error: {
          message: 'Card declined.'
        }
      })
    )

    const [paymentUpdateArgs] = firstMockCall(db.payment.update)
    expect(paymentUpdateArgs).toMatchObject({
      where: { id: 'payment-1' },
      data: {
        status: 'FAILED',
        providerReference: 'pi_test_123',
        failureReason: 'Card declined.'
      }
    })
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'FAILED' }
    })
  })

  it('does not downgrade a captured Payment when a stale PaymentIntent failure arrives', async () => {
    const db = createMockDb(
      createPayment({
        status: 'CAPTURED',
        providerReference: 'pi_test_123',
        order: { id: 'order-1', paymentStatus: 'PAID' }
      })
    )

    await handleStripeWebhookEvent(
      db as never,
      createEvent('payment_intent.payment_failed', {
        id: 'pi_test_123',
        metadata: {
          paymentId: 'payment-1'
        },
        last_payment_error: {
          message: 'Card declined.'
        }
      })
    )

    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
  })

  it('ignores unrelated Stripe events', async () => {
    const db = createMockDb()

    await handleStripeWebhookEvent(
      db as never,
      createEvent('charge.refunded', {
        id: 'ch_test_123'
      })
    )

    expect(db.payment.update).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
  })
})
