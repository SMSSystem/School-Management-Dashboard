import { test, expect, type Page } from '@playwright/test';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { forceLiveData, login, logout, dismissTourIfPresent } from './helpers';
import {
  HAS_ADMIN_SDK,
  NO_DEPT_TEACHER,
  auditEntriesFor,
  classIdByName,
  db,
  deleteAuditEntriesFor,
  deleteByPath,
  docAtPath,
  ensureNoDepartmentTeacher,
  expectAllowed,
  expectDenied,
  institutionId,
  openProbe,
  otherInstitutionAdmins,
  restoreUserFields,
  setUserFields,
  snapshotUser,
  subjectIdByName,
  userByEmail,
  type Probe,
  type UserInfo,
} from './lesson-notes-support';

// ISSUES_AND_GAPS.md #39 — the users owner clause is now an allow-list, the
// legacy teachers mirror is closed, log writes are validated and carry a
// server-verified recordedAt, institution_admins can't edit each other, and an
// account an admin deactivates (status 'inactive') stops matching every rule.
//
// Two layers, as in specs 09/10:
//   - UI tests: the admin deactivate/reactivate control and the inactive-account
//     login message. These work against the rules as currently deployed.
//   - Rule probes (Firebase web SDK in Node): REQUIRE the new firestore.rules to
//     be deployed. Every denial is paired with a positive control. A "denied"
//     write really WRITES if its rule isn't deployed, so each probe snapshots the
//     documents it touches and restores them through the Admin SDK in a finally
//     block — a failing probe must never leave a shared QA account altered.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const PROBE_PREFIX = 'qa-lockdown-';
const NOT_A_CLASS = 'qa-lockdown-no-such-class';

type Key = 'admin' | 'superadmin' | 'senior' | 'senior2' | 'studentA' | 'studentB' | 'teacher' | 'noDept';

function creds(key: Key): { email: string; password: string } {
  const e = process.env;
  switch (key) {
    case 'admin':
      return { email: e.QA_ADMIN_EMAIL!, password: e.QA_ADMIN_PASSWORD! };
    case 'superadmin':
      return { email: e.QA_SUPERADMIN_EMAIL!, password: e.QA_SUPERADMIN_PASSWORD! };
    case 'senior':
      return { email: e.QA_SENIOR_TEACHER_EMAIL!, password: e.QA_SENIOR_TEACHER_PASSWORD! };
    case 'senior2':
      return { email: e.QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL!, password: e.QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD! };
    case 'studentA':
      return { email: e.QA_ASSIGNMENTS_STUDENT_EMAIL!, password: e.QA_ASSIGNMENTS_STUDENT_PASSWORD! };
    case 'studentB':
      return { email: 'qa.lessons.studentb@demo.com', password: e.QA_LESSONS_STUDENT_B_PASSWORD ?? 'Student01234567890' };
    case 'teacher':
      return { email: 'qa.lessons.teacher@demo.com', password: e.QA_LESSONS_TEACHER_PASSWORD ?? 'Teacher0123456789' };
    case 'noDept':
      return { email: NO_DEPT_TEACHER.email, password: NO_DEPT_TEACHER.password };
  }
}

const ctx = { iid: '', users: {} as Record<Key, UserInfo> };

async function loginAs(page: Page, key: Key) {
  await login(page, {
    institutionLabel: key === 'superadmin' ? 'Platform Administration' : INSTITUTION_NAME!,
    ...creds(key),
  });
  if (key === 'admin') await dismissTourIfPresent(page);
}

