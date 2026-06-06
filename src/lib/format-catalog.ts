export function formatPriceCents(cents: number, locale: string): string {
  const sign = cents < 0 ? '-' : ''
  const absoluteCents = Math.abs(cents)
  const francs = Math.floor(absoluteCents / 100)
  const centimes = absoluteCents % 100
  const formattedFrancs = new Intl.NumberFormat(locale).format(francs)
  const formattedAmount =
    centimes === 0
      ? `${formattedFrancs}.-`
      : `${formattedFrancs}.${centimes.toString().padStart(2, '0')}`

  return `${sign}${formattedAmount} CHF`
}

export function formatDispatchEstimate(
  minDays: number,
  maxDays: number,
  locale?: string
): string {
  const unit = locale?.startsWith('de')
    ? 'Tage'
    : minDays === 1 && maxDays === 1
      ? 'day'
      : 'days'

  if (minDays === maxDays) {
    return `${minDays} ${unit}`
  }

  return `${minDays}–${maxDays} ${unit}`
}
