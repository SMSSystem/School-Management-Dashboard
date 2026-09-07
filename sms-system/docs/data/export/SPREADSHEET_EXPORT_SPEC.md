# Spreadsheet Export — Feature Spec

> **Status:** Draft — not yet implemented
> **Feature:** CSV / XLSX spreadsheet export for the Attendance Summary Register, Results, and Report Cards
> **Date documented:** 2026-09-02
> **Branch:** `spreadsheet-export`
> **Routes touched:** `/dashboard/attendance/gridsheet`, `/dashboard/list/results`, `/dashboard/report-cards`
> **Primary roles:** `institution_admin`, `senior_teacher`, `regular_teacher` (per-target detail in §9)
> **Depends on / builds on:** [`docs/attendance/ATTENDANCE_SUMMARY_REGISTER_SPEC.md`](../../attendance/ATTENDANCE_SUMMARY_REGISTER_SPEC.md) §18 (existing CSV/XLSX draft for the gridsheet), [`docs/firebase/MISCELLANEOUS_INFO.md`](../../firebase/MISCELLANEOUS_INFO.md) (Free-Tier Considerations)
> **Explicitly out of scope:** Spreadsheet **import** (bulk user creation via CSV) — deferred to a future branch; a placeholder spec location exists at `docs/data/import/` but is intentionally empty as of this document

## Table of Contents

