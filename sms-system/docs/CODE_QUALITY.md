# Code quality: Fallow and Prettier

Run every command here from `sms-system/`.

## Fallow

[Fallow](https://fallow.tools/docs/) finds dead code, duplication and complexity across the whole project. It sits alongside ESLint, TypeScript and the guard tests, and replaces none of them. It reads source files as text, so it uses no Firestore reads.

Fallow is **advisory**: nothing it reports blocks a merge.

| Command                                        | Use it                                                          |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `npm run quality`                              | Before handing work back. Checks only what your branch changes. |
| `npm run quality:report`                       | Whole-project report.                                           |
| `npm run quality:prod`                         | Finds code that only tests use.                                 |
| `npx fallow dead-code --trace <file>:<export>` | Before deleting anything. Shows why it counts as used.          |
| `npx fallow health --hotspots --targets`       | When choosing what to refactor.                                 |

`npm run quality` exits with an error on a `fail` verdict. That is a report, not a stop.

### Always run it from `sms-system/`

The config is `sms-system/.fallowrc.json`. Run from the repository root, Fallow does not find it and reports false results, including import cycles that do not exist. In VS Code, open `sms-system/` as the folder, so the extension finds the config.

### Why the config has exceptions

- **`scripts/*.mjs` and other entries:** these run by hand, from docs or from PowerShell, so nothing imports them.
- **`!src/scenes/**/build/**`:** Fallow ignores folders named `build`, which would hide the exam builder and report its files as unused. Avoid naming a source folder `build`, `dist` or `coverage`.
- **The listed tests:** they read all of `src` as raw text, and Fallow would count that as importing every file. Add any new test that does the same.
- **`ignoredClones`:** duplication kept on purpose, because merging it would change behaviour or output. A group is reported again if it changes.

### Handling a finding

1. Fix it if you introduced it.
2. Before deleting, trace it. Fallow cannot see docs, Firestore rules, Task Scheduler jobs or manual runbooks, so a person confirms script deletions.
3. If it stays, prefer a config rule for a pattern. For a one-off, use the narrowest suppression with a reason: `// fallow-ignore-next-line unused-export -- <reason>`.
4. After `npx fallow fix`, run `npm test`. Preview with `--dry-run` first.

### Periodic review

Once a month, or before each minor release, run `npm run quality:report` and `npm run quality:prod`, then decide what to clean up. Exports used only by tests count as used in everyday checks, and they appear here. Many are deliberate test seams.

## Prettier

Prettier 3.7.4 with default options is what VS Code applies on save here. It is pinned so the editor and these commands use the same version. Do not add Prettier options without a decision, because they change what saving does too.

| Command                           | What it does                                             |
| --------------------------------- | -------------------------------------------------------- |
| `npm run format:files -- <paths>` | Formats the files you name. **Use this one.**            |
| `npm run format:check`            | Lists files that are not formatted. Changes nothing.     |
| `npm run format`                  | Formats the whole repository. **See the warning below.** |

**Warning: do not run `npm run format` yet.** The repository is not fully formatted, and many tests pin source text. In a trial, formatting everything changed 1,165 files, failed 289 tests and put 12 files over the 600-line limit. A repo-wide format needs its own pull request, with test repairs, file splits and a browser check.

**Formatting one file can also break a test**, including when you save it in VS Code:

- If a guard test fails only because of formatting, update the pinned text to keep the same check. Never weaken a guard to make it pass.
- If a file goes over 600 lines, split it, or raise it with the owner.
- A file may need formatting twice before it settles.

**What the commands leave out:**

- **HTML:** VS Code formats it with its own formatter on save.
- **`CHANGELOG.md`:** formatting it fails `versionConsistency.test.ts`. If you edit it in VS Code, use **Save Without Formatting**.
