# Issues & Gaps — School Management Dashboard

> **Generated:** 2026-05-27 · **Last updated:** 2026-10-27 (added #78 for the exam screens on a phone and the unsaved-changes guard; put #74 to #77 in order; updated #76 for where a forward-only attempt reopens) · 2026-10-26 (added #75 for the Word picture import, #76 for the presets and #77 for the activity log, then updated #77 with the settled open questions; updated #73) · 2026-10-26 (added #74 for question pictures) · 2026-10-22 (added #68 to #73 for the lesson notes and online exams work) · 2026-10-20 (added #65 to #67; updated #1, #30, #40, #59, #60, #64) · 2026-10-19 (added #59 to #64) · 2026-10-15 (added #57, #58) · 2026-10-13 (added #54 to #56) · 2026-10-02 (resolved #11, #21; added #44; updated #19, #32) · 2026-09-23 (added #36, #37 — found via a Playwright QA pass against live Firestore) · 2026-06-15 (resolved #5, #25; addressed #18; assessed #24; resolved #2, #9; partially resolved #12; resolved #4, #10, #34)
> **Branch:** `fe-clean` (earlier entries were written on `post-mvp-additions`)
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
> **Updated 2026-10-20** — `LessonForm`, `EventForm` and `AnnouncementForm` no longer exist: they were removed with #64 (the three tables open a "not available yet" panel because nothing in the app writes those collections). `ExamForm` and `AssignmentForm` have written to Firestore for some time. The paragraph above is kept as written on its date.
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

**Status: Not completed** — `description` has not been added to the `Announcement` type or any Firestore type definition. *(2026-10-20: `AnnouncementForm.tsx` was deleted with #64, so the textarea no longer exists; this item comes back when the announcements feature is built.)*

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

**Fix (done in #59):** measure first with a one-off bundle analysis (for example `rollup-plugin-visualizer` through `npx`, not added to `package.json`), then convert `App.tsx`'s page imports to `React.lazy` behind one `Suspense` fallback and lazy-load the few statically imported react-pdf and recharts users. Risks: a brief loading flash on navigation and timing changes for the Playwright suite, so re-run all specs.

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
- **Houses before its data loads.** The Houses class filter needs the cached users list; until it has loaded, every house is shown and the count reads "…" (a remembered class never hides everything for a moment).
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

### 57. Feedback page crashed the whole app; no error boundary; paging not reset on filter change

**Files:** `src/scenes/(dashboard)/list/feedback/index.tsx`, `src/lib/feedbackComment.ts`, `src/components/PageErrorBoundary.tsx`, `src/App.tsx`, `src/scenes/(dashboard)/disciplinary-actions/index.tsx`, `src/scenes/(dashboard)/registrations/index.tsx`, `src/lib/__tests__/feedbackPageAndBoundary.test.ts`.

- **Feedback page.** It rendered `item.comment.length`, but no writer in the app stores a `comment` (the Gradebook and the Feedback form save `commentNumbers` and `conductGrade`), so any real feedback document threw and the page went blank. It now builds the comment text from the comment numbers (`feedbackCommentText`, neutral he/she pronouns because the document has no gender, so no extra reads), shows Subject and Conduct columns, and resolves the term and subject names from the cached terms and subjects (the Gradebook stores no `termName`). Every field is guarded, so a malformed document shows a dash instead of throwing. A stored `comment` sentence (older documents) still wins.
- **Error boundary.** The app had none, so one throwing page unmounted everything, sidebar included. `PageErrorBoundary` now wraps the routes inside the dashboard layout: a failing page shows a short message with Reload and Go-to-dashboard buttons, the sidebar and header stay, and moving to another page clears it.
- **Paging.** Disciplinary Actions (type chips, search) and Registrations (status chips) did not return to page 1 when the filter changed, so with the page left at 2 or later a short filtered list could show nothing. Both now call `setPage(1)`. (Found while checking a report that turned out to be a slow connection; the missing reset is real.)
- **Date column.** It showed "Invalid Date" for every row although the stored `createdAt` is a real Timestamp: the page's own conversion relied on `instanceof Timestamp` and fell back to slicing the object's text. `lib/dateValue.ts` `toIsoDate` now reads a Timestamp by its `toDate()` method (also plain `{seconds}` objects, Dates, ISO strings) and returns an empty string for anything unreadable, which shows as a dash. `components/ReportPDF.tsx` and `components/superadmin/RecentSignups.tsx` still use `instanceof Timestamp` and could adopt the helper.
- **Read cost.** The Feedback list listened to the whole `feedback_comments` collection (one read per document per visit: about 2,125 for the Blue Mountain demo, so about 24 visits would use Spark's 50,000 reads a day). It now reads only the newest 100 (`orderBy createdAt desc`, `limit(100)`, no index) and says "Showing the newest 100 comments." when the cap is reached; the listener also has an error callback so the page cannot stay on "loading".
- No rules, indexes, data or deploy steps. Existing feedback data needs no change.

### 58. Grade-Entry Tracking read cost, and the pages that still read a whole collection

**Files:** `src/scenes/(dashboard)/admin/grade-entry-tracking/index.tsx`, `src/lib/gradeTrackingLoader.ts`, `src/lib/gradeTrackingCache.ts`, `src/lib/__tests__/readCosts.test.ts`.

- **Problem.** The page loaded every result, every feedback comment and every student of the term as soon as it opened: about 8,700 reads per visit for the Blue Mountain demo (results 6,242, feedback 2,125, students 250, slots 102), and far more for a large institution. Spark allows 50,000 reads a day.
- **Fix.** It now loads only when "Load tracking" is pressed, keeps the result for 5 minutes per institution and term (the term picker shows already-cached data for free; Refresh reads again), shows how many documents the load read, and counts the roster with one `getCountFromServer` per class (equality filters only, no index, one read each) instead of reading every student. A cold load is still thousands of reads for a few hundred students (it needs each result's assessment name and student), so it should not be opened repeatedly. The cache is never persisted (it holds student ids) and sign-out clears it.
- **Still read in full, not changed:** Progress Reports and Report Cards listen to their whole collection (about 250 documents each now; Progress Reports grows to about 750 after the December snapshots), Disciplinary Actions to all of its documents (a few dozen to a few hundred), and Report Builder reads the term's report cards on each term change. Those are acceptable at this size; a cap or filter is the next step if an institution grows.
- No rules, indexes or deploy steps.

### 59. The first visit downloaded 4.5 MB of JavaScript; pages now load on demand

**Files:** `src/routes/lazyPages.ts`, `src/App.tsx`, `src/routes/*Routes.tsx`, `src/components/RouteFallback.tsx`, `src/lib/chunkReload.ts`, `src/routes/prefetch.ts`, `src/components/attendance/` (the gridsheet and attendance PDF files), `vercel.json`, `index.html`, `src/lib/__tests__/bundleBoundaries.test.ts`.

- **Problem.** Every page was a static import in `App.tsx` and four attendance files imported the PDF engine directly, so the entry chunk was 3.88 MB (1.17 MB gzip) and a first visit downloaded about 4.5 MB of JavaScript.
- **Fix.** Each page is a `lazy()` import (`lazyPages.ts`), the PDF engine loads only when a PDF is opened, a sidebar link prefetches its page after the pointer or focus rests on it for 100 ms, and a tab opened before a deploy reloads once when a chunk has been renamed (`vite:preloadError`). `vercel.json` now answers a missing `/assets/*` file with 404 instead of the app shell. `App.tsx` went from 607 lines on `main` to 71 (routes in five files under `src/routes/`). The `<link rel="preconnect">` hints in `index.html` open the Firebase and App Check connections while the app downloads, and the two list avatars load lazily.
- **Result.** Entry chunk 3.88 MB to about 0.46 MB, first-load JavaScript 4.53 MB to about 1.12 MB (1.35 MB to about 0.34 MB gzip); `bundleBoundaries.test.ts` fails if a page or a heavy library becomes reachable from `main.tsx` again. Measured on scratch production builds made with Vite's build API; `npm run build` itself was not run for this entry, and when it was first run before the PR it found one problem the unit tests could not: the `next/navigation` stub that nextstepjs's Next.js adapter needs had been deleted as unused (restored in `cc32054`, with a test). Lighthouse on a deployed URL is still to do.
- No rules or index changes. A normal deploy.

### 60. Failed reads were silent; they now report, and five real bugs the sweep found are fixed

**Files:** `src/lib/reportError.ts`, `src/lib/signInFailure.ts`, `src/components/CardErrorBoundary.tsx`, `scripts/loadErrorScanLogic.mjs`, `src/lib/__tests__/loadErrorHandling.test.ts`, `src/lib/userPhoto.ts`, `src/hooks/useInstitutionUsers.ts`, the student and parent pages, `firestore.indexes.json`.

- **Problem.** 96 listeners and reads (41 `onSnapshot` calls with no error callback and 55 reads with no rejection handler) could fail without a word, and the sign-in page answered "Incorrect password" to every error it did not name.
- **Fix.** `onLoadError()` is the one handler every listener and read passes: it names the failure (no access, missing index, daily quota, session ended, can't reach the server, other), logs the full error and shows one plain toast. Failed queries reach it from the query cache, dashboard cards sit in an error boundary, and `loadErrorHandling.test.ts` fails on any new listener or read with no error path.
- **Bugs this exposed, each fixed with a test.** (1) The student detail page's linked-parents read and the Edit Parent form's links read were refused for staff because the `student_parents` query did not filter on `institutionId` (the rule needs it). (2) Reading a profile photo that does not exist with `getDoc` is refused for staff, so the Edit Student and Edit Teacher forms and two detail pages errored for anyone without a photo; a filtered query is used instead. (3) The houses delete dialog's student queries had no institution filter, so Delete never enabled. (4) A teacher's Students list was always empty, because the cached `users` query asked for every user, which the rules refuse for teachers; it now asks for students only. (5) A super admin opening "Add new assignment" crashed the page (the sentinel institution `"*"`).
- **Deploy:** `firestore.indexes.json` declares the collection-group index on `audit_log.timestamp` that the super admin's Audit Log ("All institutions") needs; run `npm run firebase:deploy:indexes`. Not confirmed as deployed from the repo.
- Not changed, for a decision: the sidebar offers Teachers and Parents to teachers, whose rules allow students only, so those two pages stay empty for them. *(Decided 2026-10-19: `2773a8c` hides both links from `senior_teacher` and `regular_teacher` with `TEACHER_TEMPORARILY_HIDDEN` in `src/lib/sidebarNav.ts`; the routes and rules are unchanged.)*

### 61. Read cost: sign-in, lists, forms, photos and listeners now reuse what they already read

**Files:** `src/lib/queryPolicies.ts`, `src/lib/postLoginDecision.ts`, `src/hooks/useAllInstitutions.ts`, `src/hooks/useTeachersMeta.ts`, `src/hooks/useMyAttendance.ts`, `src/lib/attendanceRows.ts`, `src/lib/houseMembership.ts`, `src/lib/sharedListener.ts`, `src/lib/sharedSnapshot.ts`, `src/lib/userPhoto.ts`, `src/components/forms/HouseForm.tsx`, `src/lib/AuthContext.tsx`.

- **Measured first.** A scratch build counted every Firestore read for each QA role (login, every sidebar page, add forms, revisits, a reload). Before: admin 427, regular teacher 204, senior teacher 230, student 122, parent 101, super admin 346 billed reads. The QA institution is tiny, so the shape matters more than the totals.
- **Fixed.** The cache windows are named in one file (reference data 10 minutes, people lists 5, live data 60 seconds, counts 5, shared listeners kept open 5) and `queryPolicies.test.ts` fails on a number written anywhere else; sign-in reads the institution, academic years and terms once (25 reads to 19); the super admin's institutions list and dashboard widgets are cached (202 of its 346 reads gone); the Exam, Assignment, Disciplinary, Timetable-slot and Schedule forms take people from the shared cached lists; list-row photos are kept 5 minutes; page listeners are shared, kept open 5 minutes and closed at sign-in and sign-out; the Edit House form shows the shared students list and reads only the students it is about to change when it saves (it read all 16 on every open); My Attendance and Child Attendance read through cached queries (a revisit inside 60 seconds reads nothing).
- **After.** admin 251, regular teacher 109, senior teacher 133, student 91, parent 70, super admin 100.
- **Freshness.** Another person's change can take up to 10 minutes to appear in cached reference data and up to 5 in people lists, by the owner's choice; a person's own saves refresh the affected data at once.
- No rules, indexes or data changes.

### 62. Class head-counts are stored on the class documents; a `hasPhoto` flag skips photo reads

**Files:** `src/lib/classPopulationDelta.ts`, `src/lib/classPopulationWrite.ts`, `src/lib/classPopulationQueries.ts`, `src/hooks/useClassPopulations.ts`, `src/components/RecountClassPopulationsButton.tsx`, `src/lib/createUserAccount.ts`, `src/lib/importStudentsCommit.ts`, `src/lib/deleteUserExecutor.ts`, `src/components/forms/StudentForm.tsx`, `src/components/AccountStatusToggle.tsx`, `scripts/recount-class-populations.mjs`, `scripts/backfill-has-photo.mjs`, `src/lib/__tests__/classPopulationWriters.test.ts`.

- **Problem.** The Classes list ran six `count()` aggregations per class on every cold open (24 reads for 4 classes, about 72 for 12), and the Students and Teachers lists read one photo document per row, even for a person with no photo.
- **Fix.** A class document carries `population { male, female, unspecified }` (active students) and `populationBaseline`; every batch that creates, edits, moves, deactivates or deletes a student, and the class page's Add and Remove student, adds the increments in the same batch, after reading the student's current document (the list row can be minutes old). The Classes list uses the stored counts only for a class that has a baseline and falls back to the six counts for any other, so nothing changes until a class is recounted. `classPopulationWriters.test.ts` fails if a new file writes a student's classes, gender or status without moving the counter. `users/{uid}.hasPhoto` is written with every photo write and the lists skip the photo read when it is `false`.
- **Deploy order.** App first (it reads both ways), then `node scripts/recount-class-populations.mjs --key=<path> --live` for every institution (a dry run is the default; also available as a "Recount students" button on the Classes page for an institution admin), then `node scripts/backfill-has-photo.mjs --key=<path> --live`. Run the recount again after any script that creates or moves students (the seed scripts and `scripts/backfill-student-class-ids.mjs` say so in their headers).
- **Checked live on the QA institution** (recount; create, move, move back and delete a student; a one-row import; the counts followed every step and ended at the start). Rules already allow an institution admin to update class and user documents, so there is no rules change; counters can still be written to any value by an administrator's client, which the recount repairs.

### 63. Every source file is under 600 lines; mock data is dev-only

**Files:** `eslint.config.ts`, `lint/maxLinesAllowList.json`, `src/lib/__tests__/maxLinesAllowList.test.ts`, `src/dev/mock/`, `src/lib/data.ts`, `src/types/`, `src/lib/firebase.ts`, `src/lib/__tests__/mockDataIsDevOnly.test.ts`, `src/lib/__tests__/sourceBytes.test.ts`.

- **Problem.** 18 files were over 600 lines (the largest were the Academic Calendar page at 2,199, the Import page at 1,930 and `lib/data.ts` at 1,596) and mixed data reads, rules and screens, which made them hard to review and to test.
- **Fix.** Each was split by responsibility into `lib/*Logic.ts` (pure rules, unit-tested), `lib/*Save.ts` (writes), hooks and page components, moved verbatim and compared before and after on a built bundle. `eslint .` now fails a TypeScript file over 600 counted lines; the allow-list of exceptions is empty (`{}`). The mock datasets moved to `src/dev/mock` (reachable only in dev, pinned by `mockDataIsDevOnly.test.ts`), the Firestore document types moved out of `lib/firebase.ts` (1,071 lines to 132) into `src/types/`, and `sourceBytes.test.ts` fails on a NUL character or a stray carriage return in `src` (a raw NUL had kept one file binary for git).
- No rules, indexes or deploy steps.

### 64. Events, Announcements and Lessons cannot be created yet; their forms said otherwise

*Updated 2026-10-20: `README.md`, `docs/guides/USER_GUIDE.md` and the README's "Ideal projected completion state" now say the same; the three forms are deleted, not stubbed.*

**Files:** `src/components/forms/NotAvailableYet.tsx`, `src/components/FormModal.tsx`, `src/components/Announcements.tsx`, `src/components/EventCalendar.tsx`, `src/scenes/(dashboard)/list/events/index.tsx`, `list/announcements/index.tsx`, `list/lessons/index.tsx`, `src/lib/formMessages.ts`, `src/components/forms/MissingRecordNotice.tsx`.

- **Problem.** The Add/Edit forms for events, announcements and lessons were complete-looking forms that only `console.log`ged what was typed and closed. Nothing in the app writes those collections, so the three list pages are always empty, and the Home cards read mock arrays that are empty in production. Thirteen other forms also logged and silently returned when asked to update a record with no id.
- **Fix.** The three tables open a short "not available yet" panel (no fields, a Close button); the three list pages say why they are empty; the Home cards say "coming soon". The thirteen forms show "This record has no id, so it can't be updated" through one hook, and a test fails if a `console.log(` comes back into the app. Building the features themselves (a rules-backed events and announcements editor, a timetable lesson list) is separate work and is not started.
- No rules, indexes or deploy steps.

### 65. The Realtime Database rules have no tenant or role check

**Files:** `database.rules.json` (lines 24-25 `files/$institutionId/$blobKey`, 51-53 and 59-61 `usage/.../bytes`), `src/lib/blobStore.ts`.

- **Problem.** Any signed-in user, of any institution and any role, can read `files/<institutionId>/<key>` and write a new blob under another institution's folder (the write rule checks the counters, the file's shape and `uploadedBy == auth.uid`, not whose institution it is), and can set any institution's `usage/.../bytes` and the total to any value up to its cap. Reading needs the blob's key, a random UUID, so guessing is impractical; the writes could fill another institution's quota or make the counters lie.
- **Why it is not fixed here.** Realtime Database rules cannot read Firestore, and the app has no custom claims (role and institution come from the Firestore `users` document), so a per-institution check cannot be written in these rules. It needs custom claims set at sign-in or the planned backend (`docs/backend/BACKEND_ARCHITECTURE_SPEC.md`), where the tenant check can live.
- **Until then.** Total stored bytes are capped at 900 MB in the rules, uploads are limited to 5 MB each, and `scripts/sweep-orphan-blobs.mjs` reconciles the counters. No change to rules or deploy steps in this entry.

### 66. Parents can read every class's lesson notes and assignments, and students every class's lesson notes, in their institution

**Files:** `firestore.rules` (`lessonNoteReadableBy`: the `isParent()` branch and, since the multi-class lesson notes, the student branch, both `&& lessonNoteHasClass(n)`; and the matching assignments rule near line 1450).

- **Problem.** The pages show a parent only their children's classes, but the rule lets a parent read any lesson note or assignment of the institution that has a class. A parent who writes their own query can read other classes' notes.
- **Why it is not fixed here.** Tightening it means checking the parent's linked students' classes in the rule: one or more extra `get()`/`exists()` lookups on `student_parents` and `users` for every read, which are billed reads on the Spark plan, plus a rules deploy and testing with real parent accounts. Not done in this entry; a decision for the owner, ideally together with the backend plan.
- No change to rules or deploy steps in this entry.
- **Students too, for lesson notes (added with the multi-class lesson notes).** A lesson note can be for several classes (`classIds`). A student's query on that list (`array-contains` or `array-contains-any`) is denied against every rule that compares the list with the student's own classes: a rule cannot be proven for a query on a list. This was run on the Firestore emulator (2026-10-20) with `hasAny` both ways, with and without the `classId` fallback, and with `array-contains-any`. So a student may read any lesson note that has a class (the same shape as the parent read); the lesson-notes hook asks for the student's classes only and `isNoteVisibleTo()` (`src/lib/lessonNoteClasses.ts`) keeps what they take. Before this a student could read only the notes of their own classes. A student who writes their own query can now read other classes' notes and, through `lessonNoteReadableBy`, their file documents. Assignments are unchanged (still limited to the student's classes). The tight alternatives (a copy of the note per class, or a separate link document per class) cost more writes and storage and were not chosen.

### 67. Admin scripts: dry-run defaults, safety checks, and when to rotate the spectator passwords

**Files:** `scripts/README.md`, `scripts/backfill-student-class-ids.mjs`, `scripts/remove-orphan-auth-accounts.mjs`, `scripts/removeOrphanAuthLogic.mjs`, `scripts/rotate-spectator-default-passwords.mjs`, `scripts/rotateSpectatorLogic.mjs`.

- **Problem.** The Admin SDK ignores `firestore.rules`, so each script's own checks are the only safety. Seven older scripts write by default (`--dry-run` previews); one new one (`backfill-student-class-ids`) did too. `remove-orphan-auth-accounts` would delete every account if it were pointed at the wrong project or if its read returned nothing.
- **Fix.** `backfill-student-class-ids` is now a dry run unless `--live`, needs a key and prints the project. `remove-orphan-auth-accounts` prints the project, refuses an empty `users` collection, and refuses a run that would remove more than 10 accounts or 20% of all accounts unless `--allow-large`. `rotate-spectator-default-passwords` prints each account's creation time and takes `--created-before=<date-time>`. `scripts/README.md` lists every script with its default.
- **Timing of the spectator rotation.** The app stops giving new spectators the public default password only when this branch is deployed. Spectators created before the deploy still have it; spectators created after it have a password their administrator chose and are also flagged `mustChangePassword` until first sign-in, so the script cannot tell them apart. Run it right after the deploy, or pass `--created-before` with the deploy time.
- **Deploy order for the class-count work.** (1) `backfill-student-class-ids --live` BEFORE the app is deployed: the roster and count queries that read `classIds` exist only in this branch, so a student who has only `classId` would drop out of them (the in-app "Update class lists" button exists only once the new version is live). It is idempotent; run it again right before the deploy if students were created on the old version in between. (2) Deploy the app, then the rules and indexes. (3) `recount-class-populations --live` for each institution (the app keeps the counts current from then on). (4) `backfill-has-photo --live`. (5) `rotate-spectator-default-passwords --live`, or `--created-before=<deploy time>`, right after the deploy.
- No rules or index changes.

### 68. Lesson notes for several classes: a deleted class stays on its notes

**Files:** `src/lib/classDeletion.ts`, `src/lib/lessonNoteClasses.ts`, `src/components/forms/LessonNoteForm.tsx`.

- **What changed.** A lesson note can list several classes (`classIds`, `classNames`, and `classId` = the first; at most 20, enforced in `isValidLessonNote`). Notes from before have `classId` only and are read as one class. Students and parents ask for their classes in groups of 10 (`classId in` plus `classIds array-contains-any`); the new index is `lessonNotes: classIds (array-contains) + updatedAt`.
- **Open.** Deleting a class removes it from its students (`removeClassFromStudents`) but not from lesson notes, so a note keeps a class name and id that no longer exist (the same was true of the single `classId`). Harmless to readers (no student is in that class); the edit form shows it as a ticked "Current class" until the editor unticks it. Names are copied onto the note (`classNames`), so a renamed class keeps its old name on existing notes until they are saved again.
- **Optional later.** A dry-run-by-default script that gives old notes a `classIds` list, so the hook can drop the `classId in` query (a note whose first class is the student's class is currently returned by both queries and read twice).

### 69. Online exam attempts: the clock and the backup

**Files:** `src/lib/examAttemptSession.ts`, `src/lib/examClock.ts`, `src/lib/examAnswerDraft.ts`, `src/hooks/useRunningAttempt.ts`.

- **Clock.** The attempt's deadline is written by the student's browser (the rules check it against `request.time`, not that it was computed correctly), so the browser needs the server's time before the write. It takes it from the Realtime Database's `.info/serverTimeOffset`, which exists only when the single-session database is configured (`SINGLE_SESSION_ENABLED`). Without it the device clock is used with a 60-second margin: a device clock more than about a minute ahead can make a start be refused, and one that is out in either direction makes the countdown and the automatic submit early or late (a submit more than 60 seconds after the deadline is refused, and staff mark the attempt expired). The offset is trusted to a couple of seconds; the deadline is set 2 seconds inside the computed one for that reason.
- **Backup in the browser.** A student's answers are kept in `localStorage` as they are typed, so a refresh loses nothing since the last keystroke. On a shared computer they stay until the attempt is submitted, the account signs out (every path runs `purgeSession`), another account signs in, or 24 hours pass. They are answers to the student's own exam, with no key.
- **Reads.** A student's list reads one attempt and one score per exam that is open or ended in the last 14 days (cached five minutes); a parent reads one score per child per such exam. A school-wide round of list visits costs up to about two reads per student per recent exam.
- No rules or index changes.

### 70. Online exam results: whose name is on a results entry, and what a screen reads

**Files:** `src/lib/examGrading.ts`, `src/lib/examGradingLogic.ts`, `src/lib/examResultsData.ts`, `firestore.rules` (`results`, `isValidExamGrade`).

- **Whose entry it is.** A released score is copied into `results` (id `exam_{examId}_{studentUid}`) by whichever staff member is on the screen, and the create rule requires the entry's `teacherId` to be that person. The update rule lets a regular teacher change only an entry they wrote, so if an administrator or a senior teacher first writes an entry, the exam's own regular teacher can no longer update it (a later re-grade or override shows an error for those students). Administrators and the department's senior teachers can always update it. Updates change only the score fields, so the owner never changes. A fix would be a rule that lets the exam's teacher update `results` with `examId` set, which was not done to keep the existing `results` rule untouched.
- **Reads.** The results screen reads the grades (one each), the extra times, one aggregate count of the attempts, and the attempts themselves only while some are ungraded or a grade is out of date; the class roster is cached five minutes. A class of 30 costs about 35 reads to open once graded, about 65 while grading, plus about four reads per student at the exam itself for the extra-time check. Question difficulty reads the attempts on request.
- **Grading in a browser.** Grades are computed by whichever staff browser opens the screen, so the score depends on that browser's copy of the key, and a staff member with a stale tab could grade on an old key (the grade records the key revision, and *Re-grade needed* shows when it is behind). Moving this to a server is the planned backend work in the spec.
- No index changes. The grade rule gained optional `tabSwitches`, `submittedAt`, `submitReason` and string length caps; the exam rules were deployed on 2026-10-21.

### 71. Exam import from Word and PDF: what the readers cannot do

**Files:** `src/lib/examDocumentText.ts`, `docxText.ts`, `pdfLines.ts`, `examPdf.ts`, `examImportRead.ts`.

- **Found by layout, not meaning.** The readers find a question by its typed or automatic number, an option by its letter and the answer by an `Answer:` line, so a file laid out differently (answers marked by bold or colour, options without letters, questions in a table) imports as a different set of questions or none. Everything lands in the builder unsaved with warnings, and the spreadsheet template remains the most reliable route.
- **Word.** Only `.docx` is read (an old `.doc` must be saved as `.docx`). Tables, pictures, text boxes, headers, footnotes and text deleted with tracked changes are ignored; the first three are reported. Numbering defined only in a paragraph style (not on the paragraph) is not followed. Bullets are not options.
- **PDF.** Text only: a scan or photo is refused (no OCR). Lines are rebuilt from where each piece of text sits, so a page in columns, or a table, can read in a different order than it looks; a password-protected file is refused; at most 60 pages are read.
- **Weight.** pdf.js and its worker are separate files loaded only when a PDF is chosen (about 0.5 MB and 1.3 MB; 147 KB and 392 KB gzipped); the zip library is a 14 KB chunk the report-card pages already use. The legacy pdf.js build is used for older browsers; it is larger than the modern one. `pdfjs-dist` also lists optional native canvas packages (Node only) in the lockfile; nothing from them reaches the browser.
- No rules or index changes.

### 72. Deleting online exams: what the cascade does and does not cover

**Files:** `src/lib/examDelete.ts`, `examDeleteLogic.ts`, `studentExamRecords.ts`, `deleteUserData.ts`, `deleteUserExecutor.ts`, `src/components/exam/ExamDeleteNotice.tsx`, `scripts/teardown-bulk-institution.mjs`, `scripts/count-seed-institution.mjs`.

- **Client-side and not atomic.** Firestore does not cascade, so an administrator's browser deletes the questions, the key and every attempt, grade and extra-time document in batches of up to 450 and then the exam in a last batch. If it stops part-way the exam is still listed (its subcollections are partly gone) and Delete finishes it. A close of the tab between the batches is the same. Reads: three counts and the in-progress attempts to open the dialog, then every attempt, grade and extra-time document once more to delete them (about three reads per student).
- **"Students are sitting" is advisory.** The refusal uses the device clock and each attempt's stored deadline (plus the 60-second grace); a rule cannot see whether someone is mid-save. A student who starts in the moment between the check and the deletes, or an administrator whose device clock is badly wrong, can still delete a live exam; the student's next save then fails and their answers since the last checkpoint are lost. Abandoned in-progress attempts past the deadline do not block.
- **The results stay.** The `results` entries an exam produced (`exam_{examId}_{studentUid}`) are the academic record and are not deleted with it; they keep the `examId` of an exam that no longer exists.
- **Exams outlive their class and subject.** Deleting a class or a subject does not touch its exams (as before). Students no longer see an exam whose class is gone, and staff still see it in the Exams list until an administrator deletes it.
- **Deleting a student** removes the attempt, score and extra-time documents they have in the online exams of the classes they are in *now* (equality filters on `classId` and `online`, one read per exam found and one per document). Exams of a class they have since left are not found; reaching them would need a collection-group rule and index.
- **Scripts.** Teardown reads the subcollections only of an exam marked `online`, so the bulk seed's schedule-only exams cost nothing extra. The count script's collection-group range count may need a collection-group index; without it, it counts per online exam, and in `--verify` it cannot see leftovers under an exam document that is already gone (it says so).
- No rules or index changes.

### 73. Online exams: limits that remain after the pre-PR review

**Files:** `firestore.rules` (exam attempts, grades, results), `src/hooks/useRunningAttempt.ts`, `src/scenes/(dashboard)/list/exams/index.tsx`, `docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md` §9 and §13.

- **Free-tier ceiling.** About 8 to 9 writes and about 25 reads per student per exam (rule lookups included). One school day allows roughly 2,200 attempts by writes (20,000) and about 2,000 by reads (50,000), before anything else in the app uses them, so a school of 1,250 students sitting three exams in one day does not fit: stagger the sittings over days, or use the Blaze plan. When the daily quota runs out a final submit can be refused after the deadline plus 60 seconds and is lost (the attempt is then graded from its last save); the student is told to keep the tab open and try again.
- **Staff keep a listener on every exam of the institution** (`exams` list page), costing one read per exam on each visit and per change while it is open (kept five minutes after leaving). Only students and parents read just their classes' exams.
- **Answers and flags are not size-bounded per entry.** The rules cap the number of answers and flags (100) but cannot loop over their values, so a student can write an attempt document of up to the 1 MiB document limit; 1,250 of them on one exam would be about 1.2 GiB, over the free plan's 1 GiB of storage. Only the student's own document is affected.
- **`closed` to `finalized` can happen at any time** in the rules; the "attempts still running" blockers are computed in the staff browser. Finalize deletes the attempts, so a wrong answer key found later cannot be re-graded.
- **One attempt open in two tabs:** the last checkpoint wins; there is no lock or merge. The activity log is the last checkpoint's too; entries from the other tab are merged in only when an attempt is reopened (the local backup and the server's copy are merged by union), so nothing is lost on a reload, but two live tabs do not see each other's log (#77).
- **The exam clock needs the single-session database** (`SINGLE_SESSION_ENABLED`) for a trustworthy offset (#69); that database allows 100 simultaneous connections on the free plan, one per signed-in tab, so a whole-school sitting cannot hold them all (the lock then fails open and the device clock is used with a 60-second margin).
- **Reading the paper needs an attempt** (rule), so a failed read of the questions right after a start leaves the clock running; the app tries three times and then asks the student to reload the page.
- **The Exams daily budget (10,000 writes, 10,000 reads) is a planning guard at publish, not a meter.** It sums the formula's estimates (about 25 reads and 8 to 9 writes per student) for the online, non-draft exams with the same `date` and refuses a teacher or asks an administrator to confirm; it cannot see the rest of the app's traffic, does not count a class whose students were never counted, and Firestore's own day restarts at midnight Pacific time, not on the school's date. An administrator can publish anyway, and the check itself reads the day's exams (one query, no index) and the classes' students.
- **Lesson notes (#66)** let any student of the institution read any note that has a class, and its file documents (the narrowing to their own classes is in the query and the page, because a rule on a list of classes cannot serve the list query). Documented decision, called out in the pull request.
- **`e2e/11-users-lockdown.spec.ts`, first test** ("an admin deactivates a teacher…") fails at the step after sign-out (`page.goto('/login')` is interrupted by another navigation); not investigated, unrelated to the exam code. After every e2e run the last QA administrator and student session locks stay in the Realtime Database and block the next run until they are cleared.
- No index changes (the one new index of the branch is for lesson notes, #66).

---

### 74. Question pictures: limits that remain

**Files:** `firestore.rules` (`content/images_{n}`, `imagePacks`, `imageBytes`), `src/lib/examImage.ts`, `src/lib/examImagePack.ts`, `src/lib/examContent.ts`, `src/hooks/useExamPictures.ts`, `docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md`

- **The size of a picture is enforced by the browser, not the rules.** The rules check a pack's shape (a revision, the server time, 1 to 100 pictures) but cannot look inside a data URL, so a staff member using their own tools could write a pack of up to the 1 MiB document limit or a picture that is not an image. The app only ever shows a picture through an `<img>` (the CSP allows `data:`), so a bad picture is a broken image, not a script; the exam's staff are trusted to write it.
- **The megabytes matter more than the reads.** A student who opens the paper downloads every pack (up to about 45 MB at the picture cap of 450 KB and 100 pictures) against the Spark plan's 10 GiB a month of Firestore downloads. The publish guard adds a third daily line of 2,048 MiB beside the 10,000 reads and 10,000 writes, but, like them, it is a planning estimate from the exam document (`imagePacks`, `imageBytes`) and not a meter. A refresh re-reads the packs, which the estimate counts once.
- **A picture is readable by anyone who may read the questions**: the exam's staff, administrators and the spectator at any time, and a student only with their own attempt in progress. Nothing stops a student from saving the picture while the attempt is in progress (the images are not draggable, but a screenshot or "save image" is possible).
- **Formats.** PNG, JPEG and WebP only; GIF, animated PNG or WebP, SVG, HEIC and EMF/WMF are refused. A picture is kept exactly only when it fits the cap (450 KB, 600,000 characters); otherwise it is reduced (WebP or JPEG, quality stepped down, resized past 1600 px) and marked so in the builder. An opaque 8-bit sRGB picture can be re-encoded as an exact PNG; anything else that is too large is reduced.
- **A failed save can leave a pack that no question uses.** The next save that has packs to plan sweeps them, and Delete removes every document of `content`; until then they are harmless but count toward storage. The builder reads the packs only when the exam says it has pictures, so a leftover pack of an exam that never had one stays until the exam is deleted.
- **Two people saving the same exam** are caught by the revisions of the questions and the key, read before any pack is written; a save that races in between is rare and the loser is asked to reload. There is no per-pack revision check.
- The **Tidy images** action that repacks to the fewest packs is not built.
- **Index.** The field override for `content.images` is optional to deploy; without it each picture's data is also indexed and counts toward storage twice.

---

### 75. Word and PDF picture import: limits that remain

**Files:** `src/lib/docxText.ts`, `src/lib/examDocumentText.ts`, `src/lib/examImportReview.ts`, `src/components/exam/builder/ImportImageReview.tsx`, `docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md` §8.1 and §8.4

- **Only `w:drawing` pictures are read.** A picture stored as VML (`w:pict` with `v:imagedata`, which Word uses in compatibility mode and for some files converted from `.doc`) is counted as a shape and ignored, with the note "N text boxes or shapes were ignored", so it looks like a missing picture. Saving the file again as a current `.docx` in Word normally turns it into a drawing. A grouped drawing with several pictures gives only its first picture.
- **Text boxes, shapes, charts and SmartArt are ignored**, and so is any picture inside a table or a text box (a note counts them). A figure drawn with shapes cannot be imported; paste it into the paper as a picture.
- **One picture for a question.** A second picture on a question is marked *Check* and the review step lets only one be used. Pictures on options are not supported.
- **Formats.** PNG, JPEG and WebP are read; GIF, SVG, HEIC, EMF and WMF are refused with a message (EMF and WMF cannot be shown by a browser). A crop made in Word is not applied: the whole original is imported.
- **The placing is a guess from the order of the paragraphs.** A picture after the options or the answer, a second picture, or one above question 1 is marked *Check* or *No question* for the teacher to decide; a picture above a question that follows the previous question's options is offered to the previous question. Nothing is placed without the teacher pressing through the review step.
- **Word's description is carried as the alt text**, and Word's automatic descriptions ("A picture containing text") are often poor; the teacher can edit them in the builder.
- **Read in the browser.** A Word file may be 25 MB (a picture 10 MB, all pictures 64 MB, 100 pictures); a large paper uses browser memory while its pictures are checked one at a time. Chrome and Edge are the tested browsers.
- **PDF pictures are the ones the page paints.** A figure drawn with lines and shapes, a one-colour stencil image and anything inside a scan are not found; a JPEG in a PDF is decoded and stored as a PNG (larger), then the usual size cap and reduction apply. The place of a picture is its position on the page among the text lines, so a paper in columns or with floating figures can place a picture on the wrong question (marked *Check* or *No question* for the teacher). A picture repeated on every page, or under 24 pixels or 20 points, is dropped as decoration, which can drop a real figure that is genuinely on every page. Limits: 100 pictures, 16 megapixels each, 120 megapixels in all, 60 pages.
- **The snapshot tool needs a browser canvas** (the page is drawn by pdf.js, with the page's fonts replaced by system fonts where they are not embedded), so a figure may look slightly different from the print; a box is cropped from the drawn page at up to 3,000 pixels a side, then the usual size cap and reduction apply; dragging needs a pointer or finger, and the percentage fields are the way without one.
- **Google Forms printouts are read by text patterns** (an oval line and a points figure; a date-and-time header, a web address or this page's `n/N` footer, a repeated title), not by position or by looking at the paper, and were written from a description of the reference papers: a printout in another language or with other wording is not recognised and is read by the documented layout (which finds nothing in it). An option that wraps onto a second line is read as two options; a stem whose text ends with a points-like figure or an option that looks like `N. text … 1 point` can be misread; a question without an oval line is read as a question with no options. The file has no answers, so the key is always entered by hand in the import's key step or the builder.
- **Markdown pictures are only base64 data addresses** (`![alt](data:image/png;base64,...)`). An image with a web address is ignored with a note (the page's policy would not load it and a paper should not depend on another server), HTML `<img>` tags (dropped with the other tags) and reference-style images (`![alt][ref]`) are not read, and a data address that is not base64 cannot be read. A Markdown file may be 25 MB and its pictures are decoded in the browser's memory (10 MB a picture, 64 MB in all, 100 pictures).

---

### 76. Supervised and unsupervised exams: limits that remain

**Files:** `src/hooks/useQuestionDeterrents.ts`, `src/lib/examFullscreen.ts`, `src/components/exam/take/ExamWatermark.tsx`, `src/lib/examTakeLogic.ts`, `firestore.rules` (`integrity`, `forwardOnly`), `docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md` §9

- **Everything runs in the student's browser**, so everything here can be bypassed by a student who controls it. The deterrents (no copy, cut, context menu, drag or selection; the questions do not print) stop a casual copy only; a screenshot, a photograph of the screen, developer tools, view-source or a second device defeat them. They are said to the student on the start screen.
- **The watermark can be removed with developer tools** and does not stop a photograph; it only makes a leaked photograph traceable to the account. It shows the student's name and the first six characters of the account id, and it is a faint overlay, not part of the picture.
- **Fullscreen cannot be forced.** A browser allows the request only from a click and may refuse; an iPhone's Safari offers none for a page (recorded once as "not available", never as an exit). A student who reloads must press Return to fullscreen. Leaving fullscreen is recorded, never blocked.
- **Forward only is client-side.** The server keeps no position: a reload reopens on the question after the last one answered, so a question the student had left is not opened again, except the last question, which a student who answered it and reloads sees once more. Someone using their own tools can navigate freely. The answers they gave stay as saved.
- **The presets change what is recorded and shown, not what the server accepts**: the rules check that `integrity` is one of the two values and that `forwardOnly` goes only with unsupervised, nothing more. An exam without the fields is supervised.
- **The Review mark is a prompt to look**, not a verdict; the stricter Unsupervised thresholds (3 leaves an hour or 2% of the time away) are proposals to be settled with real sittings.

---

### 77. The exam activity log: limits that remain

**Files:** `src/lib/examActivity.ts`, `src/hooks/useActivityLog.ts`, `firestore.rules` (attempt `events`, `answeredAt`; grade `integrity`), `docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md` §9.3 to §9.7

- **The log is written by the student's browser, so it is evidence, not proof.** A student who uses their own sign-in token can write a shorter or empty log, or none. The rules can only make it harder: `events` may never become shorter than it was, is capped at 200 entries, `answeredAt` at 100 keys, and `tabSwitches` may never go down. An empty log does not show that nothing happened, and the report says so.
- **The rules do not look inside the entries** (a rule cannot loop over a list): the kind, the time and the seconds of an entry are not checked, so a client can write odd values. Readers skip an entry whose kind they do not know instead of failing, and the summary on the grade is checked only for its shape (its figures are integers of at least 0, at most 50 timeline entries).
- **A browser cannot tell a new tab from a switched tab**, cannot see where the student went, and sees a phone call, a notification, a dropped connection or a laptop update as a leave; a side-by-side window, a second device, a helper in the room and a background tab that is never looked at are invisible. The report says "left the exam page", never "opened a tab", and its Review mark is a reason to look.
- **The summary on the grade is readable by the student and a linked parent** with a direct read of their released score (the screens show them nothing). It is a summary and at most 50 timed entries; a staff-only document would cost one more write per student per exam. The privacy notice says so.
- **Not built:** the extra checkpoint after a long leave is deliberately off (to spend no extra write), so a student who then closes the page leaves less evidence than one who stays; the similarity hint for shared wrong answers and the optional detection of another tab of this app are deferred, each to be specified before any code.
- **The Review limits are proposals** (supervised 6 leaves an hour or 5% of the time away, unsupervised 3 an hour or 2%, and a Review by leaves needs more than 2 leaves whatever the length) to be tuned with real sittings.

---

### 78. Online exams on a phone and the unsaved-changes guard: limits that remain

**Files:** `src/lib/examCarousel.ts`, `src/hooks/useSwipe.ts`, `src/hooks/useRunningAttempt.ts`, `src/components/NavigationGuardProvider.tsx`, `src/lib/navigationGuard*.ts`, `src/components/exam/take/`, `src/components/exam/builder/`, `src/components/exam/results/`, `src/index.css`, `docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md` §4.3, §4.5 and §4.7

- **Swipe, forward only and the Submit gate are client-side.** A swipe is only a way to press Next or Previous, and Submit is off until every question is answered; the rules check neither. A student using their own sign-in token can write an attempt with unanswered questions, and the automatic submit at time-up never needed them all. Nothing here is a grading or security rule.
- **Preview as student shows the saved version.** The preview reads the exam's saved questions, not the builder's unsaved edits; the builder asks "Leave without saving?" before going to it for this reason.
- **The unsaved-changes guard has limits.** The app uses `BrowserRouter`, which cannot block a navigation, so the guard is a click listener on the page's links plus one extra history entry. It does not stop leaving by code (the inactivity sign-out, redirects), the browser's Back and forward menus beyond the one entry, Safari's swipe-back gesture, or a phone's Back key more reliably than the entry allows; closing the tab asks through the browser's own prompt. Chrome skips a history entry added without a click or key press since, so a person who presses Back at once may leave without being asked. The extra entry is stepped back over when the changes are saved; a Back pressed in the instant between a save and the next edit can ask a question that is not needed.
- **The sticky bars need `:has()`.** The clock, the buttons and the builder's strip stay in view by scoped CSS keyed on `:has()` (Chrome 105+, Safari 15.4+, Firefox 121+). A browser without it shows the bars in the page, unstuck, and everything still works.
- **Safe-area insets are not used.** `index.html` does not set `viewport-fit=cover`, so `env(safe-area-inset-*)` is 0 on a notched iPhone and the page relies on the browser keeping it inside the safe area; the bottom sheet's own padding for the home bar has no effect until the tag is added (and then the bars need checking on a real iPhone).
- **The tablet and the desktop layouts are chosen by the width of the window**, with a tablet held upright getting the phone's carousel. A window resized across the breakpoint during an attempt changes layout without losing answers (the state is in the hook), and the copy and drag deterrents follow the question area.
- **Real devices are a manual check.** The layout, the 44 px targets, the swipe and the sheets are tested with a phone-sized Chromium and synthetic touch events; a real finger and edge swipe, the phone keyboard in the builder, iOS Safari and Android Chrome were not run.

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
