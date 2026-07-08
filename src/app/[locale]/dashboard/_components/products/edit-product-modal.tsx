'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import {
  DashboardButton,
  dashDialogClass,
  dashInputClass
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import { ProductCategoryPicker } from '~/app/[locale]/dashboard/_components/products/product-category-picker'
import { ProductDescriptionEditor } from '~/app/[locale]/dashboard/_components/products/product-description-editor'
import {
  createProductFormSchema,
  mapCreateProductFormToInput,
  type CreateProductFormValues
} from '~/lib/form-schemas'
import { formatCentsToMoney } from '~/lib/form-parsers'
import { api } from '~/trpc/react'

type EditProductDialogProps = {
  productId: string
  productName: string
}

export function EditProductDialog({
  productId,
  productName
}: EditProductDialogProps) {
  const t = useTranslations('Products')
  const tForm = useTranslations('Products.edit')
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const manufacturerListRef = useRef<HTMLDivElement>(null)
  const [manufacturerSearch, setManufacturerSearch] = useState('')
  const [showManufacturerSuggestions, setShowManufacturerSuggestions] =
    useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const utils = api.useUtils()

  const productQuery = api.product.getForEdit.useQuery(
    { id: productId },
    { enabled: open }
  )

  const schema = useMemo(
    () =>
      createProductFormSchema({
        nameRequired: tForm('validation.nameRequired'),
        manufacturerRequired: tForm('validation.manufacturerRequired'),
        priceRequired: tForm('validation.priceRequired'),
        costRequired: tForm('validation.costRequired'),
        shippingWeightRequired: tForm('validation.shippingWeightRequired'),
        stockRequired: tForm('validation.stockRequired'),
        dispatchMinRequired: tForm('validation.dispatchMinRequired'),
        dispatchMaxRequired: tForm('validation.dispatchMaxRequired'),
        dispatchRangeInvalid: tForm('validation.dispatchRangeInvalid')
      }),
    [tForm]
  )

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      manufacturerName: '',
      description: null,
      price: '',
      cost: '',
      shippingWeightGrams: '',
      stockOnHand: '0',
      dispatchMinDays: '',
      dispatchMaxDays: '',
      active: false,
      featured: false
    }
  })

  const manufacturerName = watch('manufacturerName')
  const description = watch('description')

  const manufacturersQuery = api.product.listManufacturers.useQuery(
    {
      search: manufacturerSearch || undefined,
      limit: 10
    },
    {
      enabled: open && manufacturerSearch.length > 0
    }
  )

  const updateProduct = api.product.update.useMutation({
    onSuccess: async () => {
      await utils.product.list.invalidate()
      await utils.product.getForEdit.invalidate({ id: productId })
      await utils.catalog.invalidate()
      setSubmitError(null)
      setOpen(false)
    }
  })

  useEffect(() => {
    if (!productQuery.data) {
      return
    }

    const product = productQuery.data
    reset({
      name: product.name,
      manufacturerName: product.manufacturerName,
      description: product.description,
      price: formatCentsToMoney(product.priceCents),
      cost: formatCentsToMoney(product.costCents),
      shippingWeightGrams:
        product.shippingWeightGrams == null
          ? ''
          : String(product.shippingWeightGrams),
      stockOnHand: String(product.stockOnHand),
      dispatchMinDays: String(product.dispatchMinDays),
      dispatchMaxDays: String(product.dispatchMaxDays),
      active: product.active,
      featured: product.featured
    })
    setManufacturerSearch(product.manufacturerName)
    setSelectedCategoryIds(product.categoryIds)
  }, [productQuery.data, reset])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
      return
    }

    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        manufacturerListRef.current &&
        !manufacturerListRef.current.contains(event.target as Node)
      ) {
        setShowManufacturerSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleClose() {
    if (updateProduct.isPending) {
      return
    }

    setSubmitError(null)
    updateProduct.reset()
    setOpen(false)
  }

  async function handleEditSubmit(data: CreateProductFormValues) {
    const input = mapCreateProductFormToInput(data)
    if (!input) {
      return
    }

    setSubmitError(null)

    try {
      await updateProduct.mutateAsync({
        id: productId,
        ...input,
        categoryIds: selectedCategoryIds
      })
    } catch {
      setSubmitError(tForm('validation.generic'))
    }
  }

  function selectManufacturer(name: string) {
    setValue('manufacturerName', name)
    setManufacturerSearch(name)
    setShowManufacturerSuggestions(false)
  }

  const suggestions = manufacturersQuery.data ?? []
  const isLoadingForm = productQuery.isLoading
  const isBusy = updateProduct.isPending

  return (
    <>
      <DashboardButton onClick={() => setOpen(true)} variant="ghost">
        {t('editButton')}
      </DashboardButton>

      <dialog
        ref={dialogRef}
        className={`${dashDialogClass} max-w-2xl`}
        onCancel={(event) => {
          event.preventDefault()
          handleClose()
        }}
        onClose={handleClose}
      >
        <form
          className="max-h-[calc(100vh-2rem)] overflow-y-auto p-6"
          onSubmit={handleSubmit(handleEditSubmit)}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">
                {tForm('title')}
              </h2>
              <p className="text-dash-muted mt-1 text-sm">
                {tForm('description', { product: productName })}
              </p>
            </div>
            <button
              aria-label={tForm('cancel')}
              className="text-dash-muted hover:text-dash-ink focus-visible:ring-dash-accent/30 rounded-lg px-2 py-1 transition hover:bg-[#f6f9fc] focus-visible:ring-2 focus-visible:outline-none"
              onClick={handleClose}
              type="button"
            >
              ×
            </button>
          </div>

          {isLoadingForm ? (
            <p className="text-dash-muted mt-6 text-sm">{tForm('loading')}</p>
          ) : productQuery.isError ? (
            <p className="text-dash-danger mt-6 text-sm">{tForm('error')}</p>
          ) : (
            <div className="mt-6 grid gap-4">
              {productQuery.data ? (
                <label className="grid gap-1 text-sm">
                  <span>{tForm('fields.sku')}</span>
                  <input
                    className={`${dashInputClass} text-dash-muted bg-[#f6f9fc]`}
                    readOnly
                    type="text"
                    value={productQuery.data.sku}
                  />
                </label>
              ) : null}

              <label className="grid gap-1 text-sm">
                <span>{tForm('fields.name')}</span>
                <input
                  className={dashInputClass}
                  type="text"
                  {...register('name')}
                />
                {errors.name ? (
                  <span className="text-dash-danger text-xs">
                    {errors.name.message}
                  </span>
                ) : null}
              </label>

              <div
                className="relative grid gap-1 text-sm"
                ref={manufacturerListRef}
              >
                <span>{tForm('fields.manufacturer')}</span>
                <input
                  autoComplete="off"
                  className={dashInputClass}
                  onChange={(event) => {
                    const value = event.target.value
                    setManufacturerSearch(value)
                    setValue('manufacturerName', value)
                    setShowManufacturerSuggestions(true)
                  }}
                  onFocus={() => setShowManufacturerSuggestions(true)}
                  placeholder={tForm('fields.manufacturerPlaceholder')}
                  type="text"
                  value={manufacturerName}
                />
                {errors.manufacturerName ? (
                  <span className="text-dash-danger text-xs">
                    {errors.manufacturerName.message}
                  </span>
                ) : null}
                {showManufacturerSuggestions && suggestions.length > 0 ? (
                  <ul className="border-dash-border bg-dash-surface absolute top-full z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border shadow-lg">
                    {suggestions.map((manufacturer) => (
                      <li key={manufacturer.id}>
                        <button
                          className="w-full px-3 py-2 text-left text-sm transition hover:bg-[#f6f9fc]"
                          onClick={() => selectManufacturer(manufacturer.name)}
                          type="button"
                        >
                          {manufacturer.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <ProductDescriptionEditor
                label={tForm('fields.description')}
                onChange={(value) =>
                  setValue('description', value, { shouldDirty: true })
                }
                placeholder={tForm('fields.descriptionPlaceholder')}
                value={description}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>{tForm('fields.price')}</span>
                  <input
                    className={dashInputClass}
                    inputMode="decimal"
                    placeholder="0.00"
                    type="text"
                    {...register('price')}
                  />
                  {errors.price ? (
                    <span className="text-dash-danger text-xs">
                      {errors.price.message}
                    </span>
                  ) : null}
                </label>

                <label className="grid gap-1 text-sm">
                  <span>{tForm('fields.cost')}</span>
                  <input
                    className={dashInputClass}
                    inputMode="decimal"
                    placeholder="0.00"
                    type="text"
                    {...register('cost')}
                  />
                  {errors.cost ? (
                    <span className="text-dash-danger text-xs">
                      {errors.cost.message}
                    </span>
                  ) : null}
                </label>
              </div>

              <label className="grid gap-1 text-sm">
                <span>{tForm('fields.shippingWeightGrams')}</span>
                <input
                  className={dashInputClass}
                  inputMode="numeric"
                  min={1}
                  type="number"
                  {...register('shippingWeightGrams')}
                />
                {errors.shippingWeightGrams ? (
                  <span className="text-dash-danger text-xs">
                    {errors.shippingWeightGrams.message}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm">
                <span>{tForm('fields.stockOnHand')}</span>
                <input
                  className={dashInputClass}
                  inputMode="numeric"
                  min={0}
                  type="number"
                  {...register('stockOnHand')}
                />
                {errors.stockOnHand ? (
                  <span className="text-dash-danger text-xs">
                    {errors.stockOnHand.message}
                  </span>
                ) : null}
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>{tForm('fields.dispatchMinDays')}</span>
                  <input
                    className={dashInputClass}
                    inputMode="numeric"
                    min={0}
                    type="number"
                    {...register('dispatchMinDays')}
                  />
                  {errors.dispatchMinDays ? (
                    <span className="text-dash-danger text-xs">
                      {errors.dispatchMinDays.message}
                    </span>
                  ) : null}
                </label>

                <label className="grid gap-1 text-sm">
                  <span>{tForm('fields.dispatchMaxDays')}</span>
                  <input
                    className={dashInputClass}
                    inputMode="numeric"
                    min={0}
                    type="number"
                    {...register('dispatchMaxDays')}
                  />
                  {errors.dispatchMaxDays ? (
                    <span className="text-dash-danger text-xs">
                      {errors.dispatchMaxDays.message}
                    </span>
                  ) : null}
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  className="border-dash-border text-dash-accent focus:ring-dash-accent/30 rounded"
                  type="checkbox"
                  {...register('active')}
                />
                <span>{tForm('fields.active')}</span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  className="border-dash-border text-dash-accent focus:ring-dash-accent/30 rounded"
                  type="checkbox"
                  {...register('featured')}
                />
                <span>{tForm('fields.featured')}</span>
              </label>

              <ProductCategoryPicker
                enabled={open}
                onChange={setSelectedCategoryIds}
                selectedCategoryIds={selectedCategoryIds}
              />
            </div>
          )}

          {submitError ? (
            <p className="text-dash-danger mt-4 text-sm">{submitError}</p>
          ) : null}

          {updateProduct.error ? (
            <p className="text-dash-danger mt-4 text-sm">
              {updateProduct.error.message ===
              'Dispatch estimate max days must be at least min days.'
                ? tForm('validation.dispatchRangeInvalid')
                : tForm('validation.generic')}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <DashboardButton
              disabled={isBusy}
              onClick={handleClose}
              variant="secondary"
            >
              {tForm('cancel')}
            </DashboardButton>
            <DashboardButton
              disabled={isBusy || isLoadingForm || productQuery.isError}
              type="submit"
            >
              {isBusy ? tForm('submitting') : tForm('submit')}
            </DashboardButton>
          </div>
        </form>
      </dialog>
    </>
  )
}
