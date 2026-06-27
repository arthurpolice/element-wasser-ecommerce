import { beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(() => ({ CRON_SECRET: 'cron-secret' }))
const dbMock = vi.hoisted(() => ({}))
const processPendingProductSearchReindexesMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({ env: envMock }))
vi.mock('~/server/db', () => ({ db: dbMock }))
vi.mock('~/server/commerce/product-search', () => ({
  processPendingProductSearchReindexes: processPendingProductSearchReindexesMock
}))

import { GET } from './route'

describe('GET /api/cron/catalog/search/reindex', () => {
  beforeEach(() => {
    processPendingProductSearchReindexesMock.mockReset()
  })

  it('processes durable Product Search reindex work', async () => {
    processPendingProductSearchReindexesMock.mockResolvedValue({
      requestedCount: 2,
      refreshedCount: 2
    })

    const response = await GET(
      new Request('https://store.example.com/api/cron/catalog/search/reindex', {
        headers: { authorization: 'Bearer cron-secret' }
      })
    )

    expect(processPendingProductSearchReindexesMock).toHaveBeenCalledWith(
      dbMock
    )
    await expect(response.json()).resolves.toEqual({
      requestedCount: 2,
      refreshedCount: 2
    })
  })

  it('rejects unauthorized requests', async () => {
    const response = await GET(
      new Request('https://store.example.com/api/cron/catalog/search/reindex')
    )

    expect(response.status).toBe(401)
    expect(processPendingProductSearchReindexesMock).not.toHaveBeenCalled()
  })
})
