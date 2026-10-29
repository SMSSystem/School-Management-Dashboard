import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_KINDS,
  BASE_CLASS_NAME,
  FIXED_IDS,
  SETUP_ALLOWED_NAMES,
  SPEC07_NAMES,
  academicYearAround,
  buildQaPlan,
  checkSetupTarget,
  envLines,
  findLeftovers,
  isValidEmailPrefix,
  parseSetupArgs,
  qaAccounts,
  setupPhrase,
} from '../../../scripts/setupQaInstitutionLogic.mjs';
import { QA_INSTITUTION_NAMES } from '../../../scripts/resetQaAdminPasswordLogic.mjs';
import scriptRaw from '../../../scripts/setup-qa-institution.mjs?raw';

// scripts/setup-qa-institution.mjs: which institution it may change, which leftovers of the retired spec 07 it removes, and
// what it creates. The script itself touches a live project; what can be proved without one is proved here.

/* eslint-disable @typescript-eslint/no-explicit-any */
const script = scriptRaw.split('\r\n').join('\n');
const NOW = new Date('2026-10-29T12:00:00Z');

describe('which institution it may change', () => {
  it('is Brookfield only, never a real school', () => {
    expect(SETUP_ALLOWED_NAMES).toEqual(['Brookfield Evening Institute']);
    // The password-reset script also lists the Blue Mountain demo school; this script must not.
    expect(QA_INSTITUTION_NAMES).toContain('Blue Mountain Primary School');
    expect(SETUP_ALLOWED_NAMES).not.toContain('Blue Mountain Primary School');
  });

  it('accepts the exact name and refuses another name, a wrong confirmation and a system document', () => {
    const ok = { institutionId: 'abc123', confirmName: 'Brookfield Evening Institute', exists: true, storedName: 'Brookfield Evening Institute' };
    expect(checkSetupTarget(ok)).toEqual([]);
    expect(checkSetupTarget({ ...ok, confirmName: 'brookfield evening institute' })[0]).toMatch(/does not match/);
    expect(checkSetupTarget({ ...ok, confirmName: 'Blue Mountain Primary School', storedName: 'Blue Mountain Primary School' }).join(' ')).toMatch(/not a QA institution/);
    expect(checkSetupTarget({ ...ok, institutionId: '_platform' })[0]).toMatch(/system document/);
    expect(checkSetupTarget({ ...ok, exists: false, storedName: undefined })[0]).toMatch(/no institution document/);
  });
});

describe('the accounts', () => {
  it('are one of each of five roles, with addresses built from the prefix and uids of letters and digits only', () => {
    const accounts = qaAccounts('qa.bf');
    expect(accounts.map((a) => a.role)).toEqual(['institution_admin', 'senior_teacher', 'regular_teacher', 'parent', 'student']);
    expect(accounts.map((a) => a.email)).toEqual(['qa.bf.admin@demo.com', 'qa.bf.seniorteacher@demo.com', 'qa.bf.teacher@demo.com', 'qa.bf.parent@demo.com', 'qa.bf.student@demo.com']);
    for (const a of accounts) expect(a.uid).toMatch(/^[a-z0-9]+$/);
    expect(new Set(accounts.map((a) => a.uid)).size).toBe(5);
    expect(ACCOUNT_KINDS.map((k) => k.envPrefix)).toEqual(['QA_ADMIN', 'QA_SENIOR_TEACHER', 'QA_TEACHER', 'QA_PARENT', 'QA_STUDENT']);
  });

  it('need a prefix of letters, digits and dots', () => {
    for (const ok of ['qa.bf', 'qabf', 'qa2']) expect(isValidEmailPrefix(ok), ok).toBe(true);
    for (const bad of ['', 'q', '.qa', 'qa.', 'QA bf', 'qa@bf', 'a'.repeat(40), null, undefined]) expect(isValidEmailPrefix(bad), String(bad)).toBe(false);
  });
});

describe('the academic year', () => {
  it('runs September to July around the date', () => {
    expect(academicYearAround('2026-10-29')).toEqual({ name: '2026–2027', startDate: '2026-09-01', endDate: '2027-07-31' });
    expect(academicYearAround('2027-03-02')).toEqual({ name: '2026–2027', startDate: '2026-09-01', endDate: '2027-07-31' });
    expect(academicYearAround('2026-09-01').startDate).toBe('2026-09-01');
  });
});

