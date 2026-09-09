#!/usr/bin/env node
/**
 * Bulk dummy-data teardown script — deletes the stress-test institution
 * created by scripts/seed-bulk-institution.mjs.
 * See docs/seed/BULK_SEED_SPEC.md §12 for the full design (§9 architecture,
 * §11 error handling, and §13 risks all apply equally here).
 *
 * This is a companion, not a wrapper: it never imports or invokes the seed
 * script directly. It reads the seed script's own checkpoint file
 * (scripts/.seed-checkpoint.json) as read-only source data — the
 * institution ID, the full 2,500-person roster (with the Auth UIDs Phase 2a
 * assigned), and the student_parents family-link list Phase 3 computed —
 * and uses that to know exactly what to delete, never a broad query (§12,
 * §13's "own internal correctness is the only safety net" applies here too).
 *
 * Firestore has no cascade-delete, so every institution-nested subcollection
 * listed in BULK_SEED_SPEC.md §7 is drained explicitly, in paginated
 * budgeted batches, resumable across multiple daily runs via this script's
 * own local checkpoint (scripts/.teardown-checkpoint.json) — deleting
 * ~100,000 documents is itself a multi-day operation under the same Spark
 * delete-quota constraints §4 already established for writes.
 *
 * Run locally only — requires a service-account key, same pattern as the
 * seed script and the existing scripts/*.mjs migration tools. Never commit
 * the key or either checkpoint file (see .gitignore).
 *
 * Usage:
 *   node scripts/teardown-bulk-institution.mjs [--dry-run] [--key=<path>] [--budget=<n>]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_CHECKPOINT_PATH = path.join(__dirname, '.seed-checkpoint.json');
const TEARDOWN_CHECKPOINT_PATH = path.join(__dirname, '.teardown-checkpoint.json');

const BATCH_LIMIT = 450; // §9 — same safety margin as the seed script and existing migration scripts
const DEFAULT_DELETE_BUDGET = 10_000; // §12 — "respects the same daily write/delete budget" as the seed script (§3/§4.3)

// Must match seed-bulk-institution.mjs's own SEED_INSTITUTION_SUFFIX exactly
// — used only for the live-mode safety check below (verifySeedInstitutionName),
// never for deriving which institution to target (that always comes from the
// seed checkpoint's pinned institutionId, per §13).
const SEED_INSTITUTION_SUFFIX = '(Seed Test Institution)';

// §7's write order, reversed. Firestore has no referential integrity for the
// Admin SDK to violate, so this order isn't load-bearing for correctness —
// it's kept only so this list reads as a tidy mirror of §7's phase table for
// anyone auditing it against the spec. `gradebooks` (has a nested `columns`
// subcollection) and the four non-nested steps (users, student_parents,
// auth, institution) each get their own dedicated runner below instead of
// this generic list.
const NESTED_COLLECTIONS = [
  'enrollmentRegistrations',
  'progressReports',
  'reportCards',
  'reportCardComments',
  'disciplinaryActions',
  'studentResponsibilities',
  'studentActivities',
  'attendanceSummaries',
  'subjectAttendance',
  'generalAttendance',
  'feedback_comments',
  'results',
  'assignments',
  'exams',
  'timetable_slots',
  'subjectEnrollments',
  'subjects',
  'classes',
  'departments',
  'houses',
  'terms',
  'academicYears',
];

const TEARDOWN_PHASE_ORDER = [
  ...NESTED_COLLECTIONS,
  'gradebooks',
  'users',
  'student_parents',
  'auth',
  'institution',
];

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/teardown-bulk-institution.mjs [--dry-run] [--key=<path>] [--budget=<n>]

  --dry-run      Log what would be deleted without touching Firestore, Auth,
                 or either checkpoint file (same contract as the seed
                 script's --dry-run — see BULK_SEED_SPEC.md §11). Because
                 that means no live reads either, per-collection counts are
                 not shown in dry-run mode; only what's already known from
                 the seed checkpoint (roster/link list lengths) is printed.
  --key=<path>   Path to a service-account JSON key. If omitted, falls back to
                 GOOGLE_APPLICATION_CREDENTIALS.
  --budget=<n>   Override the per-run Firestore delete budget (default ${DEFAULT_DELETE_BUDGET},
                 see BULK_SEED_SPEC.md §12). Only lower this for local
                 testing — raising it defeats the point of the daily pacing.
                 Does not affect the Auth-deletion phase, which is on a
                 separate quota and always runs to completion in one go.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { dryRun: false, keyPath: null, budget: DEFAULT_DELETE_BUDGET };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--budget=')) {
      const n = Number(arg.slice('--budget='.length));
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --budget value: ${arg}`);
        printUsageAndExit(1);
      }
      opts.budget = n;
    } else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  return opts;
}

function initFirebaseAdmin(keyPath) {
  const credential = keyPath
    ? cert(JSON.parse(readFileSync(keyPath, 'utf8')))
    : applicationDefault();
  const app = initializeApp({ credential });
  return { db: getFirestore(app), auth: getAuth(app) };
}

function loadSeedCheckpoint() {
  if (!existsSync(SEED_CHECKPOINT_PATH)) {
    throw new Error(
      `No seed checkpoint found at ${SEED_CHECKPOINT_PATH}. Teardown reads the ` +
      `institution ID, roster, and family-link list the seed script itself ` +
      `produced (§12) — there is nothing to tear down without it. If the seed ` +
      `institution was already fully torn down and this file was cleaned up ` +
      `afterward, there's nothing left to do.`,
    );
  }
  return JSON.parse(readFileSync(SEED_CHECKPOINT_PATH, 'utf8'));
}

function loadTeardownCheckpoint(seedCp) {
  if (!existsSync(TEARDOWN_CHECKPOINT_PATH)) {
    if (!seedCp.institutionId) {
      throw new Error('Seed checkpoint has no institutionId yet (Phase 0 never ran) — nothing to tear down.');
    }
    return {
      // Pinned once, from the seed checkpoint, exactly like the seed
      // script's own Phase 0 pins institutionId into its checkpoint on
      // first write (§13) — so a teardown resumed days later keeps
      // targeting the same institution even if the seed checkpoint file is
      // later replaced or edited (§16 Operating Rule 3's spirit, applied to
      // teardown's own resumability).
      institutionId: seedCp.institutionId,
      createdAt: new Date().toISOString(),
      progress: {},
      authDeleted: false,
      phases: Object.fromEntries(TEARDOWN_PHASE_ORDER.map((k) => [k, { status: 'pending' }])),
    };
  }
  const cp = JSON.parse(readFileSync(TEARDOWN_CHECKPOINT_PATH, 'utf8'));
  for (const key of TEARDOWN_PHASE_ORDER) {
    if (!cp.phases[key]) cp.phases[key] = { status: 'pending' };
  }
  return cp;
}

function saveCheckpoint(cp) {
  writeFileSync(TEARDOWN_CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

function institutionCollection(db, institutionId, name) {
  return db.collection('institutions').doc(institutionId).collection(name);
}

// Refuses to proceed if institutions/{id}'s stored name doesn't look like
// this seed's own disposable institution (§13/§16 Operating Rule 2's
// "handed off explicitly" risk — a stale or mismatched checkpoint pointing
// teardown at the wrong document would otherwise have no safety net, since
// the Admin SDK bypasses firestore.rules entirely). Live mode only — never
// called in dry-run, which must never touch Firestore (see printUsageAndExit).
// A missing document is treated as "already deleted by an earlier teardown
// run," not a failure.
async function verifySeedInstitutionName(db, institutionId) {
  const snap = await db.collection('institutions').doc(institutionId).get();
  if (!snap.exists) {
    console.log(`institutions/${institutionId} is already gone (an earlier teardown run likely finished the "institution" phase) — skipping the seed-name safety check.`);
    return;
  }
  const name = snap.data()?.name ?? '';
  if (!name.endsWith(SEED_INSTITUTION_SUFFIX)) {
    throw new Error(
      `Safety check failed: institutions/${institutionId}'s name ("${name}") does not end ` +
      `with "${SEED_INSTITUTION_SUFFIX}". Refusing to run teardown against a document that ` +
      `doesn't look like this seed's own disposable institution (BULK_SEED_SPEC.md §13/§16). ` +
      `If this really is the seed institution, find out why its name changed before proceeding.`,
    );
  }
}

// Deletes `refs` (already-resumed — callers pass only what's still pending)
// in budgeted, BATCH_LIMIT-sized batches. Mirrors seed-bulk-institution.mjs's
// budgetedBatchWrite exactly, but for deletes against a known ref list
// rather than a set()/update() payload — same onProgress-fires-per-batch
// contract, for the same mid-phase-crash-safety reason (§9).
async function budgetedRefListDelete(db, refs, budgetRemaining, { onProgress } = {}) {
  let batch = db.batch();
  let opsInBatch = 0;
  let deleted = 0;
  for (const ref of refs) {
    if (deleted >= budgetRemaining) break;
    batch.delete(ref);
    opsInBatch++;
    deleted++;
    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      onProgress?.(deleted);
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) {
    await batch.commit();
    onProgress?.(deleted);
  }
  return deleted;
}

// Generic runner for every institution-nested collection that has no nested
// subcollection of its own (i.e. everything in NESTED_COLLECTIONS — see
// runTeardownGradebooks below for the one exception). Repeatedly queries a
// budget-sized page and deletes it; since deleted documents can never
// reappear in a later query against the same collection, no resume cursor
// is needed beyond "keep draining until a page comes back short or empty" —
// the standard Firestore bulk-delete pattern. A page shorter than requested
// proves the collection is now empty (nothing else writes to this
// institution while teardown runs — §16 Operating Rule 3), so that's what
// marks the phase complete.
function makeNestedCollectionRunner(name) {
  return async function runner(ctx, cp, opts, budgetRemaining) {
    const { db } = ctx;
    const collectionRef = institutionCollection(db, cp.institutionId, name);

    if (opts.dryRun) {
      console.log(`Phase ${name}: [dry-run] would drain institutions/${cp.institutionId}/${name} via paginated batch delete (no live read performed in dry-run mode).`);
      return { deletes: 0, complete: true };
    }

    if (!cp.progress[name]) cp.progress[name] = { deleted: 0 };
    let deletedThisRun = 0;
    let drained = false;
    while (deletedThisRun < budgetRemaining) {
      const take = Math.min(BATCH_LIMIT, budgetRemaining - deletedThisRun);
      const snap = await collectionRef.limit(take).get();
      if (snap.empty) { drained = true; break; }

      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      deletedThisRun += snap.docs.length;
      cp.progress[name].deleted += snap.docs.length;
      saveCheckpoint(cp);

      if (snap.docs.length < take) { drained = true; break; }
    }

    console.log(`Phase ${name}: deleted ${deletedThisRun} document(s) this run (${cp.progress[name].deleted} total).`);
    return { deletes: deletedThisRun, complete: drained };
  };
}

// gradebooks is the one nested collection with its own nested subcollection
// (columns, §7 Phase 7) — deleting a gradebook doc does not cascade-delete
// its columns, so each gradebook's columns must be deleted first. Processes
// one gradebook at a time (its own tiny batch of up to 6 ops: <=5 columns +
// 1 parent) rather than paging BATCH_LIMIT gradebooks into one giant batch,
// which keeps the per-gradebook budget accounting exact without needing to
// predict how many columns any given gradebook actually has.
async function runTeardownGradebooks(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const collectionRef = institutionCollection(db, cp.institutionId, 'gradebooks');

  if (opts.dryRun) {
    console.log(`Phase gradebooks: [dry-run] would drain institutions/${cp.institutionId}/gradebooks (+ each doc's columns subcollection) via paginated batch delete (no live read performed in dry-run mode).`);
    return { deletes: 0, complete: true };
  }

  if (!cp.progress.gradebooks) cp.progress.gradebooks = { deleted: 0 };
  const GRADEBOOK_PAGE = 50; // each gradebook costs up to 6 delete ops (1 parent + <=5 columns); 50/page stays well under BATCH_LIMIT even in the worst case
  let deletedThisRun = 0;
  let drained = false;
  let budgetExhausted = false;

  while (!drained && !budgetExhausted) {
    const snap = await collectionRef.limit(GRADEBOOK_PAGE).get();
    if (snap.empty) { drained = true; break; }

    for (const doc of snap.docs) {
      if (deletedThisRun >= budgetRemaining) { budgetExhausted = true; break; }
      const columns = await doc.ref.collection('columns').get();
      const batch = db.batch();
      columns.docs.forEach((col) => batch.delete(col.ref));
      batch.delete(doc.ref);
      await batch.commit();

      const opsThisDoc = columns.docs.length + 1;
      deletedThisRun += opsThisDoc;
      cp.progress.gradebooks.deleted += opsThisDoc;
      saveCheckpoint(cp);
    }

    if (!budgetExhausted && snap.docs.length < GRADEBOOK_PAGE) drained = true;
  }

  console.log(`Phase gradebooks: deleted ${deletedThisRun} document(s) (parents+columns) this run (${cp.progress.gradebooks.deleted} total).`);
  return { deletes: deletedThisRun, complete: drained };
}

// users/{uid} is top-level, not institution-nested, so it's the one place
// teardown could accidentally reach outside its own institution if it ever
// queried by institutionId instead of by explicit UID — per §12/§13, this
// uses the seed checkpoint's own recorded UID list instead, never a query.
async function runTeardownUsers(ctx, cp, opts, budgetRemaining) {
  const { db, seedCp } = ctx;
  const uids = (seedCp.roster ?? []).filter((u) => u.uid).map((u) => u.uid);

  if (!cp.progress.users) cp.progress.users = { deleted: 0 };
  const pending = uids.slice(cp.progress.users.deleted);

  if (opts.dryRun) {
    console.log(`Phase users: [dry-run] would delete up to ${pending.length} of ${uids.length} users/{uid} document(s) (from the seed checkpoint's roster, not a query).`);
    return { deletes: 0, complete: pending.length <= budgetRemaining };
  }

  if (pending.length === 0) return { deletes: 0, complete: true };

  const refs = pending.map((uid) => db.collection('users').doc(uid));
  const base = cp.progress.users.deleted;
  const deletedThisRun = await budgetedRefListDelete(db, refs, budgetRemaining, {
    onProgress: (n) => {
      cp.progress.users.deleted = base + n;
      saveCheckpoint(cp);
    },
  });

  console.log(`Phase users: deleted ${deletedThisRun} document(s) this run (${cp.progress.users.deleted}/${uids.length} total).`);
  return { deletes: deletedThisRun, complete: (base + deletedThisRun) === uids.length };
}

// student_parents/{parentUid_studentUid} is also top-level. Its doc IDs
// aren't in the roster directly — they're derived from the seed checkpoint's
// own cp.familyLinks (parentIndex/studentIndex pairs Phase 3 computed and
// persisted), resolved back to UIDs via that same roster. Only links Phase 3
// actually marked `written` are included — a link that was never written
// has nothing to delete (deleting a nonexistent doc is harmless but would
// still cost a real delete op against the daily quota for nothing).
async function runTeardownStudentParents(ctx, cp, opts, budgetRemaining) {
  const { db, seedCp } = ctx;
  const roster = seedCp.roster ?? [];
  const links = (seedCp.familyLinks ?? []).filter((l) => l.written);
  const docIds = links.map((l) => `${roster[l.parentIndex]?.uid}_${roster[l.studentIndex]?.uid}`);

  if (!cp.progress.student_parents) cp.progress.student_parents = { deleted: 0 };
  const pending = docIds.slice(cp.progress.student_parents.deleted);

  if (opts.dryRun) {
    console.log(`Phase student_parents: [dry-run] would delete up to ${pending.length} of ${docIds.length} student_parents link(s) (from the seed checkpoint's family-link list, not a query).`);
    return { deletes: 0, complete: pending.length <= budgetRemaining };
  }

  if (pending.length === 0) return { deletes: 0, complete: true };

  const refs = pending.map((id) => db.collection('student_parents').doc(id));
  const base = cp.progress.student_parents.deleted;
  const deletedThisRun = await budgetedRefListDelete(db, refs, budgetRemaining, {
    onProgress: (n) => {
      cp.progress.student_parents.deleted = base + n;
      saveCheckpoint(cp);
    },
  });

  console.log(`Phase student_parents: deleted ${deletedThisRun} document(s) this run (${cp.progress.student_parents.deleted}/${docIds.length} total).`);
  return { deletes: deletedThisRun, complete: (base + deletedThisRun) === docIds.length };
}

// Firebase Auth account deletion — on a separate quota from Firestore (§6's
// Auth-creation precedent applies symmetrically here), so this always
// attempts every remaining account in one call, chunked only at
// deleteUsers()'s own 1,000-UID-per-call limit, ignoring budgetRemaining
// entirely (matching runPhase2a's signature, which also omits it).
async function runTeardownAuth(ctx, cp, opts) {
  const { auth, seedCp } = ctx;
  const uids = (seedCp.roster ?? []).filter((u) => u.uid).map((u) => u.uid);

  if (cp.authDeleted) return { deletes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`Phase auth: [dry-run] would delete ${uids.length} Auth account(s) via deleteUsers() (from the seed checkpoint's roster).`);
    return { deletes: 0, complete: true };
  }

  if (uids.length === 0) {
    cp.authDeleted = true;
    saveCheckpoint(cp);
    return { deletes: 0, complete: true };
  }

  const AUTH_DELETE_CHUNK = 1000;
  for (let i = 0; i < uids.length; i += AUTH_DELETE_CHUNK) {
    const chunk = uids.slice(i, i + AUTH_DELETE_CHUNK);
    const result = await auth.deleteUsers(chunk);
    // A resumed run re-attempts every UID rather than tracking per-account
    // state — safe because deleteUsers() (this batch API, unlike the
    // singular deleteUser()) already treats a nonexistent/already-deleted
    // UID as a successful deletion internally and never populates `errors`
    // for it, so nothing here needs to special-case that case itself. Any
    // entry that does show up in `errors` is a genuine failure (§11 — stops
    // the run rather than silently continuing).
    if (result.errors.length > 0) {
      throw new Error(`Auth deletion failed for ${result.errors.length} account(s): ${JSON.stringify(result.errors.slice(0, 3).map((f) => ({ index: f.index, code: f.error.code })))}`);
    }
    console.log(`  ...${Math.min(i + AUTH_DELETE_CHUNK, uids.length)}/${uids.length} Auth accounts deleted (or already gone)`);
  }

  cp.authDeleted = true;
  saveCheckpoint(cp);
  return { deletes: 0, complete: true };
}

// Last phase (§12 step 4) — institutions/{id} and registration_directory/{id}
// themselves, deleted together once every subcollection, user, link, and
// Auth account is gone.
async function runTeardownInstitution(ctx, cp, opts) {
  const { db } = ctx;
  const institutionId = cp.institutionId;

  if (opts.dryRun) {
    console.log(`Phase institution: [dry-run] would delete institutions/${institutionId} and registration_directory/${institutionId}.`);
    return { deletes: 0, complete: true };
  }

  const batch = db.batch();
  batch.delete(db.collection('institutions').doc(institutionId));
  batch.delete(db.collection('registration_directory').doc(institutionId));
  await batch.commit();

  console.log(`Phase institution: deleted institutions/${institutionId} and registration_directory/${institutionId}.`);
  return { deletes: 2, complete: true };
}

const TEARDOWN_RUNNERS = {
  ...Object.fromEntries(NESTED_COLLECTIONS.map((name) => [name, makeNestedCollectionRunner(name)])),
  gradebooks: runTeardownGradebooks,
  users: runTeardownUsers,
  student_parents: runTeardownStudentParents,
  auth: runTeardownAuth,
  institution: runTeardownInstitution,
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const seedCp = loadSeedCheckpoint();
  const cp = loadTeardownCheckpoint(seedCp);
  const { db, auth } = initFirebaseAdmin(opts.keyPath);
  const ctx = { db, auth, seedCp };

  console.log(`Mode: ${opts.dryRun ? 'dry-run' : 'live'} | delete budget this run: ${opts.budget}`);
  console.log(`Institution ID: ${cp.institutionId}`);
  console.log('');

  if (!opts.dryRun) {
    await verifySeedInstitutionName(db, cp.institutionId);
  }

  let deletesThisRun = 0;
  let ranAnyPhase = false;

  for (const key of TEARDOWN_PHASE_ORDER) {
    if (cp.phases[key].status === 'complete') continue;

    const budgetRemaining = opts.budget - deletesThisRun;
    if (budgetRemaining <= 0) {
      console.log(`Delete budget (${opts.budget}) reached before phase ${key} could start — stopping cleanly.`);
      break;
    }

    ranAnyPhase = true;
    if (!opts.dryRun) {
      cp.phases[key].status = 'in_progress';
      saveCheckpoint(cp);
    }

    const result = await TEARDOWN_RUNNERS[key](ctx, cp, opts, budgetRemaining);
    deletesThisRun += result.deletes;

    if (!opts.dryRun) {
      if (result.complete) {
        cp.phases[key].status = 'complete';
        cp.phases[key].completedAt = new Date().toISOString();
        saveCheckpoint(cp);
      } else {
        console.log(`Phase ${key} did not finish this run (delete budget exhausted) — will resume next run.`);
        break;
      }
    } else if (!result.complete) {
      break;
    }
  }

  if (!ranAnyPhase) {
    console.log('Nothing to do — every teardown phase is already complete.');
  }

  console.log('');
  console.log(`Done. ${deletesThisRun} delete(s) this run.`);
}

main().catch((err) => {
  // §11's philosophy applies here too — stop immediately on any error, no
  // retry loop. Both checkpoints above already reflect only what actually
  // completed before this error, so the next run resumes cleanly.
  console.error('Teardown run failed:', err);
  process.exit(1);
});
