import { beforeEach, describe, expect, it, vi } from 'vitest'

const isQstashConfiguredMock = vi.hoisted(() => vi.fn())
const publishQstashJsonMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/queue/qstash', () => ({
  isQstashConfigured: isQstashConfiguredMock,
  publishQstashJson: publishQstashJsonMock,
  qstashDeduplicationId: (...parts: Array<number | string>) =>
    parts.map((part) => String(part).replaceAll(':', '_')).join('_')
}))

import {
  PRODUCT_SEARCH_REINDEX_QSTASH_PATH,
  PRODUCT_SEARCH_REBUILD_QSTASH_PATH,
  processPendingProductSearchReindexes,
  recordPendingProductSearchReindexes,
  requestProductSearchDocumentRebuild,
  scheduleProductSearchReindex,
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
    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('records coalescing durable reindex work in one statement', async () => {
    const db = createSearchSyncDb()

    await expect(
      recordPendingProductSearchReindexes(db as never, [
        'product-1',
        'product-1',
        'product-2'
      ])
    ).resolves.toEqual({ pendingCount: 2 })

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    expect(
      String((db.$executeRaw.mock.calls as unknown[][])[0]?.[0])
    ).toContain('ProductSearchReindex')
  })

  it('publishes a generic wake-up when QStash is configured', async () => {
    isQstashConfiguredMock.mockReturnValue(true)
    publishQstashJsonMock.mockResolvedValue({ messageId: 'message-1' })

    await scheduleProductSearchReindex()

    expect(publishQstashJsonMock).toHaveBeenCalledWith({
      path: PRODUCT_SEARCH_REINDEX_QSTASH_PATH,
      body: {},
      contentBasedDeduplication: true,
      retries: 3,
      label: 'product-search-reindex'
    })
  })

  it('processes pending work and completes only captured generations', async () => {
    const db = {
      ...createSearchSyncDb(),
      $queryRaw: vi.fn(async () => [
        { productId: 'product-1', generation: 2 },
        { productId: 'product-2', generation: 1 }
      ])
    }

    await expect(
      processPendingProductSearchReindexes(db as never, 2)
    ).resolves.toEqual({ requestedCount: 2, refreshedCount: 2 })

    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['product-1', 'product-2'] } }
      })
    )
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
    expect(
      String((db.$executeRaw.mock.calls as unknown[][])[1]?.[0])
    ).toContain('"generation"')
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
        deduplicationId: 'product-search-rebuild_missing_0_product-1,product-2',
        retries: 3,
        label: 'product-search-rebuild'
      })
    )
    expect(publishQstashJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { productIds: ['product-3'] },
        deduplicationId: 'product-search-rebuild_missing_1_product-3'
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
