# Form System Refactor and CRUD Implementation Plan

> **Branch:** `mvp`
> **Created:** 2026-05-29
> **Related docs:** [`ROLE_PRIVILEGE_ANALYSIS.md`](ROLE_PRIVILEGE_ANALYSIS.md) · [`firebase-rules.md`](firebase-rules.md) · [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md)

---

## 1. Background and Scope

The dashboard's list pages expose Create / Update / Delete actions via `FormModal.tsx` — a single modal component that dispatches to a `forms` registry keyed by `table` name. Only two entity types (`teacher`, `student`) have forms registered. Every other entity falls through to `"Form not found!"`. On top of the missing forms, several structural and role-access problems exist.

This document covers all work needed to bring the form and CRUD system to a complete and correct state:

- **§2** — Two copy-paste bugs (wrong `table` prop on Parents and Subjects create buttons)
- **§3** — Extension of the create-user page from `super_admin`-only to also `institution_admin`
- **§4** — Replacement of list-page create buttons with redirect links for the three user-entity types (teacher, student, parent)
- **§5** — Fixes to the existing TeacherForm and StudentForm for update mode
- **§6** — FormModal infrastructure improvements (dark mode, form registry expansion)
- **§7** — Nine new Firestore-only forms to build
- **§8** — Removal of the Results page create button (deferred to future Gradebook feature)
- **§9** — Firebase rules impact assessment
- **§10** — Full file change manifest
- **§11** — Recommended build order
- **§12** — Open items

---

## 2. Copy-Paste Bugs

Two list pages pass the wrong `table` prop to their top-bar create `<FormModal>`, causing the wrong form to appear.

| ID | File | Line | Current value | Correct value | Visible effect |
|---|---|---|---|---|---|
| B-1 | `src/scenes/(dashboard)/list/parents/index.tsx` | 94 | `table="teacher"` | — | Bug is resolved as part of §4 (create button is replaced with a Link entirely; no FormModal fix needed) |
| B-2 | `src/scenes/(dashboard)/list/subjects/index.tsx` | 73 | `table="teacher"` | `table="subject"` | Shows "Create a new teacher" on Subjects page |

**B-1 (Parents):** The parents create button will be replaced by a Link to `/create-user` (see §4). The wrong table name is implicitly removed by that change.

**B-2 (Subjects):** Subjects are a Firestore-only entity (no Auth dependency), so the create button stays as a `<FormModal>`. Only the table name prop needs to be corrected. After the fix it will show "Form not found!" until `SubjectForm` is registered (see §7.1).

---

## 3. Create-User Page — Extend Access to `institution_admin`

Currently the `/create-user` route is hard-guarded to `super_admin` only. `institution_admin` is the primary role that creates teachers, students, and parents at a school and has no working creation path today. The existing `SuperAdminCreateUserForm` already implements the correct Firebase Auth + Firestore batch-write pattern and will be extended, not replaced.

### 3.1 Route Guard

**File:** `src/App.tsx`

```tsx
// Before
element={role === 'super_admin' ? <CreateUserPage /> : <Navigate to="/" />}

// After
element={(role === 'super_admin' || role === 'institution_admin') ? <CreateUserPage /> : <Navigate to="/" />}
```

### 3.2 Sidebar Navigation

**File:** `src/components/Menu.tsx`

Locate the Create User menu item and add `'institution_admin'` to its `roles` array.

```tsx
// Before
{ label: "Create User", href: "/create-user", ..., roles: ["super_admin"] }

// After
{ label: "Create User", href: "/create-user", ..., roles: ["super_admin", "institution_admin"] }
```

### 3.3 Component Rename

The component is named `SuperAdminCreateUserForm` but will now serve both admin roles. Rename it to avoid misleading future readers.

| Old path | New path |
|---|---|
| `src/components/forms/SuperAdminCreateUserForm.tsx` | `src/components/forms/AdminCreateUserForm.tsx` |
| Import in `src/scenes/(dashboard)/super-admin/create-user/index.tsx` | Update import path accordingly |

### 3.4 Form Logic Changes

All changes are applied inside the renamed `AdminCreateUserForm.tsx`.

#### Role options — restricted for `institution_admin`

