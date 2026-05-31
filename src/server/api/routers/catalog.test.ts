import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCallerFactory } from "~/server/api/trpc";
import { catalogRouter } from "~/server/api/routers/catalog";

const createCaller = createCallerFactory(catalogRouter);

const categories = [
  { id: "root", slug: "water-filters", parentId: null },
  { id: "child", slug: "replacement-cartridges", parentId: "root" },
];

const product = {
  id: "product-1",
  name: "Cartridge Pack",
  slug: "cartridge-pack",
  priceCents: 2500,
  discountPercent: null,
  dispatchMinDays: 1,
  dispatchMaxDays: 3,
  active: true,
  featured: false,
  description: null,
  manufacturer: { name: "Brita" },
  images: [{ url: "https://cdn.example.com/cartridge.jpg", altText: "Cartridge" }],
  reviews: [{ rating: 5 }],
};

const featuredProduct = {
  ...product,
  id: "product-2",
  name: "Featured Filter",
  slug: "featured-filter",
  featured: true,
};

function createMockDb() {
  return {
    category: {
      findMany: vi.fn(async ({ where }: { where?: { active?: boolean } }) => {
        if (where?.active) {
          return categories;
        }
        return categories;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; active?: boolean } }) => {
        const match = categories.find((category) => category.id === where.id);
        if (!match) {
          return null;
        }
        return {
          id: match.id,
          name: "Water Filters",
          slug: match.slug,
          parentId: match.parentId,
          sortOrder: 0,
        };
      }),
    },
    product: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [product]),
      findFirst: vi.fn(async ({ where }: { where: { slug: string; active?: boolean } }) => {
        if (where.slug === product.slug && where.active) {
          return product;
        }
        return null;
      }),
    },
    $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  };
}

function createPublicCaller(db: ReturnType<typeof createMockDb>) {
  return createCaller({
    db: db as never,
    session: null,
    headers: new Headers(),
  });
}

describe("catalog router", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it("resolves nested category paths for active categories", async () => {
    const caller = createPublicCaller(db);

    await expect(
      caller.resolveCategory({ slugPath: "water-filters/replacement-cartridges" }),
    ).resolves.toMatchObject({
      id: "child",
      slugPath: "water-filters/replacement-cartridges",
    });
  });

  it("lists active products for a category and its descendants", async () => {
    const caller = createPublicCaller(db);

    const result = await caller.listCategoryProducts({
      slugPath: "water-filters",
      page: 1,
      pageSize: 12,
    });

    expect(result).toMatchObject({
      categoryId: "root",
      totalCount: 1,
      items: [
        expect.objectContaining({
          slug: "cartridge-pack",
          manufacturerName: "Brita",
          priceCents: 2500,
        }),
      ],
    });
    expect(result?.items[0]).not.toHaveProperty("costCents");
  });

  it("lists featured products before non-featured products in category views", async () => {
    const caller = createPublicCaller(db);
    db.product.count = vi.fn(async () => 2);
    db.product.findMany = vi.fn(async ({ orderBy }: { orderBy?: Array<Record<string, string>> }) => {
      if (orderBy?.[0]?.featured === "desc") {
        return [featuredProduct, product];
      }
      return [product];
    });

    const result = await caller.listCategoryProducts({
      slugPath: "water-filters",
      page: 1,
      pageSize: 12,
    });

    expect(result?.items.map((item) => item.slug)).toEqual([
      "featured-filter",
      "cartridge-pack",
    ]);
  });

  it("returns null for unknown category paths", async () => {
    const caller = createPublicCaller(db);

    await expect(
      caller.listCategoryProducts({
        slugPath: "unknown-category",
        page: 1,
        pageSize: 12,
      }),
    ).resolves.toBeNull();
  });
});
