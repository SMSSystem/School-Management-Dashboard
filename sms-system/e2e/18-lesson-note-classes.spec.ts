import { test } from '@playwright/test';
import { deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import {
  HAS_ADMIN_SDK,
  classIdByName,
  expectAllowed,
  expectDenied,
  institutionId,
  subjectIdByName,
  sweepQaNotes,
  userByEmail,
} from './lesson-notes-support';
import { CLASS_A_NAME, CLASS_B_NAME, FIXTURES, INSTITUTION_NAME, SUBJECT_NAME, ctx, noteDoc, notesCol, validNote, withProbes } from './lesson-notes-ui-support';

// A lesson note for several classes (LESSON_NOTES_FEATURE_SPEC.md section 12): the rule probes. Run
// 09-lesson-notes.spec.ts first; it creates the fixtures this spec reuses (the dedicated teacher, the Class B
// student, the two-child parent). The form itself is exercised by 09 (the class checkboxes) and by the local
// production-bundle capture (lesson-note-form-dom).
//
// Since this feature a student's read of a lesson note is as broad as a parent's (docs/ISSUES_AND_GAPS.md #66): a rule
// cannot be proven for a query on a note's classIds list, so the page narrows to the student's classes and the rules
// allow any note that has a class. These probes pin what the rules do allow and refuse.

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth checks and cleanup)');
  test.skip(!INSTITUTION_NAME, 'QA_INSTITUTION_NAME missing from .env.qa');
  ctx.iid = await institutionId();
  ctx.classA = (await classIdByName(CLASS_A_NAME)) ?? '';
  ctx.classB = (await classIdByName(CLASS_B_NAME)) ?? '';
  ctx.teacher = await userByEmail(FIXTURES.teacher.email);
  ctx.subject = (await subjectIdByName(SUBJECT_NAME)) ?? '';
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK && INSTITUTION_NAME) await sweepQaNotes();
});

test('rules: a note for two classes is read by both classes, and by no one once it has none', async () => {
  await withProbes(['teacher', 'studentA', 'studentB', 'parent'], async (p) => {
    const t = p.teacher;
    const ref = doc(notesCol(t));
    try {
      await expectAllowed(
        'the author creates a note for Class A and Class B',
        setDoc(
          ref,
          validNote(t, {
            classIds: [ctx.classA, ctx.classB],
            classNames: [CLASS_A_NAME, CLASS_B_NAME],
            // Two subjects too (SUBJECT_NAME and a second): the rules ignore subjects when deciding who reads a note.
            subjectId: ctx.subject,
            subjectName: SUBJECT_NAME,
            subjectIds: [ctx.subject, 'qa-second-subject'],
            subjectNames: [SUBJECT_NAME, 'QA Second Subject'],
          }),
        ),
      );
      await expectAllowed('a student of the first class reads it', getDoc(noteDoc(p.studentA, ref.id)));
      await expectAllowed('a student of the second class reads it', getDoc(noteDoc(p.studentB, ref.id)));
      await expectAllowed('the parent reads it', getDoc(noteDoc(p.parent, ref.id)));
      await expectAllowed(
        'the second class lists it by classIds',
        getDocs(query(notesCol(p.studentB), where('classIds', 'array-contains-any', [ctx.classB]))),
      );
      await expectAllowed(
        'the parent lists it by classIds',
        getDocs(query(notesCol(p.parent), where('classIds', 'array-contains-any', [ctx.classA, ctx.classB]))),
      );
      await expectDenied(
        'a student cannot list by teacher (the result could include a note with no class)',
        getDocs(query(notesCol(p.studentA), where('teacherId', '==', t.uid))),
      );
      await expectAllowed(
        'the author removes the second class',
        updateDoc(ref, { classIds: [ctx.classA], classNames: [CLASS_A_NAME], updatedAt: serverTimestamp() }),
      );
      await expectAllowed(
        'the author removes every class',
        updateDoc(ref, {
          classId: deleteField(),
          className: deleteField(),
          classIds: deleteField(),
          classNames: deleteField(),
          subjectId: deleteField(),
          subjectName: deleteField(),
          subjectIds: deleteField(),
          subjectNames: deleteField(),
          updatedAt: serverTimestamp(),
        }),
      );
      await expectDenied('a student cannot read a note with no class', getDoc(noteDoc(p.studentA, ref.id)));
      await expectDenied('the parent cannot read a note with no class', getDoc(noteDoc(p.parent, ref.id)));
    } finally {
      await deleteDoc(ref).catch(() => undefined);
    }
  });
});

test('rules: the class lists of a note must agree with each other', async () => {
  await withProbes(['teacher'], async (p) => {
    const t = p.teacher;
    const attempt = (label: string, overrides: Record<string, unknown>) =>
      expectDenied(label, setDoc(doc(notesCol(t)), validNote(t, overrides)));
    const ids = Array.from({ length: 21 }, (_, i) => `c${i}`);

    await attempt('classIds whose first class is not classId', {
      classIds: [ctx.classB, ctx.classA],
      classNames: [CLASS_B_NAME, CLASS_A_NAME],
    });
    await attempt('classNames of a different length', { classIds: [ctx.classA, ctx.classB], classNames: [CLASS_A_NAME] });
    await attempt('an empty classIds list', { classIds: [], classNames: [] });
    await attempt('more than 20 classes', { classId: 'c0', classIds: ids, classNames: ids });

    // Subjects: the same shape, 1 to 5.
    const five = ['s0', 's1', 's2', 's3', 's4', 's5'];
    await attempt('subjectIds whose first subject is not subjectId', {
      subjectId: 'm',
      subjectName: 'M',
      subjectIds: ['s', 'm'],
      subjectNames: ['S', 'M'],
    });
    await attempt('subjectNames of a different length', { subjectId: 'm', subjectName: 'M', subjectIds: ['m', 's'], subjectNames: ['M'] });
    await attempt('an empty subjectIds list', { subjectIds: [], subjectNames: [] });
    await attempt('more than 5 subjects', { subjectId: 's0', subjectName: 's0', subjectIds: five, subjectNames: five });
  });
});
