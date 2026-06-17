import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import BigCalendar from "@/components/BigCalender";

type TeacherInfo = {
  name: string;
  email: string;
  phone?: string;
  teacherType?: string;
  departmentName?: string;
  assignedClassName?: string;
};

const SingleTeacherPage = () => {
  const { id } = useParams<{ id: string }>();
  const { institutionId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    Promise.all([
      getDoc(doc(db, "users", id)),
      getDoc(doc(db, "teachers", id)),
    ])
      .then(async ([userSnap, teacherSnap]) => {
        if (cancelled) return;
        if (!userSnap.exists()) {
          setLoading(false);
          return;
        }

        const u = userSnap.data();
        const t = teacherSnap.exists() ? teacherSnap.data() : null;

        let departmentName: string | undefined;
        if (t?.departmentId) {
          const deptSnap = await getDoc(doc(db, "departments", t.departmentId as string));
          if (deptSnap.exists()) {
            departmentName = deptSnap.data().name as string;
          }
        }

        let assignedClassName: string | undefined;
        if (u.assignedClassId) {
          const classSnap = await getDoc(doc(db, "classes", u.assignedClassId as string));
          if (classSnap.exists()) {
            assignedClassName = classSnap.data().name as string;
          }
        }

        if (!cancelled) {
          setTeacher({
            name: (u.name as string) ?? "—",
            email: (u.email as string) ?? "",
            phone: u.phone as string | undefined,
            teacherType: t?.teacherType as string | undefined,
            departmentName,
            assignedClassName,
          });
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id || !institutionId || institutionId === "*") return;
    return onSnapshot(
      query(
        collection(db, "subjects"),
        where("institutionId", "==", institutionId),
        where("teacherIds", "array-contains", id),
      ),
      (snap) =>
        setSubjects(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
      () => setSubjects([]),
    );
  }, [id, institutionId]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading…</div>;
  }

  if (!teacher) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <p className="text-gray-500">Teacher not found.</p>
        <Link to="/list/teachers" className="text-sky-600 underline text-sm">
          ← Back to Teachers
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <Link to="/list/teachers" className="text-sm text-sky-600 hover:underline self-start">
        ← Back to Teachers
      </Link>

      {/* Info card */}
      <div className="bg-slate-700 dark:bg-slate-800 py-6 px-6 rounded-md flex flex-col gap-4 text-gray-100">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-white">{teacher.name}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-gray-100 font-medium">
                {teacher.teacherType === "senior" ? "Senior Teacher" : "Regular Teacher"}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <img src="/mail.png" alt="" width={14} height={14} className="shrink-0 invert" />
                <span className="truncate">{teacher.email || "—"}</span>
              </div>
              {teacher.phone && (
                <div className="flex items-center gap-2">
                  <img src="/phone.png" alt="" width={14} height={14} className="shrink-0 invert" />
                  <span>{teacher.phone}</span>
                </div>
              )}
              {teacher.departmentName && (
                <div className="flex items-center gap-2">
                  <img src="/singleBranch.png" alt="" width={14} height={14} className="shrink-0 invert" />
                  <span>Department: {teacher.departmentName}</span>
                </div>
              )}
              {teacher.assignedClassName && (
                <div className="flex items-center gap-2">
                  <img src="/singleClass.png" alt="" width={14} height={14} className="shrink-0 invert" />
                  <span>Homeroom: {teacher.assignedClassName}</span>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Subjects */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md">
        <h2 className="text-base font-semibold mb-3">Subjects Taught</h2>
        {subjects.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No subjects assigned.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <span
                key={s.id}
                className="text-sm px-3 py-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
              >
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="bg-white dark:bg-gray-800 rounded-md p-4 h-[clamp(36rem,75vh,52rem)] overflow-hidden">
        <h2 className="text-base font-semibold mb-2">Schedule</h2>
        <BigCalendar teacherIdOverride={id} />
      </div>
    </div>
  );
};

export default SingleTeacherPage;
