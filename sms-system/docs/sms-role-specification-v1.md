# School Management System — Role-Based Specification

**Version 1.1** — Living document

---

## About this document

### What it is

A specification covering the six user roles in the SMS, how their dashboards work, what they can do, and what they can see. Each role section has two parts:

- **Technical spec** — written for the engineering team
- **Plain English** — written for non-technical stakeholders (school administrators, project sponsors, reviewers)

Both describe the same role; the technical version names collections and fields, the plain English version doesn't.

### How to read it

- **Engineers**: skim the plain English for context, then build from the technical spec.
- **Non-technical readers**: stick to the plain English sections. The technical bits are safe to ignore.
- **Reviewers**: read both for the role you're reviewing — the technical version surfaces design decisions the plain version smooths over.

### Continuous development

This is **Version 1**, not a final spec. The SMS is being built iteratively and this document will keep evolving alongside the product. Several decisions are explicitly deferred (see Part 5 — Open Items). Some features are sketched but not fully detailed (the `audit_logs` schema, for example). When in doubt, **ask — don't assume silence means "out of scope."**

Updates to this doc should bump the version number at the top and add an entry to the changelog at the bottom.

---

# Part 1 — Foundation

## 1.1 The six roles

| Role                | Who they are                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `super_admin`       | Platform owner. Sees and manages everything across all institutions (schools).                                                             |
| `institution_admin` | School administrator. Manages everything within their school.                                                                              |
| `regular_teacher`   | Regular teacher at the school. Manages their own assigned classes, lessons, exams, assignments, and results only.                          |
| `senior_teacher`    | Senior teacher (head of department). All `regular_teacher` capabilities plus departmental oversight and edit access across the department. |
| `student`           | Student at the school. Sees their own data only.                                                                                           |
| `parent`            | Parent or guardian. Sees their linked child(ren)'s data only.                                                                              |

## 1.2 Core access matrix

Every user belongs to an institution. Data is strictly scoped — a user from one school cannot see or touch data from another school. The `super_admin` is the only role that can cross institutions.

### users

Login profile for every person in the system (role, institutionId, name, etc.)

| Role                                                | Read                        | Create          | Update                                               | Delete |
| --------------------------------------------------- | --------------------------- | --------------- | ---------------------------------------------------- | ------ |
| super_admin                                         | All users, all institutions | Yes             | Yes                                                  | Yes    |
| institution_admin                                   | Own institution             | Own institution | Own institution (cannot change role)                 | No     |
| regular_teacher / senior_teacher / student / parent | Own profile only            | No              | Own profile only (cannot change role or institution) | No     |

### subjects

Courses offered at the school.

| Role                                                | Read            | Write           |
| --------------------------------------------------- | --------------- | --------------- |
| super_admin                                         | All             | All             |
| institution_admin                                   | Own institution | Own institution |
| regular_teacher / senior_teacher / student / parent | Own institution | No              |

### classes

Class groups within the school.

| Role                                                | Read            | Write           |
| --------------------------------------------------- | --------------- | --------------- |
| super_admin                                         | All             | All             |
| institution_admin                                   | Own institution | Own institution |
| regular_teacher / senior_teacher / student / parent | Own institution | No              |

### teachers

Teacher profile records (linked to user accounts).

| Role                             | Read            | Create          | Update           | Delete          |
| -------------------------------- | --------------- | --------------- | ---------------- | --------------- |
| super_admin                      | All             | All             | All              | All             |
| institution_admin                | Own institution | Own institution | Own institution  | Own institution |
| regular_teacher / senior_teacher | Own institution | No              | Own profile only | No              |
| student / parent                 | Own institution | No              | No               | No              |

### students

Student profile records.

| Role                             | Read                    | Create          | Update           | Delete          |
| -------------------------------- | ----------------------- | --------------- | ---------------- | --------------- |
| super_admin                      | All                     | All             | All              | All             |
| institution_admin                | Own institution         | Own institution | Own institution  | Own institution |
| regular_teacher / senior_teacher | Own institution         | No              | No               | No              |
| student                          | Own profile only        | No              | Own profile only | No              |
| parent                           | Only their linked child | No              | No               | No              |

### parents

Parent profile records.

| Role                             | Read             | Create          | Update           | Delete          |
| -------------------------------- | ---------------- | --------------- | ---------------- | --------------- |
| super_admin                      | All              | All             | All              | All             |
| institution_admin                | Own institution  | Own institution | Own institution  | Own institution |
| regular_teacher / senior_teacher | Own institution  | No              | No               | No              |
| student                          | No               | No              | No               | No              |
| parent                           | Own profile only | No              | Own profile only | No              |

