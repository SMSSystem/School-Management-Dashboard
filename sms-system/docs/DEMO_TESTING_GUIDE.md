# Demo & Testing Guide: Attendance Register + Report Card Generation

> **Audience:** Institution_admin demonstrating the platform to prospective clients (academic institutions).
> **Scope:** Full end-to-end flow — from institution profile setup through report card PDF generation.
> **Data environment:** Fresh Firestore instance (no pre-existing demo data assumed).

---

## Pre-Flight Checklist

Before starting:

- [ ] Firebase Firestore rules re-deployed with the updated `attendanceSummaries` rule (see [firebase-rules.md](./firebase-rules.md))
- [ ] App is running in **Live Mode** — if the DevDataModeToggle shows "Mock", switch it to "Live"
- [ ] A `super_admin` has already completed the onboard-institution wizard; an `institution_admin` account exists and is ready to log in

> **Inactivity auto-logout:** The app logs out after 5 minutes of inactivity. Stay active during the demo, or simply log back in if this triggers.

---

## Phase A — Institution Profile Wizard

**Role: institution_admin**

The sidebar shows a yellow "Profile Incomplete" badge (or a banner card on the dashboard) until the wizard is completed. Report card generation is **blocked** until `profileComplete` is `true` on the institution document.

1. Navigate to **Institution Profile** (sidebar or the incomplete-profile card).
2. Work through each wizard step and save:

| Step | What to fill in |
|---|---|
| **1 — Basic Info** | Institution name and motto |
| **2 — Contact** | Phone, email, address |
| **3 — Logo** | Upload a logo image (PNG/JPG). The form resizes it to max 512 px and stores it as a base64 data URL — no Firebase Storage required |
| **4 — Signature** | Upload an authorised signature image (same base64 approach), or enter a text signature |
| **5 — Role Labels** | Four comment slot labels default to "Class Supervisor", "Grade Supervisor", "Principal", "Vice Principal" — rename if needed |
| **6 — Grading System** | Choose `flat` (A, B, C, F) or `weighted` (A+, A, A−…) |
| **7 — Review** | Confirm all details and submit |

**Assert:** Navigating back to `/institution-profile` shows the completed profile with no "incomplete" banner. The `profileComplete` field is `true` in Firestore.

---

## Phase B — Academic Calendar

**Role: institution_admin**

An active academic year and an active term are **prerequisites** for the Attendance Register. Without them the register page shows an info state: *"No active academic term is configured."*

3. Navigate to **Academic Calendar** (sidebar under Admin or Settings).
4. Complete the **Academic Year Setup Wizard** — it walks through year dates, term names and dates, school week days, public holidays, and optional non-school days. When finished, click **Confirm and Activate**.
5. Ensure that the **term date range includes today's date** — e.g. if today is June 2026, set the term start date on or before today and the end date on or after today. Terms activate automatically; there is no manual "activate" button.
6. *(Optional)* Add or edit **Non-School Days** from the calendar management view after setup. These are excluded from `totalExpectedSessions` on the attendance summary and report card.

**Assert:** The academic year and term appear in the calendar view. The term whose date range includes today's date shows a green **"Active"** badge automatically — no manual activation is required.

---

## Phase C — Teacher Accounts

**Role: institution_admin**

Create teacher accounts **before** departments and subjects — the Head Teacher dropdown in Department and the Teacher dropdown in Subject both pull from live Firestore data and will be empty if no teachers exist yet.

Create accounts via the **Create User** page (sidebar → Users → Create).

### Senior Teacher

7. Role: `senior_teacher`
8. Department: leave blank for now (set after Phase D)
9. **Assigned Class**: leave blank for now (set after Phase D)

### Regular Teacher

10. Role: `regular_teacher`
11. Department: leave blank for now (set after Phase D)

