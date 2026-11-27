import { useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import Brand from "./Brand";
import DemoLink from "./DemoLink";
import ThemeToggle from "./ThemeToggle";
import { LOGIN_URL, nav, ui } from "../content";

// The fixed header. Without JavaScript (and whenever the page is scrolled) it is one readable glass pill. With
// JavaScript, at the very top of the page, `data-at-top` splits it apart over the dark hero (styles in landing.css,
// "Header"), like deriv.be's header.
//
// Below 64rem the links live in a native <details> menu: it opens without JavaScript, and screen readers announce the
// summary as an expandable button. With JavaScript it also closes on Escape (focus returns to the button), when a link
// is chosen, and when the window grows to desktop width.
export default function Header({ atTop }: { atTop: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (refocus: boolean) => {
      const el = menu.current;
      if (!el?.open) return;
      el.open = false;
      if (refocus) el.querySelector("summary")?.focus();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onWide = () => desktop.matches && close(false);
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onWide);
    };
  }, []);

  const closeMenu = () => {
    if (menu.current) menu.current.open = false;
  };

  return (
    <header
      className="ld-header fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 lg:px-4 lg:pt-4"
      data-at-top={atTop}
    >
      <div className="ld-header-bar glass flex w-full items-center justify-between gap-4 rounded-full py-1.5 pr-2 pl-3">
        <Brand />

        {/* Desktop */}
        <nav
          aria-label={ui.mainNavLabel}
          className="ld-header-nav on-glass hidden items-center gap-1 rounded-full px-1.5 py-1 font-ui lg:flex"
        >
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 font-medium text-fg transition-colors duration-200 hover:bg-surface-3"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
          <a
            href={LOGIN_URL}
            className="inline-flex min-h-11 items-center rounded-full border-2 whitespace-nowrap border-[var(--hdr-fg)] px-4 font-ui text-sm font-bold text-[var(--hdr-fg)] transition-colors duration-100 hover:bg-[color-mix(in_srgb,var(--hdr-fg)_10%,transparent)] lg:px-5"
          >
            {ui.login}
          </a>
          <DemoLink className="hidden min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 font-ui text-sm font-bold text-on-primary transition-colors duration-100 hover:bg-primary-hover lg:inline-flex" />

          {/* Phones and tablets */}
          <details ref={menu} className="ld-menu lg:hidden">
            <summary
              aria-label={ui.menuOpen}
              className="grid size-11 cursor-pointer place-items-center rounded-full text-[var(--hdr-fg)] [details[open]_&]:bg-surface-3 [details[open]_&]:text-fg"
            >
              <Menu
                className="size-6 [details[open]_&]:hidden"
                aria-hidden="true"
              />
              <X
                className="hidden size-6 [details[open]_&]:block"
                aria-hidden="true"
              />
            </summary>
            <div
              aria-label={ui.menuLabel}
              role="region"
              className="on-glass fixed inset-x-3 top-[4.75rem] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-line bg-surface-2 p-5 shadow-2xl"
            >
              <nav aria-label={ui.mainNavLabel} className="flex flex-col">
                {nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className="flex min-h-12 items-center border-b border-line font-ui text-lg font-semibold text-fg"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="js-only mt-5 flex items-center justify-between gap-3">
                <span className="font-ui text-sm text-muted">
                  {ui.themeLabel}
                </span>
                <ThemeToggle />
              </div>
              <DemoLink className="mt-5 flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-primary font-ui font-bold text-on-primary" />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
