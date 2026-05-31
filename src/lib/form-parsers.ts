export function parseMoneyToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

export function parseNonNegativeInt(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isInteger(amount) || amount < 0) {
    return null;
  }

  return amount;
}

export function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

export function formatCentsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}
