# School SMS — Project Specification & Codebase Analysis

> This document preserves the full contents of `School SMS Role Specification.docx.pdf` (deleted from the repo) and combines it with a comprehensive analysis of the current codebase and the gaps between the spec and the implementation.

---

## Table of Contents

1. [Role & Data Specification (from PDF)](#1-role--data-specification-from-pdf)
   - [Overview](#11-overview)
   - [Roles Summary](#12-roles-summary)
   - [Super Admin](#13-super-admin)
   - [Institution Admin](#14-institution-admin)
   - [Teacher](#15-teacher)
   - [Student](#16-student)
   - [Parent](#17-parent)
   - [Reports & Feedback Flow](#18-reports--feedback-flow)
   - [Suggested Firestore Collections](#19-suggested-firestore-collections)
   - [Security Rule Notes](#110-security-rule-notes)
   - [Open Questions for Future Iterations](#111-open-questions-for-future-iterations)
2. [Codebase Analysis](#2-codebase-analysis)
   - [Tech Stack](#21-tech-stack)
   - [Project Structure](#22-project-structure)
   - [Features Implemented](#23-features-implemented)
   - [Authentication Flow](#24-authentication-flow)
   - [Critical Issues](#25-critical-issues)
3. [Spec vs. Codebase Gap Analysis](#3-spec-vs-codebase-gap-analysis)
   - [Roles](#31-roles)
   - [Data Model](#32-data-model)
   - [Profile Fields](#33-profile-fields)
   - [Security Rules](#34-security-rules)
4. [What Needs to Be Built](#4-what-needs-to-be-built)

---

## 1. Role & Data Specification (from PDF)

### 1.1 Overview

This document defines the five user roles in the school SMS platform and specifies the data each role can access, create, or modify. The intent is to give the backend engineer enough detail to design the Firestore collections, document relationships, and security rules.

The platform is **multi-tenant**: a single deployment serves multiple institutions (schools). Each institution's data must be isolated from the others, with the exception of the Super Admin tier.

---

### 1.2 Roles Summary

| Role | Scope |
|---|---|
| **Super Admin** | Our organisation. Full access across every institution on the platform. |
| **Institution Admin** | One per client school (e.g. Herbert Morrison, Cornwall). Access limited to their own institution's data only. |
| **Teacher** | Access limited to classes they are assigned to teach within their institution. |
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

#### Data the Super Admin manages

- **Institutions:** name, address, contact info, subscription/plan, status (active/suspended).
- **Institution Admins:** name, email, phone, assigned institution.
- **Platform-wide reports:** user counts, active institutions, billing summaries.

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
- Define classes — class name, subject, schedule, room, term/semester.
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
- Institution ID (which school they belong to)
- Role flag (`institution_admin`)

---

### 1.5 Teacher

#### Responsibilities

- View their assigned classes and class schedules.
- View the roster of students in each class they teach.
- Upload and edit grades for students in their classes.
- Submit written feedback for each student per term/semester.
- View attendance for their classes (attendance is recorded manually — no biometric sync).
- Communicate with parents of students in their classes.

#### Data the Teacher manages

- **Grades:** create and edit grades only for students enrolled in classes they teach.
- **Feedback comments:** submit written feedback per student per term. Comments are stored independently and pulled into reports automatically when generated.
- **Attendance:** mark attendance for their class sessions.
- **Class roster:** read-only view (admin manages enrolment).

#### Profile fields

- Full name
- Email
- Phone number
- Employee ID
- Subject(s) taught
- Qualifications (optional)
- Institution ID
- Role flag (`teacher`)

#### Restrictions

- Cannot view data for students they do not teach.
- Cannot create classes or assign themselves to classes — only Institution Admin can.

---

### 1.6 Student

#### Responsibilities

- View their own grades, attendance, and class timetable.
- Generate their own end-of-term/semester report.
- Receive messages from teachers and parents.

#### Data the Student accesses

- **Own grades:** read-only.
- **Own attendance:** read-only.
- **Own timetable:** derived from classes they are enrolled in.
- **Own reports:** generated on demand. The report pulls all grades for the selected term plus all teacher feedback comments submitted for that student in that term.

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

- **Linked children:** one parent may be linked to multiple students. The dashboard must show all linked children and let the parent switch between them.
- **Per-child grades, attendance, timetable, reports:** read-only.

#### Profile fields

- Full name
- Email
- Phone number
- Linked student IDs (one or more)
- Institution ID
- Role flag (`parent`)

#### Restrictions

- Cannot view data for students they are not linked to.
- Cannot edit any academic data.

---

### 1.8 Reports & Feedback Flow

Reports are generated on demand by the student (and viewable by the parent and admin). The flow is as follows:

- Teachers submit feedback comments for each student per term, **independently** of the report. Feedback is stored against `studentId + teacherId + classId + termId`.
- When a report is generated, the system pulls every grade for that student in the selected term, plus every feedback comment submitted by that student's teachers for the same term.
- This means teachers do not need to be online or available at report time — they simply ensure feedback is submitted before the term closes.
- Institution Admin can view and re-generate any report across the school.

```
Teacher submits feedback
  └── stored against (studentId + teacherId + classId + termId)

Student requests report for a term
  └── System pulls:
        ├── all grades for that student in that term
        └── all feedback_comments for that student in that term
              └── Report is read-only for: Student, Parent, Institution Admin
```

---

### 1.9 Suggested Firestore Collections

> The following is a suggested high-level structure. Final schema is the backend engineer's call.

| Collection | Key Fields |
|---|---|
| `institutions` | id, name, address, contact, plan, status |
| `users` | id, role, name, email, phone, institutionId, plus role-specific fields (employeeId, enrolmentId, linkedStudentIds, etc.) |
| `classes` | id, institutionId, name, subject, teacherId, schedule, room, termId, enrolledStudentIds[] |
| `terms` | id, institutionId, name, startDate, endDate |
| `grades` | id, studentId, classId, teacherId, termId, assessmentName, score, maxScore, date |
| `attendance` | id, studentId, classId, date, status (present/absent/late) |
| `feedback_comments` | id, studentId, teacherId, classId, termId, comment, createdAt |
| `reports` | id, studentId, termId, generatedAt — generated on demand from grades + feedback_comments |
| `parent_student_links` | parentId, studentId — supports many-to-many |

---

### 1.10 Security Rule Notes

- Every non-Super-Admin document should carry an `institutionId`. Security rules must enforce that users can only read/write documents matching their own `institutionId`.
- Teachers may only write to `grades`, `attendance`, and `feedback_comments` where `teacherId` matches their own user ID.
- Students may only read documents where `studentId` matches their own user ID.
- Parents may only read documents where `studentId` is in their `linkedStudentIds`.
- Super Admin bypasses institution scoping but should still be auditable.

---

### 1.11 Open Questions for Future Iterations

1. **Messaging:** Should it be in-app messaging, or email/SMS via a third-party provider?
2. **Grades:** Should grades support multiple assessment types per class (quiz, midterm, final) with weighted averaging?
3. **Reports:** Should reports be exportable as PDF, or only viewable in-app?
4. **Audit log:** Do we need a record of who viewed/edited what, especially for grades and feedback?

---

## 2. Codebase Analysis

### 2.1 Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18.3.1 + TypeScript 5.6.2 |
| Build Tool | Vite 6.0.1 |
| Routing | React Router DOM 7.0.2 |
| Styling | Tailwind CSS 3.4.16 (dark mode, custom `lama*` color palette) |
| Forms | React Hook Form 7.53.2 + Zod 3.23.8 |
| Charts | Recharts 2.14.1, react-big-calendar 1.16.3, react-calendar 5.1.0 |
| Backend/Auth | Firebase 12.13.0 (Firestore + Authentication) |
| Date utilities | moment 2.30.1 |
| Linting | ESLint 9.15.0 with TypeScript + React Hooks plugins |

---

### 2.2 Project Structure

```
sms-system/
├── public/                      # Static assets (icons, logos, feature images)
└── src/
    ├── App.tsx                  # Root routing + role-based redirects
    ├── main.tsx                 # React entry point
    ├── index.css                # Global styles
    ├── components/              # Reusable UI components
    │   ├── FormModal.tsx        # Create/Update/Delete modal (React.lazy per form)
    │   ├── Table.tsx            # Generic table renderer with typed column definitions
    │   ├── InputField.tsx       # Form input wrapper with Zod error display
    │   ├── Navbar.tsx           # Top bar (search, theme toggle, role switcher in dev)
    │   ├── Menu.tsx             # Role-filtered sidebar navigation
    │   ├── Protected.tsx        # Auth guard — redirects to /login if unauthenticated
    │   ├── Pagination.tsx       # Table pagination
    │   ├── TableSearch.tsx      # Search input (renders only — no filter logic)
    │   ├── AttendanceChart.tsx  # Recharts bar chart
    │   ├── FinanceChart.tsx     # Recharts bar chart
    │   ├── CountChart.tsx       # Recharts radial bar chart
    │   ├── BigCalender.tsx      # react-big-calendar week/day view
    │   ├── EventCalendar.tsx    # Mini react-calendar + event sidebar
    │   ├── Announcements.tsx    # Announcement feed component
    │   └── forms/
    │       ├── StudentForm.tsx
    │       ├── TeacherForm.tsx
    │       └── ...              # Other entity forms
    ├── scenes/                  # Page-level components (organised by route)
    │   ├── (auth)/
    │   │   └── login/           # Login page
    │   └── (dashboard)/
    │       ├── DashboardLayout.tsx   # Sidebar + Navbar shell
    │       ├── admin/           # Admin home (metrics cards + charts)
    │       ├── teacher/         # Teacher home (schedule + announcements)
    │       ├── student/         # Student home (calendars + announcements)
    │       ├── parent/          # Parent home (minimal)
    │       ├── list/            # Data list pages
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
    │       │   └── announcements/
    │       ├── profile/         # Role-aware profile page
    │       └── settings/        # Role-aware settings page
    └── lib/
        ├── firebase.ts          # Firebase app initialisation
        ├── authService.ts       # Login logic (mock or real API, env-toggled)
        ├── auth.ts              # Token/role helpers (localStorage read/write)
        ├── AuthContext.tsx      # Firebase auth context (defined, partially wired)
        ├── theme.ts             # Dark mode toggle with localStorage persistence
        └── data.ts              # All hardcoded mock data for every entity
```

---

### 2.3 Features Implemented

**Role-based dashboards (4 roles):** Each role gets a filtered sidebar menu and a custom home page.

| Dashboard | Content |
|---|---|
| Admin | Metric cards (student/teacher/parent/staff counts), bar + radial charts |
| Teacher | Schedule calendar, announcements feed |
| Student | BigCalendar (week view), EventCalendar (mini), announcements feed |
| Parent | Minimal — placeholder structure |

**Data list pages** (all with Table + Pagination + Search UI):
- Teachers, Students, Parents, Classes, Subjects, Lessons, Exams, Assignments, Results, Events, Announcements

**CRUD modals** with Zod-validated forms for most entities, using `React.lazy` to code-split each form.

**UI components:**
- Recharts bar and radial charts
- react-big-calendar (week/day views) and react-calendar (mini picker)
- Announcement feed
- Role switcher in Navbar (dev-only)
- Class-based dark mode with localStorage persistence

**User management:** Profile page and Settings page, both role-aware.

---

### 2.4 Authentication Flow

```
Login form (email + password)
    └── authService.login()
          ├── Mock mode (VITE_API_URL not set)
          │     └── Returns hardcoded { token: "mock-token", role: "admin" }
          └── Real mode (VITE_API_URL is set)
                └── POST ${VITE_API_URL}/auth/login → { token, role }

Both paths:
    └── localStorage.setItem("token", ...) + localStorage.setItem("role", ...)
          └── Navigate to role-based dashboard
```

`Protected.tsx` checks `localStorage` on every route access and redirects to `/login` if no token or role is present.

**Firebase `AuthContext.tsx`** is defined and imports Firebase auth, but is **not the actual source of truth** for the login flow — it runs in parallel and is not fully integrated.

---

### 2.5 Critical Issues

#### No data persistence
All CRUD operations in forms (create, update, delete) either log to the console or are no-ops. Nothing writes to Firestore or any API. The mock data in `data.ts` is the only data source.

#### Firebase auth not integrated
`AuthContext.tsx` exists but login bypasses Firebase entirely. The flow writes directly to `localStorage` without creating a Firebase session. Role information is not fetched from Firestore.

#### Duplicate data IDs
`data.ts` defines two class entries both with `id: 5` — classes "5A" and "5B".

#### `any` types in forms
`FormModal` and several form components use `any` for their data parameter, losing TypeScript type safety at the point of submission.

#### Hardcoded 2024 dates
Calendar events in `data.ts` use static 2024 timestamps instead of dynamic dates relative to the current date.

#### Routes without pages
`/list/messages` and `/list/attendance` are defined in the router but have no rendered component or page.

#### Search is visual-only
`TableSearch` renders an input element but contains no logic to filter the table data.

#### Full data loaded on every list page
No server-side pagination — the entire mock array is rendered and sliced client-side. This will not scale.

#### No loading or error states
No loading indicators for async operations, no React error boundaries, no empty-state handling.

---

## 3. Spec vs. Codebase Gap Analysis

### 3.1 Roles

| Spec | Current Code | Gap |
|---|---|---|
| 5 roles: `super_admin`, `institution_admin`, `teacher`, `student`, `parent` | 4 roles: `admin`, `teacher`, `student`, `parent` | `super_admin` is entirely absent. `admin` maps loosely to `institution_admin` but uses the wrong flag name. |
| Platform is multi-tenant (per `institutionId`) | No `institutionId` concept anywhere | **Critical** — the entire multi-tenancy layer is absent. |
| `institution_admin` role flag | Code uses string `"admin"` | Role flag naming does not match the spec. |

### 3.2 Data Model

| Spec Collection | Current State | Gap |
|---|---|---|
| `institutions` | Does not exist | Missing entirely — multi-tenancy cannot be implemented without it. |
| `terms` | Does not exist | Missing entirely — grades, feedback, and reports all depend on `termId`. |
| `grades` with `termId`, `assessmentName`, `maxScore` | `results` in `data.ts` has `score` and `type` only | Missing `termId`, `maxScore`, `assessmentName`. Cannot group by academic period. |
| `feedback_comments` | Does not exist | Missing entirely — core of the report generation flow. |
| `reports` (generated on demand) | Does not exist | Missing entirely — no report generation logic anywhere. |
| `parent_student_links` (many-to-many junction) | Parent has an inline `students[]` array | Not a proper junction collection; makes Firestore security rule enforcement impossible. |
| `classes` with `termId`, `room`, `schedule`, `enrolledStudentIds[]` | Classes have only `name`, `capacity`, `grade`, `supervisor` | Missing `termId`, `room`, `schedule`, `enrolledStudentIds[]`. |
| `attendance` with status (`present`/`absent`/`late`) | Route exists, no data model or page component | Missing entirely. |
| `users` with `institutionId` on every record | No field on any record | Every user document is missing institution scoping. |

### 3.3 Profile Fields

| Role | Spec Requires | Code Has | Missing |
|---|---|---|---|
| Teacher | `employeeId`, `qualifications`, `institutionId` | `name`, `email`, `phone`, `subjects[]`, `classes[]`, `address`, `photo` | `employeeId`, `qualifications`, `institutionId` |
| Student | `dateOfBirth`, `enrolmentId`, `institutionId` | `name`, `email`, `phone`, `grade`, `class`, `address`, `photo` | `dateOfBirth`, `enrolmentId`, `institutionId` |
| Parent | `linkedStudentIds[]`, `institutionId` | `students[]` (inline array, different structure) | `institutionId`; `students[]` needs to become `linkedStudentIds[]` referencing `parent_student_links` |
| Institution Admin | `institutionId`, role flag `institution_admin` | Role flag `"admin"`, no `institutionId` | `institutionId`, correct role flag |
| Super Admin | role flag `super_admin`, platform-wide access | Does not exist | Entire role and dashboard |

### 3.4 Security Rules

| Spec Requirement | Current State |
|---|---|
| Every document carries `institutionId` | No document in the codebase has `institutionId` |
| Teachers write only where `teacherId === their UID` | No Firestore security rules written |
| Students read only where `studentId === their UID` | No Firestore security rules written |
| Parents read only where `studentId` is in `linkedStudentIds` | No Firestore security rules written |
| Super Admin bypasses institution scoping (but is auditable) | Role does not exist |
| Institution-level data isolation | Not implemented |

---

## 4. What Needs to Be Built

Listed in dependency order (items earlier in the list must be done before later items).

### Phase 1 — Foundation

1. **Add `institutionId` to every Firestore document.** This is the prerequisite for multi-tenancy and all security rules.
2. **Implement the `institutions` collection.** Super Admin creates and manages institutions; every other entity belongs to one.
3. **Add the `super_admin` role** with a platform-level dashboard (institution list, user counts, billing status, ability to create Institution Admin accounts).
4. **Rename `admin` → `institution_admin`** throughout the codebase to match the spec role flags.
5. **Implement `terms` / semesters** as a first-class Firestore collection, linked to `institutionId`. All grades, feedback, and reports pivot on `termId`.

### Phase 2 — Core Academic Data

6. **Wire CRUD operations to Firestore** — currently all forms are no-ops. Start with teachers, students, and classes.
7. **Rebuild the `classes` data model** to include `termId`, `room`, `schedule` (days/times), `enrolledStudentIds[]`.
8. **Rebuild the `grades` data model** to include `termId`, `assessmentName`, `maxScore`. Replace the current `results` mock data.
9. **Build the `attendance` page and data model** with `status: present | absent | late` per student per class session.
10. **Implement `feedback_comments` collection** — Teacher form per student per term with `studentId + teacherId + classId + termId` composite key.
11. **Replace `parent.students[]` with `parent_student_links`** junction collection to support many-to-many and enable proper security rules.

### Phase 3 — Authentication & Security

12. **Fully integrate Firebase Authentication** — replace the current `localStorage`-only flow with Firebase session management. Store role and `institutionId` in Firestore `users` collection and read them on login.
13. **Write Firestore security rules** per Section 10 of the spec:
    - Institution scoping on all non-Super-Admin documents
    - Teacher write access scoped to their own `teacherId`
    - Student read access scoped to their own `studentId`
    - Parent read access scoped to their `linkedStudentIds`
14. **Add missing profile fields** to user documents: `employeeId` and `qualifications` for teachers; `dateOfBirth` and `enrolmentId` for students.

### Phase 4 — Reports & Advanced Features

15. **Implement report generation** — on-demand query that joins `grades` + `feedback_comments` for a given `studentId + termId`. Viewable by student, parent, and institution admin.
16. **Implement search/filter logic** in all list pages — `TableSearch` currently renders but does not filter.
17. **Implement the messaging feature** — resolve Open Question 1 (in-app vs. third-party) before building; the `/list/messages` route is already registered.
18. **Fix the duplicate class ID** in `data.ts` (two entries both use `id: 5`).
19. **Replace hardcoded 2024 calendar dates** in `data.ts` with dynamic dates.
20. **Add server-side pagination** to all list pages — currently loads full dataset client-side.
21. **Add loading states and error boundaries** throughout the UI.

### Open Questions to Resolve Before Building

| # | Question | Blocks |
|---|---|---|
| 1 | Messaging: in-app or third-party (email/SMS)? | Phase 4, item 17 |
| 2 | Grades: multiple assessment types with weighted averaging? | Phase 2, item 8 |
| 3 | Reports: PDF export or in-app view only? | Phase 4, item 15 |
| 4 | Audit log: track who viewed/edited grades and feedback? | Phase 3, item 13 |
