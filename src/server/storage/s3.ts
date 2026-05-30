import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "~/env";
import {
  buildProductImageKey,
  type ProductImageContentType,
} from "~/lib/product-images";

const PRESIGNED_URL_EXPIRES_IN_SECONDS = 15 * 60;

let s3Client: S3Client | null = null;

export function isS3Configured() {
  return Boolean(
    env.S3_BUCKET &&
      env.S3_REGION &&
      env.AWS_ACCESS_KEY_ID &&
      env.AWS_SECRET_ACCESS_KEY,
  );
}

function getS3Client() {
  if (!isS3Configured()) {
    throw new Error("S3 is not configured.");
  }

  s3Client ??= new S3Client({
    region: env.S3_REGION!,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
    ...(env.S3_ENDPOINT
      ? {
          endpoint: env.S3_ENDPOINT,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        }
      : {}),
  });

  return s3Client;
}

export function getProductImagePublicUrl(key: string) {
  if (env.S3_PUBLIC_URL_BASE) {
    return `${env.S3_PUBLIC_URL_BASE.replace(/\/$/, "")}/${key}`;
  }

  if (!env.S3_BUCKET || !env.S3_REGION) {
    throw new Error("S3 public URL settings are not configured.");
  }

  if (env.S3_ENDPOINT) {
    const endpoint = env.S3_ENDPOINT.replace(/\/$/, "");
    return env.S3_FORCE_PATH_STYLE
      ? `${endpoint}/${env.S3_BUCKET}/${key}`
      : `${endpoint}/${key}`;
  }

  return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
}

type CreatePresignedUploadInput = {
  uploadId: string;
  index: number;
  contentType: ProductImageContentType;
  contentLength: number;
};

export async function createPresignedProductImageUpload({
  uploadId,
  index,
  contentType,
  contentLength,
}: CreatePresignedUploadInput) {
  const key = buildProductImageKey(uploadId, index, contentType);

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
  });

  return {
    key,
    uploadUrl,
    publicUrl: getProductImagePublicUrl(key),
    contentType,
  };
}
