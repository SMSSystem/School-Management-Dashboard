import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLoginLink, parseLoginLink } from '../loginEmail/loginLink';
import {
  EMAIL_COOLDOWN_MS,
  EMAIL_LIFETIME_CAP,
  loginEmailBlockReason,
  type EmailTarget,
} from '../loginEmail/eligibility';
import { parseEmailSettings, type InstitutionEmailSettings } from '../loginEmail/emailSettings';
import { buildLoginEmailParams } from '../loginEmail/payload';
import { describeEmailFailure, EMAILJS_ENDPOINT, sendEmail } from '../loginEmail/sendEmail';
import { ROLE_DEFAULT_PASSWORDS } from '../roleDefaultPasswords';
import { describeSignInFailure } from '../signInFailure';
import loginPageRaw from '../../scenes/(auth)/login/index.tsx?raw';
import parentsList from '../../scenes/(dashboard)/list/parents/index.tsx?raw';
import { appSource } from './appSource';
import sendButton from '../../components/SendLoginEmailButton.tsx?raw';
import studentsList from '../../scenes/(dashboard)/list/students/index.tsx?raw';
import teachersList from '../../scenes/(dashboard)/list/teachers/index.tsx?raw';
import spectatorsList from '../../scenes/(dashboard)/list/spectators/index.tsx?raw';
import firestoreRules from '../../../firestore.rules?raw';

const loginPage = loginPageRaw.replace(/\r\n/g, '\n');

// First-login emails (docs/miscellaneous-specs/INSTITUTION_LOGIN_EMAILS_SPEC.md,
// MVP slice). Pure logic is tested directly; the page, the lists and the rules
// are checked as source text, like the other guards in this folder.

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const OK: EmailTarget = {
  role: 'student',
  status: 'active',
  mustChangePassword: true,
  email: 'ann@example.com',
  emailedAtMs: null,
  emailCount: 0,
};

const SETTINGS: InstitutionEmailSettings = {
  enabled: true,
  emailjs: { publicKey: 'pk', serviceId: 'svc', templateId: 'tpl' },
  portalName: 'GENR8-3D Portal',
  replyTo: 'office@example.com',
};

