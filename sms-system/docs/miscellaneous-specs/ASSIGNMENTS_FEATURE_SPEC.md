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
| 9   | Resubmission               | Yes, a student may resubmit                                                                                                          | Superseded in part by decision 12 below — that row states the actual retention shape; this row previously contradicted it (corrected during review).                                             |
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
  // NEW — AssignmentDocument has no name/title field today (confirmed via
  // §2's field inventory); everything currently identifies an assignment by
  // subjectName + className + dueDate. That's not enough once an assignment
  // can carry an attachment, a rubric, and a grade — "which one" needs a
  // real human label. Required, not optional: every assignment created
  // through this feature gets one.
  title: string;

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

**Correction from the initial draft**: "standalone" previously meant only writing grade fields onto `SubmissionDocument`, with no `ResultDocument` at all. That silently narrowed what was actually agreed during the brainstorm that preceded this spec — "standalone" was defined there as *"a standalone `ResultDocument`... visible in the Results list and counted toward report cards,"* explicitly distinguished from "doesn't appear in the Gradebook grid," not from "doesn't exist anywhere outside the submission." Fixed below.

**`gradingMode: 'standalone'`** — grade/feedback fields written onto `SubmissionDocument` (§4.2), **plus** a plain `results` write:

```ts
{
  studentId, studentName, classId, className, termId, institutionId, subjectId,
  assessmentName: assignment.title,
  assessmentType: 'coursework',
  score: grade, maxScore: maxGrade,
  date: gradedAt,
  teacherId, teacherName, departmentId,
  createdAt: serverTimestamp(),
  // Deliberately omitted: gradebookColumnId, columnWeight, weight, source.
  // Confirmed by reading generateReportCard.ts (§2): a subject's report-card
  // grade only takes the gradebookColumnId-weighted path when ANY of its
  // results have source === 'gradebook' (line 141); otherwise it falls back
  // to computeCWGrade()/computeExamGrade(), which average every matching
  // assessmentType result for that subject using the SUBJECT's own
  // cwWeight/examWeight split — no per-result weight field needed. A
  // standalone assignment grade is picked up by that averaging automatically,
  // with zero changes needed to generateReportCard.ts itself.
}
```

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

