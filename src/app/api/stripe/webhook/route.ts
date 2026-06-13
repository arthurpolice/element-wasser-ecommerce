import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'

import { env } from '~/env'
import { db } from '~/server/db'
import { handleStripeWebhookEvent } from '~/server/commerce/payment-outcome'
import { getStripeClient } from '~/server/payments/stripe'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature.' },
      { status: 400 }
    )
  }

  const payload = await request.text()

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Stripe webhook is not configured.' },
      { status: 500 }
    )
  }

  const stripe = getStripeClient()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid Stripe signature.'

    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    await handleStripeWebhookEvent(db, event)

    return NextResponse.json({ received: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Stripe webhook failed.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
