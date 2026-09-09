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
 *   Phase 3  — student_parents links (sibling-family clustering)
 *   Phase 4  — houses, departments, classes, subjects, subjectEnrollments
 *   Phase 5  — student class/house assignment
 *   Phase 6  — timetable_slots, exams, assignments
 *   Phase 7  — gradebooks + columns
 *   Phase 8  — results (highest-volume phase — spans multiple daily runs)
 *   Phase 9  — feedback_comments
 *   Phase 10 — generalAttendance
 *   Phase 11 — subjectAttendance
 *   Phase 12 — attendanceSummaries (generation-equivalent, mirrors
 *              src/lib/attendanceSummaryUtils.ts's rebuildSummariesForClass())
 *   Phase 13 — studentActivities, studentResponsibilities, disciplinaryActions
 *   Phase 14 — reportCardComments
 *   Phase 15a/15b — reportCards (generation-equivalent, mirrors
 *              src/lib/generateReportCard.ts + report-cards/index.tsx's
 *              handleBatchGenerate() two-pass generate-then-rank flow)
 *   Phase 16 — progressReports (generation-equivalent, mirrors
 *              src/lib/generateProgressReport.ts)
 *   Phase 17 — enrollmentRegistrations (small illustrative sample)
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

// §3 reference-data shape (Phase 4). 6 houses, 8 departments, 42 classes
// (6 grades x 7 sections, ~30 students/class), 12 subjects.
const HOUSE_NAMES = ['Cedar', 'Maple', 'Oak', 'Willow', 'Birch', 'Elm'];

const DEPARTMENT_NAMES = [
  'Mathematics', 'Sciences', 'English & Languages', 'Humanities',
  'Physical Education', 'Computer Science', 'Arts', 'Business Studies',
];

const GRADE_LEVELS = [7, 8, 9, 10, 11, 12];
const CLASS_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']; // 6 x 7 = 42 classes

// 8 "core" subjects apply institution-wide (every class); 4 "elective"
// subjects are class-scoped, each assigned to a rotating subset of classes
// (§7 Phase 4) — this keeps the average subjects/student close to the ~8
// figure BULK_SEED_SPEC.md §4 estimates (actual: 8 core + 1 elective = 9),
// rather than every student taking all 12 (which would inflate Phase 8/9's
// write volume by roughly 50%).
const SUBJECTS = [
  { name: 'Mathematics', department: 'Mathematics', core: true, days: [1, 3] },
  { name: 'English Language', department: 'English & Languages', core: true, days: [1, 4] },
  { name: 'Biology', department: 'Sciences', core: true, days: [2] },
  { name: 'Chemistry', department: 'Sciences', core: true, days: [3] },
  { name: 'Physics', department: 'Sciences', core: true, days: [4] },
  { name: 'History', department: 'Humanities', core: true, days: [2] },
  { name: 'Geography', department: 'Humanities', core: true, days: [5] },
  { name: 'Physical Education', department: 'Physical Education', core: true, days: [5] },
  { name: 'French', department: 'English & Languages', core: false, days: [2] },
  { name: 'Computer Science', department: 'Computer Science', core: false, days: [3] },
  { name: 'Visual Arts', department: 'Arts', core: false, days: [4] },
  { name: 'Business Studies', department: 'Business Studies', core: false, days: [1] },
];

const houseDocId = (name) => `house_${slugId(name)}`;
const departmentDocId = (name) => `dept_${slugId(name)}`;
const classDocId = (grade, section) => `class_g${grade}${section}`;
const subjectDocId = (name) => `subject_${slugId(name)}`;
const CLASS_IDS = GRADE_LEVELS.flatMap((grade) => CLASS_SECTIONS.map((section) => classDocId(grade, section)));

function classIdToName(id) {
  const [, grade, section] = /^class_g(\d+)([A-Z])$/.exec(id) ?? [];
  return grade && section ? `Grade ${grade}${section}` : id;
}

// Deterministic round-robin student->class/house assignment, keyed by the
// student's position within `cp.roster.filter(u => u.role === 'student')`
// (a stable order — students are never reordered after buildRoster()). Both
// Phase 5 (which performs the assignment) and Phase 8/9 (which need to know
// which class a student belongs to, to generate class-consistent results/
// feedback) call this same function rather than each deriving it separately.
function classIdForStudentIndex(studentPositionIndex) {
  return CLASS_IDS[studentPositionIndex % CLASS_IDS.length];
}
function houseNameForStudentIndex(studentPositionIndex) {
  return HOUSE_NAMES[studentPositionIndex % HOUSE_NAMES.length];
}

// Pure function of the SUBJECTS/CLASS_IDS constants — deterministic and
// side-effect-free, so Phase 4 (writing subjects/subjectEnrollments), Phase 6
// (timetable/exams/assignments) and Phase 7 (gradebooks) can each call this
// independently and always get the identical subject->class/teacher mapping,
// without needing to persist it in the checkpoint.
function buildSubjectClassMap() {
  const electiveSubjects = SUBJECTS.filter((s) => !s.core);
  const classIdsByElective = new Map(electiveSubjects.map((s) => [s.name, []]));
  CLASS_IDS.forEach((classId, i) => {
    const elective = electiveSubjects[i % electiveSubjects.length];
    classIdsByElective.get(elective.name).push(classId);
  });
  return classIdsByElective;
}

// Resolved subject list: id, applicable classIds (§7 Phase 4's core/elective
// split), and teacherIds (round-robin over regular_teacher — SubjectForm.tsx's
// own teacher picker only ever lists regular_teacher, never senior_teacher).
function buildSubjects(cp) {
  const regularTeachers = cp.roster.filter((u) => u.role === 'regular_teacher');
  const classIdsByElective = buildSubjectClassMap();
  let teacherCursor = 0;

  return SUBJECTS.map((subj) => {
    const teacherCount = regularTeachers.length > 0
      ? Math.max(1, Math.round(regularTeachers.length / SUBJECTS.length))
      : 0;
    const subjectTeachers = [];
    for (let i = 0; i < teacherCount && regularTeachers.length > 0; i++) {
      subjectTeachers.push(regularTeachers[teacherCursor % regularTeachers.length]);
      teacherCursor++;
    }

    const classIds = subj.core ? CLASS_IDS : (classIdsByElective.get(subj.name) ?? []);

    return {
      id: subjectDocId(subj.name),
      name: subj.name,
      department: subj.department,
      core: subj.core,
      classScope: subj.core ? 'institution' : 'class',
      // classIds/classNames on the subject doc itself are blank for
      // institution-wide subjects (matches SubjectForm.tsx's onSubmit) —
      // allClassIds (always populated) is what subjectEnrollments/timetable/
      // exams/assignments/gradebooks actually iterate over.
      classIds: subj.core ? [] : classIds,
      classNames: subj.core ? [] : classIds.map(classIdToName),
      allClassIds: classIds,
      teacherIds: subjectTeachers.map((t) => t.uid),
      teacherNames: subjectTeachers.map((t) => t.name),
      days: subj.days,
    };
  });
}

// One entry per §7 phase, in write order. Only phases present in
// PHASE_RUNNERS (below) are actually executed.
// '15a'/'15b' splits Phase 15 into a generate pass and a class-rank pass —
// the same sub-phase convention '2a'/'2b' already established, needed here
// because report-cards/index.tsx's own handleBatchGenerate() computes class
// rank/average only after every card in a class has been generated (§7.4),
// which this script's single-phase-at-a-time checkpoint model can't express
// as one atomic phase.
const PHASE_ORDER = [
  '0', '1', '2a', '2b', '3', '4', '5', '6', '7', '8', '9',
  '10', '11', '12', '13', '14', '15a', '15b', '16', '17',
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
// `onProgress(writtenSoFar)`, if given, fires after every batch actually
// commits (not just once at the end) — item 5's "validate checkpoint/resume
// behavior mid-phase" requirement surfaced a real bug here: without this,
// a crash between two successful commits (e.g. a resource-exhausted error
// on batch 6 of 10) would leave Firestore with 5 batches' worth of new
// documents the checkpoint has no record of, so a resumed run would
// recompute the same deterministic item list and duplicate them (the
// documents this function writes are all addDoc-style random-ID docs, so
// there's no natural set()-is-idempotent safety net). Callers should persist
// progress inside onProgress, not just after budgetedBatchWrite returns.
async function budgetedBatchWrite(db, items, budgetRemaining, refFor, dataFor, { mode = 'set', onProgress } = {}) {
  let batch = db.batch();
  let opsInBatch = 0;
  let written = 0;
  for (const item of items) {
    if (written >= budgetRemaining) break;
    const ref = refFor(item);
    const data = dataFor(item);
    if (mode === 'update') batch.update(ref, data);
    else batch.set(ref, data);
    opsInBatch++;
    written++;
    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      onProgress?.(written);
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) {
    await batch.commit();
    onProgress?.(written);
  }
  return written;
}

function slugId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

  // In-memory always (even in dry-run, so a chained dry-run preview of later
  // phases in the same invocation has something to reference); persisted to
  // disk only for a live run, in the write block below. termStartDate/
  // termEndDate/schoolWeekDays are needed by Phase 10-12 (attendance date
  // ranges + attendanceSummaries' expected-session math, §7) — same
  // rationale as academicYearId/termId: recomputing "today" on a later run's
  // date would not reproduce what Phase 1 actually wrote.
  cp.academicYearId = yearId;
  cp.academicYearName = yearName;
  cp.termId = termId;
  cp.termStartDate = termStartISO;
  cp.termEndDate = termEndISO;
  cp.schoolWeekDays = [1, 2, 3, 4, 5];

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

  // Persisted for later phases (Phase 4's classes, Phase 6's timetable/exams/
  // assignments, Phase 7's gradebooks, etc.) to reference — recomputing these
  // from "today" on a later run's date would NOT reproduce the same IDs
  // Phase 1 actually wrote, since termStart/termEnd are relative to whatever
  // "today" was on the day Phase 1 ran.
  saveCheckpoint(cp);

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
        // Kept for every role (not just students) — Phase 3 uses it to assign
        // a realistic mother/father relationship label on student_parents
        // links. Only written to Firestore for students (buildUserPayload),
        // since UserDocument only models gender as a student-profile field.
        gender: sex === 'male' ? 'Male' : 'Female',
        uid: null,
        authCreated: false,
        firestoreCreated: false,
      };

      if (role === 'student') {
        // Grade-correlated age: classIdForStudentIndex(i) is a pure function
        // of `i` alone (the same student-position index Phase 5 later uses
        // for the actual assignment), so the grade a student will end up in
        // is already knowable here — no need to fall back to a flat 5-18
        // range that could put a "Grade 7" student's DOB anywhere from age 5
        // to 18. +4..+6 gives each grade a small, realistic age spread
        // (repeaters, early/late starts) while keeping DOB plausible for the
        // grade Phase 5 will assign.
        const classId = classIdForStudentIndex(i);
        const gradeMatch = /^class_g(\d+)[A-Z]$/.exec(classId);
        const grade = gradeMatch ? Number(gradeMatch[1]) : 9;
        const age = grade + 4 + faker.number.int({ min: 0, max: 2 });
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

  let marked = 0;
  const written = await budgetedBatchWrite(
    db,
    pending,
    budgetRemaining,
    (entry) => db.collection('users').doc(entry.uid),
    (entry) => buildUserPayload(entry, institutionId),
    {
      // Marks + persists after every batch, not just once at the end — a
      // crash between two successful batch commits must not lose track of
      // documents Firestore already has (see budgetedBatchWrite's comment).
      onProgress: (n) => {
        for (; marked < n; marked++) pending[marked].firestoreCreated = true;
        saveCheckpoint(cp);
      },
    },
  );

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 — student_parents links (§7)
// ─────────────────────────────────────────────────────────────────────────

// Deterministic sibling-family clustering (§5) — groups the 1,250 students
// into families of 1-4 (weighted toward smaller), then assigns each family
// 2 parents (mother+father) while the 1,117-parent pool lasts, 1 (single
// parent) for the family that gets the last odd one out, or 0 once the pool
// is exhausted. With more students than parents, this means roughly the
// last ~10-15% of students end up with no parent link — realistic enough
// (incomplete guardian records happen at real institutions) rather than
// reusing a parent across unrelated families to force full coverage.
// Deliberately runs a bit higher than BULK_SEED_SPEC.md §4's ~1,117-write
// estimate for this collection (siblings mean most links are 2 parents x
// N kids, not a flat 1:1) — a few hundred extra writes, immaterial against
// the ~10,000/day budget.
function buildFamilyLinks(cp) {
  faker.seed(FAKER_SEED + 2); // independent of buildRoster()'s own draw
  const students = cp.roster.filter((u) => u.role === 'student');
  const parents = cp.roster.filter((u) => u.role === 'parent');
  let parentCursor = 0;

  const links = [];
  let i = 0;
  while (i < students.length) {
    const size = faker.helpers.weightedArrayElement([
      { weight: 50, value: 1 },
      { weight: 35, value: 2 },
      { weight: 12, value: 3 },
      { weight: 3, value: 4 },
    ]);
    const family = students.slice(i, i + size);
    i += family.length;

    const remaining = parents.length - parentCursor;
    const familyParents = [];
    if (remaining >= 2) {
      familyParents.push(parents[parentCursor], parents[parentCursor + 1]);
      parentCursor += 2;
    } else if (remaining === 1) {
      familyParents.push(parents[parentCursor]);
      parentCursor += 1;
    }

    for (const parent of familyParents) {
      const relationship = parent.gender === 'Male' ? 'father' : 'mother';
      for (const student of family) {
        links.push({
          parentIndex: parent.index,
          studentIndex: student.index,
          relationship,
          written: false,
        });
      }
    }
  }

  return links;
}

async function runPhase3(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster) {
    throw new Error('Phase 3 requires Phase 2a/2b to have run first (no roster in checkpoint).');
  }

  if (!cp.familyLinks) {
    cp.familyLinks = buildFamilyLinks(cp);
    if (!opts.dryRun) saveCheckpoint(cp);
  }

  const pending = cp.familyLinks.filter((l) => !l.written);
  console.log(`Phase 3: ${cp.familyLinks.length - pending.length}/${cp.familyLinks.length} student_parents links already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  const resolve = (link) => ({
    parentId: cp.roster[link.parentIndex].uid,
    studentId: cp.roster[link.studentIndex].uid,
    institutionId,
    relationship: link.relationship,
  });

  if (opts.dryRun) {
    console.log(
      `  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} student_parents link(s), e.g.`,
      resolve(pending[0]),
    );
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  let marked = 0;
  const written = await budgetedBatchWrite(
    db,
    pending,
    budgetRemaining,
    (link) => db.collection('student_parents').doc(`${cp.roster[link.parentIndex].uid}_${cp.roster[link.studentIndex].uid}`),
    (link) => resolve(link),
    {
      onProgress: (n) => {
        for (; marked < n; marked++) pending[marked].written = true;
        saveCheckpoint(cp);
      },
    },
  );

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 — houses, departments, classes, subjects (+ subjectEnrollments)
// (§7; subjectEnrollments is a correction found while implementing this
// phase — SubjectForm.tsx's real create path always writes one
// subjectEnrollments/{subjectId}_{classId} doc per class a subject applies
// to, and the Subject/My/Child Attendance pages (§8) read from it. It was
// missing from §7's original Phase table entirely.)
// ─────────────────────────────────────────────────────────────────────────
async function runPhase4(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster) {
    throw new Error('Phase 4 requires Phase 2a/2b to have run first (no roster in checkpoint).');
  }

  const seniorTeachers = cp.roster.filter((u) => u.role === 'senior_teacher');

  const houses = HOUSE_NAMES.map((name) => ({
    ref: db.collection('institutions').doc(institutionId).collection('houses').doc(houseDocId(name)),
    data: {
      institutionId,
      name: `${name} House`,
      description: `One of the institution's ${HOUSE_NAMES.length} houses.`,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'seed-bulk-institution-script',
      updatedAt: FieldValue.serverTimestamp(),
    },
  }));

  const departments = DEPARTMENT_NAMES.map((name, i) => ({
    ref: db.collection('institutions').doc(institutionId).collection('departments').doc(departmentDocId(name)),
    // DepartmentForm.tsx's real create path writes only {name, headTeacherId,
    // institutionId} — no timestamps — matched exactly here. headTeacherId is
    // omitted (not set to undefined) when there's no teacher to assign —
    // unlike the client SDK, the Admin SDK throws on an explicit undefined
    // field value rather than silently dropping it.
    data: {
      name,
      institutionId,
      ...(seniorTeachers.length > 0 ? { headTeacherId: seniorTeachers[i % seniorTeachers.length].uid } : {}),
    },
  }));

  const classes = [];
  let classIndex = 0;
  for (const grade of GRADE_LEVELS) {
    for (const section of CLASS_SECTIONS) {
      const supervisorTeacher = seniorTeachers.length > 0 ? seniorTeachers[classIndex % seniorTeachers.length] : null;
      classes.push({
        ref: db.collection('institutions').doc(institutionId).collection('classes').doc(classDocId(grade, section)),
        // ClassForm.tsx's `supervisor` field is free text (not a teacher UID
        // reference, despite ClassDocument's unused classTeacherId comment
        // suggesting otherwise — verified by reading the actual form) — set
        // to a real senior teacher's display name for realism.
        data: {
          name: `Grade ${grade}${section}`,
          capacity: 30,
          grade,
          institutionId,
          termId: cp.termId,
          supervisor: supervisorTeacher ? supervisorTeacher.name : '',
          createdAt: FieldValue.serverTimestamp(),
        },
      });
      classIndex++;
    }
  }

  // Elective subjects are class-scoped: each class is assigned exactly one
  // of the 4 electives, round-robin, so every student ends up with 8 core +
  // 1 elective = 9 subjects (close to §4's ~8 estimate). Reuses the same
  // buildSubjects() helper Phase 6/7 call, so the mapping never drifts.
  const subjects = buildSubjects(cp).map((s) => ({
    ...s,
    ref: db.collection('institutions').doc(institutionId).collection('subjects').doc(s.id),
  }));

  const subjectDataFor = (s) => ({
    name: s.name,
    description: '',
    institutionId,
    classScope: s.classScope,
    classIds: s.classIds,
    classNames: s.classNames,
    teacherIds: s.teacherIds,
    teacherNames: s.teacherNames,
    cwWeight: 40,
    examWeight: 60,
    frequency: 'weekly',
    sessionDayOfWeek: s.days,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'seed-bulk-institution-script',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'seed-bulk-institution-script',
  });

  // One subjectEnrollments/{subjectId}_{classId} doc per (subject, class)
  // pair the subject applies to — matches SubjectForm.tsx's writeEnrollments().
  const enrollments = [];
  for (const s of subjects) {
    for (const classId of s.allClassIds) {
      const className = classIdToName(classId);
      enrollments.push({
        ref: db.collection('institutions').doc(institutionId).collection('subjectEnrollments').doc(`${s.id}_${classId}`),
        data: {
          institutionId,
          subjectId: s.id,
          subjectName: s.name,
          classId,
          className,
          enrollmentType: 'all',
          excludedStudentIds: [],
          excludedStudentNames: [],
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'seed-bulk-institution-script',
        },
      });
    }
  }

  const allWrites = [
    ...houses,
    ...departments,
    ...classes,
    ...subjects.map((s) => ({ ref: s.ref, data: subjectDataFor(s) })),
    ...enrollments,
  ];

  if (!cp.phase4Progress) {
    cp.phase4Progress = { total: allWrites.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = allWrites.slice(cp.phase4Progress.written);
  console.log(`Phase 4: ${cp.phase4Progress.written}/${allWrites.length} reference docs already written (${houses.length} houses, ${departments.length} departments, ${classes.length} classes, ${subjects.length} subjects, ${enrollments.length} subject enrollments); ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const baseWritten = cp.phase4Progress.written;
  const written = await budgetedBatchWrite(
    db,
    pending,
    budgetRemaining,
    (item) => item.ref,
    (item) => item.data,
    {
      // Every subject's resolved metadata (teacherIds/classIds/etc.) is
      // derived purely from cp.roster + the SUBJECTS/CLASS_IDS constants, so
      // nothing else needs to be persisted here for later phases to reuse —
      // they just recompute the same subjects/classes/houses/departments
      // lists themselves. Only the write-count cursor is persisted.
      onProgress: (n) => {
        cp.phase4Progress.written = baseWritten + n;
        saveCheckpoint(cp);
      },
    },
  );

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 5 — student class/house assignment (§7 — updateDoc only, no new
// documents; still counts against the write budget like any other Firestore
// write, unlike the "0" written in §7's original Phase table).
// ─────────────────────────────────────────────────────────────────────────
async function runPhase5(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  if (!cp.roster) {
    throw new Error('Phase 5 requires Phase 2a/2b to have run first (no roster in checkpoint).');
  }
  const students = cp.roster.filter((u) => u.role === 'student');

  if (!cp.phase5Progress) {
    cp.phase5Progress = { total: students.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }

  const assignmentFor = (absoluteIndex) => {
    const classId = classIdForStudentIndex(absoluteIndex);
    const houseName = houseNameForStudentIndex(absoluteIndex);
    return { classId, houseId: houseDocId(houseName), houseName: `${houseName} House` };
  };

  const pending = students.slice(cp.phase5Progress.written).map((student, i) => ({
    student,
    absoluteIndex: cp.phase5Progress.written + i,
  }));
  console.log(`Phase 5: ${cp.phase5Progress.written}/${students.length} students already assigned a class/house; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(
      `  [dry-run] would update ${Math.min(pending.length, budgetRemaining)} of ${pending.length} student user doc(s), e.g.`,
      assignmentFor(pending[0].absoluteIndex),
    );
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const baseWritten = cp.phase5Progress.written;
  const written = await budgetedBatchWrite(
    db,
    pending,
    budgetRemaining,
    (item) => db.collection('users').doc(item.student.uid),
    (item) => assignmentFor(item.absoluteIndex),
    {
      mode: 'update',
      onProgress: (n) => {
        cp.phase5Progress.written = baseWritten + n;
        saveCheckpoint(cp);
      },
    },
  );

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 6 — timetable_slots, exams, assignments (§7)
// One timetable slot per (subject, class) pair (378 total: 8 core x 42
// classes + 42 elective pairs). Exams only for core subjects (keeps this
// phase's combined volume close to §7's 500-1,000 estimate); assignments
// for every pair. Dates are relative to "when this phase actually runs",
// not the term's fixed start/end (only termId/academicYearId are persisted
// in the checkpoint, not the date strings — safe here since Phase 1
// deliberately gives the term ~120 days of margin past today, far wider
// than the ~9-10 day seeding window this could ever run within).
// ─────────────────────────────────────────────────────────────────────────
const DAY_NUM_TO_KEY = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' };

async function runPhase6(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId) {
    throw new Error('Phase 6 requires Phase 1 and Phase 2a/2b to have run first (no termId/roster in checkpoint).');
  }

  const subjects = buildSubjects(cp);
  const items = [];

  subjects.forEach((subj, subjectIndex) => {
    const startHour = 8 + (subjectIndex % 6); // spreads slots across 08:00-13:00
    const startTime = `${String(startHour).padStart(2, '0')}:00`;
    const days = subj.days.map((d) => DAY_NUM_TO_KEY[d]).filter(Boolean);

    subj.allClassIds.forEach((classId, pairIndex) => {
      const className = classIdToName(classId);
      const teacherId = subj.teacherIds.length > 0 ? subj.teacherIds[pairIndex % subj.teacherIds.length] : '';
      const teacherName = subj.teacherNames.length > 0 ? subj.teacherNames[pairIndex % subj.teacherNames.length] : '';
      const base = {
        institutionId,
        termId: cp.termId,
        termName: 'Term 1', // Phase 1 always names the single seeded term this (§7.1)
        subjectId: subj.id,
        subjectName: subj.name,
        classId,
        className,
        teacherId,
        teacherName,
      };

      items.push({
        ref: db.collection('institutions').doc(institutionId).collection('timetable_slots').doc(),
        data: {
          ...base,
          days: days.length > 0 ? days : ['mon'],
          startTime,
          duration: 50,
          createdBy: 'seed-bulk-institution-script',
          createdByRole: 'institution_admin',
          createdAt: FieldValue.serverTimestamp(),
        },
      });

      if (subj.core) {
        const examDate = new Date();
        examDate.setUTCDate(examDate.getUTCDate() + 21 + (pairIndex % 14));
        items.push({
          ref: db.collection('institutions').doc(institutionId).collection('exams').doc(),
          data: {
            ...base,
            date: toISO(examDate),
            startTime,
            duration: 60,
            createdBy: 'seed-bulk-institution-script',
            createdByRole: 'institution_admin',
            createdAt: FieldValue.serverTimestamp(),
          },
        });
      }

      const dueDate = new Date();
      dueDate.setUTCDate(dueDate.getUTCDate() + 7 + (pairIndex % 21));
      items.push({
        ref: db.collection('institutions').doc(institutionId).collection('assignments').doc(),
        data: {
          ...base,
          dueDate: toISO(dueDate),
          description: `${subj.name} assignment for ${className}.`,
          createdBy: 'seed-bulk-institution-script',
          createdByRole: 'institution_admin',
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    });
  });

  if (!cp.phase6Progress) {
    cp.phase6Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase6Progress.written);
  console.log(`Phase 6: ${cp.phase6Progress.written}/${items.length} timetable/exam/assignment docs already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base6 = cp.phase6Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase6Progress.written = base6 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 7 — gradebooks + gradebooks/{id}/columns (§7)
// One gradebook per (subject, class) pair (378, same set Phase 6 uses),
// gradebookId = `${classId}_${subjectId}_${termId}` (matches
// list/gradebook/index.tsx's own scheme exactly). 5 columns each, weights
// summing to 100 (matches ColumnCreationModal.tsx's 100%-cap validation).
// ─────────────────────────────────────────────────────────────────────────
const GRADEBOOK_COLUMN_SPECS = [
  { label: 'Homework 1', assessmentType: 'coursework', maxScore: 20, columnWeight: 15 },
  { label: 'Homework 2', assessmentType: 'coursework', maxScore: 20, columnWeight: 15 },
  { label: 'Quiz', assessmentType: 'coursework', maxScore: 20, columnWeight: 15 },
  { label: 'Class Test', assessmentType: 'coursework', maxScore: 30, columnWeight: 15 },
  { label: 'Term Exam', assessmentType: 'exam', maxScore: 100, columnWeight: 40 },
];

async function runPhase7(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId) {
    throw new Error('Phase 7 requires Phase 1 and Phase 2a/2b to have run first (no termId/roster in checkpoint).');
  }

  const subjects = buildSubjects(cp);
  const items = [];

  for (const subj of subjects) {
    for (const classId of subj.allClassIds) {
      const gradebookId = `${classId}_${subj.id}_${cp.termId}`;
      const gbRef = db.collection('institutions').doc(institutionId).collection('gradebooks').doc(gradebookId);
      items.push({
        ref: gbRef,
        data: {
          classId,
          subjectId: subj.id,
          termId: cp.termId,
          institutionId,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: 'seed-bulk-institution-script',
        },
      });
      GRADEBOOK_COLUMN_SPECS.forEach((col, i) => {
        items.push({
          // Deterministic (col1..col5), unlike the live UI's addDoc-random-ID
          // columns — needed so Phase 8's results can reference
          // gradebookColumnId without an extra Firestore read to discover
          // what ID Phase 7 actually assigned each column.
          ref: gbRef.collection('columns').doc(`col${i + 1}`),
          data: {
            label: col.label,
            assessmentType: col.assessmentType,
            maxScore: col.maxScore,
            columnWeight: col.columnWeight,
            order: i + 1,
            institutionId,
            subjectId: subj.id,
            createdBy: 'seed-bulk-institution-script',
            createdAt: FieldValue.serverTimestamp(),
          },
        });
      });
    }
  }

  if (!cp.phase7Progress) {
    cp.phase7Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase7Progress.written);
  console.log(`Phase 7: ${cp.phase7Progress.written}/${items.length} gradebook/column docs already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base7 = cp.phase7Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase7Progress.written = base7 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// Groups the student roster by classId, keyed by classIdForStudentIndex() —
// the same function Phase 5 uses to perform the actual assignment. Pure
// function of cp.roster, recomputed independently by Phase 8 and Phase 9
// rather than persisted, matching every other reference-data lookup in this
// script (§9's "everything derivable is recomputed, not duplicated" pattern).
function groupStudentsByClass(cp) {
  const students = cp.roster.filter((u) => u.role === 'student');
  const byClass = new Map();
  students.forEach((student, i) => {
    const classId = classIdForStudentIndex(i);
    if (!byClass.has(classId)) byClass.set(classId, []);
    byClass.get(classId).push(student);
  });
  return byClass;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 8 — results (§7)
// The highest-volume phase (~56,000 writes) — the first one guaranteed to
// span multiple daily runs at the default 10,000/day budget (item 5's whole
// point), so this is where budgetedBatchWrite's per-batch onProgress
// checkpointing (see its own comment above) actually gets exercised, not
// just designed in principle. 1 result per (student, gradebook column) —
// matches list/gradebook/index.tsx's own new-result write exactly, including
// its assessmentName: colId quirk (the real code sets assessmentName to the
// column's own document ID, not a human label — replicated for fidelity,
// not "fixed", since the point is to mirror what the real write path does).
// ─────────────────────────────────────────────────────────────────────────
async function runPhase8(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId) {
    throw new Error('Phase 8 requires Phase 1 and Phase 2a/2b to have run first (no termId/roster in checkpoint).');
  }

  const subjects = buildSubjects(cp);
  const studentsByClass = groupStudentsByClass(cp);

  faker.seed(FAKER_SEED + 3); // independent of every other phase's faker draws
  const items = [];

  for (const subj of subjects) {
    const departmentId = departmentDocId(subj.department);
    subj.allClassIds.forEach((classId, pairIndex) => {
      const className = classIdToName(classId);
      const classStudents = studentsByClass.get(classId) ?? [];
      const teacherId = subj.teacherIds.length > 0 ? subj.teacherIds[pairIndex % subj.teacherIds.length] : '';
      const teacherName = subj.teacherNames.length > 0 ? subj.teacherNames[pairIndex % subj.teacherNames.length] : '';

      for (const student of classStudents) {
        GRADEBOOK_COLUMN_SPECS.forEach((col, colIndex) => {
          const columnId = `col${colIndex + 1}`;
          // Not a statistically rigorous model — just varied enough (40-98%
          // of maxScore) that Results/Report Card/Progress Report pages
          // don't all show identical numbers for every student.
          const pct = faker.number.float({ min: 0.4, max: 0.98, fractionDigits: 2 });
          const score = Math.round(col.maxScore * pct);

          items.push({
            ref: db.collection('institutions').doc(institutionId).collection('results').doc(),
            data: {
              studentId: student.uid,
              studentName: student.name,
              teacherId,
              teacherName,
              classId,
              className,
              termId: cp.termId,
              institutionId,
              departmentId,
              subjectId: subj.id,
              assessmentName: columnId,
              assessmentType: col.assessmentType,
              score,
              maxScore: col.maxScore,
              weight: col.columnWeight,
              date: '',
              gradebookColumnId: columnId,
              columnWeight: col.columnWeight,
              source: 'gradebook',
              createdAt: FieldValue.serverTimestamp(),
            },
          });
        });
      }
    });
  }

  if (!cp.phase8Progress) {
    cp.phase8Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase8Progress.written);
  console.log(`Phase 8: ${cp.phase8Progress.written}/${items.length} result docs already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base8 = cp.phase8Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase8Progress.written = base8 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 9 — feedback_comments (§7)
// 1 doc per (student, subject) pair, deterministic ID
// `${studentId}_${subjectId}_${termId}` — matches list/gradebook/index.tsx's
// own scheme (not the standalone FeedbackCommentForm.tsx's query-then-addDoc
// path, which produces a random ID instead). §9 already names
// feedback_comments as a deterministic-ID collection; this confirms which of
// the app's two real write paths that refers to.
// ─────────────────────────────────────────────────────────────────────────
const CONDUCT_GRADE_WEIGHTS = [
  { weight: 50, value: 'G' },
  { weight: 30, value: 'S' },
  { weight: 10, value: 'F' },
  { weight: 5, value: 'U' },
  { weight: 3, value: 'P' },
  { weight: 2, value: 'D' },
];
// src/lib/commentKey.ts's COMMENT_KEY array length — kept in sync manually
// since this standalone .mjs script isn't part of the TS build and can't
// import it directly.
const COMMENT_KEY_COUNT = 20;

async function runPhase9(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId) {
    throw new Error('Phase 9 requires Phase 1 and Phase 2a/2b to have run first (no termId/roster in checkpoint).');
  }

  const subjects = buildSubjects(cp);
  const studentsByClass = groupStudentsByClass(cp);

  faker.seed(FAKER_SEED + 4); // independent of every other phase's faker draws
  const items = [];
  const commentPool = Array.from({ length: COMMENT_KEY_COUNT }, (_, i) => i + 1);

  for (const subj of subjects) {
    const departmentId = departmentDocId(subj.department);
    subj.allClassIds.forEach((classId, pairIndex) => {
      const className = classIdToName(classId);
      const classStudents = studentsByClass.get(classId) ?? [];
      const teacherId = subj.teacherIds.length > 0 ? subj.teacherIds[pairIndex % subj.teacherIds.length] : '';
      const teacherName = subj.teacherNames.length > 0 ? subj.teacherNames[pairIndex % subj.teacherNames.length] : '';

      for (const student of classStudents) {
        const conductGrade = faker.helpers.weightedArrayElement(CONDUCT_GRADE_WEIGHTS);
        const commentCount = faker.number.int({ min: 1, max: 3 });
        const commentNumbers = faker.helpers.arrayElements(commentPool, commentCount).sort((a, b) => a - b);

        items.push({
          ref: db.collection('institutions').doc(institutionId).collection('feedback_comments').doc(`${student.uid}_${subj.id}_${cp.termId}`),
          data: {
            studentId: student.uid,
            studentName: student.name,
            classId,
            className,
            termId: cp.termId,
            institutionId,
            subjectId: subj.id,
            conductGrade,
            commentNumbers,
            teacherId,
            teacherName,
            departmentId,
            createdAt: FieldValue.serverTimestamp(),
          },
        });
      }
    });
  }

  if (!cp.phase9Progress) {
    cp.phase9Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase9Progress.written);
  console.log(`Phase 9: ${cp.phase9Progress.written}/${items.length} feedback_comments docs already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base9 = cp.phase9Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase9Progress.written = base9 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 10-12 shared helpers — general/subject attendance registers + the
// derived attendanceSummaries rollup (§7).
//
// Attendance dates span the FULL stored term range (cp.termStartDate..
// cp.termEndDate), not the ~63-school-day "typical term" figure
// BULK_SEED_SPEC.md §4.1 originally estimated. Phase 1 deliberately widened
// the term's *stored* date range to ~120 days past today (well beyond a real
// term's length) purely so the academic-calendar gate stays satisfied across
// this script's own ~10-day multi-run seeding window (see Phase 1's own
// comment) — but Phase 12's attendanceSummaries computation reads that exact
// same stored range for its totalExpectedSessions denominator (mirroring
// src/lib/attendanceCalendar.ts's countExpectedSessions() against
// termStartDate/termEndDate, not against "however many days Phase 10 actually
// generated"). Generating attendance for anything less than the full stored
// range would make every seeded student's attendanceRate look artificially
// low against that denominator — a stress-test artifact, not a real "partial
// term" state — so Phase 10/11 cover the same full range Phase 12 measures
// against. This raises generalAttendance's write count from §4.1's ~5,300
// estimate to roughly 8,000 (measured once run) — a real, disclosed
// correction, not the original ~63-day assumption. No nonSchoolDays are
// seeded (§7 doesn't list that collection for this seed), so every weekday
// in range counts as a school day.
function buildAttendanceDates(cp) {
  const dates = [];
  const cursor = new Date(cp.termStartDate + 'T12:00:00Z');
  const end = new Date(cp.termEndDate + 'T12:00:00Z');
  while (cursor <= end) {
    if (cp.schoolWeekDays.includes(cursor.getUTCDay())) dates.push(toISO(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// Mirrors src/lib/attendanceCalendar.ts's countExpectedSessions() exactly
// (that module is client-SDK-adjacent but has no Firestore dependency of its
// own — reimplemented here rather than imported since this standalone .mjs
// script isn't part of the TS build). No nonSchoolDays to subtract (see
// buildAttendanceDates's comment), so this is a pure school-day count.
function countExpectedSessionsAdmin(startISO, endISO, schoolWeekDays, sessionsPerDay) {
  let count = 0;
  const cursor = new Date(startISO + 'T12:00:00Z');
  const end = new Date(endISO + 'T12:00:00Z');
  while (cursor <= end) {
    if (schoolWeekDays.includes(cursor.getUTCDay())) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count * sessionsPerDay;
}

const VALID_ATTENDANCE_STATES = new Set(['P', 'A', 'L', 'S', 'E', 'B']);

// Realistic-looking distribution for randomly-generated attendance marks.
// 'B' ("Blank" — a state a real teacher sets to deliberately exclude one
// session from one student's own expected-session count, per
// attendanceStates.ts) is a manual override, not something a bulk-realism
// generator should invent on its own — excluded here, same as Phase 8's
// score distribution isn't "statistically rigorous," just varied enough that
// every register/report doesn't show identical marks for every student.
const ATTENDANCE_STATE_WEIGHTS = [
  { weight: 85, value: 'P' },
  { weight: 6, value: 'A' },
  { weight: 5, value: 'L' },
  { weight: 2, value: 'S' },
  { weight: 2, value: 'E' },
];
const EXCUSED_REASONS = ['Family emergency', 'Medical appointment', 'Religious observance', 'School-sanctioned event'];

// records map shape matches both GeneralAttendanceDocument['records'] and
// subjectAttendance's equivalent (subject/index.tsx's SubjectAttendanceDoc)
// exactly — same {state, studentName, reason?} shape in both collections.
function buildAttendanceRecords(students) {
  const records = {};
  for (const student of students) {
    const state = faker.helpers.weightedArrayElement(ATTENDANCE_STATE_WEIGHTS);
    records[student.uid] = {
      state,
      studentName: student.name,
      ...(state === 'E' ? { reason: faker.helpers.arrayElement(EXCUSED_REASONS) } : {}),
    };
  }
  return records;
}

// Same round-robin assignment Phase 4 already used for each class's
// `supervisor` display-name string (senior teachers, keyed by CLASS_IDS
// index) — recomputed here rather than persisted, since it's a pure function
// of cp.roster + the fixed CLASS_IDS order, and Phase 10 needs the
// supervisor's actual uid (for `submittedBy`), not just their name.
function buildClassSupervisors(cp) {
  const seniorTeachers = cp.roster.filter((u) => u.role === 'senior_teacher');
  const map = new Map();
  CLASS_IDS.forEach((classId, i) => {
    map.set(classId, seniorTeachers.length > 0 ? seniorTeachers[i % seniorTeachers.length] : null);
  });
  return map;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 10 — generalAttendance (§7)
// 1 doc per (class, date, session) — matches attendance/general/index.tsx's
// writeSessionDoc() field shape exactly. Deterministic doc ID
// (`ga_<classId>_<date>_<session>`), unlike the live UI's addDoc-random ID —
// consistent with §9's script-wide idempotency convention for collections
// the UI itself writes with random IDs.
// ─────────────────────────────────────────────────────────────────────────
async function runPhase10(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId || !cp.termStartDate) {
    throw new Error('Phase 10 requires Phase 1 and Phase 2a/2b to have run first (no termStartDate/roster in checkpoint).');
  }

  const studentsByClass = groupStudentsByClass(cp);
  const supervisors = buildClassSupervisors(cp);
  const dates = buildAttendanceDates(cp);

  faker.seed(FAKER_SEED + 5); // independent of every other phase's faker draws
  const items = [];

  for (const classId of CLASS_IDS) {
    const className = classIdToName(classId);
    const classStudents = studentsByClass.get(classId) ?? [];
    const supervisor = supervisors.get(classId);

    for (const date of dates) {
      for (const session of ['AM', 'PM']) {
        items.push({
          ref: db.collection('institutions').doc(institutionId).collection('generalAttendance')
            .doc(`ga_${classId}_${date}_${session}`),
          data: {
            institutionId,
            classId,
            className,
            termId: cp.termId,
            academicYearId: cp.academicYearId,
            date,
            session,
            records: buildAttendanceRecords(classStudents),
            submittedBy: supervisor ? supervisor.uid : 'seed-bulk-institution-script',
            submittedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        });
      }
    }
  }

  if (!cp.phase10Progress) {
    cp.phase10Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase10Progress.written);
  console.log(`Phase 10: ${cp.phase10Progress.written}/${items.length} generalAttendance docs already written (${CLASS_IDS.length} classes x ${dates.length} school days x 2 sessions); ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base10 = cp.phase10Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase10Progress.written = base10 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 11 — subjectAttendance (§7)
// 1 doc per (subject, class, scheduled session date) — matches
// attendance/subject/index.tsx's commitSave() field shape exactly. Every
// seeded subject is frequency:'weekly' with a fixed sessionDayOfWeek (Phase
// 4's buildSubjects()/subjectDataFor()), so a session date is simply any
// date in buildAttendanceDates() whose weekday is in the subject's `days`.
// ─────────────────────────────────────────────────────────────────────────
function isSubjectSessionDate(dateISO, subject) {
  const dayOfWeek = new Date(dateISO + 'T12:00:00Z').getUTCDay();
  return (subject.days ?? []).includes(dayOfWeek);
}

async function runPhase11(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId || !cp.termStartDate) {
    throw new Error('Phase 11 requires Phase 1, Phase 2a/2b, and Phase 4 to have run first (no termStartDate/roster in checkpoint).');
  }

  const subjects = buildSubjects(cp);
  const studentsByClass = groupStudentsByClass(cp);
  const dates = buildAttendanceDates(cp);

  faker.seed(FAKER_SEED + 6); // independent of every other phase's faker draws
  const items = [];

  for (const subj of subjects) {
    const sessionDates = dates.filter((d) => isSubjectSessionDate(d, subj));
    subj.allClassIds.forEach((classId, pairIndex) => {
      const className = classIdToName(classId);
      const classStudents = studentsByClass.get(classId) ?? [];
      const teacherId = subj.teacherIds.length > 0 ? subj.teacherIds[pairIndex % subj.teacherIds.length] : '';

      for (const sessionDate of sessionDates) {
        items.push({
          ref: db.collection('institutions').doc(institutionId).collection('subjectAttendance')
            .doc(`sa_${subj.id}_${classId}_${sessionDate}`),
          data: {
            institutionId,
            subjectId: subj.id,
            subjectName: subj.name,
            classId,
            className,
            sessionDate,
            teacherId,
            termId: cp.termId,
            academicYearId: cp.academicYearId,
            records: buildAttendanceRecords(classStudents),
            submittedBy: teacherId || 'seed-bulk-institution-script',
            submittedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        });
      }
    });
  }

  if (!cp.phase11Progress) {
    cp.phase11Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase11Progress.written);
  console.log(`Phase 11: ${cp.phase11Progress.written}/${items.length} subjectAttendance docs already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base11 = cp.phase11Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase11Progress.written = base11 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 12 — attendanceSummaries (§7)
// Generation-equivalent, not a live "rebuild" click — reimplements
// src/lib/attendanceSummaryUtils.ts's rebuildSummariesForClass() math exactly
// (same per-student P/A/L/S/E/B tally, same totalExpectedSessions/
// filledSessions/sessionsAbsent/attendanceRate formulas, same
// `${studentId}_${termId}` doc ID) against the Admin SDK, since that
// client-SDK helper can't run inside this Node script. Reads all of Phase
// 10's generalAttendance docs back from Firestore (rather than reusing
// Phase 10's in-memory item list) so this phase is correct even when run in
// a separate invocation days after Phase 10 finished writing.
// ─────────────────────────────────────────────────────────────────────────
async function runPhase12(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.termId || !cp.academicYearId || !cp.termStartDate) {
    throw new Error('Phase 12 requires Phase 1 to have run first (no termId/termStartDate in checkpoint).');
  }

  // Unlike every other phase's dry-run branch, this can't preview real
  // pending counts without a Firestore read — and --dry-run's contract is
  // "without touching Firestore, Auth, or the checkpoint file" (see
  // printUsageAndExit). So this just explains what a live run would do.
  if (opts.dryRun) {
    console.log('Phase 12: [dry-run] would read all generalAttendance docs for the term and upsert 1 attendanceSummaries/{studentId}_{termId} doc per student found (mirrors src/lib/attendanceSummaryUtils.ts\'s rebuildSummariesForClass() exactly).');
    return { writes: 0, complete: true };
  }

  const classExpectedSessions = countExpectedSessionsAdmin(cp.termStartDate, cp.termEndDate, cp.schoolWeekDays, 2);

  const snap = await institutionCollection(db, institutionId, 'generalAttendance')
    .where('termId', '==', cp.termId)
    .get();

  const studentCounts = new Map(); // studentId -> { P,A,L,S,E,B, classId }
  snap.forEach((doc) => {
    const data = doc.data();
    const records = data.records || {};
    for (const [studentId, rec] of Object.entries(records)) {
      if (!studentCounts.has(studentId)) {
        studentCounts.set(studentId, { P: 0, A: 0, L: 0, S: 0, E: 0, B: 0, classId: data.classId });
      }
      if (VALID_ATTENDANCE_STATES.has(rec.state)) {
        studentCounts.get(studentId)[rec.state]++;
      }
    }
  });

  const entries = Array.from(studentCounts.entries());

  if (!cp.phase12Progress) {
    cp.phase12Progress = { total: entries.length, written: 0 };
    saveCheckpoint(cp);
  }
  const pending = entries.slice(cp.phase12Progress.written);
  console.log(`Phase 12: ${cp.phase12Progress.written}/${entries.length} attendanceSummaries docs already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  const dataFor = ([studentId, counts]) => {
    const totalExpectedSessions = Math.max(0, classExpectedSessions - counts.B);
    const sessionsAbsent = counts.A + counts.S + counts.E;
    const filledSessions = counts.P + counts.A + counts.L + counts.S + counts.E + counts.B;
    const attendanceRate = totalExpectedSessions > 0 ? ((counts.P + counts.L) / totalExpectedSessions) * 100 : 0;
    return {
      studentId,
      termId: cp.termId,
      academicYearId: cp.academicYearId,
      institutionId,
      classId: counts.classId,
      P: counts.P, A: counts.A, L: counts.L, S: counts.S, E: counts.E, B: counts.B,
      totalExpectedSessions,
      filledSessions,
      sessionsAbsent,
      daysLate: counts.L,
      attendanceRate,
      updatedAt: FieldValue.serverTimestamp(),
    };
  };

  const base12 = cp.phase12Progress.written;
  const written = await budgetedBatchWrite(
    db,
    pending,
    budgetRemaining,
    ([studentId]) => db.collection('institutions').doc(institutionId).collection('attendanceSummaries').doc(`${studentId}_${cp.termId}`),
    (entry) => dataFor(entry),
    {
      onProgress: (n) => {
        cp.phase12Progress.written = base12 + n;
        saveCheckpoint(cp);
      },
    },
  );

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 13 — studentActivities, studentResponsibilities, disciplinaryActions
// (§7). Matches list/students/[id]/index.tsx's activity/responsibility
// addDoc() shape and DisciplinaryActionForm.tsx's create-path shape exactly.
// Deterministic doc IDs (`act_<uid>_<n>`, `resp_<uid>_<n>`, `disc_<uid>_<n>`)
// per §9, unlike the live UI's addDoc-random-ID pattern.
// ─────────────────────────────────────────────────────────────────────────
const ACTIVITY_NAMES = [
  'Basketball Team', 'Debate Club', 'Chess Club', 'School Choir', 'Drama Club',
  'Science Olympiad', 'Student Council', 'Football Team', 'Art Club',
  'Robotics Club', 'Track and Field', 'Volunteer Corps',
];
const RESPONSIBILITY_TITLES = [
  { title: 'Class Prefect', organisation: null },
  { title: 'Library Monitor', organisation: null },
  { title: 'Sports Captain', organisation: 'Athletics Department' },
  { title: 'House Captain', organisation: null },
  { title: 'Student Council Representative', organisation: 'Student Council' },
  { title: 'Peer Tutor', organisation: 'Academic Support Program' },
];
const DISCIPLINARY_REASONS = {
  merit: ['Outstanding classroom participation', 'Helped a classmate in need', 'Exemplary conduct during a school event', 'Consistent homework excellence'],
  demerit: ['Late to class without excuse', 'Uniform violation', 'Disruptive behavior in class', 'Failure to complete homework'],
  detention: ['Repeated lateness', 'Disrespect toward a staff member', 'Disruptive behavior during an assembly'],
  suspension: ['Physical altercation with another student', 'Serious breach of the code of conduct'],
};
const DISCIPLINARY_TYPE_WEIGHTS = [
  { weight: 45, value: 'merit' },
  { weight: 35, value: 'demerit' },
  { weight: 15, value: 'detention' },
  { weight: 5, value: 'suspension' },
];

// institution_admin/senior_teacher/regular_teacher — DisciplinaryActionForm.tsx
// lets any signed-in staff member log an entry against any student, not just
// their own classes/subjects.
function buildStaffPool(cp) {
  return cp.roster.filter((u) => u.role === 'institution_admin' || u.role === 'senior_teacher' || u.role === 'regular_teacher');
}

function randomDateInTerm(cp) {
  const start = new Date(cp.termStartDate + 'T12:00:00Z').getTime();
  const end = new Date(cp.termEndDate + 'T12:00:00Z').getTime();
  return toISO(new Date(faker.number.int({ min: start, max: end })));
}

function addDaysISO(iso, n, capISO) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  const result = toISO(d);
  return capISO && result > capISO ? capISO : result;
}

async function runPhase13(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId || !cp.termStartDate) {
    throw new Error('Phase 13 requires Phase 1 and Phase 2a/2b to have run first (no termStartDate/roster in checkpoint).');
  }

  const students = cp.roster.filter((u) => u.role === 'student');
  const staffPool = buildStaffPool(cp);

  faker.seed(FAKER_SEED + 7); // independent of every other phase's faker draws
  const items = [];

  students.forEach((student, i) => {
    const classId = classIdForStudentIndex(i);
    const className = classIdToName(classId);

    const activityCount = faker.helpers.weightedArrayElement([
      { weight: 20, value: 0 }, { weight: 50, value: 1 }, { weight: 30, value: 2 },
    ]);
    faker.helpers.arrayElements(ACTIVITY_NAMES, activityCount).forEach((activityName, idx) => {
      items.push({
        ref: db.collection('institutions').doc(institutionId).collection('studentActivities').doc(`act_${student.uid}_${idx}`),
        data: {
          institutionId, studentId: student.uid, classId, termId: cp.termId, academicYearId: cp.academicYearId,
          activityName,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: 'seed-bulk-institution-script',
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    });

    const responsibilityCount = faker.helpers.weightedArrayElement([
      { weight: 70, value: 0 }, { weight: 25, value: 1 }, { weight: 5, value: 2 },
    ]);
    faker.helpers.arrayElements(RESPONSIBILITY_TITLES, responsibilityCount).forEach((resp, idx) => {
      items.push({
        ref: db.collection('institutions').doc(institutionId).collection('studentResponsibilities').doc(`resp_${student.uid}_${idx}`),
        data: {
          institutionId, studentId: student.uid, classId, termId: cp.termId, academicYearId: cp.academicYearId,
          title: resp.title, organisation: resp.organisation,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: 'seed-bulk-institution-script',
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    });

    const disciplinaryCount = faker.helpers.weightedArrayElement([
      { weight: 55, value: 0 }, { weight: 35, value: 1 }, { weight: 10, value: 2 },
    ]);
    for (let idx = 0; idx < disciplinaryCount; idx++) {
      const type = faker.helpers.weightedArrayElement(DISCIPLINARY_TYPE_WEIGHTS);
      const needsRange = type === 'detention' || type === 'suspension';
      const issuer = faker.helpers.arrayElement(staffPool);
      const date = randomDateInTerm(cp);
      items.push({
        ref: db.collection('institutions').doc(institutionId).collection('disciplinaryActions').doc(`disc_${student.uid}_${idx}`),
        data: {
          institutionId,
          studentId: student.uid,
          studentName: student.name,
          classId,
          className,
          termId: cp.termId,
          termName: 'Term 1', // Phase 1 always names the single seeded term this (§7.1)
          type,
          reason: faker.helpers.arrayElement(DISCIPLINARY_REASONS[type]),
          date,
          ...(needsRange ? { endDate: addDaysISO(date, faker.number.int({ min: 0, max: 5 }), cp.termEndDate), served: faker.datatype.boolean() } : {}),
          issuedBy: issuer.uid,
          issuedByName: issuer.name,
          issuedByRole: issuer.role,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    }
  });

  if (!cp.phase13Progress) {
    cp.phase13Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase13Progress.written);
  console.log(`Phase 13: ${cp.phase13Progress.written}/${items.length} activity/responsibility/disciplinary docs already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base13 = cp.phase13Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase13Progress.written = base13 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 14 — reportCardComments (§7)
// 1/student/term — matches report-card-comments/index.tsx's
// handleSaveComments() shape exactly. Deterministic ID (`rcc_<uid>_<termId>`)
// per §9, unlike the live UI's query-then-addDoc/updateDoc pattern — also
// lets Phase 15 read each student's comment via a direct getDoc instead of
// a query (§7.4).
// ─────────────────────────────────────────────────────────────────────────
const REPORT_CARD_COMMENT_POOLS = {
  classSupervisorComment: [
    'A pleasure to have in class this term — consistently engaged and respectful.',
    'Shows steady improvement and a positive attitude toward learning.',
    'Needs to focus more during lessons, but works well with peers.',
    'A conscientious student who takes pride in their work.',
    'Settling in well; participation in class discussions has grown this term.',
  ],
  gradeSupervisorComment: [
    'Meeting expectations for their grade level across most subjects.',
    'A well-rounded student who balances academics and extracurriculars.',
    'Encouraged to seek extra help in weaker subject areas next term.',
    'Demonstrates strong time-management and organizational skills.',
  ],
  principalComment: [
    'Congratulations on a solid term — keep up the good work.',
    'A valued member of our school community.',
    "Encouraged to build on this term's progress going forward.",
    'Thank you for your positive contribution to school life this term.',
  ],
  vicePrincipalComment: [
    'Overall conduct and effort this term were commendable.',
    'A respectful and cooperative member of the student body.',
    'Continued effort will lead to strong results next term.',
    'Well done this term — maintain this level of commitment.',
  ],
};

async function runPhase14(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId) {
    throw new Error('Phase 14 requires Phase 1 and Phase 2a/2b to have run first (no termId/roster in checkpoint).');
  }

  const students = cp.roster.filter((u) => u.role === 'student');
  const supervisors = buildClassSupervisors(cp);

  faker.seed(FAKER_SEED + 8); // independent of every other phase's faker draws
  const items = students.map((student, i) => {
    const classId = classIdForStudentIndex(i);
    const supervisor = supervisors.get(classId);
    return {
      ref: db.collection('institutions').doc(institutionId).collection('reportCardComments').doc(`rcc_${student.uid}_${cp.termId}`),
      data: {
        institutionId,
        studentId: student.uid,
        termId: cp.termId,
        academicYearId: cp.academicYearId,
        classSupervisorComment: faker.helpers.arrayElement(REPORT_CARD_COMMENT_POOLS.classSupervisorComment),
        gradeSupervisorComment: faker.helpers.arrayElement(REPORT_CARD_COMMENT_POOLS.gradeSupervisorComment),
        principalComment: faker.helpers.arrayElement(REPORT_CARD_COMMENT_POOLS.principalComment),
        vicePrincipalComment: faker.helpers.arrayElement(REPORT_CARD_COMMENT_POOLS.vicePrincipalComment),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: supervisor ? supervisor.uid : 'seed-bulk-institution-script',
      },
    };
  });

  if (!cp.phase14Progress) {
    cp.phase14Progress = { total: items.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase14Progress.written);
  console.log(`Phase 14: ${cp.phase14Progress.written}/${items.length} reportCardComments already written; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0].data);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const base14 = cp.phase14Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase14Progress.written = base14 + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 15a/15b — reportCards (§7)
// Generation-equivalent reimplementation of src/lib/generateReportCard.ts
// (client-SDK-only, can't run in this Admin-SDK script) plus
// report-cards/index.tsx's handleBatchGenerate() two-pass flow: 15a
// generates every student's card with classAverage/classRank left null
// (skipClassRankComputation:true equivalent), 15b reads the full cohort back
// and writes classAverage/classRank per class — split into two phase keys
// (§9/PHASE_ORDER comment above) since 15b must not start until every 15a
// write across every class has landed, which a single flat progress counter
// can't express. Every seeded result is source:'gradebook' (Phase 8), so
// only generateReportCard.ts's gradebook branch is reachable here — the
// non-gradebook coursework/exam-weight branch is dead code for this seed's
// data and isn't reimplemented. subjectPosition is always null, matching
// the real batch flow (which never actually computes it despite
// generateReportCard.ts's per-student comment suggesting it does).
// ─────────────────────────────────────────────────────────────────────────
function letterGradeAdmin(score) {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 45) return 'D+';
  if (score >= 40) return 'D';
  if (score >= 30) return 'D-';
  return 'E';
}
function gpaPointsAdmin(grade) {
  if (grade === 'A+' || grade === 'A' || grade === 'A-') return 4;
  if (grade === 'B+' || grade === 'B' || grade === 'B-') return 3;
  if (grade === 'C+' || grade === 'C' || grade === 'C-') return 2;
  if (grade === 'D+' || grade === 'D' || grade === 'D-') return 1;
  return 0;
}
function computeGPAAdmin(subjects) {
  if (subjects.length === 0) return null;
  const total = subjects.reduce((sum, s) => sum + gpaPointsAdmin(letterGradeAdmin(s.finalGrade)), 0);
  return Math.round((total / subjects.length) * 100) / 100;
}
// Mirrors reportCardUtils.ts's nextTermStart() exactly. Always resolves to
// null for this seed (a single term in a single academic year has no "next
// term" to find), but reimplemented in full rather than hardcoded null so a
// future multi-term extension of this seed (§13 — explicitly deferred, not
// impossible) wouldn't need this logic rebuilt from scratch.
function nextTermStartAdmin(currentTermNumber, currentAcademicYearId, allTerms) {
  if (currentTermNumber !== undefined) {
    const next = allTerms.find((t) => t.academicYearId === currentAcademicYearId && t.termNumber === currentTermNumber + 1);
    if (next) return next.startDate;
  }
  const upcoming = allTerms
    .filter((t) => t.academicYearId !== currentAcademicYearId && (t.status === 'upcoming' || t.status === 'active'))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return upcoming[0]?.startDate ?? null;
}

async function fetchReportContext(db, institutionId, cp) {
  const [instSnap, termSnap, yearSnap, allTermsSnap] = await Promise.all([
    db.collection('institutions').doc(institutionId).get(),
    institutionDoc(db, institutionId, 'terms', cp.termId).get(),
    institutionDoc(db, institutionId, 'academicYears', cp.academicYearId).get(),
    institutionCollection(db, institutionId, 'terms').get(),
  ]);
  return {
    inst: instSnap.data(),
    term: termSnap.data(),
    academicYear: yearSnap.exists ? yearSnap.data() : null,
    allTerms: allTermsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

async function buildReportCardPayload(db, institutionId, cp, student, absoluteIndex, subjectMap, reportCtx) {
  const { inst, term, academicYear, allTerms, studentsByClass } = reportCtx;
  const classId = classIdForStudentIndex(absoluteIndex);
  const className = classIdToName(classId);
  const houseName = houseNameForStudentIndex(absoluteIndex);
  const classStudents = studentsByClass.get(classId) ?? [];

  const [attSnap, resultsSnap, feedbackSnap, commentsSnap, activitiesSnap, responsibilitiesSnap, disciplinarySnap] = await Promise.all([
    institutionDoc(db, institutionId, 'attendanceSummaries', `${student.uid}_${cp.termId}`).get(),
    institutionCollection(db, institutionId, 'results').where('studentId', '==', student.uid).where('termId', '==', cp.termId).get(),
    institutionCollection(db, institutionId, 'feedback_comments').where('studentId', '==', student.uid).where('termId', '==', cp.termId).get(),
    institutionDoc(db, institutionId, 'reportCardComments', `rcc_${student.uid}_${cp.termId}`).get(),
    institutionCollection(db, institutionId, 'studentActivities').where('studentId', '==', student.uid).where('termId', '==', cp.termId).get(),
    institutionCollection(db, institutionId, 'studentResponsibilities').where('studentId', '==', student.uid).where('termId', '==', cp.termId).get(),
    institutionCollection(db, institutionId, 'disciplinaryActions').where('studentId', '==', student.uid).where('termId', '==', cp.termId).get(),
  ]);

  const att = attSnap.exists ? attSnap.data() : { totalExpectedSessions: 0, sessionsAbsent: 0, daysLate: 0 };
  const results = resultsSnap.docs.map((d) => d.data());
  if (results.length === 0) {
    // §11 — an unexpected missing reference stops the run rather than
    // silently skipping; this should be unreachable given PHASE_ORDER
    // guarantees Phase 8 is complete before Phase 15a ever runs.
    throw new Error(`Phase 15a: no results found for student ${student.uid} (${student.name}) in term ${cp.termId} — Phase 8 must be complete first.`);
  }

  const feedbackBySubject = {};
  feedbackSnap.docs.forEach((d) => {
    const fd = d.data();
    feedbackBySubject[fd.subjectId] = { conductGrade: fd.conductGrade, commentNumbers: fd.commentNumbers ?? [] };
  });

  const subjectIds = [...new Set(results.map((r) => r.subjectId))];
  const subjectRows = subjectIds.map((sid) => {
    const subj = subjectMap.get(sid);
    const subjectResults = results.filter((r) => r.subjectId === sid);
    const finalGrade = Math.round(
      subjectResults.reduce((sum, r) => sum + (r.score / r.maxScore) * (r.columnWeight ?? 0), 0) * 10,
    ) / 10;
    const fb = feedbackBySubject[sid];
    return {
      subjectId: sid,
      subjectName: subj.name,
      teacherId: subj.teacherIds[0] ?? '',
      teacherName: subj.teacherNames[0] ?? '',
      cwWeight: subj.cwWeight,
      examWeight: subj.examWeight,
      cwGrade: null,
      examGrade: null,
      finalGrade,
      letterGrade: letterGradeAdmin(finalGrade),
      subjectPosition: null,
      conductGrade: fb ? fb.conductGrade : null,
      commentNumbers: fb ? fb.commentNumbers : null,
    };
  }).sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const comments = commentsSnap.exists ? commentsSnap.data() : {};
  const disciplinaryCounts = { merit: 0, demerit: 0, detention: 0, suspension: 0 };
  disciplinarySnap.docs.forEach((d) => { disciplinaryCounts[d.data().type] += 1; });

  const studentAverage = subjectRows.length > 0
    ? subjectRows.reduce((s, r) => s + r.finalGrade, 0) / subjectRows.length
    : null;

  return {
    id: `rc_${student.uid}_${cp.termId}`,
    data: {
      studentId: student.uid,
      studentName: student.name,
      studentGender: student.gender ?? null,
      institutionStudentId: student.institutionStudentId ?? null,
      dateOfBirth: student.dateOfBirth ?? null,
      classId,
      className,
      classPopulation: classStudents.length,
      houseId: houseDocId(houseName),
      houseName: `${houseName} House`,
      termId: cp.termId,
      termName: term.name,
      academicYearId: term.academicYearId,
      academicYearName: academicYear ? academicYear.name : '',
      nextTermStart: nextTermStartAdmin(term.termNumber, term.academicYearId, allTerms),
      institutionId,
      institutionName: inst.name,
      institutionMotto: inst.motto ?? null,
      institutionAddress: inst.address ?? null,
      institutionPhone: inst.phone ?? null,
      institutionEmail: inst.email ?? null,
      institutionLogoUrl: inst.logoUrl ?? null,
      authorizedSignature: inst.authorizedSignature ?? null,
      classSupervisorLabel: inst.classSupervisorLabel ?? 'Class Supervisor',
      gradeSupervisorLabel: inst.gradeSupervisorLabel ?? 'Grade Supervisor',
      principalLabel: inst.principalLabel ?? 'Principal',
      vicePrincipalLabel: inst.vicePrincipalLabel ?? 'Vice Principal',
      classSupervisorComment: comments.classSupervisorComment ?? '',
      gradeSupervisorComment: comments.gradeSupervisorComment ?? '',
      principalComment: comments.principalComment ?? '',
      vicePrincipalComment: comments.vicePrincipalComment ?? '',
      totalPossibleSessions: att.totalExpectedSessions ?? 0,
      sessionsAbsent: att.sessionsAbsent ?? 0,
      daysLate: att.daysLate ?? 0,
      extraCurricularActivities: activitiesSnap.docs.map((d) => d.data().activityName),
      positionsOfResponsibility: responsibilitiesSnap.docs.map((d) => ({ title: d.data().title, organisation: d.data().organisation ?? null })),
      gradingSystem: inst.gradingSystem ?? 'flat',
      subjects: subjectRows,
      studentAverage,
      classAverage: null,
      classRank: null,
      gpa: subjectRows.length > 0 ? computeGPAAdmin(subjectRows) : null,
      merits: disciplinaryCounts.merit,
      demerits: disciplinaryCounts.demerit,
      suspensions: disciplinaryCounts.suspension,
      detentions: disciplinaryCounts.detention,
      generatedAt: FieldValue.serverTimestamp(),
      generatedBy: 'seed-bulk-institution-script',
      generatedByRole: 'institution_admin',
      generatedViaBatch: true,
    },
  };
}

async function runPhase15a(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId) {
    throw new Error('Phase 15a requires Phase 1 and Phase 2a/2b to have run first (no termId/roster in checkpoint).');
  }

  const students = cp.roster.filter((u) => u.role === 'student');
  const subjectMap = new Map(buildSubjects(cp).map((s) => [s.id, s]));
  const studentsByClass = groupStudentsByClass(cp);

  if (!cp.phase15aProgress) {
    cp.phase15aProgress = { total: students.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = students.slice(cp.phase15aProgress.written);
  console.log(`Phase 15a: ${cp.phase15aProgress.written}/${students.length} report cards already generated; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would generate up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining report card(s) — payload requires live reads of results/feedback/attendance/comments/activities, no offline preview available.`);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  // Capped to budgetRemaining *before* any live reads — buildReportCardPayload
  // costs 7 reads/student regardless of whether the resulting write actually
  // fits this run's remaining budget, so reading (and then discarding) data
  // for students this run can't write anyway would just repeat that same
  // read work again next run once the budget resets.
  const toGenerate = pending.slice(0, budgetRemaining);

  const reportCtx = await fetchReportContext(db, institutionId, cp);
  reportCtx.studentsByClass = studentsByClass;

  const built = [];
  for (let i = 0; i < toGenerate.length; i++) {
    const absoluteIndex = cp.phase15aProgress.written + i;
    built.push(await buildReportCardPayload(db, institutionId, cp, toGenerate[i], absoluteIndex, subjectMap, reportCtx));
  }

  const base15a = cp.phase15aProgress.written;
  const written = await budgetedBatchWrite(
    db, built, budgetRemaining,
    (item) => db.collection('institutions').doc(institutionId).collection('reportCards').doc(item.id),
    (item) => item.data,
    {
      onProgress: (n) => {
        cp.phase15aProgress.written = base15a + n;
        saveCheckpoint(cp);
      },
    },
  );

  return { writes: written, complete: written === built.length && pending.length <= budgetRemaining };
}

async function runPhase15b(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.termId) {
    throw new Error('Phase 15b requires Phase 1 to have run first (no termId in checkpoint).');
  }

  if (opts.dryRun) {
    console.log("Phase 15b: [dry-run] would read all reportCards for the term, compute per-class average/rank in one grouped pass, and write them back (mirrors report-cards/index.tsx's handleBatchGenerate() Pass 2 math exactly).");
    return { writes: 0, complete: true };
  }

  const snap = await institutionCollection(db, institutionId, 'reportCards').where('termId', '==', cp.termId).get();
  const byClass = new Map();
  snap.forEach((d) => {
    const data = d.data();
    if (!byClass.has(data.classId)) byClass.set(data.classId, []);
    byClass.get(data.classId).push({ ref: d.ref, studentAverage: data.studentAverage });
  });

  const items = [];
  for (const cards of byClass.values()) {
    const valid = cards.filter((c) => c.studentAverage !== null);
    const classAverage = valid.length > 0 ? valid.reduce((s, c) => s + c.studentAverage, 0) / valid.length : null;
    const sorted = [...valid].sort((a, b) => b.studentAverage - a.studentAverage);
    const rankByRef = new Map(sorted.map((c, i) => [c.ref, i + 1]));
    cards.forEach((c) => {
      items.push({ ref: c.ref, data: { classAverage, classRank: rankByRef.get(c.ref) ?? null } });
    });
  }

  if (!cp.phase15bProgress) {
    cp.phase15bProgress = { total: items.length, written: 0 };
    saveCheckpoint(cp);
  }
  const pending = items.slice(cp.phase15bProgress.written);
  console.log(`Phase 15b: ${cp.phase15bProgress.written}/${items.length} report cards already rank-updated; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  const base15b = cp.phase15bProgress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining, (item) => item.ref, (item) => item.data, {
    mode: 'update',
    onProgress: (n) => {
      cp.phase15bProgress.written = base15b + n;
      saveCheckpoint(cp);
    },
  });

  return { writes: written, complete: written === pending.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 16 — progressReports (§7)
// Generation-equivalent reimplementation of src/lib/generateProgressReport.ts
// (client-SDK-only). Deliberately does NOT use Report Card's weighted
// coursework/exam formula — a simple per-subject mean of (score/maxScore),
// same as the real function. Deterministic ID (`pr_<uid>_<termId>`) per §9,
// unlike the live UI's always-addDoc pattern — safe here since this seed
// only ever generates exactly 1/student/term, well under the real feature's
// 5-per-student-term retention cap, so that cap's enforcement/delete logic
// (enforceProgressReportCap()) is never exercised and isn't reimplemented.
// ─────────────────────────────────────────────────────────────────────────
async function buildProgressReportPayload(db, institutionId, cp, student, absoluteIndex, subjectMap, ctx16) {
  const { inst, term, academicYear } = ctx16;
  const classId = classIdForStudentIndex(absoluteIndex);
  const className = classIdToName(classId);

  const resultsSnap = await institutionCollection(db, institutionId, 'results')
    .where('studentId', '==', student.uid).where('termId', '==', cp.termId).get();
  const results = resultsSnap.docs.map((d) => d.data());
  if (results.length === 0) {
    throw new Error(`Phase 16: no results found for student ${student.uid} (${student.name}) in term ${cp.termId} — Phase 8 must be complete first.`);
  }

  const subjectIds = [...new Set(results.map((r) => r.subjectId))];
  const subjectRows = subjectIds.map((sid) => {
    const subj = subjectMap.get(sid);
    const subjectResults = results.filter((r) => r.subjectId === sid);
    const average = Math.round(
      (subjectResults.reduce((s, r) => s + (r.score / r.maxScore) * 100, 0) / subjectResults.length) * 10,
    ) / 10;
    return {
      subjectId: sid,
      subjectName: subj.name,
      teacherId: subj.teacherIds[0] ?? '',
      teacherName: subj.teacherNames[0] ?? '',
      average,
      letterGrade: letterGradeAdmin(average),
    };
  }).sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const overallAverage = subjectRows.length > 0
    ? Math.round((subjectRows.reduce((s, r) => s + r.average, 0) / subjectRows.length) * 10) / 10
    : null;

  return {
    id: `pr_${student.uid}_${cp.termId}`,
    data: {
      institutionId,
      studentId: student.uid,
      studentName: student.name,
      classId,
      className,
      termId: cp.termId,
      termName: term.name,
      academicYearId: term.academicYearId,
      academicYearName: academicYear ? academicYear.name : '',
      institutionName: inst.name,
      institutionAddress: inst.address ?? null,
      institutionPhone: inst.phone ?? null,
      institutionLogoUrl: inst.logoUrl ?? null,
      authorizedSignature: inst.authorizedSignature ?? null,
      principalLabel: inst.principalLabel ?? 'Principal',
      subjects: subjectRows,
      overallAverage,
      generatedAt: FieldValue.serverTimestamp(),
      generatedBy: 'seed-bulk-institution-script',
      generatedByName: 'Seed Bulk Institution Script',
    },
  };
}

async function runPhase16(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.roster || !cp.termId) {
    throw new Error('Phase 16 requires Phase 1 and Phase 2a/2b to have run first (no termId/roster in checkpoint).');
  }

  const students = cp.roster.filter((u) => u.role === 'student');
  const subjectMap = new Map(buildSubjects(cp).map((s) => [s.id, s]));

  if (!cp.phase16Progress) {
    cp.phase16Progress = { total: students.length, written: 0 };
    if (!opts.dryRun) saveCheckpoint(cp);
  }
  const pending = students.slice(cp.phase16Progress.written);
  console.log(`Phase 16: ${cp.phase16Progress.written}/${students.length} progress reports already generated; ${pending.length} remaining.`);

  if (pending.length === 0) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would generate up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining progress report(s) — payload requires a live read of Phase 8's results, no offline preview available.`);
    return { writes: 0, complete: pending.length <= budgetRemaining };
  }

  const [instSnap, termSnap, yearSnap] = await Promise.all([
    db.collection('institutions').doc(institutionId).get(),
    institutionDoc(db, institutionId, 'terms', cp.termId).get(),
    institutionDoc(db, institutionId, 'academicYears', cp.academicYearId).get(),
  ]);
  const ctx16 = { inst: instSnap.data(), term: termSnap.data(), academicYear: yearSnap.exists ? yearSnap.data() : null };

  // Capped to budgetRemaining *before* any live reads — same rationale as
  // Phase 15a's toGenerate above (buildProgressReportPayload's results query
  // costs a read regardless of whether the write fits this run's budget).
  const toGenerate = pending.slice(0, budgetRemaining);

  const built = [];
  for (let i = 0; i < toGenerate.length; i++) {
    const absoluteIndex = cp.phase16Progress.written + i;
    built.push(await buildProgressReportPayload(db, institutionId, cp, toGenerate[i], absoluteIndex, subjectMap, ctx16));
  }

  const base16 = cp.phase16Progress.written;
  const written = await budgetedBatchWrite(
    db, built, budgetRemaining,
    (item) => db.collection('institutions').doc(institutionId).collection('progressReports').doc(item.id),
    (item) => item.data,
    {
      onProgress: (n) => {
        cp.phase16Progress.written = base16 + n;
        saveCheckpoint(cp);
      },
    },
  );

  return { writes: written, complete: written === built.length && pending.length <= budgetRemaining };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 17 — enrollmentRegistrations (§7)
// Small illustrative sample (§13 — never converted to accounts), matching
// register/[institutionId]/index.tsx's public submission shape exactly.
// Also backfills registration_directory/{id}'s activeAcademicYearId/Name
// (§7.4 — missing from Phase 0's original write, discovered while building
// this phase), since the real public form reads those fields off the
// directory entry, not off academicYears directly.
// ─────────────────────────────────────────────────────────────────────────
const ENROLLMENT_SAMPLE_SIZE = 40; // within §4.1's ~30-50 estimate

const REGISTRATION_STATUS_WEIGHTS = [
  { weight: 50, value: 'pending' },
  { weight: 30, value: 'reviewed' },
  { weight: 20, value: 'rejected' }, // never 'converted' — that status implies a real convertedStudentUid this seed never creates
];

function buildRegistrationGuardian() {
  const sex = faker.person.sexType();
  return {
    lastName: faker.person.lastName(),
    firstName: faker.person.firstName(sex),
    address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
    contact: faker.phone.number(),
    email: faker.internet.email().toLowerCase(),
    occupation: faker.person.jobTitle(),
    ...(faker.datatype.boolean() ? { work: faker.company.name() } : {}),
  };
}

async function runPhase17(ctx, cp, opts, budgetRemaining) {
  const { db } = ctx;
  const institutionId = cp.institutionId;
  if (!cp.academicYearId || !cp.academicYearName) {
    throw new Error('Phase 17 requires Phase 1 to have run first (no academicYearId/academicYearName in checkpoint).');
  }

  faker.seed(FAKER_SEED + 9); // independent of every other phase's faker draws
  const items = [];
  for (let i = 0; i < ENROLLMENT_SAMPLE_SIZE; i++) {
    const sex = faker.person.sexType();
    const grade = faker.helpers.arrayElement(GRADE_LEVELS);
    const includeMother = faker.datatype.boolean({ probability: 0.85 });
    const includeFather = faker.datatype.boolean({ probability: 0.7 }) || !includeMother;
    items.push({
      ref: db.collection('institutions').doc(institutionId).collection('enrollmentRegistrations').doc(`enroll_${i}`),
      data: {
        institutionId,
        academicYearId: cp.academicYearId,
        academicYearName: cp.academicYearName,
        status: faker.helpers.weightedArrayElement(REGISTRATION_STATUS_WEIGHTS),
        submittedAt: FieldValue.serverTimestamp(),
        // Always false, matching the real public form — computePossibleDuplicates()
        // recomputes and backfills this client-side the first time an admin opens
        // the Registrations page against real student data (§7.4), not reimplemented here.
        possibleDuplicate: false,
        student: {
          lastName: faker.person.lastName(),
          firstName: faker.person.firstName(sex),
          requestedClass: `Grade ${grade}`,
          dateOfBirth: toISO(faker.date.birthdate({ min: 5, max: 18, mode: 'age' })),
          gender: sex === 'male' ? 'Male' : 'Female',
          email: faker.internet.email().toLowerCase(),
          ...(faker.datatype.boolean({ probability: 0.4 }) ? { lastSchoolAttended: `${faker.company.name()} School` } : {}),
        },
        mother: includeMother ? buildRegistrationGuardian() : null,
        father: includeFather ? buildRegistrationGuardian() : null,
      },
    });
  }

  if (!cp.phase17Progress) {
    cp.phase17Progress = { total: items.length, written: 0, directoryUpdated: false };
    if (!opts.dryRun) saveCheckpoint(cp);
  }

  const pending = items.slice(cp.phase17Progress.written);
  console.log(`Phase 17: ${cp.phase17Progress.written}/${items.length} illustrative enrollmentRegistrations already written; ${pending.length} remaining.`);

  if (pending.length === 0 && cp.phase17Progress.directoryUpdated) return { writes: 0, complete: true };

  if (opts.dryRun) {
    console.log(`  [dry-run] would write up to ${Math.min(pending.length, budgetRemaining)} of ${pending.length} remaining doc(s), e.g.`, pending[0]?.data);
    // Mirrors the live-mode `complete` check below exactly — pending.length
    // alone isn't enough, since the registration_directory backfill is a
    // separate sub-step that could still be outstanding even once every
    // illustrative registration doc has been written.
    return { writes: 0, complete: pending.length <= budgetRemaining && cp.phase17Progress.directoryUpdated };
  }

  let writesThisPhase = 0;

  // Deliberately leaves acceptingRegistrations at Phase 0's original `false`
  // — setting it true would put this disposable seed institution on the real
  // public /register page for any internet visitor to submit to.
  if (!cp.phase17Progress.directoryUpdated && budgetRemaining > writesThisPhase) {
    await db.collection('registration_directory').doc(institutionId).set(
      { activeAcademicYearId: cp.academicYearId, activeAcademicYearName: cp.academicYearName },
      { merge: true },
    );
    cp.phase17Progress.directoryUpdated = true;
    writesThisPhase += 1;
    saveCheckpoint(cp);
  }

  const base17 = cp.phase17Progress.written;
  const written = await budgetedBatchWrite(db, pending, budgetRemaining - writesThisPhase, (item) => item.ref, (item) => item.data, {
    onProgress: (n) => {
      cp.phase17Progress.written = base17 + n;
      saveCheckpoint(cp);
    },
  });
  writesThisPhase += written;

  return { writes: writesThisPhase, complete: (base17 + written) === items.length && cp.phase17Progress.directoryUpdated };
}

const PHASE_RUNNERS = {
  '0': runPhase0,
  '1': runPhase1,
  '2a': runPhase2a,
  '2b': runPhase2b,
  '3': runPhase3,
  '4': runPhase4,
  '5': runPhase5,
  '6': runPhase6,
  '7': runPhase7,
  '8': runPhase8,
  '9': runPhase9,
  '10': runPhase10,
  '11': runPhase11,
  '12': runPhase12,
  '13': runPhase13,
  '14': runPhase14,
  '15a': runPhase15a,
  '15b': runPhase15b,
  '16': runPhase16,
  '17': runPhase17,
  // Every implementation-order phase (§14) is now implemented.
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
