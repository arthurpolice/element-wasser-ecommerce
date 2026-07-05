'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import {
  DashboardButton,
  DashboardFieldLabel,
  dashDialogClass,
  dashInputClass,
  dashSelectClass
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import {
  createCustomerFormSchema,
  type CreateCustomerFormValues
} from '~/lib/form-schemas'
import { api } from '~/trpc/react'

const defaultValues: CreateCustomerFormValues = {
  email: '',
  phone: '',
  firstName: '',
  lastName: '',
  salutation: ''
}

export function CreateCustomerDialog() {
  const t = useTranslations('Customers')
  const tForm = useTranslations('Customers.create')
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const utils = api.useUtils()

  function close() {
    setOpen(false)
  }

  const schema = useMemo(
    () =>
      createCustomerFormSchema({
        emailRequired: tForm('validation.emailRequired'),
        emailInvalid: tForm('validation.emailInvalid'),
        firstNameRequired: tForm('validation.firstNameRequired'),
        lastNameRequired: tForm('validation.lastNameRequired')
      }),
    [tForm]
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues
  })

  const createCustomer = api.customer.create.useMutation({
    onSuccess: async () => {
      await utils.customer.list.invalidate()
      reset(defaultValues)
      close()
    }
  })

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

  function handleClose() {
    if (createCustomer.isPending) {
      return
    }

    reset(defaultValues)
    createCustomer.reset()
    close()
  }

  return (
    <>
      <DashboardButton onClick={() => setOpen(true)}>
        {t('createButton')}
      </DashboardButton>

      <dialog
        ref={dialogRef}
        className={`${dashDialogClass} max-w-lg`}
        onCancel={(event) => {
          event.preventDefault()
          handleClose()
        }}
        onClose={handleClose}
      >
        <form
          className="p-6"
          onSubmit={handleSubmit((data) =>
            createCustomer.mutate({
              email: data.email,
              phone: data.phone || undefined,
              firstName: data.firstName,
              lastName: data.lastName,
              salutation: data.salutation === '' ? undefined : data.salutation
            })
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">
                {tForm('title')}
              </h2>
              <p className="text-dash-muted mt-1 text-sm">
                {tForm('description')}
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

          <div className="mt-6 grid gap-4">
            <DashboardFieldLabel
              error={errors.email?.message}
              label={tForm('fields.email')}
            >
              <input
                autoComplete="email"
                className={dashInputClass}
                type="email"
                {...register('email')}
              />
            </DashboardFieldLabel>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <DashboardFieldLabel
                error={errors.firstName?.message}
                label={tForm('fields.firstName')}
              >
                <input
                  autoComplete="given-name"
                  className={dashInputClass}
                  type="text"
                  {...register('firstName')}
                />
              </DashboardFieldLabel>

              <DashboardFieldLabel
                error={errors.lastName?.message}
                label={tForm('fields.lastName')}
              >
                <input
                  autoComplete="family-name"
                  className={dashInputClass}
                  type="text"
                  {...register('lastName')}
                />
              </DashboardFieldLabel>
            </div>

            <DashboardFieldLabel label={tForm('fields.phone')}>
              <input
                autoComplete="tel"
                className={dashInputClass}
                type="tel"
                {...register('phone')}
              />
            </DashboardFieldLabel>

            <DashboardFieldLabel label={tForm('fields.salutation')}>
              <select className={dashSelectClass} {...register('salutation')}>
                <option value="">{tForm('fields.salutationNone')}</option>
                <option value="HERR">{tForm('salutations.HERR')}</option>
                <option value="FRAU">{tForm('salutations.FRAU')}</option>
              </select>
            </DashboardFieldLabel>
          </div>

          {createCustomer.error ? (
            <p className="text-dash-danger mt-4 text-sm">
              {createCustomer.error.message ===
              'A customer with this email already exists.'
                ? tForm('validation.emailConflict')
                : tForm('validation.generic')}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <DashboardButton
              disabled={createCustomer.isPending}
              onClick={handleClose}
              variant="secondary"
            >
              {tForm('cancel')}
            </DashboardButton>
            <DashboardButton disabled={createCustomer.isPending} type="submit">
              {createCustomer.isPending ? tForm('submitting') : tForm('submit')}
            </DashboardButton>
          </div>
        </form>
      </dialog>
    </>
  )
}
