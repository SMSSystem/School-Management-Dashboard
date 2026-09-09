#!/usr/bin/env node
/**
 * Bulk dummy-data seed script — stress-test institution.
 * See docs/seed/BULK_SEED_SPEC.md for the full design (§3 scope, §7 phase
 * table, §9 architecture, §11 error handling, §13 risks).
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
 * Currently implemented: Phase 0 (institution + registration_directory) and
 * Phase 1 (single academic year + single term). Later implementation-order
 * steps add more phases to PHASE_RUNNERS below — the runner loop simply
 * stops once it reaches a phase with no runner yet.
 *
 * Usage:
 *   node scripts/seed-bulk-institution.mjs [--dry-run] [--key=<path>] [--budget=<n>]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { faker } from '@faker-js/faker';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = path.join(__dirname, '.seed-checkpoint.json');

const BATCH_LIMIT = 450; // §9 — same safety margin as the existing migration scripts
const DEFAULT_WRITE_BUDGET = 10_000; // §3/§4.3 — ~50% of the 20,000 writes/day Spark cap

// §5 — fixed so a resumed run regenerates identical names/values for the
// same logical index instead of drifting on a partial retry.
const FAKER_SEED = 424242;

const SEED_EMAIL_DOMAIN = 'seed.test';
const SEED_INSTITUTION_SUFFIX = '(Seed Test Institution)';

// One entry per §7 phase, in write order. Only phases present in
// PHASE_RUNNERS (below) are actually executed.
const PHASE_ORDER = [
  '0', '1', '2a', '2b', '3', '4', '5', '6', '7', '8', '9',
  '10', '11', '12', '13', '14', '15', '16', '17',
];

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/seed-bulk-institution.mjs [--dry-run] [--key=<path>] [--budget=<n>]

  --dry-run      Log what would be written without touching Firestore or the
                 checkpoint file.
  --key=<path>   Path to a service-account JSON key. If omitted, falls back to
                 GOOGLE_APPLICATION_CREDENTIALS.
  --budget=<n>   Override the per-run Firestore write budget (default ${DEFAULT_WRITE_BUDGET},
                 see BULK_SEED_SPEC.md §3/§4.3). Only lower this for local
                 testing — raising it defeats the point of the daily pacing.
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

function initFirestore(keyPath) {
  const credential = keyPath
    ? cert(JSON.parse(readFileSync(keyPath, 'utf8')))
    : applicationDefault();
  const app = initializeApp({ credential });
  return getFirestore(app);
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) {
    return {
      institutionId: null,
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

// ─────────────────────────────────────────────────────────────────────────
// Phase 0 — institution + registration_directory (§7, §7.1)
// ─────────────────────────────────────────────────────────────────────────
async function runPhase0(db, cp, opts) {
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

  const rawName = faker.company.name();
  const name = `${rawName} ${SEED_INSTITUTION_SUFFIX}`;
  const domain = institutionEmailDomain(rawName);
  const signatoryName = faker.person.fullName().slice(0, 30);
  const fullAddress = `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode()}`;

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
    return 0;
  }

  const batch = db.batch();
  batch.set(db.collection('institutions').doc(institutionId), institutionPayload);
  batch.set(db.collection('registration_directory').doc(institutionId), directoryPayload);
  await batch.commit();

  return 2; // writes
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 1 — single academic year + single term (§7, §7.1)
// ─────────────────────────────────────────────────────────────────────────
async function runPhase1(db, cp, opts) {
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
    return 0;
  }

  const batch = db.batch();
  batch.set(institutionDoc(db, institutionId, 'academicYears', yearId), yearPayload);
  batch.set(institutionDoc(db, institutionId, 'terms', termId), termPayload);
  await batch.commit();

  return 2; // writes
}

const PHASE_RUNNERS = {
  '0': runPhase0,
  '1': runPhase1,
  // Later implementation-order steps (§14 items 3-7) append '2a', '2b', '3',
  // ... '17' here, each with its own runPhaseN(db, cp, opts) function above.
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  faker.seed(FAKER_SEED);

  const cp = loadCheckpoint();
  const db = initFirestore(opts.keyPath);

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

    if (writesThisRun >= opts.budget) {
      console.log(`Write budget (${opts.budget}) reached before phase ${key} could start — stopping cleanly.`);
      break;
    }

    ranAnyPhase = true;
    cp.phases[key].status = 'in_progress';
    if (!opts.dryRun) saveCheckpoint(cp);

    const writes = await runner(db, cp, opts);
    writesThisRun += writes;

    if (!opts.dryRun) {
      cp.phases[key].status = 'complete';
      cp.phases[key].completedAt = new Date().toISOString();
      saveCheckpoint(cp);
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
