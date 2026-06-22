import { beforeEach, describe, expect, it, vi } from 'vitest'

const retryMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/commerce/email-notifications', () => ({
  retryFailedEmailNotification: retryMock
}))

import { orderRouter } from './order'
import { createCallerFactory } from '~/server/api/trpc'

const createCaller = createCallerFactory(orderRouter)

function caller(role: 'owner' | 'customer') {
  return createCaller({
    db: {} as never,
    session: {
      user: { id: `${role}-1`, role },
      session: { id: 'session-1' }
    } as never,
    headers: new Headers()
  })
}

describe('Order Email Notification owner actions', () => {
  beforeEach(() => retryMock.mockReset())

  it('allows the owner to retry a failed Email Notification', async () => {
    retryMock.mockResolvedValue(true)

    await expect(
      caller('owner').retryEmailNotification({
        emailNotificationId: 'notification-1'
      })
    ).resolves.toEqual({ retried: true })
  })

  it('rejects retry access for a non-owner', async () => {
    await expect(
      caller('customer').retryEmailNotification({
        emailNotificationId: 'notification-1'
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(retryMock).not.toHaveBeenCalled()
  })
})
