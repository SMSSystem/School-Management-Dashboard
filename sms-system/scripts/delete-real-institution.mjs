#!/usr/bin/env node
/**
 * Deletes ONE institution and everything that belongs to it, from the live project: its Firestore documents (every nested
 * collection and subcollection, the users and student_parents found by institutionId, the per-user photo and activity log, the
 * old flat collections), its Firebase Auth accounts, its Realtime Database files, usage counter and sessions, and finally the
 * institution and its public directory entry. It is a sibling of teardown-bulk-institution.mjs, which it does not touch:
 * that script deletes a seed institution from a checkpoint, this one deletes any institution you name, and so it asks a lot more.
 *
 * Safe by default: with no --live it only READS and prints counts (and writes a log in scripts/logs). A real run needs
 *   --live, --institution-id, the institution's exact current name in --confirm-name, --project equal to the key's project,
 *   and the phrase it prints typed back to it. It refuses the system documents (_placeholder, _platform, master), a platform
 *   administrator in the roster, and a name that does not match. Names are not unique, so it works by id only.
 *
 * It is resumable across days: Spark allows 20,000 deletes and 50,000 reads a day for the whole project, so a run stops at
 * --budget deletes, saves scripts/.delete-institution-<id>.checkpoint.json and says what remains. Run it again the next day.
 * The Auth accounts are removed early (after the directory entry), so nobody can sign in to a half-deleted school.
 *
 * Usage (from sms-system):
 *   node scripts/delete-real-institution.mjs --key=<path> --project=<id> --list-matches="School name"
 *   node scripts/delete-real-institution.mjs --key=<path> --project=<id> --institution-id=<id> --confirm-name="School name"
 *   node scripts/delete-real-institution.mjs ... --live [--budget=<n>]
 *   node scripts/delete-real-institution.mjs --key=<path> --project=<id> --institution-id=<id> --verify
 * Other options: --database-url=<url> (default https://<project>-default-rtdb.firebaseio.com), --max-reads=<n> (the cap on
 * the reads the counting may spend).
 *
 * Run locally only, with a service-account key that is never committed. See scripts/README.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import {
  INSTITUTION_TREE,
  LEGACY_TREE,
  USER_SUBCOLLECTIONS,
  checkTarget,
  checkpointPathFor,
  confirmationPhrase,
  createBudget,
  estimateRuns,
  isComplete,
  newCheckpoint,
  parseDeleteArgs,
  phaseOrder,
  resumeCheckpoint,
  roleCounts,
  rosterProblems,
} from './deleteInstitutionLogic.mjs';
import { ReadCapError, countCollection, drainCollection } from './deleteInstitutionRunners.mjs';
import { counterPlan } from './sweepOrphanBlobsLogic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_CHUNK = 1000; // deleteUsers takes at most 1,000 uids
const RTDB_BATCH = 100; // keys per multi-path update, as in sweep-orphan-blobs.mjs

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const USAGE = `Usage: node scripts/delete-real-institution.mjs --key=<path> --project=<id> (--list-matches="<name>" | --institution-id=<id> --confirm-name="<name>" [--live] [--budget=<n>] | --institution-id=<id> --verify)
Read the header of this file and scripts/README.md. Without --live nothing is changed.`;

function readKey(keyPath) {
  if (!existsSync(keyPath)) fail(`Key file not found: ${keyPath}`);
  return JSON.parse(readFileSync(keyPath, 'utf8'));
}

function readFirebasercDefault() {
  try {
    const rc = JSON.parse(readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8'));
    return rc.projects?.default ?? null;
  } catch {
    return null;
  }
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function writeLog(data) {
  const dir = path.join(__dirname, 'logs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `delete-real-institution-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

const institutionCollection = (db, id, name) => db.collection('institutions').doc(id).collection(name);

// ── Reads: the people and the links ─────────────────────────────────────────

async function fetchRoster(db, institutionId, stats) {
  const users = [];
  let last = null;
  for (;;) {
    let q = db.collection('users').where('institutionId', '==', institutionId).orderBy('__name__').limit(1000);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    stats.reads += Math.max(1, page.docs.length);
    for (const doc of page.docs) users.push({ uid: doc.id, role: doc.data().role, institutionId: doc.data().institutionId });
    if (page.docs.length < 1000) break;
    last = page.docs[page.docs.length - 1];
  }
  return users;
}

/** Parents of this institution who also have a link recorded for another one. */
async function foreignLinkCount(db, institutionId, users, stats) {
  const parents = users.filter((u) => u.role === 'parent').map((u) => u.uid);
  let foreign = 0;
  for (let i = 0; i < parents.length; i += 30) {
    const page = await db.collection('student_parents').where('parentId', 'in', parents.slice(i, i + 30)).get();
    stats.reads += Math.max(1, page.docs.length);
    foreign += page.docs.filter((d) => d.data().institutionId !== institutionId).length;
  }
  return foreign;
}

