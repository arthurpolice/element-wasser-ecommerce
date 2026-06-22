import type { Prisma, PrismaClient } from '../../../generated/prisma'
import type Stripe from 'stripe'

import { env } from '~/env'
import { getOrderAccessExpiry } from '~/server/commerce/order-access-token'
import { publishEmailNotificationSafely } from '~/server/commerce/email-notifications'
import {
  orderEmailNotificationKey,
  paymentEmailNotificationKey
} from '~/server/commerce/email-notification-key'
import { retrieveStripeCheckoutSession } from '~/server/payments/stripe-checkout'

type PaymentOutcomeDb = Pick<PrismaClient, '$transaction' | 'payment'>

type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: { order: { include: { customer: { select: { userId: true } } } } }
}>

type PaymentOutcomeTx = Prisma.TransactionClient
type PaymentOutcomeDeps = {
  internalRecipient?: string
  now?: () => Date
}

function getStringMetadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string
) {
  const value = metadata?.[key]

  return value && value.trim().length > 0 ? value : null
}

function getPaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null | undefined
) {
  if (typeof paymentIntent === 'string') {
    return paymentIntent
  }

  return paymentIntent?.id ?? null
}

async function findPayment(
  tx: PaymentOutcomeTx,
  input: {
    paymentId?: string | null
    stripeCheckoutSessionId?: string | null
    providerReference?: string | null
  }
): Promise<PaymentWithOrder | null> {
  if (input.paymentId) {
    return tx.payment.findUnique({
      where: { id: input.paymentId },
      include: {
        order: { include: { customer: { select: { userId: true } } } }
      }
    })
  }

  if (input.stripeCheckoutSessionId) {
    return tx.payment.findFirst({
      where: { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
      include: {
        order: { include: { customer: { select: { userId: true } } } }
      }
    })
  }

  if (input.providerReference) {
    return tx.payment.findFirst({
      where: { provider: 'STRIPE', providerReference: input.providerReference },
      include: {
        order: { include: { customer: { select: { userId: true } } } }
      }
    })
  }

  return null
}

async function lockOrder(tx: PaymentOutcomeTx, orderId: string) {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Order"
    WHERE "id" = ${orderId}
    FOR UPDATE
  `
}

export async function projectOrderPaymentStatus(
  tx: PaymentOutcomeTx,
  orderId: string,
  now = new Date()
) {
  await lockOrder(tx, orderId)
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      paymentStatus: true,
      paymentExpiresAt: true,
      payments: {
        where: { type: 'CHARGE' },
        select: { status: true }
      }
    }
  })
  const statuses = (order.payments ?? []).map((payment) => payment.status)
  const paymentStatus = statuses.includes('CAPTURED')
    ? 'PAID'
    : statuses.includes('PENDING')
      ? 'PENDING'
      : order.status === 'CANCELLED' ||
          !order.paymentExpiresAt ||
          order.paymentExpiresAt.getTime() <= now.getTime()
        ? 'CANCELLED'
        : statuses.includes('FAILED')
          ? 'FAILED'
          : 'CANCELLED'

  if (paymentStatus !== order.paymentStatus) {
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus }
    })
  }

  return {
    previous: order.paymentStatus,
    current: paymentStatus
  }
}

async function markPaymentCaptured(
  tx: PaymentOutcomeTx,
  payment: PaymentWithOrder,
  input: {
    providerReference: string | null
    stripeCheckoutSessionId: string | null
  },
  deps: PaymentOutcomeDeps
) {
  await lockOrder(tx, payment.orderId)
  const currentOrder = await tx.order.findUniqueOrThrow({
    where: { id: payment.orderId },
    select: { status: true, paymentStatus: true }
  })

  if (payment.status !== 'CAPTURED') {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CAPTURED',
        providerReference: input.providerReference ?? payment.providerReference,
        stripeCheckoutSessionId:
          input.stripeCheckoutSessionId ?? payment.stripeCheckoutSessionId,
        failureReason: null
      }
    })
  }

  if (currentOrder.status === 'CANCELLED') {
    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus: 'PAID',
        paymentExpiryStartedAt: null,
        paymentExceptionAt: deps.now?.() ?? new Date(),
        paymentExceptionReason: 'CAPTURED_AFTER_ORDER_CANCELLATION'
      }
    })
    return []
  }

  const projection = await projectOrderPaymentStatus(
    tx,
    payment.orderId,
    deps.now?.() ?? new Date()
  )
  await tx.order.update({
    where: { id: payment.orderId },
    data: { paymentExpiryStartedAt: null }
  })
  const firstPaidTransition =
    projection.previous !== 'PAID' && projection.current === 'PAID'

  if (!firstPaidTransition || payment.order.origin !== 'STOREFRONT') return []

  const internalRecipient =
    deps.internalRecipient ?? env.EMAIL_INTERNAL_RECIPIENT
  if (!internalRecipient) {
    throw new Error('EMAIL_INTERNAL_RECIPIENT is not configured.')
  }

  const accessExpiresAt = payment.order.customer.userId
    ? null
    : getOrderAccessExpiry(deps.now?.() ?? new Date())
  const [customerNotification, merchantNotification] = await Promise.all([
    tx.emailNotification.upsert({
      where: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: payment.orderId,
          type: 'ORDER_PAYMENT_CONFIRMED',
          recipientEmail: payment.order.customerEmail
        })
      },
      create: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: payment.orderId,
          type: 'ORDER_PAYMENT_CONFIRMED',
          recipientEmail: payment.order.customerEmail
        }),
        orderId: payment.orderId,
        type: 'ORDER_PAYMENT_CONFIRMED',
        recipientEmail: payment.order.customerEmail,
        accessExpiresAt
      },
      update: {}
    }),
    tx.emailNotification.upsert({
      where: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: payment.orderId,
          type: 'NEW_PAID_ORDER',
          recipientEmail: internalRecipient
        })
      },
      create: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: payment.orderId,
          type: 'NEW_PAID_ORDER',
          recipientEmail: internalRecipient
        }),
        orderId: payment.orderId,
        type: 'NEW_PAID_ORDER',
        recipientEmail: internalRecipient
      },
      update: {}
    })
  ])

  return [customerNotification.id, merchantNotification.id]
}

async function markPaymentFailed(
  tx: PaymentOutcomeTx,
  payment: PaymentWithOrder,
  input: {
    status: 'FAILED' | 'CANCELLED'
    failureReason?: string | null
    providerReference?: string | null
  },
  deps: PaymentOutcomeDeps
) {
  await lockOrder(tx, payment.orderId)

  if (payment.status === 'CAPTURED' || payment.status === input.status) {
    return []
  }

  const now = deps.now?.() ?? new Date()
  const currentOrder = await tx.order.findUniqueOrThrow({
    where: { id: payment.orderId },
    select: {
      status: true,
      origin: true,
      paymentExpiresAt: true,
      paymentExpiryStartedAt: true
    }
  })
  const update = await tx.payment.updateMany({
    where: {
      id: payment.id,
      status: { not: 'CAPTURED' }
    },
    data: {
      status: input.status,
      failureReason: input.failureReason,
      providerReference: input.providerReference ?? payment.providerReference
    }
  })

  if (update.count === 0) {
    return []
  }

  await projectOrderPaymentStatus(tx, payment.orderId, now)

  const shouldNotify =
    input.status === 'FAILED' &&
    currentOrder.status === 'PLACED' &&
    currentOrder.origin === 'STOREFRONT' &&
    currentOrder.paymentExpiresAt !== null &&
    currentOrder.paymentExpiresAt.getTime() > now.getTime() &&
    currentOrder.paymentExpiryStartedAt === null

  if (!shouldNotify) return []

  const notification = await tx.emailNotification.upsert({
    where: {
      deduplicationKey: paymentEmailNotificationKey({
        paymentId: payment.id,
        type: 'PAYMENT_FAILED'
      })
    },
    create: {
      deduplicationKey: paymentEmailNotificationKey({
        paymentId: payment.id,
        type: 'PAYMENT_FAILED'
      }),
      orderId: payment.orderId,
      paymentId: payment.id,
      type: 'PAYMENT_FAILED',
      recipientEmail: payment.order.customerEmail,
      accessExpiresAt: payment.order.customer.userId
        ? null
        : getOrderAccessExpiry(now)
    },
    update: {}
  })

  return [notification.id]
}

async function handleCheckoutSessionCompleted(
  tx: PaymentOutcomeTx,
  session: Stripe.Checkout.Session,
  deps: PaymentOutcomeDeps
) {
  if (session.payment_status !== 'paid') {
    return []
  }

  const paymentIntentId = getPaymentIntentId(session.payment_intent)
  const payment = await findPayment(tx, {
    paymentId: getStringMetadataValue(session.metadata, 'paymentId'),
    stripeCheckoutSessionId: session.id
  })

  if (!payment) {
    return []
  }

  return markPaymentCaptured(
    tx,
    payment,
    {
      providerReference: paymentIntentId,
      stripeCheckoutSessionId: session.id
    },
    deps
  )
}

async function handleCheckoutSessionExpired(
  tx: PaymentOutcomeTx,
  session: Stripe.Checkout.Session,
  deps: PaymentOutcomeDeps
) {
  const payment = await findPayment(tx, {
    paymentId: getStringMetadataValue(session.metadata, 'paymentId'),
    stripeCheckoutSessionId: session.id
  })

  if (!payment) {
    return []
  }

  await markPaymentFailed(
    tx,
    payment,
    {
      status: 'CANCELLED',
      failureReason: 'Stripe Checkout Session expired.'
    },
    deps
  )
}

async function handlePaymentIntentFailed(
  tx: PaymentOutcomeTx,
  paymentIntent: Stripe.PaymentIntent,
  deps: PaymentOutcomeDeps
) {
  const payment = await findPayment(tx, {
    paymentId: getStringMetadataValue(paymentIntent.metadata, 'paymentId'),
    providerReference: paymentIntent.id
  })

  if (!payment) {
    return []
  }

  return markPaymentFailed(
    tx,
    payment,
    {
      status: 'FAILED',
      failureReason:
        paymentIntent.last_payment_error?.message ?? 'Stripe payment failed.',
      providerReference: paymentIntent.id
    },
    deps
  )
}

export async function handleStripeWebhookEvent(
  db: PaymentOutcomeDb,
  event: Stripe.Event,
  deps: PaymentOutcomeDeps = {}
) {
  const notificationIds = await db.$transaction(async (tx) => {
    switch (event.type) {
      case 'checkout.session.completed':
        return handleCheckoutSessionCompleted(tx, event.data.object, deps)
      case 'checkout.session.expired':
        await handleCheckoutSessionExpired(tx, event.data.object, deps)
        return []
      case 'payment_intent.payment_failed':
        return handlePaymentIntentFailed(tx, event.data.object, deps)
      default:
        return []
    }
  })

  for (const id of notificationIds) {
    void publishEmailNotificationSafely(id)
  }
}

export async function reconcileStripePayment(
  db: PaymentOutcomeDb,
  paymentId: string,
  deps: PaymentOutcomeDeps = {}
) {
  const current = await db.payment.findUnique({
    where: { id: paymentId },
    select: { stripeCheckoutSessionId: true, status: true }
  })
  if (!current?.stripeCheckoutSessionId || current.status !== 'PENDING') {
    return current?.status ?? null
  }

  const session = await retrieveStripeCheckoutSession(
    current.stripeCheckoutSessionId
  )
  const paymentIntent =
    typeof session.payment_intent === 'object' ? session.payment_intent : null

  const notificationIds = await db.$transaction(async (tx) => {
    const payment = await findPayment(tx, { paymentId })
    if (!payment) return []

    if (
      session.payment_status === 'paid' ||
      paymentIntent?.status === 'succeeded'
    ) {
      return markPaymentCaptured(
        tx,
        payment,
        {
          providerReference: paymentIntent?.id ?? null,
          stripeCheckoutSessionId: session.id
        },
        deps
      )
    }

    if (session.status === 'expired' || paymentIntent?.status === 'canceled') {
      await markPaymentFailed(
        tx,
        payment,
        {
          status: 'CANCELLED',
          failureReason: 'Stripe Checkout Session expired.',
          providerReference: paymentIntent?.id
        },
        deps
      )
      return []
    }

    if (
      paymentIntent?.status === 'requires_payment_method' &&
      paymentIntent.last_payment_error
    ) {
      return markPaymentFailed(
        tx,
        payment,
        {
          status: 'FAILED',
          failureReason: paymentIntent.last_payment_error.message,
          providerReference: paymentIntent.id
        },
        deps
      )
    }
    return []
  })

  for (const id of notificationIds) {
    void publishEmailNotificationSafely(id)
  }

  return db.payment
    .findUnique({ where: { id: paymentId }, select: { status: true } })
    .then((payment) => payment?.status ?? null)
}
