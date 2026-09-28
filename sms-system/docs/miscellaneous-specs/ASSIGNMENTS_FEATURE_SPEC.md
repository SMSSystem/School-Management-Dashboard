# Assignments Feature — Buildout Spec

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention).
> **Feature:** Extends the existing, currently list-only Assignments page into a full workflow: a value/type classification, file attachments (assignment materials, staying Spark-plan compatible), student submission with resubmission history, teacher grading (optionally linked into the existing Gradebook), and a reusable rubric library — with role-scoped visibility enforced at the `firestore.rules` layer, not just the UI.
> **Route:** Extends `list/assignments/index.tsx`; adds a new `list/assignments/[id]/index.tsx` detail page (none exists today).
> **Primary roles:** All five — `institution_admin`, `senior_teacher`, `regular_teacher`, `student`, `parent`, each with a distinct interaction shape (§7).
> **Explicitly out of scope:** "Lesson notes." `LessonForm.tsx` was found to be a non-functional stub (`onSubmit` just does `console.log(data)`, never writes to Firestore) — building that out is a separate, comparably-sized effort, deferred per your explicit choice.

---

## 1. Overview

Today, `list/assignments/index.tsx` is a bare list: subject, class, teacher, due date, and a description field, backed by `institutions/{institutionId}/assignments/{id}` (`AssignmentDocument`, `src/lib/firebase.ts:426-442`). There is no detail page, no file attachment, no student-facing submission mechanism, no grading UI, and no rubric concept anywhere in this codebase (confirmed via grep — zero matches for "rubric"). This spec turns that list into a real assignment workflow.

The single biggest architectural fact governing this spec, discovered via a web search during the brainstorming that preceded it: **as of February 3, 2026, Firebase Cloud Storage requires the Blaze (pay-as-you-go) plan — a Spark-plan project has zero access to any Storage bucket at all**, even within a nominal free allowance ([source](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)). This app has never used real Firebase Storage anyway — every existing "upload" (`UserPhotoDocument`, institution logos/signatures) is a base64 data URL embedded directly in a Firestore document. Per your explicit choice, this spec continues that same pattern rather than introducing a Blaze-plan dependency.

---

## 2. Background / Investigation Findings

