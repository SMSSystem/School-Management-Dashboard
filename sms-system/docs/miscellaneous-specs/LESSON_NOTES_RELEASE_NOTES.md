# Lesson Notes + Users Lockdown — Release Notes and Deploy Order

Branch `lesson-notes-feat`. This release ships three things together: the Lesson Notes feature, required teacher departments, and a lockdown of the `users` document, activity log and audit log (including account deactivation). They share one `firestore.rules` file, so the deploy order matters.

## Deploy order (do not reorder)

1. **Indexes** — `firebase deploy --only firestore:indexes`. Adds three `lessonNotes` composite indexes (`teacherId`+`updatedAt`, `departmentId`+`teacherRole`+`updatedAt`, `classId`+`updatedAt`). Wait until all show **Enabled** in the Firebase Console; the Lesson Notes page fails for teachers, students and parents until they are built.
2. **App** — merge to `main` and let Vercel deploy. The new bundle sends a server-verified `recordedAt` on every activity/audit log write, which the new rules require.
3. **Rules** — `firebase deploy --only firestore:rules` (run `--dry-run` and review `git diff -- firestore.rules` first).
   - Deploying the rules before step 2 breaks sign-in logging, account creation and the super_admin profile save for anyone still on the old bundle.
4. **Verify** — `npx playwright test e2e/09-lesson-notes.spec.ts e2e/10-teacher-department.spec.ts e2e/11-users-lockdown.spec.ts`. The seven rule probes in spec 11 only pass once step 3 is done.

Rollback: redeploy the previous `firestore.rules`. No data migration is involved.

## Behaviour changes users will notice

- New **Lessons** page (Lesson Notes) for admins, teachers, students and parents; students and parents see notes for their class(es), read-only.
- Teachers must have a department when the institution has departments; admins see a "No department" badge and teachers see a warning.
- Admins can deactivate/reactivate teacher, student and parent accounts; an inactive account is signed out with an explanation.
- Users can no longer edit their own `classId`, `assignedClassId`, `canGenerateSchedule`, `status` and similar fields; an institution_admin can no longer edit another institution_admin.
- Stale browser tabs opened before step 2 must be reloaded or their log writes will be rejected.

## Free-tier notes

- Lesson note lists read at most the 100 most recent notes per query; attachments (base64, ≤500 KB) are fetched only when a note is opened.
- Deactivating an account patches the cached users list instead of refetching it.
- `useMyDepartment` reuses the user document `AuthContext` already reads at sign-in.
- The rules add no extra billed document reads beyond the existing `me()` lookup.

See `ISSUES_AND_GAPS.md` #38 and #39 and `docs/firebase/firebase-rules.md` for details and known limits.

---

# Addendum: several files per note, optional links, three-line view header

Branch `lesson-notes-refactor`. Full design: `LESSON_NOTES_FEATURE_SPEC.md` section 11.

## Deploy order (do not reorder)

1. **Rules** - `firebase deploy --only firestore:rules` (run `--dry-run` first). Additive: both the old single-file shape and the new shape are valid.
2. **Migration** - `node scripts/migrate-lesson-note-files.mjs --key=<path>` (dry run, read-only), then with `--live`. Adds `attachments` and `attachmentIds` to notes that have a file; idempotent; never changes `updatedAt`.
3. **App** - merge to `main` and let Vercel deploy (includes the orphan-sweep change).
4. **Migration again** - `--live`, to catch notes edited by the old app in between.
5. **Later** - `--drop-legacy` removes the old single-file fields.

Rollback: revert the app. The rules stay. Old notes keep their legacy fields until step 5.

## Behaviour changes users will notice

- A lesson note can have up to 5 files (up to 15 MB in total; each up to 5 MB for teachers and admins, 500 KB for other roles).
- A note no longer needs a file or a link.
- The view dialog lists each file with its own Download, and shows `Class`, `Subject/Course` and `Overseen by` on separate lines.
- The lesson notes list shows a file icon with a count when a note has several files.

## Free-tier notes

No new indexes or reads on list pages. Deleting a note reads its file documents (at most 5). Downloads are one read per file, on click.

---

# Addendum: a lesson note for several classes (2026-10-20)

Full design: `LESSON_NOTES_FEATURE_SPEC.md` section 12.

## Deploy order (do not reorder)

1. **Rules and index** - `npm run firebase:deploy:rules`, then `npm run firebase:deploy:indexes`; wait until the `classIds` + `updatedAt` index is READY in the console. Safe first: no client writes `classIds` yet.
2. **App** - merge to `main` and let Vercel deploy.

No data script is needed.

## Behaviour changes users will notice

- The lesson note form has a list of classes to tick (up to 20) instead of one Class select. Everyone in a ticked class (and their parents) can open the note.
- The table, cards and details dialog list all of a note's classes; the search matches any of them.
- Students now read lesson notes broadly in the rules (as parents already could); the page still shows only their own classes. See `ISSUES_AND_GAPS.md` #66.

