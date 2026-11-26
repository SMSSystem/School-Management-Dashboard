# Assignments Feature — Buildout Spec

> **Update 2026-11-04:** rubrics can now hold an uploaded file, and sections 4.4 and 5.2 are extended by `RUBRICS_UPLOAD_SPEC.md`. Students and parents download a rubric from the assignment page; decision 22 still stands.

> **Update 2026-10-09:** the ~500 KB file cap below (decision 13) no longer applies to a **teacher's assignment attachment** uploaded by a teacher or institution admin: a file over 500 KB (up to 5 MB) is kept in the Realtime Database and the assignment holds `attachmentBlobKey` instead of `attachmentDataUrl`. **Student submissions and attempts are unchanged** (500 KB, inline). See `LARGE_ATTACHMENTS_RTDB_SPEC.md`.

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

- **Current `AssignmentDocument`** (`src/lib/firebase.ts:426-442`): `institutionId, termId, termName, subjectId, subjectName, classId, className, teacherId, teacherName, departmentId?, dueDate, description?, createdBy, createdByRole, createdAt`. `departmentId` is already denormalized at write time (`AssignmentForm.tsx:107-122`) specifically so `isSeniorTeacherFor()` can check it without a `get()` — the same pattern this spec reuses for a new `teacherRole` field (§4.1). _(Update: the value is stamped from the author's `users/{uid}.departmentId`. A teacher with no department produced assignments no senior_teacher could match; that is now prevented by requiring a department on teacher accounts and surfaced with warn-only notices — see `ISSUES_AND_GAPS.md` #38. `AssignmentForm` now reads a teacher author's own `users` doc for this, because the all-teachers users query it used before is rejected for teacher callers.)_
- **`AssignmentForm.tsx`** locks the teacher field to self for `regular_teacher`/`senior_teacher` (lines 89-96, 273-279) — an assignment is always self-attributed at creation, never reassigned to someone else. This spec keeps that invariant.
- **Read rule today is permissive, not role-scoped**: `firestore.rules`'s `assignments` block (`:1013-1024` nested; a matching flat block exists too, mid-migration) allows `read: if isSignedIn() && inMyInstitution(institutionId)` — **any signed-in same-institution account, including a student or parent for a different class, can already read every assignment document**. `isSeniorTeacherFor()` currently only gates the **update** rule. Per your explicit choice (§3), this spec tightens reads to match the role visibility you described.
- **Firestore rules don't filter query results — they reject the whole query.** If a `where()` query could return a document a rule would deny, the entire query fails, not just that one document. Every role-scoped query in this spec (§6) is written narrowly enough that it structurally can't return a document its matching rule would reject.
- **Photo-upload precedent** (`docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md`, `src/lib/imageUpload.ts`, `UserPhotoDocument` at `firebase.ts:248-259`): base64 data URL in a Firestore field, with magic-byte sniffing client-side before accepting a file and a `firestore.rules` regex/length check server-side (`isValidPhotoDataUrl()`). This spec's file-attachment fields (§4.1, §4.2) reuse this exact validation shape, extended to document MIME types.
- **Gradebook internals** (`list/gradebook/index.tsx`): `gradebookId` is deterministic — `${classId}_${subjectId}_${termId}` (line 288-291), at path `institutions/{institutionId}/gradebooks/{gradebookId}/columns/{colId}`. A `ResultDocument` only ever appears in the actual Gradebook grid if it carries a matching `gradebookColumnId` (every lookup in that file filters on it, e.g. lines 520, 620, 725). The exact write shape for a gradebook-linked result (`performSave()`, lines 634-659): `{ studentId, studentName, classId, className, termId, institutionId, subjectId, assessmentName, assessmentType, score, maxScore, weight, gradebookColumnId, columnWeight, source: "gradebook", teacherId, teacherName, departmentId, createdAt }`. This spec's grading write (§4.3, "gradebook" mode) copies this shape exactly, using the assignment's own values for `assessmentName` (its title, not the raw column ID, a small deliberate improvement over the existing gradebook UI's own convention) and `assessmentType: 'coursework'`.
- **`student_parents` parent-access pattern**: deterministic doc ID `{parentId}_{studentId}` (`firestore.rules:431`), checked via a direct `exists()` call — no query needed — repeated as the standard parent-read clause across ~17 existing collections' rules. This spec's `assignments`/`submissions`/`rubrics` reads reuse the identical clause.
- **`isSeniorTeacherFor(docDepartmentId)`** (`firestore.rules:104-110`) is department-scoped, not role-filtered — it lets a senior_teacher act on **any** document (their own or another senior_teacher's) in their department, not narrowly "only regular_teacher's." Per your explicit choice (§3 decision 4-alt), this spec does **not** reuse that helper as-is for assignment reads — it's a deliberate, intentional deviation from every other collection in this app (`lessons`, `exams`, `results`, `feedback_comments` all use the department-scoped helper unmodified). Assignments' senior_teacher read/grade access is genuinely narrower: own assignments, plus `regular_teacher`-authored assignments in the same department — **not** other senior_teachers'. This relies on the new denormalized `teacherRole` field (§4.1) rather than `isSeniorTeacherFor()`. Flagged clearly since a future maintainer reading `firestore.rules` top-to-bottom will otherwise reasonably assume every collection follows the same department-scoping convention — this one doesn't.

---

## 3. Resolved Design Decisions

| #   | Decision                       | Choice                                                                                                                                     | Rationale                                                                                                                                                                                                                    |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope                          | Assignments only; Lessons deferred entirely                                                                                                | Lessons has zero real implementation today (stub form) — building it out is a separate effort of comparable size.                                                                                                            |
| 2   | File storage                   | Base64-in-Firestore, matching the existing photo/logo pattern                                                                              | Firebase Storage now requires the Blaze plan even for $0 usage (Feb 2026 policy change) — staying Spark-only means staying with what this app already does.                                                                  |
| 3   | Rubrics                        | Reusable library (`institutions/{id}/rubrics/{rubricId}`), structured criteria grid                                                        | Avoids recreating the same rubric per assignment; matches how rubrics normally work academically (criteria × performance levels × points).                                                                                   |
| 4   | Read-rule tightening           | Yes — real `firestore.rules` enforcement, not just UI/query convention                                                                     | Matches your explicit choice; today's rule is permissive enough that a student could already read another class's assignment directly.                                                                                       |
| 5   | Grading integration            | Assignment grades can be linked into the real Gradebook grid via an existing `gradebookColumnId`, chosen once per assignment               | Not a standalone-only concept — reuses the exact write shape Gradebook's own `performSave()` already produces.                                                                                                               |
| 6   | Column linkage                 | Teacher picks an **existing** gradebook column — none is auto-created                                                                      | Avoids silently proliferating gradebook columns; the teacher stays in control of what appears in their own grid.                                                                                                             |
| 7   | Choice granularity             | Made once per assignment (`gradingMode`), not per individual submission                                                                    | Avoids a partially-linked gradebook column where some students count toward it and others don't.                                                                                                                             |
| 8   | Draft state                    | Yes — `status: 'draft' \| 'published'`                                                                                                     | A teacher can prepare an assignment before students see it.                                                                                                                                                                  |
| 9   | Resubmission                   | Yes, a student may resubmit                                                                                                                | Superseded in part by decision 12 below — that row states the actual retention shape; this row previously contradicted it (corrected during review).                                                                         |
| 10  | Rubric structure               | Structured criteria grid, not free text                                                                                                    | Named criteria rows × performance-level columns with point values.                                                                                                                                                           |
| 11  | Senior_teacher visibility      | Strictly role-filtered — own assignments plus `regular_teacher`-authored ones in the same department; **not** other senior_teachers'       | Matches your literal original phrasing exactly, at the cost of diverging from `isSeniorTeacherFor()`'s existing department-scoped precedent used everywhere else in this app (flagged in §2/§10).                            |
| 12  | Resubmission history           | Full file bytes kept for every historical attempt, not just the current one                                                                | Per your explicit choice — true complete history, traded directly against §8's storage growth.                                                                                                                               |
| 13  | File size cap                  | ~500 KB raw, client-enforced                                                                                                               | Conservative headroom under Firestore's 1 MiB per-document hard limit.                                                                                                                                                       |
| 14  | Retention anchor               | `dueDate`-based, not per-attempt — the whole assignment's submissions/attempts share one `deleteAt`                                        | Avoids the "current" attempt outliving older ones (or vice versa) if attempts each expired on their own `submittedAt` instead.                                                                                               |
| 15  | Retention scope                | Submissions/attempts only — the assignment's own teacher-uploaded attachment is unaffected                                                 | Matches your literal wording; far fewer attachments than submissions, and a teacher's own material isn't the storage-growth driver §8 flagged.                                                                               |
| 16  | 4-month trim mechanism         | A periodically-run admin script, not a scheduled CI workflow                                                                               | Matches this repo's existing `scripts/*.mjs` maintenance-script convention rather than introducing a new kind of automation.                                                                                                 |
| 17  | Student history access         | Real `firestore.rules` restriction — a student's read access never extends to the `attempts` subcollection, only the current state         | Consistent with this spec's established "enforce at the rules layer, not just the UI" philosophy (§3 decision 4).                                                                                                            |
| 18  | `deleteAt` reference integrity | Exact rule-side validation via a new `dueDateTimestamp` field + a fixed 182-day/121-day ("6/4 months") convention, not calendar-month math | Firestore rules can't parse a string into a `Timestamp` or do calendar-month arithmetic — this was the only way to make `deleteAt` actually checkable, matching `gradebookColumnId`'s existing rigor.                        |
| 19  | Deletion tombstone             | A small permanent record survives TTL deletion, distinguishing "never submitted" from "submitted, then aged out"                           | Otherwise both look identical (simply absent) to anything querying for a submission after its 6-month life ends.                                                                                                             |
| 20  | Gradebook conversion scope     | Retroactive — converting rewrites every already-graded student's standalone result, not just future ones                                   | Keeps one assignment's grades consistently in one system rather than permanently split across standalone and gradebook-linked for the same assignment.                                                                       |
| 21  | Gradebook conversion direction | One-way only: standalone → gradebook; the reverse isn't supported                                                                          | Matches your literal wording exactly; a gradebook → standalone path would need its own, separately-designed unlinking/rewrite logic.                                                                                         |
| 22  | Rubric visibility enforcement  | UI-only — rules stay broad, the app never surfaces a rubric independent of an assignment the viewer can already see                        | Real rule-level enforcement would need a denormalized reverse-index array kept in sync across every assignment sharing a rubric — accepted as not worth the complexity, matching the parent-assignment-visibility precedent. |
| 23  | Late-status enforcement        | Server-verified via `expectedSubmissionStatus()`, exact `dueDateTimestamp` boundary, no grace period                                       | Closes the "client could lie about being on time" gap; no existing grace-period convention in this app to deviate from either way.                                                                                           |

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

  // NEW, added while implementing §9's retention validation: the existing
  // `dueDate` field is a plain string (confirmed at firebase.ts:437), and
  // Firestore rules have no built-in way to parse a string into a Timestamp
  // or do calendar-month arithmetic — only fixed-unit durations (weeks/
  // days/hours/...). This Timestamp twin exists purely so rules can compute
  // an expected deleteAt (§5.3, §9.1) at all; `dueDate` itself stays the
  // display value the UI already uses everywhere, unchanged.
  dueDateTimestamp: Timestamp;

  // Attachment — base64, same validated-data-URL shape as UserPhotoDocument.
  // Optional: an assignment may have no attached file (description-only).
  attachmentDataUrl?: string;
  attachmentFileName?: string;
  attachmentMimeType?: string; // 'application/pdf' | '.docx'/'.pptx' MIME | 'image/...'
  attachmentSize?: number; // bytes, pre-base64, for the ~500KB cap check (§8)

  rubricId?: string; // -> institutions/{id}/rubrics/{rubricId}
  // Set once, at the first grade with a rubric: the grid as it was then is kept in assignments/{id}/rubric/frozen
  // (RUBRICS_UPLOAD_SPEC.md section 6.13), and the rubric can't change afterwards.
  rubricFrozenAt?: Timestamp;
  rubricFrozenTitle?: string;

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

  // Retention (§9) — denormalized from the parent assignment's dueDate at
  // write time, same pattern as departmentId/teacherRole elsewhere in this
  // spec. Normally identical across every submission/attempt under one
  // assignment (§3 decision 14: dueDate + 6 months), so the whole
  // assignment's history ages out together — EXCEPT for a late submission,
  // where deleteAt = max(dueDate + 6mo, submittedAt + 6mo) instead (§9.1's
  // late-submission correction), guaranteeing at least a full 6-month
  // window regardless of how late the submission was.
  assignmentDueDate: string;
  deleteAt: Timestamp;
};
```

**Attempt history** — subcollection, full file kept per attempt (per your explicit choice — §3 decision 12):

```
institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}/attempts/{attemptNumber}
```

```ts
export type SubmissionAttemptDocument = {
  attemptNumber: number;
  fileDataUrl: string; // cleared to undefined by the 4-month trim script (§9) — see below
  fileName: string;
  mimeType: string;
  fileSize: number;
  submittedAt: Timestamp;

  // Same retention fields as SubmissionDocument, same shared value per
  // assignment (§3 decision 14) — this is what the TTL policy (§9) and the
  // 4-month trim script actually key off of.
  assignmentDueDate: string;
  deleteAt: Timestamp;
};
```

**Explicit tradeoff, not a silent decision**: this keeps every resubmission's actual file content, not just its metadata — true complete history, per your choice, at the direct cost of multiplying storage by the average number of resubmissions per assignment (quantified in §8). The current/latest attempt's file is duplicated onto the parent `SubmissionDocument` (§4.2 above) as well as its own `attempts/{n}` entry — a small amount of redundancy that keeps "download the current submission" a single-document read rather than requiring a query for the highest `attemptNumber`. This retention isn't indefinite — see §9 for the 4-month metadata-only trim and 6-month auto-delete that bound this growth.

**Tombstone** — a small, permanent record surviving the deletion above (§9.4), written alongside the first submission and updated on every resubmission, never carrying a `deleteAt` of its own:

```
institutions/{institutionId}/assignments/{assignmentId}/submissionTombstones/{studentId}
```

```ts
export type SubmissionTombstoneDocument = {
  studentId: string;
  firstSubmittedAt: Timestamp;
  lastSubmittedAt: Timestamp;
  attemptCount: number;
  wasGraded: boolean;
  // Deliberately no deleteAt/assignmentDueDate — this document is exempt
  // from both TTL policies (§9.1) by design; it's the one thing meant to
  // outlive everything else this section deletes.
};
```

### 4.3 Grading write shape

**Since the rubric scoring work (RUBRICS_UPLOAD_SPEC.md section 6.14):** the submission's grade fields also carry `rubricScores`, `rubricTotal` and `rubricMax` when the grade was scored with the assignment's rubric, and a re-grade without them removes them with `deleteField()`. `feedback` is written when it isn't empty and removed otherwise, so clearing it on a re-grade no longer keeps the old text. The `results` writes below are unchanged.

**Correction from the initial draft**: "standalone" previously meant only writing grade fields onto `SubmissionDocument`, with no `ResultDocument` at all. That silently narrowed what was actually agreed during the brainstorm that preceded this spec — "standalone" was defined there as _"a standalone `ResultDocument`... visible in the Results list and counted toward report cards,"_ explicitly distinguished from "doesn't appear in the Gradebook grid," not from "doesn't exist anywhere outside the submission." Fixed below.

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
  // NEW, added for §4.5's conversion feature: without this, there's no way
  // to later find "every results doc this assignment produced" to rewrite
  // on conversion — auto-ID'd results docs (matching performSave()'s own
  // ref.set(doc(institutionCollection(...,'results')), ...) pattern) carry
  // no assignment linkage otherwise. Single-equality query, no new index.
  assignmentId: assignment.id,
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
  assignmentId: assignment.id, // same addition as standalone mode, §4.5
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

### 4.5 Gradebook conversion — standalone → gradebook, retroactive, one-way

Resolves the "`gradingMode`/`gradebookColumnId` are set once" gotcha the previous draft flagged as an unsolved manual-migration problem. Per your explicit choices: **one-way only** (standalone → gradebook; the reverse isn't supported — §11), and **retroactive** — converting rewrites every already-graded student's standalone result, not just future ones.

**Trigger**: a new action on the assignment detail page (§13 item 4), available to the same roles who could set `gradingMode` in the first place — `isAdminOrAbove()`, the assignment's own teacher, or the in-scope `senior_teacher` (§5.1's role-filtered check, not the pre-existing collection-wide `isSeniorTeacherFor()`). The teacher picks an existing gradebook column, same UI as at creation time (§3 decision 6 — still no auto-created columns).

**What it does**, as one client-side batch:

1. Update `assignments/{assignmentId}`: `gradingMode: 'gradebook'`, `gradebookColumnId: <chosen column>`.
2. Query `institutions/{id}/results` where `assignmentId == assignmentId` (the field just added above, §4.3) — every standalone result this assignment has produced so far.
3. For each, rewrite in place: `gradebookColumnId`, `columnWeight`, `source: 'gradebook'`, **and rescale the score**:
   ```ts
   const rescaledScore = (oldScore / oldMaxScore) * column.maxScore;
   batch.update(resultRef, {
     score: rescaledScore,
     maxScore: column.maxScore,
     gradebookColumnId: column.id,
     columnWeight: column.columnWeight,
     weight: column.columnWeight,
     source: "gradebook",
   });
   ```
   **Why rescaling, not a straight copy**: Gradebook's own grid reads every result under one column against that column's single `maxScore` (§2 — `performSave()` always writes `maxScore: effectiveCol.maxScore`, never a per-result value). A standalone-graded assignment likely used its own, unrelated `maxGrade` (e.g. graded out of 20 while the target column is out of 100) — copying the raw score without rescaling would silently corrupt the percentage the Gradebook grid displays and feeds into the class average.

**No `firestore.rules` changes needed for step 3** — confirmed by reading the existing, pre-existing `results` collection rule (`firestore.rules:1043-1052`, unmodified by this spec): its `allow update` already permits `isAdminOrAbove()`, `isSeniorTeacherFor(departmentId)`, or the result's own `teacherId` to rewrite any field (score, maxScore, gradebookColumnId, columnWeight, source included) with no `hasOnly()` restriction, only the `score <= maxScore` invariant — which the rescaling formula above always satisfies by construction.

**A real boundary worth naming, found while confirming the above**: that pre-existing `results` rule uses the _standard_, department-scoped `isSeniorTeacherFor()` — not this spec's narrower, role-filtered senior*teacher check introduced for `assignments`/`submissions` (§3 decision 11). A senior_teacher blocked by \_this spec's* rules from reading/grading another senior_teacher's assignment could still update that assignment's `results` documents directly, since `results`' own rule was never narrowed to match. Not something this spec fixes — `results` is a pre-existing collection outside this spec's scope — but worth knowing rather than assuming the narrower rule applies transitively.

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

// Retention reference-integrity (§9.1's late-submission correction). "6
// months" is defined as a fixed 182-day duration here, everywhere in §9,
// and on the client that computes the same value at write time — NOT true
// calendar-month arithmetic, which Firestore rules can't express (duration
// units are weeks/days/hours/minutes/seconds/ms/ns only, no months/years).
// Keeping the client and rule computations identically defined is what
// makes an exact equality check below possible at all.
function expectedDeleteAt(institutionId, assignmentId, submittedAt) {
  let dueDateTimestamp = get(/databases/$(database)/documents
    /institutions/$(institutionId)/assignments/$(assignmentId)).data.dueDateTimestamp;
  let sixMonths = duration.value(182, 'd');
  let fromDueDate = dueDateTimestamp + sixMonths;
  let fromSubmission = submittedAt + sixMonths;
  return fromDueDate > fromSubmission ? fromDueDate : fromSubmission;
}

// Found while wiring in expectedDeleteAt() above: §5.3's original draft
// defined assignment()/seniorTeacherMayAct() INSIDE the `submissions` match
// block, then called them from the sibling `attempts` and (§9.4)
// `submissionTombstones` match blocks too — the same nesting mistake
// already caught and fixed once for isValidAttachmentDataUrl() etc. above,
// recurring here because these two were added in an earlier pass, before
// that fix. Moved to the shared top level, parameterized (a match block's
// own path variables aren't in scope from outside it), and reused by all
// three sibling match blocks under one assignment.
function assignmentData(institutionId, assignmentId) {
  return get(/databases/$(database)/documents
    /institutions/$(institutionId)/assignments/$(assignmentId)).data;
}
function seniorTeacherMayActOnAssignment(institutionId, assignmentId) {
  let a = assignmentData(institutionId, assignmentId);
  return myRole() == 'senior_teacher'
    && me().departmentId == a.departmentId
    && a.teacherRole == 'regular_teacher';
}

// Server-side "late" enforcement — previously computed client-side only
// (Gotchas), now a real rule check. Exact dueDateTimestamp boundary, no
// grace period, per your explicit choice — this app has no existing
// grace-period precedent anywhere else in firestore.rules to match either
// way, confirmed via grep before deciding.
function expectedSubmissionStatus(institutionId, assignmentId, submittedAt) {
  let dueDateTimestamp = assignmentData(institutionId, assignmentId).dueDateTimestamp;
  return submittedAt > dueDateTimestamp ? 'late' : 'submitted';
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
      // other collection in this file (see §2/§10).
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
    // Gap found and fixed while implementing §9's expectedDeleteAt() and
    // §5.3's expectedSubmissionStatus(): both depend on reading this field
    // back via assignmentData(), but nothing previously confirmed it was
    // ever actually set (or set to the right type) at write time.
    && request.resource.data.dueDateTimestamp is timestamp
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

**Not validated in rules, deliberately accepted as a gap**: `rubricId` reference integrity (§10) — unlike `gradebookColumnId`, a wrong or dangling `rubricId` doesn't corrupt another class's data, only shows a missing/wrong rubric to whoever opens this assignment. Lower stakes, not worth an extra `get()` per write.

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
  allow read: if isSignedIn() && inMyInstitution(institutionId)
    && (isAdminOrAbove()
        || seniorTeacherMayActOnAssignment(institutionId, assignmentId)
        || assignmentData(institutionId, assignmentId).teacherId == request.auth.uid
        || request.auth.uid == studentId
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + studentId))));

  // Student: create their own submission, or update it (resubmit) — but
  // ONLY the submission fields, never the grade fields. Reuses §5.1's
  // isValidAttachmentDataUrl() — same file-shape rules apply to a student's
  // submitted work as to a teacher's assignment attachment. deleteAt is
  // reference-integrity-checked against expectedDeleteAt() (§9.1's
  // late-submission correction), and status is now server-verified against
  // expectedSubmissionStatus() too — a student can no longer claim
  // 'submitted' for a genuinely late upload by lying about the client-side
  // comparison, closing the gap the original Gotchas entry flagged.
  allow create: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.keys().hasOnly([
         'institutionId','assignmentId','studentId','studentName','classId',
         'currentAttemptNumber','fileDataUrl','fileName','mimeType','fileSize',
         'submittedAt','status','assignmentDueDate','deleteAt'
       ])
    && isValidAttachmentDataUrl(request.resource.data.fileDataUrl)
    && request.resource.data.deleteAt == expectedDeleteAt(institutionId, assignmentId, request.resource.data.submittedAt)
    && request.resource.data.status == expectedSubmissionStatus(institutionId, assignmentId, request.resource.data.submittedAt);
  allow update: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
         'currentAttemptNumber','fileDataUrl','fileName','mimeType','fileSize',
         'submittedAt','status','deleteAt'
       ])
    && isValidAttachmentDataUrl(request.resource.data.fileDataUrl)
    && request.resource.data.deleteAt == expectedDeleteAt(institutionId, assignmentId, request.resource.data.submittedAt)
    && request.resource.data.status == expectedSubmissionStatus(institutionId, assignmentId, request.resource.data.submittedAt);

  // Teacher/admin: grade fields only, never the submitted file itself.
  allow update: if inMyInstitution(institutionId)
    && (isAdminOrAbove()
        || seniorTeacherMayActOnAssignment(institutionId, assignmentId)
        || assignmentData(institutionId, assignmentId).teacherId == request.auth.uid)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
         'grade','maxGrade','feedback','gradedBy','gradedByName','gradedAt','status'
       ]);
}
```

