import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ConfirmDialog from '../../components/ConfirmDialog';
import dialogShellRaw from '../../components/DialogShell.tsx?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';

// The builder asks in its own dialog, not the browser's pop-up (EXAMS_FEATURE_SPEC.md §4.3): before a question is deleted
// and before leaving with unsaved changes.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const noop = () => undefined;

describe('ConfirmDialog', () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmDialog, { title: 'Delete question 2?', message: 'It goes.', confirmLabel: 'Delete question', tone: 'danger', onConfirm: noop, onCancel: noop }),
  );

  it('is a labelled modal dialog with the question, a Cancel button and a confirm button', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Delete question 2?');
    expect(html).toContain('It goes.');
    expect(html).toMatch(/>Cancel<\/button>/);
    expect(html).toMatch(/>Delete question<\/button>/);
  });

  it('puts Cancel before the confirm button, so the focus the frame gives the first button lands on Cancel', () => {
    expect(html.indexOf('>Cancel<')).toBeLessThan(html.indexOf('>Delete question<'));
    expect(norm(dialogShellRaw)).toContain("button:not([aria-label='Close'])");
  });

  it('is red for a destructive action and the brand colour otherwise, and can wait while busy', () => {
    expect(html).toContain('bg-red-700');
    const neutral = renderToStaticMarkup(
      createElement(ConfirmDialog, { title: 'Go?', message: 'Sure?', confirmLabel: 'Go', busy: true, onConfirm: noop, onCancel: noop }),
    );
    expect(neutral).not.toContain('bg-red-700');
    expect(neutral).toContain('--brand-button-bg');
    expect(neutral).toContain('disabled=""');
  });
});

describe('the builder page', () => {
  it('has no browser pop-up left', () => {
    expect(page).not.toContain('window.confirm');
    expect(page).not.toMatch(/\balert\(/);
  });

  it('asks before deleting a question, and only deletes on confirm', () => {
    expect(page).toContain('onDelete={() => setPendingDelete({ id: question.id, number: at + 1 })}');
    expect(page).toContain('title={`Delete question ${pendingDelete.number}?`}');
    expect(page).toContain('b.setDraft((list) => list.filter((q) => q.id !== pendingDelete.id));');
    expect(page).toContain('setActiveId(idAfterDelete(draft, pendingDelete.id));');
  });

  it('asks before leaving with unsaved changes through the unsaved-changes guard, which owns the dialog and the browser’s close prompt', () => {
    // The Back link is a plain link the guard stops itself (navigationGuardWiring.test.ts); the page only switches it on.
    expect(page).toContain('useNavigationGuard(dirty, UNSAVED_MESSAGE);');
    expect(page).toContain('<Link to="/dashboard/list/exams" className=');
    expect(page).not.toContain('setLeaving');
  });
});
