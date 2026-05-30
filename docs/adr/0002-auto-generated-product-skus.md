# Auto-generated product SKUs

Element Wasser products need a stable unique code on the catalog and on order line snapshots, but the merchant does not assign or manage product codes manually.

Status: accepted

## Decision

Generate product SKUs on create using the format `EW-{MFG3}-{NAME3}-{SEQ5}` (for example `EW-BRI-WAT-00001`).

- **MFG3** and **NAME3** are the first three alphanumeric characters of the manufacturer name and product name, normalized and uppercased, padded with `X` when shorter than three characters.
- **SEQ5** is a five-digit sequence that increments per `{MFG3}-{NAME3}` prefix group inside a `ProductSkuSequence` table, mirroring yearly order number allocation.
- SKUs are assigned once and never change, even if the product or manufacturer name changes later.
- The merchant does not enter SKUs. The create-product form omits the field. SKUs remain visible read-only in the products table and order product picker, but are not searchable.

Order lines continue to snapshot `productSku` at checkout so historical orders stay readable if catalog names change.

## Considered Options

**Manual merchant SKUs** were rejected because the owner does not use or want to maintain product codes.

**Removing SKU entirely** was rejected because order lines and support still benefit from a stable product identifier distinct from internal database ids and URL slugs.

**Slug-derived SKUs** were rejected because slug already serves URL identity and would often duplicate it without adding operational value.

**Category-based hints** were rejected because products are not categorized at creation and may belong to multiple categories.

**Global sequence only** was rejected because prefix collisions are common when multiple products share the same manufacturer and name hints; a per-prefix counter keeps trailing digits meaningful within each group.

## Consequences

New products receive predictable, scannable codes without owner input. Prefix collisions (for example two "Water Filter" products from Brita) share a hint but remain unique via sequence. Renamed products keep their original SKU, which may no longer match the current name hints — that mismatch is intentional. Application code must allocate SKUs inside the product create transaction and must not expose SKU as create input.
