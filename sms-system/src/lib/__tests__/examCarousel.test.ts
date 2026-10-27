import { describe, expect, it } from 'vitest';
import { clampIndex, inCarouselViewport, positionText, slideClassName, slideDirection, stepFrom, stripText, SWIPE, swipeDirection, swipeTarget } from '../examCarousel';

// The arithmetic of the question carousel: steps, swipes, the position text, the slide and the layout's window sizes.

describe('keeping an index inside the list', () => {
  it('clamps to the first and last question', () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(2, 5)).toBe(2);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2.7, 5)).toBe(2);
  });

  it('gives 0 for an empty list or a number that is not one', () => {
    expect(clampIndex(3, 0)).toBe(0);
    expect(clampIndex(Number.NaN, 5)).toBe(0);
    expect(clampIndex(Number.POSITIVE_INFINITY, 5)).toBe(0);
  });

  it('steps by a delta and stops at the ends', () => {
    expect(stepFrom(2, 1, 5)).toBe(3);
    expect(stepFrom(2, -1, 5)).toBe(1);
    expect(stepFrom(0, -1, 5)).toBe(0);
    expect(stepFrom(4, 1, 5)).toBe(4);
  });
});

describe('the position text', () => {
  it('counts from 1 and stays inside the list', () => {
    expect(positionText(2, 20)).toBe('Question 3 of 20');
    expect(positionText(99, 20)).toBe('Question 20 of 20');
  });

  it('adds how many are answered on the strip', () => {
    expect(stripText(2, 20, 12)).toBe('Question 3 of 20 · 12 answered');
    expect(stripText(0, 1, 0)).toBe('Question 1 of 1 · 0 answered');
  });
});

describe('what counts as a swipe', () => {
  const swipe = (dx: number, dy = 0, ms = 200) => swipeDirection({ dx, dy, ms });

  it('has the deliberate limits', () => {
    expect(SWIPE).toEqual({ minPx: 64, ratio: 2, maxMs: 800 });
  });

  it('moving the finger left is next and right is previous', () => {
    expect(swipe(-120)).toBe('next');
    expect(swipe(120)).toBe('prev');
  });

  it('needs at least 64 px', () => {
    expect(swipe(-63)).toBeNull();
    expect(swipe(-64)).toBe('next');
    expect(swipe(63)).toBeNull();
    expect(swipe(64)).toBe('prev');
  });

  it('needs to be mostly sideways: twice the vertical movement', () => {
    expect(swipe(-100, 51)).toBeNull();
    expect(swipe(-100, 50)).toBe('next');
    expect(swipe(-80, 80)).toBeNull();
    expect(swipe(-5, 200)).toBeNull();
  });

  it('needs to be quick: within 800 ms', () => {
    expect(swipe(-100, 0, 800)).toBe('next');
    expect(swipe(-100, 0, 801)).toBeNull();
  });

  it('ignores numbers that are not numbers', () => {
    expect(swipe(Number.NaN)).toBeNull();
    expect(swipeDirection({ dx: -100, dy: 0, ms: Number.NaN })).toBeNull();
  });
});

describe('where a swipe leads', () => {
  const at = (index: number, extra: Partial<{ total: number; forwardOnly: boolean; currentAnswered: boolean }> = {}) => ({
    index,
    total: 5,
    forwardOnly: false,
    currentAnswered: false,
    ...extra,
  });

  it('goes one question either way in a free exam, answered or not', () => {
    expect(swipeTarget('next', at(2))).toBe(3);
    expect(swipeTarget('prev', at(2))).toBe(1);
  });

  it('goes nowhere past the ends, or without a direction', () => {
    expect(swipeTarget('prev', at(0))).toBeNull();
    expect(swipeTarget('next', at(4))).toBeNull();
    expect(swipeTarget(null, at(2))).toBeNull();
  });

  it('never goes back in a forward-only exam', () => {
    expect(swipeTarget('prev', at(2, { forwardOnly: true, currentAnswered: true }))).toBeNull();
  });

  it('goes forward in a forward-only exam only once the question is answered', () => {
    expect(swipeTarget('next', at(2, { forwardOnly: true, currentAnswered: false }))).toBeNull();
    expect(swipeTarget('next', at(2, { forwardOnly: true, currentAnswered: true }))).toBe(3);
  });
});

describe('how the slide moves', () => {
  it('slides forward and back for a single step', () => {
    expect(slideDirection(2, 3)).toBe('forward');
    expect(slideDirection(3, 2)).toBe('back');
  });

  it('only fades for a longer jump, and does nothing for the same question', () => {
    expect(slideDirection(0, 7)).toBe('jump');
    expect(slideDirection(7, 0)).toBe('jump');
    expect(slideDirection(4, 4)).toBe('none');
  });
});

describe('the class of a slide', () => {
  it('is one for each way the slide moves, and none when there is no slide', () => {
    expect(slideClassName('forward')).toBe('exam-slide-forward');
    expect(slideClassName('back')).toBe('exam-slide-back');
    expect(slideClassName('jump')).toBe('exam-slide-fade');
    expect(slideClassName('none')).toBe('');
  });
});

describe('the windows that get the carousel layout', () => {
  const cases: [string, { width: number; portrait: boolean }, boolean][] = [
    ['a phone upright (390x844)', { width: 390, portrait: true }, true],
    ['a phone on its side (844x390)', { width: 844, portrait: false }, true],
    ['a tablet upright (768x1024)', { width: 768, portrait: true }, true],
    ['a window 1023 wide, landscape', { width: 1023, portrait: false }, true],
    ['a window 1024 wide, landscape', { width: 1024, portrait: false }, false],
    ['a tablet on its side (1024x768)', { width: 1024, portrait: false }, false],
    ['a large tablet upright (1024x1366)', { width: 1024, portrait: true }, true],
    ['a window 1279 wide, upright', { width: 1279, portrait: true }, true],
    ['a window 1280 wide, upright', { width: 1280, portrait: true }, false],
    ['a laptop (1280x800)', { width: 1280, portrait: false }, false],
    ['a desktop (1440x900)', { width: 1440, portrait: false }, false],
    ['a rotated monitor (1440 wide, upright)', { width: 1440, portrait: true }, false],
  ];
  it.each(cases)('%s', (_name, view, expected) => {
    expect(inCarouselViewport(view)).toBe(expected);
  });
});
