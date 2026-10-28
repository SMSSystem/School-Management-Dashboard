import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ActivityTimelineDialog from '../../components/exam/results/ActivityTimelineDialog';
import DifficultyTable from '../../components/exam/results/DifficultyTable';
import ResultsTable from '../../components/exam/results/ResultsTable';
import ResultsToolbar from '../../components/exam/results/ResultsToolbar';
import toolbarRaw from '../../components/exam/results/ResultsToolbar.tsx?raw';
import tableRaw from '../../components/exam/results/ResultsTable.tsx?raw';
import menuRaw from '../../components/exam/builder/BuilderMoreMenu.tsx?raw';
import shellRaw from '../../components/DialogShell.tsx?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/results/index.tsx?raw';
import type { ResultRow } from '../examResultsRows';
import type { ExamIntegritySummary } from '@/types/exams';

// The results page on a phone: the toolbar's More menu, the buttons on a student's card, the difficulty and timeline lists, and
// the close target of a dialog. Static rendering has no window, so it draws what a computer gets; the phone's choices are pinned.

const norm = (s: string) => s.split('\r\n').join('\n');
const toolbar = norm(toolbarRaw);
const menu = norm(menuRaw);
const shell = norm(shellRaw);
const page = norm(pageRaw);
const noop = () => undefined;

const bar = (over: Partial<Parameters<typeof ResultsToolbar>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ResultsToolbar, {
      canChange: true,
      busy: false,
      gradeNow: { enabled: true, reason: null },
      releasePending: 2,
      releaseMode: 'manual',
      finalized: false,
      canFinalize: true,
      difficultyShown: false,
      onGradeNow: noop,
      onRelease: noop,
      onExport: noop,
      onFinalize: noop,
      onDifficulty: noop,
      onRefresh: noop,
      ...over,
    }),
  );

describe('the toolbar', () => {
  it('has every button on a computer, as before', () => {
    const html = bar();
    for (const label of ['Grade now', 'Release (2)', 'Export CSV', 'Show question difficulty', 'Refresh', 'Finalize exam']) expect(html).toContain(label);
    expect(html).not.toContain('aria-haspopup');
  });

  it('keeps Grade now and Release in view on a phone, at 44 px, and puts the rest behind a More menu', () => {
    expect(toolbar).toContain('const phone = useMediaQuery(MOBILE_QUERY);');
    expect(toolbar).toContain('PRIMARY_BUTTON_CLS + touch');
    expect(toolbar).toContain('SECONDARY_BUTTON_CLS + touch');
    expect(toolbar).toContain('{phone ? (\n        <BuilderMoreMenu items={menu} />');
    for (const label of ['Export CSV', 'Show question difficulty', 'Refresh', 'Finalize exam']) expect(toolbar).toContain(`label: "${label}"`);
  });

  it('leaves Show question difficulty and Finalize out of the menu when they do not apply, and says why Finalize is off', () => {
    expect(toolbar).toContain('...(!difficultyShown ? [{ label: "Show question difficulty"');
    expect(toolbar).toContain('...(canChange && !finalized');
    expect(toolbar).toContain('title: canFinalize ? undefined : "Available once the exam has closed"');
  });

  it('gives a spectator the menu without Finalize, and nothing to change', () => {
    const html = bar({ canChange: false });
    expect(html).not.toContain('Grade now');
    expect(html).not.toContain('Finalize exam');
    expect(html).toContain('You can view and export these results');
  });
});

describe('the More menu items that are off', () => {
  it('cannot be chosen, say so to assistive technology, and keep their reason as the tooltip', () => {
    expect(menu).toContain('aria-disabled={item.disabled || undefined}');
    expect(menu).toContain('title={item.title}');
    expect(menu).toContain('if (item.disabled) return;');
  });
});

