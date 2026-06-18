import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { announcementsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

type Announcement = {
  id: string;
  title: string;
  class: string;
  date: string;
  institutionId?: string;
};

const columns = [
  {
    header: "Title",
    accessor: "title",
  },
  {
    header: "Class",
    accessor: "class",
  },
  {
    header: "Date",
    accessor: "date",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const AnnouncementListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveAnnouncements, setLiveAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "announcements"), where("institutionId", "==", institutionId)),
      (snap) => {
        setLiveAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  const allAnnouncements: Announcement[] = USE_MOCK ? (announcementsData as unknown as Announcement[]) : liveAnnouncements;
  const filteredData = filterByInstitution(allAnnouncements, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Announcement) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.title}</td>
      <td>{item.class}</td>
      <td className="hidden md:table-cell">{item.date}</td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="announcement" type="update" data={item} />
              <FormModal table="announcement" type="delete" id={item.id} />
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
        <h1 className="hidden md:block text-lg font-semibold">
          All Announcements
        </h1>
        <div className="flex items-center gap-4">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
            <img src="/filter.png" alt="" width={14} height={14} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
            <img src="/sort.png" alt="" width={14} height={14} />
          </button>
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="announcement" type="create" />
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

export default AnnouncementListPage;
