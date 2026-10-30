#!/usr/bin/env node
/**
 * Sweeps orphaned large attachments out of the Realtime Database and reconciles
 * its usage counters — docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md,
 * section 8.
 *
 * Lesson-note files and assignment attachments over 500KB (up to 5MB) are kept in
 * the Realtime Database at files/{institutionId}/{key}; Firestore holds only the
 * key (lessonNotes/{id}/attachment/{fileId}.blobKey, one document per file and up to
 * five per note; assignments/{id}.attachmentBlobKey).
 * Firestore never touches the Realtime Database, so a file can be left behind: an
 * upload whose save failed and whose clean-up also failed, a closed tab, or a
 * delete whose follow-up file removal did not run. This finds those files and
 * deletes them, then makes usage/institutions/{id}/bytes and usage/total/bytes
 * match what remains.
 *
 * What it does, in order:
 *   1. lists the stored files WITHOUT downloading them (a shallow listing, then
 *      only each file's size and uploadedAt);
 *   2. collects every key still referenced from Firestore (lesson notes and
 *      assignments, all institutions);
 *   3. sorts each stored file: referenced (kept), recent (unreferenced but
 *      uploaded within the grace period, kept because its record may still be on
 *      its way), unknown age (kept and reported), or orphan (unreferenced and older
 *      than the grace period);
 *   4. reports, and with --apply deletes the orphans and corrects any counter that
 *      differs from the sum of the remaining files.
 * It also reports "dangling" references (a record whose file is gone). It only
 * reports those: it never edits Firestore.
 *
 * DRY RUN BY DEFAULT: nothing is changed unless you pass --apply. It deletes
 * nothing if reading the Firestore references fails, and refuses to delete when no
 * reference at all was found but orphans exist (that looks like a failed read)
 * unless you pass --allow-no-references.
 *
 * --institution=<id> limits a run to ONE institution's folder: only its files are
 * listed, judged and deleted, and only its counter is reconciled (the global total
 * moves by that institution's change alone). Use it for a QA run so nothing else
 * can be touched.
 *
 * Counters are corrected with a transaction that only commits if the counter is
 * still the value read at the start; if someone uploaded meanwhile it is skipped
 * and reported, so run it again (best at a quiet time).
 *
 * Output is counts, sizes and the first 8 characters of a key: a full key is a
 * capability (anyone who has it can read the file), so it is never printed, and
 * file contents are never downloaded or printed.
 *
 * The Spark plan has no scheduler: run this by hand, for example monthly. It uses
 * Firestore reads: one per lesson-note file record plus one per assignment that
 * has a large file.
 *
 * Usage:
 *   node scripts/sweep-orphan-blobs.mjs --key=<path> --project=<id> [--apply]
 *        [--institution=<id>] [--grace-days=7] [--database-url=<url>] [--allow-no-references]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import {
  DAY_MS,
  DEFAULT_GRACE_DAYS,
  classifyBlobs,
  counterPlan,
  findDangling,
  isValidInstitutionId,
  noteFileInstitution,
  pairKey,
  parseGraceDays,
  shortKey,
  sumByInstitution,
  withBadSize,
} from './sweepOrphanBlobsLogic.mjs';

const DELETE_BATCH = 100; // paths per multi-path update
const READ_CONCURRENCY = 10;

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/sweep-orphan-blobs.mjs --key=<path> --project=<id> [options]

  --key=<path>            Service-account JSON key. Required.
  --project=<id>          The Firebase project id you expect to change. Must equal
                          the project_id inside the key file, or the script refuses.
  --apply                 Actually delete orphans and correct counters. Without it
                          the script only reports (dry run).
  --institution=<id>      Limit the run to this one institution's folder (its files,
                          its counter, and the total's share of its change).
  --grace-days=<n>        Only delete files uploaded more than n days ago
                          (default ${DEFAULT_GRACE_DAYS}, minimum 1).
  --database-url=<url>    The Realtime Database URL. Default:
                          https://<project>-default-rtdb.firebaseio.com
  --allow-no-references   Delete orphans even when NO Firestore reference was
                          found at all (normally refused as a probable failed read).
  --help                  Show this text.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    keyPath: null,
    project: null,
    apply: false,
    graceDays: null,
    institution: null,
    databaseUrl: null,
    allowNoReferences: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--project=')) opts.project = arg.slice('--project='.length);
    else if (arg.startsWith('--grace-days=')) opts.graceDays = arg.slice('--grace-days='.length);
    else if (arg.startsWith('--institution=')) opts.institution = arg.slice('--institution='.length);
    else if (arg.startsWith('--database-url=')) opts.databaseUrl = arg.slice('--database-url='.length);
    else if (arg === '--apply') opts.apply = true;
    else if (arg === '--allow-no-references') opts.allowNoReferences = true;
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.keyPath || !opts.project) {
    console.error('Both --key and --project are required.');
    printUsageAndExit(1);
  }
  return opts;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Runs fn over items, at most `limit` at a time, keeping the results in order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The child keys of a path, from the REST "shallow" read: no values are downloaded. */
