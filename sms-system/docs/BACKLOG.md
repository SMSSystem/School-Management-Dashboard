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

- **What:** a workflow for `npm test` and `npm run lint`. They run by hand today.
- **Why it waits:** it uses metered Actions minutes while the repository is private, and it could not block a merge on GitHub Free.
- **Starts when:** a broken test or lint error reaches `main`, or more people start contributing.

### Review exports only tests use

- **What:** about 210 exports are used only by tests, listed by `npm run quality:prod`. Decide which are deliberate test seams and which are code that only a test keeps alive.
- **Why it waits:** most are expected to be deliberate, so the review is unlikely to find much, and each one needs a judgement.
- **Starts when:** the periodic review has time, or the number grows noticeably.

## Offline and local data

The first offline release keeps a teacher's unsent work safe when the connection drops after they have signed in. The entries below go further and are deferred.

### Full cold start offline

- **What:** open the app and work with no internet at all, including after closing the tab or restarting the device. It needs a service worker (PWA), a sign-in that survives closing the tab, and class lists stored on the device.
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

### "You're leaving" dialog for outside links

- **What:** a dialog before following two kinds of link: teacher-entered links on lesson notes, and the changelog link in Settings. The public footer links, email and phone links, and downloads are exempt.
- **Draft wording:** title "You're leaving [site name]", where the site name is the one in the top bar. Body "This link goes to a site outside [site name]. Make sure you trust it before continuing." Then the full address in a code-style box, and the buttons "Continue to site" and "Go back", with focus on Go back. Lesson-note links add "A teacher added this link. We don't check what's on it." No warning about scams, because that wouldn't be true here.
- **Limits:** middle-click and Ctrl-click can get past a click handler. The address shown should make lookalike sites easier to spot, but it doesn't check them.
- **Why it waits:** there are only two kinds of link, and lesson-note links already accept only `http` and `https`, so the risk is modest.
- **Starts when:** the owner schedules it, or with the move of confirm dialogs to the top layer below.

### Move confirm dialogs to the top layer

- **What:** change the shared `DialogShell` to a native `<dialog>` opened with `showModal()`, so every `ConfirmDialog`, the unsaved-changes prompt and the "You're leaving" dialog sit above everything and make the page behind them inert. `FormModal` stays as it is for now.
- **Why it waits:** toasts and the connection banner sit above dialogs today and would end up behind an open one, so each flow that shows a toast while a dialog is open needs checking. Tests that pin dialog source need updating with the same checks.
- **Starts when:** work starts on the "You're leaving" dialog or the refresh confirmation.
