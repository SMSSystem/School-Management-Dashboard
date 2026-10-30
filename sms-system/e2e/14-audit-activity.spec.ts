import { test, expect, type Locator, type Page } from '@playwright/test';
import { Timestamp } from 'firebase-admin/firestore';
import { forceLiveData, login, logout, dismissTourIfPresent } from './helpers';
import { qaEmail } from './qa-names';
import {
  HAS_ADMIN_SDK,
  auditEntriesFor,
  db,
  deleteAuditEntriesFor,
  deleteNoteById,
  institutionId,
  noteByName,
  restoreUserFields,
  snapshotUser,
  userByEmail,
  type UserInfo,
} from './lesson-notes-support';

// docs/miscellaneous-specs/AUDIT_LOG_ACCOUNT_ACTIONS_SPEC.md §13 — the live checks
// for the audit/activity build-out. Ground truth comes from the Admin SDK.
//
// REQUIRES the audit_log rules AND indexes to be deployed and the indexes BUILT
// (firestore.rules, firestore.indexes.json). Without the rules, a form save is
// refused (its audit entry shares its batch); without an index a list shows its
// "Failed to load" state. Either way this spec fails visibly rather than passing.
//
// Covered writers: profile_edit (teacher form), permission_change (schedule
// access), lesson_note_edit. The others (attendance, gradebook, feedback
// comments, results, account_created, password_reset) have the same shape and are
// unit-tested through lib/teacherAudit.ts and the rule probes in spec 11; driving
// their UIs here would be slow and brittle.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
// Seeded entries are timestamped in 2099 so they sort FIRST in the log (newest),
// making page contents deterministic whatever else the institution has logged.
const SEED_DETAIL = 'QA audit seed';
const SEED_BY = 'qa-audit-seed';

type Key = 'admin' | 'teacher' | 'senior' | 'student';

function creds(key: Key): { email: string; password: string } {
  const e = process.env;
  switch (key) {
    case 'admin':
      return { email: e.QA_ADMIN_EMAIL!, password: e.QA_ADMIN_PASSWORD! };
    case 'senior':
      return { email: e.QA_SENIOR_TEACHER_EMAIL!, password: e.QA_SENIOR_TEACHER_PASSWORD! };
    case 'student':
      return { email: e.QA_ASSIGNMENTS_STUDENT_EMAIL!, password: e.QA_ASSIGNMENTS_STUDENT_PASSWORD! };
    case 'teacher':
      return { email: qaEmail('lessons.teacher'), password: e.QA_LESSONS_TEACHER_PASSWORD ?? 'Teacher0123456789' };
  }
}

const ctx = { iid: '', users: {} as Record<Key, UserInfo> };

async function loginAs(page: Page, key: Key) {
  await login(page, { institutionLabel: INSTITUTION_NAME!, ...creds(key) });
  if (key === 'admin') await dismissTourIfPresent(page);
}

// The one-active-session lock (spec 13) would refuse the next test's sign-in as
// the same user if this tab were still holding it.
async function signOutQuietly(page: Page) {
  await logout(page).catch(() => undefined);
}

const pad = (n: number) => String(n).padStart(2, '0');

async function seedAudit(count: number, day: string, performedBy: string) {
  const col = db().collection('institutions').doc(ctx.iid).collection('audit_log');
  for (let i = 1; i <= count; i++) {
    const iso = `${day}T00:00:${pad(i)}.000Z`;
    await col.add({
      eventType: 'profile_edit',
      detail: `${SEED_DETAIL} ${pad(i)}`,
      targetUid: 'qa-audit-seed-target',
      targetName: 'QA seed target',
      performedBy,
      performedByName: 'QA seed',
      timestamp: iso,
      recordedAt: Timestamp.fromDate(new Date(iso)),
      institutionId: ctx.iid,
    });
  }
}

async function deleteSeeded() {
  const col = db().collection('institutions').doc(ctx.iid).collection('audit_log');
  for (const by of [SEED_BY, ctx.users.admin?.uid].filter(Boolean) as string[]) {
    const snap = await col.where('performedBy', '==', by).get();
    for (const d of snap.docs) {
      if (String(d.data().detail).startsWith(SEED_DETAIL)) await d.ref.delete();
    }
  }
}

