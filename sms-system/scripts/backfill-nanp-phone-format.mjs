#!/usr/bin/env node
/**
 * One-time backfill: rewrites stored North American (+1) phone numbers into the
 * canonical +1-XXX-XXX-XXXX form. See
 * docs/formatting/PHONE_NUMBER_FORMATTING_SPEC.md §4.7–§4.8.
 *
 * Why: formatPhone() used to group every digit string in threes, so a number
 * like 18768018972 was stored as "+187 680 189 72". The digits are intact, so
 * only the separators change; the app now formats and displays these correctly
 * on its own, and this script fixes the stored data for people who never open
 * the record again.
 *
 * What it touches: institutions.phone, and users.phone / users.phone2. It does
 * NOT touch registrations, or the institutionPhone snapshots on generated
 * report cards and progress reports (display-time formatting covers those).
 *
 * The decision for each value comes from planPhoneChange() in
 * src/lib/phoneNanp.js, the same function the app uses:
 *   - an explicit 11-digit number starting with 1 and NANP-valid → converted;
 *   - a bare 10-digit number is converted ONLY if its area code and exchange
 *     are NANP-valid AND the owning institution's own phone is a +1 number
 *     (never for the institutions collection itself);
 *   - anything that looks convertible but fails that gate is NEVER rewritten
 *     and is listed in the review file.
 *
 * Safe by default: it is a dry run unless you pass --apply. Both modes write a
 * review file; --apply also writes a before-values backup BEFORE the first
 * write, so a run can be reversed from it.
 *
 * Idempotent — a value that is already canonical, or not NANP, plans as
 * "unchanged". Safe to re-run.
 *
 * Reads: one read per institution and per user (all, or only one institution's
 * with --institution). The Admin SDK's reads count against the Spark plan's
 * free daily quota (50k reads/day), so run per institution for large tenants.
 *
 * Run locally — this requires a service-account key and is never executed
 * from a coding environment. Never commit the key file (see .gitignore).
 * Output goes to scripts/logs/, which is git-ignored (the `logs` rule).
 *
 * Usage:
 *   node scripts/backfill-nanp-phone-format.mjs [--apply] [--institution=<id>]
 *                                               [--out=<dir>] [--key=<path>]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isNanpPhone, planPhoneChange } from '../src/lib/phoneNanp.js';

const BATCH_LIMIT = 450; // stay under Firestore's 500-op batch limit
const USER_FIELDS = ['phone', 'phone2'];

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/backfill-nanp-phone-format.mjs [--apply] [--institution=<id>] [--out=<dir>] [--key=<path>]

  --apply             Write the changes. Without it this is a dry run: nothing is
                      written to Firestore (the review file is still produced).
  --institution=<id>  Only that institution's document and its users.
  --out=<dir>         Where the review and backup files go (default: scripts/logs).
  --key=<path>        Path to a service-account JSON key. If omitted, falls back to
                      GOOGLE_APPLICATION_CREDENTIALS.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { apply: false, institution: null, out: 'scripts/logs', keyPath: null };
  for (const arg of argv) {
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg.startsWith('--institution=')) opts.institution = arg.slice('--institution='.length);
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length);
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  return opts;
}

function initFirestore(keyPath) {
  const credential = keyPath
    ? cert(JSON.parse(readFileSync(keyPath, 'utf8')))
    : applicationDefault();
  return getFirestore(initializeApp({ credential }));
}

// Plans one document's phone fields. Returns the planned writes and skips.
function planDocument(path, data, fields, ctx) {
  const updates = {};
  const before = {};
  const changes = [];
  const skips = [];
  for (const field of fields) {
    const raw = data[field];
    const plan = planPhoneChange(raw, ctx);
    if (plan.action === 'convert') {
      updates[field] = plan.next;
      before[field] = raw;
      changes.push({ path, field, before: raw, after: plan.next, kind: plan.kind });
    } else if (plan.action === 'skip') {
      skips.push({ path, field, value: raw, reason: plan.reason });
    }
  }
  return { updates, before, changes, skips };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = initFirestore(opts.keyPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(opts.out, { recursive: true });

  console.log(
    `Mode: NANP phone backfill — ${opts.apply ? 'APPLY' : 'dry run'}` +
      `${opts.institution ? `, institution ${opts.institution}` : ', all institutions'}`,
  );
  console.log('');

  // ── Institutions: own phone, and whether each tenant is a +1 tenant ──────
  const institutionSnaps = opts.institution
    ? [await db.collection('institutions').doc(opts.institution).get()].filter((s) => s.exists)
    : (await db.collection('institutions').get()).docs;
  if (opts.institution && institutionSnaps.length === 0) {
    console.error(`No institution document found for id "${opts.institution}".`);
    process.exit(1);
  }

  const institutionIsNanp = new Map();
  const planned = []; // { ref, updates, before }
  const changes = [];
  const skips = [];

  for (const snap of institutionSnaps) {
    const data = snap.data();
    institutionIsNanp.set(snap.id, isNanpPhone(data.phone));
    // allowBare: false — an institution's own bare number has no corroboration.
    const result = planDocument(`institutions/${snap.id}`, data, ['phone'], {
      institutionIsNanp: false,
      allowBare: false,
    });
    changes.push(...result.changes);
    skips.push(...result.skips);
    if (Object.keys(result.updates).length > 0) {
      planned.push({ ref: snap.ref, path: `institutions/${snap.id}`, updates: result.updates, before: result.before });
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  const usersQuery = opts.institution
    ? db.collection('users').where('institutionId', '==', opts.institution)
    : db.collection('users');
  const userSnaps = (await usersQuery.get()).docs;

  for (const snap of userSnaps) {
    const data = snap.data();
    const owner = data.institutionId;
    // A user whose institution wasn't loaded (super_admin '*', or outside a
    // scoped run) has no corroboration, so bare numbers are skipped, not guessed.
    const ctx = { institutionIsNanp: institutionIsNanp.get(owner) === true, allowBare: true };
    const result = planDocument(`users/${snap.id}`, data, USER_FIELDS, ctx);
    changes.push(...result.changes);
    skips.push(...result.skips);
    if (Object.keys(result.updates).length > 0) {
      planned.push({ ref: snap.ref, path: `users/${snap.id}`, updates: result.updates, before: result.before });
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const skipReasons = {};
  for (const s of skips) skipReasons[s.reason] = (skipReasons[s.reason] ?? 0) + 1;
  const summary = {
    mode: opts.apply ? 'apply' : 'dry-run',
    scope: opts.institution ?? 'all',
    institutionsRead: institutionSnaps.length,
    usersRead: userSnaps.length,
    documentsToChange: planned.length,
    valuesConverted: changes.length,
    explicitConversions: changes.filter((c) => c.kind === 'explicit').length,
    bareConversions: changes.filter((c) => c.kind === 'bare').length,
    skipped: skips.length,
    skippedByReason: skipReasons,
  };
  const reviewPath = join(opts.out, `phone-backfill-review-${stamp}.json`);
  writeFileSync(reviewPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, changes, skips }, null, 2));

  console.log(`Read ${summary.institutionsRead} institution(s) and ${summary.usersRead} user(s).`);
  console.log(
    `${opts.apply ? 'Converting' : 'Would convert'} ${summary.valuesConverted} value(s) in ${summary.documentsToChange} document(s) ` +
      `(${summary.explicitConversions} explicit +1, ${summary.bareConversions} bare 10-digit).`,
  );
  console.log(`Skipped ${summary.skipped} value(s) that look convertible but fail the gate (never rewritten):`);
  for (const [reason, n] of Object.entries(skipReasons)) console.log(`  ${reason}: ${n}`);
  console.log(`Review file: ${reviewPath}`);
  console.log('');

  if (!opts.apply) {
    console.log('Dry run — nothing written. Review the file, then re-run with --apply.');
    return;
  }
  if (planned.length === 0) {
    console.log('Nothing to write.');
    return;
  }

  // ── Backup first, then write ──────────────────────────────────────────────
  const backupPath = join(opts.out, `phone-backfill-before-${stamp}.json`);
  const backup = {};
  for (const p of planned) backup[p.path] = p.before;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Before-values backup: ${backupPath}`);

  let batch = db.batch();
  let opsInBatch = 0;
  let written = 0;
  for (const p of planned) {
    batch.update(p.ref, p.updates);
    opsInBatch++;
    written++;
    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  console.log(`Wrote ${written} document(s). Done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
