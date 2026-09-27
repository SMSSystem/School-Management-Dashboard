# Sidebar Regrouping + Collapsible Sections — Implementation Plan

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention)
> **Feature:** Splits the sidebar's "OUTCOMES" group into "OUTCOMES" and a new "REPORTS" group; moves four navigation items (Registrations, Academic Calendar, Backfill Classes, Import Data) into a new "ADMINISTRATION" group; and makes every titled group independently collapsible/expandable, persisted per session, mirroring the interaction model of the native HTML `<details>` element without using the element itself.
> **Route:** No new routes. One file changes: `src/components/Menu.tsx`.
> **Primary roles:** Affects the sidebar for every role — the two new groups themselves are populated mostly (ADMINISTRATION) or partly (REPORTS) by items already role-gated the same way they are today; no visibility rules change.
> **Resolves:** A sidebar-organization idea raised directly in conversation, refined across two rounds of clarifying questions into the design below.

---

## 1. Overview

The sidebar (`Menu.tsx`) is a single static array, `menuItems: MenuSection[]`, rendered by one generic loop (`Menu.tsx:494-546`) that filters each section's items by role and renders a header + item list. There is no per-section collapse today — every visible section always renders all of its visible items. The sidebar does already have one, unrelated collapse mechanism: a whole-sidebar "icon-only" mode toggled by the chevron button at the top (`collapsed`/`onToggle` props), which shrinks every item to just its icon but still renders every item from every group.

This plan adds a second, independent axis of collapse — per-group, text-mode only — without disturbing the existing icon-only mode, and reorganizes which items live in which group.

---

## 2. Background / Investigation Findings

