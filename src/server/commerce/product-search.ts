import { Prisma, type PrismaClient } from '../../../generated/prisma'
import {
  mapStorefrontProduct,
  storefrontProductInclude,
  type StorefrontProduct
} from '~/lib/catalog-product'
import { isQstashConfigured, publishQstashJson } from '~/server/queue/qstash'

export const PRODUCT_SEARCH_SUGGESTION_LIMIT = 6
export const PRODUCT_SEARCH_SYNC_THRESHOLD = 50
export const PRODUCT_SEARCH_REINDEX_BATCH_SIZE = 50
export const PRODUCT_SEARCH_REINDEX_QSTASH_PATH =
  '/api/qstash/catalog/search/reindex'
export const PRODUCT_SEARCH_REBUILD_QSTASH_PATH =
  '/api/qstash/catalog/search/rebuild'

type ProductSearchDb = Pick<
  PrismaClient,
  '$executeRaw' | '$queryRaw' | 'product'
>

type ProductSearchSyncDb = Pick<PrismaClient, '$executeRaw' | 'product'>

type ProductSearchDocumentProduct = {
  id: string
  name: string
  sku: string
  description: Prisma.JsonValue | null
  manufacturer: { name: string }
  categories: Array<{ category: { name: string } }>
}

export type ProductSearchSuggestion = {
  id: string
  slug: string
  name: string
  sku: string
  showSku: boolean
  manufacturerName: string
  active: boolean
  availableToSell: boolean
  imageUrl: string | null
  imageAlt: string | null
}

export type ProductSearchFacet = {
  id: string
  name: string
  count: number
}

export type ProductSearchResults = {
  items: StorefrontProduct[]
  categoryFacets: ProductSearchFacet[]
  manufacturerFacets: ProductSearchFacet[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

type ProductSearchSuggestionRow = ProductSearchSuggestion & {
  rank: number
}

type ProductSearchResultRow = {
  productId: string
  rank: number
}

type ProductSearchCountRow = {
  count: bigint | number
}

type ProductSearchProductIdRow = {
  productId: string
}

type ProductSearchFacetRow = ProductSearchFacet & {
  count: bigint | number
}

const productSearchDocumentSelect = {
  id: true,
  name: true,
  sku: true,
  description: true,
  manufacturer: { select: { name: true } },
  categories: {
    select: {
      category: {
        select: { name: true }
      }
    }
  }
} satisfies Prisma.ProductSelect

function normalizeSearchText(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
}

export function extractProductDescriptionSearchText(value: unknown): string {
  const textParts: string[] = []

  function visit(node: unknown) {
    if (!node || typeof node !== 'object') {
      return
    }

    if ('text' in node && typeof node.text === 'string') {
      textParts.push(node.text)
    }

    if ('content' in node && Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child)
      }
    }
  }

  visit(value)

  return normalizeSearchText(textParts)
}

function buildPrefixTsQuery(query: string) {
  const terms = query
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.map((term) => term.trim())
    .filter(Boolean)

  if (!terms?.length) {
    return null
  }

  return terms.map((term) => `${term}:*`).join(' & ')
}

function toCount(value: bigint | number) {
  return typeof value === 'bigint' ? Number(value) : value
}

export function isSkuLikeSearchQuery(query: string) {
  const normalizedQuery = query.trim()

  return /[0-9-]/.test(normalizedQuery)
}

function buildProductSearchDocument(product: ProductSearchDocumentProduct) {
  return {
    productId: product.id,
    productNameText: product.name,
    manufacturerText: product.manufacturer.name,
    skuText: product.sku,
    categoryText: normalizeSearchText(
      product.categories.map(({ category }) => category.name)
    ),
    descriptionText: extractProductDescriptionSearchText(product.description)
  }
}

export async function upsertProductSearchDocument(
  db: Pick<PrismaClient, '$executeRaw'>,
  product: ProductSearchDocumentProduct
) {
  const document = buildProductSearchDocument(product)

  await db.$executeRaw`
    INSERT INTO "ProductSearchDocument" (
      "productId",
      "productNameText",
      "manufacturerText",
      "skuText",
      "categoryText",
      "descriptionText",
      "searchVector",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${document.productId},
      ${document.productNameText},
      ${document.manufacturerText},
      ${document.skuText},
      ${document.categoryText},
      ${document.descriptionText},
      setweight(to_tsvector('simple', ${document.productNameText}), 'A') ||
        setweight(to_tsvector('simple', ${document.manufacturerText}), 'B') ||
        setweight(to_tsvector('simple', ${document.skuText}), 'B') ||
        setweight(to_tsvector('simple', ${document.categoryText}), 'C') ||
        setweight(to_tsvector('simple', ${document.descriptionText}), 'D'),
      now(),
      now()
    )
    ON CONFLICT ("productId") DO UPDATE SET
      "productNameText" = EXCLUDED."productNameText",
      "manufacturerText" = EXCLUDED."manufacturerText",
      "skuText" = EXCLUDED."skuText",
      "categoryText" = EXCLUDED."categoryText",
      "descriptionText" = EXCLUDED."descriptionText",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = now()
  `
}

