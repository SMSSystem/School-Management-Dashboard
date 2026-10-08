# Spectator Role — Specification and Implementation Plan

> **Status: DRAFT for review. Nothing is built.** No rule, code, script or document other than this file has been changed. Date: 2026-10-08. Branch: `create-spectator-role`.
>
> Sources: a read-only survey of `firestore.rules` (all 2,012 lines), `database.rules.json`, `firebase.json`, `src/App.tsx`, `src/lib/sidebarNav.ts`, `src/lib/firebase.ts`, `src/lib/AuthContext.tsx`, `src/components/{FormModal,Navbar,Menu,Protected}.tsx`, `src/components/forms/AdminCreateUserForm.tsx`, and every `institution_admin` check in `src/` (223 occurrences in 58 files). Line numbers are as of the date above and will drift; search by the quoted code, not the number.

---

## 1. Summary

Add a sixth role, **`spectator`** (shown as **"Spectator"**), for oversight staff such as a principal, board member or inspector. A spectator:

- sees **everything an `institution_admin` can read** in their own institution, and always will;
- can **change nothing** in the institution's data, in the UI, or in Firebase;
- can be created from the **Create Account** page's Role dropdown, and sees their role in the top bar.

The role is enforced where it matters — `firestore.rules` — and mirrored in the UI for usability. The app has no backend and runs on the Firebase Spark (free) plan, so the design adds no Cloud Functions, custom claims, collections, indexes or extra reads.

### 1.1 Requirements (from the owner)

| #   | Requirement                                                                                     |
| --- | ----------------------------------------------------------------------------------------------- |
| R1  | New role `spectator`, label "Spectator".                                                        |
| R2  | Same clearance and read access as `institution_admin`, and always.                              |
| R3  | Read-only, and nothing else: no create, edit or update anywhere in the app, its UI or Firebase. |
| R4  | Selectable in the **Role** dropdown of the Create Account page.                                 |
| R5  | Visible in the top nav bar for a signed-in spectator.                                           |
| R6  | Stay inside the Firebase free tier.                                                             |

### 1.2 Owner decisions made during brainstorming

See section 5 for the full table. In short: reports are view-only; four self-service writes are allowed; super admins **and** institution admins manage spectators; the audience is oversight staff with full read access; editing-oriented pages are view-only where they show data; Create Account is hidden from spectators.

---

## 2. Glossary

| Term        | Meaning                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Admin read  | Any read an `institution_admin` can make in their own institution.                                   |
| Staff read  | A read currently allowed to `isTeacherOrAbove()` (teachers, admins, super admin).                    |
| Carve-out   | A write a spectator is still allowed to make because the app cannot work without it (section 5, D2). |
| Fail-closed | A new role is denied by default until a rule or UI check names it.                                   |

---

## 3. Findings

### 3.1 How roles work today

- **Role storage:** `users/{uid}.role` is a string. There are no custom claims (no Cloud Functions on Spark). Rules read it with `get(users/{uid})` through `me()`, which is cached per request, so every role check after the first costs no extra read.
- **Role type:** `Role = 'super_admin' | 'institution_admin' | 'senior_teacher' | 'regular_teacher' | 'student' | 'parent'` in `src/lib/firebase.ts`. `getRoleLabel()` there is a `Record<Role, string>`; TypeScript will force every exhaustive `Record<Role, …>` map to gain a `spectator` entry.
- **Top bar:** `Navbar.tsx` shows `getRoleLabel(role)`. Adding the label satisfies R5 with no other change.
- **Inactive accounts:** `accountActive()` makes a deactivated user match no role in any rule.
- **Sign-in flow:** `AuthContext.fetchRole()` reads the user document, rejects unknown/missing roles and inactive accounts, claims the single-session lock, then writes a `sign_in` activity-log entry.

### 3.2 Rules structure

`firestore.rules` has one set of helpers (`isSuperAdmin`, `isAdmin` = `institution_admin` only, `isAdminOrAbove`, `isTeacher`, `isTeacherOrAbove`, `isParent`, `isOwner`, `sameInstitution`, `inMyInstitution`) used in about 150 clauses. Three read patterns exist:

1. **Open to the institution:** `isSignedIn() && inMyInstitution(id)` (or `sameInstitution(...)`). A spectator **already passes these** once their `institutionId` matches. No change needed.
2. **Staff reads:** `isTeacherOrAbove() && …`. Spectators fail these today.
3. **Admin reads:** `isAdminOrAbove()` or bare `isAdmin()`. Spectators fail these today.

Writes are separate clauses (`create`, `update`, `delete`) that name `isAdmin()` / `isAdminOrAbove()` / `isTeacherOrAbove()`. Since a spectator is none of those, **a spectator can already write nothing** — the new role is fail-closed on writes. The work is to _add_ reads, never to remove or loosen a write.

Legacy flat collections (`/subjects`, `/classes`, `/results`, …) and their nested twins (`institutions/{id}/…`) both exist in the file. `docs/overhaul/CUTOVER_RUNBOOK.md` C2 (delete the legacy rules) is marked optional and not done. `FormModal.tsx` still treats `institution_admin`, `teacher`, `student`, `parent`, `attendance` as flat tables; everything else is nested.

### 3.3 Reads that need a spectator branch (audit of `firestore.rules`)

Collections whose read rule currently blocks a spectator. "Admin" means swap `isAdminOrAbove()`/`isAdmin()` for the new admin-read helper; "Staff" means swap `isTeacherOrAbove()` for the new staff-read helper.

