import { z } from "zod";

import { parseMoneyToCents, parseNonNegativeInt } from "~/lib/form-parsers";

const salutationValues = ["", "HERR", "FRAU"] as const;

export type SalutationFieldValue = (typeof salutationValues)[number];

export const createCustomerFormSchema = (messages: {
  emailRequired: string;
  emailInvalid: string;
  firstNameRequired: string;
  lastNameRequired: string;
}) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, messages.emailRequired)
      .email(messages.emailInvalid),
    firstName: z.string().trim().min(1, messages.firstNameRequired),
    lastName: z.string().trim().min(1, messages.lastNameRequired),
    salutation: z.enum(salutationValues),
  });

export type CreateCustomerFormValues = z.infer<
  ReturnType<typeof createCustomerFormSchema>
>;

export const createProductFormSchema = (messages: {
  nameRequired: string;
  manufacturerRequired: string;
  priceRequired: string;
  costRequired: string;
  stockRequired: string;
  dispatchMinRequired: string;
  dispatchMaxRequired: string;
  dispatchRangeInvalid: string;
}) =>
  z
    .object({
      name: z.string().trim().min(1, messages.nameRequired),
      manufacturerName: z.string().trim().min(1, messages.manufacturerRequired),
      price: z.string().refine(
        (value) => parseMoneyToCents(value) != null,
        messages.priceRequired,
      ),
      cost: z.string().refine(
        (value) => parseMoneyToCents(value) != null,
        messages.costRequired,
      ),
      stockOnHand: z.string().refine(
        (value) => parseNonNegativeInt(value) != null,
        messages.stockRequired,
      ),
      dispatchMinDays: z.string().refine(
        (value) => parseNonNegativeInt(value) != null,
        messages.dispatchMinRequired,
      ),
      dispatchMaxDays: z.string().refine(
        (value) => parseNonNegativeInt(value) != null,
        messages.dispatchMaxRequired,
      ),
      active: z.boolean(),
    })
    .superRefine((data, ctx) => {
      const dispatchMinDays = parseNonNegativeInt(data.dispatchMinDays);
      const dispatchMaxDays = parseNonNegativeInt(data.dispatchMaxDays);

      if (
        dispatchMinDays != null &&
        dispatchMaxDays != null &&
        dispatchMaxDays < dispatchMinDays
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.dispatchRangeInvalid,
          path: ["dispatchMaxDays"],
        });
      }
    });

export type CreateProductFormValues = z.infer<
  ReturnType<typeof createProductFormSchema>
>;

export function mapCreateProductFormToInput(values: CreateProductFormValues) {
  const priceCents = parseMoneyToCents(values.price);
  const costCents = parseMoneyToCents(values.cost);
  const stockOnHand = parseNonNegativeInt(values.stockOnHand);
  const dispatchMinDays = parseNonNegativeInt(values.dispatchMinDays);
  const dispatchMaxDays = parseNonNegativeInt(values.dispatchMaxDays);

  if (
    priceCents == null ||
    costCents == null ||
    stockOnHand == null ||
    dispatchMinDays == null ||
    dispatchMaxDays == null
  ) {
    return null;
  }

  return {
    name: values.name,
    manufacturerName: values.manufacturerName,
    priceCents,
    costCents,
    stockOnHand,
    dispatchMinDays,
    dispatchMaxDays,
    active: values.active,
  };
}

export const createOrderFormSchema = (
  messages: {
    customerRequired: string;
    productRequired: string;
    quantityRequired: string;
    insufficientStock: (available: number) => string;
    shippingCentsRequired: string;
    shippingFirstNameRequired: string;
    shippingLastNameRequired: string;
    shippingStreetRequired: string;
    shippingPostalCodeRequired: string;
    shippingCityRequired: string;
    shippingCountryCodeRequired: string;
  },
  options?: { availableStock?: number },
) =>
  z
    .object({
      customerId: z.string().min(1, messages.customerRequired),
      productId: z.string().min(1, messages.productRequired),
      quantity: z.coerce
        .number()
        .int()
        .min(1, messages.quantityRequired),
      shippingCents: z.coerce
        .number()
        .int()
        .min(0, messages.shippingCentsRequired),
      shippingSalutation: z.enum(salutationValues),
      shippingFirstName: z
        .string()
        .trim()
        .min(1, messages.shippingFirstNameRequired),
      shippingLastName: z
        .string()
        .trim()
        .min(1, messages.shippingLastNameRequired),
      shippingCompany: z.string(),
      shippingStreetLine1: z
        .string()
        .trim()
        .min(1, messages.shippingStreetRequired),
      shippingStreetLine2: z.string(),
      shippingPostalCode: z
        .string()
        .trim()
        .min(1, messages.shippingPostalCodeRequired),
      shippingCity: z.string().trim().min(1, messages.shippingCityRequired),
      shippingCountryCode: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}$/, messages.shippingCountryCodeRequired),
      shippingPhone: z.string(),
    })
    .superRefine((data, ctx) => {
      if (
        options?.availableStock != null &&
        data.quantity > options.availableStock
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.insufficientStock(options.availableStock),
          path: ["quantity"],
        });
      }
    });

export type CreateOrderFormValues = z.infer<
  ReturnType<typeof createOrderFormSchema>
>;

export function mapCreateOrderFormToInput(values: CreateOrderFormValues) {
  return {
    customerId: values.customerId,
    productId: values.productId,
    quantity: values.quantity,
    shippingCents: values.shippingCents,
    shippingSalutation:
      values.shippingSalutation === ""
        ? undefined
        : (values.shippingSalutation as "HERR" | "FRAU"),
    shippingFirstName: values.shippingFirstName,
    shippingLastName: values.shippingLastName,
    shippingCompany: values.shippingCompany.trim() || undefined,
    shippingStreetLine1: values.shippingStreetLine1,
    shippingStreetLine2: values.shippingStreetLine2.trim() || undefined,
    shippingPostalCode: values.shippingPostalCode,
    shippingCity: values.shippingCity,
    shippingCountryCode: values.shippingCountryCode.toUpperCase(),
    shippingPhone: values.shippingPhone.trim() || undefined,
  };
}

export const signInFormSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const signUpFormSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export const createPostFormSchema = z.object({
  name: z.string().trim().min(1),
});
