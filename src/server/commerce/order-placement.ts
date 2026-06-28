import type {
  PaymentProvider,
  PaymentType,
  PaymentMethod,
  Prisma,
  PrismaClient,
  Salutation
} from '../../../generated/prisma/client'
import {
  normalizeOrderQuoteLines,
  quoteOrderLines,
  type OrderQuoteProblemCode
} from '~/lib/order-quote'

export const PROVISIONAL_PAYMENT_RESERVATION_MINUTES = 10

export const orderListInclude = {
  customer: {
    select: { userId: true }
  },
  lines: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      productId: true,
      productName: true,
      productSku: true,
      quantity: true,
      listPriceCents: true,
      discountPercent: true,
      unitPriceCents: true,
      lineTotalCents: true
    }
  },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      type: true,
      provider: true,
      paymentMethod: true,
      status: true,
      amountCents: true,
      currencyCode: true,
      providerReference: true,
      stripeCheckoutSessionId: true,
      createdAt: true
    }
  }
} satisfies Prisma.OrderInclude

export type OrderListRow = Prisma.OrderGetPayload<{
  include: typeof orderListInclude
}>

export type PlaceOrderInput = {
  customerId: string
  lines?: PlaceOrderLineInput[]
  productId?: string
  quantity?: number
  paymentMethod?: CheckoutPaymentMethod
  shippingCents: number
  addressId?: string
  shippingSalutation?: Salutation
  shippingFirstName: string
  shippingLastName: string
  shippingCompany?: string
  shippingStreetLine1: string
  shippingStreetLine2?: string
  shippingPostalCode: string
  shippingCity: string
  shippingCountryCode: string
  shippingPhone?: string
  origin?: 'STOREFRONT' | 'OWNER_DASHBOARD'
  checkoutSubmissionId?: string
  checkoutSubmissionFingerprint?: string
  guestCheckoutFingerprint?: string
}

export type PlaceOrderLineInput = {
  productId: string
  quantity: number
}

export type CheckoutPaymentMethod = 'CARD' | 'TWINT'

export type OrderPlacementErrorCode =
  | 'CUSTOMER_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_INACTIVE'
  | 'INSUFFICIENT_STOCK'
  | 'ADDRESS_NOT_FOUND'
  | 'EMPTY_CART'

export class OrderPlacementError extends Error {
  constructor(
    readonly code: OrderPlacementErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'OrderPlacementError'
  }
}

type OrderPlacementDeps = {
  now?: () => Date
}

type ProductSnapshot = Prisma.ProductGetPayload<object>
type AddressSnapshot = Prisma.AddressGetPayload<object>

type ShippingSnapshot = {
  salutation: AddressSnapshot['salutation'] | undefined
  firstName: string
  lastName: string
  company: string | null | undefined
  streetLine1: string
  streetLine2: string | null | undefined
  postalCode: string
  city: string
  countryCode: string
  phone: string | null | undefined
}

function formatOrderNumber(year: number, sequence: number): string {
  return `EW-${year}-${String(sequence).padStart(5, '0')}`
}

async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<string> {
  const year = now.getFullYear()
  const sequence = await tx.orderNumberSequence.upsert({
    where: { year },
    create: { year, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true }
  })

  return formatOrderNumber(year, sequence.nextNumber - 1)
}

function normalizeOrderLines(input: PlaceOrderInput): PlaceOrderLineInput[] {
  const rawLines =
    input.lines ??
    (input.productId && input.quantity
      ? [{ productId: input.productId, quantity: input.quantity }]
      : [])
  const lines = normalizeOrderQuoteLines(rawLines)

  if (lines.length === 0) {
    throw new OrderPlacementError('EMPTY_CART', 'Cart is empty.')
  }

  return lines
}

function snapshotAddressBookEntry(address: AddressSnapshot): ShippingSnapshot {
  return {
    salutation: address.salutation,
    firstName: address.firstName,
    lastName: address.lastName,
    company: address.company,
    streetLine1: address.streetLine1,
    streetLine2: address.streetLine2,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: address.countryCode,
    phone: address.phone
  }
}

function snapshotManualShipping(input: PlaceOrderInput): ShippingSnapshot {
  return {
    salutation: input.shippingSalutation ?? null,
    firstName: input.shippingFirstName,
    lastName: input.shippingLastName,
    company: input.shippingCompany,
    streetLine1: input.shippingStreetLine1,
    streetLine2: input.shippingStreetLine2,
    postalCode: input.shippingPostalCode,
    city: input.shippingCity,
    countryCode: input.shippingCountryCode,
    phone: input.shippingPhone
  }
}

async function resolveShippingSnapshot(
  tx: Prisma.TransactionClient,
  input: PlaceOrderInput,
  customerId: string
): Promise<ShippingSnapshot> {
  if (!input.addressId) {
    return snapshotManualShipping(input)
  }

  const address = await tx.address.findFirst({
    where: { id: input.addressId, customerId }
  })

  if (!address) {
    throw new OrderPlacementError(
      'ADDRESS_NOT_FOUND',
      'Address Book Entry not found.'
    )
  }

  return snapshotAddressBookEntry(address)
}

