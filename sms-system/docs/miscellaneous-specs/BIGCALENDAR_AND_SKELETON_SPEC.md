# BigCalendar Firestore Wiring & Skeleton Shimmer — Implementation Spec

> Issue #4 (Option B) and Issue #10 from `ISSUES_AND_GAPS.md`.  
> Written: 2026-06-15. Do NOT push (`git push`) any commits produced by this work.

---

## Part 1 — Issue #4: Wire BigCalendar to Firestore timetable_slots

### 1.1 Goal

Replace the hardcoded `calendarEvents` import in `BigCalender.tsx` with live Firestore data from the
`timetable_slots` collection. The calendar must show the current work-week schedule for the signed-in
user's role:

| Role | Schedule shown |
|---|---|
| `regular_teacher`, `senior_teacher` | Slots where `teacherId == user.uid` |
| `student` | Slots where `classId == authContext.classId` |
| `parent` | Child-picker → then slots where `classId == selectedChild.classId` |
| Teacher detail page (`/list/teachers/:id`) | Slots where `teacherId == routeParam.id` |

Mock mode must continue to display representative data (date-shifted to the current work-week).

---

### 1.2 Files changed

| File | Change type |
|---|---|
| `src/lib/firebase.ts` | Add `classId`, `className` fields to `TimetableSlotDocument` |
| `src/components/forms/TimetableSlotForm.tsx` | Add class dropdown; write `classId`/`className` to Firestore |
| `src/components/BigCalender.tsx` | Full rewrite — stateful, role-aware, Firestore queries |
| `src/scenes/(dashboard)/list/teachers/[id]/index.tsx` | Pass `teacherIdOverride={id}` prop to `<BigCalendar>` |

No Firebase Security Rule changes. No new Firestore composite indexes.

---

### 1.3 Firebase Security Rules — confirmed no changes

Current read rule for `timetable_slots`:

```javascript
match /timetable_slots/{slotId} {
  allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
  ...
}
```

All five roles (teacher, student, parent, institution_admin, super_admin) can read all slots for
their institution without restriction. No new rule is needed to support student or parent queries.

Composite index note: the planned queries use only equality (`where`) filters with no `orderBy`, so
Firestore does NOT require composite indexes for any combination of `institutionId + teacherId`,
`institutionId + classId`, or adding `termId` as a third equality filter.

---

### 1.4 Firestore schema: `timetable_slots`

#### Current shape (from `firebase.ts` line 276 + `TimetableSlotForm.tsx`)

```typescript
// Current TimetableSlotDocument (firebase.ts line 276)
{
  institutionId:  string;
  termId:         string;
  termName:       string;       // denormalized label
  subjectId:      string;
  subjectName:    string;       // denormalized label
  teacherId:      string;       // === Firebase Auth UID
  teacherName:    string;       // denormalized label
  days:           ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[];
  startTime:      string;       // 'HH:MM' wall-clock
  duration:       number;       // minutes
  room?:          string;
  createdBy:      string;
  createdByRole:  string;
  createdAt:      Timestamp | string;
}
```

#### Required addition

```typescript
classId:    string;   // Firebase doc ID of the assigned class
className:  string;   // denormalized label, e.g. "Grade 5A"
```

#### Updated `TimetableSlotDocument` (full)

```typescript
export type TimetableSlotDocument = {
  institutionId:  string;
  termId:         string;
  termName:       string;
  subjectId:      string;
  subjectName:    string;
  teacherId:      string;
  teacherName:    string;
  classId:        string;       // ← NEW
  className:      string;       // ← NEW (denormalized label)
  days:           ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[];
  startTime:      string;
  duration:       number;
  room?:          string;
  createdBy:      string;
  createdByRole:  string;
  createdAt:      Timestamp | string;
};
```

#### Existing data migration

Any `timetable_slots` documents already in Firestore will NOT have `classId`. They will be invisible
to student and parent queries. Options:

1. Re-enter the slots through the updated form (small data set — recommended for dev environment).
2. Run a one-time migration script that sets a known `classId` on existing documents.

