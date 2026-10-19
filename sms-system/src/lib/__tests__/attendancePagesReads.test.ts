import { describe, expect, it } from 'vitest';
import myPageRaw from '../../scenes/(dashboard)/attendance/my/index.tsx?raw';
import childPageRaw from '../../scenes/(dashboard)/attendance/child/index.tsx?raw';
import hooksRaw from '../../hooks/useMyAttendance.ts?raw';
import formModalRaw from '../../components/FormModal.tsx?raw';

// My Attendance (a student) and Child Attendance (a parent) used to read the term's attendance documents, the whole
// subjectEnrollments collection and one subject query per subject with getDocs in effects, on every visit. They now
// use the cached queries in hooks/useMyAttendance.ts (60 seconds for the attendance, five minutes for the shared
// enrollments), so a visit inside the window reads nothing.

const lf = (s: string) => s.split('\r\n').join('\n');
const RAW_ATTENDANCE_READ = /(generalAttendance|subjectAttendance|subjectEnrollments)/;

describe('the student and parent attendance pages', () => {
  it.each([
    ['My Attendance', myPageRaw],
    ['Child Attendance', childPageRaw],
  ])('%s reads attendance only through the cached hooks', (_name, raw) => {
    const src = lf(raw);
    expect(src).toContain("from '@/hooks/useMyAttendance'");
    expect(src).toContain('useMyGeneralAttendance(');
    expect(src).toContain('useMySubjectAttendance(');
    expect(src).not.toMatch(RAW_ATTENDANCE_READ);
  });

  it('My Attendance makes no Firestore read of its own', () => {
    expect(lf(myPageRaw)).not.toContain("from 'firebase/firestore'");
  });

  it('Child Attendance takes the parent’s children from the cached linked-children hook, and reads nothing itself', () => {
    const src = lf(childPageRaw);
    expect(src).toContain('useLinkedChildren()');
    expect(src).not.toContain("from 'firebase/firestore'");
    expect(src).not.toContain('student_parents');
  });
});

describe('the attendance hooks', () => {
  const src = lf(hooksRaw);

  it('keep the attendance for the live window and the shared enrollments for the list window', () => {
    expect(src.match(/staleTime: LIVE_STALE_MS/g)).toHaveLength(2);
    expect(src.match(/staleTime: LIST_STALE_MS/g)).toHaveLength(1);
  });

  it('read nothing outside live data', () => {
    expect(src).toContain("DATA_MODE === 'live'");
  });

  it('ask only for the person’s own rows: the cached value is the reduced rows, not the class documents', () => {
    expect(src).toContain('buildDayRows(');
    expect(src).toContain('buildSubjectSessions(');
  });
});

describe('the Subject form refreshes the shared enrollments', () => {
  it('invalidates them when a subject is saved or deleted', () => {
    const src = lf(formModalRaw);
    expect(src).toContain('if (table === "subject") {');
    expect(src).toContain('queryClient.invalidateQueries({ queryKey: subjectEnrollmentsKey(institutionId ?? "") });');
  });
});
