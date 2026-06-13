import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import { checkoutRouter } from '~/server/api/routers/checkout'
import { createCallerFactory } from '~/server/api/trpc'
import { startStripeCheckout } from '~/server/payments/stripe-checkout'
import { firstMockCall } from '~/test/mock-calls'
import { hashOrderAccessToken } from '~/server/commerce/order-access-token'
import type { Salutation } from '../../../../generated/prisma'

vi.mock('~/server/payments/stripe-checkout', () => ({
  startStripeCheckout: vi.fn(async () => ({
    url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    sessionId: 'cs_test_123',
    paymentIntentId: 'pi_test_123'
  }))
}))

const createCaller = createCallerFactory(checkoutRouter)

const filter = {
  id: 'filter-1',
  name: 'Countertop Filter',
  slug: 'countertop-filter',
  active: true,
  priceCents: 12000,
  discountPercent: 10,
  stockOnHand: 8,
  stockReserved: 1,
  images: [{ url: 'https://cdn.example.com/filter.jpg', altText: 'Filter' }]
}

const refill = {
  id: 'refill-1',
  name: 'Refill Pack',
  slug: 'refill-pack',
  active: true,
  priceCents: 2500,
  discountPercent: null,
  stockOnHand: 10,
  stockReserved: 0,
  images: []
}

const inactiveProduct = {
  ...refill,
  id: 'inactive-1',
  name: 'Inactive Refill',
  slug: 'inactive-refill',
  active: false,
  priceCents: 4000
}

const lowStockProduct = {
  ...refill,
  id: 'low-stock-1',
  name: 'Low Stock Refill',
  slug: 'low-stock-refill',
  stockOnHand: 2,
  stockReserved: 1
}

type MockRecord = Record<string, unknown>

type CheckoutCustomerAddress = {
  id: string
  isMain: boolean
  salutation: Salutation | null
  firstName: string
  lastName: string
  company: string | null
  streetLine1: string
  streetLine2: string | null
  postalCode: string
  city: string
  countryCode: string
  phone: string | null
}

type CheckoutCustomerLookupResult =
  | null
  | { id: string }
  | { id: string; _count: { addresses: number } }
  | {
      id: string
      email: string
      salutation: Salutation | null
      firstName: string
      lastName: string
      addresses: CheckoutCustomerAddress[]
    }

type ProductLookupArgs = {
  where: { id: { in: string[] } }
}

type CheckoutProduct = typeof filter | typeof refill

type MockDb = {
  address: {
    updateMany: Mock<() => Promise<{ count: number }>>
    create: Mock<
      (args: { data: MockRecord; select?: MockRecord }) => Promise<MockRecord>
    >
    findFirst: Mock<() => Promise<MockRecord | null>>
  }
  customer: {
    findUnique: Mock<
      (args?: MockRecord) => Promise<CheckoutCustomerLookupResult>
    >
    create: Mock<
      (args: { data: MockRecord; select?: MockRecord }) => Promise<MockRecord>
    >
  }
  product: {
    findMany: Mock<(args: ProductLookupArgs) => Promise<CheckoutProduct[]>>
    updateMany: Mock<() => Promise<{ count: number }>>
  }
  orderNumberSequence: {
    upsert: Mock<() => Promise<{ nextNumber: number }>>
  }
  order: {
    create: Mock<(args: { data: MockRecord }) => Promise<MockRecord>>
    findFirst: Mock<(args: MockRecord) => Promise<MockRecord | null>>
    update: Mock<
      (args: {
        where?: MockRecord
        data: MockRecord
        include?: MockRecord
      }) => Promise<MockRecord>
    >
  }
  payment: {
    create: Mock<(args: { data: MockRecord }) => Promise<MockRecord>>
    update: Mock<
      (args: { where: MockRecord; data: MockRecord }) => Promise<MockRecord>
    >
  }
  $transaction: Mock<
    (callback: (tx: MockDb) => Promise<unknown>) => Promise<unknown>
  >
}

