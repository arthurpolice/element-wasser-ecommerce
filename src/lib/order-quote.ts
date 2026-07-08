export type OrderQuoteLineInput = {
  productId: string
  quantity: number
}

export type OrderQuoteProduct = {
  id: string
  active: boolean
  priceCents: number
  discountPercent: number | null
  shippingWeightGrams: number | null
  stockOnHand: number
  stockReserved: number
}

export type OrderQuoteProblemCode =
  | 'MISSING_PRODUCT'
  | 'INACTIVE_PRODUCT'
  | 'INSUFFICIENT_STOCK'
  | 'OVER_WEIGHT_LIMIT'

export type OrderQuoteLine<Product extends OrderQuoteProduct> = {
  productId: string
  product: Product | null
  quantity: number
  unitPriceCents: number
  originalUnitPriceCents: number
  discountPercent: number | null
  lineSubtotalCents: number
  lineDiscountCents: number
  lineTotalCents: number
  lineShippingWeightGrams: number
  availableStock: number
  canPlaceLine: boolean
  problemCode: OrderQuoteProblemCode | null
}

export type OrderQuote<Product extends OrderQuoteProduct> = {
  lines: Array<OrderQuoteLine<Product>>
  subtotalCents: number
  discountCents: number
  lineTotalCents: number
  shippingWeightGrams: number
  shippingCents: number
  totalCents: number
  canPlaceOrder: boolean
  problems: Array<{
    productId: string
    quantity: number
    code: OrderQuoteProblemCode
  }>
}

const SHIPPING_RATE_TIERS = [
  { maxWeightGrams: 2000, shippingCents: 900 },
  { maxWeightGrams: 10000, shippingCents: 1200 },
  { maxWeightGrams: 30000, shippingCents: 2300 }
] as const

export function calculateUnitPriceCents(
  listPriceCents: number,
  discountPercent: number | null
): number {
  if (!discountPercent) {
    return listPriceCents
  }

  return Math.round((listPriceCents * (100 - discountPercent)) / 100)
}

export function calculateAvailableStock(product: {
  stockOnHand: number
  stockReserved: number
}): number {
  return product.stockOnHand - product.stockReserved
}

export function calculateShippingCentsForWeight(
  shippingWeightGrams: number
): number | null {
  return (
    SHIPPING_RATE_TIERS.find(
      (tier) => shippingWeightGrams <= tier.maxWeightGrams
    )?.shippingCents ?? null
  )
}

export function normalizeOrderQuoteLines(
  lines: OrderQuoteLineInput[],
  options: { maxQuantity?: number } = {}
): OrderQuoteLineInput[] {
  const quantitiesByProductId = new Map<string, number>()

  for (const line of lines) {
    const productId = line.productId.trim()

    if (!productId || line.quantity < 1) {
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
      quantity:
        options.maxQuantity != null
          ? Math.min(options.maxQuantity, quantity)
          : quantity
    })
  )
}

export function quoteOrderLines<Product extends OrderQuoteProduct>(
  products: Product[],
  lines: OrderQuoteLineInput[]
): OrderQuote<Product> {
  const productsById = new Map(products.map((product) => [product.id, product]))
  const quotedLines = lines.map((line) => {
    const product = productsById.get(line.productId) ?? null
    const problemCode = getProblemCode(product, line.quantity)

    if (!product) {
      return buildMissingProductLine(line, problemCode)
    }

    const unitPriceCents = calculateUnitPriceCents(
      product.priceCents,
      product.discountPercent
    )
    const availableStock = calculateAvailableStock(product)
    const canPlaceLine = problemCode === null
    const lineSubtotalCents = canPlaceLine
      ? product.priceCents * line.quantity
      : 0
    const lineTotalCents = canPlaceLine ? unitPriceCents * line.quantity : 0
    const lineShippingWeightGrams = canPlaceLine
      ? (product.shippingWeightGrams ?? 0) * line.quantity
      : 0

    return {
      productId: product.id,
      product,
      quantity: line.quantity,
      unitPriceCents,
      originalUnitPriceCents: product.priceCents,
      discountPercent: product.discountPercent,
      lineSubtotalCents,
      lineDiscountCents: lineSubtotalCents - lineTotalCents,
      lineTotalCents,
      lineShippingWeightGrams,
      availableStock,
      canPlaceLine,
      problemCode
    }
  })
  const subtotalCents = quotedLines.reduce(
    (sum, line) => sum + line.lineSubtotalCents,
    0
  )
  const discountCents = quotedLines.reduce(
    (sum, line) => sum + line.lineDiscountCents,
    0
  )
  const lineTotalCents = quotedLines.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0
  )
  const shippingWeightGrams = quotedLines.reduce(
    (sum, line) => sum + line.lineShippingWeightGrams,
    0
  )
  const canPlaceOrder =
    quotedLines.length > 0 && quotedLines.every((line) => line.canPlaceLine)
  const hasOrderableLines = quotedLines.some((line) => line.canPlaceLine)
  const calculatedShippingCents = hasOrderableLines
    ? calculateShippingCentsForWeight(shippingWeightGrams)
    : 0
  const overweightProblem =
    canPlaceOrder && calculatedShippingCents == null
      ? [
          {
            productId: '',
            quantity: 0,
            code: 'OVER_WEIGHT_LIMIT' as const
          }
        ]
      : []
  const appliedShippingCents = calculatedShippingCents ?? 0
  const problems = [
    ...quotedLines.flatMap((line) =>
      line.problemCode
        ? [
            {
              productId: line.productId,
              quantity: line.quantity,
              code: line.problemCode
            }
          ]
        : []
    ),
    ...overweightProblem
  ]

  return {
    lines: quotedLines,
    subtotalCents,
    discountCents,
    lineTotalCents,
    shippingWeightGrams,
    shippingCents: appliedShippingCents,
    totalCents: lineTotalCents + appliedShippingCents,
    canPlaceOrder: canPlaceOrder && overweightProblem.length === 0,
    problems
  }
}

function getProblemCode(
  product: OrderQuoteProduct | null,
  quantity: number
): OrderQuoteProblemCode | null {
  if (!product) {
    return 'MISSING_PRODUCT'
  }

  if (!product.active) {
    return 'INACTIVE_PRODUCT'
  }

  if (calculateAvailableStock(product) < quantity) {
    return 'INSUFFICIENT_STOCK'
  }

  return null
}

function buildMissingProductLine(
  line: OrderQuoteLineInput,
  problemCode: OrderQuoteProblemCode | null
) {
  return {
    productId: line.productId,
    product: null,
    quantity: line.quantity,
    unitPriceCents: 0,
    originalUnitPriceCents: 0,
    discountPercent: null,
    lineSubtotalCents: 0,
    lineDiscountCents: 0,
    lineTotalCents: 0,
    lineShippingWeightGrams: 0,
    availableStock: 0,
    canPlaceLine: false,
    problemCode
  }
}
