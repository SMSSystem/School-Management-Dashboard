import { useEffect } from "react";

function supportsHasSelector(): boolean {
  try {
    return (
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("selector(:has(*))")
    );
  } catch {
    return false;
  }
}

/**
 * Lets position:sticky work on the exam attempt screen in a browser without CSS :has() (Safari before 15.4, Chrome
 * before 105, Firefox before 121). The tour wrapper around every dashboard page (#main-viewport) is overflow:hidden
 * inline, which stops anything inside it from sticking; index.css clips it instead when an attempt is on the page, using
 * :has(). Where :has() is missing, this does the same from script while the screen is mounted and puts it back after.
 * Where :has() works it does nothing.
 */
export function useStickyViewport(): void {
  useEffect(() => {
    if (supportsHasSelector()) return;
    const viewport = document.getElementById("main-viewport");
    if (!viewport) return;
    const before = viewport.style.overflow;
    viewport.style.overflow = "visible";
    return () => {
      viewport.style.overflow = before;
    };
  }, []);
}
