import type { Prisma, PrismaClient } from "../../generated/prisma";
import { TRPCError } from "@trpc/server";

type CategoryDb = Pick<PrismaClient, "category">;

export async function assertCategoriesExist(
  db: CategoryDb | Prisma.TransactionClient,
  categoryIds: string[],
) {
  if (categoryIds.length === 0) {
    return;
  }

  const categories = await db.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true },
  });

  if (categories.length !== categoryIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more categories were not found.",
    });
  }
}

export function productCategoryCreates(categoryIds: string[]) {
  return categoryIds.map((categoryId, index) => ({
    categoryId,
    sortOrder: index,
  }));
}

export async function replaceProductCategories(
  db: Prisma.TransactionClient,
  productId: string,
  categoryIds: string[],
) {
  await db.productCategory.deleteMany({
    where: { productId },
  });

  if (categoryIds.length > 0) {
    await db.productCategory.createMany({
      data: productCategoryCreates(categoryIds).map((entry) => ({
        productId,
        ...entry,
      })),
    });
  }
}
