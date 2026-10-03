import { test, expect, type Page } from '@playwright/test';
import { dismissTourIfPresent, forceLiveData, login, logout } from './helpers';

// Sidebar regroup and collapsible groups (docs/miscellaneous-specs/
// SIDEBAR_REORGANIZATION_SPEC.md): REPORTS and ADMINISTRATION groups, per-tab
// open/closed state, the amber attention dot on a collapsed group's header,
// one-item groups that never collapse, the phone drawer, and Start Tour
// closing the drawer. Driven against the live "Example School" QA institution;
// read-only, creates nothing. One login per role, signing out between them so
// the one-active-session lock (spec 13) does not refuse the next sign-in.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;

type Key = 'admin' | 'teacher' | 'student' | 'parent';

function creds(key: Key): { email?: string; password?: string } {
  const e = process.env;
  switch (key) {
    case 'admin':
      return { email: e.QA_ADMIN_EMAIL, password: e.QA_ADMIN_PASSWORD };
    case 'teacher':
      return { email: e.QA_TEACHER_EMAIL, password: e.QA_TEACHER_PASSWORD };
    case 'student':
      return { email: e.QA_ASSIGNMENTS_STUDENT_EMAIL, password: e.QA_ASSIGNMENTS_STUDENT_PASSWORD };
    case 'parent':
      return { email: e.QA_ASSIGNMENTS_PARENT_EMAIL, password: e.QA_ASSIGNMENTS_PARENT_PASSWORD };
  }
}

const sidebar = (page: Page) => page.locator('#tour-sidebar');
const group = (page: Page, slug: string) => page.locator(`#sidebar-group-${slug}`);
// The header toggle of a collapsible group (absent for one-item groups).
const toggle = (page: Page, slug: string) => page.locator(`button[aria-controls="sidebar-group-${slug}"]`);
const link = (page: Page, name: string) => sidebar(page).getByRole('link', { name, exact: true });

async function loginAs(page: Page, key: Key) {
  const c = creds(key);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: c.email!, password: c.password! });
  if (key === 'admin') await dismissTourIfPresent(page);
}

async function signOutQuietly(page: Page) {
  await logout(page).catch(() => undefined);
}

test.beforeAll(() => {
  test.skip(
    !INSTITUTION_NAME || !(['admin', 'teacher', 'student', 'parent'] as Key[]).every((k) => creds(k).email && creds(k).password),
    'QA credentials missing from .env.qa',
  );
});

