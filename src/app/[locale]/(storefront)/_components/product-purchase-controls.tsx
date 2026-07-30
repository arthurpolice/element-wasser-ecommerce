'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { FaMinus, FaPlus, FaShoppingBag } from 'react-icons/fa'

import {
  dispatchStorefrontCartItemAdded,
  useStorefrontCart
} from '~/app/[locale]/(storefront)/_components/storefront-cart'

type ProductPurchaseControlsProps = {
  product: {
    id: string
    name: string
    slug: string
    imageUrl: string | null
    imageAlt: string | null
    availableStock: number
    availableToSell: boolean
  }
}

const amountButtonClass =
  'inline-flex size-10 items-center justify-center border border-store-border text-store-ink transition hover:border-store-accent/45 hover:text-store-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25 disabled:pointer-events-none disabled:opacity-40'

export function ProductPurchaseControls({
  product
}: ProductPurchaseControlsProps) {
  const t = useTranslations('Storefront.productPage.purchase')
  const [amount, setAmount] = useState(1)
  const addItem = useStorefrontCart((state) => state.addItem)
  const amountInCart = useStorefrontCart(
    (state) =>
      state.items.find((item) => item.productId === product.id)?.amount ?? 0
  )
  const maxAddableAmount = Math.max(0, product.availableStock - amountInCart)
  const canAddToCart = product.availableToSell && maxAddableAmount > 0
  const amountInCartAtMax =
    product.availableStock > 0 && amountInCart >= product.availableStock

  useEffect(() => {
    setAmount((currentAmount) =>
      Math.min(Math.max(1, currentAmount), Math.max(1, maxAddableAmount))
    )
  }, [maxAddableAmount])

  function updateAmount(nextAmount: number) {
    setAmount(Math.min(Math.max(1, maxAddableAmount), Math.max(1, nextAmount)))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canAddToCart) {
      return
    }

    const addedItem = addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      imageUrl: product.imageUrl,
      imageAlt: product.imageAlt,
      amount: Math.min(amount, maxAddableAmount)
    })

    dispatchStorefrontCartItemAdded(addedItem)
  }

  return (
    <form
      className="border-store-border/80 space-y-4 pb-7"
      onSubmit={handleSubmit}
    >
      {!product.availableToSell ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="border-store-border text-store-muted inline-flex h-8 items-center border px-3 text-xs font-semibold tracking-[0.12em] uppercase">
            {t('unavailableTag')}
          </p>
          <button
            className="text-store-accent decoration-store-border hover:text-store-ink hover:decoration-store-ink focus-visible:ring-store-accent/25 text-sm font-semibold underline underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
            type="button"
          >
            {t('notifyWhenBack')}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-2">
          <span className="text-store-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>
              {t('availableAmount', { count: product.availableStock })}
            </span>
            {amountInCart > 0 ? (
              <span
                className={
                  amountInCartAtMax ? 'font-semibold text-red-700' : undefined
                }
              >
                {t('amountInCart', { count: amountInCart })}
              </span>
            ) : null}
          </span>
          <span className="flex items-center">
            <button
              aria-label={t('decreaseAmount')}
              className={amountButtonClass}
              disabled={amount <= 1 || !canAddToCart}
              onClick={() => updateAmount(amount - 1)}
              type="button"
            >
              <FaMinus aria-hidden="true" className="size-3" />
            </button>
            <input
              className="border-store-border bg-store-surface text-store-ink focus:ring-store-accent/25 h-10 w-16 border-y text-center text-sm font-semibold outline-none focus:ring-2"
              inputMode="numeric"
              min={1}
              max={Math.max(1, maxAddableAmount)}
              onChange={(event) =>
                updateAmount(Number.parseInt(event.target.value, 10) || 1)
              }
              disabled={!canAddToCart}
              type="number"
              value={amount}
            />
            <button
              aria-label={t('increaseAmount')}
              className={amountButtonClass}
              disabled={amount >= maxAddableAmount || !canAddToCart}
              onClick={() => updateAmount(amount + 1)}
              type="button"
            >
              <FaPlus aria-hidden="true" className="size-3" />
            </button>
          </span>
        </label>

        <button
          className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink focus-visible:ring-store-accent/25 inline-flex h-10 items-center justify-center gap-2 border px-5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45"
          disabled={!canAddToCart}
          type="submit"
        >
          <FaShoppingBag aria-hidden="true" className="size-4" />
          {t('addToCart')}
        </button>
      </div>
    </form>
  )
}
