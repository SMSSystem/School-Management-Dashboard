# Backlog

Work the owner has chosen to do later. Each entry says what it is, why it waits and what would start it. Known limits and bugs stay in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

Move an entry out when the work starts or the owner drops it. Keep school data out of this file, because the repository is sometimes public.

## Code quality

### Full shared parser for the admin scripts

- **What:** move argument parsing and Firestore setup into `scripts/adminCli.mjs`, across about 20 scripts. It holds only usage printing and the key check today. `rename-institution.mjs` and `remove-orphan-auth-accounts.mjs` also still have their own key check, and `prune-stale-subject-enrollments.mjs` and `recount-class-populations.mjs` their own `--institution` check, because tests pin that text.
- **Why it waits:** it means rewriting safety tests such as "a dry run unless `--live`" and changing scripts that write to production. Flags are also part of the scripts' interface, so behaviour must not change.
- **Starts when:** a parsing bug has to be fixed in several scripts, or several new scripts are about to be written.

### Merge remaining app clones

- **What:** consolidate duplicated code not already marked as kept in `ignoredClones`, starting with `FeedbackCommentForm` and `ResultForm`. `npx fallow dupes` lists the candidates.
- **Why it waits:** merging can change behaviour, so each pair needs its own decision.
- **Starts when:** a change has to be made in both copies of a pair.

### Repo-wide format

- **What:** run `npm run format` across the repository in its own pull request.
- **Why it waits:** a trial changed 1,165 files, failed 289 tests that pin source text and put 12 files over the 600-line limit. The built bundle also differed, and that was not checked in a browser.
- **Needs:** guard-test repairs that keep each check, file splits, a browser check, and a refresh of `ignoredClones`.
- **Starts when:** mixed formatting costs more than the pull request would, such as when noisy diffs regularly slow reviews.

### Run tests and lint in CI

- **What:** a workflow that runs `npm test` and `npm run lint` on every pull request. Today they run by hand, and once a week inside the Dependency security workflow, which tests only its own updates.
- **Why it waits:** nobody has needed it yet. Cost is no longer a reason: the repository is public, so Actions minutes are free. To stop a failing pull request from merging, it would also need to be a required status check in a ruleset on `main`.
- **Starts when:** a broken test or lint error reaches `main`, or more people start contributing.

### Review exports only tests use

- **What:** about 210 exports are used only by tests, listed by `npm run quality:prod`. Decide which are deliberate test seams and which are code that only a test keeps alive.
- **Why it waits:** most are expected to be deliberate, so the review is unlikely to find much, and each one needs a judgement.
- **Starts when:** the periodic review has time, or the number grows noticeably.

### Remove the glob override for workbox-build

- **What:** `package.json` `overrides` pins `glob` to 14.0.5 under `workbox-build` (added with slice E). `workbox-build` 7.4.1 asks for `glob` ^11, which has a moderate advisory (GHSA-3g3m-2fjr-6pw4, fixed in 14.0.2). It's a build tool only, never shipped. Remove the override, then check `npm ls glob` and `npm audit`.
- **Why it waits:** no `workbox-build` release asks for a fixed `glob` yet.
- **Starts when:** a `workbox-build` (or `vite-plugin-pwa`) release depends on `glob` 14.0.2 or later.

## Offline and local data

The first offline release keeps a teacher's unsent work safe when the connection drops after they have signed in. The entries below go further and are deferred.

### Full cold start offline

