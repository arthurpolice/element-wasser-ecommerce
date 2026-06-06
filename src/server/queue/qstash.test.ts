import { beforeEach, describe, expect, it, vi } from 'vitest'

type EnvMock = {
  NODE_ENV: 'development' | 'test' | 'production'
  QSTASH_TOKEN: string | undefined
  QSTASH_CURRENT_SIGNING_KEY: string | undefined
  QSTASH_NEXT_SIGNING_KEY: string | undefined
  QSTASH_PUBLISH_BASE_URL: string | undefined
}

const envMock = vi.hoisted(
  (): EnvMock => ({
    NODE_ENV: 'test',
    QSTASH_TOKEN: 'qstash-token',
    QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
    QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
    QSTASH_PUBLISH_BASE_URL: 'https://store.example.com'
  })
)

const publishJSONMock = vi.hoisted(() => vi.fn())
const ClientMock = vi.hoisted(() =>
  vi.fn(() => ({
    publishJSON: publishJSONMock
  }))
)
const verifySignatureAppRouterMock = vi.hoisted(() =>
  vi.fn((handler: unknown, config: unknown) => ({
    config,
    handler,
    verified: true
  }))
)

vi.mock('~/env', () => ({
  env: envMock
}))

vi.mock('@upstash/qstash', () => ({
  Client: ClientMock
}))

vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: verifySignatureAppRouterMock
}))

import {
  isQstashConfigured,
  publishQstashJson,
  verifyQstashSignature
} from '~/server/queue/qstash'

describe('qstash queue helpers', () => {
  beforeEach(() => {
    envMock.NODE_ENV = 'test'
    envMock.QSTASH_TOKEN = 'qstash-token'
    envMock.QSTASH_CURRENT_SIGNING_KEY = 'current-signing-key'
    envMock.QSTASH_NEXT_SIGNING_KEY = 'next-signing-key'
    envMock.QSTASH_PUBLISH_BASE_URL = 'https://store.example.com'
    delete process.env.PORT
    delete process.env.VERCEL_URL
    ClientMock.mockClear()
    publishJSONMock.mockReset()
    verifySignatureAppRouterMock.mockClear()
  })

  describe('isQstashConfigured', () => {
    it('returns true when publishing and signing settings are present', () => {
      expect(isQstashConfigured()).toBe(true)
    })

    it('returns false when any required setting is missing', () => {
      envMock.QSTASH_TOKEN = undefined

      expect(isQstashConfigured()).toBe(false)
    })
  })

  describe('publishQstashJson', () => {
    it('publishes JSON to a configured QStash route path', async () => {
      publishJSONMock.mockResolvedValue({ messageId: 'msg_123' })

      await expect(
        publishQstashJson({
          path: '/api/qstash/orders/fulfill',
          body: { orderId: 'order_123' },
          delay: '3s',
          retries: 2
        })
      ).resolves.toEqual({ messageId: 'msg_123' })

      expect(ClientMock).toHaveBeenCalledWith({ token: 'qstash-token' })
      expect(publishJSONMock).toHaveBeenCalledWith({
        url: 'https://store.example.com/api/qstash/orders/fulfill',
        body: { orderId: 'order_123' },
        delay: '3s',
        retries: 2
      })
    })

    it('normalizes trailing slashes on the publish base URL', async () => {
      envMock.QSTASH_PUBLISH_BASE_URL = 'https://store.example.com/'
      publishJSONMock.mockResolvedValue({ messageId: 'msg_123' })

      await publishQstashJson({
        path: '/api/qstash/orders/fulfill',
        body: { orderId: 'order_123' }
      })

      expect(publishJSONMock).toHaveBeenCalledWith({
        url: 'https://store.example.com/api/qstash/orders/fulfill',
        body: { orderId: 'order_123' }
      })
    })

    it('falls back to localhost outside production when no base URL is configured', async () => {
      envMock.QSTASH_PUBLISH_BASE_URL = undefined
      process.env.PORT = '4242'
      publishJSONMock.mockResolvedValue({ messageId: 'msg_123' })

      await publishQstashJson({
        path: '/api/qstash/orders/fulfill',
        body: { orderId: 'order_123' }
      })

      expect(publishJSONMock).toHaveBeenCalledWith({
        url: 'http://localhost:4242/api/qstash/orders/fulfill',
        body: { orderId: 'order_123' }
      })
    })

    it('rejects paths outside the QStash route boundary', async () => {
      await expect(
        publishQstashJson({
          path: '/api/trpc/orders.fulfill',
          body: { orderId: 'order_123' }
        })
      ).rejects.toThrow('QStash publish path must start with /api/qstash/.')

      expect(publishJSONMock).not.toHaveBeenCalled()
    })

    it('throws when publishing is not configured', async () => {
      envMock.QSTASH_TOKEN = undefined

      await expect(
        publishQstashJson({
          path: '/api/qstash/orders/fulfill',
          body: { orderId: 'order_123' }
        })
      ).rejects.toThrow('QStash publishing is not configured.')
    })
  })

  describe('verifyQstashSignature', () => {
    it('wraps App Router handlers with the configured QStash signing keys', () => {
      const handler = vi.fn(() => new Response(null, { status: 204 }))

      expect(verifyQstashSignature(handler)).toEqual({
        config: {
          currentSigningKey: 'current-signing-key',
          nextSigningKey: 'next-signing-key'
        },
        handler,
        verified: true
      })
    })

    it('throws when signature verification is not configured', () => {
      envMock.QSTASH_CURRENT_SIGNING_KEY = undefined

      expect(() =>
        verifyQstashSignature(() => new Response(null, { status: 204 }))
      ).toThrow('QStash signature verification is not configured.')
    })
  })
})