const row = (over: Partial<ResultRow> = {}): ResultRow =>
  ({
    studentId: 's1',
    name: 'Ada Brown',
    status: 'Submitted',
    score: null,
    maxScore: 4,
    percent: null,
    hasGrade: false,
    fromAttempt: true,
    extraMinutes: 0,
    method: null,
    gradedByName: '',
    comment: '',
    tabSwitches: null,
    integrity: { leaves: 2, awaySeconds: 40, longestAwaySeconds: 30, acts: 1, review: false, timeline: [{ t: 60, k: 'hidden', d: 30 }] },
    ...over,
  }) as unknown as ResultRow;

describe("a student's row on a computer", () => {
  it('is a table row with the small buttons', () => {
    const html = renderToStaticMarkup(
      createElement(ResultsTable, { rows: [row()], loading: false, canChange: true, finalized: false, onScore: noop, onExtraTime: noop, onRegrade: noop, onTimeline: noop }),
    );
    expect(html).toContain('<tr');
    expect(html).not.toContain('min-h-11');
  });
});

describe("a student's card, in the source", () => {
  it('has 44 px buttons for the score, the extra time, the re-grade and the timeline, and the table keeps small ones', () => {
    const raw = norm(tableRaw);
    expect(raw).toContain('const BTN_TOUCH = `${BTN} min-h-11 px-3`;');
    expect(raw).toContain('<td>{buttons(r, BTN)}</td>');
    expect(raw).toContain('{buttons(r, BTN_TOUCH)}');
    expect(raw).toContain('Integrity: {integrity(r, BTN_TOUCH)}');
    expect(raw).toContain('<td className="hidden lg:table-cell">{integrity(r, BTN)}</td>');
  });
});

describe('the difficulty of the questions', () => {
  const rows = [
    { questionId: 'q1', number: 1, text: 'What is 2 + 2?', answered: 18, correct: 12, percent: 67 },
    { questionId: 'q2', number: 2, text: 'Pick the primes', answered: 0, correct: 0, percent: null },
  ];
  const html = renderToStaticMarkup(createElement(DifficultyTable, { rows, source: 'Worked out from the submitted attempts.' }));

  it('is a card per question on a phone and the table from md up, with the same figures', () => {
    expect(html).toContain('<ul class="flex flex-col gap-2 md:hidden">');
    expect(html).toContain('hidden overflow-x-auto md:block');
    expect(html).toContain('Answered 18 · Got it right 12 · 67% right');
    expect(html).toContain('<td class="p-2">67%</td>');
  });

  it('says a dash for a question nobody answered, in both', () => {
    expect(html).toContain('Answered 0 · Got it right 0 · — right');
    expect(html).toContain('<td class="p-2">—</td>');
  });
});

describe('the timeline of leaving the page', () => {
  const summary = {
    leaves: 2,
    awaySeconds: 40,
    longestAwaySeconds: 30,
    acts: 1,
    review: false,
    timeline: [
      { t: 60, k: 'hidden', d: 30 },
      { t: 300, k: 'copy' },
    ],
  } as unknown as ExamIntegritySummary;
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ActivityTimelineDialog, { studentName: 'Ada Brown', summary, onClose: noop })));

  it('is a line per entry on a phone and the table from md up', () => {
    expect(html).toContain('aria-label="Timeline"');
    expect(html).toContain('flex flex-col gap-2 md:hidden');
    expect(html).toContain('hidden w-full text-left md:table');
    expect(html.match(/<li class="rounded-md p-2/g)!.length).toBe(2);
  });

  it('says how long a spell away lasted, and nothing for an entry with no duration', () => {
    expect(html).toMatch(/Away for [^<]+/);
    expect(html.match(/Away for /g)).toHaveLength(1);
  });
});

describe('the close button of a dialog and the notice', () => {
  it('has a 44 px target around the same icon', () => {
    expect(shell).toContain('absolute right-1 top-1 flex h-11 w-11 items-center justify-center');
    expect(shell).toContain('<X className="h-5 w-5" aria-hidden="true" />');
  });

  it('has a Dismiss button of 44 px on a phone', () => {
    expect(page).toContain('className="min-h-11 px-2 text-xs underline md:min-h-0 md:px-0"');
  });
});
