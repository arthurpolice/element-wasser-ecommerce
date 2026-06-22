/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyMock = vi.hoisted(() => vi.fn())
const processMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({
  env: { RESEND_WEBHOOK_SECRET: 'whsec_test' }
}))
vi.mock('~/server/db', () => ({ db: { name: 'db' } }))
vi.mock('~/server/email/resend', () => ({
  getResendClient: () => ({ webhooks: { verify: verifyMock } })
}))
vi.mock('~/server/commerce/resend-webhook-events', () => ({
  processResendWebhookEvent: processMock
}))

import { POST } from './route'

describe('POST /api/resend/webhook', () => {
  beforeEach(() => {
    verifyMock.mockReset()
    processMock.mockReset()
  })

  it('verifies and records a signed Resend webhook', async () => {
    const event = {
      type: 'email.sent',
      created_at: '2026-06-21T12:00:00.000Z',
      data: { email_id: 'resend-1' }
    }
    verifyMock.mockReturnValue(event)
    processMock.mockResolvedValue({ duplicate: false })

    const response = await POST(
      new Request('https://store.example.com/api/resend/webhook', {
        method: 'POST',
        headers: {
          'svix-id': 'event-1',
          'svix-timestamp': '1750507200',
          'svix-signature': 'v1,signature'
        },
        body: JSON.stringify(event)
      })
    )

    expect(response.status).toBe(200)
    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookSecret: 'whsec_test',
        headers: expect.objectContaining({ id: 'event-1' })
      })
    )
    expect(processMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventId: 'event-1', event })
    )
  })

  it('rejects an invalid webhook signature', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const response = await POST(
      new Request('https://store.example.com/api/resend/webhook', {
        method: 'POST',
        body: '{}'
      })
    )

    expect(response.status).toBe(400)
    expect(processMock).not.toHaveBeenCalled()
  })
})
