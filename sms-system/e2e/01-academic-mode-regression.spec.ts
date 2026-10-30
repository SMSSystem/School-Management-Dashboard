import { test, expect } from '@playwright/test';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';

// §11's first, "most important" QA leg: an existing academic-mode
// institution (the academic-mode QA institution, QA_INSTITUTION_NAME) must show zero
// behavior change across every Group A/B page and every role, since almost
// everything in CUSTOM_CALENDAR_MODE_SPEC.md is additive specifically to
// avoid disturbing this path. Per this session's "full sweep, all 5 roles"
// decision.
//
// Each role visits every Group A/B (and Group A) page it can reach (per
// App.tsx's own role gates) and this asserts three independent signals of
// "nothing changed":
//   - no uncaught page error (a real crash — the strongest signal; this is
//     exactly the class of bug 00-setup-custom-institution.spec.ts's first
//     run caught for super_admin)
//   - the URL wasn't silently redirected back to /dashboard (would mean a
//     role gate regressed)
//   - no "Time Block" text anywhere — that phrase is coined by this spec's
//     custom-mode UI and has no legitimate reason to appear for an
//     academic-mode institution; its presence would mean custom-mode UI
//     leaked into the academic-mode path.
//
// Out of scope for this sweep: AttendanceScopeModal (opened from a list
// page's per-row PDF-export action, not a standalone route — not driven
// here) and the dashboard "multi-block summary" widget (doesn't exist for
// academic-mode institutions in the first place, so there's nothing to
// regress). The registration form gets its own dedicated spec
// (04-registration-form.spec.ts), which also covers this leg's "registration
// form: zero behavior change" requirement alongside §11's guardian-required
// bullet, rather than duplicating it here.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;

type RoleAccount = {
  role: string;
  email: string | undefined;
  password: string | undefined;
  pages: string[];
};

const ROLE_ACCOUNTS: RoleAccount[] = [
  {
    role: 'institution_admin',
    email: process.env.QA_ADMIN_EMAIL,
    password: process.env.QA_ADMIN_PASSWORD,
    pages: [
      '/dashboard',
      '/dashboard/list/classes',
      '/dashboard/list/gradebook',
      '/dashboard/list/terms',
      '/dashboard/report-card-comments',
      '/dashboard/schedule',
      '/dashboard/academic-calendar',
      '/dashboard/attendance/general',
      '/dashboard/attendance/subject',
      '/dashboard/attendance/gridsheet',
      '/dashboard/reports/builder',
    ],
  },
  {
    role: 'senior_teacher',
    email: process.env.QA_SENIOR_TEACHER_EMAIL,
    password: process.env.QA_SENIOR_TEACHER_PASSWORD,
    pages: [
      '/dashboard',
      '/dashboard/list/gradebook',
      '/dashboard/schedule',
      '/dashboard/attendance/general',
      '/dashboard/attendance/gridsheet',
      '/dashboard/reports/builder',
    ],
  },
  {
    role: 'regular_teacher',
    email: process.env.QA_TEACHER_EMAIL,
    password: process.env.QA_TEACHER_PASSWORD,
    pages: ['/dashboard', '/dashboard/list/gradebook', '/dashboard/schedule', '/dashboard/attendance/subject'],
  },
  {
    role: 'parent',
    email: process.env.QA_PARENT_EMAIL,
    password: process.env.QA_PARENT_PASSWORD,
    pages: ['/dashboard', '/dashboard/schedule', '/dashboard/attendance/child'],
  },
  {
    role: 'student',
    email: process.env.QA_STUDENT_EMAIL,
    password: process.env.QA_STUDENT_PASSWORD,
    pages: ['/dashboard', '/dashboard/schedule', '/dashboard/attendance/my'],
  },
];

// One test per (role, page) pair rather than one long test per role that
// hard-reloads through every page in sequence. The latter was tried first
// and reliably stalled for institution_admin (its 11-page list, by far the
// longest) — reproducibly hanging mid-sweep on a page that, per its own
// failure screenshot, had actually rendered correctly with zero "Time
// Block" text. That pointed at Firestore's old persistentMultipleTabManager
// primary-lease handoff stalling across many back-to-back hard reloads in
// one browser context/IndexedDB profile, not a real app bug — Playwright's
// own per-test isolation (a fresh context per test) sidesteps it. The app now
// uses an in-memory cache (issue #51), so that stall no longer exists, but one
// test per (role, page) is still kept: it isolates failures. The cost is re-logging-in once
// per page instead of once per role; worth it for a suite that needs to be
// trustworthy more than fast.
for (const account of ROLE_ACCOUNTS) {
  for (const path of account.pages) {
    test(`${account.role} @ ${path}: no custom-calendar UI or crashes`, async ({ page, context }) => {
      test.skip(
        !account.email || !account.password || !INSTITUTION_NAME,
        `Missing QA credentials for ${account.role} in .env.qa`,
      );

      await forceLiveData(context);
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await login(page, { institutionLabel: INSTITUTION_NAME!, email: account.email!, password: account.password! });
      await dismissTourIfPresent(page);

      // login() already lands on /dashboard — only navigate again if this
      // page is something else, avoiding a redundant reload for that case.
      if (path !== '/dashboard') {
        await page.goto(path);
        await dismissTourIfPresent(page);
      }
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      expect(page.url(), `${path} unexpectedly redirected`).toContain(path);
      await expect(page.getByText('Time Block', { exact: false })).toHaveCount(0);
      expect(pageErrors, `Uncaught page error(s) on ${path}: ${pageErrors.join(' | ')}`).toEqual([]);
    });
  }
}

test('institution_admin: ClassForm still requires Grade (not "Programme Year") for academic-mode institutions', async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.QA_ADMIN_EMAIL || !process.env.QA_ADMIN_PASSWORD || !INSTITUTION_NAME,
    'Missing QA admin credentials in .env.qa',
  );

  await forceLiveData(context);
  await login(page, {
    institutionLabel: INSTITUTION_NAME!,
    email: process.env.QA_ADMIN_EMAIL!,
    password: process.env.QA_ADMIN_PASSWORD!,
  });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/list/classes');
  await dismissTourIfPresent(page);
  await page.getByRole('button', { name: 'Add new class' }).click();

  // item 7 (CUSTOM_CALENDAR_MODE_SPEC.md §4/§8) relabels this field to
  // "Programme Year" and makes it optional only for calendarMode: 'custom'
  // institutions — the QA institution is academic (or has no calendarMode set at all)
  // (defaults to 'academic_year'), so the original label and requiredness
  // must be completely untouched. InputField's <label> isn't associated to
  // its <input> via for/id (a pre-existing pattern, not something this spec
  // introduces), so this checks visible text + the input's name attribute
  // rather than getByLabel.
  await expect(page.getByText('Grade', { exact: true })).toBeVisible();
  await expect(page.getByText('Programme Year', { exact: true })).toHaveCount(0);

  await page.locator('input[name="grade"]').fill('');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Grade must be between 1 and 13.')).toBeVisible({ timeout: 5_000 });
});