**Shared helpers, defined at the top level of the rules file** (alongside `isSignedIn()`, `isValidPhotoDataUrl()`, etc. — confirmed via `firestore.rules:6-42` that every helper lives here, not nested inside any one collection's `match` block) — **not** inside the `assignments` block below, since `submissions` (§5.3) is its own sibling top-level `match` statement and needs to call the same functions. This codebase never nests a subcollection's rules inside its parent's `match` block either (confirmed: `match /users/{uid}/photo/{photoId}` at `firestore.rules:257` is a standalone top-level match, not nested inside `match /users/{uid}` at line 195) — `submissions` follows that same existing convention, unchanged from the original draft.

```javascript
// Base64 attachment field — same shape as isValidPhotoDataUrl() (§2),
// extended to document MIME types and the larger ~500KB cap (§3 decision
// 13). ~700,000 chars ≈ 500,000 bytes raw * 4/3 base64 inflation, rounded
// up for the "data:...;base64," prefix — mirrors how the photo function's
// own 60,000-char cap was derived from its much smaller image cap.
function isValidAttachmentDataUrl(url) {
  return url is string
    && url.size() <= 700000
    && url.matches('^data:(application/pdf'
         + '|application/vnd\\.openxmlformats-officedocument\\.wordprocessingml\\.document'
         + '|application/vnd\\.openxmlformats-officedocument\\.presentationml\\.presentation'
         + '|image/(jpeg|png|webp));base64,.+$');
}

function isValidAssignmentType(t) {
  return t in [
    'essay','case_study','project','presentation','portfolio','homework',
    'in_class_activity','self_assessment','peer_assessment','journal',
    'ict_based_task','lab','field_work','report','research_paper','other'
  ];
}

// Deterministic-ID trick, not a field comparison: gradebookId is always
// classId_subjectId_termId (§2), so a colId that "belongs" to a different
// class/subject/term simply won't exist at THIS derived path, even if the
// same colId string exists somewhere else. One exists() call, no need to
// fetch and compare fields.
function gradebookColumnBelongsToAssignment(institutionId, d) {
  return exists(/databases/$(database)/documents/institutions/$(institutionId)
    /gradebooks/$(d.classId + '_' + d.subjectId + '_' + d.termId)
    /columns/$(d.gradebookColumnId));
}
```

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

  allow create, update: if isTeacherOrAbove() && inMyInstitution(institutionId)
    && request.resource.data.institutionId == institutionId
    && request.resource.data.title is string && request.resource.data.title.size() > 0
    && isValidAssignmentType(request.resource.data.type)
    && (request.resource.data.type != 'other'
        || (request.resource.data.otherTypeLabel is string
            && request.resource.data.otherTypeLabel.size() > 0))
    && (!('attachmentDataUrl' in request.resource.data)
        || isValidAttachmentDataUrl(request.resource.data.attachmentDataUrl))
    && (request.resource.data.gradingMode == 'standalone'
        || (request.resource.data.gradingMode == 'gradebook'
            && 'gradebookColumnId' in request.resource.data
            && gradebookColumnBelongsToAssignment(institutionId, request.resource.data)))
    // Existing invariants, unchanged: only admin, the assignment's own
    // teacherId, or (per the narrowed rule above) the right senior_teacher
    // may write; teacherId itself still can't be reassigned to someone else
    // (AssignmentForm.tsx's existing self-attribution lock, §2).
    && (isAdminOrAbove()
        || request.resource.data.teacherId == request.auth.uid
        || (myRole() == 'senior_teacher'
            && me().departmentId == request.resource.data.departmentId
            && request.resource.data.teacherRole == 'regular_teacher'));

  allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);
}
```

The parent clause's `exists()` check needs the specific child's uid, which a rule can't enumerate on its own — client queries for a parent are always scoped to one resolved child at a time (§6.1's fan-out pattern), so the rule checks that resolved value the same way every other parent-scoped collection in this app already does.

**Not validated in rules, deliberately accepted as a gap**: `rubricId` reference integrity (§9) — unlike `gradebookColumnId`, a wrong or dangling `rubricId` doesn't corrupt another class's data, only shows a missing/wrong rubric to whoever opens this assignment. Lower stakes, not worth an extra `get()` per write.

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
  // ONLY the submission fields, never the grade fields. Reuses §5.1's
  // isValidAttachmentDataUrl() — same file-shape rules apply to a student's
  // submitted work as to a teacher's assignment attachment.
  allow create: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.keys().hasOnly([
         'institutionId','assignmentId','studentId','studentName','classId',
         'currentAttemptNumber','fileDataUrl','fileName','mimeType','fileSize',
         'submittedAt','status'
       ])
    && isValidAttachmentDataUrl(request.resource.data.fileDataUrl);
  allow update: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
         'currentAttemptNumber','fileDataUrl','fileName','mimeType','fileSize',
         'submittedAt','status'
       ])
    && isValidAttachmentDataUrl(request.resource.data.fileDataUrl);

  // Teacher/admin: grade fields only, never the submitted file itself.
  allow update: if inMyInstitution(institutionId)
    && (isAdminOrAbove() || seniorTeacherMayAct() || assignment().teacherId == request.auth.uid)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
         'grade','maxGrade','feedback','gradedBy','gradedByName','gradedAt','status'
       ]);
}
```

**Correction from the initial draft, verified via web search**: this section previously claimed Firestore rules "don't cache `get()` results across separate calls within one evaluation" and recommended manually caching `assignment()` in a `let` to avoid redundant billed reads. That's wrong — per [Firebase's own documentation](https://firebase.google.com/docs/firestore/security/rules-conditions), **Firestore automatically deduplicates repeated `get()`/`exists()` calls to the same document within a single rule evaluation**; the deduped calls aren't separately billed, and don't count twice against the 10-call rule-evaluation depth limit either. So `assignment()` being called from multiple branches of this block (§5.3) costs **one** read, not several, regardless of how many times it's written in the rule text. The `get()` still happens at least once, still costs one read against the daily quota (§8) — the same documented cost every existing `get()`-based rule in this app already carries (`docs/firebase/MISCELLANEOUS_INFO.md:933`) — the correction is only about repeated calls, not about `get()` being free.

`attempts` subcollection: `allow read` mirrors the parent `submissions` doc's read rule; `allow create` is student-only, own uid, full attempt shape including `fileDataUrl` (per §3 decision 12/§4.2's design); no update/delete (an immutable log).

---

## 6. Queries and Indexes

### 6.1 Per-role list queries

