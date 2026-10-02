import { describe, expect, it } from 'vitest';
import {
  currentCursor,
  initialPageState,
  pageFetchLimit,
  pageReducer,
  trimPage,
  type PageState,
} from '../cursorPaging';

type S = PageState<string>;
const start = (key = 'k'): S => initialPageState<string>(key);

describe('pageReducer', () => {
  it('starts on page 1 with no cursor', () => {
    const s = start();
    expect(s.pageIndex).toBe(0);
    expect(currentCursor(s)).toBeNull();
  });

  it('Next moves forward and remembers the cursor for that page', () => {
    const s = pageReducer(start(), { type: 'next', key: 'k', cursor: 'doc10' });
    expect(s.pageIndex).toBe(1);
    expect(currentCursor(s)).toBe('doc10');
  });

  it('Previous returns to the earlier page and its cursor', () => {
    let s = pageReducer(start(), { type: 'next', key: 'k', cursor: 'doc10' });
    s = pageReducer(s, { type: 'next', key: 'k', cursor: 'doc20' });
    s = pageReducer(s, { type: 'previous', key: 'k' });
    expect(s.pageIndex).toBe(1);
    expect(currentCursor(s)).toBe('doc10');
  });

  it('does not go before page 1', () => {
    const s = start();
    expect(pageReducer(s, { type: 'previous', key: 'k' })).toBe(s);
  });

  it('going Next again after Previous replaces the later cursors', () => {
    let s = pageReducer(start(), { type: 'next', key: 'k', cursor: 'a' });
    s = pageReducer(s, { type: 'next', key: 'k', cursor: 'b' });
    s = pageReducer(s, { type: 'previous', key: 'k' });
    s = pageReducer(s, { type: 'next', key: 'k', cursor: 'b2' });
    expect(s.pageIndex).toBe(2);
    expect(currentCursor(s)).toBe('b2');
    expect(s.cursors).toEqual([null, 'a', 'b2']);
  });

  it('reset returns to page 1', () => {
    let s = pageReducer(start(), { type: 'next', key: 'k', cursor: 'a' });
    s = pageReducer(s, { type: 'reset', key: 'k' });
    expect(s.pageIndex).toBe(0);
    expect(currentCursor(s)).toBeNull();
  });

  it('an action for a different list (key changed) starts that list from page 1', () => {
    let s = pageReducer(start('inst-a'), { type: 'next', key: 'inst-a', cursor: 'a' });
    s = pageReducer(s, { type: 'next', key: 'inst-b', cursor: 'x' });
    expect(s.key).toBe('inst-b');
    expect(s.pageIndex).toBe(1);
    expect(s.cursors).toEqual([null, 'x']);
    // ...and nothing of the old list's cursors leaks in.
    expect(s.cursors).not.toContain('a');
  });
});

describe('page fetching', () => {
  it('asks for one more document than a page', () => {
    expect(pageFetchLimit(10)).toBe(11);
    expect(pageFetchLimit(20)).toBe(21);
  });

  it('shows a full page and offers Next when the extra document came back', () => {
    const { items, hasMore } = trimPage([1, 2, 3, 4], 3);
    expect(items).toEqual([1, 2, 3]);
    expect(hasMore).toBe(true);
  });

  it('offers no Next on a last page of exactly a page', () => {
    const { items, hasMore } = trimPage([1, 2, 3], 3);
    expect(items).toEqual([1, 2, 3]);
    expect(hasMore).toBe(false);
  });

  it('handles a short page and an empty result', () => {
    expect(trimPage([1], 3)).toEqual({ items: [1], hasMore: false });
    expect(trimPage([], 3)).toEqual({ items: [], hasMore: false });
  });
});
