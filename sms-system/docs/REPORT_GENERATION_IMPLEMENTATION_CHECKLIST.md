# Report Generation (A-3) — Implementation Checklist

> **Created:** 2026-05-31
> **Last updated:** 2026-05-31
> **Firebase rules published:** N-2b (institutions), N-3b (feedback_comments), N-4 (reports) — all live in Firebase Console as of 2026-05-31.
> **Branch:** `mvp`
> **Based on:** Comprehensive prerequisites judgment produced after reading [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) and the full codebase state.
> **Purpose:** Detailed record of every code change, Firebase rule change, schema change, and documentation change required before A-3 can be implemented. Includes file paths, code snippets, and reasoning for each item.

Cross-references: [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) · [`firebase-rules.md`](./firebase-rules.md) · [`PROJECT_SPEC_AND_ANALYSIS.md`](./PROJECT_SPEC_AND_ANALYSIS.md)

---

## Table of Contents

0. [Type System Debt](#0-type-system-debt-srclibfirebasets)
1. [F-1 — Terms Management UI](#1-f-1--terms-management-ui)
2. [D-1 + D-2 — Teacher/Student CRUD → Firestore](#2-d-1--d-2--teacherstudent-crud--firestore)
3. [D-4 — Class CRUD → Firestore](#3-d-4--class-crud--firestore)
4. [N-2 — Grading Config UI](#4-n-2--grading-config-ui)
5. [D-5 — Results Data Model Rebuild](#5-d-5--results-data-model-rebuild)
6. [N-3 — Publish `feedback_comments` Firestore Rules](#6-n-3--publish-feedback_comments-firestore-rules)
7. [A-2 — `feedback_comments` Collection + Teacher Submission UI](#7-a-2--feedback_comments-collection--teacher-submission-ui)
8. [N-4 — Publish `reports` Firestore Rules](#8-n-4--publish-reports-firestore-rules)
9. [A-3 — Report Generation Logic](#9-a-3--report-generation-logic)
10. [N-5 — `/reports` Page + Sidebar Link](#10-n-5--reports-page--sidebar-link)
11. [Master Summary Table](#11-master-summary-table)
12. [Deferred Items](#12-deferred-items)

---

## 0. Type System Debt (`src/lib/firebase.ts`)

> **Status: ✅ Complete — 2026-05-31.** `GradingSystem`, `TermDocument`, `ClassDocument`, `ResultDocument`, `FeedbackCommentDocument`, `ReportDocument`, and `gradingSystem` on `InstitutionDocument` all added to `firebase.ts`.

**Why this comes first:** Every downstream consumer — the settings page, results form, report generation logic — depends on these types. They cost almost nothing to add and eliminate TypeScript errors before any live-mode code is written.

---

### 0a. Add `GradingSystem` type

**File:** [`src/lib/firebase.ts`](../src/lib/firebase.ts)

**Current state:** No `GradingSystem` type exists anywhere in the codebase.

**Change needed:** Add the following alongside the other union type exports (after `TermStatus` on line 25):

```ts
export type GradingSystem = 'flat' | 'weighted';
```

**Consumers once added:** settings page (N-2), `ResultForm` (D-5), report generation logic (A-3), `InstitutionDocument` (0b below).

---

### 0b. Add `gradingSystem` to `InstitutionDocument`

**File:** [`src/lib/firebase.ts`](../src/lib/firebase.ts)

**Current state** (lines 41–51):

```ts
export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: string;
  status: 'active' | 'suspended';
  location?: string;
  userCount?: number;
  studentCount?: number;
  teacherCount?: number;
  lastActiveAt?: string;
};
```

**Change needed:** Add `gradingSystem` as optional (becomes effectively required once N-2 is built — optional here to avoid breaking existing reads of institution documents that predate the field):

```ts
export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: string;
  status: 'active' | 'suspended';
  gradingSystem?: GradingSystem;   // ← add this
  location?: string;
  userCount?: number;
  studentCount?: number;
  teacherCount?: number;
  lastActiveAt?: string;
};
```

---

### 0c. New document types (deferred to A-2/A-3 build time)

The following types do not exist yet and will be needed before A-2 and A-3 can be built. They are noted here so the type file is not forgotten:

- `FeedbackCommentDocument` — for the `feedback_comments` collection (schema in [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) §5.1 + the `departmentId` addition from Section 6 of this doc)
- `ReportDocument` — for the `reports` collection (schema in [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) §5.2)
- `ResultDocument` — for the live `results` collection (replaces the current mock-only structure; schema in Section 5 of this doc)
- `TermDocument` — for the `terms` collection (schema in Section 1 of this doc)

---

## 1. F-1 — Terms Management UI

> **Status: ✅ Complete — 2026-05-31.** Type, mock data, `TermForm` (Firestore-wired), list page, route, sidebar entry, and FormModal registration all done. `onSubmit` uses `DATA_MODE !== 'live'` guard (mock `termsData` IDs are strings, making the standard `typeof id !== "string"` guard unusable).

**Build tier:** 2 (no dependencies; highest-priority code item)

**Why this is the single most impactful prerequisite:** F-1 gates D-4, D-5, and A-2. Until real `terms` documents exist in Firestore, `results` records cannot carry a valid `termId`, which means D-5 cannot produce real data, which means A-2 has nothing to aggregate over, which means A-3 cannot run.

**Current state:** `TermStatus` type exists in [`src/lib/firebase.ts:25`](../src/lib/firebase.ts#L25). The `terms` Firestore rules are published (see [`firebase-rules.md`](./firebase-rules.md)). Nothing else exists.

---

### 1a. `TermDocument` type

**File:** [`src/lib/firebase.ts`](../src/lib/firebase.ts)

Add alongside the other document types:

```ts
export type TermDocument = {
  name: string;           // e.g. "Spring 2026"
  institutionId: string;
  startDate: string;      // ISO 8601 date string
  endDate: string;        // ISO 8601 date string
  status: TermStatus;     // 'upcoming' | 'active' | 'closed'
};
```

---

### 1b. Mock data

**File:** [`src/lib/data.ts`](../src/lib/data.ts)

No `_termsData` array and no `termsData` export exist. Add a mock array and conditional export following the same pattern as the existing collections:

```ts
const _termsData = [
  {
    id: "term-1",
    name: "Spring 2026",
    institutionId: "mock-inst",
    startDate: "2026-01-10",
    endDate: "2026-05-30",
    status: "active" as const,
  },
  {
    id: "term-2",
    name: "Fall 2025",
    institutionId: "mock-inst",
    startDate: "2025-08-25",
    endDate: "2025-12-20",
    status: "closed" as const,
  },
];

export const termsData = USE_MOCK ? _termsData : [];
```

---

### 1c. `TermForm` component

**File:** `src/components/forms/TermForm.tsx` (does not exist — create new)

Fields required:
- `name` — text input (required)
- `startDate` — date input (required)
- `endDate` — date input (required)
- `status` — select dropdown: `upcoming` / `active` / `closed` (required)

The `onSubmit` should write to `terms/{auto-id}` via `addDoc` on create and `updateDoc` on edit. `institutionId` is injected from `useAuth()`.

---

### 1d. Terms list page

**File:** `src/scenes/(dashboard)/list/terms/index.tsx` (does not exist — create new)

Standard list-page pattern: table of terms with name, status, start/end dates; create/edit/delete actions via `FormModal`. Accessible to `institution_admin` and `super_admin` only (terms are admin-managed per the published Firestore rules).

---

### 1e. Route registration

**File:** [`src/App.tsx`](../src/App.tsx)

No `/list/terms` route is registered. Add:

```tsx
import TermListPage from "@/scenes/(dashboard)/list/terms";

// inside <Routes>:
<Route path="/list/terms" element={<TermListPage />} />
```

---

### 1f. Sidebar menu entry

**File:** [`src/components/Menu.tsx`](../src/components/Menu.tsx)

No "Terms" entry exists. Add to the `menuItems` array (logical position: after "Classes", before "Lessons"):

```ts
{
  icon: "/calendar.png",   // or a dedicated terms icon if one is added to /public
  label: "Terms",
  href: "/list/terms",
  visible: ["super_admin", "institution_admin"],
},
```

---

### 1g. FormModal registration

**File:** [`src/components/FormModal.tsx`](../src/components/FormModal.tsx)

`TermForm` must be registered via `React.lazy()` in the modal dispatcher using the same pattern as all other forms.

---

## 2. D-1 + D-2 — Teacher/Student CRUD → Firestore

> **Status: ✅ Complete (edit paths) / ⚠️ 2c deferred.** `TeacherForm` and `StudentForm` wired for edit paths only — by design, creation goes through the `create-user` flow. Live list-page queries (2c) explicitly deferred.

**Build tier:** 2 (no dependencies; can run in parallel with F-1)

**Current state:** `TeacherForm.tsx` and `StudentForm.tsx` both exist with full Zod validation schemas, but every `onSubmit` handler is `console.log(data)`. All list-page data comes from the `teachersData` / `studentsData` mock arrays in [`src/lib/data.ts`](../src/lib/data.ts). Firestore rules for both collections are published and require no changes.

---

### 2a. TeacherForm — wire `onSubmit`

**File:** [`src/components/forms/TeacherForm.tsx`](../src/components/forms/TeacherForm.tsx)

Replace `console.log(data)` with:

```ts
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';

// inside component:
const { user, institutionId } = useAuth();

const onSubmit = handleSubmit(async (data) => {
  if (type === 'create') {
    await addDoc(collection(db, 'teachers'), {
      ...data,
      institutionId,
      createdAt: new Date().toISOString(),
    });
  } else {
    await updateDoc(doc(db, 'teachers', formData.id), { ...data });
  }
});
```

The `teachers` collection also requires a parallel write to `users/{uid}` when creating — coordinate with the existing create-user flow.

---

### 2b. StudentForm — wire `onSubmit`

**File:** [`src/components/forms/StudentForm.tsx`](../src/components/forms/StudentForm.tsx)

Same pattern as TeacherForm above, targeting the `students` collection. Per OI-7 (tracked in [`ISSUES_AND_GAPS.md`](./ISSUES_AND_GAPS.md)), student creation also needs to write to the `students` collection in addition to `users/{uid}`.

---

### 2c. List pages — swap mock → live queries

Both `TeacherListPage` and `StudentListPage` currently consume the mock arrays. Once the forms write to Firestore, the list pages need to switch to `getDocs` / `onSnapshot` queries filtered by `institutionId`. This is the `DATA_MODE === 'live'` branch in the data layer.

---

## 3. D-4 — Class CRUD → Firestore

> **Status: ✅ Complete — 2026-05-31.** `ClassForm.onSubmit` wired (`addDoc`/`updateDoc`), `ClassDocument` type added.

**Build tier:** 3 (depends on F-1 per the prerequisites doc — see dependency note below)

**Current state:** `ClassForm.tsx` exists with a `console.log` stub. Mock class data ([`src/lib/data.ts:601-672`](../src/lib/data.ts#L601-L672)) has shape `{id, name, capacity, grade, supervisor}` — no `termId`, no `institutionId`.

---

### 3a. Dependency clarification

The prerequisites doc states D-4 depends on F-1 "for `termId` on class documents." The current mock data and the published `classes` Firestore rules make no reference to `termId`. **This dependency should be confirmed before D-4 is started:**

- If classes are **perpetual entities** (e.g. "Grade 5A" exists across multiple terms), D-4 does not depend on F-1 and can be built in Tier 2 alongside D-1/D-2.
- If classes are **term-bound** (e.g. "Spring 2026 — Grade 5A" is a distinct document per term), D-4 depends on F-1 and must include a `termId` field in both the form and the Firestore document.

Until this is confirmed, treat D-4 as Tier 3.

---

### 3b. ClassForm — wire `onSubmit`

**File:** [`src/components/forms/ClassForm.tsx`](../src/components/forms/ClassForm.tsx)

Replace `console.log(data)` with `addDoc` / `updateDoc` calls targeting the `classes` collection. `institutionId` injected from `useAuth()`.

If classes are term-bound, add a `termId` selector populated from the `terms` collection (requires F-1 to be built first).

---

### 3c. `ClassDocument` type

**File:** [`src/lib/firebase.ts`](../src/lib/firebase.ts)

No `ClassDocument` type exists. Add:

```ts
export type ClassDocument = {
  name: string;
  capacity: number;
  grade: number;
  institutionId: string;
  classTeacherId?: string;   // links to teachers/{uid} — used by isClassTeacherFor()
  departmentId?: string;
  termId?: string;           // only if classes are term-bound
};
```

> **Note:** `classTeacherId` is required by the published `isClassTeacherFor()` helper in the Firestore rules. It must be present on every `classes` document for the attendance and results write rules to resolve correctly.

---

## 4. N-2 — Grading Config UI

> **Status: ✅ Complete — 2026-05-31.** Settings page grading dropdown reads/writes `institutions/{id}.gradingSystem` via Firestore. `institutions` update rule expanded to allow `institution_admin` — published 2026-05-31.

**Build tier:** 3 (N-1 resolved; depends on 0a and 0b being done, and on the institutions rule below)

**Current state:** The settings page ([`src/scenes/(dashboard)/settings/index.tsx:479-509`](../src/scenes/(dashboard)/settings/index.tsx#L479-L509)) already has an "Academic structure" section with a `<Section>` titled "Academic structure" containing a static "Grading scale" dropdown. That dropdown has options `A-F / Percentage / Standards-based` — wrong options for this feature, and it is not connected to Firestore.

---

### 4a. Settings page change

**File:** [`src/scenes/(dashboard)/settings/index.tsx`](../src/scenes/(dashboard)/settings/index.tsx)

Replace the static "Grading scale" `<select>` (approximately lines 492–499) with a controlled dropdown that:

1. Reads `institutions/{institutionId}.gradingSystem` on mount (via `getDoc`)
2. Defaults to `'flat'` if the field is absent (new institutions)
3. Writes back to the institution document on change (via `updateDoc`)

```tsx
// Controlled state (add to component):
const [gradingSystem, setGradingSystem] = useState<GradingSystem>('flat');

// On mount — load current value:
useEffect(() => {
  if (!institutionId) return;
  getDoc(doc(db, 'institutions', institutionId)).then((snap) => {
    if (snap.exists()) {
      setGradingSystem(snap.data().gradingSystem ?? 'flat');
    }
  });
}, [institutionId]);

// Handler:
const handleGradingSystemChange = async (value: GradingSystem) => {
  setGradingSystem(value);
  await updateDoc(doc(db, 'institutions', institutionId!), { gradingSystem: value });
};

// JSX — replace existing static <select>:
<label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
  Grading system
</label>
<select
  value={gradingSystem}
  onChange={(e) => handleGradingSystemChange(e.target.value as GradingSystem)}
  className={`${inputClassName} mt-1`}
>
  <option value="flat">Flat (single score per assessment)</option>
  <option value="weighted">Weighted (multi-component with weights)</option>
</select>
```

This section is already gated behind `{isAdmin && (...)}`, so the dropdown is only visible to `institution_admin` and `super_admin`.

---

### 4b. Institutions Firestore rule — NEWLY IDENTIFIED GAP

**This gap is not yet documented in [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) or [`firebase-rules.md`](./firebase-rules.md).**

**Current published rule** ([`firebase-rules.md:331-336`](./firebase-rules.md#L331-L336)):

```
match /institutions/{institutionId} {
  allow read: if isSignedIn();
  allow create: if isSuperAdmin();
  allow update: if isSuperAdmin();
  allow delete: if isSuperAdmin();
}
```

`institution_admin` cannot update their own institution document today. N-2 requires them to write `gradingSystem` to `institutions/{id}`. The rule must be updated:

```
match /institutions/{institutionId} {
  allow read: if isSignedIn();
  allow create: if isSuperAdmin();
  allow update: if isSuperAdmin()
    || (isAdmin() && myInstitutionId() == institutionId);
  allow delete: if isSuperAdmin();
}
```

**Actions required:**
1. Update [`firebase-rules.md`](./firebase-rules.md) with the expanded rule
2. Publish the updated rule to the Firebase Console
3. Update [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) to note this rule change as a prerequisite for N-2

---

## 5. D-5 — Results Data Model Rebuild

> **Status: ✅ Complete — 2026-05-31.** `_resultsData` rewritten to new schema, `ResultForm` rebuilt, `ResultDocument` type added, `ResultListPage` columns updated.

**Build tier:** 4 (depends on F-1 for `termId`; N-1 already resolved)

**Current state:** The `results` mock data ([`src/lib/data.ts:883-984`](../src/lib/data.ts#L883-L984)) and `ResultForm.tsx` are both severely out of date relative to the schema required for report generation.

---

### 5a. Current vs. required schema

**Current mock record shape:**

```ts
{
  id: number,
  subject: string,    // display name, not an ID
  class: string,      // display name, not an ID
  teacher: string,    // display name, not an ID
  student: string,    // display name, not an ID
  date: string,
  type: string,       // e.g. "exam"
  score: number,
}
```

**Required schema** (from [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) §2.2):

```ts
{
  studentId: string,       // UID — links to students/{id}
  teacherId: string,       // UID — links to teachers/{id}
  classId: string,         // links to classes/{id}
  termId: string,          // links to terms/{id}
  institutionId: string,   // multi-tenancy scoping
  departmentId: string,    // required by isSeniorTeacherFor() in Firestore rules
  assessmentName: string,  // e.g. "Midterm Exam", "Final Exam", "Assignment 1"
  score: number,
  maxScore: number,
  weight?: number,         // 0–1; present in weighted mode, absent in flat mode
  date?: string,           // ISO 8601; optional
}
```

**Field-by-field gap analysis:**

| Field | Status | Action |
|---|---|---|
| `studentId` | Missing — has `student` (display name) | Replace; requires D-2 to have real student UIDs |
| `teacherId` | Missing — has `teacher` (display name) | Replace; requires D-1 to have real teacher UIDs |
| `classId` | Missing — has `class` (display name) | Replace; requires D-4 |
| `termId` | Missing entirely | Add; requires F-1 |
| `institutionId` | Missing entirely | Add |
| `departmentId` | Missing entirely | Add (the published `results` Firestore rules already reference this field) |
| `assessmentName` | Missing — has `type: 'exam'` | Replace `type` with `assessmentName` string |
| `maxScore` | Missing entirely | Add |
| `weight` | Missing entirely | Add as optional |
| `score` | Present | Keep |
| `date` | Present | Keep as optional |

---

### 5b. Mock data overhaul

**File:** [`src/lib/data.ts`](../src/lib/data.ts)

All 10 records in `_resultsData` (lines 883–984) must be rewritten to match the new schema. Example:

```ts
const _resultsData = [
  {
    id: "result-1",
    studentId: "S-20001",
    teacherId: "T-10001",
    classId: "class-1a",
    termId: "term-1",
    institutionId: "mock-inst",
    departmentId: "dept-math",
    assessmentName: "Midterm Exam",
    score: 78,
    maxScore: 100,
    // weight absent → flat mode
    date: "2026-03-15",
  },
  // ... etc.
];
```

---

### 5c. `ResultForm` rebuild

**File:** [`src/components/forms/ResultForm.tsx`](../src/components/forms/ResultForm.tsx)

**Current state** (lines 1–61): Only `score` (number, 0–100) and `date` (date) fields. The Zod schema caps `score` at 100, which is wrong for `maxScore` being anything other than 100.

**Required fields:**

```ts
const schema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1),
  termId: z.string().min(1),
  assessmentName: z.string().min(1),
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().min(1),
  weight: z.coerce.number().min(0).max(1).optional(),
  date: z.string().optional(),
});
```

The `weight` field should be conditionally shown based on the institution's `gradingSystem` setting (read from Firestore or passed as a prop). `studentId`, `classId`, and `termId` should be populated from live Firestore selectors (or static selectors in mock mode).

---

### 5d. `ResultDocument` type

**File:** [`src/lib/firebase.ts`](../src/lib/firebase.ts)

Add:

```ts
export type ResultDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  assessmentName: string;
  score: number;
  maxScore: number;
  weight?: number;
  date?: string;
};
```

---

### 5e. ResultListPage column updates

The results list page currently renders `subject`, `class`, `teacher`, `student` as display-name strings. Once the schema moves to ID-based fields, the list page will need to either:
- Resolve display names via joins/lookups at query time, or
- Store denormalised display names alongside the IDs (e.g. `studentName`, `teacherName`) for list-page rendering

The simpler approach is denormalised display names. The Firestore rules do not restrict this.

---

## 6. N-3 — Publish `feedback_comments` Firestore Rules

> **Status: ✅ Complete — 2026-05-31.** Schema updated with `departmentId`; rules published to Firebase Console 2026-05-31.

**Build tier:** 4 (can be done any time after the schema is finalised)

**Current state:** Rules drafted in [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) §6.1. Not in [`firebase-rules.md`](./firebase-rules.md). Not in the Firebase Console.

---

### 6a. Schema fix required before publishing

**File to update:** [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) §5.1

The current `feedback_comments` schema in §5.1 does not include `departmentId`. The proposed create rule uses `isSeniorTeacherFor(request.resource.data.departmentId)`, which requires `departmentId` to be present on the document at write time. Without it, senior teacher creates will always fail.

**Add `departmentId` to the schema:**

```
feedback_comments/{docId}
  studentId      string
  teacherId      string
  classId        string
  termId         string
  institutionId  string
  departmentId   string    // ← ADD THIS — links to departments/{departmentId}
  comment        string
  createdAt      string    // ISO 8601
```

---

### 6b. Publish to Firebase Console

Once the schema is confirmed with `departmentId`, copy the rules from [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) §6.1 into the Firebase Console and update [`firebase-rules.md`](./firebase-rules.md) to include them.

**Rules to publish (from §6.1, no changes needed beyond confirming schema):**

```
match /feedback_comments/{docId} {
  allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

  allow create: if writingToMyInstitution()
    && (isAdminOrAbove()
      || isClassTeacherFor(request.resource.data.classId)
      || isSeniorTeacherFor(request.resource.data.departmentId));

  allow update: if sameInstitution(resource.data.institutionId)
    && (isAdminOrAbove()
      || (isTeacher() && resource.data.teacherId == request.auth.uid)
      || isSeniorTeacherFor(resource.data.departmentId))
    && institutionNotChanged();

  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

---

## 7. A-2 — `feedback_comments` Collection + Teacher Submission UI

> **Status: ✅ Complete — 2026-05-31.** `FeedbackCommentForm` with upsert logic, `/list/feedback` page, FormModal registration, route, sidebar entry, and mock data all done.

**Build tier:** 5 (depends on D-1, D-2, D-4, F-1)

**Current state:** Nothing exists. No form, no page, no Firestore writes, no collection.

---

### 7a. `FeedbackCommentForm` component

**File:** `src/components/forms/FeedbackCommentForm.tsx` (does not exist — create new)

**Fields:**

```ts
const schema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1),
  termId: z.string().min(1),
  comment: z.string().min(1).max(2000),
});
```

`teacherId`, `institutionId`, and `departmentId` are injected from `useAuth()` and not exposed to the user.

**`onSubmit`:** Upsert logic — query for an existing document matching `studentId + teacherId + classId + termId` before writing. If one exists, `updateDoc`. If not, `addDoc`. This enforces the one-comment-per-teacher-per-student-per-class-per-term invariant noted in the prerequisites doc.

---

### 7b. UI surface (UX decision pending)

Where the teacher submits feedback is not yet decided. Two options:
- **Student detail page** — inline form or modal triggered from the student's profile; most contextual
- **Dedicated `/feedback` page** — a standalone list of students the teacher can write comments for

The form component is the same either way. The surface decision affects routing and `Menu.tsx` only.

---

### 7c. `FeedbackCommentDocument` type

**File:** [`src/lib/firebase.ts`](../src/lib/firebase.ts)

```ts
export type FeedbackCommentDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  comment: string;
  createdAt: string;   // ISO 8601
};
```

---

### 7d. FormModal registration

**File:** [`src/components/FormModal.tsx`](../src/components/FormModal.tsx)

Register `FeedbackCommentForm` via `React.lazy()` in the modal dispatcher.

---

## 8. N-4 — Publish `reports` Firestore Rules

> **Status: ✅ Complete — 2026-05-31.** Rules drafted in `firebase-rules.md` and published to Firebase Console 2026-05-31.

**Build tier:** 6 (Firebase Console only; can run in parallel with A-2)

**Current state:** Rules drafted in [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) §6.2. Not in [`firebase-rules.md`](./firebase-rules.md). Not in the Firebase Console.

Copy the rules from §6.2 into the Firebase Console and update [`firebase-rules.md`](./firebase-rules.md):

```
match /reports/{docId} {
  allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

  // Institution admins generate for any student in their institution.
  // Senior teachers generate for students within their department scope.
  // Students and regular_teacher do not generate.
  allow create: if writingToMyInstitution()
    && (isAdmin()
      || isSeniorTeacherFor(request.resource.data.departmentId));

  // Re-generation: same conditions as create, applied on update.
  allow update: if sameInstitution(resource.data.institutionId)
    && (isAdmin()
      || isSeniorTeacherFor(resource.data.departmentId))
    && institutionNotChanged();

  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

> **Note on `departmentId` in reports:** When a `senior_teacher` generates a report, the document must include `departmentId` so `isSeniorTeacherFor` can resolve on re-generation. For `institution_admin`-generated reports, `departmentId` is absent — the `isAdmin()` branch does not require it.

---

## 9. A-3 — Report Generation Logic

> **Status: ✅ Complete — 2026-05-31.** `ReportDocument` type added to `firebase.ts`; `generateReport` utility created at `src/lib/generateReport.ts`.

**Build tier:** 7 (depends on D-5 and A-2)

**Current state:** Nothing exists.

---

### 9a. Core generation algorithm

```ts
async function generateReport(
  studentId: string,
  termId: string,
  institutionId: string,
  departmentId: string | null,   // null for institution_admin-generated
  generatedBy: string,           // uid
  generatedByRole: 'institution_admin' | 'senior_teacher',
) {
  // 1. Read institution to get gradingSystem snapshot
  const institutionSnap = await getDoc(doc(db, 'institutions', institutionId));
  const gradingSystem: GradingSystem = institutionSnap.data()?.gradingSystem ?? 'flat';

  // 2. Pull all results for this student in this term
  const resultsQuery = query(
    collection(db, 'results'),
    where('studentId', '==', studentId),
    where('termId', '==', termId),
    where('institutionId', '==', institutionId),
  );
  const resultsSnap = await getDocs(resultsQuery);
  const grades = resultsSnap.docs.map((d) => d.data() as ResultDocument);

  // 3. Pull all feedback_comments for this student in this term
  const feedbackQuery = query(
    collection(db, 'feedback_comments'),
    where('studentId', '==', studentId),
    where('termId', '==', termId),
    where('institutionId', '==', institutionId),
  );
  const feedbackSnap = await getDocs(feedbackQuery);
  const feedback = feedbackSnap.docs.map((d) => d.data() as FeedbackCommentDocument);

  // 4. Compute overallScore
  let overallScore = 0;
  if (grades.length > 0) {
    if (gradingSystem === 'flat') {
      const sum = grades.reduce((acc, g) => acc + (g.score / g.maxScore) * 100, 0);
      overallScore = sum / grades.length;
    } else {
      // weighted: Σ(score / maxScore × weight)
      overallScore = grades.reduce((acc, g) => acc + (g.score / g.maxScore) * (g.weight ?? 1), 0);
    }
  }

  // 5. Check for existing report (upsert)
  const existingQuery = query(
    collection(db, 'reports'),
    where('studentId', '==', studentId),
    where('termId', '==', termId),
    where('institutionId', '==', institutionId),
  );
  const existingSnap = await getDocs(existingQuery);

  const payload: ReportDocument = {
    studentId,
    termId,
    institutionId,
    generatedAt: new Date().toISOString(),
    generatedBy,
    generatedByRole,
    gradingSystem,           // snapshot at generation time
    departmentId: departmentId ?? undefined,
    grades,
    feedback,
    overallScore,
  };

  if (!existingSnap.empty) {
    await updateDoc(existingSnap.docs[0].ref, payload);
  } else {
    await addDoc(collection(db, 'reports'), payload);
  }
}
```

---

### 9b. Edge cases to handle

| Case | Handling |
|---|---|
| No results yet for student+term | `grades` array is empty; `overallScore` = 0; report still writes |
| No feedback_comments yet | `feedback` array is empty; report still writes |
| Weighted mode where weights don't sum to 1.0 | App layer should warn the user; the report still generates with the actual computed value — the `overallScore` will reflect whatever the weights add up to |
| Re-generation after grade correction | Detect existing report via the upsert query; `updateDoc` overwrites grades/feedback/overallScore snapshot |
| `senior_teacher` generating — must include `departmentId` | Validate that `departmentId` is present before calling `generateReport`; the Firestore `create` rule will also enforce this |

---

### 9c. `ReportDocument` type

**File:** [`src/lib/firebase.ts`](../src/lib/firebase.ts)

```ts
export type ReportDocument = {
  studentId: string;
  termId: string;
  institutionId: string;
  generatedAt: string;
  generatedBy: string;
  generatedByRole: string;
  gradingSystem: GradingSystem;
  departmentId?: string;
  grades: ResultDocument[];
  feedback: FeedbackCommentDocument[];
  overallScore: number;
};
```

---

## 10. N-5 — `/reports` Page + Sidebar Link

> **Status: ✅ Complete — 2026-05-31.** `/reports` page with role-scoped table, generate panel, and per-row re-generate action; route and sidebar entry added.

**Build tier:** 7 (can be scaffolded before A-3 is complete; wire generation last)

**Current state:** No route registered in [`src/App.tsx`](../src/App.tsx), no page component, no menu entry.

---

### 10a. New page

**File:** `src/scenes/(dashboard)/reports/index.tsx` (does not exist — create new)

**Role-scoped display:**

| Role | What they see |
|---|---|
| `super_admin` | All reports across all institutions |
| `institution_admin` | All reports in their institution; "Generate report" button per student |
| `senior_teacher` | Reports for students in their department; "Generate report" button per student |
| `regular_teacher` | Reports for students in their classes (read-only) |
| `student` | Only their own reports |
| `parent` | Only their linked child's reports |

**Filter controls:** Student selector and term selector (for admin/teacher views).

**Generate button:** Visible only to `institution_admin` and `senior_teacher`. Calls the `generateReport` function from A-3.

---

### 10b. Route registration

**File:** [`src/App.tsx`](../src/App.tsx)

```tsx
import ReportsPage from "@/scenes/(dashboard)/reports";

// inside <Routes>:
<Route path="/reports" element={<ReportsPage />} />
```

---

### 10c. Sidebar menu entry

**File:** [`src/components/Menu.tsx`](../src/components/Menu.tsx)

Add to `menuItems` (logical position: after "Results", before "Events"):

```ts
{
  icon: "/result.png",   // or a dedicated reports icon if added to /public
  label: "Reports",
  href: "/reports",
  visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
},
```

---

## 11. Master Summary Table

All changes required before A-3, grouped by type and ordered by build tier. Items within the same tier have no mutual dependency.

| Tier | ID | Type | Change | File(s) | Status |
|---|---|---|---|---|---|
| — | 0a | TypeScript | Add `GradingSystem` type | [`src/lib/firebase.ts`](../src/lib/firebase.ts) | ✅ Done (2026-05-31) |
| — | 0b | TypeScript | Add `gradingSystem` to `InstitutionDocument` | [`src/lib/firebase.ts`](../src/lib/firebase.ts) | ✅ Done (2026-05-31) |
| 2 | F-1a | TypeScript | Add `TermDocument` type | [`src/lib/firebase.ts`](../src/lib/firebase.ts) | ✅ Done (2026-05-31) |
| 2 | F-1b | Code | Add `_termsData` mock array + `termsData` export | [`src/lib/data.ts`](../src/lib/data.ts) | ✅ Done (2026-05-31) |
| 2 | F-1c | New component | `TermForm.tsx` | `src/components/forms/TermForm.tsx` | ✅ Done (2026-05-31) |
| 2 | F-1d | New page | Terms list page | `src/scenes/(dashboard)/list/terms/index.tsx` | ✅ Done (2026-05-31) |
| 2 | F-1e | Route | Register `/list/terms` | [`src/App.tsx`](../src/App.tsx) | ✅ Done (2026-05-31) |
| 2 | F-1f | Navigation | Add "Terms" sidebar entry | [`src/components/Menu.tsx`](../src/components/Menu.tsx) | ✅ Done (2026-05-31) |
| 2 | F-1g | Modal | Register `TermForm` in modal dispatcher | [`src/components/FormModal.tsx`](../src/components/FormModal.tsx) | ✅ Done (2026-05-31) |
| 2 | D-1 | Code | Wire `TeacherForm.onSubmit` → Firestore | [`src/components/forms/TeacherForm.tsx`](../src/components/forms/TeacherForm.tsx) | ✅ Done (2026-05-31) — edit path only; create via create-user flow |
| 2 | D-2 | Code | Wire `StudentForm.onSubmit` → Firestore | [`src/components/forms/StudentForm.tsx`](../src/components/forms/StudentForm.tsx) | ✅ Done (2026-05-31) — edit path only; create via create-user flow |
| 3 | D-4 | Code | Wire `ClassForm.onSubmit` → Firestore | [`src/components/forms/ClassForm.tsx`](../src/components/forms/ClassForm.tsx) | ✅ Done (2026-05-31) |
| 3 | D-4 | TypeScript | Add `ClassDocument` type | [`src/lib/firebase.ts`](../src/lib/firebase.ts) | ✅ Done (2026-05-31) |
| 3 | N-2a | Code | Replace static grading dropdown with live Firestore read/write | [`src/scenes/(dashboard)/settings/index.tsx`](../src/scenes/(dashboard)/settings/index.tsx) | ✅ Done (2026-05-31) |
| 3 | **N-2b** | **Firebase Console + doc** | **Expand `institutions` update rule to allow `institution_admin`** | **[`firebase-rules.md`](./firebase-rules.md) + Firebase Console** | ✅ Console — published (2026-05-31) |
| 4 | D-5a | Data | Rebuild `_resultsData` mock records to new schema | [`src/lib/data.ts`](../src/lib/data.ts) | ✅ Done (2026-05-31) |
| 4 | D-5b | Form rebuild | Rebuild `ResultForm` with new fields | [`src/components/forms/ResultForm.tsx`](../src/components/forms/ResultForm.tsx) | ✅ Done (2026-05-31) |
| 4 | D-5c | TypeScript | Add `ResultDocument` type | [`src/lib/firebase.ts`](../src/lib/firebase.ts) | ✅ Done (2026-05-31) |
| 4 | D-5d | Code | Update `ResultListPage` columns | `src/scenes/(dashboard)/list/results/index.tsx` | ✅ Done (2026-05-31) |
| 4 | N-3a | Doc | Add `departmentId` to `feedback_comments` schema in §5.1 | [`REPORT_GENERATION_PREREQUISITES.md`](./REPORT_GENERATION_PREREQUISITES.md) | ✅ Done (2026-05-31) |
| 4 | N-3b | Firebase Console + doc | Publish `feedback_comments` rules | [`firebase-rules.md`](./firebase-rules.md) + Firebase Console | ✅ Console — published (2026-05-31) |
| 5 | A-2a | New component | `FeedbackCommentForm.tsx` with upsert logic | `src/components/forms/FeedbackCommentForm.tsx` | ✅ Done (2026-05-31) |
| 5 | A-2b | TypeScript | Add `FeedbackCommentDocument` type | [`src/lib/firebase.ts`](../src/lib/firebase.ts) | ✅ Done (2026-05-31) |
| 5 | A-2c | Modal | Register `FeedbackCommentForm` in modal dispatcher | [`src/components/FormModal.tsx`](../src/components/FormModal.tsx) | ✅ Done (2026-05-31) |
| 6 | N-4 | Firebase Console + doc | Publish `reports` rules | [`firebase-rules.md`](./firebase-rules.md) + Firebase Console | ✅ Console — published (2026-05-31) |
| 7 | A-3 | New feature | Report generation logic | `src/lib/generateReport.ts` | ✅ Done (2026-05-31) |
| 7 | A-3 | TypeScript | Add `ReportDocument` type | [`src/lib/firebase.ts`](../src/lib/firebase.ts) | ✅ Done (2026-05-31) |
| 7 | N-5a | New page | `/reports` page | `src/scenes/(dashboard)/reports/index.tsx` | ✅ Done (2026-05-31) |
| 7 | N-5b | Route | Register `/reports` | [`src/App.tsx`](../src/App.tsx) | ✅ Done (2026-05-31) |
| 7 | N-5c | Navigation | Add "Reports" sidebar entry | [`src/components/Menu.tsx`](../src/components/Menu.tsx) | ✅ Done (2026-05-31) |
| — | 2c | Code | Swap list pages to live Firestore queries (teachers, students, results, terms) | list page components | ⚠️ Deferred |
| — | OI-2 | Form | Parent linked-students multi-select | `src/components/forms/ParentForm.tsx` | ✅ Done (2026-05-31) |
| — | OI-3 | Form | Class supervisor dropdown | `src/components/forms/ClassForm.tsx` | ⚠️ Deferred |

> **N-2b note:** The `institutions` update rule expansion (row N-2b) was identified as a new gap during implementation and published to the Firebase Console on 2026-05-31.

---

## 12. Deferred Items

Items intentionally left incomplete. Each entry records what the item is, why it was deferred, and what must be true before it can be unblocked.

---

### 2c — Live Firestore Queries in Teacher/Student/Results/Terms List Pages

**What:** Replace all `teachersData`, `studentsData`, `resultsData`, `termsData` mock array consumers in list pages with `getDocs` / `onSnapshot` queries filtered by `institutionId`.

**Why deferred:** The CRUD forms (D-1 through D-5) are now wired to write to Firestore in live mode. Until Firestore is seeded with real institution data, swapping list pages to live queries would produce empty tables in all dev environments. Deferring until live data exists avoids breaking the development workflow.

**Unblocked by:** Real institution data seeded in the Firebase project; `DATA_MODE` set to `'live'` in the target environment.

**Files to update when unblocking:**

- `src/scenes/(dashboard)/list/teachers/index.tsx`
- `src/scenes/(dashboard)/list/students/index.tsx`
- `src/scenes/(dashboard)/list/results/index.tsx`
- `src/scenes/(dashboard)/list/terms/index.tsx`

---

### OI-2 — Parent Form Linked-Students Multi-Select ✅ Complete — 2026-05-31

**What:** Replace the free-text `linkedAccounts` input in `ParentForm.tsx` with a multi-select populated from the `students` collection, writing to the `student_parents` join collection.

**Implementation:** Checkbox list populated from `studentsData` mock array (same approach as `FeedbackCommentForm` for students — no dependency on 2c). Existing links loaded on mount via `getDocs` query so current selections are pre-checked. On submit: `writeBatch` writes `parents/{uid}` profile fields and `setDoc` (merge) writes `student_parents/{uid}_{studentId}` for each checked student. New links are additive — removal of existing links on uncheck is deferred.

---

### OI-3 — Class Supervisor Dropdown (ClassForm)

**What:** Replace the free-text `supervisor` field in `ClassForm.tsx` with a dropdown populated from the live `teachers` collection.

**Why deferred:** Requires live teacher data (depends on 2c for the teachers list page, or a direct Firestore query in the form). Until teachers exist in Firestore the dropdown would be empty, making the form worse than the current free-text field.

**Unblocked by:** 2c completed for teachers, or a direct `getDocs(collection(db, "teachers"))` query added to `ClassForm` on mount.

---

*End of implementation checklist. All sections §0–§10 complete as of 2026-05-31. OI-2 complete as of 2026-05-31. Two items explicitly deferred — see §12: 2c (live Firestore list queries) and OI-3 (class supervisor dropdown).*
