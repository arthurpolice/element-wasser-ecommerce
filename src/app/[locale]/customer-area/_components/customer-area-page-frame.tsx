type CustomerAreaPageFrameProps = {
  children: React.ReactNode;
  description: string;
  title: string;
};

export function CustomerAreaPageFrame({
  children,
  description,
  title,
}: CustomerAreaPageFrameProps) {
  return (
    <main className="storefront-root storefront-grain min-h-screen px-5 py-8 lg:px-10 lg:py-12">
      <div className="mx-auto grid w-full max-w-5xl gap-10">
        <section className="storefront-enter border-store-border/70 border-b pb-8">
          <p className="font-display text-store-accent text-xs font-semibold tracking-[0.24em] uppercase">
            Element Wasser
          </p>
          <h1 className="font-display text-store-ink mt-4 text-3xl font-semibold tracking-tight">
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
    </main>
  );
}
