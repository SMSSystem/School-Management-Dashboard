import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Timestamp } from 'firebase/firestore';

export { Timestamp };

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const app = initializeApp(firebaseConfig);

// Local/CI escape hatch — must run before initializeAppCheck. Only ever set
// in dev; a production build never defines VITE_FIREBASE_APPCHECK_DEBUG_TOKEN,
// so this branch is inert in production.
//
// Two modes, both driven by the same env var:
//   - VITE_FIREBASE_APPCHECK_DEBUG_TOKEN="true"        -> bootstrap mode: asks
//     the SDK to generate a fresh debug token and log it to the console. Use
//     this once to discover a token, then register it in Firebase Console ->
//     App Check -> Manage debug tokens.
//   - VITE_FIREBASE_APPCHECK_DEBUG_TOKEN="<real token>" -> pins that exact,
//     already-registered token instead of generating a new one each run.
// A literal "true" must map to the boolean true, not the string "true" —
// Firebase treats a string value as a token to use as-is, so passing the
// word "true" (or any other non-token placeholder) as a string gets rejected
// by the server with 403, not treated as a request to generate one.
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
  const debugTokenSetting = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string;
  (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    debugTokenSetting === 'true' ? true : debugTokenSetting;
}

// Guarded: without a configured site key, initializeAppCheck throws. This
// lets a developer without App Check env vars set up keep running the app
// locally against a project with enforcement still off — enforcement should
// only flip on in the Console once every environment that talks to this
// project has a working App Check configuration.
if (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // Enables resume-token delta billing on requery within 30 minutes (see
  // docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md §1.2/§2). Multi-tab
  // manager required — this app is normally used with multiple tabs open, and
  // the single-tab default would silently fall back to memory-only caching in
  // a second tab.
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export type Role = 'super_admin' | 'institution_admin' | 'senior_teacher' | 'regular_teacher' | 'student' | 'parent';

export type TeacherType = 'regular' | 'senior';

export type UserStatus = 'active' | 'inactive';

export type TermStatus = 'upcoming' | 'active' | 'completed';

export type GradingSystem = 'flat' | 'weighted';

export type GradeTrackingFrequency = 'bi-monthly' | 'monthly';

export type TermDocument = {
  name: string;
  institutionId: string;
  startDate: string;
  endDate: string;
  status: TermStatus;
  // Academic calendar fields (present on terms created via AcademicCalendarPage)
  academicYearId?: string;
  termNumber?: 1 | 2 | 3;
  defaultName?: string;
  // Admin-edited overrides for generated grade-tracking period labels (e.g.
  // "JAN/FEB"), keyed by the period's index. See lib/gradeTrackingPeriods.ts.
  periodLabelOverrides?: Record<string, string>;
};

export type DepartmentDocument = {
  name: string;
  institutionId: string;
  headTeacherId?: string;  // links to teachers/{uid}
};

export type ClassDocument = {
  name: string;
  capacity: number;
  // Optional as of CUSTOM_CALENDAR_MODE_SPEC.md §4 — was: number (required,
  // 1–13). Still always populated by ClassForm.tsx today (its zod schema is
  // unchanged by this step); only custom-mode institutions will ever produce
  // a class with no grade, once ClassForm's own required-ness is relaxed
  // (spec Implementation Order item 7).
  grade?: number;
  institutionId: string;
  termId: string;
  supervisor?: string;
  classTeacherId?: string;  // links to teachers/{uid} — required by isClassTeacherFor() rule
  departmentId?: string;
};

export type SubjectDocument = {
  name: string;
  description?: string;
  institutionId: string;
  classScope: 'institution' | 'class';
  classIds: string[];
  classNames: string[];
  teacherIds: string[];
  teacherNames: string[];
  cwWeight: number;
  examWeight: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  frequency?: 'daily' | 'weekly' | 'fortnightly' | 'custom';
  sessionDayOfWeek?: number[];
  customFrequencyDays?: string[];
  fortnightlyOffset?: 0 | 1;
};

export type ResultDocument = {
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;
  assessmentName: string;
  assessmentType: 'coursework' | 'exam';
  score: number;
  maxScore: number;
  weight?: number;
  date?: string;
  createdAt: Timestamp;
  // Set only on gradebook-originated results (Gradebook's performSave);
  // absent on manually-entered ones (ResultForm.tsx).
  gradebookColumnId?: string;
  columnWeight?: number;
  source?: 'gradebook';
  // Set only on assignment-grading-originated results (ASSIGNMENTS_FEATURE_
  // SPEC.md §4.3) — lets the Gradebook conversion feature (§4.5) find every
  // result one assignment has produced, in either gradingMode. Absent on
  // every other results-writing path (Gradebook's own performSave(),
  // ResultForm.tsx).
  assignmentId?: string;
};

export type FeedbackCommentDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;
  comment: string;
  conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D';
  commentNumber: number;
  commentNumbers?: number[];
  createdAt: Timestamp | string;
  teacherName?: string;
};

