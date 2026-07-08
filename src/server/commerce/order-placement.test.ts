import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import {
  placeOrder,
  type OrderPlacementError
} from '~/server/commerce/order-placement'
import { firstMockCall } from '~/test/mock-calls'

const now = new Date('2026-05-15T10:00:00Z')

type MockRecord = Record<string, unknown>

type MockProduct = {
  id: string
  name: string
  sku: string
  active: boolean
  priceCents: number
  costCents: number
  discountPercent: number | null
  shippingWeightGrams: number
  stockOnHand: number
  stockReserved: number
}

type OrderCreateArgs = {
  data: MockRecord
  include?: unknown
}

type MockDb = {
  customer: {
    findUnique: Mock<() => Promise<MockRecord>>
  }
  product: {
    findMany: Mock<
      (args: { where: { id: { in: string[] } } }) => Promise<MockProduct[]>
    >
    updateMany: Mock<() => Promise<{ count: number }>>
    update: Mock<() => Promise<null>>
  }
  address: {
    findFirst: Mock<() => Promise<MockRecord>>
  }
  orderNumberSequence: {
    upsert: Mock<() => Promise<{ nextNumber: number }>>
  }
  order: {
    create: Mock<(args: OrderCreateArgs) => Promise<MockRecord>>
  }
  $transaction: Mock<
    (callback: (tx: MockDb) => Promise<unknown>) => Promise<unknown>
  >
}

function createMockDb(): MockDb {
  const db: MockDb = {
    customer: {
      findUnique: vi.fn(async () => ({
        id: 'customer-1',
        email: 'river@example.com',
        firstName: 'River',
        lastName: 'Stone',
        salutation: 'FRAU'
      }))
    },
    product: {
      findMany: vi.fn(async ({ where }) =>
        [
          {
            id: 'product-1',
            name: 'Filter',
            sku: 'EW-FIL-00001',
            active: true,
            priceCents: 2000,
            costCents: 900,
            discountPercent: null as number | null,
            shippingWeightGrams: 1000,
            stockOnHand: 10,
            stockReserved: 0
          }
        ].filter((product) => where.id.in.includes(product.id))
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => null)
    },
    address: {
      findFirst: vi.fn(async () => ({
        id: 'address-main',
        customerId: 'customer-1',
        salutation: 'FRAU',
        firstName: 'River',
        lastName: 'Stone',
        company: 'Element',
        streetLine1: 'Snapshotstrasse 7',
        postalCode: '8000',
        city: 'Zurich',
        countryCode: 'ch',
        customer: { phone: '+410000000' }
      }))
    },
    orderNumberSequence: {
      upsert: vi.fn(async () => ({ nextNumber: 2 }))
    },
    order: {
      create: vi.fn(async ({ data }) => ({
        id: 'order-1',
        ...data,
        placedAt: now,
        payments: []
      }))
    },
    $transaction: vi.fn(async (callback) => callback(db))
  }

  return db
}

const baseInput = {
  customerId: 'customer-1',
  productId: 'product-1',
  quantity: 1,
  shippingFirstName: 'Manual',
  shippingLastName: 'Address',
  shippingStreetLine1: 'Manualstrasse 1',
  shippingPostalCode: '9999',
  shippingCity: 'Manual City',
  shippingCountryCode: 'DE'
}

