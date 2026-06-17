import { describe, expect, it } from 'vitest'

import {
  buildProductSearchResultsHref,
  getProductSearchSuggestionLimit,
  normalizeProductSearchQuery,
  productSearchDebounceMs
} from '~/app/[locale]/(storefront)/_components/product-search-utils'

describe('Product Search UI utilities', () => {
  it('normalizes meaningful Product Search queries', () => {
    expect(normalizeProductSearchQuery('  filter    cartridge  ')).toBe(
      'filter cartridge'
    )
    expect(normalizeProductSearchQuery('   ...   ')).toBe('')
  })

  it('uses the agreed suggestion limits for mobile and desktop', () => {
    expect(getProductSearchSuggestionLimit(true)).toBe(5)
    expect(getProductSearchSuggestionLimit(false)).toBe(6)
  })

  it('builds the full Product Search results href', () => {
    expect(buildProductSearchResultsHref(' filter cartridge ')).toBe(
      '/search?q=filter%20cartridge'
    )
    expect(buildProductSearchResultsHref('...')).toBe('/search')
  })

  it('debounces Product Search Suggestions while typing', () => {
    expect(productSearchDebounceMs).toBeGreaterThanOrEqual(200)
  })
})
