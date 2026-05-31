export function formatPriceCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CHF",
  }).format(cents / 100);
}

export function formatDispatchEstimate(
  minDays: number,
  maxDays: number,
): string {
  if (minDays === maxDays) {
    return `${minDays} days`;
  }

  return `${minDays}–${maxDays} days`;
}