async function withProbes(keys: Key[], fn: (p: Record<string, Probe>) => Promise<void>): Promise<void> {
  const opened: Record<string, Probe> = {};
  try {
    for (const k of keys) opened[k] = await openProbe(creds(k).email, creds(k).password);
    await fn(opened);
  } finally {
    await Promise.all(Object.values(opened).map((p) => p.close().catch(() => undefined)));
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
  test.skip(!INSTITUTION_NAME, 'QA_INSTITUTION_NAME missing from .env.qa');
  ctx.iid = await institutionId();
  await ensureNoDepartmentTeacher();
  const keys: Key[] = ['admin', 'superadmin', 'senior', 'senior2', 'studentA', 'studentB', 'teacher', 'noDept'];
  for (const k of keys) ctx.users[k] = await userByEmail(creds(k).email);
  // Start from a known state: the account the status tests flip must be active.
  await setUserFields(ctx.users.noDept.uid, { status: 'active' });
  await deleteAuditEntriesFor(ctx.users.noDept.uid);
});

test.afterAll(async () => {
  if (!HAS_ADMIN_SDK || !INSTITUTION_NAME || !ctx.users.noDept) return;
  await setUserFields(ctx.users.noDept.uid, { status: 'active' });
  await deleteAuditEntriesFor(ctx.users.noDept.uid);
});

// ── UI: deactivate / reactivate ─────────────────────────────────────────────

async function openTeacherRow(page: Page, name: string) {
  await page.goto('/dashboard/list/teachers');
  await page.getByPlaceholder('Search by name…').fill(name);
  const row = page.locator('tr', { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}

test('UI: an admin deactivates a teacher; they are told and signed out; reactivating restores access', async ({ page, context }) => {
  const target = ctx.users.noDept;
  await forceLiveData(context);

  try {
    await test.step('admin deactivates the account', async () => {
      await loginAs(page, 'admin');
      const row = await openTeacherRow(page, target.name);
      await row.getByRole('button', { name: `Deactivate ${target.name}` }).click();
      await expect(page.getByRole('heading', { name: `Deactivate ${target.name}?` })).toBeVisible();
      await page.getByRole('button', { name: 'Yes, deactivate' }).click();
      await expect(row.getByText('Inactive', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await snapshotUser(target.uid)).status, { timeout: 15_000 }).toBe('inactive');
    });

    await test.step('the audit entry is attributed to the admin and carries a server-verified time', async () => {
      await expect.poll(async () => (await auditEntriesFor(target.uid)).length, { timeout: 15_000 }).toBeGreaterThan(0);
      const entry = (await auditEntriesFor(target.uid)).find((e) => e.eventType === 'account_suspended');
      expect(entry, 'an account_suspended audit entry').toBeTruthy();
      expect(entry!.performedBy).toBe(ctx.users.admin.uid);
      expect(entry!.institutionId).toBe(ctx.iid);
      expect(entry!.recordedAt, 'recordedAt must be a server timestamp').toBeTruthy();
    });

    await test.step('the deactivated account is refused with a clear message', async () => {
      await logout(page);
      await page.goto('/login');
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await page.getByLabel('Institution').selectOption({ label: INSTITUTION_NAME! });
      await page.getByLabel('Email Address').fill(creds('noDept').email);
      await page.getByLabel('Password', { exact: true }).fill(creds('noDept').password);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await expect(page.getByText('This account is inactive.')).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/login/);
    });

    await test.step('admin reactivates it and the person can sign in again', async () => {
      await loginAs(page, 'admin');
      const row = await openTeacherRow(page, target.name);
      await expect(row.getByText('Inactive', { exact: true })).toBeVisible({ timeout: 15_000 });
      await row.getByRole('button', { name: `Reactivate ${target.name}` }).click();
      await page.getByRole('button', { name: 'Yes, reactivate' }).click();
      await expect(row.getByText('Inactive', { exact: true })).toHaveCount(0, { timeout: 20_000 });
      await expect.poll(async () => (await snapshotUser(target.uid)).status, { timeout: 15_000 }).toBe('active');
      const entries = await auditEntriesFor(target.uid);
      expect(entries.some((e) => e.eventType === 'account_reactivated' && e.performedBy === ctx.users.admin.uid)).toBe(true);

      await logout(page);
      await loginAs(page, 'noDept');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    await test.step("the sign-in activity entry now carries a server-verified recordedAt", async () => {
      const snap = await db().collection('users').doc(target.uid).collection('activity_log').get();
      const withRecorded = snap.docs.filter((d) => d.data().eventType === 'sign_in' && d.data().recordedAt);
      expect(withRecorded.length, 'a sign_in entry with recordedAt').toBeGreaterThan(0);
    });
  } finally {
    await setUserFields(target.uid, { status: 'active' });
    await deleteAuditEntriesFor(target.uid);
  }
});

test('UI: an admin has no deactivate control on their own account or on other admins', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'admin');
  // The control is only rendered on the Teachers/Students/Parents lists, which
  // never list admins, and AccountStatusToggle refuses the signed-in user's own
  // uid — so a teacher row has it, and nothing named after the admin does.
  const row = await openTeacherRow(page, ctx.users.teacher.name);
  await expect(row.getByRole('button', { name: `Deactivate ${ctx.users.teacher.name}` })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`(De|Re)activate ${ctx.users.admin.name}`) })).toHaveCount(0);
});

