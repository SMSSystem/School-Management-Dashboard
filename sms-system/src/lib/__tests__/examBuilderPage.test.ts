import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import QuestionEditor from '../../components/exam/builder/QuestionEditor';
import BuilderToolbar from '../../components/exam/builder/BuilderToolbar';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import hookRaw from '../../hooks/useExamBuilder.ts?raw';
import routesRaw from '../../routes/academicRoutes.tsx?raw';
import lazyRaw from '../../routes/lazyPages.ts?raw';
import type { BuilderQuestion, EditMode } from '../examBuilderLogic';

// The exam builder (EXAMS_FEATURE_SPEC.md §4.3): the question editor and toolbar as rendered for each edit mode, and
// the pins that keep the page's saving, guarding and route in place.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const hook = norm(hookRaw);
const routes = norm(routesRaw);
const lazy = norm(lazyRaw);
const noop = () => undefined;

const question = (over: Partial<BuilderQuestion> = {}): BuilderQuestion => ({
  id: 'q1',
  text: 'Which are fruits?',
  kind: 'multiple',
  options: [
    { id: 'o1', text: 'Apple' },
    { id: 'o2', text: 'Carrot' },
    { id: 'o3', text: 'Pear' },
  ],
  points: 2,
  correct: ['o1', 'o3'],
  ...over,
});

function editor(over: Partial<Parameters<typeof QuestionEditor>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(QuestionEditor, {
      question: question(),
      index: 1,
      total: 3,
      answerMode: 'both',
      mode: 'full' as EditMode,
      issues: [],
      onChange: noop,
      onMove: noop,
      onDuplicate: noop,
      onDelete: noop,
      ...over,
    }),
  );
}

describe('QuestionEditor in full mode', () => {
  const html = editor();

  it('shows the text, the points, the options and which are correct', () => {
    expect(html).toContain('Question 2');
    expect(html).toContain('Which are fruits?');
    expect(html).toContain('value="2"');
    expect(html).toContain('value="Apple"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain('tick the correct answers (at least two)');
  });

  it('uses radio buttons for a single question', () => {
    const single = editor({ question: question({ kind: 'single', correct: ['o2'] }) });
    expect(single.match(/type="radio"/g)).toHaveLength(3);
    expect(single).toContain('tick the correct answer');
  });

  it('offers the kind only when the exam allows both', () => {
    expect(html).toContain('Several correct answers</option>');
    expect(editor({ answerMode: 'single' })).not.toContain('One correct answer</option>');
    expect(editor({ answerMode: 'multiple' })).not.toContain('<select');
  });

  it('has move, duplicate and delete buttons, with the ends and the full list limited', () => {
    expect(html).toContain('aria-label="Move question 2 up"');
    expect(html).toContain('aria-label="Delete question 2"');
    expect(editor({ index: 0 })).toMatch(/aria-label="Move question 1 up"[^>]*disabled|disabled=""[^>]*aria-label="Move question 1 up"/);
    expect(editor({ total: 100 })).toMatch(/disabled=""[^>]*aria-label="Duplicate question 2"|aria-label="Duplicate question 2"[^>]*disabled/);
  });

  it('adds an option up to six and removes only above two', () => {
    expect(html).toContain('Add option');
    const six = question({ options: Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, text: `t${i}` })), correct: [] });
    expect(editor({ question: six })).not.toContain('Add option');
    const two = question({ options: six.options.slice(0, 2), correct: [] });
    expect(editor({ question: two }).match(/aria-label="Remove option [AB]"[^>]*disabled|disabled=""[^>]*aria-label="Remove option [AB]"/g)).toHaveLength(2);
  });

  it('limits the text lengths and shows the issues of the question without its number', () => {
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain('maxLength="300"');
    const withIssue = editor({ issues: [{ code: 'key_missing', message: 'Question 2: has no correct answer in the key.', questionId: 'q1' }] });
    expect(withIssue).toContain('has no correct answer in the key.');
    expect(withIssue).not.toContain('Question 2: has no');
  });
});

describe('QuestionEditor when only the key can change', () => {
  const html = editor({ mode: 'key_only' });

  it('locks the text, the options and the points but leaves the correct marks open', () => {
    expect(html.match(/<textarea[^>]*disabled/g)).toHaveLength(1);
    expect(html.match(/aria-label="Option [A-C] text"[^>]*disabled|disabled=""[^>]*aria-label="Option [A-C] text"/g)).toHaveLength(3);
    expect(html.match(/type="checkbox"[^>]*disabled/g)).toBeNull();
  });

  it('has no move, duplicate, delete, add or remove buttons', () => {
    for (const label of ['Move question', 'Duplicate question', 'Delete question', 'Add option', 'Remove option']) {
      expect(html).not.toContain(label);
    }
  });
});

