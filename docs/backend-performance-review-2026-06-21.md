# Backend performance review — N+1 and query optimizations

Date: 2026-06-21
Scope: server-side data access — tRPC routers, commerce modules, background jobs,
and Prisma schema indexing.
Method: static review of query shapes. No code changes were made. Costs are
reasoned from query structure, not measured; confirm hotspots with
`EXPLAIN ANALYZE` / query logging before optimizing.
Decision review completed: 2026-06-22. Accepted decisions were implemented on
2026-06-22; the two indexing decisions explicitly marked deferred remain
measurement-gated.

## Severity legend

- **P1** — interactive request path, cost grows unbounded with data. Fix soon.
- **P2** — interactive path with bounded-but-real cost, or high-traffic repeated work.
- **P3** — background job or owner-only path; correctness fine, efficiency poor.
- **P4** — indexing / quick wins.

## Summary table

| #   | Area                                              | File                                                | Severity | Pattern                     |
| --- | ------------------------------------------------- | --------------------------------------------------- | -------- | --------------------------- |
| 1   | Storefront product grids load every review        | `lib/catalog-product.ts`                            | P1       | over-fetch / per-row        |
| 2   | Customer Area loads all orders + all lines        | `routers/customer.ts` `me`                          | P1       | unbounded fetch             |
| 3   | Search-doc upsert loops per product, inline       | `commerce/product-search.ts`                        | P1       | N+1 writes on mutation path |
| 4   | Customer list sums orders in JS                   | `routers/customer.ts` `list`                        | P2       | over-fetch + JS aggregate   |
| 5   | Homepage fires query per root category            | `routers/catalog.ts` `homepageSections`             | P2       | query-per-group             |
| 6   | Whole category tree fetched per request           | `routers/catalog.ts` (multiple)                     | P2       | repeated uncached read      |
| 7   | Create-order modal loads all customers+products   | `routers/order.ts`                                  | P2       | unbounded fetch             |
| 8   | Expiry job: many sequential round trips per order | `commerce/order-lifecycle.ts`                       | P3       | sequential N+1 + Stripe     |
| 9   | Stock reserve/release loops per line              | `commerce/order-lifecycle.ts`, `order-placement.ts` | P3       | per-row writes              |
| 10  | `contains` search has no trigram index            | `routers/{order,product,customer}.ts`               | P4       | seq scan                    |
| 11  | `count(*)` per page on filtered lists             | all list routers                                    | P4       | expensive count             |
| 12  | Missing `Product(active, featured)` index         | `prisma/schema.prisma`                              | P4       | index                       |

---

## P1 — interactive, unbounded

### 1. Storefront product grids load every approved review to compute an average

`storefrontProductInclude` pulls **all** approved review rows for **every** product,
only to count them and average `rating` in JS.

```ts
// src/lib/catalog-product.ts
const productInclude = {
  manufacturer: { select: { name: true } },
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { url: true, altText: true }
  },
  reviews: {
    where: { status: 'APPROVED' },
    select: { rating: true } // <- every approved review, every product
  }
}
```

```ts
// mapStorefrontProduct
const reviewCount = product.reviews.length
const averageRating =
  reviewCount > 0
    ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
      reviewCount
    : null
```

This include drives `catalog.listCategoryProducts`, `catalog.homepageSections`, and
`catalog.searchProducts`. A 12-item grid for popular products transfers every rating
row for all 12 products on every page load and every infinite-scroll chunk. Cost
scales with total review volume, not page size.

Fix options:

- Denormalize `reviewCount` + `ratingSum` (or `averageRating`) onto `Product`,
  updated when a Review is approved/removed. Grid queries then select two columns.
- Or compute per-product aggregates with a single `review.groupBy({ by: ['productId'],
where: { productId: { in: ids }, status: 'APPROVED' }, _avg: { rating: true },
_count: true })` after the product fetch, and merge by id.

The detail page (`getProductBySlug`) can keep loading rating rows; it's one product.

**Decision (accepted 2026-06-22):** Persist `approvedReviewCount` and
`approvedReviewRatingSum` on `Product`, maintain them transactionally as Review
approval or rating changes, and derive the average at read time. Backfill existing
approved Reviews and provide reconciliation for projection drift. See ADR-0013.

