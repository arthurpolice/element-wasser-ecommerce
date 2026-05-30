import {
  Prisma,
  Salutation,
} from "../../../../generated/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const PAYMENT_RESERVATION_MINUTES = 15;

const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z
    .enum([
      "orderNumber",
      "customerName",
      "customerEmail",
      "status",
      "paymentStatus",
      "fulfillmentStatus",
      "totalCents",
      "placedAt",
      "shippingCity",
      "shippingCountryCode",
    ])
    .default("placedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const shippingSnapshotSchema = z.object({
  shippingSalutation: z.nativeEnum(Salutation).optional(),
  shippingFirstName: z.string().trim().min(1),
  shippingLastName: z.string().trim().min(1),
  shippingCompany: z.string().trim().optional(),
  shippingStreetLine1: z.string().trim().min(1),
  shippingStreetLine2: z.string().trim().optional(),
  shippingPostalCode: z.string().trim().min(1),
  shippingCity: z.string().trim().min(1),
  shippingCountryCode: z.string().trim().min(2).max(2),
  shippingPhone: z.string().trim().optional(),
});

const createInputSchema = z
  .object({
    customerId: z.string().min(1),
    productId: z.string().min(1),
    quantity: z.number().int().min(1),
    shippingCents: z.number().int().min(0),
  })
  .merge(shippingSnapshotSchema);

const orderListInclude = {
  payments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      provider: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

type OrderListRow = Prisma.OrderGetPayload<{
  include: typeof orderListInclude;
}>;

function buildSearchFilter(
  search: string | undefined,
): Prisma.OrderWhereInput | undefined {
  if (!search) {
    return undefined;
  }

  return {
    OR: [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { customerEmail: { contains: search, mode: "insensitive" } },
      { customerFirstName: { contains: search, mode: "insensitive" } },
      { customerLastName: { contains: search, mode: "insensitive" } },
      { shippingCity: { contains: search, mode: "insensitive" } },
      { shippingCountryCode: { contains: search, mode: "insensitive" } },
    ],
  };
}

function buildOrderBy(
  sortBy: z.infer<typeof listInputSchema>["sortBy"],
  sortDir: z.infer<typeof listInputSchema>["sortDir"],
): Prisma.OrderOrderByWithRelationInput | Prisma.OrderOrderByWithRelationInput[] {
  switch (sortBy) {
    case "orderNumber":
      return { orderNumber: sortDir };
    case "customerName":
      return [{ customerLastName: sortDir }, { customerFirstName: sortDir }];
    case "customerEmail":
      return { customerEmail: sortDir };
    case "status":
      return { status: sortDir };
    case "paymentStatus":
      return { paymentStatus: sortDir };
    case "fulfillmentStatus":
      return { fulfillmentStatus: sortDir };
    case "totalCents":
      return { totalCents: sortDir };
    case "shippingCity":
      return { shippingCity: sortDir };
    case "shippingCountryCode":
      return { shippingCountryCode: sortDir };
    case "placedAt":
    default:
      return { placedAt: sortDir };
  }
}

function mapOrderRow(order: OrderListRow) {
  const latestPayment = order.payments[0] ?? null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerFirstName: order.customerFirstName,
    customerLastName: order.customerLastName,
    customerEmail: order.customerEmail,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    totalCents: order.totalCents,
    currencyCode: order.currencyCode,
    shippingCity: order.shippingCity,
    shippingCountryCode: order.shippingCountryCode,
    placedAt: order.placedAt,
    latestPayment,
  };
}

function calculateUnitPriceCents(
  listPriceCents: number,
  discountPercent: number | null,
): number {
  if (!discountPercent) {
    return listPriceCents;
  }

  return Math.round((listPriceCents * (100 - discountPercent)) / 100);
}

function formatOrderNumber(year: number, sequence: number): string {
  return `EW-${year}-${String(sequence).padStart(5, "0")}`;
}

async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await tx.orderNumberSequence.upsert({
    where: { year },
    create: { year, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });

  return formatOrderNumber(year, sequence.nextNumber - 1);
}

