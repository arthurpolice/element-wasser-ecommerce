import { describe, expect, it, vi } from 'vitest'

import {
  backfillProductSearchDocuments,
  extractProductDescriptionSearchText,
  getProductSearchSuggestions,
  isSkuLikeSearchQuery,
  searchProducts,
  upsertProductSearchDocument
} from '~/server/commerce/product-search'

const productDescription = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Sparkling mineral water' }]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Customer-readable filter cartridge copy.' },
        {
          type: 'text',
          text: 'Ignored link metadata',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/raw' } }]
        }
      ]
    }
  ]
}

const product = {
  id: 'product-1',
  name: 'Cartridge Pack',
  sku: 'EW-CAR-00001',
  description: productDescription,
  manufacturer: { name: 'Element Wasser' },
  categories: [
    { category: { name: 'Replacement Cartridges' } },
    { category: { name: 'Water Filters' } }
  ]
}

const storefrontProduct = {
  id: 'product-1',
  name: 'Cartridge Pack',
  slug: 'cartridge-pack',
  priceCents: 2500,
  discountPercent: null,
  dispatchMinDays: 1,
  dispatchMaxDays: 3,
  active: true,
  featured: true,
  description: null,
  manufacturer: { name: 'Element Wasser' },
  images: [
    { url: 'https://cdn.example.com/cartridge.jpg', altText: 'Cartridge' }
  ],
  approvedReviewCount: 1,
  approvedReviewRatingSum: 5
}

