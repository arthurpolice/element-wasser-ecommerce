import { beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(() => ({ CRON_SECRET: 'cron-secret' }))
const dbMock = vi.hoisted(() => ({}))
const findProjectionDriftMock = vi.hoisted(() => vi.fn())
const reconcileProjectionsMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({ env: envMock }))
vi.mock('~/server/db', () => ({ db: dbMock }))
vi.mock('~/server/commerce/review-rating', () => ({
  findProductReviewRatingProjectionDrift: findProjectionDriftMock,
  reconcileProductReviewRatingProjections: reconcileProjectionsMock
}))

import { GET } from './route'

const request = () =>
  new Request(
    'https://store.example.com/api/cron/catalog/review-ratings/reconcile',
    {
      headers: { authorization: 'Bearer cron-secret' }
    }
  )

describe('GET /api/cron/catalog/review-ratings/reconcile', () => {
  beforeEach(() => {
    findProjectionDriftMock.mockReset()
    reconcileProjectionsMock.mockReset()
  })

  it('detects and repairs Product Review rating projection drift', async () => {
    findProjectionDriftMock.mockResolvedValue([
      { productId: 'product-1' },
      { productId: 'product-2' }
    ])
    reconcileProjectionsMock.mockResolvedValue({ updatedCount: 2 })

    const response = await GET(request())

    expect(findProjectionDriftMock).toHaveBeenCalledWith(dbMock)
    expect(reconcileProjectionsMock).toHaveBeenCalledWith(dbMock)
    await expect(response.json()).resolves.toEqual({
      driftedProductCount: 2,
      updatedCount: 2
    })
  })

  it('skips the repair query when no projection has drifted', async () => {
    findProjectionDriftMock.mockResolvedValue([])

    const response = await GET(request())

    expect(reconcileProjectionsMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      driftedProductCount: 0,
      updatedCount: 0
    })
  })

  it('rejects unauthorized requests', async () => {
    const response = await GET(
      new Request(
        'https://store.example.com/api/cron/catalog/review-ratings/reconcile'
      )
    )

    expect(response.status).toBe(401)
    expect(findProjectionDriftMock).not.toHaveBeenCalled()
    expect(reconcileProjectionsMock).not.toHaveBeenCalled()
  })
})