> **Note — Subject assignment for regular_teacher:** There is no "Subject" field on the create-user form. Subject assignment is done from the **Subjects** page after the subject is created (Step 16 below). This is intentional: one teacher can be assigned to many subjects.

---

## Phase D — Classes, Departments, Subjects

**Role: institution_admin**

12. **Create a class**: navigate to **Classes** → add "Grade 10A".
    - After creating the class, go back to each teacher's edit modal and set their **Department** and (for the senior teacher) **Assigned Class**.
13. **Create a department**: navigate to **Departments** → add "Sciences".
    - The **Head Teacher** dropdown now shows the teachers created in Phase C.
14. **Create subjects**: navigate to **Subjects** → add at least two subjects (e.g., "Biology", "Chemistry").
    - For each subject, set **CW Weight** and **Exam Weight** (must sum to 100, e.g., 40 CW / 60 Exam). The fields counterbalance automatically: changing one recalculates the other.
    - Assign the regular_teacher to each subject via the Teachers checklist.

> **Why weights matter:** `computeFinalGrade()` in `reportCardUtils.ts` uses `cwWeight` and `examWeight` to blend the coursework and exam grades. Missing weights default to 50/50. If only one grade component (coursework or exam) has results entered, the grade is re-normalised to that component alone — it is **not** penalised with a zero for the missing component.

---

## Phase E — Student + Parent Accounts

**Role: institution_admin**

Create accounts via the **Create User** page (sidebar → Users → Create).

### Students (create at least 2)

15. Role: `student`
16. Class: Grade 10A (now available in the dropdown since the class was created in Phase D)
17. Date of Birth (appears on the report card PDF)
18. Institution Student ID (optional, appears on PDF front cover)
19. House: assign after creating a house in Phase F

### Parent (optional)

20. Role: `parent`
21. After creation, navigate to the student's detail page → **Linked Parents** section → select the parent and click **Link**.

---

## Phase F — Houses (Optional)

**Role: institution_admin**

22. Navigate to **Houses** (sidebar, under the institution_admin section).
23. Create a house (e.g., "Red House").
24. In the **edit modal** for the house, check the students to assign to it. The student list loads automatically — check any students created in Phase E.

**Assert:** The student's profile shows the house name. It will appear on the report card PDF.

---

## Phase G — General Attendance Register

**Role: senior_teacher**

26. Log in as the senior_teacher.
27. Navigate to **Attendance → General**.
28. The page loads Grade 10A automatically (pulled from `assignedClassId` on the user document).
29. For **today's date**, click each student's cell to set their state for the **AM** session:

| State | Meaning | Counts as |
|---|---|---|
| `P` | Present (green) | Present |
| `A` | Absent (red) | Absent |
| `L` | Late (orange) | Present |
| `S` | Sick (purple) | Absent |
| `E` | Excused (blue, requires reason) | Absent |

30. Click **Save AM [date]**. If any student has no state set, a warning prompts "Save anyway" — confirm to proceed.
31. Repeat for the **PM** session.
32. Navigate to several previous dates and log a few more sessions (back-fill at least 3–5 sessions for convincing attendance numbers on the report card).

**Assert after saving:**
- The save button transitions to a green checkmark state.
- In the Firestore Console, a `generalAttendance` document exists with `classId`, `date`, `session`, and a `records` map.
- A `attendanceSummaries/{studentId}_{termId}` document exists (written in the background immediately after each attendance save by `rebuildSummariesForClass` in `attendanceSummaryUtils.ts`). Check the Firestore Console to confirm.
- If the background summary rebuild fails, a dismissible **orange warning banner** appears below the save buttons: *"Register saved, but the attendance summary could not be updated."* This does not indicate the attendance save itself failed.

> **How attendance summaries are written:** Every successful `commitSave()` in the General Attendance Register fires `rebuildSummariesForClass(...)` as a fire-and-forget background call. It aggregates all `generalAttendance` docs for the class+term and upserts one `attendanceSummaries/{studentId}_{termId}` document per student. If summaries are ever missing (e.g., from pre-existing data), they can be rebuilt from the **Admin → Rebuild Attendance Summaries** page.

