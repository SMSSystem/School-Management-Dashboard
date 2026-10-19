#!/usr/bin/env node
/**
 * Demo institution: "Blue Mountain Primary School", a small fictional Jamaican primary
 * school (grades 1-6, 12 classes, 250 students, 16 teachers, ~210 parents) with an
 * completed Institution Profile, the Jamaican three-term 2026-2027 calendar, and dummy data
 * from 7 Sep 2026 up to today: general and subject attendance, assignments, lesson notes
 * and gradebook marks, plus manual-entry results, rubrics (linked to some assignments),
 * disciplinary actions, progress reports and report cards (the data Report Builder reads).
 * It exists so a prospective client can be given a read-only spectator login. *
 * The Classes list reads each class's head-count from the class document once it has been recounted
 * (src/lib/classPopulationDelta.ts). This script creates students without going through the app, so
 * after a live run, run: node scripts/recount-class-populations.mjs --key=<path> --institution=<id> --live
 *
 * Who can sign in: the institution admin, the spectator, one senior teacher, one regular
 * teacher, one parent and one student (6 Firebase Auth accounts, ids bmps*). Everyone else
 * is a users/{id} record only: they show in every list and report but cannot sign in.
 * Passwords are generated and printed ONCE to the screen (never saved to a file).
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. A dry run needs no key and
 * touches nothing; it prints what a live run would write.
 *
 * Re-runnable: everything is deterministic, and a local checkpoint remembers what is written.
 * Run again later (or with --through=YYYY-MM-DD) to add the days since. Content (assignments,
 * notes, marks) is generated for Term 1 only; attendance runs through the last term.
 *
 * Free tier: about 8,200 writes for 7 Sep to 15 Oct for the original data plus about 5,300
 * for the second set (one day's quota is 20,000), then roughly 400-700 per school week
 * (report cards are rewritten each time). Report cards are INTERIM until Term 1's exam marks
 * exist: grades are scaled to the weight assessed so far. --budget (default 9,000) caps one run; run again the next day to
 * continue. Reads are a handful. No Cloud Functions or Storage.
 *
 * Usage:
 *   node scripts/seed-demo-primary-school.mjs [--through=YYYY-MM-DD] [--budget=<n>]            (dry run)
 *   node scripts/seed-demo-primary-school.mjs --key=<path> --live [--through=YYYY-MM-DD] [--budget=<n>]
 *   node scripts/seed-demo-primary-school.mjs --key=<path> --teardown [--live]
 *
 * --teardown removes the institution and everything under it, its users and links, the 6
 * Auth accounts and the checkpoint (dry run unless --live). It only ever touches the
 * checkpointed institution id, and only if its name is exactly the demo school's.
 *
 * Never commit the key or the checkpoint (see .gitignore).
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import {
  SCHOOL,
  LOGIN_UIDS,
  DATED_PHASES,
  buildStaticPlan,
  buildExtras,
  buildDatedPlan,
  buildAttendanceSummaries,
  buildReportCards,
  clampThrough,
  isSafePath,
  maskEmail,
  termId,
  todayInJamaica,
  termStatus,
  TERMS,
} from './seedDemoPrimaryLogic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = path.join(__dirname, '.demo-primary-checkpoint.json');
const BATCH_LIMIT = 450;
const DEFAULT_BUDGET = 9000;
// Bump when the report-card content changes in a way a re-run must rewrite (2: the signatory was corrected).
const REPORT_CARDS_VERSION = 2;

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/seed-demo-primary-school.mjs [--through=YYYY-MM-DD] [--budget=<n>]
  node scripts/seed-demo-primary-school.mjs --key=<path> --live [--through=YYYY-MM-DD] [--budget=<n>]
  node scripts/seed-demo-primary-school.mjs --key=<path> --teardown [--live]

  --live          Actually write (or delete, with --teardown). Omit for a dry run (the default).
  --key=<path>    Service-account JSON key (or GOOGLE_APPLICATION_CREDENTIALS). Not needed for a dry run.
  --through=<d>   Seed up to this date (default: today; never later than today).
  --budget=<n>    Most Firestore writes in one run (default ${DEFAULT_BUDGET}).
  --teardown      Remove the demo institution, its users and its Auth accounts.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { live: false, keyPath: null, through: null, budget: DEFAULT_BUDGET, teardown: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg === '--teardown') opts.teardown = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--through=')) opts.through = arg.slice('--through='.length);
    else if (arg.startsWith('--budget=')) opts.budget = Number(arg.slice('--budget='.length));
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (opts.through !== null && !/^\d{4}-\d{2}-\d{2}$/.test(opts.through)) {
    console.error('--through must look like 2026-10-15.');
    process.exit(1);
  }
  if (!Number.isFinite(opts.budget) || opts.budget <= 0) {
    console.error('--budget must be a positive number.');
    process.exit(1);
  }
  return opts;
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) {
    return { institutionId: null, authCreated: {}, staticWritten: 0, extrasWritten: 0, cursors: {}, summariesThrough: null, reportCardsThrough: null };
  }
  return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
}

function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

function initAdmin(keyPath) {
  if (keyPath && !existsSync(keyPath)) {
    console.error(`Key file not found: ${keyPath}`);
    process.exit(1);
  }
  const credential = keyPath ? cert(JSON.parse(readFileSync(keyPath, 'utf8'))) : applicationDefault();
  const app = initializeApp({ credential });
  return { db: getFirestore(app), auth: getAuth(app) };
}

// Letters and digits only, no look-alikes, so it can be typed or pasted anywhere.
function generatePassword() {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(lower), pick(upper), pick(digits)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Writes items[from..] with set(), at most `limit` of them; returns how many were written. */
async function writeItems(db, institutionId, items, from, limit, onProgress) {
  let written = 0;
  let batch = db.batch();
  let ops = 0;
  for (let i = from; i < items.length && written < limit; i++) {
    const item = items[i];
    if (!isSafePath(item.path, institutionId)) {
      throw new Error(`Refusing to write outside the demo institution: ${item.path}`);
    }
    if (item.mode === 'update') batch.update(db.doc(item.path), item.data);
    else batch.set(db.doc(item.path), item.data);
    ops++;
    written++;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      onProgress(written);
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
    onProgress(written);
  }
  return written;
}

