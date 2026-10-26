/**
 * App-wide feedback: toast notifications and modal dialogs.
 * The modal is our own (no window.confirm), so it's styled, accessible and
 * doesn't block the page.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button, cx } from "./ui";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

const TONES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-400/10 text-emerald-900 dark:text-emerald-300" },
  error: { icon: XCircle, className: "border-red-200 dark:border-red-400/30 bg-red-50 dark:bg-red-400/10 text-red-900 dark:text-red-300" },
  info: { icon: Info, className: "border-border bg-card text-foreground" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++nextId.current;
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => {
          const { icon: Icon, className } = TONES[t.tone];
          return (
            <div key={t.id} className={cx("pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg", className)} role="status">
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * Modals render in a portal on <body>, outside the layout that sets the theme.
 * Layouts declare their theme here so dialogs match the page they open on.
 */
export const ThemeScope = createContext<"light" | "dark">("light");

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

/** Bottom sheet on phones, centred dialog on larger screens. Esc and backdrop close it. */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const theme = useContext(ThemeScope);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={cx("fixed inset-0 z-50 flex items-end justify-center text-foreground sm:items-center sm:p-4", theme === "dark" && "dark")} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-xl ring-1 ring-foreground/10 sm:rounded-2xl dark:bg-[#1e1e1e]/95 dark:ring-white/10 dark:backdrop-blur-md sm:dark:rounded-[20px]",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground/90" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, loading, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 text-sm text-muted-foreground">
        {danger && <AlertTriangle className="size-5 shrink-0 text-red-500" aria-hidden />}
        <div>{body}</div>
      </div>
    </Modal>
  );
}
