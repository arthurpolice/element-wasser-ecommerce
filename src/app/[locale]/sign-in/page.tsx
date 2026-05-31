import { AuthForms } from "~/app/[locale]/_components/auth-forms";

export default function SignInPage() {
  return (
    <main className="storefront-root storefront-grain flex min-h-screen items-center justify-center px-4 py-16">
      <div className="border-store-border/80 bg-store-surface w-full max-w-md rounded-2xl border px-8 py-10 shadow-[0_24px_80px_-40px_rgba(31,42,36,0.35)]">
        <AuthForms />
      </div>
    </main>
  );
}
