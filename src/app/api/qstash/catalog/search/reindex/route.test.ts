import { describe, expect, it, vi } from 'vitest'

const dbMock = vi.hoisted(() => ({ product: {}, $executeRaw: vi.fn() }))
const processProductSearchReindexBatchMock = vi.hoisted(() => vi.fn())
const verifyQstashSignatureMock = vi.hoisted(() =>
  vi.fn((handler: unknown) => handler)
)

vi.mock('~/server/db', () => ({
  db: dbMock
}))

vi.mock('~/server/commerce/product-search', () => ({
  processProductSearchReindexBatch: processProductSearchReindexBatchMock
}))

vi.mock('~/server/queue/qstash', () => ({
  verifyQstashSignature: verifyQstashSignatureMock
}))

import { POST } from './route'

describe('POST /api/qstash/catalog/search/reindex', () => {
  it('verifies the QStash signature and processes Product Search reindex work', async () => {
    processProductSearchReindexBatchMock.mockResolvedValue({
      requestedCount: 2,
      refreshedCount: 2
    })

    const response = await POST(
      new Request(
        'https://store.example.com/api/qstash/catalog/search/reindex',
        {
          body: JSON.stringify({ productIds: ['product-1', 'product-2'] }),
          method: 'POST'
        }
      )
    )

    expect(verifyQstashSignatureMock).toHaveBeenCalledWith(expect.any(Function))
    expect(processProductSearchReindexBatchMock).toHaveBeenCalledWith(dbMock, [
      'product-1',
      'product-2'
    ])
    await expect(response.json()).resolves.toEqual({
      requestedCount: 2,
      refreshedCount: 2
    })
  })
})
