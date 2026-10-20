import { describe, expect, it } from 'vitest';
import { classIdsOf as scriptClassIdsOf, planRecount, tallyPopulation } from '../../../scripts/recountClassPopulationLogic.mjs';
import scriptRaw from '../../../scripts/recount-class-populations.mjs?raw';
import queriesRaw from '../classPopulationQueries.ts?raw';
import buttonRaw from '../../components/RecountClassPopulationsButton.tsx?raw';
import classesPageRaw from '../../scenes/(dashboard)/list/classes/index.tsx?raw';
import { classIdsOf } from '../studentClasses';
import { populationDelta, storedPopulationOf } from '../classPopulationDelta';

// The recount (the script and the Classes page button) sets the head-counts that the writers then keep current. The
// script's rule is a copy of the app's, so a test runs both over the same students.

const lf = (s: string) => s.split('\r\n').join('\n');
const CLASSES = ['c1', 'c2', 'c3'];

const STUDENTS = [
  { classId: 'c1', classIds: ['c1'], gender: 'Male', status: 'active' },
  { classId: 'c1', classIds: ['c1', 'c2'], gender: 'Female', status: 'active' },
  { classId: 'c2', classIds: ['c2'], gender: 'Female' }, // no status: active
  { classId: 'c2', classIds: ['c2', 'c3'], gender: 'Other', status: 'active' },
  { classId: 'c3', gender: 'Male', status: 'inactive' }, // deactivated: not counted
  { classId: 'c1', classIds: ['c1', 'gone'], gender: undefined, status: 'active' }, // a dead class id is ignored
  { classId: 'c3' }, // classIds not stored yet: the home class alone
  { classIds: [], gender: 'Male', status: 'active' }, // in no class
];

describe('tallyPopulation (the script)', () => {
  it('counts active students in every class of theirs, by gender, and ignores dead classes', () => {
    const tally = tallyPopulation(STUDENTS, CLASSES);
    expect(Object.fromEntries(tally)).toEqual({
      c1: { male: 1, female: 1, unspecified: 1 },
      c2: { male: 0, female: 2, unspecified: 1 },
      c3: { male: 0, female: 0, unspecified: 2 },
    });
  });

  it('gives a class nobody is in zeros', () => {
    expect(tallyPopulation([], ['c1']).get('c1')).toEqual({ male: 0, female: 0, unspecified: 0 });
  });

  it('agrees with the app: summing populationDelta(null, student) over the same students gives the same counts', () => {
    const fromApp: Record<string, { male: number; female: number; unspecified: number }> = Object.fromEntries(
      CLASSES.map((c) => [c, { male: 0, female: 0, unspecified: 0 }]),
    );
    for (const s of STUDENTS) {
      const added = populationDelta(null, { classIds: classIdsOf(s), gender: s.gender, status: s.status }, new Set(CLASSES));
      for (const [id, d] of Object.entries(added)) {
        fromApp[id].male += d.male;
        fromApp[id].female += d.female;
        fromApp[id].unspecified += d.unspecified;
      }
    }
    expect(Object.fromEntries(tallyPopulation(STUDENTS, CLASSES))).toEqual(fromApp);
  });

  it('reads a student’s classes the way the app does', () => {
    for (const s of STUDENTS) expect(scriptClassIdsOf(s)).toEqual(classIdsOf(s));
  });
});

describe('planRecount', () => {
  const tally = new Map([['c1', { male: 2, female: 1, unspecified: 0 }]]);

  it('marks a class with no stored count, or no baseline, as needing the update', () => {
    const [a, b] = planRecount(
      [
        { id: 'c1', name: '1A' },
        { id: 'c1', name: '1A', population: { male: 2, female: 1, unspecified: 0 } }, // counted by increments only
      ],
      tally,
    );
    expect(a).toMatchObject({ changed: true, hadBaseline: false, stored: null });
    expect(b).toMatchObject({ changed: true, hadBaseline: false });
  });

  it('leaves a class whose baseline and numbers already match alone', () => {
    const [row] = planRecount([{ id: 'c1', name: '1A', population: { male: 2, female: 1, unspecified: 0 }, populationBaseline: {} }], tally);
    expect(row.changed).toBe(false);
  });

  it('marks a drifted class as changed and reports what was stored', () => {
    const [row] = planRecount([{ id: 'c1', name: '1A', population: { male: 5, female: 1, unspecified: 0 }, populationBaseline: {} }], tally);
    expect(row).toMatchObject({ changed: true, hadBaseline: true, counted: { male: 2, female: 1, unspecified: 0 } });
  });

  it('a class missing from the tally is counted as empty', () => {
    expect(planRecount([{ id: 'zz' }], tally)[0].counted).toEqual({ male: 0, female: 0, unspecified: 0 });
  });

  it('what a recount stores is what the Classes list then shows', () => {
    const [row] = planRecount([{ id: 'c1' }], tally);
    expect(storedPopulationOf({ population: row.counted, populationBaseline: {} })).toEqual({ total: 3, male: 2, female: 1, unspecified: 0 });
  });
});

describe('the recount script', () => {
  const script = lf(scriptRaw);

  it('is a dry run unless --live is given, and writes only behind that flag', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toMatch(/const opts = \{[^}]*\blive: false\b/);
    expect(script.match(/opts\.live = true/g)).toHaveLength(1);
    expect(script.indexOf('batch.update(')).toBeGreaterThan(script.indexOf('if (opts.live) {'));
    expect(script).toContain('populationBaseline: FieldValue.serverTimestamp()');
  });

  it('limits a run to one institution with a safe id, and logs without personal data', () => {
    expect(script).toContain("else if (arg.startsWith('--institution=')) opts.institution");
    expect(script).toContain('/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)');
    // the log holds class names and numbers only
    expect(script).toContain('className: r.name ?? null');
    expect(script).not.toMatch(/log\.push\(\{[^}]*(email|phone|firstName|lastName)/);
  });
});

describe('the recount in the app', () => {
  it('stores population and populationBaseline on every class it counted, in batches', () => {
    const src = lf(queriesRaw);
    expect(src).toContain('export async function recountClassPopulations(');
    expect(src).toContain('population: { male: counts.male, female: counts.female, unspecified: counts.unspecified },');
    expect(src).toContain('populationBaseline: serverTimestamp(),');
    expect(src).toContain('i += 400');
  });

  it('is offered to an institution admin on the Classes page only', () => {
    expect(lf(classesPageRaw)).toContain('role === "institution_admin" && !USE_MOCK && <RecountClassPopulationsButton');
    const button = lf(buttonRaw);
    expect(button).toContain('recountClassPopulations(institutionId, classIds)');
    expect(button).toContain('invalidateUserCounts(institutionId)');
  });
});
