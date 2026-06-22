import { beforeEach, describe, expect, it, vi } from 'vitest'

const cleanupMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({ env: { CRON_SECRET: 'cron-secret' } }))
vi.mock('~/server/db', () => ({ db: { name: 'db' } }))
vi.mock('~/server/commerce/resend-webhook-events', () => ({
  deleteExpiredResendWebhookPayloads: cleanupMock
}))

import { GET } from './route'

describe('GET /api/cron/email/webhooks/cleanup', () => {
  beforeEach(() => cleanupMock.mockReset())

  it('cleans up expired raw payloads for an authorized cron request', async () => {
    cleanupMock.mockResolvedValue(3)

    const response = await GET(
      new Request('https://store.example.com/api/cron/email/webhooks/cleanup', {
        headers: { authorization: 'Bearer cron-secret' }
      })
    )

    await expect(response.json()).resolves.toEqual({ deletedPayloadCount: 3 })
  })

  it('rejects an unauthorized cleanup request', async () => {
    const response = await GET(
      new Request('https://store.example.com/api/cron/email/webhooks/cleanup')
    )

    expect(response.status).toBe(401)
    expect(cleanupMock).not.toHaveBeenCalled()
  })
})
