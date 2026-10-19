import { describe, expect, it } from 'vitest';
import examFormRaw from '../../components/forms/ExamForm.tsx?raw';
import disciplinaryFormRaw from '../../components/forms/DisciplinaryActionForm.tsx?raw';
import timetableFormRaw from '../../components/forms/TimetableSlotForm.tsx?raw';
import assignmentOptionsRaw from '../../hooks/useAssignmentFormOptions.ts?raw';
import scheduleRaw from '../../scenes/(dashboard)/schedule/index.tsx?raw';
import teachersMetaRaw from '../../hooks/useTeachersMeta.ts?raw';
import usersHookRaw from '../../hooks/useInstitutionUsers.ts?raw';
import teachingStaffHookRaw from '../../hooks/useTeachingStaff.ts?raw';

// The add forms and the schedule page used to read the users collection themselves every time they opened.
// They now take people from the shared cached lists (hooks/useInstitutionUsers, useTeachingStaff, useTeachersMeta),
// so opening a form inside the cache window reads nothing. HouseForm is deliberately not here: its roster feeds a
// batch write, so it keeps a live read.

const lf = (s: string) => s.split('\r\n').join('\n');
const RAW_USERS_READ = /collection\(\s*db\s*,\s*["']users["']\s*\)/;

describe('forms that take people from the shared lists', () => {
  it('the Exam, Disciplinary and Schedule pages and the Assignment options no longer read the users collection', () => {
    for (const [name, src] of Object.entries({ exam: examFormRaw, disciplinary: disciplinaryFormRaw, assignmentOptions: assignmentOptionsRaw, schedule: scheduleRaw })) {
      expect(RAW_USERS_READ.test(lf(src)), name).toBe(false);
    }
  });

  it('the Exam form and the Assignment options share one teachers-meta query', () => {
    expect(lf(examFormRaw)).toContain('useTeachersMeta()');
    expect(lf(assignmentOptionsRaw)).toContain('useTeachersMeta()');
    const hook = lf(teachersMetaRaw);
    expect(hook).toContain("queryKey: ['users', institutionId ?? '', 'teacherMeta']");
    expect(hook).toContain('staleTime: LIST_STALE_MS');
  });

  it('keeps the teachers-meta read under the users root, so saving a user refreshes it', () => {
    expect(lf(teachersMetaRaw)).toContain("['users',");
  });

  it('the Disciplinary form asks for the students only when it needs them', () => {
    const src = lf(disciplinaryFormRaw);
    expect(src).toContain('useInstitutionUsers({ enabled: needsStudents })');
    expect(src).toContain('type === "create" && !studentLocked');
  });

  it('the Timetable form keeps its own query only for a senior teacher’s department', () => {
    const src = lf(timetableFormRaw);
    expect(src).toContain("const deptScoped = role === 'senior_teacher' && !!department;");
    expect(src).toContain('useTeachingStaff({ enabled: DATA_MODE === \'live\' && !deptScoped })');
  });

  it('the Schedule toggle refreshes the shared users list after it saves', () => {
    const src = lf(scheduleRaw);
    expect(src).toContain('useInstitutionUsers({ enabled: DATA_MODE === \'live\' && role === \'institution_admin\' })');
    expect(src).toContain("queryClient.invalidateQueries({ queryKey: ['users', institutionId] })");
  });

  it('the shared hooks take an enabled flag, so a form that does not need people does not load them', () => {
    expect(lf(usersHookRaw)).toContain('{ enabled = true }: { enabled?: boolean } = {}');
    expect(lf(teachingStaffHookRaw)).toContain('useInstitutionUsers({ enabled })');
  });
});
