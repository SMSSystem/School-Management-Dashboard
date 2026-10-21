import { describe, expect, it } from 'vitest';
import {
  DELETABLE_ROLES,
  STUDENT_EXAM_RECORDS,
  STUDENT_RECORD_COLLECTIONS,
  canConfirmDeletion,
  chunkOperations,
  confirmationMatches,
  deleteBlockReason,
  deletionAuditDetail,
  isDeletableRole,
} from '../deleteUserData';
import { MAX_DELETION_SHARE, MIN_ALLOWED_DELETIONS, MIN_AGE_MS, checkDeletionSafety, maskEmail, pickOrphans } from '../../../scripts/removeOrphanAuthLogic.mjs';
import executorRaw from '../deleteUserExecutor.ts?raw';
import examRecordsRaw from '../studentExamRecords.ts?raw';
import buttonRaw from '../../components/DeleteUserButton.tsx?raw';
import scriptRaw from '../../../scripts/remove-orphan-auth-accounts.mjs?raw';
import rulesRaw from '../../../firestore.rules?raw';
import photoRaw from '../userPhoto.ts?raw';
import studentsListRaw from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersListRaw from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';
import pagePhotosRaw from '../../hooks/usePagePhotos.ts?raw';

// "Delete user": the pure rules are tested directly; the executor, the button, the
// script and the users-delete rule are checked as source text, like the other
// owner scripts and rules.

const norm = (s: string) => s.split('\r\n').join('\n');
const executor = norm(executorRaw);
const examRecords = norm(examRecordsRaw);
const button = norm(buttonRaw);
const photo = norm(photoRaw);
const lists = [norm(studentsListRaw), norm(teachersListRaw), norm(pagePhotosRaw)];
const script = norm(scriptRaw);
const rules = norm(rulesRaw);

describe('deletable roles', () => {
  it('allows students and both teacher roles only', () => {
    expect([...DELETABLE_ROLES]).toEqual(['student', 'regular_teacher', 'senior_teacher']);
    for (const r of DELETABLE_ROLES) expect(isDeletableRole(r)).toBe(true);
    for (const r of ['institution_admin', 'super_admin', 'parent', 'spectator', '', undefined, null, 'toString']) {
      expect(isDeletableRole(r), String(r)).toBe(false);
    }
  });

  it('blocks yourself, a signed-out actor and a role that cannot be deleted', () => {
    expect(deleteBlockReason({ uid: 'a', role: 'student' }, 'b')).toBeNull();
    expect(deleteBlockReason({ uid: 'a', role: 'senior_teacher' }, 'b')).toBeNull();
    expect(deleteBlockReason({ uid: 'a', role: 'student' }, 'a')).toMatch(/own account/);
    expect(deleteBlockReason({ uid: 'a', role: 'student' }, null)).toMatch(/not signed in/);
    expect(deleteBlockReason({ uid: 'a', role: 'parent' }, 'b')).toMatch(/student and teacher/);
  });
});

describe('canConfirmDeletion', () => {
  const ok = { planLoaded: true, typedOk: true, acknowledged: true, busy: false };

  it('enables only when every condition holds', () => {
    expect(canConfirmDeletion(ok)).toBe(true);
  });

  it('is blocked by each condition on its own', () => {
    expect(canConfirmDeletion({ ...ok, planLoaded: false })).toBe(false);
    expect(canConfirmDeletion({ ...ok, typedOk: false })).toBe(false);
    expect(canConfirmDeletion({ ...ok, acknowledged: false })).toBe(false);
    expect(canConfirmDeletion({ ...ok, busy: true })).toBe(false);
  });
});

describe('confirmation and batching', () => {
  it('needs the exact name, ignoring case and outer spaces, and never an empty one', () => {
    expect(confirmationMatches('  ann lee ', 'Ann Lee')).toBe(true);
    expect(confirmationMatches('Ann', 'Ann Lee')).toBe(false);
    expect(confirmationMatches('', '')).toBe(false);
    expect(confirmationMatches('  ', ' ')).toBe(false);
  });

  it('splits into batches that leave room for the final batch', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const chunks = chunkOperations(items);
    expect(chunks.every((c) => c.length <= 450)).toBe(true);
    expect(chunks.flat()).toEqual(items);
    expect(chunkOperations([])).toEqual([]);
  });

  it('keeps the audit text within the 300-character rule and pluralises', () => {
    expect(deletionAuditDetail('student', 'Ann', 1)).toBe('Deleted the student account of Ann and 1 related record');
    expect(deletionAuditDetail('senior_teacher', 'Ann', 0)).toContain('teacher account');
    expect(deletionAuditDetail('student', 'x'.repeat(100), 999).length).toBeLessThan(300);
  });
});