`super_admin` retains the ability to create any role.
`institution_admin` may only create `senior_teacher`, `regular_teacher`, `student`, and `parent` — not `super_admin` or another `institution_admin` (that is a `super_admin`-exclusive privilege).

```tsx
// Before (static list, same for all callers)
const roleOptions: Role[] = [
  'institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent', 'super_admin'
];

// After (derived from the logged-in role)
const roleOptions: Role[] = role === 'super_admin'
  ? ['institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent', 'super_admin']
  : ['senior_teacher', 'regular_teacher', 'student', 'parent'];
```

The Zod enum in `createUserSchema` should also be updated to reflect the full set of possible values (no change — it already includes all roles). The restriction is enforced at the UI layer via `roleOptions`; see §9 for the corresponding Firestore rules hardening gap.

#### `institutionId` field — auto-filled and read-only for `institution_admin`

`super_admin` enters `institutionId` manually (current behavior, unchanged).
`institution_admin` must have the field auto-filled from their own `institutionId` (from `useAuth()`) and locked to read-only. They cannot create users for a different institution.

```tsx
const { user, role, institutionId: callerInstitutionId } = useAuth();

// Auto-fill on mount when institution_admin
useEffect(() => {
  if (role === 'institution_admin' && callerInstitutionId) {
    setValue('institutionId', callerInstitutionId, { shouldValidate: true });
  }
}, [role, callerInstitutionId, setValue]);
```

In JSX, the `institutionId` input should be `disabled` when the caller is `institution_admin`:

```tsx
<input
  {...register('institutionId')}
  disabled={role === 'institution_admin' || !requiresInstitution}
  placeholder={
    role === 'institution_admin'
      ? callerInstitutionId ?? 'Your institution ID'
      : requiresInstitution ? 'school-id' : 'Not needed for super admin'
  }
  ...
/>
```

#### Submit guard — allow `institution_admin`

```tsx
// Before
if (role !== 'super_admin') {
  setError('Only super admins can create users from this form.');
  return;
}

// After
if (role !== 'super_admin' && role !== 'institution_admin') {
  setError('Only admins can create users from this form.');
  return;
}
```

#### `teachers` batch write — institutionId source verification

The batch write that creates the `teachers` document uses `values.institutionId`:

```tsx
batch.set(doc(db, 'teachers', createdUser.uid), {
  uid: createdUser.uid,
  institutionId: values.institutionId,   // <-- this value
  ...
});
```

When `institution_admin` is the caller, `values.institutionId` is the auto-filled, read-only value from `callerInstitutionId`. This will be correct as long as the auto-fill effect fires before submission. No structural change needed, but this should be smoke-tested for the `institution_admin` path during implementation.

#### `students` and `parents` collection writes — known gap

The current form only writes to `users` (always) and `teachers` (when role is a teacher type). For `student` and `parent` roles, no corresponding document is written to the `students` or `parents` collections. Whether those collections require a document per user (for student-specific fields like grade and class, or parent-specific fields like linked students) is not resolved in the current schema.

This gap exists today in the `super_admin` form and is out of scope for this refactor. It should be addressed when the data layer is built out. Tracked as open item OI-7.

---

## 4. List Page Create Buttons — Teacher / Student / Parent

With the create-user page accessible to `institution_admin`, the three user-entity list pages should replace their `<FormModal type="create">` buttons with `<Link to="/create-user">` buttons. This preserves the visual appearance of the create icon while routing to the correct Auth-integrated flow.

### Changes per page

| Page | File | Current (line) | Change |
|---|---|---|---|
| Teachers | `src/scenes/(dashboard)/list/teachers/index.tsx` | `<FormModal table="teacher" type="create"/>` (line 125) | Replace with Link button |
| Students | `src/scenes/(dashboard)/list/students/index.tsx` | `<FormModal table="student" type="create"/>` (line 119) | Replace with Link button |
| Parents | `src/scenes/(dashboard)/list/parents/index.tsx` | `<FormModal table="teacher" type="create"/>` (line 94, also fixes B-1) | Replace with Link button |

### Link button pattern

The existing `react-router-dom` `Link` is already imported on the teachers and students pages (used for the View button). The parents page does not currently import `Link` — it will need to be added.