### lessons / exams / assignments

Same access pattern for all three.

| Role              | Read            | Create          | Update                       | Delete          |
| ----------------- | --------------- | --------------- | ---------------------------- | --------------- |
| super_admin       | All             | All             | All                          | All             |
| institution_admin | Own institution | Own institution | Own institution              | Own institution |
| regular_teacher   | Own institution | Own institution | Only ones they own           | No              |
| senior_teacher    | Own institution | Own institution | Anything in their department | No              |
| student / parent  | Own institution | No              | No                           | No              |

### results

Student scores on exams or assignments.

| Role              | Read                      | Create          | Update                         | Delete          |
| ----------------- | ------------------------- | --------------- | ------------------------------ | --------------- |
| super_admin       | All                       | All             | All                            | All             |
| institution_admin | Own institution           | Own institution | Own institution                | Own institution |
| regular_teacher   | Own institution           | Own institution | Only results they entered      | No              |
| senior_teacher    | Own institution           | Own institution | Any result in their department | No              |
| student           | Only their own            | No              | No                             | No              |
| parent            | Only their linked child's | No              | No                             | No              |

### attendance

Daily attendance records (one per student per school day).

| Role                    | Read                      | Create                               | Update                               | Delete          |
| ----------------------- | ------------------------- | ------------------------------------ | ------------------------------------ | --------------- |
| super_admin             | All                       | All                                  | All                                  | All             |
| institution_admin       | Own institution           | Own institution                      | Own institution                      | Own institution |
| class teacher           | Own institution           | For classes they're class teacher of | For classes they're class teacher of | No              |
| senior_teacher          | Own institution           | In their department                  | In their department                  | No              |
| regular_teacher (other) | Own institution           | No                                   | No                                   | No              |
| student                 | Their own only            | No                                   | No                                   | No              |
| parent                  | Their linked child's only | No                                   | No                                   | No              |

### events / announcements

| Role                                                | Read            | Write           |
| --------------------------------------------------- | --------------- | --------------- |
| super_admin                                         | All             | All             |
| institution_admin                                   | Own institution | Own institution |
| regular_teacher / senior_teacher / student / parent | Own institution | No              |

### terms

School year grading periods.

| Role                                                | Read            | Write           |
| --------------------------------------------------- | --------------- | --------------- |
| super_admin                                         | All             | All             |
| institution_admin                                   | Own institution | Own institution |
| regular_teacher / senior_teacher / student / parent | Own institution | No              |

### departments

Academic departments.

| Role                                                | Read            | Write           |
| --------------------------------------------------- | --------------- | --------------- |
| super_admin                                         | All             | All             |
| institution_admin                                   | Own institution | Own institution |
| regular_teacher / senior_teacher / student / parent | Own institution | No              |

### audit_logs

System-written log of sensitive actions.

| Role            | Read | Write       |
| --------------- | ---- | ----------- |
| super_admin     | All  | System only |
| All other roles | No   | No          |

### Junction collections

| Collection         | Links                                    | Managed by                      |
| ------------------ | ---------------------------------------- | ------------------------------- |
| `teacher_subjects` | A teacher to subjects they teach         | institution_admin / super_admin |
| `teacher_classes`  | A teacher to classes they're assigned to | institution_admin / super_admin |
| `student_parents`  | A student to their parent/guardian       | institution_admin / super_admin |

## 1.3 Key rules

1. **Default deny** — if a collection isn't listed, no one can access it.
2. **Institution isolation** — every document has an `institutionId`. Users can only read/write documents sharing their `institutionId`. The super_admin bypasses this.
3. **Role is locked** — no user can change their own role. Only an admin can update another user's role.
4. **Institution is locked** — no one can move a document from one institution to another once created.
5. **Parent–child link** — a parent can only see a student's data if a `student_parents` document links them. Document ID format: `{parentId}_{studentId}`.
6. **Soft-delete only** — users are never hard-deleted (see §3.1).

---

# Part 2 — Schema additions

## 2.1 New collections

### `terms`

Grading periods within a school year.

- **Fields**: `institutionId`, `name` (e.g. "Term 1 — 2025/26"), `startDate`, `endDate`, `status` (`upcoming` / `active` / `closed`)
- **Managed by**: `institution_admin`
- **Read by**: all roles within the institution
- **Referenced from**: `exams.termId`, `assignments.termId`

### `departments`

Academic departments within a school.

