// What a person is told when signing in fails. Pure (no Firebase import), so tests can import it.
//
// Until 2026-10-17 the login page named four Firebase error codes and answered "Incorrect password"
// to every other one. A lockout from too many tries, a Firebase outage or a failed App Check check all
// read as a wrong password, and each one counted towards the "Forgot password? Contact your
// administrator" hint. Only the codes that really mean "these credentials are wrong" say so now.

/** Firebase's answers for a wrong password or an unknown account (the newer ones fold both into the first). */
export const CREDENTIAL_CODES: ReadonlySet<string> = new Set([
  'auth/invalid-credential',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-login-credentials',
]);

export type SignInFailure = {
  message: string;
  /** Show the message under this field; otherwise it goes in the box above the button. */
  field?: 'email' | 'password';
  /** Counts towards the "Forgot password?" hint after three. Only a mistyped email or password does. */
  countsAsAttempt: boolean;
  /** An emailed first-login link's standard password was refused: show the normal password box. */
  leaveLinkMode: boolean;
};

export function describeSignInFailure(code: string | undefined, linkMode: boolean): SignInFailure {
  if (code && CREDENTIAL_CODES.has(code)) {
    if (linkMode) {
      // The standard password did not work (already changed, or a different address): show the
      // normal box, and do not count it as a failed attempt.
      return {
        message: "That didn't work. If you've already set your own password, type it below.",
        countsAsAttempt: false,
        leaveLinkMode: true,
      };
    }
    return { message: 'Incorrect password. Please try again.', field: 'password', countsAsAttempt: true, leaveLinkMode: false };
  }
  switch (code) {
    case 'auth/user-disabled':
      return { message: 'This account has been disabled. Contact your administrator.', countsAsAttempt: false, leaveLinkMode: false };
    case 'auth/network-request-failed':
      return { message: 'Network error. Check your connection and try again.', countsAsAttempt: false, leaveLinkMode: false };
    case 'auth/invalid-email':
      return { message: 'Please enter a valid email address.', field: 'email', countsAsAttempt: true, leaveLinkMode: false };
    case 'auth/too-many-requests':
      return { message: 'Too many sign-in attempts. Wait a few minutes and try again.', countsAsAttempt: false, leaveLinkMode: false };
    default:
      // App Check, an internal error, an unrecognised code, or no code at all.
      return { message: "We couldn't sign you in right now. Try again in a moment.", countsAsAttempt: false, leaveLinkMode: false };
  }
}

/**
 * Shown on the login page when the person signed in but their profile could not be read, so the app
 * signed them straight back out (AuthContext.fetchRole). Before this they landed on the login page
 * with no explanation.
 */
export const PROFILE_UNREADABLE_MESSAGE =
  "We couldn't open your account just now. Check your connection and sign in again. If it keeps happening, contact your administrator.";
