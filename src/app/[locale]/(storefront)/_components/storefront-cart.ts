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
  clear: () => void
  removeItem: (productId: string) => void
  updateAmount: (productId: string, amount: number) => void
}

export function normalizeStorefrontCartAmount(amount: number) {
  if (!Number.isFinite(amount)) {
    return 1
  }

  return Math.min(99, Math.max(1, Math.trunc(amount)))
}

export function removeStorefrontCartItem(
  items: StorefrontCartItem[],
  productId: string
) {
  return items.filter((item) => item.productId !== productId)
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
        const amount = normalizeStorefrontCartAmount(item.amount)
        const existing = get().items.find(
          (cartItem) => cartItem.productId === item.productId
        )
        const addedItem = existing
          ? {
              ...existing,
              amount: normalizeStorefrontCartAmount(existing.amount + amount)
            }
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
      clear: () => set({ items: [] }),
      removeItem: (productId) => {
        set((state) => ({
          items: removeStorefrontCartItem(state.items, productId)
        }))
      },
      updateAmount: (productId, amount) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId
              ? { ...item, amount: normalizeStorefrontCartAmount(amount) }
              : item
          )
        }))
      }
    }),
    {
      name: 'element-wasser-cart',
      // The server cannot read local storage. Restore a saved Cart only after
      // React has hydrated the server-rendered empty Cart.
      skipHydration: true
    }
  )
)