- **Fields**: `institutionId`, `name` (e.g. "Mathematics", "Sciences"), `headTeacherId` (must be a senior teacher)
- **Managed by**: `institution_admin`
- **Read by**: all roles within the institution
- **Referenced from**: `subjects.departmentId`, `teachers.departmentId`

### `attendance`

Daily attendance records.

- **Fields**: `studentId`, `date`, `status` (`present` / `absent` / `late` / `excused`), `notes`, `markedBy`, `markedAt`, `institutionId`
- **One record per student per school day**
- **Marked by**: the class teacher for that student's class
- **Editable by**: class teacher (own marks), senior teacher (within department), institution_admin, super_admin

### `audit_logs`

System-written log of sensitive actions across the platform.

- **Fields**: `actorUserId`, `actorRole`, `actorInstitutionId`, `action` (e.g. `impersonation_start`, `pii_view`, `bulk_delete`, `institution_suspend`, `result_override`), `targetCollection`, `targetDocumentId`, `targetInstitutionId`, `metadata` (free-form JSON — reason for access, IP, user agent), `createdAt`
- **Write**: system only — never user-facing
- **Read**: super_admin only
- **Note**: full action vocabulary and metadata structure to be finalised when the backend team picks it up. v1 spec captures the intent.

## 2.2 New fields on existing collections

| Collection    | New field                                              | Purpose                                                                                  |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `users`       | `status` (`active` / `inactive`)                       | Soft-delete                                                                              |
| `users`       | `deactivatedAt`, `deactivatedBy`, `deactivationReason` | Off-boarding audit trail                                                                 |
| `subjects`    | `departmentId`                                         | Link subject to a department                                                             |
| `teachers`    | `teacherType` (`regular` / `senior`)                   | Mirrors `users.role`; `senior_teacher` -> `senior`, `regular_teacher` -> `regular`       |
| `teachers`    | `departmentId`                                         | The teacher's department                                                                 |
| `classes`     | `classTeacherId`                                       | Designated class teacher (must be a teacher already in `teacher_classes` for this class) |
| `exams`       | `termId`                                               | The term the exam belongs to                                                             |
| `assignments` | `termId`                                               | The term the assignment belongs to                                                       |

---

# Part 3 — Cross-cutting features

## 3.1 Soft-delete / user off-boarding

When a teacher, student, or parent leaves the school:

- Their `users.status` flips to `inactive`
- They can no longer log in
- They remain visible on historical records (past results, lessons taught, classes they were in)
- They no longer appear in dropdowns when scheduling new lessons, exams, or assignments
- The institution_admin can reactivate them later if they return

User records are **never hard-deleted**. This keeps history intact across staff and student transitions.

**Plain English**: When someone leaves the school, the admin deactivates their account. They can no longer log in, but their past records stay intact for history. The admin can reactivate them later if they return.

## 3.2 CSV bulk import

The institution_admin can add many users at once via CSV upload. Separate flows for **students**, **teachers**, and **parents**.

Flow:

1. Admin downloads a template CSV with the required columns
2. Fills in their data
3. Uploads the CSV
4. The system parses and shows a preview with validation errors inline
5. Admin confirms → **all-or-nothing import** (no partial imports)
6. If validation fails, admin downloads a marked-up version of their CSV with an `error` column showing what to fix

For students, the CSV includes class assignment and parent email. If the parent email is new, a shell parent account is auto-created and linked.

**Plain English**: Admins can add many users at once by uploading a spreadsheet. The system provides a template, the admin fills it in, uploads it back, and previews what will be created before confirming. Errors are returned as a marked-up version of the spreadsheet.

## 3.3 PII access gating

Reveals of personal information are gated and audited.

| Role                             | Default visibility                                                      | On request                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| super_admin                      | Everything                                                              | "Reason for access" prompt on first PII view per session; entry written to `audit_logs`                          |
| regular_teacher / senior_teacher | Student name, class, DOB, photo, allergies, emergency info, parent name | Address / student phone / medical history / parent contact reveal logged to `audit_logs` (no prompt, just trace) |
| institution_admin                | Everything within their school                                          | No friction — expected operational access                                                                        |
| student                          | Their own profile only                                                  | N/A                                                                                                              |
| parent                           | Their linked child's profile                                            | N/A                                                                                                              |

## 3.4 Class average aggregation

When a student or parent views one of their/their child's results, the API includes the class average for that exam/assignment alongside the score.

- Computed server-side from the `results` collection
- Display pattern: `{score} | Class avg: {average}`
- **Suppressed when fewer than 3 results exist** for the same exam/assignment (avoids identifying tiny samples)
- **Permission preserved**: students and parents still only read their own results. The backend returns the aggregate number — never individual classmate scores.

