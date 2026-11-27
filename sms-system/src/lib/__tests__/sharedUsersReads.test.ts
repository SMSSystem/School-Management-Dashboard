import { describe, expect, it } from "vitest";
import examFormRaw from "../../components/forms/ExamForm.tsx?raw";
import disciplinaryFormRaw from "../../components/forms/DisciplinaryActionForm.tsx?raw";
import timetableFormRaw from "../../components/forms/TimetableSlotForm.tsx?raw";
import houseFormRaw from "../../components/forms/HouseForm.tsx?raw";
import { formModalSource as formModalRaw } from "./formModalSource";
import assignmentOptionsRaw from "../../hooks/useAssignmentFormOptions.ts?raw";
import scheduleRaw from "../../scenes/(dashboard)/schedule/index.tsx?raw";
import schedulePageHookRaw from "../../scenes/(dashboard)/schedule/useSchedulePage.ts?raw";
import delegatePanelRaw from "../../scenes/(dashboard)/schedule/DelegateAccessPanel.tsx?raw";
import departmentTeachersRaw from "../../hooks/useDepartmentTeachers.ts?raw";
import { flat } from "./sourceText";
import teachersMetaRaw from "../../hooks/useTeachersMeta.ts?raw";
import usersHookRaw from "../../hooks/useInstitutionUsers.ts?raw";
import teachingStaffHookRaw from "../../hooks/useTeachingStaff.ts?raw";

// The add forms and the schedule page used to read the users collection themselves every time they opened.
// They now take people from the shared cached lists (hooks/useInstitutionUsers, useTeachingStaff, useTeachersMeta),
// so opening a form inside the cache window reads nothing. HouseForm's roster feeds a batch write, so it shows the
// shared list but reads each student it is about to change again at save (see houseMembership.ts).

const lf = (s: string) => s.split("\r\n").join("\n");
const RAW_USERS_READ = /collection\(\s*db\s*,\s*["']users["']\s*\)/;

describe("forms that take people from the shared lists", () => {
  it("the Exam, Disciplinary, House and Schedule pages and the Assignment options no longer read the users collection", () => {
    for (const [name, src] of Object.entries({
      exam: examFormRaw,
      disciplinary: disciplinaryFormRaw,
      house: houseFormRaw,
      assignmentOptions: assignmentOptionsRaw,
      schedule: scheduleRaw,
      schedulePage: schedulePageHookRaw,
      delegatePanel: delegatePanelRaw,
    })) {
      expect(RAW_USERS_READ.test(lf(src)), name).toBe(false);
    }
  });

  it("the House form shows the shared students list, listens to nothing, and reads only the toggled students at save", () => {
    const src = lf(houseFormRaw);
    expect(src).toContain(
      'useInstitutionUsers({ enabled: type === "update" })',
    );
    expect(src).not.toMatch(/(?<![\w.])onSnapshot\(/);
    expect(src).not.toContain("getDocs(");
    // the save reads each toggled student's house afresh and writes only what the plan says
    expect(src).toContain("toggledStudentIds(initialIds.current, checkedIds)");
    expect(src).toContain("planHouseChanges({");
    expect(src).toContain('getDoc(doc(db, "users", uid))');
  });

  it("saving a house that moved students refreshes the shared users list, and cancelling the form does not", () => {
    const form = lf(houseFormRaw);
    const commit = form.indexOf("await batch.commit();");
    const refresh = form.indexOf(
      'queryClient.invalidateQueries({ queryKey: ["users", institutionId] });',
    );
    expect(commit).toBeGreaterThan(-1);
    expect(refresh).toBeGreaterThan(commit);
    // FormModal's close (which runs on cancel as well) no longer refreshes the users list for a house
    expect(lf(formModalRaw)).not.toContain('if (table === "house") {');
  });

  it("the Exam form and the Assignment options share one teachers-meta query", () => {
    expect(lf(examFormRaw)).toContain("useTeachersMeta()");
    expect(lf(assignmentOptionsRaw)).toContain("useTeachersMeta()");
    const hook = lf(teachersMetaRaw);
    expect(hook).toContain(
      "queryKey: ['users', institutionId ?? '', 'teacherMeta']",
    );
    expect(hook).toContain("staleTime: LIST_STALE_MS");
  });

  it("keeps the teachers-meta read under the users root, so saving a user refreshes it", () => {
    expect(lf(teachersMetaRaw)).toContain("['users',");
  });

  it("the Disciplinary form asks for the students only when it needs them", () => {
    const src = lf(disciplinaryFormRaw);
    expect(src).toContain("useInstitutionUsers({ enabled: needsStudents })");
    expect(src).toContain('type === "create" && !studentLocked');
  });

  it("the Timetable form keeps its own query only for a senior teacher’s department", () => {
    const src = flat(timetableFormRaw);
    expect(src).toContain(
      flat("const deptScoped = role === 'senior_teacher' && !!department;"),
    );
    expect(src).toContain(
      flat(
        "useTeachingStaff({ enabled: DATA_MODE === 'live' && !deptScoped })",
      ),
    );
    // The department query is the shared cached hook (also the Schedule page's edit check): one read for both.
    expect(src).toContain(
      flat("useDepartmentTeachers(department, { enabled: deptScoped })"),
    );
    expect(flat(departmentTeachersRaw)).toContain(
      flat("where('departmentId', '==', department)"),
    );
    expect(flat(departmentTeachersRaw)).toContain(
      "staleTime: REFERENCE_STALE_MS",
    );
  });

  it("the Schedule toggle refreshes the shared users list after it saves", () => {
    // The toggle moved to the Delegate panel (Schedule redesign PR B).
    const src = flat(delegatePanelRaw);
    expect(src).toContain(
      flat(
        "useInstitutionUsers({ enabled: DATA_MODE === 'live' && role === 'institution_admin' })",
      ),
    );
    expect(src).toContain(
      flat(
        "queryClient.invalidateQueries({ queryKey: ['users', institutionId] })",
      ),
    );
  });

  it("the shared hooks take an enabled flag, so a form that does not need people does not load them", () => {
    expect(lf(usersHookRaw)).toContain(
      "{ enabled = true }: { enabled?: boolean } = {}",
    );
    expect(lf(teachingStaffHookRaw)).toContain(
      "useInstitutionUsers({ enabled })",
    );
  });
});
