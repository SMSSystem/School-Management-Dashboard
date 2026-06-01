# School SMS — Project Specification & Codebase Analysis

> This document combines the authoritative role specification with a comprehensive analysis of the current codebase. Section 1 reflects actual implementation decisions, which in some cases diverge from the original PDF (`School SMS Role Specification.docx.pdf`, deleted from the repo). For the full Firestore security rules see [`firebase-rules.md`](./firebase-rules.md). For the detailed role and privilege matrix see [`ROLE_PRIVILEGE_ANALYSIS.md`](./ROLE_PRIVILEGE_ANALYSIS.md).

---

## Table of Contents

1. [Role & Data Specification](#1-role--data-specification)
   - [Overview](#11-overview)
   - [Roles Summary](#12-roles-summary)
   - [Super Admin](#13-super-admin)
   - [Institution Admin](#14-institution-admin)
   - [Teacher](#15-teacher)
   - [Student](#16-student)
   - [Parent](#17-parent)
   - [Reports & Feedback Flow](#18-reports--feedback-flow)
   - [Firestore Collections](#19-firestore-collections)
   - [Security Rule Notes](#110-security-rule-notes)
   - [Open Questions](#111-open-questions)
2. [Codebase Analysis](#2-codebase-analysis)
   - [Tech Stack](#21-tech-stack)
   - [Project Structure](#22-project-structure)
   - [Features Implemented](#23-features-implemented)
   - [Authentication Flow](#24-authentication-flow)
   - [Known Issues](#25-known-issues)
3. [Spec vs. Codebase Gap Analysis](#3-spec-vs-codebase-gap-analysis)
   - [Roles](#31-roles)
   - [Data Model](#32-data-model)
   - [Profile Fields](#33-profile-fields)
   - [Security Rules](#34-security-rules)
4. [Build Backlog](#4-build-backlog)
   - [Completed](#40-completed)
   - [Active](#41-active)
   - [Open Questions to Resolve Before Building](#open-questions-to-resolve-before-building)

---

## 1. Role & Data Specification

### 1.1 Overview

This section defines the six user roles in the school SMS platform and specifies the data each role can access, create, or modify.

The platform is **multi-tenant**: a single deployment serves multiple institutions (schools). Each institution's data must be isolated from all others, with the exception of the Super Admin tier.

> **Implementation note:** The original PDF specification defined five roles. During implementation, `teacher` was split into `regular_teacher` and `senior_teacher` to accommodate departmental oversight responsibilities. All six roles are implemented and in production.

---

### 1.2 Roles Summary

| Role | Scope |
|---|---|
| **Super Admin** | Our organisation. Full access across every institution on the platform. |
| **Institution Admin** | One per client school. Access limited to their own institution's data only. |
| **Senior Teacher** | Head of department. Teaches their own classes plus departmental oversight of all classes in their department. |
| **Regular Teacher** | Class teacher. Access limited to the classes they are assigned to teach. |
| **Student** | Access limited to their own personal records and academic data. |
| **Parent** | Access limited to the records of their linked child or children. One parent may be linked to multiple students. |

---

### 1.3 Super Admin

#### Responsibilities

- Create, suspend, and delete institutions on the platform.
- Create the initial Institution Admin account for each new client school.
- View platform-wide reporting and usage metrics.
- Manage billing and subscription status for each institution.
- Read access across every institution for support and audit purposes.
- Read access to the platform-wide audit log.

#### Data the Super Admin manages

- **Institutions:** name, address, contact info, subscription/plan, status (`active`/`suspended`).
- **Institution Admins:** name, email, phone, assigned institution.
- **Platform-wide reports:** user counts, active institutions, billing summaries.
- **Audit log:** read access to admin events across all institutions.

#### Profile fields

- Full name
- Email
- Phone number
- Role flag (`super_admin`)

---

### 1.4 Institution Admin

#### Responsibilities

- Manage all data within their own institution only.
- Create and manage teacher, student, and parent accounts.
- Define classes — name, subject, schedule, room, term/semester.
- Assign teachers to classes.
- Enrol students into classes (manage class rosters).
- Link parents to their children.
- View all grades, attendance, feedback, and reports across the institution.
- Generate institution-level reports.

#### Data the Institution Admin manages

- **Teachers:** create, edit, deactivate.
- **Students:** create, edit, deactivate; manage enrolment IDs.
- **Parents:** create, edit, deactivate; manage parent–student links.
- **Classes:** name, subject, schedule (days, times), room, term, assigned teacher, enrolled students.
- **Terms / Semesters:** define academic periods used for grouping grades and feedback.
- **Reports:** view all student reports across the institution.

#### Profile fields

- Full name
- Email
- Phone number
- Institution ID
- Role flag (`institution_admin`)

---

### 1.5 Teacher

The teacher role is split into two subtypes with different privilege scopes.

> **Implementation note:** The original PDF spec defined a single `teacher` role. This was split into `regular_teacher` and `senior_teacher` during implementation to reflect the distinct departmental scope of a head of department. Both subtypes share a common profile field set; the distinction is enforced in the Firestore security rules via `isSeniorTeacherFor(departmentId)`.

#### Regular Teacher

##### Regular Teacher responsibilities

- View their assigned classes and class schedules.
- View the roster of students in each class they teach.
- Upload and edit grades, exams, assignments, and results for students in their classes only.
- Submit written feedback for each student per term/semester.
- Mark attendance for their own class sessions.

##### Data the Regular Teacher manages

- **Grades / Results:** create and edit only for students in classes they teach.
- **Feedback comments:** submit written feedback per student per term.
- **Attendance:** mark for their class sessions only.
- **Lessons, Exams, Assignments:** create and edit for their own classes only.
- **Class roster:** read-only — admin manages enrolment.

#### Senior Teacher

##### Additional responsibilities (on top of Regular Teacher)

- Departmental oversight — can view, create, and edit lessons, exams, assignments, results, and attendance for any class within their department.
- Can override grades submitted by regular teachers in their department.

#### Profile fields (both teacher subtypes)

- Full name
- Email
- Phone number
- Employee ID
- Subject(s) taught
- Qualifications (optional)
- Department ID
- Institution ID
- Role flag (`regular_teacher` or `senior_teacher`)

#### Restrictions

- Regular teacher cannot view or edit data for students they do not teach.
- Neither subtype can create classes, assign themselves to classes, or delete academic records — those actions are admin-only.

---

### 1.6 Student

#### Responsibilities

- View their own grades, attendance, and class timetable.
- View their own end-of-term/semester report once generated by an institution admin or senior teacher.
- Receive messages from teachers and parents.

#### Data the Student accesses

- **Own grades:** read-only.
- **Own attendance:** read-only.
- **Own timetable:** derived from classes they are enrolled in.
- **Own reports:** viewable once generated by an `institution_admin` or `senior_teacher`; contains grades + teacher feedback for the selected term.

#### Profile fields

- Full name
- Email
- Phone number
- Date of birth
- Enrolment ID
- Institution ID
- Enrolled classes (linked)
- Role flag (`student`)

#### Restrictions

- Cannot view any other student's data.
- Cannot edit grades, attendance, or feedback.

---

### 1.7 Parent

#### Responsibilities

- View grades, attendance, timetable, and reports for each of their linked children.
- Communicate with teachers of their child's classes.

#### Data the Parent accesses

- **Linked children:** one parent may be linked to multiple students. Links are managed via the `student_parents` junction collection.
- **Per-child grades, attendance, timetable, reports:** read-only.

#### Profile fields

- Full name
- Email
- Phone number
- Institution ID
- Role flag (`parent`)

> **Implementation note:** The original spec defined `linkedStudentIds[]` as an inline array on the parent document. This has been replaced by a `student_parents` junction collection (document ID format: `{parentId}_{studentId}`) to support proper many-to-many relationships and enable Firestore security rule enforcement via `exists()` checks.

#### Restrictions

- Cannot view data for students they are not linked to.
- Cannot edit any academic data.

---

### 1.8 Reports & Feedback Flow

Reports are generated on demand by `institution_admin` and `senior_teacher`. The flow is as follows:

- Teachers submit feedback comments for each student per term, **independently** of the report. Feedback is stored against `studentId + teacherId + classId + termId`.
- When a report is generated, the system pulls every grade for that student in the selected term, plus every feedback comment submitted by that student's teachers for the same term.
- This means teachers do not need to be available at report time — they simply ensure feedback is submitted before the term closes.
- Institution Admin can generate and re-generate any report across the school. Senior teachers can generate reports for students within their department.

```
Teacher submits feedback
  └── stored against (studentId + teacherId + classId + termId)

Institution admin or senior teacher generates report for a student+term
  └── System pulls:
        ├── all grades for that student in that term (all classes, full term)
        └── all feedback_comments for that student in that term
              └── Report viewable by: super_admin (all), institution_admin (institution),
                                      senior_teacher (dept), regular_teacher (class),
                                      student (own), parent (child's)
```

> **Status:** Implemented. Report generation (A-3) is complete — `institution_admin` and `senior_teacher` can generate on-demand reports from the `/reports` page; PDF preview and download are available via `@react-pdf/renderer` (A-5 complete). The `feedback_comments` collection is built with `FeedbackCommentForm` and a `list/feedback/` page (A-2 complete). See [Section 4](#4-build-backlog) for remaining items.

---

### 1.9 Firestore Collections

The tables below reflect the actual implemented and planned schema. For the full security rules governing each collection, see [`firebase-rules.md`](./firebase-rules.md).

#### Top-level collections

| Collection | Key Fields | Status |
|---|---|---|
| `institutions` | `name`, `institutionId` (mirrors doc ID), `createdAt`, `status` (`active`/`suspended`), `location?`, `userCount?`, `studentCount?`, `teacherCount?`, `lastActiveAt?` | ✅ Implemented |
| `users` | `role`, `name`, `email`, `phone`, `institutionId`, plus role-specific fields | ✅ Implemented |
| `teachers` | `institutionId`, `name`, `email`, `phone`, `employeeId`, `departmentId`, `subjects[]` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data pending live queries (I-2) |
| `students` | `institutionId`, `name`, `email`, `phone`, `dateOfBirth`, `enrolmentId` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data pending live queries (I-2) |
| `parents` | `institutionId`, `name`, `email`, `phone` | ⚠️ Rules exist; Firestore CRUD forms wired; `ParentForm` writes `student_parents` junction on create/update; list page reads mock data |
| `classes` | `institutionId`, `name`, `subject`, `teacherId`, `schedule`, `room`, `termId`, `enrolledStudentIds[]` | ⚠️ Rules exist; Firestore CRUD forms wired; field coverage (`termId`, `room`, `schedule`, `enrolledStudentIds[]`) unclear — see Issue #52 |
| `subjects` | `institutionId`, `name` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `terms` | `institutionId`, `name`, `startDate`, `endDate` | ⚠️ Rules exist; `TermForm` and `list/terms/` page built; Firestore CRUD wired |
| `departments` | `institutionId`, `name`, `headTeacherId` | ⚠️ Rules exist (referenced by `isSeniorTeacherFor`); `DepartmentForm` and `list/departments/` page built; Firestore CRUD wired |
| `lessons` | `institutionId`, `teacherId`, `classId`, `departmentId`, `subject`, `schedule` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `exams` | `institutionId`, `teacherId`, `classId`, `departmentId`, `subject`, `date` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `assignments` | `institutionId`, `teacherId`, `classId`, `departmentId`, `subject`, `dueDate` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `results` | `institutionId`, `studentId`, `teacherId`, `classId`, `termId`, `assessmentName`, `score`, `maxScore` | ⚠️ Rules exist; data model rebuilt (`termId`, `assessmentName`, `maxScore` added); `ResultForm` wired (update-only); list page reads mock data |
| `attendance` | `institutionId`, `studentId`, `classId`, `departmentId`, `date`, `status` (`present`/`absent`/`late`) | ⚠️ Rules exist; no UI page |
| `events` | `institutionId`, `title`, `date` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `announcements` | `institutionId`, `title`, `description`, `date` | ⚠️ Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `feedback_comments` | `studentId`, `teacherId`, `classId`, `termId`, `comment`, `createdAt` | ⚠️ `FeedbackCommentDocument` type defined; `FeedbackCommentForm` and `list/feedback/` page built; Firestore CRUD wired |
| `reports` | `studentId`, `termId`, `generatedAt` | ✅ Implemented — `ReportDocument` type defined; `/reports` page with live Firestore queries, on-demand generation, and PDF export via `@react-pdf/renderer` built |

#### Junction collections

| Collection | Document ID format | Purpose | Status |
|---|---|---|---|
| `student_parents` | `{parentId}_{studentId}` | Many-to-many parent–student links | ⚠️ Rules exist; `ParentForm` writes junction documents on create/update; dedicated link-management UI unclear — see Issue #53 |
| `teacher_subjects` | auto ID | Links teachers to their subjects | ⚠️ Rules exist; no UI |
| `teacher_classes` | auto ID | Links teachers to their classes | ⚠️ Rules exist; no UI |

#### Subcollections

| Path | Purpose | Status |
|---|---|---|
| `users/{uid}/activity_log/{eventId}` | Per-user activity trail (sign-ins, profile saves) | ✅ Implemented — written on sign-in (with sessionStorage deduplication) and on profile saves |
| `institutions/{institutionId}/audit_log/{eventId}` | Institution-scoped admin audit trail (role changes, password resets, account actions) | ✅ Rules and AuditLogPage implemented; WriteBatch writes deferred to each future admin action UI |

> **`institutions/_platform` sentinel:** A manually created document (`institutions/_platform`) acts as the parent path for `super_admin` platform-level audit events that have no institution scope (e.g., creating a new institution). See [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md) for the full audit log schema and write logic.

---

### 1.10 Security Rule Notes

- Every non-Super-Admin document carries an `institutionId`. Security rules enforce that users can only read/write documents matching their own `institutionId`. The `super_admin` short-circuits this check via `isSuperAdmin()`.
- Teachers may only write to `lessons`, `exams`, `assignments`, `results`, and `attendance` where they are the assigned teacher. Senior teachers may additionally write to any record within their department.
- Students may only read documents where `studentId` matches their own user ID.
- Parents may only read documents where `studentId` is in their linked students, enforced via an `exists()` check against the `student_parents` junction collection.
- The `roleNotChanged()` and `institutionNotChanged()` invariants are enforced on every document update — no user can elevate their own role or move documents between institutions.
- Super Admin bypasses institution scoping but all privileged actions are recorded in the audit log.

> Full published rules are in [`firebase-rules.md`](./firebase-rules.md).

---

### 1.11 Open Questions

| # | Question | Blocks | Status |
|---|---|---|---|
| 1 | **Messaging:** In-app or third-party (email/SMS)? | Build Backlog M-1, M-2 | Open |
| 2 | **Grades:** Multiple assessment types per class with weighted averaging? | Build Backlog D-5, A-3 | **Resolved** — institution-level `gradingSystem: 'flat' \| 'weighted'` on `InstitutionDocument`; D-5 and A-3 complete |
| 3 | **Reports:** PDF export or in-app view only? | Build Backlog A-5 | **Resolved** — PDF export via `@react-pdf/renderer`; `PDFPreviewModal` with in-app preview and download; A-5 complete |
| 4 | **Audit log:** Track who viewed/edited grades and feedback? | — | **Resolved** — audit log implemented for admin actions; per-document view tracking is deferred |

---

## 2. Codebase Analysis

### 2.1 Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18.3.1 + TypeScript 5.6.2 |
| Build Tool | Vite 6.0.1 |
| Routing | React Router DOM 7.0.2 |
| Styling | Tailwind CSS 3.4.16 (dark mode, custom `lama*` colour palette) |
| Forms | React Hook Form 7.53.2 + Zod 3.23.8 |
| Charts | Recharts 2.14.1, react-big-calendar 1.16.3, react-calendar 5.1.0 |
| Backend / Auth | Firebase 12.13.0 (Firestore + Authentication) |
| Date utilities | moment 2.30.1 |
| Linting | ESLint 9.15.0 with TypeScript + React Hooks plugins |

---

### 2.2 Project Structure

```
sms-system/
├── public/                            # Static assets (icons, logos, feature images)
└── src/
    ├── App.tsx                        # Root routing + role-based homepage redirects
    ├── main.tsx                       # React entry point
    ├── index.css                      # Global styles
    ├── components/                    # Reusable UI components
    │   ├── DevDataModeToggle.tsx      # Dev-only floating tri-state data mode selector
    │   ├── FormModal.tsx              # Create/Update/Delete modal (React.lazy per form)
    │   ├── Table.tsx                  # Generic table renderer with typed column definitions
    │   ├── InputField.tsx             # Form input wrapper with Zod error display
    │   ├── Navbar.tsx                 # Top bar (search, theme toggle, logout)
    │   ├── Menu.tsx                   # Role-filtered sidebar navigation
    │   ├── Protected.tsx              # Auth guard — redirects to /login if unauthenticated
    │   ├── Pagination.tsx             # Functional table pagination (page state, prev/next/numbered)
    │   ├── TableSearch.tsx            # Controlled search input (wired to filterBySearch utility)
    │   ├── AttendanceChart.tsx        # Recharts bar chart
    │   ├── FinanceChart.tsx           # Recharts bar chart
    │   ├── CountChart.tsx             # Recharts radial bar chart
    │   ├── BigCalender.tsx            # react-big-calendar week/day view
    │   ├── EventCalendar.tsx          # Mini react-calendar + event sidebar
    │   ├── Announcements.tsx          # Announcement feed component
    │   ├── superadmin/                # Super Admin homepage widgets
    │   │   ├── InstitutionsTable.tsx  # Branches on DATA_MODE; live: getDocs institutions
    │   │   ├── RecentSignups.tsx      # Branches on DATA_MODE; live: getDocs institutions desc
    │   │   ├── AlertsFeed.tsx         # Branches on DATA_MODE; live: collectionGroup audit_log
    │   │   ├── GrowthChart.tsx        # Mock chart or placeholder (live deferred)
    │   │   └── mockData.ts            # Mock institution data for mock mode
    │   └── forms/
    │       ├── TeacherForm.tsx
    │       ├── StudentForm.tsx
    │       ├── AdminCreateUserForm.tsx
    │       └── ...                    # Other entity forms
    ├── scenes/                        # Page-level components (organised by route)
    │   ├── (auth)/
    │   │   └── login/                 # Login page
    │   └── (dashboard)/
    │       ├── DashboardLayout.tsx    # Sidebar + Navbar shell
    │       ├── super-admin/           # SuperAdminPage — KPI strip, widgets, quick actions
    │       ├── admin/                 # AdminPage — institution_admin home
    │       │   └── audit-log/         # AuditLogPage — super_admin only; institution filter + collectionGroup query
    │       ├── senior-teacher/        # SeniorTeacherPage — schedule + departmental placeholders
    │       ├── teacher/               # RegularTeacherPage — schedule + announcements
    │       ├── student/               # StudentPage — BigCalendar + EventCalendar + announcements
    │       ├── parent/                # ParentPage — BigCalendar + announcements
    │       ├── list/                  # Data list pages — all have filterByInstitution + filterBySearch + pagination
    │       │   ├── teachers/
    │       │   ├── students/
    │       │   ├── parents/
    │       │   ├── classes/
    │       │   ├── subjects/
    │       │   ├── lessons/
    │       │   ├── exams/
    │       │   ├── assignments/
    │       │   ├── results/
    │       │   ├── events/
    │       │   ├── announcements/
    │       │   ├── terms/
    │       │   ├── departments/
    │       │   └── feedback/
    │       ├── reports/               # Reports page — live Firestore queries, generation panel, PDF preview
    │       ├── profile/               # Role-aware profile page with real Firestore reads/writes
    │       └── settings/              # Settings page — hidden from sidebar; route still registered
    └── lib/
        ├── firebase.ts                # Firebase app init + TypeScript document types
        ├── AuthContext.tsx            # Firebase auth context — primary source of truth for role + institutionId
        ├── data.ts                    # Mock data arrays + DataMode type + DATA_MODE + USE_MOCK exports
        ├── theme.ts                   # Dark mode toggle with localStorage persistence
        └── utils.ts                   # filterByInstitution, filterBySearch, PAGE_SIZE
```

---

### 2.3 Features Implemented

#### Role-based dashboards (all 6 roles)

| Role | Dashboard content |
|---|---|
| `super_admin` | KPI strip (4 × `getCountFromServer` aggregates in live mode), InstitutionsTable, RecentSignups, AlertsFeed, GrowthChart placeholder, Quick Actions |
| `institution_admin` | Metric cards (students/teachers/parents/staff), count chart (gender breakdown), attendance chart, finance chart, EventCalendar, Announcements |
| `senior_teacher` | BigCalendar (personal schedule), Announcements, department widget placeholders (Department Overview, Performance, Alerts — coming soon) |
| `regular_teacher` | BigCalendar (personal schedule), Announcements |
| `student` | BigCalendar (class schedule), EventCalendar, Announcements |
| `parent` | BigCalendar (child's schedule), Announcements |

#### Data list pages (14 list pages + reports page — all functional)

Teachers, Students, Parents, Classes, Subjects, Lessons, Exams, Assignments, Results, Events, Announcements, Terms, Departments, Feedback Comments. A dedicated `/reports` page provides role-scoped report listing, on-demand generation, re-generate per row, and PDF export. Every list page applies a three-stage data pipeline:

1. `filterByInstitution` — scopes records to the signed-in user's `institutionId` (no-op on mock data; activates automatically when Firestore queries replace mock arrays)
2. `filterBySearch` — case-insensitive substring filter on role-relevant fields
3. Pagination slice — `PAGE_SIZE = 20` rows per page from `src/lib/utils.ts`

#### CRUD modals

Zod-validated forms loaded via `React.lazy` per entity. All list-page entity forms write to Firestore via `addDoc`/`updateDoc`/`deleteDoc`.

#### Authentication

Firebase Authentication (email + password). `AuthContext.tsx` is the sole source of truth for the signed-in user's `role`, `institutionId`, and `displayName`. Full detail in [§2.4](#24-authentication-flow).

#### Profile page

Real Firestore reads and writes: `name` and `phone` are editable and written via `updateDoc`; email is read-only (Firebase Auth is the source of truth). Activity log rendered in mock mode (synthesised sign-in entry from `user.metadata.lastSignInTime` + mock activity entries). Audit events card visible to admins; `super_admin` sees a link to the dedicated audit log page.

#### Dedicated audit log page (`/admin/audit-log`)

`super_admin`-only page. Fetches the institutions list on mount to populate a filter dropdown. Queries `collectionGroup("audit_log")` across all institutions or a single-institution subcollection. Results sorted by `timestamp` DESC, `limit(50)`. See [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md).

#### Data mode toggle (`DevDataModeToggle`)

Floating `<select>` dropdown, visible in development builds only (`import.meta.env.DEV`). Three states: 🧪 Mock Data, 📭 Blank Data, 🔴 Live Data. Persisted in `localStorage` under key `sms_data_mode_v2`; reloads the page on change. See [`FEATURE_FLAG_DATA_MODE.md`](./FEATURE_FLAG_DATA_MODE.md) for full documentation including the localStorage key rename rationale and Firestore security rules short-circuit note.

#### Live mode queries (super_admin homepage)

When `DATA_MODE === 'live'`, the super_admin homepage fires real Firestore queries:

| Widget | Query | Reads per load |
|---|---|---|
| KPI strip | 4 × `getCountFromServer` (institutions total, users total, active institutions, super admins) | 4 (fixed) |
| InstitutionsTable | `getDocs` on `institutions` ordered by `name` | N (one per institution document) |
| RecentSignups | `getDocs` on `institutions` ordered by `createdAt` DESC, `limit(10)` | ≤ 10 |
| AlertsFeed | `getDocs` on `audit_log` collectionGroup, `limit(10)` | ≤ 10 |
| GrowthChart | Placeholder — live deferred | 0 |

See [`FEATURE_FLAG_DATA_MODE.md`](./FEATURE_FLAG_DATA_MODE.md) for the full query design, free-tier cost analysis, and deferred items.

#### Firestore security rules

All collections and subcollections have published rules. See [`firebase-rules.md`](./firebase-rules.md).

#### Role and privilege enforcement

- `/create-user` route open to `super_admin` and `institution_admin` in `App.tsx`; all other route access is controlled by in-page component logic
- Lessons list: create/edit buttons now correctly visible to both teacher roles (previously admin-only)
- Exams/Assignments/Results: delete button restricted to admin roles (previously incorrectly shown to teachers, which would have caused a runtime permission-denied error)
- Attendance and Messages removed from sidebar (pages not yet built)
- Settings page hidden from sidebar for all roles pending redesign (see [`SETTINGS_PAGE_ANALYSIS.md`](./SETTINGS_PAGE_ANALYSIS.md))

#### Other

- Dark mode toggle in Navbar with `localStorage` persistence
- Navbar displays real user display name sourced from `users/{uid}.name` in Firestore
- `/create-user` page (`AdminCreateUserForm`) accessible to `super_admin` and `institution_admin` — `super_admin` creates institution admin accounts; `institution_admin` creates teachers, students, and parents within their institution
- `/reports` page — role-scoped report list, generation panel, re-generate per row, and PDF preview/download via `@react-pdf/renderer` (lazy-loaded)
- `feedback_comments` submission via `FeedbackCommentForm`; `list/feedback/` page for viewing submitted comments
- Terms and departments management via `list/terms/` and `list/departments/` with full CRUD (`TermForm`, `DepartmentForm`)

---

### 2.4 Authentication Flow

```
Login form (email + password)
    └── Firebase signInWithEmailAndPassword(auth, email, password)
          └── onAuthStateChanged fires with non-null user object
                └── AuthContext.fetchRole(uid)
                      ├── getDoc(users/{uid})  →  reads role, institutionId, name
                      ├── Sets role, institutionId, displayName in React context
                      ├── Writes sign_in entry to users/{uid}/activity_log
                      │     guarded by sessionStorage flag — one entry per tab session
                      └── Sets loading(false)

Protected.tsx
    └── Checks auth.user from AuthContext (Firebase Auth user object)
          └── Redirects to /login if null

App.tsx
    └── Branches on role from AuthContext
          └── Renders role-specific homepage component
```

Sign-out clears the `sessionStorage` sign-in flag and calls `firebaseSignOut(auth)`, which triggers `onAuthStateChanged` with a null user — `Protected.tsx` then redirects to `/login`.

> For sign-in deduplication logic and activity log write details, see [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md).

---

### 2.5 Known Issues

Resolved items are tracked in [`ISSUES_AND_GAPS.md`](./ISSUES_AND_GAPS.md).

| # | Issue | File(s) | Notes |
|---|---|---|---|
| 1 | ~~List page forms do not write to Firestore~~ | | **Resolved** — form system refactor complete; all entity forms now write to Firestore via `addDoc`/`updateDoc`/`deleteDoc` |
| 2 | Teacher and student detail pages show hardcoded content | `list/students/[id]/`, `list/teachers/[id]/` | The `:id` URL param is never read; all content is static strings |
| 3 | Calendar events hardcoded to August 2024 | `src/lib/data.ts` | Events use `new Date(2024, 7, ...)` and never appear on the current-month view |
| 4 | Attendance page not yet built | — | Route `/list/attendance` has no page component; Firestore rules are ready |
| 5 | Messages page not yet built | — | Route `/list/messages` has no page component; architecture TBD (Open Question #1) |
| 6 | `any` types in form components | `FormModal.tsx`, form files | Form data parameters lose TypeScript type safety at the point of submission |
| 7 | Senior teacher departmental widgets are placeholders | `src/scenes/(dashboard)/senior-teacher/index.tsx` | Department Overview, Performance, and Alerts cards show "coming soon" |
| 8 | GrowthChart shows placeholder in live mode | `src/components/superadmin/GrowthChart.tsx` | Requires a pre-computed stats document; deferred (see Build Backlog I-5) |
| 9 | List pages have no loading or error states | All `src/scenes/(dashboard)/list/` pages | No loading indicators or empty-state handling for when Firestore queries replace mock data |
| 10 | Settings page is a stub | `src/scenes/(dashboard)/settings/index.tsx` | Removed from sidebar; five cards recommended for removal before re-exposing (see [`SETTINGS_PAGE_ANALYSIS.md`](./SETTINGS_PAGE_ANALYSIS.md)) |

---

## 3. Spec vs. Codebase Gap Analysis

### 3.1 Roles

| Spec Role | Code Role | Status |
|---|---|---|
| `super_admin` | `super_admin` | ✅ Fully implemented — dashboard, KPI live queries, CreateUser page, AuditLog page |
| `institution_admin` | `institution_admin` | ✅ Fully implemented — dashboard, list pages, profile, audit events card |
| `teacher` (original single role) | Split into `senior_teacher` + `regular_teacher` | ✅ Both implemented — separate dashboards, separate Firestore rule scopes, separate UI affordances |
| `student` | `student` | ✅ Implemented |
| `parent` | `parent` | ✅ Implemented |
| Multi-tenancy via `institutionId` | `institutionId` on all Firestore documents | ✅ Enforced by rules; `filterByInstitution` client-side guard on all 14 list pages |

---

### 3.2 Data Model

| Collection | Status | Gap / Notes |
|---|---|---|
| `institutions` | ✅ Implemented | Rules enforced; live mode queries fire against it; `_platform` sentinel created |
| `users` | ✅ Implemented | `role`, `institutionId`, `name` on every document; read by `AuthContext` on sign-in |
| `teachers` | ⚠️ Partial | Rules exist; Firestore CRUD forms wired; list page reads mock data pending live queries |
| `students` | ⚠️ Partial | Same as teachers |
| `parents` | ⚠️ Partial | Rules exist; Firestore CRUD forms wired; `ParentForm` writes `student_parents` junction; list page reads mock data |
| `classes` | ⚠️ Partial | Rules exist; Firestore CRUD forms wired; field coverage (`termId`, `room`, `schedule`, `enrolledStudentIds[]`) unclear — see Issue #52 |
| `subjects` | ⚠️ Partial | Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `terms` | ⚠️ Partial | Rules exist; `TermForm` and `list/terms/` page built; Firestore CRUD wired |
| `departments` | ⚠️ Partial | Rules exist (used by `isSeniorTeacherFor`); `DepartmentForm` and `list/departments/` built; Firestore CRUD wired |
| `lessons` | ⚠️ Partial | Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `exams` | ⚠️ Partial | Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `assignments` | ⚠️ Partial | Rules exist; Firestore CRUD forms wired; list page reads mock data |
| `results` | ⚠️ Partial | Rules exist; data model rebuilt (`termId`, `assessmentName`, `maxScore`); `ResultForm` wired (update-only); list page reads mock data |
| `attendance` | ❌ Not built | Rules ready; no UI page; no Firestore writes |
| `feedback_comments` | ⚠️ Partial | `FeedbackCommentDocument` type defined; `FeedbackCommentForm` and `list/feedback/` page built |
| `reports` | ✅ Implemented | `ReportDocument` type defined; full reports page with live Firestore queries, generation, and PDF export via `@react-pdf/renderer` |
| `student_parents` | ⚠️ Partial | Rules exist; `ParentForm` writes junction documents on create/update; dedicated link-management UI unclear — see Issue #53 |
| `teacher_subjects` | ⚠️ Partial | Rules exist; no UI |
| `teacher_classes` | ⚠️ Partial | Rules exist; no UI |
| `users/{uid}/activity_log` | ✅ Implemented | Written on sign-in (sessionStorage dedup) and profile saves |
| `institutions/{id}/audit_log` | ✅ Implemented | Rules and AuditLogPage built; WriteBatch writes deferred to future admin action UIs |

---

### 3.3 Profile Fields

| Role | Spec Requires | Status |
|---|---|---|
| Super Admin | `role: 'super_admin'`, platform-wide access | ✅ Correct |
| Institution Admin | `institutionId`, `role: 'institution_admin'` | ✅ Correct |
| Regular Teacher | `employeeId`, `qualifications`, `departmentId`, `institutionId`, `role: 'regular_teacher'` | `institutionId` ✅; `employeeId` and `qualifications` not yet in form |
| Senior Teacher | Same as regular teacher + `departmentId` used in rule enforcement | `institutionId` ✅; `employeeId`, `qualifications` not yet in form |
| Student | `dateOfBirth`, `enrolmentId`, `institutionId`, `role: 'student'` | `institutionId` ✅; `dateOfBirth` and `enrolmentId` not yet in form |
| Parent | `institutionId`, linked via `student_parents`, `role: 'parent'` | `institutionId` ✅; parent–student linking UI not yet built |

---

### 3.4 Security Rules

**Status: Fully implemented and published.**

All top-level collections, junction collections, and subcollections have rules covering read, create, update, and delete operations. Key invariants enforced across the ruleset:

- Institution scoping on every document via `sameInstitution()` and `writingToMyInstitution()`
- Teacher write access scoped to own records or department (senior teacher via `isSeniorTeacherFor`)
- Student read access scoped to own records
- Parent read access scoped to linked children via `exists()` on `student_parents`
- `roleNotChanged()` and `institutionNotChanged()` on every update
- Super Admin bypasses institution scoping via `isSuperAdmin()` short-circuit

> See [`firebase-rules.md`](./firebase-rules.md) for the full published rule set.

---

## 4. Build Backlog

### 4.0 Completed

Items from the original build plan that have been resolved.

#### Foundation

- ✅ Added `institutionId` to Firestore document schema; enforced via security rules on every read and write
- ✅ Implemented `institutions` collection with security rules and live mode queries
- ✅ Added `super_admin` role with full platform dashboard, KPI live queries, CreateUser page, and AuditLog page
- ✅ Renamed `admin` → `institution_admin` throughout the codebase
- ✅ Split `teacher` → `regular_teacher` + `senior_teacher` with separate dashboards, routes, and Firestore rule scopes
- ✅ Implemented `terms` and `departments` in Firestore security rules (UI deferred)

#### Authentication & Security

- ✅ Fully integrated Firebase Authentication — replaced the legacy `localStorage`-only flow
- ✅ `AuthContext.tsx` is the sole source of truth for `role`, `institutionId`, `displayName`
- ✅ Full Firestore security rules published for all collections
- ✅ Activity log writes on sign-in with sessionStorage deduplication guard
- ✅ Profile page contact info written to Firestore via `updateDoc` (WriteBatch with activity log entry)

#### Data Layer Infrastructure

- ✅ Tri-state `DATA_MODE` flag (`mock` / `blank` / `live`) with `localStorage` override (`sms_data_mode_v2` key)
- ✅ Live mode queries on super_admin homepage (KPI, InstitutionsTable, RecentSignups, AlertsFeed)
- ✅ `filterByInstitution` applied to all 11 list pages
- ✅ `filterBySearch` wired to all 11 list pages with per-page field configuration
- ✅ Functional pagination on all 11 list pages (`PAGE_SIZE = 20`, `useState`-driven, resets on search/navigation)

#### UI Fixes & Role Enforcement

- ✅ Navbar displays real user display name from `users/{uid}.name` in Firestore
- ✅ Lessons list: create and edit buttons now visible to teacher roles
- ✅ Exams/Assignments/Results: delete button restricted to admin roles only
- ✅ Duplicate class ID in mock data fixed
- ✅ Duplicate parent emails in mock data fixed
- ✅ `"use client"` Next.js directive removed from `FormModal.tsx`
- ✅ Attendance and Messages removed from sidebar (no pages built; routes not registered)
- ✅ Audit Logs broken quick action removed from SuperAdminPage
- ✅ Dedicated `/admin/audit-log` page built and registered in router
- ✅ Settings page hidden from sidebar for all roles
- ✅ `parent_student_links` replaced by `student_parents` junction collection in Firestore rules

#### Form System & Data Layer

- ✅ Form system refactor complete — `FormModal` registry expanded; all list-page entity forms (`TeacherForm`, `StudentForm`, `ParentForm`, `ClassForm`, `SubjectForm`, `LessonForm`, `ExamForm`, `AssignmentForm`, `ResultForm`, `EventForm`, `AnnouncementForm`) wired to Firestore via `addDoc`/`updateDoc`/`deleteDoc` (D-1, D-2, D-3, D-7 complete)
- ✅ `FormModal` dark mode fixed; `TeacherForm` and `StudentForm` update mode fixed
- ✅ Results data model rebuilt — `termId`, `assessmentName`, `maxScore` added; `gradingSystem: 'flat' | 'weighted'` added to `InstitutionDocument`; `institutions` update rule expanded to allow `institution_admin` writes (D-5 complete)
- ✅ `FeedbackCommentForm` and `list/feedback/` list page built; `FeedbackCommentDocument` type defined in `firebase.ts` (A-2 complete)
- ✅ Terms UI — `TermForm` and `list/terms/` list page built; Firestore CRUD wired (F-1 complete)
- ✅ Departments UI — `DepartmentForm` and `list/departments/` list page built; Firestore CRUD wired
- ✅ `/create-user` route extended to `institution_admin`; form component renamed `AdminCreateUserForm`

#### Reports & PDF

- ✅ Report generation — `ReportDocument` type defined with denormalized display names; `/reports` page with live Firestore queries (`onSnapshot`), role-scoped filtering, and on-demand generation panel for `institution_admin` and `senior_teacher` (A-3 complete)
- ✅ PDF export — `@react-pdf/renderer` integrated; `PDFPreviewModal` provides in-app preview (`PDFViewer`) and file download (`PDFDownloadLink`); lazy-loaded via `React.lazy` — renderer chunk excluded from initial bundle (A-5 complete)

---

### 4.1 Active

Remaining work, ordered by dependency within each group.

#### Data Layer (D)

| ID | Item | Depends on | Notes |
|---|---|---|---|
| D-4 | Wire class CRUD forms to Firestore | — | `ClassForm` wired; field coverage (`termId`, `room`, `schedule`, `enrolledStudentIds[]`) unclear — see Issue #52 |
| D-6 | Build parent–student linking UI | — | `ParentForm` writes `student_parents` junction on create/update; completeness of D-6 scope unclear — see Issue #53 |

#### Academic Features (A)

| ID | Item | Depends on | Notes |
|---|---|---|---|
| A-1 | Build Attendance page and data model | D-4 | Route `/list/attendance` unregistered; rules ready |
| A-4 | Teacher and student detail pages — read from Firestore by `:id` param | — | Currently show hardcoded content; `id` URL param is never read |

#### Profile & Settings (P)

| ID | Item | Depends on | Notes |
|---|---|---|---|
| P-1 | Add missing teacher profile fields (`employeeId`, `qualifications`) | — | Fields already in Firestore schema plan; need form UI |
| P-2 | Add missing student profile fields (`dateOfBirth`, `enrolmentId`) | — | Same |
| P-3 | WriteBatch audit log writes for admin actions | — | Each admin UI action that modifies another user's record; see [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md) |
| P-4 | Settings page implementation | — | Cards audited in [`SETTINGS_PAGE_ANALYSIS.md`](./SETTINGS_PAGE_ANALYSIS.md); five cards recommended for removal before re-exposing |

#### Messaging (M)

| ID | Item | Depends on | Notes |
|---|---|---|---|
| M-1 | Resolve Open Question #1 — in-app vs. third-party messaging | — | Blocks all messaging work; route `/list/messages` unregistered |
| M-2 | Implement messaging feature | M-1 | Scope depends on resolution of M-1 |

#### Infrastructure (I)

| ID | Item | Depends on | Notes |
|---|---|---|---|
| I-1 | Replace hardcoded August 2024 calendar dates in `data.ts` | — | Events use `new Date(2024, 7, ...)` and never appear on current-month view |
| I-2 | Server-side pagination | — | Replace client-side `slice` with Firestore cursor-based queries once live data is wired to list pages |
| I-3 | Loading states and error boundaries on list pages | — | Live mode homepage widgets have loading states; list pages do not |
| I-4 | Senior teacher departmental widgets | — | Department Overview, Department Performance, Department Alerts in `SeniorTeacherPage` |
| I-5 | GrowthChart live data | — | Requires a pre-computed stats document; computing from raw documents is read-expensive; deferred until a stats doc is introduced |
| I-6 | `userCount` / `studentCount` / `teacherCount` / `lastActiveAt` write logic on institution documents | — | These fields exist in `InstitutionDocument` type but are never written; should be updated by user creation and sign-in flows |
| I-7 | Separate dev Firebase project (`sms-dev`) | — | Removes the single-project risk where live mode reads and writes to the production Firestore database; recommended before live mode is used heavily |

---

### Open Questions to Resolve Before Building

| # | Question | Blocks |
|---|---|---|
| 1 | Messaging: in-app or third-party (email/SMS)? | M-1, M-2 |
