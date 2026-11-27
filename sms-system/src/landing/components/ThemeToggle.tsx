import type { KeyboardEvent } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_PREFS,
  setThemePref,
  useThemePref,
  type ThemePref,
} from "../theme";
import { ui } from "../content";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

// Three-state theme switch (device, light, dark) as a radio group: Tab reaches the selected option, arrow keys move and
// choose, as screen-reader users expect of radios. Shown only with JavaScript (`js-only`); without it the page follows
// the device setting. 2.25rem targets with a mouse, 2.75rem (44px) on touch screens.
export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const pref = useThemePref();

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      e.key
    ];
    if (!step) return;
    e.preventDefault();
    const next =
      THEME_PREFS[
        (THEME_PREFS.indexOf(pref) + step + THEME_PREFS.length) %
          THEME_PREFS.length
      ];
    setThemePref(next);
    e.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)
      ?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ui.themeGroupLabel}
      className={`js-only on-glass inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2/80 p-0.5 ${className}`}
    >
      {THEME_PREFS.map((value: ThemePref) => {
        const Icon = ICONS[value];
        const checked = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={ui.themeOptions[value]}
            title={ui.themeOptions[value]}
            data-value={value}
            tabIndex={checked ? 0 : -1}
            onClick={() => setThemePref(value)}
            onKeyDown={onKeyDown}
            className={`grid size-9 place-items-center rounded-full coarse:size-11 ${
              checked
                ? "bg-primary text-on-primary"
                : "text-muted hover:text-fg"
            }`}
          >
            <Icon className="size-[1.1em]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
