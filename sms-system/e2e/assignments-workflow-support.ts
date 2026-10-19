import { expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { dismissTourIfPresent } from './helpers';

// Helpers for 08-assignments-workflow.spec.ts, moved out of it unchanged so the spec reads as its tests:
// the optional Firebase Admin SDK handle and the ground-truth reads, the .env.qa credentials and the fixture
// names, the idempotent `ensure*` fixture builders, and the UI helpers that create and open an assignment.


// Ground-truth existence checks against Firestore directly, bypassing the
// UI entirely — found necessary while building this spec: any UI-text-
// based "has this already been submitted?" check races the detail page's
// own mySubmission onSnapshot (starts null, resolves async), and even a
// waited check can resolve on a transient default label before the real
// data loads, silently firing a genuine duplicate write on every re-run.
// Same service-account.json convention as every scripts/*.mjs tool here.
// Deliberately Firestore-only (no firebase-admin/auth import) — that
// module pulls in jwks-rsa's JWT-verification machinery, which broke
// Playwright's own test-file loader outright ("No tests found") the one
// time this tried importing it; a users/{uid} lookup by email covers the
// same need without it.
const SERVICE_ACCOUNT_PATH = 'scripts/service-account.json';
const HAS_ADMIN_SDK = existsSync(SERVICE_ACCOUNT_PATH);
if (HAS_ADMIN_SDK && getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))) });
}
const adminDb = HAS_ADMIN_SDK ? getFirestore() : null;

let cachedInstitutionId: string | null = null;
async function resolveInstitutionId(): Promise<string> {
  if (cachedInstitutionId) return cachedInstitutionId;
  const snap = await adminDb!.collection('institutions').where('name', '==', INSTITUTION_NAME).limit(1).get();
  cachedInstitutionId = snap.docs[0].id;
  return cachedInstitutionId;
}

async function resolveUidByEmail(email: string): Promise<string> {
  const snap = await adminDb!.collection('users').where('email', '==', email).limit(1).get();
  return snap.docs[0].id;
}

// assignmentId is read off the current page's own URL
// (/dashboard/list/assignments/{id}) — no need to hardcode or separately
// resolve it, and it always matches whichever fixture the UI is currently
// looking at.
export async function submissionExists(page: Page, studentEmail: string): Promise<boolean> {
  if (!adminDb) return false; // no service account available — caller's own UI wait is the fallback
  const assignmentId = page.url().split('/dashboard/list/assignments/')[1];
  const [institutionId, uid] = await Promise.all([
    resolveInstitutionId(),
    resolveUidByEmail(studentEmail),
  ]);
  const snap = await adminDb
    .collection('institutions').doc(institutionId)
    .collection('assignments').doc(assignmentId)
    .collection('submissions').doc(uid)
    .get();
  return snap.exists;
}

// Ground-truth-first column check: the Gradebook page's own column-
// creation modal has a real, pre-existing bug unrelated to this feature
// (ColumnCreationModal.onCreated() adds the new column to local state
// optimistically, and the page's own onSnapshot independently adds the
// same doc again, producing a genuine React "two children with the same
// key" collision that reliably hid the label text from every idempotency
// check tried here, causing repeat duplicate creation). Reading Firestore
// directly first avoids ever touching that buggy path when a column
// already exists, which — once created — is otherwise a perfectly normal,
// readable document (this only affects the creation UI's own render).
export async function findGradebookColumn(label: string): Promise<string | null> {
  if (!adminDb) return null;
  const institutionId = await resolveInstitutionId();
  const [classSnap, subjectSnap, termSnap] = await Promise.all([
    adminDb.collection('institutions').doc(institutionId).collection('classes').where('name', '==', CLASS_A_NAME).limit(1).get(),
    adminDb.collection('institutions').doc(institutionId).collection('subjects').where('name', '==', SUBJECT_NAME).limit(1).get(),
    adminDb.collection('institutions').doc(institutionId).collection('terms').where('name', '==', TERM_NAME).limit(1).get(),
  ]);
  if (classSnap.empty || subjectSnap.empty || termSnap.empty) return null;
  const gradebookId = `${classSnap.docs[0].id}_${subjectSnap.docs[0].id}_${termSnap.docs[0].id}`;
  const colSnap = await adminDb
    .collection('institutions').doc(institutionId)
    .collection('gradebooks').doc(gradebookId)
    .collection('columns')
    .where('label', '==', label)
    .limit(1)
    .get();
  return colSnap.empty ? null : colSnap.docs[0].id;
}

