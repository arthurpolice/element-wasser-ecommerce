import { OrderStatus } from "../../../../generated/prisma";
import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const LOW_STOCK_THRESHOLD = 5;
const NEW_CUSTOMER_DAYS = 30;
const CHART_DAYS = 30;

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDailySeries(
  since: Date,
  days: number,
  valuesByDay: Map<string, { revenueCents: number; orderCount: number }>,
): Array<{ date: string; revenueCents: number; orderCount: number }> {
  const points: Array<{ date: string; revenueCents: number; orderCount: number }> =
    [];

  for (let index = 0; index < days; index += 1) {
    const day = addUtcDays(since, index);
    const date = toDayKey(day);
    const values = valuesByDay.get(date) ?? {
      revenueCents: 0,
      orderCount: 0,
    };
    points.push({ date, ...values });
  }

  return points;
}

export const dashboardRouter = createTRPCRouter({
  ping: ownerProcedure.query(() => {
    return { ok: true as const };
  }),

  summary: ownerProcedure.query(async ({ ctx }) => {
    const newCustomerSince = addUtcDays(startOfUtcDay(new Date()), -NEW_CUSTOMER_DAYS);

    const [revenueAgg, placedOrdersCount, pendingPaymentsCount, lowStockCount, newCustomersCount] =
      await Promise.all([
        ctx.db.order.aggregate({
          where: { paymentStatus: "PAID" },
          _sum: { totalCents: true },
        }),
        ctx.db.order.count({ where: { status: OrderStatus.PLACED } }),
        ctx.db.order.count({ where: { paymentStatus: "PENDING" } }),
        ctx.db.product.count({
          where: {
            active: true,
            stockOnHand: { lte: LOW_STOCK_THRESHOLD },
          },
        }),
        ctx.db.customer.count({
          where: { createdAt: { gte: newCustomerSince } },
        }),
      ]);

    return {
      revenueCents: revenueAgg._sum.totalCents ?? 0,
      placedOrdersCount,
      pendingPaymentsCount,
      lowStockCount,
      newCustomersCount,
    };
  }),

  timeSeries: ownerProcedure
    .input(
      z
        .object({
          days: z.number().int().min(7).max(90).default(CHART_DAYS),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? CHART_DAYS;
      const since = addUtcDays(startOfUtcDay(new Date()), -(days - 1));

      const orders = await ctx.db.order.findMany({
        where: { placedAt: { gte: since } },
        select: {
          placedAt: true,
          totalCents: true,
          paymentStatus: true,
        },
      });

      const valuesByDay = new Map<
        string,
        { revenueCents: number; orderCount: number }
      >();

      for (const order of orders) {
        const date = toDayKey(startOfUtcDay(order.placedAt));
        const current = valuesByDay.get(date) ?? {
          revenueCents: 0,
          orderCount: 0,
        };

        current.orderCount += 1;
        if (order.paymentStatus === "PAID") {
          current.revenueCents += order.totalCents;
        }

        valuesByDay.set(date, current);
      }

      return {
        points: buildDailySeries(since, days, valuesByDay),
      };
    }),

  orderStatusDistribution: ownerProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const counts: Record<OrderStatus, number> = {
      PLACED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    for (const group of groups) {
      counts[group.status] = group._count._all;
    }

    return counts;
  }),
});
