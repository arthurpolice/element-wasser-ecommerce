'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { CreateOrderDialog } from '~/app/[locale]/dashboard/_components/orders/create-order-modal'
import {
  OrdersTable,
  type SortField
} from '~/app/[locale]/dashboard/_components/orders/orders-table'
import {
  DashboardButton,
  DashboardPanel,
  DashboardSectionHeader,
  dashInputClass
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import { api } from '~/trpc/react'

export function OrdersTab() {
  const t = useTranslations('Orders')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortField>('placedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchInput])

  const query = api.order.list.useQuery({
    page,
    pageSize: 10,
    search: search || undefined,
    sortBy,
    sortDir
  })
  const utils = api.useUtils()

  const cancelOrder = api.order.cancel.useMutation({
    onSuccess: async () => {
      await utils.order.list.invalidate()
    }
  })
  const fulfillOrder = api.order.fulfill.useMutation({
    onSuccess: async () => {
      await utils.order.list.invalidate()
    }
  })

  function handleSortChange(
    nextSortBy: SortField,
    nextSortDir: 'asc' | 'desc'
  ) {
    setSortBy(nextSortBy)
    setSortDir(nextSortDir)
    setPage(1)
  }

  const items = query.data?.items ?? []
  const totalPages = query.data?.totalPages ?? 1
  const totalCount = query.data?.totalCount ?? 0
  const pendingAction = cancelOrder.isPending
    ? { orderId: cancelOrder.variables.orderId, action: 'cancel' as const }
    : fulfillOrder.isPending
      ? { orderId: fulfillOrder.variables.orderId, action: 'fulfill' as const }
      : undefined
  const actionError =
    cancelOrder.error?.message ?? fulfillOrder.error?.message ?? undefined

  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        action={<CreateOrderDialog />}
        description={t('description')}
        title={t('title')}
      />

      <label className="block max-w-md text-sm">
        <span className="text-dash-muted mb-1.5 block text-xs font-semibold tracking-wider uppercase">
          {t('searchLabel')}
        </span>
        <input
          className={dashInputClass}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t('searchPlaceholder')}
          type="search"
          value={searchInput}
        />
      </label>

      {query.isLoading ? (
        <DashboardPanel variant="loading">{t('loading')}</DashboardPanel>
      ) : query.isError ? (
        <DashboardPanel variant="danger">{t('error')}</DashboardPanel>
      ) : items.length === 0 ? (
        <DashboardPanel variant="dashed">
          {search ? t('emptySearch') : t('empty')}
        </DashboardPanel>
      ) : (
        <>
          <OrdersTable
            actionError={actionError}
            items={items}
            onCancel={(order) => {
              fulfillOrder.reset()
              cancelOrder.mutate({ orderId: order.id })
            }}
            onFulfill={(order) => {
              cancelOrder.reset()
              fulfillOrder.mutate({ orderId: order.id })
            }}
            onSortChange={handleSortChange}
            pendingAction={pendingAction}
            sortBy={sortBy}
            sortDir={sortDir}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-dash-muted text-sm">
              {t('pagination.summary', {
                count: totalCount,
                page,
                totalPages
              })}
            </p>
            <div className="flex gap-2">
              <DashboardButton
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                variant="secondary"
              >
                {t('pagination.previous')}
              </DashboardButton>
              <DashboardButton
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                variant="secondary"
              >
                {t('pagination.next')}
              </DashboardButton>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
