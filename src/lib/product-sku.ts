import type { Prisma } from "../../generated/prisma";

const SKU_BRAND_PREFIX = "EW";
const SKU_HINT_LENGTH = 3;
const SKU_SEQUENCE_LENGTH = 5;

export function productSkuHint(value: string): string {
  const alphanumeric = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const hint = alphanumeric.slice(0, SKU_HINT_LENGTH);
  return hint.padEnd(SKU_HINT_LENGTH, "X");
}

export function buildProductSkuPrefix(
  manufacturerName: string,
  productName: string,
): string {
  return `${productSkuHint(manufacturerName)}-${productSkuHint(productName)}`;
}

export function formatProductSku(prefix: string, sequence: number): string {
  return `${SKU_BRAND_PREFIX}-${prefix}-${String(sequence).padStart(SKU_SEQUENCE_LENGTH, "0")}`;
}

export async function allocateProductSku(
  tx: Prisma.TransactionClient,
  manufacturerName: string,
  productName: string,
): Promise<string> {
  const prefix = buildProductSkuPrefix(manufacturerName, productName);
  const sequence = await tx.productSkuSequence.upsert({
    where: { prefix },
    create: { prefix, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });

  return formatProductSku(prefix, sequence.nextNumber - 1);
}
