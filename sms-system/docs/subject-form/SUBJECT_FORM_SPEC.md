# SubjectForm Implementation Specification

> **Purpose:** Authoritative reference for implementing SubjectForm and all downstream changes that deploy atomically with it. Records every design decision, justification, trade-off, data model definition, code template, and implementation detail agreed during planning. Read this before implementing any item.
>
> **Date documented:** 2026-06-10
> **Last updated:** 2026-06-11
> **Branch:** `post-mvp-additions`
> **Status:** Complete — all changes deployed as of 2026-06-11.

Cross-references: [`POST_MVP_ADDITIONS_SPEC.md`](./POST_MVP_ADDITIONS_SPEC.md) · [`REPORT_CARD_SPEC.md`](./REPORT_CARD_SPEC.md) · [`ATTENDANCE_REGISTER_SPEC.md`](./ATTENDANCE_REGISTER_SPEC.md)

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Pre-Implementation State](#2-pre-implementation-state)
3. [Data Model — `users` and `teachers` Collections](#3-data-model--users-and-teachers-collections)
4. [SubjectDocument — Canonical Firestore Schema](#4-subjectdocument--canonical-firestore-schema)
5. [SubjectForm UI — All Fields](#5-subjectform-ui--all-fields)
6. [SubjectForm Submit Handler](#6-subjectform-submit-handler)
7. [Subjects List Page Updates](#7-subjects-list-page-updates)
8. [Downstream Form Changes](#8-downstream-form-changes)
   - [8.1 ResultForm](#81-resultform)
   - [8.2 FeedbackCommentForm](#82-feedbackcommentform)
9. [Firebase Security Rules — Stage 2](#9-firebase-security-rules--stage-2)
10. [TypeScript Types](#10-typescript-types)
11. [Atomic Deployment Constraints](#11-atomic-deployment-constraints)
12. [Implementation Order](#12-implementation-order)
13. [Files Affected](#13-files-affected)
14. [Deferred Items](#14-deferred-items)

---

## 1. Feature Overview

"SubjectForm wiring" means: implement SubjectForm so it writes the agreed canonical `subjects/{id}` document shape to Firestore on both create and update. The current form is a stub — it only logs to the console.

SubjectForm wiring is the single highest-leverage change in the codebase. Once it ships:

- **`regular_teacher` access scoping becomes functional** (POST_MVP_ADDITIONS_SPEC items 8/9/10 Stage 2) — results, feedback, and student visibility are enforced both client-side and via Firestore rules, rather than being client-side only with empty lists in live mode.
- **Report Card Phase 2 is unblocked** — the subjects table requires `cwWeight`, `examWeight`, `teacherNames`, and `classIds` on subject documents.
- **`subjectId` denormalization** onto results and feedback documents enables Firestore rule enforcement that would otherwise require a multi-collection join (which Firestore rules cannot perform).
- **Assessment type classification** (`assessmentType: 'coursework' | 'exam'` on results) becomes meaningful, as it pairs with `cwWeight`/`examWeight` to compute Course Work and Exam Grade columns on the report card.
- **Conduct grade and comment number** on feedback comments become collectible, as they pair with the subject structure to populate report card rows.

SubjectForm wiring, the downstream ResultForm and FeedbackCommentForm changes, and the Firestore rule tightening **must all be deployed atomically** in a single release. See [§11 Atomic Deployment Constraints](#11-atomic-deployment-constraints).

---

## 2. Pre-Implementation State

> This section describes the codebase as it existed before the deployment on 2026-06-11. It is retained as historical context.

### SubjectForm.tsx

[`src/components/forms/SubjectForm.tsx`](../src/components/forms/SubjectForm.tsx) is a confirmed stub (66 lines):

- Collects only `name` (required, 2–100 chars) and `description` (optional, max 500 chars).
- `onSubmit` is `console.log(data)` — it **never writes to Firestore**.
- No `institutionId`, no class scope, no teacher assignment, no weights.
- No loading of live data for dropdowns.

### Subjects list page

[`src/scenes/(dashboard)/list/subjects/index.tsx`](../src/scenes/(dashboard)/list/subjects/index.tsx) has a live Firestore `onSnapshot` listener and a working create/edit/delete button set for admin roles. In live mode, no real subject documents exist because SubjectForm has never written any. The Teachers column renders `item.teachers ?? []` — an array of display names from mock data. In live mode this will need to read `teacherNames`.

### TypeScript types

No `SubjectDocument` type exists anywhere in the codebase. The subjects list page defines a local type:

```typescript
type Subject = {
  id: string;
  name: string;
  institutionId?: string;
  teachers?: string[];  // display names; mock-data shape only
};
```

This local type does not represent the live document shape and must be replaced.

### Mock data

`subjectsData` in `src/lib/data.ts` (10 entries) uses `{ id, name, teachers: string[] }` where `teachers` is an array of display names. This is display-only mock data that does not represent the live document schema.

### Downstream forms

Both `ResultForm` and `FeedbackCommentForm` are fully wired to Firestore for create and update. Neither has a `subjectId` field, an `assessmentType` field (ResultForm), or `conductGrade`/`commentNumber` fields (FeedbackCommentForm). All of these additions are part of the atomic SubjectForm deployment.

---

## 3. Data Model — `users` and `teachers` Collections

### Dual-collection architecture

The codebase uses two parallel collections keyed by the same Firebase Auth UID:

| Collection | Purpose | Key fields |
| --- | --- | --- |
| `users/{uid}` | Authentication, role, contact, and display data for all account types | `role`, `name`, `institutionId`, `phone`, `address`, `status` |
| `teachers/{uid}` | Teacher-specific profile data | `departmentId`, `teacherType` |

Both documents share the same UID. `DepartmentDocument.headTeacherId` and `ClassDocument.classTeacherId` in `src/lib/firebase.ts` both note "links to `teachers/{uid}`" — confirming this collection is intentional, not a leftover schema name.

`ResultForm` (line 50) and `FeedbackCommentForm` (line 32) both call `getDoc(doc(db, "teachers", user.uid))` to fetch `departmentId`. This is correct — `departmentId` lives on the `teachers` document, not on `users`.

### Implication for SubjectForm

**Teacher list queries target `users`.** For the SubjectForm teacher multi-select, the source of truth for listing teachers and their display names is the `users` collection:

```typescript
query(
  collection(db, 'users'),
  where('role', '==', 'regular_teacher'),
  where('institutionId', '==', institutionId),
)
```

The UIDs and display names retrieved from `users` are what get stored in `teacherIds` and `teacherNames` on the subject document. The `teachers/{uid}` collection provides extended profile data (departmentId) but is not the source for listing.

### The `teachers` reference in ResultForm and FeedbackCommentForm

The `getDoc(doc(db, "teachers", user.uid))` call to fetch `departmentId` is correct given the dual-collection architecture. These references are not leftover errors — they access a real collection. They should be left unchanged when SubjectForm ships.

---

## 4. SubjectDocument — Canonical Firestore Schema

This is the agreed canonical shape for `subjects/{id}` documents. SubjectForm must write exactly these fields.

```typescript
// src/lib/firebase.ts — add this type
export type SubjectDocument = {
  name: string;
  description?: string;
  institutionId: string;

  // Class association
  classScope: 'institution' | 'class';
  // 'institution' → subject applies to all students in the institution
  // 'class'       → subject applies only to students in classIds
  classIds: string[];     // UIDs of associated classes; always [] when classScope === 'institution'
  classNames: string[];   // denormalized display names written at save time

  // Teacher assignment
  teacherIds: string[];   // Firebase Auth UIDs from users collection
  teacherNames: string[]; // denormalized display names written at save time

  // Grade weighting (required for Report Card Phase 2)
  cwWeight: number;       // 0–100; percentage of Final Grade from Course Work
  examWeight: number;     // 0–100; cwWeight + examWeight must equal 100

  // Metadata
  createdAt: Timestamp;
  createdBy: string;      // uid of institution_admin or super_admin
  updatedAt: Timestamp;
  updatedBy: string;
};
```

### Why `classScope` + `classIds` instead of `classIds` alone

An empty `classIds: []` is ambiguous — it could mean "institution-wide" or "not yet configured". The explicit `classScope` field makes intent unambiguous. When `classScope === 'institution'`, `classIds` is always empty and is ignored in all filtering and rule logic.

### Why `cwWeight` and `examWeight` ship with the initial SubjectForm

Since SubjectForm is already deferred to the Phase 2 deployment window, there is no benefit to shipping it in two rounds. Including `cwWeight` and `examWeight` from day one means institutions can configure subject weights immediately when the deployment lands. Adding them in a second patch would require SubjectForm to be modified twice with no interim user value.

Both fields are always shown in the form UI, regardless of deployment phase. An institution_admin configuring a subject now is also configuring it for the report card.

### Edge cases: `cwWeight` and `examWeight`

- `cwWeight: 0, examWeight: 100` → exam-only subject. Valid. CW Grade shows "—" on the report card.
- `cwWeight: 100, examWeight: 0` → coursework-only subject. Valid. Exam Grade shows "—".
- The only invariant: `cwWeight + examWeight === 100`.

---

## 5. SubjectForm UI — All Fields

### Field list

| # | Field | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| 1 | Subject Name | Text input | Yes | 2–100 chars; existing |
| 2 | Description | Textarea | No | Max 500 chars; existing |
| 3 | Class Scope | Radio (2 options) | Yes | "Entire Institution" / "Specific Class(es)" |
| 4 | Classes | Multi-select | Conditional | Required when scope = Specific Class(es); populated from live `classes` |
| 5 | Teachers | Multi-select | No | Populated from live `users` (role = regular_teacher); can be empty |
| 6 | Course Work Weight (%) | Number input | Yes | 0–100; integer |
| 7 | Exam Weight (%) | Number input | Yes | 0–100; integer; `cwWeight + examWeight` must equal 100 |

### Field 3 — Class Scope radio

Two options, both visible at all times:

- **"Entire Institution"** → sets `classScope: 'institution'`, `classIds: []`, `classNames: []`
- **"Specific Class(es)"** → sets `classScope: 'class'`; the Classes multi-select (field 4) becomes visible and required

Default: "Entire Institution".

### Field 4 — Classes multi-select

Visible only when "Specific Class(es)" is selected. Populated via a live `onSnapshot` on:

```typescript
query(
  collection(db, 'classes'),
  where('institutionId', '==', institutionId),
)
```

Each option shows the class name. The multi-select stores `classIds` (UIDs) and `classNames` (display names) as parallel arrays.

Validation: if scope is "Specific Class(es)" and no class is selected, Zod fails: "Select at least one class."

### Field 5 — Teachers multi-select

Always visible. Populated via a live `onSnapshot` on:

```typescript
query(
  collection(db, 'users'),
  where('role', '==', 'regular_teacher'),
  where('institutionId', '==', institutionId),
)
```

Each option shows the teacher's display name. The multi-select stores `teacherIds` (UIDs) and `teacherNames` (display names) as parallel arrays.

Not required — a subject can exist without assigned teachers (e.g., while being set up). However, a `regular_teacher` without a subject assignment will see empty filtered lists in the results, feedback, and students pages in live mode.

### Fields 6 and 7 — Course Work Weight and Exam Weight

Two number inputs side by side. Both always visible.

A live sum indicator below the pair: `"Total: {cwWeight + examWeight}% — must equal 100"`. The indicator turns red when the sum is not 100. This gives immediate feedback before the user submits.

Validation (Zod `superRefine`):

```typescript
.superRefine((data, ctx) => {
  if (data.cwWeight + data.examWeight !== 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Course Work and Exam weights must sum to 100.",
      path: ["examWeight"],
    });
  }
});
```

### Pre-populating on update

When `type === "update"` and `data` is provided, all fields pre-populate from the existing document:

- `name`, `description`: from `data.name`, `data.description`
- `classScope`: from `data.classScope` (defaults to `'institution'` if absent — handles pre-SubjectForm legacy documents)
- Classes multi-select: pre-selects all entries in `data.classIds`
- Teachers multi-select: pre-selects all entries in `data.teacherIds`
- `cwWeight`, `examWeight`: from `data.cwWeight`, `data.examWeight`

### Zod schema

```typescript
const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(100),
  description: z.string().max(500).optional(),
  classScope: z.enum(['institution', 'class']),
  classIds: z.array(z.string()),
  classNames: z.array(z.string()),
  teacherIds: z.array(z.string()),
  teacherNames: z.array(z.string()),
  cwWeight: z.coerce.number().min(0).max(100),
  examWeight: z.coerce.number().min(0).max(100),
}).superRefine((data, ctx) => {
  if (data.classScope === 'class' && data.classIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one class.",
      path: ["classIds"],
    });
  }
  if (data.cwWeight + data.examWeight !== 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Course Work and Exam weights must sum to 100.",
      path: ["examWeight"],
    });
  }
});
```

`classIds`, `classNames`, `teacherIds`, and `teacherNames` are managed as local component state (not registered via React Hook Form directly) because multi-select checkboxes do not register cleanly with RHF's `register`. Use `setValue('classIds', selectedIds)` etc. and validate via `superRefine`.

---

## 6. SubjectForm Submit Handler

```typescript
const onSubmit = handleSubmit(async (formData) => {
  const payload = {
    name: formData.name,
    description: formData.description ?? "",
    institutionId,
    classScope: formData.classScope,
    classIds: formData.classScope === 'institution' ? [] : formData.classIds,
    classNames: formData.classScope === 'institution' ? [] : formData.classNames,
    teacherIds: formData.teacherIds,
    teacherNames: formData.teacherNames,
    cwWeight: formData.cwWeight,
    examWeight: formData.examWeight,
    updatedAt: serverTimestamp(),
    updatedBy: user?.uid ?? "",
  };

  if (type === "create") {
    await addDoc(collection(db, "subjects"), {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: user?.uid ?? "",
    });
  } else {
    const id = data?.id;
    if (typeof id !== "string") {
      console.log("SubjectForm update: no string ID (mock mode)", formData);
      return;
    }
    await updateDoc(doc(db, "subjects", id), payload);
  }
  onClose?.();
});
```

### Denormalization of names

`classNames` and `teacherNames` are written at save time by the multi-select component state, which stores both the UID/ID and the display name for each selected option (populated from the live Firestore query). No secondary lookup is needed at save time — the display names are already in memory from the loaded options.

This matches the codebase-wide denormalization pattern (e.g., `TimetableSlotDocument.teacherName` and `subjectName`).

---

## 7. Subjects List Page Updates

[`src/scenes/(dashboard)/list/subjects/index.tsx`](../src/scenes/(dashboard)/list/subjects/index.tsx) requires two updates when SubjectForm ships:

### 7.1 Teachers column

The current column reads `item.teachers ?? []` (mock data field). In live mode, teachers come from `teacherNames`. Update the render to:

```tsx
<td className="hidden md:table-cell">
  {(item.teacherNames ?? item.teachers ?? []).join(", ")}
</td>
```

The `item.teachers` fallback preserves mock-mode compatibility. In live mode, `teacherNames` is always present.

### 7.2 Local `Subject` type

Replace the local `type Subject` definition with an import of `SubjectDocument` from `@/lib/firebase`:

```typescript
// Before
type Subject = {
  id: string;
  name: string;
  institutionId?: string;
  teachers?: string[];
};

// After
import { type SubjectDocument } from '@/lib/firebase';
type Subject = SubjectDocument & { id: string };
```

---

## 8. Downstream Form Changes

These changes deploy atomically with SubjectForm. Do not implement them independently.

### 8.1 ResultForm

[`src/components/forms/ResultForm.tsx`](../src/components/forms/ResultForm.tsx) gains three new fields: `subjectId`, `assessmentType`, and cascading student/class behaviour.

#### New field: `subjectId`

A dropdown populated from live `subjects` for the institution. For `regular_teacher`, filtered to subjects where `teacherIds array-contains uid`. For admin roles, all subjects in the institution.

```typescript
query(
  collection(db, 'subjects'),
  where('institutionId', '==', institutionId),
  // For regular_teacher only:
  where('teacherIds', 'array-contains', user.uid),
)
```

`subjectId` is **required** — Zod validation and Firestore rules both enforce it. Pre-Stage 2 results (no `subjectId`) can only be edited after the teacher selects a subject (see §8.1 — Backward compatibility).

The dropdown option label shows the subject name. On selection, the component cascades to filter the student dropdown.

#### New field: `assessmentType`

A radio or dropdown selector with two options:

| Value | Label | Guidance |
| --- | --- | --- |
| `'coursework'` | Course Work | Essays, projects, in-class tests, practical work |
| `'exam'` | Exam / Test | Midterms, end-of-term exams, final exams |

**Required** — blocks submission if unselected. Stored on the result document.

```typescript
// Zod addition
assessmentType: z.enum(['coursework', 'exam'], {
  errorMap: () => ({ message: "Assessment type is required." }),
}),
```

On update, pre-populated from `data.assessmentType` if present (blank for pre-Stage 2 documents — teacher must select).

#### Cascading student filter

When a subject is selected, the student dropdown is filtered based on the subject's `classScope` and `classIds`:

```typescript
const studentOptions = useMemo(() => {
  if (!selectedSubject) return liveStudents; // show all before subject is selected
  if (selectedSubject.classScope === 'institution') return liveStudents;
  if (selectedSubject.classIds.length === 0) return liveStudents; // defensive fallback
  return liveStudents.filter((s) => selectedSubject.classIds.includes(s.classId));
}, [selectedSubject, liveStudents]);
```

`liveStudents` is fetched via `onSnapshot` on `users` where `role === 'student'` and `institutionId` matches (same pattern as the live student query documented in POST_MVP_ADDITIONS_SPEC item 6).

#### `classId` auto-derivation

`classId` on a result document is auto-derived from the selected student's `classId` and is **not shown to the user** as a separate field. When the student selection changes, the component calls `setValue('classId', selectedStudent.classId)` internally.

Fallback: if the selected student has no `classId` (edge case — student was created without class assignment), a manual class dropdown is revealed with a label: "Student has no assigned class — select manually."

The explicit `classId` form field and its dropdown are removed from the visible UI. The value is maintained in form state via `register` but rendered as a hidden field.

```tsx
{/* Hidden — auto-derived from student selection */}
<input type="hidden" {...register("classId")} />

{/* Fallback — only shown when student has no classId */}
{studentHasNoClass && (
  <div className="flex flex-col gap-2 w-full md:w-1/4">
    <label className="text-xs text-gray-500 dark:text-gray-300">Class</label>
    <select onChange={(e) => setValue('classId', e.target.value)} ...>
      {/* live classes options */}
    </select>
  </div>
)}
```

#### Backward compatibility for pre-Stage 2 result documents

When editing a pre-Stage 2 result (`data.subjectId` is absent):

- The `subjectId` dropdown shows empty with placeholder "Select a subject" — **required, not pre-populated**.
- The teacher must select a subject before the form can be submitted.
- On save, `subjectId` is written to the document for the first time.
- After this first save, subsequent edits have `subjectId` pre-populated and the Firestore rule verifies it.

There is no bypass or optional path for pre-Stage 2 documents. The requirement to select a subject on the first edit is intentional — it migrates the document into the Stage 2 data model.

#### Update mode payload

`ResultForm` update mode intentionally excludes `studentId`, `classId`, and `termId` from the `updateDoc` call — these are locked context fields that cannot be re-attributed after a result is created (documented in [`MISCELLANEOUS_INFO.md`](../../docs/MISCELLANEOUS_INFO.md) under ResultForm — Create and Update, with Locked Context Fields).

`subjectId` and `assessmentType` are **not** locked context fields. Both must be included in the update-mode `updateDoc` payload:

- `subjectId` — required by the Firestore rule on update; also the migration path for pre-Stage 2 documents receiving a subject for the first time.
- `assessmentType` — a teacher may legitimately need to correct a misclassified assessment (e.g., entered as `'exam'` but should be `'coursework'`).

`classId` remains excluded from the update payload. It is auto-derived from the selected student, and the student is locked on update, so `classId` cannot change.

#### Updated `ResultDocument` type

```typescript
// src/lib/firebase.ts — updated
export type ResultDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;             // Stage 2: required on all new documents
  assessmentName: string;
  assessmentType: 'coursework' | 'exam';  // Stage 2: required on all new documents
  score: number;
  maxScore: number;
  weight?: number;
  date?: string;
};
```

#### Updated Zod schema for ResultForm

```typescript
const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),   // hidden, auto-set
  termId: z.string().min(1, "Term is required."),
  subjectId: z.string().min(1, "Subject is required."),
  assessmentType: z.enum(['coursework', 'exam'], {
    errorMap: () => ({ message: "Assessment type is required." }),
  }),
  assessmentName: z.string().min(1, "Assessment name is required.").max(100),
  score: z.coerce.number().min(0, "Score cannot be negative."),
  maxScore: z.coerce.number().min(1, "Max score must be at least 1."),
  weight: z.coerce.number().min(0).max(1).optional(),
  date: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.score > data.maxScore) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Score cannot exceed max score.",
      path: ["score"],
    });
  }
});
```

---

### 8.2 FeedbackCommentForm

[`src/components/forms/FeedbackCommentForm.tsx`](../src/components/forms/FeedbackCommentForm.tsx) gains five changes: `subjectId`, `conductGrade`, `commentNumber`, updated QUICK_COMMENTS to 20 items, and cascading student filter.

#### `subjectId` field

Same population and cascade logic as ResultForm (§8.1). For `regular_teacher`, filtered to their assigned subjects. For admin and senior_teacher roles, all subjects in the institution.

The student dropdown cascades from the selected subject identically to ResultForm.

**Existing upsert behaviour preserved:** The form already checks for an existing `feedback_comments` document before creating. In Stage 2, the uniqueness query must include `subjectId`:

```typescript
const q = query(
  collection(db, "feedback_comments"),
  where("studentId", "==", formData.studentId),
  where("teacherId", "==", user?.uid ?? ""),
  where("subjectId", "==", formData.subjectId),
  where("termId", "==", formData.termId),
);
```

This correctly handles the one-feedback-per-teacher-per-student-per-subject-per-term constraint.

#### New field: `conductGrade`

A radio or select with six options:

| Value | Label |
| --- | --- |
| `'G'` | G — Good |
| `'S'` | S — Satisfactory |
| `'F'` | F — Fair |
| `'U'` | U — Unsatisfactory |
| `'P'` | P — Poor |
| `'D'` | D — Disruption |

**Required** — blocks submission if unselected.

```typescript
conductGrade: z.enum(['G', 'S', 'F', 'U', 'P', 'D'], {
  errorMap: () => ({ message: "Conduct grade is required." }),
}),
```

#### New field: `commentNumber`

A dropdown of 20 items using the `COMMENT_KEY` constant (see §8.2 — COMMENT_KEY below). Each option displays the full comment text; the selected value is the 1-based index (1–20).

**Required** — blocks submission if unselected.

```typescript
commentNumber: z.coerce.number().int().min(1).max(20, {
  message: "Comment number is required.",
}),
```

#### COMMENT_KEY constant

The 20-item comment list replaces the 15 items currently documented in POST_MVP_ADDITIONS_SPEC.md item 12. The exact 20 comments come from `sms-system/internal/predetermined-feedback-comment-options.png`. This constant is the single source of truth for:

- The `commentNumber` dropdown in FeedbackCommentForm
- The Key to Comments section in the report card PDF

```typescript
// src/lib/commentKey.ts  (new file)
export const COMMENT_KEY: readonly string[] = [
  "A very keen student who has maintained a high standard of performance.",
  "A hardworking and capable student.",
  "A dependable and eager student who takes pride in his/her work.",
  "Works consistently and is making some progress.",
  "Shows interest and is making some progress.",
  "Fair performance but can do better.",
  "Tries but finds the subject difficult.",
  "Has a good grasp of the facts but unable to express them effectively.",
  "Has potential but does not work hard enough.",
  "Shows little interest in the subject.",
  "Usually works well, but has difficulty with an examination.",
  "Needs to read more.",
  "Must pay more attention to details.",
  "With greater application his/her work should improve.",
  "Very confident.",
  "Demonstrates initiative.",
  "Disappointing exam results.",
  "Slow, needs extra help.",
  "Disruptive in class.",
  "Needs individual attention.",
] as const;
```

**Important:** The 15-item `QUICK_COMMENTS` array defined in POST_MVP_ADDITIONS_SPEC.md item 12 is superseded by `COMMENT_KEY`. When FeedbackCommentForm is updated in Stage 2, `QUICK_COMMENTS` is replaced with `COMMENT_KEY` (20 items). Post-MVP item 12 is folded into this Stage 2 update — do not implement item 12 separately.

#### Override logic for the comment field (unchanged from POST_MVP_ADDITIONS_SPEC item 12)

The free-text `comment` field remains required. The `commentNumber` is independent:

| Textarea | Preset (`commentNumber`) | `comment` submitted |
| --- | --- | --- |
| Non-empty | Anything | Textarea value |
| Empty | Selected | `COMMENT_KEY[commentNumber - 1]` |
| Empty | Not selected | Zod fails: "Comment is required." |

The `commentNumber` field is always required regardless of the textarea. A teacher must select a comment number AND write or select a comment text.

#### Student dropdown cascade

Identical to ResultForm (§8.1): selecting a subject cascades the student dropdown based on `classScope` and `classIds`.

`classId` auto-derivation from the selected student's `classId` applies identically. The hidden `classId` field pattern is the same.

#### Updated `FeedbackCommentDocument` type

```typescript
// src/lib/firebase.ts — updated
export type FeedbackCommentDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;              // Stage 2: required on all new documents
  comment: string;
  conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D';  // Stage 2: required
  commentNumber: number;          // 1–20; Stage 2: required
  createdAt: Timestamp | string;
  teacherName?: string;
};
```

#### Updated Zod schema for FeedbackCommentForm

```typescript
const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),   // hidden, auto-set
  termId: z.string().min(1, "Term is required."),
  subjectId: z.string().min(1, "Subject is required."),
  conductGrade: z.enum(['G', 'S', 'F', 'U', 'P', 'D'], {
    errorMap: () => ({ message: "Conduct grade is required." }),
  }),
  commentNumber: z.coerce.number().int().min(1).max(20, {
    message: "Comment number is required.",
  }),
  comment: z.string().min(1, "Comment is required.").max(2000),
});
```

---

## 9. Firebase Security Rules — Stage 2

> **Deployed:** All rules in this section were deployed as of 2026-06-11. The authoritative deployed text is in [`firebase-rules.md`](./firebase-rules.md).
>
> **Note on helper function names:** The rule templates below use design-intent pseudo-helpers (`callerRole()`, `callerInstitutionId()`, `isInstitutionMember()`) that were adapted to the codebase's actual helper functions during implementation (`myRole()`, `writingToMyInstitution()`, `sameInstitution()`, `isAdminOrAbove()`, etc.). Treat the templates below as design rationale; treat `firebase-rules.md` as the source of truth for exact syntax.

### 9.1 `subjects` collection

Subjects are writable by `institution_admin` and `super_admin` only. All institution members can read.

```javascript
match /subjects/{subjectId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId);

  allow create, update: if request.auth != null
    && (callerRole() == 'institution_admin' || callerRole() == 'super_admin')
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );

  allow delete: if request.auth != null
    && (callerRole() == 'institution_admin' || callerRole() == 'super_admin')
    && isInstitutionMember(resource.data.institutionId);
}
```

### 9.2 `results` — tightened update rule for `regular_teacher`

The existing `results` rules are broadened at the `regular_teacher` create branch and tightened at the update branch. This uses a `get()` on the subject document — a single cross-document read that Firestore rules do support (unlike multi-document array-contains lookups).

```javascript
match /results/{resultId} {
  // Create: regular_teacher must be in the subject's teacherIds
  allow create: if request.auth != null
    && callerRole() == 'regular_teacher'
    && callerInstitutionId() == request.resource.data.institutionId
    && request.auth.uid in get(
         /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
       ).data.teacherIds;

  // Update: regular_teacher can only edit their own results, subject must still match
  allow update: if request.auth != null
    && callerRole() == 'regular_teacher'
    && callerInstitutionId() == resource.data.institutionId
    && request.auth.uid == resource.data.teacherId
    && request.auth.uid in get(
         /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
       ).data.teacherIds;

  // Admin access (unchanged)
  allow create, update: if request.auth != null
    && (callerRole() == 'institution_admin' || callerRole() == 'super_admin')
    && callerInstitutionId() == request.resource.data.institutionId;
}
```

**Rule engine note:** The `get()` call is evaluated against `request.resource.data.subjectId` (the new document being written). On update, this means the teacher can change the `subjectId` field — but only to a subject where they appear in `teacherIds`. They cannot update a result to reference a subject they are not assigned to.

### 9.3 `feedback_comments` — tightened write rule for `regular_teacher`

Same pattern as results.

```javascript
match /feedback_comments/{commentId} {
  allow create: if request.auth != null
    && callerRole() == 'regular_teacher'
    && callerInstitutionId() == request.resource.data.institutionId
    && request.auth.uid in get(
         /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
       ).data.teacherIds;

  allow update: if request.auth != null
    && callerRole() == 'regular_teacher'
    && callerInstitutionId() == resource.data.institutionId
    && request.auth.uid == resource.data.teacherId
    && request.auth.uid in get(
         /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
       ).data.teacherIds;

  allow create, update: if request.auth != null
    && (callerRole() == 'institution_admin' || callerRole() == 'super_admin')
    && callerInstitutionId() == request.resource.data.institutionId;
}
```

### 9.4 Legacy documents (no `subjectId`)

Pre-Stage 2 result and feedback documents do not have `subjectId`. The Firestore update rule for `regular_teacher` performs `get(subjects/$(request.resource.data.subjectId))`. If `subjectId` is absent from the write request, this `get()` will fail (document path is malformed), causing the rule to deny the write — which is the desired behaviour. The teacher must select a subject (adding `subjectId` to the request) before the write succeeds. This is self-enforcing.

---

## 10. TypeScript Types

### Changes to `src/lib/firebase.ts`

1. **Add** `SubjectDocument` (see §4)
2. **Update** `ResultDocument` (see §8.1)
3. **Update** `FeedbackCommentDocument` (see §8.2)

### New file: `src/lib/commentKey.ts`

```typescript
export const COMMENT_KEY: readonly string[] = [
  "A very keen student who has maintained a high standard of performance.",
  "A hardworking and capable student.",
  "A dependable and eager student who takes pride in his/her work.",
  "Works consistently and is making some progress.",
  "Shows interest and is making some progress.",
  "Fair performance but can do better.",
  "Tries but finds the subject difficult.",
  "Has a good grasp of the facts but unable to express them effectively.",
  "Has potential but does not work hard enough.",
  "Shows little interest in the subject.",
  "Usually works well, but has difficulty with an examination.",
  "Needs to read more.",
  "Must pay more attention to details.",
  "With greater application his/her work should improve.",
  "Very confident.",
  "Demonstrates initiative.",
  "Disappointing exam results.",
  "Slow, needs extra help.",
  "Disruptive in class.",
  "Needs individual attention.",
] as const;
```

This file is the **single source of truth** for comment key text. It is imported by:

- `FeedbackCommentForm.tsx` (commentNumber dropdown options)
- `ReportCardPDF.tsx` (Key to Comments section in the PDF)
- Any preview component that displays comment text

---

## 11. Atomic Deployment Constraints

### What "atomic" means here

The following changes must be published in a single deployment — not across separate PRs or releases:

| Change | File |
| --- | --- |
| SubjectForm wired to Firestore | `SubjectForm.tsx` |
| `SubjectDocument` type added | `src/lib/firebase.ts` |
| `subjects` Firestore rules updated | Firebase Console |
| ResultForm gains `subjectId` + `assessmentType` | `ResultForm.tsx` |
| FeedbackCommentForm gains `subjectId` + `conductGrade` + `commentNumber` | `FeedbackCommentForm.tsx` |
| `COMMENT_KEY` constant created | `src/lib/commentKey.ts` |
| `ResultDocument` type updated | `src/lib/firebase.ts` |
| `FeedbackCommentDocument` type updated | `src/lib/firebase.ts` |
| `results` Firestore write rules tightened for `regular_teacher` | Firebase Console |
| `feedback_comments` Firestore write rules tightened for `regular_teacher` | Firebase Console |
| `teacher_subjects` Firestore rules removed | Firebase Console |
| Subjects list page `teachers` column updated to `teacherNames` | `list/subjects/index.tsx` |

### Why atomic

**If rules are tightened before subjects are populated:**

`regular_teacher` users cannot write any results or feedback in live mode, because the rule performs `get(subjects/$(subjectId))` and no subject documents have `teacherIds` populated. All existing regular_teacher functionality is broken.

**If SubjectForm ships before forms gain `subjectId`:**

Subjects exist with `teacherIds` populated, but ResultForm and FeedbackCommentForm do not write `subjectId` onto their documents. The rule tightening cannot be deployed yet (since documents won't have `subjectId`). This partial state is acceptable as a brief intermediate — SubjectForm wiring without rule tightening is harmless. But Stage 1 of items 8/9/10 (client-side filtering) would be partially functional without enforcement.

**Deployment order (completed 2026-06-11):**

1. ✅ Deployed SubjectForm code changes (Steps 1–6 of implementation plan)
2. ✅ Firebase: removed `teacher_subjects` rule block
3. ✅ Institution admin configured ≥1 subject with `teacherIds` in live Firestore
4. ✅ Deployed tightened `results` and `feedback_comments` rules

### Relation to Stage 1 (already in this branch)

POST_MVP_ADDITIONS_SPEC items 8/9/10 Stage 1 (client-side filtering using `resolveTeacherAllowedClassIds`) can be implemented and deployed **independently and now** on this branch, before SubjectForm ships. Stage 1 adds filtering to the UI only — no rule changes, no form changes. In live mode, filtered pages show the "No subject assignments found" empty state until SubjectForm ships and subjects are configured.

Stage 2 (this spec) ships later, in the same release as SubjectForm.

---

## 12. Implementation Order

| Step | Task | Status |
| --- | --- | --- |
| 1 | Add `SubjectDocument` type to `src/lib/firebase.ts` | ✅ Complete |
| 2 | Create `src/lib/commentKey.ts` with `COMMENT_KEY` (20-item array from reference image) | ✅ Complete |
| 3 | Implement SubjectForm: live class and teacher dropdowns, class scope radio, weight fields, submit handler | ✅ Complete |
| 4 | Update subjects list page: `teacherNames` column, import `SubjectDocument` type | ✅ Complete |
| 5 | Update `ResultDocument` type in `src/lib/firebase.ts`: add `subjectId`, `assessmentType` | ✅ Complete |
| 6 | Update `FeedbackCommentDocument` type in `src/lib/firebase.ts`: add `subjectId`, `conductGrade`, `commentNumber` | ✅ Complete |
| 7 | Implement ResultForm changes: `subjectId` dropdown, `assessmentType` selector, cascading student filter, hidden `classId`, pre-Stage 2 backward-compat handling | ✅ Complete |
| 8 | Implement FeedbackCommentForm changes: `subjectId` dropdown, `conductGrade`, `commentNumber` (using `COMMENT_KEY`), updated upsert query, cascading student filter, hidden `classId` | ✅ Complete |
| 9 | Deploy code changes to production | ✅ Complete |
| 10 | Deploy `subjects` Firestore write rules; remove `teacher_subjects` Firestore rules | ✅ Complete |
| 11 | Institution admin configured ≥1 subject with `teacherIds` in live Firestore | ✅ Complete |
| 12 | Deploy tightened `results` and `feedback_comments` Firestore write rules for `regular_teacher` | ✅ Complete |

---

## 13. Files Affected

### Modified files

| File | Change |
| --- | --- |
| `src/components/forms/SubjectForm.tsx` | Full rewrite: live dropdowns, class scope, teachers, weights, Firestore submit handler |
| `src/components/forms/ResultForm.tsx` | Add `subjectId`, `assessmentType`, cascading student filter, hidden `classId`, updated Zod schema |
| `src/components/forms/FeedbackCommentForm.tsx` | Add `subjectId`, `conductGrade`, `commentNumber`, updated upsert query, cascading student filter, hidden `classId`, updated Zod schema |
| `src/scenes/(dashboard)/list/subjects/index.tsx` | Update Teachers column to `teacherNames`; replace local `Subject` type with `SubjectDocument` |
| `src/lib/firebase.ts` | Add `SubjectDocument`; update `ResultDocument`, `FeedbackCommentDocument` |

### New files

| File | Purpose |
| --- | --- |
| `src/lib/commentKey.ts` | Static 20-item `COMMENT_KEY` constant; single source of truth for comment text |

### Firebase Console changes

| Change | Timing |
| --- | --- |
| `subjects` write rules: `institution_admin` / `super_admin` only | Deploy with code |
| `teacher_subjects` rules: remove entirely | Deploy with code |
| `results` write rule: tighten `regular_teacher` branch to require `subjectId` + `get()` check | Deploy after subjects are populated |
| `feedback_comments` write rule: same | Deploy after subjects are populated |

---

## 14. Deferred Items

### 14.1 Exams, assignments, and lessons list scoping

POST_MVP_ADDITIONS_SPEC items 8/9/10 Stage 2 mentions exams, assignments, and lessons list pages as candidates for `regular_teacher` scoping. These pages' forms currently use `console.log` stubs and write nothing to Firestore. Subject-scoped filtering for these pages is deferred until those form write paths are implemented.

### 14.2 Senior_teacher feedback and FeedbackCommentForm subject dropdown

POST_MVP_ADDITIONS_SPEC item 6 grants `senior_teacher` the ability to leave feedback for any student in the institution (no class restriction). When `subjectId` becomes a required field on `FeedbackCommentForm`, `senior_teacher` must also select a subject. The subject dropdown for `senior_teacher` shows all subjects in the institution (no `teacherIds` filter). This is intentional — `senior_teacher` is not constrained to their own subjects.

### 14.3 `subjectId` on legacy result and feedback documents

When Stage 2 deploys, existing documents without `subjectId` cannot be edited by `regular_teacher` until the teacher selects a subject on the first edit (by design — see §8.1 backward compatibility). `institution_admin` and `super_admin` retain full edit access to legacy documents regardless. No batch migration of `subjectId` onto existing documents is planned.

### 14.4 Subject deletion cascade

If an `institution_admin` deletes a subject document, the `teacherIds` and `classIds` references in that document disappear. Existing results and feedback comments that reference the deleted `subjectId` will fail the Firestore `get()` rule check for `regular_teacher` updates (document not found → rule denies). Admin roles are unaffected.

This is an acceptable edge case — subjects should not be deleted once they have associated results. A deletion warning was implemented in `FormModal.tsx` for `table === 'subject'`: a 2-button confirmation ("No, cancel" / "Yes, delete") with a "Confirm Deletion" heading and two static messages:

1. "All data related to this subject will be lost."
2. "Deleting this subject will prevent teachers assigned to it from editing any results or feedback comments that reference it."

No count query is performed — the warning is static. This replaces the generic single-button delete confirmation for the subject table only.

### 14.5 `classId` field on ResultForm for institution-wide subjects

When a subject has `classScope === 'institution'`, the student dropdown shows all students in the institution. Different students may be in different classes. `classId` is auto-derived from the selected student's record. If a student has no `classId`, the manual fallback dropdown appears (§8.1). This correctly handles institution-wide subjects without any special case.

### 14.6 `resolveTeacherAllowedClassIds` utility (Stage 1)

The `resolveTeacherAllowedClassIds` utility defined in POST_MVP_ADDITIONS_SPEC items 8/9/10 Stage 1 is still the correct client-side utility for filtering list pages (results, feedback, students). It queries the `subjects` collection using `where('teacherIds', 'array-contains', uid)` — the same field that SubjectForm now writes. Once SubjectForm is wired and subjects are configured, Stage 1 filtering will become functional automatically with no changes to the utility or list pages.
