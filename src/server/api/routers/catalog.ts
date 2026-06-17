import { z } from 'zod'

import {
  collectDescendantCategoryIds,
  resolveCategoryPath
} from '~/lib/category-path'
import {
  mapStorefrontProduct,
  mapStorefrontProductDetail,
  storefrontProductDetailInclude,
  storefrontProductInclude
} from '~/lib/catalog-product'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import {
  getProductSearchSuggestions,
  searchProducts
} from '~/server/commerce/product-search'

const listProductsInputSchema = z.object({
  slugPath: z.string().trim().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(48).default(12)
})

const resolveCategoryInputSchema = z.object({
  slugPath: z.string().trim().min(1)
})

const searchSuggestionsInputSchema = z.object({
  q: z.string().trim(),
  limit: z.number().int().min(1).max(6).default(6)
})

const searchProductsInputSchema = z.object({
  q: z.string().trim(),
  categoryId: z.string().trim().min(1).optional(),
  manufacturerId: z.string().trim().min(1).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(48).default(12)
})

type NavigationCategory = {
  id: string
  name: string
  slug: string
  slugPath: string
  sortOrder: number
  children: NavigationCategory[]
}

function buildNavigationTree(
  categories: Array<{
    id: string
    name: string
    slug: string
    parentId: string | null
    sortOrder: number
  }>,
  parentId: string | null,
  parentSlugPath = ''
): NavigationCategory[] {
  return categories
    .filter((category) => category.parentId === parentId)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder
      }
      return left.name.localeCompare(right.name)
    })
    .map((category) => {
      const slugPath = parentSlugPath
        ? `${parentSlugPath}/${category.slug}`
        : category.slug

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        slugPath,
        sortOrder: category.sortOrder,
        children: buildNavigationTree(categories, category.id, slugPath)
      }
    })
}

export const catalogRouter = createTRPCRouter({
  searchSuggestions: publicProcedure
    .input(searchSuggestionsInputSchema)
    .query(async ({ ctx, input }) =>
      getProductSearchSuggestions(ctx.db, {
        query: input.q,
        limit: input.limit
      })
    ),

  searchProducts: publicProcedure
    .input(searchProductsInputSchema)
    .query(async ({ ctx, input }) =>
      searchProducts(ctx.db, {
        query: input.q,
        categoryId: input.categoryId,
        manufacturerId: input.manufacturerId,
        page: input.page,
        pageSize: input.pageSize
      })
    ),

  navigationTree: publicProcedure.query(async ({ ctx }) => {
    const categories = await ctx.db.category.findMany({
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

    return buildNavigationTree(categories, null)
  }),

  resolveCategory: publicProcedure
    .input(resolveCategoryInputSchema)
    .query(async ({ ctx, input }) => {
      const slugSegments = input.slugPath.split('/').filter(Boolean)
      const categories = await ctx.db.category.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          sortOrder: true
        }
      })

      const resolved = resolveCategoryPath(categories, slugSegments)
      if (!resolved) {
        return null
      }

      const category = categories.find(
        (entry) => entry.id === resolved.categoryId
      )

      if (!category) {
        return null
      }

      return {
        ...category,
        slugPath: resolved.slugPath
      }
    }),

  listCategoryProducts: publicProcedure
    .input(listProductsInputSchema)
    .query(async ({ ctx, input }) => {
      const slugSegments = input.slugPath.split('/').filter(Boolean)
      const categories = await ctx.db.category.findMany({
        where: { active: true },
        select: { id: true, slug: true, parentId: true }
      })

      const resolved = resolveCategoryPath(categories, slugSegments)
      if (!resolved) {
        return null
      }

      const categoryIds = collectDescendantCategoryIds(
        categories,
        resolved.categoryId
      )
      const skip = (input.page - 1) * input.pageSize

      const where = {
        active: true,
        categories: {
          some: {
            categoryId: { in: categoryIds }
          }
        }
      }

      const [totalCount, products] = await ctx.db.$transaction([
        ctx.db.product.count({ where }),
        ctx.db.product.findMany({
          where,
          include: storefrontProductInclude,
          orderBy: [{ featured: 'desc' }, { name: 'asc' }],
          skip,
          take: input.pageSize
        })
      ])

      return {
        slugPath: resolved.slugPath,
        categoryId: resolved.categoryId,
        items: products.map(mapStorefrontProduct),
        page: input.page,
        pageSize: input.pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize))
      }
    }),

  getProductBySlug: publicProcedure
    .input(z.object({ slug: z.string().trim().min(1) }))
    .query(async ({ ctx, input }) => {
      const [product, allActiveCategories] = await ctx.db.$transaction([
        ctx.db.product.findFirst({
          where: { slug: input.slug, active: true },
          include: storefrontProductDetailInclude
        }),
        ctx.db.category.findMany({
          where: { active: true },
          select: { id: true, name: true, slug: true, parentId: true }
        })
      ])

      if (!product) {
        return null
      }

      return mapStorefrontProductDetail(product, allActiveCategories)
    }),

  homepageSections: publicProcedure.query(async ({ ctx }) => {
    const rootCategories = await ctx.db.category.findMany({
      where: { active: true, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        sortOrder: true
      }
    })

    const allCategories = await ctx.db.category.findMany({
      where: { active: true },
      select: { id: true, slug: true, parentId: true }
    })

    const sections = await Promise.all(
      rootCategories.map(async (category) => {
        const categoryIds = collectDescendantCategoryIds(
          allCategories,
          category.id
        )

        const featuredProducts = await ctx.db.product.findMany({
          where: {
            active: true,
            featured: true,
            categories: {
              some: {
                categoryId: { in: categoryIds }
              }
            }
          },
          include: storefrontProductInclude,
          orderBy: [{ name: 'asc' }],
          take: 4
        })

        const mappedFeatured = featuredProducts.map(mapStorefrontProduct)
        const missingCount = Math.max(0, 4 - mappedFeatured.length)

        let fallbackProducts: ReturnType<typeof mapStorefrontProduct>[] = []

        if (missingCount > 0) {
          const featuredIds = mappedFeatured.map((product) => product.id)

          const products = await ctx.db.product.findMany({
            where: {
              active: true,
              featured: false,
              id: featuredIds.length ? { notIn: featuredIds } : undefined,
              categories: {
                some: {
                  categoryId: { in: categoryIds }
                }
              }
            },
            include: storefrontProductInclude,
            orderBy: [{ name: 'asc' }],
            take: missingCount
          })

          fallbackProducts = products.map(mapStorefrontProduct)
        }

        return {
          category,
          slugPath: category.slug,
          products: [...mappedFeatured, ...fallbackProducts]
        }
      })
    )

    return sections.filter((section) => section.products.length > 0)
  })
})
