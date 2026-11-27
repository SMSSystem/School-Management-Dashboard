# Schedule Page Redesign: Spec

> **Status:** spec only, nothing built. First written 2026-11-27 and revised the same day (section 12). The owner's decisions are D1–D15 (section 2).
> **Base:** app v2.64.0. Where this spec says "today", it means the app as of that version.
> **Model:** the SMS Demo, demo version v1.0.4, live at `https://sms-demo.solutions.genr83d.com/dashboard/schedule`. It was walked as all five roles on 2026-11-27. The demo's source code is private.
> **Scope of this document:** what the page does and why, for every role. A step-by-step build plan is kept separately and privately; this spec holds every decision.

## 1. Context

The real Schedule page (`src/scenes/(dashboard)/schedule/index.tsx`, 374 lines) lists timetable slots in one column per weekday (Mon–Sat). It has:

- a Term dropdown for staff;
- a child `<select>` for parents;
- an admin-only "Delegate Schedule Access" panel;
- FormModal add, edit and delete for anyone with `canGenerateSchedule`.

It has no dates, no week navigation, no holidays and no "today". On phones it uses `MobileSchedule.tsx`, a Mon–Sat day strip and an agenda.

The SMS Demo shows a **dated week**:

- a title line ("Grade 5A · Nov 23 to Nov 27");
- ‹ › week arrows with a range label;
- a **Today** button, disabled on the current week;
- a **Week | Day** segmented control;
- **day chips** in Day view (weekday, date, class-day dot; the selected chip filled);
- **child chips** for parents ("Showing: Jordan | Maya");
- **Show [A class | A teacher] + [name]** dropdowns for the admin and the senior teacher.

Lessons are tinted cards: the subject in the subject colour, then the teacher or class, then the room. The lesson on now is ringed, today's column is tinted, holidays and breaks are named, and a footer counts "N lessons this week". Phones get the Day view only, and the page's state lives in the URL.

**Goal:** rebuild the real page to that look and behaviour on the real data, keeping today's slot editing (restyled). The demo's "Add lesson" button and dialog wait for the future **Lessons** feature.

## 2. Decisions (owner, 2026-11-27)

