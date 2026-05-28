# Issues & Gaps — School Management Dashboard

> **Generated:** 2026-05-27 · **Last updated:** 2026-05-27
> **Branch:** `main` (commit `15b2198`)
> **Scope:** Static analysis of `sms-system/src`; cross-referenced with `ROLE_PRIVILEGE_ANALYSIS.md`

---

## ✅ Broken / Missing Routes — All Resolved

### 1. Menu links to non-existent routes ✅ Resolved

**File:** `src/components/Menu.tsx`

> **Updated 2026-05-27** — The **Attendance** (`/list/attendance`) and **Messages** (`/list/messages`) entries have been removed from the `menuItems` array. Both routes remain unregistered in `App.tsx`; the menu items can be reinstated once the corresponding pages are built.

---

### 2. Super Admin "Audit Logs" quick action links to a non-existent page ✅ Resolved

**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

> **Updated 2026-05-27** — The **Audit Logs** entry has been removed from the `quickActions` array. The `/audit-log` route remains unregistered; the quick action can be reinstated once the Audit Logs page and its route are built.

---

## 🔴 Data Layer Not Connected

### 3. All list pages read from static mock data
**File:** `src/lib/data.ts`

Every list page (Teachers, Students, Parents, Subjects, Classes, Lessons, Exams, Assignments, Results, Events, Announcements) imports hardcoded arrays from `data.ts`. The file itself is annotated:

```ts
// TEMPORARY MOCK DATA — replace each export with Firestore queries as data layer is built out
```

There are zero live Firestore reads anywhere in the list pages.

**Fix:** Implement Firestore query hooks (or service functions) per entity, filtered by `institutionId`, and replace the static imports.

---

### 4. Forms do not persist data
**Files:** `src/components/forms/TeacherForm.tsx`, `src/components/forms/StudentForm.tsx`, `src/components/FormModal.tsx`

The Teacher and Student forms (lazy-loaded inside `FormModal`) have no submit handlers that write to Firestore. The **Delete** confirmation button inside the modal is also non-functional — it renders a `<form>` with no `action` and no `onSubmit`.

**Fix:** Add `onSubmit` handlers to each form that call the appropriate Firestore `setDoc`/`addDoc`/`deleteDoc` operations.

---

## 🟡 Hardcoded UI Content

### 5. Navbar displays hardcoded user name and avatar ✅ Resolved

**Files:** `src/components/Navbar.tsx`, `src/lib/AuthContext.tsx`

> **Updated 2026-05-27** — `AuthContext` now exposes `displayName: string | null` sourced from `users/{uid}.name` in Firestore (read within the existing `fetchRole` call — no extra round-trip). `Navbar` resolves the display name as `displayName → user.email → "—"` and renders a monogram circle (first character, sky-blue background) in place of the static `avatar.png`. Falls back to a `<img>` only if `user.photoURL` is set on the Firebase Auth profile.

---

### 6. Single detail pages (Teacher, Student) contain fully hardcoded content
**Files:** `src/scenes/(dashboard)/list/students/[id]/index.tsx`, `src/scenes/(dashboard)/list/teachers/[id]/index.tsx`

Student name ("Cameron Moran"), grade, attendance percentage, class, lesson count, contact details, and bio are all static strings in JSX. The route receives an `id` param but it is never read.

**Fix:** Read the `:id` param via `useParams`, query the matching Firestore document, and render real data.

---

### 7. Super Admin KPI cards display hardcoded numbers
**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

The four KPI cards ("36" institutions, "1,280" total users, "31" active, "4" super admins) are static strings defined in the `kpiCards` array at the top of the file.

**Fix:** Derive these values from live Firestore aggregate queries or Firestore count() calls once the data layer is ready.

---

### 8. Calendar events are dated to August 2024
**File:** `src/lib/data.ts` (line 917 onwards)

All entries in `calendarEvents` use `new Date(2024, 7, ...)` (month index 7 = August 2024). They will never appear on the current-month view of the Big Calendar component. A comment in the file acknowledges this:

```ts
// YOU SHOULD CHANGE THE DATES OF THE EVENTS TO THE CURRENT DATE TO SEE THE EVENTS ON THE CALENDAR
```

**Fix:** Replace hardcoded dates with dates relative to `new Date()`, or — better — source calendar events from Firestore.

---

## 🟡 Mock Data Bugs

### 9. Duplicate ID in `classesData`
**File:** `src/lib/data.ts` (around line 420)

Two class entries share `id: 5` — one for class "5A" and one for "5B". Additionally, the next item is assigned `id: 7`, skipping 6 entirely.

```ts
{ id: 5, name: "5A", ... },
{ id: 5, name: "5B", ... },  // ← duplicate id
{ id: 7, name: "7A", ... },  // ← id 6 skipped
```

**Fix:** Correct the IDs to `5`, `6`, `7` sequentially (though this becomes moot once real Firestore document IDs are used).

---

### 10. Duplicate email across `parentsData`
**File:** `src/lib/data.ts` (around line 268)

Entries 3 through 10 in `parentsData` all share the same email address (`mike@geller.com`). Only entries 1 and 2 have distinct emails.

**Fix:** Assign unique placeholder emails per entry, or remove the field until it is populated from Firestore.

---

## 🟡 Code Quality

### 11. `"use client"` directive in a Vite/React project ✅ Resolved

**File:** `src/components/FormModal.tsx`

