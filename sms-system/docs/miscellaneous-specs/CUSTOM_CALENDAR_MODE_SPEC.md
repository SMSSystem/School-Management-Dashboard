# Custom Calendar Mode — Implementation Spec

## Overview

The platform has been adopted by an organization that is not a traditional academic
institution: it offers 2-hour evening classes, individually scoped to a single
programme (e.g. "Mechanical Workshop 1"), each running on a fixed **10-week**
basis. Its target demographic — college students and high-school graduates already
enrolled elsewhere (e.g. a community college), attending these evening classes
alongside their primary studies — is grouped, in the org's own paperwork, under
labels like *"Associate of Science Degree in Engineering Year 2 – Mechanical
Workshop 1."*

Today, every institution on this platform is forced through the **Academic
Calendar wizard** (`/dashboard/academic-calendar`), which is hard-coded to a
Jamaican-school-year model: a September–August year, split into exactly **three**
terms ("Christmas Term", "Easter Term", "Summer Term"), with Jamaican public
holidays auto-populated. None of that fits an evening-programme provider running
independent 10-week cohorts.

This spec adds a **Custom Calendar Mode**: an institution-level choice that
replaces the fixed 3-term-year wizard with a lightweight "create a time block of
N days/weeks/months" flow, and lets multiple such time blocks (one per concurrently
running programme) exist and be actively used at once.

**Governing decisions, confirmed by the project owner during this spec's
brainstorm:**

- Full rework (not a minimal-diff shim) — Group B pages (Class creation,
  Attendance, dashboards) get real support for calendar-mode-aware term
  selection, not just a compatibility shim.
- Both General Attendance (whole-block presence) and Subject Attendance
  (per-programme-session presence) are needed — not Subject-only.
