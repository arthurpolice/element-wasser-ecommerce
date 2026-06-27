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
import {
  getActiveCategoryTree,
  getCategoryNavigation,
  getHomepageSections
} from '~/server/commerce/catalog-cache'

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

  navigationTree: publicProcedure.query(({ ctx }) =>
    getCategoryNavigation(ctx.db)
  ),

  resolveCategory: publicProcedure
    .input(resolveCategoryInputSchema)
    .query(async ({ ctx, input }) => {
      const slugSegments = input.slugPath.split('/').filter(Boolean)
      const categories = await getActiveCategoryTree(ctx.db)

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
      const categories = await getActiveCategoryTree(ctx.db)

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

      const products = await ctx.db.product.findMany({
        where,
        include: storefrontProductInclude,
        orderBy: [{ featured: 'desc' }, { name: 'asc' }],
        skip,
        take: input.pageSize + 1
      })
      const hasNextPage = products.length > input.pageSize

      return {
        slugPath: resolved.slugPath,
        categoryId: resolved.categoryId,
        items: products.slice(0, input.pageSize).map(mapStorefrontProduct),
        page: input.page,
        pageSize: input.pageSize,
        hasNextPage
      }
    }),

  getProductBySlug: publicProcedure
    .input(z.object({ slug: z.string().trim().min(1) }))
    .query(async ({ ctx, input }) => {
      const [product, allActiveCategories] = await Promise.all([
        ctx.db.product.findFirst({
          where: { slug: input.slug, active: true },
          include: storefrontProductDetailInclude
        }),
        getActiveCategoryTree(ctx.db)
      ])

      if (!product) {
        return null
      }

      return mapStorefrontProductDetail(product, allActiveCategories)
    }),

  homepageSections: publicProcedure.query(({ ctx }) =>
    getHomepageSections(ctx.db)
  )
})
