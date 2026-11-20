import { useEffect, useState } from "react";
import { getDocs, query, where } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import { USE_MOCK } from "@/lib/data";
import { isSessionWindowClosed } from "@/lib/attendanceWindows";
import { isFortnightlySessionDay } from "@/lib/attendanceCalendar";
import { fetchInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { fetchInstitutionSubjects } from "@/lib/subjectsQuery";
import type { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";

type ActiveTerm = ReturnType<typeof useInstitutionAcademicCalendar>["activeTerm"];

/**
 * How many register slots are overdue today: general-register sessions (AM/PM)
 * whose window has closed with no submitted register, and, after 15:00, today's
 * scheduled subject sessions with none saved. Read-only: a few cached reads plus
 * today's attendance documents. Shared by the admin and spectator home pages.
 * Returns 0 while loading, in mock mode, with no active term, or on any error.
 */
export function useOverdueRegisterCount(institutionId: string | null | undefined, activeTerm: ActiveTerm): number {
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    if (USE_MOCK || !institutionId || !activeTerm) return;
    const today = new Date().toISOString().slice(0, 10);
    const nowJST = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const past15 = nowJST.getUTCHours() >= 15;
    const todayDayOfWeek = new Date(today + 'T12:00:00Z').getUTCDay();

    (async () => {
      try {
        const [allClasses, attSnap] = await Promise.all([
          fetchInstitutionClasses(institutionId),
          getDocs(query(
            institutionCollection(institutionId, "generalAttendance"),
            where("date", "==", today),
          )),
        ]);

        const allClassIds = allClasses.map((c) => c.id);
        const sessions = ["AM", "PM"] as const;
        let count = 0;

        for (const classId of allClassIds) {
          for (const session of sessions) {
            if (!isSessionWindowClosed(session)) continue;
            const saved = attSnap.docs.some(
              (d) => d.data().classId === classId && d.data().session === session && d.data().submittedAt
            );
            if (!saved) count++;
          }
        }

        if (past15) {
          const [allSubjects, subjectAttSnap] = await Promise.all([
            fetchInstitutionSubjects(institutionId, null, undefined),
            getDocs(query(
              institutionCollection(institutionId, 'subjectAttendance'),
              where('sessionDate', '==', today),
            )),
          ]);

          const savedKeys = new Set(
            subjectAttSnap.docs.map((d) => `${d.data().subjectId as string}_${d.data().classId as string}`)
          );

          for (const subj of allSubjects) {
            if (!(subj.sessionDayOfWeek ?? []).includes(todayDayOfWeek)) continue;
            if (subj.frequency === 'fortnightly') {
              if (!isFortnightlySessionDay(today, activeTerm.startDate, subj.fortnightlyOffset ?? 0)) continue;
            }
            const classes = subj.classScope === 'institution'
              ? allClassIds
              : (subj.classIds ?? []);
            for (const classId of classes) {
              if (!savedKeys.has(`${subj.id}_${classId}`)) count++;
            }
          }
        }

        setOverdueCount(count);
      } catch {
        // ignore
      }
    })();
  }, [institutionId, activeTerm]);

  return overdueCount;
}