describe('login link', () => {
  it('builds /login/<institution id>/<role code> with no query, fragment or password', () => {
    const url = buildLoginLink('https://app.example.com/', 'abc123', 'student');
    expect(url).toBe('https://app.example.com/login/abc123/student');
    expect(url).not.toMatch(/[?#]/);
    for (const pw of Object.values(ROLE_DEFAULT_PASSWORDS)) expect(url).not.toContain(pw!);
  });

  it('parses a valid institution id and role code', () => {
    expect(parseLoginLink({ institutionId: 'aB3dE5fG7hI9jK1lM2nO', role: 'teacher' })).toEqual({
      institutionId: 'aB3dE5fG7hI9jK1lM2nO',
      code: 'teacher',
    });
    expect(parseLoginLink({ institutionId: 'x', role: 'spectator' })?.code).toBe('spectator');
  });

  it('ignores an unknown role code, parent, a missing part or an odd institution id', () => {
    for (const params of [
      { institutionId: 'abc', role: 'parent' },
      { institutionId: 'abc', role: 'admin' },
      { institutionId: 'abc', role: 'constructor' },
      { institutionId: 'abc', role: '' },
      { institutionId: 'abc' },
      { role: 'student' },
      { institutionId: '', role: 'student' },
      { institutionId: 'a/b', role: 'student' },
      { institutionId: '../x', role: 'student' },
      { institutionId: 'a'.repeat(65), role: 'student' },
    ]) {
      expect(parseLoginLink(params), JSON.stringify(params)).toBeNull();
    }
  });
});

describe('loginEmailBlockReason', () => {
  it('allows an active account that must still change its password and has an address', () => {
    for (const role of ['student', 'senior_teacher', 'regular_teacher', 'spectator'] as const) {
      expect(loginEmailBlockReason({ ...OK, role }, NOW), role).toBeNull();
    }
  });

  it('refuses parents and admins', () => {
    for (const role of ['parent', 'institution_admin', 'super_admin'] as const) {
      expect(loginEmailBlockReason({ ...OK, role }, NOW), role).toMatch(/not emailed/);
    }
    expect(loginEmailBlockReason({ ...OK, role: undefined }, NOW)).toMatch(/not emailed/);
  });

  it('refuses an inactive account', () => {
    expect(loginEmailBlockReason({ ...OK, status: 'inactive' }, NOW)).toMatch(/deactivated/);
  });

  it('refuses when the person has set their own password or there is no record', () => {
    expect(loginEmailBlockReason({ ...OK, mustChangePassword: false }, NOW)).toMatch(/already set/);
    expect(loginEmailBlockReason({ ...OK, mustChangePassword: undefined }, NOW)).toMatch(/no first-sign-in record/);
  });

  it('refuses a missing or malformed address', () => {
    for (const email of [undefined, null, '', '   ', 'no-at-sign', 'a@b', 'a b@c.com']) {
      expect(loginEmailBlockReason({ ...OK, email }, NOW), String(email)).toMatch(/usable email/);
    }
  });

  it('enforces the 24-hour cooldown exactly', () => {
    expect(loginEmailBlockReason({ ...OK, emailedAtMs: NOW - EMAIL_COOLDOWN_MS + 1 }, NOW)).toMatch(/24 hours/);
    expect(loginEmailBlockReason({ ...OK, emailedAtMs: NOW - EMAIL_COOLDOWN_MS }, NOW)).toBeNull();
  });

  it('enforces the lifetime cap exactly', () => {
    expect(loginEmailBlockReason({ ...OK, emailCount: EMAIL_LIFETIME_CAP - 1 }, NOW)).toBeNull();
    expect(loginEmailBlockReason({ ...OK, emailCount: EMAIL_LIFETIME_CAP }, NOW)).toMatch(/12 times/);
  });

  it('reports the role before the password state', () => {
    expect(loginEmailBlockReason({ ...OK, role: 'parent', mustChangePassword: false }, NOW)).toMatch(/not emailed/);
  });
});

describe('parseEmailSettings', () => {
  const stored = {
    enabled: true,
    emailjs: { publicKey: ' pk ', serviceId: 'svc', templateId: 'tpl' },
    portalName: 'Portal',
    replyTo: ' office@example.com ',
  };

  it('accepts a complete document and trims it', () => {
    expect(parseEmailSettings(stored)).toEqual({
      enabled: true,
      emailjs: { publicKey: 'pk', serviceId: 'svc', templateId: 'tpl' },
      portalName: 'Portal',
      replyTo: 'office@example.com',
    });
  });

  it('is null when switched off, incomplete or not an object', () => {
    expect(parseEmailSettings({ ...stored, enabled: false })).toBeNull();
    expect(parseEmailSettings({ ...stored, enabled: 'true' })).toBeNull();
    expect(parseEmailSettings({ ...stored, portalName: '' })).toBeNull();
    expect(parseEmailSettings({ ...stored, emailjs: { ...stored.emailjs, templateId: '  ' } })).toBeNull();
    expect(parseEmailSettings({ ...stored, emailjs: undefined })).toBeNull();
    expect(parseEmailSettings(null)).toBeNull();
    expect(parseEmailSettings('x')).toBeNull();
  });

  it('keeps an https logoUrl and ignores any other value', () => {
    const logo = 'https://academy.genr83d.com/assets/genr8-3d-email-icon.png';
    expect(parseEmailSettings({ ...stored, logoUrl: ` ${logo} ` })?.logoUrl).toBe(logo);
    for (const bad of ['http://a.test/x.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'a.test/x.png', 'https://a b', '', '  ', 5, null]) {
      expect(parseEmailSettings({ ...stored, logoUrl: bad }), String(bad)).not.toHaveProperty('logoUrl');
    }
  });

  it('leaves replyTo out when blank', () => {
    expect(parseEmailSettings({ ...stored, replyTo: '  ' })).not.toHaveProperty('replyTo');
  });
});

describe('buildLoginEmailParams', () => {
  const params = buildLoginEmailParams({
    appUrl: 'https://app.example.com/',
    institutionId: 'inst1',
    role: 'senior_teacher',
    name: 'Ann Lee',
    email: ' ann@example.com ',
    settings: SETTINGS,
  });

  it('carries the recipient, the portal name and the link for the right role code', () => {
    expect(params.to_email).toBe('ann@example.com');
    expect(params.to_name).toBe('Ann Lee');
    expect(params.portal_name).toBe('GENR8-3D Portal');
    expect(params.login_url).toBe('https://app.example.com/login/inst1/teacher');
    expect(params.logo_url).toBe('https://app.example.com/apple-touch-icon.png');
    expect(params.reply_to).toBe('office@example.com');
    expect(params.subject).toContain('GENR8-3D Portal');
  });

  it('uses the settings logoUrl when there is one, else the app icon', () => {
    const base = { appUrl: 'https://app.example.com', institutionId: 'i', role: 'student' as const, name: 'N', email: 'n@x.com' };
    const logo = 'https://academy.genr83d.com/assets/logo.png';
    expect(buildLoginEmailParams({ ...base, settings: { ...SETTINGS, logoUrl: logo } }).logo_url).toBe(logo);
    expect(buildLoginEmailParams({ ...base, settings: SETTINGS }).logo_url).toBe('https://app.example.com/apple-touch-icon.png');
  });

  it('never contains a password', () => {
    const all = JSON.stringify(params);
    for (const pw of Object.values(ROLE_DEFAULT_PASSWORDS)) expect(all).not.toContain(pw!);
  });

  it('sets exactly one role flag to a truthy value and the others to "" (EmailJS sections)', () => {
    const base = { appUrl: 'https://a.test', institutionId: 'i', name: 'N', email: 'n@x.com', settings: SETTINGS };
    const flags = (role: 'student' | 'senior_teacher' | 'regular_teacher' | 'spectator') => {
      const p = buildLoginEmailParams({ ...base, role });
      return [p.is_student, p.is_teacher, p.is_spectator];
    };
    expect(flags('student')).toEqual(['yes', '', '']);
    expect(flags('senior_teacher')).toEqual(['', 'yes', '']);
    expect(flags('regular_teacher')).toEqual(['', 'yes', '']);
    expect(flags('spectator')).toEqual(['', '', 'yes']);
  });

  it('uses the spectator code for a spectator and refuses a parent', () => {
    const base = { appUrl: 'https://a.test', institutionId: 'i', name: 'N', email: 'n@x.com', settings: SETTINGS };
    expect(buildLoginEmailParams({ ...base, role: 'spectator' }).login_url).toBe('https://a.test/login/i/spectator');
    expect(() => buildLoginEmailParams({ ...base, role: 'parent' })).toThrow();
  });
});

describe('sendEmail', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (...statuses: (number | 'network')[]) => {
    const fn = vi.fn();
    for (const s of statuses) {
      if (s === 'network') fn.mockRejectedValueOnce(new TypeError('network'));
      else fn.mockResolvedValueOnce({ status: s, text: async () => 'reason' });
    }
    vi.stubGlobal('fetch', fn);
    return fn;
  };

  it('posts the ids and the parameters to EmailJS and succeeds on 200', async () => {
    const fn = stub(200);
    const result = await sendEmail(SETTINGS, { to_email: 'a@b.co' }, 0);
    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe(EMAILJS_ENDPOINT);
    expect(JSON.parse(init.body)).toEqual({
      service_id: 'svc',
      template_id: 'tpl',
      user_id: 'pk',
      template_params: { to_email: 'a@b.co' },
    });
  });

  it('retries once after a 429 or a network error', async () => {
    const a = stub(429, 200);
    expect(await sendEmail(SETTINGS, {}, 0)).toEqual({ ok: true });
    expect(a).toHaveBeenCalledTimes(2);
    const b = stub('network', 200);
    expect(await sendEmail(SETTINGS, {}, 0)).toEqual({ ok: true });
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('gives up after the one retry and does not retry a setup error', async () => {
    const a = stub(429, 429);
    expect((await sendEmail(SETTINGS, {}, 0)).ok).toBe(false);
    expect(a).toHaveBeenCalledTimes(2);
    const b = stub(400);
    expect((await sendEmail(SETTINGS, {}, 0)).ok).toBe(false);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('adds the status code to a failure message, and none for a network failure', async () => {
    stub(422);
    expect(await sendEmail(SETTINGS, {}, 0)).toEqual({ ok: false, message: `${describeEmailFailure(422)} (code 422)` });
    stub('network', 'network');
    const result = await sendEmail(SETTINGS, {}, 0);
    expect(result).toEqual({ ok: false, message: describeEmailFailure(null) });
  });

  it('explains each failure differently', () => {
    const messages = [null, 400, 404, 401, 403, 429, 500].map(describeEmailFailure);
    expect(new Set(messages).size).toBeGreaterThanOrEqual(5);
    expect(describeEmailFailure(400)).toBe(describeEmailFailure(404));
    expect(describeEmailFailure(401)).toBe(describeEmailFailure(403));
  });
});

describe('the login page', () => {
  it('has the /login/:institutionId/:role route, behind the same institution gate', () => {
    expect(appSource).toContain('<Route path="/login/:institutionId/:role" element={<PostLoginInstitutionGate />} />');
  });

  it('hides the password box in link mode and signs in with the role default held in code', () => {
    expect(loginPage).toContain('{!linkMode && (');
    expect(loginPage).toContain('linkMode && link ? defaultPasswordForLinkRole(link.code) : password');
    expect(loginPage).toContain('linkMode ? undefined : validatePassword(password)');
  });

  it('falls back to the normal box on a wrong password, without counting a failed attempt', () => {
    // The decision is made by describeSignInFailure (signInFailure.ts); the page acts on what it says.
    expect(loginPage).toContain('const failure = describeSignInFailure(code, linkMode);');
    expect(loginPage).toContain('if (failure.leaveLinkMode) setLinkMode(false);');
    expect(loginPage).toContain('I already have my own password');
    for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
      const failure = describeSignInFailure(code, true);
      expect(failure.leaveLinkMode, code).toBe(true);
      expect(failure.countsAsAttempt, code).toBe(false);
    }
  });

  it('writes the pending institution before signing in, so the institution gate still checks', () => {
    expect(loginPage.indexOf('setPendingLoginInstitution(selectedInstitutionId)')).toBeGreaterThan(-1);
    expect(loginPage.indexOf('setPendingLoginInstitution(selectedInstitutionId)')).toBeLessThan(
      loginPage.indexOf('await signIn('),
    );
  });

  it('ignores a link to an institution that is not in the directory', () => {
    expect(loginPage).toContain('list.some((i) => i.id === link.institutionId)');
  });
});

describe('the Send sign-in email button', () => {
  it('is offered only to an institution admin and only when emails are enabled', () => {
    expect(sendButton).toContain('role !== "institution_admin" || !EMAIL_ENABLED || !APP_URL || !institutionId');
    expect(sendButton).toContain('import.meta.env.VITE_EMAIL_ENABLED === "true"');
  });

  it('checks a fresh read of the account, then sends, then stamps the account', () => {
    const read = sendButton.indexOf('getDoc(doc(db, "users", uid))');
    const check = sendButton.indexOf('loginEmailBlockReason(');
    const send = sendButton.indexOf('await sendEmail(');
    const stamp = sendButton.indexOf('credentialsEmailedAt: serverTimestamp()');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(check);
    expect(check).toBeLessThan(send);
    expect(send).toBeLessThan(stamp);
    expect(sendButton).toContain('credentialsEmailCount: increment(1)');
  });

  it('stamps nothing when the send fails', () => {
    const failBranch = sendButton.slice(sendButton.indexOf('if (!result.ok)'), sendButton.indexOf('credentialsEmailedAt: serverTimestamp()'));
    expect(failBranch).toContain('return;');
  });

  it('sits on the Students, Teachers and Spectators lists but not Parents', () => {
    for (const src of [studentsList, teachersList, spectatorsList]) {
      expect(src).toContain('<SendLoginEmailButton');
    }
    expect(parentsList).not.toContain('SendLoginEmailButton');
  });
});

describe('email_settings rules', () => {
  const block = firestoreRules.slice(
    firestoreRules.indexOf('match /institutions/{institutionId}/email_settings/{settingsId}'),
  );
  const body = block.slice(0, block.indexOf('\n    }') + 6);

  it('are readable only by that institution\'s admin and super_admin', () => {
    expect(body).toContain('allow read: if isSuperAdmin() || (isAdmin() && myInstitutionId() == institutionId);');
    expect(body).not.toContain('isSpectator');
    expect(body).not.toContain('isTeacher');
  });

  it('allow no client writes', () => {
    expect(body).toContain('allow write: if false;');
  });
});
