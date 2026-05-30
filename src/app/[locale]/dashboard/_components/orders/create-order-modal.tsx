"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFormatter, useTranslations } from "next-intl";

import {
  DashboardButton,
  dashDialogClass,
  dashInputClass,
} from "~/app/[locale]/dashboard/_components/dashboard-ui";
import {
  createOrderFormSchema,
  mapCreateOrderFormToInput,
  type CreateOrderFormValues,
} from "~/lib/form-schemas";
import { api } from "~/trpc/react";

const defaultValues: CreateOrderFormValues = {
  customerId: "",
  productId: "",
  quantity: 1,
  shippingCents: 0,
  shippingSalutation: "",
  shippingFirstName: "",
  shippingLastName: "",
  shippingCompany: "",
  shippingStreetLine1: "",
  shippingStreetLine2: "",
  shippingPostalCode: "",
  shippingCity: "",
  shippingCountryCode: "CH",
  shippingPhone: "",
};

function calculateUnitPriceCents(
  listPriceCents: number,
  discountPercent: number | null,
): number {
  if (!discountPercent) {
    return listPriceCents;
  }

  return Math.round((listPriceCents * (100 - discountPercent)) / 100);
}

export function CreateOrderDialog() {
  const t = useTranslations("Orders");
  const tForm = useTranslations("Orders.create");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const utils = api.useUtils();

  function close() {
    setOpen(false);
  }

  const customersQuery = api.order.listCustomersForCreate.useQuery(undefined, {
    enabled: open,
  });
  const productsQuery = api.order.listProductsForCreate.useQuery(undefined, {
    enabled: open,
  });

  const schema = useMemo(
    () =>
      createOrderFormSchema({
        customerRequired: tForm("validation.customerRequired"),
        productRequired: tForm("validation.productRequired"),
        quantityRequired: tForm("validation.quantityRequired"),
        insufficientStock: (available) =>
          tForm("validation.insufficientStock", { available }),
        shippingCentsRequired: tForm("validation.shippingCentsRequired"),
        shippingFirstNameRequired: tForm("validation.shippingFirstNameRequired"),
        shippingLastNameRequired: tForm("validation.shippingLastNameRequired"),
        shippingStreetRequired: tForm("validation.shippingStreetRequired"),
        shippingPostalCodeRequired: tForm("validation.shippingPostalCodeRequired"),
        shippingCityRequired: tForm("validation.shippingCityRequired"),
        shippingCountryCodeRequired: tForm(
          "validation.shippingCountryCodeRequired",
        ),
      }),
    [tForm],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const customerId = watch("customerId");
  const productId = watch("productId");
  const quantity = watch("quantity");
  const shippingCents = watch("shippingCents");

  const selectedCustomer = customersQuery.data?.find(
    (customer) => customer.id === customerId,
  );
  const selectedProduct = productsQuery.data?.find(
    (product) => product.id === productId,
  );

  const availableStock = selectedProduct
    ? selectedProduct.stockOnHand - selectedProduct.stockReserved
    : undefined;

  const createOrder = api.order.create.useMutation({
    onSuccess: async () => {
      await utils.order.list.invalidate();
      reset(defaultValues);
      close();
    },
  });

  const preview = useMemo(() => {
    if (!selectedProduct || !Number.isFinite(quantity) || quantity < 1) {
      return null;
    }

    const unitPriceCents = calculateUnitPriceCents(
      selectedProduct.priceCents,
      selectedProduct.discountPercent,
    );
    const lineTotalCents = unitPriceCents * quantity;
    const subtotalCents = selectedProduct.priceCents * quantity;
    const discountCents = subtotalCents - lineTotalCents;
    const totalCents = lineTotalCents + (shippingCents ?? 0);

    return {
      subtotalCents,
      discountCents,
      lineTotalCents,
      totalCents,
    };
  }, [quantity, selectedProduct, shippingCents]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!selectedCustomer) {
      return;
    }

    setValue("shippingSalutation", selectedCustomer.salutation ?? "");
    setValue("shippingFirstName", selectedCustomer.firstName);
    setValue("shippingLastName", selectedCustomer.lastName);
  }, [selectedCustomer, setValue]);

  function handleClose() {
    if (createOrder.isPending) {
      return;
    }

    reset(defaultValues);
    createOrder.reset();
    close();
  }

  function formatMoney(cents: number) {
    return format.number(cents / 100, {
      style: "currency",
      currency: "CHF",
    });
  }

  const onSubmit = handleSubmit((data) => {
    if (availableStock != null && data.quantity > availableStock) {
      setError("quantity", {
        type: "manual",
        message: tForm("validation.insufficientStock", {
          available: availableStock,
        }),
      });
      return;
    }

    createOrder.mutate(mapCreateOrderFormToInput(data));
  });

  return (
    <>
      <DashboardButton onClick={() => setOpen(true)}>
        {t("createButton")}
      </DashboardButton>

      <dialog
      ref={dialogRef}
      className={`${dashDialogClass} max-w-2xl`}
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClose={handleClose}
    >
      <form className="max-h-[90vh] overflow-y-auto p-6" onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{tForm("title")}</h2>
            <p className="text-dash-muted mt-1 text-sm">{tForm("description")}</p>
          </div>
          <button
            aria-label={tForm("cancel")}
            className="text-dash-muted hover:text-dash-ink focus-visible:ring-dash-accent/30 rounded-lg px-2 py-1 transition hover:bg-[#f6f9fc] focus-visible:ring-2 focus-visible:outline-none"
            onClick={handleClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mt-6 grid gap-6">
          <section className="grid gap-4">
            <h3 className="text-dash-ink text-sm font-semibold">
              {tForm("sections.order")}
            </h3>

            <label className="grid gap-1 text-sm">
              <span>{tForm("fields.customer")}</span>
              <select
                className={dashInputClass}
                disabled={customersQuery.isLoading}
                {...register("customerId")}
              >
                <option value="">{tForm("fields.customerPlaceholder")}</option>
                {customersQuery.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.lastName}, {customer.firstName} ({customer.email})
                  </option>
                ))}
              </select>
              {errors.customerId ? (
                <span className="text-dash-danger text-xs">
                  {errors.customerId.message}
                </span>
              ) : null}
            </label>

            <label className="grid gap-1 text-sm">
              <span>{tForm("fields.product")}</span>
              <select
                className={dashInputClass}
                disabled={productsQuery.isLoading}
                {...register("productId")}
              >
                <option value="">{tForm("fields.productPlaceholder")}</option>
                {productsQuery.data?.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
              {errors.productId ? (
                <span className="text-dash-danger text-xs">
                  {errors.productId.message}
                </span>
              ) : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{tForm("fields.quantity")}</span>
                <input
                  className={dashInputClass}
                  min={1}
                  type="number"
                  {...register("quantity", { valueAsNumber: true })}
                />
                {errors.quantity ? (
                  <span className="text-dash-danger text-xs">
                    {errors.quantity.message}
                  </span>
                ) : selectedProduct ? (
                  <span className="text-dash-muted text-xs">
                    {tForm("hints.availableStock", {
                      count:
                        selectedProduct.stockOnHand -
                        selectedProduct.stockReserved,
                    })}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm">
                <span>{tForm("fields.shippingCents")}</span>
                <input
                  className={dashInputClass}
                  min={0}
                  type="number"
                  {...register("shippingCents", { valueAsNumber: true })}
                />
                {errors.shippingCents ? (
                  <span className="text-dash-danger text-xs">
                    {errors.shippingCents.message}
                  </span>
                ) : (
                  <span className="text-dash-muted text-xs">
                    {tForm("hints.shippingCents")}
                  </span>
                )}
              </label>
            </div>
          </section>

          <section className="grid gap-4">
            <h3 className="text-dash-ink text-sm font-semibold">
              {tForm("sections.shipping")}
            </h3>

            <label className="grid gap-1 text-sm">
              <span>{tForm("fields.shippingSalutation")}</span>
              <select
                className={dashInputClass}
                {...register("shippingSalutation")}
              >
                <option value="">{tForm("fields.salutationNone")}</option>
                <option value="HERR">{tForm("salutations.HERR")}</option>
                <option value="FRAU">{tForm("salutations.FRAU")}</option>
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{tForm("fields.shippingFirstName")}</span>
                <input
                  autoComplete="shipping given-name"
                  className={dashInputClass}
                  type="text"
                  {...register("shippingFirstName")}
                />
                {errors.shippingFirstName ? (
                  <span className="text-dash-danger text-xs">
                    {errors.shippingFirstName.message}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm">
                <span>{tForm("fields.shippingLastName")}</span>
                <input
                  autoComplete="shipping family-name"
                  className={dashInputClass}
                  type="text"
                  {...register("shippingLastName")}
                />
                {errors.shippingLastName ? (
                  <span className="text-dash-danger text-xs">
                    {errors.shippingLastName.message}
                  </span>
                ) : null}
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              <span>{tForm("fields.shippingCompany")}</span>
              <input
                autoComplete="shipping organization"
                className={dashInputClass}
                type="text"
                {...register("shippingCompany")}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>{tForm("fields.shippingStreetLine1")}</span>
              <input
                autoComplete="shipping address-line1"
                className={dashInputClass}
                type="text"
                {...register("shippingStreetLine1")}
              />
              {errors.shippingStreetLine1 ? (
                <span className="text-dash-danger text-xs">
                  {errors.shippingStreetLine1.message}
                </span>
              ) : null}
            </label>

            <label className="grid gap-1 text-sm">
              <span>{tForm("fields.shippingStreetLine2")}</span>
              <input
                autoComplete="shipping address-line2"
                className={dashInputClass}
                type="text"
                {...register("shippingStreetLine2")}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span>{tForm("fields.shippingPostalCode")}</span>
                <input
                  autoComplete="shipping postal-code"
                  className={dashInputClass}
                  type="text"
                  {...register("shippingPostalCode")}
                />
                {errors.shippingPostalCode ? (
                  <span className="text-dash-danger text-xs">
                    {errors.shippingPostalCode.message}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>{tForm("fields.shippingCity")}</span>
                <input
                  autoComplete="shipping address-level2"
                  className={dashInputClass}
                  type="text"
                  {...register("shippingCity")}
                />
                {errors.shippingCity ? (
                  <span className="text-dash-danger text-xs">
                    {errors.shippingCity.message}
                  </span>
                ) : null}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{tForm("fields.shippingCountryCode")}</span>
                <input
                  autoComplete="shipping country"
                  className={`${dashInputClass} uppercase`}
                  maxLength={2}
                  type="text"
                  {...register("shippingCountryCode", {
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                      setValue(
                        "shippingCountryCode",
                        event.target.value.toUpperCase(),
                      );
                    },
                  })}
                />
                {errors.shippingCountryCode ? (
                  <span className="text-dash-danger text-xs">
                    {errors.shippingCountryCode.message}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm">
                <span>{tForm("fields.shippingPhone")}</span>
                <input
                  autoComplete="shipping tel"
                  className={dashInputClass}
                  type="tel"
                  {...register("shippingPhone")}
                />
              </label>
            </div>
          </section>

          {preview ? (
            <div className="border-dash-border rounded-lg border bg-[#f6f9fc] p-4 text-sm">
              <h3 className="text-dash-ink font-semibold">
                {tForm("preview.title")}
              </h3>
              <dl className="mt-3 grid gap-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-dash-muted">{tForm("preview.subtotal")}</dt>
                  <dd>{formatMoney(preview.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-dash-muted">{tForm("preview.discount")}</dt>
                  <dd>-{formatMoney(preview.discountCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-dash-muted">{tForm("preview.shipping")}</dt>
                  <dd>{formatMoney(shippingCents ?? 0)}</dd>
                </div>
                <div className="border-dash-border text-dash-ink flex justify-between gap-4 border-t pt-2 font-semibold">
                  <dt>{tForm("preview.total")}</dt>
                  <dd>{formatMoney(preview.totalCents)}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>

        {createOrder.error ? (
          <p className="text-dash-danger mt-4 text-sm">
            {createOrder.error.message === "Customer not found."
              ? tForm("validation.customerNotFound")
              : createOrder.error.message === "Product not found."
                ? tForm("validation.productNotFound")
                : createOrder.error.message === "Insufficient stock available."
                  ? tForm("validation.insufficientStockServer")
                  : createOrder.error.message ===
                      "Order number conflict. Please try again."
                    ? tForm("validation.orderNumberConflict")
                    : tForm("validation.generic")}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <DashboardButton
            disabled={createOrder.isPending}
            onClick={handleClose}
            variant="secondary"
          >
            {tForm("cancel")}
          </DashboardButton>
          <DashboardButton disabled={createOrder.isPending} type="submit">
            {createOrder.isPending ? tForm("submitting") : tForm("submit")}
          </DashboardButton>
        </div>
      </form>
    </dialog>
    </>
  );
}
