import type { Page, BrowserContext } from '@playwright/test';

// AcademicCalendarPage (and others) render a "not available in demo mode"
// stub whenever data.ts's USE_MOCK is true — which is the dev server's own
// default (.env.development sets VITE_USE_MOCK_DATA=true). data.ts's
// DevDataModeToggle reads a localStorage override ('sms_data_mode_v2') that
// beats the env default, so forcing 'live' here gets every page hitting
// real Firestore without touching any env file. Must run via
// addInitScript (before the page's own scripts run), not page.evaluate
// after load — data.ts computes USE_MOCK once, at module-eval time.
export async function forceLiveData(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('sms_data_mode_v2', 'live');
    } catch {
      // ignore — private-browsing edge cases, matches the app's own handling
    }
  });
}

export type LoginAs = {
  institutionLabel: string; // exact <option> text in the login dropdown — an institution name, or 'Platform Administration' for super_admin
  email: string;
  password: string;
};

// Drives the real /login flow (ChoiceView -> LoginFormView) exactly as a
// person would: this app's PostLoginInstitutionGate compares the picked
// institution against the signed-in account's own institutionId and signs
// back out on a mismatch (src/components/PostLoginInstitutionGate.tsx), so
// there's no legitimate shortcut (e.g. calling signInWithEmailAndPassword
// directly) that bypasses this and still ends up authenticated.
export async function login(page: Page, creds: LoginAs): Promise<void> {
  // Straight after a sign-out the app is itself redirecting to /login, and a goto that lands in the middle of that is reported
  // as "interrupted by another navigation"; the page is on /login either way, so one retry is enough.
  // The load event is not waited for: right after a sign-out it can stay pending on the old session's open connections.
  // A page already showing /login (the sign-out landed there) is used as it is: a second goto to the same address has been seen
  // to hang.
  if (!/\/login\/?$/.test(new URL(page.url(), 'http://x').pathname)) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(async (err: unknown) => {
      if (!String(err).includes('interrupted by another navigation')) throw err;
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
    });
  }
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByLabel('Institution').selectOption({ label: creds.institutionLabel });
  await page.getByLabel('Email Address').fill(creds.email);
  await page.getByLabel('Password', { exact: true }).fill(creds.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // PostLoginInstitutionGate does its own async institution-match check
  // after auth resolves — settles on /dashboard (or signs back out to
  // /login with an error on a real mismatch). Surfaces the form's own
  // visible error text on failure instead of a bare timeout, since
  // "wrong password" and "actually broken" look identical otherwise.
  try {
    await page.waitForURL(/\/dashboard|\/change-password/, { timeout: 15_000 });
  } catch (err) {
    const errorText = await page
      .locator('p.text-red-500, p.text-red-700')
      .allTextContents()
      .catch(() => []);
    if (errorText.length > 0) {
      throw new Error(`Login failed for ${creds.email}: ${errorText.join(' | ')}`, { cause: err });
    }
    throw err;
  }

  // Every account AdminCreateUserForm.tsx creates now gets mustChangePassword:
  // true (Protected.tsx redirects here before /dashboard on first login) — a
  // no-op for already-established accounts that predate the flag, which land
  // straight on /dashboard above. Setting the "new" password to the same
  // value it already signed in with (Firebase Auth has no same-as-old
  // restriction) keeps .env.qa's persisted credentials valid for every later
  // login() call and suite re-run, rather than needing a genuinely different
  // password threaded back through every spec's fixture-persistence logic.
  // The redirect can arrive a moment after /dashboard first loads, so wait until the password screen or the signed-in shell is
  // showing before looking at the URL.
  await page
    .getByRole('heading', { name: 'Set a new password' })
    .or(page.getByRole('button', { name: 'Sign out' }))
    .first()
    .waitFor({ state: 'attached', timeout: 15_000 })
    .catch(() => undefined);
  if (page.url().includes('/change-password')) {
    await page.getByLabel('New Password', { exact: true }).fill(creds.password);
    await page.getByLabel('Confirm New Password', { exact: true }).fill(creds.password);
    await page.getByRole('button', { name: 'Set Password & Continue' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  }
}

// institution_admin gets a real product tour auto-started on first login
// (components/TourAutoTrigger.tsx's ROLES_WITH_REAL_TOURS) whose overlay
// (data-name="nextstep-overlay") intercepts clicks on the underlying page
// until dismissed — a brand-new QA admin account hits this every run. A
// no-op for any account that's already seen its tour (or has none).
// The app keeps its reference-data query results (classes, subjects, rubrics ...) in sessionStorage under this key, and a
// reload restores them as fresh for a minute (src/lib/queryPersistence.ts). A fixture builder that creates something and then
// reloads to see it must drop the saved results first, or the page shows the list from before; only this key is removed,
// because the rest of sessionStorage holds the sign-in's session lock.
export async function reloadFresh(page: Page): Promise<void> {
  await page.evaluate(() => window.sessionStorage.removeItem('sms_query_cache'));
  await page.reload();
}

export async function dismissTourIfPresent(page: Page): Promise<void> {
  const skipButton = page.getByRole('button', { name: 'Skip Tour' });
  try {
    await skipButton.waitFor({ state: 'visible', timeout: 5_000 });
    await skipButton.click();
  } catch {
    // No tour started for this account — nothing to dismiss.
  }
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
