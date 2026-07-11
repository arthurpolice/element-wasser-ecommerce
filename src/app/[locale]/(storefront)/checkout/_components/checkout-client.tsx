'use client'

import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FaCheck,
  FaCreditCard,
  FaExclamationCircle,
  FaMinus,
  FaMobileAlt,
  FaPlus,
  FaRegTrashAlt,
  FaShoppingBag,
  FaSpinner
} from 'react-icons/fa'
import { authClient } from '~/server/better-auth/client'

import {
  useStorefrontCart,
  type StorefrontCartItem
} from '~/app/[locale]/(storefront)/_components/storefront-cart'
import { Link } from '~/i18n/navigation'
import {
  createEmptyGuestCheckoutAddress,
  getGuestCheckoutProgression,
  isGuestCheckoutAddressComplete,
  normalizeCheckoutCountryCode,
  type CheckoutPaymentMethod,
  type GuestCheckoutAddress
} from '~/lib/checkout-guest'
import { formatPriceCents } from '~/lib/format-catalog'
import { api, type RouterOutputs } from '~/trpc/react'

type CheckoutPreview = RouterOutputs['checkout']['preview']
type CheckoutPreviewItem = CheckoutPreview['items'][number]
type CheckoutBootstrap = RouterOutputs['checkout']['bootstrap']
type RegisteredCheckoutCustomer = Extract<
  CheckoutBootstrap,
  { status: 'registered' }
>['customer']
type RegisteredCheckoutAddress = RegisteredCheckoutCustomer['addresses'][number]
type CheckoutPreviewLine = {
  productId: string
  quantity: number
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => window.clearTimeout(timeoutId)
  }, [delayMs, value])

  return debouncedValue
}

function arePreviewLinesEqual(
  left: CheckoutPreviewLine[],
  right: CheckoutPreviewLine[]
) {
  if (left.length !== right.length) {
    return false
  }

  return left.every(
    (line, index) =>
      line.productId === right[index]?.productId &&
      line.quantity === right[index]?.quantity
  )
}

