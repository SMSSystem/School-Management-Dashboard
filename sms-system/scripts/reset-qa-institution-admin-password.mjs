#!/usr/bin/env node
/**
 * Sets a known password on the institution_admin account of one of the disposable QA
 * institutions listed in .env.qa (Brookfield Evening Institute, Hawthorn Institute), so
 * the Playwright suite can sign in again.
 *
 * Why a separate script: reset-role-default-passwords.mjs refuses institution_admin and
 * super_admin on purpose. This one only works for the exact QA institution names, so it
 * cannot be pointed at a real school.
 *
 * What it changes, for each institution_admin of the named institution that has BOTH a
 * users document and a Firebase Auth account:
 *   1. Firebase Auth: the password becomes the new one; refresh tokens are revoked;
 *   2. users/{uid}: mustChangePassword false (so the next sign-in goes straight in);
 *   3. institutions/{id}/audit_log: one password_reset entry.
 * An admin document with no Auth account is only reported, unless you pass
 * --recreate-missing-auth: then an Auth account is created under the SAME uid from the
 * document's email (refused if another Auth account already uses that email), so the
 * existing users document and its data line up again. Only mustChangePassword and an
 * audit entry are written to Firestore.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. Addresses are printed
 * masked. The new password is printed once, to the screen, and never written to a log.
 *
 * Usage:
 *   node scripts/reset-qa-institution-admin-password.mjs --institution-name="Brookfield Evening Institute" --key=<path> [--password=<new>] [--recreate-missing-auth] [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { QA_INSTITUTION_NAMES, maskEmail, passwordProblem, planAdminReset } from './resetQaAdminPasswordLogic.mjs';

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/reset-qa-institution-admin-password.mjs --institution-name=<name> --key=<path> [--password=<new>] [--recreate-missing-auth] [--live]

  --institution-name=<name>  Exactly one of: ${QA_INSTITUTION_NAMES.join(' | ')}.
  --recreate-missing-auth    Also create the Auth account (same uid) for an admin document that has none.
  --key=<path>               Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --password=<new>           12+ characters with a lower-case letter, an upper-case letter and a digit.
                             Omit to generate one.
  --live                     Actually write. Omit for a dry run (the default).
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { name: null, keyPath: null, password: null, live: false, recreate: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg === '--recreate-missing-auth') opts.recreate = true;
    else if (arg.startsWith('--institution-name=')) opts.name = arg.slice('--institution-name='.length);
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--password=')) opts.password = arg.slice('--password='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.name) {
    console.error('--institution-name is required.');
    printUsageAndExit(1);
  }
  if (opts.password !== null) {
    const problem = passwordProblem(opts.password);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
  }
  return opts;
}

// Letters and digits only (no look-alikes), so it can be typed or pasted into .env.qa unquoted.
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = opts.keyPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !existsSync(keyPath)) {
    console.error('A service-account key is required: pass --key=<path> or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
  const db = getFirestore(app);
  const auth = getAuth(app);

  console.log(`Mode: ${opts.live ? 'LIVE (will write)' : 'dry run (nothing will be written)'}`);
  console.log('');

  const instSnap = await db.collection('institutions').where('name', '==', opts.name).get();
  const institutions = instSnap.docs.map((d) => ({ id: d.id }));

  let admins = [];
  let authUids = new Set();
  const emailOwners = new Map();
  if (institutions.length === 1) {
    const adminSnap = await db
      .collection('users')
      .where('institutionId', '==', institutions[0].id)
      .where('role', '==', 'institution_admin')
      .get();
    admins = adminSnap.docs.map((d) => ({ uid: d.id, data: d.data(), ref: d.ref }));
    const found = await auth.getUsers(admins.map((a) => ({ uid: a.uid })));
    authUids = new Set(found.users.map((u) => u.uid));
    // Only when recreating: who already uses each missing admin's email address.
    if (opts.recreate) {
      for (const a of admins.filter((x) => !authUids.has(x.uid))) {
        const email = typeof a.data.email === 'string' ? a.data.email.trim().toLowerCase() : '';
        if (!email) continue;
        try {
          emailOwners.set(email, (await auth.getUserByEmail(email)).uid);
        } catch (err) {
          if (err?.code !== 'auth/user-not-found' && err?.code !== 'auth/invalid-email') throw err;
        }
      }
    }
  }

  const plan = planAdminReset({
    name: opts.name,
    institutions,
    admins: admins.map((a) => ({ uid: a.uid, email: a.data.email })),
    authUids,
    recreate: opts.recreate,
    emailOwners,
  });
  if (plan.kind !== 'ready') {
    console.error(`${plan.kind}: ${plan.reason}`);
    process.exit(1);
  }

  console.log(`Institution "${opts.name}" (${plan.institutionId}); institution_admin accounts: ${admins.length}`);
  for (const a of admins) {
    const state = authUids.has(a.uid) ? 'has an Auth account' : 'NO Auth account (orphaned document)';
    console.log(`  ${a.uid}  ${maskEmail(a.data.email)}  mustChangePassword=${a.data.mustChangePassword === true}  ${state}`);
  }
  for (const b of plan.blocked) console.log(`  Cannot recreate ${b.uid}: ${b.reason}.`);
  const targets = [...plan.resettable, ...plan.recreatable];
  if (targets.length === 0) {
    console.error('');
    console.error('Nothing to do: no admin has an Auth account, and none can be recreated.');
    if (!opts.recreate && plan.orphaned.length > 0) {
      console.error('Re-run with --recreate-missing-auth to recreate the missing Auth account (same uid).');
    }
    process.exit(1);
  }

  const password = opts.password ?? generatePassword();
  if (!opts.live) {
    console.log('');
    console.log(`Would reset ${plan.resettable.length} and recreate ${plan.recreatable.length} account(s). Run again with --live to write.`);
    return;
  }

  for (const uid of targets) {
    const admin = admins.find((a) => a.uid === uid);
    const recreated = plan.recreatable.includes(uid);
    if (recreated) {
      await auth.createUser({ uid, email: admin.data.email.trim().toLowerCase(), password, emailVerified: false });
    } else {
      await auth.updateUser(uid, { password });
      await auth.revokeRefreshTokens(uid);
    }
    await admin.ref.set({ mustChangePassword: false }, { merge: true });
    await db
      .collection('institutions')
      .doc(plan.institutionId)
      .collection('audit_log')
      .add({
        eventType: 'password_reset',
        detail: `${recreated ? 'Auth account recreated and password set' : 'Password reset'} for QA via reset-qa-institution-admin-password.mjs (institution_admin)`,
        targetUid: uid,
        targetName: admin.data.name ?? uid,
        performedBy: 'script:reset-qa-institution-admin-password',
        performedByName: 'Admin Script',
        timestamp: new Date().toISOString(),
        institutionId: plan.institutionId,
      });
    console.log(`  ${recreated ? 'RECREATED' : 'RESET'} ${uid}  ${maskEmail(admin.data.email)}`);
  }
  console.log('');
  console.log(`New password (shown once, not saved anywhere): ${password}`);
  console.log('Put it in .env.qa as QA_FALLBACK_ADMIN_PASSWORD (or QA_CUSTOM_ADMIN_PASSWORD for Hawthorn).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