export const orderRouter = createTRPCRouter({
  list: ownerProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const where = buildSearchFilter(input.search);
    const orderBy = buildOrderBy(input.sortBy, input.sortDir);
    const skip = (input.page - 1) * input.pageSize;

    const [totalCount, orders] = await ctx.db.$transaction([
      ctx.db.order.count({ where }),
      ctx.db.order.findMany({
        where,
        include: orderListInclude,
        orderBy,
        skip,
        take: input.pageSize,
      }),
    ]);

    return {
      items: orders.map(mapOrderRow),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
    };
  }),

  listCustomersForCreate: ownerProcedure.query(async ({ ctx }) => {
    const customers = await ctx.db.customer.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        salutation: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return customers;
  }),

  listProductsForCreate: ownerProcedure.query(async ({ ctx }) => {
    const products = await ctx.db.product.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        priceCents: true,
        costCents: true,
        discountPercent: true,
        stockOnHand: true,
        stockReserved: true,
        active: true,
      },
      orderBy: { name: "asc" },
    });

    return products;
  }),

  create: ownerProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      const paymentExpiresAt = new Date(
        Date.now() + PAYMENT_RESERVATION_MINUTES * 60 * 1000,
      );

      try {
        const order = await ctx.db.$transaction(async (tx) => {
          const customer = await tx.customer.findUnique({
            where: { id: input.customerId },
          });

          if (!customer) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Customer not found.",
            });
          }

          const product = await tx.product.findUnique({
            where: { id: input.productId },
          });

          if (!product) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Product not found.",
            });
          }

          const availableStock = product.stockOnHand - product.stockReserved;
          if (availableStock < input.quantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Insufficient stock available.",
            });
          }

          const listPriceCents = product.priceCents;
          const unitPriceCents = calculateUnitPriceCents(
            listPriceCents,
            product.discountPercent,
          );
          const lineTotalCents = unitPriceCents * input.quantity;
          const subtotalCents = listPriceCents * input.quantity;
          const discountCents = subtotalCents - lineTotalCents;
          const totalCents = lineTotalCents + input.shippingCents;
          const orderNumber = await allocateOrderNumber(tx);

          const created = await tx.order.create({
            data: {
              orderNumber,
              customerId: customer.id,
              customerSalutation: customer.salutation,
              customerFirstName: customer.firstName,
              customerLastName: customer.lastName,
              customerEmail: customer.email,
              paymentExpiresAt,
              subtotalCents,
              shippingCents: input.shippingCents,
              discountCents,
              totalCents,
              currencyCode: "CHF",
              shippingSalutation: input.shippingSalutation,
              shippingFirstName: input.shippingFirstName,
              shippingLastName: input.shippingLastName,
              shippingCompany: input.shippingCompany,
              shippingStreetLine1: input.shippingStreetLine1,
              shippingStreetLine2: input.shippingStreetLine2,
              shippingPostalCode: input.shippingPostalCode,
              shippingCity: input.shippingCity,
              shippingCountryCode: input.shippingCountryCode.toUpperCase(),
              shippingPhone: input.shippingPhone,
              billingSameAsShipping: true,
              billingSalutation: input.shippingSalutation,
              billingFirstName: input.shippingFirstName,
              billingLastName: input.shippingLastName,
              billingCompany: input.shippingCompany,
              billingStreetLine1: input.shippingStreetLine1,
              billingStreetLine2: input.shippingStreetLine2,
              billingPostalCode: input.shippingPostalCode,
              billingCity: input.shippingCity,
              billingCountryCode: input.shippingCountryCode.toUpperCase(),
              billingPhone: input.shippingPhone,
              lines: {
                create: {
                  productId: product.id,
                  productName: product.name,
                  productSku: product.sku,
                  quantity: input.quantity,
                  listPriceCents,
                  discountPercent: product.discountPercent,
                  unitPriceCents,
                  unitCostCents: product.costCents,
                  lineTotalCents,
                },
              },
            },
            include: orderListInclude,
          });

          await tx.product.update({
            where: { id: product.id },
            data: {
              stockReserved: { increment: input.quantity },
            },
          });

          return created;
        });

        return mapOrderRow(order);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Order number conflict. Please try again.",
          });
        }

        throw error;
      }
    }),
});
