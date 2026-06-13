import type { Prisma, PrismaClient } from '../../../generated/prisma'
import type Stripe from 'stripe'

type PaymentOutcomeDb = Pick<PrismaClient, '$transaction'>

type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: { order: true }
}>

type PaymentOutcomeTx = Prisma.TransactionClient

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
      include: { order: true }
    })
  }

  if (input.stripeCheckoutSessionId) {
    return tx.payment.findFirst({
      where: { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
      include: { order: true }
    })
  }

  if (input.providerReference) {
    return tx.payment.findFirst({
      where: { provider: 'STRIPE', providerReference: input.providerReference },
      include: { order: true }
    })
  }

  return null
}

async function markPaymentCaptured(
  tx: PaymentOutcomeTx,
  payment: PaymentWithOrder,
  input: {
    providerReference: string | null
    stripeCheckoutSessionId: string | null
  }
) {
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

  if (payment.order.paymentStatus !== 'PAID') {
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'PAID' }
    })
  }
}

async function markPaymentFailed(
  tx: PaymentOutcomeTx,
  payment: PaymentWithOrder,
  input: {
    status: 'FAILED' | 'CANCELLED'
    failureReason?: string | null
    providerReference?: string | null
  }
) {
  if (payment.status !== input.status) {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: input.status,
        failureReason: input.failureReason,
        providerReference: input.providerReference ?? payment.providerReference
      }
    })
  }

  if (payment.order.paymentStatus !== 'PAID') {
    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'FAILED' }
    })
  }
}

async function handleCheckoutSessionCompleted(
  tx: PaymentOutcomeTx,
  session: Stripe.Checkout.Session
) {
  if (session.payment_status !== 'paid') {
    return
  }

  const paymentIntentId = getPaymentIntentId(session.payment_intent)
  const payment = await findPayment(tx, {
    paymentId: getStringMetadataValue(session.metadata, 'paymentId'),
    stripeCheckoutSessionId: session.id
  })

  if (!payment) {
    return
  }

  await markPaymentCaptured(tx, payment, {
    providerReference: paymentIntentId,
    stripeCheckoutSessionId: session.id
  })
}

async function handleCheckoutSessionExpired(
  tx: PaymentOutcomeTx,
  session: Stripe.Checkout.Session
) {
  const payment = await findPayment(tx, {
    paymentId: getStringMetadataValue(session.metadata, 'paymentId'),
    stripeCheckoutSessionId: session.id
  })

  if (!payment) {
    return
  }

  await markPaymentFailed(tx, payment, {
    status: 'CANCELLED',
    failureReason: 'Stripe Checkout Session expired.'
  })
}

async function handlePaymentIntentFailed(
  tx: PaymentOutcomeTx,
  paymentIntent: Stripe.PaymentIntent
) {
  const payment = await findPayment(tx, {
    paymentId: getStringMetadataValue(paymentIntent.metadata, 'paymentId'),
    providerReference: paymentIntent.id
  })

  if (!payment) {
    return
  }

  await markPaymentFailed(tx, payment, {
    status: 'FAILED',
    failureReason:
      paymentIntent.last_payment_error?.message ?? 'Stripe payment failed.',
    providerReference: paymentIntent.id
  })
}

export async function handleStripeWebhookEvent(
  db: PaymentOutcomeDb,
  event: Stripe.Event
) {
  await db.$transaction(async (tx) => {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(tx, event.data.object)
        break
      case 'checkout.session.expired':
        await handleCheckoutSessionExpired(tx, event.data.object)
        break
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(tx, event.data.object)
        break
    }
  })
}
