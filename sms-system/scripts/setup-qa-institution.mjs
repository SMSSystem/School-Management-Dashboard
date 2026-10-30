#!/usr/bin/env node
/**
 * Makes ONE QA institution ready for the e2e suite (e2e/01 to e2e/30): academic calendar mode, a department, an academic
 * year with a term, one class, and one account of each of five roles (institution admin, senior teacher, regular teacher,
 * parent, student) with the addresses <prefix>.admin@demo.com and so on. The specs create everything else themselves.
 * It also removes what the retired calendar-mode fallback spec (e2e spec 07) left in the institution, by exact name only:
 * its time block (an academic year with one term), subject, class and timetable slots. Any other academic year or term it
 * finds is reported and stops a live run.
 *
 * It may change only a QA institution named in setupQaInstitutionLogic.mjs (Brookfield Evening Institute); a real school is refused.
 *
 * DRY RUN BY DEFAULT: with no --live it only READS and prints the inventory and what it would remove, create and set. A live run
 * needs --project equal to the key's project_id, the exact --confirm-name, and the phrase it prints typed back to it. It is
 * idempotent: documents and accounts it made are kept, so a second run only reports. Passwords are generated, printed ONCE to
 * the screen with the lines to paste into .env.qa, and never saved anywhere.
 *
 * Usage (from sms-system):
 *   node scripts/setup-qa-institution.mjs --key=<path> --project=<id> --institution-id=<id> --confirm-name="Brookfield Evening Institute" --email-prefix=qa.bf
 *   node scripts/setup-qa-institution.mjs ... --live
 * Other options: --department-name="QA Department" --term-name="QA Term" (the defaults; the same names go in .env.qa as
 * QA_DEPARTMENT_NAME and QA_TERM_NAME when changed). Find the id with delete-real-institution.mjs --list-matches="<name>".
 *
 * After a live run: node scripts/recount-class-populations.mjs --key=<path> --institution=<id> --live (the student joins a class).
 * About 20 writes and a few dozen reads; no Cloud Functions or Storage. Never commit the key.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { roleCounts } from './deleteInstitutionLogic.mjs';
import {
  ACADEMIC_FIELDS,
  FIXED_IDS,
  buildQaPlan,
  checkSetupTarget,
  envLines,
  findLeftovers,
  parseSetupArgs,
  setupPhrase,
} from './setupQaInstitutionLogic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH_LIMIT = 450;
const MAX_DOCS_PER_COLLECTION = 500; // a QA institution is small; more than this means it is not the one meant

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const USAGE = `Usage: node scripts/setup-qa-institution.mjs --key=<path> --project=<id> --institution-id=<id> --confirm-name="<name>" --email-prefix=<prefix> [--live]
Read the header of this file and scripts/README.md. Without --live nothing is changed.`;

function readFirebasercDefault() {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8')).projects?.default ?? null;
  } catch {
    return null;
  }
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function generatePassword() {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(lower), pick(upper), pick(digits)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const todayInJamaica = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

async function readCollection(db, institutionId, name) {
  const col = db.collection('institutions').doc(institutionId).collection(name);
  const count = (await col.count().get()).data().count;
  if (count > MAX_DOCS_PER_COLLECTION) fail(`institutions/${institutionId}/${name} has ${count} documents; this is not a small QA institution. Nothing was touched.`);
  return (await col.get()).docs;
}

async function main() {
  const parsed = parseSetupArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    console.error(USAGE);
    return 1;
  }
  const { opts } = parsed;
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  if (!existsSync(opts.keyPath)) fail(`Key file not found: ${opts.keyPath}`);
  const key = JSON.parse(readFileSync(opts.keyPath, 'utf8'));
  console.log(`Mode: ${opts.live ? 'LIVE' : 'dry run (reads only)'}`);
  console.log(`Project id in the key file: ${key.project_id}`);
  const rcDefault = readFirebasercDefault();
  if (rcDefault) console.log(`.firebaserc default project: ${rcDefault}`);
  if (opts.project !== key.project_id) fail(`--project=${opts.project} does not match the key file's project_id (${key.project_id}). Nothing was touched.`);

  const app = initializeApp({ credential: cert(key), projectId: key.project_id });
  const db = getFirestore(app);
  const auth = getAuth(app);
  const institutionId = opts.institutionId;

  const instRef = db.collection('institutions').doc(institutionId);
  const instSnap = await instRef.get();
  const problems = checkSetupTarget({ institutionId, confirmName: opts.confirmName, exists: instSnap.exists, storedName: instSnap.data()?.name });
  if (problems.length > 0) {
    console.error('Refusing:');
    problems.forEach((p) => console.error(`  - ${p}`));
    return 1;
  }
  const institution = instSnap.data();
  console.log(`Institution ${institutionId}: "${institution.name}", calendarMode ${institution.calendarMode ?? '(unset)'}.`);

  // ── Inventory (reads) ──
  const [years, terms, classes, subjects, slots, departments] = await Promise.all(
    ['academicYears', 'terms', 'classes', 'subjects', 'timetable_slots', 'departments'].map((n) => readCollection(db, institutionId, n)),
  );
  const people = (await db.collection('users').where('institutionId', '==', institutionId).select('role').get()).docs.map((d) => ({ uid: d.id, role: d.data().role }));
  console.log(`Inventory: ${years.length} academic year(s), ${terms.length} term(s), ${classes.length} class(es), ${subjects.length} subject(s), ${slots.length} timetable slot(s), ${departments.length} department(s).`);
  console.log(`Accounts: ${people.length}  by role: ${Object.entries(roleCounts(people)).map(([r, n]) => `${r}=${n}`).join(', ') || 'none'}`);
  for (const y of years) console.log(`  academic year: "${y.data().name}" (${y.id}) ${y.data().status ?? ''}`);
  for (const c of classes) console.log(`  class: "${c.data().name}" (${c.id})`);
  for (const s of subjects) console.log(`  subject: "${s.data().name}" (${s.id})`);

  const leftovers = findLeftovers(
    {
      years: years.map((d) => ({ id: d.id, name: d.data().name })),
      terms: terms.map((d) => ({ id: d.id, name: d.data().name, academicYearId: d.data().academicYearId })),
      classes: classes.map((d) => ({ id: d.id, name: d.data().name })),
      subjects: subjects.map((d) => ({ id: d.id, name: d.data().name })),
      slots: slots.map((d) => ({ id: d.id, classId: d.data().classId, subjectId: d.data().subjectId, termId: d.data().termId })),
    },
    institutionId,
  );

  const plan = buildQaPlan({
    institutionId,
    prefix: opts.emailPrefix,
    departmentName: opts.departmentName,
    termName: opts.termName,
    todayISO: todayInJamaica(),
    now: new Date(),
  });
  const existing = await db.getAll(...plan.items.map((i) => db.doc(i.path)));
  const missing = plan.items.filter((_, idx) => !existing[idx].exists);
  const kept = plan.items.length - missing.length;

  const authState = [];
  for (const a of plan.accounts) {
    let state = 'missing';
    try {
      const u = await auth.getUser(a.uid);
      state = u.email === a.email ? 'present' : 'conflict';
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      try {
        await auth.getUserByEmail(a.email);
        state = 'conflict';
      } catch (e2) {
        if (e2.code !== 'auth/user-not-found') throw e2;
      }
    }
    authState.push({ account: a, state });
  }
  const conflicts = authState.filter((s) => s.state === 'conflict');
  const toCreateAuth = authState.filter((s) => s.state === 'missing');

  console.log('');
  console.log('Plan:');
  console.log(`  remove ${leftovers.remove.length} leftover document(s) of the retired fallback spec:`);
  leftovers.remove.forEach((r) => console.log(`    - ${r.label} (${r.path})`));
  console.log(`  set calendarMode to ${ACADEMIC_FIELDS.calendarMode} (now ${institution.calendarMode ?? 'unset'}) and update the public directory entry`);
  console.log(`  create ${missing.length} document(s), keep ${kept} that already exist (year ${plan.year.name}, term "${opts.termName}", department "${opts.departmentName}", class, 5 accounts, 1 link)`);
  console.log(`  create ${toCreateAuth.length} Auth account(s) with the prefix "${opts.emailPrefix}"; ${authState.length - toCreateAuth.length - conflicts.length} already exist`);
  leftovers.unexpected.forEach((u) => console.log(`  NOTE: ${u}`));
  conflicts.forEach((c) => console.log(`  CONFLICT: ${c.account.email} or its uid already belongs to another account.`));

  const blocking = [...leftovers.unexpected, ...conflicts.map((c) => `${c.account.email} is taken by another account (use a different --email-prefix)`)];
  const total = leftovers.remove.length + missing.length + toCreateAuth.length + 1;
  const phrase = setupPhrase(total, institutionId);

  if (!opts.live) {
    mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
    const logFile = path.join(__dirname, 'logs', `setup-qa-institution-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(logFile, JSON.stringify({ mode: 'dry-run', institutionId, remove: leftovers.remove.length, create: missing.length, authToCreate: toCreateAuth.length, blocking: blocking.length }, null, 2));
    console.log('');
    console.log(`Dry run complete; nothing was changed. Log: ${logFile}`);
    console.log(blocking.length > 0 ? 'A live run is refused until the notes above are resolved.' : `To apply, run the same command with --live and type: ${phrase}`);
    return 0;
  }

  if (blocking.length > 0) {
    console.error('Refusing a live run:');
    blocking.forEach((b) => console.error(`  - ${b}`));
    return 1;
  }
  console.log('');
  const answer = await ask(`Type ${phrase} to continue: `);
  if (answer !== phrase) {
    console.error('Confirmation did not match. Nothing was changed.');
    return 1;
  }

  // Auth first (as the app does), then the documents.
  const issued = {};
  for (const { account } of toCreateAuth) {
    const password = generatePassword();
    await auth.createUser({ uid: account.uid, email: account.email, password, displayName: account.name, emailVerified: true });
    issued[account.key] = password;
  }

  for (let i = 0; i < leftovers.remove.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    leftovers.remove.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(db.doc(r.path)));
    await batch.commit();
  }
  for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    missing.slice(i, i + BATCH_LIMIT).forEach((item) => batch.set(db.doc(item.path), item.data));
    await batch.commit();
  }
  await instRef.update({ ...ACADEMIC_FIELDS });
  const directoryRef = db.collection('registration_directory').doc(institutionId);
  if ((await directoryRef.get()).exists) {
    await directoryRef.set(
      {
        activeAcademicYearId: FIXED_IDS.year,
        activeAcademicYearName: plan.year.name,
        openTimeBlocks: FieldValue.delete(),
        updatedAt: new Date(),
        updatedBy: 'setup-qa-institution-script',
      },
      { merge: true },
    );
  }

  console.log('');
  console.log(`Done: removed ${leftovers.remove.length}, created ${missing.length} document(s) and ${toCreateAuth.length} Auth account(s).`);
  console.log('Paste these lines into .env.qa (the passwords are shown ONCE and are not saved anywhere):');
  console.log('');
  envLines({ institutionName: institution.name, institutionId, prefix: opts.emailPrefix, departmentName: opts.departmentName, termName: opts.termName, issued }).forEach((l) => console.log(l));
  console.log('');
  console.log(`Then recount the class head-counts: node scripts/recount-class-populations.mjs --key=${opts.keyPath} --institution=${institutionId} --live`);
  mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
  writeFileSync(
    path.join(__dirname, 'logs', `setup-qa-institution-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify({ mode: 'live', institutionId, removed: leftovers.remove.length, created: missing.length, authCreated: toCreateAuth.length }, null, 2),
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Failed: ${e.message}`);
    process.exit(1);
  },
);