- **Current `AssignmentDocument`** (`src/lib/firebase.ts:426-442`): `institutionId, termId, termName, subjectId, subjectName, classId, className, teacherId, teacherName, departmentId?, dueDate, description?, createdBy, createdByRole, createdAt`. `departmentId` is already denormalized at write time (`AssignmentForm.tsx:107-122`) specifically so `isSeniorTeacherFor()` can check it without a `get()` — the same pattern this spec reuses for a new `teacherRole` field (§4.1).
- **`AssignmentForm.tsx`** locks the teacher field to self for `regular_teacher`/`senior_teacher` (lines 89-96, 273-279) — an assignment is always self-attributed at creation, never reassigned to someone else. This spec keeps that invariant.
- **Read rule today is permissive, not role-scoped**: `firestore.rules`'s `assignments` block (`:1013-1024` nested; a matching flat block exists too, mid-migration) allows `read: if isSignedIn() && inMyInstitution(institutionId)` — **any signed-in same-institution account, including a student or parent for a different class, can already read every assignment document**. `isSeniorTeacherFor()` currently only gates the **update** rule. Per your explicit choice (§3), this spec tightens reads to match the role visibility you described.
- **Firestore rules don't filter query results — they reject the whole query.** If a `where()` query could return a document a rule would deny, the entire query fails, not just that one document. Every role-scoped query in this spec (§6) is written narrowly enough that it structurally can't return a document its matching rule would reject.
- **Photo-upload precedent** (`docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md`, `src/lib/imageUpload.ts`, `UserPhotoDocument` at `firebase.ts:248-259`): base64 data URL in a Firestore field, with magic-byte sniffing client-side before accepting a file and a `firestore.rules` regex/length check server-side (`isValidPhotoDataUrl()`). This spec's file-attachment fields (§4.1, §4.2) reuse this exact validation shape, extended to document MIME types.
- **Gradebook internals** (`list/gradebook/index.tsx`): `gradebookId` is deterministic — `${classId}_${subjectId}_${termId}` (line 288-291), at path `institutions/{institutionId}/gradebooks/{gradebookId}/columns/{colId}`. A `ResultDocument` only ever appears in the actual Gradebook grid if it carries a matching `gradebookColumnId` (every lookup in that file filters on it, e.g. lines 520, 620, 725). The exact write shape for a gradebook-linked result (`performSave()`, lines 634-659): `{ studentId, studentName, classId, className, termId, institutionId, subjectId, assessmentName, assessmentType, score, maxScore, weight, gradebookColumnId, columnWeight, source: "gradebook", teacherId, teacherName, departmentId, createdAt }`. This spec's grading write (§4.3, "gradebook" mode) copies this shape exactly, using the assignment's own values for `assessmentName` (its title, not the raw column ID, a small deliberate improvement over the existing gradebook UI's own convention) and `assessmentType: 'coursework'`.
- **`student_parents` parent-access pattern**: deterministic doc ID `{parentId}_{studentId}` (`firestore.rules:431`), checked via a direct `exists()` call — no query needed — repeated as the standard parent-read clause across ~17 existing collections' rules. This spec's `assignments`/`submissions`/`rubrics` reads reuse the identical clause.
- **`isSeniorTeacherFor(docDepartmentId)`** (`firestore.rules:104-110`) is department-scoped, not role-filtered — it lets a senior_teacher act on **any** document (their own or another senior_teacher's) in their department, not narrowly "only regular_teacher's." Per your explicit choice (§3 decision 4-alt), this spec does **not** reuse that helper as-is for assignment reads — it's a deliberate, intentional deviation from every other collection in this app (`lessons`, `exams`, `results`, `feedback_comments` all use the department-scoped helper unmodified). Assignments' senior_teacher read/grade access is genuinely narrower: own assignments, plus `regular_teacher`-authored assignments in the same department — **not** other senior_teachers'. This relies on the new denormalized `teacherRole` field (§4.1) rather than `isSeniorTeacherFor()`. Flagged clearly since a future maintainer reading `firestore.rules` top-to-bottom will otherwise reasonably assume every collection follows the same department-scoping convention — this one doesn't.

---

## 3. Resolved Design Decisions

| #   | Decision                  | Choice                                                                                                                               | Rationale                                                                                                                                                                                        |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Scope                     | Assignments only; Lessons deferred entirely                                                                                          | Lessons has zero real implementation today (stub form) — building it out is a separate effort of comparable size.                                                                                |
| 2   | File storage              | Base64-in-Firestore, matching the existing photo/logo pattern                                                                        | Firebase Storage now requires the Blaze plan even for $0 usage (Feb 2026 policy change) — staying Spark-only means staying with what this app already does.                                      |
| 3   | Rubrics                   | Reusable library (`institutions/{id}/rubrics/{rubricId}`), structured criteria grid                                                  | Avoids recreating the same rubric per assignment; matches how rubrics normally work academically (criteria × performance levels × points).                                                       |
| 4   | Read-rule tightening      | Yes — real `firestore.rules` enforcement, not just UI/query convention                                                               | Matches your explicit choice; today's rule is permissive enough that a student could already read another class's assignment directly.                                                           |
| 5   | Grading integration       | Assignment grades can be linked into the real Gradebook grid via an existing `gradebookColumnId`, chosen once per assignment         | Not a standalone-only concept — reuses the exact write shape Gradebook's own `performSave()` already produces.                                                                                   |
| 6   | Column linkage            | Teacher picks an **existing** gradebook column — none is auto-created                                                                | Avoids silently proliferating gradebook columns; the teacher stays in control of what appears in their own grid.                                                                                 |
| 7   | Choice granularity        | Made once per assignment (`gradingMode`), not per individual submission                                                              | Avoids a partially-linked gradebook column where some students count toward it and others don't.                                                                                                 |
| 8   | Draft state               | Yes — `status: 'draft' \| 'published'`                                                                                               | A teacher can prepare an assignment before students see it.                                                                                                                                      |
| 9   | Resubmission              | Yes, with a history of every attempt                                                                                                 | Per your choice — refined in §4.2 to bound storage cost (full file kept only on the current attempt, not every historical one — see the flagged judgment call there).                            |
| 10  | Rubric structure          | Structured criteria grid, not free text                                                                                              | Named criteria rows × performance-level columns with point values.                                                                                                                               |
| 11  | Senior_teacher visibility | Strictly role-filtered — own assignments plus `regular_teacher`-authored ones in the same department; **not** other senior_teachers' | Matches your literal original phrasing exactly, at the cost of diverging from `isSeniorTeacherFor()`'s existing department-scoped precedent used everywhere else in this app (flagged in §2/§9). |
| 12  | Resubmission history      | Full file bytes kept for every historical attempt, not just the current one                                                          | Per your explicit choice — true complete history, traded directly against §8's storage growth.                                                                                                   |
| 13  | File size cap             | ~500 KB raw, client-enforced                                                                                                         | Conservative headroom under Firestore's 1 MiB per-document hard limit.                                                                                                                           |

---

## 4. Data Model

### 4.1 `AssignmentDocument` — new fields

```ts
export type AssignmentValueType =
  | "essay"
  | "case_study"
  | "project"
  | "presentation"
  | "portfolio"
  | "homework"
  | "in_class_activity"
  | "self_assessment"
  | "peer_assessment"
  | "journal"
  | "ict_based_task"
  | "lab"
  | "field_work"
  | "report"
  | "research_paper"
  | "other";

export type AssignmentDocument = {
  // ...existing fields unchanged...
  type: AssignmentValueType;
  otherTypeLabel?: string; // required (client + rules) when type === 'other'

  status: "draft" | "published";

  // Denormalized at write time, same pattern as the existing departmentId —
  // lets rules/queries filter by role without a get() (§2, §6).
  teacherRole: "regular_teacher" | "senior_teacher";

  // Attachment — base64, same validated-data-URL shape as UserPhotoDocument.
  // Optional: an assignment may have no attached file (description-only).
  attachmentDataUrl?: string;
  attachmentFileName?: string;
  attachmentMimeType?: string; // 'application/pdf' | '.docx'/'.pptx' MIME | 'image/...'
  attachmentSize?: number; // bytes, pre-base64, for the ~500KB cap check (§8)

  rubricId?: string; // -> institutions/{id}/rubrics/{rubricId}

  gradingMode: "gradebook" | "standalone";
  gradebookColumnId?: string; // required iff gradingMode === 'gradebook'
};
```

### 4.2 Submissions — new nested collection

```
institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}
```

Deterministic doc ID (`studentId`, matching the `student_parents` precedent's use of deterministic IDs over auto-IDs) — one submission "state" document per student per assignment.

```ts
export type SubmissionDocument = {
  institutionId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string;

  // Current/latest attempt's file — this is what a teacher marks and what
  // "download the student's work" downloads.
  currentAttemptNumber: number;
  fileDataUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  submittedAt: Timestamp;
  status: "submitted" | "late" | "graded";

  // Grading (written only by the grading role, never the student — see §6).
  grade?: number;
  maxGrade?: number;
  feedback?: string;
  gradedBy?: string;
  gradedByName?: string;
  gradedAt?: Timestamp;
};
```

**Attempt history** — subcollection, full file kept per attempt (per your explicit choice — §3 decision 12):

```
institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}/attempts/{attemptNumber}
```

```ts
export type SubmissionAttemptDocument = {
  attemptNumber: number;
  fileDataUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  submittedAt: Timestamp;
};
```

**Explicit tradeoff, not a silent decision**: this keeps every resubmission's actual file content, not just its metadata — true complete history, per your choice, at the direct cost of multiplying storage by the average number of resubmissions per assignment (quantified in §8). The current/latest attempt's file is duplicated onto the parent `SubmissionDocument` (§4.2 above) as well as its own `attempts/{n}` entry — a small amount of redundancy that keeps "download the current submission" a single-document read rather than requiring a query for the highest `attemptNumber`.

### 4.3 Grading write shape

**`gradingMode: 'standalone'`** — grade/feedback fields written directly onto `SubmissionDocument` above; nothing else happens.

**`gradingMode: 'gradebook'`** — same `SubmissionDocument` fields, **plus** a `results` write matching Gradebook's own `performSave()` shape exactly (§2):

```ts
{
  studentId, studentName, classId, className, termId, institutionId, subjectId,
  assessmentName: assignment.title,     // human-readable, unlike raw colId
  assessmentType: 'coursework',
  score: grade, maxScore: maxGrade,
  weight: column.columnWeight, columnWeight: column.columnWeight,
  gradebookColumnId: assignment.gradebookColumnId,
  source: 'gradebook',
  teacherId, teacherName, departmentId,
  createdAt: serverTimestamp(),
}
```

Written the same way Gradebook itself does — check for an existing result matching `gradebookColumnId + studentId` first (`update`), else `set` a new one — so it appears correctly in the Gradebook grid the next time that teacher opens it, with no changes needed to `list/gradebook/index.tsx` itself.

### 4.4 Rubrics — new reusable collection

```
institutions/{institutionId}/rubrics/{rubricId}
```

```ts
export type RubricDocument = {
  institutionId: string;
  title: string;
  description?: string;
  criteria: {
    id: string;
    name: string;
    maxPoints: number;
    levels: { label: string; points: number; description?: string }[];
  }[];
  createdBy: string;
  createdByRole: "institution_admin" | "senior_teacher" | "regular_teacher";
  createdAt: Timestamp;
};
```

---

## 5. Firestore Rules

### 5.1 `assignments` — read rule tightened

```javascript
match /institutions/{institutionId}/assignments/{assignmentId} {
  allow read: if isSignedIn() && inMyInstitution(institutionId)
    && (
      isAdminOrAbove()
      || resource.data.teacherId == request.auth.uid
      // Intentionally NOT isSeniorTeacherFor() — per §3 decision 11, this
      // collection's senior_teacher visibility is role-filtered, not just
      // department-scoped: same department AND the target was authored by
      // a regular_teacher specifically. A senior_teacher does NOT see
      // another senior_teacher's assignments under this rule, unlike every
      // other collection in this file (see §2/§9).
      || (myRole() == 'senior_teacher'
          && me().departmentId == resource.data.departmentId
          && resource.data.teacherRole == 'regular_teacher')
      || (myRole() == 'student' && resource.data.classId == me().classId
          && resource.data.status == 'published')
      || (isParent() && resource.data.status == 'published'
          && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + <child's uid, resolved client-side per §6.1>))
    );
  // create/update/delete unchanged from today, plus: status/gradingMode/
  // gradebookColumnId only settable by the same roles that could already
  // create/update (isTeacherOrAbove()) — no new principal gains write access.
}
```

The parent clause's `exists()` check needs the specific child's uid, which a rule can't enumerate on its own — client queries for a parent are always scoped to one resolved child at a time (§6.1's fan-out pattern), so the rule checks that resolved value the same way every other parent-scoped collection in this app already does.

### 5.2 `rubrics` — new block

```javascript
match /institutions/{institutionId}/rubrics/{rubricId} {
  allow read: if isSignedIn() && inMyInstitution(institutionId);
  allow create, update: if isTeacherOrAbove() && inMyInstitution(institutionId)
    && request.resource.data.institutionId == institutionId;
  allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);
}
```

Broad read (any signed-in institution member) — a student/parent viewing an assignment needs to see its attached rubric too, same reasoning as why assignments themselves aren't locked down below "same institution."

### 5.3 `submissions` — new block, field-scoped writes

```javascript
match /institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId} {
  function assignment() {
    return get(/databases/$(database)/documents/institutions/$(institutionId)/assignments/$(assignmentId)).data;
  }
  // Same role-filtered senior_teacher condition as §5.1's assignments rule
  // (assignment().teacherRole == 'regular_teacher', not isSeniorTeacherFor())
  // — kept identical on purpose: a senior_teacher who can't read/grade an
  // assignment shouldn't be able to read/grade its submissions either.
  function seniorTeacherMayAct() {
    return myRole() == 'senior_teacher'
      && me().departmentId == assignment().departmentId
      && assignment().teacherRole == 'regular_teacher';
  }

  allow read: if isSignedIn() && inMyInstitution(institutionId)
    && (isAdminOrAbove()
        || seniorTeacherMayAct()
        || assignment().teacherId == request.auth.uid
        || request.auth.uid == studentId
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + studentId))));

  // Student: create their own submission, or update it (resubmit) — but
  // ONLY the submission fields, never the grade fields.
  allow create: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.keys().hasOnly([
         'institutionId','assignmentId','studentId','studentName','classId',
         'currentAttemptNumber','fileDataUrl','fileName','mimeType','fileSize',
         'submittedAt','status'
       ]);
  allow update: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
         'currentAttemptNumber','fileDataUrl','fileName','mimeType','fileSize',
         'submittedAt','status'
       ]);

  // Teacher/admin: grade fields only, never the submitted file itself.
  allow update: if inMyInstitution(institutionId)
    && (isAdminOrAbove() || seniorTeacherMayAct() || assignment().teacherId == request.auth.uid)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
         'grade','maxGrade','feedback','gradedBy','gradedByName','gradedAt','status'
       ]);
}
```

The `get()` calls here (resolving the parent assignment's `departmentId`/`teacherId`/`teacherRole`) each count as one additional Firestore read per rule evaluation (§8) — the same documented cost every existing `get()`-based rule in this app already carries (`docs/firebase/MISCELLANEOUS_INFO.md:933`). `assignment()` is called multiple times across this block's conditions; Firestore rules don't cache `get()` results across separate calls within one evaluation, so a real deployment should assign it to a local `let` once per rule branch rather than calling the function repeatedly, to avoid redundant reads — written here as repeated calls only for readability.

`attempts` subcollection: `allow read` mirrors the parent `submissions` doc's read rule; `allow create` is student-only, own uid, full attempt shape including `fileDataUrl` (per §3 decision 12/§4.2's design); no update/delete (an immutable log).

---

## 6. Queries and Indexes

### 6.1 Per-role list queries

| Role                              | Query                                                                                        | New composite index needed                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `institution_admin`/`super_admin` | `institutions/{id}/assignments`, unfiltered                                                  | None (existing bare listener)                                                                                             |
| `regular_teacher`                 | `.where('teacherId','==',uid)`                                                               | None (single equality)                                                                                                    |
| `senior_teacher`                  | `.where('departmentId','==',myDept)`                                                         | None (single equality) — client further splits "mine" vs "my department's" in the UI, not via a second server-side filter |
| `student`                         | `.where('classId','==',myClassId).where('status','==','published').orderBy('dueDate')`       | **Yes**: `classId ASC, status ASC, dueDate ASC`                                                                           |
| `parent`                          | Same as student, once per resolved child (§2's fan-out pattern via `useLinkedStudentIds.ts`) | Reuses the student index above                                                                                            |

### 6.2 Submissions

Teacher's per-assignment grading view: `institutions/{id}/assignments/{aid}/submissions`, unfiltered, path-scoped — no composite index needed (small collection, bounded by class size). No collection-group query is needed for a student's/parent's own submissions view — they already know which assignment they're looking at (reached via the assignment detail page), so it's a direct single-document read (`submissions/{studentId}`, their own uid), not a query.

---

## 7. Role Interaction Matrix

| Action                              | `institution_admin` | `senior_teacher`                              | `regular_teacher`     | `student`                 | `parent`                      |
| ----------------------------------- | ------------------- | --------------------------------------------- | --------------------- | ------------------------- | ----------------------------- |
| View assignments                    | All, any status     | Own + `regular_teacher`'s in dept, any status | Own only, any status  | Own class, published only | Child's class, published only |
| Create/edit assignment + attachment | Yes                 | Yes (self-attributed)                         | Yes (self-attributed) | No                        | No                            |
| Set draft/published                 | Yes                 | Yes (own)                                     | Yes (own)             | No                        | No                            |
| Attach/create rubric                | Yes                 | Yes                                           | Yes                   | No                        | No                            |
| Download attachment                 | Yes                 | Yes (own + visible `regular_teacher`'s)       | Yes (own)             | Yes                       | Yes                           |
| Upload/resubmit completed work      | No                  | No                                            | No                    | Yes (own)                 | No                            |
| Download student's submission       | Yes                 | Own + `regular_teacher`'s in dept             | Yes (own)             | Own only                  | Own child only                |
| Grade/mark submission               | Yes                 | Own + `regular_teacher`'s in dept             | Yes (own)             | No                        | No                            |

Note: a `senior_teacher` never sees, downloads, or grades **another senior_teacher's** assignments or submissions under this design — genuinely narrower than every other collection in this app (§2, §5.1's inline comment).

---

## 8. Firebase Free-Tier Impact

- **Reads**: tightening the read rule (§5.1) actually _reduces_ aggregate reads versus today's behavior — a student's query now only ever returns their own class's published assignments, instead of the app relying on an unfiltered listener plus client-side hiding. `get()` calls inside the new `submissions` rules (§5.3) each add one extra read per rule evaluation, same documented cost as every other `get()`-based rule in this app.
- **Writes**: one submission write per resubmission, one attempt-metadata write per resubmission, one grade write, and (in `gradebook` mode) one additional `results` write — all per-student, per-assignment. At this project's realistic institution scale (tens of students), trivially inside the 20,000 writes/day Spark limit.
- **Storage — the real constraint here, and materially bigger than a first pass would suggest.** Firestore's total free storage is **1 GiB**, shared across the _entire_ project, not per-institution. A single base64-embedded file, after ~33% base64 inflation, is capped by Firestore's **1 MiB per-document hard limit** regardless of what cap this spec sets client-side — the confirmed **~500 KB raw-file cap** (§3 decision 13, client-enforced, mirroring `imageUpload.ts`'s validation pattern) leaves headroom under that.
  - **Worked example, with full per-attempt file history (§3 decision 12) factored in**: 30 students × 10 assignments/term × ~300 KB average submission × an assumed ~1.5 attempts/student/assignment average (most submit once, some resubmit) ≈ **~135 MB for one institution, one term** — and that's _before_ counting each assignment's own teacher-uploaded attachment. Two terms of normal use for one mid-size institution could plausibly approach a quarter of this project's _entire_ 1 GiB Firestore storage budget, shared across every institution and every other collection in the app.
  - This is the first feature in this app where **storage, not reads/writes, is the binding free-tier constraint** — every other free-tier analysis in this project's docs (`docs/firebase/MISCELLANEOUS_INFO.md`, this repo's various spec docs) has been about read/write/delete quotas, which reset daily; storage does not reset and only grows unless something is deleted.
  - **No deletion/archival mechanism is designed here** (§9/§10) — this is the single most consequential open gap in this spec, directly caused by choosing full-history resubmission storage over the metadata-only alternative. Strongly worth monitoring actual Firebase Console storage usage after this feature ships, and treating a pruning/archival mechanism as a near-term follow-up rather than a someday-maybe, given this math.

---

## 9. Gotchas & Nuances

- **The ~500 KB file cap is a hard practical limit on what "upload a document" can mean here.** A multi-page scanned assignment, a large slide deck, or an uncompressed Word doc with embedded images will very plausibly exceed it. This is the direct, accepted cost of staying Spark-only post-February-2026 (§1) — not a bug to fix later, a boundary to communicate to actual users of the feature.
- **Assignments' senior_teacher rule intentionally diverges from `isSeniorTeacherFor()`'s precedent used everywhere else in this app** (§2, §5.1) — role-filtered (own + `regular_teacher`'s in-department only), not department-scoped (which would also include other senior_teachers'). A future maintainer reading `firestore.rules` top-to-bottom and assuming every collection follows the same convention will be wrong about this one specifically — worth a code comment at the rule site itself (already included in §5.1's snippet) and not just this doc.
- **Firestore rules reject whole queries, not individual documents** (§2) — every query in §6.1 is written to be structurally incapable of returning a document its own rule would deny, which is why e.g. the student query includes `.where('status','==','published')` explicitly rather than relying on the rule alone to hide drafts.
- **Resubmission history keeps every attempt's full file, not just metadata** (§4.2, §3 decision 12) — true complete history, per your explicit choice, at the direct, quantified storage cost worked through in §8. This is the single biggest storage-growth decision in this spec.
- **No deletion/archival mechanism for old attachments/submissions** — combined with full-file attempt history, this is a real near-term concern, not a someday-maybe (§8). This spec is additive only; nothing here prunes old data.
- **`gradingMode`/`gradebookColumnId` are set once, at assignment creation/edit time** — per your choice, not per individual grading action. If a teacher wants to change their mind after some students are already graded standalone, that's a manual data-migration problem this spec doesn't solve.
- **Rules `get()` calls inside `submissions`' new rule block are not free** — `assignment()` is called from multiple branches of the same rule; a real implementation should cache it in a `let` binding once per branch rather than calling it repeatedly as written for readability in §5.3 (each call is a distinct read against the daily quota).

---

## 10. Explicitly Out of Scope

- **Lesson notes** — deferred per §3 decision 1; `LessonForm.tsx` remains the non-functional stub it is today.
- **Attachment/submission deletion or archival** — flagged as a real, near-term concern in §8/§9 (not a someday-maybe, given full-history storage growth), but not designed here.
- **Notifications** (e.g. "your assignment was graded") — no existing notification system in this app to hook into; out of scope.
- **Department-scoped (rather than strictly role-filtered) senior_teacher visibility** — §3 decision 11 chose the strict, role-filtered interpretation over reusing `isSeniorTeacherFor()`'s existing department-scoped precedent; the more consistent-with-existing-code alternative was considered and explicitly not chosen.
- **Metadata-only historical attempts** — §3 decision 12 chose full file retention per attempt over the storage-bounded metadata-only alternative that was originally proposed.

---

## 11. Implementation Order

1. `AssignmentDocument` type extension + `AssignmentForm.tsx` updates (type dropdown, draft/published toggle, attachment upload reusing `imageUpload.ts`'s validation shape, rubric picker, gradingMode + gradebook column picker).
2. `rubrics` collection + a rubric-management UI (list/create/edit a reusable criteria grid) + `firestore.rules` §5.2.
3. `firestore.rules` §5.1 (tightened assignment reads) + §6.1's new composite index — deploy together, since the index must exist before the tightened query goes live.
4. New `list/assignments/[id]/index.tsx` detail page — renders description, attachment download, rubric, and (role-dependent) either the student upload UI or the teacher grading/roster UI.
5. `submissions` + `attempts` collections, `firestore.rules` §5.3, student upload flow.
6. Teacher grading flow, including the `gradebook`-mode `results` write (§4.3) mirroring `performSave()`.
7. Manual verification per role (admin, senior_teacher, regular_teacher, student, parent) against a disposable QA institution before any production use, matching this project's established verification discipline.