**Plain English**: Students and parents see grades alongside the class average for context. No classmate names or scores are exposed; only the aggregate number.

## 3.5 Class teacher concept

Each class has one designated **class teacher** (also called form teacher or homeroom teacher), set by the institution_admin when assigning teachers to classes.

- Responsible for marking daily attendance for their class
- Acts as the contact point for that class
- Other teachers assigned to the class can view attendance but cannot mark it
- Senior teachers and admins can override marks

The `classes.classTeacherId` field must reference a teacher already linked to the class via `teacher_classes`.

## 3.6 Senior teacher subrole

A senior teacher is a regular teacher **plus departmental oversight**.

Capabilities on top of regular teacher:

- See all teachers in their department
- See all students taking subjects in their department
- See all results, exams, assignments, lessons, and attendance in their department's subjects
- **Edit any of the above within the department, regardless of ownership**
- Receive department-level notifications (pending results, chronic absenteeism)
- Pull department-level reports

The auth roles are `regular_teacher` and `senior_teacher`; the `teachers.teacherType` field mirrors this distinction.

**Plain English**: Some teachers are also heads of department — they're called Senior Teachers. They still teach their own classes, but they can also see and edit everything in their department: which teachers are behind on grading, how each class is doing, attendance, and so on.

---

# Part 4 — Role specifications

## 4.1 `super_admin`

### Technical

**Dashboard widgets (on load)**

- **KPI strip** — total institutions, total users (by role), active institutions (last 30d)
- **Institutions table** — name, user count, last activity, status; sortable, filterable
- **Growth chart** — institutions and users over time (default: 90d)
- **Recent sign-ups** — last 10 institutions
- **Alerts feed** — security flags, anomalous activity

**Primary actions**

- **Onboard new institution** — single flow that creates the institution record and the first `institution_admin` user
- **Suspend / reactivate institution** — toggles `status`; suspended institutions block all logins for that institution
- **Impersonate institution_admin** — full access. Every session writes to `audit_logs` (start, end, every action). UI shows a persistent banner during impersonation with a one-click exit.
- **Send platform-wide announcement** — renders for all users across all institutions on next login
- **Manage super_admin roster** — add/remove other super_admins
- **View audit logs** — cross-institution, filterable by actor, action, institution, date range

**Notifications**

- New institution registered
- Bulk-delete or mass operation by any admin
- Login anomaly (geo jump, brute force, unusual hours)
- New super_admin added

**Field-level visibility**

- Reads every field by default
- PII reads (student address, phone, medical, parent contact) write an `audit_logs` entry
- "Reason for access" prompt on first PII view per session, stored on the audit entry

**Reports / exports**

- Platform usage per institution (users, lessons, exams, results — 30d / 90d / YTD), CSV
- Growth report (institutions + users over time), CSV
- Audit log export, CSV
- Per-institution drill-down (same dashboard, scoped to one school)

### Plain English

A super_admin is the **platform owner**. They are the only role that sees across every school using the system — everyone else is locked to their own school.

**Seeing what's happening**

- View every school using the system in one list
- See totals at a glance: how many schools, and how many users in each role
- Track growth over time — new schools added, new users joined
- Spot which schools are active and which have gone quiet

**Managing schools**

- Add a new school and create its first admin account in a single step
- Suspend a school — every user at that school is immediately blocked from logging in
- Reactivate a suspended school
- Open any one school and see its full picture in isolation

**Managing other platform owners**

- Add or remove other super_admins

**Helping schools when they're stuck**

- Log in **as** any school's admin to troubleshoot — called _impersonation_
- A banner stays on screen so it's always clear whose account is currently active
- Every action taken during impersonation is recorded
- One click returns them to their own account

**Sending announcements**

- Send a message that appears for every user across every school the next time they log in

**Oversight and security**

- View an audit trail of sensitive actions across every school — who did what, when, on whose record
- Get alerts for unusual events: bulk deletions, logins from unexpected locations, brute-force attempts, new super_admins
- When viewing a student's personal info (home address, phone, medical, parent contact), the system asks for a reason and records the access — so even the platform owner is accountable

**Reports**

- Usage per school (users, lessons, exams, results — 30d / 90d / YTD)
- Growth report
- Audit trail export
- Per-school deep-dive

**The fine print**
There is no role above super_admin. They have access to everything by design. Their accountability comes from the audit trail, not from access restrictions.

---

## 4.2 `institution_admin`

### Technical

