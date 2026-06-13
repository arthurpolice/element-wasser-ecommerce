import { createHash, randomBytes } from 'node:crypto'

export function createOrderAccessToken() {
  return randomBytes(32).toString('base64url')
}

export function hashOrderAccessToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
