import {
  buildDatedPlan,
  buildPeople,
  buildSubjects,
  type Item,
} from '../../../scripts/seedDemoPrimaryLogic.mjs';
import clearRaw from '../../../scripts/clear-demo-activity-log.mjs?raw';
import scriptRaw from '../../../scripts/seed-demo-primary-school.mjs?raw';

// The Blue Mountain Primary School demo seed: the roster, the calendar, the dated records,
// and the script's safety rules. Everything is a pure function of (institutionId, through).

export const ID = 'demoInstitution1';
export const TODAY = '2026-10-15';
export const script = scriptRaw.split('\r\n').join('\n');

export const people = buildPeople();
export const subjects = buildSubjects(people);
export const dated = buildDatedPlan(ID, people, subjects, TODAY);

export function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value instanceof Date || value === null || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(hasUndefined);
}

// ─────────────────────────────────────────────────────────────────────────
// Part 2: rubrics, manual-entry results, discipline, progress reports, report cards
// ─────────────────────────────────────────────────────────────────────────

export const clear = clearRaw.split('\r\n').join('\n');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;
export const d = (i: Item) => i.data as Doc;
export const classGrade = (i: Item) => Number(/class_g(\d)/.exec(d(i).classId)![1]);