| Rule block (path)                                                                                                                                                                                                                                                             | Current read gate                                                           | Change                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| `users/{uid}`                                                                                                                                                                                                                                                                 | owner, `isAdminOrAbove()` + same institution, teacher→student, parent→child | Admin                             |
| `users/{uid}/photo/{photoId}`                                                                                                                                                                                                                                                 | owner, `isAdminOrAbove()`, teacher→student photo                            | Admin                             |
| `student_parents/{docId}` (live)                                                                                                                                                                                                                                              | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/audit_log/{eventId}`                                                                                                                                                                                                                                       | super admin, `isAdmin()`, teacher (own entries only)                        | Add spectator for own institution |
| `{path=**}/activity_log/{eventId}` (collection group)                                                                                                                                                                                                                         | super admin, `isAdmin()` + same institution                                 | Add spectator + same institution  |
| `institutions/{id}/enrollmentRegistrations/{regId}`                                                                                                                                                                                                                           | `isAdminOrAbove()`                                                          | Admin                             |
| `institutions/{id}/reportCardComments/{id}`                                                                                                                                                                                                                                   | `isAdminOrAbove()`                                                          | Admin                             |
| `institutions/{id}/reportCards/{id}`                                                                                                                                                                                                                                          | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/progressReports/{id}`                                                                                                                                                                                                                                      | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/disciplinaryActions/{id}`                                                                                                                                                                                                                                  | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/studentActivities/{id}`                                                                                                                                                                                                                                    | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/studentResponsibilities/{id}`                                                                                                                                                                                                                              | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/results/{id}`                                                                                                                                                                                                                                              | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/feedback_comments/{id}`                                                                                                                                                                                                                                    | `isTeacherOrAbove()`, student, parent                                       | Staff                             |
| `institutions/{id}/gradebooks/{id}` and `…/columns/{colId}`                                                                                                                                                                                                                   | `isTeacherOrAbove()`                                                        | Staff                             |
| `institutions/{id}/attendanceSummaries/{id}`                                                                                                                                                                                                                                  | `isTeacherOrAbove()` (also the `resource == null` probe)                    | Staff                             |
| `institutions/{id}/generalAttendance/{id}`                                                                                                                                                                                                                                    | `isAdminOrAbove()`, senior teacher, student, parent                         | Admin                             |
| `institutions/{id}/subjectAttendance/{id}`                                                                                                                                                                                                                                    | `isAdminOrAbove()`, regular teacher, student, parent                        | Admin                             |
| `institutions/{id}/assignments/{id}`                                                                                                                                                                                                                                          | `isAdminOrAbove()`, teacher variants, student, parent                       | Admin                             |
| `…/assignments/{id}/submissions/{studentId}`                                                                                                                                                                                                                                  | `isAdminOrAbove()`, teacher variants, student, parent                       | Admin                             |
| `…/submissions/{studentId}/attempts/{n}`                                                                                                                                                                                                                                      | `isAdminOrAbove()`, teacher variants                                        | Admin                             |
| `…/assignments/{id}/submissionTombstones/{studentId}`                                                                                                                                                                                                                         | `isAdminOrAbove()`, teacher variants, student, parent                       | Admin                             |
| `institutions/{id}/lessonNotes/{id}` and `…/attachment/{docId}`                                                                                                                                                                                                               | `lessonNoteReadableBy()` (starts with `isAdminOrAbove()`)                   | Admin, inside that function       |
| Legacy flat `students`, `results`, `feedback_comments`, `reportCards`, `reportCardComments`, `studentActivities`, `studentResponsibilities`, `disciplinaryActions`, `generalAttendance`, `subjectAttendance`, `attendanceSummaries`, `gradebooks`(+columns), `teachers`(open) | various                                                                     | **Leave unchanged** (see D12)     |

Already readable by a spectator with no change: `institutions/{id}` itself, `houses`, `departments`, `events`, `announcements`, `nonSchoolDays`, `academicYears`, `subjects`, `classes`, `terms`, `lessons`, `exams`, `rubrics`, `subjectEnrollments`, `timetable_slots`, and `registration_directory` (public).

Intentionally **not** extended to spectators: collection-group reads of the 25 nested collections (super admin only — an institution admin does not have them either), and `{path=**}/audit_log` (super admin only).

### 3.4 Places the client mixes "view" and "write" in one check

The client has no capability layer. `role === "institution_admin"` (often with `|| role === "super_admin"`) appears in 58 files and decides **both** whether a page loads and whether a button shows. Consequences:

- A spectator is hidden from every admin read view until each check is updated (**fail-closed on reads** — safe, but incomplete).
- Many routes in `App.tsx` have **no role guard** at all (lists for teachers, students, parents, subjects, classes, terms, departments, exams, events, announcements, results, feedback, lessons, assignments, schedule, reports, progress reports, disciplinary actions, `settings`, `profile`). A spectator reaches them by URL; only the in-page buttons stop writes in the UI.
- `institution_admin` checks that are actually **write-only pages**: Create Account, Import Data, Backfill Classes, Rebuild Summaries, Academic Calendar, Report Card Comments, Brand Settings (route), Houses (list and detail, admin only), Registrations review, Settings (changes the institution's grading system), the Schedule "Manage Access" panel.
- Pure-view pages already exist for non-admins: `/dashboard/institution-profile` renders `InstitutionInfoDisplay` for everyone except `institution_admin`, so a spectator can be given that read-only view for free.

### 3.5 "Read" actions that actually write

| Action                               | Where                                             | Writes                                                                    |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Sign-in                              | `AuthContext.tsx`                                 | `users/{uid}/activity_log` (`sign_in`)                                    |
| Session lock                         | `sessionLock.ts`, `database.rules.json`           | RTDB `sessions/{uid}`                                                     |
| First-login / forced password change | `change-password` page                            | Auth `updatePassword` + `users/{uid}.mustChangePassword = false`          |
| Product tour                         | `App.tsx` `markTourSeen`                          | `users/{uid}.toursCompleted.<name>`                                       |
| Generate report card                 | `generateReportCard.ts`, `report-cards/index.tsx` | `reportCards` (add/update), rank batch, may rebuild `attendanceSummaries` |
| Generate progress report             | `generateProgressReport.ts`                       | `progressReports` (add) + trims overflow with a batch                     |
| Rebuild attendance summaries         | `attendanceSummaryUtils.ts`                       | `attendanceSummaries`                                                     |
| Profile contact edit                 | `profile/index.tsx`                               | Rules allow this for `super_admin` only                                   |
| Settings changes                     | `settings/index.tsx`                              | `institutions/{id}` fields (admin only by rules)                          |

Self-service writes are narrowly scoped by rules and do not name roles:

- `users/{uid}/activity_log`: `create` allowed to the owner for `sign_in` / `profile_update`; shape-checked.
- `users/{uid}`: the owner may change only `toursCompleted` and `mustChangePassword` (`ownerMayEditOwnProfile()`); everyone else's fields are admin-only.
- RTDB `sessions/{uid}`: owner only.

### 3.6 Privacy exposure

An admin-level read covers every user profile in the institution (names, emails, phone numbers, addresses, emergency contacts), student records, disciplinary actions, grades and assignment submissions (base64 files). The spectator role is therefore a new bulk-read route to children's personal data. Reads cannot be logged without writes, so spectator reads are **not auditable** in this design. `docs/compliance/` and the planned personal-data split (`docs/backend/PII_SPLIT_DESIGN.md`) and endpoint contract (`docs/backend/OPENAPI_V0_ENDPOINTS.md`) must list the new role.

### 3.7 Default-route fall-through

`App.tsx` selects the home page with a chain ending in `: <AdminPage />`, so any unrecognised role currently lands on the admin dashboard. `AdminPage` contains write shortcuts. This must change before spectators exist (D8).

### 3.8 Free-tier fit (Spark)

| Concern           | Finding                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------- |
| Reads             | An extra `                                                                                                                                                                             |     | `branch in a rule adds no document reads;`me()` is cached. A spectator browsing costs what an admin browsing costs. |
| Writes            | Only the four carve-outs, once per sign-in or event. Same as any user.                                                                                                                 |
| Storage / indexes | None added. Queries a spectator runs are the ones admins already run, so existing composite indexes serve them.                                                                        |
| Rules size        | About 2,000 lines now; measure the file after the change against the 256 KB source limit.                                                                                              |
| Cloud Functions   | Not available on Spark and not needed.                                                                                                                                                 |
| Daily quota risk  | Oversight staff browsing large lists (all users, audit log) consume the shared 50K reads/day like admins; the read-caching layer (`FIRESTORE_READ_CACHING_SPEC.md`) applies unchanged. |

### 3.9 Enforcement reality

Anyone holding the public web config can call Firestore directly. **Only `firestore.rules` (and `database.rules.json`) enforce read-only**; the UI is a convenience. The design therefore never names `spectator` in a write clause, and a test guards that (section 9).

---

## 4. Rejected approaches

| Approach                                                                               | Why rejected                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Make `isAdminOrAbove()` true for spectators and add `&& !isSpectator()` to every write | Fail-open: one forgotten write clause grants write access.                                                                                      |
| Custom claims                                                                          | Needs Cloud Functions (not on Spark) and would split the source of truth.                                                                       |
| A boolean `readOnly` flag on `institution_admin`                                       | Every existing `isAdmin()` write clause would need the flag; same fail-open risk, and `institution_admin` accounts could be flipped by mistake. |
| Hide write pages client-side only                                                      | Rules must refuse the writes; UI alone is bypassable.                                                                                           |

---

## 5. Decisions

| ID  | Decision                                                                                                                                                                                                              | Rationale                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | Role id `spectator`, label "Spectator".                                                                                                                                                                               | Owner request.                                                                                                                |
| D2  | **Allowed self-service writes** (carve-outs): own `sign_in` activity log, RTDB session lock, own password change plus `mustChangePassword = false`, own `toursCompleted`. All institution data is strictly read-only. | Sign-in and first-login break without them. These rules are owner-scoped and role-agnostic, so they need no spectator clause. |
| D3  | **Reports are view-only.** A spectator opens saved report cards and progress reports; Generate buttons are hidden; no rule allows writes.                                                                             | Generation saves documents (3.5).                                                                                             |
| D4  | **Managed by `super_admin` and `institution_admin`** (for their own institution). `institution_admin` may create and deactivate spectators; **delete stays `super_admin` only**.                                      | Owner choice. No privilege escalation: a spectator's clearance is a strict subset of the creating admin's.                    |
| D5  | **Audience: oversight staff.** Full admin-level read including personal contact details.                                                                                                                              | Owner choice; masking deferred (section 6).                                                                                   |
| D6  | **Editing-oriented admin pages are view-only where they show data**; pure tools are hidden: Create Account, Import Data, Backfill Classes, Rebuild Summaries.                                                         | Matches "same clearance as admin" for data without exposing tools.                                                            |
| D7  | **Create Account is hidden** for spectators (sidebar and route).                                                                                                                                                      | A spectator creates nothing.                                                                                                  |
| D8  | An explicit read-only **spectator home page**, and the `App.tsx` default fall-through to `AdminPage` is replaced by a safe fallback.                                                                                  | 3.7.                                                                                                                          |
| D9  | Rules add three helpers: `isSpectator()`, `canReadAdminData()`, `canReadStaffData()`, used **only in read clauses**.                                                                                                  | Fail-closed on writes (section 4).                                                                                            |
| D10 | Client adds one capability module (`src/lib/roleCapabilities.ts`) with `hasAdminView(role)` and `canWrite(role)`; the 58 `institution_admin` checks migrate to it.                                                    | One place to reason about spectator behaviour.                                                                                |
| D11 | A spectator is scoped to **one institution** (has an `institutionId`), exactly like `institution_admin`.                                                                                                              | "Same clearance".                                                                                                             |
| D12 | Legacy flat rule blocks (3.3 last row) are **not** extended. Live flat paths are `users`, `users/*/photo`, `student_parents`; those are extended.                                                                     | Legacy data is moved; unchanged rules fail closed and the C2 cleanup is pending. Confirm in OQ4.                              |
| D13 | Spectators get **no default password** (like admins), must change password on first login, and get **no product tour** (not in `ROLES_WITH_REAL_TOURS`).                                                              | Matches admin handling in `AdminCreateUserForm.tsx`.                                                                          |
| D14 | Spectator is **not** added to collection-group reads that only `super_admin` has.                                                                                                                                     | Admins do not have them either.                                                                                               |

---

## 6. Deferred items

Not part of the first version. Each is recorded so it is not forgotten.

| ID  | Item                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DF1 | **Generate reports without saving** | A spectator could build and download a report card / progress report PDF in the browser without any write. Needs the generators refactored into a pure "build" step and a separate "save" step, and a read-only path for rank and attendance-summary figures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DF2 | **Account expiry dates**            | Time-limited spectator accounts for inspectors/auditors. Needs an `expiresAt` field, a rule check (`request.time < me().expiresAt`) in `accountActive()` or a sweep script, and UI to set it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DF3 | **Hide/mask contact details**       | A reduced-PII variant for less-trusted viewers. Depends on the personal-data split (`docs/backend/PII_SPLIT_DESIGN.md`): once private fields leave `users/{uid}`, a spectator can be denied the private part.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DF4 | **Spectator tour**                  | A guided walkthrough; v1 has none (D13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DF5 | **Read auditing**                   | Firestore cannot log reads. Would require routing spectator reads through the planned backend (`docs/backend/`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| DF6 | **Cross-institution spectator**     | A spectator across several institutions (super-admin-like). Out of scope (D11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| DF7 | **Leftover legacy data cleanup**    | **Done 2026-10-08.** The listing (`scripts/list-legacy-flat-documents.mjs`) showed 30 documents: 22 `_placeholder` documents and 8 teacher/student mirror documents; `scripts/delete-legacy-flat-documents.mjs` deleted all 30. The top-level `gradebooks` collection then still appeared (count 0) because two missing parent documents still held 5 `columns` documents (`scripts/list-legacy-gradebook-columns.mjs`); `scripts/delete-legacy-gradebook-columns.mjs` deleted those. The final census reports all 27 legacy collections absent and 0 legacy flat documents. `users/_placeholder` (no `role`, no `institutionId`) is left in place. Remaining, optional: remove the now-dead flat rule blocks (`CUTOVER_RUNBOOK.md` C2). Not required for the spectator role. |

---

## 7. Design

### 7.1 Rules (`firestore.rules`)

Add next to the existing helpers:

```
function isSpectator() {
  return isSignedIn() && myRole() == 'spectator';
}

// Admin-level READ access only. Never use these in create/update/delete.
function canReadAdminData() {
  return isAdminOrAbove() || isSpectator();
}

// Staff-level READ access only. Never use these in create/update/delete.
function canReadStaffData() {
  return isTeacherOrAbove() || isSpectator();
}
```

Then, in **read clauses only**, replace per the table in 3.3. Details that need care:

- `users/{uid}`: change `isAdminOrAbove() && sameInstitution(...)` to `canReadAdminData() && sameInstitution(...)`. A spectator's queries must carry `where('institutionId','==', myInstitution)` exactly like admins' do, otherwise the whole query is denied.
- `lessonNoteReadableBy(n)`: replace its first line `isAdminOrAbove()` with `canReadAdminData()`. The attachment read goes through the same function, so one edit covers both.
- `institutions/{id}/audit_log`: add `|| (isSpectator() && myInstitutionId() == institutionId)` to the read clause only. The `create` clause is untouched, so a spectator cannot write audit entries.
- Collection-group `activity_log`: add `|| (isSpectator() && resource.data.institutionId == myInstitutionId())`.
- `attendanceSummaries`: keep the `resource == null` probe branch, with `canReadStaffData()` in place of `isTeacherOrAbove()`.
- `users` **create** allow-list for `isAdmin()` gains `'spectator'`:
  `request.resource.data.role in ['senior_teacher','regular_teacher','student','parent','spectator']`.
  The existing `update` clause already lets an `institution_admin` edit any non-admin profile in their institution (it excludes only `resource.data.role == 'institution_admin'`), which covers spectators, including `status` for deactivation. `roleNotChanged()` and `institutionNotChanged()` still apply. `delete` stays `isSuperAdmin()`.
- Do **not** touch: `ownerMayEditOwnProfile()`, the `activity_log` create clause, the `audit_log` create clause, or any `create/update/delete` line other than the single `users` create allow-list above.

`database.rules.json` needs no change (session lock is owner-only and role-agnostic).

### 7.2 Client

**Types and labels** (`src/lib/firebase.ts`): add `'spectator'` to `Role`; add `spectator: 'Spectator'` to `getRoleLabel()`. `AuditEventType`/other unions unaffected.

**Capability module** (`src/lib/roleCapabilities.ts`, new):

- `hasAdminView(role)`: `super_admin`, `institution_admin`, `spectator`.
- `hasStaffView(role)`: the above plus `senior_teacher`, `regular_teacher`.
- `canWrite(role)`: `super_admin`, `institution_admin`, and teachers where the page already allows them; **never** `spectator`.
- Rule of thumb enforced in review: **view paths use `hasAdminView`; any button, form, `FormModal` trigger, import, generate, toggle or save uses `canWrite`.**

**Sidebar** (`src/lib/sidebarNav.ts`): add `"spectator"` to `visible` for every item that `institution_admin` sees **except** Create Account, Import Data, Backfill Classes, Rebuild Summaries (D6/D7). Items visible: Home, Teachers, Students, Parents, Subjects, Departments, Houses, Classes, Terms, Schedule, Lessons, Exams, Assignments, Rubrics, Gradebook, Results, Feedback, Disciplinary Action, Grade Tracking, Report Card Comments, Report Cards, Progress Reports, Report Builder, General Register, Summary Register, Subject Register, Registrations, Academic Calendar, Audit Log, User Profile, and **Institution Info** (spectators use the read-only view, not "Institution Profile" which is the admin editor). Note the register pages currently list `senior_teacher` / `regular_teacher` / admins in `visible`; spectator is added to each.

**Routes** (`src/App.tsx`):

- Add `spectator` to every admin-view route guard that is not a write tool (subject detail, class detail, term detail, rubrics, lesson notes, gradebook, registrations, report builder, audit log, academic calendar, general/subject/gridsheet attendance, grade tracking, houses and house detail, report card comments, institution profile).
- Keep Create Account, Import, Backfill, Rebuild Summaries guards as they are (spectator redirected).
- Add `/dashboard/brand-settings` and `/dashboard/settings` guards: spectator redirected (the Settings page saves institution fields).
- Unguarded list routes stay unguarded; their buttons use `canWrite`.
- Home: add `role === "spectator" ? <SpectatorPage /> :` and replace the final `<AdminPage />` fallback with a neutral "no access" or redirect to `/login`.

**Pages** — pattern: every `role === "institution_admin" || role === "super_admin"` used for a _view_ becomes `hasAdminView(role)`; every one used for a button/form/delete becomes `canWrite(role)`. Because the existing code uses one expression for both on many list pages (teachers, students, parents, subjects, departments, classes, terms, events, announcements, houses, exams, lessons, assignments, results, feedback, rubrics), most of those pages need **no** change for spectators: the buttons already hide because the expression is false. The edits are where the same check gates _content_ (section 11 lists them).

**Create Account form** (`AdminCreateUserForm.tsx`):

- `roleOptions`: for `super_admin` add `"spectator"`; for `institution_admin` add `"spectator"` after `"parent"`.
- Zod `role` enum: add `"spectator"`.
- `ROLE_DEFAULT_PASSWORDS`: no entry (D13).
- Institution requirement (`values.role !== "super_admin" && !values.institutionId`) already covers spectator.
- `AdminCreateUserForm` logs `Created ${getRoleLabel(values.role)} account…` to the audit log — works once the label exists.
- Department/class/student-specific fields are conditional on role and stay off for spectator.

**Account management UI:** `AccountStatusToggle.tsx` and `SessionResetButton.tsx` allow `institution_admin`/`super_admin` only (spectator excluded, good) and are rendered on the Teachers/Students/Parents lists. **Spectators appear in none of those lists**, so nobody can reach their toggle. Add a **Spectators** list page (OQ1).

**Other role lists to extend:** `inactivityTimeout.ts` `STAFF_ROLES` (decide: OQ5), `ProfileActivitySection.tsx` `STAFF_ROLES`, `profile/index.tsx` role maps (two `Record<Role, …>` at ~235 and ~380), `auditEntry.ts` role→label helper (`role === 'institution_admin' || 'super_admin' ? 'Administrator' : 'Teacher'`; spectator never writes audit entries, so no change, but confirm), `useTourSteps.ts` / `ROLES_WITH_REAL_TOURS` (no change; spectator excluded), `useLessonNotes.ts` (admin branch: add `spectator` for the whole-collection query).

**Spectator home page:** a read-only variant of `AdminPage` (counts, announcements, events, charts) with no create shortcuts. Use `AdminPage` as the starting point and remove write affordances.

### 7.3 Behaviour contract (what a spectator experiences)

| Area         | Behaviour                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in      | Same login; sign-in log, session lock and first-login password change work (D2).                                                                                                        |
| Sidebar      | Admin sidebar minus the four hidden tools; "Institution Info" instead of "Institution Profile".                                                                                         |
| Lists        | Teachers, Students, Parents, Subjects, Classes, Terms, Departments, Houses, Exams, Lessons, Assignments, Results, Feedback, Events, Announcements all load; no Add/Edit/Delete buttons. |
| Detail pages | Student, subject, class, term, house, assignment detail pages open; inline editors (links, activities, responsibilities, comments, photo) hidden.                                       |
| Reports      | Report Cards, Progress Reports, Report Card Comments, Grade Tracking, Report Builder readable; no Generate/Save.                                                                        |
| Attendance   | General, Subject and Summary registers readable; no save/import/rebuild.                                                                                                                |
| Audit log    | Own institution's audit log readable.                                                                                                                                                   |
| Profile      | Own name/email; no contact edit (rules already restrict that to super admin).                                                                                                           |
| Top bar      | Shows "Spectator".                                                                                                                                                                      |

---

## 8. Gotchas

1. **Direct Firestore access.** The UI is cosmetic; rules are the only enforcement. Rule tests (section 9) are mandatory.
2. **Queries must satisfy rules on their own.** If a spectator page issues an unfiltered query that an admin page issues with an `institutionId` filter, it will be denied entirely. Reuse the exact admin queries.
3. **`lessonNoteReadableBy()` is shared** by the note and its attachment sub-document; edit it once, in the function.
4. **Report generation is hidden, not blocked by UI alone.** The write rules (`isAdmin()` only for `reportCards` / `progressReports`) already deny a spectator; the Generate button hiding (`isAdmin` local const in `report-cards/index.tsx` and `progress-reports/index.tsx`) is cosmetic.
5. **Local `isAdmin` constants** exist in several pages (`progress-reports`, `report-cards`, `disciplinary-actions`, `students/[id]`, `settings`, `gradebook`). They use admin-ness for both view and write; each needs reading, not search-and-replace.
6. **`students/[id]` has 8 write handlers** (parent links, activities, responsibilities, report-card comments, photo). All are behind `role === "institution_admin"` and stay hidden; the view sections for the same data must be shown to spectators.
7. **Settings page is unguarded** and writes `institutions/{id}`. Spectator must be redirected (rules would refuse, but a failed write presents as a broken page).
8. **Brand Settings route** admits `institution_admin` though the sidebar only lists it for `super_admin`; keep spectator out of the route.
9. **Deactivation of spectators** is possible through the existing `users` update clause, but there is no UI list for them today (OQ1).
10. **`institution_admin` cannot edit another `institution_admin`**, but can edit a spectator (not covered by the exclusion). That is intended (D4); a spectator can never edit anyone.
11. **Single-session lock** (`sessionLock.ts`) applies to spectators too; `SessionResetButton` is admin-only, so an admin resets a stuck spectator session from a Spectators list (OQ1).
12. **Super admin's Manage Admins page** queries `role == 'institution_admin'` only; it will not list spectators.
13. **Seed and maintenance scripts** (`seed-bulk-institution.mjs`, `reset-role-default-passwords.mjs`) enumerate roles; they should ignore or explicitly handle `spectator`. `teardown-bulk-institution.mjs` is roster-based and role-agnostic.
14. **Exhaustive `Record<Role, …>` maps** produce TypeScript errors once `Role` grows — useful; treat each as a required review point.
15. **"Same clearance, always"** needs a standing guard: whenever a new admin-only read feature ships, the matching spectator read must ship with it. Section 9's subset tests catch drift one way; a checklist item in the rules file comment catches it the other way.

---

## 9. Test plan

| Layer                                                 | Test                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (vitest)                                         | `sidebarNav.test.ts`: every item visible to `spectator` is also visible to `institution_admin`, and none of the four hidden tools is visible to `spectator`.                                                                                                                         |
| Unit (vitest)                                         | `roleCapabilities.test.ts`: `canWrite('spectator') === false`; `hasAdminView('spectator') === true`.                                                                                                                                                                                 |
| Static rules lint (vitest, like `auditRules.test.ts`) | Parse `firestore.rules`; fail if `isSpectator()`, `canReadAdminData()` or `canReadStaffData()` appears in any `allow create/update/delete/write` line, or if `'spectator'` appears anywhere in the file other than the `users` create allow-list, `isSpectator()`, and read clauses. |
| Static client scan (vitest)                           | List the files for spectator-visible routes; fail if any of them imports a write function (`setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `writeBatch`) without `canWrite` in the same file. Allow-list the carve-out files.                                                          |
| Rules behaviour (optional, stretch)                   | Firebase emulator with `@firebase/rules-unit-testing` (not currently a dependency; needs the emulator and Java). Assert every write to every collection is denied and every read in 3.3 is allowed for a spectator of the same institution and denied for another institution.       |
| Manual / e2e (Playwright)                             | Create a spectator as an institution admin; sign in; first-login password change succeeds; walk every sidebar item; no write control renders; a direct console `setDoc` is denied.                                                                                                   |
| Free-tier                                             | Compare read counts for the same page load as admin vs spectator; expect equal.                                                                                                                                                                                                      |

---

## 10. Implementation plan

Do the steps in order; each ends in a state that can be committed and, for rules, safely deployed.

### Phase 0 — Preparation (no behaviour change)

1. Confirm OQ1–OQ7 with the owner. **Done 2026-10-08** (section 12), except OQ4, which needs the census in step 4.
2. Record the baseline. **Done 2026-10-08**, on a clean tree: `npm test` 45 files / 583 tests pass; `npx tsc -b` passes; `npx vite build` passes (only the chunk-size warning); `npx eslint .` reports nothing.
3. Check `firestore.rules` size. **Done:** 118,847 bytes (about 116 KB), 2,011 lines, against the 256 KB source limit, so there is ample room.
4. **Done 2026-10-08:** legacy-collection census (`node scripts/count-legacy-flat-collections.mjs --key=scripts/service-account.json --project=school-sms-v1`). Result recorded under OQ4: 29 leftover documents, no app code reads them, flat rules stay unchanged. Phase 0 is complete; Phase 1 may start.

### Phase 1 — Rules

1. **Done 2026-10-08.** Add `isSpectator()`, `canReadAdminData()`, `canReadStaffData()` helpers with the comment "READ ONLY — never use in create/update/delete".
2. **Done 2026-10-08.** Apply the read changes in the 3.3 table, one collection at a time. All 23 rows applied, including the collection-group `activity_log` read (added for admin parity although the app never queries it). No create/update/delete rule uses a spectator helper. `npm test` passes (583 tests) and `firebase deploy --only firestore:rules --dry-run --project school-sms-v1` compiles the rules successfully; nothing was released.
3. **Done 2026-10-08.** Add `'spectator'` to the `users` create allow-list for `isAdmin()`. The only write-rule line changed in Phase 1; it widens an institution admin's creatable roles by one, with the same-institution check (`writingToMyInstitution()`) unchanged. `update` already covers spectators (it excludes only `institution_admin` targets), `delete` stays `super_admin` only. Tests pass and the Firebase dry-run compiles.
4. Add a short "keeping spectator in step with admin reads" checklist comment above the helpers.
5. Add the static rules-lint test; run all tests.
6. **Deploy rules first** (`firebase deploy --only firestore:rules --project school-sms-v1`, from `sms-system`). Harmless until a spectator exists. (If rules go out before the client, nothing changes for existing roles; if the client goes first, spectators are denied everywhere, which is also safe.)

### Phase 2 — Types and capability module

1. Add `'spectator'` to `Role`; add the label to `getRoleLabel()`.
2. Create `src/lib/roleCapabilities.ts` and its test.
3. Fix the TypeScript errors from exhaustive `Record<Role, …>` maps (profile page maps, etc.).

### Phase 3 — Sidebar, routes, home

1. Update `sidebarNav.ts` `visible` lists; extend the sidebar test.
2. Update `App.tsx` guards and add the `SpectatorPage` home; replace the `AdminPage` fallthrough.
3. Add the Settings and Brand Settings redirects.
4. Create `SpectatorPage` from `AdminPage` without write shortcuts.

### Phase 4 — Page-by-page view access

Work through the list in section 11. For each file: identify view versus write uses of the check, migrate to `hasAdminView` / `canWrite`, load the page as a spectator in the browser.

### Phase 5 — Create Account and management

1. Extend `AdminCreateUserForm.tsx` (role options for both caller roles, zod enum, no default password).
2. Add the **Spectators** list page (name, email, status, deactivate, session reset) under PEOPLE for `institution_admin`; decide the `super_admin` equivalent (OQ1).
3. Verify `AccountStatusToggle` and `SessionResetButton` work for a spectator target through the existing update clause.

### Phase 6 — Scripts, docs, compliance

1. Audit `scripts/seed-bulk-institution.mjs`, `scripts/reset-role-default-passwords.mjs`, `e2e/helpers.ts` for role lists.
2. Update `docs/project-overview/ROLE_PRIVILEGE_ANALYSIS.md`, `sms-role-specification-v1.md`, `docs/firebase/firebase-rules.md`, `docs/login/LOGIN_ARCHITECTURE.md`, `docs/guides/DEMO_TESTING_GUIDE.md`.
3. Add the role to `docs/compliance/` (bulk read of personal data), `docs/backend/PII_SPLIT_DESIGN.md` (private profile readers) and `docs/backend/OPENAPI_V0_ENDPOINTS.md` (per-role authorisation table).
4. Mention the role in `INSTITUTION_LOGIN_EMAILS_SPEC.md` if first-login emails are role-aware.

### Phase 7 — Verification and release

1. Run the full test plan (section 9).
2. Create a spectator in a non-production project (the planned `sms-staging`, or an emulator) and walk the contract in 7.3.
3. Deploy client (Vercel), then create the first real spectator account.
4. Rollback: deactivate spectator accounts (`status: 'inactive'` removes all access); revert the client; rules additions are harmless to leave in place.

---

## 11. Client audit — files to review

Files where the check gates _content_ or a _role map_, so they need a deliberate edit (writes already hide because the boolean is false for spectator):

| File                                                                                                                                                                        | Why                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                                                                                                                                                               | Route guards, home page, default fall-through.                                                            |
| `src/lib/sidebarNav.ts`                                                                                                                                                     | `visible` lists.                                                                                          |
| `src/lib/firebase.ts`                                                                                                                                                       | `Role`, `getRoleLabel`.                                                                                   |
| `src/lib/permissions.ts`                                                                                                                                                    | `canGenerateSchedule` — spectator must stay false (document it).                                          |
| `src/lib/inactivityTimeout.ts`                                                                                                                                              | `STAFF_ROLES` (OQ5).                                                                                      |
| `src/components/forms/AdminCreateUserForm.tsx`                                                                                                                              | Role options, zod enum, defaults.                                                                         |
| `src/components/profile/ProfileActivitySection.tsx`, `ProfileAuditSection.tsx`                                                                                              | Admin-only sections; decide whether spectator sees institution activity and audit (rules allow; see OQ6). |
| `src/scenes/(dashboard)/profile/index.tsx`                                                                                                                                  | Two `Record<Role,…>` maps.                                                                                |
| `src/scenes/(dashboard)/institution-profile/index.tsx`                                                                                                                      | Non-admin read-only view for spectator (already the behaviour).                                           |
| `src/scenes/(dashboard)/settings/index.tsx`                                                                                                                                 | Redirect spectator.                                                                                       |
| `src/scenes/(dashboard)/list/students/[id]/index.tsx`                                                                                                                       | Eight write handlers, view sections.                                                                      |
| `src/scenes/(dashboard)/report-cards/index.tsx`, `progress-reports/index.tsx`                                                                                               | Local `isAdmin` gates Generate; view of saved documents.                                                  |
| `src/scenes/(dashboard)/disciplinary-actions/index.tsx`                                                                                                                     | Local `isAdmin` for view of all records vs own.                                                           |
| `src/scenes/(dashboard)/list/results/index.tsx`                                                                                                                             | `isStaff` for query scope.                                                                                |
| `src/scenes/(dashboard)/list/assignments/index.tsx`, `[id]/index.tsx`                                                                                                       | Admin branch of the unfiltered query.                                                                     |
| `src/hooks/useLessonNotes.ts`, `list/lesson-notes/index.tsx`                                                                                                                | Admin whole-collection query.                                                                             |
| `src/scenes/(dashboard)/list/gradebook/index.tsx`                                                                                                                           | Admin/teacher view gates; saves hidden.                                                                   |
| `src/scenes/(dashboard)/admin/audit-log/index.tsx`                                                                                                                          | `isInstitutionAdmin` query scope.                                                                         |
| `src/scenes/(dashboard)/list/rubrics/index.tsx`                                                                                                                             | View gate.                                                                                                |
| `src/scenes/(dashboard)/schedule/index.tsx`                                                                                                                                 | "Manage Access" panel stays hidden; view for all.                                                         |
| `src/scenes/(dashboard)/academic-calendar/index.tsx`, `report-card-comments/index.tsx`, `registrations/index.tsx`, `admin/grade-entry-tracking/index.tsx`, `list/houses/**` | View-only rendering with write controls hidden.                                                           |
| `src/components/Menu.tsx`                                                                                                                                                   | "Institution profile incomplete" nudge stays admin-only (no change).                                      |
| `src/components/AccountStatusToggle.tsx`, `SessionResetButton.tsx`                                                                                                          | Unchanged (spectator excluded), used by the Spectators list.                                              |

Files that need no change for spectators: the list pages whose buttons use `(role === "institution_admin" || role === "super_admin")` purely for create/edit/delete (teachers, students, parents list, subjects, classes, terms, departments, events, announcements, exams, lessons, feedback).

---

## 12. Open questions

| ID  | Question                                                                                | Recommendation                                                                                                                                                   | Resolution (2026-10-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ1 | Where do admins see, deactivate and reset sessions for spectators? No list page exists. | Add a **Spectators** list under PEOPLE for `institution_admin`; super admin reaches spectators through the institution they manage or a filter on Manage Admins. | **Resolved:** build the Spectators page (Phase 5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| OQ2 | What does the spectator home page show?                                                 | `AdminPage` content without create shortcuts.                                                                                                                    | **Resolved:** accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| OQ3 | May a spectator see the Audit Log and profile "Audit and security events"?              | Yes for the institution audit log (admin parity, D2/R2); leave the profile-security section hidden unless wanted.                                                | **Resolved:** accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| OQ4 | Has legacy flat data been fully moved, so unchanged flat rules are safe to leave?       | Verify before Phase 1; if any flat collection is still live, extend it too.                                                                                      | **Resolved (2026-10-08), D12 stands.** The census (`scripts/count-legacy-flat-collections.mjs`, production) found 29 documents across 21 legacy flat collections: `teachers` 5, `students` 5, and exactly 1 in each of 19 others (`subjects`, `classes`, `terms`, `academicYears`, `nonSchoolDays`, `houses`, `departments`, `results`, `feedback_comments`, `studentActivities`, `studentResponsibilities`, `reportCardComments`, `reportCards`, `generalAttendance`, `subjectEnrollments`, `subjectAttendance`, `attendanceSummaries`, `timetable_slots`, `gradebooks`). Six are absent: `lessons`, `exams`, `assignments`, `events`, `announcements`, `disciplinaryActions`. Nothing in `src/` reads any flat collection other than `users` and `student_parents`, so these are leftovers, not live data. Live collections: `users` 2,573, `student_parents` 1,914, `institutions` 7, `registration_directory` 3. One unlisted top-level collection, `reports`, exists and is referenced nowhere in `src/`, `scripts/` or `e2e/`. Flat rule blocks are left unchanged; the leftovers are a cleanup item (section 6, DF7). |
| OQ5 | Should spectators be subject to the staff inactivity timeout (`STAFF_ROLES`)?           | Yes — treat them as staff: they read personal data.                                                                                                              | **Resolved:** accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| OQ6 | Do spectators see Settings (view)?                                                      | No; hidden and redirected in v1.                                                                                                                                 | **Resolved:** accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| OQ7 | Should the rules emulator tests be added as a dev dependency?                           | Yes if the owner accepts the Java/emulator requirement; otherwise rely on the static lint plus manual checks.                                                    | **Resolved:** static lint only; no emulator tests (revisit later if wanted).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 13. Risks

| Risk                                                                         | Mitigation                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A write clause later gains `canReadAdminData()` by mistake                   | Static rules lint test fails the build.                                                         |
| A new admin read feature ships without a spectator read                      | Checklist comment in rules; sidebar subset test; periodic review.                               |
| Personal data exposure through an over-trusted spectator account             | Owner decision D5; deferred masking (DF3); deactivation as kill switch; no read auditing (DF5). |
| Direct-SDK writes by a spectator                                             | Not possible: no write clause names the role; verify with rules tests.                          |
| Spectator page issues an admin query without the needed filter and is denied | Reuse admin queries verbatim; manual walk of every page.                                        |
| `AdminPage` fallthrough leaves a hole for future unknown roles               | D8 fix.                                                                                         |
