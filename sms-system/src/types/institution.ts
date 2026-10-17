// The institution and its structure: classes, subjects, departments, houses, terms, the academic calendar and the timetable.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from 'firebase/firestore';

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
  // Optional label on ONE of teacherIds (same access as the others): see lib/subjectTeachers.ts.
  assistantTeacherId?: string;
  assistantTeacherName?: string;
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
