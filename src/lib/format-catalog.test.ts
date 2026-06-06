import { describe, expect, it } from 'vitest'

import { formatPriceCents } from '~/lib/format-catalog'

describe('formatPriceCents', () => {
  it('places CHF after the amount', () => {
    expect(formatPriceCents(1550, 'en')).toBe('15.50 CHF')
  })

  it('formats full franc amounts with a Swiss dash', () => {
    expect(formatPriceCents(1500, 'en')).toBe('15.- CHF')
  })

  it('keeps locale-aware thousands separators', () => {
    expect(formatPriceCents(123400, 'de-CH')).toBe('1’234.- CHF')
  })
})