describe("spec 07's leftovers", () => {
  const snapshot = {
    years: [{ id: 'y1', name: SPEC07_NAMES.year }],
    terms: [{ id: 't1', name: SPEC07_NAMES.year, academicYearId: 'y1' }],
    classes: [{ id: 'c1', name: SPEC07_NAMES.class }, { id: 'c2', name: 'Some real class' }],
    subjects: [{ id: 's1', name: SPEC07_NAMES.subject }],
    slots: [
      { id: 'sl1', classId: 'c1', subjectId: 's1', termId: 't1' },
      { id: 'sl2', classId: 'c2', subjectId: 'other', termId: 'other' },
    ],
  };

  it('are found by exact name, with their term and slot, and nothing else', () => {
    const { remove, unexpected } = findLeftovers(snapshot, 'inst');
    expect(remove.map((r) => r.path).sort()).toEqual(
      ['institutions/inst/academicYears/y1', 'institutions/inst/classes/c1', 'institutions/inst/subjects/s1', 'institutions/inst/terms/t1', 'institutions/inst/timetable_slots/sl1'].sort(),
    );
    expect(unexpected).toEqual([]);
  });

  it('leave any other year or term alone and report them, so a live run can refuse', () => {
    const { remove, unexpected } = findLeftovers({ ...snapshot, years: [...snapshot.years, { id: 'y9', name: 'Hand-made year' }], terms: [...snapshot.terms, { id: 't9', name: 'Hand-made term', academicYearId: 'y9' }] }, 'inst');
    expect(remove.some((r) => r.path.endsWith('/y9') || r.path.endsWith('/t9'))).toBe(false);
    expect(unexpected.join(' ')).toMatch(/Hand-made year/);
    expect(unexpected.join(' ')).toMatch(/Hand-made term/);
  });

  it('do not count the year and term this script made as unexpected', () => {
    const made = { ...snapshot, years: [{ id: FIXED_IDS.year, name: '2026–2027' }], terms: [{ id: FIXED_IDS.term, name: 'QA Term', academicYearId: FIXED_IDS.year }], classes: [], subjects: [], slots: [] };
    expect(findLeftovers(made, 'inst')).toEqual({ remove: [], unexpected: [] });
  });
});

describe('the plan', () => {
  const plan = buildQaPlan({ institutionId: 'inst', prefix: 'qa.bf', departmentName: 'QA Department', termName: 'QA Term', todayISO: '2026-10-29', now: NOW });
  const at = (path: string) => plan.items.find((i) => i.path === path)!.data as any;

  it('writes the year, the term, the department and the class under fixed ids, so a second run changes nothing', () => {
    expect(at(`institutions/inst/academicYears/${FIXED_IDS.year}`)).toMatchObject({ status: 'active', startDate: '2026-09-01', endDate: '2027-07-31', schoolWeekDays: [1, 2, 3, 4, 5] });
    expect(at(`institutions/inst/terms/${FIXED_IDS.term}`)).toMatchObject({ name: 'QA Term', academicYearId: FIXED_IDS.year, termNumber: 1 });
    expect(at(`institutions/inst/departments/${FIXED_IDS.department}`).name).toBe('QA Department');
    expect(at(`institutions/inst/classes/${FIXED_IDS.class}`)).toMatchObject({ name: BASE_CLASS_NAME, termId: FIXED_IDS.term });
  });

  it('gives both teachers the department, puts the student in the class and links the parent to the student', () => {
    const [admin, senior, teacher, parent, student] = plan.accounts;
    expect(at(`users/${senior.uid}`).departmentId).toBe(FIXED_IDS.department);
    expect(at(`users/${teacher.uid}`).departmentId).toBe(FIXED_IDS.department);
    expect(at(`users/${admin.uid}`)).toMatchObject({ role: 'institution_admin', institutionId: 'inst', status: 'active', mustChangePassword: false });
    expect(at(`users/${student.uid}`)).toMatchObject({ classId: FIXED_IDS.class, classIds: [FIXED_IDS.class] });
    expect(at(`student_parents/${parent.uid}_${student.uid}`)).toEqual({ parentId: parent.uid, studentId: student.uid, institutionId: 'inst', relationship: 'guardian' });
  });

  it('uses the names it was given', () => {
    const other = buildQaPlan({ institutionId: 'inst', prefix: 'qa.bf', departmentName: 'Science', termName: 'Term One', todayISO: '2026-10-29', now: NOW });
    expect(other.items.find((i) => i.path.endsWith(`/departments/${FIXED_IDS.department}`))!.data.name).toBe('Science');
    expect(other.items.find((i) => i.path.endsWith(`/terms/${FIXED_IDS.term}`))!.data.name).toBe('Term One');
  });
});

