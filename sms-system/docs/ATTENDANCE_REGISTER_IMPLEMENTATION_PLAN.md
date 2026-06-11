# Attendance Register — Implementation Plan

> **Purpose:** Step-by-step implementation guide for the Attendance Register feature. Complements `ATTENDANCE_REGISTER_SPEC.md`, which contains all design decisions, schemas, code templates, and security rules. This document provides the concrete implementation order, exact file paths, codebase-specific adaptations, and pre-implementation fixes that the spec does not cover.
>
> **Date documented:** 2026-06-11
> **Branch:** `post-mvp-additions`
> **Spec reference:** `sms-system/docs/ATTENDANCE_REGISTER_SPEC.md`

---

## Table of Contents

1. [Scope](#1-scope)
2. [Pre-Implementation Fixes](#2-pre-implementation-fixes)
3. [Phase 1 — Step-by-Step](#3-phase-1--step-by-step)
   - [Group A — Utility Libraries and Components](#group-a--utility-libraries-and-components-no-external-dependencies)
   - [Group B — Firestore and Rules](#group-b--firestore-and-rules)
   - [Group C — Student `classId` Fix](#group-c--student-classid-fix)
   - [Group D — Academic Calendar](#group-d--academic-calendar)
   - [Group E — Senior Teacher Homeroom Assignment](#group-e--senior-teacher-homeroom-assignment)
   - [Group F — General Attendance Register Page](#group-f--general-attendance-register-page)
   - [Group G — Dashboard Overdue Alerts](#group-g--dashboard-overdue-alerts)
   - [Group H — Student and Parent Attendance Views](#group-h--student-and-parent-attendance-views)
   - [Group I — Subject Register Placeholder](#group-i--subject-register-placeholder)
   - [Group J — Navigation and Routing](#group-j--navigation-and-routing)
   - [Group K — PDF Export](#group-k--pdf-export)
4. [Phase 2 — Subject Attendance Register (Deferred)](#4-phase-2--subject-attendance-register-deferred)
5. [Files Reference](#5-files-reference)
6. [Corrected Firestore Security Rules](#6-corrected-firestore-security-rules)

---

## 1. Scope

**Phase 1 (this document):** Academic Calendar prerequisite + General Attendance Register + student/parent read views + Subject Register placeholder + PDF export.

**Phase 2 (deferred, not covered here):** Subject Attendance Register — blocked on adding `frequency`/`sessionDayOfWeek` to SubjectForm, building the `subjectEnrollments` collection, and implementing the register page. See `ATTENDANCE_REGISTER_SPEC.md` §4 and §12.1.

---

## 2. Pre-Implementation Fixes

These changes are required before any attendance-specific code is written. They affect existing files.

### 2.1 Extend `TermDocument` and add new types in `src/lib/firebase.ts`

The existing `TermDocument` (for the existing `terms` collection) must be extended to support the academic calendar. Backward compatibility is not required — update the type in place.

**Changes to `TermDocument`:**

```typescript
// BEFORE
export type TermDocument = {
  id: string;
  name: string;
  startDate: Timestamp;
  endDate: Timestamp;
  status: 'upcoming' | 'active' | 'closed';
  institutionId: string;
};

// AFTER — extend with academic calendar fields; status value 'closed' → 'completed'
export type TermDocument = {
  id: string;
  institutionId: string;
  name: string;
  startDate: Timestamp;
  endDate: Timestamp;
  status: 'upcoming' | 'active' | 'completed';
  // Academic calendar fields (present on terms created via AcademicCalendarPage)
  academicYearId?: string;
  termNumber?: 1 | 2 | 3;
  defaultName?: string; // e.g. "Christmas Term" — for Reset to default option
};
```

The `terms` collection serves both the existing term-management feature and the new academic calendar. Terms created via the wizard have `academicYearId` set; legacy terms do not. All queries that belong to the academic calendar filter by `where('academicYearId', '==', activeYear.id)` so there is no cross-contamination.

**New types to add (full schemas in spec §8):**

```typescript
export type AcademicYearDocument = { ... }; // spec §8.1
export type NonSchoolDayDocument = { ... }; // spec §8.3
export type GeneralAttendanceDocument = { ... }; // spec §8.4
```

Also add two optional fields to `UserDocument`:

```typescript
// On senior_teacher user documents only
assignedClassId?: string | null;
assignedClassName?: string | null;

// On student user documents only (see §2.2 below)
classId?: string | null;
```

---

### 2.2 Add `classId` to student user documents

`classId` does not currently exist on student user documents in Firestore. It is required for:
- The `generalAttendance` Firestore read rule (checks `users/{uid}.classId == resource.data.classId`)
- `MyAttendancePage` (queries attendance by `classId`)
- `ChildAttendancePage` (fetches child's `classId` to query attendance)

**Required changes (Steps C1–C3 below):**
1. Add `classId` to `AuthContext.tsx` so it is available via `useAuth()` for students
2. Update `AdminCreateUserForm.tsx` to write `classId` to `users/{uid}` when creating a student
3. Update `StudentForm.tsx` (the update form) to include `classId` in the Firestore update

**Data gap for existing students:** Existing student documents lack `classId`. The `MyAttendancePage` must handle a null/missing `classId` gracefully — show an informational state ("Your class assignment is not configured. Contact your administrator.") rather than an error. This resolves itself as administrators update student profiles.

---

### 2.3 Firestore rule helper correction

`ATTENDANCE_REGISTER_SPEC.md` §9 was written with hypothetical helper function names (`callerRole()`, `callerInstitutionId()`, `isInstitutionMember()`). The deployed ruleset uses different names. **Do not use the rules in §9 directly.** Use the corrected rules in [§6 of this document](#6-corrected-firestore-security-rules) instead.

---

## 3. Phase 1 — Step-by-Step

Steps within each group are independent of each other unless otherwise noted. Groups must be completed in the order listed.

---

### Group A — Utility libraries and components (no external dependencies)

These steps have no dependencies and can be done in any order or in parallel.

---

**A1 — Create `src/hooks/` directory**

Create `sms-system/src/hooks/.gitkeep` (or any file) to establish the directory. All custom hooks for the attendance feature go here.

---

**A2 — Extend types in `src/lib/firebase.ts`**

Apply all changes described in §2.1. This step unblocks all subsequent steps that reference attendance document types.

---

**A3 — Create `src/lib/holidays.ts`**

Copy the `computeEaster` / `getJamaicanPublicHolidays` template from spec §10.1 verbatim. No modifications needed.

---

**A4 — Create `src/lib/attendanceWindows.ts`**

Copy the time window detection template from spec §10.2 verbatim. No modifications needed.

---

**A5 — Create `src/lib/attendanceCalendar.ts`**

Copy the school day checker template from spec §10.4. **Fix the import:**

```typescript
// Change this:
import type { NonSchoolDayDocument } from '@/types/firestore';
// To this:
import type { NonSchoolDayDocument } from '@/lib/firebase';
```

---

**A6 — Create `src/lib/attendanceDraft.ts`**

Copy the localStorage draft template from spec §10.3 verbatim. No modifications needed.

---

**A7 — Create `src/lib/attendanceTotals.ts`**

Copy the totals computation template from spec §10.5 verbatim. No modifications needed.

---

**A8 — Create `src/components/attendance/AttendanceStateButton.tsx`**

Copy the component template from spec §10.6 verbatim. The `src/components/attendance/` directory is new — create it.

---

**A9 — Create `src/components/attendance/ExcusedReasonPopover.tsx`**

Copy the component template from spec §10.7 verbatim.

---

**A10 — Create `src/hooks/useSeniorTeacherProfile.ts`**

This hook fetches `assignedClassId` and `assignedClassName` from the senior_teacher's `users/{uid}` document. It is used only on pages that need homeroom class context (`GeneralAttendanceRegisterPage`, overdue alert). It does not go in `AuthContext` — the fields are role-specific and rarely needed.

```typescript
// src/hooks/useSeniorTeacherProfile.ts

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';

export interface SeniorTeacherProfile {
  assignedClassId: string | null;
  assignedClassName: string | null;
}

export function useSeniorTeacherProfile(): SeniorTeacherProfile & { loading: boolean } {
  const { user, role } = useAuth();
  const [profile, setProfile] = useState<SeniorTeacherProfile>({
    assignedClassId: null,
    assignedClassName: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (USE_MOCK || !user || role !== 'senior_teacher') {
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      const data = snap.data();
      setProfile({
        assignedClassId: data?.assignedClassId ?? null,
        assignedClassName: data?.assignedClassName ?? null,
      });
      setLoading(false);
    });
  }, [user, role]);

  return { ...profile, loading };
}
```

---

**A11 — Create `src/hooks/useInstitutionAcademicCalendar.ts`**

Copy the hook template from spec §10.10. Apply the following fixes:

- Replace all `TermDocument` references with `TermDocument` (same name, now extended — no rename needed)
- Replace `AcademicYearDocument` and `NonSchoolDayDocument` imports: change source from `@/types/firestore` → `@/lib/firebase`
- Add `USE_MOCK` guard at the top of the first `useEffect`:

```typescript
useEffect(() => {
  if (USE_MOCK || !institutionId) { setLoading(false); return; }
  // ... rest of existing effect
}, [institutionId]);
```

- Add the same guard to the second `useEffect`:

```typescript
useEffect(() => {
  if (!activeYear) { setLoading(false); return; }
  // ... rest of existing effect
}, [activeYear]);
```

---

### Group B — Firestore and rules

**Depends on:** Group A (types must exist before writing rule code)

---

**B1 — Deploy rules for `academicYears`, `terms`, `nonSchoolDays`**

The `terms` collection already exists. No new collection needs to be created in the Firebase console for it. Create `academicYears` and `nonSchoolDays` collections (add a placeholder document to each via the console to initialise them, then delete the placeholder).

Add the rules from [§6.1–6.3](#61-academicyears) of this document to `firestore.rules` and deploy. Also update `sms-system/docs/firebase-rules.md` to document the new rule blocks.

---

**B2 — Deploy rules for `generalAttendance` + create composite index**

Create the `generalAttendance` collection (placeholder document → delete).

Add the rule from [§6.4](#64-generalattendance) to `firestore.rules` and deploy.

Create the composite index in the Firebase console:
- Collection: `generalAttendance`
- Fields: `institutionId ASC`, `classId ASC`, `date ASC`, `session ASC`

This index is required for the overdue detection query (spec §3.9).

---

### Group C — Student `classId` fix

**Depends on:** A2 (type changes)

These steps are prerequisite for Group H (student/parent views) and for the `generalAttendance` read rule to work for students.

---

**C1 — Add `classId` to `AuthContext.tsx`**

In `AuthContext.tsx`, add `classId: string | null` to the profile state alongside the existing fields (`role`, `institutionId`, `displayName`, etc.). Populate it from `data?.classId ?? null` when loading the user profile. It is `null` for all roles except `student`.

This makes `classId` available via `useAuth()` so `MyAttendancePage` does not need a separate Firestore read to determine the student's class.

---

**C2 — Update `AdminCreateUserForm.tsx` to write `classId` for students**

When `selectedRole === 'student'`, the form must collect the student's class and write `classId` to `users/{uid}` as part of the batch.

First, verify whether the form already has a class selector for student creation. If it does, confirm the field value is being written to the user document. If it does not, add an optional "Class" dropdown (same as the one used for the homeroom class in Step E1) and write the selected class ID.

```typescript
// In the batch write for student creation:
if (values.role === 'student' && values.classId) {
  // classId already written as part of users/{uid} document payload
  userPayload.classId = values.classId;
}
```

---

**C3 — Update `StudentForm.tsx` to write `classId` on update**

The student update form (`StudentForm.tsx`) must include a "Class" field that reads and writes `classId` on the student's `users/{uid}` document. This allows administrators to correct class assignments for existing students who lack `classId`.

---

### Group D — Academic Calendar

**Depends on:** A (all utility steps), B1 (Firestore + rules)

---

**D1 — Create `src/components/attendance/PendingAcademicYearCard.tsx`**

Copy the component template from spec §10.8 verbatim.

---

**D2 — Build `src/scenes/(dashboard)/academic-calendar/index.tsx`**

This is the most complex single piece in Phase 1. The page has three states:

| State | Condition | View rendered |
| --- | --- | --- |
| **First-time setup** | No active or draft academic year exists | `<AcademicYearWizard />` |
| **Pending confirmation** | A draft year exists | `<DraftYearConfirmation />` |
| **Ongoing management** | An active year exists | `<AcademicCalendarManagementView />` |

**`AcademicYearWizard` — 6 steps (spec §2.3):**

Manage all wizard state in React `useState`. Write **nothing** to Firestore until step 6. On "Confirm and Activate", issue a single `writeBatch()` that writes:
- One `academicYears/{yearId}` document (`status: 'active'`, `confirmedAt`, `confirmedBy`)
- Three `terms/{termId}` documents (with `academicYearId`, `termNumber`, `defaultName`, `startDate`, `endDate`, `status: 'upcoming'`)
- `nonSchoolDays/{id}` documents for each confirmed public holiday (source: `'public_holiday'`, `isActive: true`)
- Any institution-specific non-school days added in step 5

Step 4 (public holidays): call `getJamaicanPublicHolidays(year)` from `src/lib/holidays.ts` to generate the list. Render each holiday with a checkbox. Disable the "Next" button until every holiday has been explicitly checked or unchecked (track this with a `Set` of interacted holiday names).

Step 5 (non-school days): optional. Allow adding single dates or date ranges with a reason string (max 100 chars). Validate that date ranges have `endDate >= startDate`.

**Wizard navigation guard:** Attach a `beforeunload` event listener while the wizard is active. Remove it on unmount or on successful confirmation.

**`DraftYearConfirmation`:** Renders a review of the draft year's pre-filled data with edit capability for each section. On confirm, batch-write with `status: 'active'` and mark the previous year `status: 'completed'`.

**`AcademicCalendarManagementView`:** Display the active year's term dates, school week config, and non-school days in a read-friendly layout. Allow editing term dates and names (individual `updateDoc` calls). Allow adding/deactivating non-school days.

**Auto-generation of next year's draft (spec §2.4):** On management view mount, if `activeYear.endDate < today` and `draftYear === null`, generate a draft document:

```typescript
// Run once on mount; does nothing if already checked this session
if (activeYear && new Date() > activeYear.endDate.toDate() && !draftYear) {
  const nextYear = buildNextYearDraft(activeYear, activeYear.schoolWeekDays);
  await addDoc(collection(db, 'academicYears'), nextYear);
}
```

`buildNextYearDraft` increments dates by one year and calls `getJamaicanPublicHolidays` for the new year.

**`USE_MOCK` guard:** If `USE_MOCK`, render a static placeholder message ("Academic Calendar is not available in demo mode.") — do not attempt any Firestore reads or writes.

---

**D3 — Wire `PendingAcademicYearCard` into the admin dashboard**

File: `src/scenes/(dashboard)/admin/index.tsx`

Add `useInstitutionAcademicCalendar()` at the top of the component. If `draftYear !== null`, render `<PendingAcademicYearCard draftYearName={draftYear.name} />` at the top of the grid layout, above the KPI cards.

```tsx
const { draftYear } = useInstitutionAcademicCalendar();

// In JSX, before the existing KPI cards:
{draftYear && <PendingAcademicYearCard draftYearName={draftYear.name} />}
```

---

### Group E — Senior teacher homeroom assignment

**Depends on:** A2 (type changes), B1 (rules deployed)

---

**E1 — Update `AdminCreateUserForm.tsx` for senior_teacher homeroom dropdown**

When `selectedRole === 'senior_teacher'`, add an optional "Homeroom Class" `<select>` below the Department field. Populate it by querying `classes` where `institutionId == currentUserInstitutionId`.

**Uniqueness check:** Before submitting, query `users` where:
```
institutionId == id AND role == 'senior_teacher' AND assignedClassId == selectedClassId
```
If a result exists, show a field-level error: "This class already has an assigned senior teacher." Block the submit.

**Batch write:** Include `assignedClassId` and `assignedClassName` in the `users/{uid}` document payload when role is `senior_teacher` and a class is selected. If no class is selected, write `assignedClassId: null, assignedClassName: null`.

```typescript
if (values.role === 'senior_teacher') {
  userPayload.assignedClassId = values.assignedClassId ?? null;
  userPayload.assignedClassName = values.assignedClassName ?? null;
}
```

---

### Group F — General Attendance Register page

**Depends on:** A (all steps), B (both steps), D (academic calendar + hook), E (homeroom assignment)

---

**F1 — Build `src/scenes/(dashboard)/attendance/general/index.tsx`**

This is the primary user-facing page for Phase 1. Structure:

```
GeneralAttendanceRegisterPage
├── useAuth() — for role, institutionId, user.uid
├── useInstitutionAcademicCalendar() — for activeTerm, activeYear, nonSchoolDays
├── useSeniorTeacherProfile() — for assignedClassId (senior_teacher only)
│
├── Gate: if loading → spinner
├── Gate: if !activeYear || !activeTerm → "No active term configured" informational state
├── Gate: if role === 'senior_teacher' && !assignedClassId → "No class assigned" state
│
├── Class selector (institution_admin / super_admin only)
│   └── Dropdown: query classes where institutionId == id
│
├── Week navigator
│   ├── ← button (disabled at activeTerm.startDate)
│   ├── Week label ("Week of 9 Jun 2026")
│   └── → button (disabled at current week)
│
├── Weekly grid
│   ├── Column headers: [Mon 9/6 | AM | PM] [Tue 10/6 | AM | PM] ...
│   │   Non-school days: greyed header, disabled cells
│   │   Future days within current week: disabled cells
│   ├── Student rows (sorted by surname, fetched from users where classId == selectedClassId && role == 'student')
│   │   Each cell: <AttendanceStateButton value={} onChange={} disabled={} hasSaveError={} />
│   │   If state === 'E': render <ExcusedReasonPopover /> anchored to the cell
│   └── Overdue indicator chips in column headers (orange "Overdue" tag)
│
├── Save button → handleSave (pattern from spec §10.9)
└── Confirmation dialog (second save attempt with empty cells)
```

**State management:**
- `selectedClassId` — from `assignedClassId` (senior_teacher) or class selector (admin)
- `currentWeekStart` — Monday of the displayed week (ISO string)
- `draft` — `Record<dateISO_session, DraftMap>` (restored from `getDraft` on load; persisted via `setDraftCell` on each cell click)
- `savedDocs` — `GeneralAttendanceDocument[]` fetched from Firestore for the current week
- `saveAttempted` — boolean for the two-step save flow
- `confirmDialogOpen` — boolean

**Firestore query for existing saves:**
```typescript
query(
  collection(db, 'generalAttendance'),
  where('institutionId', '==', institutionId),
  where('classId', '==', selectedClassId),
  where('date', '>=', weekStartISO),
  where('date', '<=', weekEndISO),
)
```

**Draft restoration:** On `[selectedClassId, currentWeekStart]` change, for each day × session in the week, call `getDraft(institutionId, selectedClassId, dateISO, session)` and merge into `draft` state.

**Draft expiry:** On mount, call `purgeExpiredDrafts(activeTerm.startDate.toDate().toISOString().slice(0, 10))`.

**Read-only past terms:** Compute whether the viewed week falls within the `activeTerm` date range. If outside (viewing a past term's week via backward navigation), render all cells as static badges — no `onClick`, no Save button.

**USE_MOCK guard:** If `USE_MOCK`, render a static grid using mock student data from `src/lib/data.ts`. No Firestore reads or writes. Add a `// TODO: add mock attendance data` comment placeholder in `data.ts`.

---

### Group G — Dashboard overdue alerts

**Depends on:** B2 (generalAttendance collection + rules), D3 (useInstitutionAcademicCalendar in admin dashboard)

---

**G1 — Senior_teacher dashboard overdue banner**

File: `src/scenes/(dashboard)/senior-teacher/index.tsx`

On mount, if `!USE_MOCK && assignedClassId`:
1. Compute today's ISO date string
2. Query `generalAttendance` where `classId == assignedClassId && date == today`
3. For each of AM and PM: if the window has closed (`isSessionWindowClosed('AM')` / `isSessionWindowClosed('PM')`) and the session document is missing or has no `submittedAt` — add to `overdueSlots`

Render one dismissable banner per overdue slot at the top of the dashboard:

```tsx
<div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-md p-3 flex items-center justify-between">
  <span className="text-sm text-orange-800 dark:text-orange-300">
    {slot.session} register for {assignedClassName} was not submitted.{' '}
    <a href="/attendance/general" className="underline font-medium">Submit now →</a>
  </span>
  <button onClick={() => dismiss(slot)} className="text-orange-400 hover:text-orange-600 text-xs ml-4">✕</button>
</div>
```

Use `useSeniorTeacherProfile()` to get `assignedClassId` and `assignedClassName`.

---

**G2 — Institution_admin dashboard overdue badge**

File: `src/scenes/(dashboard)/admin/index.tsx`

Extend the existing `useInstitutionAcademicCalendar()` call already added in Step D3. On mount, if `!USE_MOCK`:
1. Query all classes for the institution
2. Query `generalAttendance` where `institutionId == id && date == today`
3. For each class × session where the window has closed and no saved document exists → count as overdue

Render a subtle count chip on an existing dashboard card (e.g., the existing Attendance card or a new card):

```tsx
{overdueCount > 0 && (
  <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
    {overdueCount} register slot{overdueCount > 1 ? 's' : ''} overdue today
  </span>
)}
```

This is intentionally minor — no banner, no modal, no blocking element.

---

### Group H — Student and parent attendance views

**Depends on:** B2 (generalAttendance rules), C (student classId fix), F1 (register exists)

---

**H1 — Build `src/scenes/(dashboard)/attendance/my/index.tsx`**

Two-tab layout:

**Tab 1 — General Attendance:**
1. Get `classId` and `user.uid` from `useAuth()`
2. If `!classId`, show: "Your class assignment is not configured. Contact your administrator."
3. Get `activeTerm` from `useInstitutionAcademicCalendar()`
4. Query all `generalAttendance` documents where `classId == classId && date >= termStart && date <= termEnd`
5. From each document, extract only `records[uid]`
6. Display a date-range table: columns = Date · Session · State · Reason (for E state)
7. Below the table, render a totals row using `computeAttendanceTotals()` with `totalExpectedSessions` from `countExpectedSessions()`
8. Show "X of Y sessions recorded" to indicate completeness

**Tab 2 — Subject Attendance:**
```tsx
<p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">
  Subject attendance is not yet available.
</p>
```

**USE_MOCK guard:** If `USE_MOCK`, show static demo data (a few rows and totals).

---

**H2 — Build `src/scenes/(dashboard)/attendance/child/index.tsx`**

1. Get `linkedAccounts` from `useAuth()` (parent's linked child UIDs)
2. For each child UID, fetch `users/{uid}` to get `name` and `classId`
3. If multiple children, render a child selector (dropdown or tabs)
4. For the selected child, render the same General Attendance view as `MyAttendancePage` Tab 1, filtered to `child.classId` and `records[child.uid]`
5. Subject Attendance tab: placeholder ("Subject attendance is not yet available.")

**Null `classId` on child:** If a child's document lacks `classId`, show the same "class assignment not configured" message.

**USE_MOCK guard:** Same as H1.

---

### Group I — Subject register placeholder

**Depends on:** nothing (static page)

---

**I1 — Build `src/scenes/(dashboard)/attendance/subject/index.tsx`**

Render the placeholder from spec §5.5. For `regular_teacher` and `super_admin`:

```tsx
<p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">
  Subject Attendance is not yet available. Your institution admin needs to
  configure subject assignments before this feature becomes active.
</p>
```

For `institution_admin`, append:

```tsx
<p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2">
  Subject Attendance is a Phase 2 feature and has not yet been implemented.
</p>
```

This page must exist before Group J (routing) can be wired.

---

### Group J — Navigation and routing

**Depends on:** D2 (academic calendar page), F1 (general register page), H1 (student view), H2 (parent view), I1 (subject placeholder)

All five pages must exist before routes and sidebar items are added.

---

**J1 — Add routes to `src/App.tsx`**

Add five new routes inside the `<Protected>` wrapper. Match the existing pattern for role-restricted routes (e.g., how `/create-user` is guarded):

```tsx
// Academic Calendar — institution_admin only
{(role === 'institution_admin') && (
  <Route path="/academic-calendar" element={<AcademicCalendarPage />} />
)}

// General Register — institution_admin, senior_teacher, super_admin
{(['institution_admin', 'senior_teacher', 'super_admin'] as Role[]).includes(role!) && (
  <Route path="/attendance/general" element={<GeneralAttendanceRegisterPage />} />
)}

// Subject Register — institution_admin, regular_teacher, super_admin
{(['institution_admin', 'regular_teacher', 'super_admin'] as Role[]).includes(role!) && (
  <Route path="/attendance/subject" element={<SubjectAttendanceRegisterPage />} />
)}

// My Attendance — student only
{role === 'student' && (
  <Route path="/attendance/my" element={<MyAttendancePage />} />
)}

// Child Attendance — parent only
{role === 'parent' && (
  <Route path="/attendance/child" element={<ChildAttendancePage />} />
)}
```

Adjust to match the exact guarding pattern used elsewhere in `App.tsx`.

---

**J2 — Add "ATTENDANCE" section to `src/components/Menu.tsx`**

Add a new section after the existing menu sections. Follow the exact item shape and `visible` array pattern already used:

```typescript
{
  title: "ATTENDANCE",
  items: [
    {
      icon: "/calendar.png",     // verify icon exists in public/; substitute if not
      label: "Academic Calendar",
      href: "/academic-calendar",
      visible: ["institution_admin"],
    },
    {
      icon: "/attendance.png",
      label: "General Register",
      href: "/attendance/general",
      visible: ["institution_admin", "senior_teacher", "super_admin"],
    },
    {
      icon: "/subject.png",
      label: "Subject Register",
      href: "/attendance/subject",
      visible: ["institution_admin", "regular_teacher", "super_admin"],
    },
    {
      icon: "/attendance.png",
      label: "My Attendance",
      href: "/attendance/my",
      visible: ["student"],
    },
    {
      icon: "/attendance.png",
      label: "Attendance",
      href: "/attendance/child",
      visible: ["parent"],
    },
  ],
},
```

Verify icon filenames against the `public/` directory before committing. Substitute with any available icon if the named file does not exist.

---

### Group K — PDF export

**Depends on:** F1 (register page must exist; PDF is triggered from within it)

---

**K1 — Build `src/components/attendance/AttendanceScopeModal.tsx`**

A modal that prompts the user to choose one of three scopes before downloading:

| Scope | Description |
| --- | --- |
| `'week'` | The weekly grid currently on screen |
| `'term'` | All weeks in the current term |
| `'summary'` | One row per student; totals only |

On "Download", call `pdf(<AttendancePDF ... />).toBlob()` and trigger a browser download.

---

**K2 — Build `src/components/attendance/AttendancePDF.tsx`**

A `@react-pdf/renderer` `<Document>` component. Three render modes driven by `scope` prop. Key implementation notes:

- **Tailwind does not work in PDFs.** Map the `STATE_CLASS` color strings from `AttendanceStateButton` to hex RGB values for inline `style` props:

```typescript
const PDF_COLORS: Record<AttendanceState, string> = {
  P: '#22c55e', // green-500
  A: '#ef4444', // red-500
  L: '#fb923c', // orange-400
  E: '#3b82f6', // blue-500
  S: '#a855f7', // purple-500
};
```

- **Always render in light mode** regardless of the user's UI theme (spec §7.3). Do not read from the theme context.
- **`'term'` scope:** Fetch all `generalAttendance` documents for the term before opening the modal (or fetch inside the modal with a loading state). Pass the data as a prop to `AttendancePDF`.
- **`'summary'` scope:** Compute per-student totals using `computeAttendanceTotals()` before rendering.
- **Header fields** (all scopes): institution name, class name, academic year + term name, date range, export timestamp.
- **Footer:** Page number · "Generated by School Management System"

Wire the `<AttendanceScopeModal />` into `GeneralAttendanceRegisterPage` — trigger it from a "Download PDF" button in the page header.

---

## 4. Phase 2 — Subject Attendance Register (Deferred)

The following steps are not part of the current implementation. They are recorded here for planning reference. Full detail in spec §4 and §12.1.

| Step | Task | Blocks |
| --- | --- | --- |
| P2-1 | Add `frequency`, `sessionDayOfWeek`, `customFrequencyDays` to `SubjectForm.tsx`, `SubjectDocument` type, and Zod schema | P2-2 onwards |
| P2-2 | Create `subjectEnrollments` Firestore collection; deploy rules from §6.5 of this document | P2-3 |
| P2-3 | Add enrollment UI to `SubjectForm`: per-class "All students enrolled" checkbox + student exclusion checklist; write `subjectEnrollments/{subjectId}_{classId}` on save | P2-4 |
| P2-4 | Create `subjectAttendance` Firestore collection; deploy rules from §6.6 of this document | P2-5 |
| P2-5 | Build `SubjectAttendanceRegisterPage` (replaces Phase 1 placeholder) | P2-6, P2-7 |
| P2-6 | Extend `MyAttendancePage` and `ChildAttendancePage` to show Subject Attendance tab | — |
| P2-7 | Extend institution_admin overdue badge to include Subject Register slots | — |

**Hold on rule deployment:** Do not deploy `subjectAttendance` rules (§6.6) until Step P2-5 ships. `teacherIds` is live on subject documents, so the rules are safe when deployed, but deploying them before the page exists serves no purpose and adds untested surface area.

---

## 5. Files Reference

### New files

| File | Created in step |
| --- | --- |
| `src/hooks/useSeniorTeacherProfile.ts` | A10 |
| `src/hooks/useInstitutionAcademicCalendar.ts` | A11 |
| `src/lib/holidays.ts` | A3 |
| `src/lib/attendanceWindows.ts` | A4 |
| `src/lib/attendanceCalendar.ts` | A5 |
| `src/lib/attendanceDraft.ts` | A6 |
| `src/lib/attendanceTotals.ts` | A7 |
| `src/components/attendance/AttendanceStateButton.tsx` | A8 |
| `src/components/attendance/ExcusedReasonPopover.tsx` | A9 |
| `src/components/attendance/PendingAcademicYearCard.tsx` | D1 |
| `src/components/attendance/AttendanceScopeModal.tsx` | K1 |
| `src/components/attendance/AttendancePDF.tsx` | K2 |
| `src/scenes/(dashboard)/academic-calendar/index.tsx` | D2 |
| `src/scenes/(dashboard)/attendance/general/index.tsx` | F1 |
| `src/scenes/(dashboard)/attendance/subject/index.tsx` | I1 |
| `src/scenes/(dashboard)/attendance/my/index.tsx` | H1 |
| `src/scenes/(dashboard)/attendance/child/index.tsx` | H2 |

### Modified files

| File | Change | Step |
| --- | --- | --- |
| `src/lib/firebase.ts` | Extend `TermDocument`; add `AcademicYearDocument`, `NonSchoolDayDocument`, `GeneralAttendanceDocument`; add `assignedClassId`/`assignedClassName`/`classId` to `UserDocument` | A2 |
| `src/lib/AuthContext.tsx` | Add `classId: string \| null` to profile state | C1 |
| `src/components/forms/AdminCreateUserForm.tsx` | Write `classId` for students; add homeroom class dropdown for `senior_teacher` | C2, E1 |
| `src/components/forms/StudentForm.tsx` | Add/write `classId` on update | C3 |
| `src/scenes/(dashboard)/admin/index.tsx` | Add `PendingAcademicYearCard`; add overdue badge | D3, G2 |
| `src/scenes/(dashboard)/senior-teacher/index.tsx` | Add overdue banner | G1 |
| `src/App.tsx` | Add five attendance routes | J1 |
| `src/components/Menu.tsx` | Add ATTENDANCE section | J2 |
| `firestore.rules` | Add rules for `academicYears`, `terms` (additive), `nonSchoolDays`, `generalAttendance` | B1, B2 |
| `sms-system/docs/firebase-rules.md` | Document new rule blocks | B1, B2 |

### New Firestore collections

| Collection | Step |
| --- | --- |
| `academicYears` | B1 |
| `nonSchoolDays` | B1 |
| `generalAttendance` | B2 |

### New Firestore indexes

| Collection | Fields | Step |
| --- | --- | --- |
| `generalAttendance` | `institutionId ASC`, `classId ASC`, `date ASC`, `session ASC` | B2 |

---

## 6. Corrected Firestore Security Rules

**These rules replace the versions in `ATTENDANCE_REGISTER_SPEC.md` §9**, which used helper function names that do not exist in the deployed ruleset. All rules below use the actual deployed helpers (`isSignedIn`, `isAdmin`, `isAdminOrAbove`, `isSeniorTeacher`, `isParent`, `myRole`, `sameInstitution`, `writingToMyInstitution`).

Add each block to `firestore.rules` in the appropriate section.

### 6.1 `academicYears`

```javascript
match /academicYears/{yearId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create, update, delete: if isSignedIn()
    && isAdmin()
    && writingToMyInstitution();
}
```

### 6.2 `terms` (academic calendar additions)

These rules are **additive** to any existing `terms` rules. If a `terms` match block already exists, merge rather than duplicate.

```javascript
match /terms/{termId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create, update, delete: if isSignedIn()
    && isAdmin()
    && writingToMyInstitution();
}
```

### 6.3 `nonSchoolDays`

```javascript
match /nonSchoolDays/{dayId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create, update, delete: if isSignedIn()
    && isAdmin()
    && writingToMyInstitution();
}
```

### 6.4 `generalAttendance`

```javascript
match /generalAttendance/{docId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId)
    && (
      isAdminOrAbove()
      || isSeniorTeacher()
      || (
        // student: reads the full class document; client filters to own row
        myRole() == 'student'
        && get(/databases/$(database)/documents/users/$(request.auth.uid))
             .data.classId == resource.data.classId
      )
      || (
        // parent: reads any document in their institution;
        // client filters to linked children only
        isParent()
      )
    );

  allow create, update: if isSignedIn()
    && writingToMyInstitution()
    && (
      isAdmin()
      || (
        isSeniorTeacher()
        && get(/databases/$(database)/documents/users/$(request.auth.uid))
             .data.assignedClassId == request.resource.data.classId
      )
    );

  allow delete: if isSignedIn()
    && isAdmin()
    && sameInstitution(resource.data.institutionId);
}
```

### 6.5 `subjectEnrollments` — Phase 2

```javascript
match /subjectEnrollments/{enrollId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create, update, delete: if isSignedIn()
    && isAdmin()
    && writingToMyInstitution();
}
```

### 6.6 `subjectAttendance` — Phase 2

```javascript
match /subjectAttendance/{docId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId)
    && (
      isAdminOrAbove()
      || (
        myRole() == 'regular_teacher'
        && request.auth.uid in get(
             /databases/$(database)/documents/subjects/$(resource.data.subjectId)
           ).data.teacherIds
      )
      || myRole() == 'student'  // client-side filtered to own records
      || isParent()             // client-side filtered to linked children
    );

  allow create, update: if isSignedIn()
    && writingToMyInstitution()
    && (
      isAdmin()
      || (
        myRole() == 'regular_teacher'
        && request.auth.uid == request.resource.data.teacherId
        && request.auth.uid in get(
             /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
           ).data.teacherIds
      )
    );

  allow delete: if isSignedIn()
    && isAdmin()
    && sameInstitution(resource.data.institutionId);
}
```

**Hold:** Deploy §6.6 only when the Subject Attendance Register page (Step P2-5) ships.
