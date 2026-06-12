import { StorefrontShell } from '~/app/[locale]/(storefront)/_components/storefront-shell'
import { CheckoutClient } from '~/app/[locale]/(storefront)/checkout/_components/checkout-client'
import { HydrateClient } from '~/trpc/server'

export default function CheckoutPage() {
  return (
    <HydrateClient>
      <StorefrontShell>
        <CheckoutClient />
      </StorefrontShell>
    </HydrateClient>
  )
}
