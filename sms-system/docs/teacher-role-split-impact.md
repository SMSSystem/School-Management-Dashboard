# Impact Analysis — Splitting `teacher` into `senior_teacher` / `regular_teacher`

> **Generated:** 2026-05-27
> **Branch:** `main` (commit `15b2198`)
> **Status:** ✅ Implemented — all code, rules, and documentation changes applied (2026-05-27)
> **Scope:** Full codebase impact of promoting `teachers.teacherType` from a subtype field into two
> distinct top-level roles: `senior_teacher` and `regular_teacher`

---

> **Revision — 2026-05-27 (Phase 1 result)**
> Running `tsc -p tsconfig.app.json --noEmit` after the `firebase.ts` change surfaced 15 errors
> across 8 files. Five files were not in the original analysis:
> `list/assignments/index.tsx`, `list/exams/index.tsx`, `list/results/index.tsx`,
> `profile/index.tsx`, and `settings/index.tsx`. A new §8 has been added to document the required
> changes in these files. §§9–13 are renumbered from the original §§8–12. The change summary
> (§12) and suggested implementation order (§13) have been updated accordingly.

---

## Table of Contents

1. [Spec alignment note](#1-spec-alignment-note)
2. [Recorded decisions](#2-recorded-decisions)
3. [Type system — `firebase.ts`](#3-type-system--firebasets)
4. [Auth context — `AuthContext.tsx`](#4-auth-context--authcontexttsx)
5. [Create user form — `SuperAdminCreateUserForm.tsx`](#5-create-user-form--superadmincreateuserformtsx)
6. [Routing — `App.tsx`](#6-routing--apptsx)
7. [Navigation — `Menu.tsx`](#7-navigation--menutsx)
8. [Additional pages with inline role comparisons](#8-additional-pages-with-inline-role-comparisons)
9. [Firebase Security Rules](#9-firebase-security-rules)
10. [Firestore schema changes](#10-firestore-schema-changes)
11. [New files to create](#11-new-files-to-create)
12. [Change summary](#12-change-summary)
13. [Suggested implementation order](#13-suggested-implementation-order)

---

## 1. Spec alignment note

**`sms-system/docs/sms-role-specification-v1.md` §3.6 explicitly chose not to split the role:**

> *"Auth role stays `teacher`; the `teachers.teacherType` field gates the additional capabilities
> inside the app."*

The current implementation (auth role = `'teacher'`, subtype on `teachers.teacherType`) is the
spec's deliberate design. Proceeding with this change is an intentional departure from that
decision.

**Required spec update on implementation:** bump the spec version number, update §1.1 (the roles
table), §3.6 (senior teacher subrole), and the Changelog at the bottom of
`sms-role-specification-v1.md`.

---

## 2. Recorded decisions

The following scoping decisions were made before this analysis was written and apply to every section
below.

| # | Decision | Choice |
|---|----------|--------|
| D1 | Dashboard pages | Two **separate** pages: `SeniorTeacherPage` and `RegularTeacherPage` |
| D2 | `teachers.teacherType` | **Kept** as a denormalized mirror on the `teachers` document. Written at create time, derived from the selected role — the admin no longer picks it explicitly on the form. |
| D3 | `teacherType` in auth context | **Kept** — `AuthContextValue` retains `teacherType: TeacherType \| null`; the inner `teachers/{uid}` read in `fetchRole` is preserved. |
| D4 | `teacherType` form field | **Removed** from `SuperAdminCreateUserForm`. Derived automatically from the selected role at write time. |

> **D2 consistency obligation:** because `teacherType` is kept on the `teachers` document as a
> mirror of the role, any flow that creates or updates a teacher must write both `users.role` and
> `teachers.teacherType` in the same atomic operation. If a user's role is ever changed from
> `regular_teacher` to `senior_teacher` (or vice versa), the `teachers/{uid}.teacherType` field
> must be updated in the same batch.

---

## 3. Type system — `firebase.ts`

**File:** `src/lib/firebase.ts`
**Status: ✅ Complete**

### 3.1 `Role` union type

```ts
// BEFORE
export type Role = 'super_admin' | 'institution_admin' | 'teacher' | 'student' | 'parent';

// AFTER
export type Role =
  | 'super_admin'
  | 'institution_admin'
  | 'senior_teacher'
  | 'regular_teacher'
  | 'student'
  | 'parent';
```

### 3.2 `TeacherType`

No change. The type is still used to type the denormalized `teachers.teacherType` field and the
`teacherType` value on the auth context.

```ts
// UNCHANGED
export type TeacherType = 'regular' | 'senior';
```

### 3.3 `getRoleLabel()`

```ts
// BEFORE
const labels: Record<Role, string> = {
  super_admin: 'Super Admin',
  institution_admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

// AFTER
const labels: Record<Role, string> = {
  super_admin: 'Super Admin',
  institution_admin: 'Admin',
  senior_teacher: 'Senior Teacher',
  regular_teacher: 'Regular Teacher',
  student: 'Student',
  parent: 'Parent',
};
```

---

## 4. Auth context — `AuthContext.tsx`

**File:** `src/lib/AuthContext.tsx`

### What does NOT change

- `AuthContextValue` interface — `teacherType: TeacherType | null` is kept (decision D3).
- The inner `try/catch` block that reads `teachers/{uid}` is kept.
- The `setTeacherType(...)` call is kept.

### What changes

**One line in `fetchRole`** — the condition that gates the teacher-profile read:

```ts
// BEFORE
if (fetchedRole === 'teacher') {
  try {
    const teacherSnap = await getDoc(doc(db, 'teachers', uid));
    const raw = teacherSnap.data()?.teacherType;
    setTeacherType(raw === 'regular' || raw === 'senior' ? raw : null);
  } catch {
    // Non-fatal: supplementary teacher profile could not be read.
    setTeacherType(null);
  }
}

// AFTER
if (fetchedRole === 'senior_teacher' || fetchedRole === 'regular_teacher') {
  try {
    const teacherSnap = await getDoc(doc(db, 'teachers', uid));
    const raw = teacherSnap.data()?.teacherType;
    setTeacherType(raw === 'regular' || raw === 'senior' ? raw : null);
  } catch {
    // Non-fatal: supplementary teacher profile could not be read.
    setTeacherType(null);
  }
}
```

> **Note:** With split roles, `teacherType` on the context is technically derivable from the role
> itself (`role === 'senior_teacher'` implies `teacherType === 'senior'`). It is kept per decision
> D3. Components that currently read `teacherType` from context will continue to work without
> change.

---

## 5. Create user form — `SuperAdminCreateUserForm.tsx`

**File:** `src/components/forms/SuperAdminCreateUserForm.tsx`

Five touch points, one removal.

### 5.1 `roleOptions` array

```ts
// BEFORE
const roleOptions: Role[] = ['institution_admin', 'teacher', 'student', 'parent', 'super_admin'];

// AFTER
const roleOptions: Role[] = [
  'institution_admin',
  'senior_teacher',
  'regular_teacher',
  'student',
  'parent',
  'super_admin',
];
```

### 5.2 Zod schema — `role` enum

```ts
// BEFORE
role: z.enum(['institution_admin', 'teacher', 'student', 'parent', 'super_admin']),

// AFTER
role: z.enum(['institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent', 'super_admin']),
```

### 5.3 Zod schema — `teacherType` field and `superRefine` validation

The `teacherType` form field is removed (decision D4). The `superRefine` block that validates it is
also removed. `teacherType` will be derived from the selected role at write time (see §5.5).

```ts
// BEFORE — in schema object
teacherType: z.enum(['regular', 'senior']).optional(),

// AFTER — field removed entirely from the schema

// BEFORE — in superRefine
if (values.role === 'teacher' && !values.teacherType) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['teacherType'],
    message: 'Teacher type is required for teacher accounts.',
  });
}

// AFTER — block removed entirely
```

### 5.4 Derived state and `useEffect`

```ts
// BEFORE
const isTeacherRole = selectedRole === 'teacher';

useEffect(() => {
  if (!isTeacherRole) {
    setValue('teacherType', undefined, { shouldValidate: false });
  }
}, [isTeacherRole, setValue]);

// AFTER
const isTeacherRole = selectedRole === 'senior_teacher' || selectedRole === 'regular_teacher';

// useEffect that cleared teacherType — removed entirely (field no longer exists on the form)
```

### 5.5 `onSubmit` batch write

```ts
// BEFORE
if (values.role === 'teacher') {
  batch.set(doc(db, 'teachers', createdUser.uid), {
    uid: createdUser.uid,
    institutionId: values.institutionId,
    teacherType: values.teacherType,           // ← came from form field
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
}

// AFTER
if (values.role === 'senior_teacher' || values.role === 'regular_teacher') {
  batch.set(doc(db, 'teachers', createdUser.uid), {
    uid: createdUser.uid,
    institutionId: values.institutionId,
    teacherType: values.role === 'senior_teacher' ? 'senior' : 'regular',  // ← derived from role
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });
}
```

### 5.6 `teacherType` form field UI

The conditional `{isTeacherRole && (<label>Teacher type…</label>)}` block is **removed** from the
JSX entirely. `isTeacherRole` is still used (updated in §5.4) to control the Institution ID field's
disabled state and placeholder text.

### 5.7 `defaultValues`

```ts
// BEFORE
const defaultValues: FormValues = {
  ...
  teacherType: undefined,
};

// AFTER — teacherType key removed from defaultValues
```

---

## 6. Routing — `App.tsx`

**File:** `src/App.tsx`

### 6.1 New imports

```ts
// Add:
import SeniorTeacherPage from "@/scenes/(dashboard)/senior-teacher";
import RegularTeacherPage from "@/scenes/(dashboard)/regular-teacher";

// Remove:
import TeacherPage from "@/scenes/(dashboard)/teacher";
```

> The existing `src/scenes/(dashboard)/teacher/index.tsx` can be repurposed as `RegularTeacherPage`
> (moved to `regular-teacher/`) or deleted if both new pages are written from scratch. See §11.

### 6.2 `defaultPath` logic

```ts
// BEFORE
role === 'teacher' ? <TeacherPage /> :

// AFTER
role === 'senior_teacher' ? <SeniorTeacherPage /> :
role === 'regular_teacher' ? <RegularTeacherPage /> :
```

No new `<Route>` elements are needed — both teacher subtypes share the same existing route
hierarchy (`/`, `/list/teachers`, etc.).

---

## 7. Navigation — `Menu.tsx`

**File:** `src/components/Menu.tsx`

Every `visible` array that currently contains `'teacher'` must be updated to contain both
`'senior_teacher'` and `'regular_teacher'`. There are **15 menu items** affected. The change is
identical for each:

```ts
// Before (each affected item)
visible: [..., "teacher", ...],

// After
visible: [..., "senior_teacher", "regular_teacher", ...],
```

The `role && item.visible.includes(role)` check in the render loop works without any logic change —
only the string values update.

---

## 8. Additional pages with inline role comparisons

**Discovered:** Phase 1 TypeScript check (`tsc -p tsconfig.app.json --noEmit`)

These five files were not identified in the original analysis. They contain inline `role ===
"teacher"` comparisons that TypeScript flagged as errors once `'teacher'` was removed from the
`Role` union in §3.

---

### 8.1 List pages — Assignments, Exams, Results

**Files:**

- `src/scenes/(dashboard)/list/assignments/index.tsx` (lines 56, 83)
- `src/scenes/(dashboard)/list/exams/index.tsx` (lines 54, 79)
- `src/scenes/(dashboard)/list/results/index.tsx` (lines 71, 96)

Each file has **two identical occurrences** of the same condition — one inside `renderRow`
(controls the edit/delete action buttons per row) and one in the top bar (controls the create
button). The fix is identical in both places within each file, and the same pattern applies across
all three files.

```tsx
// BEFORE (both occurrences, all three files)
{(role === "institution_admin" || role === "super_admin" || role === "teacher") && (

// AFTER (both occurrences, all three files)
{(role === "institution_admin" || role === "super_admin" || role === "senior_teacher" || role === "regular_teacher") && (
```

Both teacher roles retain write access — this matches spec §1.2 where both regular and senior
teachers can create and update lessons, exams, assignments, and results.

---

### 8.2 Profile page

**File:** `src/scenes/(dashboard)/profile/index.tsx` (lines 117, 179)

The page maintains two `Record<Role, ...>` object literals keyed by every role. Both must have the
`teacher` key replaced by separate `senior_teacher` and `regular_teacher` keys. Both new keys
receive the same mock data as the former `teacher` key — differentiation between them can be added
when the profile page is connected to live Firestore data.

**`profileByRole` object (line 117):**

```tsx
// BEFORE
teacher: {
  name: teacher.name,
  email: teacher.email,
  phone: teacher.phone,
  photo: teacher.photo,
  userId: `T-${teacher.teacherId}`,
  status: "Active",
  createdAt: "Aug 18, 2023",
  lastLogin: "Jan 29, 2026 - 08:05 AM",
  linkedAccounts: "Google Classroom",
  emergencyContact: "Alex Rivera - 5550138",
  timezone: "America/Chicago",
  language: "English (US)",
  address: teacher.address,
},

// AFTER
senior_teacher: {
  name: teacher.name,
  email: teacher.email,
  phone: teacher.phone,
  photo: teacher.photo,
  userId: `T-${teacher.teacherId}`,
  status: "Active",
  createdAt: "Aug 18, 2023",
  lastLogin: "Jan 29, 2026 - 08:05 AM",
  linkedAccounts: "Google Classroom",
  emergencyContact: "Alex Rivera - 5550138",
  timezone: "America/Chicago",
  language: "English (US)",
  address: teacher.address,
},
regular_teacher: {
  name: teacher.name,
  email: teacher.email,
  phone: teacher.phone,
  photo: teacher.photo,
  userId: `T-${teacher.teacherId}`,
  status: "Active",
  createdAt: "Aug 18, 2023",
  lastLogin: "Jan 29, 2026 - 08:05 AM",
  linkedAccounts: "Google Classroom",
  emergencyContact: "Alex Rivera - 5550138",
  timezone: "America/Chicago",
  language: "English (US)",
  address: teacher.address,
},
```

**`roleDetails` object (line 179):**

```tsx
// BEFORE
teacher: [
  { label: "Employee ID", value: teacher.teacherId },
  { label: "Department", value: "Science" },
  { label: "Subjects", value: teacher.subjects.join(", ") },
  { label: "Assigned classes", value: teacher.classes.join(", ") },
  { label: "Schedule", value: "Mon-Fri, 08:00 AM - 03:00 PM" },
  { label: "Metrics", value: "Avg score 86%, Attendance 94%" },
],

// AFTER
senior_teacher: [
  { label: "Employee ID", value: teacher.teacherId },
  { label: "Department", value: "Science" },
  { label: "Subjects", value: teacher.subjects.join(", ") },
  { label: "Assigned classes", value: teacher.classes.join(", ") },
  { label: "Schedule", value: "Mon-Fri, 08:00 AM - 03:00 PM" },
  { label: "Metrics", value: "Avg score 86%, Attendance 94%" },
],
regular_teacher: [
  { label: "Employee ID", value: teacher.teacherId },
  { label: "Department", value: "Science" },
  { label: "Subjects", value: teacher.subjects.join(", ") },
  { label: "Assigned classes", value: teacher.classes.join(", ") },
  { label: "Schedule", value: "Mon-Fri, 08:00 AM - 03:00 PM" },
  { label: "Metrics", value: "Avg score 86%, Attendance 94%" },
],
```

---

### 8.3 Settings page

**File:** `src/scenes/(dashboard)/settings/index.tsx` (lines 228, 261, 287, 309)

Four comparisons across the file. Three control teacher-only settings sections; one is a negation
used as a toggle default value.

**Line 228 — negation used as prop default (Privacy section):**

```tsx
// BEFORE
defaultChecked={currentRole !== "teacher"}

// AFTER
defaultChecked={currentRole !== "senior_teacher" && currentRole !== "regular_teacher"}
```

**Lines 261, 287, 309 — three conditional section renders:**

These three blocks render teacher-only settings sections: Gradebook preferences, Class defaults,
and Assignment notifications. Both teacher roles should see all three sections. Senior-teacher-
specific settings (e.g. department override preferences) can be added as additional conditional
blocks inside these sections in future work.

```tsx
// BEFORE (all three occurrences)
{currentRole === "teacher" && (
  <Section ...>

// AFTER (all three occurrences)
{(currentRole === "senior_teacher" || currentRole === "regular_teacher") && (
  <Section ...>
```

---

## 9. Firebase Security Rules

**Managed in:** Firebase Console (copy-paste source: `sms-system/docs/firebase-rules.md`)

Two helper functions change. All collection rules that call `isTeacher()`, `isTeacherOrAbove()`, or
`isSeniorTeacherFor()` inherit the changes automatically — no individual collection rule lines need
editing.

### 9.1 `isTeacher()`

```js
// BEFORE
function isTeacher() {
  return isSignedIn() && myRole() == 'teacher';
}

// AFTER
function isTeacher() {
  return isSignedIn() && (myRole() == 'senior_teacher' || myRole() == 'regular_teacher');
}
```

`isTeacherOrAbove()` calls `isTeacher()` and requires no change.

### 9.2 `isSeniorTeacherFor()`

```js
// BEFORE
function isSeniorTeacherFor(docDepartmentId) {
  let teacher = get(/databases/$(database)/documents/teachers/$(request.auth.uid)).data;
  return isTeacher()
    && teacher.teacherType == 'senior'
    && teacher.departmentId == docDepartmentId;
}

// AFTER
function isSeniorTeacherFor(docDepartmentId) {
  let teacher = get(/databases/$(database)/documents/teachers/$(request.auth.uid)).data;
  return myRole() == 'senior_teacher'
    && teacher.departmentId == docDepartmentId;
}
```

The `teacher.teacherType == 'senior'` check is replaced by `myRole() == 'senior_teacher'`. The
`teacher.departmentId` check is **unchanged** — the role alone does not tell the rules engine which
department the senior teacher oversees. The `teachers/{uid}` document `get()` is still required for
that lookup.

### 9.3 `teachers` read rule

```js
// No change needed — already correct after the fix applied in the previous session:
match /teachers/{teacherId} {
  allow read: if isOwner(teacherId)
    || (isSignedIn() && sameInstitution(resource.data.institutionId));
  ...
}
```

### 9.4 Collections unaffected at the rule level

All of the following collections call `isTeacher()`, `isTeacherOrAbove()`, or `isSeniorTeacherFor()`
and require **no direct edits** to their individual rule blocks — they inherit the function changes:

`subjects`, `classes`, `terms`, `departments`, `teachers`, `students`, `parents`,
`teacher_subjects`, `teacher_classes`, `student_parents`, `lessons`, `exams`, `assignments`,
`results`, `attendance`, `events`, `announcements`

---

## 10. Firestore schema changes

### 10.1 `users` collection

| Field | Before | After |
|-------|--------|-------|
| `role` | `'teacher'` | `'senior_teacher'` or `'regular_teacher'` |
| All other fields | Unchanged | Unchanged |

### 10.2 `teachers` collection

| Field | Before | After |
|-------|--------|-------|
| `teacherType` | `'regular'` \| `'senior'` — set from form input | `'regular'` \| `'senior'` — **derived from `users.role` at write time** |
| `departmentId` | Present on senior teachers | Unchanged |
| All other fields | Unchanged | Unchanged |

> **Denormalization contract:** `teachers.teacherType` must always mirror `users.role`.
> `role === 'senior_teacher'` ↔ `teacherType === 'senior'`.
> `role === 'regular_teacher'` ↔ `teacherType === 'regular'`.
> Any future flow that can change a teacher's role must update both documents atomically.

### 10.3 All other collections

No schema changes. `institutionId`, `classTeacherId`, `departmentId`, `teacherId`,
`studentId`, `parentId` fields on other collections are unaffected.

### 10.4 Data migration

**No migration is required** — the user intends to delete all existing teacher accounts before
rolling out this change. Any remaining accounts with `role: 'teacher'` would be unable to log in
until their role is updated to either `'senior_teacher'` or `'regular_teacher'`.

---

## 11. New files to create

| File path | Description |
|-----------|-------------|
| `src/scenes/(dashboard)/senior-teacher/index.tsx` | Senior Teacher dashboard — includes all Regular Teacher widgets **plus** Department Overview, Department Performance, and Department Alerts sections (per spec §4.3) |
| `src/scenes/(dashboard)/regular-teacher/index.tsx` | Regular Teacher dashboard — Today's schedule, Pending result entry, This week ahead, My classes, Mark attendance (if class teacher), Current term, Recent announcements, Recent results entered |

**Regarding the existing `src/scenes/(dashboard)/teacher/index.tsx`:**
The current file can be **repurposed** as `RegularTeacherPage` (move/rename to
`regular-teacher/index.tsx`) and then extended with department widgets for `SeniorTeacherPage`.
Both new pages are new builds in terms of live Firestore integration (the current `TeacherPage`
does not read live data).

---

## 12. Change summary

| Area | File(s) | Nature | Lines affected (approx.) |
|------|---------|--------|--------------------------|
| Type system | `src/lib/firebase.ts` ✅ | `Role` union + `getRoleLabel()` | 6 |
| Auth context | `src/lib/AuthContext.tsx` ✅ | 1 condition in `fetchRole` | 1 |
| Create user form | `src/components/forms/SuperAdminCreateUserForm.tsx` ✅ | roleOptions, enum, remove `teacherType` field + schema + UI, update batch write | ~25 (net negative) |
| Routing | `src/App.tsx` ✅ | `defaultPath` + 2 new imports, remove 1 import | ~5 |
| Navigation | `src/components/Menu.tsx` ✅ | 15 `visible` arrays | ~30 (mechanical) |
| List pages | `list/assignments`, `list/exams`, `list/results` ✅ | 2 role comparisons each | ~2 per file (6 total) |
| Profile page | `src/scenes/(dashboard)/profile/index.tsx` ✅ | 2 `Record<Role, ...>` objects — split `teacher` key into 2 | ~30 (duplication of mock entries) |
| Settings page | `src/scenes/(dashboard)/settings/index.tsx` ✅ | 4 role comparisons | ~4 |
| Firebase rules | Firebase Console (`docs/firebase-rules.md`) ✅ | `isTeacher()` + `isSeniorTeacherFor()` | 3 lines |
| Firestore schema | Firestore (no `.rules` file) | `users.role` values; `teachers.teacherType` derivation | Data-layer only |
| New pages | 2 new files ✅ | Dashboard components | New builds |

**Total TypeScript errors cleared: 15 across 8 files** ✅ (`tsc -p tsconfig.app.json --noEmit` exits clean).

---

## 13. Suggested implementation order

Implementing in this order avoids a window where the app is in a broken intermediate state:

1. ✅ **`firebase.ts`** — update `Role` type and `getRoleLabel()` first. TypeScript immediately
   surfaces every callsite that references the old `'teacher'` string literal.

2. ✅ **`AuthContext.tsx`** — update `fetchRole` condition. One-line change that unblocks teacher
   login once new accounts are created.

3. ✅ **`SuperAdminCreateUserForm.tsx`** — remove `teacherType` field, update role options, update
   batch write. New teacher accounts created after this point will have the correct role values.

4. ✅ **`App.tsx`** — update `defaultPath` and imports. Requires new page stubs (even empty ones) to
   compile.

5. ✅ **New dashboard pages** — create `senior-teacher/index.tsx` and `regular-teacher/index.tsx`
   (can be stubs initially; flesh out widgets in subsequent work).

6. ✅ **`Menu.tsx`** — update all `visible` arrays.

7. ✅ **Additional list and detail pages** — update `list/assignments`, `list/exams`,
   `list/results`, `profile`, and `settings`. All are mechanical replacements of the `"teacher"`
   string literal; they can be done in a single pass.

8. ✅ **Firebase rules** — update in the Firebase Console. Apply after all code changes so rules
   align with the new role values being written to Firestore. Applying before step 3 would cause
   `isTeacher()` to stop matching existing `'teacher'` role values in Firestore.

9. **Firebase Console — delete existing teacher accounts** — remove all accounts with
   `role: 'teacher'`. New accounts created via the updated form will have the correct role values.
   *(Manual console step — not tracked here.)*

10. ✅ **`sms-role-specification-v1.md`** — bumped to v1.1; updated §1.1, §1.2, §2.2, §3.3, §3.6,
    §4.3, glossary, changelog, and footer.

11. ✅ **`ISSUES_AND_GAPS.md`** — issue #15 updated to reflect the role split and remaining
    low-priority `teacherType` cleanup.

12. ✅ **`teacher-role-split-impact.md`** (this file) — status updated to `Implemented`.

---

*End of impact analysis.*
