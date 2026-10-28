import { describe, expect, it } from 'vitest';
import { createSwipeTracker } from '../swipeTracker';

// Following one finger from touching the screen to leaving it: whether that was a swipe, and which way.

const down = (x = 200, y = 300, t = 0, id = 1, blocked = false) => ({ id, x, y, t, blocked });
const up = (x: number, y: number, t: number, id = 1) => ({ id, x, y, t });

describe('a swipe', () => {
  it('to the left is next, and to the right is previous', () => {
    const tracker = createSwipeTracker();
    tracker.down(down(200, 300, 0));
    expect(tracker.up(up(80, 305, 250))).toBe('next');
    tracker.down(down(80, 300, 1000));
    expect(tracker.up(up(200, 295, 1250))).toBe('prev');
  });

  it('follows the limits of a deliberate one: far enough, mostly sideways, quick', () => {
    const tracker = createSwipeTracker();
    tracker.down(down(200, 300, 0));
    expect(tracker.up(up(150, 300, 200)), 'too short').toBeNull();
    tracker.down(down(200, 300, 0));
    expect(tracker.up(up(100, 450, 200)), 'more down than across').toBeNull();
    tracker.down(down(200, 300, 0));
    expect(tracker.up(up(100, 300, 900)), 'too slow').toBeNull();
  });

  it('can be made again straight after one that did not count', () => {
    const tracker = createSwipeTracker();
    tracker.down(down(200, 300, 0));
    tracker.up(up(190, 300, 100));
    tracker.down(down(200, 300, 500));
    expect(tracker.up(up(100, 300, 700))).toBe('next');
  });
});

describe('a gesture that is not a swipe', () => {
  it('is ignored when the touch began where a swipe must not count', () => {
    const tracker = createSwipeTracker();
    tracker.down(down(200, 300, 0, 1, true));
    expect(tracker.up(up(60, 300, 200))).toBeNull();
    tracker.down(down(200, 300, 500));
    expect(tracker.up(up(60, 300, 700)), 'the next touch is free of it').toBe('next');
  });

  it('is ignored when a second finger lands: that is a pinch', () => {
    const tracker = createSwipeTracker();
    tracker.down(down(200, 300, 0, 1));
    tracker.down(down(220, 320, 50, 2));
    expect(tracker.up(up(60, 300, 200, 2))).toBeNull();
    expect(tracker.up(up(60, 300, 220, 1))).toBeNull();
    tracker.down(down(200, 300, 800, 3));
    expect(tracker.up(up(60, 300, 1000, 3))).toBe('next');
  });

  it('is ignored when the browser takes it over', () => {
    const tracker = createSwipeTracker();
    tracker.down(down(200, 300, 0));
    tracker.cancel(1);
    expect(tracker.up(up(60, 300, 200))).toBeNull();
  });

  it('is ignored when another pointer is cancelled, or there was no start', () => {
    const tracker = createSwipeTracker();
    expect(tracker.up(up(60, 300, 200))).toBeNull();
    tracker.down(down(200, 300, 0, 1));
    tracker.cancel(9);
    expect(tracker.up(up(60, 300, 200, 1))).toBe('next');
  });

  it('is ignored when a different finger leaves', () => {
    const tracker = createSwipeTracker();
    tracker.down(down(200, 300, 0, 1));
    expect(tracker.up(up(60, 300, 200, 7))).toBeNull();
  });
});
