# Role Privilege Analysis — School Management Dashboard

> **Generated:** 2026-05-27 · **Last updated:** 2026-05-29
> **Branch:** `mvp` (reflects form system refactor — Stages 1–3)
> **Scope:** Cross-reference of `sms-role-specification-v1.md`, `firebase-rules.md`, `App.tsx`, `Menu.tsx`, and all list/dashboard page components.

---

## The Six Roles

| Role | Description |
|---|---|
| `super_admin` | Platform owner. Cross-institution. No access restrictions. |
| `institution_admin` | School administrator. Full access inside their institution only. |
| `senior_teacher` | Head of department. Teaches own classes plus departmental oversight. |
| `regular_teacher` | Teacher. Manages their own classes and academic content only. |
| `student` | Reads their own data only. |
| `parent` | Reads their linked child's data only. |

All users except `super_admin` are strictly scoped to their `institutionId` — they cannot see or touch any other school's data. The `super_admin` uses the sentinel value `'*'` to bypass institution checks everywhere.

---

## Route Access

### Homepage Routing (`App.tsx`)

Each role is directed to a distinct dashboard component on load:

| Role | Homepage component |
|---|---|
| `super_admin` | `SuperAdminPage` |
| `institution_admin` | `AdminPage` |
| `senior_teacher` | `SeniorTeacherPage` |
| `regular_teacher` | `RegularTeacherPage` |
| `student` | `StudentPage` |
| `parent` | `ParentPage` |

The route `/create-user` is the only hard-guarded route in the router — it is accessible to `super_admin` and `institution_admin`; all other roles are redirected to `/`. All other routes are accessible to any authenticated user; role-based visibility is enforced inside each page component.

---

## Sidebar Navigation (`Menu.tsx`)

