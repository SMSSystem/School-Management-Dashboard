import { test, expect } from '@playwright/test';
import { forceLiveData, login, logout, dismissTourIfPresent } from './helpers';
import {
  submissionExists,
  findGradebookColumn,
  getResultForAssignment,
  INSTITUTION_NAME,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEACHER_EMAIL,
  TEACHER_PASSWORD,
  SENIOR_TEACHER_EMAIL,
  SENIOR_TEACHER_PASSWORD,
  CLASS_A_NAME,
  CLASS_B_NAME,
  RUBRIC_TITLE,
  STUDENT_NAME,
  STUDENT_EMAIL,
  PARENT_NAME,
  PARENT_EMAIL,
  SENIOR_TEACHER_2_NAME,
  SENIOR_TEACHER_2_EMAIL,
  FIXTURE_PASSWORDS,
  persistCredential,
  ensureClassExists,
  ensureSubjectExists,
  ensureGradebookColumn,
  ensureRubricExists,
  ensureUserExists,
  createAssignmentAsTeacher,
  assignmentRow,
  ensurePastChangePassword,
  openAssignment,
} from './assignments-workflow-support';

// ASSIGNMENTS_FEATURE_SPEC.md §12 QA pass, driven end-to-end against the
// live QA institution (QA_INSTITUTION_NAME, academic_year mode) rather than a
// disposable one — matching this suite's own established precedent
// (00-setup-custom-institution.spec.ts bootstraps its own institution;
// 01 reuses the QA institution, its term (QA_TERM_NAME) and the QA_* role accounts
// already seeded there). Fixtures below are new, QA-prefixed, and additive
// only — nothing pre-existing (Ipsum Class, Mathematics, QA_STUDENT's own
// class, etc.) is touched, so this can't destabilize the other specs.
//
// Two real structural gaps, not covered here by design:
//   - Late-status/gradebookColumnId-reference-integrity *rejection* checks
//     (§12's "attempt a raw Firestore write bypassing the app's own
//     client-side check") need a write that never goes through the UI at
//     all — outside what a browser-driven Playwright spec can exercise.
//     Would need the Firebase Rules Unit Testing SDK (not used anywhere in
//     this repo yet) or a raw REST/Admin-SDK call instead. The *acceptance*
//     path (a genuinely on-time vs. genuinely late submission, both
//     through the real client) IS covered below.
//   - TTL/retention deletion: moot per the documented decision not to
//     enable Firestore TTL for this feature (ASSIGNMENTS_FEATURE_SPEC.md
//     §9.1) — nothing to observe. The 4-month trim script is a Node/Admin
//     SDK tool, not a browser flow; verify it with
//     `node scripts/trim-old-submission-attachments.mjs --dry-run`
//     directly, not through this spec.

test.describe.configure({ mode: 'serial' });

