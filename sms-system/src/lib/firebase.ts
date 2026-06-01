import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app);

export type Role = 'super_admin' | 'institution_admin' | 'senior_teacher' | 'regular_teacher' | 'student' | 'parent';

export type TeacherType = 'regular' | 'senior';

export type UserStatus = 'active' | 'inactive';

export type TermStatus = 'upcoming' | 'active' | 'closed';

export type GradingSystem = 'flat' | 'weighted';

export type TermDocument = {
  name: string;
  institutionId: string;
  startDate: string;
  endDate: string;
  status: TermStatus;
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
  termId: string;
  supervisor?: string;
  classTeacherId?: string;  // links to teachers/{uid} — required by isClassTeacherFor() rule
  departmentId?: string;
};

export type ResultDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  assessmentName: string;
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
  comment: string;
  createdAt: string;
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
};

export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: string;
  status: 'active' | 'suspended';
  gradingSystem?: GradingSystem;
  location?: string;
  userCount?: number;
  studentCount?: number;
  teacherCount?: number;
  lastActiveAt?: string;
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
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[];
  startTime: string;
  duration: number;
  room?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
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