**Dashboard widgets**

- **KPI strip** — total students, teachers, parents, classes
- **Today's schedule** — lessons happening today across the school
- **This week ahead** — upcoming exams and assignment due dates (next 7 days)
- **Outstanding result entry** — exams N+ days ago with no results entered; grouped by teacher
- **Recent activity feed** — new users, results submitted, announcements posted (last 24h)
- **Quick actions panel** — add student, add teacher, schedule lesson, post announcement
- **Announcements + events** — recent and upcoming, with edit/delete

**Primary actions**

_People management_

- Add teacher — creates user account + teacher profile + links to subjects/classes in one flow (specify regular or senior; if senior, pick department)
- Add student — creates user + student profile, assigns to class, links parents
- Add parent — creates user + parent profile, links to one or more students
- Update any profile within the school
- **Deactivate / reactivate user** (soft-delete; see §3.1)
- **Bulk import** via CSV (see §3.2)
- _Cannot delete users, cannot change a user's role_

_Academic structure_

- Create / edit / delete subjects (each tied to a department)
- Create / edit / delete classes (designate a `classTeacherId`)
- Create / edit / close **terms**
- Create / edit **departments** (and assign a head teacher)
- Assign teachers to subjects (`teacher_subjects`)
- Assign teachers to classes (`teacher_classes`)
- Link students to parents (`student_parents`)

_Scheduling_

- Schedule lessons, exams, assignments
- Create events (school-wide or class-specific)

_Communication & corrections_

- Post / edit / remove announcements (school-wide or to a class)
- Override or correct results entered by teachers — for disputes, marking errors, appeals

**Notifications**

- Outstanding result entry — teachers who haven't entered results N days after an exam
- Assignments past due with no results recorded
- Schedule conflict — teacher double-booked, lesson collides with an exam
- New user account created
- Login anomaly for any user in the school
- Chronic absenteeism across the school

**Field-level visibility**

- Full access to every record within their school
- Sees student PII without prompt — expected operational access
- Cannot see anything outside their school

**Reports / exports**

- Class performance — average score per subject for each class
- Student performance — per-student summary across subjects, exam by exam
- Teacher workload — lessons, classes, exams per teacher
- Attendance report — school-wide attendance rate, chronic absenteeism list
- Roster export (students, teachers, parents) — CSV
- Results export — CSV

### Plain English

An institution_admin is the **school administrator**. They run everything inside their own school, but they cannot see or touch any other school on the platform.

**Seeing what's happening at the school**

- Totals at a glance: students, teachers, parents, classes
- Today's full schedule — which lessons are happening, who's teaching what
- The week ahead — upcoming exams and what assignments are due
- Which teachers haven't entered exam results yet
- Recent activity in the last day — new accounts, results posted, announcements

**Adding and managing people**

- Add a new teacher (regular or senior) and connect them to subjects and classes
- Add a new student, place them in a class, link them to their parent
- Add a parent and link them to one or more of their children
- Update anyone's profile within the school
- **Deactivate accounts** when someone leaves — their past records are preserved
- **Bulk-add users via a spreadsheet upload** — students, teachers, or parents at once

**Setting up the school**

- Create or edit subjects, classes, departments, terms (grading periods)
- Decide which teachers teach which subjects and classes
- Designate a class teacher for each class (responsible for daily attendance)
- Connect students with their parents

**Scheduling and communication**

- Schedule lessons, exams, assignments
- Create events for the whole school or one class
- Post announcements to the school or a class
- Correct or override a grade a teacher entered — for disputes, marking errors, appeals

**Reports**

- Class performance — average score per subject for each class
- Individual student performance — exam by exam, subject by subject
- Teacher workload
- Attendance — school-wide rate, chronic absenteeism
- Roster and results exports as spreadsheets

**The fine print**

- They **cannot delete user accounts**. If someone leaves, the account is deactivated rather than removed.
- They **cannot change anyone's role**. A teacher cannot be promoted to admin from this view.
- Everything stays **inside their own school** — no view into any other school on the platform.

---

## 4.3 `regular_teacher` and `senior_teacher`

Teachers have two distinct auth roles — **`regular_teacher`** and **`senior_teacher`** — differentiated by the `teachers.teacherType` field (a denormalized mirror of the auth role). Senior teachers have everything regular teachers do, plus departmental oversight.

### Technical

**Dashboard widgets (Regular teacher)**

