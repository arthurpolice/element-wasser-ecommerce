import { z } from 'zod'

import {
  type OrderPaymentStatus,
  type OrderStatus,
  type Prisma,
  Salutation
} from '../../../../generated/prisma/client'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure
} from '~/server/api/trpc'
import {
  OrderPlacementError,
  type PlaceOrderInput
} from '~/server/commerce/order-placement'
import { verifyOrderAccessToken } from '~/server/commerce/order-access-token'
import {
  beginCheckoutPayment,
  beginGuestCheckoutPayment,
  CheckoutPaymentError,
  retryCheckoutPayment
} from '~/server/commerce/checkout-payment'
import { guestCheckoutFingerprint } from '~/server/commerce/guest-checkout-abuse'
import {
  normalizeOrderQuoteLines,
  quoteOrderLines,
  type OrderQuoteProblemCode
} from '~/lib/order-quote'
import { reconcileStripePayment } from '~/server/commerce/payment-outcome'

export const checkoutShippingCents = 900
const checkoutCurrencyCode = 'CHF'
type CheckoutPreviewProblemCode =
  | 'MISSING_PRODUCT'
  | 'INACTIVE_PRODUCT'
  | 'INSUFFICIENT_STOCK'

const previewInputSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(99)
      })
    )
    .max(99)
})

const paymentMethodSchema = z.enum(['CARD', 'TWINT'])

const addressInputSchema = z.object({
  salutation: z.nativeEnum(Salutation).optional(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  company: z.string().trim().optional(),
  streetLine1: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  countryCode: z.string().trim().min(2).max(2)
})

const shippingAddressInputSchema = addressInputSchema.extend({
  phone: z.string().trim().optional()
})

const placeOrderInputSchema = previewInputSchema
  .extend({
    checkoutSubmissionId: z
      .string()
      .uuid()
      .default(() => crypto.randomUUID()),
    paymentMethod: paymentMethodSchema,
    addressId: z.string().trim().min(1).optional(),
    locale: z.enum(['de', 'en']).default('de')
  })
  .merge(shippingAddressInputSchema)

const placeGuestOrderInputSchema = previewInputSchema
  .extend({
    checkoutSubmissionId: z
      .string()
      .uuid()
      .default(() => crypto.randomUUID()),
    email: z.string().trim().email(),
    paymentMethod: paymentMethodSchema,
    locale: z.enum(['de', 'en']).default('de')
  })
  .merge(shippingAddressInputSchema)

const orderConfirmationInputSchema = z.object({
  orderNumber: z.string().trim().min(1),
  accessToken: z.string().trim().min(1).optional()
})

const retryPaymentInputSchema = orderConfirmationInputSchema.extend({
  paymentMethod: paymentMethodSchema,
  locale: z.enum(['de', 'en']).default('de')
})

const checkoutProductInclude = {
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true, altText: true }
  }
} satisfies Prisma.ProductInclude

type CheckoutProduct = Prisma.ProductGetPayload<{
  include: typeof checkoutProductInclude
}>

const checkoutAddressSelect = {
  id: true,
  isMain: true,
  salutation: true,
  firstName: true,
  lastName: true,
  company: true,
  streetLine1: true,
  postalCode: true,
  city: true,
  countryCode: true
} satisfies Prisma.AddressSelect

function normalizeCountryCode(countryCode: string) {
  return countryCode.toUpperCase()
}

function canRetryPayment(order: {
  status: OrderStatus
  paymentStatus: OrderPaymentStatus
  paymentExpiresAt: Date | null
  paymentExpiryStartedAt: Date | null
}) {
  return (
    order.status !== 'CANCELLED' &&
    order.paymentStatus !== 'PAID' &&
    order.paymentExpiryStartedAt === null &&
    order.paymentExpiresAt !== null &&
    order.paymentExpiresAt.getTime() > Date.now()
  )
}

function toCheckoutPlacementTrpcError(error: OrderPlacementError): TRPCError {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
    case 'PRODUCT_NOT_FOUND':
    case 'ADDRESS_NOT_FOUND':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: error.message
      })
    case 'EMPTY_CART':
    case 'PRODUCT_INACTIVE':
    case 'INSUFFICIENT_STOCK':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message
      })
  }
}

function toCheckoutPaymentTrpcError(error: CheckoutPaymentError): TRPCError {
  switch (error.code) {
    case 'ORDER_NOT_FOUND':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: error.message
      })
    case 'ORDER_PAYMENT_NOT_RETRYABLE':
    case 'CHECKOUT_SUBMISSION_CONFLICT':
      return new TRPCError({
        code:
          error.code === 'CHECKOUT_SUBMISSION_CONFLICT'
            ? 'CONFLICT'
            : 'BAD_REQUEST',
        message: error.message
      })
    case 'PENDING_PAYMENT_NOT_FOUND':
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message
      })
    case 'GUEST_CHECKOUT_RATE_LIMITED':
      return new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: error.message
      })
  }
}

