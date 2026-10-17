import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/lib/ToastContext";
import { DATA_MODE } from "@/lib/data";
import { queryClient } from "@/lib/queryClient";
import { institutionCollection } from "@/lib/paths";
import { invalidateUserCounts } from "@/lib/invalidateUserCounts";
import { actorName, buildAuditEntry } from "@/lib/auditLog";
import { describeProfileEdit } from "@/lib/profileEditDiff";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionUsers } from "@/hooks/useInstitutionUsers";
import { useAllInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { sortByName } from "@/lib/sortByName";
import { isAccountInactive } from "@/lib/accountStatus";
import { formatCapacity, isOverCapacity, subjectsForClass } from "@/lib/classSubjects";
import { countByGender, formatGenderBreakdown } from "@/lib/classPopulation";
import { withExtraClass, withoutExtraClass, type ClassMembership } from "@/lib/studentClasses";
import {
  DetailBackLink,
  DetailCard,
  DetailFields,
  DetailLoading,
  DetailNotFound,
  DetailSection,
} from "@/components/detail/DetailParts";

type EnrolledStudent = {
  uid: string;
  name: string;
  institutionStudentId: string | null;
  status?: unknown;
  gender?: unknown;
  // The student's home class: this class when it is theirs, another when they are here as an additional class.
  classId: string | null;
  classSubjects: Record<string, string[]>;
};

const LIST_PATH = "/dashboard/list/classes";

function refreshClassData(institutionId: string) {
  invalidateUserCounts(institutionId);
  queryClient.invalidateQueries({ queryKey: ["classStudents", institutionId] });
  queryClient.invalidateQueries({ queryKey: ["users", institutionId] });
}

// Admin only: put a student of the institution into this class as an additional class (all subjects; the
// subjects are chosen in the student's edit form). Students with no home class are not listed, because an
// additional class needs one (lib/studentClasses.ts).
function AddStudentPanel({ classId, className, memberIds }: { classId: string; className: string; memberIds: Set<string> }) {
  const { user, displayName, institutionId } = useAuth();
  const { showToast } = useToast();
  const users = useInstitutionUsers();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () =>
      sortByName(
        (users.data ?? []).filter(
          (u) => u.role === "student" && !isAccountInactive(u.status) && !!u.classId && !memberIds.has(u.id),
        ),
        (u) => (u.name as string) ?? u.id,
      ),
    [users.data, memberIds],
  );

  const add = async () => {
    const student = candidates.find((u) => u.id === selected);
    if (!student || !institutionId || !user) return;
    const name = (student.name as string) ?? student.id;
    setBusy(true);
    try {
      // Read fresh, so a class added elsewhere a moment ago is not lost.
      const snap = await getDoc(doc(db, "users", student.id));
      const next = withExtraClass((snap.data() ?? {}) as ClassMembership, classId);
      const batch = writeBatch(db);
      batch.update(doc(db, "users", student.id), { classIds: next.classIds, classSubjects: next.classSubjects });
      batch.set(
        doc(institutionCollection(institutionId, "audit_log")),
        buildAuditEntry({
          institutionId,
          eventType: "profile_edit",
          detail: describeProfileEdit(["additional classes"], name),
          targetUid: student.id,
          targetName: name,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        }),
      );
      await batch.commit();
      setSelected("");
      refreshClassData(institutionId);
      showToast({ message: `${name} added to ${className}.`, variant: "success" });
    } catch (err) {
      console.error("Could not add the student to the class:", err);
      showToast({ message: "Could not add the student to the class. Try again.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <label htmlFor="add-student-to-class" className="text-sm font-medium text-gray-700 dark:text-gray-200">
        Add a student
      </label>
      <select
        id="add-student-to-class"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={busy || users.isLoading}
        className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
      >
        <option value="">{users.isLoading ? "Loading…" : "Choose a student"}</option>
        {candidates.map((u) => (
          <option key={u.id} value={u.id}>
            {(u.name as string) ?? u.id}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={add}
        disabled={!selected || busy}
        className="rounded-md bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        Add to class
      </button>
      <p className="w-full text-xs text-gray-500 dark:text-gray-400">
        Only students who already have a class of their own are listed. They keep that class for report cards and the
        general register.
      </p>
    </div>
  );
}

// Read-only class detail, opened from the eye button on the Classes list: the
// summary, who is enrolled (A-Z), and which subjects the class studies. The class
// and subject lists come from the shared cached reference queries, so opening a
// class costs one query (the enrolled students, one read per student, cached for
// 5 minutes) when those are already loaded. The roster is every student of the
// class: those whose class it is and those added to it as an additional class
// (lib/studentClasses.ts); an institution admin can add and remove the latter here.
const ClassDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { institutionId, role, user, displayName } = useAuth();
  const { showToast } = useToast();
  const { data: classes, isLoading: classesLoading } = useInstitutionClasses();
  const { data: subjects } = useAllInstitutionSubjects();
  const cls = classes?.find((c) => c.id === id);
  const isAdmin = role === "institution_admin";
  const [removing, setRemoving] = useState("");

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
          where("classIds", "array-contains", id),
        ),
      );
      return snap.docs.map((d) => ({
        uid: d.id,
        name: (d.data().name as string) ?? d.id,
        institutionStudentId: (d.data().institutionStudentId as string | null | undefined) ?? null,
        status: d.data().status,
        gender: d.data().gender,
        classId: (d.data().classId as string | null | undefined) ?? null,
        classSubjects: (d.data().classSubjects as Record<string, string[]> | undefined) ?? {},
      }));
    },
  });

  // Active students only, so "12 of 30" and this list match the Classes list's
  // Population column (which also skips deactivated accounts).
  const enrolled = useMemo(
    () => sortByName((students.data ?? []).filter((s) => !isAccountInactive(s.status)), (s) => s.name),
    [students.data],
  );
  const memberIds = useMemo(() => new Set((students.data ?? []).map((s) => s.uid)), [students.data]);
  const classSubjects = useMemo(() => subjectsForClass(subjects, id ?? ""), [subjects, id]);

  if (classesLoading) return <DetailLoading />;
  if (!cls) return <DetailNotFound what="Class" backTo={LIST_PATH} backLabel="Back to Classes" />;

  const over = isOverCapacity(enrolled.length, cls.capacity);
  const genders = countByGender(enrolled);

  const remove = async (s: EnrolledStudent) => {
    if (!institutionId || !user || !id) return;
    setRemoving(s.uid);
    try {
      // The student's other classes are read fresh, so a class added elsewhere a moment ago is not lost.
      const snap = await getDoc(doc(db, "users", s.uid));
      const result = withoutExtraClass((snap.data() ?? {}) as ClassMembership, id);
      const batch = writeBatch(db);
      batch.update(doc(db, "users", s.uid), { classIds: result.classIds, classSubjects: result.classSubjects });
      batch.set(
        doc(institutionCollection(institutionId, "audit_log")),
        buildAuditEntry({
          institutionId,
          eventType: "profile_edit",
          detail: describeProfileEdit(["additional classes"], s.name),
          targetUid: s.uid,
          targetName: s.name,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        }),
      );
      await batch.commit();
      refreshClassData(institutionId);
      showToast({ message: `${s.name} removed from ${cls.name}.`, variant: "success" });
    } catch (err) {
      console.error("Could not remove the student from the class:", err);
      showToast({ message: "Could not remove the student from the class. Try again.", variant: "error" });
    } finally {
      setRemoving("");
    }
  };

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
                  {enrolled.length > 0 && <> — {formatGenderBreakdown(genders, "full")}</>}
                </span>
              ),
            },
            { label: "Supervisor", value: cls.supervisor ?? "" },
          ]}
        />
      </DetailCard>

      <DetailSection title={`Enrolled Students (${enrolled.length})`}>
        {isAdmin && DATA_MODE === "live" && id && <AddStudentPanel classId={id} className={cls.name} memberIds={memberIds} />}
        {students.isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : students.isError ? (
          <p className="text-sm text-red-500 py-4 text-center">Failed to load the students. Please try again.</p>
        ) : enrolled.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No students are enrolled in this class yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
            {enrolled.map((s) => {
              const additional = !!id && s.classId !== id;
              const chosen = id ? s.classSubjects[id] : undefined;
              return (
                <li key={s.uid} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link to={`/dashboard/list/students/${s.uid}`} className="text-sky-600 hover:underline">
                      {s.name}
                    </Link>
                    {additional && (
                      <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                        additional class{chosen?.length ? ` · ${chosen.length} ${chosen.length === 1 ? "subject" : "subjects"}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{s.institutionStudentId ?? ""}</span>
                    {isAdmin && additional && (
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        disabled={removing === s.uid}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        aria-label={`Remove ${s.name} from ${cls.name}`}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
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
