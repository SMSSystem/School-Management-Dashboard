# Notes for coding agents

This repository holds one app, in `sms-system/` (React, TypeScript, Vite, Firebase; deployed by Vercel from `main`). Start with [sms-system/README.md](sms-system/README.md). Known gaps are in `sms-system/docs/ISSUES_AND_GAPS.md`, and the specs are under `sms-system/docs/`.

- Run npm commands from `sms-system/`.
- Before handing work back, run `npm test`, `npm run lint`, `npm run quality` and, if you deleted or split files, `npm run build`.
- The end-to-end tests (`npm run test:e2e`) use the production Firebase project and its daily read quota: run only the spec files you need.
- Do not commit, stage, push or open a pull request unless the owner asks in that turn.

## Code quality with Fallow

Run Fallow from `sms-system/`, never the repository root; its config lives there. Details are in [sms-system/docs/CODE_QUALITY.md](sms-system/docs/CODE_QUALITY.md).

- `npm run quality` checks your changes for new dead code, duplication and complexity. It is advisory: a `fail` verdict does not stop the handoff. Fix what you introduced where that is reasonable, and tell the owner about anything you left and why.
- Before deleting something Fallow reports, check it with `npx fallow dead-code --trace <file>:<export>`. Scripts may run by hand or from docs, so confirm script deletions with the owner.
- Run `npx fallow fix` only when asked, preview it with `--dry-run`, then run `npm test`, because many tests pin source text.
- Prefer a fix to a suppression. If you must suppress, use the narrowest form and give a reason: `// fallow-ignore-next-line unused-export -- <reason>`.
- Do not change `.fallowrc.json` to make a finding go away without saying so.
- If you add a test that globs `src` with `?raw`, add it to `ignorePatterns` in `.fallowrc.json`.
- Do not refactor unrelated code because Fallow flagged it, and do not merge clones listed in `ignoredClones`.

## Formatting

- Do not run `npm run format` until the owner plans a repo-wide format; today it would break about 290 tests. Format only the files you changed: `npm run format:files -- <paths>`. Run it twice on a file that keeps changing.
- Do not format `CHANGELOG.md`; it fails `versionConsistency.test.ts`.
- Then run `npm test` and `npm run lint`. Many tests pin source text. If a guard test fails only because of formatting, update the pin to keep the same check, and say so: compare both sides through `flat()` from `sms-system/src/lib/__tests__/sourceText.ts`, which ignores quote style, line breaks and Prettier's wrapping. Never weaken a guard to make it pass.
- If formatting takes a file over 600 lines, tell the owner instead of raising the limit.

## Versioning: before you open a pull request

Every merge to `main` that changes what ships gets a new version. The rules are in [sms-system/docs/VERSIONING.md](sms-system/docs/VERSIONING.md). The version is in `sms-system/package.json`, twice in `package-lock.json`, and in [CHANGELOG.md](CHANGELOG.md). A test and a pull-request check fail when these disagree.

When the owner asks you to open a pull request, or to get one ready:

1. **Decide whether the change ships.**
   - Changes to `sms-system/src`, `public`, `index.html`, the Firebase rules or indexes, `vercel.json`, the build config, the dependencies or `sms-system/scripts/*.mjs` ship.
   - Changes to docs, tests, e2e specs or `internal/` do not.
2. **Ask the owner before changing the version.** Offer major, minor, patch or no bump, with your suggestion and one line of reason:
   - **Major:** existing data, links, roles, import formats or script flags stop working without action, such as a migration that the previous build cannot read.
   - **Minor:** a new feature, page, field, script or visible improvement.
   - **Patch:** a bug fix, hardening, dependency update, read-cost or performance fix, or internal refactor.
   - **None:** docs, tests or tooling only.
3. **Write the CHANGELOG bullets under `## Unreleased` in `CHANGELOG.md`.**
   - Use the category labels `**Breaking**`, `**Added**`, `**Changed**`, `**Deprecated**`, `**Removed**`, `**Fixed**`, `**Security**` and `**Deploy notes**`.
   - Write two to six short bullets in plain words for users and admins, with no file paths except in Deploy notes.
   - Deploy notes name every `firebase deploy`, script run or new environment variable the change needs.
4. **Run the bump** from `sms-system/`:

   ```bash
   npm run version:bump -- minor --title "Plain title of the change" --pr 123
   ```

   `--pr` is optional; add the number once the pull request exists. This moves the Unreleased bullets into a new entry and sets the version everywhere. It does not commit or tag.

5. **Run `npm test`.** It includes `versionConsistency.test.ts`. Then tell the owner the new version.

### Pull request titles

- Every pull request title starts with `SMS-<number> | `, with at least three digits, for example `SMS-001 | Feature Implementation: Backend Integration, Caching Rewrite, & Documentation Updates`.
- The SMS number is the project's own counter, not the GitHub pull-request number.
- **Find the next number.** Take the highest SMS number in any pull request title and add one:

  ```bash
  gh pr list --state all --search "SMS in:title" --limit 1000 --json title --jq '.[].title'
  ```

  Without `gh`, use `git log --format=%s origin/main | grep -E '^SMS-[0-9]+'`. Start at SMS-001 if there are none.

- Tell the owner the number before opening the pull request.
- Pull requests before SMS-001 (#1 to #89) have no prefix. Do not rename them.
- The squash commit on `main` keeps the title, prefix included.
- The `--title` given to `version:bump` stays plain, without the prefix.
- The **Version check** workflow fails when the title does not match or the number is already used.

If the owner says no bump, leave the bullets under Unreleased; they ship with the next version. A pull request that changes shipped code without a bump gets the `no-version-bump` label only when the owner agrees.

Never create or move a `v*` tag yourself. The **Release** workflow tags the merge commit and publishes the GitHub Release.