describe('what a student deletion covers', () => {
  it('lists the student-keyed collections, each matched by a studentId field in the rules', () => {
    expect([...STUDENT_RECORD_COLLECTIONS]).toEqual([
      'results',
      'feedback_comments',
      'reportCards',
      'reportCardComments',
      'progressReports',
      'disciplinaryActions',
      'studentActivities',
      'studentResponsibilities',
      'attendanceSummaries',
    ]);
    for (const name of STUDENT_RECORD_COLLECTIONS) {
      const at = rules.indexOf(`match /institutions/{institutionId}/${name}/`);
      expect(at, name).toBeGreaterThan(-1);
      expect(rules.slice(at, at + 4000), name).toMatch(/allow delete: if \(?is(Admin|AdminOrAbove)\(\)/);
    }
  });
});

describe('the online-exam records of a student', () => {
  it('lists the three per-student documents of an exam, matched by the student uid as the document id', () => {
    expect(STUDENT_EXAM_RECORDS.map((r) => r.collection)).toEqual(['attempts', 'grades', 'accommodations']);
    expect(STUDENT_EXAM_RECORDS.map((r) => r.label)).toEqual(['exam attempts', 'exam scores', 'exam extra time']);
    for (const r of STUDENT_EXAM_RECORDS) expect(rules).toContain(`/exams/{examId}/${r.collection}/{studentUid}`);
  });

  it('finds them in the online exams of the current classes of the student with equality filters only, reading each by id', () => {
    expect(examRecords).toContain("where('classId', '==', classId), where('online', '==', true)");
    expect(examRecords).not.toMatch(/orderBy|collectionGroup|'in'/);
    expect(examRecords).toContain("institutionSubdoc(institutionId, 'exams', exam.id, record.collection, uid)");
    expect(examRecords).toContain('.exists()');
  });

  it('is part of the delete plan, so the confirmation counts them and they go before the users document', () => {
    expect(executor).toContain('findStudentExamRecords(institutionId, uid)');
    expect(executor.indexOf('findStudentExamRecords(')).toBeLessThan(executor.indexOf('const last = writeBatch(db);'));
  });
});

describe('the executor', () => {
  it('deletes the users document last, with the audit entry, in one batch', () => {
    const last = executor.indexOf('const last = writeBatch(db);');
    expect(last).toBeGreaterThan(executor.indexOf('for (const group of chunkOperations'));
    const tail = executor.slice(last);
    expect(tail).toContain("last.delete(doc(db, 'users', p.uid));");
    expect(tail).toContain("eventType: 'account_deleted'");
  });

  it('only plans a role that can be deleted, and keeps what a teacher authored', () => {
    expect(executor).toContain('if (!isDeletableRole(role)) throw');
    expect(executor).toContain("where('teacherIds', 'array-contains', uid)");
    expect(executor).toContain('teacherIds: next.teacherIds');
    for (const kept of ['assignments', 'exams', 'lessons', 'lessonNotes', 'timetable_slots']) {
      expect(executor).not.toContain(`'${kept}'`);
    }
  });

  it('scopes the parent-link query to the institution (the rule needs it)', () => {
    expect(executor).toContain("where('institutionId', '==', institutionId)");
  });
});

describe('reading a photo that may not exist', () => {
  it('uses an institution-filtered query, because getDoc on a missing photo is denied by the rules', () => {
    expect(photo).toContain("query(collection(db, 'users', uid, 'photo'), where('institutionId', '==', institutionId))");
    expect(photo).not.toContain('getDoc(');
    expect(photo).toContain("institutionId === '*'");
  });

  it('is used by the delete plan and by both lists (through the shared photo hook), none of which read photo/current with getDoc', () => {
    expect(executor).toContain('findUserPhotoDocs(uid, institutionId)');
    // the one getDoc is the student's own users document, read just before the delete to move the class head-counts
    expect(executor.match(/getDoc\(/g)).toHaveLength(1);
    expect(executor).toContain("getDoc(doc(db, 'users', p.uid))");
    expect(executor).not.toMatch(/getDoc\([^)]*photo/);
    // the lists read the photo through hooks/usePagePhotos.ts, which uses lib/userPhoto.ts's cached read (the filtered query)
    expect(norm(pagePhotosRaw)).toContain('fetchUserPhotoUrlCached');
    expect(norm(studentsListRaw)).toContain('usePagePhotos(');
    expect(norm(teachersListRaw)).toContain('usePagePhotos(');
    for (const list of lists) {
      expect(list).not.toContain("'photo', 'current'");
      expect(list).not.toContain('"photo", "current"');
    }
  });

  it('shows the Firestore error code in the dialog', () => {
    expect(button).toContain('errorCode(err)');
    expect(button).toContain('(code ${code})');
  });
});

describe('the button', () => {
  it('is for institution admins only, needs the typed name, and never offers itself on yourself', () => {
    expect(button).toContain('role !== "institution_admin"');
    expect(button).toContain('deleteBlockReason({ uid, role: targetRole }, user.uid)');
    expect(button).toContain('typedOk: confirmationMatches(typed, name)');
    expect(button).toContain('acknowledged: ack');
    expect(button).toContain('checked={ack}');
    expect(button).toContain('I understand this cannot be undone.');
    expect(button).toContain('disabled={!ready}');
  });
});

describe('users document delete rule', () => {
  const start = rules.indexOf('match /users/{uid} {');
  const block = rules.slice(start, rules.indexOf('match /users/{uid}/photo/{photoId}'));

  it('lets an institution admin delete only a student or a teacher in their institution, never themself', () => {
    const from = block.indexOf('allow delete:');
    const del = block.slice(from, block.indexOf(';', from));
    expect(del).toContain('isSuperAdmin()');
    expect(del).toContain('isAdmin() && !isOwner(uid)');
    expect(del).toContain('sameInstitution(resource.data.institutionId)');
    expect(del).toContain("resource.data.role in ['student', 'regular_teacher', 'senior_teacher']");
    expect(del).not.toMatch(/institution_admin|parent|spectator/);
  });
});

describe('remove-orphan-auth-accounts', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const old = '2026-10-01T00:00:00Z';
  const mk = (uid: string, creationTime = old) => ({ uid, email: `${uid}@x.com`, creationTime });

  it('picks accounts with no document, old enough, and spares the rest', () => {
    const r = pickOrphans({
      authUsers: [mk('has'), mk('gone'), mk('fresh', '2026-10-10T08:00:00Z'), { uid: 'nodate' }],
      existingUids: new Set(['has']),
      nowMs: now,
    });
    expect(r.picked.map((u) => u.uid)).toEqual(['gone']);
    expect(r.skipped.map((s) => s.uid).sort()).toEqual(['fresh', 'nodate']);
  });

  it('with --uid considers only that account, and refuses one that still has a document', () => {
    const authUsers = [mk('a'), mk('b')];
    expect(pickOrphans({ authUsers, existingUids: new Set(), nowMs: now, onlyUid: 'b' }).picked.map((u) => u.uid)).toEqual(['b']);
    const kept = pickOrphans({ authUsers, existingUids: new Set(['b']), nowMs: now, onlyUid: 'b' });
    expect(kept.picked).toEqual([]);
    expect(kept.skipped[0].reason).toMatch(/still has a users document/);
  });

  it('uses a 24 hour minimum age and masks addresses', () => {
    expect(MIN_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(maskEmail('helen@gmail.com')).toBe('h***@gmail.com');
  });

  it('refuses to run when the users collection is empty, whatever the flags', () => {
    const reason = checkDeletionSafety({ authCount: 40, userDocCount: 0, pickedCount: 40, allowLarge: true });
    expect(reason).toMatch(/returned no documents/);
    expect(checkDeletionSafety({ authCount: 0, userDocCount: 0, pickedCount: 0 })).toBeNull();
  });

  it('allows up to 10 accounts, or 20% of all accounts if that is more, and refuses beyond that without --allow-large', () => {
    expect(MIN_ALLOWED_DELETIONS).toBe(10);
    expect(MAX_DELETION_SHARE).toBe(0.2);
    expect(checkDeletionSafety({ authCount: 30, userDocCount: 20, pickedCount: 10 })).toBeNull();
    expect(checkDeletionSafety({ authCount: 30, userDocCount: 19, pickedCount: 11 })).toMatch(/--allow-large/);
    expect(checkDeletionSafety({ authCount: 500, userDocCount: 400, pickedCount: 100 })).toBeNull();
    expect(checkDeletionSafety({ authCount: 500, userDocCount: 399, pickedCount: 101 })).toMatch(/more than the 100/);
    expect(checkDeletionSafety({ authCount: 500, userDocCount: 399, pickedCount: 101, allowLarge: true })).toBeNull();
  });

  it('is a dry run unless --live, and deletes only behind it', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script.match(/opts\.live = true/g)).toHaveLength(1);
    expect(script.indexOf('auth.deleteUsers(')).toBeGreaterThan(script.indexOf('if (opts.live) {'));
    expect(script).toContain("db.collection('users').select().get()");
  });

  it('prints the project, and stops on an unsafe run before it prints or deletes anything', () => {
    expect(script).toContain('console.log(`Project: ${key.project_id}`);');
    expect(script).toContain("else if (arg === '--allow-large') opts.allowLarge = true;");
    const check = script.indexOf('checkDeletionSafety({');
    expect(check).toBeGreaterThan(script.indexOf('pickOrphans({'));
    expect(check).toBeLessThan(script.indexOf('auth.deleteUsers('));
    expect(script.indexOf('process.exit(1);', check)).toBeLessThan(script.indexOf('auth.deleteUsers('));
  });
});
