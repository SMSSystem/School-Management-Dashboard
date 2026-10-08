#!/usr/bin/env node
/**
 * READ-ONLY listing of the leftover documents in the legacy flat collections.
 *
 * scripts/count-legacy-flat-collections.mjs found 29 stray documents in the
 * old top-level collections (results, reportCards, teachers, students and so
 * on) plus an unreferenced "reports" collection. No app code reads them. This
 * script shows what they are, so you can decide what to delete
 * (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md, OQ4 and DF7).
 *
 * For each document it prints:
 *   - the document id;
 *   - its system created and updated times (not field values);
 *   - its field names and field TYPES (string, number, timestamp, ...);
 *   - its subcollections, with a document count for each;
 *   - for teachers and students only: whether a users document with the
 *     same id exists (a yes/no, nothing else from that document).
 *
 * It NEVER prints or logs a field value, and never reads an email, name or
 * password into its output. The SDK necessarily fetches each document to see
 * its field names, but only names and types leave the function that reads it.
 * It also NEVER writes: no set/update/delete/add, no Auth calls.
 *
 * Reads: about 30 documents + "reports" (at most 50) + subcollection listings
 * and counts + up to 10 users checks, well under 200 in total.
 *
 * The same output is written to
 * scripts/logs/list-legacy-flat-documents-<time>.json (the folder is
 * gitignored), so you keep a record of what was there before deleting.
 *
 * Refuses to run unless --project equals the project_id inside the --key file.
 *
 * Usage:
 *   node scripts/list-legacy-flat-documents.mjs --key=<path> --project=<id>
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, 'logs');

// Same list as scripts/count-legacy-flat-collections.mjs, plus "reports".
const COLLECTIONS = [
  'subjects',
  'classes',
  'terms',
  'academicYears',
  'nonSchoolDays',
  'houses',
  'departments',
  'teachers',
  'students',
  'lessons',
  'exams',
  'assignments',
  'results',
  'feedback_comments',
  'studentActivities',
  'studentResponsibilities',
  'reportCardComments',
  'reportCards',
  'disciplinaryActions',
  'generalAttendance',
  'subjectEnrollments',
  'subjectAttendance',
  'attendanceSummaries',
  'events',
  'announcements',
  'timetable_slots',
  'gradebooks',
  'reports',
];

// Collections whose document ids are user ids: also report whether users/{id} exists.
const USER_LINKED = new Set(['teachers', 'students']);

// Most documents to list per collection.
const CAP = 50;

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/list-legacy-flat-documents.mjs --key=<path> --project=<id>

  --key=<path>     Service-account JSON key. Required (no Application Default
                   Credentials fallback).
  --project=<id>   The Firebase project id you expect to read. Must equal the
                   project_id inside the key file, or the script refuses.
  --help           Show this text.

This script only reads. It never writes, and it never prints field values.
`);
  process.exit(code);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { keyPath: null, project: null };
  for (const arg of argv) {
    if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--project=')) opts.project = arg.slice('--project='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.keyPath) fail('--key=<path> is required (there is no Application Default Credentials fallback).');
  if (!opts.project) fail('--project=<id> is required, so the script can prove it reads the project you meant.');
  return opts;
}

function readKey(keyPath) {
  if (!existsSync(keyPath)) fail(`Key file not found: ${keyPath}`);
  let key;
  try {
    key = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch {
    fail(`Key file is not valid JSON: ${keyPath}`);
  }
  if (!key || typeof key.project_id !== 'string') fail('Key file has no project_id.');
  return key;
}

// The type of a Firestore value, never the value itself. Does not descend
// into arrays or maps.
function typeOf(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'bigint') return 'number';
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return 'timestamp';
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return 'geopoint';
    if (typeof value.path === 'string' && typeof value.firestore === 'object') return 'reference';
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return 'bytes';
    return 'map';
  }
  return typeof value;
}

function isoOf(ts) {
  try {
    return ts ? ts.toDate().toISOString() : null;
  } catch {
    return null;
  }
}

// Reads one document and returns only names, types, system times and
// subcollection counts. The field values go no further than this function.
async function describeDocument(db, snap, userLinked) {
  const data = snap.data() ?? {};
  const fields = Object.entries(data)
    .map(([field, value]) => ({ field, type: typeOf(value) }))
    .sort((a, b) => a.field.localeCompare(b.field));

  const subcollections = [];
  for (const sub of await snap.ref.listCollections()) {
    const count = (await sub.count().get()).data().count;
    subcollections.push({ name: sub.id, count });
  }

  const entry = {
    id: snap.id,
    created: isoOf(snap.createTime),
    updated: isoOf(snap.updateTime),
    fields,
    subcollections,
  };
  if (userLinked) {
    entry.userDocExists = (await db.collection('users').doc(snap.id).get()).exists;
  }
  return entry;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = readKey(opts.keyPath);
  console.log(`Key file project_id: ${key.project_id}`);
  if (opts.project !== key.project_id) {
    fail(`--project=${opts.project} does not match the key's project_id (${key.project_id}). Nothing was read.`);
  }

  initializeApp({ credential: cert(key), projectId: key.project_id });
  const db = getFirestore();

  const present = new Set((await db.listCollections()).map((c) => c.id));
  const problems = [];
  const result = { projectId: key.project_id, collections: {} };
  let totalDocs = 0;

  for (const name of COLLECTIONS) {
    if (!present.has(name)) {
      result.collections[name] = { absent: true, documents: [] };
      continue;
    }
    try {
      const snaps = await db.collection(name).limit(CAP).get();
      const truncated = snaps.size === CAP;
      const documents = [];
      for (const snap of snaps.docs) {
        documents.push(await describeDocument(db, snap, USER_LINKED.has(name)));
      }
      totalDocs += documents.length;
      result.collections[name] = { truncated, documents };

      console.log(`\n${name} (${documents.length}${truncated ? `, first ${CAP} only` : ''})`);
      for (const d of documents) {
        console.log(`  id: ${d.id}`);
        console.log(`    created: ${d.created ?? '?'}   updated: ${d.updated ?? '?'}`);
        console.log(`    fields: ${d.fields.map((f) => `${f.field}:${f.type}`).join(', ') || '(none)'}`);
        console.log(
          `    subcollections: ${d.subcollections.map((s) => `${s.name}(${s.count})`).join(', ') || '(none)'}`,
        );
        if ('userDocExists' in d) console.log(`    users document with this id exists: ${d.userDocExists ? 'yes' : 'no'}`);
      }
    } catch (err) {
      problems.push(`${name}: ${err.message}`);
      result.collections[name] = { error: true, documents: [] };
      console.log(`\n${name}: ERROR`);
    }
  }

  const absent = COLLECTIONS.filter((n) => result.collections[n]?.absent);
  console.log(`\nAbsent (nothing to delete): ${absent.join(', ') || '(none)'}`);
  console.log(`Documents listed in total: ${totalDocs}`);
  if (problems.length) {
    console.log('\nProblems:');
    for (const p of problems) console.log(`  ${p}`);
  }

  mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, `list-legacy-flat-documents-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(logPath, JSON.stringify({ ...result, problems }, null, 2));
  console.log(`\nLog written: ${logPath}`);
  console.log('No field values were printed or written.');
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
