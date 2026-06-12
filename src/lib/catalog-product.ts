import type { Prisma } from '../../generated/prisma'

export type StorefrontProductImage = {
  id: string
  url: string
  altText: string | null
}

export type StorefrontProductCategory = {
  id: string
  name: string
  slugPath: string
  breadcrumbs: Array<{
    id: string
    name: string
    slugPath: string
  }>
}

export type StorefrontProduct = {
  id: string
  name: string
  slug: string
  manufacturerName: string
  priceCents: number
  discountPercent: number | null
  dispatchMinDays: number
  dispatchMaxDays: number
  imageUrl: string | null
  imageAlt: string | null
  reviewCount: number
  averageRating: number | null
}

export type StorefrontProductDetail = StorefrontProduct & {
  availableStock: number
  availableToSell: boolean
  description: Prisma.JsonValue | null
  images: StorefrontProductImage[]
  categories: StorefrontProductCategory[]
}

const productInclude = {
  manufacturer: { select: { name: true } },
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true, altText: true }
  },
  reviews: {
    where: { status: 'APPROVED' as const },
    select: { rating: true }
  }
} satisfies Prisma.ProductInclude

const productDetailInclude = {
  manufacturer: { select: { name: true } },
  images: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, url: true, altText: true }
  },
  reviews: {
    where: { status: 'APPROVED' as const },
    select: { rating: true }
  },
  categories: {
    where: { category: { active: true } },
    orderBy: { sortOrder: 'asc' as const },
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          sortOrder: true
        }
      }
    }
  }
} satisfies Prisma.ProductInclude

export type ProductWithStorefrontRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude
}>

export type ProductDetailWithStorefrontRelations = Prisma.ProductGetPayload<{
  include: typeof productDetailInclude
}>

type CategoryPathSource = {
  id: string
  name: string
  slug: string
  parentId: string | null
}

function buildCategoryBreadcrumbs(
  category: CategoryPathSource,
  categoriesById: Map<string, CategoryPathSource>
): StorefrontProductCategory['breadcrumbs'] {
  const categories = [category]
  let parentId = category.parentId
  const seenIds = new Set([category.id])

  while (parentId) {
    if (seenIds.has(parentId)) {
      break
    }

    const parent = categoriesById.get(parentId)
    if (!parent) {
      break
    }

    seenIds.add(parent.id)
    categories.unshift(parent)
    parentId = parent.parentId
  }

  return categories.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    slugPath: categories
      .slice(0, index + 1)
      .map((pathEntry) => pathEntry.slug)
      .join('/')
  }))
}

export function mapStorefrontProduct(
  product: ProductWithStorefrontRelations
): StorefrontProduct {
  const primaryImage = product.images[0]
  const reviewCount = product.reviews.length
  const averageRating =
    reviewCount > 0
      ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
        reviewCount
      : null

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    manufacturerName: product.manufacturer.name,
    priceCents: product.priceCents,
    discountPercent: product.discountPercent,
    dispatchMinDays: product.dispatchMinDays,
    dispatchMaxDays: product.dispatchMaxDays,
    imageUrl: primaryImage?.url ?? null,
    imageAlt: primaryImage?.altText ?? null,
    reviewCount,
    averageRating
  }
}

export function mapStorefrontProductDetail(
  product: ProductDetailWithStorefrontRelations,
  allActiveCategories: CategoryPathSource[]
): StorefrontProductDetail {
  const categoriesById = new Map(
    allActiveCategories.map((category) => [category.id, category])
  )
  const availableStock = product.stockOnHand - product.stockReserved

  return {
    ...mapStorefrontProduct(product),
    availableStock,
    availableToSell: availableStock > 0,
    description: product.description,
    images: product.images,
    categories: product.categories.map(({ category }) => {
      const breadcrumbs = buildCategoryBreadcrumbs(category, categoriesById)

      return {
        id: category.id,
        name: category.name,
        slugPath: breadcrumbs.at(-1)?.slugPath ?? category.slug,
        breadcrumbs
      }
    })
  }
}

export {
  productDetailInclude as storefrontProductDetailInclude,
  productInclude as storefrontProductInclude
}
