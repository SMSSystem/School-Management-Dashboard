// Attendance: the general register and the monthly summaries.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from 'firebase/firestore';

/** @expected-unused -- records this Firestore document's shape */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

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

/** @expected-unused -- records this Firestore document's shape */
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
