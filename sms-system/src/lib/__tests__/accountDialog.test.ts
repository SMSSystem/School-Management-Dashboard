import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { X } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { AccountDialog, AccountDialogActions } from '../../components/AccountDialog';
import deleteButtonRaw from '../../components/DeleteUserButton.tsx?raw';
import sessionButtonRaw from '../../components/SessionResetButton.tsx?raw';
import statusButtonRaw from '../../components/AccountStatusToggle.tsx?raw';

// DeleteUserButton, SessionResetButton and AccountStatusToggle each wrote out the same confirm dialog: the dark overlay,
// the card, the Close X, the heading, an error line and a Cancel button. These compare the shared AccountDialog with the
// markup they wrote (the same capture, byte for byte, was taken in the browser for the Teachers list).

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const x = renderToStaticMarkup(createElement(X, { className: 'w-5 h-5' }));
const OVERLAY = '<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div class="bg-white dark:bg-gray-800 p-6 rounded-md relative w-full max-w-md flex flex-col gap-4">';
const CLOSE = `<button type="button" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200" title="Close" aria-label="Close">${x}</button>`;
const CANCEL = 'class="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"';

const dialog = (error: string | null, cancelDisabled?: boolean) =>
  renderToStaticMarkup(
    createElement(AccountDialog, {
      title: createElement('span', null, 'Heading'),
      onClose: vi.fn(),
      children: createElement(
        Fragment,
        null,
        createElement('p', null, 'Body'),
        createElement(AccountDialogActions, { error, onCancel: vi.fn(), cancelDisabled, children: createElement('button', null, 'Go') }),
      ),
    }),
  );

describe('AccountDialog', () => {
  it('renders the overlay, card, Close X and heading the three dialogs wrote out', () => {
    expect(dialog(null)).toBe(
      `${OVERLAY}${CLOSE}<h2 class="text-lg font-semibold pr-8"><span>Heading</span></h2><p>Body</p>` +
        `<div class="flex gap-3 justify-end"><button type="button" ${CANCEL}>Cancel</button><button>Go</button></div></div></div>`,
    );
  });

  it('shows the error line above the buttons, and only when there is one', () => {
    expect(dialog('It failed')).toContain('<p class="text-sm text-red-500">It failed</p><div class="flex gap-3 justify-end">');
    expect(dialog(null)).not.toContain('text-red-500');
  });

  it('disables Cancel only when asked (the Delete dialog, while it works)', () => {
    expect(dialog(null, true)).toContain(`<button type="button" ${CANCEL} disabled="">Cancel</button>`);
    expect(dialog(null, false)).not.toContain('disabled');
  });
});

describe('the three account buttons', () => {
  const sources = { delete: lf(deleteButtonRaw), session: lf(sessionButtonRaw), status: lf(statusButtonRaw) };

  it('use the shared dialog and no longer write the overlay or the Close X themselves', () => {
    for (const src of Object.values(sources)) {
      expect(src).toContain('<AccountDialog title=');
      expect(src).toContain('<AccountDialogActions error={error} onCancel={() => setOpen(false)}');
      expect(src).not.toContain('fixed inset-0');
      expect(src).not.toContain('title="Close"');
    }
  });

  it('keep their own headings, close handlers and confirm buttons', () => {
    expect(sources.delete).toContain('<AccountDialog title={<>Delete {name}?</>} onClose={() => !busy && setOpen(false)}>');
    expect(sources.delete).toContain('cancelDisabled={busy}');
    expect(sources.delete).toContain('{busy ? "Deleting…" : "Delete permanently"}');
    expect(sources.session).toContain("<AccountDialog title={<>Clear {name}&apos;s session?</>} onClose={() => setOpen(false)}>");
    expect(sources.session).toContain('"Yes, clear session"');
    expect(sources.status).toContain('<AccountDialog title={<>{verb} {name}?</>} onClose={() => setOpen(false)}>');
    expect(sources.status).toContain('`Yes, ${verb.toLowerCase()}`');
    // only the Delete dialog locks Cancel while it works
    expect(sources.session).not.toContain('cancelDisabled');
    expect(sources.status).not.toContain('cancelDisabled');
  });
});
