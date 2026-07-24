# Disciplinary Action (MDDS) — Feature Spec

> **Status:** Shipped — all 11 Implementation Order items complete
> **Feature:** Merit / Demerit / Detention / Suspension tracking ("MDDS")
> **Route:** `/dashboard/disciplinary-actions`
> **Primary roles:** Any teacher-or-above can create; `institution_admin`/`super_admin` can edit/delete; all roles can read within their own scope
> **Resolves:** The deferred item documented in `REPORT_CARD_SPEC.md §9.1` — the `reportCards` schema already reserves `demerits`/`suspensions`/`detentions` placeholder fields (always `null` today) specifically for this feature

---

## Overview

Disciplinary Action ("MDDS") is a standalone record-keeping feature for four categories of student behavior events — **Merit**, **Demerit**, **Detention**, and **Suspension**. Each event is logged as an individual, timestamped entry against a student, not as a running counter. Per-term totals for each category are computed from these entries and:

1. Displayed on the student's report card (STUDENT SUMMARY section), alongside GPA/Class Rank/Attendance.
2. Displayed inline on the Student Detail page, in a new "Disciplinary Record" section matching the existing Activities/Responsibilities/Report Card Comments pattern.
3. Browsable/searchable on a new dedicated page, for staff to look up either "all Demerits this term" (search by category) or "everything for this one student" (search by name).
4. Visible, read-only, to the student themselves and their linked parent(s) — the same audience who can already see that student's report card and feedback comments.

Any signed-in teacher (`regular_teacher` or `senior_teacher`) or admin can log an entry of any of the four types — there is no severity-based tiering on *who can create* an entry. Editing or deleting an existing entry, however, is restricted to `institution_admin`/`super_admin` only, including the original issuer — this is an intentional design choice to keep the log closer to an audit trail than a freely-editable record.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data storage | New `disciplinaryActions` collection, one document per incident | Matches every other event-style collection in this app (`feedback_comments`, `attendance`); totals are computed by query, not maintained as a denormalized counter that can drift out of sync |
| Who can create | Any teacher-or-above (`isTeacherOrAbove()`), all four types, no tiering | Matches real school practice — a teacher disciplining a student they encounter in a hallway, not just their own students, is normal. Explicitly not tiered by severity for v1 |
| Who can edit/delete | `institution_admin`/`super_admin` only — **not** the original issuer | Reduces risk of a teacher quietly altering their own past entries; treats the log as closer to an audit trail |
| Who can read | Staff (any teacher/admin, same institution) + the specific student + that student's linked parent(s) | Mirrors the existing `reportCards` and `feedback_comments` read rules exactly — no new privacy pattern introduced. Other students/other families never see it |
| Merit/Demerit weighting | Flat count — every entry is worth exactly 1 toward its category's total | Simplest for v1. A `points` field can be added later without a schema migration, the same way this whole feature was deferred without one |
| Detention/Suspension shape | Carry a date range (`date` + `endDate`) and a `served` flag | Unlike Merit/Demerit (a single moment), a detention or suspension is typically served over a period — tracking whether it's been served is meaningful data a school would actually want |
| Report card totals | Per-term only, resets each term | Matches how the rest of the report card (grades, attendance) is already term-scoped. Cumulative-to-date totals are a deferred enhancement (see §Deferred Items) |
| Student/parent visibility | Full read-only entry list (type, reason, date, issuer) — not just the aggregated totals | They already see this level of detail on feedback comments and report cards; hiding the *reason* while showing the *count* would be a strange middle ground |
| Page structure | One route, role-aware content — not separate staff/student/parent pages | Matches the existing precedent in `report-cards/index.tsx`, which already branches on role (`institution_admin`/`senior_teacher` see everything scoped to their institution; `parent` resolves `linkedStudentIds` via the `student_parents` junction collection and scopes the query to those) |

---

## Data Model

### `disciplinaryActions` collection

**Path:** `disciplinaryActions/{actionId}`

