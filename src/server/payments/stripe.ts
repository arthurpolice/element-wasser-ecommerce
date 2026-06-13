import 'server-only'

import Stripe from 'stripe'

import { env } from '~/env'

export const stripeApiVersion = '2026-05-27.dahlia'

let stripeClient: Stripe | null = null

export function getStripeClient() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured.')
  }

  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: stripeApiVersion
  })

  return stripeClient
}
