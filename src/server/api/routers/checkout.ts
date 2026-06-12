import { z } from 'zod'

import { type Prisma, Salutation } from '../../../../generated/prisma'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure
} from '~/server/api/trpc'
import {
  OrderPlacementError,
  placeOrder
} from '~/server/commerce/order-placement'

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
  streetLine2: z.string().trim().optional(),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  countryCode: z.string().trim().min(2).max(2),
  phone: z.string().trim().optional()
})

const placeOrderInputSchema = previewInputSchema
  .extend({
    paymentMethod: paymentMethodSchema,
    addressId: z.string().trim().min(1).optional()
  })
  .merge(addressInputSchema)

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
  streetLine2: true,
  postalCode: true,
  city: true,
  countryCode: true,
  phone: true
} satisfies Prisma.AddressSelect

function normalizeCountryCode(countryCode: string) {
  return countryCode.toUpperCase()
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

export function calculateDiscountedUnitPriceCents(
  priceCents: number,
  discountPercent: number | null
) {
  if (!discountPercent) {
    return priceCents
  }

  return Math.round(priceCents * (1 - discountPercent / 100))
}

function normalizePreviewLines(
  lines: Array<{ productId: string; quantity: number }>
) {
  const quantitiesByProductId = new Map<string, number>()

  for (const line of lines) {
    const productId = line.productId.trim()

    if (!productId) {
      continue
    }

    quantitiesByProductId.set(
      productId,
      (quantitiesByProductId.get(productId) ?? 0) + line.quantity
    )
  }

  return Array.from(quantitiesByProductId.entries()).map(
    ([productId, quantity]) => ({
      productId,
      quantity: Math.min(99, quantity)
    })
  )
}

function getPreviewProblemCode(
  product: CheckoutProduct | undefined,
  quantity: number
): CheckoutPreviewProblemCode | null {
  if (!product) {
    return 'MISSING_PRODUCT'
  }

  if (!product.active) {
    return 'INACTIVE_PRODUCT'
  }

  if (product.stockOnHand - product.stockReserved < quantity) {
    return 'INSUFFICIENT_STOCK'
  }

  return null
}

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
            streetLine2: input.streetLine2,
            postalCode: input.postalCode,
            city: input.city,
            countryCode: normalizeCountryCode(input.countryCode),
            phone: input.phone,
            customerId: customer.id,
            isMain
          },
          select: checkoutAddressSelect
        })
      })
    ),

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
        return await placeOrder(ctx.db, {
          customerId: customer.id,
          lines: input.lines,
          paymentMethod: input.paymentMethod,
          shippingCents: checkoutShippingCents,
          addressId: input.addressId,
          shippingSalutation: input.salutation,
          shippingFirstName: input.firstName,
          shippingLastName: input.lastName,
          shippingCompany: input.company,
          shippingStreetLine1: input.streetLine1,
          shippingStreetLine2: input.streetLine2,
          shippingPostalCode: input.postalCode,
          shippingCity: input.city,
          shippingCountryCode: normalizeCountryCode(input.countryCode),
          shippingPhone: input.phone
        })
      } catch (error) {
        if (error instanceof OrderPlacementError) {
          throw toCheckoutPlacementTrpcError(error)
        }

        throw error
      }
    }),

  preview: publicProcedure
    .input(previewInputSchema)
    .query(async ({ ctx, input }) => {
      const normalizedLines = normalizePreviewLines(input.lines)

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

      const productsById = new Map(
        products.map((product) => [product.id, product])
      )
      const items = normalizedLines.map((line) => {
        const product = productsById.get(line.productId)

        const problemCode = getPreviewProblemCode(product, line.quantity)

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

        const unitPriceCents = calculateDiscountedUnitPriceCents(
          product.priceCents,
          product.discountPercent
        )
        const availableStock = product.stockOnHand - product.stockReserved
        const primaryImage = product.images[0]
        const canPlaceLine = problemCode === null
        const lineSubtotalCents = canPlaceLine
          ? product.priceCents * line.quantity
          : 0
        const lineTotalCents = canPlaceLine ? unitPriceCents * line.quantity : 0

        return {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          quantity: line.quantity,
          unitPriceCents,
          originalUnitPriceCents: product.priceCents,
          discountPercent: product.discountPercent,
          lineSubtotalCents,
          lineDiscountCents: lineSubtotalCents - lineTotalCents,
          lineTotalCents,
          imageUrl: primaryImage?.url ?? null,
          imageAlt: primaryImage?.altText ?? null,
          availableStock,
          canPlaceLine,
          problemCode
        }
      })

      const subtotalCents = items.reduce(
        (sum, item) => sum + item.lineSubtotalCents,
        0
      )
      const discountCents = items.reduce(
        (sum, item) => sum + item.lineDiscountCents,
        0
      )
      const lineTotalCents = items.reduce(
        (sum, item) => sum + item.lineTotalCents,
        0
      )
      const canPlaceOrder =
        items.length > 0 && items.every((item) => item.canPlaceLine)
      const hasOrderableLines = items.some((item) => item.canPlaceLine)
      const shippingCents = hasOrderableLines ? checkoutShippingCents : 0

      return {
        items,
        subtotalCents,
        discountCents,
        shippingCents,
        totalCents: lineTotalCents + shippingCents,
        currencyCode: checkoutCurrencyCode,
        canPlaceOrder
      }
    })
})
