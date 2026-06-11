import Announcements from "@/components/Announcements";
import AttendanceChart from "@/components/AttendanceChart";
import CountChart from "@/components/CountChart";
import EventCalendar from "@/components/EventCalendar";
import AdminQuickActions from "@/components/AdminQuickActions";
import UserCard from "@/components/UserCard";
import { PendingAcademicYearCard } from "@/components/attendance/PendingAcademicYearCard";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";
import { isSessionWindowClosed } from "@/lib/attendanceWindows";

const AdminPage = () => {
  const { institutionId } = useAuth();
  const { draftYear, activeTerm } = useInstitutionAcademicCalendar();
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    if (USE_MOCK || !institutionId || !activeTerm) return;
    const today = new Date().toISOString().slice(0, 10);

    Promise.all([
      getDocs(query(collection(db, "classes"), where("institutionId", "==", institutionId))),
      getDocs(query(
        collection(db, "generalAttendance"),
        where("institutionId", "==", institutionId),
        where("date", "==", today),
      )),
    ]).then(([classSnap, attSnap]) => {
      const classIds = classSnap.docs.map((d) => d.id);
      const sessions = ["AM", "PM"] as const;
      let count = 0;
      for (const classId of classIds) {
        for (const session of sessions) {
          if (!isSessionWindowClosed(session)) continue;
          const saved = attSnap.docs.some(
            (d) => d.data().classId === classId && d.data().session === session && d.data().submittedAt
          );
          if (!saved) count++;
        }
      }
      setOverdueCount(count);
    }).catch(() => {});
  }, [institutionId, activeTerm]);

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* PENDING ACADEMIC YEAR CARD */}
      {draftYear && (
        <div className="col-span-12">
          <PendingAcademicYearCard draftYearName={draftYear.name} />
        </div>
      )}

      {/* OVERDUE REGISTER ALERT */}
      {overdueCount > 0 && (
        <div className="col-span-12">
          <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300">
            <span className="font-medium">{overdueCount} register slot{overdueCount !== 1 ? 's' : ''}</span> overdue today.{' '}
            <a href="/attendance/general" className="underline">View register →</a>
          </div>
        </div>
      )}

      {/* TOP: METRIC CARDS */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="student" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="teacher" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="parent" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="class" />
        </div>
      </div>

      {/* MIDDLE: COUNT + ATTENDANCE */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 h-[clamp(22rem,45vh,32rem)]">
          <CountChart />
        </div>
        <div className="col-span-12 lg:col-span-8 h-[clamp(22rem,45vh,32rem)]">
          <AttendanceChart />
        </div>
      </div>

      {/* BOTTOM: QUICK ACTIONS + RIGHT RAIL */}
      <div className="col-span-12 grid grid-cols-12 gap-4 items-start">
        <div className="col-span-12 lg:col-span-8">
          <AdminQuickActions />
        </div>
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          <EventCalendar />
          <Announcements />
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
