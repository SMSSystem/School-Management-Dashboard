import { describe, expect, it } from 'vitest';
import { planHouseChanges, toggledStudentIds } from '../houseMembership';

const set = (...ids: string[]) => new Set(ids);

describe('toggledStudentIds', () => {
  it('lists the students ticked and unticked since the form opened, and nobody else', () => {
    expect(toggledStudentIds(set('a', 'b'), set('b', 'c'))).toEqual(['c', 'a']);
  });

  it('is empty when nothing changed', () => {
    expect(toggledStudentIds(set('a', 'b'), set('a', 'b'))).toEqual([]);
  });
});

describe('planHouseChanges', () => {
  it('assigns a ticked student and removes an unticked one', () => {
    const plan = planHouseChanges({
      initialIds: set('a'),
      checkedIds: set('b'),
      freshHouseIds: new Map<string, string | null>([['a', 'H1'], ['b', null]]),
      houseId: 'H1',
    });
    expect(plan).toEqual({ toAssign: ['b'], toRemove: ['a'] });
  });

  it('never writes a student whose box was not touched, even if the list was stale about them', () => {
    // 'x' was shown as outside the house and left unticked; 'y' was shown inside and left ticked.
    const plan = planHouseChanges({
      initialIds: set('y'),
      checkedIds: set('y'),
      freshHouseIds: new Map<string, string | null>([['x', 'H1'], ['y', 'H2']]),
      houseId: 'H1',
    });
    expect(plan).toEqual({ toAssign: [], toRemove: [] });
  });

  it('leaves a ticked student alone when they are already in this house', () => {
    const plan = planHouseChanges({
      initialIds: set(),
      checkedIds: set('a'),
      freshHouseIds: new Map<string, string | null>([['a', 'H1']]),
      houseId: 'H1',
    });
    expect(plan.toAssign).toEqual([]);
  });

  it('does not take out an unticked student who another admin has since moved to a different house', () => {
    const plan = planHouseChanges({
      initialIds: set('a'),
      checkedIds: set(),
      freshHouseIds: new Map<string, string | null>([['a', 'H2']]),
      houseId: 'H1',
    });
    expect(plan.toRemove).toEqual([]);
  });

  it('does not take out an unticked student who is already in no house', () => {
    const plan = planHouseChanges({
      initialIds: set('a'),
      checkedIds: set(),
      freshHouseIds: new Map<string, string | null | undefined>([['a', undefined]]),
      houseId: 'H1',
    });
    expect(plan.toRemove).toEqual([]);
  });

  it('moves a ticked student in from another house', () => {
    const plan = planHouseChanges({
      initialIds: set(),
      checkedIds: set('a'),
      freshHouseIds: new Map<string, string | null>([['a', 'H2']]),
      houseId: 'H1',
    });
    expect(plan.toAssign).toEqual(['a']);
  });

  it('skips a student who could not be read or no longer exists', () => {
    const plan = planHouseChanges({
      initialIds: set('gone'),
      checkedIds: set('new'),
      freshHouseIds: new Map(),
      houseId: 'H1',
    });
    expect(plan).toEqual({ toAssign: [], toRemove: [] });
  });
});
