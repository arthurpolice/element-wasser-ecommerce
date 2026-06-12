import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import { checkoutRouter } from '~/server/api/routers/checkout'
import { createCallerFactory } from '~/server/api/trpc'
import { firstMockCall } from '~/test/mock-calls'
import type { Salutation } from '../../../../generated/prisma'

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
      findUnique: vi.fn(async () => null)
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
        payments: []
      }))
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

    await caller.placeOrder({
      lines: [
        { productId: filter.id, quantity: 1 },
        { productId: refill.id, quantity: 2 }
      ],
      paymentMethod: 'TWINT',
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
          provider: 'TWINT',
          amountCents: 16700,
          currencyCode: 'CHF'
        }
      }
    })
  })
})
