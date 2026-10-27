import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BuilderListPanel from '../../components/exam/builder/BuilderListPanel';
import BuilderRail from '../../components/exam/builder/BuilderRail';
import BuilderSheet from '../../components/exam/builder/BuilderSheet';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import sheetRaw from '../../components/exam/builder/BuilderSheet.tsx?raw';
import { questionLabel } from '../examBuilderNav';
import type { BuilderQuestion } from '../examBuilderLogic';
import type { ExamIssue } from '../examKeyValidation';

// The list of questions in the builder: the rail beside the editor from md up and the sheet below it. What each row says,
// the filter, the moves, and how the page lays them out.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const sheetSource = norm(sheetRaw);
const noop = () => undefined;

const q = (id: string, text: string, points = 1): BuilderQuestion => ({
  id,
  text,
  kind: 'single',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  points,
  correct: ['a'],
});
const questions = [q('q1', 'What is 2 + 2?'), q('q2', ''), q('q3', 'Which planet is closest to the sun and why is it so hot?', 2.5)];
const issue: ExamIssue = { code: 'missing_text', message: 'Question 2: write the question.', questionId: 'q2' } as ExamIssue;
const issues = { q2: [issue] };

const panel = (over: Partial<Parameters<typeof BuilderListPanel>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(BuilderListPanel, {
      questions,
      activeId: 'q1',
      issuesByQuestion: issues,
      onlyIssues: false,
      onToggleIssues: noop,
      onSelect: noop,
      ...over,
    }),
  );

describe('a row of the list', () => {
  it('has the number, the first words, the points, and marks the chosen question', () => {
    const html = panel();
    expect(html).toContain('>1</span>');
    expect(html).toContain('What is 2 + 2?');
    expect(html).toContain(questionLabel(questions[2]));
    expect(questionLabel(questions[2]).endsWith('…')).toBe(true);
    expect(html).toContain('>2.5</span>');
    expect(html).toMatch(/aria-current="true"[^>]*>[^]*What is 2 \+ 2\?/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });

  it('says there is no text yet, and says in words that a question has problems', () => {
    const html = panel();
    expect(html).toContain('(no text yet)');
    expect(html).toContain('has problems');
    expect(html.match(/has problems/g)).toHaveLength(1);
  });
});

describe('the filter', () => {
  it('counts the questions that need attention and is off by default', () => {
    const html = panel();
    expect(html).toContain('Needs attention (1)');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('(no text yet)');
    expect(html).toContain('What is 2 + 2?');
  });

  it('shows only those questions when it is on, keeping their numbers', () => {
    const html = panel({ onlyIssues: true });
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('What is 2 + 2?');
    expect(html).toContain('(no text yet)');
    expect(html).toContain('>2</span>');
  });

  it('is off when nothing needs attention, and says so when it is on and nothing does', () => {
    expect(panel({ issuesByQuestion: {} })).toMatch(/<button[^>]*disabled=""[^>]*>Needs attention \(0\)/);
    expect(panel({ issuesByQuestion: {}, onlyIssues: true })).toContain('No question needs attention.');
  });

  it('says there are no questions for an empty exam', () => {
    expect(panel({ questions: [] })).toContain('There are no questions yet.');
  });
});

describe('moving and adding', () => {
  it('has a move up and a move down for each row when it is given a way to move, the first and last being off', () => {
    const html = panel({ onMove: noop });
    expect(html).toContain('aria-label="Move question 1 up"');
    expect(html).toContain('aria-label="Move question 3 down"');
    expect(html).toMatch(/<button[^>]*aria-label="Move question 1 up"/);
    expect(html).toMatch(/disabled=""[^>]*aria-label="Move question 1 up"|aria-label="Move question 1 up"[^>]*disabled=""/);
    expect(html.match(/Move question \d (up|down)/g)).toHaveLength(6);
  });

  it('has no moves without a way to move (the sheet, and an exam that cannot be changed)', () => {
    expect(panel()).not.toContain('Move question');
  });

  it('ends with Add question only when it can add, and turns it off at the limit', () => {
    expect(panel()).not.toContain('Add question');
    expect(panel({ onAdd: noop })).toContain('Add question');
    const many = Array.from({ length: 100 }, (_, i) => q(`m${i}`, `Question ${i}`));
    expect(panel({ questions: many, onAdd: noop })).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Add question/);
  });
});

describe('the rail', () => {
  const html = renderToStaticMarkup(
    createElement(BuilderRail, { questions, activeId: 'q1', issuesByQuestion: issues, onlyIssues: false, onToggleIssues: noop, onSelect: noop, onMove: noop, onAdd: noop }),
  );

  it('is a navigation called Questions that is only there from md up and sticks beside the editor', () => {
    expect(html).toContain('<nav aria-label="Questions"');
    expect(html).toContain('hidden md:sticky md:top-0 md:block');
    expect(html).toContain('md:max-h-[calc(100dvh-3.5rem)] md:overflow-y-auto');
  });

  it('holds the list with its moves and Add', () => {
    expect(html).toContain('Needs attention (1)');
    expect(html).toContain('Move question 2 down');
    expect(html).toContain('Add question');
  });

  it('has normal-size rows', () => {
    expect(html).not.toContain('min-h-11');
  });
});

describe('the sheet', () => {
  const html = renderToStaticMarkup(
    createElement(BuilderSheet, { questions, activeId: 'q1', issuesByQuestion: issues, onlyIssues: false, onToggleIssues: noop, onSelect: noop, onAdd: noop, onClose: noop }),
  );

  it('is a bottom sheet called Questions with 44 px rows and the same list', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('>Questions</h2>');
    expect(html).toContain('rounded-t-xl');
    expect(html).toContain('min-h-11');
    expect(html).toContain('Needs attention (1)');
    expect(html).toContain('(no text yet)');
    expect(html).toContain('Add question');
  });

  it('has no moves: the editor has them', () => {
    expect(html).not.toContain('Move question');
  });

  it('closes when a question is chosen', () => {
    expect(sheetSource).toContain('onSelect(id);\n          onClose();');
  });
});

describe('the page', () => {
  it('lays the rail beside the editor from md up, with the strip and the editor in the other column', () => {
    expect(page).toContain('md:grid md:grid-cols-[16rem_minmax(0,1fr)]');
    expect(page).toContain('<BuilderRail');
    expect(page.indexOf('<BuilderRail')).toBeLessThan(page.indexOf('<BuilderStrip'));
  });

  it('gives the strip a Questions button below md, with how many need attention', () => {
    expect(page).toContain('onClick={() => setSheetOpen(true)}');
    expect(page).toContain('aria-label={attention > 0 ? `Questions, ${attention} need attention` : `Questions, ${draft.length}`}');
    expect(page).toContain('min-h-11 md:hidden');
  });

  it('opens the sheet only when asked, and the sheet adds a question and closes', () => {
    expect(page).toContain('{sheetOpen && (');
    expect(page).toContain('addQuestion();\n            setSheetOpen(false);');
  });

  it('moves a question from the rail and keeps it chosen, only while the exam can be changed', () => {
    expect(page).toContain('onMove={full ? (index, delta) => {');
    expect(page).toContain('if (moved) setActiveId(moved.id);');
    expect(page).toContain('onAdd: full ? () => addQuestion() : undefined,');
  });

  it('shares one filter between the rail and the sheet', () => {
    expect(page).toContain('const [onlyIssues, setOnlyIssues] = useState(false);');
    expect(page).toContain('onToggleIssues: () => setOnlyIssues((v) => !v),');
  });
});
