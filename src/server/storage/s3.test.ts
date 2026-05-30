import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  S3_BUCKET: "ew-bucket" as string | undefined,
  S3_REGION: "eu-central-1" as string | undefined,
  AWS_ACCESS_KEY_ID: "access-key" as string | undefined,
  AWS_SECRET_ACCESS_KEY: "secret-key" as string | undefined,
  S3_PUBLIC_URL_BASE: undefined as string | undefined,
  S3_ENDPOINT: undefined as string | undefined,
  S3_FORCE_PATH_STYLE: undefined as boolean | undefined,
}));

vi.mock("~/env", () => ({
  env: envMock,
}));

import { getProductImagePublicUrl, isS3Configured } from "~/server/storage/s3";

describe("s3 storage helpers", () => {
  beforeEach(() => {
    envMock.S3_BUCKET = "ew-bucket";
    envMock.S3_REGION = "eu-central-1";
    envMock.AWS_ACCESS_KEY_ID = "access-key";
    envMock.AWS_SECRET_ACCESS_KEY = "secret-key";
    envMock.S3_PUBLIC_URL_BASE = undefined;
    envMock.S3_ENDPOINT = undefined;
    envMock.S3_FORCE_PATH_STYLE = undefined;
  });

  describe("isS3Configured", () => {
    it("returns true when required credentials are present", () => {
      expect(isS3Configured()).toBe(true);
    });

    it("returns false when any required setting is missing", () => {
      envMock.S3_BUCKET = undefined;
      expect(isS3Configured()).toBe(false);
    });
  });

  describe("getProductImagePublicUrl", () => {
    const key = "products/uploads/test/0.jpg";

    it("uses the configured public URL base when present", () => {
      envMock.S3_PUBLIC_URL_BASE = "https://cdn.example.com/";

      expect(getProductImagePublicUrl(key)).toBe(
        "https://cdn.example.com/products/uploads/test/0.jpg",
      );
    });

    it("builds the default AWS URL when no custom base is configured", () => {
      expect(getProductImagePublicUrl(key)).toBe(
        "https://ew-bucket.s3.eu-central-1.amazonaws.com/products/uploads/test/0.jpg",
      );
    });

    it("builds path-style URLs for custom endpoints", () => {
      envMock.S3_ENDPOINT = "http://localhost:9000/";
      envMock.S3_FORCE_PATH_STYLE = true;

      expect(getProductImagePublicUrl(key)).toBe(
        "http://localhost:9000/ew-bucket/products/uploads/test/0.jpg",
      );
    });

    it("builds virtual-host-style URLs for custom endpoints", () => {
      envMock.S3_ENDPOINT = "http://localhost:9000";
      envMock.S3_FORCE_PATH_STYLE = false;

      expect(getProductImagePublicUrl(key)).toBe(
        "http://localhost:9000/products/uploads/test/0.jpg",
      );
    });

    it("throws when public URL settings are missing", () => {
      envMock.S3_BUCKET = undefined;
      envMock.S3_REGION = undefined;

      expect(() => getProductImagePublicUrl(key)).toThrow(
        "S3 public URL settings are not configured.",
      );
    });
  });
});