// Ground-truth check for the `results` doc a grading/conversion action
// produces — score rescaling (§4.5) and gradebookColumnId linkage aren't
// practically inspectable through the Gradebook grid's own UI (would need
// term/class/subject selection plus row/column-index matching), so this
// reads the same collection performSave()/gradeSubmission()/
// convertAssignmentToGradebook() write to directly instead.
export async function getResultForAssignment(assignmentId: string): Promise<Record<string, unknown> | null> {
  if (!adminDb) return null;
  const institutionId = await resolveInstitutionId();
  const snap = await adminDb
    .collection('institutions').doc(institutionId)
    .collection('results')
    .where('assignmentId', '==', assignmentId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data();
}


const ENV_QA_PATH = '.env.qa';
export const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME; // "Example School"
export const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD;
export const TEACHER_EMAIL = process.env.QA_TEACHER_EMAIL;
export const TEACHER_PASSWORD = process.env.QA_TEACHER_PASSWORD;
export const SENIOR_TEACHER_EMAIL = process.env.QA_SENIOR_TEACHER_EMAIL;
export const SENIOR_TEACHER_PASSWORD = process.env.QA_SENIOR_TEACHER_PASSWORD;

const TERM_NAME = 'Christmas Term';
export const CLASS_A_NAME = 'QA Assignments Class';
export const CLASS_B_NAME = 'QA Assignments Class B'; // cross-class-denial fixture only, no student enrolled
const SUBJECT_NAME = 'QA Assignments Subject';
export const RUBRIC_TITLE = 'QA Assignments Rubric';

export const STUDENT_NAME = 'QaAssignments Student';
export const STUDENT_EMAIL = 'qa.assignments.student@demo.com';
export const PARENT_NAME = 'QaAssignments Parent';
export const PARENT_EMAIL = 'qa.assignments.parent@demo.com';
export const SENIOR_TEACHER_2_NAME = 'QaAssignments SeniorTeacherTwo';
export const SENIOR_TEACHER_2_EMAIL = 'qa.assignments.seniorteacher2@demo.com';
export const FIXTURE_PASSWORD = 'Password123';

export function persistCredential(key: string, value: string) {
  const contents = readFileSync(ENV_QA_PATH, 'utf8');
  const line = `${key}="${value}"`;
  const updated = contents.includes(`${key}=`)
    ? contents.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${contents.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_QA_PATH, updated);
}

export async function ensureClassExists(page: Page, className: string) {
  await page.goto('/dashboard/list/classes');
  await dismissTourIfPresent(page);
  // Same race fixed elsewhere in this spec: the list's onSnapshot needs a
  // moment to populate after navigation, or this idempotency check can
  // still say "doesn't exist" for something created moments earlier.
  await page.waitForTimeout(1500);
  if (await page.getByText(className, { exact: true }).isVisible().catch(() => false)) return;

  await page.getByRole('button', { name: 'Add new class' }).click();
  await page.locator('input[name="name"]').fill(className);
  await page.locator('input[name="capacity"]').fill('10');
  await page.locator('input[name="grade"]').fill('7');
  await page.locator('select[name="termId"]').selectOption({ label: TERM_NAME });
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(className, { exact: true })).toBeVisible({ timeout: 10_000 });
}

export async function ensureSubjectExists(page: Page, teacherName: string) {
  await page.goto('/dashboard/list/subjects');
  await dismissTourIfPresent(page);
  await page.waitForTimeout(1500);
  if (await page.getByText(SUBJECT_NAME, { exact: true }).isVisible().catch(() => false)) return;

  // SubjectForm's class checklist reads useInstitutionClasses() — a 60s-
  // staleTime react-query cache (queryClient.ts), keyed ['classes',
  // institutionId]. FormModal's own closeModal() does call
  // invalidateQueries() for that key after a class is created, but that
  // only marks the *cache entry* stale; it doesn't force an *already-open*
  // Subjects page to pick up the two classes ensureClassExists() just
  // created moments earlier via the Classes list page. A hard reload here
  // forces a genuinely fresh mount/fetch instead of trusting the stale-
  // while-revalidate window to resolve before the .check() below runs.
  await page.reload();
  await dismissTourIfPresent(page);

  await page.getByRole('button', { name: 'Add new subject' }).click();
  await page.locator('input[name="name"]').fill(SUBJECT_NAME);
  await page.getByText('Specific Class(es)').click();
  await page.getByLabel(CLASS_A_NAME, { exact: true }).check();
  await page.getByLabel(CLASS_B_NAME, { exact: true }).check();
  await page.getByLabel(teacherName, { exact: true }).check();
  // Attendance Frequency defaults to Weekly with no day pre-checked —
  // "Select at least one day." blocks submission otherwise.
  await page.getByLabel('Mon', { exact: true }).check();
  await page.getByLabel('Wed', { exact: true }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(SUBJECT_NAME, { exact: true })).toBeVisible({ timeout: 10_000 });
}

