import {
  isProductImageContentType,
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_MAX_BYTES,
} from "~/lib/product-images";

type UploadableProductImageSlots = Array<{ file: File } | null>;

type UploadDescriptor = {
  key: string;
  uploadUrl: string;
  contentType: string;
  slotIndex: number;
};

type CreateImageUploadUrls = (input: {
  files: Array<{
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    contentLength: number;
    slotIndex: number;
  }>;
}) => Promise<{ uploads: UploadDescriptor[] }>;

export class ProductImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageUploadError";
  }
}

export async function uploadProductImages(
  slots: UploadableProductImageSlots,
  createImageUploadUrls: CreateImageUploadUrls,
) {
  const entries = slots.flatMap((image, slotIndex) =>
    image ? [{ file: image.file, slotIndex }] : [],
  );

  if (entries.length === 0) {
    return [];
  }

  for (const entry of entries) {
    if (!isProductImageContentType(entry.file.type)) {
      throw new ProductImageUploadError("Unsupported image type.");
    }

    if (entry.file.size > PRODUCT_IMAGE_MAX_BYTES) {
      throw new ProductImageUploadError("Image exceeds the maximum file size.");
    }

    if (entry.slotIndex < 0 || entry.slotIndex >= MAX_PRODUCT_IMAGES) {
      throw new ProductImageUploadError("Invalid image slot.");
    }
  }

  const { uploads } = await createImageUploadUrls({
    files: entries.map((entry) => {
      if (!isProductImageContentType(entry.file.type)) {
        throw new ProductImageUploadError("Unsupported image type.");
      }

      return {
        fileName: entry.file.name,
        contentType: entry.file.type,
        contentLength: entry.file.size,
        slotIndex: entry.slotIndex,
      };
    }),
  });

  if (uploads.length !== entries.length) {
    throw new ProductImageUploadError("Could not prepare image uploads.");
  }

  await Promise.all(
    uploads.map(async (upload) => {
      const entry = entries.find((item) => item.slotIndex === upload.slotIndex);
      if (!entry) {
        throw new ProductImageUploadError("Could not prepare image uploads.");
      }

      const response = await fetch(upload.uploadUrl, {
        method: "PUT",
        body: entry.file,
        headers: {
          "Content-Type": upload.contentType,
        },
      });

      if (!response.ok) {
        throw new ProductImageUploadError("Image upload failed.");
      }
    }),
  );

  return uploads.map((upload) => ({
    key: upload.key,
    sortOrder: upload.slotIndex,
  }));
}
