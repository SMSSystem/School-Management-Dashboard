# TermForm Fix + Checklist Update — Implementation Plan

> **Created:** 2026-05-31
> **Branch:** `mvp`
> **Purpose:** Records the exact changes to be made for (A) the one remaining code gap (`TermForm.onSubmit` not wired to Firestore) and (B) the update to `REPORT_GENERATION_IMPLEMENTATION_CHECKLIST.md` to reflect the current codebase state.
> **Prerequisite completed:** All Firebase rules (N-2b institutions, N-3b feedback_comments, N-4 reports) published to Firebase Console on 2026-05-31.

---

## Part A — TermForm Fix

### Problem

`TermForm.onSubmit` is currently `console.log(data)`. The form renders correctly, passes Zod validation, and is registered in `FormModal.tsx` — but submitting it does nothing. In live mode this is a blocker: no term documents can be created through the UI, so `ResultForm` term selectors are empty and `generateReport` has nothing to aggregate over.

---

### Why the Standard Guard Cannot Be Used

All other forms that write to Firestore use one of two update guards:

| Guard | Example forms | Mechanism |
|---|---|---|
| `typeof id !== "string"` | `ClassForm`, `ResultForm`, `FeedbackCommentForm` | Mock IDs are numeric (`1`, `2`, `3`…); Firestore IDs are strings. A number fails the check → skip. |
| `!uid` | `TeacherForm`, `StudentForm` | Create-user flow owns creation; edit-only guard checks the UID from `data?.uid`. |

`termsData` mock records use **string IDs** (`"term-1"`, `"term-2"`, `"term-3"`), not numeric IDs. This is because `termsData` IDs are also used as **foreign key values** in option selectors across three consumers:

| Consumer | Usage |
|---|---|
| `ResultForm.tsx` | `<option key={t.id} value={t.id}>` — stored as `termId` |
| `FeedbackCommentForm.tsx` | `<option key={t.id} value={t.id}>` — stored as `termId` |
| `ReportsPage` (`reports/index.tsx`) | `<option key={t.id} value={t.id}>` — passed to `generateReport` as `termId` |

If `_termsData` IDs were changed from `"term-1"` to `1`, the option `value` would serialize as `"1"` (HTML coerces all values to strings), but existing mock records in `_resultsData`, `_feedbackCommentsData`, and `_reportsData` all reference `termId: "term-1"`. The default selection in edit mode across those three forms would break.

**Conclusion:** The `typeof id !== "string"` guard cannot be used for `TermForm`. The mock IDs must remain strings to preserve cross-collection referential consistency in mock mode.

---

### Recommended Update Guard — `DATA_MODE !== 'live'`

Use the data mode flag directly as the update guard:

```ts
import { DATA_MODE } from "@/lib/data";

// inside onSubmit, update branch:
if (DATA_MODE !== "live") {
  console.log("TermForm update: non-live mode, skipping Firestore", formData);
  return;
}
```

**Why this is the correct semantic gate:**

| Data mode | Terms list source | Consequence of update attempt |
|---|---|---|
| `mock` | `_termsData` (static string IDs) | No Firestore document exists for `"term-1"`. `updateDoc` would throw. Guard fires → skips correctly. |
| `blank` | `[]` (empty) | No rows displayed → edit button never shown → update path is never reached. Guard would never fire, but is harmless. |
| `live` | Firestore (2c — deferred) | Real documents with real auto-generated string IDs. Guard allows `updateDoc` through. |

This guard is more explicit than the numeric-ID pattern and documents the intent clearly: Firestore updates are only meaningful when the data layer is in live mode.

---

### Create Path — No Guard Needed

Create mode always attempts `addDoc` regardless of data mode. This is the consistent codebase pattern:

- `ClassForm` — `addDoc` on create, no mode guard
- `ResultForm` — `addDoc` on create, no mode guard
- `FeedbackCommentForm` — `addDoc` (or upsert) on create, no mode guard

In mock or blank modes, the new term writes to Firestore but the list won't reflect it (the list reads from `_termsData` or `[]`). This is the known deferred limitation from item 2c (live Firestore queries in list pages).

---

### Full Proposed `TermForm.tsx` Changes

**New imports (replace current bare imports):**

```ts
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE } from "@/lib/data";
```

**Add inside component body (before `useForm`):**

```ts
const { institutionId } = useAuth();
```

**Replace the current `onSubmit`:**

