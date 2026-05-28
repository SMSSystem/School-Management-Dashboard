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

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

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