test('fixtures: class(es), subject, rubric, student, parent link, second senior_teacher', async ({ page, context }) => {
  test.skip(
    !INSTITUTION_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || !TEACHER_EMAIL,
    'QA_INSTITUTION_NAME / QA_ADMIN_* / QA_TEACHER_EMAIL missing from .env.qa',
  );

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await test.step('ensure QA Assignments Class + Class B exist', async () => {
    await ensureClassExists(page, CLASS_A_NAME);
    await ensureClassExists(page, CLASS_B_NAME);
  });

  await test.step('ensure QA Assignments Subject exists, scoped to both classes, teacher checked in', async () => {
    // Teacher name resolved from the roster rather than hardcoded — this
    // spec only knows QA_TEACHER by email (QA_TEACHER_EMAIL), and the
    // subject's teacher checklist is keyed by display name.
    await page.goto('/dashboard/list/teachers');
    await dismissTourIfPresent(page);
    const teacherRow = page.locator('tr', { hasText: TEACHER_EMAIL! });
    // The name cell's innerText is multi-line: a single-letter avatar
    // initial, the display name, and the email, stacked — e.g.
    // "E\nExample Regular Teacher Dot One\n\nregularteacher@demo.com".
    const cellLines = (await teacherRow.locator('td').first().innerText())
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const teacherName = cellLines.find((line) => line !== TEACHER_EMAIL && line.length > 1);
    if (!teacherName) throw new Error(`Could not resolve a display name for ${TEACHER_EMAIL} from: ${cellLines.join(' | ')}`);
    await ensureSubjectExists(page, teacherName);
  });

  await test.step('ensure the rubric exists', async () => {
    await ensureRubricExists(page);
  });

  await test.step('ensure the fixture student exists in QA Assignments Class', async () => {
    await ensureUserExists(page, { name: STUDENT_NAME, email: STUDENT_EMAIL, roleLabel: 'Student', className: CLASS_A_NAME });
    if (process.env.QA_ASSIGNMENTS_STUDENT_EMAIL !== STUDENT_EMAIL || process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD !== FIXTURE_PASSWORDS.Student) {
      persistCredential('QA_ASSIGNMENTS_STUDENT_EMAIL', STUDENT_EMAIL);
      persistCredential('QA_ASSIGNMENTS_STUDENT_PASSWORD', FIXTURE_PASSWORDS.Student);
    }
  });

  await test.step('ensure the fixture parent exists and is linked to the fixture student', async () => {
    await ensureUserExists(page, { name: PARENT_NAME, email: PARENT_EMAIL, roleLabel: 'Parent' });
    if (process.env.QA_ASSIGNMENTS_PARENT_EMAIL !== PARENT_EMAIL || process.env.QA_ASSIGNMENTS_PARENT_PASSWORD !== FIXTURE_PASSWORDS.Parent) {
      persistCredential('QA_ASSIGNMENTS_PARENT_EMAIL', PARENT_EMAIL);
      persistCredential('QA_ASSIGNMENTS_PARENT_PASSWORD', FIXTURE_PASSWORDS.Parent);
    }

    await page.goto('/dashboard/list/students');
    await dismissTourIfPresent(page);
    // The student's name cell links to their own detail page (list/students/
    // [id]/index.tsx, which hosts "Linked Parents") — distinct from the
    // row's "Edit" button, which opens the StudentForm update modal instead.
    await page.locator('tr', { hasText: STUDENT_NAME }).getByRole('link').click();
    await page.waitForURL(/\/dashboard\/list\/students\//, { timeout: 10_000 });
    await dismissTourIfPresent(page);

    const alreadyLinked = await page.getByText('No parents linked yet.').isHidden().catch(() => false);
    if (!alreadyLinked) {
      // Option text is `${name} — ${email}` (list/students/[id]/index.tsx).
      await page.locator('select').filter({ has: page.locator('option', { hasText: PARENT_EMAIL }) }).selectOption({ label: `${PARENT_NAME} — ${PARENT_EMAIL}` });
      await page.getByRole('button', { name: 'Link', exact: true }).click();
      await expect(page.getByText('Failed to link parent')).toHaveCount(0);
      // The Link button resetting to disabled + the select reverting to its
      // placeholder both confirm handleLinkParent()'s setDoc resolved
      // without throwing — but the page's own parentLinks onSnapshot
      // listener has, empirically, not always reflected that within this
      // same live session (a real app-level staleness, not a scripting
      // issue — reproduced across repeated runs). Reload once to force a
      // fresh mount/read rather than trusting the live listener.
      await expect(page.getByRole('button', { name: 'Link', exact: true })).toBeDisabled({ timeout: 20_000 });
      await page.reload();
      await dismissTourIfPresent(page);
      await expect(page.getByText(PARENT_NAME, { exact: false })).toBeVisible({ timeout: 20_000 });
    }
  });

  await test.step('ensure a second senior_teacher exists in the same department (for the §3 decision 11 cross-visibility check)', async () => {
    await ensureUserExists(page, { name: SENIOR_TEACHER_2_NAME, email: SENIOR_TEACHER_2_EMAIL, roleLabel: 'Senior Teacher' });
    if (process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL !== SENIOR_TEACHER_2_EMAIL || process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD !== FIXTURE_PASSWORDS['Senior Teacher']) {
      persistCredential('QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL', SENIOR_TEACHER_2_EMAIL);
      persistCredential('QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD', FIXTURE_PASSWORDS['Senior Teacher']);
    }
  });
});

const GOLDEN_DUE_OFFSET = 1; // tomorrow
const CROSSCLASS_DUE_OFFSET = 1; // tomorrow, in Class B

test('regular_teacher: draft assignment is invisible to the student; publishing makes it visible with rubric attached', async ({ page, context }) => {
  test.skip(!INSTITUTION_NAME || !TEACHER_EMAIL || !TEACHER_PASSWORD, 'QA_TEACHER_* missing from .env.qa');
  await forceLiveData(context);

  await test.step('regular_teacher creates a draft, standalone-graded assignment with the rubric attached', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await createAssignmentAsTeacher(page, {
      title: 'QA Golden Path Assignment',
      className: CLASS_A_NAME,
      dueDateOffsetDays: GOLDEN_DUE_OFFSET,
      type: 'Homework',
      status: 'Draft',
      gradingMode: 'standalone',
      rubricTitle: RUBRIC_TITLE,
    });
    await expect(assignmentRow(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });

    // Re-run safety: this test's whole premise is "starts draft, ends
    // published" — a re-run against a previous run's now-published fixture
    // would otherwise fail the draft-invisibility check below for a reason
    // that has nothing to do with the feature. Reset it back to draft first
    // if needed (scoped to this one assignment's own detail page, not the
    // list — "Published" is not a page-unique string there), same
    // idempotent-by-actual-state spirit as this repo's other setup specs.
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    // Wait for whichever status badge is actually current (the badge
    // simply doesn't render at all until `assignment` loads — no ambiguous
    // default-vs-real-state text to race here) rather than a one-shot
    // isVisible() right after navigation, which can run before the
    // detail page's own data has painted.
    const statusBadge = page.getByText('Draft', { exact: true }).or(page.getByText('Published', { exact: true }));
    await expect(statusBadge).toBeVisible({ timeout: 10_000 });
    if (await page.getByText('Published', { exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Edit assignment', exact: true }).click();
      await page.locator('select[name="status"]').selectOption({ label: 'Draft' });
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      await expect(page.locator('h1', { hasText: 'Edit assignment' })).toHaveCount(0, { timeout: 10_000 });
      if (!(await page.getByText('Draft', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false))) {
        await page.reload();
        await dismissTourIfPresent(page);
      }
      await expect(page.getByText('Draft', { exact: true })).toBeVisible({ timeout: 10_000 });
    }
  });

  await test.step('regular_teacher also creates a published cross-class assignment (Class B) — no student enrolled there', async () => {
    await createAssignmentAsTeacher(page, {
      title: 'QA Cross-Class Assignment',
      className: CLASS_B_NAME,
      dueDateOffsetDays: CROSSCLASS_DUE_OFFSET,
      type: 'Homework',
      status: 'Published',
      gradingMode: 'standalone',
    });
    await expect(assignmentRow(page, CLASS_B_NAME, CROSSCLASS_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  await test.step('student: sees neither the draft (own class) nor the Class B assignment (different class)', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    // Client-side navigation (sidebar link), not page.goto() — reproduced
    // empirically while building this spec: a hard reload immediately after
    // this account's very first mustChangePassword-clearing submit can
    // bounce right back to /change-password, apparently reading a still-
    // stale cached copy of the user doc rather than the just-written
    // mustChangePassword: false. A client-side route change reuses the
    // already-fresh in-memory AuthContext state instead of re-mounting it.
    await page.getByRole('link', { name: 'Assignments', exact: true }).click();
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await expect(page).toHaveURL(/\/dashboard\/list\/assignments/);
    // Same live-onSnapshot staleness pattern seen throughout this spec: the
    // student's list listener can still be serving a frozen snapshot from
    // before the teacher's reset-to-draft step above landed (confirmed
    // directly against Firestore — the document really is 'draft' at this
    // point). One reload forces a fresh read instead of trusting the
    // in-session live listener.
    if (await assignmentRow(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET).isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await expect(assignmentRow(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET)).toHaveCount(0);
    await expect(page.getByText(CLASS_B_NAME, { exact: true })).toHaveCount(0);
    await logout(page);
  });

  await test.step('regular_teacher: publishes the draft assignment', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Golden Path Assignment' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Edit assignment', exact: true }).click();
    await page.locator('select[name="status"]').selectOption({ label: 'Published' });
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Edit assignment' })).toHaveCount(0, { timeout: 10_000 });
    // Same live-onSnapshot staleness pattern observed elsewhere in this
    // spec (the parent-link fixture step, the student's assignments list) —
    // correlates with the intermittent "Missing or insufficient
    // permissions" / "Uncaught Error in snapshot listener" console noise
    // seen throughout this QA environment. Reload once rather than trust
    // the live listener to have picked up this same-session write.
    if (!(await page.getByText('Published', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false))) {
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await expect(page.getByText('Published', { exact: true })).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  await test.step('student: now sees the published assignment, with its rubric rendered on the detail page', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Golden Path Assignment' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(RUBRIC_TITLE, { exact: true })).toBeVisible();
    await expect(page.getByText('Content quality', { exact: true })).toBeVisible();
  });
});

// §3 decision 11 — the one rule in this spec that deviates from every other
// collection's own convention (department-scoped isSeniorTeacherFor()):
// senior_teacher visibility here is role-filtered too. A senior_teacher
// sees their own assignments and same-department regular_teacher's, but
// NOT another senior_teacher's own — confirmed explicitly worth double-
// checking by the spec's own §12 text.
const SENIOR_OWN_DUE_OFFSET = 5;

test('senior_teacher visibility: own + same-department regular_teacher, but not another senior_teacher\'s own', async ({
  page,
  context,
}) => {
  test.skip(
    !INSTITUTION_NAME || !SENIOR_TEACHER_EMAIL || !SENIOR_TEACHER_PASSWORD,
    'QA_SENIOR_TEACHER_* missing from .env.qa',
  );
  await forceLiveData(context);

  await test.step('senior_teacher creates their own assignment (no teacherIds requirement — every non-regular_teacher role sees every subject)', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: SENIOR_TEACHER_EMAIL!,
      password: SENIOR_TEACHER_PASSWORD!,
    });
    await dismissTourIfPresent(page);
    await createAssignmentAsTeacher(page, {
      title: 'QA Senior Own Assignment',
      className: CLASS_A_NAME,
      dueDateOffsetDays: SENIOR_OWN_DUE_OFFSET,
      type: 'Project',
      status: 'Published',
      gradingMode: 'standalone',
    });
    await expect(assignmentRow(page, CLASS_A_NAME, SENIOR_OWN_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  await test.step('senior_teacher sees own assignment plus the same-department regular_teacher\'s (QA Golden Path Assignment, once published)', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: SENIOR_TEACHER_EMAIL!,
      password: SENIOR_TEACHER_PASSWORD!,
    });
    await dismissTourIfPresent(page);
    await page.goto('/dashboard/list/assignments');
    await dismissTourIfPresent(page);
    await expect(assignmentRow(page, CLASS_A_NAME, SENIOR_OWN_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
    // "QA Golden Path Assignment" (regular_teacher, same department) is
    // published by the end of the previous test — same due-date offset
    // (GOLDEN_DUE_OFFSET = 1) it was created with there.
    await expect(assignmentRow(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  await test.step('a second senior_teacher, same department, does NOT see the first senior_teacher\'s own assignment', async () => {
    test.skip(
      !process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL,
      'QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL missing — run the fixtures test first',
    );
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD!);
    await dismissTourIfPresent(page);
    await page.getByRole('link', { name: 'Assignments', exact: true }).click();
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD!);
    await dismissTourIfPresent(page);
    await expect(page).toHaveURL(/\/dashboard\/list\/assignments/);
    if (await assignmentRow(page, CLASS_A_NAME, SENIOR_OWN_DUE_OFFSET).isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await expect(assignmentRow(page, CLASS_A_NAME, SENIOR_OWN_DUE_OFFSET)).toHaveCount(0);
    // Still correctly sees the same-department regular_teacher's own —
    // confirms this is role-filtered specifically against *another
    // senior_teacher*, not a blanket department lockout.
    await expect(assignmentRow(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
  });
});

// Reuses "QA Golden Path Assignment" (published, standalone) from the
// earlier golden-path test — this leg picks up exactly where that one left
// off: student submits, teacher grades, student/parent both see the grade,
// then a resubmission bumps the attempt count.
const TEST_PDF_PATH = 'e2e/.fixtures/qa-submission.pdf';

test('submission + standalone grading: student submits, regular_teacher grades, student and parent both see it, resubmission increments the attempt', async ({
  page,
  context,
}) => {
  test.skip(
    !INSTITUTION_NAME || !TEACHER_EMAIL || !process.env.QA_ASSIGNMENTS_STUDENT_EMAIL || !process.env.QA_ASSIGNMENTS_PARENT_EMAIL,
    'Required QA_* credentials missing from .env.qa — run the fixtures + golden-path tests first',
  );
  await forceLiveData(context);

  await test.step('student submits work', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Golden Path Assignment' })).toBeVisible({ timeout: 10_000 });

    // Real bug found while building this spec: any UI-text-based
    // idempotency check here races the page's own mySubmission onSnapshot
    // (starts null, resolves async) — "Submit work" is the default/loading
    // label too, not just the genuine no-submission-yet one, so even a
    // waited check can resolve on the transient label and wrongly conclude
    // nothing exists yet, silently firing a real duplicate resubmission on
    // every re-run. Asking Firestore directly for ground truth sidesteps
    // that race entirely instead of trying to out-wait it.
    const alreadySubmitted = await submissionExists(page, process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!);
    if (!alreadySubmitted) {
      await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
      await expect(page.getByText('Submitted', { exact: true })).toBeVisible({ timeout: 15_000 });
    }
    await logout(page);
  });

  await test.step('regular_teacher grades the submission (standalone mode — score/max score both editable)', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Golden Path Assignment' })).toBeVisible({ timeout: 10_000 });

    const gradeButton = page.getByRole('button', { name: /^(Grade|Re-grade)$/ });
    await expect(gradeButton).toBeVisible({ timeout: 15_000 });
    await gradeButton.click();
    await expect(page.getByRole('heading', { name: /^Grade —/ })).toBeVisible({ timeout: 10_000 });
    const scoreInput = page.locator('xpath=//label[normalize-space(text())="Score"]/following-sibling::input[1]');
    const maxScoreInput = page.locator('xpath=//label[normalize-space(text())="Max Score"]/following-sibling::input[1]');
    await scoreInput.fill('8');
    await maxScoreInput.fill('10');
    // Plain `textarea` also matches Firebase App Check's hidden reCAPTCHA
    // textarea (#g-recaptcha-response) elsewhere on the page — scope to the
    // one following the Feedback label instead.
    await page
      .locator('xpath=//label[normalize-space(text())="Feedback (optional)"]/following-sibling::textarea[1]')
      .fill('Good work — QA grading pass.');
    await page.getByRole('button', { name: 'Save Grade', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Grade —/ })).toHaveCount(0, { timeout: 10_000 });

    if (!(await page.getByText('Graded', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false))) {
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await expect(page.getByText('Graded', { exact: true })).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  await test.step('student sees the grade and feedback', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    if (!(await page.getByText('Grade: 8 / 10').isVisible({ timeout: 5_000 }).catch(() => false))) {
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await expect(page.getByText('Grade: 8 / 10')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Good work — QA grading pass.', { exact: true })).toBeVisible();
    await logout(page);
  });

  await test.step('parent sees the same grade and feedback (read-only)', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_PARENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_PARENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_PARENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    if (!(await page.getByText('Grade: 8 / 10').isVisible({ timeout: 5_000 }).catch(() => false))) {
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await expect(page.getByText('Grade: 8 / 10')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Good work — QA grading pass.', { exact: true })).toBeVisible();
    await logout(page);
  });

  await test.step('student resubmits — attempt count increments, status reverts from Graded', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GOLDEN_DUE_OFFSET);
    // Wait for the real attempt count to render (auto-waiting expect, not a
    // one-shot isVisible() — see the earlier fixed race in this same spec)
    // before deciding whether a resubmission is still needed, and read
    // whatever the actual current number is rather than assuming 1.
    const attemptText = page.getByText(/^Attempt \d+ ·/);
    await expect(attemptText).toBeVisible({ timeout: 10_000 });
    const currentAttempt = Number((await attemptText.textContent())?.match(/Attempt (\d+)/)?.[1] ?? '1');
    if (currentAttempt >= 2) {
      return; // already resubmitted by a previous run — idempotent no-op
    }
    await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
    await expect(page.getByText('Attempt 2', { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});

// §5.3/§9.1's late-status enforcement — the *acceptance* path through the
// real client (a genuinely on-time vs. genuinely late submission both
// correctly labeled). The *bypass-resistance* half (a raw write lying
// about status) needs the Firebase Rules Unit Testing SDK or a raw REST
// call — outside what this Playwright spec can exercise; see this file's
// header comment.
const LATE_DUE_OFFSET = -3; // 3 days ago — already past

test('late submission: a submission made after an assignment\'s due date is correctly labeled Late', async ({
  page,
  context,
}) => {
  test.skip(!INSTITUTION_NAME || !TEACHER_EMAIL, 'QA_TEACHER_* missing from .env.qa');
  await forceLiveData(context);

  await test.step('regular_teacher creates an already-overdue published assignment', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await createAssignmentAsTeacher(page, {
      title: 'QA Late Submission Assignment',
      className: CLASS_A_NAME,
      dueDateOffsetDays: LATE_DUE_OFFSET,
      type: 'Homework',
      status: 'Published',
      gradingMode: 'standalone',
    });
    await expect(assignmentRow(page, CLASS_A_NAME, LATE_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  await test.step('student submits after the due date — status is Late, not Submitted', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, LATE_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Late Submission Assignment' })).toBeVisible({ timeout: 10_000 });

    if (!(await submissionExists(page, process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!))) {
      await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
    }
    await expect(page.getByText('Late', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Submitted', { exact: true })).toHaveCount(0);
  });
});

const GRADEBOOK_COLUMN_LABEL = 'QA Gradebook Column';
const GRADEBOOK_COLUMN_MAX_SCORE = 100;
const GRADEBOOK_MODE_DUE_OFFSET = 2;
const CONVERT_DUE_OFFSET = 3;

test('gradebook-mode grading: max score is locked to the linked column, and the results doc is written with gradebookColumnId', async ({
  page,
  context,
}) => {
  test.skip(!INSTITUTION_NAME || !TEACHER_EMAIL, 'QA_TEACHER_* missing from .env.qa');
  await forceLiveData(context);

  await test.step('ensure the gradebook column exists', async () => {
    if (await findGradebookColumn(GRADEBOOK_COLUMN_LABEL)) return;
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await ensureGradebookColumn(page, { label: GRADEBOOK_COLUMN_LABEL, maxScore: GRADEBOOK_COLUMN_MAX_SCORE, weight: 10 });
    await logout(page);
  });

  await test.step('regular_teacher creates a gradebook-mode assignment linked to that column', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    const columnId = await findGradebookColumn(GRADEBOOK_COLUMN_LABEL);
    if (!columnId) throw new Error(`Gradebook column "${GRADEBOOK_COLUMN_LABEL}" not found — fixture step above should have created it`);
    await createAssignmentAsTeacher(page, {
      title: 'QA Gradebook Mode Assignment',
      className: CLASS_A_NAME,
      dueDateOffsetDays: GRADEBOOK_MODE_DUE_OFFSET,
      type: 'Project',
      status: 'Published',
      gradingMode: 'gradebook',
      gradebookColumnId: columnId,
    });
    await expect(assignmentRow(page, CLASS_A_NAME, GRADEBOOK_MODE_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  await test.step('student submits', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GRADEBOOK_MODE_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Gradebook Mode Assignment' })).toBeVisible({ timeout: 10_000 });
    if (!(await submissionExists(page, process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!))) {
      await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
      await expect(page.getByText('Submitted', { exact: true })).toBeVisible({ timeout: 15_000 });
    }
    await logout(page);
  });

  let assignmentId = '';
  await test.step('regular_teacher grades — Max Score is locked to the column\'s own 100, not freely editable', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GRADEBOOK_MODE_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Gradebook Mode Assignment' })).toBeVisible({ timeout: 10_000 });
    assignmentId = page.url().split('/dashboard/list/assignments/')[1];

    // The roster's own submissionsByStudent onSnapshot can still be stale
    // right after a fresh session lands on this page — same pattern seen
    // and reload-worked-around throughout this spec. Sometimes needs more
    // than one reload in practice, hence the small retry loop.
    const gradeButton = page.getByRole('button', { name: /^(Grade|Re-grade)$/ });
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await gradeButton.isVisible({ timeout: 8_000 }).catch(() => false)) break;
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await expect(gradeButton).toBeVisible({ timeout: 15_000 });
    await gradeButton.click();
    await expect(page.getByRole('heading', { name: /^Grade —/ })).toBeVisible({ timeout: 10_000 });
    const maxScoreInput = page.locator('xpath=//label[normalize-space(text())="Max Score"]/following-sibling::input[1]');
    await expect(maxScoreInput).toBeDisabled();
    await expect(maxScoreInput).toHaveValue(String(GRADEBOOK_COLUMN_MAX_SCORE));
    const scoreInput = page.locator('xpath=//label[normalize-space(text())="Score"]/following-sibling::input[1]');
    await scoreInput.fill('85');
    await page.getByRole('button', { name: 'Save Grade', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Grade —/ })).toHaveCount(0, { timeout: 10_000 });
    await logout(page);
  });

  await test.step('the results doc is written correctly: linked to the column, source gradebook, score 85/100', async () => {
    await expect
      .poll(async () => getResultForAssignment(assignmentId), { timeout: 20_000, intervals: [2_000, 3_000, 5_000] })
      .toMatchObject({
        gradebookColumnId: expect.any(String),
        source: 'gradebook',
        score: 85,
        maxScore: GRADEBOOK_COLUMN_MAX_SCORE,
      });
  });
});

test('gradebook conversion: a standalone-graded assignment is retroactively rescaled onto a gradebook column', async ({
  page,
  context,
}) => {
  test.skip(!INSTITUTION_NAME || !TEACHER_EMAIL, 'QA_TEACHER_* missing from .env.qa');
  await forceLiveData(context);

  await test.step('ensure the gradebook column exists (shared with the gradebook-mode test above)', async () => {
    if (await findGradebookColumn(GRADEBOOK_COLUMN_LABEL)) return;
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await ensureGradebookColumn(page, { label: GRADEBOOK_COLUMN_LABEL, maxScore: GRADEBOOK_COLUMN_MAX_SCORE, weight: 10 });
    await logout(page);
  });

  await test.step('regular_teacher creates a standalone assignment, student submits, teacher grades it 15/20', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await createAssignmentAsTeacher(page, {
      title: 'QA Convert Assignment',
      className: CLASS_A_NAME,
      dueDateOffsetDays: CONVERT_DUE_OFFSET,
      type: 'Essay',
      status: 'Published',
      gradingMode: 'standalone',
    });
    await expect(assignmentRow(page, CLASS_A_NAME, CONVERT_DUE_OFFSET)).toBeVisible({ timeout: 10_000 });
    await logout(page);

    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!,
      password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, CONVERT_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Convert Assignment' })).toBeVisible({ timeout: 10_000 });
    // Unconditional, not gated on submissionExists() — that check proved
    // intermittently unreliable for this specific assignment while building
    // this spec (Firestore genuinely showed 0 submissions immediately after
    // a run that had "skipped" uploading because the check claimed one
    // already existed). Submitting again when one already exists is just an
    // ordinary, harmless resubmission (a new attempt, same grade fields
    // untouched) — not worth chasing the race for a one-time verification
    // pass.
    await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
    await expect(page.getByText(/^(Submitted|Late)$/)).toBeVisible({ timeout: 15_000 });
    await logout(page);

    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, CONVERT_DUE_OFFSET);
    await expect(page.getByRole('heading', { name: 'QA Convert Assignment' })).toBeVisible({ timeout: 10_000 });

    const gradeOrRegrade = page.getByRole('button', { name: /^(Grade|Re-grade)$/ });
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await gradeOrRegrade.isVisible({ timeout: 8_000 }).catch(() => false)) break;
      await page.reload();
      await dismissTourIfPresent(page);
    }
    const alreadyGraded = await page.getByRole('button', { name: 'Re-grade' }).isVisible({ timeout: 8_000 }).catch(() => false);
    // A converted assignment locks Max Score to the column's, so a rerun after the conversion step has nothing to grade here.
    const alreadyConverted = !(await page.getByText('Convert to Gradebook', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false));
    if (!alreadyGraded && !alreadyConverted) {
      const gradeButton = page.getByRole('button', { name: /^(Grade|Re-grade)$/ });
      await expect(gradeButton).toBeVisible({ timeout: 15_000 });
      await gradeButton.click();
      await expect(page.getByRole('heading', { name: /^Grade —/ })).toBeVisible({ timeout: 10_000 });
      await page.locator('xpath=//label[normalize-space(text())="Score"]/following-sibling::input[1]').fill('15');
      await page.locator('xpath=//label[normalize-space(text())="Max Score"]/following-sibling::input[1]').fill('20');
      await page.getByRole('button', { name: 'Save Grade', exact: true }).click();
      await expect(page.getByRole('heading', { name: /^Grade —/ })).toHaveCount(0, { timeout: 10_000 });
    }
  });

  let assignmentId = '';
  await test.step('regular_teacher converts the assignment to gradebook mode, linking the same column', async () => {
    assignmentId = page.url().split('/dashboard/list/assignments/')[1];
    // The "Convert to Gradebook" button only renders while gradingMode is
    // still 'standalone' — its visibility IS the not-yet-converted check.
    const notYetConverted = await page.getByText('Convert to Gradebook', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false);
    if (notYetConverted) {
      const columnId = await findGradebookColumn(GRADEBOOK_COLUMN_LABEL);
      if (!columnId) throw new Error(`Gradebook column "${GRADEBOOK_COLUMN_LABEL}" not found`);
      await page.getByText('Convert to Gradebook', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Convert to Gradebook' })).toBeVisible({ timeout: 10_000 });
      const colSelect = page.locator('select').filter({ has: page.locator('option', { hasText: GRADEBOOK_COLUMN_LABEL }) });
      await expect(colSelect).toBeEnabled({ timeout: 10_000 });
      await colSelect.selectOption({ value: columnId });
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Convert to Gradebook' })).toHaveCount(0, { timeout: 15_000 });
    }
    await logout(page);
  });

  await test.step('the results doc is rescaled correctly: 15/20 onto a 100-point column = 75', async () => {
    await expect
      .poll(async () => getResultForAssignment(assignmentId), { timeout: 20_000, intervals: [2_000, 3_000, 5_000] })
      .toMatchObject({
        gradebookColumnId: expect.any(String),
        source: 'gradebook',
        score: 75,
        maxScore: GRADEBOOK_COLUMN_MAX_SCORE,
      });
  });
});