// ── Rules: the users owner allow-list and the admin clause ──────────────────

const PROFILE_FIELDS = [
  'classId', 'status', 'houseId', 'email', 'idNumber', 'institutionStudentId', 'dateOfBirth', 'gender',
  'assignedClassId', 'canGenerateSchedule', 'homeroomRoom', 'departmentId', 'name', 'phone',
  'emergencyContact', 'mustChangePassword', 'toursCompleted', 'role', 'institutionId',
];

test('rules: a user can change only the allow-listed fields of their own document', async () => {
  const keys: Key[] = ['studentA', 'senior', 'teacher', 'superadmin'];
  const before: Record<string, Record<string, unknown>> = {};
  for (const k of keys) before[k] = await snapshotUser(ctx.users[k].uid);
  const me = (p: Record<string, Probe>, k: Key) => doc(p[k].db, 'users', ctx.users[k].uid);

  try {
    await withProbes(keys, async (p) => {
      await test.step('controls: tours and clearing the password flag are allowed', async () => {
        await expectAllowed('student marks a tour', updateDoc(me(p, 'studentA'), { 'toursCompleted.qa_lockdown_probe': true }));
        await expectAllowed('student clears mustChangePassword', updateDoc(me(p, 'studentA'), { mustChangePassword: false }));
        await expectAllowed('teacher marks a tour', updateDoc(me(p, 'teacher'), { 'toursCompleted.qa_lockdown_probe': true }));
      });

      await test.step('a student cannot edit trusted or identity fields', async () => {
        const denied: Record<string, unknown> = {
          classId: NOT_A_CLASS,
          status: 'inactive',
          houseId: 'qa-lockdown-house',
          email: 'qa.lockdown.hack@example.com',
          idNumber: 'QA-LOCKDOWN',
          institutionStudentId: 'QA-LOCKDOWN',
          dateOfBirth: '1999-01-01',
          gender: 'qa-lockdown',
          name: 'QA Lockdown Hacked',
          phone: '000-QA-LOCKDOWN',
          emergencyContact: 'QA Lockdown',
          role: 'institution_admin',
          institutionId: 'qa-lockdown-institution',
        };
        for (const [field, value] of Object.entries(denied)) {
          await expectDenied(`student edits own ${field}`, updateDoc(me(p, 'studentA'), { [field]: value }));
        }
        if (before.studentA.mustChangePassword !== true) {
          await expectDenied('student sets mustChangePassword back to true', updateDoc(me(p, 'studentA'), { mustChangePassword: true }));
        }
      });

      await test.step('a senior_teacher cannot grant themselves privileges', async () => {
        await expectDenied('senior sets assignedClassId', updateDoc(me(p, 'senior'), { assignedClassId: NOT_A_CLASS }));
        await expectDenied(
          'senior flips canGenerateSchedule',
          updateDoc(me(p, 'senior'), { canGenerateSchedule: !(before.senior.canGenerateSchedule === true) }),
        );
        await expectDenied('senior sets homeroomRoom', updateDoc(me(p, 'senior'), { homeroomRoom: 'QA-LOCKDOWN' }));
        await expectDenied('senior sets departmentId', updateDoc(me(p, 'senior'), { departmentId: 'qa-lockdown-dept' }));
        await expectDenied('senior renames themselves', updateDoc(me(p, 'senior'), { name: 'QA Lockdown Hacked' }));
      });

      await test.step('a regular teacher cannot change their department or contact details', async () => {
        await expectDenied('teacher sets departmentId', updateDoc(me(p, 'teacher'), { departmentId: 'qa-lockdown-dept' }));
        await expectDenied('teacher renames themselves', updateDoc(me(p, 'teacher'), { name: 'QA Lockdown Hacked' }));
        await expectDenied('teacher edits phone', updateDoc(me(p, 'teacher'), { phone: '000-QA-LOCKDOWN' }));
      });

      // A super_admin also passes the admin clause (only a super_admin may edit
      // admins), so they can edit any field of any users doc, their own included
      // — the owner allow-list exists to restrict everyone else. What stays
      // frozen for them is role and institutionId.
      await test.step("a super_admin can edit their contact details but not their role or institution", async () => {
        await expectAllowed('super_admin edits phone', updateDoc(me(p, 'superadmin'), { phone: '000-QA-LOCKDOWN' }));
        await expectAllowed('super_admin edits emergencyContact', updateDoc(me(p, 'superadmin'), { emergencyContact: 'QA Lockdown' }));
        await expectDenied('super_admin edits role', updateDoc(me(p, 'superadmin'), { role: 'institution_admin' }));
        await expectDenied('super_admin edits institutionId', updateDoc(me(p, 'superadmin'), { institutionId: ctx.iid }));
      });
    });
  } finally {
    for (const k of keys) await restoreUserFields(ctx.users[k].uid, before[k], PROFILE_FIELDS);
  }
});