```ts
// BEFORE:
const onSubmit = handleSubmit((data) => {
  console.log(data);
});

// AFTER:
const onSubmit = handleSubmit(async (formData) => {
  if (type === "create") {
    await addDoc(collection(db, "terms"), {
      ...formData,
      institutionId,
    });
  } else {
    const id = data?.id;
    if (DATA_MODE !== "live") {
      console.log("TermForm update: non-live mode, skipping Firestore", formData);
      return;
    }
    if (!id) return;
    await updateDoc(doc(db, "terms", String(id)), { ...formData });
  }
});
```

**Note on `createdAt`:** Not added to the create payload because `TermDocument` in `firebase.ts` does not define a `createdAt` field. If auditing term creation is later required, add `createdAt?: string` to `TermDocument` and add `createdAt: new Date().toISOString()` to the payload here.

---

## Part B — Checklist Doc Changes

### Target file

`sms-system/docs/REPORT_GENERATION_IMPLEMENTATION_CHECKLIST.md`

---

### Header Changes

Replace the current `Created` line with:

```markdown
> **Created:** 2026-05-31
> **Last updated:** 2026-05-31
> **Firebase rules published:** N-2b (institutions), N-3b (feedback_comments), N-4 (reports) — all live in Firebase Console as of 2026-05-31.
```

---

### Per-Section Status Banners

Add a blockquote status banner immediately after each section's `##` heading. Format:

```markdown
> **Status: ✅ Complete — 2026-05-31.** One-line summary of what was done.
```

or for deferred/partial:

```markdown
> **Status: ⚠️ Partially complete.** Note explaining what remains and why.
```

Section-by-section breakdown:

| Section | Status | Banner text |
|---|---|---|
| §0 Type System Debt | ✅ Complete | `GradingSystem`, `TermDocument`, `ClassDocument`, `ResultDocument`, `FeedbackCommentDocument`, `ReportDocument`, and `gradingSystem` on `InstitutionDocument` all added to `firebase.ts`. |
| §1 F-1 Terms Management UI | ✅ Complete | Type, mock data, `TermForm` (Firestore-wired), list page, route, sidebar entry, and FormModal registration all done. `onSubmit` wired using `DATA_MODE` guard — see [TERMFORM_AND_CHECKLIST_UPDATE_PLAN.md](./TERMFORM_AND_CHECKLIST_UPDATE_PLAN.md). |
| §2 D-1 + D-2 Teacher/Student CRUD | ✅ Complete (edit paths) / ⚠️ 2c deferred | `TeacherForm` and `StudentForm` wired for edit paths only — by design, creation goes through the `create-user` flow. Live list-page queries (2c) explicitly deferred. |
| §3 D-4 Class CRUD | ✅ Complete | `ClassForm.onSubmit` wired (`addDoc`/`updateDoc`), `ClassDocument` type added. |
| §4 N-2 Grading Config UI | ✅ Complete | Settings page grading dropdown reads/writes `institutions/{id}.gradingSystem` via Firestore. `institutions` update rule expanded to allow `institution_admin` — published 2026-05-31. |
| §5 D-5 Results Data Model Rebuild | ✅ Complete | `_resultsData` rewritten to new schema, `ResultForm` rebuilt, `ResultDocument` type added, `ResultListPage` columns updated. |
| §6 N-3 `feedback_comments` Rules | ✅ Complete | Schema updated with `departmentId`; rules published to Firebase Console 2026-05-31. |
| §7 A-2 `feedback_comments` UI | ✅ Complete | `FeedbackCommentForm` with upsert logic, `/list/feedback` page, FormModal registration, route, sidebar entry, and mock data all done. |
| §8 N-4 `reports` Rules | ✅ Complete | Rules drafted in `firebase-rules.md` and published to Firebase Console 2026-05-31. |
| §9 A-3 Report Generation Logic | ✅ Complete | `ReportDocument` type added to `firebase.ts`; `generateReport` utility created at `src/lib/generateReport.ts`. |
| §10 N-5 `/reports` Page | ✅ Complete | `/reports` page with role-scoped table, generate panel, and per-row re-generate action; route and sidebar entry added. |

---

### Section 11 — Master Summary Table

Add a `Status` column as the final column of the table. Values:

| Value | Meaning |
|---|---|
| `✅ Done (2026-05-31)` | Code change complete and in repo |
| `✅ Console — published (2026-05-31)` | Firebase Console action completed |
| `⚠️ Deferred` | Intentionally deferred with reason in Deferred Items section |

Full per-row status:

