# One active Payment attempt per Order

An Order may have many historical Payments but at most one Active Payment Attempt. Payment Attempt Replacement closes the active Stripe Checkout Session and cancels that Payment before creating another; the new attempt may use a different Payment Method or restart the same method. Payments are not edited into a different attempt. Replacement fails closed: if Stripe does not confirm that the old Checkout Session can no longer accept payment, the old Payment remains active and no new Payment is created. This prevents multiple payable Stripe sessions and accidental duplicate charges while preserving attempt identity for support, Payment Failed Email Notifications, and future refunds.

Payment Retry resumes the existing open Stripe Checkout Session when the Customer chooses the same Payment Method. It uses Payment Attempt Replacement only when the Customer changes method or the existing Session cannot be resumed.

Status: accepted

Payment writes are serialized by locking the Order and rechecking its Payments inside the transaction. A Postgres partial unique index for pending Payments is deferred while one module owns all Payment writes; add a database constraint if another writer appears or integrity incidents show the application-level invariant is insufficient.
