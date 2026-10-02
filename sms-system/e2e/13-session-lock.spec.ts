import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import { FieldValue } from 'firebase-admin/firestore';
import { forceLiveData, login, logout } from './helpers';
import { HAS_ADMIN_SDK, db, userByEmail } from './lesson-notes-support';

// Session behaviour (src/lib/firebase.ts, sessionLock.ts):
//
// 1. Sign-in lives in the TAB's sessionStorage, so closing the tab ends the
//    session, a reload keeps it, and a new tab starts signed out. Always runs.
// 2. One active session per account, kept in the Realtime Database. It only
//    exists when the app is built with VITE_SINGLE_SESSION_ENABLED=true and
//    VITE_FIREBASE_DATABASE_URL, so these tests SKIP unless the dev server this
//    run starts has both (Playwright's webServer inherits this process's env):
//
//      VITE_SINGLE_SESSION_ENABLED=true VITE_FIREBASE_DATABASE_URL=https://… \
//        npx playwright test e2e/13-session-lock.spec.ts
//
// Uses the fixture student from spec 08/09/12. The administrator's "clear
// session" button writes users/{uid}.sessionResetAt; this spec stamps the same
// field through the Admin SDK, so the button's own UI is checked by hand.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const STUDENT = {
  email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL,
  password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD,
};
const LOCK_ENABLED = process.env.VITE_SINGLE_SESSION_ENABLED === 'true' && !!process.env.VITE_FIREBASE_DATABASE_URL;

const IN_USE = /already signed in on another device or browser tab/i;
const TAKEN = /signed out because this account was signed in somewhere else/i;

const credentials = () => ({
  institutionLabel: INSTITUTION_NAME!,
  email: STUDENT.email!,
  password: STUDENT.password!,
});

test.beforeAll(() => {
  test.skip(!INSTITUTION_NAME || !STUDENT.email || !STUDENT.password, 'QA student credentials missing from .env.qa');
});

async function newSession(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await forceLiveData(context);
  return context;
}

test('sign-in is tab-scoped: a reload keeps it, a new tab starts signed out', async ({ browser }) => {
  const context = await newSession(browser);
  try {
    const page = await context.newPage();
    await login(page, credentials());
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 25_000 });
    await expect(page.getByRole('heading', { name: 'Quick Actions' })).toBeVisible({ timeout: 25_000 });

    // Same browser context, new tab: its sessionStorage is empty, so no one is signed in.
    const second = await context.newPage();
    await second.goto('/dashboard');
    await expect(second).toHaveURL(/\/login/, { timeout: 25_000 });
  } finally {
    await context.close();
  }
});

test.describe('one active session per account', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    test.skip(!LOCK_ENABLED, 'Needs VITE_SINGLE_SESSION_ENABLED=true and VITE_FIREBASE_DATABASE_URL in this run\'s environment');
    test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
  });

  // Signing out must give the account up at once, not leave the lock behind until
  // the tab closes (the first version of the release left it, found by this test).
  test('signing out frees the account straight away', async ({ browser }) => {
    const first = await newSession(browser);
    const second = await newSession(browser);
    try {
      const firstPage = await first.newPage();
      await login(firstPage, credentials());
      await logout(firstPage);

      // Refused if the lock lingered; allowed straight away when it was released.
      const secondPage = await second.newPage();
      await login(secondPage, credentials());
      await expect(secondPage).toHaveURL(/\/dashboard/);
      await logout(secondPage); // leave the account free for the next test
    } finally {
      await Promise.allSettled([first.close(), second.close()]);
    }
  });
  test('a second sign-in is refused, an administrator\'s reset lets it take over, and a closed tab frees the account', async ({ browser }) => {
    const student = await userByEmail(STUDENT.email!);
    const first = await newSession(browser);
    const second = await newSession(browser);
    const third = await newSession(browser);
    try {
      // 1. The first sign-in holds the account.
      const firstPage = await first.newPage();
      await login(firstPage, credentials());
      await expect(firstPage).toHaveURL(/\/dashboard/);

      // 2. A second sign-in with the same credentials is refused, with a reason.
      const secondPage = await second.newPage();
      await expect(login(secondPage, credentials())).rejects.toThrow(IN_USE);
      await expect(secondPage).toHaveURL(/\/login/);
      await expect(secondPage.getByText(IN_USE)).toBeVisible();

      // 3. An administrator clears the session: the next sign-in takes over, and
      //    the first one is signed out with an explanation.
      await db().collection('users').doc(student.uid).update({ sessionResetAt: FieldValue.serverTimestamp() });
      await login(secondPage, credentials());
      await expect(secondPage).toHaveURL(/\/dashboard/);
      await expect(firstPage).toHaveURL(/\/login/, { timeout: 25_000 });
      await expect(firstPage.getByText(TAKEN)).toBeVisible();

      // 4. Closing the tab frees the account (the database releases it on disconnect).
      await second.close();
      const thirdPage = await third.newPage();
      await expect(async () => {
        await login(thirdPage, credentials());
      }).toPass({ timeout: 45_000, intervals: [2_000] });
      await expect(thirdPage).toHaveURL(/\/dashboard/);
    } finally {
      await Promise.allSettled([first.close(), second.close(), third.close()]);
      await db().collection('users').doc(student.uid).update({ sessionResetAt: FieldValue.delete() }).catch(() => undefined);
    }
  });
});
