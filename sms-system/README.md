# School Management System

A multi-tenant School Management System (SMS) web application built with React, TypeScript, and Firebase. The platform serves six distinct roles across multiple independent institutions from a single deployment, with each institution's data fully isolated by Firestore security rules.

**Version and changes:** the app's version is in `package.json` and shown at the bottom of the sidebar; what changed in each version is in [CHANGELOG.md](../CHANGELOG.md), and how versions are chosen and released is in [docs/VERSIONING.md](docs/VERSIONING.md).

---

## What the project is

The SMS is a dashboard-driven administrative tool for schools. A `super_admin` operator manages the platform and onboards institutions. Each institution has its own `institution_admin`, teachers (senior and regular), students, and parents. Every role sees a tailored dashboard and a scoped subset of the platform's features.

**Six roles:**

| Role                | Scope                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `super_admin`       | Platform-wide — manages all institutions                                                         |
| `institution_admin` | Single institution — manages staff, students, schedule, and reports                              |
| `senior_teacher`    | Department-level — grades, feedback, optional schedule management                                |
| `regular_teacher`   | Classroom-level — grades, feedback, read-only schedule                                           |
| `student`           | Own records — grades, reports, schedule                                                          |
| `parent`            | Linked child's records — grades, reports                                                         |
| `spectator`         | Single institution — read-only view of what an institution admin sees; no create, edit or delete |

---

## Current state of the project

The platform has grown well beyond the original MVP. List pages are connected to Firestore via real-time `onSnapshot` listeners across every resource (users, academic structure, schedule, attendance, grading, and disciplinary records). The following features have been built end-to-end:

