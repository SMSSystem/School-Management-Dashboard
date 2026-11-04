import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
  users: {} as Record<string, Record<string, unknown>>,
  links: [] as Record<string, unknown>[],
  reads: 0,
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db: unknown, _name: string, id: string) => ({ id }),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  query: (_col: unknown, ...filters: { field: string; value: unknown }[]) => ({ filters }),
  getDoc: async ({ id }: { id: string }) => {
    store.reads++;
    const data = store.users[id];
    return { exists: () => !!data, data: () => data };
  },
  getDocs: async ({ filters }: { filters: { field: string; value: unknown }[] }) => {
    const rows = store.links.filter((l) => filters.every((f) => l[f.field] === f.value));
    store.reads += rows.length;
    return { docs: rows.map((r) => ({ data: () => r })) };
  },
}));

import { addParentClassUpdates, linkedClassIdsOf, parentClassUpdates, sameClasses, studentClassChangeUpdates } from '../parentLinkedClasses';

const INST = 'inst1';
const parent = (over: Row = {}): Row => ({ role: 'parent', institutionId: INST, ...over });
const link = (parentId: string, studentId: string, institutionId = INST): Row => ({ parentId, studentId, institutionId });

beforeEach(() => {
  store.reads = 0;
  store.users = {
    par: parent({ linkedClassIds: ['a'] }),
    kid1: { classId: 'a', classIds: ['a'] },
    kid2: { classId: 'c', classIds: ['c', 'b'] },
  };
  store.links = [link('par', 'kid1')];
});

describe('linkedClassIdsOf', () => {
  it('joins every child’s classes, sorted and without repeats, home classes included', () => {
    expect(
      linkedClassIdsOf([
        { classId: 'c', classIds: ['c', 'a'] },
        { classId: 'a', classIds: ['a'] },
        { classId: 'b', classIds: ['d'] },
      ]),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is empty with no children, or a child with no class', () => {
    expect(linkedClassIdsOf([])).toEqual([]);
    expect(linkedClassIdsOf([null, undefined, {}])).toEqual([]);
  });
});

describe('sameClasses', () => {
  it('ignores order and counts the home class', () => {
    expect(sameClasses({ classId: 'a', classIds: ['a', 'b'] }, { classId: 'b', classIds: ['b', 'a'] })).toBe(true);
    expect(sameClasses({ classId: 'a', classIds: ['b'] }, { classId: 'b', classIds: ['b'] })).toBe(false);
  });
});

describe('parentClassUpdates', () => {
  it('adds the classes of a link about to be added', async () => {
    expect(await parentClassUpdates(INST, [{ parentId: 'par', add: ['kid2'] }])).toEqual([
      { parentId: 'par', linkedClassIds: ['a', 'b', 'c'] },
    ]);
  });

  it('drops the classes of a link about to be removed, even one a read still sees', async () => {
    expect(await parentClassUpdates(INST, [{ parentId: 'par', remove: ['kid1'] }])).toEqual([{ parentId: 'par', linkedClassIds: [] }]);
  });

  it('keeps a class another child is still in', async () => {
    store.users.kid2 = { classId: 'a', classIds: ['a'] };
    store.links.push(link('par', 'kid2'));
    expect(await parentClassUpdates(INST, [{ parentId: 'par', remove: ['kid1'] }])).toEqual([]);
  });

  it('uses a child’s pending classes rather than the stored ones', async () => {
    expect(await parentClassUpdates(INST, [{ parentId: 'par' }], { kid1: { classId: 'z', classIds: ['z'] } })).toEqual([
      { parentId: 'par', linkedClassIds: ['z'] },
    ]);
  });

  it('returns nothing when the list is already right, in any case for a missing list that would be empty', async () => {
    expect(await parentClassUpdates(INST, [{ parentId: 'par' }])).toEqual([]);
    store.users.par = parent();
    store.links = [];
    expect(await parentClassUpdates(INST, [{ parentId: 'par' }])).toEqual([]);
  });

  it('writes a list for a parent who has none yet', async () => {
    store.users.par = parent();
    expect(await parentClassUpdates(INST, [{ parentId: 'par' }])).toEqual([{ parentId: 'par', linkedClassIds: ['a'] }]);
  });

  it('skips a child who no longer exists', async () => {
    delete store.users.kid1;
    expect(await parentClassUpdates(INST, [{ parentId: 'par' }])).toEqual([{ parentId: 'par', linkedClassIds: [] }]);
  });

  it('leaves out a parent who is missing, in another institution or not a parent, so a save does not fail', async () => {
    store.users.other = parent({ institutionId: 'inst2' });
    store.users.student = { role: 'student', institutionId: INST };
    expect(await parentClassUpdates(INST, [{ parentId: 'gone' }, { parentId: 'other' }, { parentId: 'student' }])).toEqual([]);
  });

  it('ignores a link of another institution', async () => {
    store.links.push(link('par', 'kid2', 'inst2'));
    expect(await parentClassUpdates(INST, [{ parentId: 'par' }])).toEqual([]);
  });

  it('works out nothing, and reads nothing, with no institution selected', async () => {
    expect(await parentClassUpdates('*', [{ parentId: 'par' }])).toEqual([]);
    expect(await parentClassUpdates(null, [{ parentId: 'par' }])).toEqual([]);
    expect(store.reads).toBe(0);
  });

  it('reads a child shared by two parents once', async () => {
    store.users.par2 = parent();
    store.links.push(link('par2', 'kid1'));
    await parentClassUpdates(INST, [{ parentId: 'par' }, { parentId: 'par2' }]);
    // Two parents, two links and one child.
    expect(store.reads).toBe(5);
  });
});

describe('studentClassChangeUpdates', () => {
  const before = { classId: 'a', classIds: ['a'] };

  it('reads nothing when the classes stay the same', async () => {
    expect(await studentClassChangeUpdates(INST, 'kid1', before, { classId: 'a', classIds: ['a'] })).toEqual([]);
    expect(store.reads).toBe(0);
  });

  it('updates each linked parent', async () => {
    store.users.par2 = parent({ linkedClassIds: ['a'] });
    store.links.push(link('par2', 'kid1'));
    const after = { classId: 'b', classIds: ['b'] };
    expect(await studentClassChangeUpdates(INST, 'kid1', before, after)).toEqual([
      { parentId: 'par', linkedClassIds: ['b'] },
      { parentId: 'par2', linkedClassIds: ['b'] },
    ]);
  });

  it('keeps the other children’s classes', async () => {
    store.links.push(link('par', 'kid2'));
    store.users.par = parent({ linkedClassIds: ['a', 'b', 'c'] });
    expect(await studentClassChangeUpdates(INST, 'kid1', before, { classId: 'z', classIds: ['z'] })).toEqual([
      { parentId: 'par', linkedClassIds: ['b', 'c', 'z'] },
    ]);
  });
});

describe('addParentClassUpdates', () => {
  it('adds one update to the batch per parent', () => {
    const update = vi.fn();
    addParentClassUpdates({ update } as never, [{ parentId: 'par', linkedClassIds: ['a'] }]);
    expect(update).toHaveBeenCalledWith({ id: 'par' }, { linkedClassIds: ['a'] });
  });
});