```tsx
import { Link } from "react-router-dom";

// Replace the existing <FormModal type="create"> in the top bar with:
<Link to="/create-user">
  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
    <img src="/create.png" alt="" width={14} height={14} />
  </button>
</Link>
```

This `<Link>` wrapping a `<button>` is consistent with the existing View button pattern used in every list page's row actions (e.g., `teachers/index.tsx` line 91).

The role guard around the create button stays the same — only `institution_admin` and `super_admin` see it:

```tsx
{(role === "institution_admin" || role === "super_admin") && (
  <Link to="/create-user">
    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
      <img src="/create.png" alt="" width={14} height={14} />
    </button>
  </Link>
)}
```

---

## 5. TeacherForm and StudentForm — Fix Update Mode

Even after the redirect approach, both forms remain in active use for the **update** flow triggered on the detail pages (`/list/teachers/:id` and `/list/students/:id`). They must be corrected for update mode before use in production.

### Problems to fix in both files

| Problem | TeacherForm | StudentForm |
|---|---|---|
| Title hardcodes "Create a new …" regardless of `type` prop | ✓ | ✓ |
| Password field always visible (must be hidden in update mode) | ✓ | ✓ |
| `img: z.instanceof(File)` required in Zod schema (blocks update when no new photo is uploaded) | ✓ | ✓ |
| `"use client"` directive — Next.js App Router artifact, silently ignored in Vite | ✓ | ✓ |

### Fix details

**Title:** `type === "create" ? "Create a new teacher" : "Edit teacher"` (and equivalent for student).

**Password field:** Rendered and validated only when `type === "create"`. Two approaches are valid:

- Two separate Zod schemas (`createSchema` / `updateSchema`) selected based on `type`, or
- A single schema with `.optional()` on password fields, with `superRefine` enforcing minimum length only when `type === "create"`.

Either is acceptable; the two-schema approach is more explicit and easier to audit.

**Image field:** Change from `z.instanceof(File, { message: "Image is required" })` to `z.instanceof(File).optional()`. The upload UI element stays visible in both modes but submitting without a new image is allowed in update mode.

**`"use client"`:** Delete the first line of both files entirely.

### File locations

- `src/components/forms/TeacherForm.tsx`
- `src/components/forms/StudentForm.tsx`

---

## 6. FormModal Infrastructure

### 6.1 Dark Mode

**File:** `src/components/FormModal.tsx`

The modal container uses a hardcoded `bg-white` with no `dark:` variant. All card and panel surfaces in this codebase use `dark:bg-gray-800`.

```tsx
// Before
<div className="bg-white p-4 rounded-md relative w-full max-w-4xl ...">

// After
<div className="bg-white dark:bg-gray-800 p-4 rounded-md relative w-full max-w-4xl ...">
```

### 6.2 Form Registry — New Entries

As each new form file is created (see §7), add a lazy import and a registry entry in `FormModal.tsx`. All nine new forms follow the same pattern.

```tsx
// Add lazy imports (alongside existing TeacherForm / StudentForm imports)
const SubjectForm      = React.lazy(() => import("./forms/SubjectForm"));
const ClassForm        = React.lazy(() => import("./forms/ClassForm"));
const LessonForm       = React.lazy(() => import("./forms/LessonForm"));
const ExamForm         = React.lazy(() => import("./forms/ExamForm"));
const AssignmentForm   = React.lazy(() => import("./forms/AssignmentForm"));
const ResultForm       = React.lazy(() => import("./forms/ResultForm"));
const EventForm        = React.lazy(() => import("./forms/EventForm"));
const AnnouncementForm = React.lazy(() => import("./forms/AnnouncementForm"));
const ParentForm       = React.lazy(() => import("./forms/ParentForm"));

// Expand the forms registry
const forms: Partial<Record<TableName, FormRenderer>> = {
  teacher:      (type, data) => <TeacherForm type={type} data={data} />,
  student:      (type, data) => <StudentForm type={type} data={data} />,
  subject:      (type, data) => <SubjectForm type={type} data={data} />,
  class:        (type, data) => <ClassForm type={type} data={data} />,
  lesson:       (type, data) => <LessonForm type={type} data={data} />,
  exam:         (type, data) => <ExamForm type={type} data={data} />,
  assignment:   (type, data) => <AssignmentForm type={type} data={data} />,
  result:       (type, data) => <ResultForm type={type} data={data} />,
  event:        (type, data) => <EventForm type={type} data={data} />,
  announcement: (type, data) => <AnnouncementForm type={type} data={data} />,
  parent:       (type, data) => <ParentForm type={type} data={data} />,
};
```

