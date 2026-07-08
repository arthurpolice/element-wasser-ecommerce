import { beforeEach, describe, expect, it, vi } from 'vitest'

const retrieveStripeCheckoutSessionMock = vi.hoisted(() => vi.fn())
const expireStripeCheckoutSessionMock = vi.hoisted(() => vi.fn())
const startStripeCheckoutMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/commerce/email-notifications', () => ({
  publishEmailNotificationSafely: vi.fn()
}))
vi.mock('~/server/payments/stripe-checkout', () => ({
  retrieveStripeCheckoutSession: retrieveStripeCheckoutSessionMock,
  expireStripeCheckoutSession: expireStripeCheckoutSessionMock,
  startStripeCheckout: startStripeCheckoutMock
}))

import {
  beginCheckoutPayment,
  beginGuestCheckoutPayment,
  retryCheckoutPayment
} from './checkout-payment'
import { OrderPlacementError } from './order-placement'

type CustomerRecord = {
  id: string
  email: string
  firstName: string
  lastName: string
}

function createPlacementFailureDb() {
  const customers: CustomerRecord[] = []
  const db = {
    customer: {
      create: vi.fn(async ({ data }: { data: Omit<CustomerRecord, 'id'> }) => {
        const customer = { id: 'customer-1', ...data }
        customers.push(customer)
        return { id: customer.id }
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          customers.find((customer) => customer.id === where.id) ?? null
      )
    },
    order: {
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => 0)
    },
    product: {
      findMany: vi.fn(async () => [
        {
          id: 'product-1',
          name: 'Inactive filter',
          sku: 'EW-FIL-00001',
          active: false,
          priceCents: 2000,
          costCents: 900,
          discountPercent: null,
          shippingWeightGrams: 1000,
          stockOnHand: 10,
          stockReserved: 0
        }
      ])
    },
    $transaction: vi.fn(
      async (callback: (tx: typeof db) => Promise<unknown>) => {
        const customerSnapshot = [...customers]
        try {
          return await callback(db)
        } catch (error) {
          customers.splice(0, customers.length, ...customerSnapshot)
          throw error
        }
      }
    ),
    $queryRaw: vi.fn(async () => [])
  }

  return { db, customers }
}

function createRetryDb() {
  const oldPayment = {
    id: 'payment-old',
    type: 'CHARGE',
    provider: 'STRIPE',
    paymentMethod: 'CARD',
    status: 'PENDING',
    amountCents: 2900,
    currencyCode: 'CHF',
    providerReference: null,
    stripeCheckoutSessionId: 'cs_old',
    createdAt: new Date('2026-06-21T10:00:00Z')
  }
  const order = {
    id: 'order-1',
    orderNumber: 'EW-2026-00001',
    customerId: 'customer-1',
    customerEmail: 'river@example.com',
    customer: { userId: 'user-1' },
    origin: 'STOREFRONT',
    status: 'PLACED',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'UNFULFILLED',
    paymentExpiresAt: new Date('2099-06-21T10:30:00Z'),
    paymentExpiryStartedAt: null,
    totalCents: 2900,
    currencyCode: 'CHF',
    shippingCents: 900,
    lines: [
      {
        id: 'line-1',
        productId: 'product-1',
        productName: 'Filter',
        productSku: 'EW-FIL-00001',
        quantity: 1,
        listPriceCents: 2000,
        discountPercent: null,
        unitPriceCents: 2000,
        lineTotalCents: 2000
      }
    ],
    payments: [oldPayment]
  }
  const db = {
    $queryRaw: vi.fn(async () => []),
    order: {
      findFirst: vi.fn(async () => order),
      findUniqueOrThrow: vi.fn(async () => ({
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentExpiresAt: order.paymentExpiresAt,
        payments: order.payments.map((payment) => ({
          status: payment.status
        }))
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(order, data)
        return order
      })
    },
    payment: {
      updateMany: vi.fn(async () => {
        oldPayment.status = 'CANCELLED'
        return { count: 1 }
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const payment = {
          id: 'payment-new',
          status: 'PENDING',
          providerReference: null,
          stripeCheckoutSessionId: null,
          createdAt: new Date('2026-06-21T10:05:00Z'),
          ...data
        }
        order.payments = [payment as never]
        return payment
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(order.payments[0]!, data)
        return order.payments[0]
      })
    },
    emailNotification: {
      upsert: vi.fn()
    },
    $transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) =>
      callback(db)
    )
  }

  return db
}

