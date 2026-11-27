# Schedule Page Redesign: Spec

> **Status:** spec only, nothing built (2026-11-27). Owner decisions D1-D8 below. Built from the live SMS Demo (v1.0.4) walked as all five roles and from a read of the real Schedule code.

## 1. Context

The real Schedule page (`src/scenes/(dashboard)/schedule/index.tsx`, 374 lines) lists timetable slots in one column per weekday (Mon–Sat), with a Term dropdown for staff, a child `<select>` for parents, an admin-only "Delegate Schedule Access" panel and FormModal add/edit/delete for anyone with `canGenerateSchedule`. It has no dates, no week navigation, no holidays and no "today". On phones it uses `MobileSchedule.tsx` (a Mon–Sat day strip + agenda).

The SMS Demo (`https://sms-demo.solutions.genr83d.com/dashboard/schedule`, source `sms-demo-interactive/src/features/schedule/SchedulePage.tsx` + `src/selectors/timetable.ts`, live v1.0.4, walked as all five roles on 2026-11-27) shows a **dated week**: a title line ("Grade 5A · Nov 23 to Nov 27"), ‹ › week arrows with a range label, a **Today** button (disabled on the current week), a **Week | Day** segmented control, **day chips** (weekday, date, class-day dot; selected chip filled) in Day view, **child chips** for parents ("Showing: Jordan | Maya"), and **Show [A class | A teacher] + [name]** dropdowns for admin and senior teacher. Lessons are tinted cards (subject in the subject colour, teacher or class, room); the lesson on now is ringed; today's column is tinted; holidays/breaks are named; a footer counts "N lessons this week". Phones get the Day view only. State lives in the URL (`?by=&id=&week=&view=&day=`).

Goal: rebuild the real page to that look and behaviour on the real data, keeping today's slot editing (restyled). The demo's "Add lesson" button/dialog waits for the future **Lessons** feature.

## 2. Decisions (owner, 2026-11-27)

