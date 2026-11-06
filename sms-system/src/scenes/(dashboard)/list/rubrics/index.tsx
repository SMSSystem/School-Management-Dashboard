import { useState, useEffect } from "react";
import { useNextStep } from "nextstepjs";
import FormModal from "@/components/FormModal";
import RubricViewModal from "@/components/forms/RubricViewModal";
import RubricDownloadMenu from "@/components/rubric/RubricDownloadMenu";
import RubricFileActions from "@/components/rubric/RubricFileActions";
import RubricListFilters from "@/components/rubric/RubricListFilters";
import RubricTemplateMenu from "@/components/rubric/RubricTemplateMenu";
import RubricUploadDialog from "@/components/rubric/RubricUploadDialog";
import { useAuth } from "@/lib/AuthContext";
import { ALL } from "@/lib/listFilters";
import { useSidebar } from "@/lib/SidebarContext";
import { filterRubrics } from "@/lib/rubricList";
import { onLoadError } from "@/lib/reportError";
import { institutionCollection } from "@/lib/paths";
import { onSnapshot } from "firebase/firestore";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { PAGE_SIZE } from "@/lib/utils";
import type { RubricDocument } from "@/lib/firebase";
import { rubricTypeLabel } from "@/lib/rubricFileKinds";
import {
  canDeleteRubric,
  canDownloadRubric,
  canUploadRubric,
} from "@/lib/roleCapabilities";

type Rubric = RubricDocument & { id: string };

const columns = [
  { header: "Title", accessor: "title" },
  { header: "Type", accessor: "type", className: "hidden md:table-cell" },
  {
    header: "Criteria",
    accessor: "criteria",
    className: "hidden md:table-cell",
  },
  {
    header: "Description",
    accessor: "description",
    className: "hidden md:table-cell",
  },
  { header: "Actions", accessor: "action" },
];

const criteriaCount = (count: number) => {
  if (count === 0) return "—";
  return `${count} criteri${count === 1 ? "on" : "a"}`;
};

// Reusable rubric library (ASSIGNMENTS_FEATURE_SPEC.md §4.4) — shared across
// assignments, not owned per-assignment or per-teacher, so every
// institution_admin/senior_teacher/regular_teacher sees and can edit the
// same institution-wide list (§7's Role Interaction Matrix). A rubric can also
// hold an uploaded file (RUBRICS_UPLOAD_SPEC.md), which only its uploader or an
// admin may change. Who sees each control is decided in roleCapabilities.ts. The search, the Type filter and the tour work on
// what the page already holds, so they cost no reads (RUBRICS_UPLOAD_SPEC.md items 2.11 and 2.12).
const RubricsListPage = () => {
  const { role, user, institutionId } = useAuth();
  const { startNextStep } = useNextStep();
  const { collapseForTour } = useSidebar();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState(ALL);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      institutionCollection(institutionId, "rubrics"),
      (snap) => {
        setRubrics(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Rubric));
        setLoading(false);
      },
      onLoadError("rubrics", () => setLoading(false)),
    );
    return unsubscribe;
  }, [institutionId]);

  const canAuthor = canUploadRubric(role);
  const canDownload = canDownloadRubric(role);

  const shown = filterRubrics(rubrics, { search, type });
  const paginatedData = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Rubric) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4 font-medium">{item.title}</td>
      <td className="hidden md:table-cell">{rubricTypeLabel(item)}</td>
      <td className="hidden md:table-cell">
        {criteriaCount(item.criteria.length)}
      </td>
      <td className="hidden md:table-cell">{item.description ?? "—"}</td>
      <td>
        <div className="flex flex-wrap items-center gap-2">
          <RubricViewModal rubric={item} />
          {canDownload && <RubricDownloadMenu rubric={item} />}
          {canAuthor && (
            <>
              <FormModal
                table="rubric"
                type="update"
                data={
                  item as unknown as Record<
                    string,
                    string | number | readonly string[] | undefined
                  >
                }
              />
              <RubricFileActions rubric={item} />
              {canDeleteRubric(role, user?.uid, item) && (
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="hidden md:block text-lg font-semibold">All Rubrics</h1>
        <div className="flex flex-wrap items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => {
              collapseForTour();
              startNextStep("rubrics");
            }}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Take a tour
          </button>
          {canAuthor && <RubricTemplateMenu />}
          {canAuthor && <RubricUploadDialog rubrics={rubrics} />}
          {canAuthor && (
            <span id="tour-rubrics-add">
              <FormModal table="rubric" type="create" />
            </span>
          )}
        </div>
      </div>

      <RubricListFilters
        search={search}
        type={type}
        matching={shown.length}
        total={rubrics.length}
        page={page}
        loading={loading}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onType={(value) => {
          setType(value);
          setPage(1);
        }}
      />

      {/* LIST */}
      <div id="tour-rubrics-table">
        <Table
          columns={columns}
          renderRow={renderRow}
          data={paginatedData}
          loading={loading}
        />
      </div>

      {/* PAGINATION */}
      <Pagination
        total={shown.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
};

export default RubricsListPage;
