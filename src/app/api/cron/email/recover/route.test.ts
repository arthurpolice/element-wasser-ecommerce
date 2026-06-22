import { beforeEach, describe, expect, it, vi } from 'vitest'

const recoverMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({ env: { CRON_SECRET: 'cron-secret' } }))
vi.mock('~/server/db', () => ({ db: { name: 'db' } }))
vi.mock('~/server/commerce/email-notifications', () => ({
  recoverPendingEmailNotifications: recoverMock
}))

import { GET } from './route'

describe('GET /api/cron/email/recover', () => {
  beforeEach(() => recoverMock.mockReset())

  it('recovers pending notifications for an authorized cron request', async () => {
    recoverMock.mockResolvedValue(3)

    const response = await GET(
      new Request('https://store.example.com/api/cron/email/recover', {
        headers: { authorization: 'Bearer cron-secret' }
      })
    )

    await expect(response.json()).resolves.toEqual({ publishedCount: 3 })
  })

  it('rejects an unauthorized recovery request', async () => {
    const response = await GET(
      new Request('https://store.example.com/api/cron/email/recover', {
        headers: { authorization: 'Bearer wrong-secret' }
      })
    )

    expect(response.status).toBe(401)
    expect(recoverMock).not.toHaveBeenCalled()
  })
})