export function CheckoutClient() {
  const { data, isPending } = authClient.useSession()
  const sessionExists = data?.session
  const t = useTranslations('Storefront.checkout')
  const locale = useLocale()
  const utils = api.useUtils()
  const items = useStorefrontCart((state) => state.items)
  const clearCart = useStorefrontCart((state) => state.clear)
  const [address, setAddress] = useState<GuestCheckoutAddress>(() =>
    createEmptyGuestCheckoutAddress()
  )
  const [newAddress, setNewAddress] = useState<GuestCheckoutAddress>(() =>
    createEmptyGuestCheckoutAddress()
  )
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  )
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)
  const [paymentMethod, setPaymentMethod] =
    useState<CheckoutPaymentMethod | null>(null)
  const checkoutSubmissionId = useRef<string | null>(null)
  const bootstrapQuery = api.checkout.bootstrap.useQuery()
  const createAddress = api.checkout.createAddress.useMutation({
    onSuccess: async (createdAddress) => {
      setSelectedAddressId(createdAddress.id)
      setShowNewAddressForm(false)
      setNewAddress(createEmptyGuestCheckoutAddress())
      await utils.checkout.bootstrap.invalidate()
    }
  })
  const previewLines = useMemo(
    () =>
      items.map((item) => ({
        productId: item.productId,
        quantity: item.amount
      })),
    [items]
  )
  const debouncedPreviewLines = useDebouncedValue(previewLines, 250)
  const previewInputSettled = arePreviewLinesEqual(
    previewLines,
    debouncedPreviewLines
  )
  const previewQuery = api.checkout.preview.useQuery(
    {
      lines: debouncedPreviewLines
    },
    {
      enabled: debouncedPreviewLines.length > 0,
      placeholderData: (previousData) => previousData
    }
  )
  const placeOrder = api.checkout.placeOrder.useMutation({
    onSuccess: (result) => {
      clearCart()
      window.location.assign(result.checkoutUrl)
    }
  })
  const placeGuestOrder = api.checkout.placeGuestOrder.useMutation({
    onSuccess: (result) => {
      clearCart()
      window.location.assign(result.checkoutUrl)
    }
  })
  const previewUpdating =
    previewQuery.data !== undefined &&
    (!previewInputSettled || previewQuery.isFetching)
  const bootstrap = bootstrapQuery.data
  const registeredCustomer =
    bootstrap?.status === 'registered' ? bootstrap.customer : null
  const selectedAddress = registeredCustomer?.addresses.find(
    (entry) => entry.id === selectedAddressId
  )
  const guestProgression = useMemo(
    () =>
      getGuestCheckoutProgression({
        address,
        paymentMethod,
        cartCanPlaceOrder: previewQuery.data?.canPlaceOrder ?? false
      }),
    [address, paymentMethod, previewQuery.data?.canPlaceOrder]
  )
  const progression = useMemo(() => {
    const addressComplete =
      bootstrap?.status === 'registered'
        ? selectedAddressId !== null
        : bootstrap?.status === 'needs-onboarding'
          ? false
          : guestProgression.addressComplete
    const paymentUnlocked = addressComplete
    const paymentComplete = paymentUnlocked && paymentMethod !== null
    const overviewUnlocked = paymentComplete

    return {
      addressComplete,
      paymentUnlocked,
      paymentComplete,
      overviewUnlocked,
      canUseFinalAction:
        overviewUnlocked &&
        previewInputSettled &&
        !previewQuery.isFetching &&
        (previewQuery.data?.canPlaceOrder ?? false)
    }
  }, [
    bootstrap?.status,
    guestProgression.addressComplete,
    paymentMethod,
    previewQuery.data?.canPlaceOrder,
    previewQuery.isFetching,
    previewInputSettled,
    selectedAddressId
  ])

  useEffect(() => {
    if (
      registeredCustomer &&
      !selectedAddressId &&
      registeredCustomer.addresses.length > 0
    ) {
      setSelectedAddressId(
        registeredCustomer.addresses.find((entry) => entry.isMain)?.id ??
          registeredCustomer.addresses[0]?.id ??
          null
      )
    }
  }, [registeredCustomer, selectedAddressId])

  useEffect(() => {
    if (!progression.paymentUnlocked && paymentMethod) {
      setPaymentMethod(null)
    }
  }, [paymentMethod, progression.paymentUnlocked])

  useEffect(() => {
    checkoutSubmissionId.current = null
  }, [address, items, newAddress, paymentMethod, selectedAddressId])

  function currentCheckoutSubmissionId() {
    checkoutSubmissionId.current ??= crypto.randomUUID()
    return checkoutSubmissionId.current
  }

  function updateAddressField(
    field: keyof GuestCheckoutAddress,
    value: string
  ) {
    setAddress((current) => ({
      ...current,
      [field]:
        field === 'countryCode' ? normalizeCheckoutCountryCode(value) : value
    }))
  }

  function updateNewAddressField(
    field: keyof GuestCheckoutAddress,
    value: string
  ) {
    setNewAddress((current) => ({
      ...current,
      [field]:
        field === 'countryCode' ? normalizeCheckoutCountryCode(value) : value
    }))
  }

  function handleCreateAddress() {
    createAddress.mutate({
      salutation:
        newAddress.salutation === 'HERR' || newAddress.salutation === 'FRAU'
          ? newAddress.salutation
          : undefined,
      firstName: newAddress.firstName,
      lastName: newAddress.lastName,
      company: newAddress.company || undefined,
      streetLine1: newAddress.streetLine1,
      postalCode: newAddress.postalCode,
      city: newAddress.city,
      countryCode: newAddress.countryCode
    })
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:px-10 lg:py-16">
      <div className="border-store-border/80 border-b pb-8">
        <p className="text-store-accent text-xs font-semibold tracking-[0.22em] uppercase">
          {t('eyebrow')}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)] lg:items-end">
          <div>
            <h1 className="font-display text-store-ink text-3xl font-semibold tracking-normal sm:text-5xl">
              {t('title')}
            </h1>
            <p className="text-store-muted mt-3 max-w-2xl text-sm leading-6 sm:text-base">
              {t('description')}
            </p>
          </div>
          {!isPending && !sessionExists && (
            <Link
              className="text-store-muted decoration-store-border hover:text-store-accent hover:decoration-store-accent text-sm font-semibold underline underline-offset-4 transition lg:text-right"
              href="/sign-in"
            >
              {t('signInHint')}
            </Link>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyCheckoutState />
      ) : bootstrapQuery.isLoading ? (
        <p className="text-store-muted border-store-border py-12 text-sm">
          {t('loadingCheckout')}
        </p>
      ) : bootstrapQuery.isError ? (
        <p className="border-store-border py-12 text-sm text-red-700">
          {t('error')}
        </p>
      ) : (
        <div className="py-8 lg:py-12">
          <div className="mx-auto max-w-6xl">
            <CheckoutSection
              stepIndex={1}
              title={t('addressTitle')}
            >
              {bootstrap?.status === 'needs-onboarding' ? (
                <CheckoutOnboardingPrompt />
              ) : registeredCustomer ? (
                <RegisteredAddressStep
                  createAddressPending={createAddress.isPending}
                  customer={registeredCustomer}
                  newAddress={newAddress}
                  onFieldChange={updateNewAddressField}
                  onCreateAddress={handleCreateAddress}
                  selectedAddress={selectedAddress ?? null}
                  selectedAddressId={selectedAddressId}
                  setSelectedAddressId={setSelectedAddressId}
                  setShowNewAddressForm={setShowNewAddressForm}
                  showNewAddressForm={showNewAddressForm}
                />
              ) : (
                <AddressForm
                  address={address}
                  onFieldChange={updateAddressField}
                  ready={progression.addressComplete}
                />
              )}
            </CheckoutSection>

            <CheckoutSection
              stepIndex={2}
              title={t('paymentTitle')}
            >
              <PaymentMethodPicker
                disabled={!progression.paymentUnlocked}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
              />
            </CheckoutSection>

            <CheckoutSection stepIndex={3} title={t('overviewTitle')}>
              {previewQuery.isLoading ? (
                <p className="text-store-muted border-store-border border-y py-8 text-sm">
                  {t('loading')}
                </p>
              ) : previewQuery.isError ? (
                <p className="border-store-border border-y py-8 text-sm text-red-700">
                  {t('error')}
                </p>
              ) : previewQuery.data ? (
                <OrderOverview
                  canUseFinalAction={progression.canUseFinalAction}
                  cartItems={items}
                  locale={locale}
                  onPlaceOrder={() => {
                    if (!paymentMethod) {
                      return
                    }

                    const lines = items.map((item) => ({
                      productId: item.productId,
                      quantity: item.amount
                    }))
                    const checkoutLocale = locale === 'en' ? 'en' : 'de'

                    if (registeredCustomer && selectedAddress) {
                      placeOrder.mutate({
                        checkoutSubmissionId: currentCheckoutSubmissionId(),
                        lines,
                        paymentMethod,
                        locale: checkoutLocale,
                        addressId: selectedAddress.id,
                        salutation: selectedAddress.salutation ?? undefined,
                        firstName: selectedAddress.firstName,
                        lastName: selectedAddress.lastName,
                        company: selectedAddress.company ?? undefined,
                        streetLine1: selectedAddress.streetLine1,
                        postalCode: selectedAddress.postalCode,
                        city: selectedAddress.city,
                        countryCode: selectedAddress.countryCode,
                        phone: registeredCustomer.phone ?? undefined
                      })
                      return
                    }

                    if (bootstrap?.status === 'guest') {
                      placeGuestOrder.mutate({
                        checkoutSubmissionId: currentCheckoutSubmissionId(),
                        lines,
                        paymentMethod,
                        locale: checkoutLocale,
                        email: address.email,
                        salutation:
                          address.salutation === 'HERR' ||
                          address.salutation === 'FRAU'
                            ? address.salutation
                            : undefined,
                        firstName: address.firstName,
                        lastName: address.lastName,
                        company: address.company || undefined,
                        streetLine1: address.streetLine1,
                        postalCode: address.postalCode,
                        city: address.city,
                        countryCode: address.countryCode,
                        phone: address.phone || undefined
                      })
                    }
                  }}
                  placeOrderError={
                    placeOrder.isError || placeGuestOrder.isError
                      ? t('placeOrderError')
                      : null
                  }
                  placingOrder={
                    placeOrder.isPending || placeGuestOrder.isPending
                  }
                  preview={previewQuery.data}
                  updating={previewUpdating}
                />
              ) : null}
            </CheckoutSection>
          </div>
        </div>
      )}
    </main>
  )
}

