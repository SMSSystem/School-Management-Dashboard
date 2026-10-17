import { classIdsOf, readClassSubjects, takesSubject, type ClassMembership } from "@/lib/studentClasses";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc, onSnapshot, orderBy, query, where, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { assignmentsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { institutionCollection } from "@/lib/paths";
import { useLinkedStudentIds } from "@/lib/useLinkedStudentIds";
import { hasAdminView } from "@/lib/roleCapabilities";

type Assignment = {
  id: string;
  subjectName: string;
  className: string;
  teacherName: string;
  termName?: string;
  dueDate: string;
  description?: string;
  institutionId?: string;
  teacherId?: string;
  classId?: string;
  subjectId?: string;
  departmentId?: string;
  teacherRole?: string;
  status?: string;
};

const columns = [
  {
    header: "Subject Name",
    accessor: "name",
  },
  {
    header: "Class",
    accessor: "class",
  },
  {
    header: "Teacher",
    accessor: "teacher",
    className: "hidden md:table-cell",
  },
  {
    header: "Due Date",
    accessor: "dueDate",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const AssignmentListPage = () => {
  const { role, institutionId, user, classId, classIds, classSubjects } = useAuth();
  const [page, setPage] = useState(1);
  const [liveAssignments, setLiveAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const { linkedStudentIds, loading: linkedLoading } = useLinkedStudentIds();
  // Each linked child's classes and chosen subjects (lib/studentClasses.ts), for hiding subjects a child does not take.
  const [childMemberships, setChildMemberships] = useState<ClassMembership[]>([]);

  // senior_teacher's own departmentId — NOT the same as AuthContext's
  // `department` field (that's a display name; `departmentId` is the
  // reference id firestore.rules and every other form here actually key
  // off of), so it isn't already exposed by useAuth() and has to be read
  // directly off the user's own profile.
  const [myDepartmentId, setMyDepartmentId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (role !== "senior_teacher" || !user) return;
    getDoc(doc(db, "users", user.uid)).then(
      (snap) => {
        setMyDepartmentId((snap.data()?.departmentId as string | undefined) ?? null);
      },
      // Treat an unreadable profile as "no department": the teacher's own assignments still load.
      onLoadError("your department", () => setMyDepartmentId(null)),
    );
  }, [role, user]);

  // Tightened firestore.rules (ASSIGNMENTS_FEATURE_SPEC.md §5.1,
  // Implementation Order step 3) means an unfiltered listener now fails
  // outright for every role except institution_admin/super_admin — a query
  // is denied in full if it could return even one document the rule would
  // reject, not silently filtered down to the allowed subset. Per-role
  // queries per §6.1, one effect per role so each only runs the fetch that
  // role's own rule branch actually permits.

  // institution_admin / super_admin / spectator — unfiltered, unchanged. A
  // spectator's rule branch is the admin's (canReadAdminData() in firestore.rules).
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    if (!hasAdminView(role)) return;
    setLoading(true);
    const unsubscribe = onSnapshot(
      institutionCollection(institutionId, "assignments"),
      (snap) => {
        setLiveAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment)));
        setLoading(false);
      },
      onLoadError("assignments", () => setLoading(false)),
    );
    return unsubscribe;
  }, [institutionId, role]);

  // regular_teacher — own assignments only.
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    if (role !== "regular_teacher" || !user) return;
    setLoading(true);
    const unsubscribe = onSnapshot(
      query(institutionCollection(institutionId, "assignments"), where("teacherId", "==", user.uid)),
      (snap) => {
        setLiveAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment)));
        setLoading(false);
      },
      onLoadError("your assignments", () => setLoading(false)),
    );
    return unsubscribe;
  }, [institutionId, role, user]);

  // senior_teacher — two separate equality-only queries, merged
  // client-side. A single .where('departmentId','==',myDept) query would
  // also return other senior_teachers' assignments in that department,
  // which the tightened rule denies — failing the WHOLE query, not just
  // filtering that document out (§6.1's correction from the initial draft).
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    if (role !== "senior_teacher" || !user || myDepartmentId === undefined) return;
    setLoading(true);

    const own = new Map<string, Assignment>();
    const dept = new Map<string, Assignment>();
    const emit = () => {
      setLiveAssignments([...own.values(), ...dept.values()]);
      setLoading(false);
    };

    const unsubOwn = onSnapshot(
      query(institutionCollection(institutionId, "assignments"), where("teacherId", "==", user.uid)),
      (snap) => {
        own.clear();
        snap.docs.forEach((d) => own.set(d.id, { id: d.id, ...d.data() } as Assignment));
        emit();
      },
      onLoadError("your assignments", () => setLoading(false)),
    );

    // Skipped entirely when myDepartmentId is null (no department set) —
    // an empty/missing departmentId would otherwise match nothing anyway,
    // but running it avoids an unnecessary listener.
    const unsubDept = myDepartmentId
      ? onSnapshot(
          query(
            institutionCollection(institutionId, "assignments"),
            where("departmentId", "==", myDepartmentId),
            where("teacherRole", "==", "regular_teacher"),
          ),
          (snap) => {
            dept.clear();
            snap.docs.forEach((d) => dept.set(d.id, { id: d.id, ...d.data() } as Assignment));
            emit();
          },
          onLoadError("your department's assignments", () => setLoading(false)),
        )
      : null;

    return () => {
      unsubOwn();
      unsubDept?.();
    };
  }, [institutionId, role, user, myDepartmentId]);

  // student — every class they are in (the home class and any additional ones), published only. One
  // listener per class (a rule that compares the class cannot be proven for several at once); the
  // results are merged and kept in due-date order.
  const classIdsKey = classIds.join(",");
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    if (role !== "student" || classIds.length === 0) return;
    setLoading(true);
    const byClass = new Map<string, Assignment[]>();
    let reported = 0;
    const unsubscribes = classIds.map((cid) =>
      onSnapshot(
        query(
          institutionCollection(institutionId, "assignments"),
          where("classId", "==", cid),
          where("status", "==", "published"),
          orderBy("dueDate"),
        ),
        (snap) => {
          if (!byClass.has(cid)) reported += 1;
          byClass.set(cid, snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment)));
          setLiveAssignments([...byClass.values()].flat().sort((x, y) => x.dueDate.localeCompare(y.dueDate)));
          if (reported >= classIds.length) setLoading(false);
        },
        onLoadError("your assignments", () => setLoading(false)),
      ),
    );
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId, role, classIdsKey]);

  // parent — every linked child's class, published only. Assignments are
  // keyed by classId, not studentId, so (unlike Results' own parent query,
  // a direct `studentId in [...]`) each linked child's classId has to be
  // resolved first before the actual assignments query can run.
  const parentUnsubRef = useRef<Unsubscribe | null>(null);
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    if (role !== "parent" || linkedLoading) return;
    if (linkedStudentIds.length === 0) {
      setLiveAssignments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;

    (async () => {
      // Firestore 'in' queries are limited to 10 values — parents with more
      // than 10 linked children will silently miss classes beyond the
      // first 10, same limitation Results' own parent query already has.
      const classIds = new Set<string>();
      const memberships: ClassMembership[] = [];
      await Promise.all(
        linkedStudentIds.slice(0, 10).map(async (sid) => {
          const snap = await getDoc(doc(db, "users", sid));
          const child = { classId: snap.data()?.classId, classIds: snap.data()?.classIds, classSubjects: readClassSubjects(snap.data()?.classSubjects) } as ClassMembership;
          memberships.push(child);
          classIdsOf(child).forEach((cid) => classIds.add(cid));
        }),
      );
      if (cancelled) return;
      setChildMemberships(memberships);
      if (classIds.size === 0) {
        setLiveAssignments([]);
        setLoading(false);
        return;
      }
      parentUnsubRef.current = onSnapshot(
        query(
          institutionCollection(institutionId, "assignments"),
          where("classId", "in", [...classIds].slice(0, 10)),
          where("status", "==", "published"),
        ),
        (snap) => {
          setLiveAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment)));
          setLoading(false);
        },
        onLoadError("your children's assignments", () => setLoading(false)),
      );
    })().catch((err) => {
      if (!cancelled) onLoadError("your children's assignments", () => setLoading(false))(err);
    });

    return () => {
      cancelled = true;
      parentUnsubRef.current?.();
      parentUnsubRef.current = null;
    };
  }, [institutionId, role, linkedStudentIds, linkedLoading]);

  // A student, or a parent through their children, sees an additional class's assignments only for the
  // subjects the student takes there; the rules cover whole classes, so this is done here.
  const takenBySomeone = (a: Assignment): boolean => {
    if (!a.classId || !a.subjectId) return true;
    if (role === "student") return takesSubject({ classId, classIds, classSubjects }, a.classId, a.subjectId);
    if (role === "parent") return childMemberships.some((c) => takesSubject(c, a.classId as string, a.subjectId as string));
    return true;
  };
  const allAssignments: Assignment[] = USE_MOCK
    ? (assignmentsData as unknown as Assignment[])
    : liveAssignments.filter(takenBySomeone);
  const filteredData = filterByInstitution(allAssignments, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Assignment) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
        <Link
          to={`/dashboard/list/assignments/${item.id}`}
          className="font-medium text-sky-700 dark:text-sky-400 hover:underline"
        >
          {item.subjectName}
        </Link>
      </td>
      <td>{item.className}</td>
      <td className="hidden md:table-cell">{item.teacherName}</td>
      <td className="hidden md:table-cell">
        {item.dueDate
          ? new Date(item.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : '—'}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && (
            <FormModal table="assignment" type="update" data={item} />
          )}
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="assignment" type="delete" id={item.id} />
          )}
        </div>
      </td>
    </tr>
  );

  // Phones: one card per assignment instead of the table.
  const canEdit = role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher";
  const canDelete = role === "institution_admin" || role === "super_admin";
  const renderCard = (item: Assignment) => {
    const due = item.dueDate ? new Date(item.dueDate + "T00:00:00") : null;
    const daysLeft = due ? Math.ceil((due.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000) : null;
    const dueTone =
      daysLeft === null
        ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
        : daysLeft < 0
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          : daysLeft <= 3
            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
            : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
    const dueText = due
      ? `${daysLeft !== null && daysLeft < 0 ? "Was due" : "Due"} ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "No due date";
    return (
      <li
        key={item.id}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <Link
            to={`/dashboard/list/assignments/${item.id}`}
            className="min-w-0 text-base font-semibold text-sky-700 dark:text-sky-400 hover:underline wrap-break-word"
          >
            {item.subjectName}
          </Link>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${dueTone}`}>{dueText}</span>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {item.className}
          {item.teacherName ? ` · ${item.teacherName}` : ""}
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-2">
            {canEdit && <FormModal table="assignment" type="update" data={item} />}
            {canDelete && <FormModal table="assignment" type="delete" id={item.id} />}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-md flex-1 m-2 sm:m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {role === "student" || role === "parent" ? "Assignments" : "All Assignments"}
        </h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && <FormModal table="assignment" type="create" />}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} renderCard={renderCard} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default AssignmentListPage;
