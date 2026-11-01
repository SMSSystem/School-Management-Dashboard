# Notes for coding agents

This repository holds one app, in `sms-system/` (React, TypeScript, Vite, Firebase; deployed by Vercel from `main`). Start with [sms-system/README.md](sms-system/README.md). Known gaps are in `sms-system/docs/ISSUES_AND_GAPS.md`, and the specs are under `sms-system/docs/`.

- Run npm commands from `sms-system/`.
- Before handing work back, run `npm test`, `npm run lint` and, if you deleted or split files, `npm run build`.
- The end-to-end tests (`npm run test:e2e`) use the production Firebase project and its daily read quota: run only the spec files you need.
- Do not commit, stage, push or open a pull request unless the owner asks in that turn.

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