export async function backfillProductSearchDocuments(
  db: ProductSearchDb,
  options: { productIds?: string[]; batchSize?: number } = {}
) {
  const batchSize = options.batchSize ?? 100
  let cursor: string | undefined
  let processedCount = 0

  while (true) {
    const products = await db.product.findMany({
      where: options.productIds ? { id: { in: options.productIds } } : {},
      select: productSearchDocumentSelect,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: batchSize
    })

    if (products.length === 0) {
      return { processedCount }
    }

    for (const product of products) {
      await upsertProductSearchDocument(db, product)
    }

    processedCount += products.length
    cursor = products.at(-1)?.id

    if (products.length < batchSize) {
      return { processedCount }
    }
  }
}

function uniqueProductIds(productIds: string[]) {
  return Array.from(new Set(productIds.filter(Boolean)))
}

export async function refreshProductSearchDocuments(
  db: ProductSearchSyncDb,
  productIds: string[]
) {
  const uniqueIds = uniqueProductIds(productIds)

  if (uniqueIds.length === 0) {
    return { refreshedCount: 0 }
  }

  const products = await db.product.findMany({
    where: { id: { in: uniqueIds } },
    select: productSearchDocumentSelect
  })

  for (const product of products) {
    await upsertProductSearchDocument(db, product)
  }

  return { refreshedCount: products.length }
}

export async function scheduleProductSearchReindex(productIds: string[]) {
  const uniqueIds = uniqueProductIds(productIds)

  if (uniqueIds.length === 0 || !isQstashConfigured()) {
    return null
  }

  return publishQstashJson({
    path: PRODUCT_SEARCH_REINDEX_QSTASH_PATH,
    body: { productIds: uniqueIds },
    contentBasedDeduplication: true,
    retries: 3,
    label: 'product-search-reindex'
  })
}

export async function syncProductSearchDocumentsForMutation(
  db: ProductSearchSyncDb,
  productIds: string[]
) {
  const uniqueIds = uniqueProductIds(productIds)

  if (uniqueIds.length <= PRODUCT_SEARCH_SYNC_THRESHOLD) {
    const result = await refreshProductSearchDocuments(db, uniqueIds)
    return { mode: 'sync' as const, ...result }
  }

  try {
    const enqueuedMessage = await scheduleProductSearchReindex(uniqueIds)

    if (enqueuedMessage) {
      return {
        mode: 'async' as const,
        enqueuedCount: uniqueIds.length
      }
    }
  } catch {
    // Fall back to local reindexing so catalog mutations do not leave search stale.
  }

  const result = await processProductSearchReindexBatch(db, uniqueIds)
  return { mode: 'sync' as const, ...result }
}

export async function processProductSearchReindexBatch(
  db: ProductSearchSyncDb,
  productIds: string[],
  batchSize = PRODUCT_SEARCH_REINDEX_BATCH_SIZE
) {
  const uniqueIds = uniqueProductIds(productIds)
  let refreshedCount = 0

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize)
    const result = await refreshProductSearchDocuments(db, batch)
    refreshedCount += result.refreshedCount
  }

  return {
    requestedCount: uniqueIds.length,
    refreshedCount
  }
}

export type ProductSearchRebuildMode = 'missing' | 'stale' | 'all'

export async function findProductSearchRebuildProductIds(
  db: Pick<PrismaClient, '$queryRaw'>,
  mode: ProductSearchRebuildMode
) {
  const staleFilter =
    mode === 'missing'
      ? Prisma.sql`document."productId" IS NULL`
      : mode === 'stale'
        ? Prisma.sql`document."productId" IS NULL OR document."updatedAt" < p."updatedAt"`
        : Prisma.sql`true`

  const rows = await db.$queryRaw<ProductSearchProductIdRow[]>`
    SELECT p."id" AS "productId"
    FROM "Product" p
    LEFT JOIN "ProductSearchDocument" document ON document."productId" = p."id"
    WHERE ${staleFilter}
    ORDER BY p."id" ASC
  `

  return rows.map((row) => row.productId)
}

