import { describe, expect, it } from "vitest";

import {
  buildProductImageKey,
  isProductImageContentType,
  isValidProductImageKey,
  productImageExtension,
} from "~/lib/product-images";

const uploadId = "550e8400-e29b-41d4-a716-446655440000";

describe("product-images", () => {
  describe("isProductImageContentType", () => {
    it("accepts supported image types", () => {
      expect(isProductImageContentType("image/jpeg")).toBe(true);
      expect(isProductImageContentType("image/png")).toBe(true);
      expect(isProductImageContentType("image/webp")).toBe(true);
      expect(isProductImageContentType("image/gif")).toBe(true);
    });

    it("rejects unsupported types", () => {
      expect(isProductImageContentType("image/svg+xml")).toBe(false);
      expect(isProductImageContentType("application/pdf")).toBe(false);
    });
  });

  describe("productImageExtension", () => {
    it("maps content types to file extensions", () => {
      expect(productImageExtension("image/jpeg")).toBe("jpg");
      expect(productImageExtension("image/png")).toBe("png");
      expect(productImageExtension("image/webp")).toBe("webp");
      expect(productImageExtension("image/gif")).toBe("gif");
    });
  });

  describe("buildProductImageKey", () => {
    it("builds a key under the upload prefix", () => {
      expect(buildProductImageKey(uploadId, 0, "image/jpeg")).toBe(
        `products/uploads/${uploadId}/0.jpg`,
      );
      expect(buildProductImageKey(uploadId, 4, "image/webp")).toBe(
        `products/uploads/${uploadId}/4.webp`,
      );
    });
  });

  describe("isValidProductImageKey", () => {
    it("accepts keys produced by buildProductImageKey", () => {
      expect(
        isValidProductImageKey(buildProductImageKey(uploadId, 0, "image/png")),
      ).toBe(true);
      expect(
        isValidProductImageKey(buildProductImageKey(uploadId, 4, "image/gif")),
      ).toBe(true);
    });

    it("rejects keys outside the upload prefix", () => {
      expect(isValidProductImageKey("catalog/other.jpg")).toBe(false);
    });

    it("rejects keys with invalid slot indices", () => {
      expect(
        isValidProductImageKey(`products/uploads/${uploadId}/5.jpg`),
      ).toBe(false);
    });

    it("rejects keys with invalid upload ids or extensions", () => {
      expect(
        isValidProductImageKey(`products/uploads/not-a-uuid/0.jpg`),
      ).toBe(false);
      expect(
        isValidProductImageKey(`products/uploads/${uploadId}/0.svg`),
      ).toBe(false);
    });
  });
});
