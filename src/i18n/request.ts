import { getRequestConfig } from "next-intl/server"
import { hasLocale } from "next-intl"

import { routing } from "~/i18n/routing"

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  const enMessages = await import(`../../messages/en.json`)
  const deMessages = await import(`../../messages/de.json`)
  const messages = locale === "en" ? enMessages.default : deMessages.default
  return {
    locale,
    messages,
  }
})
