import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Flag, Info } from "lucide-react";
import {
  FLAG_TOOLTIP_AUTO_CLOSE_MS,
  FLAG_TOOLTIP_GAP_PX,
  FLAG_TOOLTIP_GUTTER_PX,
  FLAG_TOOLTIP_NARROW_MAX_PX,
  flagTooltipText,
  tooltipPlacement,
} from "@/lib/examFlagTooltip";

// The "Flag for review" button of a question with a tooltip that says what it does. Where a mouse can hover (a fine
// pointer) the tooltip shows above the button on hover and on keyboard focus; on a touch device (`@media (hover: none)`,
// whatever the width, so a touch tablet is touch and a touch laptop with a mouse is hover) a small (i) icon beside the
// button opens it on tap, and the button itself only flags. Under 640px the tooltip is as wide as the screen minus a 16px
// gutter; it opens below the button when there is no room above. Plain text, never HTML.
// The class names are written out in full (not built from pieces) so Tailwind finds them when it scans this file.
type Position = {
  placement: "above" | "below";
  narrow: boolean;
  style?: CSSProperties;
  arrowX?: number;
};

export default function FlagButton({
  flagged,
  disabled,
  onToggle,
}: {
  flagged: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const tooltipId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position>({
    placement: "above",
    narrow: false,
  });
  const text = flagTooltipText(flagged);

  // Where the tooltip goes, worked out from the button's place on the screen just before it shows.
  const measure = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const placement = tooltipPlacement(rect.top);
    const narrow = window.innerWidth <= FLAG_TOOLTIP_NARROW_MAX_PX;
    if (!narrow) return setPos({ placement, narrow });
    const style: CSSProperties =
      placement === "above"
        ? {
            left: FLAG_TOOLTIP_GUTTER_PX,
            right: FLAG_TOOLTIP_GUTTER_PX,
            bottom: window.innerHeight - rect.top + FLAG_TOOLTIP_GAP_PX,
          }
        : {
            left: FLAG_TOOLTIP_GUTTER_PX,
            right: FLAG_TOOLTIP_GUTTER_PX,
            top: rect.bottom + FLAG_TOOLTIP_GAP_PX,
          };
    setPos({
      placement,
      narrow,
      style,
      arrowX: rect.left + rect.width / 2 - FLAG_TOOLTIP_GUTTER_PX,
    });
  };

  // A tooltip opened by tapping closes on a tap elsewhere, on Escape and after a few seconds.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const timer = window.setTimeout(
      () => setOpen(false),
      FLAG_TOOLTIP_AUTO_CLOSE_MS,
    );
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const above = pos.placement === "above";
  const bubblePlace = pos.narrow
    ? "fixed"
    : `absolute right-0 w-72 ${above ? "bottom-full mb-2" : "top-full mt-2"}`;
  const visible = open
    ? "block"
    : "hidden [@media(hover:hover)_and_(pointer:fine)]:group-hover:block [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:block";
  const arrowPlace = pos.narrow
    ? above
      ? "-bottom-1"
      : "-top-1"
    : `right-6 ${above ? "-bottom-1" : "-top-1"}`;

  return (
    <div
      ref={wrapRef}
      className="group relative flex items-center gap-1"
      onPointerEnter={measure}
      onFocus={measure}
    >
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onToggle();
        }}
        disabled={disabled}
        aria-pressed={flagged}
        aria-describedby={tooltipId}
        ref={buttonRef}
        className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ring-1 ${
          flagged
            ? "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700"
            : "text-gray-600 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
        }`}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {/* One word on a phone, the full wording from the sm breakpoint up. */}
        <span className="sm:hidden">{flagged ? "Flagged" : "Flag"}</span>
        <span className="hidden sm:inline">
          {flagged ? "Flagged for review" : "Flag for review"}
        </span>
      </button>
      <button
        type="button"
        aria-label="What does Flag for review do?"
        aria-expanded={open}
        aria-controls={tooltipId}
        onClick={() => {
          if (!open) measure();
          setOpen((o) => !o);
        }}
        className="hidden [@media(hover:none)]:inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 dark:text-gray-400"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        style={pos.narrow ? pos.style : undefined}
        className={`pointer-events-none z-30 rounded-md bg-gray-900 p-3 text-left text-xs font-normal leading-snug text-white shadow-lg dark:bg-gray-100 dark:text-gray-900 ${bubblePlace} ${visible}`}
      >
        <span className="block">{text.what}</span>
        <span className="mt-1 block opacity-80">{text.state}</span>
        <span
          aria-hidden="true"
          style={
            pos.narrow && pos.arrowX !== undefined
              ? { left: pos.arrowX - 4 }
              : undefined
          }
          className={`absolute h-2 w-2 rotate-45 bg-gray-900 dark:bg-gray-100 ${arrowPlace}`}
        />
      </div>
    </div>
  );
}
