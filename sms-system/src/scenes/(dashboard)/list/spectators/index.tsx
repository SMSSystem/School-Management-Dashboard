import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import AccountStatusToggle from "@/components/AccountStatusToggle";
import SessionResetButton from "@/components/SessionResetButton";
import InactiveBadge from "@/components/InactiveBadge";
import Pagination from "@/components/Pagination";
import ResultCount from "@/components/ResultCount";
import Table from "@/components/Table";
import type { CreateUserLocationState } from "@/components/forms/AdminCreateUserForm";
import { useAuth } from "@/lib/AuthContext";
import { useSpectators, type SpectatorRow } from "@/hooks/useSpectators";
import { PAGE_SIZE } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/phone";

// The read-only role's accounts (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md,
// Phase 5). An institution admin manages their own institution's spectators; a
// super admin sees every institution's, with an Institution column. The only
// actions are the ones that already exist for every other account: deactivate
// or reactivate, clear a stuck sign-in session, and (institution admin) email a first-login link.
// There is no edit form yet.

const baseColumns = [
  { header: "Name", accessor: "info" },
  { header: "Phone", accessor: "phone", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];
const institutionColumn = { header: "Institution", accessor: "institutionName", className: "hidden md:table-cell" };

const SpectatorListPage = () => {
  const { role } = useAuth();
  const isSuper = role === "super_admin";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { spectators, loading } = useSpectators();

  const columns = isSuper ? [baseColumns[0], institutionColumn, ...baseColumns.slice(1)] : baseColumns;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? spectators.filter((s) => s.name.toLowerCase().includes(q)) : spectators;
  }, [spectators, search]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: SpectatorRow) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
        <div className="flex flex-col">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-gray-500">{item.email}</p>
          <InactiveBadge status={item.status} />
        </div>
      </td>
      {isSuper && <td className="hidden md:table-cell">{item.institutionName || "—"}</td>}
      <td className="hidden lg:table-cell">{formatPhoneForDisplay(item.phone)}</td>
      <td>
        <div className="flex items-center gap-2">
          <AccountStatusToggle uid={item.id} name={item.name} status={item.status} institutionId={item.institutionId} />
          <SessionResetButton uid={item.id} name={item.name} institutionId={item.institutionId} />
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="hidden md:block text-lg font-semibold">All Spectators</h1>
        <input
          type="text"
          autoComplete="off"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name…"
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 flex-1 min-w-40 max-w-xs"
        />
        <div className="flex items-center gap-4">
          <Link to="/dashboard/create-user" state={{ initialRole: "spectator" } satisfies CreateUserLocationState}>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
              title="Add new spectator"
              aria-label="Add new spectator"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          </Link>
        </div>
        <ResultCount matching={filtered.length} total={spectators.length} page={page} singular="spectator" plural="spectators" loading={loading} />
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        A spectator can view everything an administrator can, including personal details, but cannot change anything.
      </p>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginated} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default SpectatorListPage;
