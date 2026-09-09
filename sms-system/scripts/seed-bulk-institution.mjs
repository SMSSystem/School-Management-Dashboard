#!/usr/bin/env node
/**
 * Bulk dummy-data seed script — stress-test institution.
 * See docs/seed/BULK_SEED_SPEC.md for the full design (§3 scope, §6 auth,
 * §7 phase table, §9 architecture, §11 error handling, §13 risks).
 *
 * Populates one dedicated, disposable institution with ~2,500 users and a
 * full term's worth of realistic data, spread across multiple daily runs to
 * respect the Spark-plan free-tier write budget (§4). Resumable via a local
 * checkpoint file; must never touch any institution ID other than its own
 * (§13 — the Admin SDK bypasses firestore.rules entirely, so this script's
 * own internal correctness is the only safety net).
 *
 * Run locally only — requires a service-account key, same pattern as the
 * existing scripts/*.mjs migration tools. Never commit the key or the
 * checkpoint file (see .gitignore).
 *
 * THIS FILE IS BUILT INCREMENTALLY (see spec §14 Implementation Order).
 * Currently implemented:
 *   Phase 0  — institution + registration_directory
 *   Phase 1  — single academic year + single term
 *   Phase 2a — Auth accounts for all 2,500 people (createUser(), §6)
 *   Phase 2b — matching users/{uid} Firestore documents
 * Later implementation-order steps add more phases to PHASE_RUNNERS below —
 * the runner loop simply stops once it reaches a phase with no runner yet.
 *
 * Usage:
 *   node scripts/seed-bulk-institution.mjs [--dry-run] [--key=<path>] [--budget=<n>]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { faker } from '@faker-js/faker';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = path.join(__dirname, '.seed-checkpoint.json');

const BATCH_LIMIT = 450; // §9 — same safety margin as the existing migration scripts
const DEFAULT_WRITE_BUDGET = 10_000; // §3/§4.3 — ~50% of the 20,000 writes/day Spark cap

// §5 — fixed so a resumed run regenerates identical names/values for the
// same logical index instead of drifting on a partial retry. Each phase
// that draws from faker reseeds independently (rather than sharing one
// continuously-advancing sequence across phases) so a run that skips an
// already-complete phase still reproduces every other phase's values
// exactly — see buildRoster()'s own reseed below.
const FAKER_SEED = 424242;

const SEED_EMAIL_DOMAIN = 'seed.test';
const SEED_INSTITUTION_SUFFIX = '(Seed Test Institution)';

// §3/§6 — one shared, clearly-labeled test password for all 2,500 seeded
// accounts. Not treated as a secret: this is an isolated, disposable
// institution nobody else has any reason to sign into. Meets the same
// complexity bar AdminCreateUserForm.tsx's schema enforces client-side
// (≥8 chars, upper+lower+digit) in case the project also enforces a
// server-side password policy that would reject a weaker one.
const SHARED_TEST_PASSWORD = 'SeedTest#2500';

// §3 role distribution, and §7's stated creation order (admins → senior
// teachers → regular teachers → students → parents) so later phases can
// reference already-created teacher/admin UIDs.
const ROLE_ORDER = ['institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent'];
const ROLE_COUNTS = {
  institution_admin: 8,
  senior_teacher: 33,
  regular_teacher: 92,
  student: 1250,
  parent: 1117,
};

// Concurrency for Auth account creation (§6 — "modest concurrent batches,
// e.g. ~20-50 in flight"). createUser() has no bulk endpoint, so this is a
// simple chunked Promise.all rather than a queue/pool library.
const AUTH_CONCURRENCY = 30;

// One entry per §7 phase, in write order. Only phases present in
// PHASE_RUNNERS (below) are actually executed.
const PHASE_ORDER = [
  '0', '1', '2a', '2b', '3', '4', '5', '6', '7', '8', '9',
  '10', '11', '12', '13', '14', '15', '16', '17',
];

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/seed-bulk-institution.mjs [--dry-run] [--key=<path>] [--budget=<n>]

  --dry-run      Log what would be written without touching Firestore, Auth,
                 or the checkpoint file.
  --key=<path>   Path to a service-account JSON key. If omitted, falls back to
                 GOOGLE_APPLICATION_CREDENTIALS.
  --budget=<n>   Override the per-run Firestore write budget (default ${DEFAULT_WRITE_BUDGET},
                 see BULK_SEED_SPEC.md §3/§4.3). Only lower this for local
                 testing — raising it defeats the point of the daily pacing.
                 Does not affect Phase 2a's Auth account creation, which is
                 on a separate quota and always runs to completion (§6).
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { dryRun: false, keyPath: null, budget: DEFAULT_WRITE_BUDGET };
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

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) {
    return {
      institutionId: null,
      emailDomain: null,
      roster: null,
      createdAt: new Date().toISOString(),
      phases: Object.fromEntries(PHASE_ORDER.map((k) => [k, { status: 'pending' }])),
    };
  }
  const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
  // Forward-compatible with phase keys added by later implementation-order
  // steps — an older checkpoint file on disk just gets the new keys appended.
  for (const key of PHASE_ORDER) {
    if (!cp.phases[key]) cp.phases[key] = { status: 'pending' };
  }
  return cp;
}

function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// Institution-nested path helpers — Admin SDK equivalent of src/lib/paths.ts's
// institutionCollection()/institutionDoc() (that file uses the client SDK,
// which this script, running under a service account, cannot use).
function institutionDoc(db, institutionId, name, id) {
  return db.collection('institutions').doc(institutionId).collection(name).doc(id);
}
function institutionCollection(db, institutionId, name) {
  return db.collection('institutions').doc(institutionId).collection(name);
}

function institutionEmailDomain(rawName) {
  const slug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${slug}.${SEED_EMAIL_DOMAIN}`;
}

// Matches src/scenes/(dashboard)/academic-calendar/index.tsx's buildYearName().
function buildYearName(startISO, endISO) {
  return `${startISO.slice(0, 4)}–${endISO.slice(0, 4)}`;
}

const toISO = (d) => d.toISOString().slice(0, 10);

// Writes `items` via db.batch(), respecting both Firestore's per-batch op
// limit (BATCH_LIMIT) and this run's remaining write budget. Returns how
// many of `items` (in order, from the start) were actually written — the
// caller marks exactly that many as done in the checkpoint. Stopping short
// of items.length without error is the normal, expected way a high-volume
// phase spans multiple daily runs (§9, §11), not a failure.
async function budgetedBatchWrite(db, items, budgetRemaining, refFor, dataFor) {
  let batch = db.batch();
  let opsInBatch = 0;
  let written = 0;
  for (const item of items) {
    if (written >= budgetRemaining) break;
    batch.set(refFor(item), dataFor(item));
    opsInBatch++;
    written++;
    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();
  return written;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 0 — institution + registration_directory (§7, §7.1)
// ─────────────────────────────────────────────────────────────────────────
async function runPhase0(ctx, cp, opts) {
  const { db } = ctx;

  // The institution ID is generated once and pinned into the checkpoint
  // before any Firestore write happens — §13's "hard-code / checkpoint-record
  // its one target institution ID" requirement. Every later phase (and every
  // later run) reads it back from here rather than re-deriving it, so a
  // crash between ID-generation and the write below can never orphan a
  // second, differently-ID'd institution on retry.
  if (!cp.institutionId) {
    const ref = db.collection('institutions').doc();
    cp.institutionId = ref.id;
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const institutionId = cp.institutionId;

  faker.seed(FAKER_SEED); // independent of any other phase's faker draws
  const rawName = faker.company.name();
  const name = `${rawName} ${SEED_INSTITUTION_SUFFIX}`;
  const domain = institutionEmailDomain(rawName);
  const signatoryName = faker.person.fullName().slice(0, 30);
  const fullAddress = `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode()}`;

  if (!cp.emailDomain) {
    cp.emailDomain = domain;
    if (!opts.dryRun) saveCheckpoint(cp);
  }

  const institutionPayload = {
    name,
    institutionId,
    createdAt: FieldValue.serverTimestamp(),
    status: 'active',
    // §7.1 field list, verified against institution-profile/index.tsx's
    // saveProfile() (lines 270-291) — everything the real wizard writes on
    // completion, so generateReportCard.ts's profileComplete gate and every
    // report-header field render exactly as they would for a real institution.
    motto: 'Knowledge. Character. Community.',
    phone: faker.phone.number(),
    email: `info@${domain}`,
    address: fullAddress,
    logoUrl: null, // optional field; no image asset generated for this seed —
    // every consumer (ProgressReportPDF.tsx, ReportCardPDF.tsx, etc.) already
    // renders conditionally on its presence.
    authorizedSignature: { mode: 'text', text: signatoryName },
    classSupervisorLabel: 'Class Supervisor',
    gradeSupervisorLabel: 'Grade Supervisor',
    principalLabel: 'Principal',
    vicePrincipalLabel: 'Vice Principal',
    // 'weighted' (not the wizard's own 'flat' default) is a deliberate
    // choice for this seed — it exercises the finer 13-band letter-grade key
    // (A+ ... E) that Report Cards/Progress Reports render, which stresses
    // more of that rendering path than the coarser 4-band default would.
    gradingSystem: 'weighted',
    profileComplete: true,
  };

  const directoryPayload = {
    name,
    logoUrl: null,
    acceptingRegistrations: false,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'seed-bulk-institution-script',
  };

  console.log(`Phase 0: institution "${name}" (${institutionId})`);
  if (opts.dryRun) {
    console.log('  [dry-run] would write institutions/' + institutionId, institutionPayload);
    console.log('  [dry-run] would write registration_directory/' + institutionId, directoryPayload);
    return { writes: 0, complete: true };
  }

  const batch = db.batch();
  batch.set(db.collection('institutions').doc(institutionId), institutionPayload);
  batch.set(db.collection('registration_directory').doc(institutionId), directoryPayload);
  await batch.commit();

  return { writes: 2, complete: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 1 — single academic year + single term (§7, §7.1)
// ─────────────────────────────────────────────────────────────────────────
async function runPhase1(ctx, cp, opts) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!institutionId) {
    throw new Error('Phase 1 requires Phase 0 to have run first (no institutionId in checkpoint).');
  }

  // A single "term/semester" (§3) chosen to comfortably bracket *today* for
  // the whole multi-day seeding window, not just the day this first runs —
  // §7.1 notes the academic-calendar gate is recomputed against the real
  // clock on every read, never stored as a flag. A ~4.5-month term gives
  // well over 10x the ~9-10 day budget-pacing window's worth of margin.
  const today = new Date();
  const termStart = new Date(today);
  termStart.setUTCDate(termStart.getUTCDate() - 14);
  const termEnd = new Date(today);
  termEnd.setUTCDate(termEnd.getUTCDate() + 120);

  const yearStart = new Date(Date.UTC(termStart.getUTCFullYear(), termStart.getUTCMonth(), 1));
  const yearEnd = new Date(Date.UTC(yearStart.getUTCFullYear() + 1, yearStart.getUTCMonth(), 0));

  const todayISO = toISO(today);
  const yearStartISO = toISO(yearStart);
  const yearEndISO = toISO(yearEnd);
  const termStartISO = toISO(termStart);
  const termEndISO = toISO(termEnd);

  const yearName = buildYearName(yearStartISO, yearEndISO);
  const yearId = `${institutionId}_${yearName}`;
  const termId = `${yearId}_1`;

  const yearPayload = {
    institutionId,
    name: yearName,
    startDate: yearStartISO,
    endDate: yearEndISO,
    status: 'active',
    schoolWeekDays: [1, 2, 3, 4, 5],
    createdAt: FieldValue.serverTimestamp(),
  };

  const termPayload = {
    institutionId,
    academicYearId: yearId,
    termNumber: 1,
    name: 'Term 1',
    defaultName: 'Term 1',
    startDate: termStartISO,
    endDate: termEndISO,
    // Matches the real wizard's own status derivation
    // (academic-calendar/index.tsx's confirm()) instead of hardcoding 'active'.
    status: termEndISO < todayISO ? 'completed' : termStartISO <= todayISO ? 'active' : 'upcoming',
  };

  console.log(`Phase 1: academic year "${yearName}" (${yearId}), term "${termPayload.name}" (${termId})`);
  if (opts.dryRun) {
    console.log('  [dry-run] would write academicYears/' + yearId, yearPayload);
    console.log('  [dry-run] would write terms/' + termId, termPayload);
    return { writes: 0, complete: true };
  }

  const batch = db.batch();
  batch.set(institutionDoc(db, institutionId, 'academicYears', yearId), yearPayload);
  batch.set(institutionDoc(db, institutionId, 'terms', termId), termPayload);
  await batch.commit();

  return { writes: 2, complete: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Roster — the 2,500-person identity list shared by Phases 2a, 2b, and every
// later phase that needs to reference a specific teacher/student/parent UID
// (student_parents links, class/subject assignments, results, etc.).
// ─────────────────────────────────────────────────────────────────────────

// Deterministic (§5) — always produces the same 2,500 entries in the same
// order for a given emailDomain, regardless of which phases already ran in
// a prior invocation. Called exactly once per checkpoint's lifetime (see
// runPhase2a) — after that, cp.roster (with its per-entry uid/authCreated/
// firestoreCreated progress) is the source of truth, never rebuilt, so
// progress already recorded is never discarded.
function buildRoster(emailDomain) {
  faker.seed(FAKER_SEED + 1); // independent of Phase 0's institution-level draw
  const roster = [];
  let globalIndex = 0;

  for (const role of ROLE_ORDER) {
    for (let i = 0; i < ROLE_COUNTS[role]; i++) {
      const sex = faker.person.sexType(); // 'male' | 'female'
      const firstName = faker.person.firstName(sex);
      const lastName = faker.person.lastName();
      const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
      // Index suffix guarantees uniqueness even where faker draws the same
      // name twice across ~2,500 people (a real risk at this volume) —
      // not relying on name uniqueness to avoid an Auth email collision.
      const email = `${slug}.${String(globalIndex).padStart(4, '0')}@${emailDomain}`;

      const entry = {
        index: globalIndex,
        role,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        email,
        phone: faker.phone.number(),
        uid: null,
        authCreated: false,
        firestoreCreated: false,
      };

      if (role === 'student') {
        entry.gender = sex === 'male' ? 'Male' : 'Female';
        // Plausible school-age placeholder — a grade-correlated DOB isn't
        // possible yet since class/grade assignment happens later (§7 Phase 5).
        const age = faker.number.int({ min: 5, max: 18 });
        const dob = new Date();
        dob.setUTCFullYear(dob.getUTCFullYear() - age);
        dob.setUTCMonth(faker.number.int({ min: 0, max: 11 }));
        dob.setUTCDate(faker.number.int({ min: 1, max: 28 }));
        entry.dateOfBirth = toISO(dob);
        entry.institutionStudentId = `STU-${String(globalIndex).padStart(5, '0')}`;
      }

      roster.push(entry);
      globalIndex++;
    }
  }

  return roster;
}

// users/{uid} payload matching AdminCreateUserForm.tsx's onSubmit write
// (the real account-creation path) — same base fields for every role, plus
// student-only extensions. classId/houseId/assignedClassId/departmentId are
// deliberately omitted here: those reference classes/houses/departments,
// which don't exist until Phase 4, and are backfilled by later phases (§7
// Phase 5 for student class/house; Phase 4 is expected to backfill teacher
// department/homeroom links when it creates those collections).
function buildUserPayload(entry, institutionId) {
  const payload = {
    uid: entry.uid,
    firstName: entry.firstName,
    lastName: entry.lastName,
    name: entry.name,
    email: entry.email,
    phone: entry.phone,
    role: entry.role,
    institutionId,
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'seed-bulk-institution-script',
  };
  if (entry.role === 'student') {
    payload.dateOfBirth = entry.dateOfBirth;
    payload.institutionStudentId = entry.institutionStudentId;
    payload.gender = entry.gender;
  }
  return payload;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 2a — Auth accounts for all 2,500 people (§6, §7)
// ─────────────────────────────────────────────────────────────────────────
async function runPhase2a(ctx, cp, opts) {
  const { auth } = ctx;
  if (!cp.institutionId || !cp.emailDomain) {
    throw new Error('Phase 2a requires Phase 0 to have run first (no institutionId/emailDomain in checkpoint).');
  }

  if (!cp.roster) {
    cp.roster = buildRoster(cp.emailDomain);
    if (!opts.dryRun) saveCheckpoint(cp);
  }

  const pending = cp.roster.filter((u) => !u.authCreated);
  console.log(`Phase 2a: ${cp.roster.length - pending.length}/${cp.roster.length} Auth accounts already created; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would create ${pending.length} Auth account(s) via createUser(), e.g.`, {
      email: pending[0].email,
      role: pending[0].role,
      displayName: pending[0].name,
    });
    return { writes: 0, complete: true };
  }

  // Not paced by the Firestore write budget (§6 — separate quota) — always
  // attempts every remaining account in this one call.
  for (let i = 0; i < pending.length; i += AUTH_CONCURRENCY) {
    const chunk = pending.slice(i, i + AUTH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (entry) => {
        try {
          const userRecord = await auth.createUser({
            email: entry.email,
            password: SHARED_TEST_PASSWORD,
            displayName: entry.name,
            emailVerified: true,
          });
          entry.uid = userRecord.uid;
        } catch (err) {
          // Idempotency for a resumed/retried run (§9) — if a prior run
          // created this account but crashed before the checkpoint recorded
          // it, look the UID up instead of treating it as a hard failure.
          if (err && err.code === 'auth/email-already-exists') {
            const existing = await auth.getUserByEmail(entry.email);
            entry.uid = existing.uid;
          } else {
            throw err; // §11 — any other error stops the run, no retry loop
          }
        }
        entry.authCreated = true;
      }),
    );
    saveCheckpoint(cp);
    console.log(`  ...${Math.min(i + AUTH_CONCURRENCY, pending.length)}/${pending.length} Auth accounts done`);
  }

  return { writes: 0, complete: true }; // Auth accounts aren't Firestore writes
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 2b — users/{uid} Firestore documents matching Phase 2a (§6, §7)
// ─────────────────────────────────────────────────────────────────────────
async function runPhase2b(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  if (!cp.roster) {
    throw new Error('Phase 2b requires Phase 2a to have run first (no roster in checkpoint).');
  }
  const institutionId = cp.institutionId;

  const pending = cp.roster.filter((u) => u.authCreated && !u.firestoreCreated);
  const alreadyDone = cp.roster.filter((u) => u.firestoreCreated).length;
  const notYetEligible = cp.roster.filter((u) => !u.authCreated).length;
  console.log(
    `Phase 2b: ${alreadyDone}/${cp.roster.length} user docs already written; ${pending.length} ready to write` +
    (notYetEligible ? `; ${notYetEligible} not yet Auth-created (Phase 2a incomplete — preview only)` : '') +
    '.',
  );

  // Genuinely nothing left to do only when every roster entry is both
  // Auth-created and Firestore-written — not just when `pending` (the
  // "ready right now" set) happens to be empty, which is also true before
  // Phase 2a has run for real (e.g. mid dry-run preview).
  if (alreadyDone === cp.roster.length) return { writes: 0, complete: true };
  if (pending.length === 0) return { writes: 0, complete: false };

  if (opts.dryRun) {
    console.log(
      `  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining users/{uid} document(s), e.g.`,
      buildUserPayload(pending[0], institutionId),
    );
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const written = await budgetedBatchWrite(
    db,
    pending,
    budgetRemaining,
    (entry) => db.collection('users').doc(entry.uid),
    (entry) => buildUserPayload(entry, institutionId),
  );

  for (let j = 0; j < written; j++) pending[j].firestoreCreated = true;
  saveCheckpoint(cp);

  return { writes: written, complete: written === pending.length };
}

const PHASE_RUNNERS = {
  '0': runPhase0,
  '1': runPhase1,
  '2a': runPhase2a,
  '2b': runPhase2b,
  // Later implementation-order steps (§14 items 4-7) append '3', '4', ...
  // '17' here, each with its own runPhaseN(ctx, cp, opts, budgetRemaining)
  // function above.
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const cp = loadCheckpoint();
  const ctx = initFirebaseAdmin(opts.keyPath);

  console.log(`Mode: ${opts.dryRun ? 'dry-run' : 'live'} | write budget this run: ${opts.budget}`);
  console.log(`Institution ID: ${cp.institutionId ?? '(not yet created)'}`);
  console.log('');

  let writesThisRun = 0;
  let ranAnyPhase = false;

  for (const key of PHASE_ORDER) {
    const runner = PHASE_RUNNERS[key];
    if (!runner) {
      console.log(`Phase ${key}: not yet implemented — stopping here for this run.`);
      break;
    }
    if (cp.phases[key].status === 'complete') continue;

    const budgetRemaining = opts.budget - writesThisRun;
    if (budgetRemaining <= 0) {
      console.log(`Write budget (${opts.budget}) reached before phase ${key} could start — stopping cleanly.`);
      break;
    }

    ranAnyPhase = true;
    if (!opts.dryRun) {
      cp.phases[key].status = 'in_progress';
      saveCheckpoint(cp);
    }

    const result = await runner(ctx, cp, opts, budgetRemaining);
    writesThisRun += result.writes;

    if (!opts.dryRun) {
      if (result.complete) {
        cp.phases[key].status = 'complete';
        cp.phases[key].completedAt = new Date().toISOString();
        saveCheckpoint(cp);
      } else {
        console.log(`Phase ${key} did not finish this run (write budget exhausted) — will resume next run.`);
        break;
      }
    } else if (!result.complete) {
      // Dry-run preview of a phase that wouldn't finish in one live run —
      // stop the preview here too, since a real run would stop here.
      break;
    }
  }

  if (!ranAnyPhase) {
    console.log('Nothing to do — every implemented phase is already complete.');
  }

  console.log('');
  console.log(`Done. ${writesThisRun} write(s) this run.`);
}

main().catch((err) => {
  // §11 — stop immediately on any error (quota or otherwise); no retry loop.
  // The checkpoint above already reflects only what actually completed
  // before this error, so the next run resumes cleanly.
  console.error('Seed run failed:', err);
  process.exit(1);
});