test.describe('desktop', () => {
  test('admin: regrouped, collapsible, state persists for the tab and resets on sign-out', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAs(page, 'admin');

    await test.step('items sit in the new groups', async () => {
      await expect(group(page, 'reports').getByRole('link', { name: 'Report Cards', exact: true })).toBeVisible();
      await expect(group(page, 'reports').getByRole('link', { name: 'Report Builder', exact: true })).toBeVisible();
      for (const name of ['Registrations', 'Audit Log', 'Rebuild Summaries', 'Import Data']) {
        await expect(group(page, 'administration').getByRole('link', { name, exact: true }), name).toBeVisible();
      }
      await expect(group(page, 'timetable').getByRole('link', { name: 'Rubrics', exact: true })).toBeVisible();
      // And no longer where they used to be.
      await expect(group(page, 'outcomes').getByRole('link', { name: 'Report Cards', exact: true })).toHaveCount(0);
      await expect(group(page, 'attendance').getByRole('link', { name: 'Audit Log', exact: true })).toHaveCount(0);
    });

    await test.step('every group starts open', async () => {
      for (const slug of ['people', 'curriculum', 'timetable', 'outcomes', 'reports', 'attendance', 'administration', 'other']) {
        await expect(toggle(page, slug), slug).toHaveAttribute('aria-expanded', 'true');
      }
    });

    await test.step('collapsing hides the links (so `hidden` beats `flex`) and survives a reload', async () => {
      await toggle(page, 'people').click();
      await expect(toggle(page, 'people')).toHaveAttribute('aria-expanded', 'false');
      await expect(group(page, 'people')).toBeHidden();
      await expect(link(page, 'Teachers')).toBeHidden();
      await expect(toggle(page, 'curriculum')).toHaveAttribute('aria-expanded', 'true'); // others untouched

      await page.reload();
      await expect(toggle(page, 'people')).toHaveAttribute('aria-expanded', 'false');
      await expect(link(page, 'Teachers')).toBeHidden();
    });

    await test.step('expanding again shows the links', async () => {
      await toggle(page, 'people').click();
      await expect(toggle(page, 'people')).toHaveAttribute('aria-expanded', 'true');
      await expect(link(page, 'Teachers')).toBeVisible();
    });

    await test.step('going to a route inside a collapsed group re-opens it, and collapsing it again sticks', async () => {
      await toggle(page, 'curriculum').click();
      await expect(link(page, 'Classes')).toBeHidden();

      await page.goto('/dashboard/list/classes');
      await expect(toggle(page, 'curriculum')).toHaveAttribute('aria-expanded', 'true');
      await expect(link(page, 'Classes')).toBeVisible();

      await toggle(page, 'curriculum').click();
      await expect(toggle(page, 'curriculum')).toHaveAttribute('aria-expanded', 'false');
      await page.waitForTimeout(500); // no delayed re-open from the navigation nudge
      await expect(toggle(page, 'curriculum')).toHaveAttribute('aria-expanded', 'false');
    });

    await test.step('icon-only mode still shows every icon, including a collapsed group', async () => {
      await toggle(page, 'people').click(); // collapsed group
      await page.locator('#tour-sidebar-collapse-toggle').click();
      await expect(sidebar(page).locator('a[title="Teachers"]')).toBeVisible();
      await expect(sidebar(page).locator('a[title="Classes"]')).toBeVisible(); // CURRICULUM is collapsed too
      await expect(sidebar(page).locator('a[title="Audit Log"]')).toBeVisible();
      await page.locator('#tour-sidebar-collapse-toggle').click(); // restore for later runs
      await expect(toggle(page, 'people')).toHaveAttribute('aria-expanded', 'false');
    });

    await test.step('signing out and back in resets every group to open', async () => {
      await logout(page);
      await loginAs(page, 'admin');
      for (const slug of ['people', 'curriculum']) {
        await expect(toggle(page, slug), slug).toHaveAttribute('aria-expanded', 'true');
      }
    });

    await signOutQuietly(page);
  });

  test('admin: a collapsed OTHER group carries the "profile incomplete" dot on its header', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAs(page, 'admin');

    const itemDot = link(page, 'Institution Profile').locator('span.bg-amber-400');
    test.skip((await itemDot.count()) === 0, 'The QA institution profile is complete, so there is no dot to move.');

    await expect(toggle(page, 'other').getByLabel('Needs attention')).toHaveCount(0); // open: dot is on the item
    await toggle(page, 'other').click();
    await expect(toggle(page, 'other').getByLabel('Needs attention')).toBeVisible();

    await toggle(page, 'other').click();
    await expect(toggle(page, 'other').getByLabel('Needs attention')).toHaveCount(0);
    await expect(itemDot).toBeVisible();

    await signOutQuietly(page);
  });

  test('teacher: one-item groups have a plain heading, no toggle, and stay open', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAs(page, 'teacher');

    await expect(toggle(page, 'administration')).toHaveCount(0);
    await expect(group(page, 'administration').getByRole('link', { name: 'Import Data', exact: true })).toBeVisible();
    await expect(toggle(page, 'curriculum')).toHaveCount(0);
    await expect(group(page, 'curriculum').getByRole('link', { name: 'Classes', exact: true })).toBeVisible();
    // Groups with several items still collapse.
    await expect(toggle(page, 'people')).toHaveAttribute('aria-expanded', 'true');

    await signOutQuietly(page);
  });

  test('student: no REPORTS group, and ATTENDANCE is My Attendance alone with no toggle', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAs(page, 'student');

    await expect(group(page, 'reports')).toHaveCount(0);
    await expect(toggle(page, 'reports')).toHaveCount(0);
    await expect(group(page, 'attendance').getByRole('link', { name: 'My Attendance', exact: true })).toBeVisible();
    await expect(toggle(page, 'attendance')).toHaveCount(0);

    await signOutQuietly(page);
  });

  test('parent: REPORTS and OUTCOMES hold the right pages', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAs(page, 'parent');

    for (const name of ['Report Cards', 'Progress Reports']) {
      await expect(group(page, 'reports').getByRole('link', { name, exact: true }), name).toBeVisible();
    }
    for (const name of ['Results', 'Disciplinary Action']) {
      await expect(group(page, 'outcomes').getByRole('link', { name, exact: true }), name).toBeVisible();
    }
    await expect(group(page, 'outcomes').getByRole('link', { name: 'Report Cards', exact: true })).toHaveCount(0);

    await signOutQuietly(page);
  });
});

test.describe('phone (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const openDrawer = async (page: Page) => {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(sidebar(page)).toBeInViewport();
  };

  test('admin: 44px toggles, collapse persists across closing the drawer, Start Tour closes it', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAs(page, 'admin');
    await openDrawer(page);

    await test.step('headers are tappable (44px) and collapsing works in the drawer', async () => {
      const box = await toggle(page, 'people').boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await toggle(page, 'people').click();
      await expect(toggle(page, 'people')).toHaveAttribute('aria-expanded', 'false');
      await expect(link(page, 'Teachers')).toBeHidden();
    });

    await test.step('the state is kept when the drawer is closed and re-opened', async () => {
      await page.keyboard.press('Escape');
      await expect(sidebar(page)).not.toBeInViewport();
      await openDrawer(page);
      await expect(toggle(page, 'people')).toHaveAttribute('aria-expanded', 'false');
    });

    await test.step('Start Tour on /dashboard closes the drawer and starts the tour', async () => {
      await expect(page).toHaveURL(/\/dashboard$/);
      await sidebar(page).getByRole('button', { name: 'Start Tour' }).click();
      await expect(sidebar(page)).not.toBeInViewport();
      await expect(page.getByRole('button', { name: 'Skip Tour' })).toBeVisible();
      await page.getByRole('button', { name: 'Skip Tour' }).click();
    });

    await signOutQuietly(page);
  });
});