describe('Product Search', () => {
  it('detects SKU-like Product Search queries', () => {
    expect(isSkuLikeSearchQuery('EW-CAR')).toBe(true)
    expect(isSkuLikeSearchQuery('00001')).toBe(true)
    expect(isSkuLikeSearchQuery('cartridge')).toBe(false)
  })

  it('extracts customer-readable Product Description text', () => {
    expect(extractProductDescriptionSearchText(productDescription)).toBe(
      'Sparkling mineral water Customer-readable filter cartridge copy. Ignored link metadata'
    )
  })

  it('upserts inspectable Product Search document text and weighted vector SQL', async () => {
    const db = {
      $executeRaw: vi.fn(async () => 1)
    }

    await upsertProductSearchDocument(db as never, product)

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = db.$executeRaw.mock.calls[0] as unknown[]
    expect(String(strings)).toContain('ProductSearchDocument')
    expect(String(strings)).toContain('setweight')
    expect(String(strings)).toContain("setweight(to_tsvector('simple', ")
    expect(String(strings)).toContain("), 'A')")
    expect(String(strings)).toContain("), 'B')")
    expect(String(strings)).toContain("), 'C')")
    expect(String(strings)).toContain("), 'D')")
    expect(values).toContain('Cartridge Pack')
    expect(values).toContain('Element Wasser')
    expect(values).toContain('EW-CAR-00001')
    expect(values).toContain('Replacement Cartridges Water Filters')
    expect(values).toContain(
      'Sparkling mineral water Customer-readable filter cartridge copy. Ignored link metadata'
    )
  })

  it('backfills Product Search documents in batches', async () => {
    const secondProduct = {
      ...product,
      id: 'product-2',
      name: 'Filter Housing'
    }
    const db = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([product])
          .mockResolvedValueOnce([secondProduct])
          .mockResolvedValueOnce([])
      },
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn()
    }

    await expect(
      backfillProductSearchDocuments(db as never, { batchSize: 1 })
    ).resolves.toEqual({ processedCount: 2 })

    expect(db.product.findMany).toHaveBeenCalledTimes(3)
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
  })

  it('returns suggestions from Product Search documents without rank internals', async () => {
    const db = {
      $queryRaw: vi.fn(async () => [
        {
          id: 'product-1',
          slug: 'cartridge-pack',
          name: 'Cartridge Pack',
          sku: 'EW-CAR-00001',
          showSku: false,
          manufacturerName: 'Element Wasser',
          active: true,
          availableToSell: true,
          imageUrl: 'https://cdn.example.com/cartridge.jpg',
          imageAlt: 'Cartridge',
          rank: 0.9
        }
      ])
    }

    await expect(
      getProductSearchSuggestions(db as never, {
        query: 'cartridge',
        limit: 12
      })
    ).resolves.toEqual([
      {
        id: 'product-1',
        slug: 'cartridge-pack',
        name: 'Cartridge Pack',
        sku: 'EW-CAR-00001',
        showSku: false,
        manufacturerName: 'Element Wasser',
        active: true,
        availableToSell: true,
        imageUrl: 'https://cdn.example.com/cartridge.jpg',
        imageAlt: 'Cartridge'
      }
    ])

    const [strings, ...values] = db.$queryRaw.mock.calls[0] as unknown[]
    expect(String(strings)).toContain('ProductSearchDocument')
    expect(String(strings)).toContain('p."active" = true')
    expect(String(strings)).toContain(
      'to_tsvector(\'simple\', document."skuText") @@ search_query.query'
    )
    expect(String(strings)).toContain('ORDER BY "rank" DESC, p."name" ASC')
    expect(values).toContain('cartridge:*')
    expect(values).toContain(false)
    expect(values).toContain(6)
  })

  it('supports prefix matching and SKU presentation for SKU-like queries', async () => {
    const db = {
      $queryRaw: vi.fn(async () => [
        {
          id: 'product-1',
          slug: 'cartridge-pack',
          name: 'Cartridge Pack',
          sku: 'EW-CAR-00001',
          showSku: true,
          manufacturerName: 'Element Wasser',
          active: true,
          availableToSell: false,
          imageUrl: null,
          imageAlt: null,
          rank: 0.9
        }
      ])
    }

    await expect(
      getProductSearchSuggestions(db as never, {
        query: 'EW-CAR'
      })
    ).resolves.toEqual([
      {
        id: 'product-1',
        slug: 'cartridge-pack',
        name: 'Cartridge Pack',
        sku: 'EW-CAR-00001',
        showSku: true,
        manufacturerName: 'Element Wasser',
        active: true,
        availableToSell: false,
        imageUrl: null,
        imageAlt: null
      }
    ])

    const values = (db.$queryRaw.mock.calls[0] as unknown[]).slice(1)
    expect(values).toContain('ew:* & car:*')
    expect(values).toContain(true)
  })

  it('skips empty suggestion queries', async () => {
    const db = {
      $queryRaw: vi.fn()
    }

    await expect(
      getProductSearchSuggestions(db as never, { query: '   ' })
    ).resolves.toEqual([])

    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns full Product Search results in relevance order with facets', async () => {
    const secondStorefrontProduct = {
      ...storefrontProduct,
      id: 'product-2',
      name: 'Aqua Filter',
      slug: 'aqua-filter',
      featured: false,
      images: [],
      approvedReviewCount: 0,
      approvedReviewRatingSum: 0
    }
    const db = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ count: 2n }])
        .mockResolvedValueOnce([
          { productId: 'product-2', rank: 0.9 },
          { productId: 'product-1', rank: 0.8 }
        ])
        .mockResolvedValueOnce([
          { id: 'category-1', name: 'Replacement Cartridges', count: 2n }
        ])
        .mockResolvedValueOnce([
          { id: 'manufacturer-1', name: 'Element Wasser', count: 2n }
        ]),
      product: {
        findMany: vi.fn(async () => [
          storefrontProduct,
          secondStorefrontProduct
        ])
      }
    }

    await expect(
      searchProducts(db as never, {
        query: 'filter',
        categoryId: 'category-1',
        manufacturerId: 'manufacturer-1',
        page: 1,
        pageSize: 12
      })
    ).resolves.toMatchObject({
      totalCount: 2,
      totalPages: 1,
      categoryFacets: [
        { id: 'category-1', name: 'Replacement Cartridges', count: 2 }
      ],
      manufacturerFacets: [
        { id: 'manufacturer-1', name: 'Element Wasser', count: 2 }
      ],
      items: [
        { id: 'product-2', slug: 'aqua-filter' },
        { id: 'product-1', slug: 'cartridge-pack' }
      ]
    })

    const resultQuery = String(db.$queryRaw.mock.calls[1]?.[0])
    const categoryFacetQuery = String(db.$queryRaw.mock.calls[2]?.[0])
    expect(resultQuery).toContain('ORDER BY "rank" DESC, p."name" ASC')
    expect(resultQuery).not.toContain('featured')
    expect(categoryFacetQuery).toContain('NOT EXISTS')
    expect(categoryFacetQuery).toContain('child."parentId" = c."id"')
  })
})
