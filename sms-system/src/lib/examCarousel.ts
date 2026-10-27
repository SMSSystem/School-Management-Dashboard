import { canGoTo } from './examTakeLogic';

// The arithmetic of the question carousel: which question a step or a
// swipe leads to, what the position strip says, how the slide moves, and when the carousel layout applies. Pure and
// DOM-free; the forward-only rule stays in examTakeLogic.canGoTo, which every move here goes through.

/** Keeps an index inside 0 to total - 1 (0 for an empty list). */
export function clampIndex(index: number, total: number): number {
  if (total <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

/** The index `delta` places from `index`, kept inside the list. */
export function stepFrom(index: number, delta: number, total: number): number {
  return clampIndex(index + delta, total);
}

/** "Question 3 of 20". */
export function positionText(index: number, total: number): string {
  return `Question ${clampIndex(index, total) + 1} of ${total}`;
}

/** "Question 3 of 20 · 12 answered", the compact strip. */
export function stripText(index: number, total: number, answered: number): string {
  return `${positionText(index, total)} · ${answered} answered`;
}

/** A deliberate swipe: far enough, mostly sideways, and quick. Constants in one place. */
export const SWIPE = { minPx: 64, ratio: 2, maxMs: 800 } as const;

export type SwipeDirection = 'next' | 'prev';

/** Reads a finished touch (distance moved and time taken). Moving the finger left goes to the next question. */
export function swipeDirection(move: { dx: number; dy: number; ms: number }): SwipeDirection | null {
  const { dx, dy, ms } = move;
  if (![dx, dy, ms].every(Number.isFinite) || ms > SWIPE.maxMs) return null;
  if (Math.abs(dx) < SWIPE.minPx || Math.abs(dx) < SWIPE.ratio * Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'prev';
}

/**
 * Where a swipe leads, or null when it leads nowhere (the end of the list, backwards in a forward-only exam, forwards past
 * an unanswered question of a forward-only exam).
 */
export function swipeTarget(
  direction: SwipeDirection | null,
  at: { index: number; total: number; forwardOnly: boolean; currentAnswered: boolean },
): number | null {
  if (!direction) return null;
  const target = at.index + (direction === 'next' ? 1 : -1);
  return canGoTo(at.index, target, at.forwardOnly, at.total, at.currentAnswered) ? target : null;
}

export type SlideDirection = 'forward' | 'back' | 'jump' | 'none';

/** How the slide moves between two questions: a step slides, a longer jump (from the list) only fades. */
export function slideDirection(from: number, to: number): SlideDirection {
  if (from === to) return 'none';
  if (Math.abs(to - from) > 1) return 'jump';
  return to > from ? 'forward' : 'back';
}

/** The class that makes a question slide in (the keyframes are in index.css); none when there is no slide. */
export function slideClassName(direction: SlideDirection): string {
  switch (direction) {
    case 'forward':
      return 'exam-slide-forward';
    case 'back':
      return 'exam-slide-back';
    case 'jump':
      return 'exam-slide-fade';
    default:
      return '';
  }
}

/**
 * Does the carousel layout apply to a window this size? Mirrors the media query
 * `(max-width: 1023px), (orientation: portrait) and (max-width: 1279px)`: anything narrower than 1024 px, and a portrait
 * window up to 1279 px (a tablet held upright), but not a rotated desktop monitor.
 */
export function inCarouselViewport(view: { width: number; portrait: boolean }): boolean {
  return view.width <= 1023 || (view.portrait && view.width <= 1279);
}
