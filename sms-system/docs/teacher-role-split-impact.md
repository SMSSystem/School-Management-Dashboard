# Impact Analysis — Splitting `teacher` into `senior_teacher` / `regular_teacher`

> **Generated:** 2026-05-27
> **Branch:** `main` (commit `15b2198`)
> **Status:** Analysis only — no implementation changes made yet
> **Scope:** Full codebase impact of promoting `teachers.teacherType` from a subtype field into two
> distinct top-level roles: `senior_teacher` and `regular_teacher`

---

## Table of Contents

1. [Spec alignment note](#1-spec-alignment-note)
2. [Recorded decisions](#2-recorded-decisions)
3. [Type system — `firebase.ts`](#3-type-system--firebasets)
4. [Auth context — `AuthContext.tsx`](#4-auth-context--authcontexttsx)
5. [Create user form — `SuperAdminCreateUserForm.tsx`](#5-create-user-form--superadmincreateuserformtsx)
6. [Routing — `App.tsx`](#6-routing--apptsx)
7. [Navigation — `Menu.tsx`](#7-navigation--menutsx)
8. [Firebase Security Rules](#8-firebase-security-rules)
9. [Firestore schema changes](#9-firestore-schema-changes)
10. [New files to create](#10-new-files-to-create)
11. [Change summary](#11-change-summary)
12. [Suggested implementation order](#12-suggested-implementation-order)

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
> (moved to `regular-teacher/`) or deleted if both new pages are written from scratch. See §10.

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
`'senior_teacher'` and `'regular_teacher'`. The logic of what each role can see does not change —
only the string tokens change.

**Affected items (10 out of 15 menu entries):**

| Label | Current `visible` includes | Action |
|---|---|---|
| Home | `'teacher'` | Replace with `'senior_teacher', 'regular_teacher'` |
| Teachers | `'teacher'` | Replace |
| Students | `'teacher'` | Replace |
| Parents | `'teacher'` | Replace |
| Classes | `'teacher'` | Replace |
| Lessons | `'teacher'` | Replace |
| Exams | `'teacher'` | Replace |
| Assignments | `'teacher'` | Replace |
| Results | `'teacher'` | Replace |
| Attendance | `'teacher'` | Replace |
| Events | `'teacher'` | Replace |
| Messages | `'teacher'` | Replace |
| Announcements | `'teacher'` | Replace |
| Profile | `'teacher'` | Replace |
| Settings | `'teacher'` | Replace |

**Pattern (same change repeated for every affected item):**

```ts
// BEFORE
visible: ["super_admin", "institution_admin", "teacher", "student", "parent"],

// AFTER
visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
```

---

## 8. Firebase Security Rules

**Managed in:** Firebase Console (copy-paste source: `sms-system/docs/firebase-rules.md`)

Two helper functions change. All collection rules that call `isTeacher()`, `isTeacherOrAbove()`, or
`isSeniorTeacherFor()` inherit the changes automatically — no individual collection rule lines need
editing.

### 8.1 `isTeacher()`

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

### 8.2 `isSeniorTeacherFor()`

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

### 8.3 `teachers` read rule

```js
// No change needed — already correct after the fix applied in the previous session:
match /teachers/{teacherId} {
  allow read: if isOwner(teacherId)
    || (isSignedIn() && sameInstitution(resource.data.institutionId));
  ...
}
```

### 8.4 Collections unaffected at the rule level

All of the following collections call `isTeacher()`, `isTeacherOrAbove()`, or `isSeniorTeacherFor()`
and require **no direct edits** to their individual rule blocks — they inherit the function changes:

`subjects`, `classes`, `terms`, `departments`, `teachers`, `students`, `parents`,
`teacher_subjects`, `teacher_classes`, `student_parents`, `lessons`, `exams`, `assignments`,
`results`, `attendance`, `events`, `announcements`

---

## 9. Firestore schema changes

### 9.1 `users` collection

| Field | Before | After |
|-------|--------|-------|
| `role` | `'teacher'` | `'senior_teacher'` or `'regular_teacher'` |
| All other fields | Unchanged | Unchanged |

### 9.2 `teachers` collection

| Field | Before | After |
|-------|--------|-------|
| `teacherType` | `'regular'` \| `'senior'` — set from form input | `'regular'` \| `'senior'` — **derived from `users.role` at write time** |
| `departmentId` | Present on senior teachers | Unchanged |
| All other fields | Unchanged | Unchanged |

> **Denormalization contract:** `teachers.teacherType` must always mirror `users.role`.
> `role === 'senior_teacher'` ↔ `teacherType === 'senior'`.
> `role === 'regular_teacher'` ↔ `teacherType === 'regular'`.
> Any future flow that can change a teacher's role must update both documents atomically.

### 9.3 All other collections

No schema changes. `institutionId`, `classTeacherId`, `departmentId`, `teacherId`,
`studentId`, `parentId` fields on other collections are unaffected.

### 9.4 Data migration

**No migration is required** — the user intends to delete all existing teacher accounts before
rolling out this change. Any remaining accounts with `role: 'teacher'` would be unable to log in
until their role is updated to either `'senior_teacher'` or `'regular_teacher'`.

---

## 10. New files to create

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

## 11. Change summary

| Area | File(s) | Nature | Lines affected (approx.) |
|------|---------|--------|--------------------------|
| Type system | `src/lib/firebase.ts` | `Role` union + `getRoleLabel()` | ~6 |
| Auth context | `src/lib/AuthContext.tsx` | 1 condition in `fetchRole` | 1 |
| Create user form | `src/components/forms/SuperAdminCreateUserForm.tsx` | roleOptions, enum, remove `teacherType` field + schema + UI, update batch write | ~25 (net negative — field removal) |
| Routing | `src/App.tsx` | `defaultPath` + 2 new imports, remove 1 import | ~5 |
| Navigation | `src/components/Menu.tsx` | 15 `visible` arrays | ~30 (mechanical) |
| Firebase rules | Firebase Console (`docs/firebase-rules.md`) | `isTeacher()` + `isSeniorTeacherFor()` | 3 lines |
| Firestore schema | Firestore (no `.rules` file) | `users.role` values; `teachers.teacherType` derivation | Data-layer only |
| New pages | 2 new files | Dashboard components | New builds |

**No other source files are currently affected** — the rest of the codebase uses mock data
(`src/lib/data.ts`) with no live Firestore reads, so no teacher-role checks exist outside the files
listed above.

---

## 12. Suggested implementation order

Implementing in this order avoids a window where the app is in a broken intermediate state:

1. **`firebase.ts`** — update `Role` type and `getRoleLabel()` first. TypeScript will immediately
   surface every callsite that references `'teacher'` as a compile error, giving a complete list of
   places to fix.

2. **`AuthContext.tsx`** — update `fetchRole` condition. This is a one-line change that unblocks
   teacher login once new accounts are created.

3. **`SuperAdminCreateUserForm.tsx`** — remove `teacherType` field, update role options, update
   batch write. New teacher accounts created after this point will have the correct role values.

4. **`App.tsx`** — update `defaultPath` and imports. Requires new page stubs (even empty ones) to
   compile.

5. **New dashboard pages** — create `senior-teacher/index.tsx` and `regular-teacher/index.tsx`
   (can be stubs initially; flesh out widgets in subsequent work).

6. **`Menu.tsx`** — update all `visible` arrays. Mechanical but must be done before any teacher
   accounts can navigate the app.

7. **Firebase rules** — update in the Firebase Console. Apply last so rules align with the new role
   values that are now being written to Firestore. Applying before step 3 would cause `isTeacher()`
   to stop matching existing `'teacher'` role values in Firestore; applying after means new accounts
   work correctly from the start.

8. **`sms-role-specification-v1.md`** — bump version, update §1.1, §3.6, and Changelog to reflect
   that `teacher` is now two distinct roles rather than one role with a subtype field.

---

*End of impact analysis — implementation has not started. All code shown is illustrative.*
