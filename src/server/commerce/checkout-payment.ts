import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { createHash } from 'node:crypto'

import {
  buildPendingPayment,
  orderListInclude,
  placeOrder,
  placeOrderInTransaction,
  type CheckoutPaymentMethod,
  type OrderListRow,
  type PlaceOrderInput
} from '~/server/commerce/order-placement'
import {
  createOrderAccessToken,
  getOrderAccessExpiry,
  verifyOrderAccessToken
} from '~/server/commerce/order-access-token'
import { publishEmailNotificationSafely } from '~/server/commerce/email-notifications'
import { orderEmailNotificationKey } from '~/server/commerce/email-notification-key'
import { MAX_OPEN_GUEST_ORDERS_PER_FINGERPRINT } from '~/server/commerce/guest-checkout-abuse'
import { projectOrderPaymentStatus } from '~/server/commerce/payment-outcome'
import {
  expireStripeCheckoutSession,
  retrieveStripeCheckoutSession,
  startStripeCheckout
} from '~/server/payments/stripe-checkout'
import { isPrismaErrorCode } from '~/server/prisma-errors'

type CheckoutPaymentDb = Pick<
  PrismaClient,
  '$transaction' | 'customer' | 'order' | 'payment' | 'emailNotification'
>

type CheckoutPaymentLocale = 'de' | 'en'

type CheckoutPaymentResult = {
  order: OrderListRow
  checkoutUrl: string
}

type GuestCustomerInput = {
  email: string
  phone?: string
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
  | 'CHECKOUT_SUBMISSION_CONFLICT'
  | 'GUEST_CHECKOUT_RATE_LIMITED'

export class CheckoutPaymentError extends Error {
  constructor(
    readonly code: CheckoutPaymentErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'CheckoutPaymentError'
  }
}

function checkoutSubmissionFingerprint(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify({ version: 1, value }))
    .digest('hex')
}

function normalizedSubmissionInput(
  input:
    | Omit<
        PlaceOrderInput,
        'checkoutSubmissionId' | 'checkoutSubmissionFingerprint'
      >
    | Omit<
        PlaceOrderInput,
        'customerId' | 'checkoutSubmissionId' | 'checkoutSubmissionFingerprint'
      >
) {
  return {
    ...input,
    lines: input.lines
      ?.map((line) => ({ ...line }))
      .sort((left, right) => left.productId.localeCompare(right.productId))
  }
}

async function findSubmittedOrder(
  db: Pick<PrismaClient, 'order'>,
  checkoutSubmissionId: string,
  fingerprint: string
) {
  const order = await db.order.findUnique({
    where: { checkoutSubmissionId },
    include: orderListInclude
  })

  if (order && order.checkoutSubmissionFingerprint !== fingerprint) {
    throw new CheckoutPaymentError(
      'CHECKOUT_SUBMISSION_CONFLICT',
      'Checkout Submission was already used with different details.'
    )
  }

  return order
}

async function placeSubmittedOrder(
  db: CheckoutPaymentDb,
  input: PlaceOrderInput,
  checkoutSubmissionId: string,
  fingerprint: string
) {
  try {
    return await placeOrder(db, {
      ...input,
      checkoutSubmissionId,
      checkoutSubmissionFingerprint: fingerprint
    })
  } catch (error) {
    if (!isPrismaErrorCode(error, 'P2002')) throw error
    const existing = await findSubmittedOrder(
      db,
      checkoutSubmissionId,
      fingerprint
    )
    if (existing) return existing
    throw error
  }
}

