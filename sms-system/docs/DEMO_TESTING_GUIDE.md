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

---

## Phase A — Institution Profile Wizard

**Role: institution_admin**

The sidebar shows a yellow "Profile Incomplete" badge (or a banner card on the dashboard) until the wizard is completed. Report card generation is **blocked** until `profileComplete` is `true` on the institution document.

1. Navigate to **Institution Profile** (sidebar or the incomplete-profile card).
2. Work through each wizard tab and save:

| Tab | What to fill in |
|---|---|
| **Identity** | Institution name, motto, address, phone, email |
| **Branding** | Upload a logo image (PNG/JPG). The form resizes it to max 512 px and stores it as a base64 data URL — no Firebase Storage required |
| **Signature** | Upload an authorised signature image (same base64 approach) |
| **Grading System** | Choose `flat` (A/B/C/F) or `plus-minus` (A+/A/A−/…) |
| **Section Comment Labels** | Four comment slots default to "Class Supervisor", "Grade Supervisor", "Principal", "Vice Principal" — rename if needed |

**Assert:** Navigating back to `/institution-profile` shows the completed profile with no "incomplete" banner. The `profileComplete` field is `true` in Firestore.

---

## Phase B — Academic Calendar

**Role: institution_admin**

An active academic year and an active term are **prerequisites** for the Attendance Register. Without them the register page shows an info state: *"No active academic term is configured."*

3. Navigate to **Academic Calendar** (sidebar under Admin or Settings).
4. Create an **Academic Year**: e.g., "2025–2026". Set **School Week Days** (e.g., Mon–Fri).
5. Create a **Term**: e.g., "Term 1". Set start date, end date, and mark it **Active**.
6. *(Optional)* Add **Non-School Days** (public holidays, half-terms, exam breaks). These are excluded from `totalExpectedSessions` on the attendance summary and report card.

**Assert:** The academic year and term appear in the calendar view. The term shows an "Active" badge.

---

## Phase C — Classes, Departments, Subjects

**Role: institution_admin**

7. **Create a class**: navigate to **Classes** → add "Grade 10A".
8. **Create a department**: navigate to **Departments** → add "Sciences".
9. **Create subjects**: navigate to **Subjects** → add at least two subjects (e.g., "Biology", "Chemistry").
   - For each subject, set **CW Weight** and **Exam Weight** (must sum to 100, e.g., 40 CW / 60 Exam).
   - Assign a teacher to each subject (return here after creating teacher accounts in Phase D if needed).

> **Why weights matter:** `computeFinalGrade()` in `generateReportCard.ts` uses `cwWeight` and `examWeight` to blend the coursework and exam grades. Missing weights default to 50/50 but generate a warning on the report card.

---

## Phase D — User Accounts

**Role: institution_admin**

Create accounts via the **Create User** page (sidebar → Users → Create).

### Senior Teacher

10. Role: `senior_teacher`
11. Department: Sciences
12. **Assigned Class ID**: Grade 10A — this field is what enables the General Attendance Register for this teacher. Without it, the register shows no class.

### Regular Teacher

13. Role: `regular_teacher`
14. Department: Sciences
15. Return to **Subjects** and add this teacher to Biology and Chemistry's teacher list (the `teacherIds` / `teacherNames` arrays on the subject document).

### Students (create at least 2)

16. Role: `student`
17. Class: Grade 10A
18. Date of Birth (appears on the report card PDF)
19. Institution Student ID (optional, appears on PDF front cover)
20. House: assign after creating a house in Phase E

### Parent (optional)

21. Role: `parent`
22. After creation, navigate to the student's detail page → link the parent account.

---

## Phase E — Houses (Optional)

**Role: institution_admin**

23. Navigate to **Houses** (sidebar, under the institution_admin section).
24. Create a house (e.g., "Red House").
25. Navigate to a student's detail page → assign the house.

**Assert:** The student's profile shows the house name. It will appear on the report card PDF.

---

## Phase F — General Attendance Register

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