### 2. `customer.me` loads the customer's entire order history with all line items

```ts
// src/server/api/routers/customer.ts  (me)
orders: {
  select: customerAreaOrderSelect,   // wide per-order snapshot incl. all lines
  orderBy: { placedAt: 'desc' }
}
```

`customerAreaOrderSelect` includes the full shipping + billing snapshot and **all**
`lines` per order. There is no `take`. Every Customer Area visit re-fetches the
customer's complete history; a repeat buyer with hundreds of orders pays for all of
them on every page load.

Fix:

- Paginate orders (cursor or page) and load line items lazily per opened order, or
  cap with `take` + "view all" route.
- Split `me` into `me` (profile + addresses) and `myOrders` (paginated) so the
  profile/address screens don't fetch order history at all.

**Decision (accepted 2026-06-22):** Split the Customer Area data contract.
`customer.me` returns customer information, Address Book Entries, and `orderCount`
without Order history. A separate paginated query returns lightweight Order
summaries, and expanding one Order loads its lines and address snapshots on demand.
Order summaries use cursor pagination in chunks of 20, ordered by
`placedAt DESC, id DESC`, with a visible “Load more” control. The summary's
`orderCount` remains available without running a filtered count for each chunk.

### 3. Search-document refresh upserts one row per product, sequentially, on the mutation path

```ts
// src/server/commerce/product-search.ts  (refreshProductSearchDocuments)
const products = await db.product.findMany({ where: { id: { in: uniqueIds } }, select: ... })

for (const product of products) {
  await upsertProductSearchDocument(db, product)   // one $executeRaw per product
}
```

`syncProductSearchDocumentsForMutation` runs this **inline in the request** when
`uniqueIds.length <= 50` (`PRODUCT_SEARCH_SYNC_THRESHOLD`). Callers include
`category.update`, `category.move`, `category.delete`, and `category.setProductCategories`
— a category touching 40 products triggers 40 sequential round trips synchronously
inside the owner's mutation. `backfillProductSearchDocuments` has the same per-row loop.

Fix:

- Replace the loop with a single multi-row `INSERT ... SELECT ... ON CONFLICT`
  (build the values list from the batch), keeping the same `setweight(to_tsvector...)`
  expression. One statement per batch instead of N.
- Consider lowering the inline threshold, or always enqueueing when QStash is
  configured, so catalog mutations never block on search indexing.

**Decision (accepted 2026-06-22):** Refresh direct single-Product mutations
synchronously. Treat Category mutations and other Product fan-out changes as
eventually consistent regardless of affected count: commit the catalog mutation,
record durable reindex work in the database, and enqueue asynchronous processing.
QStash failure must not cause a synchronous fan-out fallback. Brief staleness in
category-derived Product Search terms is acceptable. This supersedes ADR-0006's
threshold-of-50 rule. Durable work coalesces to one pending item per Product;
workers rebuild from current catalog state, so repeated edits do not preserve or
process obsolete intermediate states. The catalog mutation and pending work are
committed in one database transaction. A generation or request timestamp prevents
a worker from clearing work requested during its rebuild, while a recovery sweep
handles pending work when post-commit QStash publication fails. See ADR-0014.

---

## P2 — interactive, bounded but real

### 4. `customer.list` loads every customer's orders to sum totals in JS

```ts
// src/server/api/routers/customer.ts  (list)
include: {
  user: { select: { id: true } },
  _count: { select: { orders: true } },
  orders: { select: { totalCents: true, placedAt: true, status: true } }  // all orders
}
```

```ts
// mapCustomerRow
const activeOrders = customer.orders.filter((o) => o.status !== 'CANCELLED')
const totalSpentCents = activeOrders.reduce((sum, o) => sum + o.totalCents, 0)
```

For a page of up to 100 customers, this loads every order of every listed customer
just to compute `totalSpentCents` and `latestOrderAt`. A few high-volume customers
dominate the payload.

