import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { termsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

type Term = {
  id: string;
  name: string;
  institutionId: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "completed";
};

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
}

const columns = [
  {
    header: "Term Name",
    accessor: "name",
  },
  {
    header: "Start Date",
    accessor: "startDate",
    className: "hidden md:table-cell",
  },
  {
    header: "End Date",
    accessor: "endDate",
    className: "hidden md:table-cell",
  },
  {
    header: "Status",
    accessor: "status",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const statusLabel: Record<Term["status"], string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
};

const TermListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveTerms, setLiveTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "terms"), where("institutionId", "==", institutionId)),
      (snap) => {
        setLiveTerms(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Term)));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  const allTerms: Term[] = USE_MOCK ? (termsData as unknown as Term[]) : liveTerms;
  const filteredData = filterByInstitution(allTerms, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Term) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.name}</td>
      <td className="hidden md:table-cell">{formatDate(item.startDate)}</td>
      <td className="hidden md:table-cell">{formatDate(item.endDate)}</td>
      <td className="hidden md:table-cell">{statusLabel[item.status]}</td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="term" type="update" data={item} />
              <FormModal table="term" type="delete" id={item.id} />
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
        <h1 className="hidden md:block text-lg font-semibold">All Terms</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="term" type="create" />
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

export default TermListPage;
