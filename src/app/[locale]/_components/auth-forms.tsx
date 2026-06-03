"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";

import {
  signInAction,
  signOutAction,
  signUpAction,
} from "~/app/[locale]/_components/auth-actions";
import {
  signInFormSchema,
  signUpFormSchema,
} from "~/lib/form-schemas";

const inputClass =
  "w-full rounded-lg border border-store-border bg-store-surface px-4 py-2 text-store-ink placeholder:text-store-muted";
const buttonClass =
  "rounded-full bg-store-accent px-10 py-3 font-semibold text-white transition hover:bg-store-accent/90";

export function AuthForms() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? undefined;
  const signInForm = useForm({
    resolver: zodResolver(signInFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={signInForm.handleSubmit((data) =>
          signInAction({ ...data, returnTo }),
        )}
      >
        <p className="text-lg font-semibold">Sign in</p>
        <input
          autoComplete="email"
          className={inputClass}
          placeholder="Email"
          type="email"
          {...signInForm.register("email")}
        />
        <input
          autoComplete="current-password"
          className={inputClass}
          placeholder="Password"
          type="password"
          {...signInForm.register("password")}
        />
        <button className={buttonClass} type="submit">
          Sign in
        </button>
      </form>

      <form
        className="flex flex-col gap-3 border-t border-store-border pt-6"
        onSubmit={signUpForm.handleSubmit((data) =>
          signUpAction({ ...data, returnTo }),
        )}
      >
        <p className="text-lg font-semibold">Create account</p>
        <input
          autoComplete="name"
          className={inputClass}
          placeholder="Name"
          type="text"
          {...signUpForm.register("name")}
        />
        <input
          autoComplete="email"
          className={inputClass}
          placeholder="Email"
          type="email"
          {...signUpForm.register("email")}
        />
        <input
          autoComplete="new-password"
          className={inputClass}
          placeholder="Password (min. 8 characters)"
          type="password"
          {...signUpForm.register("password")}
        />
        <button className={buttonClass} type="submit">
          Sign up
        </button>
      </form>
    </div>
  );
}

export function SignOutForm() {
  return (
    <form action={signOutAction}>
      <button
        className={`${buttonClass} no-underline`}
        type="submit"
      >
        Sign out
      </button>
    </form>
  );
}
