import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { ProductDescription } from '~/app/[locale]/(storefront)/_components/product-description'
import { ProductPurchaseControls } from '~/app/[locale]/(storefront)/_components/product-purchase-controls'
import { RevealOnScroll } from '~/app/[locale]/(storefront)/_components/reveal-on-scroll'
import { StorefrontShell } from '~/app/[locale]/(storefront)/_components/storefront-shell'
import { Link } from '~/i18n/navigation'
import { formatDispatchEstimate, formatPriceCents } from '~/lib/format-catalog'
import { calculateUnitPriceCents } from '~/lib/order-quote'
import { api, HydrateClient } from '~/trpc/server'

type ProductPageProps = {
  params: Promise<{ locale: string; slug: string }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  const locale = await getLocale()
  const t = await getTranslations('Storefront.productPage')

  const product = await api.catalog.getProductBySlug({ slug })
  if (!product) {
    notFound()
  }

  void api.catalog.navigationTree.prefetch()

  const unitPriceCents = calculateUnitPriceCents(
    product.priceCents,
    product.discountPercent
  )
  const primaryImage = product.images[0]
  const secondaryImages = product.images.slice(1, 5)
  const firstCategory = product.categories[0]
  const hasImageRail = product.images.length > 1

  return (
    <HydrateClient>
      <StorefrontShell>
        <div className="mx-auto max-w-7xl">
          <section className="grid gap-10 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] xl:gap-16">
            <RevealOnScroll>
              <div
                className={
                  hasImageRail
                    ? 'grid gap-3 sm:grid-cols-[4.75rem_minmax(0,1fr)]'
                    : 'grid gap-3'
                }
              >
                {hasImageRail ? (
                  <div className="hidden gap-3 sm:grid">
                    {product.images.slice(0, 5).map((image, index) => (
                      <div
                        className="border-store-border/80 bg-store-surface relative aspect-square overflow-hidden rounded-lg border"
                        key={image.id}
                      >
                        <Image
                          alt={
                            image.altText ??
                            t('thumbnailAlt', { index: index + 1 })
                          }
                          className="object-cover"
                          fill
                          sizes="76px"
                          src={image.url}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="border-store-border/80 bg-store-surface relative aspect-5/6 overflow-hidden rounded-lg border shadow-[0_26px_70px_-48px_rgba(31,42,36,0.65)]">
                    {primaryImage ? (
                      <Image
                        alt={primaryImage.altText ?? product.name}
                        className="object-contain"
                        fill
                        priority
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) calc(100vw - 22rem), 700px"
                        src={primaryImage.url}
                      />
                    ) : (
                      <div className="text-store-muted flex h-full items-center justify-center text-sm">
                        {t('noImage')}
                      </div>
                    )}
                  </div>

                  {secondaryImages.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:hidden">
                      {secondaryImages.map((image, index) => (
                        <div
                          className="border-store-border/80 bg-store-surface relative aspect-square overflow-hidden rounded-lg border"
                          key={image.id}
                        >
                          <Image
                            alt={
                              image.altText ??
                              t('thumbnailAlt', { index: index + 2 })
                            }
                            className="object-cover"
                            fill
                            sizes="50vw"
                            src={image.url}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </RevealOnScroll>

            <RevealOnScroll delayClassName="storefront-enter-delay-1">
              <article className="space-y-8 xl:sticky xl:top-32">
                <header className="border-store-border/80 space-y-4 border-b pb-7">
                  {firstCategory ? (
                    <nav
                      aria-label={t('categoryBreadcrumbLabel')}
                      className="text-store-muted flex flex-wrap items-center gap-2 text-xs tracking-[0.12em] uppercase"
                    >
                      {firstCategory.breadcrumbs.map((category, index) => (
                        <span
                          className="flex items-center gap-2"
                          key={category.id}
                        >
                          {index > 0 ? <span aria-hidden="true">/</span> : null}
                          <Link
                            className="hover:text-store-accent transition"
                            href={`/categories/${category.slugPath}`}
                          >
                            {category.name}
                          </Link>
                        </span>
                      ))}
                    </nav>
                  ) : null}
                  <div className="space-y-2">
                    <h1 className="font-display text-store-ink max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                      {product.name}
                    </h1>
                    <p className="text-store-muted text-sm font-medium">
                      {product.manufacturerName}
                    </p>
                  </div>
                </header>

                <div className="border-store-border/80 space-y-5 border-b pb-7">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-store-ink mt-2 text-3xl font-semibold">
                        {formatPriceCents(unitPriceCents, locale)}
                      </p>
                    </div>
                    {product.discountPercent ? (
                      <p className="border-store-accent/30 text-store-accent rounded-lg border px-3 py-1.5 text-sm font-semibold">
                        {t('saleBadge', {
                          percent: product.discountPercent
                        })}
                      </p>
                    ) : null}
                  </div>

                  {product.discountPercent ? (
                    <p className="text-store-muted text-sm">
                      {t('listPriceLabel')}{' '}
                      <span className="line-through">
                        {formatPriceCents(product.priceCents, locale)}
                      </span>
                    </p>
                  ) : null}
                </div>

                <ProductPurchaseControls
                  product={{
                    id: product.id,
                    name: product.name,
                    slug: product.slug,
                    imageUrl: primaryImage?.url ?? null,
                    imageAlt: primaryImage?.altText ?? product.name,
                    availableStock: product.availableStock,
                    availableToSell: product.availableToSell
                  }}
                />

                <dl className="border-store-border/80 grid grid-cols-1 border-y text-sm">
                  <div className="border-store-border/80 border-b py-4">
                    <dt className="text-store-muted">
                      {t('details.dispatchEstimate')}
                    </dt>
                    <dd className="text-store-ink mt-1 font-medium">
                      {formatDispatchEstimate(
                        product.dispatchMinDays,
                        product.dispatchMaxDays,
                        locale
                      )}
                    </dd>
                  </div>
                  <div className="py-4">
                    <dt className="text-store-muted">{t('details.reviews')}</dt>
                    <dd className="mt-1">
                      {product.reviewCount > 0 && product.averageRating ? (
                        <span className="text-store-accent font-medium">
                          {t('reviewsSummary', {
                            rating: product.averageRating.toFixed(1),
                            count: product.reviewCount
                          })}
                        </span>
                      ) : (
                        <span className="text-store-muted">
                          {t('noReviews')}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            </RevealOnScroll>
          </section>

          <RevealOnScroll delayClassName="storefront-enter-delay-2">
            <section className="border-store-border/80 mt-14 grid gap-8 border-t pt-10 lg:mt-20 lg:grid-cols-[17rem_minmax(0,1fr)] lg:pt-14">
              <header>
                <h2 className="font-display text-store-ink mt-2 text-3xl font-semibold tracking-tight">
                  {t('descriptionTitle')}
                </h2>
              </header>

              <div>
                {product.description ? (
                  <ProductDescription description={product.description} />
                ) : (
                  <p className="text-store-muted text-sm">
                    {t('noDescription')}
                  </p>
                )}
              </div>
            </section>
          </RevealOnScroll>
        </div>
      </StorefrontShell>
    </HydrateClient>
  )
}
