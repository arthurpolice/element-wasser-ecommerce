"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";

import {
  createCustomerFormSchema,
  type CreateCustomerFormValues,
} from "~/lib/form-schemas";
import { useRouter } from "~/i18n/navigation";
import { api, type RouterOutputs } from "~/trpc/react";

type CustomerArea = Extract<
  RouterOutputs["customer"]["me"],
  { status: "registered" }
>;

type AddressFormValues = CreateCustomerFormValues & {
  company: string;
  streetLine1: string;
  streetLine2: string;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string;
  isMain: boolean;
};

const inputClass =
  "w-full rounded-lg border border-store-border bg-store-surface px-3 py-2 text-sm text-store-ink outline-none transition focus:border-store-accent focus:ring-2 focus:ring-store-accent/15";

export function CustomerAreaDetails({ customer }: CustomerArea) {
  const t = useTranslations("CustomerArea");
  const format = useFormatter();
  const router = useRouter();
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const refresh = () => router.refresh();

  const contactForm = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(
      createCustomerFormSchema({
        emailRequired: t("onboarding.validation.emailRequired"),
        emailInvalid: t("onboarding.validation.emailInvalid"),
        firstNameRequired: t("onboarding.validation.firstNameRequired"),
        lastNameRequired: t("onboarding.validation.lastNameRequired"),
      }),
    ),
    defaultValues: {
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      salutation: customer.salutation ?? "",
    },
  });

  const defaultAddressValues: AddressFormValues = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    salutation: customer.salutation ?? "",
    company: "",
    streetLine1: "",
    streetLine2: "",
    postalCode: "",
    city: "",
    countryCode: "CH",
    phone: "",
    isMain: customer.addresses.length === 0,
  };

  const addressForm = useForm<AddressFormValues>({
    defaultValues: defaultAddressValues,
  });

  const updateContact = api.customer.updateContact.useMutation({ onSuccess: refresh });
  const createAddress = api.customer.createAddress.useMutation({ onSuccess: refresh });
  const updateAddress = api.customer.updateAddress.useMutation({
    onSuccess: () => {
      setEditingAddressId(null);
      addressForm.reset(defaultAddressValues);
      refresh();
    },
  });
  const setMainAddress = api.customer.setMainAddress.useMutation({ onSuccess: refresh });
  const deleteAddress = api.customer.deleteAddress.useMutation({ onSuccess: refresh });

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-store-border bg-store-surface p-6">
        <p className="text-xs font-semibold tracking-[0.18em] text-store-water uppercase">
          {t("registered.eyebrow")}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Info label={t("registered.name")} value={`${customer.firstName} ${customer.lastName}`} />
          <Info label={t("registered.email")} value={customer.email} />
          <Info label={t("registered.orders")} value={String(customer.orders.length)} />
        </div>
      </section>

      <section className="rounded-lg border border-store-border bg-store-surface p-6">
        <h2 className="font-display text-xl font-semibold text-store-ink">
          {t("contact.title")}
        </h2>
        <form
          className="mt-5 grid gap-4"
          onSubmit={contactForm.handleSubmit((values) =>
            updateContact.mutate({
              firstName: values.firstName,
              lastName: values.lastName,
              salutation: values.salutation || undefined,
            }),
          )}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t("onboarding.fields.firstName")} register={contactForm.register("firstName")} />
            <Input label={t("onboarding.fields.lastName")} register={contactForm.register("lastName")} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-store-muted uppercase">
              {t("onboarding.fields.email")}
            </p>
            <p className="rounded-lg border border-store-border bg-store-bg/50 px-3 py-2 text-sm text-store-muted">
              {customer.email}
            </p>
            <p className="mt-2 text-xs text-store-muted">
              {t("contact.emailReadOnly")}
            </p>
          </div>
          <select className={inputClass} {...contactForm.register("salutation")}>
            <option value="">{t("onboarding.fields.salutationNone")}</option>
            <option value="HERR">{t("onboarding.salutations.HERR")}</option>
            <option value="FRAU">{t("onboarding.salutations.FRAU")}</option>
          </select>
          {updateContact.error ? (
            <p className="text-sm text-red-700">
              {updateContact.error.data?.code === "CONFLICT"
                ? t("onboarding.validation.emailConflict")
                : t("contact.error")}
            </p>
          ) : null}
          <button className="w-fit rounded-full bg-store-accent px-5 py-2.5 text-sm font-semibold text-white" type="submit">
            {updateContact.isPending ? t("contact.saving") : t("contact.save")}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-store-border bg-store-surface p-6">
        <h2 className="font-display text-xl font-semibold text-store-ink">
          {t("addresses.title")}
        </h2>
        <div className="mt-5 grid gap-3">
          {customer.addresses.length === 0 ? (
            <p className="text-sm text-store-muted">{t("addresses.empty")}</p>
          ) : (
            customer.addresses.map((address) => (
              <div key={address.id} className="rounded-lg border border-store-border/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-store-ink">
                      {address.firstName} {address.lastName}
                      {address.isMain ? (
                        <span className="ml-2 rounded-full bg-store-accent/10 px-2 py-1 text-xs text-store-accent">
                          {t("addresses.main")}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-store-muted">
                      {[address.streetLine1, address.streetLine2, address.city, address.countryCode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-full border border-store-border px-3 py-1.5 text-xs"
                      onClick={() => {
                        setEditingAddressId(address.id);
                        addressForm.reset({
                          email: customer.email,
                          firstName: address.firstName,
                          lastName: address.lastName,
                          salutation: address.salutation ?? "",
                          company: address.company ?? "",
                          streetLine1: address.streetLine1,
                          streetLine2: address.streetLine2 ?? "",
                          postalCode: address.postalCode,
                          city: address.city,
                          countryCode: address.countryCode,
                          phone: address.phone ?? "",
                          isMain: address.isMain,
                        });
                      }}
                      type="button"
                    >
                      {t("addresses.edit")}
                    </button>
                    {!address.isMain ? (
                      <button className="rounded-full border border-store-border px-3 py-1.5 text-xs" onClick={() => setMainAddress.mutate({ id: address.id })} type="button">
                        {t("addresses.makeMain")}
                      </button>
                    ) : null}
                    <button className="rounded-full border border-store-border px-3 py-1.5 text-xs text-red-700" onClick={() => deleteAddress.mutate({ id: address.id })} type="button">
                      {t("addresses.delete")}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <form
          className="mt-6 grid gap-4 border-t border-store-border pt-5"
          onSubmit={addressForm.handleSubmit((values) => {
            const input = {
              firstName: values.firstName,
              lastName: values.lastName,
              salutation: values.salutation || undefined,
              company: values.company || undefined,
              streetLine1: values.streetLine1,
              streetLine2: values.streetLine2 || undefined,
              postalCode: values.postalCode,
              city: values.city,
              countryCode: values.countryCode,
              phone: values.phone || undefined,
              isMain: values.isMain,
            };

            if (editingAddressId) {
              updateAddress.mutate({ id: editingAddressId, ...input });
              return;
            }

            createAddress.mutate(input);
          })}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold">
              {editingAddressId ? t("addresses.editTitle") : t("addresses.create")}
            </h3>
            {editingAddressId ? (
              <button
                className="rounded-full border border-store-border px-3 py-1.5 text-xs"
                onClick={() => {
                  setEditingAddressId(null);
                  addressForm.reset(defaultAddressValues);
                }}
                type="button"
              >
                {t("addresses.cancelEdit")}
              </button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t("onboarding.fields.firstName")} register={addressForm.register("firstName")} />
            <Input label={t("onboarding.fields.lastName")} register={addressForm.register("lastName")} />
          </div>
          <Input label={t("addresses.company")} register={addressForm.register("company")} />
          <Input label={t("addresses.streetLine1")} register={addressForm.register("streetLine1")} />
          <Input label={t("addresses.streetLine2")} register={addressForm.register("streetLine2")} />
          <div className="grid gap-4 sm:grid-cols-[0.7fr_1fr_0.5fr]">
            <Input label={t("addresses.postalCode")} register={addressForm.register("postalCode")} />
            <Input label={t("addresses.city")} register={addressForm.register("city")} />
            <Input label={t("addresses.countryCode")} register={addressForm.register("countryCode")} />
          </div>
          <Input label={t("addresses.phone")} register={addressForm.register("phone")} />
          <label className="flex items-center gap-2 text-sm text-store-ink">
            <input className="size-4" type="checkbox" {...addressForm.register("isMain")} />
            {t("addresses.setAsMain")}
          </label>
          <button className="w-fit rounded-full bg-store-accent px-5 py-2.5 text-sm font-semibold text-white" type="submit">
            {createAddress.isPending || updateAddress.isPending
              ? t("addresses.saving")
              : t("addresses.save")}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-store-border bg-store-surface p-6">
        <h2 className="font-display text-xl font-semibold text-store-ink">
          {t("orders.title")}
        </h2>
        <div className="mt-5 grid gap-3">
          {customer.orders.length === 0 ? (
            <p className="text-sm text-store-muted">{t("orders.empty")}</p>
          ) : (
            customer.orders.map((order) => (
              <details key={order.id} className="rounded-lg border border-store-border/80 p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{order.orderNumber}</p>
                      <p className="text-sm text-store-muted">
                        {format.dateTime(order.placedAt, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {format.number(order.totalCents / 100, {
                        style: "currency",
                        currency: order.currencyCode,
                      })}
                    </p>
                  </div>
                </summary>
                <div className="mt-4 grid gap-4 text-sm text-store-muted">
                  <p>
                    {order.status} · {order.paymentStatus} · {order.fulfillmentStatus}
                  </p>
                  {order.lines.map((line) => (
                    <div key={line.id} className="border-t border-store-border pt-3">
                      <p className="font-medium text-store-ink">{line.productName}</p>
                      <p>SKU {line.productSku} · {line.quantity} x {format.number(line.unitPriceCents / 100, { style: "currency", currency: order.currencyCode })}</p>
                    </div>
                  ))}
                  <p>
                    {t("orders.shipping")}: {order.shippingStreetLine1}, {order.shippingPostalCode} {order.shippingCity}
                  </p>
                  <p>
                    {t("orders.billing")}: {order.billingStreetLine1}, {order.billingPostalCode} {order.billingCity}
                  </p>
                </div>
              </details>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.14em] text-store-muted uppercase">{label}</p>
      <p className="mt-1 font-semibold text-store-ink">{value}</p>
    </div>
  );
}

function Input({
  label,
  register,
  type = "text",
}: {
  label: string;
  register: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold tracking-[0.14em] text-store-muted uppercase">
        {label}
      </span>
      <input className={inputClass} type={type} {...register} />
    </label>
  );
}
