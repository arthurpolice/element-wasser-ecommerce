'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { useSearchParams } from 'next/navigation'
import { FaPencilAlt, FaRegTrashAlt } from 'react-icons/fa'

import {
  inputClass,
  Input,
  smallTextButtonClass,
  textButtonClass
} from '~/app/[locale]/customer-area/_components/customer-area-form-controls'
import type {
  CustomerAddress,
  CustomerOrder,
  CustomerOrderDetails as CustomerOrderDetailsType,
  RegisteredCustomer
} from '~/app/[locale]/customer-area/_components/customer-area-types'
import { useRouter } from '~/i18n/navigation'
import {
  createCustomerFormSchema,
  type CreateCustomerFormValues
} from '~/lib/form-schemas'
import { api } from '~/trpc/react'
import { getSwissPostTrackingUrl } from '~/lib/order-tracking'
import { StorefrontDrawerDialog } from '~/app/[locale]/(storefront)/_components/storefront-drawer-dialog'

type AddressFormValues = CreateCustomerFormValues & {
  company: string
  streetLine1: string
  postalCode: string
  city: string
  countryCode: string
  isMain: boolean
}

type CustomerOrderListLine = CustomerOrder['lines'][number]

const addressIconButtonClass =
  'border-store-border text-store-muted hover:border-store-accent/40 hover:text-store-ink focus-visible:ring-store-accent/25 inline-flex size-9 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60'

