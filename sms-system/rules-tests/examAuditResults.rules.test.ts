import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { EXAM, INST, as, assertFails, assertSucceeds, resetAndSeedUsers, startEnv, stopEnv } from './helpers';
import { buildAuditEntry } from '../src/lib/auditEntry';
import type { AuditEventType } from '../src/types/audit';

// The audit entries of the online exam events and the results an exam produces (EXAMS_FEATURE_SPEC.md §7, §12). The
// five exam events are accepted for administrators and teachers only, attributed to the person writing them; a student
// can never write a result, with or without an exam id.

const EVENTS: AuditEventType[] = ['exam_edit', 'exam_publish', 'exam_grade', 'exam_release', 'exam_finalize'];
const log = (uid: string, eventType: AuditEventType, performedBy = uid) =>
  addDoc(
    collection(as(uid), `institutions/${INST}/audit_log`),
    buildAuditEntry({ institutionId: INST, eventType, detail: 'Saved 3 questions in online exam Quiz', targetUid: EXAM, targetName: 'Quiz', performedBy, performedByName: uid }),
  );

beforeAll(startEnv);
afterAll(stopEnv);
beforeEach(resetAndSeedUsers);

describe('the exam audit events', () => {
  it('are accepted from an administrator and from a teacher, for every one of the five', async () => {
    for (const event of EVENTS) {
      await assertSucceeds(log('admin', event));
      await assertSucceeds(log('teacherA', event));
      await assertSucceeds(log('seniorSame', event));
    }
  });

  it('are refused for students, parents, the spectator and another institution’s administrator', async () => {
    for (const uid of ['studentA', 'parentA', 'spectator', 'outsiderAdmin']) {
      for (const event of EVENTS) await assertFails(log(uid, event));
    }
  });

  it('must be attributed to the person writing them', async () => {
    await assertFails(log('teacherA', 'exam_grade', 'teacherB'));
    await assertFails(log('admin', 'exam_finalize', 'teacherA'));
  });
});

describe('results made from an exam', () => {
  const result = (uid: string) => ({
    institutionId: INST,
    studentId: 'studentA',
    studentName: 'Student A',
    score: 5,
    maxScore: 10,
    type: 'exam',
    examId: EXAM,
    teacherId: uid,
  });

  it('cannot be created by a student or a parent, with an exam id or without', async () => {
    for (const uid of ['studentA', 'parentA']) {
      await assertFails(setDoc(doc(as(uid), `institutions/${INST}/results/exam_${EXAM}_studentA`), result(uid)));
      const plain: Record<string, unknown> = result(uid);
      delete plain.examId;
      await assertFails(setDoc(doc(as(uid), `institutions/${INST}/results/plain_${uid}`), plain));
    }
  });
});
