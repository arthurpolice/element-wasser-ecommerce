import 'server-only'

import Stripe from 'stripe'

import { env } from '~/env'
import type {
  CheckoutPaymentMethod,
  OrderListRow
} from '~/server/commerce/order-placement'

export class StripeCheckoutError extends Error {
  constructor(
    readonly code: 'MISSING_PAYMENT' | 'MISSING_SECRET' | 'MISSING_URL',
    message: string
  ) {
    super(message)
    this.name = 'StripeCheckoutError'
  }
}

type StripeCheckoutClient = {
  checkout: {
    sessions: {
      create: (
        params: Stripe.Checkout.SessionCreateParams
      ) => Promise<Pick<Stripe.Checkout.Session, 'id' | 'url'>>
    }
  }
}

type CreateStripeCheckoutSessionInput = {
  order: OrderListRow
  paymentMethod: CheckoutPaymentMethod
  locale: string
}

type CreateStripeCheckoutSessionDeps = {
  stripe?: StripeCheckoutClient
  baseUrl?: string
}

let stripeClient: Stripe | null = null

function getStripeClient(): StripeCheckoutClient {
  if (!env.STRIPE_SECRET_KEY) {
    throw new StripeCheckoutError(
      'MISSING_SECRET',
      'STRIPE_SECRET_KEY is required to create Stripe Checkout Sessions.'
    )
  }

  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY)

  return stripeClient
}

function getAppBaseUrl(baseUrl?: string) {
  const configured = baseUrl ?? env.APP_BASE_URL

  if (configured) {
    return configured.replace(/\/$/, '')
  }

  if (env.NODE_ENV !== 'production') {
    return `http://localhost:${process.env.PORT ?? 3000}`
  }

  throw new StripeCheckoutError(
    'MISSING_URL',
    'APP_BASE_URL is required in production to create Stripe Checkout URLs.'
  )
}

function mapStripePaymentMethod(
  paymentMethod: CheckoutPaymentMethod
): Stripe.Checkout.SessionCreateParams.PaymentMethodType {
  return paymentMethod === 'TWINT' ? 'twint' : 'card'
}

export async function createStripeCheckoutSession(
  input: CreateStripeCheckoutSessionInput,
  deps: CreateStripeCheckoutSessionDeps = {}
) {
  const payment = input.order.payments[0]

  if (!payment) {
    throw new StripeCheckoutError(
      'MISSING_PAYMENT',
      'A pending Payment is required before starting Stripe Checkout.'
    )
  }

  const baseUrl = getAppBaseUrl(deps.baseUrl)
  const locale = input.locale === 'en' ? 'en' : 'de'
  const stripe = deps.stripe ?? getStripeClient()
  const metadata = {
    orderId: input.order.id,
    orderNumber: input.order.orderNumber,
    paymentId: payment.id,
    paymentMethod: input.paymentMethod
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: [mapStripePaymentMethod(input.paymentMethod)],
    customer_email: input.order.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.order.currencyCode.toLowerCase(),
          unit_amount: input.order.totalCents,
          product_data: {
            name: `Element Wasser order ${input.order.orderNumber}`
          }
        }
      }
    ],
    metadata,
    payment_intent_data: {
      metadata
    },
    success_url: `${baseUrl}/${locale}/customer-area/orders?checkout=success&order=${input.order.id}`,
    cancel_url: `${baseUrl}/${locale}/checkout?checkout=cancelled&order=${input.order.id}`
  })

  if (!session.url) {
    throw new StripeCheckoutError(
      'MISSING_URL',
      'Stripe did not return a Checkout Session URL.'
    )
  }

  return {
    id: session.id,
    url: session.url
  }
}
