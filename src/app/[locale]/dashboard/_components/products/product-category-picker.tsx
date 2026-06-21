'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { dashInputClass } from '~/app/[locale]/dashboard/_components/dashboard-ui'
import { api } from '~/trpc/react'

type ProductCategoryPickerProps = {
  enabled: boolean
  selectedCategoryIds: string[]
  onChange: (categoryIds: string[]) => void
}

function buildCategoryLabel(
  categories: Array<{ id: string; name: string; parentId: string | null }>,
  categoryId: string
): string {
  const labels: string[] = []
  let current = categories.find((category) => category.id === categoryId)

  while (current) {
    labels.unshift(current.name)
    current = current.parentId
      ? categories.find((category) => category.id === current?.parentId)
      : undefined
  }

  return labels.join(' / ')
}

export function ProductCategoryPicker({
  enabled,
  selectedCategoryIds,
  onChange
}: ProductCategoryPickerProps) {
  const t = useTranslations('Products.form.categories')
  const [search, setSearch] = useState('')
  const categoriesQuery = api.category.listFlat.useQuery(undefined, {
    enabled
  })

  useEffect(() => {
    if (!enabled) {
      setSearch('')
    }
  }, [enabled])

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  )

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return categories
    }

    return categories.filter((category) => {
      const label = buildCategoryLabel(categories, category.id).toLowerCase()
      return (
        label.includes(query) ||
        category.name.toLowerCase().includes(query) ||
        category.slug.toLowerCase().includes(query)
      )
    })
  }, [categories, search])

  function toggleCategory(categoryId: string) {
    onChange(
      selectedCategoryIds.includes(categoryId)
        ? selectedCategoryIds.filter((id) => id !== categoryId)
        : [...selectedCategoryIds, categoryId]
    )
  }

  return (
    <div className="grid gap-2 text-sm">
      <div>
        <span className="text-dash-ink font-medium">{t('label')}</span>
        <p className="text-dash-muted mt-1 text-xs">{t('description')}</p>
      </div>

      {categoriesQuery.isLoading ? (
        <p className="text-dash-muted text-sm">{t('loading')}</p>
      ) : !categoriesQuery.data?.length ? (
        <p className="border-dash-border text-dash-muted rounded-lg border border-dashed px-3 py-4 text-sm">
          {t('empty')}
        </p>
      ) : (
        <div className="border-dash-border overflow-hidden rounded-lg border">
          <div className="border-dash-border border-b bg-[#f6f9fc]/80 p-2">
            <input
              className={dashInputClass}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              type="search"
              value={search}
            />
          </div>
          {!filteredCategories.length ? (
            <p className="text-dash-muted px-3 py-4 text-sm">
              {t('emptySearch')}
            </p>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto p-2">
              {filteredCategories.map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-[#f6f9fc]"
                >
                  <input
                    checked={selectedCategoryIds.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                    type="checkbox"
                  />
                  <span className="text-dash-ink flex-1">
                    {buildCategoryLabel(categories, category.id)}
                  </span>
                  {!category.active ? (
                    <span className="text-dash-muted text-xs">
                      {t('inactive')}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