function chunkProductIds(productIds: string[], batchSize: number) {
  const batches: string[][] = []

  for (let index = 0; index < productIds.length; index += batchSize) {
    batches.push(productIds.slice(index, index + batchSize))
  }

  return batches
}

export async function requestProductSearchDocumentRebuild(
  db: ProductSearchSyncDb & Pick<PrismaClient, '$queryRaw'>,
  input: {
    mode: ProductSearchRebuildMode
    batchSize?: number
  }
) {
  const batchSize = Math.min(Math.max(input.batchSize ?? 50, 1), 200)
  const productIds = await findProductSearchRebuildProductIds(db, input.mode)
  const batches = chunkProductIds(uniqueProductIds(productIds), batchSize)

  if (batches.length === 0) {
    return {
      mode: 'none' as const,
      requestedCount: 0,
      enqueuedBatchCount: 0,
      refreshedCount: 0
    }
  }

  async function runInlineRebuild() {
    let refreshedCount = 0

    for (const batch of batches) {
      const result = await processProductSearchReindexBatch(db, batch, batchSize)
      refreshedCount += result.refreshedCount
    }

    return {
      mode: 'sync' as const,
      requestedCount: productIds.length,
      enqueuedBatchCount: 0,
      refreshedCount
    }
  }

  if (isQstashConfigured()) {
    try {
      await Promise.all(
        batches.map((batch, index) =>
          publishQstashJson({
            path: PRODUCT_SEARCH_REBUILD_QSTASH_PATH,
            body: { productIds: batch },
            deduplicationId: `product-search-rebuild:${input.mode}:${index}:${batch.join(',')}`,
            retries: 3,
            label: 'product-search-rebuild'
          })
        )
      )

      return {
        mode: 'async' as const,
        requestedCount: productIds.length,
        enqueuedBatchCount: batches.length,
        refreshedCount: 0
      }
    } catch {
      return runInlineRebuild()
    }
  }

  return runInlineRebuild()
}

export async function getProductSearchSuggestions(
  db: Pick<PrismaClient, '$queryRaw'>,
  input: { query: string; limit?: number }
): Promise<ProductSearchSuggestion[]> {
  const tsQuery = buildPrefixTsQuery(input.query)
  if (!tsQuery) {
    return []
  }

  const limit = Math.min(
    Math.max(input.limit ?? PRODUCT_SEARCH_SUGGESTION_LIMIT, 1),
    PRODUCT_SEARCH_SUGGESTION_LIMIT
  )
  const showSkuForQuery = isSkuLikeSearchQuery(input.query)

  const rows = await db.$queryRaw<ProductSearchSuggestionRow[]>`
    WITH search_query AS (
      SELECT to_tsquery('simple', ${tsQuery}) AS query
    )
    SELECT
      p."id",
      p."slug",
      p."name",
      p."sku",
      (${showSkuForQuery} OR to_tsvector('simple', document."skuText") @@ search_query.query) AS "showSku",
      m."name" AS "manufacturerName",
      p."active",
      (p."stockOnHand" - p."stockReserved") > 0 AS "availableToSell",
      image."url" AS "imageUrl",
      image."altText" AS "imageAlt",
      ts_rank(document."searchVector", search_query.query) AS "rank"
    FROM "ProductSearchDocument" document
    INNER JOIN "Product" p ON p."id" = document."productId"
    INNER JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
    LEFT JOIN LATERAL (
      SELECT "url", "altText"
      FROM "ProductImage"
      WHERE "productId" = p."id"
      ORDER BY "sortOrder" ASC
      LIMIT 1
    ) image ON true
    CROSS JOIN search_query
    WHERE p."active" = true
      AND document."searchVector" @@ search_query.query
    ORDER BY "rank" DESC, p."name" ASC
    LIMIT ${limit}
  `

  return rows.map(({ rank: _rank, ...suggestion }) => suggestion)
}

