import { describe, expect, it } from 'vitest';
import tourStepsSrc from '../useTourSteps.ts?raw';
import { calendarSource } from './calendarSource';

// The Academic Calendar page carries the element ids the product tour and the end-to-end specs look for. The
// page is several files, so these are pinned across all of them: an id that goes missing breaks a tour step
// (it would wait for an element that never appears) or a spec, and nothing else would notice.

const IDS = [
  'tour-academic-calendar-add-nsd',
  'tour-academic-calendar-draft-confirm',
  'tour-academic-calendar-draft-edit',
  'tour-academic-calendar-draft-pending',
  'tour-academic-calendar-holiday-${h.id}',
  'tour-academic-calendar-nsd-${n.id}-date',
  'tour-academic-calendar-nsd-${n.id}-end',
  'tour-academic-calendar-nsd-${n.id}-reason',
  'tour-academic-calendar-nsd-${n.id}-remove',
  'tour-academic-calendar-nsd-${n.id}-start',
  'tour-academic-calendar-nsd-${n.id}-type-range',
  'tour-academic-calendar-nsd-${n.id}-type-single',
  'tour-academic-calendar-nsd-add',
  'tour-academic-calendar-nsd-new-cancel',
  'tour-academic-calendar-nsd-new-date',
  'tour-academic-calendar-nsd-new-end',
  'tour-academic-calendar-nsd-new-reason',
  'tour-academic-calendar-nsd-new-save',
  'tour-academic-calendar-nsd-new-start',
  'tour-academic-calendar-nsd-new-type-${t}',
  'tour-academic-calendar-nsd-toggle-${n.id}',
  'tour-academic-calendar-publish',
  'tour-academic-calendar-term-${t.number}-end',
  'tour-academic-calendar-term-${t.number}-name',
  'tour-academic-calendar-term-${t.number}-reset',
  'tour-academic-calendar-term-${t.number}-start',
  'tour-academic-calendar-term-${t.termNumber}-edit',
  'tour-academic-calendar-term-edit-cancel',
  'tour-academic-calendar-term-edit-end',
  'tour-academic-calendar-term-edit-name',
  'tour-academic-calendar-term-edit-save',
  'tour-academic-calendar-term-edit-start',
  'tour-academic-calendar-timeblock-create',
  'tour-academic-calendar-timeblock-duration-count',
  'tour-academic-calendar-timeblock-duration-unit',
  'tour-academic-calendar-timeblock-end',
  'tour-academic-calendar-timeblock-name',
  'tour-academic-calendar-timeblock-start',
  'tour-academic-calendar-timeblock-weekday-${value}',
  'tour-academic-calendar-weekday-${value}',
  'tour-academic-calendar-wizard-back',
  'tour-academic-calendar-wizard-next',
  'tour-academic-calendar-year-end',
  'tour-academic-calendar-year-start',
];

describe('the Academic Calendar page keeps its tour and spec ids', () => {
  it('has exactly the 44 ids it has always had, across its files', () => {
    const found = [...new Set(calendarSource.match(/tour-academic-calendar-[A-Za-z0-9_${}.-]*/g) ?? [])].sort();
    expect(found).toEqual(IDS);
  });

  it('has every element the product tour points at', () => {
    const selectors = [...tourStepsSrc.matchAll(/selector:\s*'#(tour-academic-calendar-[\w-]+)'/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(0);
    for (const id of selectors) expect(calendarSource, id).toContain(id);
  });
});
