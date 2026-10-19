import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { login, dismissTourIfPresent } from './helpers';
import {
  NOTE_PREFIX,
  openProbe,
  seedNote,
  userByEmail,
  type Probe,
  type UserInfo,
} from './lesson-notes-support';

// Helpers for 09-lesson-notes.spec.ts, moved out of it unchanged so the spec reads as its tests: the .env.qa
// credentials and fixture users, the notes' names, the `ctx` the serial tests fill in turn, the login and row
// helpers, the user and subject builders, and the rule-probe helpers. The data layer they build on stays in
// lesson-notes-support.ts.

export const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const CREDS = {
  admin: { email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD },
  senior: { email: process.env.QA_SENIOR_TEACHER_EMAIL, password: process.env.QA_SENIOR_TEACHER_PASSWORD },
  senior2: {
    email: process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL,
    password: process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD,
  },
  studentA: { email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL, password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD },
  parent: { email: process.env.QA_ASSIGNMENTS_PARENT_EMAIL, password: process.env.QA_ASSIGNMENTS_PARENT_PASSWORD },
  superadmin: { email: process.env.QA_SUPERADMIN_EMAIL, password: process.env.QA_SUPERADMIN_PASSWORD },
};
// Fixture accounts this spec creates itself (credentials persisted to .env.qa).
type FixtureWho = 'teacher' | 'studentB';
type Who = keyof typeof CREDS | FixtureWho;

export const CLASS_A_NAME = 'QA Assignments Class';
export const CLASS_B_NAME = 'QA Assignments Class B';
export const SUBJECT_NAME = 'QA Lessons Subject';
export const DEPARTMENT_NAME = 'Example Department';

// AdminCreateUserForm pre-fills a per-role default password when the role is
// selected (ROLE_DEFAULT_PASSWORDS), overwriting anything typed beforehand —
// so these accounts use that default rather than a password of our choosing.
export const FIXTURES: Record<FixtureWho, { name: string; email: string; envPrefix: string; password: string }> = {
  teacher: {
    name: 'QaLessons Teacher',
    email: 'qa.lessons.teacher@demo.com',
    envPrefix: 'QA_LESSONS_TEACHER',
    password: 'Teacher0123456789',
  },
  studentB: {
    name: 'QaLessons StudentB',
    email: 'qa.lessons.studentb@demo.com',
    envPrefix: 'QA_LESSONS_STUDENT_B',
    password: 'Student01234567890',
  },
};

export const LESSONS_HREF = '/dashboard/list/lesson-notes';
export const PDF_PATH = 'e2e/.fixtures/qa-submission.pdf';
export const PDF_BYTES = readFileSync(PDF_PATH);
export const PDF_DATA_URL = `data:application/pdf;base64,${PDF_BYTES.toString('base64')}`;

// Names of the notes seeded through the Admin SDK (rules-shaped), plus the
// ones the UI tests create themselves.
export const N = {
  classA: `${NOTE_PREFIX} Teacher Class A`,
  subjectOnly: `${NOTE_PREFIX} Subject Only`,
  classB: `${NOTE_PREFIX} Teacher Class B`,
  seniorOwn: `${NOTE_PREFIX} Senior Own`,
  badLink: `${NOTE_PREFIX} Bad Link`,
  deleteTarget: `${NOTE_PREFIX} Delete Target`,
  seniorEdit: `${NOTE_PREFIX} Senior Edit Target`,
  uiCreated: `${NOTE_PREFIX} UI Created`,
  adminNote: `${NOTE_PREFIX} Admin Note`,
};

export type Ctx = {
  iid: string;
  classA: string;
  classB: string;
  subject: string;
  admin: UserInfo;
  teacher: UserInfo;
  senior: UserInfo;
  senior2: UserInfo;
  studentA: UserInfo;
  studentB: UserInfo;
  parent: UserInfo;
  ids: Record<keyof typeof N, string>;
};
export const ctx = {} as Ctx;

export function need(who: Who): { email: string; password: string } {
  if (who === 'teacher' || who === 'studentB') {
    const f = FIXTURES[who];
    return { email: f.email, password: process.env[`${f.envPrefix}_PASSWORD`] ?? f.password };
  }
  const c = CREDS[who];
  if (!c.email || !c.password) throw new Error(`QA credentials for ${who} are missing from .env.qa`);
  return { email: c.email, password: c.password };
}

