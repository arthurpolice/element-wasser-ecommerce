import { OrderStatus } from '../../../../generated/prisma/client'
import { z } from 'zod'

import { createTRPCRouter, ownerProcedure } from '~/server/api/trpc'

const LOW_STOCK_THRESHOLD = 5
const NEW_CUSTOMER_DAYS = 30
const CHART_DAYS = 30
const CHART_MONTHS = 12
const CHART_YEARS = 5

const timeSeriesPeriodSchema = z.enum(['daily', 'monthly', 'yearly'])

type TimeSeriesPeriod = z.infer<typeof timeSeriesPeriodSchema>

type TimeSeriesValues = {
  revenueCents: number
  orderCount: number
}

type TimeSeriesPoint = TimeSeriesValues & {
  date: string
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function startOfUtcYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

function addUtcYears(date: Date, years: number): Date {
  const next = new Date(date)
  next.setUTCFullYear(next.getUTCFullYear() + years)
  return next
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
}

function toYearKey(date: Date): string {
  return date.toISOString().slice(0, 4)
}

function buildDailySeries(
  since: Date,
  days: number,
  valuesByDay: Map<string, TimeSeriesValues>
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []

  for (let index = 0; index < days; index += 1) {
    const day = addUtcDays(since, index)
    const date = toDayKey(day)
    const values = valuesByDay.get(date) ?? {
      revenueCents: 0,
      orderCount: 0
    }
    points.push({ date, ...values })
  }

  return points
}

function buildMonthlySeries(
  since: Date,
  months: number,
  valuesByMonth: Map<string, TimeSeriesValues>
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []

  for (let index = 0; index < months; index += 1) {
    const month = addUtcMonths(since, index)
    const date = toMonthKey(month)
    const values = valuesByMonth.get(date) ?? {
      revenueCents: 0,
      orderCount: 0
    }
    points.push({ date, ...values })
  }

  return points
}

function buildYearlySeries(
  since: Date,
  years: number,
  valuesByYear: Map<string, TimeSeriesValues>
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []

  for (let index = 0; index < years; index += 1) {
    const year = addUtcYears(since, index)
    const date = toYearKey(year)
    const values = valuesByYear.get(date) ?? {
      revenueCents: 0,
      orderCount: 0
    }
    points.push({ date, ...values })
  }

  return points
}

function getBucketKey(date: Date, period: TimeSeriesPeriod): string {
  if (period === 'yearly') {
    return toYearKey(startOfUtcYear(date))
  }

  if (period === 'monthly') {
    return toMonthKey(startOfUtcMonth(date))
  }

  return toDayKey(startOfUtcDay(date))
}

export const dashboardRouter = createTRPCRouter({
  ping: ownerProcedure.query(() => {
    return { ok: true as const }
  }),

  summary: ownerProcedure.query(async ({ ctx }) => {
    const newCustomerSince = addUtcDays(
      startOfUtcDay(new Date()),
      -NEW_CUSTOMER_DAYS
    )

    const [
      revenueAgg,
      placedOrdersCount,
      pendingPaymentsCount,
      lowStockCount,
      newCustomersCount
    ] = await Promise.all([
      ctx.db.order.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { totalCents: true }
      }),
      ctx.db.order.count({ where: { status: OrderStatus.PLACED } }),
      ctx.db.order.count({ where: { paymentStatus: 'PENDING' } }),
      ctx.db.product.count({
        where: {
          active: true,
          stockOnHand: { lte: LOW_STOCK_THRESHOLD }
        }
      }),
      ctx.db.customer.count({
        where: { createdAt: { gte: newCustomerSince } }
      })
    ])

    return {
      revenueCents: revenueAgg._sum.totalCents ?? 0,
      placedOrdersCount,
      pendingPaymentsCount,
      lowStockCount,
      newCustomersCount
    }
  }),

  timeSeries: ownerProcedure
    .input(
      z
        .object({
          days: z.number().int().min(7).max(90).default(CHART_DAYS),
          period: timeSeriesPeriodSchema.default('daily')
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const period = input?.period ?? 'daily'
      const days = input?.days ?? CHART_DAYS
      const now = new Date()
      const since =
        period === 'yearly'
          ? addUtcYears(startOfUtcYear(now), -(CHART_YEARS - 1))
          : period === 'monthly'
            ? addUtcMonths(startOfUtcMonth(now), -(CHART_MONTHS - 1))
            : addUtcDays(startOfUtcDay(now), -(days - 1))

      const orders = await ctx.db.order.findMany({
        where: { placedAt: { gte: since } },
        select: {
          placedAt: true,
          totalCents: true,
          paymentStatus: true
        }
      })

      const valuesByBucket = new Map<string, TimeSeriesValues>()

      for (const order of orders) {
        const date = getBucketKey(order.placedAt, period)
        const current = valuesByBucket.get(date) ?? {
          revenueCents: 0,
          orderCount: 0
        }

        current.orderCount += 1
        if (order.paymentStatus === 'PAID') {
          current.revenueCents += order.totalCents
        }

        valuesByBucket.set(date, current)
      }

      const points =
        period === 'yearly'
          ? buildYearlySeries(since, CHART_YEARS, valuesByBucket)
          : period === 'monthly'
            ? buildMonthlySeries(since, CHART_MONTHS, valuesByBucket)
            : buildDailySeries(since, days, valuesByBucket)

      return {
        period,
        points
      }
    }),

  orderStatusDistribution: ownerProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.order.groupBy({
      by: ['status'],
      _count: { _all: true }
    })

    const counts: Record<OrderStatus, number> = {
      PLACED: 0,
      COMPLETED: 0,
      CANCELLED: 0
    }

    for (const group of groups) {
      counts[group.status] = group._count._all
    }

    return counts
  })
})
