import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE } from "@/lib/data";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useAllInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { sortByName } from "@/lib/sortByName";
import { formatCapacity, isOverCapacity, subjectsForClass } from "@/lib/classSubjects";
import {
  DetailBackLink,
  DetailCard,
  DetailFields,
  DetailLoading,
  DetailNotFound,
  DetailSection,
} from "@/components/detail/DetailParts";

type EnrolledStudent = { uid: string; name: string; institutionStudentId: string | null };

const LIST_PATH = "/dashboard/list/classes";

// Read-only class detail, opened from the eye button on the Classes list: the
// summary, who is enrolled (A-Z), and which subjects the class studies. The class
// and subject lists come from the shared cached reference queries, so opening a
// class costs one query (the enrolled students, one read per student, cached for
// 5 minutes) when those are already loaded.
const ClassDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { institutionId } = useAuth();
  const { data: classes, isLoading: classesLoading } = useInstitutionClasses();
  const { data: subjects } = useAllInstitutionSubjects();
  const cls = classes?.find((c) => c.id === id);

  // The role filter is part of the query (not applied afterwards): a teacher may
  // only list student profiles, and the rules reject a broader query outright.
  const students = useQuery({
    queryKey: ["classStudents", institutionId, id],
    enabled: DATA_MODE === "live" && !!institutionId && institutionId !== "*" && !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EnrolledStudent[]> => {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
          where("role", "==", "student"),
          where("classId", "==", id),
        ),
      );
      return snap.docs.map((d) => ({
        uid: d.id,
        name: (d.data().name as string) ?? d.id,
        institutionStudentId: (d.data().institutionStudentId as string | null | undefined) ?? null,
      }));
    },
  });

  const enrolled = useMemo(() => sortByName(students.data ?? [], (s) => s.name), [students.data]);
  const classSubjects = useMemo(() => subjectsForClass(subjects, id ?? ""), [subjects, id]);

  if (classesLoading) return <DetailLoading />;
  if (!cls) return <DetailNotFound what="Class" backTo={LIST_PATH} backLabel="Back to Classes" />;

  const over = isOverCapacity(enrolled.length, cls.capacity);

  return (
    <div className="p-4 flex flex-col gap-4">
      <DetailBackLink to={LIST_PATH} label="Back to Classes" />

      <DetailCard title={cls.name}>
        <DetailFields
          rows={[
            { label: "Grade", value: cls.grade != null ? String(cls.grade) : "" },
            {
              label: "Enrolled",
              value: students.isLoading ? (
                "Loading…"
              ) : (
                <span className={over ? "text-red-600 dark:text-red-400" : undefined}>
                  {formatCapacity(enrolled.length, cls.capacity)}
                  {over ? " (over capacity)" : ""}
                </span>
              ),
            },
            { label: "Supervisor", value: cls.supervisor ?? "" },
          ]}
        />
      </DetailCard>

      <DetailSection title={`Enrolled Students (${enrolled.length})`}>
        {students.isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : students.isError ? (
          <p className="text-sm text-red-500 py-4 text-center">Failed to load the students. Please try again.</p>
        ) : enrolled.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No students are enrolled in this class yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
            {enrolled.map((s) => (
              <li key={s.uid} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link to={`/dashboard/list/students/${s.uid}`} className="text-sky-600 hover:underline">
                  {s.name}
                </Link>
                <span className="text-xs text-gray-400">{s.institutionStudentId ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection title={`Subjects (${classSubjects.length})`}>
        {classSubjects.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No subjects are assigned to this class yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {classSubjects.map((s) => (
              <li
                key={s.id}
                className="rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-200 px-3 py-1 text-xs font-medium"
              >
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </div>
  );
};

export default ClassDetailPage;
