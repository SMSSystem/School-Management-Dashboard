import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { teachersData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { Link } from "react-router-dom";

type Teacher = {
  id: string;
  name: string;
  email?: string;
  photo: string;
  subjects: string[];
  classes: string[];
  institutionId?: string;
  assignedClassId?: string;
};

const columns = [
  {
    header: "Info",
    accessor: "info",
  },
  {
    header: "Subjects",
    accessor: "subjects",
    className: "hidden md:table-cell",
  },
  {
    header: "Classes",
    accessor: "classes",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const TeacherListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveTeachers, setLiveTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  // uid → [subjectName, ...]
  const [teacherSubjects, setTeacherSubjects] = useState<Record<string, string[]>>({});
  // classId → className
  const [classNameById, setClassNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), where("institutionId", "==", institutionId)),
      (snap) => {
        const teachers = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>))
          .filter((u) => u.role === "senior_teacher" || u.role === "regular_teacher")
          .map((u) => ({
            id: u.id as string,
            name: (u.name as string) ?? "—",
            email: u.email as string | undefined,
            photo: "/avatar.png",
            subjects: [],
            classes: [],
            institutionId: u.institutionId as string,
            assignedClassId: u.assignedClassId as string | undefined,
          }));
        setLiveTeachers(teachers);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  // Build teacherId → subject names map from subjects collection
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    return onSnapshot(
      query(collection(db, "subjects"), where("institutionId", "==", institutionId)),
      (snap) => {
        const map: Record<string, string[]> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const name = (data.name as string) ?? "—";
          const ids: string[] = (data.teacherIds as string[]) ?? [];
          ids.forEach((tid) => {
            if (!map[tid]) map[tid] = [];
            map[tid].push(name);
          });
        });
        setTeacherSubjects(map);
      },
    );
  }, [institutionId]);

  // Build classId → class name map from classes collection
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    return onSnapshot(
      query(collection(db, "classes"), where("institutionId", "==", institutionId)),
      (snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => { map[d.id] = (d.data().name as string) ?? d.id; });
        setClassNameById(map);
      },
    );
  }, [institutionId]);

  const allTeachers: Teacher[] = USE_MOCK ? (teachersData as unknown as Teacher[]) : liveTeachers;
  const filteredData = filterByInstitution(allTeachers, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Teacher) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
        <img
          src={item.photo}
          alt=""
          width={40}
          height={40}
          className="md:hidden xl:block w-10 h-10 rounded-full object-cover"
        />
        <div className="flex flex-col">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-gray-500">{item?.email}</p>
        </div>
      </td>
      <td className="hidden md:table-cell">
        {(teacherSubjects[item.id] ?? []).join(", ") || "N/A"}
      </td>
      <td className="hidden md:table-cell">
        {item.assignedClassId
          ? (classNameById[item.assignedClassId] ?? item.assignedClassId)
          : "N/A"}
      </td>
      <td>
        <div className="flex items-center gap-2">
          <Link to={`/list/teachers/${item.id}`}>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--brand-button-bg, #0284c7)' }}
            >
              <img src="/view.png" alt="" width={16} height={16} />
            </button>
          </Link>
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="teacher" type="update" data={item} />
              <FormModal table="teacher" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Teachers</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && (
            <Link to="/create-user">
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--brand-button-bg, #0284c7)' }}
              >
                <img src="/create.png" alt="" width={14} height={14} />
              </button>
            </Link>
          )}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default TeacherListPage;
