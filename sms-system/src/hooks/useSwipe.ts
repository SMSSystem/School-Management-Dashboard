import { useEffect, useRef } from "react";
import type { SwipeDirection } from "@/lib/examCarousel";
import { createSwipeTracker } from "@/lib/swipeTracker";

// A swipe on an element, from the pointer events of a finger or a pen (a mouse drag does nothing). It never calls
// preventDefault: the page still scrolls, and the element's `touch-action: pan-y` lets the browser take a mostly vertical
// movement (which then ends as a cancel, not a swipe) while a sideways one reaches this. A touch that begins inside a dialog
// does not count, so a picture zoom over an exam does not change the question, unless `insideDialog` says the swiping
// element is itself in that dialog (the rubric view). Two fingers (a pinch) do not count either. The rules are in
// lib/swipeTracker.ts.
export function useSwipe<T extends HTMLElement>(
  onSwipe: (direction: SwipeDirection) => void,
  enabled: boolean,
  { insideDialog = false }: { insideDialog?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const handler = useRef(onSwipe);
  useEffect(() => {
    handler.current = onSwipe;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const tracker = createSwipeTracker();
    const byFinger = (e: PointerEvent) =>
      e.pointerType === "touch" || e.pointerType === "pen";
    const down = (e: PointerEvent) => {
      if (!byFinger(e)) return;
      const blocked =
        !insideDialog &&
        !!(e.target as Element | null)?.closest?.('[role="dialog"]');
      tracker.down({
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        blocked,
      });
    };
    const up = (e: PointerEvent) => {
      if (!byFinger(e)) return;
      const direction = tracker.up({
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
      });
      if (direction) handler.current(direction);
    };
    const cancel = (e: PointerEvent) => tracker.cancel(e.pointerId);
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", cancel);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", cancel);
    };
  }, [enabled, insideDialog]);

  return ref;
}
