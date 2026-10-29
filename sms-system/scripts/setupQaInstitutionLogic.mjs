// The pure side of scripts/setup-qa-institution.mjs: which institution it may touch, which leftovers of the retired
// calendar-mode fallback spec it removes, and the documents and accounts it creates. No I/O, so it is tested in Node
// (src/lib/__tests__/setupQaInstitution.test.ts).
//
// What the e2e suite needs from its institution (e2e/qa-names.ts, e2e/01-academic-mode-regression.spec.ts): academic calendar
// mode, a department, an academic year with a term, and one account of each of five roles. Everything else (the QA Assignments
// class and subject, the lessons teacher, the exams) the specs create themselves.

import { SYSTEM_INSTITUTION_IDS, checkTarget } from './deleteInstitutionLogic.mjs';

/** The only institution this script may change. A real school can never be named here. */
export const SETUP_ALLOWED_NAMES = ['Brookfield Evening Institute'];

/** What e2e spec 07 (retired) created in the institution, by exact name. */
export const SPEC07_NAMES = {
  year: 'Mechanical Workshop 1 — Fall Cohort',
  subject: 'Mechanical Workshop 1',
  class: 'Mechanical Workshop 1 — Evening Section',
};

export const BASE_CLASS_NAME = 'QA Base Class';
export const SCHOOL_WEEK_DAYS = [1, 2, 3, 4, 5];

/** Ids of the documents the script writes, so a second run finds and keeps them. */
export const FIXED_IDS = { year: 'qa_year', term: 'qa_term', department: 'qa_department', class: 'qa_base_class' };

/** The five accounts spec 01 and the other specs sign in as, with the .env.qa names they are stored under. */
export const ACCOUNT_KINDS = [
  { key: 'admin', role: 'institution_admin', code: 'adm', firstName: 'QA', lastName: 'Admin', envPrefix: 'QA_ADMIN' },
  { key: 'seniorteacher', role: 'senior_teacher', code: 'sen', firstName: 'QA', lastName: 'SeniorTeacher', envPrefix: 'QA_SENIOR_TEACHER' },
  { key: 'teacher', role: 'regular_teacher', code: 'reg', firstName: 'QA', lastName: 'Teacher', envPrefix: 'QA_TEACHER' },
  { key: 'parent', role: 'parent', code: 'par', firstName: 'QA', lastName: 'Parent', envPrefix: 'QA_PARENT' },
  { key: 'student', role: 'student', code: 'stu', firstName: 'QA', lastName: 'Student', envPrefix: 'QA_STUDENT' },
];

const alnum = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** A prefix of letters, digits and dots, as in "qa.bf": it becomes the start of every address. */
export const isValidEmailPrefix = (prefix) => typeof prefix === 'string' && /^[a-z0-9][a-z0-9.]{0,30}[a-z0-9]$/.test(prefix);

/** The accounts for a prefix: uid (letters and digits only, as the orphan-account script requires), email and env names. */
export function qaAccounts(prefix) {
  return ACCOUNT_KINDS.map((k) => ({
    ...k,
    uid: `qa${alnum(prefix)}${k.code}`,
    email: `${prefix}.${k.key}@demo.com`,
    name: `${k.firstName} ${k.lastName}`,
  }));
}

/** The academic year around a date: September 1 to July 31, named like "2026–2027". */
export function academicYearAround(todayISO) {
  const [y, m] = todayISO.split('-').map(Number);
  const start = m >= 9 ? y : y - 1;
  return { name: `${start}–${start + 1}`, startDate: `${start}-09-01`, endDate: `${start + 1}-07-31` };
}

/** Can this script change this institution? Returns the reasons it cannot. */
export function checkSetupTarget({ institutionId, confirmName, exists, storedName }) {
  const problems = checkTarget({ institutionId, confirmName, exists, storedName });
  if (exists && !SETUP_ALLOWED_NAMES.includes(storedName)) {
    problems.push(`"${storedName}" is not a QA institution this script may change (allowed: ${SETUP_ALLOWED_NAMES.join(', ')}).`);
  }
  return problems;
}

export { SYSTEM_INSTITUTION_IDS };

