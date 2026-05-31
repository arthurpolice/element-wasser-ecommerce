import type { Prisma } from "../../generated/prisma";
import { TRPCError } from "@trpc/server";

export async function replaceProductCategories(
  db: Prisma.TransactionClient,
  productId: string,
  categoryIds: string[],
) {
  if (categoryIds.length > 0) {
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

  await db.productCategory.deleteMany({
    where: { productId },
  });

  if (categoryIds.length > 0) {
    await db.productCategory.createMany({
      data: categoryIds.map((categoryId, index) => ({
        productId,
        categoryId,
        sortOrder: index,
      })),
    });
  }
}