function toPlaceOrderInput(
  customerId: string,
  input: z.infer<typeof placeOrderInputSchema>
): PlaceOrderInput {
  return {
    customerId,
    lines: input.lines,
    paymentMethod: input.paymentMethod,
    shippingCents: checkoutShippingCents,
    addressId: input.addressId,
    shippingSalutation: input.salutation,
    shippingFirstName: input.firstName,
    shippingLastName: input.lastName,
    shippingCompany: input.company,
    shippingStreetLine1: input.streetLine1,
    shippingPostalCode: input.postalCode,
    shippingCity: input.city,
    shippingCountryCode: normalizeCountryCode(input.countryCode),
    shippingPhone: input.phone
  }
}

function toGuestOrderInput(
  input: z.infer<typeof placeGuestOrderInputSchema>
): Omit<PlaceOrderInput, 'customerId'> {
  return {
    lines: input.lines,
    paymentMethod: input.paymentMethod,
    shippingCents: checkoutShippingCents,
    shippingSalutation: input.salutation,
    shippingFirstName: input.firstName,
    shippingLastName: input.lastName,
    shippingCompany: input.company,
    shippingStreetLine1: input.streetLine1,
    shippingPostalCode: input.postalCode,
    shippingCity: input.city,
    shippingCountryCode: normalizeCountryCode(input.countryCode),
    shippingPhone: input.phone
  }
}

const checkoutPreviewProblemCodes = {
  MISSING_PRODUCT: 'MISSING_PRODUCT',
  INACTIVE_PRODUCT: 'INACTIVE_PRODUCT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK'
} satisfies Record<OrderQuoteProblemCode, CheckoutPreviewProblemCode>