- **Staggered/concurrent time blocks are required** — different programmes can be
  mid-run at different times, not all synchronized to one shared window. This is
  the single most architecturally significant decision in this spec (see
  [§3](#3-the-concurrent-time-blocks-problem)).
- Public self-registration must work for custom-mode institutions too, with an
  **optional** guardian/emergency-contact section (not a hard requirement, and
  not consent-only) — since applicants are adults.

---

## 1. Background — Investigation Findings

Verified by direct reads of the codebase, not assumed.

### 1.1 Two separate wizards exist today

- **Institution Profile wizard** (`/dashboard/institution-profile`,
  `InstitutionProfileWizard` in `src/scenes/(dashboard)/institution-profile/index.tsx`)
  — 7 steps: basic info, contact, logo, signature, role labels, grading system,
  review. No dates, no terms, nothing calendar-related.
- **Academic Calendar wizard** (`/dashboard/academic-calendar`,
  `AcademicYearWizard` in `src/scenes/(dashboard)/academic-calendar/index.tsx`) —
  this is where `AcademicYearDocument` + `TermDocument`s + `NonSchoolDayDocument`s
  actually get created. **This is the wizard this spec extends.**

### 1.2 The Academic Calendar wizard's hard-coded assumptions

- `getJamaicanPublicHolidays()` — Jamaica-specific public holiday defaults.
- Default year range: September → August.
- `WizardTerm.number: 1 | 2 | 3` — **exactly three terms, every time**, with fixed
  default names ("Christmas Term", "Easter Term", "Summer Term").
- `TermDocument.termNumber?: 1 | 2 | 3` in `src/lib/firebase.ts` — the type itself
  is capped at 3, reflecting this hard-coding.

### 1.3 A partial, incomplete escape hatch already exists

- `TermDocument.academicYearId` and `termNumber` are **already optional** in the
  type.
- `TermForm.tsx` (reachable via the plain "Terms" list page,
  `/dashboard/list/terms`) already lets an admin create a freestanding term —
  name + start/end date + status — with **no** `AcademicYearDocument` reference
  at all.
- **Pre-existing bug found while reading this file**: `TermForm.tsx`'s status
  `<select>` offers `upcoming` / `active` / `closed`, but `TermStatus` (the actual
  type in `firebase.ts`) is `'upcoming' | 'active' | 'completed'`. `"closed"` does
  not match the type. Fixed as part of this work since this spec touches
  `TermForm.tsx` anyway (see [§7](#7-fix-bundled-in-termstatus-enum-mismatch)).

### 1.4 Two different term-consumption patterns ("Group A" / "Group B")

| Group | Pages | How it reads terms | Blocked without an AcademicYear? |
|---|---|---|---|
| **A** | Gradebook, Results, Feedback Comments, Exams, Assignments, Timetable Slots, Disciplinary Actions, Report Card Comments, Grade-Entry Tracking, Schedule | Raw, unfiltered `institutionCollection(id, 'terms')` read | No — already works with a freestanding term today |
| **B** | ClassForm, General/Subject Attendance, `AttendanceScopeModal`, admin & senior-teacher dashboards, `BigCalendar`, `AttendanceChart` | `useInstitutionAcademicCalendar()` | **Yes** — hard-gated on an `AcademicYearDocument` with `status === 'active'` existing |

`useInstitutionAcademicCalendar()` (`src/hooks/useInstitutionAcademicCalendar.ts`)
is the actual chokepoint: its second `useEffect` returns early with
`allTerms = null` when there's no active year, and its `activeTerm`/`activeYear`
are both derived as **singular** values (`docs.find(...)`), which assumes at most
one is ever relevant at a time.

### 1.5 `schoolWeekDays` / non-school-days are load-bearing, not just a gate

Both `attendance/general/index.tsx` and `attendance/subject/index.tsx` use
`activeYear.schoolWeekDays` as an input to `isSchoolDay()` /
`isSubjectSessionDay()` — deciding which calendar dates are valid session dates —
and write `academicYearId` directly onto every attendance record
(`GeneralAttendanceDocument.academicYearId`, and the Subject Attendance
equivalent). This FK is **pervasive**: it also appears as a required field on
`AttendanceSummaryDocument`, `ProgressReportDocument`, `NonSchoolDayDocument`, and
`EnrollmentRegistrationDocument`.

This pervasiveness directly shaped the core design decision in
[§2](#2-core-design-decision-a-time-block-is-still-an-academicyear--term-pair):
rather than making `academicYearId` optional across six-plus document types (and
updating every rule/consumer that assumes its presence), a "custom time block"
is still represented internally as one real `AcademicYearDocument` + one real
child `TermDocument` — just created via a different, much lighter wizard flow,
and with the institution allowed to have **several simultaneously active** ones.

### 1.6 `ClassDocument.grade` — a K-12 assumption

`grade: number`, required, validated `1–13` in `ClassForm.tsx`'s zod schema
(`.min(1, ...).max(13, ...)`). Used across report card generation, the report
builder, and spreadsheet import (11 files total reference `grade`). "AS
Engineering Year 2" doesn't map onto a K-12 grade level.

### 1.7 `SubjectDocument` already fits the delivery pattern well

`frequency: 'daily' | 'weekly' | 'fortnightly' | 'custom'`, `sessionDayOfWeek`,
`customFrequencyDays`, `fortnightlyOffset` — already built for "meets one evening
a week." No changes needed here.

### 1.8 Registration form's dependency on "the" active academic year

`src/scenes/(auth)/register/[institutionId]/index.tsx` submits
`academicYearId: directory.activeAcademicYearId` — a **single** value read from
the public `registration_directory/{institutionId}` document
(`RegistrationDirectoryEntry.activeAcademicYearId`/`activeAcademicYearName`,
populated by the Academic Calendar wizard when a year is activated). With
multiple concurrently-open programmes, there is no longer one "the" active year
to silently default to — the applicant needs to pick **which programme** they're
applying for (see [§6](#6-registration-form-changes)).

The registration rule itself (`firestore.rules`, `enrollmentRegistrations`
`create`) requires:
- `exists(academicYears/{academicYearId})` — satisfied automatically under this
  spec's design, since every time block still has a real backing
  `AcademicYearDocument` (see §2).
- `request.resource.data.mother != null || request.resource.data.father != null`
  — **at least one guardian is mandatory today**. This blocks adult
  self-registering applicants and needs to become genuinely optional.

### 1.9 `MIN_AGE_YEARS` — not a blocker

The public registration form enforces `MIN_AGE_YEARS = 10` client-side (student
date-of-birth). College-age/high-school-graduate applicants are well above this;
no change needed.

---

## 2. Core Design Decision: a "Time Block" is still an AcademicYear + Term pair

Rather than loosening the `academicYearId` foreign key across six-plus document
types (`GeneralAttendanceDocument`, the Subject Attendance equivalent,
`AttendanceSummaryDocument`, `ProgressReportDocument`, `NonSchoolDayDocument`,
`EnrollmentRegistrationDocument`) and every rule/consumer that assumes its
presence, **a custom time block is still, under the hood, exactly one
`AcademicYearDocument` with exactly one child `TermDocument`** (`termNumber: 1`).

What changes is:

- **How it's created** — a short "New Time Block" wizard (duration input instead
  of the Jamaica-3-term generator) replaces the existing wizard's Step 1–2 for
  custom-mode institutions.
- **How many can be active at once** — custom-mode institutions are not limited
  to one active `AcademicYearDocument`; several can have `status: 'active'`
  simultaneously (one per concurrently running programme).
- **Where `schoolWeekDays` lives** — carried on the `AcademicYearDocument` exactly
  as today (no schema change needed there either — a time block's "school week"
  is just the evening(s) that specific programme runs).

This is an internal implementation detail. Custom-mode admins never see the words
"Academic Year" in the UI — the concept is presented as **"Time Block"**
(confirmed naming — see [§4.1](#41-calendarmode-assignment-flow)).

**What this buys:**
- `NonSchoolDayDocument`, `AttendanceSummaryDocument`, `ProgressReportDocument`,
  and the registration rule's `exists(academicYears/{id})` check all keep working
  with **zero schema or rule changes**.
- The genuinely new work is concentrated in: the wizard UI, the hook's
  singular→plural contract change, and the pages that need a new
  term/time-block selector because they no longer have exactly one obvious
  default.

**What this doesn't avoid** (the real cost of "staggered/concurrent," see §3):
`useInstitutionAcademicCalendar()`'s return contract still has to change for
custom-mode institutions, and pages that today silently assume "the" active term
still need new selector UI.

---

## 3. The Concurrent Time Blocks Problem

This is the most structurally significant piece of this spec. Today, **one
institution-wide "current term" at a time** is assumed in more places than the
calendar hook:

- `CurrentTermContext` (`src/lib/CurrentTermContext.tsx`) auto-defaults
  `currentTermId` to `terms.find(t => t.status === 'active')` — assumes at most
  one active term exists. Gradebook, Schedule, Attendance Gridsheet, Report Card
  Comments, and Grade-Entry Tracking all read/write this shared value via their
  own term-picker dropdowns — **these pages already have a picker UI**, so once
  the underlying term list correctly includes every concurrently active
  time-block's term, they need no further change beyond that except for the
  default-selection rule below.

  **Confirmed default-selection rule for custom-mode institutions**: when
  several time blocks are simultaneously active, default `currentTermId` to
  the **most-recently-created** one (`AcademicYearDocument.createdAt`,
  descending — already an existing field, no schema addition needed), with
  **soonest-ending** (`endDate`, ascending) as the tie-break for two created in
  the same instant. This only changes the *default* shown on first load — the
  admin's own explicit pick, once made, is preserved exactly as
  `CurrentTermContext` already does today (`if (prev && ...) return prev;`).
- `useInstitutionAcademicCalendar()`'s `activeYear`/`activeTerm` are derived the
  same way (singular `.find(...)`) and are consumed by pages **with no picker at
  all today**: General Attendance, Subject Attendance, `AttendanceScopeModal`,
  the admin dashboard, the senior-teacher dashboard, `BigCalendar`,
  `AttendanceChart`.

### 3.1 Hook contract change

For `calendarMode === 'custom'`, `useInstitutionAcademicCalendar()` returns a
**list** of active year/term pairs instead of a singular one:

```ts
// New return shape (institution.calendarMode === 'custom'):
{
  // Sorted most-recently-created first (AcademicYearDocument.createdAt desc),
  // soonest-ending as the tie-break (endDate asc) — the confirmed default-
  // selection rule from §3. Consumers that need "the" default block (rather
  // than showing the full picker) use activeTimeBlocks[0].
  activeTimeBlocks: { year: AcademicYearDocument & { id: string }; term: TermDocument & { id: string } }[];
  nonSchoolDaysByTermId: Record<string, (NonSchoolDayDocument & { id: string })[]>;
  loading: boolean;
  timedOut: boolean;
  // activeYear / activeTerm / allTerms / nonSchoolDays (today's singular shape)
  // remain present but are populated ONLY when calendarMode === 'academic_year',
  // so existing Group A/B code paths for academic-mode institutions are
  // completely unaffected by this change.
}
```

Consumers that need to work under both modes branch on `institution.calendarMode`
and use whichever shape applies. This keeps the change additive rather than
a breaking rewrite of the hook's existing consumers.

### 3.2 New selector UI required

Pages with no picker today need one added, scoped to custom-mode institutions
only (academic-mode institutions keep today's zero-picker, single-active-term
behavior unchanged):

- **General Attendance / Subject Attendance** — a "Time Block" dropdown above the
  existing class/subject pickers, populated from `activeTimeBlocks`, defaulting
  to the block matching the selected class's own `termId` when the caller already
  knows the class (e.g. opened from a class's own action button).
- **`AttendanceScopeModal`** — same dropdown, needed for its PDF-scope date-range
  logic (`termStart`/`termEnd`).
- **Admin & senior-teacher dashboards** — whatever "current term" widget exists
  today needs to become a small multi-block summary (or a dropdown) rather than
  a single label, for custom-mode institutions.
- **`BigCalendar` / `AttendanceChart`** — need the relevant time block's date
  range passed in explicitly (from whichever page hosts them) rather than reading
  a singular `activeTerm` themselves.

---

## 4. Data Model Changes

All additive — zero migration needed, zero behavior change for existing
academic-mode institutions.

```ts
// InstitutionDocument — new field, defaults to 'academic_year' when absent.
export type InstitutionDocument = {
  // ...existing fields...
  calendarMode?: 'academic_year' | 'custom'; // absent === 'academic_year'
};

// ClassDocument.grade — becomes optional. The field itself is unchanged
// (still a number); only its requiredness and its UI label change. See §4.1
// for calendarMode and §8 for the "Programme Year" relabeling.
export type ClassDocument = {
  name: string;
  capacity: number;
  grade?: number; // was: number (required, 1–13)
  institutionId: string;
  termId: string;
  supervisor?: string;
  classTeacherId?: string;
  departmentId?: string;
};

// RegistrationGuardian — no shape change; the registration FORM decides
// whether to collect it at all for custom-mode institutions (see §6).
```

No changes needed to: `TermDocument`, `AcademicYearDocument`,
`NonSchoolDayDocument`, `GeneralAttendanceDocument`, `AttendanceSummaryDocument`,
`ProgressReportDocument`, `EnrollmentRegistrationDocument` — all keep their
existing required `academicYearId` fields, satisfied per §2.

### 4.1 `calendarMode` Assignment Flow

Confirmed decision: **super_admin-only, set at institution-onboarding time**,
with a one-time inst_admin fallback if the super_admin skips it.

**Primary path — `InstitutionForm.tsx` (super_admin onboarding, step 1 of
`OnboardInstitutionPage`)**: today this form collects only `name` and batches
the `institutions/{id}` + `registration_directory/{id}` writes. It gains a
required radio choice — **Academic Year** (default-selected) / **Custom Time
Blocks** — written as `calendarMode` in the same batch. Nothing else about this
step's flow changes; it stays a single-screen step.

**Fallback path — `InstitutionProfileWizard` (inst_admin, 7-step wizard at
`/dashboard/institution-profile`)**: on mount, if `institution?.calendarMode`
is `undefined` (meaning the super_admin skipped the onboarding choice — the
only way this can happen, since the primary path always writes it), the wizard
shows a **one-time interstitial screen** — the same Academic Year / Custom Time
Blocks choice — *before* Step 1 of the existing 7-step flow begins. Deliberately
not folded in as a numbered `WizardStep` (which would mean renumbering the
existing `1 | 2 | 3 | 4 | 5 | 6 | 7` union and its `STEP_LABELS` array): it's a
gate the wizard passes through at most once, not a step the admin can navigate
back to. Answering it writes `calendarMode` immediately via its own `updateDoc`
(not deferred to the wizard's final `saveProfile()` call), so:

- A refresh mid-wizard doesn't lose the choice and re-prompt.
- Once set — by either path — `institution.calendarMode` is always defined
  going forward, so this interstitial never appears again. This is what makes
  it genuinely "one-time-only" per the confirmed decision, without needing a
  separate "has this been asked" flag.

If `institution?.calendarMode` is already set (the normal case, since the
primary path always sets it), the wizard behaves exactly as it does today —
no interstitial, straight into Step 1.

---

## 5. Firestore Security Rules Changes

### 5.1 `institutions/{institutionId}` — no change

`calendarMode` is an ordinary optional field on a document type whose update
rule doesn't enumerate/restrict field shape beyond what's already checked
(mirrors item 4/5's finding from the earlier photo-upload feature's triage: most
`users`/`institutions`-adjacent rules don't pin exact field sets). No rule change
needed to allow writing it.

### 5.2 `academicYears` / `terms` / `nonSchoolDays` — no change

None of these rules enforce field-count/shape today (confirmed by reading
`firestore.rules` — `allow create: if isAdmin() && writingToMyInstitution()`,
no `hasOnly()`). An institution creating **several** `AcademicYearDocument`s with
`status: 'active'` simultaneously is not prevented by anything in the rules
layer today — this has always been a purely client-side convention
(`useInstitutionAcademicCalendar()`'s `.find()` picking the first match), which
is exactly what §3.1 replaces for custom-mode institutions.

### 5.3 `enrollmentRegistrations` — guardian requirement relaxed

**Current rule** (`firestore.rules`, ~line 1410):

```
allow create: if institutionFieldMatchesPath(institutionId)
  && request.resource.data.status == 'pending'
  && request.resource.data.possibleDuplicate == false
  && request.resource.data.submittedAt is timestamp
  && request.resource.data.keys().hasAll([...9 keys...])
  && request.resource.data.keys().hasOnly([...9 keys...])
  && exists(/databases/$(database)/documents/institutions/$(institutionId)/academicYears/$(request.resource.data.academicYearId))
  && isValidRegistrationStudent(request.resource.data.student)
  && (request.resource.data.mother == null || isValidRegistrationGuardian(request.resource.data.mother))
  && (request.resource.data.father == null || isValidRegistrationGuardian(request.resource.data.father))
  && (request.resource.data.mother != null || request.resource.data.father != null); // ← drops out
```

**Design constraint**: whether the "at least one guardian required" line applies
must be decided by the **institution's own `calendarMode`**, read authoritatively
via `get()` — not trusted from a client-supplied flag on the registration
document itself. This directly follows a real lesson from this session's earlier
photo-upload feature: trusting a client-supplied `institutionId` without
cross-checking it against the real target opened a cross-institution write hole
(fixed by adding a `get()`-based cross-check). The same discipline applies here:
an unauthenticated public submitter must not be able to simply omit
`calendarMode`-gating by claiming "custom mode" for an academic-mode institution.

```
function institutionAllowsGuardianlessRegistration(institutionId) {
  return get(/databases/$(database)/documents/institutions/$(institutionId)).data.calendarMode == 'custom';
}

allow create: if institutionFieldMatchesPath(institutionId)
  && request.resource.data.status == 'pending'
  && request.resource.data.possibleDuplicate == false
  && request.resource.data.submittedAt is timestamp
  && request.resource.data.keys().hasAll([...9 keys...])
  && request.resource.data.keys().hasOnly([...9 keys...])
  && exists(/databases/$(database)/documents/institutions/$(institutionId)/academicYears/$(request.resource.data.academicYearId))
  && isValidRegistrationStudent(request.resource.data.student)
  && (request.resource.data.mother == null || isValidRegistrationGuardian(request.resource.data.mother))
  && (request.resource.data.father == null || isValidRegistrationGuardian(request.resource.data.father))
  && (
       request.resource.data.mother != null
       || request.resource.data.father != null
       || institutionAllowsGuardianlessRegistration(institutionId)
     );
```

This adds one extra `get()` per registration submission — acceptable given
registrations are a low-frequency write (mirrors the existing `me()` helper's own
per-rule-evaluation `get()` cost already documented in the README's Firebase
section).

### 5.4 `registration_directory/{institutionId}` — extended, not replaced

Still holds `activeAcademicYearId`/`activeAcademicYearName` for backward
compatibility with academic-mode institutions' single-active-year assumption.
For custom-mode institutions, add an additional field holding the list of
currently open time blocks (see [§6](#6-registration-form-changes)):

```ts
export type RegistrationDirectoryEntry = {
  // ...existing fields (acceptingRegistrations, activeAcademicYearId, activeAcademicYearName, ...)...
  openTimeBlocks?: { academicYearId: string; name: string; startDate: string; endDate: string }[];
};
```

Public `read` rule for this collection is unchanged (already public, filtered
client-side to `acceptingRegistrations == true`).

---

## 6. Registration Form Changes

`src/scenes/(auth)/register/[institutionId]/index.tsx`, for custom-mode
institutions only:

1. **Programme picker step**, shown before the student-details step, populated
   from `directory.openTimeBlocks`. Selecting one sets `academicYearId`/
   `academicYearName` for the submission (replacing the current silent
   `directory.activeAcademicYearId` default, which assumed exactly one).
2. **Guardian section becomes optional**, reusing the existing
   `RegistrationGuardian` shape (no new field). Per the project owner's decision,
   this is **not** a "no guardian at all" consent-only flow — the form still
   offers a guardian/emergency-contact section, just without requiring it to be
   filled in for custom-mode institutions. The existing
   `(mother != null || father != null)` UI validation is skipped in this mode;
   the rule change in §5.3 permits the resulting `mother: null, father: null`
   submission.
3. `MIN_AGE_YEARS` stays at 10 (§1.9 — not a blocker, no change).

---

## 7. Fix Bundled In: `TermStatus` Enum Mismatch

Since this spec's work touches `TermForm.tsx` directly (the "New Time Block"
quick-create action reuses it — see §8), the pre-existing
`upcoming/active/closed` vs. `upcoming/active/completed` mismatch found in §1.3
gets corrected in the same pass: `TermForm.tsx`'s `<select>` options change from
`closed` to `completed`, matching `TermStatus`.

---

## 8. UI/UX Changes Per Surface — Summary

| Surface | Change |
|---|---|
| `InstitutionForm.tsx` (super_admin onboarding) | New Academic Year / Custom Time Blocks radio choice, written as `calendarMode` in the existing batch (§4.1) |
| `InstitutionProfileWizard` (inst_admin) | One-time interstitial fallback choice, shown only if `calendarMode` is still unset (§4.1) |
| Academic Calendar page | For custom mode, a short duration-based wizard replaces the Jamaica-3-term generator |
| "New Time Block" quick action | A fast, repeatable single-step way to spin up the next 10-week block without re-running the full wizard each time (reuses `TermForm`-adjacent logic) |
| `useInstitutionAcademicCalendar` hook | New `activeTimeBlocks` list-shaped return for custom mode (§3.1), sorted by the confirmed default-selection rule, existing singular shape untouched for academic mode |
| `CurrentTermContext` | Default-selection logic updated: defaults to `activeTimeBlocks[0]` (most-recently-created, soonest-ending tie-break — §3) instead of blindly picking the first `status === 'active'` term |
| General Attendance, Subject Attendance, `AttendanceScopeModal` | New Time Block selector dropdown (§3.2) |
| Admin & senior-teacher dashboards | "Current term" widget becomes multi-block-aware |
| `BigCalendar`, `AttendanceChart` | Take an explicit date range from their caller instead of reading a singular `activeTerm` themselves |
| `ClassForm` | `grade` field becomes optional; relabeled to **"Programme Year"** for custom-mode institutions (kept visible, not hidden) |
| Report Card / Report Builder / Spreadsheet Import (11 files) | Fallback handling for an absent `grade` — skip grade-based grouping/filtering rather than erroring |
| Registration form | Programme picker + optional guardian section (§6) |

---

## 9. Open Questions — Resolved

The four open questions this spec originally left unresolved have since been
confirmed by the project owner and folded into the relevant sections above.
Kept here as a decision log:

1. **Terminology** — "Time Block" confirmed as-is. → §2, §4.1.
2. **Where `calendarMode` gets set** — super_admin-only, at institution-onboarding
   time (`InstitutionForm.tsx`); one-time inst_admin fallback in the Institution
   Profile wizard if the super_admin skips it. → §4.1.
3. **Concurrent-active tie-break** — most-recently-created first, soonest-ending
   as the tie-break. → §3, §3.1.
4. **`grade` field replacement** — relabeled to **"Programme Year"** for
   custom-mode institutions, not hidden. → §4, §8.

---

## 10. Implementation Order

1. **Data model additions** (§4) — `calendarMode`, `ClassDocument.grade`
   optional. Purely additive; safe to ship alone.
2. **`TermForm.tsx` status-enum fix** (§7) — trivial, isolated.
3. **`calendarMode` assignment flow** (§4.1) — the onboarding-step radio choice
   plus the Institution Profile wizard's one-time fallback interstitial. Lands
   early since every later phase branches on this value.
4. **Custom-duration wizard flow** on the Academic Calendar page — produces one
   `AcademicYearDocument` + one child `TermDocument` per time block, per §2.
5. **`useInstitutionAcademicCalendar()` hook rework** — add the `activeTimeBlocks`
   list-shaped return, sorted per the confirmed default-selection rule, for
   `calendarMode === 'custom'` (§3.1), leaving the existing singular shape
   untouched for academic-mode institutions.
6. **Selector UI additions** — General/Subject Attendance, `AttendanceScopeModal`,
   both dashboards, `BigCalendar`, `AttendanceChart` (§3.2).
7. **`ClassForm` grade-optional UI** ("Programme Year" relabel) + report
   card/report builder/spreadsheet import fallback handling (§4, §8).
8. **Registration form + rules changes** — programme picker, optional guardian
   section, `registration_directory.openTimeBlocks`, the
   `institutionAllowsGuardianlessRegistration()` rule (§5.3, §5.4, §6). Deploy
   rules before shipping the form changes that depend on them.
9. **"New Time Block" quick-create action** — the fast repeat-cohort path,
   layered on top of everything above once the underlying data model and hook
   support multiple concurrent blocks cleanly.

---

## 11. Testing / Manual QA Plan

- Existing academic-mode institution: confirm zero behavior change across every
  Group A/B page, `CurrentTermContext`, and the registration form (regression
  pass — this is the most important check, since almost everything here is
  additive specifically to avoid disturbing this path).
- New custom-mode institution: create 2+ overlapping time blocks; confirm
  Gradebook/Schedule/Attendance/dashboards all let the admin pick among them
  correctly and don't silently collapse to just one.
- General + Subject Attendance: confirm session-date validity
  (`isSchoolDay`/`isSubjectSessionDay`) works correctly against a custom time
  block's own `schoolWeekDays`, independent of any other concurrently active
  block's dates.
- Registration form, custom-mode institution: submit with no guardian filled in
  at all; confirm the write succeeds. Submit the same against an academic-mode
  institution; confirm it's still rejected without a guardian.
- Report card / report builder / spreadsheet import: confirm all handle a class
  with no `grade` set without erroring.

---

## 12. Explicitly Out of Scope

- Renaming `AcademicYearDocument`/`TermDocument` at the schema level, or
  migrating existing data — the "Time Block" framing is a UI-layer concept only.
- Per-institution configurable `MIN_AGE_YEARS` (not needed — §1.9).
- Any rework of Group A pages — already fully compatible with freestanding terms
  today, confirmed in §1.4.
- Houses — remain available but irrelevant/optional for custom-mode
  institutions; no change forced.
- Cloud Functions or any automated/scheduled time-block rollover — creation
  stays a manual admin action (the "New Time Block" quick-create), consistent
  with how Academic Year creation works today.
- A general-purpose "any institution can freely mix custom and academic-year
  terms" model — `calendarMode` is a single per-institution choice, not a
  per-term one.