export async function searchProducts(
  db: ProductSearchDb,
  input: {
    query: string
    categoryId?: string
    manufacturerId?: string
    page?: number
    pageSize?: number
  }
): Promise<ProductSearchResults> {
  const tsQuery = buildPrefixTsQuery(input.query)
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(Math.max(input.pageSize ?? 12, 1), 48)

  if (!tsQuery) {
    return {
      items: [],
      categoryFacets: [],
      manufacturerFacets: [],
      page,
      pageSize,
      totalCount: 0,
      totalPages: 1
    }
  }

  const categoryFilter = input.categoryId
    ? Prisma.sql`
      AND EXISTS (
        SELECT 1
        FROM "ProductCategory" selected_category
        WHERE selected_category."productId" = p."id"
          AND selected_category."categoryId" = ${input.categoryId}
      )
    `
    : Prisma.empty
  const manufacturerFilter = input.manufacturerId
    ? Prisma.sql`AND p."manufacturerId" = ${input.manufacturerId}`
    : Prisma.empty
  const skip = (page - 1) * pageSize

  const [countRows, resultRows, categoryFacetRows, manufacturerFacetRows] =
    await Promise.all([
      db.$queryRaw<ProductSearchCountRow[]>`
        WITH search_query AS (
          SELECT to_tsquery('simple', ${tsQuery}) AS query
        )
        SELECT COUNT(*) AS "count"
        FROM "ProductSearchDocument" document
        INNER JOIN "Product" p ON p."id" = document."productId"
        CROSS JOIN search_query
        WHERE p."active" = true
          AND document."searchVector" @@ search_query.query
          ${categoryFilter}
          ${manufacturerFilter}
      `,
      db.$queryRaw<ProductSearchResultRow[]>`
        WITH search_query AS (
          SELECT to_tsquery('simple', ${tsQuery}) AS query
        )
        SELECT
          p."id" AS "productId",
          ts_rank(document."searchVector", search_query.query) AS "rank"
        FROM "ProductSearchDocument" document
        INNER JOIN "Product" p ON p."id" = document."productId"
        CROSS JOIN search_query
        WHERE p."active" = true
          AND document."searchVector" @@ search_query.query
          ${categoryFilter}
          ${manufacturerFilter}
        ORDER BY "rank" DESC, p."name" ASC
        LIMIT ${pageSize}
        OFFSET ${skip}
      `,
      db.$queryRaw<ProductSearchFacetRow[]>`
        WITH search_query AS (
          SELECT to_tsquery('simple', ${tsQuery}) AS query
        )
        SELECT
          c."id",
          c."name",
          COUNT(DISTINCT p."id") AS "count"
        FROM "ProductSearchDocument" document
        INNER JOIN "Product" p ON p."id" = document."productId"
        INNER JOIN "ProductCategory" product_category ON product_category."productId" = p."id"
        INNER JOIN "Category" c ON c."id" = product_category."categoryId"
        CROSS JOIN search_query
        WHERE p."active" = true
          AND c."active" = true
          AND NOT EXISTS (
            SELECT 1
            FROM "Category" child
            WHERE child."parentId" = c."id"
              AND child."active" = true
          )
          AND document."searchVector" @@ search_query.query
          ${manufacturerFilter}
        GROUP BY c."id", c."name"
        ORDER BY "count" DESC, c."name" ASC
      `,
      db.$queryRaw<ProductSearchFacetRow[]>`
        WITH search_query AS (
          SELECT to_tsquery('simple', ${tsQuery}) AS query
        )
        SELECT
          m."id",
          m."name",
          COUNT(DISTINCT p."id") AS "count"
        FROM "ProductSearchDocument" document
        INNER JOIN "Product" p ON p."id" = document."productId"
        INNER JOIN "Manufacturer" m ON m."id" = p."manufacturerId"
        CROSS JOIN search_query
        WHERE p."active" = true
          AND document."searchVector" @@ search_query.query
          ${categoryFilter}
        GROUP BY m."id", m."name"
        ORDER BY "count" DESC, m."name" ASC
      `
    ])

  const totalCount = toCount(countRows[0]?.count ?? 0)
  const products = resultRows.length
    ? await db.product.findMany({
        where: { id: { in: resultRows.map((row) => row.productId) } },
        include: storefrontProductInclude
      })
    : []
  const productsById = new Map(products.map((product) => [product.id, product]))

  return {
    items: resultRows.flatMap((row) => {
      const product = productsById.get(row.productId)
      return product ? [mapStorefrontProduct(product)] : []
    }),
    categoryFacets: categoryFacetRows.map((facet) => ({
      ...facet,
      count: toCount(facet.count)
    })),
    manufacturerFacets: manufacturerFacetRows.map((facet) => ({
      ...facet,
      count: toCount(facet.count)
    })),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
  }
}