/**
 * What of spec 07's data is in the institution, and what else is in the way.
 *   snapshot: { years: [{id,name}], terms: [{id,name,academicYearId}], classes: [{id,name}], subjects: [{id,name}],
 *               slots: [{id,classId,subjectId}] }
 * Returns { remove: [{ path, label }], unexpected: [string] }. Only the documents named by SPEC07_NAMES (and the terms of that
 * year and the slots of that class or subject) are listed for removal; any other academic year or term stays and is
 * reported, because an academic-mode institution must have exactly the year this script makes.
 */
export function findLeftovers(snapshot, institutionId) {
  const base = `institutions/${institutionId}`;
  const remove = [];
  const unexpected = [];
  const years = snapshot.years.filter((y) => y.name === SPEC07_NAMES.year);
  const yearIds = new Set(years.map((y) => y.id));
  for (const y of years) remove.push({ path: `${base}/academicYears/${y.id}`, label: `academic year "${y.name}"` });
  const termIds = new Set();
  for (const t of snapshot.terms) {
    if (yearIds.has(t.academicYearId)) {
      termIds.add(t.id);
      remove.push({ path: `${base}/terms/${t.id}`, label: `term "${t.name}"` });
    }
  }
  const classes = snapshot.classes.filter((c) => c.name === SPEC07_NAMES.class);
  const subjects = snapshot.subjects.filter((s) => s.name === SPEC07_NAMES.subject);
  const classIds = new Set(classes.map((c) => c.id));
  const subjectIds = new Set(subjects.map((s) => s.id));
  for (const c of classes) remove.push({ path: `${base}/classes/${c.id}`, label: `class "${c.name}"` });
  for (const s of subjects) remove.push({ path: `${base}/subjects/${s.id}`, label: `subject "${s.name}"` });
  for (const slot of snapshot.slots) {
    if (classIds.has(slot.classId) || subjectIds.has(slot.subjectId) || termIds.has(slot.termId)) remove.push({ path: `${base}/timetable_slots/${slot.id}`, label: 'timetable slot' });
  }
  for (const y of snapshot.years) {
    if (y.id !== FIXED_IDS.year && y.name !== SPEC07_NAMES.year) unexpected.push(`academic year "${y.name}" (${y.id}) is not one this script made or removes`);
  }
  for (const t of snapshot.terms) {
    if (t.id !== FIXED_IDS.term && !yearIds.has(t.academicYearId) && t.academicYearId !== FIXED_IDS.year) {
      unexpected.push(`term "${t.name}" (${t.id}) belongs to another academic year`);
    }
  }
  return { remove, unexpected };
}

/**
 * The documents to write (all with fixed ids, so a second run changes nothing). `now` is a Date.
 * Returns { items: [{ path, data }], accounts, links }.
 */
export function buildQaPlan({ institutionId, prefix, departmentName, termName, todayISO, now }) {
  const base = `institutions/${institutionId}`;
  const year = academicYearAround(todayISO);
  const accounts = qaAccounts(prefix);
  const by = Object.fromEntries(accounts.map((a) => [a.key, a]));
  const person = (a, extra = {}) => ({
    uid: a.uid,
    firstName: a.firstName,
    lastName: a.lastName,
    name: a.name,
    email: a.email,
    phone: null,
    phone2: null,
    idNumber: null,
    role: a.role,
    institutionId,
    status: 'active',
    mustChangePassword: false,
    createdAt: now,
    createdBy: 'setup-qa-institution-script',
    ...extra,
  });
  const items = [
    {
      path: `${base}/academicYears/${FIXED_IDS.year}`,
      data: {
        institutionId,
        name: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        status: 'active',
        schoolWeekDays: SCHOOL_WEEK_DAYS,
        createdAt: now,
        confirmedAt: now.toISOString(),
        confirmedBy: by.admin.uid,
      },
    },
    {
      path: `${base}/terms/${FIXED_IDS.term}`,
      data: {
        institutionId,
        academicYearId: FIXED_IDS.year,
        termNumber: 1,
        name: termName,
        defaultName: termName,
        startDate: year.startDate,
        endDate: year.endDate,
        status: 'active',
      },
    },
    { path: `${base}/departments/${FIXED_IDS.department}`, data: { name: departmentName, institutionId, headTeacherId: by.seniorteacher.uid } },
    {
      path: `${base}/classes/${FIXED_IDS.class}`,
      data: {
        name: BASE_CLASS_NAME,
        capacity: 30,
        grade: 7,
        institutionId,
        termId: FIXED_IDS.term,
        supervisor: by.seniorteacher.name,
        classTeacherId: by.seniorteacher.uid,
        createdAt: now,
      },
    },
    { path: `users/${by.admin.uid}`, data: person(by.admin) },
    { path: `users/${by.seniorteacher.uid}`, data: person(by.seniorteacher, { departmentId: FIXED_IDS.department, assignedClassId: FIXED_IDS.class, assignedClassName: BASE_CLASS_NAME }) },
    { path: `users/${by.teacher.uid}`, data: person(by.teacher, { departmentId: FIXED_IDS.department }) },
    { path: `users/${by.parent.uid}`, data: person(by.parent) },
    {
      path: `users/${by.student.uid}`,
      data: person(by.student, { gender: 'Female', dateOfBirth: '2014-05-15', classId: FIXED_IDS.class, classIds: [FIXED_IDS.class] }),
    },
    {
      path: `student_parents/${by.parent.uid}_${by.student.uid}`,
      data: { parentId: by.parent.uid, studentId: by.student.uid, institutionId, relationship: 'guardian' },
    },
  ];
  return { items, accounts, year };
}

