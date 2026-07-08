'use client'

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table'
import { useFormatter, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import {
  dashTableClass,
  dashTableHeadClass,
  dashTableRowClass,
  dashTableShellClass
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import { type RouterOutputs } from '~/trpc/react'

type ProductRow = RouterOutputs['product']['list']['items'][number]

type SortField =
  | 'name'
  | 'sku'
  | 'manufacturer'
  | 'active'
  | 'priceCents'
  | 'costCents'
  | 'shippingWeightGrams'
  | 'discountPercent'
  | 'stockOnHand'
  | 'stockReserved'
  | 'dispatchMinDays'
  | 'categoryCount'
  | 'createdAt'

type ProductsTableProps = {
  items: ProductRow[]
  sortBy: SortField
  sortDir: 'asc' | 'desc'
  onSortChange: (sortBy: SortField, sortDir: 'asc' | 'desc') => void
  renderActions?: (product: ProductRow) => React.ReactNode
}

export function ProductsTable({
  items,
  sortBy,
  sortDir,
  onSortChange,
  renderActions
}: ProductsTableProps) {
  const t = useTranslations('Products.table')
  const tStatus = useTranslations('ProductStatus')
  const format = useFormatter()

  const sorting = useMemo<SortingState>(
    () => [{ id: sortBy, desc: sortDir === 'desc' }],
    [sortBy, sortDir]
  )

  const columns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: t('columns.name'),
        cell: ({ row }) => (
          <p className="text-dash-ink font-medium">{row.original.name}</p>
        )
      },
      {
        id: 'sku',
        accessorKey: 'sku',
        header: t('columns.sku')
      },
      {
        id: 'manufacturer',
        accessorKey: 'manufacturerName',
        header: t('columns.manufacturer')
      },
      {
        id: 'active',
        accessorKey: 'active',
        header: t('columns.active'),
        cell: ({ row }) =>
          row.original.active ? tStatus('active') : tStatus('inactive')
      },
      {
        id: 'priceCents',
        accessorKey: 'priceCents',
        header: t('columns.price'),
        cell: ({ row }) =>
          format.number(row.original.priceCents / 100, {
            style: 'currency',
            currency: 'CHF'
          })
      },
      {
        id: 'costCents',
        accessorKey: 'costCents',
        header: t('columns.cost'),
        cell: ({ row }) =>
          format.number(row.original.costCents / 100, {
            style: 'currency',
            currency: 'CHF'
          })
      },
      {
        id: 'shippingWeightGrams',
        accessorKey: 'shippingWeightGrams',
        header: t('columns.shippingWeight'),
        cell: ({ row }) =>
          row.original.shippingWeightGrams == null
            ? t('noWeight')
            : t('weightGrams', { grams: row.original.shippingWeightGrams })
      },
      {
        id: 'discountPercent',
        accessorKey: 'discountPercent',
        header: t('columns.discount'),
        cell: ({ row }) =>
          row.original.discountPercent != null
            ? t('discountValue', { percent: row.original.discountPercent })
            : t('noDiscount')
      },
      {
        id: 'stockOnHand',
        accessorKey: 'stockOnHand',
        header: t('columns.stockOnHand')
      },
      {
        id: 'stockReserved',
        accessorKey: 'stockReserved',
        header: t('columns.stockReserved')
      },
      {
        id: 'dispatchMinDays',
        accessorKey: 'dispatchMinDays',
        header: t('columns.dispatchEstimate'),
        cell: ({ row }) =>
          t('dispatchRange', {
            min: row.original.dispatchMinDays,
            max: row.original.dispatchMaxDays
          })
      },
      {
        id: 'categoryCount',
        accessorKey: 'categoryCount',
        header: t('columns.categoryCount')
      },
      ...(renderActions
        ? [
            {
              id: 'actions',
              header: t('columns.actions'),
              cell: ({ row }: { row: { original: ProductRow } }) =>
                renderActions(row.original)
            } satisfies ColumnDef<ProductRow>
          ]
        : [])
    ],
    [format, renderActions, t, tStatus]
  )

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      const nextSorting =
        typeof updater === 'function' ? updater(sorting) : updater
      const next = nextSorting[0]

      if (!next) {
        return
      }

      onSortChange(next.id as SortField, next.desc ? 'desc' : 'asc')
    }
  })

  return (
    <div className={dashTableShellClass}>
      <table className={dashTableClass}>
        <thead className={dashTableHeadClass}>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort()

                return (
                  <th key={header.id} className="px-4 py-3 text-left">
                    {canSort ? (
                      <button
                        className="hover:text-dash-ink focus-visible:ring-dash-accent/30 inline-flex items-center gap-1 transition focus-visible:ring-2 focus-visible:outline-none"
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getIsSorted() === 'asc'
                          ? ' ↑'
                          : header.column.getIsSorted() === 'desc'
                            ? ' ↓'
                            : null}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-dash-border bg-dash-surface divide-y">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={dashTableRowClass}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="text-dash-ink/80 px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export type { SortField }
