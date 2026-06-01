# Schedule Generation — Implementation Plan

> **Status:** Planning
> **Feature:** Timetable slot management and schedule viewing
> **Route:** `/schedule`
> **Primary role:** `institution_admin`
> **Branch:** `mvp`

---

## Overview

Schedule generation creates a structured weekly timetable for an institution's academic term. An `institution_admin` defines one or more **timetable slots** — each specifying a subject, an assigned teacher, the days of the week it runs, a start time, and a duration. Slots are scoped to a term, inheriting the term's start and end dates.

The feature has two parts:

1. **Management UI** (`institution_admin` and delegated `senior_teacher`) — create, edit, and delete timetable slots via a form; view all slots for a selected term.
2. **Read-only view** (all roles) — a timetable display for the selected term on the same `/schedule` page, filtered by the signed-in user's context.

Schedule data is **never pre-expanded into individual occurrence documents**. The timetable view computes occurrences at render time from the slot definition and the term's date range. This is the computed-view approach — it minimises Firestore reads and storage cost, with no cascading document cleanup required when a term is deleted or edited.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data storage | New `timetable_slots` collection | Separate from `classes` — schedule definition is a distinct operation from class record management; see §Option B rationale |
| Occurrence model | Computed at render time; no generated documents | Cheaper Firestore reads; no cascading deletes when a term changes |
| Timeline scope | Tied to a `terms` document | `terms` collection already exists; avoids duplicate date-range entry and keeps schedule scoped to the institution's academic periods |
| Primary access | `institution_admin` only | Per-user delegation to `senior_teacher` available; role-level delegation deferred |
| Viewing | All roles via `/schedule` page | BigCalendar dashboard wiring deferred to Phase 2 (see §Phase 2) |

### Why a standalone `/schedule` page, not extending `ClassForm`

`ClassForm` already captures subject, teacher, `termId`, and a `schedule` free-text field on the `classes` collection — it is doing the job of a timetable slot, just without structured schedule fields and without a management view.

The standalone-page approach was chosen because:

- **Separation of concerns** — class definition (what exists) and schedule definition (when it runs) are distinct operations. An admin may create class records before knowing their schedule.
- **Overview** — a dedicated page can show the full weekly timetable for the selected term with all subjects side by side, making conflicts visible. A per-record modal cannot.
- **Clean delegation surface** — `senior_teacher` access is granted to `/schedule` only, with slot creation scoped to their department. This does not touch class-record editing permissions.
- **Stability** — `ClassForm` field coverage is currently unclear (Issue #52). Coupling schedule generation to an unstable form adds risk.
- **Extensibility** — conflict detection, drag-and-drop timetable editing, and bulk term-copy operations are much easier to add on a dedicated page.

---

## Data Model

### `timetable_slots` collection

**Path:** `timetable_slots/{slotId}`

```
timetable_slots/{slotId}
  institutionId:  string                                          // for filtering and security rules
  termId:         string                                          // references terms/{termId}
  termName:       string                                          // denormalized for display
  subjectId:      string                                          // references subjects/{subjectId}
  subjectName:    string                                          // denormalized for display
  teacherId:      string                                          // references users/{uid} (teacher)
  teacherName:    string                                          // denormalized for display
  days:           ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[]      // days of week the slot runs
  startTime:      string                                          // "09:00" — 24-hour HH:mm
  duration:       number                                          // in minutes (e.g. 60, 90, 120)
  room:           string?                                         // optional room or location label
  createdBy:      string                                          // uid of creator
  createdByRole:  string                                          // role of creator at write time
  createdAt:      string                                          // ISO 8601
```

**Notes:**
- `subjectName`, `termName`, and `teacherName` are denormalized at write time so the timetable view requires no additional reads beyond the slot documents themselves.
- `days` is an array — a single slot can cover multiple days (e.g. `['mon', 'wed', 'fri']` for a subject that runs three times per week).
- `duration` is stored in minutes. Display logic converts to "1h", "1h 30m" etc.
- `room` is optional at MVP and can be made required at a later stage.

---

### `users` document — delegation flag

Add one optional field to `users/{uid}`:

```
users/{uid}
  ...existing fields...
  canGenerateSchedule:  boolean?   // absent or false by default; institution_admin sets to true on a senior_teacher's document
```

**Behaviour:**
- Field is absent (treated as `false`) by default — no effect on any role other than `senior_teacher`.
- When `true` on a `senior_teacher`'s document, that user gains create/edit/delete access to `timetable_slots` for their institution, scoped to their `departmentId`.
- `institution_admin` writes this field via the Manage Access panel on `/schedule` (see §Manage Access Panel).
- **Future extensibility (role-level delegation):** The permission check in application code is centralised in a single `canGenerateSchedule(role, user)` helper function. Expanding to role-level access later requires changing only that helper — no data model changes are needed.

---

## TypeScript Types

Add to `src/lib/firebase.ts`:

```ts
export type TimetableSlotDocument = {
  institutionId: string;
  termId: string;
  termName: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[];
  startTime: string;
  duration: number;
  room?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
};
```

Update the existing `UserDocument` type to include:

```ts
canGenerateSchedule?: boolean;
```

---

## Permission Model

### Role matrix

| Role | Create / Edit / Delete | View |
|---|---|---|
| `super_admin` | ✅ Yes (all institutions) | ✅ Yes |
| `institution_admin` | ✅ Yes (own institution) | ✅ Yes |
| `senior_teacher` with `canGenerateSchedule: true` | ✅ Yes (own institution, own department only) | ✅ Yes |
| `senior_teacher` without flag | ❌ No | ✅ Yes |
| `regular_teacher` | ❌ No | ✅ Yes |
| `student` | ❌ No | ✅ Yes |
| `parent` | ❌ No | ✅ Yes |

### `canGenerateSchedule` helper

Define in `src/lib/utils.ts` (or a new `src/lib/permissions.ts`):

```ts
import type { UserDocument } from './firebase';

export function canGenerateSchedule(role: string, user: UserDocument | null): boolean {
  if (role === 'super_admin' || role === 'institution_admin') return true;
  if (role === 'senior_teacher' && user?.canGenerateSchedule === true) return true;
  return false;
}
```

This is the **single place to change** when role-level access (future Option A) is added. Adding `|| role === 'senior_teacher'` to the second condition activates role-level access without any data model changes.

---

## Firestore Security Rules

### `timetable_slots`

```
match /timetable_slots/{slotId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId);

  allow create: if (isInstitutionAdmin() && sameInstitution(request.resource.data.institutionId))
    || (isSeniorTeacher()
        && sameInstitution(request.resource.data.institutionId)
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.canGenerateSchedule == true);

  allow update, delete: if (isInstitutionAdmin() && sameInstitution(resource.data.institutionId))
    || (isSeniorTeacher()
        && sameInstitution(resource.data.institutionId)
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.canGenerateSchedule == true);
}
```

> **Note on `get()` cost:** The `get()` call in the `senior_teacher` rule counts as one extra Firestore read per rule evaluation — the same trade-off documented for existing helper functions (Issue #46). Acceptable at MVP; mitigated at scale by promoting `canGenerateSchedule` to a Firebase Auth custom claim.

### `users` — `canGenerateSchedule` write rule

The existing `users` update rule permits `institution_admin` to update user documents within their institution (subject to `institutionNotChanged()`). Before publishing, verify against `firebase-rules.md` that this covers writing `canGenerateSchedule` to another user's document.

If field-level restrictions in the existing rule block it, add an explicit clause:

```
allow update: if isInstitutionAdmin()
  && sameInstitution(resource.data.institutionId)
  && institutionNotChanged()
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['canGenerateSchedule'])
  && resource.data.role == 'senior_teacher';
```

This allows `institution_admin` to toggle `canGenerateSchedule` on a `senior_teacher`'s document only — no other field changes are permitted by this clause.

---

## Form: `TimetableSlotForm.tsx`

**Location:** `src/components/forms/TimetableSlotForm.tsx`

### Fields and labels

| Field | Label | Input type | Notes |
|---|---|---|---|
| `termId` | **Term** | `<select>` | Populated from `terms` filtered by `institutionId`; selecting a term determines the date scope of the schedule |
| `subjectId` | **Subject** | `<select>` | Populated from `subjects` filtered by `institutionId` |
| `teacherId` | **Teacher** | `<select>` | Populated from `teachers` filtered by `institutionId`; when the creator is `senior_teacher`, filtered additionally by `departmentId` |
| `days` | **Days** | Checkbox group | Mon / Tue / Wed / Thu / Fri; at least one required |
| `startTime` | **Start Time** | `<input type="time">` | 24-hour; stored as `"HH:mm"` string |
| `duration` | **Duration (minutes)** | Number input | Stored in minutes; helper text shows the equivalent in hours (e.g. "90 = 1h 30m") |
| `room` | **Room** *(optional)* | Text input | Free text; e.g. "Room 12", "Science Lab A" |

### Zod validation schema

```ts
const schema = z.object({
  termId:    z.string().min(1, 'Term is required'),
  subjectId: z.string().min(1, 'Subject is required'),
  teacherId: z.string().min(1, 'Teacher is required'),
  days:      z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri']))
              .min(1, 'Select at least one day'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  duration:  z.number({ invalid_type_error: 'Duration is required' })
              .min(15, 'Minimum duration is 15 minutes')
              .max(480, 'Maximum duration is 8 hours (480 minutes)'),
  room:      z.string().optional(),
});
```

### Firestore write on create

On submit, resolve the denormalized display names from the selected IDs, then write:

```ts
await addDoc(collection(db, 'timetable_slots'), {
  ...formData,
  subjectName,     // resolved from selected subject document
  termName,        // resolved from selected term document
  teacherName,     // resolved from selected teacher document
  institutionId,
  createdBy:     user.uid,
  createdByRole: role,
  createdAt:     new Date().toISOString(),
});
```

Display names should be resolved from the already-fetched dropdown data in component state — no extra Firestore reads required at submit time.

---

## `/schedule` Page

**Location:** `src/scenes/(dashboard)/schedule/index.tsx`
**Route:** `/schedule`
**Guard:** `Protected` (signed-in users only; all roles admitted to the route)

### Page sections

**Header row**
- Page title "Schedule"
- Term selector dropdown (all terms for the institution, sorted newest first; pre-selects the most recent term)
- "Add Slot" button — visible only when `canGenerateSchedule(role, user)` is `true`

**Manage Access panel** — collapsible; visible to `institution_admin` only. Appears directly below the header row. See §Manage Access Panel.

**Timetable display** — all `timetable_slots` for the selected term, grouped by day of week. Each slot card shows: subject name, teacher name, start time, duration (formatted), and room if set. Edit and Delete actions appear on each card when `canGenerateSchedule(role, user)` is `true`.

### Data queries

```ts
// 1. Fetch terms for the term selector (one-time on mount)
getDocs(query(
  collection(db, 'terms'),
  where('institutionId', '==', institutionId),
  orderBy('startDate', 'desc')
))

// 2. Subscribe to slots for the selected term (re-runs when selectedTermId changes)
onSnapshot(
  query(
    collection(db, 'timetable_slots'),
    where('institutionId', '==', institutionId),
    where('termId', '==', selectedTermId)
  ),
  (snap) => setSlots(snap.docs.map(d => ({ id: d.id, ...d.data() as TimetableSlotDocument })))
)

// 3. Fetch senior teachers for Manage Access panel (institution_admin only, one-time on mount)
getDocs(query(
  collection(db, 'users'),
  where('institutionId', '==', institutionId),
  where('role', '==', 'senior_teacher')
))
```

### Timetable display logic

Group the `slots` array by day, ordering days Mon → Fri. Render each day as a column or labelled section. Within each day, sort slots by `startTime` ascending.

```ts
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday',
};

const slotsByDay = DAY_ORDER.reduce((acc, day) => {
  acc[day] = slots
    .filter(s => s.days.includes(day))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return acc;
}, {} as Record<string, (TimetableSlotDocument & { id: string })[]>);
```

---

## Manage Access Panel

Visible to `institution_admin` only. Collapsible section on the `/schedule` page.

**Contents:**
- Heading: "Delegate Schedule Access"
- Short description: "Grant selected senior teachers the ability to create and edit timetable slots."
- List of all `senior_teacher` users in the institution: name, email, and a toggle switch showing current `canGenerateSchedule` value.
- On toggle: `updateDoc(doc(db, 'users', teacherUid), { canGenerateSchedule: !current })`

**Feedback:** Show an inline confirmation ("Access granted" / "Access revoked") on successful write; show an error message on failure.

This is the only UI surface for delegation. No separate permissions page is required at this stage.

---

## `FormModal` Registry

Add `TimetableSlotForm` to the lazy-import map in `src/components/FormModal.tsx`, following the existing pattern for all other form entries.

---

## Route & Navigation

### `App.tsx`

Register the route inside the dashboard layout, accessible to all authenticated roles:

```tsx
<Route path="/schedule" element={<SchedulePage />} />
```

No role restriction at the route level — the page renders a management UI or a read-only view based on `canGenerateSchedule(role, user)` evaluated inside the component.

### `Menu.tsx`

Add a "Schedule" entry to `menuItems`, visible to all roles. Place it in the list-pages group alongside Teachers, Students, etc.

```ts
{ icon: "/calendar.png", label: "Schedule", href: "/schedule" }
```

Use an existing calendar or timetable icon from `public/` — no new asset required.

---

## Implementation Order

| # | Task | Notes |
|---|---|---|
| 1 | Add `TimetableSlotDocument` type to `firebase.ts`; add `canGenerateSchedule?: boolean` to `UserDocument` | |
| 2 | Add `canGenerateSchedule` helper to `utils.ts` (or new `permissions.ts`) | Single extension point for future role-level delegation |
| 3 | Verify `users` update rule in `firebase-rules.md`; publish `timetable_slots` security rules to Firebase Console | Check whether existing `isAdminOrAbove()` update clause already covers `canGenerateSchedule` writes |
| 4 | Build `TimetableSlotForm.tsx` | Zod schema; live dropdowns for term, subject, teacher; days checkboxes; time + duration inputs; optional room field |
| 5 | Register `TimetableSlotForm` in `FormModal.tsx` | |
| 6 | Build `SchedulePage` — management view | `onSnapshot` subscription; slot list grouped by day; Add / Edit / Delete via `FormModal` |
| 7 | Build `SchedulePage` — read-only view | Same timetable display; management controls hidden based on `canGenerateSchedule` |
| 8 | Build Manage Access panel | Senior teacher list with `canGenerateSchedule` toggle; `institution_admin` only |
| 9 | Register `/schedule` route in `App.tsx` | |
| 10 | Add "Schedule" menu item in `Menu.tsx` | All roles |

---

## Phase 2 — BigCalendar Integration (Deferred)

Once `timetable_slots` is live and populated, the existing `BigCalendar` components on teacher, student, and parent dashboards can be updated to display real schedule data. This resolves Issue #1 (hardcoded August 2024 calendar dates) as a side effect.

### What Phase 2 requires

**1. Active term resolution**

A helper that queries `terms` for the institution and returns the document where `startDate <= today <= endDate`. If no active term exists, return `null` and render an empty calendar.

```ts
async function getActiveTerm(institutionId: string): Promise<TermDocument | null> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const snap = await getDocs(query(
    collection(db, 'terms'),
    where('institutionId', '==', institutionId),
    where('startDate', '<=', today),
    orderBy('startDate', 'desc'),
    limit(1)
  ));
  if (snap.empty) return null;
  const term = snap.docs[0].data() as TermDocument;
  return term.endDate >= today ? term : null;
}
```

> **Dependency:** Requires `TermDocument` to have `startDate` and `endDate` as `"YYYY-MM-DD"` strings. Verify `TermForm` and `TermDocument` type before starting Phase 2 (see Issues to Track, S-5).

**2. Role-scoped slot queries**

| Role | Slot filter |
|---|---|
| `institution_admin` / `super_admin` | All slots for the institution's active term |
| `senior_teacher` | All slots where `teacherId == user.uid` **or** slots for subjects in their department |
| `regular_teacher` | Slots where `teacherId == user.uid` |
| `student` | Slots for the student's enrolled classes (requires `enrolledStudentIds[]` to be populated — depends on Issue #52) |
| `parent` | Same as student, for each linked child |

**3. Occurrence expansion**

For each slot, compute the individual `{ title, start, end }` event objects for every matching weekday within the term date range:

```ts
function expandSlotToEvents(
  slot: TimetableSlotDocument & { id: string },
  term: { startDate: string; endDate: string }
): { title: string; start: Date; end: Date }[] {
  const events: { title: string; start: Date; end: Date }[] = [];
  const cursor = new Date(term.startDate + 'T00:00:00');
  const termEnd = new Date(term.endDate + 'T23:59:59');
  const dayMap: Record<number, string> = {
    0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
  };
  while (cursor <= termEnd) {
    const dayKey = dayMap[cursor.getDay()];
    if (slot.days.includes(dayKey as typeof slot.days[number])) {
      const [h, m] = slot.startTime.split(':').map(Number);
      const start = new Date(cursor);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + slot.duration * 60_000);
      events.push({ title: slot.subjectName, start, end });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return events;
}
```

**4. BigCalendar component updates**

Each role's calendar component (teacher, student, parent pages) switches from mock data to the computed events array when `DATA_MODE === 'live'`. The switch follows the same `USE_MOCK` branching pattern already used throughout the app.

---

## Issues to Track

Add the following to `ISSUES_AND_GAPS.md` when this feature is started. Assign issue numbers sequentially from the current last entry (#53).

| Slug | Title | Notes |
|---|---|---|
| S-1 | `TimetableSlotForm` dropdowns — live query only | In mock mode, fall back to `subjectsData`, `termsData`, `teachersData` from `data.ts`. Same pattern as Issue #48 (ClassForm supervisor field). |
| S-2 | No conflict detection on timetable slots | System does not warn when the same teacher is scheduled in two overlapping slots on the same day. Deferred post-MVP. |
| S-3 | Phase 2 — BigCalendar integration | Wire `timetable_slots` data into existing BigCalendar components on teacher, student, and parent dashboards; resolves Issue #1 as a side effect. Depends on active-term resolution and role-scoped queries. |
| S-4 | Role-level delegation (Option A) | Future: grant schedule-generation access to all `senior_teacher` users by role rather than per-user flag. Implement by updating `canGenerateSchedule` helper only — no data model changes required. |
| S-5 | `TermDocument` `startDate`/`endDate` field verification | Phase 2 occurrence expansion requires `startDate` and `endDate` as `"YYYY-MM-DD"` strings on term documents. Verify `TermForm` writes these fields and `TermDocument` type declares them before starting Phase 2. |
