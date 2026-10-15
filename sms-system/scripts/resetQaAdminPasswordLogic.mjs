// Pure decisions for scripts/reset-qa-institution-admin-password.mjs (no I/O, so they can
// be unit tested from src/lib/__tests__/resetQaAdminPassword.test.ts).

/** The disposable QA and demo institutions (.env.qa, and the Blue Mountain demo seed). The script refuses any other name. */
export const QA_INSTITUTION_NAMES = ['Brookfield Evening Institute', 'Hawthorn Institute', 'Blue Mountain Primary School'];

/** Firebase Auth's own minimum is 6; the app asks for more, so insist on 12. */
export const MIN_PASSWORD_LENGTH = 12;

/** An address for the screen: its first character and its domain, never the whole. */
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return String(email);
  return email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
}

/** Is this institution name one the script may touch? Exact match, nothing looser. */
export function isQaInstitutionName(name) {
  return typeof name === 'string' && QA_INSTITUTION_NAMES.includes(name);
}

/** Null when the password is acceptable, else the reason it is not. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'The password must contain a lower-case letter, an upper-case letter and a digit.';
  }
  return null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What to do for one institution. `institutions` are the documents whose name matched
 * (`{ id }`), `admins` the institution_admin users found for the one institution
 * (`{ uid, email? }`), and `authUids` the uids that have a Firebase Auth account.
 *
 * With `recreate`, an admin document that has no Auth account may get one made under the
 * same uid, from the document's email. `emailOwners` maps each such email (lower-case) to
 * the uid of the Auth account that already uses it, when there is one.
 *
 * Returns { kind: 'refuse' | 'no-institution' | 'ambiguous' | 'no-admin', reason }, or
 * { kind: 'ready', institutionId, resettable, orphaned, recreatable, blocked }: `orphaned`
 * is every admin without an Auth account; `recreatable` the ones that can be recreated
 * (only with `recreate`); `blocked` the rest of them with `{ uid, reason }`.
 */
export function planAdminReset({ name, institutions, admins, authUids, recreate = false, emailOwners = new Map() }) {
  if (!isQaInstitutionName(name)) {
    return { kind: 'refuse', reason: `"${name}" is not one of the QA institutions (${QA_INSTITUTION_NAMES.join(', ')}).` };
  }
  if (institutions.length === 0) return { kind: 'no-institution', reason: `No institution is named "${name}".` };
  if (institutions.length > 1) {
    return { kind: 'ambiguous', reason: `${institutions.length} institutions are named "${name}"; refusing to guess.` };
  }
  if (admins.length === 0) {
    return { kind: 'no-admin', reason: `Institution ${institutions[0].id} has no institution_admin user.` };
  }
  const resettable = admins.filter((a) => authUids.has(a.uid)).map((a) => a.uid);
  const missing = admins.filter((a) => !authUids.has(a.uid));
  const orphaned = missing.map((a) => a.uid);
  const recreatable = [];
  const blocked = [];
  if (recreate) {
    for (const a of missing) {
      const email = typeof a.email === 'string' ? a.email.trim().toLowerCase() : '';
      const owner = emailOwners.get(email);
      if (!EMAIL_SHAPE.test(email)) blocked.push({ uid: a.uid, reason: 'its document has no valid email address' });
      else if (owner && owner !== a.uid) blocked.push({ uid: a.uid, reason: `its email is already used by Auth account ${owner}` });
      else recreatable.push(a.uid);
    }
  }
  return { kind: 'ready', institutionId: institutions[0].id, resettable, orphaned, recreatable, blocked };
}
