import { revalidateTag, unstable_cache } from 'next/cache'
import type { PrismaClient } from '../../../generated/prisma'

import { collectDescendantCategoryIds } from '~/lib/category-path'
import {
  mapStorefrontProduct,
  storefrontProductInclude
} from '~/lib/catalog-product'
import { db as applicationDb } from '~/server/db'

export const ACTIVE_CATEGORY_TREE_TAG = 'catalog:active-category-tree'
export const CATEGORY_NAVIGATION_TAG = 'catalog:category-navigation'
export const HOMEPAGE_SECTIONS_TAG = 'catalog:homepage-sections'

export type ActiveCategoryTreeEntry = {
  id: string
  name: string
  slug: string
  parentId: string | null
  sortOrder: number
}

export type NavigationCategory = {
  id: string
  name: string
  slug: string
  slugPath: string
  sortOrder: number
  children: NavigationCategory[]
}

async function loadActiveCategoryTree(
  db: Pick<PrismaClient, 'category'>
): Promise<ActiveCategoryTreeEntry[]> {
  return db.category.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      sortOrder: true
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })
}

const getCachedActiveCategoryTree = unstable_cache(
  () => loadActiveCategoryTree(applicationDb),
  ['active-category-tree'],
  {
    tags: [ACTIVE_CATEGORY_TREE_TAG],
    revalidate: 60 * 60
  }
)

export function getActiveCategoryTree(
  db: Pick<PrismaClient, 'category'>
): Promise<ActiveCategoryTreeEntry[]> {
  return process.env.NODE_ENV === 'test'
    ? loadActiveCategoryTree(db)
    : getCachedActiveCategoryTree()
}

function buildNavigationTree(
  categories: ActiveCategoryTreeEntry[],
  visibleIds: Set<string>,
  parentId: string | null,
  parentSlugPath = ''
): NavigationCategory[] {
  return categories
    .filter(
      (category) =>
        category.parentId === parentId && visibleIds.has(category.id)
    )
    .map((category) => {
      const slugPath = parentSlugPath
        ? `${parentSlugPath}/${category.slug}`
        : category.slug

      return {
        ...category,
        slugPath,
        children: buildNavigationTree(
          categories,
          visibleIds,
          category.id,
          slugPath
        )
      }
    })
}

async function loadCategoryNavigation(
  db: Pick<PrismaClient, 'category' | 'productCategory'>
) {
  const categories = await loadActiveCategoryTree(db)
  const activeAssignments = await db.productCategory.findMany({
    where: {
      category: { active: true },
      product: { active: true }
    },
    select: { categoryId: true }
  })
  const categoriesById = new Map(
    categories.map((category) => [category.id, category])
  )
  const visibleIds = new Set<string>()

  for (const assignment of activeAssignments) {
    let category = categoriesById.get(assignment.categoryId)
    const seen = new Set<string>()

    while (category && !seen.has(category.id)) {
      seen.add(category.id)
      visibleIds.add(category.id)
      category = category.parentId
        ? categoriesById.get(category.parentId)
        : undefined
    }
  }

  return buildNavigationTree(categories, visibleIds, null)
}

const getCachedCategoryNavigation = unstable_cache(
  () => loadCategoryNavigation(applicationDb),
  ['category-navigation'],
  {
    tags: [CATEGORY_NAVIGATION_TAG],
    revalidate: 60 * 60
  }
)

export function getCategoryNavigation(
  db: Pick<PrismaClient, 'category' | 'productCategory'>
) {
  return process.env.NODE_ENV === 'test'
    ? loadCategoryNavigation(db)
    : getCachedCategoryNavigation()
}

async function loadHomepageSections(
  db: Pick<PrismaClient, 'category' | 'product'>
) {
  const allCategories = await loadActiveCategoryTree(db)
  const rootCategories = allCategories.filter(
    (category) => category.parentId === null
  )

  const sections = await Promise.all(
    rootCategories.map(async (category) => {
      const categoryIds = collectDescendantCategoryIds(
        allCategories,
        category.id
      )
      const featuredProducts = await db.product.findMany({
        where: {
          active: true,
          featured: true,
          categories: { some: { categoryId: { in: categoryIds } } }
        },
        include: storefrontProductInclude,
        orderBy: [{ name: 'asc' }],
        take: 4
      })
      const mappedFeatured = featuredProducts.map(mapStorefrontProduct)
      const missingCount = Math.max(0, 4 - mappedFeatured.length)
      const fallbackProducts =
        missingCount === 0
          ? []
          : (
              await db.product.findMany({
                where: {
                  active: true,
                  featured: false,
                  id: mappedFeatured.length
                    ? { notIn: mappedFeatured.map((product) => product.id) }
                    : undefined,
                  categories: { some: { categoryId: { in: categoryIds } } }
                },
                include: storefrontProductInclude,
                orderBy: [{ name: 'asc' }],
                take: missingCount
              })
            ).map(mapStorefrontProduct)

      return {
        category: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          sortOrder: category.sortOrder
        },
        slugPath: category.slug,
        products: [...mappedFeatured, ...fallbackProducts]
      }
    })
  )

  return sections.filter((section) => section.products.length > 0)
}

const getCachedHomepageSections = unstable_cache(
  () => loadHomepageSections(applicationDb),
  ['homepage-sections'],
  {
    tags: [HOMEPAGE_SECTIONS_TAG],
    revalidate: 15 * 60
  }
)

export function getHomepageSections(
  db: Pick<PrismaClient, 'category' | 'product'>
) {
  return process.env.NODE_ENV === 'test'
    ? loadHomepageSections(db)
    : getCachedHomepageSections()
}

export function invalidateCategoryStructureCache() {
  if (process.env.NODE_ENV === 'test') return
  revalidateTag(ACTIVE_CATEGORY_TREE_TAG)
  revalidateTag(CATEGORY_NAVIGATION_TAG)
  revalidateTag(HOMEPAGE_SECTIONS_TAG)
}

export function invalidateProductCatalogCache() {
  if (process.env.NODE_ENV === 'test') return
  revalidateTag(CATEGORY_NAVIGATION_TAG)
  revalidateTag(HOMEPAGE_SECTIONS_TAG)
}
