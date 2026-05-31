# Issues & Gaps — School Management Dashboard

> **Generated:** 2026-05-27 · **Last updated:** 2026-05-31 (issues #24, #25)
> **Branch:** `main` (commit `15b2198`)
> **Scope:** Static analysis of `sms-system/src`; cross-referenced with `ROLE_PRIVILEGE_ANALYSIS.md`

---

## ✅ Broken / Missing Routes — All Resolved

### 1. Menu links to non-existent routes ✅ Resolved

**File:** `src/components/Menu.tsx`

> **Updated 2026-05-27** — The **Attendance** (`/list/attendance`) and **Messages** (`/list/messages`) entries have been removed from the `menuItems` array. Both routes remain unregistered in `App.tsx`; the menu items can be reinstated once the corresponding pages are built.

---

### 2. Super Admin "Audit Logs" quick action links to a non-existent page ✅ Resolved

**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

> **Updated 2026-05-27** — The **Audit Logs** entry has been removed from the `quickActions` array. The `/audit-log` route remains unregistered; the quick action can be reinstated once the Audit Logs page and its route are built.

---

## 🔴 Data Layer Not Connected

### 3. All list pages read from static mock data
**File:** `src/lib/data.ts`

Every list page (Teachers, Students, Parents, Subjects, Classes, Lessons, Exams, Assignments, Results, Events, Announcements) imports hardcoded arrays from `data.ts`. The file itself is annotated:

```ts
// TEMPORARY MOCK DATA — replace each export with Firestore queries as data layer is built out
```

There are zero live Firestore reads anywhere in the list pages.

**Fix:** Implement Firestore query hooks (or service functions) per entity, filtered by `institutionId`, and replace the static imports.

---

### 4. Forms do not persist data ⚠️ Partially Resolved

**Files:** All files under `src/components/forms/`, `src/components/FormModal.tsx`

All 11 form components (`TeacherForm`, `StudentForm`, `SubjectForm`, `ClassForm`, `LessonForm`, `ExamForm`, `AssignmentForm`, `ResultForm`, `EventForm`, `AnnouncementForm`, `ParentForm`) stub their `onSubmit` handler with `console.log(data)`. No form writes to Firestore. The **Delete** confirmation button inside the modal is also non-functional — it renders a `<form>` with no `action` and no `onSubmit`.

**Fix:** Add `onSubmit` handlers to each form that call the appropriate Firestore `setDoc`/`addDoc`/`deleteDoc` operations. Each admin form's handler should also include a `WriteBatch` audit log write (see Issue #30). Tracked as OI-4 in [`FORM_SYSTEM_REFACTOR_PLAN.md`](FORM_SYSTEM_REFACTOR_PLAN.md).

> **Updated 2026-05-31 (partial)** — Several forms now write to Firestore: `TeacherForm` and `StudentForm` (edit paths only — creation goes through the create-user flow); `ClassForm`, `ResultForm`, `FeedbackCommentForm`, and `TermForm` (both create and edit). The **Delete** button in the modal remains non-functional. The following forms still have `console.log` stubs: `SubjectForm`, `LessonForm`, `ExamForm`, `AssignmentForm`, `EventForm`, `AnnouncementForm`, `ParentForm`.

---

## 🟡 Hardcoded UI Content

### 5. Navbar displays hardcoded user name and avatar ✅ Resolved

**Files:** `src/components/Navbar.tsx`, `src/lib/AuthContext.tsx`

> **Updated 2026-05-27** — `AuthContext` now exposes `displayName: string | null` sourced from `users/{uid}.name` in Firestore (read within the existing `fetchRole` call — no extra round-trip). `Navbar` resolves the display name as `displayName → user.email → "—"` and renders a monogram circle (first character, sky-blue background) in place of the static `avatar.png`. Falls back to a `<img>` only if `user.photoURL` is set on the Firebase Auth profile.

---

### 6. Single detail pages (Teacher, Student) contain fully hardcoded content
**Files:** `src/scenes/(dashboard)/list/students/[id]/index.tsx`, `src/scenes/(dashboard)/list/teachers/[id]/index.tsx`

Student name ("Cameron Moran"), grade, attendance percentage, class, lesson count, contact details, and bio are all static strings in JSX. The route receives an `id` param but it is never read.

**Fix:** Read the `:id` param via `useParams`, query the matching Firestore document, and render real data.

---

### 7. Super Admin KPI cards display hardcoded numbers
**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

The four KPI cards ("36" institutions, "1,280" total users, "31" active, "4" super admins) are static strings defined in the `kpiCards` array at the top of the file.

**Fix:** Derive these values from live Firestore aggregate queries or Firestore count() calls once the data layer is ready.

---

### 8. Calendar events are dated to August 2024
**File:** `src/lib/data.ts` (line 917 onwards)

All entries in `calendarEvents` use `new Date(2024, 7, ...)` (month index 7 = August 2024). They will never appear on the current-month view of the Big Calendar component. A comment in the file acknowledges this:

```ts
// YOU SHOULD CHANGE THE DATES OF THE EVENTS TO THE CURRENT DATE TO SEE THE EVENTS ON THE CALENDAR
```

**Fix:** Replace hardcoded dates with dates relative to `new Date()`, or — better — source calendar events from Firestore.

---

## ✅ Mock Data Bugs — All Resolved

### 9. Duplicate ID in `classesData` ✅ Resolved

**File:** `src/lib/data.ts` (around line 420)

> **Updated 2026-05-27** — The "5B" entry's `id` corrected from `5` to `6`. The sequence now reads `5 → 6 → 7` with no duplicate and no skipped value. This becomes moot once real Firestore document IDs are used.

---

### 10. Duplicate email across `parentsData` ✅ Resolved

**File:** `src/lib/data.ts` (around line 268)

> **Updated 2026-05-27** — Entries 4–10 each had `email: "mike@geller.com"` copied from entry 3. Replaced with unique `firstname@lastname.com` placeholder emails following the same convention as entries 1 and 2: `jay@french.com`, `jane@smith.com`, `anna@santiago.com`, `allen@black.com`, `ophelia@castro.com`, `derek@briggs.com`, `john@glover.com`. Entry 3 (Mike Geller) retains `mike@geller.com` as his own address. This becomes moot once parent records are sourced from Firestore.

---

## ✅ Code Quality — All Resolved

### 11. `"use client"` directive in a Vite/React project ✅ Resolved

**File:** `src/components/FormModal.tsx`

> **Updated 2026-05-27** — The `"use client"` directive has been removed from line 1 of `FormModal.tsx`. It was a Next.js App Router directive with no effect in this Vite + React SPA.

---

### 12. Duplicate logout controls ✅ Resolved

**Files:** `src/components/Navbar.tsx`, `src/components/Menu.tsx`

> **Updated 2026-05-27** — Both buttons already call `signOut()` from `useAuth` — no logic change was needed. An explanatory comment has been added above each button documenting the intentional UX split: the Navbar button is the primary logout control on narrow viewports where the sidebar is collapsed; the Menu button serves medium and large viewports where the sidebar is visible. Each comment cross-references the other file so future changes are applied consistently to both.

---

### 13. `Pagination` component is purely decorative ✅ Resolved

**File:** `src/components/Pagination.tsx`

> **Updated 2026-05-27** — `Pagination` rewritten to accept `total`, `page`, `pageSize`, and `onPageChange` props. Page state (`useState(1)`) lifted into all 11 list pages. Each page computes `filteredData` (via `filterByInstitution`) and `paginatedData` (`.slice`) then passes `paginatedData` to `<Table>` and the corresponding counts and callbacks to `<Pagination>`. Page size fixed at 20 rows, exported as `PAGE_SIZE` from `src/lib/utils.ts` as the single source of truth. Page controls (Prev/Next, numbered buttons, ellipsis) are fully functional; state resets to page 1 on navigation. When Firestore queries replace mock data, switch the slice to a server-side cursor and pass the live total from the query snapshot.

---

### 14. `TableSearch` does not filter data ✅ Resolved

**File:** `src/components/TableSearch.tsx`

> **Updated 2026-05-27** — `TableSearch` converted from a standalone uncontrolled input to a controlled component with `value: string` and `onChange: (value: string) => void` props. All 11 list pages now manage a `search` state variable that is passed to `TableSearch` and resets the page to 1 on change. A `filterBySearch<T>` utility was added to `src/lib/utils.ts`; it accepts items, a search term, and a list of `keyof T` fields to match against (case-insensitive substring; array-valued fields are joined with a space before comparison). The data pipeline on every list page is now three stages:
>
> 1. `filteredData = filterByInstitution(rawData, institutionId)` — institution scope
> 2. `searchedData = filterBySearch(filteredData, search, [...keys])` — search filter
> 3. `paginatedData = searchedData.slice(...)` — pagination slice
>
> `<Pagination total>` is driven by `searchedData.length` so the page count reflects the active search. Search keys per page: Teachers `name/email`; Students `name/email/class`; Parents `name/email`; Subjects `name`; Classes `name/supervisor`; Lessons/Exams/Assignments `subject/class/teacher`; Results `subject/student/teacher`; Events/Announcements `title/class`. When Firestore queries replace mock data, remove `filterBySearch` and push the search term into a server-side `where()` or full-text search query.

---

### 15. `teacherType` on auth context superseded by split roles ✅ Resolved

**File:** `src/lib/AuthContext.tsx`

> **Updated 2026-05-27** — The original concern (no UI differentiation between teacher subtypes) is resolved. The `teacher` auth role has been split into `regular_teacher` and `senior_teacher`; see spec v1.1 (`sms-role-specification-v1.md`) and `teacher-role-split-impact.md`. Role-based branching now drives separate dashboard pages (`SeniorTeacherPage` / `RegularTeacherPage`), settings sections, profile details, and list-page action buttons.
>
> **Updated 2026-05-27** — `teacherType` removed from `AuthContext` as an early cleanup. The field was confirmed as unused by all components; all role branching already uses `role === 'senior_teacher'` / `role === 'regular_teacher'` directly. Removed: the `TeacherType` import, the `teacherType: TeacherType | null` field from `AuthContextValue`, the `useState` variable, the second Firestore read (`teachers/{uid}`), and the entry in the context `Provider` value. The `TeacherType` type in `firebase.ts` is retained — it is still referenced by `SuperAdminCreateUserForm` when writing new teacher documents to Firestore.

---

## ✅ Multi-tenancy Not Enforced — Resolved

### 16. List pages do not filter by `institutionId` ✅ Resolved

**Files:** All pages under `src/scenes/(dashboard)/list/`

> **Updated 2026-05-27** — `filterByInstitution<T>` utility created in `src/lib/utils.ts` and applied to all 11 list pages. Every `<Table data={...} />` call is now wrapped with `filterByInstitution(rawData, institutionId)`, where `institutionId` is destructured from `useAuth()`.
>
> **Behaviour by mode:**
>
> - `institutionId === '*'` (super_admin) → all records returned, no filter applied
> - `institutionId === null` (unauthenticated edge case) → all records returned
> - Record has no `institutionId` field → record is included (mock-data safe; current mock arrays carry no `institutionId` so display is unchanged)
> - Record has `institutionId` set → only included when it matches the user's institution
>
> The filter is a no-op against the current mock data and activates automatically once real Firestore documents — which will carry `institutionId` on every record — are wired up. When adding Firestore queries, prefer server-side filtering with a `where('institutionId', '==', institutionId)` clause in addition to this client-side guard.

---

## ✅ Role / Privilege UI Gaps — All Resolved

### 17. Lessons list — create and edit buttons not shown to teachers ✅ Resolved

**File:** `src/scenes/(dashboard)/list/lessons/index.tsx`

> **Updated 2026-05-27** — Both teacher roles (`regular_teacher`, `senior_teacher`) have been added to the visibility guards for the `create` button (toolbar) and the `update` button (per row), bringing the UI into alignment with the role spec (§4.3) and the Firestore rules. The `delete` button remains admin-only (`institution_admin` | `super_admin`), consistent with the spec and the same pattern applied in Issue #18.

---

### 18. Exams / Assignments / Results — delete button incorrectly rendered for teachers ✅ Resolved

**Files:**

- `src/scenes/(dashboard)/list/exams/index.tsx`
- `src/scenes/(dashboard)/list/assignments/index.tsx`
- `src/scenes/(dashboard)/list/results/index.tsx`

> **Updated 2026-05-27** — The combined action guard has been split into two separate conditions across all three pages. `update` is shown to all four non-student roles (admins + teachers); `delete` is now admin-only (`institution_admin` | `super_admin`), consistent with the spec (§4.3) and the Firestore rules (`allow delete: if isAdminOrAbove()`). Teachers can no longer trigger a delete action that would result in a runtime permission-denied error.

---

## 🔴 Collections and Pages Not Yet Built

These items have no data model, no Firestore security rules, and no UI unless otherwise noted.

---

### 19. `feedback_comments` collection — no schema, no rules, no UI ✅ Resolved

**Spec reference:** §1.8 Reports & Feedback Flow

Teachers must be able to submit written feedback per student per term, independently of the report generation step. Feedback is stored against `studentId + teacherId + classId + termId`.

No collection schema has been designed, no Firestore rules exist, and there is no UI for submitting or viewing feedback.

**Blocks:** A-2, A-3 (report generation depends entirely on this collection existing and being populated).

**Depends on:** D-1 (teacher forms wired to Firestore), D-2, D-4 (classes with `termId`), F-1 (terms UI).

> **Updated 2026-05-31** — Schema defined (including `departmentId` for senior teacher scope); Firestore rules drafted in `firebase-rules.md` and published to Firebase Console. `FeedbackCommentForm` built with upsert logic; `/list/feedback` list page, route, sidebar entry, FormModal registration, and mock data all complete.

---

### 20. `reports` collection — no schema, no rules, no UI ✅ Resolved

**Spec reference:** §1.8

On-demand report generation joins all `results` records for a student in a given term with all `feedback_comments` for that student in the same term (all classes, full term). Reports are generated by `institution_admin` (institution scope) or `senior_teacher` (department scope). All roles can view generated reports within their respective scope: `super_admin` (all), `institution_admin` (institution), `senior_teacher` (dept), `regular_teacher` (class), `student` (own), `parent` (linked child's).

No collection schema has been designed, no Firestore rules exist, and there is no generation or viewing UI.

**Blocks:** A-3, A-5 (PDF export).

**Depends on:** A-2 (`feedback_comments` must exist), D-5 (results model rebuilt with `termId`), Open Question #3 (PDF vs. in-app view).

> **Updated 2026-05-31** — Schema defined (snapshot model); Firestore rules drafted in `firebase-rules.md` and published to Firebase Console. `generateReport` utility created at `src/lib/generateReport.ts`; `/reports` page built with role-scoped table, generate panel, and per-row re-generate action. Route and sidebar entry added. In-app view only — PDF export (A-5) remains deferred (see Issue #38).

---

### 21. Attendance page not built

**File:** Route `/list/attendance` — no page component registered

The attendance list page and the mark-attendance form do not exist. The route is unregistered in `App.tsx`. The Firestore security rules for the `attendance` collection are fully implemented and ready.

The `attendance` collection requires: `institutionId`, `studentId`, `classId`, `departmentId`, `date`, `status` (`present` / `absent` / `late`).

**Depends on:** D-2 (student records in Firestore), D-4 (class records with `termId`).

---

### 22. Messages page not built

**File:** Route `/list/messages` — no page component registered

The messages list page and any send/receive UI do not exist. The route is unregistered in `App.tsx`.

**Blocks:** All messaging work.

**Depends on:** Resolution of **Open Question #1** (in-app vs. third-party) — see [Issue #36](#36-messaging-architecture-undecided).

---

## 🟡 Firestore Rules Exist — UI Not Built

These collections have published Firestore security rules but no management UI in the application.

---

### 23. `terms` collection has no management UI ✅ Resolved

**Spec reference:** §1.9 — `terms`: `institutionId`, `name`, `startDate`, `endDate`

Institution admins need to create and manage academic periods (terms/semesters). The collection and its rules exist but there is no list page, no create/edit form, and no route registered.

This is the **highest-priority unblocking item** in the backlog. Every downstream data model that groups records by academic period — classes (D-4), results (D-5), feedback (A-2), and reports (A-3) — depends on term documents existing in Firestore before those forms can be built.

**Blocks:** D-4, D-5, A-2, A-3, A-4.

> **Updated 2026-05-31** — `TermDocument` type added to `firebase.ts`; mock data added to `data.ts`; `TermForm` built and wired to Firestore (`addDoc`/`updateDoc`); terms list page created at `src/scenes/(dashboard)/list/terms/index.tsx`; route and sidebar entry registered; FormModal registration complete.

---

### 24. `departments` collection has no management UI ✅ Resolved

**Spec reference:** §1.9 — `departments`: `institutionId`, `name`, `headTeacherId`

The `isSeniorTeacherFor(deptId)` Firestore rule function reads from this collection to verify departmental scope. Without department documents populated, senior teacher write access will be denied at runtime for any operation scoped to their department.

There is no list page, no create/edit form, and no route.

> **Updated 2026-05-31** — `DepartmentDocument` type added to `firebase.ts`; mock data added to `data.ts` (3 departments: `dept-math`, `dept-sci`, `dept-hum`); `DepartmentForm` built and wired to Firestore (`addDoc`/`updateDoc`); departments list page created at `src/scenes/(dashboard)/list/departments/index.tsx`; route and sidebar entry registered; FormModal registration complete. `TeacherForm` (edit path) and `AdminCreateUserForm` (create path) both extended with a `departmentId` dropdown populated from `departmentsData` — this field is written to `teachers/{uid}.departmentId`, which is what `isSeniorTeacherFor()` reads. Note: `departmentId` on a `senior_teacher` document is critical for live-mode write access. Also: `_resultsData` departmentId values standardised from long form (`dept-mathematics`, `dept-science`, `dept-humanities`) to short form (`dept-math`, `dept-sci`, `dept-hum`) to match `_feedbackCommentsData` and `_reportsData`.

---

### 25. `student_parents` junction has no linking UI ✅ Resolved

**Spec reference:** §1.7, §1.9 — `student_parents`: document ID `{parentId}_{studentId}`

Parent–student links are managed via this junction collection. Without a linking UI, parent accounts cannot be associated with any student, and the `parent` role's Firestore reads (which gate access via `exists()` checks on this collection) will return no data.

**Depends on:** D-2 (students in Firestore), D-3 (parents in Firestore).

> **Updated 2026-05-31** — `ParentDocument` type added to `firebase.ts`. `ParentForm` wired to Firestore: on submit writes to `parents/{uid}` (phone, address) via `writeBatch` with merge, and creates `student_parents/{uid}_{studentId}` junction documents (via `setDoc` with merge) for each selected student. A "Linked Students" checkbox list populated from `studentsData` replaces the previous stub. Existing links are loaded on mount via a `getDocs` query so current selections are pre-checked. New links are additive — removal of existing links is deferred (no delete on uncheck). `ParentDocument` type added to `firebase.ts`.

---

### 26. `teacher_subjects` and `teacher_classes` have no management UI

**Spec reference:** §1.9

Both junction collections have published Firestore rules but there is no UI to create, view, or delete these links. Teacher assignment to classes and subjects currently has no data-backed flow.

---

## 🟡 Missing Profile Fields in Forms

---

### 27. Teacher forms missing `employeeId` and `qualifications` fields

**File:** `src/components/forms/TeacherForm.tsx`

The role spec (§1.5) and the `teachers` Firestore collection schema both include `employeeId` and `qualifications` as teacher profile fields. Neither field is present in the current form or written to Firestore.

**Depends on:** D-1 (teacher forms wired to Firestore).

---

### 28. Student forms missing `dateOfBirth` and `enrolmentId` fields

**File:** `src/components/forms/StudentForm.tsx`

The role spec (§1.6) and the `students` Firestore collection schema both include `dateOfBirth` and `enrolmentId` as student profile fields. Neither field is present in the current form or written to Firestore.

**Depends on:** D-2 (student forms wired to Firestore).

---

## 🟡 Missing Loading and Error States

---

### 29. List pages have no loading indicators or error boundaries

**Files:** All pages under `src/scenes/(dashboard)/list/`

When Firestore queries replace the mock data arrays, list pages will show a blank table during the initial fetch and have no recovery path if a query fails. There are no loading skeletons, spinners, or `<ErrorBoundary>` wrappers on any of the 11 list pages.

The super_admin homepage widgets (InstitutionsTable, RecentSignups, AlertsFeed) handle loading and error states correctly and are the pattern to follow.

**Fix:** Add per-page `isLoading` and `error` state variables; render a loading skeleton while fetching and an inline error message with a retry option on failure.

---

## 🟡 Profile and Settings Gaps

---

### 30. WriteBatch audit log writes not wired to admin form actions

**Files:** `src/components/forms/TeacherForm.tsx`, `src/components/forms/StudentForm.tsx`, and all other admin-action forms

The audit log infrastructure is fully built: the `institutions/{id}/audit_log` subcollection has Firestore rules, the `AuditLogPage` renders entries, and the profile page already writes audit events via `WriteBatch`. However, admin actions taken through CRUD forms (creating a teacher, deactivating a student, etc.) do not yet write a corresponding audit log entry.

**Fix:** Each `onSubmit` handler in admin forms should use a `WriteBatch` to write the entity document and an `audit_log` entry atomically. See [`ACTIVITY_AND_AUDIT_LOG_PLAN.md`](./ACTIVITY_AND_AUDIT_LOG_PLAN.md) §8.2 for the planned event schema.

**Depends on:** D-1 (forms must be wired to Firestore before audit writes can be added).

---

### 31. Settings page is a stub

**File:** `src/scenes/(dashboard)/settings/index.tsx`

The settings page renders placeholder cards and is intentionally hidden from the sidebar for all roles. Five of the planned cards have been recommended for removal before the page is re-exposed.

**Fix:** Implement the settings page per [`SETTINGS_PAGE_ANALYSIS.md`](./SETTINGS_PAGE_ANALYSIS.md), then re-add the sidebar link for all roles.

---

## 🟡 Infrastructure Gaps

---

### 32. Institution document counter fields are never written

**File:** `src/lib/firebase.ts` (`InstitutionDocument` type), `src/lib/AuthContext.tsx`

The `InstitutionDocument` TypeScript type defines `userCount`, `studentCount`, `teacherCount`, and `lastActiveAt` as optional fields on every institution document. These fields are read by the super_admin KPI strip in live mode but are never written anywhere in the application. Their values will be `undefined` for all institutions.

**Fix:** Update `lastActiveAt` on sign-in; increment `userCount`, `studentCount`, and `teacherCount` counters from within the relevant CRUD form submit handlers when live Firestore writes are added (D-1 through D-3).

---

### 33. GrowthChart shows a placeholder in all data modes

**File:** `src/components/superadmin/GrowthChart.tsx`

The growth chart on the super_admin homepage renders a placeholder message in every data mode including live. Computing a growth trend from raw institution documents on every page load would be read-expensive. The intended approach is a pre-computed stats document that is updated by a server-side process.

**Fix:** Design and introduce a stats document (e.g., `institutions/_platform/stats/{month}`) updated by a Cloud Function or scheduled job; query it in GrowthChart when `DATA_MODE === 'live'`.

---

### 34. Server-side pagination not implemented

**Files:** All pages under `src/scenes/(dashboard)/list/`

All 11 list pages use client-side `.slice()` pagination against the full mock data array. Once Firestore queries replace mock data, loading the full collection on every page load will be slow and expensive.

**Fix:** Replace the slice with Firestore cursor-based queries using `startAfter` / `limit` once live data is wired. `PAGE_SIZE` is already exported from `src/lib/utils.ts` as the single source of truth for the page size value.

**Depends on:** D-1 through D-7 (Firestore queries must exist before server-side cursors can be introduced).

---

### 35. No separate dev Firebase project

**Risk:** The application currently has a single Firebase project. When `DATA_MODE === 'live'`, reads and writes target the production Firestore database. Any developer testing live mode locally is reading from and writing to production data.

**Fix:** Create a `sms-dev` Firebase project with its own Firestore instance and Authentication tenant. Add a `.env.development` file with the dev project credentials and a `.env.production` file with the production credentials. Vite's `import.meta.env` system will select the correct file per build target. Recommended before live mode is used for any volume of testing.

---

## 🟡 Open Questions Blocking Implementation

These three questions are unresolved and directly gate significant feature work. They should be answered before the corresponding backlog items are started.

---

### 36. Messaging architecture undecided

**Open Question #1:** Should messaging be in-app (requires a Firestore `messages` collection, Firestore rules, real-time listeners, and a full list/compose UI) or third-party (email via e.g. SendGrid, SMS via e.g. Twilio — requires a Cloud Function intermediary and no in-app storage)?

**Blocks:** M-1 (architecture decision), M-2 (full messaging feature), and the `/list/messages` route.

---

### 37. Grades data model undecided ✅ Resolved

**Open Question #2:** Should the `results` collection support multiple weighted assessment types per class (e.g., homework 20%, midterm 40%, final 40%) with a computed overall grade, or a flat single score per result record?

The answer determines the `results` collection schema, the shape of the results form, and the aggregation logic used during report generation.

**Blocks:** D-5 (results model rebuild), A-3 (report generation).

> **Updated 2026-05-31** — Resolved as institution-level flat/weighted. `gradingSystem: 'flat' | 'weighted'` added to `InstitutionDocument` and the `institutions/{id}` Firestore document. Settings page grading dropdown reads and writes this field via `getDoc`/`updateDoc`. `institutions` update rule expanded to allow `institution_admin` — published to Firebase Console 2026-05-31. D-5 and A-3 both complete.

---

### 38. Report export format undecided

**Open Question #3:** Should generated reports be exported as downloadable PDFs (requires a PDF generation library such as `@react-pdf/renderer` or a server-side Cloud Function) or viewed in-app only (a styled read-only page component)?

This does not block the core report generation logic (A-3) but must be resolved before the export step (A-5) is built.

**Blocks:** A-5 (PDF export).

---

_End of Issues & Gaps report._
