import { describe, expect, it } from 'vitest';
import rules from '../../../firestore.rules?raw';
import indexesRaw from '../../../firestore.indexes.json?raw';

// A lesson note can be for several classes: classIds and classNames, with classId (kept for older readers) set to the
// first. There is no emulator in this project's test run, so this reads firestore.rules as text. The rule forms below
// were run on the Firestore emulator on 2026-10-20: a student's query on a note's classIds list is denied against every
// rule that compares that list with the student's classes, so students and parents read broadly (docs/ISSUES_AND_GAPS.md
// #66) and the hook narrows by class.

const text = rules.split('\r\n').join('\n');
const block = (start: string, end: string) => {
  const from = text.indexOf(start);
  expect(from, start).toBeGreaterThan(-1);
  return text.slice(from, text.indexOf(end, from));
};

describe('firestore.rules: lesson notes for several classes', () => {
  it('counts a note with classIds as linked to a class, so a query on classIds can be proven', () => {
    const body = block('function lessonNoteHasClass(n)', '\n    }\n');
    expect(body).toContain("('classId' in n && n.classId != null) || 'classIds' in n");
  });

  it('lets a student and a parent read a note that has a class, and nothing narrower', () => {
    const body = block('function lessonNoteReadableBy(n)', '\n    }\n');
    expect(body).toContain("(myRole() == 'student' && lessonNoteHasClass(n))");
    expect(body).toContain('(isParent() && lessonNoteHasClass(n))');
    expect(body).not.toContain('inMyClasses');
  });

  it('accepts classIds and classNames and ties them together on a write', () => {
    const body = block('function isValidLessonNote()', '\n    }\n');
    expect(body).toContain("'classId','className','classIds','classNames'");
    expect(body).toContain('d.classIds.size() >= 1 && d.classIds.size() <= 20');
    expect(body).toContain('d.classNames.size() == d.classIds.size()');
    expect(body).toContain("'classId' in d && d.classId == d.classIds[0]");
  });

  it('accepts subjectIds and subjectNames (1 to 5) and ties them to subjectId on a write', () => {
    const body = block('function isValidLessonNote()', '\n    }\n');
    expect(body).toContain("'subjectId','subjectName','subjectIds','subjectNames'");
    expect(body).toContain('d.subjectIds.size() >= 1 && d.subjectIds.size() <= 5');
    expect(body).toContain('d.subjectNames.size() == d.subjectIds.size()');
    expect(body).toContain("'subjectId' in d && d.subjectId == d.subjectIds[0]");
  });

  it('does not look at subjects when deciding who can read a note', () => {
    const body = block('function lessonNoteReadableBy(n)', '\n    }\n');
    expect(body).not.toContain('subject');
  });

  it('keeps the class and subject lists changeable on an update (only ownership fields are frozen)', () => {
    const body = block('match /institutions/{institutionId}/lessonNotes/{lessonNoteId} {', '\n    }\n');
    const frozen = body.slice(body.indexOf("affectedKeys().hasAny(["), body.indexOf(']', body.indexOf("affectedKeys().hasAny([")));
    expect(frozen).not.toContain('classId');
    expect(frozen).not.toContain('subjectId');
  });
});

describe('firestore.indexes.json: lesson notes by class list', () => {
  const indexes = JSON.parse(indexesRaw).indexes as {
    collectionGroup: string;
    queryScope: string;
    fields: { fieldPath: string; order?: string; arrayConfig?: string }[];
  }[];
  const noteIndex = (field: string) =>
    indexes.find(
      (i) =>
        i.collectionGroup === 'lessonNotes' &&
        i.fields.length === 2 &&
        i.fields[0].fieldPath === field &&
        i.fields[1].fieldPath === 'updatedAt' &&
        i.fields[1].order === 'DESCENDING',
    );

  it('has the array-contains index the student and parent queries need, next to the classId one', () => {
    expect(noteIndex('classIds')?.fields[0].arrayConfig).toBe('CONTAINS');
    expect(noteIndex('classId')?.fields[0].order).toBe('ASCENDING');
    expect(noteIndex('classIds')?.queryScope).toBe('COLLECTION');
  });
});