Fix: compute with `order.groupBy({ by: ['customerId'], where: { customerId: { in:
pageIds }, status: { not: 'CANCELLED' } }, _sum: { totalCents: true }, _max: {
placedAt: true } })` and merge by id. The `orderCount` already comes from `_count`.

Note: sorting by `orderCount` uses `orders: { _count }` ordering, which is fine; the
JS aggregate is the part to remove.

**Decision (accepted 2026-06-22):** The owner Customer list's Order count covers
the Customer's complete Order history, including cancelled Orders. Latest Order is
also the latest Order of any Order Lifecycle Status. The monetary metric excludes
cancelled Orders but is not “total spent,” because open or unpaid Orders may remain;
its canonical name is Customer Non-cancelled Order Value. Compute these semantics
with database aggregates rather than loading Orders into JavaScript.

### 5. `homepageSections` fires one or two product queries per root category

```ts
// src/server/api/routers/catalog.ts  (homepageSections)
const sections = await Promise.all(
  rootCategories.map(async (category) => {
    const featuredProducts = await ctx.db.product.findMany({
      /* featured in subtree */ take: 4
    })
    if (missingCount > 0) {
      const products = await ctx.db.product.findMany({
        /* fallback fill */ take: missingCount
      })
    }
  })
)
```

Parallel, so wall-clock is bounded, but it's R–2R queries per homepage render plus
connection-pool pressure under load (homepage = highest-traffic route). Each call
also recomputes `collectDescendantCategoryIds` in JS.

Fix options:

- One query per "kind": fetch candidate products for all root subtrees in a single
  query that tags each product with its root category (via the `ProductCategory`
  join), then bucket in JS and apply the featured-then-fallback rule.
- Or cache the homepage payload (it changes only on catalog edits) with
  `revalidate`/tag-based invalidation.

**Decision (accepted 2026-06-22):** Cache the assembled homepage payload with
tag-based invalidation. Invalidate it when Product storefront presentation,
activation, Featured Product status, images, Manufacturer, Category structure, or
Product Category membership changes. Keep the current cold-path query shape
initially; rewrite it into bulk queries only if cold-load measurements justify the
additional complexity.

Review approval, rejection, rating edits, and deletion do not invalidate the
homepage payload. Homepage rating summaries may therefore be stale for at most the
15-minute cache TTL, while uncached Category and Product Search reads can observe
the updated Product rating projection immediately.

### 6. The full category tree is re-fetched on nearly every storefront request

`navigationTree`, `resolveCategory`, `listCategoryProducts`, `getProductBySlug`, and
`homepageSections` each run `category.findMany({ where: { active: true } })` and then
resolve slug paths / breadcrumbs / descendants in JS.

```ts
// e.g. listCategoryProducts
const categories = await ctx.db.category.findMany({
  where: { active: true },
  select: { id: true, slug: true, parentId: true }
})
const resolved = resolveCategoryPath(categories, slugSegments)
const categoryIds = collectDescendantCategoryIds(
  categories,
  resolved.categoryId
)
```

Correct, and cheap for a small catalog, but it's the same unchanging tree fetched
repeatedly per request. `collectDescendantCategoryIds` is also O(categories²) in JS.

Fix: cache the active category tree (short TTL or tag-invalidated on category
mutations) and reuse it across these procedures. This removes one query from every
storefront navigation/listing request.

**Decision (accepted 2026-06-22):** Category navigation includes only
Storefront-visible Categories: active Categories whose subtree contains at least
one active Product. Active empty Categories remain resolvable by direct URL and
render an empty Product grid. The navigation projection therefore changes on
Category structure/activation changes, Product activation changes, and Product
Category membership changes.

Cache two projections independently with tag-based invalidation and a TTL used only
as recovery protection. The complete active Category tree supports path resolution,
breadcrumbs, and descendant lookup and is invalidated by Category
structure/activation mutations. The Storefront-visible Category navigation
projection is additionally invalidated by Product activation and Product Category
membership mutations.

### 7. Create-order modal endpoints load all customers and all products unpaginated

```ts
// src/server/api/routers/order.ts
listCustomersForCreate: ... ctx.db.customer.findMany({ /* + all addresses */ })   // no take
listProductsForCreate:  ... ctx.db.product.findMany({ /* all products */ })       // no take
```

