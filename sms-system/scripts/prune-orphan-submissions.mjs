#!/usr/bin/env node
/**
 * Removes students' submissions left behind by assignments that were deleted before the app deleted them too: every
 * submission, attempt and submission tombstone under an assignment id whose assignment document no longer exists.
 *
 * Why: until the assignment delete cascade (src/lib/assignmentDelete.ts), deleting an assignment removed only the
 * assignment document. Its submissions stayed, each with a file of up to 500 KB, and nothing ever removed them.
 *
 * DRY RUN BY DEFAULT: nothing is deleted unless you pass --live. The grades in `results` are never touched. Every run
 * writes a log to scripts/logs/ (gitignored) with institution and assignment ids and counts, no names or files.
 *
 * Reads: one per assignment id listed, plus each orphan's submissions, attempts and tombstones with only their
 * `fileSize` field, so no file is downloaded. With --live, a recursive delete of each orphaned assignment path.
 *
 * Usage:
 *   node scripts/prune-orphan-submissions.mjs --key=<path> [--institution=<id>] [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  parseOrphanArgs,
  summariseOrphan,
  totalOrphans,
} from "./pruneOrphanSubmissionsLogic.mjs";
import { formatBytes } from "./rubricFileReportLogic.mjs";
import { usageExit, requireKeyPath } from "./adminCli.mjs";

const printUsageAndExit = usageExit(`
Usage:
  node scripts/prune-orphan-submissions.mjs --key=<path> [--institution=<id>] [--live]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution (default: every institution).
  --live              Actually delete. Omit for a dry run (the default).
`);

function parseArgs(argv) {
  const parsed = parseOrphanArgs(argv);
  if (parsed.help) printUsageAndExit(0);
  if (parsed.error) {
    console.error(parsed.error);
    printUsageAndExit(1);
  }
  return parsed.opts;
}

const sizesOf = (snap) => snap.docs.map((d) => d.get("fileSize"));

/** The assignment ids under a school that have documents beneath them but no assignment document of their own. */
async function orphanRefs(db, institutionId) {
  const refs = await db
    .collection(`institutions/${institutionId}/assignments`)
    .listDocuments();
  if (refs.length === 0) return [];
  const snaps = await db.getAll(...refs, { fieldMask: ["title"] });
  return snaps.filter((s) => !s.exists).map((s) => s.ref);
}

async function summarise(ref) {
  const submissions = await ref
    .collection("submissions")
    .select("fileSize")
    .get();
  const attempts = await Promise.all(
    submissions.docs.map((s) =>
      s.ref.collection("attempts").select("fileSize").get(),
    ),
  );
  const tombstones = (
    await ref.collection("submissionTombstones").count().get()
  ).data().count;
  return summariseOrphan({
    submissionSizes: sizesOf(submissions),
    attemptSizes: attempts.flatMap(sizesOf),
    tombstones,
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = requireKeyPath(opts.keyPath);
  const db = getFirestore(
    initializeApp({
      credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))),
    }),
  );

  console.log(
    `Mode: ${opts.live ? "LIVE: orphaned submissions will be deleted" : "dry run (nothing is deleted)"}. Grades in results are never touched.`,
  );
  console.log(
    `Scope: ${opts.institution ? `institution ${opts.institution} only` : "all institutions"}`,
  );

  const institutionIds = opts.institution
    ? [opts.institution]
    : (await db.collection("institutions").listDocuments()).map((d) => d.id);

  const found = [];
  for (const institutionId of institutionIds) {
    for (const ref of await orphanRefs(db, institutionId)) {
      const summary = await summarise(ref);
      found.push({ institutionId, assignmentId: ref.id, ...summary });
      console.log(
        `${institutionId} / ${ref.id}: ${summary.submissions} submission(s), ${summary.attempts} attempt(s), ` +
          `${summary.tombstones} tombstone(s), ${formatBytes(summary.bytes)} of files`,
      );
      if (opts.live) await db.recursiveDelete(ref);
    }
  }

  const t = totalOrphans(found);
  console.log("");
  console.log(
    `${t.assignments} deleted assignment(s) with leftovers: ${t.submissions} submission(s), ${t.attempts} attempt(s), ` +
      `${t.tombstones} tombstone(s), ${formatBytes(t.bytes)} of files${opts.live ? ", all deleted." : ". Add --live to delete them."}`,
  );
  writeLog(opts.live, institutionIds, found);
}

function writeLog(live, institutionIds, found) {
  mkdirSync("scripts/logs", { recursive: true });
  const logPath = `scripts/logs/prune-orphan-submissions-${live ? "live" : "dry"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    logPath,
    JSON.stringify({ live, institutionIds, found }, null, 2),
  );
  console.log(`Log: ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
