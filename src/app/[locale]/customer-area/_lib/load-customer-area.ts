import { redirect } from "next/navigation";

import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export const customerAreaPaths = {
  addresses: "/customer-area/addresses",
  orders: "/customer-area/orders",
  personalInformation: "/customer-area/personal-information",
} as const;

export async function loadCustomerArea(locale: string, path: string) {
  const session = await getSession();

  if (!session?.user) {
    redirect(
      `/${locale}/sign-in?returnTo=${encodeURIComponent(`/${locale}${path}`)}`,
    );
  }

  return api.customer.me();
}

export function redirectToCustomerOnboarding(
  locale: string,
  callbackPath: string,
): never {
  const callbackUrl = `/${locale}${callbackPath}`;

  redirect(
    `/${locale}/customer-area?callbackUrl=${encodeURIComponent(callbackUrl)}`,
  );
}
