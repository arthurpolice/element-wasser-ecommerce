# Cron-driven stock reservation expiry

Stock Reservation Expiry will run as a Vercel cron sweep every five minutes instead of scheduling one delayed QStash message per checkout payment. The sweep calls the shared expired-payment order lifecycle operation behind a `CRON_SECRET`-protected route, accepting minute-level expiry precision in exchange for avoiding checkout success depending on future cleanup message publication.

Status: accepted

## Considered Options

Per-payment delayed QStash cleanup was rejected because QStash can only retry messages after they are successfully published; a publish failure after Order, Payment, and Stripe Checkout Session creation would either fail a customer-facing checkout that partly succeeded or leave the Stock Reservation without automatic cleanup.
