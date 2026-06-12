import { describe, expect, it } from 'vitest'

import {
  normalizeStorefrontCartAmount,
  removeStorefrontCartItem,
  type StorefrontCartItem
} from '~/app/[locale]/(storefront)/_components/storefront-cart'

const items: StorefrontCartItem[] = [
  {
    productId: 'first',
    name: 'First Product',
    slug: 'first-product',
    imageUrl: null,
    imageAlt: null,
    amount: 1
  },
  {
    productId: 'second',
    name: 'Second Product',
    slug: 'second-product',
    imageUrl: null,
    imageAlt: null,
    amount: 2
  },
  {
    productId: 'third',
    name: 'Third Product',
    slug: 'third-product',
    imageUrl: null,
    imageAlt: null,
    amount: 3
  }
]

describe('storefront cart helpers', () => {
  it('removes one item while preserving the remaining cart order', () => {
    expect(
      removeStorefrontCartItem(items, 'second').map((item) => item.productId)
    ).toEqual(['first', 'third'])
  })

  it('keeps cart quantities constrained to 1..99', () => {
    expect(normalizeStorefrontCartAmount(0)).toBe(1)
    expect(normalizeStorefrontCartAmount(2.9)).toBe(2)
    expect(normalizeStorefrontCartAmount(120)).toBe(99)
    expect(normalizeStorefrontCartAmount(Number.NaN)).toBe(1)
  })
})
