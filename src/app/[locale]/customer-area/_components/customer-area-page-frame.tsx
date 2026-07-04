import { StorefrontShell } from '~/app/[locale]/(storefront)/_components/storefront-shell'
import { api, HydrateClient } from '~/trpc/server'

type CustomerAreaPageFrameProps = {
  children: React.ReactNode
}

export function CustomerAreaPageFrame({
  children
}: CustomerAreaPageFrameProps) {
  void api.catalog.navigationTree.prefetch()

  return (
    <HydrateClient>
      <StorefrontShell>
        <div className="storefront-enter mx-auto grid w-full max-w-5xl gap-10">
          {children}
        </div>
      </StorefrontShell>
    </HydrateClient>
  )
}