---

## 7. Firestore-Only Forms — Specifications

All nine forms below write to Firestore only (no Firebase Auth involved). They follow the same conventions as the existing TeacherForm:

- `react-hook-form` + Zod resolver
- `InputField` component for text inputs
- `type === "create"` → title "Create [entity]", submit button "Create"
- `type === "update"` → title "Edit [entity]", submit button "Update"
- No `"use client"` directive
- `onSubmit` stubs `console.log(data)` for now; live Firestore writes are added when the data layer is built out (see OI-4)
- Dropdown fields for related entities (`class`, `subject`, `teacher`) use the same mock data arrays imported in the list pages (`import { ... } from "@/lib/data"`) until live queries replace them

---

### 7.1 SubjectForm

**File:** `src/components/forms/SubjectForm.tsx`
**Pages:** Subjects list (create + update)
**Who can trigger:** `institution_admin`, `super_admin`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| name | text | ✓ | 2–100 chars |
| description | textarea | — | Max 500 chars |

```ts
const schema = z.object({
  name:        z.string().min(2, 'Name must be at least 2 characters.').max(100),
  description: z.string().max(500).optional(),
});
```

> Teacher-to-subject assignments are stored in the `teacher_subjects` junction collection, not on the subject document itself. They are out of scope for this form.

---

### 7.2 ClassForm

**File:** `src/components/forms/ClassForm.tsx`
**Pages:** Classes list (create + update)
**Who can trigger:** `institution_admin`, `super_admin`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| name | text | ✓ | e.g. "4A", "Grade 10B" — max 50 chars |
| capacity | number | ✓ | Integer 1–200 |
| grade | number | ✓ | Integer 1–13 |
| supervisor | text | — | Free-text for mock mode; see note |

```ts
const schema = z.object({
  name:       z.string().min(1, 'Class name is required.').max(50),
  capacity:   z.coerce.number().int().min(1).max(200),
  grade:      z.coerce.number().int().min(1).max(13),
  supervisor: z.string().max(100).optional(),
});
```

> **supervisor** is a denormalised display name on the class document (matching the shape of the existing `classesData` mock). In live mode it should become a searchable dropdown of teachers in the institution. The `teacher_classes` junction stores the authoritative link separately. The field remains a free-text input until live teacher data is queryable (tracked as OI-3).

---

### 7.3 LessonForm

**File:** `src/components/forms/LessonForm.tsx`
**Pages:** Lessons list (create + update)
**Who can trigger:** `institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| subject | text | ✓ | Max 100 chars |
| class | text | ✓ | Max 50 chars |
| teacher | text | ✓ | Max 100 chars |

```ts
const schema = z.object({
  subject: z.string().min(1, 'Subject is required.').max(100),
  class:   z.string().min(1, 'Class is required.').max(50),
  teacher: z.string().min(1, 'Teacher is required.').max(100),
});
```

> In live mode, `subject`, `class`, and `teacher` will become dropdowns populated from their respective Firestore collections. The Zod schema does not need to change; only the JSX input elements change from `<input>` to `<select>`.

> **Teacher-scope enforcement:** `regular_teacher` can only create/edit lessons for their own classes. `senior_teacher` can create/edit lessons for any class in their department. This scope difference is enforced at the Firestore rules layer (`isClassTeacherFor` / `isSeniorTeacherFor` helpers). The UI shows the same form to both teacher roles; a write outside their permitted scope will be denied by Firestore at runtime.

---

### 7.4 ExamForm

**File:** `src/components/forms/ExamForm.tsx`
**Pages:** Exams list (create + update)
**Who can trigger:** `institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| subject | text | ✓ | Max 100 chars |
| class | text | ✓ | Max 50 chars |
| teacher | text | ✓ | Max 100 chars |
| date | date | ✓ | `<input type="date">` |

```ts
const schema = z.object({
  subject: z.string().min(1).max(100),
  class:   z.string().min(1).max(50),
  teacher: z.string().min(1).max(100),
  date:    z.string().min(1, 'Date is required.'),
});
```

