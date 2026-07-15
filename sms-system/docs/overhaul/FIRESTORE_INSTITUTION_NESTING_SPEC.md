# Firestore Institution-Nesting Overhaul — Spec

> **Status:** In progress. Tooling foundation and `institutions/master` are done (§11 steps 1–2); everything else is design-complete, unstarted implementation.
> **Scope:** Restructure Firestore from ~30 flat, top-level collections (each scoped by an `institutionId` field) into a hierarchy rooted at `institutions/{institutionId}/...`, with `users` and `student_parents` staying flat as explicit exceptions. Includes a full Firestore rules/index rewrite, Firebase CLI adoption, an Admin-SDK data migration preserving existing Console data (§10), archival of 5 legacy/broken collections found during this audit, and `collectionGroup()` cross-institution access for `super_admin`.
> **Driver:** Enable clean, recursive per-institution data deletion/export (not currently possible with flat collections) as the app approaches multi-tenant scale. **Revised:** real data now exists in the Console (pilot/demo usage has begun) — this is a live data migration with a cutover plan, not a wipe-and-reseed. See [§10](#10-migration-plan) for the full migration design.
> **Not in scope:** Moving `users` or `student_parents` under institutions (see [§3 Design Decisions](#3-design-decisions)); building a Supabase or non-Firebase backend; building any new super_admin UI that *consumes* the new `collectionGroup()` access (this spec only makes it possible at the rules/index layer); building an in-app maintenance-mode feature (§10.4 uses manual coordination instead — see [§12](#12-deferred-items)).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State Audit](#2-current-state-audit)
3. [Design Decisions](#3-design-decisions)
4. [Target Architecture](#4-target-architecture)
5. [Firestore Security Rules](#5-firestore-security-rules)
6. [Firestore Indexes](#6-firestore-indexes)
7. [Firebase CLI Adoption](#7-firebase-cli-adoption)
8. [Legacy Collection Cleanup](#8-legacy-collection-cleanup)
9. [Application Code Changes](#9-application-code-changes)
10. [Migration Plan](#10-migration-plan)
11. [Implementation Order](#11-implementation-order)
12. [Deferred Items](#12-deferred-items)
13. [Issues Found During This Audit](#13-issues-found-during-this-audit)
14. [Firebase Free Tier (Spark Plan) Analysis](#14-firebase-free-tier-spark-plan-analysis)

---

## 1. Overview

Every Firestore collection in this app — `users` included — currently lives at the top level of the database, alongside every other collection, scoped by an `institutionId` field that every document carries and every rule checks via `resource.data.institutionId`. This spec restructures most of those collections into subcollections of `institutions/{institutionId}`; `users` (and the `student_parents` junction collection) stay exactly where they are today — see §3.1/§3.2 for why. Nesting the rest means an institution's entire dataset is physically collocated and can be deleted or exported as one subtree via the Firebase CLI — something not possible today without touching ~28 separate top-level collections individually.

This is a large, mechanical change (~30 collections, 200+ Firestore call sites across ~70 files, a full rules and index rewrite). **Revised scope:** real data now exists in the Console from pilot/demo usage, so this is no longer a wipe-and-reseed — it requires an Admin-SDK migration script that copies every existing document to its new nested path (preserving document IDs) before the corresponding rules/code cutover, and a short per-phase maintenance window to keep the copy consistent. See [§10](#10-migration-plan) for the full design; §3.10–§3.13 record the decisions behind it.

While auditing the current rules and collections to write this spec, two concrete, currently-live problems were found (not hypothetical) — see [§13](#13-issues-found-during-this-audit). Both are fixed as part of this overhaul.

---

## 2. Current State Audit

### 2.1 Full collection inventory

Every collection referenced anywhere in `src/` (via `collection(db, ...)` or `doc(db, ...)`), cross-referenced against `firebase-rules.md`:

| Collection | Scoped by | Written by | Read by | Disposition |
|---|---|---|---|---|
| `users` | `institutionId` field | Everywhere (signup, admin edits) | Everywhere | **Stays flat** — see §3.1 |
| `users/{uid}/activity_log` | parent doc | `AuthContext.tsx` (sign-in log) | Owner; admins via `collectionGroup` | **Stays flat** — tied to `users` |
| `student_parents` | `institutionId` field, doc ID `{parentId}_{studentId}` | `StudentDetail`, `ParentForm` | Widely (parent-scoping checks across ~8 pages) | **Stays flat** — see §3.2 |
| `institutions` | — (this *is* the root) | Onboarding, brand settings | Everywhere | **Unchanged** — already the hierarchy root |
| `institutions/{id}/audit_log` | parent doc | Admin actions (batched with primary write) | `institution_admin`, `super_admin` via `collectionGroup` | **Unchanged** — already nested correctly; proof the pattern already works in this app |
| `subjects` | `institutionId` field | `SubjectForm` | Everywhere | Nest |
| `classes` | `institutionId` field | `ClassForm` | Everywhere | Nest |
| `terms` | `institutionId` field | `TermForm` | Everywhere | Nest |
| `academicYears` | `institutionId` field | Academic Calendar | Everywhere | Nest |
| `nonSchoolDays` | `institutionId` field | Academic Calendar | Everywhere | Nest |
| `houses` | `institutionId` field | `HouseForm` | Everywhere | Nest |
| `departments` | `institutionId` field | `DepartmentForm` | Everywhere | Nest |
| `lessons` | `institutionId` field | Lessons page | Everywhere | Nest |
| `exams` | `institutionId` field | `ExamForm` | Everywhere | Nest |
| `assignments` | `institutionId` field | `AssignmentForm` | Everywhere | Nest |
| `results` | `institutionId` field | `ResultForm`, Gradebook | Everywhere | Nest |
| `feedback_comments` | `institutionId` field | `FeedbackCommentForm`, Gradebook | Everywhere | Nest |
| `studentActivities` | `institutionId` field | Student Detail | Everywhere | Nest |
| `studentResponsibilities` | `institutionId` field | Student Detail | Everywhere | Nest |
| `reportCardComments` | `institutionId` field | Student Detail, Report Card Comments page | Admins only | Nest |
| `reportCards` | `institutionId` field | `generateReportCard.ts` | Everywhere | Nest |
| `disciplinaryActions` | `institutionId` field | `DisciplinaryActionForm` | Everywhere | Nest |
| `generalAttendance` | `institutionId` field | General Register | Everywhere | Nest |
| `subjectEnrollments` | `institutionId` field | `SubjectForm` | Everywhere | Nest |
| `subjectAttendance` | `institutionId` field | Subject Register | Everywhere | Nest |
| `attendanceSummaries` | `institutionId` field | Rebuild Summaries utility | `generateReportCard.ts` | Nest |
| `events` | `institutionId` field | Events page | Everywhere | Nest |
| `announcements` | `institutionId` field | Announcements page | Everywhere | Nest |
| `timetable_slots` | `institutionId` field | `TimetableSlotForm` | Everywhere | Nest |
| `gradebooks` (+ `columns` subcollection) | `institutionId` field | Gradebook page | Everywhere | Nest (subcollection nesting preserved one level deeper) |
| `reports` | — | Nothing (rule explicitly `allow read, write: if false`) | Nothing | **Remove** — already dead, see §8 |
| `teachers` | `institutionId` field | `AdminCreateUserForm` only, at signup | `TimetableSlotForm`, `ExamForm`, `AssignmentForm` (department lookups) | **Remove** — stale mirror, see §13.1 |
| `students` | `institutionId` field | `AdminCreateUserForm` only, at signup | Nothing | **Remove** — write-only, dead |
| `parents` | `institutionId` field | Nothing | Nothing | **Remove** — dead, rule-only |
| `teacher_classes` | `institutionId` field | Nothing | Nothing | **Remove** — dead, rule-only |
| `attendance` (singular) | `institutionId` field | Nothing (superseded) | Nothing | **Remove** — dead, rule-only |

**30 collections/subcollections today** (25 real + 5 dead) → **27 after cleanup** (25 nested/unchanged + `users`/`student_parents` flat), none renamed except by relocation.

### 2.2 Existing nesting precedent

Two subcollections already exist and already work exactly like the target pattern for everything else:

- `users/{uid}/activity_log/{eventId}` — per-user, read by the owner directly, read by admins via `collectionGroup('activity_log')`.
- `institutions/{institutionId}/audit_log/{eventId}` — **this is the exact target shape** for every other collection in this spec. It already proves the pattern works in this app's rules engine, at this app's scale, today.

Two `collectionGroup` rules already exist and already prove that pattern too:

```javascript
match /{path=**}/activity_log/{eventId} {
  allow read: if isSuperAdmin()
    || (isAdmin() && resource.data.institutionId == myInstitutionId());
}
match /{path=**}/audit_log/{eventId} {
  allow read: if isSuperAdmin();
}
```

This overhaul is, in a real sense, finishing a pattern the codebase already started — not introducing an unproven one.

### 2.3 Firebase tooling

There is no `firebase.json`, `firestore.rules`, or `firestore.indexes.json` file anywhere in the repo, and no `firebase-tools` devDependency (only the client `firebase` SDK package is installed). All rules and indexes today are edited by hand in the Firebase Console; `docs/firebase/firebase-rules.md` documents them after the fact, with a standing note that it is "reference only" and the Console is authoritative. This is a hard blocker for actually deploying anything this spec produces from within a coding environment — see [§7](#7-firebase-cli-adoption).

---

## 3. Design Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 3.1 | Should `users` nest under `institutions`? | **No — stays flat**, exactly as today | `AuthContext.tsx` resolves role/institution on every sign-in via `getDoc(doc(db, 'users', uid))` — a uid-only lookup. Nesting would require knowing `institutionId` *before* that lookup, but that lookup is what determines `institutionId`. **This client-side half is actually solvable** — a `collectionGroup('users').where('uid','==',myUid)` query (plus one new Collection Group index on `uid`) finds the profile without knowing its parent path, the same pattern already proven by `activity_log`/`audit_log`. The decision to keep `users` flat rests on a deeper problem instead: Firestore's `get()`/`exists()` inside security rules can only fetch an *exact, known path* — they cannot query. Every role-check helper in this rules file (`myRole()`, `isAdminOrAbove()`, `isTeacherOrAbove()`, etc.) depends on `me()` → `get(.../users/$(uid))`, a single global fact today. Nesting `users` would mean re-deriving how *every one* of those helpers resolves the caller's identity per-institution-context (not just adding a path segment to the 25 resource collections in §4.1) — a materially larger rules rewrite than the rest of this spec. Considered and explicitly rejected for that reason, not overlooked. (The clean long-term fix remains Firebase Auth custom claims instead of a Firestore read at all — requires a Cloud Function or other backend this repo doesn't have; out of scope here, flagged in §12.) |
| 3.2 | Should `student_parents` nest under `institutions`? | **No — stays flat**, same reasoning as `users` extended | Its doc ID (`{parentId}_{studentId}`) is built from two uids with no institution segment involved, matching how `users` docs are addressed. It's also the one collection that structurally links two `users` documents — since `users` stays flat, keeping this adjacent junction collection flat too avoids inventing a new "which institution does this edge belong to" rule when both parent and student already carry their own `institutionId` fields independently. |
| 3.3 | Keep `institutionId` as a field on nested documents, even though the path now encodes it? | **Yes, keep it** | Needed for `collectionGroup()` results (a `super_admin` cross-institution query result has no built-in "which institution" field — the client would have to parse `doc.ref.path` manually without it) and for existing display/denormalization code that already reads `.institutionId`. The *rules* stop trusting this field as the source of truth for scoping (see 3.4) — it becomes purely a convenience/display field, validated against the path on every write. |
| 3.4 | How do rules determine institution scope — the `institutionId` field, or the path segment? | **Path segment**, field becomes a validated denormalization | `match /institutions/{institutionId}/results/{resultId}` already gives rules the institution ID as a trusted path variable, known before `resource.data` is even read. This collapses today's two separate helpers (`sameInstitution()` for read/update/delete, `writingToMyInstitution()` for create) into one (`inMyInstitution(institutionId)`), and removes an entire class of "did the client actually write `institutionId` correctly" trust issues from every collection's rules. A new `institutionFieldMatchesPath()` guard on create/update keeps the denormalized field honest. |
| 3.5 | Clean up the 5 legacy/broken collections found during this audit, or migrate them byte-for-byte? | **Clean up as part of this overhaul** | Confirmed with the user — see [§8](#8-legacy-collection-cleanup) and [§13](#13-issues-found-during-this-audit) for what's actually broken and why fixing it now (rather than nesting bugs into a new structure) is the better use of an already-large rewrite. |
| 3.6 | Extend `collectionGroup()` cross-institution reads to every collection, or keep today's per-collection "select an institution" `super_admin` UX? | **Extend to every collection** | Confirmed with the user. Every nested collection gets a `collectionGroup` rule following the exact `audit_log` precedent (`allow read: if isSuperAdmin();`) so `super_admin` *can* query across institutions once a consuming UI is built later. This spec only makes it possible at the rules/index layer — building the UI that uses it is out of scope (see §12). |
| 3.7 | Add a literal `institutions/master` document for `super_admin`-owned global data? | **Yes, create it** | Confirmed with the user. It requires zero new rules — it's just a normal document in the existing `institutions` collection, already readable/writable only by `super_admin` under the existing rule (`allow read: if isSuperAdmin() || myInstitutionId() == institutionId` — no real user's `myInstitutionId()` will ever equal `'master'`). It does **not** change the existing `institutionId === '*'` sentinel `super_admin` already uses throughout `AuthContext.tsx` and every list page — that convention is unrelated and unchanged. `master` is a reserved slot for future platform-wide settings; nothing currently reads or writes it. |
| 3.8 | One big-bang migration, or phased? | **Phased** | Confirmed with the user. See [§11](#11-implementation-order) for the concrete batches. |
| 3.9 | Introduce a shared path-building helper instead of continuing 200+ raw string-literal `collection(db, 'x')` calls? | **Yes — `src/lib/paths.ts`** | The current codebase has zero data-access abstraction; every component builds Firestore paths inline. This overhaul is the natural point to introduce one thin helper (`institutionCollection(institutionId, 'results')` → returns the right `CollectionReference`), which both makes this migration mechanically safer (one function to get right instead of 200 call sites to individually remember) and de-risks any *future* restructuring the same way. Not a full repository/data-access-layer rewrite — just path construction. See [§9](#9-application-code-changes). |
| 3.10 | Preserve existing Console data during the migration, or wipe and reseed as originally planned? | **Preserve — this is now a live data migration** | Confirmed with the user. Real pilot/demo data now exists in the Console; the original "pre-launch, no live data" premise (§1, old §10) no longer holds. Every document in the 25 nesting collections, plus the 5 legacy collections (§3.13), is copied to its new path with its existing document ID intact — no reseed step remains anywhere in this spec. See [§10](#10-migration-plan). |
| 3.11 | What copies the data — a client-side script or an Admin SDK script? | **Admin SDK, service-account-key-based** | Confirmed with the user. Bypasses security rules entirely, which matters because the rules are being rewritten at the same time the data moves — anything constrained by rules mid-migration is fragile by construction. Also the only practical way to bulk-read/write ~25 collections without depending on a signed-in user's session or per-document rule evaluation overhead. Must run locally by whoever performs the migration — this coding environment has no service-account credentials (a standing constraint all session, see §7.3) — so the script is handed over as a file to run with `node`, never executed here. |
| 3.12 | How does the migration stay consistent with an app that's still in use while each phase's copy runs? | **Brief maintenance window per phase; no in-app maintenance-mode feature** | Confirmed with the user. §11 already isolates each phase to a handful of collections; a short "please pause using the app for the next few minutes" coordination window with each pilot institution's admin, timed around that phase's copy, avoids missed writes without building read-only/maintenance-mode infrastructure that has no other use in this app — the same lean-over-speculative bias already applied to §6.2's deferred Collection Group indexes. The zero-downtime alternative (a two-pass delta copy) was considered and deferred — see [§12](#12-deferred-items). |
| 3.13 | Migrate the 5 legacy/broken collections (§8) too, or still discard them as §3.5 originally decided? | **Migrate/archive them, unchanged** | Confirmed with the user — this reverses §3.5's "clean up, don't migrate" framing now that data preservation is the stated goal. `teachers`, `students`, `parents`, `teacher_classes`, and `attendance` (singular) are copied to `institutions/{institutionId}/{collection}/{docId}` exactly like the 25 real collections, no schema changes. This is archival only — it does **not** reinstate the app's dependence on `teachers`/`students` as a live data source; the §13.1 bug fix (reading `departmentId` from `users` directly, never the mirror) still ships as designed. Post-migration these 5 collections simply exist as inert, unread subcollections preserving whatever was in the Console before cutover. |

---

## 4. Target Architecture

### 4.1 Path shapes

```
institutions/{institutionId}                                   ← unchanged, root of hierarchy
institutions/master                                             ← NEW, reserved for future platform-wide data
institutions/{institutionId}/audit_log/{eventId}                ← unchanged, already correct

institutions/{institutionId}/subjects/{subjectId}
institutions/{institutionId}/classes/{classId}
institutions/{institutionId}/terms/{termId}
institutions/{institutionId}/academicYears/{yearId}
institutions/{institutionId}/nonSchoolDays/{dayId}
institutions/{institutionId}/houses/{houseId}
institutions/{institutionId}/departments/{departmentId}
institutions/{institutionId}/lessons/{lessonId}
institutions/{institutionId}/exams/{examId}
institutions/{institutionId}/assignments/{assignmentId}
institutions/{institutionId}/results/{resultId}
institutions/{institutionId}/feedback_comments/{docId}
institutions/{institutionId}/studentActivities/{id}
institutions/{institutionId}/studentResponsibilities/{id}
institutions/{institutionId}/reportCardComments/{id}
institutions/{institutionId}/reportCards/{id}
institutions/{institutionId}/disciplinaryActions/{actionId}
institutions/{institutionId}/generalAttendance/{docId}
institutions/{institutionId}/subjectEnrollments/{enrollmentId}
institutions/{institutionId}/subjectAttendance/{docId}
institutions/{institutionId}/attendanceSummaries/{id}
institutions/{institutionId}/events/{eventId}
institutions/{institutionId}/announcements/{announcementId}
institutions/{institutionId}/timetable_slots/{slotId}
institutions/{institutionId}/gradebooks/{gradebookId}
institutions/{institutionId}/gradebooks/{gradebookId}/columns/{colId}

users/{uid}                                                     ← unchanged (§3.1)
users/{uid}/activity_log/{eventId}                               ← unchanged
student_parents/{parentId}_{studentId}                           ← unchanged (§3.2)
```

Every nested document's document ID stays exactly what it is today (no ID scheme changes) — only the path prefix changes.

### 4.2 What deleting an institution looks like, post-overhaul

Today: manually issue ~28 separate `where('institutionId', '==', id)` deletes (client-side, batched, no atomicity across collections, easy to miss one).

After: `firebase firestore:delete institutions/{institutionId} --recursive` (via CLI, once §7 is in place) deletes the institution doc and every nested collection underneath it in one operation. `users` and `student_parents` documents for that institution still need a separate targeted delete (they're flat, by design — see §3.1/3.2), so institution deletion becomes **two** operations instead of ~28, not one — still a large practical improvement, and worth stating precisely rather than overselling.

**Two things this recursive delete does *not* handle, worth knowing before treating it as a complete "offboard this institution" action** (full analysis in §14):

- On the Spark (free tier) plan, a single recursive delete is capped by the 20,000-deletes/day quota. At the "handful of pilot schools" scale this repo is actually targeting, a realistic institution's total document count comfortably fits under that in one pass — but if a pilot school runs a full student body across several complete terms before being offboarded, `results` + `feedback_comments` alone can approach that ceiling. Firestore's daily quotas reset every 24 hours, so a delete that only gets partway simply resumes the next day — no data loss, just a two-day operation instead of one. Fine for an admin-initiated offboarding action; not something to build a progress bar around.
- It only deletes Firestore documents. Firebase **Storage** objects tied to the institution (`institutionLogoUrl`, `authorizedSignature`'s `imageUrl`) are untouched and become orphaned — a separate cleanup step (not designed in this spec) is needed for a truly complete institution deletion.

---

## 5. Firestore Security Rules

### 5.1 New/changed helper functions

```javascript
function isSignedIn() {
  return request.auth != null;
}

function me() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}

function myRole() {
  return me().role;
}

function myInstitutionId() {
  return me().institutionId;
}

function isSuperAdmin() { return isSignedIn() && myRole() == 'super_admin'; }
function isAdmin()      { return isSignedIn() && myRole() == 'institution_admin'; }
function isAdminOrAbove() { return isSuperAdmin() || isAdmin(); }
function isTeacher()      { return isSignedIn() && (myRole() == 'senior_teacher' || myRole() == 'regular_teacher'); }
function isSeniorTeacher() { return isSignedIn() && myRole() == 'senior_teacher'; }
function isTeacherOrAbove() { return isAdminOrAbove() || isTeacher(); }
function isParent() { return isSignedIn() && myRole() == 'parent'; }
function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }

function roleNotChanged() {
  return !('role' in request.resource.data.diff(resource.data).affectedKeys());
}

// CHANGED: institutionId is now a path segment, not a mutable field on most
// documents — this guard now only matters for `users`, the one collection
// where institutionId genuinely still lives as a top-level field.
function institutionNotChanged() {
  return !('institutionId' in request.resource.data.diff(resource.data).affectedKeys());
}

// NEW — replaces both sameInstitution() and writingToMyInstitution(). The
// institutionId path segment is available and trustworthy before any
// resource.data read happens, for reads, updates, deletes, AND creates —
// so one function now covers what used to require two.
function inMyInstitution(institutionId) {
  return isSuperAdmin() || myInstitutionId() == institutionId;
}

// NEW — defense in depth. The institutionId FIELD is kept on every document
// for collectionGroup/display convenience (§3.3), but is no longer trusted
// for scoping (§3.4) — this guard just keeps it honest on write, so a
// document's denormalized field can never disagree with the subtree it
// actually lives in.
function institutionFieldMatchesPath(institutionId) {
  return request.resource.data.institutionId == institutionId;
}

// REMOVED — §11 step 3 found `isClassTeacherFor` had exactly one caller in
// the live rules file: the `attendance` (singular) block deleted in that
// same step. `generalAttendance`/`timetable_slots` never actually called
// it, despite this section originally planning to carry it forward
// (updated for nesting) on the assumption they did. Not resurrected here —
// if a genuine class-teacher-scoped check is needed for a nested
// collection later, it should be reintroduced against that real need, not
// speculatively kept alive by this spec.

// CHANGED — previously read a separate teachers/{uid} mirror document for
// departmentId. That mirror is being removed entirely (§8, §13.1) because
// it goes stale the moment a teacher's department is edited. departmentId
// now lives only on users/{uid} (already true — TeacherForm already writes
// it there), so this reads the single source of truth instead of a second,
// silently-diverging copy. This is a real bug fix, not just a path update.
function isSeniorTeacherFor(docDepartmentId) {
  return myRole() == 'senior_teacher'
    && me().departmentId == docDepartmentId;
}
```

`sameInstitution()` and `writingToMyInstitution()` are deleted — every call site becomes `inMyInstitution(institutionId)` using the path variable from the enclosing `match` block.

### 5.2 Representative rewritten rules

The full ~28-collection rewrite isn't reproduced block-by-block here (mechanical repetition of the same few patterns) — instead, one worked example per distinct pattern found in the current rules file. Every other nested collection follows one of these four shapes; §4.1 lists the exact path for each.

**Pattern A — simple admin-managed, institution-wide read** (covers `subjects`, `classes`, `terms`, `academicYears`, `nonSchoolDays`, `houses`, `departments`, `events`, `announcements`, `subjectEnrollments`):

```javascript
match /institutions/{institutionId}/subjects/{subjectId} {
  allow read: if isSignedIn() && inMyInstitution(institutionId);
  allow create: if isAdminOrAbove()
    && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId);
  allow update: if isAdminOrAbove() && inMyInstitution(institutionId);
  allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);
}
```

**Pattern B — owner-or-department-scoped write, staff-wide read** (covers `lessons`, `exams`, `assignments`, `results`, `feedback_comments`):

```javascript
match /institutions/{institutionId}/results/{resultId} {
  allow read: if (isTeacherOrAbove() && inMyInstitution(institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

  allow create: if isTeacherOrAbove()
    && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId)
    && request.resource.data.teacherId == request.auth.uid
    && request.resource.data.score <= request.resource.data.maxScore
    && (isAdminOrAbove()
      || isSeniorTeacherFor(request.resource.data.departmentId)
      || (myRole() == 'regular_teacher'
          && request.auth.uid in get(
               /databases/$(database)/documents/institutions/$(institutionId)/subjects/$(request.resource.data.subjectId)
             ).data.teacherIds));

  allow update: if inMyInstitution(institutionId)
    && request.resource.data.score <= request.resource.data.maxScore
    && (isAdminOrAbove()
      || isSeniorTeacherFor(resource.data.departmentId)
      || (myRole() == 'regular_teacher'
          && resource.data.teacherId == request.auth.uid
          && request.auth.uid in get(
               /databases/$(database)/documents/institutions/$(institutionId)/subjects/$(request.resource.data.subjectId)
             ).data.teacherIds));

  allow delete: if (isAdminOrAbove() && inMyInstitution(institutionId))
    || (isTeacher() && inMyInstitution(institutionId) && resource.data.source == 'gradebook');
}
```

**Pattern C — staff + own-record + linked-parent read, admin-only write** (covers `studentActivities`, `studentResponsibilities`, `reportCardComments`, `reportCards`, `disciplinaryActions`, `attendanceSummaries`):

```javascript
match /institutions/{institutionId}/disciplinaryActions/{actionId} {
  allow read: if isSignedIn()
    && inMyInstitution(institutionId)
    && (isTeacherOrAbove()
      || resource.data.studentId == request.auth.uid
      || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
  allow create: if isTeacherOrAbove()
    && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId);
  allow update: if isAdminOrAbove() && inMyInstitution(institutionId);
  allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);
}
```

**Pattern D — nested subcollection** (covers `gradebooks` → `columns`):

```javascript
match /institutions/{institutionId}/gradebooks/{gradebookId} {
  allow read:   if isTeacherOrAbove() && inMyInstitution(institutionId);
  allow create: if isTeacherOrAbove() && inMyInstitution(institutionId) && institutionFieldMatchesPath(institutionId);
  allow update: if isTeacherOrAbove() && inMyInstitution(institutionId);
  allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);

  match /columns/{colId} {
    allow read:   if isTeacherOrAbove() && inMyInstitution(institutionId);
    allow create: if isTeacherOrAbove() && inMyInstitution(institutionId);
    allow update: if isTeacherOrAbove() && inMyInstitution(institutionId);
    allow delete: if isSignedIn()
      && inMyInstitution(institutionId)
      && (isAdmin() || request.auth.uid == resource.data.createdBy);
  }
}
```

`generalAttendance`, `subjectAttendance`, and `timetable_slots` keep their existing more-complex role logic (senior-teacher department/assignment checks, `canGenerateSchedule` delegation) unchanged in *substance* — only `sameInstitution(resource.data.institutionId)` / `writingToMyInstitution()` calls become `inMyInstitution(institutionId)`, and their internal `get(.../subjects/$(id))` cross-references gain the `institutions/$(institutionId)/` prefix (see §5.3).

### 5.3 Cross-reference audit

Every `get()`/`exists()` call in the current rules file that reaches into another collection, and its new form:

| Current call | New call | Notes |
|---|---|---|
| `get(.../users/$(uid))` (in `me()`) | **Unchanged** | `users` stays flat |
| `get(.../student_parents/$(...))` (parent-link checks, ~8 collections) | **Unchanged** | `student_parents` stays flat |
| `get(.../classes/$(docClassId))` (in `isClassTeacherFor`) | **Removed** — `isClassTeacherFor` deleted (§11 step 3) | Confirmed dead: its only caller was the `attendance` (singular) block, already removed |
| `get(.../teachers/$(uid))` (in old `isSeniorTeacherFor`) | **Removed** — replaced by `me().departmentId` | `teachers` mirror collection is deleted (§8); this is the rules-layer half of the §13.1 bug fix |
| `get(.../subjects/$(subjectId))` (results/feedback_comments/subjectAttendance regular-teacher ownership checks) | `get(.../institutions/$(institutionId)/subjects/$(subjectId))` | `subjects` is now nested |
| `get(.../users/$(uid)).data.canGenerateSchedule` (timetable_slots) | **Unchanged** | reads `users`, stays flat |
| `get(.../users/$(uid)).data.classId` / `.assignedClassId` (generalAttendance) | **Unchanged** | reads `users`, stays flat |

### 5.4 `institutions/master`

No new rule needed — already covered by the existing `institutions/{institutionId}` rule block, since no real user's `myInstitutionId()` can ever equal the literal string `'master'`. Created once, manually, via the Firebase Console (see §11) — not worth building UI for a document nothing currently consumes.

### 5.5 `collectionGroup` rules (§3.6)

One rule per collection, appended after all the nested `match` blocks, following the exact `audit_log` precedent:

```javascript
match /{path=**}/subjects/{subjectId} { allow read: if isSuperAdmin(); }
match /{path=**}/classes/{classId} { allow read: if isSuperAdmin(); }
match /{path=**}/results/{resultId} { allow read: if isSuperAdmin(); }
// ... one per nested collection in §4.1 (25 total) ...
```

All `isSuperAdmin()`-only — no `institution_admin` collectionGroup branch is needed, because once nesting is in place, `institution_admin` can already reach every document in their own institution directly via `institutions/{myInstitutionId}/results` etc.; `collectionGroup` only adds value for genuinely cross-institution access, which only `super_admin` has a reason to do.

### 5.6 Deny-all fallback

Unchanged:

```javascript
match /{document=**} {
  allow read, write: if false;
}
```

---

## 6. Firestore Indexes

### 6.1 Collection-scoped composite indexes shrink or disappear

Firestore's default "Collection" index scope applies per **collection ID**, not per specific parent path — one index definition for `generalAttendance` automatically covers every institution's `institutions/{id}/generalAttendance` subcollection. **Index count does not multiply by institution count.** What changes is that `institutionId` drops out of every composite index, since it's now implicit in the path:

| Collection | Index today | Index after nesting |
|---|---|---|
| `generalAttendance` | `institutionId ASC, classId ASC, date ASC, session ASC` | `classId ASC, date ASC, session ASC` |
| `subjectAttendance` | `institutionId ASC, subjectId ASC, classId ASC, sessionDate ASC` | `subjectId ASC, classId ASC, sessionDate ASC` |
| `terms` | `institutionId ASC, startDate DESC` | **None** — single-field `startDate` query is auto-indexed once `institutionId` isn't part of the filter |
| `activity_log`, `audit_log` | Existing, fields undocumented (predate this session) | Unchanged — both are already correctly nested; not affected by this overhaul |

No other collection in the current app combines a `where` with a different-field `orderBy`, or multiple range filters — every other query is equality-only (matching the convention already enforced throughout this session, e.g. `DISCIPLINARY_ACTION_SPEC.md`'s explicit "no composite index required" notes), so nesting drops those collections' index requirements to **zero** — Firestore auto-indexes single fields, and equality-only multi-field filters don't require a composite index on their own.

### 6.2 Collection Group indexes (new)

`collectionGroup()` queries (§5.5) require an explicitly-enabled **Collection Group** scoped index for any field used in a `where`/`orderBy` beyond a bare unfiltered read — this is a separate index-scope toggle from the default "Collection" scope in §6.1, configured per field, per collection.

No specific fields are speculated here: since no `super_admin` UI consumes `collectionGroup()` results yet (§3.6, §12), enabling Collection Group scope for specific fields is deferred until a concrete cross-institution view is actually built and its query shape is known — enabling it speculatively now would mean guessing at filter/sort needs with no consumer to validate against, the same anti-pattern already flagged and avoided elsewhere in this app's spec history.

---

## 7. Firebase CLI Adoption

Confirmed as in-scope. Currently: zero Firebase CLI tooling in this repo; every rule/index change is pasted into the Console by hand.

### 7.1 Setup steps

1. `npm install --save-dev firebase-tools` (repo-local, reproducible — not a global install).
2. `firebase login` (interactive; run locally by whoever sets this up, not from this coding environment).
3. `firebase init firestore` — select the existing `school-sms-v1` project; this generates `firebase.json`, `firestore.rules`, and `firestore.indexes.json` at the repo root.
4. Populate `firestore.rules` with the full rewritten rules from §5 (this becomes the new source of truth).
5. Populate `firestore.indexes.json` with the indexes from §6.1 (Collection scope) and any Collection Group indexes enabled later (§6.2).
6. Add npm scripts:
   ```json
   "firebase:deploy:rules": "firebase deploy --only firestore:rules",
   "firebase:deploy:indexes": "firebase deploy --only firestore:indexes",
   "firebase:deploy": "firebase deploy --only firestore:rules,firestore:indexes"
   ```

   The first two deploy rules and indexes independently — kept separate since they often change on their own and redeploying the untouched one is unnecessary. `firebase:deploy` (no third segment, reads as "deploy everything under `firebase:deploy:*`") is a convenience script for the common case of deploying both together after a structural change like this overhaul's collection-nesting work.

### 7.2 Convention change

This inverts a standing convention that was documented at the top of `firebase-rules.md`: *"the authoritative copy of these rules lives in the project's Firebase Console, not in this repository... do not edit this file to propose or stage rule changes."* **Done:** `firebase-rules.md`'s header now says `firestore.rules` is authoritative, deployed via `npm run firebase:deploy:rules` (or `npm run firebase:deploy`) — kept in place rather than retired, since 16 other docs in this repo (`DISCIPLINARY_ACTION_SPEC.md`, `REPORT_CARD_IMPLEMENTATION_PLAN.md`, `SUBJECT_FORM_SPEC.md`, and others) reference it by name and several instruct future work to update it after a deploy; retiring it outright would have left all of those with a dangling reference. The file's role changed instead: it no longer carries a full duplicate copy of the rules text (that was the same stale-mirror risk this spec's own §13.1 flagged as a bug elsewhere — two copies of 700+ lines of rules, one of which would inevitably drift), keeping only the composite-index rationale that plain rules/JSON code can't hold comments for, plus a clearly-labeled historical snapshot for anyone following an old cross-reference.

**Caveat resolved:** the confirming deploy (§11 step 1) has since been run via `npm run firebase:deploy` and succeeded — rules compiled and released cleanly (already matching the Console, nothing to upload), indexes deployed successfully from `firestore.indexes.json`. The convention change is now fully in effect, not just documented.

### 7.3 Why this matters beyond this one overhaul

Configuring the CLI is also the prerequisite for ever running an Admin-SDK-based data script from within this environment in the future (this session has repeatedly hit the wall of "no service account, no Admin SDK, hand this to the user as copy-paste text instead") — and, as of §3.10's revision, this spec now genuinely needs that capability: §10's migration script is exactly the Admin-SDK data script this section anticipated, run locally using the same `school-sms-v1` project this CLI setup already targets.

---

## 8. Legacy Collection Cleanup

**Revised by §3.13:** five collections are now **archived** (copied into the new structure, then left inert) rather than deleted outright, since real data may exist in them and the goal is now preservation, not a clean wipe. The app-code bug fix (§13.1) is unaffected either way — none of these five are read from or written to by the app again after this overhaul, whether the old copy is archived or deleted:

| Collection | Why the app stops using it | What replaces it as a live data source | Migration disposition |
| --- | --- | --- | --- |
| `teachers` | **Not a write-once stale mirror, corrected from the original audit** (§13.1): `TeacherForm.tsx` kept it updated on every edit. The real problem was that `departmentId` (the ID) was only ever correctly maintained *there*, never on `users/{uid}` — `users` only ever got the department *name*. | 6 call sites across 6 files, not 3 — see the list below. `users.departmentId` is now written at both creation (`AdminCreateUserForm.tsx`) and every edit (`TeacherForm.tsx`), alongside the pre-existing `users.department` name field. No composite index needed for any replacement query — equality-only filters, per §6.1's reasoning. | **Archived** to `institutions/{id}/teachers/{uid}` by the migration script (§10) — copied, then never read again |
| `students` | Write-only mirror, never read anywhere | Nothing — `users` was always the canonical source | **Archived** to `institutions/{id}/students/{uid}` |
| `parents` | Rule exists, zero app code touches it | Nothing | **Archived** to `institutions/{id}/parents/{docId}` |
| `teacher_classes` | Rule exists, zero app code touches it | Nothing | **Archived** to `institutions/{id}/teacher_classes/{docId}` |
| `attendance` (singular) | Fully superseded by `generalAttendance`/`subjectAttendance`, rule still live | Nothing — already dead in practice | **Archived** to `institutions/{id}/attendance/{docId}` |

**Call sites requiring a code change — done** (the department-lookup fix, §13.1, corrected and expanded from the original 3-file audit to 6 files once implementation surfaced the rest):
- `src/components/forms/TimetableSlotForm.tsx` — teacher dropdown now queries `users` filtered by `role in ['regular_teacher','senior_teacher']` (plus `departmentId` for the senior_teacher-scoped dropdown), instead of `teachers`.
- `src/components/forms/ExamForm.tsx` / `AssignmentForm.tsx` — the `teacherId -> departmentId` map built at write time now queries `users` with the same role filter, instead of `teachers`.
- `src/components/forms/FeedbackCommentForm.tsx` / `ResultForm.tsx` — the signed-in teacher's own `departmentId` is now read from a single `users/{uid}` fetch, merged with the adjacent `teacherName` read that already existed, instead of a separate `teachers/{uid}` fetch.
- `src/scenes/(dashboard)/reports/index.tsx` — the older, separate Report Generation page (not the dead `reports` Firestore collection — a naming coincidence); same single-`users`-fetch fix for its senior_teacher department-scoping filter. **Not in the original audit.**
- `src/scenes/(dashboard)/list/teachers/[id]/index.tsx` — the teacher detail page no longer fetches `teachers/{id}` at all: `teacherType` is derived from the viewed user's `role`, and `departmentName` is read directly off `users.department` (already denormalized there — confirmed with the user to skip the extra `departments/{id}` lookup this page used to do). **Not in the original audit.**
- `src/components/forms/TeacherForm.tsx` — **this file's role was originally misdescribed in §13.1's first draft**, not overlooked from the call-site list on purpose: it always kept `teachers/{uid}.departmentId` correctly updated on every edit. What it never did was write `departmentId` to `users/{uid}` — only the department *name* (`department`). Fixed by adding `departmentId: formData.departmentId || null` to the existing `users/{uid}` write (keeping `department` alongside it for display, confirmed with the user) and replacing the separate `teachers/{uid}` read with deriving `teacherType` from the same `users/{uid}` fetch the form already made. **Not in the original audit.**
- `src/components/forms/AdminCreateUserForm.tsx` — removed the `batch.set(doc(db, 'teachers', ...))` and `batch.set(doc(db, 'students', ...))` calls entirely; **also added `departmentId` to the `users/{uid}` write itself** — it was previously written only to the `teachers` mirror at creation. The original spec's claim that "the `users/{uid}` write already carries everything needed" was inaccurate; corrected here.

`reports` is the one exception, still deleted outright rather than archived: its rule has always been `allow read, write: if false` with zero exceptions since inception, so by construction it has never held a single document — there is nothing to preserve. It has no UI route and no consumer either way.

---

## 9. Application Code Changes

### 9.1 Path helper (`src/lib/paths.ts`, new file — done)

```typescript
import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

// AuthContext assigns this institutionId to super_admin, who has no single
// institution. Not a real Firestore path segment — callers must check for
// it and branch before ever reaching institutionCollection/institutionDoc,
// the same way every existing institution-scoped page already does.
export const SUPER_ADMIN_SENTINEL = '*';

export function institutionCollection(institutionId: string, name: string): CollectionReference {
  return collection(db, 'institutions', institutionId, name);
}

export function institutionDoc(institutionId: string, name: string, id: string): DocumentReference {
  return doc(db, 'institutions', institutionId, name, id);
}

// Nested subcollection, e.g. gradebooks/{gradebookId}/columns
export function institutionSubcollection(
  institutionId: string,
  parentName: string,
  parentId: string,
  childName: string,
): CollectionReference {
  return collection(db, 'institutions', institutionId, parentName, parentId, childName);
}
```

Every call site touching one of the 25 nested collections in §4.1 replaces `collection(db, 'x')` / `doc(db, 'x', id)` with `institutionCollection(institutionId, 'x')` / `institutionDoc(institutionId, 'x', id)`. `users` and `student_parents` call sites are untouched (§3.1, §3.2) — they keep using `collection(db, 'users')` / `doc(db, 'users', uid)` directly, same as today.

### 9.2 Scope of the rewrite

~200 call sites across ~70 files (per the audit in §2.1) need this substitution. This is mechanical (each site already has `institutionId` in scope from `useAuth()` in essentially every case — the app already scopes every query by institution today, just via a `where()` filter instead of a path segment), but it is not something to do as one 200-site diff — see the batching in §11.

### 9.3 `generateReportCard.ts` and other multi-collection server-side-style logic

Files that read from many collections in one function (`generateReportCard.ts` reads `institutions`, `users`, `terms`, `academicYears`, `attendanceSummaries`, `results`, `feedback_comments`, `gradebooks`+`columns`, `reportCardComments`, `studentActivities`, `studentResponsibilities`, `disciplinaryActions`, `reportCards`, `classes`, `terms` again, `users` again — 13 distinct collections in one function) get every nested reference updated in the same pass, since `opts.institutionId` is already a required parameter on every one of those calls today.

---

## 10. Migration Plan

**Revised per §3.10:** real pilot/demo data now exists in the Console, so the original "pre-launch, wipe and reseed" plan (§3.10's predecessor) no longer applies. Firestore has no native move/rename operation, so preserving that data means an Admin-SDK script that reads every existing document and writes it to its new nested path, run locally (§3.11), coordinated around a short per-phase maintenance window (§3.12).

### 10.1 What the script does

For each collection in a given phase's group (§11's batching):

1. Query every document in the flat top-level collection (e.g. `results`).
2. For each document, read its existing `institutionId` field — already present on every document in every one of the 25 nesting collections (confirmed in §2.1) — to determine the destination institution.
3. Write the document's full field set, unchanged, to `institutions/{institutionId}/{collectionName}/{docId}`, using `set()` with the **same document ID** it already has (§4.1: "no ID scheme changes"). Foreign-key-shaped fields (`teacherId`, `subjectId`, `classId`, etc.) need no rewriting — they still point at valid IDs, just under a new parent path.
4. For `gradebooks` (the one subcollection-bearing case, §4.1), recurse one level: copy the parent `gradebooks/{id}` doc, then list and copy every child under its `columns` subcollection to `institutions/{institutionId}/gradebooks/{id}/columns/{colId}`.
5. Log a per-collection count of documents copied, for the spot-check in §10.4 step 3.

The script is **copy-only and non-destructive by default** — it never deletes the flat originals. Deletion is a separate, explicit, later invocation (§10.4 step 6), never automatic, so real data is never at risk of being lost mid-migration. Using `set()` rather than `add()`/`create()` also makes the copy step **idempotent** — rerunning it for a phase that partially failed simply overwrites the same destination IDs with the same data, rather than duplicating anything.

### 10.2 Script skeleton (Admin SDK, Node.js)

Illustrative shape, not a complete file — the actual script is written when a phase is ready to migrate, using this structure:

```javascript
// scripts/migrate-to-institutions.mjs
// Run locally: node scripts/migrate-to-institutions.mjs --phase=5 [--delete-source]
// Requires a service-account key (GOOGLE_APPLICATION_CREDENTIALS env var or
// --key path) — never commit this key; see .gitignore.

import admin from 'firebase-admin';

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// One entry per §11 phase — keeps each invocation scoped to that phase's
// collections only, matching the phased cutover, not a single big-bang copy.
const PHASE_COLLECTIONS = {
  5: ['houses', 'departments', 'events', 'announcements', 'nonSchoolDays', 'academicYears'],
  6: ['subjects', 'classes', 'terms'],
  7: ['exams', 'assignments', 'results', 'feedback_comments', 'lessons',
      'timetable_slots', 'subjectEnrollments', 'gradebooks'],
  8: ['generalAttendance', 'subjectAttendance', 'attendanceSummaries'],
  9: ['studentActivities', 'studentResponsibilities', 'reportCardComments',
      'reportCards', 'disciplinaryActions'],
  legacy: ['teachers', 'students', 'parents', 'teacher_classes', 'attendance'], // §3.13, §10.6
};

async function copyCollection(name) {
  const snap = await db.collection(name).get();
  let batch = db.batch();
  let opsInBatch = 0;
  let copied = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const institutionId = data.institutionId;
    if (!institutionId) {
      console.warn(`  SKIP ${name}/${doc.id} — no institutionId field`);
      continue;
    }
    const dest = db.collection('institutions').doc(institutionId).collection(name).doc(doc.id);
    batch.set(dest, data);
    copied++;
    opsInBatch++;

    if (name === 'gradebooks') {
      const columns = await doc.ref.collection('columns').get();
      for (const col of columns.docs) {
        batch.set(dest.collection('columns').doc(col.id), col.data());
        opsInBatch++;
      }
    }

    if (opsInBatch >= 450) { // stay under Firestore's 500-op batch limit
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();
  console.log(`${name}: copied ${copied} documents`);
}

// Deletion of the flat originals is a SEPARATE, explicit invocation
// (--delete-source), run only after §10.4 steps 3–5 have passed — never
// bundled into the copy pass itself.
```

### 10.3 Cost per phase

Every document copied is one read (source) plus one write (destination) — the same 25-collection, "handful of pilot schools" scale already sized in §14.3 for deletes applies here too; see the extended analysis in [§14.7](#147-migration-read-and-write-cost). No phase is expected to approach the 50,000-read or 20,000-write daily Spark quotas on its own.

### 10.4 Per-phase migration procedure

**Revised — data copy deferred to one combined cutover.** The original design below assumed each phase's copy → deploy → verify → delete sequence happens close together, on the order of days. That assumption broke once §11 committed to finishing phases 5–12 on this branch before merging any of them into `main`: copying a phase's data now, then leaving `main` writing to the flat originals for however long the remaining phases take to implement, would leave the copy stale by the time it's actually used — the exact "two-pass delta-copy" scenario §12 already rejected, just arrived at by accident. So each phase now splits into a **build** part (done now, per phase, as §11 reaches it) and a **cutover** part (done once, for every phase together, immediately before the final merge):

**Build — done per phase, as §11 implements it:**

1. **Write that phase's rules** (§5) for the new `institutions/{id}/{collection}` paths. These are purely additive — nothing existing is removed or changed — so they're safe to deploy immediately, on this branch, regardless of merge timing: `main`'s current code never queries a nested path, so an unused-but-present rule can't break it. Deploy via `npm run firebase:deploy:rules` as each phase's rules are written.
2. **Write that phase's app code** (§9) to read/write the new nested paths. Committed to the branch, **not** deployed — `main` doesn't have this code, so it can't go live (and there's no nested data for it to read yet) until the branch merges.

**Cutover — done once, immediately before the final merge, covering every phase 5–9 together:**

1. **Coordinate one combined maintenance window** with each pilot institution's admin, covering every remaining flat collection at once rather than one window per phase.
2. **Run the script in copy mode** (`node scripts/migrate-to-institutions.mjs --phase=N`, or `--phase=all`) for every phase not yet migrated. Nothing is deleted; the flat originals are untouched.
3. **Spot-check** a handful of migrated documents per collection in the Console (or a short read-only script) against their flat originals — same field values, same document ID, correct institution subtree.
4. **Merge `data-structure-overhaul` into `main`.** Vercel auto-deploys every phase's nested-path-reading code at once (§11's deploy-ordering note).
5. **End the maintenance window**; smoke-test the golden path per role across the whole app (§11 step 11) — the same per-role spot-check pattern used throughout this session, now covering every migrated collection at once rather than one phase's worth.
6. **Only after confirming the app is correctly reading/writing the new paths in normal use**, run the script's deletion pass (`--delete-source`), collection by collection. This is a deliberate, separate step — there's no fixed timeline for when it must happen; leaving the verified-migrated flat originals in place for a few extra days as a safety buffer costs nothing but a small amount of the 1 GiB storage quota (§14.2).

This trades a longer combined maintenance window (every phase 5–9's data moves in one pass) for a much shorter total staleness window (hours, not the weeks it would otherwise take to implement five more phases) — the right tradeoff, since a copy left stale for weeks would need re-copying right before cutover anyway.

### 10.5 Safety properties of this ordering

- **Nothing is destroyed until cutover step 6 explicitly runs.** If cutover step 4 or 5 reveals a problem, the merge can be reverted (or a fix rolled forward) and the app keeps working against the untouched flat originals — the copy made in cutover step 2 is simply abandoned or rerun, at no data-loss risk.
- **The copy step is idempotent** (§10.1) — safe to rerun if the cutover needs redoing after a failed spot-check.
- **Each phase's rules deploy (build step 1) is independently safe and reversible** — since it's purely additive, reverting it (or leaving it deployed but unused) has no effect on `main`'s live behavior either way.
- **The maintenance window only needs to cover cutover steps 2–3**, not the whole cutover — once the copy finishes and is spot-checked, the merge and deploy (cutover step 4) can happen right after, and the window closes once the app is confirmed working (cutover step 5).

### 10.6 Legacy collection archival (§3.13, §8)

The 5 legacy collections (`teachers`, `students`, `parents`, `teacher_classes`, `attendance` singular) use the same script (`--phase=legacy`) but skip the maintenance-window, rules/code deploy, and smoke-test parts of §10.4 entirely — because no app code reads or writes any of them today, before or after this overhaul (§8). It's a pure archival copy with no cutover risk, safe to run at any point, including before phase 1 (and indeed already run — §11 step 3). There's also no deletion pass planned for these — since nothing depends on freeing that storage, the flat originals can simply be left in place indefinitely once archived, or deleted later at your discretion; it isn't load-bearing either way.

### 10.7 Rollback

Because deletion is always a separate, deliberate, later step (§10.1, §10.4 cutover step 6), rollback before that point is just "don't run the deletion pass" plus reverting the merge (or the specific phase's rules/code within it) — the flat originals were never touched. Once the deletion pass has run for a collection, rollback would require restoring from the nested copies (still present until the safety-buffer window elapses) written back to their old flat paths — the same script logic in reverse, not designed here since it's only needed if a problem surfaces well after the cutover was already considered verified and closed out.

---

## 11. Implementation Order

Phased per §3.8. Each phase should land and build clean before the next starts — this is explicitly not a "do all 200 call sites in one PR" plan. **Revised per §3.10 and again after step 4:** phases 5–9 now each carry live data, and per the revised §10.4, each phase's rules+code are *built* now (on this branch) but its data copy and cutover are deferred to one combined pass, done once, right before the final merge — not a per-phase copy → deploy → smoke-test → delete cycle against live production.

**Deploy-ordering constraint discovered at step 4, refined for the remaining phases:** `main`, not this branch, is what's deployed to production (Vercel, auto-deploy on merge) and what pilot users hit. Step 4's rules change was blocked from deploying because it was *destructive* — it removed the `teachers`/`students` rule blocks that `main`'s still-live code depends on, and repointed `isSeniorTeacherFor()` away from data `main` still writes. The same test applies to every remaining phase's rules, judged per phase rather than assumed: **a brand-new `institutions/{id}/{collection}` match block, with nothing else in the ruleset referencing it, is additive and safe to deploy as soon as it's written** (§10.4 build step 1) — confirmed safe for phase 5 (§11 step 5, "nothing else reads from them via `get()`/`exists()` in rules"). **A change to an *existing* rule body — a cross-reference `get()` repointed at a nested path, a flat-collection block removed or narrowed — is not additive**, even if it's part of "nesting a new collection," because it either depends on data the deferred-copy plan hasn't copied yet or changes behavior for a still-flat collection `main` is still actively using: phase 6 is a confirmed case (its `subjects`/`classes` cross-references are read by `generalAttendance`/`subjectAttendance`/`timetable_slots`, all still flat and live at that point — see the correction on step 6 below), and phases 7–9 need the same check as each is implemented, not assumed safe by default. What's always blocked regardless: merging any phase's **app code** into `main` (nothing at the nested paths for it to read until the cutover copies data) — data copy and non-additive rules changes are bundled into the combined cutover (§10.4) along with the merge. Confirmed with the user: phases 5–12 finish on this branch, then merge into `main` in a single event at the end — not a per-phase hotfix pattern.

1. **Tooling foundation — done.** Adopted the Firebase CLI (§7): installed, initialized, populated `firestore.rules`/`firestore.indexes.json` with the *current* (unchanged) rules/indexes, and confirmed via `npm run firebase:deploy` that the CLI round-trips correctly against the live Console state (rules compiled/released cleanly, indexes deployed successfully) — the prerequisite for changing anything structural is now satisfied. `firebase-rules.md`'s convention change (§7.2) is confirmed in effect as a result. `src/lib/paths.ts` (§9.1) has also been added — `institutionCollection`/`institutionDoc`/`institutionSubcollection`, plus a `SUPER_ADMIN_SENTINEL` constant added while the file was being created (not in the original §9.1 text — a natural place to stop repeating the `'*'` magic string once nested queries start getting written, though adopting it at existing call sites is separate, unstarted work). Builds and type-checks clean; genuinely unused until phase 2 — nothing imports it yet. Phase 1 (§11 step 1) is now fully complete.
2. **`institutions/master` — done.** Created manually via Console (§5.4), holding a single placeholder field — deliberately not shaped like a real institution document (no `profileComplete`, `gradingSystem`, or other fields any existing page might misinterpret if it ever fetched this doc unexpectedly). Zero code depends on it yet — it just reserves the slot, matching §12's "reserved only" framing.
3. **Legacy archival + cleanup — done.** Ran the migration script's `--phase=legacy` pass (§10.6): archived 4 real `teachers` and 4 real `students` documents into `institutions/{id}/...` (a `_placeholder` doc with no `institutionId` in each was correctly skipped, not guessed at); `parents`, `teacher_classes`, and `attendance` (singular) confirmed genuinely empty, matching §13.2's dead-collection finding exactly. Deleted `reports` outright (§8 — never held data, nothing to archive) and the `parents`/`teacher_classes`/`attendance` (singular) flat-collection rule blocks; `teachers`/`students` rule blocks are left in place for step 4, alongside the mirror-write removal. Deployed via `npm run firebase:deploy:rules`. **Deviation from plan:** the deploy surfaced an "Unused function: `isClassTeacherFor`" warning — removing the `attendance` (singular) block turned out to be its only caller anywhere in the live rules file (confirmed via a full-file grep; `generalAttendance`/`timetable_slots` don't currently call it, contrary to what §5.1/§5.3's target-state text assumed when describing how the helper would carry forward). Removed the now-genuinely-dead `isClassTeacherFor` helper too and redeployed — not in the original step 3 scope, but the same "dead weight makes future audits harder" reasoning as §13.2 applied directly.
4. **Legacy cleanup, part 2 (the department-lookup fix) — done.** Fixed `TimetableSlotForm.tsx`/`ExamForm.tsx`/`AssignmentForm.tsx` to query `users` directly instead of the `teachers` mirror; removed the `teachers`/`students` mirror writes from `AdminCreateUserForm.tsx` and added `departmentId` to its `users/{uid}` write; updated `isSeniorTeacherFor()` in rules to read `me().departmentId`; deleted the now-unused `teachers`/`students` flat-collection rule blocks. **Deviation from plan:** implementing this surfaced 4 more real call sites the original audit missed (`TeacherForm.tsx`, `FeedbackCommentForm.tsx`, `ResultForm.tsx`, `reports/index.tsx`, `list/teachers/[id]/index.tsx` — see the corrected §13.1 and the expanded call-site list in §8), and revealed the bug itself was the reverse of how §13.1 originally described it. All fixed in the same pass; full details in §8/§13.1. Verified clean via `tsc --noEmit`, `eslint`, and a full `npm run build`.

**Deployment is blocked, not just "not yet done":** `main` is what's deployed to production (Vercel, auto-deploy on merge) and what pilot users actually hit — this branch's code has never gone live. `main`'s `AdminCreateUserForm.tsx`/`TeacherForm.tsx` still write `departmentId` only to the `teachers` mirror, never to `users`. Deploying this branch's `firestore.rules` change now — while `main` is still live — would break `isSeniorTeacherFor()` for every existing production senior teacher (their `users.departmentId` is empty) and break new teacher creation/edits (rules would deny writes to the now-ruleless `teachers`/`students` paths `main`'s code still targets). Confirmed with the user: **hold this rules deploy until `data-structure-overhaul` (or enough of it) merges into `main` and Vercel deploys it** — not a targeted hotfix, the full branch.

**New prerequisite found because of this:** existing production teachers' `departmentId` currently lives only on the `teachers` mirror. Once `main` has this fix's code and the rules deploy goes out, those accounts need `users.departmentId` backfilled or their permissions break silently. `scripts/backfill-department-ids.mjs` (new, `npm run backfill:department-ids`) does this — one-time, idempotent, copies `teachers/{uid}.departmentId` → `users/{uid}.departmentId` for every existing teacher missing it. Run this once, after `main`'s code is live, before or alongside the `firestore.rules` deploy.
5. **Nest the low-traffic, no-cross-collection-dependency group — build done.** `houses`, `departments`, `events`, `announcements`, `nonSchoolDays`, `academicYears` — simplest Pattern A collections (§5.2), nothing else reads from them via `get()`/`exists()` in rules. Added `inMyInstitution()`/`institutionFieldMatchesPath()` (§5.1) and the six `institutions/{institutionId}/{collection}` rule blocks to `firestore.rules`, alongside (not replacing) the still-authoritative flat blocks, each now commented "Still authoritative — ... same cutover" to flag the pending removal. Permission levels copied exactly from each flat block (`houses`/`nonSchoolDays`/`academicYears` stay `isAdmin()`-only; `departments`/`events`/`announcements` stay `isAdminOrAbove()`) — not the spec's generic Pattern A example, which would have loosened `houses`/`nonSchoolDays`/`academicYears` to admin-or-above. **Not yet deployed** — additive and safe to deploy now per §10.4 build step 1, but held pending explicit go-ahead. App code: every call site across 13 files (`HouseForm`, `StudentForm`, `DepartmentForm`, `TeacherForm`, `AdminCreateUserForm`, `FormModal` (added a `NESTED_TABLES` set for its generic delete path), the `houses`/`departments`/`events`/`announcements` list + `houses/[id]`/`students/[id]` detail pages, `reports/builder`, `useInstitutionAcademicCalendar`, `academic-calendar`, `admin/rebuild-attendance-summaries`, `generateReportCard.ts`, `useTourSteps.ts`) now reads/writes via `institutionCollection()`/`institutionDoc()` (§9.1) for these 6 collections only — every other collection in the same files (`users`, `classes`, `terms`, `subjects`, `generalAttendance`, etc.) deliberately left untouched, still flat, for its own later phase. Committed to the branch, not merged — `tsc -b`, `eslint`, and `npm run build` all clean. **Not manually browser-tested**: the dev server hits the same live `school-sms-v1` project, and no data exists yet at the nested paths (§10.4's copy step is deferred to the cutover) — a live run would just show empty lists either way, which isn't a meaningful check of query correctness. Verification for this phase rests on type-checking plus code review, not UI testing; full UI verification happens at the cutover's post-merge smoke test (§11 step 11).
6. **Nest the curriculum backbone.** `subjects`, `classes`, `terms` — still Pattern A, but these are the collections `generalAttendance`/`subjectAttendance`/`timetable_slots`' still-flat, still-live rules reach into via `get()` (§5.3). **Correction:** the new `institutions/{id}/{subjects,classes,terms}` blocks are additive and could deploy early on their own, but the cross-referencing rule changes (repointing those `get()` calls at the nested path) are not — deploying them before the cutover's data copy would break attendance/schedule permission checks for live production users, the same failure mode as step 4. Bundle this phase's entire rules deploy into the cutover rather than splitting it. (`isClassTeacherFor` no longer needs updating here — removed in step 3, §5.3.) App code and data copy: same deferral as step 5.
7. **Nest the teaching-data group.** `exams`, `assignments`, `results`, `feedback_comments`, `lessons`, `timetable_slots`, `subjectEnrollments`, `gradebooks`+`columns` — Pattern B/D, highest call-site count *and* highest document count of any phase. Assess each collection's rules for cross-references the same way as step 6 before assuming any part is additive-safe to deploy early; do this in sub-batches by collection to keep that assessment tractable. App code and data copy: same deferral as step 5.
8. **Nest the attendance group.** `generalAttendance`, `subjectAttendance`, `attendanceSummaries` — most complex role logic (§5.2 closing note); test carefully given this area's history (the Schedule page black-screen incident earlier this session traced back to exactly this kind of query/rule mismatch). This is also likely the largest single migration pass by document count (§14.7) — budget the combined cutover's maintenance window accordingly. Same cross-reference assessment and deferral as step 6/7.
9. **Nest the report-card and disciplinary group.** `studentActivities`, `studentResponsibilities`, `reportCardComments`, `reportCards`, `disciplinaryActions` — Pattern C, and update `generateReportCard.ts` (§9.3) in the same pass since it touches all of them plus several already-nested collections from earlier phases. Same cross-reference assessment and deferral as step 6/7.
10. **`collectionGroup` rules.** Add the `super_admin`-only collection-group rule (§5.5) for every collection nested in phases 5–9. No indexes yet (§6.2 — deferred until a consumer exists). No data movement in this step — purely additive rules, deploy now.
11. **Final verification.** Confirm the cutover's deletion pass (§10.4 cutover step 6) has actually run for every collection — a collection left at "copied but not yet cleaned up" is safe (§10.5) but shouldn't be treated as finished. Smoke-test one flow per role across the whole app (the same "golden path per role" spot-check this session has used for every feature), now against entirely nested data with no flat fallback remaining.
12. **Documentation.** Update `firebase-rules.md`'s header to reflect the CLI-is-authoritative convention change (§7.2); update `docs/firebase/firestore_indexes` documentation (or retire it in favor of `firestore.indexes.json` being self-documenting once tracked in-repo).

---

## 12. Deferred Items

- **Firebase Auth custom claims for role/institutionId** — would eliminate the `users` Firestore read on every sign-in and remove the last reason `users` couldn't theoretically nest someday. Real change, separate from this overhaul, flagged in §3.1. **Precision on the "requires a Cloud Function" framing in §3.1:** that's only true for an *automatic* version (a Cloud Function triggered on user create/role-change) — Cloud Functions deployment itself requires the Blaze (pay-as-you-go) plan, not Spark, regardless of this overhaul. A narrower version stays on Spark: setting custom claims only requires the Admin SDK, which can be called from a manually-run local script with a service account key (an admin runs it after creating/editing a user) rather than a serverless trigger. See §14 for the full free-tier breakdown.
- **A `super_admin` UI that consumes the new `collectionGroup()` access** — this spec makes cross-institution querying *possible* (§3.6, §5.5) but builds no dashboard/list page that uses it. Building one (and its Collection Group indexes, §6.2) is future work once a concrete need is identified.
- **Chunked `collectionGroup` Collection-Group indexes** — deferred per §6.2 until a real consumer defines the query shape.
- **Any content for `institutions/master`** — reserved only; nothing currently needs it (§3.7).
- **A general data-access/repository layer** beyond the thin path helper in §9.1 — that helper solves path construction for this migration; a fuller abstraction (typed converters, centralized query builders) is a separate, larger decision not required to ship this overhaul.
- **An in-app maintenance-mode feature** (a read-only banner/lockout state) — considered and rejected per §3.12 in favor of manually coordinating a short pause with each pilot institution's admin around each phase's copy. Worth revisiting only if the number of pilot institutions grows large enough that manual coordination itself becomes the bottleneck.
- **A zero-downtime, two-pass delta-copy migration** — copy everything, then run a second pass that only re-copies documents modified since the first pass' timestamp, avoiding any maintenance window entirely. Considered as the alternative to §3.12's chosen approach and rejected for now: it requires either a reliable `updatedAt` field on every one of the 25+ collections being migrated (not confirmed present everywhere) or a Firestore document-diffing strategy, meaningfully more script complexity than a brief coordinated pause justifies at "handful of pilot schools" scale. Revisit if pilot institutions grow large/active enough that a multi-minute pause becomes genuinely disruptive.

---

## 13. Issues Found During This Audit

Two concrete problems, found while reading `firebase-rules.md` and cross-referencing it against actual `collection()`/`doc()` call sites in `src/`, independent of whether the nesting overhaul happens at all:

### 13.1 `departmentId` never actually lived on `users/{uid}` — done, corrected during implementation

**Original audit description (inaccurate, corrected once §11 step 4 was actually implemented):** this section originally claimed `TeacherForm.tsx`'s edit path "only ever updates `users/{uid}.departmentId`" and "never touches the `teachers/{uid}` mirror," implying the mirror was the stale copy. That's backwards. `TeacherForm.tsx` kept `teachers/{uid}.departmentId` correctly updated on every single edit — it was `users/{uid}` that never received the ID at all, only the department *name* (`department`). `AdminCreateUserForm.tsx` had the same gap: it wrote `departmentId` to the `teachers/{uid}` mirror at creation, never to `users/{uid}`.

**The real, still-live bug this audit found:** `users.departmentId` — the field every rule and every one of this fix's replacement queries needs — was never actually maintained anywhere before this fix. `TimetableSlotForm.tsx`, `ExamForm.tsx`, `AssignmentForm.tsx`, `FeedbackCommentForm.tsx`, `ResultForm.tsx`, `reports/index.tsx`, and `list/teachers/[id]/index.tsx` (7 read sites across 6 files — only 3 were caught by the original audit) all read `departmentId` from the `teachers` mirror instead, because that was the only place it was ever correct.

**Fixed as part of this overhaul (§8, §11 step 4):** `departmentId` is now written to `users/{uid}` at both creation (`AdminCreateUserForm.tsx`) and every edit (`TeacherForm.tsx`), alongside the pre-existing `department` name field (kept for display, confirmed with the user). All 7 read sites now read `users` directly. The `teachers`/`students` mirror collections are no longer read or written anywhere in the app.

### 13.2 Dead collections with live rules

`parents`, `teacher_classes`, and `attendance` (singular) all have active Firestore security rules but are never read or written by any code in `src/` — `parents` and `teacher_classes` appear to predate the current `users`-with-a-`role`-field model entirely; `attendance` was fully superseded by `generalAttendance`/`subjectAttendance`. These aren't a security risk (the rules correctly deny by default), but they're dead weight in the rules file that makes future audits like this one harder. Removed in §8/§11 step 3.

---

## 14. Firebase Free Tier (Spark Plan) Analysis

This section evaluates everything above against Firebase's Spark (free) plan limits, grounded in the app's actual near-term scale: **a handful of pilot schools**, not a large-scale production rollout. It does not change any decision made in §1–§13 — nothing in this spec requires paid Firebase features — but it does add three caveats worth knowing before relying on this overhaul's stated driver (§4.2) at face value, plus one correction to how §12 characterized the custom-claims alternative.

### 14.1 Verdict

**Everything in this spec is achievable on Spark at the stated scale**, with no plan upgrade required to implement it — including the migration script added by §3.10's revision. The restructuring itself — path changes, rules rewrite, index rewrite, CLI adoption, legacy archival, `collectionGroup` access, and now the Admin-SDK copy pass (§10) — doesn't touch a paid Firebase feature; it's the same Firestore reads/writes/deletes at different paths. The only genuine free-tier ceilings that interact with this spec are Firestore's daily quotas, and at "a handful of pilot schools" they are not expected to be a near-term constraint — see §14.3 and §14.7 for why, and what would change that.

### 14.2 Fully achievable, no caveats

| Spec area | Why it's unaffected by plan tier |
| --- | --- |
| §7 Firebase CLI adoption | `firebase init`/`firebase deploy --only firestore:rules,firestore:indexes` are deployment tooling — free on every plan. |
| §4/§5 the restructuring itself | Moving paths and rewriting rules doesn't consume a billed resource by itself — same documents, different paths. |
| §5.5/§6.2 `collectionGroup()` rules + indexes | Ordinary Firestore indexes, no plan restriction. Only cost anything once a query actually runs, same as any other read. |
| §8 legacy collection cleanup | A small number of documents (`teachers`/`students`/`parents`/`teacher_classes`/`attendance`) — trivial against any quota. |
| §5.4 `institutions/master` | One document, negligible. |
| §6.1 index reduction | Nesting *helps* here: dropping `institutionId` out of composite indexes (or eliminating some entirely, e.g. `terms` needs none post-nesting) means fewer indexed field-entries, which counts toward the storage cap. Net-positive, not a cost. |

### 14.3 Scale-dependent — achievable today, worth tracking as the app grows

| Spark limit | Where it interacts with this spec | Assessment at "handful of pilot schools" scale |
| --- | --- | --- |
| **20,000 deletes/day** | §4.2's recursive per-institution delete (this spec's stated driver) and each phase's §10.4 step 6 deletion pass (deleting the flat originals after a verified copy) | A realistic pilot institution's total document count — `results`, `feedback_comments`, `generalAttendance`, `subjectAttendance`, everything else combined — plausibly lands around 5,000–10,000 documents for a school with one or two terms of real usage. Comfortably under quota for a one-shot delete, and each §11 phase only deletes its own subset of collections, not all 25 at once — spreading the load further. Risk rises only if a *single* pilot school accumulates a full student body across several complete terms/school years before ever being offboarded (§4.2) or migrated (§10) — `results` and `feedback_comments` scale roughly as `students × subjects × assessments × terms` and are the two collections most likely to approach the ceiling first, which is also why phase 7 (§11 step 7) is explicitly sub-batched by collection rather than deleted in one pass. Not a near-term concern at pilot scale. |
| **50,000 reads/day** | Pre-existing, not caused by this spec: every `get()`/`exists()` call *inside* a security rule (this file has many — `me()`, `isClassTeacherFor`, `isSeniorTeacherFor`, the subject-teacherIds ownership checks, every `student_parents` existence check) bills as an extra read, evaluated per document on list queries. A 50-document list fetch can cost 100–150+ billed reads once rule-evaluation overhead is counted. | A handful of pilot schools with modest concurrent staff/student usage will use a small fraction of this quota even with the amplification factored in. Worth knowing about (it's invisible until checked in Console usage), not worth acting on yet. |
| **1 GiB total Firestore storage** | Total data volume across the whole project | Comfortable at pilot scale; becomes a real planning number only once there's genuine multi-institution production data. Nesting is mildly *favorable* here, not a cost (see §14.2's index row). |

### 14.4 What the 20,000-delete quota means in practice (§4.2, §10.4)

Firestore's daily quotas reset every 24 hours. A recursive institution delete, or a phase's §10.4 step 6 cleanup deletion, that only completes partway simply resumes the next day — **no data is lost**, the operation just spans two calendar days instead of one. For an admin-initiated, infrequent action like offboarding an institution or cleaning up a verified migration phase, this is a fully acceptable outcome, not a failure mode to design around. It only becomes worth revisiting (via either batching the delete across explicit days, or upgrading to Blaze) once a specific institution's document count is known to approach the ceiling — not preemptively. It's also worth remembering §10.4 step 6 has no fixed deadline — if a phase's deletion pass is deferred a few extra days for any reason, including spreading it across the daily quota, that costs nothing but a little of the 1 GiB storage allowance while the verified-but-not-yet-deleted flat originals sit alongside their nested copies.

### 14.5 Correction to §12: Cloud Functions vs. Admin SDK script for custom claims

§12 lists Firebase Auth custom claims (the long-term fix for the `users`-nesting chicken-and-egg problem discussed in §3.1) as requiring "a Cloud Function or other backend this repo doesn't have." That's accurate for an *automatic* version — **Cloud Functions deployment requires the Blaze (pay-as-you-go) plan**, full stop, even for its nominal free invocation allowance, because it depends on Cloud Build/Artifact Registry, which Spark doesn't include.

It is not accurate as a blanket statement about custom claims themselves. Setting a custom claim only requires calling the Admin SDK (`admin.auth().setCustomUserClaims()`) — which can be done from a manually-run local script using a service account key, with no Cloud Functions involved and no Blaze requirement. The distinction: an *automatic*, serverless-triggered claims-setter needs Blaze; a *manual*, admin-runs-a-script-after-creating-a-user claims-setter stays on Spark. Neither is in scope for this overhaul (§12), but if custom claims are ever pursued, the manual-script version is the one that doesn't force a plan upgrade.

### 14.6 Gap found during this analysis, unrelated to plan tier

`firebase firestore:delete --recursive` (§4.2) only deletes Firestore documents — it does not touch Firebase **Storage**. An institution's `institutionLogoUrl` and `authorizedSignature.imageUrl` (both stored in Firebase Storage, referenced by URL from Firestore) would be orphaned by a recursive institution delete, not removed. This isn't a free-tier limitation — it would be true on Blaze too — but it means §4.2's "two operations instead of ~28" framing is for Firestore data only; a *complete* institution deletion (Firestore + Storage) needs a third step not designed anywhere in this spec. Flagged here as a completeness gap for whoever eventually implements §4.2's delete workflow, not something this spec resolves.

### 14.7 Migration Read and Write Cost

Extends §14.3's document-count estimate to the migration script itself (§10), added by §3.10's revision, rather than just the recursive-delete driver §14.3 originally covered.

Every document the script copies costs exactly one read (from the flat collection) and one write (to the nested path) — §10.1/§10.2. Using the same pilot-scale estimate already established in §14.3 (5,000–10,000 total documents per institution across all 25 nesting collections), a single phase's copy pass only touches that phase's subset of collections, not an institution's full document count. Phase 7 (teaching data: `results`, `feedback_comments`, etc.) and phase 8 (attendance) are the two largest, since results/feedback/attendance records scale with `students × subjects/sessions × terms` — the same collections §14.3 already flagged as most likely to approach the *delete* ceiling first. Even so, a single pilot institution's phase-7 or phase-8 document count is expected to land in the low thousands, not tens of thousands — comfortably under both the 50,000-read and 20,000-write daily quotas in one sitting, with headroom left for the read-only spot-check in §10.4 step 3.

The one scenario worth actively avoiding: migrating every phase for every pilot institution on the same calendar day. §11's phased rollout already paces this naturally — "each phase should land, build clean, and be manually spot-checked before the next starts" — so this isn't expected to happen by default, but it's worth stating explicitly as the one way this section's comfortable per-phase numbers could compound into a real quota conversation. Spreading a full multi-institution, multi-phase migration across its natural multi-day phased schedule, as already planned, keeps every single day's read/write volume nowhere near either ceiling.

---

_End of spec._
