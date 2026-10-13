# Issues & Gaps — School Management Dashboard

> **Generated:** 2026-05-27 · **Last updated:** 2026-10-02 (resolved #11, #21; added #44; updated #19, #32) · 2026-09-23 (added #36, #37 — found via a Playwright QA pass against live Firestore) · 2026-06-15 (resolved #5, #25; addressed #18; assessed #24; resolved #2, #9; partially resolved #12; resolved #4, #10, #34)
> **Branch:** `post-mvp-additions`
> **Scope:** Static analysis of `sms-system/src`; cross-referenced with `ROLE_PRIVILEGE_ANALYSIS.md`

---

## 🟡 Data Layer — Partially Connected

### 1. Forms do not persist data ⚠️ Partially Resolved

**Files:** All files under `src/components/forms/`, `src/components/FormModal.tsx`

All 11 form components (`TeacherForm`, `StudentForm`, `SubjectForm`, `ClassForm`, `LessonForm`, `ExamForm`, `AssignmentForm`, `ResultForm`, `EventForm`, `AnnouncementForm`, `ParentForm`) stub their `onSubmit` handler with `console.log(data)`. No form writes to Firestore. The **Delete** confirmation button inside the modal is also non-functional — it renders a `<form>` with no `action` and no `onSubmit`.

**Fix:** Add `onSubmit` handlers to each form that call the appropriate Firestore `setDoc`/`addDoc`/`deleteDoc` operations. Each admin form's handler should also include a `WriteBatch` audit log write (see Issue #11).

> **Updated 2026-05-31 (partial)** — Several forms now write to Firestore: `TeacherForm` and `StudentForm` (edit paths only — creation goes through the create-user flow); `ClassForm`, `ResultForm`, `FeedbackCommentForm`, and `TermForm` (both create and edit). The **Delete** button in the modal remains non-functional. The following forms still have `console.log` stubs: `SubjectForm`, `LessonForm`, `ExamForm`, `AssignmentForm`, `EventForm`, `AnnouncementForm`, `ParentForm`.
>
> **Updated 2026-06-01** — Additional forms wired to Firestore: `TimetableSlotForm` (create path writes to `timetable_slots`; update path falls back gracefully when no string ID is present); `DepartmentForm` (both create and edit paths wired via `addDoc`/`updateDoc`); `ParentForm` update path writes to both `parents/{uid}` and `student_parents/{uid}_{studentId}` junction documents (see Issue #31 for limitations). The **Delete** button in `FormModal` is now functional — it calls real `deleteDoc` via a `collectionNameFor` helper and shows loading/error states. The following forms still have complete `console.log` stubs for both create and update: `LessonForm`, `ExamForm`, `AssignmentForm`, `EventForm`, `AnnouncementForm`.
>
> **Updated 2026-06-11** — `SubjectForm` wired to Firestore as part of the atomic SubjectForm deployment. Remaining stubs (both create and update): `LessonForm`, `ExamForm`, `AssignmentForm`, `EventForm`, `AnnouncementForm`.

---

## 🟡 Hardcoded UI Content

### 2. Single detail pages (Teacher, Student) contain fully hardcoded content ✅ Resolved

**Files:** `src/scenes/(dashboard)/list/students/[id]/index.tsx`, `src/scenes/(dashboard)/list/teachers/[id]/index.tsx`

Student name ("Cameron Moran"), grade, attendance percentage, class, lesson count, contact details, and bio are all static strings in JSX. The route receives an `id` param but it is never read.

**Fix:** Read the `:id` param via `useParams`, query the matching Firestore document, and render real data.

> **Resolved 2026-06-15** — Both pages now read fully from Firestore. The student page uses `useParams` + `onSnapshot` on `users/{id}`, and resolves houses, active term, activities, responsibilities, report card comments, and parent links; an inline edit panel handles profile updates. The teacher page uses `getDoc` on `users/{id}` and `teachers/{id}`, and performs joined reads to resolve the department name and assigned class name. Neither page retains any hardcoded static strings.

---

### 3. Super Admin KPI cards display hardcoded numbers
**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

The four KPI cards ("36" institutions, "1,280" total users, "31" active, "4" super admins) are static strings defined in the `kpiCards` array at the top of the file.

**Fix:** Derive these values from live Firestore aggregate queries or Firestore count() calls once the data layer is ready.

---

### 4. Calendar events are dated to August 2024 ✅ Resolved

**File:** `src/lib/data.ts` (line 917 onwards)

All entries in `calendarEvents` use `new Date(2024, 7, ...)` (month index 7 = August 2024). They will never appear on the current-month view of the Big Calendar component. A comment in the file acknowledges this:

```ts
// YOU SHOULD CHANGE THE DATES OF THE EVENTS TO THE CURRENT DATE TO SEE THE EVENTS ON THE CALENDAR
```

**Fix:** Replace hardcoded dates with dates relative to `new Date()`, or — better — source calendar events from Firestore.

> **Resolved 2026-06-15** — `BigCalender.tsx` was fully rewritten. In live mode it queries the `timetable_slots` Firestore collection with role-aware filters: teacher dashboards and the teacher detail page query by `teacherId == uid` (or `teacherIdOverride`), student dashboards query by `classId == authClassId`, and parent dashboards fan-out through `student_parents` → `users/{studentId}` to resolve each child's `classId`, with a child-picker UI when a parent has more than one child. Queries are scoped to the active term via `useInstitutionAcademicCalendar`. In mock mode, a `shiftEventsToCurrentWeek()` helper offsets the Aug 2024 anchor events to the current Mon–Fri work week so they are always visible. `TimetableSlotDocument` in `firebase.ts` was extended with `classId` and `className` fields; `TimetableSlotForm` gained a Class dropdown that writes both fields to Firestore on create and update. See `BIGCALENDAR_AND_SKELETON_SPEC.md` for full implementation details.

---

## 🔴 Collections and Pages Not Yet Built

---

### 5. Attendance page not built ✅ Resolved

**File:** Route `/list/attendance` — no page component registered

The attendance list page and the mark-attendance form do not exist. The route is unregistered in `App.tsx`. The Firestore security rules for the `attendance` collection are fully implemented and ready.

The `attendance` collection requires: `institutionId`, `studentId`, `classId`, `departmentId`, `date`, `status` (`present` / `absent` / `late`).

**Depends on:** D-2 (student records in Firestore), D-4 (class records with `termId`).

> **Resolved 2026-06-13** — Four attendance pages are built and all routes are registered in `App.tsx`: `/attendance/general` (institution_admin, senior_teacher, super_admin), `/attendance/subject` (institution_admin, regular_teacher, super_admin), `/attendance/my` (student), and `/attendance/child` (parent). Each route is guarded by a role check that redirects unauthorised roles to `/`.

---

### 6. Messages page not built

**File:** Route `/list/messages` — no page component registered

The messages list page and any send/receive UI do not exist. The route is unregistered in `App.tsx`.

**Blocks:** All messaging work.

**Depends on:** Resolution of **Open Question #1** (in-app vs. third-party) — see [Issue #33](#33-messaging-architecture-undecided).

---

### 7. `teacher_classes` has no management UI

**Spec reference:** §1.9

`teacher_subjects` is superseded by design — teacher-to-subject assignments are now stored as `teacherIds`/`teacherNames` arrays directly on the subject document (per [`SUBJECT_FORM_SPEC.md`](./SUBJECT_FORM_SPEC.md) §4 and §11). The `teacher_subjects` Firestore rules were removed as part of the atomic SubjectForm deployment; no data was ever written to `teacher_subjects`. See [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md) Junction Collections section for architectural rationale.

`teacher_classes` still has no management UI. Teacher assignment to classes currently has no data-backed flow. The `supervisor` field on class documents is a denormalized free-text display name (see Issue #26). A dedicated UI for managing `teacher_classes` junction documents remains unbuilt.

---

## 🟡 Missing Profile Fields in Forms

---

### 8. Teacher forms missing `employeeId` and `qualifications` fields

**File:** `src/components/forms/TeacherForm.tsx`

The role spec (§1.5) and the `teachers` Firestore collection schema both include `employeeId` and `qualifications` as teacher profile fields. Neither field is present in the current form or written to Firestore.

**Depends on:** D-1 (teacher forms wired to Firestore).

---

### 9. Student forms missing `dateOfBirth` and `enrolmentId` fields ✅ Resolved

**File:** `src/components/forms/StudentForm.tsx`

The role spec (§1.6) and the `students` Firestore collection schema both include `dateOfBirth` and `enrolmentId` as student profile fields. Neither field is present in the current form or written to Firestore.

**Depends on:** D-2 (student forms wired to Firestore).

> **Resolved 2026-06-15** — Both fields are now in the `StudentForm` schema and written to Firestore via `writeBatch` on submit. Note: the field was renamed from `enrolmentId` to `institutionStudentId` to better reflect its meaning.

---

## 🟡 Missing Loading and Error States

---

### 10. List pages have no loading indicators or error boundaries ⚠️ Partially Resolved

**Files:** All pages under `src/scenes/(dashboard)/list/`

When Firestore queries replace the mock data arrays, list pages will show a blank table during the initial fetch and have no recovery path if a query fails. There are no loading skeletons, spinners, or `<ErrorBoundary>` wrappers on any of the 11 list pages.

The super_admin homepage widgets (InstitutionsTable, RecentSignups, AlertsFeed) handle loading and error states correctly and are the pattern to follow.

**Fix:** Add per-page `isLoading` and `error` state variables; render a loading skeleton while fetching and an inline error message with a retry option on failure.

> **Partially resolved 2026-06-15** — Skeleton shimmer loading states added to all 15 list pages (`students`, `teachers`, `parents`, `classes`, `subjects`, `departments`, `lessons`, `exams`, `assignments`, `events`, `announcements`, `results`, `feedback`, `terms`, `houses`). `Table.tsx` was extended with `loading?: boolean` and `rowCount?: number` props; when `loading` is true the tbody renders `animate-pulse` shimmer rows that inherit each column's responsive visibility class. Pages initialise `loading = !USE_MOCK` and clear it in the first `onSnapshot` callback. Error boundaries and inline error states remain unimplemented. See `BIGCALENDAR_AND_SKELETON_SPEC.md` Part 2 for implementation details.

---

## 🟡 Profile and Settings Gaps

---

### 11. WriteBatch audit log writes not wired to admin form actions ✅ Resolved

> **Resolved 2026-10-02** — The audit log is now written by every admin action that changes another account, and by the teacher actions that change a class's or a student's records. Entries go through `src/lib/auditLog.ts` (`buildAuditEntry` / `logAuditEvent`), always carry the server-verified `recordedAt`, and use the batch of the primary write wherever one exists. See [`AUDIT_LOG_ACCOUNT_ACTIONS_SPEC.md`](./miscellaneous-specs/AUDIT_LOG_ACCOUNT_ACTIONS_SPEC.md) and #44 for the limits.
>
> | Event | Written by | How |
> | --- | --- | --- |
> | `profile_edit` | Student, Teacher and Parent edit forms | in the form's batch; field names only; none when nothing changed |
> | `account_created` | `AdminCreateUserForm` | best-effort, after the account exists |
> | `password_reset` | Manage Admins reset button | best-effort, after the email is sent |
> | `permission_change` | Schedule → Delegate Schedule Access | in one batch with the toggle |
> | `account_suspended` / `account_reactivated`, `session_reset`, `photo_change`, `registration_status_change` | already live | now through the shared helper |
> | `attendance_edit` | General and Subject attendance | in the register's batch (a General "Save All" logs one summary, best-effort) |
> | `results_edit` | Gradebook save, gradebook column delete, result form | in the batch, or right after it when a save is within one operation of Firestore's 500 cap |
> | `comment_edit` | Feedback comment form; conduct/comments saved from the gradebook | same |
> | `lesson_note_edit` | Lesson note form | in the note's batch |
>
> Teachers may now write (only those four teacher types) and read (only their own entries) `audit_log`; `firestore.rules` and three new indexes must be deployed before the app. The activity feed ("Actions I performed" on the profile) reads the log by `performedBy`.

**Files (original):** `src/components/forms/TeacherForm.tsx`, `src/components/forms/StudentForm.tsx`, and all other admin-action forms

The audit log infrastructure is fully built: the `institutions/{id}/audit_log` subcollection has Firestore rules, the `AuditLogPage` renders entries, and the profile page already writes audit events via `WriteBatch`. However, admin actions taken through CRUD forms (creating a teacher, deactivating a student, etc.) do not yet write a corresponding audit log entry.

**Fix:** Each `onSubmit` handler in admin forms should use a `WriteBatch` to write the entity document and an `audit_log` entry atomically. See [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md) for the `audit_log` subcollection schema.

**Depends on:** D-1 (forms must be wired to Firestore before audit writes can be added).

---

### 12. Settings page is a stub ⚠️ Partially Resolved

**File:** `src/scenes/(dashboard)/settings/index.tsx`

The settings page renders placeholder cards and is intentionally hidden from the sidebar for all roles. Five of the planned cards have been recommended for removal before the page is re-exposed.

**Fix:** Implement the settings page per [`SETTINGS_PAGE_ANALYSIS.md`](./SETTINGS_PAGE_ANALYSIS.md), then re-add the sidebar link for all roles.

> **Partially resolved 2026-06-15** — The settings page is now fully implemented: it reads `gradingSystem` from the institution document on mount and writes it back on change, with role-aware sections and proper styling. However, `/settings` is still not linked in `Menu.tsx` for any role (only `/brand-settings` appears, for super_admin). The sidebar re-exposure remains the outstanding fix.

---

## 🟡 Infrastructure Gaps

---

### 13. Institution document counter fields are never written

**File:** `src/lib/firebase.ts` (`InstitutionDocument` type), `src/lib/AuthContext.tsx`

The `InstitutionDocument` TypeScript type defines `userCount`, `studentCount`, `teacherCount`, and `lastActiveAt` as optional fields on every institution document. These fields are read by the super_admin KPI strip in live mode but are never written anywhere in the application. Their values will be `undefined` for all institutions.

**Fix:** Update `lastActiveAt` on sign-in; increment `userCount`, `studentCount`, and `teacherCount` counters from within the relevant CRUD form submit handlers when live Firestore writes are added (D-1 through D-3).

---

### 14. GrowthChart shows a placeholder in all data modes

**File:** `src/components/superadmin/GrowthChart.tsx`

The growth chart on the super_admin homepage renders a placeholder message in every data mode including live. Computing a growth trend from raw institution documents on every page load would be read-expensive. The intended approach is a pre-computed stats document that is updated by a server-side process.

**Fix:** Design and introduce a stats document (e.g., `institutions/_platform/stats/{month}`) updated by a Cloud Function or scheduled job; query it in GrowthChart when `DATA_MODE === 'live'`.

---

### 15. Server-side pagination not implemented

**Files:** All pages under `src/scenes/(dashboard)/list/`

All list pages use client-side `.slice()` pagination against the full mock data array. Once Firestore queries replace mock data, loading the full collection on every page load will be slow and expensive.

**Fix:** Replace the slice with Firestore cursor-based queries using `startAfter` / `limit` once live data is wired. `PAGE_SIZE` is already exported from `src/lib/utils.ts` as the single source of truth for the page size value.

**Depends on:** D-1 through D-7 (Firestore queries must exist before server-side cursors can be introduced).

---

### 16. No separate dev Firebase project

**Risk:** The application currently has a single Firebase project. When `DATA_MODE === 'live'`, reads and writes target the production Firestore database. Any developer testing live mode locally is reading from and writing to production data.

**Fix:** Create a `sms-dev` Firebase project with its own Firestore instance and Authentication tenant. Add a `.env.development` file with the dev project credentials and a `.env.production` file with the production credentials. Vite's `import.meta.env` system will select the correct file per build target. Recommended before live mode is used for any volume of testing.

---

### 17. Super Admin KPI sub-text not implemented in live mode

**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

The KPI cards on the super_admin homepage display a `sub` text (e.g., "+3 this month") in mock mode. In live mode these values are omitted — computing them requires a timestamp-range count query to find records created within the current month, which costs additional reads on every page load and scales poorly on the Spark (free) tier.

**Fix:** Introduce a pre-computed stats document (e.g., `institutions/_platform/stats`) updated by a Cloud Function or scheduled job on each institution signup or user creation. Read this document with a single `getDoc` in live mode rather than aggregating timestamps across the full collection.

**Depends on:** Design and implementation of a stats document write mechanism (Cloud Function or Firestore trigger).

---

### 18. `InstitutionsTable` fetches all institution documents in live mode ✅ Resolved

**File:** `src/components/superadmin/InstitutionsTable.tsx`

In live mode, `InstitutionsTable` calls `getDocs(collection(db, 'institutions'))` which returns every institution document — one Firestore read per document. Read cost scales linearly with institution count (N reads per page load). See the [Free-Tier Cost Analysis](FEATURE_FLAG_DATA_MODE.md#free-tier-cost-analysis) in `FEATURE_FLAG_DATA_MODE.md` for projected budget impact at scale.

**Fix:** Replace `getDocs` with cursor-based pagination using `startAfter` + `limit(25)`. Implement forward/back navigation in `InstitutionsTable` with Firestore document cursors. Client-side search filtering will need to move server-side or be scoped to the paginated result set.

**Note:** Low priority while the institution count is in the low tens to low hundreds. Should be addressed before the institution count exceeds ~200.

> **Resolved 2026-06-15** — `InstitutionsTable` now fetches in pages of 25 using `limit(PAGE_SIZE)` + `startAfter` cursor-based pagination. A cursor stack (`prevCursors`) enables backward navigation. Prev/Next buttons appear in the footer in live mode (replacing the non-functional "View all" button); the footer shows the current page number. The status filter (All / Active / Suspended) remains client-side and resets to page 1 on change. Mock mode is unchanged — all mock data loads at once with the existing "Showing X of Y" footer display.

---

### 19. No dedicated `platform_alerts` collection — `AlertsFeed` derives from `audit_log`

**File:** `src/components/superadmin/AlertsFeed.tsx`

In live mode, `AlertsFeed` queries the `audit_log` collectionGroup and maps the 10 newest **account and security** audit entries (`SECURITY_EVENT_TYPES` in `src/lib/auditEvents.ts`; routine teacher and profile-edit entries are filtered out so they cannot bury real alerts, 2026-10-02) to alerts. Every one maps to `"info"` severity. The high/medium severity alert behaviours visible in mock mode (`login_anomaly`, `brute_force_attempt`, etc.) have no corresponding real event types and cannot be triggered by real user activity — the mock alert feed is aspirational.

**Fix:** Define a dedicated `platform_alerts` collection with its own Firestore schema and security rules. Write targeted alert documents from Cloud Functions when specific conditions are detected (e.g., repeated sign-in failures, suspicious access patterns). Update `AlertsFeed` to query this collection directly in live mode.

**Depends on:** Decision on which alert conditions to monitor and the write-trigger mechanism (Cloud Function or scheduled job).

---

### 20. Audit log filter supports only a single institution at a time

**File:** `src/scenes/(dashboard)/admin/audit-log/index.tsx`

The institution filter dropdown on `/admin/audit-log` supports selecting one institution or "All institutions". There is no way to compare audit logs across a subset of institutions without switching between them individually.

**Fix:** Add a multi-select UI (checkboxes or a multi-select dropdown) and translate the selection to a Firestore `in` filter (supports up to 10 values) or parallel queries merged client-side for larger sets.

---

### 21. No cursor-based pagination on `/admin/audit-log` ✅ Resolved

> **Resolved 2026-10-02** — The Audit Log page pages by Firestore cursor (Previous / Next, 20 per page, each page cached for 5 minutes so paging back costs no reads) through `hooks/useCursorPages.ts`, with a **Refresh** button, a category filter (All / Account & security / Academic) and, for a super_admin, an institution tag on every row in the all-institutions view. A failed query shows a Retry state instead of "No audit entries found". The profile's "Audit and security events" and Activity sections page the same way (10 per page) and no longer stretch the page. Each page costs one extra document read (the one that tells whether Next exists). The page numbers are relative ("Page N"): Firestore cannot count cheaply, so there is no total.

**File:** `src/scenes/(dashboard)/admin/audit-log/index.tsx`

The audit log page applies `limit(50)` to the Collection Group query. Events beyond the first 50 are not reachable — there is no "load more" control or page navigation. As audit log volume grows, the most useful historical entries become inaccessible.

**Fix:** Replace `limit(50)` with cursor-based pagination using `startAfter` with a Firestore document cursor. Add "Previous" / "Next" controls or an infinite-scroll "Load more" trigger.

---

### 22. No date range filter on the audit log page

**File:** `src/scenes/(dashboard)/admin/audit-log/index.tsx`

All queries on `/admin/audit-log` return the most recent entries regardless of date. There is no way to scope the query to a specific time window (e.g., "last 7 days", "this month", or a custom date range).

**Fix:** Add a date range picker that translates to `where('timestamp', '>=', startISO)` and `where('timestamp', '<=', endISO)` query constraints. Requires a composite index on `timestamp` for the affected collection and collection group queries.

---

### 23. Audit log entries are written client-side — susceptible to forgery

**Files:** `src/lib/AuthContext.tsx`, all admin form `onSubmit` handlers

Client-side `addDoc` calls write `activity_log` and `audit_log` entries directly from the browser. If Firestore rules are ever misconfigured, a malicious authenticated user could write fabricated audit entries, undermining the integrity of the audit trail.

**Fix:** Replace client-side audit writes with a callable Cloud Function backed by the Firebase Admin SDK. Admin SDK writes bypass client security rules, cannot be forged, and allow server-side field injection (e.g., verified `performedBy` UID, server timestamp). This is the correct long-term architecture for a tamper-proof audit log.

**Partly mitigated (see #39):** without Cloud Functions the rules now (a) require `performedBy` on an `audit_log` entry to be the signed-in writer, (b) restrict `activity_log` to the event types and `institutionId` the writer is entitled to, with an exact key set, and (c) require a server-verified `recordedAt` (`== request.time`) on every new entry. The legacy `timestamp` is still a client-supplied ISO string — kept for ordering and display, and shown as "(unverified)" on the profile page for entries that predate `recordedAt` — and `performedByName` is a display name the rules cannot verify. A Cloud Function remains the only fully tamper-proof design.

---

### 24. Firestore security rules call `get()` on every evaluation — read cost at scale

**File:** `sms-system/docs/firebase-rules.md`, Firebase Console → Firestore Security Rules

Helper functions `me()`, `myRole()`, and `myInstitutionId()` each call `get(...)` to read the requesting user's `users/{uid}` document. Each `get()` costs one Firestore read per rule evaluation. For low-traffic apps this is acceptable; at scale, these extra reads accumulate against the daily quota.

**Fix:** Store `role` and `institutionId` as Firebase Auth custom claims via `setCustomUserClaims` in a Cloud Function triggered on user creation and role changes. Replace `get(...)` calls in security rules with `request.auth.token.role` and `request.auth.token.institutionId` — no Firestore reads required during rule evaluation.

**Feasibility assessment (2026-06-15):** Multi-service effort with a residual gap. Deferred until Cloud Functions are already part of the stack for another reason (e.g., Issue #23 audit writes or Issue #19 alert detection).

The fix requires four coordinated pieces:

1. **Cloud Functions** — two triggers using the Firebase Admin SDK: `functions.auth.user().onCreate` (sets claims when a new account is created) and `functions.firestore.document('users/{uid}').onWrite` (refreshes claims when `role` or `institutionId` changes). This is a new service and deployment pipeline that does not currently exist in the project.

2. **Client-side token refresh** — after claims are updated server-side, the signed-in user must call `user.getIdToken(true)` (force-refresh) before the new claims are visible to Firestore security rule evaluations. This flow needs to be wired into wherever role changes are applied.

3. **Full security rules rewrite** — every call to `me()`, `myRole()`, and `myInstitutionId()` in the deployed rules is replaced with `request.auth.token.role` and `request.auth.token.institutionId`. The change is mechanical line-by-line but touches all collection rules pervasively.

4. **Residual `get()` calls that cannot be replaced** — `isClassTeacherFor(classId)` calls `get()` on `classes/{classId}` and `isSeniorTeacherFor(departmentId)` calls `get()` on `users/{uid}` (it no longer falls back to the legacy `teachers/{uid}` mirror — see #39). These are structural checks (is this teacher assigned to this class/department?) that cannot be moved to auth token claims without storing dynamic assignment data on the token — which goes stale on reassignment. These two helpers will retain their `get()` cost even after a full custom-claims migration.

The payoff is real, but the Cloud Functions setup is the heavy lift and the rules are not fully claim-based anyway due to the residual reads above.

---

### 25. `regular_teacher` has no read access to `generalAttendance` — missing route guard ✅ Resolved

**File:** `sms-system/docs/firebase-rules.md` (Firestore rule); route and page files for the general attendance register

The `generalAttendance` read rule permits only `isAdminOrAbove()`, `isSeniorTeacher()`, students (scoped to their own class), and parents. `regular_teacher` satisfies none of these conditions and is therefore denied read access at the Firestore level:

```javascript
// regular_teacher falls through all branches — permission-denied
isAdminOrAbove()   // false
isSeniorTeacher()  // false
myRole() == 'student'  // false
isParent()         // false
```

The write rule is equally restrictive — only `institution_admin` and `senior_teacher` (scoped to their `assignedClassId`) can submit a register. **This is correct by design**: general attendance is a class-teacher responsibility; regular teachers handle subject attendance only.

The gap is at the **routing layer**, not the rules layer. If a `regular_teacher` navigates to the general attendance register page and that page establishes an `onSnapshot` listener on `generalAttendance`, Firestore will return `permission-denied` on every snapshot event for the duration of the session. The error is persistent (not a transient startup artifact) and will appear in the console repeatedly. The Firestore rules are still enforcing the correct boundary — no data is leaked — but the UX is broken and the console noise masks real errors.

**Fix:** Add a role guard to the general attendance register route (or at the top of the page component) that redirects `regular_teacher` users before any Firestore listener is established. Pattern already used elsewhere in the app for role-scoped pages. No rule changes required.

> **Resolved 2026-06-13** — The `/attendance/general` route in `App.tsx` explicitly permits only `super_admin`, `institution_admin`, and `senior_teacher`; any other role (including `regular_teacher`) receives `<Navigate to="/" replace />`. The page component never mounts and no Firestore listener is established.

---

### 26. No CSV export for audit log entries

**File:** `src/scenes/(dashboard)/admin/audit-log/index.tsx`

The audit log page has no export mechanism. Administrators cannot extract audit data for compliance reporting, external analysis, or archiving without manual copy-paste.

**Fix:** Add an "Export CSV" button that serializes the current `auditEntries` state to a CSV string and triggers a browser download via a `Blob` URL. For a larger export that exceeds the `limit(50)` page size, fetch all matching documents first before serializing.

---

### 27. `supervisor` field in `ClassForm` should be a live teacher dropdown

**File:** `src/components/forms/ClassForm.tsx`

The `supervisor` field is currently a free-text input. The `teacher_classes` junction collection stores the authoritative teacher-class link; `supervisor` on the class document is a denormalized display name only. In live mode this field should become a searchable dropdown populated from teachers in the institution filtered by `institutionId`.

**Fix:** Replace the `supervisor` text input with a `<select>` populated from a Firestore query on `teachers` filtered by `institutionId` when `DATA_MODE === 'live'`.

**Depends on:** D-1 (teacher data in Firestore).

---

### 28. `FormModal` has no accessibility attributes

**File:** `src/components/FormModal.tsx`

The modal renders without `role="dialog"`, `aria-modal="true"`, a focus trap, or an Escape key close handler. Screen readers will not announce it as a dialog, and keyboard users cannot exit without a mouse click.

**Fix:** Add `role="dialog"` and `aria-modal="true"` to the modal container; implement a focus trap cycling between the first and last focusable elements; add a `useEffect` that calls the close handler when the Escape key is pressed.

Deferred for post-MVP polish.

---

### 29. `/create-user` does not write `students` or `parents` collection documents ⚠️ Partially Resolved

**File:** `src/components/forms/AdminCreateUserForm.tsx`

When creating a user with `role === 'student'` or `role === 'parent'`, the form only writes to `users/{uid}` (always) and `teachers/{uid}` (for teacher roles). No corresponding document is written to the `students` or `parents` collections. Whether those collections require a per-user document for role-specific fields (e.g., grade and class for students, linked children for parents) is unresolved pending data model decisions.

**Fix:** Determine the required fields for `students` and `parents` collection documents, then extend the batch write in `AdminCreateUserForm.tsx` to include them.

**Depends on:** D-2 (student data model), D-3 (parent data model).

> **Updated 2026-06-01 (partial)** — The `student` branch is resolved: `AdminCreateUserForm` now writes a `students/{uid}` document (fields: `uid`, `institutionId`, `createdAt`, `createdBy`) within the same `writeBatch` as `users/{uid}`. The `parent` branch remains outstanding — no `parents/{uid}` document is written when `role === 'parent'`. This should be addressed when the parent data model is finalised (D-3).

---

### 30. `Announcement` TypeScript type missing `description` field ⏸ Not completed

**Files:** `src/scenes/(dashboard)/list/announcements/index.tsx`, `src/components/forms/AnnouncementForm.tsx`

`AnnouncementForm` includes a `description` textarea (optional, max 2000 chars). The local `Announcement` type in `announcements/index.tsx` declares only `{ id, title, class, date }` — `description` is absent. When the data layer is connected, `description` will also need to be added to any Firestore type definition (e.g., `AnnouncementDocument` in `firebase.ts` if defined).

**Status: Not completed** — `description` has not been added to the `Announcement` type or any Firestore type definition.

**Fix:** Add `description?: string` to the `Announcement` type in `announcements/index.tsx`. When a Firestore `AnnouncementDocument` type is defined in `firebase.ts`, include `description` there as well.

---

### 31. ClassForm field coverage after form system refactor ⚠️ Partially Resolved

**Files:** `src/components/forms/ClassForm.tsx`, `src/scenes/(dashboard)/list/classes/index.tsx`

`ClassForm.tsx` was built as part of the form system refactor and writes to Firestore. The intended class document schema requires `termId`, `room`, `schedule`, and `enrolledStudentIds[]` — fields that were absent from the original mock data. It is unclear whether `ClassForm` now covers all required fields or whether these schema gaps were addressed.

> **Updated 2026-06-01** — `ClassForm` has been read. The form writes the following fields to Firestore: `name`, `capacity`, `grade`, `supervisor` (free-text, see Issue #26), `termId`, and `institutionId`. The `termId` field is populated from a dropdown backed by `termsData`. The `room`, `schedule`, and `enrolledStudentIds[]` fields from the spec schema are absent from the form — no inputs exist for them and they are not written to Firestore. `room` and `schedule` are minor profile fields; `enrolledStudentIds[]` is the higher-priority gap, as it is required for student/parent-scoped timetable queries in Issue #34 (Phase 2 BigCalendar integration). Update `PROJECT_SPEC_AND_ANALYSIS.md §1.9` and `§3.2` to reflect the current partial coverage when the class data model is finalised.

---

### 32. Parent–student linking UI completeness ⚠️ Partially Resolved

**Files:** `src/components/forms/ParentForm.tsx`

`ParentForm` includes a "Linked Students" checkbox list that writes junction documents to `student_parents` on parent create/update. Build backlog item D-6 ("Build parent–student linking UI") was scoped as "creates/deletes `student_parents` junction documents." It is unclear whether the checkbox list in `ParentForm` fully satisfies D-6, or whether a standalone link-management page (add/remove student links independently of editing the parent record) is still needed.

> **Updated 2026-06-01** — `ParentForm` has been read. The update path is functional: on submit it writes to `parents/{uid}` (phone, address) and creates `student_parents/{uid}_{studentId}` junction documents for every checked student via `writeBatch`. Existing links are loaded on mount via `getDocs`. Three known limitations remain:
>
> 1. **Create path is a stub** — the form guards on `uid` from `data?.uid`; without a pre-existing UID (i.e., on the create path) the handler logs a warning and returns without writing. Parent creation goes through the `/create-user` flow; the form's create path is effectively unused.
> 2. **Student list uses mock data** — the checkbox list is populated from `studentsData` (static mock array), not a live Firestore query. In live mode the list will not reflect actual enrolled students.
> 3. **Link removal not implemented** — unchecking a student does not delete the existing `student_parents` junction document. Only additive writes are performed.
>
> D-6 is partially satisfied for the update path. A standalone link-management page (add/remove independently of editing the parent record) is not yet required for MVP, but the student list population and link-removal gaps should be addressed when the parent data model is fully connected to live Firestore.
>
> **Updated 2026-10-02** — limitation 3 (**link removal**) is fixed: unticking a student now deletes the `student_parents` junction document in the same batch as the save (and the save button stays disabled until the existing links have loaded, so a quick save can't unlink everyone). The same save also writes a `profile_edit` audit entry naming `linked students` when links were added or removed (see #44). The student list now comes from a live Firestore query, so limitation 2 no longer applies either. The delete is denied for a legacy link that carries no `institutionId` (the rule requires it to match), which would fail that parent's whole save; none are known, but check before relying on it.

---

## 🔴 Firestore Read Errors — Rule/Query Mismatches (found via QA)

Both items below were found by a Playwright pass driving the app against live
Firestore (`docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md` §11's
manual QA plan), not by the caching migration itself — neither call site was
touched by that work. Same class of bug as the already-resolved Issue #25:
a query shape the deployed rule doesn't actually permit for the caller,
surfacing as a persistent `Missing or insufficient permissions` console error
rather than a clean empty result.

---

### 36. `fetchPhoto` throws `permission-denied` for any student/teacher with no photo uploaded

**Files:** `src/scenes/(dashboard)/list/students/index.tsx`, `src/scenes/(dashboard)/list/teachers/index.tsx`

Both list pages' bounded per-row `fetchPhoto(uid)` helper does
`await getDoc(doc(db, "users", uid, "photo", "current"))` with no
`try`/`catch`. The `users/{uid}/photo/{photoId}` read rule
(`firestore.rules` ~line 249) is `allow read: if isOwner(uid) ||
(isAdminOrAbove() && sameInstitution(resource.data.institutionId)) || ...` —
every branch dereferences `resource.data`. When the photo subdocument
doesn't exist yet (a student/teacher who has never had a photo uploaded),
`resource` is `null` and the rule evaluation itself throws, so Firestore
returns `permission-denied` instead of a clean "document doesn't exist"
result. `getDoc()`'s normal `snap.exists() === false` path is never reached
in that case — the promise rejects instead, and with no `catch`, it
surfaces as an unhandled rejection (visible as a `pageerror` in the
console) on every row without a photo. Confirmed reproducible on every
student/teacher row in the seed/demo institution used for QA (none of them
have photos uploaded).

**Fix:** Wrap the `getDoc` call in a `try`/`catch` (or `.catch()`) in both
files' `fetchPhoto`, treating a caught error the same as
`snap.exists() === false` (no photo). This masks the symptom without
touching the rule. A more complete fix would change the rule to short-circuit
on a non-existent resource before dereferencing `resource.data`, but that's
a rules change outside this page-level fix's blast radius.

---

### 37. `ExamForm`'s teacher→department lookup is unreadable by `regular_teacher`

**File:** `src/components/forms/ExamForm.tsx`

The "teacherId → departmentId" map (used so a senior_teacher can edit any
exam in their department at write time) queries:

```ts
query(
  collection(db, "users"),
  where("institutionId", "==", institutionId),
  where("role", "in", ["regular_teacher", "senior_teacher"]),
)
```

The `users` read rule's teacher clause is `isTeacher() &&
sameInstitution(resource.data.institutionId) && resource.data.role ==
'student'` — it only ever permits a teacher-role reader to list `student`
documents. A query for `role in ['regular_teacher', 'senior_teacher']` has
no matching permitted shape for a `regular_teacher` caller, and per
"security rules are not filters" (queries are all-or-nothing for `list`
requests), the entire query is rejected — confirmed via a `regular_teacher`
test account opening the Add Exam form and hitting
`Missing or insufficient permissions` on this call specifically. The
rejected promise has no `.catch()`, so it's silent to the user (the
department-fallback logic at write time still works via
`data?.departmentId` on update), but it's a real, reproducible permission
error, not code the app currently depends on succeeding for that role.

**Fix:** Either scope the query so a `regular_teacher` caller never needs
it (they're never the "senior_teacher editing another department's exam"
case this lookup exists for — skip the fetch entirely when
`role === 'regular_teacher'`), or move this lookup to a context where only
`institution_admin`/`senior_teacher` ever mount it.

**Update (see #38):** the department-stamping consequence of this is fixed.
`ExamForm` and `AssignmentForm` now read the signed-in teacher's own `users`
document (always readable by its owner) for their `departmentId`, instead of
depending on this rejected query. The permission error itself on the all-teachers
query is still open.

---

### 38. Teachers could exist with no department, hiding their documents from senior teachers

**Files:** `src/components/forms/AdminCreateUserForm.tsx`, `TeacherForm.tsx`,
`AssignmentForm.tsx`, `ExamForm.tsx`, `LessonNoteForm.tsx`, `firestore.rules`

A senior_teacher can only see or edit a regular_teacher's assignments and lesson
notes when the document's `departmentId` matches the senior's own
(`seniorTeacherMayActOnAssignment`, `seniorTeacherMayActOnLessonNoteData`). The
`departmentId` is stamped onto the document from the author's `users/{uid}` at
write time. Three things let it end up missing:

1. The department select was optional in both account forms (and hidden when
   the institution had no departments), so teachers were created with none.
2. The forms silently omitted `departmentId` when the author had none — nothing
   told the teacher or an admin. Lesson notes freeze the field after creation, so
   a missing value there cannot be repaired from the UI.
3. `AssignmentForm`/`ExamForm` looked the author's department up through a users
   query a teacher is not allowed to run (#37), so even a teacher *with* a
   department never stamped their own assignments and exams.

**Fix:**
- Department is **required** in `AdminCreateUserForm` and `TeacherForm` for
  `regular_teacher`/`senior_teacher`, whenever the institution has at least one
  department (`src/lib/departmentRequirement.ts`). Institutions with no
  departments are unaffected.
- A "No department" badge on the Teachers list and detail page, a banner on the
  regular and senior teacher dashboards, and an inline notice in the lesson-note,
  assignment and exam forms (`NoDepartmentNotice`, driven by `useMyDepartment`).
  The form notices are warn-only — saving is not blocked.
- `AssignmentForm`/`ExamForm` stamp the author's own department from their own
  `users` doc.
- `firestore.rules`: a user can no longer change their own `departmentId` (only
  an admin can, via the edit-teacher form).

**Not done (deliberately):** existing teachers and the documents they already
wrote are not backfilled. Admins assign departments by hand from the Teachers
list; assignments and exams pick the department up the next time they are saved.
Results, feedback comments and imported gradebook data already store `""` and
are unaffected. Nothing requires `departmentId` on teacher-authored documents in
the rules.

---

### 39. Users could edit nearly every field of their own `users` document

**Files:** `firestore.rules` (users, teachers, activity_log, audit_log blocks; `myRole()` / `myInstitutionId()`), `src/lib/AuthContext.tsx`, the Teachers/Students/Parents lists

The `users/{uid}` owner clause only blocked `role`, `institutionId` and (since #38) `departmentId`. Every other field was self-editable, and several are trusted by other rules:

- `canGenerateSchedule` — a senior_teacher could grant themselves timetable write access.
- `assignedClassId` — a senior_teacher could write attendance for any class.
- `classId` — a student could read any class's attendance register, assignments and lesson notes.
- `status`, `houseId`, `email`, `idNumber`, `institutionStudentId`, `dateOfBirth`, `gender` — identity/integrity data. `status` was never enforced anywhere.

Related gaps closed in the same change:

- The legacy `teachers/{uid}` mirror was owner-editable and `isSeniorTeacherFor()` still trusted its `departmentId`, bypassing the #38 freeze for exams, results and feedback comments.
- `activity_log` and `audit_log` accepted any event type, a forged `institutionId`, and any `performedBy` (see #23).
- An `institution_admin` could edit any field of another `institution_admin`.

**Fix (`firestore.rules`):**

- The owner clause is now an **allow-list**: `toursCompleted` and `mustChangePassword` (only ever to `false`) for any role, plus `name`/`phone`/`emergencyContact` for a super_admin — exactly what the app writes today. Everything else is admin-only.
- The admin clause no longer applies to another `institution_admin`; only a super_admin edits admins.
- `isSeniorTeacherFor()` reads `users.departmentId` only, and the `teachers` collection is admin-write-only.
- Log writes are restricted as described under #23, with a server-verified `recordedAt`.
- **Account status is enforced.** `myRole()` and `myInstitutionId()` return a sentinel for an account whose `status` is `'inactive'`, so every role and institution check stops matching it; it can still read its own `users` document, which is how the app shows a clear message and signs it out. A missing status (older documents) counts as active.

**App changes:** every log writer sends `recordedAt: serverTimestamp()`; the profile page shows the verified time and marks older entries "(unverified)"; an inactive account is signed out with an explanation on the login page; admins get a deactivate/reactivate control (with an audit entry written in the same batch) and an "Inactive" badge on the Teachers, Students and Parents lists.

**Known limits:**

- `mustChangePassword` cannot be enforced server-side without Cloud Functions — the owner always writes `false`, so the forced password change remains a UI gate.
- The legacy log `timestamp` and `performedByName` are still client-supplied (see #23).
- A user who is deactivated while signed in is only signed out the next time the app loads; until then their requests fail with permission errors.
- Deactivating an admin from the UI is not offered.

---

### 40. The production build ships one ~3.7 MB entry chunk

**Files:** `src/App.tsx`, `vite.config.ts`

`npm run build` succeeds but warns that some chunks are larger than 500 kB. The entry chunk (`index-*.js`) is about 3.7 MB (about 1.15 MB gzipped) and the Firebase chunk is about 650 kB; every other chunk is small.

**Cause:** `App.tsx` statically imports about 56 page components (only the form and PDF modals are `lazy`), so every page and the libraries they use load on the first visit: `recharts`, `@e965/xlsx`, `react-big-calendar`/`moment`, and `@react-pdf/renderer` through components that import it directly (`attendance/gridsheet`, `AttendanceScopeModal`, `PDFPreviewModal`, `ReportPDF`). `vite.config.ts` has no `build` settings. The warning predates the Lesson Notes work, which added little (its form is already lazy).

**Impact:** slower first load on poor connections and more Vercel bandwidth. It has **no Firebase free-tier effect**: the app is hosted on Vercel, and hashed assets are cached across visits.

**Fix (not done):** measure first with a one-off bundle analysis (for example `rollup-plugin-visualizer` through `npx`, not added to `package.json`), then convert `App.tsx`'s page imports to `React.lazy` behind one `Suspense` fallback and lazy-load the few statically imported react-pdf and recharts users. Risks: a brief loading flash on navigation and timing changes for the Playwright suite, so re-run all specs.

**Not done (deliberately):** raising `chunkSizeWarningLimit` would only hide the warning, so the config is unchanged. The work is unrelated to Lesson Notes and is deferred.

---

### 41. The dashboard had no mobile navigation, and custom-calendar attendance showed "No active academic term"

**Files:** `src/scenes/(dashboard)/index.tsx`, `Menu.tsx`, `TopHeader.tsx`, `attendance/my`, `attendance/child`, `student/index.tsx`, `Table.tsx`

- **Shell:** the sidebar was a fixed 240 px (or 56 px collapsed) column beside the content at every width, so a phone got a sliver of page. Below the `md` breakpoint it is now an off-canvas drawer opened from a menu button in the header (closes on navigation, Esc and backdrop tap; desktop is unchanged).
- **Attendance:** My Attendance (students) and Child Attendance (parents) read only `activeTerm`, which is always `null` for custom-calendar institutions (they have `activeTimeBlocks` instead), so they showed "No active academic term is configured." even with active time blocks. A class's block is known from its `termId`, so the term is now resolved from the class (`lib/attendanceTerm.ts`, `useAttendanceTerm`); a time-block picker appears only when the class's own block is not among the active ones.
- **Student dashboard:** the weekly calendar is replaced by a next-class card (`useNextClass`, one cached `timetable_slots` read per visit, no listener); Events and Announcements are no longer shown to students because they are not functional yet. The month calendar beside it marks every date the class has a lesson (see the follow-up below).
- **Mobile pages:** `Table` gained an opt-in `renderCard` (cards below `md`, table from `md`), used by Assignments and Results; My Attendance, Profile and the read-only Institution Info were reworked mobile-first.

**Temporary, UI-only:** students do not see **Exams**, **Report Cards**, **Progress Reports**, **Disciplinary Action** or **Start Tour** in the sidebar. Routes and `firestore.rules` are untouched, so those pages still open by URL. To restore an item, delete its label from `STUDENT_TEMPORARILY_HIDDEN` in `Menu.tsx` (and the `role !== "student"` guard around Start Tour).

**Schedule and Lessons (follow-up):**

- The Schedule page queried `timetable_slots` by term only, so students and parents saw **every class's** slots. Students now see their own class and parents the selected child's class (`classId ==` + `termId ==`, equality only, no new index); teachers and admins keep the institution-wide term view. _Superseded by #50: students and parents no longer pick a term._
- Below `md` the Schedule is a Mon–Sat day strip with a per-day agenda (`MobileSchedule`, `lib/scheduleDay.ts`); from `md` up the existing grid is unchanged.
- Lessons shows tappable cards on phones, with a search box and subject chips (client-side over the notes already loaded) and a bottom-sheet note viewer (`LessonNoteViewDialog`).
- `Table` now chooses cards or table with a JS media query, so only one is mounted at a time.
- The institution logo is hidden on the User Profile page below `md`.
- My Attendance and Child Attendance no longer cap their width at `max-w-3xl` (they fill the content area from `md` up), show every date as "Weekday, Month d, yyyy" (term range as "Month d, yyyy – Month d, yyyy") via the shared `formatDate` / `formatDateWithWeekday` helpers, and stack the term range beneath the term name on phones.

**Class days on the calendar, parent dashboard and login (follow-up):**

- The dashboard `MiniCalendar` takes an optional `hasClass` and marks class dates with a dot and a faint tint in the tenant brand colour (`.has-class` in `index.css`; today and the selected day keep their highlight, the dot always shows). Students and parents get it; the senior-teacher calendar is unchanged.
- The dates come from `useClassTimetable` (the class's `timetable_slots` for the active term(s) or time block(s), `classId ==` + `termId in`, one cached `getDocs`, 5 minutes) through `useClassDays` and the pure `classDatesInRange`. `useNextClass` uses the same hook and query key, so a student's dashboard still costs one slot read.
- **Parent dashboard:** the page now owns the child selection (a **Showing** picker when several children) and renders a mini calendar next to Quick Actions. `BigCalendar` takes the chosen child as `controlledChild`: in that mode it neither loads the children nor keeps its own live listener, and reads the same cached timetable as the mini calendar, so the page reads one set of slot documents. `useLinkedChildren` is now a cached query (`['linkedChildren', uid]`, 5 minutes) shared with the Schedule page.
- The login page's Institution field (still a native `<select>`, which the e2e login helper selects by label) and its email and password fields and buttons are 44 px tall; the select is `appearance-none` with its own chevron, because iOS ignores vertical padding on a native select.
- **Favicon:** `index.html` links a multi-size `favicon.ico` (16/32/48), 16 and 32 px PNGs and a 180 px touch icon (all in `public/`), and a static `theme-color` of `#0284c7`; `logo.png` was recompressed (8-bit palette with transparency).

**Not done:** the login page and admin/teacher list pages were not reworked for phones, and the Institution Profile admin wizard is unchanged.

**Known limits:**

- **Admin tours on phones:** Start Tour is hidden only for students. The admin tours target elements in the sidebar (`#tour-sidebar-*`), which is an off-screen drawer below `md`, so a tour started on a phone can't highlight them. Open the menu first, or run tours on a larger screen.
- **Note viewer (`LessonNoteViewDialog`):** it has no focus trap and no Esc handling (like the app's other modals), and it holds the note it was opened with, so a live update to that note does not refresh an open sheet.
- **Class-day marks cover the active term(s) only:** a date outside them (a past or future term, or a month with no active term) shows no mark, even if the timetable has lessons there. Showing every term would need a read of all the class's slots.
- **Parent calendars are not live:** the parent weekly calendar and mini calendar refresh with the 5-minute cache, and the linked-children list is cached for 5 minutes, so a class or link change by an administrator can take that long to appear.
- **The tab colour is static:** `theme-color` is the default brand blue, not an institution's own colour, and the favicon is one icon for every school.

---

### 42. North American phone numbers were stored as "+187 680 189 72"; follow-ups deferred

**Files:** `src/lib/phone.ts`, `src/lib/phoneNanp.js`, `src/lib/fieldPatterns.ts`, `scripts/backfill-nanp-phone-format.mjs`, `firestore.rules` (registrations)

`formatPhone()` grouped every international number in threes, so `+1` (NANP) numbers such as Jamaica's were stored as `+187 680 189 72`. The formatter, the shared validation pattern (now 7–15 digits) and display-time formatting are fixed, and a one-time backfill script exists (see `docs/formatting/PHONE_NUMBER_FORMATTING_SPEC.md`). The backfill has to be run by hand, per institution, after the app and the registrations rule are deployed.

**Not done (deliberately):**

- **A per-institution phone country code** (`phoneCountryCode`): the proper way to interpret a bare 10-digit number. Today a bare number converts to `+1-…` only if its digits are NANP-valid and the institution's own phone is a `+1` number.
- **E.164 storage** (`+18768018972`, formatted only for display): the long-term storage form; it would remove the "two formats for one number" question but means normalizing every stored value.
- **Non-NANP formatting:** any other country code keeps the group-by-three output; a real fix needs `libphonenumber-js` (about 145 kB), which the 3.7 MB entry chunk (#40) argues against.
- **Caret preservation:** reformatting on every keystroke moves the caret to the end on a mid-string edit (existing behavior of every formatted field).
- **Backfilling `registrations` and the `institutionPhone` snapshots** on generated report cards and progress reports: left as records; display-time formatting corrects how they print.


---

### 43. Sign-in is tab-scoped and one session per account; the limits

**Files:** `src/lib/firebase.ts`, `src/lib/AuthContext.tsx`, `src/lib/sessionLock.ts`, `src/lib/sessionLockLogic.ts`, `src/components/SessionResetButton.tsx`, `database.rules.json`

- **Tab close signs the user out.** Auth uses `browserSessionPersistence` (the tab's `sessionStorage`) instead of the default IndexedDB persistence: closing the tab ends the session, a reload keeps it, and a new tab starts signed out. Each tab must sign in on its own.
- **One active session per account.** At sign-in `AuthContext` claims `/sessions/{uid}` in the Realtime Database in a transaction; a second sign-in while it is held is signed back out with a message. `onDisconnect().remove()` frees the lock when the tab closes or crashes. It applies to all six roles and is on only when `VITE_SINGLE_SESSION_ENABLED=true` and `VITE_FIREBASE_DATABASE_URL` are set (production), so dev and e2e are unchanged.
- **Admin override:** a *Clear session* button on the Students, Teachers and Parents lists stamps `users/{uid}.sessionResetAt` (with a `session_reset` audit entry). A lock older than that stamp can be taken over, and a displaced live session signs itself out. A stuck administrator lock needs a super_admin; a stuck super_admin lock is cleared by deleting `/sessions/{uid}` in the Firebase Console.

**Limits:**

- **Client-side enforcement.** Firebase Auth still authenticates the second sign-in before this code signs it out. Without Cloud Functions (Spark) the server cannot refuse it, so someone calling Firebase's REST API directly can bypass it. It stops casual credential sharing, not a determined attacker.
- **No server-side revocation.** Closing the tab ends the session on that device; an already-issued token is not revoked (needs the Admin SDK).
- **100 simultaneous connections** on the Spark Realtime Database, one per signed-in tab: more than 100 people online at once would be refused a connection, and the lock **fails open** (sign-in proceeds without it).
- **One tab per user:** a second tab cannot sign in while the first is open.
- **Firestore offline cache is not cleared on sign-out** (`persistentLocalCache`, IndexedDB), so on a shared computer a later user's browser can still hold the previous user's cached documents. Not addressed here. _Fixed by #51: Firestore now uses an in-memory cache, and signing out wipes and reloads the page._
- A late "disconnect" from a reloaded tab can remove the lock after the new tab claimed it; the tab re-asserts it when it notices.
- **Slow or unreachable database:** the lock fails open, so sign-in waits up to 5 seconds (`CLAIM_TIMEOUT_MS`) for the claim and then lets the user in without a lock. A claim that commits after that is finished or taken back out (`claimToken`), so it cannot leave a lock nobody owns. The same delay applies when the 100-connection cap is reached.
- **Idle tabs:** an open tab holds the account's lock for as long as its connection lives, so every role now has an inactivity logout (`lib/inactivityTimeout.ts`): 5 minutes for staff, 30 minutes for students and parents. A browser Duplicate-tab copies the tab's sign-in and session id, so a duplicated tab counts as the same session.
- The Settings page's hardcoded *Active sessions / 2 devices signed in / Sign out all* row was removed: it was never real and contradicts the one-session rule. The *Two-factor authentication* toggle there is still a mock.

---

### 44. Audit and activity log build-out; what is and isn't recorded

**Files:** `src/lib/auditLog.ts`, `src/lib/auditEntry.ts`, `src/lib/auditEvents.ts`, `src/lib/teacherAudit.ts`, `src/lib/profileEditDiff.ts`, `src/lib/cursorPaging.ts`, `src/hooks/useCursorPages.ts`, `src/components/profile/`, `firestore.rules` (`audit_log`), `firestore.indexes.json`; spec: [`AUDIT_LOG_ACCOUNT_ACTIONS_SPEC.md`](./miscellaneous-specs/AUDIT_LOG_ACCOUNT_ACTIONS_SPEC.md); live checks: `e2e/11` (rule probes) and `e2e/14`.

Resolves #11 and #21. Each staff account's profile has an **Actions I performed** view (what it changed on other accounts and records) next to **My activity**; the Audit Log page and the profile's audit section page by cursor.

**Two bugs found and fixed while wiring this:**

- The Students list row did not carry `phone2` or `idNumber`, so editing a student opened the form with both blank and **saving wrote `null`, wiping them**. Both are now on the row. Students whose values were already blanked by an earlier edit have lost them (restore from a backup or re-enter).
- On the Parent edit form, **unticking a linked student did nothing**: only ticked students were written. Unticking now deletes the `student_parents` link in the same batch. (The save button stays disabled until the existing links have loaded, so a quick save can't unlink everyone.)

**Limits:**

- **A malicious teacher can flood the log.** Teachers may now create entries, only as themselves and only the four teacher types, but nothing rate-limits how many. That is an availability risk (it could burn the day's write quota on Spark, 20,000/day), not a way to impersonate anyone or hide an action. Needs Cloud Functions (#23) to fix properly; until then, watch the Firestore Usage tab after any odd spike.
- **Client-written, so forgeable** by a compromised admin or teacher session (#23). The rules do enforce `performedBy` (the writer's own uid), `recordedAt` (server time), the key set, a bounded `detail`, and which event types a role may write: a teacher can write only the four teacher types, never a security event.
- **Not logged:** gradebook *column creation*; the Institution Admins edit form on Manage Admins; edits made by a `super_admin` to a `super_admin`; role changes and account deletion (blocked elsewhere); the unused Activity types `sign_out`, `password_change`, `notification_change`; refused sign-ins (#43).
- **A General Attendance "Save All" logs one summary entry after the registers**, best-effort, so it can occasionally be missing; a single register save is atomic with its entry. Likewise a gradebook save within one operation of Firestore's 500 cap logs right after the save instead of in it.
- **Entries are permanent** (`allow update, delete: if false`). They name the fields or records touched (`Updated phone, class for Jane Doe`) and counts, **never old/new values, scores or comment text**, but "date of birth was edited" persists with no way to delete it.
- A form save and its audit entry share a batch, so a rules rejection of the entry **fails the save**. The rules and indexes must be deployed (and the indexes built) before the app that writes the new event types.
- Paging is relative ("Page N", no total); pages hold Firestore snapshots, so they are not kept in the sessionStorage query cache and paging restarts at page 1 after a reload.
- The Alerts widget (#19) now shows only account and security events, so routine teacher activity can't bury real alerts.
- Teacher events are one entry per save (class, subject, date or term, and a count), not one per student or cell, to stay within Firestore's free-tier write limits.

---

### 45. Detail pages for classes, subjects and terms; named students and a labelled Fill on the attendance registers

**Files:** `src/scenes/(dashboard)/list/classes|subjects|terms/[id]/index.tsx`, `src/components/ViewDetailsButton.tsx`, `src/components/detail/DetailParts.tsx`, `src/components/attendance/FillColumnButton.tsx`, `FillConfirmDialog.tsx`, `MissingStudentsList.tsx`, `src/lib/attendanceMissing.ts`, `classNames.ts`, `classSubjects.ts`, `attendance/general`, `attendance/subject`, `list/houses/[id]`, `list/students/[id]`, `src/App.tsx`; test: `e2e/15-multiple-enhancements.spec.ts`

Seven usability gaps found on the live site:

- **House detail:** Assigned Students were in query order and showed the class **id**. They are now A–Z and show the class name.
- **Student detail:** Class showed the raw `classId`; it now shows the class name (a user document stores only the id, so the name comes from the cached class list).
- **No eye button on user-created Classes, Subjects and Terms.** Each list row now has one, opening a read-only detail page (class: enrolled students A–Z, capacity, subjects; subject: teachers, classes, weights; term: dates, status, academic year). Routes are guarded to the list's audience: classes for staff, subjects and terms for admins (others are sent to the dashboard). Reads: the class page runs one cached `users` query (students of that class, 5 minutes, no listener); the term page one cached `getDoc`; the subject page none.
- **"Confirm Save All" did not say who was unmarked.** Both "save anyway?" dialogs now list the unmarked students by name, per session, on both registers.
- **Bulk Fill was a 10 px icon on the General register and absent from the Subject register.** It is a labelled **Fill** button on both. Excused is not offered (it needs a per-student reason). Fill writes only the local draft; no new Firestore writes.
- **Fix found on the way:** the Subject register's cell handler merged into a stale snapshot, so a bulk fill kept only the last student in state. It now merges into the previous state.

**Limits:** the class page's student list is cached for 5 minutes, so reassigning a student can take that long to show there (saving a student clears it). The detail pages are not shown in demo (mock) mode.


---

### 46. Large lesson-note and assignment files (up to 5 MB) are kept in the Realtime Database; the limits

**Files:** `src/lib/blobStore.ts`, `blobStoreLogic.ts`, `documentUpload.ts`, `lessonNoteFile.ts`, `assignmentFile.ts`, `downloadFile.ts`, `src/components/AssignmentAttachment.tsx`, `forms/LessonNoteForm.tsx`, `forms/AssignmentForm.tsx`, `database.rules.json`, `scripts/sweep-orphan-blobs.mjs`. Design: `docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md`.

Teachers and institution admins can attach files up to 5 MB (500 KB for everyone else, and for student submissions). A file over 500 KB is stored in the Realtime Database and Firestore keeps only its key.

**Limits:**

- **No per-role access control on the file.** The database rules cannot read Firestore or check roles. Anyone signed in who learns a file's key (an unguessable UUID that only the protected Firestore records contain) can read it until it is deleted, and any signed-in account can write files within the budgets. Upload by role is a UI rule only.
- **Free-tier ceilings.** 1 GB stored and about 10 GB/month (360 MB/day) downloaded across all schools. The app enforces 200 MB per school and 900 MB in total through counters in the database; a hostile signed-in user can bypass the counters (the school id is self-declared).
- **Orphans need an owner-run sweep.** Firestore never touches the Realtime Database, so a failed upload clean-up or a missed delete leaves a file behind. Run `node scripts/sweep-orphan-blobs.mjs --key=<path> --project=<id>` (dry run) and add `--apply` to delete; it keeps anything uploaded within 7 days. There is no scheduler on the Spark plan, so run it by hand, for example monthly.
- **Upload shares the connection with the session lock.** A slow network can make a 5 MB upload fail with "taking too long"; the user retries.
- **Dev and e2e use the production database** (the local `.env` points there), so test files count against the same 1 GB.
- **Not yet exercised against the live database:** the unit tests use an in-memory stand-in; a real large upload, replace and delete is still to be run.

---
### 47. Stale subject enrollments showed subjects a student does not take; institution admins as teachers

**Files:** `src/components/forms/SubjectForm.tsx`, `src/components/FormModal.tsx`, `src/lib/subjectEnrollments.ts`, `src/scenes/(dashboard)/attendance/my/index.tsx`, `attendance/child/index.tsx`, `scripts/prune-stale-subject-enrollments.mjs`, `src/lib/teachingStaff.ts`, `src/hooks/useTeachingStaff.ts`.

**Fixed:** My Attendance > By Subject (and a parent's Child Attendance) lists the `subjectEnrollments` of the student's class. The Subject form only ever wrote enrollments, and deleting a subject left them, so a subject that dropped a class, or was deleted, kept showing to that class's students (GENR8-3D Academy: 4 stale rows for "Associate of Science Degree in Engineering Year 2"; every student was already in that one class). Now editing a subject removes the enrollments of classes no longer listed, deleting a subject removes its enrollments, the attendance pages ignore an enrollment whose subject is gone or no longer lists the class (one cached read of the subjects list), and `scripts/prune-stale-subject-enrollments.mjs` (dry run by default, `--live`, `--institution=<id>`) clears the existing ones.

**Also:** institution admins are selectable as teachers (tagged "(Admin)"): a subject's teachers (senior and regular teachers too, which the Subject form had left out), a department's head, and the Assignment, Exam and Timetable lookups. They share one cached users query instead of six listeners.

**Limits:**

- An admin teacher has no Teachers-list or detail page, no personal "my schedule" view (`BigCalender` filters by teacher role) and is not in grade-entry tracking's roster. Not changed; revisit when a concrete blocked action is named.
- A stored teacher name is a copy: renaming or deactivating an admin does not update the subjects, departments or assignments that hold it.
- The pickers list deactivated accounts too, as before.

---

### 48. Edit Student and Edit Parent change only the Firestore email, not the sign-in address

**Files:** `src/components/forms/StudentForm.tsx`, `ParentForm.tsx`, `scripts/set-account-email.mjs`, `scripts/setAccountEmailLogic.mjs`.

**Known issue.** The Edit Student / Edit Parent forms update `users/{uid}.email` only. The address a person signs in with is the Firebase Authentication email, so after an admin fixes a typo the two differ: the "Send sign-in email" button emails the corrected address, but the sign-in link then fails with "That didn't work" because no Auth account has it. A first email also stamps the 24-hour cooldown, so a corrected address cannot be emailed straight away.

**Workaround (owner-run):** `node scripts/set-account-email.mjs --uid=<uid> --use-document-email --key=<path>` (dry run by default; `--live` to write; or `--email=<address>` to give the address). It sets the Auth email (lower-cased, unverified) and the document email, deletes `credentialsEmailedAt` and `credentialsEmailCount`, refuses an address another account uses and any admin account, and writes a local log with the old and new addresses.

**Deferred:** make the email read-only on the Student and Parent edit forms (`INSTITUTION_LOGIN_EMAILS_SPEC.md` section 5.5) so the mismatch cannot be created; and `audit-account-emails.mjs` to find existing mismatches.

---

### 49. Delete user (students and teachers) removes the person's records, not everything; the sign-in is removed by a script

**Files:** `src/components/DeleteUserButton.tsx`, `src/lib/deleteUserData.ts`, `src/lib/deleteUserExecutor.ts`, `scripts/remove-orphan-auth-accounts.mjs`, `scripts/removeOrphanAuthLogic.mjs`, `firestore.rules` (`users/{uid}` delete), the Students and Teachers list pages.

**What it does.** An institution admin (not a super admin, never on their own account) presses the red bin icon on a student or teacher row. A dialog counts what will be removed and asks for the person's exact name and a tick on "I understand this cannot be undone". Records are deleted in batches; the `users/{uid}` document goes last, in one batch with one `account_deleted` audit entry, so a failure part-way leaves the person in the list and the button can simply be pressed again.

- **Student:** profile, photo, parent links (`student_parents`), and their documents in `results`, `feedback_comments`, `reportCards`, `reportCardComments`, `progressReports`, `disciplinaryActions`, `studentActivities`, `studentResponsibilities` and `attendanceSummaries` (one equality query on `studentId` per collection, no new index).
- **Teacher:** profile and photo, and the teacher is taken out of `teacherIds` and `teacherNames` of the subjects they teach (those subjects are read again when the deletion runs, so a concurrent edit is not overwritten). What a teacher created (assignments, exams, lessons, lesson notes, graded results, timetable slots) is **kept**, because students depend on it; stored teacher names on those are plain copies.

**Not removed (known limits, shown in the dialog):**

- The student's mark and name inside class attendance registers (`generalAttendance`, `subjectAttendance`) and gradebooks: they sit in documents shared by a whole class, so removing them means rewriting shared registers.
- Assignment submissions, their attempts and the submission tombstones: the rules keep them undeletable on purpose (an immutable log), and the owner chose not to relax that. They can be removed with the Admin SDK if ever required.
- The activity log (`users/{uid}/activity_log`) and the institution audit log (append-only by rule). The `account_deleted` entry records who deleted whom.
- A parent linked only to a deleted student stays as an account with no children.
- Backups and processor copies (EmailJS, Firebase) age out on their own schedules (`LEGAL_AND_PRIVACY_COMPLIANCE.md`).

**The sign-in account.** A browser cannot delete another person's Firebase Authentication account (no Cloud Functions on Spark). After deleting, run the owner script: `node scripts/remove-orphan-auth-accounts.mjs --key=scripts/service-account.json` (dry run), then add `--live`; `--uid=<uid>` limits it to one account. It removes Auth accounts that have **no** `users/{uid}` document and are at least 24 hours old (a newer one may still be mid-creation), prints addresses masked only and writes a local log. Until it runs, the person cannot use the app (no profile) but their sign-in still exists.

**Rules.** `users/{uid}` delete is now `isSuperAdmin()` or an institution admin deleting a `student`, `regular_teacher` or `senior_teacher` in their own institution who is not themself. **Deploy the rules before the app.**

**Photo read fix.** Reading `users/{uid}/photo/current` with `getDoc` is denied for an admin when the person has no photo (the rule reads `resource.data.institutionId`, and a missing document has no data), which made the first version of the dialog fail with "Could not check this person's records" and made the Students and Teachers lists log `Missing or insufficient permissions` for rows without a photo. The dialog and both lists now use `src/lib/userPhoto.ts` (an institution-filtered query that returns nothing instead of an error). The detail pages and edit forms still use `getDoc` for a photo that may not exist, so a person without a photo logs the same console error there (harmless: no photo is shown). Move them to `fetchUserPhotoUrl` when next touched.

**Deferred:** purging shared-register and gradebook cells; deleting submissions; a per-person export; deleting a parent or spectator; bulk delete; an undo window (soft delete first); an emulator rules test.

---

### 50. Students and parents had a Term dropdown on the Schedule page; it is gone

**Files:** `src/scenes/(dashboard)/schedule/index.tsx`, `src/hooks/useClassTimetable.ts`, `src/lib/scheduleDay.ts` (`activeTerms`), `src/lib/nextClass.ts` (`SlotLite.termName`), `src/components/BigCalender.tsx`, `src/components/schedule/MobileSchedule.tsx`, `e2e/12-student-mobile.spec.ts`.

**Problem.** The Schedule page showed every role a Term picker, although a student's (or a parent's selected child's) timetable is already scoped to one class. In a custom-calendar institution each term is a time block, so a student saw only the slots of whichever block was selected (often an ended or empty one, as in "Q4 2026 / No slots") and could miss lessons that sit in another active block. The dashboard calendar and next-class card already showed the class across all active blocks, so the two views disagreed.

**Fix.**

- **Students and parents:** no Term select. The page shows the class's slots for every currently active term (academic mode) or time block (custom mode), the same rule as the dashboard. When more than one block is active, each card carries its block name. With no active term or block the page says so.
- **Teachers and admins:** unchanged (term select, live `termId ==` listener, create/edit/delete).
- **One rule, one read:** `activeTerms()` in `lib/scheduleDay.ts` is the single definition of "the active terms", used by `useClassTimetable` and `BigCalendar`. The Schedule page reads class-scoped slots through `useClassTimetable` (`classId ==` + `termId in`, no new index, shared cache key with the dashboard), so opening Schedule after the dashboard costs **no extra Firestore reads** and stays inside the Spark free tier. `SlotLite` gained an optional `termName`, copied from the slot document the same read already returns.

**Behaviour to know.**

- A student's Schedule is cached (5 minutes, and across reloads in the tab via the session cache), not live: a timetable edit by an admin shows after the cache expires or on the next session. Staff views remain live.
- In academic mode, `activeTerm` is date-based, so between terms (a holiday gap) students and parents see "No term or time block is currently active" instead of the previous `status === 'active'` fallback. This matches the dashboard.
- In mock and blank data modes the calendar hook is disabled, so the class-scoped view shows that same message (dev only).
- Class scoping is still client-side: the `timetable_slots` read rule is institution-wide. See the security report (S-09).

**Deferred:** none.

---

### 51. Firestore data was kept in the browser's IndexedDB, unencrypted and never cleared; it is now memory-only and wiped on sign-out

**Files:** `src/lib/firebase.ts`, `src/lib/legacyFirestoreCache.ts`, `src/lib/sessionPurge.ts`, `src/lib/queryPersistence.ts`, `src/lib/queryClient.ts`, `src/lib/attendanceDraft.ts`, `src/lib/AuthContext.tsx`, `src/components/PostLoginInstitutionGate.tsx`, `src/components/forms/AdminCreateUserForm.tsx`, `src/scenes/(dashboard)/import/index.tsx`, `src/scenes/(dashboard)/attendance/subject/index.tsx`, `src/main.tsx`.

**Problem.** The Firestore SDK was configured with `persistentLocalCache`, so every document a signed-in person read was written to IndexedDB (`firestore/[DEFAULT]/school-sms-v1/main`), unencrypted, and was never cleared. It outlived sign-out, tab close and a change of user on a shared computer, and for a teacher it held every student's full `users` document (date of birth, ID number, phone, address) plus results and feedback. Beside it, the React Query persister wrote the whole user directory to `sessionStorage` (`sms_query_cache`), unsent drafts sat in `localStorage` with no owner, and several sign-out paths (a deactivated account, a displaced session, an expired or revoked token) cleared nothing. This is residue on the device, not a rules bypass: the cache only held what that person was allowed to read.

**Fix.**

- **Memory-only Firestore cache.** `memoryLocalCache` with an LRU collector (40 MB). Listener re-attach inside a session is still billed as a delta; a page reload starts cold.
- **One-time cleanup.** `legacyFirestoreCache.ts` deletes the old IndexedDB database(s) and the `firestore_*` localStorage keys once per browser (flag `sms_idb_cleaned_v1`; a tab still on the old build blocks the delete, so it retries on the next load).
- **One purge, every exit.** When an authenticated session ends by any route (button, inactivity timer, displaced session, deactivated account, expired token), `AuthContext` runs `purgeSession()` (query cache, filters, drafts, persisted cache) and reloads to `/login`, because the SDK's memory cache can only be emptied by a page load. A sign-out reason (`signOut(notice)`) is carried across the reload in `sessionStorage`.
- **Persisted query cache is an allow-list, per user.** Only reference data (terms, academic years, non-school days, classes, subjects, departments, next-class slots) is written; it is stamped with the uid and restored only for that uid after auth is known. `users`, `classStudents`, `linkedChildren`, `houses` and the profile and audit queries are never persisted.
- **Attendance drafts** are keyed by uid, carry a 24 hour expiry and the register date, and are wiped on every sign-out (including the inactivity logout) and, at sign-in, anyone else's are removed. This also fixes `purgeExpiredDrafts`, which compared the class id, not the date, for subject drafts.
- **Secondary Auth instance** (account creation and the student import) uses in-memory persistence instead of IndexedDB.
- **Dashboard head-counts use `count()`.** The admin and spectator dashboards (`UserCard` x4, `CountChart`) opened live listeners that downloaded every student, teacher and parent document only to count them: roughly N_students + N_teachers + N_parents reads (~6,000 at 2,500 students) per cold load, which the memory-only cache would have repeated on every reload against Spark's 50,000/day. They now use `getCountFromServer` through `lib/dashboardCounts.ts` (about 7-10 reads, no documents or PII reach the client; equality filters only, no new index). Counts are no longer live: they refresh on load, every 5 minutes, and when a user is saved or deleted.

**Behaviour to know.**

- **Reads:** a page reload now re-reads live lists (`onSnapshot`) in full instead of only what changed within 30 minutes; reference data is still restored from the allow-listed cache. Watch the Firebase Usage tab (reads per day) after deploy.
- **Unsynced offline writes** are held in memory only and are lost if the tab closes while offline. Offline use is limited to attendance, which has its own draft.
- **Inactivity logout now discards an unsent attendance draft** (decided): a teacher who leaves a half-entered register for longer than the 5-minute staff timeout must re-enter it.
- Signing out reloads the page (a cold start), so it is slightly slower than before.

**Still open (separate work):** the cause that makes this matter, personal data on `users/{uid}` readable by every teacher in the institution (the PII split and rule tightening in `docs/backend/PII_SPLIT_DESIGN.md`); until that ships, a teacher's *live* session memory still holds those documents, but nothing survives sign-out, reload or tab close. `Clear-Site-Data` is deferred until the custom domain.

---

### 52. Classes list: Population instead of Grade/Supervisor; Houses list: Class instead of Description

**Files:** `src/scenes/(dashboard)/list/classes/index.tsx`, `src/scenes/(dashboard)/list/houses/index.tsx`, `src/lib/classPopulation.ts`, `src/lib/classPopulationQueries.ts`, `src/hooks/useClassPopulations.ts`, `src/lib/invalidateUserCounts.ts`, `src/components/FormModal.tsx`, `src/lib/deleteUserExecutor.ts`, `src/components/forms/AdminCreateUserForm.tsx`, `src/scenes/(dashboard)/import/index.tsx`, `src/lib/queryPersistence.ts`.

**What changed.**

- **All Classes:** the Grade and Supervisor columns are gone from the list and the Capacity column is folded into a new **Population** column showing the number of active students out of capacity (*12 of 30*, red when over, via `formatCapacity` / `isOverCapacity`, the same as the class detail page). `grade` and `supervisor` stay on the document and in ClassForm, the class detail page, the student list "Grade" column and the report builder; only the list columns were removed.
- **All Houses:** the Description column is replaced by **Class**: the distinct class names of the house's students, A-Z, truncated (*1A, 1B +2*, full list in the tooltip). A house has no class of its own (a student carries both `houseId` and `classId`), so the column is derived, not stored. Description is still edited in HouseForm and shown on the house detail page.

**How it is read (Spark free tier).**

- **Population:** two `count()` aggregations per visible class (all students in the class, and those with `status == 'inactive'`), subtracted. A single `status != 'inactive'` filter would silently drop older users that have no `status` field, which the app treats as active. Billed one read per 1,000 index entries (minimum one) per aggregation; no documents or personal data are downloaded; equality filters only, so no new index. At most 20 classes per page, so at most 40 reads per cold view; cached 60 seconds and restored after a reload within 30 minutes.
- **Houses:** the Students count and the Class names come from the shared, cached users list (`useInstitutionUsers`, also used by the Students, Teachers and Parents lists) instead of one uncached query per house on every visit. This also fixes the old count including non-students (the query had no `role == 'student'` filter) and now skips deactivated students.
- **Freshness:** the counts are not live. They refresh on load, after a minute, and whenever a student is saved, moved, imported, created or deleted (`invalidateUserCounts`).

**Behaviour to know.** Deactivated students are not counted in Population or on the Houses list, and the Class and House detail pages (the enrolled / assigned students lists and "12 of 30") now leave them out too, so each list matches its detail page. Saving a house (the modal or the detail page's student assignment) and deleting a house refresh the cached users list the Houses list reads from, so the Students and Class columns update at once. Mock data mode shows the capacity only.

**Deferred:** retiring `grade` and `supervisor` from the form and the data model (they are still used by the report builder and the student list); a Class column on the Houses list that does not need the full users list once the PII split ships.

---

### 53. A subject can have one optional assistant teacher (a label with full teacher access)

**Files:** `src/lib/subjectTeachers.ts`, `src/components/forms/SubjectForm.tsx`, `TeacherForm.tsx`, `src/lib/deleteUserExecutor.ts`, `generateReportCard.ts`, `generateProgressReport.ts`, `list/gradebook/index.tsx`, `list/subjects/index.tsx` and `[id]/index.tsx`, `SubjectDocument` in `src/lib/firebase.ts`.

**What changed.** The Subject modal has an optional **Assistant teacher** select (None, or one of the ticked teachers). It is stored as `assistantTeacherId` and `assistantTeacherName` on the subject, absent when none. The assistant is **always one of `teacherIds`**, so it has exactly the access of the other teachers (attendance, results, feedback, gradebook, lesson notes): `firestore.rules` and the role-scoped subject queries are unchanged. The only difference is naming: report cards, progress reports and the gradebook name the **lead teacher** (the first teacher who is not the assistant) instead of `teacherIds[0]`. The Subjects list tags the assistant "(Assistant)" and the subject page shows an "Assistant" tag.

**Keeping the label valid.** Unticking the assistant in the Subject modal clears it; removing a teacher from a subject in the Teacher form, or deleting a teacher (Delete user), also removes the label. Delete user now rewrites both `teacherIds` and `teacherNames`, reading the subjects again when the deletion runs (before, it removed only the id, which left the two aligned arrays out of step; subjects of a teacher deleted that way earlier would show a wrong name, and none are known to exist). The Subject modal's tick box now toggles ids and names by position, not by name, so two teachers with the same name no longer clash.

**Gradebook.** A saved gradebook result, and the gradebook import, store the subject's lead teacher's name (as before it was `teacherNames[0]`, which could now be the assistant).

**No deploy steps beyond the app:** no rules, index, environment-variable or backfill change. Existing subjects simply have no assistant.

**Deferred:** limited powers for an assistant (for example attendance only), several assistants, an assistant per class, teachers setting the assistant, a rule that enforces assistant in `teacherIds`, and tagging the assistant on the Teacher detail page and in the gradebook's shared banner.

---

### 54. People-list sign-in badge, audited sign-in emails, connection banner, and dashboard tidy-up

**Files:** `src/lib/loginLinkStatus.ts`, `src/components/LoginLinkBadge.tsx`, the Students, Teachers and Spectators lists, `useSpectators.ts`, `SendLoginEmailButton.tsx`, `src/lib/auditEvents.ts`, `firestore.rules`, `src/lib/connectionStatus.ts`, `src/components/ConnectionBanner.tsx`, `src/lib/firebase.ts`, `src/main.tsx`, `AwaitingSignInCard.tsx`, `PendingRegistrationsCard.tsx`, `AdminQuickActions.tsx`, `AttendanceChart.tsx`, the admin and spectator homes.

- **Sign-in badge.** Under a person's name on the Students, Teachers and Spectators lists: "Link not sent" (grey), "Link sent 12 Oct" (blue) or "Signed in" (green, `mustChangePassword === false`). Older accounts with no `mustChangePassword` show nothing. Parents are never emailed, so no badge. It reads fields already in the cached users list: no extra reads. After a send, the one cached row is patched so the badge changes at once.
- **Audit.** Sending a sign-in email now writes a `sign_in_email_sent` entry ("Sign-in link emailed"; names the person, never the address) in the SAME batch as the cooldown fields. It has its own **Emails sent** category in the Audit Log filter (not "Account & security", so it does not fill the super-admin alerts). The institution Audit Log only; the recipient's own Activity Log is unchanged. **`firestore.rules` change: deploy the rules before the app.**
- **Connection banner.** A fixed banner ("We can't reach the server…", with Dismiss) at the app root, so it also shows on the login page. It appears when the Firestore SDK logs "Could not reach Cloud Firestore backend…" (caught with `onLog`) or the browser fires `offline`; it clears on the browser `online` event or the next successful query. **Known limit:** the SDK logs that message only for the first failed connection of a page session (never again after it has once connected, and never on reconnect), so a connection lost mid-session is covered by the browser `offline` event instead, which can miss a server outage while the device is still "online"; Dismiss covers a lingering banner. The matcher uses the stable part of the message, tested.
- **Dashboards.** The Attendance card defaults to "Last 30 Days" (admin and spectator). The admin Quick Actions gain **Log Attendance** (General Register). The Events, Announcements and Institution Profile cards are gone from the admin and spectator homes (still in the sidebar; the "complete your profile" prompt stays) and are replaced by **Awaiting first sign-in** (students, teachers, and for the admin spectators, who have not yet signed in: four `count()` aggregations, cached five minutes; the users list is not loaded) and **Pending registrations** (one `count()`). This also removes three live listeners, and the now-unused `EventsList` and `InstitutionBrandCard` components (and its `readOnly` prop) were deleted.
- **If the combined write is refused** (for example the app is deployed before the rules), the cooldown fields are still recorded alone, so the same person cannot be emailed repeatedly; the message then says it could not be added to the Audit Log.

**Deploy:** `firebase deploy --only firestore:rules --project school-sms-v1`, then merge. No index, environment-variable or backfill change (the new counts are equality-only and use the existing single-field indexes; if the console reports a missing index for `mustChangePassword`, create the one it links to).

---

### 55. Dropdown filters on five lists and natural ordering of three

**Files:** `src/lib/listFilters.ts`, `src/lib/sortByName.ts` (`naturalCompare`, `sortByNameNatural`), `src/components/FilterSelect.tsx`, `src/lib/classPopulation.ts` (`HouseSummary.classIds`), and the Students, Teachers, Subjects, Houses, Classes and Lesson Notes list pages.

- **Filters (all client-side over rows already loaded: no new reads, listeners, indexes or rules).** Students by **Class** (plus **No class**); Teachers by **Subject** (a teacher matches when their id is in the subject's `teacherIds`, so assistants match too; plus **No subjects**); Subjects by **Teacher** (options built from the subjects' own `teacherIds`/`teacherNames`, so no users are read; plus **No teacher**); Houses by **Class** (a house with at least one active student in that class; `summariseHouses` now also returns `classIds`); Lesson Notes ("Lessons" in the sidebar) by **Subject**, as a dropdown beside the search that shares one value with the existing subject chips. Filters combine with the search (AND) and reset to page 1.
- **Remembered per page** for the browser session (`filterPersistence`, cleared on sign-out). A remembered class, subject or teacher that no longer exists falls back to "All" (`validChoice`); while a reference list is still loading, the remembered value is kept so nothing is hidden by mistake.
- **Natural ordering.** Subjects, Classes and Houses are sorted by name in natural, case-insensitive order (1A, 2B, 10A; digits before letters) on the full list **before** it is paginated, so the order holds across pages. People lists keep their plain A-Z sort.
- **Count line.** Every list in this entry plus Parents and Spectators shows, in its top bar, `Showing 21-40 of 42 students (240 total)`: the page range, every row that passes the dropdown and the search (across all pages), and the unfiltered total in brackets only when something narrows the list. Empty: `No students match (240 total)` (or `No students`); `…` while loading; Lesson Notes adds `newest 100 only` when its 100-note cap was hit. It is announced politely to screen readers and is just an array length (`countLabel` in `lib/listFilters.ts`, `components/ResultCount.tsx`): no reads.
- **Not done:** the legacy `/dashboard/list/lessons` page (not in the sidebar; its form only logs) is unchanged; no filter on the Classes list (not requested); server-side `orderBy` was not used (it would add nothing and drop documents missing the field).

**Deploy:** none beyond merging (no rules, index, environment-variable or backfill change).

---

### 56. Profile page: columns end together and Activity spans the full width (all roles except super_admin)

**Files:** `src/scenes/(dashboard)/profile/index.tsx`, `src/components/profile/ProfileSection.tsx`, `src/lib/__tests__/profileLayout.test.ts`.

- **Layout.** From 1024 px (wide tablets and up) the profile is two columns (7/5): Contact Information over Role-specific Details on the left, Account Details on the right, with the grid stretched so the columns finish together (Role-specific Details and Account Details opt in to `fill`, i.e. `flex-1`, so whichever column is shorter grows). **Activity** is its own full-width card below the grid, and the admin "Audit and security events" card stays last. Below 1024 px everything stacks as before.
- **super_admin is unchanged** (the original `xl` 7/5 split with Activity in the right column, `items-start`).
- **Activity itself is unchanged:** the same scrolling list (`max-h-[28rem]`), paging and tabs, only wider. `ProfileSection.fill` is opt-in (default off), so Activity, Audit and any other use still end where their content ends; the earlier "cards stretched by a long Activity list" problem cannot return because Activity is no longer beside them.
- UI only: no reads, rules, indexes or deploy steps.

---

## 🟡 Open Questions Blocking Implementation

This open question is unresolved and directly gates significant feature work. It should be answered before the corresponding backlog items are started.

---

### 33. Messaging architecture undecided

**Open Question #1:** Should messaging be in-app (requires a Firestore `messages` collection, Firestore rules, real-time listeners, and a full list/compose UI) or third-party (email via e.g. SendGrid, SMS via e.g. Twilio — requires a Cloud Function intermediary and no in-app storage)?

**Blocks:** M-1 (architecture decision), M-2 (full messaging feature), and the `/list/messages` route.

---

## 🟡 Schedule Generation — Phase 2 / Deferred

---

### 34. Phase 2 — BigCalendar integration ✅ Resolved

**Files:** Teacher, student, and parent dashboard pages; `src/lib/data.ts` (`calendarEvents`)

The existing `BigCalendar` components on teacher, student, and parent dashboards display hardcoded August 2024 events (see Issue #4). Once `timetable_slots` is live and populated, these calendars can be wired to real schedule data, resolving Issue #4 as a side effect.

**What Phase 2 requires:**

- Active term resolution helper (query `terms` for the institution, return the document where `startDate ≤ today ≤ endDate`)
- Role-scoped slot queries (admin: all slots; senior/regular teacher: slots where `teacherId == uid`; student: slots for enrolled classes; parent: same as student for each linked child)
- Occurrence expansion: for each slot, compute `{ title, start, end }` events for every matching weekday within the term date range

**Depends on:** S-5 (TermDocument `startDate`/`endDate` field verification — ✅ resolved); Issue #31 (`enrolledStudentIds` for student/parent scoping).

> **Resolved 2026-06-15** — Delivered as part of Issue #4 resolution. `BigCalender.tsx` was fully rewritten with role-aware Firestore queries. Student and parent scoping uses `classId` from `users/{uid}` (available via `useAuth().classId`) rather than `enrolledStudentIds[]` from Issue #31 — the dependency on Issue #31 does not apply. Active term is resolved via `useInstitutionAcademicCalendar()`; when no term is active the calendar renders empty. The teacher detail page (`/list/teachers/:id`) passes `teacherIdOverride={id}` so the embedded calendar shows that specific teacher's real schedule rather than the signed-in user's. See `BIGCALENDAR_AND_SKELETON_SPEC.md` Part 1 for full implementation details.

---

### 35. Role-level schedule delegation (Option A) — deferred

**File:** `src/lib/permissions.ts`

Currently, schedule-generation access for `senior_teacher` users is granted per-user via the `canGenerateSchedule` flag on their `users/{uid}` document, toggled by `institution_admin` via the Manage Access panel. A future option is to grant access to **all** `senior_teacher` users by role, without requiring per-user toggling.

**Fix (single-line change):** In `permissions.ts`, add `|| role === 'senior_teacher'` to the second condition of `canGenerateSchedule()`. No data model changes or Firestore rule changes are required.

**Deferred:** Post-MVP — per-user delegation is sufficient for Phase 1.

---

_End of Issues & Gaps report._
