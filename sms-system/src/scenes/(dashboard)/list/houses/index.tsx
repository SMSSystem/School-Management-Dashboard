import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { PAGE_SIZE } from "@/lib/utils";
import { USE_MOCK } from "@/lib/data";

type House = {
  id: string;
  name: string;
  description?: string;
  institutionId: string;
};

const columns = [
  { header: "House Name", accessor: "name" },
  { header: "Description", accessor: "description", className: "hidden md:table-cell" },
  { header: "Students", accessor: "students", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

const HousesListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteStudentCount, setDeleteStudentCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "houses"), where("institutionId", "==", institutionId)),
      (snap) => {
        setHouses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as House)));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  // Fetch student counts whenever the house list changes
  useEffect(() => {
    if (!institutionId || houses.length === 0) return;
    const fetchCounts = async () => {
      const entries = await Promise.all(
        houses.map(async (h) => {
          const snap = await getDocs(
            query(
              collection(db, "users"),
              where("institutionId", "==", institutionId),
              where("houseId", "==", h.id)
            )
          );
          return [h.id, snap.size] as [string, number];
        })
      );
      setStudentCounts(Object.fromEntries(entries));
    };
    fetchCounts();
  }, [houses, institutionId]);

  // Fetch students in the target house when delete dialog opens
  useEffect(() => {
    if (!deleteTarget) return;
    setDeleteStudentCount(null);
    getDocs(
      query(collection(db, "users"), where("houseId", "==", deleteTarget.id))
    ).then((snap) => setDeleteStudentCount(snap.size));
  }, [deleteTarget]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Batch-clear houseId/houseName from all students in this house
      const affectedSnap = await getDocs(
        query(collection(db, "users"), where("houseId", "==", deleteTarget.id))
      );
      if (affectedSnap.size > 0) {
        const batch = writeBatch(db);
        affectedSnap.docs.forEach((d) =>
          batch.update(doc(db, "users", d.id), { houseId: null, houseName: null })
        );
        await batch.commit();
      }
      await deleteDoc(doc(db, "houses", deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteError("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const paginatedData = houses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: House) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
          <Link
            to={`/list/houses/${item.id}`}
            className="font-medium text-sky-700 dark:text-sky-400 hover:underline"
          >
            {item.name}
          </Link>
        </td>
      <td className="hidden md:table-cell">{item.description ?? "—"}</td>
      <td className="hidden md:table-cell">{studentCounts[item.id] ?? "—"}</td>
      <td>
        <div className="flex items-center gap-2">
          {role === "institution_admin" && (
            <>
              <FormModal table="house" type="update" data={item} />
              <button
                className="w-7 h-7 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--brand-button-bg, #0284c7)' }}
                onClick={() => setDeleteTarget({ id: item.id, name: item.name })}
              >
                <img src="/delete.png" alt="Delete" width={16} height={16} />
              </button>
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
        <h1 className="hidden md:block text-lg font-semibold">All Houses</h1>
        <div className="flex items-center gap-4">
          {role === "institution_admin" && (
            <FormModal table="house" type="create" />
          )}
        </div>
      </div>

      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />

      {/* PAGINATION */}
      <Pagination total={houses.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {/* DELETE DIALOG */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-sm flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-center">Delete "{deleteTarget.name}"?</h2>

            {deleteStudentCount === null ? (
              <p className="text-sm text-center text-gray-500">Checking assigned students…</p>
            ) : deleteStudentCount > 0 ? (
              <p className="text-sm text-center text-amber-700 dark:text-amber-400">
                {deleteStudentCount} student{deleteStudentCount !== 1 ? "s are" : " is"} currently
                assigned to this house and will be unassigned.
              </p>
            ) : (
              <p className="text-sm text-center text-gray-600 dark:text-gray-300">
                No students are currently assigned to this house.
              </p>
            )}

            {deleteError && (
              <p className="text-sm text-center text-red-500">{deleteError}</p>
            )}

            <div className="flex gap-3 justify-center">
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || deleteStudentCount === null}
                className="bg-red-700 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
                onClick={handleDeleteConfirm}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HousesListPage;
