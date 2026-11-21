#!/usr/bin/env node
// The dependency security workflow's file handling (.github/workflows/dependency-security.yml); the decisions are in
// depsSecurityLogic.mjs. Run from sms-system/:
//
//   node ../.github/scripts/deps-security.mjs count <audit.json>
//       prints how many packages have an advisory of their own
//   node ../.github/scripts/deps-security.mjs changelog <before.json> <after.json>
//       adds Security bullets for what was fixed under "## Unreleased" in ../CHANGELOG.md; prints how many
//   node ../.github/scripts/deps-security.mjs body <before.json> <after.json> <checks.json>
//       prints the pull request body; checks.json is { "npm test": true, ... }

import { readFileSync, writeFileSync } from "node:fs";
import {
  addUnreleasedBullets,
  fixedPackages,
  prBody,
  remainingPackages,
  securityBullets,
  vulnerabilityCount,
} from "./depsSecurityLogic.mjs";

const readJson = (path) => {
  const text = readFileSync(path, "utf8").trim();
  return text ? JSON.parse(text) : {};
};

const CHANGELOG = "../CHANGELOG.md";
const LOCKFILE = "package-lock.json";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "count": {
    console.log(vulnerabilityCount(readJson(args[0])));
    break;
  }
  case "changelog": {
    const fixed = fixedPackages(
      readJson(args[0]),
      readJson(args[1]),
      readJson(LOCKFILE),
    );
    const named = securityBullets(fixed);
    // The lockfile changed but no single package's advisory went away (a partial fix): still say what happened.
    const bullets = named.length
      ? named
      : [
          "Updated dependencies within their version ranges to reduce known security issues.",
        ];
    writeFileSync(
      CHANGELOG,
      addUnreleasedBullets(readFileSync(CHANGELOG, "utf8"), bullets),
    );
    console.log(bullets.length);
    break;
  }
  case "body": {
    const after = readJson(args[1]);
    process.stdout.write(
      prBody({
        fixed: fixedPackages(readJson(args[0]), after, readJson(LOCKFILE)),
        remaining: remainingPackages(after),
        checks: readJson(args[2]),
      }),
    );
    break;
  }
  default:
    console.error(
      "usage: deps-security.mjs count <audit> | changelog <before> <after> | body <before> <after> <checks>",
    );
    process.exit(2);
}
