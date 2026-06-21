import Announcements from "@/components/Announcements";
import AttendanceChart from "@/components/AttendanceChart";
import CountChart from "@/components/CountChart";
import CalendarCard from "@/components/CalendarCard";
import EventsList from "@/components/EventsList";
import AdminQuickActions from "@/components/AdminQuickActions";
import UserCard from "@/components/UserCard";
import { PendingAcademicYearCard } from "@/components/attendance/PendingAcademicYearCard";
import PendingInstitutionProfileCard from "@/components/PendingInstitutionProfileCard";
import { InstitutionBrandCard } from "@/components/InstitutionBrandCard";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import { useEffect, useState } from "react";
import { collection, deleteField, doc, getDocs, getDoc, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, type SubjectDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";
import { isSessionWindowClosed } from "@/lib/attendanceWindows";
import { isFortnightlySessionDay } from "@/lib/attendanceCalendar";

const AdminPage = () => {
  const { institutionId } = useAuth();
  const { draftYear, activeTerm } = useInstitutionAcademicCalendar();
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    if (USE_MOCK || !institutionId || !activeTerm) return;
    const today = new Date().toISOString().slice(0, 10);
    const nowJST = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const past15 = nowJST.getUTCHours() >= 15;
    const todayDayOfWeek = new Date(today + 'T12:00:00Z').getUTCDay();

    (async () => {
      try {
        const [classSnap, attSnap] = await Promise.all([
          getDocs(query(collection(db, "classes"), where("institutionId", "==", institutionId))),
          getDocs(query(
            collection(db, "generalAttendance"),
            where("institutionId", "==", institutionId),
            where("date", "==", today),
          )),
        ]);

        const allClassIds = classSnap.docs.map((d) => d.id);
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
          const [subjectSnap, subjectAttSnap] = await Promise.all([
            getDocs(query(collection(db, 'subjects'), where('institutionId', '==', institutionId))),
            getDocs(query(
              collection(db, 'subjectAttendance'),
              where('institutionId', '==', institutionId),
              where('sessionDate', '==', today),
            )),
          ]);

          const savedKeys = new Set(
            subjectAttSnap.docs.map((d) => `${d.data().subjectId as string}_${d.data().classId as string}`)
          );

          for (const subjDoc of subjectSnap.docs) {
            const subj = { id: subjDoc.id, ...subjDoc.data() } as SubjectDocument & { id: string };
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

  useEffect(() => {
    if (USE_MOCK || !institutionId) return;

    getDoc(doc(db, 'institutions', institutionId)).then(async (instSnap) => {
      if (instSnap.data()?.migrations?.timetableScheduleMap) return;

      const slotSnap = await getDocs(
        query(collection(db, 'timetable_slots'), where('institutionId', '==', institutionId))
      );
      const docsToMigrate = slotSnap.docs.filter((d) => {
        const data = d.data();
        return Array.isArray(data.days) && data.days.length > 0 && !data.schedule;
      });

      if (docsToMigrate.length === 0) {
        await updateDoc(doc(db, 'institutions', institutionId), {
          'migrations.timetableScheduleMap': true,
        });
        return;
      }

      const BATCH_SIZE = 400;
      for (let i = 0; i < docsToMigrate.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        docsToMigrate.slice(i, i + BATCH_SIZE).forEach((d) => {
          const data = d.data();
          const schedule: Record<string, { startTime: string; duration: number }> = {};
          for (const day of data.days as string[]) {
            schedule[day] = { startTime: data.startTime as string, duration: data.duration as number };
          }
          batch.update(d.ref, {
            schedule,
            days:      deleteField(),
            startTime: deleteField(),
            duration:  deleteField(),
          });
        });
        await batch.commit();
      }

      await updateDoc(doc(db, 'institutions', institutionId), {
        'migrations.timetableScheduleMap': true,
      });
    }).catch(() => {});
  }, [institutionId]);

  useEffect(() => {
    if (USE_MOCK || !institutionId) return;

    getDoc(doc(db, 'institutions', institutionId)).then(async (instSnap) => {
      if (instSnap.data()?.migrations?.classTermRemoved) return;

      const classSnap = await getDocs(
        query(collection(db, 'classes'), where('institutionId', '==', institutionId))
      );
      const docsWithTerm = classSnap.docs.filter((d) => 'termId' in d.data());

      if (docsWithTerm.length === 0) {
        await updateDoc(doc(db, 'institutions', institutionId), {
          'migrations.classTermRemoved': true,
        });
        return;
      }

      const BATCH_SIZE = 400;
      for (let i = 0; i < docsWithTerm.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        docsWithTerm.slice(i, i + BATCH_SIZE).forEach((d) => {
          batch.update(d.ref, { termId: deleteField() });
        });
        await batch.commit();
      }

      await updateDoc(doc(db, 'institutions', institutionId), {
        'migrations.classTermRemoved': true,
      });
    }).catch(() => {});
  }, [institutionId]);

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* PENDING INSTITUTION PROFILE CARD */}
      <div className="col-span-12">
        <PendingInstitutionProfileCard />
      </div>

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

      {/* QUICK ACTIONS */}
      <div className="col-span-12">
        <AdminQuickActions />
      </div>

      {/* CALENDAR + EVENTS */}
      <div className="col-span-12 lg:col-span-4 h-full">
        <CalendarCard />
      </div>
      <div className="col-span-12 lg:col-span-8 h-full">
        <EventsList />
      </div>

      {/* INSTITUTION PROFILE + ANNOUNCEMENTS */}
      <div className="col-span-12 lg:col-span-4 h-full">
        <InstitutionBrandCard />
      </div>
      <div className="col-span-12 lg:col-span-8 h-full">
        <Announcements />
      </div>
    </div>
  );
};

export default AdminPage;