```
disciplinaryActions/{actionId}
  institutionId:   string                                          // for filtering and security rules
  studentId:       string                                          // references users/{uid} (student)
  studentName:     string                                          // denormalized for display
  classId:         string                                          // references classes/{classId}
  className:       string                                          // denormalized for display
  termId:          string                                          // references terms/{termId}
  termName:        string                                          // denormalized for display
  type:            'merit' | 'demerit' | 'detention' | 'suspension'
  reason:          string                                          // free text, what happened
  date:            string                                          // ISO "YYYY-MM-DD" — incident date (merit/demerit), or start date (detention/suspension)
  endDate:         string?                                         // detention/suspension only — ISO "YYYY-MM-DD"
  served:          boolean?                                        // detention/suspension only — has the sentence been completed
  issuedBy:        string                                          // uid of the teacher/admin who logged it
  issuedByName:    string                                          // denormalized for display
  issuedByRole:    string                                          // role at write time
  createdAt:       Timestamp                                       // serverTimestamp()
```

**Notes:**
- `studentName`, `className`, `termName`, and `issuedByName` are denormalized at write time, matching the convention used by `timetable_slots`, `exams`, and `assignments` — the browse/search page and the Student Detail section need no additional joined reads.
- `endDate`/`served` are only meaningful for `type: 'detention' | 'suspension'`; omitted entirely for `merit`/`demerit` documents rather than written as `null`, consistent with how optional fields are handled elsewhere in this codebase (e.g. `TimetableSlotDocument.room`).
- No `points`/weight field in v1 — see §Design Decisions and §Deferred Items.
- `date` for detention/suspension represents the *start* of the sentence; `endDate` the end. A same-day detention would have `date === endDate`.

### `reportCards` collection — existing placeholder fields

No schema change needed for the count fields already reserved — just adding the one missing category:

```diff
  gpa: number | null;
+ merits: number | null;       // NEW — not in the original placeholder set
  demerits: number | null;     // was always null; now populated
  suspensions: number | null;  // was always null; now populated
  detentions: number | null;   // was always null; now populated
```

---

## TypeScript Types

Add to `src/lib/firebase.ts`, near `TimetableSlotDocument`/`ExamDocument`/`AssignmentDocument`:

```ts
export type DisciplinaryActionType = 'merit' | 'demerit' | 'detention' | 'suspension';

export type DisciplinaryActionDocument = {
  institutionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  termId: string;
  termName: string;
  type: DisciplinaryActionType;
  reason: string;
  date: string;
  endDate?: string;
  served?: boolean;
  issuedBy: string;
  issuedByName: string;
  issuedByRole: string;
  createdAt: Timestamp | string;
};

export const DISCIPLINARY_ACTION_LABELS: Record<DisciplinaryActionType, string> = {
  merit: 'Merit',
  demerit: 'Demerit',
  detention: 'Detention',
  suspension: 'Suspension',
};
```

Update `ReportCardDocument` (existing type) to add the one missing field:

```diff
  gpa: number | null;
+ merits: number | null;
  demerits: number | null;
  suspensions: number | null;
  detentions: number | null;
```

---

## Permission Model

### Role matrix

| Action | `super_admin` | `institution_admin` | `senior_teacher` | `regular_teacher` | `student` | `parent` |
|---|---|---|---|---|---|---|
| Create (any of the 4 types) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit / delete an entry | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Browse/search all students | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View own record | — | — | — | — | ✅ (self) | ✅ (linked child only) |
| View another student's record | ✅ | ✅ (same institution) | ✅ (same institution) | ✅ (same institution) | ❌ | ❌ |

No severity-based tiering: `regular_teacher` can log a Suspension exactly like `institution_admin` can. This was an explicit choice (see §Design Decisions) — flagged here in case school policy later demands otherwise, since it's a one-line change to the create rule if so.

---

## Firestore Security Rules