This spec does not prescribe migration; the implementer should choose based on how much existing
test data must be preserved.

---

### 1.5 `TimetableSlotForm.tsx` changes

#### Zod schema — add `classId`

```typescript
const schema = z.object({
  termId:    z.string().min(1, 'Term is required'),
  subjectId: z.string().min(1, 'Subject is required'),
  teacherId: z.string().min(1, 'Teacher is required'),
  classId:   z.string().min(1, 'Class is required'),   // ← ADD
  days:      z.array(z.enum(DAY_KEYS)).min(1, 'Select at least one day'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  duration:  z.coerce
              .number()
              .min(15, 'Minimum duration is 15 minutes')
              .max(480, 'Maximum duration is 8 hours (480 minutes)'),
  room:      z.string().optional(),
});
```

#### State — add `classes`

```typescript
const [classes, setClasses] = useState<DropdownItem[]>([]);
```

#### Dropdown population — extend the existing `useEffect`

Inside the `DATA_MODE === 'live'` branch, add after the existing `getDocs` calls:

```typescript
getDocs(query(
  collection(db, 'classes'),
  where('institutionId', '==', institutionId),
)).then(snap =>
  setClasses(snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? '') })))
);
```

Inside the `else` (mock/blank) branch, add:

```typescript
import { classesData } from '@/lib/data';
// Inside else branch:
setClasses(classesData.map(c => ({ id: String(c.id), name: c.name })));
```

#### Class dropdown JSX — insert after the Teacher dropdown block

```tsx
{/* Class */}
<div className="flex flex-col gap-2 w-full md:w-1/4">
  <label className="text-xs text-gray-500 dark:text-gray-300">Class</label>
  <select
    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
    {...register('classId')}
    defaultValue={data?.classId as string | undefined}
  >
    <option value="">Select a class</option>
    {classes.map(c => (
      <option key={c.id} value={c.id}>{c.name}</option>
    ))}
  </select>
  {errors.classId?.message && (
    <p className="text-xs text-red-400">{errors.classId.message}</p>
  )}
</div>
```

#### `addDoc` payload — add `classId` and `className`

```typescript
const className = classes.find(c => c.id === formData.classId)?.name ?? '';

await addDoc(collection(db, 'timetable_slots'), {
  ...formData,
  termName,
  subjectName,
  teacherName,
  className,      // ← ADD
  institutionId,
  createdBy:     user?.uid ?? '',
  createdByRole: role ?? '',
  createdAt:     serverTimestamp(),
});
```

#### `updateDoc` payload — add `classId` and `className`

```typescript
const className = classes.find(c => c.id === formData.classId)?.name ?? '';

await updateDoc(doc(db, 'timetable_slots', id), {
  termId: formData.termId,
  termName,
  subjectId: formData.subjectId,
  subjectName,
  teacherId: formData.teacherId,
  teacherName,
  classId:   formData.classId,   // ← ADD
  className,                     // ← ADD
  days:      formData.days,
  startTime: formData.startTime,
  duration:  formData.duration,
  room:      formData.room,
});
```

#### Conflict detection — no change required

The existing conflict detection (teacher double-booking on same day/time) is unchanged. Class-level
conflict detection (two subjects sharing a class at the same time) is out of scope.

---

### 1.6 `BigCalender.tsx` — full rewrite

The current component is 35 lines, stateless, no props. The replacement is stateful, role-aware,
and Firestore-connected.

#### 1.6.1 Mock mode strategy

`_calendarEvents` in `data.ts` contains 25 events hardcoded to the week of Mon 12 Aug 2024. In work_week
view, react-big-calendar only shows the current week, so those 2024 events are invisible in live mode
and invisible in mock mode if the user is viewing the current week.

Fix: export a helper from `data.ts` (or inline it in BigCalender) that shifts the mock events to the
current work-week at render time:

```typescript
// Added to BigCalender.tsx (not to data.ts to avoid polluting it)
function shiftEventsToCurrentWeek(
  events: { title: string; start: Date; end: Date }[],
): { title: string; start: Date; end: Date }[] {
  if (events.length === 0) return [];
  // All mock events fall on Aug 12–16 2024 (Mon–Fri).
  // Determine offset: current Mon date − Aug 12 2024 (Mon).
  const anchor = new Date(2024, 7, 12); // Mon 12 Aug 2024
  const today  = new Date();
  const dow    = today.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const currentMon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMon);
  const msOffset = currentMon.getTime() - anchor.getTime();
  return events.map(e => ({
    ...e,
    start: new Date(e.start.getTime() + msOffset),
    end:   new Date(e.end.getTime()   + msOffset),
  }));
}
```

#### 1.6.2 Date transformation — slots → Calendar events

`react-big-calendar` needs `{ title, start: Date, end: Date }`. Slots store recurring weekly
patterns (`days[]` + `startTime: 'HH:MM'` + `duration: minutes`).

```typescript
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

const DAY_ORDER: Record<DayKey, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4,
};

// Returns ISO date strings for Mon–Fri of the current calendar week (local time).
function getCurrentWeekDays(): Date[] {
  const today  = new Date();
  const dow    = today.getDay(); // 0=Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMon);
  return Array.from({ length: 5 }, (_, i) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

function slotsToEvents(
  slots: (TimetableSlotDocument & { id: string })[],
): { title: string; start: Date; end: Date }[] {
  const weekDays = getCurrentWeekDays(); // [Mon, Tue, Wed, Thu, Fri]
  return slots.flatMap(slot =>
    slot.days.map(day => {
      const base = weekDays[DAY_ORDER[day]];
      const [h, m] = slot.startTime.split(':').map(Number);
      const start  = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
      const end    = new Date(start.getTime() + slot.duration * 60_000);
      return {
        title: slot.room
          ? `${slot.subjectName} (${slot.room})`
          : slot.subjectName,
        start,
        end,
      };
    }),
  );
}
```

Note: `new Date(year, month, date, h, m)` uses local time, which is correct for a school timetable.

#### 1.6.3 Parent child-picker pattern

Matches the pattern in `src/scenes/(dashboard)/attendance/child/index.tsx`:

```typescript
type ChildOption = { uid: string; name: string; classId: string | null };

// Inside BigCalendar (parent branch):
const [children, setChildren]     = useState<ChildOption[]>([]);
const [selectedChild, setSelectedChild] = useState<ChildOption | null>(null);
const [childrenLoading, setChildrenLoading] = useState(true);

useEffect(() => {
  if (!user || role !== 'parent') return;
  getDocs(query(collection(db, 'student_parents'), where('parentId', '==', user.uid)))
    .then(async linkSnap => {
      const studentIds = linkSnap.docs.map(d => d.data().studentId as string);
      if (studentIds.length === 0) { setChildrenLoading(false); return; }
      const userSnaps = await Promise.all(
        studentIds.map(sid =>
          getDocs(query(collection(db, 'users'), where('__name__', '==', sid)))
        )
      );
      const opts: ChildOption[] = userSnaps
        .flatMap(snap => snap.docs)
        .map(d => ({
          uid:     d.id,
          name:    (d.data().name as string) ?? d.id,
          classId: (d.data().classId as string) ?? null,
        }));
      setChildren(opts);
      setSelectedChild(opts[0] ?? null); // auto-select first child
      setChildrenLoading(false);
    })
    .catch(() => setChildrenLoading(false));
}, [user, role]);
```

Child-picker UI (rendered only when `children.length > 1`):

```tsx
{role === 'parent' && children.length > 1 && (
  <div className="flex gap-2 flex-wrap mb-2">
    {children.map(child => (
      <button
        key={child.uid}
        onClick={() => setSelectedChild(child)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          selectedChild?.uid === child.uid
            ? 'bg-lamaSky text-sky-900'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
        }`}
      >
        {child.name}
      </button>
    ))}
  </div>
)}
```

#### 1.6.4 Slot query per role

```typescript
// Teacher (dashboard or override from detail page)
const effectiveTeacherId = teacherIdOverride ?? (
  (role === 'regular_teacher' || role === 'senior_teacher') ? user?.uid : null
);