- **Today's schedule** — their lessons only, chronological, with class + subject
- **Pending result entry** — exams or assignments past due with no results entered (action queue — most-used widget)
- **This week ahead** — upcoming exams and assignment due dates
- **My classes** — cards for each class they teach, with quick links to roster and recent results
- **Mark attendance** — if they're the class teacher of any class, today's attendance entry sits front-and-centre
- **Current term** — name + days remaining
- **Recent announcements** — read-only feed
- **Recent results entered** — last 5–10, for quick verification or edit

**Additional dashboard widgets (Senior teacher)**

- **Department overview** — list of teachers in the department, with status indicators (pending grades, attendance gaps)
- **Department performance** — top/bottom-performing classes within the department
- **Department alerts** — chronic absenteeism, overdue results across the whole department

**Primary actions**

_Regular teacher — only within their assigned subjects/classes_

- Schedule a lesson
- Create an exam (assigned to a term)
- Create an assignment (assigned to a term, with start + due dates)
- Edit any lesson / exam / assignment **they own**
- Enter results — bulk entry view for a whole class/exam at once (most-used action)
- Edit a result **they entered**
- Mark daily attendance — only if they're the class teacher of that class
- View any student profile (read-only) — gated PII (see §3.3)
- Update own teacher profile (bio, contact info, photo)

_Senior teacher — additionally, within their department_

- Edit any lesson / exam / assignment / result, regardless of ownership
- Edit any attendance record
- Reassign a lesson to a different teacher
- Pull department-level reports

_No teacher can delete anything — that's admin-only._

**Notifications (Regular)**

- Result entry overdue — exam was N days ago, no results yet
- Upcoming exam tomorrow / this week
- Assignment due date approaching
- Schedule change made by admin
- A result they entered was **overridden by admin or senior teacher** (transparency — they should never be blindsided)
- New announcement relevant to them

**Notifications (Senior, additional)**

- Result entry overdue anywhere in the department
- Chronic absenteeism in any class in the department
- Teacher in the department deactivated

**Field-level visibility**
Teachers can read student/teacher/parent records in their school, but the UI hides sensitive fields by default:

- **Always visible**: student name, class, DOB, profile photo, allergies / critical emergency info, parent name
- **Hidden by default**: home address, student phone, full medical history, parent phone / email
- **On request**: "show contact info" reveals hidden fields and writes an `audit_logs` entry (timestamp, teacher ID, student ID) — no reason-prompt, just traceability

**Reports / exports**

- **Class gradebook** — per class, per subject, all their students' results across exams + assignments
- **Per-student summary** — one student's performance in their subject, current term
- **Performance over time** — class averages per assignment / exam, per term
- **Results export** — CSV per exam or per class
- **Attendance report** — for classes they're the class teacher of (or, for senior teachers, anywhere in their department)

### Plain English