### Attendance Summary Register (Gridsheet)

From the General Attendance Register, click **Export PDF** (top-right of the page) to open the **Attendance Summary Register** — a printable A3 landscape gridsheet showing all students × all school days for the term, with month-group headers and per-student totals.

33. Select the term and (optionally) filter the month range.
34. Click **Preview** to open the PDF viewer, or **Download** to save immediately.

> This feature is informational — it does not affect attendance summary documents or report card generation.

---

## Phase H — Subject Attendance Register

**Role: regular_teacher**

35. Log in as the regular_teacher.
36. Navigate to **Attendance → Subject**.
37. Select a subject (Biology) and a class (Grade 10A).
38. The register shows the subject's enrolled student list. Mark attendance for today's session.
39. Save.

**Assert:** A `subjectAttendance` document exists in Firestore with `subjectId`, `classId`, `sessionDate`, and a `records` map.

---

## Phase I — Results Entry

**Role: regular_teacher**

At least one result document per student per term is **required** to generate a report card. If no results exist, `generateReportCard.ts` returns early with `{ ok: false, error: 'No results found for this student in the selected term.' }`.

40. Navigate to **Results** (sidebar, or via a student's detail page → Results tab).
41. For each student, add a **coursework** result:
    - Subject: Biology
    - Assessment Type: **Coursework**
    - Score / Max Score (e.g., 75 / 100)
42. Add an **exam** result for the same student and subject:
    - Assessment Type: **Exam**
    - Score / Max Score (e.g., 82 / 100)
43. Repeat for Chemistry.
44. Repeat steps 41–43 for the second student (required for class ranking in batch generation).

**Assert:** Results appear in the student's results list. In Firestore, each `results` document has an `assessmentType` field (`'coursework'` or `'exam'`), `score`, `maxScore`, `subjectId`, `studentId`, `termId`, and `institutionId`.

> **Why `assessmentType` matters:** `computeCWGrade()` and `computeExamGrade()` in `reportCardUtils.ts` filter results by this field to compute separate grades before blending them with `cwWeight` / `examWeight`. If only one component has results, the final grade is re-normalised to that component only — not penalised with a zero.

---

## Phase J — Feedback Comments

**Role: regular_teacher**

Feedback comments are per student × subject × term. Missing feedback generates a warning but does not block report card generation.

45. Navigate to **Feedback** (sidebar, or via a student's detail page → Feedback tab).
46. For each student × subject combination, set:
    - **Conduct Grade**: one of `G` (Good), `S` (Satisfactory), `F` (Fair), `U` (Unsatisfactory), `P` (Poor), `D` (Disruption)
    - **Preset Comment**: a dropdown of 20 standard comments from the `COMMENT_KEY` list (e.g., 1 = "Shows keen interest and enthusiasm")
    - **Comment** *(optional free-text)*: a custom comment textarea — if filled in, this **overrides** the preset when the report card is generated. At least one of Preset Comment or Comment must be provided.
47. Save.

**Assert:** `feedback_comments` documents in Firestore contain `studentId`, `subjectId`, `termId`, `conductGrade`, `commentNumber` (preset selection), and optionally `comment` (free-text override).

---

## Phase K — Section Comments (Bulk Entry)

**Role: institution_admin**

Section comments are the four per-student narrative fields that appear at the bottom of the Inner Left column of the PDF.

48. Navigate to **Report Card Comments** (`/report-card-comments`).
49. Select the class (Grade 10A) and the term (Term 1).
50. For each student, fill in:
    - Class Supervisor Comment
    - Grade Supervisor Comment
    - Principal Comment
    - Vice Principal Comment
51. Save.

**Assert:** `reportCardComments` documents appear in Firestore with `studentId`, `termId`, `institutionId`, and the four comment fields.

> Section comments can also be entered one student at a time from the student detail page.

---

## Phase L — Extra-Curricular Data (Optional)

**Role: institution_admin**

52. Navigate to a student's detail page.
53. Under **Extra-Curricular Activities**, add one or two activity names (e.g., "Football", "Choir").
54. Under **Positions of Responsibility**, add a title and organisation (e.g., "Class Prefect" / "Grade 10A").

**Assert:** `studentActivities` and `studentResponsibilities` documents exist in Firestore.

---

## Phase M — Report Card Generation (Single Student)

**Role: institution_admin**

55. Navigate to **Report Cards** (`/report-cards`).
56. Click the **+** icon.
57. The generation panel appears at the top of the Report Cards table, showing:
    - Two dropdown inputs: "Select student…" and "Select term…"
    - Two tabs: "Single Student" and "Batch Class"
    - Two buttons: "Generate" (or "Batch Generate") and "Cancel"
58. On the **Single Student** tab:
    - Select a student
    - Select Term 1
59. Click **Generate**.

**Expected outcome:** Success — the report card document appears in the table below the panel.

**If warnings appear** (non-blocking, card is still generated):
- *"Attendance summary not found. Sessions will show as 0."* → attendance was never logged; run the Rebuild Summaries admin page or log at least one attendance session first.
- *"No feedback comment found for subject X."* → go back and complete Phase J.
- *"Subject X is missing Course Work / Exam weighting."* → go back to Subjects and set `cwWeight` / `examWeight`.
- *`"Subject X": no coursework results found — grade calculated from exam component only.`* → only exam results were entered for that subject; the grade uses 100% exam weight.
- *`"Subject X": no exam results found — grade calculated from coursework component only.`* → only coursework results were entered; the grade uses 100% CW weight.

60. Click **View PDF** (or the eye/download icon) on the report card row.

### PDF Structure (single A4 landscape page — 4-column pamphlet)

The PDF is a **single page** printed in A4 landscape. It is designed to be folded vertically down the centre to form a 4-panel pamphlet. The columns in the PDF file run left-to-right in print order:

| Column (print order) | Panel when folded | Content |
|---|---|---|
| **1 — leftmost** | Back Cover | Key to Letter Grades, Key to Conduct, Key to Comments, Next Term start date, Authorised Signature |
| **2** | Inner Left | Student Summary (class, DOB, student ID, house, GPA, class rank, student average, class average), Attendance (total sessions / absent / late), Extra-Curricular Activities, Positions of Responsibility, Section Comments (four slots) |
| **3** | Inner Right | Subjects table: Subject, CW%, Exam%, Final%, Grade, Pos, Cond, Teacher, Comment # |
| **4 — rightmost** | Front Cover | Institution logo, name, motto, address; "STUDENT'S REPORT CARD" title; student name, class, term |

> **Class Rank and Class Average** will be `—` on a single-student generation because there are no classmates to compare against. Run Batch Generate (Phase N) to populate them.
>
> **Subject Position (Pos)** is always `—` regardless of generation mode — it is not yet computed.

---

## Phase N — Batch Generation (Class Ranking)

**Role: institution_admin**

61. Back on the Report Cards page, click **+** again.
62. Switch to the **Batch Class** tab.
63. Select the class (Grade 10A) and the term (Term 1).
64. Click **Batch Generate**.

The system uses a two-pass approach:
- **Pass 1:** Generates all cards for every student in the class. During this pass, `classRank` and `classAverage` are written as `null` to avoid order-dependent results (early students would otherwise be ranked against an incomplete set).
- **Pass 2:** Reads the full cohort of just-generated cards, computes the correct `classRank` and `classAverage` across all students, and updates every card in a single atomic batch write.

**Assert:** Each student's report card row in the table now shows a Class Rank. On the PDF Inner Left column, "Class Rank" and "Class Average" are populated with numeric values.

---

## Phase O — Student and Parent Views

### Student

65. Log in as a student.
66. Navigate to **Report Cards** → the report card for the current term is visible.
67. Click **Download PDF** — verify the PDF opens and displays the student's own data.
68. Navigate to **Attendance → My Attendance** → verify the per-session attendance record is visible.

### Parent

69. Log in as a parent (linked to a student).
70. Navigate to **Report Cards** → the linked child's report card is visible.
71. Click **Download PDF** — verify the PDF opens.
72. Navigate to **Attendance → Child Attendance** → verify the child's attendance record is visible.

---

## Known Demo Constraints

| Situation | Behaviour | How to handle |
|---|---|---|
| No attendance logged before generating | Report card generates with a warning; attendance shows 0 sessions | Log at least one attendance session, or use the Rebuild Summaries admin page |
| Single-student generation | Class Rank and Class Average are `—` on the PDF | Run Batch Generate to populate them |
| `cwWeight`/`examWeight` not set on a subject | Generation proceeds using 50/50 default; warning logged | Set weights on each subject before generating |
| Only one grade component entered for a subject | Grade is re-normalised to the available component (not penalised with a zero); a warning is generated | Enter both coursework and exam results for a complete grade, or accept the re-normalised grade |
| No feedback comments for a subject | Subject row shows `—` conduct grade and blank comment number; warning generated | Complete feedback entry in Phase J |
| Section comments not entered | Comment slots are `—` on the PDF | Add comments and re-generate (upsert overwrites the existing card) |
| `profileComplete` is `false` on the institution | Generation blocked with an error | Complete the institution profile wizard (Phase A) |
| No results for the selected student+term | Generation blocked with an error — not a permissions issue | Enter at least one result in Phase I before generating |
| Attendance summary rebuild fails after save | Dismissible orange warning banner appears below the save buttons | Dismiss the banner; run "Rebuild Summaries" from the admin menu if report card attendance data looks stale |
| 5-minute inactivity | Auto-logout | Log back in; all Firestore data is preserved |
| App in Mock Mode | Attendance register and Firestore writes are disabled | Switch to Live Mode using the DevDataModeToggle |

---

## Firestore Rules Note

The `attendanceSummaries` collection rule requires a `resource == null` guard for the report card generation flow to work correctly on a fresh institution (before any attendance has been logged).

Without the guard: `generateReportCard.ts` calls `getDoc()` on a non-existent `attendanceSummaries` document at step 5. Firestore CEL evaluates `resource.data.institutionId` as `null` when `resource` is `null`. `sameInstitution(null)` resolves to `false` → `PERMISSION_DENIED` is thrown before step 6 (results) is ever reached.

The fixed rule in [firebase-rules.md](./firebase-rules.md) adds `(resource == null && isTeacherOrAbove())` as the first branch so that institution_admin and teachers can perform the existence check safely. The standard institution + role checks still apply for existing documents.

**The updated rules must be deployed to the Firebase Console before testing report card generation.**

---

## Quick Sanity Checklist Before the Client Demo

- [ ] Firebase rules re-deployed with the `attendanceSummaries` fix
- [ ] Institution profile wizard completed (`profileComplete: true` in Firestore)
- [ ] At least one active academic year and one active term exist
- [ ] At least one class with 2+ students exists
- [ ] Each subject has `cwWeight` + `examWeight` that sum to 100
- [ ] Senior teacher has `assignedClassId` set to the demo class
- [ ] At least one attendance session saved (so `attendanceSummaries` documents exist)
- [ ] At least one coursework result and one exam result entered per student per subject
- [ ] Feedback comments (`conductGrade` + preset or custom comment) entered per student per subject
- [ ] Section comments entered for each student (Phase K)
- [ ] App is in **Live Mode** (not mock)
- [ ] Batch Generate run at least once so Class Rank appears on the PDF
