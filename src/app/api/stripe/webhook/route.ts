import Stripe from 'stripe'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '~/env'
import { db } from '~/server/db'
import { recordStripeWebhookEvent } from '~/server/payments/stripe-webhook'

export const runtime = 'nodejs'

let stripeClient: Stripe | null = null

function getStripeClient() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required to verify Stripe webhooks.')
  }

  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY)

  return stripeClient
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature.' },
      { status: 400 }
    )
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Stripe webhook secret is not configured.' },
      { status: 500 }
    )
  }

  if (!env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Stripe secret key is not configured.' },
      { status: 500 }
    )
  }

  const body = await request.text()
  let event: Stripe.Event

  try {
    event = getStripeClient().webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch {
    return NextResponse.json(
      { error: 'Invalid Stripe signature.' },
      { status: 400 }
    )
  }

  await recordStripeWebhookEvent(db, event)

  return NextResponse.json({ received: true })
}
