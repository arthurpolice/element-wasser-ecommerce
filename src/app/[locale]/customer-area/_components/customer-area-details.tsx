"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  inputClass,
  Input,
  smallTextButtonClass,
  textButtonClass,
} from "~/app/[locale]/customer-area/_components/customer-area-form-controls";
import type {
  CustomerAddress,
  CustomerArea,
  CustomerOrder,
  CustomerOrderLine,
  RegisteredCustomer,
} from "~/app/[locale]/customer-area/_components/customer-area-types";
import { useRouter } from "~/i18n/navigation";
import {
  createCustomerFormSchema,
  type CreateCustomerFormValues,
} from "~/lib/form-schemas";
import { api } from "~/trpc/react";

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

export function CustomerAreaDetails({ customer }: CustomerArea) {
  return (
    <div className="grid gap-10">
      <CustomerAreaSummary customer={customer} />
      <CustomerPersonalInformation customer={customer} />
      <CustomerAddresses customer={customer} />
      <CustomerOrders customer={customer} />
    </div>
  );
}

export function CustomerAreaSummary({
  customer,
}: {
  customer: RegisteredCustomer;
}) {
  const t = useTranslations("CustomerArea");

  return (
    <section className="border-store-border/70 border-b pb-8">
      <p className="text-store-water text-xs font-semibold tracking-[0.18em] uppercase">
        {t("registered.eyebrow")}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Info
          label={t("registered.name")}
          value={`${customer.firstName} ${customer.lastName}`}
        />
        <Info label={t("registered.email")} value={customer.email} />
        <Info
          label={t("registered.orders")}
          value={String(customer.orders.length)}
        />
      </div>
    </section>
  );
}

export function CustomerPersonalInformation({
  customer,
}: {
  customer: RegisteredCustomer;
}) {
  const t = useTranslations("CustomerArea");
  const router = useRouter();
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

  const updateContact = api.customer.updateContact.useMutation({
    onSuccess: refresh,
  });

  return (
    <section className="border-store-border/70 border-b pb-10">
      <h2 className="font-display text-store-ink text-xl font-semibold">
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
          <Input
            label={t("onboarding.fields.firstName")}
            register={contactForm.register("firstName")}
          />
          <Input
            label={t("onboarding.fields.lastName")}
            register={contactForm.register("lastName")}
          />
        </div>
        <div>
          <p className="text-store-muted mb-2 text-xs font-semibold tracking-[0.14em] uppercase">
            {t("onboarding.fields.email")}
          </p>
          <p className="border-store-border text-store-muted border-b py-2 text-sm">
            {customer.email}
          </p>
          <p className="text-store-muted mt-2 text-xs">
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
        <button className={textButtonClass} type="submit">
          {updateContact.isPending ? t("contact.saving") : t("contact.save")}
        </button>
      </form>
    </section>
  );
}

