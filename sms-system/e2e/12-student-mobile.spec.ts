import { test, expect, type Page } from '@playwright/test';
import { forceLiveData, login } from './helpers';
import {
  HAS_ADMIN_SDK,
  NOTE_PREFIX,
  db,
  deleteNoteById,
  deleteNotesNamed,
  institutionId,
  seedNote,
  userByEmail,
} from './lesson-notes-support';

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
      '/dashboard/schedule',
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

// ── Schedule, Lessons and Profile on a phone ────────────────────────────────

const NOTE_A = `${NOTE_PREFIX} mobile alpha`;
const NOTE_B = `${NOTE_PREFIX} mobile beta`;
const SUBJECT_A = 'QA Mobile Subject Alpha';
const SUBJECT_B = 'QA Mobile Subject Beta';

test.describe('phone: schedule, lessons, profile (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.describe.configure({ mode: 'serial' });

  let studentClassId: string | undefined;
  let studentClassName = '';
  // Only the notes THIS spec seeds are ever deleted (never a prefix sweep).
  const seededNoteIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
    const student = await userByEmail(STUDENT.email!);
    studentClassId = student.classId;
    test.skip(!studentClassId, 'The QA student has no class');
    const iid = await institutionId();
    const cls = await db().collection('institutions').doc(iid).collection('classes').doc(studentClassId!).get();
    studentClassName = (cls.data()?.name as string) ?? '';
    // This fixture teacher is created by spec 09; skip rather than fail if it
    // hasn't been (spec 12 can then run on its own against a fresh institution).
    const teacher = await userByEmail('qa.lessons.teacher@demo.com').catch(() => null);
    test.skip(!teacher, 'The QA lessons teacher fixture (created by spec 09) is missing');
    // Leftovers from an interrupted earlier run of THIS spec, matched exactly.
    for (const name of [NOTE_A, NOTE_B]) await deleteNotesNamed(name);
    for (const [name, subjectName] of [[NOTE_A, SUBJECT_A], [NOTE_B, SUBJECT_B]]) {
      const id = await seedNote({
        name,
        teacher: teacher!,
        teacherRole: 'regular_teacher',
        classId: studentClassId,
        className: studentClassName,
        // seedNote only writes subjectName alongside a subjectId.
        subjectId: `qa-mobile-${subjectName.replace(/\W+/g, '-').toLowerCase()}`,
        subjectName,
        links: [{ url: 'https://example.com/mobile', label: 'Mobile link' }],
      });
      seededNoteIds.push(id);
    }
  });

  test.afterAll(async () => {
    for (const id of seededNoteIds) await deleteNoteById(id).catch(() => undefined);
  });

  test('Lessons: tappable cards, search and subject chips, bottom-sheet viewer', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    await page.goto('/dashboard/list/lesson-notes');
    const cardA = page.getByRole('button', { name: `View ${NOTE_A}` });
    const cardB = page.getByRole('button', { name: `View ${NOTE_B}` });
    await expect(cardA).toBeVisible({ timeout: 25_000 });
    await expect(cardB).toBeVisible();
    await expect(page.locator('main table')).toHaveCount(0); // cards, not the table

    await test.step('subject chips filter the list', async () => {
      const chips = page.getByRole('group', { name: 'Filter by subject' });
      await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
      await chips.getByRole('button', { name: SUBJECT_A }).click();
      await expect(cardA).toBeVisible();
      await expect(cardB).toHaveCount(0);
      await chips.getByRole('button', { name: 'All' }).click();
      await expect(cardB).toBeVisible();
    });

    await test.step('search narrows by name', async () => {
      await page.getByRole('searchbox').fill('mobile beta');
      await expect(cardB).toBeVisible();
      await expect(cardA).toHaveCount(0);
      await page.getByRole('searchbox').fill('');
      await expect(cardA).toBeVisible();
    });

    await test.step('tapping a card opens a bottom sheet', async () => {
      await cardA.click();
      const sheet = page.getByRole('dialog', { name: NOTE_A });
      await expect(sheet).toBeVisible();
      const box = (await sheet.boundingBox())!;
      expect(box.width, 'sheet spans the screen').toBeGreaterThanOrEqual(388);
      expect(Math.abs(box.y + box.height - 844), 'sheet is anchored to the bottom').toBeLessThanOrEqual(2);
      await expect(sheet.getByRole('link', { name: 'Mobile link' })).toHaveAttribute('target', '_blank');
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toHaveCount(0);
    });
  });

  test('Schedule: day strip + agenda, own class only', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    await page.goto('/dashboard/schedule');

    // The QA institution may have no *current* term, in which case nothing is
    // preselected: pick a term that has the student's class's slots (so the
    // agenda has content), else the first one.
    const iid = await institutionId();
    const slotsSnap = await db().collection('institutions').doc(iid).collection('timetable_slots').get();
    const ownTermId = slotsSnap.docs.find((s) => s.data().classId === studentClassId)?.data().termId as string | undefined;
    const termSelect = page.getByLabel('Term');
    await expect(termSelect.locator('option')).not.toHaveCount(1, { timeout: 25_000 }); // more than "Select a term"
    if ((await termSelect.inputValue()) === '') {
      if (ownTermId) await termSelect.selectOption(ownTermId);
      else await termSelect.selectOption({ index: 1 });
    }
    const strip = page.getByRole('group', { name: 'Day of the week' });
    await expect(strip).toBeVisible({ timeout: 25_000 });
    await expect(strip.getByRole('button')).toHaveCount(6);

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
    const todayName = DAYS[todayIdx > 5 ? 0 : todayIdx];
    await expect(strip.getByRole('button', { name: new RegExp(`^${todayName} \\(today\\)`) })).toHaveAttribute('aria-pressed', 'true');

    const seen: string[] = [];
    for (const day of DAYS) {
      await strip.getByRole('button', { name: new RegExp(`^${day}`) }).click();
      await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${day}`) })).toBeVisible();
      seen.push(await page.locator('main').innerText());
    }

    // Ground truth: subjects that exist only on OTHER classes' slots must never show.
    const own = new Set<string>();
    const others = new Set<string>();
    for (const s of slotsSnap.docs) {
      const d = s.data();
      (d.classId === studentClassId ? own : others).add(d.subjectName as string);
    }
    const foreign = [...others].filter((n) => n && !own.has(n));
    const everything = seen.join('\n');
    for (const name of foreign) {
      expect(everything, `another class's subject "${name}" is visible to the student`).not.toContain(name);
    }
  });

  test('Profile: the institution logo is hidden on phones, shown on desktop', async ({ page, context, browser }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    await page.goto('/dashboard/profile');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('main').getByRole('img', { name: INSTITUTION_NAME! })).toHaveCount(0);

    // Desktop keeps it (when the institution has a logo at all).
    const iid = await institutionId();
    const hasLogo = !!(await db().collection('institutions').doc(iid).get()).data()?.logoUrl;
    if (hasLogo) {
      const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const dpage = await desktop.newPage();
      await forceLiveData(desktop);
      await loginAsStudent(dpage);
      await dpage.goto('/dashboard/profile');
      await expect(dpage.locator('main').getByRole('img', { name: INSTITUTION_NAME! })).toBeVisible({ timeout: 25_000 });
      await desktop.close();
    }
  });
});