export type ReportDocument = {
  studentId: string;
  studentName: string;
  termId: string;
  termName: string;
  institutionId: string;
  institutionName: string;
  generatedAt: string;
  generatedBy: string;
  generatedByRole: string;
  gradingSystem: GradingSystem;
  departmentId?: string;
  grades: ResultDocument[];
  feedback: FeedbackCommentDocument[];
  overallScore: number;
};

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export type ParentDocument = {
  institutionId: string;
  phone?: string;
  address?: string;
};

export type UserDocument = {
  role: Role;
  name: string;
  institutionId: string;
  phone?: string;
  phone2?: string | null;
  idNumber?: string | null;
  // Set true at creation time on every account an admin creates — both
  // AdminCreateUserForm.tsx's single-account flow (including when embedded
  // by ConvertToAccountsPanel.tsx for registration conversions) and the
  // Students bulk-import target (see
  // docs/miscellaneous-specs/SPREADSHEET_IMPORT_STUDENTS_SPEC.md) — since
  // either way, the password was chosen by someone other than the account
  // owner. Cleared by the account owner once they complete the forced
  // first-login password change (Protected.tsx's gate). Omitted (not false)
  // on accounts predating this field.
  mustChangePassword?: boolean;
  address?: string;
  status?: 'active' | 'inactive' | 'suspended';
  department?: string;
  emergencyContact?: string;
  linkedAccounts?: string;
  canGenerateSchedule?: boolean;
  // Senior teacher homeroom assignment
  assignedClassId?: string | null;
  assignedClassName?: string | null;
  // Senior teacher homeroom physical location — required (in the UI) once
  // assignedClassId is set; building is optional for single-building campuses.
  homeroomRoom?: string | null;
  homeroomBuilding?: string | null;
  // Student class assignment
  classId?: string | null;
  // Student profile extensions
  institutionStudentId?: string | null;
  dateOfBirth?: string | null;   // ISO "YYYY-MM-DD"
  gender?: 'Male' | 'Female' | null;
  houseId?: string | null;
  houseName?: string | null;
  toursCompleted?: Record<string, boolean>;
};

// Subcollection doc: users/{uid}/photo/current (fixed doc ID, no history).
// Deliberately not a field on UserDocument — see
// docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md §Background/§Design
// Decisions: the users collection is read broadly and unpaginated by the
// Student/Teacher list pages, so keeping the (multi-KB) photo off that
// document means those listeners never transfer it.
export type UserPhotoDocument = {
  dataUrl: string; // "data:image/jpeg;base64,..." | "data:image/png;base64,..." | "data:image/webp;base64,..."
  // Denormalized rather than resolved via get(users/{uid}) in the Firestore
  // rule — required because AdminCreateUserForm.tsx writes this document in
  // the SAME batch as the user document's own first-ever creation. Firestore
  // rules' get() sees pre-batch state, so a get() on users/{uid} at that
  // moment hits a document that doesn't exist yet and fails the whole
  // (atomic) batch. See firestore.rules' users/{uid}/photo/{photoId} block.
  institutionId: string;
  updatedAt: Timestamp;
  updatedBy: string; // uid of the admin who set it
};

export type AuthorizedSignature = {
  mode: 'image' | 'text';
  imageUrl?: string;  // base64 data URL; max 300 px
  text?: string;      // max 30 chars
};

export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: Timestamp | string;
  status: 'active' | 'suspended';
  // Set once, at onboarding (CUSTOM_CALENDAR_MODE_SPEC.md §4.1) — absent on
  // every institution created before this field existed, which is
  // equivalent to 'academic_year' everywhere this is read.
  calendarMode?: 'academic_year' | 'custom';
  gradingSystem?: GradingSystem;
  gradeTrackingFrequency?: GradeTrackingFrequency;
  location?: string;
  userCount?: number;
  studentCount?: number;
  teacherCount?: number;
  lastActiveAt?: string;
  // Brand fields — all optional; legacy documents without them are valid
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  brandColor?: string;
  logoUrl?: string;
  // Institution profile wizard fields
  profileComplete?: boolean;
  authorizedSignature?: AuthorizedSignature;
  classSupervisorLabel?: string;
  gradeSupervisorLabel?: string;
  principalLabel?: string;
  vicePrincipalLabel?: string;
};

