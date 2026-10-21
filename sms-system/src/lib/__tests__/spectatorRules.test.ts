import { describe, expect, it } from 'vitest';
import rules from '../../../firestore.rules?raw';

// The spectator role is read-only because no create/update/delete rule names it,
// and a new role is denied by default. There is no emulator in this project, so
// this test reads firestore.rules as text and guards that property, plus the
// read access the spec lists (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md,
// section 3.3). It fails if:
//   - a create/update/delete/write rule calls a spectator helper (directly or
//     through another function that does);
//   - the word 'spectator' appears anywhere but isSpectator() and the users
//     create allow-list;
//   - a helper body changes, or one of the pinned read rules loses its
//     spectator branch.
// When you deliberately change the spectator's read access, update this test.

type Fn = { name: string; open: number; close: number; body: string };
type Rule = { kinds: string[]; start: number; end: number; expr: string; exprStripped: string };

const ROOT_HELPERS = ['isSpectator', 'canReadAdminData', 'canReadStaffData'];
const WRITE_KINDS = ['create', 'update', 'delete', 'write'];
const READ_KINDS = ['read', 'get', 'list'];

// Same-length copy of the text with // comments blanked and, unless keepStrings,
// the contents of quoted strings blanked too (so braces and semicolons inside
// regex strings cannot confuse structure parsing). Indices stay aligned.
function scan(text: string, keepStrings: boolean): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (c === "'" || c === '"') {
      out += c;
      i += 1;
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\' && i + 1 < text.length) {
          out += keepStrings ? text[i] + text[i + 1] : '__';
          i += 2;
        } else {
          out += keepStrings ? text[i] : '_';
          i += 1;
        }
      }
      if (i < text.length) {
        out += c;
        i += 1;
      }
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

function matchBrace(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return masked.length - 1;
}

function parseFunctions(masked: string, stripped: string): Fn[] {
  const fns: Fn[] = [];
  for (const m of masked.matchAll(/\bfunction\s+(\w+)\s*\(/g)) {
    const open = masked.indexOf('{', m.index);
    const close = matchBrace(masked, open);
    fns.push({ name: m[1], open, close, body: stripped.slice(open + 1, close) });
  }
  return fns;
}

function parseRules(masked: string, stripped: string): Rule[] {
  const out: Rule[] = [];
  for (const m of masked.matchAll(/\ballow\s+([a-z]+(?:\s*,\s*[a-z]+)*)\s*:\s*if\b/g)) {
    const exprStart = m.index + m[0].length;
    const end = masked.indexOf(';', exprStart);
    out.push({
      kinds: m[1].split(',').map((k) => k.trim()),
      start: m.index,
      end,
      expr: masked.slice(exprStart, end),
      exprStripped: stripped.slice(exprStart, end),
    });
  }
  return out;
}

function callsAny(expr: string, names: Iterable<string>): boolean {
  for (const n of names) if (new RegExp(`\\b${n}\\s*\\(`).test(expr)) return true;
  return false;
}

// The helpers plus every function that (transitively) calls one of them.
function taintedFunctions(fns: Fn[], masked: string): Set<string> {
  const tainted = new Set<string>(ROOT_HELPERS);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of fns) {
      if (tainted.has(f.name)) continue;
      if (callsAny(masked.slice(f.open + 1, f.close), tainted)) {
        tainted.add(f.name);
        changed = true;
      }
    }
  }
  return tainted;
}

function parse(text: string) {
  const masked = scan(text, false);
  const stripped = scan(text, true);
  const fns = parseFunctions(masked, stripped);
  const ruleList = parseRules(masked, stripped);
  const tainted = taintedFunctions(fns, masked);
  return { masked, stripped, fns, ruleList, tainted };
}

function usersBlock(masked: string): { start: number; end: number } | null {
  const start = masked.indexOf('match /users/{uid} {');
  if (start < 0) return null;
  return { start, end: matchBrace(masked, masked.indexOf('{', start + 'match /users/{uid}'.length)) };
}