// Defensive re-check for a fresh account's first login — see
// 08-assignments-workflow.spec.ts's ensurePastChangePassword.
async function ensurePastChangePassword(page: Page, password: string) {
  if (!page.url().includes('/change-password')) return;
  await page.getByLabel('New Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm New Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set Password & Continue' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

export async function loginAs(page: Page, who: Who): Promise<void> {
  const c = need(who);
  await login(page, {
    institutionLabel: who === 'superadmin' ? 'Platform Administration' : INSTITUTION_NAME!,
    email: c.email,
    password: c.password,
  });
  await ensurePastChangePassword(page, c.password);
  // A brand-new fixture account's very first login can bounce back to
  // /change-password once more, a moment after the first change (the app's
  // mustChangePassword write races its own redirect — see 08's
  // ensurePastChangePassword). Give it time to settle, re-checking, rather than
  // asserting on whatever page happens to be showing. A no-op once the
  // account has been through it (later runs land straight on /dashboard).
  if (who === 'teacher' || who === 'studentB') {
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(2_500);
      if (!page.url().includes('/change-password')) break;
      await ensurePastChangePassword(page, c.password);
    }
    await expect(page).toHaveURL(/\/dashboard/);
  }
  // Only institution_admin gets an auto-started product tour whose overlay
  // intercepts clicks (App.tsx ROLES_WITH_REAL_TOURS).
  if (who === 'admin') await dismissTourIfPresent(page);
}

// Opens the page through the sidebar item, so the nav entry itself is under test.
export async function openLessonsViaSidebar(page: Page) {
  await page.getByRole('link', { name: 'Lessons', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${LESSONS_HREF}$`));
}

export const row = (page: Page, name: string) => page.locator('tr', { hasText: name }).first();

// The dashboard's Quick Actions panel. Scoped explicitly because the sidebar
// has same-named links ("Assignments", "Results", "Lessons"), which would
// otherwise make every card locator ambiguous.
export const quickActions = (page: Page) =>
  page.getByRole('heading', { name: 'Quick Actions' }).locator('xpath=..');

export async function expectRowVisible(page: Page, name: string) {
  await expect(row(page, name)).toBeVisible({ timeout: 15_000 });
}
export async function expectRowAbsent(page: Page, name: string) {
  // List listeners settle asynchronously — give a visible sibling time to
  // render first (callers assert one present row before calling this), then
  // require the absent one to stay absent.
  await expect(page.locator('tr', { hasText: name })).toHaveCount(0, { timeout: 5_000 });
}

export async function expectNoWriteControls(page: Page) {
  await expect(page.getByRole('button', { name: 'Add new lesson note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete lesson note' })).toHaveCount(0);
}

export async function selectOptionTexts(page: Page, selector: string): Promise<string[]> {
  const texts = await page.locator(`${selector} option`).allTextContents();
  return texts.map((t) => t.trim()).filter((t) => t && t !== 'None').sort();
}

export async function userExists(email: string): Promise<boolean> {
  try {
    await userByEmail(email);
    return true;
  } catch {
    return false;
  }
}

// Same /dashboard/create-user flow 08-assignments-workflow.spec.ts drives.
export async function createUserViaForm(
  page: Page,
  opts: { name: string; email: string; password: string; roleLabel: 'Regular Teacher' | 'Student'; className?: string; department?: string },
) {
  const [firstName, lastName] = opts.name.split(' ');
  await page.goto('/dashboard/create-user');
  await dismissTourIfPresent(page);
  await page.locator('#tour-create-user-first-name').fill(firstName);
  await page.locator('#tour-create-user-last-name').fill(lastName);
  await page.locator('#tour-create-user-email').fill(opts.email);
  // Role first: selecting it pre-fills the role's default password, so the
  // password fields are set (explicitly, to the same value) only afterwards.
  await page.locator('#tour-create-user-role').selectOption({ label: opts.roleLabel });
  await page.locator('#tour-create-user-password').fill(opts.password);
  await page.locator('#tour-create-user-confirm-password').fill(opts.password);
  if (opts.roleLabel === 'Student') {
    await page.locator('#tour-create-user-class').selectOption({ label: opts.className! });
    await page.locator('#tour-create-user-dob').fill('2010-01-15');
    await page.locator('#tour-create-user-gender').selectOption({ label: 'Female' });
  }
  if (opts.department) {
    await page.locator('#tour-create-user-department').selectOption({ label: opts.department });
  }
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(`${opts.name} was created successfully.`)).toBeVisible({ timeout: 15_000 });
}

// Mirrors 08's ensureSubjectExists: a hard reload first, because the form's
// teacher and class checklists read 60s-cached reference queries that won't
// include accounts/classes created moments earlier.
export async function createLessonsSubject(page: Page, teacherName: string) {
  await page.goto('/dashboard/list/subjects');
  await dismissTourIfPresent(page);
  await page.reload();
  await dismissTourIfPresent(page);
  await page.getByRole('button', { name: 'Add new subject' }).click();
  await page.locator('input[name="name"]').fill(SUBJECT_NAME);
  await page.getByText('Specific Class(es)').click();
  await page.getByLabel(CLASS_A_NAME, { exact: true }).check();
  await page.getByLabel(CLASS_B_NAME, { exact: true }).check();
  await page.getByLabel(teacherName, { exact: true }).check();
  // Attendance Frequency defaults to Weekly with no day pre-checked.
  await page.getByLabel('Mon', { exact: true }).check();
  await page.getByLabel('Wed', { exact: true }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(SUBJECT_NAME, { exact: true })).toBeVisible({ timeout: 15_000 });
}

export async function withProbes(
  who: Who[],
  fn: (p: Record<string, Probe>) => Promise<void>,
): Promise<void> {
  const opened: Record<string, Probe> = {};
  try {
    for (const w of who) {
      const c = need(w);
      opened[w] = await openProbe(c.email, c.password);
    }
    await fn(opened);
  } finally {
    await Promise.all(Object.values(opened).map((p) => p.close().catch(() => undefined)));
  }
}

export const noteDoc = (p: Probe, id: string) => doc(p.db, 'institutions', ctx.iid, 'lessonNotes', id);
export const attDoc = (p: Probe, id: string) => doc(p.db, 'institutions', ctx.iid, 'lessonNotes', id, 'attachment', 'data');
export const notesCol = (p: Probe) => collection(p.db, 'institutions', ctx.iid, 'lessonNotes');

// A rules-valid note as the regular teacher would write it; overrides inject
// one defect at a time.
export function validNote(p: Probe, overrides: Record<string, unknown> = {}) {
  return {
    institutionId: ctx.iid,
    name: `${NOTE_PREFIX} Probe ${Math.random().toString(36).slice(2, 8)}`,
    classId: ctx.classA,
    className: CLASS_A_NAME,
    teacherId: p.uid,
    teacherName: ctx.teacher.name,
    teacherRole: 'regular_teacher',
    departmentId: ctx.teacher.departmentId,
    hasAttachment: false,
    resourceLinks: [{ url: 'https://example.com/probe' }],
    createdBy: p.uid,
    createdByRole: 'regular_teacher',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}
export const goodFile = { dataUrl: PDF_DATA_URL, fileName: 'probe.pdf', mimeType: 'application/pdf', size: PDF_BYTES.length };

// Seeds the notes the fixtures test works with, after its clean slate (moved from that test unchanged).
export async function seedFixtureNotes(): Promise<void> {
  const attachment = { fileName: 'qa-submission.pdf', mimeType: 'application/pdf', dataUrl: PDF_DATA_URL, size: PDF_BYTES.length };
  const link = { url: 'https://example.com/lesson', label: 'Example lesson' };
  const seed = (key: keyof typeof N, n: Parameters<typeof seedNote>[0]) =>
    seedNote(n).then((id) => {
      ctx.ids = { ...(ctx.ids ?? {}), [key]: id } as Ctx['ids'];
    });

  await seed('classA', {
    name: N.classA, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, subjectId: ctx.subject, subjectName: SUBJECT_NAME,
    links: [link], attachment,
  });
  await seed('subjectOnly', {
    name: N.subjectOnly, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    subjectId: ctx.subject, subjectName: SUBJECT_NAME, links: [link], attachment,
  });
  await seed('classB', {
    name: N.classB, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classB, className: CLASS_B_NAME, links: [link],
  });
  await seed('seniorOwn', {
    name: N.seniorOwn, teacher: ctx.senior, teacherRole: 'senior_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, links: [link],
  });
  await seed('badLink', {
    name: N.badLink, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME,
    // A link written around the form (e.g. straight to the API) must render
    // as inert text, never a clickable anchor.
    links: [{ url: 'javascript:alert(1)', label: 'Bad link label' }, { url: 'https://example.com/ok', label: 'Good link label' }],
  });
  await seed('deleteTarget', {
    name: N.deleteTarget, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, links: [link], attachment,
  });
  await seed('seniorEdit', {
    name: N.seniorEdit, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, links: [link], attachment,
  });
}