| Menu Item | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Home (`/`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create User (`/create-user`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Teachers | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Students | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Parents | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Subjects | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Classes | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Lessons | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Exams | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assignments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Results | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Attendance ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Events | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Messages ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Announcements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> ⚠️ **Attendance** (`/list/attendance`) and **Messages** (`/list/messages`) appear in the sidebar for every role but have **no registered route** — clicking either link renders a blank view (ISSUES_AND_GAPS #1).

---

## List Page CRUD — UI Layer

This reflects what the current component code actually renders on screen. Where the spec and UI diverge, a note follows.

### Teachers (`/list/teachers`)

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View list | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View detail (`/list/teachers/:id`) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create (→ `/create-user`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete (FormModal) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit | ❌ *(no edit button in list — edit via detail page)* | ❌ | ❌ | ❌ | ❌ | ❌ |

### Students (`/list/students`)

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View list | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View detail (`/list/students/:id`) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create (→ `/create-user`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete (FormModal) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Lessons (`/list/lessons`)

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View list | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create | ✅ | ✅ | ❌ ⚠️ | ❌ ⚠️ | ❌ | ❌ |
| Update / Delete | ✅ | ✅ | ❌ ⚠️ | ❌ ⚠️ | ❌ | ❌ |

> ⚠️ **Spec gap:** The role spec (§4.3) and Firestore rules both grant teachers the right to **create and edit their own lessons**. The UI only shows these buttons to `institution_admin` and `super_admin`. This is a missing UI affordance — the backend would permit the write.

### Exams (`/list/exams`) · Assignments (`/list/assignments`)

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update (edit) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Results (`/list/results`)

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update score/date (FormModal) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> **Results create removed:** Result creation is deferred to the future Gradebook feature. The create button has been removed from the Results page for all roles.

### Parents (`/list/parents`)

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View list | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create (→ `/create-user`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Update phone/address (FormModal) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete (FormModal) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> Name and email are Firebase Auth credentials — they are not editable through the Firestore form. Linked students (via `student_parents` junction) require a multi-select UI and are deferred (OI-2).

### Classes, Subjects — read-only for teachers

These pages carry no create/edit/delete UI actions for teachers, students, or parents. Only `super_admin` and `institution_admin` see action buttons, consistent with the spec.

---

## Dashboard Widgets by Role

### `super_admin` — `SuperAdminPage`

- **KPI strip:** Total Institutions, Total Users (all roles), Active Institutions (30d), Super Admins *(all hardcoded — ISSUES_AND_GAPS #7)*
- **Quick actions:** Onboard Institution → `/create-user` · Send Announcement → `/list/announcements` · Manage Admins → `/settings` · Audit Logs → `/audit-log` *(broken route — ISSUES_AND_GAPS #2)*
- **Institutions table** (`InstitutionsTable`)
- **Recent sign-ups** (`RecentSignups`)
- **Growth chart** (`GrowthChart`)
- **Alerts feed** (`AlertsFeed`)

### `institution_admin` — `AdminPage`

- **KPI cards:** Students, Teachers, Parents, Staff counts (`UserCard`)
- **Count chart** — student/teacher gender breakdown
- **Attendance chart** — weekly attendance trend
- **Finance chart**
- **Right rail:** `EventCalendar`, `Announcements`

### `senior_teacher` — `SeniorTeacherPage`

- **Department Overview** *(placeholder — "coming soon")*
- **Department Performance** *(placeholder — "coming soon")*
- **Department Alerts** *(placeholder — "coming soon")*
- **BigCalendar** — personal schedule
- **Announcements**

### `regular_teacher` — `RegularTeacherPage`

- **BigCalendar** — personal schedule
- **Announcements**

> The absence of Department widgets is the key visual distinction between the two teacher dashboards.

### `student` — `StudentPage`

- **BigCalendar** — class schedule *(hardcoded "4A")*
- **EventCalendar**
- **Announcements**

### `parent` — `ParentPage`

- **BigCalendar** — child's schedule *(hardcoded "John Doe")*
- **Announcements**

---

## Profile Page — Role-Specific Sections (`/profile`)

All roles see: Contact info (name and phone editable, email read-only), Security, Preferences, Account details (read-only metadata), Role-specific details panel, Activity log.

**Sections exclusive to `institution_admin` and `super_admin`:**

- **Audit and security events** — sensitive admin actions such as password resets and role changes
- **Admin controls** — edit another user's status, department, contact info, permissions, and trigger password resets

**Role-specific details panel content:**

| Role | Fields |
|---|---|
| `super_admin` | Access level, Institutions managed, Permissions |
| `institution_admin` | Department, Campus, Permissions, Linked relationships |
| `regular_teacher` | Employee ID, Department, Subjects, Assigned classes, Schedule, Metrics |
| `senior_teacher` | Same as regular_teacher + **Department Head: Yes** |
| `student` | Student ID, Grade/class, Homeroom, Guardians, Attendance summary, GPA |
| `parent` | Linked students, Relationship, Student performance, Attendance |

---

## Settings Page — Role-Specific Sections (`/settings`)

All roles see: Account (password, 2FA, sessions, security alerts), Notifications (email/SMS/push, digest frequency), Preferences (language, timezone, date format, theme), Privacy (profile visibility, data sharing), Accessibility (text size, contrast, motion).

**Teacher-only sections** (`regular_teacher` | `senior_teacher`):

| Section | Contents |
|---|---|
| Gradebook preferences | Grade scale view (Letter / Percentage / GPA), default grade categories |
| Class defaults | Auto-close attendance toggle, late work penalty policy |
| Assignment notifications | Missing-work reminders to students, daily submission digest |

**Student-only sections:**

| Section | Contents |
|---|---|
| Student notifications | Assignment due reminders, exam schedule alerts, results-published alerts |
| Student privacy | Controls over who can see their information |

**Privacy toggle difference:**
The "Share data with guardians" toggle defaults to **off** for both teacher roles and **on** for all other roles.

---

## Firestore Security Rules

The Firebase rules are the authoritative enforcement layer. Below is a condensed summary.

### Helper functions

```
isSuperAdmin()              → role == 'super_admin'
isAdmin()                   → role == 'institution_admin'
isAdminOrAbove()            → super_admin OR institution_admin
isTeacher()                 → role == 'senior_teacher' OR 'regular_teacher'
isTeacherOrAbove()          → any of the above four roles
isParent()                  → role == 'parent'
isOwner(uid)                → request.auth.uid == uid
sameInstitution(id)         → super_admin OR myInstitutionId == id
isClassTeacherFor(classId)  → isTeacher() AND classes/{classId}.classTeacherId == uid
isSeniorTeacherFor(deptId)  → role == 'senior_teacher' AND teachers/{uid}.departmentId == deptId
```

**Two invariants enforced on every update:**
- `roleNotChanged()` — no user can change their own role
- `institutionNotChanged()` — no document can be moved between institutions

### Collection-level permissions

| Collection | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|---|---|---|---|---|---|
| **users** | Full CRUD | Read/Create/Update own institution | Read all + edit own profile | Read all + edit own profile | Read + edit own profile | Read + edit own profile |
| **subjects** | Full CRUD | Full CRUD own institution | Read own institution | Read own institution | Read own institution | Read own institution |
| **classes** | Full CRUD | Full CRUD own institution | Read own institution | Read own institution | Read own institution | Read own institution |
| **terms** | Full CRUD | Full CRUD own institution | Read only | Read only | Read only | Read only |
| **departments** | Full CRUD | Full CRUD own institution | Read only | Read only | Read only | Read only |
| **teachers** | Full CRUD | Full CRUD own institution | Read all + edit own profile | Read all + edit own profile | Read all | Read all |
| **students** | Full CRUD | Full CRUD own institution | Read all | Read all | Own profile only | Linked child only |
| **parents** | Full CRUD | Full CRUD own institution | Read all | Read all | ❌ | Own profile only |
| **lessons** | Full CRUD | Full CRUD own institution | Create + edit own OR dept | Create + edit own only | ❌ | ❌ |
| **exams** | Full CRUD | Full CRUD own institution | Create + edit own OR dept | Create + edit own only | ❌ | ❌ |
| **assignments** | Full CRUD | Full CRUD own institution | Create + edit own OR dept | Create + edit own only | ❌ | ❌ |
| **results** | Full CRUD | Full CRUD own institution | Create + edit own OR dept | Create + edit own only | Own results only | Linked child's only |
| **attendance** | Full CRUD | Full CRUD own institution | Create/edit in own dept | Create/edit as class teacher only | Own records only | Linked child's only |
| **events** | Full CRUD | Full CRUD own institution | Read only | Read only | Read only | Read only |
| **announcements** | Full CRUD | Full CRUD own institution | Read only | Read only | Read only | Read only |
| **audit_logs** | Read only | ❌ | ❌ | ❌ | ❌ | ❌ |
| **teacher_subjects** | Full CRUD | Full CRUD own institution | Read only | Read only | ❌ | ❌ |
| **teacher_classes** | Full CRUD | Full CRUD own institution | Read only | Read only | ❌ | ❌ |
| **student_parents** | Full CRUD | Full CRUD own institution | Read only | Read only | Own link only | Own link only |

> **Default deny** — all collections not listed above are inaccessible to every role. Firestore rules close with `match /{document=**} { allow read, write: if false; }`.

---

## Spec vs. Implementation Gap Summary

| # | Gap | Spec says | UI does | Firestore rules |
|---|---|---|---|---|
| 1 | ~~**Lessons — teacher create/edit**~~ ✅ **Resolved 2026-05-27** | Teachers can create and edit their own lessons | ~~Create/edit buttons are admin-only~~ Both teacher roles now see create and update buttons | ✅ Correctly permits teachers |
| 2 | ~~**Exams / Assignments / Results — teacher delete button**~~ ✅ **Resolved 2026-05-27** | Teachers cannot delete; admin-only | ~~Delete button is shown to both teacher roles~~ Delete button is now admin-only (`institution_admin` \| `super_admin`) | ✅ Correctly enforces admin-only delete |
| 3 | **Senior vs. regular teacher scope on edit** | Senior edits anything in dept; regular edits only own | Both roles treated identically in the UI | ✅ Correctly differentiated |
| 4 | **Attendance page** | All roles have access per spec | Route `/list/attendance` does not exist | ✅ Rules are ready |
| 5 | **Audit Logs page** | Readable by super_admin only | Quick action links to `/audit-log` — no route registered | ✅ Rules are ready |
| 6 | **Student / teacher detail pages** | Reads from Firestore by `:id` param | Content is fully hardcoded; `id` param is never read | N/A |
| 7 | **Super Admin KPI cards** | Live aggregate or `count()` queries | Hardcoded string values | N/A |
| 8 | **Multi-tenancy `institutionId` filter** | All collection queries scoped by institution | No Firestore queries exist yet; all data is mock | ✅ Rules enforce scoping on every read/write |

> The Firestore rules layer is the most complete and correct. The primary gaps are in the UI — teachers are missing lesson action buttons, teachers are incorrectly shown delete buttons on academic content, and all data remains hardcoded mock data pending the data layer build-out.

---

*End of Role Privilege Analysis. Cross-reference with `sms-role-specification-v1.md` (authoritative spec) and `firebase-rules.md` (authoritative enforcement) for full detail.*
