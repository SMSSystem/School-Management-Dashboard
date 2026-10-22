import { describe, expect, it } from 'vitest';
import {
  MAX_LESSON_NOTE_SUBJECTS,
  noteSubjectIds,
  noteSubjectNames,
  subjectFieldsFor,
  subjectLabel,
} from '../lessonNoteSubjects';
import { isNoteVisibleTo } from '../lessonNoteClasses';

const legacy = { subjectId: 'm', subjectName: 'Maths' };
const multi = { subjectId: 'm', subjectName: 'Maths', subjectIds: ['m', 's'], subjectNames: ['Maths', 'Science'] };

describe('the subjects of a lesson note', () => {
  it('reads one subject from a note that has only subjectId', () => {
    expect(noteSubjectIds(legacy)).toEqual(['m']);
    expect(noteSubjectNames(legacy)).toEqual(['Maths']);
    expect(subjectLabel(legacy)).toBe('Maths');
  });

  it('reads every subject from a note that has subjectIds', () => {
    expect(noteSubjectIds(multi)).toEqual(['m', 's']);
    expect(subjectLabel(multi)).toBe('Maths, Science');
  });

  it('reads no subject from a note with none, and ignores blanks and repeats', () => {
    expect(noteSubjectIds({})).toEqual([]);
    expect(subjectLabel({})).toBe('');
    expect(noteSubjectIds({ subjectIds: ['m', '', 'm'] })).toEqual(['m']);
  });

  it('allows 5 subjects, the same cap as firestore.rules', () => {
    expect(MAX_LESSON_NOTE_SUBJECTS).toBe(5);
  });
});

describe('the subjects picked in the form', () => {
  it('stores every subject, with the first as subjectId', () => {
    expect(
      subjectFieldsFor([
        { id: 's', name: 'Science' },
        { id: 'm', name: 'Maths' },
      ]),
    ).toEqual({ subjectId: 's', subjectName: 'Science', subjectIds: ['s', 'm'], subjectNames: ['Science', 'Maths'] });
  });

  it('stores nothing for no subject and drops repeats', () => {
    expect(subjectFieldsFor([])).toBeNull();
    expect(subjectFieldsFor([{ id: 'm', name: 'M' }, { id: 'm', name: 'M' }])?.subjectIds).toEqual(['m']);
  });
});

describe('who can see a note with several subjects', () => {
  const inClass = { classId: 'A', classIds: ['A'] };
  const note = { classId: 'A', className: 'A', ...multi };

  it('is a student who takes any one of the subjects in a note class', () => {
    // Home class gives every subject.
    expect(isNoteVisibleTo(note, inClass)).toBe(true);
    // An additional class gives only the chosen subjects: Maths is listed on the note, so Maths alone is enough.
    const extra = { classId: 'Z', classIds: ['Z', 'A'], classSubjects: { A: ['m'] } };
    expect(isNoteVisibleTo(note, extra)).toBe(true);
    expect(isNoteVisibleTo({ ...note, ...{ subjectIds: ['s', 'x'], subjectNames: ['Science', 'X'], subjectId: 's' } }, extra)).toBe(false);
  });

  it('still needs the class: taking the subject elsewhere is not enough', () => {
    const elsewhere = { classId: 'Z', classIds: ['Z'] };
    expect(isNoteVisibleTo(note, elsewhere)).toBe(false);
  });

  it('shows a note of the old single-subject shape the same as before', () => {
    const extra = { classId: 'Z', classIds: ['Z', 'A'], classSubjects: { A: ['m'] } };
    expect(isNoteVisibleTo({ classId: 'A', ...legacy }, extra)).toBe(true);
    expect(isNoteVisibleTo({ classId: 'A', subjectId: 'english', subjectName: 'English' }, extra)).toBe(false);
  });

  it('shows a note with no subject to everyone in the class', () => {
    expect(isNoteVisibleTo({ classId: 'A' }, { classId: 'Z', classIds: ['Z', 'A'], classSubjects: { A: ['m'] } })).toBe(true);
  });
});
