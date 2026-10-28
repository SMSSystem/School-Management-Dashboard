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

## Demo data

`seed-demo-primary-school.mjs` (the Blue Mountain demo institution) and `clear-demo-activity-log.mjs`.

## Shared logic

`*Logic.mjs` files (with `.d.mts` typings) hold the pure decisions of a script so that vitest can test them from `src/lib/__tests__`; they do no I/O. `readSourcesLogic.mjs`, `bundleGraphLogic.mjs`, `cardBoundaryLogic.mjs`, `loadErrorScanLogic.mjs` and `maxLinesLogic.mjs` serve the source-scanning tests instead.
