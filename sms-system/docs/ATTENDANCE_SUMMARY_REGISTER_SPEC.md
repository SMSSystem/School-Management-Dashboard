# Attendance Summary Register (Gridsheet) — Specification

> **Purpose:** Authoritative reference for the Attendance Summary Register subfeature. Covers intended functionality, data collection and computation logic, web UI design, PDF export layout, Firestore schema, security rules, indexes, architectural decisions, trade-offs, and future enhancement paths.
>
> **Date documented:** 2026-06-16
> **Branch:** `post-mvp-additions`
> **Status:** Web UI complete and live. PDF export complete (preview modal + download). Spreadsheet export deferred.

---

## Table of Contents

1. [Feature Overview and Intended Functionality](#1-feature-overview-and-intended-functionality)
2. [Route and Access Control](#2-route-and-access-control)
3. [Firestore — Collections and Schema](#3-firestore--collections-and-schema)
4. [Firestore — Composite Indexes](#4-firestore--composite-indexes)
5. [Firestore — Security Rules](#5-firestore--security-rules)
6. [Firestore — Free-Tier Considerations and Query Optimizations](#6-firestore--free-tier-considerations-and-query-optimizations)
7. [Data Collection Logic](#7-data-collection-logic)
8. [Data Computation Logic](#8-data-computation-logic)
9. [Web UI — Components and Behaviour](#9-web-ui--components-and-behaviour)
10. [PDF Export — Feature Design](#10-pdf-export--feature-design)
11. [PDF Export — Visual Layout Design](#11-pdf-export--visual-layout-design)
12. [PDF Export — Column Structure Reference](#12-pdf-export--column-structure-reference)
13. [PDF Export — Data Transformation](#13-pdf-export--data-transformation)
14. [PDF Export — Calculation Order](#14-pdf-export--calculation-order)
15. [Architectural Design Notes](#15-architectural-design-notes)
16. [Data Structure Design Notes](#16-data-structure-design-notes)
17. [Trade-offs and Justifications](#17-trade-offs-and-justifications)
18. [Future Enhancement: Spreadsheet Export (CSV / XLSX)](#18-future-enhancement-spreadsheet-export-csv--xlsx)

---

## 1. Feature Overview and Intended Functionality

The Attendance Summary Register (colloquially "the gridsheet") is a read-only aggregation view that summarises `generalAttendance` data for a selected class and term. It is the digital equivalent of the physical summary register used by class head teachers for end-of-term attendance tabulation.

### 1.1 Who uses it

| Role | Access | Class scope |
|---|---|---|
| `super_admin` | Full access | Class dropdown — all classes in any institution |
| `institution_admin` | Full access | Class dropdown — all classes in their institution |
| `senior_teacher` | Read-only | Fixed to their assigned homeroom class (`users/{uid}.assignedClassId`) |

`regular_teacher`, `student`, and `parent` roles have no access.

### 1.2 What it shows

Two views of the same underlying data:

**Web UI — Table A (Student Monthly Totals):** One row per student in the class, sorted by surname. Columns represent each month within the selected term. Each cell shows the number of sessions (AM + PM combined) that student attended during that month. A "Total" column shows the term-wide session count.

**Web UI — Table B (Class Session Summary):** One row per session per school day across the term. Rows are "Males", "Females", and "Total". Each column is one session (AM or PM) on one school day, labeled `{schoolDayIndexWithinMonth}{A or P}` (e.g., `3A` = 3rd school day of the month, AM session). Month groups are separated visually with alternating background bands.

**PDF Export:** A single A3 landscape document matching the format of the physical school register. Contains class-level aggregate data (no student names). Intended for printing and filing. Triggered via a "Preview PDF" button that opens a full-screen modal with a live PDF preview and a "Download PDF" button. See §10–§14.

### 1.3 What it does not show

- Individual student names (in the PDF)
- Subject-level attendance (that is the Subject Register at `/attendance/subject`)
- Any data outside the selected term's date range
- Data in demo / mock mode (`USE_MOCK === true`)

---

## 2. Route and Access Control

| Property | Value |
|---|---|
| Route | `/attendance/gridsheet` |
| Page component | `sms-system/src/scenes/(dashboard)/attendance/gridsheet/index.tsx` |
| Sidebar section | ATTENDANCE |
| Sidebar label | Summary Register |
| Sidebar icon | `/calendar.png` |

**Route guard in `sms-system/src/App.tsx` (line 112):**
```tsx
<Route
  path="/attendance/gridsheet"
  element={
    (role === 'super_admin' || role === 'institution_admin' || role === 'senior_teacher')
      ? <AttendanceGridsheetPage />
      : <Navigate to="/" replace />
  }
/>
```

**Sidebar entry in `sms-system/src/components/Menu.tsx` (lines 226–230):**
```ts
{
  icon: "/calendar.png",
  label: "Summary Register",
  href: "/attendance/gridsheet",
  visible: ["super_admin", "institution_admin", "senior_teacher"],
}
```

---

## 3. Firestore — Collections and Schema

### 3.1 `generalAttendance`

One document per class + date + session combination. The gridsheet reads from this collection but never writes to it.

**Document ID:** Auto-generated by Firestore.

**Full schema (from `sms-system/src/lib/firebase.ts`):**
```typescript
export type GeneralAttendanceDocument = {
  institutionId: string;
  classId: string;
  className: string;       // denormalized at save time
  termId: string;
  academicYearId: string;
  date: string;            // ISO "YYYY-MM-DD"
  session: 'AM' | 'PM';
  records: {
    [studentId: string]: {
      state: 'P' | 'A' | 'L' | 'S' | 'E';
      reason?: string;     // max 50 chars; E state only
      studentName: string; // denormalized at save time
    };
  };
  submittedBy: string;     // uid of last saver
};
```

**Attendance states:**
- `P` — Present (counts as present)
- `L` — Late (counts as present)
- `A` — Absent (not present)
- `S` — Sick (not present)
- `E` — Excused (not present; requires a reason string)

Only `P` and `L` contribute to attendance counts in the gridsheet.

### 3.2 `terms`

Stores term definitions per institution. The gridsheet reads this collection to populate the term dropdown and to obtain the `startDate` / `endDate` used to scope the attendance query.

**Schema (from `sms-system/src/lib/firebase.ts`):**
```typescript
export type TermStatus = 'upcoming' | 'active' | 'completed';

export type TermDocument = {
  name: string;
  institutionId: string;
  startDate: string;       // ISO "YYYY-MM-DD"
  endDate: string;         // ISO "YYYY-MM-DD"
  status: TermStatus;
  academicYearId?: string;
  termNumber?: 1 | 2 | 3;
  headTeacherId?: string;
};
```

### 3.3 `classes`

Read by admin/super_admin roles to populate the class dropdown. Senior teachers bypass this query entirely — their class comes from their own `users` document.

```typescript
export type ClassDocument = {
  name: string;
  capacity: number;
  grade: number;
  // ... additional fields
};
```

### 3.4 `users`

The gridsheet reads student documents (`role === 'student'`) to obtain the name and gender of each enrolled student in the selected class. Gender is required to separate Males/Females in the class session summary.

Relevant fields: `uid` (document ID), `name`, `gender: 'Male' | 'Female' | null`, `classId`, `institutionId`, `role`.

---

## 4. Firestore — Composite Indexes

Three composite indexes are required. All were created and enabled in Firebase Console for project `school-sms-v1` on 2026-06-16.

| Collection | Field order | Query that requires it |
|---|---|---|
| `terms` | `institutionId ASC, startDate DESC` | Terms dropdown: `where('institutionId') + orderBy('startDate', 'desc')` |
| `generalAttendance` | `institutionId ASC, date ASC` | `AttendanceChart.tsx` (admin dashboard) and today's headcount query in `admin/index.tsx` |
| `generalAttendance` | `classId ASC, institutionId ASC, date ASC` | Gridsheet page attendance query (§7.2) |

### 4.1 Critical: field order matters

Firestore treats `classId + institutionId + date` and `institutionId + classId + date` as two distinct indexes. The gridsheet's attendance query filters on `institutionId` (equality), `classId` (equality), and `date` (range `>=` and `<=`). Firestore's query planner requires the equality fields used in the query's composite index to match the query's filter order — `classId` first, then `institutionId`, then the range field `date`. The manually-created `institutionId + classId + date` index during debugging does not satisfy this query.

### 4.2 Orphaned index (deleted)

During a debugging session on 2026-06-16, a composite index `institutionId ASC + classId ASC + date ASC` on `generalAttendance` was created manually in error. This index was not referenced by any query and has since been deleted from the Firebase Console (confirmed 2026-06-16). No further action needed.

### 4.3 Silent failure pattern

Missing composite indexes cause `getDocs()` to reject its promise with a `FirebaseError`. Because most `getDocs` calls in this codebase have no `.catch()` handler, these rejections are silently swallowed — UI state simply never updates and no error message is shown to the user. The only signal is in the browser console: `Uncaught (in promise) FirebaseError: The query requires an index`. The error message includes a URL that opens the Firebase Console with a pre-filled composite index creation modal. React Strict Mode causes each failed query to appear twice in the console (double effect invocation in development).

---

## 5. Firestore — Security Rules

The following rules apply to the collections read by the gridsheet. The authoritative copy lives in the Firebase Console (`school-sms-v1`). The documentation copy is at `sms-system/docs/firebase-rules.md`.

### 5.1 `generalAttendance` read rule

```javascript
match /generalAttendance/{docId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId)
    && (
      isAdminOrAbove()
      || isSeniorTeacher()
    );
}
```

`sameInstitution()` returns true for `super_admin` (bypasses institution scoping) or when the caller's `institutionId` matches the document's `institutionId`. Senior teachers can read all `generalAttendance` documents in their institution — the class-level restriction is enforced in the application query (§7.2), not in the rules.

### 5.2 `terms` read rule

```javascript
match /terms/{termId} {
  allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
}
```

All authenticated users within the same institution can read term documents.

### 5.3 `classes` read rule

Classes are readable by all authenticated users in the same institution (`isTeacherOrAbove()` covers the admin and teacher roles that use the class dropdown).

### 5.4 `users` read rule

Student documents are readable by `isAdminOrAbove()` and `isSeniorTeacher()`. The query filters students by `institutionId`, `role`, and `classId` before any data is read.

---

## 6. Firestore — Free-Tier Considerations and Query Optimizations

### 6.1 Read volume per page load

| Query | Estimated reads |
|---|---|
| Terms dropdown | 1 per term document in the institution (~3–6 reads) |
| Class list (admin only) | 1 per class in the institution (~5–30 reads) |
| Student list (on class + term select) | 1 per student in the selected class (~20–50 reads) |
| Attendance documents (on class + term select) | 1 per (session × school day) for the class (~90–200 reads per term) |
| `senior_teacher` profile | 1 read (single `getDoc` on their own `users` document) |

**Total per full page load with class and term selected:** approximately 120–290 reads.

### 6.2 Spark plan limits (as of 2026)

- 50,000 reads per day
- 20,000 writes per day
- 1 GB storage

A single institution with one user loading the gridsheet once per day uses ~290 reads. Multiple users or frequent reloads can accumulate quickly. The 50,000 read limit supports approximately 170 full page loads per day across the entire project.

### 6.3 Optimizations already in place

- **Date-range scoping:** The attendance query filters `date >= term.startDate AND date <= term.endDate`. Documents outside the term are never fetched.
- **Concurrent queries:** Students and attendance documents are fetched in a single `Promise.all`, halving the time-to-data compared to sequential awaits.
- **No re-fetch on re-render:** Data is stored in component state. Re-renders (e.g., dropdown hover, theme toggle) do not re-trigger Firestore queries.
- **Effect guard:** The third `useEffect` (attendance + students) has a guard: `if (!effectiveClassId || !selectedTermId || !institutionId) { setGridData(null); return; }`. Firestore is not queried until both a class and a term are selected.

### 6.4 Recommendations for future scaling

- Cache `terms` and `classes` lists per institution in a React context or a lightweight SWR layer to avoid re-fetching on every page navigation.
- If read volume approaches the Spark limit, consider upgrading to the Blaze (pay-as-you-go) plan. Reads cost $0.06 per 100,000, making the gridsheet affordable even at scale.

---

## 7. Data Collection Logic

### 7.1 Terms and classes

**Terms query (fires on `institutionId` change):**
```typescript
// sms-system/src/scenes/(dashboard)/attendance/gridsheet/index.tsx — lines 246–261
getDocs(
  query(
    collection(db, 'terms'),
    where('institutionId', '==', institutionId),
    orderBy('startDate', 'desc'),
  ),
).then((snap) => {
  const loaded = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TermDocument) }));
  setTerms(loaded);
  // Default to the active term if one exists
  const active = loaded.find((t) => t.status === 'active');
  if (active) setSelectedTermId(active.id);
});
```

The term dropdown is ordered newest-first (`startDate DESC`) so the most recent term appears at the top. The active term is auto-selected on load.

**Classes query (fires for admin/super_admin on `institutionId` change):**
```typescript
// lines 236–243
getDocs(
  query(collection(db, 'classes'), where('institutionId', '==', institutionId)),
).then((snap) =>
  setClasses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ClassDocument) }))),
);
```

Skipped entirely for `senior_teacher` — their class is read from their own `users` document via `useSeniorTeacherProfile()`.

### 7.2 Students and attendance documents

Fires when `effectiveClassId`, `selectedTermId`, and `institutionId` are all truthy:

```typescript
// lines 264–314
Promise.all([
  // Students in class (with gender for Males/Females split)
  getDocs(
    query(
      collection(db, 'users'),
      where('institutionId', '==', institutionId),
      where('role', '==', 'student'),
      where('classId', '==', effectiveClassId),
    ),
  ),
  // All generalAttendance docs for the class within the term date range
  getDocs(
    query(
      collection(db, 'generalAttendance'),
      where('institutionId', '==', institutionId),
      where('classId', '==', effectiveClassId),
      where('date', '>=', term.startDate),
      where('date', '<=', term.endDate),
    ),
  ),
]).then(([studentSnap, attendanceSnap]) => {
  const students: GridsheetStudent[] = studentSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        name: (data.name as string) ?? d.id,
        gender: (data.gender as 'Male' | 'Female' | null) ?? null,
      };
    })
    .sort((a, b) => surname(a.name).localeCompare(surname(b.name)));

  const attendanceDocs = attendanceSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as GeneralAttendanceDocument) }),
  );

  setGridData(computeGridsheet(students, attendanceDocs));
}).finally(() => setGridLoading(false));
```

**Why `where('role', '==', 'student')` is safe without a composite index:** All three filters on `users` are equality filters. Firestore does not require a composite index for multiple equality-only filters.

**Why `generalAttendance` requires a composite index:** The query combines two equality filters (`institutionId`, `classId`) with a range filter (`date >= ... AND date <= ...`). Firestore requires a composite index for any query mixing equality and range filters on different fields. The required index is `classId ASC + institutionId ASC + date ASC`.

### 7.3 Role-scoped class resolution

```typescript
// lines 228–233
const effectiveClassId =
  role === 'senior_teacher' ? (assignedClassId ?? '') : selectedClassId;
const effectiveClassName =
  role === 'senior_teacher'
    ? (assignedClassName ?? '')
    : (classes.find((c) => c.id === selectedClassId)?.name ?? '');
```

`assignedClassId` and `assignedClassName` come from `useSeniorTeacherProfile()`:

```typescript
// sms-system/src/hooks/useSeniorTeacherProfile.ts
export function useSeniorTeacherProfile(): SeniorTeacherProfile & { loading: boolean } {
  const { user, role } = useAuth();
  // ...
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

## 8. Data Computation Logic

**File:** `sms-system/src/lib/attendanceGridsheet.ts`

`computeGridsheet` is a pure function — no Firestore calls, no side effects. It derives all display data from the two arrays passed in. It can be tested with synthetic data without any Firebase dependency.

### 8.1 Inputs

```typescript
computeGridsheet(
  students: GridsheetStudent[],
  attendanceDocs: (GeneralAttendanceDocument & { id: string })[],
): GridsheetData
```

### 8.2 Step-by-step process

**Step 1 — Initialise per-student monthly accumulators:**
```typescript
const studentMonthly = new Map<string, Record<string, number>>();
for (const s of students) studentMonthly.set(s.uid, {});
```
Each student gets an empty object. Keys will be added as months are encountered.

**Step 2 — Iterate attendance documents:**
```typescript
for (const d of attendanceDocs) {
  const monthKey = toMonthKey(d.date); // d.date.slice(0, 7) → "YYYY-MM"
  const sk = `${d.date}_${d.session}`; // e.g. "2025-09-15_AM"

  // Initialise session-level counters on first encounter
  if (!sessionCountMap.has(sk)) {
    sessionCountMap.set(sk, { malesPresent: 0, femalesPresent: 0, totalPresent: 0 });
  }
  const sc = sessionCountMap.get(sk)!;

  // Iterate each student record in this session
  for (const [studentId, rec] of Object.entries(d.records)) {
    if (rec.state !== 'P' && rec.state !== 'L') continue; // only P and L count

    // Per-student monthly tally
    if (studentMonthly.has(studentId)) {
      const monthly = studentMonthly.get(studentId)!;
      monthly[monthKey] = (monthly[monthKey] ?? 0) + 1;
    }

    // Class-level session counters
    sc.totalPresent++;
    const student = studentMap.get(studentId);
    if (student?.gender === 'Male') sc.malesPresent++;
    else if (student?.gender === 'Female') sc.femalesPresent++;
    // null-gender students: totalPresent only
  }
}
```

**Step 3 — Sort sessions chronologically and assign school-day indices:**
```typescript
for (const sk of [...sessionCountMap.keys()].sort()) {
  const [date, session] = sk.split('_') as [string, 'AM' | 'PM'];
  const monthKey = toMonthKey(date);

  // Track each unique date per month → sequential school-day index (1-based)
  if (!monthDayMap.has(monthKey)) monthDayMap.set(monthKey, new Map());
  const dayMap = monthDayMap.get(monthKey)!;
  if (!dayMap.has(date)) dayMap.set(date, dayMap.size + 1);

  sessionEntries.push({
    date,
    session,
    monthKey,
    dayIndex: dayMap.get(date)!,
    ...sessionCountMap.get(sk)!,
  });
}
```

Keys in the form `"YYYY-MM-DD_AM"` sort correctly by lexicographic comparison, ensuring AM always precedes PM for the same date.

`dayIndex` is the sequential school-day number within the month (1st school day of September = 1, regardless of calendar date). This is used in the web UI's Table B column labels only. The PDF uses calendar day-of-month instead — see §13.

**Step 4 — Build student rows:**
```typescript
const studentRows: GridsheetStudentRow[] = students.map(s => {
  const monthly = studentMonthly.get(s.uid) ?? {};
  return {
    studentId: s.uid,
    studentName: s.name,
    gender: s.gender,
    monthlyPresent: monthly,
    termTotal: Object.values(monthly).reduce((a, b) => a + b, 0),
  };
});
```

### 8.3 Current output interfaces

```typescript
// sms-system/src/lib/attendanceGridsheet.ts

export interface GridsheetStudent {
  uid: string;
  name: string;
  gender: 'Male' | 'Female' | null;
}

export interface GridsheetStudentRow {
  studentId: string;
  studentName: string;
  gender: 'Male' | 'Female' | null;
  monthlyPresent: Record<string, number>; // "YYYY-MM" → present session count
  termTotal: number;
}

export interface GridsheetSessionEntry {
  date: string;          // "YYYY-MM-DD"
  session: 'AM' | 'PM';
  monthKey: string;      // "YYYY-MM"
  dayIndex: number;      // 1-based sequential school day within the month
  malesPresent: number;
  femalesPresent: number;
  totalPresent: number;
}

export interface GridsheetData {
  studentRows: GridsheetStudentRow[];
  sessionEntries: GridsheetSessionEntry[];
  monthKeys: string[];   // sorted unique "YYYY-MM" keys
}
```

### 8.4 Completed rename: `boysPresent` / `girlsPresent` → `malesPresent` / `femalesPresent`

As part of the PDF export implementation, the interface field names and the web UI's Table B row labels were updated from "Boys"/"Girls" to "Males"/"Females". Updated files:
- `sms-system/src/lib/attendanceGridsheet.ts` — interface definitions and computation
- `sms-system/src/scenes/(dashboard)/attendance/gridsheet/index.tsx` — Table B row labels and field references

### 8.5 Key design decisions in the computation

- **P and L both count as present.** Late students are physically present. Excluding them would undercount real attendance. S (Sick) and E (Excused) are absent from the count.
- **Null-gender students** are included in `totalPresent` but excluded from `malesPresent` / `femalesPresent`. This avoids silent data loss while preserving the gender split for students whose gender is recorded.
- **Students not in the `studentMap`** (e.g., a student who left the class mid-term but whose attendance was recorded) are counted in session-level totals but have no student row. This preserves historical session counts.

---

## 9. Web UI — Components and Behaviour

**File:** `sms-system/src/scenes/(dashboard)/attendance/gridsheet/index.tsx`

### 9.1 State

| State variable | Type | Purpose |
|---|---|---|
| `classes` | `(ClassDocument & { id: string })[]` | Admin class dropdown options |
| `selectedClassId` | `string` | Admin class selection |
| `terms` | `(TermDocument & { id: string })[]` | Term dropdown options |
| `selectedTermId` | `string` | Term selection (auto-defaults to active term) |
| `gridLoading` | `boolean` | Shows spinner during fetch + compute |
| `gridData` | `GridsheetData \| null` | Computed gridsheet; null when no selection or loading |
| `pdfOpen` | `boolean` | Controls visibility of the PDF preview modal |

**Derived values (not state):**

| Derived | Source | Purpose |
|---|---|---|
| `selectedTerm` | `terms.find(t => t.id === selectedTermId) ?? null` | Full term object passed to `GridsheetPDF` for the term-end date header |

### 9.2 Guard states

| Condition | Output |
|---|---|
| `USE_MOCK === true` | Info message: not available in demo mode |
| `profileLoading === true` | Spinner (waiting for `useSeniorTeacherProfile`) |
| `senior_teacher` with no `assignedClassId` | Info message: no homeroom class assigned |
| No class selected | Info message: select a class |
| Class selected, no term selected | Info message: select a term |
| Loading | Spinner |
| Loaded, zero student rows | Info message: no attendance records found |
| Loaded, rows present | Table A and Table B rendered |

### 9.3 Table A — Student Monthly Totals

- One row per student, sorted by surname (extracted from the last space-separated token of the full name string)
- Columns: sticky student name | one column per `monthKey` showing `monthlyPresent[mk] ?? 0` | term total
- Sticky first column (`position: sticky; left: 0; z-index: 10`) for horizontal scroll usability
- Renders only when `gridData.studentRows.length > 0`

### 9.4 Table B — Class Session Summary

- Three rows: Males, Females, Total
- Columns grouped by month with alternating `bg-sky-50` / `bg-indigo-50` bands
- Column labels: `{se.dayIndex}{se.session === 'AM' ? 'A' : 'P'}` — e.g., `3A` for the 3rd school day AM
- A right border is placed after each PM column to visually separate school days
- Sticky first column for the row labels

### 9.5 PDF Preview Modal

A "Preview PDF" button sits in the page header alongside the class and term selectors. It is disabled when `gridData` is null or `gridLoading` is true.

Clicking the button sets `pdfOpen = true`, which renders a fixed full-screen overlay (`inset-0 z-50`):

```
┌─────────────────────────────────────────────────────┐
│ PDF Preview — {className}    [Download PDF] [Close]  │  ← header bar (white bg)
├─────────────────────────────────────────────────────┤
│                                                     │
│         PDFViewer (100% × 100%, no toolbar)         │  ← scrollable PDF iframe
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Header bar** (`bg-white dark:bg-gray-900`, border-bottom):
- Left: "PDF Preview" label, with ` — {className}` appended when a class name is available
- Right: "Download PDF" button (`PDFDownloadLink` from `@react-pdf/renderer`; shows "Preparing…" while rendering) and "Close" button (sets `pdfOpen = false`)

**Body**: `PDFViewer` with `width="100%"`, `height="100%"`, `showToolbar={false}`. The viewer renders the same `<GridsheetPDF>` document tree as the download link, so what the user sees is identical to what they download.

`PDFDownloadLink` wraps its `document` prop in a render prop pattern — the rendered `<button>` inside controls the disabled state during PDF generation.

**New files involved:**
- `sms-system/src/scenes/(dashboard)/attendance/gridsheet/GridsheetPDF.tsx` — `@react-pdf/renderer` document component (see §11)

---

## 10. PDF Export — Feature Design

### 10.1 Library

`@react-pdf/renderer` is already installed (confirmed in `ATTENDANCE_REGISTER_SPEC.md`). It renders React component trees to vector PDF entirely in the browser — no server or cloud function is required.

### 10.2 Trigger

A "Preview PDF" button in the page header (alongside the class and term selectors). The button is disabled when `gridData` is null or `gridLoading` is true. On click it sets `pdfOpen = true`, which renders a full-screen modal containing a live `PDFViewer` preview and a separate "Download PDF" button (`PDFDownloadLink`). See §9.5 for the modal layout.

### 10.3 Filename convention

```
attendance-register-{className}-{termName}.pdf
```
Example: `attendance-register-Grade-10A-Christmas-Term-2025.pdf`

Falls back to `attendance-register-class-{termName}.pdf` when `effectiveClassName` is empty.

### 10.4 What the PDF shows (and does not show)

**Shows:**
- Institution-level header
- Class-level aggregated attendance data (Males/Females session counts per calendar day per month)
- 31 fixed data rows (calendar days 01–31)
- Dynamic month columns (only populated months are rendered)
- Blank cells for non-school days and non-existent calendar dates

**Does not show:**
- Student names
- Individual student attendance records
- Data outside the selected term

---

## 11. PDF Export — Visual Layout Design

### 11.1 Paper and orientation

- **Paper:** A3 (420mm × 297mm)
- **Orientation:** Landscape
- A3 landscape provides sufficient horizontal space for a 4-month term with all session columns without requiring column compression.

### 11.2 Row structure

**Header rows (5 rows):**

| Row | A–D | E | F / K / P / U | Month data columns | Z–AA |
|---|---|---|---|---|---|
| 1 | "TOTAL ATTENDANCES (each month of term)" (merged) | "TOTAL ATTENDANCES Carried Forward" (merged rows 1–5?) | — | "MONTHLY SUMMARIES FOR TERM ENDING {date}" (merged across all month columns) | "TOTAL" (merged Z–AA) |
| 2 | (part of row 1 merge or blank) | (part of row 1 merge) | "Date of Month" (merged rows 2–5, vertical text) | "{Month Name}" (merged across the 4-column group) | (blank) |
| 3 | (blank) | (blank) | (merged continues) | "Males" (cols 1–2 of group) \| "Females" (cols 3–4 of group) | (blank) |
| 4 | (blank) | (blank) | (merged continues) | "Session" (merged across all 4 cols of group) | (blank) |
| 5 | "SEP" \| "OCT" \| "NOV" \| "DEC" (one per column) | (blank) | (merged ends) | "AM" \| "PM" \| "AM" \| "PM" | "Males" \| "Females" |

**Alignment constraint:** Row 5 is the last header row for all sections simultaneously. The month abbreviations in A–D (row 5), the AM/PM labels in the month groups (row 5), and the "Males"/"Females" labels in Z–AA (row 5) all sit at the same level. Data rows begin at row 6 for all columns.

**Data rows (31 rows, rows 6–36):** One row per calendar day, 01 through 31. See §12 and §13 for cell values.

### 11.3 Header text for the term end date

The main header reads: `MONTHLY SUMMARIES FOR TERM ENDING {date}` where `{date}` is formatted as `"Month DD, YYYY"` (e.g., `December 18, 2025`). This matches the physical register convention. Format using:
```typescript
new Date(term.endDate + 'T00:00:00').toLocaleDateString('en-US', {
  month: 'long',
  day: '2-digit',
  year: 'numeric',
})
```

### 11.4 Column widths (derived from spreadsheet mockup)

| Column(s) | Spreadsheet reference width | PDF equivalent (approximate) |
|---|---|---|
| A–D (monthly totals) | 40px each | ~14mm each |
| E (Carried Forward) | 68px | ~24mm |
| F, K, P, U (Date of Month) | 40px each | ~14mm each |
| Session data columns (G–J, L–O, Q–T, V–Y) | 40px each | ~14mm each |
| Z–AA (TOTAL Males/Females) | 52px each | ~18mm each |

### 11.5 Borders and background

- All cells have borders (all sides)
- Background: white (default)
- No alternating row colours in the PDF (matches physical register format)
- Header rows may use light shading or bold text to distinguish from data rows

---

## 12. PDF Export — Column Structure Reference

The column layout for a **4-month term**. For terms with fewer months, unused month groups are omitted entirely — the column count contracts.

| Spreadsheet column | Role | Content |
|---|---|---|
| A | Left section | Class total sessions on this calendar day in month 1 |
| B | Left section | Class total sessions on this calendar day in month 2 |
| C | Left section | Class total sessions on this calendar day in month 3 |
| D | Left section | Class total sessions on this calendar day in month 4 |
| E | Left section | Carried Forward — blank placeholder |
| F | Month 1 separator | Date of Month (01–31) |
| G | Month 1 data | Males AM present |
| H | Month 1 data | Males PM present |
| I | Month 1 data | Females AM present |
| J | Month 1 data | Females PM present |
| K | Month 2 separator | Date of Month (01–31) |
| L | Month 2 data | Males AM present |
| M | Month 2 data | Males PM present |
| N | Month 2 data | Females AM present |
| O | Month 2 data | Females PM present |
| P | Month 3 separator | Date of Month (01–31) |
| Q–T | Month 3 data | Males AM, Males PM, Females AM, Females PM |
| U | Month 4 separator | Date of Month (01–31) |
| V–Y | Month 4 data | Males AM, Males PM, Females AM, Females PM |
| Z | Total | Sum of all Males (AM + PM) across all months for this day |
| AA | Total | Sum of all Females (AM + PM) across all months for this day |

**Total columns for an N-month term:** `N + 1` (left section: N monthly total cols + 1 Carried Forward) `+ N × 5` (right section: N month groups × (1 Date of Month + 4 session cols)) `+ 2` (TOTAL section) = `6N + 3` columns.

- 1-month term: 9 columns
- 2-month term: 15 columns
- 3-month term: 21 columns
- 4-month term: 27 columns

### 12.1 "Date of Month" columns

Columns F, K, P, U (and any additional Date of Month columns for terms with more months) all show the same sequential value for a given row: "01" for row 1, "02" for row 2, …, "31" for row 31. They are redundant with each other but are repeated in each month group so the reader can identify the row without scanning to the far left — matching the physical register convention.

---

## 13. PDF Export — Data Transformation

The existing `GridsheetData` output from `computeGridsheet` is oriented toward the web UI (sequential school-day indices, per-student rows). The PDF requires a **calendar-day matrix** keyed by `(calendarDay, monthKey)`.

### 13.1 Utility function (implemented)

`computeGridsheetPDF` is exported from `sms-system/src/lib/attendanceGridsheet.ts`. It accepts the already-computed `GridsheetData` (reusing data already fetched for the web UI — no additional Firestore reads) and returns a `GridsheetPDFDayRow[]`.

```typescript
export interface GridsheetPDFDayRow {
  dayNum: number;  // 1–31 (calendar day-of-month)
  // Left section (A–D): class-wide session total per month for this calendar day.
  // null = no school that day in that month (renders as blank cell).
  monthDayTotals: Record<string, number | null>;
  // Right section: per-month session breakdown.
  // null = no attendance document for that session (renders as blank).
  // 0 = document exists, zero students present.
  monthSessions: Record<string, {
    malesAM: number | null;
    malesPM: number | null;
    femalesAM: number | null;
    femalesPM: number | null;
  }>;
  // TOTAL section. null when no school at all on this calendar day across all months.
  malesTotal: number | null;
  femalesTotal: number | null;
}
```

### 13.2 Transformation steps (actual implementation)

```typescript
export function computeGridsheetPDF(data: GridsheetData): GridsheetPDFDayRow[] {
  // Step 1: Build session lookup keyed by "<monthKey>_<dayNum>"
  const sessionLookup = new Map<string, {
    malesAM: number | null; malesPM: number | null;
    femalesAM: number | null; femalesPM: number | null;
  }>();

  for (const entry of data.sessionEntries) {
    const dayNum = parseInt(entry.date.slice(8), 10);
    const key = `${entry.monthKey}_${dayNum}`;
    if (!sessionLookup.has(key)) {
      sessionLookup.set(key, { malesAM: null, malesPM: null, femalesAM: null, femalesPM: null });
    }
    const sd = sessionLookup.get(key)!;
    if (entry.session === 'AM') {
      sd.malesAM = entry.malesPresent;
      sd.femalesAM = entry.femalesPresent;
    } else {
      sd.malesPM = entry.malesPresent;
      sd.femalesPM = entry.femalesPresent;
    }
  }

  // Step 2: Build 31 rows
  const rows: GridsheetPDFDayRow[] = [];
  for (let day = 1; day <= 31; day++) {
    const monthDayTotals: Record<string, number | null> = {};
    const monthSessions: GridsheetPDFDayRow['monthSessions'] = {};
    let malesTotal = 0, femalesTotal = 0, hasAnyData = false;

    for (const mk of data.monthKeys) {
      const sd = sessionLookup.get(`${mk}_${day}`);
      if (sd) {
        hasAnyData = true;
        const mAM = sd.malesAM ?? 0, mPM = sd.malesPM ?? 0;
        const fAM = sd.femalesAM ?? 0, fPM = sd.femalesPM ?? 0;
        monthDayTotals[mk] = mAM + mPM + fAM + fPM;
        monthSessions[mk] = sd;
        malesTotal += mAM + mPM;
        femalesTotal += fAM + fPM;
      } else {
        monthDayTotals[mk] = null;
        monthSessions[mk] = { malesAM: null, malesPM: null, femalesAM: null, femalesPM: null };
      }
    }

    rows.push({
      dayNum: day, monthDayTotals, monthSessions,
      malesTotal: hasAnyData ? malesTotal : null,
      femalesTotal: hasAnyData ? femalesTotal : null,
    });
  }

  return rows;
}
```

**Key difference from the spec draft:** The function takes `GridsheetData` (not raw `students` + `attendanceDocs`), and returns `GridsheetPDFDayRow[]` directly (not `{ rows, monthKeys }`). The `monthKeys` are already present on `GridsheetData`. The `hasAnyData` flag ensures `malesTotal`/`femalesTotal` are `null` (blank cell) when the entire calendar row has no school across all months, rather than `0`.

### 13.3 `null` vs `0` distinction

`null` means no attendance document exists for that date + session (the day was a weekend, holiday, or no register was submitted). The PDF renders `null` as a blank cell. `0` means a document exists but no students were recorded as present — the PDF renders `0` as the number zero. This distinction preserves the difference between "no school" and "school was held but everyone was absent."

---

## 14. PDF Export — Calculation Order

For each data row (calendar day N), values are populated in this order:

| Step | Value | Location | Formula |
|---|---|---|---|
| 1 | Males AM | Right section, month group cols 1 | Count of `Male` students with `state === 'P' \|\| 'L'` in AM session for date N of this month |
| 2 | Males PM | Right section, month group col 2 | Same, PM session |
| 3 | Females AM | Right section, month group col 3 | Count of `Female` students P or L, AM |
| 4 | Females PM | Right section, month group col 4 | Count of `Female` students P or L, PM |
| 5 | Males day-wide (per month) | Internal | `malesAM + malesPM` for this month |
| 6 | Females day-wide (per month) | Internal | `femalesAM + femalesPM` for this month |
| 7 | Left section cell (A–D) | Left section, column for this month | `malesAM + malesPM + femalesAM + femalesPM` (= step 5 + step 6) for this month |
| — | Column Z | TOTAL section | `Σ step 5` across all months |
| — | Column AA | TOTAL section | `Σ step 6` across all months |
| — | Grand total (internal only) | Not displayed | `Z + AA` — derivable by the reader |

There is no dedicated column for the grand total (Males + Females combined). The reader can derive it as column Z + column AA.

---

## 15. Architectural Design Notes

### 15.1 Read-only feature

The gridsheet makes no Firestore writes. It is a pure aggregation view over data written by the General Register page (`/attendance/general`). This means no security rule writes, no transaction logic, and no risk of corrupting attendance data from this page.

### 15.2 Client-side computation and PDF generation

All aggregation (`computeGridsheet`, `computeGridsheetPDF`) and PDF rendering (`@react-pdf/renderer`) run in the browser. No cloud function, backend API, or server-side rendering is involved. This is appropriate for a Spark-plan project where infrastructure costs must be zero.

**Scalability ceiling:** Client-side aggregation of ~200 Firestore documents is negligible. If a future institution has 200+ students in a class or 300+ school days in a term, performance may degrade. At that scale, a background Firestore aggregation function (Cloud Function or Firestore Aggregation Queries) would be appropriate.

### 15.3 Separation of concerns

| Layer | File | Responsibility |
|---|---|---|
| Data fetching | `gridsheet/index.tsx` | Firestore queries, state management, PDF modal trigger |
| Web UI computation | `attendanceGridsheet.ts` | `computeGridsheet` — per-student and per-session web aggregation |
| PDF data computation | `attendanceGridsheet.ts` | `computeGridsheetPDF` — calendar-day matrix for PDF |
| PDF rendering | `gridsheet/GridsheetPDF.tsx` | `@react-pdf/renderer` document component (`GridsheetPDF`) |
| PDF export utility | `gridsheetExports.ts` (future) | CSV and XLSX export functions |

### 15.4 Role-based class scoping (two-layer enforcement)

The class restriction for `senior_teacher` is enforced at two levels:

1. **UI layer:** Class dropdown is hidden. The fixed class name is shown as a subtitle below the page heading.
2. **Query layer:** `effectiveClassId` resolves to `assignedClassId` from the teacher's `users` document. All Firestore queries use this class ID.

Firestore rules do not enforce class-level restriction for senior teachers on `generalAttendance` reads — the rule grants read access to all senior teachers within the same institution. The application-layer query filter is the actual enforcement mechanism. This is acceptable because the data is non-sensitive attendance summaries, and Firestore rule complexity would increase significantly for minimal security gain.

### 15.5 Implicit dependency on General Register

The gridsheet produces meaningful data only if attendance has been entered via `/attendance/general`. An institution that hasn't used the General Register will see "No attendance records found" regardless of class and term selection. This is by design — the gridsheet is a summary view, not a data entry point.

---

## 16. Data Structure Design Notes

### 16.1 Document-per-session design in `generalAttendance`

One Firestore document per class + date + session. For a class with 90 school days: 180 documents per term. This granularity was chosen to avoid write conflicts: AM and PM registers are often submitted by different people at different times. A single "document per class + date" approach would require merging concurrent AM and PM writes, introducing transaction complexity.

### 16.2 `date` as ISO string, not Timestamp

`generalAttendance.date` is stored as `"YYYY-MM-DD"`. This enables:
- Lexicographic range queries (`where('date', '>=', startDate)`) without Timestamp conversion
- Simple month key extraction (`date.slice(0, 7)` → `"YYYY-MM"`)
- Calendar day extraction (`parseInt(date.slice(8))` → `1–31`)
- Human-readable document inspection in the Firebase Console

### 16.3 `records` as an embedded map

Student attendance records are stored as a map inside each document (`{ [studentId]: { state, reason?, studentName } }`) rather than a sub-collection. This allows reading and writing the full session's attendance as one atomic Firestore operation and avoids sub-collection reads (which count as additional Firestore reads).

**Size constraint:** Firestore documents have a 1MB limit. At ~150 bytes per student record, a class of 6,000 students would approach the limit. At typical sizes (20–50 students), documents are ~3–8KB, well within limits.

### 16.4 `studentName` denormalization in `records`

Each record stores the student's name at save time. This allows the General Register page to display names without a separate `users` lookup per session. The gridsheet does not use `studentName` from records — it fetches current names directly from `users` to ensure up-to-date sorting and gender data.

### 16.5 Calendar-day vs school-day indexing

The web UI uses `dayIndex` (sequential school day within the month: 1st school day = 1). The PDF uses `dayOfMonth` (calendar day: 1st of the month = 1). These are distinct:
- `dayIndex` gives compact sequential column labels (`1A`, `1P`, `2A`…) suitable for a scrollable web table.
- `dayOfMonth` matches the physical register's "Date of Month" column (days 01–31) and makes blank rows for non-school days self-explanatory.

Both are derived from the `date` string and require no extra Firestore reads.

---

## 17. Trade-offs and Justifications

### 17.1 A3 landscape vs multiple A4 pages

**Decision:** Single A3 landscape page.
**Justification:** The physical register is a single-page document. Fragmenting across multiple A4 pages would split month groups across pages, making side-by-side month comparison difficult. A3 landscape fits a 4-month term with legible column sizing.
**Trade-off:** A3 printers are less common in some settings. Institutions without A3 printers can print to A4 at reduced scale (~71% = A4 fits within A3). Readability decreases at small scale.

### 17.2 Fixed 31 data rows vs dynamic row count

**Decision:** Fixed 31 rows (calendar days 01–31).
**Justification:** Matches the physical register format. Predictable layout regardless of term length. Makes blank rows for non-school days visually obvious — the reader can see that certain dates had no school without needing a legend.
**Trade-off:** Short terms or months with ≤28 days will have empty rows at the bottom. This is intentional and matches the handwritten register format.

### 17.3 Class-level aggregates in left section (A–D), not per-student rows

**Decision:** A–D shows class-wide daily session totals per month, not individual student rows.
**Justification:** Per-student data is available in the web UI (Table A). The PDF is a summary document for administrative filing. Including per-student rows would require a much taller document or smaller font, and would include personally identifiable information in a printable document.
**Trade-off:** Users who want per-student data in a portable format cannot get it from the PDF. They must use the web UI.

### 17.4 No student names in PDF

**Decision:** Student names are excluded.
**Justification:** Matches physical register convention (numbered rows, not named). Reduces personal data exposure in a printed document that may be filed or shared.

### 17.5 "Date of Month" repeated in every month group

**Decision:** Columns F, K, P, U each independently show day numbers 01–31.
**Justification:** In a wide landscape document, repeating the date in each month group lets the reader identify the row without scanning to the far left. This is the physical register convention and reduces reading effort.
**Trade-off:** Each "Date of Month" column consumes ~14mm of horizontal space. For a 4-month term this costs 56mm (four Date of Month columns). On A3 landscape (420mm) this is acceptable; it would be tight on A4 landscape.

### 17.6 `null` vs `0` for missing session data

**Decision:** `null` means no document, `0` means a document exists with zero present students.
**Justification:** These are meaningfully different states. `null` (blank cell) tells the reader "no register was submitted / no school on this day." `0` tells the reader "school was held, register was submitted, and nobody was present." Collapsing both to `0` would obscure operational data.

### 17.7 Carried Forward column as placeholder

**Decision:** Column E is included in the layout but shows no data.
**Justification:** Preserves structural fidelity with the physical register. In the physical register, "Carried Forward" accumulates totals from a previous page. For a digital PDF that contains the full term, this concept doesn't directly apply. The column is retained for potential future use (e.g., multi-term rollup, previous-term totals) without requiring a layout change when the feature is eventually implemented.

---

## 18. Future Enhancement: Spreadsheet Export (CSV / XLSX)

### 18.1 Overview

A spreadsheet export would allow users to download the gridsheet data for offline analysis, printing on non-A3 printers, or importing into other tools. The same `GridsheetPDFDayRow[]` data structure produced for the PDF can be reused directly — only the rendering layer changes.

### 18.2 CSV export

CSV is the simplest to implement and requires no additional npm packages.

**Implementation approach:**
```typescript
// sms-system/src/lib/gridsheetExports.ts (new file)
function exportGridsheetCSV(
  rows: GridsheetPDFDayRow[],
  monthKeys: string[],
  term: TermDocument & { id: string },
  className: string,
) {
  const monthNames = monthKeys.map((mk) =>
    new Date(mk + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );

  // Build 2-row flattened header
  const headerRow1 = [
    ...monthKeys.map((mk) => new Date(mk + '-01').toLocaleDateString('en-US', { month: 'short' })),
    'CF', // Carried Forward placeholder
    ...monthKeys.flatMap((mk, i) => [
      `${monthNames[i]} Date`,
      `${monthNames[i]} M-AM`,
      `${monthNames[i]} M-PM`,
      `${monthNames[i]} F-AM`,
      `${monthNames[i]} F-PM`,
    ]),
    'Total Males',
    'Total Females',
  ];

  const dataRows = rows.map((row) => {
    const dayStr = String(row.dayNum).padStart(2, '0');
    return [
      ...monthKeys.map((mk) => row.monthDayTotals[mk] ?? ''),
      '', // Carried Forward blank
      ...monthKeys.flatMap((mk) => {
        const s = row.monthSessions[mk];
        return [
          dayStr,
          s.malesAM ?? '',
          s.malesPM ?? '',
          s.femalesAM ?? '',
          s.femalesPM ?? '',
        ];
      }),
      row.malesTotal || '',
      row.femalesTotal || '',
    ];
  });

  const csv = [headerRow1, ...dataRows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `summary-register-${className}-${term.name}.csv`.replace(/\s+/g, '-');
  a.click();
  URL.revokeObjectURL(url);
}
```

**Limitation:** CSV cannot represent merged cells or multi-row headers. The 5-row header hierarchy must be flattened, reducing structural fidelity compared to the PDF or XLSX formats.

### 18.3 XLSX export

XLSX supports merged cells, multi-row headers, borders, and column widths — enabling a close structural match to the spreadsheet mockup. The recommended library is **SheetJS** (`xlsx`), MIT-licensed and widely used.

**Package to install:**
```bash
npm install xlsx
```

**Key SheetJS concepts for this feature:**

```typescript
import * as XLSX from 'xlsx';

// Cell address encoding
const cell = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex }); // e.g. "A1"

// Writing a cell
ws[cell] = { t: 'n', v: 42 };      // number
ws[cell] = { t: 's', v: 'SEP' };   // string
ws[cell] = { t: 'z' };             // blank

// Merged cell ranges
ws['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // A1:D1 merged
  // ...
];

// Column widths
ws['!cols'] = [
  { wch: 6 },  // column A: ~6 character widths
  // ...
];
```

**Merge descriptors needed for the 5-row header (4-month term):**

| Merge | Covers | Content |
|---|---|---|
| A1:D1 | rows 0–0, cols 0–3 | "TOTAL ATTENDANCES (each month of term)" |
| E1:E5 | rows 0–4, col 4 | "TOTAL ATTENDANCES Carried Forward" |
| F1:Y1 | rows 0–0, cols 5–24 | "MONTHLY SUMMARIES FOR TERM ENDING {date}" |
| Z1:AA1 | rows 0–0, cols 25–26 | "TOTAL" |
| F2:F5 | rows 1–4, col 5 | "Date of Month" (month 1) |
| G2:J2 | rows 1–1, cols 6–9 | Month 1 name |
| G3:H3 | rows 2–2, cols 6–7 | "Males" |
| I3:J3 | rows 2–2, cols 8–9 | "Females" |
| G4:J4 | rows 3–3, cols 6–9 | "Session" |
| (repeat for months 2–4) | | |
| Z2:Z4 | rows 1–3, col 25 | (blank, under TOTAL) |
| AA2:AA4 | rows 1–3, col 26 | (blank, under TOTAL) |

(Row and column indices are 0-based in SheetJS.)

### 18.4 Shared data layer

All three export formats (PDF, CSV, XLSX) consume the same `GridsheetPDFDayRow[]` array from `computeGridsheetPDF`. No additional Firestore reads are needed for export. The format choice is a rendering decision only.

**Suggested UI:** Expand the existing "Download PDF" button in the modal into a split button or dropdown with "Download PDF", "Download XLSX", and "Download CSV". All options are enabled only when `gridData` is loaded.

### 18.5 What needs to be built for XLSX/CSV

1. `computeGridsheetPDF` utility — already implemented and in use by the PDF modal
2. Install `xlsx` package (`npm install xlsx`)
3. `exportGridsheetCSV(rows, monthKeys, term, className)` function in `sms-system/src/lib/gridsheetExports.ts`
4. `exportGridsheetXLSX(rows, monthKeys, term, className)` function in the same file
5. Add XLSX and CSV download options to the PDF preview modal header

### 18.6 XLSX vs PDF trade-offs

| Criterion | PDF (`@react-pdf/renderer`) | XLSX (SheetJS) |
|---|---|---|
| Merged headers | Yes | Yes |
| Print on A3 | Yes (native) | Depends on printer software |
| Editable after export | No | Yes |
| Column width control | Yes | Yes |
| Offline analysis in Excel/Sheets | No | Yes |
| Bundle size impact | Already installed | ~1MB additional (xlsx) |
| Implementation complexity | Medium (React PDF components) | Medium (cell-by-cell writing + merges) |