/** The institution document fields that make it an academic-mode institution. */
export const ACADEMIC_FIELDS = { calendarMode: 'academic_year' };

/** The .env.qa lines for the owner to paste (passwords are the generated ones, or a note when the account already existed). */
export function envLines({ institutionName, institutionId, prefix, departmentName, termName, issued }) {
  const lines = [
    `QA_INSTITUTION_NAME="${institutionName}"`,
    `QA_INSTITUTION_ID="${institutionId}"`,
    `QA_EMAIL_PREFIX="${prefix}"`,
  ];
  if (departmentName !== 'QA Department') lines.push(`QA_DEPARTMENT_NAME="${departmentName}"`);
  if (termName !== 'QA Term') lines.push(`QA_TERM_NAME="${termName}"`);
  for (const a of qaAccounts(prefix)) {
    lines.push(`${a.envPrefix}_EMAIL="${a.email}"`);
    const password = issued[a.key];
    lines.push(password ? `${a.envPrefix}_PASSWORD="${password}"` : `# ${a.envPrefix}_PASSWORD: the account already existed; its password is unchanged`);
  }
  return lines;
}

export const setupPhrase = (count, institutionId) => `SETUP ${count} ${institutionId}`;

/** The options of the command line, or the reason they are wrong. */
export function parseSetupArgs(argv) {
  const opts = {
    institutionId: null,
    confirmName: null,
    project: null,
    keyPath: null,
    emailPrefix: null,
    departmentName: 'QA Department',
    termName: 'QA Term',
    live: false,
    help: false,
  };
  for (const arg of argv) {
    const value = (flag) => arg.slice(flag.length);
    if (arg === '--live') opts.live = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--institution-id=')) opts.institutionId = value('--institution-id=');
    else if (arg.startsWith('--confirm-name=')) opts.confirmName = value('--confirm-name=');
    else if (arg.startsWith('--project=')) opts.project = value('--project=');
    else if (arg.startsWith('--key=')) opts.keyPath = value('--key=');
    else if (arg.startsWith('--email-prefix=')) opts.emailPrefix = value('--email-prefix=');
    else if (arg.startsWith('--department-name=')) opts.departmentName = value('--department-name=');
    else if (arg.startsWith('--term-name=')) opts.termName = value('--term-name=');
    else return { error: `Unrecognized argument: ${arg}` };
  }
  if (opts.help) return { opts };
  if (!opts.keyPath) return { error: '--key=<path to the service-account JSON> is required.' };
  if (!opts.project) return { error: '--project=<firebase project id> is required (it must equal the key’s project_id).' };
  if (!opts.institutionId) return { error: '--institution-id=<id> is required (find it with delete-real-institution.mjs --list-matches).' };
  if (!opts.confirmName) return { error: '--confirm-name="<exact name>" is required.' };
  if (!isValidEmailPrefix(opts.emailPrefix)) return { error: '--email-prefix=<prefix> is required: letters, digits and dots, such as qa.bf (it starts every QA address).' };
  if (!opts.departmentName.trim() || !opts.termName.trim()) return { error: '--department-name and --term-name must not be empty.' };
  return { opts };
}
