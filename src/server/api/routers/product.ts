import { Prisma } from "../../../../generated/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import {
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_CONTENT_TYPES,
  PRODUCT_IMAGE_MAX_BYTES,
} from "~/lib/product-images";
import { productDescriptionJsonSchema } from "~/lib/form-schemas";
import {
  createPresignedProductImageUpload,
  isS3Configured,
} from "~/server/storage/s3";
import {
  createProduct,
  ProductMaintenanceError,
  updateProduct,
  type ProductMaintenanceRow,
} from "~/server/commerce/product-maintenance";

const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z
    .enum([
      "name",
      "sku",
      "manufacturer",
      "active",
      "priceCents",
      "costCents",
      "discountPercent",
      "stockOnHand",
      "stockReserved",
      "dispatchMinDays",
      "categoryCount",
      "createdAt",
    ])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const createInputSchema = z.object({
  name: z.string().trim().min(1),
  manufacturerName: z.string().trim().min(1),
  description: z.custom<Prisma.InputJsonValue>().nullable().optional(),
  priceCents: z.number().int().min(0),
  costCents: z.number().int().min(0),
  stockOnHand: z.number().int().min(0).default(0),
  dispatchMinDays: z.number().int().min(0),
  dispatchMaxDays: z.number().int().min(0),
  active: z.boolean().default(false),
  featured: z.boolean().default(false),
  categoryIds: z.array(z.string()).default([]),
  images: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        sortOrder: z
          .number()
          .int()
          .min(0)
          .max(MAX_PRODUCT_IMAGES - 1),
        altText: z.string().trim().optional(),
      }),
    )
    .max(MAX_PRODUCT_IMAGES)
    .optional(),
});

const updateInputSchema = createInputSchema.omit({ images: true }).extend({
  id: z.string(),
});

const getForEditInputSchema = z.object({
  id: z.string(),
});

const createImageUploadUrlsInputSchema = z.object({
  files: z
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        contentType: z.enum(PRODUCT_IMAGE_CONTENT_TYPES),
        contentLength: z.number().int().min(1).max(PRODUCT_IMAGE_MAX_BYTES),
        slotIndex: z
          .number()
          .int()
          .min(0)
          .max(MAX_PRODUCT_IMAGES - 1),
      }),
    )
    .min(1)
    .max(MAX_PRODUCT_IMAGES),
});

const listManufacturersInputSchema = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

function buildSearchFilter(
  search: string | undefined,
): Prisma.ProductWhereInput | undefined {
  if (!search) {
    return undefined;
  }

  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      {
        manufacturer: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ],
  };
}

function buildOrderBy(
  sortBy: z.infer<typeof listInputSchema>["sortBy"],
  sortDir: z.infer<typeof listInputSchema>["sortDir"],
):
  | Prisma.ProductOrderByWithRelationInput
  | Prisma.ProductOrderByWithRelationInput[] {
  switch (sortBy) {
    case "manufacturer":
      return { manufacturer: { name: sortDir } };
    case "categoryCount":
      return { categories: { _count: sortDir } };
    case "name":
    case "sku":
    case "active":
    case "priceCents":
    case "costCents":
    case "discountPercent":
    case "stockOnHand":
    case "stockReserved":
    case "dispatchMinDays":
      return { [sortBy]: sortDir };
    case "createdAt":
    default:
      return { createdAt: sortDir };
  }
}

function mapProductRow(product: ProductMaintenanceRow) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    manufacturerName: product.manufacturer.name,
    active: product.active,
    featured: product.featured,
    priceCents: product.priceCents,
    costCents: product.costCents,
    discountPercent: product.discountPercent,
    stockOnHand: product.stockOnHand,
    stockReserved: product.stockReserved,
    dispatchMinDays: product.dispatchMinDays,
    dispatchMaxDays: product.dispatchMaxDays,
    categoryCount: product._count.categories,
    createdAt: product.createdAt,
  };
}

function toProductMaintenanceTrpcError(error: ProductMaintenanceError): TRPCError {
  switch (error.code) {
    case "PRODUCT_NOT_FOUND":
      return new TRPCError({
        code: "NOT_FOUND",
        message: error.message,
      });
    case "INVALID_DISPATCH_ESTIMATE":
    case "INVALID_PRODUCT_IMAGE_KEY":
    case "CATEGORY_NOT_FOUND":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
      });
    case "IMAGE_UPLOADS_NOT_CONFIGURED":
      return new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error.message,
      });
  }
}

export const productRouter = createTRPCRouter({
  list: ownerProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const where = buildSearchFilter(input.search);
    const orderBy = buildOrderBy(input.sortBy, input.sortDir);
    const skip = (input.page - 1) * input.pageSize;

    const [totalCount, products] = await ctx.db.$transaction([
      ctx.db.product.count({ where }),
      ctx.db.product.findMany({
        where,
        include: {
          manufacturer: { select: { name: true } },
          _count: { select: { categories: true } },
        },
        orderBy,
        skip,
        take: input.pageSize,
      }),
    ]);

    return {
      items: products.map(mapProductRow),
      page: input.page,
      pageSize: input.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / input.pageSize)),
    };
  }),

  listManufacturers: ownerProcedure
    .input(listManufacturersInputSchema)
    .query(async ({ ctx, input }) => {
      const where = input.search
        ? {
            name: { contains: input.search, mode: "insensitive" as const },
          }
        : undefined;

      const manufacturers = await ctx.db.manufacturer.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: input.limit,
      });

      return manufacturers;
    }),

  createImageUploadUrls: ownerProcedure
    .input(createImageUploadUrlsInputSchema)
    .mutation(async ({ input }) => {
      if (!isS3Configured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Image uploads are not configured.",
        });
      }

      const uploadId = crypto.randomUUID();
      const uploads = await Promise.all(
        input.files.map((file) =>
          createPresignedProductImageUpload({
            uploadId,
            index: file.slotIndex,
            contentType: file.contentType,
            contentLength: file.contentLength,
          }).then((upload) => ({
            ...upload,
            slotIndex: file.slotIndex,
          })),
        ),
      );

      return { uploadId, uploads };
    }),

  create: ownerProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const product = await createProduct(ctx.db, input);
        return mapProductRow(product);
      } catch (error) {
        if (error instanceof ProductMaintenanceError) {
          throw toProductMaintenanceTrpcError(error);
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Could not create the product.",
          });
        }

        throw error;
      }
    }),

  getForEdit: ownerProcedure
    .input(getForEditInputSchema)
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({
        where: { id: input.id },
        include: {
          manufacturer: { select: { name: true } },
          categories: {
            select: { categoryId: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found.",
        });
      }

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        manufacturerName: product.manufacturer.name,
        description: productDescriptionJsonSchema.parse(product.description),
        priceCents: product.priceCents,
        costCents: product.costCents,
        stockOnHand: product.stockOnHand,
        dispatchMinDays: product.dispatchMinDays,
        dispatchMaxDays: product.dispatchMaxDays,
        active: product.active,
        featured: product.featured,
        categoryIds: product.categories.map((entry) => entry.categoryId),
      };
    }),

  update: ownerProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const product = await updateProduct(ctx.db, input);
        return mapProductRow(product);
      } catch (error) {
        if (error instanceof ProductMaintenanceError) {
          throw toProductMaintenanceTrpcError(error);
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Could not update the product.",
          });
        }

        throw error;
      }
    }),
});
