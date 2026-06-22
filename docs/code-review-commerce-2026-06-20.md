# Code review — Element Wasser commerce paths

Date: 2026-06-20
Scope: commerce / payment / checkout critical paths (where money and stock move).
Method: static review, ordered by severity. No code changes were made.

Files reviewed: `src/server/commerce/order-placement.ts`, `order-lifecycle.ts`,
`payment-outcome.ts`, `checkout-payment.ts`, `order-access-token.ts`,
`email-notifications.ts`, `src/server/payments/stripe-checkout.ts`,
`src/server/queue/qstash.ts`, `src/server/api/routers/checkout.ts`,
`src/lib/order-quote.ts`, and the `src/app/api/**/route.ts` handlers.

---

## Critical

### C1 · A late Stripe success after expiry marks a cancelled Order as PAID

`markPaymentCaptured` only checks `order.paymentStatus !== 'PAID'`. It never checks
`order.status`.

```ts
// src/server/commerce/payment-outcome.ts:86
const firstPaidTransition = payment.order.paymentStatus !== 'PAID'

if (payment.status !== 'CAPTURED') {
  await tx.payment.update({
    /* ... */
  })
}

if (firstPaidTransition) {
  await tx.order.update({
    where: { id: payment.orderId },
    data: { paymentStatus: 'PAID' }
  })
}
```

Race: the expiry job (`expirePendingPaymentOrders`) cancels the Order, sets
`paymentStatus: 'CANCELLED'`, and **releases the Stock Reservation**. Moments later
the customer completes the still-open Stripe Checkout Session.
`checkout.session.completed` fires and this code sets `paymentStatus: 'PAID'` on an
Order whose `status` is already `CANCELLED` and whose stock has been released.

Result: a paid-but-cancelled Order, captured money with no reserved stock, and
oversell. The webhook is the source of truth (ADR-0005), so it must reconcile
against `order.status === 'CANCELLED'` — refuse capture and flag for refund, rather
than silently flipping to PAID.

Missing test: capture-after-cancellation. `payment-outcome.test.ts` asserts status
transitions only.

### C2 · Payment retry leaves the previous Stripe Session open → double charge

`retryCheckoutPayment` creates a fresh PENDING Payment and a new Checkout Session,
but never expires the prior session.

```ts
// src/server/commerce/checkout-payment.ts:224
await tx.payment.create({
  data: {
    orderId: existingOrder.id,
    ...buildPendingPayment(input.paymentMethod, existingOrder.totalCents)
  }
})

return tx.order.update({
  where: { id: existingOrder.id },
  data: { paymentStatus: 'PENDING' },
  include: orderListInclude
})
```

There is no `stripe.checkout.sessions.expire(...)` call anywhere in the codebase.
The old session stays payable for its full lifetime. A customer who retries and then
pays both sessions is charged twice for one Order; the second `markPaymentCaptured`
sees `firstPaidTransition === false` and silently captures the extra Payment.

Fix direction: retry should expire the outstanding Session, and/or the webhook should
auto-refund Payments captured after the Order is already PAID.

---

## High

### H1 · Order placement and Stripe session start are not atomic; failures orphan state

`beginCheckoutPayment` commits the Order (reserving stock, creating the PENDING
Payment) in one transaction, then `startCheckoutForOrder` starts Stripe and opens a
_second_ transaction for the session-id write-back.

```ts
// src/server/commerce/checkout-payment.ts:144
export async function beginCheckoutPayment(
  db: CheckoutPaymentDb,
  input: PlaceOrderInput,
  locale: CheckoutPaymentLocale
) {
  const order = await placeOrder(db, { ...input, origin: 'STOREFRONT' })

  return startCheckoutForOrder({ db, order, locale })
}
```

If `startStripeCheckout` throws (Stripe outage, network), the customer gets an error
but stock is already reserved for 15 minutes and a PENDING Payment with no session
exists. Recoverable through retry, but the failure mode is invisible to the customer
and silently consumes Available Stock. Needs a test and an explicit recovery story.

### H2 · Guest checkout creates an orphan Customer on any placement failure

`beginGuestCheckoutPayment` creates the guest Customer _before_ and _outside_ the
placement transaction.

```ts
// src/server/commerce/checkout-payment.ts:166
const customer = await db.customer.create({
  data: input.guestCustomer,
  select: { id: true }
})
const placedOrder = await placeOrder(db, {
  ...input.order,
  customerId: customer.id,
  origin: 'STOREFRONT'
})
```

Any `OrderPlacementError` (insufficient stock, inactive product) leaves a dangling
guest Customer with no Order. Since `placeGuestOrder` is a `publicProcedure`, every
failed/abandoned guest attempt accumulates Customer rows. Create the Customer inside
the placement transaction, or clean up on failure.

### H3 · `placeGuestOrder` is unauthenticated and unthrottled → stock-reservation abuse

`placeGuestOrder` is a `publicProcedure` and each call reserves stock for 15 minutes
via `placeOrder`.