async function startCheckoutForOrder({
  db,
  locale,
  order,
  orderAccessToken
}: {
  db: Pick<PrismaClient, '$transaction' | 'payment' | 'emailNotification'>
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

  if (payment.stripeCheckoutSessionId) {
    const existing = await retrieveStripeCheckoutSession(
      payment.stripeCheckoutSessionId
    )
    if (existing.status === 'open' && existing.url) {
      return { order, checkoutUrl: existing.url }
    }
  }

  const checkout = await startStripeCheckout({
    order,
    locale,
    orderAccessToken
  })

  const emailNotification = await db.$transaction(
    async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          stripeCheckoutSessionId: checkout.sessionId,
          ...(checkout.paymentIntentId
            ? { providerReference: checkout.paymentIntentId }
            : {})
        }
      })
      await tx.order.update({
        where: { id: order.id },
        data: { paymentExpiresAt: checkout.expiresAt }
      })

      if (order.origin !== 'STOREFRONT') return null

      return tx.emailNotification.upsert({
        where: {
          deduplicationKey: orderEmailNotificationKey({
            orderId: order.id,
            type: 'ORDER_PLACED',
            recipientEmail: order.customerEmail
          })
        },
        create: {
          deduplicationKey: orderEmailNotificationKey({
            orderId: order.id,
            type: 'ORDER_PLACED',
            recipientEmail: order.customerEmail
          }),
          orderId: order.id,
          type: 'ORDER_PLACED',
          recipientEmail: order.customerEmail,
          accessExpiresAt: order.customer?.userId
            ? null
            : getOrderAccessExpiry()
        },
        update: {}
      })
    },
    { timeout: 10000 }
  )

  if (emailNotification)
    void publishEmailNotificationSafely(emailNotification.id)

  return {
    order,
    checkoutUrl: checkout.url
  }
}

