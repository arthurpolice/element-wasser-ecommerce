import { type ReactNode } from "react";

export const dashInputClass =
  "w-full rounded-lg border border-dash-border bg-dash-surface px-3 py-2.5 text-sm text-dash-ink shadow-sm transition placeholder:text-dash-muted/70 focus:border-dash-accent focus:outline-none focus:ring-2 focus:ring-dash-accent/20";

export const dashSelectClass =
  "rounded-lg border border-dash-border bg-dash-surface px-3 py-2.5 text-sm text-dash-ink shadow-sm transition focus:border-dash-accent focus:outline-none focus:ring-2 focus:ring-dash-accent/20";

export const dashDialogClass =
  "fixed inset-0 m-auto h-fit max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] rounded-xl border border-dash-border bg-dash-surface p-0 text-dash-ink shadow-2xl shadow-dash-sidebar/20 backdrop:bg-dash-sidebar/50 backdrop:backdrop-blur-sm open:animate-[dash-fade-up_0.25s_ease-out_both]";

export const dashTableShellClass =
  "overflow-x-auto rounded-xl border border-dash-border bg-dash-surface shadow-sm";

export const dashTableClass = "min-w-full divide-y divide-dash-border text-sm";

export const dashTableHeadClass =
  "bg-[#f6f9fc] text-xs font-semibold uppercase tracking-wider text-dash-muted";

export const dashTableRowClass =
  "transition-colors hover:bg-[#f6f9fc]/80 focus-within:bg-[#f6f9fc]/80";

type DashboardButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function DashboardButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: DashboardButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dash-accent/40 disabled:pointer-events-none disabled:opacity-50";

  const variants = {
    primary:
      "bg-dash-sidebar text-white shadow-sm hover:bg-dash-sidebar-elevated active:scale-[0.98]",
    secondary:
      "border border-dash-border bg-dash-surface text-dash-ink shadow-sm hover:border-dash-accent/40 hover:bg-[#f6f9fc]",
    ghost:
      "text-dash-muted hover:bg-[#f6f9fc] hover:text-dash-ink",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

type DashboardPanelProps = {
  children: ReactNode;
  className?: string;
  variant?: "default" | "dashed" | "danger" | "loading";
};

export function DashboardPanel({
  children,
  className = "",
  variant = "default",
}: DashboardPanelProps) {
  const variants = {
    default: "border border-dash-border bg-dash-surface shadow-sm",
    dashed: "border border-dashed border-dash-border bg-dash-surface/60",
    danger: "border border-red-200 bg-dash-danger-bg text-dash-danger",
    loading:
      "border border-dash-border text-dash-muted bg-[linear-gradient(90deg,var(--color-dash-surface)_0%,#f1f5f9_50%,var(--color-dash-surface)_100%)] bg-[length:200%_100%] animate-[dash-shimmer_1.4s_ease-in-out_infinite]",
  };

  return (
    <div className={`rounded-xl p-8 text-sm ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}

type DashboardCardProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardCard({ children, className = "" }: DashboardCardProps) {
  return (
    <div
      className={`rounded-xl border border-dash-border bg-dash-surface p-5 shadow-sm transition hover:border-dash-accent/25 hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
}

type DashboardSectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function DashboardSectionHeader({
  title,
  description,
  action,
}: DashboardSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-dash-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-dash-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

type DashboardFieldLabelProps = {
  label: string;
  children: ReactNode;
  error?: string;
  className?: string;
};

export function DashboardFieldLabel({
  label,
  children,
  error,
  className = "",
}: DashboardFieldLabelProps) {
  return (
    <label className={`grid gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-dash-ink">{label}</span>
      {children}
      {error ? <span className="text-xs text-dash-danger">{error}</span> : null}
    </label>
  );
}
