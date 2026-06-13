import type {
  PaymentProvider,
  PaymentType,
  Prisma,
  PrismaClient,
  Salutation
} from '../../../generated/prisma'

export const PAYMENT_RESERVATION_MINUTES = 15

export const orderListInclude = {
  payments: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      provider: true,
      status: true,
      amountCents: true,
      currencyCode: true,
      providerReference: true,
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
type OrderLineSnapshot = ReturnType<typeof buildOrderLineSnapshot>

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

function calculateUnitPriceCents(
  listPriceCents: number,
  discountPercent: number | null
): number {
  if (!discountPercent) {
    return listPriceCents
  }

  return Math.round((listPriceCents * (100 - discountPercent)) / 100)
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

function assertStockAvailable(product: ProductSnapshot, quantity: number) {
  const availableStock = product.stockOnHand - product.stockReserved
  if (availableStock < quantity) {
    throw new OrderPlacementError(
      'INSUFFICIENT_STOCK',
      'Insufficient stock available.'
    )
  }
}

function normalizeOrderLines(input: PlaceOrderInput): PlaceOrderLineInput[] {
  const rawLines =
    input.lines ??
    (input.productId && input.quantity
      ? [{ productId: input.productId, quantity: input.quantity }]
      : [])
  const quantitiesByProductId = new Map<string, number>()

  for (const line of rawLines) {
    const productId = line.productId.trim()

    if (!productId || line.quantity < 1) {
      continue
    }

    quantitiesByProductId.set(
      productId,
      (quantitiesByProductId.get(productId) ?? 0) + line.quantity
    )
  }

  const lines = Array.from(quantitiesByProductId.entries()).map(
    ([productId, quantity]) => ({ productId, quantity })
  )

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

function buildOrderLineSnapshot(product: ProductSnapshot, quantity: number) {
  const listPriceCents = product.priceCents
  const unitPriceCents = calculateUnitPriceCents(
    listPriceCents,
    product.discountPercent
  )

  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    quantity,
    listPriceCents,
    discountPercent: product.discountPercent,
    unitPriceCents,
    unitCostCents: product.costCents,
    lineTotalCents: unitPriceCents * quantity
  }
}

function buildOrderTotals(lines: OrderLineSnapshot[], shippingCents: number) {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.listPriceCents * line.quantity,
    0
  )
  const lineTotalCents = lines.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0
  )
  const discountCents = subtotalCents - lineTotalCents
  const totalCents = lineTotalCents + shippingCents

  return { subtotalCents, discountCents, totalCents }
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function mapPaymentProvider(
  _paymentMethod: CheckoutPaymentMethod
): PaymentProvider {
  return 'STRIPE'
}

function buildPendingPayment(
  paymentMethod: CheckoutPaymentMethod,
  amountCents: number
): {
  type: PaymentType
  provider: PaymentProvider
  amountCents: number
  currencyCode: string
} {
  return {
    type: 'CHARGE',
    provider: mapPaymentProvider(paymentMethod),
    amountCents,
    currencyCode: 'CHF'
  }
}

export async function placeOrder(
  db: Pick<PrismaClient, '$transaction'>,
  input: PlaceOrderInput,
  deps: OrderPlacementDeps = {}
): Promise<OrderListRow> {
  const now = deps.now?.() ?? new Date()
  const paymentExpiresAt = addMinutes(now, PAYMENT_RESERVATION_MINUTES)

  return db.$transaction(async (tx) => {
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
    const productsById = new Map(
      products.map((product) => [product.id, product])
    )

    for (const line of requestedLines) {
      const product = productsById.get(line.productId)

      if (!product) {
        throw new OrderPlacementError('PRODUCT_NOT_FOUND', 'Product not found.')
      }

      if (!product.active) {
        throw new OrderPlacementError(
          'PRODUCT_INACTIVE',
          'Product is not active.'
        )
      }

      assertStockAvailable(product, line.quantity)
    }

    for (const line of requestedLines) {
      const product = productsById.get(line.productId)

      if (!product) {
        throw new OrderPlacementError('PRODUCT_NOT_FOUND', 'Product not found.')
      }

      const reservation = await tx.product.updateMany({
        where: {
          id: product.id,
          stockOnHand: { gte: line.quantity },
          stockReserved: { lte: product.stockOnHand - line.quantity }
        },
        data: {
          stockReserved: { increment: line.quantity }
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
    const shippingSnapshot = await resolveShippingSnapshot(
      tx,
      input,
      customer.id
    )
    const orderLines = requestedLines.map((line) => {
      const product = productsById.get(line.productId)

      if (!product) {
        throw new OrderPlacementError('PRODUCT_NOT_FOUND', 'Product not found.')
      }

      return buildOrderLineSnapshot(product, line.quantity)
    })
    const totals = buildOrderTotals(orderLines, input.shippingCents)
    const snapshotCountryCode = shippingSnapshot.countryCode.toUpperCase()
    const pendingPayment = input.paymentMethod
      ? buildPendingPayment(input.paymentMethod, totals.totalCents)
      : undefined

    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        customerSalutation: customer.salutation,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerEmail: customer.email,
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

    return created
  })
}