// ── My Attendance: header layout, long dates, full width ────────────────────

const LONG_DATE = '[A-Z][a-z]+ \\d{1,2}, \\d{4}';
const RANGE_RE = new RegExp(`^${LONG_DATE} – ${LONG_DATE}$`);

async function openMyAttendance(page: Page) {
  await page.goto('/dashboard/attendance/my');
  const name = page.getByTestId('attendance-term-name');
  // No active term / no class: nothing to lay out.
  const shown = await name.waitFor({ state: 'visible', timeout: 25_000 }).then(() => true, () => false);
  test.skip(!shown, 'The QA student has no active term, so there is no attendance header to check');
  return { name, range: page.getByTestId('attendance-term-range') };
}

test.describe('My Attendance on a phone (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the term range sits beneath the term name, in long dates', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    const { name, range } = await openMyAttendance(page);
    const rangeText = (await range.innerText()).replace(/\s+/g, ' ').trim();
    expect(rangeText).toMatch(RANGE_RE);
    const nameBox = (await name.boundingBox())!;
    const rangeBox = (await range.boundingBox())!;
    expect(rangeBox.y, 'range is below the name').toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
    // No ISO dates anywhere on the page.
    expect(await page.locator('main').innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

test.describe('My Attendance on desktop (1280x800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('name and range share a row, dates are long, and the page spans the width', async ({ page, context }) => {
    await forceLiveData(context);
    await loginAsStudent(page);
    const { name, range } = await openMyAttendance(page);
    const rangeText = (await range.innerText()).replace(/\s+/g, ' ').trim();
    expect(rangeText).toMatch(RANGE_RE);
    const nameBox = (await name.boundingBox())!;
    const rangeBox = (await range.boundingBox())!;
    expect(Math.abs(rangeBox.y - nameBox.y), 'same row').toBeLessThan(10);
    expect(rangeBox.x, 'range is beside, to the right of the name').toBeGreaterThan(nameBox.x + nameBox.width - 1);
    expect(await page.locator('main').innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    // The old max-w-3xl cap (768px) is gone: the tab bar fills the content area.
    const main = (await page.locator('main').boundingBox())!;
    const tabs = (await page.getByRole('tablist').boundingBox())!;
    expect(tabs.width, 'tab bar width vs <main>').toBeGreaterThan(main.width * 0.85);
    expect(tabs.width).toBeGreaterThan(800);
  });
});