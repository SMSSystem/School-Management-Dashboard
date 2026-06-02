# Schedule Generation — Verification Guide

> **Feature:** Timetable slot management and schedule viewing
> **Route:** `/schedule`
> **Branch:** `mvp`
> **Last updated:** 2026-06-01

---

## Prerequisites

### 1. Confirm live mode

Open `sms-system/.env` (or `.env.local`) and confirm:

```
VITE_DATA_MODE=live
```

The conflict check, Firestore reads, and real-time updates are all skipped in mock mode.

### 2. Seed data required in Firestore before testing

| Collection | Minimum needed |
|---|---|
| `terms` | 2+ terms with `institutionId`, `name`, `startDate` |
| `subjects` | 2+ subjects with `institutionId` |
| `teachers` | 2+ teachers, at least two sharing the same `departmentId` |
| `users` | One `institution_admin`, one `senior_teacher` (with `departmentId`), one `regular_teacher`, one `student` or `parent` |

### 3. Start the dev server

```
cd sms-system && npm run dev
```

---

## Scenario 1 — Menu item visibility (all roles)

Log in as each role in turn and confirm the **Schedule** entry appears in the left sidebar:

- `super_admin`
- `institution_admin`
- `senior_teacher`
- `regular_teacher`
- `student`
- `parent`

---

## Scenario 2 — institution_admin: full management access

1. Log in as `institution_admin`, navigate to `/schedule`.
2. Confirm the term selector is present and pre-selects the **most recent term** (sorted by `startDate` descending).
3. Confirm the **"Add Slot"** button is visible in the header row.

**Create a slot:**

4. Click Add Slot — the form modal opens.
5. Fill in: Term, Subject, Teacher, at least one day checkbox, Start Time (`09:00`), Duration (`60`), optional Room.
6. Submit. The modal closes and the new slot card appears under the correct day column — no page refresh required (real-time `onSnapshot`).

**Edit a slot:**

7. Click the edit (pencil) icon on a slot card. The form opens pre-filled with existing values.
8. Change the start time or room. Submit.
9. Verify the card updates immediately.

**Delete a slot:**

10. Click the delete (bin) icon on a slot card. Confirm the deletion prompt.
11. Verify the card disappears from the timetable.

---

## Scenario 3 — Term selector behaviour

1. With two or more terms in Firestore, use the term selector dropdown to switch terms.
2. Verify the timetable **clears immediately** when a new term is selected — no stale cards from the previous term visible during load.
3. Verify slots for the newly selected term populate correctly.

---

## Scenario 4 — Manage Access panel

1. Still logged in as `institution_admin`, confirm the **"Delegate Schedule Access"** collapsible section is visible below the header row.
2. Expand it. Confirm the list of `senior_teacher` users appears with each teacher's name and department.
3. **Grant access:** Toggle a senior teacher ON. The toggle turns blue. An inline **"Access granted"** message appears for approximately 3 seconds then disappears.
4. **Verify persistence:** Refresh the page, re-expand the panel — the toggle remains ON.
5. **Revoke access:** Toggle the same teacher OFF. Confirm **"Access revoked"** feedback appears.
6. Log in as that senior teacher and verify access was reflected (see Scenarios 5 and 6).

---

## Scenario 5 — senior_teacher WITH `canGenerateSchedule: true`

_First grant access via the Manage Access panel in Scenario 4, then log in as that teacher._

1. Navigate to `/schedule`.
2. Confirm the **"Add Slot"** button is visible.
3. Confirm **Edit** and **Delete** buttons are visible on slot cards.
4. Open the Add Slot form — verify the **Teacher dropdown only shows teachers from this teacher's own department**, not all institution teachers.
5. Create a slot. Verify it appears in the timetable.
6. Confirm the **"Delegate Schedule Access"** panel is **not visible** (panel is `institution_admin` only).

---

## Scenario 6 — senior_teacher WITHOUT `canGenerateSchedule` flag

_Ensure the flag is absent or `false` on this user's Firestore document._

1. Navigate to `/schedule`.
2. Confirm **no "Add Slot"** button is shown.
3. Confirm **no Edit or Delete** buttons are visible on slot cards.
4. Confirm the timetable is fully readable — term selector works, slot cards display correctly.
5. Confirm **"Delegate Schedule Access"** panel is not visible.

---

## Scenario 7 — Read-only roles (regular_teacher, student, parent)

Repeat the following for each role:

1. Navigate to `/schedule`.
2. Confirm no **"Add Slot"** button.
3. Confirm no **Edit / Delete** buttons on slot cards.
4. Confirm no **"Delegate Schedule Access"** panel.
5. Confirm the term selector and slot display work correctly.

---

## Scenario 8 — Conflict detection (two-step warning)

Log in as `institution_admin` or a `senior_teacher` with `canGenerateSchedule: true`.

**Trigger a conflict:**

1. Ensure at least one slot exists: Teacher A, Monday, `09:00`, 60 minutes.
2. Open Add Slot. Select the same term, **Teacher A**, check **Monday**, set start time `09:30`, duration `60`.
3. Submit once.
4. Expected: form stays open, amber warning appears:
   > `Teacher already has "Subject X" on Mon at 09:00. Submit again to save anyway.`
5. Submit a **second time** without changing any field.
6. Expected: slot saves and the modal closes.

**Confirm the warning resets on field change:**

7. Open Add Slot again with the same conflicting inputs.
8. After the warning appears, **change the teacher** to Teacher B.
9. Expected: the amber warning disappears immediately.
10. Submit once — no warning, saves directly (no conflict for Teacher B).

**Confirm no false positive on adjacent (non-overlapping) times:**

11. Create a slot for Teacher A, Monday, `10:01`, 60 minutes (starts one minute after the 09:00 + 60-minute slot ends at 10:00).
12. Submit once — no warning, saves directly. Times are adjacent but do not overlap.

---

## Scenario 9 — Real-time updates (onSnapshot)

1. Open `/schedule` in two browser tabs, both logged in as `institution_admin`, same term selected.
2. Create a slot in **Tab 1**.
3. Without refreshing, switch to **Tab 2** — the new slot card should appear automatically.
4. Delete the slot in **Tab 2** — it disappears from Tab 1 without a refresh.

---

## Scenario 10 — Firebase security rules (rules-level check)

Use **Firebase Console → Firestore → Rules Playground** to verify the published rules.

| Test | Expected result |
|---|---|
| `regular_teacher` attempts `create` on `timetable_slots` | Denied |
| `senior_teacher` with `canGenerateSchedule: false` attempts `create` | Denied |
| `senior_teacher` with `canGenerateSchedule: true` attempts `create` for their institution | Allowed |
| `institution_admin` attempts `create` for their institution | Allowed |
| Any signed-in user attempts `read` for their institution | Allowed |
| `institution_admin` writes `canGenerateSchedule` to a `senior_teacher` user document | Allowed |

---

## Out of scope for Phase 1

The following are not testable until Phase 2 work is complete:

| Item | Reason |
|---|---|
| BigCalendar integration on role dashboards | Phase 2 only — dashboards still show hardcoded events (Issue #56) |
| Room conflict detection | Deferred; teacher conflict detection is the Phase 1 scope |
| Student / parent slot filtering by enrolled class | Requires `enrolledStudentIds` population (Issue #52) |
| Occurrence expansion (day-by-day event generation) | Phase 2 — depends on `TermDocument` field verification (Issue #58) |