function EmptyCheckoutState() {
  const t = useTranslations('Storefront.checkout')

  return (
    <section className="grid min-h-96 place-items-center py-12 text-center">
      <div className="max-w-md">
        <div className="border-store-border text-store-accent mx-auto flex size-16 items-center justify-center rounded-full border">
          <FaShoppingBag aria-hidden="true" className="size-6" />
        </div>
        <h2 className="font-display text-store-ink mt-6 text-2xl font-semibold">
          {t('emptyTitle')}
        </h2>
        <p className="text-store-muted mt-3 text-sm leading-6">
          {t('emptyDescription')}
        </p>
        <Link
          className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink focus-visible:ring-store-accent/25 mt-7 inline-flex h-11 items-center justify-center border px-5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
          href="/"
        >
          {t('continueShopping')}
        </Link>
      </div>
    </section>
  )
}

function CheckoutSection({
  children,
  stepIndex,
  title
}: {
  children: React.ReactNode
  stepIndex: number
  title: string
}) {
  return (
    <section
      aria-labelledby={`checkout-section-${stepIndex}-heading`}
      className="border-store-border border-b py-6 lg:grid lg:grid-cols-[7rem_minmax(0,1fr)_8rem] lg:gap-8 lg:py-8"
    >
      <div className="mb-5 flex items-center justify-between gap-4 lg:mb-0 lg:block">
        <p className="text-store-muted text-xs font-semibold tracking-[0.18em] uppercase">
          {String(stepIndex).padStart(2, '0')}
        </p>
        <h2
          className="font-display text-store-ink text-xl font-semibold lg:mt-3"
          id={`checkout-section-${stepIndex}-heading`}
        >
          {title}
        </h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function StepInlineStatus({ complete }: { complete: boolean }) {
  const t = useTranslations('Storefront.checkout')

  if (!complete) {
    return null
  }

  return (
    <span className="text-store-accent inline-flex items-center gap-2 text-xs font-semibold">
      <FaCheck aria-hidden="true" className="size-3" />
      {t('stepStates.complete')}
    </span>
  )
}

function CheckoutOnboardingPrompt() {
  const t = useTranslations('Storefront.checkout')

  return (
    <div className="border-store-border bg-store-surface/55 border p-5">
      <p className="text-store-ink text-sm font-semibold">
        {t('onboarding.title')}
      </p>
      <p className="text-store-muted mt-2 text-sm leading-6">
        {t('onboarding.description')}
      </p>
      <Link
        className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink focus-visible:ring-store-accent/25 mt-5 inline-flex h-11 items-center justify-center border px-5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
        href="/customer-area/personal-information?returnTo=/checkout"
      >
        {t('onboarding.action')}
      </Link>
    </div>
  )
}

function RegisteredAddressStep({
  createAddressPending,
  customer,
  newAddress,
  onCreateAddress,
  onFieldChange,
  selectedAddress,
  selectedAddressId,
  setSelectedAddressId,
  setShowNewAddressForm,
  showNewAddressForm
}: {
  createAddressPending: boolean
  customer: RegisteredCheckoutCustomer
  newAddress: GuestCheckoutAddress
  onCreateAddress: () => void
  onFieldChange: (field: keyof GuestCheckoutAddress, value: string) => void
  selectedAddress: RegisteredCheckoutAddress | null
  selectedAddressId: string | null
  setSelectedAddressId: (id: string) => void
  setShowNewAddressForm: (show: boolean) => void
  showNewAddressForm: boolean
}) {
  const t = useTranslations('Storefront.checkout')
  const newAddressReady = isRegisteredCheckoutAddressReady(newAddress)

  return (
    <div className="grid gap-6">
      <div className="text-store-muted border-store-border border-b py-4 text-sm leading-6">
        <p className="text-store-ink font-semibold">
          {customer.firstName} {customer.lastName}
        </p>
        <p>{customer.email}</p>
      </div>

      <div className="grid gap-3">
        {customer.addresses.map((address) => (
          <label
            className={`border-store-border bg-store-surface focus-within:ring-store-accent/25 flex cursor-pointer gap-4 border p-4 transition focus-within:ring-2 ${
              selectedAddressId === address.id
                ? 'border-store-accent'
                : 'hover:border-store-accent/45'
            }`}
            key={address.id}
          >
            <input
              checked={selectedAddressId === address.id}
              className="accent-store-accent mt-1 size-4"
              name="checkout-address-book-entry"
              onChange={() => setSelectedAddressId(address.id)}
              type="radio"
              value={address.id}
            />
            <span className="min-w-0 text-sm leading-6">
              <span className="text-store-ink block font-semibold">
                {address.firstName} {address.lastName}
                {address.isMain ? (
                  <span className="text-store-accent ml-2 text-xs font-semibold">
                    {t('addressBook.main')}
                  </span>
                ) : null}
              </span>
              <span className="text-store-muted block wrap-break-word">
                {formatAddressBookEntry(address)}
              </span>
            </span>
          </label>
        ))}
      </div>

      {selectedAddress ? (
        <p className="sr-only">{formatAddressBookEntry(selectedAddress)}</p>
      ) : null}

      {customer.addresses.length > 0 && (
        <button
          className="text-store-muted hover:text-store-ink focus-visible:ring-store-accent/25 justify-self-start text-sm font-semibold underline underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => setShowNewAddressForm(!showNewAddressForm)}
          type="button"
        >
          {showNewAddressForm
            ? t('addressBook.cancelNew')
            : t('addressBook.addNew')}
        </button>
      )}

      {showNewAddressForm || customer.addresses.length === 0 ? (
        <AddressBookEntryForm
          address={newAddress}
          disabled={createAddressPending}
          onCreateAddress={onCreateAddress}
          onFieldChange={onFieldChange}
          ready={newAddressReady}
        />
      ) : null}
    </div>
  )
}

function AddressBookEntryForm({
  address,
  disabled,
  onCreateAddress,
  onFieldChange,
  ready
}: {
  address: GuestCheckoutAddress
  disabled: boolean
  onCreateAddress: () => void
  onFieldChange: (field: keyof GuestCheckoutAddress, value: string) => void
  ready: boolean
}) {
  const t = useTranslations('Storefront.checkout')

  return (
    <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
      <SelectField
        label={t('fields.salutation')}
        onChange={(value) => onFieldChange('salutation', value)}
        value={address.salutation}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <Field
          autoComplete="given-name"
          label={t('fields.firstName')}
          onChange={(value) => onFieldChange('firstName', value)}
          required
          value={address.firstName}
        />
        <Field
          autoComplete="family-name"
          label={t('fields.lastName')}
          onChange={(value) => onFieldChange('lastName', value)}
          required
          value={address.lastName}
        />
      </div>
      <Field
        autoComplete="organization"
        label={t('fields.company')}
        onChange={(value) => onFieldChange('company', value)}
        value={address.company}
      />
      <Field
        autoComplete="address-line1"
        label={t('fields.streetLine1')}
        onChange={(value) => onFieldChange('streetLine1', value)}
        required
        value={address.streetLine1}
      />
      <div className="grid grid-cols-[0.58fr_1fr] gap-3 sm:gap-5">
        <Field
          autoComplete="postal-code"
          label={t('fields.postalCode')}
          onChange={(value) => onFieldChange('postalCode', value)}
          required
          value={address.postalCode}
        />
        <Field
          autoComplete="address-level2"
          label={t('fields.city')}
          onChange={(value) => onFieldChange('city', value)}
          required
          value={address.city}
        />
      </div>
      <Field
        autoComplete="country"
        inputMode="text"
        label={t('fields.countryCode')}
        maxLength={2}
        onChange={(value) => onFieldChange('countryCode', value)}
        required
        value={address.countryCode}
      />
      <button
        className="border-store-accent/45 text-store-accent hover:border-store-ink hover:text-store-ink disabled:border-store-border disabled:text-store-muted/45 focus-visible:ring-store-accent/25 justify-self-start border px-5 py-2.5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
        disabled={disabled || !ready}
        onClick={onCreateAddress}
        type="button"
      >
        {disabled ? t('addressBook.saving') : t('addressBook.save')}
      </button>
    </form>
  )
}

function formatAddressBookEntry(address: RegisteredCheckoutAddress) {
  return [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    address.company,
    address.streetLine1,
    `${address.postalCode} ${address.city}`.trim(),
    address.countryCode
  ]
    .filter(Boolean)
    .join(', ')
}

function isRegisteredCheckoutAddressReady(address: GuestCheckoutAddress) {
  return isGuestCheckoutAddressComplete({
    ...address,
    email: 'registered@example.test'
  })
}

function AddressForm({
  address,
  onFieldChange,
  ready
}: {
  address: GuestCheckoutAddress
  onFieldChange: (field: keyof GuestCheckoutAddress, value: string) => void
  ready: boolean
}) {
  const t = useTranslations('Storefront.checkout')

  return (
    <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
      <Field
        autoComplete="email"
        label={t('fields.email')}
        onChange={(value) => onFieldChange('email', value)}
        required
        type="email"
        value={address.email}
      />

      <SelectField
        label={t('fields.salutation')}
        onChange={(value) => onFieldChange('salutation', value)}
        value={address.salutation}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <Field
          autoComplete="given-name"
          label={t('fields.firstName')}
          onChange={(value) => onFieldChange('firstName', value)}
          required
          value={address.firstName}
        />
        <Field
          autoComplete="family-name"
          label={t('fields.lastName')}
          onChange={(value) => onFieldChange('lastName', value)}
          required
          value={address.lastName}
        />
      </div>

      <Field
        autoComplete="organization"
        label={t('fields.company')}
        onChange={(value) => onFieldChange('company', value)}
        value={address.company}
      />
      <Field
        autoComplete="address-line1"
        label={t('fields.streetLine1')}
        onChange={(value) => onFieldChange('streetLine1', value)}
        required
        value={address.streetLine1}
      />
      <div className="grid grid-cols-[0.58fr_1fr] gap-3 sm:gap-5">
        <Field
          autoComplete="postal-code"
          label={t('fields.postalCode')}
          onChange={(value) => onFieldChange('postalCode', value)}
          required
          value={address.postalCode}
        />
        <Field
          autoComplete="address-level2"
          label={t('fields.city')}
          onChange={(value) => onFieldChange('city', value)}
          required
          value={address.city}
        />
      </div>
      <Field
        autoComplete="country"
        inputMode="text"
        label={t('fields.countryCode')}
        maxLength={2}
        onChange={(value) => onFieldChange('countryCode', value)}
        required
        value={address.countryCode}
      />
      <Field
        autoComplete="tel"
        label={t('fields.phone')}
        onChange={(value) => onFieldChange('phone', value)}
        type="tel"
        value={address.phone}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <p className="text-store-muted text-xs leading-5">
          {t('requiredHint')}
        </p>
        <StepInlineStatus complete={ready} />
      </div>
    </form>
  )
}

function Field({
  autoComplete,
  inputMode,
  label,
  maxLength,
  onChange,
  required = false,
  type = 'text',
  value
}: {
  autoComplete?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  label: string
  maxLength?: number
  onChange: (value: string) => void
  required?: boolean
  type?: string
  value: string
}) {
  return (
    <label className="text-store-ink grid gap-2 text-sm font-semibold">
      <span>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <input
        autoComplete={autoComplete}
        aria-required={required}
        className="border-store-border bg-store-surface text-store-ink focus:border-store-accent focus-visible:ring-store-accent/25 disabled:bg-store-border/35 disabled:text-store-muted h-11 border px-3 text-sm font-normal transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  )
}

function SelectField({
  label,
  onChange,
  value
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  const t = useTranslations('Storefront.checkout')

  return (
    <label className="text-store-ink grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      <select
        className="border-store-border bg-store-surface text-store-ink focus:border-store-accent focus-visible:ring-store-accent/25 disabled:bg-store-border/35 disabled:text-store-muted h-11 border px-3 text-sm font-normal transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{t('salutations.none')}</option>
        <option value="HERR">{t('salutations.HERR')}</option>
        <option value="FRAU">{t('salutations.FRAU')}</option>
      </select>
    </label>
  )
}

function PaymentMethodPicker({
  disabled,
  paymentMethod,
  setPaymentMethod
}: {
  disabled: boolean
  paymentMethod: CheckoutPaymentMethod | null
  setPaymentMethod: (method: CheckoutPaymentMethod) => void
}) {
  const t = useTranslations('Storefront.checkout')

  return (
    <fieldset className="grid gap-4" disabled={disabled}>
      <legend className="sr-only">{t('paymentTitle')}</legend>
      {disabled ? (
        <p className="border-store-border bg-store-surface/55 text-store-muted border p-4 text-sm">
          {t('paymentLocked')}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <PaymentOption
          checked={paymentMethod === 'CARD'}
          description={t('payment.cardDescription')}
          icon={<FaCreditCard aria-hidden="true" className="size-4" />}
          label={t('payment.card')}
          onChange={() => setPaymentMethod('CARD')}
          value="CARD"
        />
        <PaymentOption
          checked={paymentMethod === 'TWINT'}
          description={t('payment.twintDescription')}
          icon={<FaMobileAlt aria-hidden="true" className="size-4" />}
          label={t('payment.twint')}
          onChange={() => setPaymentMethod('TWINT')}
          value="TWINT"
        />
      </div>
    </fieldset>
  )
}

function PaymentOption({
  checked,
  description,
  icon,
  label,
  onChange,
  value
}: {
  checked: boolean
  description: string
  icon: React.ReactNode
  label: string
  onChange: () => void
  value: CheckoutPaymentMethod
}) {
  return (
    <label
      className={`border-store-border bg-store-surface focus-within:ring-store-accent/25 flex min-h-28 cursor-pointer gap-4 border p-4 transition focus-within:ring-2 has-disabled:cursor-not-allowed has-disabled:opacity-60 ${
        checked
          ? 'border-store-accent text-store-ink shadow-[inset_0_0_0_1px_var(--color-store-accent)]'
          : 'text-store-muted hover:border-store-accent/45'
      }`}
    >
      <input
        checked={checked}
        className="accent-store-accent mt-1 size-4"
        name="checkout-payment-method"
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span className="grid min-w-0 gap-2">
        <span className="text-store-ink flex min-w-0 items-center gap-2 font-semibold">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        <span className="text-sm leading-5">{description}</span>
      </span>
    </label>
  )
}

function OrderOverview({
  canUseFinalAction,
  cartItems,
  locale,
  onPlaceOrder,
  placeOrderError,
  placingOrder,
  preview,
  updating
}: {
  canUseFinalAction: boolean
  cartItems: StorefrontCartItem[]
  locale: string
  onPlaceOrder: () => void
  placeOrderError: string | null
  placingOrder: boolean
  preview: CheckoutPreview
  updating: boolean
}) {
  return (
    <div className="grid gap-7">
      <CheckoutItems
        cartItems={cartItems}
        locale={locale}
        preview={preview}
        updating={updating}
      />
      <CheckoutTotals
        canUseFinalAction={canUseFinalAction}
        locale={locale}
        onPlaceOrder={onPlaceOrder}
        placeOrderError={placeOrderError}
        placingOrder={placingOrder}
        preview={preview}
        updating={updating}
      />
    </div>
  )
}

function CheckoutItems({
  cartItems,
  locale,
  preview,
  updating
}: {
  cartItems: StorefrontCartItem[]
  locale: string
  preview: CheckoutPreview
  updating: boolean
}) {
  const t = useTranslations('Storefront.checkout')
  const previewItemsById = new Map(
    preview.items.map((item) => [item.productId, item])
  )

  return (
    <div className="divide-store-border divide-y">
      {cartItems.map((cartItem) => {
        const previewItem = previewItemsById.get(cartItem.productId)

        return (
          <CheckoutItemRow
            cartItem={cartItem}
            key={cartItem.productId}
            locale={locale}
            previewItem={previewItem}
            updating={updating}
          />
        )
      })}
      {!preview.canPlaceOrder ? (
        <p className="flex items-start gap-2 py-5 text-sm font-medium text-red-700">
          <FaExclamationCircle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {preview.problemCode === 'OVER_WEIGHT_LIMIT'
            ? t('problems.OVER_WEIGHT_LIMIT')
            : t('unavailable')}
        </p>
      ) : null}
    </div>
  )
}

function CheckoutItemRow({
  cartItem,
  locale,
  previewItem,
  updating
}: {
  cartItem: StorefrontCartItem
  locale: string
  previewItem: CheckoutPreviewItem | undefined
  updating: boolean
}) {
  const t = useTranslations('Storefront.checkout')
  const removeItem = useStorefrontCart((state) => state.removeItem)
  const updateAmount = useStorefrontCart((state) => state.updateAmount)
  const productName = previewItem?.name ?? cartItem.name
  const productSlug = previewItem?.slug ?? cartItem.slug
  const imageUrl = previewItem?.imageUrl ?? cartItem.imageUrl
  const imageAlt = previewItem?.imageAlt ?? cartItem.imageAlt
  const maxQuantity = previewItem ? Math.max(1, previewItem.availableStock) : 99
  const problemMessage =
    previewItem?.problemCode === 'INSUFFICIENT_STOCK'
      ? t('problems.INSUFFICIENT_STOCK', {
          availableStock: previewItem.availableStock
        })
      : previewItem?.problemCode
        ? t(`problems.${previewItem.problemCode}`)
        : null

  return (
    <div className="grid gap-y-5 py-6 sm:grid-cols-[6rem_minmax(0,1fr)_9rem] sm:items-start sm:gap-x-6">
      <div className="border-store-border bg-store-surface relative size-24 overflow-hidden border">
        {imageUrl ? (
          <Image
            alt={imageAlt ?? productName}
            className="object-cover"
            fill
            sizes="96px"
            src={imageUrl}
          />
        ) : (
          <FaShoppingBag
            aria-hidden="true"
            className="text-store-accent absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2"
          />
        )}
      </div>

      <div className="min-w-0">
        <Link
          className="text-store-ink decoration-store-border hover:text-store-accent hover:decoration-store-accent focus-visible:ring-store-accent/25 text-base font-semibold wrap-break-word underline underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
          href={`/products/${productSlug}`}
        >
          {productName}
        </Link>
        {previewItem ? (
          <p className="text-store-muted mt-2 flex items-center gap-2 text-sm">
            <span>{formatPriceCents(previewItem.unitPriceCents, locale)}</span>
            {updating ? <UpdatingSpinner /> : null}
          </p>
        ) : null}
        {problemMessage ? (
          <p className="mt-3 flex items-start gap-2 text-sm font-medium text-red-700">
            <FaExclamationCircle
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            {problemMessage}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            aria-label={t('quantity')}
            className="border-store-border inline-flex h-10 items-center border"
            role="group"
          >
            <button
              aria-label={t('decreaseQuantity', { name: productName })}
              className="text-store-ink hover:text-store-accent focus-visible:ring-store-accent/25 disabled:text-store-muted/40 inline-flex size-10 items-center justify-center transition focus-visible:ring-2 focus-visible:outline-none"
              disabled={cartItem.amount <= 1}
              onClick={() =>
                updateAmount(cartItem.productId, cartItem.amount - 1)
              }
              type="button"
            >
              <FaMinus aria-hidden="true" className="size-3" />
            </button>
            <span
              aria-live="polite"
              className="text-store-ink w-10 text-center text-sm font-semibold"
            >
              {cartItem.amount}
            </span>
            <button
              aria-label={t('increaseQuantity', { name: productName })}
              className="text-store-ink hover:text-store-accent focus-visible:ring-store-accent/25 disabled:text-store-muted/40 inline-flex size-10 items-center justify-center transition focus-visible:ring-2 focus-visible:outline-none"
              disabled={cartItem.amount >= maxQuantity}
              onClick={() =>
                updateAmount(
                  cartItem.productId,
                  Math.min(maxQuantity, cartItem.amount + 1)
                )
              }
              type="button"
            >
              <FaPlus aria-hidden="true" className="size-3" />
            </button>
          </div>
          <button
            aria-label={t('removeItem', { name: productName })}
            className="text-store-muted hover:text-store-ink focus-visible:ring-store-accent/25 inline-flex h-10 items-center gap-2 text-sm font-semibold underline underline-offset-4 transition focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => removeItem(cartItem.productId)}
            type="button"
          >
            <FaRegTrashAlt aria-hidden="true" className="size-3.5" />
            {t('remove')}
          </button>
        </div>
      </div>

      <div className="text-store-ink flex items-center gap-2 text-left font-semibold sm:justify-end sm:text-right">
        {previewItem?.problemCode ? (
          t('notPayable')
        ) : previewItem ? (
          <>
            <span>{formatPriceCents(previewItem.lineTotalCents, locale)}</span>
            {updating ? <UpdatingSpinner /> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

function CheckoutTotals({
  canUseFinalAction,
  locale,
  onPlaceOrder,
  placeOrderError,
  placingOrder,
  preview,
  updating
}: {
  canUseFinalAction: boolean
  locale: string
  onPlaceOrder: () => void
  placeOrderError: string | null
  placingOrder: boolean
  preview: CheckoutPreview
  updating: boolean
}) {
  const t = useTranslations('Storefront.checkout')

  return (
    <div>
      <dl className="divide-store-border border-store-border divide-y border-y text-sm">
        <CheckoutTotalRow
          label={t('subtotal')}
          value={formatPriceCents(preview.subtotalCents, locale)}
          updating={updating}
        />
        {preview.discountCents > 0 ? (
          <CheckoutTotalRow
            label={t('discount')}
            value={`-${formatPriceCents(preview.discountCents, locale)}`}
            updating={updating}
          />
        ) : null}
        <CheckoutTotalRow
          label={t('shipping')}
          value={formatPriceCents(preview.shippingCents, locale)}
          updating={updating}
        />
        <div className="flex items-center justify-between gap-4 py-5">
          <dt className="text-store-ink font-semibold">{t('total')}</dt>
          <dd className="font-display text-store-ink flex items-center gap-2 text-2xl font-semibold">
            <span>{formatPriceCents(preview.totalCents, locale)}</span>
            {updating ? <UpdatingSpinner /> : null}
          </dd>
        </div>
      </dl>
      <button
        className="bg-store-ink text-store-surface hover:bg-store-accent disabled:bg-store-muted/35 focus-visible:ring-store-accent/25 mt-6 inline-flex h-12 w-full items-center justify-center px-5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
        disabled={!canUseFinalAction || placingOrder}
        onClick={onPlaceOrder}
        type="button"
      >
        {placingOrder ? (
          <>
            <FaSpinner
              aria-hidden="true"
              className="mr-2 size-3.5 animate-spin"
            />
            {t('placingOrder')}
          </>
        ) : (
          t('placeOrder')
        )}
      </button>
      {placeOrderError ? (
        <p className="mt-3 flex items-start gap-2 text-sm font-medium text-red-700">
          <FaExclamationCircle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {placeOrderError}
        </p>
      ) : null}
    </div>
  )
}

function CheckoutTotalRow({
  label,
  updating = false,
  value
}: {
  label: string
  updating?: boolean
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <dt className="text-store-muted">{label}</dt>
      <dd className="text-store-ink flex items-center gap-2 font-semibold">
        <span>{value}</span>
        {updating ? <UpdatingSpinner /> : null}
      </dd>
    </div>
  )
}

function UpdatingSpinner() {
  const t = useTranslations('Storefront.checkout')

  return (
    <FaSpinner
      aria-label={t('updating')}
      className="text-store-accent size-3 animate-spin"
      role="status"
    />
  )
}
