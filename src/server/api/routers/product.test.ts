import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildProductImageKey } from "~/lib/product-images";
import { createCallerFactory } from "~/server/api/trpc";
import type { Session } from "~/server/better-auth/config";

vi.mock("~/server/storage/s3", () => ({
  isS3Configured: vi.fn(),
  createPresignedProductImageUpload: vi.fn(),
  getProductImagePublicUrl: vi.fn(
    (key: string) => `https://cdn.example.com/${key}`,
  ),
}));

import { productRouter } from "~/server/api/routers/product";
import { isS3Configured } from "~/server/storage/s3";

const createCaller = createCallerFactory(productRouter);
const uploadId = "550e8400-e29b-41d4-a716-446655440000";
const now = new Date("2024-01-01T00:00:00.000Z");

function createOwnerSession(): Session {
  return {
    user: {
      id: "owner-user",
      email: "owner@example.com",
      name: "Owner",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: "owner",
    },
    session: {
      id: "owner-session",
      userId: "owner-user",
      token: "test-token",
      expiresAt: new Date("2025-01-01T00:00:00.000Z"),
      createdAt: now,
      updatedAt: now,
    },
  };
}

function createOwnerCaller() {
  return createCaller({
    db: {} as never,
    session: createOwnerSession(),
    headers: new Headers(),
  });
}

const baseCreateInput = {
  name: "Mineral Water",
  manufacturerName: "Element Wasser",
  priceCents: 500,
  costCents: 200,
  dispatchMinDays: 1,
  dispatchMaxDays: 3,
};

const productDescription = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Naturally sparkling mineral water." }],
    },
  ],
};

function createProductDb() {
  const manufacturer = {
    id: "manufacturer-1",
    name: "Element Wasser",
    slug: "element-wasser",
  };

  const db = {
    product: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) =>
        where.id === "product-1" ? { id: "product-1" } : null,
      ),
      create: vi.fn(async ({ data, include }) => ({
        id: "product-1",
        createdAt: now,
        updatedAt: now,
        discountPercent: null,
        stockReserved: 0,
        _count: { categories: 0 },
        manufacturer: { name: manufacturer.name },
        ...data,
        include,
      })),
      update: vi.fn(async ({ data, include }) => ({
        id: "product-1",
        createdAt: now,
        updatedAt: now,
        sku: "EW-ELE-MIN-00001",
        slug: "mineral-water",
        discountPercent: null,
        stockReserved: 0,
        _count: { categories: 0 },
        manufacturer: { name: manufacturer.name },
        ...data,
        include,
      })),
    },
    manufacturer: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => manufacturer),
      create: vi.fn(async () => manufacturer),
    },
    category: {
      count: vi.fn(async () => 0),
    },
    productSkuSequence: {
      upsert: vi.fn(async () => ({ nextValue: 1 })),
    },
    productCategory: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) =>
      callback(db),
    ),
  };

  return db;
}

function createOwnerCallerWithDb(db: ReturnType<typeof createProductDb>) {
  return createCaller({
    db: db as never,
    session: createOwnerSession(),
    headers: new Headers(),
  });
}

describe("product router image validation", () => {
  beforeEach(() => {
    vi.mocked(isS3Configured).mockReset();
  });

  describe("createImageUploadUrls", () => {
    it("rejects uploads when S3 is not configured", async () => {
      vi.mocked(isS3Configured).mockReturnValue(false);
      const caller = createOwnerCaller();

      await expect(
        caller.createImageUploadUrls({
          files: [
            {
              fileName: "hero.jpg",
              contentType: "image/jpeg",
              contentLength: 1024,
              slotIndex: 0,
            },
          ],
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("PRECONDITION_FAILED");
        expect((error as TRPCError).message).toBe(
          "Image uploads are not configured.",
        );
        return true;
      });
    });
  });

  describe("create", () => {
    it("rejects product images when S3 is not configured", async () => {
      vi.mocked(isS3Configured).mockReturnValue(false);
      const caller = createOwnerCaller();

      await expect(
        caller.create({
          ...baseCreateInput,
          images: [
            {
              key: buildProductImageKey(uploadId, 0, "image/jpeg"),
              sortOrder: 0,
            },
          ],
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("PRECONDITION_FAILED");
        expect((error as TRPCError).message).toBe(
          "Image uploads are not configured.",
        );
        return true;
      });
    });

    it("rejects invalid product image keys before creating the product", async () => {
      vi.mocked(isS3Configured).mockReturnValue(true);
      const caller = createOwnerCaller();

      await expect(
        caller.create({
          ...baseCreateInput,
          images: [{ key: "not-a-valid-product-image-key", sortOrder: 0 }],
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
        expect((error as TRPCError).message).toBe("Invalid product image key.");
        return true;
      });
    });
  });
});

describe("product router create", () => {
  beforeEach(() => {
    vi.mocked(isS3Configured).mockReset();
  });

  it("stores the Product Description as structured JSON", async () => {
    const db = createProductDb();
    const caller = createOwnerCallerWithDb(db);

    await caller.create({
      ...baseCreateInput,
      description: productDescription,
    });

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: productDescription,
        }),
      }),
    );
  });
});

describe("product router update", () => {
  beforeEach(() => {
    vi.mocked(isS3Configured).mockReset();
  });

  it("updates the Product Description as structured JSON", async () => {
    const db = createProductDb();
    const caller = createOwnerCallerWithDb(db);

    await caller.update({
      id: "product-1",
      ...baseCreateInput,
      description: productDescription,
    });

    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: productDescription,
        }),
      }),
    );
  });
});
