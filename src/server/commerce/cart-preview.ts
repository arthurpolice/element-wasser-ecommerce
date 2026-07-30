import { z } from 'zod'

import {
  type Prisma,
  type PrismaClient
} from '../../../generated/prisma/client'
import {
  normalizeOrderQuoteLines,
  quoteOrderLines,
  type OrderQuoteProblemCode
} from '~/lib/order-quote'

const cartCurrencyCode = 'CHF'

type CartPreviewLineProblemCode =
  | 'MISSING_PRODUCT'
  | 'INACTIVE_PRODUCT'
  | 'INSUFFICIENT_STOCK'
type CartPreviewProblemCode = CartPreviewLineProblemCode | 'OVER_WEIGHT_LIMIT'

export const cartPreviewInputSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(99)
      })
    )
    .max(99)
})

const cartPreviewProductInclude = {
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true, altText: true }
  }
} satisfies Prisma.ProductInclude

type CartPreviewProduct = Prisma.ProductGetPayload<{
  include: typeof cartPreviewProductInclude
}>

const cartPreviewProblemCodes = {
  MISSING_PRODUCT: 'MISSING_PRODUCT',
  INACTIVE_PRODUCT: 'INACTIVE_PRODUCT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  OVER_WEIGHT_LIMIT: 'OVER_WEIGHT_LIMIT'
} satisfies Record<OrderQuoteProblemCode, CartPreviewProblemCode>

export async function getCartPreview(
  db: Pick<PrismaClient, 'product'>,
  input: z.infer<typeof cartPreviewInputSchema>
) {
  const normalizedLines = normalizeOrderQuoteLines(input.lines, {
    maxQuantity: 99
  })

  if (normalizedLines.length === 0) {
    return {
      items: [],
      subtotalCents: 0,
      discountCents: 0,
      shippingCents: 0,
      shippingWeightGrams: 0,
      problemCode: null,
      totalCents: 0,
      currencyCode: cartCurrencyCode,
      canPlaceOrder: false
    }
  }

  const products: CartPreviewProduct[] = await db.product.findMany({
    where: {
      id: { in: normalizedLines.map((line) => line.productId) }
    },
    include: cartPreviewProductInclude
  })

  const quote = quoteOrderLines(products, normalizedLines)
  const orderProblemCode =
    quote.problems.find((problem) => problem.code === 'OVER_WEIGHT_LIMIT')
      ?.code ?? null
  const items = quote.lines.map((line) => {
    const product = line.product
    const problemCode = line.problemCode
      ? cartPreviewProblemCodes[line.problemCode]
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
    shippingWeightGrams: quote.shippingWeightGrams,
    problemCode: orderProblemCode
      ? cartPreviewProblemCodes[orderProblemCode]
      : null,
    totalCents: quote.totalCents,
    currencyCode: cartCurrencyCode,
    canPlaceOrder: quote.canPlaceOrder
  }
}
