# Attendance Register Feature Specification

> **Purpose:** Authoritative reference for the Attendance Register feature. Records all design decisions, justifications, trade-offs, limitations, data models, Firebase rules, code templates, and implementation plan.
>
> **Date documented:** 2026-06-05
> **Branch:** `post-mvp-additions`
> **Status:** Planning complete — Phase 1 implementation pending. SubjectForm prerequisite met (`teacherIds`, `classIds`, `classScope` live in Firestore). `@react-pdf/renderer` installed.

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Prerequisite: Academic Calendar](#2-prerequisite-academic-calendar)
3. [General Attendance Register — Phase 1](#3-general-attendance-register--phase-1)
4. [Subject Attendance Register — Phase 2](#4-subject-attendance-register--phase-2)
5. [Sidebar and Navigation](#5-sidebar-and-navigation)
6. [Attendance Totals and Percentages](#6-attendance-totals-and-percentages)
7. [PDF Export](#7-pdf-export)
8. [Firestore Collections — Full Schema](#8-firestore-collections--full-schema)
9. [Firebase Security Rules](#9-firebase-security-rules)
10. [Code Templates](#10-code-templates)
11. [Implementation Order](#11-implementation-order)
12. [Deferred Items and Open Issues](#12-deferred-items-and-open-issues)
13. [Files and Routes](#13-files-and-routes)

---

## 1. Feature Overview

Two distinct attendance sub-features, each tracking a different scope of student presence:

| Sub-feature | Phase | Primary input roles | Scope |
| --- | --- | --- | --- |
| **General Attendance Register** | 1 — implement now | `senior_teacher`, `institution_admin` | Student presence at the institution — AM and PM sessions daily |
| **Subject Attendance Register** | 2 — deferred | `regular_teacher`, `institution_admin` | Student presence in a specific subject's class/session |

Both share: five attendance states (P/A/L/S/E), the same color scheme, the same localStorage-draft → explicit-Save → Firestore flow, the same totals calculation model, PDF export with scope selector, and retroactive editing limited to the current term.

Both depend on the **Academic Calendar** prerequisite: term boundaries, school week configuration, and non-school day tracking.

**Multi-institutional design intent:** This project is intended to be pitched to numerous academic institutions. All calendar and schedule configuration is strictly per-institution. Public holiday defaults are Jamaican (hardcoded for Phase 1; multi-country support deferred — see §12.2).

**Also captured in this session:** The feedback preset comment list is updated from 15 to 20 options. The 20 options come from the Key to Comments in `sms-system/internal/predetermined-feedback-comment-options.png`. Update `POST_MVP_ADDITIONS_SPEC.md` item 12 when implementing that feature.

---

## 2. Prerequisite: Academic Calendar

### 2.1 What

A dedicated page at `/academic-calendar`, accessible only to `institution_admin`, for configuring:
- Academic years (auto-generated annually; institution_admin confirms before activating)
- Three terms per year with default names and editable dates
- School week (which days are instructional; default Mon–Fri)
- Jamaican public holidays — shown as defaults; institution_admin must explicitly confirm which apply
- Institution-specific non-school days — individual dates and/or date ranges

### 2.2 Why a prerequisite

The attendance register needs term boundaries to:
- Compute total expected sessions (the denominator for attendance percentages)
- Enforce "current term only" retroactive editing
- Scope totals calculations to a term or full academic year
- Determine which dates are valid school days (weekends, holidays, and closures are non-inputtable)

Without this data none of the calculations are computable.

**The register page must not be accessible (or must show a "calendar not configured" state) when no active academic year exists for the institution.**

### 2.3 First-time setup — guided flow

On the first visit to `/academic-calendar` when no academic year exists, the page presents a sequential guided flow rather than a bare form. A wizard is used because this is a one-time critical configuration — skipping any step would break attendance calculations silently.

**Steps:**
1. **Year dates** — Input academic year start and end dates (e.g., 1 Sep 2025 – 31 Aug 2026)
2. **Term names and dates** — Three terms shown with default names (Christmas, Easter, Summer); institution_admin confirms or edits each term's name, start date, and end date
3. **School week** — Checkboxes for Mon–Sat; Mon–Fri checked by default; institution must have at least one day selected
4. **Public holidays** — All Jamaican defaults for the year are listed with their dates; each has a checkbox; institution_admin must interact with (check or uncheck) each holiday before proceeding — none are auto-applied
5. **Non-school days** — Optional step; add individual dates or date ranges with a reason label (max 100 chars)
6. **Review and confirm** — Summary of all configured data; "Confirm and Activate" sets `status: 'active'` on the academic year and all three terms

**Why step 4 requires explicit interaction:** Different institutions observe different public holidays (some private schools remain open on minor holidays). Silent auto-application would produce incorrect attendance denominators for institutions that don't observe every Jamaican public holiday.

### 2.4 Auto-generation and confirmation for subsequent years

When the active academic year's `endDate` passes, the next visit to `/academic-calendar` (or the institution_admin dashboard) triggers a client-side check: does a draft for the next year exist? If not, create one using:
- `startDate` = previous year's `startDate` + 1 year
- `endDate` = previous year's `endDate` + 1 year
- Term names copied from previous year
- School week days copied from previous year
- Public holidays re-computed for the new year's dates (Easter shifts every year; fixed-date holidays are stable)
- `status: 'draft'`

**Notification:** A confirmation card (`PendingAcademicYearCard`) appears on the `institution_admin` dashboard. A dot/badge appears on the "Academic Calendar" sidebar item. The card links to `/academic-calendar` where the draft year can be reviewed and confirmed.

**Confirmation:** institution_admin reviews the pre-filled data (especially public holidays — Easter date changes each year), edits anything that differs, and clicks "Confirm and Activate." This sets the new year's `status: 'active'` and marks the previous year as `'completed'`.

**Why require confirmation rather than auto-activating?** Variable-date holidays (Easter, Ash Wednesday, Good Friday) shift each year. Auto-activating with the previous year's dates would silently corrupt the new year's denominator. Institution_admin review is a mandatory checkpoint.

**Client-side generation limitation:** Without Cloud Functions, the draft is generated when the institution_admin (or their session) is active after the year-end date. If no one logs in promptly, the draft doesn't exist yet. This is acceptable — the previous year's completed data is preserved, and the register simply shows "no active term" until the new year is confirmed.

### 2.5 Term structure

| Term | Default name | Default month range |
| --- | --- | --- |
| 1 | Christmas Term | September – December |
| 2 | Easter Term | January – April |
| 3 | Summer Term | May – August |

Institution_admin sets exact start and end dates. Term names can be set to any free-text label. The `defaultName` field is stored separately for a "Reset to default" option. The `status` field (`upcoming` / `active` / `completed`) is derived client-side from dates — a term whose `startDate` ≤ today ≤ `endDate` is active.

**Multi-year offset:** For academic year 2025–2026: Christmas Term runs Sep–Dec 2025; Easter Term runs Jan–Apr 2026; Summer Term runs May–Aug 2026. All three terms' `startDate`/`endDate` are the sole authoritative source for all calculations — term number and name are display-only.

### 2.6 Jamaican public holidays

Fixed-date holidays:

| Holiday | Date |
| --- | --- |
| New Year's Day | January 1 |
| National Labour Day | May 23 |
| Emancipation Day | August 1 |
| Independence Day | August 6 |
| Christmas Day | December 25 |
| Boxing Day | December 26 |

Variable-date holidays (computed from Easter Sunday via the Anonymous Gregorian / Meeus–Jones–Butcher algorithm):

| Holiday | Offset |
| --- | --- |
| Ash Wednesday | Easter Sunday − 46 days |
| Good Friday | Easter Sunday − 2 days |
| Easter Monday | Easter Sunday + 1 day |

National Heroes Day: 3rd Monday of October.

See §10.1 for the `computeEaster` and `getJamaicanPublicHolidays` utility.

### 2.7 Institution-specific non-school days

Beyond public holidays, institution_admin can add arbitrary closures — for example, days immediately before or after a public holiday. Both formats are supported:
- **Single date:** "24 December 2025 — Pre-Christmas closure"
- **Date range:** "22–24 December 2025 — End-of-term closure" (all dates inclusive)

Reason is free-text, max 100 characters. Non-school days can be deactivated without deletion (`isActive: false`) to handle provisional or cancelled closures.

### 2.8 Timezone

All time windows use **UTC-5 (Jamaica Standard Time)**. Jamaica does not observe Daylight Saving Time — UTC-5 is constant year-round. No DST edge cases exist.

All Firestore timestamps are stored as UTC. The client applies a fixed −5 hour offset for display and window enforcement.

### 2.9 Limitations

- Draft year generation is client-side only — timing depends on institution_admin logging in after the year ends.
- The guided setup flow is not re-enterable mid-step without losing progress. Consider saving step state to `localStorage` under a key like `acal_setup_{institutionId}` to allow resuming.
- If institution_admin creates the academic year after the school year has already started (late setup), historical attendance for dates before the setup date cannot be back-filled through the wizard. Retroactive register entry can still be made for those dates within the current term once the year is configured.

---

## 3. General Attendance Register — Phase 1

### 3.1 What

A weekly attendance grid, per homeroom class, recording student presence at the institution for each AM and PM session of each school day. Visual layout loosely follows `sms-system/internal/general-attendance-register-blank.png`.

### 3.2 Roles and permissions

| Role | Can input | Can view |
| --- | --- | --- |
| `senior_teacher` | Their assigned homeroom class only | Their assigned homeroom class only |
| `institution_admin` | Any class, any time (no time-window restriction) | Any class |
| `super_admin` | None | Any class (read-only oversight) |
| `regular_teacher` | None | None — no General Register in sidebar |
| `student` | None | Their own attendance row only |
| `parent` | None | Linked child/children's attendance only |

**Why `regular_teacher` cannot view General Attendance:** Regular teachers have no homeroom responsibility. Their attendance needs are covered by the Subject Register. Showing them the General Register adds noise with no utility.

**institution_admin bypass of time windows:** An institution_admin acting as a stand-in for an unassigned or absent senior_teacher must be able to input at any time. Restricting institution_admin to AM/PM windows would create operational deadlock.

### 3.3 Senior_teacher homeroom assignment

A `senior_teacher` is responsible for exactly one homeroom class. Assignment is stored on the teacher's `users/{uid}` Firestore document:

```typescript
assignedClassId: string | null;    // null = unassigned
assignedClassName: string | null;  // denormalized; null when assignedClassId is null
```

**Create-user change:** The create-user form for `senior_teacher` type gains an optional "Homeroom Class" dropdown. It is **optional** — not required — to avoid blocking Firestore saves when the assignment is pending bureaucratic confirmation. An unassigned senior_teacher cannot access the General Register (the page shows a "No class assigned" informational state).

**Retroactive assignment:** institution_admin can assign or reassign a senior_teacher's homeroom class at any time. Assignment changes do not affect historical attendance documents (those are keyed to `classId`, not `teacherId`).

**One teacher per class:** The assignment is 1:1. The create-user / management UI should prevent assigning two senior_teachers to the same class.

**No class assigned, no senior_teacher:** If a class has no assigned senior_teacher, only `institution_admin` can fill in that class's register. The register is not blocked — institution_admin can always create and fill it.

### 3.4 Time windows (UTC-5)

| Session | Window |
| --- | --- |
| AM | 08:00 – 10:00 JST |
| PM | 12:00 – 14:00 JST |

**What "required" means in practice:**
- The system does **not** block input outside the window.
- If a window closes without a Firestore save for a given class+date+session, that slot is flagged as **overdue**.
- Overdue slots remain editable retroactively until the end of the current term.
- A banner on the senior_teacher's dashboard notifies them of each overdue slot.
- A minor badge/count on the institution_admin's dashboard shows the number of overdue slots across all classes for today.
- No emails are sent — in-app notification only (Cloud Functions not required).

### 3.5 Attendance states

| Code | Label | Counts toward |
| --- | --- | --- |
| P | Present | Present |
| L | Late | Present |
| A | Absent | Absent |
| S | Sick | Absent |
| E | Excused | Absent |

**Why L counts as Present:** A late student is physically at the institution. Attendance rate measures physical presence, not punctuality. Late is separately counted for reporting.

**Why S and E count as Absent:** Both represent non-presence. The distinction allows reporting nuance (illness patterns vs. unexplained absence vs. authorised absence) without changing the attendance rate formula.

**Why no Suspended state:** A planned Disciplinary Action feature (separate from this spec) will track suspensions. A suspended student is marked A (Absent) in the attendance register while the disciplinary record captures the reason.

**Excused reason field:** When a cell is set to E, an inline popover appears with an optional free-text reason input (max 50 characters). The reason is stored on the attendance record. Saving E without a reason is valid.

### 3.6 Color scheme

| State | Color | Tailwind approximation |
| --- | --- | --- |
| P — Present | Green | `bg-green-500 text-white` |
| A — Absent | Red | `bg-red-500 text-white` |
| L — Late | Orange | `bg-orange-400 text-white` |
| E — Excused | Blue | `bg-blue-500 text-white` |
| S — Sick | Purple | `bg-purple-500 text-white` |
| Empty (no entry) | Grey dashed | `bg-gray-100 border-2 border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-600` |

**Distinctiveness requirement:** Orange (L) must be a clearly different hue from Red (A) — not a darker shade of the same hue. Purple (S) must be clearly distinct from Blue (E). Verify contrast in both light and dark mode before shipping.

**Post-first-failed-save highlight:** After the first save attempt with empty cells (the snackbar warning fires), empty cells should temporarily gain a more prominent highlight (e.g., `border-red-400` ring) to draw the teacher's attention before the ring clears after Save or navigation.

### 3.7 Weekly grid view and navigation

The register page displays one week at a time. Layout:

- **Rows:** Students in the class, sorted alphabetically by surname
- **Columns:** One column group per school day in the week — day name + date header, then AM sub-column and PM sub-column
- **Navigation:** Left/right arrows to move week-by-week; constrained to the current term (cannot navigate before term start or after the current week)
- **Non-school days:** Column cells are visually disabled (greyed out, no interaction)
- **Future dates within the current week:** Disabled — no input allowed for days that have not yet occurred
- **Default on load:** Current week

**Why no future-week navigation:** Attendance for dates that have not occurred is meaningless and could create false "overdue" flags.

**Why week-based (not term-at-once):** The reference image uses week navigation. A full-term view for a 13-week term with 5 days × 2 sessions = 130 columns would require excessive horizontal scrolling and be unusable.

### 3.8 Save flow and localStorage draft

**Draft (localStorage):**

Each cell click immediately writes to localStorage:
- Key: `attendance_draft_{institutionId}_{classId}_{YYYY-MM-DD}_{AM|PM}`
- Value: `{ [studentId]: { state: 'P'|'A'|'L'|'S'|'E', reason?: string } }`

On page load, existing localStorage draft for the viewed session is restored into the UI automatically.

**Why localStorage (not sessionStorage):** sessionStorage clears when the browser tab is closed. A teacher filling in the AM register before 10:00 who closes their laptop risks losing the draft. localStorage persists until explicitly cleared. The key is specific enough (class + date + session) to prevent collisions.

**Draft expiry:** On dashboard mount, a cleanup routine (`purgeExpiredDrafts`) removes any localStorage keys with the `attendance_draft_` prefix where the date in the key predates the current term's start. See §10.3.

**Explicit Save → Firestore flow:**

```
Save clicked
    │
    ├─ Empty cells? No → Save to Firestore immediately
    │                    Clear localStorage draft
    │                    Show success toast → done
    │
    └─ Empty cells? Yes + First attempt
           │
           ├─ Show timed snackbar: "X student(s) have no attendance recorded.
           │   Save again to confirm." (auto-dismisses ~5 s)
           │   Mark saveAttempted = true
           │   Visually highlight empty cells (border-red-400 ring)
           │   Do NOT write to Firestore
           │
           └─ Save clicked again (saveAttempted = true, cells still empty)
                  │
                  └─ Show confirmation dialog:
                     "X student(s) still have no attendance state. These sessions
                      will not be counted in any attendance total. Save anyway?"
                     [Confirm Save]  [Cancel]
                          │
                    Confirm → Save to Firestore (records only students with a state)
                              Clear localStorage draft
                              Show success toast
                              saveAttempted = false
```

**What gets written for empty cells:** Students with no state in the draft are simply absent from the `records` map in Firestore. They are not given a default state. The totals calculation treats missing records as unfilled sessions, not as Absent.

### 3.9 Overdue detection and alerts

**Overdue definition:** A session slot (classId + date + session) is overdue when:
1. The window has closed (after 10:00 AM for AM; after 14:00 for PM, UTC-5), AND
2. No `generalAttendance` document exists with a `submittedAt` value for that slot.

**No server-side scheduler:** Overdue status is computed client-side when the dashboard loads. No Cloud Functions are involved.

**Senior_teacher dashboard alert:** On mount, query `generalAttendance` for today's AM and PM documents for the teacher's homeroom class. For each window that has closed, if the document is absent or has no `submittedAt` → show a banner: _"[Session] register for [Class Name] was not submitted. You can still submit it retroactively."_

**Institution_admin minor indicator:** On mount, query `generalAttendance` for today across all classes in the institution. Count slots where the window has closed and `submittedAt` is missing. Show a subtle count badge on a dashboard card: _"3 register slots overdue today."_ This is intentionally minor — a full alert list would be disruptive for large institutions.

**Clearing overdue:** When a retroactive save writes `submittedAt`, the next dashboard load finds the document and the alert no longer fires.

**Limitation:** Detection only runs when a user loads the page. No push or background notification occurs.

### 3.10 Retroactive editing

- Allowed within the **current active term only**.
- Once a term's `endDate` passes, all register data for that term is read-only in the UI (no edit controls rendered).
- Past terms are displayed as read-only history.
- **institution_admin** retroactive edits: no time-window restriction.
- **senior_teacher** retroactive edits: not restricted to the AM/PM windows — can fill in a missed slot at any point during the term, even days later.

**Why allow senior_teacher retroactive edits outside the window?** A teacher may be absent for a day. The overdue flag records the missed window. The teacher (or a substitute) can backfill the record retroactively to preserve accurate historical data. Blocking retroactive edits entirely would force institution_admin to fill in all missed registers themselves.

### 3.11 Limitations and trade-offs

**Student/parent read privacy:** Firestore rules cannot filter within a document's map field. The `generalAttendance` document contains all students' records for a class. To allow a student to read only their own row:
- Option A (chosen): Allow the student to read the entire class document; filter to their own row client-side.
- Option B (not chosen): Store each student's record as a separate document — granular rules but N writes per save.

Option A is chosen for write simplicity. For a school setting, classmates knowing each other's attendance status is low risk. This is a **known and accepted limitation** — document it if privacy requirements tighten later.

**Parent rule simplification:** Firestore rules cannot verify that a parent's linked child is in a specific class without a multi-document join (not supported by the rule engine). The rule allows parents to read any `generalAttendance` document in their institution; the client filters to show only linked children's data. Same limitation as student privacy above.

**localStorage multi-tab conflict:** Two browser tabs open to the same session write to the same localStorage key; the last write wins. This is an edge case for most teachers and is not worth the complexity of a distributed lock.

---

## 4. Subject Attendance Register — Phase 2

### 4.1 What

A per-subject attendance register where `regular_teacher` records student presence for each occurrence of their subject's class. Unlike General Attendance (institution-wide, twice daily), Subject Attendance is subject-specific and tracks individual class sessions (which may be weekly, fortnightly, or custom frequency).

### 4.2 Why deferred

Subject Attendance remains deferred because three prerequisites are still incomplete:

1. **`frequency` and `sessionDayOfWeek` on subject documents** — SubjectForm is deployed and writes `teacherIds`, `classIds`, and `classScope` to Firestore, but `frequency` and `sessionDayOfWeek` have not yet been added to SubjectForm or the `SubjectDocument` type. These fields are needed to determine when a "required update" is expected.
2. **`subjectEnrollments` collection** — the per-subject per-class enrollment model (§4.4) does not yet exist in Firestore.
3. **Subject Register page** — the `/attendance/subject` page is a Phase 1 placeholder only.

`teacherIds` and `classIds` now exist on live subject documents. The `subjectAttendance` Firestore rules (§9.5) are safe to deploy — `teacherIds` is present — but should not be deployed until the Subject Register page ships.

### 4.3 Roles and permissions

| Role | Can input | Can view |
| --- | --- | --- |
| `regular_teacher` | Their assigned subjects only | Their assigned subjects only |
| `institution_admin` | Any subject | Any subject |
| `super_admin` | None | Any subject (read-only) |
| `senior_teacher` | None | None |
| `student` | None | Their own subject attendance only |
| `parent` | None | Linked child/children's subject attendance only |

### 4.4 Student enrollment model

Subject enrollment is **class-based with individual exclusions**, to support scenarios where a mixed-gender class has subjects that only a subset of students take (e.g., only female students enroll in Home Economics; only male students enroll in Technical Drawing).

For each subject + class pairing, a `subjectEnrollments` document stores:

```typescript
enrollmentType: 'all' | 'selective'
excludedStudentIds: string[]   // UIDs; empty when enrollmentType === 'all'
excludedStudentNames: string[] // denormalized; parallel to excludedStudentIds
```

**UI in SubjectForm (Phase 2):**
- Checkbox: "All students in this class are enrolled" — checked by default
- If unchecked: a checklist of the class's students appears; unchecking a student adds them to `excludedStudentIds`

**Why exclusion model (not inclusion model)?** In most cases, the majority of a class takes a given subject. Storing the minority exclusion list is more efficient and requires less clicking than building an inclusion list from scratch.

**Multi-class subjects:** If a subject spans multiple classes, each class has its own `subjectEnrollments` document. Enrollment type and exclusions are configured independently per class.

**Institution-wide subjects (`classScope: 'institution'`):** For subjects applying to all students in the institution, the enrollment model defaults to `'all'` for every class. Per-class exclusions are still possible but the UI for managing them across the entire institution is complex — defer the UI design to the SubjectForm branch.

**Enrollment changes mid-term:** If a student joins or leaves a subject mid-term, historical `subjectAttendance` records are preserved as-is. Future register entries will exclude the departed student automatically (they're no longer in the enrolled set). No back-fill occurs.

### 4.5 Session frequency

How often a subject meets determines when a `regular_teacher` is expected to update the Subject Register.

Fields to be added to `subjects/{id}` via SubjectForm:

```typescript
frequency: 'weekly' | 'fortnightly' | 'custom';
customFrequencyDays?: number;   // only when frequency === 'custom'
sessionDayOfWeek?: number;      // 1–5 (Mon–Fri); the day the subject typically meets
```

Default: `'weekly'`. The required-update enforcement logic uses `frequency` + `sessionDayOfWeek` to compute when a session is expected and therefore when a missing save becomes overdue.

**Deferral note:** The full overdue-enforcement logic for Subject Attendance (which depends on `frequency` and `sessionDayOfWeek`) is deferred to Phase 2. For the Phase 1 placeholder page, show an informational message. See §5.5.

### 4.6 Data model

See §8.5 and §8.6 for the full `subjectAttendance` and `subjectEnrollments` collection schemas.

### 4.7 Limitations

- **Partially blocked:** `teacherIds` and `classIds` now exist in Firestore (SubjectForm is deployed). `frequency` and `sessionDayOfWeek` do not yet exist — Phase 2 SubjectForm additions are still pending. The Subject Register page in Phase 1 is a placeholder only.
- **`subjectAttendance` Firestore rules:** `teacherIds` is now live, so the rules in §9.5 are safe to deploy. Hold deployment until the Subject Register page ships in Phase 2.

---

## 5. Sidebar and Navigation

### 5.1 Sidebar entries by role

| Role | Attendance sidebar entries |
| --- | --- |
| `institution_admin` | Academic Calendar · General Register · Subject Register |
| `senior_teacher` | General Register |
| `regular_teacher` | Subject Register |
| `super_admin` | General Register · Subject Register |
| `student` | My Attendance |
| `parent` | Attendance |

A new top-level "ATTENDANCE" section is added to `Menu.tsx`, below the existing list-item sections. All role-specific entries live under this header.

### 5.2 Routes

| Route | Component | Access |
| --- | --- | --- |
| `/academic-calendar` | `AcademicCalendarPage` | `institution_admin` |
| `/attendance/general` | `GeneralAttendanceRegisterPage` | `institution_admin`, `senior_teacher`, `super_admin` |
| `/attendance/subject` | `SubjectAttendanceRegisterPage` | `institution_admin`, `regular_teacher`, `super_admin` |
| `/attendance/my` | `MyAttendancePage` | `student` |
| `/attendance/child` | `ChildAttendancePage` | `parent` |

### 5.3 Student view — `/attendance/my`

Tabbed layout:
- **Tab 1: General Attendance** — The student's own attendance row across the current term; date-range view (not week-by-week); shows state per session with state counts and attendance rate at the bottom.
- **Tab 2: Subject Attendance** — Phase 2; placeholder in Phase 1 ("Subject attendance is not yet available").

Data: Fetch `generalAttendance` documents for the student's `classId` within the active term. Extract only `records[uid]` from each document. Display client-side filtered data only.

### 5.4 Parent view — `/attendance/child`

If the parent has multiple linked children, a child selector (dropdown or tab strip) appears first; otherwise the single child's attendance is displayed directly.

Structure per child mirrors the student view: General + Subject tabs.

### 5.5 Subject Register placeholder (Phase 1)

For `regular_teacher` and `super_admin` visiting `/attendance/subject` before Phase 2 ships:

```tsx
<p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">
  Subject Attendance is not yet available. Your institution admin needs to
  configure subject assignments before this feature becomes active.
</p>
```

For `institution_admin`, the same placeholder is shown with an additional note:
_"Subject Attendance is a Phase 2 feature and has not yet been implemented."_

---

## 6. Attendance Totals and Percentages

### 6.1 Attendance rate formula

```
Attendance Rate = (P + L) / Total Expected Sessions × 100
```

**Rationale:** P (Present) and L (Late) both represent physical presence at the institution or in the subject class. A (Absent), S (Sick), and E (Excused) all represent non-presence regardless of reason. The rate reflects physical presence, not punctuality or excuse validity.

### 6.2 Per-state percentages

For each state X:
```
X% = X count / Total Expected Sessions × 100
```

All five state percentages sum to 100% **only if every expected session has a recorded state.** If some sessions were never filled in (overdue and not retroactively updated), the percentages will sum to less than 100%. The UI must display this explicitly: e.g., _"90 of 130 sessions recorded"_ alongside the percentages.

### 6.3 Total expected sessions (denominator)

```
Total Expected Sessions =
  count of calendar days in the period
  that match the institution's schoolWeekDays
  AND are not in nonSchoolDays (single dates or within ranges, isActive = true)
  AND are not Jamaican public holidays that institution_admin confirmed for this institution
  × sessions per day (2 for General Attendance; 1 per subject class occurrence for Subject Attendance)
```

This is computed client-side from academic calendar data. It is not stored in Firestore.

### 6.4 Totals display (summary row)

Shown at the bottom of the register grid and on the student/parent view pages:

| Student | P | A | L | S | E | Sessions | Rate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bailey, Reona | 45 | 3 | 2 | 0 | 0 | 50/130 | 90.0% |

Where:
- "Sessions" = recorded sessions / total expected sessions
- "Rate" = (P + L) / total expected sessions × 100

### 6.5 Computed on-the-fly vs. stored summaries

**Phase 1: compute on the fly.** Fetch all `generalAttendance` documents for the class + term, aggregate per student. For a 13-week term: ~130 documents per class. This is manageable client-side.

**Future `attendanceSummaries` collection (deferred):** When the report card feature is built, pre-computed per-student per-term summaries eliminate re-aggregation on every report card render. An `attendanceSummaries/{studentId}_{termId}` document, updated after each register save, is the recommended pattern. Defer to the report card implementation branch.

---

## 7. PDF Export

### 7.1 Scope selector

Before downloading, a modal prompts the user to select one of three scopes:

| Scope | Content |
| --- | --- |
| **Current week** | The weekly grid currently on screen |
| **Full term** | All weeks in the current term for the selected class/subject — may span multiple pages |
| **Summary** | One row per student; total counts per state + attendance rate; no week-by-week grid |

### 7.2 Library

**`@react-pdf/renderer`** — declarative JSX-based PDF generation; better suited to table/grid layouts than `jsPDF`'s imperative canvas API. Already installed (`^4.5.1`).

### 7.3 PDF structure

**Header (all scopes):**
- Institution name
- Class name (General) or Subject name + Teacher name (Subject)
- Academic year name + term name
- Date range of the exported data
- Export timestamp

**Current week / Full term scope:**
- Grid table: Student name | [Day AM | Day PM] per school day | Per-state totals
- Color-filled cells matching the UI color scheme
- Non-school day columns: greyed out
- Multi-page for full term

**Summary scope:**
- Table: Student name | P | A | L | S | E | Sessions | Rate%
- Typically fits one page for most class sizes

**Footer:** Page number · "Generated by School Management System"

**Dark mode:** PDF is always generated in light mode regardless of the user's current UI theme.

---

## 8. Firestore Collections — Full Schema

### 8.1 `academicYears/{yearId}`

```typescript
interface AcademicYearDocument {
  id: string;             // e.g., "{institutionId}_2025-2026"
  institutionId: string;
  name: string;           // "2025-2026"
  startDate: Timestamp;
  endDate: Timestamp;
  status: 'draft' | 'active' | 'completed';
  schoolWeekDays: number[]; // [1,2,3,4,5] — Mon=1 … Sat=6; Sun=0
  createdAt: Timestamp;
  confirmedAt?: Timestamp;
  confirmedBy?: string;   // uid of confirming institution_admin
}
```

### 8.2 `terms/{termId}`

```typescript
interface TermDocument {
  id: string;                       // e.g., "{institutionId}_2025-2026_1"
  institutionId: string;
  academicYearId: string;
  termNumber: 1 | 2 | 3;
  name: string;                     // editable; defaults to defaultName
  defaultName: string;              // "Christmas Term" — read-only, for reset
  startDate: Timestamp;
  endDate: Timestamp;
  status: 'upcoming' | 'active' | 'completed'; // derived client-side, not stored
}
```

### 8.3 `nonSchoolDays/{id}`

```typescript
interface NonSchoolDayDocument {
  id: string;
  institutionId: string;
  academicYearId: string;
  type: 'single' | 'range';
  date?: Timestamp;       // when type === 'single'
  startDate?: Timestamp;  // when type === 'range'
  endDate?: Timestamp;    // when type === 'range'
  reason: string;         // max 100 chars
  source: 'public_holiday' | 'institution_specific';
  isActive: boolean;
  createdAt: Timestamp;
}
```

### 8.4 `generalAttendance/{id}`

One document per class + date + session.

```typescript
interface GeneralAttendanceDocument {
  id: string;             // Firestore auto-ID
  institutionId: string;
  classId: string;
  className: string;      // denormalized at save time
  termId: string;
  academicYearId: string;
  date: string;           // ISO "YYYY-MM-DD" — avoids Timestamp timezone ambiguity
  session: 'AM' | 'PM';
  records: {
    [studentId: string]: {
      state: 'P' | 'A' | 'L' | 'S' | 'E';
      reason?: string;    // max 50 chars; present only for E state
      studentName: string; // denormalized at save time
    };
  };
  submittedBy: string;    // uid of last saver
  submittedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Why ISO date string instead of Timestamp for `date`?** Timestamp-based range queries (`where('date', '>=', ...)`) require careful UTC handling and vary with client timezone. ISO string comparisons (`'2025-09-15' >= '2025-09-01'`) are lexicographically correct for YYYY-MM-DD format and have no timezone ambiguity.

**Document size:** For a class of 40 students, each record is ~100–150 bytes (state + optional 50-char reason + ~20-char name). Max ≈ 6 KB — well within Firestore's 1 MB document limit.

**Composite index required:** `(institutionId, classId, date, session)` — needed for the overdue detection query.

### 8.5 `subjectAttendance/{id}` — Phase 2

One document per subject + class + session date.

```typescript
interface SubjectAttendanceDocument {
  id: string;
  institutionId: string;
  subjectId: string;
  subjectName: string;     // denormalized
  classId: string;         // for multi-class subjects: one document per class per session
  teacherId: string;       // uid of submitting teacher
  termId: string;
  academicYearId: string;
  sessionDate: string;     // ISO "YYYY-MM-DD"
  records: {
    [studentId: string]: {
      state: 'P' | 'A' | 'L' | 'S' | 'E';
      reason?: string;
      studentName: string;
    };
  };
  submittedBy: string;
  submittedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 8.6 `subjectEnrollments/{id}` — Phase 2

One document per subject + class pairing.

```typescript
interface SubjectEnrollmentDocument {
  id: string;                       // e.g., "{subjectId}_{classId}"
  institutionId: string;
  subjectId: string;
  subjectName: string;              // denormalized
  classId: string;
  className: string;                // denormalized
  enrollmentType: 'all' | 'selective';
  excludedStudentIds: string[];     // UIDs; empty when type === 'all'
  excludedStudentNames: string[];   // parallel array; denormalized
  updatedAt: Timestamp;
  updatedBy: string;                // uid
}
```

### 8.7 `users/{uid}` — additions for `senior_teacher`

Two new optional fields added to `senior_teacher` user documents only:

```typescript
assignedClassId: string | null;    // homeroom class UID; null = unassigned
assignedClassName: string | null;  // denormalized; null when unassigned
```

No migration required — existing `senior_teacher` documents simply lack these fields and are treated as `null` (unassigned).

---

## 9. Firebase Security Rules

These rules are additive to the existing ruleset. Helper functions (`callerRole`, `callerInstitutionId`, `isInstitutionMember`) are assumed to already exist in the project's rules. Do not duplicate them.

### 9.1 `academicYears`

```javascript
match /academicYears/{yearId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId);

  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );
}
```

### 9.2 `terms`

```javascript
match /terms/{termId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId);

  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );
}
```

### 9.3 `nonSchoolDays`

```javascript
match /nonSchoolDays/{dayId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId);

  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );
}
```

### 9.4 `generalAttendance`

```javascript
match /generalAttendance/{docId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || callerRole() == 'super_admin'
      || callerRole() == 'senior_teacher'
      || (
        // student: may read documents for their own class; client filters to own row
        callerRole() == 'student'
        && get(/databases/$(database)/documents/users/$(request.auth.uid))
             .data.classId == resource.data.classId
      )
      || (
        // parent: allowed to read any document in their institution;
        // client-side filters to linked children only.
        // Rules cannot join across collections to verify the child-class link.
        callerRole() == 'parent'
      )
    );

  allow create, update: if request.auth != null
    && isInstitutionMember(request.resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || (
        callerRole() == 'senior_teacher'
        && get(/databases/$(database)/documents/users/$(request.auth.uid))
             .data.assignedClassId == request.resource.data.classId
      )
    );

  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

**Parent rule caveat:** Allowing parents to read any `generalAttendance` document in their institution is a rule-engine limitation workaround (rules cannot perform multi-collection joins). The client enforces the privacy boundary. This is a known accepted trade-off.

### 9.5 `subjectAttendance` — Phase 2

```javascript
match /subjectAttendance/{docId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || callerRole() == 'super_admin'
      || (
        callerRole() == 'regular_teacher'
        && request.auth.uid in get(
             /databases/$(database)/documents/subjects/$(resource.data.subjectId)
           ).data.teacherIds
      )
      || callerRole() == 'student'  // client-side filtered to own records
      || callerRole() == 'parent'   // client-side filtered to linked children
    );

  allow create, update: if request.auth != null
    && isInstitutionMember(request.resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || (
        callerRole() == 'regular_teacher'
        && request.auth.uid == request.resource.data.teacherId
        && request.auth.uid in get(
             /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
           ).data.teacherIds
      )
    );

  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

### 9.6 `subjectEnrollments` — Phase 2

```javascript
match /subjectEnrollments/{enrollId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId);

  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );
}
```

---

## 10. Code Templates

### 10.1 Jamaican public holidays utility

```typescript
// src/lib/holidays.ts

export interface PublicHoliday {
  name: string;
  date: Date;
  source: 'public_holiday';
}

/** Easter Sunday via the Anonymous Gregorian (Meeus–Jones–Butcher) algorithm. */
export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function nthMonday(year: number, month: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const dow = first.getDay(); // 0 = Sun
  const firstMonday = dow === 1 ? 1 : (8 - dow) % 7 + 1;
  return new Date(year, month - 1, firstMonday + (n - 1) * 7);
}

/** All Jamaican public holidays for a given calendar year. */
export function getJamaicanPublicHolidays(year: number): PublicHoliday[] {
  const easter = computeEaster(year);
  return [
    { name: "New Year's Day",    date: new Date(year, 0,  1),       source: 'public_holiday' },
    { name: 'Ash Wednesday',     date: addDays(easter, -46),        source: 'public_holiday' },
    { name: 'Good Friday',       date: addDays(easter, -2),         source: 'public_holiday' },
    { name: 'Easter Monday',     date: addDays(easter, 1),          source: 'public_holiday' },
    { name: 'National Labour Day', date: new Date(year, 4, 23),    source: 'public_holiday' },
    { name: 'Emancipation Day',  date: new Date(year, 7,  1),       source: 'public_holiday' },
    { name: 'Independence Day',  date: new Date(year, 7,  6),       source: 'public_holiday' },
    { name: 'National Heroes Day', date: nthMonday(year, 10, 3),   source: 'public_holiday' },
    { name: 'Christmas Day',     date: new Date(year, 11, 25),      source: 'public_holiday' },
    { name: 'Boxing Day',        date: new Date(year, 11, 26),      source: 'public_holiday' },
  ];
}
```

### 10.2 Time window detection (UTC-5)

```typescript
// src/lib/attendanceWindows.ts

export type AttendanceSession = 'AM' | 'PM';

/** Converts a JS Date to Jamaica Standard Time (UTC-5, no DST). */
function toJST(date: Date): Date {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000);
}

function totalMinutesUTC(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

const WINDOWS = {
  AM: { open: 8 * 60, close: 10 * 60 },
  PM: { open: 12 * 60, close: 14 * 60 },
} as const;

export function isSessionWindowOpen(session: AttendanceSession, now = new Date()): boolean {
  const t = totalMinutesUTC(toJST(now));
  return t >= WINDOWS[session].open && t < WINDOWS[session].close;
}

export function isSessionWindowClosed(session: AttendanceSession, now = new Date()): boolean {
  return totalMinutesUTC(toJST(now)) >= WINDOWS[session].close;
}

/** Returns the currently open session, or null if outside all windows. */
export function currentOpenSession(now = new Date()): AttendanceSession | null {
  if (isSessionWindowOpen('AM', now)) return 'AM';
  if (isSessionWindowOpen('PM', now)) return 'PM';
  return null;
}
```

### 10.3 localStorage draft utilities

```typescript
// src/lib/attendanceDraft.ts

import type { AttendanceSession } from './attendanceWindows';

export interface DraftRecord {
  state: 'P' | 'A' | 'L' | 'S' | 'E';
  reason?: string; // E state only; max 50 chars
}

type DraftMap = Record<string, DraftRecord>; // keyed by studentId

const PREFIX = 'attendance_draft_';

function key(institutionId: string, classId: string, date: string, session: AttendanceSession) {
  return `${PREFIX}${institutionId}_${classId}_${date}_${session}`;
}

export function getDraft(
  institutionId: string, classId: string, date: string, session: AttendanceSession,
): DraftMap {
  try {
    const raw = localStorage.getItem(key(institutionId, classId, date, session));
    return raw ? (JSON.parse(raw) as DraftMap) : {};
  } catch { return {}; }
}

export function setDraftCell(
  institutionId: string, classId: string, date: string,
  session: AttendanceSession, studentId: string, record: DraftRecord,
): void {
  const k = key(institutionId, classId, date, session);
  const current = getDraft(institutionId, classId, date, session);
  localStorage.setItem(k, JSON.stringify({ ...current, [studentId]: record }));
}

export function clearDraft(
  institutionId: string, classId: string, date: string, session: AttendanceSession,
): void {
  localStorage.removeItem(key(institutionId, classId, date, session));
}

/**
 * Removes stale drafts whose dates predate the current term start.
 * Call on dashboard or register page mount.
 */
export function purgeExpiredDrafts(termStartDate: string): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    // Key: attendance_draft_{instId}_{classId}_{YYYY-MM-DD}_{session}
    const parts = k.split('_');
    const datePart = parts[parts.length - 2]; // second-to-last segment
    if (datePart < termStartDate) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
```

### 10.4 School day checker

```typescript
// src/lib/attendanceCalendar.ts

import type { NonSchoolDayDocument } from '@/types/firestore';

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isNonSchoolDay(dateStr: string, days: NonSchoolDayDocument[]): boolean {
  return days.some((d) => {
    if (!d.isActive) return false;
    if (d.type === 'single' && d.date)
      return toISO(d.date.toDate()) === dateStr;
    if (d.type === 'range' && d.startDate && d.endDate)
      return dateStr >= toISO(d.startDate.toDate()) && dateStr <= toISO(d.endDate.toDate());
    return false;
  });
}

/** True when the date is a configured instructional day (school week day AND not a non-school day). */
export function isSchoolDay(
  dateStr: string,
  schoolWeekDays: number[],    // [1,2,3,4,5] = Mon–Fri
  nonSchoolDays: NonSchoolDayDocument[],
): boolean {
  const date = new Date(dateStr + 'T12:00:00Z');
  return schoolWeekDays.includes(date.getUTCDay()) && !isNonSchoolDay(dateStr, nonSchoolDays);
}

/** Counts all school days (and thus expected sessions) within a date range. */
export function countExpectedSessions(
  startISO: string,
  endISO: string,
  schoolWeekDays: number[],
  nonSchoolDays: NonSchoolDayDocument[],
  sessionsPerDay: number, // 2 for General Attendance; 1 for Subject Attendance
): number {
  let count = 0;
  const cursor = new Date(startISO + 'T12:00:00Z');
  const end    = new Date(endISO   + 'T12:00:00Z');
  while (cursor <= end) {
    if (isSchoolDay(toISO(cursor), schoolWeekDays, nonSchoolDays)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count * sessionsPerDay;
}
```

### 10.5 Attendance totals computation

```typescript
// src/lib/attendanceTotals.ts

export type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';

export interface AttendanceTotals {
  P: number; A: number; L: number; S: number; E: number;
  filledSessions: number;       // sessions where a state was recorded
  totalExpectedSessions: number;
  attendanceRate: number;       // (P + L) / totalExpectedSessions × 100
  statePercentages: Record<AttendanceState, number>;
}

export function computeAttendanceTotals(
  records: { state: AttendanceState }[],
  totalExpectedSessions: number,
): AttendanceTotals {
  const counts = { P: 0, A: 0, L: 0, S: 0, E: 0 };
  for (const r of records) counts[r.state]++;

  const safe = totalExpectedSessions > 0 ? totalExpectedSessions : 1;
  const attendanceRate = ((counts.P + counts.L) / safe) * 100;

  const statePercentages = Object.fromEntries(
    (Object.keys(counts) as AttendanceState[]).map((k) => [k, (counts[k] / safe) * 100]),
  ) as Record<AttendanceState, number>;

  return {
    ...counts,
    filledSessions: records.length,
    totalExpectedSessions,
    attendanceRate,
    statePercentages,
  };
}
```

### 10.6 `AttendanceStateButton` component

```tsx
// src/components/attendance/AttendanceStateButton.tsx

type State = 'P' | 'A' | 'L' | 'S' | 'E';

const CYCLE: State[] = ['P', 'A', 'L', 'S', 'E'];

const STATE_CLASS: Record<State, string> = {
  P: 'bg-green-500 text-white',
  A: 'bg-red-500 text-white',
  L: 'bg-orange-400 text-white',
  E: 'bg-blue-500 text-white',
  S: 'bg-purple-500 text-white',
};

const EMPTY_CLASS =
  'bg-gray-100 border-2 border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-600';

interface Props {
  value: State | null;
  onChange: (s: State) => void;
  disabled?: boolean;
  hasSaveError?: boolean; // true after first failed save — adds red border ring
}

export function AttendanceStateButton({ value, onChange, disabled, hasSaveError }: Props) {
  if (disabled) {
    return <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700" title="Non-school day" />;
  }

  const emptyExtra = hasSaveError ? ' ring-2 ring-red-400' : '';

  if (!value) {
    return (
      <div
        className={`w-8 h-8 rounded cursor-pointer ${EMPTY_CLASS}${emptyExtra}`}
        onClick={() => onChange('P')}
      />
    );
  }

  return (
    <button
      className={`w-8 h-8 rounded text-xs font-bold ${STATE_CLASS[value]}`}
      onClick={() => onChange(CYCLE[(CYCLE.indexOf(value) + 1) % CYCLE.length])}
      title={value}
    >
      {value}
    </button>
  );
}
```

### 10.7 Excused reason popover

```tsx
// src/components/attendance/ExcusedReasonPopover.tsx

interface Props {
  studentName: string;
  reason: string;
  onReasonChange: (r: string) => void;
  onClose: () => void;
}

export function ExcusedReasonPopover({ studentName, reason, onReasonChange, onClose }: Props) {
  return (
    <div className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-md p-3 w-56">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        Reason for excusing{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{studentName}</span>{' '}
        <span className="text-gray-400">(optional)</span>
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value.slice(0, 50))}
        maxLength={50}
        placeholder="e.g. Doctor's appointment"
        autoFocus
        className="w-full text-xs ring-1 ring-gray-300 dark:ring-gray-600 rounded p-1.5 dark:bg-gray-900 dark:text-gray-100"
      />
      <p className="text-[10px] text-gray-400 mt-0.5 text-right">{reason.length}/50</p>
      <button
        onClick={onClose}
        className="mt-2 w-full text-xs text-center text-sky-600 hover:underline"
      >
        Done
      </button>
    </div>
  );
}
```

### 10.8 Pending academic year dashboard card

```tsx
// src/components/attendance/PendingAcademicYearCard.tsx

interface Props { draftYearName: string; }

export function PendingAcademicYearCard({ draftYearName }: Props) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md p-4">
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        Academic Year {draftYearName} Pending Review
      </h3>
      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
        The next academic year has been generated. Review and confirm the term dates,
        public holidays, and non-school days before activating.
      </p>
      <a
        href="/academic-calendar"
        className="inline-block mt-2 text-xs font-medium text-amber-800 dark:text-amber-300 underline"
      >
        Review Academic Calendar →
      </a>
    </div>
  );
}
```

### 10.9 Save handler with empty-cell validation

```tsx
// Pattern for GeneralAttendanceRegisterPage save logic

const [saveAttempted, setSaveAttempted] = useState(false);
const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

const handleSave = async () => {
  const empty = students.filter((s) => !draft[s.id]);

  if (empty.length === 0) {
    await commitSave();
    return;
  }

  if (!saveAttempted) {
    // First attempt — show snackbar warning; do NOT write to Firestore
    setSaveAttempted(true);
    showSnackbar(`${empty.length} student(s) have no attendance recorded. Save again to confirm.`);
    return;
  }

  // Second attempt — show confirmation dialog
  setConfirmDialogOpen(true);
};

const handleConfirmedSave = async () => {
  setConfirmDialogOpen(false);
  await commitSave();
};

const commitSave = async () => {
  const docRef = doc(collection(db, 'generalAttendance'));
  await setDoc(docRef, {
    institutionId,
    classId: selectedClass.id,
    className: selectedClass.name,
    termId: activeTerm.id,
    academicYearId: activeYear.id,
    date: selectedDateISO,          // "YYYY-MM-DD"
    session: selectedSession,        // 'AM' | 'PM'
    records: buildRecordsMap(draft, students), // only students with a state are included
    submittedBy: user!.uid,
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  clearDraft(institutionId, selectedClass.id, selectedDateISO, selectedSession);
  setSaveAttempted(false);
  showSnackbar('Register saved.');
};
```

### 10.10 `useInstitutionAcademicCalendar` hook

```typescript
// src/hooks/useInstitutionAcademicCalendar.ts

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';

export function useInstitutionAcademicCalendar() {
  const { institutionId } = useAuth();
  const [activeYear,    setActiveYear]    = useState<AcademicYearDocument | null>(null);
  const [draftYear,     setDraftYear]     = useState<AcademicYearDocument | null>(null);
  const [activeTerm,    setActiveTerm]    = useState<TermDocument | null>(null);
  const [nonSchoolDays, setNonSchoolDays] = useState<NonSchoolDayDocument[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      query(collection(db, 'academicYears'), where('institutionId', '==', institutionId)),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AcademicYearDocument));
        setActiveYear(docs.find((y) => y.status === 'active') ?? null);
        setDraftYear(docs.find((y) => y.status === 'draft') ?? null);
      },
    );
    return unsub;
  }, [institutionId]);

  useEffect(() => {
    if (!activeYear) { setLoading(false); return; }
    const now = new Date().toISOString().slice(0, 10);
    const unsubT = onSnapshot(
      query(collection(db, 'terms'), where('academicYearId', '==', activeYear.id)),
      (snap) => {
        const terms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TermDocument));
        // Active term: today falls between startDate and endDate
        setActiveTerm(
          terms.find((t) => {
            const s = t.startDate.toDate().toISOString().slice(0, 10);
            const e = t.endDate.toDate().toISOString().slice(0, 10);
            return now >= s && now <= e;
          }) ?? null,
        );
      },
    );
    const unsubD = onSnapshot(
      query(
        collection(db, 'nonSchoolDays'),
        where('academicYearId', '==', activeYear.id),
        where('isActive', '==', true),
      ),
      (snap) => {
        setNonSchoolDays(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NonSchoolDayDocument)));
        setLoading(false);
      },
    );
    return () => { unsubT(); unsubD(); };
  }, [activeYear]);

  return { activeYear, draftYear, activeTerm, nonSchoolDays, loading };
}
```

---

## 11. Implementation Order

Phase 1 (General Attendance + Academic Calendar) must be completed before Phase 2 (Subject Attendance). Within Phase 1, the Academic Calendar data model and page must exist before the register can be built.

### Phase 1

| Step | Task | Depends on |
| --- | --- | --- |
| 1 | Firestore: create `academicYears`, `terms`, `nonSchoolDays` collections; add security rules from §9.1–9.3 | — |
| 2 | `src/lib/holidays.ts` — Jamaican public holiday utility (§10.1) | — |
| 3 | `src/lib/attendanceWindows.ts` — time window detection (§10.2) | — |
| 4 | `src/lib/attendanceCalendar.ts` — school day checker + expected sessions counter (§10.4) | — |
| 5 | `src/lib/attendanceDraft.ts` — localStorage draft utilities (§10.3) | — |
| 6 | `src/lib/attendanceTotals.ts` — totals and percentages computation (§10.5) | — |
| 7 | `src/hooks/useInstitutionAcademicCalendar.ts` (§10.10) | Step 1 |
| 8 | Academic Calendar page (`/academic-calendar`) — guided first-time setup + ongoing management | Steps 1–4, 7 |
| 9 | `PendingAcademicYearCard` (§10.8) + institution_admin dashboard integration | Step 8 |
| 10 | `users/{uid}` schema: add optional `assignedClassId` / `assignedClassName` for `senior_teacher` | — |
| 11 | Create-user page: optional homeroom class dropdown for `senior_teacher` type | Step 10 |
| 12 | `AttendanceStateButton` component (§10.6) | — |
| 13 | `ExcusedReasonPopover` component (§10.7) | — |
| 14 | Firestore: create `generalAttendance` collection; add security rules from §9.4 | Step 1 |
| 15 | General Attendance Register page (`/attendance/general`) — grid, navigation, save flow, overdue detection | Steps 5–9, 12–14 |
| 16 | Senior_teacher dashboard overdue alert | Steps 7, 15 |
| 17 | Institution_admin dashboard minor overdue badge | Steps 7, 15 |
| 18 | Student attendance view (`/attendance/my`) — General tab (Phase 1); Subject tab placeholder | Step 15 |
| 19 | Parent attendance view (`/attendance/child`) — child selector + General tab | Steps 15, 18 |
| 20 | `Menu.tsx`: add "ATTENDANCE" section with role-filtered sidebar items | Steps 8, 15, 18, 19 |
| 21 | `App.tsx`: add all attendance routes | Steps 8, 15, 18, 19 |
| 22 | Build PDF export scope selector modal and 3 PDF layouts | Step 15 |

### Phase 2 — deploy atomically with SubjectForm wiring

| Step | Task | Depends on |
| --- | --- | --- |
| 23 | SubjectForm: add `frequency`, `sessionDayOfWeek`, `customFrequencyDays` fields — `teacherIds`, `classIds`, `classScope` already deployed | — |
| 24 | Firestore: create `subjectEnrollments` collection; add rules from §9.6 | Step 23 |
| 25 | SubjectForm: add enrollment UI (class checkbox + student exclusion list) | Step 24 |
| 26 | Firestore: create `subjectAttendance` collection; add rules from §9.5 | Steps 23–25 |
| 27 | Subject Attendance Register page (`/attendance/subject`) — full implementation | Steps 23–26 |
| 28 | Extend student/parent attendance views with Subject Attendance tab | Step 27 |
| 29 | Extend institution_admin overdue indicator to include Subject Register slots | Step 27 |

---

## 12. Deferred Items and Open Issues

### 12.1 Subject Attendance Register — Phase 2

The Subject Attendance Register is deferred. SubjectForm is deployed and writes `teacherIds`, `classIds`, and `classScope` to Firestore, but `frequency`, `sessionDayOfWeek`, the `subjectEnrollments` collection, and the register page itself have not been built. Steps 24–29 in §11 remain pending; Step 23 is partially complete (see §11). The `subjectAttendance` Firestore rules (§9.5) are safe to deploy when the Subject Register page ships — `teacherIds` is now live.

### 12.2 Multi-country public holiday support

Only Jamaican public holidays are hardcoded. When the platform expands to other territories, add a `country` field to the `institutions` document and refactor `getJamaicanPublicHolidays` into a dispatcher `getPublicHolidays(year, country: 'JM' | ...)`. Deferred — Jamaica-only for Phase 1.

### 12.3 `attendanceSummaries` — report card integration

When the report card feature is built, pre-computed per-student per-term summaries will be required to avoid re-aggregating 130+ documents at render time. A `attendanceSummaries/{studentId}_{termId}` document updated after each register save is the recommended approach. Explicitly deferred to the report card branch.

**Report card note:** The report card image (`sms-system/internal/report-card-example.png`) is designed to be printed and folded as a pamphlet in 4 quarters. When the report card feature is built, the attendance totals section in the top-left quarter of the card should draw from these summaries and display per-state counts matching the Key to Comments / Key to Letter Grades convention seen in the image.

### 12.4 Import from spreadsheet

Attendance data import from CSV/Excel files is deferred. A disabled import button with "Coming soon" tooltip is acceptable in the UI until this is implemented.

### 12.5 Retroactive editing for institution_admin beyond the current term

The current design restricts retroactive editing to the current term. An institution_admin may occasionally need to correct a past term's record (e.g., a data entry error discovered after term closure). An "unlock past term" mechanism or a super_admin override flag would handle this. Deferred — document as a known limitation for now.

### 12.6 Subject session day-of-week configuration

For Subject Attendance overdue enforcement, the system must know which day(s) of the week a subject meets. The `sessionDayOfWeek` field on the subject document is noted in §4.5 but has not yet been added to SubjectForm or the `SubjectDocument` type. Deferred to Phase 2 implementation.

### 12.7 `attendanceSummaries` migration on introduction

When `attendanceSummaries` is added in the report card branch, a one-time migration script will need to aggregate existing `generalAttendance` and `subjectAttendance` documents to create initial summary records. Document this requirement in the report card spec.

### 12.8 Guided setup resumability

The first-time Academic Calendar setup wizard does not currently have a resume mechanism. If institution_admin closes the browser mid-wizard, they restart from step 1. Saving wizard state to `localStorage` under `acal_setup_{institutionId}` would mitigate this. Deferred as a UX improvement.

---

## 13. Files and Routes

### New files

| File | Purpose |
| --- | --- |
| `src/lib/holidays.ts` | Jamaican public holiday computation |
| `src/lib/attendanceWindows.ts` | AM/PM window detection (UTC-5) |
| `src/lib/attendanceCalendar.ts` | School day checker, expected sessions counter |
| `src/lib/attendanceDraft.ts` | localStorage draft get/set/clear/purge |
| `src/lib/attendanceTotals.ts` | Totals and percentage computation |
| `src/hooks/useInstitutionAcademicCalendar.ts` | Academic calendar Firestore data hook |
| `src/components/attendance/AttendanceStateButton.tsx` | Color-coded state cell button |
| `src/components/attendance/ExcusedReasonPopover.tsx` | E-state reason input popover |
| `src/components/attendance/PendingAcademicYearCard.tsx` | Dashboard card for draft academic year |
| `src/scenes/(dashboard)/academic-calendar/index.tsx` | Academic Calendar management page |
| `src/scenes/(dashboard)/attendance/general/index.tsx` | General Attendance Register page |
| `src/scenes/(dashboard)/attendance/subject/index.tsx` | Subject Register (Phase 2; placeholder in Phase 1) |
| `src/scenes/(dashboard)/attendance/my/index.tsx` | Student's own attendance view |
| `src/scenes/(dashboard)/attendance/child/index.tsx` | Parent's child attendance view |

### Modified files

| File | Change |
| --- | --- |
| `src/App.tsx` | Add all five attendance routes |
| `src/components/Menu.tsx` | Add "ATTENDANCE" section with role-filtered items |
| `src/scenes/(dashboard)/institution-admin/index.tsx` | Add `PendingAcademicYearCard`; add overdue badge — verify exact path at implementation |
| `src/scenes/(dashboard)/list/teachers/index.tsx` (or create-user page) | Add optional homeroom class dropdown for `senior_teacher` type |

### Firestore collections (new)

| Collection | Phase |
| --- | --- |
| `academicYears` | 1 |
| `terms` | 1 |
| `nonSchoolDays` | 1 |
| `generalAttendance` | 1 |
| `subjectAttendance` | 2 |
| `subjectEnrollments` | 2 |
