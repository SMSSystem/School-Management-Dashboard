// Pure plan for scripts/seed-demo-primary-school.mjs (no I/O, no Firebase imports, so it
// can be unit tested from src/lib/__tests__/seedDemoPrimary.test.ts).
//
// Everything here is a deterministic function of (institutionId, through): the same inputs
// always give the same people, ids, marks and attendance, so a later top-up to a new
// `through` date re-derives identical earlier records and only appends newer ones.
// Every item is { path, data } where `path` is a Firestore document path and timestamps are
// plain Date objects (the Admin SDK stores a Date as a Timestamp).

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

export const SCHOOL = {
  name: 'Blue Mountain Primary School',
  motto: 'Learning Together, Growing Together',
  phone: '+1-876-555-0140',
  address: '14 Hibiscus Drive, Kingston 6, Jamaica',
  location: 'Kingston, Jamaica',
  signatory: 'Mrs. L. Henry',
  emailDomain: 'bluemountainps.test',
};

export const CREATED_BY = 'seed-demo-primary-school-script';
export const STUDENT_COUNT = 250;
export const GRADES = [1, 2, 3, 4, 5, 6];
export const SECTIONS = ['A', 'B'];
export const SCHOOL_WEEK_DAYS = [1, 2, 3, 4, 5];

export const YEAR = { name: '2026–2027', startDate: '2026-09-01', endDate: '2027-07-31' };
// The Academic Calendar wizard's defaults for Christmas and Easter terms (first school Monday
// on or after 1 Sep and 6 Jan); the Summer Term ends in early July so the year closes in July.
export const TERMS = [
  { number: 1, name: 'Christmas Term', startDate: '2026-09-07', endDate: '2026-12-20' },
  { number: 2, name: 'Easter Term', startDate: '2027-01-11', endDate: '2027-04-04' },
  { number: 3, name: 'Summer Term', startDate: '2027-04-26', endDate: '2027-07-02' },
];

/** Gradebooks, assignments and lesson notes are generated for Term 1 only. */
export const CONTENT_TERM = TERMS[0];

