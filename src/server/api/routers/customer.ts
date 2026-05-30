import { Prisma, Salutation } from "../../../../generated/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z
    .enum(["name", "email", "createdAt", "orderCount"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const createInputSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  salutation: z.nativeEnum(Salutation).optional(),
});

function buildSearchFilter(
  search: string | undefined,
): Prisma.CustomerWhereInput | undefined {
  if (!search) {
    return undefined;
  }

  return {
    OR: [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ],
  };
}

function buildOrderBy(
  sortBy: z.infer<typeof listInputSchema>["sortBy"],
  sortDir: z.infer<typeof listInputSchema>["sortDir"],
): Prisma.CustomerOrderByWithRelationInput | Prisma.CustomerOrderByWithRelationInput[] {
  switch (sortBy) {
    case "name":
      return [{ lastName: sortDir }, { firstName: sortDir }];
    case "email":
      return { email: sortDir };
    case "orderCount":
      return { orders: { _count: sortDir } };
    case "createdAt":
    default:
      return { createdAt: sortDir };
  }
}

function mapCustomerRow(
  customer: Prisma.CustomerGetPayload<{
    include: {
      user: { select: { id: true } };
      _count: { select: { orders: true } };
      orders: {
        select: { totalCents: true; placedAt: true; status: true };
      };
    };
  }>,
) {
  const activeOrders = customer.orders.filter(
    (order) => order.status !== "CANCELLED",
  );
  const totalSpentCents = activeOrders.reduce(
    (sum, order) => sum + order.totalCents,
    0,
  );
  const latestOrderAt = activeOrders.reduce<Date | null>((latest, order) => {
    if (!latest || order.placedAt > latest) {
      return order.placedAt;
    }
    return latest;
  }, null);

  return {
    id: customer.id,
    email: customer.email,
    salutation: customer.salutation,
    firstName: customer.firstName,
    lastName: customer.lastName,
    createdAt: customer.createdAt,
    isRegistered: customer.userId !== null,
    hasLinkedUser: customer.user !== null,
    orderCount: customer._count.orders,
    totalSpentCents,
    latestOrderAt,
  };
}

export const customerRouter = createTRPCRouter({
  list: ownerProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const where = buildSearchFilter(input.search);
    const orderBy = buildOrderBy(input.sortBy, input.sortDir);
    const skip = (input.page - 1) * input.pageSize;

    const [totalCount, customers] = await ctx.db.$transaction([
      ctx.db.customer.count({ where }),
      ctx.db.customer.findMany({
        where,
        include: {
          user: { select: { id: true } },
          _count: { select: { orders: true } },
          orders: {
            select: {
              totalCents: true,
              placedAt: true,
              status: true,
            },
          },
        },
        orderBy,
        skip,
        take: input.pageSize,
      }),
    ]);

    return {
      items: customers.map(mapCustomerRow),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
    };
  }),

  create: ownerProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const customer = await ctx.db.customer.create({
          data: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            salutation: input.salutation,
          },
          include: {
            user: { select: { id: true } },
            _count: { select: { orders: true } },
            orders: {
              select: {
                totalCents: true,
                placedAt: true,
                status: true,
              },
            },
          },
        });

        return mapCustomerRow(customer);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A customer with this email already exists.",
          });
        }

        throw error;
      }
    }),
});
