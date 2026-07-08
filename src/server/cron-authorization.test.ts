import { describe, expect, it, vi } from 'vitest'

const envMock: { CRON_SECRET: string | undefined } = vi.hoisted(() => ({
  CRON_SECRET: 'cron-secret'
}))

vi.mock('~/env', () => ({ env: envMock }))

import { isAuthorizedCronRequest } from './cron-authorization'

function request(authorization?: string) {
  return new Request('https://store.example.com/api/cron/example', {
    headers: authorization ? { authorization } : undefined
  })
}

describe('isAuthorizedCronRequest', () => {
  it('accepts the configured bearer token', () => {
    expect(isAuthorizedCronRequest(request('Bearer cron-secret'))).toBe(true)
  })

  it.each([
    undefined,
    'cron-secret',
    'Basic cron-secret',
    'Bearer wrong',
    'Bearer cron-secret-extra'
  ])('rejects an invalid authorization header: %s', (authorization) => {
    expect(isAuthorizedCronRequest(request(authorization))).toBe(false)
  })

  it('fails closed when the cron secret is not configured', () => {
    envMock.CRON_SECRET = undefined

    expect(isAuthorizedCronRequest(request('Bearer cron-secret'))).toBe(false)

    envMock.CRON_SECRET = 'cron-secret'
  })
})
