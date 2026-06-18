import { useState, useEffect, useCallback } from "react";
import { DATA_MODE } from "@/lib/data";
import { institutions } from "./mockData";
import {
  getDocs, collection, query, orderBy, limit, startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, type InstitutionDocument } from "@/lib/firebase";

type TableRow = {
  id: string;
  name: string;
  location: string;
  users: string;
  students: string;
  teachers: string;
  lastActivity: string;
  status: "active" | "suspended";
};

function mockToRow(inst: (typeof institutions)[number]): TableRow {
  return {
    id: String(inst.id),
    name: inst.name,
    location: inst.location,
    users: inst.users.toLocaleString(),
    students: String(inst.students),
    teachers: String(inst.teachers),
    lastActivity: inst.lastActivity,
    status: inst.status,
  };
}

function liveToRow(doc: InstitutionDocument & { id: string }): TableRow {
  return {
    id: doc.id,
    name: doc.name,
    location: doc.location ?? "—",
    users: doc.userCount?.toLocaleString() ?? "—",
    students: doc.studentCount?.toString() ?? "—",
    teachers: doc.teacherCount?.toString() ?? "—",
    lastActivity: doc.lastActiveAt ?? "—",
    status: doc.status,
  };
}

const PAGE_SIZE = 25;

const InstitutionsTable = () => {
  const [rows, setRows] = useState<TableRow[]>(
    DATA_MODE === "mock" ? institutions.map(mockToRow) : []
  );
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  // Live-mode cursor-based pagination
  const [prevCursors, setPrevCursors] = useState<(QueryDocumentSnapshot | null)[]>([]);
  const [currentCursor, setCurrentCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(async (cursor: QueryDocumentSnapshot | null) => {
    setLoading(true);
    try {
      const q = cursor
        ? query(collection(db, "institutions"), orderBy("name"), startAfter(cursor), limit(PAGE_SIZE))
        : query(collection(db, "institutions"), orderBy("name"), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      setRows(snap.docs.map((d) =>
        liveToRow({ id: d.id, ...(d.data() as InstitutionDocument) })
      ));
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch {
      // rows stays [] on error; empty state message handles it
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (DATA_MODE !== "live") return;
    fetchPage(null);
  }, [fetchPage]);

  function goNext() {
    if (!lastDoc || !hasMore) return;
    setPrevCursors((prev) => [...prev, currentCursor]);
    setCurrentCursor(lastDoc);
    fetchPage(lastDoc);
  }

  function goPrev() {
    if (prevCursors.length === 0) return;
    const stack = [...prevCursors];
    const prevCursor = stack.pop() ?? null;
    setPrevCursors(stack);
    setCurrentCursor(prevCursor);
    fetchPage(prevCursor);
  }

  function handleFilterChange(value: "all" | "active" | "suspended") {
    setStatusFilter(value);
    if (DATA_MODE === "live") {
      setPrevCursors([]);
      setCurrentCursor(null);
      fetchPage(null);
    }
  }

  const filtered = rows.filter((inst) => statusFilter === "all" || inst.status === statusFilter);
  const pageNumber = prevCursors.length + 1;
  const isLive = DATA_MODE === "live";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold shrink-0">Institutions</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange(e.target.value as typeof statusFilter)}
            className="text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-lamaSky"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div className="overflow-y-auto overflow-x-auto flex-1 min-h-0 pr-4">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
            <tr className="text-left text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
              <th className="pb-2 pr-3 font-medium whitespace-nowrap">Institution</th>
              <th className="pb-2 pr-3 font-medium whitespace-nowrap">Users</th>
              <th className="pb-2 pr-3 font-medium whitespace-nowrap hidden md:table-cell">Students</th>
              <th className="pb-2 pr-3 font-medium whitespace-nowrap hidden lg:table-cell">Teachers</th>
              <th className="pb-2 pr-3 font-medium whitespace-nowrap hidden md:table-cell">Last Active</th>
              <th className="pb-2 pr-3 font-medium whitespace-nowrap">Status</th>
              <th className="pb-2 font-medium whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  {rows.length === 0
                    ? DATA_MODE === "blank"
                      ? "No data — switch to Mock Data or Live Data mode to preview."
                      : "No institutions found."
                    : "No institutions match the selected filter."}
                </td>
              </tr>
            ) : (
              filtered.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-lamaSkyLight dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-sky-600 dark:text-sky-400 shrink-0">
                        {inst.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-100 leading-tight">{inst.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{inst.location}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 font-semibold text-gray-700 dark:text-gray-200">{inst.users}</td>
                  <td className="py-3 pr-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{inst.students}</td>
                  <td className="py-3 pr-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell">{inst.teachers}</td>
                  <td className="py-3 pr-3 text-gray-400 dark:text-gray-500 hidden md:table-cell text-xs">{inst.lastActivity}</td>
                  <td className="py-3 pr-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        inst.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {inst.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`View ${inst.name}`}
                        className="text-xs px-2 py-1 rounded-md bg-lamaSkyLight dark:bg-gray-700 text-sky-700 dark:text-sky-400 hover:opacity-80 transition-opacity font-medium"
                      >
                        View
                      </button>
                      <button
                        aria-label={`${inst.status === "active" ? "Suspend" : "Activate"} ${inst.name}`}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition-opacity hover:opacity-80 ${
                          inst.status === "active"
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                            : "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                        }`}
                      >
                        {inst.status === "active" ? "Suspend" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-2 flex items-center justify-between">
        {isLive ? (
          <>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Page {pageNumber}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                disabled={prevCursors.length === 0 || loading}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={goNext}
                disabled={!hasMore || loading}
                className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Next →
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Showing {filtered.length} of {rows.length} institutions
          </p>
        )}
      </div>
    </div>
  );
};

export default InstitutionsTable;