```ts
// src/server/api/routers/checkout.ts:475
placeGuestOrder: publicProcedure
  .input(placeGuestOrderInputSchema)
  .mutation(async ({ ctx, input }) => {
    try {
      return await beginGuestCheckoutPayment(ctx.db, {
        /* ... */
      })
```

With no rate limit, captcha, or per-IP guard, an anonymous caller can exhaust
Available Stock on any Product by repeatedly placing guest Orders it never pays
(compounding H2's orphan Customers). Worth a deliberate abuse-mitigation decision.

### H4 · Confirmation/retry emails always link to the German page

**Disposition (2026-06-21): accepted by design.** Transactional emails are
German-only; the English storefront route exists for development and interface
testing rather than as a supported Customer communication language. See
ADR-0012.

`deliverEmailNotification` hardcodes the `/de/` locale in every Order email URL;
locale is never persisted on the notification.

```ts
// src/server/commerce/email-notifications.ts:77
const url = new URL('/de/checkout/confirmation', `${appBaseUrl()}/`)
url.searchParams.set('order', order.orderNumber)
if (token) url.searchParams.set('token', token)
```

English customers (the checkout schema accepts `locale: 'en'`) receive German
confirmation/dispatch/cancellation links. Persist the Order locale and use it here.

---

## Medium

### M1 · Email delivery has a check-then-act window

**Disposition (2026-06-21): resolved.** Delivery now conditionally claims a
five-minute database lease before rendering or calling Resend. Concurrent
workers that lose the claim return without sending; explicit provider failures
release the lease immediately, while a crashed worker becomes retryable after
the lease expires. Resend's generation-based idempotency key remains a second
line of defense.

`deliverEmailNotification` reads `status === 'SENT'` then sends; two concurrent
deliveries (QStash retry + the recovery cron) can both pass the guard.

```ts
// src/server/commerce/email-notifications.ts:71
if (!notification || notification.status === 'SENT') return notification
```

Real duplicate sends are prevented only because Resend receives
`idempotencyKey: notification.id`. That mitigation is load-bearing and undocumented —
if the provider changes, duplicates resurface. A conditional `updateMany` to claim the
row before sending would close the window.

### M2 · Cron authorization is not constant-time

**Disposition (2026-06-21): resolved.** All cron routes now use one shared
authorization helper that hashes the received and expected bearer values to
fixed-length SHA-256 digests before comparing them with `timingSafeEqual`.
Missing configuration fails closed.

Both cron routes compare the bearer token with `===`.

```ts
// src/app/api/cron/payments/expire/route.ts:5
function isAuthorizedCronRequest(request: Request) {
  return (
    Boolean(env.CRON_SECRET) &&
    request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`
  )
}
```

Low practical risk, but these are privileged endpoints (mass Order cancellation). Use
`timingSafeEqual`, consistent with the care already taken in `order-access-token.ts`.

### M3 · `expirePendingPaymentOrders` cancels Orders that may still be paying

The expiry query includes `paymentStatus: 'PENDING'` with no margin for in-flight
Stripe Sessions.

```ts
// src/server/commerce/order-lifecycle.ts:288
const expiredOrders = await tx.order.findMany({
  where: {
    status: 'PLACED',
    paymentStatus: { in: ['PENDING', 'FAILED', 'CANCELLED'] },
    fulfillmentStatus: 'UNFULFILLED',
    paymentExpiresAt: { lte: cancelledAt }
  }
  /* ... */
})
```

This is the trigger half of the C1 race. Even with C1 fixed on the webhook side,
consider only expiring Orders with no recently-active Session, or reconciling with
Stripe before cancelling.

---

## Low / tests

- **N+1 in placement:** `buildOrderLineSnapshot` calls `quoteOrderLines` once per line
  (`order-placement.ts:212`) after the batch quote already ran at `:297`. Correct, but
  redundant work inside the transaction.
- **Double token verification:** `retryPayment` verifies the access token in the router
  (for the guard) and again in `retryCheckoutPayment`. Harmless, but the access rule now
  lives in two places.
- **Missing-test surfaces (highest value first):** capture-after-cancellation (C1),
  retry double-session (C2), Stripe-failure mid-checkout (H1), guest orphan-on-failure
  (H2), and the Stripe webhook route handler itself (signature handling + the
  500-triggers-retry behavior). The pure `order-quote.ts` and status-only
  `payment-outcome.test.ts` are well covered; the gaps are all in the _coordination_
  between payment outcome, stock, and Order lifecycle.

  **Disposition (2026-06-21): partially resolved.** Regression coverage now
  exists for capture-after-cancellation, Payment Attempt Replacement ordering
  and fail-closed Stripe expiration, resumable Checkout Session creation after
  provider failure, and Guest Customer rollback on placement failure. The
  Stripe webhook route handler remains uncovered.

---

## Root cause

The two critical items (C1, C2) both stem from the same root: **the Stripe webhook
capture path doesn't reconcile against Order lifecycle state.** Capture currently
trusts that an Order awaiting payment is still placeable. Fixing that one invariant —
refuse/flag capture when `order.status === 'CANCELLED'`, and expire stale Sessions on
retry — closes the money-loss and oversell risks together.
