"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "~/server/better-auth";

function getSafeReturnTo(returnTo?: string) {
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}

export async function signInAction(data: {
  email: string;
  password: string;
  returnTo?: string;
}) {
  const returnTo = getSafeReturnTo(data.returnTo);

  await auth.api.signInEmail({
    body: {
      email: data.email,
      password: data.password,
      callbackURL: returnTo,
    },
    headers: await headers(),
  });
  redirect(returnTo);
}

export async function signUpAction(data: {
  name: string;
  email: string;
  password: string;
  returnTo?: string;
}) {
  const returnTo = getSafeReturnTo(data.returnTo);

  await auth.api.signUpEmail({
    body: {
      name: data.name,
      email: data.email,
      password: data.password,
      callbackURL: returnTo,
    },
    headers: await headers(),
  });
  redirect(returnTo);
}

export async function signOutAction() {
  await auth.api.signOut({
    headers: await headers(),
  });
  redirect("/");
}
