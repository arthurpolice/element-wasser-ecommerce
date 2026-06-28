import { createHmac } from 'node:crypto'

import { env } from '~/env'

export const MAX_OPEN_GUEST_ORDERS_PER_FINGERPRINT = 5

function clientIp(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for')
  const forwardedIp = forwardedFor?.split(',')[0]?.trim()

  return (
    forwardedIp ??
    headers.get('x-real-ip')?.trim() ??
    headers.get('x-vercel-forwarded-for')?.trim() ??
    'unknown'
  )
}

export function guestCheckoutFingerprint(headers: Headers) {
  const secret =
    env.ORDER_ACCESS_SECRET ??
    env.BETTER_AUTH_SECRET ??
    'element-wasser-development-guest-checkout'

  return createHmac('sha256', secret)
    .update(clientIp(headers))
    .digest('base64url')
}
