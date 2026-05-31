import type { Prisma } from "../../generated/prisma";

export type StorefrontProduct = {
  id: string;
  name: string;
  slug: string;
  manufacturerName: string;
  priceCents: number;
  discountPercent: number | null;
  dispatchMinDays: number;
  dispatchMaxDays: number;
  imageUrl: string | null;
  imageAlt: string | null;
  reviewCount: number;
  averageRating: number | null;
};

export type StorefrontProductDetail = StorefrontProduct & {
  description: Prisma.JsonValue | null;
};

const productInclude = {
  manufacturer: { select: { name: true } },
  images: {
    orderBy: { sortOrder: "asc" as const },
    take: 1,
    select: { url: true, altText: true },
  },
  reviews: {
    where: { status: "APPROVED" as const },
    select: { rating: true },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithStorefrontRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export function mapStorefrontProduct(
  product: ProductWithStorefrontRelations,
): StorefrontProduct {
  const primaryImage = product.images[0];
  const reviewCount = product.reviews.length;
  const averageRating =
    reviewCount > 0
      ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
        reviewCount
      : null;

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
    averageRating,
  };
}

export function mapStorefrontProductDetail(
  product: ProductWithStorefrontRelations & { description: Prisma.JsonValue | null },
): StorefrontProductDetail {
  return {
    ...mapStorefrontProduct(product),
    description: product.description,
  };
}

export { productInclude as storefrontProductInclude };