// ── Reads: the Realtime Database ────────────────────────────────────────────

async function shallowKeys(databaseUrl, token, p) {
  const res = await fetch(`${databaseUrl}/${p}.json?shallow=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Realtime Database ${p}: HTTP ${res.status}`);
  const body = await res.json();
  return body && typeof body === 'object' ? Object.keys(body) : [];
}

// ── Counting (the dry run, and the number the phrase asks for) ──────────────

async function countEverything({ db, rtdb, databaseUrl, token, institutionId, users, maxReads }) {
  const ctx = { reads: 0, cap: maxReads };
  const byPath = {};
  let nested = 0;
  for (const [name, children] of Object.entries(INSTITUTION_TREE)) {
    nested += (await countCollection(institutionCollection(db, institutionId, name), children, name, ctx, byPath)).total;
  }
  let perUser = 0;
  for (const u of users) {
    for (const sub of USER_SUBCOLLECTIONS) {
      perUser += (await countCollection(db.collection('users').doc(u.uid).collection(sub), {}, `users/*/${sub}`, ctx, byPath)).total;
    }
  }
  const parents = (await countCollection(db.collection('student_parents').where('institutionId', '==', institutionId), {}, 'student_parents', ctx, byPath)).total;
  let legacy = 0;
  for (const [name, children] of Object.entries(LEGACY_TREE)) {
    legacy += (await countCollection(db.collection(name).where('institutionId', '==', institutionId), children, `legacy:${name}`, ctx, byPath)).total;
  }
  const directory = (await db.collection('registration_directory').doc(institutionId).get()).exists ? 1 : 0;
  ctx.reads += 1;
  const files = (await shallowKeys(databaseUrl, token, `files/${institutionId}`)).length;
  const bytes = Number((await rtdb.ref(`usage/institutions/${institutionId}/bytes`).get()).val() ?? 0);
  const documents = nested + perUser + parents + users.length + legacy + directory + 1; // + the institution document
  return { documents, nested, perUser, parents, users: users.length, legacy, directory, files, bytes, byPath, reads: ctx.reads };
}

function printCounts(counts, budget) {
  console.log('');
  console.log('What would be deleted:');
  const rows = Object.entries(counts.byPath).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  for (const [p, n] of rows) console.log(`  ${String(n).padStart(8)}  ${p}`);
  console.log(`  ${String(counts.users).padStart(8)}  users (and the same number of Auth accounts)`);
  console.log(`  ${String(counts.directory).padStart(8)}  registration_directory entry`);
  console.log(`  ${String(counts.files).padStart(8)}  Realtime Database files (${(counts.bytes / 1_000_000).toFixed(2)} MB recorded)`);
  console.log(`  ${String(counts.documents).padStart(8)}  Firestore documents in all, + ${counts.users} Auth accounts`);
  console.log(`Counting spent about ${counts.reads} reads.`);
  const runs = estimateRuns(counts.documents, budget);
  console.log(`At --budget=${budget} that is about ${runs} daily run(s) (reads while draining are roughly one per delete).`);
}

// ── Live phases ─────────────────────────────────────────────────────────────

function loadCheckpoint(institutionId, name) {
  const file = path.join(__dirname, checkpointPathFor(institutionId));
  if (!existsSync(file)) return { file, checkpoint: newCheckpoint({ institutionId, name }), resumed: false };
  const { problems, checkpoint } = resumeCheckpoint(JSON.parse(readFileSync(file, 'utf8')), { institutionId, name });
  if (problems.length > 0) fail(`${problems.join('\n')}\nRemove ${file} only if you are sure it is stale.`);
  return { file, checkpoint, resumed: true };
}

