# Storefront browsing and merchandising

Element Wasser needs a customer-facing storefront for a small natural-products catalog. The storefront must feel distinct from the starter auth page and from the owner dashboard, while still being simple enough to build before Cart and Checkout.

Status: accepted

## Decision

Use a light, minimal storefront direction: warm mineral-paper surfaces, charcoal text, muted moss and water-blue accents, restrained borders, fine natural line details, and subtle fade-up motion. Do not reuse the starter auth page colors or the admin dashboard visual system for customer-facing storefront pages.

Model storefront browsing around nested Categories. Category URLs should express the Category tree, for example `/categories/water-filters/replacement-cartridges`. A root Category page acts as the root "All" view and includes Products assigned to that root Category and descendant Categories.

Keep Category slugs globally unique for now. Nested storefront paths are generated from the Category tree, but individual slugs continue to follow the current schema constraint. Revisit sibling-scoped slugs only if duplicate child Category names become a real merchant need.

Use expandable Category navigation: a desktop sidebar for root Categories and children, and a mobile Categories drawer so Product grids keep usable width. Each expanded root Category includes an "All" link at the top for the root Category aggregate view.

Use Featured Products for merchandising in Category contexts. A Product can be marked as featured, and that featured status applies wherever the Product appears through Category membership, including ancestor Category views. If a section does not have enough Featured Products, the storefront fills the gap with automatically selected active Products from that Category context.

Use URL-backed infinite scroll for Category Product grids. The first Product page renders with the route for SEO and fast first paint. Additional page chunks load as the customer nears the bottom, with a visible "Load more" fallback.

Include lightweight Product detail pages in the storefront browsing slice. Cart and Checkout remain outside this decision.

Maintain catalog content in the owner dashboard through two areas:

- **Categories**: create and organize the nested Category tree with a file-system-like expandable interface. Category moves support both reparenting and sibling reordering.
- **Products**: create and edit Products, including Category membership and Featured Product status, in the same product form.

Do not maintain Product Category membership through a separate assignment workflow.

Owner authentication lives at `/sign-in`; the public homepage is the storefront, not the sign-in screen.

## Considered Options

**Reusing the starter auth page or admin dashboard style** was rejected because those screens came from earlier scaffolding and do not represent the desired customer-facing brand.

**Flat Category URLs with global slugs only** were rejected for the storefront because they hide the parent-child relationship that the navigation is meant to communicate.

**Sibling-scoped Category slugs now** were deferred because the current schema already has globally unique slugs, and duplicate child Category names are not yet a proven merchant need.

**Review-first homepage highlights** were rejected for the first storefront because the store is small and may not have enough Reviews to make that strategy reliable.

**Root-Category-owned Featured Product lists** were replaced because they make the merchant manage promotion from the Category side even though promotion is a Product decision. Product-owned Featured Product status is simpler: if a Product is featured and appears in `Beauty / Make-up / Lips`, it is promoted in the `Beauty`, `Make-up`, and `Lips` contexts.

**Pure infinite scroll without visible controls** was rejected because customers should have a fallback control and URLs should preserve enough pagination state to make browsing shareable or restorable.

## Consequences

The storefront needs public catalog queries that are separate from owner-only dashboard queries and expose only customer-safe Product data.

The dashboard needs the Categories and Products maintenance flows above; otherwise the merchant cannot maintain storefront navigation, category grids, or Product promotion.

Product Category membership is edited together with the Product, so catalog maintenance stays in one place rather than splitting product data and category assignment across separate screens.

Category-specific Featured Product ordering is not part of this decision. Featured Products appear before non-featured Products within the relevant Category context, then follow the normal Product ordering.

Nested URL generation must stay consistent with the Category tree. If Category slugs later become sibling-scoped, URL resolution and uniqueness validation will need a schema change.

Homepage sections can launch before Reviews are populated because Featured Products and automatic fallback Products provide useful content for a small catalog.

The storefront visual system should be scoped separately from existing `dash-*` admin tokens so future customer pages do not inherit admin styling by accident.