## Free-tier notes

One new index. Students and parents run two queries per group of 10 classes; a note whose first class is theirs is read twice until old notes get a `classIds` list. No extra writes.

---

# Addendum: a lesson note for several subjects (2026-10-20)

Full design: `LESSON_NOTES_FEATURE_SPEC.md` section 13.

## Deploy order (do not reorder)

1. **Rules** - `npm run firebase:deploy:rules`. Additive: no client writes `subjectIds` yet. No index change.
2. **App** - merge to `main` and let Vercel deploy.

No data script is needed.

## Behaviour changes users will notice

- The lesson note form has a list of subjects to tick (up to 5) instead of one Subject select.
- A student sees a note if they are in one of its classes and take at least one of its subjects there.
- The table, phone cards and details dialog list all of a note's subjects, and a note appears under each of its subjects in the Subject filter.

## Free-tier notes

None: no new reads, writes or indexes.

---

# Addendum: 12 files per lesson note (2026-11-03)

See `LESSON_NOTE_12_FILES_SPEC.md`. Download all, the download quota gate and the student file rule follow in later releases.

## Deploy order (do not reorder)

1. **Check the counters** - `node scripts/sweep-orphan-blobs.mjs --key=<path> --project=<id>` (dry run). Stop if the total is above 700,000,000: the lower ceiling would then block deletes that leave it above.
2. **Rules** - `npm run firebase:deploy:rules` and `firebase deploy --only database --project school-sms-v1`. Both are already live as of 2026-11-03, and the running app stops at 5 files until the merge.
3. **App** - merge to `main` and let Vercel deploy.

Rollback: revert the app, and keep the file limit in the rules at 12. `isValidLessonNote` runs on every update, so going back to 5 would stop a note with more files from being edited.

## Behaviour changes users will notice

- A lesson note can have up to 12 files. The 15 MB total and the 5 MB limit per file are unchanged.
- The form shows how much of the 15 MB is used, and progress while large files upload.
- Choosing more files than fit adds what fits and names the rest.
- A note that would overfill the school's large-file storage is refused before anything uploads, and the form warns at 80% full.

## Free-tier notes

No new collections, indexes or Realtime Database paths. A note's maximum Realtime Database cost does not change, because the total stays. A note of only inline files can reach about 8.2 MB in Firestore, up from about 3.4 MB. Adding a large file makes one tiny counter read, and each save with large files one more.

---

# Addendum: Download all and the download limits (2026-11-03)

See `LESSON_NOTE_12_FILES_SPEC.md` sections 6 to 9.

## Deploy order (do not reorder)

1. **Rules** - `firebase deploy --only database --project school-sms-v1`. Already live as of 2026-11-03. Safe ahead of the app, which does not use the new paths, and both switches start absent.
2. **Vercel** - set `VITE_SEQUENTIAL_DOWNLOADS=true` for Preview only, not Production.
3. **App** - merge to `main` and let Vercel deploy.
4. **Later** - test Download all on an iPhone, an iPad and an Android device on a preview. If it works, set the variable for Production and redeploy.

Rollback: revert the app. The rules can stay: the counters only record numbers, and the switches do nothing unless turned on.

## Behaviour changes users will notice

- On a computer, a note with 2 or more files has **Download all**, which saves one zip. Phones and tablets keep each file's own button for now.
- A note cannot be fetched in full twice before sign-out: the button becomes **Download remaining**, then **All files downloaded** and **Save again from this device**.
- A file downloaded before comes from this device and costs no Firebase use.
- Downloads stop at monthly limits: Download all at 6 GB in total or 3 GB per school, and large files at 8.5 GB in total.

## Free-tier notes

No new collections or indexes. Each large download adds one small counter read and one small write. Repeats on a device cost nothing.

## Owner tools

`scripts/set-large-files-paused.mjs` pauses large-file reads or new uploads for everyone. Dry run unless `--apply`.

---

# Addendum: students read only their own classes' files

Full design: `LESSON_NOTE_12_FILES_SPEC.md` section 10.

## Deploy order

1. **Rules** - `firebase deploy --only firestore:rules`, after the read-only check of real students. Safe before the app: the screens already show a student only their own classes.
2. **Verify** - `npx playwright test e2e/09-lesson-notes.spec.ts`.
3. **App** - merge to `main` and let Vercel deploy. It adds the plain refusal message.

Rollback: redeploy the previous `firestore.rules`. No data changes.

## Behaviour changes users will notice

- None in normal use. A student refused a file sees "This file is for another class. Ask your teacher if you need it."
- Files on a student's device from before they changed class stay until sign-out.

## Free-tier notes

No new collections, indexes or billed rule reads.
