import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_PATCH_UNTIL,
  buildReportCards,
  buildSignatureFix,
  todayInJamaica,
  isDemoLoginUid,
  SCHOOL,
  STUDENT_COUNT,
  isSafePath,
  maskEmail,
} from '../../../scripts/seedDemoPrimaryLogic.mjs';
import gitignoreRaw from '../../../.gitignore?raw';
import { ID, TODAY, script, people, subjects, dated, clear, d } from './seedDemoPrimaryFixture';

// The Blue Mountain Primary School demo seed, part: script. Shared setup is in seedDemoPrimaryFixture.ts.

describe('maskEmail and isSafePath', () => {
  it('masks all but the first character and the domain', () => {
    expect(maskEmail('spectator@bluemountainps.test')).toBe('s***@bluemountainps.test');
  });

  it('accepts only the demo institution, its own ids, and nothing else', () => {
    expect(isSafePath(`institutions/${ID}`, ID)).toBe(true);
    expect(isSafePath(`institutions/${ID}/results/x`, ID)).toBe(true);
    expect(isSafePath(`registration_directory/${ID}`, ID)).toBe(true);
    expect(isSafePath('users/bmpsstu001', ID)).toBe(true);
    expect(isSafePath('student_parents/bmpspar001_bmpsstu001', ID)).toBe(true);
    expect(isSafePath('institutions/otherInstitution/results/x', ID)).toBe(false);
    expect(isSafePath(`institutions/${ID}x/results/x`, ID)).toBe(false);
    expect(isSafePath('users/someRealUid123', ID)).toBe(false);
    expect(isSafePath('registration_directory/other', ID)).toBe(false);
    expect(isSafePath(`institutions/${ID}`, 'x')).toBe(false);
    expect(isSafePath(undefined, ID)).toBe(false);
  });
});

describe('the script', () => {
  it('is a dry run unless --live, needs no key for one, and caps the writes per run', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toContain('if (live) ({ db, auth } = initAdmin(opts.keyPath));');
    expect(script).toContain('const DEFAULT_BUDGET = 9000;');
  });

  it('checks every path before writing, and refuses a second institution with the same name', () => {
    expect(script).toContain('isSafePath(item.path, institutionId)');
    expect(script).toContain("where('name', '==', SCHOOL.name)");
  });

  it('prints the new passwords once and never saves them: the only file written is the checkpoint', () => {
    expect(script.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(script).toContain('writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));');
    expect(script).not.toMatch(/cp\.[a-zA-Z]*[Pp]assword/);
  });

  it('tears down only the checkpointed institution, only if it carries the demo name, and only demo Auth accounts', () => {
    expect(script).toContain('snap.data().name !== SCHOOL.name');
    expect(script).toContain('endsWith(`@${SCHOOL.emailDomain}`)');
    expect(script).toContain('LOGIN_UIDS.map((uid) => ({ uid }))');
  });

  it('keeps its local checkpoint out of git', () => {
    expect(gitignoreRaw).toContain('scripts/.demo-primary-checkpoint.json');
  });
});

