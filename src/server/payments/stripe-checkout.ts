import 'server-only'

import type Stripe from 'stripe'

import { env } from '~/env'
import type {
  CheckoutPaymentMethod,
  OrderListRow
} from '~/server/commerce/order-placement'
import { getStripeClient } from '~/server/payments/stripe'

type StripeCheckoutClient = {
  create(
    params: Stripe.Checkout.SessionCreateParams
  ): Promise<Stripe.Checkout.Session>
}

type StartStripeCheckoutDeps = {
  stripe?: StripeCheckoutClient
}

export type StartStripeCheckoutInput = {
  order: OrderListRow
  locale: string
  orderAccessToken?: string
}

export type StartedStripeCheckout = {
  url: string
  sessionId: string
  paymentIntentId: string | null
}

function getAppBaseUrl() {
  if (env.APP_BASE_URL) {
    return env.APP_BASE_URL.replace(/\/$/, '')
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  if (env.NODE_ENV !== 'production') {
    return `http://localhost:${process.env.PORT ?? 3000}`
  }

  throw new Error('APP_BASE_URL is not configured.')
}

function toStripePaymentMethodType(paymentMethod: CheckoutPaymentMethod) {
  return paymentMethod === 'CARD' ? 'card' : 'twint'
}

function getPendingPayment(order: OrderListRow) {
  const payment = order.payments.find(
    (candidate) => candidate.status === 'PENDING'
  )

  if (!payment) {
    throw new Error('Order has no pending Payment.')
  }

  return payment
}

function getCheckoutReturnUrl(
  order: OrderListRow,
  locale: string,
  result: string,
  orderAccessToken?: string
) {
  const baseUrl = getAppBaseUrl()
  const url = new URL(`/${locale}/checkout/confirmation`, `${baseUrl}/`)
  url.searchParams.set('order', order.orderNumber)
  url.searchParams.set('stripe', result)
  if (orderAccessToken) {
    url.searchParams.set('token', orderAccessToken)
  }

  return url.toString()
}

function buildLineItems(
  order: OrderListRow
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const productLineItems = order.lines.map((line) => ({
    price_data: {
      currency: order.currencyCode.toLowerCase(),
      product_data: {
        name: line.productName,
        metadata: {
          productId: line.productId,
          sku: line.productSku
        }
      },
      unit_amount: line.unitPriceCents
    },
    quantity: line.quantity
  }))

  if (order.shippingCents <= 0) {
    return productLineItems
  }

  return [
    ...productLineItems,
    {
      price_data: {
        currency: order.currencyCode.toLowerCase(),
        product_data: {
          name: 'Shipping'
        },
        unit_amount: order.shippingCents
      },
      quantity: 1
    }
  ]
}

function getPaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null
) {
  if (typeof paymentIntent === 'string') {
    return paymentIntent
  }

  return paymentIntent?.id ?? null
}

export async function startStripeCheckout(
  { locale, order, orderAccessToken }: StartStripeCheckoutInput,
  deps: StartStripeCheckoutDeps = {}
): Promise<StartedStripeCheckout> {
  const payment = getPendingPayment(order)
  const paymentMethod = payment.paymentMethod
  const stripe = deps.stripe ?? getStripeClient().checkout.sessions
  const metadata = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentId: payment.id,
    paymentMethod
  }

  const session = await stripe.create({
    mode: 'payment',
    payment_method_types: [toStripePaymentMethodType(paymentMethod)],
    customer_email: order.customerEmail,
    client_reference_id: order.id,
    line_items: buildLineItems(order),
    success_url: getCheckoutReturnUrl(
      order,
      locale,
      'success',
      orderAccessToken
    ),
    cancel_url: getCheckoutReturnUrl(
      order,
      locale,
      'cancel',
      orderAccessToken
    ),
    metadata,
    payment_intent_data: {
      metadata
    }
  })

  if (!session.url) {
    throw new Error('Stripe Checkout Session did not include a redirect URL.')
  }

  return {
    url: session.url,
    sessionId: session.id,
    paymentIntentId: getPaymentIntentId(session.payment_intent)
  }
}
