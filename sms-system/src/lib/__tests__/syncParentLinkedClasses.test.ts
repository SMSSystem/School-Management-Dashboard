import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({}));

import { linkedClassList, planParentLists } from '../../../scripts/syncParentLinkedClassesLogic.mjs';
import { linkedClassIdsOf } from '../parentLinkedClasses';

const INST = 'inst1';
const student = (id: string, classId: string, classIds: string[] = [classId], institutionId = INST) => ({ id, institutionId, classId, classIds });
const parent = (id: string, linkedClassIds?: string[], institutionId = INST) => ({ id, institutionId, linkedClassIds });
const link = (parentId: string, studentId: string) => ({ parentId, studentId });

describe('linkedClassList', () => {
  it('gives the same list as the app for every shape of student', () => {
    const shapes = [
      [],
      [{ classId: 'b', classIds: ['b', 'a'] }, { classId: 'a', classIds: ['a'] }],
      [{ classId: 'c' }],
      [{ classIds: ['d'] }],
      [{ classId: 'a', classIds: ['z'] }],
      [{}],
    ];
    for (const children of shapes) expect(linkedClassList(children)).toEqual(linkedClassIdsOf(children));
  });
});

describe('planParentLists', () => {
  it('sets the list of a parent who has none', () => {
    const { changes, report } = planParentLists({ parents: [parent('p')], students: [student('s', 'a')], links: [link('p', 's')] });
    expect(changes).toEqual([{ parentId: 'p', linkedClassIds: ['a'] }]);
    expect(report.toChange).toBe(1);
  });

  it('joins several children, and changes nothing when the list is right', () => {
    const students = [student('s1', 'b'), student('s2', 'a', ['a', 'c'])];
    const links = [link('p', 's1'), link('p', 's2')];
    const { changes, report } = planParentLists({ parents: [parent('p', ['a', 'b', 'c'])], students, links });
    expect(changes).toEqual([]);
    expect(report.alreadyRight).toBe(1);
  });

  it('removes a class no child is in any more', () => {
    const { changes } = planParentLists({ parents: [parent('p', ['a', 'old'])], students: [student('s', 'a')], links: [link('p', 's')] });
    expect(changes).toEqual([{ parentId: 'p', linkedClassIds: ['a'] }]);
  });

  it('empties the list of a parent whose children are gone, and leaves a parent with none as they are', () => {
    const { changes, report } = planParentLists({ parents: [parent('p', ['a']), parent('q')], students: [], links: [] });
    expect(changes).toEqual([{ parentId: 'p', linkedClassIds: [] }]);
    expect(report.noChildren).toBe(2);
  });

  it('counts links to someone missing, and writes nothing for them', () => {
    const { changes, report } = planParentLists({
      parents: [parent('p')],
      students: [student('s', 'a')],
      links: [link('gone', 's'), link('p', 'gone')],
    });
    expect(changes).toEqual([]);
    expect(report).toMatchObject({ linksToMissingParent: 1, linksToMissingStudent: 1 });
  });

  it('does not count a child of another institution', () => {
    const { changes, report } = planParentLists({
      parents: [parent('p')],
      students: [student('s', 'a', ['a'], 'inst2')],
      links: [link('p', 's')],
    });
    expect(changes).toEqual([]);
    expect(report.linksAcrossInstitutions).toBe(1);
  });
});
