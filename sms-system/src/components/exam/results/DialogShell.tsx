import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// The frame the results screen's dialogs share: a dimmed page, a labelled dialog that closes on Escape or the X, and
// the focus placed on the first control.
export default function DialogShell({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input, textarea, button:not([aria-label='Close'])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-md bg-white p-5 dark:bg-gray-800"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          title="Close"
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 id={titleId} className="pr-8 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