function createCheckoutStartDb() {
  let storedOrder: Record<string, any> | null = null
  const db = {
    customer: {
      findUnique: vi.fn(async () => ({
        id: 'customer-1',
        email: 'river@example.com',
        firstName: 'River',
        lastName: 'Stone',
        salutation: null
      }))
    },
    product: {
      findMany: vi.fn(async () => [
        {
          id: 'product-1',
          name: 'Filter',
          sku: 'EW-FIL-00001',
          active: true,
          priceCents: 2000,
          costCents: 900,
          discountPercent: null,
          shippingWeightGrams: 1000,
          stockOnHand: 10,
          stockReserved: 0
        }
      ]),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    address: {
      findFirst: vi.fn()
    },
    orderNumberSequence: {
      upsert: vi.fn(async () => ({ nextNumber: 2 }))
    },
    order: {
      findUnique: vi.fn(async () => storedOrder),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        storedOrder = {
          id: 'order-1',
          ...data,
          customer: { userId: 'user-1' },
          lines: (
            data.lines as { create: Record<string, unknown>[] }
          ).create.map((line: Record<string, unknown>, index: number) => ({
            id: `line-${index + 1}`,
            ...line
          })),
          payments: [
            {
              id: 'payment-1',
              ...(data.payments as { create: Record<string, unknown> }).create,
              status: 'PENDING',
              providerReference: null,
              stripeCheckoutSessionId: null,
              createdAt: new Date('2026-06-21T10:00:00Z')
            }
          ]
        }
        return storedOrder
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(storedOrder!, data)
        return storedOrder
      })
    },
    payment: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(storedOrder!.payments[0], data)
        return storedOrder!.payments[0]
      })
    },
    emailNotification: {
      upsert: vi.fn(async () => ({ id: 'notification-1' }))
    },
    $transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) =>
      callback(db)
    )
  }

  return db
}

describe('beginGuestCheckoutPayment', () => {
  it('does not leave a Guest Customer when Order placement fails', async () => {
    const { db, customers } = createPlacementFailureDb()

    await expect(
      beginGuestCheckoutPayment(db as never, {
        guestCustomer: {
          email: 'river@example.com',
          firstName: 'River',
          lastName: 'Stone'
        },
        order: {
          lines: [{ productId: 'product-1', quantity: 1 }],
          paymentMethod: 'CARD',
          shippingFirstName: 'River',
          shippingLastName: 'Stone',
          shippingStreetLine1: 'Wasserweg 1',
          shippingPostalCode: '8000',
          shippingCity: 'Zurich',
          shippingCountryCode: 'CH'
        },
        locale: 'en',
        checkoutSubmissionId: 'submission-1',
        guestCheckoutFingerprint: 'fingerprint-1'
      })
    ).rejects.toBeInstanceOf(OrderPlacementError)

    expect(customers).toEqual([])
  })

  it('rejects another Guest Order when the fingerprint already has five open unpaid Orders', async () => {
    const { db, customers } = createPlacementFailureDb()
    db.order.count = vi.fn(async () => 5)

    await expect(
      beginGuestCheckoutPayment(db as never, {
        guestCustomer: {
          email: 'river@example.com',
          firstName: 'River',
          lastName: 'Stone'
        },
        order: {
          lines: [{ productId: 'product-1', quantity: 1 }],
          paymentMethod: 'CARD',
          shippingFirstName: 'River',
          shippingLastName: 'Stone',
          shippingStreetLine1: 'Wasserweg 1',
          shippingPostalCode: '8000',
          shippingCity: 'Zurich',
          shippingCountryCode: 'CH'
        },
        locale: 'en',
        checkoutSubmissionId: 'submission-2',
        guestCheckoutFingerprint: 'fingerprint-1'
      })
    ).rejects.toMatchObject({ code: 'GUEST_CHECKOUT_RATE_LIMITED' })

    expect(customers).toEqual([])
    expect(db.customer.create).not.toHaveBeenCalled()
  })
})