- **`Menu.tsx` is the sidebar's only definition** — confirmed via `grep` for "OUTCOMES"/"PEOPLE" etc. across `src/`; no other file references a section by its title string, so regrouping is fully contained here.
- **A proven precedent for exactly this kind of collapsible section already exists in this codebase**: `schedule/index.tsx`'s "Delegate Schedule Access" panel — a `useState` boolean, a clickable header with a ▲/▼ indicator, and a conditionally-rendered body. This plan's Part B mirrors that shape rather than inventing a new pattern or reaching for the native `<details>`/`<summary>` elements (ruled out per your answer — harder to style to match the sidebar's existing rounded-hover/active-item visual language).
- **No tour step targets an individual sidebar nav item.** Every nav item carries a `tour-sidebar-nav-*` id, but `grep` across all of `src/` (including `useTourSteps.ts`) found these ids are never used as a tour-step `selector` — the per-page mini-tours (Gradebook, Report Builder, etc.) all target elements inside each page, not the sidebar. Regrouping and making sections collapsible carries no tour-breakage risk.
- **`filterPersistence.ts` is a proven, small, sessionStorage-backed utility already used for exactly this class of per-session UI state** (Gradebook/Attendance filter selections, the app-wide current-term value) — `getPersistedFilter(page, key)` / `setPersistedFilter(page, key, value)`, cleared on logout via the same `clearAllPersistedFilters()` sweep `AuthContext.tsx`'s `signOut()` already calls. Storing a value clears the key when the value is falsy/empty and writes it otherwise (`filterPersistence.ts:30-41`) — this plan's persisted values (`"1"` / `"0"`) are both non-empty strings, so this "empty removes" behavior never accidentally fires for a deliberately-closed group.
- **Registrations' placement in PEOPLE was a previously deliberate, documented choice** — `docs/student-registration-form/STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md:2144` reasoned "registrations are prospective people, closer kin to that section than to 'OUTCOMES'" when it was placed there. This plan reverses that placement knowingly, not by oversight.
- **"Import Data" is visible to `senior_teacher`/`regular_teacher`**, unlike the other three items moving into ADMINISTRATION (Registrations/Academic Calendar/Backfill Classes, all admin-only). A teacher will see an "ADMINISTRATION" section containing only "Import Data" once the other three are filtered out for their role — noted, not treated as a blocker (the section-render loop already handles "some items in a section aren't visible to this role" correctly today; this is just the first case where a section's *label* might feel slightly broad for what one particular role sees inside it).
- **`NavLink`'s active-route matching** already special-cases `/dashboard` (`end={item.href === "/dashboard"}`, `Menu.tsx:518`) so it doesn't stay highlighted on every route. This plan's group-level active-route detection (§5.2) replicates that same special case rather than introducing a second, subtly different matching rule.

---

## 3. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| New group placement | "REPORTS" immediately follows "OUTCOMES"; "ADMINISTRATION" follows "ATTENDANCE", before "OTHER" | REPORTS is a direct split of OUTCOMES, so keeping it adjacent reads naturally. ADMINISTRATION collects cross-cutting admin housekeeping items pulled from three different existing groups — placing it late, just before the always-last "OTHER" catch-all, matches its own "housekeeping" character. |
| Collapse mechanism | React-state, mirroring `schedule/index.tsx`'s existing collapsible-panel pattern | Your explicit choice — full styling control, consistent with an existing in-repo convention rather than native `<details>`. |
| Toggle behavior | Independent per group (not accordion) | Your explicit choice — matches native `<details>` semantics, avoids surprise-collapsing a group the user didn't touch. |
| Default state (first-ever visit, nothing persisted yet) | All groups start **open** | Not explicitly asked, but the only choice consistent with "nothing about the sidebar's appearance changes until a user actually collapses something" — matches current behavior exactly on first load. |
| Persistence | `sessionStorage` via `filterPersistence.ts`, one key per group title, cleared on logout (already covered by the existing sweep) | Your explicit choice — reuses proven infrastructure instead of a new mechanism. |
| Active-route auto-expand | A group auto-opens (and that open state is persisted) the moment `location.pathname` matches one of its items, but only as a one-time nudge on navigation — not a continuous render-time override | Your explicit choice for the auto-expand behavior itself. The "one-time nudge, not continuous override" refinement (§5.2) is necessary so a user can still manually collapse the group containing their current page afterward, without the auto-expand logic immediately re-opening it on the next render. |
| Interaction with the existing icon-only sidebar mode | Per-group state is ignored entirely while the sidebar is icon-only — every icon from every group always shows, exactly as today | Your explicit choice — icon-only mode has no clickable header to toggle, so respecting a closed group there would remove the only way to reach those pages without first expanding the full sidebar. |

---

## 4. Data Model

No type changes. `MenuItem`/`MenuSection` (`Menu.tsx:47-58`) stay exactly as they are — this plan only reorders which items sit in which `MenuSection.items` array and adds two new `MenuSection` entries. New local state (§5.2) lives in the `Menu` component itself, not in the data model.

---

## 5. Part A — Regrouping (data-only)

### 5.1 Final group order and membership

```
"" (Home)
PEOPLE          — Create Account, Teachers, Students, Parents
CURRICULUM      — Subjects, Departments, Houses, Classes
TIMETABLE       — Terms, Schedule, Lessons, Exams, Assignments
OUTCOMES        — Gradebook, Results, Feedback, Disciplinary Action, Grade Tracking
REPORTS         — Report Card Comments, Report Cards, Progress Reports, Report Builder   [NEW]
ATTENDANCE      — General Register, Summary Register, Subject Register, My Attendance,
                  Child Attendance, Rebuild Summaries, Audit Log
ADMINISTRATION  — Registrations, Academic Calendar, Backfill Classes, Import Data        [NEW]
OTHER           — User Profile, Brand Settings, Institution Profile, Institution Info
```

Every moved item keeps its existing `Icon`, `href`, `visible` array, and `id` completely unchanged — this is purely a matter of which `items` array each object literal sits inside in `Menu.tsx`'s source. No icon changes, since every relocated item already had one that still makes sense in its new group (e.g. `CalendarDays` for Academic Calendar, `Upload` for Import Data).

### 5.2 Exact diff shape

`Menu.tsx`'s current "OUTCOMES" block (`:239-350`) splits into two `MenuSection` object literals — the four Report-prefixed items (plus Report Builder) move into a new one titled `"REPORTS"`, inserted immediately after; "Import Data" is removed from OUTCOMES entirely (relocated, not duplicated). `Menu.tsx`'s current "ATTENDANCE" block (`:352-415`) loses "Academic Calendar" and "Backfill Classes"; `Menu.tsx`'s current "PEOPLE" block (`:81-134`) loses "Registrations". A new `"ADMINISTRATION"` section, inserted after ATTENDANCE, collects all four relocated items.

---

## 6. Part B — Collapsible groups

### 6.1 New helper: active-route matching

```ts
function isItemActive(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}
```

Deliberately mirrors the existing `end={item.href === "/dashboard"}` special-case already on the `NavLink` itself (`Menu.tsx:518`) — `/dashboard` needs an exact match (or it would "match" every route as a prefix), every other `href` uses prefix matching the same way `NavLink`'s own default (non-`end`) behavior already does for every other item.

### 6.2 New state, inside the `Menu` component

```ts
import { useLocation } from "react-router-dom";
import { getPersistedFilter, setPersistedFilter } from "@/lib/filterPersistence";

const SIDEBAR_PERSIST_PAGE = "sidebar";

// ...inside Menu():
const location = useLocation();

const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
  const initial: Record<string, boolean> = {};
  for (const section of menuItems) {
    if (!section.title) continue;
    const persisted = getPersistedFilter(SIDEBAR_PERSIST_PAGE, section.title);
    initial[section.title] = persisted === "" ? true : persisted === "1"; // default: open
  }
  return initial;
});

const toggleGroup = (title: string) => {
  setOpenGroups((prev) => {
    const next = !prev[title];
    setPersistedFilter(SIDEBAR_PERSIST_PAGE, title, next ? "1" : "0");
    return { ...prev, [title]: next };
  });
};

// One-time nudge on navigation — not a continuous render-time override, so a
// user can still manually collapse the active group afterward (§3).
useEffect(() => {
  const activeSection = menuItems.find(
    (s) => s.title && s.items.some((i) => isItemActive(i.href, location.pathname)),
  );
  if (activeSection?.title && !openGroups[activeSection.title]) {
    setOpenGroups((prev) => ({ ...prev, [activeSection.title!]: true }));
    setPersistedFilter(SIDEBAR_PERSIST_PAGE, activeSection.title!, "1");
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
  // re-runs only on navigation, not on every openGroups change (that would
  // turn the one-time nudge into the continuous override this design
  // explicitly avoids).
}, [location.pathname]);
```

### 6.3 Render changes

The header block (`Menu.tsx:502-509`) becomes a clickable button when the sidebar isn't icon-only, and per-group open state gates whether `visibleItems` renders — bypassed entirely in icon-only mode per §3's decision:

```diff
-{section.title && !collapsed && (
-  <h2 className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600 font-semibold mt-4 mb-1 px-2.5">
-    {section.title}
-  </h2>
-)}
+{section.title && !collapsed && (
+  <button
+    type="button"
+    onClick={() => toggleGroup(section.title)}
+    aria-expanded={openGroups[section.title]}
+    className="flex items-center justify-between w-full text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600 font-semibold mt-4 mb-1 px-2.5 hover:text-slate-600 dark:hover:text-slate-400"
+  >
+    {section.title}
+    <ChevronDown
+      className={`w-3 h-3 shrink-0 transition-transform duration-150 ${openGroups[section.title] ? "" : "-rotate-90"}`}
+    />
+  </button>
+)}
 {section.title && collapsed && (
   <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
 )}

-{visibleItems.map((item) => {
+{(collapsed || !section.title || openGroups[section.title]) && visibleItems.map((item) => {
```

`ChevronDown` joins the existing `lucide-react` import list (`Menu.tsx:4-45`). The untitled Home section (`section.title === ""`) is unaffected by the new gating condition — `!section.title` short-circuits it to always-visible, same as today.

---

## 7. Firestore / Rules

No changes. This is a purely client-side UI feature — no new reads, writes, or security rules.

---

## 8. Testing Considerations

- `npx tsc -b` / `npx eslint` / `npx vitest run` / `npm run build` — standing gate.
- `isItemActive()` is pure and unit-testable: `/dashboard` exact-match vs. prefix-match for every other href, including a false-positive check (e.g. `/dashboard/list/students` must not be considered active for an item whose `href` is `/dashboard/list/student` — not applicable today since no such near-collision exists, but worth a test documenting the intent).
- Manual/e2e: toggle a group closed, reload the page, confirm it stays closed (persistence). Sign out and back in, confirm every group resets to open (logout sweep). Navigate directly to a route inside a closed group, confirm it auto-opens; then manually collapse it again and confirm it stays collapsed (doesn't immediately re-open from the same active route).
- Manual: collapse the whole sidebar to icon-only mode with a group closed, confirm every icon (including that group's) still shows.
- Regression: confirm every relocated item's `href`, `visible` array, and `id` are byte-identical to before — this is a reorganization, not a rewrite of any item's own definition.

---

## 9. Implementation Order

1. Part A (§5) — pure regrouping, independently shippable and visually verifiable before any collapse behavior exists.
2. `isItemActive()` helper (§6.1) — pure function, unit-testable in isolation.
3. `openGroups` state + `toggleGroup` + persistence (§6.2, minus the auto-expand effect) — verify manual toggle-and-persist works correctly first.
4. The active-route auto-expand effect (§6.2's `useEffect`) — layered on top once manual toggling is confirmed solid, matching this project's own established precedent of verifying a mechanism before adding the behavior that depends on it.
5. Render changes (§6.3).

---

## 10. Explicitly Out of Scope

- **Accordion-style toggling** — ruled out per §3; independent toggling only.
- **Respecting group state in icon-only sidebar mode** — ruled out per §3.
- **Native `<details>`/`<summary>`** — ruled out per §3 in favor of the React-state equivalent.
- **Renaming/reorganizing any group beyond what's specified here** (PEOPLE, CURRICULUM, TIMETABLE, and the surviving parts of ATTENDANCE/OUTCOMES stay as they are) — not requested.
- **Updating `STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md`'s now-superseded reasoning** about Registrations' placement — a documentation-hygiene nicety, not required for this feature to ship correctly.
