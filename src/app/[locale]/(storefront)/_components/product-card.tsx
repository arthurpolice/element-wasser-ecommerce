import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import { RevealOnScroll } from '~/app/[locale]/(storefront)/_components/reveal-on-scroll'
import { formatDispatchEstimate, formatPriceCents } from '~/lib/format-catalog'
import { Link } from '~/i18n/navigation'
import type { StorefrontProduct } from '~/lib/catalog-product'
import { calculateUnitPriceCents } from '~/lib/order-quote'

type ProductCardProps = {
  product: StorefrontProduct
  revealDelayClassName?: string
}

export function ProductCard({
  product,
  revealDelayClassName = ''
}: ProductCardProps) {
  const locale = useLocale()
  const t = useTranslations('Storefront.productCard')
  const unitPriceCents = calculateUnitPriceCents(
    product.priceCents,
    product.discountPercent
  )

  return (
    <RevealOnScroll delayClassName={revealDelayClassName}>
      <Link
        className="group border-store-border/80 bg-store-surface hover:border-store-accent/30 flex h-full flex-col overflow-hidden rounded-2xl border shadow-[0_12px_40px_-28px_rgba(31,42,36,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_-24px_rgba(47,111,99,0.28)]"
        href={`/products/${product.slug}`}
      >
        <div className="relative aspect-4/5 overflow-hidden bg-[linear-gradient(145deg,rgba(143,182,168,0.18),rgba(250,248,244,0.9))]">
          {product.imageUrl ? (
            <Image
              alt={product.imageAlt ?? product.name}
              className="object-cover transition duration-500 group-hover:scale-[1.03]"
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              src={product.imageUrl}
            />
          ) : (
            <div className="text-store-muted flex h-full items-center justify-center text-sm">
              {t('noImage')}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <p className="text-store-muted text-xs tracking-[0.18em] uppercase">
            {product.manufacturerName}
          </p>
          <h3 className="font-display text-store-ink text-lg font-semibold tracking-tight">
            {product.name}
          </h3>
          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
            <div>
              <p className="text-store-ink font-medium">
                {formatPriceCents(unitPriceCents, locale)}
              </p>
              {product.discountPercent ? (
                <p className="text-store-muted text-xs line-through">
                  {formatPriceCents(product.priceCents, locale)}
                </p>
              ) : null}
            </div>
            <p className="text-store-muted text-right text-xs">
              {formatDispatchEstimate(
                product.dispatchMinDays,
                product.dispatchMaxDays,
                locale
              )}
            </p>
          </div>
          {product.reviewCount > 0 && product.averageRating ? (
            <p className="text-store-accent text-xs">
              {t('reviewsSummary', {
                rating: product.averageRating.toFixed(1),
                count: product.reviewCount
              })}
            </p>
          ) : null}
        </div>
      </Link>
    </RevealOnScroll>
  )
}
