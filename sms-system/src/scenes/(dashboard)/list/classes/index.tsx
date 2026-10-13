import { useState, useEffect, useMemo } from "react";
import { onSnapshot } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import { sortByNameNatural } from "@/lib/sortByName";
import ResultCount from "@/components/ResultCount";
import FormModal from "@/components/FormModal";
import ViewDetailsButton from "@/components/ViewDetailsButton";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { classesData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { useClassPopulations } from "@/hooks/useClassPopulations";
import { formatCapacity, isOverCapacity } from "@/lib/classSubjects";

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
    const unsubscribe = onSnapshot(
      institutionCollection(institutionId, "classes"),
      (snap) => {
        setLiveClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class)));
        setLoading(false);
      }
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

  // Active students per class, for the classes on this page only (two count()
  // aggregations each: no documents or personal data are downloaded).
  const { populations, isError: populationError } = useClassPopulations(
    paginatedData.map((c) => c.id),
  );

  const renderPopulation = (item: Class) => {
    if (USE_MOCK) return item.capacity ?? "—";
    const population = populations[item.id];
    if (population === undefined) return populationError ? "—" : "…";
    return (
      <span
        className={isOverCapacity(population, item.capacity) ? "text-red-600 dark:text-red-400 font-medium" : undefined}
        title={isOverCapacity(population, item.capacity) ? "Over capacity" : undefined}
      >
        {formatCapacity(population, item.capacity)}
      </span>
    );
  };

  const renderRow = (item: Class) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.name}</td>
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
