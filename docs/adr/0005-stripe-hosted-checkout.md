# Stripe hosted checkout

Element Wasser will use Stripe Checkout hosted payment pages for the first card and TWINT payment integration. Checkout places an order, creates a pending Stripe-backed payment, starts a Stripe Checkout Session restricted to the selected payment method, and redirects the customer to Stripe; Stripe webhooks remain the source of truth for payment success or failure.

Status: accepted

## Considered Options

Embedded Stripe Elements was rejected for the first implementation because it would add payment UI and PCI surface area before the product needs that control. Hosted checkout supports both card and TWINT through one Stripe integration path and fits the existing order-first stock reservation model.