describe('placeOrder', () => {
  it('copies the selected Address Book Entry into Shipping Address and Billing Address snapshots', async () => {
    const db = createMockDb()

    await placeOrder(
      db as never,
      {
        ...baseInput,
        addressId: 'address-main'
      },
      { now: () => now }
    )

    const [orderCreateArgs] = firstMockCall(db.order.create)
    expect(orderCreateArgs.data).toMatchObject({
      orderNumber: 'EW-2026-00001',
      paymentExpiresAt: new Date('2026-05-15T10:10:00Z'),
      shippingFirstName: 'River',
      shippingLastName: 'Stone',
      shippingStreetLine1: 'Snapshotstrasse 7',
      shippingStreetLine2: undefined,
      shippingPostalCode: '8000',
      shippingCity: 'Zurich',
      shippingCountryCode: 'CH',
      billingFirstName: 'River',
      billingStreetLine1: 'Snapshotstrasse 7',
      billingCountryCode: 'CH'
    })
  })

  it('uses manual Shipping Address input when no Address Book Entry is selected', async () => {
    const db = createMockDb()

    await placeOrder(db as never, baseInput, { now: () => now })

    expect(db.address.findFirst).not.toHaveBeenCalled()
    const [orderCreateArgs] = firstMockCall(db.order.create)
    expect(orderCreateArgs.data).toMatchObject({
      shippingFirstName: 'Manual',
      shippingStreetLine1: 'Manualstrasse 1',
      shippingCountryCode: 'DE',
      billingFirstName: 'Manual',
      billingStreetLine1: 'Manualstrasse 1',
      billingCountryCode: 'DE'
    })
  })

  it('captures discounted Order Line terms and reserves stock', async () => {
    const db = createMockDb()
    db.product.findMany = vi.fn(async () => [
      {
        id: 'product-1',
        name: 'Filter',
        sku: 'EW-FIL-00001',
        active: true,
        priceCents: 2000,
        costCents: 900,
        discountPercent: 25,
        shippingWeightGrams: 1000,
        stockOnHand: 10,
        stockReserved: 0
      }
    ])

    await placeOrder(
      db as never,
      {
        ...baseInput,
        quantity: 2
      },
      { now: () => now }
    )

    const [orderCreateArgs] = firstMockCall(db.order.create)
    expect(orderCreateArgs.data).toMatchObject({
      subtotalCents: 4000,
      discountCents: 1000,
      totalCents: 3900,
      shippingCents: 900,
      shippingWeightGrams: 2000,
      lines: {
        create: [
          {
            productName: 'Filter',
            productSku: 'EW-FIL-00001',
            quantity: 2,
            listPriceCents: 2000,
            discountPercent: 25,
            unitPriceCents: 1500,
            unitShippingWeightGrams: 1000,
            unitCostCents: 900,
            lineTotalCents: 3000
          }
        ]
      }
    })
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'product-1',
        stockOnHand: { gte: 2 },
        stockReserved: { lte: 8 }
      },
      data: { stockReserved: { increment: 2 } }
    })
    expect(
      db.product.updateMany.mock.invocationCallOrder[0] ??
        Number.MAX_SAFE_INTEGER
    ).toBeLessThan(
      db.order.create.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    )
  })

  it('rejects insufficient stock before creating an Order', async () => {
    const db = createMockDb()
    db.product.findMany = vi.fn(async () => [
      {
        id: 'product-1',
        name: 'Filter',
        sku: 'EW-FIL-00001',
        active: true,
        priceCents: 2000,
        costCents: 900,
        discountPercent: null,
        shippingWeightGrams: 1000,
        stockOnHand: 1,
        stockReserved: 1
      }
    ])

    await expect(
      placeOrder(
        db as never,
        {
          ...baseInput,
          quantity: 1
        },
        { now: () => now }
      )
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock available.'
    } satisfies Partial<OrderPlacementError>)

    expect(db.order.create).not.toHaveBeenCalled()
    expect(db.product.updateMany).not.toHaveBeenCalled()
  })

  it('creates one Order with multiple Order Lines and a pending Payment', async () => {
    const db = createMockDb()
    db.product.findMany = vi.fn(async () => [
      {
        id: 'product-1',
        name: 'Filter',
        sku: 'EW-FIL-00001',
        active: true,
        priceCents: 2000,
        costCents: 900,
        discountPercent: 25,
        shippingWeightGrams: 1000,
        stockOnHand: 10,
        stockReserved: 0
      },
      {
        id: 'product-2',
        name: 'Refill Pack',
        sku: 'EW-REF-00002',
        active: true,
        priceCents: 500,
        costCents: 200,
        discountPercent: null,
        shippingWeightGrams: 2500,
        stockOnHand: 6,
        stockReserved: 1
      }
    ])

    await placeOrder(
      db as never,
      {
        ...baseInput,
        productId: undefined,
        quantity: undefined,
        lines: [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-2', quantity: 3 }
        ],
        paymentMethod: 'CARD'
      },
      { now: () => now }
    )

    const [orderCreateArgs] = firstMockCall(db.order.create)
    expect(orderCreateArgs.data).toMatchObject({
      subtotalCents: 5500,
      discountCents: 1000,
      shippingCents: 1200,
      shippingWeightGrams: 9500,
      totalCents: 5700,
      lines: {
        create: [
          expect.objectContaining({
            productId: 'product-1',
            productName: 'Filter',
            quantity: 2,
            lineTotalCents: 3000
          }),
          expect.objectContaining({
            productId: 'product-2',
            productName: 'Refill Pack',
            quantity: 3,
            lineTotalCents: 1500
          })
        ]
      },
      payments: {
        create: {
          type: 'CHARGE',
          provider: 'STRIPE',
          paymentMethod: 'CARD',
          amountCents: 5700,
          currencyCode: 'CHF'
        }
      }
    })
    expect(db.product.updateMany).toHaveBeenCalledTimes(2)
    expect(db.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'product-2',
        stockOnHand: { gte: 3 },
        stockReserved: { lte: 3 }
      },
      data: { stockReserved: { increment: 3 } }
    })
  })

  it('rejects the whole Cart when any line is missing or inactive', async () => {
    const db = createMockDb()
    db.product.findMany = vi.fn(async () => [
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
      },
      {
        id: 'product-2',
        name: 'Inactive Refill',
        sku: 'EW-REF-00002',
        active: false,
        priceCents: 500,
        costCents: 200,
        discountPercent: null,
        shippingWeightGrams: 1000,
        stockOnHand: 6,
        stockReserved: 1
      }
    ])

    await expect(
      placeOrder(
        db as never,
        {
          ...baseInput,
          lines: [
            { productId: 'product-1', quantity: 1 },
            { productId: 'product-2', quantity: 1 }
          ],
          paymentMethod: 'TWINT'
        },
        { now: () => now }
      )
    ).rejects.toMatchObject({
      code: 'PRODUCT_INACTIVE',
      message: 'Product is not active.'
    } satisfies Partial<OrderPlacementError>)

    expect(db.product.updateMany).not.toHaveBeenCalled()
    expect(db.order.create).not.toHaveBeenCalled()
  })

  it('leaves no Order behind when the atomic Stock Reservation fails', async () => {
    const db = createMockDb()
    db.product.updateMany = vi.fn(async () => ({ count: 0 }))

    await expect(
      placeOrder(
        db as never,
        {
          ...baseInput,
          quantity: 2
        },
        { now: () => now }
      )
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock available.'
    } satisfies Partial<OrderPlacementError>)

    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'product-1',
        stockOnHand: { gte: 2 },
        stockReserved: { lte: 8 }
      },
      data: { stockReserved: { increment: 2 } }
    })
    expect(db.order.create).not.toHaveBeenCalled()
  })
})
