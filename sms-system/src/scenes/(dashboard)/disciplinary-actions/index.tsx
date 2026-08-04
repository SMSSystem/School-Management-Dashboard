import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  db,
  DISCIPLINARY_ACTION_LABELS,
  type DisciplinaryActionDocument,
  type DisciplinaryActionType,
} from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import FormModal from "@/components/FormModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { PAGE_SIZE } from "@/lib/utils";
import { institutionCollection } from "@/lib/paths";

type ActionRow = DisciplinaryActionDocument & { id: string };

const STAFF_ROLES = new Set([
  "institution_admin",
  "super_admin",
  "senior_teacher",
  "regular_teacher",
]);

const TYPE_FILTERS: Array<DisciplinaryActionType | "all"> = [
  "all",
  "merit",
  "demerit",
  "detention",
  "suspension",
];

const TYPE_BADGE_CLS: Record<DisciplinaryActionType, string> = {
  merit: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  demerit:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  detention:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  suspension: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function TypeBadge({ type }: { type: DisciplinaryActionType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_CLS[type]}`}
    >
      {DISCIPLINARY_ACTION_LABELS[type]}
    </span>
  );
}

function formatDate(iso: string) {
  return iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}

const staffColumns = [
  { header: "Student", accessor: "studentName" },
  { header: "Type", accessor: "type" },
  { header: "Reason", accessor: "reason", className: "hidden md:table-cell" },
  { header: "Date", accessor: "date", className: "hidden md:table-cell" },
  { header: "Term", accessor: "termName", className: "hidden md:table-cell" },
  {
    header: "Issued By",
    accessor: "issuedByName",
    className: "hidden md:table-cell",
  },
  { header: "Actions", accessor: "action" },
];

const readOnlyColumns = staffColumns.filter((c) => c.accessor !== "action");

const DisciplinaryActionsPage = () => {
  const { user, role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<DisciplinaryActionType | "all">(
    "all",
  );
  const [linkedStudentIds, setLinkedStudentIds] = useState<string[]>([]);

  const isStaff = role !== null && STAFF_ROLES.has(role);
  const isAdmin = role === "institution_admin" || role === "super_admin";

  // Resolve linked children for parent role
  useEffect(() => {
    if (role !== "parent" || !user) return;
    getDocs(
      query(
        collection(db, "student_parents"),
        where("parentId", "==", user.uid),
      ),
    ).then((snap) =>
      setLinkedStudentIds(
        snap.docs.map((d) => d.id.replace(`${user.uid}_`, "")),
      ),
    );
  }, [role, user]);

  // Subscribe to disciplinaryActions, role-scoped
  useEffect(() => {
    if (!institutionId || institutionId === "*") return;

    let q;
    if (role === "student" && user?.uid) {
      q = query(
        institutionCollection(institutionId, "disciplinaryActions"),
        where("studentId", "==", user.uid),
      );
    } else if (role === "parent") {
      if (linkedStudentIds.length === 0) {
        setActions([]);
        setLoading(false);
        return;
      }
      // Firestore 'in' queries are limited to 10 values. Parents with more than
      // 10 linked children will silently miss records beyond the first 10
      // (same known limitation as report-cards/index.tsx).
      q = query(
        institutionCollection(institutionId, "disciplinaryActions"),
        where("studentId", "in", linkedStudentIds.slice(0, 10)),
      );
    } else if (isStaff) {
      q = query(institutionCollection(institutionId, "disciplinaryActions"));
    } else {
      setActions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(q, (snap) => {
      setActions(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ActionRow),
      );
      setLoading(false);
    });
    return unsubscribe;
  }, [institutionId, role, user, isStaff, linkedStudentIds]);

  const filteredData = useMemo(() => {
    let data = actions;
    if (isStaff) {
      if (typeFilter !== "all")
        data = data.filter((a) => a.type === typeFilter);
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        data = data.filter((a) => a.studentName.toLowerCase().includes(q));
      }
    }
    return [...data].sort((a, b) => b.date.localeCompare(a.date));
  }, [actions, isStaff, typeFilter, search]);

  const paginatedData = filteredData.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const renderRow = (item: ActionRow) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.studentName}</td>
      <td>
        <TypeBadge type={item.type} />
      </td>
      <td
        className="hidden md:table-cell max-w-xs truncate"
        title={item.reason}
      >
        {item.reason}
      </td>
      <td className="hidden md:table-cell">{formatDate(item.date)}</td>
      <td className="hidden md:table-cell">{item.termName}</td>
      <td className="hidden md:table-cell">{item.issuedByName}</td>
      {isStaff && (
        <td>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <FormModal
                table="disciplinary_action"
                type="update"
                data={
                  item as unknown as Record<
                    string,
                    string | number | readonly string[] | undefined
                  >
                }
              />
              <FormModal
                table="disciplinary_action"
                type="delete"
                id={item.id}
              />
            </div>
          )}
        </td>
      )}
    </tr>
  );

  if (institutionId === "*") {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
        <h1 className="text-lg font-semibold mb-4">Disciplinary Actions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select an institution to view disciplinary records.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="hidden md:block text-lg font-semibold">
          Disciplinary Actions
        </h1>
        <div className="flex items-center gap-4">
          {isStaff && <FormModal table="disciplinary_action" type="create" />}
        </div>
      </div>

      {/* FILTERS (staff only) */}
      {isStaff && (
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name…"
            className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 flex-1 min-w-50"
          />
          <div className="flex gap-2 flex-wrap">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  typeFilter === t
                    ? "bg-sky-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {t === "all" ? "All" : DISCIPLINARY_ACTION_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LIST */}
      <Table
        columns={isStaff ? staffColumns : readOnlyColumns}
        renderRow={renderRow}
        data={paginatedData}
        loading={loading}
      />
      {/* PAGINATION */}
      <Pagination
        total={filteredData.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
};

export default DisciplinaryActionsPage;
