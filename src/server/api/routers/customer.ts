import { Prisma, Salutation } from "../../../../generated/prisma"
import { TRPCError } from "@trpc/server"
import { z } from "zod"

import {
  createTRPCRouter,
  ownerProcedure,
  protectedProcedure,
} from "~/server/api/trpc"

const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z
    .enum(["name", "email", "createdAt", "orderCount"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
})

const createInputSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  salutation: z.nativeEnum(Salutation).optional(),
})

const completeOnboardingInputSchema = createInputSchema

const updateContactInputSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  salutation: z.nativeEnum(Salutation).optional(),
})

const addressInputSchema = z.object({
  salutation: z.nativeEnum(Salutation).optional(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  company: z.string().trim().optional(),
  streetLine1: z.string().trim().min(1),
  streetLine2: z.string().trim().optional(),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  countryCode: z.string().trim().min(2).max(2),
  phone: z.string().trim().optional(),
  isMain: z.boolean().default(false),
})

const updateAddressInputSchema = addressInputSchema.extend({
  id: z.string().min(1),
})

const addressIdInputSchema = z.object({
  id: z.string().min(1),
})

function buildSearchFilter(
  search: string | undefined,
): Prisma.CustomerWhereInput | undefined {
  if (!search) {
    return undefined
  }

  return {
    OR: [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ],
  }
}

function buildOrderBy(
  sortBy: z.infer<typeof listInputSchema>["sortBy"],
  sortDir: z.infer<typeof listInputSchema>["sortDir"],
): Prisma.CustomerOrderByWithRelationInput | Prisma.CustomerOrderByWithRelationInput[] {
  switch (sortBy) {
    case "name":
      return [{ lastName: sortDir }, { firstName: sortDir }]
    case "email":
      return { email: sortDir }
    case "orderCount":
      return { orders: { _count: sortDir } }
    case "createdAt":
    default:
      return { createdAt: sortDir }
  }
}

function mapCustomerRow(
  customer: Prisma.CustomerGetPayload<{
    include: {
      user: { select: { id: true } }
      _count: { select: { orders: true } }
      orders: {
        select: { totalCents: true; placedAt: true; status: true }
      }
    }
  }>,
) {
  const activeOrders = customer.orders.filter(
    (order) => order.status !== "CANCELLED",
  )
  const totalSpentCents = activeOrders.reduce(
    (sum, order) => sum + order.totalCents,
    0,
  )
  const latestOrderAt = activeOrders.reduce<Date | null>((latest, order) => {
    if (!latest || order.placedAt > latest) {
      return order.placedAt
    }
    return latest
  }, null)

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
  }
}

const customerAreaOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  currencyCode: true,
  subtotalCents: true,
  shippingCents: true,
  discountCents: true,
  totalCents: true,
  customerSalutation: true,
  customerFirstName: true,
  customerLastName: true,
  customerEmail: true,
  shippingSalutation: true,
  shippingFirstName: true,
  shippingLastName: true,
  shippingCompany: true,
  shippingStreetLine1: true,
  shippingStreetLine2: true,
  shippingPostalCode: true,
  shippingCity: true,
  shippingCountryCode: true,
  shippingPhone: true,
  billingSameAsShipping: true,
  billingSalutation: true,
  billingFirstName: true,
  billingLastName: true,
  billingCompany: true,
  billingStreetLine1: true,
  billingStreetLine2: true,
  billingPostalCode: true,
  billingCity: true,
  billingCountryCode: true,
  billingPhone: true,
  placedAt: true,
  lines: {
    select: {
      id: true,
      productName: true,
      productSku: true,
      quantity: true,
      listPriceCents: true,
      discountPercent: true,
      unitPriceCents: true,
      lineTotalCents: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.OrderSelect

async function getRegisteredCustomerOrThrow(
  db: Prisma.TransactionClient,
  userId: string,
) {
  const customer = await db.customer.findUnique({
    where: { userId },
    select: { id: true },
  })

  if (!customer) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Customer Onboarding is required.",
    })
  }

  return customer
}

function normalizeAddressInput(input: z.infer<typeof addressInputSchema>) {
  return {
    salutation: input.salutation,
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
    streetLine1: input.streetLine1,
    streetLine2: input.streetLine2,
    postalCode: input.postalCode,
    city: input.city,
    countryCode: input.countryCode.toUpperCase(),
    phone: input.phone,
    isMain: input.isMain,
  }
}

