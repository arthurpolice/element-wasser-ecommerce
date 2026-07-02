import { Salutation, type Prisma } from '../../../../generated/prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
  createTRPCRouter,
  ownerProcedure,
  protectedProcedure
} from '~/server/api/trpc'
import { isPrismaErrorCode } from '~/server/prisma-errors'

const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z
    .enum(['name', 'email', 'createdAt', 'orderCount'])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc')
})

const createInputSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  salutation: z.nativeEnum(Salutation).optional()
})

const completeOnboardingInputSchema = createInputSchema

const updateContactInputSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  salutation: z.nativeEnum(Salutation).optional()
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
  isMain: z.boolean().default(false)
})

const updateAddressInputSchema = addressInputSchema.extend({
  id: z.string().min(1)
})

const addressIdInputSchema = z.object({
  id: z.string().min(1)
})

const myOrdersInputSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(20)
})

const myOrderDetailsInputSchema = z.object({
  orderId: z.string().min(1)
})

function buildSearchFilter(
  search: string | undefined
): Prisma.CustomerWhereInput | undefined {
  if (!search) {
    return undefined
  }

  return {
    OR: [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } }
    ]
  }
}

function buildOrderBy(
  sortBy: z.infer<typeof listInputSchema>['sortBy'],
  sortDir: z.infer<typeof listInputSchema>['sortDir']
):
  | Prisma.CustomerOrderByWithRelationInput
  | Prisma.CustomerOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'name':
      return [{ lastName: sortDir }, { firstName: sortDir }]
    case 'email':
      return { email: sortDir }
    case 'orderCount':
      return { orders: { _count: sortDir } }
    case 'createdAt':
    default:
      return { createdAt: sortDir }
  }
}

type CustomerAggregate = {
  nonCancelledOrderValueCents: number
  latestOrderAt: Date | null
}

function mapCustomerRow(
  customer: Prisma.CustomerGetPayload<{
    include: {
      user: { select: { id: true } }
      _count: { select: { orders: true } }
    }
  }>,
  aggregate: CustomerAggregate
) {
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
    nonCancelledOrderValueCents: aggregate.nonCancelledOrderValueCents,
    latestOrderAt: aggregate.latestOrderAt
  }
}

const customerAreaOrderSummarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  dispatchCarrier: true,
  trackingNumber: true,
  dispatchedAt: true,
  currencyCode: true,
  totalCents: true,
  placedAt: true,
  lines: {
    select: {
      id: true,
      productName: true,
      productSku: true,
      quantity: true,
      product: {
        select: {
          images: {
            select: {
              url: true,
              altText: true
            },
            orderBy: { sortOrder: 'asc' as const },
            take: 1
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' as const }
  }
} satisfies Prisma.OrderSelect

const customerAreaOrderDetailSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  dispatchCarrier: true,
  trackingNumber: true,
  dispatchedAt: true,
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
      product: {
        select: {
          images: {
            select: {
              url: true,
              altText: true
            },
            orderBy: { sortOrder: 'asc' as const },
            take: 1
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' as const }
  }
} satisfies Prisma.OrderSelect

async function getRegisteredCustomerOrThrow(
  db: Prisma.TransactionClient,
  userId: string
) {
  const customer = await db.customer.findUnique({
    where: { userId },
    select: { id: true }
  })

  if (!customer) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Customer Onboarding is required.'
    })
  }

  return customer
}

function normalizeCountryCode(countryCode: string) {
  return countryCode.toUpperCase()
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
            phone: true
          },
          orderBy: [{ isMain: 'desc' }, { updatedAt: 'desc' }]
        },
        _count: { select: { orders: true } }
      }
    })

    if (!customer) {
      return {
        status: 'needs-onboarding' as const,
        user: {
          id: ctx.session.user.id,
          email: ctx.session.user.email,
          name: ctx.session.user.name
        }
      }
    }

    return {
      status: 'registered' as const,
      customer: {
        id: customer.id,
        email: customer.email,
        salutation: customer.salutation,
        firstName: customer.firstName,
        lastName: customer.lastName,
        addresses: customer.addresses,
        orderCount: customer._count.orders
      }
    }
  }),

  myOrders: protectedProcedure
    .input(myOrdersInputSchema)
    .query(async ({ ctx, input }) => {
      const customer = await getRegisteredCustomerOrThrow(
        ctx.db,
        ctx.session.user.id
      )
      const orders = await ctx.db.order.findMany({
        where: { customerId: customer.id },
        select: customerAreaOrderSummarySelect,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        take: input.limit + 1
      })
      const hasNextPage = orders.length > input.limit
      const items = orders.slice(0, input.limit)

      return {
        items,
        nextCursor: hasNextPage ? items.at(-1)?.id : undefined
      }
    }),

  myOrderDetails: protectedProcedure
    .input(myOrderDetailsInputSchema)
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.order.findFirst({
        where: {
          id: input.orderId,
          customer: { userId: ctx.session.user.id }
        },
        select: customerAreaOrderDetailSelect
      })

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }

      return order
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
            user: { connect: { id: ctx.session.user.id } }
          },
          select: {
            id: true,
            email: true,
            salutation: true,
            firstName: true,
            lastName: true,
            userId: true
          }
        })
      } catch (error) {
        if (isPrismaErrorCode(error, 'P2002')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A customer with this email already exists.'
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
            ctx.session.user.id
          )

          await tx.user.update({
            where: { id: ctx.session.user.id },
            data: {
              name: `${input.firstName} ${input.lastName}`
            }
          })

          return tx.customer.update({
            where: { id: customer.id },
            data: {
              firstName: input.firstName,
              lastName: input.lastName,
              salutation: input.salutation
            },
            select: {
              id: true,
              email: true,
              salutation: true,
              firstName: true,
              lastName: true
            }
          })
        })
      } catch (error) {
        if (isPrismaErrorCode(error, 'P2002')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A customer with this email already exists.'
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
          ctx.session.user.id
        )

        if (input.isMain) {
          await tx.address.updateMany({
            where: { customerId: customer.id, isMain: true },
            data: { isMain: false }
          })
        }

        return tx.address.create({
          data: {
            salutation: input.salutation,
            firstName: input.firstName,
            lastName: input.lastName,
            company: input.company,
            streetLine1: input.streetLine1,
            streetLine2: input.streetLine2,
            postalCode: input.postalCode,
            city: input.city,
            countryCode: normalizeCountryCode(input.countryCode),
            phone: input.phone,
            isMain: input.isMain,
            customerId: customer.id
          }
        })
      })
    ),

  updateAddress: protectedProcedure
    .input(updateAddressInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const customer = await getRegisteredCustomerOrThrow(
          tx,
          ctx.session.user.id
        )
        const existing = await tx.address.findFirst({
          where: { id: input.id, customerId: customer.id },
          select: { id: true }
        })

        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND' })
        }

        if (input.isMain) {
          await tx.address.updateMany({
            where: {
              customerId: customer.id,
              isMain: true,
              id: { not: input.id }
            },
            data: { isMain: false }
          })
        }

        return tx.address.update({
          where: { id: input.id },
          data: {
            salutation: input.salutation,
            firstName: input.firstName,
            lastName: input.lastName,
            company: input.company,
            streetLine1: input.streetLine1,
            streetLine2: input.streetLine2,
            postalCode: input.postalCode,
            city: input.city,
            countryCode: normalizeCountryCode(input.countryCode),
            phone: input.phone,
            isMain: input.isMain
          }
        })
      })
    ),

  deleteAddress: protectedProcedure
    .input(addressIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const customer = await getRegisteredCustomerOrThrow(
        ctx.db,
        ctx.session.user.id
      )

      const deleted = await ctx.db.address.deleteMany({
        where: { id: input.id, customerId: customer.id }
      })

      if (deleted.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND' })
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
              customer: { is: { userId: ctx.session.user.id } }
            },
            data: { isMain: true }
          })

          await tx.address.updateMany({
            where: {
              id: { not: input.id },
              customer: { is: { userId: ctx.session.user.id } },
              isMain: true
            },
            data: { isMain: false }
          })

          return updated
        })
        .catch((error) => {
          if (isPrismaErrorCode(error, 'P2025')) {
            throw new TRPCError({ code: 'NOT_FOUND' })
          }

          throw error
        })
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
          _count: { select: { orders: true } }
        },
        orderBy,
        skip,
        take: input.pageSize
      })
    ])
    const customerIds = customers.map((customer) => customer.id)
    const [valueAggregates, latestAggregates] = customerIds.length
      ? await Promise.all([
          ctx.db.order.groupBy({
            by: ['customerId'],
            where: {
              customerId: { in: customerIds },
              status: { not: 'CANCELLED' }
            },
            _sum: { totalCents: true }
          }),
          ctx.db.order.groupBy({
            by: ['customerId'],
            where: { customerId: { in: customerIds } },
            _max: { placedAt: true }
          })
        ])
      : [[], []]
    const valueByCustomerId = new Map(
      valueAggregates.map((aggregate) => [
        aggregate.customerId,
        aggregate._sum.totalCents ?? 0
      ])
    )
    const latestByCustomerId = new Map(
      latestAggregates.map((aggregate) => [
        aggregate.customerId,
        aggregate._max.placedAt
      ])
    )

    return {
      items: customers.map((customer) =>
        mapCustomerRow(customer, {
          nonCancelledOrderValueCents: valueByCustomerId.get(customer.id) ?? 0,
          latestOrderAt: latestByCustomerId.get(customer.id) ?? null
        })
      ),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize))
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
            salutation: input.salutation
          },
          include: {
            user: { select: { id: true } },
            _count: { select: { orders: true } }
          }
        })

        return mapCustomerRow(customer, {
          nonCancelledOrderValueCents: 0,
          latestOrderAt: null
        })
      } catch (error) {
        if (isPrismaErrorCode(error, 'P2002')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A customer with this email already exists.'
          })
        }

        throw error
      }
    })
})
