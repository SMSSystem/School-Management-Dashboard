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
