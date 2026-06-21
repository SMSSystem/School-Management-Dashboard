import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, Timestamp } from 'firebase/firestore';

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

export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export type Role = 'super_admin' | 'institution_admin' | 'senior_teacher' | 'regular_teacher' | 'student' | 'parent';

export type TeacherType = 'regular' | 'senior';

export type UserStatus = 'active' | 'inactive';

export type TermStatus = 'upcoming' | 'active' | 'completed';

export type GradingSystem = 'flat' | 'weighted';

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
};

export type DepartmentDocument = {
  name: string;
  institutionId: string;
  headTeacherId?: string;  // links to teachers/{uid}
};

export type ClassDocument = {
  name: string;
  capacity: number;
  grade: number;
  institutionId: string;
  supervisorId?: string;    // links to users/{uid} where role === 'senior_teacher'
  supervisorName?: string;  // denormalized display name
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
  teacherId: string;
  classId: string;
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
  address?: string;
  status?: 'active' | 'inactive' | 'suspended';
  department?: string;
  emergencyContact?: string;
  linkedAccounts?: string;
  canGenerateSchedule?: boolean;
  // Senior teacher homeroom assignment
  assignedClassId?: string | null;
  assignedClassName?: string | null;
  // Student class assignment
  classId?: string | null;
  // Student profile extensions
  institutionStudentId?: string | null;
  dateOfBirth?: string | null;   // ISO "YYYY-MM-DD"
  gender?: 'Male' | 'Female' | null;
  houseId?: string | null;
  houseName?: string | null;
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
  gradingSystem?: GradingSystem;
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
  | 'permission_change';

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
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[];
  startTime: string;
  duration: number;
  room?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp | string;
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
      state: 'P' | 'A' | 'L' | 'S' | 'E';
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
  commentNumber: number | null;
};

export type ReportCardDocument = {
  studentId: string;
  studentName: string;
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
  demerits: number | null;
  suspensions: number | null;
  detentions: number | null;
  generatedAt: Timestamp;
  generatedBy: string;
  generatedByRole: string;
  generatedViaBatch: boolean;
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
  totalExpectedSessions: number;
  filledSessions: number;
  sessionsAbsent: number;
  daysLate: number;
  attendanceRate: number;
  updatedAt: Timestamp;
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
