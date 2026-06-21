import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '~/env'

const ORDER_ACCESS_DAYS = 30

type OrderAccessPayload = {
  orderId: string
  expiresAt: string
}

function getSecret() {
  const secret = env.ORDER_ACCESS_SECRET

  if (env.NODE_ENV === 'test' && !secret) {
    return 'test-order-access-secret-at-least-32-characters'
  }

  if (!secret) {
    throw new Error('ORDER_ACCESS_SECRET is not configured.')
  }

  return secret
}

function sign(encodedPayload: string) {
  return createHmac('sha256', getSecret())
    .update(encodedPayload)
    .digest('base64url')
}

export function getOrderAccessExpiry(now = new Date()) {
  return new Date(now.getTime() + ORDER_ACCESS_DAYS * 24 * 60 * 60 * 1000)
}

export function createOrderAccessToken(
  orderId: string,
  expiresAt = getOrderAccessExpiry()
) {
  const payload: OrderAccessPayload = {
    orderId,
    expiresAt: expiresAt.toISOString()
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  )

  return `${encodedPayload}.${sign(encodedPayload)}`
}

export function verifyOrderAccessToken(token: string, now = new Date()) {
  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) return null

  const expected = Buffer.from(sign(encodedPayload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as OrderAccessPayload

    if (
      typeof payload.orderId !== 'string' ||
      new Date(payload.expiresAt).getTime() <= now.getTime()
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
