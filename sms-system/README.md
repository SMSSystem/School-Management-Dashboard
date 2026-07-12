# School Management System

A multi-tenant School Management System (SMS) web application built with React, TypeScript, and Firebase. The platform serves five distinct roles across multiple independent institutions from a single deployment, with each institution's data fully isolated by Firestore security rules.

---

## What the project is

The SMS is a dashboard-driven administrative tool for schools. A `super_admin` operator manages the platform and onboards institutions. Each institution has its own `institution_admin`, teachers (senior and regular), students, and parents. Every role sees a tailored dashboard and a scoped subset of the platform's features.

**Five roles:**

| Role                | Scope                                                               |
| ------------------- | ------------------------------------------------------------------- |
| `super_admin`       | Platform-wide — manages all institutions                            |
| `institution_admin` | Single institution — manages staff, students, schedule, and reports |
| `senior_teacher`    | Department-level — grades, feedback, optional schedule management   |
| `regular_teacher`   | Classroom-level — grades, feedback, read-only schedule              |
| `student`           | Own records — grades, reports, schedule                             |
| `parent`            | Linked child's records — grades, reports                            |

---

## Current state of the project

The platform has grown well beyond the original MVP. List pages are connected to Firestore via real-time `onSnapshot` listeners across every resource (users, academic structure, schedule, attendance, grading, and disciplinary records). The following features have been built end-to-end:

