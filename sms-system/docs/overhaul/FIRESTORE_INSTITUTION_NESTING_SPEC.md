# Firestore Institution-Nesting Overhaul — Spec

> **Status:** Design only — no code changes made yet.
> **Scope:** Restructure Firestore from ~30 flat, top-level collections (each scoped by an `institutionId` field) into a hierarchy rooted at `institutions/{institutionId}/...`, with `users` and `student_parents` staying flat as explicit exceptions. Includes a full Firestore rules/index rewrite, Firebase CLI adoption, cleanup of 5 legacy/broken collections found during this audit, and `collectionGroup()` cross-institution access for `super_admin`.
> **Driver:** Enable clean, recursive per-institution data deletion/export (not currently possible with flat collections) as the app approaches multi-tenant scale. Pre-launch — no live data to preserve, so this is a structural rewrite + reseed, not a data migration.
> **Not in scope:** Moving `users` or `student_parents` under institutions (see [§3 Design Decisions](#3-design-decisions)); building a Supabase or non-Firebase backend; building any new super_admin UI that *consumes* the new `collectionGroup()` access (this spec only makes it possible at the rules/index layer).

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
10. [Migration & Reseed Plan](#10-migration--reseed-plan)
11. [Implementation Order](#11-implementation-order)
12. [Deferred Items](#12-deferred-items)
13. [Issues Found During This Audit](#13-issues-found-during-this-audit)
14. [Firebase Free Tier (Spark Plan) Analysis](#14-firebase-free-tier-spark-plan-analysis)

---

## 1. Overview

Every Firestore collection in this app — `users` included — currently lives at the top level of the database, alongside every other collection, scoped by an `institutionId` field that every document carries and every rule checks via `resource.data.institutionId`. This spec restructures most of those collections into subcollections of `institutions/{institutionId}`; `users` (and the `student_parents` junction collection) stay exactly where they are today — see §3.1/§3.2 for why. Nesting the rest means an institution's entire dataset is physically collocated and can be deleted or exported as one subtree via the Firebase CLI — something not possible today without touching ~28 separate top-level collections individually.

This is a large, mechanical change (~30 collections, 200+ Firestore call sites across ~70 files, a full rules and index rewrite) but a low-risk one: the app is pre-launch, so there is no live data to preserve — this is a structural rewrite followed by a reseed, not a data migration requiring an Admin SDK script or cutover plan.

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

// CHANGED — now takes institutionId explicitly (classes is nested) and no
// longer needs it passed twice on create vs update, since the path segment
// is always available regardless of operation type.
function isClassTeacherFor(institutionId, docClassId) {
  return isTeacher()
    && get(/databases/$(database)/documents/institutions/$(institutionId)/classes/$(docClassId)).data.classTeacherId
       == request.auth.uid;
}

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
| `get(.../classes/$(docClassId))` (in `isClassTeacherFor`) | `get(.../institutions/$(institutionId)/classes/$(docClassId))` | `classes` is now nested; helper takes `institutionId` param |
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

Configuring the CLI is also the prerequisite for ever running an Admin-SDK-based data script from within this environment in the future (this session has repeatedly hit the wall of "no service account, no Admin SDK, hand this to the user as copy-paste text instead") — this spec doesn't need that capability today (§10 — pre-launch, reseed not migrate), but adopting the CLI now means the next data-shape change doesn't start from zero tooling.

---

## 8. Legacy Collection Cleanup

Per §3.5, five collections are removed rather than migrated:

| Collection | Why it's removed | What replaces it |
|---|---|---|
| `teachers` | Write-once mirror at signup, never updated again — actively stale (§13.1) | Direct query: `institutions/{id}/users` — wait, `users` stays flat, so: `collection(db, 'users')` filtered by `where('institutionId','==',id), where('role','in',['regular_teacher','senior_teacher'])`, reading `departmentId` off the canonical doc. Needs a new composite index: `institutionId ASC, role ASC` (equality-only, no orderBy — no composite index actually required per §6.1's reasoning; confirmed no range/orderBy is combined with these filters in the 3 call sites below) |
| `students` | Write-only mirror, never read anywhere | Nothing — just deleted, no replacement needed |
| `parents` | Rule exists, zero app code touches it | Nothing |
| `teacher_classes` | Rule exists, zero app code touches it | Nothing |
| `attendance` (singular) | Fully superseded by `generalAttendance`/`subjectAttendance`, rule still live | Nothing — already dead in practice |

**Call sites requiring a code change** (the department-lookup fix, §13.1):
- `src/components/forms/TimetableSlotForm.tsx` (lines ~118, ~123)
- `src/components/forms/ExamForm.tsx` (line ~127)
- `src/components/forms/AssignmentForm.tsx` (line ~123)
- `src/components/forms/AdminCreateUserForm.tsx` — remove the `batch.set(doc(db, 'teachers', ...))` and `batch.set(doc(db, 'students', ...))` calls (lines ~366, ~377) entirely; the `users/{uid}` write already carries everything needed once the 3 read sites above are fixed to query `users` directly.

`reports` (already disabled, `allow read, write: if false`) is also deleted outright rather than nested — it has no UI route and no consumer; nesting a dead collection would be pure busywork.

---

## 9. Application Code Changes

### 9.1 Path helper (`src/lib/paths.ts`, new file)

```typescript
import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

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

## 10. Migration & Reseed Plan

Confirmed pre-launch: **no live data needs to be preserved.** This removes the need for an Admin-SDK migration script (read every doc, write to new path, delete old — normally required since Firestore has no native move/rename operation).

**Plan:** wipe the existing flat collections (via Console or, once §7 lands, `firebase firestore:delete <collection> --recursive` per collection), deploy the new rules/indexes, and reseed. Minimum reseed set needed to resume development/testing:

- One real institution document (plus `institutions/master`, per §3.7/§5.4)
- One `super_admin` account (flat, `users` collection — unaffected by any of this)
- One `institution_admin`, one `senior_teacher`, one `regular_teacher`, one `student`, one `parent` account per institution used for testing, plus the `student_parents` link between them
- Whatever institution-scoped data (a class, a subject, a term) each in-progress feature's manual testing currently depends on

No seed *script* is written as part of this spec — recreating a handful of accounts and records through the existing Create User / list-page UI is faster than building and maintaining a seed script for a one-time pre-launch reset, and the UI paths are exactly what should be tested post-migration anyway.

The wipe step also draws against the same 20,000-deletes/day Spark quota as §4.2's recursive delete — for the small amount of accumulated test/dev data this repo actually has at pre-launch, this is not expected to be a real constraint (see §14), but if a wipe ever needs to span more than one day, that's expected behavior under the free tier, not a failure.

---

## 11. Implementation Order

Phased per §3.8. Each phase should land, build clean, and be manually spot-checked before the next starts — this is explicitly not a "do all 200 call sites in one PR" plan.

1. **Tooling foundation — done.** Adopted the Firebase CLI (§7): installed, initialized, populated `firestore.rules`/`firestore.indexes.json` with the *current* (unchanged) rules/indexes, and confirmed via `npm run firebase:deploy` that the CLI round-trips correctly against the live Console state (rules compiled/released cleanly, indexes deployed successfully) — the prerequisite for changing anything structural is now satisfied. `firebase-rules.md`'s convention change (§7.2) is confirmed in effect as a result. Still outstanding from this step: add `src/lib/paths.ts` (§9.1, unused until phase 2).
2. **`institutions/master`.** Create the document (§5.4) manually via Console. Zero code depends on it yet — this just reserves the slot.
3. **Legacy cleanup, part 1 (dead collections).** Delete the `reports`, `parents`, `teacher_classes`, `attendance` (singular) rule blocks. No code changes needed — nothing references them.
4. **Legacy cleanup, part 2 (the department-lookup fix).** Fix `TimetableSlotForm.tsx`/`ExamForm.tsx`/`AssignmentForm.tsx` to query `users` directly instead of the `teachers` mirror (§8, §13.1); remove the `teachers`/`students` mirror writes from `AdminCreateUserForm.tsx`; update `isSeniorTeacherFor()` in rules to read `me().departmentId` (§5.1). Deploy this rules change and this code change together — this is a real bug fix and should ship independent of the nesting work below, since it doesn't depend on it.
5. **Nest the low-traffic, no-cross-collection-dependency group.** `houses`, `departments`, `events`, `announcements`, `nonSchoolDays`, `academicYears` — simplest Pattern A collections (§5.2), nothing else reads from them via `get()`/`exists()` in rules.
6. **Nest the curriculum backbone.** `subjects`, `classes`, `terms` — still Pattern A, but these are the collections other rules' `get()` calls reach into (§5.3), so update the cross-referencing rules (`isClassTeacherFor`, the regular-teacher subject-ownership checks) in the same deploy.
7. **Nest the teaching-data group.** `exams`, `assignments`, `results`, `feedback_comments`, `lessons`, `timetable_slots`, `subjectEnrollments`, `gradebooks`+`columns` — Pattern B/D, highest call-site count, do this in sub-batches by collection rather than one deploy.
8. **Nest the attendance group.** `generalAttendance`, `subjectAttendance`, `attendanceSummaries` — most complex role logic (§5.2 closing note); test carefully given this area's history (the Schedule page black-screen incident earlier this session traced back to exactly this kind of query/rule mismatch).
9. **Nest the report-card and disciplinary group.** `studentActivities`, `studentResponsibilities`, `reportCardComments`, `reportCards`, `disciplinaryActions` — Pattern C, and update `generateReportCard.ts` (§9.3) in the same pass since it touches all of them plus several already-nested collections from earlier phases.
10. **`collectionGroup` rules.** Add the `super_admin`-only collection-group rule (§5.5) for every collection nested in phases 5–9. No indexes yet (§6.2 — deferred until a consumer exists).
11. **Reseed and verify.** Wipe remaining flat collections, reseed per §10, smoke-test one flow per role (the same "golden path per role" spot-check this session has used for every feature).
12. **Documentation.** Update `firebase-rules.md`'s header to reflect the CLI-is-authoritative convention change (§7.2); update `docs/firebase/firestore_indexes` documentation (or retire it in favor of `firestore.indexes.json` being self-documenting once tracked in-repo).

---

## 12. Deferred Items

- **Firebase Auth custom claims for role/institutionId** — would eliminate the `users` Firestore read on every sign-in and remove the last reason `users` couldn't theoretically nest someday. Real change, separate from this overhaul, flagged in §3.1. **Precision on the "requires a Cloud Function" framing in §3.1:** that's only true for an *automatic* version (a Cloud Function triggered on user create/role-change) — Cloud Functions deployment itself requires the Blaze (pay-as-you-go) plan, not Spark, regardless of this overhaul. A narrower version stays on Spark: setting custom claims only requires the Admin SDK, which can be called from a manually-run local script with a service account key (an admin runs it after creating/editing a user) rather than a serverless trigger. See §14 for the full free-tier breakdown.
- **A `super_admin` UI that consumes the new `collectionGroup()` access** — this spec makes cross-institution querying *possible* (§3.6, §5.5) but builds no dashboard/list page that uses it. Building one (and its Collection Group indexes, §6.2) is future work once a concrete need is identified.
- **Chunked `collectionGroup` Collection-Group indexes** — deferred per §6.2 until a real consumer defines the query shape.
- **Any content for `institutions/master`** — reserved only; nothing currently needs it (§3.7).
- **A general data-access/repository layer** beyond the thin path helper in §9.1 — that helper solves path construction for this migration; a fuller abstraction (typed converters, centralized query builders) is a separate, larger decision not required to ship this overhaul.

---

## 13. Issues Found During This Audit

Two concrete problems, found while reading `firebase-rules.md` and cross-referencing it against actual `collection()`/`doc()` call sites in `src/`, independent of whether the nesting overhaul happens at all:

### 13.1 Stale `teachers`/`students` mirror collections (data integrity bug)

`AdminCreateUserForm.tsx` writes a `teachers/{uid}` (or `students/{uid}`) mirror document alongside the canonical `users/{uid}` document at account-creation time only. `TimetableSlotForm.tsx`, `ExamForm.tsx`, and `AssignmentForm.tsx` all read `departmentId` from that `teachers` mirror to scope senior-teacher department lookups. But `TeacherForm.tsx`'s edit path only ever updates `users/{uid}.departmentId` — it never touches the `teachers/{uid}` mirror. **Result: editing a teacher's department after creation silently desyncs the mirror, and the three forms reading from it keep using the stale value indefinitely**, with no error, warning, or way to detect the drift short of comparing both documents by hand. This is fixed as part of this overhaul (§8, §11 step 4) regardless of whether the rest of the nesting work proceeds, since it's a real, currently-live bug.

### 13.2 Dead collections with live rules

`parents`, `teacher_classes`, and `attendance` (singular) all have active Firestore security rules but are never read or written by any code in `src/` — `parents` and `teacher_classes` appear to predate the current `users`-with-a-`role`-field model entirely; `attendance` was fully superseded by `generalAttendance`/`subjectAttendance`. These aren't a security risk (the rules correctly deny by default), but they're dead weight in the rules file that makes future audits like this one harder. Removed in §8/§11 step 3.

---

## 14. Firebase Free Tier (Spark Plan) Analysis

This section evaluates everything above against Firebase's Spark (free) plan limits, grounded in the app's actual near-term scale: **a handful of pilot schools**, not a large-scale production rollout. It does not change any decision made in §1–§13 — nothing in this spec requires paid Firebase features — but it does add three caveats worth knowing before relying on this overhaul's stated driver (§4.2) at face value, plus one correction to how §12 characterized the custom-claims alternative.

### 14.1 Verdict

**Everything in this spec is achievable on Spark at the stated scale**, with no plan upgrade required to implement it. The restructuring itself — path changes, rules rewrite, index rewrite, CLI adoption, legacy cleanup, `collectionGroup` access — doesn't touch a paid Firebase feature; it's the same Firestore reads/writes/deletes at different paths. The only genuine free-tier ceilings that interact with this spec are Firestore's daily quotas, and at "a handful of pilot schools" they are not expected to be a near-term constraint — see §14.3 for why, and what would change that.

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
| **20,000 deletes/day** | §4.2's recursive per-institution delete (this spec's stated driver) and §10's reseed wipe | A realistic pilot institution's total document count — `results`, `feedback_comments`, `generalAttendance`, `subjectAttendance`, everything else combined — plausibly lands around 5,000–10,000 documents for a school with one or two terms of real usage. Comfortably under quota for a one-shot delete. Risk rises only if a *single* pilot school accumulates a full student body across several complete terms/school years before ever being offboarded — `results` and `feedback_comments` scale roughly as `students × subjects × assessments × terms` and are the two collections most likely to approach the ceiling first. Not a near-term concern at pilot scale. |
| **50,000 reads/day** | Pre-existing, not caused by this spec: every `get()`/`exists()` call *inside* a security rule (this file has many — `me()`, `isClassTeacherFor`, `isSeniorTeacherFor`, the subject-teacherIds ownership checks, every `student_parents` existence check) bills as an extra read, evaluated per document on list queries. A 50-document list fetch can cost 100–150+ billed reads once rule-evaluation overhead is counted. | A handful of pilot schools with modest concurrent staff/student usage will use a small fraction of this quota even with the amplification factored in. Worth knowing about (it's invisible until checked in Console usage), not worth acting on yet. |
| **1 GiB total Firestore storage** | Total data volume across the whole project | Comfortable at pilot scale; becomes a real planning number only once there's genuine multi-institution production data. Nesting is mildly *favorable* here, not a cost (see §14.2's index row). |

### 14.4 What the 20,000-delete quota means in practice (§4.2, §10)

Firestore's daily quotas reset every 24 hours. A recursive institution delete (or a reseed wipe) that only completes partway simply resumes the next day — **no data is lost**, the operation just spans two calendar days instead of one. For an admin-initiated, infrequent action like offboarding an institution or a one-time pre-launch reset, this is a fully acceptable outcome, not a failure mode to design around. It only becomes worth revisiting (via either batching the delete across explicit days, or upgrading to Blaze) once a specific institution's document count is known to approach the ceiling — not preemptively.

### 14.5 Correction to §12: Cloud Functions vs. Admin SDK script for custom claims

§12 lists Firebase Auth custom claims (the long-term fix for the `users`-nesting chicken-and-egg problem discussed in §3.1) as requiring "a Cloud Function or other backend this repo doesn't have." That's accurate for an *automatic* version — **Cloud Functions deployment requires the Blaze (pay-as-you-go) plan**, full stop, even for its nominal free invocation allowance, because it depends on Cloud Build/Artifact Registry, which Spark doesn't include.

It is not accurate as a blanket statement about custom claims themselves. Setting a custom claim only requires calling the Admin SDK (`admin.auth().setCustomUserClaims()`) — which can be done from a manually-run local script using a service account key, with no Cloud Functions involved and no Blaze requirement. The distinction: an *automatic*, serverless-triggered claims-setter needs Blaze; a *manual*, admin-runs-a-script-after-creating-a-user claims-setter stays on Spark. Neither is in scope for this overhaul (§12), but if custom claims are ever pursued, the manual-script version is the one that doesn't force a plan upgrade.

### 14.6 Gap found during this analysis, unrelated to plan tier

`firebase firestore:delete --recursive` (§4.2) only deletes Firestore documents — it does not touch Firebase **Storage**. An institution's `institutionLogoUrl` and `authorizedSignature.imageUrl` (both stored in Firebase Storage, referenced by URL from Firestore) would be orphaned by a recursive institution delete, not removed. This isn't a free-tier limitation — it would be true on Blaze too — but it means §4.2's "two operations instead of ~28" framing is for Firestore data only; a *complete* institution deletion (Firestore + Storage) needs a third step not designed anywhere in this spec. Flagged here as a completeness gap for whoever eventually implements §4.2's delete workflow, not something this spec resolves.

---

_End of spec._
