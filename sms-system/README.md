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

The MVP delivers a functional live data layer on top of the original static prototype. All fourteen list pages are connected to Firestore via real-time `onSnapshot` listeners. Eleven of fifteen form components write to Firestore (create, update, delete). Five major features have been built end-to-end:

- **Schedule management** — timetable slot creation with teacher-conflict detection, delegated access for senior teachers
- **Report generation + PDF export** — aggregates grades and feedback into a signed PDF report card
- **Terms management** — full CRUD with status transitions (`upcoming / active / closed`)
- **Feedback comments** — per-student narrative feedback by teachers, readable by students and parents
- **Institution onboarding wizard** — two-step flow that atomically creates an institution and its admin account

**What is still stub / not yet implemented:**

- `SubjectForm`, `LessonForm`, `ExamForm`, `AssignmentForm`, `EventForm`, `AnnouncementForm` — write paths are `console.log` stubs
- `ParentForm` — create path is a stub; student list uses mock data
- `ClassForm` — `enrolledStudentIds[]` field absent (blocks Phase 2 BigCalendar)
- Attendance tracking — Firestore rules written, UI not yet built
- Messages / notifications — menu items removed pending route implementation
- Profile photo upload — implementation planned, not yet built
- Server-side pagination — all list pages currently load the full collection client-side

---

## Ideal projected completion state

The following represents the target completion state beyond the current MVP:

- **All forms fully wired** — `SubjectForm`, `LessonForm`, `ExamForm`, `AssignmentForm`, `EventForm`, `AnnouncementForm` write to Firestore; `ParentForm` create path linked to live student list
- **Attendance tracking** — attendance list page and `AttendanceForm` wired to the `attendance` collection (rules already deployed)
- **BigCalendar integration** — role dashboards use `react-big-calendar` to render timetable slots as calendar events; requires `enrolledStudentIds[]` population in `ClassForm`
- **Phase 2 schedule features** — occurrence expansion (day-by-day event generation from timetable slots), room conflict detection
- **Server-side pagination** — replace client-side `.slice()` with Firestore `startAfter` cursor pagination across all list pages
- **Profile photo upload** — Firebase Storage integration; `photo_update` activity log entry
- **Messages / notifications** — in-app messaging between roles
- **Orphan institution safeguard** — super admin dashboard widget surfacing institutions with zero `institution_admin` users
- **Automated Firestore rule tests** — emulator-based rule tests using `@firebase/rules-unit-testing`

---

## Tech stack

| Layer               | Technology                          | Version           |
| ------------------- | ----------------------------------- | ----------------- |
| UI framework        | React                               | ^18.3.1           |
| Language            | TypeScript                          | ~5.6.2            |
| Build tool          | Vite                                | ^6.0.1            |
| Styling             | Tailwind CSS                        | ^3.4.16           |
| Routing             | react-router-dom                    | ^7.0.2            |
| Forms               | react-hook-form + Zod               | ^7.53.2 / ^3.23.8 |
| Backend / Auth / DB | Firebase (Auth + Firestore)         | ^12.13.0          |
| PDF generation      | @react-pdf/renderer                 | ^4.5.1            |
| Charts              | Recharts                            | ^2.14.1           |
| Calendar            | react-big-calendar / react-calendar | ^1.16.3 / ^5.1.0  |
| Date utilities      | moment                              | ^2.30.1           |

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
npm run build     # type-check + production build (output: dist/)
npm run preview   # serve the production build locally
npm run lint      # run ESLint
npx tsc --noEmit  # type-check without emitting files
```

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

The authoritative Firestore security rules live in the **Firebase Console → Firestore Database → Rules** tab. The file `docs/firebase-rules.md` contains a reference copy of the deployed rules — it is for documentation purposes only and must only be updated to reflect rules that have already been deployed to the Console.

Key rule patterns:

- **Role + institution scoping** — every read and write is gated on the caller's `role` and `institutionId`, resolved by a `get()` on `users/{uid}` at rule evaluation time.
- **`score ≤ maxScore`** — enforced in the Firestore `results` rules, not just in the client-side Zod schema.
- **`canGenerateSchedule` flag** — senior teachers can only write to `timetable_slots` if their `users/{uid}` document has `canGenerateSchedule: true`.
- **Collection Group queries** — `activity_log` and `audit_log` are accessible via `collectionGroup()` queries; both are covered by Collection Group rules.

### Free-tier considerations (Spark plan)

| Resource            | Spark limit    | Notes                                                                                                                                    |
| ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Firestore reads     | 50,000 / day   | 14 `onSnapshot` listeners are active in `live` mode; each subscribes to an entire collection. Read pressure grows with institution size. |
| Firestore writes    | 20,000 / day   | Low-frequency writes; no concern at MVP scale.                                                                                           |
| Firestore deletes   | 20,000 / day   | Low-frequency; no concern at MVP scale.                                                                                                  |
| Authentication MAUs | 10,000 / month | Sufficient for MVP school deployments.                                                                                                   |
| Storage             | 5 GiB          | Not yet used (photo upload is planned).                                                                                                  |

**Watch out for:** the `me()` security rule helper issues a `get()` on `users/{uid}` for every rule evaluation. Operations that also call `isClassTeacherFor()` or `isSeniorTeacherFor()` issue a second `get()`. Enable Firebase Usage Alerts in the Console before onboarding real users.

---

## Feature guides

Step-by-step manual test checklists for key features. Run these against a live Firebase project after modifying the relevant code.

### Institution onboarding — [`guides/ONBOARD_INSTITUTION_VERIFICATION_GUIDE.md`](guides/ONBOARD_INSTITUTION_VERIFICATION_GUIDE.md)

Covers the two-step wizard at `/onboard-institution` that creates an institution document and its `institution_admin` account in a single guided session.

**Sections:** route access control, quick-action entry point, step indicator states, step 1 validation and Firestore write, step 2 locked fields and validation, Firebase Auth + Firestore write verification, done state success card and action buttons, orphan institution recovery, TypeScript sanity check.

**Prerequisites:** a running dev server, a live Firebase project, a `super_admin` account, and the Firebase Console open in a second tab.

---

### Schedule management — [`guides/SCHEDULE_VERIFICATION_GUIDE.md`](guides/SCHEDULE_VERIFICATION_GUIDE.md)

Covers the timetable slot management page at `/schedule`, including role-differentiated views, conflict detection, and the Manage Access panel for delegating schedule permissions.

**Sections:** menu item visibility across all roles, `institution_admin` full management (create/edit/delete slots), term selector behaviour, Manage Access panel (grant/revoke `canGenerateSchedule`), `senior_teacher` with and without access, read-only roles, two-step conflict detection (teacher overlap), real-time updates via `onSnapshot`, and Firebase security rules verification via the Rules Playground.

**Prerequisites:** `VITE_DATA_MODE=live`, at least 2 terms and 2 teachers seeded in Firestore, one `institution_admin` and one `senior_teacher` account available.

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
- [ ] Firestore security rules deployed to the Firebase Console (reference: `docs/firebase-rules.md`)
- [ ] At least one `super_admin` user document exists in Firestore
