import { describe, expect, it, vi } from 'vitest'

import { startStripeCheckout } from '~/server/payments/stripe-checkout'
import type { OrderListRow } from '~/server/commerce/order-placement'

const order = {
  id: 'order-1',
  orderNumber: 'EW-2026-00001',
  customerEmail: 'river@example.com',
  currencyCode: 'CHF',
  shippingCents: 900,
  lines: [
    {
      id: 'line-1',
      productId: 'product-1',
      productName: 'Countertop Filter',
      productSku: 'EW-FIL-00001',
      quantity: 2,
      listPriceCents: 12000,
      discountPercent: 10,
      unitPriceCents: 10800,
      lineTotalCents: 21600
    }
  ],
  payments: [
    {
      id: 'payment-1',
      type: 'CHARGE',
      provider: 'STRIPE',
      paymentMethod: 'TWINT',
      status: 'PENDING',
      amountCents: 22500,
      currencyCode: 'CHF',
      providerReference: null,
      stripeCheckoutSessionId: null,
      createdAt: new Date('2026-05-15T10:00:00Z')
    }
  ]
} as OrderListRow

describe('startStripeCheckout', () => {
  it('creates a Stripe Checkout Session restricted to the selected Payment Method', async () => {
    const create = vi.fn(async () => ({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      payment_intent: 'pi_test_123',
      expires_at: 1778831400
    }))

    const started = await startStripeCheckout(
      { locale: 'en', order, orderAccessToken: 'guest-token' },
      { stripe: { create } as never }
    )

    expect(started).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      sessionId: 'cs_test_123',
      paymentIntentId: 'pi_test_123',
      expiresAt: new Date(1778831400 * 1000)
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_method_types: ['twint'],
        customer_email: 'river@example.com',
        client_reference_id: 'order-1',
        success_url:
          'http://localhost:3000/en/checkout/confirmation?order=EW-2026-00001&stripe=success&token=guest-token',
        cancel_url:
          'http://localhost:3000/en/checkout/confirmation?order=EW-2026-00001&stripe=cancel&token=guest-token',
        metadata: {
          orderId: 'order-1',
          orderNumber: 'EW-2026-00001',
          paymentId: 'payment-1',
          paymentMethod: 'TWINT'
        },
        payment_intent_data: {
          metadata: {
            orderId: 'order-1',
            orderNumber: 'EW-2026-00001',
            paymentId: 'payment-1',
            paymentMethod: 'TWINT'
          }
        },
        line_items: [
          {
            price_data: {
              currency: 'chf',
              product_data: {
                name: 'Countertop Filter',
                metadata: {
                  productId: 'product-1',
                  sku: 'EW-FIL-00001'
                }
              },
              unit_amount: 10800
            },
            quantity: 2
          },
          {
            price_data: {
              currency: 'chf',
              product_data: {
                name: 'Shipping'
              },
              unit_amount: 900
            },
            quantity: 1
          }
        ]
      }),
      { idempotencyKey: 'payment-1' }
    )
  })
})
