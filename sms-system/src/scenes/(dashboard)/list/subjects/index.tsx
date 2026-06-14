import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, type SubjectDocument } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { subjectsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

type Subject = SubjectDocument & { id: string };

const columns = [
  {
    header: "Subject Name",
    accessor: "name",
  },
  {
    header: "Teachers",
    accessor: "teachers",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const SubjectListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "subjects"), where("institutionId", "==", institutionId)),
      (snap) => setLiveSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    );
    return unsubscribe;
  }, [institutionId]);

  const allSubjects: Subject[] = USE_MOCK ? (subjectsData as unknown as Subject[]) : liveSubjects;
  const filteredData = filterByInstitution(allSubjects, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Subject) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.name}</td>
      <td className="hidden md:table-cell">{(item.teacherNames ?? (item as any).teachers ?? []).join(", ")}</td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="subject" type="update" data={item} />
              <FormModal table="subject" type="delete" id={item.id} />
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
        <h1 className="hidden md:block text-lg font-semibold">All Subjects</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && <FormModal table="subject" type="create" />}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default SubjectListPage;
