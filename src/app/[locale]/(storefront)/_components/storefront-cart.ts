'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type StorefrontCartItem = {
  productId: string
  name: string
  slug: string
  imageUrl: string | null
  imageAlt: string | null
  amount: number
}

export type StorefrontAddedCartItem = StorefrontCartItem

type StorefrontCartState = {
  items: StorefrontCartItem[]
  addItem: (item: StorefrontCartItem) => StorefrontCartItem
  updateAmount: (productId: string, amount: number) => void
}

function normalizeAmount(amount: number) {
  if (!Number.isFinite(amount)) {
    return 1
  }

  return Math.min(99, Math.max(1, Math.trunc(amount)))
}

export const storefrontCartItemAddedEventName = 'storefront-cart-item-added'

export function dispatchStorefrontCartItemAdded(item: StorefrontAddedCartItem) {
  window.dispatchEvent(
    new CustomEvent<StorefrontAddedCartItem>(storefrontCartItemAddedEventName, {
      detail: item
    })
  )
}

export const useStorefrontCart = create<StorefrontCartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const amount = normalizeAmount(item.amount)
        const existing = get().items.find(
          (cartItem) => cartItem.productId === item.productId
        )
        const addedItem = existing
          ? { ...existing, amount: normalizeAmount(existing.amount + amount) }
          : { ...item, amount }

        set((state) => ({
          items: existing
            ? state.items.map((cartItem) =>
                cartItem.productId === item.productId ? addedItem : cartItem
              )
            : [...state.items, addedItem]
        }))

        return addedItem
      },
      updateAmount: (productId, amount) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId
              ? { ...item, amount: normalizeAmount(amount) }
              : item
          )
        }))
      }
    }),
    {
      name: 'element-wasser-cart'
    }
  )
)