async function shallowKeys(databaseUrl, token, path) {
  const res = await fetch(`${databaseUrl}/${path}.json?shallow=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Realtime Database ${path}: HTTP ${res.status}`);
  const body = await res.json();
  return body && typeof body === 'object' ? Object.keys(body) : [];
}

const mb = (bytes) => `${(bytes / 1_000_000).toFixed(2)} MB`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let graceDays;
  try {
    graceDays = parseGraceDays(opts.graceDays);
  } catch (e) {
    fail(e.message);
  }

  if (opts.institution !== null && !isValidInstitutionId(opts.institution)) {
    fail('--institution must be a single institution id (no slashes, dots or spaces).');
  }

  if (!existsSync(opts.keyPath)) fail(`Key file not found: ${opts.keyPath}`);
  const serviceAccount = JSON.parse(readFileSync(opts.keyPath, 'utf8'));
  if (serviceAccount.project_id !== opts.project) {
    fail(`Refusing to run: --project is "${opts.project}" but the key belongs to "${serviceAccount.project_id}".`);
  }
  const databaseUrl = (opts.databaseUrl ?? `https://${opts.project}-default-rtdb.firebaseio.com`).replace(/\/$/, '');

  const credential = cert(serviceAccount);
  const app = initializeApp({ credential, databaseURL: databaseUrl });
  const firestore = getFirestore(app);
  const rtdb = getDatabase(app);
  const token = (await credential.getAccessToken()).access_token;

  const nowMs = Date.now();
  const graceMs = graceDays * DAY_MS;
  console.log(`Project: ${opts.project}`);
  console.log(`Mode: ${opts.apply ? 'APPLY (will delete and correct counters)' : 'dry run (nothing will be changed)'}`);
  console.log(`Grace period: ${graceDays} day(s)`);
  console.log(`Scope: ${opts.institution ? `institution ${opts.institution} only` : 'all institutions'}`);
  console.log('');

  // 1. The stored files (metadata only).
  const allFolders = await shallowKeys(databaseUrl, token, 'files');
  const institutionIds = opts.institution ? allFolders.filter((id) => id === opts.institution) : allFolders;
  const blobs = [];
  for (const institutionId of institutionIds) {
    const keys = await shallowKeys(databaseUrl, token, `files/${institutionId}`);
    const found = await mapLimit(keys, READ_CONCURRENCY, async (key) => {
      const [size, uploadedAt] = await Promise.all([
        rtdb.ref(`files/${institutionId}/${key}/size`).get(),
        rtdb.ref(`files/${institutionId}/${key}/uploadedAt`).get(),
      ]);
      return { institutionId, key, size: size.val(), uploadedAt: uploadedAt.val() };
    });
    blobs.push(...found);
  }
  console.log(`Stored files: ${blobs.length} across ${institutionIds.length} institution folder(s).`);

  // 2. Every key still referenced from Firestore. Any failure stops the run before
  //    anything is deleted: a partial reference list would call live files orphans.
  const referenced = new Set();
  try {
    const noteFiles = await firestore.collectionGroup('attachment').select('blobKey').get();
    for (const doc of noteFiles.docs) {
      const institutionId = noteFileInstitution(doc.ref.path);
      const key = doc.get('blobKey');
      if (institutionId && typeof key === 'string' && (!opts.institution || institutionId === opts.institution)) {
        referenced.add(pairKey(institutionId, key));
      }
    }
    const institutions = await firestore.collection('institutions').listDocuments();
    for (const inst of institutions) {
      if (opts.institution && inst.id !== opts.institution) continue;
      const assignments = await inst.collection('assignments').orderBy('attachmentBlobKey').select('attachmentBlobKey').get();
      for (const doc of assignments.docs) {
        const key = doc.get('attachmentBlobKey');
        if (typeof key === 'string') referenced.add(pairKey(inst.id, key));
      }
    }
  } catch (e) {
    fail(`Could not read the Firestore references, so nothing was changed: ${e.message}`);
  }
  console.log(`Referenced keys in Firestore: ${referenced.size}`);
  console.log('');

  // 3. Sort the files.
  const result = classifyBlobs({ blobs, referenced, nowMs, graceMs });
  const dangling = findDangling(referenced, new Set(blobs.map((b) => pairKey(b.institutionId, b.key))));
  const sum = (list) => list.reduce((n, b) => n + (typeof b.size === 'number' ? b.size : 0), 0);

  console.log(`Referenced (kept):               ${result.referenced.length}  (${mb(sum(result.referenced))})`);
  console.log(`Recent, unreferenced (kept):     ${result.recent.length}  (${mb(sum(result.recent))})`);
  console.log(`Unknown age, unreferenced (kept): ${result.unknownAge.length}  (${mb(sum(result.unknownAge))})`);
  console.log(`ORPHANS (older than the grace):  ${result.orphans.length}  (${mb(sum(result.orphans))})`);
  for (const b of result.orphans.slice(0, 20)) {
    const age = typeof b.uploadedAt === 'number' ? `${Math.floor((nowMs - b.uploadedAt) / DAY_MS)} day(s) old` : 'age unknown';
    console.log(`  - ${b.institutionId} ${shortKey(b.key)}  ${mb(typeof b.size === 'number' ? b.size : 0)}  ${age}`);
  }
  if (result.orphans.length > 20) console.log(`  … and ${result.orphans.length - 20} more`);
  if (dangling.length) {
    console.log('');
    console.log(`WARNING: ${dangling.length} Firestore record(s) point at a file that is not in the store (reported only):`);
    for (const pair of dangling.slice(0, 20)) {
      const [inst, key] = pair.split('/');
      console.log(`  - ${inst} ${shortKey(key)}`);
    }
  }
  const bad = withBadSize(blobs);
  if (bad.length) console.log(`WARNING: ${bad.length} stored file(s) have no usable size and count as 0 bytes.`);

  // 4. Counters, from the files that will remain.
  const orphanSet = new Set(result.orphans.map((b) => pairKey(b.institutionId, b.key)));
  const remaining = blobs.filter((b) => !orphanSet.has(pairKey(b.institutionId, b.key)));
  const usage = (await rtdb.ref('usage').get()).val() ?? {};
  const stored = {
    institutions: Object.fromEntries(
      Object.entries(usage.institutions ?? {}).map(([id, v]) => [id, Number(v?.bytes ?? 0)]),
    ),
    total: Number(usage.total?.bytes ?? 0),
  };
  const plan = counterPlan({ stored, actual: sumByInstitution(remaining), institutionId: opts.institution });
  console.log('');
  if (plan.length === 0) console.log('Counters: all match the files that remain.');
  else {
    console.log('Counters that differ from the files that remain:');
    for (const c of plan) console.log(`  - ${c.label}: ${mb(c.from)} -> ${mb(c.to)}`);
  }

  if (!opts.apply) {
    console.log('');
    console.log('Dry run: nothing was changed. Re-run with --apply to delete the orphans and correct the counters.');
    return;
  }

  if (referenced.size === 0 && result.orphans.length > 0 && !opts.allowNoReferences) {
    fail(
      'Refusing to delete: NO Firestore reference was found but orphans exist, which looks like a failed read. ' +
        'If every lesson note and assignment file really was removed, re-run with --allow-no-references.',
    );
  }

  // 5. Delete the orphans (Admin SDK: not subject to the database rules).
  let deleted = 0;
  for (let i = 0; i < result.orphans.length; i += DELETE_BATCH) {
    const updates = {};
    for (const b of result.orphans.slice(i, i + DELETE_BATCH)) updates[`files/${b.institutionId}/${b.key}`] = null;
    await rtdb.ref().update(updates);
    deleted += Object.keys(updates).length;
  }
  console.log('');
  console.log(`Deleted ${deleted} orphan file(s).`);

  // 6. Correct the counters, only where unchanged since they were read.
  let corrected = 0;
  for (const c of plan) {
    // The first call of a transaction often sees null (nothing cached yet) rather than the stored value; returning undefined then
    // would abort without a retry, so hand back a placeholder and let the database re-run it with the real value.
    const outcome = await rtdb.ref(c.path).transaction((current) => {
      if (current === null && c.from !== 0) return 0;
      return Number(current ?? 0) === c.from ? c.to : undefined;
    });
    if (outcome.committed) corrected++;
    else console.log(`  - ${c.label}: changed while the script ran, left alone (run it again).`);
  }
  console.log(`Corrected ${corrected} of ${plan.length} counter(s).`);
}

// The Realtime Database connection stays open after the work is done, so exit explicitly or the process never ends.
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`Failed: ${e.message}`);
    process.exit(1);
  });
