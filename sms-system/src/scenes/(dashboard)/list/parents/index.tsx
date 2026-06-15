import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { parentsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { Link } from "react-router-dom";

type Parent = {
  id: string;
  uid: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email?: string;
  students: string[];
  phone: string;
  address: string;
  institutionId?: string;
};

const columns = [
  {
    header: "Info",
    accessor: "info",
  },
  {
    header: "Student Names",
    accessor: "students",
    className: "hidden md:table-cell",
  },
  {
    header: "Phone",
    accessor: "phone",
    className: "hidden lg:table-cell",
  },
  {
    header: "Address",
    accessor: "address",
    className: "hidden lg:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const ParentListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveParents, setLiveParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), where("institutionId", "==", institutionId)),
      (snap) => {
        const parents = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>))
          .filter((u) => u.role === "parent")
          .map((u) => ({
            id: u.id as string,
            uid: u.id as string,
            firstName: u.firstName as string | undefined,
            lastName: u.lastName as string | undefined,
            name: (u.name as string) ?? "—",
            email: u.email as string | undefined,
            students: [],
            phone: (u.phone as string) ?? "—",
            address: (u.address as string) ?? "—",
            institutionId: u.institutionId as string,
          }));
        setLiveParents(parents);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  const allParents: Parent[] = USE_MOCK ? (parentsData as unknown as Parent[]) : liveParents;
  const filteredData = filterByInstitution(allParents, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Parent) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
        <div className="flex flex-col">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-gray-500">{item?.email}</p>
        </div>
      </td>
      <td className="hidden md:table-cell">{item.students.join(",") || "—"}</td>
      <td className="hidden md:table-cell">{item.phone}</td>
      <td className="hidden md:table-cell">{item.address}</td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="parent" type="update" data={item} />
              <FormModal table="parent" type="delete" id={item.id} />
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
        <h1 className="hidden md:block text-lg font-semibold">All Parents</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && (
            <Link to="/create-user">
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
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

export default ParentListPage;
