# Product Search

Product Search is global customer-facing product discovery over active Products. Results are Products only; Category and Manufacturer can shape relevance or refinement, but they are not standalone search results.

## Current decisions

- The Product Search bar should focus on Product Search Suggestions shown in a dropdown while the customer types.
- Product Search Suggestions link directly to Product detail pages.
- Product Search Suggestions show a limited set of the best matches: 6 on desktop and 5 on mobile.
- Product Search Suggestions show the Product's main image, Product name, and Manufacturer in small text.
- Product Search Suggestions do not show Category breadcrumbs.
- Product Search Suggestions do not show pricing data.
- Product Search Suggestions show active Products that are not currently orderable, but visually mute them and show a small customer-facing availability badge such as "Out of stock".
- Product orderability does not affect Product Search Relevance in the first version.
- Product Search Suggestions do not show Product Description.
- Product Search Suggestions provide a path to view all matching Products whenever there is at least one match, even when the match count is below the suggestion limit.
- Product Search Suggestions begin after the first meaningful query character.
- Product Search Suggestions are debounced while the customer types.
- Product Search Suggestions support pointer selection in the first version.
- Clicking outside the Product Search Suggestion dropdown closes it while preserving the typed query.
- Selecting a Product Search Suggestion navigates to the Product detail page.
- On the full Product Search results page, the Product Search bar shows the current `q` query value.
- Product Search Suggestions show a compact "No products found" empty state after a debounced query returns no matches.
- Product Search does not show trending searches or recent searches in the first version.
- A full Product Search results page handles submitted queries, larger result sets, zero-result messaging, and explicit Category and Manufacturer refinements.
- Full Product Search result refinements are facets from the current matched result set, not full catalog lists; Category and Manufacturer facets should avoid dead-end choices and may show counts.
- Category facets use leaf Category assignments only, not ancestor Category contexts.
- Products assigned to multiple leaf Categories contribute to each matching Category facet.
- Full Product Search supports at most one selected Category facet and one selected Manufacturer facet in the first version.
- Product Search documents store searchable Category text for relevance; Category facets are computed from ProductCategory and Category relationships.
- The full Product Search results page reuses the storefront Product card grid where possible, sorted by Product Search Relevance rather than Featured Product status or Product name.
- The full Product Search results page route is the localized storefront `/search` route with the query in `q`, for example `/{locale}/search?q=cartridge`.
- Product Search Suggestions and full Product Search results are served through public tRPC catalog queries.
- Product Search does not include custom app-level rate limiting in the first version; it relies on debounced suggestions, small result limits, indexed queries, and platform protections.
- Product Search Relevance is based on Product name, Manufacturer, Category, SKU, and Product Description.
- Product name and Manufacturer are the strongest textual relevance signals.
- Category is discovery context.
- SKU supports precise customer-facing lookup for now, pending validation in the actual Product Search Suggestion UI.
- Product Search Suggestions show SKU only when the query appears SKU-like or the SKU matched.
- Product Description is supporting text.
- Product Search Relevance uses fixed signal weighting in the first version: Product name highest, Manufacturer and SKU high, Category medium, and Product Description low.
- Products with equal Product Search Relevance sort by Product name ascending.
- Product Description contributes extracted plain text from customer-readable structured content; formatting, editor metadata, raw JSON, HTML, and Product Image alt text are not Product Search signals in the first version.
- Featured Product status does not boost Product Search Relevance.
- A Product Search result should match every meaningful query term somewhere across the searchable product language.
- Product Search queries are normalized by trimming whitespace, matching case-insensitively, splitting on spaces and punctuation, and ignoring very short noise terms.
- Product Search supports prefix matching for in-progress query terms, so suggestions can match partial words while the customer types.
- Product Search does not support typo tolerance in the first version.
- Product Search should not include custom synonym logic in the first version.
- Product Search is locale-routed but content-language agnostic in the first version: UI labels are localized, while relevance searches the single catalog language stored in Product, Manufacturer, Category, SKU, and Product Description data.
- Product Search is not implicitly scoped by the Category page the customer is viewing.
- Product Search does not track query, suggestion-click, or zero-result analytics in the first version.
- Product Search Relevance should be implemented with Postgres full-text search rather than a hand-rolled Prisma scorer or a dedicated search service.
- Product Search should use a separate Product Search document per Product rather than building relevance from live joins at query time.
- Product Search documents should store inspectable text per relevance signal and a weighted search vector for ranking.
- Each Product should have a Product Search document, including inactive Products; Product Search queries filter to active Products.
- Product Search reads Product Search documents only; Products with missing Product Search documents are absent from Product Search until rebuild or reindex creates the missing documents.
- Product Search document refresh uses an affected-Product threshold: refresh synchronously when a catalog mutation affects 50 or fewer Products, and enqueue batched reindexing when it affects more than 50 Products.
- Products remain visible through their existing Product Search documents while async reindexing catches up after large fan-out catalog changes.

## TODO

- Explore Related Product suggestions as a fallback for zero-result Product Search queries.
- Add keyboard navigation for Product Search Suggestions.
- Add Product Search analytics for zero-result queries and suggestion clicks.
- Add a Product Search document rebuild path for rollout and repair.
- Add custom Product Search rate limiting if usage or abuse requires it.
- Add Postgres trigram typo tolerance if real Product Search usage shows missed matches from misspellings.
