import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCallerFactory } from '~/server/api/trpc'
import { dashboardRouter } from '~/server/api/routers/dashboard'

const createCaller = createCallerFactory(dashboardRouter)

type MockOrder = {
  placedAt: Date
  totalCents: number
  paymentStatus: 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED' | 'CANCELLED'
}

type FindManyArgs = {
  where: {
    placedAt: {
      gte: Date
    }
  }
}

function createOwnerCaller(orders: MockOrder[]) {
  const db = {
    order: {
      findMany: vi.fn(async ({ where }: FindManyArgs) =>
        orders.filter((order) => order.placedAt >= where.placedAt.gte)
      )
    }
  }

  const caller = createCaller({
    db: db as never,
    session: {
      user: { id: 'owner-1', role: 'owner' },
      session: { id: 'session-1' }
    } as never,
    headers: new Headers()
  })

  return { caller, findMany: db.order.findMany }
}

function point(
  date: string,
  revenueCents: number,
  orderCount: number
): { date: string; revenueCents: number; orderCount: number } {
  return { date, revenueCents, orderCount }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard router time series', () => {
  it('keeps the daily view zero-filled for the requested number of days', async () => {
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'))
    const { caller, findMany } = createOwnerCaller([
      {
        placedAt: new Date('2026-07-07T10:00:00.000Z'),
        totalCents: 1500,
        paymentStatus: 'PAID'
      },
      {
        placedAt: new Date('2026-07-08T10:00:00.000Z'),
        totalCents: 2500,
        paymentStatus: 'PENDING'
      }
    ])

    const result = await caller.timeSeries({ days: 7 })

    expect(findMany).toHaveBeenCalledWith({
      where: { placedAt: { gte: new Date('2026-07-02T00:00:00.000Z') } },
      select: {
        placedAt: true,
        totalCents: true,
        paymentStatus: true
      }
    })
    expect(result).toEqual({
      period: 'daily',
      points: [
        point('2026-07-02', 0, 0),
        point('2026-07-03', 0, 0),
        point('2026-07-04', 0, 0),
        point('2026-07-05', 0, 0),
        point('2026-07-06', 0, 0),
        point('2026-07-07', 1500, 1),
        point('2026-07-08', 0, 1)
      ]
    })
  })

  it('aggregates monthly revenue and orders over the last 12 months', async () => {
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'))
    const { caller, findMany } = createOwnerCaller([
      {
        placedAt: new Date('2025-08-15T10:00:00.000Z'),
        totalCents: 1000,
        paymentStatus: 'PAID'
      },
      {
        placedAt: new Date('2026-06-03T10:00:00.000Z'),
        totalCents: 4000,
        paymentStatus: 'PAID'
      },
      {
        placedAt: new Date('2026-06-18T10:00:00.000Z'),
        totalCents: 9000,
        paymentStatus: 'PENDING'
      }
    ])

    const result = await caller.timeSeries({ period: 'monthly' })

    expect(findMany).toHaveBeenCalledWith({
      where: { placedAt: { gte: new Date('2025-08-01T00:00:00.000Z') } },
      select: {
        placedAt: true,
        totalCents: true,
        paymentStatus: true
      }
    })
    expect(result.points).toHaveLength(12)
    expect(result.points[0]).toEqual(point('2025-08', 1000, 1))
    expect(result.points[10]).toEqual(point('2026-06', 4000, 2))
    expect(result.points[11]).toEqual(point('2026-07', 0, 0))
  })

  it('aggregates yearly revenue and orders over the last 5 years', async () => {
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'))
    const { caller, findMany } = createOwnerCaller([
      {
        placedAt: new Date('2022-04-15T10:00:00.000Z'),
        totalCents: 3000,
        paymentStatus: 'PAID'
      },
      {
        placedAt: new Date('2026-01-18T10:00:00.000Z'),
        totalCents: 7000,
        paymentStatus: 'PAID'
      },
      {
        placedAt: new Date('2026-05-18T10:00:00.000Z'),
        totalCents: 2000,
        paymentStatus: 'FAILED'
      }
    ])

    const result = await caller.timeSeries({ period: 'yearly' })

    expect(findMany).toHaveBeenCalledWith({
      where: { placedAt: { gte: new Date('2022-01-01T00:00:00.000Z') } },
      select: {
        placedAt: true,
        totalCents: true,
        paymentStatus: true
      }
    })
    expect(result).toEqual({
      period: 'yearly',
      points: [
        point('2022', 3000, 1),
        point('2023', 0, 0),
        point('2024', 0, 0),
        point('2025', 0, 0),
        point('2026', 7000, 2)
      ]
    })
  })
})
