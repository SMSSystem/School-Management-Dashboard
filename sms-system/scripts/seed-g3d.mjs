/**
 * Firestore Seed Script — GENR8 Academy edition (client SDK, no service account needed)
 *
 * Prerequisites:
 *   1. You must have an existing account in Firebase Auth that has:
 *      - role: 'super_admin' in its users/{uid} document
 *   2. Add its credentials to .env:
 *        VITE_SEED_ADMIN_EMAIL="you@example.com"
 *        VITE_SEED_ADMIN_PASSWORD="yourpassword"
 *   3. Run:  node scripts/seed-genr8.mjs
 *
 * All test accounts are created with password: Test@1234
 * The script is safe to re-run — existing auth users are reused, not duplicated.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut, setPersistence, inMemoryPersistence,
} from 'firebase/auth';
import {
  initializeFirestore, doc, setDoc, updateDoc, addDoc, collection,
  serverTimestamp, writeBatch, Timestamp,
} from 'firebase/firestore';

// ── Parse .env ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath   = join(__dirname, '..', '.env');

function parseEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = parseEnv(envPath);

const ADMIN_EMAIL = env.VITE_SEED_ADMIN_EMAIL;
const ADMIN_PW    = env.VITE_SEED_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PW) {
  console.error('\n❌  Set VITE_SEED_ADMIN_EMAIL and VITE_SEED_ADMIN_PASSWORD in your .env file.\n');
  process.exit(1);
}

const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
};

const API_KEY = env.VITE_FIREBASE_API_KEY;

// ── Firebase init ─────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig, 'seed-main');
const auth = getAuth(app);
await setPersistence(auth, inMemoryPersistence);
const db   = initializeFirestore(app, { ignoreUndefinedProperties: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

const iid    = 'inst_genr8';
const instC  = (name) => collection(db, 'institutions', iid, name);
const instD  = (name, id) => doc(db, 'institutions', iid, name, id);
const newRef = (name) => doc(instC(name));

/**
 * Create a Firebase Auth user without signing out the current admin session.
 * Uses a short-lived secondary app so the main auth state is never disturbed.
 */
async function createAuthUser(email, displayName, password = 'Test@1234') {
  // First try the REST sign-up endpoint — no auth needed
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: false }),
    }
  );
  const json = await res.json();
  if (json.localId) return json.localId;

  if (json.error?.message === 'EMAIL_EXISTS') {
    // Look up the existing UID via sign-in (just to get the UID back)
    const lr = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const lj = await lr.json();
    if (lj.localId) {
      console.log(`  ↩  reusing existing auth user: ${email}`);
      return lj.localId;
    }
    // Password may differ — try the default
    const lr2 = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Test@1234', returnSecureToken: true }),
      }
    );
    const lj2 = await lr2.json();
    if (lj2.localId) {
      console.log(`  ↩  reusing existing auth user (default pw): ${email}`);
      return lj2.localId;
    }
    throw new Error(`EMAIL_EXISTS but could not recover UID for ${email}`);
  }

  throw new Error(`Auth REST error for ${email}: ${JSON.stringify(json.error)}`);
}

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function score(max) { return Math.max(Math.floor(max * 0.45), Math.floor(Math.random() * (max + 1))); }

// ── Fixture data (same as before) ─────────────────────────────────────────────

const DEPT_NAMES = ['Mathematics', 'Sciences', 'English', 'Humanities', 'Creative Arts'];

const HOUSE_DATA = [
  { name: 'Phoenix', description: 'Rise from the ashes — perseverance and resilience.' },
  { name: 'Dragon',  description: 'Strength and wisdom in all endeavours.' },
  { name: 'Griffin', description: 'Courage and leadership above all.' },
  { name: 'Titan',   description: 'Endurance and excellence, every day.' },
  { name: 'Nova',    description: 'Brilliance that lights the way for others.' },
];

const CLASS_DATA = [
  { name: 'Grade 7A', grade: 7 }, { name: 'Grade 7B', grade: 7 },
  { name: 'Grade 8A', grade: 8 }, { name: 'Grade 8B', grade: 8 },
  { name: 'Grade 9A', grade: 9 }, { name: 'Grade 9B', grade: 9 },
  { name: 'Grade 10A', grade: 10 }, { name: 'Grade 10B', grade: 10 },
  { name: 'Grade 11A', grade: 11 }, { name: 'Grade 11B', grade: 11 },
];

const SUBJECT_TEMPLATES = [
  { name: 'Mathematics',           deptIndex: 0, minGrade: 7,  maxGrade: 11, cw: 40, exam: 60 },
  { name: 'Additional Mathematics', deptIndex: 0, minGrade: 10, maxGrade: 11, cw: 30, exam: 70 },
  { name: 'Statistics',            deptIndex: 0, minGrade: 10, maxGrade: 11, cw: 40, exam: 60 },
  { name: 'Biology',               deptIndex: 1, minGrade: 9,  maxGrade: 11, cw: 40, exam: 60 },
  { name: 'Chemistry',             deptIndex: 1, minGrade: 9,  maxGrade: 11, cw: 40, exam: 60 },
  { name: 'Physics',               deptIndex: 1, minGrade: 9,  maxGrade: 11, cw: 40, exam: 60 },
  { name: 'Integrated Science',    deptIndex: 1, minGrade: 7,  maxGrade: 9,  cw: 50, exam: 50 },
  { name: 'English Language',      deptIndex: 2, minGrade: 7,  maxGrade: 11, cw: 40, exam: 60 },
  { name: 'English Literature',    deptIndex: 2, minGrade: 8,  maxGrade: 11, cw: 40, exam: 60 },
  { name: 'History',               deptIndex: 3, minGrade: 8,  maxGrade: 11, cw: 50, exam: 50 },
  { name: 'Geography',             deptIndex: 3, minGrade: 8,  maxGrade: 11, cw: 50, exam: 50 },
  { name: 'Social Studies',        deptIndex: 3, minGrade: 7,  maxGrade: 9,  cw: 50, exam: 50 },
  { name: 'Religious Studies',     deptIndex: 3, minGrade: 7,  maxGrade: 11, cw: 60, exam: 40 },
  { name: 'Visual Arts',           deptIndex: 4, minGrade: 7,  maxGrade: 11, cw: 60, exam: 40 },
  { name: 'Music',                 deptIndex: 4, minGrade: 7,  maxGrade: 11, cw: 60, exam: 40 },
];