> **Updated 2026-05-27** — The `"use client"` directive has been removed from line 1 of `FormModal.tsx`. It was a Next.js App Router directive with no effect in this Vite + React SPA.

---

### 12. Duplicate logout controls ✅ Resolved

**Files:** `src/components/Navbar.tsx`, `src/components/Menu.tsx`

> **Updated 2026-05-27** — Both buttons already call `signOut()` from `useAuth` — no logic change was needed. An explanatory comment has been added above each button documenting the intentional UX split: the Navbar button is the primary logout control on narrow viewports where the sidebar is collapsed; the Menu button serves medium and large viewports where the sidebar is visible. Each comment cross-references the other file so future changes are applied consistently to both.

---

### 13. `Pagination` component is purely decorative ✅ Resolved

**File:** `src/components/Pagination.tsx`

> **Updated 2026-05-27** — `Pagination` rewritten to accept `total`, `page`, `pageSize`, and `onPageChange` props. Page state (`useState(1)`) lifted into all 11 list pages. Each page computes `filteredData` (via `filterByInstitution`) and `paginatedData` (`.slice`) then passes `paginatedData` to `<Table>` and the corresponding counts and callbacks to `<Pagination>`. Page size fixed at 20 rows, exported as `PAGE_SIZE` from `src/lib/utils.ts` as the single source of truth. Page controls (Prev/Next, numbered buttons, ellipsis) are fully functional; state resets to page 1 on navigation. When Firestore queries replace mock data, switch the slice to a server-side cursor and pass the live total from the query snapshot.

---

### 14. `TableSearch` does not filter data
**File:** `src/components/TableSearch.tsx`

The search input in every list page header is a standalone uncontrolled input. Its value is never read by the parent page, so typing in it has no effect on the displayed rows.

**Fix:** Lift search state into each list page; filter the data array client-side (or pass the search term to a Firestore `where` query) and pass filtered results to `<Table />`.

---

### 15. `teacherType` on auth context superseded by split roles ✅ Resolved

**File:** `src/lib/AuthContext.tsx`

> **Updated 2026-05-27** — The original concern (no UI differentiation between teacher subtypes) is resolved. The `teacher` auth role has been split into `regular_teacher` and `senior_teacher`; see spec v1.1 (`sms-role-specification-v1.md`) and `teacher-role-split-impact.md`. Role-based branching now drives separate dashboard pages (`SeniorTeacherPage` / `RegularTeacherPage`), settings sections, profile details, and list-page action buttons.
>
> **Updated 2026-05-27** — `teacherType` removed from `AuthContext` as an early cleanup. The field was confirmed as unused by all components; all role branching already uses `role === 'senior_teacher'` / `role === 'regular_teacher'` directly. Removed: the `TeacherType` import, the `teacherType: TeacherType | null` field from `AuthContextValue`, the `useState` variable, the second Firestore read (`teachers/{uid}`), and the entry in the context `Provider` value. The `TeacherType` type in `firebase.ts` is retained — it is still referenced by `SuperAdminCreateUserForm` when writing new teacher documents to Firestore.

---

## ✅ Multi-tenancy Not Enforced — Resolved

### 16. List pages do not filter by `institutionId` ✅ Resolved

**Files:** All pages under `src/scenes/(dashboard)/list/`

> **Updated 2026-05-27** — `filterByInstitution<T>` utility created in `src/lib/utils.ts` and applied to all 11 list pages. Every `<Table data={...} />` call is now wrapped with `filterByInstitution(rawData, institutionId)`, where `institutionId` is destructured from `useAuth()`.
>
> **Behaviour by mode:**
>
> - `institutionId === '*'` (super_admin) → all records returned, no filter applied
> - `institutionId === null` (unauthenticated edge case) → all records returned
> - Record has no `institutionId` field → record is included (mock-data safe; current mock arrays carry no `institutionId` so display is unchanged)
> - Record has `institutionId` set → only included when it matches the user's institution
>
> The filter is a no-op against the current mock data and activates automatically once real Firestore documents — which will carry `institutionId` on every record — are wired up. When adding Firestore queries, prefer server-side filtering with a `where('institutionId', '==', institutionId)` clause in addition to this client-side guard.

---

## ✅ Role / Privilege UI Gaps — All Resolved

### 17. Lessons list — create and edit buttons not shown to teachers ✅ Resolved

**File:** `src/scenes/(dashboard)/list/lessons/index.tsx`

> **Updated 2026-05-27** — Both teacher roles (`regular_teacher`, `senior_teacher`) have been added to the visibility guards for the `create` button (toolbar) and the `update` button (per row), bringing the UI into alignment with the role spec (§4.3) and the Firestore rules. The `delete` button remains admin-only (`institution_admin` | `super_admin`), consistent with the spec and the same pattern applied in Issue #18.

---

### 18. Exams / Assignments / Results — delete button incorrectly rendered for teachers ✅ Resolved

**Files:**

- `src/scenes/(dashboard)/list/exams/index.tsx`
- `src/scenes/(dashboard)/list/assignments/index.tsx`
- `src/scenes/(dashboard)/list/results/index.tsx`

> **Updated 2026-05-27** — The combined action guard has been split into two separate conditions across all three pages. `update` is shown to all four non-student roles (admins + teachers); `delete` is now admin-only (`institution_admin` | `super_admin`), consistent with the spec (§4.3) and the Firestore rules (`allow delete: if isAdminOrAbove()`). Teachers can no longer trigger a delete action that would result in a runtime permission-denied error.

---

_End of Issues & Gaps report._
