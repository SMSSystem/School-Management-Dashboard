import { useState, useEffect } from "react";
import FormModal from "@/components/FormModal";
import RubricViewModal from "@/components/forms/RubricViewModal";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";
import { onSnapshot } from "firebase/firestore";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { PAGE_SIZE } from "@/lib/utils";
import type { RubricDocument } from "@/lib/firebase";

type Rubric = RubricDocument & { id: string };

const columns = [
  { header: "Title", accessor: "title" },
  { header: "Criteria", accessor: "criteria", className: "hidden md:table-cell" },
  { header: "Description", accessor: "description", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

// Reusable rubric library (ASSIGNMENTS_FEATURE_SPEC.md §4.4) — shared across
// assignments, not owned per-assignment or per-teacher, so every
// institution_admin/senior_teacher/regular_teacher sees and can edit the
// same institution-wide list (§7's Role Interaction Matrix).
const RubricsListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      institutionCollection(institutionId, "rubrics"),
      (snap) => {
        setRubrics(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Rubric)));
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [institutionId]);

  const canManage =
    role === "institution_admin" ||
    role === "super_admin" ||
    role === "senior_teacher" ||
    role === "regular_teacher";

  const paginatedData = rubrics.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Rubric) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4 font-medium">{item.title}</td>
      <td className="hidden md:table-cell">
        {item.criteria.length} criteri{item.criteria.length === 1 ? "on" : "a"}
      </td>
      <td className="hidden md:table-cell">{item.description ?? "—"}</td>
      <td>
        <div className="flex items-center gap-2">
          <RubricViewModal rubric={item} />
          {canManage && (
            <>
              <FormModal
                table="rubric"
                type="update"
                data={item as unknown as Record<string, string | number | readonly string[] | undefined>}
              />
              {(role === "institution_admin" || role === "super_admin") && (
                <FormModal table="rubric" type="delete" id={item.id} />
              )}
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
        <h1 className="hidden md:block text-lg font-semibold">All Rubrics</h1>
        <div className="flex items-center gap-4">
          {canManage && <FormModal table="rubric" type="create" />}
        </div>
      </div>

      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />

      {/* PAGINATION */}
      <Pagination total={rubrics.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default RubricsListPage;