async function deleteAuthAccounts(auth, uids, stats) {
  for (let i = 0; i < uids.length; i += AUTH_CHUNK) {
    const result = await auth.deleteUsers(uids.slice(i, i + AUTH_CHUNK));
    if (result.errors.length > 0) throw new Error(`Auth: ${result.errors.length} account(s) could not be deleted (first: ${result.errors[0].error.code}).`);
    stats.authDeleted += result.successCount;
  }
}

async function deleteRealtimeData({ rtdb, databaseUrl, token, institutionId, uids }) {
  const keys = await shallowKeys(databaseUrl, token, `files/${institutionId}`);
  for (let i = 0; i < keys.length; i += RTDB_BATCH) {
    const updates = {};
    for (const k of keys.slice(i, i + RTDB_BATCH)) updates[`files/${institutionId}/${k}`] = null;
    await rtdb.ref().update(updates);
  }
  // The counters move together (the database rules require it): the institution's goes to 0 and the total drops by it.
  const stored = {
    institutions: { [institutionId]: (await rtdb.ref(`usage/institutions/${institutionId}/bytes`).get()).val() ?? 0 },
    total: (await rtdb.ref('usage/total/bytes').get()).val() ?? 0,
  };
  for (const c of counterPlan({ stored, actual: { perInstitution: new Map(), total: 0 }, institutionId })) {
    const outcome = await rtdb.ref(c.path).transaction((current) => (Number(current ?? 0) === c.from ? c.to : undefined));
    if (!outcome.committed) throw new Error(`The counter ${c.path} changed while the script ran; run it again.`);
  }
  await rtdb.ref(`usage/institutions/${institutionId}`).remove();
  for (let i = 0; i < uids.length; i += RTDB_BATCH) {
    const updates = {};
    for (const uid of uids.slice(i, i + RTDB_BATCH)) updates[`sessions/${uid}`] = null;
    await rtdb.ref().update(updates);
  }
  return keys.length;
}

async function runPhases(env) {
  const { db, auth, institutionId, cp, cpFile, budget, stats } = env;
  const save = () => writeFileSync(cpFile, JSON.stringify(cp, null, 2));
  const ctx = { budget, stats, save, onDeleted: () => {} };
  const queries = {
    student_parents: () => db.collection('student_parents').where('institutionId', '==', institutionId),
    users: () => db.collection('users').where('institutionId', '==', institutionId),
  };

  const handlers = {
    directory: async () => {
      await db.collection('registration_directory').doc(institutionId).delete();
      return true;
    },
    auth: async () => {
      await deleteAuthAccounts(auth, cp.uids, stats);
      return true;
    },
    rtdb: async () => {
      stats.rtdbFiles += await deleteRealtimeData({ ...env, uids: cp.uids });
      return true;
    },
    userSubcollections: async () => {
      cp.progress.userSub = cp.progress.userSub ?? { deleted: 0, next: 0 };
      while (cp.progress.userSub.next < cp.uids.length) {
        const uid = cp.uids[cp.progress.userSub.next];
        for (const sub of USER_SUBCOLLECTIONS) {
          if (!(await drainCollection(db, db.collection('users').doc(uid).collection(sub), {}, ctx))) return false;
        }
        cp.progress.userSub.next += 1;
        save();
      }
      return true;
    },
    student_parents: () => drainCollection(db, queries.student_parents(), {}, ctx),
    users: () => drainCollection(db, queries.users(), {}, ctx),
    institution: async () => {
      await db.collection('institutions').doc(institutionId).delete();
      return true;
    },
  };

  for (const phase of phaseOrder()) {
    if (cp.phases[phase].status === 'complete') continue;
    const fixed = ['directory', 'auth', 'rtdb', 'institution'].includes(phase);
    if (!fixed && budget.exhausted()) break;
    cp.phases[phase].status = 'in_progress';
    save();
    let done;
    if (phase.startsWith('nested:')) {
      const name = phase.slice('nested:'.length);
      done = await drainCollection(db, institutionCollection(db, institutionId, name), INSTITUTION_TREE[name], ctx);
    } else if (phase.startsWith('legacy:')) {
      const name = phase.slice('legacy:'.length);
      done = await drainCollection(db, db.collection(name).where('institutionId', '==', institutionId), LEGACY_TREE[name], ctx);
    } else {
      done = await handlers[phase]();
    }
    console.log(`Phase ${phase}: ${done ? 'complete' : 'stopped at the budget'}.`);
    if (!done) break;
    cp.phases[phase] = { status: 'complete', completedAt: new Date().toISOString() };
    save();
  }
}