- **Schedule management** — timetable slot creation with teacher-conflict detection, delegated access for senior teachers
- **Attendance** — General Attendance Register, Subject Attendance Register, Attendance Summary Register (gridsheet, PDF export), and role-scoped views (`/attendance/general`, `/attendance/subject`, `/attendance/gridsheet`, `/attendance/my`, `/attendance/child`)
- **Report cards** — institution profile wizard (logo/signature/grading-system setup), report card comments, full report card generation + signed PDF export
- **Gradebook** — editable grade grid per class/subject/term
- **Disciplinary actions** — merit/demerit/detention/suspension tracking, fed into report card generation
- **Online exams** — teachers build multiple-choice exams (by hand or imported from a spreadsheet, Word or PDF file, with an optional picture on any question), students sit them in the app against the server clock (supervised, or unsupervised with fullscreen, a watermark and optional forward-only navigation), the teacher gets an activity report of when the exam page was left, and staff grade, release and finalize them; scores flow into the report cards. Design, rules and limits: [`docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md`](docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md); what remains in [`docs/ISSUES_AND_GAPS.md`](docs/ISSUES_AND_GAPS.md) #69 to #73
- **Lesson notes** — a note can be for several classes and subjects, with up to 12 files (15 MB in total); see [`docs/miscellaneous-specs/LESSON_NOTES_FEATURE_SPEC.md`](docs/miscellaneous-specs/LESSON_NOTES_FEATURE_SPEC.md)
- **Rubrics** — a shared library of rubrics, typed or uploaded as a spreadsheet, Word, PDF or Markdown file, viewed one criterion at a time and downloadable from an assignment; see [`docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md`](docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md)
- **Terms & academic calendar** — full CRUD with status transitions (`upcoming / active / closed`), non-school-day configuration
- **Feedback comments** — per-student, per-subject narrative feedback by teachers, readable by students and parents
- **Institution onboarding wizard** — two-step flow that atomically creates an institution and its admin account
- **Institution branding** — logo/signature/brand settings, applied to generated PDFs
- **Admin utilities** — audit log viewer, grade-entry tracking, and one-off data-repair tools (backfill student classes, rebuild attendance summaries)
- **In-app product tour** — role-aware guided walkthrough (`nextstepjs`), including feature-specific mini-tours for the gradebook and report builder
- **Firebase CLI-managed Firestore rules/indexes** — `firestore.rules` and `firestore.indexes.json` are the deployed source of truth (see [Firebase](#firebase) below)

**What is still stub / not yet implemented:**

- **Lessons, Events and Announcements** — not built: nothing in the app writes those collections. Their Add/Edit dialogs show a "not available yet" panel (`src/components/forms/NotAvailableYet.tsx`), their list pages say so, and the two Home cards say "coming soon" (`docs/ISSUES_AND_GAPS.md` #64)
- `ClassForm` — `enrolledStudentIds[]` field absent (blocks BigCalendar integration below)
- Messages / notifications — no in-app inbox/messaging feature exists yet
- ~~Profile photo upload~~ — built: a base64 data URL in a Firestore document (`users/{uid}/photo/current`), uploaded by an administrator in the Edit Student, Edit Teacher and Create Account forms (see [`docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md`](docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md))
- Server-side pagination — most list pages still load the full collection client-side; cursor paging (`useCursorPages`, `lib/cursorPaging.ts`) is used by the audit log and the profile activity and audit cards

---

## Ideal projected completion state

The following represents the target completion state beyond the current build:

- **Lessons, Events and Announcements** — build the features behind the placeholder dialogs
- **BigCalendar integration** — role dashboards use `react-big-calendar` to render timetable slots as calendar events; requires `enrolledStudentIds[]` population in `ClassForm`
- **Phase 2 schedule features** — occurrence expansion (day-by-day event generation from timetable slots), room conflict detection
- **Server-side pagination** — replace client-side `.slice()` with Firestore `startAfter` cursor pagination across all list pages
- ~~**Profile photo upload** — Firebase Storage integration~~ — built without Firebase Storage (photos are Firestore documents); the `photo_update` activity log entry exists
- **Messages / notifications** — in-app messaging between roles
- **Orphan institution safeguard** — super admin dashboard widget surfacing institutions with zero `institution_admin` users
- **Automated Firestore rule tests** — emulator-based rule tests using `@firebase/rules-unit-testing`
- **Institution-nested Firestore architecture** — ongoing overhaul moving resource collections under `institutions/{institutionId}/...`; see [`docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md`](docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md) for status

---

## Tech stack

| Layer               | Technology                          | Version          |
| ------------------- | ----------------------------------- | ---------------- |
| UI framework        | React                               | ^19.2.7          |
| Language            | TypeScript                          | ^6.0.3           |
| Build tool          | Vite                                | ^8.0.16          |
| Styling             | Tailwind CSS                        | ^4.3.1           |
| Routing             | react-router-dom                    | ^7.18.2          |
| Forms               | react-hook-form + Zod               | ^7.80.0 / ^4.4.3 |
| Backend / Auth / DB | Firebase (Auth + Firestore)         | ^12.15.0         |
| Firebase tooling    | firebase-tools (CLI, devDependency) | ^15.34.0         |
| PDF generation      | @react-pdf/renderer                 | ^4.5.1           |
| Charts              | Recharts                            | ^3.8.1           |
| Calendar            | react-big-calendar / react-calendar | ^1.20.0 / ^6.0.1 |
| Product tour        | nextstepjs                          | ^2.2.0           |
| Date utilities      | moment                              | ^2.31.0          |

> Versions above are transcribed from `package.json` at time of writing — check there directly if this drifts.

---

## Running the project

### 1. Install dependencies

```sh
cd sms-system
npm install
```

### 2. Configure environment variables

Copy the contents of `.env.example` to `.env.local` and fill in your Firebase project credentials (see [Environment Variables](#environment-variables) below).

### 3. Start the development server

```sh
npm run dev
```

The app will be available at `http://localhost:5173` by default.

### Other scripts

```sh
npm run build                    # type-check (tsc -b) + production build (output: dist/)
npm run preview                  # serve the production build locally
npm run lint                     # run ESLint
npx tsc -b                       # type-check only (the root tsconfig has no files of its own, so `tsc --noEmit` checks nothing)
npm run test                     # run Vitest once
npm run test:watch               # run Vitest in watch mode
npm run test:rules               # Firestore rules tests in rules-tests/ on the emulator (needs Java; see Testing and code guards)
npm run test:e2e                 # Playwright specs in e2e/ (live Firebase project; see Testing and code guards)
npm run check:email-template     # validate docs/email-templates/first-sign-in-email.html
npm run version:bump -- minor --title "..."  # release: set the new version and turn Unreleased into its CHANGELOG entry (docs/VERSIONING.md)
npm run version:check            # check that package.json, package-lock.json and CHANGELOG.md agree
npm run version:extract -- 2.39.0  # print one version's CHANGELOG entry
npm run firebase:deploy:rules    # deploy firestore.rules only
npm run firebase:deploy:indexes  # deploy firestore.indexes.json only
npm run firebase:deploy          # deploy both rules and indexes
npm run seed:bulk                # bulk stress-test institution (live by default; see scripts/README.md)
npm run teardown:bulk            # remove it again
```

Admin and maintenance scripts that use the Admin SDK (and so bypass `firestore.rules`) are listed in [`scripts/README.md`](scripts/README.md), with whether each is a dry run or live by default.

### Testing and code guards

- **Version files** — `versionConsistency.test.ts` fails when `package.json`, `package-lock.json`, `CHANGELOG.md` and `scripts/retro-versions.json` disagree; change the version only with `npm run version:bump` (see [`docs/VERSIONING.md`](docs/VERSIONING.md)). The **Version check** workflow (`.github/workflows/version-check.yml`) runs the same check on a pull request and also fails when code that ships changed without a higher version.

- **Unit tests** (`npm run test`, Vitest, `src/lib/__tests__`): many of them read source files as text (`?raw` imports, or the `*Source.ts` helpers that join the files a feature was split into) to pin guards such as "every query filters on `institutionId`" or "every student writer moves the class head-counts". A rename or reformat of a pinned line can fail one of them on purpose: update the pin together with the code.
- **Fallow and Prettier** — `npm run quality` reports new dead code, duplication and complexity, and is advisory. `npm run format:files -- <paths>` applies the same formatting as saving in VS Code. Do not run `npm run format` yet. See [`docs/CODE_QUALITY.md`](docs/CODE_QUALITY.md); deferred work is in [`docs/BACKLOG.md`](docs/BACKLOG.md).
- **600-line limit** — ESLint's `max-lines` fails any TypeScript file over 600 counted lines. Files that must exceed it are listed with their own cap in `lint/maxLinesAllowList.json` (currently empty); `maxLinesAllowList.test.ts` fails on stale or loose entries.
- **zod** is imported only through `src/lib/zod.ts`, which turns off zod's compiled parsers (their `new Function` probe would be a Content-Security-Policy violation); `zodImport.test.ts` enforces it.
- **Rules tests** (`npm run test:rules`, `rules-tests/`) start the Firestore emulator and run the real `firestore.rules` against it (Java 21 and a one-time emulator download are needed; they are kept out of `npm run test`). Today they cover the online exam rules (exams, questions and key, attempts, grades, extra time, the delete cascade), the exam audit events and who may create results; the lesson-note rules are pinned only as source text (`lessonNoteClassesRules.test.ts`).
- **Playwright** (`npm run test:e2e`, specs in `e2e/`) drives a real browser against `npm run dev` and a **live Firebase project**: QA accounts and institution names come from `.env.qa` and some specs use `scripts/service-account.json`, both git-ignored. The institution the specs run against is `QA_INSTITUTION_NAME` (with `QA_INSTITUTION_ID`, printed by `scripts/setup-qa-institution.mjs`); every fixture address starts with `QA_EMAIL_PREFIX` and the fixture department and term are `QA_DEPARTMENT_NAME` and `QA_TERM_NAME` (defaults `QA Department` and `QA Term`), all read through `e2e/qa-names.ts`. `e2e/04` also needs `QA_CUSTOM_INSTITUTION_ID`, which `e2e/00` writes when it creates the custom-mode institution. Do not run `e2e/00` (creates institutions) or `e2e/04` (leaves pending registrations) casually. The project it uses is the production one, so its reads come out of the same Spark quota (50,000 a day) as real users': a full run of `e2e/08` to `e2e/30` costs roughly 20,000 reads (a rough estimate, not measured). Run the full suite at most once a day, check Usage in the Firebase console first, and rerun only the failing spec files.

The `firebase:deploy*` scripts require the Firebase CLI to be authenticated locally (`firebase login`, interactive) and targeting the correct project — see [Firebase](#firebase) below.

---

## Environment variables

Copy the contents of `.env.example` to `.env.local` and replace each placeholder with the real value from your Firebase project's settings page (**Project Settings → General → Your apps → SDK setup and configuration**).

```env
VITE_FIREBASE_API_KEY="string-of-characters"
VITE_FIREBASE_AUTH_DOMAIN="string-of-characters"
VITE_FIREBASE_PROJECT_ID="string-of-characters"
VITE_FIREBASE_STORAGE_BUCKET="string-of-characters"
VITE_FIREBASE_MESSAGING_SENDER_ID="string-of-numbers"
VITE_FIREBASE_APP_ID="string-of-characters"
VITE_FIREBASE_APPCHECK_SITE_KEY="string-of-characters"
VITE_FIREBASE_APPCHECK_DEBUG_TOKEN="string-of-characters"
VITE_FIREBASE_DATABASE_URL="https://<project-id>-default-rtdb.firebaseio.com"
VITE_SINGLE_SESSION_ENABLED="true"
VITE_EMAIL_ENABLED="true"
VITE_APP_URL="https://your-app.example"
```

`VITE_FIREBASE_DATABASE_URL` is **required in every environment** (large attachments and the one-session-per-account lock use the Realtime Database; copy the exact URL from the console, no trailing slash). `VITE_FIREBASE_APPCHECK_SITE_KEY` is the reCAPTCHA key App Check uses; `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` is read in development only. `VITE_SINGLE_SESSION_ENABLED`, `VITE_EMAIL_ENABLED` and `VITE_APP_URL` are production-only switches (the session lock, the "Send sign-in email" button and the link it sends): leave them unset in development, previews and e2e. Each is explained in `.env.example`.

### `VITE_USE_MOCK_DATA` (development only)

In **production builds the app always reads and writes Firestore**; there is nothing to configure. In development (`npm run dev`) the data source defaults to `blank` (empty states, no Firestore reads), or to `mock` (static arrays under `src/dev/mock`) when `VITE_USE_MOCK_DATA=true` is set in `.env.local`. A floating selector in the bottom-right corner (development only) switches between `mock`, `blank` and `live` for the session; it stores the choice in `localStorage` under `sms_data_mode_v2`, and a reload applies it. `docs/FEATURE_FLAG_DATA_MODE.md` has the details.

```env
VITE_USE_MOCK_DATA=true
```

> **Important:** The institution onboarding wizard (`/onboard-institution`) and the create-user page (`/create-user`) always write to real Firebase Auth and Firestore, whatever the data mode, because they call Firebase Auth directly. Valid Firebase credentials are required to use these pages even with `mock` data.

---

## Firebase

### Security rules

The authoritative Firestore security rules and composite indexes are tracked in the repo — `firestore.rules` and `firestore.indexes.json` — and deployed via the Firebase CLI (`npm run firebase:deploy`, or the `:rules` / `:indexes` variants individually). The Firebase Console's Rules/Indexes tabs reflect whatever was last deployed from these files; do not hand-edit rules or indexes in the Console. `.firebaserc` pins the CLI to the `school-sms-v1` project.

[`docs/firebase/firebase-rules.md`](docs/firebase/firebase-rules.md) documents the rule patterns and rationale (not a copy of the rules themselves) plus a historical pre-CLI snapshot for reference.

An institution-nesting overhaul of the entire Firestore data model is in progress — see [`docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md`](docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md) for current status before making structural changes to collections, rules, or indexes.

Key rule patterns:

- **Role + institution scoping** — every read and write is gated on the caller's `role` and `institutionId`, resolved by a `get()` on `users/{uid}` at rule evaluation time.
- **`score ≤ maxScore`** — enforced in the Firestore `results` rules, not just in the client-side Zod schema.
- **`canGenerateSchedule` flag** — senior teachers can only write to `timetable_slots` if their `users/{uid}` document has `canGenerateSchedule: true`.
- **Collection Group queries** — `activity_log` and `audit_log` are accessible via `collectionGroup()` queries; both are covered by Collection Group rules.

### Free-tier considerations (Spark plan)

| Resource            | Spark limit    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firestore reads     | 50,000 / day   | Most former `onSnapshot` listeners (Students/Teachers/Parents, plus ~55 reference-data dropdowns across terms/classes/subjects/departments/houses) are now cached, deduplicated reads via TanStack Query on top of an in-memory Firestore cache (LRU, so resume-token delta billing still applies within a session; a page reload starts cold and nothing personal is kept on the device after sign-out) — see `docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md` and issue #51. The dashboard head-counts use `count()` aggregations, not document listeners. Gradebook's grade-grid and both Attendance registers intentionally stay on live `onSnapshot` while a teacher is actively editing. This 50,000/day quota is pooled across the whole Firebase project, not per institution, so read pressure still grows with institution size and concurrent active sessions (see overhaul spec section 14). Since then (2026-10-19) the cache windows are named in one file (`src/lib/queryPolicies.ts`: reference data 10 minutes, people lists 5, live data 60 seconds), list-page listeners are shared and kept open 5 minutes (`src/lib/sharedListener.ts`), and class head-counts are stored on the class documents (`docs/ISSUES_AND_GAPS.md` #61 and #62). |
| Firestore writes    | 20,000 / day   | Low-frequency writes; no concern at current scale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Firestore deletes   | 20,000 / day   | Low-frequency; no concern at current scale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Authentication MAUs | 10,000 / month | Sufficient for pilot-scale school deployments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Storage             | 5 GiB          | Not used: profile photos are Firestore documents, and lesson-note and assignment files over about 500 KiB are Realtime Database blobs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Watch out for:** the `me()` security rule helper issues a `get()` on `users/{uid}` for every rule evaluation. Operations that also call `isClassTeacherFor()` or `isSeniorTeacherFor()` issue a second `get()`. Enable Firebase Usage Alerts in the Console before onboarding real users.

---

## Feature guides

### User Guide — [`docs/guides/USER_GUIDE.md`](docs/guides/USER_GUIDE.md)

A full manual for every role — institution admin, senior/regular teacher, student, and parent — covering every feature area from account setup through report cards and attendance registers. Start here for "how do I use feature X" questions.

### Demo & Testing Guide — [`docs/guides/DEMO_TESTING_GUIDE.md`](docs/guides/DEMO_TESTING_GUIDE.md)

An end-to-end walkthrough script (institution profile wizard → attendance register → report card PDF generation) intended for demoing the platform to prospective clients or manually verifying the full flow after changes. Assumes a fresh Firestore instance and the app in Live mode.

Two manual verification walkthroughs also live in `docs/guides/`: [`ONBOARD_INSTITUTION_VERIFICATION_GUIDE.md`](docs/guides/ONBOARD_INSTITUTION_VERIFICATION_GUIDE.md) and [`SCHEDULE_VERIFICATION_GUIDE.md`](docs/guides/SCHEDULE_VERIFICATION_GUIDE.md).

Additional feature-specific specs and implementation plans live under `docs/` (attendance, report-card, brand-data, subject-form, disciplinary actions, walkthrough tour, and the ongoing Firestore overhaul under `docs/overhaul/`) — consult the relevant subfolder before modifying that feature.

---

## Deployment

The project is deployed via **Vercel**. The `sms-system/` subdirectory is the Vite project root.

### Vercel configuration

Set the following in Vercel's project settings (**Settings → Environment Variables**):

- All `VITE_FIREBASE_*` variables from `.env.local`, including `VITE_FIREBASE_DATABASE_URL`
- `VITE_SINGLE_SESSION_ENABLED`, `VITE_EMAIL_ENABLED` and `VITE_APP_URL` for production (see [Environment variables](#environment-variables))

Set the **Root Directory** to `sms-system` in Vercel's build settings.

**Build command:** `npm run build`
**Output directory:** `dist`

### Releases

Each merge to `main` that raises the version is tagged `v<version>` and gets a GitHub Release by `.github/workflows/release.yml`, with that version's CHANGELOG entry as its notes. The workflow never commits, so it does not start another Vercel deploy. Rules and indexes are not deployed by it: follow the entry's **Deploy notes**. See [`docs/VERSIONING.md`](docs/VERSIONING.md).

### Security headers

`vercel.json` sends security headers on every response: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, and a **`Content-Security-Policy-Report-Only`** policy. The policy is report-only on purpose: it reports what it would block and blocks nothing. Check a preview deployment's console for violations before renaming the header to `Content-Security-Policy`; `src/lib/__tests__/vercelConfig.test.ts` pins the header set.

### SPA routing

The app uses client-side routing via react-router-dom. Vercel handles this automatically for Vite projects. If deploying elsewhere, configure the server to serve `index.html` for all routes (a `vercel.json` rewrite rule or an equivalent `_redirects` / `nginx.conf` entry).

### Production checklist

- [ ] All `VITE_FIREBASE_*` environment variables set in the deployment platform
- [ ] `VITE_FIREBASE_DATABASE_URL` (and, for production, `VITE_SINGLE_SESSION_ENABLED`, `VITE_EMAIL_ENABLED`, `VITE_APP_URL`) set in the deployment platform
- [ ] `firestore.rules` and `firestore.indexes.json` deployed via `npm run firebase:deploy` (see [Security rules](#security-rules))
- [ ] At least one `super_admin` user document exists in Firestore
