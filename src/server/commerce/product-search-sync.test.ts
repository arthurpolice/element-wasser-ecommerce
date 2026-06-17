import { beforeEach, describe, expect, it, vi } from 'vitest'

const isQstashConfiguredMock = vi.hoisted(() => vi.fn())
const publishQstashJsonMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/queue/qstash', () => ({
  isQstashConfigured: isQstashConfiguredMock,
  publishQstashJson: publishQstashJsonMock
}))

import {
  PRODUCT_SEARCH_REINDEX_QSTASH_PATH,
  PRODUCT_SEARCH_REBUILD_QSTASH_PATH,
  processProductSearchReindexBatch,
  requestProductSearchDocumentRebuild,
  syncProductSearchDocumentsForMutation
} from '~/server/commerce/product-search'

function createSearchSyncDb() {
  return {
    product: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          name: `Product ${id}`,
          sku: `SKU-${id}`,
          description: null,
          manufacturer: { name: 'Element Wasser' },
          categories: []
        }))
      )
    },
    $executeRaw: vi.fn(async () => 1)
  }
}

describe('Product Search document sync orchestration', () => {
  beforeEach(() => {
    isQstashConfiguredMock.mockReset()
    publishQstashJsonMock.mockReset()
  })

  it('refreshes small affected Product sets synchronously', async () => {
    const db = createSearchSyncDb()

    await expect(
      syncProductSearchDocumentsForMutation(db as never, [
        'product-1',
        'product-1',
        'product-2'
      ])
    ).resolves.toEqual({ mode: 'sync', refreshedCount: 2 })

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['product-1', 'product-2'] } }
      })
    )
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
  })

  it('enqueues large affected Product sets for QStash reindexing', async () => {
    const db = createSearchSyncDb()
    isQstashConfiguredMock.mockReturnValue(true)
    publishQstashJsonMock.mockResolvedValue({ messageId: 'msg-1' })
    const productIds = Array.from({ length: 51 }, (_, index) => `p-${index}`)

    await expect(
      syncProductSearchDocumentsForMutation(db as never, productIds)
    ).resolves.toEqual({ mode: 'async', enqueuedCount: 51 })

    expect(db.product.findMany).not.toHaveBeenCalled()
    expect(publishQstashJsonMock).toHaveBeenCalledWith({
      path: PRODUCT_SEARCH_REINDEX_QSTASH_PATH,
      body: { productIds },
      contentBasedDeduplication: true,
      retries: 3,
      label: 'product-search-reindex'
    })
  })

  it('refreshes large affected Product sets synchronously when QStash is unavailable', async () => {
    const db = createSearchSyncDb()
    isQstashConfiguredMock.mockReturnValue(false)
    const productIds = Array.from({ length: 51 }, (_, index) => `p-${index}`)

    await expect(
      syncProductSearchDocumentsForMutation(db as never, productIds)
    ).resolves.toEqual({
      mode: 'sync',
      requestedCount: 51,
      refreshedCount: 51
    })

    expect(publishQstashJsonMock).not.toHaveBeenCalled()
    expect(db.product.findMany).toHaveBeenCalledTimes(2)
    expect(db.product.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: { in: productIds.slice(0, 50) } }
      })
    )
    expect(db.product.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: productIds.slice(50) } }
      })
    )
    expect(db.$executeRaw).toHaveBeenCalledTimes(51)
  })

  it('refreshes large affected Product sets synchronously when QStash publishing fails', async () => {
    const db = createSearchSyncDb()
    isQstashConfiguredMock.mockReturnValue(true)
    publishQstashJsonMock.mockRejectedValue(new Error('QStash unavailable'))
    const productIds = Array.from({ length: 51 }, (_, index) => `p-${index}`)

    await expect(
      syncProductSearchDocumentsForMutation(db as never, productIds)
    ).resolves.toEqual({
      mode: 'sync',
      requestedCount: 51,
      refreshedCount: 51
    })

    expect(publishQstashJsonMock).toHaveBeenCalledTimes(1)
    expect(db.product.findMany).toHaveBeenCalledTimes(2)
    expect(db.$executeRaw).toHaveBeenCalledTimes(51)
  })

  it('processes QStash reindex work in retry-safe batches', async () => {
    const db = createSearchSyncDb()

    await expect(
      processProductSearchReindexBatch(
        db as never,
        ['product-1', 'product-2', 'product-3'],
        2
      )
    ).resolves.toEqual({ requestedCount: 3, refreshedCount: 3 })

    expect(db.product.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: { in: ['product-1', 'product-2'] } }
      })
    )
    expect(db.product.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['product-3'] } }
      })
    )
    expect(db.$executeRaw).toHaveBeenCalledTimes(3)
  })

  it('enqueues maintainer-triggered rebuild work in batches', async () => {
    const db = {
      ...createSearchSyncDb(),
      $queryRaw: vi.fn(async () => [
        { productId: 'product-1' },
        { productId: 'product-2' },
        { productId: 'product-3' }
      ])
    }
    isQstashConfiguredMock.mockReturnValue(true)
    publishQstashJsonMock.mockResolvedValue({ messageId: 'msg-1' })

    await expect(
      requestProductSearchDocumentRebuild(db as never, {
        mode: 'missing',
        batchSize: 2
      })
    ).resolves.toEqual({
      mode: 'async',
      requestedCount: 3,
      enqueuedBatchCount: 2,
      refreshedCount: 0
    })

    expect(publishQstashJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: PRODUCT_SEARCH_REBUILD_QSTASH_PATH,
        body: { productIds: ['product-1', 'product-2'] },
        deduplicationId: 'product-search-rebuild:missing:0:product-1,product-2',
        retries: 3,
        label: 'product-search-rebuild'
      })
    )
    expect(publishQstashJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { productIds: ['product-3'] },
        deduplicationId: 'product-search-rebuild:missing:1:product-3'
      })
    )
  })

  it('runs maintainer-triggered rebuild work inline when QStash is unavailable', async () => {
    const db = {
      ...createSearchSyncDb(),
      $queryRaw: vi.fn(async () => [
        { productId: 'product-1' },
        { productId: 'product-2' }
      ])
    }
    isQstashConfiguredMock.mockReturnValue(false)

    await expect(
      requestProductSearchDocumentRebuild(db as never, {
        mode: 'all',
        batchSize: 1
      })
    ).resolves.toEqual({
      mode: 'sync',
      requestedCount: 2,
      enqueuedBatchCount: 0,
      refreshedCount: 2
    })

    expect(publishQstashJsonMock).not.toHaveBeenCalled()
    expect(db.product.findMany).toHaveBeenCalledTimes(2)
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
  })

  it('runs maintainer-triggered rebuild work inline when QStash publishing fails', async () => {
    const db = {
      ...createSearchSyncDb(),
      $queryRaw: vi.fn(async () => [
        { productId: 'product-1' },
        { productId: 'product-2' }
      ])
    }
    isQstashConfiguredMock.mockReturnValue(true)
    publishQstashJsonMock.mockRejectedValue(new Error('QStash unavailable'))

    await expect(
      requestProductSearchDocumentRebuild(db as never, {
        mode: 'all',
        batchSize: 1
      })
    ).resolves.toEqual({
      mode: 'sync',
      requestedCount: 2,
      enqueuedBatchCount: 0,
      refreshedCount: 2
    })

    expect(publishQstashJsonMock).toHaveBeenCalledTimes(2)
    expect(db.product.findMany).toHaveBeenCalledTimes(2)
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
  })
})
