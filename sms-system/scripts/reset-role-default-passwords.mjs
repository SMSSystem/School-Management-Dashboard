#!/usr/bin/env node
/**
 * One-time/one-off maintenance script: resets a pre-existing student/
 * teacher/parent account's password to that role's ROLE_DEFAULT_PASSWORDS
 * entry (src/lib/roleDefaultPasswords.ts) and sets
 * mustChangePassword: true, so the account is forced through the same
 * first-login password-change flow as accounts created since that feature
 * landed. Full design, decisions, gotchas, and Firebase free-tier impact:
 * see docs/miscellaneous-specs/ROLE_DEFAULT_PASSWORD_RESET_SCRIPT_SPEC.md.
 *
 * Two mutually-exclusive modes:
 *   Bulk mode             — every eligible account in one named institution.
 *   Single-account override — one account, resolved directly by email or uid,
 *                             wherever it lives (no --institution).
 *
 * Dry-run by DEFAULT (deviates from this repo's other bulk scripts, which
 * default to live) — pass --live to actually write anything. This touches
 * real accounts' real credentials, not disposable seed data (spec §3
 * decision 7).
 *
 * institution_admin/super_admin are excluded absolutely, including under the
 * single-account override — there is no default password for those roles, and
 * none is added here (spec §3 decision 6). The spectator has none either (the
 * default it had from 2026-10-09 was removed on 2026-10-19; see
 * scripts/rotate-spectator-default-passwords.mjs). The eligibility check
 * below is an allow-list (the keys of ROLE_DEFAULT_PASSWORDS), so a new role is
 * excluded until someone deliberately adds it.
 *
 * Every reset account also gets one institutions/{id}/audit_log entry
 * (eventType: 'password_reset') — spec §9.2.
 *
 * Run locally only — requires a service-account key, same as every other
 * scripts/*.mjs tool. Never commit the key (see .gitignore).
 *
 * Usage:
 *   node scripts/reset-role-default-passwords.mjs --institution=<id> [--live] [--key=<path>]
 *   node scripts/reset-role-default-passwords.mjs --email=<addr>     [--live] [--key=<path>]
 *   node scripts/reset-role-default-passwords.mjs --uid=<uid>        [--live] [--key=<path>]
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { usageExit } from './adminCli.mjs';

// Local copy of src/lib/roleDefaultPasswords.ts's ROLE_DEFAULT_PASSWORDS —
// roleDefaultPasswords.test.ts fails if the two differ.
const ROLE_DEFAULT_PASSWORDS = {
  student: 'Student01234567890',
  parent: 'Parent0123456789',
  regular_teacher: 'Teacher0123456789',
  senior_teacher: 'Teacher0123456789',
};

const ELIGIBLE_ROLES = Object.keys(ROLE_DEFAULT_PASSWORDS);

// NOTE: seed-bulk-institution.mjs's AUTH_CONCURRENCY=30 precedent (used for
// auth.createUser()) turned out NOT to be safe to reuse here unmodified — a
// first live run against the 2,492-account seed institution hit
// auth/quota-exceeded on 2,110 of them. createUser() and updateUser()/
// revokeRefreshTokens() are billed against different Identity Toolkit
// quotas; the 300 requests/minute "account update" limit (spec §10.2/§10.4)
// applies to this script's calls specifically, and this script also makes
// TWO such calls per account (updateUser + revokeRefreshTokens) where
// createUser() only makes one. Concurrency alone doesn't cap throughput —
// firing 30 accounts' worth of calls back-to-back with no pacing between
// chunks bursts well past 300/min even though only 30 requests are ever
// in flight at once. Fixed with a lower concurrency width, an explicit
// pacing delay between chunks (keeps sustained throughput well under the
// 300/min limit, leaving headroom since this is a shared per-project quota),
// and retry-with-backoff on auth/quota-exceeded specifically (see
// withQuotaRetry() below) as a safety net for whatever still gets rate-
// limited despite the pacing.
const AUTH_CONCURRENCY = 10;
const CHUNK_PACING_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries only on auth/quota-exceeded (confirmed via Firebase Admin SDK
// error codes — a real, documented Identity Toolkit quota, not a generic
// transient failure) — any other error (e.g. auth/user-not-found for an
// orphaned account) is rethrown immediately, unretried, exactly as before.
async function withQuotaRetry(fn, { retries = 5, baseDelayMs = 3000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err && err.code === 'auth/quota-exceeded' && attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        console.log(`    quota exceeded, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

const printUsageAndExit = usageExit(`
Usage:
  node scripts/reset-role-default-passwords.mjs --institution=<id> [--role=<role>] [--live] [--key=<path>]
  node scripts/reset-role-default-passwords.mjs --email=<addr>     [--live] [--key=<path>]
  node scripts/reset-role-default-passwords.mjs --uid=<uid>        [--live] [--key=<path>]

  --institution=<id>  Bulk mode: reset every eligible account in this institution.
  --role=<role>       Bulk mode only: reset only accounts with this role (one of ${ELIGIBLE_ROLES.join(', ')}).
  --email=<addr>      Single-account override: resolved via Auth, wherever it lives.
  --uid=<uid>         Single-account override: resolved directly as the users/{uid} doc id.
  --live              Actually write. Omit for dry-run (default — see spec §3 decision 7).
  --key=<path>        Path to a service-account JSON key. Falls back to GOOGLE_APPLICATION_CREDENTIALS.
`);

function parseArgs(argv) {
  const opts = { institution: null, role: null, email: null, uid: null, live: false, keyPath: null };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg.startsWith('--institution=')) opts.institution = arg.slice('--institution='.length);
    else if (arg.startsWith('--role=')) opts.role = arg.slice('--role='.length);
    else if (arg.startsWith('--email=')) opts.email = arg.slice('--email='.length);
    else if (arg.startsWith('--uid=')) opts.uid = arg.slice('--uid='.length);
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }

  // Mode validation — spec §9.2's resolved usage-error rules.
  if (opts.email && opts.uid) {
    console.error('Pass only one of --email or --uid, not both.');
    printUsageAndExit(1);
  }
  const override = opts.email || opts.uid;
  if (override && opts.institution) {
    console.error('--institution is bulk-mode only — omit it when using --email/--uid (see spec §9.2).');
    printUsageAndExit(1);
  }
  if (opts.role && !opts.institution) {
    console.error('--role is bulk-mode only: pass it with --institution=<id>.');
    printUsageAndExit(1);
  }
  if (opts.role && !ELIGIBLE_ROLES.includes(opts.role)) {
    console.error(`--role must be one of: ${ELIGIBLE_ROLES.join(', ')}.`);
    printUsageAndExit(1);
  }
  if (!override && !opts.institution) {
    console.error('Pass either --institution=<id> (bulk mode) or --email=<addr>/--uid=<uid> (single-account mode).');
    printUsageAndExit(1);
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

// Single-account override resolution — spec §9.2. Unlike bulk mode's
// log-and-continue philosophy, a named target that resolves to nothing, or
// resolves to an ineligible role, is a hard error: a silent "0 accounts
// touched" summary would be a worse failure mode than a loud one when
// exactly one account was ever the target.
async function resolveOverrideAccount(auth, db, opts) {
  let uid;
  if (opts.email) {
    try {
      const record = await auth.getUserByEmail(opts.email);
      uid = record.uid;
    } catch (err) {
      if (err && err.code === 'auth/user-not-found') {
        throw new Error(`No Auth account found for email "${opts.email}". Nothing to reset.`);
      }
      throw err;
    }
  } else {
    uid = opts.uid;
  }

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    throw new Error(`No users/${uid} Firestore document found. Nothing to reset.`);
  }

  const role = userSnap.data().role;
  if (!ELIGIBLE_ROLES.includes(role)) {
    throw new Error(
      `users/${uid} has role "${role}", which is not one of the eligible roles ` +
      `(${ELIGIBLE_ROLES.join(', ')}). Refusing to reset an institution_admin/super_admin ` +
      `account, or any other ineligible role, even when targeted directly (spec §3 decision 6).`,
    );
  }

  return userSnap;
}

// Per-account operation — spec §4.3 plus the §9.2 audit_log addition.
async function resetOne(auth, db, userDoc, opts) {
  const data = userDoc.data();
  const role = data.role;
  const password = ROLE_DEFAULT_PASSWORDS[role];

  if (!password) {
    console.log(`  SKIP ${userDoc.id} — role "${role}" is not eligible for a default password.`);
    return 'skippedIneligibleRole';
  }

  if (opts.dryRun) {
    console.log(`  [dry-run] would reset ${userDoc.id} (${role}) — set mustChangePassword: true, clear the email cooldown, revoke tokens, write audit_log entry`);
    return 'wouldReset';
  }

  try {
    await withQuotaRetry(() => auth.updateUser(userDoc.id, { password }));
    await withQuotaRetry(() => auth.revokeRefreshTokens(userDoc.id));
    // credentialsEmailedAt/Count are the first-login email's 24-hour cooldown and
    // lifetime cap (src/lib/loginEmail/eligibility.ts): a reset account starts
    // over, so an admin can email it its link straight away.
    await userDoc.ref.set(
      {
        mustChangePassword: true,
        credentialsEmailedAt: FieldValue.delete(),
        credentialsEmailCount: FieldValue.delete(),
      },
      { merge: true },
    );
    // eventType: 'password_reset' already declared on AuditEventType
    // (src/lib/firebase.ts:364) with no real writer anywhere in the app yet
    // — spec §9.2. Also gives a durable, timestamped record distinguishing
    // "never touched" from "reset by this script on <date>," partially
    // mitigating decision 4's "reset regardless, unconditionally" tradeoff.
    await db
      .collection('institutions')
      .doc(data.institutionId)
      .collection('audit_log')
      .add({
        eventType: 'password_reset',
        detail: `Password reset to role default via reset-role-default-passwords.mjs (${role})`,
        targetUid: userDoc.id,
        targetName: data.name ?? userDoc.id,
        performedBy: 'script:reset-role-default-passwords',
        performedByName: 'Admin Script',
        timestamp: new Date().toISOString(),
        institutionId: data.institutionId,
      });
    console.log(`  RESET ${userDoc.id} (${role})`);
    return 'reset';
  } catch (err) {
    // Log and continue in bulk mode — an orphaned Firestore doc with no
    // matching Auth account (or vice versa) must not abort the whole run
    // (spec §6). Override mode checks this return value itself and exits
    // non-zero instead of silently continuing, since there's nothing else
    // to continue to.
    console.error(`  FAILED ${userDoc.id} (${role}):`, err.message);
    return 'failed';
  }
}

async function runBulkMode(auth, db, institutionId, role, runOpts) {
  const instSnap = await db.collection('institutions').doc(institutionId).get();
  if (!instSnap.exists) {
    console.error(`institutions/${institutionId} does not exist. Nothing to do.`);
    process.exit(1);
  }
  // Surface the real institution name before touching anything (dry-run or
  // live) — same "confirm what you're about to touch" caution as the
  // separate institution-deletion design (spec §4.2 step 1).
  console.log(`Target institution: "${instSnap.data().name}" (${institutionId})`);

  const roles = role ? [role] : ELIGIBLE_ROLES;
  const querySnap = await db
    .collection('users')
    .where('institutionId', '==', institutionId)
    .where('role', 'in', roles)
    .get();

  console.log(`Found ${querySnap.size} eligible account(s) (${roles.join(', ')}).`);
  console.log('');

  const counts = { reset: 0, wouldReset: 0, skippedIneligibleRole: 0, failed: 0 };
  const docs = querySnap.docs;
  for (let i = 0; i < docs.length; i += AUTH_CONCURRENCY) {
    const chunk = docs.slice(i, i + AUTH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (userDoc) => {
        const outcome = await resetOne(auth, db, userDoc, runOpts);
        counts[outcome]++;
      }),
    );
    console.log(`  ...${Math.min(i + AUTH_CONCURRENCY, docs.length)}/${docs.length} processed`);
    // Pacing, not just concurrency — see AUTH_CONCURRENCY's comment above.
    // Skipped in dry-run (no real Auth calls happen, nothing to pace) and
    // after the final chunk (nothing left to wait for).
    if (!runOpts.dryRun && i + AUTH_CONCURRENCY < docs.length) {
      await sleep(CHUNK_PACING_MS);
    }
  }

  console.log('');
  console.log(runOpts.dryRun ? 'Dry-run summary:' : 'Summary:');
  if (runOpts.dryRun) {
    console.log(`  Would reset: ${counts.wouldReset}`);
  } else {
    console.log(`  Reset: ${counts.reset}`);
    console.log(`  Failed: ${counts.failed}`);
  }
  console.log(`  Skipped (ineligible role): ${counts.skippedIneligibleRole}`);
}

async function runOverrideMode(auth, db, opts, runOpts) {
  let userSnap;
  try {
    userSnap = await resolveOverrideAccount(auth, db, opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const data = userSnap.data();
  console.log(`Target account: users/${userSnap.id} (role: ${data.role}, institutionId: ${data.institutionId})`);
  console.log('');

  const outcome = await resetOne(auth, db, userSnap, runOpts);
  if (outcome === 'failed') {
    console.error('');
    console.error('Reset failed — see error above.');
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { db, auth } = initFirebaseAdmin(opts.keyPath);
  const runOpts = { dryRun: !opts.live };

  console.log(`Mode: ${opts.institution ? 'bulk' : 'single-account override'}${runOpts.dryRun ? ' [dry-run]' : ''}`);
  console.log('');

  if (opts.institution) {
    await runBulkMode(auth, db, opts.institution, opts.role, runOpts);
  } else {
    await runOverrideMode(auth, db, opts, runOpts);
  }

  console.log('');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