test("rules: an institution_admin edits non-admins but not other admins, and only the allow-list on themselves", async () => {
  const others = await otherInstitutionAdmins(ctx.users.admin.uid);
  const targets = [ctx.users.noDept.uid, ctx.users.admin.uid, ...others.slice(0, 1).map((o) => o.uid)];
  const before: Record<string, Record<string, unknown>> = {};
  for (const uid of targets) before[uid] = await snapshotUser(uid);

  try {
    await withProbes(['admin', 'superadmin'], async (p) => {
      const adminRef = (uid: string) => doc(p.admin.db, 'users', uid);

      await expectAllowed('control: an admin edits a teacher', updateDoc(adminRef(ctx.users.noDept.uid), { phone: '000-QA-LOCKDOWN' }));
      await expectDenied('an admin edits their own phone', updateDoc(adminRef(ctx.users.admin.uid), { phone: '000-QA-LOCKDOWN' }));
      await expectAllowed('control: an admin marks their own tour', updateDoc(adminRef(ctx.users.admin.uid), { 'toursCompleted.qa_lockdown_probe': true }));

      if (others.length > 0) {
        const other = others[0].uid;
        await expectDenied('an admin edits another institution_admin', updateDoc(adminRef(other), { phone: '000-QA-LOCKDOWN' }));
        await expectAllowed(
          'control: a super_admin edits that institution_admin',
          updateDoc(doc(p.superadmin.db, 'users', other), { phone: '000-QA-LOCKDOWN' }),
        );
      } else {
        test.info().annotations.push({ type: 'note', description: 'No second institution_admin exists in the QA institution — the admin-vs-admin case was not exercised.' });
      }
    });
  } finally {
    for (const uid of targets) await restoreUserFields(uid, before[uid], ['phone', 'toursCompleted']);
  }
});

// ── Rules: the teachers mirror and senior-teacher department access ─────────

