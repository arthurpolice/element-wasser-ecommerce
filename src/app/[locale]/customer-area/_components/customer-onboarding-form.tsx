'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'

import {
  createCustomerFormSchema,
  type CreateCustomerFormValues
} from '~/lib/form-schemas'
import { useRouter } from '~/i18n/navigation'
import { api } from '~/trpc/react'
import {
  Field,
  inputClass,
  textButtonClass
} from '~/app/[locale]/customer-area/_components/customer-area-form-controls'

type CustomerOnboardingFormProps = {
  defaultEmail: string
  defaultName?: string | null
}

export function CustomerOnboardingForm({
  defaultEmail,
  defaultName
}: CustomerOnboardingFormProps) {
  const t = useTranslations('CustomerArea.onboarding')
  const router = useRouter()
  const nameParts = defaultName?.trim().split(/\s+/) ?? []
  const mutation = api.customer.completeOnboarding.useMutation({
    onSuccess: () => {
      router.refresh()
    }
  })

  const form = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(
      createCustomerFormSchema({
        emailRequired: t('validation.emailRequired'),
        emailInvalid: t('validation.emailInvalid'),
        firstNameRequired: t('validation.firstNameRequired'),
        lastNameRequired: t('validation.lastNameRequired')
      })
    ),
    defaultValues: {
      email: defaultEmail,
      phone: '',
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' '),
      salutation: ''
    }
  })

  return (
    <form
      className="mt-8 grid gap-4"
      onSubmit={form.handleSubmit((values) =>
        mutation.mutate({
          email: values.email,
          phone: values.phone || undefined,
          firstName: values.firstName,
          lastName: values.lastName,
          salutation: values.salutation || undefined
        })
      )}
    >
      <div>
        <label className="text-store-muted text-xs font-semibold tracking-[0.14em] uppercase">
          {t('fields.salutation')}
        </label>
        <select
          className={`${inputClass} mt-2`}
          {...form.register('salutation')}
        >
          <option value="">{t('fields.salutationNone')}</option>
          <option value="HERR">{t('salutations.HERR')}</option>
          <option value="FRAU">{t('salutations.FRAU')}</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Field
          error={form.formState.errors.firstName?.message}
          label={t('fields.firstName')}
        >
          <input
            autoComplete="given-name"
            className={inputClass}
            type="text"
            {...form.register('firstName')}
          />
        </Field>
        <Field
          error={form.formState.errors.lastName?.message}
          label={t('fields.lastName')}
        >
          <input
            autoComplete="family-name"
            className={inputClass}
            type="text"
            {...form.register('lastName')}
          />
        </Field>
      </div>

      <Field
        error={form.formState.errors.email?.message}
        label={t('fields.email')}
      >
        <input
          autoComplete="email"
          className={inputClass}
          type="email"
          {...form.register('email')}
        />
      </Field>

      <Field label={t('fields.phone')}>
        <input
          autoComplete="tel"
          className={inputClass}
          type="tel"
          {...form.register('phone')}
        />
      </Field>

      {mutation.error ? (
        <p className="border-l-2 border-red-700 py-2 pl-3 text-sm text-red-700">
          {mutation.error.data?.code === 'CONFLICT'
            ? t('validation.emailConflict')
            : t('validation.generic')}
        </p>
      ) : null}

      <button
        className={`mt-2 ${textButtonClass} disabled:cursor-not-allowed`}
        disabled={mutation.isPending}
        type="submit"
      >
        {mutation.isPending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
