#!/usr/bin/env node
/**
 * Sets one account's sign-in email address to the correct one, on BOTH sides, and
 * clears its first-login email cooldown so the "Send sign-in email" button works again.
 *
 * Why: the Edit Student / Edit Parent forms change only the email on the users
 * document, never the Firebase Authentication address the person signs in with
 * (INSTITUTION_LOGIN_EMAILS_SPEC.md section 5.5, ISSUES_AND_GAPS.md #48). After a typo
 * is fixed in the form the two differ, and an emailed sign-in link fails with "That
 * didn't work", because no Auth account has the corrected address. This makes them match.
 *
 * What it changes, for the one --uid:
 *   1. Firebase Auth: the account's email becomes --email (lower-cased), emailVerified false;
 *   2. users/{uid}: email becomes --email, and credentialsEmailedAt and
 *      credentialsEmailCount are deleted (the earlier email went to a different address).
 * It does NOT change the password, revoke sessions, or touch updatedAt. Auth is updated
 * first, then Firestore; if the second step fails it says exactly what is done and is
 * safe to run again.
 *
 * DRY RUN BY DEFAULT: nothing is written unless you pass --live. Addresses are only
 * ever printed masked (first character and domain). Every run writes a log with the
 * old and new addresses to scripts/logs/ (gitignored, personal data: keep it local).
 *
 * Refuses: an unknown uid, an invalid address, an institution_admin or super_admin, and
 * an address that another Firebase Auth account already uses.
 *
 * The new address is --email=<address>, or --use-document-email to take the one already
 * on the users document (the case after an admin corrected it in the edit form: Auth is
 * the side that lags). Exactly one of the two.
 *
 * Usage:
 *   node scripts/set-account-email.mjs --uid=<uid> (--email=<address> | --use-document-email) --key=<path> [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { maskEmail, planEmailChange } from './setAccountEmailLogic.mjs';
import { usageExit, requireKeyPath } from './adminCli.mjs';

const printUsageAndExit = usageExit(`
Usage:
  node scripts/set-account-email.mjs --uid=<uid> (--email=<address> | --use-document-email) --key=<path> [--live]

  --uid=<uid>             The account (users/{uid} and its Firebase Auth user).
  --email=<addr>          The correct sign-in address.
  --use-document-email    Use the address already on the users document instead (Auth is made to match it).
  --key=<path>     Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --live           Actually write. Omit for a dry run (the default).
`);

function parseArgs(argv) {
  const opts = { uid: null, email: null, useDocumentEmail: false, keyPath: null, live: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg === '--use-document-email') opts.useDocumentEmail = true;
    else if (arg.startsWith('--uid=')) opts.uid = arg.slice('--uid='.length);
    else if (arg.startsWith('--email=')) opts.email = arg.slice('--email='.length);
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.uid || (!opts.email && !opts.useDocumentEmail) || (opts.email && opts.useDocumentEmail)) {
    console.error('Pass --uid and exactly one of --email=<address> or --use-document-email.');
    printUsageAndExit(1);
  }
  if (!/^[A-Za-z0-9]{10,64}$/.test(opts.uid)) {
    console.error('--uid must be a single Firebase uid (letters and digits only).');
    process.exit(1);
  }
  return opts;
}

function writeLog(entry) {
  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/set-account-email-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify(entry, null, 2));
  console.log(`Log: ${logPath}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = requireKeyPath(opts.keyPath);
  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
  const db = getFirestore(app);
  const auth = getAuth(app);

  console.log(`Mode: ${opts.live ? 'LIVE (will write)' : 'dry run (nothing will be written)'}`);
  console.log('');

  const userRef = db.collection('users').doc(opts.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    console.error(`No users/${opts.uid} document. Nothing to change.`);
    process.exit(1);
  }
  const user = userSnap.data();

  let authUser;
  try {
    authUser = await auth.getUser(opts.uid);
  } catch (err) {
    console.error(`No Firebase Auth account for ${opts.uid} (${err.code ?? err.message}). Nothing to change.`);
    process.exit(1);
  }

  const plan = planEmailChange({
    role: user.role,
    docEmail: user.email,
    authEmail: authUser.email,
    newEmail: opts.useDocumentEmail ? user.email : opts.email,
  });

  console.log(`Account: ${opts.uid} (role: ${user.role}, institution: ${user.institutionId})`);
  console.log(`  Auth email now:      ${maskEmail(authUser.email)} (${(authUser.email ?? '').length} characters)`);
  console.log(`  Document email now:  ${maskEmail(user.email)} (${(user.email ?? '').length} characters)`);

  if (plan.action === 'blocked') {
    console.error(`Refusing: ${plan.reason}.`);
    process.exit(1);
  }
  console.log(`  New email:           ${maskEmail(plan.email)} (${plan.email.length} characters)`);
  console.log('');
  if (plan.action === 'nothing') {
    console.log('Both already hold this address. Nothing to change (the email cooldown is left as it is).');
    writeLog({ live: opts.live, uid: opts.uid, role: user.role, outcome: 'nothing' });
    return;
  }

  // Another Auth account must not already use the new address.
  if (plan.authChange) {
    try {
      const other = await auth.getUserByEmail(plan.email);
      if (other.uid !== opts.uid) {
        console.error(`Refusing: another Firebase Auth account (${other.uid}) already uses ${maskEmail(plan.email)}.`);
        process.exit(1);
      }
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }
  }

  console.log('Will do:');
  if (plan.authChange) console.log('  1. Firebase Auth: set the email, emailVerified false');
  console.log(`  ${plan.authChange ? '2' : '1'}. users/${opts.uid}: ${plan.docChange ? 'set the email, and ' : ''}delete credentialsEmailedAt and credentialsEmailCount`);

  const entry = {
    live: opts.live,
    uid: opts.uid,
    role: user.role,
    institutionId: user.institutionId,
    oldAuthEmail: authUser.email ?? null,
    oldDocEmail: user.email ?? null,
    newEmail: plan.email,
    authChange: plan.authChange,
    docChange: plan.docChange,
    outcome: opts.live ? 'started' : 'dry-run',
  };

  if (opts.live) {
    if (plan.authChange) {
      await auth.updateUser(opts.uid, { email: plan.email, emailVerified: false });
      entry.authDone = true;
      console.log('  Done: Firebase Auth email updated.');
    }
    try {
      await userRef.update({
        email: plan.email,
        credentialsEmailedAt: FieldValue.delete(),
        credentialsEmailCount: FieldValue.delete(),
      });
      entry.docDone = true;
      entry.outcome = 'done';
      console.log('  Done: users document updated and the email cooldown cleared.');
    } catch (err) {
      entry.outcome = 'partial';
      writeLog(entry);
      console.error(`The users document write FAILED (${err.message}). Auth ${plan.authChange ? 'is already updated' : 'was unchanged'}. Run the same command again.`);
      process.exit(1);
    }
  }
  console.log('');
  console.log(opts.live ? 'Done.' : 'Dry run only. Run again with --live to make these changes.');
  writeLog(entry);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
