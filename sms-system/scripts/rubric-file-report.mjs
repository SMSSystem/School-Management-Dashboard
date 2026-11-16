#!/usr/bin/env node
/**
 * Reports each school's rubric files: how many rubrics, how many have a file, the files' total and largest size,
 * the count against the app's soft limit of 200, and the files by type. Rubric files stay until someone deletes them
 * (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 12.4), so this shows where storage goes.
 *
 * READ-ONLY: this script never writes, and it has no --live flag.
 *
 * COUNT ONLY BY DEFAULT: with no --read it runs count() queries, at about one billed read per 1,000 documents, and
 * says what a scan would cost. With --read it reads each rubric document's `file` field only, one billed read each,
 * from the same daily 50,000 the app uses, and refuses to start when the total is over --max-reads. It never reads the
 * files themselves (rubrics/{id}/file/current), which can be 700 KB each. Reads reset at midnight US Pacific.
 *
 * Every scan writes a log to scripts/logs/ (gitignored): institution ids, counts and sizes, with no titles or names.
 *
 * Usage:
 *   node scripts/rubric-file-report.mjs --key=<path> [--institution=<id>] [--read] [--max-reads=<n>]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  DEFAULT_MAX_READS,
  checkBudget,
} from "./findDuplicateRecordsLogic.mjs";
import {
  SOFT_SCHOOL_FILE_LIMIT,
  formatBytes,
  parseReportArgs,
  summariseRubrics,
} from "./rubricFileReportLogic.mjs";
import { usageExit, requireKeyPath } from "./adminCli.mjs";

const printUsageAndExit = usageExit(`
Usage:
  node scripts/rubric-file-report.mjs --key=<path> [--institution=<id>] [--read] [--max-reads=<n>]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution (default: every institution).
  --read              Read the rubrics and report their files. Omit to only count them (the default).
  --max-reads=<n>     Refuse to read more than this (default: ${DEFAULT_MAX_READS}).
`);

function parseArgs(argv) {
  const parsed = parseReportArgs(argv, DEFAULT_MAX_READS);
  if (parsed.help) printUsageAndExit(0);
  if (parsed.error) {
    console.error(parsed.error);
    printUsageAndExit(1);
  }
  return parsed.opts;
}

const rubricsOf = (db, institutionId) =>
  db.collection("institutions").doc(institutionId).collection("rubrics");

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = requireKeyPath(opts.keyPath);
  const db = getFirestore(
    initializeApp({
      credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))),
    }),
  );

  console.log(
    `Mode: ${opts.read ? `read, up to ${opts.maxReads} reads` : "count only (no documents are read)"}. Nothing is ever written.`,
  );
  console.log(
    `Scope: ${opts.institution ? `institution ${opts.institution} only` : "all institutions"}`,
  );
  console.log("");

  const institutionIds = opts.institution
    ? [opts.institution]
    : (await db.collection("institutions").listDocuments()).map((d) => d.id);

  let total = 0;
  for (const institutionId of institutionIds) {
    const count = (await rubricsOf(db, institutionId).count().get()).data()
      .count;
    console.log(`${institutionId}: ${count} rubric(s)`);
    total += count;
  }
  const budget = checkBudget(total, opts.maxReads);
  console.log("");
  console.log(
    `Reading them would cost ${total} read(s): ${(budget.shareOfDailyQuota * 100).toFixed(1)}% of the daily 50,000, shared with the app.`,
  );

  if (!opts.read) {
    console.log("Nothing more was read. Add --read to report the files.");
    return;
  }
  if (!budget.allowed) {
    console.error(
      `Stopped: ${total} is over --max-reads=${opts.maxReads}. Nothing more was read. Narrow it with --institution, or raise --max-reads.`,
    );
    process.exit(1);
  }

  const report = [];
  for (const institutionId of institutionIds) {
    const snap = await rubricsOf(db, institutionId).select("file").get();
    const summary = summariseRubrics(snap.docs.map((d) => d.get("file")));
    report.push({ institutionId, ...summary });
    printSchool(institutionId, summary);
  }
  writeLog(institutionIds, total, report);
}

function printSchool(institutionId, s) {
  const types =
    Object.entries(s.byType)
      .map(([type, n]) => `${type} ${n}`)
      .join(", ") || "none";
  const limit = `${s.withFile} of the soft limit of ${SOFT_SCHOOL_FILE_LIMIT}${s.overSoftLimit ? " (OVER)" : ""}`;
  console.log("");
  console.log(institutionId);
  console.log(`  ${s.rubrics} rubric(s), ${s.withFile} with a file: ${limit}`);
  console.log(
    `  Files: ${formatBytes(s.totalBytes)} in all, largest ${formatBytes(s.largestBytes)}`,
  );
  console.log(`  By type: ${types}`);
}

function writeLog(institutionIds, documentsRead, report) {
  mkdirSync("scripts/logs", { recursive: true });
  const logPath = `scripts/logs/rubric-file-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    logPath,
    JSON.stringify({ institutionIds, documentsRead, report }, null, 2),
  );
  console.log("");
  console.log(`Log: ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
