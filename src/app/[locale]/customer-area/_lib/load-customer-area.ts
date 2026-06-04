import { redirect } from "next/navigation";

import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export async function loadCustomerArea(locale: string, path: string) {
  const session = await getSession();

  if (!session?.user) {
    redirect(
      `/${locale}/sign-in?returnTo=${encodeURIComponent(`/${locale}${path}`)}`,
    );
  }

  return api.customer.me();
}

export function redirectToCustomerOnboarding(locale: string): never {
  redirect(`/${locale}/customer-area`);
}
