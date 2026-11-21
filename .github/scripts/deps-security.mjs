#!/usr/bin/env node
// The dependency security workflow's file handling (.github/workflows/dependency-security.yml); the decisions are in
// depsSecurityLogic.mjs. Run from sms-system/:
//
//   node ../.github/scripts/deps-security.mjs count <audit.json>
//       prints how many packages have an advisory of their own
//
// Every command exits 1 when an audit report is an error (npm couldn't reach the advisory service), so the run fails.
//   node ../.github/scripts/deps-security.mjs changelog <before.json> <after.json>
//       adds Security bullets for what was fixed under "## Unreleased" in ../CHANGELOG.md; prints how many
//   node ../.github/scripts/deps-security.mjs body <before.json> <after.json> <checks.json>
//       prints the pull request body; checks.json is { "npm test": true, ... }

import { readFileSync, writeFileSync } from "node:fs";
import {
  addUnreleasedBullets,
  auditError,
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

/** An audit report, or exit 1 when npm audit failed (an outage must turn the run red, not read as "nothing to fix"). */
const readAudit = (path) => {
  let report;
  try {
    report = readJson(path);
  } catch {
    report = null;
  }
  if (auditError(report)) {
    console.error(
      `npm audit couldn't produce a report (${path}): the advisory service may be down. Check status.npmjs.org and run the workflow again.`,
    );
    process.exit(1);
  }
  return report;
};

const CHANGELOG = "../CHANGELOG.md";
const LOCKFILE = "package-lock.json";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "count": {
    console.log(vulnerabilityCount(readAudit(args[0])));
    break;
  }
  case "changelog": {
    const fixed = fixedPackages(
      readAudit(args[0]),
      readAudit(args[1]),
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
    const after = readAudit(args[1]);
    process.stdout.write(
      prBody({
        fixed: fixedPackages(readAudit(args[0]), after, readJson(LOCKFILE)),
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
