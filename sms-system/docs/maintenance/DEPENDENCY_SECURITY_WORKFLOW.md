# Dependency security workflow

The full guide to the **Dependency security** GitHub Actions workflow: what it is, how to run and review it, what to do when it fails, and how it works inside.

> **Source of truth:** [VERSIONING.md → Dependency security updates](../VERSIONING.md#dependency-security-updates). Where this guide summarises the same thing (what the workflow does, its rules, the token setup), VERSIONING.md wins if the two ever differ, and this guide is the one to fix.

## Contents

1. [At a glance](#at-a-glance)
2. [The short version](#the-short-version)
3. [Runbook](#runbook)
4. [Incident checklist](#incident-checklist)
5. [Edge cases and outages](#edge-cases-and-outages)
6. [Fixing what the workflow can't](#fixing-what-the-workflow-cant)
7. [How it works](#how-it-works)
8. [Changing it safely](#changing-it-safely)
9. [Files](#files)
10. [Cost](#cost)
11. [Sources](#sources)

## At a glance

- **Why it exists:** Dependabot lists vulnerable packages on the repository's **Security** tab (Security and quality → Dependabot), but nothing fixes them. Dependabot's own security pull requests are switched off: there would be one per package, and the Version check skips Dependabot, so they would merge without the SMS title, version bump and changelog entry the versioning rules require. They would also duplicate this workflow's work.
- **What it does:** it fixes what can be fixed safely and opens **one** pull request for review.
- **What it never does:**
  - merge anything;
  - make a breaking (major) upgrade: it never runs `npm audit fix --force`;
  - touch Firebase, the app's data, or anything outside `sms-system/package.json`, `sms-system/package-lock.json` and `CHANGELOG.md`.

## The short version

Each part below is summarised. The full wording is in VERSIONING.md.

**When it runs.** By hand (Actions → **Dependency security** → **Run workflow**), and every Monday at 06:23 UTC (off the hour, GitHub's busiest time for scheduled runs). A scheduled run can start late, or occasionally not at all, when GitHub is busy ([edge cases](#edge-cases-and-outages)).
Authoritative: [VERSIONING.md → Dependency security updates](../VERSIONING.md#dependency-security-updates).

**What it does.** In `sms-system/`:

1. runs `npm audit fix`, which updates vulnerable packages only within the version ranges in `package.json`;
2. runs the tests, lint, `tsc` and the build;
3. writes Security bullets in `CHANGELOG.md` and bumps the patch version;
4. opens "SMS-<n> | Dependency Security Updates", listing what it fixed and what is left.

Authoritative: [VERSIONING.md → Dependency security updates](../VERSIONING.md#dependency-security-updates).

**The rules.** If a check fails, the pull request is a draft. An open pull request from the `deps/security` branch is updated, never duplicated. It never merges: the owner reviews and merges it like any other. It ships, as a patch.
Authoritative: [VERSIONING.md → Dependency security updates](../VERSIONING.md#dependency-security-updates).

**Setup, once.** Create a fine-grained personal access token for this repository only (Contents and Pull requests: read and write), and save it as the Actions secret `DEPS_PR_TOKEN`. The token is needed because a pull request opened with the built-in token doesn't start the other checks. It's only ever given to a separate job that never runs package code ([why](#why-two-jobs)).
Authoritative: [VERSIONING.md → Dependency security updates](../VERSIONING.md#dependency-security-updates).

## Runbook

### Running it by hand

1. On GitHub, open **Actions**, then **Dependency security** in the left-hand list.
2. Select **Run workflow** → branch `main` → **Run workflow**.
3. Open the run that appears. It takes about 5 to 8 minutes when there is something to fix, and about 1 when there isn't.

Run it by hand after Dependabot reports something new and serious, rather than waiting for Monday.

### Reading a run

The run's **Summary** page shows:

- how many packages had an advisory;
- whether `npm audit fix` changed anything;
- the pull request's description (fixed, still open, checks);
- which pull request it opened or updated.

A green run with "npm audit fix changed nothing" means everything left needs a fix by hand ([below](#fixing-what-the-workflow-cant)).

### Reviewing its pull request

Treat it like any other pull request, with these extra checks:

1. **Read "Fixed" and "Still open".** Anything still open needs a fix by hand, or has no fix yet.
2. **Read the lockfile diff for new packages.** A security fix within range should change the versions of a handful of packages. Look for packages that weren't there before (new `"node_modules/..."` entries): a new dependency arriving in a patch release is the usual sign of a compromised package. Hundreds of changed lines usually means a big shared dependency moved; that's fine if the checks pass, but look twice.
3. **Run the rules tests locally** when `firebase-tools`, `firebase` or any `@firebase/*` package changed: the workflow doesn't run them, since they need the emulator and Java.

   ```powershell
   npm run test:rules
   ```

4. **The end-to-end tests aren't run.** They use the production project's quota. Run a spec only if a change touches something it covers.
5. **Open the Vercel preview,** sign in, and click through a page or two. A broken dependency usually shows at once.
6. **A draft** means a check failed. Open the workflow run, find the red check, and fix it on the branch by hand, or fix the cause and run the workflow again.

### After merging

- **The pull request's author is you** (the token's owner), not a bot. If branch protection ever requires another person's approval, you can't approve it yourself.
- The **Release** workflow tags the new patch version and publishes the GitHub Release, as for any merge.
- Dependabot scans the default branch again when its lockfile changes, and the fixed alerts should close within minutes to hours. If they don't, use **Refresh Dependabot alerts** on the Dependabot page. GitHub's docs describe the re-scan, but don't promise exactly when alerts close after a change not made by Dependabot itself.

## Incident checklist

| Symptom                                                                               | Likely cause                                                                                                                                                                                             | What to do                                                                                                            |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| The run fails at once: "Add the DEPS_PR_TOKEN secret first"                           | The secret is missing, or was renamed                                                                                                                                                                    | Add it ([setup](#the-short-version)), then run again                                                                  |
| The **publish** job fails with 401, 403, "Bad credentials" or "Authentication failed" | The token expired, was revoked, or lacks Contents or Pull requests write. Fine-grained tokens last at most a year, and GitHub revokes one unused for a year                                              | Create a new token with the same permissions, replace the secret, and run again. Put the next expiry in your calendar |
| The **Audit** step is red: "npm audit couldn't produce a report"                      | npm's advisory service is down or slow                                                                                                                                                                   | Check [status.npmjs.org](https://status.npmjs.org), then run again later. Nothing was changed                         |
| `npm ci` fails                                                                        | The npm registry is down, or the lockfile doesn't match `package.json` on `main`                                                                                                                         | Check status.npmjs.org. If npm is up, run `npm ci` locally on `main` to find the mismatch                             |
| No run on a Monday, or it started an hour or more late                                | GitHub Actions was busy or having an incident; scheduled runs can be delayed or dropped at busy times                                                                                                    | Check [githubstatus.com](https://www.githubstatus.com) (Actions), then run it by hand                                 |
| Scheduled runs stopped altogether                                                     | GitHub disables scheduled workflows in a public repository after 60 days with no activity in it                                                                                                          | Actions → Dependency security → **Enable workflow**                                                                   |
| The pull request is a draft                                                           | A check failed after the update                                                                                                                                                                          | Read the run's log; see [Reviewing](#reviewing-its-pull-request), point 6                                             |
| **Version check** fails on its pull request: "version … not above main"               | `main` got a newer version after the run                                                                                                                                                                 | Run the workflow again: it starts from the current `main`, bumps again and updates the same pull request              |
| **Version check** fails: "SMS number already used"                                    | Someone opened another pull request with the same number at about the same time                                                                                                                          | Rename the pull request's title to the next free number (the command in AGENTS.md)                                    |
| Merge conflicts in `CHANGELOG.md` or the package files                                | `main` changed them after the run                                                                                                                                                                        | Run the workflow again: it rebuilds the branch from `main`                                                            |
| "npm audit fix changed nothing", yet Dependabot shows alerts                          | What's left needs a breaking change or has no fix                                                                                                                                                        | [Fix it by hand](#fixing-what-the-workflow-cant), or wait for a release                                               |
| Alerts still open after merging                                                       | Dependabot hasn't scanned again yet                                                                                                                                                                      | Wait, or use **Refresh Dependabot alerts**                                                                            |
| **Upload** or **download** of the `deps-security` artifact fails                      | GitHub's artifact storage or Actions is having trouble                                                                                                                                                   | Check githubstatus.com, then run again. Nothing was pushed                                                            |
| "The upload holds unexpected files" or "Unexpected changes" in the **publish** job    | Something in the **prepare** job wrote files it shouldn't, possibly a compromised package                                                                                                                | **Stop.** Don't rerun until you've read the prepare job's log and the packages it updated. Nothing was pushed         |
| No email about a failed run                                                           | GitHub notifies the user who created the workflow (or last changed its cron line, or re-enabled it) about scheduled runs, and whoever started a manual run, only if their notification settings allow it | GitHub → Settings → Notifications → Actions: choose **Only notify for failed workflows**                              |
| Commits you added to `deps/security` disappeared                                      | The workflow force-pushes that branch on every run                                                                                                                                                       | Don't commit there. Copy the change to your own branch, or merge the pull request first                               |

## Edge cases and outages

**GitHub is down, or Actions is.**

- If Actions can't start runs, a scheduled run is late or skipped. It doesn't catch up on its own, so run it by hand once GitHub is back.
- If GitHub fails partway through a run (for example the push worked but `gh pr create` failed), the `deps/security` branch exists with no pull request. Running the workflow again rebuilds the branch from `main`, force-pushes it, and opens the pull request.
- Nothing is half-merged: the workflow never writes to `main`.

**npm is down.**

- **Registry:** `npm ci` fails and the run is red, with nothing changed.
- **Advisory service only:** `npm audit` returns an error instead of a report. The workflow treats that as a failure (red), never as "nothing to fix".
- If the service fails only for the second audit, after the fix, the run is also red and no pull request is opened.

**The numbers differ from Dependabot's.** Dependabot counts _alerts_; npm counts _packages_. One package can carry several advisories: on 2026-11-21, Dependabot showed 25 alerts and npm 13 packages. Dependabot and npm both use the GitHub Advisory Database, but each refreshes on its own schedule, so a brand-new advisory can show in one a little before the other.

**npm lists packages that aren't vulnerable themselves.** `npm audit` also lists every package that depends on a vulnerable one (`eslint` because of `minimatch`, `firebase` because of `@grpc/grpc-js`). The workflow keeps only packages with an advisory of their own, so the pull request never claims an update that didn't happen.

**npm's suggested fix is sometimes a downgrade.** For `@grpc/grpc-js` inside Firebase, npm's only suggestion is `firebase 9.14.0`, an old major version, which it marks as a breaking change. The workflow never applies breaking changes. It lists the package under "Still open: fix by hand".

**A package installed at two versions** shows both: `body-parser 2.4.0/1.20.9`.

**A partial fix.** The lockfile can change without any package's advisory going away, for example when one of two copies is fixed. The changelog then gets a general bullet: "Updated dependencies within their version ranges to reduce known security issues."

**Two runs at once.** They queue (`concurrency: dependency-security`) and never overlap. The second rebuilds from `main` and updates the same pull request.

**An open pull request already exists.** The workflow updates its branch and description rather than opening another. If a check fails on the rerun, it turns the pull request back into a draft.

**The token's owner** leaves, loses access to the repository, or has their account suspended: the token stops working (401/403), so replace it with someone else's. GitHub also notes that a cron workflow can stop running when the account tied to it is suspended or removed; committing any change to the cron line starts it again.

**Forks.** Scheduled workflows are off in forks by default, and forks don't get the secret.

**Node or npm upgrades** can change `npm audit --json`'s shape. The workflow pins Node 24. If npm changes the format, the tests in `depsSecurityLogic.test.ts` still pass (they use saved reports), but a real run may report odd numbers. Check the first run after a Node upgrade.

**Timeout.** The **prepare** job stops after 30 minutes, **publish** after 10. A normal run takes 5 to 8 minutes in all.

**A compromised package.** The workflow fetches newer package versions, which is exactly when a hijacked release would arrive. Its install script runs in the **prepare** job, which has no secrets, and can at worst change what goes into the upload. **publish** accepts only the three expected files, so a bad change can only reach the pull request, where you see it in the lockfile diff ([review step 2](#reviewing-its-pull-request)).

## Fixing what the workflow can't

When the pull request lists something under **Still open**, or "npm audit fix changed nothing" while alerts remain, fix it by hand on a branch, as for any change.

### 1. Find where it comes from

```powershell
npm ls @grpc/grpc-js
```

```powershell
npm explain @grpc/grpc-js
```

These show which package pulls it in: for example `firebase → @firebase/firestore → @grpc/grpc-js`.

### 2. Prefer a newer parent

Check whether the parent has a release that already uses a fixed version.

```powershell
npm view firebase version
```

If it does and it's within the range in `package.json`, `npm update firebase` is enough. If it's a new major version, treat it as a feature change: read its release notes, and plan it and test it like one.

### 3. Otherwise, an `overrides` entry

npm's `overrides` field, in the root `package.json` only, forces a version anywhere in the tree. Scope it to the parent where you can, so nothing else is affected:

```json
"overrides": {
  "@firebase/firestore": {
    "@grpc/grpc-js": "^1.13.6"
  }
}
```

- **Fixed version:** use the one the advisory names (shown on the alert, and in the workflow's "Still open" list).
- **A direct dependency:** to override something `package.json` already lists, refer to its own spec with `$`, for example `"zod": "$zod"`.
- **Apply it:** delete `node_modules` and run `npm install` to update the lockfile.
- **Confirm:** `npm ls @grpc/grpc-js` shows only fixed versions, and `npm audit` no longer lists it.

### 4. Test, version and record it

1. Run `npm test`, `npm run lint`, `npx tsc -b`, `npm run build`, and `npm run test:rules` for anything Firebase.
2. It ships, so it's a **patch** (AGENTS.md: dependency updates and hardening).
3. Add a `**Security**` bullet under Unreleased, such as "Pinned a fixed version of a library Firebase uses, closing a high-severity issue."
4. **Leave a note:** an override stays in force until someone removes it. Add a line to `docs/BACKLOG.md` to remove it once the parent ships the fix.

### When to wait instead

- **The fix needs a major version of a core library** (the Firebase SDK, React, Vite). Plan it as its own piece of work.
- **The vulnerable code can't run in this app** (often true of build and test tools that never reach users). You may decide to dismiss the alert on GitHub with a reason, rather than fix it.
- **No fixed version exists yet** (the alert says "no patched version"). Watch the advisory.

### Today's examples (2026-11-21)

- **`@grpc/grpc-js`** (high) comes in through `firebase`. It's a candidate for a scoped override under `@firebase/firestore`, then a full test of Firestore reads and writes on the preview.
- **`minimatch`, `glob`, `uuid` and `@opentelemetry/core`** come in through `firebase-tools`, which is used only for deploys and tests, so they never reach users. Wait for a `firebase-tools` release, or override them and run the rules tests.

## How it works

### The workflow, job by job

`.github/workflows/dependency-security.yml` has three jobs on `ubuntu-latest`, run in order. The workflow's built-in token only reads (`permissions: contents: read`).

| Job       | Secrets                             | Runs project or package code | What it does                                                                              |
| --------- | ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `token`   | `DEPS_PR_TOKEN` (to check it's set) | No (no checkout)             | Fails at once if the secret is missing                                                    |
| `prepare` | **None**                            | Yes                          | Installs, audits, fixes, checks, writes the changelog and version, and uploads the result |
| `publish` | `DEPS_PR_TOKEN`                     | **No**                       | Checks the upload, commits, pushes and opens or updates the pull request                  |

#### Why two jobs

Packages run their own install scripts during `npm ci` and `npm audit fix`. A script can append to `$GITHUB_ENV`, a file GitHub loads into **every later step of the same job**. GitHub blocks `NODE_OPTIONS` there, but not, for example, `BASH_ENV` or `LD_PRELOAD`, either of which runs code in later steps. So within one job, a hijacked package could reach a token given to any later step. Jobs run on separate machines and don't share `$GITHUB_ENV`. **prepare** therefore gets no secret, and **publish**, which has the token, never installs or runs anything from the project: only `git`, `gh` and a few shell commands.

#### `prepare` (working directory `sms-system`)

| #   | Step                                           | What it does                                                                                                                                                                                                                                                            | Output         |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Checkout                                       | `main`, with `persist-credentials: false`                                                                                                                                                                                                                               | —              |
| 2   | Setup Node                                     | Node 24, with npm's cache keyed on `sms-system/package-lock.json`                                                                                                                                                                                                       | —              |
| 3   | `npm ci`                                       | Installs exactly the lockfile; packages' install scripts run here                                                                                                                                                                                                       | `node_modules` |
| 4   | Audit                                          | `npm audit --json` writes `$RUNNER_TEMP/before.json`, then `deps-security.mjs count` reads it. An error report fails the step                                                                                                                                           | `count`        |
| 5   | Fix within the version ranges                  | Skipped when `count` is 0. Runs `npm audit fix`, writes `after.json`, checks it isn't an error, then compares `package.json` and the lockfile with git                                                                                                                  | `changed`      |
| 6   | Tests, lint, tsc and the build                 | Only when `changed`. Each check runs even if an earlier one failed; the results go to `checks.json`                                                                                                                                                                     | `failed`       |
| 7   | Changelog, version and the pull request's text | `deps-security.mjs changelog`, `npm run version:bump -- patch --title "Dependency Security Updates"`, the version consistency test, then `deps-security.mjs body`. Copies `package.json`, `package-lock.json`, `CHANGELOG.md` and `body.md` into `$RUNNER_TEMP/bundle/` | The bundle     |
| 8   | Upload                                         | The bundle as the artifact `deps-security`, kept 3 days                                                                                                                                                                                                                 | The artifact   |

The job's outputs, `changed` and `failed`, tell `publish` whether to run and whether to make a draft.

#### `publish` (only when `changed`)

| #   | Step                            | What it does                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Checkout                        | A fresh `main`, with `persist-credentials: false`. No Node set-up and no install                                                                                                                                                                                                              |
| 2   | Download                        | The `deps-security` artifact into `$RUNNER_TEMP/bundle`                                                                                                                                                                                                                                       |
| 3   | Check the upload                | Exactly `CHANGELOG.md`, `body.md`, `package-lock.json` and `package.json`: nothing else, no symbolic links, each under 5 MB. It copies the three tracked files into place, then `git status` must show only those paths changed                                                               |
| 4   | Open or update the pull request | The only step with the token (`GH_TOKEN`). It commits as `github-actions[bot]` with git hooks off (`core.hooksPath=/dev/null`, `--no-verify`), force-pushes `deps/security` over https with the token, then edits the open pull request (a draft if `failed`, otherwise ready) or creates one |

npm's exit codes aren't used to decide anything, because `npm audit` and `npm audit fix` both exit non-zero whenever vulnerabilities remain. The reports decide: an error report fails the run, and a report with nothing in it means nothing to fix.

**The SMS number** (publish step 4, new pull requests only) uses the same query as AGENTS.md: the highest `SMS-<n>` in any pull request title, plus one, padded to three digits. An existing pull request keeps its number.

**The version** comes from `scripts/version.mjs bump patch`, the same command people run, so the version appears identically everywhere (`package.json`, the lockfile twice, and `CHANGELOG.md`) and the Version check passes.

### The npm audit report

`npm audit --json` (npm 7 and later) prints:

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "zod": {
      "name": "zod",
      "severity": "high",
      "isDirect": true,
      "via": [
        {
          "title": "Zod can exhaust memory …",
          "severity": "high",
          "url": "https://github.com/advisories/…"
        }
      ],
      "effects": [],
      "range": "<4.6.6",
      "nodes": ["node_modules/zod"],
      "fixAvailable": true
    },
    "eslint": {
      "severity": "moderate",
      "via": ["minimatch"],
      "fixAvailable": true
    }
  },
  "metadata": {
    "vulnerabilities": {
      "low": 1,
      "moderate": 28,
      "high": 8,
      "critical": 0,
      "total": 37
    }
  }
}
```

- **`via`** holds advisory objects (this package is vulnerable) or names of other packages (it only depends on one).
- **`fixAvailable`** is `true` (fixable within range), `false` (no fix), or `{ name, version, isSemVerMajor }` (the fix needs that package changed, a breaking change when `isSemVerMajor`).
- **On failure,** npm prints `{ "error": { … } }` instead, or nothing.

npm fetches the advisories from the registry's bulk advisory endpoint, which is backed by the GitHub Advisory Database.

### The logic: `.github/scripts/depsSecurityLogic.mjs`

Pure functions with no file or network access, typed in `depsSecurityLogic.d.mts`:

| Function                               | Input                                       | Returns                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auditError(report)`                   | A parsed report, or anything                | `true` when it has `error`, is empty, or isn't an object                                                                                                                                                                                                                              |
| `vulnerabilityCount(report)`           | A report                                    | How many packages have an advisory of their own                                                                                                                                                                                                                                       |
| `fixedPackages(before, after, lock)`   | Both reports and the lockfile after the fix | The packages with their own advisory that are gone after the fix: name, the new version or versions (from the lockfile's `nodes` paths), the severity before, whether it's a build or test tool (every copy marked `dev` in the lockfile), and the advisory titles. Most severe first |
| `remainingPackages(after)`             | The report after the fix                    | The packages still vulnerable, each with a reason: "no fixed version yet", or "fix by hand: …" when npm's only suggestion is a breaking change                                                                                                                                        |
| `securityBullets(fixed)`               | `fixedPackages`                             | One bullet per shipped package, and one for all build and test tools                                                                                                                                                                                                                  |
| `addUnreleasedBullets(raw, bullets)`   | `CHANGELOG.md`'s text and the bullets       | The text with a `**Security**` block under `## Unreleased`: it replaces "_Nothing yet._", appends to an existing Security block, keeps the other bullets and the line endings. Throws if there's no Unreleased section                                                                |
| `prBody({ fixed, remaining, checks })` | The above, plus `{ "npm test": true, … }`   | The pull request's description                                                                                                                                                                                                                                                        |

### The wrapper: `.github/scripts/deps-security.mjs`

Run from `sms-system/`. Each command exits 1 if a report is an error.

| Command                          | Reads                                                 | Does                                                      |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `count <audit.json>`             | One report                                            | Prints `vulnerabilityCount`                               |
| `changelog <before> <after>`     | Both reports and `package-lock.json`                  | Adds the bullets to `../CHANGELOG.md` and prints how many |
| `body <before> <after> <checks>` | Both reports, `package-lock.json` and the checks file | Prints the description                                    |

## Changing it safely

**Keep these, which the tests pin:**

- never `npm audit fix --force`;
- never merge (no `gh pr merge`, no auto-merge);
- the token only in the `token` and `publish` jobs; `prepare` has no secrets; `publish` sets up no Node and runs no `npm`, `npx` or `node`;
- `publish` accepts only the four expected files and commits only the three tracked ones, with git hooks off;
- checkout with `persist-credentials: false` in both jobs;
- a passing rerun marks a draft pull request ready again;
- the cron off the hour (`23 6 * * 1`);
- an error report fails the run (the `count` calls are never followed by `|| true`);
- actions pinned by commit SHA, as in the other workflows.

**Before committing a change:**

1. Run the tests:

   ```powershell
   npx vitest run src/lib/__tests__/depsSecurityLogic.test.ts
   ```

2. Check that the workflow still parses, and its shell steps with `bash -n`. The project has the `yaml` package: parse the file with it, write each step's `run:` to a file, and run `bash -n` on each.
3. **Dry-run it** on a scratch copy, without touching the repo. Only the lockfile changes, so nothing is installed. In Git Bash, from the repository root:

   ```bash
   S=$(mktemp -d) && mkdir -p "$S/sms-system" && cp sms-system/package.json sms-system/package-lock.json "$S/sms-system/" && cp CHANGELOG.md "$S/"
   cd "$S/sms-system" && npm audit --json --package-lock-only > ../before.json; npm audit fix --package-lock-only --ignore-scripts; npm audit --json --package-lock-only > ../after.json
   node <repo>/.github/scripts/deps-security.mjs changelog ../before.json ../after.json && echo '{"npm test": true}' > ../checks.json && node <repo>/.github/scripts/deps-security.mjs body ../before.json ../after.json ../checks.json
   ```

4. Run it on GitHub by hand, and read the pull request it opens before merging your change.

**Why the logic lives in `.github/scripts/`:** files in `sms-system/scripts/` count as shipped (`scripts/versionLogic.mjs`, `SHIPPED`), so every change to them would need a version bump. This is tooling. Fallow runs inside `sms-system/` and doesn't scan `.github/`; the test file is scanned as normal.

## Files

| File                                                     | What it is                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.github/workflows/dependency-security.yml`              | The workflow                                                           |
| `.github/scripts/depsSecurityLogic.mjs`                  | The decisions (pure)                                                   |
| `.github/scripts/depsSecurityLogic.d.mts`                | Its types, for the tests                                               |
| `.github/scripts/deps-security.mjs`                      | The command-line wrapper the workflow calls                            |
| `sms-system/src/lib/__tests__/depsSecurityLogic.test.ts` | Tests for the logic, the wrapper's error exit, and the workflow's pins |
| `sms-system/scripts/version.mjs`                         | The version bump it runs (shared with people)                          |
| `.github/workflows/version-check.yml`                    | Checks its pull request's title and version                            |
| `.github/workflows/release.yml`                          | Tags the version after merge                                           |
| `sms-system/docs/VERSIONING.md`                          | The source of truth for the rules and setup                            |
| `AGENTS.md`                                              | Says these pull requests bump on their own and still need the owner    |

## Cost

- **Firebase:** none. It doesn't touch Firebase or its free-tier quotas.
- **GitHub Actions:** free on a public repository. A run takes about 1 minute with nothing to fix, and 5 to 8 minutes otherwise.
- **The token:** free; renew it at least once a year.

## Sources

Checked on 2026-11-21:

- GitHub Docs, [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) (`schedule`: delays at busy times, dropped jobs, UTC) and [Disabling and enabling a workflow](https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow) (60 days without activity; forks)
- GitHub Changelog, [NODE_OPTIONS is now restricted from GITHUB_ENV](https://github.blog/changelog/2023-10-05-github-actions-node_options-is-now-restricted-from-github_env/), and GitHub Docs, [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) (untrusted code and environment files)
- Synacktiv, [GitHub Actions exploitation: environment manipulation](https://synacktiv.com/publications/github-actions-exploitation-repo-jacking-and-environment-manipulation) (`BASH_ENV` and `LD_PRELOAD` through `$GITHUB_ENV`)
- GitHub Docs, [Notifications for workflow runs](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs) (who is notified about scheduled runs)
- GitHub Docs, [Troubleshooting workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows) (a cron workflow stops when its account is suspended)
- GitHub Docs, [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token) and [Triggering a workflow](https://docs.github.com/actions/using-workflows/triggering-a-workflow) (events from the built-in token don't start other workflows; use a personal access token or an app token)
- GitHub Docs, [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) and [GitHub credential types](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/github-credential-types) (lifetime up to a year; revoked after a year unused)
- npm Docs, [npm-audit](https://docs.npmjs.com/cli/v10/commands/npm-audit/) (the bulk advisory endpoint; when `--force` is needed) and [Auditing package dependencies](https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/)
- GitHub Blog, [Unlocking security updates for transitive dependencies with npm](https://github.blog/security/supply-chain-security/unlocking-security-updates-for-transitive-dependencies-with-npm/) (what `--force` does) and [the advisory endpoints changelog](https://github.blog/changelog/2021-11-16-deprecating-non-audit-related-advisory-fetch-endpoints-for-the-npmjs-com-registry-api/) (npm's advisories come from the GitHub Advisory Database)
- npm Docs, [package.json → overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- GitHub Docs, [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts) and [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates) (re-scans when the default branch's lockfile changes; refreshing alerts)
- Status pages: [githubstatus.com](https://www.githubstatus.com) and [status.npmjs.org](https://status.npmjs.org)

**Not confirmed in the docs** (behaviour observed or assumed): exactly when Dependabot closes alerts after a lockfile change not made by Dependabot, and npm's exact exit codes when the audit service fails. The workflow doesn't rely on either.
