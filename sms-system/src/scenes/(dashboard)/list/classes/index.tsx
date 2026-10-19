import { useState, useEffect, useMemo } from "react";
import { subscribeSnapshot } from "@/lib/sharedSnapshot";
import { institutionCollection } from "@/lib/paths";
import { sortByNameNatural } from "@/lib/sortByName";
import ResultCount from "@/components/ResultCount";
import FormModal from "@/components/FormModal";
import ViewDetailsButton from "@/components/ViewDetailsButton";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { classesData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { useClassPopulations } from "@/hooks/useClassPopulations";
import { formatCapacity, isOverCapacity } from "@/lib/classSubjects";
import GenderBreakdown from "@/components/GenderBreakdown";

type Class = {
  id: string;
  name: string;
  institutionId?: string;
  capacity?: number;
  // grade and supervisor stay on the document (ClassForm, class detail, report
  // builder and the student list still use them); the list no longer shows them.
  grade?: number;
  supervisor?: string;
};

const columns = [
  {
    header: "Class Name",
    accessor: "name",
  },
  {
    header: "Population",
    accessor: "population",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const ClassListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveClasses, setLiveClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = subscribeSnapshot(`classes:${institutionId}`,
      institutionCollection(institutionId, "classes"),
      (snap) => {
        setLiveClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class)));
        setLoading(false);
      },
      onLoadError("classes", () => setLoading(false)),
    );
    return unsubscribe;
  }, [institutionId]);

  const allClasses: Class[] = USE_MOCK ? (classesData as unknown as Class[]) : liveClasses;
  // Natural order (1A, 2B, 10A), sorted before the page is sliced so it holds across pages.
  const institutionClasses = useMemo(
    () => filterByInstitution(allClasses, USE_MOCK ? null : institutionId),
    [allClasses, institutionId],
  );
  const filteredData = useMemo(
    () => sortByNameNatural(institutionClasses, (c) => c.name ?? ""),
    [institutionClasses],
  );
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Active students per class, split by gender, for the classes on this page only (six count()
  // aggregations each: no documents or personal data are downloaded).
  const { populations, isError: populationError } = useClassPopulations(
    paginatedData.map((c) => c.id),
  );

  const renderPopulation = (item: Class) => {
    if (USE_MOCK) return item.capacity ?? "—";
    const counts = populations[item.id];
    if (counts === undefined) return populationError ? "—" : "…";
    const over = isOverCapacity(counts.total, item.capacity);
    return (
      <GenderBreakdown counts={counts} note={over ? "Over capacity" : undefined}>
        <span className={over ? "text-red-600 dark:text-red-400 font-medium" : undefined}>
          {formatCapacity(counts.total, item.capacity)}
        </span>
      </GenderBreakdown>
    );
  };

  // The Population column is hidden on a phone, so there the count and its split sit under the name.
  const renderPhoneLine = (item: Class) => {
    const counts = populations[item.id];
    if (USE_MOCK || counts === undefined) return null;
    return (
      <div className="md:hidden mt-1 text-xs text-gray-500 dark:text-gray-400">
        <GenderBreakdown counts={counts} alwaysVisible>
          {formatCapacity(counts.total, item.capacity)}
        </GenderBreakdown>
      </div>
    );
  };

  const renderRow = (item: Class) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
        <div>
          {item.name}
          {renderPhoneLine(item)}
        </div>
      </td>
      <td className="hidden md:table-cell">{renderPopulation(item)}</td>
      <td>
        <div className="flex items-center gap-2">
          {!USE_MOCK && <ViewDetailsButton to={`/dashboard/list/classes/${item.id}`} name={item.name} />}
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="class" type="update" data={item} />
              <FormModal table="class" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="hidden md:block text-lg font-semibold">All Classes</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && <FormModal table="class" type="create" />}
        </div>
        <ResultCount matching={filteredData.length} total={institutionClasses.length} page={page} singular="class" plural="classes" loading={loading} />
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default ClassListPage;