| # | Decision |
|---|---|
| D1 | The page keeps the name **Schedule**. **Timetable** means the recurring weekly pattern: the `timetable_slots` data, the sidebar section TIMETABLE, any future pattern editor. **Schedule** means that pattern laid on real dates, which is this page. |
| D2 | A regular teacher sees **only their own** week, with no dropdowns. A class dropdown limited to the classes they teach is in BACKLOG. |
| D3 | Today's slot editing and the Delegate panel stay, **restyled**, with no permission or data change. The button is "Add slot". |
| D4 | Grid rows come from the **slot start times** used in the shown week; there are no periods. A bell schedule is in BACKLOG. |
| D5 | **The week decides the term.** There is no Term dropdown, and the page reads the slots of the term or terms covering the shown week. `CurrentTermContext` stays for other pages, but Schedule stops writing it. |
| D6 | **No change to rules, collections or indexes.** Tightening who can read slots (ISSUES #50 / S-09) is in BACKLOG (Security). |
| D7 | Dashboards keep react-big-calendar for now. Moving them to the new grid is in BACKLOG. |
| D8 | The "Add lesson" button and dialog wait for the Lessons feature (BACKLOG). |
| D9 | The work ships as **three pull requests** (section 9). |
| D10 | The **"Clash" tag is for staff only**: admin, spectator, senior and regular teachers. Students and parents see both lessons, with no tag. |
| D11 | **All the extra behaviour is in scope:** holidays and breaks named, the lesson on now ringed, today tinted, the weekly lesson count, page state in the URL, clashes shown, Saturday only when used, and the cache refreshed after edits. |
| D12 | **Personal timetables** with PDF, image and print export, and **automatic timetable generation**, are BACKLOG entries, not part of this work. |
| D13 | A **senior teacher's "A teacher" list** comes from the teacher ids and names stored on subjects (`teacherIds` / `teacherNames`). The users rules let a teacher read only students, plus their own department's teachers, so the full staff list isn't readable to them. This needs no rules change and no extra reads. Admin and spectator use the users list. |
| D14 | **The week arrows stay within the active academic year** (academic mode) or the active time blocks (custom mode): the calendar data loaded covers only those dates. At an edge the arrow is disabled and a note says the timetable isn't available. |
| D15 | **A student, or a parent's child, sees one merged personal week** across all their classes, limited to the subjects they take, through `useClassTimetable`. |

## 3. Terminology (also for code comments)

- **Timetable slot:** one `timetable_slots` document. It holds a class, a subject, a teacher, `days[]` (`mon`–`sat`), `startTime` "HH:mm", `duration` in minutes, an optional `room`, and one `termId`. It is a recurring rule, never a dated record.
- **Lesson (on the page):** one slot on one date. It is computed when the page draws, never stored, as SCHEDULE_GENERATION_PLAN already says.
- **View:** whose week is shown:
  - a **class's**;
  - a **teacher's**;
  - a **student's** merged week (D15), used for students and parents only.
- **Lessons feature (future):** not Lesson Notes (`lessonNotes`) and not Lesson Plans. The old `/dashboard/list/lessons` placeholder and the `institutions/{id}/lessons` rules stay untouched until that feature is scoped.

## 4. Behaviour by role

| Role | Opens on | Controls | Can edit |
|---|---|---|---|
| institution_admin | the first class in natural order ("Grade 2A" before "Grade 10A") | Show: A class / A teacher (from the users list) + name; arrows; Today; Week/Day | Add slot; edit or delete by clicking a lesson; the Delegate panel |
| spectator | as admin | as admin | nothing (read-only) |
| senior_teacher | their own teaching week | Show: A class / A teacher (**the teacher list comes from subjects**, D13); arrows; Today; Week/Day | only with `canGenerateSchedule`, and only slots whose teacher is in **their own department** (the limit the slot form already applies) |
| regular_teacher | their own teaching week | arrows; Today; Week/Day | nothing |
| student | their merged week, titled "Your timetable" (D15) | arrows; Today; Week/Day | nothing |
| parent | the first child's merged week, titled "Jordan's timetable" | child chips (only with more than one child); arrows; Today; Week/Day | nothing |
| super_admin | an empty state ("Choose an institution"); no queries | none | nothing |

**Navigation and views**

- **Phones (below the `md` breakpoint):** Day view only, with day chips. The day is today, otherwise the week's first school day.
- **Opening week:** this week, or the next school week on a weekend or a break. **Today** returns there, and is disabled when already there.
- **Bounds (D14):** the arrows stop at the first and last weeks of the active year or blocks. At an edge, a note reads, for example, "The timetable after 2 July isn't available here."

**Days shown**

- Mon–Fri, plus Saturday only when the school's `schoolWeekDays` includes 6 or a loaded slot uses `sat`.
  - Academic mode uses the active year's days.
  - Custom mode uses the union across the active blocks' years.
- **Non-school days:** a day not in `schoolWeekDays`, a `nonSchoolDays` entry, or a date between two terms. The column is greyed with the reason (the holiday's name, "Mid-term break", "Term break"), and no lessons are drawn.

**Markers**

- **Now:** the lesson running now gets a ring, and today's column and chip are tinted.
- **Day chips:** two separate states.
  - Today's chip has "(today)" in its accessible name.
  - The selected chip has `aria-pressed="true"`.
  - On first load they are the same chip, which is what the e2e test checks.
- **Clashes (D10):**
  - Two lessons clash when their times overlap on the same date, not only when they start together.
  - In a class or student view the class or student is booked twice; in a teacher view the teacher is.
  - Staff see a "Clash" tag on both. Students and parents see both lessons with no tag.

**Scope and state**

- **Student and parent scope:** a student or parent sees only the slots of the student's own classes. In an extra class, they see only the subjects the student takes there. Slots of other classes must never appear. The e2e test checks this and keeps doing so.
- **Empty states:**
  - no class (student);
  - no linked child (parent);
  - no term active ("No term is active, so there is no timetable to show"; no slot query runs);
  - nothing scheduled this week.
- **URL state:**
  - parameters: `?by=class|teacher&id=&week=YYYY-MM-DD&view=week|day&day=YYYY-MM-DD`;
  - each value is checked: unknown ids fall back to the role's default, and `week` is clamped to the bounds;
  - students, parents and regular teachers ignore `by` and `id`, and `by=student` is never taken from the URL;
  - the URL holds only internal ids, never names, and students' and parents' URLs hold no id.

## 5. Architecture

The 374-line page is split so every file stays well under 600 lines and the logic is pure and testable.

```
src/scenes/(dashboard)/schedule/
  index.tsx                 page shell: role → choices, URL state, layout
  ScheduleToolbar.tsx       arrows (disabled at the bounds), range label, Today, edge note, Week/Day, Show/name selects
  ScheduleChildChips.tsx    a parent's child chips
  ScheduleWeekGrid.tsx      table: time rows × day columns (sticky header and time column)
  ScheduleDayList.tsx       one day's lessons as a list
  ScheduleDayChips.tsx      day chips (replaces MobileSchedule's strip)
  LessonCard.tsx            tinted card; a button only when the viewer may edit that slot
  DelegateAccessPanel.tsx   today's panel, moved out unchanged in behaviour
src/lib/schedule/
  weekSchedule.ts           pure: buildWeek(slots, weekStart, calendar, now) → days, rows, cells, counts, edges
  scheduleChoices.ts        pure: role + people → {canChoose, initial, classes, teachers}
  scheduleUrl.ts            pure: parse, check and clamp the URL state
src/hooks/
  useWeekTimetable.ts       a class's or teacher's slots for the week's terms
```

**Types:**

- `ScheduleOf = { by: 'class' | 'teacher' | 'student'; id }`.
- `CalendarInput = { terms, nonSchool, schoolWeekDays, bounds }`.
- `termsCovering(weekStart, calendar)` returns the ids of the terms whose dates overlap the week. In custom mode the time blocks are the terms.

**Rows (D4):**

- One row per distinct start time drawn that week, sorted, labelled "8:30 AM – 9:15 AM".
- A row's end is the most common lesson end; on a tie, the earlier.
- A lesson with another end shows its own time on its card.
- *Recommended, to confirm when built:* a thin "Free time" row where 15 minutes or more pass between rows. No row is called "Break" or "Lunch" until there is a bell schedule.

**Choices:**

- Classes come from `useInstitutionClasses`, in natural order (`lib/sortByName.ts` / `lib/classNames.ts`).
- Teachers come from `useTeachingStaff` for admin and spectator (users list; admins only). For senior teachers they come from `useAllInstitutionSubjects`' `teacherIds`/`teacherNames`, deduplicated by id (D13). A teacher who teaches no subject is missing from that list, which is accepted and recorded in ISSUES_AND_GAPS.

**Reuse:**

- `lib/scheduleDay.ts`: `DAY_KEYS`, `slotEnd`, `formatTimeRange`, `subjectColor` (takes the subject name), `slotStatuses`;
- `lib/nextClass.ts`: `isoDate`, and the date rules of `classDatesInRange`;
- `lib/attendanceCalendar.ts`: `isSchoolDay`;
- `useInstitutionAcademicCalendar`: terms, `nonSchoolDays`, `schoolWeekDays`, active blocks;
- `useClassTimetable`, with a new optional term list for the student view;
- `useLinkedChildren`, `useMediaQuery(MOBILE_QUERY)`;
- the parent dashboard's child-chip pattern;
- `NamedSelect`, lucide `ChevronLeft`/`ChevronRight`;
- FormModal `timetable_slot` and `TimetableSlotForm`, unchanged.

**Data and caching (free tier):**

- **Staff views:** the live `onSnapshot` on the whole term is replaced by one `getDocs` through React Query: `where(classId|teacherId == id)` with `where(termId in termIds)`.
  - Key: `['scheduleSlots', institutionId, by, id, termIds]`, `staleTime: REFERENCE_STALE_MS` (10 min).
  - The cache stays **in memory only**. It is not added to the persisted `sessionStorage` cache, because slots carry teacher names and the compliance table describes that cache as holding no personal data. Staff rarely reload, so persisting would save little.
- **Week arrows within the same term cost no reads.** Each class, teacher or term viewed costs one query.
- **Estimates** (from the Blue Mountain demo seed; to be measured): today an admin's listener reads about 300 slot documents per visit and keeps a connection open; the new page reads about 25–40.
- **Students and parents** keep `useClassTimetable`, with the same `nextClassSlots` key as the dashboard, so the page costs no extra reads. A week in another term inside the bounds costs one query per class.
- **After a slot add, edit or delete,** `['scheduleSlots', institutionId]` and `['nextClassSlots', institutionId]` are invalidated. This fixes today's up-to-10-minute delay before an edit shows on students' and parents' dashboards.
- **Overall:** reads go down; no writes are added; no Cloud Functions.

## 6. Firebase

- **Rules:** no change (D6). The slot rules (`firestore.rules` ~2347–2368) and the admin-only write of `users.canGenerateSchedule` stay as they are.
- **Collections:** none new; the `timetable_slots` shape is unchanged.
- **Indexes:** none. Every query is "equals" on one field plus `in` on `termId`, which BigCalender already runs without a composite index.
- **The senior teacher's teacher list** comes from subjects, which are already cached reference data, so it costs no reads (D13).
- **Later (BACKLOG):** tightening reads per role, which would need a rules `get()` per query and rules tests.

## 7. Tour

A page tour `schedule`, started by a "Take a tour" button, in the same pattern as Gradebook and Rubrics: `collapseForTour(); startNextStep('schedule')`. Finishing or skipping sets `toursCompleted.schedule`. It never starts by itself (`ROLES_WITH_REAL_TOURS` unchanged).

The steps come from `scheduleTourSteps(role)`, from **the role only**, as `rubricTourSteps` does, because `useTourSteps` builds every tour from the role alone.

- **Sometimes-missing targets** (no editing access, one child, a phone) stay mounted, empty and hidden.
- A step whose element is hidden is skipped with the check in `tourValidation.ts`. If a step can't be skipped, it falls back to the heading and explains when the control appears.

| Step | Target | Roles |
|---|---|---|
| 1 | `#tour-schedule-heading`: whose week this is | all |
| 2 | `#tour-schedule-week-nav`: arrows, Today, the edge of the year | all |
| 3 | `#tour-schedule-view`: Week/Day (skipped on phones) | all |
| 4 | `#tour-schedule-choose`: class or teacher | admin, spectator, senior teacher |
| 4 | `#tour-schedule-children` (skipped with one child) | parent |
| 5 | `#tour-schedule-grid`: lessons, the now ring, non-school days; for staff, the Clash tag | all |
| 6 | `#tour-schedule-add` (skipped without access) | admin, senior teacher |
| 7 | `#tour-schedule-delegate` | admin |

A `scheduleTourTargets.test.ts`, like the existing `*TourTargets*` tests, checks every target id and the role filter.

## 8. Gotchas

**Pinned tests.** Some tests pin source text. Move each pin to the new file; never weaken it, and compare with `flat()`.

- `sharedUsersReads.test.ts`: the users-read call and its invalidation. These move to `DelegateAccessPanel.tsx`.
- `spectatorEditorPages.test.ts`: the `role === 'institution_admin' && (` regex.
- `classPopulationWriters.test.ts`: the `canGenerateSchedule` writer.

**e2e tests:**

- `12-student-mobile` today checks:
  - a "Day of the week" group of 6 buttons;
  - `"<Day> (today)"` with `aria-pressed`;
  - an h2 per day;
  - no Term select for students;
  - that no subject from another class's slots appears.

  Update the button count (5, or 6 with Saturday) and the heading checks to the new markup. Keep the "(today)" name, `aria-pressed` and the no-other-class check.
- `02-custom-mode-pickers` checks a Term select on Schedule. Remove that for Schedule; check a week in each time block instead; keep it for Gradebook.
- `14-audit-activity` checks "Delegate Schedule Access" and "(Grant|Revoke) schedule access for X". Keep those names.
- `10-teacher-department` checks the heading "Schedule".

**Data limits:**

- **Users rules:** teachers can't read the staff list (D13).
- **Calendar scope:** only the active year's or blocks' terms and non-school days are loaded (D14).

**Dates and terms:**

- **Sunday:** `todayKey` maps Sunday to Monday. The week view uses real dates instead.
- **Term edges:** a week can span two terms or a term's end.
- **Time zone:** dates are local ISO strings (`isoDate`), never `toISOString().slice(0,10)`.

**Page behaviour:**

- **`CurrentTermContext`:** Schedule stops writing it, so the other four pages no longer follow a term chosen on Schedule. Say so in the CHANGELOG.
- **Lesson colour:** `subjectColor`, so the dashboard and the page match. Check contrast in dark mode.
- **No drag and drop**, for keyboard and phone users.
- **Size:** keep new files small, and run `npm run quality`.
- **Super admin** (`institutionId === '*'`): an empty state, with no queries.

**Unchanged by this work:**

- **Offline:** the Schedule page's code isn't kept on the device, so offline it shows "This page needs the internet".
- **Mobile app:** the Flutter app reads the same `timetable_slots`, so there is no data change. Its handoff notes get the naming rule (D1) and the clash behaviour.
- **Compliance:** `nextClassSlots`, already in the persisted cache, holds teacher names, while the compliance table says that cache holds no personal data. That wording needs a separate look.

## 9. Delivery: three pull requests (D9)

| PR | Contents | Suggested version |
|---|---|---|
| A | `weekSchedule.ts`, `scheduleChoices.ts`, `scheduleUrl.ts` with unit tests; `useWeekTimetable`; the optional term list on `useClassTimetable`; the FormModal cache refresh; doc pointers | patch (the cache refresh is visible) |
| B | The new page and its components; editing restyled with the department limit; the Delegate panel moved; `MobileSchedule` and the Term picker removed; pins and e2e updated, plus a new e2e for the week page; docs | minor |
| C | The tour, its button, the target test, docs | minor |

Before each pull request, follow AGENTS.md:

1. Find the next SMS number.
2. Ask the owner about the version.
3. Write CHANGELOG bullets under Unreleased.
4. Run `npm run version:bump`.
5. Run `npm run format:files` on the changed files only, then re-check the pins.

Each pull request runs `npm test`, `npm run lint` and `npm run quality`; B also runs `npm run build`, because it deletes files.

## 10. Documentation

- **This spec.**
- **BACKLOG.md:** all entries are written.
  - In "Schedule and timetable":
    - personal timetables to print, download and share;
    - automatic timetable generation;
    - the Lessons feature with "Add lesson";
    - class choice for regular teachers;
    - bell schedule;
    - the dashboards' calendars on the new grid.
  - In Security: limiting who can read timetable slots.
- **Update when built:**
  - `SCHEDULE_GENERATION_PLAN.md` (a pointer to this spec; the Phase 2 status);
  - `ISSUES_AND_GAPS.md`:
    - the #50 note;
    - the mobile schedule items;
    - the admin "my schedule" item;
    - D13's limit (teachers with no subject);
  - `FIRESTORE_READ_CACHING_CALL_SITE_INVENTORY.md` (it gives `nextClassSlots` as 5 min, which is 10; add the new query);
  - `BIGCALENDAR_AND_SKELETON_SPEC.md` (Schedule no longer shares the dashboards' calendar);
  - `guides/USER_GUIDE.md` §2.12, 3.3, 4.2 and 5.2;
  - `guides/SCHEDULE_VERIFICATION_GUIDE.md`;
  - `project-overview/ROLE_PRIVILEGE_ANALYSIS.md` and `sms-role-specification-v1.md` (their Schedule rows);
  - `README.md` (the schedule lines);
  - `CHANGELOG.md` (Unreleased bullets);
  - the mobile app's handoff notes;
  - this spec's status.
- **In-code comments**, written to stay true:
  - the Timetable vs Schedule rule, at the top of `weekSchedule.ts`;
  - why rows come from start times, and where a bell schedule would plug in;
  - why the week decides the term, and why it is bounded;
  - the student scope rule;
  - the cache keys, why `scheduleSlots` stays in memory, and that week navigation is read-free;
  - who may choose whose week, and where the senior teacher's list comes from (`scheduleChoices.ts`);
  - the department limit on editing;
  - that "Add slot" is the interim editor until the Lessons feature.

## 11. Verification

- **Unit:** `npm test` (the new pure-module tests, the moved pins; `scheduleDay` and `nextClass` tests unchanged).
- **Lint, quality and build:** `npm run lint`, `npm run quality`, `npm run build`.
- **e2e** (only these, because they use the production quota): `12-student-mobile`, `02-custom-mode-pickers`, `14-audit-activity`, `10-teacher-department`, `01-academic-mode-regression`, and the new schedule spec.
- **By hand,** for each role on the Blue Mountain demo at 375, 768 and 1440 px, in light and dark mode:
  - arrows, Today, Week and Day;
  - the day chips (today and selected told apart);
  - the parent's two children;
  - a student in several classes, who sees no other class's subjects;
  - the admin's and senior teacher's dropdowns, including another department's teacher in the senior list;
  - a holiday week, a term-boundary week, and the first and last weeks (arrows disabled, note shown);
  - a partial-overlap clash (staff see the tag, the student doesn't);
  - Saturday shown when one slot uses it;
  - editing as admin, as a senior teacher with and without access (and on another department's slot), and as spectator (no controls);
  - after an edit, the student's dashboard updates at once.
- **Reads:** compare Firestore reads in the usage view before and after.

## 12. Revision history

**2026-11-27, first version.** Decisions D1–D8, built from the live demo and a read of the code.

**2026-11-27, revised after a review.**

- **New decisions:**
  - D9: three pull requests;
  - D10: the Clash tag for staff only;
  - D11: the full list of extras;
  - D12: personal timetables and generation in BACKLOG;
  - D13: the senior teacher's list from subjects, because of the users rules;
  - D14: the week range bounded to the active year or blocks, because of what the calendar loads;
  - D15: the merged student week.
- **New rules:**
  - student and parent scope, tested;
  - clashes by overlapping times;
  - the row-end tie-break and gap rows;
  - Saturday per calendar mode;
  - natural class order;
  - the department limit on editing;
  - day-chip states;
  - the no-term empty state.
- **Changes:**
  - `scheduleSlots` stays in memory only (privacy);
  - the tour is built from the role only, with handling for missing targets;
  - the e2e notes corrected;
  - delivery is three pull requests;
  - the BACKLOG list marked as written;
  - the missing docs added;
  - read figures marked as estimates;
  - private source paths replaced by the live demo URL.
