import 'server-only'

import type Stripe from 'stripe'

import type { Prisma, PrismaClient } from '../../../generated/prisma'

const stripePaymentSelect = {
  id: true,
  orderId: true,
  status: true,
  providerReference: true,
  order: {
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true
    }
  }
} satisfies Prisma.PaymentSelect

type StripePayment = Prisma.PaymentGetPayload<{
  select: typeof stripePaymentSelect
}>

type StripeWebhookDb = Pick<PrismaClient, '$transaction'>

export type StripeWebhookOutcome =
  | {
      action: 'captured' | 'cancelled' | 'failed'
      paymentId: string
      orderId: string
    }
  | {
      action: 'ignored'
      reason:
        | 'already_paid'
        | 'checkout_session_not_paid'
        | 'irrelevant_event'
        | 'missing_payment_metadata'
        | 'payment_not_found'
    }

async function findStripePaymentById(
  tx: Prisma.TransactionClient,
  paymentId: string
): Promise<StripePayment | null> {
  return tx.payment.findFirst({
    where: {
      id: paymentId,
      type: 'CHARGE',
      provider: 'STRIPE'
    },
    select: stripePaymentSelect
  })
}

async function findStripePaymentForCheckoutSession(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session
): Promise<StripePayment | null> {
  const paymentId = session.metadata?.paymentId

  if (paymentId) {
    const payment = await findStripePaymentById(tx, paymentId)

    if (payment) {
      return payment
    }
  }

  return tx.payment.findFirst({
    where: {
      provider: 'STRIPE',
      providerReference: session.id,
      type: 'CHARGE'
    },
    select: stripePaymentSelect
  })
}

async function markCheckoutSessionCaptured(
  db: StripeWebhookDb,
  session: Stripe.Checkout.Session
): Promise<StripeWebhookOutcome> {
  if (session.payment_status !== 'paid') {
    return { action: 'ignored', reason: 'checkout_session_not_paid' }
  }

  return db.$transaction(async (tx) => {
    const payment = await findStripePaymentForCheckoutSession(tx, session)

    if (!payment) {
      return { action: 'ignored', reason: 'payment_not_found' }
    }

    if (
      payment.status === 'CAPTURED' ||
      payment.order.paymentStatus === 'PAID'
    ) {
      return { action: 'ignored', reason: 'already_paid' }
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CAPTURED',
        failureReason: null,
        providerReference: session.id
      }
    })

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus: 'PAID'
      }
    })

    return {
      action: 'captured',
      paymentId: payment.id,
      orderId: payment.orderId
    }
  })
}

async function markCheckoutSessionExpired(
  db: StripeWebhookDb,
  session: Stripe.Checkout.Session
): Promise<StripeWebhookOutcome> {
  return db.$transaction(async (tx) => {
    const payment = await findStripePaymentForCheckoutSession(tx, session)

    if (!payment) {
      return { action: 'ignored', reason: 'payment_not_found' }
    }

    if (
      payment.status === 'CAPTURED' ||
      payment.order.paymentStatus === 'PAID'
    ) {
      return { action: 'ignored', reason: 'already_paid' }
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'CANCELLED',
        failureReason: null,
        providerReference: session.id
      }
    })

    return {
      action: 'cancelled',
      paymentId: payment.id,
      orderId: payment.orderId
    }
  })
}

async function markPaymentIntentFailed(
  db: StripeWebhookDb,
  paymentIntent: Stripe.PaymentIntent
): Promise<StripeWebhookOutcome> {
  const paymentId = paymentIntent.metadata?.paymentId

  if (!paymentId) {
    return { action: 'ignored', reason: 'missing_payment_metadata' }
  }

  return db.$transaction(async (tx) => {
    const payment = await findStripePaymentById(tx, paymentId)

    if (!payment) {
      return { action: 'ignored', reason: 'payment_not_found' }
    }

    if (
      payment.status === 'CAPTURED' ||
      payment.order.paymentStatus === 'PAID'
    ) {
      return { action: 'ignored', reason: 'already_paid' }
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        failureReason:
          paymentIntent.last_payment_error?.message ?? 'Stripe payment failed.'
      }
    })

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus: 'FAILED'
      }
    })

    return {
      action: 'failed',
      paymentId: payment.id,
      orderId: payment.orderId
    }
  })
}

export async function recordStripeWebhookEvent(
  db: StripeWebhookDb,
  event: Stripe.Event
): Promise<StripeWebhookOutcome> {
  switch (event.type) {
    case 'checkout.session.completed':
      return markCheckoutSessionCaptured(
        db,
        event.data.object as Stripe.Checkout.Session
      )
    case 'checkout.session.expired':
      return markCheckoutSessionExpired(
        db,
        event.data.object as Stripe.Checkout.Session
      )
    case 'payment_intent.payment_failed':
      return markPaymentIntentFailed(
        db,
        event.data.object as Stripe.PaymentIntent
      )
    default:
      return { action: 'ignored', reason: 'irrelevant_event' }
  }
}
