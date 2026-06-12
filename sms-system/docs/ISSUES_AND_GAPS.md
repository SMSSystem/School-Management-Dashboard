# Issues & Gaps — School Management Dashboard

> **Generated:** 2026-05-27 · **Last updated:** 2026-06-12 (added issue #35)
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

### 2. Single detail pages (Teacher, Student) contain fully hardcoded content
**Files:** `src/scenes/(dashboard)/list/students/[id]/index.tsx`, `src/scenes/(dashboard)/list/teachers/[id]/index.tsx`

Student name ("Cameron Moran"), grade, attendance percentage, class, lesson count, contact details, and bio are all static strings in JSX. The route receives an `id` param but it is never read.

**Fix:** Read the `:id` param via `useParams`, query the matching Firestore document, and render real data.

---

### 3. Super Admin KPI cards display hardcoded numbers
**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

The four KPI cards ("36" institutions, "1,280" total users, "31" active, "4" super admins) are static strings defined in the `kpiCards` array at the top of the file.

**Fix:** Derive these values from live Firestore aggregate queries or Firestore count() calls once the data layer is ready.

---

### 4. Calendar events are dated to August 2024
**File:** `src/lib/data.ts` (line 917 onwards)

All entries in `calendarEvents` use `new Date(2024, 7, ...)` (month index 7 = August 2024). They will never appear on the current-month view of the Big Calendar component. A comment in the file acknowledges this:

```ts
// YOU SHOULD CHANGE THE DATES OF THE EVENTS TO THE CURRENT DATE TO SEE THE EVENTS ON THE CALENDAR
```

**Fix:** Replace hardcoded dates with dates relative to `new Date()`, or — better — source calendar events from Firestore.

---

## 🔴 Collections and Pages Not Yet Built

---

### 5. Attendance page not built

**File:** Route `/list/attendance` — no page component registered

The attendance list page and the mark-attendance form do not exist. The route is unregistered in `App.tsx`. The Firestore security rules for the `attendance` collection are fully implemented and ready.

The `attendance` collection requires: `institutionId`, `studentId`, `classId`, `departmentId`, `date`, `status` (`present` / `absent` / `late`).

**Depends on:** D-2 (student records in Firestore), D-4 (class records with `termId`).

---

### 6. Messages page not built

**File:** Route `/list/messages` — no page component registered

The messages list page and any send/receive UI do not exist. The route is unregistered in `App.tsx`.

**Blocks:** All messaging work.

**Depends on:** Resolution of **Open Question #1** (in-app vs. third-party) — see [Issue #32](#32-messaging-architecture-undecided).

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

### 9. Student forms missing `dateOfBirth` and `enrolmentId` fields

**File:** `src/components/forms/StudentForm.tsx`

The role spec (§1.6) and the `students` Firestore collection schema both include `dateOfBirth` and `enrolmentId` as student profile fields. Neither field is present in the current form or written to Firestore.

**Depends on:** D-2 (student forms wired to Firestore).

---

## 🟡 Missing Loading and Error States

---

### 10. List pages have no loading indicators or error boundaries

**Files:** All pages under `src/scenes/(dashboard)/list/`

When Firestore queries replace the mock data arrays, list pages will show a blank table during the initial fetch and have no recovery path if a query fails. There are no loading skeletons, spinners, or `<ErrorBoundary>` wrappers on any of the 11 list pages.

The super_admin homepage widgets (InstitutionsTable, RecentSignups, AlertsFeed) handle loading and error states correctly and are the pattern to follow.

**Fix:** Add per-page `isLoading` and `error` state variables; render a loading skeleton while fetching and an inline error message with a retry option on failure.

---

## 🟡 Profile and Settings Gaps

---

### 11. WriteBatch audit log writes not wired to admin form actions

**Files:** `src/components/forms/TeacherForm.tsx`, `src/components/forms/StudentForm.tsx`, and all other admin-action forms

The audit log infrastructure is fully built: the `institutions/{id}/audit_log` subcollection has Firestore rules, the `AuditLogPage` renders entries, and the profile page already writes audit events via `WriteBatch`. However, admin actions taken through CRUD forms (creating a teacher, deactivating a student, etc.) do not yet write a corresponding audit log entry.

**Fix:** Each `onSubmit` handler in admin forms should use a `WriteBatch` to write the entity document and an `audit_log` entry atomically. See [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md) for the `audit_log` subcollection schema.

**Depends on:** D-1 (forms must be wired to Firestore before audit writes can be added).

---

### 12. Settings page is a stub

**File:** `src/scenes/(dashboard)/settings/index.tsx`

The settings page renders placeholder cards and is intentionally hidden from the sidebar for all roles. Five of the planned cards have been recommended for removal before the page is re-exposed.

**Fix:** Implement the settings page per [`SETTINGS_PAGE_ANALYSIS.md`](./SETTINGS_PAGE_ANALYSIS.md), then re-add the sidebar link for all roles.

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

### 18. `InstitutionsTable` fetches all institution documents in live mode

**File:** `src/components/superadmin/InstitutionsTable.tsx`

In live mode, `InstitutionsTable` calls `getDocs(collection(db, 'institutions'))` which returns every institution document — one Firestore read per document. Read cost scales linearly with institution count (N reads per page load). See the [Free-Tier Cost Analysis](FEATURE_FLAG_DATA_MODE.md#free-tier-cost-analysis) in `FEATURE_FLAG_DATA_MODE.md` for projected budget impact at scale.

**Fix:** Replace `getDocs` with cursor-based pagination using `startAfter` + `limit(25)`. Implement forward/back navigation in `InstitutionsTable` with Firestore document cursors. Client-side search filtering will need to move server-side or be scoped to the paginated result set.

**Note:** Low priority while the institution count is in the low tens to low hundreds. Should be addressed before the institution count exceeds ~200.

---

### 19. No dedicated `platform_alerts` collection — `AlertsFeed` derives from `audit_log`

**File:** `src/components/superadmin/AlertsFeed.tsx`

In live mode, `AlertsFeed` queries the `audit_log` collectionGroup and maps recent activity log entries to alerts. All current `ActivityEventType` values map to `"info"` severity. The high/medium severity alert behaviours visible in mock mode (`login_anomaly`, `brute_force_attempt`, etc.) have no corresponding real event types and cannot be triggered by real user activity — the mock alert feed is aspirational.

**Fix:** Define a dedicated `platform_alerts` collection with its own Firestore schema and security rules. Write targeted alert documents from Cloud Functions when specific conditions are detected (e.g., repeated sign-in failures, suspicious access patterns). Update `AlertsFeed` to query this collection directly in live mode.

**Depends on:** Decision on which alert conditions to monitor and the write-trigger mechanism (Cloud Function or scheduled job).

---

### 20. Audit log filter supports only a single institution at a time

**File:** `src/scenes/(dashboard)/admin/audit-log/index.tsx`

The institution filter dropdown on `/admin/audit-log` supports selecting one institution or "All institutions". There is no way to compare audit logs across a subset of institutions without switching between them individually.

**Fix:** Add a multi-select UI (checkboxes or a multi-select dropdown) and translate the selection to a Firestore `in` filter (supports up to 10 values) or parallel queries merged client-side for larger sets.

---

### 21. No cursor-based pagination on `/admin/audit-log`

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

---

### 24. Firestore security rules call `get()` on every evaluation — read cost at scale

**File:** `sms-system/docs/firebase-rules.md`, Firebase Console → Firestore Security Rules

Helper functions `me()`, `myRole()`, and `myInstitutionId()` each call `get(...)` to read the requesting user's `users/{uid}` document. Each `get()` costs one Firestore read per rule evaluation. For low-traffic apps this is acceptable; at scale, these extra reads accumulate against the daily quota.

**Fix:** Store `role` and `institutionId` as Firebase Auth custom claims via `setCustomUserClaims` in a Cloud Function triggered on user creation and role changes. Replace `get(...)` calls in security rules with `request.auth.token.role` and `request.auth.token.institutionId` — no Firestore reads required during rule evaluation.

---

### 35. `regular_teacher` has no read access to `generalAttendance` — missing route guard

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

---

### 25. No CSV export for audit log entries

**File:** `src/scenes/(dashboard)/admin/audit-log/index.tsx`

The audit log page has no export mechanism. Administrators cannot extract audit data for compliance reporting, external analysis, or archiving without manual copy-paste.

**Fix:** Add an "Export CSV" button that serializes the current `auditEntries` state to a CSV string and triggers a browser download via a `Blob` URL. For a larger export that exceeds the `limit(50)` page size, fetch all matching documents first before serializing.

---

### 26. `supervisor` field in `ClassForm` should be a live teacher dropdown

**File:** `src/components/forms/ClassForm.tsx`

The `supervisor` field is currently a free-text input. The `teacher_classes` junction collection stores the authoritative teacher-class link; `supervisor` on the class document is a denormalized display name only. In live mode this field should become a searchable dropdown populated from teachers in the institution filtered by `institutionId`.

**Fix:** Replace the `supervisor` text input with a `<select>` populated from a Firestore query on `teachers` filtered by `institutionId` when `DATA_MODE === 'live'`.

**Depends on:** D-1 (teacher data in Firestore).

---

### 27. `FormModal` has no accessibility attributes

**File:** `src/components/FormModal.tsx`

The modal renders without `role="dialog"`, `aria-modal="true"`, a focus trap, or an Escape key close handler. Screen readers will not announce it as a dialog, and keyboard users cannot exit without a mouse click.

**Fix:** Add `role="dialog"` and `aria-modal="true"` to the modal container; implement a focus trap cycling between the first and last focusable elements; add a `useEffect` that calls the close handler when the Escape key is pressed.

Deferred for post-MVP polish.

---

### 28. `/create-user` does not write `students` or `parents` collection documents ⚠️ Partially Resolved

**File:** `src/components/forms/AdminCreateUserForm.tsx`

When creating a user with `role === 'student'` or `role === 'parent'`, the form only writes to `users/{uid}` (always) and `teachers/{uid}` (for teacher roles). No corresponding document is written to the `students` or `parents` collections. Whether those collections require a per-user document for role-specific fields (e.g., grade and class for students, linked children for parents) is unresolved pending data model decisions.

**Fix:** Determine the required fields for `students` and `parents` collection documents, then extend the batch write in `AdminCreateUserForm.tsx` to include them.

**Depends on:** D-2 (student data model), D-3 (parent data model).

> **Updated 2026-06-01 (partial)** — The `student` branch is resolved: `AdminCreateUserForm` now writes a `students/{uid}` document (fields: `uid`, `institutionId`, `createdAt`, `createdBy`) within the same `writeBatch` as `users/{uid}`. The `parent` branch remains outstanding — no `parents/{uid}` document is written when `role === 'parent'`. This should be addressed when the parent data model is finalised (D-3).

---

### 29. `Announcement` TypeScript type missing `description` field ⏸ Not completed

**Files:** `src/scenes/(dashboard)/list/announcements/index.tsx`, `src/components/forms/AnnouncementForm.tsx`

`AnnouncementForm` includes a `description` textarea (optional, max 2000 chars). The local `Announcement` type in `announcements/index.tsx` declares only `{ id, title, class, date }` — `description` is absent. When the data layer is connected, `description` will also need to be added to any Firestore type definition (e.g., `AnnouncementDocument` in `firebase.ts` if defined).

**Status: Not completed** — `description` has not been added to the `Announcement` type or any Firestore type definition.

**Fix:** Add `description?: string` to the `Announcement` type in `announcements/index.tsx`. When a Firestore `AnnouncementDocument` type is defined in `firebase.ts`, include `description` there as well.

---

### 30. ClassForm field coverage after form system refactor ⚠️ Partially Resolved

**Files:** `src/components/forms/ClassForm.tsx`, `src/scenes/(dashboard)/list/classes/index.tsx`

`ClassForm.tsx` was built as part of the form system refactor and writes to Firestore. The intended class document schema requires `termId`, `room`, `schedule`, and `enrolledStudentIds[]` — fields that were absent from the original mock data. It is unclear whether `ClassForm` now covers all required fields or whether these schema gaps were addressed.

> **Updated 2026-06-01** — `ClassForm` has been read. The form writes the following fields to Firestore: `name`, `capacity`, `grade`, `supervisor` (free-text, see Issue #26), `termId`, and `institutionId`. The `termId` field is populated from a dropdown backed by `termsData`. The `room`, `schedule`, and `enrolledStudentIds[]` fields from the spec schema are absent from the form — no inputs exist for them and they are not written to Firestore. `room` and `schedule` are minor profile fields; `enrolledStudentIds[]` is the higher-priority gap, as it is required for student/parent-scoped timetable queries in Issue #33 (Phase 2 BigCalendar integration). Update `PROJECT_SPEC_AND_ANALYSIS.md §1.9` and `§3.2` to reflect the current partial coverage when the class data model is finalised.

---

### 31. Parent–student linking UI completeness ⚠️ Partially Resolved

**Files:** `src/components/forms/ParentForm.tsx`

`ParentForm` includes a "Linked Students" checkbox list that writes junction documents to `student_parents` on parent create/update. Build backlog item D-6 ("Build parent–student linking UI") was scoped as "creates/deletes `student_parents` junction documents." It is unclear whether the checkbox list in `ParentForm` fully satisfies D-6, or whether a standalone link-management page (add/remove student links independently of editing the parent record) is still needed.

> **Updated 2026-06-01** — `ParentForm` has been read. The update path is functional: on submit it writes to `parents/{uid}` (phone, address) and creates `student_parents/{uid}_{studentId}` junction documents for every checked student via `writeBatch`. Existing links are loaded on mount via `getDocs`. Three known limitations remain:
>
> 1. **Create path is a stub** — the form guards on `uid` from `data?.uid`; without a pre-existing UID (i.e., on the create path) the handler logs a warning and returns without writing. Parent creation goes through the `/create-user` flow; the form's create path is effectively unused.
> 2. **Student list uses mock data** — the checkbox list is populated from `studentsData` (static mock array), not a live Firestore query. In live mode the list will not reflect actual enrolled students.
> 3. **Link removal not implemented** — unchecking a student does not delete the existing `student_parents` junction document. Only additive writes are performed.
>
> D-6 is partially satisfied for the update path. A standalone link-management page (add/remove independently of editing the parent record) is not yet required for MVP, but the student list population and link-removal gaps should be addressed when the parent data model is fully connected to live Firestore.

---

## 🟡 Open Questions Blocking Implementation

This open question is unresolved and directly gates significant feature work. It should be answered before the corresponding backlog items are started.

---

### 32. Messaging architecture undecided

**Open Question #1:** Should messaging be in-app (requires a Firestore `messages` collection, Firestore rules, real-time listeners, and a full list/compose UI) or third-party (email via e.g. SendGrid, SMS via e.g. Twilio — requires a Cloud Function intermediary and no in-app storage)?

**Blocks:** M-1 (architecture decision), M-2 (full messaging feature), and the `/list/messages` route.

---

## 🟡 Schedule Generation — Phase 2 / Deferred

---

### 33. Phase 2 — BigCalendar integration

**Files:** Teacher, student, and parent dashboard pages; `src/lib/data.ts` (`calendarEvents`)

The existing `BigCalendar` components on teacher, student, and parent dashboards display hardcoded August 2024 events (see Issue #4). Once `timetable_slots` is live and populated, these calendars can be wired to real schedule data, resolving Issue #4 as a side effect.

**What Phase 2 requires:**

- Active term resolution helper (query `terms` for the institution, return the document where `startDate ≤ today ≤ endDate`)
- Role-scoped slot queries (admin: all slots; senior/regular teacher: slots where `teacherId == uid`; student: slots for enrolled classes; parent: same as student for each linked child)
- Occurrence expansion: for each slot, compute `{ title, start, end }` events for every matching weekday within the term date range

**Depends on:** S-5 (TermDocument `startDate`/`endDate` field verification — ✅ resolved); Issue #30 (`enrolledStudentIds` for student/parent scoping).

**Deferred:** Phase 2.

---

### 34. Role-level schedule delegation (Option A) — deferred

**File:** `src/lib/permissions.ts`

Currently, schedule-generation access for `senior_teacher` users is granted per-user via the `canGenerateSchedule` flag on their `users/{uid}` document, toggled by `institution_admin` via the Manage Access panel. A future option is to grant access to **all** `senior_teacher` users by role, without requiring per-user toggling.

**Fix (single-line change):** In `permissions.ts`, add `|| role === 'senior_teacher'` to the second condition of `canGenerateSchedule()`. No data model changes or Firestore rule changes are required.

**Deferred:** Post-MVP — per-user delegation is sufficient for Phase 1.

---

_End of Issues & Gaps report._
