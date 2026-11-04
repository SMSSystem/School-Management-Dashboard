import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, db, deleteNoteById, institutionId, seedNote, userByEmail, type UserInfo } from './lesson-notes-support';
import { LESSONS_HREF, PDF_BYTES, PDF_DATA_URL, loginAs, need } from './lesson-notes-ui-support';

// Download all (docs/miscellaneous-specs/LESSON_NOTE_12_FILES_SPEC.md section 9): the desktop zip, the repeat block, and
// the one-at-a-time version on a touch device. Small inline files only, so this adds nothing to the Realtime Database.
// playwright.config.ts turns VITE_SEQUENTIAL_DOWNLOADS on for this server; a build without it is pinned by a unit test.
// The local store is real IndexedDB here, which the unit tests cannot cover. This proves Chromium only: saving several
// files on real phones and tablets is still to be tested by hand.

const NOTE = 'QA Lesson Note Download All';
const FILE_NAMES = ['one.pdf', 'two.pdf', 'three.pdf'];
const FILE_IDS = ['file-1', 'file-2', 'file-3'];

let author: UserInfo;
let noteId = '';

async function seedThreeFiles(): Promise<void> {
  const iid = await institutionId();
  noteId = await seedNote({ name: NOTE, teacher: author, teacherRole: 'institution_admin' });
  const meta = (i: number) => ({ id: FILE_IDS[i], fileName: FILE_NAMES[i], mimeType: 'application/pdf', size: PDF_BYTES.length });
  const ref = db().doc(`institutions/${iid}/lessonNotes/${noteId}`);
  await ref.update({ hasAttachment: true, attachments: [0, 1, 2].map(meta), attachmentIds: FILE_IDS });
  for (const [i, id] of FILE_IDS.entries()) {
    await ref.collection('attachment').doc(id).set({ dataUrl: PDF_DATA_URL, fileName: FILE_NAMES[i], mimeType: 'application/pdf', size: PDF_BYTES.length });
  }
}

async function removeFile(id: string): Promise<void> {
  const iid = await institutionId();
  await db().doc(`institutions/${iid}/lessonNotes/${noteId}/attachment/${id}`).delete();
}

async function openNote(page: Page, touch = false): Promise<void> {
  await page.goto(LESSONS_HREF);
  if (touch) await page.getByText(NOTE, { exact: true }).first().click();
  else await page.getByRole('button', { name: `View ${NOTE}` }).click();
  await expect(page.getByRole('dialog', { name: NOTE })).toBeVisible();
}

const confirmDownload = (page: Page) => page.getByRole('button', { name: 'Download', exact: true }).last().click();

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
  author = await userByEmail(need('admin').email);
});

test.beforeEach(async ({ context }) => {
  await forceLiveData(context);
  await seedThreeFiles();
});

test.afterEach(async () => {
  if (noteId) await deleteNoteById(noteId);
});

test.describe('on a computer', () => {
  test('saves one zip of every file, then offers only Save again, even after a reload', async ({ page }) => {
    await loginAs(page, 'admin');
    await openNote(page);
    const dialog = page.getByRole('dialog', { name: NOTE });
    await expect(dialog.getByText(/^3 files, /)).toBeVisible();

    await dialog.getByRole('button', { name: 'Download all' }).click();
    await expect(page.getByText(/^Download 3 files \(/)).toBeVisible();
    const [zip] = await Promise.all([page.waitForEvent('download'), confirmDownload(page)]);
    expect(zip.suggestedFilename()).toBe(`${NOTE}.zip`);
    const entries = unzipSync(new Uint8Array(await readFile(await zip.path())));
    expect(Object.keys(entries).sort()).toEqual([...FILE_NAMES].sort());
    expect(Buffer.from(entries['one.pdf']).equals(PDF_BYTES)).toBe(true);

    await expect(dialog.getByText('All files downloaded')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Download all' })).toHaveCount(0);

    // The block and the copies survive a refresh, and the copies are enough with Firebase's copy gone.
    await removeFile('file-1');
    await openNote(page);
    await expect(dialog.getByText('All files downloaded')).toBeVisible();
    const [again] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Save again from this device' }).click()]);
    const repeated = unzipSync(new Uint8Array(await readFile(await again.path())));
    expect(Object.keys(repeated)).toContain('one.pdf');
  });

  test('a missing file is skipped and named, and only it can be retried', async ({ page }) => {
    await loginAs(page, 'admin');
    await removeFile('file-2');
    await openNote(page);
    const dialog = page.getByRole('dialog', { name: NOTE });
    await dialog.getByRole('button', { name: /Download (all|remaining)/ }).click();
    const [zip] = await Promise.all([page.waitForEvent('download'), confirmDownload(page)]);
    const entries = unzipSync(new Uint8Array(await readFile(await zip.path())));
    expect(Object.keys(entries).sort()).toEqual(['one.pdf', 'three.pdf']);
    await expect(dialog.getByText('Not downloaded: two.pdf.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Retry skipped (1)' })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('saves each file in turn, and a tap outside does not close the dialog', async ({ page }) => {
    await loginAs(page, 'admin');
    await openNote(page, true);
    const dialog = page.getByRole('dialog', { name: NOTE });
    const saved: string[] = [];
    page.on('download', (d) => saved.push(d.suggestedFilename()));

    await dialog.getByRole('button', { name: 'Download all' }).click();
    await expect(page.getByText(/Your browser may ask you to allow several downloads/)).toBeVisible();
    await confirmDownload(page);

    await expect(dialog.getByText('Keep this window open until all files are downloaded.', { exact: false })).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText('All files downloaded')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => saved.length).toBe(3);
    expect(saved).toEqual(FILE_NAMES);
  });

  test('Stop leaves only the rest to download', async ({ page }) => {
    await loginAs(page, 'admin');
    await openNote(page, true);
    const dialog = page.getByRole('dialog', { name: NOTE });
    await dialog.getByRole('button', { name: 'Download all' }).click();
    const first = page.waitForEvent('download');
    await confirmDownload(page);
    await first;
    await dialog.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /^Download remaining \(\d\)$/ })).toBeVisible({ timeout: 30_000 });
  });
});
