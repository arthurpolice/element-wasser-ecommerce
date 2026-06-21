import { describe, expect, it } from 'vitest'

import { getSwissPostTrackingUrl } from './order-tracking'

describe('getSwissPostTrackingUrl', () => {
  it('derives an encoded Swiss Post tracking link', () => {
    expect(getSwissPostTrackingUrl('99 123')).toBe(
      'https://service.post.ch/EasyTrack/submitParcelData.do?formattedParcelCodes=99+123'
    )
  })

  it('returns null without a tracking number', () => {
    expect(getSwissPostTrackingUrl(null)).toBeNull()
  })
})