// Height of a card beyond what its own content needs. A card stretched to match a
// taller neighbour has a large gap; an unstretched one has only its header margin.
async function slack(section: Locator): Promise<number> {
  return section.evaluate((el) => {
    const inner = Array.from(el.children).reduce((h, c) => h + c.getBoundingClientRect().height, 0);
    const cs = getComputedStyle(el);
    const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return el.getBoundingClientRect().height - inner - padding;
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
  test.skip(!INSTITUTION_NAME, 'QA_INSTITUTION_NAME missing from .env.qa');
  ctx.iid = await institutionId();
  const keys: Key[] = ['admin', 'teacher', 'senior', 'student'];
  for (const k of keys) ctx.users[k] = await userByEmail(creds(k).email);
  await deleteSeeded();
});

test.afterAll(async () => {
  if (!HAS_ADMIN_SDK || !INSTITUTION_NAME || !ctx.iid) return;
  await deleteSeeded();
});

// ── Writers ──────────────────────────────────────────────────────────────────

test('profile_edit: editing a teacher logs the changed field; an unchanged save logs nothing', async ({ page, context }) => {
  const target = ctx.users.teacher;
  test.skip(!target.departmentId, 'the QA teacher needs a department to save the form');
  const before = await snapshotUser(target.uid);
  await forceLiveData(context);

  const openEditForm = async () => {
    await page.goto('/dashboard/list/teachers');
    await page.getByPlaceholder('Search by name…').fill(target.name);
    const row = page.locator('tr', { hasText: target.name }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: `Edit ${target.name}` }).click();
    // The form fills itself from the user document: wait until it has.
    await expect(page.locator('input[name="firstName"]')).not.toHaveValue('', { timeout: 15_000 });
    await expect(page.locator('select[name="departmentId"]')).toHaveValue(target.departmentId!, { timeout: 15_000 });
    // Subject ticks are pre-filled from the subjects list a moment later; saving
    // before then would read as "no subjects".
    await page.waitForTimeout(1500);
  };
  const profileEdits = async () =>
    (await auditEntriesFor(target.uid)).filter((e) => e.eventType === 'profile_edit');

  try {
    await deleteAuditEntriesFor(target.uid);
    await loginAs(page, 'admin');

    await test.step('saving without changing anything writes no entry', async () => {
      await openEditForm();
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      await expect(page.locator('input[name="firstName"]')).toHaveCount(0, { timeout: 15_000 });
      await page.waitForTimeout(3000); // let a (wrong) entry land before asserting there is none
      expect(await profileEdits(), 'no profile_edit for an unchanged form').toHaveLength(0);
    });

    await test.step('changing the phone writes one entry that names only the phone', async () => {
      const newPhone = `+1-876-555-${String(1000 + Math.floor(Math.random() * 8999))}`;
      await openEditForm();
      await page.locator('input[name="phone"]').fill(newPhone);
      await page.locator('input[name="phone"]').blur();
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      await expect(page.locator('input[name="firstName"]')).toHaveCount(0, { timeout: 15_000 });

      await expect.poll(async () => (await profileEdits()).length, { timeout: 15_000 }).toBe(1);
      const entry = (await profileEdits())[0];
      expect(entry.detail).toMatch(/^Updated phone for /);
      expect(entry.targetUid).toBe(target.uid);
      expect(entry.performedBy).toBe(ctx.users.admin.uid);
      expect(entry.institutionId).toBe(ctx.iid);
      expect(entry.recordedAt, 'recordedAt must be a server timestamp').toBeTruthy();
      expect(String(entry.detail)).not.toContain(newPhone); // names, never values
    });
  } finally {
    await restoreUserFields(target.uid, before, ['phone']);
    await deleteAuditEntriesFor(target.uid);
    await signOutQuietly(page);
  }
});