export async function beginCheckoutPayment(
  db: CheckoutPaymentDb,
  input: PlaceOrderInput,
  locale: CheckoutPaymentLocale,
  checkoutSubmissionId: string
) {
  const normalized = normalizedSubmissionInput({
    ...input,
    origin: 'STOREFRONT'
  }) as Omit<
    PlaceOrderInput,
    'checkoutSubmissionId' | 'checkoutSubmissionFingerprint'
  >
  const fingerprint = checkoutSubmissionFingerprint(normalized)
  const existing = await findSubmittedOrder(
    db,
    checkoutSubmissionId,
    fingerprint
  )
  const order =
    existing ??
    (await placeSubmittedOrder(
      db,
      normalized,
      checkoutSubmissionId,
      fingerprint
    ))

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
    checkoutSubmissionId: string
    guestCheckoutFingerprint: string
  }
) {
  const normalized = normalizedSubmissionInput({
    ...input.order,
    origin: 'STOREFRONT'
  })
  const fingerprint = checkoutSubmissionFingerprint({
    guestCustomer: input.guestCustomer,
    order: normalized
  })
  const existing = await findSubmittedOrder(
    db,
    input.checkoutSubmissionId,
    fingerprint
  )
  if (existing) {
    return startCheckoutForOrder({
      db,
      order: existing,
      locale: input.locale,
      orderAccessToken: createOrderAccessToken(existing.id)
    })
  }

  let placedOrder: OrderListRow
  try {
    placedOrder = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${input.guestCheckoutFingerprint}, 0)
          )
        `
        const openOrderCount = await tx.order.count({
          where: {
            guestCheckoutFingerprint: input.guestCheckoutFingerprint,
            status: 'PLACED',
            paymentStatus: { not: 'PAID' },
            paymentExpiresAt: { gt: new Date() }
          }
        })
        if (openOrderCount >= MAX_OPEN_GUEST_ORDERS_PER_FINGERPRINT) {
          throw new CheckoutPaymentError(
            'GUEST_CHECKOUT_RATE_LIMITED',
            'Too many open Guest Orders. Complete or wait for an existing Order before trying again.'
          )
        }

        const customer = await tx.customer.create({
          data: input.guestCustomer,
          select: { id: true }
        })

        return placeOrderInTransaction(tx, {
          ...normalized,
          customerId: customer.id,
          checkoutSubmissionId: input.checkoutSubmissionId,
          checkoutSubmissionFingerprint: fingerprint,
          guestCheckoutFingerprint: input.guestCheckoutFingerprint
        })
      },
      { timeout: 10000 }
    )
  } catch (error) {
    if (!isPrismaErrorCode(error, 'P2002')) throw error
    const submittedOrder = await findSubmittedOrder(
      db,
      input.checkoutSubmissionId,
      fingerprint
    )
    if (!submittedOrder) throw error
    placedOrder = submittedOrder
  }
  const orderAccessToken = createOrderAccessToken(placedOrder.id)

  return startCheckoutForOrder({
    db,
    order: placedOrder,
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
  const now = new Date(Date.now())
  const access = input.access.accessToken
    ? verifyOrderAccessToken(input.access.accessToken)
    : null
  const orderWhere: Prisma.OrderWhereInput = {
    orderNumber: input.orderNumber,
    OR: [
      ...(input.access.customerId
        ? [{ customerId: input.access.customerId }]
        : []),
      ...(access ? [{ id: access.orderId }] : [])
    ]
  }

  const existingOrder = await db.order.findFirst({
    where: orderWhere,
    include: orderListInclude
  })

  if (!existingOrder) {
    throw new CheckoutPaymentError('ORDER_NOT_FOUND', 'Order not found.')
  }
  if (
    existingOrder.status === 'CANCELLED' ||
    existingOrder.paymentExpiresAt === null ||
    existingOrder.paymentExpiresAt.getTime() <= now.getTime() ||
    existingOrder.paymentExpiryStartedAt
  ) {
    throw new CheckoutPaymentError(
      'ORDER_PAYMENT_NOT_RETRYABLE',
      'Order payment can no longer be retried.'
    )
  }

  const activePayment = existingOrder.payments.find(
    (payment) => payment.status === 'PENDING'
  )
  if (
    activePayment?.paymentMethod === input.paymentMethod &&
    !activePayment.stripeCheckoutSessionId
  ) {
    return startCheckoutForOrder({
      db,
      order: existingOrder,
      locale: input.locale,
      orderAccessToken: input.access.accessToken
    })
  }
  if (
    activePayment?.paymentMethod === input.paymentMethod &&
    activePayment.stripeCheckoutSessionId
  ) {
    const session = await retrieveStripeCheckoutSession(
      activePayment.stripeCheckoutSessionId
    )
    if (session.payment_status === 'paid') {
      throw new CheckoutPaymentError(
        'ORDER_PAYMENT_NOT_RETRYABLE',
        'Payment has already succeeded.'
      )
    }
    if (session.status === 'open' && session.url) {
      return { order: existingOrder, checkoutUrl: session.url }
    }
  }

  if (activePayment?.stripeCheckoutSessionId) {
    const session = await retrieveStripeCheckoutSession(
      activePayment.stripeCheckoutSessionId
    )
    if (session.payment_status === 'paid' || session.status === 'complete') {
      throw new CheckoutPaymentError(
        'ORDER_PAYMENT_NOT_RETRYABLE',
        'Payment is already completing.'
      )
    }
    if (session.status === 'open') {
      await expireStripeCheckoutSession(activePayment.stripeCheckoutSessionId)
    }
  }

  const order = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Order"
      WHERE "id" = ${existingOrder.id}
      FOR UPDATE
    `
    const lockedOrder = await tx.order.findFirst({
      where: orderWhere,
      include: orderListInclude
    })

    if (!lockedOrder) {
      throw new CheckoutPaymentError('ORDER_NOT_FOUND', 'Order not found.')
    }

    if (
      lockedOrder.status === 'CANCELLED' ||
      lockedOrder.paymentStatus === 'PAID' ||
      lockedOrder.paymentExpiryStartedAt ||
      !lockedOrder.paymentExpiresAt ||
      lockedOrder.paymentExpiresAt.getTime() <= now.getTime()
    ) {
      throw new CheckoutPaymentError(
        'ORDER_PAYMENT_NOT_RETRYABLE',
        'Order payment can no longer be retried.'
      )
    }

    const lockedActivePayment = lockedOrder.payments.find(
      (payment) => payment.status === 'PENDING'
    )
    if (lockedActivePayment && !lockedActivePayment.stripeCheckoutSessionId) {
      throw new CheckoutPaymentError(
        'ORDER_PAYMENT_NOT_RETRYABLE',
        'A Payment attempt is already being started.'
      )
    }

    await tx.payment.updateMany({
      where: { orderId: lockedOrder.id, status: 'PENDING' },
      data: { status: 'CANCELLED', failureReason: 'Payment attempt replaced.' }
    })

    await tx.payment.create({
      data: {
        orderId: existingOrder.id,
        ...buildPendingPayment(input.paymentMethod, lockedOrder.totalCents)
      }
    })

    await projectOrderPaymentStatus(tx, lockedOrder.id, now)
    return tx.order.update({
      where: { id: lockedOrder.id },
      data: {},
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
