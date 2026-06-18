# Signed guest order access links

Guest Customers will access an Order Confirmation through a scoped link that identifies one Order, expires after 30 days, and is signed with a dedicated Order access secret. Signed links replace the stored one-way guest token workflow so asynchronous Email Notification delivery and retries can generate a usable link without storing plaintext bearer tokens or coupling Order access to authentication credentials.

Status: accepted

## Consequences

Registered Customers continue to use sign-in-protected Order Confirmation links. Rotating the dedicated secret invalidates outstanding Guest Customer links without affecting authentication.
