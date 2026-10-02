import { test, expect } from '@playwright/test';
import { forceLiveData } from './helpers';

// §11's fourth QA leg: "Registration form, custom-mode institution: submit
// with no guardian filled in at all; confirm the write succeeds. Submit the
// same against an academic-mode institution; confirm it's still rejected
// without a guardian." Also doubles as this leg's slice of §11's first bullet
// ("confirm zero behavior change... [for] the registration form") for
// academic-mode institutions, by asserting the Programme picker section
// (custom-mode only) does not appear at all for Example School.
//
// Both institution IDs are hardcoded — stable, already-established fixtures
// for this suite (Example School pre-exists; Hawthorn Institute is created
// by 00-setup-custom-institution.spec.ts), same as BLOCK_A_NAME/BLOCK_B_NAME
// elsewhere in it.
const EXAMPLE_SCHOOL_ID = 'yrGzUgjchGiGzTjMYLZr';
const HAWTHORN_ID = 'aBrolGCQmvkRm4Uwa7Nu';

const BLOCK_A_NAME = 'Mechanical Workshop 1 — Cohort A';
const BLOCK_B_NAME = 'Mechanical Workshop 1 — Cohort B';

function fillStudentSection(page: import('@playwright/test').Page, emailLocalPart: string) {
  return (async () => {
    await page.getByLabel('Last name').fill('Qa');
    await page.getByLabel('First name').fill('Applicant');
    await page.getByLabel('Requested class/grade').fill('N/A');
    // MIN_AGE_YEARS = 10, relative to "today" — well clear of the cutoff.
    await page.getByLabel(/Date of birth/).fill('2010-05-15');
    await page.getByLabel('Gender').selectOption({ label: 'Female' });
    await page.getByLabel('Email', { exact: true }).fill(`${emailLocalPart}@example.com`);
  })();
}

test('Hawthorn Institute (custom mode): Programme picker appears, submission with no guardian succeeds', async ({
  page,
  context,
}) => {
  await forceLiveData(context);
  await page.goto(`/register/${HAWTHORN_ID}`);

  await expect(page.getByRole('heading', { name: 'Programme' })).toBeVisible({ timeout: 10_000 });
  const programmeSelect = page.getByLabel('Which programme are you applying for?');
  const optionTexts = await programmeSelect.locator('option').allTextContents();
  expect(optionTexts).toEqual(expect.arrayContaining([BLOCK_A_NAME, BLOCK_B_NAME]));
  await programmeSelect.selectOption({ label: BLOCK_A_NAME });

  await fillStudentSection(page, `qa.hawthorn.applicant.${Date.now()}`);

  // Neither "Add mother's information" nor "Add father's information" is
  // checked — the whole point of this leg. institutionAllowsGuardianlessRegistration()
  // (firestore.rules) is what has to permit the resulting mother: null,
  // father: null write.
  await page.getByRole('button', { name: 'Submit Registration' }).click();

  await expect(page.getByRole('heading', { name: 'Registration received' })).toBeVisible({ timeout: 10_000 });
});

test('Example School (academic mode): no Programme picker, guardian still required client-side', async ({
  page,
  context,
}) => {
  await forceLiveData(context);
  await page.goto(`/register/${EXAMPLE_SCHOOL_ID}`);

  // Zero-behavior-change assertion for academic-mode institutions (§11's
  // first bullet, for this surface): the custom-mode-only Programme picker
  // must not exist at all.
  await expect(page.getByRole('heading', { name: 'Programme' })).toHaveCount(0);

  await fillStudentSection(page, `qa.example.applicant.${Date.now()}`);

  // Neither guardian checkbox is checked. buildSchema()'s superRefine adds a
  // client-side validation issue in this exact case for non-custom-mode
  // institutions — the submission never even reaches addDoc(), so this is a
  // stronger check than only exercising the firestore.rules guardian clause
  // server-side: the existing client-side guard (unchanged by this feature)
  // is the first thing that has to still reject it.
  await page.getByRole('button', { name: 'Submit Registration' }).click();

  await expect(page.getByText("Provide at least one parent/guardian's information.")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByRole('heading', { name: 'Registration received' })).toHaveCount(0);
});

// Phone fields (docs/formatting/PHONE_NUMBER_FORMATTING_SPEC.md §4.4, §4.5):
// the public form now masks phone numbers as they are typed, and the
// registrations rule in firestore.rules counts digits (7-15) instead of
// characters. This leg proves the deployed rules accept the NEW formatted
// shapes end-to-end, so run it AFTER deploying the updated firestore.rules.
//
// Like the Hawthorn test above it leaves one pending registration behind
// (an unauthenticated visitor can't delete it); the denial path of the rule
// itself (e.g. a 6-digit number written straight to Firestore) can't be driven
// from this form, because the client pattern rejects it first — it is covered
// by src/lib/__tests__/fieldPatterns.test.ts (pattern and rule text identical).
test('Hawthorn Institute: phone fields mask live and the deployed rules accept the new format', async ({
  page,
  context,
}) => {
  await forceLiveData(context);
  await page.goto(`/register/${HAWTHORN_ID}`);
  await expect(page.getByRole('heading', { name: 'Programme' })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Which programme are you applying for?').selectOption({ label: BLOCK_A_NAME });
  await fillStudentSection(page, `qa.hawthorn.phone.${Date.now()}`);

  const phone = page.getByLabel(/^Phone/);
  const phone2 = page.getByLabel(/^Second phone/);

  // A number starting with 1 is NANP-led: formatted progressively, capped at 11 digits.
  await phone.fill('18768018972');
  await expect(phone).toHaveValue('+1-876-801-8972');
  // A bare ten-digit number keeps the domestic mask (no institution context to
  // corroborate it on the public form).
  await phone2.fill('8765550123');
  await expect(phone2).toHaveValue('(876) 555-0123');

  await page.getByRole('button', { name: 'Submit Registration' }).click();
  await expect(page.getByRole('heading', { name: 'Registration received' })).toBeVisible({ timeout: 10_000 });
});

test('Hawthorn Institute: a phone number with fewer than 7 digits is rejected client-side', async ({
  page,
  context,
}) => {
  await forceLiveData(context);
  await page.goto(`/register/${HAWTHORN_ID}`);
  await expect(page.getByRole('heading', { name: 'Programme' })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Which programme are you applying for?').selectOption({ label: BLOCK_A_NAME });
  await fillStudentSection(page, `qa.hawthorn.badphone.${Date.now()}`);

  await page.getByLabel(/^Phone/).fill('123456');
  await page.getByRole('button', { name: 'Submit Registration' }).click();

  await expect(page.getByText('Enter a valid phone number.')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'Registration received' })).toHaveCount(0);
});
