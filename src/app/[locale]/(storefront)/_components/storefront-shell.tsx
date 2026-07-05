'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { FaBars } from 'react-icons/fa'

import { CategoryNav } from '~/app/[locale]/(storefront)/_components/category-nav'
import { ProductSearchBar } from '~/app/[locale]/(storefront)/_components/product-search-bar'
import {
  iconButtonClass,
  TopNavActions,
  type StorefrontDropdown
} from '~/app/[locale]/(storefront)/_components/storefront-actions'
import {
  storefrontCartItemAddedEventName,
  type StorefrontAddedCartItem
} from '~/app/[locale]/(storefront)/_components/storefront-cart'
import { StorefrontMobileCategoryDrawer } from '~/app/[locale]/(storefront)/_components/storefront-mobile-category-drawer'
import { Link } from '~/i18n/navigation'
import { authClient } from '~/server/better-auth/client'

type StorefrontShellProps = {
  children: React.ReactNode
  currentSlugPath?: string
  searchQuery?: string
}

const dropdownCloseDurationMs = 150
const addedCartToastDurationMs = 3000
const menuCloseDurationMs = 150

export function StorefrontShell({
  children,
  currentSlugPath,
  searchQuery
}: StorefrontShellProps) {
  const t = useTranslations('Storefront')
  const { data: session } = authClient.useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<StorefrontDropdown | null>(
    null
  )
  const [closingDropdown, setClosingDropdown] =
    useState<StorefrontDropdown | null>(null)
  const [addedCartItem, setAddedCartItem] =
    useState<StorefrontAddedCartItem | null>(null)
  const userName = session?.user.name ?? session?.user.email ?? ''
  const renderedDropdown = openDropdown ?? closingDropdown

  useEffect(() => {
    if (!openDropdown) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      const targetElement =
        target instanceof Element ? target : target.parentElement

      if (!targetElement?.closest('[data-storefront-actions-root]')) {
        setClosingDropdown(openDropdown)
        setOpenDropdown(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [openDropdown])

  useEffect(() => {
    if (!closingDropdown) {
      return
    }

    const timeout = window.setTimeout(() => {
      setClosingDropdown(null)
    }, dropdownCloseDurationMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [closingDropdown])

  useEffect(() => {
    if (openDropdown !== 'added') {
      return
    }

    const timeout = window.setTimeout(() => {
      setClosingDropdown('added')
      setOpenDropdown(null)
    }, addedCartToastDurationMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [openDropdown])

  useEffect(() => {
    if (!menuClosing) {
      return
    }

    const timeout = window.setTimeout(() => {
      setMenuClosing(false)
      setMenuOpen(false)
    }, menuCloseDurationMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [menuClosing])

  useEffect(() => {
    function handleCartItemAdded(event: Event) {
      if (!(event instanceof CustomEvent)) {
        return
      }

      setAddedCartItem(event.detail as StorefrontAddedCartItem)
      setClosingDropdown(null)
      setOpenDropdown('added')
    }

    window.addEventListener(
      storefrontCartItemAddedEventName,
      handleCartItemAdded
    )

    return () => {
      window.removeEventListener(
        storefrontCartItemAddedEventName,
        handleCartItemAdded
      )
    }
  }, [])

  function handleDropdownChange(dropdown: StorefrontDropdown | null) {
    if (dropdown) {
      setClosingDropdown(null)
      setOpenDropdown(dropdown)
      return
    }

    if (openDropdown) {
      setClosingDropdown(openDropdown)
    }

    setOpenDropdown(null)
  }

  return (
    <div className="storefront-root storefront-grain min-h-screen overflow-x-clip">
      <header className="border-store-border/70 bg-store-bg/88 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto w-full max-w-[1920px] min-w-0 px-4 py-4 sm:px-5 lg:px-10">
          <div className="grid min-w-0 gap-3 lg:hidden">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Link className="block min-w-0" href="/">
                <p className="font-display text-store-accent truncate text-xs font-semibold tracking-[0.18em] uppercase sm:tracking-[0.24em]">
                  Element Wasser
                </p>
              </Link>
              <TopNavActions
                addedCartItem={addedCartItem}
                closingDropdown={closingDropdown}
                mode="mobile"
                openDropdown={openDropdown}
                renderedDropdown={renderedDropdown}
                sessionUserName={userName}
                setOpenDropdown={handleDropdownChange}
                signedIn={Boolean(session?.user)}
              />
            </div>

            <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2">
              <button
                aria-expanded={menuOpen}
                aria-label={t('openCategories')}
                className={iconButtonClass}
                onClick={() => {
                  setMenuClosing(false)
                  setMenuOpen(true)
                  setOpenDropdown(null)
                }}
                type="button"
              >
                <FaBars aria-hidden="true" className="size-5" />
              </button>
              <ProductSearchBar initialQuery={searchQuery} />
            </div>
          </div>

          <div className="hidden min-w-0 items-center gap-4 lg:flex">
            <div className="w-(--store-sidebar-width) shrink-0">
              <Link className="block text-left" href="/">
                <p className="font-display text-store-accent text-xs font-semibold tracking-[0.24em] uppercase">
                  Element Wasser
                </p>
                <p className="text-store-muted mt-1 text-sm">{t('tagline')}</p>
              </Link>
            </div>

            <div className="min-w-0 flex-1">
              <ProductSearchBar initialQuery={searchQuery} />
            </div>
            <div className="shrink-0">
              <TopNavActions
                addedCartItem={addedCartItem}
                closingDropdown={closingDropdown}
                mode="desktop"
                openDropdown={openDropdown}
                renderedDropdown={renderedDropdown}
                sessionUserName={userName}
                setOpenDropdown={handleDropdownChange}
                signedIn={Boolean(session?.user)}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1920px] min-w-0">
        <aside className="hidden shrink-0 lg:sticky lg:top-24 lg:flex lg:h-[calc(100vh-6rem)] lg:w-(--store-sidebar-width) lg:flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <CategoryNav currentSlugPath={currentSlugPath} variant="sidebar" />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1 px-4 py-8 sm:px-5 lg:px-10 lg:py-12">
            {children}
          </main>
        </div>
      </div>

      {menuOpen ? (
        <StorefrontMobileCategoryDrawer
          currentSlugPath={currentSlugPath}
          isClosing={menuClosing}
          onClose={() => setMenuClosing(true)}
        />
      ) : null}
    </div>
  )
}
