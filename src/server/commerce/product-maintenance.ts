import { Prisma, type PrismaClient } from "../../../generated/prisma"
import { capitalizeWord } from "~/utils/capitalize-word"

import {
  productCategoryCreates,
  replaceProductCategories,
} from "~/lib/product-categories"
import { isValidProductImageKey } from "~/lib/product-images"
import { allocateProductSku } from "~/lib/product-sku"
import { toSlug } from "~/lib/slug"
import { getProductImagePublicUrl, isS3Configured } from "~/server/storage/s3"

export const PRODUCT_MUTATION_TX_OPTIONS = { timeout: 10_000 } as const

export const productMaintenanceInclude = {
  manufacturer: { select: { name: true } },
  _count: { select: { categories: true } },
} satisfies Prisma.ProductInclude

export type ProductMaintenanceRow = Prisma.ProductGetPayload<{
  include: typeof productMaintenanceInclude
}>

export type ProductImageInput = {
  key: string
  sortOrder: number
  altText?: string
}

export type ProductMaintenanceInput = {
  name: string
  manufacturerName: string
  description?: Prisma.InputJsonValue | null
  priceCents: number
  costCents: number
  stockOnHand: number
  dispatchMinDays: number
  dispatchMaxDays: number
  active: boolean
  featured: boolean
  categoryIds: string[]
}

export type CreateProductInput = ProductMaintenanceInput & {
  images?: ProductImageInput[]
}

export type UpdateProductInput = ProductMaintenanceInput & {
  id: string
}

export type ProductMaintenanceErrorCode =
  | "INVALID_DISPATCH_ESTIMATE"
  | "IMAGE_UPLOADS_NOT_CONFIGURED"
  | "INVALID_PRODUCT_IMAGE_KEY"
  | "CATEGORY_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"

export class ProductMaintenanceError extends Error {
  constructor(
    readonly code: ProductMaintenanceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ProductMaintenanceError"
  }
}

type ProductMaintenanceDb = Pick<PrismaClient, "$transaction" | "category" | "product">

async function uniqueProductSlug(
  db: Prisma.TransactionClient,
  base: string,
): Promise<string> {
  let slug = toSlug(base)
  let counter = 1

  while (
    await db.product.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    slug = `${toSlug(base)}-${counter}`
    counter += 1
  }

  return slug
}

async function uniqueManufacturerSlug(
  db: Prisma.TransactionClient,
  base: string,
): Promise<string> {
  let slug = toSlug(base)
  let counter = 1

  while (
    await db.manufacturer.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    slug = `${toSlug(base)}-${counter}`
    counter += 1
  }

  return slug
}

async function findOrCreateManufacturer(
  db: Prisma.TransactionClient,
  manufacturerName: string,
) {
  const trimmedName = manufacturerName.trim()

  const existing = await db.manufacturer.findFirst({
    where: {
      name: { equals: trimmedName, mode: "insensitive" },
    },
  })

  if (existing) {
    return existing
  }

  return db.manufacturer.create({
    data: {
      name: trimmedName,
      slug: await uniqueManufacturerSlug(db, trimmedName),
    },
  })
}

function assertValidDispatchEstimate(input: ProductMaintenanceInput) {
  if (input.dispatchMaxDays < input.dispatchMinDays) {
    throw new ProductMaintenanceError(
      "INVALID_DISPATCH_ESTIMATE",
      "Dispatch estimate max days must be at least min days.",
    )
  }
}

function assertValidProductImages(images: ProductImageInput[] | undefined) {
  if (!images?.length) {
    return
  }

  if (!isS3Configured()) {
    throw new ProductMaintenanceError(
      "IMAGE_UPLOADS_NOT_CONFIGURED",
      "Image uploads are not configured.",
    )
  }

  for (const image of images) {
    if (!isValidProductImageKey(image.key)) {
      throw new ProductMaintenanceError(
        "INVALID_PRODUCT_IMAGE_KEY",
        "Invalid product image key.",
      )
    }
  }
}

async function assertCategoriesExist(
  db: Pick<PrismaClient, "category"> | Prisma.TransactionClient,
  categoryIds: string[],
) {
  if (categoryIds.length === 0) {
    return
  }

  const categories = await db.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true },
  })

  if (categories.length !== categoryIds.length) {
    throw new ProductMaintenanceError(
      "CATEGORY_NOT_FOUND",
      "One or more categories were not found.",
    )
  }
}

export async function createProduct(
  db: ProductMaintenanceDb,
  input: CreateProductInput,
): Promise<ProductMaintenanceRow> {
  assertValidDispatchEstimate(input)
  assertValidProductImages(input.images)
  await assertCategoriesExist(db, input.categoryIds)

  return db.$transaction(async (tx) => {
    const manufacturer = await findOrCreateManufacturer(
      tx,
      capitalizeWord(input.manufacturerName),
    )

    return tx.product.create({
      data: {
        name: input.name,
        sku: await allocateProductSku(tx, manufacturer.name, input.name),
        slug: await uniqueProductSlug(tx, input.name),
        manufacturerId: manufacturer.id,
        description: input.description ?? Prisma.JsonNull,
        priceCents: input.priceCents,
        costCents: input.costCents,
        stockOnHand: input.stockOnHand,
        dispatchMinDays: input.dispatchMinDays,
        dispatchMaxDays: input.dispatchMaxDays,
        active: input.active,
        featured: input.featured,
        ...(input.images?.length
          ? {
            images: {
              create: input.images.map((image) => ({
                url: getProductImagePublicUrl(image.key),
                altText: image.altText,
                sortOrder: image.sortOrder,
              })),
            },
          }
          : {}),
        ...(input.categoryIds.length > 0
          ? {
            categories: {
              create: productCategoryCreates(input.categoryIds),
            },
          }
          : {}),
      },
      include: productMaintenanceInclude,
    })
  }, PRODUCT_MUTATION_TX_OPTIONS)
}

export async function updateProduct(
  db: ProductMaintenanceDb,
  input: UpdateProductInput,
): Promise<ProductMaintenanceRow> {
  assertValidDispatchEstimate(input)

  const existing = await db.product.findUnique({
    where: { id: input.id },
    select: { id: true },
  })

  if (!existing) {
    throw new ProductMaintenanceError("PRODUCT_NOT_FOUND", "Product not found.")
  }

  await assertCategoriesExist(db, input.categoryIds)

  return db.$transaction(async (tx) => {
    const manufacturer = await findOrCreateManufacturer(
      tx,
      input.manufacturerName,
    )

    const updated = await tx.product.update({
      where: { id: input.id },
      data: {
        name: input.name,
        manufacturerId: manufacturer.id,
        ...(input.description !== undefined
          ? { description: input.description ?? Prisma.JsonNull }
          : {}),
        priceCents: input.priceCents,
        costCents: input.costCents,
        stockOnHand: input.stockOnHand,
        dispatchMinDays: input.dispatchMinDays,
        dispatchMaxDays: input.dispatchMaxDays,
        active: input.active,
        featured: input.featured,
      },
      include: productMaintenanceInclude,
    })

    await replaceProductCategories(tx, updated.id, input.categoryIds)

    return updated
  }, PRODUCT_MUTATION_TX_OPTIONS)
}