// Student
const effectiveClassId = role === 'student'
  ? authClassId               // from AuthContext
  : role === 'parent'
    ? selectedChild?.classId  // from child-picker
    : null;

// The query runs when activeTerm is known and the appropriate ID is available
useEffect(() => {
  if (USE_MOCK || !institutionId || !activeTerm) return;

  let q;
  if (effectiveTeacherId) {
    q = query(
      collection(db, 'timetable_slots'),
      where('institutionId', '==', institutionId),
      where('teacherId', '==', effectiveTeacherId),
      where('termId', '==', activeTerm.id),
    );
  } else if (effectiveClassId) {
    q = query(
      collection(db, 'timetable_slots'),
      where('institutionId', '==', institutionId),
      where('classId', '==', effectiveClassId),
      where('termId', '==', activeTerm.id),
    );
  } else {
    return; // not enough info yet (parent still loading children, etc.)
  }

  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as TimetableSlotDocument),
    }));
    setEvents(slotsToEvents(docs));
  });
}, [institutionId, activeTerm, effectiveTeacherId, effectiveClassId]);
```

Note: `activeTerm` from `useInstitutionAcademicCalendar()` returns `null` when no term is active
(e.g., during school holidays). In that case the calendar shows no events — which is correct
behaviour. The hook returns `loading: true` during the initial fetch; the BigCalendar component
should suppress the query until `loading === false`.

#### 1.6.5 `activeTerm` from `useInstitutionAcademicCalendar`

The hook already used by `AttendanceChart.tsx`:

```typescript
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';

const { activeTerm, loading: calLoading } = useInstitutionAcademicCalendar();
```

In mock mode the hook immediately sets `loading = false` and returns `activeTerm = undefined` — the
mock event shift handles mock display independently.

#### 1.6.6 Complete rewritten `BigCalender.tsx`

```tsx
"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  collection, getDocs, onSnapshot, query, where,
} from 'firebase/firestore';
import { db, type TimetableSlotDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { USE_MOCK, calendarEvents } from '@/lib/data';

const localizer = momentLocalizer(moment);

type CalEvent = { title: string; start: Date; end: Date };
type DayKey   = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type ChildOption = { uid: string; name: string; classId: string | null };

const DAY_ORDER: Record<DayKey, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4,
};

function getCurrentWeekDays(): Date[] {
  const today   = new Date();
  const dow     = today.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday  = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() + diffToMon
  );
  return Array.from({ length: 5 }, (_, i) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

function slotsToEvents(
  slots: (TimetableSlotDocument & { id: string })[],
): CalEvent[] {
  const weekDays = getCurrentWeekDays();
  return slots.flatMap(slot =>
    slot.days.map(day => {
      const base   = weekDays[DAY_ORDER[day as DayKey]];
      const [h, m] = slot.startTime.split(':').map(Number);
      const start  = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
      const end    = new Date(start.getTime() + slot.duration * 60_000);
      return {
        title: slot.room ? `${slot.subjectName} (${slot.room})` : slot.subjectName,
        start,
        end,
      };
    }),
  );
}

function shiftEventsToCurrentWeek(events: CalEvent[]): CalEvent[] {
  if (events.length === 0) return [];
  const anchor      = new Date(2024, 7, 12); // Mon 12 Aug 2024 (anchor of mock data)
  const today       = new Date();
  const dow         = today.getDay();
  const diffToMon   = dow === 0 ? -6 : 1 - dow;
  const currentMon  = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() + diffToMon
  );
  const msOffset    = currentMon.getTime() - anchor.getTime();
  return events.map(e => ({
    ...e,
    start: new Date(e.start.getTime() + msOffset),
    end:   new Date(e.end.getTime()   + msOffset),
  }));
}

