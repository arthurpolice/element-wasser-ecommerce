'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { FaSearch, FaShoppingBag } from 'react-icons/fa'

import {
  buildProductSearchResultsHref,
  getProductSearchSuggestionLimit,
  normalizeProductSearchQuery,
  productSearchDebounceMs
} from '~/app/[locale]/(storefront)/_components/product-search-utils'
import { Link, useRouter } from '~/i18n/navigation'
import { api } from '~/trpc/react'

function useIsMobileSearchViewport() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')

    function syncViewport() {
      setIsMobile(mediaQuery.matches)
    }

    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)

    return () => {
      mediaQuery.removeEventListener('change', syncViewport)
    }
  }, [])

  return isMobile
}

type ProductSearchBarProps = {
  initialQuery?: string
}

export function ProductSearchBar({ initialQuery = '' }: ProductSearchBarProps) {
  const t = useTranslations('Storefront.topNav')
  const router = useRouter()
  const rootRef = useRef<HTMLFormElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobileSearchViewport()
  const suggestionLimit = getProductSearchSuggestionLimit(isMobile)
  const normalizedQuery = useMemo(
    () => normalizeProductSearchQuery(query),
    [query]
  )
  const resultsHref = buildProductSearchResultsHref(normalizedQuery)
  const suggestionsQuery = api.catalog.searchSuggestions.useQuery(
    { q: debouncedQuery, limit: suggestionLimit },
    {
      enabled: debouncedQuery.length > 0,
      staleTime: 30_000
    }
  )
  const suggestions = suggestionsQuery.data ?? []
  const showDropdown = open && normalizedQuery.length > 0
  const showEmptyState =
    debouncedQuery.length > 0 &&
    suggestionsQuery.isFetched &&
    !suggestionsQuery.isFetching &&
    suggestions.length === 0

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(normalizedQuery)
    }, productSearchDebounceMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [normalizedQuery])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (!rootRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!normalizedQuery) {
      return
    }

    setOpen(false)
    router.push(resultsHref)
  }

  return (
    <form
      className="relative w-full max-w-[1400px]"
      onSubmit={submitSearch}
      ref={rootRef}
      role="search"
    >
      <label className="border-store-border/80 bg-store-surface/80 focus-within:border-store-accent/60 focus-within:bg-store-surface flex h-14 min-w-0 items-center gap-3 rounded-full border px-5 shadow-[0_16px_44px_-34px_rgba(31,42,36,0.55)] transition focus-within:shadow-[0_18px_48px_-32px_rgba(47,111,99,0.35)]">
        <FaSearch aria-hidden="true" className="text-store-accent size-4" />
        <span className="sr-only">{t('searchLabel')}</span>
        <input
          autoComplete="off"
          className="placeholder:text-store-muted/75 text-store-ink h-full min-w-0 flex-1 bg-transparent text-base outline-none"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('searchPlaceholder')}
          type="search"
          value={query}
        />
      </label>

      {showDropdown ? (
        <div className="border-store-border bg-store-surface storefront-dropdown-enter absolute top-full right-0 left-0 z-30 mt-3 overflow-hidden rounded-[1.35rem] border shadow-[0_28px_80px_-32px_rgba(31,42,36,0.48)]">
          {suggestions.length > 0 ? (
            <>
              <div className="divide-store-border/70 divide-y">
                {suggestions.map((suggestion) => (
                  <Link
                    className={`hover:bg-store-bg/70 focus-visible:bg-store-bg/70 focus-visible:ring-store-accent/25 flex min-h-20 items-center gap-3 px-4 py-3 transition focus-visible:ring-2 focus-visible:outline-none sm:gap-4 sm:px-5 ${
                      suggestion.availableToSell ? '' : 'opacity-60'
                    }`}
                    href={`/products/${suggestion.slug}`}
                    key={suggestion.id}
                    onPointerDown={() => setOpen(false)}
                  >
                    <span className="border-store-border/70 bg-store-bg relative size-14 shrink-0 overflow-hidden rounded-xl border">
                      {suggestion.imageUrl ? (
                        <Image
                          alt={suggestion.imageAlt ?? suggestion.name}
                          className="object-cover"
                          fill
                          sizes="56px"
                          src={suggestion.imageUrl}
                        />
                      ) : (
                        <FaShoppingBag
                          aria-hidden="true"
                          className="text-store-accent absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-store-ink block truncate text-sm font-semibold sm:text-[0.95rem]">
                        {suggestion.name}
                      </span>
                      <span className="text-store-muted mt-1 block truncate text-xs">
                        {suggestion.manufacturerName}
                      </span>
                      {suggestion.showSku ? (
                        <span className="text-store-muted/80 mt-1 block truncate text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
                          {suggestion.sku}
                        </span>
                      ) : null}
                    </span>
                    {!suggestion.availableToSell ? (
                      <span className="border-store-border text-store-muted shrink-0 rounded-full border px-2 py-1 text-[0.68rem] font-semibold whitespace-nowrap">
                        {t('searchUnavailable')}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
              <Link
                className="border-store-border/70 text-store-accent hover:bg-store-bg/70 hover:text-store-ink focus-visible:bg-store-bg/70 focus-visible:ring-store-accent/25 block border-t px-5 py-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
                href={resultsHref}
                onPointerDown={() => setOpen(false)}
              >
                {t('searchViewAll')}
              </Link>
            </>
          ) : null}

          {suggestionsQuery.isFetching && suggestions.length === 0 ? (
            <p className="text-store-muted px-5 py-4 text-sm">
              {t('searchLoading')}
            </p>
          ) : null}

          {showEmptyState ? (
            <p className="text-store-muted px-5 py-4 text-sm">
              {t('searchEmpty')}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
