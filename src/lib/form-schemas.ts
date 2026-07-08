import { z } from 'zod'
import type { JSONContent } from '@tiptap/react'

import { parseMoneyToCents, parseNonNegativeInt } from '~/lib/form-parsers'

const salutationValues = ['', 'HERR', 'FRAU'] as const

export type SalutationFieldValue = (typeof salutationValues)[number]

export type ProductDescriptionJson = JSONContent
export const productDescriptionJsonSchema = z
  .custom<ProductDescriptionJson>()
  .nullable()

export const createCustomerFormSchema = (messages: {
  emailRequired: string
  emailInvalid: string
  firstNameRequired: string
  lastNameRequired: string
}) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, messages.emailRequired)
      .email(messages.emailInvalid),
    firstName: z.string().trim().min(1, messages.firstNameRequired),
    lastName: z.string().trim().min(1, messages.lastNameRequired),
    phone: z.string().trim(),
    salutation: z.enum(salutationValues)
  })

export type CreateCustomerFormValues = z.infer<
  ReturnType<typeof createCustomerFormSchema>
>

export const createProductFormSchema = (messages: {
  nameRequired: string
  manufacturerRequired: string
  priceRequired: string
  costRequired: string
  shippingWeightRequired: string
  stockRequired: string
  dispatchMinRequired: string
  dispatchMaxRequired: string
  dispatchRangeInvalid: string
}) =>
  z
    .object({
      name: z.string().trim().min(1, messages.nameRequired),
      manufacturerName: z.string().trim().min(1, messages.manufacturerRequired),
      description: productDescriptionJsonSchema,
      price: z
        .string()
        .refine(
          (value) => parseMoneyToCents(value) != null,
          messages.priceRequired
        ),
      cost: z
        .string()
        .refine(
          (value) => parseMoneyToCents(value) != null,
          messages.costRequired
        ),
      shippingWeightGrams: z.string().refine((value) => {
        if (value.trim() === '') {
          return true
        }

        const parsed = parseNonNegativeInt(value)
        return parsed != null && parsed > 0
      }, messages.shippingWeightRequired),
      stockOnHand: z
        .string()
        .refine(
          (value) => parseNonNegativeInt(value) != null,
          messages.stockRequired
        ),
      dispatchMinDays: z
        .string()
        .refine(
          (value) => parseNonNegativeInt(value) != null,
          messages.dispatchMinRequired
        ),
      dispatchMaxDays: z
        .string()
        .refine(
          (value) => parseNonNegativeInt(value) != null,
          messages.dispatchMaxRequired
        ),
      active: z.boolean(),
      featured: z.boolean()
    })
    .superRefine((data, ctx) => {
      const dispatchMinDays = parseNonNegativeInt(data.dispatchMinDays)
      const dispatchMaxDays = parseNonNegativeInt(data.dispatchMaxDays)

      if (
        dispatchMinDays != null &&
        dispatchMaxDays != null &&
        dispatchMaxDays < dispatchMinDays
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.dispatchRangeInvalid,
          path: ['dispatchMaxDays']
        })
      }
    })

export type CreateProductFormValues = z.infer<
  ReturnType<typeof createProductFormSchema>
>

export function mapCreateProductFormToInput(values: CreateProductFormValues) {
  const priceCents = parseMoneyToCents(values.price)
  const costCents = parseMoneyToCents(values.cost)
  const shippingWeightGrams =
    values.shippingWeightGrams.trim() === ''
      ? null
      : parseNonNegativeInt(values.shippingWeightGrams)
  const stockOnHand = parseNonNegativeInt(values.stockOnHand)
  const dispatchMinDays = parseNonNegativeInt(values.dispatchMinDays)
  const dispatchMaxDays = parseNonNegativeInt(values.dispatchMaxDays)

  if (
    priceCents == null ||
    costCents == null ||
    (shippingWeightGrams != null && shippingWeightGrams < 1) ||
    stockOnHand == null ||
    dispatchMinDays == null ||
    dispatchMaxDays == null
  ) {
    return null
  }

  return {
    name: values.name,
    manufacturerName: values.manufacturerName,
    description: values.description,
    priceCents,
    costCents,
    shippingWeightGrams,
    stockOnHand,
    dispatchMinDays,
    dispatchMaxDays,
    active: values.active,
    featured: values.featured
  }
}

export const createOrderFormSchema = (
  messages: {
    customerRequired: string
    productRequired: string
    quantityRequired: string
    insufficientStock: (available: number) => string
    shippingFirstNameRequired: string
    shippingLastNameRequired: string
    shippingStreetRequired: string
    shippingPostalCodeRequired: string
    shippingCityRequired: string
    shippingCountryCodeRequired: string
  },
  options?: { availableStock?: number }
) =>
  z
    .object({
      customerId: z.string().min(1, messages.customerRequired),
      productId: z.string().min(1, messages.productRequired),
      addressId: z.string(),
      quantity: z.coerce.number().int().min(1, messages.quantityRequired),
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
      shippingPhone: z.string()
    })
    .superRefine((data, ctx) => {
      if (
        options?.availableStock != null &&
        data.quantity > options.availableStock
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.insufficientStock(options.availableStock),
          path: ['quantity']
        })
      }
    })

export type CreateOrderFormValues = z.infer<
  ReturnType<typeof createOrderFormSchema>
>

export function mapCreateOrderFormToInput(values: CreateOrderFormValues) {
  return {
    customerId: values.customerId,
    productId: values.productId,
    addressId: values.addressId || undefined,
    quantity: values.quantity,
    shippingSalutation:
      values.shippingSalutation === '' ? undefined : values.shippingSalutation,
    shippingFirstName: values.shippingFirstName,
    shippingLastName: values.shippingLastName,
    shippingCompany: values.shippingCompany.trim() || undefined,
    shippingStreetLine1: values.shippingStreetLine1,
    shippingStreetLine2: values.shippingStreetLine2.trim() || undefined,
    shippingPostalCode: values.shippingPostalCode,
    shippingCity: values.shippingCity,
    shippingCountryCode: values.shippingCountryCode.toUpperCase(),
    shippingPhone: values.shippingPhone.trim() || undefined
  }
}

export const signInFormSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
})

export const signUpFormSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8)
})

export const createPostFormSchema = z.object({
  name: z.string().trim().min(1)
})
