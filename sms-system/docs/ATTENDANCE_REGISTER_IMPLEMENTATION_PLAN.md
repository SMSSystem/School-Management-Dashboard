# Attendance Register — Implementation Plan

> **Purpose:** Step-by-step implementation guide for the Attendance Register feature. Complements `ATTENDANCE_REGISTER_SPEC.md`, which contains all design decisions, schemas, code templates, and security rules. This document provides the concrete implementation order, exact file paths, codebase-specific adaptations, and pre-implementation fixes that the spec does not cover.
>
> **Date documented:** 2026-06-11
> **Branch:** `post-mvp-additions`
> **Spec reference:** `sms-system/docs/ATTENDANCE_REGISTER_SPEC.md`
> **Status:** Phase 1 complete. Phase 2 complete (all steps P2-1 through P2-7 done).

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
4. [Phase 2 — Subject Attendance Register](#4-phase-2--subject-attendance-register)
   - [4.1 Design Decisions](#41-design-decisions)
   - [4.2 Prerequisites — Corrections and Extensions](#42-prerequisites--corrections-and-extensions)
   - [4.3 P2-2 — Create `subjectEnrollments` Collection (Firebase Console)](#43-p2-2--create-subjectenrollments-collection-firebase-console)
   - [4.4 P2-3 — Enrollment UI in SubjectForm](#44-p2-3--enrollment-ui-in-subjectform)
   - [4.5 P2-4 — Create `subjectAttendance` Collection (Firebase Console, hold)](#45-p2-4--create-subjectattendance-collection-firebase-console-hold)
   - [4.6 P2-5 — Subject Attendance Register Page](#46-p2-5--subject-attendance-register-page)
   - [4.7 P2-6 — Tabs in MyAttendancePage and ChildAttendancePage](#47-p2-6--tabs-in-myattendancepage-and-childattendancepage)
   - [4.8 P2-7 — Extend Institution Admin Overdue Badge](#48-p2-7--extend-institution-admin-overdue-badge)
   - [4.9 Phase 2 Files and Collections Reference](#49-phase-2-files-and-collections-reference)
5. [Phase 2 Implementation Status](#5-phase-2-implementation-status)
6. [Files Reference](#6-files-reference)
7. [Corrected Firestore Security Rules](#7-corrected-firestore-security-rules)

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

`ATTENDANCE_REGISTER_SPEC.md` §9 was written with hypothetical helper function names (`callerRole()`, `callerInstitutionId()`, `isInstitutionMember()`). The deployed ruleset uses different names. **Do not use the rules in §9 directly.** Use the corrected rules in [§7 of this document](#7-corrected-firestore-security-rules) instead.

---

## 3. Phase 1 — Step-by-Step

Steps within each group are independent of each other unless otherwise noted. Groups must be completed in the order listed.

---

### Group A — Utility libraries and components (no external dependencies)

> *Status: All steps in this group (A1–A11) are complete [DONE].*

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

> *Status: All steps in this group (B1–B2) are complete [DONE]. Rules documented in `firebase-rules.md` — pending deployment to Firebase Console.*

**Depends on:** Group A (types must exist before writing rule code)

---

**B1 — Deploy rules for `academicYears`, `terms`, `nonSchoolDays`**

The `terms` collection already exists. No new collection needs to be created in the Firebase console for it. Create `academicYears` and `nonSchoolDays` collections (add a placeholder document to each via the console to initialise them, then delete the placeholder).

Add the rules from [§7.1–7.3](#71-academicyears) of this document to `firestore.rules` and deploy. Also update `sms-system/docs/firebase-rules.md` to document the new rule blocks.

---

**B2 — Deploy rules for `generalAttendance` + create composite index**

Create the `generalAttendance` collection (placeholder document → delete).

Add the rule from [§7.4](#74-generalattendance) to `firestore.rules` and deploy.

Create the composite index in the Firebase console:
- Collection: `generalAttendance`
- Fields: `institutionId ASC`, `classId ASC`, `date ASC`, `session ASC`

This index is required for the overdue detection query (spec §3.9).

---

### Group C — Student `classId` fix

> *Status: All steps in this group (C1–C3) are complete [DONE]. Backfill admin tool also added at `/admin/backfill-student-classes` (user-requested addition).*

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

> *Status: All steps in this group (D1–D3) are complete [DONE].*

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

> *Status: All steps in this group (E1) are complete [DONE].*

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

> *Status: All steps in this group (F1) are complete [DONE].*

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

> *Status: All steps in this group (G1–G2) are complete [DONE]. Note: the senior teacher overdue banner (G1) was built non-dismissable; dismiss button is listed in `ATTENDANCE_REGISTER_PHASE1_REVIEW.md` Priority 2.*

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

> *Status: All steps in this group (H1–H2) are complete [DONE]. Both pages were built as single-view (no tabs); tabbed layout is the Phase 2 target. See codebase deviation note in H2 below regarding parent-child linking.*

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

1. ~~Get `linkedAccounts` from `useAuth()` (parent's linked child UIDs)~~ **Codebase deviation:** `AuthContext.linkedAccounts` is a single descriptive string, not a UID array. The implementation queries the `student_parents` Firestore collection (`where('parentId', '==', user.uid)`) to resolve linked children. Each result document contains `parentId` and `studentId` fields.
2. For each child UID, fetch `users/{uid}` to get `name` and `classId`
3. If multiple children, render a child selector (dropdown or tabs)
4. For the selected child, render the same General Attendance view as `MyAttendancePage` Tab 1, filtered to `child.classId` and `records[child.uid]`
5. Subject Attendance tab: placeholder ("Subject attendance is not yet available.")

**Null `classId` on child:** If a child's document lacks `classId`, show the same "class assignment not configured" message.

**USE_MOCK guard:** Same as H1.

---

### Group I — Subject register placeholder

> *Status: All steps in this group (I1) are complete [DONE]. Note: the institution_admin-specific message from the spec was not added; it is listed in `ATTENDANCE_REGISTER_PHASE1_REVIEW.md` Priority 2.*

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

> *Status: All steps in this group (J1–J2) are complete [DONE]. Role access corrections applied post-review: `super_admin` removed from Academic Calendar route/menu; `senior_teacher` removed from Subject Register route/menu.*

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

> *Status: All steps in this group (K1–K2) are complete [DONE]. Deviations: scope modal built as flexible date-range picker (not three named scopes from spec §7.1); PDF lacks export timestamp and page-number footer from spec §7.3. See `ATTENDANCE_REGISTER_PHASE1_REVIEW.md` Priority 4.*

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

## 4. Phase 2 — Subject Attendance Register

### Step overview

| Step | Task | Blocks |
| --- | --- | --- |
| Pre-A | Fix deployed `subjectEnrollments` rules (Firebase Console + `firebase-rules.md`) | P2-3 |
| Pre-B | Add `fortnightly` to `SubjectDocument` type and `SubjectForm` | P2-3, P2-5 |
| P2-2 | Create `subjectEnrollments` Firestore collection via placeholder document | P2-3 |
| P2-3 | Add per-class enrollment UI to `SubjectForm`; write `subjectEnrollments/{subjectId}_{classId}` on save | P2-4 |
| P2-4 | Create `subjectAttendance` Firestore collection; deploy §7.6 rules (hold until P2-5) | P2-5 |
| P2-5 | Build `SubjectAttendanceRegisterPage` (replaces Phase 1 placeholder) | P2-6, P2-7 |
| P2-6 | Extend `MyAttendancePage` and `ChildAttendancePage` with Subject Attendance tab (real data) | — |
| P2-7 | Extend institution_admin overdue badge to include Subject Register overdue slots | — |

---

### 4.1 Design Decisions

The following decisions were confirmed before Phase 2 implementation began. They resolve ambiguities between the spec and the Phase 1 implementation.

| Decision | Chosen | Rejected | Reason |
| --- | --- | --- | --- |
| Enrollment model | Per-class exclusion (spec §8.6): one doc per `{subjectId}_{classId}`, with `enrollmentType: 'all' \| 'selective'` and `excludedStudentIds: string[]` | Per-student model (one doc per student-subject-term with `studentId` field) | Per-class model is O(classes) not O(students), eliminates re-enrollment on student changes, and is the model specified in spec §8.6 |
| Frequency values | `'daily' \| 'weekly' \| 'fortnightly'` — add fortnightly as a third option | Leave at `'daily' \| 'weekly'` | Many school subjects run every other week; fortnightly is a distinct scheduling pattern with its own column-visibility logic in the register grid |
| Overdue threshold (Subject Register) | 15:00 JST (end of school day) | Earlier window close times (e.g., 12:30 for AM/PM split) | Subject sessions run throughout the day with no fixed time slot; 15:00 is the latest reasonable point after which a missed session is definitively overdue |
| Tab shells in student/parent views | Merge into P2-6 — add tabs only when Subject Attendance data is real | Add empty tab shells in Phase 1 as Priority 2.1 | Adding empty shells before the backing data exists serves no functional purpose and creates a dead UI state to maintain |

**Important — deployed rules mismatch:** The `subjectEnrollments` rules deployed to Firebase Console during Phase 1 (P2-0c) reference `resource.data.studentId`, which matches the per-student model and not the chosen per-class exclusion model. These rules must be corrected before P2-3 is implemented. See §4.2 Pre-A below.

---

### 4.2 Prerequisites — Corrections and Extensions

These steps extend Phase 1 work. They must be complete before any of P2-2 through P2-7 begins.

---

#### Pre-A — Fix `subjectEnrollments` Firestore rules

**Why:** The rules deployed during Phase 1 (P2-0c) read:

```firestore
allow read: if isSignedIn()
  && (
    (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)))
  );
```

This references `resource.data.studentId`, which does not exist on per-class exclusion documents. Under these rules:

- Students cannot read enrollment documents (their UID will never match a non-existent `studentId` field)
- Parents cannot read enrollment documents (the `student_parents` lookup key is built from a non-existent field)
- Both conditions evaluate to `false`, silently denying read access

**Action:** Replace with the simpler institution-scoped read from §7.5 of this document. Enrollment data (which subjects a class takes, and who is excluded) is not sensitive — any signed-in institution member can read it.

**Deploy to Firebase Console first, then update `firebase-rules.md`:**

```firestore
// ── Subject Enrollments ────────────────────────────────────────────────────
// One document per subject-class pairing.
// Doc ID: {subjectId}_{classId}
// Schema: { institutionId, subjectId, subjectName, classId, className,
//           enrollmentType, excludedStudentIds, excludedStudentNames,
//           updatedAt, updatedBy }
match /subjectEnrollments/{enrollmentId} {
  allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);

  allow create: if isAdminOrAbove() && writingToMyInstitution();

  allow update: if isAdminOrAbove()
    && sameInstitution(resource.data.institutionId)
    && institutionNotChanged();

  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

After deploying to Firebase Console, update `sms-system/docs/firebase-rules.md` to replace the existing `subjectEnrollments` block with this version. The `firebase-rules.md` file only reflects rules that are live — do not update the file before deploying.

---

#### Pre-B — Add `fortnightly` to `SubjectDocument` type

**File:** `src/lib/firebase.ts`

Change the `frequency` union in `SubjectDocument`:

```typescript
// BEFORE
frequency?: 'daily' | 'weekly' | 'custom';
sessionDayOfWeek?: number[];
customFrequencyDays?: string[];

// AFTER
frequency?: 'daily' | 'weekly' | 'fortnightly' | 'custom';
sessionDayOfWeek?: number[];
customFrequencyDays?: string[];
fortnightlyOffset?: 0 | 1; // 0 = meets in term weeks 1,3,5…; 1 = meets in weeks 2,4,6…
```

The `fortnightlyOffset` field determines which week cycle the subject is on relative to the term start date. Week number is computed as `Math.floor((dayDate - termStartDate) / 7days)`. If `weekIndex % 2 === fortnightlyOffset`, the week has a session.

---

#### Pre-C — Add `fortnightly` to `SubjectForm`

**File:** `src/components/forms/SubjectForm.tsx`

**1. Zod schema** — change `frequency` enum and add `fortnightlyOffset`:

```typescript
// BEFORE
frequency: z.enum(['daily', 'weekly']),

// AFTER
frequency: z.enum(['daily', 'weekly', 'fortnightly']),
fortnightlyOffset: z.union([z.literal(0), z.literal(1)]).optional(),
```

Add a `superRefine` rule for fortnightly (alongside the existing weekly rule):

```typescript
if (data.frequency === 'fortnightly' && data.sessionDayOfWeek.length === 0) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Select at least one day.",
    path: ["sessionDayOfWeek"],
  });
}
```

**2. Local state** — add `fortnightlyOffset`:

```typescript
const [fortnightlyOffset, setFortnightlyOffset] = useState<0 | 1>(0);
```

**3. `defaultValues`** — add `fortnightlyOffset: 0`.

**4. Update mode restore** — in the `useEffect` for `type === 'update'`, extend the frequency type and restore fortnightly state:

```typescript
// BEFORE
const freq: 'daily' | 'weekly' = data.frequency === 'daily' ? 'daily' : 'weekly';

// AFTER
const freq: 'daily' | 'weekly' | 'fortnightly' =
  data.frequency === 'daily' ? 'daily'
  : data.frequency === 'fortnightly' ? 'fortnightly'
  : 'weekly';

// In the existing if/else for daily:
if (freq === 'daily') {
  setIncludeSaturday(days.includes(6));
} else if (freq === 'fortnightly') {
  setSelectedDays(days);
  setFortnightlyOffset(data.fortnightlyOffset ?? 0);
} else {
  setSelectedDays(days);
}
```

**5. `handleFrequencyChange`** — update signature and fortnightly handling:

```typescript
const handleFrequencyChange = (f: 'daily' | 'weekly' | 'fortnightly') => {
  setValue('frequency', f);
  if (f === 'daily') {
    setValue('sessionDayOfWeek', includeSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]);
  } else {
    // both 'weekly' and 'fortnightly' use the day checkbox UI
    setValue('sessionDayOfWeek', selectedDays);
  }
};
```

**6. Frequency radio buttons** — extend the map to three options:

```tsx
// BEFORE
{(['daily', 'weekly'] as const).map((f) => ( ... ))}

// AFTER
{(['daily', 'weekly', 'fortnightly'] as const).map((f) => (
  <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
    <input
      type="radio"
      checked={frequency === f}
      onChange={() => handleFrequencyChange(f)}
    />
    {f.charAt(0).toUpperCase() + f.slice(1)}
  </label>
))}
```

**7. Fortnightly day + offset UI** — add after the existing `frequency === 'weekly'` block:

```tsx
{frequency === 'fortnightly' && (
  <>
    <div className="flex flex-wrap gap-4 mt-1">
      {DAY_OPTIONS.map(({ label, value }) => (
        <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selectedDays.includes(value)}
            onChange={() => toggleDay(value)}
          />
          {label}
        </label>
      ))}
    </div>
    <div className="flex gap-6 mt-2">
      {([0, 1] as const).map((offset) => (
        <label key={offset} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            checked={fortnightlyOffset === offset}
            onChange={() => {
              setFortnightlyOffset(offset);
              setValue('fortnightlyOffset', offset);
            }}
          />
          {offset === 0 ? 'Starts week 1 of term (odd weeks)' : 'Starts week 2 of term (even weeks)'}
        </label>
      ))}
    </div>
  </>
)}
```

**8. `onSubmit` payload** — add `fortnightlyOffset` to the payload:

```typescript
const payload = {
  // ... existing fields ...
  frequency: formData.frequency,
  sessionDayOfWeek: formData.sessionDayOfWeek,
  fortnightlyOffset: formData.frequency === 'fortnightly' ? fortnightlyOffset : undefined,
};
```

---

### 4.3 P2-2 — Create `subjectEnrollments` Collection (Firebase Console)

**This is a Firebase Console–only step. No code changes.**

1. Open Firebase Console → Firestore → Data
2. Add a collection named `subjectEnrollments`
3. Add a placeholder document with any string ID (e.g., `_placeholder`)
4. Delete the placeholder document immediately

The collection now exists and the Pre-A rules (already deployed) will govern access. P2-3 can now write to it.

---

### 4.4 P2-3 — Enrollment UI in SubjectForm

**File:** `src/components/forms/SubjectForm.tsx`

This step adds a per-class enrollment section below the frequency fields and before the submit button. It only renders when the form has a frequency selected.

**New imports:**

```typescript
import { getDocs, setDoc } from 'firebase/firestore';
```

Replace the `addDoc` import with one that also imports `setDoc` (needed to write with a deterministic doc ID).

**New state:**

```typescript
// Map: classId → { type: 'all' | 'selective', excludedIds: string[], excludedNames: string[] }
const [enrollmentByClass, setEnrollmentByClass] = useState<
  Record<string, { type: 'all' | 'selective'; excludedIds: string[]; excludedNames: string[] }>
>({});

// Map: classId → { uid: string, name: string }[]  (loaded on demand)
const [classStudents, setClassStudents] = useState<
  Record<string, { uid: string; name: string }[]>
>({});
```

**Load students on demand** (called when a class switches to `'selective'`):

```typescript
async function loadStudentsForClass(classId: string) {
  if (classStudents[classId]) return;
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('institutionId', '==', institutionId),
      where('role', '==', 'student'),
      where('classId', '==', classId),
    )
  );
  setClassStudents((prev) => ({
    ...prev,
    [classId]: snap.docs
      .map((d) => ({ uid: d.id, name: d.data().name as string }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
```

**Update mode restore** — in the existing `useEffect` for `type === 'update'`, after the existing state resets, fetch existing `subjectEnrollments` docs and pre-populate `enrollmentByClass`:

```typescript
if (type === 'update' && data?.id) {
  getDocs(
    query(collection(db, 'subjectEnrollments'), where('subjectId', '==', data.id))
  ).then((snap) => {
    const byClass: Record<string, { type: 'all' | 'selective'; excludedIds: string[]; excludedNames: string[] }> = {};
    snap.docs.forEach((d) => {
      const doc = d.data();
      byClass[doc.classId as string] = {
        type: doc.enrollmentType as 'all' | 'selective',
        excludedIds: (doc.excludedStudentIds as string[]) ?? [],
        excludedNames: (doc.excludedStudentNames as string[]) ?? [],
      };
    });
    setEnrollmentByClass(byClass);
  });
}
```

**Enrollment UI** — add inside the outer `<div className="flex justify-between flex-wrap gap-4">`, after the frequency section and before the submit button. The section renders regardless of `classScope` — for `'institution'` scope, all institution classes are shown; for `'class'` scope, only selected classes are shown:

```tsx
{frequency && (
  <div className="flex flex-col gap-2 w-full">
    <label className="text-xs text-gray-500 dark:text-gray-300">Student Enrollment</label>
    {(classScope === 'class' ? selectedClassIds : liveClasses.map((c) => c.id)).length === 0 ? (
      <p className="text-xs text-gray-400">
        {classScope === 'class' ? 'Select at least one class above.' : 'No classes found.'}
      </p>
    ) : (
      (classScope === 'class' ? selectedClassIds : liveClasses.map((c) => c.id)).map((classId) => {
        const cls = liveClasses.find((c) => c.id === classId);
        const enrollment = enrollmentByClass[classId] ?? { type: 'all', excludedIds: [], excludedNames: [] };
        return (
          <div key={classId} className="ring-[1.5px] ring-gray-300 dark:ring-gray-600 rounded-md p-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{cls?.name ?? classId}</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enrollment.type === 'all'}
                onChange={(e) => {
                  const nextType = e.target.checked ? 'all' : 'selective';
                  setEnrollmentByClass((prev) => ({
                    ...prev,
                    [classId]: { type: nextType, excludedIds: [], excludedNames: [] },
                  }));
                  if (nextType === 'selective') loadStudentsForClass(classId);
                }}
              />
              All students enrolled
            </label>
            {enrollment.type === 'selective' && (
              <div className="ml-4 max-h-32 overflow-y-auto flex flex-col gap-1">
                {(classStudents[classId] ?? []).length === 0 ? (
                  <p className="text-xs text-gray-400">Loading students…</p>
                ) : (
                  (classStudents[classId] ?? []).map((student) => {
                    const excluded = enrollment.excludedIds.includes(student.uid);
                    return (
                      <label key={student.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={() => {
                            setEnrollmentByClass((prev) => {
                              const curr = prev[classId] ?? { type: 'selective', excludedIds: [], excludedNames: [] };
                              const nextExcludedIds = excluded
                                ? curr.excludedIds.filter((id) => id !== student.uid)
                                : [...curr.excludedIds, student.uid];
                              const nextExcludedNames = excluded
                                ? curr.excludedNames.filter((n) => n !== student.name)
                                : [...curr.excludedNames, student.name];
                              return {
                                ...prev,
                                [classId]: { ...curr, excludedIds: nextExcludedIds, excludedNames: nextExcludedNames },
                              };
                            });
                          }}
                        />
                        {student.name}
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })
    )}
  </div>
)}
```

**`onSubmit` — write enrollment docs** after the subject document is saved. For `create` mode the subject ID comes from `addDoc`'s return value, so enrollment writes must happen in `.then()` on the `addDoc` call. For `update` mode, `setDoc` with the deterministic ID upserts the existing enrollment doc.

```typescript
async function writeEnrollments(subjectId: string, subjectName: string) {
  const classesToEnroll =
    classScope === 'class'
      ? selectedClassIds.map((id, i) => ({ id, name: selectedClassNames[i] }))
      : liveClasses;

  for (const cls of classesToEnroll) {
    const enrollment = enrollmentByClass[cls.id] ?? { type: 'all', excludedIds: [], excludedNames: [] };
    await setDoc(doc(db, 'subjectEnrollments', `${subjectId}_${cls.id}`), {
      institutionId: institutionId ?? '',
      subjectId,
      subjectName,
      classId: cls.id,
      className: cls.name,
      enrollmentType: enrollment.type,
      excludedStudentIds: enrollment.excludedIds,
      excludedStudentNames: enrollment.excludedNames,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid ?? '',
    });
  }
}

// In onSubmit, for create:
const docRef = await addDoc(collection(db, 'subjects'), { ...payload, createdAt: serverTimestamp(), createdBy: user?.uid ?? '' });
await writeEnrollments(docRef.id, formData.name);

// In onSubmit, for update:
await updateDoc(doc(db, 'subjects', id), payload);
await writeEnrollments(id, formData.name);
```

**`subjectEnrollments` document schema summary:**

| Field | Type | Notes |
| --- | --- | --- |
| `institutionId` | `string` | Copied from subject |
| `subjectId` | `string` | Parent subject ID |
| `subjectName` | `string` | Denormalized at save time |
| `classId` | `string` | The class this doc covers |
| `className` | `string` | Denormalized at save time |
| `enrollmentType` | `'all' \| 'selective'` | `'all'` = entire class; `'selective'` = class minus exclusions |
| `excludedStudentIds` | `string[]` | Empty when `enrollmentType === 'all'` |
| `excludedStudentNames` | `string[]` | Parallel array to `excludedStudentIds`; denormalized for display |
| `updatedAt` | `Timestamp` | Server timestamp on every save |
| `updatedBy` | `string` | UID of the saving user |

**Doc ID:** `{subjectId}_{classId}` — deterministic, one doc per subject-class pair.

---

### 4.5 P2-4 — Create `subjectAttendance` Collection (Firebase Console, hold)

**Hold:** Do not deploy the `subjectAttendance` Firestore rules (§6.6) until Step P2-5 ships. Creating the collection ahead of time is fine; deploying rules before the page exists adds untested surface area with no benefit.

**Firebase Console steps (do before P2-5):**

1. Add a `subjectAttendance` collection with a placeholder document, then delete the placeholder.
2. Create a composite index:
   - **Collection:** `subjectAttendance`
   - **Fields (all Ascending):** `institutionId ASC · subjectId ASC · classId ASC · sessionDate ASC`

**Deploy §7.6 rules at the same time P2-5 ships.** Update `firebase-rules.md` after deploying.

**`subjectAttendance` document schema:**

| Field | Type | Notes |
| --- | --- | --- |
| `institutionId` | `string` | |
| `subjectId` | `string` | Parent subject |
| `subjectName` | `string` | Denormalized at save time |
| `classId` | `string` | The class this session covers |
| `className` | `string` | Denormalized at save time |
| `sessionDate` | `string` | ISO `"YYYY-MM-DD"` — one doc per subject + class + date |
| `teacherId` | `string` | UID of the submitting teacher |
| `termId` | `string` | Active term ID at save time |
| `academicYearId` | `string` | Active year ID at save time |
| `records` | `Record<studentId, { state, studentName, reason? }>` | Same shape as `GeneralAttendanceDocument.records` |
| `submittedBy` | `string` | UID of last saver |
| `submittedAt` | `Timestamp` | |
| `createdAt` | `Timestamp` | Set on first save only |
| `updatedAt` | `Timestamp` | Updated on every save |

One document per `subjectId + classId + sessionDate`. There is no AM/PM split — each session day has exactly one record.

---

### 4.6 P2-5 — Subject Attendance Register Page

**File:** `src/scenes/(dashboard)/attendance/subject/index.tsx`

This step replaces the Phase 1 placeholder entirely.

**New utility function** — add to `src/lib/attendanceCalendar.ts`:

```typescript
/**
 * Returns true if the given date falls in a fortnightly session week
 * for a subject. Week index is computed relative to term start date.
 * offset 0 = meets in weeks 0,2,4… (first week of term and every other);
 * offset 1 = meets in weeks 1,3,5…
 */
export function isFortnightlySessionDay(
  dateStr: string,
  termStartDate: string,
  offset: 0 | 1,
): boolean {
  const termStart = new Date(termStartDate + 'T12:00:00Z');
  const day = new Date(dateStr + 'T12:00:00Z');
  const weekIndex = Math.floor(
    (day.getTime() - termStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return weekIndex >= 0 && weekIndex % 2 === offset;
}
```

**Column visibility logic** — determines whether a given date shows an active register column:

```typescript
function isSubjectSessionDay(
  dateStr: string,
  subject: SubjectDocument,
  termStartDate: string,
  schoolWeekDays: number[],
  nonSchoolDays: NonSchoolDayDocument[],
): boolean {
  // Must be a school day (not a weekend or non-school day)
  if (!isSchoolDay(dateStr, schoolWeekDays, nonSchoolDays)) return false;
  // Must be one of the subject's configured session days
  const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  if (!(subject.sessionDayOfWeek ?? []).includes(dayOfWeek)) return false;
  // For fortnightly, check which week cycle we're in
  if (subject.frequency === 'fortnightly') {
    return isFortnightlySessionDay(dateStr, termStartDate, subject.fortnightlyOffset ?? 0);
  }
  // 'daily' and 'weekly': any matching school-week day is a session day
  return true;
}
```

**Page structure:**

```text
SubjectAttendanceRegisterPage
│
├── useAuth() — role, institutionId, user.uid
├── useInstitutionAcademicCalendar() — activeTerm, activeYear, nonSchoolDays
│
├── Gate: loading → spinner
├── Gate: !activeYear || !activeTerm → "No active term configured" state
│
├── Subject selector
│   regular_teacher: query subjects where institutionId == id
│                    AND teacherIds array-contains user.uid
│   institution_admin / super_admin: query all subjects for institution
│
├── Class selector (only when subject.classScope === 'class' AND classIds.length > 1)
│   Auto-select when only one class; hidden for classScope === 'institution'
│   (admin manually picks class from a dropdown of all institution classes)
│
├── Enrolled students (derived from subjectEnrollments/{subjectId}_{classId})
│   1. Fetch all users where role == 'student' AND classId == selectedClassId
│   2. Fetch subjectEnrollments/{subjectId}_{classId}
│   3. If enrollmentType === 'selective', filter out excludedStudentIds
│   4. Sort remaining students by surname
│
├── Week navigator
│   ← disabled at activeTerm.startDate
│   → disabled at current week
│
├── Weekly grid
│   Columns: only dates where isSubjectSessionDay() === true
│   Non-qualifying dates: no column rendered (unlike General Register where every Mon–Fri appears)
│   For each qualifying date: one session column (no AM/PM split)
│   Future dates: disabled cells
│   Overdue indicator: date is in sessionDayOfWeek, past 15:00 JST, no saved doc
│
├── Two-step save flow (identical pattern to GeneralAttendanceRegisterPage)
│   First click: if any enrolled students have no state → show snackbar warning
│   Second click: open confirmation dialog → on confirm, setDoc to subjectAttendance
│
├── Draft key pattern: attendance_draft_subject_{institutionId}_{subjectId}_{classId}_{YYYY-MM-DD}
│   One draft entry per session date (not per session; there is no AM/PM)
│
└── "Export PDF" button → defer until after core page is stable
```

**Firestore query for existing saves:**

```typescript
query(
  collection(db, 'subjectAttendance'),
  where('institutionId', '==', institutionId),
  where('subjectId', '==', selectedSubjectId),
  where('classId', '==', selectedClassId),
  where('sessionDate', '>=', weekStartISO),
  where('sessionDate', '<=', weekEndISO),
)
```

**Save payload:**

```typescript
await setDoc(doc(collection(db, 'subjectAttendance')), {
  institutionId,
  subjectId: selectedSubjectId,
  subjectName: selectedSubject.name,
  classId: selectedClassId,
  className: selectedClassName,
  sessionDate: dateISO,
  teacherId: user.uid,
  termId: activeTerm.id,
  academicYearId: activeYear.id,
  records: Object.fromEntries(
    enrolledStudents.map((s) => [
      s.uid,
      { state: draft[dateISO][s.uid] ?? 'P', studentName: s.name },
    ])
  ),
  submittedBy: user.uid,
  submittedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  // createdAt only on first save:
  ...(isNew ? { createdAt: serverTimestamp() } : {}),
});
```

Use `setDoc` with `{ merge: false }` (the default) to fully overwrite each session doc on save, consistent with how `GeneralAttendanceRegisterPage` handles updates.

**Overdue detection** (for the column header chip):

```typescript
function isOverdue(dateStr: string): boolean {
  const today = toISO(new Date());
  if (dateStr > today) return false;
  if (dateStr < today) return !savedDates.has(dateStr); // past day, no doc
  // Today: check if past 15:00 JST
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
  return nowJST.getUTCHours() >= 15 && !savedDates.has(dateStr);
}
```

`savedDates` is a `Set<string>` derived from the fetched `subjectAttendance` docs for the current week.

---

### 4.7 P2-6 — Tabs in MyAttendancePage and ChildAttendancePage

**Files:**

- `src/scenes/(dashboard)/attendance/my/index.tsx`
- `src/scenes/(dashboard)/attendance/child/index.tsx`

Both pages gain a two-tab layout. Tab 1 is the existing General Attendance view (unchanged). Tab 2 shows real Subject Attendance data — not a placeholder.

**Tab state:**

```typescript
const [activeTab, setActiveTab] = useState<'general' | 'subject'>('general');
```

**Tab header UI** (same pattern for both pages):

```tsx
<div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
  {(['general', 'subject'] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        activeTab === tab
          ? 'border-b-2 border-sky-500 text-sky-600 dark:text-sky-400'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {tab === 'general' ? 'General Attendance' : 'Subject Attendance'}
    </button>
  ))}
</div>
```

**Subject Attendance tab — data fetch** (for `MyAttendancePage`; `ChildAttendancePage` uses the selected child's UID and classId instead of `user.uid`):

1. Query `subjectEnrollments` where `institutionId == id`:
   - Filter client-side to docs where `student.uid` is **not** in `excludedStudentIds` and either `enrollmentType === 'all'` or `enrollmentType === 'selective'` with the student not excluded
   - This gives all subjects the student is enrolled in, across all their classes

2. For each enrollment doc, fetch `subjectAttendance` where `subjectId == doc.subjectId AND classId == doc.classId AND sessionDate >= activeTerm.startDate AND sessionDate <= today`

3. Render a collapsible accordion per subject:
   - Header: subject name + class name + attendance totals (e.g., "Present 14 / 18 sessions")
   - Body: date-state table with columns: Date · State · Reason (for E state)
   - Totals row using `computeAttendanceTotals()`

**Note:** There is no AM/PM split in subject attendance — each `sessionDate` record represents the entire session for that day.

---

### 4.8 P2-7 — Extend Institution Admin Overdue Badge

**File:** `src/scenes/(dashboard)/admin/index.tsx`

Extend the existing overdue count (which currently covers `generalAttendance` only) to also include `subjectAttendance`.

**Overdue definition for Subject Register:** A subject session is overdue when:

1. Today is one of the subject's `sessionDayOfWeek` days
2. For `frequency === 'fortnightly'`: `isFortnightlySessionDay(today, activeTerm.startDate, subject.fortnightlyOffset ?? 0)` returns `true`
3. Current time is past 15:00 JST
4. No `subjectAttendance` doc exists for `subjectId + classId + today`

**Implementation:**

```typescript
// Import the new utility
import { isFortnightlySessionDay } from '@/lib/attendanceCalendar';

// In the overdue detection effect, after the existing generalAttendance overdue count:
const today = toISO(new Date());
const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
const past15 = nowJST.getUTCHours() >= 15;

if (past15 && activeTerm) {
  const [subjectSnap, subjectAttSnap] = await Promise.all([
    getDocs(query(collection(db, 'subjects'), where('institutionId', '==', institutionId))),
    getDocs(
      query(
        collection(db, 'subjectAttendance'),
        where('institutionId', '==', institutionId),
        where('sessionDate', '==', today),
      )
    ),
  ]);

  const savedKeys = new Set(
    subjectAttSnap.docs.map((d) => `${d.data().subjectId as string}_${d.data().classId as string}`)
  );

  const todayDayOfWeek = new Date(today + 'T12:00:00Z').getUTCDay();

  for (const subjDoc of subjectSnap.docs) {
    const subj = { id: subjDoc.id, ...subjDoc.data() } as SubjectDocument & { id: string };
    // Check if today is a session day for this subject
    if (!(subj.sessionDayOfWeek ?? []).includes(todayDayOfWeek)) continue;
    if (subj.frequency === 'fortnightly') {
      if (!isFortnightlySessionDay(today, activeTerm.startDate, subj.fortnightlyOffset ?? 0)) continue;
    }
    // Check each relevant class
    const classes = subj.classScope === 'institution'
      ? allClasses.map((c) => c.id)
      : (subj.classIds ?? []);
    for (const classId of classes) {
      if (!savedKeys.has(`${subj.id}_${classId}`)) {
        subjectOverdueCount++;
      }
    }
  }

  setOverdueCount((prev) => prev + subjectOverdueCount);
}
```

`allClasses` is the existing class list already fetched for the institution. Display the combined overdue count using the existing chip UI — no separate chip for subject vs general is required unless the UI design is updated.

---

### 4.9 Phase 2 Files and Collections Reference

#### New files (Phase 2)

| File | Created in step |
| --- | --- |
| `src/lib/attendanceCalendar.ts` (extended) | Pre-C, P2-5 — add `isFortnightlySessionDay()` |

#### Modified files (Phase 2)

| File | Change | Step |
| --- | --- | --- |
| `src/lib/firebase.ts` | Add `'fortnightly'` to `frequency` union; add `fortnightlyOffset?: 0 \| 1` | Pre-B |
| `src/components/forms/SubjectForm.tsx` | Add fortnightly UI, `fortnightlyOffset` state, enrollment section, `writeEnrollments()` | Pre-C, P2-3 |
| `src/lib/attendanceCalendar.ts` | Add `isFortnightlySessionDay()` helper | P2-5 |
| `src/scenes/(dashboard)/attendance/subject/index.tsx` | Full implementation (replaces placeholder) | P2-5 |
| `src/scenes/(dashboard)/attendance/my/index.tsx` | Add tabs + Subject Attendance tab with real data | P2-6 |
| `src/scenes/(dashboard)/attendance/child/index.tsx` | Add tabs + Subject Attendance tab with real data | P2-6 |
| `src/scenes/(dashboard)/admin/index.tsx` | Extend overdue badge to include subject slots | P2-7 |

#### New Firestore collections (Phase 2)

| Collection | Doc ID pattern | Created in step |
| --- | --- | --- |
| `subjectEnrollments` | `{subjectId}_{classId}` | P2-2 |
| `subjectAttendance` | Auto-generated | P2-4 |

#### New Firestore indexes (Phase 2)

| Collection | Fields | Step |
| --- | --- | --- |
| `subjectAttendance` | `institutionId ASC · subjectId ASC · classId ASC · sessionDate ASC` | P2-4 |

#### Firebase Console rule deployments (Phase 2)

| Step | Action |
| --- | --- |
| Pre-A | Replace deployed `subjectEnrollments` rules — remove `studentId` check, use simple `sameInstitution` read |
| P2-4 (with P2-5) | Deploy `subjectAttendance` rules from §7.6 |

---

## 5. Phase 2 Implementation Status

> **Last updated:** 2026-06-12 (P2-7)

| Step | Description | Status |
| --- | --- | --- |
| Pre-A | Fix deployed `subjectEnrollments` Firestore rules — replace per-student model with per-class exclusion model; update `firebase-rules.md` to match | Done |
| Pre-B | Add `'fortnightly'` to `SubjectDocument.frequency` union; add `fortnightlyOffset?: 0 \| 1` to `src/lib/firebase.ts` | Done |
| Pre-C | Full fortnightly support in `SubjectForm.tsx` — Zod schema, `superRefine` validation, offset state, update-mode restore, frequency radio, day checkboxes, offset radio UI, `onSubmit` payload | Done |
| P2-2 | Create `subjectEnrollments` Firestore collection via placeholder document (Firebase Console) | Done |
| P2-3 | Add per-class enrollment UI to `SubjectForm`; write `subjectEnrollments/{subjectId}_{classId}` on save | Done |
| P2-4 | Create `subjectAttendance` Firestore collection + composite index (Firebase Console); deploy §7.6 rules at same time P2-5 ships | Done |
| P2-5 | Build `SubjectAttendanceRegisterPage` (replaces placeholder); add `isFortnightlySessionDay()` to `attendanceCalendar.ts`; deploy §7.6 rules | Done |
| P2-6 | Add two-tab layout to `MyAttendancePage` and `ChildAttendancePage` with real Subject Attendance data | Done |
| P2-7 | Extend institution_admin overdue badge in `admin/index.tsx` to include subject session overdue slots | Done |

### Completed step notes

**Pre-A** — The rules deployed during Phase 1 (P2-0c) referenced `resource.data.studentId`, which does not exist on per-class exclusion documents. This silently denied read access to students and parents. The corrected rules use a simple `sameInstitution` institution-scoped read. Deployed to Firebase Console by the user; `firebase-rules.md` updated in the same session.

**Pre-B / Pre-C** — Implemented in a single commit. `SubjectDocument.frequency` union extended to `'daily' | 'weekly' | 'fortnightly' | 'custom'`; `fortnightlyOffset?: 0 | 1` added. `SubjectForm.tsx` updated with Zod schema change, `superRefine` fortnightly day validation, `fortnightlyOffset` local state, update-mode restore, extended `handleFrequencyChange` signature, fortnightly radio button, day-checkbox and odd/even-week offset UI, and `fortnightlyOffset` in `onSubmit`.

**P2-2** — `subjectEnrollments` collection created manually via Firebase Console. Pre-A rules already deployed govern access. P2-3 can now write to this collection.

**P2-3** — `enrollmentByClass` and `classStudents` state added to `SubjectForm.tsx`. `loadStudentsForClass()` fetches students on demand when a class switches to selective. `writeEnrollments()` uses `setDoc` with deterministic `{subjectId}_{classId}` doc IDs. Update mode restores existing enrollment docs via a `getDocs` fetch on the `subjectEnrollments` collection filtered by `subjectId`. Enrollment UI renders per-class panels with "All students enrolled" checkbox; unchecking switches to selective mode and shows student checkboxes. `onSubmit` captures the `addDoc` return value for create mode and calls `writeEnrollments` for both create and update.

**P2-4** — `subjectAttendance` collection created via Firebase Console (placeholder document added then deleted). Composite index (`institutionId ASC · subjectId ASC · classId ASC · sessionDate ASC`) created and confirmed Enabled. §7.6 rules are held — they will be deployed together with P2-5. `MISCELLANEOUS_INFO.md` updated with collection schema and index entry for both `generalAttendance` and `subjectAttendance`.

**P2-5** — `isFortnightlySessionDay()` added to `src/lib/attendanceCalendar.ts`. `src/scenes/(dashboard)/attendance/subject/index.tsx` replaced with full implementation: subject selector (role-filtered for `regular_teacher`), class selector (auto-selects single-class subjects; dropdown for multi-class and institution-scoped), enrolled student derivation via `subjectEnrollments/{subjectId}_{classId}` + `users` query with selective exclusion applied, week navigator, sparse weekly grid (columns only on `isSubjectSessionDay()` dates), overdue chip per column (15:00 JST threshold), two-step save flow matching `GeneralAttendanceRegisterPage`, subject-scoped localStorage draft (`attendance_draft_subject_{institutionId}_{subjectId}_{classId}_{YYYY-MM-DD}`). §7.6 `subjectAttendance` rules added to `firebase-rules.md` — **user must deploy these rules to Firebase Console before the page is functional in production.**

**P2-6** — `subjectEnrollments` queried by `institutionId`, filtered client-side to matching `classId` and non-excluded student UID. For each eligible enrollment, `subjectAttendance` queried with the 4-field composite index (`institutionId + subjectId + classId + sessionDate range`). Results grouped per subject in a collapsible accordion: header shows subject/class name + "Present X / Y sessions"; body shows a date-state table + per-state totals chips using `computeAttendanceTotals()`. `ChildAttendancePage` resets accordion open-state on child selection change. Both pages now fetch subject data eagerly on mount (same deps as general attendance fetch).

**P2-7** — Existing overdue `useEffect` refactored from a `.then()` chain to an async IIFE. General attendance count computed first (all classes × AM/PM). If past 15:00 JST (UTC−5), a second `Promise.all` fetches all institution subjects and today's `subjectAttendance` docs; saved docs are indexed as `Set<subjectId_classId>`; for each subject whose `sessionDayOfWeek` includes today (and fortnightly condition passes), each relevant class is checked against the set. General + subject counts are summed into a single `setOverdueCount` call.

### Next step

All Phase 2 steps (P2-1 through P2-7) are now complete. No further implementation steps are outstanding in this plan.

---

## 6. Files Reference

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

## 7. Corrected Firestore Security Rules

**These rules replace the versions in `ATTENDANCE_REGISTER_SPEC.md` §9**, which used helper function names that do not exist in the deployed ruleset. All rules below use the actual deployed helpers (`isSignedIn`, `isAdmin`, `isAdminOrAbove`, `isSeniorTeacher`, `isParent`, `myRole`, `sameInstitution`, `writingToMyInstitution`).

Add each block to `firestore.rules` in the appropriate section.

### 7.1 `academicYears`

```javascript
match /academicYears/{yearId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create, update, delete: if isSignedIn()
    && isAdmin()
    && writingToMyInstitution();
}
```

### 7.2 `terms` (academic calendar additions)

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

### 7.3 `nonSchoolDays`

```javascript
match /nonSchoolDays/{dayId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create, update, delete: if isSignedIn()
    && isAdmin()
    && writingToMyInstitution();
}
```

### 7.4 `generalAttendance`

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

### 7.5 `subjectEnrollments` — Phase 2

```javascript
match /subjectEnrollments/{enrollId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create, update, delete: if isSignedIn()
    && isAdmin()
    && writingToMyInstitution();
}
```

### 7.6 `subjectAttendance` — Phase 2

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