const SENIOR_TEACHER_NAMES = [
  ['Margaret','Thornton'],['Robert','Sinclair'],['Patricia','Hayward'],['David','Okonkwo'],
  ['Linda','Beaumont'],['James','Fitzgerald'],['Susan','Nakamura'],['Thomas','Adeyemi'],
];

const REGULAR_TEACHER_NAMES = [
  ['Alice','Fletcher'],['Brian','Morrison'],['Carmen','Diaz'],['Daniel','Walsh'],
  ['Emily','Patel'],['Frank','Okafor'],['Grace','Chen'],['Henry','Murray'],
  ['Irene','Santos'],['John','Williamson'],['Karen','Osei'],['Liam','Gallagher'],
  ['Maria','Kowalski'],['Nathan','Abebe'],['Olivia','Dawson'],['Patrick','Kwame'],
  ['Quinn','Larsson'],['Rachel','Mensah'],['Samuel','Cartwright'],['Tanya','Hoffman'],
];

const STUDENT_NAMES = [
  ['Aiden','Clarke'],['Bella','Morgan'],['Caleb','Thompson'],['Diana','Patel'],['Ethan','Brooks'],
  ['Fiona','Kimani'],['George','Nwosu'],['Hannah','Reid'],['Isaac','Osei'],['Jade','Lawson'],
  ['Kevin','Martins'],['Luna','Beckford'],['Marcus','Okonkwo'],['Nina','Walsh'],['Oscar','Ferreira'],
  ['Priya','Sharma'],['Quinn','Dlamini'],['Rosa','Mensah'],['Samir','Al-Hassan'],['Tara','Owusu'],
  ['Ulric','Barnes'],['Vera','Achebe'],['Will','Kingston'],['Xena','Diallo'],['Yusuf','Bello'],
  ['Zara','Opoku'],['Aaron','Tremblay'],['Beth','Kofi'],['Cole','Amadi'],['Dara','Hutchinson'],
  ['Eli','Sarpong'],['Fatima','Johansson'],['Gabe','Antwi'],['Hana','Obiora'],['Ivan','Mensah'],
  ['Jaya','Sundaram'],['Kai','Ntim'],['Lyra','Asante'],['Milo','Gyamfi'],['Nadia','Boateng'],
  ['Omar','Adjei'],['Petra','Quartey'],['Rio','Acheampong'],['Sara','Darko'],['Theo','Nyarko'],
  ['Uma','Frimpong'],['Victor','Amoah'],['Wren','Ofori'],['Xander','Agyei'],['Yara','Danso'],
];

const PARENT_NAMES = [
  ['Michael','Clarke'],['Sandra','Morgan'],['Joseph','Thompson'],['Meera','Patel'],
  ['Andrew','Brooks'],['Grace','Kimani'],['Emmanuel','Nwosu'],['Janet','Reid'],
  ['Kofi','Osei'],['Angela','Lawson'],
];

const ANNOUNCEMENT_SUBJECTS = [
  'Staff Professional Development Day — School Closed',
  'End of Term Examinations Schedule Released',
  'Annual Sports Day — Registration Open',
  'Parent-Teacher Conference Dates',
  'New Library Resources Available',
  'Inter-House Drama Competition',
  'Scholarship Applications Now Open',
  'Science Fair — Entry Deadline Approaching',
  'Term 2 Timetable Update',
  'School Fees Payment Reminder',
  'Career Day Speakers Announced',
  'Swimming Gala Results',
  'Congratulations to Our CSEC High Achievers',
  'Cybersafety Workshop for Parents',
  'Emergency Contact Update Required',
  'Uniform Policy Reminder',
  'Art Exhibition Opening',
  'Music Concert Tickets On Sale',
  'Community Service Day',
  'Welcome Back — Term 3 Begins',
  'Math Olympiad Team Selected',
  'Reading Challenge Results',
  'Staff Appreciation Week',
  'Grade 11 Farewell Planning Committee',
  'Water Day Fundraiser',
  'School Garden Project Launch',
  'Debate Club Tryouts',
  'First Aid Training for Prefects',
  'Public Holiday — School Closed',
  'Principal\'s Award Ceremony',
  'New Canteen Menu',
  'Bus Route Change Notice',
  'Photography Competition',
  'Chess Club Finals',
  'Holiday Homework Guidelines',
  'Examination Regulations',
  'Mentorship Programme Launch',
  'Technology Upgrade — Computer Lab Schedule',
  'Blood Drive on Campus',
  'Academic Results Day',
  'Religious Observance — Early Dismissal',
];