export const checkoutRouter = createTRPCRouter({
  bootstrap: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      return { status: 'guest' as const }
    }

    const customer = await ctx.db.customer.findUnique({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        salutation: true,
        firstName: true,
        lastName: true,
        phone: true,
        addresses: {
          select: checkoutAddressSelect,
          orderBy: [{ isMain: 'desc' }, { updatedAt: 'desc' }]
        }
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
      customer
    }
  }),

  createAddress: protectedProcedure
    .input(addressInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { userId: ctx.session.user.id },
          select: {
            id: true,
            _count: { select: { addresses: true } }
          }
        })

        if (!customer) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Customer Onboarding is required.'
          })
        }

        const isMain = customer._count.addresses === 0

        if (isMain) {
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
            postalCode: input.postalCode,
            city: input.city,
            countryCode: normalizeCountryCode(input.countryCode),
            customerId: customer.id,
            isMain
          },
          select: checkoutAddressSelect
        })
      })
    ),

  orderConfirmation: publicProcedure
    .input(orderConfirmationInputSchema)
    .query(async ({ ctx, input }) => {
      const access = input.accessToken
        ? verifyOrderAccessToken(input.accessToken)
        : null
      const customer = ctx.session?.user
        ? await ctx.db.customer.findUnique({
            where: { userId: ctx.session.user.id },
            select: { id: true }
          })
        : null

      if (!customer && !access) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Order access is required.'
        })
      }

      const order = await ctx.db.order.findFirst({
        where: {
          orderNumber: input.orderNumber,
          OR: [
            ...(customer ? [{ customerId: customer.id }] : []),
            ...(access ? [{ id: access.orderId }] : [])
          ]
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          dispatchCarrier: true,
          trackingNumber: true,
          dispatchedAt: true,
          paymentExpiresAt: true,
          paymentExpiryStartedAt: true,
          totalCents: true,
          currencyCode: true,
          placedAt: true,
          shippingFirstName: true,
          shippingLastName: true,
          shippingStreetLine1: true,
          shippingStreetLine2: true,
          shippingPostalCode: true,
          shippingCity: true,
          shippingCountryCode: true,
          billingFirstName: true,
          billingLastName: true,
          billingStreetLine1: true,
          billingStreetLine2: true,
          billingPostalCode: true,
          billingCity: true,
          billingCountryCode: true,
          lines: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              productName: true,
              productSku: true,
              quantity: true,
              unitPriceCents: true,
              lineTotalCents: true
            }
          }
        }
      })

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Order not found.'
        })
      }

      return {
        ...order,
        canRetryPayment: canRetryPayment(order)
      }
    }),

  retryPayment: publicProcedure
    .input(retryPaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const access = input.accessToken
        ? verifyOrderAccessToken(input.accessToken)
        : null
      const customer = ctx.session?.user
        ? await ctx.db.customer.findUnique({
            where: { userId: ctx.session.user.id },
            select: { id: true }
          })
        : null

      if (!customer && !access) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Order access is required.'
        })
      }

      try {
        return await retryCheckoutPayment(ctx.db, {
          orderNumber: input.orderNumber,
          access: {
            customerId: customer?.id,
            accessToken: input.accessToken
          },
          paymentMethod: input.paymentMethod,
          locale: input.locale
        })
      } catch (error) {
        if (error instanceof CheckoutPaymentError) {
          throw toCheckoutPaymentTrpcError(error)
        }

        throw error
      }
    }),

  reconcilePayment: publicProcedure
    .input(orderConfirmationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const access = input.accessToken
        ? verifyOrderAccessToken(input.accessToken)
        : null
      const customer = ctx.session?.user
        ? await ctx.db.customer.findUnique({
            where: { userId: ctx.session.user.id },
            select: { id: true }
          })
        : null
      if (!customer && !access) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Order access is required.'
        })
      }

      const order = await ctx.db.order.findFirst({
        where: {
          orderNumber: input.orderNumber,
          OR: [
            ...(customer ? [{ customerId: customer.id }] : []),
            ...(access ? [{ id: access.orderId }] : [])
          ]
        },
        select: {
          payments: {
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true }
          }
        }
      })
      const payment = order?.payments[0]
      if (!payment) return { status: null }

      return {
        status: await reconcileStripePayment(ctx.db, payment.id)
      }
    }),

  placeOrder: protectedProcedure
    .input(placeOrderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const customer = await ctx.db.customer.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true }
      })

      if (!customer) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Customer Onboarding is required.'
        })
      }

      try {
        return await beginCheckoutPayment(
          ctx.db,
          toPlaceOrderInput(customer.id, input),
          input.locale,
          input.checkoutSubmissionId
        )
      } catch (error) {
        if (error instanceof OrderPlacementError) {
          throw toCheckoutPlacementTrpcError(error)
        }
        if (error instanceof CheckoutPaymentError) {
          throw toCheckoutPaymentTrpcError(error)
        }

        throw error
      }
    }),

  placeGuestOrder: publicProcedure
    .input(placeGuestOrderInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await beginGuestCheckoutPayment(ctx.db, {
          guestCustomer: {
            email: input.email,
            phone: input.phone,
            salutation: input.salutation,
            firstName: input.firstName,
            lastName: input.lastName
          },
          order: toGuestOrderInput(input),
          locale: input.locale,
          checkoutSubmissionId: input.checkoutSubmissionId,
          guestCheckoutFingerprint: guestCheckoutFingerprint(ctx.headers)
        })
      } catch (error) {
        if (error instanceof OrderPlacementError) {
          throw toCheckoutPlacementTrpcError(error)
        }
        if (error instanceof CheckoutPaymentError) {
          throw toCheckoutPaymentTrpcError(error)
        }

        throw error
      }
    }),

  preview: publicProcedure
    .input(previewInputSchema)
    .query(async ({ ctx, input }) => {
      const normalizedLines = normalizeOrderQuoteLines(input.lines, {
        maxQuantity: 99
      })

      if (normalizedLines.length === 0) {
        return {
          items: [],
          subtotalCents: 0,
          discountCents: 0,
          shippingCents: 0,
          totalCents: 0,
          currencyCode: checkoutCurrencyCode,
          canPlaceOrder: false
        }
      }

      const products: CheckoutProduct[] = await ctx.db.product.findMany({
        where: {
          id: { in: normalizedLines.map((line) => line.productId) }
        },
        include: checkoutProductInclude
      })

      const quote = quoteOrderLines(
        products,
        normalizedLines,
        checkoutShippingCents
      )
      const items = quote.lines.map((line) => {
        const product = line.product
        const problemCode = line.problemCode
          ? checkoutPreviewProblemCodes[line.problemCode]
          : null

        if (!product) {
          return {
            productId: line.productId,
            name: null,
            slug: null,
            quantity: line.quantity,
            unitPriceCents: 0,
            originalUnitPriceCents: 0,
            discountPercent: null,
            lineSubtotalCents: 0,
            lineDiscountCents: 0,
            lineTotalCents: 0,
            imageUrl: null,
            imageAlt: null,
            availableStock: 0,
            canPlaceLine: false,
            problemCode
          }
        }

        const primaryImage = product.images[0]

        return {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          originalUnitPriceCents: line.originalUnitPriceCents,
          discountPercent: line.discountPercent,
          lineSubtotalCents: line.lineSubtotalCents,
          lineDiscountCents: line.lineDiscountCents,
          lineTotalCents: line.lineTotalCents,
          imageUrl: primaryImage?.url ?? null,
          imageAlt: primaryImage?.altText ?? null,
          availableStock: line.availableStock,
          canPlaceLine: line.canPlaceLine,
          problemCode
        }
      })

      return {
        items,
        subtotalCents: quote.subtotalCents,
        discountCents: quote.discountCents,
        shippingCents: quote.shippingCents,
        totalCents: quote.totalCents,
        currencyCode: checkoutCurrencyCode,
        canPlaceOrder: quote.canPlaceOrder
      }
    })
})
