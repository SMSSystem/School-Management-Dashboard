import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "info" | "warning" | "error" | "success";

export type ToastOptions = {
  message: string;
  variant?: ToastVariant;
  /**
   * Auto-dismiss after this many ms. Optional — if omitted, defaults to
   * DEFAULT_DURATION_MS for info/error/success toasts, or stays sticky
   * (no auto-dismiss) for variant "warning", since the one warning-variant
   * caller today (the auto-logout countdown) needs to persist until the
   * user acts or the timeout fires. Pass durationMs explicitly to override
   * either default in either direction.
   */
  durationMs?: number;
};

type ToastItem = ToastOptions & { id: string };

type ToastContextValue = {
  showToast: (options: ToastOptions) => string;
  updateToast: (id: string, patch: Partial<ToastOptions>) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Default auto-dismiss for info/error/success toasts when a caller doesn't
// pass durationMs. "warning" toasts default to sticky instead (see
// resolveDurationMs) since the auto-logout countdown — today's only
// warning-variant caller — needs to persist across many seconds, not
// vanish on a fixed timer unrelated to the countdown itself.
const DEFAULT_DURATION_MS = 5000;

const resolveDurationMs = (options: ToastOptions): number | undefined => {
  if (options.durationMs !== undefined) return options.durationMs;
  return options.variant === "warning" ? undefined : DEFAULT_DURATION_MS;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = crypto.randomUUID();
      const durationMs = resolveDurationMs(options);
      setToasts((prev) => [...prev, { ...options, id }]);
      if (durationMs) {
        timers.current.set(id, setTimeout(() => dismissToast(id), durationMs));
      }
      return id;
    },
    [dismissToast],
  );

  const updateToast = useCallback(
    (id: string, patch: Partial<ToastOptions>) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast, updateToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: "border-sky-500",
  warning: "border-amber-500",
  error: "border-red-500",
  success: "border-emerald-500",
};

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-100 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 rounded-md border-l-4 bg-white dark:bg-gray-800 shadow-lg p-3 text-sm text-gray-800 dark:text-gray-100 ${VARIANT_STYLES[t.variant ?? "info"]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            title="Dismiss"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