To be manually deployed via the Firebase Console (this repo has no `firestore.rules` file — see `firebase-rules.md`'s standing note). Reuses existing helper functions with no new patterns:

```javascript
// ── Disciplinary Actions ──────────────────────────────────────────────────
// Merit/Demerit/Detention/Suspension log. Any teacher-or-above may create an
// entry for any student in their institution. Only admins may edit/delete —
// intentionally not even the original issuer, to keep this closer to an
// audit trail. Read access matches reportCards/feedback_comments exactly:
// staff, the student themself, and their linked parent.
match /disciplinaryActions/{actionId} {
  allow read: if isSignedIn()
    && sameInstitution(resource.data.institutionId)
    && (isTeacherOrAbove()
      || resource.data.studentId == request.auth.uid
      || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
  allow create: if isTeacherOrAbove() && writingToMyInstitution();
  allow update: if isAdminOrAbove()
    && sameInstitution(resource.data.institutionId)
    && institutionNotChanged();
  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

No composite indexes are anticipated. The browse/search page and report-card aggregation both query with equality filters only (`institutionId ==`, optionally `+ studentId ==` or `+ type ==` or `+ termId ==`) — Firestore does not require a composite index for multiple equality filters on their own. **Do not add a server-side `orderBy` on a different field to these queries** without first deploying a matching composite index — this exact mistake caused the Schedule page black-screen incident earlier (unindexed `where(institutionId==) + orderBy(startDate)` on `terms`). Sort client-side after fetching instead.

---

## Form: `DisciplinaryActionForm.tsx`

New file, `src/components/forms/DisciplinaryActionForm.tsx`, following the established pattern from `TimetableSlotForm.tsx`/`ExamForm.tsx` (live Firestore dropdowns, react-hook-form + zod, real `addDoc`/`updateDoc`).

### Fields

| Field | Input | Notes |
|---|---|---|
| Student | Live-searchable dropdown, institution-scoped `users` where `role == 'student'` | Denormalizes `studentName` and `classId`/`className` from the selected student's record on submit |
| Term | Dropdown, institution-scoped `terms` | Client-side sorted, not `orderBy` (see composite index note above) |
| Type | Select: Merit / Demerit / Detention / Suspension | Drives which additional fields render |
| Reason | Textarea, required | Free text |
| Date | Date input, required | Label reads "Date" for Merit/Demerit, "Start Date" for Detention/Suspension |
| End Date | Date input | Only rendered when Type is Detention or Suspension; optional (a sentence can be logged before its end date is known) |
| Served | Checkbox | Only rendered when Type is Detention or Suspension; defaults unchecked |

Because *edit* is admin-only (see §Permission Model), this form's `update` mode should only ever be reachable via a `FormModal` instance rendered for `institution_admin`/`super_admin` — `regular_teacher`/`senior_teacher` only ever see the `create` mode of this form.

### Zod validation schema

```ts
const schema = z.object({
  studentId: z.string().min(1, 'Student is required.'),
  classId: z.string().min(1, 'Class is required.'),
  termId: z.string().min(1, 'Term is required.'),
  type: z.enum(['merit', 'demerit', 'detention', 'suspension']),
  reason: z.string().min(1, 'Reason is required.').max(500),
  date: z.string().min(1, 'Date is required.'),
  endDate: z.string().optional(),
  served: z.boolean().optional(),
});
```

### Firestore write on create

```ts
await addDoc(collection(db, 'disciplinaryActions'), {
  institutionId,
  studentId: formData.studentId,
  studentName,          // resolved from the selected student option
  classId: formData.classId,
  className,             // resolved from the selected student's classId
  termId: formData.termId,
  termName,               // resolved from the terms dropdown
  type: formData.type,
  reason: formData.reason,
  date: formData.date,
  ...(formData.endDate && { endDate: formData.endDate }),
  ...(formData.served !== undefined && { served: formData.served }),
  issuedBy: user.uid,
  issuedByName: displayName,
  issuedByRole: role,
  createdAt: serverTimestamp(),
});
```

---

## `/dashboard/disciplinary-actions` Page

One page, role-aware — matching the existing pattern in `report-cards/index.tsx`.

### Staff view (`institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher`)

- A student-name search input (client-side filter — MDDS entry volume per institution is expected to be low relative to e.g. attendance records, so a single institution-scoped `onSnapshot` with client-side filtering is appropriate, matching the convention used by the Teachers/Students/Parents list pages).
- A type filter: All / Merit / Demerit / Detention / Suspension.
- A table: Student, Type, Reason, Date, Term, Issued By, and (`institution_admin`/`super_admin` only) Edit/Delete actions via `FormModal`.
- A "+" create button, visible to any teacher-or-above, opening `FormModal table="disciplinary_action" type="create"`.

This single view satisfies both "search Merit/Demerit/Detention/Suspension and see all students" (type filter, name search cleared) and "search any student and see their MDDS info" (name search, type filter left on "All").

### Student view

- Same route, query auto-scoped to `where('studentId', '==', user.uid)`.
- Read-only: no search/filter chrome, no create button, no edit/delete actions.
- Same table columns minus "Issued By" role-sensitivity concerns — students see who issued each entry, matching how they already see `teacherName` on feedback comments.

### Parent view

- Same route. Resolves `linkedStudentIds` via the `student_parents` junction collection — the exact pattern already implemented in `report-cards/index.tsx`:
  ```ts
  where('institutionId', '==', institutionId),
  where('studentId', 'in', linkedStudentIds.slice(0, 10)),
  ```
  (same known limitation already documented there: parents with more than 10 linked children will silently miss records beyond the first 10 — chunked queries are a future enhancement, not new to this feature).
- If more than one linked child, a child-picker (matching the pattern already used by `BigCalendar` for parents with multiple children).
- Read-only, same as the student view.

---

## Student Detail Page Integration

New section on `src/scenes/(dashboard)/list/students/[id]/index.tsx`, following the exact pattern already established by the Extra Curricular Activities / Positions of Responsibility / Report Card Comments sections:

- Heading: "Disciplinary Record".
- Term-scoped (uses the same term selector already present on that page).
- Lists each entry for the selected term: Type badge, Reason, Date, Issued By.
- For teacher-or-above viewers: a "+" button opening the same `DisciplinaryActionForm` create modal, pre-scoped to this student (student dropdown pre-selected and — unlike the Report Builder's `initialRole` precedent — likely worth locking outright here, since the whole point of this entry point is "I'm already looking at this specific student").
- For `institution_admin`/`super_admin` viewers only: edit/delete actions per entry.

This gives staff who are already looking up a student (the most common real workflow — "what's this kid's history?") the answer with zero extra navigation, while the dedicated page (previous section) serves the "browse by category" and "I only know a name" workflows.

---

## Report Card Integration

### `generateReportCard.ts`

Add a query alongside the existing attendance/results aggregation, scoped to the student + term being generated:

```ts
const disciplinarySnap = await getDocs(query(
  collection(db, 'disciplinaryActions'),
  where('institutionId', '==', opts.institutionId),
  where('studentId', '==', opts.studentId),
  where('termId', '==', opts.termId),
));

const disciplinaryCounts = { merit: 0, demerit: 0, detention: 0, suspension: 0 };
disciplinarySnap.docs.forEach((d) => {
  const t = d.data().type as DisciplinaryActionType;
  disciplinaryCounts[t] += 1;
});
```

Replace the hardcoded placeholder block:

```diff
- demerits: null,
- suspensions: null,
- detentions: null,
+ merits: disciplinaryCounts.merit,
+ demerits: disciplinaryCounts.demerit,
+ suspensions: disciplinaryCounts.suspension,
+ detentions: disciplinaryCounts.detention,
```

Three equality filters, no `orderBy` — no composite index required (see §Firestore Security Rules note).

### `ReportCardPDF.tsx`

Add four rows to the existing STUDENT SUMMARY `KV` list, directly below the existing Class Average row — same low-risk pattern used for every other summary field, no layout redesign needed:

```tsx
<KV label="Merits"      value={data.merits !== null ? String(data.merits) : '—'} />
<KV label="Demerits"    value={data.demerits !== null ? String(data.demerits) : '—'} />
<KV label="Detentions"  value={data.detentions !== null ? String(data.detentions) : '—'} />
<KV label="Suspensions" value={data.suspensions !== null ? String(data.suspensions) : '—'} />
```

### `REPORT_CARD_SPEC.md`

Once this feature ships, update §9.1 ("Deferred Items — Disciplinary Action data") to mark it resolved, cross-referencing this document — matching the convention already used elsewhere in that file's changelog-style updates.

---

## `FormModal` Registry

`src/components/FormModal.tsx` changes:

1. Add `"disciplinary_action"` to the `TableName` union.
2. Add a `collectionNameFor` override — the default pluralization (`${table}s`) would produce `disciplinary_actions`, not the intended `disciplinaryActions`:
   ```ts
   const overrides: Partial<Record<TableName, string>> = {
     institution_admin: "users",
     class: "classes",
     attendance: "attendance",
     disciplinary_action: "disciplinaryActions",
   };
   ```
3. Lazy-load and register the new form:
   ```ts
   const DisciplinaryActionForm = React.lazy(() => import("./forms/DisciplinaryActionForm"));
   // …
   disciplinary_action: (type, data, onClose) => <DisciplinaryActionForm type={type} data={data} onClose={onClose} />,
   ```
4. Delete confirmation: use the existing generic copy ("All data will be lost. Are you sure you want to delete this disciplinary_action?") **or** add a dedicated branch with clearer wording (e.g. "This will permanently remove this disciplinary record.") — the generic copy reads awkwardly with an underscore in it, so a dedicated branch (matching the existing `subject`-specific branch) is recommended.
5. The Edit and Delete buttons for this table should only be rendered by the calling page (the dedicated page and the Student Detail section) when `role === 'institution_admin' || role === 'super_admin'` — matching §Permission Model. The Create button is rendered for any teacher-or-above role.

---

## Route & Navigation

### `App.tsx`

```tsx
<Route
  path="/dashboard/disciplinary-actions"
  element={<DisciplinaryActionsPage />}
/>
```

No role guard/redirect at the route level — every role can reach this page; the page component itself renders different content per role (matching the `Exams`/`Assignments` precedent, not the `create-user`-style admin-only redirect precedent).

### `Menu.tsx`

```ts
{
  Icon: Gavel, // or ShieldAlert / AlertTriangle — pick one available in lucide-react
  label: "Disciplinary Action",
  href: "/dashboard/disciplinary-actions",
  visible: [
    "super_admin",
    "institution_admin",
    "senior_teacher",
    "regular_teacher",
    "student",
    "parent",
  ],
  id: "tour-sidebar-nav-disciplinary-actions",
},
```

---

## Implementation Order

1. `firebase.ts` — add `DisciplinaryActionDocument`/`DisciplinaryActionType`, add `merits` to `ReportCardDocument`.
2. Deploy Firestore security rules via Firebase Console (manual step, per this repo's standing convention); update `firebase-rules.md` afterward to document the deployed rule.
3. `DisciplinaryActionForm.tsx` — new form component.
4. `FormModal.tsx` — registry entry, `collectionNameFor` override, delete-copy branch.
5. `disciplinary-actions/index.tsx` — new page, role-aware (staff / student / parent branches).
6. `App.tsx` + `Menu.tsx` — route and nav registration.
7. Student Detail page (`list/students/[id]/index.tsx`) — new "Disciplinary Record" section.
8. `generateReportCard.ts` — aggregation query, populate the four fields.
9. `ReportCardPDF.tsx` — four new `KV` rows.
10. `reportBuilder.test.ts` and any other fixture that constructs a full `ReportCardDocument`/`BuilderCard` literal — add the new `merits` field (same mechanical fixup this session already did once for `studentGender`).
11. `REPORT_CARD_SPEC.md §9.1` — mark resolved, cross-reference this doc.

---

## Deferred Items

- **Weighted points per incident** — v1 is a flat count; a `points` field on `DisciplinaryActionDocument` (and a corresponding sum-instead-of-count in the report card aggregation) can be added later without a schema migration.
- **Cumulative-to-date totals** — v1 report card shows per-term counts only. A running "since enrollment" total alongside the per-term one is a natural follow-up once the per-term version has been used for a while.
- **Chunked parent queries beyond 10 linked children** — inherits the same known limitation already documented in `report-cards/index.tsx`; not new to this feature.
- **Notifications** — e.g. a parent receiving an alert when a new entry is logged for their child. Not discussed as part of this spec; would need the messaging-architecture open question (`ISSUES_AND_GAPS.md` Issue #33) resolved first.
- **Severity-based create tiering** — explicitly not in v1 (see §Design Decisions); flagged here as the most likely thing to reconsider if real school usage shows any-teacher-can-suspend to be too permissive in practice.

---

## Issues to Track

- The Navbar's search box (`src/components/Navbar.tsx`) is currently a non-functional, decorative `<input>` with no state or handler. This spec's search UI lives entirely on the dedicated `/dashboard/disciplinary-actions` page and does not depend on or extend the Navbar search — flagged here only so a future "wire up global search" effort doesn't assume MDDS search already flows through it.
- Parent visibility depends on the `student_parents` junction collection being populated correctly for every family — the same pre-existing gaps noted in `ISSUES_AND_GAPS.md` Issue #32 (parent–student linking UI completeness) apply here too.

---

_End of spec._