test('rules: the teachers mirror is admin-write-only, and senior access no longer needs it', async () => {
  const teacher = ctx.users.teacher;
  const mirrorPath = `teachers/${ctx.users.noDept.uid}`;
  const examPath = `institutions/${ctx.iid}/exams/${PROBE_PREFIX}exam`;
  const classA = await classIdByName('QA Assignments Class');
  const subject = await subjectIdByName('QA Lessons Subject');
  expect(teacher.departmentId, 'the QA teacher must have a department').toBeTruthy();

  await db().doc(mirrorPath).set({ institutionId: ctx.iid, name: ctx.users.noDept.name, departmentId: 'qa-lockdown-fake-dept' });
  await db().doc(examPath).set({
    institutionId: ctx.iid,
    termId: 'qa-lockdown',
    termName: 'QA',
    subjectId: subject,
    subjectName: 'QA Lessons Subject',
    classId: classA,
    className: 'QA Assignments Class',
    teacherId: teacher.uid,
    teacherName: teacher.name,
    departmentId: teacher.departmentId,
    date: '2099-01-01',
  });

  try {
    await withProbes(['noDept', 'admin', 'senior', 'studentA'], async (p) => {
      await test.step('the mirror: an owner cannot edit it, an admin can', async () => {
        await expectAllowed('control: an admin edits the mirror', updateDoc(doc(p.admin.db, mirrorPath), { name: 'QA Lockdown mirror' }));
        await expectDenied('a teacher edits their own mirror', updateDoc(doc(p.noDept.db, mirrorPath), { departmentId: 'qa-lockdown-other-dept' }));
      });

      await test.step("a senior_teacher in the department still edits its exam, via users.departmentId alone", async () => {
        await expectAllowed('senior edits a same-department exam', updateDoc(doc(p.senior.db, examPath), { room: 'QA-LOCKDOWN' }));
        await expectDenied('a student edits an exam', updateDoc(doc(p.studentA.db, examPath), { room: 'QA-HACK' }));
      });
    });
  } finally {
    await db().doc(mirrorPath).delete().catch(() => undefined);
    await db().doc(examPath).delete().catch(() => undefined);
  }
});

// ── Rules: activity_log and audit_log ───────────────────────────────────────

const iso = () => new Date().toISOString();

