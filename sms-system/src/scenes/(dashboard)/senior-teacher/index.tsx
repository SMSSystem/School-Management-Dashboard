import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import SeniorTeacherKPIs from "@/components/SeniorTeacherKPIs";
import SeniorTeacherQuickActions from "@/components/SeniorTeacherQuickActions";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";
import { useSeniorTeacherProfile } from "@/hooks/useSeniorTeacherProfile";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import { isSessionWindowClosed } from "@/lib/attendanceWindows";

const SeniorTeacherPage = () => {
  const { institutionId } = useAuth();
  const { assignedClassId } = useSeniorTeacherProfile();
  const { activeTerm } = useInstitutionAcademicCalendar();
  const [overdueSlots, setOverdueSlots] = useState<{ session: "AM" | "PM"; label: string }[]>([]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || !assignedClassId || !activeTerm) return;
    const today = new Date().toISOString().slice(0, 10);
    getDocs(
      query(
        collection(db, "generalAttendance"),
        where("institutionId", "==", institutionId),
        where("classId", "==", assignedClassId),
        where("date", "==", today),
      )
    ).then((snap) => {
      const sessions = ["AM", "PM"] as const;
      const overdue: { session: "AM" | "PM"; label: string }[] = [];
      for (const session of sessions) {
        if (!isSessionWindowClosed(session)) continue;
        const saved = snap.docs.some((d) => d.data().session === session && d.data().submittedAt);
        if (!saved) overdue.push({ session, label: `${session} register` });
      }
      setOverdueSlots(overdue);
    }).catch(() => {});
  }, [institutionId, assignedClassId, activeTerm]);

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* OVERDUE REGISTER ALERT */}
      {overdueSlots.length > 0 && (
        <div className="col-span-12">
          <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300">
            <span className="font-medium">
              {overdueSlots.map((s) => s.label).join(" and ")} overdue today.
            </span>{" "}
            <a href="/attendance/general" className="underline">Submit now →</a>
          </div>
        </div>
      )}

      {/* TOP: DEPARTMENT KPI STRIP */}
      <SeniorTeacherKPIs />

      {/* MIDDLE: SCHEDULE + EVENT CALENDAR */}
      <div className="col-span-12 lg:col-span-8">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-[stretch] min-h-min">
          <h1 className="text-xl font-semibold">Schedule</h1>
          <BigCalendar />
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4">
        <EventCalendar />
      </div>

      {/* BOTTOM: QUICK ACTIONS + ANNOUNCEMENTS */}
      <div className="col-span-12 lg:col-span-8">
        <SeniorTeacherQuickActions />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <Announcements />
      </div>
    </div>
  );
};

export default SeniorTeacherPage;