describe('the second set in the script, and the activity-clearing script', () => {
  it('writes updates as updates, and report cards only after the marks, attendance and support data', () => {
    expect(script).toContain("if (item.mode === 'update') batch.update(db.doc(item.path), item.data);");
    expect(script).toContain('attendanceDone && marksDone && extrasDone');
    expect(script).toContain('cp.reportCardsThrough = through;');
  });

  it('only clears the Activity log of a demo account that belongs to the demo institution, as a dry run by default', () => {
    expect(isDemoLoginUid('bmpsspe001')).toBe(true);
    expect(isDemoLoginUid('bmpsstu001')).toBe(true);
    for (const v of ['someRealUid123', 'bmpsstu002', '', undefined, null]) expect(isDemoLoginUid(v), String(v)).toBe(false);
    expect(clear).toContain("const DEFAULT_UID = 'bmpsspe001';");
    expect(clear).toContain('if (!isDemoLoginUid(opts.uid))');
    expect(clear).toContain('userSnap.data().institutionId !== institutionId');
    expect(clear).toContain("if (arg === '--live') opts.live = true;");
    expect(clear).toContain('if (!opts.live) {');
  });

  it('deletes nothing but that account\'s activity_log entries', () => {
    expect(clear.match(/writer\.delete\(/g)).toHaveLength(1);
    expect(clear).toContain('db.collection(`users/${opts.uid}/activity_log`)');
    expect(clear).not.toContain('audit_log');
    expect(clear).not.toContain('recursiveDelete');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Review fixes: Jamaica's date, the term-status guard, the signatory correction
// ─────────────────────────────────────────────────────────────────────────

describe("today's date in Jamaica", () => {
  it('is the Jamaica date, not the UTC date: UTC-5 all year, no daylight saving', () => {
    expect(todayInJamaica(new Date('2026-10-16T01:00:00Z'))).toBe('2026-10-15'); // 8 pm on the 15th in Kingston
    expect(todayInJamaica(new Date('2026-10-15T05:00:00Z'))).toBe('2026-10-15'); // midnight in Kingston
    expect(todayInJamaica(new Date('2026-10-15T04:59:00Z'))).toBe('2026-10-14');
    expect(todayInJamaica(new Date('2027-07-01T12:00:00Z'))).toBe('2027-07-01'); // summer: still UTC-5
    expect(todayInJamaica()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is what the seed script uses for "today", and the term-status refresh waits for the static documents', () => {
    expect(script).toContain('const todayISO = todayInJamaica();');
    expect(script).not.toContain('new Date().toISOString().slice(0, 10)');
    expect(script).toContain('if (live && budget > 0 && (cp.staticWritten ?? 0) >= staticItems.length) {');
  });
});

describe('the signatory correction', () => {
  it('names the principal as the admin: Mrs. B. Henry for Beverley Henry', () => {
    expect(SCHOOL.signatory).toBe('Mrs. B. Henry');
    expect(people.admin.name).toBe('Beverley Henry');
    const initial = people.admin.firstName[0];
    expect(SCHOOL.signatory).toContain(`${initial}. ${people.admin.lastName}`);
  });

  it('patches the institution and the first progress reports in place, as updates, and nothing later', () => {
    const fix = buildSignatureFix(ID, people, TODAY);
    expect(fix).toHaveLength(1 + STUDENT_COUNT);
    expect(fix[0]).toMatchObject({ path: `institutions/${ID}`, mode: 'update' });
    for (const i of fix) {
      expect(i.mode).toBe('update');
      expect(i.data).toEqual({ authorizedSignature: { mode: 'text', text: 'Mrs. B. Henry' } });
      expect(isSafePath(i.path, ID)).toBe(true);
    }
    const reports = new Set(dated.progressReports.map((i) => i.path));
    for (const i of fix.slice(1)) expect(reports.has(i.path), i.path).toBe(true);
    // a later seed date adds no more patches: later snapshots are written with the new signatory
    expect(buildSignatureFix(ID, people, '2026-12-18')).toHaveLength(1 + STUDENT_COUNT);
    expect(SIGNATURE_PATCH_UNTIL).toBe('2026-10-15');
    // before the first snapshot exists there is only the institution to correct
    expect(buildSignatureFix(ID, people, '2026-10-01')).toHaveLength(1);
  });

  it('writes new progress reports and report cards with the corrected signatory', () => {
    for (const i of dated.progressReports.slice(0, 5)) expect(d(i).authorizedSignature.text).toBe('Mrs. B. Henry');
    expect(d(buildReportCards(ID, people, subjects, TODAY)[0]).authorizedSignature.text).toBe('Mrs. B. Henry');
  });

  it('regenerates the report cards once for the correction, by a version in the checkpoint', () => {
    expect(script).toContain('const REPORT_CARDS_VERSION = 2;');
    expect(script).toContain('cp.reportCardsThrough === through && cp.reportCardsVersion === REPORT_CARDS_VERSION');
    expect(script).toContain('cp.reportCardsVersion = REPORT_CARDS_VERSION;');
  });
});
