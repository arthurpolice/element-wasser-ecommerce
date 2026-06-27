import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TRPCError } from '@trpc/server'

import { createCallerFactory } from '~/server/api/trpc'
import { categoryRouter } from '~/server/api/routers/category'

const createCaller = createCallerFactory(categoryRouter)

type CategoryRecord = {
  id: string
  name: string
  slug: string
  active: boolean
  sortOrder: number
  parentId: string | null
  createdAt: Date
  _count: { products: number; children: number }
}

function createMockDb(initialCategories: CategoryRecord[]) {
  const categories = [...initialCategories]
  const productCategories = [
    { productId: 'product-1', categoryId: 'root-b' },
    { productId: 'product-2', categoryId: 'child-a1' }
  ]

  const db = {
    category: {
      findMany: vi.fn(
        async ({
          where,
          select,
          include
        }: {
          where?: { parentId?: string | null; id?: { not?: string } }
          select?: { id?: boolean; parentId?: boolean; sortOrder?: boolean }
          include?: {
            _count?: { select: { products: boolean; children: boolean } }
          }
        }) => {
          let rows = categories

          if (where?.parentId !== undefined) {
            rows = rows.filter(
              (category) => category.parentId === where.parentId
            )
          }

          if (where?.id?.not) {
            rows = rows.filter((category) => category.id !== where.id?.not)
          }

          rows = [...rows].sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder
            }
            return left.name.localeCompare(right.name)
          })

          if (select) {
            return rows.map((row) => ({
              id: row.id,
              parentId: row.parentId,
              sortOrder: row.sortOrder
            }))
          }

          if (include) {
            return rows.map((row) => ({
              ...row,
              _count: {
                products: row._count.products,
                children: categories.filter(
                  (child) => child.parentId === row.id
                ).length
              }
            }))
          }

          return rows
        }
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          categories.find((category) => category.id === where.id) ?? null
      ),
      findUniqueOrThrow: vi.fn(
        async ({
          where,
          include
        }: {
          where: { id: string }
          include?: {
            _count?: { select: { products: boolean; children: boolean } }
          }
        }) => {
          const match = categories.find((category) => category.id === where.id)
          if (!match) {
            throw new Error('Not found')
          }

          if (include?._count) {
            return {
              ...match,
              _count: {
                products: match._count.products,
                children: categories.filter(
                  (child) => child.parentId === match.id
                ).length
              }
            }
          }

          return match
        }
      ),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string }
          data: Partial<CategoryRecord>
        }) => {
          const index = categories.findIndex(
            (category) => category.id === where.id
          )
          if (index === -1) {
            throw new Error('Not found')
          }

          categories[index] = {
            ...categories[index]!,
            ...data
          }

          return categories[index]
        }
      ),
      create: vi.fn(
        async ({
          data
        }: {
          data: Omit<CategoryRecord, 'id' | 'createdAt' | '_count'>
        }) => {
          const created: CategoryRecord = {
            id: `cat-${categories.length + 1}`,
            createdAt: new Date(),
            _count: { products: 0, children: 0 },
            ...data
          }
          categories.push(created)
          return created
        }
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = categories.findIndex(
          (category) => category.id === where.id
        )
        if (index === -1) {
          throw new Error('Not found')
        }

        const [deleted] = categories.splice(index, 1)
        return deleted
      })
    },
    productCategory: {
      findMany: vi.fn(
        async ({ where }: { where?: { categoryId?: string } } = {}) =>
          productCategories.filter((entry) =>
            where?.categoryId ? entry.categoryId === where.categoryId : true
          )
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 }))
    },
    product: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id ? { id: where.id } : null
      ),
      findMany: vi.fn(
        async ({ where }: { where?: { id?: { in?: string[] } } }) =>
          (where?.id?.in ?? []).map((id) => ({
            id,
            name: `Product ${id}`,
            sku: `SKU-${id}`,
            description: null,
            manufacturer: { name: 'Element Wasser' },
            categories: []
          }))
      )
    },
    $transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) =>
      callback(db)
    ),
    $executeRaw: vi.fn(async () => 1)
  }

  return { db, categories }
}

function createOwnerCaller(db: ReturnType<typeof createMockDb>['db']) {
  return createCaller({
    db: db as never,
    session: {
      user: { id: 'owner-1', role: 'owner' },
      session: { id: 'session-1' }
    } as never,
    headers: new Headers()
  })
}

