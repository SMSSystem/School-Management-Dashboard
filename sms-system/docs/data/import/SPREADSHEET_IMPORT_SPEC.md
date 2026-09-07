# Spreadsheet Import — Feature Spec

> **Status:** Design-complete, unstarted implementation.
> **Companion doc:** [`../export/SPREADSHEET_EXPORT_SPEC.md`](../export/SPREADSHEET_EXPORT_SPEC.md) — the existing, already-shipped export feature this spec is the counterpart to. This doc assumes familiarity with it but does not require reading it first.
> **Date documented:** 2026-09-07

## Table of Contents

1. [Feature Overview & Goals](#1-feature-overview--goals)
2. [Scope Decisions (Decision Log)](#2-scope-decisions-decision-log)
3. [Identity Resolution & Disambiguation](#3-identity-resolution--disambiguation)
4. [Shared Import Library](#4-shared-import-library)
5. [Shared Import UI Flow](#5-shared-import-ui-flow)
6. [Import Target: Results](#6-import-target-results)
7. [Import Target: MDDS (Disciplinary Actions)](#7-import-target-mdds-disciplinary-actions)
8. [Import Target: Gradebook](#8-import-target-gradebook)
9. [Import Target: General Attendance](#9-import-target-general-attendance)
10. [Import Target: Subject Attendance](#10-import-target-subject-attendance)
11. [Security & Access Control](#11-security--access-control)
12. [Firestore Writes & Free-Tier Analysis](#12-firestore-writes--free-tier-analysis)
13. [Downloadable Templates (the UI-visible format guide)](#13-downloadable-templates-the-ui-visible-format-guide)
14. [Error Handling & Reporting](#14-error-handling--reporting)
15. [Dependencies](#15-dependencies)
16. [Testing Plan](#16-testing-plan)
17. [Implementation Order](#17-implementation-order)
18. [Deferred / Out of Scope](#18-deferred--out-of-scope)
19. [Open Questions / Risks](#19-open-questions--risks)

---

## 1. Feature Overview & Goals

Let a user upload a spreadsheet (CSV or XLSX) to bulk-populate one of five data
domains: **Results, MDDS (disciplinary actions), Gradebook, General
Attendance, Subject Attendance** — instead of entering each record one at a
time through the existing forms/registers. This originated as
`internal/in-regards-to-dev-notes/DEV_NOTES_ANALYSIS.md` items 14–17 (Gradebook,
General Attendance, Subject Attendance import; generic "export any data"),
narrowed and corrected against the actual codebase before this spec was
written — the dev notes' "no free-tier concern, comparable to PDF generation"
verdict undersold the real scope (see §12) and didn't account for the
identity-resolution problem (see §3), so several of its framings are
superseded here rather than carried forward.

**Goals:**

- Bulk-create Results, MDDS events, Gradebook grades, and Attendance records from a spreadsheet, using each target's existing Firestore write shape and security rules — no schema or rules changes.
- Support both CSV and XLSX upload, matching the two formats the existing export feature already produces.
- Give the importing user clear, per-row feedback before anything is written — no opaque Firestore rejections after the fact.
- Stay entirely client-side, same as export — no Cloud Functions, no Blaze-plan requirement.

**Non-goals (see §18 for the full list):**

- Creating new Gradebook columns, classes, subjects, or terms via import — a spreadsheet references existing structure, it doesn't create it.
- Importing on behalf of another user (admin importing "as" a named teacher) — see §2.
- Directly overwriting the derived MDDS aggregate counts on report cards — see §7.

---

## 2. Scope Decisions (Decision Log)

| Decision                                     | Choice                                                                                                                                                                                               | Rationale                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity resolution                          | Name-based matching with interactive disambiguation (§3)                                                                                                                                             | No existing export surface emits raw Firestore IDs for students/classes/subjects/terms (verified across Results, Report Cards, and Gridsheet exports) — a purely ID-based scheme would require a bespoke, hidden-column export variant and would block hand-authored spreadsheets entirely. |
| Initial scope                                | All 5 targets in one feature, not phased                                                                                                                                                             | User decision — accepted despite Attendance's meaningfully higher implementation complexity (§9, §10) relative to Results/MDDS.                                                                                                                                                             |
| Who can import                               | `institution_admin`, plus each other role within its **existing** write scope (e.g. `regular_teacher` for their own subject's Results; `senior_teacher` for their own homeroom's General Attendance) | Mirrors manual-entry permissions exactly — see §11. No new role capability is introduced.                                                                                                                                                                                                   |
| Admin importing on behalf of a named teacher | **Not supported.** An admin-run import is always attributed to the admin (`teacherId`/`issuedBy` = the admin's own uid), same as any other admin-authored write today.                               | Avoids a `firestore.rules` change. If a school needs per-teacher attribution, each teacher runs their own import.                                                                                                                                                                           |
| Import size cap                              | Hard cap at **2,000 total document writes** per import operation, with a pre-commit estimate shown regardless of size                                                                                | ~10% of the 20,000-writes/day Spark quota (§12) — leaves headroom for the rest of the app's normal daily write activity. Adjustable constant, not a hard architectural limit.                                                                                                               |
| Partial vs. all-or-nothing commit            | **All-or-nothing.** No document is written until every row is either auto-matched or manually resolved.                                                                                              | Simpler mental model; matches this app's existing all-or-nothing `writeBatch` precedent (report-cards' rank/average write-back is a deliberate _second pass_, not a partial commit within one operation — see §12).                                                                         |
| MDDS import target                           | Individual `disciplinaryActions` event rows (§7)                                                                                                                                                     | Keeps `merits`/`demerits`/`detentions`/`suspensions` on `reportCards` as always-derived, never-directly-settable values — consistent with how `generateReportCard.ts` already treats them everywhere else in the app.                                                                       |
| File formats accepted                        | CSV and XLSX                                                                                                                                                                                         | Symmetric with the two formats the export feature already produces.                                                                                                                                                                                                                         |
| New Gradebook columns via import             | **Not supported in v1.** A row's `gradebookColumnId` reference must match an existing column; unresolvable references are reported as errors, not auto-created.                                      | Creating columns implicitly raises its own product question (how do new columns' weights interact with existing ones, since `columnWeight` is per-column and admin-set today) that's out of scope here — see §18.                                                                           |
| Dependency                                   | Reuse `@e965/xlsx` (already installed) for both CSV and XLSX parsing; no new package                                                                                                                 | See §15.                                                                                                                                                                                                                                                                                    |
| CSV parsing robustness                       | Confirmed, not assumed — see §19.1                                                                                                                                                                   | Empirically tested against `@e965/xlsx` as actually installed in this repo, not inferred from SheetJS documentation alone.                                                                                                                                                                 |
| Import UI structure                          | One dedicated `/dashboard/import` route, target chosen as an in-page step — see §19.2                                                                                                               | Firm default so implementation isn't blocked on a UI-shell decision; revisitable without affecting §4's library design, which is UI-shell-agnostic.                                                                                                                                       |
| Results/MDDS duplicate-submission handling   | Advisory warning at the pre-commit summary step, never blocking — see §19.3                                                                                                                          | Surfaces the risk without adding a new hard-block failure mode; re-importing intentionally (a genuine correction re-run) stays possible without a bypass step.                                                                                                                             |

---

## 3. Identity Resolution & Disambiguation

**The problem:** every existing export path (`buildResultExportColumns` in
`src/scenes/(dashboard)/list/results/index.tsx`, `reportCardExportColumns` in
`src/scenes/(dashboard)/report-cards/index.tsx`, and the Gridsheet exporter
in `src/lib/gridsheetExports.ts`) resolves students/classes/subjects/terms
down to **display names** before writing a cell — none of them emit the
underlying Firestore document ID. Report Cards' export does include a
"Student ID" column, but that's `UserDocument.institutionStudentId` — an
optional, admin-editable, only-uniqueness-checked-at-write-time field
(`firebase.ts`), not an immutable key. Nothing in the data model prevents two
students sharing a display name within the same institution. A spreadsheet
therefore cannot be assumed to uniquely identify a record by name alone.

**The resolution flow, per identity column (Student, Class, Subject, Term,
and — for Gradebook — the assessment/column reference):**

1. For each distinct value in an identity column, query the current
   institution's live data for name matches (case-insensitive, trimmed).
2. **Exactly one match** → auto-resolve silently, no user interaction.
3. **Zero or multiple matches** → added to a **Needs Resolution** list,
   surfaced to the importing user before any write happens. Each entry shows
   the ambiguous/unmatched value plus a dropdown of live candidates (for
   multiple matches) or a clear "no match found" state (for zero matches)
   with the option to correct the spreadsheet value's spelling and re-check,
   or explicitly skip that row.
4. Per the all-or-nothing decision (§2), the import cannot proceed to the
   commit step (§5) while any row remains unresolved.

**Student identity specifically:** prefer matching against
`institutionStudentId` first (when the column is present and populated in the
spreadsheet), falling back to name matching only when it isn't — this gives
users who _do_ have consistent school ID numbers a cleaner, lower-ambiguity
path, without requiring it.

**Gradebook column identity:** resolved against the target gradebook's
existing `columns` subcollection (§8) by label match, with the same
zero/one/multiple resolution flow.

---

## 4. Shared Import Library

New module, `src/lib/spreadsheetImport.ts` — the read-side counterpart to
`src/lib/spreadsheetExport.ts` (which remains write-only and untouched by
this feature).

- **`parseSpreadsheetFile(file: File): Promise<RawRow[]>`** — reads a `File`
  (from an `<input type="file">` or drag-and-drop) via `@e965/xlsx`'s
  `XLSX.read()`, which accepts both XLSX binary and raw CSV input, and
  returns an array of plain row objects keyed by header. One function
  handles both formats — no separate CSV/XLSX code paths.
- **`type ImportColumn<T> = { header: string; required: boolean; parse: (raw: string) => ... }`**
  — the read-side mirror of `spreadsheetExport.ts`'s `ExportColumn<T>`, one
  column-definition array per target (§6–§10) driving both the structural
  validation (required headers present) and the per-cell type/format
  parsing (dates, numbers, enum values).
- **`resolveIdentities(rows, resolvers): { resolved: T[]; needsResolution: AmbiguousEntry[] }`**
  — implements the flow in §3, generically over whichever identity columns a
  given target declares.
- **`validateRows(rows: T[], rules): { valid: T[]; errors: RowError[] }`** —
  per-target business-rule validation that mirrors (but runs client-side,
  ahead of) the equivalent Firestore rule constraint, so failures produce a
  specific per-row message instead of a Firestore permission-denied (§14).
  E.g. for Results: `score <= maxScore`, mirroring the rule at
  `firestore.rules` (§11).
- **`chunkedBatchWrite(writes: PendingWrite[], db): Promise<CommitResult>`** —
  new, since no existing `writeBatch` call site in this codebase chunks past
  Firestore's 500-operation batch limit (every current site is small enough
  to assume one batch is enough). Splits into multiple sequential
  `writeBatch()` commits of ≤450 operations each (matching the existing
  safety margin used in `scripts/backfill-department-ids.mjs`'s
  `BATCH_LIMIT = 450`), reporting `{done, total, errors}` progress after each
  chunk — the same shape `report-cards/index.tsx`'s `BatchProgress` already
  uses for its own bulk operation, reused here for UI consistency rather than
  inventing a new progress-reporting shape.

---

## 5. Shared Import UI Flow

One shared flow, parameterized by target (Results / MDDS / Gradebook /
General Attendance / Subject Attendance) — a new, dedicated
`/dashboard/import` route (not a modal — bulk operations with a multi-step
resolution/validation flow warrant their own page, unlike `ExportMenu`'s
single-action dropdown), with target selection as the flow's first in-page
step rather than a separate route per target. Resolved in §19.2; see there
for the reasoning against per-target routes and against a modal.

1. **Target selection** — which of the 5 domains, gated by the current
   user's role/scope (§11) so a `regular_teacher` is never offered General
   Attendance, for example.
2. **Template download** (§13) — offered inline before upload.
3. **File upload** — drag-and-drop or file picker, CSV or XLSX.
4. **Structural validation** — required headers present, correct target
   detected (or mismatched-template warning).
5. **Identity resolution** (§3) — blocks progress until every row is
   resolved.
6. **Business-rule validation** (§4, §14) — per-row errors shown; per the
   all-or-nothing decision, rows with hard errors must be fixed (re-upload)
   or the whole import cancelled — no partial proceed.
7. **Pre-commit summary** — "N documents will be created/updated," estimated
   write count, and the hard-cap check (§12) — a count above 2,000 is
   rejected outright with guidance to split the file, rather than silently
   truncated. For Results and MDDS specifically, also shows an **advisory
   duplicate count** — how many rows' identity columns match an
   already-existing document — without blocking; see §19.3.
8. **Commit** — `chunkedBatchWrite` (§4) with a live progress indicator.
9. **Result summary** — success count, and a downloadable error report for
   any hard Firestore-level failures that weren't caught by client-side
   validation (permission-denied on a row the resolution step should have
   prevented, network errors mid-commit, etc.).

---

## 6. Import Target: Results

**Target collection:** `institutions/{institutionId}/results/{resultId}`
(auto-ID, one new document per row — no upsert-by-natural-key logic exists
for manual Results entry either, per `ResultForm.tsx`, so import follows the
same always-create convention rather than inventing dedup behavior the
existing feature doesn't have). Always-create means re-importing the same
file twice creates duplicates — surfaced as an advisory, non-blocking count
at the pre-commit summary step (§5 step 7, §19.3), not prevented outright.

**Required columns:** Student, Class, Subject, Term, Assessment Name,
Assessment Type (`coursework`/`exam`), Score, Max Score. **Optional:**
Weight, Date.

**Identity columns:** Student, Class, Subject, Term (§3).

**Validation:** `score <= maxScore` (mirrors the `firestore.rules` create
constraint on `results`).

**Written fields** (matching `ResultDocument`, `firebase.ts`, and
`ResultForm.tsx`'s create path): `studentId, studentName, teacherId (importing
user's own uid), teacherName, classId, className, termId, institutionId,
departmentId, subjectId, assessmentName, assessmentType, score, maxScore,
weight?, date?, createdAt`. No `gradebookColumnId`/`source: 'gradebook'` —
imported rows are indistinguishable from manual `ResultForm` entries, not
attributed to the Gradebook pipeline.

---

## 7. Import Target: MDDS (Disciplinary Actions)

**Target collection:**
`institutions/{institutionId}/disciplinaryActions/{actionId}` (auto-ID, one
new document per row — same advisory duplicate-count treatment as Results,
§6, §19.3, since this is also always-create with no upsert key).

**Required columns:** Student, Class, Term, Type
(`merit`/`demerit`/`detention`/`suspension`), Reason, Date. **Optional:**
End Date, Served (only meaningful for `detention`/`suspension` — omitted
entirely from the written document for `merit`/`demerit` rows, mirroring
`DisciplinaryActionForm.tsx`'s existing omit-not-null convention).

**Identity columns:** Student, Class, Term (§3).

**Validation:** `type` must be one of the 4 enum values; `reason` ≤ 500
characters (matches `DisciplinaryActionDocument`'s existing constraint).

**Written fields:** `institutionId, studentId, studentName, classId,
className, termId, termName, type, reason, date, endDate?, served?, issuedBy
(importing user's own uid), issuedByName, issuedByRole, createdAt`.

**Deliberately not the import target:** `ReportCardDocument.merits` /
`demerits` / `detentions` / `suspensions` — these are always computed by
`generateReportCard.ts` from the `disciplinaryActions` event log at report
card generation time (§2 decision log). Importing individual events keeps
this invariant intact automatically; no separate reconciliation step is
needed.

---

## 8. Import Target: Gradebook

**Target:** grade cells, written as `ResultDocument`s with
`gradebookColumnId`/`source: 'gradebook'` set — same as `performSave` in
`src/scenes/(dashboard)/list/gradebook/index.tsx` — **not** the
`GradebookDocument`/`GradebookColumnDocument` structural records themselves
(§2 decision: import fills existing columns, it doesn't create them).

**Required columns:** Student, Class, Subject, Term, Column (matched against
an existing Gradebook column's label — §3), Score. **Max Score** and
**Weight** are read from the resolved column, not the spreadsheet, since
`GradebookColumnDocument.maxScore`/`columnWeight` are already fixed at
column-creation time and importing a conflicting value per-row would create
inconsistency within one column.

**Identity columns:** Student, Class, Subject, Term, Column.

**Upsert behavior:** mirrors `performSave`'s existing dedup key —
`(gradebookColumnId, studentId)`. If a result already exists for that pair,
the import **updates** it (matching the in-page edit behavior); otherwise it
creates a new one. This is the one target where import can modify existing
data, not just add new records — worth surfacing prominently in the
pre-commit summary (§5 step 7) as "N created, M updated," not just a single
count.

**Feedback comments/conduct grades** (`FeedbackCommentDocument`, deterministic
doc ID `${studentId}_${subjectId}_${termId}`) are **out of scope for v1** —
see §18. Only grade cells are imported.

---

## 9. Import Target: General Attendance

The structurally hardest target: attendance is stored **one document per
class + date + session**, holding a `records` map keyed by student
(`GeneralAttendanceDocument`, `firebase.ts`) — not one document per student
per day. A spreadsheet with one row per student per day must be **grouped**
before writing, not written row-by-row.

**Required columns:** Class, Date, Session (`AM`/`PM`), Student, State
(`P`/`A`/`L`/`S`/`E`/`B`). **Optional:** Reason (only meaningful, and only
validated, when State is `E`).

**Identity columns:** Class, Student (§3). Term/academic year are derived
from the Class + Date (looked up against the class's own term/academic-year
assignment), not separate spreadsheet columns — asking the user to also
supply Term redundantly per row risks an internally-inconsistent file (a date
that doesn't actually fall within the stated term).

**Grouping and merge behavior:** rows are grouped by `(classId, date,
session)` into the target document's `records` map shape. **Critically, this
must merge into an already-existing day's document rather than overwrite
it** — if a General Attendance document already exists for that
class+date+session (some students already marked through the normal UI), the
import writes only the students present in the spreadsheet into that
existing `records` map, leaving any other already-marked students'
entries untouched. A full-overwrite import (spreadsheet redefines the entire
day) is out of scope for v1 (§18) given the real risk of silently erasing
already-entered marks for students the file happens to omit.

**Post-import step, required:** `attendanceSummaryUtils.ts`'s
`rebuildSummariesForClass` only reads `generalAttendance` — a bulk General
Attendance import leaves the derived `attendanceSummaries` aggregate stale
until this is re-run. The import flow's result summary (§5 step 9) should
either trigger this automatically for every affected class+term, or
explicitly prompt the user to run the existing "Rebuild Attendance
Summaries" admin tool before relying on attendance-rate figures elsewhere in
the app.

---

## 10. Import Target: Subject Attendance

Structurally the same shape as General Attendance (§9) — grouped rows into a
`records` map — with two differences:

- Grouping key is `(subjectId, classId, sessionDate)`, not
  `(classId, date, session)` — there's no AM/PM session split; matched
  against existing documents by `sessionDate` (mirroring `subject/index.tsx`'s
  own existing-doc lookup).
- **Required columns:** Subject, Class, Date, Student, State. No Session
  column.

Same merge-not-overwrite requirement as §9. No separate summary-rebuild step
— `rebuildSummariesForClass` doesn't read `subjectAttendance` today, so a
Subject Attendance import doesn't affect that aggregate at all (existing
behavior, unrelated to this feature).

---

## 11. Security & Access Control

**No `firestore.rules` changes are required.** Every import write goes
through the exact same `create`/`update` rule as the equivalent manual-entry
form, because imports run entirely as the authenticated importing user —
never on behalf of anyone else (§2 decision). This is a direct consequence
of that decision, not a separate design choice.

This means the rules **constrain which targets a given user can actually
import**, exactly mirroring today's manual-entry restrictions — the import
UI's target-selection step (§5 step 1) must gate on the same conditions:

| Target                                         | Who can write it (per existing `firestore.rules`)                                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Results                                        | `institution_admin`/`super_admin`; `senior_teacher` for their own department; `regular_teacher` only for subjects where their uid is in that subject's `teacherIds`                                            |
| MDDS (`disciplinaryActions`)                   | Any of `institution_admin`/`super_admin`/`senior_teacher`/`regular_teacher` can **create**; only admin-or-above can **update** (irrelevant here — import only creates)                                         |
| Gradebook (`results` with `gradebookColumnId`) | Same as Results above                                                                                                                                                                                          |
| General Attendance                             | `institution_admin`/`super_admin`, or `senior_teacher` **only for their own assigned homeroom class** (`users/{uid}.assignedClassId`) — `regular_teacher` cannot write this at all, so cannot import it either |
| Subject Attendance                             | `institution_admin`/`super_admin`, or `regular_teacher` for subjects where their uid is in that subject's `teacherIds`                                                                                         |

No collection in this set uses `hasAll()`/`hasOnly()` field-shape pinning
(that pattern exists only on the public `enrollmentRegistrations` collection,
unrelated to this feature) — the one binding per-document constraint that
matters is `results`' `score <= maxScore`, replicated client-side per §4/§6.

---

## 12. Firestore Writes & Free-Tier Analysis

Unlike the export feature — which is explicitly documented as performing
**zero writes** (`SPREADSHEET_EXPORT_SPEC.md` §8) — import's entire purpose
is writes, against Spark's **20,000 writes/day** ceiling
(`docs/firebase/MISCELLANEOUS_INFO.md`, "Free-Tier Considerations"). This is
the reason the dev notes' original "no free-tier concern" verdict for this
feature doesn't hold up on closer inspection (§1) — it reasoned by analogy to
export/PDF generation, both zero-write operations.

- **Per-row cost:** Results and MDDS are 1 write per row. Gradebook is 1
  write per row (update or create). Attendance is **sub-linear** — many rows
  collapse into few documents (1 write per unique class+date+session
  combination, not per student-row), so a full class's daily attendance for
  a week is ~5-10 writes total, not one per student per day.
- **Realistic worst case:** a full term of Results for one class (e.g. 30
  students × 5 subjects × 6 assessments) is ~900 writes — under the 2,000
  cap (§2) comfortably. A whole-institution attendance backfill for a full
  term (200 students, one class-level document per day) is a few hundred
  writes at most, per the sub-linear cost above.
- **Hard cap enforcement:** the 2,000-write cap (§2) is checked at the
  pre-commit summary step (§5 step 7), before any write happens — computed as
  the actual resolved write count (post-grouping for Attendance, so the cap
  reflects real document writes, not raw spreadsheet row count).
- **Quota reset:** per this repo's existing precedent for other bulk
  operations (`docs/overhaul/CUTOVER_RUNBOOK.md`), Firestore's daily quotas
  reset every 24 hours — a rejected-for-size import can simply be split
  across two days or two smaller files, not a permanent block.

---

## 13. Downloadable Templates (the UI-visible format guide)

Per the earlier feasibility discussion, a prose-only manual was judged
insufficient given the identity-resolution ambiguity, per-target column
differences, and enum/format constraints users can't be expected to intuit.

**Design:** each of the 5 targets gets an **app-generated downloadable
template** (CSV and XLSX, matching the accepted upload formats), offered
directly in the import UI (§5 step 2) before upload — generated from the same
`ImportColumn<T>` definitions (§4) the parser itself validates against, so
the template and the actual accepted format can never drift apart the way a
hand-maintained prose doc could. Each template ships with one example row
demonstrating valid values (a real state letter, a real assessment type,
correctly formatted date) rather than being header-only, since a worked
example resolves more ambiguity than a column-name list alone.

Inline UI guidance (tooltips or a help panel, not a separate static doc)
covers: which columns are identity columns and how disambiguation works
(§3), valid enum values per target, and the merge-not-overwrite behavior for
Attendance (§9, §10) — this last point specifically, since it's the one
behavior most likely to surprise a user who doesn't read a manual first.

---

## 14. Error Handling & Reporting

Three distinct error classes, surfaced differently:

1. **Structural errors** (missing required column, unrecognized target) —
   caught immediately on upload, before any parsing of individual rows.
2. **Per-row validation errors** (§4's `validateRows`) — a specific,
   actionable message per row (e.g. "Row 47: score (95) exceeds max score
   (90)"), shown before commit. Per the all-or-nothing decision (§2), these
   block the import until fixed (re-upload) — there is no "skip this row and
   continue" option in v1, consistent with not silently dropping data the
   user asked to import.
3. **Commit-time failures** (a write rejected by Firestore despite passing
   client-side validation — e.g. a permission change mid-import, a network
   drop) — genuinely rare given client-side validation mirrors the rules
   (§11), but handled via the same non-aborting per-item error accumulation
   pattern `report-cards/index.tsx`'s batch generation already uses
   (`BatchProgress.errors`), reused rather than reinvented. The result
   summary (§5 step 9) surfaces these with a downloadable error report
   (row + reason), so a large import's few genuine failures don't require
   re-deriving which rows succeeded from the original file by hand.

---

## 15. Dependencies

**No new dependency.** `@e965/xlsx` (`package.json`, already installed for
the export feature) supports `XLSX.read()` for both XLSX and raw CSV input —
the app just doesn't call it anywhere yet (`spreadsheetExport.ts` is
write-only today). This also supersedes the dev notes' original
`exceljs` package recommendation (2026-08-27) — that decision predates the
export feature's actual implementation choice of `@e965/xlsx` over the
originally-assumed `xlsx` (chosen for CVE reasons, per
`SPREADSHEET_EXPORT_SPEC.md` §10), and there's no reason to add a second,
differently-audited spreadsheet library for the read side when the one
already in the app covers it.

CSV edge-case robustness is confirmed, not assumed — see §19.1 for the
direct empirical test against the actual installed package.

---

## 16. Testing Plan

- Unit tests for `spreadsheetImport.ts`: `parseSpreadsheetFile` (CSV and
  XLSX round-trip against the export feature's own `spreadsheetExport.ts`
  output, and against hand-crafted edge-case files), `resolveIdentities`
  (zero/one/multiple-match cases per identity column type), `validateRows`
  (the `score <= maxScore` case and each enum-validation case per target),
  `chunkedBatchWrite`'s chunking boundary (exactly 450, 451, 900 writes).
- Manual QA per target (§6–§10): a clean, unambiguous file; a file with at
  least one duplicate-name ambiguity requiring manual resolution; a file
  with at least one hard validation error; for Attendance specifically, an
  import against a class+date+session that already has some students marked
  through the normal UI, confirming the merge behavior doesn't erase them.
- Role-gating QA: confirm each role only sees the targets §11's table says
  they can write, and that an import correctly fails/is blocked for a target
  outside the current user's scope (defense in depth beyond just hiding the
  UI option).

---

## 17. Implementation Order

1. `src/lib/spreadsheetImport.ts` — parsing, validation, and
   `chunkedBatchWrite` primitives (§4), unit-tested in isolation before any
   UI exists.
2. Results import (§6) — the structurally simplest target, proves the shared
   flow end to end (identity resolution, validation, commit, error
   reporting) before tackling Attendance's added grouping complexity.
3. MDDS import (§7) — same shape as Results, low incremental cost once step 2
   lands.
4. Shared import UI (§5) — built against Results/MDDS first, then
   parameterized for the remaining targets rather than built generically
   up front against unproven requirements.
5. Gradebook import (§8) — introduces the create-vs-update dual behavior.
6. General Attendance import (§9) — the grouping/merge logic, plus the
   summary-rebuild follow-up step.
7. Subject Attendance import (§10) — reuses §9's grouping logic with the
   narrower column set.
8. Downloadable templates (§13) — generated from the same column
   definitions used by step 1, so this can land any time after step 1 without
   blocking on later targets.

---

## 18. Deferred / Out of Scope

- **Creating new Gradebook columns, classes, subjects, or terms via import**
  (§2, §8) — a spreadsheet references existing structure only.
- **Feedback comments / conduct grades via Gradebook import** (§8) — only
  grade cells are in scope for v1.
- **Full-day overwrite for Attendance** (§9) — import only merges into an
  existing day's `records` map, never replaces it wholesale.
- **Admin importing on behalf of a named teacher** (§2) — every import is
  attributed to the importing user.
- **Partial-commit / resume-later imports** (§2) — all-or-nothing only.
- **Directly overwriting `reportCards`' derived MDDS counts** (§7) — always
  derived from `disciplinaryActions`.

---

## 19. Open Questions / Risks

All three items originally raised here are now resolved — kept as
subsections rather than deleted, so the reasoning stays visible rather than
only the conclusion.

### 19.1 CSV edge-case handling — resolved: confirmed via direct test

`@e965/xlsx`'s CSV robustness wasn't taken on faith from SheetJS
documentation — it was tested directly against the actual package installed
in this repo (`@e965/xlsx@0.20.3`, per `package.json`). Test input:

```csv
Student,Class,Note
"Doe, Jane","Class A","Contains a comma, right there"
"Smith, ""Bobby"" John","Class B","Line one
Line two (embedded newline)"
Plain Value,Class C,No quoting needed
```

Parsed via `XLSX.read(csv, { type: "string" })` +
`XLSX.utils.sheet_to_json(sheet, { defval: null })`. Result — every field
round-tripped correctly:

- A quoted field containing a comma (`"Doe, Jane"`) parsed as one field,
  comma intact, not split into two columns.
- A quoted field containing doubled/escaped quotes (`""Bobby""`) correctly
  unescaped to a literal `"Bobby"` inside the string.
- A quoted field containing an embedded newline parsed as a single
  multi-line field value, not split into two rows.
- Plain, unquoted values parsed unchanged.

**Conclusion:** no CSV-parsing library beyond `@e965/xlsx` is needed — the
dependency decision in §2/§15 stands confirmed, not just assumed. Character
encoding beyond UTF-8 (e.g. a spreadsheet saved with a legacy Windows
codepage) wasn't tested and remains a real-world edge case worth keeping in
mind during implementation, though it's a narrower, lower-likelihood risk
than the structural quoting/escaping cases above.

### 19.2 Import UI structure — resolved: one dedicated route, in-page target selection

Decided against both alternatives considered:

- **A modal**, like `ExportMenu` — rejected because export is a single,
  reversible, read-only action suited to a dropdown-triggered modal, while
  import is a multi-step flow (upload → resolve → validate → confirm →
  commit → result) with real state to preserve across steps and a
  consequential, hard-to-casually-dismiss final action. A modal would either
  need to grow into something modal-shaped work was never meant to hold, or
  constantly fight its own container.
- **A separate route per target** (`/dashboard/import/results`,
  `/dashboard/import/attendance`, etc.) — rejected because the 5 targets
  share every step of the flow (§5) except the target-specific column
  definitions (§6–§10), which are just data, not different UI. Five routes
  would mean five places to keep the shared flow in sync, for no benefit
  over one route with target as the first in-page step.

**Decision:** one `/dashboard/import` route; role-gated target options (§11)
presented as the flow's first step, consistent with how `ExportMenu` already
centralizes multiple targets behind one component rather than one per
target — the same underlying instinct, applied to the route level here
instead of the component level, since import's multi-step nature doesn't
fit inside a menu-triggered popup the way export's single action does.

### 19.3 Duplicate-submission handling — resolved: advisory warning, no hard block

**Decision:** at the pre-commit summary step (§5 step 7), Results and MDDS
imports show an additional count — "N of these rows match an already-existing
record" — computed by checking each row's identity columns (Student, Class,
Subject/Type, Term, plus Assessment Name for Results or Date for MDDS)
against existing documents, the same identity-resolution machinery already
built for §3. This is purely informational: it never blocks the commit step,
unlike the hard validation errors in §14.

This was a genuine three-way trade-off (see §2's decision-log entry):
accepting the risk silently (matches `ResultForm.tsx`'s existing manual-entry
behavior exactly, simplest to build) vs. a hard block (consistent with how
`score <= maxScore` is already treated, but forecloses a legitimate
intentional re-entry — e.g. a corrected re-import after fixing a mistake in
the source file — without an explicit bypass mechanism this spec would then
also need to design). The advisory middle ground surfaces the risk at
exactly the moment it matters (right before the irreversible commit) without
adding a new blocking failure mode nobody asked for, and without needing a
bypass mechanism since nothing is ever blocked in the first place.
