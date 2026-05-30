import { afterEach, describe, expect, it, vi } from "vitest";

import { PRODUCT_IMAGE_MAX_BYTES } from "~/lib/product-images";
import {
  ProductImageUploadError,
  uploadProductImages,
} from "~/lib/upload-product-images";

function createImageFile(
  name: string,
  type: string,
  size = 100,
): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe("uploadProductImages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty array when no slots contain files", async () => {
    const createImageUploadUrls = vi.fn();

    await expect(
      uploadProductImages([null, null], createImageUploadUrls),
    ).resolves.toEqual([]);

    expect(createImageUploadUrls).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types", async () => {
    await expect(
      uploadProductImages(
        [{ file: createImageFile("photo.svg", "image/svg+xml") }],
        vi.fn(),
      ),
    ).rejects.toThrow(new ProductImageUploadError("Unsupported image type."));
  });

  it("rejects images that exceed the size limit", async () => {
    await expect(
      uploadProductImages(
        [
          {
            file: createImageFile(
              "large.jpg",
              "image/jpeg",
              PRODUCT_IMAGE_MAX_BYTES + 1,
            ),
          },
        ],
        vi.fn(),
      ),
    ).rejects.toThrow(
      new ProductImageUploadError("Image exceeds the maximum file size."),
    );
  });

  it("rejects invalid slot indices", async () => {
    const slots = Array.from({ length: 6 }, (_, slotIndex) =>
      slotIndex === 5
        ? { file: createImageFile("photo.jpg", "image/jpeg") }
        : null,
    );

    await expect(uploadProductImages(slots, vi.fn())).rejects.toThrow(
      new ProductImageUploadError("Invalid image slot."),
    );
  });

  it("uploads each filled slot and returns persisted image metadata", async () => {
    const file = createImageFile("hero.jpg", "image/jpeg");
    const createImageUploadUrls = vi.fn().mockResolvedValue({
      uploads: [
        {
          key: "products/uploads/test/0.jpg",
          uploadUrl: "https://upload.example/0",
          contentType: "image/jpeg",
          slotIndex: 0,
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadProductImages([{ file }], createImageUploadUrls),
    ).resolves.toEqual([
      { key: "products/uploads/test/0.jpg", sortOrder: 0 },
    ]);

    expect(createImageUploadUrls).toHaveBeenCalledWith({
      files: [
        {
          fileName: "hero.jpg",
          contentType: "image/jpeg",
          contentLength: file.size,
          slotIndex: 0,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith("https://upload.example/0", {
      method: "PUT",
      body: file,
      headers: { "Content-Type": "image/jpeg" },
    });
  });

  it("rejects when the upload URL factory returns the wrong number of uploads", async () => {
    await expect(
      uploadProductImages(
        [{ file: createImageFile("hero.jpg", "image/jpeg") }],
        vi.fn().mockResolvedValue({ uploads: [] }),
      ),
    ).rejects.toThrow(
      new ProductImageUploadError("Could not prepare image uploads."),
    );
  });

  it("rejects when the presigned upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      uploadProductImages(
        [{ file: createImageFile("hero.jpg", "image/jpeg") }],
        vi.fn().mockResolvedValue({
          uploads: [
            {
              key: "products/uploads/test/0.jpg",
              uploadUrl: "https://upload.example/0",
              contentType: "image/jpeg",
              slotIndex: 0,
            },
          ],
        }),
      ),
    ).rejects.toThrow(new ProductImageUploadError("Image upload failed."));
  });
});