**Correction from the initial draft, verified via web search**: this section previously claimed Firestore rules "don't cache `get()` results across separate calls within one evaluation" and recommended manually caching the assignment lookup in a `let` to avoid redundant billed reads. That's wrong — per [Firebase's own documentation](https://firebase.google.com/docs/firestore/security/rules-conditions), **Firestore automatically deduplicates repeated `get()`/`exists()` calls to the same document within a single rule evaluation**; the deduped calls aren't separately billed, and don't count twice against the 10-call rule-evaluation depth limit either. So `assignmentData(institutionId, assignmentId)` being called from multiple branches of this block (§5.3) — and now also from `expectedDeleteAt()` — costs **one** read per unique document per rule evaluation, not one per call, regardless of how many times it's written in the rule text. The `get()` still happens at least once, still costs one read against the daily quota (§8) — the same documented cost every existing `get()`-based rule in this app already carries (`docs/firebase/MISCELLANEOUS_INFO.md:933`) — the correction is only about repeated calls, not about `get()` being free.

`attempts` subcollection — **read rule does NOT mirror the parent `submissions` doc** (corrected per §3 decision 17): the student's own uid is deliberately excluded from `allow read` here, unlike every other read rule in this spec. A student can read their own current `submissions/{studentId}` doc (§5.3 above) but never the `attempts` subcollection underneath it — that history is visible only to `isAdminOrAbove()`, `seniorTeacherMayActOnAssignment()`, and the assignment's own teacher:

```javascript
match /institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}/attempts/{attemptNumber} {
  allow read: if isSignedIn() && inMyInstitution(institutionId)
    && (isAdminOrAbove()
        || seniorTeacherMayActOnAssignment(institutionId, assignmentId)
        || assignmentData(institutionId, assignmentId).teacherId == request.auth.uid);
    // Deliberately no `|| request.auth.uid == studentId` clause and no
    // parent clause — per §3 decision 17, a student/parent sees only the
    // current state (the submissions/{studentId} doc itself), never the
    // attempt-by-attempt history a teacher can see.
  allow create: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.keys().hasOnly([
         'attemptNumber','fileDataUrl','fileName','mimeType','fileSize',
         'submittedAt','assignmentDueDate','deleteAt'
       ])
    && isValidAttachmentDataUrl(request.resource.data.fileDataUrl)
    && request.resource.data.deleteAt == expectedDeleteAt(institutionId, assignmentId, request.resource.data.submittedAt);
  allow update, delete: if false; // immutable log — even the 4-month trim
    // script (§9) runs as the Admin SDK, which bypasses rules entirely, the
    // same way every other scripts/*.mjs tool in this repo already does.
}
```

---

## 6. Queries and Indexes

### 6.1 Per-role list queries

| Role                              | Query                                                                                        | New composite index needed                      |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `institution_admin`/`super_admin` | `institutions/{id}/assignments`, unfiltered                                                  | None (existing bare listener)                   |
| `regular_teacher`                 | `.where('teacherId','==',uid)`                                                               | None (single equality)                          |
| `senior_teacher`                  | **Two separate queries, merged client-side** — see correction below                          | None (both are equality-only)                   |
| `student`                         | `.where('classId','==',myClassId).where('status','==','published').orderBy('dueDate')`       | **Yes**: `classId ASC, status ASC, dueDate ASC` |
| `parent`                          | Same as student, once per resolved child (§2's fan-out pattern via `useLinkedStudentIds.ts`) | Reuses the student index above                  |

**Correction from the initial draft**: a single `.where('departmentId','==',myDept)` query for `senior_teacher` was proposed originally, with "the UI splits mine vs. my department's" — but that doesn't match §5.1's actual rule (§3 decision 11), which additionally requires `teacherRole == 'regular_teacher'` for the department-based clause. Per this doc's own repeated point (§2, §10): **a Firestore query fails entirely if it could return even one document its rule would deny — it doesn't silently filter that document out.** A bare `departmentId` query would return other senior*teachers' assignments in that department too, which the rule denies, so the \_whole query* would fail the moment such a document exists. Corrected to two queries, run in parallel and merged client-side:

```ts
query(assignmentsRef, where("teacherId", "==", uid)); // own
query(
  assignmentsRef,
  where("departmentId", "==", myDept),
  where("teacherRole", "==", "regular_teacher"),
); // dept's regular_teacher-authored
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
  - **Partially addressed, per §9's retention design — corrected 2026-09-29**: this was originally written assuming both halves of §9 would be active. Per the decision recorded in §9.1, **TTL was never enabled**, so only the 4-month metadata trim actually runs. That still roughly halves the _file-bytes_ footprint (full files only exist for the most recent 4 months of any assignment's life), which is the dominant cost in the ~135 MB/term worked example above — but the metadata-only documents left behind after trimming are never deleted, so growth is **reduced, not bounded**. Small per-document overhead (a few hundred bytes each) accumulates indefinitely instead of stopping at a fixed ceiling. At this project's realistic scale that's a slow, low-risk drift rather than an acute problem, but it's a real, permanent departure from this section's original "bounded" claim — worth monitoring actual Firebase Console storage usage over the long run, not just after initial ship.

---

## 9. Retention & Cleanup

Resolves the "no deletion/archival mechanism" gap the previous drafts of this spec flagged as its single most consequential open item.

### 9.1 Auto-delete at 6 months — native Firestore TTL, no Cloud Functions

> **Decision (post-implementation, 2026-09-29): TTL will NOT be enabled for this feature.** The two `gcloud firestore fields ttls update ... --enable-ttl` commands below were never run, and per an explicit operator choice, won't be. This section is kept as-is to document the originally designed mechanism and why it was chosen, but it describes a policy that isn't active. **Real consequence**: only §9.2's trim script actually runs — it still strips `fileDataUrl`/`mimeType` at the 4-month mark, but without TTL nothing ever deletes the resulting metadata-only `submissions`/`attempts` documents. Storage growth is _reduced_ by this feature, not _bounded_ the way the rest of this section assumes — see the corrected note in §8. If TTL is ever revisited, first re-verify (empirically, against the real project, not via documentation search — see the still-unresolved uncertainty this decision was made under) whether it requires billing/Blaze despite this section's original claim.

Confirmed via web search at the time this was written: **Firestore has a native TTL (time-to-live) policy feature, available and fully functional on the Spark plan, that requires no Cloud Functions and no cron job** ([source](https://firebase.google.com/docs/firestore/ttl)). A TTL policy designates one timestamp field on a collection (or collection group); Firestore deletes matching documents automatically, typically within ~24 hours of that timestamp passing. TTL deletes count against the normal 20,000 deletes/day quota — trivial at this project's scale. **This claim was not re-confirmed with confidence during the pre-PR review pass (2026-09-29)** — a follow-up web search produced conflicting signals about whether enabling TTL actually requires a linked Blaze billing account, and it was never tested against the real project before the decision above was made to not enable it at all.

Two TTL policies needed, one per collection group (this app already declares `queryScope: "COLLECTION_GROUP"` indexes elsewhere, e.g. `firestore.indexes.json`'s `activity_log`/`audit_log` entries — the same collection-group concept, just a different Firestore feature):

- `submissions` collection group, field `deleteAt`.
- `attempts` collection group, field `deleteAt`.

Per §3 decision 14, `deleteAt` is computed **from the assignment's own `dueDate` (+ 6 months)**, and denormalized identically onto the parent `SubmissionDocument` and every one of its `attempts/{n}` documents at write time — not from each attempt's own `submittedAt` alone. This means every piece of one assignment's submission history (current state + every past attempt, for every student) _normally_ expires at the same real-world moment, regardless of when any individual resubmission actually happened — avoiding the alternative's odd failure mode (an older attempt outliving a newer one, or the "current" doc vanishing while stale attempt history lingers).

**Late-submission correction, found during review**: a pure `dueDate + 6mo` anchor has a real edge case — a submission made well after its assignment's due date (e.g. 5 months late) would get a `deleteAt` only weeks away, or already passed, denying it anything close to a fair 6-month retention window. Fixed: `deleteAt = max(dueDate + 6 months, submittedAt + 6 months)`, computed per submission/attempt at write time. On-time submissions still group together under the `dueDate` anchor (the common case, and the one decision 14 was designed around); a genuinely late one gets its own later `deleteAt` instead, guaranteeing every submission — on time or not — gets at least a full 6 months before it's eligible for deletion.

Per §3 decision 15, this applies **only** to `submissions`/`attempts` — an assignment's own `attachmentDataUrl` (the teacher's uploaded material) is untouched and persists indefinitely.

**Grade persistence, confirmed explicitly rather than left implicit**: the `results` document written at grading time (§4.3, either mode) is a separate, independent collection — neither the TTL policies above nor the trim script (§9.2) ever touch it. A student's grade, once recorded, persists indefinitely in the Results list / Gradebook / report cards even after their underlying submission file (and eventually the submission record itself) is gone. This is the intended behavior: the academic record outlives the raw file it was based on.

### 9.2 4-month metadata-only trim — a periodically-run script, not native automation

Firestore's TTL feature can only delete a _whole document_ — it cannot strip a single field on a schedule. Per §3 decision 16, this is a new maintenance script, `scripts/trim-old-submission-attachments.mjs`, following this repo's existing `scripts/*.mjs` convention (Admin SDK, `--dry-run`/`--key=` flags, matching `backfill-department-ids.mjs`'s shape):

```js
// Runs as the Admin SDK — bypasses firestore.rules entirely, same as every
// other scripts/*.mjs tool (§5.3's "attempts" block explicitly notes this).
//
// "6 months"/"4 months" are fixed 182-day/121-day durations here, matching
// §5.1's expectedDeleteAt() rule exactly (Firestore rules have no calendar-
// month arithmetic — see that function's own comment) — this script must
// use the identical definition, or its query would drift out of sync with
// what the rule actually stamped onto each document's own deleteAt.
//
// NOT "four months from now" despite what a shorter name might suggest —
// this is the deleteAt CUTOFF that corresponds to "dueDate + 121d has
// already passed": since deleteAt = dueDate + 182d, "dueDate + 121d <= now"
// algebraically rearranges to "deleteAt <= now + 61d" (182 - 121 = 61). A
// variable literally named `fourMonthsFromNow` in an earlier draft computed
// `now + 2 months`, which was directionally correct but a genuine footgun
// for anyone implementing from the name alone instead of the math —
// renamed, and the offset itself corrected to the exact 61-day figure now
// that "6 months"/"4 months" are fixed, defined quantities rather than
// approximate ones.
const deleteAtCutoffForFourMonthTrim = new Date(
  Date.now() + 61 * 24 * 60 * 60 * 1000,
);

const snap = await db
  .collectionGroup("attempts")
  .where("deleteAt", "<=", deleteAtCutoffForFourMonthTrim)
  .get();

for (const doc of snap.docs) {
  if (!("fileDataUrl" in doc.data())) continue; // already trimmed — idempotent
  await doc.ref.update({
    fileDataUrl: FieldValue.delete(),
    mimeType: FieldValue.delete(),
  });
  // fileName/fileSize/submittedAt/attemptNumber/deleteAt/assignmentDueDate
  // all stay — this is a metadata-only trim, not a delete.
}
```

Also trims the parent `SubmissionDocument` when its `currentAttemptNumber` is the affected one — otherwise the parent doc's own duplicated copy of the file (kept for the single-document-read convenience noted in §4.2) would outlive the `attempts` subcollection's own trimmed copy.

**A new collection-group index is needed** for this script's query (`firestore.indexes.json`, matching the existing `activity_log`/`audit_log` collection-group entries' shape):

```json
{
  "collectionGroup": "attempts",
  "queryScope": "COLLECTION_GROUP",
  "fields": [{ "fieldPath": "deleteAt", "order": "ASCENDING" }]
}
```

Per §3 decision 16, this script is **run manually, on whatever cadence the operator chooses** — not wired to any scheduler. Idempotent (re-running skips already-trimmed documents via the `fileDataUrl in doc.data()` check), matching the idempotency discipline every other backfill-style script in this repo already follows.

### 9.3 Student history access — real rules restriction, not a UI convention

Per §3 decision 17, a student's own read access never extends to the `attempts` subcollection — only `submissions/{studentId}` itself (the current state). Full attempt-by-attempt history remains visible to `institution_admin`/`super_admin`, the in-scope `senior_teacher`, and the assignment's own teacher (§5.3). This is the one place in this spec where a student and their own data's full history genuinely diverge — a deliberate choice, not an oversight, matching your explicit requirement that only the grading roles retain full resubmission visibility.

### 9.4 Tombstone — surviving the deletion above

Found during review: TTL deletion is a hard delete with no hook — nothing runs at the moment Firestore removes a document (no Cloud Functions `onDelete` trigger available on Spark). Without something written _in advance_, "this student never submitted" and "this student submitted, but it aged out 6 months ago" become indistinguishable once the real data is gone — both simply look absent to anything that queries for them later.

Fixed with a `SubmissionTombstoneDocument` (§4.2) — written the first time a student submits, updated (not replaced) on every resubmission, and **exempt from both TTL policies by design** (no `deleteAt` field at all):

- On first submission: create `submissionTombstones/{studentId}` with `firstSubmittedAt`, `lastSubmittedAt`, `attemptCount: 1`, `wasGraded: false`.
- On resubmission: update `lastSubmittedAt` and increment `attemptCount`.
- On grading: flip `wasGraded: true`.

This is a small, file-free record, kept for as long as its assignment (deleting an assignment removes its tombstones too, ISSUES_AND_GAPS #85) — negligible storage cost even summed across every student and assignment in an institution's lifetime, unlike everything else this section is designed to bound. A future "this student submitted late work back in March, though the file has since been cleaned up" view reads this document, not the (by then, deleted) `submissions`/`attempts` ones.

**Rules** — same read visibility as the submission it shadows (admin/senior_teacher(dept)/own teacher/the student themselves/their parent), write restricted to the student incrementing their own record:

```javascript
match /institutions/{institutionId}/assignments/{assignmentId}/submissionTombstones/{studentId} {
  allow read: if isSignedIn() && inMyInstitution(institutionId)
    && (isAdminOrAbove()
        || seniorTeacherMayActOnAssignment(institutionId, assignmentId)
        || assignmentData(institutionId, assignmentId).teacherId == request.auth.uid
        || request.auth.uid == studentId
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + studentId))));
  allow create: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.keys().hasOnly(['studentId','firstSubmittedAt','lastSubmittedAt','attemptCount','wasGraded'])
    && request.resource.data.attemptCount == 1;
  allow update: if myRole() == 'student' && request.auth.uid == studentId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastSubmittedAt','attemptCount'])
    && request.resource.data.attemptCount == resource.data.attemptCount + 1;
  // wasGraded flips via the same grading-role update rule pattern as
  // submissions/{studentId} (§5.3) — omitted here for brevity, same shape.
  allow delete: if false; // as first written; since ISSUES_AND_GAPS #85 an administrator may delete it with its assignment
}
```

---

## 10. Gotchas & Nuances

- **"Standalone" grading now means "a plain `ResultDocument`, not gradebook-linked" — not "no `ResultDocument` at all," corrected in §4.3.** The initial draft only wrote grade fields onto the submission itself in standalone mode, which would have made a standalone-graded assignment invisible to the Results list and report-card generation — narrower than what was actually agreed in the brainstorm preceding this spec. Fixed by writing a `results` doc with `assessmentType: 'coursework'` and no `gradebookColumnId`/`source`, which `generateReportCard.ts`'s existing `computeCWGrade()` path already averages in automatically (§2, §4.3) — no changes needed to that file.
- **The ~500 KB file cap is a hard practical limit on what "upload a document" can mean here.** A multi-page scanned assignment, a large slide deck, or an uncompressed Word doc with embedded images will very plausibly exceed it. This is the direct, accepted cost of staying Spark-only post-February-2026 (§1) — not a bug to fix later, a boundary to communicate to actual users of the feature.
- **Assignments' senior_teacher rule intentionally diverges from `isSeniorTeacherFor()`'s precedent used everywhere else in this app** (§2, §5.1) — role-filtered (own + `regular_teacher`'s in-department only), not department-scoped (which would also include other senior_teachers'). A future maintainer reading `firestore.rules` top-to-bottom and assuming every collection follows the same convention will be wrong about this one specifically — worth a code comment at the rule site itself (already included in §5.1's snippet) and not just this doc.
- **Firestore rules reject whole queries, not individual documents** (§2) — every query in §6.1 is written to be structurally incapable of returning a document its own rule would deny, which is why e.g. the student query includes `.where('status','==','published')` explicitly rather than relying on the rule alone to hide drafts.
- **TTL deletion isn't instant** (§9.1) — Firestore's own documentation describes it as happening within roughly 24 hours of the `deleteAt` timestamp passing, not the moment it passes. A submission/attempt due to expire "at 6 months" could realistically still exist for up to a day past that point — fine for this feature's purpose (nothing time-critical depends on the exact deletion instant), but worth knowing so a QA check isn't run expecting immediate removal.
- **The 4-month trim only happens if someone actually runs the script** (§9.2, §3 decision 16) — unlike the 6-month deletion (native, automatic TTL), there's no automatic trigger here. If the script is never run, storage simply keeps the full file for the entire 6-month life of a submission instead of the intended ~4 months — a silent, gradual regression in the §8 storage math, not a hard failure. Worth an operational reminder (a recurring calendar note, at minimum) rather than assuming it'll happen on its own.
- **The 4-month/6-month split only matters between those two marks** — a submission graded and otherwise inactive for its full 6-month life gets exactly one intervention (the trim) before deletion; there's no "3-month" or "5-month" checkpoint, just the two decision points already designed.
- **Resubmission history keeps every attempt's full file, not just metadata** (§4.2, §3 decision 12) — true complete history, per your explicit choice, at the direct, quantified storage cost worked through in §8. This is the single biggest storage-growth decision in this spec.
- **`gradingMode`/`gradebookColumnId` are no longer permanently fixed at creation** — resolved by §4.5's conversion feature: standalone → gradebook is now a supported, one-way, retroactive action. The reverse (gradebook → standalone) remains unsupported (§11) — a teacher who links an assignment to the Gradebook grid can't unlink it again through this feature.
- **`gradebookColumnId` is now reference-integrity-checked** (§5.1's `gradebookColumnBelongsToAssignment()`), but **`rubricId` deliberately isn't** — a dangling or wrong `rubricId` shows a missing/wrong rubric on one assignment; a wrong `gradebookColumnId` would silently write grades into a different class's gradebook. Different failure severities, different amount of validation effort spent.
- **Rubric read access is broad at the rules layer, narrowed only by the UI** (§5.2, §4.4) — any signed-in same-institution account can, at the rules level, read any rubric in the library by ID. Per your explicit choice, a real rules-level fix (a denormalized `visibleToClassIds`-style array, kept in sync across every assignment that attaches/detaches a shared rubric) was considered and not taken, given a rubric can legitimately be reused across many assignments/classes and rules can't do a reverse "which assignments reference me" lookup at all. **The app itself never exposes a rubric independent of an assignment the viewer can already see** — there is no "browse all rubrics" UI for student/parent roles, and the rubric picker/display component only ever resolves a `rubricId` reached through an assignment already fetched through the (rules-enforced) assignment visibility check. This is the same "broader rule, narrower UI" pattern already used for parent-assignment visibility — not a gap unique to rubrics.
- **A submission's `'late'` status is now server-enforced** (§5.3's `expectedSubmissionStatus()`), resolved from client-only computation. Exact `dueDateTimestamp` boundary, no grace period — a submission timestamped even one second after the deadline is `'late'`, with no buffer for client/server clock skew. This app has no existing grace-period precedent anywhere else in `firestore.rules` to match either way (confirmed via grep before deciding), so this isn't a deviation from some established convention — there simply isn't one yet.
- **Rules `get()` calls still cost a real read, just not a redundant one** — corrected in §5.3: Firestore automatically dedupes repeated `get()`/`exists()` calls to the same document within one rule evaluation, so calling `assignmentData()` from multiple branches (now including `expectedSubmissionStatus()` and `expectedDeleteAt()` too) costs one read, not several. The `get()` itself is still a real, billed read against the daily quota (§8) the first time it happens.

---

## 11. Explicitly Out of Scope

- **Lesson notes** — deferred per §3 decision 1; `LessonForm.tsx` remains the non-functional stub it is today.
- **Notifications** (e.g. "your assignment was graded") — no existing notification system in this app to hook into; out of scope.
- **Department-scoped (rather than strictly role-filtered) senior_teacher visibility** — §3 decision 11 chose the strict, role-filtered interpretation over reusing `isSeniorTeacherFor()`'s existing department-scoped precedent; the more consistent-with-existing-code alternative was considered and explicitly not chosen.
- **Metadata-only retention _before_ the 4-month mark** — §3 decision 12 (full file retention) plus §9.2's 4-month trim means every attempt keeps its full file for its first ~4 months regardless of resubmission frequency; an earlier, more aggressive metadata-only-from-day-one alternative was considered and not chosen.
- **A fully automatic 4-month trim** — §3 decision 16 chose a manually-run script over a scheduled trigger (e.g. GitHub Actions cron); the trim only happens when someone actually runs it.
- **`rubricId` reference-integrity validation** — added for `gradebookColumnId` (§5.1) but deliberately not for `rubricId`, given the lower stakes of a dangling reference there (§10).
- **Rule-level rubric visibility scoping** — §3 decision 22 chose UI-only enforcement over a denormalized `visibleToClassIds`-style reverse-index array; the rules-level version was considered and explicitly not taken, given the sync-consistency complexity of a rubric shared across multiple assignments.
- **Gradebook → standalone reverse conversion** — §3 decision 21/§4.5 chose one-way only; unlinking an assignment from the Gradebook grid back to standalone isn't supported.
- **A grace period on late-status enforcement** — §3 decision 23 chose an exact `dueDateTimestamp` boundary; a buffer for clock skew was considered and not added, absent any existing precedent for one elsewhere in this app.

---

## 12. Testing Considerations

- **Static**: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build` — the standing gate, unchanged.
- **Rules unit tests** (if this repo adopts the Firebase Rules Unit Testing SDK for this feature — not currently used elsewhere in this repo, worth confirming before assuming it's the right tool): `isValidAttachmentDataUrl()` (valid PDF/DOCX/PPTX/image data URLs pass; oversized or wrong-MIME strings fail), `isValidAssignmentType()` (all 16 values pass, arbitrary strings fail), `gradebookColumnBelongsToAssignment()` (a column from the _correct_ class/subject/term passes; the same `colId` under a _different_ class/subject/term fails).
- **Per-role manual verification**, against a disposable QA institution, matching this project's established discipline (never against a real institution first):
  - `institution_admin`: create an assignment with an attachment, a rubric, and `gradingMode: 'gradebook'`; confirm it's visible to every role per §7's matrix.
  - `regular_teacher`: create own assignment (self-attributed, unchangeable); confirm inability to read/grade another teacher's assignment or submissions.
  - `senior_teacher`: confirm visibility of own + same-department `regular_teacher`'s assignments; confirm a same-department **other senior_teacher's** assignment is genuinely not visible (§3 decision 11) — this is the one case worth double-checking carefully, since it's the one rule in this spec that deviates from every other collection's convention.
  - `student`: confirm a draft assignment is invisible; confirm a published one in their own class is visible and a different class's is not; upload a submission, confirm resubmission preserves history (§4.2) _for the teacher's view_, but that the student's own read attempt against the `attempts` subcollection is denied (§3 decision 17, §9.3) — the student should only ever see their own current `submissions/{studentId}` doc; confirm the file-size cap is enforced (attempt an oversized upload, expect rejection both client-side and — if rules unit tests aren't run — via a raw Firestore write attempt).
  - `parent`: confirm visibility mirrors their child's own view, for each linked child if more than one.
  - **Grading, both modes**: grade one submission in `standalone` mode, confirm it appears in the Results list and factors into a report-card regeneration for that student/subject; grade another in `gradebook` mode with an existing column, confirm it appears correctly in that class/subject/term's actual Gradebook grid with no changes needed there.
  - **Reference-integrity check**: attempt to set a `gradebookColumnId` that belongs to a different class/subject/term than the assignment itself; confirm the write is rejected.
  - **Retention (§9)**: create an assignment with a `dueDate` in the past (e.g. backdated during QA setup) so its computed `deleteAt`/4-month-trim-window falls immediately; confirm the TTL policy actually removes the expected `submissions`/`attempts` documents (allow up to ~24 hours per Firestore's own TTL timing, not immediate); run `trim-old-submission-attachments.mjs` in `--dry-run` then live against that same backdated assignment, confirm `fileDataUrl`/`mimeType` are cleared on both the `attempts` doc and the parent `submissions` doc (if it was the current attempt) while `fileName`/`fileSize`/`submittedAt` survive; re-run the script a second time, confirm it's a no-op (idempotency).
  - **Tombstone (§9.4)**: confirm a `submissionTombstones/{studentId}` doc exists immediately after first submission, `attemptCount` increments on resubmission, `wasGraded` flips on grading, and — after the backdated assignment's TTL deletion above actually runs — confirm the tombstone alone survives while `submissions`/`attempts` are gone.
  - **Late-status enforcement (§5.3, §3 decision 23)**: attempt a raw Firestore write (bypassing the app's own client-side check) setting `status: 'submitted'` on a submission whose `submittedAt` is after the assignment's `dueDateTimestamp`; confirm the rule rejects it. Confirm a genuinely on-time submission with `status: 'late'` is equally rejected — the check must work in both directions, not just the abuse direction.
  - **Gradebook conversion (§4.5)**: grade at least two students standalone under one assignment, then convert to `gradebook` mode with an existing column whose `maxScore` differs from the original standalone `maxGrade`; confirm both students' `results` docs are rewritten with `gradebookColumnId` set and the score correctly rescaled (not a raw copy) to the new `maxScore`; confirm both now appear correctly in that class/subject/term's actual Gradebook grid; confirm a student graded _after_ the conversion goes straight to gradebook mode with no separate step.

---

## 13. Implementation Order

1. `AssignmentDocument` type extension + `AssignmentForm.tsx` updates (type dropdown, draft/published toggle, attachment upload reusing `imageUpload.ts`'s validation shape, rubric picker, gradingMode + gradebook column picker).
2. `rubrics` collection + a rubric-management UI (list/create/edit a reusable criteria grid) + `firestore.rules` §5.2.
3. `firestore.rules` §5.1 (tightened assignment reads) + §6.1's new composite index — deploy together, since the index must exist before the tightened query goes live.
4. New `list/assignments/[id]/index.tsx` detail page — renders description, attachment download, rubric, and (role-dependent) either the student upload UI or the teacher grading/roster UI.
5. `submissions` + `attempts` collections, `firestore.rules` §5.3, student upload flow.
6. Teacher grading flow, including the `gradebook`-mode `results` write (§4.3) mirroring `performSave()`.
7. TTL policies (§9.1) + the 4-month trim script (§9.2) — configure and test against a disposable QA institution's own assignments/submissions, not real data first.
8. Gradebook conversion action (§4.5) — depends on step 6's `assignmentId` field already existing on every `results` write, so this can't ship before standalone grading itself does.
9. Full §12 verification pass, against a disposable QA institution, before any production use.