const EVENT_NAMES = [
  'Open Day','Term 1 Examinations','Sports Day','School Play — Shakespeare Night',
  'Parent-Teacher Conference','Science Fair','Careers Expo','Inter-School Debate',
  'Swimming Gala','Drama Festival','Art Exhibition','Music Concert',
  'Prize Giving Ceremony','Community Service Day','Reading Challenge Kickoff',
  'Math Olympiad','House Athletics','Staff Development Day','Grade 11 Farewell',
  'International Day','Health & Wellness Fair','Book Fair','Chess Tournament',
  'Photography Exhibition','Fundraiser Bake Sale','Graduation Ceremony',
  'Term 2 Examinations','Spelling Bee','Coding Workshop','Environmental Awareness Day',
  'Cultural Day','Debate Finals','Alumni Panel Talk','First Aid Workshop',
  'Cybersafety Seminar','Term 3 Examinations','Sports Presentation Evening',
  'Scholarship Awards Ceremony','Field Trip — National Museum','End of Year Concert',
  'House Points Announcement',
];

const FEEDBACK_COMMENTS = [
  'Shows consistent effort and enthusiasm in class.',
  'Demonstrates strong analytical skills.',
  'Needs to improve participation during discussions.',
  'Excellent written work this term.',
  'Has shown remarkable improvement since last term.',
  'Would benefit from more independent revision.',
  'A pleasure to teach — always prepared and engaged.',
  'Struggles with time management during assessments.',
  'Creative thinker who brings fresh perspectives.',
  'Needs to consolidate foundational concepts.',
  'Collaborates well with peers in group work.',
  'Consistently meets deadlines and submission requirements.',
  'Shows great potential when given individual attention.',
  'Performance is below expectation for their ability.',
  'Excellent recall and application of prior knowledge.',
];

const ACTIVITY_NAMES   = ['Football Team','Swimming Club','Debate Team','Science Club','Art Club','Chess Club','Drama Society','Music Band','Environmental Club','Community Service'];
const RESP_TITLES       = ['Class Captain','Deputy Head Prefect','House Captain','Library Prefect','Sports Captain','Cultural Secretary','Science Club President','Debate Captain'];
const PRINCIPAL_CMTS    = [
  'A hardworking and dedicated student who continues to impress.',
  'Keep up the excellent effort and continue to reach for your potential.',
  'This student has demonstrated remarkable growth this term.',
  'We encourage continued dedication to academic excellence.',
  'A fine example of what commitment and effort can achieve.',
];

