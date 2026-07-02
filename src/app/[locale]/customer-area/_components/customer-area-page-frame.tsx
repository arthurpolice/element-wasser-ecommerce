import { StorefrontShell } from '~/app/[locale]/(storefront)/_components/storefront-shell'
import { api, HydrateClient } from '~/trpc/server'

type CustomerAreaPageFrameProps = {
  children: React.ReactNode
  description: string
  title: string
}

export function CustomerAreaPageFrame({
  children,
  description,
  title
}: CustomerAreaPageFrameProps) {
  void api.catalog.navigationTree.prefetch()

  return (
    <HydrateClient>
      <StorefrontShell>
        <div className="mx-auto grid w-full max-w-5xl gap-10">
          <section className="storefront-enter border-store-border/70 border-b pb-8">
            <h1 className="font-display text-store-ink text-3xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="text-store-muted mt-4 text-sm leading-6">
              {description}
            </p>
          </section>

          <div className="storefront-enter storefront-enter-delay-1">
            {children}
          </div>
        </div>
      </StorefrontShell>
    </HydrateClient>
  )
}