async function seed(opts) {
  // Jamaica's date, not the UTC date: after about 7 pm local time the UTC date is already tomorrow.
  const todayISO = todayInJamaica();
  const through = clampThrough(opts.through, todayISO);
  const cp = loadCheckpoint();

  const live = opts.live;
  let db = null;
  let auth = null;
  if (live) ({ db, auth } = initAdmin(opts.keyPath));

  // The institution id is created once and pinned before any write, so a crash can never
  // leave a second institution behind on retry.
  let institutionId = cp.institutionId ?? 'DRYRUNID';
  if (live && !cp.institutionId) {
    const existing = await db.collection('institutions').where('name', '==', SCHOOL.name).limit(1).get();
    if (!existing.empty) {
      console.error(
        `An institution named "${SCHOOL.name}" already exists (${existing.docs[0].id}) but there is no checkpoint for it.\n` +
        'Refusing to create a second one. Restore the checkpoint file, or remove that institution first.',
      );
      process.exit(1);
    }
    institutionId = db.collection('institutions').doc().id;
    cp.institutionId = institutionId;
    saveCheckpoint(cp);
  }

  const { people, subjects, items: staticItems } = buildStaticPlan(institutionId, todayISO);
  const extraItems = buildExtras(institutionId, people, subjects);
  const dated = buildDatedPlan(institutionId, people, subjects, through);
  const summaries = buildAttendanceSummaries(institutionId, people, through);
  const reportCards = buildReportCards(institutionId, people, subjects, through);

  console.log(`Mode: ${live ? 'LIVE (will write)' : 'dry run (nothing will be written)'}`);
  console.log(`Institution: "${SCHOOL.name}" (${institutionId}); seeding through ${through} (today is ${todayISO})`);
  console.log(`People: ${people.students.length} students, ${people.parents.length} parents, ${people.seniors.length + people.regulars.length} teachers, 1 admin, 1 spectator (${people.familyCount} families)`);
  console.log('');

  // 1. Auth accounts for the six sign-in accounts.
  const loginPeople = [people.admin, people.spectator, people.seniors[0], people.regulars[0], people.parents[0], people.students[0]];
  const pendingAuth = loginPeople.filter((p) => !cp.authCreated[p.uid]);
  console.log(`Auth accounts: ${loginPeople.length - pendingAuth.length}/${loginPeople.length} already created.`);
  const issued = [];
  if (live) {
    for (const p of pendingAuth) {
      const password = generatePassword();
      try {
        await auth.createUser({ uid: p.uid, email: p.email, password, displayName: p.name, emailVerified: true });
        issued.push({ role: p.role, email: p.email, password });
      } catch (err) {
        if (err?.code === 'auth/uid-already-exists' || err?.code === 'auth/email-already-exists') {
          console.log(`  ${p.role} ${maskEmail(p.email)}: an Auth account already exists; its password is unchanged.`);
        } else {
          throw err;
        }
      }
      cp.authCreated[p.uid] = true;
      saveCheckpoint(cp);
    }
  } else {
    for (const p of pendingAuth) console.log(`  [dry-run] would create ${p.role}: ${maskEmail(p.email)} (${p.uid})`);
  }

  // 2. Static documents, then dated phases, then summaries, within the write budget.
  let budget = opts.budget;
  const plan = [
    { key: 'static', label: 'static documents', items: staticItems, get: () => cp.staticWritten ?? 0, set: (n) => { cp.staticWritten = n; } },
    { key: 'extras', label: 'rubrics, feedback comments, report-card comments, activities', items: extraItems, get: () => cp.extrasWritten ?? 0, set: (n) => { cp.extrasWritten = n; } },
    ...DATED_PHASES.map((key) => ({
      key,
      label: key,
      items: dated[key],
      get: () => cp.cursors[key] ?? 0,
      set: (n) => { cp.cursors[key] = n; },
    })),
  ];
  let totalWritten = 0;
  for (const phase of plan) {
    const from = phase.get();
    const pending = phase.items.length - from;
    console.log(`${phase.label}: ${from}/${phase.items.length} written; ${pending} to write.`);
    if (pending <= 0) continue;
    if (!live) {
      totalWritten += pending;
      continue;
    }
    if (budget <= 0) {
      console.log('  budget used up; run again to continue.');
      continue;
    }
    const base = from;
    const n = await writeItems(db, institutionId, phase.items, from, budget, (done) => {
      phase.set(base + done);
      saveCheckpoint(cp);
    });
    budget -= n;
    totalWritten += n;
    if (n < pending) console.log(`  wrote ${n} of ${pending} (budget); run again to continue.`);
  }

  // Term statuses depend on today's date: refresh them every live run (3 small writes), once the
  // static documents (which include the terms) are all written.
  if (live && budget > 0 && (cp.staticWritten ?? 0) >= staticItems.length) {
    const batch = db.batch();
    for (const t of TERMS) {
      batch.update(db.doc(`institutions/${institutionId}/terms/${termId(institutionId, t.number)}`), { status: termStatus(t, todayISO) });
    }
    await batch.commit();
    budget -= TERMS.length;
    totalWritten += TERMS.length;
  }

  // Attendance summaries (one per student) follow the attendance up to `through`.
  const allAttendanceDone = (cp.cursors.generalAttendance ?? 0) >= dated.generalAttendance.length;
  if (cp.summariesThrough === through) {
    console.log(`attendance summaries: up to date through ${through}.`);
  } else if (!live) {
    console.log(`attendance summaries: ${summaries.length} to write.`);
    totalWritten += summaries.length;
  } else if (allAttendanceDone && budget >= summaries.length) {
    const n = await writeItems(db, institutionId, summaries, 0, summaries.length, () => {});
    budget -= n;
    totalWritten += n;
    cp.summariesThrough = through;
    saveCheckpoint(cp);
    console.log(`attendance summaries: wrote ${n}.`);
  } else {
    console.log('attendance summaries: waiting for the attendance to finish (or for budget); run again.');
  }

  // Report cards (what Report Builder reads) are regenerated whenever the seed date changes,
  // from the marks so far: interim grades until the Term Exam column has marks.
  const attendanceDone = (cp.cursors.generalAttendance ?? 0) >= dated.generalAttendance.length;
  const marksDone = (cp.cursors.results ?? 0) >= dated.results.length;
  const extrasDone = (cp.extrasWritten ?? 0) >= extraItems.length;
  if (reportCards.length === 0) {
    console.log('report cards: none yet (no gradebook marks up to this date).');
  } else if (cp.reportCardsThrough === through && cp.reportCardsVersion === REPORT_CARDS_VERSION) {
    console.log(`report cards: up to date through ${through}.`);
  } else if (!live) {
    console.log(`report cards: ${reportCards.length} to write.`);
    totalWritten += reportCards.length;
  } else if (attendanceDone && marksDone && extrasDone && budget >= reportCards.length) {
    const n = await writeItems(db, institutionId, reportCards, 0, reportCards.length, () => {});
    budget -= n;
    totalWritten += n;
    cp.reportCardsThrough = through;
    cp.reportCardsVersion = REPORT_CARDS_VERSION;
    saveCheckpoint(cp);
    console.log(`report cards: wrote ${n}.`);
  } else {
    console.log('report cards: waiting for the marks, attendance and supporting records (or for budget); run again.');
  }

  console.log('');
  console.log(live ? `Done: ${totalWritten} Firestore writes this run.` : `Dry run only: a live run would make about ${totalWritten} writes. Add --live to write.`);

  if (issued.length > 0) {
    console.log('');
    console.log('NEW PASSWORDS (shown once, not saved anywhere; copy them now):');
    for (const i of issued) console.log(`  ${i.role.padEnd(18)} ${i.email}   ${i.password}`);
    console.log('');
    console.log('Sign in from the login page, choosing "Blue Mountain Primary School" as the institution.');
    console.log('To use the real spectator address later: node scripts/set-account-email.mjs --uid=' + people.spectator.uid + ' --email=<address> --key=<path> --live');
  }
}

