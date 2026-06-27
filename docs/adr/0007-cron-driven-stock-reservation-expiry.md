# Cron-driven stock reservation expiry

Stock Reservation Expiry will run as a Vercel cron sweep every five minutes instead of scheduling one delayed QStash message per checkout payment. The sweep calls the shared expired-payment order lifecycle operation behind a `CRON_SECRET`-protected route, accepting minute-level expiry precision in exchange for avoiding checkout success depending on future cleanup message publication.

Status: accepted

Each sweep atomically claims at most 50 eligible Orders with `FOR UPDATE SKIP
LOCKED`, using `paymentExpiryStartedAt` as a ten-minute processing lease. Claimed
Orders are processed with concurrency five so Stripe calls overlap without an
unbounded API or database burst. A later sweep may reclaim an abandoned lease after
ten minutes.

The worker does not hold database locks while calling Stripe. Before cancelling an
Order and releasing its Stock Reservation, it locks the Order again, verifies that
it still owns the lease, and rechecks that Payment has not succeeded. A stale worker
or a Payment that wins the race must not release stock.

## Considered Options

Per-payment delayed QStash cleanup was rejected because QStash can only retry messages after they are successfully published; a publish failure after Order, Payment, and Stripe Checkout Session creation would either fail a customer-facing checkout that partly succeeded or leave the Stock Reservation without automatic cleanup.
