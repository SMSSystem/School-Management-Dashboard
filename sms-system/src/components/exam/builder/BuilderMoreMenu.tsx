import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { SECONDARY_BUTTON_CLS } from "./builderStyles";

/** An item that is off (`disabled`) cannot be chosen and says why in its tooltip (`title`). */
export type MoreMenuItem = { label: string; icon?: React.ReactNode; onClick?: () => void; to?: string; disabled?: boolean; title?: string };

const ITEM_CLS =
  "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-gray-800 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700";
const OFF_CLS = " cursor-not-allowed opacity-50 hover:bg-transparent dark:hover:bg-transparent";

// A toolbar's secondary buttons (the builder's Import from file, Preview as student and Results; the results page's Export CSV and
// the like) behind one "More" button, for a
// phone, where all of them side by side would crowd out Save and the status buttons. Opens a small menu under the button;
// Escape, a tap outside or choosing an item closes it. An item is a button or a link (a link goes through the
// unsaved-changes guard like any other).
export default function BuilderMoreMenu({ items }: { items: readonly MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={`${SECONDARY_BUTTON_CLS} min-h-11`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> More
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          {items.map((item) =>
            item.to ? (
              <Link key={item.label} to={item.to} role="menuitem" className={ITEM_CLS} onClick={() => setOpen(false)}>
                {item.icon} {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={ITEM_CLS + (item.disabled ? OFF_CLS : "")}
                aria-disabled={item.disabled || undefined}
                title={item.title}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.icon} {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