function createMockDb(): MockDb {
  const db: MockDb = {
    address: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }) => ({
        id: 'address-1',
        ...data
      })),
      findFirst: vi.fn(async () => null)
    },
    customer: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({
        id: 'guest-customer-1',
        ...data
      }))
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        [filter, refill, inactiveProduct, lowStockProduct].filter((product) =>
          where.id.in.includes(product.id)
        )
      ),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    orderNumberSequence: {
      upsert: vi.fn(async () => ({ nextNumber: 2 }))
    },
    order: {
      create: vi.fn(async ({ data }) => ({
        id: 'order-1',
        ...data,
        placedAt: new Date('2026-05-15T10:00:00Z'),
        lines: data.lines ? (data.lines as { create: unknown[] }).create : [],
        payments: data.payments
          ? [
              {
                id: 'payment-1',
                ...(data.payments as { create: MockRecord }).create,
                status: 'PENDING',
                createdAt: new Date('2026-05-15T10:00:00Z'),
                providerReference: null,
                stripeCheckoutSessionId: null
              }
            ]
          : []
      })),
      findFirst: vi.fn(async () => ({
        id: 'order-1',
        orderNumber: 'EW-2026-00001',
        status: 'PLACED',
        paymentStatus: 'PAID',
        fulfillmentStatus: 'UNFULFILLED',
        paymentExpiresAt: new Date('2026-05-15T10:15:00Z'),
        totalCents: 16700,
        currencyCode: 'CHF',
        customerEmail: 'river@example.com',
        placedAt: new Date('2026-05-15T10:00:00Z'),
        shippingCents: 900,
        shippingFirstName: 'River',
        shippingLastName: 'Stone',
        shippingStreetLine1: 'Springstrasse 1',
        shippingStreetLine2: null,
        shippingPostalCode: '8000',
        shippingCity: 'Zurich',
        shippingCountryCode: 'CH',
        billingFirstName: 'River',
        billingLastName: 'Stone',
        billingStreetLine1: 'Springstrasse 1',
        billingStreetLine2: null,
        billingPostalCode: '8000',
        billingCity: 'Zurich',
        billingCountryCode: 'CH',
        lines: [],
        payments: [
          {
            id: 'payment-1',
            paymentMethod: 'CARD',
            status: 'CAPTURED',
            amountCents: 16700,
            currencyCode: 'CHF',
            failureReason: null,
            createdAt: new Date('2026-05-15T10:01:00Z')
          }
        ]
      })),
      update: vi.fn(async ({ data }) => ({
        id: 'order-1',
        orderNumber: 'EW-2026-00001',
        status: 'PLACED',
        paymentStatus: data.paymentStatus ?? 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        paymentExpiresAt: new Date('2026-05-15T10:15:00Z'),
        totalCents: 16700,
        currencyCode: 'CHF',
        customerEmail: 'river@example.com',
        shippingCents: 900,
        lines: [
          {
            id: 'line-1',
            productId: filter.id,
            productName: filter.name,
            productSku: 'EW-FIL-00001',
            quantity: 1,
            listPriceCents: 12000,
            discountPercent: 10,
            unitPriceCents: 10800,
            lineTotalCents: 10800
          },
          {
            id: 'line-2',
            productId: refill.id,
            productName: refill.name,
            productSku: 'EW-REF-00002',
            quantity: 2,
            listPriceCents: 2500,
            discountPercent: null,
            unitPriceCents: 2500,
            lineTotalCents: 5000
          }
        ],
        payments: [
          {
            id: 'payment-retry-1',
            type: 'CHARGE',
            provider: 'STRIPE',
            paymentMethod: 'TWINT',
            status: 'PENDING',
            amountCents: 16700,
            currencyCode: 'CHF',
            providerReference: null,
            stripeCheckoutSessionId: null,
            createdAt: new Date('2026-05-15T10:05:00Z')
          }
        ]
      }))
    },
    payment: {
      create: vi.fn(async ({ data }) => ({
        id: 'payment-retry-1',
        status: 'PENDING',
        createdAt: new Date('2026-05-15T10:05:00Z'),
        providerReference: null,
        stripeCheckoutSessionId: null,
        ...data
      })),
      update: vi.fn(async ({ data }) => ({ id: 'payment-1', ...data }))
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }

  return db
}

function createPublicCaller(db: ReturnType<typeof createMockDb>) {
  return createCaller({
    db: db as never,
    session: null,
    headers: new Headers()
  })
}