describe('category router move', () => {
  let categories: CategoryRecord[]
  let db: ReturnType<typeof createMockDb>['db']

  beforeEach(() => {
    const mock = createMockDb([
      {
        id: 'root-a',
        name: 'Root A',
        slug: 'root-a',
        active: true,
        sortOrder: 0,
        parentId: null,
        createdAt: new Date(),
        _count: { products: 0, children: 2 }
      },
      {
        id: 'root-b',
        name: 'Root B',
        slug: 'root-b',
        active: true,
        sortOrder: 1,
        parentId: null,
        createdAt: new Date(),
        _count: { products: 0, children: 0 }
      },
      {
        id: 'child-a1',
        name: 'Child A1',
        slug: 'child-a1',
        active: true,
        sortOrder: 0,
        parentId: 'root-a',
        createdAt: new Date(),
        _count: { products: 0, children: 1 }
      },
      {
        id: 'child-a2',
        name: 'Child A2',
        slug: 'child-a2',
        active: true,
        sortOrder: 1,
        parentId: 'root-a',
        createdAt: new Date(),
        _count: { products: 0, children: 0 }
      },
      {
        id: 'grandchild-a1',
        name: 'Grandchild A1',
        slug: 'grandchild-a1',
        active: true,
        sortOrder: 0,
        parentId: 'child-a1',
        createdAt: new Date(),
        _count: { products: 0, children: 0 }
      }
    ])

    categories = mock.categories
    db = mock.db
  })

  it('moves a category inside another category', async () => {
    const caller = createOwnerCaller(db)

    await caller.move({
      categoryId: 'root-b',
      intent: 'inside',
      targetCategoryId: 'root-a'
    })

    const moved = categories.find((category) => category.id === 'root-b')
    expect(moved?.parentId).toBe('root-a')
    expect(
      categories
        .filter((category) => category.parentId === 'root-a')
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((category) => category.id)
    ).toEqual(['child-a1', 'child-a2', 'root-b'])
    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('moves a category before a sibling', async () => {
    const caller = createOwnerCaller(db)

    await caller.move({
      categoryId: 'child-a2',
      intent: 'before',
      targetCategoryId: 'child-a1'
    })

    expect(
      categories
        .filter((category) => category.parentId === 'root-a')
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((category) => category.id)
    ).toEqual(['child-a2', 'child-a1'])
  })

  it('moves a category after a sibling at root level', async () => {
    const caller = createOwnerCaller(db)

    await caller.move({
      categoryId: 'child-a1',
      intent: 'after',
      targetCategoryId: 'root-b'
    })

    expect(
      categories
        .filter((category) => category.parentId === null)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((category) => category.id)
    ).toEqual(['root-a', 'root-b', 'child-a1'])
    expect(
      categories.find((category) => category.id === 'child-a1')?.parentId
    ).toBe(null)
  })

  it('rejects moving a category into its descendant', async () => {
    const caller = createOwnerCaller(db)

    await expect(
      caller.move({
        categoryId: 'root-a',
        intent: 'inside',
        targetCategoryId: 'grandchild-a1'
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Cannot move a category into one of its descendants.'
    } satisfies Partial<TRPCError>)
  })
})

describe('category router delete', () => {
  let categories: CategoryRecord[]
  let db: ReturnType<typeof createMockDb>['db']

  beforeEach(() => {
    const mock = createMockDb([
      {
        id: 'root-a',
        name: 'Root A',
        slug: 'root-a',
        active: true,
        sortOrder: 0,
        parentId: null,
        createdAt: new Date(),
        _count: { products: 0, children: 1 }
      },
      {
        id: 'root-b',
        name: 'Root B',
        slug: 'root-b',
        active: true,
        sortOrder: 1,
        parentId: null,
        createdAt: new Date(),
        _count: { products: 0, children: 0 }
      },
      {
        id: 'child-a1',
        name: 'Child A1',
        slug: 'child-a1',
        active: true,
        sortOrder: 0,
        parentId: 'root-a',
        createdAt: new Date(),
        _count: { products: 0, children: 0 }
      }
    ])

    categories = mock.categories
    db = mock.db
  })

  it('deletes a leaf category and normalizes sibling order', async () => {
    const caller = createOwnerCaller(db)

    await caller.delete({ id: 'root-b' })

    expect(categories.map((category) => category.id)).toEqual([
      'root-a',
      'child-a1'
    ])
    expect(
      categories.find((category) => category.id === 'root-a')?.sortOrder
    ).toBe(0)
    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('deletes a child leaf category', async () => {
    const caller = createOwnerCaller(db)

    await caller.delete({ id: 'child-a1' })

    expect(categories.map((category) => category.id)).toEqual([
      'root-a',
      'root-b'
    ])
  })

  it('rejects deleting a category that still has children', async () => {
    const caller = createOwnerCaller(db)

    await expect(caller.delete({ id: 'root-a' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Delete child categories before deleting this category.'
    } satisfies Partial<TRPCError>)
  })
})
