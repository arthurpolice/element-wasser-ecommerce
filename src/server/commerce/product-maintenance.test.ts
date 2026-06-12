import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildProductImageKey } from '~/lib/product-images'
import { firstMockCall } from '~/test/mock-calls'

vi.mock('~/server/storage/s3', () => ({
  isS3Configured: vi.fn(),
  getProductImagePublicUrl: vi.fn(
    (key: string) => `https://cdn.example.com/${key}`
  )
}))

import {
  createProduct,
  updateProduct,
  type ProductMaintenanceError
} from '~/server/commerce/product-maintenance'
import { isS3Configured } from '~/server/storage/s3'

const now = new Date('2026-05-15T10:00:00Z')
const uploadId = '550e8400-e29b-41d4-a716-446655440000'

const productDescription = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Naturally sparkling mineral water.' }]
    }
  ]
}

const baseInput = {
  name: 'Mineral Water',
  manufacturerName: 'Element Wasser',
  priceCents: 500,
  costCents: 200,
  stockOnHand: 12,
  dispatchMinDays: 1,
  dispatchMaxDays: 3,
  active: true,
  featured: false,
  categoryIds: ['category-1', 'category-2']
}

type ProductMutationData = Record<string, unknown> & {
  categories?: { create: unknown[] }
}

type ProductMutationArgs = {
  data: ProductMutationData
  include?: unknown
}

function createMockDb() {
  const manufacturer = {
    id: 'manufacturer-1',
    name: 'Element Wasser',
    slug: 'element-wasser'
  }

  const db = {
    product: {
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; slug?: string } }) => {
          if (where.id === 'product-1') {
            return { id: 'product-1' }
          }

          return null
        }
      ),
      create: vi.fn(async ({ data, include }: ProductMutationArgs) => ({
        id: 'product-1',
        createdAt: now,
        updatedAt: now,
        discountPercent: null,
        stockReserved: 0,
        _count: { categories: data.categories?.create.length ?? 0 },
        manufacturer: { name: manufacturer.name },
        ...data,
        include
      })),
      update: vi.fn(
        async ({
          data,
          include
        }: {
          data: Record<string, unknown>
          include?: unknown
        }) => ({
          id: 'product-1',
          createdAt: now,
          updatedAt: now,
          sku: 'EW-ELE-MIN-00001',
          slug: 'mineral-water',
          discountPercent: null,
          stockReserved: 0,
          _count: { categories: 2 },
          manufacturer: { name: manufacturer.name },
          ...data,
          include
        })
      )
    },
    manufacturer: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => manufacturer),
      create: vi.fn(async () => manufacturer)
    },
    category: {
      findMany: vi.fn(async () => [{ id: 'category-1' }, { id: 'category-2' }])
    },
    productSkuSequence: {
      upsert: vi.fn(async () => ({ nextNumber: 2 }))
    },
    productCategory: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 2 }))
    },
    $transaction: vi.fn(
      async (
        callback: (tx: typeof db) => Promise<unknown>,
        _options: unknown
      ) => callback(db)
    )
  }

  return db
}

describe('Product Maintenance', () => {
  beforeEach(() => {
    vi.mocked(isS3Configured).mockReset()
  })

  it('creates a Product with generated SKU, slug, Product Description, Product Images, and Category membership', async () => {
    vi.mocked(isS3Configured).mockReturnValue(true)
    const db = createMockDb()
    const imageKey = buildProductImageKey(uploadId, 0, 'image/jpeg')

    await createProduct(db as never, {
      ...baseInput,
      description: productDescription,
      images: [{ key: imageKey, sortOrder: 0, altText: 'Bottle' }]
    })

    expect(db.productSkuSequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { prefix: 'ELE-MIN' }
      })
    )
    const [productCreateArgs] = firstMockCall(db.product.create)
    expect(productCreateArgs.data).toMatchObject({
      name: 'Mineral Water',
      sku: 'EW-ELE-MIN-00001',
      slug: 'mineral-water',
      manufacturerId: 'manufacturer-1',
      description: productDescription,
      images: {
        create: [
          {
            url: `https://cdn.example.com/${imageKey}`,
            altText: 'Bottle',
            sortOrder: 0
          }
        ]
      },
      categories: {
        create: [
          { categoryId: 'category-1', sortOrder: 0 },
          { categoryId: 'category-2', sortOrder: 1 }
        ]
      }
    })
  })

  it('rejects Product Images when storage is not configured', async () => {
    vi.mocked(isS3Configured).mockReturnValue(false)
    const db = createMockDb()

    await expect(
      createProduct(db as never, {
        ...baseInput,
        images: [
          {
            key: buildProductImageKey(uploadId, 0, 'image/jpeg'),
            sortOrder: 0
          }
        ]
      })
    ).rejects.toMatchObject({
      code: 'IMAGE_UPLOADS_NOT_CONFIGURED',
      message: 'Image uploads are not configured.'
    } satisfies Partial<ProductMaintenanceError>)

    expect(db.product.create).not.toHaveBeenCalled()
  })

  it('updates a Product and replaces Category membership', async () => {
    const db = createMockDb()

    await updateProduct(db as never, {
      id: 'product-1',
      ...baseInput,
      description: productDescription
    })

    const [productUpdateArgs] = firstMockCall(db.product.update)
    expect(productUpdateArgs).toMatchObject({
      where: { id: 'product-1' },
      data: {
        description: productDescription,
        manufacturerId: 'manufacturer-1'
      }
    })
    expect(db.productCategory.deleteMany).toHaveBeenCalledWith({
      where: { productId: 'product-1' }
    })
    expect(db.productCategory.createMany).toHaveBeenCalledWith({
      data: [
        { productId: 'product-1', categoryId: 'category-1', sortOrder: 0 },
        { productId: 'product-1', categoryId: 'category-2', sortOrder: 1 }
      ]
    })
  })

  it('rejects an invalid Dispatch Estimate before writing', async () => {
    const db = createMockDb()

    await expect(
      createProduct(db as never, {
        ...baseInput,
        dispatchMinDays: 5,
        dispatchMaxDays: 3
      })
    ).rejects.toMatchObject({
      code: 'INVALID_DISPATCH_ESTIMATE',
      message: 'Dispatch estimate max days must be at least min days.'
    } satisfies Partial<ProductMaintenanceError>)

    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
