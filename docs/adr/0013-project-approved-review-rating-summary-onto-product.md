# Project approved Review rating summaries onto Products

Storefront Product grids must not load every approved Review or repeatedly aggregate Reviews at read time. Persist `approvedReviewCount` and `approvedReviewRatingSum` on each Product, update both transactionally whenever a Review enters or leaves the approved set or an approved rating changes, and derive the average when reading the Product.

Status: accepted

## Considered Options

Query-time grouping was rejected because it would keep aggregate work on every high-traffic storefront Product query. Persisting an average was rejected because count and sum support exact updates, avoid rounding drift, and allow the average to be derived.

## Consequences

Existing approved Reviews require a backfill. Review moderation, approved-rating edits, and deletion must maintain the projection in the same database transaction as the Review change. A reconciliation operation should be available to detect and repair projection drift.
