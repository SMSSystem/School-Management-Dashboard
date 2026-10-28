import { describe, expect, it } from 'vitest';
import { watchLinks, watchUnload, type WatchEnv } from '../navigationGuardWatch';

// The listeners behind the unsaved-changes guard, on a document and window made for the test.

type Handler = (event: never) => void;
const fakeTarget = () => {
  const added: { type: string; handler: Handler; capture?: boolean }[] = [];
  const removed: { type: string; handler: Handler; capture?: boolean }[] = [];
  return {
    added,
    removed,
    addEventListener: (type: string, handler: Handler, capture?: boolean) => void added.push({ type, handler, capture }),
    removeEventListener: (type: string, handler: Handler, capture?: boolean) => void removed.push({ type, handler, capture }),
  };
};

const setup = () => {
  const doc = fakeTarget();
  const win = fakeTarget();
  const env = { document: doc, window: win, here: () => ({ origin: 'https://sms.example', path: '/dashboard/list/exams/e1/build' }) } as unknown as WatchEnv;
  return { doc, win, env };
};

type Anchor = { href: string; attrs?: Record<string, string> };
const anchorOf = ({ href, attrs = {} }: Anchor) => ({
  href,
  getAttribute: (name: string) => attrs[name] ?? null,
  hasAttribute: (name: string) => name in attrs,
});

// A click on `inside` (an element within an anchor, as an icon in a link is), or on nothing when no anchor is given.
const clickOn = (anchor: Anchor | null, over: Record<string, unknown> = {}) => {
  let prevented = false;
  const event = {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: { closest: (selector: string) => (selector === 'a[href]' && anchor ? anchorOf(anchor) : null) },
    preventDefault: () => {
      prevented = true;
    },
    ...over,
  };
  return { event, wasPrevented: () => prevented };
};

const fire = (handler: Handler, event: unknown) => (handler as (e: unknown) => void)(event);

describe('watching clicks on links', () => {
  it('listens on the document in the capture phase, before React sees the click', () => {
    const { doc, env } = setup();
    watchLinks(env, () => undefined);
    expect(doc.added).toHaveLength(1);
    expect(doc.added[0]).toMatchObject({ type: 'click', capture: true });
  });

  it('stops a plain click on a link to another page and says where it went', () => {
    const { doc, env } = setup();
    const asked: string[] = [];
    watchLinks(env, (to) => asked.push(to));
    const click = clickOn({ href: 'https://sms.example/dashboard/list/exams/e1/preview' });
    fire(doc.added[0].handler, click.event);
    expect(click.wasPrevented()).toBe(true);
    expect(asked).toEqual(['/dashboard/list/exams/e1/preview']);
  });

  it('leaves alone a click that is not on a link', () => {
    const { doc, env } = setup();
    const asked: string[] = [];
    watchLinks(env, (to) => asked.push(to));
    const click = clickOn(null);
    fire(doc.added[0].handler, click.event);
    expect(click.wasPrevented()).toBe(false);
    expect(asked).toEqual([]);
  });

  it('leaves alone a click that opens elsewhere or is not for this site', () => {
    const { doc, env } = setup();
    const asked: string[] = [];
    watchLinks(env, (to) => asked.push(to));
    const run = (anchor: Anchor, over: Record<string, unknown> = {}) => {
      const click = clickOn(anchor, over);
      fire(doc.added[0].handler, click.event);
      return click.wasPrevented();
    };
    const page = 'https://sms.example/dashboard';
    expect(run({ href: page }, { ctrlKey: true })).toBe(false);
    expect(run({ href: page }, { metaKey: true })).toBe(false);
    expect(run({ href: page }, { button: 1 })).toBe(false);
    expect(run({ href: page, attrs: { target: '_blank' } })).toBe(false);
    expect(run({ href: page, attrs: { download: '' } })).toBe(false);
    expect(run({ href: 'https://other.example/dashboard' })).toBe(false);
    expect(run({ href: 'mailto:teacher@school.example' })).toBe(false);
    expect(run({ href: 'https://sms.example/dashboard/list/exams/e1/build#top' })).toBe(false);
    expect(asked).toEqual([]);
  });

  it('stops listening when told to', () => {
    const { doc, env } = setup();
    const stop = watchLinks(env, () => undefined);
    stop();
    expect(doc.removed).toEqual([{ type: 'click', handler: doc.added[0].handler, capture: true }]);
  });
});

describe('watching the tab being closed', () => {
  it('asks the browser to confirm, and stops when told to', () => {
    const { win, env } = setup();
    const stop = watchUnload(env);
    expect(win.added).toHaveLength(1);
    expect(win.added[0].type).toBe('beforeunload');
    let prevented = false;
    fire(win.added[0].handler, { preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    stop();
    expect(win.removed).toEqual([{ type: 'beforeunload', handler: win.added[0].handler, capture: undefined }]);
  });
});
