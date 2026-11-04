#!/usr/bin/env node
/**
 * Reports documents that should be one document: two registers for one class, date and session, two results for one
 * gradebook column and student, and so on. Duplicate general registers also inflate attendance summaries, which add up
 * every register for a class and term.
 *
 * READ-ONLY: this script never writes, and it has no --live flag. It repairs nothing.
 *
 * COUNT ONLY BY DEFAULT: with no --read it runs count() queries, at about one billed read per 1,000 documents, and
 * says what a scan would cost. With --read it reads the documents, one billed read each, from the same daily 50,000 the
 * app uses, and refuses to start when the total is over --max-reads. Reads reset at midnight US Pacific.
 *
 * Every scan writes a log to scripts/logs/ (gitignored): ids, dates and counts, with no names, marks, excuse reasons
 * or student ids. Registers' marks are compared in memory and never printed.
 *
 * Usage:
 *   node scripts/find-duplicate-records.mjs --key=<path> [--institution=<id>] [--read] [--max-reads=<n>]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  COLLECTIONS,
  DEFAULT_MAX_READS,
  checkBudget,
  countCollection,
  scanCollection,
  summarise,
} from "./findDuplicateRecordsLogic.mjs";
import { usageExit, requireKeyPath } from "./adminCli.mjs";

const printUsageAndExit = usageExit(`
Usage:
  node scripts/find-duplicate-records.mjs --key=<path> [--institution=<id>] [--read] [--max-reads=<n>]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution (default: every institution).
  --read              Read the documents and report duplicates. Omit to only count them (the default).
  --max-reads=<n>     Refuse to scan if it would read more than this (default: ${DEFAULT_MAX_READS}).
`);

const VALUE_FLAGS = {
  "--key=": (opts, value) => {
    opts.keyPath = value;
  },
  "--institution=": (opts, value) => {
    opts.institution = value;
  },
  "--max-reads=": (opts, value) => {
    opts.maxReads = Number(value);
  },
};

function applyArg(opts, arg) {
  if (arg === "--read") {
    opts.read = true;
    return;
  }
  if (arg === "--help" || arg === "-h") printUsageAndExit(0);
  const flag = Object.keys(VALUE_FLAGS).find((f) => arg.startsWith(f));
  if (!flag) {
    console.error(`Unrecognized argument: ${arg}`);
    printUsageAndExit(1);
  }
  VALUE_FLAGS[flag](opts, arg.slice(flag.length));
}

function parseArgs(argv) {
  const opts = {
    keyPath: null,
    institution: null,
    read: false,
    maxReads: DEFAULT_MAX_READS,
  };
  for (const arg of argv) applyArg(opts, arg);
  if (
    opts.institution !== null &&
    !/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)
  ) {
    console.error(
      "--institution must be a single institution id (no slashes, dots or spaces).",
    );
    process.exit(1);
  }
  if (!Number.isInteger(opts.maxReads) || opts.maxReads < 1) {
    console.error("--max-reads must be a whole number above 0.");
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = requireKeyPath(opts.keyPath);
  const db = getFirestore(
    initializeApp({
      credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))),
    }),
  );

  const mode = opts.read
    ? `scan, up to ${opts.maxReads} reads`
    : "count only (no documents are read)";
  console.log(`Mode: ${mode}. Nothing is ever written.`);
  console.log(
    `Scope: ${opts.institution ? `institution ${opts.institution} only` : "all institutions"}`,
  );
  console.log("");

  const institutionIds = opts.institution
    ? [opts.institution]
    : (await db.collection("institutions").listDocuments()).map((d) => d.id);

  const total = await countAll(db, institutionIds);
  const budget = checkBudget(total, opts.maxReads);
  const share = (budget.shareOfDailyQuota * 100).toFixed(1);
  console.log("");
  console.log(
    `A scan would read ${total} document(s): ${share}% of the daily 50,000, shared with the app.`,
  );

  if (!opts.read) {
    console.log("Nothing more was read. Add --read to scan.");
    return;
  }
  if (!budget.allowed) {
    console.error(
      `Stopped: ${total} is over --max-reads=${opts.maxReads}. Nothing more was read. Narrow it with --institution, or raise --max-reads.`,
    );
    process.exit(1);
  }

  const report = [];
  for (const institutionId of institutionIds)
    report.push(...(await scanInstitution(db, institutionId)));
  printTotals(report);
  writeLog(institutionIds, total, report);
}

async function countAll(db, institutionIds) {
  let total = 0;
  for (const institutionId of institutionIds) {
    const ref = db.collection("institutions").doc(institutionId);
    const counts = [];
    for (const definition of COLLECTIONS) {
      const count = await countCollection(ref, definition);
      counts.push(`${definition.name} ${count}`);
      total += count;
    }
    console.log(`${institutionId}: ${counts.join(", ")}`);
  }
  return total;
}

function describeLine(definition, summary) {
  const marks = definition.isRegister
    ? `, ${summary.extraMarksCounted} mark(s) on more than one register`
    : "";
  const skipped = summary.skipped
    ? `, ${summary.skipped} skipped (a key field is missing)`
    : "";
  return (
    `  ${definition.name}: ${summary.scanned} read, ${summary.groups} duplicate group(s), ` +
    `${summary.extraDocuments} extra document(s), ${summary.groupsThatDiffer} that differ${marks}${skipped}`
  );
}

async function scanInstitution(db, institutionId) {
  const ref = db.collection("institutions").doc(institutionId);
  const rows = [];
  console.log("");
  console.log(institutionId);
  for (const definition of COLLECTIONS) {
    const scan = await scanCollection(ref, definition);
    const summary = summarise(scan);
    console.log(describeLine(definition, summary));
    rows.push({
      institutionId,
      collection: definition.name,
      summary,
      duplicates: scan.duplicates,
    });
  }
  return rows;
}

function printTotals(report) {
  console.log("");
  console.log("Duplicate groups by collection:");
  for (const { name } of COLLECTIONS) {
    const groups = report
      .filter((row) => row.collection === name)
      .reduce((sum, row) => sum + row.summary.groups, 0);
    console.log(`  ${name}: ${groups}`);
  }
}

function writeLog(institutionIds, documentsRead, report) {
  mkdirSync("scripts/logs", { recursive: true });
  const logPath = `scripts/logs/find-duplicate-records-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    logPath,
    JSON.stringify({ institutionIds, documentsRead, report }, null, 2),
  );
  console.log(`Log: ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
