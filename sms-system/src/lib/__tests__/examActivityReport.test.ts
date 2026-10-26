import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ActivityTimelineDialog from '../../components/exam/results/ActivityTimelineDialog';
import dialogRaw from '../../components/exam/results/ActivityTimelineDialog.tsx?raw';
import tableRaw from '../../components/exam/results/ResultsTable.tsx?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/results/index.tsx?raw';
import {
  ACTIVITY_NOTES,
  describeEntry,
  describeTimeline,
  formatAway,
  formatOffset,
  integrityCellText,
  integrityFrom,
} from '../examActivityReport';
import { EXAM_LIMITS, type ExamActivityEvent, type ExamIntegritySummary } from '@/types/exams';

// The words and figures of the teacher's activity report (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.4).

const norm = (s: string) => s.split('\r\n').join('\n');

describe('formatOffset and formatAway', () => {
  it('write a time into the exam as a clock, with hours only after an hour', () => {
    expect(formatOffset(0)).toBe('0:00');
    expect(formatOffset(65)).toBe('1:05');
    expect(formatOffset(725)).toBe('12:05');
    expect(formatOffset(3725)).toBe('1:02:05');
    expect(formatOffset(-4)).toBe('0:00');
    expect(formatOffset(Number.NaN)).toBe('0:00');
  });

  it('write a time away in words', () => {
    expect(formatAway(1)).toBe('1 second');
    expect(formatAway(31)).toBe('31 seconds');
    expect(formatAway(60)).toBe('1 min');
    expect(formatAway(250)).toBe('4 min 10 s');
    expect(formatAway(3600)).toBe('1 h');
    expect(formatAway(3900)).toBe('1 h 5 min');
  });
});

describe('describeEntry and describeTimeline', () => {
  it('say the page was left, how long, and what an act was', () => {
    expect(describeEntry({ t: 125, k: 'hidden', d: 31 })).toEqual({ when: '2:05', what: 'Left the page (another tab, window or app)', away: '31 seconds' });
    expect(describeEntry({ t: 40, k: 'blur', d: 4 })?.what).toBe('Window lost focus');
    expect(describeEntry({ t: 70, k: 'copy' })).toEqual({ when: '1:10', what: 'Copy', away: '' });
  });

  it('say "not recorded" for a leave with no time, and never claim a tab was opened', () => {
    expect(describeEntry({ t: 5, k: 'hidden' })?.away).toBe('not recorded');
    expect(describeEntry({ t: 5, k: 'hidden', d: 0 })?.away).toBe('not recorded');
    for (const k of ['hidden', 'blur', 'copy', 'cut', 'print', 'menu', 'fs_exit', 'fs_unavailable'] as const) {
      expect(describeEntry({ t: 1, k })?.what, k).not.toMatch(/opened a (new )?tab|visited|website/i);
    }
  });

  it('skip a kind this version does not know and a malformed entry, and put the rest in time order', () => {
    const entries = [
      { t: 90, k: 'copy' },
      { t: 10, k: 'tilt' },
      { t: Number.NaN, k: 'hidden' },
      { t: 30, k: 'hidden', d: 12 },
    ] as unknown as ExamActivityEvent[];
    expect(describeEntry(entries[1])).toBeNull();
    expect(describeTimeline(entries).map((l) => l.when)).toEqual(['0:30', '1:30']);
  });
});

describe('integrityCellText', () => {
  it('says no leaves, one leave, or many with the time away and the longest', () => {
    expect(integrityCellText({ leaves: 0, awaySeconds: 0, longestAwaySeconds: 0 })).toBe('No leaves');
    expect(integrityCellText({ leaves: 1, awaySeconds: 31, longestAwaySeconds: 31 })).toBe('1 leave, 31 seconds away');
    expect(integrityCellText({ leaves: 3, awaySeconds: 250, longestAwaySeconds: 120 })).toBe('3 leaves, 4 min 10 s away (longest 2 min)');
    expect(integrityCellText({ leaves: 2, awaySeconds: 0, longestAwaySeconds: 0 })).toBe('2 leaves');
  });
});

