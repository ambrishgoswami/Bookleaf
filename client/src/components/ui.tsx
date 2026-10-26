/**
 * Shared UI primitives (shadcn-style, semantic tokens only). They render
 * correctly in both the light admin theme and the dark author theme.
 */
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Inbox, Loader2 } from "lucide-react";
import type { TicketPriority, TicketStatus } from "../lib/types";

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/85",
  secondary: "border-border bg-background shadow-xs hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
  brand: "bg-brand font-display text-[15px] font-semibold text-brand-foreground hover:bg-brand/90",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={cx(
        "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-all outline-none select-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
        VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold text-foreground">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <p className="mt-2 text-sm text-foreground">{error instanceof Error ? error.message : "Something went wrong."}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Badge({ className, children, title }: { className?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx("inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap [&>svg]:size-3", className)}
    >
      {children}
    </span>
  );
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  IN_PROGRESS: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300",
  RESOLVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  CLOSED: "bg-muted text-muted-foreground",
};

export const StatusBadge = ({ status }: { status: TicketStatus }) => <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>;

export const PRIORITY_LABELS: Record<TicketPriority, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300",
  MEDIUM: "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20",
  LOW: "bg-muted text-muted-foreground",
};

export const PriorityBadge = ({ priority }: { priority: TicketPriority | null }) =>
  priority ? <Badge className={PRIORITY_STYLES[priority]}>{PRIORITY_LABELS[priority]}</Badge> : <Badge className="bg-muted text-muted-foreground">Triaging…</Badge>;

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const control =
  "block w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive dark:bg-input/30";

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(control, "h-9", className)} {...props} />;
export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx(control, "min-h-28", className)} {...props} />;
export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cx(control, "h-9 cursor-pointer [&>option]:bg-popover [&>option]:text-popover-foreground", className)} {...props} />
);

// ---------------------------------------------------------------------------
// Password field with show/hide
// ---------------------------------------------------------------------------

export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input type={visible ? "text" : "password"} className={cx(control, "h-9 pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Back navigation
// ---------------------------------------------------------------------------

/**
 * Goes back in history when there is somewhere to go back to inside the app;
 * otherwise (deep link, new tab) goes to `fallback`.
 */
export function BackButton({ fallback, label = "Back", className }: { fallback: string; label?: string; className?: string }) {
  const navigate = useNavigate();
  const canGoBack = typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}
      className={cx("mb-4 inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground", className)}
    >
      <ArrowLeft className="size-4" aria-hidden /> {label}
    </button>
  );
}