function lint(text: string): string[] {
  const { masked, stripped, fns, ruleList, tainted } = parse(text);
  const violations: string[] = [];

  for (const r of ruleList) {
    if (r.kinds.some((k) => WRITE_KINDS.includes(k)) && callsAny(r.expr, tainted)) {
      violations.push(`allow ${r.kinds.join(', ')} calls a spectator helper: ${r.exprStripped.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
    }
  }

  const spectatorFn = fns.find((f) => f.name === 'isSpectator');
  const users = usersBlock(masked);
  for (const m of stripped.matchAll(/'spectator'/g)) {
    const at = m.index;
    const inHelper = spectatorFn !== undefined && at > spectatorFn.open && at < spectatorFn.close;
    const inUsersCreate =
      users !== null &&
      ruleList.some((r) => r.kinds.includes('create') && r.start > users.start && r.end < users.end && at > r.start && at < r.end);
    if (!inHelper && !inUsersCreate) violations.push(`'spectator' appears outside isSpectator() and the users create rule (offset ${at})`);
  }
  return violations;
}

const { masked: realMasked, stripped: realStripped, fns: realFns, ruleList: realRules, tainted: realTainted } = parse(rules);

// The first read rule after `match <path> {` (optionally searching from `after`).
function readRuleFor(path: string, after = 0): Rule | undefined {
  const at = realMasked.indexOf(`match ${path} {`, after);
  if (at < 0) return undefined;
  return realRules.find((r) => r.start > at && r.kinds.some((k) => READ_KINDS.includes(k)));
}

describe('spectator rules: read-only safety', () => {
  it('no create/update/delete/write rule uses a spectator helper, and the word only appears where allowed', () => {
    expect(lint(rules)).toEqual([]);
  });

  it('taints lessonNoteReadableBy through canReadAdminData, so it can be used only in read rules', () => {
    expect(realTainted.has('lessonNoteReadableBy')).toBe(true);
  });

  it('keeps the three helper bodies exactly as designed', () => {
    const body = (name: string) => realFns.find((f) => f.name === name)?.body.replace(/\s+/g, ' ').trim();
    expect(body('isSpectator')).toBe("return isSignedIn() && myRole() == 'spectator';");
    expect(body('canReadAdminData')).toBe('return isAdminOrAbove() || isSpectator();');
    expect(body('canReadStaffData')).toBe('return isTeacherOrAbove() || isSpectator();');
  });

  it('lets only an institution admin (not a super admin shortcut) add spectators on the users create rule', () => {
    const users = usersBlock(realMasked);
    expect(users).not.toBeNull();
    const creates = realRules.filter((r) => r.kinds.includes('create') && r.start > users!.start && r.end < users!.end);
    expect(creates).toHaveLength(1);
    expect(creates[0].exprStripped).toContain("'spectator'");
    expect(creates[0].exprStripped).toContain('isAdmin() && writingToMyInstitution()');
    expect(creates[0].exprStripped).not.toContain('isAdminOrAbove()');
  });
});

describe('spectator rules: pinned read access (spec section 3.3)', () => {
  const INST = '/institutions/{institutionId}';
  const paths = [
    '/users/{uid}',
    '/users/{uid}/photo/{photoId}',
    '/student_parents/{docId}',
    `${INST}/audit_log/{eventId}`,
    '/{path=**}/activity_log/{eventId}',
    `${INST}/enrollmentRegistrations/{registrationId}`,
    `${INST}/reportCardComments/{id}`,
    `${INST}/reportCards/{id}`,
    `${INST}/progressReports/{id}`,
    `${INST}/disciplinaryActions/{actionId}`,
    `${INST}/studentActivities/{id}`,
    `${INST}/studentResponsibilities/{id}`,
    `${INST}/results/{resultId}`,
    `${INST}/feedback_comments/{docId}`,
    `${INST}/gradebooks/{gradebookId}`,
    `${INST}/attendanceSummaries/{id}`,
    `${INST}/generalAttendance/{docId}`,
    `${INST}/subjectAttendance/{docId}`,
    `${INST}/assignments/{assignmentId}`,
    `${INST}/assignments/{assignmentId}/submissions/{studentId}`,
    `${INST}/assignments/{assignmentId}/submissions/{studentId}/attempts/{attemptNumber}`,
    `${INST}/assignments/{assignmentId}/submissionTombstones/{studentId}`,
    `${INST}/lessonNotes/{lessonNoteId}`,
    `${INST}/lessonNotes/{lessonNoteId}/attachment/{docId}`,
    `${INST}/exams/{examId}/content/questions`,
    `${INST}/exams/{examId}/private/key`,
    `${INST}/exams/{examId}/attempts/{studentUid}`,
    `${INST}/exams/{examId}/grades/{studentUid}`,
    `${INST}/exams/{examId}/accommodations/{studentUid}`,
  ];

  for (const p of paths) {
    it(`a spectator can read ${p}`, () => {
      const rule = readRuleFor(p);
      expect(rule, `no read rule found for ${p}`).toBeDefined();
      expect(callsAny(rule!.expr, realTainted)).toBe(true);
    });
  }

  it('a spectator can read the gradebook columns subcollection', () => {
    const gradebooks = realMasked.indexOf(`match ${INST}/gradebooks/{gradebookId} {`);
    expect(gradebooks).toBeGreaterThan(-1);
    const rule = readRuleFor('/columns/{colId}', gradebooks);
    expect(rule, 'no read rule found for the nested columns').toBeDefined();
    expect(callsAny(rule!.expr, realTainted)).toBe(true);
  });

  it('pins 30 read paths', () => {
    expect(paths.length + 1).toBe(30);
  });

  it('still finds the real rules (guards the parser itself)', () => {
    expect(realRules.length).toBeGreaterThan(100);
    expect(realStripped).toContain('function isSpectator()');
  });
});

describe('spectator rules lint: self-test on synthetic rules', () => {
  const wrap = (extra: string) => `
    service cloud.firestore { match /databases/{database}/documents {
      function isSpectator() { return isSignedIn() && myRole() == 'spectator'; }
      function canReadAdminData() { return isAdminOrAbove() || isSpectator(); }
      function canReadStaffData() { return isTeacherOrAbove() || isSpectator(); }
      function viaHelper(n) { return canReadAdminData(); }
      function isRegex(u) { return u.matches('^a{0,2};b$'); }
      match /users/{uid} {
        allow read: if canReadAdminData();
        allow create: if isAdmin() && request.resource.data.role in ['spectator'];
      }
      ${extra}
    } }`;

  it('accepts read rules, comments that mention the word, and regex strings', () => {
    const good = wrap(`
      // a 'spectator' mentioned in a comment is fine
      match /a/{id} { allow read: if viaHelper(id); allow create: if isAdmin(); }
    `);
    expect(lint(good)).toEqual([]);
  });

  it('flags an update rule that calls a helper', () => {
    expect(lint(wrap(`match /a/{id} { allow update: if canReadAdminData(); }`))).toHaveLength(1);
  });

  it('flags a create rule that reaches a helper through another function', () => {
    expect(lint(wrap(`match /a/{id} { allow create: if viaHelper(id); }`))).toHaveLength(1);
  });

  it('flags a combined read, write rule', () => {
    expect(lint(wrap(`match /a/{id} { allow read, write: if isSpectator(); }`))).toHaveLength(1);
  });

  it("flags the word 'spectator' in a rule outside the users create rule", () => {
    expect(lint(wrap(`match /a/{id} { allow create: if request.resource.data.role == 'spectator'; }`))).toHaveLength(1);
  });
});
