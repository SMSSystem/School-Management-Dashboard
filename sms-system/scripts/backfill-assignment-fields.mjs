#!/usr/bin/env node
/**
 * One-time backfill: sets ASSIGNMENTS_FEATURE_SPEC.md's new required
 * AssignmentDocument fields (title/type/otherTypeLabel/status/teacherRole/
 * dueDateTimestamp/gradingMode) — and departmentId, pre-existing but also
 * missing — on every assignment document that predates the feature.
 *
 * Why this is needed: firestore.rules' assignments read rule (§5.1,
 * Implementation Order step 3) checks resource.data.status/teacherRole for
 * its student/parent/senior_teacher branches. Firestore rules treats
 * accessing a missing field as an evaluation error, which propagates
 * through the surrounding `||` chain as a deny — so once that rule ships,
 * any assignment missing these fields becomes readable only by
 * institution_admin and its own original teacher (whose rule branches
 * don't touch the new fields) until backfilled or individually re-saved
 * through the new AssignmentForm. Confirmed via a read-only check against
 * school-sms-v1 on 2026-09-28: all 378 existing assignment documents
 * (every institution) are missing every one of these fields, including
 * departmentId — meaning the pre-existing, unmodified isSeniorTeacherFor()
 * update-branch is *already* silently broken for senior_teacher edit access
 * to all of them today, independent of this feature.
 *
 * Defaults chosen to preserve current de facto behavior, not to guess at
 * real values this script has no way to know:
 *   - title: derived from subjectName + className (no real title existed before)
 *   - type: 'other', otherTypeLabel: 'Legacy assignment'
 *   - status: 'published' — every pre-existing assignment was already
 *     visible institution-wide under the old, unscoped read rule; 'draft'
 *     would newly hide it, which is a behavior change this script isn't
 *     meant to introduce
 *   - teacherRole: resolved from users/{teacherId}.role (cached per
 *     teacherId — this dataset has 92 distinct teachers across 378
 *     assignments); falls back to 'regular_teacher' if that user doc is
 *     missing or has an unrecognized role, since that's the narrower
 *     failure mode (visible only to a correctly-matching senior_teacher in
 *     the same department, not to every senior_teacher department-wide)
 *   - dueDateTimestamp: parsed from the existing dueDate string
 *   - gradingMode: 'standalone' — never silently links into an existing
 *     gradebook column this script has no basis for choosing
 *   - departmentId: resolved from users/{teacherId}.departmentId when
 *     present (same lookup as teacherRole); left unset otherwise, same as
 *     it is today
 *
 * Idempotent — only writes fields actually absent on each document; a
 * document already carrying any of these (e.g. already re-saved through the
 * new AssignmentForm) is left untouched for that field. Safe to re-run.
 *
 * Run locally — requires a service-account key (scripts/service-account.json,
 * gitignored, never committed), same as every other scripts/*.mjs tool here.
 *
 * Dry-run by default, deliberately — this touches real, currently-visible
 * assignment content across every institution, not disposable seed data
 * (same posture as reset-role-default-passwords.mjs). --live must be passed
 * explicitly to write anything.
 *
 * Usage:
 *   node scripts/backfill-assignment-fields.mjs [--live] [--key=<path>]
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const BATCH_LIMIT = 450; // stay under Firestore's 500-op batch limit
const REQUIRED_FIELDS = ['title', 'type', 'status', 'teacherRole', 'dueDateTimestamp', 'gradingMode'];

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/backfill-assignment-fields.mjs [--live] [--key=<path>]

  --live         Actually write to Firestore. Without it, logs what would be
                 written and touches nothing.
  --key=<path>   Path to a service-account JSON key. If omitted, falls back to
                 GOOGLE_APPLICATION_CREDENTIALS.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { live: false, keyPath: null };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
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

function deriveTitle(data) {
  const subject = data.subjectName || 'Untitled Subject';
  const cls = data.className ? ` (${data.className})` : '';
  return `${subject} Assignment${cls}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = initFirestore(opts.keyPath);

  console.log(`Mode: backfill legacy assignment fields${opts.live ? ' [LIVE]' : ' [dry-run]'}`);
  console.log('');

  const snap = await db.collectionGroup('assignments').get();
  console.log(`Found ${snap.size} assignment document(s) across all institutions.`);

  // Cache teacherId -> { role, departmentId } — 92 distinct teachers across
  // 378 assignments in the dataset this was written against, so caching
  // avoids re-fetching the same user doc dozens of times.
  const teacherCache = new Map();
  async function resolveTeacherMeta(teacherId) {
    if (teacherCache.has(teacherId)) return teacherCache.get(teacherId);
    const userSnap = await db.collection('users').doc(teacherId).get();
    const data = userSnap.exists ? userSnap.data() : {};
    const role = data.role === 'senior_teacher' ? 'senior_teacher' : 'regular_teacher';
    if (!userSnap.exists) {
      console.warn(`  WARN users/${teacherId} not found — defaulting teacherRole to 'regular_teacher'`);
    }
    const meta = { role, departmentId: data.departmentId };
    teacherCache.set(teacherId, meta);
    return meta;
  }

  let batch = db.batch();
  let opsInBatch = 0;
  let updated = 0;
  let skippedComplete = 0;
  let skippedBadDueDate = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const alreadyComplete = REQUIRED_FIELDS.every((f) => f in data);
    if (alreadyComplete) {
      skippedComplete++;
      continue;
    }

    const patch = {};

    if (!('title' in data)) patch.title = deriveTitle(data);
    if (!('type' in data)) {
      patch.type = 'other';
      if (!('otherTypeLabel' in data)) patch.otherTypeLabel = 'Legacy assignment';
    }
    if (!('status' in data)) patch.status = 'published';
    if (!('gradingMode' in data)) patch.gradingMode = 'standalone';

    if (!('dueDateTimestamp' in data)) {
      const parsed = typeof data.dueDate === 'string' ? new Date(data.dueDate) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        patch.dueDateTimestamp = Timestamp.fromDate(parsed);
      } else {
        console.warn(`  WARN ${docSnap.ref.path} has no parseable dueDate ("${data.dueDate}") — skipping dueDateTimestamp for this doc`);
        skippedBadDueDate++;
      }
    }

    if (!('teacherRole' in data) || !('departmentId' in data)) {
      const meta = await resolveTeacherMeta(data.teacherId);
      if (!('teacherRole' in data)) patch.teacherRole = meta.role;
      if (!('departmentId' in data) && meta.departmentId) patch.departmentId = meta.departmentId;
    }

    if (Object.keys(patch).length === 0) {
      skippedComplete++;
      continue;
    }

    if (opts.live) {
      batch.set(docSnap.ref, patch, { merge: true });
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    } else {
      console.log(`  [dry-run] would update ${docSnap.ref.path}:`, patch);
    }
    updated++;
  }

  if (opts.live && opsInBatch > 0) await batch.commit();

  console.log('');
  console.log(
    `${opts.live ? 'Updated' : 'Would update'} ${updated} document(s). ` +
    `Skipped: ${skippedComplete} (already complete), ${skippedBadDueDate} (unparseable dueDate).`,
  );
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
