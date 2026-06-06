import { Prisma, Salutation } from '../../../../generated/prisma'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { createTRPCRouter, ownerProcedure } from '~/server/api/trpc'
import {
  OrderPlacementError,
  orderListInclude,
  placeOrder,
  type OrderListRow
} from '~/server/commerce/order-placement'
import {
  OrderLifecycleError,
  cancelOrder,
  expirePendingPaymentOrders,
  fulfillOrder
} from '~/server/commerce/order-lifecycle'

const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z
    .enum([
      'orderNumber',
      'customerName',
      'customerEmail',
      'status',
      'paymentStatus',
      'fulfillmentStatus',
      'totalCents',
      'placedAt',
      'shippingCity',
      'shippingCountryCode'
    ])
    .default('placedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc')
})

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
  shippingPhone: z.string().trim().optional()
})

const createInputSchema = z
  .object({
    customerId: z.string().min(1),
    productId: z.string().min(1),
    quantity: z.number().int().min(1),
    shippingCents: z.number().int().min(0),
    addressId: z.string().min(1).optional()
  })
  .merge(shippingSnapshotSchema)

const orderIdInputSchema = z.object({
  orderId: z.string().min(1)
})

function buildSearchFilter(
  search: string | undefined
): Prisma.OrderWhereInput | undefined {
  if (!search) {
    return undefined
  }

  return {
    OR: [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { customerEmail: { contains: search, mode: 'insensitive' } },
      { customerFirstName: { contains: search, mode: 'insensitive' } },
      { customerLastName: { contains: search, mode: 'insensitive' } },
      { shippingCity: { contains: search, mode: 'insensitive' } },
      { shippingCountryCode: { contains: search, mode: 'insensitive' } }
    ]
  }
}

function buildOrderBy(
  sortBy: z.infer<typeof listInputSchema>['sortBy'],
  sortDir: z.infer<typeof listInputSchema>['sortDir']
):
  | Prisma.OrderOrderByWithRelationInput
  | Prisma.OrderOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'orderNumber':
      return { orderNumber: sortDir }
    case 'customerName':
      return [{ customerLastName: sortDir }, { customerFirstName: sortDir }]
    case 'customerEmail':
      return { customerEmail: sortDir }
    case 'status':
      return { status: sortDir }
    case 'paymentStatus':
      return { paymentStatus: sortDir }
    case 'fulfillmentStatus':
      return { fulfillmentStatus: sortDir }
    case 'totalCents':
      return { totalCents: sortDir }
    case 'shippingCity':
      return { shippingCity: sortDir }
    case 'shippingCountryCode':
      return { shippingCountryCode: sortDir }
    case 'placedAt':
    default:
      return { placedAt: sortDir }
  }
}

function mapOrderRow(order: OrderListRow) {
  const latestPayment = order.payments[0] ?? null

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
    latestPayment
  }
}

function toOrderPlacementTrpcError(error: OrderPlacementError): TRPCError {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
    case 'PRODUCT_NOT_FOUND':
    case 'ADDRESS_NOT_FOUND':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: error.message
      })
    case 'INSUFFICIENT_STOCK':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message
      })
  }
}

function toOrderLifecycleTrpcError(error: OrderLifecycleError): TRPCError {
  switch (error.code) {
    case 'ORDER_NOT_FOUND':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: error.message
      })
    case 'ORDER_ALREADY_FULFILLED':
    case 'ORDER_PAYMENT_NOT_PAID':
    case 'ORDER_CANCELLED':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message
      })
  }
}

export const orderRouter = createTRPCRouter({
  list: ownerProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const where = buildSearchFilter(input.search)
    const orderBy = buildOrderBy(input.sortBy, input.sortDir)
    const skip = (input.page - 1) * input.pageSize

    const [totalCount, orders] = await ctx.db.$transaction([
      ctx.db.order.count({ where }),
      ctx.db.order.findMany({
        where,
        include: orderListInclude,
        orderBy,
        skip,
        take: input.pageSize
      })
    ])

    return {
      items: orders.map(mapOrderRow),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize))
    }
  }),

  listCustomersForCreate: ownerProcedure.query(async ({ ctx }) => {
    const customers = await ctx.db.customer.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        salutation: true,
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
        }
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
    })

    return customers
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
        active: true
      },
      orderBy: { name: 'asc' }
    })

    return products
  }),

  create: ownerProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const order = await placeOrder(ctx.db, input)
        return mapOrderRow(order)
      } catch (error) {
        if (error instanceof OrderPlacementError) {
          throw toOrderPlacementTrpcError(error)
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Order number conflict. Please try again.'
          })
        }

        throw error
      }
    }),

  cancel: ownerProcedure
    .input(orderIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const order = await cancelOrder(ctx.db, input)
        return mapOrderRow(order)
      } catch (error) {
        if (error instanceof OrderLifecycleError) {
          throw toOrderLifecycleTrpcError(error)
        }

        throw error
      }
    }),

  fulfill: ownerProcedure
    .input(orderIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const order = await fulfillOrder(ctx.db, input)
        return mapOrderRow(order)
      } catch (error) {
        if (error instanceof OrderLifecycleError) {
          throw toOrderLifecycleTrpcError(error)
        }

        throw error
      }
    }),

  expirePendingPayments: ownerProcedure.mutation(async ({ ctx }) => {
    const orders = await expirePendingPaymentOrders(ctx.db)
    return orders.map(mapOrderRow)
  })
})
