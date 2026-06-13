import { StorefrontShell } from '~/app/[locale]/(storefront)/_components/storefront-shell'
import { CheckoutConfirmationClient } from '~/app/[locale]/(storefront)/checkout/confirmation/checkout-confirmation-client'
import { HydrateClient } from '~/trpc/server'

type CheckoutConfirmationPageProps = {
  searchParams: Promise<{
    order?: string
    token?: string
  }>
}

export default async function CheckoutConfirmationPage({
  searchParams
}: CheckoutConfirmationPageProps) {
  const { order, token } = await searchParams

  return (
    <HydrateClient>
      <StorefrontShell>
        <CheckoutConfirmationClient
          orderAccessToken={token ?? null}
          orderNumber={order ?? null}
        />
      </StorefrontShell>
    </HydrateClient>
  )
}