describe('the lines for .env.qa', () => {
  const base = { institutionName: 'Brookfield Evening Institute', institutionId: 'abc', prefix: 'qa.bf', departmentName: 'QA Department', termName: 'QA Term' };

  it('give the institution, the prefix, the five accounts and the generated passwords', () => {
    const lines = envLines({ ...base, issued: { admin: 'pw-admin', student: 'pw-student' } });
    expect(lines).toContain('QA_INSTITUTION_NAME="Brookfield Evening Institute"');
    expect(lines).toContain('QA_INSTITUTION_ID="abc"');
    expect(lines).toContain('QA_EMAIL_PREFIX="qa.bf"');
    expect(lines).toContain('QA_ADMIN_EMAIL="qa.bf.admin@demo.com"');
    expect(lines).toContain('QA_ADMIN_PASSWORD="pw-admin"');
    expect(lines.some((l) => l.startsWith('# QA_TEACHER_PASSWORD'))).toBe(true);
    expect(lines.some((l) => l.startsWith('QA_DEPARTMENT_NAME') || l.startsWith('QA_TERM_NAME'))).toBe(false);
  });

  it('add the department and term names only when they are not the defaults', () => {
    const lines = envLines({ ...base, departmentName: 'Science', termName: 'Term One', issued: {} });
    expect(lines).toContain('QA_DEPARTMENT_NAME="Science"');
    expect(lines).toContain('QA_TERM_NAME="Term One"');
  });
});

describe('the command line', () => {
  const full = ['--key=k.json', '--project=p', '--institution-id=abc', '--confirm-name=Brookfield Evening Institute', '--email-prefix=qa.bf'];

  it('needs every option and a valid prefix, and is a dry run unless --live is given', () => {
    const ok = parseSetupArgs(full) as { opts: any };
    expect(ok.opts.live).toBe(false);
    expect(ok.opts.departmentName).toBe('QA Department');
    expect((parseSetupArgs([...full, '--live']) as { opts: any }).opts.live).toBe(true);
    for (const flag of ['--key', '--project', '--institution-id', '--confirm-name', '--email-prefix']) {
      expect('error' in parseSetupArgs(full.filter((a) => !a.startsWith(`${flag}=`))), flag).toBe(true);
    }
    expect((parseSetupArgs([...full.slice(0, 4), '--email-prefix=QA bf']) as { error: string }).error).toMatch(/email-prefix/);
    expect((parseSetupArgs([...full, '--nope']) as { error: string }).error).toMatch(/Unrecognized/);
  });

  it('asks for the number of changes and the id', () => {
    expect(setupPhrase(23, 'abc')).toBe('SETUP 23 abc');
  });
});

describe('the script (source checks)', () => {
  it('only reads unless --live is given, and a live run needs the project, the name and the typed phrase', () => {
    expect(script).toContain('if (!opts.live) {');
    expect(script.indexOf('if (!opts.live) {')).toBeLessThan(script.indexOf('await ask('));
    expect(script).toContain('if (opts.project !== key.project_id)');
    expect(script).toContain('checkSetupTarget(');
    expect(script.indexOf('checkSetupTarget(')).toBeLessThan(script.indexOf('Inventory (reads)'));
    expect(script).toContain('if (answer !== phrase) {');
  });

  it('refuses a live run while an unexpected year or a taken address is in the way', () => {
    expect(script).toContain('leftovers.unexpected');
    expect(script).toContain('Refusing a live run:');
  });

  it('creates the Auth accounts before the documents, never saves a password, and never deletes by pattern', () => {
    expect(script.indexOf('auth.createUser(')).toBeLessThan(script.indexOf('batch.set(db.doc(item.path), item.data)'));
    expect(script).not.toMatch(/writeFileSync\([^)]*password/i);
    expect(script).not.toContain('recursiveDelete');
    expect(script).not.toContain('listDocuments');
  });

  it('refuses an institution that is not small', () => {
    expect(script).toContain('MAX_DOCS_PER_COLLECTION');
  });
});