> Same teacher-scope note as LessonForm applies here.

---

### 7.5 AssignmentForm

**File:** `src/components/forms/AssignmentForm.tsx`
**Pages:** Assignments list (create + update)
**Who can trigger:** `institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| subject | text | ✓ | Max 100 chars |
| class | text | ✓ | Max 50 chars |
| teacher | text | ✓ | Max 100 chars |
| dueDate | date | ✓ | `<input type="date">` |

```ts
const schema = z.object({
  subject: z.string().min(1).max(100),
  class:   z.string().min(1).max(50),
  teacher: z.string().min(1).max(100),
  dueDate: z.string().min(1, 'Due date is required.'),
});
```

---

### 7.6 ResultForm — Update Only

**File:** `src/components/forms/ResultForm.tsx`
**Pages:** Results list (**update only** — create button removed, see §8)
**Who can trigger:** `institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| score | number | ✓ | 0–100 |
| date | date | — | Optional correction of the recorded date |

```ts
const schema = z.object({
  score: z.coerce.number().min(0, 'Score cannot be negative.').max(100, 'Score cannot exceed 100.'),
  date:  z.string().optional(),
});
```

The form is intentionally narrow. Only the fields a teacher legitimately corrects after the fact (score and date) are editable. Student, subject, teacher, class, and type are read-only context — shown in the modal heading but not as inputs.

> Result **creation** is deferred to the future Gradebook feature. See §8 and [`REPORT_GENERATION_PREREQUISITES.md`](REPORT_GENERATION_PREREQUISITES.md) (OI-5 below).

---

### 7.7 EventForm

**File:** `src/components/forms/EventForm.tsx`
**Pages:** Events list (create + update)
**Who can trigger:** `institution_admin`, `super_admin`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| title | text | ✓ | Max 150 chars |
| class | text | — | Empty = school-wide event |
| date | date | ✓ | |
| startTime | time | ✓ | `<input type="time">` |
| endTime | time | ✓ | Must be after startTime |

```ts
const schema = z.object({
  title:     z.string().min(1, 'Title is required.').max(150),
  class:     z.string().max(50).optional(),
  date:      z.string().min(1, 'Date is required.'),
  startTime: z.string().min(1, 'Start time is required.'),
  endTime:   z.string().min(1, 'End time is required.'),
}).refine(
  d => !d.startTime || !d.endTime || d.endTime > d.startTime,
  { message: 'End time must be after start time.', path: ['endTime'] }
);
```

> **School-wide events:** Leaving `class` blank means the event applies to the whole institution. The existing `eventsData` mock already uses `class: ""` for school-wide events — this is consistent with that shape.

---

### 7.8 AnnouncementForm

**File:** `src/components/forms/AnnouncementForm.tsx`
**Pages:** Announcements list (create + update)
**Who can trigger:** `institution_admin`, `super_admin`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| title | text | ✓ | Max 150 chars |
| class | text | — | Empty = school-wide |
| date | date | ✓ | |
| description | textarea | — | Optional body — max 2000 chars |

```ts
const schema = z.object({
  title:       z.string().min(1, 'Title is required.').max(150),
  class:       z.string().max(50).optional(),
  date:        z.string().min(1, 'Date is required.'),
  description: z.string().max(2000).optional(),
});
```

> The `Announcement` type in `announcements/index.tsx` currently has `{ id, title, class, date }`. The `description` field is an additive improvement and must be added to both the TypeScript type in that file and to the Firestore `announcements` collection schema when the data layer is built.

---

### 7.9 ParentForm — Update Only

**File:** `src/components/forms/ParentForm.tsx`
**Pages:** Parents list (**update only** — create button replaced by Link to `/create-user`, see §4)
**Who can trigger:** `institution_admin`, `super_admin`

| Field | Input type | Required | Constraints |
|---|---|---|---|
| phone | tel | — | Valid phone pattern |
| address | text | — | Max 200 chars |

```ts
const phonePattern = /^\+?[0-9 ()-]{7,20}$/;

const schema = z.object({
  phone:   z.string()
             .refine(v => v === '' || phonePattern.test(v), 'Enter a valid phone number.')
             .optional(),
  address: z.string().max(200).optional(),
});
```