test('rules: activity-log entries are validated and carry a server-verified time', async () => {
  const studentA = ctx.users.studentA;
  const studentB = ctx.users.studentB;
  const ids = Array.from({ length: 14 }, (_, i) => `${PROBE_PREFIX}act-${i}`);
  const logOf = (p: Probe, uid: string, id: string) => doc(p.db, 'users', uid, 'activity_log', id);
  const entry = (uid: string, institution: string, over: Record<string, unknown> = {}) => ({
    eventType: 'sign_in',
    detail: 'QA lockdown probe',
    timestamp: iso(),
    recordedAt: serverTimestamp(),
    uid,
    institutionId: institution,
    ...over,
  });
  const withoutRecordedAt = () => {
    const e = entry(studentA.uid, ctx.iid) as Record<string, unknown>;
    delete e.recordedAt;
    return e;
  };

  try {
    await withProbes(['studentA', 'admin'], async (p) => {
      const s = p.studentA;
      await test.step('control: a well-formed sign_in entry is accepted', async () => {
        await expectAllowed('student logs a sign_in', setDoc(logOf(s, studentA.uid, ids[0]), entry(studentA.uid, ctx.iid)));
        await expectAllowed('student logs a profile_update', setDoc(logOf(s, studentA.uid, ids[1]), entry(studentA.uid, ctx.iid, { eventType: 'profile_update' })));
      });

      await test.step('forged or malformed entries are refused', async () => {
        await expectDenied('an event type the owner may not log', setDoc(logOf(s, studentA.uid, ids[2]), entry(studentA.uid, ctx.iid, { eventType: 'role_change' })));
        await expectDenied('a forged institutionId', setDoc(logOf(s, studentA.uid, ids[3]), entry(studentA.uid, 'qa-lockdown-other-institution')));
        await expectDenied('an extra key', setDoc(logOf(s, studentA.uid, ids[4]), entry(studentA.uid, ctx.iid, { foo: 'bar' })));
        await expectDenied('no recordedAt', setDoc(logOf(s, studentA.uid, ids[5]), withoutRecordedAt()));
        await expectDenied(
          'a client-chosen recordedAt',
          setDoc(logOf(s, studentA.uid, ids[6]), entry(studentA.uid, ctx.iid, { recordedAt: Timestamp.fromDate(new Date(2020, 0, 1)) })),
        );
        await expectDenied('a malformed timestamp string', setDoc(logOf(s, studentA.uid, ids[7]), entry(studentA.uid, ctx.iid, { timestamp: 'yesterday' })));
        await expectDenied('an oversized detail', setDoc(logOf(s, studentA.uid, ids[8]), entry(studentA.uid, ctx.iid, { detail: 'x'.repeat(201) })));
        await expectDenied("an entry in someone else's log", setDoc(logOf(s, studentB.uid, ids[9]), entry(studentB.uid, ctx.iid)));
      });

      await test.step("an admin may add only photo_update to another account's log", async () => {
        await expectAllowed('admin logs a photo_update', setDoc(logOf(p.admin, studentA.uid, ids[10]), entry(studentA.uid, ctx.iid, { eventType: 'photo_update' })));
        await expectDenied('admin logs a sign_in for someone else', setDoc(logOf(p.admin, studentA.uid, ids[11]), entry(studentA.uid, ctx.iid)));
        await expectDenied(
          'admin logs under a forged institutionId',
          setDoc(logOf(p.admin, studentA.uid, ids[12]), entry(studentA.uid, 'qa-lockdown-other-institution', { eventType: 'photo_update' })),
        );
      });
    });
  } finally {
    for (const id of ids) {
      await db().doc(`users/${studentA.uid}/activity_log/${id}`).delete().catch(() => undefined);
      await db().doc(`users/${studentB.uid}/activity_log/${id}`).delete().catch(() => undefined);
    }
  }
});

test('rules: audit-log entries must be attributed to the writer and carry a server-verified time', async () => {
  const admin = ctx.users.admin;
  const ids = Array.from({ length: 10 }, (_, i) => `${PROBE_PREFIX}audit-${i}`);
  const auditOf = (p: Probe, id: string) => doc(p.db, 'institutions', ctx.iid, 'audit_log', id);
  const entry = (over: Record<string, unknown> = {}) => ({
    eventType: 'account_suspended',
    detail: 'QA lockdown probe',
    targetUid: ctx.users.noDept.uid,
    targetName: ctx.users.noDept.name,
    performedBy: admin.uid,
    performedByName: admin.name,
    timestamp: iso(),
    recordedAt: serverTimestamp(),
    institutionId: ctx.iid,
    ...over,
  });
  const withoutRecordedAt = () => {
    const e = entry() as Record<string, unknown>;
    delete e.recordedAt;
    return e;
  };

  try {
    await withProbes(['admin', 'teacher'], async (p) => {
      await expectAllowed('control: an admin writes a well-formed entry', setDoc(auditOf(p.admin, ids[0]), entry()));
      await expectAllowed('control: every audit event type the app writes', setDoc(auditOf(p.admin, ids[1]), entry({ eventType: 'photo_change' })));
      await expectAllowed('control: an admin clearing a session (session_reset)', setDoc(auditOf(p.admin, ids[9]), entry({ eventType: 'session_reset' })));

      await expectDenied('performedBy someone else', setDoc(auditOf(p.admin, ids[2]), entry({ performedBy: ctx.users.teacher.uid })));
      await expectDenied('no recordedAt', setDoc(auditOf(p.admin, ids[3]), withoutRecordedAt()));
      await expectDenied('a client-chosen recordedAt', setDoc(auditOf(p.admin, ids[4]), entry({ recordedAt: Timestamp.fromDate(new Date(2020, 0, 1)) })));
      await expectDenied('an unknown event type', setDoc(auditOf(p.admin, ids[5]), entry({ eventType: 'made_up_event' })));
      await expectDenied('an extra key', setDoc(auditOf(p.admin, ids[6]), entry({ foo: 'bar' })));
      await expectDenied('an oversized detail', setDoc(auditOf(p.admin, ids[7]), entry({ detail: 'x'.repeat(301) })));
      await expectDenied('a teacher writing an audit entry', setDoc(auditOf(p.teacher, ids[8]), entry({ performedBy: ctx.users.teacher.uid })));
    });
  } finally {
    for (const id of ids) await deleteByPath(`institutions/${ctx.iid}/audit_log/${id}`).catch(() => undefined);
  }
});

