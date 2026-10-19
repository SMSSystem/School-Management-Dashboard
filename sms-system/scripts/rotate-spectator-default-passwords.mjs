#!/usr/bin/env node
/**
 * Replaces the old public spectator password on spectator accounts that never signed in.
 *
 * From 2026-10-09 to 2026-10-19 a spectator was created with a standard password that shipped in the
 * app bundle (src/lib/roleDefaultPasswords.ts), so that an emailed sign-in link could work. A
 * spectator reads everything an institution admin reads, so an account that has not signed in yet
 * could be opened by anyone who knew its address. The default was removed from the app; this script
 * covers the accounts that already exist.
 *
 * A spectator is picked when it has a users document with role 'spectator' and mustChangePassword
 * true (it has never been through the forced first-sign-in password change: the only signal there
 * is, since the Admin SDK cannot compare a password) and a Firebase Auth account. For each one it:
 *   1. sets a new password in Firebase Auth (a generated one per account, or the one you pass) and
 *      revokes its refresh tokens;
 *   2. leaves mustChangePassword true, so the person still has to choose their own at first sign-in;
 *   3. writes one institutions/{id}/audit_log entry (eventType 'password_reset').
 *
 * The new passwords are printed once, to the screen, with the person's name and masked address so
 * you can hand each one over; they are never written to the log. The administrator who creates a
 * spectator from now on chooses the password in the Create Account form.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. Addresses are only printed
 * masked. Every run writes a local log to scripts/logs/ (gitignored; uids and masked addresses).
 *
 * Usage:
 *   node scripts/rotate-spectator-default-passwords.mjs --key=<path> [--institution=<id>] [--password=<new>] [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { generatePassword, isSafeInstitutionId, maskEmail, passwordProblem, pickSpectators } from './rotateSpectatorLogic.mjs';

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/rotate-spectator-default-passwords.mjs --key=<path> [--institution=<id>] [--password=<new>] [--live]

  --key=<path>        Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --institution=<id>  Only this institution's spectators (default: every institution).
  --password=<new>    12+ characters with a lower-case letter, an upper-case letter and a digit,
                      used for every picked account. Omit to generate one per account.
  --live              Actually write. Omit for a dry run (the default).
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { keyPath: null, institution: null, password: null, live: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--institution=')) opts.institution = arg.slice('--institution='.length);
    else if (arg.startsWith('--password=')) opts.password = arg.slice('--password='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (opts.institution !== null && !isSafeInstitutionId(opts.institution)) {
    console.error('--institution must be a single institution id (letters, digits, - and _ only).');
    process.exit(1);
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
  console.log(`Scope: ${opts.institution ? `institution ${opts.institution} only` : 'all institutions'}`);
  console.log('');

  let q = db.collection('users').where('role', '==', 'spectator');
  if (opts.institution) q = q.where('institutionId', '==', opts.institution);
  const snap = await q.get();
  const users = snap.docs.map((d) => ({ uid: d.id, ref: d.ref, ...d.data() }));

  const authUids = new Set();
  for (let i = 0; i < users.length; i += 100) {
    const found = await auth.getUsers(users.slice(i, i + 100).map((u) => ({ uid: u.uid })));
    for (const u of found.users) authUids.add(u.uid);
  }

  const { picked, skipped } = pickSpectators({ users, authUids });
  const alreadyChanged = users.filter((u) => u.mustChangePassword !== true).length;
  console.log(`Spectator accounts: ${users.length}; already chose their own password (left alone): ${alreadyChanged}`);
  for (const s of skipped) console.log(`  Skipped ${s.uid}: ${s.reason}`);
  if (picked.length === 0) {
    console.log('No spectator account needs a new password.');
    return;
  }
  console.log(`${opts.live ? 'Rotating' : 'Would rotate'} ${picked.length} account(s):`);
  for (const u of picked) console.log(`  ${u.uid}  ${maskEmail(u.email)}  institution ${u.institutionId}`);

  const entry = { live: opts.live, institution: opts.institution, accounts: [], failed: [] };
  if (opts.live) {
    const issued = [];
    for (const u of picked) {
      const password = opts.password ?? generatePassword(randomInt);
      try {
        await auth.updateUser(u.uid, { password });
        await auth.revokeRefreshTokens(u.uid);
        await db
          .collection('institutions')
          .doc(u.institutionId)
          .collection('audit_log')
          .add({
            eventType: 'password_reset',
            detail: 'Public default password replaced for a spectator who had not signed in, via rotate-spectator-default-passwords.mjs',
            targetUid: u.uid,
            targetName: u.name ?? u.uid,
            performedBy: 'script:rotate-spectator-default-passwords',
            performedByName: 'Admin Script',
            timestamp: new Date().toISOString(),
            institutionId: u.institutionId,
          });
        entry.accounts.push({ uid: u.uid, email: maskEmail(u.email), institutionId: u.institutionId });
        issued.push({ name: u.name ?? u.uid, email: maskEmail(u.email), password });
      } catch (err) {
        entry.failed.push({ uid: u.uid, error: err?.code ?? String(err?.message ?? err) });
      }
    }
    console.log('');
    console.log('New passwords (shown once, not saved anywhere). Each person must still choose their own at first sign-in:');
    for (const i of issued) console.log(`  ${i.name}  ${i.email}  ${i.password}`);
    console.log(`Rotated ${entry.accounts.length}; failed ${entry.failed.length}.`);
  } else {
    entry.accounts = picked.map((u) => ({ uid: u.uid, email: maskEmail(u.email), institutionId: u.institutionId }));
    console.log('Dry run only. Run again with --live to rotate these.');
  }

  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/rotate-spectator-passwords-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify(entry, null, 2));
  console.log(`Log: ${logPath}`);
  if (entry.failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
