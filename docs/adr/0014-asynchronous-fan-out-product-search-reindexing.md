# Reindex fan-out Product Search changes asynchronously

Direct single-Product mutations refresh that Product's Product Search document synchronously so the edit is immediately searchable. Category mutations and other changes that fan out across Products commit without waiting for reindexing, record durable reindex work in the database, and publish asynchronous processing; brief staleness in category-derived search terms is acceptable.

Status: accepted

## Considered Options

The previous threshold of 50 affected Products was rejected because it creates an arbitrary latency cliff and allows owner requests to perform many sequential search-document writes. Always-asynchronous indexing was rejected because direct Product edits should remain immediately visible in Product Search.

## Consequences

Fan-out reindexing must be idempotent, retryable, and recoverable when QStash publication or delivery fails. Queue publication is an acceleration mechanism rather than the durable record of owed work, and an interactive mutation must not fall back to performing the fan-out reindex synchronously.

Store one pending reindex item per Product, uniquely keyed by Product identity.
Repeated fan-out mutations coalesce into that item, and workers rebuild the Product
Search document from current catalog state rather than replaying intermediate
changes. The latest catalog state wins; the reindex queue is not a historical
change log.

Write or advance the affected Products' pending reindex items in the same database
transaction as the fan-out catalog mutation. Publish a QStash wake-up message only
after commit; failed publication leaves discoverable pending work for a scheduled
recovery sweep. Each pending item carries a generation or request timestamp, and a
worker may complete it only if no newer request arrived while the document was
being rebuilt.
