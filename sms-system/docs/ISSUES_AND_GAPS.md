# Issues & Gaps — School Management Dashboard

> **Generated:** 2026-05-27 · **Last updated:** 2026-05-27
> **Branch:** `main` (commit `15b2198`)
> **Scope:** Static analysis of `sms-system/src`; cross-referenced with `ROLE_PRIVILEGE_ANALYSIS.md`

---

## 🔴 Broken / Missing Routes

### 1. Menu links to non-existent routes
**File:** `src/components/Menu.tsx` (lines 76–90)

The sidebar navigation includes two entries — **Attendance** (`/list/attendance`) and **Messages** (`/list/messages`) — that are not registered as `<Route>` elements in `src/App.tsx`. Clicking either link renders a blank/empty view.

**Fix:** Either register the missing routes with their page components, or remove the menu items until the pages are built.

---

### 2. Super Admin "Audit Logs" quick action links to a non-existent page
**File:** `src/scenes/(dashboard)/super-admin/index.tsx`

The quick-actions strip on the Super Admin dashboard contains an **Audit Logs** card that navigates to `/audit-log`. No such route exists in the router.

**Fix:** Register the route, or remove/disable the quick action until the feature is ready.

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

### 11. `"use client"` directive in a Vite/React project
**File:** `src/components/FormModal.tsx` (line 1)

The file opens with `"use client"`, a Next.js App Router directive. This is meaningless in a Vite + React SPA and has no effect, but it is misleading to anyone reading the file.

**Fix:** Remove the directive.

---

### 12. Duplicate logout controls
**Files:** `src/components/Navbar.tsx`, `src/components/Menu.tsx`

Both the top navigation bar and the sidebar menu render independent logout buttons that each call `signOut()` and redirect to `/login`. While one is hidden on mobile and the other on desktop, the duplication of logic could lead to divergence over time.

**Fix:** Extract the logout action into a single shared handler (already in `useAuth`) and keep both buttons calling it — no logic change needed, but document the intentional UX split.

---

### 13. `Pagination` component is purely decorative
**File:** `src/components/Pagination.tsx`

Every list page renders `<Pagination />` but the component has no props, no state, and no connection to the data arrays being displayed. It renders page controls that do nothing.

**Fix:** Accept `total`, `pageSize`, and `currentPage` props; lift page state into each list page; slice the data array (or pass the page cursor to Firestore queries) accordingly.

---

### 14. `TableSearch` does not filter data
**File:** `src/components/TableSearch.tsx`

The search input in every list page header is a standalone uncontrolled input. Its value is never read by the parent page, so typing in it has no effect on the displayed rows.

**Fix:** Lift search state into each list page; filter the data array client-side (or pass the search term to a Firestore `where` query) and pass filtered results to `<Table />`.

---

### 15. `teacherType` on auth context superseded by split roles

**File:** `src/lib/AuthContext.tsx`

> **Updated 2026-05-27** — The original concern (no UI differentiation between teacher subtypes) is resolved. The `teacher` auth role has been split into `regular_teacher` and `senior_teacher`; see spec v1.1 (`sms-role-specification-v1.md`) and `teacher-role-split-impact.md`. Role-based branching now drives separate dashboard pages (`SeniorTeacherPage` / `RegularTeacherPage`), settings sections, profile details, and list-page action buttons.

The `teacherType` field remains on the auth context (decision D3 in `teacher-role-split-impact.md`) as a denormalized mirror of `users.role`. It is not consumed by any component — all branching uses `role === 'senior_teacher'` / `role === 'regular_teacher'` directly.

**Remaining:** Remove the `teacherType` fetch from `AuthContext.tsx` and drop the field from the context type once the data layer is live and `role` alone has been confirmed as the source of truth. Low priority — no functional gap until then.

---

## 🟠 Multi-tenancy Not Enforced

### 16. List pages do not filter by `institutionId`
**Files:** All pages under `src/scenes/(dashboard)/list/`

The `institutionId` is correctly stored on the auth context and is set to `'*'` for `super_admin` users. However, when the data layer is wired up, no list page currently passes `institutionId` as a Firestore `where` filter. Without this, every authenticated user would query — and potentially see — records belonging to all institutions.

**Fix:** Before connecting any list page to Firestore, add a `where('institutionId', '==', institutionId)` clause to every collection query (skipping the filter when `institutionId === '*'` for super admins).

---

## 🔴 Role / Privilege UI Bugs

### 17. Lessons list — create and edit buttons not shown to teachers

**File:** `src/scenes/(dashboard)/list/lessons/index.tsx`

The create and edit buttons on `/list/lessons` are gated behind `role === "institution_admin" || role === "super_admin"`. Both teacher roles (`senior_teacher`, `regular_teacher`) are excluded.

This contradicts both the role spec (§4.3 — _"Teachers can create and edit their own lessons"_) and the Firestore rules, which explicitly allow teachers to write to the `lessons` collection:

```text
lessons:
  senior_teacher  → Create + edit own OR dept
  regular_teacher → Create + edit own only
```

The backend would permit the write; the UI never offers the affordance. Teachers have no way to manage their lessons through the dashboard.

**Fix:** Add `regular_teacher` and `senior_teacher` to the visibility guard for the create button. For the update/delete buttons inside each row, apply the same expansion and differentiate on ownership (regular teacher) vs. department scope (senior teacher) before passing data to `FormModal`. The delete button should remain admin-only consistent with the spec and rules.

---

### 18. Exams / Assignments / Results — delete button incorrectly rendered for teachers

**Files:**

- `src/scenes/(dashboard)/list/exams/index.tsx`
- `src/scenes/(dashboard)/list/assignments/index.tsx`
- `src/scenes/(dashboard)/list/results/index.tsx`

All three pages gate their action buttons with the same condition:

```tsx
{(role === "institution_admin" || role === "super_admin"
  || role === "regular_teacher" || role === "senior_teacher") && (
  <>
    <FormModal table="exam" type="update" data={item} />
    <FormModal table="exam" type="delete" id={item.id} />  {/* ← teachers should not see this */}
  </>
)}
```

The spec states _"No teacher can delete anything — that's admin-only"_ (§4.3). The Firestore rules enforce this correctly: `allow delete: if isAdminOrAbove()`. The delete button renders for both teacher roles but every click will result in a Firestore **permission-denied** error at runtime. This is a misleading and broken UI state.

**Fix:** Split the `update` and `delete` buttons into separate conditions. Show `update` to teachers (see Issue #17) and `delete` to admins only:

```tsx
{/* update: teachers may edit their own/dept records */}
{(role === "institution_admin" || role === "super_admin"
  || role === "senior_teacher" || role === "regular_teacher") && (
  <FormModal table="exam" type="update" data={item} />
)}
{/* delete: admin-only per spec and Firestore rules */}
{(role === "institution_admin" || role === "super_admin") && (
  <FormModal table="exam" type="delete" id={item.id} />
)}
```

Apply the same split to `assignments/index.tsx` and `results/index.tsx`.

---

_End of Issues & Gaps report._
