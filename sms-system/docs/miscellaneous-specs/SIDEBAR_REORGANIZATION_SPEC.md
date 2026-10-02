# Sidebar Regrouping + Collapsible Sections — Implementation Plan

> **Status:** Revised 2026-10-02. Planned — not yet implemented (spec written before code, per this repo's standing convention). Updated for the mobile drawer shell (PR #67), the Rubrics item (PR #64) and the temporary student sidebar hides.
> **Feature:** Splits the sidebar's "OUTCOMES" group into "OUTCOMES" and a new "REPORTS" group; moves six navigation items into a new "ADMINISTRATION" group; and makes every titled group independently collapsible and expandable, persisted per tab session, in both the desktop sidebar and the mobile drawer.
> **Route:** No new routes. Files: `src/components/Menu.tsx`, a new `src/lib/sidebarNav.ts` (menu data and pure helpers, so they can be unit-tested), `src/lib/__tests__/sidebarNav.test.ts`, a new `e2e/13-sidebar.spec.ts`, and `docs/guides/USER_GUIDE.md`.
> **Primary roles:** Every role sees the sidebar. No visibility rules change: each moved item keeps its own `visible` array.
> **Resolves:** A sidebar-organization request refined over several rounds of clarifying questions into the design below.

---

## 1. Overview

The sidebar is one static array, `menuItems: MenuSection[]`, in `Menu.tsx`, rendered by one generic loop that filters each section's items by role (and by the temporary student hide set) and renders a header and an item list. There is no per-section collapse today: every visible section always renders all of its visible items.

Three independent display states exist or will exist:

1. **Desktop icon-only mode** — the chevron at the top (`collapsed`/`onToggle`). Every item from every group shows as an icon. Also forced during product tours (`collapseForTour`).
2. **Mobile drawer** (PR #67) — below `md` the sidebar is an off-canvas drawer, always text mode (`collapsed && !isMobile`), mounted whether the drawer is open or closed (it is slid off-screen and made `inert`). `Menu` receives `mobile`, which gives items `min-h-11` tap targets.
3. **Per-group collapse** (new) — text mode only, on desktop and in the drawer.

This plan adds the third without disturbing the first two, and reorganizes which items live in which group.

---

## 2. Background / Investigation Findings

Confirmed against `main` at `3c69872` (after PR #67). Line numbers drift; blocks and functions are named instead.

- **`Menu.tsx` is the sidebar's only definition.** No other source file references a group by its title. Regrouping is contained there — but **documentation does**: `docs/guides/USER_GUIDE.md` lists the groups in one sentence ("Navigation is grouped into sections (e.g., PEOPLE, CURRICULUM, TIMETABLE, OUTCOMES, ATTENDANCE, OTHER)") and says "(under **OUTCOMES**)" in a dozen steps. The same guide also says "On smaller screens the sidebar collapses to icon-only view", which PR #67 made untrue (it is now a drawer). See §10.
- **Current group contents (what the spec must reflect):** TIMETABLE now includes **Rubrics** (PR #64). OUTCOMES holds Gradebook, Results, Feedback, Report Card Comments, Report Cards, Progress Reports, Disciplinary Action, Report Builder, Grade Tracking and Import Data. ATTENDANCE holds Academic Calendar, General/Summary/Subject Register, My Attendance, Child Attendance, Backfill Classes, Rebuild Summaries and Audit Log. PEOPLE ends with Registrations.
- **Student temporary hides.** `STUDENT_TEMPORARILY_HIDDEN` (Exams, Report Cards, Progress Reports, Disciplinary Action) and the student-only hiding of Start Tour are UI-only and live in `Menu.tsx`. A section whose items are all hidden for a role already renders nothing (`visibleItems.length === 0 → null`). The new data module must carry the hide set with it (§5.3).
- **No tour step targets an individual sidebar nav item.** Every nav item has a `tour-sidebar-nav-*` id, but the only sidebar-related ids elsewhere are `tour-sidebar` (the `<aside>`) and `tour-sidebar-collapse-toggle`; the step selectors in `useTourSteps.ts` target page elements only. Regrouping carries no tour-breakage risk. The `tour-sidebar-nav-*` ids are currently unused attributes; they are **kept** (§4).
- **Tours collapse the whole sidebar.** `collapseForTour` / `TourSidebarRestorer` put the sidebar into icon-only mode for the duration of a tour. Because per-group state is ignored in icon-only mode (§4), tours are unaffected.
- **`filterPersistence.ts` is the sessionStorage utility used for per-session UI state** (Gradebook/Attendance filters, the app-wide current term), cleared on logout by `clearAllPersistedFilters()` (called from `AuthContext`'s `signOut`). It is documented for per-page filters, so this is a small stretch of its purpose; it is still reused deliberately for the existing prefix and logout sweep. `getPersistedFilter` returns `''` for a missing key and `setPersistedFilter` removes a key for a falsy value; this plan stores `"1"`/`"0"`, both non-empty, so a deliberately closed group is never mistaken for "never set". `sessionStorage` is **per tab**, so a new tab starts with every group open.
- **Route matching.** `NavLink` marks an item active by **path-segment** prefix (and `end` for `/dashboard`). A raw `pathname.startsWith(href)` is not equivalent: `/dashboard/list/students-archive` would "match" `/dashboard/list/students`. The helper must therefore use `matchPath` (§6.1) so group-level matching and `NavLink`'s own highlight can't disagree.
- **Collapsible-panel precedent:** `schedule/index.tsx`'s "Delegate Schedule Access" panel (a `useState` boolean, a clickable header, a conditionally shown body). This plan follows the same React-state approach rather than the native `<details>` element, which is harder to style to the sidebar's rounded hover and active visual language.
- **Registrations' placement in PEOPLE was a documented earlier choice** (`STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md`: "prospective people, closer kin to that section than to OUTCOMES"). This plan reverses it knowingly.
- **"Import Data" is visible to teachers**, unlike the other items moving into ADMINISTRATION (admin-only). A teacher will see an ADMINISTRATION header over a single item. The section loop already handles partly visible sections; this is the one case where the group's label feels broad for what that role sees. Noted, not a blocker.
- **No sidebar tests exist today.** `Menu` has no unit tests and no spec targets grouping. Specs 09 and 12 open pages through sidebar links, so they are the regression canary (§8).

---

## 3. Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| New group placement | REPORTS immediately after OUTCOMES; ADMINISTRATION after ATTENDANCE, before OTHER | REPORTS is a direct split of OUTCOMES. ADMINISTRATION collects admin housekeeping pulled from several groups and sits just before the catch-all OTHER. |
| ADMINISTRATION contents | Registrations, Academic Calendar, Backfill Classes, Import Data, **Rebuild Summaries, Audit Log** | The four originally requested items plus the two admin-only housekeeping items that were already out of place in ATTENDANCE. **Grade Tracking stays in OUTCOMES** (it is about grading progress, not housekeeping). |
| Collapse mechanism | React state | Full styling control; consistent with the existing in-repo collapsible panel. |
| Toggle behaviour | Independent per group (not accordion) | Avoids surprise-collapsing a group the user didn't touch. |
| Default state | All groups open when nothing is persisted | The sidebar looks exactly as it does today until a user collapses something. |
| Persistence | `sessionStorage` via `filterPersistence.ts`, one key per group title, per tab, cleared on logout | Reuses the existing mechanism and logout sweep (stretching a module documented for per-page filters; see §2). |
| Active-route auto-expand | A group opens (and that state is persisted) the moment navigation lands on one of **its items this role can see**; a one-time nudge on navigation, not a continuous override | The "one-time nudge" lets a user still collapse the group containing their current page afterwards. Matching only visible items stops a student following a URL to a hidden item from opening a group for something not rendered. |
| Icon-only mode | Per-group state is ignored; every icon from every group always shows | Icon-only has no header to toggle; honoring closed groups would remove the only way to reach those pages without first expanding the sidebar. Also covers tours. |
| Mobile drawer | Same collapsible behaviour as desktop, with the header given a 44px tap target | The drawer is the only navigation on phones; a long, always-open list is a long scroll. State is shared with desktop (same keys) because both render the same `Menu`. |
| Where the data lives | `menuSections`, the student hide set, and the pure helpers move to `src/lib/sidebarNav.ts`; `Menu.tsx` keeps the component | Lets grouping, role visibility and route matching be unit-tested without rendering. Every item definition moves verbatim. |
| Header semantics | `<h2>` containing a `<button>` with `aria-expanded` and `aria-controls` | Keeps the heading structure the sidebar has today while adding the toggle. |
| `tour-sidebar-nav-*` ids | Kept, unchanged | No behaviour change; recorded as currently unused by any tour. |

---

## 4. Data Model

No type changes: `MenuItem`/`MenuSection` keep their shape; they and `menuSections` move to `src/lib/sidebarNav.ts` and are exported. This plan only reorders which items sit in which `items` array and adds two `MenuSection` entries. New state (§6.2) lives in the `Menu` component.

---

## 5. Part A — Regrouping and extraction (data only)

### 5.1 Final group order and membership

```text
"" (Home)
PEOPLE          — Create Account, Teachers, Students, Parents
CURRICULUM      — Subjects, Departments, Houses, Classes
TIMETABLE       — Terms, Schedule, Lessons, Exams, Assignments, Rubrics
OUTCOMES        — Gradebook, Results, Feedback, Disciplinary Action, Grade Tracking
REPORTS         — Report Card Comments, Report Cards, Progress Reports, Report Builder   [NEW]
ATTENDANCE      — General Register, Summary Register, Subject Register, My Attendance,
                  Child Attendance
ADMINISTRATION  — Registrations, Academic Calendar, Backfill Classes, Import Data,
                  Rebuild Summaries, Audit Log                                           [NEW]
OTHER           — User Profile, Brand Settings, Institution Profile, Institution Info
```

Every moved item keeps its `Icon`, `href`, `visible` array and `id` unchanged — only the `items` array it sits in changes. No icon changes (`CalendarDays` for Academic Calendar, `Upload` for Import Data, `RefreshCw` for Backfill Classes, `Database` for Rebuild Summaries and `FileClock` for Audit Log all still fit).

Role-visible results to expect: a student's REPORTS group is empty after the temporary hides (Report Cards and Progress Reports hidden), so it renders nothing; their ATTENDANCE group shows only My Attendance. A teacher's ADMINISTRATION group shows only Import Data (§2).

### 5.2 Extraction

Create `src/lib/sidebarNav.ts` containing, moved verbatim: the `MenuItem`/`MenuSection` types, the item data (now as `export const menuSections`, with the regrouping above applied), and `STUDENT_TEMPORARILY_HIDDEN` with its existing "temporary, UI-only" comment. Add the pure helpers in §6.1. `Menu.tsx` imports them and keeps only rendering, the Start Tour button and the state in §6.2. The Lucide icon imports move with the data.

### 5.3 Exports

```ts
export type MenuItem = { Icon: LucideIcon; label: string; href: string; visible: string[]; id?: string };
export type MenuSection = { title: string; items: MenuItem[] };
export const menuSections: MenuSection[];
export const STUDENT_TEMPORARILY_HIDDEN: ReadonlySet<string>;
export function visibleItems(section: MenuSection, role: string | null): MenuItem[];
export function isItemActive(href: string, pathname: string): boolean;
export function findActiveSectionTitle(pathname: string, role: string | null): string | null;
```

---

## 6. Part B — Collapsible groups

### 6.1 Pure helpers (`sidebarNav.ts`)

```ts
import { matchPath } from "react-router-dom";

// Same rule NavLink uses: segment-aware prefix match, with "/dashboard" exact.
export function isItemActive(href: string, pathname: string): boolean {
  return matchPath({ path: href, end: href === "/dashboard" }, pathname) !== null;
}

// Items this role actually sees: role-gated, minus the student temporary hides.
export function visibleItems(section: MenuSection, role: string | null): MenuItem[] {
  return section.items.filter(
    (item) => role && item.visible.includes(role) && !(role === "student" && STUDENT_TEMPORARILY_HIDDEN.has(item.label)),
  );
}

// The titled group containing the current route, among items this role can see.
export function findActiveSectionTitle(pathname: string, role: string | null): string | null {
  const section = menuSections.find(
    (s) => s.title && visibleItems(s, role).some((i) => isItemActive(i.href, pathname)),
  );
  return section?.title ?? null;
}
```

Using `matchPath` rather than `startsWith` keeps group matching identical to `NavLink`'s, including the case where one item's `href` is a path-segment prefix of another's.

### 6.2 State and effect (inside `Menu`)

```ts
const SIDEBAR_PERSIST_PAGE = "sidebar";
const { pathname } = useLocation();

const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
  const initial: Record<string, boolean> = {};
  for (const section of menuSections) {
    if (!section.title) continue;
    const persisted = getPersistedFilter(SIDEBAR_PERSIST_PAGE, section.title);
    initial[section.title] = persisted === "" ? true : persisted === "1"; // default: open
  }
  return initial;
});

const toggleGroup = (title: string) => {
  const next = !openGroups[title];
  setOpenGroups((prev) => ({ ...prev, [title]: next }));
  setPersistedFilter(SIDEBAR_PERSIST_PAGE, title, next ? "1" : "0");
};

// One-time nudge on navigation (or role change): open the group containing
// the current route. Not a render-time override, so a user can still collapse it.
useEffect(() => {
  const title = findActiveSectionTitle(pathname, role);
  if (!title) return;
  setOpenGroups((prev) => (prev[title] ? prev : { ...prev, [title]: true }));
  setPersistedFilter(SIDEBAR_PERSIST_PAGE, title, "1");
}, [pathname, role]);
```

- The updaters are pure (no storage writes inside `setState`), so React's StrictMode double-invocation is harmless. Storage writes happen in the event handler and the effect.
- The effect reads no state, so no `eslint-disable` is needed. It writes `"1"` on every navigation within an open group; that is idempotent and cheap.

### 6.3 Render changes

Header becomes a heading containing a toggle button (text mode only); the item list is wrapped in a container that stays in the DOM and is hidden by the `hidden` attribute rather than unmounted, so `aria-controls` always points at a real element. The icon-only branch (`collapsed`) bypasses group state entirely.

```tsx
const slug = section.title.toLowerCase();
const open = collapsed || !section.title || openGroups[section.title];

{section.title && !collapsed && (
  <h2 className="mt-4 mb-1">
    <button
      type="button"
      onClick={() => toggleGroup(section.title)}
      aria-expanded={openGroups[section.title]}
      aria-controls={`sidebar-group-${slug}`}
      className={`flex w-full items-center justify-between px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-400 ${mobile ? "min-h-11" : ""}`}
    >
      {section.title}
      <ChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-150 ${openGroups[section.title] ? "" : "-rotate-90"}`} />
    </button>
  </h2>
)}
{section.title && collapsed && <div className="my-2 border-t border-slate-200 dark:border-slate-800" />}

<div id={`sidebar-group-${slug}`} hidden={!open} className="flex flex-col gap-0.5">
  {/* visibleItems(section, role).map(...NavLink — unchanged) */}
</div>
```

`ChevronDown` joins the `lucide-react` imports. The untitled Home section is always open (`!section.title`). The `hideForStudent` helper and the inline `visible.includes(role)` filter in `Menu.tsx` are replaced by `visibleItems(section, role)`; the "no visible items → render nothing" return is unchanged. Start Tour (student-hidden) and the profile-incomplete dot are untouched.

---

## 7. Firestore / Rules

No changes: purely client-side UI. No new reads, writes or rules.

---

## 8. Testing Considerations

- Standing gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`.
- **Unit (`src/lib/__tests__/sidebarNav.test.ts`):**
  - `isItemActive`: `/dashboard` is exact (not active on `/dashboard/list/students`); a segment-prefix match is active for a child route (`/dashboard/list/assignments/abc` for `/dashboard/list/assignments`); a mere string prefix is **not** active (`/dashboard/list/students-archive` for `/dashboard/list/students`); trailing slash tolerated.
  - Membership snapshot: the final group order and the item labels in each group match §5.1.
  - Moved items are unchanged: for each relocated item, `href`, `visible` and `id` equal their previous values (a table of expected values, so a typo is caught).
  - `visibleItems`: a student gets no Exams/Report Cards/Progress Reports/Disciplinary Action; a student's REPORTS group is empty and ATTENDANCE is `[My Attendance]`; a teacher's ADMINISTRATION is `[Import Data]`; an `institution_admin` gets all six ADMINISTRATION items; an unknown or `null` role gets nothing.
  - `findActiveSectionTitle`: returns the right group for a route in each group; returns `null` for a student visiting a hidden item's URL (`/dashboard/list/exams`), so no hidden group is opened.
- **New Playwright spec `e2e/13-sidebar.spec.ts`** (uses the existing helpers and QA institution; one login per role to respect auth throttling):
  - Desktop, `institution_admin`: every group starts open; collapsing a group hides its links and sets `aria-expanded="false"`; a reload keeps it collapsed; signing out and back in resets everything to open; navigating directly to a route inside a collapsed group re-opens it, and collapsing it again then sticks (no immediate re-open).
  - Icon-only mode with a group collapsed: every icon (including that group's) is still present.
  - Grouping: Report Cards under REPORTS; Registrations, Audit Log and Rebuild Summaries under ADMINISTRATION; Rubrics under TIMETABLE.
  - Mobile viewport: the drawer shows the headers with 44px-high toggles; collapsing a group in the drawer works and persists across closing and re-opening the drawer.
  - Student: no REPORTS header (all its items are hidden); ATTENDANCE shows My Attendance only.
- **Regression:** specs 09 and 12 (which open pages through sidebar links) still pass — group state is cleared on login, so every group starts open; spec 12's `toHaveCount(0)` checks on hidden items still hold (role queries ignore `hidden` content, and hidden-for-role items are not rendered at all).
- Manual: the user-guide wording and screenshots (if any) match the new group names.

---

## 9. Implementation Order

1. Extract data to `src/lib/sidebarNav.ts` with **no behaviour change** (same grouping, same output); `Menu.tsx` imports it. Run the standing gate and spec 12.
2. Apply the regrouping (§5.1) — pure data, independently shippable and visually checkable. Add the membership and visibility unit tests.
3. Add `isItemActive` / `visibleItems` / `findActiveSectionTitle` with their unit tests.
4. `openGroups` state, `toggleGroup` and persistence (§6.2, without the effect); verify toggle-and-persist by hand.
5. The auto-expand effect.
6. Render changes (§6.3), then the Playwright spec `13-sidebar.spec.ts`.
7. `USER_GUIDE.md` edits (§10).

---

## 10. Documentation updates (part of this change)

`docs/guides/USER_GUIDE.md`:

- The sentence listing the groups: add **REPORTS** and **ADMINISTRATION** (order: PEOPLE, CURRICULUM, TIMETABLE, OUTCOMES, REPORTS, ATTENDANCE, ADMINISTRATION, OTHER).
- The sentence "On smaller screens the sidebar collapses to icon-only view": replace with the mobile behaviour (a drawer opened from the menu button in the header) and mention that groups can be collapsed or expanded by clicking a group heading.
- Every "(under **OUTCOMES**)" step that points at a moved item becomes "(under **REPORTS**)": Report Card Comments, Report Cards and Progress Reports. Results and Feedback stay under OUTCOMES.
- Search the guide for each other moved item (Registrations, Academic Calendar, Backfill Classes, Import Data, Rebuild Summaries, Audit Log) and for its "under …" phrase; any that name ATTENDANCE, PEOPLE or OUTCOMES change to ADMINISTRATION.
- `docs/guides/DEMO_TESTING_GUIDE.md` needs no change today (its one sidebar mention names a role, not a group); re-check if its wording changes.

Also update the now-superseded placement note in `STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md` only if it is quoted as current guidance; a one-line "superseded" pointer is enough.

---

## 11. Explicitly Out of Scope

- **Accordion-style toggling** — independent toggling only.
- **Respecting group state in icon-only mode** — ignored by design (also covers tours).
- **Native `<details>`/`<summary>`** — React state instead.
- **Persisting across tabs or sessions** — state is per tab; a new tab starts fully open. (Per-user `localStorage` is possible later.)
- **Opening/closing animation** — the chevron rotates; the list itself does not animate.
- **Renaming or re-organizing any other group** (PEOPLE, CURRICULUM, TIMETABLE, OUTCOMES, ATTENDANCE and OTHER stay as listed in §5.1) and **moving Grade Tracking** — not requested.
- **Removing the unused `tour-sidebar-nav-*` ids** — kept for future tour steps.
