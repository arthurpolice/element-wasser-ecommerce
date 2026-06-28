"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import {
  signInFormSchema,
  signUpFormSchema,
} from "~/lib/form-schemas";
import { authClient } from "~/server/better-auth/client";

type SignInFormValues = z.infer<typeof signInFormSchema>;
type SignUpFormValues = z.infer<typeof signUpFormSchema>;

const inputClass =
  "w-full rounded-lg border border-store-border bg-store-surface px-4 py-2 text-store-ink placeholder:text-store-muted";
const buttonClass =
  "rounded-full bg-store-accent px-10 py-3 font-semibold text-white transition hover:bg-store-accent/90 disabled:cursor-not-allowed disabled:opacity-65";
const fieldErrorClass = "text-sm text-red-700";
const formErrorClass =
  "border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";

function getSafeReturnTo(returnTo?: string) {
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}

export function AuthForms() {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTo(
    searchParams.get("returnTo") ?? undefined,
  );
  const [signInError, setSignInError] = useState<string | null>(
    null,
  );
  const [signUpError, setSignUpError] = useState<string | null>(
    null,
  );
  const signInForm = useForm<SignInFormValues>({
    resolver: zodResolver(signInFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const signInSubmitting = signInForm.formState.isSubmitting;
  const signUpSubmitting = signUpForm.formState.isSubmitting;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={signInForm.handleSubmit(async (data) => {
          setSignInError(null);

          try {
            await authClient.signIn.email(data, { throw: true });
            router.replace(returnTo);
            router.refresh();
          } catch {
            setSignInError(
              "We couldn't sign you in. Check your email and password, then try again.",
            );
          }
        })}
      >
        <p className="text-lg font-semibold">Sign in</p>
        {signInError ? (
          <p aria-live="polite" className={formErrorClass}>
            {signInError}
          </p>
        ) : null}
        <input
          aria-invalid={Boolean(signInForm.formState.errors.email)}
          autoComplete="email"
          className={inputClass}
          placeholder="Email"
          type="email"
          {...signInForm.register("email")}
        />
        {signInForm.formState.errors.email?.message ? (
          <p className={fieldErrorClass}>
            {signInForm.formState.errors.email.message}
          </p>
        ) : null}
        <input
          aria-invalid={Boolean(signInForm.formState.errors.password)}
          autoComplete="current-password"
          className={inputClass}
          placeholder="Password"
          type="password"
          {...signInForm.register("password")}
        />
        {signInForm.formState.errors.password?.message ? (
          <p className={fieldErrorClass}>
            {signInForm.formState.errors.password.message}
          </p>
        ) : null}
        <button
          className={buttonClass}
          disabled={signInSubmitting}
          type="submit"
        >
          {signInSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <form
        className="flex flex-col gap-3 border-t border-store-border pt-6"
        onSubmit={signUpForm.handleSubmit(async (data) => {
          setSignUpError(null);

          try {
            await authClient.signUp.email(data, { throw: true });
            router.replace(`/${locale}/customer-area`);
            router.refresh();
          } catch {
            setSignUpError(
              "We couldn't create your account. Try another email address or try again in a moment.",
            );
          }
        })}
      >
        <p className="text-lg font-semibold">Create account</p>
        {signUpError ? (
          <p aria-live="polite" className={formErrorClass}>
            {signUpError}
          </p>
        ) : null}
        <input
          aria-invalid={Boolean(signUpForm.formState.errors.name)}
          autoComplete="name"
          className={inputClass}
          placeholder="Name"
          type="text"
          {...signUpForm.register("name")}
        />
        {signUpForm.formState.errors.name?.message ? (
          <p className={fieldErrorClass}>
            {signUpForm.formState.errors.name.message}
          </p>
        ) : null}
        <input
          aria-invalid={Boolean(signUpForm.formState.errors.email)}
          autoComplete="email"
          className={inputClass}
          placeholder="Email"
          type="email"
          {...signUpForm.register("email")}
        />
        {signUpForm.formState.errors.email?.message ? (
          <p className={fieldErrorClass}>
            {signUpForm.formState.errors.email.message}
          </p>
        ) : null}
        <input
          aria-invalid={Boolean(signUpForm.formState.errors.password)}
          autoComplete="new-password"
          className={inputClass}
          placeholder="Password (min. 8 characters)"
          type="password"
          {...signUpForm.register("password")}
        />
        {signUpForm.formState.errors.password?.message ? (
          <p className={fieldErrorClass}>
            {signUpForm.formState.errors.password.message}
          </p>
        ) : null}
        <button
          className={buttonClass}
          disabled={signUpSubmitting}
          type="submit"
        >
          {signUpSubmitting ? "Creating account..." : "Sign up"}
        </button>
      </form>
    </div>
  );
}

export function SignOutForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setError(null);
          setSubmitting(true);

          try {
            await authClient.signOut();
            router.replace("/");
            router.refresh();
          } catch {
            setError("We couldn't sign you out. Please try again.");
          } finally {
            setSubmitting(false);
          }
        })();
      }}
    >
      {error ? (
        <p aria-live="polite" className={`${formErrorClass} mb-3`}>
          {error}
        </p>
      ) : null}
      <button
        className={`${buttonClass} no-underline`}
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Signing out..." : "Sign out"}
      </button>
    </form>
  );
}
