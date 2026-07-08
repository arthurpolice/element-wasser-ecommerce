import { describe, expect, it } from 'vitest'

import {
  calculateAvailableStock,
  calculateShippingCentsForWeight,
  calculateUnitPriceCents,
  normalizeOrderQuoteLines,
  quoteOrderLines
} from './order-quote'

const activeProduct = {
  id: 'filter-1',
  active: true,
  priceCents: 12000,
  discountPercent: 10,
  shippingWeightGrams: 1000,
  stockOnHand: 4,
  stockReserved: 1
}

const inactiveProduct = {
  ...activeProduct,
  id: 'inactive-1',
  active: false
}

describe('order quote', () => {
  it('normalizes requested lines by product id', () => {
    expect(
      normalizeOrderQuoteLines(
        [
          { productId: ' filter-1 ', quantity: 1 },
          { productId: 'filter-1', quantity: 2 },
          { productId: '', quantity: 1 },
          { productId: 'refill-1', quantity: 100 }
        ],
        { maxQuantity: 99 }
      )
    ).toEqual([
      { productId: 'filter-1', quantity: 3 },
      { productId: 'refill-1', quantity: 99 }
    ])
  })

  it('calculates discount price and available stock consistently', () => {
    expect(calculateUnitPriceCents(12000, 10)).toBe(10800)
    expect(calculateAvailableStock(activeProduct)).toBe(3)
    expect(calculateShippingCentsForWeight(0)).toBe(900)
    expect(calculateShippingCentsForWeight(2000)).toBe(900)
    expect(calculateShippingCentsForWeight(2001)).toBe(1200)
    expect(calculateShippingCentsForWeight(10001)).toBe(2300)
    expect(calculateShippingCentsForWeight(30001)).toBeNull()
  })

  it('quotes orderable lines and applies shipping from total shipping weight', () => {
    const quote = quoteOrderLines(
      [activeProduct],
      [{ productId: activeProduct.id, quantity: 2 }]
    )

    expect(quote.lines[0]).toMatchObject({
      productId: activeProduct.id,
      quantity: 2,
      unitPriceCents: 10800,
      originalUnitPriceCents: 12000,
      lineSubtotalCents: 24000,
      lineDiscountCents: 2400,
      lineTotalCents: 21600,
      lineShippingWeightGrams: 2000,
      availableStock: 3,
      canPlaceLine: true,
      problemCode: null
    })
    expect(quote).toMatchObject({
      subtotalCents: 24000,
      discountCents: 2400,
      lineTotalCents: 21600,
      shippingWeightGrams: 2000,
      shippingCents: 900,
      totalCents: 22500,
      canPlaceOrder: true,
      problems: []
    })
  })

  it('returns one problem vocabulary for missing, inactive, and insufficient-stock lines', () => {
    const quote = quoteOrderLines(
      [activeProduct, inactiveProduct],
      [
        { productId: 'missing-1', quantity: 1 },
        { productId: inactiveProduct.id, quantity: 1 },
        { productId: activeProduct.id, quantity: 4 }
      ]
    )

    expect(quote.problems).toEqual([
      { productId: 'missing-1', quantity: 1, code: 'MISSING_PRODUCT' },
      { productId: inactiveProduct.id, quantity: 1, code: 'INACTIVE_PRODUCT' },
      {
        productId: activeProduct.id,
        quantity: 4,
        code: 'INSUFFICIENT_STOCK'
      }
    ])
    expect(quote.shippingCents).toBe(0)
    expect(quote.canPlaceOrder).toBe(false)
  })

  it('rejects otherwise orderable lines above the carrier weight limit', () => {
    const quote = quoteOrderLines(
      [{ ...activeProduct, shippingWeightGrams: 15050 }],
      [{ productId: activeProduct.id, quantity: 2 }]
    )

    expect(quote.shippingWeightGrams).toBe(30100)
    expect(quote.shippingCents).toBe(0)
    expect(quote.totalCents).toBe(21600)
    expect(quote.canPlaceOrder).toBe(false)
    expect(quote.problems).toEqual([
      { productId: '', quantity: 0, code: 'OVER_WEIGHT_LIMIT' }
    ])
  })

  it('ignores products without recorded shipping weight', () => {
    const quote = quoteOrderLines(
      [{ ...activeProduct, shippingWeightGrams: null }],
      [{ productId: activeProduct.id, quantity: 2 }]
    )

    expect(quote.shippingWeightGrams).toBe(0)
    expect(quote.lines[0]).toMatchObject({
      lineShippingWeightGrams: 0
    })
    expect(quote.shippingCents).toBe(900)
    expect(quote.totalCents).toBe(22500)
    expect(quote.canPlaceOrder).toBe(true)
  })
})
