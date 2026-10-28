import { interceptTarget, type Here } from './navigationGuard';

// The two listeners behind the unsaved-changes guard: one for clicks on links, one for closing or reloading the tab. They
// take the document and window they listen on, so the rules in navigationGuard.ts can be exercised without a browser.
// BrowserRouter cannot block a navigation, but its Link and NavLink do nothing when the click was already prevented, so
// preventing it here, before React sees it, is what keeps the person on the page.

type Listens = Pick<Document, 'addEventListener' | 'removeEventListener'>;

export type WatchEnv = {
  document: Listens;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Where the person is now. */
  here: () => Here;
};

/**
 * Watches clicks on links. A plain click on a link to another page of this site is stopped and passed to `ask` with the
 * address it led to. Returns a function that stops watching.
 */
export function watchLinks(env: WatchEnv, ask: (to: string) => void): () => void {
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null | undefined;
    if (!anchor || typeof anchor.href !== 'string') return;
    const to = interceptTarget(
      {
        button: event.button,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        defaultPrevented: event.defaultPrevented,
        href: anchor.href,
        target: anchor.getAttribute('target') ?? '',
        download: anchor.hasAttribute('download'),
      },
      env.here(),
    );
    if (to === null) return;
    event.preventDefault();
    ask(to);
  };
  env.document.addEventListener('click', onClick, true);
  return () => env.document.removeEventListener('click', onClick, true);
}

/** Asks the browser to confirm closing or reloading the tab. Returns a function that stops. */
export function watchUnload(env: Pick<WatchEnv, 'window'>): () => void {
  const warn = (event: BeforeUnloadEvent) => {
    event.preventDefault();
  };
  env.window.addEventListener('beforeunload', warn);
  return () => env.window.removeEventListener('beforeunload', warn);
}