// ─────────────────────────────────────────────────────────────────────────
// Deterministic randomness
// ─────────────────────────────────────────────────────────────────────────

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** A small seeded generator: rng('key')() gives the same sequence of floats in [0,1) every time. */
export function rng(seedString) {
  let a = xmur3(seedString);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const pad = (n, width) => String(n).padStart(width, '0');

// ─────────────────────────────────────────────────────────────────────────
// Dates
// ─────────────────────────────────────────────────────────────────────────

export const toISO = (d) => d.toISOString().slice(0, 10);
const at = (iso, time = '12:00:00') => new Date(`${iso}T${time}Z`);

export function addDays(iso, n) {
  const d = at(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export const dayOfWeek = (iso) => at(iso).getUTCDay();

function computeEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

function nthMonday(year, month, n) {
  const first = `${year}-${pad(month, 2)}-01`;
  const dow = dayOfWeek(first);
  const firstMonday = dow === 1 ? 1 : ((8 - dow) % 7) + 1;
  return `${year}-${pad(month, 2)}-${pad(firstMonday + (n - 1) * 7, 2)}`;
}

/** Mirrors src/lib/holidays.ts getJamaicanPublicHolidays (kept in step by a test). */
export function jamaicanPublicHolidays(year) {
  const easter = computeEaster(year);
  return [
    { name: "New Year's Day", date: `${year}-01-01` },
    { name: 'Ash Wednesday', date: addDays(easter, -46) },
    { name: 'Good Friday', date: addDays(easter, -2) },
    { name: 'Easter Monday', date: addDays(easter, 1) },
    { name: 'National Labour Day', date: `${year}-05-23` },
    { name: 'Emancipation Day', date: `${year}-08-01` },
    { name: 'Independence Day', date: `${year}-08-06` },
    { name: 'National Heroes Day', date: nthMonday(year, 10, 3) },
    { name: 'Christmas Day', date: `${year}-12-25` },
    { name: 'Boxing Day', date: `${year}-12-26` },
  ];
}

/** The public holidays that fall inside the academic year. */
export function yearHolidays() {
  return [...jamaicanPublicHolidays(2026), ...jamaicanPublicHolidays(2027)]
    .filter((h) => h.date >= YEAR.startDate && h.date <= YEAR.endDate)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function holidaySet() {
  return new Set(yearHolidays().map((h) => h.date));
}

/** Every instructional day (Mon-Fri, inside a term, not a public holiday) up to and including `through`. */
export function schoolDays(through) {
  const holidays = holidaySet();
  const days = [];
  for (const term of TERMS) {
    for (let d = term.startDate; d <= term.endDate && d <= through; d = addDays(d, 1)) {
      if (SCHOOL_WEEK_DAYS.includes(dayOfWeek(d)) && !holidays.has(d)) days.push(d);
    }
  }
  return days;
}

/** Instructional days in a whole date range (for the summaries' expected-session count). */
export function countSchoolDays(startISO, endISO) {
  const holidays = holidaySet();
  let n = 0;
  for (let d = startISO; d <= endISO; d = addDays(d, 1)) {
    if (SCHOOL_WEEK_DAYS.includes(dayOfWeek(d)) && !holidays.has(d)) n++;
  }
  return n;
}

function nextSchoolDay(iso) {
  const holidays = holidaySet();
  let d = iso;
  while (!SCHOOL_WEEK_DAYS.includes(dayOfWeek(d)) || holidays.has(d)) d = addDays(d, 1);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────
// Names
// ─────────────────────────────────────────────────────────────────────────

const GIRLS = [
  'Abigail', 'Aaliyah', 'Alicia', 'Amoya', 'Ashanti', 'Brianna', 'Chantelle', 'Chevelle', 'Danielle',
  'Dejah', 'Gabrielle', 'Hannah', 'Imani', 'Jada', 'Janelle', 'Jasmine', 'Kadejah', 'Kayla', 'Keisha',
  'Kimora', 'Latoya', 'Leah', 'Maya', 'Monique', 'Naomi', 'Nia', 'Rochelle', 'Sasha', 'Shaniel', 'Shania',
  'Tamara', 'Tanisha', 'Tiana', 'Yasmin', 'Zara', 'Anika', 'Daniella', 'Joelle', 'Marlene', 'Tiffany',
];
const BOYS = [
  'Aiden', 'Andre', 'Antonio', 'Brandon', 'Caleb', 'Damani', 'Daniel', 'Dominic', 'Elijah', 'Gabriel',
  'Isaiah', 'Jaheim', 'Jamal', 'Jayden', 'Joshua', 'Kemar', 'Kevaughn', 'Malik', 'Marcus', 'Matthew',
  'Nathaniel', 'Nicholas', 'Omar', 'Rashaun', 'Ricardo', 'Ryan', 'Samuel', 'Shane', 'Tyrique', 'Zion',
  'Adrian', 'Dwight', 'Javon', 'Kyle', 'Leon', 'Mikhail', 'Orlando', 'Peter', 'Romario', 'Tristan',
];
const SURNAMES = [
  'Brown', 'Campbell', 'Clarke', 'Williams', 'Thompson', 'Reid', 'Morgan', 'Francis', 'Gordon', 'Henry',
  'Wright', 'Lewis', 'Bailey', 'Edwards', 'Grant', 'Johnson', 'Mitchell', 'Walker', 'Simpson', 'McKenzie',
  'Foster', 'Palmer', 'Powell', 'Samuels', 'Stewart', 'Barrett', 'Blake', 'Bennett', 'Chambers', 'Dixon',
  'Ellis', 'Fraser', 'Gayle', 'Hamilton', 'Jackson', 'Knight', 'Lawrence', 'Malcolm', 'Nelson', 'Ormsby',
  'Patterson', 'Richards', 'Sinclair', 'Tomlinson', 'Vassell', 'Watson', 'Whyte', 'Wilson', 'Anderson',
  'Spencer', 'Rowe', 'Facey', 'Dacres', 'Pinnock', 'Salmon', 'Folkes', 'Haughton', 'Daley', 'Lindo', 'Beckford',
];

// ─────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────

// Alphanumeric ids only (the orphan-account script's --uid check allows nothing else); the
// same id is the Firestore users/{id} document id and, for the few accounts that can sign in,
// the Firebase Auth uid.
const uidFor = (code, n) => `bmps${code}${pad(n, 3)}`;

const phoneFor = (r) => `+1-876-${pick(r, ['555', '555', '555'])}-${pad(Math.floor(r() * 9000) + 1000, 4)}`;

function person({ role, code, n, firstName, lastName, gender, r, emailTag }) {
  const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '');
  return {
    uid: uidFor(code, n),
    role,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    gender,
    email: `${slug}.${emailTag ?? pad(n, 3)}@${SCHOOL.emailDomain}`,
    phone: phoneFor(r),
  };
}

/** The accounts that can really sign in (the rest are records only). */
export const LOGIN_UIDS = [
  uidFor('adm', 1),
  uidFor('spe', 1),
  uidFor('sen', 1),
  uidFor('reg', 1),
  uidFor('par', 1),
  uidFor('stu', 1),
];

const DEPARTMENTS = [
  { key: 'lit', name: 'Language & Literacy' },
  { key: 'math', name: 'Mathematics' },
  { key: 'sci', name: 'Science & Humanities' },
  { key: 'arts', name: 'Arts & Physical Education' },
];

const SENIOR_DEPT = ['lit', 'math', 'sci', 'arts', 'lit', 'math'];
const REGULAR_DEPT = ['lit', 'lit', 'lit', 'math', 'math', 'math', 'sci', 'sci', 'sci', 'arts'];

const SENIOR_NAMES = [
  ['Marcia', 'Fraser'], ['Sandra', 'Whyte'], ['Paulette', 'Clarke'], ['Donovan', 'Reid'], ['Yvonne', 'Powell'], ['Winston', 'Barrett'],
];
const REGULAR_NAMES = [
  ['Andrea', 'Grant'], ['Kerry-Ann', 'Johnson'], ['Michael', 'Dixon'], ['Camille', 'Edwards'], ['Trevor', 'Lewis'],
  ['Natalie', 'Walker'], ['Orville', 'Bennett'], ['Shereen', 'Foster'], ['Gareth', 'Morgan'], ['Lorraine', 'Palmer'],
];

/**
 * The whole roster: 1 admin, 1 spectator, 6 senior teachers (one homeroom each, class A of
 * grades 1-6), 10 regular teachers, 250 students in family clusters, and their parents.
 * Student/parent ids are numbered in the order generated; family 1's first parent and
 * first child are the demo parent and demo student.
 */
export function buildPeople() {
  const r0 = rng('people');
  const admin = person({ role: 'institution_admin', code: 'adm', n: 1, firstName: 'Beverley', lastName: 'Henry', gender: 'Female', r: r0 });
  const spectator = {
    ...person({ role: 'spectator', code: 'spe', n: 1, firstName: 'Demo', lastName: 'Spectator', gender: 'Female', r: r0 }),
    email: `spectator@${SCHOOL.emailDomain}`,
  };

  const seniors = SENIOR_NAMES.map(([f, l], i) => ({
    ...person({ role: 'senior_teacher', code: 'sen', n: i + 1, firstName: f, lastName: l, gender: i % 2 ? 'Male' : 'Female', r: r0 }),
    departmentKey: SENIOR_DEPT[i],
    homeroomGrade: GRADES[i],
  }));
  const regulars = REGULAR_NAMES.map(([f, l], i) => ({
    ...person({ role: 'regular_teacher', code: 'reg', n: i + 1, firstName: f, lastName: l, gender: i % 3 === 1 ? 'Male' : 'Female', r: r0 }),
    departmentKey: REGULAR_DEPT[i],
  }));

  const r = rng('families');
  const usedNames = new Set(['Beverley Henry']);
  const students = [];
  const parents = [];
  const links = [];
  let familyNo = 0;

  while (students.length < STUDENT_COUNT) {
    familyNo++;
    const u = r();
    let size = u < 0.5 ? 1 : u < 0.88 ? 2 : 3;
    size = Math.min(size, STUDENT_COUNT - students.length);
    const lastName = pick(r, SURNAMES);

    // Siblings are in different grades.
    const grades = [];
    while (grades.length < size) {
      const g = pick(r, GRADES);
      if (!grades.includes(g)) grades.push(g);
    }

    const familyStudents = grades.map((grade) => {
      let firstName;
      let gender;
      let key;
      do {
        gender = r() < 0.5 ? 'Female' : 'Male';
        firstName = pick(r, gender === 'Female' ? GIRLS : BOYS);
        key = `${firstName} ${lastName}`;
      } while (usedNames.has(key));
      usedNames.add(key);
      const n = students.length + 1;
      const birthYear = 2026 - (grade + 5) - (r() < 0.25 ? 1 : 0);
      const student = {
        ...person({ role: 'student', code: 'stu', n, firstName, lastName, gender, r }),
        grade,
        dateOfBirth: `${birthYear}-${pad(Math.floor(r() * 12) + 1, 2)}-${pad(Math.floor(r() * 28) + 1, 2)}`,
        institutionStudentId: `BM-${pad(n, 4)}`,
      };
      students.push(student);
      return student;
    });

    const twoParents = r() < 0.35;
    const parentSpecs = twoParents
      ? [['Female', 'mother'], ['Male', 'father']]
      : [[r() < 0.8 ? 'Female' : 'Male', null]];
    for (const [gender, rel] of parentSpecs) {
      let firstName;
      let key;
      do {
        firstName = pick(r, gender === 'Female' ? GIRLS : BOYS);
        key = `${firstName} ${lastName}`;
      } while (usedNames.has(key));
      usedNames.add(key);
      const n = parents.length + 1;
      const parent = person({ role: 'parent', code: 'par', n, firstName, lastName, gender, r });
      parents.push(parent);
      for (const s of familyStudents) {
        links.push({ parentUid: parent.uid, studentUid: s.uid, relationship: rel ?? (gender === 'Female' ? 'mother' : 'father') });
      }
    }
  }

  // Class and house placement: within each grade, alternate A / B; houses round-robin overall.
  const classCounters = new Map();
  students.forEach((s, i) => {
    const seen = classCounters.get(s.grade) ?? 0;
    classCounters.set(s.grade, seen + 1);
    s.section = SECTIONS[seen % 2];
    s.classId = classId(s.grade, s.section);
    s.houseKey = HOUSES[i % HOUSES.length].key;
  });

  return { admin, spectator, seniors, regulars, students, parents, links, familyCount: familyNo };
}

// ─────────────────────────────────────────────────────────────────────────
// Reference data: houses, departments, classes, subjects, timetable
// ─────────────────────────────────────────────────────────────────────────

export const HOUSES = [
  { key: 'nanny', name: 'Nanny House', description: 'Named for National Hero Queen Nanny of the Maroons.' },
  { key: 'bogle', name: 'Bogle House', description: 'Named for National Hero Paul Bogle.' },
  { key: 'garvey', name: 'Garvey House', description: 'Named for National Hero Marcus Garvey.' },
  { key: 'gordon', name: 'Gordon House', description: 'Named for National Hero George William Gordon.' },
];

export const classId = (grade, section) => `class_g${grade}${section}`;
export const className = (grade, section) => `Grade ${grade}${section}`;
const deptId = (key) => `dept_${key}`;
const houseId = (key) => `house_${key}`;

export const CLASSES = GRADES.flatMap((grade) =>
  SECTIONS.map((section) => ({ id: classId(grade, section), grade, section, name: className(grade, section) })),
);

// Teachers are referenced by roster key: 'S1'..'S6' (senior), 'R1'..'R10' (regular).
export const SUBJECTS = [
  { name: 'Language Arts', dept: 'lit', days: [1, 3, 5], time: '08:30', teachers: ['R1', 'R2', 'R3'], minGrade: 1 },
  { name: 'Mathematics', dept: 'math', days: [1, 2, 4], time: '09:20', teachers: ['R4', 'R5', 'R6'], minGrade: 1 },
  { name: 'Science', dept: 'sci', days: [2, 4], time: '10:30', teachers: ['R7', 'R8'], assistant: 'R8', minGrade: 1 },
  { name: 'Social Studies', dept: 'sci', days: [3], time: '11:20', teachers: ['R9', 'R2'], minGrade: 1 },
  { name: 'Religious Education', dept: 'sci', days: [1], time: '12:30', teachers: ['R9'], minGrade: 1 },
  { name: 'Physical Education', dept: 'arts', days: [5], time: '13:20', teachers: ['R10'], minGrade: 1 },
  { name: 'Art & Craft', dept: 'arts', days: [2], time: '13:20', teachers: ['R3'], minGrade: 1 },
  { name: 'Music', dept: 'arts', days: [4], time: '13:20', teachers: ['R5'], minGrade: 1 },
  { name: 'Spanish', dept: 'lit', days: [3], time: '13:20', teachers: ['R1'], minGrade: 4 },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const subjectId = (name) => `subject_${slug(name)}`;

const DAY_KEY = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' };

/** teacher key -> person */
function teacherIndex(people) {
  const map = new Map();
  people.seniors.forEach((t, i) => map.set(`S${i + 1}`, t));
  people.regulars.forEach((t, i) => map.set(`R${i + 1}`, t));
  return map;
}

export function buildSubjects(people) {
  const byKey = teacherIndex(people);
  return SUBJECTS.map((s) => {
    const teachers = s.teachers.map((k) => byKey.get(k));
    const classes = CLASSES.filter((c) => c.grade >= s.minGrade);
    const assistant = s.assistant ? byKey.get(s.assistant) : null;
    return {
      ...s,
      id: subjectId(s.name),
      teachers,
      assistant,
      classes,
      wholeSchool: s.minGrade === 1,
    };
  });
}

/** The teacher who takes a subject for a class (spread over the subject's teachers). */
export function teacherForClass(subject, cls) {
  const idx = CLASSES.findIndex((c) => c.id === cls.id);
  return subject.teachers[idx % subject.teachers.length];
}

/** The homeroom teacher (class supervisor) of a class: S{grade} for A, R{grade} for B. */
export function supervisorOf(people, cls) {
  return cls.section === 'A' ? people.seniors[cls.grade - 1] : people.regulars[cls.grade - 1];
}

// ─────────────────────────────────────────────────────────────────────────
// The plan
// ─────────────────────────────────────────────────────────────────────────

const inst = (institutionId, ...parts) => `institutions/${institutionId}/${parts.join('/')}`;

function userData(p, institutionId) {
  return {
    uid: p.uid,
    firstName: p.firstName,
    lastName: p.lastName,
    name: p.name,
    email: p.email,
    phone: p.phone,
    phone2: null,
    idNumber: null,
    role: p.role,
    institutionId,
    status: 'active',
    // false for everyone: the people who cannot sign in should not show as "awaiting first sign-in".
    mustChangePassword: false,
    createdAt: at('2026-08-24', '14:00:00'),
    createdBy: CREATED_BY,
  };
}

/** All the one-off documents: written once, never changed by a top-up. */
export function buildStaticPlan(institutionId, todayISO) {
  const people = buildPeople();
  const subjects = buildSubjects(people);
  const items = [];
  const add = (path, data) => items.push({ path, data });
  const created = at('2026-08-24', '14:00:00');

  add(`institutions/${institutionId}`, {
    name: SCHOOL.name,
    institutionId,
    createdAt: created,
    status: 'active',
    calendarMode: 'academic_year',
    gradingSystem: 'flat',
    gradeTrackingFrequency: 'monthly',
    location: SCHOOL.location,
    motto: SCHOOL.motto,
    phone: SCHOOL.phone,
    email: `info@${SCHOOL.emailDomain}`,
    address: SCHOOL.address,
    logoUrl: null,
    authorizedSignature: { mode: 'text', text: SCHOOL.signatory },
    classSupervisorLabel: 'Class Teacher',
    gradeSupervisorLabel: 'Grade Coordinator',
    principalLabel: 'Principal',
    vicePrincipalLabel: 'Vice Principal',
    profileComplete: true,
  });
  add(`registration_directory/${institutionId}`, {
    name: SCHOOL.name,
    logoUrl: null,
    acceptingRegistrations: false,
    updatedAt: created,
    updatedBy: CREATED_BY,
  });

  const yearId = academicYearId(institutionId);
  add(inst(institutionId, 'academicYears', yearId), {
    institutionId,
    name: YEAR.name,
    startDate: YEAR.startDate,
    endDate: YEAR.endDate,
    status: 'active',
    schoolWeekDays: SCHOOL_WEEK_DAYS,
    createdAt: created,
    confirmedAt: '2026-08-24T14:00:00.000Z',
    confirmedBy: people.admin.uid,
  });
  for (const t of TERMS) {
    add(inst(institutionId, 'terms', termId(institutionId, t.number)), {
      institutionId,
      academicYearId: yearId,
      termNumber: t.number,
      name: t.name,
      defaultName: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      status: termStatus(t, todayISO),
    });
  }
  for (const h of yearHolidays()) {
    add(inst(institutionId, 'nonSchoolDays', `nsd_${h.date}`), {
      institutionId,
      academicYearId: yearId,
      type: 'single',
      date: h.date,
      reason: h.name,
      source: 'public_holiday',
      isActive: true,
      createdAt: created,
    });
  }

  for (const h of HOUSES) {
    add(inst(institutionId, 'houses', houseId(h.key)), {
      institutionId,
      name: h.name,
      description: h.description,
      createdAt: created,
      createdBy: CREATED_BY,
      updatedAt: created,
    });
  }
  const seniorsByDept = new Map();
  people.seniors.forEach((s) => {
    if (!seniorsByDept.has(s.departmentKey)) seniorsByDept.set(s.departmentKey, s);
  });
  for (const d of DEPARTMENTS) {
    add(inst(institutionId, 'departments', deptId(d.key)), {
      name: d.name,
      institutionId,
      headTeacherId: seniorsByDept.get(d.key).uid,
    });
  }

  for (const cls of CLASSES) {
    const sup = supervisorOf(people, cls);
    add(inst(institutionId, 'classes', cls.id), {
      name: cls.name,
      capacity: 30,
      grade: cls.grade,
      institutionId,
      termId: termId(institutionId, 1),
      supervisor: sup.name,
      classTeacherId: sup.uid,
      createdAt: created,
    });
  }

  for (const s of subjects) {
    const ids = s.teachers.map((t) => t.uid);
    add(inst(institutionId, 'subjects', s.id), {
      name: s.name,
      description: '',
      institutionId,
      classScope: s.wholeSchool ? 'institution' : 'class',
      classIds: s.wholeSchool ? [] : s.classes.map((c) => c.id),
      classNames: s.wholeSchool ? [] : s.classes.map((c) => c.name),
      teacherIds: ids,
      teacherNames: s.teachers.map((t) => t.name),
      ...(s.assistant ? { assistantTeacherId: s.assistant.uid, assistantTeacherName: s.assistant.name } : {}),
      cwWeight: 60,
      examWeight: 40,
      frequency: 'weekly',
      sessionDayOfWeek: s.days,
      createdAt: created,
      createdBy: CREATED_BY,
      updatedAt: created,
      updatedBy: CREATED_BY,
    });
    for (const cls of s.classes) {
      add(inst(institutionId, 'subjectEnrollments', `${s.id}_${cls.id}`), {
        institutionId,
        subjectId: s.id,
        subjectName: s.name,
        classId: cls.id,
        className: cls.name,
        enrollmentType: 'all',
        excludedStudentIds: [],
        excludedStudentNames: [],
        updatedAt: created,
        updatedBy: CREATED_BY,
      });
      const teacher = teacherForClass(s, cls);
      add(inst(institutionId, 'timetable_slots', `slot_${s.id}_${cls.id}`), {
        institutionId,
        termId: termId(institutionId, 1),
        termName: TERMS[0].name,
        subjectId: s.id,
        subjectName: s.name,
        classId: cls.id,
        className: cls.name,
        teacherId: teacher.uid,
        teacherName: teacher.name,
        days: s.days.map((d) => DAY_KEY[d]),
        startTime: s.time,
        duration: 45,
        createdBy: people.admin.uid,
        createdByRole: 'institution_admin',
        createdAt: created,
      });
    }
  }

  // People.
  const houseByKey = new Map(HOUSES.map((h) => [h.key, h]));
  add(`users/${people.admin.uid}`, userData(people.admin, institutionId));
  add(`users/${people.spectator.uid}`, userData(people.spectator, institutionId));
  const deptKeyId = (key) => deptId(key);
  people.seniors.forEach((t, i) => {
    add(`users/${t.uid}`, {
      ...userData(t, institutionId),
      departmentId: deptKeyId(t.departmentKey),
      assignedClassId: classId(t.homeroomGrade, 'A'),
      assignedClassName: className(t.homeroomGrade, 'A'),
      homeroomRoom: `Room ${i + 1}`,
      homeroomBuilding: null,
    });
  });
  people.regulars.forEach((t) => {
    add(`users/${t.uid}`, { ...userData(t, institutionId), departmentId: deptKeyId(t.departmentKey) });
  });
  for (const s of people.students) {
    const house = houseByKey.get(s.houseKey);
    add(`users/${s.uid}`, {
      ...userData(s, institutionId),
      dateOfBirth: s.dateOfBirth,
      institutionStudentId: s.institutionStudentId,
      gender: s.gender,
      classId: s.classId,
      houseId: houseId(s.houseKey),
      houseName: house.name,
    });
  }
  for (const p of people.parents) add(`users/${p.uid}`, userData(p, institutionId));
  for (const l of people.links) {
    add(`student_parents/${l.parentUid}_${l.studentUid}`, {
      parentId: l.parentUid,
      studentId: l.studentUid,
      institutionId,
      relationship: l.relationship,
    });
  }

  // Gradebooks (Term 1): structure only; the marks are dated records below.
  for (const s of subjects) {
    for (const cls of s.classes) {
      const gbId = gradebookId(cls.id, s.id, institutionId);
      add(inst(institutionId, 'gradebooks', gbId), {
        classId: cls.id,
        subjectId: s.id,
        termId: termId(institutionId, 1),
        institutionId,
        createdAt: created,
        createdBy: CREATED_BY,
      });
      GRADEBOOK_COLUMNS.forEach((col, i) => {
        add(inst(institutionId, 'gradebooks', gbId, 'columns', col.id), {
          label: col.label,
          assessmentType: col.assessmentType,
          maxScore: col.maxScore,
          columnWeight: col.columnWeight,
          order: i + 1,
          date: col.date,
          institutionId,
          subjectId: s.id,
          createdBy: CREATED_BY,
          createdAt: created,
        });
      });
    }
  }

  return { people, subjects, items };
}

export const academicYearId = (institutionId) => `${institutionId}_${YEAR.name}`;
export const termId = (institutionId, n) => `${academicYearId(institutionId)}_${n}`;
export const gradebookId = (clsId, subjId, institutionId) => `${clsId}_${subjId}_${termId(institutionId, 1)}`;

// Coursework 60% (15 + 20 + 25), exam 40%: matches the subjects' cwWeight/examWeight.
export const GRADEBOOK_COLUMNS = [
  { id: 'col1', label: 'Homework 1', assessmentType: 'coursework', maxScore: 20, columnWeight: 15, date: '2026-09-25' },
  { id: 'col2', label: 'Quiz 1', assessmentType: 'coursework', maxScore: 20, columnWeight: 20, date: '2026-10-09' },
  { id: 'col3', label: 'Class Test', assessmentType: 'coursework', maxScore: 30, columnWeight: 25, date: '2026-11-13' },
  { id: 'col4', label: 'Term Exam', assessmentType: 'exam', maxScore: 100, columnWeight: 40, date: '2026-12-09' },
];

// ─────────────────────────────────────────────────────────────────────────
// Dated records (each list is sorted by date, so a top-up only appends)
// ─────────────────────────────────────────────────────────────────────────

const EXCUSED_REASONS = ['Medical appointment', 'Family emergency', 'Religious observance', 'Sick at home'];

function profileFor(uid) {
  const u = rng(`profile|${uid}`)();
  if (u < 0.7) return { a: 0.02, l: 0.02, e: 0.01 };
  if (u < 0.92) return { a: 0.05, l: 0.05, e: 0.02 };
  return { a: 0.12, l: 0.08, e: 0.04 };
}

function draw(profile, r, scale = 1) {
  const u = r();
  if (u < profile.a * scale) return 'A';
  if (u < (profile.a + profile.l) * scale) return 'L';
  if (u < (profile.a + profile.l + profile.e) * scale) return 'E';
  return 'P';
}

function record(student, state, r) {
  return {
    state,
    studentName: student.name,
    ...(state === 'E' ? { reason: pick(r, EXCUSED_REASONS) } : {}),
  };
}

/** The AM and PM registers of one class on one day: a PM absence usually repeats the AM one. */
export function generalRegisters(students, clsId, date) {
  const am = {};
  const pm = {};
  const r = rng(`general|${clsId}|${date}`);
  for (const s of students) {
    const profile = profileFor(s.uid);
    const amState = draw(profile, r);
    let pmState = draw(profile, r, 1.1);
    if ((amState === 'A' || amState === 'E') && r() < 0.85) pmState = amState;
    am[s.uid] = record(s, amState, r);
    pm[s.uid] = record(s, pmState, r);
  }
  return { AM: am, PM: pm };
}

export function subjectRegister(students, subjId, clsId, date) {
  const r = rng(`subject|${subjId}|${clsId}|${date}`);
  const records = {};
  for (const s of students) records[s.uid] = record(s, draw(profileFor(s.uid), r, 0.8), r);
  return records;
}

function studentsByClass(people) {
  const map = new Map(CLASSES.map((c) => [c.id, []]));
  for (const s of people.students) map.get(s.classId).push(s);
  return map;
}

export function buildGeneralAttendance(institutionId, people, through) {
  const byClass = studentsByClass(people);
  const items = [];
  for (const date of schoolDays(through)) {
    for (const cls of CLASSES) {
      const regs = generalRegisters(byClass.get(cls.id), cls.id, date);
      const sup = supervisorOf(people, cls);
      const termNo = TERMS.find((t) => date >= t.startDate && date <= t.endDate).number;
      for (const session of ['AM', 'PM']) {
        items.push({
          path: inst(institutionId, 'generalAttendance', `ga_${cls.id}_${date}_${session}`),
          data: {
            institutionId,
            classId: cls.id,
            className: cls.name,
            termId: termId(institutionId, termNo),
            academicYearId: academicYearId(institutionId),
            date,
            session,
            records: regs[session],
            submittedBy: sup.uid,
            submittedAt: at(date, session === 'AM' ? '13:30:00' : '18:00:00'),
            createdAt: at(date, session === 'AM' ? '13:30:00' : '18:00:00'),
            updatedAt: at(date, session === 'AM' ? '13:30:00' : '18:00:00'),
          },
        });
      }
    }
  }
  return items;
}

export function buildSubjectAttendance(institutionId, people, subjects, through) {
  const byClass = studentsByClass(people);
  const items = [];
  for (const date of schoolDays(through)) {
    const dow = dayOfWeek(date);
    const termNo = TERMS.find((t) => date >= t.startDate && date <= t.endDate).number;
    for (const s of subjects) {
      if (!s.days.includes(dow)) continue;
      for (const cls of s.classes) {
        const teacher = teacherForClass(s, cls);
        items.push({
          path: inst(institutionId, 'subjectAttendance', `sa_${s.id}_${cls.id}_${date}`),
          data: {
            institutionId,
            subjectId: s.id,
            subjectName: s.name,
            classId: cls.id,
            className: cls.name,
            sessionDate: date,
            teacherId: teacher.uid,
            termId: termId(institutionId, termNo),
            academicYearId: academicYearId(institutionId),
            records: subjectRegister(byClass.get(cls.id), s.id, cls.id, date),
            submittedBy: teacher.uid,
            submittedAt: at(date, '17:00:00'),
            createdAt: at(date, '17:00:00'),
            updatedAt: at(date, '17:00:00'),
          },
        });
      }
    }
  }
  return items;
}

/** One summary per student for Term 1, from the attendance up to `through`, with the app's own formula. */
export function buildAttendanceSummaries(institutionId, people, through) {
  const byClass = studentsByClass(people);
  const counts = new Map(people.students.map((s) => [s.uid, { P: 0, A: 0, L: 0, S: 0, E: 0, B: 0 }]));
  for (const date of schoolDays(contentThrough(through))) {
    for (const cls of CLASSES) {
      const regs = generalRegisters(byClass.get(cls.id), cls.id, date);
      for (const session of ['AM', 'PM']) {
        for (const [uid, rec] of Object.entries(regs[session])) counts.get(uid)[rec.state]++;
      }
    }
  }
  // Same denominator as src/lib/attendanceSummaryUtils.ts: the whole term, not just the days so far.
  const classExpected = countSchoolDays(CONTENT_TERM.startDate, CONTENT_TERM.endDate) * 2;
  return people.students.map((s) => {
    const c = counts.get(s.uid);
    const totalExpectedSessions = Math.max(0, classExpected - c.B);
    const attendanceRate = totalExpectedSessions > 0 ? ((c.P + c.L) / totalExpectedSessions) * 100 : 0;
    return {
      path: inst(institutionId, 'attendanceSummaries', `${s.uid}_${termId(institutionId, 1)}`),
      data: {
        studentId: s.uid,
        termId: termId(institutionId, 1),
        academicYearId: academicYearId(institutionId),
        institutionId,
        classId: s.classId,
        ...c,
        totalExpectedSessions,
        filledSessions: c.P + c.A + c.L + c.S + c.E + c.B,
        sessionsAbsent: c.A + c.S + c.E,
        daysLate: c.L,
        attendanceRate,
        updatedAt: at(through, '19:00:00'),
      },
    };
  });
}

const ASSIGNMENT_TITLES = {
  'Language Arts': ['Reading Comprehension: Market Day', 'Spelling Words Practice', 'Paragraph Writing: My Community', 'Book Report'],
  Mathematics: ['Number Facts Practice', 'Word Problems Worksheet', 'Fractions Activity', 'Measurement in the Classroom'],
  Science: ['Plant Observation Journal', 'Weather Watch Log', 'Simple Machines Project', 'Healthy Living Poster'],
  'Social Studies': ['Our Community Helpers', 'Map of Jamaica Activity', 'National Symbols Project', 'Jamaican Heritage Presentation'],
  'Religious Education': ['Values and Virtues Reflection', 'Stories of Kindness', 'Thankfulness Journal', 'Our School Pledge'],
  'Physical Education': ['Active Play Log', 'Fitness Journal', 'Team Game Rules Summary', 'Healthy Habits Plan'],
  'Art & Craft': ['Colour Wheel Collage', 'Landscape Drawing: The Blue Mountains', 'Recycled Materials Craft', 'Self-Portrait'],
  Music: ['Rhythm Patterns Practice', 'Learn a Folk Song', 'Instruments of Jamaica Poster', 'Listening Journal'],
  Spanish: ['Los Colores', 'Los Números 1-20', 'Saludos y Despedidas', 'La Familia'],
};
const ASSIGNMENT_TYPES = ['homework', 'project', 'in_class_activity', 'report'];

/** Four Term 1 assignments per subject and class, posted every three weeks from 14 Sep. */
export function buildAssignments(institutionId, subjects, through) {
  const items = [];
  subjects.forEach((s) => {
    s.classes.forEach((cls) => {
      const classIdx = CLASSES.findIndex((c) => c.id === cls.id);
      const teacher = teacherForClass(s, cls);
      for (let k = 0; k < 4; k++) {
        const created = nextSchoolDay(addDays('2026-09-14', 21 * k + (classIdx % 5)));
        if (created > through || created > CONTENT_TERM.endDate) continue;
        const due = nextSchoolDay(addDays(created, 10));
        const title = ASSIGNMENT_TITLES[s.name][k];
        const rubricKey = cls.grade >= 4 ? RUBRIC_BY_TITLE[title] : undefined;
        items.push({
          date: created,
          path: inst(institutionId, 'assignments', `asg_${s.id}_${cls.id}_${k + 1}`),
          data: {
            institutionId,
            termId: termId(institutionId, 1),
            termName: CONTENT_TERM.name,
            subjectId: s.id,
            subjectName: s.name,
            classId: cls.id,
            className: cls.name,
            teacherId: teacher.uid,
            teacherName: teacher.name,
            departmentId: deptId(s.dept),
            dueDate: due,
            description: `${title} for ${cls.name}. Complete it neatly and hand it in by the due date.`,
            createdBy: teacher.uid,
            createdByRole: 'regular_teacher',
            createdAt: at(created, '13:00:00'),
            title,
            type: ASSIGNMENT_TYPES[k % ASSIGNMENT_TYPES.length],
            status: 'published',
            teacherRole: 'regular_teacher',
            dueDateTimestamp: at(due, '04:59:00'),
            gradingMode: 'standalone',
            ...(rubricKey ? { rubricId: rubricDocId(rubricKey) } : {}),
          },
        });
      }
    });
  });
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.path < b.path ? -1 : 1));
  return items.map(({ path, data }) => ({ path, data }));
}

const NOTE_SUBJECTS = ['Language Arts', 'Mathematics', 'Science', 'Social Studies'];
const NOTE_TOPICS = {
  'Language Arts': ['Phonics Review and Blends', 'Reading Short Stories', 'Nouns and Verbs', 'Spelling Patterns', 'Descriptive Writing', 'Reading Comprehension Skills', 'Punctuation and Capital Letters', 'Story Retelling', 'Poetry and Rhythm', 'Letter Writing', 'Vocabulary Building', 'Revision'],
  Mathematics: ['Place Value and Counting', 'Addition Strategies', 'Subtraction Strategies', 'Number Patterns', 'Introduction to Multiplication', 'Shapes and Geometry', 'Measurement: Length', 'Telling Time', 'Fractions Basics', 'Money and Problem Solving', 'Data and Graphs', 'Revision'],
  Science: ['Living and Non-Living Things', 'Parts of a Plant', 'Animals and Their Habitats', 'The Human Body', 'Our Five Senses', 'Weather and Seasons', 'The Water Cycle', 'Materials and Their Uses', 'Light and Shadows', 'Forces and Motion', 'Healthy Eating', 'Revision'],
  'Social Studies': ['Our School Community', 'Family and Home', 'Community Helpers', 'Where We Live: A Parish Map', 'National Symbols', 'Our Jamaican Heritage', 'Transport and Communication', 'Caring for the Environment', 'Jamaican Food and Culture', 'Rights and Responsibilities', 'Our National Heroes', 'Revision'],
};

/** A weekly note per class for the four core subjects, dated the first school day of each Term 1 week. */
export function buildLessonNotes(institutionId, subjects, through) {
  const items = [];
  const holidays = holidaySet();
  for (let week = 1; ; week++) {
    const monday = addDays(CONTENT_TERM.startDate, (week - 1) * 7);
    if (monday > CONTENT_TERM.endDate) break;
    let day = monday;
    while (holidays.has(day)) day = addDays(day, 1);
    if (day > through) break;
    for (const s of subjects.filter((x) => NOTE_SUBJECTS.includes(x.name))) {
      const topics = NOTE_TOPICS[s.name];
      const topic = topics[Math.min(week - 1, topics.length - 1)];
      for (const cls of s.classes) {
        const teacher = teacherForClass(s, cls);
        items.push({
          path: inst(institutionId, 'lessonNotes', `ln_${s.id}_${cls.id}_w${pad(week, 2)}`),
          data: {
            institutionId,
            name: `Week ${week}: ${topic}`,
            classId: cls.id,
            className: cls.name,
            subjectId: s.id,
            subjectName: s.name,
            teacherId: teacher.uid,
            teacherName: teacher.name,
            teacherRole: 'regular_teacher',
            departmentId: deptId(s.dept),
            hasAttachment: false,
            resourceLinks: [],
            createdBy: teacher.uid,
            createdByRole: 'regular_teacher',
            createdAt: at(day, '12:30:00'),
            updatedAt: at(day, '12:30:00'),
          },
        });
      }
    }
  }
  return items;
}

function abilityFor(uid) {
  return 0.5 + rng(`ability|${uid}`)() * 0.42; // 0.50 - 0.92
}

/** The mark a student gets in one gradebook column (the single source for results, report cards and progress reports). */
export function gradebookScore(uid, subjId, col) {
  const r = rng(`result|${uid}|${subjId}|${col.id}`);
  const pct = Math.min(1, Math.max(0.2, abilityFor(uid) + (r() - 0.5) * 0.3));
  return Math.round(col.maxScore * pct);
}

/** One result per student for every gradebook column whose date has arrived. */
export function buildResults(institutionId, people, subjects, through) {
  const byClass = studentsByClass(people);
  const items = [];
  for (const col of GRADEBOOK_COLUMNS) {
    if (col.date > through) continue;
    for (const s of subjects) {
      for (const cls of s.classes) {
        const teacher = teacherForClass(s, cls);
        for (const stu of byClass.get(cls.id)) {
          items.push({
            date: col.date,
            path: inst(institutionId, 'results', `res_${stu.uid}_${s.id}_${col.id}`),
            data: {
              studentId: stu.uid,
              studentName: stu.name,
              teacherId: teacher.uid,
              teacherName: teacher.name,
              classId: cls.id,
              className: cls.name,
              termId: termId(institutionId, 1),
              institutionId,
              departmentId: deptId(s.dept),
              subjectId: s.id,
              assessmentName: col.id,
              assessmentType: col.assessmentType,
              score: gradebookScore(stu.uid, s.id, col),
              maxScore: col.maxScore,
              weight: col.columnWeight,
              date: col.date,
              gradebookColumnId: col.id,
              columnWeight: col.columnWeight,
              source: 'gradebook',
              createdAt: at(col.date, '19:00:00'),
            },
          });
        }
      }
    }
  }
  return items.map(({ path, data }) => ({ path, data }));
}

/** The dated phases in write order; each list only ever grows at its end as `through` moves later. */
export const DATED_PHASES = [
  'generalAttendance',
  'subjectAttendance',
  'assignments',
  'lessonNotes',
  'results',
  'disciplinaryActions',
  'manualResults',
  'progressReports',
  'rubricLinks',
];

export function buildDatedPlan(institutionId, people, subjects, through) {
  return {
    generalAttendance: buildGeneralAttendance(institutionId, people, through),
    subjectAttendance: buildSubjectAttendance(institutionId, people, subjects, through),
    assignments: buildAssignments(institutionId, subjects, through),
    lessonNotes: buildLessonNotes(institutionId, subjects, through),
    results: buildResults(institutionId, people, subjects, through),
    disciplinaryActions: buildDisciplinary(institutionId, people, through),
    manualResults: buildManualResults(institutionId, people, subjects, through),
    progressReports: buildProgressReports(institutionId, people, subjects, through),
    rubricLinks: buildRubricLinks(institutionId, subjects, through),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Misc pure helpers for the script
// ─────────────────────────────────────────────────────────────────────────

/** The date to seed through: the requested one, never in the future, never past the last term. */
export function clampThrough(requested, todayISO) {
  const last = TERMS[TERMS.length - 1].endDate;
  let through = requested || todayISO;
  if (through > todayISO) through = todayISO;
  if (through > last) through = last;
  return through;
}

/** Content (assignments, notes, marks) exists for Term 1 only. */
export function contentThrough(through) {
  return through > CONTENT_TERM.endDate ? CONTENT_TERM.endDate : through;
}

/** A term's status from the dates alone, the way the Academic Calendar wizard derives it. */
export function termStatus(term, todayISO) {
  return term.endDate < todayISO ? 'completed' : term.startDate <= todayISO ? 'active' : 'upcoming';
}

/**
 * Whether the script may write this document path: inside the demo institution, or one of
 * its own top-level documents (a users/ or student_parents/ id starting "bmps", or the
 * registration_directory entry). Anything else is refused.
 */
export function isSafePath(p, institutionId) {
  if (typeof p !== 'string' || typeof institutionId !== 'string' || institutionId.length < 4) return false;
  if (p === `institutions/${institutionId}` || p === `registration_directory/${institutionId}`) return true;
  if (p.startsWith(`institutions/${institutionId}/`)) return true;
  return /^(users\/bmps[a-z]{3}\d{3}|student_parents\/bmpspar\d{3}_bmpsstu\d{3})$/.test(p);
}

/** Only the six demo sign-in accounts may have their Activity log cleared. */
export function isDemoLoginUid(uid) {
  return typeof uid === 'string' && LOGIN_UIDS.includes(uid);
}

export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return String(email);
  return email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
}

// ═════════════════════════════════════════════════════════════════════════
// Part 2: rubrics, report-card support data, discipline, manual-entry results,
// progress reports and report cards (the data behind Report Builder)
// ═════════════════════════════════════════════════════════════════════════

// Copied from src/lib/reportCardUtils.ts (a test keeps them in step).
export function letterGrade(score) {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 45) return 'D+';
  if (score >= 40) return 'D';
  if (score >= 30) return 'D-';
  return 'E';
}

export function gpaPoints(letter) {
  if (letter.startsWith('A')) return 4;
  if (letter.startsWith('B')) return 3;
  if (letter.startsWith('C')) return 2;
  if (letter.startsWith('D')) return 1;
  return 0;
}

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const classOf = (clsId) => CLASSES.find((c) => c.id === clsId);

/** The subjects a student takes: those whose classes include theirs. */
function subjectsOfStudent(subjects, student) {
  return subjects.filter((s) => s.classes.some((c) => c.id === student.classId));
}

/** The subject's lead teacher: the first one who is not the assistant (as lib/subjectTeachers.ts leadTeacher). */
function leadTeacherOf(subject) {
  return subject.teachers.find((t) => !subject.assistant || t.uid !== subject.assistant.uid) ?? subject.teachers[0];
}

// ─── Rubrics ──────────────────────────────────────────────────────────────

const RUBRIC_LEVELS = [
  { label: 'Excellent', points: 4, phrase: 'consistently strong, with little or no help' },
  { label: 'Good', points: 3, phrase: 'mostly strong, with a few small slips' },
  { label: 'Developing', points: 2, phrase: 'partly met; needs some prompting' },
  { label: 'Beginning', points: 1, phrase: 'not yet met; needs support' },
];

const RUBRIC_SPECS = [
  { key: 'paragraph', title: 'Paragraph Writing', description: 'For paragraph and short composition tasks in Language Arts.', criteria: ['Content and ideas', 'Organisation', 'Spelling and punctuation', 'Neatness and presentation'] },
  { key: 'oral', title: 'Oral Presentation', description: 'For talks, recitations and presentations to the class.', criteria: ['Voice and clarity', 'Content', 'Confidence', 'Use of visual aids'] },
  { key: 'science', title: 'Science Project', description: 'For observation journals, experiments and science projects.', criteria: ['Question and prediction', 'Observation and method', 'Results and conclusion', 'Presentation'] },
  { key: 'art', title: 'Art & Craft Project', description: 'For drawing, collage and craft work.', criteria: ['Creativity', 'Use of colour and materials', 'Effort', 'Neatness'] },
  { key: 'reading', title: 'Reading Response', description: 'For reading comprehension and book response tasks.', criteria: ['Understanding', 'Evidence from the text', 'Own opinion', 'Vocabulary'] },
  { key: 'group', title: 'Group Work', description: 'For tasks done in pairs or small groups.', criteria: ['Participation', 'Cooperation', 'Responsibility', 'Final product'] },
];

/** Which rubric an assignment gets, by its title (grades 4-6 only). */
export const RUBRIC_BY_TITLE = {
  'Reading Comprehension: Market Day': 'reading',
  'Book Report': 'reading',
  'Paragraph Writing: My Community': 'paragraph',
  'Plant Observation Journal': 'science',
  'Simple Machines Project': 'science',
  'Our Community Helpers': 'group',
  'National Symbols Project': 'group',
  'Jamaican Heritage Presentation': 'oral',
  'Colour Wheel Collage': 'art',
  'Landscape Drawing: The Blue Mountains': 'art',
};

export const rubricDocId = (key) => `rubric_${key}`;

export function buildRubrics(institutionId, people) {
  const creator = people.seniors[0];
  return RUBRIC_SPECS.map((spec) => ({
    path: inst(institutionId, 'rubrics', rubricDocId(spec.key)),
    data: {
      institutionId,
      title: spec.title,
      description: spec.description,
      criteria: spec.criteria.map((name, i) => ({
        id: `${spec.key}-c${i + 1}`,
        name,
        maxPoints: 4,
        levels: RUBRIC_LEVELS.map((l) => ({ label: l.label, points: l.points, description: `${name}: ${l.phrase}.` })),
      })),
      createdBy: creator.uid,
      createdByRole: 'senior_teacher',
      createdAt: at('2026-09-08', '14:00:00'),
    },
  }));
}

/** One-off patches: the already-written assignments that should carry a rubric (item mode "update"). */
export function buildRubricLinks(institutionId, subjects, through) {
  return buildAssignments(institutionId, subjects, through)
    .filter((i) => i.data.rubricId)
    .map((i) => ({ path: i.path, data: { rubricId: i.data.rubricId }, mode: 'update' }));
}

// ─── Feedback comments, report-card comments, activities, responsibilities ──

function subjectPct(uid, subjId) {
  return abilityFor(uid) + (rng(`subjnoise|${uid}|${subjId}`)() - 0.5) * 0.2;
}

// Comment numbers (1-based) into src/lib/commentKey.ts: only the positive ones that do not
// mention the exam, since no exam has been sat yet.
export function feedbackFor(student, subject) {
  const pct = subjectPct(student.uid, subject.id);
  const g = abilityFor(student.uid);
  const pG = 0.25 + g * 0.55;
  const u = rng(`conduct|${student.uid}|${subject.id}`)();
  const conductGrade = u < pG ? 'G' : u < pG + 0.28 ? 'S' : u < pG + 0.36 ? 'F' : 'U';
  const commentNumbers = pct >= 0.8 ? [1] : pct >= 0.68 ? [12] : pct >= 0.58 ? [4] : pct >= 0.5 ? [8] : [10, 20];
  return { conductGrade, commentNumbers };
}

const REPORT_CARD_COMMENT_POOLS = {
  classSupervisorComment: [
    'A pleasure to have in class this term, consistently engaged and respectful.',
    'Shows steady improvement and a positive attitude toward learning.',
    'Works well with classmates and is settling into the routine.',
    'A conscientious student who takes pride in their work.',
    'Participation in class discussions has grown this term.',
  ],
  gradeSupervisorComment: [
    'Meeting expectations for their grade level across most subjects.',
    'A well-rounded student who enjoys school activities.',
    'Encouraged to ask for extra help in weaker subject areas.',
    'Shows good time-management and organisation.',
  ],
  principalComment: [
    'Congratulations on a solid start to the year. Keep up the good work.',
    'A valued member of our school community.',
    "Encouraged to build on this term's progress.",
    'Thank you for your positive contribution to school life.',
  ],
  vicePrincipalComment: [
    'Overall conduct and effort so far have been commendable.',
    'A respectful and cooperative member of the school.',
    'Continued effort will lead to strong results.',
    'Well done so far; maintain this level of commitment.',
  ],
};

export function commentsFor(student) {
  const r = rng(`rcc|${student.uid}`);
  return Object.fromEntries(Object.entries(REPORT_CARD_COMMENT_POOLS).map(([k, pool]) => [k, pick(r, pool)]));
}

const ACTIVITY_NAMES = [
  'School Choir', 'Netball', 'Football', 'Cricket', 'Track and Field', 'Drama Club',
  'Chess Club', 'Art Club', 'Spelling Bee Club', '4-H Club', 'Environmental Club', 'Dance Troupe',
];
const RESPONSIBILITY_CHANCE = { 1: 0.04, 2: 0.06, 3: 0.08, 4: 0.15, 5: 0.3, 6: 0.5 };
const SENIOR_RESPONSIBILITIES = [
  { title: 'Class Prefect', organisation: null },
  { title: 'House Captain', organisation: null },
  { title: 'Sports Captain', organisation: 'Sports Committee' },
  { title: 'Library Monitor', organisation: null },
  { title: 'Class Monitor', organisation: null },
];
const JUNIOR_RESPONSIBILITIES = [
  { title: 'Class Monitor', organisation: null },
  { title: 'Line Leader', organisation: null },
  { title: 'Library Monitor', organisation: null },
];

export function extrasFor(student) {
  const r = rng(`extras|${student.uid}`);
  const u = r();
  const count = u < 0.3 ? 0 : u < 0.75 ? 1 : 2;
  const activities = [];
  while (activities.length < count) {
    const name = pick(r, ACTIVITY_NAMES);
    if (!activities.includes(name)) activities.push(name);
  }
  const responsibilities = [];
  if (r() < RESPONSIBILITY_CHANCE[student.grade]) {
    responsibilities.push(pick(r, student.grade >= 5 ? SENIOR_RESPONSIBILITIES : JUNIOR_RESPONSIBILITIES));
  }
  return { activities, responsibilities };
}

/** One-off supporting records for report cards and the Feedback list (written once, never changed by a top-up). */
export function buildExtras(institutionId, people, subjects) {
  const items = [...buildRubrics(institutionId, people)];
  const term1 = termId(institutionId, 1);
  const byClass = studentsByClass(people);

  for (const s of subjects) {
    for (const cls of s.classes) {
      const teacher = teacherForClass(s, cls);
      for (const stu of byClass.get(cls.id)) {
        const fb = feedbackFor(stu, s);
        items.push({
          path: inst(institutionId, 'feedback_comments', `${stu.uid}_${s.id}_${term1}`),
          data: {
            studentId: stu.uid,
            studentName: stu.name,
            classId: cls.id,
            className: cls.name,
            termId: term1,
            institutionId,
            subjectId: s.id,
            conductGrade: fb.conductGrade,
            commentNumbers: fb.commentNumbers,
            teacherId: teacher.uid,
            teacherName: teacher.name,
            departmentId: deptId(s.dept),
            createdAt: at('2026-10-12', '14:00:00'),
          },
        });
      }
    }
  }

  for (const stu of people.students) {
    const sup = supervisorOf(people, classOf(stu.classId));
    items.push({
      path: inst(institutionId, 'reportCardComments', `rcc_${stu.uid}_${term1}`),
      data: {
        institutionId,
        studentId: stu.uid,
        termId: term1,
        academicYearId: academicYearId(institutionId),
        ...commentsFor(stu),
        updatedAt: at('2026-10-13', '14:00:00'),
        updatedBy: sup.uid,
      },
    });
    const { activities, responsibilities } = extrasFor(stu);
    activities.forEach((activityName, idx) => {
      items.push({
        path: inst(institutionId, 'studentActivities', `act_${stu.uid}_${idx}`),
        data: {
          institutionId,
          studentId: stu.uid,
          classId: stu.classId,
          termId: term1,
          academicYearId: academicYearId(institutionId),
          activityName,
          createdAt: at('2026-09-21', '14:00:00'),
          createdBy: sup.uid,
          updatedAt: at('2026-09-21', '14:00:00'),
        },
      });
    });
    responsibilities.forEach((resp, idx) => {
      items.push({
        path: inst(institutionId, 'studentResponsibilities', `resp_${stu.uid}_${idx}`),
        data: {
          institutionId,
          studentId: stu.uid,
          classId: stu.classId,
          termId: term1,
          academicYearId: academicYearId(institutionId),
          title: resp.title,
          organisation: resp.organisation,
          createdAt: at('2026-09-14', '14:00:00'),
          createdBy: sup.uid,
          updatedAt: at('2026-09-14', '14:00:00'),
        },
      });
    });
  }
  return items;
}

// ─── Disciplinary actions ─────────────────────────────────────────────────

const DISCIPLINARY_REASONS = {
  merit: ['Helpful to classmates', 'Excellent effort in class', 'Outstanding homework this week', 'Kind and respectful behaviour', 'Top score in the spelling test'],
  demerit: ['Talking during the lesson', 'Homework not completed', 'Not in the correct uniform', 'Late to class'],
  detention: ['Repeated lateness', 'Disrespect toward a teacher', 'Disruptive behaviour at assembly'],
  suspension: ['Serious breach of the school code of conduct', 'Fighting with another student'],
};

function drawDisciplinaryType(r) {
  const u = r();
  return u < 0.6 ? 'merit' : u < 0.83 ? 'demerit' : u < 0.97 ? 'detention' : 'suspension';
}

/** Primary-school mix: most students have none, a few have one or two; dated within Term 1 and recorded no earlier than the day they finish. */
export function buildDisciplinary(institutionId, people, through) {
  const days = schoolDays(CONTENT_TERM.endDate);
  const items = [];
  for (const stu of people.students) {
    const r = rng(`disc|${stu.uid}`);
    const u = r();
    const count = u < 0.62 ? 0 : u < 0.92 ? 1 : 2;
    for (let idx = 0; idx < count; idx++) {
      // Every draw is made before the date test, so the same student always gets the same records.
      const type = drawDisciplinaryType(r);
      const date = days[Math.floor(r() * days.length)];
      const reason = pick(r, DISCIPLINARY_REASONS[type]);
      const issuerDraw = r();
      const regular = people.regulars[Math.floor(r() * people.regulars.length)];
      const lengthDays = Math.floor(r() * 3);
      const needsRange = type === 'detention' || type === 'suspension';
      const endDate = needsRange ? addDays(date, lengthDays) : null;
      // A detention or suspension is recorded once it has finished, so `served` is always true and
      // the record never needs changing later; the others are recorded on their date.
      const doneOn = endDate ?? date;
      if (doneOn > through) continue;
      const cls = classOf(stu.classId);
      const issuer = issuerDraw < 0.6 ? supervisorOf(people, cls) : regular;
      items.push({
        date: doneOn,
        path: inst(institutionId, 'disciplinaryActions', `disc_${stu.uid}_${idx}`),
        data: {
          institutionId,
          studentId: stu.uid,
          studentName: stu.name,
          classId: cls.id,
          className: cls.name,
          termId: termId(institutionId, 1),
          termName: CONTENT_TERM.name,
          type,
          reason,
          date,
          ...(needsRange ? { endDate, served: true } : {}),
          issuedBy: issuer.uid,
          issuedByName: issuer.name,
          issuedByRole: issuer.role,
          createdAt: at(date, '15:00:00'),
        },
      });
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.path < b.path ? -1 : 1));
  return items.map(({ path, data }) => ({ path, data }));
}

// ─── Manual-entry results (the Results page shows these; it hides gradebook marks) ──

export const MANUAL_ASSESSMENTS = {
  'Language Arts': [
    { name: 'Spelling Bee Test', date: '2026-09-18', maxScore: 20 },
    { name: 'Oral Reading Check', date: '2026-10-02', maxScore: 10 },
    { name: 'Writing Task', date: '2026-11-06', maxScore: 20 },
    { name: 'Reading Comprehension Test', date: '2026-11-27', maxScore: 25 },
  ],
  Mathematics: [
    { name: 'Mental Maths Quiz', date: '2026-09-18', maxScore: 20 },
    { name: 'Times Tables Check', date: '2026-10-02', maxScore: 10 },
    { name: 'Problem Solving Task', date: '2026-11-06', maxScore: 20 },
    { name: 'Measurement Test', date: '2026-11-27', maxScore: 25 },
  ],
  Science: [
    { name: 'Plant Diagram Quiz', date: '2026-09-18', maxScore: 10 },
    { name: 'Observation Task', date: '2026-10-02', maxScore: 15 },
    { name: 'Weather Chart Task', date: '2026-11-06', maxScore: 15 },
    { name: 'Science Unit Test', date: '2026-11-27', maxScore: 25 },
  ],
  'Social Studies': [
    { name: 'Community Helpers Quiz', date: '2026-09-18', maxScore: 10 },
    { name: 'Map Skills Check', date: '2026-10-02', maxScore: 10 },
    { name: 'Heritage Project', date: '2026-11-06', maxScore: 20 },
    { name: 'Social Studies Unit Test', date: '2026-11-27', maxScore: 25 },
  ],
};

// Assessment order by date (then subject), so a top-up only ever appends.
const MANUAL_ASSESSMENTS_ORDER = [0, 1, 2, 3].flatMap((idx) =>
  Object.keys(MANUAL_ASSESSMENTS).map((subjName) => [subjName, idx]),
);

export function manualScore(uid, subjId, idx, maxScore) {
  const r = rng(`manual|${uid}|${subjId}|${idx}`);
  const pct = clamp(abilityFor(uid) + (r() - 0.5) * 0.35, 0.2, 1);
  return Math.round(maxScore * pct);
}

export function buildManualResults(institutionId, people, subjects, through) {
  const byClass = studentsByClass(people);
  const items = [];
  for (const [subjName, idx] of MANUAL_ASSESSMENTS_ORDER) {
    const a = MANUAL_ASSESSMENTS[subjName][idx];
    if (a.date > through) continue;
    const s = subjects.find((x) => x.name === subjName);
    for (const cls of s.classes) {
      const teacher = teacherForClass(s, cls);
      for (const stu of byClass.get(cls.id)) {
        items.push({
          path: inst(institutionId, 'results', `res_${stu.uid}_${s.id}_m${idx + 1}`),
          data: {
            studentId: stu.uid,
            studentName: stu.name,
            teacherId: teacher.uid,
            teacherName: teacher.name,
            classId: cls.id,
            className: cls.name,
            termId: termId(institutionId, 1),
            institutionId,
            departmentId: deptId(s.dept),
            subjectId: s.id,
            assessmentName: a.name,
            assessmentType: 'coursework',
            score: manualScore(stu.uid, s.id, idx, a.maxScore),
            maxScore: a.maxScore,
            date: a.date,
            createdAt: at(a.date, '19:00:00'),
          },
        });
      }
    }
  }
  return items;
}

// ─── Progress reports ─────────────────────────────────────────────────────

/** Interim snapshots: a few days after each gradebook column (Quiz 1, Class Test, Term Exam). */
export const PROGRESS_SNAPSHOTS = ['2026-10-12', '2026-11-16', '2026-12-11'];

/** Every percentage a student has in a subject up to a date: gradebook columns and manual-entry results. */
function percentagesAsOf(student, subject, date) {
  const out = [];
  for (const col of GRADEBOOK_COLUMNS) {
    if (col.date <= date) out.push((gradebookScore(student.uid, subject.id, col) / col.maxScore) * 100);
  }
  (MANUAL_ASSESSMENTS[subject.name] ?? []).forEach((a, idx) => {
    if (a.date <= date) out.push((manualScore(student.uid, subject.id, idx, a.maxScore) / a.maxScore) * 100);
  });
  return out;
}

export function buildProgressReports(institutionId, people, subjects, through) {
  const items = [];
  for (const snap of PROGRESS_SNAPSHOTS) {
    if (snap > through) continue;
    for (const stu of people.students) {
      const cls = classOf(stu.classId);
      const sup = supervisorOf(people, cls);
      const rows = [];
      for (const s of subjectsOfStudent(subjects, stu)) {
        const pcts = percentagesAsOf(stu, s, snap);
        if (pcts.length === 0) continue;
        const average = round1(pcts.reduce((n, p) => n + p, 0) / pcts.length);
        const lead = leadTeacherOf(s);
        rows.push({ subjectId: s.id, subjectName: s.name, teacherId: lead.uid, teacherName: lead.name, average, letterGrade: letterGrade(average) });
      }
      rows.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
      items.push({
        path: inst(institutionId, 'progressReports', `pr_${stu.uid}_${snap}`),
        data: {
          institutionId,
          studentId: stu.uid,
          studentName: stu.name,
          classId: cls.id,
          className: cls.name,
          termId: termId(institutionId, 1),
          termName: CONTENT_TERM.name,
          academicYearId: academicYearId(institutionId),
          academicYearName: YEAR.name,
          institutionName: SCHOOL.name,
          institutionAddress: SCHOOL.address,
          institutionPhone: SCHOOL.phone,
          institutionLogoUrl: null,
          authorizedSignature: { mode: 'text', text: SCHOOL.signatory },
          principalLabel: 'Principal',
          subjects: rows,
          overallAverage: rows.length ? round1(rows.reduce((n, r) => n + r.average, 0) / rows.length) : null,
          generatedAt: at(snap, '15:00:00'),
          generatedBy: sup.uid,
          generatedByName: sup.name,
        },
      });
    }
  }
  return items;
}

// ─── Report cards (what Report Builder reads) ─────────────────────────────

/**
 * Term 1 report cards from the gradebook marks up to `through`. Mid-term they are INTERIM:
 * the grade is the weighted points scaled to the weight assessed so far (the app's own formula
 * gives only that fraction of 100, so every student would look like they are failing). Once
 * every column has marks the weight assessed is 100 and this is exactly the app's formula.
 * Class rank and average are included (the app writes them in a second pass).
 */
export function buildReportCards(institutionId, people, subjects, through) {
  const upTo = contentThrough(through);
  const cols = GRADEBOOK_COLUMNS.filter((c) => c.date <= upTo);
  if (cols.length === 0) return [];
  const assessed = cols.reduce((n, c) => n + c.columnWeight, 0);
  const scale = 100 / assessed;
  const summaries = new Map(buildAttendanceSummaries(institutionId, people, through).map((i) => [i.data.studentId, i.data]));
  const discipline = new Map();
  for (const i of buildDisciplinary(institutionId, people, upTo)) {
    const d = discipline.get(i.data.studentId) ?? { merit: 0, demerit: 0, detention: 0, suspension: 0 };
    d[i.data.type] += 1;
    discipline.set(i.data.studentId, d);
  }
  const houseByKey = new Map(HOUSES.map((h) => [h.key, h]));
  const population = new Map(CLASSES.map((c) => [c.id, people.students.filter((s) => s.classId === c.id).length]));

  const cards = people.students.map((stu) => {
    const cls = classOf(stu.classId);
    const rows = subjectsOfStudent(subjects, stu)
      .map((s) => {
        let raw = 0;
        for (const col of cols) raw += (gradebookScore(stu.uid, s.id, col) / col.maxScore) * col.columnWeight;
        const finalGrade = round1(raw * scale);
        const lead = leadTeacherOf(s);
        const fb = feedbackFor(stu, s);
        return {
          subjectId: s.id,
          subjectName: s.name,
          teacherId: lead.uid,
          teacherName: lead.name,
          cwWeight: 60,
          examWeight: 40,
          cwGrade: null,
          examGrade: null,
          finalGrade,
          letterGrade: letterGrade(finalGrade),
          subjectPosition: null,
          conductGrade: fb.conductGrade,
          commentNumbers: fb.commentNumbers,
        };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
    const studentAverage = rows.length ? rows.reduce((n, r) => n + r.finalGrade, 0) / rows.length : null;
    const att = summaries.get(stu.uid);
    const d = discipline.get(stu.uid) ?? { merit: 0, demerit: 0, detention: 0, suspension: 0 };
    const { activities, responsibilities } = extrasFor(stu);
    const house = houseByKey.get(stu.houseKey);
    return {
      stu,
      studentAverage,
      data: {
        studentId: stu.uid,
        studentName: stu.name,
        studentGender: stu.gender,
        institutionStudentId: stu.institutionStudentId,
        dateOfBirth: stu.dateOfBirth,
        classId: cls.id,
        className: cls.name,
        classPopulation: population.get(cls.id),
        houseId: houseId(stu.houseKey),
        houseName: house.name,
        termId: termId(institutionId, 1),
        termName: CONTENT_TERM.name,
        academicYearId: academicYearId(institutionId),
        academicYearName: YEAR.name,
        nextTermStart: TERMS[1].startDate,
        institutionId,
        institutionName: SCHOOL.name,
        institutionMotto: SCHOOL.motto,
        institutionAddress: SCHOOL.address,
        institutionPhone: SCHOOL.phone,
        institutionEmail: `info@${SCHOOL.emailDomain}`,
        institutionLogoUrl: null,
        authorizedSignature: { mode: 'text', text: SCHOOL.signatory },
        classSupervisorLabel: 'Class Teacher',
        gradeSupervisorLabel: 'Grade Coordinator',
        principalLabel: 'Principal',
        vicePrincipalLabel: 'Vice Principal',
        ...commentsFor(stu),
        totalPossibleSessions: att.totalExpectedSessions,
        sessionsAbsent: att.sessionsAbsent,
        daysLate: att.daysLate,
        extraCurricularActivities: activities,
        positionsOfResponsibility: responsibilities.map((r) => ({ title: r.title, organisation: r.organisation })),
        gradingSystem: 'flat',
        subjects: rows,
        studentAverage,
        classAverage: null,
        classRank: null,
        gpa: rows.length ? Math.round((rows.reduce((n, r) => n + gpaPoints(r.letterGrade), 0) / rows.length) * 100) / 100 : null,
        merits: d.merit,
        demerits: d.demerit,
        suspensions: d.suspension,
        detentions: d.detention,
        generatedAt: at(upTo, '18:00:00'),
        generatedBy: people.admin.uid,
        generatedByRole: 'institution_admin',
        generatedViaBatch: true,
      },
    };
  });

  // Class rank and average, as report-cards/index.tsx's second pass (ties keep roster order).
  for (const cls of CLASSES) {
    const group = cards.filter((c) => c.stu.classId === cls.id && c.studentAverage !== null);
    const average = group.length ? group.reduce((n, c) => n + c.studentAverage, 0) / group.length : null;
    [...group].sort((a, b) => b.studentAverage - a.studentAverage).forEach((c, i) => {
      c.data.classRank = i + 1;
      c.data.classAverage = average;
    });
  }

  return cards.map((c) => ({ path: inst(institutionId, 'reportCards', `rc_${c.stu.uid}_${termId(institutionId, 1)}`), data: c.data }));
}