// ── Verify ──────────────────────────────────────────────────────────────────

async function verify({ db, auth, rtdb, databaseUrl, token, institutionId }) {
  const problems = [];
  const note = (ok, text) => { if (!ok) problems.push(text); };
  note(!(await db.collection('institutions').doc(institutionId).get()).exists, 'the institution document still exists');
  note(!(await db.collection('registration_directory').doc(institutionId).get()).exists, 'the registration_directory entry still exists');
  for (const name of Object.keys(INSTITUTION_TREE)) {
    const n = (await institutionCollection(db, institutionId, name).count().get()).data().count;
    note(n === 0, `institutions/${institutionId}/${name} still has ${n} document(s)`);
  }
  const userCount = (await db.collection('users').where('institutionId', '==', institutionId).count().get()).data().count;
  note(userCount === 0, `${userCount} users document(s) still carry this institutionId`);
  const linkCount = (await db.collection('student_parents').where('institutionId', '==', institutionId).count().get()).data().count;
  note(linkCount === 0, `${linkCount} student_parents document(s) still carry this institutionId`);
  for (const name of Object.keys(LEGACY_TREE)) {
    const n = (await db.collection(name).where('institutionId', '==', institutionId).count().get()).data().count;
    note(n === 0, `${n} legacy ${name} document(s) still carry this institutionId`);
  }
  note((await shallowKeys(databaseUrl, token, `files/${institutionId}`)).length === 0, 'Realtime Database files remain');
  note((await rtdb.ref(`usage/institutions/${institutionId}`).get()).val() === null, 'the Realtime Database usage counter remains');

  const cpFile = path.join(__dirname, checkpointPathFor(institutionId));
  if (existsSync(cpFile)) {
    const uids = JSON.parse(readFileSync(cpFile, 'utf8')).uids ?? [];
    let accounts = 0;
    let sessions = 0;
    for (let i = 0; i < uids.length; i += 100) {
      accounts += (await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })))).users.length;
    }
    for (const uid of uids) if ((await rtdb.ref(`sessions/${uid}`).get()).val() !== null) sessions += 1;
    note(accounts === 0, `${accounts} Auth account(s) still exist`);
    note(sessions === 0, `${sessions} session lock(s) remain`);
  } else {
    console.log('No checkpoint file here, so the Auth accounts and session locks were not checked.');
  }
  console.log('(Subcollections of a deleted document cannot be listed; the phases delete children first, so none is left behind.)');
  return problems;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const parsed = parseDeleteArgs(process.argv.slice(2));
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

  const key = readKey(opts.keyPath);
  console.log(`Mode: ${opts.live ? 'LIVE' : opts.verify ? 'verify (reads only)' : 'dry run (reads only)'}`);
  console.log(`Project id in the key file: ${key.project_id}`);
  const rcDefault = readFirebasercDefault();
  if (rcDefault) console.log(`.firebaserc default project: ${rcDefault}`);
  if (opts.project !== key.project_id) fail(`--project=${opts.project} does not match the key file's project_id (${key.project_id}). Nothing was touched.`);

  const databaseUrl = (opts.databaseUrl ?? `https://${key.project_id}-default-rtdb.firebaseio.com`).replace(/\/$/, '');
  const credential = cert(key);
  const app = initializeApp({ credential, projectId: key.project_id, databaseURL: databaseUrl });
  const db = getFirestore(app);
  const auth = getAuth(app);
  const rtdb = getDatabase(app);
  const token = (await credential.getAccessToken()).access_token;
  const stats = { reads: 0, deletes: 0, authDeleted: 0, rtdbFiles: 0 };

  if (opts.listMatches !== null) {
    const snap = await db.collection('institutions').where('name', '==', opts.listMatches).get();
    console.log(`Institutions named "${opts.listMatches}": ${snap.size}`);
    for (const doc of snap.docs) {
      const d = doc.data();
      console.log(`  id ${doc.id}  users ${d.userCount ?? '?'}  students ${d.studentCount ?? '?'}  teachers ${d.teacherCount ?? '?'}  calendarMode ${d.calendarMode ?? '(unset)'}`);
    }
    return 0;
  }

  const institutionId = opts.institutionId;
  if (opts.verify) {
    const problems = await verify({ db, auth, rtdb, databaseUrl, token, institutionId });
    if (problems.length === 0) {
      console.log('Verified: nothing of this institution remains.');
      return 0;
    }
    console.error(`NOT clean (${problems.length}):`);
    problems.forEach((p) => console.error(`  - ${p}`));
    return 1;
  }

  const snap = await db.collection('institutions').doc(institutionId).get();
  stats.reads += 1;
  const targetProblems = checkTarget({ institutionId, confirmName: opts.confirmName, exists: snap.exists, storedName: snap.data()?.name });
  if (targetProblems.length > 0) {
    console.error('Refusing:');
    targetProblems.forEach((p) => console.error(`  - ${p}`));
    return 1;
  }
  console.log(`Institution ${institutionId}: found, the name matches.`);

  const { file: cpFile, checkpoint: cp, resumed } = loadCheckpoint(institutionId, opts.confirmName);
  let users;
  if (cp.uids) {
    users = cp.uids.map((uid) => ({ uid, role: 'resumed', institutionId }));
    console.log(`Resuming: ${cp.uids.length} account(s) were recorded by the first run.`);
  } else {
    users = await fetchRoster(db, institutionId, stats);
    const problems = rosterProblems(users, institutionId);
    const foreign = await foreignLinkCount(db, institutionId, users, stats);
    if (foreign > 0) problems.push(`${foreign} parent link(s) of this institution's parents belong to another institution.`);
    if (problems.length > 0) {
      console.error('Refusing:');
      problems.forEach((p) => console.error(`  - ${p}`));
      return 1;
    }
    console.log(`Accounts: ${users.length}  by role: ${Object.entries(roleCounts(users)).map(([r, n]) => `${r}=${n}`).join(', ')}`);
  }

  let counts;
  try {
    counts = await countEverything({ db, rtdb, databaseUrl, token, institutionId, users, maxReads: opts.maxReads });
  } catch (e) {
    if (e instanceof ReadCapError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }
  printCounts(counts, opts.budget);
  const phrase = confirmationPhrase(counts.documents, institutionId);

  if (!opts.live) {
    const logFile = writeLog({ mode: 'dry-run', institutionId, resumed, accounts: users.length, roles: roleCounts(users), counts });
    console.log('');
    console.log(`Dry run complete; nothing was changed. Log: ${logFile}`);
    console.log(`To delete, run the same command with --live and type: ${phrase}`);
    return 0;
  }

  console.log('');
  console.log('THIS DELETES THE INSTITUTION AND ALL ITS DATA, PERMANENTLY. There is no backup.');
  const answer = await ask(`Type ${phrase} to continue: `);
  if (answer !== phrase) {
    console.error('Confirmation did not match. Nothing was changed.');
    return 1;
  }

  if (!cp.uids) {
    cp.uids = users.map((u) => u.uid);
    writeFileSync(cpFile, JSON.stringify(cp, null, 2));
  }
  const budget = createBudget(opts.budget);
  await runPhases({ db, auth, rtdb, databaseUrl, token, institutionId, cp, cpFile, budget, stats });

  const complete = isComplete(cp);
  const logFile = writeLog({ mode: 'live', institutionId, resumed, complete, spent: budget.spent(), stats });
  console.log('');
  console.log(`Deleted ${stats.deletes} document(s), ${stats.authDeleted} Auth account(s), ${stats.rtdbFiles} Realtime Database file(s) this run. Log: ${logFile}`);
  console.log(complete ? 'All phases are complete. Now run it again with --verify instead of --live.' : 'Stopped at the budget. Run the same command again later (the checkpoint is saved).');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Failed: ${e.message}`);
    process.exit(1);
  },
);