describe('beginCheckoutPayment', () => {
  beforeEach(() => {
    startStripeCheckoutMock.mockReset()
  })

  it('resumes the same Order after Stripe Session creation initially fails', async () => {
    const db = createCheckoutStartDb()
    startStripeCheckoutMock
      .mockRejectedValueOnce(new Error('Stripe unavailable'))
      .mockResolvedValueOnce({
        url: 'https://checkout.stripe.com/c/pay/cs_resumed',
        sessionId: 'cs_resumed',
        paymentIntentId: null,
        expiresAt: new Date('2099-06-21T10:30:00Z')
      })
    const input = {
      customerId: 'customer-1',
      lines: [{ productId: 'product-1', quantity: 1 }],
      paymentMethod: 'CARD' as const,
      shippingFirstName: 'River',
      shippingLastName: 'Stone',
      shippingStreetLine1: 'Wasserweg 1',
      shippingPostalCode: '8000',
      shippingCity: 'Zurich',
      shippingCountryCode: 'CH'
    }

    await expect(
      beginCheckoutPayment(db as never, input, 'de', 'submission-1')
    ).rejects.toThrow('Stripe unavailable')

    const resumed = await beginCheckoutPayment(
      db as never,
      input,
      'de',
      'submission-1'
    )

    expect(db.order.create).toHaveBeenCalledTimes(1)
    expect(db.product.updateMany).toHaveBeenCalledTimes(1)
    expect(startStripeCheckoutMock).toHaveBeenCalledTimes(2)
    expect(resumed.checkoutUrl).toBe(
      'https://checkout.stripe.com/c/pay/cs_resumed'
    )
  })
})

describe('retryCheckoutPayment', () => {
  beforeEach(() => {
    retrieveStripeCheckoutSessionMock.mockReset()
    expireStripeCheckoutSessionMock.mockReset()
    startStripeCheckoutMock.mockReset()
  })

  it('expires the previous Stripe Session before replacing the Active Payment Attempt', async () => {
    const db = createRetryDb()
    retrieveStripeCheckoutSessionMock.mockResolvedValue({
      id: 'cs_old',
      status: 'open',
      payment_status: 'unpaid',
      url: 'https://checkout.stripe.com/c/pay/cs_old'
    })
    expireStripeCheckoutSessionMock.mockResolvedValue({
      id: 'cs_old',
      status: 'expired',
      payment_status: 'unpaid'
    })
    startStripeCheckoutMock.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_new',
      sessionId: 'cs_new',
      paymentIntentId: null,
      expiresAt: new Date('2099-06-21T10:30:00Z')
    })

    const result = await retryCheckoutPayment(db as never, {
      orderNumber: 'EW-2026-00001',
      access: { customerId: 'customer-1' },
      paymentMethod: 'TWINT',
      locale: 'de'
    })

    expect(expireStripeCheckoutSessionMock).toHaveBeenCalledWith('cs_old')
    expect(
      expireStripeCheckoutSessionMock.mock.invocationCallOrder[0]
    ).toBeLessThan(db.payment.create.mock.invocationCallOrder[0]!)
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        failureReason: 'Payment attempt replaced.'
      }
    })
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_new')
  })

  it('does not replace the Active Payment Attempt when Stripe Session expiration fails', async () => {
    const db = createRetryDb()
    retrieveStripeCheckoutSessionMock.mockResolvedValue({
      id: 'cs_old',
      status: 'open',
      payment_status: 'unpaid',
      url: 'https://checkout.stripe.com/c/pay/cs_old'
    })
    expireStripeCheckoutSessionMock.mockRejectedValue(
      new Error('Stripe unavailable')
    )

    await expect(
      retryCheckoutPayment(db as never, {
        orderNumber: 'EW-2026-00001',
        access: { customerId: 'customer-1' },
        paymentMethod: 'TWINT',
        locale: 'de'
      })
    ).rejects.toThrow('Stripe unavailable')

    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(db.payment.create).not.toHaveBeenCalled()
    expect(startStripeCheckoutMock).not.toHaveBeenCalled()
  })
})