| # | Decision |
|---|---|
| D1 | Page keeps the name **Schedule**. Naming rule: **Timetable** = the recurring weekly pattern (the `timetable_slots` data, the sidebar section TIMETABLE, any future pattern editor); **Schedule** = that pattern laid on real dates (this page). |
| D2 | Regular teacher sees **only their own** week, no dropdowns. BACKLOG: investigate "own + a class dropdown limited to the classes they teach". |
| D3 | Keep today's slot editing and the Delegate panel, **restyled** (no permission or data change). |
| D4 | Grid rows come from **slot start–end times** found in the shown week (no periods). Bell schedule → BACKLOG. |
| D5 | **The week decides the term**: no Term dropdown; the page reads the slots of the term(s) whose dates overlap the shown week. CurrentTermContext stays for other pages; Schedule stops writing it. |
| D6 | **No rules change here**; slot-read tightening (ISSUES #50 / S-09) → BACKLOG as its own security PR. |
| D7 | Dashboards keep react-big-calendar for now; replacing them with the new grid → BACKLOG. |
| D8 | "Add lesson" button + dialog deferred to the Lessons feature → BACKLOG. |

## 3. Terminology (to put in the spec and in code comments)

- **Timetable slot**: one `timetable_slots` doc: a class, subject, teacher, `days[]` (`mon`–`sat`), `startTime` "HH:mm", `duration` minutes, optional `room`, tied to one `termId`. A recurring rule, never a dated record.
- **Lesson (on the page)**: one slot on one date. Computed at render time, never stored (as SCHEDULE_GENERATION_PLAN already says).
- **Lessons feature (future)**: not Lesson Notes (`lessonNotes`) and not Lesson Plans. The old `/dashboard/list/lessons` placeholder and `institutions/{id}/lessons` rules stay untouched until that feature is scoped.

## 4. Behaviour by role

| Role | Opens on | Controls | Edit |
|---|---|---|---|
| institution_admin | first class (by name) | Show: A class / A teacher + name; week arrows; Today; Week/Day | Add slot, edit/delete on lesson click, Delegate panel |
| spectator | as admin | as admin | none (read-only) |
| senior_teacher | own teaching week (by teacher) | as admin | Add/edit/delete only with `canGenerateSchedule` (unchanged) |
| regular_teacher | own teaching week | arrows, Today, Week/Day | none |
| student | own class (multi-class via `ClassMembership`, subjects filtered as today) | arrows, Today, Week/Day | none |
| parent | first child's class | child chips (only when >1 child), arrows, Today, Week/Day | none |
| super_admin | empty state ("Choose an institution") | none | none |

- **Phones (< md)**: Day view only, with day chips (as the demo and today's MobileSchedule). Day defaults to today, else the week's first school day.
- **Week opens on** this week, or the next school week on a weekend/break (demo `defaultScheduleWeek`). **Today** returns there; disabled when already there.
- **Days shown**: Mon–Fri, plus Saturday only when the institution's `schoolWeekDays` includes 6 or any loaded slot uses `sat`.
- **Non-school days** (outside every term, a `nonSchoolDays` entry, or not in `schoolWeekDays`): column greyed with the reason ("Christmas break", holiday name); no lessons drawn.
- **Now**: the lesson running now gets a ring; today's column/chip tinted.
- **Empty states**: no class (student), no linked child (parent), no term covering the week, nothing scheduled.
- URL state: `?by=class|teacher&id=&week=YYYY-MM-DD&view=week|day&day=YYYY-MM-DD`, validated (unknown ids fall back to the role's default; students/parents/regular teachers ignore `by/id`).

## 5. Architecture

Split the 374-line page so every file stays well under 600 lines and logic is pure and testable.

```
src/scenes/(dashboard)/schedule/
  index.tsx                 page shell: role → choices, URL state, layout (≈150 lines)
  ScheduleToolbar.tsx       arrows, range label, Today, Week/Day, Show/name selects, child chips
  ScheduleWeekGrid.tsx      table: time rows × day columns (sticky header + time column)
  ScheduleDayList.tsx       one day's lessons as a list
  ScheduleDayChips.tsx      day chips (replaces MobileSchedule's strip)
  LessonCard.tsx            tinted card; button when editable
  DelegateAccessPanel.tsx   today's panel, moved out unchanged in behaviour
src/lib/schedule/
  weekSchedule.ts           pure: buildWeek(slots, weekStart, calendar, view) → days, rows, cells, counts
  scheduleChoices.ts        pure: role + people → {canChoose, initial, classes, teachers}
  scheduleUrl.ts            pure: parse/serialise and validate URL state
src/hooks/
  useWeekTimetable.ts       slots for (by, id, termIds) via React Query
```

Reuse: `lib/scheduleDay.ts` (`DAY_KEYS`, `slotEnd`, `formatTimeRange`, `subjectColor`, `slotStatuses`), `lib/nextClass.ts` (`isoDate`, `classDatesInRange` rules), `lib/attendanceCalendar.ts` `isSchoolDay`, `useInstitutionAcademicCalendar` (terms, `nonSchoolDays`, `schoolWeekDays`), `useInstitutionTerms`, `useLinkedChildren`, `useInstitutionClasses`, `useTeachingStaff`, `useMediaQuery(MOBILE_QUERY)`, the parent dashboard's child-pill pattern, `NamedSelect`, lucide `ChevronLeft/Right`, FormModal `timetable_slot` and `TimetableSlotForm` unchanged.

**Rows (D4):** collect each lesson's `startTime`/`slotEnd` in the shown week; rows are the distinct start times sorted, labelled "8:30 AM – 9:15 AM" (end = the most common end for that start). A lesson sits in its start row. Two lessons of the same class at the same time (a data clash) both render in the cell, stacked, with a "Clash" tag (no silent hiding).

**Term per week (D5):** `termsCovering(weekStart, weekEnd, allTerms)`; a date belongs to the term whose `startDate..endDate` contains it. `useWeekTimetable` queries `where(by==id) + where('termId','in', termIds)` (≤ 30 ids; normally 1–2). In custom calendar mode the time blocks are the terms.

**Data and caching (free tier):**
- Replace the staff `onSnapshot` on the whole term with `getDocs` through React Query, key `['scheduleSlots', institutionId, by, id, termIds]`, `staleTime: REFERENCE_STALE_MS`, persisted like `nextClassSlots`. Week arrows within the same term cost **0 reads**; one read set per class/teacher/term viewed. Today an admin's live listener reads every slot of the term (e.g. ~300 docs per open) and keeps a socket; the new page reads one class's or teacher's slots (~25–40).
- Students/parents keep `useClassTimetable` (same `nextClassSlots` key as the dashboard, so 0 extra reads) and gain an optional `termIds` argument for weeks in another term.
- After a slot add/edit/delete, invalidate `['scheduleSlots', institutionId]` and `['nextClassSlots', institutionId]` (fixes today's up-to-10-minute stale gap noted in the analysis).
- Spark impact: reads go **down**; no writes added; no Functions.

## 6. Firebase

- **Rules:** no change (D6). Slot CRUD rules (`firestore.rules` ~2347–2368) and the `users.canGenerateSchedule` admin-only write stay as they are.
- **Collections:** none new. `timetable_slots` shape unchanged.
- **Indexes:** none. All queries are equality + `in` on two fields, already used by BigCalender without a composite index.
- **Later (BACKLOG):** read tightening per role, which would need a rules `get()` per query and rules tests.

## 7. Tour

Add a page tour `schedule`, started by a "Take a tour" button (same pattern as Gradebook/Rubrics: `collapseForTour(); startNextStep('schedule')`, completion via `toursCompleted.schedule`). Steps built by `scheduleTourSteps(role)` (pattern of `rubricTourSteps`), targeting stable `#tour-schedule-*` ids:

1. `#tour-schedule-heading`: whose week this is.
2. `#tour-schedule-week-nav`: arrows and Today.
3. `#tour-schedule-view`: Week/Day (skipped on phones).
4. `#tour-schedule-choose` (admin, spectator, senior) or `#tour-schedule-children` (parent with >1 child).
5. `#tour-schedule-grid`: lessons, now ring, non-school days.
6. `#tour-schedule-add` + `#tour-schedule-delegate` (admin), `#tour-schedule-add` (senior with access).

Add a `scheduleTourTargets.test.ts` like the existing `*TourTargets*` tests. Do not auto-start (ROLES_WITH_REAL_TOURS unchanged).

## 8. Gotchas

- **Tests pin source text**: `sharedUsersReads.test.ts` (users-read call and invalidation in the schedule page; keep both lines in whichever file holds the Delegate panel and update the import path), `spectatorEditorPages.test.ts` (`role === 'institution_admin' && (` regex), `classPopulationWriters.test.ts` (schedule page as a `canGenerateSchedule` writer). Update the pins to the new file, never weaken them; compare with `flat()`.
- **e2e**: `12-student-mobile` expects a day-strip group with 6 buttons, "<Day> (today)" and an h2 per day; `02-custom-mode-pickers` expects a Term select on Schedule (remove that assertion, keep it for Gradebook); `14-audit-activity` expects "Delegate Schedule Access" and "(Grant|Revoke) schedule access for X" (keep those names); `10-teacher-department` heading "Schedule".
- **Sunday**: `todayKey` maps Sunday to Monday; the week view must use real dates instead.
- **Term edges**: a week can span two terms or a term end; cells outside every term are non-school.
- **Students in several classes** (`ClassMembership`): keep `takesSubject` filtering.
- **CurrentTermContext**: Schedule stops writing it, so the other four pages no longer follow a Schedule change; say so in the CHANGELOG.
- **Lesson colour**: use `subjectColor` (real app) rather than the demo's hash, so dashboard and page match; check contrast in dark mode.
- **No drag and drop** (keyboard and phone users), as in the demo.
- **600-line limit and Fallow**: new files small; run `npm run quality`.
- **Time zone**: dates as local ISO strings (`isoDate`), never `toISOString().slice(0,10)`.
- **Super admin** (`institutionId === '*'`): empty state, no queries.

## 9. Work plan (one PR, minor version)

1. Pure modules + unit tests: `weekSchedule.ts`, `scheduleChoices.ts`, `scheduleUrl.ts` (rows, Saturday rule, term per date, non-school reasons, now, clashes, role choices, URL validation).
2. `useWeekTimetable` + optional `termIds` on `useClassTimetable`; invalidation after FormModal saves/deletes of `timetable_slot`.
3. Components (section 5) and the new `index.tsx`; delete `MobileSchedule.tsx` once its tests move.
4. Restyle editing: "Add slot" (not "Add lesson") button for `canGenerateSchedule`; lesson card opens the existing update FormModal with a delete action; Delegate panel as a collapsible card.
5. Tour (section 7) + target test.
6. Update pinned tests and e2e specs (section 8); add an e2e for week arrows, Today, Day chips, parent chips, admin dropdowns.
7. Docs (section 10). Then `npm test`, `npm run lint`, `npm run quality`, `npm run build`, spot e2e specs only.

## 10. Documentation

- **New:** this spec (`docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md`).
- **BACKLOG.md** entries: Lessons feature + "Add lesson" button/dialog (D8); regular teacher class dropdown (D2); bell schedule / periods (D4); slot read-rule tightening (D6, under Security); dashboards to the new grid and dropping react-big-calendar (D7).
- **Update at build time:** `SCHEDULE_GENERATION_PLAN.md` (pointer to this spec; Phase 2 status), `ISSUES_AND_GAPS.md` (#50 note, mobile schedule items, admin "my schedule" item at :790), `guides/USER_GUIDE.md` §2.12/3.3/4.2/5.2, `guides/SCHEDULE_VERIFICATION_GUIDE.md`, `README.md` schedule lines, `CHANGELOG.md` Unreleased bullets, `docs/ROLE`/sidebar docs if they describe the page.
- **In-code comments** (future-proof): the Timetable vs Schedule rule at the top of `weekSchedule.ts`; why rows come from start times (no periods) and where a bell schedule would plug in; why the week decides the term; the cache keys and that week navigation is read-free; who may choose whose week (`scheduleChoices.ts`); that "Add slot" is the interim editor until the Lessons feature.

## 11. Verification

- Unit: `npm test` (new pure-module tests, updated pins, `scheduleDay`/`nextClass` tests unchanged).
- Lint/quality/build: `npm run lint`, `npm run quality`, `npm run build`.
- e2e (only these, production quota): `12-student-mobile`, `02-custom-mode-pickers`, `14-audit-activity`, `10-teacher-department`, the new schedule spec.
- Manual, per role on the Blue Mountain demo at 375/768/1440: arrows, Today, Week/Day, day chips, parent chips, admin/senior dropdowns, editing as admin and as senior with/without access, spectator read-only, a holiday week, a term boundary week, dark mode. Check reads in the Firebase usage view before/after.