const BigCalendar = ({ teacherIdOverride }: { teacherIdOverride?: string }) => {
  const { user, role, institutionId, classId: authClassId } = useAuth();
  const { activeTerm, loading: calLoading } = useInstitutionAcademicCalendar();

  const [view, setView]       = useState<View>(Views.WORK_WEEK);
  const [events, setEvents]   = useState<CalEvent[]>([]);

  // Parent child-picker
  const [children, setChildren]           = useState<ChildOption[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildOption | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(
    !USE_MOCK && role === 'parent',
  );

  // Fan-out for parent role
  useEffect(() => {
    if (USE_MOCK || role !== 'parent' || !user) return;
    getDocs(query(
      collection(db, 'student_parents'),
      where('parentId', '==', user.uid),
    )).then(async linkSnap => {
      const studentIds = linkSnap.docs.map(d => d.data().studentId as string);
      if (studentIds.length === 0) { setChildrenLoading(false); return; }
      const snaps = await Promise.all(
        studentIds.map(sid =>
          getDocs(query(collection(db, 'users'), where('__name__', '==', sid)))
        ),
      );
      const opts: ChildOption[] = snaps
        .flatMap(s => s.docs)
        .map(d => ({
          uid:     d.id,
          name:    (d.data().name as string) ?? d.id,
          classId: (d.data().classId as string) ?? null,
        }));
      setChildren(opts);
      setSelectedChild(opts[0] ?? null);
      setChildrenLoading(false);
    }).catch(() => setChildrenLoading(false));
  }, [user, role]);

  // Slot query
  useEffect(() => {
    if (USE_MOCK || !institutionId || calLoading) return;

    const isTeacher = role === 'regular_teacher' || role === 'senior_teacher';
    const effectiveTeacherId = teacherIdOverride ?? (isTeacher ? user?.uid : null);
    const effectiveClassId   =
      role === 'student' ? authClassId
      : role === 'parent' ? selectedChild?.classId ?? null
      : null;

    if (!activeTerm) return; // no active term — calendar stays empty

    let q;
    if (effectiveTeacherId) {
      q = query(
        collection(db, 'timetable_slots'),
        where('institutionId', '==', institutionId),
        where('teacherId',     '==', effectiveTeacherId),
        where('termId',        '==', activeTerm.id),
      );
    } else if (effectiveClassId) {
      q = query(
        collection(db, 'timetable_slots'),
        where('institutionId', '==', institutionId),
        where('classId',       '==', effectiveClassId),
        where('termId',        '==', activeTerm.id),
      );
    } else {
      return;
    }

    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as TimetableSlotDocument),
      }));
      setEvents(slotsToEvents(docs));
    });
  }, [
    institutionId, calLoading, activeTerm,
    role, user, authClassId,
    teacherIdOverride, selectedChild,
  ]);

  const displayEvents = USE_MOCK
    ? shiftEventsToCurrentWeek(calendarEvents as CalEvent[])
    : events;

  return (
    <div className="h-full flex flex-col">
      {/* Child picker — parents with multiple children only */}
      {role === 'parent' && !childrenLoading && children.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {children.map(child => (
            <button
              key={child.uid}
              onClick={() => setSelectedChild(child)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedChild?.uid === child.uid
                  ? 'bg-lamaSky text-sky-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      <Calendar
        localizer={localizer}
        events={displayEvents}
        startAccessor="start"
        endAccessor="end"
        views={['work_week', 'day']}
        view={view}
        className="flex-1"
        onView={setView}
        min={new Date(2025, 1, 0, 8, 0, 0)}
        max={new Date(2025, 1, 0, 17, 0, 0)}
      />
    </div>
  );
};

export default BigCalendar;
```

---

### 1.7 Teacher detail page — call site update

`src/scenes/(dashboard)/list/teachers/[id]/index.tsx` line 181:

```tsx
// Before
<BigCalendar />

// After
<BigCalendar teacherIdOverride={id} />
```

`id` is already available from `useParams<{ id: string }>()` at the top of the component.

---

### 1.8 `calendarEvents` export in `data.ts` — no change needed

`calendarEvents` at line 1585 (`export const calendarEvents = USE_MOCK ? _calendarEvents : []`) is
already imported by BigCalendar for mock mode. The `shiftEventsToCurrentWeek` function handles the
date shift. No change to `data.ts` is needed.

---

### 1.9 Implementation order

1. Update `TimetableSlotDocument` in `firebase.ts` (add `classId`, `className`).
2. Update `TimetableSlotForm.tsx` (add class dropdown + write fields).
3. Rewrite `BigCalender.tsx`.
4. Update teacher detail page call site (`teacherIdOverride={id}`).
5. Verify TypeScript compiles clean (`npm run build` or `tsc --noEmit`).
6. Manually test:
   - Log in as a teacher → schedule shows for current term week.
   - Log in as a student → schedule shows for their class.
   - Log in as a parent with one child → schedule shows, no picker.
   - Log in as a parent with multiple children → picker appears; switching child changes schedule.
   - Visit `/list/teachers/:id` as admin → that teacher's schedule shows.
   - Switch to mock mode → current-week events appear in the calendar.
   - No active term (term dates don't cover today) → calendar shows empty gracefully.

---

---

## Part 2 — Issue #10: Skeleton shimmer loading states on all 15 list pages

### 2.1 Goal

All 15 list pages use `onSnapshot` with no loading state. Between mount and the first snapshot
callback there is a brief blank flash. Replace that blank with shimmer skeleton rows that match the
column layout. Only show the skeleton in live mode (`!USE_MOCK`).

---

### 2.2 Files changed

| File | Change |
|---|---|
| `src/components/Table.tsx` | Add `loading` + `rowCount` props; render skeleton tbody |
| `src/scenes/(dashboard)/list/students/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/teachers/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/parents/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/classes/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/subjects/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/departments/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/lessons/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/exams/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/assignments/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/events/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/announcements/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/results/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/feedback/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/terms/index.tsx` | Add loading state |
| `src/scenes/(dashboard)/list/houses/index.tsx` | Add loading state |

---

### 2.3 `Table.tsx` — updated component

#### Props added

```typescript
type TableProps<T> = {
  columns:   Column[];
  renderRow: (item: T) => React.ReactNode;
  data:      T[];
  loading?:  boolean;    // NEW — show skeleton rows instead of data
  rowCount?: number;     // NEW — number of skeleton rows (default 8)
};
```

#### Skeleton cell design

Two cell patterns:

**"Info" column** (accessor `'info'` — avatar circle + name + sub-label, used on students and
teachers pages):

```tsx
<td key={col.accessor} className={col.className}>
  <div className="flex items-center gap-4 p-4">
    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
    <div className="flex flex-col gap-1.5 flex-1">
      <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-3/4" />
      <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-1/2" />
    </div>
  </div>
</td>
```

**All other columns** (standard text cell):

```tsx
<td key={col.accessor} className={col.className}>
  <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-3/4 my-2 mx-2" />
</td>
```

#### Full updated `Table.tsx`

```tsx
type Column = {
  header:    string;
  accessor:  string;
  className?: string;
};

type TableProps<T> = {
  columns:   Column[];
  renderRow: (item: T) => React.ReactNode;
  data:      T[];
  loading?:  boolean;
  rowCount?: number;
};

const Table = <T,>({
  columns,
  renderRow,
  data,
  loading  = false,
  rowCount = 8,
}: TableProps<T>) => (
  <table className="w-full mt-4">
    <thead>
      <tr className="text-left text-gray-500 dark:text-gray-300 text-sm">
        {columns.map((col) => (
          <th key={col.accessor} className={col.className}>{col.header}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {loading ? (
        Array.from({ length: rowCount }).map((_, i) => (
          <tr
            key={i}
            className="border-b border-gray-200 dark:border-gray-700"
          >
            {columns.map((col) =>
              col.accessor === 'info' ? (
                <td key={col.accessor} className={col.className}>
                  <div className="flex items-center gap-4 p-4">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
                    <div className="flex flex-col gap-1.5 flex-1">
                      <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-3/4" />
                      <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-1/2" />
                    </div>
                  </div>
                </td>
              ) : (
                <td key={col.accessor} className={col.className}>
                  <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-3/4 my-2 mx-2" />
                </td>
              )
            )}
          </tr>
        ))
      ) : (
        data.map((item) => renderRow(item))
      )}
    </tbody>
  </table>
);

export default Table;
```

**Why `col.className` is applied to the skeleton `<td>`:** The column `className` values are
responsive visibility classes like `hidden md:table-cell`. Applying them to the skeleton cells means
the skeleton matches the same column layout the real rows use — no extra logic needed.

---

### 2.4 Per-page changes — uniform 3-line pattern

Every list page needs these three additions:

#### Step 1 — add import (if not already present)

```typescript
import { USE_MOCK } from '@/lib/data';
```

(Most pages already import `USE_MOCK`.)

#### Step 2 — add loading state

```typescript
const [loading, setLoading] = useState(!USE_MOCK);
```

Initialised to `true` in live mode (shows skeleton immediately on mount), `false` in mock mode
(data is synchronously available, no skeleton needed).

#### Step 3 — call `setLoading(false)` in the `onSnapshot` callback

```typescript
return onSnapshot(someQuery, (snap) => {
  setLiveX(snap.docs.map(/* ... */));
  setLoading(false);  // ← ADD THIS LINE
});
```

#### Step 4 — pass `loading` to `<Table>`

```tsx
<Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
```

This is the ONLY change to the JSX.

---

### 2.5 Special cases

#### Houses page (`list/houses/index.tsx`)

The houses page has TWO `useEffect` hooks:

1. Primary `onSnapshot` on `houses` collection — this controls when the list is ready.
2. Secondary `getDocs` for `studentCounts` per house — fires after houses are loaded.

The `loading` state should be controlled exclusively by the primary `onSnapshot` (hook 1). The
student count column will show `"—"` while the secondary fetch completes, which is the existing
behaviour and is acceptable.

```typescript
// Inside the primary onSnapshot callback:
onSnapshot(query(...), (snap) => {
  setHouses(snap.docs.map(d => ({ id: d.id, ...d.data() } as House)));
  setLoading(false);  // ← ADD HERE (not in the studentCounts useEffect)
});
```

#### Pages that already have their own loading state

None of the 15 list pages currently have a `loading` state. The `houses` page and some others have
local `deleting` or `deleteError` state — those are unrelated and should not be confused with the
new `loading` state for the skeleton.

---

### 2.6 Skeleton row count

Default of 8 rows covers most viewports without overflowing. Pages with very short expected lists
(e.g., `departments`, `terms`, `houses`) may optionally pass `rowCount={4}` for a more realistic
preview — but this is a cosmetic preference, not a requirement.

---

### 2.7 Implementation order

1. Update `Table.tsx` (add `loading` prop + skeleton rendering). This is a safe, additive change
   — existing usages without the prop are unaffected (default `loading = false`).
2. Add loading state to all 15 list pages in any order. Recommended batch sequence:
   - Group A (avatar "Info" column): `students`, `teachers`
   - Group B (standard columns, high traffic): `parents`, `classes`, `subjects`, `departments`
   - Group C (remaining): `lessons`, `exams`, `assignments`, `events`, `announcements`,
     `results`, `feedback`, `terms`, `houses`
3. TypeScript will catch any `loading` prop type mismatch at compile time — run `tsc --noEmit`
   after completing all pages.
4. Manual verification: switch to live mode, hard-refresh a list page, confirm skeleton appears
   briefly then resolves to real data. Switch to mock mode, confirm no skeleton (data is instant).

---

## Summary table

| Item | Scope | Risk |
|---|---|---|
| `firebase.ts` — add 2 fields to `TimetableSlotDocument` | 2 lines | None |
| `TimetableSlotForm.tsx` — class dropdown + write fields | ~40 lines | Low |
| `BigCalender.tsx` — full rewrite | ~120 lines | Medium (test all 5 call sites) |
| Teacher detail page — add `teacherIdOverride` prop | 1 line | Low |
| `Table.tsx` — add loading skeleton | ~30 lines | Low (additive, default-off) |
| 15 list pages — add 3 lines each | 45 lines total | Low |
| Existing `timetable_slots` data migration | Manual / script | Informational |