Owner-only, but both grow unbounded with the customer base and catalog, and
`listCustomersForCreate` also nests every address per customer. Eventually the
create-order modal becomes the slowest owner screen.

Fix: make both searchable + paginated (typeahead with `take` + `contains`/search
doc), matching the existing list endpoints' shape.

**Decision (accepted 2026-06-22):** Replace both modal-wide loads with
server-search typeaheads. Begin searching after two characters and return at most
20 results. Customer results include identity plus the Main Address Book Entry;
Product results include active Products with current price and Available Stock.
Order placement resolves and validates the selected records again rather than
trusting the typeahead snapshot.

---

## P3 — background / owner jobs

### 8. `expirePendingPaymentOrders` does several sequential round trips per order, plus a sequential Stripe call each

```ts
// src/server/commerce/order-lifecycle.ts  (expirePendingPaymentOrders)
for (const candidate of expiredOrders) {
  const claimed = await db.$transaction(/* updateMany claim */)
  if (!claimed) continue
  if (activePayment?.stripeCheckoutSessionId) {
    await expireStripeCheckoutSession(...)        // network call, sequential per order
  }
  const cancelled = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`
    const order = await findOrder(tx, candidate.id)   // re-fetch already-loaded order
    await tx.payment.updateMany(...)
    await tx.order.update(...)
    await releaseStockReservation(tx, order)          // loops per line (see #9)
  })
}
```

Per expired order: claim txn + Stripe call + a second txn that re-selects, re-fetches
(`findOrder` duplicates data already in `candidate`), and releases stock line-by-line.
All sequential across orders. After any backlog (scheduler downtime), this is slow and
holds row locks serially.

Fix:

- Drop the redundant `findOrder`; reuse `candidate` (it already has `lines` and
  `payments` via `orderLifecycleInclude`).
- Bound-concurrency the per-order work (e.g. process in chunks with `Promise.all`),
  especially the Stripe calls.
- The claim could be a single `updateMany` over all candidate ids up front, then
  process the claimed set.

**Decision (accepted and implemented 2026-06-22):** Each sweep atomically claims
at most 50 eligible Orders using `FOR UPDATE SKIP LOCKED` and a ten-minute
`paymentExpiryStartedAt` lease, then processes up to five claimed Orders
concurrently. Failed or crashed work becomes reclaimable after the lease expires.
The final transaction verifies lease ownership and rechecks Payment before
releasing Stock Reservation. An index supports the expiry claim filter. See
ADR-0007.

### 9. Stock reservation reserve/release loop one product update per line

```ts
// src/server/commerce/order-lifecycle.ts
for (const line of order.lines) {
  await tx.product.update({
    where: { id: line.productId },
    data: { stockReserved: { decrement: line.quantity } }
  })
}
```

```ts
// src/server/commerce/order-placement.ts  (placeOrder)
for (const quotedLine of quote.lines) {
  const reservation = await tx.product.updateMany({ /* conditional reserve */ })
  if (reservation.count !== 1) throw new OrderPlacementError('INSUFFICIENT_STOCK', ...)
}
```

N sequential writes per order inside the transaction (one per distinct product). For
typical small carts this is fine; for large multi-line orders it lengthens the
transaction and the locks it holds.

Note: the reservation loop in `placeOrder` is intentionally conditional-per-row (it
relies on `updateMany().count` to detect insufficient stock atomically), so it can't
trivially collapse to one statement without moving the check into SQL. The
release/consume loops in `order-lifecycle.ts` _can_ be a single statement per order
with a `CASE`-based `UPDATE ... WHERE id IN (...)`, or grouped raw SQL. Lower priority
than the interactive items.

**Decision (accepted 2026-06-22):** Keep Order placement reservation
conditional per Product so insufficient stock remains atomically detectable.
Batch Stock Reservation release and consumption into one parameterized, set-based
SQL update per Order. Require the affected-row count to equal the number of
distinct Products and fail the transaction on missing Products or negative stock
invariants.

### Redundant compute: `buildOrderLineSnapshot` re-quotes per line

```ts
// src/server/commerce/order-placement.ts
function buildOrderLineSnapshot(product, quantity) {
  const quote = quoteOrderLines([product], [{ productId: product.id, quantity }], 0)  // per line
  ...
}
```

`placeOrder` already computed the batch `quote` for all lines; building snapshots then
calls `quoteOrderLines` again once per line (CPU + Map allocation inside the txn).
Reuse the already-computed `quote.lines` values instead.

**Decision (accepted 2026-06-22):** Reuse the already-computed batch quote when
building Order Line snapshots. Do not invoke `quoteOrderLines` again per line.

---

## P4 — indexing and quick wins

### 10. `contains … mode: 'insensitive'` search has no trigram index

Owner list search filters use case-insensitive substring match:

```ts
// routers/order.ts, product.ts, customer.ts  (buildSearchFilter)
{ orderNumber:   { contains: search, mode: 'insensitive' } }
{ customerEmail: { contains: search, mode: 'insensitive' } }
// product: name + manufacturer.name; customer: email + first/last name
```

`ILIKE '%term%'` cannot use a btree index → sequential scan on every keystroke-driven
search as these tables grow.

Fix: add `pg_trgm` GIN indexes on the searched text columns (raw migration, since
Prisma can't express trgm ops classes), e.g.
`CREATE INDEX ... USING gin (lower("customerEmail") gin_trgm_ops)`. Or route owner
search through the existing `ProductSearchDocument` tsvector approach where applicable.

**Decision (deferred 2026-06-22):** Do not add trigram indexes yet. Revisit with
production-like row counts and `EXPLAIN ANALYZE`; add indexes only for owner search
paths where substring scans materially harm interactive latency. Manufacturer-name
search needs separate query-shape analysis because it crosses a relation.

### 11. `count(*)` with the same filter runs on every list page

`order.list`, `product.list`, `customer.list`, and `catalog.listCategoryProducts` each
run `count({ where })` alongside `findMany` inside a `$transaction`. With a `contains`
filter (P4-10) the count is a full filtered scan on every page navigation.

Fix: only count on page 1 (cache total client-side) , use `"hasNextPage"` via
`take: pageSize + 1`, or accept an approximate count for large tables.

**Decision (accepted 2026-06-22):** Keep exact total counts for owner Order,
Product, and Customer tables for now because their bounded pagination exposes
page totals. Storefront Product grids use continuation semantics instead: fetch
`pageSize + 1`, return `hasNextPage`, and do not compute an exact total for
infinite-scroll chunks.

### 12. Add a `Product(active, featured)` composite index for the homepage filter

`Product` has `@@index([active])` and `@@index([manufacturerId])` but homepage
sections filter `active: true, featured: true` (+ category subtree). A composite
`@@index([active, featured])` helps the featured lookup; the category-subtree
membership still resolves through `ProductCategory(@@index([categoryId]))`, which is
fine.

Also consider: storefront category listings order by `[{ featured: 'desc' }, { name:
'asc' }]` with `skip/take`. Large `OFFSET` paging is O(offset); if deep pagination
becomes common, switch category grids to keyset/cursor pagination on `(featured, name,
id)`.

**Decision (deferred 2026-06-22):** Do not add `Product(active, featured)` yet.
The cached homepage payload removes the lookup from warm requests. Measure the cold
homepage query with representative data, then add an index only if needed and shape
it around the observed complete filter and ordering rather than assuming this
two-column index is sufficient.

---

## Suggested order of work

1. **#1 reviews aggregate** and **#2 paginated Customer Area orders** — biggest
   unbounded interactive payloads.
2. **#3 batch search-doc upsert** — removes synchronous N-write stalls from owner
   catalog edits.
3. **#4 customer-list aggregate** and **#6 category-tree cache** — cheap, broad wins.
4. **#5 homepage** and **#7 create-order endpoints** — restructure queries / add
   pagination.
5. **#10–#12 indexes** — apply once row counts justify; verify with `EXPLAIN ANALYZE`.
6. **#8–#9 job batching** — lower urgency (background), do alongside any expiry-job work.

All costs above are structural estimates. Before optimizing any single item, confirm
with query logging or `EXPLAIN ANALYZE` against production-like data volumes.