function formatDayMonthYear(date: Date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${day}/${month}/${date.getFullYear()}`
}

function formatPostalLine({
  city,
  countryCode,
  postalCode
}: {
  city: string
  countryCode: string
  postalCode: string
}) {
  return `${countryCode}-${postalCode} ${city}`
}

function AddressSummaryRow({
  label,
  lines
}: {
  label: string
  lines: Array<string | null>
}) {
  return (
    <div className="grid gap-3 py-5 md:grid-cols-[4rem_minmax(0,1fr)_minmax(12rem,0.9fr)] md:items-start md:gap-6">
      <dt className="text-store-ink font-semibold md:col-span-2">{label}</dt>
      <dd className="text-store-ink space-y-0.5 leading-5">
        {lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </dd>
    </div>
  )
}

function ReadOnlyField({
  label,
  value
}: {
  label: string
  value: string | null
}) {
  return (
    <div>
      <p className="text-store-muted text-xs font-semibold tracking-[0.14em] uppercase">
        {label}
      </p>
      <p className="text-store-ink mt-1 text-sm font-semibold">
        {value ?? '-'}
      </p>
    </div>
  )
}

function CustomerAreaResponsiveEditor({
  children,
  closeLabel,
  onClose,
  open,
  title
}: {
  children: React.ReactNode
  closeLabel: string
  onClose: () => void
  open: boolean
  title: string
}) {
  return (
    <StorefrontDrawerDialog
      closeLabel={closeLabel}
      onClose={onClose}
      open={open}
      title={title}
      titleTag="h3"
      variant="responsive-modal"
    >
      {children}
    </StorefrontDrawerDialog>
  )
}

export function CustomerPersonalInformation({
  customer
}: {
  customer: RegisteredCustomer
}) {
  const t = useTranslations('CustomerArea')
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl')
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const refresh = () => router.refresh()
  const redirect = () => router.push(callbackUrl ?? '/')

  const contactForm = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(
      createCustomerFormSchema({
        emailRequired: t('onboarding.validation.emailRequired'),
        emailInvalid: t('onboarding.validation.emailInvalid'),
        firstNameRequired: t('onboarding.validation.firstNameRequired'),
        lastNameRequired: t('onboarding.validation.lastNameRequired')
      })
    ),
    defaultValues: {
      email: customer.email,
      phone: customer.phone ?? '',
      firstName: customer.firstName,
      lastName: customer.lastName,
      salutation: customer.salutation ?? ''
    }
  })

  const updateContact = api.customer.updateContact.useMutation({
    onSuccess: () => {
      setEditOpen(false)
      if (callbackUrl) {
        redirect()
        return
      }

      refresh()
    }
  })

  const salutation = customer.salutation
    ? t(`onboarding.salutations.${customer.salutation}`)
    : t('onboarding.fields.salutationNone')

  function openContactEditor() {
    contactForm.reset({
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone ?? '',
      salutation: customer.salutation ?? ''
    })
    updateContact.reset()
    setEditOpen(true)
  }

  return (
    <section className="border-store-border/70 border-b pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-store-ink text-xl font-semibold">
          {t('contact.title')}
        </h2>
        <button
          className={textButtonClass}
          onClick={openContactEditor}
          type="button"
        >
          {t('contact.edit')}
        </button>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <ReadOnlyField
          label={t('onboarding.fields.firstName')}
          value={customer.firstName}
        />
        <ReadOnlyField
          label={t('onboarding.fields.lastName')}
          value={customer.lastName}
        />
        <ReadOnlyField
          label={t('onboarding.fields.email')}
          value={customer.email}
        />
        <ReadOnlyField
          label={t('onboarding.fields.phone')}
          value={customer.phone}
        />
        <ReadOnlyField
          label={t('onboarding.fields.salutation')}
          value={salutation}
        />
      </div>
      <p className="text-store-muted mt-5 text-xs">
        {t('contact.emailReadOnly')}
      </p>

      <CustomerAreaResponsiveEditor
        closeLabel={t('addresses.cancel')}
        onClose={() => {
          if (!updateContact.isPending) {
            setEditOpen(false)
          }
        }}
        open={editOpen}
        title={t('contact.editTitle')}
      >
        <form
          className="grid gap-4"
          onSubmit={contactForm.handleSubmit((values) =>
            updateContact.mutate({
              firstName: values.firstName,
              lastName: values.lastName,
              phone: values.phone || undefined,
              salutation: values.salutation || undefined
            })
          )}
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Input
              label={t('onboarding.fields.firstName')}
              register={contactForm.register('firstName')}
            />
            <Input
              label={t('onboarding.fields.lastName')}
              register={contactForm.register('lastName')}
            />
          </div>
          <div>
            <p className="text-store-muted mb-2 text-xs font-semibold tracking-[0.14em] uppercase">
              {t('onboarding.fields.email')}
            </p>
            <p className="border-store-border text-store-muted border-b py-2 text-sm">
              {customer.email}
            </p>
            <p className="text-store-muted mt-2 text-xs">
              {t('contact.emailReadOnly')}
            </p>
          </div>
          <Input
            label={t('onboarding.fields.phone')}
            register={contactForm.register('phone')}
          />
          <select
            className={inputClass}
            {...contactForm.register('salutation')}
          >
            <option value="">{t('onboarding.fields.salutationNone')}</option>
            <option value="HERR">{t('onboarding.salutations.HERR')}</option>
            <option value="FRAU">{t('onboarding.salutations.FRAU')}</option>
          </select>
          {updateContact.error ? (
            <p className="text-sm text-red-700">
              {updateContact.error.data?.code === 'CONFLICT'
                ? t('onboarding.validation.emailConflict')
                : t('contact.error')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <button
              className={textButtonClass}
              disabled={updateContact.isPending}
              type="submit"
            >
              {updateContact.isPending
                ? t('contact.saving')
                : t('contact.save')}
            </button>
            <button
              className={smallTextButtonClass}
              disabled={updateContact.isPending}
              onClick={() => setEditOpen(false)}
              type="button"
            >
              {t('addresses.cancel')}
            </button>
          </div>
        </form>
      </CustomerAreaResponsiveEditor>
    </section>
  )
}

function CustomerAddressForm({
  addressForm,
  editingAddressId,
  isPending,
  onCancel,
  onSubmit
}: {
  addressForm: UseFormReturn<AddressFormValues>
  editingAddressId: string | null
  isPending: boolean
  onCancel: () => void
  onSubmit: (values: AddressFormValues) => void
}) {
  const t = useTranslations('CustomerArea')

  return (
    <form className="grid gap-4" onSubmit={addressForm.handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Input
          label={t('onboarding.fields.firstName')}
          register={addressForm.register('firstName')}
        />
        <Input
          label={t('onboarding.fields.lastName')}
          register={addressForm.register('lastName')}
        />
      </div>
      <Input
        label={t('addresses.company')}
        register={addressForm.register('company')}
      />
      <Input
        label={t('addresses.streetLine1')}
        register={addressForm.register('streetLine1')}
      />
      <div className="grid grid-cols-[0.58fr_1fr] gap-3 sm:gap-4">
        <Input
          label={t('addresses.postalCode')}
          register={addressForm.register('postalCode')}
        />
        <Input
          label={t('addresses.city')}
          register={addressForm.register('city')}
        />
      </div>
      <Input
        label={t('addresses.countryCode')}
        register={addressForm.register('countryCode')}
      />
      <label className="text-store-ink flex items-center gap-2 text-sm">
        <input
          className="size-4"
          type="checkbox"
          {...addressForm.register('isMain')}
        />
        {t('addresses.setAsMain')}
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button className={textButtonClass} disabled={isPending} type="submit">
          {isPending ? t('addresses.saving') : t('addresses.save')}
        </button>
        <button
          className={smallTextButtonClass}
          disabled={isPending}
          onClick={onCancel}
          type="button"
        >
          {editingAddressId ? t('addresses.cancelEdit') : t('addresses.cancel')}
        </button>
      </div>
    </form>
  )
}

export function CustomerAddresses({
  customer
}: {
  customer: RegisteredCustomer
}) {
  const t = useTranslations('CustomerArea')
  const router = useRouter()
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [addressEditorOpen, setAddressEditorOpen] = useState(false)
  const refresh = () => router.refresh()

  const defaultAddressValues: AddressFormValues = {
    email: customer.email,
    phone: customer.phone ?? '',
    firstName: customer.firstName,
    lastName: customer.lastName,
    salutation: customer.salutation ?? '',
    company: '',
    streetLine1: '',
    postalCode: '',
    city: '',
    countryCode: 'CH',
    isMain: customer.addresses.length === 0
  }

  const addressForm = useForm<AddressFormValues>({
    defaultValues: defaultAddressValues
  })

  const createAddress = api.customer.createAddress.useMutation({
    onSuccess: () => {
      setAddressEditorOpen(false)
      addressForm.reset(defaultAddressValues)
      refresh()
    }
  })
  const updateAddress = api.customer.updateAddress.useMutation({
    onSuccess: () => {
      setEditingAddressId(null)
      setAddressEditorOpen(false)
      addressForm.reset(defaultAddressValues)
      refresh()
    }
  })
  const setMainAddress = api.customer.setMainAddress.useMutation({
    onSuccess: refresh
  })
  const deleteAddress = api.customer.deleteAddress.useMutation({
    onSuccess: refresh
  })
  const isAddressSaving = createAddress.isPending || updateAddress.isPending

  function closeAddressEditor() {
    if (isAddressSaving) {
      return
    }

    setEditingAddressId(null)
    addressForm.reset(defaultAddressValues)
    setAddressEditorOpen(false)
  }

  function submitAddress(values: AddressFormValues) {
    const input = {
      firstName: values.firstName,
      lastName: values.lastName,
      salutation: values.salutation || undefined,
      company: values.company || undefined,
      streetLine1: values.streetLine1,
      postalCode: values.postalCode,
      city: values.city,
      countryCode: values.countryCode,
      isMain: values.isMain
    }

    if (editingAddressId) {
      updateAddress.mutate({ id: editingAddressId, ...input })
      return
    }

    createAddress.mutate(input)
  }

  return (
    <section className="border-store-border/70 border-b pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-store-ink text-xl font-semibold">
          {t('addresses.title')}
        </h2>
        <button
          className={textButtonClass}
          onClick={() => {
            setEditingAddressId(null)
            addressForm.reset(defaultAddressValues)
            setAddressEditorOpen(true)
          }}
          type="button"
        >
          {t('addresses.newAddress')}
        </button>
      </div>
      <div className="divide-store-border/70 mt-5 divide-y">
        {customer.addresses.length === 0 ? (
          <p className="text-store-muted py-3 text-sm">
            {t('addresses.empty')}
          </p>
        ) : (
          customer.addresses.map((address) => (
            <AddressBookEntryRow
              key={address.id}
              address={address}
              customer={customer}
              onDelete={() => deleteAddress.mutate({ id: address.id })}
              onEdit={(values) => {
                setEditingAddressId(address.id)
                addressForm.reset(values)
                setAddressEditorOpen(true)
              }}
              onMakeMain={() => setMainAddress.mutate({ id: address.id })}
            />
          ))
        )}
      </div>

      <CustomerAreaResponsiveEditor
        closeLabel={t('addresses.cancel')}
        onClose={closeAddressEditor}
        open={addressEditorOpen}
        title={
          editingAddressId ? t('addresses.editTitle') : t('addresses.create')
        }
      >
        <CustomerAddressForm
          addressForm={addressForm}
          editingAddressId={editingAddressId}
          isPending={isAddressSaving}
          onCancel={closeAddressEditor}
          onSubmit={submitAddress}
        />
      </CustomerAreaResponsiveEditor>
    </section>
  )
}

export function CustomerOrders({
  customer: _customer
}: {
  customer: RegisteredCustomer
}) {
  const t = useTranslations('CustomerArea')
  const ordersQuery = api.customer.myOrders.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor
    }
  )
  const orders = ordersQuery.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section>
      <h2 className="font-display text-store-ink text-xl font-semibold">
        {t('orders.title')}
      </h2>
      <div className="divide-store-border/70 border-store-border/70 mt-5 divide-y border-t">
        {ordersQuery.isLoading ? (
          <p className="text-store-muted py-4 text-sm">{t('orders.loading')}</p>
        ) : orders.length === 0 ? (
          <p className="text-store-muted py-4 text-sm">{t('orders.empty')}</p>
        ) : (
          orders.map((order) => (
            <CustomerOrderDetails key={order.id} order={order} />
          ))
        )}
      </div>
      {ordersQuery.hasNextPage ? (
        <button
          className={textButtonClass}
          disabled={ordersQuery.isFetchingNextPage}
          onClick={() => ordersQuery.fetchNextPage()}
          type="button"
        >
          {ordersQuery.isFetchingNextPage
            ? t('orders.loading')
            : t('orders.loadMore')}
        </button>
      ) : null}
    </section>
  )
}

function AddressBookEntryRow({
  address,
  customer,
  onDelete,
  onEdit,
  onMakeMain
}: {
  address: CustomerAddress
  customer: RegisteredCustomer
  onDelete: () => void
  onEdit: (values: AddressFormValues) => void
  onMakeMain: () => void
}) {
  const t = useTranslations('CustomerArea')
  const addressLines = [
    address.company,
    address.streetLine1,
    formatPostalLine({
      city: address.city,
      countryCode: address.countryCode,
      postalCode: address.postalCode
    })
  ].filter(Boolean)

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-store-ink font-semibold">
            {address.firstName} {address.lastName}
            {address.isMain ? (
              <span className="text-store-accent ml-2 text-xs font-medium">
                {t('addresses.main')}
              </span>
            ) : null}
          </p>
          <div className="text-store-muted mt-1 space-y-0.5 text-sm leading-5">
            {addressLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            aria-label={t('addresses.edit')}
            className={addressIconButtonClass}
            onClick={() =>
              onEdit({
                email: customer.email,
                phone: customer.phone ?? '',
                firstName: address.firstName,
                lastName: address.lastName,
                salutation: address.salutation ?? '',
                company: address.company ?? '',
                streetLine1: address.streetLine1,
                postalCode: address.postalCode,
                city: address.city,
                countryCode: address.countryCode,
                isMain: address.isMain
              })
            }
            type="button"
          >
            <FaPencilAlt aria-hidden="true" className="size-3.5" />
          </button>
          {!address.isMain ? (
            <button
              className={smallTextButtonClass}
              onClick={onMakeMain}
              type="button"
            >
              {t('addresses.makeMain')}
            </button>
          ) : null}
          <button
            aria-label={t('addresses.delete')}
            className={`${addressIconButtonClass} hover:border-red-700/40 hover:text-red-700 focus-visible:ring-red-700/25`}
            onClick={onDelete}
            type="button"
          >
            <FaRegTrashAlt aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function CustomerOrderDetails({ order }: { order: CustomerOrder }) {
  const t = useTranslations('CustomerArea')
  const tPaymentStatus = useTranslations('OrderPaymentStatus')
  const format = useFormatter()
  const trackingUrl = getSwissPostTrackingUrl(order.trackingNumber)
  const [open, setOpen] = useState(false)
  const detailQuery = api.customer.myOrderDetails.useQuery(
    { orderId: order.id },
    { enabled: open }
  )
  const orderDate = formatDayMonthYear(order.placedAt)
  const deliveryDate = order.dispatchedAt
    ? formatDayMonthYear(order.dispatchedAt)
    : null

  return (
    <article className="py-7">
      <div className="grid">
        <div>
          <h3 className="font-display text-store-ink text-2xl font-semibold tracking-tight">
            {t('orders.orderTitle', {
              orderNumber: order.orderNumber,
              date: orderDate
            })}
          </h3>
          <div className="my-5 flex flex-wrap items-center gap-x-10 gap-y-2 text-sm">
            <p className="text-store-ink">
              {t('orders.status')}{' '}
              <span
                className={
                  order.paymentStatus === 'PAID'
                    ? 'font-semibold text-green-700'
                    : 'text-store-muted font-medium'
                }
              >
                {tPaymentStatus(order.paymentStatus)}
              </span>
            </p>
            <p className="text-store-ink">
              {t('orders.total')}{' '}
              <span className="text-store-muted">
                {format.number(order.totalCents / 100, {
                  style: 'currency',
                  currency: order.currencyCode,
                  currencyDisplay: 'code'
                })}
              </span>
            </p>
          </div>
        </div>

        <div className="divide-store-border/70 border-store-border/70 divide-y border-y">
          {order.lines.map((line) => (
            <CustomerOrderLineRow
              key={line.id}
              deliveryDate={deliveryDate}
              line={line}
            />
          ))}
        </div>

        {open ? (
          detailQuery.isLoading ? (
            <p className="text-store-muted text-sm">{t('orders.loading')}</p>
          ) : detailQuery.data ? (
            <CustomerOrderExpandedDetails
              details={detailQuery.data}
              trackingUrl={trackingUrl}
            />
          ) : null
        ) : null}

        <div className="flex justify-end">
          <button
            className="text-store-accent hover:text-store-ink focus-visible:ring-store-accent/25 my-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            {open ? t('orders.hideDetails') : t('orders.viewDetails')}
          </button>
        </div>
      </div>
    </article>
  )
}

function CustomerOrderExpandedDetails({
  details: order,
  trackingUrl
}: {
  details: CustomerOrderDetailsType
  trackingUrl: string | null
}) {
  const t = useTranslations('CustomerArea')
  const format = useFormatter()

  return (
    <div className="text-store-muted grid gap-4 text-sm">
      {order.dispatchedAt ? (
        <div className="border-store-border bg-store-paper border-l-2 px-4 py-3">
          <p className="text-store-ink font-semibold">
            {t('orders.dispatchedWithSwissPost')}
          </p>
          <p>
            {format.dateTime(order.dispatchedAt, {
              dateStyle: 'medium',
              timeStyle: 'short'
            })}
          </p>
          {trackingUrl ? (
            <a
              className="text-store-accent mt-2 inline-flex font-semibold underline underline-offset-4"
              href={trackingUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t('orders.trackShipment')}
            </a>
          ) : null}
        </div>
      ) : null}
      <dl className="divide-store-border/70 border-store-border/70 divide-b border-b">
        <AddressSummaryRow
          label={t('orders.shipping')}
          lines={[
            `${order.shippingFirstName} ${order.shippingLastName}`,
            order.shippingStreetLine1,
            order.shippingStreetLine2,
            formatPostalLine({
              city: order.shippingCity,
              countryCode: order.shippingCountryCode,
              postalCode: order.shippingPostalCode
            })
          ]}
        />
      </dl>
    </div>
  )
}

function CustomerOrderLineRow({
  deliveryDate,
  line
}: {
  deliveryDate: string | null
  line: CustomerOrderListLine
}) {
  const t = useTranslations('CustomerArea')
  const image = line.product.images[0]

  return (
    <div className="grid min-h-20 grid-cols-[4rem_1fr] items-center gap-4 py-5 md:grid-cols-[4rem_minmax(0,1fr)_minmax(12rem,0.9fr)] md:gap-6">
      <div className="relative size-12 overflow-hidden bg-white">
        {image ? (
          <Image
            alt={image.altText ?? line.productName}
            className="object-contain"
            fill
            sizes="48px"
            src={image.url}
          />
        ) : (
          <div className="bg-store-border/60 h-full w-full" />
        )}
      </div>
      <p className="text-store-ink min-w-0 text-base leading-6 font-medium">
        <span className="mr-3 font-semibold">{line.quantity}&times;</span>
        <span className="font-semibold">{line.productName}</span>
      </p>
      <p className="text-sm font-medium text-green-700 md:text-left">
        {deliveryDate
          ? t('orders.deliveredOn', { date: deliveryDate })
          : t('orders.deliveryPending')}
      </p>
    </div>
  )
}
