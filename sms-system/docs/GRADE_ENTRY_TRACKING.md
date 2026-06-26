# Grade-Entry Tracking (Feature 12b)

Per-term oversight of how completely teachers have entered grades: which **mark
books** exist, how many assessment **columns** each has, how many marks are
filled in, **which teachers are behind**, and the **percentage missing**.

Read-only. No new Firestore collections and no security-rule changes — it
aggregates documents that already exist.

- Route: `/dashboard/admin/grade-entry-tracking`
- Access: `institution_admin`, `super_admin`
- Engine: [`src/lib/gradeEntryTracking.ts`](../src/lib/gradeEntryTracking.ts) (pure, unit-tested)
- Scene: [`src/scenes/(dashboard)/admin/grade-entry-tracking/index.tsx`](../src/scenes/(dashboard)/admin/grade-entry-tracking/index.tsx)
- Tests: [`src/lib/__tests__/gradeEntryTracking.test.ts`](../src/lib/__tests__/gradeEntryTracking.test.ts)

## Domain mapping

| Client term | Definition in this implementation | Source |
| --- | --- | --- |
| **Mark book** | one `(teacher × subject × class)` a teacher owns in the term | `timetable_slots` (primary) / `subjects` (fallback) |
| **Column** | a distinct `assessmentName` recorded for a `(subject, class)` | `results` |
| **Filled cell** | a student in the class with a `results` doc for that column | `results` + roster |
| **Expected students** | enrolled students in the class | `users` (role `student`, `classId`) |
| **% complete** | `filledCells / (columns × expectedStudents)` | computed |
| **Feedback complete** | students with a `feedback_comments` doc / expected students | `feedback_comments` |

## How "expected mark books" are resolved

A mark book only counts as **behind / not started** if we know it was *supposed*
to exist — so we need the teacher↔subject↔class assignment, independent of
whether any grades were entered.

1. **`timetable_slots`** give the exact `(teacher, subject, class)` triple and are
   used wherever present (`approximate: false`).
2. For any **subject with no slot** in the term, we fall back to the cartesian
   product of its `teacherIds × classIds` and mark those `approximate: true`
   (shown with a `~` in the UI). When several teachers and classes share one
   subject without a timetable, the data model can't say who teaches which class,
   so this may overstate the expected set.

If a term has neither slots nor subject assignments, the page shows an empty
state explaining that assignments are required first.

## Status definitions

| Status | Condition |
| --- | --- |
| **Not started** | 0 columns recorded |
| **Behind** | completeness `< 0.8` (`BEHIND_THRESHOLD`) |
| **In progress** | `0.8 ≤` completeness `< 1` |
| **Complete** | completeness `= 1` |

A teacher is "behind" when they have ≥ 1 behind/not-started mark book.

## UI

- Select a **term** (required). Counts load via `getDocs` (point-in-time).
- **Summary cards:** teachers behind, average completeness, mark-book count, marks missing.
- **Teachers behind** chips (worst first) — click to filter the table.
- **Mark-book table:** teacher · subject · class · columns · filled/total · % complete · feedback % · status; filterable by teacher and "behind only", sorted worst-first.

## Defaults (confirm with client; easy to change)

- `BEHIND_THRESHOLD = 0.8`.
- Completeness counts **score cells only**; feedback (conduct + comment #) is a
  **separate** indicator, not folded into the main %.
- All assessment columns count equally (no coursework/exam split yet).

## Known limitations / future work

- **Read volume:** the page reads all `results`, `feedback_comments`, and student
  `users` for the term + institution (no `limit`). Fine at current scale; for very
  large institutions, add class/teacher-scoped querying (same consideration as the
  Report Builder term fetch).
- Two teachers co-teaching one `(subject, class)` via separate slots are each
  credited with the same results.
- `senior_teacher` (department-scoped) access is a possible follow-up.
- Export (PDF/Excel) is out of scope for v1 (ties to the pending Excel/Word work).
