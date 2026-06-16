import type {
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
  PrismaClient
} from '../../../generated/prisma'

import {
  buildPendingPayment,
  orderListInclude,
  placeOrder,
  type CheckoutPaymentMethod,
  type OrderListRow,
  type PlaceOrderInput
} from '~/server/commerce/order-placement'
import {
  createOrderAccessToken,
  hashOrderAccessToken
} from '~/server/commerce/order-access-token'
import { scheduleExpiredPaymentCleanup } from '~/server/commerce/payment-cleanup-queue'
import { startStripeCheckout } from '~/server/payments/stripe-checkout'

type CheckoutPaymentDb = Pick<
  PrismaClient,
  '$transaction' | 'customer' | 'order' | 'payment'
>

type CheckoutPaymentLocale = 'de' | 'en'

type CheckoutPaymentResult = {
  order: OrderListRow
  checkoutUrl: string
}

type GuestCustomerInput = {
  email: string
  salutation?: PlaceOrderInput['shippingSalutation']
  firstName: string
  lastName: string
}

type RetryPaymentAccess = {
  customerId?: string
  accessToken?: string
}

export type CheckoutPaymentErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_PAYMENT_NOT_RETRYABLE'
  | 'PENDING_PAYMENT_NOT_FOUND'

export class CheckoutPaymentError extends Error {
  constructor(
    readonly code: CheckoutPaymentErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'CheckoutPaymentError'
  }
}

function isRetryableOrder(order: {
  status: OrderStatus
  paymentStatus: OrderPaymentStatus
  paymentExpiresAt: Date | null
}) {
  return (
    order.status !== 'CANCELLED' &&
    order.paymentStatus !== 'PAID' &&
    order.paymentExpiresAt !== null &&
    order.paymentExpiresAt.getTime() > Date.now()
  )
}

async function startCheckoutForOrder({
  db,
  locale,
  order,
  orderAccessToken
}: {
  db: Pick<PrismaClient, 'payment'>
  locale: CheckoutPaymentLocale
  order: OrderListRow
  orderAccessToken?: string
}): Promise<CheckoutPaymentResult> {
  const payment = order.payments.find(
    (candidate) => candidate.status === 'PENDING'
  )

  if (!payment) {
    throw new CheckoutPaymentError(
      'PENDING_PAYMENT_NOT_FOUND',
      'Pending Payment was not created.'
    )
  }

  const checkout = await startStripeCheckout({
    order,
    locale,
    orderAccessToken
  })

  await db.payment.update({
    where: { id: payment.id },
    data: {
      stripeCheckoutSessionId: checkout.sessionId,
      ...(checkout.paymentIntentId
        ? { providerReference: checkout.paymentIntentId }
        : {})
    }
  })
  await scheduleExpiredPaymentCleanup({
    paymentExpiresAt: order.paymentExpiresAt
  })

  return {
    order,
    checkoutUrl: checkout.url
  }
}

export async function beginCheckoutPayment(
  db: CheckoutPaymentDb,
  input: PlaceOrderInput,
  locale: CheckoutPaymentLocale
) {
  const order = await placeOrder(db, input)

  return startCheckoutForOrder({
    db,
    order,
    locale
  })
}

export async function beginGuestCheckoutPayment(
  db: CheckoutPaymentDb,
  input: {
    guestCustomer: GuestCustomerInput
    order: Omit<PlaceOrderInput, 'customerId'>
    locale: CheckoutPaymentLocale
  }
) {
  const orderAccessToken = createOrderAccessToken()
  const guestAccessTokenHash = hashOrderAccessToken(orderAccessToken)
  const customer = await db.customer.create({
    data: input.guestCustomer,
    select: { id: true }
  })
  const placedOrder = await placeOrder(db, {
    ...input.order,
    customerId: customer.id
  })
  const order = await db.order.update({
    where: { id: placedOrder.id },
    data: { guestAccessTokenHash },
    include: orderListInclude
  })

  return startCheckoutForOrder({
    db,
    order,
    locale: input.locale,
    orderAccessToken
  })
}

export async function retryCheckoutPayment(
  db: CheckoutPaymentDb,
  input: {
    orderNumber: string
    access: RetryPaymentAccess
    paymentMethod: CheckoutPaymentMethod
    locale: CheckoutPaymentLocale
  }
) {
  const accessTokenHash = input.access.accessToken
    ? hashOrderAccessToken(input.access.accessToken)
    : null
  const orderWhere: Prisma.OrderWhereInput = {
    orderNumber: input.orderNumber,
    OR: [
      ...(input.access.customerId
        ? [{ customerId: input.access.customerId }]
        : []),
      ...(accessTokenHash ? [{ guestAccessTokenHash: accessTokenHash }] : [])
    ]
  }

  const order = await db.$transaction(async (tx) => {
    const existingOrder = await tx.order.findFirst({
      where: orderWhere,
      include: orderListInclude
    })

    if (!existingOrder) {
      throw new CheckoutPaymentError('ORDER_NOT_FOUND', 'Order not found.')
    }

    if (!isRetryableOrder(existingOrder)) {
      throw new CheckoutPaymentError(
        'ORDER_PAYMENT_NOT_RETRYABLE',
        'Order payment can no longer be retried.'
      )
    }

    await tx.payment.create({
      data: {
        orderId: existingOrder.id,
        ...buildPendingPayment(input.paymentMethod, existingOrder.totalCents)
      }
    })

    return tx.order.update({
      where: { id: existingOrder.id },
      data: { paymentStatus: 'PENDING' },
      include: orderListInclude
    })
  })

  return startCheckoutForOrder({
    db,
    order,
    locale: input.locale,
    orderAccessToken: input.access.accessToken
  })
}