| ID | Status |
|---|---|
| 0a | ✅ Done (2026-05-31) |
| 0b | ✅ Done (2026-05-31) |
| F-1a | ✅ Done (2026-05-31) |
| F-1b | ✅ Done (2026-05-31) |
| F-1c | ✅ Done (2026-05-31) |
| F-1d | ✅ Done (2026-05-31) |
| F-1e | ✅ Done (2026-05-31) |
| F-1f | ✅ Done (2026-05-31) |
| F-1g | ✅ Done (2026-05-31) |
| D-1 | ✅ Done (2026-05-31) — edit path only; create via create-user flow |
| D-2 | ✅ Done (2026-05-31) — edit path only; create via create-user flow |
| D-4 (form) | ✅ Done (2026-05-31) |
| D-4 (type) | ✅ Done (2026-05-31) |
| N-2a | ✅ Done (2026-05-31) |
| N-2b | ✅ Console — published (2026-05-31) |
| D-5a | ✅ Done (2026-05-31) |
| D-5b | ✅ Done (2026-05-31) |
| D-5c | ✅ Done (2026-05-31) |
| D-5d | ✅ Done (2026-05-31) |
| N-3a | ✅ Done (2026-05-31) |
| N-3b | ✅ Console — published (2026-05-31) |
| A-2a | ✅ Done (2026-05-31) |
| A-2b | ✅ Done (2026-05-31) |
| A-2c | ✅ Done (2026-05-31) |
| N-4 | ✅ Console — published (2026-05-31) |
| A-3 (logic) | ✅ Done (2026-05-31) |
| A-3 (type) | ✅ Done (2026-05-31) |
| N-5a | ✅ Done (2026-05-31) |
| N-5b | ✅ Done (2026-05-31) |
| N-5c | ✅ Done (2026-05-31) |
| 2c | ⚠️ Deferred |
| OI-2 | ⚠️ Deferred |
| OI-3 | ⚠️ Deferred |

---

### New "Deferred Items" Section

Add a new `## 12. Deferred Items` section at the end of the checklist (before `*End of implementation checklist.*`). Format:

```markdown
## 12. Deferred Items

Items intentionally left incomplete. Each entry records what the item is, why it was deferred,
and what must be true before it can be unblocked.

---

### 2c — Live Firestore Queries in Teacher/Student/Results/Terms List Pages

**What:** Replace all `teachersData`, `studentsData`, `resultsData`, `termsData` mock array
consumers in list pages with `getDocs` / `onSnapshot` queries filtered by `institutionId`.

**Why deferred:** The CRUD forms (D-1 through D-5) are now wired to write to Firestore in
live mode. Until Firestore is seeded with real institution data, swapping list pages to live
queries would produce empty tables in all dev environments. Deferring until live data exists
avoids breaking the development workflow.

**Unblocked by:** Real institution data seeded in the Firebase project; `DATA_MODE` set to
`'live'` in the target environment.

**Files to update when unblocking:**
- `src/scenes/(dashboard)/list/teachers/index.tsx`
- `src/scenes/(dashboard)/list/students/index.tsx`
- `src/scenes/(dashboard)/list/results/index.tsx`
- `src/scenes/(dashboard)/list/terms/index.tsx`

---

### OI-2 — Parent Form Linked-Students Multi-Select

**What:** Replace the free-text `linkedAccounts` input in `ParentForm.tsx` with a
multi-select dropdown populated from the live `students` collection, writing to the
`student_parents` join collection.

**Why deferred:** Requires live student data to be queryable (depends on 2c). The
`student_parents` collection is referenced by the `feedback_comments` and `reports`
read rules for parent access — but the form-level wiring can wait until students exist
in Firestore.

**Unblocked by:** 2c completed; at least one student document present in Firestore.

---

### OI-3 — Class Supervisor Dropdown (ClassForm)

**What:** Replace the free-text `supervisor` field in `ClassForm.tsx` with a dropdown
populated from the live `teachers` collection.

**Why deferred:** Requires live teacher data (depends on 2c for the teachers list page, or
a direct Firestore query in the form). Until teachers exist in Firestore the dropdown would
be empty, making the form worse than the current free-text field.

**Unblocked by:** 2c completed for teachers, or a direct `getDocs(collection(db, "teachers"))`
query added to `ClassForm` on mount.
```

---

### Summary of Changes to the Checklist File

| Change | Location in file | Nature |
|---|---|---|
| Update header | Lines 1–9 | Add `Last updated` and Firebase rules published note |
| Add status banners | Top of each `##` section (§0–§10) | New blockquote per section |
| Add `Status` column | Section 11 master table | New column, rightmost |
| Add §12 Deferred Items | After §11, before closing line | New section |
| Update closing line | Last line | Change from "Next immediate action: begin F-1…" to a note reflecting completion |

The full implementation detail, code snippets, and reasoning paragraphs within §0–§10 are **preserved unchanged** per the hybrid approach — status banners are additions, not replacements.

---

*End of plan. Proceed to implementation once this document is reviewed.*
