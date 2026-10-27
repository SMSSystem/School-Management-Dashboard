import { swipeDirection, type SwipeDirection } from './examCarousel';

// Follows one finger from touching the screen to leaving it and says whether that was a swipe (examCarousel.swipeDirection
// holds the limits). A second finger spoils the gesture, because two fingers are a pinch, and so does a start that was
// blocked (on top of a dialog). Pure: the hook that listens to the browser passes in the numbers.

type Point = { id: number; x: number; y: number; t: number };

export function createSwipeTracker() {
  let start: Point | null = null;
  let spoiled = false;

  return {
    /** A pointer touched the screen. `blocked` is true when the touch began where a swipe must not count. */
    down(p: Point & { blocked: boolean }): void {
      if (start) {
        spoiled = true;
        return;
      }
      start = p;
      spoiled = p.blocked;
    },
    /** A pointer left the screen: the direction of the swipe, or null. */
    up(p: Point): SwipeDirection | null {
      if (!start || p.id !== start.id) return null;
      const from = start;
      const bad = spoiled;
      start = null;
      spoiled = false;
      return bad ? null : swipeDirection({ dx: p.x - from.x, dy: p.y - from.y, ms: p.t - from.t });
    },
    /** The browser took the gesture over (for example to scroll the page). */
    cancel(id: number): void {
      if (start && start.id === id) {
        start = null;
        spoiled = false;
      }
    },
  };
}
