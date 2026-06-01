import { useState } from "react";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import { termsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, filterBySearch, PAGE_SIZE } from "@/lib/utils";

type Term = {
  id: string;
  name: string;
  institutionId: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "closed";
};

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
  closed: "Closed",
};

const TermListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const filteredData = filterByInstitution(termsData, USE_MOCK ? null : institutionId);
  const searchedData = filterBySearch(filteredData, search, ["name", "status"]);
  const paginatedData = searchedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Term) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.name}</td>
      <td className="hidden md:table-cell">{item.startDate}</td>
      <td className="hidden md:table-cell">{item.endDate}</td>
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
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Terms</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <img src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <img src="/sort.png" alt="" width={14} height={14} />
            </button>
            {(role === "institution_admin" || role === "super_admin") && (
              <FormModal table="term" type="create" />
            )}
          </div>
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} />
      {/* PAGINATION */}
      <Pagination total={searchedData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default TermListPage;
