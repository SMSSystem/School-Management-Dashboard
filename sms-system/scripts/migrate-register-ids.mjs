#!/usr/bin/env node
/**
 * Moves attendance registers saved at automatic ids to the fixed ids the app now uses (ga_<class>_<date>_<session> and
 * sa_<subject>_<class>_<date>), so that each register can only ever be one document. Registers already at their fixed
 * id, such as seeded ones, are left alone.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. --institution is required, so one run touches one
 * school. Each move is one write and one delete. A move that fails changes nothing, and running again picks it up.
 *
 * A move never overwrites: duplicates, and anything already at the new id, are reported and left for a person. A
 * register saved during the run makes its move fail rather than lose the save.
 *
 * WHEN: after the app that saves at fixed ids is deployed, outside school hours. Tabs still open on the old build can
 * create a register at an automatic id, so run it again, or run find-duplicate-records.mjs, a day or so later.
 *
 * Reads: every register of the institution, one billed read each, refused above --max-reads. Every run writes a log of
 * ids and counts to scripts/logs/ (gitignored), with no names or marks.
 *
 * Usage:
 *   node scripts/migrate-register-ids.mjs --key=<path> --institution=<id> [--live] [--max-reads=<n>]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  COLLECTION_IDS,
  moveRegister,
  planMigration,
  withinBudget,
} from "./migrateRegisterIdsLogic.mjs";
import { usageExit, requireKeyPath } from "./adminCli.mjs";

const DEFAULT_MAX_READS = 5000;

const printUsageAndExit = usageExit(`
Usage:
  node scripts/migrate-register-ids.mjs --key=<path> --institution=<id> [--live] [--max-reads=<n>]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  The one institution to migrate. Required.
  --live              Actually move the registers. Omit for a dry run (the default).
  --max-reads=<n>     Refuse to run if it would read more than this (default: ${DEFAULT_MAX_READS}).
`);

function applyArg(opts, arg) {
  if (arg === "--live") opts.live = true;
  else if (arg.startsWith("--key=")) opts.keyPath = arg.slice("--key=".length);
  else if (arg.startsWith("--institution="))
    opts.institution = arg.slice("--institution=".length);
  else if (arg.startsWith("--max-reads="))
    opts.maxReads = Number(arg.slice("--max-reads=".length));
  else if (arg === "--help" || arg === "-h") printUsageAndExit(0);
  else {
    console.error(`Unrecognized argument: ${arg}`);
    printUsageAndExit(1);
  }
}

function parseArgs(argv) {
  const opts = {
    keyPath: null,
    institution: null,
    live: false,
    maxReads: DEFAULT_MAX_READS,
  };
  for (const arg of argv) applyArg(opts, arg);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution ?? "")) {
    console.error(
      "--institution is required, and must be a single institution id (no slashes, dots or spaces).",
    );
    process.exit(1);
  }
  if (!Number.isInteger(opts.maxReads) || opts.maxReads < 1) {
    console.error("--max-reads must be a whole number above 0.");
    process.exit(1);
  }
  return opts;
}

async function migrateCollection(db, institutionRef, name, live) {
  const collectionRef = institutionRef.collection(name);
  const snap = await collectionRef.get();
  const byId = new Map(snap.docs.map((d) => [d.id, d]));
  const plan = planMigration(
    name,
    snap.docs.map((d) => ({ id: d.id, data: d.data() })),
  );

  let moved = 0;
  const failed = [];
  if (live) {
    for (const move of plan.moves) {
      try {
        await moveRegister(db, collectionRef, move, byId.get(move.from));
        moved += 1;
      } catch (err) {
        failed.push({ ...move, error: err.message });
        console.error(`  FAILED ${move.from}: ${err.message}`);
      }
    }
  }

  const verb = live ? `${moved} moved` : `${plan.moves.length} would move`;
  console.log(
    `  ${name}: ${snap.size} read, ${verb}, ${plan.alreadyFixed} already fixed, ` +
      `${plan.conflicts.length} conflict(s), ${plan.missingKey.length} missing a key field, ${failed.length} failed`,
  );
  return { collection: name, read: snap.size, moved, failed, ...plan };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = requireKeyPath(opts.keyPath);
  const db = getFirestore(
    initializeApp({
      credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))),
    }),
  );
  const institutionRef = db.collection("institutions").doc(opts.institution);
  const names = Object.keys(COLLECTION_IDS);

  console.log(
    `Mode: ${opts.live ? "LIVE (will move registers)" : "dry run (nothing will be written)"}`,
  );
  console.log(`Institution: ${opts.institution}`);

  let total = 0;
  for (const name of names) {
    total += (await institutionRef.collection(name).count().get()).data().count;
  }
  console.log(`Registers to read: ${total}`);
  if (!withinBudget(total, opts.maxReads)) {
    console.error(
      `Stopped: ${total} is over --max-reads=${opts.maxReads}. Nothing was read or written.`,
    );
    process.exit(1);
  }

  const results = [];
  for (const name of names)
    results.push(await migrateCollection(db, institutionRef, name, opts.live));

  mkdirSync("scripts/logs", { recursive: true });
  const logPath = `scripts/logs/migrate-register-ids-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    logPath,
    JSON.stringify(
      { live: opts.live, institution: opts.institution, results },
      null,
      2,
    ),
  );
  console.log(`Log: ${logPath}`);
  if (results.some((r) => r.failed.length > 0)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