function createRegisteredCaller(db: ReturnType<typeof createMockDb>) {
  return {
    caller: createCaller({
      db: db as never,
      session: {
        user: {
          id: 'user-1',
          email: 'water@example.com',
          name: 'Water Friend',
          role: 'customer'
        },
        session: { id: 'session-1' }
      } as never,
      headers: new Headers()
    })
  }
}

describe('checkout router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-05-15T10:00:00Z').getTime()
    )
    vi.clearAllMocks()
    db = createMockDb()
  })

  it('previews a multi-line cart with server-authoritative totals and flat shipping', async () => {
    const caller = createPublicCaller(db)

    const result = await caller.preview({
      lines: [
        { productId: filter.id, quantity: 2 },
        { productId: refill.id, quantity: 3 }
      ]
    })

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [filter.id, refill.id] }
        }
      })
    )
    expect(result).toMatchObject({
      currencyCode: 'CHF',
      subtotalCents: 31500,
      discountCents: 2400,
      shippingCents: 900,
      totalCents: 30000,
      canPlaceOrder: true,
      items: [
        expect.objectContaining({
          productId: filter.id,
          name: filter.name,
          quantity: 2,
          unitPriceCents: 10800,
          lineTotalCents: 21600
        }),
        expect.objectContaining({
          productId: refill.id,
          name: refill.name,
          quantity: 3,
          unitPriceCents: 2500,
          lineTotalCents: 7500
        })
      ]
    })
  })

  it('blocks placement when the cart includes a product that is not in the active catalog', async () => {
    const caller = createPublicCaller(db)

    const result = await caller.preview({
      lines: [
        { productId: filter.id, quantity: 1 },
        { productId: 'missing-product', quantity: 1 }
      ]
    })

    expect(result.canPlaceOrder).toBe(false)
    expect(result.items).toEqual([
      expect.objectContaining({
        productId: filter.id,
        problemCode: null,
        lineTotalCents: 10800
      }),
      expect.objectContaining({
        productId: 'missing-product',
        problemCode: 'MISSING_PRODUCT',
        lineTotalCents: 0
      })
    ])
    expect(result.totalCents).toBe(11700)
  })

  it('normalizes duplicate product IDs while preserving first-seen cart order', async () => {
    const caller = createPublicCaller(db)

    const result = await caller.preview({
      lines: [
        { productId: refill.id, quantity: 1 },
        { productId: filter.id, quantity: 1 },
        { productId: refill.id, quantity: 3 }
      ]
    })

    expect(result.items.map((item) => [item.productId, item.quantity])).toEqual(
      [
        [refill.id, 4],
        [filter.id, 1]
      ]
    )
  })

  it('includes inactive and insufficient-stock products with problem codes and excludes them from payable totals', async () => {
    const caller = createPublicCaller(db)

    const result = await caller.preview({
      lines: [
        { productId: inactiveProduct.id, quantity: 1 },
        { productId: lowStockProduct.id, quantity: 2 },
        { productId: refill.id, quantity: 1 }
      ]
    })

    expect(result.canPlaceOrder).toBe(false)
    expect(result.shippingCents).toBe(900)
    expect(result.subtotalCents).toBe(2500)
    expect(result.totalCents).toBe(3400)
    expect(result.items).toEqual([
      expect.objectContaining({
        productId: inactiveProduct.id,
        problemCode: 'INACTIVE_PRODUCT',
        lineTotalCents: 0
      }),
      expect.objectContaining({
        productId: lowStockProduct.id,
        problemCode: 'INSUFFICIENT_STOCK',
        availableStock: 1,
        lineTotalCents: 0
      }),
      expect.objectContaining({
        productId: refill.id,
        problemCode: null,
        lineTotalCents: 2500
      })
    ])
  })

  it('uses zero shipping when no cart lines are orderable', async () => {
    const caller = createPublicCaller(db)

    const result = await caller.preview({
      lines: [
        { productId: inactiveProduct.id, quantity: 1 },
        { productId: 'missing-product', quantity: 1 }
      ]
    })

    expect(result.canPlaceOrder).toBe(false)
    expect(result.shippingCents).toBe(0)
    expect(result.totalCents).toBe(0)
    expect(result.items.map((item) => item.problemCode)).toEqual([
      'INACTIVE_PRODUCT',
      'MISSING_PRODUCT'
    ])
  })

  it('bootstraps guest checkout for signed-out visitors', async () => {
    const caller = createPublicCaller(db)

    await expect(caller.bootstrap()).resolves.toEqual({ status: 'guest' })
  })

  it('bootstraps a checkout-scoped onboarding state for signed-in users without a registered customer', async () => {
    const { caller } = createRegisteredCaller(db)

    await expect(caller.bootstrap()).resolves.toEqual({
      status: 'needs-onboarding',
      user: {
        id: 'user-1',
        email: 'water@example.com',
        name: 'Water Friend'
      }
    })
  })

  it('bootstraps registered customers with the main address book entry first', async () => {
    db.customer.findUnique = vi.fn(async () => ({
      id: 'customer-1',
      email: 'water@example.com',
      salutation: 'FRAU',
      firstName: 'River',
      lastName: 'Stone',
      addresses: [
        {
          id: 'address-main',
          isMain: true,
          salutation: 'FRAU',
          firstName: 'River',
          lastName: 'Stone',
          company: null,
          streetLine1: 'Springstrasse 1',
          streetLine2: null,
          postalCode: '8000',
          city: 'Zurich',
          countryCode: 'CH',
          phone: null
        },
        {
          id: 'address-other',
          isMain: false,
          salutation: null,
          firstName: 'River',
          lastName: 'Stone',
          company: null,
          streetLine1: 'Seestrasse 2',
          streetLine2: null,
          postalCode: '8001',
          city: 'Zurich',
          countryCode: 'CH',
          phone: null
        }
      ]
    }))
    const { caller } = createRegisteredCaller(db)

    const result = await caller.bootstrap()

    const [customerFindUniqueArgs] = firstMockCall(db.customer.findUnique)
    expect(customerFindUniqueArgs).toMatchObject({
      where: { userId: 'user-1' },
      select: {
        addresses: {
          orderBy: [{ isMain: 'desc' }, { updatedAt: 'desc' }]
        }
      }
    })
    expect(result).toMatchObject({
      status: 'registered',
      customer: {
        id: 'customer-1',
        addresses: [
          { id: 'address-main', isMain: true },
          { id: 'address-other', isMain: false }
        ]
      }
    })
  })

  it('creates the first checkout address as the main address book entry', async () => {
    db.customer.findUnique = vi.fn(async () => ({
      id: 'customer-1',
      _count: { addresses: 0 }
    }))
    const { caller } = createRegisteredCaller(db)

    await caller.createAddress({
      firstName: 'River',
      lastName: 'Stone',
      streetLine1: 'Springstrasse 1',
      postalCode: '8000',
      city: 'Zurich',
      countryCode: 'ch'
    })

    const [addressCreateArgs] = firstMockCall(db.address.create)
    expect(addressCreateArgs.data).toMatchObject({
      customerId: 'customer-1',
      countryCode: 'CH',
      isMain: true
    })
    expect(addressCreateArgs.select).toBeDefined()
  })

  it('loads Order Confirmation only for the registered customer who owns the Order', async () => {
    db.customer.findUnique = vi.fn(async () => ({ id: 'customer-1' }))
    const { caller } = createRegisteredCaller(db)

    const order = await caller.orderConfirmation({
      orderNumber: 'EW-2026-00001'
    })

    const [orderFindArgs] = firstMockCall(db.order.findFirst)
    expect(orderFindArgs).toMatchObject({
      where: {
        orderNumber: 'EW-2026-00001',
        OR: [{ customerId: 'customer-1' }]
      }
    })
    expect(orderFindArgs).toHaveProperty('select')
    expect(order).toMatchObject({
      orderNumber: 'EW-2026-00001',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      canRetryPayment: false,
      payments: [
        expect.objectContaining({
          id: 'payment-1',
          paymentMethod: 'CARD',
          status: 'CAPTURED'
        })
      ]
    })
  })

  it('loads guest Order Confirmation with the non-guessable access token', async () => {
    const caller = createPublicCaller(db)
    const accessToken = 'guest-access-token'

    await caller.orderConfirmation({
      orderNumber: 'EW-2026-00001',
      accessToken
    })

    const [orderFindArgs] = firstMockCall(db.order.findFirst)
    expect(orderFindArgs).toMatchObject({
      where: {
        orderNumber: 'EW-2026-00001',
        OR: [{ guestAccessTokenHash: hashOrderAccessToken(accessToken) }]
      }
    })
  })

  it('creates a Guest Customer Order without creating a User and redirects to Stripe', async () => {
    db.customer.findUnique = vi.fn(async () => ({
      id: 'guest-customer-1',
      email: 'guest@example.com',
      salutation: null,
      firstName: 'Guest',
      lastName: 'River'
    }))
    db.order.update = vi.fn(async ({ data }) => ({
      id: 'order-1',
      orderNumber: 'EW-2026-00001',
      status: 'PLACED',
      paymentStatus: 'PENDING',
      paymentExpiresAt: new Date('2026-05-15T10:15:00Z'),
      totalCents: 11700,
      currencyCode: 'CHF',
      customerEmail: 'guest@example.com',
      shippingCents: 900,
      guestAccessTokenHash: data.guestAccessTokenHash,
      lines: [
        {
          id: 'line-1',
          productId: filter.id,
          productName: filter.name,
          productSku: 'EW-FIL-00001',
          quantity: 1,
          listPriceCents: 12000,
          discountPercent: 10,
          unitPriceCents: 10800,
          lineTotalCents: 10800
        }
      ],
      payments: [
        {
          id: 'payment-1',
          type: 'CHARGE',
          provider: 'STRIPE',
          paymentMethod: 'CARD',
          status: 'PENDING',
          amountCents: 11700,
          currencyCode: 'CHF',
          providerReference: null,
          stripeCheckoutSessionId: null,
          createdAt: new Date('2026-05-15T10:00:00Z')
        }
      ]
    }))
    db.product.findMany = vi.fn(async () => [
      {
        id: filter.id,
        name: filter.name,
        slug: filter.slug,
        sku: 'EW-FIL-00001',
        active: true,
        priceCents: filter.priceCents,
        costCents: 6000,
        discountPercent: filter.discountPercent,
        stockOnHand: filter.stockOnHand,
        stockReserved: filter.stockReserved,
        images: filter.images
      }
    ])
    const caller = createPublicCaller(db)

    const result = await caller.placeGuestOrder({
      lines: [{ productId: filter.id, quantity: 1 }],
      email: 'guest@example.com',
      paymentMethod: 'CARD',
      locale: 'en',
      firstName: 'Guest',
      lastName: 'River',
      streetLine1: 'Springstrasse 1',
      postalCode: '8000',
      city: 'Zurich',
      countryCode: 'ch'
    })

    expect(db.customer.create).toHaveBeenCalledWith({
      data: {
        email: 'guest@example.com',
        salutation: undefined,
        firstName: 'Guest',
        lastName: 'River'
      },
      select: { id: true }
    })
    const [orderCreateArgs] = firstMockCall(db.order.create)
    expect(orderCreateArgs.data).toMatchObject({
      customerId: 'guest-customer-1',
      customerEmail: 'guest@example.com',
      payments: {
        create: {
          type: 'CHARGE',
          provider: 'STRIPE',
          paymentMethod: 'CARD',
          amountCents: 11700,
          currencyCode: 'CHF'
        }
      }
    })
    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(typeof orderUpdateArgs.data.guestAccessTokenHash).toBe('string')
    const [stripeCheckoutInput] = firstMockCall(vi.mocked(startStripeCheckout))
    expect(typeof stripeCheckoutInput.orderAccessToken).toBe('string')
    expect(stripeCheckoutInput).toMatchObject({
      locale: 'en',
      order: {
        id: 'order-1',
        payments: [
          {
            id: 'payment-1',
            paymentMethod: 'CARD',
            status: 'PENDING'
          }
        ]
      }
    })
    expect(result.checkoutUrl).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_123'
    )
  })

  it('retries payment for the same open unexpired Order with a new Stripe-backed Payment', async () => {
    db.customer.findUnique = vi.fn(async () => ({ id: 'customer-1' }))
    db.order.findFirst = vi.fn(async () => ({
      id: 'order-1',
      orderNumber: 'EW-2026-00001',
      status: 'PLACED',
      paymentStatus: 'FAILED',
      fulfillmentStatus: 'UNFULFILLED',
      paymentExpiresAt: new Date('2026-05-15T10:15:00Z'),
      totalCents: 16700,
      currencyCode: 'CHF',
      customerEmail: 'river@example.com',
      shippingCents: 900,
      lines: [
        {
          id: 'line-1',
          productId: filter.id,
          productName: filter.name,
          productSku: 'EW-FIL-00001',
          quantity: 1,
          listPriceCents: 12000,
          discountPercent: 10,
          unitPriceCents: 10800,
          lineTotalCents: 10800
        }
      ],
      payments: [
        {
          id: 'payment-failed-1',
          type: 'CHARGE',
          provider: 'STRIPE',
          paymentMethod: 'CARD',
          status: 'FAILED',
          amountCents: 16700,
          currencyCode: 'CHF',
          providerReference: 'pi_failed',
          stripeCheckoutSessionId: 'cs_failed',
          createdAt: new Date('2026-05-15T10:01:00Z')
        }
      ]
    }))
    const { caller } = createRegisteredCaller(db)

    const result = await caller.retryPayment({
      orderNumber: 'EW-2026-00001',
      paymentMethod: 'TWINT',
      locale: 'en'
    })

    expect(db.payment.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        type: 'CHARGE',
        provider: 'STRIPE',
        paymentMethod: 'TWINT',
        amountCents: 16700,
        currencyCode: 'CHF'
      }
    })
    const [orderUpdateArgs] = firstMockCall(db.order.update)
    expect(orderUpdateArgs).toMatchObject({
      where: { id: 'order-1' },
      data: { paymentStatus: 'PENDING' }
    })
    expect(orderUpdateArgs.include).toMatchObject({
      payments: { take: 1 }
    })
    const [stripeRetryInput] = firstMockCall(vi.mocked(startStripeCheckout))
    expect(stripeRetryInput).toMatchObject({
      locale: 'en',
      order: {
        id: 'order-1',
        payments: [
          {
            id: 'payment-retry-1',
            paymentMethod: 'TWINT',
            status: 'PENDING'
          }
        ]
      }
    })
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-retry-1' },
      data: {
        stripeCheckoutSessionId: 'cs_test_123',
        providerReference: 'pi_test_123'
      }
    })
    expect(result.checkoutUrl).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_123'
    )
  })

  it('retries guest payment with the Order access token', async () => {
    const accessToken = 'guest-access-token'
    db.order.findFirst = vi.fn(async () => ({
      id: 'order-1',
      orderNumber: 'EW-2026-00001',
      status: 'PLACED',
      paymentStatus: 'FAILED',
      fulfillmentStatus: 'UNFULFILLED',
      paymentExpiresAt: new Date('2026-05-15T10:15:00Z'),
      totalCents: 16700,
      currencyCode: 'CHF',
      customerEmail: 'guest@example.com',
      shippingCents: 900,
      lines: [
        {
          id: 'line-1',
          productId: filter.id,
          productName: filter.name,
          productSku: 'EW-FIL-00001',
          quantity: 1,
          listPriceCents: 12000,
          discountPercent: 10,
          unitPriceCents: 10800,
          lineTotalCents: 10800
        }
      ],
      payments: []
    }))
    const caller = createPublicCaller(db)

    await caller.retryPayment({
      orderNumber: 'EW-2026-00001',
      accessToken,
      paymentMethod: 'TWINT',
      locale: 'en'
    })

    const [orderFindArgs] = firstMockCall(db.order.findFirst)
    expect(orderFindArgs).toMatchObject({
      where: {
        orderNumber: 'EW-2026-00001',
        OR: [{ guestAccessTokenHash: hashOrderAccessToken(accessToken) }]
      }
    })
    const [stripeCheckoutInput] = firstMockCall(vi.mocked(startStripeCheckout))
    expect(stripeCheckoutInput).toMatchObject({
      orderAccessToken: accessToken,
      order: {
        payments: [
          {
            id: 'payment-retry-1',
            paymentMethod: 'TWINT',
            status: 'PENDING'
          }
        ]
      }
    })
  })

  it.each([
    {
      label: 'paid',
      status: 'PLACED',
      paymentStatus: 'PAID',
      paymentExpiresAt: new Date('2026-05-15T10:15:00Z')
    },
    {
      label: 'cancelled',
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED',
      paymentExpiresAt: new Date('2026-05-15T10:15:00Z')
    },
    {
      label: 'expired',
      status: 'PLACED',
      paymentStatus: 'FAILED',
      paymentExpiresAt: new Date('2026-05-15T09:59:00Z')
    }
  ])(
    'blocks retry for $label Orders',
    async ({ status, paymentStatus, paymentExpiresAt }) => {
      db.customer.findUnique = vi.fn(async () => ({ id: 'customer-1' }))
      db.order.findFirst = vi.fn(async () => ({
        id: 'order-1',
        orderNumber: 'EW-2026-00001',
        status,
        paymentStatus,
        paymentExpiresAt,
        totalCents: 16700,
        currencyCode: 'CHF',
        customerEmail: 'river@example.com',
        shippingCents: 900,
        lines: [],
        payments: []
      }))
      const { caller } = createRegisteredCaller(db)

      await expect(
        caller.retryPayment({
          orderNumber: 'EW-2026-00001',
          paymentMethod: 'CARD',
          locale: 'en'
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST'
      })
      expect(db.payment.create).not.toHaveBeenCalled()
      expect(startStripeCheckout).not.toHaveBeenCalled()
    }
  )

  it('places a registered checkout Cart with a pending Payment', async () => {
    db.customer.findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 'customer-1' })
      .mockResolvedValueOnce({
        id: 'customer-1',
        email: 'river@example.com',
        salutation: 'FRAU',
        firstName: 'River',
        lastName: 'Stone'
      })
    db.product.findMany = vi.fn(async () => [
      {
        id: filter.id,
        name: filter.name,
        slug: filter.slug,
        sku: 'EW-FIL-00001',
        active: true,
        priceCents: filter.priceCents,
        costCents: 6000,
        discountPercent: filter.discountPercent,
        stockOnHand: filter.stockOnHand,
        stockReserved: filter.stockReserved,
        images: filter.images
      },
      {
        id: refill.id,
        name: refill.name,
        slug: refill.slug,
        sku: 'EW-REF-00002',
        active: true,
        priceCents: refill.priceCents,
        costCents: 900,
        discountPercent: refill.discountPercent,
        stockOnHand: refill.stockOnHand,
        stockReserved: refill.stockReserved,
        images: refill.images
      }
    ])
    const { caller } = createRegisteredCaller(db)

    const result = await caller.placeOrder({
      lines: [
        { productId: filter.id, quantity: 1 },
        { productId: refill.id, quantity: 2 }
      ],
      paymentMethod: 'TWINT',
      locale: 'en',
      firstName: 'River',
      lastName: 'Stone',
      streetLine1: 'Springstrasse 1',
      postalCode: '8000',
      city: 'Zurich',
      countryCode: 'ch'
    })

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: [filter.id, refill.id] } }
    })
    const [orderCreateArgs] = firstMockCall(db.order.create)
    expect(orderCreateArgs.data).toMatchObject({
      customerId: 'customer-1',
      shippingCents: 900,
      shippingCountryCode: 'CH',
      totalCents: 16700,
      lines: {
        create: [
          expect.objectContaining({
            productId: filter.id,
            quantity: 1,
            lineTotalCents: 10800
          }),
          expect.objectContaining({
            productId: refill.id,
            quantity: 2,
            lineTotalCents: 5000
          })
        ]
      },
      payments: {
        create: {
          type: 'CHARGE',
          provider: 'STRIPE',
          paymentMethod: 'TWINT',
          amountCents: 16700,
          currencyCode: 'CHF'
        }
      }
    })
    const [stripeCheckoutInput] = firstMockCall(vi.mocked(startStripeCheckout))
    expect(stripeCheckoutInput).toMatchObject({
      locale: 'en',
      order: {
        id: 'order-1',
        orderNumber: 'EW-2026-00001',
        totalCents: 16700,
        payments: [
          {
            id: 'payment-1',
            provider: 'STRIPE',
            paymentMethod: 'TWINT',
            status: 'PENDING'
          }
        ]
      }
    })
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        stripeCheckoutSessionId: 'cs_test_123',
        providerReference: 'pi_test_123'
      }
    })
    expect(result.checkoutUrl).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_123'
    )
  })
})
