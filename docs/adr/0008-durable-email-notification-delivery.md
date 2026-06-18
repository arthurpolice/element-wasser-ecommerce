# Durable email notification delivery

Element Wasser will record each Email Notification durably in the same database transaction as the commerce outcome that creates it, then deliver it asynchronously through QStash. Database uniqueness makes repeated commerce events and queue deliveries idempotent, while a periodic recovery sweep republishes pending notifications so a failed post-commit QStash publication cannot strand customer communication; checkout, payment, cancellation, and fulfillment remain successful even when notification infrastructure is unavailable.

Status: accepted

## Considered Options

Sending email synchronously was rejected because provider failure must not invalidate a successful commerce transition. Publishing only to QStash after committing was rejected because a publication failure could permanently lose the notification. Reconstructing missing notifications from current Order state was rejected because current state does not reliably preserve every outcome that should have produced a distinct communication.
