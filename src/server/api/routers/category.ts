import { Prisma } from '../../../../generated/prisma'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
  isCategoryDescendant,
  resolveMoveTarget,
  type CategoryMoveInput
} from '~/lib/category-tree'
import { createTRPCRouter, ownerProcedure } from '~/server/api/trpc'
import {
  assertCategoriesExist,
  replaceProductCategories
} from '~/lib/product-categories'
import { toSlug } from '~/lib/slug'

const createInputSchema = z.object({
  name: z.string().trim().min(1),
  parentId: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true)
})

const updateInputSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional()
})

const moveInputSchema = z.discriminatedUnion('intent', [
  z.object({
    categoryId: z.string(),
    intent: z.literal('inside'),
    targetCategoryId: z.string(),
    position: z.number().int().min(0).optional()
  }),
  z.object({
    categoryId: z.string(),
    intent: z.literal('before'),
    targetCategoryId: z.string()
  }),
  z.object({
    categoryId: z.string(),
    intent: z.literal('after'),
    targetCategoryId: z.string()
  })
])

const setProductCategoriesInputSchema = z.object({
  productId: z.string(),
  categoryIds: z.array(z.string())
})

const deleteInputSchema = z.object({
  id: z.string()
})

type CategoryRow = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true; children: true } } }
}>

function mapCategoryRow(category: CategoryRow) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    active: category.active,
    sortOrder: category.sortOrder,
    parentId: category.parentId,
    productCount: category._count.products,
    childCount: category._count.children,
    createdAt: category.createdAt
  }
}

async function uniqueCategorySlug(
  db: Prisma.TransactionClient,
  base: string
): Promise<string> {
  let slug = toSlug(base)
  let counter = 1

  while (
    await db.category.findUnique({
      where: { slug },
      select: { id: true }
    })
  ) {
    slug = `${toSlug(base)}-${counter}`
    counter += 1
  }

  return slug
}

async function assertValidParent(
  db: Prisma.TransactionClient,
  categoryId: string | undefined,
  parentId: string | null | undefined
) {
  if (!parentId) {
    return
  }

  if (categoryId && parentId === categoryId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A category cannot be its own parent.'
    })
  }

  const parent = await db.category.findUnique({
    where: { id: parentId },
    select: { id: true }
  })

  if (!parent) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Parent category not found.'
    })
  }

  if (!categoryId) {
    return
  }

  let currentId: string | null = parentId
  while (currentId) {
    if (currentId === categoryId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Category hierarchy cannot contain a cycle.'
      })
    }

    const ancestor: { parentId: string | null } | null =
      await db.category.findUnique({
        where: { id: currentId },
        select: { parentId: true }
      })

    currentId = ancestor?.parentId ?? null
  }
}

async function normalizeSiblingSortOrders(
  db: Prisma.TransactionClient,
  orderedIds: string[]
) {
  await Promise.all(
    orderedIds.map((id, index) =>
      db.category.update({
        where: { id },
        data: { sortOrder: index }
      })
    )
  )
}

async function getSiblingIds(
  db: Prisma.TransactionClient,
  parentId: string | null,
  excludeId?: string
) {
  const siblings = await db.category.findMany({
    where: {
      parentId,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })

  return siblings.map((sibling) => sibling.id)
}

async function moveCategoryInTransaction(
  db: Prisma.TransactionClient,
  input: CategoryMoveInput
) {
  const allCategories = await db.category.findMany({
    select: { id: true, parentId: true, sortOrder: true }
  })

  const moving = allCategories.find(
    (category) => category.id === input.categoryId
  )

  if (!moving) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Category not found.'
    })
  }

  if (input.intent === 'inside') {
    const target = allCategories.find(
      (category) => category.id === input.targetCategoryId
    )

    if (!target) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Target category not found.'
      })
    }

    if (
      isCategoryDescendant(
        allCategories,
        input.categoryId,
        input.targetCategoryId
      )
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot move a category into one of its descendants.'
      })
    }
  } else {
    const target = allCategories.find(
      (category) => category.id === input.targetCategoryId
    )

    if (!target) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Target category not found.'
      })
    }

    if (
      isCategoryDescendant(
        allCategories,
        input.categoryId,
        input.targetCategoryId
      )
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot move a category relative to one of its descendants.'
      })
    }
  }

  const { parentId: nextParentId, index } = resolveMoveTarget(
    allCategories,
    input
  )

  await assertValidParent(db, input.categoryId, nextParentId)

  const oldParentId = moving.parentId
  const nextSiblingIds = await getSiblingIds(db, nextParentId, input.categoryId)
  nextSiblingIds.splice(index, 0, input.categoryId)

  await db.category.update({
    where: { id: input.categoryId },
    data: { parentId: nextParentId }
  })

  await normalizeSiblingSortOrders(db, nextSiblingIds)

  if (oldParentId !== nextParentId) {
    const oldSiblingIds = await getSiblingIds(db, oldParentId, input.categoryId)
    await normalizeSiblingSortOrders(db, oldSiblingIds)
  }

  const category = await db.category.findUniqueOrThrow({
    where: { id: input.categoryId },
    include: {
      _count: { select: { products: true, children: true } }
    }
  })

  return mapCategoryRow(category)
}

