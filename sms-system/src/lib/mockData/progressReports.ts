import { Timestamp } from 'firebase/firestore';
import type { ProgressReportDocument } from '@/lib/firebase';

// Mock data for the Progress Reports page (USE_MOCK), independent of any
// other mock dataset — src/lib/mockData/ doesn't yet have sibling files for
// students/terms/classes shaped as simple {id, name} dropdown options, so
// this feature's small reference lists are defined locally rather than
// reused from elsewhere.

export const progressReportStudentsMock = [
  { id: 'mock-student-1', name: 'John Doe', classId: 'mock-class-1', className: '5A' },
  { id: 'mock-student-2', name: 'Jane Doe', classId: 'mock-class-1', className: '5A' },
  { id: 'mock-student-3', name: 'Mike Geller', classId: 'mock-class-2', className: '5B' },
] as const;

export const progressReportTermsMock = [
  { id: 'mock-term-1', name: 'Term 1' },
  { id: 'mock-term-2', name: 'Term 2' },
] as const;

export const progressReportClassesMock = [
  { id: 'mock-class-1', name: '5A' },
  { id: 'mock-class-2', name: '5B' },
] as const;

// Fixed subject roster used both by the seed rows below and by the page's
// mock-mode generate simulation (src/scenes/(dashboard)/progress-reports) —
// keeps fabricated snapshots internally consistent without needing a mock
// `subjects` collection of its own.
export const progressReportSubjectsMock = [
  { subjectId: 'mock-subj-math', subjectName: 'Mathematics', teacherId: 'mock-teacher-1', teacherName: 'R. Smith' },
  { subjectId: 'mock-subj-eng',  subjectName: 'English',     teacherId: 'mock-teacher-2', teacherName: 'K. Brown' },
  { subjectId: 'mock-subj-sci',  subjectName: 'Science',     teacherId: 'mock-teacher-3', teacherName: 'D. Iyer' },
] as const;

export type MockRow = ProgressReportDocument & { id: string };

export const progressReportMockDefaults = {
  institutionId: 'mock-institution',
  academicYearId: 'mock-year-1',
  academicYearName: '2025/2026',
  institutionName: 'Riverside Academy',
  institutionAddress: '12 Riverside Drive, Springfield',
  institutionPhone: '555-0100',
  institutionLogoUrl: null,
  authorizedSignature: { mode: 'text' as const, text: 'A. Principal' },
  principalLabel: 'Principal',
  generatedBy: 'mock-admin',
  generatedByName: 'Alex Principal',
};

// Two snapshots for John Doe / Term 1, to exercise "latest per student+term"
// dedup in the page (§13.6) — the mock table should show only the newer one.
export const progressReportsMock: MockRow[] = [
  {
    id: 'mock-pr-1',
    ...progressReportMockDefaults,
    studentId: 'mock-student-1',
    studentName: 'John Doe',
    classId: 'mock-class-1',
    className: '5A',
    termId: 'mock-term-1',
    termName: 'Term 1',
    subjects: [
      { subjectId: 'mock-subj-math', subjectName: 'Mathematics', teacherId: 'mock-teacher-1', teacherName: 'R. Smith', average: 78.5, letterGrade: 'B+' },
      { subjectId: 'mock-subj-eng', subjectName: 'English', teacherId: 'mock-teacher-2', teacherName: 'K. Brown', average: 82, letterGrade: 'A-' },
    ],
    overallAverage: 80.3,
    generatedAt: Timestamp.fromDate(new Date('2026-02-10T10:00:00Z')),
  },
  {
    id: 'mock-pr-2',
    ...progressReportMockDefaults,
    studentId: 'mock-student-1',
    studentName: 'John Doe',
    classId: 'mock-class-1',
    className: '5A',
    termId: 'mock-term-1',
    termName: 'Term 1',
    subjects: [
      { subjectId: 'mock-subj-math', subjectName: 'Mathematics', teacherId: 'mock-teacher-1', teacherName: 'R. Smith', average: 84, letterGrade: 'A-' },
      { subjectId: 'mock-subj-eng', subjectName: 'English', teacherId: 'mock-teacher-2', teacherName: 'K. Brown', average: 85.5, letterGrade: 'A' },
      { subjectId: 'mock-subj-sci', subjectName: 'Science', teacherId: 'mock-teacher-3', teacherName: 'D. Iyer', average: 76, letterGrade: 'B' },
    ],
    overallAverage: 81.8,
    generatedAt: Timestamp.fromDate(new Date('2026-03-18T14:30:00Z')),
  },
  {
    id: 'mock-pr-3',
    ...progressReportMockDefaults,
    studentId: 'mock-student-2',
    studentName: 'Jane Doe',
    classId: 'mock-class-1',
    className: '5A',
    termId: 'mock-term-1',
    termName: 'Term 1',
    subjects: [
      { subjectId: 'mock-subj-math', subjectName: 'Mathematics', teacherId: 'mock-teacher-1', teacherName: 'R. Smith', average: 91, letterGrade: 'A' },
      { subjectId: 'mock-subj-eng', subjectName: 'English', teacherId: 'mock-teacher-2', teacherName: 'K. Brown', average: 88, letterGrade: 'A-' },
    ],
    overallAverage: 89.5,
    generatedAt: Timestamp.fromDate(new Date('2026-03-15T09:15:00Z')),
  },
  {
    id: 'mock-pr-4',
    ...progressReportMockDefaults,
    studentId: 'mock-student-3',
    studentName: 'Mike Geller',
    classId: 'mock-class-2',
    className: '5B',
    termId: 'mock-term-2',
    termName: 'Term 2',
    subjects: [
      { subjectId: 'mock-subj-math', subjectName: 'Mathematics', teacherId: 'mock-teacher-1', teacherName: 'R. Smith', average: 63, letterGrade: 'C+' },
      { subjectId: 'mock-subj-sci', subjectName: 'Science', teacherId: 'mock-teacher-3', teacherName: 'D. Iyer', average: 71, letterGrade: 'B' },
    ],
    overallAverage: 67,
    generatedAt: Timestamp.fromDate(new Date('2026-05-02T11:45:00Z')),
  },
];
