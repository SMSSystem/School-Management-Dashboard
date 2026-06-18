# SubjectForm Atomic Deployment — Implementation Plan

> **Purpose:** Step-by-step implementation guide for the SubjectForm atomic deployment. Covers every file change, exact Firestore rule diffs, deployment sequencing, and confirmed design decisions. Read [`SUBJECT_FORM_SPEC.md`](./SUBJECT_FORM_SPEC.md) first for rationale and data model details.
>
> **Date documented:** 2026-06-10
> **Last updated:** 2026-06-11
> **Branch:** `post-mvp-additions`
> **Status:** Complete — all 9 steps deployed as of 2026-06-11.

Cross-references: [`SUBJECT_FORM_SPEC.md`](./SUBJECT_FORM_SPEC.md) · [`MISCELLANEOUS_INFO.md`](./MISCELLANEOUS_INFO.md) · [`firebase-rules.md`](./firebase-rules.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Inventory](#2-file-inventory)
3. [Step 1 — TypeScript Types (`src/lib/firebase.ts`)](#3-step-1--typescript-types-srclibfirebasets)
4. [Step 2 — `src/lib/commentKey.ts` (new file)](#4-step-2--srclibcommentKeyts-new-file)
5. [Step 3 — SubjectForm.tsx (full rewrite)](#5-step-3--subjectformtsx-full-rewrite)
6. [Step 4 — Subjects List Page](#6-step-4--subjects-list-page)
7. [Step 5 — ResultForm.tsx](#7-step-5--resultformtsx)
8. [Step 6 — FeedbackCommentForm.tsx](#8-step-6--feedbackcommentformtsx)
9. [Step 7 — Firebase: Remove `teacher_subjects` Block](#9-step-7--firebase-remove-teacher_subjects-block)
10. [Step 8 — Firebase: Tighten `results` Rules (deferred)](#10-step-8--firebase-tighten-results-rules-deferred)
11. [Step 9 — Firebase: Tighten `feedback_comments` Rules (deferred)](#11-step-9--firebase-tighten-feedback_comments-rules-deferred)
12. [Deployment Sequence](#12-deployment-sequence)
13. [Confirmed Design Decisions](#13-confirmed-design-decisions)
14. [Rule Evaluation Budget](#14-rule-evaluation-budget)

---

## 1. Overview

Six source files change, one new file is created, and three Firestore rule blocks change (one removed, two tightened). The deployment has a hard sequencing constraint: rule tightening for `results` and `feedback_comments` must be deferred until at least one subject document with populated `teacherIds` exists in live Firestore.

The `subjects` rules in `firebase-rules.md` (lines 132–137) are **already deployed and correct** — no change needed there.

---

## 2. File Inventory

### Source files

| File | Change type |
| --- | --- |
| `src/lib/firebase.ts` | Modify — add `SubjectDocument`; update `ResultDocument`, `FeedbackCommentDocument` |
| `src/lib/commentKey.ts` | **New** — 20-item `COMMENT_KEY` constant |
| `src/components/forms/SubjectForm.tsx` | Full rewrite — stub → live Firestore form |
| `src/scenes/(dashboard)/list/subjects/index.tsx` | Modify — `teacherNames` column; replace local `Subject` type |
| `src/components/forms/ResultForm.tsx` | Modify — `subjectId`, `assessmentType`, live queries, hidden `classId`, cascade |
| `src/components/forms/FeedbackCommentForm.tsx` | Modify — `subjectId`, `conductGrade`, `commentNumber`, live queries, updated upsert, cascade |

### Firebase Console changes

| Change | Timing |
| --- | --- |
| `teacher_subjects` match block: remove entirely | Deploy with code |
| `subjects` rules: **no change** (already deployed correctly) | N/A |
| `results` write rules: tighten `regular_teacher` branch | Deploy **after** subjects are populated |
| `feedback_comments` write rules: tighten `regular_teacher` branch | Deploy **after** subjects are populated |

---

## 3. Step 1 — TypeScript Types (`src/lib/firebase.ts`)

### Add `SubjectDocument`

Insert as a new export. This is the canonical type for `subjects/{id}` documents written by SubjectForm.

```typescript
export type SubjectDocument = {
  name: string;
  description?: string;
  institutionId: string;
  classScope: 'institution' | 'class';
  classIds: string[];
  classNames: string[];
  teacherIds: string[];
  teacherNames: string[];
  cwWeight: number;
  examWeight: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
};
```

### Update `ResultDocument`

Add `subjectId` and `assessmentType`. Both are required on all Stage 2 documents.

```typescript
export type ResultDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;                        // Stage 2: required on all new documents
  assessmentName: string;
  assessmentType: 'coursework' | 'exam';    // Stage 2: required on all new documents
  score: number;
  maxScore: number;
  weight?: number;
  date?: string;
};
```

### Update `FeedbackCommentDocument`

Add `subjectId`, `conductGrade`, and `commentNumber`. All three are required on all Stage 2 documents.

```typescript
export type FeedbackCommentDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;                                    // Stage 2: required on all new documents
  comment: string;
  conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D';   // Stage 2: required
  commentNumber: number;                                // 1–20; Stage 2: required
  createdAt: Timestamp | string;
  teacherName?: string;
};
```

---

## 4. Step 2 — `src/lib/commentKey.ts` (new file)

Create this file with the 20-item array. Do not modify after creation — it is the single source of truth for the `commentNumber` dropdown in FeedbackCommentForm and the Key to Comments section in the report card PDF.

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

Imported by: `FeedbackCommentForm.tsx`, `ReportCardPDF.tsx` (when built).

---

## 5. Step 3 — SubjectForm.tsx (full rewrite)

The current file is a 66-line stub (`console.log` only). It is replaced in its entirety.

### Imports

```typescript
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc, collection, doc, onSnapshot, query,
  serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import InputField from "../InputField";
import { db, type SubjectDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
```

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

### Props

```typescript
const SubjectForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: Partial<SubjectDocument & { id: string }>;
  onClose?: () => void;
})
```

### State

```typescript
const { user, institutionId } = useAuth();

const [liveClasses, setLiveClasses] = useState<{ id: string; name: string }[]>([]);
const [liveTeachers, setLiveTeachers] = useState<{ id: string; name: string }[]>([]);

// Multi-select managed outside RHF; synced via setValue
const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
const [selectedTeacherNames, setSelectedTeacherNames] = useState<string[]>([]);
```

### Live queries

Two `onSnapshot` subscriptions in a single `useEffect` on `institutionId`:

```typescript
// Classes
query(collection(db, 'classes'), where('institutionId', '==', institutionId))

// Teachers (regular_teacher only — source for subject assignment)
query(
  collection(db, 'users'),
  where('role', '==', 'regular_teacher'),
  where('institutionId', '==', institutionId),
)
```

### Multi-select management

`classIds`, `classNames`, `teacherIds`, `teacherNames` are registered with the RHF schema but do not use `register` directly (checkboxes do not bind cleanly). Instead, local state drives the UI and `setValue(...)` syncs to RHF for Zod validation.

When a class checkbox is toggled:

```typescript
const toggleClass = (id: string, name: string) => {
  const nextIds = selectedClassIds.includes(id)
    ? selectedClassIds.filter((x) => x !== id)
    : [...selectedClassIds, id];
  const nextNames = selectedClassNames.includes(name)
    ? selectedClassNames.filter((x) => x !== name)
    : [...selectedClassNames, name];
  setSelectedClassIds(nextIds);
  setSelectedClassNames(nextNames);
  setValue('classIds', nextIds);
  setValue('classNames', nextNames);
};
```

Apply the same pattern for teacher checkboxes using `selectedTeacherIds`/`selectedTeacherNames`.

### Class scope radio

Two options: "Entire Institution" and "Specific Class(es)". Default: "Entire Institution".

When scope changes to `'institution'`, clear selections:

```typescript
const handleScopeChange = (scope: 'institution' | 'class') => {
  setValue('classScope', scope);
  if (scope === 'institution') {
    setSelectedClassIds([]);
    setSelectedClassNames([]);
    setValue('classIds', []);
    setValue('classNames', []);
  }
};
```

The Classes multi-select block is conditionally rendered: `{watch('classScope') === 'class' && (...)}`

### Weight sum indicator

Below the two weight inputs, a live indicator:

```tsx
const cwWeight = watch('cwWeight') ?? 0;
const examWeight = watch('examWeight') ?? 0;
const weightSum = Number(cwWeight) + Number(examWeight);

<p className={`text-xs ${weightSum !== 100 ? 'text-red-400' : 'text-gray-500'}`}>
  Total: {weightSum}% — must equal 100
</p>
```

### Pre-population on update

When `type === 'update'` and `data` is provided, a `useEffect` on mount calls:

```typescript
reset({
  name: data.name ?? '',
  description: data.description ?? '',
  classScope: data.classScope ?? 'institution',
  classIds: data.classIds ?? [],
  classNames: data.classNames ?? [],
  teacherIds: data.teacherIds ?? [],
  teacherNames: data.teacherNames ?? [],
  cwWeight: data.cwWeight ?? 0,
  examWeight: data.examWeight ?? 0,
});
setSelectedClassIds(data.classIds ?? []);
setSelectedClassNames(data.classNames ?? []);
setSelectedTeacherIds(data.teacherIds ?? []);
setSelectedTeacherNames(data.teacherNames ?? []);
```

`classScope` defaults to `'institution'` when absent — handles pre-SubjectForm legacy subject documents that have no `classScope` field.

### Submit handler

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
});
```

### Subject deletion warning

When `type === 'delete'` is triggered from the subjects list page, the `FormModal` delete confirmation UI for `table === 'subject'` shows a 2-button layout ("No, cancel" / "Yes, delete") with a "Confirm Deletion" heading — replacing the generic single-button layout for subjects only.

Two static messages are displayed:

1. "All data related to this subject will be lost."
2. "Deleting this subject will prevent teachers assigned to it from editing any results or feedback comments that reference it."

The warning is static — no count query is required. "No, cancel" calls `setOpen(false)`. "Yes, delete" performs the `deleteDoc` and then calls `setOpen(false)`.

---

## 6. Step 4 — Subjects List Page

**File:** `src/scenes/(dashboard)/list/subjects/index.tsx`

Two targeted changes only — no other lines change.

### Replace local `Subject` type

```typescript
// Remove:
type Subject = {
  id: string;
  name: string;
  institutionId?: string;
  teachers?: string[];
};

// Add import and alias:
import { type SubjectDocument } from '@/lib/firebase';
type Subject = SubjectDocument & { id: string };
```

### Update Teachers column render (line 61)

```tsx
// Before:
<td className="hidden md:table-cell">{(item.teachers ?? []).join(",")}</td>

// After:
<td className="hidden md:table-cell">
  {(item.teacherNames ?? (item as any).teachers ?? []).join(", ")}
</td>
```

The `(item as any).teachers` fallback preserves mock-mode compatibility where `subjectsData` in `src/lib/data.ts` uses `teachers: string[]`. In live mode, `teacherNames` is always present.

---

## 7. Step 5 — ResultForm.tsx

### Remove mock data imports

```typescript
// Remove this line entirely:
import { studentsData, classesData, termsData } from "@/lib/data";
```

### Add import

```typescript
import { onSnapshot, query, collection, where } from "firebase/firestore";
// (merge with existing firebase/firestore import line)
```

### New state

```typescript
const [liveStudents, setLiveStudents] = useState<{ uid: string; name: string; classId?: string }[]>([]);
const [liveTerms, setLiveTerms] = useState<{ id: string; name: string }[]>([]);
const [liveSubjects, setLiveSubjects] = useState<{ id: string; name: string; classScope: string; classIds: string[] }[]>([]);
const [liveClasses, setLiveClasses] = useState<{ id: string; name: string }[]>([]); // fallback only
const [selectedSubject, setSelectedSubject] = useState<typeof liveSubjects[0] | null>(null);
const [selectedStudentClassId, setSelectedStudentClassId] = useState<string>("");
const [studentHasNoClass, setStudentHasNoClass] = useState(false);
```

### Live queries

Four `onSnapshot` subscriptions in a single `useEffect` on `[institutionId, user?.uid, role]`:

```typescript
// Students
query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId))

// Terms
query(collection(db, 'terms'), where('institutionId', '==', institutionId))

// Classes (for fallback manual classId selection only)
query(collection(db, 'classes'), where('institutionId', '==', institutionId))

// Subjects — role-scoped
const subjectQuery = role === 'regular_teacher'
  ? query(
      collection(db, 'subjects'),
      where('institutionId', '==', institutionId),
      where('teacherIds', 'array-contains', user!.uid),
    )
  : query(collection(db, 'subjects'), where('institutionId', '==', institutionId));
```

### Updated Zod schema

```typescript
const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),   // hidden — auto-set
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

### Cascading student filter

```typescript
const studentOptions = useMemo(() => {
  if (!selectedSubject) return liveStudents;
  if (selectedSubject.classScope === 'institution') return liveStudents;
  if (selectedSubject.classIds.length === 0) return liveStudents; // defensive fallback
  return liveStudents.filter((s) => selectedSubject.classIds.includes(s.classId ?? ''));
}, [selectedSubject, liveStudents]);
```

### Subject dropdown (new — first field in the form)

```tsx
<div className="flex flex-col gap-2 w-full md:w-1/4">
  <label className="text-xs text-gray-500 dark:text-gray-300">Subject</label>
  <select
    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
    {...register("subjectId")}
    defaultValue={data?.subjectId as string | undefined}
    onChange={(e) => {
      const sub = liveSubjects.find((s) => s.id === e.target.value) ?? null;
      setSelectedSubject(sub);
      setValue('studentId', '');
      setValue('classId', '');
      setSelectedStudentClassId('');
      setStudentHasNoClass(false);
    }}
  >
    <option value="">Select a subject</option>
    {liveSubjects.map((s) => (
      <option key={s.id} value={s.id}>{s.name}</option>
    ))}
  </select>
  {errors.subjectId?.message && (
    <p className="text-xs text-red-400">{errors.subjectId.message.toString()}</p>
  )}
</div>
```

### Student dropdown (replace mock data with live, filtered)

```tsx
<select
  {...register("studentId")}
  defaultValue={data?.studentId as string | undefined}
  onChange={(e) => {
    const student = liveStudents.find((s) => s.uid === e.target.value);
    if (student) {
      if (student.classId) {
        setValue('classId', student.classId);
        setSelectedStudentClassId(student.classId);
        setStudentHasNoClass(false);
      } else {
        setValue('classId', '');
        setSelectedStudentClassId('');
        setStudentHasNoClass(true);
      }
    }
  }}
>
  <option value="">Select a student</option>
  {studentOptions.map((s) => (
    <option key={s.uid} value={s.uid}>{s.name}</option>
  ))}
</select>
```

### `classId` — hidden field + fallback

```tsx
{/* Hidden — auto-derived from student selection */}
<input type="hidden" {...register("classId")} />

{/* Fallback — only shown when student has no classId */}
{studentHasNoClass && (
  <div className="flex flex-col gap-2 w-full md:w-1/4">
    <label className="text-xs text-gray-500 dark:text-gray-300">
      Class <span className="text-orange-400">(student has no assigned class — select manually)</span>
    </label>
    <select
      className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
      onChange={(e) => setValue('classId', e.target.value)}
    >
      <option value="">Select a class</option>
      {liveClasses.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
    {errors.classId?.message && (
      <p className="text-xs text-red-400">{errors.classId.message.toString()}</p>
    )}
  </div>
)}
```

Remove the visible `classId` dropdown that currently exists in the form — it is replaced by the hidden field and fallback above.

### Term dropdown (replace mock data with live)

```tsx
{termsData.map(...)}
// Replace with:
{liveTerms.map((t) => (
  <option key={t.id} value={t.id}>{t.name}</option>
))}
```

### Assessment type selector (new — after `assessmentName`)

```tsx
<div className="flex flex-col gap-2 w-full md:w-1/4">
  <label className="text-xs text-gray-500 dark:text-gray-300">Assessment Type</label>
  <select
    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
    {...register("assessmentType")}
    defaultValue={data?.assessmentType as string | undefined}
  >
    <option value="">Select type</option>
    <option value="coursework">Course Work</option>
    <option value="exam">Exam / Test</option>
  </select>
  {errors.assessmentType?.message && (
    <p className="text-xs text-red-400">{errors.assessmentType.message.toString()}</p>
  )}
</div>
```

### Updated submit handler

**Create payload** — add `subjectId` and `assessmentType`:

```typescript
await addDoc(collection(db, "results"), {
  ...formData,  // includes subjectId, assessmentType, studentId, classId, termId
  teacherId: user?.uid ?? "",
  institutionId,
  departmentId,
  createdAt: serverTimestamp(),
});
```

**Update payload** — add `subjectId` and `assessmentType`; keep locked fields excluded:

```typescript
await updateDoc(doc(db, "results", id), {
  subjectId: formData.subjectId,         // not locked — migration path + correctable
  assessmentType: formData.assessmentType, // not locked — correctable
  assessmentName: formData.assessmentName,
  score: formData.score,
  maxScore: formData.maxScore,
  weight: formData.weight,
  date: formData.date,
  // studentId, classId, termId intentionally excluded — locked context fields
});
```

### Pre-population for update mode

When `type === 'update'` and `data` is present, a `useEffect` fires once `liveSubjects` loads to pre-select the subject:

```typescript
useEffect(() => {
  if (type === 'update' && data?.subjectId && liveSubjects.length > 0) {
    const sub = liveSubjects.find((s) => s.id === data.subjectId) ?? null;
    setSelectedSubject(sub);
  }
}, [liveSubjects, type, data?.subjectId]);
```

`data?.assessmentType` is passed as `defaultValue` on the Assessment Type select.

Pre-Stage 2 result documents have no `subjectId` — the dropdown will show empty with placeholder "Select a subject". The teacher must select a subject before the form submits. This is by design: the first save migrates the document into the Stage 2 data model.

---

## 8. Step 6 — FeedbackCommentForm.tsx

### Remove mock data imports

```typescript
// Remove:
import { studentsData, classesData, termsData } from "@/lib/data";
```

### Add imports

```typescript
import { onSnapshot, query, collection, where } from "firebase/firestore";
// (merge with existing firebase/firestore import line)
import { COMMENT_KEY } from "@/lib/commentKey";
```

### Updated Zod schema

```typescript
const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),   // hidden — auto-set
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

### New state

```typescript
const [liveStudents, setLiveStudents] = useState<{ uid: string; name: string; classId?: string }[]>([]);
const [liveTerms, setLiveTerms] = useState<{ id: string; name: string }[]>([]);
const [liveSubjects, setLiveSubjects] = useState<{ id: string; name: string; classScope: string; classIds: string[] }[]>([]);
const [liveClasses, setLiveClasses] = useState<{ id: string; name: string }[]>([]);
const [selectedSubject, setSelectedSubject] = useState<typeof liveSubjects[0] | null>(null);
const [studentHasNoClass, setStudentHasNoClass] = useState(false);
```

### Live queries

Same four `onSnapshot` subscriptions as ResultForm. Subject query is role-scoped:

- `regular_teacher`: `where('teacherIds', 'array-contains', user!.uid)`
- `senior_teacher`, `institution_admin`, `super_admin`: no `teacherIds` filter — all subjects in institution

### Cascading student filter

Identical `useMemo` logic to ResultForm (§5 above).

### `classId` — hidden field + fallback

Identical pattern to ResultForm.

### Subject dropdown (new — first field)

Same structure as ResultForm's subject dropdown. On change: reset `studentId`/`classId`, clear `selectedSubject`.

### Conduct grade selector (new — after student/term fields)

```tsx
<div className="flex flex-col gap-2 w-full md:w-1/4">
  <label className="text-xs text-gray-500 dark:text-gray-300">Conduct Grade</label>
  <select
    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
    {...register("conductGrade")}
    defaultValue={data?.conductGrade as string | undefined}
  >
    <option value="">Select conduct grade</option>
    <option value="G">G — Good</option>
    <option value="S">S — Satisfactory</option>
    <option value="F">F — Fair</option>
    <option value="U">U — Unsatisfactory</option>
    <option value="P">P — Poor</option>
    <option value="D">D — Disruption</option>
  </select>
  {errors.conductGrade?.message && (
    <p className="text-xs text-red-400">{errors.conductGrade.message.toString()}</p>
  )}
</div>
```

### Comment number dropdown (new — before comment textarea)

```tsx
<div className="flex flex-col gap-2 w-full md:w-1/4">
  <label className="text-xs text-gray-500 dark:text-gray-300">Preset Comment</label>
  <select
    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
    {...register("commentNumber")}
    defaultValue={data?.commentNumber as number | undefined}
  >
    <option value="">Select a preset</option>
    {COMMENT_KEY.map((text, i) => (
      <option key={i + 1} value={i + 1}>{i + 1}. {text}</option>
    ))}
  </select>
  {errors.commentNumber?.message && (
    <p className="text-xs text-red-400">{errors.commentNumber.message.toString()}</p>
  )}
</div>
```

### Comment textarea (existing — unchanged UI, updated logic)

The existing textarea is kept. Label can be updated to clarify: "Comment (overrides preset if filled in)".

### Comment override logic

Resolve `comment` in the submit handler before building the payload:

```typescript
const resolvedComment =
  formData.comment.trim() !== ""
    ? formData.comment
    : COMMENT_KEY[formData.commentNumber - 1];
```

| Textarea | Preset (`commentNumber`) | `comment` written to Firestore |
| --- | --- | --- |
| Non-empty | Anything | Textarea value |
| Empty | Selected | `COMMENT_KEY[commentNumber - 1]` |
| Empty | Not selected | Zod blocks submission ("Comment is required.") |

### Updated upsert query (create path)

Add `subjectId` to the uniqueness check — one feedback comment per teacher per student **per subject** per term:

```typescript
const q = query(
  collection(db, "feedback_comments"),
  where("studentId", "==", formData.studentId),
  where("teacherId", "==", user?.uid ?? ""),
  where("subjectId", "==", formData.subjectId),
  where("termId", "==", formData.termId),
);
```

When an existing document is found (upsert update path):

```typescript
await updateDoc(existingSnap.docs[0].ref, {
  comment: resolvedComment,
  conductGrade: formData.conductGrade,
  commentNumber: formData.commentNumber,
  subjectId: formData.subjectId,
});
```

When no existing document is found (create path), the full `addDoc` payload includes all Stage 2 fields:

```typescript
await addDoc(collection(db, "feedback_comments"), {
  studentId: formData.studentId,
  classId: formData.classId,
  termId: formData.termId,
  subjectId: formData.subjectId,
  conductGrade: formData.conductGrade,
  commentNumber: formData.commentNumber,
  comment: resolvedComment,
  teacherId: user?.uid ?? "",
  institutionId,
  departmentId,
  createdAt: serverTimestamp(),
});
```

### Update mode payload (`type === 'update'`)

```typescript
await updateDoc(doc(db, "feedback_comments", id), {
  subjectId: formData.subjectId,
  conductGrade: formData.conductGrade,
  commentNumber: formData.commentNumber,
  comment: resolvedComment,
  // studentId, classId, termId intentionally excluded — locked context fields
});
```

---

## 9. Step 7 — Firebase: Remove `teacher_subjects` Block

Remove lines 206–212 from the deployed rules (the `teacher_subjects` match block):

```javascript
// REMOVE ENTIRELY:
// ── Teacher-Subjects junction ──────────────────────────────────────────
match /teacher_subjects/{docId} {
  allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
  allow create: if isAdminOrAbove() && writingToMyInstitution();
  allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

No data has ever been written to this collection (no write path existed), so removal has zero impact on live data. Deploy this with the code changes in Step 1–6.

---

## 10. Step 8 — Firebase: Tighten `results` Rules (deferred)

**Deploy only after Step 12 (at least one subject has `teacherIds` populated).**

### Full `results` match block replacement

```javascript
// ── Results ────────────────────────────────────────────────────────────
// Stage 2: regular_teacher create/update now requires uid in subject's teacherIds.
// senior_teacher access via isSeniorTeacherFor(departmentId) is unchanged.
// The original teacherId == request.auth.uid and score guards are preserved.
match /results/{resultId} {
  allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

  allow create: if isTeacherOrAbove()
    && writingToMyInstitution()
    && request.resource.data.teacherId == request.auth.uid
    && request.resource.data.score <= request.resource.data.maxScore
    && (isAdminOrAbove()
      || isSeniorTeacherFor(request.resource.data.departmentId)
      || (myRole() == 'regular_teacher'
          && request.auth.uid in get(
               /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
             ).data.teacherIds));

  allow update: if sameInstitution(resource.data.institutionId)
    && request.resource.data.score <= request.resource.data.maxScore
    && (isAdminOrAbove()
      || isSeniorTeacherFor(resource.data.departmentId)
      || (myRole() == 'regular_teacher'
          && resource.data.teacherId == request.auth.uid
          && request.auth.uid in get(
               /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
             ).data.teacherIds))
    && institutionNotChanged();

  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

### What changed vs. current deployed rule

| Branch | Before Stage 2 | After Stage 2 |
| --- | --- | --- |
| `regular_teacher` create | `isClassTeacherFor(classId)` | `uid in subjects/{subjectId}.teacherIds` |
| `regular_teacher` update | `isTeacher() && teacherId == uid` | `myRole() == 'regular_teacher' && teacherId == uid && uid in subjects/{subjectId}.teacherIds` |
| `senior_teacher` create | `isSeniorTeacherFor(departmentId)` | unchanged |
| `senior_teacher` update | `isSeniorTeacherFor(departmentId)` | unchanged |
| Admin create/update | `isAdminOrAbove()` | unchanged |
| Read, delete | unchanged | unchanged |

**Semantic change:** Before Stage 2, a `regular_teacher` can write results only if they are the `classTeacherId` on the class document. After Stage 2, they can write results only if their UID is in the subject's `teacherIds` array. Subject assignment via SubjectForm replaces class-teacher designation as the authorization mechanism for result writes.

---

## 11. Step 9 — Firebase: Tighten `feedback_comments` Rules (deferred)

**Deploy only after Step 12 (at least one subject has `teacherIds` populated). Deploy together with Step 8.**

### Full `feedback_comments` match block replacement

```javascript
// ── Feedback Comments ──────────────────────────────────────────────────
// Stage 2: regular_teacher create/update now requires uid in subject's teacherIds.
// senior_teacher access via isSeniorTeacherFor(departmentId) is unchanged.
// Upsert key updated: studentId + teacherId + subjectId + termId (enforced at app layer).
match /feedback_comments/{docId} {
  allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

  allow create: if writingToMyInstitution()
    && (isAdminOrAbove()
      || (request.resource.data.teacherId == request.auth.uid
          && (isSeniorTeacherFor(request.resource.data.departmentId)
              || (myRole() == 'regular_teacher'
                  && request.auth.uid in get(
                       /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
                     ).data.teacherIds))));

  allow update: if sameInstitution(resource.data.institutionId)
    && (isAdminOrAbove()
      || isSeniorTeacherFor(resource.data.departmentId)
      || (myRole() == 'regular_teacher'
          && resource.data.teacherId == request.auth.uid
          && request.auth.uid in get(
               /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
             ).data.teacherIds))
    && institutionNotChanged();

  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

### What changed vs. current deployed rule

Same pattern as `results`: `isClassTeacherFor(classId)` for `regular_teacher` is replaced by `uid in subjects/{subjectId}.teacherIds`. `senior_teacher` access via `isSeniorTeacherFor` is unchanged.

---

## 12. Deployment Sequence

| Step | Action | Status | Notes |
| --- | --- | --- | --- |
| 1 | Deploy all code changes (Steps 1–6) | ✅ Complete | SubjectForm live; ResultForm and FeedbackCommentForm accept Stage 2 fields |
| 2 | Firebase: remove `teacher_subjects` rule block | ✅ Complete | Zero data impact; deployed with code |
| 3 | Verify `subjects` rules (no action needed) | ✅ N/A | Already deployed correctly — `firebase-rules.md` lines 132–137 |
| 4 | Institution admin configures ≥1 subject with `teacherIds` in live Firestore | ✅ Complete | Unblocked Steps 8 and 9 |
| 5 | Firebase: deploy tightened `results` and `feedback_comments` rules | ✅ Complete | Steps 8 and 9 deployed together on 2026-06-11 |

---

## 13. Confirmed Design Decisions

These decisions were confirmed during planning and are not open questions.

### `senior_teacher` access in Stage 2 rules

`senior_teacher` access for `results` and `feedback_comments` is unchanged in Stage 2. `isSeniorTeacherFor(departmentId)` remains the access mechanism for `senior_teacher` creates and updates. `senior_teacher` is **not** required to go through subject `teacherIds` assignment.

### Safety guards on `results` create rule

The `request.resource.data.teacherId == request.auth.uid` guard and the `score <= maxScore` guard are both preserved in the Stage 2 `results` create rule. These guards were in the current deployed rule and remain in the replacement.

### `FeedbackCommentForm` locked context fields in update mode

`studentId`, `classId`, and `termId` are excluded from the `FeedbackCommentForm` `type === 'update'` `updateDoc` payload. These are locked context fields — the same pattern as `ResultForm`. A teacher editing a feedback comment by ID cannot re-attribute it to a different student, class, or term.

### Live term data

`termsData` mock data is removed from both `ResultForm` and `FeedbackCommentForm`. Both switch to a live `onSnapshot` query on the `terms` collection filtered by `institutionId`. This is consistent with the live student and subject queries also introduced in Stage 2.

### Subject deletion warning

A static warning is shown in the `FormModal` delete confirmation UI when `table === 'subject'`:

> "Deleting this subject will prevent teachers assigned to it from editing any results or feedback comments that reference it. Are you sure you want to continue?"

This is a static message — no count query. The warning is part of the current atomic deployment scope, not deferred.

---

## 14. Rule Evaluation Budget

For reference: Firestore rules permit up to 10 external document reads (`get`/`exists` calls) per rule evaluation. The Stage 2 rules for `regular_teacher` result and feedback creates use 3 reads per evaluation:

| Call | Source | Notes |
| --- | --- | --- |
| `me()` → `get(users/uid)` | Used by `isTeacherOrAbove`, `writingToMyInstitution`, `myRole` | Counted once (cached within evaluation) |
| `get(teachers/uid)` | From `isSeniorTeacherFor(departmentId)` | Evaluated, returns false for regular_teacher; then short-circuits |
| `get(subjects/subjectId)` | New in Stage 2 | Only evaluated after isSeniorTeacherFor returns false |

Total: 3 distinct `get()` calls for a `regular_teacher` create. Well within the 10-call limit.

For `senior_teacher` creates, the `get(subjects/subjectId)` call is short-circuited (not evaluated) once `isSeniorTeacherFor` returns true — so `senior_teacher` uses only 2 `get()` calls.
