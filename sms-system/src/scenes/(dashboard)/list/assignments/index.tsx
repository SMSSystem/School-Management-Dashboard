import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { assignmentsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

type Assignment = {
  id: string;
  subject: string;
  class: string;
  teacher: string;
  dueDate: string;
  institutionId?: string;
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
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveAssignments, setLiveAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "assignments"), where("institutionId", "==", institutionId)),
      (snap) => setLiveAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assignment)))
    );
    return unsubscribe;
  }, [institutionId]);

  const allAssignments: Assignment[] = USE_MOCK ? (assignmentsData as unknown as Assignment[]) : liveAssignments;
  const filteredData = filterByInstitution(allAssignments, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Assignment) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.subject}</td>
      <td>{item.class}</td>
      <td className="hidden md:table-cell">{item.teacher}</td>
      <td className="hidden md:table-cell">{item.dueDate}</td>
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

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">
          All Assignments
        </h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && <FormModal table="assignment" type="create" />}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default AssignmentListPage;
