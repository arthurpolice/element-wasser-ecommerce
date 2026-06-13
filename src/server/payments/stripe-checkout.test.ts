import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrderListRow } from '~/server/commerce/order-placement'
import { createStripeCheckoutSession } from '~/server/payments/stripe-checkout'

const order = {
  id: 'order-1',
  orderNumber: 'EW-2026-00001',
  customerEmail: 'river@example.com',
  totalCents: 16700,
  currencyCode: 'CHF',
  payments: [
    {
      id: 'payment-1',
      provider: 'STRIPE',
      status: 'PENDING',
      amountCents: 16700,
      currencyCode: 'CHF',
      providerReference: null,
      createdAt: new Date('2026-05-15T10:00:00Z')
    }
  ]
} as unknown as OrderListRow

describe('createStripeCheckoutSession', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a card Checkout Session from recorded Order totals and durable metadata', async () => {
    const create = vi.fn(async () => ({
      id: 'cs_test_card',
      url: 'https://checkout.stripe.test/card'
    }))

    const result = await createStripeCheckoutSession(
      {
        order,
        paymentMethod: 'CARD',
        locale: 'en'
      },
      {
        baseUrl: 'https://shop.example.com/',
        stripe: { checkout: { sessions: { create } } }
      }
    )

    expect(create).toHaveBeenCalledWith({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: 'river@example.com',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'chf',
            unit_amount: 16700,
            product_data: {
              name: 'Element Wasser order EW-2026-00001'
            }
          }
        }
      ],
      metadata: {
        orderId: 'order-1',
        orderNumber: 'EW-2026-00001',
        paymentId: 'payment-1',
        paymentMethod: 'CARD'
      },
      payment_intent_data: {
        metadata: {
          orderId: 'order-1',
          orderNumber: 'EW-2026-00001',
          paymentId: 'payment-1',
          paymentMethod: 'CARD'
        }
      },
      success_url:
        'https://shop.example.com/en/customer-area/orders?checkout=success&order=order-1',
      cancel_url:
        'https://shop.example.com/en/checkout?checkout=cancelled&order=order-1'
    })
    expect(result).toEqual({
      id: 'cs_test_card',
      url: 'https://checkout.stripe.test/card'
    })
  })

  it('restricts TWINT sessions to the TWINT Stripe payment method and defaults to the German storefront locale', async () => {
    const create = vi.fn(async () => ({
      id: 'cs_test_twint',
      url: 'https://checkout.stripe.test/twint'
    }))

    await createStripeCheckoutSession(
      {
        order,
        paymentMethod: 'TWINT',
        locale: 'fr'
      },
      {
        baseUrl: 'https://shop.example.com',
        stripe: { checkout: { sessions: { create } } }
      }
    )

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ['twint'],
        success_url:
          'https://shop.example.com/de/customer-area/orders?checkout=success&order=order-1',
        cancel_url:
          'https://shop.example.com/de/checkout?checkout=cancelled&order=order-1'
      })
    )
  })
})