| Role                              | Query                                                                                        | New composite index needed                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `institution_admin`/`super_admin` | `institutions/{id}/assignments`, unfiltered                                                  | None (existing bare listener)                                                                                             |
| `regular_teacher`                 | `.where('teacherId','==',uid)`                                                               | None (single equality)                                                                                                    |
| `senior_teacher`                  | **Two separate queries, merged client-side** — see correction below                          | None (both are equality-only)                                                                                             |
| `student`                         | `.where('classId','==',myClassId).where('status','==','published').orderBy('dueDate')`       | **Yes**: `classId ASC, status ASC, dueDate ASC`                                                                           |
| `parent`                          | Same as student, once per resolved child (§2's fan-out pattern via `useLinkedStudentIds.ts`) | Reuses the student index above                                                                                            |

**Correction from the initial draft**: a single `.where('departmentId','==',myDept)` query for `senior_teacher` was proposed originally, with "the UI splits mine vs. my department's" — but that doesn't match §5.1's actual rule (§3 decision 11), which additionally requires `teacherRole == 'regular_teacher'` for the department-based clause. Per this doc's own repeated point (§2, §9): **a Firestore query fails entirely if it could return even one document its rule would deny — it doesn't silently filter that document out.** A bare `departmentId` query would return other senior_teachers' assignments in that department too, which the rule denies, so the *whole query* would fail the moment such a document exists. Corrected to two queries, run in parallel and merged client-side:

```ts
query(assignmentsRef, where('teacherId', '==', uid))                                    // own
query(assignmentsRef, where('departmentId', '==', myDept), where('teacherRole', '==', 'regular_teacher')) // dept's regular_teacher-authored
```

Both are equality-only (no `orderBy`/range), so neither needs a new composite index beyond what §6.1's table already lists.

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

- **"Standalone" grading now means "a plain `ResultDocument`, not gradebook-linked" — not "no `ResultDocument` at all," corrected in §4.3.** The initial draft only wrote grade fields onto the submission itself in standalone mode, which would have made a standalone-graded assignment invisible to the Results list and report-card generation — narrower than what was actually agreed in the brainstorm preceding this spec. Fixed by writing a `results` doc with `assessmentType: 'coursework'` and no `gradebookColumnId`/`source`, which `generateReportCard.ts`'s existing `computeCWGrade()` path already averages in automatically (§2, §4.3) — no changes needed to that file.
- **The ~500 KB file cap is a hard practical limit on what "upload a document" can mean here.** A multi-page scanned assignment, a large slide deck, or an uncompressed Word doc with embedded images will very plausibly exceed it. This is the direct, accepted cost of staying Spark-only post-February-2026 (§1) — not a bug to fix later, a boundary to communicate to actual users of the feature.
- **Assignments' senior_teacher rule intentionally diverges from `isSeniorTeacherFor()`'s precedent used everywhere else in this app** (§2, §5.1) — role-filtered (own + `regular_teacher`'s in-department only), not department-scoped (which would also include other senior_teachers'). A future maintainer reading `firestore.rules` top-to-bottom and assuming every collection follows the same convention will be wrong about this one specifically — worth a code comment at the rule site itself (already included in §5.1's snippet) and not just this doc.
- **Firestore rules reject whole queries, not individual documents** (§2) — every query in §6.1 is written to be structurally incapable of returning a document its own rule would deny, which is why e.g. the student query includes `.where('status','==','published')` explicitly rather than relying on the rule alone to hide drafts.
- **Resubmission history keeps every attempt's full file, not just metadata** (§4.2, §3 decision 12) — true complete history, per your explicit choice, at the direct, quantified storage cost worked through in §8. This is the single biggest storage-growth decision in this spec.
- **No deletion/archival mechanism for old attachments/submissions** — combined with full-file attempt history, this is a real near-term concern, not a someday-maybe (§8). This spec is additive only; nothing here prunes old data.
- **`gradingMode`/`gradebookColumnId` are set once, at assignment creation/edit time** — per your choice, not per individual grading action. If a teacher wants to change their mind after some students are already graded standalone, that's a manual data-migration problem this spec doesn't solve.
- **`gradebookColumnId` is now reference-integrity-checked** (§5.1's `gradebookColumnBelongsToAssignment()`), but **`rubricId` deliberately isn't** — a dangling or wrong `rubricId` shows a missing/wrong rubric on one assignment; a wrong `gradebookColumnId` would silently write grades into a different class's gradebook. Different failure severities, different amount of validation effort spent.
- **Rubric read access isn't tied to assignment/class visibility** (§5.2) — any signed-in same-institution account can read any rubric in the library by ID, even one attached only to an assignment or class they otherwise couldn't see. Accepted deliberately: rubric content generally isn't sensitive, and scoping it to "only visible-assignment" would require threading assignment-level context into a rule for a collection designed to be shared/reusable across assignments (§3 decision 3) in the first place.
- **A submission's `'late'` status is computed client-side, not enforced server-side** — compare `submittedAt` against the assignment's `dueDate` at the moment of upload. Not security-critical (it's informational, not a permission gate), so trusting the client here — unlike the grade fields, which the rules do lock down — is an acceptable, deliberate asymmetry.
- **Rules `get()` calls still cost a real read, just not a redundant one** — corrected in §5.3: Firestore automatically dedupes repeated `get()`/`exists()` calls to the same document within one rule evaluation, so calling `assignment()` from multiple branches costs one read, not several. The `get()` itself is still a real, billed read against the daily quota (§8) the first time it happens.

---

## 10. Explicitly Out of Scope

- **Lesson notes** — deferred per §3 decision 1; `LessonForm.tsx` remains the non-functional stub it is today.
- **Attachment/submission deletion or archival** — flagged as a real, near-term concern in §8/§9 (not a someday-maybe, given full-history storage growth), but not designed here.
- **Notifications** (e.g. "your assignment was graded") — no existing notification system in this app to hook into; out of scope.
- **Department-scoped (rather than strictly role-filtered) senior_teacher visibility** — §3 decision 11 chose the strict, role-filtered interpretation over reusing `isSeniorTeacherFor()`'s existing department-scoped precedent; the more consistent-with-existing-code alternative was considered and explicitly not chosen.
- **Metadata-only historical attempts** — §3 decision 12 chose full file retention per attempt over the storage-bounded metadata-only alternative that was originally proposed.
- **`rubricId` reference-integrity validation** — added for `gradebookColumnId` (§5.1) but deliberately not for `rubricId`, given the lower stakes of a dangling reference there (§9).
- **Rubric visibility scoped to assignment/class access** — rubrics stay a flat, broadly-readable library (§5.2); not tied to which assignments/classes reference them (§9).

---

## 11. Testing Considerations

- **Static**: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build` — the standing gate, unchanged.
- **Rules unit tests** (if this repo adopts the Firebase Rules Unit Testing SDK for this feature — not currently used elsewhere in this repo, worth confirming before assuming it's the right tool): `isValidAttachmentDataUrl()` (valid PDF/DOCX/PPTX/image data URLs pass; oversized or wrong-MIME strings fail), `isValidAssignmentType()` (all 16 values pass, arbitrary strings fail), `gradebookColumnBelongsToAssignment()` (a column from the *correct* class/subject/term passes; the same `colId` under a *different* class/subject/term fails).
- **Per-role manual verification**, against a disposable QA institution, matching this project's established discipline (never against a real institution first):
  - `institution_admin`: create an assignment with an attachment, a rubric, and `gradingMode: 'gradebook'`; confirm it's visible to every role per §7's matrix.
  - `regular_teacher`: create own assignment (self-attributed, unchangeable); confirm inability to read/grade another teacher's assignment or submissions.
  - `senior_teacher`: confirm visibility of own + same-department `regular_teacher`'s assignments; confirm a same-department **other senior_teacher's** assignment is genuinely not visible (§3 decision 11) — this is the one case worth double-checking carefully, since it's the one rule in this spec that deviates from every other collection's convention.
  - `student`: confirm a draft assignment is invisible; confirm a published one in their own class is visible and a different class's is not; upload a submission, confirm resubmission preserves history (§4.2); confirm the file-size cap is enforced (attempt an oversized upload, expect rejection both client-side and — if rules unit tests aren't run — via a raw Firestore write attempt).
  - `parent`: confirm visibility mirrors their child's own view, for each linked child if more than one.
  - **Grading, both modes**: grade one submission in `standalone` mode, confirm it appears in the Results list and factors into a report-card regeneration for that student/subject; grade another in `gradebook` mode with an existing column, confirm it appears correctly in that class/subject/term's actual Gradebook grid with no changes needed there.
  - **Reference-integrity check**: attempt to set a `gradebookColumnId` that belongs to a different class/subject/term than the assignment itself; confirm the write is rejected.

---

## 12. Implementation Order

1. `AssignmentDocument` type extension + `AssignmentForm.tsx` updates (type dropdown, draft/published toggle, attachment upload reusing `imageUpload.ts`'s validation shape, rubric picker, gradingMode + gradebook column picker).
2. `rubrics` collection + a rubric-management UI (list/create/edit a reusable criteria grid) + `firestore.rules` §5.2.
3. `firestore.rules` §5.1 (tightened assignment reads) + §6.1's new composite index — deploy together, since the index must exist before the tightened query goes live.
4. New `list/assignments/[id]/index.tsx` detail page — renders description, attachment download, rubric, and (role-dependent) either the student upload UI or the teacher grading/roster UI.
5. `submissions` + `attempts` collections, `firestore.rules` §5.3, student upload flow.
6. Teacher grading flow, including the `gradebook`-mode `results` write (§4.3) mirroring `performSave()`.
7. Full §11 verification pass, against a disposable QA institution, before any production use.
