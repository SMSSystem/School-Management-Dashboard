# scripts/

Admin and maintenance scripts. They use the Firebase Admin SDK, so they bypass `firestore.rules`: run them locally with a service-account key (`--key=scripts/service-account.json`, git-ignored, never commit it), read the header comment of a script before running it, and start with its dry run. Several of them leave a log in `scripts/logs/` (git-ignored). None of them runs from the app or from CI.

"Default" below is what happens with no flag: **dry run** means nothing is written until `--live` (or `--apply`); **live** means it writes unless you pass `--dry-run`. The older scripts are live by default; newer ones are dry-run by default. Check the column before you run one.

## Regular tools

| Script | What it does | Default |
| --- | --- | --- |
| `recount-class-populations.mjs` | Stores each class's male/female/unspecified head-count and a baseline stamp (the Classes page also has a "Recount students" button). Run after any script that creates or moves students. | dry run |
| `remove-orphan-auth-accounts.mjs` | Deletes Firebase sign-in accounts that have no `users` document (left behind by the Delete user button). Prints the project; refuses an empty users collection or an unusually large run (`--allow-large`). | dry run |
| `sweep-orphan-blobs.mjs` | Removes orphaned large attachments from the Realtime Database and corrects its usage counters. | dry run (`--apply` writes) |
| `reset-qa-institution-admin-password.mjs`, `set-account-email.mjs`, `reset-role-default-passwords.mjs` | Account repair helpers. | dry run |
| `prune-stale-subject-enrollments.mjs` | Removes `subjectEnrollments` for subjects or classes that no longer match. | dry run |
| `trim-old-submission-attachments.mjs` | 4-month metadata-only trim of submission attachments. | live |
| `check-email-template.mjs` | Checks `docs/email-templates/first-sign-in-email.html` (`npm run check:email-template`). | read-only |

## One-time scripts (run once at deploy, then delete from the repository)

| Script | When | Default |
| --- | --- | --- |
| `backfill-student-class-ids.mjs` | Before the app version that reads `classIds` is live; then run `recount-class-populations.mjs`. | dry run |
| `backfill-has-photo.mjs` | After deploy, per institution, so the lists can skip photo reads. | dry run |
| `rotate-spectator-default-passwords.mjs` | Right after deploy (or with `--created-before=<deploy time>`), for spectators who never signed in and still have the old public password. | dry run |
| `rename-institution.mjs` | Once, when an institution changes its name. | dry run |
| `backfill-assignment-fields.mjs`, `migrate-lesson-note-files.mjs` | Already run; keep only until the next release. | dry run |
| `backfill-department-ids.mjs`, `backfill-nanp-phone-format.mjs`, `backfill-registration-directory.mjs`, `migrate-to-institutions.mjs` | Earlier migrations (see the spec each header names). | live (`--dry-run` previews) |

## Bulk-seed institution (stress test) and its teardown

`seed-bulk-institution.mjs` / `run-seed-bulk-institution.ps1` / `register-seed-task.ps1` create a large dummy institution across several daily runs (the Spark plan's write budget). `teardown-bulk-institution.mjs` removes it. `count-seed-institution.mjs` counts what the teardown will delete (including the five subcollections of any exam marked online) and has a `--verify` mode for after it; the teardown drains an online exam's subcollections before the exam, within its delete budget; `disable-seed-accounts.mjs` froze the seed accounts. Seed and teardown are **live by default** (`--dry-run` previews). Keep the scheduled seed task disabled. When the teardown has finished and `count-seed-institution.mjs --verify` passes, delete `count-seed-institution.mjs` and `disable-seed-accounts.mjs`. The picture packs of an online exam (`content/images_{n}`) are documents of the same `content` subcollection, so the count and the teardown include them with no change.

## Delete one institution

`delete-real-institution.mjs` deletes ONE institution and everything that belongs to it: every Firestore collection and subcollection under it (the list is checked against `firestore.rules` by a test), its `users` and `student_parents`, each user's `photo` and `activity_log`, the old flat collections, its Firebase Auth accounts, its Realtime Database files, usage counter and session locks, and finally its public directory entry and the institution document. It never touches a platform administrator, and it refuses the system documents (`_placeholder`, `_platform`, `master`). Names are not unique, so it works by id.

- **Find the id:** `node scripts/delete-real-institution.mjs --key=<key> --project=<id> --list-matches="School name"`.
- **Dry run (the default, reads only):** add `--institution-id=<id> --confirm-name="School name"`. It checks the name, the roster and the parents' links, then prints the documents per collection, the Auth accounts, the Realtime Database files, the reads it spent counting and the number of daily runs at `--budget` (default 5000). `--max-reads` caps the counting reads. A log goes to `scripts/logs/`.
- **Delete:** the same command with `--live`, then type the phrase it prints (`DELETE <n> <id>`). There is no backup. It stops at `--budget` deletes, saves `scripts/.delete-institution-<id>.checkpoint.json` (git-ignored) and is run again the next day; Spark allows 20,000 deletes and 50,000 reads a day for the whole project, and draining reads about one document per delete. Phases run directory entry, Auth accounts, Realtime Database, nested collections, per-user subcollections, `student_parents`, `users`, old flat collections, institution; a parent document is deleted only after its subcollections.
- **Leave room for real users.** The deletes and reads come out of the production project's quota, which the school's users share, so run it outside school hours. Every run, a resumed `--live` one too, counts everything first: up to `--max-reads` (default 20,000) and two count queries per user for the per-user subcollections. If it stops with "Counting needs more than N reads", raise `--max-reads` only when the day's quota allows.
- **Prove it:** `--institution-id=<id> --verify` (read-only) exits 1 and lists anything that remains.
- **Not covered:** documents without an `institutionId` that sit outside the institution's own paths; the deletion is not atomic, so stop only at a budget stop.

## Set up the QA institution

`setup-qa-institution.mjs` makes ONE QA institution ready for the e2e suite and may change only a QA institution named in `setupQaInstitutionLogic.mjs` (today Brookfield Evening Institute). It sets academic calendar mode, creates a department, an academic year with a term, a class and five accounts (institution admin, senior teacher, regular teacher, parent, student) whose addresses start with `--email-prefix` (for example `qa.bf.admin@demo.com`), and removes what the retired fallback spec (e2e 07) left, by exact name: its time block (an academic year with one term), subject, class and timetable slots. Any other academic year or term it finds is reported and stops a live run. Dry run by default: it prints the inventory and the plan; `--live` also needs `--project`, the exact `--confirm-name` and the typed phrase. Idempotent: documents and accounts it made are kept. Passwords are generated, printed once with the `.env.qa` lines to paste (including `QA_INSTITUTION_ID`), and never saved; the Auth accounts are created before the documents, so if the run fails midway the passwords are lost and must be reset in the Firebase console. It makes about 20 writes and a few dozen reads from the production project's shared quota. Afterwards run `recount-class-populations.mjs` for the institution. The id comes from `delete-real-institution.mjs --list-matches="<name>"`.

## Demo data

`seed-demo-primary-school.mjs` (the Blue Mountain demo institution) and `clear-demo-activity-log.mjs`.

## Shared logic

`*Logic.mjs` files (with `.d.mts` typings) hold the pure decisions of a script so that vitest can test them from `src/lib/__tests__`; they do no I/O. `readSourcesLogic.mjs`, `bundleGraphLogic.mjs`, `cardBoundaryLogic.mjs`, `loadErrorScanLogic.mjs` and `maxLinesLogic.mjs` serve the source-scanning tests instead.