function buildOrderLineSnapshot(
  product: ProductSnapshot,
  quantity: number,
  unitPriceCents: number,
  lineTotalCents: number
) {
  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    quantity,
    listPriceCents: product.priceCents,
    discountPercent: product.discountPercent,
    unitPriceCents,
    unitCostCents: product.costCents,
    lineTotalCents
  }
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function toOrderPlacementError(problemCode: OrderQuoteProblemCode) {
  switch (problemCode) {
    case 'MISSING_PRODUCT':
      return new OrderPlacementError('PRODUCT_NOT_FOUND', 'Product not found.')
    case 'INACTIVE_PRODUCT':
      return new OrderPlacementError(
        'PRODUCT_INACTIVE',
        'Product is not active.'
      )
    case 'INSUFFICIENT_STOCK':
      return new OrderPlacementError(
        'INSUFFICIENT_STOCK',
        'Insufficient stock available.'
      )
  }
}

export function buildPendingPayment(
  paymentMethod: CheckoutPaymentMethod,
  amountCents: number
): {
  type: PaymentType
  provider: PaymentProvider
  paymentMethod: PaymentMethod
  amountCents: number
  currencyCode: string
} {
  return {
    type: 'CHARGE',
    provider: 'STRIPE',
    paymentMethod,
    amountCents,
    currencyCode: 'CHF'
  }
}

export async function placeOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: PlaceOrderInput,
  deps: OrderPlacementDeps = {}
): Promise<OrderListRow> {
  const now = deps.now?.() ?? new Date()
  const paymentExpiresAt = addMinutes(
    now,
    PROVISIONAL_PAYMENT_RESERVATION_MINUTES
  )

  const requestedLines = normalizeOrderLines(input)
  const customer = await tx.customer.findUnique({
    where: { id: input.customerId }
  })

  if (!customer) {
    throw new OrderPlacementError('CUSTOMER_NOT_FOUND', 'Customer not found.')
  }

  const products = await tx.product.findMany({
    where: { id: { in: requestedLines.map((line) => line.productId) } }
  })
  const quote = quoteOrderLines(products, requestedLines, input.shippingCents)
  const firstProblem = quote.problems[0]

  if (firstProblem) {
    throw toOrderPlacementError(firstProblem.code)
  }

  for (const quotedLine of quote.lines) {
    const product = quotedLine.product

    if (!product) {
      throw new OrderPlacementError('PRODUCT_NOT_FOUND', 'Product not found.')
    }

    const reservation = await tx.product.updateMany({
      where: {
        id: product.id,
        stockOnHand: { gte: quotedLine.quantity },
        stockReserved: { lte: product.stockOnHand - quotedLine.quantity }
      },
      data: {
        stockReserved: { increment: quotedLine.quantity }
      }
    })

    if (reservation.count !== 1) {
      throw new OrderPlacementError(
        'INSUFFICIENT_STOCK',
        'Insufficient stock available.'
      )
    }
  }

  const orderNumber = await allocateOrderNumber(tx, now)
  const shippingSnapshot = await resolveShippingSnapshot(tx, input, customer.id)
  const orderLines = quote.lines.map((line) => {
    const product = line.product

    if (!product) {
      throw new OrderPlacementError('PRODUCT_NOT_FOUND', 'Product not found.')
    }

    return buildOrderLineSnapshot(
      product,
      line.quantity,
      line.unitPriceCents,
      line.lineTotalCents
    )
  })
  const totals = {
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents
  }
  const snapshotCountryCode = shippingSnapshot.countryCode.toUpperCase()
  const pendingPayment = input.paymentMethod
    ? buildPendingPayment(input.paymentMethod, totals.totalCents)
    : undefined

  return tx.order.create({
    data: {
      orderNumber,
      customerId: customer.id,
      customerSalutation: customer.salutation,
      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerEmail: customer.email,
      origin: input.origin ?? 'OWNER_DASHBOARD',
      checkoutSubmissionId: input.checkoutSubmissionId,
      checkoutSubmissionFingerprint: input.checkoutSubmissionFingerprint,
      guestCheckoutFingerprint: input.guestCheckoutFingerprint,
      paymentExpiresAt,
      subtotalCents: totals.subtotalCents,
      shippingCents: input.shippingCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      currencyCode: 'CHF',
      shippingSalutation: shippingSnapshot.salutation,
      shippingFirstName: shippingSnapshot.firstName,
      shippingLastName: shippingSnapshot.lastName,
      shippingCompany: shippingSnapshot.company,
      shippingStreetLine1: shippingSnapshot.streetLine1,
      shippingStreetLine2: shippingSnapshot.streetLine2,
      shippingPostalCode: shippingSnapshot.postalCode,
      shippingCity: shippingSnapshot.city,
      shippingCountryCode: snapshotCountryCode,
      shippingPhone: shippingSnapshot.phone,
      billingSameAsShipping: true,
      billingSalutation: shippingSnapshot.salutation,
      billingFirstName: shippingSnapshot.firstName,
      billingLastName: shippingSnapshot.lastName,
      billingCompany: shippingSnapshot.company,
      billingStreetLine1: shippingSnapshot.streetLine1,
      billingStreetLine2: shippingSnapshot.streetLine2,
      billingPostalCode: shippingSnapshot.postalCode,
      billingCity: shippingSnapshot.city,
      billingCountryCode: snapshotCountryCode,
      billingPhone: shippingSnapshot.phone,
      lines: {
        create: orderLines
      },
      ...(pendingPayment
        ? {
            payments: {
              create: pendingPayment
            }
          }
        : {})
    },
    include: orderListInclude
  })
}

export async function placeOrder(
  db: Pick<PrismaClient, '$transaction'>,
  input: PlaceOrderInput,
  deps: OrderPlacementDeps = {}
): Promise<OrderListRow> {
  return db.$transaction((tx) => placeOrderInTransaction(tx, input, deps), {
    timeout: 10000
  })
}
