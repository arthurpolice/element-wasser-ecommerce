import { createHash, timingSafeEqual } from 'node:crypto'

import { env } from '~/env'

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

export function isAuthorizedCronRequest(request: Request) {
  const secret = env.CRON_SECRET
  if (!secret) return false

  const actual = digest(request.headers.get('authorization') ?? '')
  const expected = digest(`Bearer ${secret}`)

  return timingSafeEqual(actual, expected)
}