const TIMES = ['07:30','08:30','09:30','10:30','11:30','12:30','13:30'];
const DAYS  = ['mon','tue','wed','thu','fri'];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🔐  Signing in as seed admin…');
  let adminCred;
  try {
    adminCred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PW);
  } catch (e) {
    console.error(`\n❌  Could not sign in as ${ADMIN_EMAIL}: ${e.message}`);
    console.error('    Make sure VITE_SEED_ADMIN_EMAIL and VITE_SEED_ADMIN_PASSWORD are correct in .env\n');
    process.exit(1);
  }
  const seedAdminUid = adminCred.user.uid;
  console.log(`✅  Signed in as ${ADMIN_EMAIL} (${seedAdminUid})\n`);

  // ── 0. Ensure the seed admin has a users/{uid} doc (required for app login) ──

  await setDoc(doc(db, 'users', seedAdminUid), {
    uid: seedAdminUid,
    name: 'Super Admin',
    firstName: 'Super',
    lastName: 'Admin',
    email: ADMIN_EMAIL,
    role: 'super_admin',
    institutionId: '*',
    accountStatus: 'active',
    status: 'active',
    createdAt: serverTimestamp(),
  }, { merge: true });
  console.log('✅  Seed admin users/{uid} document ensured\n');

  console.log('🌱  GENR8 Academy — Firestore seed starting…\n');

  // ── 1. Institution ────────────────────────────────────────────────────────

  await setDoc(doc(db, 'institutions', iid), {
    name: 'GENR8 Academy', institutionId: iid,
    status: 'active', gradingSystem: 'flat',
    location: 'Kingston, Jamaica',
    motto: 'Create. Build. Innovate.',
    phone: '+1-876-555-0108', email: 'admin@genr8academy.edu',
    address: '8 Innovation Drive, Kingston',
    brandColor: '#7c3aed', profileComplete: true,
    classSupervisorLabel: 'Class Supervisor',
    gradeSupervisorLabel: 'Year Group Coordinator',
    principalLabel: 'Principal', vicePrincipalLabel: 'Vice Principal',
    createdAt: serverTimestamp(), userCount: 0, studentCount: 0, teacherCount: 0,
  }, { merge: true });
  console.log('✅  Institution created');

  // ── 2. Admins ─────────────────────────────────────────────────────────────

  console.log('\n👤  Creating institution admins…');
  const adminDefs = [
    { firstName: 'Eleanor', lastName: 'Hargrove', email: 'ehargrove@genr8academy.edu' },
    { firstName: 'Winston', lastName: 'Alleyne',  email: 'walleyne@genr8academy.edu'  },
  ];
  const adminUids = [];
  for (const a of adminDefs) {
    const uid  = await createAuthUser(a.email, `${a.firstName} ${a.lastName}`);
    const name = `${a.firstName} ${a.lastName}`;
    await setDoc(doc(db, 'users', uid), {
      uid, firstName: a.firstName, lastName: a.lastName, name, email: a.email,
      role: 'institution_admin', institutionId: iid,
      accountStatus: 'active', status: 'active',
      createdAt: serverTimestamp(), createdBy: seedAdminUid,
    }, { merge: true });
    await setDoc(instD('members', uid), {
      userId: uid, institutionId: iid, name, email: a.email,
      role: 'institution_admin', status: 'active',
      createdAt: serverTimestamp(), createdBy: seedAdminUid,
    });
    adminUids.push(uid);
    console.log(`  ✅  ${a.email}`);
  }
  const primaryAdminUid = adminUids[0];

  // ── 3. Departments ────────────────────────────────────────────────────────

  console.log('\n🏫  Creating departments…');
  const deptIds = [];
  for (const dname of DEPT_NAMES) {
    const r = newRef('departments');
    deptIds.push(r.id);
    await setDoc(r, { name: dname, institutionId: iid });
    console.log(`  ✅  ${dname}`);
  }

  // ── 4. Houses ─────────────────────────────────────────────────────────────

  console.log('\n🏠  Creating houses…');
  const houseIds = [];
  for (const h of HOUSE_DATA) {
    const r = newRef('houses');
    houseIds.push(r.id);
    await setDoc(r, { ...h, institutionId: iid, createdAt: serverTimestamp(), createdBy: primaryAdminUid, updatedAt: serverTimestamp() });
    console.log(`  ✅  ${h.name}`);
  }

  // ── 5. Academic year + terms ──────────────────────────────────────────────

  console.log('\n📅  Creating academic year and terms…');
  const yearRef = newRef('academicYears');
  const yearId  = yearRef.id;
  await setDoc(yearRef, {
    institutionId: iid, name: '2025-2026',
    startDate: '2025-09-01', endDate: '2026-07-18',
    status: 'active', schoolWeekDays: [1,2,3,4,5],
    createdAt: serverTimestamp(), confirmedAt: '2025-08-15T09:00:00Z', confirmedBy: primaryAdminUid,
  });

  const termDefs = [
    { name: 'Term 1', start: '2025-09-01', end: '2025-12-12', status: 'completed', num: 1 },
    { name: 'Term 2', start: '2026-01-12', end: '2026-04-03', status: 'active',    num: 2 },
    { name: 'Term 3', start: '2026-04-20', end: '2026-07-18', status: 'upcoming',  num: 3 },
  ];
  const termIds = [];
  for (const t of termDefs) {
    const r = newRef('terms');
    termIds.push(r.id);
    await setDoc(r, {
      name: t.name, institutionId: iid, academicYearId: yearId,
      termNumber: t.num, startDate: t.start, endDate: t.end, status: t.status,
    });
  }
  const activeTerm = termIds[1];
  console.log(`  ✅  Academic year 2025-2026 + 3 terms`);

  // ── 6. Non-school days ────────────────────────────────────────────────────

  console.log('\n🚫  Creating non-school days…');
  const nsdDefs = [
    { type:'range',  startDate:'2025-12-13', endDate:'2026-01-11', reason:'Christmas & New Year Holiday', source:'institution_specific' },
    { type:'single', date:'2025-09-22', reason:'Republic Day',       source:'public_holiday' },
    { type:'single', date:'2025-10-14', reason:'Columbus Day',       source:'public_holiday' },
    { type:'single', date:'2025-11-01', reason:'All Saints Day',     source:'public_holiday' },
    { type:'single', date:'2025-11-11', reason:'Remembrance Day',    source:'public_holiday' },
    { type:'range',  startDate:'2026-04-04', endDate:'2026-04-19', reason:'Easter Holiday', source:'institution_specific' },
    { type:'single', date:'2026-05-01', reason:'Labour Day',         source:'public_holiday' },
    { type:'single', date:'2026-06-11', reason:'Corpus Christi',     source:'public_holiday' },
    { type:'single', date:'2026-06-19', reason:'Emancipation Day',   source:'public_holiday' },
    { type:'single', date:'2026-07-04', reason:'Independence Day',   source:'public_holiday' },
    { type:'single', date:'2025-10-31', reason:'Sports Day',                        source:'institution_specific' },
    { type:'single', date:'2026-02-13', reason:'Staff Development Day',             source:'institution_specific' },
    { type:'single', date:'2026-03-27', reason:'Prize Giving Ceremony',             source:'institution_specific' },
    { type:'single', date:'2026-05-22', reason:'Cultural Day',                      source:'institution_specific' },
    { type:'single', date:'2026-06-26', reason:'Grade 11 Farewell',                 source:'institution_specific' },
  ];
  for (const d of nsdDefs) {
    await setDoc(newRef('nonSchoolDays'), { ...d, institutionId: iid, academicYearId: yearId, isActive: true, createdAt: serverTimestamp() });
  }
  console.log(`  ✅  ${nsdDefs.length} non-school days`);

  // ── 7. Senior teachers ────────────────────────────────────────────────────

  console.log('\n👩‍🏫  Creating senior teachers…');
  const seniorTeachers = [];
  for (let i = 0; i < SENIOR_TEACHER_NAMES.length; i++) {
    const [fn, ln] = SENIOR_TEACHER_NAMES[i];
    const email    = `${fn.toLowerCase()}.${ln.toLowerCase()}@genr8academy.edu`;
    const name     = `${fn} ${ln}`;
    const deptId   = deptIds[i % deptIds.length];
    const uid      = await createAuthUser(email, name);
    await setDoc(doc(db, 'users', uid), {
      uid, firstName: fn, lastName: ln, name, email,
      role: 'senior_teacher', institutionId: iid,
      accountStatus: 'active', status: 'active',
      departmentId: deptId, canGenerateSchedule: i < 2,
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    }, { merge: true });
    await setDoc(instD('members', uid), {
      userId: uid, institutionId: iid, name, email,
      role: 'senior_teacher', memberType: 'senior', status: 'active',
      departmentId: deptId, employeeNumber: `EMP${String(i+1).padStart(4,'0')}`,
      canGenerateSchedule: i < 2,
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    });
    seniorTeachers.push({ uid, name, deptId, deptName: DEPT_NAMES[i % deptIds.length] });
    console.log(`  ✅  ${email}`);
  }

  for (let i = 0; i < deptIds.length; i++) {
    const st = seniorTeachers[i];
    if (st) await setDoc(instD('departments', deptIds[i]), { headTeacherId: st.uid }, { merge: true });
  }

  // ── 8. Regular teachers ───────────────────────────────────────────────────

  console.log('\n👨‍🏫  Creating regular teachers…');
  const regularTeachers = [];
  for (let i = 0; i < REGULAR_TEACHER_NAMES.length; i++) {
    const [fn, ln] = REGULAR_TEACHER_NAMES[i];
    const email    = `${fn.toLowerCase()}.${ln.toLowerCase()}@genr8academy.edu`;
    const name     = `${fn} ${ln}`;
    const deptId   = deptIds[i % deptIds.length];
    const uid      = await createAuthUser(email, name);
    await setDoc(doc(db, 'users', uid), {
      uid, firstName: fn, lastName: ln, name, email,
      role: 'regular_teacher', institutionId: iid,
      accountStatus: 'active', status: 'active', departmentId: deptId,
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    }, { merge: true });
    await setDoc(instD('members', uid), {
      userId: uid, institutionId: iid, name, email,
      role: 'regular_teacher', memberType: 'regular', status: 'active',
      departmentId: deptId, employeeNumber: `EMP${String(i+20).padStart(4,'0')}`,
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    });
    regularTeachers.push({ uid, name, deptId, deptName: DEPT_NAMES[i % deptIds.length] });
    console.log(`  ✅  ${email}`);
  }

  const allTeachers = [...seniorTeachers, ...regularTeachers];

  // ── 9. Classes ────────────────────────────────────────────────────────────

  console.log('\n🏫  Creating classes…');
  const classIds = [];
  for (let i = 0; i < CLASS_DATA.length; i++) {
    const cls     = CLASS_DATA[i];
    const teacher = allTeachers[i % allTeachers.length];
    const r       = newRef('classes');
    classIds.push(r.id);
    await setDoc(r, {
      name: cls.name, grade: cls.grade, capacity: 30,
      institutionId: iid, termId: activeTerm,
      classTeacherId: teacher.uid, supervisor: teacher.name, departmentId: teacher.deptId,
    });
    await setDoc(doc(db, 'users', teacher.uid), { assignedClassId: r.id, assignedClassName: cls.name }, { merge: true });
    await setDoc(instD('members', teacher.uid), { assignedClassId: r.id, assignedClassName: cls.name }, { merge: true });
    console.log(`  ✅  ${cls.name} → ${teacher.name}`);
  }

  // ── 10. Students ──────────────────────────────────────────────────────────

  console.log('\n🎒  Creating students (50)…');
  const students = [];
  for (let i = 0; i < STUDENT_NAMES.length; i++) {
    const [fn, ln]  = STUDENT_NAMES[i];
    const email     = `${fn.toLowerCase()}.${ln.toLowerCase()}.student@genr8academy.edu`;
    const name      = `${fn} ${ln}`;
    const classId   = classIds[i % classIds.length];
    const className = CLASS_DATA[i % CLASS_DATA.length].name;
    const houseId   = houseIds[i % houseIds.length];
    const houseName = HOUSE_DATA[i % HOUSE_DATA.length].name;
    const dob       = `${2009 - Math.floor(i / 10)}-${String((i%12)+1).padStart(2,'0')}-${String((i%28)+1).padStart(2,'0')}`;
    const gender    = i % 2 === 0 ? 'Male' : 'Female';
    const studentId = `STU${String(i+1).padStart(4,'0')}`;
    const uid       = await createAuthUser(email, name);
    await setDoc(doc(db, 'users', uid), {
      uid, firstName: fn, lastName: ln, name, email,
      role: 'student', institutionId: iid,
      accountStatus: 'active', status: 'active',
      classId, institutionStudentId: studentId,
      dateOfBirth: dob, gender, houseId, houseName,
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    }, { merge: true });
    await setDoc(instD('members', uid), {
      userId: uid, institutionId: iid, name, email,
      role: 'student', status: 'active',
      classId, institutionStudentId: studentId,
      dateOfBirth: dob, gender, houseId, houseName,
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    });
    students.push({ uid, name, classId, className, houseId, houseName, studentId });
    console.log(`  ✅  ${name} (${className})`);
  }

  // ── 11. Parents + student-parent links ───────────────────────────────────

  console.log('\n👨‍👩‍👧  Creating parents and linking to students…');
  const parents = [];
  for (let i = 0; i < PARENT_NAMES.length; i++) {
    const [fn, ln] = PARENT_NAMES[i];
    const email    = `${fn.toLowerCase()}.${ln.toLowerCase()}.parent@genr8academy.edu`;
    const name     = `${fn} ${ln}`;
    const uid      = await createAuthUser(email, name);
    await setDoc(doc(db, 'users', uid), {
      uid, firstName: fn, lastName: ln, name, email,
      role: 'parent', institutionId: iid,
      accountStatus: 'active', status: 'active',
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    }, { merge: true });
    await setDoc(instD('members', uid), {
      userId: uid, institutionId: iid, name, email,
      role: 'parent', status: 'active',
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
    });
    parents.push({ uid, name });
    console.log(`  ✅  ${email}`);
  }

  let linkCount = 0;
  for (let p = 0; p < parents.length; p++) {
    for (let s = 0; s < 5; s++) {
      const parent  = parents[p];
      const student = students[(p * 5 + s) % students.length];
      await setDoc(instD('studentParents', `${parent.uid}_${student.uid}`), {
        parentId: parent.uid, parentName: parent.name,
        studentId: student.uid, studentName: student.name,
        institutionId: iid, classId: student.classId,
      });
      linkCount++;
    }
  }
  console.log(`  ✅  ${linkCount} student-parent links`);

  // ── 12. Subjects ──────────────────────────────────────────────────────────

  console.log('\n📚  Creating subjects…');
  const subjects = [];
  for (let i = 0; i < SUBJECT_TEMPLATES.length; i++) {
    const tmpl      = SUBJECT_TEMPLATES[i];
    const deptId    = deptIds[tmpl.deptIndex];
    const deptName  = DEPT_NAMES[tmpl.deptIndex];
    const deptT     = allTeachers.filter(t => t.deptId === deptId).slice(0, 2);
    if (deptT.length === 0) deptT.push(allTeachers[i % allTeachers.length]);
    const cls       = classIds.filter((_, ci) => { const g = CLASS_DATA[ci].grade; return g >= tmpl.minGrade && g <= tmpl.maxGrade; });
    const clsNames  = cls.map(cid => CLASS_DATA[classIds.indexOf(cid)].name);
    const r         = newRef('subjects');
    subjects.push({ id: r.id, name: tmpl.name, deptId, deptName, classIds: cls, teacherUids: deptT });
    await setDoc(r, {
      name: tmpl.name, institutionId: iid,
      classScope: 'institution', classIds: cls, classNames: clsNames,
      teacherIds: deptT.map(t => t.uid), teacherNames: deptT.map(t => t.name),
      cwWeight: tmpl.cw, examWeight: tmpl.exam,
      departmentId: deptId, departmentName: deptName,
      frequency: 'weekly', sessionDayOfWeek: [1, 3],
      createdAt: serverTimestamp(), createdBy: primaryAdminUid,
      updatedAt: serverTimestamp(), updatedBy: primaryAdminUid,
    });
    console.log(`  ✅  ${tmpl.name} (${deptName})`);
  }

  // ── 13. Subject enrollments ───────────────────────────────────────────────

  console.log('\n📋  Creating subject enrollments…');
  let enrollCount = 0;
  for (const subj of subjects) {
    for (const cid of subj.classIds.slice(0, 4)) {
      const cIdx = classIds.indexOf(cid);
      await setDoc(instD('subjectEnrollments', `${subj.id}_${cid}`), {
        subjectId: subj.id, subjectName: subj.name,
        classId: cid, className: cIdx >= 0 ? CLASS_DATA[cIdx].name : '',
        institutionId: iid, termId: activeTerm,
        teacherIds: subj.teacherUids.map(t => t.uid),
        teacherNames: subj.teacherUids.map(t => t.name),
        createdAt: serverTimestamp(),
      });
      enrollCount++;
    }
  }
  console.log(`  ✅  ${enrollCount} enrollments`);

  // ── 14. Timetable slots ───────────────────────────────────────────────────

  console.log('\n🕐  Creating timetable slots…');
  let slotCount = 0;
  for (let s = 0; s < subjects.length; s++) {
    const subj    = subjects[s];
    const teacher = subj.teacherUids[0];
    for (let c = 0; c < Math.min(3, subj.classIds.length); c++) {
      const cid   = subj.classIds[c];
      const cIdx  = classIds.indexOf(cid);
      const cname = cIdx >= 0 ? CLASS_DATA[cIdx].name : '';
      await setDoc(newRef('timetableSlots'), {
        institutionId: iid, termId: activeTerm, termName: 'Term 2',
        subjectId: subj.id, subjectName: subj.name,
        teacherId: teacher.uid, teacherName: teacher.name,
        classId: cid, className: cname,
        days: [DAYS[s % 5], DAYS[(s + 2) % 5]],
        startTime: TIMES[s % TIMES.length], duration: 60,
        room: `Room ${(slotCount % 20) + 101}`,
        createdBy: primaryAdminUid, createdByRole: 'institution_admin',
        createdAt: serverTimestamp(),
      });
      slotCount++;
    }
  }
  console.log(`  ✅  ${slotCount} timetable slots`);

  // ── 15. Gradebooks + columns ──────────────────────────────────────────────

  console.log('\n📓  Creating gradebooks and columns…');
  const gbMeta = [];
  for (let s = 0; s < Math.min(10, subjects.length); s++) {
    const subj = subjects[s];
    const cid  = subj.classIds[0];
    if (!cid) continue;
    const gbRef = newRef('gradebooks');
    await setDoc(gbRef, {
      institutionId: iid, classId: cid, subjectId: subj.id,
      termId: activeTerm, createdBy: subj.teacherUids[0]?.uid ?? primaryAdminUid,
      createdAt: serverTimestamp(),
    });
    gbMeta.push(gbRef.id);
    const colsRef = collection(db, 'institutions', iid, 'gradebooks', gbRef.id, 'columns');
    for (const col of [
      { label:'Quiz 1',       assessmentType:'coursework', maxScore:20,  columnWeight:0.2, order:1 },
      { label:'Midterm Test', assessmentType:'coursework', maxScore:50,  columnWeight:0.3, order:2 },
      { label:'Final Exam',   assessmentType:'exam',       maxScore:100, columnWeight:0.5, order:3 },
    ]) {
      await addDoc(colsRef, {
        ...col, institutionId: iid, subjectId: subj.id,
        createdBy: subj.teacherUids[0]?.uid ?? primaryAdminUid, createdAt: serverTimestamp(),
      });
    }
  }
  console.log(`  ✅  ${gbMeta.length} gradebooks × 3 columns`);

  // ── 16. Results ───────────────────────────────────────────────────────────

  console.log('\n📊  Creating results…');
  let resultCount = 0;
  for (let si = 0; si < Math.min(8, subjects.length); si++) {
    const subj    = subjects[si];
    const teacher = subj.teacherUids[0];
    const cid     = subj.classIds[0];
    if (!cid || !teacher) continue;
    const classStudents = students.filter(s => s.classId === cid).slice(0, 8);
    const assessments   = [
      { name:'Term 2 Coursework 1', type:'coursework', max:50,  weight:0.3 },
      { name:'Term 2 Mid-Test',     type:'coursework', max:50,  weight:0.3 },
      { name:'Term 2 Exam',         type:'exam',       max:100, weight:0.4 },
    ];
    for (const student of classStudents) {
      for (const a of assessments) {
        await setDoc(newRef('results'), {
          studentId: student.uid, teacherId: teacher.uid,
          classId: cid, termId: activeTerm, institutionId: iid,
          departmentId: subj.deptId, subjectId: subj.id,
          assessmentName: a.name, assessmentType: a.type,
          score: score(a.max), maxScore: a.max, weight: a.weight, date: '2026-03-15',
        });
        resultCount++;
      }
    }
  }
  console.log(`  ✅  ${resultCount} results`);

  // ── 17. Feedback comments ─────────────────────────────────────────────────

  console.log('\n💬  Creating feedback comments…');
  let fbCount = 0;
  for (let si = 0; si < Math.min(8, subjects.length); si++) {
    const subj    = subjects[si];
    const teacher = subj.teacherUids[0];
    const cid     = subj.classIds[0];
    if (!cid || !teacher) continue;
    for (const student of students.filter(s => s.classId === cid).slice(0, 6)) {
      await setDoc(newRef('feedbackComments'), {
        studentId: student.uid, teacherId: teacher.uid,
        classId: cid, termId: activeTerm, institutionId: iid,
        departmentId: subj.deptId, subjectId: subj.id,
        comment: FEEDBACK_COMMENTS[fbCount % FEEDBACK_COMMENTS.length],
        conductGrade: ['G','S','F','U','P','D'][fbCount % 6],
        commentNumber: (fbCount % 15) + 1,
        teacherName: teacher.name, createdAt: serverTimestamp(),
      });
      fbCount++;
    }
  }
  console.log(`  ✅  ${fbCount} feedback comments`);

  // ── 18. General attendance ────────────────────────────────────────────────

  console.log('\n📆  Creating general attendance registers…');
  const attDates = ['2026-01-13','2026-01-14','2026-01-15','2026-01-20','2026-01-21','2026-01-27','2026-01-28','2026-02-03','2026-02-04','2026-02-10'];
  let attCount = 0;
  for (let ci = 0; ci < Math.min(5, classIds.length); ci++) {
    const cid       = classIds[ci];
    const className = CLASS_DATA[ci].name;
    const studs     = students.filter(s => s.classId === cid);
    if (!studs.length) continue;
    for (const date of attDates) {
      for (const session of ['AM','PM']) {
        const records = {};
        for (const st of studs) records[st.uid] = { state: rnd(['P','P','P','P','A','L']), studentName: st.name };
        await setDoc(newRef('generalAttendance'), {
          institutionId: iid, classId: cid, className, termId: activeTerm,
          academicYearId: yearId, date, session, records,
          submittedBy: primaryAdminUid, submittedAt: serverTimestamp(),
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        attCount++;
      }
    }
  }
  console.log(`  ✅  ${attCount} general attendance registers`);

  // ── 19. Subject attendance ────────────────────────────────────────────────

  console.log('\n📆  Creating subject attendance records…');
  let subjAttCount = 0;
  for (let si = 0; si < Math.min(6, subjects.length); si++) {
    const subj    = subjects[si];
    const teacher = subj.teacherUids[0];
    const cid     = subj.classIds[0];
    if (!cid || !teacher) continue;
    const studs = students.filter(s => s.classId === cid);
    if (!studs.length) continue;
    for (const date of attDates.slice(0, 8)) {
      const records = {};
      for (const st of studs) records[st.uid] = { state: rnd(['P','P','P','A']), studentName: st.name };
      await setDoc(newRef('subjectAttendance'), {
        institutionId: iid, subjectId: subj.id, subjectName: subj.name,
        classId: cid, termId: activeTerm, academicYearId: yearId,
        sessionDate: date, teacherId: teacher.uid, teacherName: teacher.name,
        records, submittedBy: teacher.uid, submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      subjAttCount++;
    }
  }
  console.log(`  ✅  ${subjAttCount} subject attendance records`);

  // ── 20. Attendance summaries ──────────────────────────────────────────────

  console.log('\n📊  Creating attendance summaries…');
  for (const student of students) {
    const P = randInt(15,25), A = randInt(0,4), L = randInt(0,3), S = randInt(0,2), E = randInt(0,1);
    const total = 30;
    await setDoc(instD('attendanceSummaries', `${student.uid}_${activeTerm}`), {
      studentId: student.uid, termId: activeTerm, academicYearId: yearId,
      institutionId: iid, classId: student.classId,
      P, A, L, S, E,
      totalExpectedSessions: total, filledSessions: P+A+L+S+E,
      sessionsAbsent: A+S+E, daysLate: L,
      attendanceRate: Math.round(((P+L)/total)*100),
      updatedAt: serverTimestamp(),
    });
  }
  console.log(`  ✅  ${students.length} attendance summaries`);

  // ── 21. Announcements ─────────────────────────────────────────────────────

  console.log('\n📢  Creating announcements…');
  for (let i = 0; i < ANNOUNCEMENT_SUBJECTS.length; i++) {
    await setDoc(newRef('announcements'), {
      institutionId: iid, title: ANNOUNCEMENT_SUBJECTS[i],
      body: `Full content for: "${ANNOUNCEMENT_SUBJECTS[i]}". Please take note of the relevant dates and ensure all stakeholders are informed.`,
      postedBy: primaryAdminUid, postedByName: 'Eleanor Hargrove',
      targetRoles: ['senior_teacher','regular_teacher','student','parent'],
      publishedAt: Timestamp.fromDate(new Date(`2026-0${(i%6)+1}-${String((i%28)+1).padStart(2,'0')}`)),
      createdAt: serverTimestamp(),
    });
  }
  console.log(`  ✅  ${ANNOUNCEMENT_SUBJECTS.length} announcements`);

  // ── 22. Events ────────────────────────────────────────────────────────────

  console.log('\n📅  Creating events…');
  for (let i = 0; i < EVENT_NAMES.length; i++) {
    const m = String((i%10)+1).padStart(2,'0'), d = String((i%27)+1).padStart(2,'0');
    await setDoc(newRef('events'), {
      institutionId: iid, title: EVENT_NAMES[i],
      description: `Details for ${EVENT_NAMES[i]}. All relevant staff and students should participate.`,
      startDate: `2026-${m}-${d}`, endDate: `2026-${m}-${d}`, allDay: true,
      category: ['academic','sports','cultural','administrative'][i%4],
      createdBy: primaryAdminUid, createdAt: serverTimestamp(),
    });
  }
  console.log(`  ✅  ${EVENT_NAMES.length} events`);

  // ── 23. Student activities ────────────────────────────────────────────────

  console.log('\n🏃  Creating student activities…');
  for (let i = 0; i < 40; i++) {
    const student = students[i % students.length];
    await setDoc(newRef('studentActivities'), {
      institutionId: iid, studentId: student.uid,
      classId: student.classId, termId: activeTerm, academicYearId: yearId,
      activityName: ACTIVITY_NAMES[i % ACTIVITY_NAMES.length],
      createdAt: serverTimestamp(), createdBy: primaryAdminUid, updatedAt: serverTimestamp(),
    });
  }
  console.log(`  ✅  40 student activities`);

  // ── 24. Student responsibilities ─────────────────────────────────────────

  console.log('\n🎖️   Creating student responsibilities…');
  for (let i = 0; i < 40; i++) {
    const student = students[i % students.length];
    await setDoc(newRef('studentResponsibilities'), {
      institutionId: iid, studentId: student.uid,
      classId: student.classId, termId: activeTerm, academicYearId: yearId,
      title: RESP_TITLES[i % RESP_TITLES.length],
      organisation: ['Student Council','House Committee','School Board',null][i%4],
      createdAt: serverTimestamp(), createdBy: primaryAdminUid, updatedAt: serverTimestamp(),
    });
  }
  console.log(`  ✅  40 student responsibilities`);

  // ── 25. Report card comments ──────────────────────────────────────────────

  console.log('\n📝  Creating report card comments…');
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    await setDoc(instD('reportCardComments', `${student.uid}_${activeTerm}`), {
      institutionId: iid, studentId: student.uid,
      termId: activeTerm, academicYearId: yearId,
      classSupervisorComment: `${student.name} has been a diligent member of the class. ${rnd(PRINCIPAL_CMTS)}`,
      gradeSupervisorComment: `Performance this term has been satisfactory. ${rnd(PRINCIPAL_CMTS)}`,
      principalComment: rnd(PRINCIPAL_CMTS),
      vicePrincipalComment: 'Continue to strive for excellence in all areas.',
      updatedAt: serverTimestamp(), updatedBy: primaryAdminUid,
    });
  }
  console.log(`  ✅  ${students.length} report card comments`);

  // ── 26. Audit log ─────────────────────────────────────────────────────────

  console.log('\n🔍  Creating audit log entries…');
  const auditTypes = ['account_created','role_change','password_reset','account_suspended','permission_change'];
  for (let i = 0; i < 40; i++) {
    const target = rnd(allTeachers);
    await setDoc(newRef('audit_log'), {
      institutionId: iid,
      eventType: auditTypes[i % auditTypes.length],
      detail: `Seed entry #${i+1}`,
      targetUid: target.uid, targetName: target.name,
      performedBy: primaryAdminUid, performedByName: 'Eleanor Hargrove',
      timestamp: new Date(`2026-0${(i%6)+1}-${String((i%27)+1).padStart(2,'0')}`).toISOString(),
    });
  }
  console.log(`  ✅  40 audit log entries`);

  // ── Done ──────────────────────────────────────────────────────────────────

  await signOut(auth);

  console.log('\n✅  Seed complete!\n');
  console.log('═══════════════════════════════════════════════');
  console.log('  Institution ID : ' + iid);
  console.log('  Password (all) : Test@1234');
  console.log('───────────────────────────────────────────────');
  console.log('  Admin 1        : ehargrove@genr8academy.edu');
  console.log('  Admin 2        : walleyne@genr8academy.edu');
  console.log('  Senior Teacher : margaret.thornton@genr8academy.edu');
  console.log('  Regular Teacher: alice.fletcher@genr8academy.edu');
  console.log('  Student        : aiden.clarke.student@genr8academy.edu');
  console.log('  Parent         : michael.clarke.parent@genr8academy.edu');
  console.log('═══════════════════════════════════════════════\n');
}

seed().catch(err => {
  console.error('\n❌  Seed failed:', err.message ?? err);
  process.exit(1);
});
