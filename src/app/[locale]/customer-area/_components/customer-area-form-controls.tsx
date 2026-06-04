import type React from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

export const inputClass =
  "w-full border-b border-store-border bg-transparent px-0 py-2 text-sm text-store-ink outline-none transition placeholder:text-store-muted focus:border-store-accent focus:ring-2 focus:ring-store-accent/15";

export const textButtonClass =
  "w-fit text-sm font-semibold text-store-accent underline decoration-store-border underline-offset-4 transition hover:text-store-ink hover:decoration-store-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25 disabled:pointer-events-none disabled:opacity-60";

export const smallTextButtonClass =
  "text-xs font-semibold text-store-accent underline decoration-store-border underline-offset-4 transition hover:text-store-ink hover:decoration-store-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-store-accent/25 disabled:pointer-events-none disabled:opacity-60";

export function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-store-muted text-xs font-semibold tracking-[0.14em] uppercase">
        {label}
      </span>
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span className="mt-2 block text-sm text-red-700">{error}</span>
      ) : null}
    </label>
  );
}

export function Input({
  label,
  register,
  type = "text",
}: {
  label: string;
  register: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-store-muted mb-2 block text-xs font-semibold tracking-[0.14em] uppercase">
        {label}
      </span>
      <input className={inputClass} type={type} {...register} />
    </label>
  );
}
