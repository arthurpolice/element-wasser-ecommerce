# Ecommerce database model

Element Wasser will model ecommerce around immutable order snapshots and mutable catalog/customer records. Products remain the sellable unit, orders contain order lines with purchase-time price and cost, and customer, shipping, billing, payment, and review data are copied or linked in ways that preserve historical orders.

Status: accepted

## Decision

Use Better Auth `User` only for authentication and link it optionally to a commerce `Customer`; guest checkout creates a separate customer per order. Registered customer name stays synced with the linked user, while registered customer email is captured during onboarding and remains read-only in the Customer Area. Email changes require a separate sign-in/support flow rather than Customer Area contact editing. Orders store customer contact and address snapshots. A registered customer can mark one address book entry as their main address, which checkout preselects and shows before the other address book entries.

Use `Order` plus `OrderLine` instead of direct order-product references. Order lines store product name, SKU, quantity, list price, discount percentage, final unit price, unit cost, and line total in CHF cents so historical orders and margin reporting survive catalog changes.

Keep carts outside the database for now. Create an order only when checkout is placed, reserve stock for 30 minutes while payment is pending, and allow multiple Stripe-backed card or TWINT payment attempts through a separate `Payment` table. Before any operation releases an unpaid Order's Stock Reservation, including automatic expiry or owner cancellation, close the Active Payment Attempt so Stripe can no longer accept payment for stock that has been released. Release expired reservations through a reusable backend operation first; wire that same operation to a scheduled job once the deployment/runtime scheduler is decided.

Use product-level percentage discounts for clearance sales, flat shipping stored as an order snapshot, product-owned images, nested categories with global slugs, and verified-purchase reviews tied to order lines. Guest reviews use expiring secure review invites.

## Considered Options

Direct order-product many-to-many relations were rejected because they lose quantity, purchase-time price, cost, and discount history. Persisted carts were rejected because local storage is enough for the first version. Address foreign keys on orders were rejected because edited address book entries must not change old orders.

## Consequences

The schema has some duplicated snapshot fields by design. Reports can rely on order/order-line data without joining mutable catalog records, but application code must keep registered customer names and user display names synced, keep Customer Area email read-only, and close active payment collection before releasing reserved stock when unpaid orders expire. Until a scheduled job exists, request-time cleanup can reduce stale reservations but is not a replacement for scheduler-backed expiry.
