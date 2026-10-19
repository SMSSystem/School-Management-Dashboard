import { describe, expect, it } from 'vitest';
import { CREDENTIAL_CODES, PROFILE_UNREADABLE_MESSAGE, describeSignInFailure, isUnexplainedSignInCode } from '../signInFailure';
import loginRaw from '../../scenes/(auth)/login/index.tsx?raw';
import authRaw from '../AuthContext.tsx?raw';

// Until 2026-10-17 every sign-in error the login page did not name said "Incorrect password" and
// counted towards the "Forgot password? Contact your administrator" hint: a lockout from too many
// tries, a Firebase outage or a failed App Check check all read as a wrong password.

const norm = (s: string) => s.split('\r\n').join('\n');

describe('describeSignInFailure', () => {
  it('says "Incorrect password" only for the codes that mean the credentials are wrong', () => {
    for (const code of CREDENTIAL_CODES) {
      expect(describeSignInFailure(code, false), code).toEqual({
        message: 'Incorrect password. Please try again.',
        field: 'password',
        countsAsAttempt: true,
        leaveLinkMode: false,
      });
    }
    expect([...CREDENTIAL_CODES].sort()).toEqual([
      'auth/invalid-credential',
      'auth/invalid-login-credentials',
      'auth/user-not-found',
      'auth/wrong-password',
    ]);
  });

  it("after an emailed link's standard password is refused, shows the normal box and does not count it", () => {
    for (const code of CREDENTIAL_CODES) {
      expect(describeSignInFailure(code, true), code).toEqual({
        message: "That didn't work. If you've already set your own password, type it below.",
        countsAsAttempt: false,
        leaveLinkMode: true,
      });
    }
  });

  it('keeps the messages for a disabled account, a network error and a bad email address', () => {
    expect(describeSignInFailure('auth/user-disabled', false)).toEqual({
      message: 'This account has been disabled. Contact your administrator.',
      countsAsAttempt: false,
      leaveLinkMode: false,
    });
    expect(describeSignInFailure('auth/network-request-failed', false).message).toBe(
      'Network error. Check your connection and try again.',
    );
    expect(describeSignInFailure('auth/invalid-email', false)).toEqual({
      message: 'Please enter a valid email address.',
      field: 'email',
      countsAsAttempt: true,
      leaveLinkMode: false,
    });
  });

  it('tells a lockout from too many tries apart from a wrong password, and does not count it', () => {
    expect(describeSignInFailure('auth/too-many-requests', false)).toEqual({
      message: 'Too many sign-in attempts. Wait a few minutes and try again.',
      countsAsAttempt: false,
      leaveLinkMode: false,
    });
    // also while an emailed link is in use
    expect(describeSignInFailure('auth/too-many-requests', true).leaveLinkMode).toBe(false);
  });

  it('gives anything else, including no code at all, a neutral message that is not a wrong password', () => {
    for (const code of ['auth/internal-error', 'auth/firebase-app-check-token-is-invalid', 'auth/operation-not-allowed', 'weird', undefined]) {
      const failure = describeSignInFailure(code, false);
      expect(failure.message, String(code)).toBe("We couldn't sign you in right now. Try again in a moment.");
      expect(failure.field, String(code)).toBeUndefined();
      expect(failure.countsAsAttempt, String(code)).toBe(false);
      expect(failure.leaveLinkMode, String(code)).toBe(false);
    }
  });
});

describe('isUnexplainedSignInCode', () => {
  it('is true exactly for the codes that get the neutral message', () => {
    for (const code of ['auth/internal-error', 'auth/firebase-app-check-token-is-invalid', 'weird', undefined, '']) {
      expect(isUnexplainedSignInCode(code), String(code)).toBe(true);
      expect(describeSignInFailure(code, false).message, String(code)).toBe("We couldn't sign you in right now. Try again in a moment.");
    }
    for (const code of [...CREDENTIAL_CODES, 'auth/user-disabled', 'auth/network-request-failed', 'auth/invalid-email', 'auth/too-many-requests']) {
      expect(isUnexplainedSignInCode(code), code).toBe(false);
    }
  });
});

describe('wiring', () => {
  it('the login page uses it, and counts only what the function says counts', () => {
    const login = norm(loginRaw);
    expect(login).toContain('const failure = describeSignInFailure(code, linkMode);');
    expect(login).toContain('if (failure.leaveLinkMode) setLinkMode(false);');
    // an unexplained code is logged, the code only: no address, no password
    expect(login).toContain('if (isUnexplainedSignInCode(code)) console.warn("Sign-in failed with an unexplained error:", code ?? "(no code)");');
    expect(login).toContain('if (failure.countsAsAttempt) setFailedAttempts((n) => n + 1);');
    // the old catch-all is gone
    expect(login).not.toContain('Incorrect password');
  });

  it('a sign-in that cannot open the profile is explained on the login page, before the sign-out', () => {
    const auth = norm(authRaw);
    const at = auth.indexOf('setAccountNotice(PROFILE_UNREADABLE_MESSAGE);');
    expect(at).toBeGreaterThan(-1);
    expect(auth.slice(at, at + 250)).toContain('stashAccountNotice(PROFILE_UNREADABLE_MESSAGE);');
    expect(auth.indexOf('stashAccountNotice(PROFILE_UNREADABLE_MESSAGE);')).toBeLessThan(
      auth.indexOf('await firebaseSignOut(auth);', at),
    );
    expect(PROFILE_UNREADABLE_MESSAGE).toContain('sign in again');
  });
});
