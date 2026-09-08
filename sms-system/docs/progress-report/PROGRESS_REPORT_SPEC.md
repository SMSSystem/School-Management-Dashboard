# Progress Report Feature Specification

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Relationship to Report Card and Transcript](#2-relationship-to-report-card-and-transcript)
3. [Firestore Collections — Full Schema](#3-firestore-collections--full-schema)
4. [Generation Logic](#4-generation-logic)
5. [Retention and Deletion](#5-retention-and-deletion)
6. [Firebase Security Rules](#6-firebase-security-rules)
7. [Firestore Indexes](#7-firestore-indexes)
8. [Free-Tier Cost Analysis](#8-free-tier-cost-analysis)
9. [PDF Template](#9-pdf-template)
10. [Sidebar and Navigation](#10-sidebar-and-navigation)
11. [Permissions Summary](#11-permissions-summary)
12. [Implementation Order](#12-implementation-order)
13. [Deferred / Out of Scope](#13-deferred--out-of-scope)
14. [Files and Routes](#14-files-and-routes)

---

## 1. Feature Overview

A **Progress Report** is a student-specific interim academic record — a snapshot of "where things stood" at the moment it was generated, rather than a final end-of-term record. It exists primarily to serve a student who leaves the institution partway through a term or academic year, so the institution has a record of their standing at the time of departure, but it is a **general-purpose, anytime tool**: any `institution_admin` can generate one for any currently-enrolled student, at any point during an active term, for any reason (a parent-teacher conference, a routine check-in, or genuinely because a student is about to leave). Generation is **not** gated behind, or dependent on, any withdrawal/departure workflow — no such workflow exists in this codebase today, and building one is explicitly out of scope for this feature (see [§13](#13-deferred--out-of-scope)).

Reference material (screenshots of a competitor's implementation, gitignored, not committed):

- `internal/regarding-progress-report-feature/screenshot-of-example-of-how-the-progress-report-page-can-look.png` — the filter/generate panel (Year, Term, Grade Level, Class ID, Student, Report Template, Publish, Preview Report)
- `internal/regarding-progress-report-feature/screenshot-of-example-of-how-the-progress-report-pdf-viewer-can-look.png` — the actual generated report content (see [§9](#9-pdf-template))
- `internal/regarding-progress-report-feature/screenshot-of-example-of-how-the-progress-report-pdf-viewer-loading-state-can-look.png` — PDF-loading chrome, not otherwise relevant

### 1.1 Content scope (v1)

A Progress Report contains **grades only**: a per-subject table of the student's current average, letter grade, and teacher, computed from whatever `results` documents exist for that student+term at generation time, plus the student's own overall average (the mean of their subject averages). It deliberately does **not** include attendance, conduct/discipline, section comments, or class rank/average — see [§13](#13-deferred--out-of-scope) for why each was cut and what it would take to add later.

### 1.2 Why this is naturally "point in time" already

`results` documents are queried by `studentId + termId` with no date filter — teachers add them incrementally as they grade assessments throughout the term, so a query today naturally returns "everything entered so far," not "everything for the whole term." No special "as of" filtering logic is needed for the grades table itself. (This is *not* true of attendance — see [§13.1](#131-attendance-section) for why that section was cut for v1 specifically because of this.)

---

## 2. Relationship to Report Card and Transcript

| | Report Card | Progress Report | Transcript (future) |
|---|---|---|---|
| Purpose | Authoritative end-of-term record | Interim, point-in-time snapshot | Cumulative record spanning full enrollment |
| Collection | `institutions/{id}/reportCards` | `institutions/{id}/progressReports` (new) | Not yet designed |
| Cardinality | One per student+term (upsert; re-generating replaces it) | Many per student+term (each generation is a new, immutable snapshot) | One per student, spanning many terms/years |
| Content | Grades, attendance, conduct, comments, positions/activities, class rank/average | Grades only, no rank/average | Presumably a roll-up across terms — not yet specified |
| Who generates | `institution_admin` | `institution_admin` | Not yet specified |
| Who reads | Staff, the student, their parent | Staff, the student, their parent (same rule shape) | Not yet specified |

**Progress Report is a new, separate collection and a new, separate generation function.** It does not read from, write to, or otherwise touch `reportCards`, and `generateReportCard()` (`src/lib/generateReportCard.ts`) is not called or modified by this feature. This was a deliberate decision (not an oversight): `generateReportCard()` upserts on `studentId + termId`, so calling it — or writing into the same collection — for a mid-term snapshot would either collide with (overwrite) the real end-of-term report card, or require reworking its upsert key, either of which risks the integrity of the authoritative record. A new generation function (`generateProgressReport()`, [§4](#4-generation-logic)) reuses the *pattern* of `generateReportCard()` (same per-subject aggregation approach against `results`) without sharing its code path or collection.

**Relationship to the future Transcript feature:** no changes are made here in anticipation of Transcript. `progressReports` is not designed as a source Transcript will read from — Transcript's own spec, when written, will decide what it draws from (most likely `reportCards`, since that's the authoritative per-term record; `progressReports` are informal interim snapshots and are a poor source for a *cumulative* record). This is called out explicitly so a future Transcript spec doesn't assume `progressReports` is meant to feed it.

---

## 3. Firestore Collections — Full Schema

### 3.1 `institutions/{institutionId}/progressReports/{id}`

One document **per generation** (not per student+term — see [§5](#5-retention-and-deletion) for why multiple snapshots per student+term are kept, and how growth is bounded). Nested under `institutions/{institutionId}`, matching every other per-institution collection in this app (`reportCards`, `results`, `disciplinaryActions`, etc.) via the existing `institutionCollection`/`institutionDoc` helpers (`src/lib/paths.ts`).

```typescript
interface ProgressReportSubjectRow {
  subjectId: string;
  subjectName: string;          // snapshotted at generation time
  teacherId: string;
  teacherName: string;          // snapshotted at generation time
  average: number;              // 0-100; this subject's average from results entered so far this term
  letterGrade: LetterGrade;     // reuses the existing letterGrade() bands from reportCardUtils.ts — already
                                 // an exact match for the reference screenshot's grade-key legend, no new
                                 // grading logic needed
}

interface ProgressReportDocument {
  id: string;                          // auto-generated

  // Student identity (snapshotted — a later name/class change must not alter a past snapshot)
  institutionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;

  // Term and year (snapshotted)
  termId: string;
  termName: string;
  academicYearId: string;
  academicYearName: string;

  // Institution letterhead (snapshotted — matches the reference screenshot's header)
  institutionName: string;
  institutionAddress: string | null;
  institutionPhone: string | null;
  institutionLogoUrl: string | null;

  // Signature block (reused as-is from InstitutionDocument — same fields Report Card already uses)
  authorizedSignature: AuthorizedSignature | null;
  principalLabel: string;              // defaults to "Principal" if institution hasn't customized it

  // Grades
  subjects: ProgressReportSubjectRow[]; // sorted by subjectName, same convention as ReportCardDocument.subjects
  overallAverage: number | null;        // mean of subjects[].average; null if subjects is empty

  // Generation metadata
  generatedAt: Timestamp;
  generatedBy: string;                  // uid of the institution_admin who generated it
  generatedByName: string;              // snapshotted display name, for an "issued by" line if needed
}
```

**No `update` path.** Once created, a Progress Report is immutable — there is no edit UI, and the security rules ([§6](#6-firebase-security-rules)) explicitly deny `update` at the rules layer, not just by app convention. If the underlying data was wrong, the correct fix is to generate a new snapshot (and optionally delete the bad one — [§5.2](#52-manual-delete)), not to edit an existing one; that would falsify what was actually "true at the time."

**Uniqueness:** none enforced — by design, multiple documents can and will exist for the same `studentId + termId`, each representing a distinct point in time. This is the opposite of `reportCards`' upsert pattern and is the core reason this can't share that collection.

---

## 4. Generation Logic

`generateProgressReport(opts)` in a new `src/lib/generateProgressReport.ts`, mirroring `generateReportCard()`'s structure and error-handling style (`{ ok: true, docId } | { ok: false, error }`), but reading a strict subset of what Report Card reads:

```typescript
type GenerateProgressReportOptions = {
  studentId: string;
  termId: string;
  institutionId: string;
  generatedBy: string;      // uid
  generatedByName: string;
};
```

**Steps:**

1. **Institution** — `getDoc(institutions/{institutionId})`. Unlike `generateReportCard()`, this does **not** require `profileComplete` — a Progress Report is informal enough that it shouldn't be blocked on the institution having finished the full profile wizard (Report Card's PDF needs `authorizedSignature`/role labels to be meaningful for an official document; a Progress Report can render with sensible fallbacks — see [§3.1](#31-institutionsinstitutionidprogressreportsid)'s `principalLabel` default). If the institution doc doesn't exist at all, that's still a hard error.
2. **Student** — `getDoc(users/{studentId})`, error if not found.
3. **Class name** — `getDoc(institutions/{id}/classes/{classId})` if `student.classId` is set, same as Report Card.
4. **Term** — `getDoc(institutions/{id}/terms/{termId})`, error if not found.
5. **Academic year** — `getDoc(institutions/{id}/academicYears/{academicYearId})` if the term has one.
6. **Results** — `getDocs(query(institutionCollection(institutionId,'results'), where('studentId','==',studentId), where('termId','==',termId)))`. If empty, return an error ("No results found for this student in the selected term yet.") — same guard `generateReportCard()` already has, reused verbatim.
7. **Subjects** — unique `subjectId`s from the results, `getDoc` per subject for its name (same dedup pattern as `generateReportCard()` step 9).
8. **Per-subject average** — unlike Report Card, this does **not** distinguish coursework/exam weighting or gradebook-sourced vs. manually-entered results with different formulas; it computes a single, simple average per subject: mean of `(score / maxScore) * 100` across all of that subject's results so far. This is a deliberate simplification (not an oversight) — a mid-term snapshot before all coursework/exam components exist yet doesn't need Report Card's full weighted-final-grade machinery, and the reference screenshot's `AVERAGE` column reads as a plain average, not a weighted final grade.
9. **Overall average** — mean of the per-subject averages, matching the reference screenshot's bottom-row total (87.6 in the example).
10. **Cap enforcement** — see [§5.1](#51-retention-cap).
11. **Write** — `addDoc` into `institutions/{institutionId}/progressReports`. Always a new document — never a query-then-upsert like Report Card.

**Batch (per-class) generation:** sequential, one student at a time, reusing the same `generateProgressReport()` call per student — matching Report Card's existing batch loop (`report-cards/index.tsx`'s `handleBatchGenerate`), which is deliberately sequential rather than parallel "to stay within Firestore write-rate limits." Progress Report's batch is simpler than Report Card's: there is no second pass (Report Card's batch does a pass 2 to compute `classRank`/`classAverage` across the whole cohort after all cards are written — Progress Report has no rank/average, so there is nothing to reconcile after the fact).

---

## 5. Retention and Deletion

### 5.1 Retention cap

Each `(studentId, termId)` pair keeps at most **5** snapshots (`PROGRESS_REPORT_CAP_PER_STUDENT_TERM = 5`, a named constant in `generateProgressReport.ts`, trivially tunable). After successfully writing a new snapshot, the same function:

1. Queries `institutions/{id}/progressReports` where `studentId == X && termId == Y`, ordered by `generatedAt desc` (the composite index from [§7](#7-firestore-indexes) serves this).
2. If more than 5 documents come back, deletes everything past the 5th (oldest-first) in a single `writeBatch`.

Five was chosen as a reasonable ceiling for "a handful of check-ins across one term" without being so low that a genuinely useful earlier snapshot disappears the moment someone generates a few more — it's a judgment call, not a hard requirement from any source material, and is easy to change later if it turns out to be wrong in practice.

This cap exists specifically **because** there's no browsable "history" UI in v1 ([§13.6](#136-browsable-history-list)) — without a list view surfacing old snapshots to a human who might notice unbounded growth, an unattended cap is what keeps document count (and therefore read/storage cost) bounded automatically.

### 5.2 Manual delete

`institution_admin` can also delete an individual snapshot directly (e.g., one generated by mistake), independent of the cap. Same permission (`isAdmin()`) as the cap's automatic cleanup — no separate rule needed.

---

## 6. Firebase Security Rules

Add alongside the existing `institutions/{institutionId}/reportCards/{id}` block in `firestore.rules` (the nested-path block, not the legacy top-level `reportCards/{id}` block that precedes it in the file):

```
match /institutions/{institutionId}/progressReports/{id} {
  // Read access mirrors reportCards exactly: staff, the student themself, and
  // their linked parent. This is what lets a departing student's guardian
  // actually receive/view the record — the feature's whole stated purpose.
  allow read: if isSignedIn()
    && inMyInstitution(institutionId)
    && (isTeacherOrAbove()
      || resource.data.studentId == request.auth.uid
      || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));

  allow create: if isAdmin() && inMyInstitution(institutionId) && institutionFieldMatchesPath(institutionId);

  // Immutable — no edit UI exists, and none should exist (§3.1). Denying update
  // at the rules layer, not just by omitting an edit UI client-side, means a
  // future feature can't accidentally start mutating a supposedly-historical record.
  allow update: if false;

  allow delete: if isAdmin() && inMyInstitution(institutionId);
}
```

Also add to the `super_admin` platform-wide read-only block (the `{path=**}` section already covering `reportCards`, `disciplinaryActions`, etc., around line 1237 of `firestore.rules`):

```
match /{path=**}/progressReports/{id} { allow read: if isSuperAdmin(); }
```

No changes needed to any existing rule — this is purely additive.

---

## 7. Firestore Indexes

One composite index, added to `firestore.indexes.json`:

```json
{
  "collectionGroup": "progressReports",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "studentId", "order": "ASCENDING" },
    { "fieldPath": "termId", "order": "ASCENDING" },
    { "fieldPath": "generatedAt", "order": "DESCENDING" }
  ]
}
```

**Why this one index covers everything needed:** a query combining equality filters (`studentId ==`, `termId ==`) with an `orderBy` on a third field (`generatedAt`) requires an explicit composite index — pure equality-only queries (like `reportCards`' `studentId + termId` lookup, which needs no index entry today) don't, but the moment ordering is added, Firestore does. This single `(studentId, termId, generatedAt desc)` index serves **both**:

- "Fetch the most recent snapshot for this student+term" (`.limit(1)`) — used when the Progress Reports page shows/links the latest snapshot for a selected student, per the "no history list, just the most recent" decision ([§13.6](#136-browsable-history-list)).
- "Fetch all snapshots for this student+term, oldest-first-for-deletion" — used by the [§5.1](#51-retention-cap) cap-enforcement query.

No index is needed for the generation read itself (`results` filtered by `studentId + termId`, `subjects` by ID) — those reuse the same automatic single-field indexing that already serves the identical query shape in `generateReportCard()` today (confirmed: no dedicated `reportCards`-related composite index exists in `firestore.indexes.json` currently, meaning this query shape is already proven to work without one).

---

## 8. Free-Tier Cost Analysis

Spark plan free-tier limits: 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 1 GiB total stored data.

### 8.1 Reads per single-student generation

| Step | Reads |
|---|---|
| Institution doc | 1 |
| Student doc | 1 |
| Class doc (if `classId` set) | 1 |
| Term doc | 1 |
| Academic year doc (if set) | 1 |
| Results query | N (N = assessments entered so far; typically 5–15 mid-term) |
| Subject docs (deduped) | M (typically 5–9 distinct subjects) |
| Cap-enforcement query (§5.1) | ≤6 (capped at 5 + the just-written one) |
| **Total** | **≈16–30**, dominated by N + M |

This is noticeably *cheaper* than a Report Card generation (which additionally reads an attendance summary, feedback comments, section comments, activities, responsibilities, disciplinary actions, all classmates' existing report cards for rank, and does an existing-doc lookup for the upsert) — Progress Report drops every one of those in favor of just the grades table.

### 8.2 Writes/deletes per single-student generation

| Step | Writes | Deletes |
|---|---|---|
| New snapshot (`addDoc`) | 1 | — |
| Cap overflow cleanup (§5.1) | — | 0–1 typically (only once past 5 snapshots for that student+term; batched in one `writeBatch` if more) |

### 8.3 Batch (per-class) generation

Strictly `K ×` the single-student cost above, where K = class roster size — no second aggregation pass (unlike Report Card's batch, which does an extra cohort-wide read+write pass for rank). A class of 30 students costs roughly 30 × 25 ≈ **750 reads, 30 writes**.

### 8.4 Illustrative daily budget

| Scenario | Reads/day | Writes/day | % of daily read budget |
|---|---|---|---|
| 10 single-student generations | ~250 | ~11 | 0.5% |
| One class-wide batch (30 students) | ~750 | ~31 | 1.5% |
| An entire school generating for every class, once, in a day (10 classes × 30 students) | ~7,500 | ~310 | 15% |

Even the heaviest realistic single-day scenario (whole-school batch, every class, once) stays well within the free tier. There is no plausible usage pattern for this feature — informal, admin-triggered, no automatic/scheduled generation — that risks the 50,000/day read ceiling.

---

## 9. PDF Template

Rendered entirely client-side via `@react-pdf/renderer` (the same library `ReportCardPDFModal.tsx` already uses) — **no Firebase Storage involved**, matching the existing Report Card pattern exactly (confirmed: `ReportCardPDFModal.tsx` has zero Storage imports/calls today). This means no Storage-quota design concern for this feature at all.

New components, structurally parallel to the existing ones but a **visually distinct, simpler layout** (not a reskin of `ReportCardPDF.tsx`), matching the reference screenshot:

- `src/components/progressReport/ProgressReportPDF.tsx` — the actual `@react-pdf/renderer` document definition
- `src/components/progressReport/ProgressReportPDFModal.tsx` — the `PDFViewer`/`PDFDownloadLink` wrapper modal, parallel to `ReportCardPDFModal.tsx`

**Layout, per the reference screenshot (`screenshot-of-example-of-how-the-progress-report-pdf-viewer-can-look.png`):**

- Header: institution logo/crest (left) + institution name, address, phone; a "Progress Reports [academicYearName]" badge and the term name, top-right
- "Report For: [studentName]" + `[className]`
- An explicit **as-of date** — e.g. "As of [generatedAt, formatted]" — printed near the header. This is new relative to the reference screenshot (which only shows the term name) and was an explicit decision: since multiple snapshots can exist for the same student+term, the term name alone can't distinguish which one a given PDF is. Exact placement/wording is an implementation detail, not fixed by this spec.
- A table: `SUBJECT | AVERAGE | LETTER GRADE | TEACHER`, one row per `subjects[]` entry, alphabetically sorted
- Overall average as a total row beneath the table
- A short parents/guardians boilerplate paragraph (static text, not per-institution configurable in v1)
- Signature line: `authorizedSignature` rendered the same way Report Card already renders it, with `principalLabel`
- A letter-grade key/legend in the footer, reusing the exact same bands as `letterGrade()` in `reportCardUtils.ts` (already confirmed to match the reference screenshot's legend precisely)

**Explicitly not reproduced from the reference screenshot:** the "Key to Conduct Rating" legend. It appears in the reference image's footer but no conduct grade is actually populated anywhere on that page — treated as leftover chrome from the competitor's shared template, not a signal that conduct data belongs in this feature (content scope is grades-only, [§1.1](#11-content-scope-v1)).

---

## 10. Sidebar and Navigation

New entry in `src/components/Menu.tsx`, visible to the same six roles as "Report Cards" (`super_admin`, `institution_admin`, `senior_teacher`, `regular_teacher`, `student`, `parent`) — matching the read-permission decision in [§6](#6-firebase-security-rules): everyone who can *read* a Progress Report should be able to navigate to the page, even though only `institution_admin` sees the generate controls once there (same pattern as `report-cards/index.tsx`'s `isAdmin` gate on its generate panel).

```
{
  Icon: <tbd — a distinct icon from Report Cards' FileBarChart2, e.g. FileClock or FileText>,
  label: "Progress Reports",
  href: "/dashboard/progress-reports",
  visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
  id: "tour-sidebar-nav-progress-reports",
},
```

Placed adjacent to the existing "Report Cards" entry in the menu config.

---

## 11. Permissions Summary

| Action | Role(s) |
|---|---|
| Generate (single or batch) | `institution_admin` only |
| Read (view/download PDF) | Staff (`regular_teacher`+), the student themself, their linked parent |
| Delete a snapshot | `institution_admin` only |
| Edit an existing snapshot | Nobody — no edit path exists, denied at the rules layer |

---

## 12. Implementation Order

1. `ProgressReportDocument`/`ProgressReportSubjectRow` types in `src/lib/firebase.ts`
2. `src/lib/generateProgressReport.ts` (generation + cap-enforcement logic, [§4](#4-generation-logic)/[§5.1](#51-retention-cap))
3. Firestore rules addition ([§6](#6-firebase-security-rules)) + indexes addition ([§7](#7-firestore-indexes)) — deploy before any UI work touches the collection
4. `src/components/progressReport/ProgressReportPDF.tsx` + `ProgressReportPDFModal.tsx` ([§9](#9-pdf-template))
5. `src/scenes/(dashboard)/progress-reports/index.tsx` — page shell, single-student + per-class-batch generate panel (mirroring `report-cards/index.tsx`'s structure minus the rank/second-pass logic), delete action
6. `src/components/Menu.tsx` sidebar entry ([§10](#10-sidebar-and-navigation))
7. Route registration (wherever `/dashboard/report-cards` is registered today)

---

## 13. Deferred / Out of Scope

Each item below was explicitly considered and cut for v1 — not an oversight. Recorded here so a future revision of this spec has the reasoning, not just the decision.

### 13.1 Attendance section

`attendanceSummaries` (the pre-computed doc `rebuildSummariesForClass()` writes) calculates its "expected sessions" denominator from the **term's full start→end date range**, not "start→today." A mid-term Progress Report reusing that as-is would show a misleadingly low attendance rate (denominator includes school days that haven't happened yet). Adding attendance properly would require a new "as-of-today" aggregation variant — real, non-trivial scope, deliberately deferred rather than shipping a section that would misinform a departing student's next school.

### 13.2 Conduct / discipline section

Feasible with no new aggregation work (`feedback_comments`/`disciplinaryActions` are already naturally point-in-time, same as `results`) — cut purely for v1 scope discipline, not a technical blocker. A natural first addition in a v2.

### 13.3 Section comments

Same reasoning as conduct — `reportCardComments` would need its own analogous "in-progress" comments concept (Report Card's comments are per-term, written once near term-end; a mid-term equivalent doesn't exist as a concept yet). Deferred.

### 13.4 Class rank / class average

Cut because comparing a student against classmates only makes sense when everyone's data is captured at the same moment; mid-term, most classmates won't have a Progress Report generated at that exact instant, making any rank/average misleading. The reference screenshot also doesn't show one.

### 13.5 Withdrawal workflow integration

No "mark student as withdrawn" concept exists anywhere in this app today (`UserDocument.status` is only `'active' | 'inactive' | 'suspended'`, no withdrawal date/reason). Progress Report is deliberately independent of any such workflow — it works today, for any enrolled student, without waiting on a withdrawal feature that doesn't exist. Building that workflow is a separate, unscoped feature.

### 13.6 Browsable history list

No "view all past snapshots for this student" list UI in v1 — the page only shows/generates the latest snapshot per selected student. This is *why* the [§5.1](#51-retention-cap) cap exists (bounding growth without a human ever seeing/noticing it). A future history view is straightforward to add later using the same composite index already specified in [§7](#7-firestore-indexes).

### 13.7 Whole-grade / whole-institution batch

The reference screenshot's filter panel supports "Grade Level: All" / "Class: All" / "Student: All" in one combined batch (its 1565-page example PDF). v1 matches Report Card's existing two modes only (single student, or one class at a time) — reusing a proven pattern rather than building a broader batch scope the rest of the app doesn't have either.

### 13.8 Report template selection

The reference screenshot's filter panel has a "Report Template: Standard" dropdown, implying the competitor supports multiple templates. v1 has exactly one fixed layout ([§9](#9-pdf-template)) — no template concept.

### 13.9 "Publish" checkbox

The reference screenshot's filter panel has a "Publish" checkbox (implying a draft/unpublished intermediate state before a report becomes visible to students/parents). v1 has no such state — a generated snapshot is immediately readable by anyone the rules in [§6](#6-firebase-security-rules) permit, the same way a generated Report Card is immediately visible today.

---

## 14. Files and Routes

| File | Role |
|---|---|
| `src/lib/firebase.ts` | `ProgressReportDocument`, `ProgressReportSubjectRow` types (additions) |
| `src/lib/generateProgressReport.ts` | New — generation + cap-enforcement logic |
| `src/components/progressReport/ProgressReportPDF.tsx` | New — `@react-pdf/renderer` document definition |
| `src/components/progressReport/ProgressReportPDFModal.tsx` | New — PDF viewer/download modal |
| `src/scenes/(dashboard)/progress-reports/index.tsx` | New — page: student/class/term selectors, generate panel, list-of-latest, delete action |
| `src/components/Menu.tsx` | Sidebar entry addition |
| `firestore.rules` | New `institutions/{institutionId}/progressReports/{id}` block + super_admin read-only line |
| `firestore.indexes.json` | New composite index ([§7](#7-firestore-indexes)) |
