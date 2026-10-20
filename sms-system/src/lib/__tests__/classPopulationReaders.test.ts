import { describe, expect, it } from 'vitest';
import hookRaw from '../../hooks/useClassPopulations.ts?raw';
import classesPageRaw from '../../scenes/(dashboard)/list/classes/index.tsx?raw';
import writeRaw from '../classPopulationWrite.ts?raw';

// The Classes list reads each class's head-count from the class document once it has been recounted, and only falls
// back to the six count() queries for a class that has not. These pin that wiring (the rules are in
// classPopulationDelta.test.ts).

const lf = (s: string) => s.split('\r\n').join('\n');

describe('the Classes list head-counts', () => {
  it('the hook asks the stored head-count first and runs the count queries only for a class without one', () => {
    const src = lf(hookRaw);
    expect(src).toContain('const stored = classes.map((c) => storedPopulationOf(c));');
    expect(src).toContain('enabled: enabled && stored[i] === undefined,');
    expect(src).toContain('populations[c.id] = stored[i] ?? results[i]?.data;');
  });

  it('an error in a count query is only reported for a class that needed one', () => {
    expect(lf(hookRaw)).toContain('stored[i] === undefined && r.isError');
  });

  it('the page hands the hook the class documents it already read from its snapshot', () => {
    expect(lf(classesPageRaw)).toContain('useClassPopulations(paginatedData)');
  });
});

describe('the head-count writes', () => {
  it('update only the buckets that change, as dot paths with increment(), never overwriting the map', () => {
    const src = lf(writeRaw);
    expect(src).toContain("fields['population.male'] = increment(d.male)");
    expect(src).toContain("fields['population.female'] = increment(d.female)");
    expect(src).toContain("fields['population.unspecified'] = increment(d.unspecified)");
    expect(src).not.toContain('set(');
    expect(src).toContain('batch.update(');
  });
});
