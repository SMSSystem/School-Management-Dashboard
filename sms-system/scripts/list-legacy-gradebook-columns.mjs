#!/usr/bin/env node
/**
 * READ-ONLY check of the legacy top-level "gradebooks" collection.
 *
 * After scripts/delete-legacy-flat-documents.mjs removed the leftover flat
 * documents, scripts/count-legacy-flat-collections.mjs still listed
 * "gradebooks" (count 0) while every other legacy collection was absent. That
 * usually means a gradebooks/{id} parent document does not exist, but it still
 * has a subcollection (a "missing" or phantom parent). This script lists
 * those parents and what sits under them, so you can decide what to delete
 * (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md, DF7).
 *
 * For each gradebooks/{id} reference (listDocuments() includes missing
 * parents) it prints:
 *   - the id, and whether the parent document itself exists;
 *   - each subcollection (normally "columns") and its document count;
 *   - for a sample of up to 5 documents per subcollection: the document id,
 *     system created/updated times, and field names with TYPES.
 *
 * It NEVER prints or logs a field value, and NEVER writes (no set/update/
 * delete/add, no Auth calls). It refuses to run unless --project equals the
 * project_id inside the --key file. Output is also written to
 * scripts/logs/list-legacy-gradebook-columns-<time>.json (gitignored).
 *
 * Usage:
 *   node scripts/list-legacy-gradebook-columns.mjs --key=<path> --project=<id>
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

const COLLECTION = 'gradebooks';
const SAMPLE = 5; // documents shown per subcollection
const MAX_PARENTS = 200; // stop listing after this many parent references

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/list-legacy-gradebook-columns.mjs --key=<path> --project=<id>

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

// The type of a Firestore value, never the value itself.
function typeOf(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' || typeof value === 'bigint') return 'number';
  if (typeof value === 'boolean') return 'boolean';
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = readKey(opts.keyPath);
  console.log(`Key file project_id: ${key.project_id}`);
  if (opts.project !== key.project_id) {
    fail(`--project=${opts.project} does not match the key's project_id (${key.project_id}). Nothing was read.`);
  }

  initializeApp({ credential: cert(key), projectId: key.project_id });
  const db = getFirestore();

  const present = (await db.listCollections()).some((c) => c.id === COLLECTION);
  if (!present) {
    console.log(`\n${COLLECTION} is absent. Nothing to check.`);
    return;
  }

  const refs = await db.collection(COLLECTION).listDocuments();
  const truncated = refs.length > MAX_PARENTS;
  const parents = [];
  let totalSubDocs = 0;

  console.log(`\n${COLLECTION}: ${refs.length} document reference(s)${truncated ? ` (first ${MAX_PARENTS} shown)` : ''}`);
  for (const ref of refs.slice(0, MAX_PARENTS)) {
    const parentSnap = await ref.get();
    const subcollections = [];
    for (const sub of await ref.listCollections()) {
      const count = (await sub.count().get()).data().count;
      totalSubDocs += count;
      const sample = [];
      for (const snap of (await sub.limit(SAMPLE).get()).docs) {
        sample.push({
          id: snap.id,
          created: isoOf(snap.createTime),
          updated: isoOf(snap.updateTime),
          fields: Object.entries(snap.data() ?? {})
            .map(([field, value]) => ({ field, type: typeOf(value) }))
            .sort((a, b) => a.field.localeCompare(b.field)),
        });
      }
      subcollections.push({ name: sub.id, count, sample });
    }
    parents.push({ id: ref.id, parentExists: parentSnap.exists, subcollections });

    console.log(`  id: ${ref.id}   parent document exists: ${parentSnap.exists ? 'yes' : 'no'}`);
    if (!subcollections.length) console.log('    subcollections: (none)');
    for (const s of subcollections) {
      console.log(`    ${s.name}: ${s.count} document(s)`);
      for (const d of s.sample) {
        console.log(`      id: ${d.id}   created: ${d.created ?? '?'}   updated: ${d.updated ?? '?'}`);
        console.log(`        fields: ${d.fields.map((f) => `${f.field}:${f.type}`).join(', ') || '(none)'}`);
      }
      if (s.count > s.sample.length) console.log(`      ... and ${s.count - s.sample.length} more`);
    }
  }

  console.log(`\nParents listed: ${parents.length}. Subcollection documents in total: ${totalSubDocs}.`);

  mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, `list-legacy-gradebook-columns-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(logPath, JSON.stringify({ projectId: key.project_id, truncated, parents, totalSubDocs }, null, 2));
  console.log(`Log written: ${logPath}`);
  console.log('No field values were printed or written.');
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