// ── Rules: account status ───────────────────────────────────────────────────

test('rules: a deactivated account keeps only read access to its own document', async () => {
  const target = ctx.users.noDept;
  const own = (p: Probe) => doc(p.db, 'users', target.uid);
  const classes = (p: Probe) => query(collection(p.db, 'institutions', ctx.iid, 'classes'), limit(1));
  const logId = `${PROBE_PREFIX}status-act`;

  try {
    await withProbes(['noDept'], async (p) => {
      await test.step('control: an active teacher reads reference data and logs a sign_in', async () => {
        await expectAllowed('active teacher reads classes', getDocs(classes(p.noDept)));
        await expectAllowed(
          'active teacher logs a sign_in',
          setDoc(doc(p.noDept.db, 'users', target.uid, 'activity_log', logId), {
            eventType: 'sign_in', detail: 'QA lockdown probe', timestamp: iso(),
            recordedAt: serverTimestamp(), uid: target.uid, institutionId: ctx.iid,
          }),
        );
      });

      await setUserFields(target.uid, { status: 'inactive' });

      await test.step('deactivated: own document stays readable (the app needs it to show the message)', async () => {
        await expectAllowed('inactive account reads its own users doc', getDoc(own(p.noDept)));
      });
      await test.step('deactivated: everything else is refused', async () => {
        await expectDenied('inactive account reads classes', getDocs(classes(p.noDept)));
        await expectDenied(
          'inactive account logs a sign_in',
          setDoc(doc(p.noDept.db, 'users', target.uid, 'activity_log', `${logId}-2`), {
            eventType: 'sign_in', detail: 'QA lockdown probe', timestamp: iso(),
            recordedAt: serverTimestamp(), uid: target.uid, institutionId: ctx.iid,
          }),
        );
      });

      await setUserFields(target.uid, { status: 'active' });

      await test.step('reactivated: access returns', async () => {
        await expectAllowed('reactivated teacher reads classes', getDocs(classes(p.noDept)));
      });
    });
  } finally {
    await setUserFields(target.uid, { status: 'active' });
    for (const id of [logId, `${logId}-2`]) {
      await db().doc(`users/${target.uid}/activity_log/${id}`).delete().catch(() => undefined);
    }
  }
});

test('rules: an account with no status field is treated as active', async () => {
  // Older documents never had a status; the rules must not lock them out. The
  // super_admin QA account is one of the two such documents in production.
  const sup = ctx.users.superadmin;
  const data = await docAtPath(`users/${sup.uid}`);
  test.skip(!!data?.status, 'The QA super_admin now has a status; nothing to check here.');
  await withProbes(['superadmin'], async (p) => {
    await expectAllowed('a status-less super_admin reads their own document', getDoc(doc(p.superadmin.db, 'users', sup.uid)));
    await expectAllowed('a status-less super_admin reads institutions', getDocs(query(collection(p.superadmin.db, 'institutions'), limit(1))));
  });
});
