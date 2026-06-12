export type GuestCheckoutAddress = {
  email: string
  salutation: string
  firstName: string
  lastName: string
  company: string
  streetLine1: string
  streetLine2: string
  postalCode: string
  city: string
  countryCode: string
  phone: string
}

export type CheckoutPaymentMethod = 'CARD' | 'TWINT'

export type GuestCheckoutProgressionInput = {
  address: GuestCheckoutAddress
  paymentMethod: CheckoutPaymentMethod | null
  cartCanPlaceOrder: boolean
}

export function createEmptyGuestCheckoutAddress(): GuestCheckoutAddress {
  return {
    email: '',
    salutation: '',
    firstName: '',
    lastName: '',
    company: '',
    streetLine1: '',
    streetLine2: '',
    postalCode: '',
    city: '',
    countryCode: '',
    phone: ''
  }
}

function hasText(value: string) {
  return value.trim().length > 0
}

function hasPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function normalizeCheckoutCountryCode(value: string) {
  return value.trim().toUpperCase().slice(0, 2)
}

export function isGuestCheckoutAddressComplete(address: GuestCheckoutAddress) {
  return (
    hasPlausibleEmail(address.email) &&
    hasText(address.firstName) &&
    hasText(address.lastName) &&
    hasText(address.streetLine1) &&
    hasText(address.postalCode) &&
    hasText(address.city) &&
    /^[A-Z]{2}$/.test(normalizeCheckoutCountryCode(address.countryCode))
  )
}

export function getGuestCheckoutProgression({
  address,
  cartCanPlaceOrder,
  paymentMethod
}: GuestCheckoutProgressionInput) {
  const addressComplete = isGuestCheckoutAddressComplete(address)
  const paymentUnlocked = addressComplete
  const paymentComplete = paymentUnlocked && paymentMethod !== null
  const overviewUnlocked = paymentComplete

  return {
    addressComplete,
    paymentUnlocked,
    paymentComplete,
    overviewUnlocked,
    canUseFinalAction: overviewUnlocked && cartCanPlaceOrder
  }
}
