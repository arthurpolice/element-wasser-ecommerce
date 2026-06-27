import { describe, expect, it, vi } from 'vitest'

const dbMock = vi.hoisted(() => ({ product: {}, $executeRaw: vi.fn() }))
const processPendingProductSearchReindexesMock = vi.hoisted(() => vi.fn())
const verifyQstashSignatureMock = vi.hoisted(() =>
  vi.fn((handler: unknown) => handler)
)

vi.mock('~/server/db', () => ({
  db: dbMock
}))

vi.mock('~/server/commerce/product-search', () => ({
  processPendingProductSearchReindexes: processPendingProductSearchReindexesMock
}))

vi.mock('~/server/queue/qstash', () => ({
  verifyQstashSignature: verifyQstashSignatureMock
}))

import { POST } from './route'

describe('POST /api/qstash/catalog/search/reindex', () => {
  it('verifies the QStash signature and processes Product Search reindex work', async () => {
    processPendingProductSearchReindexesMock.mockResolvedValue({
      requestedCount: 2,
      refreshedCount: 2
    })

    const response = await POST(
      new Request(
        'https://store.example.com/api/qstash/catalog/search/reindex',
        {
          body: JSON.stringify({}),
          method: 'POST'
        }
      )
    )

    expect(verifyQstashSignatureMock).toHaveBeenCalledWith(expect.any(Function))
    expect(processPendingProductSearchReindexesMock).toHaveBeenCalledWith(
      dbMock
    )
    await expect(response.json()).resolves.toEqual({
      requestedCount: 2,
      refreshedCount: 2
    })
  })
})
