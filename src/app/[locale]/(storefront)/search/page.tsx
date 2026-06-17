import { getTranslations } from 'next-intl/server'

import { ProductCard } from '~/app/[locale]/(storefront)/_components/product-card'
import { RevealOnScroll } from '~/app/[locale]/(storefront)/_components/reveal-on-scroll'
import { StorefrontShell } from '~/app/[locale]/(storefront)/_components/storefront-shell'
import { Link } from '~/i18n/navigation'
import { api, HydrateClient } from '~/trpc/server'

type SearchPageProps = {
  searchParams: Promise<{
    q?: string | string[]
    category?: string | string[]
    manufacturer?: string | string[]
    page?: string | string[]
  }>
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function nonEmptySearchParam(value: string | undefined) {
  const trimmedValue = value?.trim()
  if (!trimmedValue) {
    return undefined
  }

  return trimmedValue
}

function searchHref({
  q,
  categoryId,
  manufacturerId,
  page
}: {
  q: string
  categoryId?: string
  manufacturerId?: string
  page?: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  if (categoryId) {
    params.set('category', categoryId)
  }

  if (manufacturerId) {
    params.set('manufacturer', manufacturerId)
  }

  if (page && page > 1) {
    params.set('page', String(page))
  }

  const queryString = params.toString()
  return queryString ? `/search?${queryString}` : '/search'
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams
  const q = firstSearchParam(resolvedSearchParams.q)?.trim() ?? ''
  const selectedCategoryId = firstSearchParam(resolvedSearchParams.category)
  const selectedManufacturerId = firstSearchParam(
    resolvedSearchParams.manufacturer
  )
  const pageParam = firstSearchParam(resolvedSearchParams.page)
  const parsedPage = Number.parseInt(pageParam ?? '1', 10)
  const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage)
  const pageSize = 12
  const t = await getTranslations('Storefront.searchPage')
  const categoryId = nonEmptySearchParam(selectedCategoryId)
  const manufacturerId = nonEmptySearchParam(selectedManufacturerId)

  void api.catalog.navigationTree.prefetch()

  const results = await api.catalog.searchProducts({
    q,
    categoryId,
    manufacturerId,
    page,
    pageSize
  })

  const hasFilters = Boolean(categoryId ?? manufacturerId)

  return (
    <HydrateClient>
      <StorefrontShell searchQuery={q}>
        <div className="mx-auto max-w-7xl space-y-9">
          <RevealOnScroll>
            <header className="border-store-border/70 space-y-4 border-b pb-8">
              <p className="text-store-accent text-xs font-semibold tracking-[0.22em] uppercase">
                {t('eyebrow')}
              </p>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-3">
                  <h1 className="font-display text-store-ink text-4xl font-semibold tracking-tight sm:text-5xl">
                    {q ? t('titleWithQuery', { query: q }) : t('title')}
                  </h1>
                  <p className="text-store-muted max-w-2xl text-sm leading-6">
                    {q ? t('description') : t('emptyQuery')}
                  </p>
                </div>
                <p className="text-store-muted text-sm">
                  {t('summary', { count: results.totalCount })}
                </p>
              </div>
            </header>
          </RevealOnScroll>

          <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <aside className="space-y-7">
              <FacetGroup
                clearHref={searchHref({
                  q,
                  manufacturerId
                })}
                facets={results.categoryFacets}
                label={t('categoryFacet')}
                makeHref={(categoryId) =>
                  searchHref({
                    q,
                    categoryId,
                    manufacturerId
                  })
                }
                selectedId={categoryId}
              />
              <FacetGroup
                clearHref={searchHref({
                  q,
                  categoryId
                })}
                facets={results.manufacturerFacets}
                label={t('manufacturerFacet')}
                makeHref={(manufacturerId) =>
                  searchHref({
                    q,
                    categoryId,
                    manufacturerId
                  })
                }
                selectedId={manufacturerId}
              />
              {hasFilters ? (
                <Link
                  className="text-store-accent hover:text-store-ink text-sm font-semibold underline underline-offset-4 transition"
                  href={searchHref({ q })}
                >
                  {t('clearAll')}
                </Link>
              ) : null}
            </aside>

            <section className="space-y-8">
              {results.items.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {results.items.map((product, index) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        revealDelayClassName={
                          index % 3 === 1
                            ? 'storefront-enter-delay-1'
                            : index % 3 === 2
                              ? 'storefront-enter-delay-2'
                              : ''
                        }
                      />
                    ))}
                  </div>

                  {results.totalPages > 1 ? (
                    <div className="border-store-border/70 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
                      <p className="text-store-muted text-sm">
                        {t('pageSummary', {
                          page: results.page,
                          totalPages: results.totalPages
                        })}
                      </p>
                      <div className="flex gap-2">
                        {results.page > 1 ? (
                          <Link
                            className="border-store-border bg-store-surface text-store-ink hover:border-store-accent/40 hover:text-store-accent rounded-full border px-4 py-2 text-sm font-medium transition"
                            href={searchHref({
                              q,
                              categoryId,
                              manufacturerId,
                              page: results.page - 1
                            })}
                          >
                            {t('previous')}
                          </Link>
                        ) : null}
                        {results.page < results.totalPages ? (
                          <Link
                            className="border-store-border bg-store-surface text-store-ink hover:border-store-accent/40 hover:text-store-accent rounded-full border px-4 py-2 text-sm font-medium transition"
                            href={searchHref({
                              q,
                              categoryId,
                              manufacturerId,
                              page: results.page + 1
                            })}
                          >
                            {t('next')}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="border-store-border bg-store-surface/70 text-store-muted rounded-2xl border border-dashed px-6 py-16 text-center text-sm">
                  {q ? t('empty') : t('emptyQueryResults')}
                </div>
              )}
            </section>
          </div>
        </div>
      </StorefrontShell>
    </HydrateClient>
  )
}

function FacetGroup({
  clearHref,
  facets,
  label,
  makeHref,
  selectedId
}: {
  clearHref: string
  facets: Array<{ id: string; name: string; count: number }>
  label: string
  makeHref: (id: string) => string
  selectedId?: string
}) {
  if (facets.length === 0) {
    return null
  }

  return (
    <div>
      <h2 className="text-store-muted mb-3 text-xs tracking-[0.18em] uppercase">
        {label}
      </h2>
      <div className="grid gap-2">
        {facets.map((facet) => {
          const selected = facet.id === selectedId

          return (
            <Link
              className={`border-store-border/75 flex items-center justify-between gap-3 rounded-full border px-3 py-2 text-sm transition ${
                selected
                  ? 'bg-store-accent text-store-surface border-store-accent'
                  : 'bg-store-surface/70 text-store-ink hover:border-store-accent/40 hover:text-store-accent'
              }`}
              href={selected ? clearHref : makeHref(facet.id)}
              key={facet.id}
            >
              <span className="min-w-0 truncate">{facet.name}</span>
              <span className="shrink-0 text-xs opacity-75">{facet.count}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
