import { describe, expect, it } from 'vitest'

import {
  createOrderAccessToken,
  getOrderAccessExpiry,
  verifyOrderAccessToken
} from './order-access-token'

describe('Order Access Link tokens', () => {
  it('grants access to one Order for 30 days', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const expiresAt = getOrderAccessExpiry(now)
    const token = createOrderAccessToken('order-1', expiresAt)

    expect(verifyOrderAccessToken(token, now)).toEqual({
      orderId: 'order-1',
      expiresAt: '2026-07-01T12:00:00.000Z'
    })
    expect(verifyOrderAccessToken(token, expiresAt)).toBeNull()
  })

  it('rejects a tampered token', () => {
    const token = createOrderAccessToken('order-1')
    expect(verifyOrderAccessToken(`${token}x`)).toBeNull()
  })
})
