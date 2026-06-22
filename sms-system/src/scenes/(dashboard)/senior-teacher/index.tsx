import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import MiniCalendar from "@/components/MiniCalendar";
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
  const [bannerDismissed, setBannerDismissed] = useState(false);

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
      {!bannerDismissed && overdueSlots.length > 0 && (
        <div className="col-span-12">
          <div className="flex items-center justify-between rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300">
            <span>
              <span className="font-medium">
                {overdueSlots.map((s) => s.label).join(" and ")} overdue today.
              </span>{" "}
              <a href="/dashboard/attendance/general" className="underline">Submit now →</a>
            </span>
            <button
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
              className="ml-4 text-orange-500 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-200 text-base leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* KPI STRIP */}
      <SeniorTeacherKPIs />

      {/* SCHEDULE — full width */}
      <div className="col-span-12">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-[stretch] min-h-min">
          <h1 className="text-xl font-semibold">Schedule</h1>
          <BigCalendar />
        </div>
      </div>

      {/* MINI CALENDAR + EVENTS */}
      <div className="col-span-12 lg:col-span-6">
        <MiniCalendar />
      </div>
      <div className="col-span-12 lg:col-span-6">
        <EventCalendar />
      </div>

      {/* QUICK ACTIONS — full width */}
      <div className="col-span-12">
        <SeniorTeacherQuickActions />
      </div>

      {/* ANNOUNCEMENTS — full width */}
      <div className="col-span-12 min-h-[200px]">
        <Announcements />
      </div>
    </div>
  );
};

export default SeniorTeacherPage;