- **What:** open the app and work with no internet at all, including after closing the tab or restarting the device. The service worker (slice E) already keeps the app's code, so the app itself loads offline; what's missing is a sign-in that survives closing the tab, and class lists stored on the device.
- **Why it waits:** it reverses two privacy decisions: sign-in ending when the tab closes, and no personal data left in the browser (issue #51). Class lists on a shared computer need their own protection, and iOS limits need testing on real devices.
- **Starts when:** evidence from a school shows teachers often begin the day with no connection. Build it together with trusted device mode.

### Trusted device mode

- **What:** an opt-in mode for personal devices only, as the safe route to cold start. A person marks a device as theirs, which allows a longer sign-in and class lists on that device. It needs a way to see and remove trusted devices, including remotely for a lost device, and a shorter idle limit or a local unlock.
- **Why it waits:** it is only useful with cold start. It also needs a decision on who may trust a device and how a shared computer is kept out, because nothing in a browser proves who owns a device.
- **Starts when:** cold start offline is approved.

### Reviewable late sync for exam answers

- **What:** exam answers that reach the server after the deadline are stored separately and flagged, and a teacher accepts or rejects them. The rules today refuse any save or submit after the deadline plus 60 seconds. It needs new rules, a review screen, and limits so that late answers cannot change a graded attempt.
- **Why it waits:** it weakens the deadline, which the exam design relies on. The owner needs to set a fairness policy, because device clocks cannot prove when an answer was written and a student could stay offline on purpose.
- **Starts when:** real exams are lost to connection failures and the existing local answer backup is not enough.

### SQLite for everything

- **What:** investigate SQLite (WebAssembly with the browser's private file system) as the single local engine, holding both the queue of unsent work and local read data, rather than IndexedDB for the queue and SQLite for reads.
- **Why it waits:** the queue does not need SQL, and IndexedDB needs no download, worker or WebAssembly. SQLite adds about 130 to 180 KB gzipped plus a `.wasm` file (an estimate), and one-connection limits that are awkward with per-tab sign-in. Its browser persistence is also still maturing, which matters for the only copy of unsent work.
- **Starts when:** the SQLite test build passes its checks and shows that one engine is simpler than two.

## Navigation and refreshing

### Refresh button in the top bar

- **What:** a button in `TopHeader` that re-reads what the current page is using and redraws the page, without reloading the browser tab. A short message then offers "Refreshed. Still looks wrong? Reload the app" for a full reload. It has a 30-second cooldown, is off while offline and during a running exam, and asks first when there is unsaved work.
- **Needs:** many pages read outside the shared query cache, so the page has to be remounted, using a refresh key around the routes in `App.tsx`. Paged lists need their own handling (`useCursorPages` warns against re-reading a single page). Live listeners are already current and `gradeTrackingCache` is large, so both are skipped.
- **Why it waits:** every press costs reads from the shared daily 50,000. One press on Students reads one document per person in the school, so a 1,000-person school gets about 50 presses a day across everyone. The most visible reason for it, new accounts missing from lists, is already fixed (issue #82).
- **Starts when:** the owner schedules it, or people often report stale pages.

### Confirm before refreshing with unsaved work

- **What:** ask before a refresh only when there is unsaved work. Our own dialog can cover the new refresh button and the keyboard shortcuts (F5, Ctrl+R, Cmd+R) on a desktop.
- **Limits:** browsers don't allow a custom dialog for their own reload button, closing the tab or typing an address, so those get the browser's generic box, and iOS Safari reportedly shows nothing. Work must still be saved as it goes rather than rely on a prompt.
- **Needs:** the existing unsaved-changes guard (`NavigationGuardProvider`) has only two callers, so it must be added to pages that lack it, such as the gradebook, `FormModal` forms, profile and create-user. Forced sign-outs and app-driven reloads must never be stopped, so they need a shared bypass (`sessionPurge.ts`, `chunkReload.ts`, `PageErrorBoundary.tsx`).
- **Why it waits:** it is most useful alongside the offline outbox, which changes what counts as unsaved. Pages that join the guard also each need testing.
- **Starts when:** the outbox's first phase starts, or lost edits are reported sooner.

### Move confirm dialogs to the top layer

- **What:** change the shared `DialogShell` to a native `<dialog>` opened with `showModal()`, so every `ConfirmDialog`, the unsaved-changes prompt and the "You're leaving" dialog (`components/LeavingDialog.tsx`) sit above everything and make the page behind them inert. `FormModal` stays as it is for now.
- **Why it waits:** toasts sit above dialogs today (the connection banner has sat below them since v2.57.0) and would end up behind an open one, so each flow that shows a toast while a dialog is open needs checking. Tests that pin dialog source need updating with the same checks.
- **Starts when:** next, as its own pull request. The owner kept it out of the "You're leaving" dialog work (v2.63.0), which is built on today's `DialogShell`.

### Fallback when the "You're leaving" dialog fails to load

- **What:** `OutsideLink` loads the "You're leaving" dialog only when a checked link is clicked (since v2.64.0, to keep Firebase off public pages). If that download fails, for example offline or just after a deploy, the page's error screen shows instead. Catch the failure and open the link directly, as an unchecked link does.
- **Why it waits:** only lesson-note links and Settings use the check, and neither works offline, so a failure is rare.
- **Starts when:** together with "Move confirm dialogs to the top layer", which changes the same dialog, or when someone reports the error screen after clicking a link.

## Accessibility

### Reduced motion across the whole app

- **What:** check every transition and animation outside the landing page (modals, tours, toasts, loaders, sidebar) so each runs only when the device allows motion (`prefers-reduced-motion: no-preference`, or Tailwind's `motion-safe:`), add a final rule that stops anything left, and add an end-to-end check with reduced motion on. The landing page already does all of this (`src/landing/landing.css`).
- **Why it waits:** the landing page came first; the app has many more screens, and each change needs its own check and review.
- **Starts when:** the accessibility lint (`eslint-plugin-jsx-a11y-x`, now on `src/landing/**` only) is widened to the rest of the app, or someone reports trouble with motion.

### Feature list tab stop on desktop

- **What:** on the landing page the feature list (`src/landing/components/FeatureStory.tsx`) is always focusable (`tabIndex={0}`) so touch-phone users can scroll it sideways with the arrow keys. On desktop it does not scroll, so it is an extra, empty tab stop. Make it focusable only in the swipe layout.
- **Why it waits:** it does not block anyone, and the landing page is not live yet.
- **Starts when:** before the landing page goes live (it is on the launch checklist in `docs/miscellaneous-specs/LANDING_PAGE_SPEC.md`).

## Schedule and timetable

### Personal timetables to print, download and share

- **What:** a timetable for each student, built from their class or classes and only the subjects they take, laid out as a printable weekly grid (days across, times down, rooms and teachers). Everyone can print it or save it as a PDF or an image for the timetables they may view: students their own, parents each child's, teachers their own teaching week (senior teachers any they may view), and admins and spectators any class's or teacher's, possibly a whole class or year at once.
- **Why it waits:** the Schedule page redesign (`docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md`) comes first, and its week builder (`lib/schedule/weekSchedule.ts`) is what the export would draw from. It also needs decisions on the paper layout (A4 portrait or landscape, one week or the term's pattern), on whether exports carry the school's logo, and on bulk export cost (a whole year means many reads at once).
- **Needs:** reuse the app's existing PDF tooling (`@react-pdf/renderer`, as the attendance, report card and rubric PDFs do) loaded on demand so it stays out of the main bundle; an image export (PNG) and a print stylesheet; no new data, since it reads the same `timetable_slots`.
- **Starts when:** the redesign has shipped, or a school asks for printed timetables at the start of a term.

### Automatic timetable generation

- **What:** the system proposes the term's `timetable_slots` itself: it places each class's subjects for the right number of lessons a week, so that no teacher, class or room is booked twice, within the school's days and hours. An admin reviews the proposal, changes what they want and saves it; students' personal timetables then follow from it.
- **Why it waits:** this is a constraint-solving problem (teacher availability, lessons a week per subject, rooms, double lessons, part-time staff), and the app has no periods or bell schedule yet, which a generator would need. Running a solver in the browser is possible but heavy; Cloud Functions are not on the free tier. Saving a whole term at once is a large batch of writes, to be checked against the daily free-tier limit.
- **Needs:** a bell schedule (periods and breaks) per school; each subject's lessons a week per class (subjects already carry a frequency); teacher availability; a review step before anything is saved; and a decision on whether generation replaces or merges with slots already entered.
- **Starts when:** schools say entering slots by hand takes too long, or the bell schedule has been built.

### The Lessons feature, with "Add lesson" on the Schedule

- **What:** a Lessons feature, separate from Lesson Notes and from the planned Lesson Plans, which would own the Schedule's "Add lesson" button and dialog, as the SMS Demo shows them. Until then the Schedule keeps "Add slot", the timetable slot form it already has.
- **Why it waits:** nobody has decided what a lesson is beyond a timetable slot: whether it is a dated record, how it relates to slots, lesson notes and attendance, and who creates it. The old `/dashboard/list/lessons` placeholder and its `lessons` rules stay untouched until then.
- **Needs:** a brainstorm, research and a spec, then the usual build, tests, review, merge and deploy. The Schedule's editor would then switch from "Add slot" to "Add lesson".
- **Starts when:** the Schedule page redesign (`docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md`) has shipped and the owner starts the Lessons brainstorm.

### Class choice on the Schedule for regular teachers

- **What:** let a regular teacher see the timetable of the classes they teach, not only their own teaching week, through a class dropdown limited to those classes.
- **Why it waits:** the redesign gives regular teachers their own week only, like the SMS Demo. Whether the dropdown is worth it, and how to find "the classes they teach" cheaply (subjects' teachers, homeroom, timetable slots), needs looking into.
- **Needs:** a feasibility check of where the taught-classes list comes from and what it costs in reads; then a change to the Schedule's role choices (`lib/schedule/scheduleChoices.ts`) and its tests.
- **Starts when:** the redesign has shipped, or teachers ask to see their classes' full timetables.

### Bell schedule (periods and breaks)

- **What:** a school-wide list of periods and breaks (Period 1 from 8:30 to 9:15, Break, Lunch) that timetable slots snap to, so the Schedule's rows read "Period 1" and breaks show between them, as in the SMS Demo.
- **Why it waits:** today each slot has its own start time and length, and the redesign builds its rows from those times. Periods need a new per-school setting, its rules, a way to move existing slots onto periods, and changes to the slot form.
- **Needs:** a settings document per school and its rules, a migration or a fallback for slots that fit no period, form changes, and an update to the row logic in `lib/schedule/weekSchedule.ts`. Automatic timetable generation also needs it.
- **Starts when:** schools ask for period numbers, or automatic generation is started.

### The dashboards' week calendars on the new Schedule grid

- **What:** replace react-big-calendar on the parent, regular-teacher and senior-teacher dashboards and the teacher detail page with the Schedule's new week grid, then remove the react-big-calendar dependency.
- **Why it waits:** the redesign builds the grid for the Schedule page first. Moving four pages and their tests at the same time would make that change much larger.
- **Needs:** the grid used in a compact form on each page, their tests updated, and a bundle check once the dependency is gone.
- **Starts when:** the redesign has shipped.

## Security

### Tighten access to large-file storage and its usage counters

- **What:** large lesson-note and assignment files are kept in the Realtime Database, next to counters that track how much space each school uses. Their access rules need to check which school a person belongs to, and the Realtime Database's rules can't read that from Firestore. The options:
  1. copy a small membership marker into the Realtime Database at sign-in, and check it in the rules;
  2. move the usage counters behind a server, so browsers can't write them;
  3. tie each file to its school when it's saved, and check who uploaded it.
- **Needs:** a choice between the options, Realtime Database rules tests, and `firebase deploy --only database`. Probably a patch, or a minor if the upload flow changes. The details are in the internal security notes.
- **Why it waits:** the right option depends on how sign-in and uploads should change, and it hasn't been designed yet.
- **Starts when:** the owner picks an option.

### Limit who can read timetable slots

- **What:** today every signed-in member of a school can read all of its timetable slots, and the app limits students and parents to their own classes only in the browser (ISSUES_AND_GAPS #50). Tighten the rules so students read their own class's slots, parents their children's classes, and regular teachers their own.
- **Why it waits:** it was kept out of the Schedule page redesign to keep that change free of rules. Each tightened read needs a rules `get()` per query, which costs a read, and the app's queries must match the rules exactly.
- **Needs:** rules changes, rules tests, checks that every slot query (Schedule, dashboards, next-class card, grade tracking) still passes, and `firebase deploy --only firestore:rules`. Probably a patch.
- **Starts when:** the redesign has shipped, or a security review asks for it.