describe('QuestionEditor in read-only mode', () => {
  it('locks the correct marks as well', () => {
    const html = editor({ mode: 'read_only' });
    expect(html.match(/type="checkbox"[^>]*disabled/g) ?? html.match(/disabled=""[^>]*type="checkbox"/g)).not.toBeNull();
    expect(html).not.toContain('Delete question');
  });
});

function toolbar(over: Partial<Parameters<typeof BuilderToolbar>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(BuilderToolbar, {
      title: 'Unit 3 Quiz',
      subtitle: '3A · Maths',
      statusLabel: 'Draft',
      questionCount: 12,
      totalPoints: 15,
      mode: 'full' as EditMode,
      dirty: false,
      busy: false,
      notice: null,
      actions: [{ to: 'published' as const, action: 'published' as const, label: 'Publish' }],
      onSave: noop,
      onStatus: noop,
      getBlockers: () => [],
      ...over,
    }),
  );
}

describe('BuilderToolbar', () => {
  it('shows the name, the status and the counts', () => {
    const html = toolbar();
    expect(html).toContain('Unit 3 Quiz');
    expect(html).toContain('3A · Maths');
    expect(html).toContain('Draft');
    expect(html).toContain('12 of 100 questions · 15 points');
  });

  it('keeps Save off until something has changed and holds Publish back while there are unsaved changes', () => {
    expect(toolbar()).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*(<svg.*?<\/svg>)? Save/s);
    const dirty = toolbar({ dirty: true });
    expect(dirty).toContain('Unsaved changes');
    expect(dirty).toContain('title="Save your changes first"');
    expect(dirty).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*(<svg.*?<\/svg>)? Save/s);
  });

  it('explains the key-only and read-only modes, and read-only has no Save', () => {
    expect(toolbar({ mode: 'key_only' })).toContain('only the correct answers can be changed');
    const readOnly = toolbar({ mode: 'read_only', actions: [] });
    expect(readOnly).toContain('You can view this exam but not change it.');
    expect(readOnly).not.toContain(' Save');
  });

  it('shows a notice, as an alert when it is an error', () => {
    expect(toolbar({ notice: { kind: 'error', text: 'Nope' } })).toContain('role="alert"');
    expect(toolbar({ notice: { kind: 'ok', text: 'Saved.' } })).toContain('role="status"');
  });
});

describe('the builder page and hook', () => {
  it('is reached only by staff, at /dashboard/list/exams/:examId/build, as a lazy page', () => {
    expect(routes).toContain('path="/dashboard/list/exams/:examId/build"');
    expect(routes).toMatch(/exams\/:examId\/build"\s+element=\{\s+hasStaffView\(role\) \? \(\s+<ExamBuilderPage \/>/);
    expect(lazy).toContain('ExamBuilderPage: () => import("@/scenes/(dashboard)/list/exams/build")');
    expect(lazy).toContain('export const ExamBuilderPage = lazy(load.ExamBuilderPage)');
  });

  it('reads the exam once, checks access before it reads the content, and only counts attempts for a published exam', () => {
    expect(hook).toContain('canViewExamContent(loaded, person)');
    expect(hook.indexOf('canViewExamContent(loaded, person)')).toBeLessThan(hook.indexOf('loadExamContent('));
    expect(hook).toContain('loaded.status === "published" ? countExamAttempts(');
    expect(hook).not.toContain('onSnapshot');
  });

  it('saves a key correction from the saved questions with only the new correct options', () => {
    expect(hook).toContain('mode === "key_only" ? applyKeyCorrections(saved, draft) : draft');
  });

  it('is read only for anyone who may not manage the exam, and offers Publish only when the status graph allows it', () => {
    expect(hook).toContain('!exam || !canManage');
    expect(hook).toContain('canTransition(status, o.to, ctx)');
  });

  it('checks what stops publishing from the saved content and settings', () => {
    expect(hook).toContain('publishBlockers(settings, questions, answers, Date.now())');
    expect(hook).toContain('splitDraft(saved)');
  });

  it('warns before leaving with unsaved changes and never writes from the page itself', () => {
    expect(page).toContain('addEventListener("beforeunload"');
    expect(page).toContain('You have unsaved changes. Leave without saving?');
    expect(page).not.toMatch(/setDoc|updateDoc|addDoc|writeBatch/);
  });

  it('offers adding, moving, duplicating and deleting only in full mode', () => {
    expect(page).toContain('const full = mode === "full"');
    expect(page).toContain('{full && (\n        <button');
  });
});
