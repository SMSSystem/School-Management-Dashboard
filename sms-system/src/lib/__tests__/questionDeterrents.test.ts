import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ExamAttemptScreen from '../../components/exam/take/ExamAttemptScreen';
import { DETERRED_EVENTS, attachDeterrents } from '../../hooks/useQuestionDeterrents';
import hookRaw from '../../hooks/useQuestionDeterrents.ts?raw';
import activityRaw from '../../hooks/useActivityLog.ts?raw';
import previewRaw from '../../scenes/(dashboard)/list/exams/preview/index.tsx?raw';
import previewScreenRaw from '../../components/exam/take/ExamPreviewScreen.tsx?raw';
import type { ExamQuestion } from '@/types/exams';

// The deterrents on the question area (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.5): which events are cancelled,
// that the log still sees them, that the questions do not print, and that the staff preview is left alone.

const norm = (s: string) => s.split('\r\n').join('\n');
const hook = norm(hookRaw);
const activity = norm(activityRaw);
// The page holds the data and the state; ExamPreviewScreen draws it. Both are the preview.
const preview = norm(previewRaw) + norm(previewScreenRaw);
const noop = () => undefined;

describe('the events that are cancelled', () => {
  it('are copy, cut, the context menu, dragging and starting a selection', () => {
    expect([...DETERRED_EVENTS]).toEqual(['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart']);
  });

  it('have their default action cancelled on the target, and nothing else does', () => {
    const target = new EventTarget();
    const detach = attachDeterrents(target);
    for (const name of DETERRED_EVENTS) {
      const event = new Event(name, { cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented, name).toBe(true);
    }
    for (const name of ['click', 'keydown', 'input', 'change', 'paste']) {
      const event = new Event(name, { cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented, name).toBe(false);
    }
    detach();
    const after = new Event('copy', { cancelable: true });
    target.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('are seen by the other listeners of the event, so each attempt is still recorded', () => {
    const seen: string[] = [];
    const target = new EventTarget();
    attachDeterrents(target);
    target.addEventListener('copy', () => seen.push('copy'));
    target.addEventListener('contextmenu', () => seen.push('menu'));
    target.dispatchEvent(new Event('copy', { cancelable: true }));
    target.dispatchEvent(new Event('contextmenu', { cancelable: true }));
    expect(seen).toEqual(['copy', 'menu']);
    // The activity log listens on the window for the same events, and the deterrents never stop an event travelling.
    for (const name of ['copy', 'cut', 'beforeprint', 'contextmenu']) expect(activity).toContain(`["${name}", act(`);
    expect(hook).not.toMatch(/stopPropagation|stopImmediatePropagation/);
  });

  it('take nothing from the keyboard or a screen reader', () => {
    expect(hook).not.toMatch(/aria-hidden|tabIndex|tabindex|keydown|keyup|focus\(/);
    expect(DETERRED_EVENTS).not.toContain('keydown');
  });
});

describe('on the attempt screen', () => {
  const questions: ExamQuestion[] = [
    { id: 'q1', text: 'Which tool?', kind: 'single', options: [{ id: 'a', text: 'A vice' }, { id: 'b', text: 'A clamp' }], points: 1 },
  ];
  const html = renderToStaticMarkup(
    createElement(ExamAttemptScreen, {
      title: 'Quiz',
      subtitle: 'Maths',
      remainingMs: 60_000,
      questions,
      answers: {},
      flags: [],
      current: 0,
      saveState: { kind: 'saved', at: 0 },
      keepAliveCapMs: 1000,
      error: null,
      pictures: { stateOf: () => 'loading' as const, srcOf: () => undefined, retry: noop },
      unsupervised: false,
      watermark: 'Ada Brown · 7K2Q9F',
      onSelect: noop,
      onToggleOption: noop,
      onToggleFlag: noop,
      onSubmit: noop,
    }),
  );

  it('wraps the question in an area where text cannot be selected and which does not print, with a line for the printout', () => {
    const area = html.indexOf('select-none');
    expect(area).toBeGreaterThan(-1);
    expect(html).toContain('print:hidden');
    expect(html.indexOf('Which tool?')).toBeGreaterThan(area);
    expect(html).toContain('Printing the questions is switched off.');
    expect(html).toMatch(/class="hidden print:block"[^>]*>Printing the questions is switched off\./);
  });

  it('still shows the options as ordinary labelled inputs and hides nothing from a screen reader', () => {
    const paper = html.slice(html.indexOf('select-none'), html.indexOf('Printing the questions is switched off.'));
    expect(paper).toContain('type="radio"');
    expect(paper).toContain('A vice');
    // The only things hidden from assistive technology are decorative (icons and the flag button's tooltip): the question and
    // the options are exposed.
    const exposed = paper.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<span aria-hidden[^>]*>[\s\S]*?<\/span>/g, '');
    expect(exposed).toContain('Which tool?');
    expect(exposed).toContain('A vice');
    expect(exposed).toContain('A clamp');
  });
});

describe('the staff preview', () => {
  it('does not switch anything off, so a teacher can copy and check the paper', () => {
    expect(preview).not.toMatch(/useQuestionDeterrents|select-none|print:hidden/);
  });
});
