# Report Card Feature Specification

> **Purpose:** Authoritative reference for the Report Card feature. Records all design decisions, justifications, trade-offs, limitations, data models, Firebase rules, code templates, and implementation plan.
>
> **Date documented:** 2026-06-06
> **Branch:** `post-mvp-additions`
> **Status:** Planning complete — no code changes made yet.

Cross-references: [`REPORT_GENERATION.md`](./REPORT_GENERATION.md) · [`ATTENDANCE_REGISTER_SPEC.md`](./ATTENDANCE_REGISTER_SPEC.md) · [`POST_MVP_ADDITIONS_SPEC.md`](./POST_MVP_ADDITIONS_SPEC.md) · [`PROJECT_SPEC_AND_ANALYSIS.md`](./PROJECT_SPEC_AND_ANALYSIS.md)

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Phasing and Dependencies](#2-phasing-and-dependencies)
3. [Phase 1 — Institution Foundation Data](#3-phase-1--institution-foundation-data)
   - [3.1 Institution Profile Onboarding Wizard](#31-institution-profile-onboarding-wizard)
   - [3.2 Houses](#32-houses)
   - [3.3 Student Field Extensions](#33-student-field-extensions)
   - [3.4 Extra Curricular Activities](#34-extra-curricular-activities)
   - [3.5 Positions of Responsibilities](#35-positions-of-responsibilities)
   - [3.6 Section Comments](#36-section-comments)
4. [Phase 2 — Report Card](#4-phase-2--report-card)
   - [4.1 Assessment Classification](#41-assessment-classification)
   - [4.2 feedback_comments Extension](#42-feedback_comments-extension)
   - [4.3 attendanceSummaries Collection](#43-attendancesummaries-collection)
   - [4.4 Report Card Content Sections](#44-report-card-content-sections)
   - [4.5 GPA Calculation](#45-gpa-calculation)
   - [4.6 Comparative Rankings](#46-comparative-rankings)
   - [4.7 Report Card Generation](#47-report-card-generation)
   - [4.8 PDF Layout — 4-Panel Fold](#48-pdf-layout--4-panel-fold)
   - [4.9 Role Access](#49-role-access)
   - [4.10 Existing `reports` Collection Cleanup](#410-existing-reports-collection-cleanup)
5. [Sidebar and Navigation](#5-sidebar-and-navigation)
6. [Firestore Collections — Full Schema](#6-firestore-collections--full-schema)
7. [Firebase Security Rules](#7-firebase-security-rules)
8. [Implementation Order](#8-implementation-order)
9. [Deferred Items](#9-deferred-items)
10. [Files and Routes](#10-files-and-routes)

---

## 1. Feature Overview

The Report Card feature produces a structured, per-student, per-term academic report that institutions can generate as a PDF pamphlet. It replaces the existing `reports` system entirely.

The report card contains:
- **Header** — institution branding (name, motto, logo, address, contact)
- **Summary** — student metadata, academic year, term, class, rankings, GPA, discipline
- **Attendance Sessions** — session counts drawn from the Attendance Register
- **Subjects table** — per-subject grades (Course Work, Exam Grade, Final Grade, letter grade, class position, conduct, teacher, comment number)
- **Comments** — four section-level comments (Class Supervisor, Grade Supervisor, Principal, VP)
- **Keys** — static Key to Letter Grades, Key to Conduct, Key to Comments
- **Next Term Begins** — auto-derived from the Academic Calendar
- **Authorized Signature** — institution-level signature (image or text)

**Reference image:** `sms-system/internal/report-card-example.png` (Vernon Morrison Technical High School). The visual layout of the reference image is **not** a required output layout — only an illustration of what is possible. The PDF layout is specified in §4.8.

**Terminology note:** The term **cohort** refers to the group of all students who enroll in an institution at the start of an academic year. No dedicated `cohorts` Firestore collection is needed — a cohort is a derived concept (all students whose `institutionId` matches, active during a given academic year).

---

## 2. Phasing and Dependencies

The Report Card feature is split into two phases with a hard dependency boundary.

### Phase 1 — Institution Foundation Data (independent)

These items are **not blocked** on SubjectForm and can be implemented on the current branch:

| Item | Description |
| --- | --- |
| Institution Profile Onboarding Wizard | Collects branding and contact data; Firebase Storage for logo/signature |
| Houses | CRUD entity; student assignment |
| Student field extensions | `institutionStudentId`, `dateOfBirth`, `houseId` / `houseName` |
| Extra Curricular Activities | Per-student per-term activity list |
| Positions of Responsibilities | Per-student per-term title + optional organisation |
| Section Comments | Four per-student per-term comments entered by `institution_admin` |

### Phase 2 — Report Card (deferred)

The entire report card generation, PDF, and viewing experience is **blocked** until ALL of the following are available:

| Prerequisite | Status |
| --- | --- |
| SubjectForm wiring (`teacherIds`, `classIds`, `classScope`) | Blocked — SubjectForm is a stub |
| Assessment type classification on `subjects` and `results` | Blocked — depends on SubjectForm |
| `feedback_comments` extension (conductGrade, commentNumber) | Blocked — depends on SubjectForm wiring |
| Academic Calendar (ATTENDANCE_REGISTER_SPEC §2) | Phase 1 of Attendance Register |
| General Attendance Register + `attendanceSummaries` | Phase 1 of Attendance Register |
| Subject Attendance Register | Phase 2 of Attendance Register |

**Phase 2 must be deployed atomically** alongside SubjectForm wiring and Subject Attendance Register (consistent with the Stage 2 constraint in `POST_MVP_ADDITIONS_SPEC.md`).

**Existing `reports` documents:** Must be deleted manually via the Firebase Console before or immediately after Phase 2 deployment. The existing `ReportPDF.tsx`, `generateReport.ts`, `PDFPreviewModal.tsx`, and the `/reports` page are replaced entirely in Phase 2.

---

## 3. Phase 1 — Institution Foundation Data

### 3.1 Institution Profile Onboarding Wizard

#### What

A sequential onboarding wizard at `/institution-profile` that collects branding and contact data for an institution. This data populates the report card header and is stored on the `institutions/{id}` document.

#### Trigger

The wizard is shown when `institution_admin` first visits their dashboard and `institutions/{id}.profileComplete !== true`. It is **non-blocking** — institution_admin can dismiss it and complete it later. A persistent notification card (`PendingInstitutionProfileCard`) remains on the institution_admin dashboard until the wizard is completed.

A dot/badge appears on the "Institution Profile" sidebar item when the wizard is incomplete.

**Why non-blocking:** An institution may begin using the SMS (entering results, feedback, attendance) before the report card is needed. Blocking dashboard access on profile completion would prevent normal operations. The report card generation step will enforce profile completeness at generation time.

#### Wizard steps

| Step | Data collected |
| --- | --- |
| 1 | **Name and motto** — institution name (already exists; editable here), motto (free text, max 200 chars) |
| 2 | **Contact details** — phone number, email address, physical address (multi-line, max 300 chars) |
| 3 | **Logo / Coat of arms** — image upload (JPG, PNG, WEBP, SVG; max 2 MB); preview shown before confirming |
| 4 | **Authorized Signature** — choose mode: (a) Image upload (a digital or scanned physical signature image; JPG/PNG/WEBP, max 1 MB) or (b) Text initials/abbreviated name (free text, max 30 chars, e.g., "J. Doe"); preview shown |
| 5 | **Comment section labels** — four editable labels with defaults: "Class Supervisor", "Grade Supervisor", "Principal", "Vice Principal"; institution_admin changes these if their institution uses different titles |
| 6 | **Review and confirm** — summary of all entered data; "Save Institution Profile" sets `profileComplete: true` |

#### Firebase Storage paths

```
institutions/{institutionId}/logo.{ext}
institutions/{institutionId}/signature.{ext}
```

Uploads overwrite the previous file at the same path. URLs are stored on the institution document. Re-upload replaces the file in Storage and updates the URL.

**Why Firebase Storage is needed:** Institution logos can be up to 2 MB — far too large to store inline in a Firestore document (1 MB document limit). Storage is the correct choice. The Blaze (pay-as-you-go) plan is required for Storage; this is a known upgrade from Spark.

#### Profile completeness check at report card generation

At generation time, `generateReportCard.ts` verifies that `institutionName`, `institutionLogoUrl`, and `authorizedSignature` are present. If any are missing, generation fails with a descriptive error prompting the institution_admin to complete their profile.

#### Limitations

- Logo and signature images are stored in Firebase Storage. If Storage is unavailable or the institution is on Spark plan, the wizard step gracefully falls back to showing a "placeholder will be used" message.
- Re-running the wizard (editing profile data) is always accessible from the institution admin settings page, not just on first login.

---

### 3.2 Houses

#### What

A "house" is a named competitive or organizational subdivision of an academic institution (e.g., Isaacs, Nelson, Wellington). Houses are managed per institution. Each student belongs to at most one house, assigned and reassigned by `institution_admin`. House assignment persists indefinitely until explicitly changed.

#### Why its own entity

A house is reused across many students and across years. Storing it as free text on each student record would cause data inconsistency (misspellings, renames affecting only some students). A dedicated `houses` collection with a denormalized `houseName` on the student document is the correct pattern.

#### CRUD and UI

- A new page at `/list/houses` lists all houses for the institution (matching the visual pattern of existing list pages).
- `institution_admin` creates, renames, and deletes houses.
- Deleting a house with assigned students: requires a warning dialog and must un-assign all affected students (`houseId: null`, `houseName: null`).

#### Student assignment — two entry points

1. **From the student's detail/edit page:** A "House" dropdown field showing all houses in the institution. Institution_admin selects a house and saves. Cleared by selecting "None".
2. **From the house's detail page:** Shows all students currently assigned to the house. A "Manage Students" control opens a multi-select panel (all students in the institution); institution_admin adds or removes students from this house. Saving writes to each affected student's `users/{uid}` document.

**One house per student:** A student cannot be assigned to more than one house simultaneously. Assigning a student to a new house removes them from their previous house. The UI enforces this.

---

### 3.3 Student Field Extensions

Three new fields are added to `student` user documents.

#### `institutionStudentId` — Institution-assigned Student ID

- Distinct from the Firebase UID (`uid`).
- Institution-specific: student #001 at School A and student #001 at School B are independent records.
- Assigned manually by `institution_admin`.
- **Not auto-generated** — institutions have their own ID conventions.
- Input location: create-user page (optional field for `student` role) + student detail/edit page.
- Uniqueness: enforced at the application layer (query for existing student with same `institutionStudentId` within the same `institutionId` before saving; display a validation error if found).
- **No retroactive requirement** — existing students without an `institutionStudentId` are not blocked. The field is `null` until assigned. Report card generation proceeds with a blank student ID if unassigned.

#### `dateOfBirth` — Date of Birth

- Stored as ISO string `"YYYY-MM-DD"` (same reasoning as attendance date fields — no timezone ambiguity).
- **Required for new student accounts** going forward (validation enforced on the create-user form for `student` role).
- Existing students without `dateOfBirth` are not retroactively required to provide it. The field is `null` until set. Report card generation displays a blank DOB if absent.
- Input location: create-user page (required field for `student` role, validated by Zod) + student detail/edit page (editable).

#### `houseId` / `houseName` — House Assignment

- `houseId: string | null` — links to `houses/{houseId}`
- `houseName: string | null` — denormalized at assignment time for display without a join
- Managed as described in §3.2. Not set at account creation; assigned later by `institution_admin`.

---

### 3.4 Extra Curricular Activities

#### What

A list of clubs, sports teams, or other activities that a student participates in, tracked per student, per class, per term, and per academic year.

#### Why per-term

A student's activity participation can change between terms (joining a club in Easter Term, leaving in Summer Term). Per-term scoping allows the report card to show activities accurate to the specific term being reported.

#### UI — student detail page

A new "Extra Curricular Activities" section appears on the student's detail page, visible to `institution_admin`. Within this section:

- A list of the student's activities for the selected term is shown.
- An "Add Activity" button opens an inline form: free-text input for the activity name (max 100 chars), term selector. `institution_admin` saves.
- Each entry has a delete button. No soft-delete — hard delete only (these are simple label entries).

**No predefined list:** Activities are free-text entries typed by `institution_admin`. A predefined club list would require additional management overhead and isn't warranted for Phase 1.

---

### 3.5 Positions of Responsibilities

#### What

Named roles or responsibilities that a student holds within the school community, tracked per student, per class, per term, and per academic year.

Examples: "Form Captain", "Student Council Representative", "Head Boy", "Treasurer — 4H Club".

#### Data model

Each position has:
- `title: string` (required, max 100 chars) — e.g., "Form Captain", "Treasurer"
- `organisation: string | null` (optional, max 100 chars) — e.g., "4H Club", "Student Council"

On the report card PDF, a position with an organisation is displayed as: `"Treasurer — 4H Club"`. Without an organisation: `"Form Captain"`.

#### UI — student detail page

Mirrors the Extra Curricular Activities section. A new "Positions of Responsibilities" section on the student's detail page:
- Lists current positions for the selected term.
- "Add Position" opens an inline form: `title` (required) + `organisation` (optional), term selector.
- Each entry has a delete button.

---

### 3.6 Section Comments

#### What

Four free-text comment slots written by `institution_admin` for each student per term. These appear on the report card as the "Comments" section. The four slot labels default to "Class Supervisor", "Grade Supervisor", "Principal", and "Vice Principal" but are configurable per institution (set in the Institution Profile wizard, §3.1 step 5).

**Why institution_admin submits all four:** Not all institutions have distinct staff members filling each role at the system level. Centralising all four comment inputs under `institution_admin` avoids needing to provision four separate admin-level accounts. An `institution_admin` can gather comments from the actual supervisors/principal offline and input them into the system.

**Why stored separately, not at generation time:** Comments may be written and revised multiple times before a report card is generated. Storing them in a dedicated collection (rather than embedded in the generation step) allows:
- Comments to be entered incrementally across multiple sessions
- A bulk entry UI that lets institution_admin see all students' comment status in one view
- Re-generation of a report card to pull the latest version of comments without re-entering them

#### Two UI entry points (Option D)

**Entry point 1 — Student detail page:**
A "Report Card Comments" section on the student's detail page. Shows the four comment fields (using the institution's configured labels) for a selected term. `institution_admin` fills them in and saves. Each field is a textarea (max 500 chars).

**Entry point 2 — Bulk class comments view:**
A page at `/report-card-comments` (or accessible from the class detail page). Lists all students in a selected class for a selected term in a table. Each row shows the student's name and a compact indicator of which comments have been filled (e.g., four coloured dots: filled = green, empty = grey). Clicking a row opens an expandable inline panel with the four comment fields for that student. `institution_admin` can move through all students without navigating away.

**Efficiency note:** For a class of 40 students × 4 comments = 160 individual comment fields per class per term. The bulk view is the practical path for term-end comment collection.

#### Uniqueness

One `reportCardComments` document per `studentId + termId + institutionId`. The form uses an upsert pattern — query for an existing document; if found, `updateDoc`; if not, `addDoc`.

---

## 4. Phase 2 — Report Card

> All items in this section are deferred until SubjectForm wiring, Subject Attendance Register (Phase 2), and General Attendance Register (Phase 1) are all complete. Do not begin implementation of any Phase 2 item until all prerequisites are confirmed available.

### 4.1 Assessment Classification

#### Problem

The existing `results` collection stores individual assessment records (e.g., "Midterm Exam: 78/100", "Essay 1: 85/100", "Final Exam: 91/100"). The report card subjects table needs to display two aggregated grade columns: **Course Work** and **Exam Grade**, with a configurable weighting per subject.

#### Solution

Two schema extensions, both implemented when SubjectForm ships:

**1. `assessmentType` field on `results/{id}`:**

```typescript
assessmentType: 'coursework' | 'exam';
```

When a `regular_teacher` creates or edits a result, they select whether the assessment is a course work or exam component. This field is required (Zod-validated). `ResultForm` gains a `type` selector (radio or dropdown).

**Guidance for teachers:** Midterm assessments and final/end-of-term exams → `'exam'`. Essays, projects, in-class tests, practical work → `'coursework'`. The classification is the teacher's judgement; there is no system-level enforcement of naming conventions.

**2. `cwWeight` and `examWeight` on `subjects/{id}`:**

```typescript
cwWeight: number;    // 0–100; percentage of Final Grade from Course Work
examWeight: number;  // 0–100; percentage of Final Grade from Exam Grade
// cwWeight + examWeight must equal 100
```

Configured by `institution_admin` on the SubjectForm (or a dedicated subject settings view). Both fields are required for report card generation. Validation: `cwWeight + examWeight === 100`.

#### Grade computation

```
CW_grade =
  average of (score / maxScore × 100) across all results
  where assessmentType === 'coursework'
  AND studentId + subjectId + termId match

Exam_grade =
  average of (score / maxScore × 100) across all results
  where assessmentType === 'exam'
  AND studentId + subjectId + termId match

Final_grade = (CW_grade × cwWeight / 100) + (Exam_grade × examWeight / 100)
```

**Edge cases:**
- No coursework results → `CW_grade = 0`; report card shows "—" for the CW column.
- No exam results → `Exam_grade = 0`; report card shows "—" for the Exam column.
- No results at all for a subject → subject row is omitted from the report card subjects table.
- If `cwWeight` or `examWeight` is not configured on the subject, report card generation fails with: _"Subject [name] is missing Course Work / Exam weighting. Configure the subject before generating."_

#### Why not replace the multi-assessment model

The multi-assessment model (multiple individual result records) is preserved. Course Work and Exam Grade are **computed aggregates** of those records, not replacements for them. The detail (individual assessments) remains queryable. The report card presents only the summary columns.

---

### 4.2 feedback_comments Extension

The existing `feedback_comments` collection is extended with two new required fields for `regular_teacher` submissions. This aligns with `POST_MVP_ADDITIONS_SPEC.md` item 12, which adds a preset dropdown + free-text textarea to `FeedbackCommentForm`.

#### New fields

```typescript
conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D';  // required
commentNumber: number;                                  // 1–20; required
```

`conductGrade` maps to the static Key to Conduct:
- G = Good
- S = Satisfactory
- F = Fair
- U = Unsatisfactory
- P = Poor
- D = Disruption

`commentNumber` is the 1-based index into the static 20-item Key to Comments list (see §4.4 — Keys). Only the number is stored; the full text is derived at display/PDF-render time from the static list. Storing only the index is sufficient because the list is static and never reordered.

#### Free-text comment field

The free-text `comment` field on `feedback_comments` documents **remains**. As per `POST_MVP_ADDITIONS_SPEC.md` item 12:
- If the textarea has content → the textarea value is submitted as `comment`.
- If the textarea is empty and a preset is selected → the preset text is submitted as `comment`.
- `comment` remains a required field (Zod-validated).

**The `commentNumber` is independent of the free-text/preset selection.** The teacher selects a `commentNumber` (1–20) separately. The report card shows only the number in the Subjects table; the full text of the chosen comment appears in the Key to Comments section. The free-text `comment` field is for internal use and detailed feedback visibility — it is **not** printed on the report card.

#### Required fields enforcement

`FeedbackCommentForm` (Phase 2 update):
- Adds a `conductGrade` radio or dropdown selector — required, blocks submission if unselected.
- Adds a `commentNumber` dropdown (1–20, showing the full comment text for selection) — required, blocks submission if unselected.
- Both fields have Zod validation with descriptive error messages.

#### Why conduct grade is required

Report card generation depends on `conductGrade` being present for every subject a student is enrolled in. If any subject's teacher has not submitted a conduct grade, the report card will have a gap. Making it required at form submission time ensures completeness before the generation step.

**Limitation:** A `regular_teacher` who never opens `FeedbackCommentForm` before term end will have no conduct grade on record. The report card generation step must check for missing conduct grades and warn `institution_admin` (not fail silently).

---

### 4.3 attendanceSummaries Collection

The report card's Attendance Sessions section (Total Possible Sessions, Sessions Absent, Days Late) must not re-aggregate 130+ `generalAttendance` documents at render time. Instead, a pre-computed summary per student per term is maintained.

**Trigger:** After each successful save to `generalAttendance`, the client updates (upserts) the corresponding `attendanceSummaries` document for each student whose record changed. This is a client-side write, not a Cloud Function, consistent with the project's Spark-plan constraint.

**Document ID:** `{studentId}_{termId}` — deterministic, enabling upsert without a prior query.

**Schema:** See §6.7.

**Migration on introduction:** When `attendanceSummaries` is first deployed, existing `generalAttendance` documents must be aggregated to create initial summary records. A one-time migration utility (run client-side by `institution_admin` triggering a "Rebuild Summaries" action, or manually) is required. Document this in the implementation plan.

**When Subject Attendance ships:** Subject attendance summaries should follow the same pattern, adding a separate `subjectAttendanceSummaries` collection (or extending `attendanceSummaries` with a subject-keyed sub-map). Defer the design to the Subject Attendance implementation.

---

### 4.4 Report Card Content Sections

This section defines every data field shown on the report card, its source, and how it is computed or sourced.

#### Header

| Field | Source | Notes |
| --- | --- | --- |
| Institution name | `institutions/{id}.name` | Snapshotted at generation |
| Motto | `institutions/{id}.motto` | Snapshotted at generation |
| Logo / Coat of arms | `institutions/{id}.logoUrl` (Firebase Storage URL) | Snapshotted URL; image fetched at PDF render time |
| Physical address | `institutions/{id}.address` | Snapshotted at generation |
| Phone number | `institutions/{id}.phone` | Snapshotted at generation |
| Email address | `institutions/{id}.email` | Snapshotted at generation |

#### Summary

| Field | Source / Computation | Notes |
| --- | --- | --- |
| Academic Year | `academicYears/{id}.name` | e.g., "2025-2026"; snapshotted |
| Term | `terms/{id}.name` | e.g., "Easter Term"; snapshotted |
| Student Name | `users/{uid}.lastName + ", " + users/{uid}.firstName` | Surname precedes forename, comma-space separated; snapshotted |
| Class | `users/{uid}.className` | Denormalized class name; snapshotted |
| Date of Birth | `users/{uid}.dateOfBirth` | ISO string; shown as formatted date on PDF |
| Student ID | `users/{uid}.institutionStudentId` | Institution-assigned; blank if unassigned |
| Class Population | Count of students with same `classId` in `users` | Computed at generation time |
| Class Rank | Computed — see §4.6 | Student's position among classmates by Student Average |
| Student Average | Computed — see §4.6 | Average Final Grade across all subjects |
| Class Average | Computed — see §4.6 | Average of all students' Student Average in the class |
| House | `users/{uid}.houseName` | Denormalized; blank if unassigned |
| GPA | Computed — see §4.5 | 0.0–4.0 scale |
| Discipline | Demerits / Suspensions / Detentions | Placeholder: 0 until Disciplinary Action feature ships |

#### Attendance Sessions

Drawn from `attendanceSummaries/{studentId}_{termId}`:

| Field | Label on card | Source |
| --- | --- | --- |
| Total Possible Sessions | "Total Possible Sessions" | `attendanceSummaries.totalExpectedSessions` |
| Sessions Absent | "Sessions Absent" | `attendanceSummaries.sessionsAbsent` (A + S + E counts) |
| Days Late | "Days Late" | `attendanceSummaries.daysLate` (L count) |
| Extra Curricular Activities | "Extra Curricular Activities" | `studentActivities` for studentId + termId; list of `activityName` |
| Positions of Responsibilities | "Positions of Responsibilities" | `studentResponsibilities` for studentId + termId; formatted as "title — organisation" or "title" |

#### Subjects Table

One row per subject the student is enrolled in for the term. Columns:

| Column header | Data | Notes |
| --- | --- | --- |
| Subject | Subject name | Sorted alphabetically |
| Course Work (N%) | `cwGrade` | N = `subjects/{id}.cwWeight`; shown as percentage |
| Exam Grade (N%) | `examGrade` | N = `subjects/{id}.examWeight` |
| Final Grade (100%) | `finalGrade` | Always out of 100; column header is static |
| Grade | Letter grade | Derived from `finalGrade`; see §4.5 |
| Position | Subject position rank | See §4.6 |
| Conduct | `conductGrade` | Single letter (G/S/F/U/P/D) |
| Teacher | `teacherName` | Denormalized at generation; from `users/{teacherId}` |
| Teacher's Comments | `commentNumber` | Single number 1–20 |

**Missing conduct grade warning:** If any enrolled subject has no `feedback_comments` document for this student+term with a `conductGrade`, report card generation emits a warning listing the affected subjects. Institution_admin can proceed (subject row shows "—" for Conduct and Comments) or cancel to chase the missing data.

#### Keys (static — same for all institutions)

**Key to Letter Grades:**

| Grade | Range |
| --- | --- |
| A+ | 95% – 100% |
| A | 85% – 94% |
| B+ | 75% – 84% |
| B | 65% – 74% |
| C | 50% – 64% |
| F | 0% – 49% |

**Key to Conduct:**

| Code | Meaning |
| --- | --- |
| G | Good |
| S | Satisfactory |
| F | Fair |
| U | Unsatisfactory |
| P | Poor |
| D | Disruption |

**Key to Comments:**

The 20-item list from `sms-system/internal/predetermined-feedback-comment-options.png` (updated from 15 to 20 per the reference image). The full list is stored as a static constant — `COMMENT_KEY` — in a shared utility file. Comment numbers 1–20 map to the list items in order. The Key to Comments section on the report card prints the full list.

The `COMMENT_KEY` constant must be the single source of truth used by:
- `FeedbackCommentForm.tsx` — for the `commentNumber` dropdown display
- `ReportCardPDF.tsx` — for the Key to Comments section
- Any report card preview component

#### Next Term Begins

Derived automatically from the Academic Calendar: the `startDate` of the next term after the term being reported. Computation:

```
nextTerm = terms where academicYearId matches
           AND termNumber = currentTerm.termNumber + 1

If no next term in the current academic year:
  nextTerm = first term of the next academic year (status: 'upcoming' | 'active')

If no next academic year exists yet:
  show "To be announced"
```

Snapshotted at generation time as an ISO date string; displayed as a formatted date on the PDF.

#### Comments Section

Four free-text comment fields. Labels are institution-configurable (see §3.1 step 5); defaults are:

| Slot | Default label |
| --- | --- |
| 1 | Class Supervisor |
| 2 | Grade Supervisor |
| 3 | Principal |
| 4 | Vice Principal |

Source: the `reportCardComments/{docId}` document for this student + term. If no comment document exists for a slot, that section is left blank on the report card (institution_admin is warned at generation time, not blocked).

#### Authorized Signature

Institution-level signature, snapshotted from `institutions/{id}.authorizedSignature` at generation time.

Two modes:
- **`'image'`:** The stored Firebase Storage URL is included in the PDF as an image. At PDF render time, the URL is fetched and embedded. If the URL is unreachable at render time, a placeholder box labelled "Signature unavailable" is rendered.
- **`'text'`:** The abbreviated name/initials string (e.g., "J. Doe") is rendered as text in a signature-style font on the PDF.

---

### 4.5 GPA Calculation

GPA is computed on a simplified 4.0 scale.

**Letter grade → GPA points mapping:**

| Letter Grade | GPA Points |
| --- | --- |
| A+ | 4 |
| A | 4 |
| B+ | 3 |
| B | 3 |
| C | 2 |
| F | 0 |

**Why A+ = A = 4 and B+ = B = 3:** The simplified scale treats letter-grade bands as equivalent. The distinction between A+ and A is already captured by the percentage score and the letter grade column. Adding a finer GPA scale (e.g., A+ = 4.3) adds complexity without a stated requirement for it.

**Formula:**

```
GPA = average of GPA_points across all subjects

where GPA_points for each subject = letterGradeToPoints(letterGrade(finalGrade))
```

GPA is computed at report card generation time and snapshotted on the `reportCards` document.

---

### 4.6 Comparative Rankings

All three comparative metrics (Class Rank, Student Average, Class Average) and the per-subject Position are computed at **report card generation time**, not stored as live aggregates.

#### Student Average

```
Student Average = average of finalGrade across all of the student's subjects for the term
```

If the student has no subject grades: Student Average = 0; Class Rank = "—".

#### Class Average

```
Class Average = average of Student Average across all students in the same class for the term
```

Requires fetching all `reportCards` documents for the same `classId + termId` to compute. If this report card is the first being generated for the class, Class Average cannot be computed and shows "—".

**Trade-off:** Class Average is only meaningful once all (or most) students in the class have been generated. Institution_admin should use batch generation to ensure all class report cards are generated together, making Class Average computable and consistent.

#### Class Rank

```
Class Rank = rank of this student's Student Average among all students in the same class
             (1 = highest Student Average)
```

Same query requirement as Class Average. If Class Rank cannot be computed (first generation in the class), it shows "—". Re-generation after batch generation corrects it.

#### Subject Position

```
Subject Position = rank of this student's finalGrade among all students enrolled in the same subject
                   for the same term (1 = highest finalGrade in the subject)
```

Requires fetching all `feedback_comments` and `results` data for all students in the subject. This is computed at generation time and snapshotted.

**Limitation:** Subject Position is only accurate at the time of generation. If another student's grades are corrected and their report card is re-generated later, this student's Position is not automatically updated. Re-generating this student's report card corrects their Position.

---

### 4.7 Report Card Generation

#### Access

| Action | Roles |
| --- | --- |
| Generate / Re-generate | `institution_admin` only |
| View | All six roles (role-scoped — see §4.9) |

**Why `institution_admin` only (vs. existing system where `senior_teacher` could generate):** The report card is a significantly richer document requiring data from across the institution (section comments, institutional branding, attendance summaries, all subjects). Scoping generation to `institution_admin` simplifies the access model and matches the single authority who collects all four section comments.

#### On-demand generation (single student)

1. Institution_admin navigates to a student's detail page or the report cards list page.
2. Selects a term from a dropdown.
3. Clicks "Generate Report Card".
4. System checks:
   - Institution profile complete (`profileComplete: true`)
   - Active academic year and matching term exist
   - At least one subject result exists for the student in the term
   - `attendanceSummaries` document exists for the student + term
5. Warnings (non-blocking):
   - Missing conduct grades (lists affected subjects)
   - Missing section comments (lists which of the 4 slots are empty)
   - Class Rank / Class Average cannot be computed (batch generation recommended)
6. Institution_admin confirms → report card document written to `reportCards/{id}` (upsert: one per `studentId + termId + institutionId`).

#### Batch generation (per class or per cohort)

Batch generation produces one `reportCards` document per student. It runs sequentially (not in parallel) to stay within Firestore write-rate limits and to allow progress reporting.

**Scope options:**

| Scope | Description |
| --- | --- |
| **Per class** | All students in a selected class for a selected term |
| **Per cohort** | All students in the institution for a selected term (entire cohort) |

**UI flow:**

1. Institution_admin opens the batch generation panel (accessible from the report cards list page).
2. Selects scope: class or cohort.
3. If class scope: selects the class from a dropdown.
4. Selects the term.
5. A pre-generation summary is shown: number of students, number of students with missing conduct grades, number of students with incomplete section comments.
6. Institution_admin confirms → batch runs with a progress indicator (e.g., "12 of 40 complete").
7. Each student is processed: data fetched, Class Rank / Subject Positions computed relative to the batch, document upserted.
8. On completion: a summary of successes and any per-student errors.

**Individual re-generation after batch:** Always supported. Re-generating a single student's report card after a batch run corrects their data if grades/comments were updated. Class Rank and Class Average are re-computed from the existing `reportCards` documents for the class.

#### Snapshot approach

Report cards are snapshots. Generation reads live data, computes everything, and writes a single `reportCards` document. Subsequent views read the stored document — no live re-aggregation. If source data changes (grade correction, comment update), the report card must be re-generated to reflect the change.

This matches the existing `reports` behaviour and is the correct pattern for term-end documents that should be stable once issued.

#### Upsert behaviour

Before writing, `generateReportCard.ts` queries for an existing document matching `studentId + termId + institutionId`. If found: `updateDoc`. If not: `addDoc`. This ensures one report card per student per term per institution, regardless of how many times it is generated.

---

### 4.8 PDF Layout — 4-Panel Fold

The report card PDF is designed to be **printed double-sided on a single sheet and folded once vertically**, producing a 4-panel pamphlet. The fold creates:

| Panel | Position | Description |
| --- | --- | --- |
| **Front Cover** | Right half of Side 1 | Visible when pamphlet is closed |
| **Back Cover** | Left half of Side 1 | Visible on the reverse when pamphlet is closed |
| **Inner Left** | Right half of Side 2 | Visible on left when pamphlet is opened |
| **Inner Right** | Left half of Side 2 | Visible on right when pamphlet is opened |

#### PDF structure

`@react-pdf/renderer` generates a 4-page PDF. Each page is **A4 portrait** (210 mm × 297 mm) and corresponds to one panel.

| PDF Page | Panel | Content |
| --- | --- | --- |
| Page 1 | Front Cover | Institution logo/coat of arms, institution name, motto, "Student's Report Card" heading, student name, term name, academic year |
| Page 2 | Inner Left | Student Summary (all fields from §4.4 Summary), Attendance Sessions block (Total Possible Sessions, Sessions Absent, Days Late, Extra Curricular Activities, Positions of Responsibilities) |
| Page 3 | Inner Right | Subjects Table, Comments section (4 slots with institution-configured labels and free-text comments), Key to Comments (20 items) |
| Page 4 | Back Cover | Key to Letter Grades, Key to Conduct, Next Term Begins, Authorized Signature |

**Print instruction on PDF:** A small footer note on every page: _"Print double-sided (flip on short edge) and fold vertically to form pamphlet."_

**Implementation notes for `@react-pdf/renderer`:**
- All PDF styling uses `StyleSheet.create()`. Tailwind classes have no effect inside PDF components.
- For the Subjects Table, use fixed-width columns. Fonts must be registered explicitly (e.g., `Font.register()`); system fonts are unavailable.
- The logo image (Firebase Storage URL) must be fetched as a data URL or blob before being passed to `<Image>` in the PDF component. Direct URLs may be blocked by CORS in the PDF renderer context.
- The signature image (if mode is `'image'`) has the same CORS consideration.
- Dark mode: PDF is always generated in light mode regardless of the user's current UI theme.
- `PDFViewer` renders an `<iframe>` with a blob URL; some mobile browsers (particularly iOS Safari) may block this. `PDFDownloadLink` works as a fallback on all platforms.

**Page size note:** If the institution's Subjects Table is very long (many subjects), Page 3 (Inner Right) may overflow. The PDF component must handle multi-page overflow gracefully (e.g., continuing the table onto an additional inner page). The Key to Comments section is moved after the table, not interrupted by it.

---

### 4.9 Role Access

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Generate / batch generate | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View any report card | ✅ all | ✅ institution | ✅ institution | ✅ institution | ✅ own only | ✅ child's |
| Delete report card | ❌ | ✅ institution | ❌ | ❌ | ❌ | ❌ |

**Why `senior_teacher` loses generate access (vs. existing system):** The report card draws on institution-wide data that `senior_teacher` does not own (section comments are institution_admin's, branding is institution_admin's, attendance summaries span the institution). Granting `senior_teacher` generate access would require allowing them to write institution-scoped data fields — a disproportionate privilege expansion.

**`super_admin` read access:** Super admin can view all report cards across all institutions. The `onSnapshot` subscription on the report cards page must handle `institutionId === '*'` (super admin) differently — either skip the filter, or use a collection-group query. This is a known limitation of the existing reports page; the same fix applies.

---

### 4.10 Existing `reports` Collection Cleanup

Before Phase 2 deployment:

1. `institution_admin` or `super_admin` manually deletes all documents in the `reports` collection via the Firebase Console. No migration script or in-app trigger is needed.
2. The Firestore security rules for the `reports` collection can be set to `allow read, write: if false;` after cleanup to prevent stale writes. This rule change should be published alongside the Phase 2 deployment.
3. The following files are **replaced** in Phase 2 (do not extend — rewrite):
   - `src/lib/generateReport.ts` → `src/lib/generateReportCard.ts`
   - `src/components/ReportPDF.tsx` → `src/components/reportCard/ReportCardPDF.tsx`
   - `src/components/PDFPreviewModal.tsx` → `src/components/reportCard/ReportCardPDFModal.tsx`
   - `src/scenes/(dashboard)/reports/index.tsx` → `src/scenes/(dashboard)/report-cards/index.tsx`

---

## 5. Sidebar and Navigation

### Phase 1 additions

| Role | New sidebar entries |
| --- | --- |
| `institution_admin` | Institution Profile (if `profileComplete !== true`: badge indicator) · Houses |

### Phase 2 additions

| Role | New sidebar entries |
| --- | --- |
| `institution_admin` | Report Cards (replaces "Reports") |
| `senior_teacher` | Report Cards |
| `regular_teacher` | Report Cards |
| `student` | Report Cards (own only) |
| `parent` | Report Cards (child's) |
| `super_admin` | Report Cards |

The existing "Reports" sidebar entry (all roles) is **removed** when Phase 2 ships.

---

## 6. Firestore Collections — Full Schema

### 6.1 `houses/{houseId}`

```typescript
interface HouseDocument {
  id: string;                   // auto-generated
  institutionId: string;
  name: string;                 // required; e.g., "Isaacs"
  description?: string;         // optional; max 200 chars
  createdAt: Timestamp;
  createdBy: string;            // uid of institution_admin
  updatedAt: Timestamp;
}
```

### 6.2 `studentActivities/{id}`

One document per activity entry (a student may have multiple activities per term).

```typescript
interface StudentActivityDocument {
  id: string;                   // auto-generated
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  activityName: string;         // free text; max 100 chars
  createdAt: Timestamp;
  createdBy: string;            // uid of institution_admin
  updatedAt: Timestamp;
}
```

### 6.3 `studentResponsibilities/{id}`

One document per position entry (a student may hold multiple positions per term).

```typescript
interface StudentResponsibilityDocument {
  id: string;                   // auto-generated
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  title: string;                // required; max 100 chars; e.g., "Form Captain"
  organisation: string | null;  // optional; max 100 chars; e.g., "4H Club"
  createdAt: Timestamp;
  createdBy: string;            // uid of institution_admin
  updatedAt: Timestamp;
}
```

### 6.4 `reportCardComments/{id}`

One document per student per term per institution (upsert pattern).

```typescript
interface ReportCardCommentDocument {
  id: string;                        // auto-generated
  institutionId: string;
  studentId: string;
  termId: string;
  academicYearId: string;
  classSupervisorComment: string;    // free text; max 500 chars; empty string if not yet written
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
  updatedAt: Timestamp;
  updatedBy: string;                 // uid of institution_admin
}
```

**Uniqueness:** Enforced at the application layer via upsert. Composite query: `studentId + termId + institutionId`.

### 6.5 `reportCards/{id}` — Phase 2

Replaces the `reports` collection. One document per student per term per institution (upsert).

```typescript
interface ReportCardDocument {
  id: string;

  // Student identity
  studentId: string;
  studentName: string;               // "Surname, Forename"; snapshotted
  institutionStudentId: string | null; // institution-assigned ID; null if unassigned
  dateOfBirth: string | null;        // ISO "YYYY-MM-DD"; null if not set
  classId: string;
  className: string;                 // snapshotted
  classPopulation: number;           // count at generation time
  houseId: string | null;
  houseName: string | null;          // denormalized; snapshotted

  // Term and year
  termId: string;
  termName: string;                  // snapshotted
  academicYearId: string;
  academicYearName: string;          // e.g., "2025-2026"; snapshotted
  nextTermStart: string | null;      // ISO "YYYY-MM-DD"; null if no next term configured

  // Institution branding (all snapshotted at generation time)
  institutionId: string;
  institutionName: string;
  institutionMotto: string | null;
  institutionAddress: string | null;
  institutionPhone: string | null;
  institutionEmail: string | null;
  institutionLogoUrl: string | null;
  authorizedSignature: {
    mode: 'image' | 'text';
    imageUrl?: string;
    text?: string;
  } | null;

  // Comment labels (snapshotted; uses institution's configured labels)
  classSupervisorLabel: string;
  gradeSupervisorLabel: string;
  principalLabel: string;
  vicePrincipalLabel: string;

  // Section comments (snapshotted at generation time)
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;

  // Attendance (from attendanceSummaries; snapshotted)
  totalPossibleSessions: number;
  sessionsAbsent: number;
  daysLate: number;

  // Activities and positions (snapshotted)
  extraCurricularActivities: string[];
  positionsOfResponsibility: { title: string; organisation: string | null }[];

  // Grades (Phase 2)
  gradingSystem: 'flat' | 'weighted';  // snapshotted (existing field)
  subjects: {
    subjectId: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    cwWeight: number;
    examWeight: number;
    cwGrade: number | null;             // null if no coursework results
    examGrade: number | null;           // null if no exam results
    finalGrade: number;
    letterGrade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'F';
    subjectPosition: number | null;     // null if cannot be computed
    conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D' | null;
    commentNumber: number | null;       // 1–20; null if no feedback_comment exists
  }[];

  // Computed metrics (Phase 2)
  studentAverage: number | null;
  classAverage: number | null;
  classRank: number | null;
  gpa: number | null;

  // Discipline (placeholder — null until Disciplinary Action feature)
  demerits: number | null;
  suspensions: number | null;
  detentions: number | null;

  // Metadata
  generatedAt: Timestamp;
  generatedBy: string;             // uid
  generatedByRole: string;
  generatedViaBatch: boolean;
}
```

### 6.6 `attendanceSummaries/{id}` — Phase 2

One document per student per term. Document ID: `{studentId}_{termId}`.

```typescript
interface AttendanceSummaryDocument {
  id: string;                         // "{studentId}_{termId}"
  studentId: string;
  termId: string;
  academicYearId: string;
  institutionId: string;
  classId: string;
  P: number;                          // Present count
  A: number;                          // Absent count
  L: number;                          // Late count
  S: number;                          // Sick count
  E: number;                          // Excused count
  totalExpectedSessions: number;      // from Academic Calendar computation
  filledSessions: number;             // sessions with any recorded state
  sessionsAbsent: number;             // A + S + E
  daysLate: number;                   // L count (aliased for report card clarity)
  attendanceRate: number;             // (P + L) / totalExpectedSessions × 100
  updatedAt: Timestamp;
}
```

### 6.7 `institutions/{id}` — additions (Phase 1)

New fields added to the existing institution document:

```typescript
// Phase 1 additions to InstitutionDocument:
motto?: string;                       // max 200 chars
address?: string;                     // max 300 chars
phone?: string;
email?: string;
logoUrl?: string;                     // Firebase Storage URL
authorizedSignature?: {
  mode: 'image' | 'text';
  imageUrl?: string;
  text?: string;                      // max 30 chars
};
profileComplete: boolean;             // false until wizard completed; default false

// Configurable comment section labels (Phase 1)
classSupervisorLabel: string;         // default "Class Supervisor"
gradeSupervisorLabel: string;         // default "Grade Supervisor"
principalLabel: string;               // default "Principal"
vicePrincipalLabel: string;           // default "Vice Principal"
```

### 6.8 `users/{uid}` — student additions (Phase 1)

```typescript
// New optional fields on student user documents:
institutionStudentId?: string | null; // institution-assigned; null until set
dateOfBirth?: string | null;          // ISO "YYYY-MM-DD"; null until set
houseId?: string | null;              // links to houses/{houseId}
houseName?: string | null;            // denormalized; null until assigned
```

### 6.9 `subjects/{id}` — additions (Phase 2)

```typescript
// New fields on subject documents (configured by institution_admin via SubjectForm):
cwWeight: number;    // 0–100; required for report card generation
examWeight: number;  // 0–100; cwWeight + examWeight must equal 100
```

### 6.10 `results/{id}` — addition (Phase 2)

```typescript
// New field on result documents:
assessmentType: 'coursework' | 'exam';  // required; set by regular_teacher at result entry
```

### 6.11 `feedback_comments/{id}` — additions (Phase 2)

```typescript
// New required fields on feedback_comment documents:
conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D';
commentNumber: number;  // 1–20
```

---

## 7. Firebase Security Rules

These rules are additive to the existing ruleset. Existing helper functions (`callerRole`, `callerInstitutionId`, `isInstitutionMember`, `isAdmin`, `isAdminOrAbove`, `isTeacherOrAbove`) are assumed to already exist.

### 7.1 `houses`

```javascript
match /houses/{houseId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId);

  allow create, update: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );

  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

### 7.2 `studentActivities`

```javascript
match /studentActivities/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (
      isAdminOrAbove()
      || isTeacherOrAbove()
      || resource.data.studentId == request.auth.uid
      || (isParent() && exists(
           /databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)
         ))
    );

  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );
}
```

### 7.3 `studentResponsibilities`

```javascript
match /studentResponsibilities/{id} {
  // Identical access pattern to studentActivities
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (
      isAdminOrAbove()
      || isTeacherOrAbove()
      || resource.data.studentId == request.auth.uid
      || (isParent() && exists(
           /databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)
         ))
    );

  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );
}
```

### 7.4 `reportCardComments`

```javascript
match /reportCardComments/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || callerRole() == 'super_admin'
    );

  allow create, update: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );

  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

**Why read is institution_admin + super_admin only:** Section comments are internal working documents — draft comments may be sensitive and should not be visible to teachers, students, or parents before the report card is generated and issued. Teachers, students, and parents read comments from the snapshotted `reportCards` document, not directly from `reportCardComments`.

### 7.5 `reportCards` — Phase 2

Replaces the `reports` collection rules.

```javascript
match /reportCards/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || callerRole() == 'super_admin'
      || isTeacherOrAbove()
      || resource.data.studentId == request.auth.uid
      || (isParent() && exists(
           /databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)
         ))
    );

  allow create, update: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(request.resource.data.institutionId);

  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

### 7.6 `attendanceSummaries` — Phase 2

```javascript
match /attendanceSummaries/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || callerRole() == 'super_admin'
      || isTeacherOrAbove()
      || resource.data.studentId == request.auth.uid
      || (isParent() && exists(
           /databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)
         ))
    );

  // Writes are institution_admin and senior_teacher (who submit the general register)
  allow create, update: if request.auth != null
    && isInstitutionMember(request.resource.data.institutionId)
    && (
      callerRole() == 'institution_admin'
      || callerRole() == 'senior_teacher'
    );

  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

### 7.7 `reports` collection — disable after cleanup (Phase 2)

After manual deletion via Firebase Console:

```javascript
match /reports/{docId} {
  allow read, write: if false;
}
```

Publish this rule change simultaneously with Phase 2 deployment.

---

## 8. Implementation Order

### Phase 1 — Institution Foundation (implement on current branch)

| Step | Task | Depends on |
| --- | --- | --- |
| 1 | Firestore: add `profileComplete`, `motto`, `address`, `phone`, `email`, `logoUrl`, `authorizedSignature`, and four label fields to `institutions` schema; add `classSupervisorLabel` / `gradeSupervisorLabel` / `principalLabel` / `vicePrincipalLabel` defaults | — |
| 2 | Firebase Storage: configure storage bucket; create Storage rules for `institutions/{institutionId}/logo.*` and `institutions/{institutionId}/signature.*` (institution_admin write, all institution members read) | — |
| 3 | Institution Profile Onboarding Wizard (`/institution-profile`) — 6-step wizard with image upload for logo and signature | Steps 1–2 |
| 4 | `PendingInstitutionProfileCard` dashboard card + sidebar badge for incomplete profile | Step 3 |
| 5 | Firestore: `houses` collection + security rules (§7.1) | — |
| 6 | Houses list page (`/list/houses`) — CRUD; matches existing list page pattern | Step 5 |
| 7 | House detail page — shows assigned students; "Manage Students" multi-select panel for bulk assignment | Step 5 |
| 8 | Extend `users/{uid}` student schema: `institutionStudentId`, `dateOfBirth`, `houseId`, `houseName` | Step 5 |
| 9 | Create-user page (`student` role): add required `dateOfBirth` field and optional `institutionStudentId` field | Step 8 |
| 10 | Student detail/edit page: add `institutionStudentId`, `dateOfBirth`, and House dropdown fields | Steps 5, 8 |
| 11 | Student detail page: house assignment syncs to `houses/{id}` detail view (bidirectional) | Steps 7, 10 |
| 12 | Firestore: `studentActivities` collection + security rules (§7.2) | — |
| 13 | Extra Curricular Activities section on student detail page — add/list/delete entries per term | Step 12 |
| 14 | Firestore: `studentResponsibilities` collection + security rules (§7.3) | — |
| 15 | Positions of Responsibilities section on student detail page — add/list/delete entries per term | Step 14 |
| 16 | Firestore: `reportCardComments` collection + security rules (§7.4) | — |
| 17 | Section Comments section on student detail page (Entry Point 1) — four textarea fields per student per term | Step 16 |
| 18 | Bulk class comments view (`/report-card-comments`) — class+term selector; all students in grid; inline comment panel per student (Entry Point 2) | Step 16 |
| 19 | Sidebar: add "Institution Profile" entry (`institution_admin`) with badge; add "Houses" entry (`institution_admin`) | Steps 3, 6 |

### Phase 2 — Report Card (deferred — deploy atomically with SubjectForm + Subject Attendance)

| Step | Task | Depends on |
| --- | --- | --- |
| 20 | `ResultForm`: add `assessmentType: 'coursework' | 'exam'` required field; update `ResultDocument` TypeScript type | SubjectForm wiring |
| 21 | `SubjectForm`: add `cwWeight` and `examWeight` fields (0–100; validated sum = 100); update `SubjectDocument` type | SubjectForm wiring |
| 22 | `FeedbackCommentForm`: add required `conductGrade` selector and required `commentNumber` dropdown (1–20); update `FeedbackCommentDocument` type | — |
| 23 | Create `src/lib/commentKey.ts` — `COMMENT_KEY` constant (20-item array); single source of truth | — |
| 24 | Update `FeedbackCommentForm` to use `COMMENT_KEY` for the `commentNumber` dropdown display | Step 23 |
| 25 | Publish updated Firestore rules for `reportCards` and `attendanceSummaries` (§7.5–7.6); publish `reports` disable rule (§7.7) | — |
| 26 | Delete existing `reports` documents via Firebase Console | Step 25 |
| 27 | `attendanceSummaries` collection: create documents by aggregating existing `generalAttendance` data (one-time client-side migration utility triggered by institution_admin) | General Attendance Register Phase 1 |
| 28 | `src/lib/generateReportCard.ts` — full generation logic: fetch all data, compute grades/GPA/ranks, write `reportCards` document | Steps 20–27 |
| 29 | `src/lib/reportCardUtils.ts` — grade computation utilities: `computeFinalGrade`, `letterGrade`, `gpaPoints`, `computeClassRank`, `computeSubjectPosition` | — |
| 30 | `src/components/reportCard/ReportCardPDF.tsx` — 4-page portrait PDF using `@react-pdf/renderer`; 4-panel fold layout | Steps 28–29 |
| 31 | `src/components/reportCard/ReportCardPDFModal.tsx` — full-screen modal with `PDFViewer` + `PDFDownloadLink`; lazy-loaded | Step 30 |
| 32 | Report cards list page (`/report-cards`) — role-scoped table; on-demand generate panel; batch generate panel; per-row re-generate + PDF buttons | Steps 28–31 |
| 33 | Bulk class comments view: add "Generate Batch" shortcut button linking to batch panel | Step 32 |
| 34 | Sidebar: remove "Reports" entry; add "Report Cards" entry (all six roles); add "Bulk Comments" entry (`institution_admin`) | Steps 19, 32 |
| 35 | `App.tsx`: register `/report-cards` route; remove `/reports` route | Step 32 |

---

## 9. Deferred Items

### 9.1 Disciplinary Action data (Demerits, Suspensions, Detentions)

The Summary section includes Demerits, Suspensions, and Detentions fields as placeholders (`null`). These will be populated when the Disciplinary Action feature ships. The `reportCards` schema already includes the fields; no schema migration is needed at that time — only the generation logic needs to be updated to read from the future `disciplinaryActions` collection.

### 9.2 Subject Attendance on Report Card

Subject attendance sessions (presence in individual subject classes) are not shown on the Phase 2 report card. The Attendance Sessions section covers General Attendance only. Subject attendance summaries can be added to the report card in a future iteration after `subjectAttendanceSummaries` is built (deferred in `ATTENDANCE_REGISTER_SPEC.md`).

### 9.3 Multi-country institution support

Institution profile, public holidays, and date formatting are Jamaican-defaults only. When the platform expands, a `country` field on the institution document should drive locale-specific defaults (holiday list, date format, phone format, address format). Defer until expansion is imminent.

### 9.4 `super_admin` live-mode report card visibility

The `onSnapshot` subscription for the report cards list page filters by `institutionId`. When `institutionId === '*'` (super admin), the filter is undefined. Super admin live-mode visibility of report cards across all institutions requires a collection-group query or a separate implementation. Defer — match the existing limitation documented in `REPORT_GENERATION.md §9`.

### 9.5 Class Average and Class Rank completeness guarantee

Class Average and Class Rank are accurate only after all students in a class have had their report cards generated. Individual on-demand generation before the class batch run will produce `null` or inaccurate ranks. The UI should display a note: _"Class Rank and Class Average are computed relative to report cards generated so far. Use batch generation for accurate comparative rankings."_ Defer the design of a "lock and finalize" mechanism to a future release.

### 9.6 Report card versioning / issuance workflow

Currently, re-generation overwrites the existing report card document (upsert). There is no concept of an "issued" vs. "draft" state. A future issuance workflow (mark a report card as officially issued; prevent further edits without unlocking) would require adding an `issuedAt: Timestamp | null` field and a separate `institution_admin` confirmation step. Defer — document as a known limitation.

### 9.7 PDF signature image CORS

Loading a Firebase Storage image URL inside `@react-pdf/renderer` may fail due to CORS restrictions, depending on the storage bucket's CORS configuration. The implementation team must configure Storage CORS headers (`Access-Control-Allow-Origin: *` for the report card assets path, or fetch images server-side via a Cloud Function proxy). Defer the exact CORS configuration to the Phase 2 implementation.

### 9.8 Retroactive `dateOfBirth` and `institutionStudentId` for existing students

Existing students are not required to have `dateOfBirth` or `institutionStudentId`. These fields are `null` and appear blank on their report cards. A batch edit UI (institution_admin fills in missing fields for all students in a class at once) would improve the experience but is not in scope for Phase 1. Defer as a UX improvement.

---

## 10. Files and Routes

### New files — Phase 1

| File | Purpose |
| --- | --- |
| `src/scenes/(dashboard)/institution-profile/index.tsx` | Institution Profile Onboarding Wizard |
| `src/components/PendingInstitutionProfileCard.tsx` | Dashboard notification card for incomplete profile |
| `src/scenes/(dashboard)/list/houses/index.tsx` | Houses list page |
| `src/scenes/(dashboard)/list/houses/[id]/index.tsx` | House detail page (assigned students + management) |
| `src/scenes/(dashboard)/report-card-comments/index.tsx` | Bulk class section comments view |

### New files — Phase 2

| File | Purpose |
| --- | --- |
| `src/lib/generateReportCard.ts` | Report card generation logic |
| `src/lib/reportCardUtils.ts` | Grade computation, GPA, ranking utilities |
| `src/lib/commentKey.ts` | Static 20-item COMMENT_KEY constant |
| `src/components/reportCard/ReportCardPDF.tsx` | 4-panel PDF component |
| `src/components/reportCard/ReportCardPDFModal.tsx` | PDF preview modal |
| `src/scenes/(dashboard)/report-cards/index.tsx` | Report cards list + generate page |

### Modified files — Phase 1

| File | Change |
| --- | --- |
| `src/App.tsx` | Add `/institution-profile`, `/list/houses`, `/list/houses/:id`, `/report-card-comments` routes |
| `src/components/Menu.tsx` | Add "Institution Profile" and "Houses" sidebar entries (`institution_admin`) |
| `src/scenes/(dashboard)/institution-admin/index.tsx` | Add `PendingInstitutionProfileCard` |
| `src/scenes/(dashboard)/list/students/index.tsx` | Add student detail extensions (Student ID, DOB, House, Activities, Responsibilities, Section Comments sections) |
| `src/scenes/(dashboard)/create-user/index.tsx` | Add `dateOfBirth` (required) and `institutionStudentId` (optional) for `student` role |
| `src/lib/firebase.ts` | Add TypeScript types: `HouseDocument`, `StudentActivityDocument`, `StudentResponsibilityDocument`, `ReportCardCommentDocument`; extend `InstitutionDocument`, `UserDocument` |

### Modified files — Phase 2

| File | Change |
| --- | --- |
| `src/App.tsx` | Add `/report-cards` route; remove `/reports` route |
| `src/components/Menu.tsx` | Remove "Reports" entry; add "Report Cards" (all roles); add "Bulk Comments" (`institution_admin`) |
| `src/components/forms/ResultForm.tsx` | Add `assessmentType` required field |
| `src/components/forms/FeedbackCommentForm.tsx` | Add `conductGrade` and `commentNumber` required fields |
| `src/lib/firebase.ts` | Add `ReportCardDocument`, `AttendanceSummaryDocument` types; extend `ResultDocument`, `FeedbackCommentDocument`, `SubjectDocument` |

### Firestore collections (new)

| Collection | Phase |
| --- | --- |
| `houses` | 1 |
| `studentActivities` | 1 |
| `studentResponsibilities` | 1 |
| `reportCardComments` | 1 |
| `reportCards` | 2 |
| `attendanceSummaries` | 2 |

### New routes

| Route | Component | Access |
| --- | --- | --- |
| `/institution-profile` | `InstitutionProfileWizardPage` | `institution_admin` |
| `/list/houses` | `HousesListPage` | `institution_admin` |
| `/list/houses/:id` | `HouseDetailPage` | `institution_admin` |
| `/report-card-comments` | `ReportCardCommentsPage` | `institution_admin` |
| `/report-cards` | `ReportCardsPage` | All roles (role-scoped) |

### Removed routes — Phase 2

| Route | Replaced by |
| --- | --- |
| `/reports` | `/report-cards` |