> `name` and `email` are Firebase Auth credentials — they must not be edited through a Firestore form. Linked students (via `student_parents` junction) require a multi-select UI and are deferred (OI-2).

---

## 8. Results Page — Remove Create Button

Result creation is deferred to a dedicated Gradebook feature; creating results from a flat-list modal would produce poor UX at scale (one modal per student rather than a spreadsheet-style entry).

**File:** `src/scenes/(dashboard)/list/results/index.tsx`
**Line:** 101
**Change:** Delete the create `<FormModal>` from the top-bar icon row.

```tsx
// Remove entirely:
{(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && <FormModal table="result" type="create" />}
```

The Filter and Sort icon buttons remain. The create icon (plus) will no longer appear on the Results page for any role.

Row-level Update and Delete buttons are unaffected.

---

## 9. Firebase Rules — Full Impact Assessment

No new Firestore rules are required for any change in this document. The existing rules already cover every collection accessed.

| Change | Collection(s) | Rule change needed | Rationale |
|---|---|---|---|
| `institution_admin` access to create-user | `users`, `teachers` | ❌ No | Existing rules: institution_admin can create/update users and teachers in own institution |
| SubjectForm | `subjects` | ❌ No | Admin full CRUD already exists |
| ClassForm | `classes` | ❌ No | Admin full CRUD already exists |
| LessonForm | `lessons` | ❌ No | Admin full CRUD; teacher create/edit own already exists |
| ExamForm | `exams` | ❌ No | Same as lessons |
| AssignmentForm | `assignments` | ❌ No | Same as lessons |
| ResultForm (update only) | `results` | ❌ No | Admin full CRUD; teacher edit own already exists |
| EventForm | `events` | ❌ No | Admin full CRUD already exists |
| AnnouncementForm | `announcements` | ❌ No | Admin full CRUD already exists |
| ParentForm (update only) | `users` | ❌ No | Admin full CRUD already exists |
| Remove results create button | `results` | N/A | UI change only |

### Security hardening gap — must be fixed before live mode

The Firestore `users` collection create rule for `institution_admin` does not currently restrict the `role` value on new documents. A sufficiently motivated institution_admin could bypass the UI and call Firestore directly to write a `super_admin` or a cross-institution document.

**Proposed addition to `firebase-rules.md` and deployed rules** — in the `users` collection create path for institution_admin:

```js
// Current (paraphrased)
allow create: if isAdmin() && writingToMyInstitution(request.resource.data.institutionId);

// Hardened
allow create: if isAdmin()
              && writingToMyInstitution(request.resource.data.institutionId)
              && request.resource.data.role in [
                   'senior_teacher', 'regular_teacher', 'student', 'parent'
                 ];
```

This locks institution_admin to creating only the four non-privileged roles even if they call the Firestore API directly. Creating `institution_admin` or `super_admin` accounts remains a `super_admin`-only operation.

This is a Firestore rules task, tracked separately as OI-1. It **must** be deployed before the create-user page extension goes to live mode.

---

## 10. File Change Manifest

### Files modified

| File | Change summary |
|---|---|
| `src/App.tsx` | Extend `/create-user` route guard to include `institution_admin` |
| `src/components/Menu.tsx` | Add `institution_admin` to create-user menu item |
| `src/components/FormModal.tsx` | Add `dark:bg-gray-800`; add 9 lazy imports; expand `forms` registry |
| `src/components/forms/TeacherForm.tsx` | Remove `"use client"`; fix title and password for update mode; make image optional |
| `src/components/forms/StudentForm.tsx` | Same fixes as TeacherForm |
| `src/scenes/(dashboard)/list/parents/index.tsx` | Replace `<FormModal table="teacher" type="create"/>` with Link button; add `Link` import |
| `src/scenes/(dashboard)/list/subjects/index.tsx` | Fix `table="teacher"` → `table="subject"` on create button (B-2) |
| `src/scenes/(dashboard)/list/teachers/index.tsx` | Replace `<FormModal ... type="create">` with Link button |
| `src/scenes/(dashboard)/list/students/index.tsx` | Replace `<FormModal ... type="create">` with Link button |
| `src/scenes/(dashboard)/list/results/index.tsx` | Remove create `<FormModal>` from top bar |
| `src/scenes/(dashboard)/super-admin/create-user/index.tsx` | Update import from `SuperAdminCreateUserForm` → `AdminCreateUserForm` |

