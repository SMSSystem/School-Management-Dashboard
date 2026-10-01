import { test, expect, type Page } from '@playwright/test';
import { forceLiveData, login } from './helpers';

// Student mobile experience: the dashboard shell becomes an off-canvas drawer
// below the md breakpoint, students temporarily lose a few sidebar items (UI
// only), the dashboard swaps the calendar for a next-class card and drops
// Events/Announcements, and the student-facing pages must not overflow
// horizontally on a phone. Driven against the live "Example School" QA
// institution with the fixture student from spec 08/09; read-only, creates nothing.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const STUDENT = {
  email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL,
  password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD,
};

// Items students must not see for now (Menu.tsx STUDENT_TEMPORARILY_HIDDEN).
const HIDDEN_FOR_STUDENT = ['Exams', 'Report Cards', 'Progress Reports', 'Disciplinary Action'];
const SHOWN_FOR_STUDENT = ['Home', 'Schedule', 'Lessons', 'Assignments', 'Results', 'My Attendance', 'User Profile', 'Institution Info'];

const sidebar = (page: Page) => page.locator('#tour-sidebar');

async function loginAsStudent(page: Page) {
  await login(page, {
    institutionLabel: INSTITUTION_NAME!,
    email: STUDENT.email!,
    password: STUDENT.password!,
  });
}

// The drawer is translated off-screen when closed, so "closed" means "not in
// the viewport", not "hidden".
const openDrawer = async (page: Page) => {
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await expect(sidebar(page)).toBeInViewport();
};

test.beforeAll(() => {
  test.skip(!INSTITUTION_NAME || !STUDENT.email || !STUDENT.password, 'QA student credentials missing from .env.qa');
});

test.describe('phone (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the sidebar is a drawer: hamburger opens it, links close it, hidden items stay hidden', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);

    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible();
    await expect(sidebar(page)).not.toBeInViewport(); // closed: off-screen, not eating the page

    await openDrawer(page);
    for (const label of SHOWN_FOR_STUDENT) {
      await expect(sidebar(page).getByRole('link', { name: label, exact: true }), `${label} should be listed`).toBeVisible();
    }
    for (const label of HIDDEN_FOR_STUDENT) {
      await expect(sidebar(page).getByRole('link', { name: label, exact: true }), `${label} should be hidden`).toHaveCount(0);
    }
    await expect(sidebar(page).getByRole('button', { name: 'Start Tour' })).toHaveCount(0);

    await test.step('Esc closes it', async () => {
      await page.keyboard.press('Escape');
      await expect(sidebar(page)).not.toBeInViewport();
    });

    await test.step('choosing a page navigates and closes it', async () => {
      await openDrawer(page);
      await sidebar(page).getByRole('link', { name: 'Results', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/list\/results$/);
      await expect(sidebar(page)).not.toBeInViewport();
    });

    await test.step('the backdrop closes it', async () => {
      await openDrawer(page);
      // The backdrop is everything right of the 288px drawer. (The header's own
      // menu button is also labelled 'Close navigation menu' while open, so click
      // by position rather than by name.)
      await page.mouse.click(375, 500);
      await expect(sidebar(page)).not.toBeInViewport();
    });
  });

  test('dashboard: next-class card, Quick Actions, no Events or Announcements', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    await expect(page.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Next class' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /announcements/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^events$/i })).toHaveCount(0);
    // The weekly calendar is gone from the student dashboard.
    await expect(page.locator('.rbc-calendar')).toHaveCount(0);
  });

  test('student pages fit the screen: no horizontal overflow', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    const pages = [
      '/dashboard',
      '/dashboard/list/lesson-notes',
      '/dashboard/list/assignments',
      '/dashboard/list/results',
      '/dashboard/attendance/my',
      '/dashboard/profile',
      '/dashboard/institution-profile',
    ];
    for (const path of pages) {
      await page.goto(path);
      // A full page load re-runs auth restore and the profile read first.
      await expect(page.locator('main'), `${path} should render`).toBeVisible({ timeout: 25_000 });
      // Live Firestore listeners keep the network busy, so networkidle never
      // settles; give async content a moment to render before measuring.
      await page.waitForTimeout(2_500);
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        return {
          doc: document.documentElement.scrollWidth - window.innerWidth,
          main: main.scrollWidth - main.clientWidth,
        };
      });
      expect(overflow.doc, `${path}: page is wider than the viewport`).toBeLessThanOrEqual(1);
      expect(overflow.main, `${path}: content scrolls sideways inside <main>`).toBeLessThanOrEqual(1);
    }
  });

  test('My Attendance resolves a term instead of claiming none is configured', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    await page.goto('/dashboard/attendance/my');
    await expect(page.getByRole('heading', { name: 'My Attendance' }).or(page.getByText(/no active term|not assigned to a class/i))).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('No active academic term is configured.')).toHaveCount(0);
  });
});

test.describe('desktop (1280x800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('persistent sidebar, no hamburger, same temporary hides', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeHidden();
    await expect(sidebar(page)).toBeInViewport();
    for (const label of SHOWN_FOR_STUDENT) {
      await expect(sidebar(page).getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    for (const label of HIDDEN_FOR_STUDENT) {
      await expect(sidebar(page).getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
    await expect(sidebar(page).getByRole('button', { name: 'Start Tour' })).toHaveCount(0);
    // UI-only: the routes still exist.
    await page.goto('/dashboard/list/exams');
    await expect(page).toHaveURL(/\/dashboard\/list\/exams$/);
  });
});
