const mobileSearchSuggestionLimit = 5
const desktopSearchSuggestionLimit = 6

export function normalizeProductSearchQuery(value: string) {
  const query = value.trim().replace(/\s+/g, ' ')

  if (!/[\p{L}\p{N}]/u.test(query)) {
    return ''
  }

  return query
}

export function getProductSearchSuggestionLimit(isMobile: boolean) {
  return isMobile ? mobileSearchSuggestionLimit : desktopSearchSuggestionLimit
}

export function buildProductSearchResultsHref(query: string) {
  const normalizedQuery = normalizeProductSearchQuery(query)

  return normalizedQuery
    ? `/search?q=${encodeURIComponent(normalizedQuery)}`
    : '/search'
}

export const productSearchDebounceMs = 250