### Files renamed

| Old path | New path |
|---|---|
| `src/components/forms/SuperAdminCreateUserForm.tsx` | `src/components/forms/AdminCreateUserForm.tsx` |

### New files

| File | Contents |
|---|---|
| `src/components/forms/SubjectForm.tsx` | Create + Update form for subjects |
| `src/components/forms/ClassForm.tsx` | Create + Update form for classes |
| `src/components/forms/LessonForm.tsx` | Create + Update form for lessons |
| `src/components/forms/ExamForm.tsx` | Create + Update form for exams |
| `src/components/forms/AssignmentForm.tsx` | Create + Update form for assignments |
| `src/components/forms/ResultForm.tsx` | Update-only form for results |
| `src/components/forms/EventForm.tsx` | Create + Update form for events |
| `src/components/forms/AnnouncementForm.tsx` | Create + Update form for announcements |
| `src/components/forms/ParentForm.tsx` | Update-only form for parents |

### Documentation updates required after implementation

| File | Update |
|---|---|
| `sms-system/docs/firebase-rules.md` | Add the security hardening rule for institution_admin user creation (§9) |
| `sms-system/docs/ROLE_PRIVILEGE_ANALYSIS.md` | Update the `/create-user` row in Route Access table to reflect `institution_admin` access; update the Teachers and Students CRUD tables |
| `sms-system/docs/ISSUES_AND_GAPS.md` | Close or update any issues that this work resolves |

---

## 11. Recommended Build Order

Work is sequenced into three stages. Within each stage, items are independent and can be built in parallel.

| Stage | Items | Why this order |
|---|---|---|
| **Stage 1 — Bugs and cleanup** | B-2 table name fix (subjects); FormModal dark mode; TeacherForm and StudentForm fixes (`"use client"`, update mode title, password field, image optional) | Zero-risk changes with no dependencies. Smallest diff, easiest to review. Commit separately before introducing new features. |
| **Stage 2 — Create-user page extension** | Rename `SuperAdminCreateUserForm` → `AdminCreateUserForm`; update App.tsx route guard; update Menu.tsx; apply form logic changes (role options, institutionId auto-fill, submit guard); replace create buttons with Link buttons on teachers / students / parents list pages | Rename and route guard should be in the same commit so the app is never in a broken state. Link button replacements can follow in a second commit. |
| **Stage 3 — Firestore-only forms** | SubjectForm, ClassForm, LessonForm, ExamForm, AssignmentForm, ResultForm, EventForm, AnnouncementForm, ParentForm; FormModal registry update; Results create button removal | Each form is independent. Register the form in `FormModal.tsx` in the same commit as the form file — never register a form before it exists or leave a registered form unimplemented. |

**Security note:** OI-1 (Firestore rules hardening for institution_admin user creation) must be completed and deployed before Stage 2 is released to production.

---

## 12. Open Items

| ID | Item | Priority | Status |
|---|---|---|---|
| OI-1 | Firestore rules hardening — restrict `role` field on institution_admin `users` create | **High** — must fix before live mode | Open |
| OI-2 | Linked-students multi-select in ParentForm | Medium | Deferred — requires live data and a multi-select UI component |
| OI-3 | Supervisor dropdown in ClassForm | Low | Deferred — free-text in mock mode; becomes a dropdown when live teacher data is queryable |
| OI-4 | Live Firestore writes in all new forms (currently `console.log` stubs) | High | Deferred — pending data layer build-out |
| OI-5 | Gradebook feature for result creation | Medium | Deferred — tracked in [`REPORT_GENERATION_PREREQUISITES.md`](REPORT_GENERATION_PREREQUISITES.md) as prerequisite for report generation |
| OI-6 | FormModal accessibility improvements (focus trap, Escape key, `role="dialog"`, `aria-modal`) | Low | Open — deferred for post-MVP polish |
| OI-7 | `students` and `parents` collection writes when creating users of those roles | Medium | Open — current form only writes to `users` and optionally `teachers`; whether `students`/`parents` collections need their own documents per user is unresolved pending data layer design |
