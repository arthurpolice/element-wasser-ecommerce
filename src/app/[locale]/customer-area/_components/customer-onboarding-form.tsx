"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

import {
  createCustomerFormSchema,
  type CreateCustomerFormValues,
} from "~/lib/form-schemas";
import { useRouter } from "~/i18n/navigation";
import { api } from "~/trpc/react";

type CustomerOnboardingFormProps = {
  defaultEmail: string;
  defaultName?: string | null;
};

const inputClass =
  "w-full rounded-lg border border-store-border bg-store-surface px-4 py-3 text-sm text-store-ink outline-none transition placeholder:text-store-muted focus:border-store-accent focus:ring-2 focus:ring-store-accent/15";

export function CustomerOnboardingForm({
  defaultEmail,
  defaultName,
}: CustomerOnboardingFormProps) {
  const t = useTranslations("CustomerArea.onboarding");
  const router = useRouter();
  const nameParts = defaultName?.trim().split(/\s+/) ?? [];
  const mutation = api.customer.completeOnboarding.useMutation({
    onSuccess: () => {
      router.refresh();
    },
  });

  const form = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(
      createCustomerFormSchema({
        emailRequired: t("validation.emailRequired"),
        emailInvalid: t("validation.emailInvalid"),
        firstNameRequired: t("validation.firstNameRequired"),
        lastNameRequired: t("validation.lastNameRequired"),
      }),
    ),
    defaultValues: {
      email: defaultEmail,
      firstName: nameParts[0] ?? "",
      lastName: nameParts.slice(1).join(" "),
      salutation: "",
    },
  });

  return (
    <form
      className="mt-8 grid gap-4"
      onSubmit={form.handleSubmit((values) =>
        mutation.mutate({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          salutation: values.salutation || undefined,
        }),
      )}
    >
      <div>
        <label className="text-xs font-semibold tracking-[0.14em] text-store-muted uppercase">
          {t("fields.salutation")}
        </label>
        <select className={`${inputClass} mt-2`} {...form.register("salutation")}>
          <option value="">{t("fields.salutationNone")}</option>
          <option value="HERR">{t("salutations.HERR")}</option>
          <option value="FRAU">{t("salutations.FRAU")}</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.firstName?.message}
          label={t("fields.firstName")}
        >
          <input
            autoComplete="given-name"
            className={inputClass}
            type="text"
            {...form.register("firstName")}
          />
        </Field>
        <Field
          error={form.formState.errors.lastName?.message}
          label={t("fields.lastName")}
        >
          <input
            autoComplete="family-name"
            className={inputClass}
            type="text"
            {...form.register("lastName")}
          />
        </Field>
      </div>

      <Field error={form.formState.errors.email?.message} label={t("fields.email")}>
        <input
          autoComplete="email"
          className={inputClass}
          type="email"
          {...form.register("email")}
        />
      </Field>

      {mutation.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {mutation.error.data?.code === "CONFLICT"
            ? t("validation.emailConflict")
            : t("validation.generic")}
        </p>
      ) : null}

      <button
        className="mt-2 rounded-full bg-store-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-store-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={mutation.isPending}
        type="submit"
      >
        {mutation.isPending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-[0.14em] text-store-muted uppercase">
        {label}
      </span>
      <span className="mt-2 block">{children}</span>
      {error ? <span className="mt-2 block text-sm text-red-700">{error}</span> : null}
    </label>
  );
}