export const categoryRouter = createTRPCRouter({
  listFlat: ownerProcedure.query(async ({ ctx }) => {
    const categories = await ctx.db.category.findMany({
      include: {
        _count: { select: { products: true, children: true } }
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })

    return categories.map(mapCategoryRow)
  }),

  listForProduct: ownerProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      const assignments = await ctx.db.productCategory.findMany({
        where: { productId: input.productId },
        select: { categoryId: true }
      })

      return assignments.map((assignment) => assignment.categoryId)
    }),

  create: ownerProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const category = await ctx.db.$transaction(async (tx) => {
          if (input.parentId) {
            await assertValidParent(tx, undefined, input.parentId)
          }

          const siblingIds = input.parentId
            ? await getSiblingIds(tx, input.parentId)
            : await getSiblingIds(tx, null)

          const insertIndex = Math.min(input.sortOrder, siblingIds.length)
          const orderedIds = [...siblingIds]
          orderedIds.splice(insertIndex, 0, '__new__')

          const created = await tx.category.create({
            data: {
              name: input.name,
              slug: await uniqueCategorySlug(tx, input.name),
              parentId: input.parentId,
              sortOrder: insertIndex,
              active: input.active
            },
            include: {
              _count: { select: { products: true, children: true } }
            }
          })

          const normalizedIds = orderedIds.map((id) =>
            id === '__new__' ? created.id : id
          )
          await normalizeSiblingSortOrders(tx, normalizedIds)

          return tx.category.findUniqueOrThrow({
            where: { id: created.id },
            include: {
              _count: { select: { products: true, children: true } }
            }
          })
        })

        return mapCategoryRow(category)
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Could not create the category.'
          })
        }

        throw error
      }
    }),

  update: ownerProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.category.findUnique({
        where: { id: input.id },
        select: { id: true, name: true }
      })

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found.'
        })
      }

      if (input.parentId !== undefined) {
        await assertValidParent(ctx.db, input.id, input.parentId)
      }

      const category = await ctx.db.category.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.sortOrder !== undefined
            ? { sortOrder: input.sortOrder }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {})
        },
        include: {
          _count: { select: { products: true, children: true } }
        }
      })

      return mapCategoryRow(category)
    }),

  move: ownerProcedure
    .input(moveInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.$transaction((tx) =>
          moveCategoryInTransaction(tx, input)
        )
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not move the category.'
        })
      }
    }),

  delete: ownerProcedure
    .input(deleteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.db.category.findUnique({
        where: { id: input.id },
        include: {
          _count: { select: { children: true } }
        }
      })

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found.'
        })
      }

      if (category._count.children > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Delete child categories before deleting this category.'
        })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.category.delete({
          where: { id: input.id }
        })

        const siblingIds = await getSiblingIds(tx, category.parentId)
        await normalizeSiblingSortOrders(tx, siblingIds)
      })

      return { id: input.id }
    }),

  setProductCategories: ownerProcedure
    .input(setProductCategoriesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({
        where: { id: input.productId },
        select: { id: true }
      })

      if (!product) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Product not found.'
        })
      }

      await assertCategoriesExist(ctx.db, input.categoryIds)

      await ctx.db.$transaction(async (tx) => {
        await replaceProductCategories(tx, input.productId, input.categoryIds)
      })

      return { productId: input.productId, categoryIds: input.categoryIds }
    })
})