export function CustomerAddresses({
  customer,
}: {
  customer: RegisteredCustomer;
}) {
  const t = useTranslations("CustomerArea");
  const router = useRouter();
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const refresh = () => router.refresh();

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

  const createAddress = api.customer.createAddress.useMutation({
    onSuccess: refresh,
  });
  const updateAddress = api.customer.updateAddress.useMutation({
    onSuccess: () => {
      setEditingAddressId(null);
      addressForm.reset(defaultAddressValues);
      refresh();
    },
  });
  const setMainAddress = api.customer.setMainAddress.useMutation({
    onSuccess: refresh,
  });
  const deleteAddress = api.customer.deleteAddress.useMutation({
    onSuccess: refresh,
  });

  return (
    <section className="border-store-border/70 border-b pb-10">
      <h2 className="font-display text-store-ink text-xl font-semibold">
        {t("addresses.title")}
      </h2>
      <div className="divide-store-border/70 mt-5 divide-y">
        {customer.addresses.length === 0 ? (
          <p className="text-store-muted py-3 text-sm">
            {t("addresses.empty")}
          </p>
        ) : (
          customer.addresses.map((address) => (
            <AddressBookEntryRow
              key={address.id}
              address={address}
              customer={customer}
              onDelete={() => deleteAddress.mutate({ id: address.id })}
              onEdit={(values) => {
                setEditingAddressId(address.id);
                addressForm.reset(values);
              }}
              onMakeMain={() => setMainAddress.mutate({ id: address.id })}
            />
          ))
        )}
      </div>

      <form
        className="border-store-border mt-6 grid gap-4 border-t pt-6"
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
            {editingAddressId
              ? t("addresses.editTitle")
              : t("addresses.create")}
          </h3>
          {editingAddressId ? (
            <button
              className={smallTextButtonClass}
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
          <Input
            label={t("onboarding.fields.firstName")}
            register={addressForm.register("firstName")}
          />
          <Input
            label={t("onboarding.fields.lastName")}
            register={addressForm.register("lastName")}
          />
        </div>
        <Input
          label={t("addresses.company")}
          register={addressForm.register("company")}
        />
        <Input
          label={t("addresses.streetLine1")}
          register={addressForm.register("streetLine1")}
        />
        <Input
          label={t("addresses.streetLine2")}
          register={addressForm.register("streetLine2")}
        />
        <div className="grid gap-4 sm:grid-cols-[0.7fr_1fr_0.5fr]">
          <Input
            label={t("addresses.postalCode")}
            register={addressForm.register("postalCode")}
          />
          <Input
            label={t("addresses.city")}
            register={addressForm.register("city")}
          />
          <Input
            label={t("addresses.countryCode")}
            register={addressForm.register("countryCode")}
          />
        </div>
        <Input
          label={t("addresses.phone")}
          register={addressForm.register("phone")}
        />
        <label className="text-store-ink flex items-center gap-2 text-sm">
          <input
            className="size-4"
            type="checkbox"
            {...addressForm.register("isMain")}
          />
          {t("addresses.setAsMain")}
        </label>
        <button className={textButtonClass} type="submit">
          {createAddress.isPending || updateAddress.isPending
            ? t("addresses.saving")
            : t("addresses.save")}
        </button>
      </form>
    </section>
  );
}

export function CustomerOrders({ customer }: { customer: RegisteredCustomer }) {
  const t = useTranslations("CustomerArea");

  return (
    <section>
      <h2 className="font-display text-store-ink text-xl font-semibold">
        {t("orders.title")}
      </h2>
      <div className="divide-store-border/70 border-store-border/70 mt-5 divide-y border-t">
        {customer.orders.length === 0 ? (
          <p className="text-store-muted py-4 text-sm">{t("orders.empty")}</p>
        ) : (
          customer.orders.map((order) => (
            <CustomerOrderDetails key={order.id} order={order} />
          ))
        )}
      </div>
    </section>
  );
}

function AddressBookEntryRow({
  address,
  customer,
  onDelete,
  onEdit,
  onMakeMain,
}: {
  address: CustomerAddress;
  customer: RegisteredCustomer;
  onDelete: () => void;
  onEdit: (values: AddressFormValues) => void;
  onMakeMain: () => void;
}) {
  const t = useTranslations("CustomerArea");
  const addressSummary = [
    address.streetLine1,
    address.streetLine2,
    address.city,
    address.countryCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-store-ink font-semibold">
            {address.firstName} {address.lastName}
            {address.isMain ? (
              <span className="text-store-accent ml-2 text-xs font-medium">
                {t("addresses.main")}
              </span>
            ) : null}
          </p>
          <p className="text-store-muted mt-1 text-sm">{addressSummary}</p>
        </div>
        <div className="flex gap-2">
          <button
            className={smallTextButtonClass}
            onClick={() =>
              onEdit({
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
              })
            }
            type="button"
          >
            {t("addresses.edit")}
          </button>
          {!address.isMain ? (
            <button
              className={smallTextButtonClass}
              onClick={onMakeMain}
              type="button"
            >
              {t("addresses.makeMain")}
            </button>
          ) : null}
          <button
            className="decoration-store-border text-xs font-semibold text-red-700 underline underline-offset-4 transition hover:text-red-900 hover:decoration-red-900 focus-visible:ring-2 focus-visible:ring-red-700/25 focus-visible:outline-none"
            onClick={onDelete}
            type="button"
          >
            {t("addresses.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerOrderDetails({ order }: { order: CustomerOrder }) {
  const t = useTranslations("CustomerArea");
  const format = useFormatter();

  return (
    <details className="py-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{order.orderNumber}</p>
            <p className="text-store-muted text-sm">
              {format.dateTime(order.placedAt, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
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
      <div className="text-store-muted mt-4 grid gap-4 text-sm">
        <p>
          {order.status} · {order.paymentStatus} · {order.fulfillmentStatus}
        </p>
        {order.lines.map((line) => (
          <CustomerOrderLineRow
            key={line.id}
            currencyCode={order.currencyCode}
            line={line}
          />
        ))}
        <p>
          {t("orders.shipping")}: {order.shippingStreetLine1},{" "}
          {order.shippingPostalCode} {order.shippingCity}
        </p>
        <p>
          {t("orders.billing")}: {order.billingStreetLine1},{" "}
          {order.billingPostalCode} {order.billingCity}
        </p>
      </div>
    </details>
  );
}

function CustomerOrderLineRow({
  currencyCode,
  line,
}: {
  currencyCode: string;
  line: CustomerOrderLine;
}) {
  const format = useFormatter();

  return (
    <div className="border-store-border border-t pt-3">
      <p className="text-store-ink font-medium">{line.productName}</p>
      <p>
        SKU {line.productSku} · {line.quantity} x{" "}
        {format.number(line.unitPriceCents / 100, {
          style: "currency",
          currency: currencyCode,
        })}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-store-muted text-xs font-semibold tracking-[0.14em] uppercase">
        {label}
      </p>
      <p className="text-store-ink mt-1 font-semibold">{value}</p>
    </div>
  );
}
