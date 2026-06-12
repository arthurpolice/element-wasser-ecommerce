import { describe, expect, it } from 'vitest'

import {
  createEmptyGuestCheckoutAddress,
  getGuestCheckoutProgression,
  isGuestCheckoutAddressComplete,
  normalizeCheckoutCountryCode,
  type GuestCheckoutAddress
} from '~/lib/checkout-guest'

const completeAddress: GuestCheckoutAddress = {
  ...createEmptyGuestCheckoutAddress(),
  email: 'customer@example.com',
  firstName: 'Ari',
  lastName: 'Wasser',
  streetLine1: 'Riverstrasse 12',
  postalCode: '8000',
  city: 'Zurich',
  countryCode: 'ch'
}

describe('guest checkout progression', () => {
  it('requires guest contact and shipping address fields before payment unlocks', () => {
    const address = {
      ...completeAddress,
      streetLine1: ''
    }

    expect(isGuestCheckoutAddressComplete(address)).toBe(false)
    expect(
      getGuestCheckoutProgression({
        address,
        paymentMethod: null,
        cartCanPlaceOrder: true
      })
    ).toMatchObject({
      addressComplete: false,
      paymentUnlocked: false,
      overviewUnlocked: false,
      canUseFinalAction: false
    })
  })

  it('accepts optional fields without blocking payment selection', () => {
    expect(isGuestCheckoutAddressComplete(completeAddress)).toBe(true)
    expect(normalizeCheckoutCountryCode(' ch ')).toBe('CH')
  })

  it('unlocks order overview only after a payment method is selected', () => {
    expect(
      getGuestCheckoutProgression({
        address: completeAddress,
        paymentMethod: null,
        cartCanPlaceOrder: true
      })
    ).toMatchObject({
      addressComplete: true,
      paymentUnlocked: true,
      paymentComplete: false,
      overviewUnlocked: false,
      canUseFinalAction: false
    })

    expect(
      getGuestCheckoutProgression({
        address: completeAddress,
        paymentMethod: 'TWINT',
        cartCanPlaceOrder: true
      })
    ).toMatchObject({
      paymentComplete: true,
      overviewUnlocked: true,
      canUseFinalAction: true
    })
  })

  it('keeps the final dummy action locked when the cart preview cannot be placed', () => {
    expect(
      getGuestCheckoutProgression({
        address: completeAddress,
        paymentMethod: 'CARD',
        cartCanPlaceOrder: false
      }).canUseFinalAction
    ).toBe(false)
  })
})
