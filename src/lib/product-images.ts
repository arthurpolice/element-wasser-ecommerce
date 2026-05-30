export const MAX_PRODUCT_IMAGES = 5;

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const PRODUCT_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type ProductImageContentType = (typeof PRODUCT_IMAGE_CONTENT_TYPES)[number];

export const PRODUCT_IMAGE_UPLOAD_PREFIX = "products/uploads/";

const contentTypeExtensions: Record<ProductImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isProductImageContentType(
  value: string,
): value is ProductImageContentType {
  return PRODUCT_IMAGE_CONTENT_TYPES.includes(value as ProductImageContentType);
}

export function productImageExtension(contentType: ProductImageContentType) {
  return contentTypeExtensions[contentType];
}

export function buildProductImageKey(
  uploadId: string,
  index: number,
  contentType: ProductImageContentType,
) {
  return `${PRODUCT_IMAGE_UPLOAD_PREFIX}${uploadId}/${index}.${productImageExtension(contentType)}`;
}

const productImageKeyPattern = new RegExp(
  `^${PRODUCT_IMAGE_UPLOAD_PREFIX}[0-9a-f-]{36}/[0-4]\\.(jpg|png|webp|gif)$`,
);

export function isValidProductImageKey(key: string) {
  return productImageKeyPattern.test(key);
}