async function teardown(opts) {
  const cp = loadCheckpoint();
  if (!cp.institutionId) {
    console.error('No checkpoint with an institution id: nothing to tear down.');
    process.exit(1);
  }
  const institutionId = cp.institutionId;
  const { db, auth } = initAdmin(opts.keyPath);
  const ref = db.doc(`institutions/${institutionId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().name !== SCHOOL.name) {
    console.error(`institutions/${institutionId} is missing or is not named exactly "${SCHOOL.name}". Refusing.`);
    process.exit(1);
  }
  const users = await db.collection('users').where('institutionId', '==', institutionId).select().get();
  const links = await db.collection('student_parents').where('institutionId', '==', institutionId).select().get();
  const authUsers = await auth.getUsers(LOGIN_UIDS.map((uid) => ({ uid })));
  const deletableAuth = authUsers.users.filter((u) => (u.email ?? '').endsWith(`@${SCHOOL.emailDomain}`));

  console.log(`Mode: ${opts.live ? 'LIVE (will delete)' : 'dry run (nothing will be deleted)'}`);
  console.log(`Institution "${SCHOOL.name}" (${institutionId}): ${users.size} user documents, ${links.size} parent links, ${deletableAuth.length} Auth accounts, and everything under the institution.`);
  if (!opts.live) {
    console.log('Dry run only. Add --live to delete.');
    return;
  }

  const writer = db.bulkWriter();
  for (const d of users.docs) await db.recursiveDelete(d.ref, writer);
  for (const d of links.docs) writer.delete(d.ref);
  writer.delete(db.doc(`registration_directory/${institutionId}`));
  await writer.close();
  await db.recursiveDelete(ref);
  if (deletableAuth.length > 0) await auth.deleteUsers(deletableAuth.map((u) => u.uid));
  unlinkSync(CHECKPOINT_PATH);
  console.log('Torn down. Checkpoint removed.');
}

const opts = parseArgs(process.argv.slice(2));
(opts.teardown ? teardown(opts) : seed(opts)).catch((err) => {
  console.error(err);
  process.exit(1);
});
