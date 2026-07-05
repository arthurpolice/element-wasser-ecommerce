'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaTimes } from 'react-icons/fa'

type StorefrontDrawerDialogProps = {
  children: React.ReactNode
  closeButtonClassName?: string
  closeIconClassName?: string
  closeLabel: string
  contentClassName?: string
  eyebrow?: string
  isClosing?: boolean
  mobileOnly?: boolean
  onClose: () => void
  open: boolean
  panelClassName?: string
  rootClassName?: string
  rootDataStorefrontActions?: boolean
  title: string
  titleTag?: 'h2' | 'h3'
  variant?: 'bottom-sheet' | 'responsive-modal'
  zIndexClassName?: string
}

const defaultCloseButtonClass =
  'text-store-muted hover:text-store-ink focus-visible:ring-store-accent/25 inline-flex size-9 items-center justify-center rounded-full transition hover:bg-white/70 focus-visible:ring-2 focus-visible:outline-none'

export function StorefrontDrawerDialog({
  children,
  closeButtonClassName = defaultCloseButtonClass,
  closeIconClassName = 'size-3.5',
  closeLabel,
  contentClassName = 'mt-5',
  eyebrow,
  isClosing = false,
  mobileOnly = false,
  onClose,
  open,
  panelClassName = '',
  rootClassName = '',
  rootDataStorefrontActions = false,
  title,
  titleTag = 'h2',
  variant = 'bottom-sheet',
  zIndexClassName = 'z-50'
}: StorefrontDrawerDialogProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [mobileViewport, setMobileViewport] = useState(false)

  useEffect(() => {
    setPortalTarget(document.body)

    if (!mobileOnly) {
      return
    }

    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const updateMobileViewport = () => setMobileViewport(mediaQuery.matches)

    updateMobileViewport()
    mediaQuery.addEventListener('change', updateMobileViewport)

    return () => {
      mediaQuery.removeEventListener('change', updateMobileViewport)
    }
  }, [mobileOnly])

  useEffect(() => {
    if (!open || !portalTarget || (mobileOnly && !mobileViewport)) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOnly, mobileViewport, onClose, open, portalTarget])

  if (!open || !portalTarget || (mobileOnly && !mobileViewport)) {
    return null
  }

  const Title = titleTag
  const responsiveModalClasses =
    variant === 'responsive-modal'
      ? 'lg:items-center lg:justify-center lg:p-6'
      : ''
  const panelResponsiveClasses =
    variant === 'responsive-modal'
      ? 'lg:h-auto lg:max-h-[92dvh] lg:max-w-xl lg:animate-[dash-fade-up_0.22s_ease-out_both] lg:rounded-lg lg:p-6'
      : ''

  return createPortal(
    <div
      aria-modal="true"
      className={`fixed inset-0 ${zIndexClassName} flex items-end bg-black/35 p-0 backdrop-blur-sm ${
        isClosing
          ? 'storefront-mobile-drawer-backdrop-exit pointer-events-none'
          : 'storefront-mobile-drawer-backdrop-enter'
      } ${mobileOnly ? 'lg:hidden' : ''} ${responsiveModalClasses} ${rootClassName}`}
      data-storefront-actions-root={
        rootDataStorefrontActions ? true : undefined
      }
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="dialog"
    >
      <div
        className={`bg-store-bg border-store-border h-[86dvh] w-full overflow-y-auto rounded-t-lg border p-5 shadow-2xl ${
          isClosing
            ? 'storefront-mobile-drawer-exit'
            : 'storefront-mobile-drawer-enter'
        } ${panelResponsiveClasses} ${panelClassName}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow ? (
              <p className="font-display text-store-accent text-xs font-semibold tracking-[0.24em] uppercase">
                {eyebrow}
              </p>
            ) : null}
            <Title
              className={`font-display text-store-ink text-lg font-semibold ${
                eyebrow ? 'mt-1' : ''
              }`}
            >
              {title}
            </Title>
          </div>
          <button
            aria-label={closeLabel}
            className={closeButtonClassName}
            onClick={onClose}
            type="button"
          >
            <FaTimes aria-hidden="true" className={closeIconClassName} />
          </button>
        </div>
        <div className={contentClassName}>{children}</div>
      </div>
    </div>,
    portalTarget
  )
}