describe('integrityFrom', () => {
  const valid: ExamIntegritySummary = {
    leaves: 3,
    hiddenLeaves: 2,
    awaySeconds: 120,
    longestAwaySeconds: 90,
    acts: 1,
    review: false,
    timeline: [{ t: 5, k: 'hidden', d: 90 }],
  };

  it('reads a stored summary back, with or without the optional count of fast answers', () => {
    expect(integrityFrom(valid)).toEqual(valid);
    expect(integrityFrom({ ...valid, fastAnswers: 4 })).toEqual({ ...valid, fastAnswers: 4 });
  });

  it('refuses what is not a summary: a missing figure, a wrong type, a negative or fractional count', () => {
    expect(integrityFrom(null)).toBeNull();
    expect(integrityFrom('x')).toBeNull();
    expect(integrityFrom([])).toBeNull();
    const noReview: Record<string, unknown> = { ...valid };
    delete noReview.review;
    expect(integrityFrom(noReview)).toBeNull();
    expect(integrityFrom({ ...valid, leaves: -1 })).toBeNull();
    expect(integrityFrom({ ...valid, awaySeconds: 1.5 })).toBeNull();
    expect(integrityFrom({ ...valid, review: 'yes' })).toBeNull();
    expect(integrityFrom({ ...valid, timeline: 'none' })).toBeNull();
  });

  it('keeps entries it cannot read out of the timeline and never holds more than the limit', () => {
    const messy = { ...valid, timeline: [{ t: 1, k: 'hidden' }, { t: 'x', k: 'hidden' }, null, { t: 2, k: 'copy' }] };
    expect(integrityFrom(messy)?.timeline).toEqual([{ t: 1, k: 'hidden' }, { t: 2, k: 'copy' }]);
    const long = { ...valid, timeline: Array.from({ length: 80 }, (_, i) => ({ t: i, k: 'hidden' })) };
    expect(integrityFrom(long)?.timeline).toHaveLength(EXAM_LIMITS.maxTimelineEntries);
  });
});

describe('the notes every screen with the log carries', () => {
  it('say it is a reason to look, what a browser cannot see, that an empty log is not proof, and the closed-page limit', () => {
    const all = ACTIVITY_NOTES.join(' ');
    expect(all).toContain('a notification');
    expect(all).toContain('a reason to look');
    expect(all).toContain('cannot tell a new tab from a switched tab');
    expect(all).toContain('an empty log is not proof');
    expect(all).toContain('may have been longer');
  });
});

describe('the timeline dialog', () => {
  const summary: ExamIntegritySummary = {
    leaves: 2,
    hiddenLeaves: 1,
    awaySeconds: 99,
    longestAwaySeconds: 95,
    acts: 1,
    review: true,
    timeline: [
      { t: 30, k: 'hidden', d: 95 },
      { t: 200, k: 'blur', d: 4 },
      { t: 260, k: 'copy' },
    ],
  };
  const html = renderToStaticMarkup(createElement(ActivityTimelineDialog, { studentName: 'Ann Lee', summary, onClose: () => undefined }));

  it('shows the figures, the Review line and one row for each entry in time order', () => {
    expect(html).toContain('When Ann Lee left the exam page');
    expect(html).toContain('2 leaves, 1 min 39 s away (longest 1 min 35 s)');
    expect(html).toContain('Review: more than the usual for an exam of this length. Worth a look; not a finding.');
    expect(html.indexOf('0:30')).toBeLessThan(html.indexOf('3:20'));
    expect(html.indexOf('3:20')).toBeLessThan(html.indexOf('4:20'));
    expect(html).toContain('1 min 35 s');
    expect(html).toContain('Copy');
  });

  it('carries every note and a Close button, on the shared dialog frame', () => {
    // none of the notes holds a character that markup escapes, so each appears whole
    for (const note of ACTIVITY_NOTES) expect(html).toContain(note);
    expect(html).toContain('Close');
    expect(norm(dialogRaw)).toContain('<DialogShell');
  });

  it('says so when no timeline was kept, and when the list holds fewer than the leaves', () => {
    const none = renderToStaticMarkup(createElement(ActivityTimelineDialog, { studentName: 'Ann Lee', summary: { ...summary, timeline: [] }, onClose: () => undefined }));
    expect(none).toContain('No timeline was kept for this student.');
    const partial = renderToStaticMarkup(createElement(ActivityTimelineDialog, { studentName: 'Ann Lee', summary: { ...summary, leaves: 90 }, onClose: () => undefined }));
    expect(partial).toContain('there were more leaves than are listed');
    expect(html).not.toContain('there were more leaves than are listed');
  });
});

describe('where the report appears', () => {
  it('replaces the Tab switches column of the results table with Integrity, and the page opens the timeline', () => {
    const table = norm(tableRaw);
    expect(table).toContain('{ header: "Integrity", accessor: "integrity"');
    expect(table).not.toContain('header: "Tab switches"');
    expect(table).toContain('Review');
    expect(table).toContain('onTimeline(r)');
    expect(norm(pageRaw)).toContain('onTimeline={(row) => setDialog({ kind: "timeline", row })}');
    expect(norm(pageRaw)).toContain('<ActivityTimelineDialog');
  });
});