test('permission_change: granting and revoking schedule access each log an entry', async ({ page, context }) => {
  const target = ctx.users.senior;
  const before = await snapshotUser(target.uid);
  await forceLiveData(context);

  try {
    await deleteAuditEntriesFor(target.uid);
    await loginAs(page, 'admin');
    await page.goto('/dashboard/schedule');
    await page.getByRole('button', { name: /Delegate Schedule Access/ }).click();
    const toggle = page.getByRole('button', {
      name: new RegExp(`(Grant|Revoke) schedule access for ${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    });

    await toggle.click();
    await expect.poll(async () => (await auditEntriesFor(target.uid)).length, { timeout: 15_000 }).toBe(1);
    await toggle.click();
    await expect.poll(async () => (await auditEntriesFor(target.uid)).length, { timeout: 15_000 }).toBe(2);

    const entries = await auditEntriesFor(target.uid);
    expect(entries.every((e) => e.eventType === 'permission_change')).toBe(true);
    const details = entries.map((e) => String(e.detail));
    expect(details.some((d) => d.startsWith('Granted'))).toBe(true);
    expect(details.some((d) => d.startsWith('Revoked'))).toBe(true);
    expect(entries.every((e) => e.performedBy === ctx.users.admin.uid && e.recordedAt)).toBe(true);
  } finally {
    await restoreUserFields(target.uid, before, ['canGenerateSchedule']);
    await deleteAuditEntriesFor(target.uid);
    await signOutQuietly(page);
  }
});

test('lesson_note_edit: a teacher creating a lesson note logs an entry', async ({ page, context }) => {
  const teacher = ctx.users.teacher;
  test.skip(!teacher.departmentId, 'the QA teacher needs a department to create a lesson note');
  const name = `QA Audit Note ${Date.now()}`;
  let noteId: string | null = null;
  await forceLiveData(context);

  try {
    await loginAs(page, 'teacher');
    await page.getByRole('link', { name: 'Lessons', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lesson Notes', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Add new lesson note' }).click();
    await page.locator('input[name="name"]').fill(name);
    await page.getByLabel('Link 1 URL').fill('https://example.com/qa-audit');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toHaveCount(0, { timeout: 15_000 });

    await expect.poll(async () => (await noteByName(name))?.id ?? null, { timeout: 15_000 }).not.toBeNull();
    noteId = (await noteByName(name))!.id;
    // With no class chosen the note itself is the target.
    await expect.poll(async () => (await auditEntriesFor(noteId!)).length, { timeout: 15_000 }).toBe(1);
    const entry = (await auditEntriesFor(noteId))[0];
    expect(entry.eventType).toBe('lesson_note_edit');
    expect(entry.performedBy).toBe(teacher.uid);
    expect(String(entry.detail)).toContain(name);
    expect(entry.institutionId).toBe(ctx.iid);
    expect(entry.recordedAt).toBeTruthy();
  } finally {
    if (noteId) {
      await deleteAuditEntriesFor(noteId);
      await deleteNoteById(noteId);
    }
    await signOutQuietly(page);
  }
});

// ── Paging ───────────────────────────────────────────────────────────────────

test('Audit Log: Previous / Next page through the entries without repeats, and the category filter resets paging', async ({ page, context }) => {
  await forceLiveData(context);
  try {
    await seedAudit(25, '2099-01-01', SEED_BY);
    await loginAs(page, 'admin');
    await page.goto('/dashboard/admin/audit-log');
    await page.getByLabel('Event category').selectOption({ label: 'Academic' });

    const seeded = page.getByText(new RegExp(`^${SEED_DETAIL} \\d+$`));
    await expect(page.getByText(`${SEED_DETAIL} 25`)).toBeVisible({ timeout: 20_000 });
    await expect(seeded).toHaveCount(20);
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
    const first = await seeded.allTextContents();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 15_000 });
    // The remaining five seeded entries, then older real ones: nothing repeated.
    await expect(page.getByText(`${SEED_DETAIL} 05`)).toBeVisible();
    await expect(page.getByText(`${SEED_DETAIL} 25`)).toHaveCount(0);
    const second = await seeded.allTextContents();
    expect(second).toHaveLength(5);
    expect(new Set([...first, ...second]).size).toBe(25);

    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
    await expect(seeded).toHaveCount(20);
    expect(await seeded.allTextContents()).toEqual(first);

    await test.step('Refresh starts again at page 1 instead of keeping stale later pages', async () => {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(seeded).toHaveCount(20);
      expect(await seeded.allTextContents()).toEqual(first);
    });

    await test.step('changing the category starts again at page 1', async () => {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByLabel('Event category').selectOption({ label: 'All events' });
      await expect(page.getByText('Page 1', { exact: true })).toBeVisible({ timeout: 15_000 });
    });
  } finally {
    await deleteSeeded();
    await signOutQuietly(page);
  }
});

// ── Profile ──────────────────────────────────────────────────────────────────

test('Profile: "Actions I performed" pages, and the cards are not stretched', async ({ page, context }) => {
  await forceLiveData(context);
  try {
    await seedAudit(12, '2099-02-01', ctx.users.admin.uid);
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginAs(page, 'admin');
    await page.goto('/dashboard/profile');

    await page.getByRole('tab', { name: 'Actions I performed' }).click();
    const seeded = page.getByText(new RegExp(`^${SEED_DETAIL} \\d+`));
    await expect(page.getByText(`${SEED_DETAIL} 12`)).toBeVisible({ timeout: 20_000 });
    await expect(seeded).toHaveCount(10);
    await expect(page.getByText('Page 1', { exact: true })).toBeVisible();

    await test.step('the long list does not stretch the cards beside it', async () => {
      const cardFor = (heading: string) => page.locator('section', { has: page.getByRole('heading', { name: heading }) });
      expect(await slack(cardFor('Contact Information')), 'Contact Information should end where its content ends').toBeLessThan(40);
      // Role-specific Details and Account Details are the cards that fill their columns (ProfileSection's fill), so the two
      // columns end together instead of following the long list below them.
      const bottom = async (heading: string) => (await cardFor(heading).boundingBox())!.y + (await cardFor(heading).boundingBox())!.height;
      expect(Math.abs((await bottom('Role-specific Details')) - (await bottom('Account Details')))).toBeLessThan(3);
      // The list scrolls inside its card instead of growing the page, and the pager stays visible.
      const list = page.locator('section', { has: page.getByRole('heading', { name: 'Activity' }) }).locator('.overflow-y-auto');
      const box = await list.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(460);
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    });

    await test.step('Next shows the last two, Previous returns', async () => {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('Page 2', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(seeded).toHaveCount(2);
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(seeded).toHaveCount(10);
    });

    await test.step('nothing overflows sideways on a phone', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.getByRole('tab', { name: 'Actions I performed' }).click();
      await expect(page.getByText(`${SEED_DETAIL} 12`)).toBeVisible({ timeout: 20_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  } finally {
    await deleteSeeded();
    await signOutQuietly(page);
  }
});

test('Profile: a student sees "My activity" only, with no staff tabs', async ({ page, context }) => {
  await forceLiveData(context);
  try {
    await loginAs(page, 'student');
    await page.goto('/dashboard/profile');
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Actions I performed' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Audit and security events' })).toHaveCount(0);
  } finally {
    await signOutQuietly(page);
  }
});