1. [Feature Overview & Goals](#1-feature-overview--goals)
2. [Scope Decisions (Decision Log)](#2-scope-decisions-decision-log)
3. [Shared Export Library](#3-shared-export-library-srclibspreadsheetexportts)
4. [Shared Export UI Component](#4-shared-export-ui-component-exportmenu)
5. [Export Target: Attendance Summary Register (Gridsheet)](#5-export-target-attendance-summary-register-gridsheet)
6. [Export Target: Results](#6-export-target-results)
7. [Export Target: Report Cards](#7-export-target-report-cards)
8. [Firestore Reads & Free-Tier Analysis](#8-firestore-reads--free-tier-analysis)
9. [Security & Access Control Summary](#9-security--access-control-summary)
10. [Dependencies](#10-dependencies)
11. [File Naming Conventions](#11-file-naming-conventions)
12. [Testing Plan](#12-testing-plan)
13. [Implementation Order](#13-implementation-order)
14. [Deferred / Out of Scope](#14-deferred--out-of-scope)
15. [Open Questions / Risks](#15-open-questions--risks)

---

## 1. Feature Overview & Goals

This app currently exports data in exactly one format — PDF, via `@react-pdf/renderer`, fully client-side, with three independent hand-built modal implementations (`PDFPreviewModal.tsx`, the Attendance Gridsheet's inline modal, `ReportCardPDFModal.tsx`). PDF is good for printing and archival but useless for further analysis — a school administrator who wants to pivot a term's results in Excel, or hand a spreadsheet to an auditor, currently has no path to that.

This feature adds **CSV and XLSX export** to three existing pages, plus the shared infrastructure (a data-layer library and a UI component) to support both those three targets and any future export target without re-deriving the pattern each time.

**Goals:**

- Add CSV + XLSX download to the Attendance Summary Register, Results, and Report Cards pages.
- Do it entirely client-side, consistent with how every other export in this app already works — no backend, no Cloud Functions, no Firebase Storage involvement.
- Introduce exactly one shared low-level write library and one shared trigger UI component, used by all three targets, rather than three more bespoke implementations.
- Do not increase Firestore read/write pressure beyond what each page already pays today, wherever avoidable (see §8).
- Do not silently carry forward or worsen an existing data-visibility gap (see §2, §6, §9).

**Non-goals:** spreadsheet import, PDF-format changes, retrofitting the existing PDF-only pages (gridsheet/report cards) to also use the new shared UI component (possible later, not required now — see §14).

---

## 2. Scope Decisions (Decision Log)

These decisions were made in conversation before this document was written, each with a rationale, and are treated as settled unless revisited explicitly.

| Decision                      | Choice                                                                                                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import vs. export this branch | **Export only**                                                                                                                                                                                                 | Bulk import requires per-row Firebase Auth account creation with no backend/Admin SDK to batch it safely — a separate, larger effort. Export is low-risk and partly pre-designed already (§18 of the Attendance Summary Register spec).                                                                                                                                                                                                                                                                                                                                                                                          |
| File formats                  | **CSV + XLSX**                                                                                                                                                                                                  | CSV needs no new dependency and covers flat tabular data (Results, Report Cards). XLSX (via SheetJS) is needed for the Gridsheet's merged, multi-row header layout, which CSV cannot represent.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Export targets                | **Attendance Summary Register, Results, Report Cards**                                                                                                                                                          | Gridsheet has existing design groundwork; Results and Report Cards were explicitly requested. Audit log export (a separately tracked gap, [`ISSUES_AND_GAPS.md`](../../ISSUES_AND_GAPS.md) #26) is excluded from this pass.                                                                                                                                                                                                                                                                                                                                                                                                      |
| "Roster"                      | **Dropped as a separate target**                                                                                                                                                                                | No "roster" concept exists anywhere in the codebase today. Rather than inventing one, this spec scopes the "Results/roster" ask down to Results export only. A class-roster export (from the Students list) can be spec'd separately later if wanted.                                                                                                                                                                                                                                                                                                                                                                            |
| Results export access         | **Admin/teacher roles only, regardless of page-view access**                                                                                                                                                    | A deliberate product-scope choice, not a security necessity — the Results page's query is no longer unscoped for `student`/`parent` (fixed by the `results-page-overview` branch; see §6.1), so this restriction simply ships export first to the audience with the broadest legitimate use case (`institution_admin` / `super_admin` / `senior_teacher` / `regular_teacher`). Self-export for `student`/`parent` (their own/linked children's results only) is now a low-risk, straightforward future addition once export itself is built, since the underlying query is properly identity-scoped. Not enacted here — see §15. |
| Report Card export shape      | **One summary row per student**                                                                                                                                                                                 | A full per-subject pivot would require deriving a dynamic column set from the union of subjects actually present across students in the export (a class doesn't guarantee every student has the same subject list) — real complexity with no clear immediate need. A fixed-column summary (identity, average, GPA, rank, conduct, attendance) is simple, always has the same columns, and is what's most likely to be pasted into a district-level spreadsheet.                                                                                                                                                                  |
| Export trigger UI             | **One shared `ExportMenu` component**                                                                                                                                                                           | Three independent PDF modal implementations already exist in this codebase with no shared component between them. Building a fourth (or three more) bespoke triggers would repeat that pattern. `ExportMenu` is designed to be adopted by future export targets — and optionally retrofitted onto the existing PDF-only pages later — without being a required part of this branch's scope.                                                                                                                                                                                                                                      |
| Data source for each export   | **Reuse already-loaded page state wherever the page already loads the right data; add a bounded, filtered query only where the current page has no filter and an unbounded dump would be the only alternative** | Keeps the feature's marginal Firestore read cost close to zero for two of three targets (§8). Results is the one target where a fresh, filtered query is introduced deliberately, both for cost predictability and because a bulk "export everything" button is a worse default than a filtered one for the same page that just had its access tightened.                                                                                                                                                                                                                                                                        |

---

## 3. Shared Export Library (`src/lib/spreadsheetExport.ts`)

New file. Two layers, because the three targets have genuinely different shapes:

### 3.1 High-level layer — flat tabular data (Results, Report Cards, Gradebook)

```ts
export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

export function rowsToCSV<T>(rows: T[], columns: ExportColumn<T>[]): string;

export function downloadCSV<T>(
  filename: string,
  rows: T[],
  columns: ExportColumn<T>[],
): void;

export function rowsToXLSXSheet<T>(
  rows: T[],
  columns: ExportColumn<T>[],
): XLSX.WorkSheet;

export function downloadXLSX(
  filename: string,
  sheets: { name: string; sheet: XLSX.WorkSheet }[],
): void;
```

- `rowsToCSV` / `downloadCSV`: header row from `columns[].header`, one data row per `rows[]` item via each column's `accessor`. Values are stringified, `"`-escaped, and comma-joined — the same approach already sketched in [`ATTENDANCE_SUMMARY_REGISTER_SPEC.md` §18.2](../../attendance/ATTENDANCE_SUMMARY_REGISTER_SPEC.md#182-csv-export) (`Blob` + `URL.createObjectURL` + `<a download>`, then `URL.revokeObjectURL`). No new dependency.
- `rowsToXLSXSheet` / `downloadXLSX`: thin wrapper over SheetJS's `XLSX.utils.json_to_sheet`-style construction, built from the same `ExportColumn<T>[]` shape so a caller writes column definitions once and gets both formats.
- A single `ExportColumn<T>[]` array, defined once per export target, drives both `downloadCSV` and `downloadXLSX` — this is the mechanism that keeps CSV and XLSX output for Results and Report Cards consistent without hand-duplicating column lists.

### 3.2 Low-level layer — hand-built sheets with merges (Gridsheet)

The Gridsheet's 5-row hierarchical header (months → Males/Females → AM/PM sessions, per [`ATTENDANCE_SUMMARY_REGISTER_SPEC.md` §18.3](../../attendance/ATTENDANCE_SUMMARY_REGISTER_SPEC.md#183-xlsx-export)) does not fit a flat `columns[]` model — it needs direct cell/merge/column-width control. Rather than forcing it into the high-level API, `spreadsheetExport.ts` re-exports the raw building blocks the gridsheet export already sketched:

```ts
export {
  encodeCell,
  aoaToSheet,
  setMerges,
  setColWidths,
} from "./spreadsheetExportPrimitives";
```

`gridsheetExports.ts` (§5) is built directly on these primitives, not on `rowsToXLSXSheet`. This keeps the shared library honest about what's actually shared (the `Blob`/download mechanics, the SheetJS cell-writing helpers) versus what's genuinely per-target (the gridsheet's layout logic).

### 3.3 Shared filename helper

```ts
export function buildExportFilename(
  parts: (string | null | undefined)[],
  ext: "csv" | "xlsx",
): string;
```

Joins non-empty parts with `-`, lowercases, strips characters unsafe for filenames, and appends the extension — used by all three targets (see §11 for the resulting names).

---

## 4. Shared Export UI Component (`ExportMenu`)

New component, `src/components/ExportMenu.tsx`. Modeled on the existing `PDFDownloadLink` children-as-function loading-state pattern already used identically in three places (`PDFPreviewModal.tsx`, the gridsheet's inline modal, `ReportCardPDFModal.tsx`), so it looks and feels familiar rather than introducing a fourth interaction pattern.

```tsx
<ExportMenu
  formats={["csv", "xlsx"]}
  disabled={!dataReady}
  onExport={async (format) => {
    /* build filename + rows, call downloadCSV/downloadXLSX */
  }}
/>
```

- Renders a single button when `formats.length === 1`, or a small dropdown ("Export ▾" → "Download CSV" / "Download XLSX") when more than one format is offered.
- `onExport` is async and the component manages its own `loading` state internally (button text swaps to "Preparing…" and disables, mirroring the existing `PDFDownloadLink` loading affordance) — the caller doesn't need to manage a spinner separately.
- Deliberately format-agnostic: `formats` could include `'pdf'` in the future for a page that wants one unified menu instead of a separate PDF button plus a separate CSV/XLSX menu, but no existing page is being converted to that as part of this spec (§14).
- Placement is per-page (§5–§7 below), following each page's own existing button-placement convention rather than forcing a single fixed layout.

---

## 5. Export Target: Attendance Summary Register (Gridsheet)

**Page:** `sms-system/src/scenes/(dashboard)/attendance/gridsheet/index.tsx`
**Existing design:** [`ATTENDANCE_SUMMARY_REGISTER_SPEC.md` §18](../../attendance/ATTENDANCE_SUMMARY_REGISTER_SPEC.md#18-future-enhancement-spreadsheet-export-csv--xlsx) (already detailed — this section adapts it to the shared library introduced in §3 rather than re-deriving it).

**Data source:** `computeGridsheetPDF`'s output (`GridsheetPDFDayRow[]`), already computed for the PDF preview — **zero additional Firestore reads**. The format choice is purely a rendering decision, exactly as §18.4 of the source spec already states.

**New files:**

- `sms-system/src/lib/gridsheetExports.ts` — `exportGridsheetCSV(rows, monthKeys, term, className)` and `exportGridsheetXLSX(rows, monthKeys, term, className)`, per §18.2/§18.3 of the source spec, built on the low-level primitives from §3.2.

**UI change:** The existing "Preview Gridsheet" button / PDF modal header (lines ~412–501 of `gridsheet/index.tsx`) gains an `ExportMenu` alongside the existing `PDFDownloadLink` "Download PDF" button, offering CSV and XLSX — per §18.4's suggestion of "expand the existing Download button into a split button or dropdown." All three format buttons are enabled only once `gridData` is loaded, matching the existing PDF button's gating.

**Access:** Same as the page itself today — `super_admin`, `institution_admin`, `senior_teacher` (route guard in `App.tsx`, unchanged by this feature).

**Filename:** `summary-register-{className}-{termName}.{ext}` (already specified in the source spec's CSV sketch; reused verbatim for XLSX).

---

## 6. Export Target: Results

**Page:** `sms-system/src/scenes/(dashboard)/list/results/index.tsx`

### 6.1 Current state (as of this document)

**Resolved** by the `results-page-overview` branch — see [`sms-system/internal/results-page-related/RESULTS_PAGE_IMPLEMENTATION_PLAN.md`](../../../internal/results-page-related/RESULTS_PAGE_IMPLEMENTATION_PLAN.md). The page's previously-unscoped query was **never a data-exposure issue**: `firestore.rules` already restricted `student`/`parent` reads to their own/linked results, per document, server-side, so no unauthorized data ever reached the client. The real problem was a listener evaluated against the whole institution with no client-side benefit, and a query shape that didn't express what each role should actually see — both fixed by that branch, which added:

- A class/subject/term filter for staff roles (`institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher`), backed by a filtered `getDocs` query instead of a live listener.
- Identity-scoped queries for `student` (own results only) and `parent` (linked children only, via a new `useLinkedStudentIds` hook).

Row-level create/edit/delete actions were already role-gated and are unaffected by this fix.

### 6.2 Export design

Per §2's decision, export is **not** simply "serialize whatever's currently loaded" — this section originally called for adding a filter UI as a prerequisite; that UI (class required, subject/term optional) now already exists on the page as of the `results-page-overview` branch (§6.1), built for staff roles specifically to feed this export's filter selection. What's left for the export feature itself:

1. **Reuse the existing filter state** (`selectedClassId`/`selectedSubjectId`/`selectedTermId`) already on the page, rather than adding new filter UI.
2. **Export runs its own fresh, filtered `getDocs` query** rather than reusing the page's on-screen result set as-is, using whatever subset of `institutionId` / `classId` / `subjectId` / `termId` is currently selected. This query is served by the existing composite index (`results`: `institutionId ASC, classId ASC, subjectId ASC, termId ASC` — already deployed per `firestore.indexes.json`); a partial subset of these equality filters (e.g. `institutionId` + `termId` only, with class/subject left as "All") is also servable without any _additional_ index, since Firestore serves multi-field equality-only queries via automatic single-field indexes regardless of which subset of fields is filtered — composite indexes are only mandatory once a range/inequality filter or a multi-field `orderBy` enters the query, neither of which applies here. **Not yet empirically confirmed** — see §15.

**Export button:** rendered only for `institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher` — never for `student`/`parent`, per §2's product-scope decision (not a security requirement — see §6.1, §9).

**Columns** (`ExportColumn<ResultDocument & {id: string}>[]`):

| Header     | Source field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student    | `studentName`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Class      | `className`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Subject    | resolved subject name via the already-loaded subjects lookup, keyed by `subjectId`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Assessment | `assessmentName`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Type       | `assessmentType` (`coursework` / `exam`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Score      | `score`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Max Score  | `maxScore`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Weight     | `weight` (blank if absent)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Date       | `date` (blank if absent)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Teacher    | `teacherName`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Source     | derived: `"Gradebook"` if `source === 'gradebook'` (equivalently, `gradebookColumnId` present), else `"Manual entry"` — included for completeness even though this page filters gradebook-originated rows out of its own on-screen table, since the _export_ query (being fresh, not reusing the filtered on-screen state) may reasonably choose to include both; **default is manual-entry-only, matching the page's current scope**, with an "Include gradebook-originated results" checkbox as an explicit opt-in |

### 6.3 Data model note

**Resolved.** `ResultDocument`'s declared TypeScript type (`firebase.ts`) was widened to include `studentName`, `className`, `teacherName`, and `createdAt` (all written by both `ResultForm.tsx` and Gradebook's `performSave` on every result, previously undeclared) plus the gradebook-exclusive `gradebookColumnId?`, `columnWeight?`, and `source?: 'gradebook'`. The column mapping above reads these fields directly and normally — no optional/fallback/`unknown`-typed reads are needed for them anymore. Gradebook's own local `ResultDoc` type and the Results list page's own local `Result` type were also reconciled to derive from `ResultDocument` (`ResultDocument & {id: string}`, and `Omit<ResultDocument, 'createdAt'> & {id: string}` respectively — the Results page's own row type excludes `createdAt` specifically because it's passed to `FormModal`, whose `data` prop only accepts `FormRecord`-compatible primitive values, not a Firestore `Timestamp`) rather than maintaining separately hand-copied field lists.

**Filename:** `results-{className|"all-classes"}-{subjectName|"all-subjects"}-{termName|"all-terms"}-{YYYY-MM-DD}.{ext}`

---

## 7. Export Target: Report Cards

**Page:** `sms-system/src/scenes/(dashboard)/report-cards/index.tsx`

**Data source:** the page's existing role-scoped `onSnapshot` on `institutionCollection(institutionId, 'reportCards')` — for the admin/teacher roles this export is gated to (§2, §9), that listener already returns the full institution's cards; export reuses whatever the page's active class/term selection currently has loaded, rather than issuing a new query. **Zero additional Firestore reads.**

**Export button:** placed in the same header area as the existing single/batch "Generate" controls, gated `isAdmin` (`role === 'institution_admin'`) — consistent with the fact that generation itself is already `institution_admin`-only on this page, and `super_admin` cannot generate report cards here either. Export is offered to the same audience as generation: **`institution_admin` only**, narrower than "every role that can view the list" (which per §2's decision log includes `student`/`parent`, viewing only their own/linked cards — those roles get PDF download per-row as today, not a bulk spreadsheet export).

**Columns** (`ExportColumn<ReportCardDocument & {id: string}>[]`), per §2's "summary row per student" decision:

| Header          | Source field                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Student         | `studentName`                                                                                                 |
| Student ID      | `institutionStudentId`                                                                                        |
| Class           | `className`                                                                                                   |
| Term            | `termName`                                                                                                    |
| Class Average   | `classAverage`                                                                                                |
| Student Average | `studentAverage`                                                                                              |
| Class Rank      | `classRank`                                                                                                   |
| GPA             | `gpa`                                                                                                         |
| Conduct         | most frequent / first `conductGrade` across `subjects[]` — **needs a defined tie-break rule, flagged in §15** |
| Sessions Absent | `sessionsAbsent`                                                                                              |
| Days Late       | `daysLate`                                                                                                    |
| Merits          | `merits`                                                                                                      |
| Demerits        | `demerits`                                                                                                    |
| Generated       | `generatedAt` (formatted date)                                                                                |

**Filename:** `report-cards-{className}-{termName}-{YYYY-MM-DD}.{ext}`

---

## 8. Firestore Reads & Free-Tier Analysis

Per [`MISCELLANEOUS_INFO.md`](../../firebase/MISCELLANEOUS_INFO.md) §"Free-Tier Considerations": Spark plan allows 50,000 reads/day, 20,000 writes/day, 10,000 Auth sign-ins/day. This feature performs **zero writes and zero Auth operations** — it is a pure read-and-render feature, so only the reads column matters.

| Target       | Additional reads per export                                                       | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gridsheet    | **0**                                                                             | Reuses `computeGridsheetPDF`'s already-fetched data (§5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Results      | **1 read per matching document**, bounded by the chosen class/subject/term filter | New filtered `getDocs` query (§6.2), replacing an implicit "read everything via the live listener" cost that was already being paid by the page (just not previously exposed as an export). A single unfiltered export for a mid-size institution (a few hundred to low thousands of manually-entered results per year) stays a low single-digit percentage of the 50,000/day budget — same order of magnitude as the report-card generation example already documented in `MISCELLANEOUS_INFO.md` (~200 reads for a 40-student class). |
| Report Cards | **0**                                                                             | Reuses the page's already-loaded `onSnapshot` state (§7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Each of these reads (Results, specifically) may also incur the documented per-rule-`get()`-call read tax if `firestore.rules`' `results` read rule calls `get()` helpers like `myRole()`/`myInstitutionId()` — consistent with every other read in this app, not a new cost pattern introduced by this feature.

**No new Firestore composite indexes are required.** The Results export query is served by the existing `results` composite index; Gridsheet and Report Cards introduce no new queries at all.

**No Firestore rules changes are required.** All three exports read collections under the same roles/conditions those collections' existing rules already permit for the reading role (institution-scoped admin/teacher reads) — the access _narrowing_ in §6/§9 is enforced by hiding the export button client-side for disallowed roles, which is sufficient here because the underlying rules already prevent those roles from reading data outside their institution; the additional restriction (no export for student/parent) is a product decision about this feature's button visibility, not a security boundary the rules need to newly enforce beyond what's already in place for their own visible data.

---

## 9. Security & Access Control Summary

| Target       | Who sees the export button                                              | Notes                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gridsheet    | `super_admin`, `institution_admin`, `senior_teacher`                    | Unchanged from today's page access.                                                                                                                                                                                                         |
| Results      | `institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher` | **Narrower than page-view access** — `student`/`parent` can view the page (identity-scoped to their own/linked results as of the `results-page-overview` branch — see §6.1) but will not see an export button. See §2 decision log and §15. |
| Report Cards | `institution_admin` only                                                | Narrower than page-view access (which includes `super_admin`, teachers, and self-scoped `student`/`parent` viewing). Matches the existing generation-panel gating on the same page.                                                         |

No export target changes who can **view** any page — only whether a bulk-download affordance is additionally offered to roles that already have read access to the underlying data through some other in-page mechanism.

---

## 10. Dependencies

**New npm dependency:** `xlsx` (SheetJS), for XLSX writing. Not currently installed anywhere in this repo (`package.json` / `package-lock.json` confirmed clean of it).

- Install pinned to an exact version (`npm install xlsx@<exact-version>`, no `^`/`~` range) — SheetJS's npm-published releases have historically lagged behind fixes published on their own CDN for known advisories; pinning and periodically checking SheetJS's own advisory page is safer than trusting `npm audit` alone to catch drift.
- Bundle size impact: ~1MB, per the trade-off table already documented in [`ATTENDANCE_SUMMARY_REGISTER_SPEC.md` §18.6](../../attendance/ATTENDANCE_SUMMARY_REGISTER_SPEC.md#186-xlsx-vs-pdf-trade-offs).
- No other new dependencies — CSV needs none (`Blob` + `<a download>` only, browser-native).

---

## 11. File Naming Conventions

| Target       | Pattern                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Gridsheet    | `summary-register-{className}-{termName}.{csv\|xlsx}`                                                               |
| Results      | `results-{className\|"all-classes"}-{subjectName\|"all-subjects"}-{termName\|"all-terms"}-{YYYY-MM-DD}.{csv\|xlsx}` |
| Report Cards | `report-cards-{className}-{termName}-{YYYY-MM-DD}.{csv\|xlsx}`                                                      |

All produced via the shared `buildExportFilename()` helper (§3.3) — whitespace collapsed to `-`, lowercased, unsafe characters stripped.

---

## 12. Testing Plan

Neither of this repo's two closest-precedent specs (`ATTENDANCE_SUMMARY_REGISTER_SPEC.md`, `STUDENT_REGISTRATION_FORM_SPEC.md`) defines a dedicated testing section, but this feature introduces a genuinely new shared library, so it gets one:

- **`src/lib/__tests__/spreadsheetExport.test.ts`** (new, Vitest — Node test environment, matching `filterPersistence.test.ts`'s existing pattern of standing in for browser-only globals):
  - `rowsToCSV` — header row correctness, value stringification, `"`-escaping of embedded quotes/commas/newlines, empty-`rows[]` case (header-only output).
  - `rowsToXLSXSheet` — cell values land at expected addresses for a small fixed input; sheet dimensions match row/column counts.
  - `buildExportFilename` — whitespace/unsafe-character handling, `null`/`undefined` parts skipped correctly.
- **`gridsheetExports.ts`** — unit tests against a small fixed `GridsheetPDFDayRow[]` fixture, checking merge ranges and header rows match the layout already specified in §18.3 of the source spec.
- No test coverage is planned for the actual `Blob`/`URL.createObjectURL`/click-to-download browser mechanics or for `ExportMenu`'s loading-state UI — consistent with this codebase's existing pattern of not testing the PDF-download mechanics either (`PDFDownloadLink` usage is untested elsewhere in the repo).
- Manual QA (browser): open each of the three pages, trigger CSV and XLSX export, open the downloaded file in a spreadsheet application, and confirm column headers/values match what's shown on screen (or, for Results, match the selected filter).

---

## 13. Implementation Order

1. `npm install xlsx@<pinned-version>`.
2. `src/lib/spreadsheetExport.ts` (+ `spreadsheetExportPrimitives.ts` if kept as a separate file) and its unit tests (§12).
3. `src/components/ExportMenu.tsx`.
4. Gridsheet: `src/lib/gridsheetExports.ts` + wire `ExportMenu` into the existing PDF modal header.
5. Results: the class/subject/term filter UI and identity-scoped queries are already built (via the `results-page-overview` branch — see [`RESULTS_PAGE_IMPLEMENTATION_PLAN.md`](../../../internal/results-page-related/RESULTS_PAGE_IMPLEMENTATION_PLAN.md)); remaining work for this step is only the filtered export query (§6.2), column mapping (§6.2), and `ExportMenu` wiring on top of the existing filter state, gated to admin/teacher roles.
6. Report Cards: column mapping (§7), `ExportMenu` wired into the existing admin-only generation panel area.
7. Manual QA pass across all three (§12).

---

## 14. Deferred / Out of Scope

- Spreadsheet **import** (bulk user creation via CSV) — separate future spec.
- A standalone **class roster** export (from the Students list page) — dropped from this spec's scope per §2; may be spec'd separately later.
- **Full per-subject breakdown** for Report Cards — deferred per §2's decision in favor of the summary-row shape; would need a defined strategy for a per-export dynamic column set.
- Retrofitting the three **existing PDF-only** pages/modals (`PDFPreviewModal.tsx` generically, and PDF-specific buttons that aren't touched by this spec) onto `ExportMenu` — `ExportMenu` is designed to support this later but it is not required by this branch.
- Audit log CSV export ([`ISSUES_AND_GAPS.md`](../../ISSUES_AND_GAPS.md) #26) — a separately tracked gap, not bundled into this feature.
- Server-side / scheduled / emailed exports — this app has no backend; all exports here are on-demand and client-side only.

---

## 15. Open Questions / Risks

- **Results page filter UI and student/parent visibility — resolved.** Both were fixed by the `results-page-overview` branch; see §6.1, §2 above, and [`RESULTS_PAGE_IMPLEMENTATION_PLAN.md`](../../../internal/results-page-related/RESULTS_PAGE_IMPLEMENTATION_PLAN.md) for the full implementation record.
- **Two empirical checks from that branch remain open and are directly relevant to §6.2's export query.** Neither has been verified in a live environment yet: (1) whether Firestore truly needs no new composite index for the partial-filter combinations the export query would also use (class-only, class+subject, class+term); (2) whether any legacy `results` documents predate `subjectId` being populated, which would silently vanish from a subject-filtered export rather than error. See `RESULTS_PAGE_IMPLEMENTATION_PLAN.md` §14 for detail — worth confirming before building §6.2's export query on the assumption that both are non-issues.
- **Report Card "Conduct" column tie-break rule undefined** (§7) — a student's `subjects[]` can each carry their own `conductGrade`; the summary export needs one value per student. Needs a concrete rule (most frequent, first non-null, or omit and let the reader open the full report card) before implementation.
- **`xlsx` package version pinning** — needs an explicit version chosen at implementation time and re-checked against SheetJS's own advisory list, not just `npm audit`, per §10.
- **`ResultDocument`'s declared type being narrower than what's actually written — resolved** (§6.3). The type was widened and Gradebook's/the Results page's own duplicate local types were reconciled to derive from it; no code change is required for §6.2's column mapping to read these fields normally.
