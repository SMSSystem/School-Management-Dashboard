// Reports: report cards, progress reports, report-card comments, student activities and disciplinary actions.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from 'firebase/firestore';
import type { FeedbackCommentDocument, ResultDocument } from './assessment';
import type { AuthorizedSignature, GradingSystem } from './institution';

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