- **Schedule management** — timetable slot creation with teacher-conflict detection, delegated access for senior teachers
- **Attendance** — General Attendance Register, Subject Attendance Register, Attendance Summary Register (gridsheet, PDF export), and role-scoped views (`/attendance/general`, `/attendance/subject`, `/attendance/gridsheet`, `/attendance/my`, `/attendance/child`)
- **Report cards** — institution profile wizard (logo/signature/grading-system setup), report card comments, full report card generation + signed PDF export
- **Gradebook** — editable grade grid per class/subject/term
- **Disciplinary actions** — merit/demerit/detention/suspension tracking, fed into report card generation
- **Terms & academic calendar** — full CRUD with status transitions (`upcoming / active / closed`), non-school-day configuration
- **Feedback comments** — per-student, per-subject narrative feedback by teachers, readable by students and parents
- **Institution onboarding wizard** — two-step flow that atomically creates an institution and its admin account
- **Institution branding** — logo/signature/brand settings, applied to generated PDFs
- **Admin utilities** — audit log viewer, grade-entry tracking, and one-off data-repair tools (backfill student classes, rebuild attendance summaries)
- **In-app product tour** — role-aware guided walkthrough (`nextstepjs`), including feature-specific mini-tours for the gradebook and report builder
- **Firebase CLI-managed Firestore rules/indexes** — `firestore.rules` and `firestore.indexes.json` are the deployed source of truth (see [Firebase](#firebase) below)

**What is still stub / not yet implemented:**

- `LessonForm`, `EventForm`, `AnnouncementForm` — write paths are `console.log` stubs
- `ClassForm` — `enrolledStudentIds[]` field absent (blocks BigCalendar integration below)
- Messages / notifications — no in-app inbox/messaging feature exists yet
- Profile photo upload — implementation planned, not yet built
- Server-side pagination — all list pages currently load the full collection client-side

---

## Ideal projected completion state

The following represents the target completion state beyond the current build:

- **Remaining forms fully wired** — `LessonForm`, `EventForm`, `AnnouncementForm` write to Firestore
- **BigCalendar integration** — role dashboards use `react-big-calendar` to render timetable slots as calendar events; requires `enrolledStudentIds[]` population in `ClassForm`
- **Phase 2 schedule features** — occurrence expansion (day-by-day event generation from timetable slots), room conflict detection
- **Server-side pagination** — replace client-side `.slice()` with Firestore `startAfter` cursor pagination across all list pages
- **Profile photo upload** — Firebase Storage integration; `photo_update` activity log entry
- **Messages / notifications** — in-app messaging between roles
- **Orphan institution safeguard** — super admin dashboard widget surfacing institutions with zero `institution_admin` users
- **Automated Firestore rule tests** — emulator-based rule tests using `@firebase/rules-unit-testing`
- **Institution-nested Firestore architecture** — ongoing overhaul moving resource collections under `institutions/{institutionId}/...`; see [`docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md`](docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md) for status

---

## Tech stack

| Layer               | Technology                          | Version           |
| ------------------- | ----------------------------------- | ----------------- |
| UI framework        | React                               | ^19.2.7           |
| Language            | TypeScript                          | ^6.0.3            |
| Build tool          | Vite                                | ^8.0.16           |
| Styling             | Tailwind CSS                        | ^4.3.1            |
| Routing             | react-router-dom                    | ^7.18.0           |
| Forms               | react-hook-form + Zod               | ^7.80.0 / ^4.4.3  |
| Backend / Auth / DB | Firebase (Auth + Firestore)         | ^12.15.0          |
| Firebase tooling    | firebase-tools (CLI, devDependency) | ^15.23.0          |
| PDF generation      | @react-pdf/renderer                 | ^4.5.1            |
| Charts              | Recharts                            | ^3.8.1            |
| Calendar            | react-big-calendar / react-calendar | ^1.20.0 / ^6.0.1  |
| Product tour        | nextstepjs                          | ^2.2.0            |
| Date utilities      | moment                              | ^2.30.1           |

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
npm run build                    # type-check + production build (output: dist/)
npm run preview                  # serve the production build locally
npm run lint                     # run ESLint
npx tsc --noEmit                 # type-check without emitting files
npm run test                     # run Vitest once
npm run test:watch               # run Vitest in watch mode
npm run firebase:deploy:rules    # deploy firestore.rules only
npm run firebase:deploy:indexes  # deploy firestore.indexes.json only
npm run firebase:deploy          # deploy both rules and indexes
```

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
VITE_FIREBASE_MEASUREMENT_ID="string-of-characters"
```

### `VITE_DATA_MODE`

An optional variable that controls the application's data source. Add it to `.env.local` alongside the Firebase keys.

| Value   | Behaviour                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `live`  | All pages read from and write to Firestore. Requires valid Firebase credentials.                                                            |
| `mock`  | All pages read from static mock arrays in `src/lib/data.ts`. No Firestore reads. Recommended for UI development without a Firebase project. |
| `blank` | Pages render with empty states. No Firestore reads, no mock data. Useful for isolated UI development.                                       |

```env
VITE_DATA_MODE=live
```

If `VITE_DATA_MODE` is absent, the app defaults to `mock` mode.

The value can be overridden at runtime (without a rebuild) by setting `dataMode` in `localStorage` from the browser console:

```js
localStorage.setItem("dataMode", "live"); // then reload
```

> **Important:** The institution onboarding wizard (`/onboard-institution`) and the create-user page (`/create-user`) always write to real Firebase Auth and Firestore regardless of `VITE_DATA_MODE`, because they call Firebase Auth directly. Valid Firebase credentials are required to use these pages even in `mock` mode.

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

| Resource            | Spark limit    | Notes                                                                                                                                                          |
| ------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firestore reads     | 50,000 / day   | Dozens of `onSnapshot` listeners run in `live` mode, mostly full-collection queries; read pressure grows with institution size (see overhaul spec section 14). |
| Firestore writes    | 20,000 / day   | Low-frequency writes; no concern at current scale.                                                                                                             |
| Firestore deletes   | 20,000 / day   | Low-frequency; no concern at current scale.                                                                                                                    |
| Authentication MAUs | 10,000 / month | Sufficient for pilot-scale school deployments.                                                                                                                 |
| Storage             | 5 GiB          | Not yet used (photo upload is planned).                                                                                                                        |

**Watch out for:** the `me()` security rule helper issues a `get()` on `users/{uid}` for every rule evaluation. Operations that also call `isClassTeacherFor()` or `isSeniorTeacherFor()` issue a second `get()`. Enable Firebase Usage Alerts in the Console before onboarding real users.

---

## Feature guides

### User Guide — [`docs/guides/USER_GUIDE.md`](docs/guides/USER_GUIDE.md)

A full manual for every role — institution admin, senior/regular teacher, student, and parent — covering every feature area from account setup through report cards and attendance registers. Start here for "how do I use feature X" questions.

### Demo & Testing Guide — [`docs/guides/DEMO_TESTING_GUIDE.md`](docs/guides/DEMO_TESTING_GUIDE.md)

An end-to-end walkthrough script (institution profile wizard → attendance register → report card PDF generation) intended for demoing the platform to prospective clients or manually verifying the full flow after changes. Assumes a fresh Firestore instance and `VITE_DATA_MODE=live`.

Additional feature-specific specs and implementation plans live under `docs/` (attendance, report-card, brand-data, subject-form, disciplinary actions, walkthrough tour, and the ongoing Firestore overhaul under `docs/overhaul/`) — consult the relevant subfolder before modifying that feature.

---

## Deployment

The project is deployed via **Vercel**. The `sms-system/` subdirectory is the Vite project root.

### Vercel configuration

Set the following in Vercel's project settings (**Settings → Environment Variables**):

- All `VITE_FIREBASE_*` variables from `.env.local`
- `VITE_DATA_MODE=live`

Set the **Root Directory** to `sms-system` in Vercel's build settings.

**Build command:** `npm run build`
**Output directory:** `dist`

### SPA routing

The app uses client-side routing via react-router-dom. Vercel handles this automatically for Vite projects. If deploying elsewhere, configure the server to serve `index.html` for all routes (a `vercel.json` rewrite rule or an equivalent `_redirects` / `nginx.conf` entry).

### Production checklist

- [ ] All `VITE_FIREBASE_*` environment variables set in the deployment platform
- [ ] `VITE_DATA_MODE=live` set in the deployment platform
- [ ] `firestore.rules` and `firestore.indexes.json` deployed via `npm run firebase:deploy` (see [Security rules](#security-rules))
- [ ] At least one `super_admin` user document exists in Firestore