export type HouseDocument = {
  institutionId: string;
  name: string;
  description?: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type StudentActivityDocument = {
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  activityName: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type StudentResponsibilityDocument = {
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  title: string;
  organisation: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type ReportCardCommentDocument = {
  institutionId: string;
  studentId: string;
  termId: string;
  academicYearId: string;
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
  updatedAt: Timestamp;
  updatedBy: string;
};

export type ActivityEventType =
  | 'sign_in'
  | 'sign_out'
  | 'profile_update'
  | 'password_change'
  | 'photo_update'
  | 'notification_change';

export type ActivityLogEntry = {
  eventType: ActivityEventType;
  detail: string;
  timestamp: string;
  uid: string;
  institutionId: string;
};

export type AuditEventType =
  | 'role_change'
  | 'password_reset'
  | 'account_created'
  | 'account_suspended'
  | 'account_deleted'
  | 'permission_change'
  | 'registration_status_change'
  | 'photo_change';

export type AuditLogEntry = {
  eventType: AuditEventType;
  detail: string;
  targetUid: string;
  targetName: string;
  performedBy: string;
  performedByName: string;
  timestamp: string;
  institutionId: string;
};

export type TimetableSlotDocument = {
  institutionId: string;
  termId: string;
  termName: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')[];
  startTime: string;
  duration: number;
  room?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp | string;
};

// departmentId is required by the deployed `exams` rule's isSeniorTeacherFor()
// check, and teacherId by its per-teacher edit check — see firebase-rules.md.
export type ExamDocument = {
  institutionId: string;
  termId: string;
  termName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  departmentId?: string;
  date: string;
  startTime?: string;
  duration?: number;
  room?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp | string;
};

// The 16 fixed classification values from ASSIGNMENTS_FEATURE_SPEC.md §4.1,
// plus 'other' (paired with a required otherTypeLabel — see AssignmentDocument).
export const ASSIGNMENT_VALUE_TYPES = [
  'essay', 'case_study', 'project', 'presentation', 'portfolio', 'homework',
  'in_class_activity', 'self_assessment', 'peer_assessment', 'journal',
  'ict_based_task', 'lab', 'field_work', 'report', 'research_paper', 'other',
] as const;

export type AssignmentValueType = (typeof ASSIGNMENT_VALUE_TYPES)[number];

export const ASSIGNMENT_VALUE_TYPE_LABELS: Record<AssignmentValueType, string> = {
  essay: 'Essay',
  case_study: 'Case Study',
  project: 'Project',
  presentation: 'Presentation',
  portfolio: 'Portfolio',
  homework: 'Homework',
  in_class_activity: 'In-Class Activity',
  self_assessment: 'Self Assessment',
  peer_assessment: 'Peer Assessment',
  journal: 'Journal / Diary / Log',
  ict_based_task: 'ICT Based Task',
  lab: 'Lab',
  field_work: 'Field Work',
  report: 'Report',
  research_paper: 'Research Paper',
  other: 'Other',
};

// departmentId is required by the deployed `assignments` rule's
// isSeniorTeacherFor() check, and teacherId by its per-teacher edit check.
//
// title/type/status/teacherRole/dueDateTimestamp/gradingMode are required
// (not optional) per ASSIGNMENTS_FEATURE_SPEC.md §4.1 — every assignment
// created or edited through AssignmentForm going forward always sets them.
// scripts/backfill-assignment-fields.mjs has since been run live against
// every assignment document that predated this feature, so this gap is
// closed for existing data — but the type still can't guarantee it (a
// future direct Admin SDK write could skip these fields the same way),
// so list/assignments/index.tsx and list/assignments/[id]/index.tsx still
// account for a possibly-missing value defensively (e.g. the detail page's
// "—" type-label fallback) rather than trusting these fields blindly.
export type AssignmentDocument = {
  institutionId: string;
  termId: string;
  termName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  departmentId?: string;
  dueDate: string;
  description?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp | string;

  title: string;
  type: AssignmentValueType;
  otherTypeLabel?: string; // required (client + rules) when type === 'other'
  status: 'draft' | 'published';
  // Denormalized at write time, same pattern as departmentId — lets
  // rules/queries filter by role without a get() (ASSIGNMENTS_FEATURE_SPEC.md §2, §6).
  teacherRole: 'regular_teacher' | 'senior_teacher';
  // Denormalized Timestamp twin of the display-only `dueDate` string, added
  // purely so firestore.rules can do retention-window arithmetic it
  // otherwise couldn't (rules can't parse a string into a Timestamp) — see
  // ASSIGNMENTS_FEATURE_SPEC.md §4.1, §9.1.
  dueDateTimestamp: Timestamp;

  // Attachment — base64, same validated-data-URL shape as UserPhotoDocument,
  // produced by src/lib/documentUpload.ts. Optional: an assignment may have
  // no attached file (description-only).
  attachmentDataUrl?: string;
  attachmentFileName?: string;
  attachmentMimeType?: string; // 'application/pdf' | docx/pptx MIME | 'image/...'
  attachmentSize?: number; // bytes, pre-base64, for the ~500KB cap check

  rubricId?: string; // -> institutions/{id}/rubrics/{rubricId}

  gradingMode: 'gradebook' | 'standalone';
  gradebookColumnId?: string; // required iff gradingMode === 'gradebook'
};

// institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}
// — ASSIGNMENTS_FEATURE_SPEC.md §4.2. Deterministic doc ID (studentId,
// matching the student_parents precedent) — one "current state" document
// per student per assignment. Grade fields are written only by the
// grading role (firestore.rules §5.3), never the student.
export type SubmissionDocument = {
  institutionId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string;

  currentAttemptNumber: number;
  fileDataUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  submittedAt: Timestamp;
  status: 'submitted' | 'late' | 'graded';

  grade?: number;
  maxGrade?: number;
  feedback?: string;
  gradedBy?: string;
  gradedByName?: string;
  gradedAt?: Timestamp;

  // Retention (§9) — denormalized from the parent assignment's dueDate at
  // write time. Normally identical across every submission/attempt under
  // one assignment (dueDate + 182d), EXCEPT for a late submission, where
  // deleteAt = max(dueDate + 182d, submittedAt + 182d) instead (§9.1's
  // late-submission correction) — guaranteeing a full ~6-month window
  // regardless of how late the submission was. Computed identically here
  // and in firestore.rules' expectedDeleteAt(), which is what makes the
  // rule's exact-equality check on this field possible at all.
  assignmentDueDate: string;
  deleteAt: Timestamp;
};

// institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}/attempts/{attemptNumber}
// — full file kept per attempt (§3 decision 12), not just the current one.
// The current attempt's file is also duplicated onto the parent
// SubmissionDocument above, so "download the current submission" stays a
// single-document read instead of a query for the highest attemptNumber.
export type SubmissionAttemptDocument = {
  attemptNumber: number;
  fileDataUrl: string; // cleared by the future 4-month trim script (§9.2, Implementation Order step 7)
  fileName: string;
  mimeType: string;
  fileSize: number;
  submittedAt: Timestamp;

  assignmentDueDate: string;
  deleteAt: Timestamp;
};

// institutions/{institutionId}/assignments/{assignmentId}/submissionTombstones/{studentId}
// — ASSIGNMENTS_FEATURE_SPEC.md §9.4. A small, permanent record surviving
// the TTL deletion above (Implementation Order step 7): written the first
// time a student submits, updated (not replaced) on every resubmission.
// Deliberately no deleteAt/assignmentDueDate — exempt from both TTL
// policies by design, so "never submitted" and "submitted, then aged out"
// stay distinguishable after the real submission data is gone.
export type SubmissionTombstoneDocument = {
  studentId: string;
  firstSubmittedAt: Timestamp;
  lastSubmittedAt: Timestamp;
  attemptCount: number;
  wasGraded: boolean;
};

// institutions/{institutionId}/rubrics/{rubricId} — ASSIGNMENTS_FEATURE_SPEC.md
// §4.4. A shared, reusable library, not owned per-assignment or per-teacher
// (§7's Role Interaction Matrix: any institution_admin/senior_teacher/
// regular_teacher may create or edit any rubric, not just their own).
export type RubricLevel = {
  label: string;
  points: number;
  description?: string;
};

export type RubricCriterion = {
  id: string; // client-generated (crypto.randomUUID()) — distinguishes rows within one rubric's array, not a Firestore doc ID
  name: string;
  maxPoints: number;
  levels: RubricLevel[];
};

export type RubricDocument = {
  institutionId: string;
  title: string;
  description?: string;
  criteria: RubricCriterion[];
  createdBy: string;
  createdByRole: 'institution_admin' | 'senior_teacher' | 'regular_teacher';
  createdAt: Timestamp;
};

export type DisciplinaryActionType = 'merit' | 'demerit' | 'detention' | 'suspension';

// departmentId is not required by rules here (see DISCIPLINARY_ACTION_SPEC.md —
// edit/delete is admin-only, not per-issuer-or-department like exams/assignments).
export type DisciplinaryActionDocument = {
  institutionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  termId: string;
  termName: string;
  type: DisciplinaryActionType;
  reason: string;
  date: string;
  endDate?: string;
  served?: boolean;
  issuedBy: string;
  issuedByName: string;
  issuedByRole: string;
  createdAt: Timestamp | string;
};

export const DISCIPLINARY_ACTION_LABELS: Record<DisciplinaryActionType, string> = {
  merit: 'Merit',
  demerit: 'Demerit',
  detention: 'Detention',
  suspension: 'Suspension',
};

export type AcademicYearDocument = {
  institutionId: string;
  name: string;            // e.g. "2025-2026"
  startDate: string;       // ISO "YYYY-MM-DD"
  endDate: string;         // ISO "YYYY-MM-DD"
  status: 'draft' | 'active' | 'completed';
  schoolWeekDays: number[]; // [1,2,3,4,5] — Mon=1 … Sat=6
  createdAt: Timestamp;
  confirmedAt?: string;    // ISO datetime string
  confirmedBy?: string;    // uid of confirming institution_admin
};

export type NonSchoolDayDocument = {
  institutionId: string;
  academicYearId: string;
  type: 'single' | 'range';
  date?: string;           // ISO "YYYY-MM-DD"; when type === 'single'
  startDate?: string;      // ISO "YYYY-MM-DD"; when type === 'range'
  endDate?: string;        // ISO "YYYY-MM-DD"; when type === 'range'
  reason: string;          // max 100 chars
  source: 'public_holiday' | 'institution_specific';
  isActive: boolean;
  createdAt: Timestamp;
};

export type GeneralAttendanceDocument = {
  institutionId: string;
  classId: string;
  className: string;       // denormalized at save time
  termId: string;
  academicYearId: string;
  date: string;            // ISO "YYYY-MM-DD"
  session: 'AM' | 'PM';
  records: {
    [studentId: string]: {
      state: 'P' | 'A' | 'L' | 'S' | 'E' | 'B';
      reason?: string;     // max 50 chars; E state only
      studentName: string; // denormalized at save time
    };
  };
  submittedBy: string;     // uid of last saver
  submittedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ReportCardSubjectRow = {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  cwWeight: number;
  examWeight: number;
  cwGrade: number | null;
  examGrade: number | null;
  finalGrade: number;
  letterGrade: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'E';
  subjectPosition: number | null;
  conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D' | null;
  commentNumbers: number[] | null;
};

export type ReportCardDocument = {
  studentId: string;
  studentName: string;
  studentGender: 'Male' | 'Female' | null;
  institutionStudentId: string | null;
  dateOfBirth: string | null;
  classId: string;
  className: string;
  classPopulation: number;
  houseId: string | null;
  houseName: string | null;
  termId: string;
  termName: string;
  academicYearId: string;
  academicYearName: string;
  nextTermStart: string | null;
  institutionId: string;
  institutionName: string;
  institutionMotto: string | null;
  institutionAddress: string | null;
  institutionPhone: string | null;
  institutionEmail: string | null;
  institutionLogoUrl: string | null;
  authorizedSignature: AuthorizedSignature | null;
  classSupervisorLabel: string;
  gradeSupervisorLabel: string;
  principalLabel: string;
  vicePrincipalLabel: string;
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
  totalPossibleSessions: number;
  sessionsAbsent: number;
  daysLate: number;
  extraCurricularActivities: string[];
  positionsOfResponsibility: { title: string; organisation: string | null }[];
  gradingSystem: GradingSystem;
  subjects: ReportCardSubjectRow[];
  studentAverage: number | null;
  classAverage: number | null;
  classRank: number | null;
  gpa: number | null;
  merits: number | null;
  demerits: number | null;
  suspensions: number | null;
  detentions: number | null;
  generatedAt: Timestamp;
  generatedBy: string;
  generatedByRole: string;
  generatedViaBatch: boolean;
};

// Progress Report (docs/progress-report/PROGRESS_REPORT_SPEC.md) — an interim,
// point-in-time student snapshot, distinct from ReportCardDocument: many
// immutable documents can exist per studentId+termId (one per generation),
// never upserted, and never written by generateReportCard().
export type ProgressReportSubjectRow = {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  average: number;
  letterGrade: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'E';
};

export type ProgressReportDocument = {
  institutionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  termId: string;
  termName: string;
  academicYearId: string;
  academicYearName: string;
  institutionName: string;
  institutionAddress: string | null;
  institutionPhone: string | null;
  institutionLogoUrl: string | null;
  authorizedSignature: AuthorizedSignature | null;
  principalLabel: string;
  subjects: ProgressReportSubjectRow[];
  overallAverage: number | null;
  generatedAt: Timestamp;
  generatedBy: string;
  generatedByName: string;
};

export type GradebookDocument = {
  institutionId: string;
  classId: string;
  subjectId: string;
  termId: string;
  createdBy: string;
  createdAt: Timestamp;
};

export type GradebookColumnDocument = {
  label: string;
  assessmentType: 'coursework' | 'exam';
  maxScore: number;
  columnWeight: number;
  order: number;
  date?: string;
  institutionId: string;
  subjectId: string;
  createdBy: string;
  createdAt: Timestamp;
};

export type AttendanceSummaryDocument = {
  studentId: string;
  termId: string;
  academicYearId: string;
  institutionId: string;
  classId: string;
  P: number;
  A: number;
  L: number;
  S: number;
  E: number;
  B: number; // Item 7.4 — excluded from this student's own totalExpectedSessions
  totalExpectedSessions: number;
  filledSessions: number;
  sessionsAbsent: number;
  daysLate: number;
  attendanceRate: number;
  updatedAt: Timestamp;
};

export type RegistrationStatus = 'pending' | 'reviewed' | 'converted' | 'rejected';

export type ParentRelationship = 'mother' | 'father' | 'guardian' | 'other';

export type RegistrationGuardian = {
  lastName: string;
  firstName: string;
  address: string;
  contact: string;
  email: string;
  occupation: string;
  work?: string;
};

export type EnrollmentRegistrationDocument = {
  institutionId: string;
  academicYearId: string;
  academicYearName: string;
  status: RegistrationStatus;
  submittedAt: Timestamp | string;
  reviewedAt?: Timestamp | string;
  reviewedBy?: string;
  possibleDuplicate: boolean;
  student: {
    lastName: string;
    firstName: string;
    middleName?: string;
    requestedClass: string;
    dateOfBirth: string;
    gender: 'Male' | 'Female';
    email: string;
    lastSchoolAttended?: string;
    photoDataUrl?: string; // same "data:image/...;base64,..." shape as UserPhotoDocument.dataUrl
  };
  mother: RegistrationGuardian | null;
  father: RegistrationGuardian | null;
  convertedStudentUid?: string;
  convertedMotherUid?: string;
  convertedFatherUid?: string;
};

// Denormalized onto registration_directory alongside name/logoUrl — the
// public registration form reads activeAcademicYearId/Name directly instead
// of institutions/{id}/academicYears, which it cannot read (isSignedIn()
// only). See STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md "Corrections
// found while planning" #1.
export type RegistrationDirectoryEntry = {
  name: string;
  logoUrl?: string;
  acceptingRegistrations: boolean;
  activeAcademicYearId?: string;
  activeAcademicYearName?: string;
  // calendarMode === 'custom' institutions only (CUSTOM_CALENDAR_MODE_SPEC.md
  // §5.4/§6) — every currently active time block, since there's no longer
  // one "the" active year to silently default to. The registration form
  // itself infers custom-mode-ness from this being present/non-empty rather
  // than a separate flag, since it can't read institutions/{id}.calendarMode
  // directly (that doc isn't public).
  openTimeBlocks?: { academicYearId: string; name: string; startDate: string; endDate: string }[];
  updatedAt: Timestamp | string;
  updatedBy: string;
};

export type StudentParentLink = {
  parentId: string;
  studentId: string;
  institutionId: string;
  relationship?: ParentRelationship;
};

export function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    super_admin: 'Super Admin',
    institution_admin: 'Admin',
    senior_teacher: 'Senior Teacher',
    regular_teacher: 'Regular Teacher',
    student: 'Student',
    parent: 'Parent',
  };
  return labels[role];
}
