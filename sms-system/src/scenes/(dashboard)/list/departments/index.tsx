import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { departmentsData, teachersData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

// Mock-mode lookup — empty in live mode
const mockTeacherNameById = Object.fromEntries(
  teachersData.map((t) => [t.teacherId, t.name])
);

type Department = {
  id: string;
  name: string;
  institutionId: string;
  headTeacherId?: string;
};

const columns = [
  {
    header: "Department Name",
    accessor: "name",
  },
  {
    header: "Head Teacher",
    accessor: "headTeacherId",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];


const DepartmentListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveDepartments, setLiveDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [teacherNameById, setTeacherNameById] = useState<Record<string, string>>(
    USE_MOCK ? mockTeacherNameById : {},
  );

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "departments"), where("institutionId", "==", institutionId)),
      (snap) => {
        setLiveDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Department)));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "in", ["senior_teacher", "regular_teacher"]),
      ),
      (snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          map[d.id] = (data.name as string) ?? d.id;
        });
        setTeacherNameById(map);
      },
    );
  }, [institutionId]);

  const allDepartments: Department[] = USE_MOCK ? (departmentsData as unknown as Department[]) : liveDepartments;
  const filteredData = filterByInstitution(allDepartments, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Department) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.name}</td>
      <td className="hidden md:table-cell">
        {item.headTeacherId ? (teacherNameById[item.headTeacherId] ?? item.headTeacherId) : "—"}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="department" type="update" data={item} />
              <FormModal table="department" type="delete" id={item.id} />
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
        <h1 className="hidden md:block text-lg font-semibold">All Departments</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="department" type="create" />
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

export default DepartmentListPage;
