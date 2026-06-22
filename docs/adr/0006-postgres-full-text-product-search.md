# Postgres full-text product search

Element Wasser will implement Product Search Relevance with Postgres full-text search in the existing commerce database. This keeps search relevance, weighting, suggestions, and full results inside the current data boundary while avoiding both a brittle hand-rolled Prisma scoring layer and the operational overhead of a dedicated search service.

Status: accepted

## Consequences

Product Search will likely need raw SQL migrations or queries for weighted ranking and indexing. Searchable Product language that spans Product, Manufacturer, Category, SKU, and Product Description should be represented deliberately rather than inferred ad hoc from ordinary Prisma relation queries.

Product Search documents should be kept current by catalog mutations. Mutations affecting 50 or fewer Products refresh search documents synchronously; larger fan-out changes enqueue batched reindexing to keep Vercel request duration predictable.

The mutation-count threshold in the preceding paragraph is superseded by ADR-0014. The Postgres full-text search decision remains accepted.
