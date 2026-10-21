# Exams Feature — Buildout Spec (online multiple-choice exams with auto-grading)

> **Status:** Planned. Nothing in this document is implemented yet. The current Exams feature is a schedule record only (subject, class, date, time, room); see §2.
> **Feature:** Lets teachers and administrators build a multiple-choice exam inside the app (or import one from a spreadsheet, Word file or PDF and review it), publish it to a class with an opening window and a timer, lets students sit it once in the app, grades it automatically, and releases the score to the student and their parents.
> **Route:** extends the existing `/dashboard/list/exams` page and adds sub-routes for the builder, the student attempt, the preview and the staff results (§4.7).
> **Primary roles:** `institution_admin`, `senior_teacher`, `regular_teacher` (author, grade, release, finalize); `student` (attempt, see own released score); `parent` (see dates and the children's released scores); `spectator` (read-only, admin-level view).
> **Explicitly out of scope for the first version:** every question category other than Multiple Choice (the category list is shown but disabled), images or equations inside questions, drag-and-drop and its device restriction, more than one attempt, instant grading at the moment of submission (needs a server, see §3 and §14), and any change to the Gradebook.

---

## 1. Overview

Today an "exam" in the app is only an entry in a timetable. This feature turns an exam into something students can actually sit:

1. A teacher or administrator creates an exam (as today) and ticks **Online exam**. They choose a **value type** (Quiz, Test, Exam, End of term Exam, End of year Exam, Mock Exam, Open Book, Other) and a **category** (Multiple Choice is the only selectable one for now), and for Multiple Choice whether questions have a single correct answer, several, or both.
2. They write the questions and the answer key in an in-app **builder**, or **import** them from an Excel/CSV template, a Word file in a fixed layout, or a text PDF. Imported content always lands in the builder for review before it can be published.
3. They set a **window** (opens/closes), a **duration**, how multiple-answer questions are scored, whether to **Auto-Grade**, and when students may see their score.
4. Students of the class open the exam inside the window, start it once, answer with a timer running from the server's clock, and submit (or are submitted automatically at time-up).
5. A teacher or administrator **grades** the submitted attempts in the app, automatically if Auto-Grade is on and the answer key is complete, otherwise by entering marks. Scores are **released** to students and parents on the teacher's chosen schedule and are also written to `results` as `assessmentType: 'exam'`, so report cards pick them up with no further change.
6. The teacher **finalizes** the exam, which removes the raw attempts and keeps the grades and results.

Everything runs on the Spark plan: no Cloud Functions, no Cloud Storage, no new infrastructure. The one consequence is that grading runs in a staff member's browser rather than on a server (§3, decision 4).

---

## 2. Background / Investigation Findings

- **The current Exams feature is a thin schedule record.** `ExamForm.tsx` writes `institutionId`, `termId/termName`, `subjectId/subjectName`, `classId/className`, `teacherId/teacherName`, optional `departmentId`, `date`, optional `startTime`, `duration` (minutes), `room`, and `createdBy/createdByRole/createdAt` to `institutions/{id}/exams`. There is no title, type, status, question, file, attempt or score (`ExamDocument` in `src/types/assessment.ts`). Nothing else in the app reads exams: no link to results, the Gradebook, report cards, the timetable, the calendar or the audit log.
- **The Exams page shows every exam to every role.** `list/exams/index.tsx` opens one shared listener on the whole collection filtered only by institution; there is no scoping by class, subject, term or teacher. Students do not see the sidebar link because `STUDENT_TEMPORARILY_HIDDEN` in `src/lib/sidebarNav.ts` contains "Exams", but the route is reachable by URL.
- **Rules today:** `institutions/{id}/exams` is readable by any signed-in user of the institution; create needs `isTeacherOrAbove()`; update needs an admin, the exam's own teacher (`resource.data.teacherId`), or `isSeniorTeacherFor(resource.data.departmentId)`; delete is admin only. A flat legacy `exams` block also remains. There is no composite index for exams.
- **The ExamForm already stamps the teacher's department** (`departmentId`) on the exam; the department-scoped senior-teacher access in this spec relies on it. A teacher is locked to themselves as the exam's teacher; an administrator picks the teacher.
- **Firestore rules are per document, not per field.** A client that can read a document receives all its fields, so an answer key can only be hidden by keeping it in its own document with its own rule. (Firebase's security-rules documentation says the same and recommends a separate document.)
- **The Realtime Database blob store cannot hold the key or the questions' secrecy.** `database.rules.json` lets any signed-in user read `files/{institution}/{blobKey}` (`docs/ISSUES_AND_GAPS.md` #65). This feature stores only text, so no blob is involved.
- **A student's browser cannot write `results`.** The `results` create rule requires `isTeacherOrAbove()` and `teacherId == request.auth.uid`. There is also no backend and no Cloud Functions on Spark (`docs/ISSUES_AND_GAPS.md` #43 and #46 describe the limits that already shaped other features). So a score cannot be computed and recorded at the moment a student submits.
- **The closest existing patterns:** assignments (`submissions/{studentId}` written by the student, graded by staff through `gradeSubmission()` in `src/lib/grading.ts`, which writes the grade and a `results` entry in one batch) and lesson notes (class-scoped reads, per-document rules, a shared checkbox list). `takesSubject()` in `src/lib/studentClasses.ts` already decides which students take a subject in a class.
- **Parsing libraries:** only `@e965/xlsx` (used by `src/lib/spreadsheetImport.ts` for CSV/XLSX) is installed. There is no PDF or Word reader. `@react-pdf/renderer` generates PDFs but cannot read them.
- **Inactivity and sessions:** students are signed out after 30 minutes without input and staff after 5 (`src/hooks/useInactivityLogout.ts`); `useKeepAliveWhileOpen` (capped at 15 minutes) exists for long, input-free screens; one active session per account is held in the Realtime Database (`src/lib/sessionLock.ts`; limits in `docs/ISSUES_AND_GAPS.md` #43, including 100 simultaneous connections on Spark).
- **Report cards:** `computeExamGrade` in `src/lib/reportCardUtils.ts` averages `results` with `assessmentType: 'exam'`; subjects carry `examWeight`. Writing released exam scores as `exam` results is therefore enough for report cards.

---

## 3. Resolved Design Decisions

| #   | Decision                      | Choice                                                                                                                                                                                                  | Why                                                                                                                                                                   |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where it lives                | An **Online exam** option on the existing exam record; existing exams stay schedule-only and keep working.                                                                                              | One page and one record for an exam; no double entry; no migration.                                                                                                   |
| 2   | Question source               | An in-app **builder** (text only, at most **100 questions**, 2 to 6 options each). Spreadsheet, Word and PDF files are **imported into the builder** and reviewed before publishing; the file is read in the browser and **not stored**. | A PDF or Word file is not an exam; turning it into clickable questions is best-effort parsing, so a review step is mandatory. Not storing the file costs nothing in quota. |
| 3   | Category                      | The category dropdown lists all twelve options; **only Multiple Choice is selectable**, the rest are disabled with a "coming soon" label.                                                               | Keeps the planned list visible without building the other categories.                                                                                                 |
| 4   | Who grades, and when          | **Automatic grading runs in a staff browser** when a teacher or administrator opens the exam's results (or presses **Grade now**). Students see "awaiting results" until then and the release rule applies. | There is no trusted server on Spark and the answer key must never reach a student's browser. A future backend can run the same grading without changing the data (§14). |
| 5   | When auto-grading is allowed  | Only if **all** hold: category is Multiple Choice; the answer key is complete and valid (§6.1); the teacher ticked **Auto-Grade**. Otherwise staff enter scores by hand.                                | Matches the original requirement.                                                                                                                                     |
| 6   | Multiple-answer scoring       | Chosen per exam: **all-or-nothing** or **partial credit** (§6.2).                                                                                                                                       | Teachers disagree on this; both are simple and explainable.                                                                                                           |
| 7   | Attempts                      | **One attempt** per student, inside an open/close window, with a **timer from server time**; auto-submit at time-up; a late submission is refused.                                                     | Enforceable in rules with `request.time`; the assignment flow uses a client clock, which is not good enough for an exam.                                              |
| 8   | Saving in-progress answers    | A **checkpoint** (a save to the server) every **10 minutes by default, 5 to 15 minutes per exam**, and on submit. Resume after a refresh from the last checkpoint.                                      | Each save is one write against the 20,000-writes-a-day free limit; 10 minutes balances lost work against quota (§9).                                                  |
| 9   | What students see afterwards  | **Score only** (marks, percentage, optional teacher comment). No per-question marks, never the answer key.                                                                                              | Per-question feedback lets a class reconstruct the key.                                                                                                               |
| 10  | Release                       | Per exam: **as soon as graded**, **at a set date and time**, or **when the teacher presses Release**. Parents see the same score at the same time.                                                      | Matches the original requirement.                                                                                                                                     |
| 11  | Results and report cards      | Every released grade is also written to `results` as `assessmentType: 'exam'` (all exam types count as `exam`) with an `examId` back-link. The Gradebook is not touched.                                | Report cards already average `exam` results; nothing downstream changes.                                                                                              |
| 12  | Raw attempts                  | Kept until the teacher presses **Finalize exam**, which deletes them (grades and results stay). Re-grading is possible only before finalizing.                                                          | Keeps re-grade, tab-switch counts and difficulty statistics available while they matter, then frees storage.                                                          |
| 13  | Access                        | Administrator: every exam. Senior teacher: exams they own and exams stamped with their department. Regular teacher: only exams they own. The **schedule fields stay visible to all staff**; questions, key, attempts and grades do not. | Keeps the same-class-same-date clash warning working while protecting content.                                                                                        |
| 14  | Extras included in version 1  | Per-student shuffle; tab/window-switch counter; question navigator with flag-for-review; "answered N of M"; confirm-before-submit; resume after refresh; extra time for named students; manual override with a reason; re-grade after a key fix; results table with average/minimum/maximum and CSV export; per-question difficulty; preview as student; duplicate exam; draft/published/closed/finalized states; release controls; a late-start policy; an informational phone notice; free-tier copy for teachers. | Owner's list.                                                                                                                                                         |
| 15  | Question limits               | At most 100 questions; question text up to 1,000 characters; option text up to 300 characters; 2 to 6 options; points per question 0.5 to 100 in steps of 0.5; duration 5 to 300 minutes.            | Keeps the questions document well under Firestore's 1 MiB limit (about 300 KB worst case) and the exam usable.                                                        |

---

## 4. User-Facing Behaviour

### 4.1 The exam form (existing form, extended)

Existing fields stay: term, subject, class, teacher, date, start time, duration, room. New:

- **Title** (1 to 120 characters; required for an online exam, optional for a schedule-only one).
- **Type** dropdown: Quiz, Test, Exam, End of term Exam, End of year Exam, Mock Exam, Open Book, Other. Choosing **Other** shows a short text box (up to 50 characters) for the name.
- **Category** dropdown (optional for a schedule-only exam, required for an online one): Multiple Choice, True-or-False, Fill-in-the-blank, Matching (Corresponding Pairs), Short Answer, Extended Response, Problem Solving / Computational, Oral / Performance, Interactive, Drag-and-drop, Mixed, Other. **Only Multiple Choice is enabled**; the rest are disabled and marked "coming soon".
- When Multiple Choice is chosen, an **Answer mode** dropdown appears:
  - **Single-answer**: every question has exactly one correct answer.
  - **Multiple-answer** (also called "multiple response" or "select all that apply"): every question has at least two correct answers.
  - **Both**: some questions are single-answer and others multiple-answer.
- **Online exam** checkbox. When ticked, an **Online settings** section appears: window (opens and closes, date and time), duration (the existing field becomes required, 5 to 300 minutes), scoring mode (shown when the answer mode can have multiple-answer questions), **Auto-Grade** checkbox, release mode (and a date-time when "at a set date and time"), shuffle on/off (default on), checkpoint interval (5, 10 or 15 minutes; default 10).
- A short **free-tier note** (§9) estimates the writes one sitting of the class will use.
- The existing same-class-same-date clash warning is unchanged.

The window defaults from the exam's date and start time (opens at the start time, closes after the duration plus 15 minutes). An administrator may create exams for other teachers; a teacher creates them for themselves, as today.

### 4.2 Exam states

`draft` → `published` → `closed` → `finalized`.

- **draft:** staff only can open the builder; students cannot read the questions.
- **published:** students of the class can read the questions and start inside the window. Publishing requires at least one question, a valid structure for the answer mode, an opens/closes window in the future or current, and, if Auto-Grade is ticked, a complete valid key.
- **closed:** the window has ended (derived from the clock, no write needed) or the teacher closed it early (stored). No new attempts start; running attempts end at their own deadline.
- **finalized:** attempts deleted; results and grades kept; the exam is read-only except for releasing any remaining scores.

Editing the questions or key of a published exam is allowed before the window opens; after the first attempt starts the builder warns and limits edits to **key corrections** (which bump the key revision and make existing grades show "re-grade needed", §6.5).

### 4.3 The builder

A page per exam (staff). A list of questions with: text, kind (single or multiple, depending on the exam's answer mode), 2 to 6 options, which options are correct (radio buttons for single, checkboxes for multiple), and points. Add, delete, reorder (move up/down), duplicate a question. A counter shows questions and total points. Validation messages are shown per question and block publishing; saving a draft is always allowed. The questions and the key are saved together, in two documents (§5).

### 4.4 Import

On the builder page: **Import from file**. Accepted: `.xlsx`, `.csv`, `.docx`, `.pdf`. The file is read in the browser; nothing is uploaded or stored.

- **Excel/CSV template** (download link provided; most reliable). First sheet, header row required, one row per question: `Question`, `Type` (optional: `single` or `multiple`; inferred from `Correct` when blank), `Option A` … `Option F`, `Correct` (letters, e.g. `B` or `A,C`), `Points` (optional, default 1). Up to 100 rows. Built on `parseSpreadsheetFile` and the existing import-page conventions.
- **Word (.docx), fixed layout:** plain paragraphs; each question starts with a number (`1.` or `1)`); options on their own lines starting `A.`, `A)` or `(A)`; an answer line `Answer: B` or `Answers: A, C`; optional points as `[2 marks]` or `(2 points)`. Tables, images and text boxes are ignored and reported. The layout rules are shown on the import dialog with an example.
- **PDF with real text:** the text layer is read with a lazy-loaded PDF text reader and parsed with the same layout rules. Scanned PDFs (no text layer) are rejected with a clear message; there is no OCR.
- The Word and PDF readers are loaded only when needed, served from the app's own origin (no CDN), and add no weight to other pages.
- **Review screen:** the parsed questions open in the builder with a banner listing warnings (a question with fewer than two options, no detected answer, an answer letter that matches no option, more than 100 questions, unreadable parts). Nothing is saved until the teacher presses Save. If the file had no answers the key is simply incomplete, which blocks Auto-Grade until the teacher fills it in.

### 4.5 Student experience

- **Exams list (student):** published and closed exams for the student's classes, with date, time, duration and a status chip: *Not started*, *Open now*, *In progress*, *Submitted – awaiting results*, *Closed*, or the score once released. Exams for subjects the student does not take in an additional class are hidden (`takesSubject`). The sidebar "Exams" item is shown to students (removed from `STUDENT_TEMPORARILY_HIDDEN`).
- **Start screen:** title, subject, duration, number of questions, the window, rules ("You can attempt this exam once. The timer cannot be paused."), the extra time the student has been given (if any), and a **Start** button. On a phone screen an informational notice says a larger screen is easier; it never blocks the attempt.
- **Attempt screen:** one question at a time, with a **question navigator** (numbered buttons showing answered, unanswered and flagged), **Previous/Next**, **Flag for review**, an "**Answered N of M**" counter and a countdown timer driven by the server's start time (not the device clock). Single-answer questions use radio buttons; multiple-answer questions use checkboxes and say "Select all that apply". Questions and options appear in the student's own shuffled order when shuffle is on. The student can change answers until they submit.
- **Submit:** a confirmation dialog states how many questions are unanswered and flagged. At time-up the attempt is submitted automatically with the answers held so far.
- **Resume:** if the page is refreshed, the browser crashes, or the student signs in again on the same or another device (the single-session lock allows only one at a time), the attempt reopens from the last checkpoint with the same deadline and the same shuffle.
- **Tab/window switches** are counted (page hidden or window blurred) and saved with the next checkpoint. The student is told once at the start that switches are recorded; nothing is blocked.
- **After submitting:** "Submitted. Your result will be shown here when your teacher releases it." Once released: the score, the maximum and the percentage, and the teacher's comment if any. No questions, answers or key.

### 4.6 Parent and spectator

- **Parent:** the exam dates and details for their children's classes, and each child's released score. No questions, no key.
- **Spectator:** the administrator view, read only (including the key, as an admin-level reader, in line with `docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md`); no write controls are shown.

### 4.7 Staff screens and routes

| Screen                    | Route (all lazy-loaded)                           | Who                                                              |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Exams list (extended)     | `/dashboard/list/exams`                            | All roles; content per role (§11)                                 |
| Builder                   | `/dashboard/list/exams/:examId/build`              | Staff with access to the exam                                     |
| Preview as student        | `/dashboard/list/exams/:examId/preview`            | Staff with access; no writes, a visible "Preview" banner          |
| Student attempt           | `/dashboard/list/exams/:examId/take`               | Student of the class                                              |
| Results and grading       | `/dashboard/list/exams/:examId/results`            | Staff with access; spectator read-only                            |

**Results and grading screen** shows: counts (started, submitted, graded, released, needs re-grade), the table (student, status, score, percentage, tab switches, extra time, graded by, method) sorted by name with natural ordering, class average/minimum/maximum, a per-question difficulty table (percentage who answered correctly; see §6.6), buttons **Grade now**, **Release** (when release mode is manual), **Add extra time**, **Export CSV**, **Finalize exam**, and per-student **Override score** (with a required reason, audited) and **Enter score** (when Auto-Grade is off). Opening the screen after the window has closed grades any ungraded submitted attempts automatically if Auto-Grade is on and the key is complete.

---

## 5. Data Model

All collections live under `institutions/{institutionId}/exams/{examId}`.

### 5.1 `exams/{examId}` (existing document, extended)

Existing fields are unchanged. New optional fields (present when `online == true` unless noted):

| Field               | Type                                                        | Notes                                                                                           |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `title`             | string (1 to 120)                                           | Optional on schedule-only exams.                                                                 |
| `valueType`         | `'quiz' \| 'test' \| 'exam' \| 'end_of_term' \| 'end_of_year' \| 'mock' \| 'open_book' \| 'other'` | Optional on schedule-only exams.                                          |
| `valueTypeLabel`    | string (1 to 50)                                            | Required when `valueType == 'other'`.                                                            |
| `categoryType`      | `'multiple_choice'` (twelve values reserved)                | Only `multiple_choice` is accepted in version 1.                                                 |
| `answerMode`        | `'single' \| 'multiple' \| 'both'`                          | Required with `multiple_choice`.                                                                 |
| `online`            | boolean                                                     | `true` makes it an online exam.                                                                  |
| `status`            | `'draft' \| 'published' \| 'closed' \| 'finalized'`         | `closed` stored only when the teacher closes early; time-based closing is derived.               |
| `opensAt`, `closesAt` | Timestamp                                                 | `opensAt < closesAt`.                                                                            |
| `duration`          | number (minutes, 5 to 300)                                  | Existing field; required for online exams.                                                       |
| `questionCount`     | number (1 to 100)                                           | Denormalised from the questions document.                                                        |
| `totalPoints`       | number                                                      | Sum of the questions' points.                                                                    |
| `scoringMode`       | `'all_or_nothing' \| 'partial'`                             |                                                                                                  |
| `autoGrade`         | boolean                                                     | The teacher's opt-in.                                                                            |
| `releaseMode`       | `'auto' \| 'scheduled' \| 'manual'`                         |                                                                                                  |
| `releaseAt`         | Timestamp \| null                                           | Required for `scheduled`.                                                                        |
| `shuffle`           | boolean                                                     |                                                                                                  |
| `checkpointMinutes` | number (5 to 15)                                            | Default 10.                                                                                      |
| `keyRevision`       | number                                                      | Starts at 1; bumped whenever the key changes after the first attempt.                            |
| `finalizedAt`       | Timestamp                                                   | Set by Finalize.                                                                                 |
| `questionStats`     | map `questionId → { answered, correct }`                    | Written once at Finalize so difficulty survives the deletion of attempts.                        |

Everything on this document is readable by any signed-in user of the institution (as today), so it holds no secrets: no questions, no key.

### 5.2 `exams/{examId}/content/questions` (one document)

```
{ revision: number,
  updatedAt: Timestamp,
  items: [ { id: string,                       // short random id, stable
             text: string,                     // up to 1,000 characters
             kind: 'single' | 'multiple',
             options: [ { id: string, text: string } ],   // 2 to 6, text up to 300
             points: number } ] }              // up to 100 items
```

Readable by staff with access, and by a student only inside the window (§7).

### 5.3 `exams/{examId}/private/key` (one document)

```
{ revision: number, updatedAt: Timestamp, updatedBy: string,
  answers: { [questionId]: string[] } }        // the correct option ids
```

Readable and writable by staff with access only. Never by a student or parent. A spectator reads it as an admin-level reader.

### 5.4 `exams/{examId}/attempts/{studentUid}`

```
{ institutionId, studentId, studentName, classId,
  status: 'in_progress' | 'submitted',
  startedAt: Timestamp,          // == request.time at creation
  deadlineAt: Timestamp,         // startedAt + duration + extra time, never after closesAt + extra
  extraMinutes: number,
  order: { questions: string[], options: { [questionId]: string[] } },   // the student's shuffle
  answers: { [questionId]: string[] },
  flags: string[],
  tabSwitches: number,
  lastSavedAt: Timestamp,
  submittedAt?: Timestamp,       // == request.time when submitted
  submitReason?: 'student' | 'timeout' | 'expired' }
```

The document id is the student's uid, so a second attempt is impossible (a create on an existing id is an update, which the rules refuse to widen). `expired` is set by staff for an attempt that never reached submit before its deadline (for example the student lost power).

### 5.5 `exams/{examId}/grades/{studentUid}`

```
{ institutionId, studentId, studentName, classId,
  score: number, maxScore: number,
  method: 'auto' | 'manual',
  manualReason?: string, comment?: string,
  gradedBy: string, gradedByName: string, gradedAt: Timestamp,
  keyRevision: number,
  releaseAt: Timestamp | null,   // null until released; the student reads it only when releaseAt <= request.time
  resultSynced: boolean }
```

This is the only place a student or parent reads a score. It is deliberately separate from the attempt and from `results` so that a score cannot be seen before its release time (`results` entries are readable by the student as soon as they exist).

### 5.6 `exams/{examId}/accommodations/{studentUid}`

`{ extraMinutes: number (1 to 120), addedBy, addedAt }`. A student reads their own; staff manage. Applied when the attempt starts; adding extra time to a student who has already started updates their attempt's `deadlineAt` through staff.

### 5.7 `results` (existing collection, one optional field)

Released grades are written as `{ studentId, studentName, teacherId (the staff member writing), teacherName, classId, className, termId, institutionId, departmentId, subjectId, assessmentName: title, assessmentType: 'exam', score, maxScore, date: exam date, createdAt, examId }` with the deterministic id `exam_{examId}_{studentUid}` so syncing twice never duplicates. `ResultDocument` gets an optional `examId`. No other consumer of `results` changes.

### 5.8 Size and shape limits

100 questions at 1,000 + 6 × 300 characters is about 300 KB; typical exams are 20 to 40 KB. Answers per attempt are a map of at most 100 keys. The client validates all shapes; rules validate sizes and the fields that matter for security (§7).

---

## 6. Grading, Scoring and Release

### 6.1 A complete valid key

For every question: at least one correct option; every correct id is one of the question's options; a **single** question has exactly one correct option; a **multiple** question has at least two. The exam's answer mode agrees with the questions' kinds (`single` → all single; `multiple` → all multiple; `both` → any mix). `totalPoints` equals the sum of the points. Auto-Grade can be ticked and the exam published with Auto-Grade only when this holds.

### 6.2 Scoring a question

Let *C* be the number of correct options, *R* the chosen options that are correct and *W* the chosen options that are wrong.

- **Single question:** full points when the chosen set equals the correct option, otherwise 0. Choosing more than one option scores 0.
- **Multiple question, all-or-nothing:** full points only when the chosen set equals the correct set.
- **Multiple question, partial credit:** points × max(0, (R − W) / C).
- An unanswered question scores 0. Totals are rounded to two decimals; `maxScore` is `totalPoints`.

Grading ignores option ids that are not in the question.

### 6.3 Who may grade

Staff with access to the exam (§11). The grading code reads the key once, then the submitted attempts, computes each score and writes the grades in batches (the existing batch pattern in `src/lib/grading.ts`), one audit entry for the run. Attempts still `in_progress` after their deadline are marked `submitted` with `submitReason: 'expired'` by staff first.

### 6.4 Manual grading and override

When Auto-Grade is off, staff enter a score per student (0 to `maxScore`). Staff can override any score with a **required reason**; the grade records `method: 'manual'`, the reason and who did it. An override is never replaced by an automatic re-grade; the screen marks such rows and offers "re-grade this student" explicitly.

### 6.5 Re-grade after a key fix

Editing the key bumps `keyRevision`. Grades carry the revision they were computed with; any grade with an older revision shows **Re-grade needed**, and **Grade now** recomputes them (keeping manual overrides unless chosen). Re-grading is possible until the exam is finalized, and already released scores are updated in place (the audit entry says so).

### 6.6 Statistics

Class average, minimum, maximum and the number graded, computed in the browser. **Per-question difficulty** is the percentage of submitted attempts that answered each question correctly, computed from the attempts and the key; at **Finalize** the counts (`answered`, `correct` per question) are stored in `questionStats` before the attempts are deleted, and the results screen reads them afterwards.

### 6.7 Release

- **As soon as graded:** the grade's `releaseAt` is set to the grading time.
- **At a set date and time:** `releaseAt` is the exam's `releaseAt`, written with the grade.
- **When the teacher presses Release:** `releaseAt` stays null until the button is pressed, which sets it for every graded student.

A student or linked parent can read a grade only when `releaseAt <= request.time` (§7). Because writing `results` would reveal the score immediately, the `results` entries are written (**results sync**) only once the release time has passed, by a staff browser the next time the results screen is opened (or when Release is pressed); the sync marks `resultSynced: true`. Report cards therefore lag until a staff member opens the screen, which the results screen states.

### 6.8 Finalize

Preconditions: every submitted attempt is graded, every grade is released, every result is synced. **Finalize** writes `questionStats`, sets `status: 'finalized'` and `finalizedAt`, and deletes the attempts (one delete each, in batches). Accommodations and grades remain. A finalized exam cannot be re-graded.

### 6.9 Deleting an exam

Deleting an online exam also deletes its `content`, `private`, `attempts`, `grades` and `accommodations` documents (a cascade in the delete path used by `src/lib/deleteRecord.ts`, counted in §9). `results` entries it produced are kept; they are the academic record.

---

## 7. Firestore Rules

Helper `examStaffAccess(exam)` (exam = the exam document's data): `isAdminOrAbove()` (any exam), or `isTeacher() && exam.teacherId == request.auth.uid`, or `isSeniorTeacherFor(exam.departmentId)`. Read rules also admit `isSpectator()` through the existing `canReadAdminData()` helper. Subcollection rules obtain the exam with one `get()` (billed as one read per evaluation).

| Path                                   | Read                                                                                                                                               | Create                                                                                                                                                                                                                                  | Update                                                                                                                                                                                                                                                              | Delete                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `exams/{examId}`                       | Unchanged: any signed-in user of the institution.                                                                                                   | Unchanged, plus: when `online == true`, valid shape (enums, `opensAt < closesAt`, `duration` 5 to 300, `questionCount` 1 to 100, `checkpointMinutes` 5 to 15, `status` in the four values).                                             | Unchanged access (admin, own teacher, senior teacher of the department), plus: the same shape check; `finalized` exams may change only release fields; `departmentId`, `teacherId` frozen after creation for non-admins.                                            | Unchanged: administrators only.          |
| `…/content/questions`                  | Staff with access; spectator; a **student** only if `inMyClasses(exam.classId)`, `exam.online == true`, `exam.status == 'published'` and `opensAt <= request.time <= closesAt + 2 hours`. Never a parent. | Staff with access; document size and `items.size() <= 100`.                                                                                                                                                                              | Staff with access (same checks).                                                                                                                                                                                                                                    | Staff with access (or the exam cascade). |
| `…/private/key`                        | Staff with access; spectator. **Never a student or parent.**                                                                                        | Staff with access.                                                                                                                                                                                                                       | Staff with access.                                                                                                                                                                                                                                                  | Staff with access.                       |
| `…/attempts/{studentUid}`              | The student whose uid is the document id; staff with access; spectator.                                                                             | The student themself (id == uid) only if the exam is published, `inMyClasses(exam.classId)`, `request.time` is inside `[opensAt, closesAt]`, `status == 'in_progress'`, `startedAt == request.time`, `deadlineAt <= request.time + duration(exam.duration + extra)` and `deadlineAt <= closesAt + extra`, `tabSwitches == 0`, key whitelist, `answers.size() <= 100`. | **Student:** only while `status == 'in_progress'` and `request.time <= resource.data.deadlineAt + 60 s`; only the keys `answers`, `flags`, `tabSwitches`, `lastSavedAt`, `status`, `submittedAt`, `submitReason`; `tabSwitches` never decreases; moving to `submitted` needs `submittedAt == request.time` and `submitReason in ['student','timeout']`; never back to `in_progress`. **Staff:** only `status` (to `submitted`) and `submitReason: 'expired'`, and only after the deadline; staff may extend `deadlineAt` for added extra time. | Staff with access (Finalize and cascade); never a student. |
| `…/grades/{studentUid}`                | Staff with access; spectator; the **student** (id == uid) or a **linked parent** (`exists` on `student_parents/{parentUid}_{studentUid}`) **only when `releaseAt != null && releaseAt <= request.time`**. | Staff with access; `score <= maxScore`.                                                                                                                                                                                                  | Staff with access; same check.                                                                                                                                                                                                                                      | Staff with access.                       |
| `…/accommodations/{studentUid}`        | The student (id == uid); staff with access; spectator.                                                                                              | Staff with access; `extraMinutes` 1 to 120.                                                                                                                                                                                              | Staff with access.                                                                                                                                                                                                                                                  | Staff with access.                       |
| `results` (existing)                   | Unchanged.                                                                                                                                          | Unchanged (the staff member writing is `teacherId`; a regular teacher must be in the subject's `teacherIds`, which the exam's own teacher is); `examId` accepted.                                                                       | Unchanged.                                                                                                                                                                                                                                                          | Unchanged.                               |

Notes:

- Rules cannot loop, so option ids inside `answers` are not validated; the grader ignores unknown ids.
- A student of the class who does not take the subject (an additional-class student with chosen subjects) is turned away by the app (`takesSubject`); the rule limits only to the class. This is a UI-level subject filter, as for lesson notes and assignments.
- Spectators are never named in a write rule (the file's standing convention).
- New audit event types (`exam_edit`, `exam_publish`, `exam_grade`, `exam_release`, `exam_finalize`) are added to `AuditEventType` (`src/types/audit.ts`), `src/lib/auditEvents.ts` and both `validAuditEntry` lists in `firestore.rules`; `auditRules.test.ts` fails if they drift.
- **Emulator test list** (before any rules deploy): student cannot read the questions before `opensAt`, after `closesAt + 2 h`, in a draft, or for another class; a parent cannot read questions; no student or parent can read the key; a second attempt create is refused; an attempt cannot start outside the window or with a `startedAt` that is not `request.time`; a checkpoint after the deadline is refused; a student cannot change `status` back, `tabSwitches` downward, or any grading field; a submit with a forged `submittedAt` is refused; the score is unreadable by the student or parent before `releaseAt` and readable after; a regular teacher cannot read another teacher's questions, key, attempts or grades; a senior teacher can for their department only; an administrator can for any; the spectator can read and not write; deadline and extra-time bounds hold.

---

## 8. Indexes

None expected. The student list filters the exams collection by class with equality filters and sorts in the browser (as lesson notes do); attempts, grades and accommodations are read by path or as a whole subcollection. If a class + date ordering later proves necessary, one composite `exams(classId ASC, date ASC)` would be added and must be READY before the app that needs it is deployed.

---

## 9. Free-Tier Budget (Spark: 50,000 reads and 20,000 writes per day, 20,000 deletes per day)

Question text is a few kilobytes, so no Realtime Database blob or download quota is used, and no Storage. Import parsing happens in the browser and costs nothing.

**Per student attempt** (45-minute exam, 10-minute checkpoints, 30 students):

| Step                                 | Writes | Reads                                              |
| ------------------------------------ | ------ | -------------------------------------------------- |
| Open the exam list and start screen  | 0      | ~2 (exam, accommodation)                           |
| Read the questions                   | 0      | 1 (+1 rule read of the exam)                       |
| Start the attempt                    | 1      | 2 rule reads (exam, accommodation)                 |
| Checkpoints                          | ~4     | 0 (update rules use only the stored document)      |
| Submit                               | 1      | 0                                                  |
| Staff grading (per student)          | 1 grade| 1 attempt                                          |
| Results sync (per student)           | 1 result | 0                                                |
| Release (manual mode only)           | 1      | 0                                                  |
| Finalize (per student)               | 0      | 0 (and 1 delete)                                   |

That is about **8 to 9 writes and 6 to 8 reads per student per exam**, so one class of 30 is roughly **250 to 270 writes and 200 to 240 reads** plus 30 deletes. Checkpoints scale with the interval: a 60-minute exam writes 12 checkpoints at 5 minutes, 6 at 10, 4 at 15.

**Daily ceiling.** At about 9 writes per student per exam, 20,000 writes allow roughly **2,200 attempts a day** before anything else in the app writes; the real figure is lower. A school of 1,250 students sitting five exams each in one day (6,250 attempts) would exceed the limit; sittings must be staggered across days, or the school must move to the Blaze plan or the planned backend. The results screen avoids re-reading attempts: it reads the grades and compares `getCountFromServer` of the attempts with the number of grades, fetching attempts only when some are ungraded.

**Realtime Database connections.** Each signed-in person holds one session-lock connection and Spark allows 100 simultaneous connections (`docs/ISSUES_AND_GAPS.md` #43). Many more than 100 people online at once is refused a lock (the lock fails open, so sign-in still works). Sittings of one class at a time are well inside the limit; whole-year sittings are not.

The exam form shows a short estimate of the writes the class sitting will use, and the results screen states how much grading and syncing remains, so teachers can plan around the daily limit.

---

## 10. Interaction with Existing Code

| Area                         | What interacts                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exams page and form          | `src/scenes/(dashboard)/list/exams/index.tsx`, `src/components/forms/ExamForm.tsx`, `TermSubjectClassTeacherFields.tsx`, `src/lib/assignmentFormLogic.ts` (class and teacher options), `src/lib/formTables.ts`, `src/components/formRegistry.tsx`. The page gains columns (title, type, status) and role-specific content.                                          |
| Types                        | `src/types/assessment.ts` (`ExamDocument`, `ResultDocument.examId`); new exam question, key, attempt, grade and accommodation types.                                                                                                                       |
| Rosters and scoping          | `takesSubject` / `classIdsOf` in `src/lib/studentClasses.ts`; `inMyClasses` in `firestore.rules`.                                                                                                                                                           |
| Results and report cards     | `results` collection and rules; `computeExamGrade` in `src/lib/reportCardUtils.ts`; subject `examWeight`. The batch approach of `gradeSubmission()` in `src/lib/grading.ts` is the model for the grading and sync writes. The Gradebook is not changed.   |
| Audit log                    | `src/lib/auditLog.ts` (`buildAuditEntry`), `src/types/audit.ts`, `src/lib/auditEvents.ts`, `src/lib/teacherAudit.ts` (detail text names the exam, class, subject and counts, never scores or answers), the two `validAuditEntry` lists in `firestore.rules`.                |
| Inactivity logout            | `src/hooks/useInactivityLogout.ts`: students are signed out after 30 minutes without input. The attempt screen uses `useKeepAliveWhileOpen` with a cap of the exam's duration plus extra time plus 10 minutes (the current cap is 15 minutes), and answering generates input. The forced sign-out purge clears local state, so the checkpoint is the safety net. |
| Single-session lock          | `src/lib/sessionLock.ts`: a refresh re-claims the session; a second device is refused; a dead device frees the lock when its connection drops (or an administrator uses **Clear sign-in session**).                                                        |
| Server time                  | Rules use `request.time` for `startedAt` and `submittedAt`; the client shows the countdown from the server-written start (with a clock offset taken from the first server timestamp it reads).                                                              |
| Sidebar and routes           | `src/lib/sidebarNav.ts` (remove "Exams" from `STUDENT_TEMPORARILY_HIDDEN`), `src/routes/academicRoutes.tsx`, `src/routes/lazyPages.ts` (new lazy pages; the bundle-boundary test keeps them out of the entry chunk).                                         |
| Reads and caching            | `src/lib/sharedSnapshot.ts` (`subscribeSnapshot`) for the exam list; `getDoc`/`getDocs` for attempts and grades; no live listeners during an attempt.                                                                                                       |
| Import                       | `src/lib/spreadsheetImport.ts` (`parseSpreadsheetFile`) for CSV/XLSX; the existing import-page conventions for the template download and preview; new lazy-loaded Word and PDF text readers served from the app's own origin so the future enforcing Content-Security-Policy does not block them. |
| Device notice                | `useMediaQuery` / `MOBILE_QUERY` in `src/hooks/useMediaQuery.ts` for the informational phone notice.                                                                                                                                                        |
| Deletion and cleanup         | `src/lib/deleteRecord.ts` (cascade for an online exam); the student-record cleanup list in `src/lib/deleteUserData.ts` gains the exam subcollections for a deleted student; class or subject deletion leaves exams orphaned today and should be noted in `docs/ISSUES_AND_GAPS.md`. |
| Scripts                      | `scripts/seed-bulk-institution.mjs`, `scripts/count-seed-institution.mjs` and `scripts/teardown-bulk-institution.mjs` list the `exams` collection; their lists need the new subcollections so counts and teardown stay complete.                            |
| Existing e2e specs           | `e2e/10-teacher-department.spec.ts` (department stamp), `e2e/11-users-lockdown.spec.ts` (exam rule probes), `e2e/12-student-mobile.spec.ts` (the exams URL for a student); the first two must keep passing, the third changes once the sidebar shows Exams.   |

---

## 11. Roles Matrix

| Capability                                                   | Admin | Senior teacher               | Regular teacher | Student                       | Parent                  | Spectator |
| ------------------------------------------------------------ | ----- | ---------------------------- | --------------- | ----------------------------- | ----------------------- | --------- |
| See the exam schedule (subject, class, date, time, room)     | All   | All                          | All             | Their classes' exams          | Their children's classes | All       |
| Create an exam, set type/category/online settings            | Yes   | Yes                          | Yes             | No                            | No                      | No        |
| Edit or delete an exam                                       | All (delete: admin only) | Own and department (no delete) | Own (no delete) | No                       | No                      | No        |
| Build, import, edit questions and key; publish; close        | All   | Own and department           | Own             | No                            | No                      | Read only |
| Open the questions of an exam                                | All   | Own and department           | Own             | Their class, inside the window | No                     | All       |
| Read the answer key                                          | All   | Own and department           | Own             | **Never**                     | **Never**               | All (read) |
| Preview as student, duplicate an exam                        | All   | Own and department           | Own             | No                            | No                      | No        |
| Attempt the exam                                             | No    | No                           | No              | Once, inside the window       | No                      | No        |
| Grade, override, re-grade, enter scores, add extra time      | All   | Own and department           | Own             | No                            | No                      | Read only |
| Release scores, finalize, export CSV                         | All   | Own and department           | Own             | No                            | No                      | Export only |
| See a score                                                  | All   | Own and department           | Own             | Own, once released            | Children's, once released | All     |

"Own" means the exam's `teacherId` is the user. "Department" means the exam is stamped with the senior teacher's department (the same `isSeniorTeacherFor` test the exams rules already use).

---

## 12. Audit Events

| Event             | When                                             | Detail names                                              |
| ----------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `exam_edit`       | An exam, its settings, its questions or key are saved; an exam is deleted | The exam title, class, subject; "questions N"; never question text or the key |
| `exam_publish`    | Published or closed early                        | Title, class, subject, window                              |
| `exam_grade`      | A grading run, an override, a re-grade           | Title, class, count graded; "override" with the student's name (never the score) |
| `exam_release`    | Scores released (manual press, or the scheduled run synced) | Title, class, count released                    |
| `exam_finalize`   | Finalize                                         | Title, class, count of attempts removed                    |

Each entry is written in the same batch as the change it describes where the operation count allows, and the detail stays inside the 300-character limit.

---

## 13. Security and Integrity Notes

- The key and the questions' availability are enforced by rules, not by the interface: the key is in a staff-only document; the questions are readable only in the window; scores are readable only after `releaseAt`.
- `startedAt` and `submittedAt` come from the server clock; the deadline is checked in the update rule, not in the browser.
- One attempt per student is structural (the attempt id is the student's uid and students cannot delete).
- Shuffling is cosmetic: it makes neighbouring screens differ but is not a security measure. The tab/window-switch counter is advisory (notifications and system dialogs also trigger it) and nothing is blocked.
- What a determined student can still do: look things up on another device, or share answers by other means. The design limits what the app itself leaks; it does not proctor.
- A student with the exam open can, in principle, read their own questions document outside the app (the rule allows it in the window). That is the same material the app shows them.
- Teachers' own browsers hold the key while grading; the key never goes to a student's browser.
- The imported file is parsed in the browser and discarded. Word and PDF parsing is treated as untrusted input: only text is extracted, never rendered as HTML.

---

## 14. Deferred / Future

- Other categories: True-or-False, Matching and Drag-and-drop are intended to be auto-gradable later; the others (Fill-in-the-blank, Short Answer, Extended Response, Problem Solving, Oral/Performance, Interactive, Mixed, Other) need manual marking or a different design. Drag-and-drop will need the **device restriction**: a teacher-facing note that students can attempt only on a laptop, tablet or desktop, and a prominent notice (a blocking dialog or banner) for a student on a phone.
- Images and equations in questions (inline images would need size limits and, above about 200 KB each, the Realtime Database blob store).
- Instant grading at submission, and a trusted record of scores, once the planned backend exists. The data model already separates the key, the attempt, the grade and the result, so a server could take over grading.
- AI-assisted import of free-form files (needs a backend to hold a key).
- More than one attempt per student, and a teacher action to reset a single student's attempt.
- Writing exam scores into a Gradebook column instead of a plain `results` entry.
- Notifications when scores are released (the app has no notification system).

---

## 15. Implementation Order, Tests and Deploy Order

**Order (each step a separate commit, verified on its own):**

1. Types, constants (value types, categories, answer modes), pure logic with unit tests: key validation, scoring, shuffle and mapping, deadline calculation, release logic, statistics.
2. Firestore rules for the new subcollections and the `exams` shape check; emulator tests (the list in §7); source-pin tests; audit event types.
3. Exam form: type, category, answer mode, online settings, free-tier estimate; exam list columns.
4. Builder, answer key, spreadsheet template import and the review screen; preview as student; duplicate.
5. Student exam list and the attempt screen (server timer, checkpoints, shuffle, navigator, flags, confirm, resume, tab counter, keep-alive, phone notice); unhide the sidebar item for students; parent view of dates and scores.
6. Staff results screen: grading, manual entry, override, re-grade, extra time, release, results sync, statistics, CSV export, finalize.
7. Word and PDF import (lazy-loaded readers, measured bundle impact).
8. Delete cascade, student cleanup list, seed/teardown script lists, documentation (user guide, issues list, rules overview), end-to-end specs, and a run on the QA institution.

**Tests:** unit tests for every pure module and parser (with fixture files for the template, a Word file and a text PDF); the emulator suite for the rules; source-pin tests for the form, rules text and sidebar change; end-to-end specs for build → publish → attempt → grade → release → finalize across roles, plus a timing test using the server clock; a manual QA pass on a real phone and a laptop.

**Deploy order:** (1) `npm run firebase:deploy:rules` (additive: no client writes the new documents yet); (2) indexes only if §8's optional index was needed, waiting until it is READY; (3) merge and deploy the app. No data script is needed: existing exams are unaffected.

---

## 16. Open Questions

- Whether the original import file should ever be kept (version 1 discards it).
- The exact wording and examples of the Word/PDF layout guide shown on the import dialog.
- The measured size of the Word and PDF readers once chosen (the PDF reader is expected to be about 1 to 2 MB, lazy-loaded).
- Whether a teacher should be able to reset one student's attempt (for a device failure) in a later version.