> **How attendance summaries are written:** Every successful `commitSave()` in the General Attendance Register fires `rebuildSummariesForClass(...)` as a fire-and-forget background call (lines 310–319 of `attendance/general/index.tsx`). It aggregates all `generalAttendance` docs for the class+term and upserts one `attendanceSummaries/{studentId}_{termId}` document per student. If summaries are ever missing (e.g., from pre-existing data), they can be rebuilt from the **Admin → Rebuild Attendance Summaries** page.

---

## Phase G — Subject Attendance Register

**Role: regular_teacher**

33. Log in as the regular_teacher.
34. Navigate to **Attendance → Subject**.
35. Select a subject (Biology) and a class (Grade 10A).
36. The register shows the subject's enrolled student list. Mark attendance for today's session.
37. Save.

**Assert:** A `subjectAttendance` document exists in Firestore with `subjectId`, `classId`, `sessionDate`, and a `records` map.

---

## Phase H — Results Entry

**Role: regular_teacher**

At least one result document per student per term is **required** to generate a report card. If no results exist, `generateReportCard.ts` returns early with `{ ok: false, error: 'No results found for this student in the selected term.' }`.

38. Navigate to **Results** (sidebar, or via a student's detail page → Results tab).
39. For each student, add a **coursework** result:
    - Subject: Biology
    - Assessment Type: **Coursework**
    - Score / Max Score (e.g., 75 / 100)
40. Add an **exam** result for the same student and subject:
    - Assessment Type: **Exam**
    - Score / Max Score (e.g., 82 / 100)
41. Repeat for Chemistry.
42. Repeat steps 39–41 for the second student (required for class ranking in batch generation).

**Assert:** Results appear in the student's results list. In Firestore, each `results` document has an `assessmentType` field (`'coursework'` or `'exam'`), `score`, `maxScore`, `subjectId`, `studentId`, `termId`, and `institutionId`.

> **Why `assessmentType` matters:** `computeCWGrade()` and `computeExamGrade()` in `reportCardUtils.ts` filter results by this field to compute separate grades before blending them with `cwWeight` / `examWeight`.

---

## Phase I — Feedback Comments

**Role: regular_teacher**

Feedback comments are per student × subject × term. Missing feedback generates a warning but does not block report card generation.

43. Navigate to **Feedback** (sidebar, or via a student's detail page → Feedback tab).
44. For each student × subject combination, set:
    - **Conduct Grade**: one of `G` (Good), `S` (Satisfactory), `F` (Fair), `U` (Unsatisfactory), `P` (Poor), `D` (Distinguished)
    - **Comment Number**: 1–20, references the static `COMMENT_KEY` array in `src/lib/commentKey.ts` (e.g., 1 = "Shows keen interest and enthusiasm")
45. Save.

**Assert:** `feedback_comments` documents in Firestore contain `studentId`, `subjectId`, `termId`, `conductGrade`, and `commentNumber`.

---

## Phase J — Section Comments (Bulk Entry)

**Role: institution_admin**

Section comments are the four per-student narrative fields that appear at the bottom of the Inner Right page of the PDF.

46. Navigate to **Report Card Comments** (`/report-card-comments`).
47. Select the class (Grade 10A) and the term (Term 1).
48. For each student, fill in:
    - Class Supervisor Comment
    - Grade Supervisor Comment
    - Principal Comment
    - Vice Principal Comment
49. Save.

**Assert:** `reportCardComments` documents appear in Firestore with `studentId`, `termId`, `institutionId`, and the four comment fields.

> Section comments can also be entered one student at a time from the student detail page.

---

## Phase K — Extra-Curricular Data (Optional)

**Role: institution_admin**

50. Navigate to a student's detail page.
51. Under **Extra-Curricular Activities**, add one or two activity names (e.g., "Football", "Choir").
52. Under **Positions of Responsibility**, add a title and organisation (e.g., "Class Prefect" / "Grade 10A").

**Assert:** `studentActivities` and `studentResponsibilities` documents exist in Firestore.

---

## Phase L — Report Card Generation (Single Student)

**Role: institution_admin**

53. Navigate to **Report Cards** (`/report-cards`).
54. Click the **+** icon.
55. The generation panel appears at the top of the Report Cards table, showing:
    - Two dropdown inputs: "Select student…" and "Select term…"
    - Two tabs: "Single Student" and "Batch Class"
    - Two buttons: "Generate" (or "Batch Generate") and "Cancel"
56. On the **Single Student** tab:
    - Select a student
    - Select Term 1
57. Click **Generate**.

**Expected outcome:** Success — the report card document appears in the table below the panel.

**If warnings appear** (non-blocking, card is still generated):
- *"Attendance summary not found. Sessions will show as 0."* → attendance was never logged; run the Rebuild Summaries admin page or log at least one attendance session first.
- *"No feedback comment found for subject X."* → go back and complete Phase I.
- *"Subject X is missing Course Work / Exam weighting."* → go back to Subjects and set `cwWeight` / `examWeight`.

58. Click **View PDF** (or the eye/download icon) on the report card row.

### PDF Structure (4 pages)

| Page | Content |
|---|---|
| **1 — Front Cover** | Institution logo, name, motto; student name, class, house; term and academic year |
| **2 — Inner Left (Summary)** | Attendance (expected sessions / absent / late), overall average, GPA, class rank, class average, class population; extra-curricular activities; positions of responsibility |
| **3 — Inner Right (Subjects)** | Subject rows: CW Grade, Exam Grade, Final Grade, Letter Grade, Conduct Grade, Comment Number; section comments (four slots); Key to Comments legend |
| **4 — Back Cover** | Grading key, next term start date, authorised signature |

> **Class Rank and Class Average** will be `null` on a single-student generation because the comparison set is empty. Run Batch Generate (Phase M) to populate them.

---

## Phase M — Batch Generation (Class Ranking)

**Role: institution_admin**

59. Back on the Report Cards page, click **+** again.
60. Switch to the **Batch Class** tab.
61. Select the class (Grade 10A) and the term (Term 1).
62. Click **Batch Generate**.

The system processes each student in the class sequentially. After all cards are generated, it computes and back-fills `classRank`, `classAverage`, and `subjectPosition` for every card in the batch.

**Assert:** Each student's report card row in the table now shows a Class Rank. On the PDF Inner Left page, "Class Rank" and "Class Average" are populated with numeric values.

---

## Phase N — Student and Parent Views

### Student

63. Log in as a student.
64. Navigate to **Report Cards** → the report card for the current term is visible.
65. Click **Download PDF** — verify the PDF opens and displays the student's own data.
66. Navigate to **Attendance → My Attendance** → verify the per-session attendance record is visible.

### Parent

67. Log in as a parent (linked to a student).
68. Navigate to **Report Cards** → the linked child's report card is visible.
69. Click **Download PDF** — verify the PDF opens.
70. Navigate to **Attendance → Child Attendance** → verify the child's attendance record is visible.

---

## Known Demo Constraints

| Situation | Behaviour | How to handle |
|---|---|---|
| No attendance logged before generating | Report card generates with a warning; attendance shows 0 sessions | Log at least one attendance session, or use the Rebuild Summaries admin page |
| Single-student generation | Class Rank and Class Average are `null` on the PDF | Run Batch Generate to populate them |
| `cwWeight`/`examWeight` not set on a subject | Generation proceeds using 50/50 default; warning logged | Set weights on each subject before generating |
| No feedback comments for a subject | Subject row shows null conduct grade and blank comment; warning generated | Complete feedback entry in Phase I |
| Section comments not entered | Comment slots are blank on the PDF | Add comments and re-generate (upsert overwrites the existing card) |
| `profileComplete` is `false` on the institution | Generation blocked with an error | Complete the institution profile wizard (Phase A) |
| No results for the selected student+term | Generation blocked with an error — not a permissions issue | Enter at least one result in Phase H before generating |
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
- [ ] Feedback comments (`conductGrade` + `commentNumber`) entered per student per subject
- [ ] Section comments entered for each student (Phase J)
- [ ] App is in **Live Mode** (not mock)
- [ ] Batch Generate run at least once so Class Rank appears on the PDF