export async function ensureGradebookColumn(page: Page, opts: { label: string; maxScore: number; weight: number }) {
  await page.goto('/dashboard/list/gradebook');
  await dismissTourIfPresent(page);
  await page.waitForTimeout(1500);

  const termSelect = page.locator('select').filter({ has: page.locator('option', { hasText: TERM_NAME }) });
  await expect(termSelect).toBeVisible({ timeout: 10_000 });
  await termSelect.selectOption({ label: TERM_NAME });
  const classSelect = page.locator('select').filter({ has: page.locator('option', { hasText: CLASS_A_NAME }) });
  await classSelect.selectOption({ label: CLASS_A_NAME });
  const subjectSelect = page.locator('select').filter({ has: page.locator('option', { hasText: SUBJECT_NAME }) });
  await expect(subjectSelect).toBeEnabled({ timeout: 10_000 });
  await subjectSelect.selectOption({ label: SUBJECT_NAME });

  if (await page.getByText(opts.label, { exact: true }).isVisible({ timeout: 10_000 }).catch(() => false)) return;
  await page.reload();
  await dismissTourIfPresent(page);
  await termSelect.selectOption({ label: TERM_NAME });
  await classSelect.selectOption({ label: CLASS_A_NAME });
  await expect(subjectSelect).toBeEnabled({ timeout: 10_000 });
  await subjectSelect.selectOption({ label: SUBJECT_NAME });
  if (await page.getByText(opts.label, { exact: true }).isVisible({ timeout: 8_000 }).catch(() => false)) return;

  await page.locator('#tour-gradebook-add-column').click();
  await expect(page.getByRole('heading', { name: 'Add column' })).toBeVisible({ timeout: 10_000 });
  await page.locator('input[name="label"]').fill(opts.label);
  await page.locator('select[name="assessmentType"]').selectOption({ label: 'Coursework' });
  await page.locator('input[name="maxScore"]').fill(String(opts.maxScore));
  await page.locator('input[name="columnWeight"]').fill(String(opts.weight));
  await page.getByRole('button', { name: 'Add Column', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add column' })).toHaveCount(0, { timeout: 10_000 });
  // ColumnCreationModal's onCreated callback adds the new column to local
  // state optimistically, and the page's own onSnapshot listener adds it
  // again independently — a real, pre-existing "two children with the same
  // key" React warning observed here, unrelated to this feature. A reload
  // clears it (fresh, de-duplicated fetch) rather than trusting the
  // post-create render.
  if (!(await page.getByText(opts.label, { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false))) {
    await page.reload();
    await dismissTourIfPresent(page);
    await termSelect.selectOption({ label: TERM_NAME });
    await classSelect.selectOption({ label: CLASS_A_NAME });
    await expect(subjectSelect).toBeEnabled({ timeout: 10_000 });
    await subjectSelect.selectOption({ label: SUBJECT_NAME });
  }
  await expect(page.getByText(opts.label, { exact: true })).toBeVisible({ timeout: 10_000 });
}

export async function ensureRubricExists(page: Page) {
  await page.goto('/dashboard/list/rubrics');
  await dismissTourIfPresent(page);
  await page.waitForTimeout(1500);
  if (await page.getByText(RUBRIC_TITLE, { exact: true }).isVisible().catch(() => false)) return;

  await page.getByRole('button', { name: 'Add new rubric' }).click();
  await page.locator('input[name="title"]').fill(RUBRIC_TITLE);
  // RubricForm's criterion-name/max-points inputs have neither a `name`
  // attribute nor a placeholder (plain controlled state, not react-hook-
  // form — see RubricForm.tsx) — located via their preceding <label>
  // sibling instead.
  await page.locator('xpath=//label[normalize-space(text())="Criterion name"]/following-sibling::input[1]').fill('Content quality');
  await page.locator('xpath=//label[normalize-space(text())="Max points"]/following-sibling::input[1]').fill('10');
  await page.locator('input[placeholder="Label (e.g. Excellent)"]').first().fill('Excellent');
  await page.locator('input[placeholder="Points"]').first().fill('10');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(RUBRIC_TITLE, { exact: true })).toBeVisible({ timeout: 10_000 });
}

export async function ensureUserExists(
  page: Page,
  opts: { name: string; email: string; roleLabel: 'Student' | 'Parent' | 'Senior Teacher'; className?: string },
) {
  const [firstName, lastName] = opts.name.split(' ');
  const listPath =
    opts.roleLabel === 'Student' ? '/dashboard/list/students'
    : opts.roleLabel === 'Parent' ? '/dashboard/list/parents'
    : '/dashboard/list/teachers';
  await page.goto(listPath);
  await dismissTourIfPresent(page);
  await page.waitForTimeout(1500);
  if (await page.getByText(opts.name, { exact: true }).isVisible().catch(() => false)) return;

  await page.goto('/dashboard/create-user');
  await dismissTourIfPresent(page);
  await page.locator('#tour-create-user-first-name').fill(firstName);
  await page.locator('#tour-create-user-last-name').fill(lastName);
  await page.locator('#tour-create-user-email').fill(opts.email);
  await page.locator('#tour-create-user-password').fill(FIXTURE_PASSWORD);
  await page.locator('#tour-create-user-confirm-password').fill(FIXTURE_PASSWORD);
  await page.locator('#tour-create-user-role').selectOption({ label: opts.roleLabel });
  if (opts.roleLabel === 'Student' && opts.className) {
    await page.locator('#tour-create-user-class').selectOption({ label: opts.className });
    await page.locator('#tour-create-user-dob').fill('2010-01-15');
    await page.locator('#tour-create-user-gender').selectOption({ label: 'Female' });
  }
  if (opts.roleLabel === 'Senior Teacher') {
    // Needed for §3 decision 11's cross-senior_teacher visibility check —
    // found live, the hard way: "Example School"'s own pre-existing
    // regularteacher@demo.com/seniorteacher1@demo.com accounts had no
    // departmentId set at all despite "Example Department" existing and
    // naming one of them its head teacher, so this field isn't safe to
    // assume is populated just because a department exists.
    const deptSelect = page.locator('#tour-create-user-department');
    if (await deptSelect.isVisible().catch(() => false)) {
      await deptSelect.selectOption({ label: 'Example Department' });
    }
  }
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(`${opts.name} was created successfully.`)).toBeVisible({ timeout: 10_000 });
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Matches list/assignments/index.tsx's/list/assignments/[id]/index.tsx's
// own rendering exactly: `new Date(dueDate + 'T00:00:00').toLocaleDateString
// ('en-US', { month: 'long', day: 'numeric', year: 'numeric' })` — used
// below to disambiguate which row/assignment is which, since the list
// page's clickable link text is the *subject* name, not the assignment
// title, and several fixture assignments below share the same subject.
function dueDateLabel(offsetDays: number): string {
  return new Date(`${isoDate(offsetDays)}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

type CreateAssignmentOpts = {
  title: string;
  className: string;
  dueDateOffsetDays: number;
  type?: string; // ASSIGNMENT_VALUE_TYPE_LABELS value, e.g. 'Homework'
  status?: 'Draft' | 'Published';
  gradingMode?: 'gradebook' | 'standalone';
  gradebookColumnId?: string; // required when gradingMode === 'gradebook'
  rubricTitle?: string;
};

// Drives AssignmentForm.tsx as a teacher (regular or senior) — Teacher
// field is locked/self-attributed for those roles, so there's no Teacher
// select to fill, unlike an admin creating on a teacher's behalf.
export async function createAssignmentAsTeacher(page: Page, opts: CreateAssignmentOpts) {
  await page.goto('/dashboard/list/assignments');
  await dismissTourIfPresent(page);
  // The list's onSnapshot needs a moment to populate after navigation —
  // checked with a real wait (not just isVisible()'s instant check) so the
  // idempotency check below isn't racing an empty first paint.
  await page.waitForTimeout(1500);
  if (await assignmentRow(page, opts.className, opts.dueDateOffsetDays).isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Add new assignment' }).click();
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 });

  await page.locator('input[name="title"]').fill(opts.title);
  await page.locator('select[name="termId"]').selectOption({ label: TERM_NAME });
  await page.locator('select[name="subjectId"]').selectOption({ label: SUBJECT_NAME });
  await page.locator('select[name="classId"]').selectOption({ label: opts.className });
  await page.locator('input[name="dueDate"]').fill(isoDate(opts.dueDateOffsetDays));
  if (opts.type) await page.locator('select[name="type"]').selectOption({ label: opts.type });
  if (opts.status) await page.locator('select[name="status"]').selectOption({ label: opts.status });
  if (opts.gradingMode) {
    await page.locator('select[name="gradingMode"]').selectOption({
      label: opts.gradingMode === 'gradebook' ? 'Add to Gradebook' : 'Standalone (not in Gradebook)',
    });
  }
  if (opts.gradingMode === 'gradebook' && opts.gradebookColumnId) {
    const colSelect = page.locator('select[name="gradebookColumnId"]');
    await expect(colSelect).toBeEnabled({ timeout: 10_000 });
    await colSelect.selectOption({ value: opts.gradebookColumnId });
  }
  if (opts.rubricTitle) {
    await page.locator('select[name="rubricId"]').selectOption({ label: opts.rubricTitle });
  }
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Create a new assignment' })).toHaveCount(0, { timeout: 10_000 });
}

// Row-scoped: the list page's clickable link is the *subject name*, so
// disambiguating between several fixture assignments sharing one subject
// needs the class + due-date columns too.
export function assignmentRow(page: Page, className: string, dueDateOffsetDays: number) {
  // Exact cell/accessible-name matches, not substring hasText() — "QA
  // Assignments Class" vs "QA Assignments Class B" bit this for real:
  // hasText: 'QA Assignments Class' also matched the Class B row (its class
  // cell's text contains that string), so this once opened the wrong
  // assignment entirely. getByRole(..., { exact: true }) requires the whole
  // accessible name to match, not just contain it.
  //
  // .first() throughout: a transient double-render of a row was also
  // observed empirically in this environment (resolves to one real row
  // moments later, not a genuine duplicate document) — every caller here
  // wants "the one row matching this," never a true multi-match set, and
  // .toHaveCount(0) remains correct against an empty match either way.
  return page
    .locator('tr')
    .filter({ has: page.getByRole('link', { name: SUBJECT_NAME, exact: true }) })
    .filter({ has: page.getByRole('cell', { name: className, exact: true }) })
    .filter({ hasText: dueDateLabel(dueDateOffsetDays) })
    .first();
}

// Defensive re-check for a fresh account's very first login. login()
// already handles a single /change-password redirect, but — reproduced
// empirically while building this spec — a hard page.goto() immediately
// afterward can race the app's own mustChangePassword-cleared write and
// bounce back to /change-password a second time. Idempotent: a no-op once
// truly past it.
export async function ensurePastChangePassword(page: Page, password: string) {
  if (!page.url().includes('/change-password')) return;
  await page.getByLabel('New Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm New Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set Password & Continue' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

export async function openAssignment(page: Page, className: string, dueDateOffsetDays: number) {
  await page.goto('/dashboard/list/assignments');
  await dismissTourIfPresent(page);
  // Same onSnapshot/cache staleness pattern observed and reload-worked-
  // around elsewhere in this spec (see the parent-link fixture step) —
  // reload up to twice before giving up, rather than a bare wait that's
  // already proven insufficient for this app's listeners in this
  // environment. Waits for the link's *own text* (item.subjectName), not
  // just the row's existence — empirically, the row/href can render before
  // the document's own fields have fully hydrated into that render, leaving
  // a real-but-empty-text link Playwright would otherwise click blindly.
  const link = assignmentRow(page, className, dueDateOffsetDays).getByRole('link').first();
  let ready = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const text = await link.textContent({ timeout: 10_000 }).catch(() => null);
    if (text && text.trim().length > 0) {
      ready = true;
      break;
    }
    await page.reload();
    await dismissTourIfPresent(page);
  }
  // A parent's list query is a slower multi-hop fan-out (resolve each
  // linked child's classId first, then query) than every other role's —
  // give it one more, longer settle beyond the standard retry budget above
  // rather than clicking blind into an empty-text link.
  if (!ready) {
    await page.waitForTimeout(5_000);
    await page.reload();
    await dismissTourIfPresent(page);
  }
  await link.click({ timeout: 20_000 });
  await page.waitForURL(/\/dashboard\/list\/assignments\/[^/]+$/, { timeout: 10_000 });
}
