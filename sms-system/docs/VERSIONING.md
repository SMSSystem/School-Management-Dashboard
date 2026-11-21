# Versioning

> **Written:** 2026-11-01 (v2.39.0, when versioning was introduced)

The app's version is a [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) number, `MAJOR.MINOR.PATCH`. What changed in each version is in [CHANGELOG.md](../../CHANGELOG.md) at the repository root. This file covers four things:

- how a change is classified
- where the number is written
- how a version is released
- how the versions before November 2026 were recorded after the fact

## One version per shipped merge

Vercel deploys every merge to `main`, so each merge that changes what ships is one deploy and one version. A merge that changes only docs, tests or tooling keeps the version, and its CHANGELOG bullets wait under **Unreleased** for the next version.

"What ships" is decided by `isShippedPath()` in [`scripts/versionLogic.mjs`](../scripts/versionLogic.mjs):

| Ships                                                                                    | Does not ship                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/` (but not its `__tests__`), `public/` and `index.html`                             | `docs/`, `internal/` and every `*.md`                      |
| `firestore.rules`, `database.rules.json`, `firestore.indexes.json` and `firebase.json`   | `e2e/`, `rules-tests/` and `src/**/__tests__/`             |
| `vercel.json`, `vite.config.ts`, `postcss.config.ts` and the `tsconfig` files            | `.github/`, `lint/` and `scripts/*.d.mts`                  |
| `package.json` and `package-lock.json`                                                   | `scripts/retro-versions.json`                              |
| `scripts/*.mjs` and `scripts/*.ps1` (the admin scripts' flags are part of the interface) | Tool config such as `.fallowrc.json` and `.prettierignore` |

## What counts as the public interface

SemVer asks a project to declare its public API. A hosted web app has no library API, and a school cannot stay on an old version. So "breaking" here means breaking for something that already exists:

1. **Stored data and the rules that guard it.** This covers Firestore and Realtime Database paths, document shapes, `firestore.rules`, `database.rules.json` and `firestore.indexes.json`.
2. **Addresses** that users bookmark or that sign-in emails link to, such as `/login/:institutionId/:role` and `/register/:institutionId`.
3. **Roles** and what each one can see and do.
4. **File formats.** These are the import templates (CSV, XLSX, JSON, and exam Word, PDF and Markdown files) and the export columns.
5. **The admin scripts' interfaces.** These are the flags and environment variables of `scripts/`, plus the `.env.*` keys documented in the README.

## Choosing the bump

| Bump      | When                                                                                                                                                                                                                                                                                             | Examples from the history                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Major** | Something in the list above stops working without action. Examples: a data migration the previous build cannot read, rules that refuse documents the previous build writes in normal use, a removed address, role or import format, or a renamed or removed script flag or environment variable. | v2.0.0 (#34): data moved under `institutions/{id}`, with a migration script |
| **Minor** | Something new that leaves what exists working: a feature, page, role, field (optional or backfilled), script or visible improvement. A deprecation is also minor.                                                                                                                                | v2.1.0 registration form, v2.12.0 custom calendar, v2.22.0 spectator role   |
| **Patch** | A bug fix, hardening that does not change valid use, a dependency update, a read-cost or performance fix, or an internal refactor that ships.                                                                                                                                                    | v2.0.2, v2.12.1, v2.14.1, the Dependabot batches                            |
| **None**  | Docs, tests, e2e specs, `internal/` or CI only.                                                                                                                                                                                                                                                  | —                                                                           |

Rules that settle the usual doubts:

- When a merge mixes kinds, the highest one wins.
- Before a rules or data change, ask: "Would the previous build, or a script, break against this in normal use?" If yes, the change is major.
- A break that lasts only for the minutes of a planned deploy, prevented by the deploy order in the Deploy notes, is not major. An example is v2.15.0 (#66): rules that refuse the old app's log writes, deployed after the app. Record it as **Changed** or **Security**, with the order under **Deploy notes**.
- Changing a workflow people have learned is minor, with a **Changed** bullet.
- A released version is never edited. If a breaking change ships as a minor by mistake, release a new version that restores compatibility, and say so in the CHANGELOG.

## How the number is written

| Where                                                                    | Form                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `package.json` and `package-lock.json` (twice), and the script arguments | `2.39.0` (bare; npm requires it)                             |
| Git tags, GitHub Release titles, the CHANGELOG, the app and prose        | `v2.39.0`                                                    |
| The app off production (preview and local builds)                        | `v2.39.0+a1b2c3d`: the build commit as SemVer build metadata |

A version is always three numbers, with no leading zeros. SemVer itself says `v1.2.3` is not a semantic version; the `v` belongs to the tag name. That is why the machine files keep the bare form.

## Releasing a version

1. Write the change's bullets under `## Unreleased` in `CHANGELOG.md`.
   - Use these labels: **Breaking**, **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security** and **Deploy notes**.
   - Write two to six plain bullets for users and admins.
   - Deploy notes name every `firebase deploy`, script or environment variable the change needs. Rules and indexes are deployed separately from Vercel, so this note is the reminder.
2. From `sms-system/`, run `npm run version:bump -- <major|minor|patch> --title "Plain title" [--pr 123]`.
   - It sets the version in `package.json` and both places in `package-lock.json`.
   - It turns Unreleased into the new version's entry, dated today.
   - It closes the previous entry and updates the "Current version · Last updated" line.
   - It commits nothing and creates no tag.
3. Run `npm test`. `versionConsistency.test.ts` fails if the files disagree.
4. Open the pull request with a title that starts with `SMS-<number> | `, for example `SMS-001 | Feature Implementation: ...`.
   - The SMS number is the project's own counter, starting at SMS-001 with the pull request that introduced versioning; it is not the GitHub pull-request number.
   - The next number is the highest one in any pull request title plus one; [AGENTS.md](../../AGENTS.md) has the command. Earlier pull requests (#1 to #89) have no prefix.
   - The squash commit on `main` keeps the title, so `git log` shows the SMS number.
   - The **Version check** workflow fails if shipped code changed without a higher version, if the new version's tag already exists, or if the title does not match or reuses an SMS number.
   - Dependabot pull requests skip both checks. Pull requests labelled `no-version-bump` skip only the version check.
   - On a private repository on GitHub Free, a failing check cannot block the merge, so treat a red check as a stop sign.
5. After the merge, the **Release** workflow:
   - creates the annotated tag `v<version>` on the merge commit
   - publishes a GitHub Release whose notes are the CHANGELOG entry (`npm run version:extract -- <version>`)
   - never commits to `main`
   - for a merge that kept the version, posts a notice and does nothing

Agents follow the same steps; see [AGENTS.md](../../AGENTS.md), which tells them to ask the owner which bump to make.

## Where the app shows it

`vite.config.ts` passes in three values at build time, so showing the version costs no Firestore read:

- the version from `package.json`
- the commit, from `VERCEL_GIT_COMMIT_SHA` or else `git`
- the environment, from `VERCEL_ENV`

[`src/lib/appVersion.ts`](../src/lib/appVersion.ts) exports them. The version appears in four places:

- the bottom of the sidebar
- the sign-in screens
- Settings → About, which for a super admin also links to the CHANGELOG
- the page error screen, and the console messages of `reportError` and both error boundaries

Nothing in `src/` imports `package.json` or `CHANGELOG.md`; that would put the whole file in the download.

## Dependency security updates

Dependabot lists vulnerable packages on the repository's Security tab. The **Dependency security** workflow (`.github/workflows/dependency-security.yml`) fixes the ones it can and opens one pull request for review.

This section is the source of truth for what the workflow does, its rules and its setup. The full guide covers running and reviewing it, failures and outages, fixing what it can't, and how it works inside: [docs/maintenance/DEPENDENCY_SECURITY_WORKFLOW.md](maintenance/DEPENDENCY_SECURITY_WORKFLOW.md).

- **When:** by hand (Actions → "Dependency security" → "Run workflow"), and every Monday at 06:23 UTC.
- **What it does,** in `sms-system/`:
  1. runs `npm audit fix`, which updates packages only within the version ranges in `package.json`, never forced;
  2. runs the tests, lint, `tsc` and the build;
  3. writes `**Security**` bullets under Unreleased in `CHANGELOG.md`: one per package the app ships, and one for the build and test tools;
  4. bumps the patch version;
  5. opens "SMS-<n> | Dependency Security Updates", with the next SMS number. The description lists what it fixed and what's left: fixes that need a major upgrade or an `overrides` entry are done by hand.
- **Rules:**
  - if npm can't produce an audit report (its advisory service is down), the run fails, so it never reads as "nothing to fix";
  - if a check fails, the pull request is a draft;
  - an open pull request from the `deps/security` branch is updated rather than duplicated;
  - it **never merges**. Review and merge it as any other pull request. It ships, and is a patch.
- **The logic** is in `.github/scripts/` (`depsSecurityLogic.mjs`, tested by `src/lib/__tests__/depsSecurityLogic.test.ts`). It sits outside `sms-system/scripts/` because files there ship.
- **Setup, once:**
  1. On GitHub: Settings → Developer settings → Fine-grained tokens. Create a token for this repository only, with **Contents** and **Pull requests** set to Read and write. Give it an expiry, and renew it before then.
  2. In this repository: Settings → Secrets and variables → Actions, as a new repository secret named `DEPS_PR_TOKEN`.

  The workflow needs this token because a pull request opened with the built-in token doesn't start the other checks (Version check, Fallow). The token goes only to a separate job that never installs or runs project or package code; the job that installs and updates packages has no secrets, since a package's install script could otherwise reach it.
- **Dependabot's own security pull requests** stay off (repository settings), so the same fix doesn't arrive twice.

## Versions recorded after the fact

The history before v2.39.0 was given versions retroactively. Each version sits at a merge commit on `main`'s first-parent line, dated by that commit; commits pushed straight to `main` between pull requests roll into the next version. The map is [`scripts/retro-versions.json`](../scripts/retro-versions.json), and `versionConsistency.test.ts` checks it against the CHANGELOG.

| Version           | Commit                                      | Why there                                                                                                                                                              |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v0.0.1**        | `f59ac24` (2024-12-05, "Finished UI Setup") | The first complete dashboard: every list page and role dashboard, with sample data. Earlier commits are setup (the Vite template, Tailwind, the switch to TypeScript). |
| v0.0.2 to v0.0.12 | through #10 (`15cdb0c`)                     | The mock-data prototype: login, protected routes, dark mode, profile and settings, the five-role session.                                                              |
| **v0.1.0**        | #11 (`da6029b`, 2026-05-14)                 | Firebase Authentication replaced the mock session: the first real backend.                                                                                             |
| **v1.0.0**        | #16 (`a8f704f`, 2026-06-02)                 | The MVP: every page on live Firestore data. SemVer starts 1.0.0 at production use, and this is the first build that was a working product.                             |
| **v2.0.0**        | #34 (`d706466`, 2026-08-03)                 | Each institution's data moved under `institutions/{id}` with a migration script. Data and rules from v1 do not work with v2.                                           |
| v2.38.0           | #89 (`f7be8a9`, 2026-10-30)                 | The last merge before versioning.                                                                                                                                      |

Same-day Dependabot pull requests share one patch: v1.10.1 is #31–#33, v2.0.1 is #35–#43, and v2.8.1 is #54–#57. Pull request #28 was never merged. The audit for the retroactive map looked at #48, #66, #70, #76 and #86, which could have counted as breaking, and kept them all minor:

- **#48:** a backfill script came with it.
- **#66:** see the deploy-window rule above.
- **#70:** behind an environment flag.
- **#76:** the rules accept both shapes.
- **#86:** additions only.

The tags for these versions are created once by [`scripts/tag-retro-versions.mjs`](../scripts/tag-retro-versions.mjs).

- It is a dry run by default. With `--live` it creates the tags, dated with each commit's date; add `--sign` to sign them.
- It skips a tag already on the right commit and stops if one points elsewhere.
- It pushes nothing. Check the tags with `git tag -n -l "v*"`, then run `git push origin --tags` before the merge that introduces versioning.
- Only versions from v2.39.0 on get GitHub Releases.

## Things to know

- The **Version check** cannot block a merge on GitHub Free with a private repository. If a merge ships without a bump, the Release workflow's notice says so, and the next bump releases the change.
- When two pull requests are open together, both may claim the same version. The second one to merge must bump again after updating from `main`; the "tag already exists" check catches it.
- Squash merges put the tag on the squash commit, so the bump must be inside the pull request, not made after it.
- Dependabot pull requests do not bump. Fold them into the next patch, or follow a batch with a `version:bump patch` pull request.
- A version describes the repository. Production can run a new build on older Firestore rules until `firebase deploy` runs, which is why Deploy notes exist.
- Tags made by the workflow are not signed; the commits they point to are.
- Never move or reuse a pushed tag.
- Large minor numbers such as v2.38.0 are normal with one version per merge.
- Cost: the version is a build-time constant (no Firestore reads or writes, no Vercel functions), and tags and Releases do not start Vercel deploys. Both workflows run on `ubuntu-latest` in well under a minute each, far inside the GitHub Free minutes for private repositories.