export const customerRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const customer = await ctx.db.customer.findUnique({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        salutation: true,
        firstName: true,
        lastName: true,
        addresses: {
          select: {
            id: true,
            isMain: true,
            salutation: true,
            firstName: true,
            lastName: true,
            company: true,
            streetLine1: true,
            streetLine2: true,
            postalCode: true,
            city: true,
            countryCode: true,
            phone: true,
          },
          orderBy: [{ isMain: "desc" }, { updatedAt: "desc" }],
        },
        orders: {
          select: customerAreaOrderSelect,
          orderBy: { placedAt: "desc" },
        },
      },
    })

    if (!customer) {
      return {
        status: "needs-onboarding" as const,
        user: {
          id: ctx.session.user.id,
          email: ctx.session.user.email,
          name: ctx.session.user.name,
        },
      }
    }

    return {
      status: "registered" as const,
      customer,
    }
  }),

  completeOnboarding: protectedProcedure
    .input(completeOnboardingInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.customer.create({
          data: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            salutation: input.salutation,
            user: { connect: { id: ctx.session.user.id } },
          },
          select: {
            id: true,
            email: true,
            salutation: true,
            firstName: true,
            lastName: true,
            userId: true,
          },
        })
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A customer with this email already exists.",
          })
        }

        throw error
      }
    }),

  updateContact: protectedProcedure
    .input(updateContactInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.$transaction(async (tx) => {
          const customer = await getRegisteredCustomerOrThrow(
            tx,
            ctx.session.user.id,
          )

          await tx.user.update({
            where: { id: ctx.session.user.id },
            data: {
              name: `${input.firstName} ${input.lastName}`,
            },
          })

          return tx.customer.update({
            where: { id: customer.id },
            data: {
              firstName: input.firstName,
              lastName: input.lastName,
              salutation: input.salutation,
            },
            select: {
              id: true,
              email: true,
              salutation: true,
              firstName: true,
              lastName: true,
            },
          })
        })
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A customer with this email already exists.",
          })
        }

        throw error
      }
    }),

  createAddress: protectedProcedure
    .input(addressInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const customer = await getRegisteredCustomerOrThrow(
          tx,
          ctx.session.user.id,
        )

        if (input.isMain) {
          await tx.address.updateMany({
            where: { customerId: customer.id, isMain: true },
            data: { isMain: false },
          })
        }

        return tx.address.create({
          data: {
            ...normalizeAddressInput(input),
            customerId: customer.id,
          },
        })
      }),
    ),

  updateAddress: protectedProcedure
    .input(updateAddressInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const customer = await getRegisteredCustomerOrThrow(
          tx,
          ctx.session.user.id,
        )
        const existing = await tx.address.findFirst({
          where: { id: input.id, customerId: customer.id },
          select: { id: true },
        })

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND" })
        }

        if (input.isMain) {
          await tx.address.updateMany({
            where: {
              customerId: customer.id,
              isMain: true,
              id: { not: input.id },
            },
            data: { isMain: false },
          })
        }

        return tx.address.update({
          where: { id: input.id },
          data: normalizeAddressInput(input),
        })
      }),
    ),

  deleteAddress: protectedProcedure
    .input(addressIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const customer = await getRegisteredCustomerOrThrow(
        ctx.db,
        ctx.session.user.id,
      )

      const deleted = await ctx.db.address.deleteMany({
        where: { id: input.id, customerId: customer.id },
      })

      if (deleted.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND" })
      }

      return { id: input.id }
    }),

  setMainAddress: protectedProcedure
    .input(addressIdInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db
        .$transaction(async (tx) => {
          const updated = await tx.address.update({
            where: {
              id: input.id,
              customer: { is: { userId: ctx.session.user.id } },
            },
            data: { isMain: true },
          })

          await tx.address.updateMany({
            where: {
              id: { not: input.id },
              customer: { is: { userId: ctx.session.user.id } },
              isMain: true,
            },
            data: { isMain: false },
          })

          return updated
        })
        .catch((error) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
          ) {
            throw new TRPCError({ code: "NOT_FOUND" })
          }

          throw error
        }),
    ),

  list: ownerProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const where = buildSearchFilter(input.search)
    const orderBy = buildOrderBy(input.sortBy, input.sortDir)
    const skip = (input.page - 1) * input.pageSize

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
    ])

    return {
      items: customers.map(mapCustomerRow),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
    }
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
        })

        return mapCustomerRow(customer)
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A customer with this email already exists.",
          })
        }

        throw error
      }
    }),
})
