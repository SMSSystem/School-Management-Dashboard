// Everything the Schedule page shows, worked out from the role, the calendar, the people lists and the URL
// (spec §4 and §5). The page itself only lays the parts out.
//
// Reads (spec §5, free tier): a class or teacher week is one cached getDocs per class or teacher and term set
// (useWeekTimetable, memory only); a student's or parent's week shares the dashboard's cached class timetable
// (useClassTimetable). Moving between weeks of the same term reads nothing. The people lists are the shared cached
// ones, loaded only for the roles that use them.

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { db, type Role } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE } from "@/lib/data";
import { REFERENCE_STALE_MS } from "@/lib/queryPolicies";
import { isoDate } from "@/lib/nextClass";
import { MOBILE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { useTeachingStaff } from "@/hooks/useTeachingStaff";
import { useLinkedChildren } from "@/hooks/useLinkedChildren";
import { useWeekTimetable } from "@/hooks/useWeekTimetable";
import { useClassTimetable } from "@/hooks/useClassTimetable";
import { useDepartmentTeachers } from "@/hooks/useDepartmentTeachers";
import { classIdsOf, type ClassMembership } from "@/lib/studentClasses";
import { calendarInputFrom } from "@/lib/schedule/scheduleCalendar";
import { scheduleChoices } from "@/lib/schedule/scheduleChoices";
import {
  parseScheduleUrl,
  scheduleUrlPatch,
  type ScheduleUrlState,
} from "@/lib/schedule/scheduleUrl";
import {
  buildWeek,
  defaultWeek,
  termsCovering,
  type CalendarInput,
  type ScheduleOf,
} from "@/lib/schedule/weekSchedule";

type WeekOf = { by: "class" | "teacher"; id: string };
import type { CardSlot } from "./LessonCard";
import { weekRangeLabel } from "./scheduleLabels";

const CHILD_KEY = "schedule.child";

function readChild(): string {
  try {
    return window.sessionStorage.getItem(CHILD_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeChild(uid: string): void {
  try {
    window.sessionStorage.setItem(CHILD_KEY, uid);
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
}

/** The active year (academic mode) or the active time blocks (custom mode), as the week builder's input. */
function useScheduleCalendar() {
  const { institution } = useAuth();
  const cal = useInstitutionAcademicCalendar();
  const isCustomMode = institution?.calendarMode === "custom";
  const calendar = useMemo(
    () =>
      calendarInputFrom({
        isCustomMode,
        activeYear: cal.activeYear,
        terms: cal.allTerms ?? [],
        nonSchoolDays: cal.nonSchoolDays,
        activeTimeBlocks: cal.activeTimeBlocks,
        nonSchoolDaysByTermId: cal.nonSchoolDaysByTermId,
      }),
    [
      isCustomMode,
      cal.activeYear,
      cal.allTerms,
      cal.nonSchoolDays,
      cal.activeTimeBlocks,
      cal.nonSchoolDaysByTermId,
    ],
  );
  return { calendar, loading: cal.loading };
}

/** A parent's children, and which one is shown (kept for the session). */
function useChildChoice() {
  const { children: linkedChildren, loading: childrenLoading } =
    useLinkedChildren();
  const [childId, setChildId] = useState(readChild);
  const selectedChild =
    linkedChildren.find((c) => c.uid === childId) ?? linkedChildren[0];
  const chooseChild = (uid: string) => {
    setChildId(uid);
    writeChild(uid);
  };
  return { linkedChildren, childrenLoading, selectedChild, chooseChild };
}

/** Whose classes a student's or parent's week shows: the student's own, or the selected child's. */
function useMembership(
  role: Role | null | undefined,
  child: ClassMembership | undefined,
): ClassMembership | null {
  const { classId, classIds, classSubjects } = useAuth();
  // Kept as one object between renders (useClassTimetable keys on it).
  const own = useMemo<ClassMembership>(
    () => ({ classId, classIds, classSubjects }),
    [classId, classIds, classSubjects],
  );
  if (role === "student") return own;
  if (role === "parent") return child ?? null;
  return null;
}

/** Who may be shown (spec §4), and whether those lists are still loading: only the lists each role uses are loaded. */
function useChoices(studentId: string | null) {
  const { user, role, displayName } = useAuth();
  const isAdminLike = role === "institution_admin" || role === "spectator";
  const isSenior = role === "senior_teacher";
  const live = DATA_MODE === "live";
  const { data: rawClasses, isLoading: classesLoading } = useInstitutionClasses(
    { enabled: isAdminLike || isSenior },
  );
  const { staff, isLoading: staffLoading } = useTeachingStaff({
    enabled: live && isAdminLike,
  });
  const { data: rawSubjects, isLoading: subjectsLoading } =
    useInstitutionSubjects({ enabled: isSenior });
  const choices = useMemo(
    () =>
      scheduleChoices({
        role,
        uid: user?.uid,
        displayName,
        classes: (rawClasses ?? []).map((c) => ({ id: c.id, name: c.name })),
        staff: staff.map((s) => ({ id: s.id, name: s.name })),
        subjects: rawSubjects,
        studentId,
      }),
    [role, user?.uid, displayName, rawClasses, staff, rawSubjects, studentId],
  );
  return {
    choices,
    loading: classesLoading || staffLoading || subjectsLoading,
  };
}

/**
 * Editing (D3, D8): an admin edits every slot; a senior teacher with `canGenerateSchedule` edits only slots whose
 * teacher is in their own department (the slot form's teacher list, hooks/useDepartmentTeachers.ts); nobody else
 * edits. The senior teacher's flag is one cached read of their own user document.
 */
function useScheduleEditing() {
  const { user, role, departmentId } = useAuth();
  const isSenior = role === "senior_teacher";
  const { data: seniorMayEdit } = useQuery({
    queryKey: ["scheduleAccess", user?.uid ?? ""],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "users", user!.uid));
      return snap.exists() && snap.data().canGenerateSchedule === true;
    },
    enabled: isSenior && !!user && DATA_MODE === "live",
    staleTime: REFERENCE_STALE_MS,
  });
  const mayEdit =
    role === "institution_admin" || (isSenior && seniorMayEdit === true);
  const { teachers: deptTeachers } = useDepartmentTeachers(departmentId, {
    enabled: isSenior && mayEdit,
  });
  const deptIds = useMemo(
    () => new Set(deptTeachers.map((t) => t.id)),
    [deptTeachers],
  );
  const canEdit = (slot: CardSlot): boolean => {
    if (!mayEdit) return false;
    if (role === "institution_admin") return true;
    const teacherId = (slot as { teacherId?: string }).teacherId;
    return !!teacherId && deptIds.has(teacherId);
  };
  return { mayEdit, canEdit };
}

/** The student whose merged week shows: the student themself, or the parent's chosen child; null with no class. */
function studentIdOf(
  role: Role | null | undefined,
  hasClass: boolean,
  uid: string | undefined,
  childUid: string | undefined,
): string | null {
  if (!hasClass) return null;
  return (role === "student" ? uid : childUid) ?? null;
}

/** A class's or a teacher's week (the staff views); null for a student's merged week. */
function staffOfState(of: ScheduleOf | null): WeekOf | null {
  return of && of.by !== "student" ? { by: of.by, id: of.id } : null;
}

/**
 * The slots of the shown week and the week built from them: a class's or teacher's week (useWeekTimetable), or a
 * student's merged week (useClassTimetable, D15), read for the terms or time blocks the week overlaps.
 */
function useWeekSlots(
  state: ScheduleUrlState,
  calendar: CalendarInput,
  membership: ClassMembership | null,
  now: Date,
) {
  const weekTermIds = useMemo(
    () => termsCovering(state.weekStart, calendar),
    [state.weekStart, calendar],
  );
  const studentView = state.of?.by === "student";
  const staffWeek = useWeekTimetable(staffOfState(state.of), weekTermIds);
  const studentWeek = useClassTimetable(
    studentView ? membership : null,
    weekTermIds,
  );
  const source = studentView ? studentWeek : staffWeek;
  const slots: CardSlot[] | undefined = source.slots;
  const week = useMemo(
    () => buildWeek(slots ?? [], state.weekStart, calendar, now),
    [slots, state.weekStart, calendar, now],
  );
  return { week, studentView, loading: source.loading, error: source.error };
}

export function useSchedulePage() {
  const { user, role } = useAuth();
  const isPhone = useMediaQuery(MOBILE_QUERY);
  const now = useMinuteClock();
  const today = isoDate(now);
  const { calendar, loading: calendarLoading } = useScheduleCalendar();
  const child = useChildChoice();
  const membership = useMembership(role, child.selectedChild);
  const hasClass = classIdsOf(membership).length > 0;
  const studentId = studentIdOf(
    role,
    hasClass,
    user?.uid,
    child.selectedChild?.uid,
  );
  const { choices, loading: peopleLoading } = useChoices(studentId);

  // The URL state: whose week, which week, week or day.
  const [params, setParams] = useSearchParams();
  const state = parseScheduleUrl(params, { choices, calendar, today, isPhone });
  const setState = (next: ScheduleUrlState) =>
    setParams(scheduleUrlPatch(next, choices.canChoose), { replace: true });

  const shown = useWeekSlots(state, calendar, membership, now);
  const lastDay =
    shown.week.days[shown.week.days.length - 1]?.date ?? state.weekStart;

  const editing = useScheduleEditing();

  return {
    role,
    isPhone,
    calendar,
    choices,
    state,
    setState,
    openingWeek: defaultWeek(today, calendar),
    week: shown.week,
    rangeLabel: weekRangeLabel(state.weekStart, lastDay),
    loading: calendarLoading || shown.loading,
    peopleLoading,
    error: shown.error,
    mayEdit: editing.mayEdit,
    canEditSlot: (slot: CardSlot) =>
      !shown.studentView && editing.canEdit(slot),
    ...child,
  };
}
