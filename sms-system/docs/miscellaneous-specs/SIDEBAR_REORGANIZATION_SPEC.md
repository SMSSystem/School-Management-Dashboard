# Sidebar Regrouping + Collapsible Sections — Implementation Plan

> **Status:** Implemented on branch `multiple-enhancements` (2026-10-03), all nine steps of §9, in nine commits; not yet merged. Unit-tested (`sidebarNav.test.ts`, including the per-role table of §5.4) and verified live by `e2e/16-sidebar.spec.ts` (desktop, teacher, student, parent and a 390px phone drawer; 5 passed). The one skipped case, the amber dot on a collapsed OTHER header, skips when the QA institution's profile is complete, so that behaviour is covered by the `groupNeedsAttention` unit test only. Built as specified, with two small departures: the item list inside a group has no `gap-0.5` (items have no gap today, and the look is unchanged), and the group state and auto-expand effect live in `Menu.tsx` rather than a hook. Spec written before code, per this repo's standing convention. Earlier revision notes: re-baselined against `main` at `fc280c3` (PR #71) after the mobile drawer shell (PR #67), the Rubrics item (PR #64) and the temporary student sidebar hides.
> **Feature:** Splits the sidebar's "OUTCOMES" group into "OUTCOMES" and a new "REPORTS" group; moves six navigation items into a new "ADMINISTRATION" group; and makes every titled group with two or more visible items independently collapsible and expandable, persisted per tab session, in both the desktop sidebar and the mobile drawer.
> **Route:** No new routes. Files: `src/components/Menu.tsx`, the layout (`src/scenes/(dashboard)/index.tsx`, for the Start Tour drawer fix), a new `src/lib/sidebarNav.ts` (menu data and pure helpers, so they can be unit-tested), `src/lib/__tests__/sidebarNav.test.ts`, a new `e2e/16-sidebar.spec.ts`, and `docs/guides/USER_GUIDE.md`.
> **Primary roles:** Every role sees the sidebar. No visibility rules change: each moved item keeps its own `visible` array. What each of the six roles sees is in §5.4; what the phone drawer shows is in §5.5.
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

Confirmed against `main` at `fc280c3` (after PR #71); `Menu.tsx` itself last changed in `3c69872` (PR #67). Line numbers drift; blocks and functions are named instead. Since the first revision, PRs #68 to #71 and the follow-up work added Classes, Subjects and Terms **detail pages** (`/dashboard/list/classes/:id`, `/subjects/:id`, `/terms/:id`): none adds a sidebar item, and `isItemActive`'s segment-prefix match already highlights the list item for them.

- **`Menu.tsx` is the sidebar's only definition.** No other source file references a group by its title. Regrouping is contained there — but **documentation does**: `docs/guides/USER_GUIDE.md` lists the groups in one sentence ("Navigation is grouped into sections (e.g., PEOPLE, CURRICULUM, TIMETABLE, OUTCOMES, ATTENDANCE, OTHER)") and says "(under **OUTCOMES**)" in a dozen steps. The same guide also says "On smaller screens the sidebar collapses to icon-only view", which PR #67 made untrue (it is now a drawer). See §10.
- **Current group contents (what the spec must reflect):** TIMETABLE now includes **Rubrics** (PR #64). OUTCOMES holds Gradebook, Results, Feedback, Report Card Comments, Report Cards, Progress Reports, Disciplinary Action, Report Builder, Grade Tracking and Import Data. ATTENDANCE holds Academic Calendar, General/Summary/Subject Register, My Attendance, Child Attendance, Backfill Classes, Rebuild Summaries and Audit Log. PEOPLE ends with Registrations.
- **Student temporary hides.** `STUDENT_TEMPORARILY_HIDDEN` (Exams, Report Cards, Progress Reports, Disciplinary Action; Exams was shown again once students could sit online exams) and the student-only hiding of Start Tour are UI-only and live in `Menu.tsx`. A section whose items are all hidden for a role already renders nothing (`visibleItems.length === 0 → null`). The new data module must carry the hide set with it (§5.3).
- **No tour step targets an individual sidebar nav item.** Every nav item has a `tour-sidebar-nav-*` id, but the only sidebar-related ids elsewhere are `tour-sidebar` (the `<aside>`) and `tour-sidebar-collapse-toggle`; the step selectors in `useTourSteps.ts` target page elements only. Regrouping carries no tour-breakage risk. The `tour-sidebar-nav-*` ids are currently unused attributes; they are **kept** (§4).
- **Tours collapse the whole sidebar.** `collapseForTour` / `TourSidebarRestorer` put the sidebar into icon-only mode for the duration of a tour. Because per-group state is ignored in icon-only mode (§4), tours are unaffected.
- **`filterPersistence.ts` is the sessionStorage utility used for per-session UI state** (Gradebook/Attendance filters, the app-wide current term), cleared on logout by `clearAllPersistedFilters()` (called from `AuthContext`'s `signOut`). It is documented for per-page filters, so this is a small stretch of its purpose; it is still reused deliberately for the existing prefix and logout sweep. `getPersistedFilter` returns `''` for a missing key and `setPersistedFilter` removes a key for a falsy value; this plan stores `"1"`/`"0"`, both non-empty, so a deliberately closed group is never mistaken for "never set". `sessionStorage` is **per tab**, so a new tab starts with every group open.
- **Route matching.** `NavLink` marks an item active by **path-segment** prefix (and `end` for `/dashboard`). A raw `pathname.startsWith(href)` is not equivalent: `/dashboard/list/students-archive` would "match" `/dashboard/list/students`. The helper must therefore use `matchPath` (§6.1) so group-level matching and `NavLink`'s own highlight can't disagree.
- **Collapsible-panel precedent:** `schedule/index.tsx`'s "Delegate Schedule Access" panel (a `useState` boolean, a clickable header, a conditionally shown body). This plan follows the same React-state approach rather than the native `<details>` element, which is harder to style to the sidebar's rounded hover and active visual language.
- **Registrations' placement in PEOPLE was a documented earlier choice** (`STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md`: "prospective people, closer kin to that section than to OUTCOMES"). This plan reverses it knowingly.
- **"Import Data" is visible to teachers**, unlike the other items moving into ADMINISTRATION (admin-only). A teacher will see an ADMINISTRATION header over a single item. The section loop already handles partly visible sections; this is the one case where the group's label feels broad for what that role sees. **Decision: the name ADMINISTRATION stays** (a role-neutral rename such as TOOLS was offered and declined); because it is a one-item group for teachers it renders as a plain header, not a collapsible one (§6.3).
- **Several groups hold a single visible item for some roles** (§5.4): a teacher's ADMINISTRATION, a senior or regular teacher's CURRICULUM (Classes), a regular teacher's ATTENDANCE (Subject Register), a student's OUTCOMES (Results) and ATTENDANCE (My Attendance), and a parent's ATTENDANCE (Child Attendance). Collapsing one link saves nothing, so those groups are not collapsible (§6.3).
- **An item indicator can be hidden by a collapsed group.** The only item indicator today is the amber "institution profile incomplete" dot on **Institution Profile**, which lives in OTHER. Collapsing OTHER would hide the only prompt to finish setup, so a collapsed group's header carries the dot (§6.3).
- **Mobile Start Tour.** The drawer contains **Start Tour** for every non-student role. It runs `navigate('/dashboard')` then starts the tour, but the layout closes the drawer only when `location.pathname` _changes_; started from `/dashboard` itself, the drawer stays open over the tour. Fixed in §6.4.
- **`Navbar.tsx` is dead code.** `src/components/Navbar.tsx` is imported nowhere (the header is `TopHeader.tsx`); its comment about a Logout button "in Menu.tsx" describes a button that does not exist. Recorded as a follow-up (§11), not changed here.
- **No sidebar tests exist today.** `Menu` has no unit tests and no spec targets grouping. Specs 09, 12 and 13 open pages through sidebar links or sign in repeatedly, so they are the regression canaries (§8).

---

## 3. Design Decisions

| Decision                       | Choice                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New group placement            | REPORTS immediately after OUTCOMES; ADMINISTRATION after ATTENDANCE, before OTHER                                                                                                          | REPORTS is a direct split of OUTCOMES. ADMINISTRATION collects admin housekeeping pulled from several groups and sits just before the catch-all OTHER.                                                                            |
| ADMINISTRATION contents        | Registrations, Academic Calendar, Backfill Classes, Import Data, **Rebuild Summaries, Audit Log**                                                                                          | The four originally requested items plus the two admin-only housekeeping items that were already out of place in ATTENDANCE. **Grade Tracking stays in OUTCOMES** (it is about grading progress, not housekeeping).               |
| Collapse mechanism             | React state                                                                                                                                                                                | Full styling control; consistent with the existing in-repo collapsible panel.                                                                                                                                                     |
| Toggle behaviour               | Independent per group (not accordion)                                                                                                                                                      | Avoids surprise-collapsing a group the user didn't touch.                                                                                                                                                                         |
| Default state                  | All groups open when nothing is persisted                                                                                                                                                  | The sidebar looks exactly as it does today until a user collapses something.                                                                                                                                                      |
| Persistence                    | `sessionStorage` via `filterPersistence.ts`, one key per group title, per tab, cleared on logout                                                                                           | Reuses the existing mechanism and logout sweep (stretching a module documented for per-page filters; see §2).                                                                                                                     |
| Active-route auto-expand       | A group opens (and that state is persisted) the moment navigation lands on one of **its items this role can see**; a one-time nudge on navigation, not a continuous override               | The "one-time nudge" lets a user still collapse the group containing their current page afterwards. Matching only visible items stops a student following a URL to a hidden item from opening a group for something not rendered. |
| Icon-only mode                 | Per-group state is ignored; every icon from every group always shows                                                                                                                       | Icon-only has no header to toggle; honoring closed groups would remove the only way to reach those pages without first expanding the sidebar. Also covers tours.                                                                  |
| Mobile drawer                  | Same collapsible behaviour as desktop, with the header given a 44px tap target                                                                                                             | The drawer is the only navigation on phones; a long, always-open list is a long scroll. State is shared with desktop (same keys) because both render the same `Menu`.                                                             |
| Where the data lives           | `menuSections`, the student hide set, and the pure helpers move to `src/lib/sidebarNav.ts`; `Menu.tsx` keeps the component                                                                 | Lets grouping, role visibility and route matching be unit-tested without rendering. Every item definition moves verbatim.                                                                                                         |
| Header semantics               | `<h2>` containing a `<button>` with `aria-expanded` and `aria-controls` (collapsible groups only)                                                                                          | Keeps the heading structure the sidebar has today while adding the toggle.                                                                                                                                                        |
| Which groups collapse          | Only a group with **two or more items this role can see**; a one-item group renders a plain `<h2>` (no button, no chevron) and is always open                                              | Collapsing a single link saves nothing and adds a control that does nothing useful. Decided in review; affects teachers, students and parents (§5.4).                                                                             |
| Indicator on a collapsed group | The group header shows the amber dot while the group is collapsed and one of its items needs attention (today only Institution Profile, via `profileIncomplete`); the item's own dot stays | Otherwise collapsing OTHER hides the only prompt to finish institution setup.                                                                                                                                                     |
| ADMINISTRATION name            | Unchanged                                                                                                                                                                                  | A teacher sees ADMINISTRATION over Import Data only; accepted rather than renaming the group (declined: TOOLS).                                                                                                                   |
| Start Tour on a phone          | Pressing it also closes the drawer                                                                                                                                                         | The drawer only closed on a pathname change, so on `/dashboard` it stayed open over the tour (§6.4).                                                                                                                              |
| `tour-sidebar-nav-*` ids       | Kept, unchanged                                                                                                                                                                            | No behaviour change; recorded as currently unused by any tour.                                                                                                                                                                    |

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

What each role sees after the regroup, including which groups are collapsible, is in §5.4; the phone drawer is §5.5.

### 5.2 Extraction

Create `src/lib/sidebarNav.ts` containing, moved verbatim: the `MenuItem`/`MenuSection` types, the item data (now as `export const menuSections`, with the regrouping above applied), and `STUDENT_TEMPORARILY_HIDDEN` with its existing "temporary, UI-only" comment. Add the pure helpers in §6.1. `Menu.tsx` imports them and keeps only rendering, the Start Tour button and the state in §6.2. The Lucide icon imports move with the data.

### 5.3 Exports

```ts
export type MenuItem = {
  Icon: LucideIcon;
  label: string;
  href: string;
  visible: string[];
  id?: string;
};
export type MenuSection = { title: string; items: MenuItem[] };
export const menuSections: MenuSection[];
export const STUDENT_TEMPORARILY_HIDDEN: ReadonlySet<string>;
export function visibleItems(
  section: MenuSection,
  role: string | null,
): MenuItem[];
export function isItemActive(href: string, pathname: string): boolean;
export function findActiveSectionTitle(
  pathname: string,
  role: string | null,
): string | null;
export function isGroupCollapsible(
  section: MenuSection,
  role: string | null,
): boolean;
```

### 5.4 What each role sees (and does not see) after the regroup

Computed from `menuItems` by applying §5.1, the `visible` arrays and the student hide set (39 items in total). "Plain" = a one-item group: header with no toggle, always open (§6.3). Every other listed group is collapsible. Home is untitled and always shown.

| Role                  | PEOPLE                                      | CURRICULUM                             | TIMETABLE                                             | OUTCOMES                                                          | REPORTS                                                              | ATTENDANCE                         | ADMINISTRATION                                                                                | OTHER                             |
| --------------------- | ------------------------------------------- | -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| **super_admin**       | Create Account, Teachers, Students, Parents | Subjects, Departments, Classes         | Terms, Schedule, Exams, Assignments                   | Gradebook, Results, Feedback, Disciplinary Action, Grade Tracking | Report Cards, Progress Reports, Report Builder                       | General, Summary, Subject Register | Registrations, Backfill Classes, Import Data, Audit Log                                       | User Profile, Brand Settings      |
| **institution_admin** | Create Account, Teachers, Students, Parents | Subjects, Departments, Houses, Classes | Terms, Schedule, Lessons, Exams, Assignments, Rubrics | Gradebook, Results, Feedback, Disciplinary Action, Grade Tracking | Report Card Comments, Report Cards, Progress Reports, Report Builder | General, Summary, Subject Register | Registrations, Academic Calendar, Backfill Classes, Import Data, Rebuild Summaries, Audit Log | User Profile, Institution Profile |
| **senior_teacher**    | Teachers, Students, Parents                 | _Classes (plain)_                      | Schedule, Lessons, Exams, Assignments, Rubrics        | Gradebook, Results, Feedback, Disciplinary Action                 | Report Cards, Progress Reports, Report Builder                       | General, Summary Register          | _Import Data (plain)_                                                                         | User Profile, Institution Info    |
| **regular_teacher**   | Teachers, Students, Parents                 | _Classes (plain)_                      | Schedule, Lessons, Exams, Assignments, Rubrics        | Gradebook, Results, Feedback, Disciplinary Action                 | Report Cards, Progress Reports                                       | _Subject Register (plain)_         | _Import Data (plain)_                                                                         | User Profile, Institution Info    |
| **student**           | —                                           | —                                      | Schedule, Lessons, Assignments                        | _Results (plain)_                                                 | —                                                                    | _My Attendance (plain)_            | —                                                                                             | User Profile, Institution Info    |
| **parent**            | —                                           | —                                      | Schedule, Lessons, Exams, Assignments                 | Results, Disciplinary Action                                      | Report Cards, Progress Reports                                       | _Child Attendance (plain)_         | —                                                                                             | User Profile, Institution Info    |

Notes:

- **Student:** Report Cards, Progress Reports, Disciplinary Action and Start Tour stay hidden (the temporary, UI-only hide set); Exams is shown, because students sit online exams, so a student has no REPORTS group at all. Those routes still load by URL.
- **Teachers** never see Create Account, Registrations, Subjects, Departments, Houses, Terms, Academic Calendar, Rebuild Summaries, Backfill Classes or Audit Log. A senior teacher has the General and Summary Registers, a regular teacher only the Subject Register.
- **Parent** is the role the first revision did not cover: after the split the parent's OUTCOMES keeps Results and Disciplinary Action, and Report Cards and Progress Reports move to REPORTS.
- **super_admin** sees items whose pages are empty for it (Teachers, Students, Gradebook and similar), because its institution is `*`. That is unchanged and out of scope (§11); the regroup does not alter who sees what.
- **Houses** is `institution_admin` only; **Brand Settings** is `super_admin` only; **Institution Info** shares `/dashboard/institution-profile` with **Institution Profile** but is shown to teachers, students and parents only, so no role ever sees both.

### 5.5 Mobile view (below 768px)

`MOBILE_QUERY` is `(max-width: 767px)`. From 768px up the sidebar is the persistent desktop column.

**Shown on a phone**

- A single off-canvas drawer, opened with the three-line button at the top left of the header and closed by navigating, tapping the backdrop or pressing Esc. It is the same `<aside>` and the same `Menu` as the desktop column (one instance, so element ids are unique).
- Always text mode: icon plus label for every item the role can see (§5.4), with the new group headers. Items have `min-h-11` (44px) tap targets; collapsible headers get the same.
- **Start Tour** at the bottom, for every non-student role (§6.4).
- Collapsible groups behave as on desktop, share the same per-tab state keys, and keep their state when the drawer is closed and re-opened (the `Menu` stays mounted).

**Not shown on a phone**

- The desktop collapse chevron (`mobile` hides it) and the icon-only mode. A product tour's `collapseForTour()` has no visible effect on a phone, because the drawer passes `collapsed && !isMobile`.
- A persistent sidebar column.
- The drawer while closed: it is slid off-screen and `inert`, so it is out of the tab order and the accessibility tree.
- Logout, the theme toggle and the name/role badge are **not in the drawer**; they are in the header. Below 640px the header hides the "Logout" word (icon only) and the name and role badge.

---

## 6. Part B — Collapsible groups

### 6.1 Pure helpers (`sidebarNav.ts`)

```ts
import { matchPath } from "react-router-dom";

// Same rule NavLink uses: segment-aware prefix match, with "/dashboard" exact.
export function isItemActive(href: string, pathname: string): boolean {
  return (
    matchPath({ path: href, end: href === "/dashboard" }, pathname) !== null
  );
}

// Items this role actually sees: role-gated, minus the student temporary hides.
export function visibleItems(
  section: MenuSection,
  role: string | null,
): MenuItem[] {
  return section.items.filter(
    (item) =>
      role &&
      item.visible.includes(role) &&
      !(role === "student" && STUDENT_TEMPORARILY_HIDDEN.has(item.label)),
  );
}

// The titled group containing the current route, among items this role can see.
export function findActiveSectionTitle(
  pathname: string,
  role: string | null,
): string | null {
  const section = menuSections.find(
    (s) =>
      s.title &&
      visibleItems(s, role).some((i) => isItemActive(i.href, pathname)),
  );
  return section?.title ?? null;
}

// A group collapses only when this role sees two or more of its items: toggling a
// single link saves nothing. The untitled Home section never collapses.
export function isGroupCollapsible(
  section: MenuSection,
  role: string | null,
): boolean {
  return !!section.title && visibleItems(section, role).length >= 2;
}

// True when one of the group's visible items is flagged as needing attention (today only
// Institution Profile while the institution profile is incomplete). Lets a COLLAPSED
// group's header carry the indicator its hidden item would have shown.
export function groupNeedsAttention(
  section: MenuSection,
  role: string | null,
  attentionLabels: ReadonlySet<string>,
): boolean {
  return visibleItems(section, role).some((item) =>
    attentionLabels.has(item.label),
  );
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

A **collapsible** group's header becomes a heading containing a toggle button (text mode only); the item list is wrapped in a container that stays in the DOM and is hidden by the `hidden` attribute rather than unmounted, so `aria-controls` always points at a real element. A group that is **not** collapsible (`!isGroupCollapsible`: untitled Home, or a one-item group for this role) keeps today's plain `<h2>` and is always open. The icon-only branch (`collapsed`) bypasses group state entirely.

```tsx
const items = visibleItems(section, role);
const collapsible = isGroupCollapsible(section, role);
const slug = section.title.toLowerCase();
const isOpen = !collapsible || openGroups[section.title];
const open = collapsed || isOpen;
const attention =
  !isOpen && groupNeedsAttention(section, role, attentionLabels); // collapsed group only

{
  section.title && !collapsed && collapsible && (
    <h2 className="mt-4 mb-1">
      <button
        type="button"
        onClick={() => toggleGroup(section.title)}
        aria-expanded={isOpen}
        aria-controls={`sidebar-group-${slug}`}
        className={`flex w-full items-center justify-between px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-400 ${mobile ? "min-h-11" : ""}`}
      >
        <span className="flex items-center gap-1.5">
          {section.title}
          {attention && (
            <span
              aria-label="Needs attention"
              className="h-2 w-2 rounded-full bg-amber-400 shrink-0"
            />
          )}
        </span>
        <ChevronDown
          className={`w-3 h-3 shrink-0 transition-transform duration-150 ${isOpen ? "" : "-rotate-90"}`}
        />
      </button>
    </h2>
  );
}
{
  section.title && !collapsed && !collapsible && (
    <h2 className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600 font-semibold mt-4 mb-1 px-2.5">
      {section.title}
    </h2>
  );
}
{
  section.title && collapsed && (
    <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
  );
}

<div
  id={`sidebar-group-${slug}`}
  hidden={!open}
  className="flex flex-col gap-0.5"
>
  {/* items.map(...NavLink — unchanged) */}
</div>;
```

`attentionLabels` is `new Set(profileIncomplete ? ["Institution Profile"] : [])`, built from the `profileIncomplete` value `Menu` already computes. `ChevronDown` joins the `lucide-react` imports. The `hideForStudent` helper and the inline `visible.includes(role)` filter in `Menu.tsx` are replaced by `visibleItems(section, role)`; the "no visible items → render nothing" return is unchanged. Start Tour (student-hidden) and the item-level profile-incomplete dot are untouched.

**`hidden` and Tailwind.** The container carries the `flex` utility _and_ the `hidden` attribute. That only works because the project is on Tailwind v4, whose reset gives `[hidden]` an `!important` `display: none`; under v3 the `flex` class would win and the group would never hide. A test asserts that a collapsed group's links are not visible (§8), so a Tailwind change cannot break this silently.

### 6.4 Start Tour closes the mobile drawer

`Menu` gains an optional `onNavigate?: () => void` prop; the layout passes `closeDrawer` (already defined there). The Start Tour handler calls `onNavigate?.()` before `navigate('/dashboard')` and `startNextStep(...)`. The layout otherwise closes the drawer only when `location.pathname` or `isMobile` changes, so a tour started from `/dashboard` itself would leave the drawer open over the tour overlay. The layout renders one `Menu` for both layouts and passes `closeDrawer` to it; on desktop `drawerOpen` is already `false`, so calling it changes nothing.

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
  - **Per-role table (§5.4):** for each of the six roles, the visible labels per group equal the §5.4 table exactly (one table-driven test, so a change to any `visible` array or to the grouping shows up as a diff). Includes the **parent** role.
  - `isGroupCollapsible`: true for a group with two or more visible items; false for a one-item group (a teacher's ADMINISTRATION, a regular teacher's ATTENDANCE, a student's OUTCOMES, a parent's ATTENDANCE) and for the untitled Home section; false for a role that sees none.
  - `groupNeedsAttention`: true for OTHER when the attention set holds `Institution Profile` and the role can see that item (`institution_admin`); false for a role that cannot (teachers see Institution Info instead); false with an empty set.
  - `findActiveSectionTitle`: returns the right group for a route in each group; returns `null` for a student visiting a hidden item's URL (`/dashboard/list/exams`), so no hidden group is opened; returns the list's group for a detail route (`/dashboard/list/classes/abc` is in CURRICULUM).
- **New Playwright spec `e2e/16-sidebar.spec.ts`** (13 to 15 are taken; uses the existing helpers and QA institution; one login per role to respect auth throttling and the one-session lock, signing out between roles):
  - Desktop, `institution_admin`: every group starts open; collapsing a group hides its links (the list is not visible, which also proves `hidden` beats `flex`, §6.3) and sets `aria-expanded="false"`; a reload keeps it collapsed; signing out and back in resets everything to open; navigating directly to a route inside a collapsed group re-opens it, and collapsing it again then sticks (no immediate re-open).
  - **Header indicator:** with the institution profile incomplete (or the attention set forced by the test), collapsing OTHER shows the amber dot on its header; expanding it removes the header dot and shows the item's own dot. Skips when the QA institution's profile is complete.
  - Icon-only mode with a group collapsed: every icon (including that group's) is still present.
  - Grouping: Report Cards under REPORTS; Registrations, Audit Log and Rebuild Summaries under ADMINISTRATION; Rubrics under TIMETABLE.
  - **One-item groups (teacher):** a teacher's ADMINISTRATION and CURRICULUM headers have no toggle button and their link stays visible.
  - Mobile viewport: the drawer shows the headers with 44px-high toggles; collapsing a group in the drawer works and persists across closing and re-opening the drawer. **Start Tour** (admin, on `/dashboard`) closes the drawer and starts the tour with the drawer closed.
  - Student: no REPORTS header (all its items are hidden); ATTENDANCE shows My Attendance only, with no toggle.
  - Parent: REPORTS shows Report Cards and Progress Reports; OUTCOMES shows Results and Disciplinary Action.
- **Regression:** specs 09, 12 and 13 (which open pages through sidebar links, or sign in repeatedly) still pass — group state is cleared on login, so every group starts open; spec 12's `toHaveCount(0)` checks on hidden items still hold (role queries ignore `hidden` content, and hidden-for-role items are not rendered at all).
- Manual: the user-guide wording and screenshots (if any) match the new group names.

---

## 9. Implementation Order

1. Extract data to `src/lib/sidebarNav.ts` with **no behaviour change** (same grouping, same output); `Menu.tsx` imports it. Run the standing gate and spec 12.
2. Apply the regrouping (§5.1) — pure data, independently shippable and visually checkable. Add the membership and visibility unit tests.
3. Add `isItemActive` / `visibleItems` / `findActiveSectionTitle` / `isGroupCollapsible` / `groupNeedsAttention` with their unit tests, including the per-role table (§5.4).
4. `openGroups` state, `toggleGroup` and persistence (§6.2, without the effect); verify toggle-and-persist by hand.
5. The auto-expand effect.
6. Render changes (§6.3): collapsible vs plain headers, then the header indicator.
7. Start Tour closes the drawer (§6.4): `onNavigate` on `Menu`, `closeDrawer` from the layout.
8. The Playwright spec `16-sidebar.spec.ts`.
9. `USER_GUIDE.md` edits (§10).

---

## 10. Documentation updates (part of this change)

`docs/guides/USER_GUIDE.md` (line numbers as of this revision; re-find them by text):

- **Line ~93:** "On smaller screens the sidebar collapses to icon-only view" is already false (PR #67) and contradicts the guide's own phone paragraph in the student section (~756). Replace with: on a phone the sidebar is a menu opened from the menu button at the top left of the header; groups with more than one page can be collapsed or expanded by clicking the group heading (state is kept until you close the tab or sign out).
- **Line ~97:** the group list: add **REPORTS** and **ADMINISTRATION** (order: PEOPLE, CURRICULUM, TIMETABLE, OUTCOMES, REPORTS, ATTENDANCE, ADMINISTRATION, OTHER).
- **"(under OUTCOMES)" → "(under REPORTS)"** for Report Card Comments (~424) and Report Cards (~441 admin, ~700 teacher, ~804 student, ~885 parent). Results and Feedback stay under OUTCOMES.
- **ATTENDANCE → ADMINISTRATION** for Academic Calendar (~312), Rebuild Summaries (~523) and Backfill Classes (~533). **Audit Log (~542)** has no "under …" clause today: add "(under **ADMINISTRATION**)".
- Registrations, Report Builder, Progress Reports, Disciplinary Action, Grade Tracking, Import Data have **no step in the guide today**, so there is nothing to retarget (a documentation gap, not part of this change). Rubrics has had its own part of section 2.15 since the rubric uploads.
- The student-section note about hidden items (~758) stays accurate; add that a student has no REPORTS group.
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
- **Renaming ADMINISTRATION** (e.g. to TOOLS, which would read better for a teacher whose only item is Import Data) — offered and declined; the name stays.
- **Follow-ups noticed during review, not changed here:**
  - `src/components/Navbar.tsx` is imported nowhere (the header is `TopHeader.tsx`) and its comment cites a Logout button "in Menu.tsx" that does not exist: dead code to delete in a cleanup.
  - The user guide says **Create User** (~179, 200, 231, 238) but the sidebar item is **Create Account**: fix the guide wording.
  - A `super_admin` sees items whose pages are empty for it (its institution is `*`: Teachers, Students, Gradebook and similar); the regroup keeps who-sees-what as is.
  - `TopHeader`'s menu button points `aria-controls` at `tour-sidebar`, an id named for tours; harmless, but a rename would need the layout and any tour that targets it updated together.