A teacher manages their own classes, lessons, exams, assignments, grades, and (if they're the class teacher) daily attendance. They can see other people at their school for context, but they can only change things that belong to them.

**Two kinds of teacher**

- A **Regular Teacher** sees only their own classes and the subjects they teach.
- A **Senior Teacher** (a head of department) sees everything a Regular Teacher does, **plus** everything in their department — other teachers' classes, results, attendance, the lot. They can step in and edit anything in their department.

**Seeing what's on their plate**

- Today's schedule — their lessons only, in the order they happen
- Which results they still need to enter
- The week ahead — upcoming exams and assignments coming due
- Quick access to each class they teach
- If they're a class teacher, the attendance widget for their class
- How many days are left in the current term

**Day-to-day work**

- Schedule a lesson (only for subjects and classes assigned to them by the admin)
- Set up exams and assignments — picking the subject, class, date, and term
- Enter grades for a whole class at once after an exam or assignment
- Edit grades they entered, to fix typos or rework after re-marking
- Mark daily attendance if they're the class teacher

**Looking up students**

- Pull up any student in the school to see their class and past grades
- See parent names and emergency contact info (e.g. allergies) by default
- Reveal a student's home address or full contact info when needed — but the system records that access

**Communication**

- Read announcements posted to the whole school or to their classes
- Update their own profile

**The fine print (Regular Teacher)**

- They can only **create or edit** lessons, exams, assignments, and results that **belong to them**. They can see other teachers' work but cannot change it.
- They **cannot delete** anything. Only the admin can remove records.
- Their grades can be **overridden by their senior teacher or the school admin** — if that happens, they get a notification so they're not caught off guard.
- Everything stays inside their own school.

**The fine print (Senior Teacher)**

- Within their department, they can edit anything — even work other teachers created.
- Outside their department, they're a regular teacher.
- Edits they make to other teachers' work are recorded, and the affected teacher is notified.

---

## 4.4 `student`

### Technical

**Dashboard widgets**

- **Today's schedule** — lessons happening today, with subject + teacher
- **Upcoming exams** — next 2 weeks
- **Assignments due** — next 7 days
- **Recent results** — last 5 results, with **class average** shown alongside (per §3.4)
- **Attendance this term** — percentage + breakdown (present / absent / late / excused)
- **Current term** — name + days remaining
- **Announcements** — school-wide or to their class
- **Upcoming events**

**Primary actions** — the only writes a student can do

- Update own profile — photo, bio
  - Cannot change: name, DOB, class assignment, parent links — admin-controlled
- View own report card by term (downloadable as PDF)
- Export own performance history (CSV)
- Export own attendance record (CSV)

_Assignment submission is **not** a flow in the app — teachers post grades; students don't upload work._

**Notifications**

- New result posted (exam or assignment)
- Assignment due tomorrow / this week
- Upcoming exam in next 3 days
- Class cancelled or rescheduled
- New announcement (school-wide or to their class)
- Marked absent today

**Field-level visibility**

- **Their own profile**: full read, edit limited to photo + bio
- **Their own results / attendance / schedule**: full read, no edit
- **Teachers**: name, photo, subjects taught, school email — _not_ home address, phone, personal bio, DOB
- **Other students**: cannot see — class roster is hidden
- **Parents**: cannot see parent records. Can see their own parent's name on their profile, nothing more
- **Anything from another school**: invisible

**Reports / exports**

- Term report card — PDF
- Performance history — CSV
- Attendance record — CSV

### Plain English

A student sees their own school life — schedule, exams, assignments, grades, attendance, and announcements. They cannot see other students' data, and everything is locked to their own school.

**Seeing what's on their day**

- Today's lessons in order, with subject and teacher
- Upcoming exams in the next two weeks
- Assignments due in the next week
- Their most recent grades — shown alongside the class average so they have context for how they did

**Tracking themselves**

- Attendance this term — percentage and breakdown
- Current term name and days remaining
- A term report card they can download as a PDF
- Their full grade history and attendance record as spreadsheets

**Staying informed**

- Read announcements posted to the school or their class
- See upcoming school events
- Get notified about new grades, upcoming exams, assignment due dates, cancelled lessons, and any day they're marked absent

**Updating themselves**

- Change their profile photo and a short bio
- They **cannot** change their name, date of birth, class assignment, or parent links — those are managed by the school admin

**The fine print**

- They can only see **their own data**. They cannot see classmates' grades, attendance, or profiles. The class roster is hidden.
- They can see **teacher names and subjects taught**, but not teachers' personal contact details.
- **They do not submit assignments through the app.** The teacher posts grades when ready.
- Everything stays inside their own school.

---

## 4.5 `parent`

### Technical

**Dashboard widgets**

The parent dashboard uses a **unified layout** — one full per-child block per linked child, stacked vertically. No tabs, no switcher. One child = one section. Multiple children = multiple sections in order. On mobile, lazy-render below-the-fold children for fast initial load.

**Per child:**

- **Child header** — photo, name, class, class teacher name _(no contact link; see fine print)_
- **Today's schedule** — child's lessons for today
- **Attendance this term** — % + recent absences (highlighting unexcused)
- **Recent grades** — last 5 results, with class average shown alongside (per §3.4)
- **Upcoming exams** — child's exams in next 2 weeks
- **Assignments due** — child's assignments due in next 7 days
- **Announcements** — school-wide or to child's class
- **Upcoming events**
- **Current term** — name + days remaining

**Primary actions**

_Self-service_

- Update own profile — photo, contact details (phone, email, address), bio
- Cannot change: name, relationship to child, child links — admin-controlled

_Per-child_

- Download child's term report card (PDF)
- Export child's performance history (CSV)
- Export child's attendance record (CSV)

_No write actions on any child's data. Parents cannot mark or excuse absences — see fine print._

**Notifications**

- Child marked absent today
- New grade posted for child
- Grade updated — a previously posted score has been revised by the school (neutral framing — no internal-dispute language)
- Upcoming exam for child (3-day warning)
- Assignment due for child (1-day warning)
- Class cancelled or rescheduled affecting child
- New announcement (school-wide or to child's class)
- Chronic absenteeism warning — child has X+ unexcused absences in a 2-week window

**Field-level visibility**

- **Their child's profile**: full access — address, phone, medical, full grades, attendance. Nothing hidden.
- **Other children**: cannot see at all
- **Teachers**: name, photo, subjects taught — **no email, no phone**
- **Other parents**: cannot see
- **Anything from another school**: invisible

**Reports / exports**

- Child's term report card — PDF
- Child's performance history — CSV
- Child's attendance record — CSV

### Plain English

A parent (or guardian) sees a window into their own child's school life — schedule, grades, attendance, announcements, events. They cannot see other children, other parents, or any other school.

**Seeing their child's day-to-day**

- Today's schedule — what classes the child has, in order, with subject and teacher
- Upcoming exams and assignment due dates
- Recent grades — each shown alongside the class average for context
- Attendance this term — percentage and recent absences

**Multiple children**

- Parents with more than one child see each child's dashboard stacked one after another on the same page — no tabs or switching. Everything is visible at a glance.

**Staying informed**

- Read announcements posted to the school or the child's class
- See upcoming school events
- Get notified when the child is marked absent, when a new grade is posted, when an exam is coming up, when an assignment is due, when a previously posted grade is revised, and when their child is at risk of chronic absenteeism

**Their own info**

- Update their photo, contact details (phone, email, address), and a short bio
- They cannot change their name, their relationship to the child, or who they're linked to — those are managed by the school admin

**Reports**

- Term report card as a PDF
- Grade history as a spreadsheet
- Attendance record as a spreadsheet

**The fine print**

- They can only see **their own child's** information. They cannot see other children, other parents, or any data from another school.
- They can see **teacher names, photos, and subjects taught**, but **no contact details**. To reach a teacher, parents call the school office.
- They **cannot mark or excuse absences** in the app. If a child's absence needs to be excused, the parent contacts the school directly and the teacher or admin updates the record.
- All changes to a child's records — grades, attendance, schedule — are handled by the teachers and the admin. Parents are read-only on everything except their own profile.

---

# Part 5 — Open items / future considerations

## 5.1 Deferred decisions

- **Multi-department headship**. For v1, a senior teacher heads exactly one department. The `teachers.departmentId` field is singular. Schema is structured to allow later promotion to multi-valued, or extraction into a `department_heads` junction collection, if a real-world need surfaces.

## 5.2 Sketched but not fully detailed

- **`audit_logs` schema**. Identified as needed for super_admin oversight, PII gating, impersonation tracking, and override transparency. The full action vocabulary and metadata structure to be finalised when the backend team picks it up. v1 captures the intent and required fields.

## 5.3 Explicitly out of scope for v1

- **Assignment submission flow** — students do not upload work in the app. Teachers post grades.
- **In-app parent-teacher messaging** — parents contact the school office.
- **Parent-initiated absence excuses** — handled by admin and teacher only.
- **Cross-school comparisons or data sharing**.
- **Attendance granularity finer than daily** — one mark per student per school day.

## 5.4 Likely future additions (flagged, not specced)

- Behaviour notes / pastoral records
- Resource library (teacher-uploaded notes and files for students)
- Parent–teacher conference scheduling
- Achievements / gamification for students
- Direct messaging or in-app communication channels

---

# Glossary

| Term            | Definition                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Institution     | A school using the platform. Each institution is fully isolated from others.                                                                                                       |
| Class           | A group of students taught together (e.g. Grade 6A).                                                                                                                               |
| Class teacher   | The teacher designated to mark daily attendance for one class; also called form teacher or homeroom teacher.                                                                       |
| Department      | An academic grouping of subjects (e.g. Sciences, Humanities).                                                                                                                      |
| Senior teacher  | Auth role: `senior_teacher`. A teacher with departmental oversight in addition to teaching their own classes.                                                                      |
| Regular teacher | Auth role: `regular_teacher`. A teacher who manages only their own assigned classes.                                                                                               |
| Term            | A grading period within the school year (e.g. Term 1).                                                                                                                             |
| Soft-delete     | Marking a record as inactive without removing it from the database.                                                                                                                |
| Impersonation   | A super_admin temporarily acting as an institution_admin for support purposes; fully audited.                                                                                      |
| Class average   | The mean score for an exam or assignment across all students in a class. Surfaced to students and parents alongside individual scores, suppressed when fewer than 3 results exist. |

---

# Changelog

| Version | Date       | Notes                                                                                                    |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-05-14 | Initial version. All five roles specced. Schema additions, cross-cutting features, open items, glossary. |
| 1.1     | 2026-05-27 | Split `teacher` into `regular_teacher` / `senior_teacher`. Updated sections 1.1-4.3, glossary.           |

---

_End of Version 1.1 — this is a living document. Bump the version and add a changelog entry on every meaningful update._
