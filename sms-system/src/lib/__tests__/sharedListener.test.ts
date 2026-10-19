import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createListenerRegistry } from '../sharedListener';

// The shared listener registry: one open listener per query, reference counted, kept open for a while after the last
// subscriber leaves, closed on error and on clear.

const KEEP = 1000;
const same = (a: unknown, b: unknown) => a === b;

// A fake Firestore listener: records opens and closes, and lets a test push snapshots or an error.
function fakeSource() {
  const opens: { next: (v: number) => void; fail: (e: unknown) => void; closed: boolean }[] = [];
  const open = (next: (v: number) => void, fail: (e: unknown) => void) => {
    const handle = { next, fail, closed: false };
    opens.push(handle);
    return () => {
      handle.closed = true;
    };
  };
  return { opens, open };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createListenerRegistry', () => {
  it('opens one listener for two subscribers and gives both every snapshot', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const a = vi.fn();
    const b = vi.fn();
    reg.subscribe('k', 'q', same, src.open, a);
    reg.subscribe('k', 'q', same, src.open, b);
    expect(src.opens).toHaveLength(1);
    src.opens[0].next(1);
    src.opens[0].next(2);
    expect(a.mock.calls).toEqual([[1], [2]]);
    expect(b.mock.calls).toEqual([[1], [2]]);
  });

  it('replays the last snapshot to a late subscriber at once', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    reg.subscribe('k', 'q', same, src.open, () => undefined);
    src.opens[0].next(7);
    const late = vi.fn();
    reg.subscribe('k', 'q', same, src.open, late);
    expect(late).toHaveBeenCalledWith(7);
    expect(src.opens).toHaveLength(1);
  });

  it('keeps the listener open after the last subscriber leaves, and reuses it inside the window', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const off = reg.subscribe('k', 'q', same, src.open, () => undefined);
    src.opens[0].next(1);
    off();
    vi.advanceTimersByTime(KEEP - 1);
    expect(src.opens[0].closed).toBe(false);
    const again = vi.fn();
    reg.subscribe('k', 'q', same, src.open, again);
    expect(again).toHaveBeenCalledWith(1); // no new open, no new read
    expect(src.opens).toHaveLength(1);
    vi.advanceTimersByTime(KEEP * 5);
    expect(src.opens[0].closed).toBe(false); // someone is subscribed again: the old timer must not close it
  });

  it('closes the listener when the window passes with no subscriber, and opens a new one next time', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const off = reg.subscribe('k', 'q', same, src.open, () => undefined);
    off();
    vi.advanceTimersByTime(KEEP);
    expect(src.opens[0].closed).toBe(true);
    expect(reg.size()).toBe(0);
    reg.subscribe('k', 'q', same, src.open, () => undefined);
    expect(src.opens).toHaveLength(2);
  });

  it('ignores a second unsubscribe', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const a = reg.subscribe('k', 'q', same, src.open, () => undefined);
    reg.subscribe('k', 'q', same, src.open, () => undefined);
    a();
    a();
    vi.advanceTimersByTime(KEEP * 2);
    expect(src.opens[0].closed).toBe(false); // the other subscriber is still there
  });

  it('keeps different keys apart', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const a = vi.fn();
    const b = vi.fn();
    reg.subscribe('classes', 'q1', same, src.open, a);
    reg.subscribe('exams', 'q2', same, src.open, b);
    expect(src.opens).toHaveLength(2);
    src.opens[0].next(1);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('gives a key asked for with a different subject a private listener, and leaves the shared one alone', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const shared = vi.fn();
    const other = vi.fn();
    reg.subscribe('k', 'query-A', same, src.open, shared);
    const offOther = reg.subscribe('k', 'query-B', same, src.open, other);
    expect(src.opens).toHaveLength(2);
    src.opens[1].next(9);
    expect(other).toHaveBeenCalledWith(9);
    expect(shared).not.toHaveBeenCalled(); // never another query's data
    offOther();
    expect(src.opens[1].closed).toBe(true); // a private listener ends with its subscriber
    expect(src.opens[0].closed).toBe(false);
  });

  it('delivers an error to every subscriber, forgets the listener and opens a new one on the next visit', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const e1 = vi.fn();
    const e2 = vi.fn();
    reg.subscribe('k', 'q', same, src.open, () => undefined, e1);
    reg.subscribe('k', 'q', same, src.open, () => undefined, e2);
    src.opens[0].fail(new Error('denied'));
    expect(e1).toHaveBeenCalledTimes(1);
    expect(e2).toHaveBeenCalledTimes(1);
    expect(src.opens[0].closed).toBe(true);
    expect(reg.size()).toBe(0);
    reg.subscribe('k', 'q', same, src.open, () => undefined);
    expect(src.opens).toHaveLength(2);
  });

  it('clear() closes everything and forgets the snapshots', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const src = fakeSource();
    const a = vi.fn();
    reg.subscribe('one', 'q', same, src.open, a);
    const off = reg.subscribe('two', 'q', same, src.open, () => undefined);
    src.opens[0].next(1);
    off(); // 'two' is waiting out its window
    reg.clear();
    expect(src.opens.every((o) => o.closed)).toBe(true);
    expect(reg.size()).toBe(0);
    const late = vi.fn();
    reg.subscribe('one', 'q', same, src.open, late);
    expect(late).not.toHaveBeenCalled(); // nothing is replayed from before the clear
    expect(src.opens).toHaveLength(3);
    vi.advanceTimersByTime(KEEP * 3); // the old timers must not fire into the new entries
    expect(src.opens[2].closed).toBe(false);
  });

  it('survives a listener that fails to close', () => {
    const reg = createListenerRegistry({ keepOpenMs: KEEP });
    const off = reg.subscribe('k', 'q', same, () => () => {
      throw new Error('already closed');
    }, () => undefined);
    off();
    expect(() => vi.advanceTimersByTime(KEEP)).not.toThrow();
    expect(() => reg.clear()).not.toThrow();
  });
});
