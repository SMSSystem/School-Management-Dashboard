import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// The frame the results screen's dialogs share: a dimmed page, a labelled dialog that closes on Escape or the X, the
// focus placed on the first control once when it opens and kept inside with Tab, and given back to what had it when it
// closes. The close handler is read through a ref, so a parent that makes a new one on every render does not move the
// focus back to the first field while someone is typing.
export default function DialogShell({
  title,
  onClose,
  busy = false,
  wide = false,
  sheet = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  /** A wider box, for a picture. */
  wide?: boolean;
  /** Rises from the bottom of the screen, as a phone's sheet does (the exam's list of questions). */
  sheet?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input, textarea, button:not([aria-label='Close'])")?.focus();
    return () => before?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeRef.current();
      if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>("input, textarea, select, button, a[href]")].filter((el) => !el.hasAttribute("disabled"));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy]);

  return (
    <div className={`fixed inset-0 z-50 flex justify-center bg-black/60 ${sheet ? "items-end" : "items-center p-4"}`}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          sheet
            ? "relative flex max-h-[85dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] dark:bg-gray-800"
            : wide
            ? "relative flex max-h-[90dvh] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-md bg-white p-5 dark:bg-gray-800"
            : "relative flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-md bg-white p-5 dark:bg-gray-800"
        }
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
