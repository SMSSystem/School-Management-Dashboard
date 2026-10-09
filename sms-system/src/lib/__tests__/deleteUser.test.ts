import { describe, expect, it } from 'vitest';
import {
  DELETABLE_ROLES,
  STUDENT_RECORD_COLLECTIONS,
  canConfirmDeletion,
  chunkOperations,
  confirmationMatches,
  deleteBlockReason,
  deletionAuditDetail,
  isDeletableRole,
} from '../deleteUserData';
import { MIN_AGE_MS, maskEmail, pickOrphans } from '../../../scripts/removeOrphanAuthLogic.mjs';
import executorRaw from '../deleteUserExecutor.ts?raw';
import buttonRaw from '../../components/DeleteUserButton.tsx?raw';
import scriptRaw from '../../../scripts/remove-orphan-auth-accounts.mjs?raw';
import rulesRaw from '../../../firestore.rules?raw';
import photoRaw from '../userPhoto.ts?raw';
import studentsListRaw from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersListRaw from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';

// "Delete user": the pure rules are tested directly; the executor, the button, the
// script and the users-delete rule are checked as source text, like the other
// owner scripts and rules.

const norm = (s: string) => s.split('\r\n').join('\n');
const executor = norm(executorRaw);
const button = norm(buttonRaw);
const photo = norm(photoRaw);
const lists = [norm(studentsListRaw), norm(teachersListRaw)];
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
    expect(executor).toContain('arrayRemove(p.uid)');
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

  it('is used by the delete plan and by both lists, none of which read photo/current with getDoc', () => {
    expect(executor).toContain('findUserPhotoDocs(uid, institutionId)');
    expect(executor).not.toContain('getDoc(');
    for (const list of lists) {
      expect(list).toContain('fetchUserPhotoUrl(uid, rowInstitutionId)');
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

  it('is a dry run unless --live, and deletes only behind it', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script.match(/opts\.live = true/g)).toHaveLength(1);
    expect(script.indexOf('auth.deleteUsers(')).toBeGreaterThan(script.indexOf('if (opts.live) {'));
    expect(script).toContain("db.collection('users').select().get()");
  });
});
